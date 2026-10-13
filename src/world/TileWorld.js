// Renders an exploration tile map and answers collision queries.
//
//   floor   one big canvas texture (32 texels per tile, NearestFilter, no mipmaps) painted from the
//           district tile sprites (floor_<d>, floor_alt_<d>, water) when the manifest has them, or from
//           procedural pixel textures built from the district `look` colours. Wall contact shadows,
//           shorelines and scattered decals are painted on top so the repetition breaks up.
//   walls   one InstancedMesh of boxes (room walls tall, rubble blocks low); top = wall_<d> texture.
//   canopy  unused grid cells and the area outside the map are a flat jungle canopy at wall height.
//
// Collision: solidAt / opaqueAt / flagAt work on a copy of the generator's flag grid, so brambles and
// props can be cleared at runtime (setFlags / clearFlags).

import * as THREE from 'three';
import { TILE, FLAG } from './ExploreGen.js';
import { makeRng } from '../core/rng.js';

const TS = 32;               // texels per tile
const WALL_H = 1.15;
const BLOCK_H = 0.7;

export class TileWorld {
  constructor(game, three, map, look, districtKey) {
    this.game = game;
    this.three = three;
    this.map = map;
    this.look = look;
    this.district = districtKey;
    this.w = map.w;
    this.h = map.h;
    this.tiles = map.tiles;
    this.flags = new Uint8Array(map.flags);
    this.disposables = [];
    this.waterT = 0;
    this.waterFrame = 0;
    this.rng = makeRng(map.w * 977 + map.h * 131 + (map.attempt || 0));
    this._buildTextures();
    this._buildFloor();
    this._buildWalls();
    this._buildCanopy();
  }

  // ---------------------------------------------------------------- queries

  inside(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  flagAt(tx, ty) { return this.inside(tx, ty) ? this.flags[tx + ty * this.w] : FLAG.SOLID | FLAG.OPAQUE; }
  solidAt(tx, ty) { return (this.flagAt(tx, ty) & FLAG.SOLID) !== 0; }
  opaqueAt(tx, ty) { return (this.flagAt(tx, ty) & FLAG.OPAQUE) !== 0; }
  tileAt(tx, ty) { return this.inside(tx, ty) ? this.tiles[tx + ty * this.w] : TILE.VOID; }
  isWater(tx, ty) { return this.tileAt(tx, ty) === TILE.WATER; }
  setFlags(tx, ty, f) { if (this.inside(tx, ty)) this.flags[tx + ty * this.w] |= f; }
  clearFlags(tx, ty, f) { if (this.inside(tx, ty)) this.flags[tx + ty * this.w] &= ~f; }
  /** Walkable for enemies/pathing (brambles and props block). */
  walkable(tx, ty) { return !this.solidAt(tx, ty); }

  // ---------------------------------------------------------------- textures

  _sprite(key) {
    const info = this.game.assets.spriteInfo(key);
    if (!info || !info.tex?.image) return null;
    // resolveKey falls back from "floor_alt_x" to nothing else, but guard against base-key fallbacks.
    return info;
  }

  /** Canvas(es) for a tile kind: returns an array of 32×32 variants (frames for water). */
  _tileVariants(kind) {
    const d = this.district, L = this.look;
    const key = { floor: `floor_${d}`, alt: `floor_alt_${d}`, wall: `wall_${d}`, water: 'water' }[kind];
    const info = key && this.game.assets.manifest[key] ? this._sprite(key) : null;
    if (info) {
      const img = info.tex.image;
      const frames = info.def.frames || Math.max(1, Math.round(img.width / img.height));
      const out = [];
      for (let f = 0; f < frames; f++) {
        const c = canvas(TS, TS);
        c.getContext('2d').drawImage(img, f * (img.width / frames), 0, img.width / frames, img.height, 0, 0, TS, TS);
        out.push(c);
      }
      return out;
    }
    const pat = { floor: L.pattern, alt: L.altPattern, wall: L.wallPattern, water: 'water' }[kind];
    const base = { floor: L.floor, alt: L.floorAlt, wall: L.wall, water: '#124e89' }[kind];
    const n = kind === 'water' ? 2 : 4;
    const out = [];
    for (let v = 0; v < n; v++) out.push(paintPattern(pat || 'concrete', base, L, v, kind === 'water' ? v : 0));
    return out;
  }

  _buildTextures() {
    this.tex = {
      floor: this._tileVariants('floor'),
      alt: this._tileVariants('alt'),
      wall: this._tileVariants('wall'),
      water: this._tileVariants('water'),
    };
  }

  // ---------------------------------------------------------------- floor

  _buildFloor() {
    const { w, h } = this;
    const c = canvas(w * TS, h * TS);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    this.floorCanvas = c;
    this.floorCtx = g;
    const rng = this.rng;
    this.waterTiles = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = this.tiles[x + y * w];
        if (t === TILE.VOID) continue;
        let set = this.tex.floor;
        if (t === TILE.ALT) set = this.tex.alt;
        else if (t === TILE.WATER) { this.waterTiles.push([x, y]); continue; }
        else if (t === TILE.WALL) set = this.tex.wall;
        // Hash pick so neighbouring tiles rarely repeat the same variant.
        g.drawImage(set[(x * 7 + y * 13 + (x * y) % 5) % set.length], x * TS, y * TS);
      }
    }
    this._drawWater(0);
    this._paintDetails(g, rng);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.floorTex = tex;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(w / 2, 0, h / 2);
    this.three.add(mesh);
    this.floorMesh = mesh;
    this.disposables.push(geo, mat, tex);
  }

  _drawWater(frame) {
    const g = this.floorCtx;
    const set = this.tex.water;
    const f = set[frame % set.length];
    for (const [x, y] of this.waterTiles) {
      g.drawImage(f, x * TS, y * TS);
      // Shoreline: a light lip where water meets land, darker water just below it.
      const land = (dx, dy) => { const t = this.tileAt(x + dx, y + dy); return t !== TILE.WATER; };
      g.fillStyle = 'rgba(234,212,170,0.35)';
      if (land(0, -1)) g.fillRect(x * TS, y * TS, TS, 2);
      if (land(-1, 0)) g.fillRect(x * TS, y * TS, 2, TS);
      if (land(1, 0)) g.fillRect(x * TS + TS - 2, y * TS, 2, TS);
      if (land(0, 1)) g.fillRect(x * TS, y * TS + TS - 2, TS, 2);
      g.fillStyle = 'rgba(24,20,37,0.35)';
      if (land(0, -1)) g.fillRect(x * TS, y * TS + 2, TS, 3);
    }
  }

  /** Contact shadows under walls, cracks, leaves and grime so the floor never looks tiled. */
  _paintDetails(g, rng) {
    const { w, h } = this;
    const solidWall = (x, y) => { const t = this.tileAt(x, y); return t === TILE.WALL || t === TILE.BLOCK || t === TILE.VOID; };
    const moss = this.look.moss || '#3e8948';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = this.tiles[x + y * w];
        if (t !== TILE.FLOOR && t !== TILE.ALT) continue;
        const px = x * TS, py = y * TS;
        // Contact shadow: the light comes from the top-left, so walls above/left cast onto this tile.
        g.fillStyle = 'rgba(16,12,28,0.42)';
        if (solidWall(x, y - 1)) { g.fillRect(px, py, TS, 5); g.fillStyle = 'rgba(16,12,28,0.2)'; g.fillRect(px, py + 5, TS, 3); g.fillStyle = 'rgba(16,12,28,0.42)'; }
        if (solidWall(x - 1, y)) g.fillRect(px, py, 4, TS);
        g.fillStyle = 'rgba(16,12,28,0.22)';
        if (solidWall(x + 1, y)) g.fillRect(px + TS - 2, py, 2, TS);
        if (solidWall(x, y + 1)) g.fillRect(px, py + TS - 2, TS, 2);
        // Moss creeping out from wall bases.
        if ((solidWall(x, y - 1) || solidWall(x - 1, y)) && rng.chance(0.35)) {
          g.fillStyle = moss;
          for (let k = 0; k < 14; k++) {
            const ox = solidWall(x - 1, y) ? rng.int(0, 5) : rng.int(0, TS - 2);
            const oy = solidWall(x, y - 1) ? rng.int(0, 6) : rng.int(0, TS - 2);
            g.fillRect(px + ox, py + oy, rng.chance(0.3) ? 2 : 1, 1);
          }
        }
        // Scattered decals.
        const r = rng.next();
        if (r < 0.06) crack(g, rng, px, py);
        else if (r < 0.11) leaves(g, rng, px, py, moss);
        else if (r < 0.14) { g.fillStyle = 'rgba(24,20,37,0.18)'; blob(g, rng, px + rng.int(6, 26), py + rng.int(6, 26), rng.int(4, 8)); }
      }
    }
  }

  // ---------------------------------------------------------------- walls

  _buildWalls() {
    const list = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const t = this.tiles[x + y * this.w];
      if (t === TILE.WALL || t === TILE.BLOCK) list.push([x, y, t]);
    }
    const topTex = texFromCanvases(this.tex.wall);
    const sideTex = texFromCanvases(this.tex.wall.map((c) => wallSide(c, this.look)));
    const top = new THREE.MeshLambertMaterial({ map: topTex });
    const side = new THREE.MeshLambertMaterial({ map: sideTex });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    // Box face order: +x, -x, +y, -y, +z, -z.
    const mesh = new THREE.InstancedMesh(geo, [side, side, top, side, side, side], Math.max(1, list.length));
    mesh.count = list.length;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    list.forEach(([x, y, t], i) => {
      const hgt = t === TILE.WALL ? WALL_H : BLOCK_H;
      m.compose(p.set(x + 0.5, 0, y + 0.5), q, s.set(1, hgt, 1));
      mesh.setMatrixAt(i, m);
      const v = 0.86 + this.rng.next() * 0.2;
      mesh.setColorAt(i, col.setRGB(v, v, v * (0.97 + this.rng.next() * 0.06)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.three.add(mesh);
    this.wallMesh = mesh;
    this.disposables.push(geo, top, side, topTex, sideTex);
  }

  // ---------------------------------------------------------------- canopy

  _buildCanopy() {
    const pad = 24;
    const quads = [];
    // Unused cells / buried walls, merged per row into runs.
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        if (this.tiles[x + y * this.w] !== TILE.VOID) { x++; continue; }
        const x0 = x;
        while (x < this.w && this.tiles[x + y * this.w] === TILE.VOID) x++;
        quads.push([x0, y, x, y + 1]);
      }
    }
    quads.push([-pad, -pad, this.w + pad, 0], [-pad, this.h, this.w + pad, this.h + pad], [-pad, 0, 0, this.h], [this.w, 0, this.w + pad, this.h]);
    const pos = [], uv = [], idx = [];
    const y = WALL_H;
    for (const [x0, z0, x1, z1] of quads) {
      const b = pos.length / 3;
      pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      uv.push(x0 / 2, -z0 / 2, x1 / 2, -z0 / 2, x1 / 2, -z1 / 2, x0 / 2, -z1 / 2);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = new THREE.CanvasTexture(paintCanopy(this.look));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    this.three.add(mesh);
    this.disposables.push(geo, mat, tex);
  }

  // ---------------------------------------------------------------- per frame

  update(dt) {
    if (!this.waterTiles.length || this.tex.water.length < 2) return;
    this.waterT += dt;
    if (this.waterT >= 0.5) {
      this.waterT = 0;
      this.waterFrame = (this.waterFrame + 1) % this.tex.water.length;
      this._drawWater(this.waterFrame);
      this.floorTex.needsUpdate = true;
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.wallMesh?.dispose();
    this.disposables = [];
  }
}

// ==================================================================== procedural pixel textures

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function texFromCanvases(list) {
  // Variants side by side would need per-instance UVs; one variant is enough for wall faces.
  const tex = new THREE.CanvasTexture(list[0]);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Hue-shifted shade: k > 0 lightens toward warm, k < 0 darkens toward cool purple (pixel-art ramps). */
function shade(rgb, k) {
  const [r, g, b] = rgb;
  if (k >= 0) return [r + (255 - r) * k * 0.9 + 6 * k, g + (245 - g) * k * 0.85, b + (200 - b) * k * 0.6].map((v) => clamp255(v));
  const d = -k;
  return [r * (1 - d) + 24 * d, g * (1 - d) + 20 * d, b * (1 - d) + 40 * d].map((v) => clamp255(v));
}
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** Small deterministic hash noise in [0,1). */
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Paint one 32×32 tile of a pattern. Returns a canvas. */
function paintPattern(pattern, baseHex, look, variant, frame) {
  const c = canvas(TS, TS);
  const g = c.getContext('2d');
  const img = g.createImageData(TS, TS);
  const base = hexRgb(baseHex);
  const moss = hexRgb(look.moss || '#3e8948');
  const s = variant * 97 + 13;
  const px = (x, y, rgb) => {
    const i = (y * TS + x) * 4;
    img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
  };
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      const n = hash(x, y, s);
      let k = (n - 0.5) * 0.12;
      let col = null;
      switch (pattern) {
        case 'paving': {
          // 16×16 slabs offset per row, with darker mortar and per-slab tone.
          const row = Math.floor(y / 16), off = row % 2 ? 8 : 0;
          const sx = Math.floor((x + off) / 16);
          const lx = (x + off) % 16, ly = y % 16;
          k += (hash(sx, row, s + 1) - 0.5) * 0.18;
          if (lx === 0 || ly === 0) { k = -0.42; if (hash(x, y, s + 9) < 0.18) col = shade(moss, 0); }
          else if (lx === 1 || ly === 1) k += 0.12;
          else if (lx === 15 || ly === 15) k -= 0.12;
          break;
        }
        case 'tiles': {
          const lx = x % 8, ly = y % 8;
          k += (hash(Math.floor(x / 8), Math.floor(y / 8), s + 2) - 0.5) * 0.16;
          if (lx === 0 || ly === 0) k = -0.35;
          else if (lx === 1 && ly > 0) k += 0.1;
          if (hash(Math.floor(x / 8), Math.floor(y / 8), s + 5) < 0.08 && lx > 1 && ly > 1) k -= 0.25; // missing tile
          break;
        }
        case 'grass': case 'leaves': {
          const blade = hash(x, Math.floor(y / 3), s + 3);
          k = (n - 0.5) * 0.25 + (blade < 0.2 ? 0.22 : blade > 0.85 ? -0.2 : 0);
          if (pattern === 'leaves' && hash(Math.floor(x / 3), Math.floor(y / 3), s + 8) < 0.15) k += 0.3;
          if (hash(x, y, s + 4) < 0.006) col = [254, 231, 97];
          break;
        }
        case 'boards': {
          // Floorboards running horizontally, staggered joints, nail dots.
          const row = Math.floor(y / 8), ly = y % 8;
          const joint = (x + row * 11 + s) % 24;
          k += (hash(row, Math.floor((x + row * 11) / 24), s) - 0.5) * 0.2;
          if (ly === 0) k = -0.45;
          else if (ly === 1) k += 0.1;
          else if (joint === 0) k = -0.35;
          else if ((joint === 2 || joint === 21) && (ly === 2 || ly === 6)) k = -0.3;
          k += (hash(x >> 2, y, s + 6) - 0.5) * 0.08;   // grain
          break;
        }
        case 'panels': {
          const lx = x % 16, ly = y % 16;
          if (lx === 0 || ly === 0) k = -0.4;
          else if (lx === 1 || ly === 1) k += 0.16;
          else if (lx === 15 || ly === 15) k -= 0.14;
          if ((lx === 3 || lx === 13) && (ly === 3 || ly === 13)) k = -0.3;
          if (variant === 1 && Math.floor(x / 16) === 1 && Math.floor(y / 16) === 0 && lx > 3 && lx < 13 && ly > 4 && ly < 12) k = ly % 2 ? -0.38 : -0.1; // vent
          break;
        }
        case 'grate': {
          k = (x % 4 === 0 || y % 4 === 0) ? 0.08 : -0.35;
          if (x % 16 === 0 || y % 16 === 0) k = 0.18;
          break;
        }
        case 'moss': {
          const big = hash(Math.floor(x / 4), Math.floor(y / 4), s + 7);
          k += big < 0.3 ? -0.15 : big > 0.8 ? 0.15 : 0;
          if (hash(x, y, s + 4) < 0.01) col = [254, 231, 97];
          break;
        }
        case 'puddle': {
          const r = Math.hypot(x - 15.5, y - 15.5) + (hash(x >> 2, y >> 2, s) - 0.5) * 6;
          k = r > 13 ? -0.1 : r > 11 ? 0.05 : (n - 0.5) * 0.08 - 0.05;
          if (r < 10 && hash(x, y, s + 3) < 0.03) k = 0.4;
          break;
        }
        case 'concrete': {
          k += (hash(x >> 2, y >> 2, s + 1) - 0.5) * 0.12;
          if (hash(x, y, s + 2) < 0.05) k -= 0.18;
          break;
        }
        case 'brick': {
          const row = Math.floor(y / 6), off = row % 2 ? 6 : 0;
          const lx = (x + off) % 12, ly = y % 6;
          k += (hash(Math.floor((x + off) / 12), row, s) - 0.5) * 0.22;
          if (ly === 0 || lx === 0) k = -0.4;
          else if (ly === 1) k += 0.12;
          break;
        }
        case 'panel': {
          const lx = x % 16;
          if (lx === 0) k = -0.45;
          else if (lx === 1) k += 0.15;
          if (y % 8 === 0) k -= 0.2;
          if (lx > 3 && lx < 6 && y % 8 === 4) col = hash(x, y, s) < 0.5 ? [44, 232, 245] : [99, 199, 77];
          break;
        }
        case 'water': {
          const wave = Math.sin((x + frame * 3) * 0.55 + Math.floor(y / 4) * 1.7) > 0.82 && y % 4 === 1;
          k = (n - 0.5) * 0.08 + (wave ? 0.45 : 0) - (y % 8 === 6 ? 0.06 : 0);
          break;
        }
        default:
          k += (hash(x >> 1, y >> 1, s) - 0.5) * 0.1;
      }
      px(x, y, col || shade(base, k));
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Wall face texture: the top texture darkened toward the base, with a lit lip and moss drips. */
function wallSide(topCanvas, look) {
  const c = canvas(TS, TS);
  const g = c.getContext('2d');
  g.drawImage(topCanvas, 0, 0);
  g.fillStyle = 'rgba(24,20,37,0.35)';
  g.fillRect(0, 0, TS, TS);
  const grad = [0.0, 0.05, 0.1, 0.18, 0.28, 0.4];
  for (let i = 0; i < grad.length; i++) { g.fillStyle = `rgba(16,12,28,${grad[i]})`; g.fillRect(0, TS - 12 + i * 2, TS, 2); }
  g.fillStyle = 'rgba(234,212,170,0.25)';
  g.fillRect(0, 0, TS, 2);
  g.fillStyle = look.moss || '#3e8948';
  for (let x = 0; x < TS; x++) {
    if (hash(x, 1, 41) < 0.35) {
      const len = 1 + Math.floor(hash(x, 2, 43) * 7);
      g.fillRect(x, 2, 1, len);
    }
  }
  return c;
}

function paintCanopy(look) {
  const S = 64;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const base = hexRgb(look.canopy || '#265c42');
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Overlapping leaf clumps: brighter on their top-left, darker gaps between.
      const cx = Math.floor(x / 8), cy = Math.floor(y / 8);
      let k = -0.15;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const qx = (cx + ox + 8) % 8, qy = (cy + oy + 8) % 8;
        const ccx = (cx + ox) * 8 + 4 + (hash(qx, qy, 3) - 0.5) * 6;
        const ccy = (cy + oy) * 8 + 4 + (hash(qx, qy, 5) - 0.5) * 6;
        const r = 5 + hash(qx, qy, 7) * 3;
        const d = Math.hypot(x - ccx, y - ccy);
        if (d < r) k = Math.max(k, 0.05 + (1 - d / r) * 0.2 - ((x - ccx) + (y - ccy)) / r * 0.12);
      }
      k += (hash(x, y, 11) - 0.5) * 0.08;
      const rgb = shade(base, k);
      const i = (y * S + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function crack(g, rng, px, py) {
  g.fillStyle = 'rgba(24,20,37,0.55)';
  let x = rng.int(4, 27), y = rng.int(4, 27);
  for (let i = 0; i < rng.int(6, 12); i++) {
    g.fillRect(px + x, py + y, 1, 1);
    x = Math.max(0, Math.min(31, x + rng.int(-1, 1)));
    y = Math.max(0, Math.min(31, y + (rng.chance(0.7) ? 1 : 0)));
  }
}

function leaves(g, rng, px, py, moss) {
  for (let i = 0; i < rng.int(2, 4); i++) {
    const x = px + rng.int(2, 28), y = py + rng.int(2, 28);
    g.fillStyle = rng.chance(0.5) ? moss : (rng.chance(0.5) ? '#b86f50' : '#63c74d');
    g.fillRect(x, y, 2, 1);
    g.fillRect(x + 1, y + 1, 1, 1);
  }
}

function blob(g, rng, cx, cy, r) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y <= r * r * (0.7 + rng.next() * 0.3)) g.fillRect(cx + x, cy + y, 1, 1);
  }
}
