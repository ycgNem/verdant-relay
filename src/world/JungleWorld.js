// The jungle at runtime: chunk streaming, rendering, collision and the machete's effect on the world.
//
// Data comes from JungleGen (static per run) plus the run's persistent cut-mask (tiles of undergrowth
// the player has cleared, shared across days). The world is cut into 16 × 16-tile chunks; the chunks
// around the camera are live:
//   ground  a 512 × 512 canvas baked by TerrainBaker (one plane, 1 texel = 1 pixel)
//   cards   every bush, tree, ruin and rock of the chunk merged into ONE mesh of upright pixel cards
//           (atlas from FloraAtlas). A card stands at its ground anchor: texels above the anchor rise
//           straight up (screen height = world height × cot 55°, so pixels stay 1:1), texels below it lie
//           flat on the ground toward the camera. Depth is therefore right: you walk behind a tree and
//           its canopy covers you — and the card shader dithers a see-through window around the player.
// Baking is spread out (one chunk per frame) and cached; cutting brush rebuilds only that chunk's cards.
//
// Collision (Stage 6 "solid jungle"): thickets/brambles and deep water are solid tiles; trunks, logs, rocks,
// ruins and props are rounded-box footprints matched to the base of their art (src/world/Solid.js, SOLID) in a
// tile hash. Ferns, shallow water and mud only slow movement (speedAt, GROUND).

import * as THREE from 'three';
import { JUNGLE, LEVEL, BRUSH, ATMOS, SOLID, GROUND } from '../data/jungle.js';
import { CARD_SCALE } from '../core/PixelView.js';
import { CARD_MASK_REF, setOutline } from '../core/Assets.js';
import { TerrainBaker } from './TerrainBaker.js';
import { FloraAtlas } from './FloraAtlas.js';
import { hash2 } from './noise.js';
import { footprint, inFootprint, pushOut } from './Solid.js';

const C = JUNGLE.chunk;

// 8 × 8 ordered dither (recursive Bayer): 64 levels, so a fade over a few pixels shows no steps.
const BAYER_GLSL = 'float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }\nfloat bayer8(vec2 a){ return (bayer2(0.25 * a) * 0.25 + bayer2(0.5 * a)) * 0.25 + bayer2(a); }\n';

export function makeCardMaterial(tex) {
  return new THREE.ShaderMaterial({
    // Never over the player's own texels + outline: its card mask (Assets.js addOutline) wrote stencil
    // CARD_MASK_REF there just before the cards draw. Read-only stencil test; no stencil = always passes.
    stencilWrite: true,
    stencilWriteMask: 0x00,
    stencilRef: CARD_MASK_REF,
    stencilFunc: THREE.NotEqualStencilFunc,
    uniforms: {
      map: { value: tex },
      uTime: { value: 0 },
      uSway: { value: ATMOS.sway },
      uPlayerPx: { value: new THREE.Vector2(-999, -999) },
      uPlayerZ: { value: -999 },
      uXray: { value: ATMOS.xrayRadius * 32 },
      uXrayMax: { value: ATMOS.xrayMax },
      uXrayInner: { value: ATMOS.xrayInner },
      uTint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: `
      attribute vec4 aCard;   // baseZ, sway weight, phase, upright (1) / flat (0)
      uniform float uTime;
      uniform float uSway;
      varying vec2 vUv;
      varying float vBaseZ;
      varying float vUpright;
      void main() {
        vec3 p = position;
        float s = floor(sin(uTime * 1.6 + aCard.z) * uSway * aCard.y + 0.5) / 32.0;
        p.x += s;
        vUv = uv;
        vBaseZ = aCard.x;
        vUpright = aCard.w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec2 uPlayerPx;
      uniform float uPlayerZ;
      uniform float uXray, uXrayMax, uXrayInner;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying float vBaseZ;
      varying float vUpright;
      ${BAYER_GLSL}
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        if (vUpright > 0.5 && vBaseZ > uPlayerZ + 0.06) {
          // See-through window: a round dithered hole that fades smoothly to nothing at its rim
          // (no hard edge, so no visible box or ring). The player's silhouette shows through the rest.
          vec2 d = (gl_FragCoord.xy - uPlayerPx) * vec2(1.0, 0.85);
          float k = uXrayMax * (1.0 - smoothstep(uXray * uXrayInner, uXray, length(d)));
          if (bayer8(gl_FragCoord.xy) < k) discard;
        }
        gl_FragColor = vec4(c.rgb * uTint, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export class JungleWorld {
  /**
   * @param game      Game (for assets)
   * @param scene3d   THREE.Scene to add chunk meshes to
   * @param world     JungleGen data
   * @param cutMask   Uint8Array(W²), 1 = brush cut (persistent, owned by the run)
   */
  constructor(game, scene3d, world, cutMask) {
    this.game = game;
    this.three = scene3d;
    this.w = world;
    this.size = world.size;
    this.cut = cutMask;
    this.deep = world.deep || new Uint8Array(world.size * world.size);
    world.brushNow = (x, z) => this.brushAt(x, z);
    this.atlas = new FloraAtlas(game.assets);
    this.cardMat = makeCardMaterial(this.atlas.texture);
    this.baker = new TerrainBaker(world, game.assets, game.assets.terrainArt || null);
    this.nChunks = Math.ceil(this.size / C);
    this.chunks = new Map();      // key → { cx, cz, ground, cards, dirtyCards }
    this.bakeCache = new Map();   // key → canvas (LRU by insertion)
    this.bakeQueue = [];
    this.groundGeom = new THREE.PlaneGeometry(C, C);
    this.groundGeom.userData.shared = true;
    this._buildColliders();
    this.shadeTex = this._buildShade();
    this.time = 0;
  }

  // ================================================================== queries

  inBounds(tx, tz) { return tx >= 0 && tz >= 0 && tx < this.size && tz < this.size; }

  brushAt(tx, tz) {
    if (!this.inBounds(tx, tz)) return BRUSH.thicket;
    const i = tz * this.size + tx;
    return this.cut[i] ? 0 : this.w.brush[i];
  }

  /** Deep water: nobody crosses it (fords are shallow). */
  deepAt(tx, tz) { return this.inBounds(tx, tz) && this.deep[tz * this.size + tx] === 1; }

  /** Solid for movement: uncut thicket/bramble, deep water, or the map edge. */
  solidAt(tx, tz) { return !this.inBounds(tx, tz) || this.deep[tz * this.size + tx] === 1 || this.brushAt(tx, tz) >= BRUSH.thicket; }

  /** Solid for a body that slips through brush: deep water and the map edge only. */
  wetAt(tx, tz) { return !this.inBounds(tx, tz) || this.deep[tz * this.size + tx] === 1; }

  /** Opaque for sight: thickets, brambles, walls. */
  opaqueAt(tx, tz) {
    if (!this.inBounds(tx, tz)) return true;
    return this.brushAt(tx, tz) >= BRUSH.thicket || this.opaqueGrid[tz * this.size + tx] === 1;
  }

  /** Blocked for pathfinding (brush unless the walker crashes/slips through, plus static colliders). */
  blockedAt(tx, tz, throughBrush = false) {
    if (!this.inBounds(tx, tz)) return true;
    if (this.objGrid[tz * this.size + tx] || this.deep[tz * this.size + tx]) return true;
    return !throughBrush && this.brushAt(tx, tz) >= BRUSH.thicket;
  }

  /** Terrain level under a world point (the higher-weighted vertex). */
  levelAt(x, z) {
    const V = this.size + 1;
    const vx = Math.max(0, Math.min(this.size, Math.round(x))), vz = Math.max(0, Math.min(this.size, Math.round(z)));
    return this.w.level[vz * V + vx];
  }

  /** Movement multiplier: shallow water and mud drag, ferns snag (not `brushFree` bodies: skitters, razorbacks). */
  speedAt(x, z, brushFree = false) {
    const lv = this.levelAt(x, z);
    let m = lv === LEVEL.water ? GROUND.shallow : lv === LEVEL.mud ? GROUND.mud : 1;
    if (!brushFree && this.inFern(x, z)) m *= GROUND.fern;
    return m;
  }

  /** Standing in uncut ferns? */
  inFern(x, z) { return this.brushAt(Math.floor(x), Math.floor(z)) === BRUSH.fern; }

  /** Canopy shade 0..1 at a point (1 = deep shade) — for sprites' lighting on the CPU. */
  shadeAt(x, z) {
    const tx = Math.max(0, Math.min(this.size - 1, Math.floor(x))), tz = Math.max(0, Math.min(this.size - 1, Math.floor(z)));
    return this.shade[tz * this.size + tx] / 255;
  }

  // ================================================================== colliders

  _buildColliders() {
    const W = this.size;
    this.colGrid = new Map();               // tile index → [collider]
    this.objGrid = new Uint8Array(W * W);   // tiles whose centre is (nearly) inside a footprint: flow fields avoid them
    this.opaqueGrid = new Uint8Array(W * W);
    this.colliders = [];
    for (const o of this.w.objects) this.addCollider(o, objectEntry(o, this.atlas)?.key);
    for (const p of this.w.pylons) this.addCollider({ kind: 'prop', type: 'pylon', x: p.x, z: p.z, id: p.id });
  }

  /**
   * Make an object solid. Footprint from SOLID (src/data/jungle.js): by `artKey` (the sprite drawn for it),
   * else by kind_type, else a circle of radius o.r. Returns the collider or null.
   */
  addCollider(o, artKey) {
    const col = footprint(o, artKey);
    if (!col) return null;
    col.obj = o;
    const x0 = col.x0 - col.rr, x1 = col.x1 + col.rr, z0 = col.z0 - col.rr, z1 = col.z1 + col.rr;
    col.bounds = [x0, z0, x1, z1];
    const W = this.size;
    for (let tz = Math.floor(z0); tz <= Math.floor(z1); tz++) for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
      if (!this.inBounds(tx, tz)) continue;
      const i = tz * W + tx;
      if (!this.colGrid.has(i)) this.colGrid.set(i, []);
      this.colGrid.get(i).push(col);
      if (inFootprint(col, tx + 0.5, tz + 0.5, SOLID.tilePad)) {
        this.objGrid[i] = 1;
        if (col.opaque) this.opaqueGrid[i] = 1;
      }
    }
    this.colliders.push(col);
    if (this._dbg) this.showColliders(true);
    return col;
  }

  /** Static colliders overlapping a circle's neighbourhood. */
  collidersNear(x, z, r) {
    const out = this._near || (this._near = []);
    out.length = 0;
    const W = this.size;
    for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      const l = this.colGrid.get(tz * W + tx);
      if (l) for (const c of l) if (!out.includes(c)) out.push(c);
    }
    return out;
  }

  /**
   * Move a circle by (dx, dz) with sliding, in small steps (no tunnelling). opts.throughBrush lets a
   * body ignore brush tiles (Skitters slip through). Returns true if anything was hit.
   */
  moveBody(p, dx, dz, r, opts = {}) {
    const dist = Math.max(Math.abs(dx), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(dist / 0.2));
    const sx = dx / steps, sz = dz / steps;
    let hit = false;
    const solid = opts.throughBrush ? (tx, tz) => this.wetAt(tx, tz) : (tx, tz) => this.solidAt(tx, tz);
    for (let s = 0; s < steps; s++) {
      p.x += sx; p.z += sz;
      for (let it = 0; it < 2; it++) {
        let moved = false;
        // Tiles.
        const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
        for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
          if (!solid(tx, tz)) continue;
          if (pushOutBox(p, r, tx, tz, tx + 1, tz + 1)) { hit = moved = true; if (opts.onBrush && this.brushAt(tx, tz) >= BRUSH.thicket) opts.onBrush(tx, tz); }
        }
        // Objects.
        for (const c of this.collidersNear(p.x, p.z, r + 0.1)) if (pushOut(p, r, c)) hit = moved = true;
        if (!moved) break;
      }
    }
    return hit;
  }

  /** True if a circle at (x, z) overlaps anything solid. */
  blockedCircle(x, z, r, throughBrush = false) {
    for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (throughBrush ? this.wetAt(tx, tz) : this.solidAt(tx, tz)) {
        const cx = Math.max(tx, Math.min(x, tx + 1)), cz = Math.max(tz, Math.min(z, tz + 1));
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
      }
    }
    for (const c of this.collidersNear(x, z, r)) if (inFootprint(c, x, z, r * 0.9)) return true;
    return false;
  }

  /** Line of sight between two points (thickets and walls block). */
  lineOfSight(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) return true;
    const n = Math.ceil(len * 3);
    let last = -1;
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      const ti = Math.floor(z) * this.size + Math.floor(x);
      if (ti === last) continue;
      last = ti;
      if (this.opaqueAt(Math.floor(x), Math.floor(z))) return false;
    }
    return true;
  }

  // ================================================================== cutting

  /**
   * The machete hits tile (tx, tz) with `power` (1 slash, 2 heavy chop). Thickets and ferns fall to
   * any hit; brambles need a chop (or three slashes). Returns the brush type cut, or 0.
   */
  hitBrush(tx, tz, power) {
    const b = this.brushAt(tx, tz);
    if (!b) return 0;
    const i = tz * this.size + tx;
    if (b === BRUSH.bramble && power < 2) {
      this._bramble = this._bramble || new Map();
      const n = (this._bramble.get(i) || 0) + 1;
      this._bramble.set(i, n);
      if (n < 3) return -1;   // nicked, not cleared
    }
    this.cut[i] = 1;
    this._dirty(tx, tz);
    return b;
  }

  /** Let undergrowth regrow (called between days). */
  static regrow(world, cut, seed) {
    const W = world.size;
    for (let i = 0; i < W * W; i++) {
      if (!cut[i] || world.trail[i] || world.site[i] >= 0) continue;
      if (hash2(i % W, Math.floor(i / W), seed) < JUNGLE.regrowth) cut[i] = 0;
    }
  }

  _dirty(tx, tz) {
    const ch = this.chunks.get(this._key(Math.floor(tx / C), Math.floor(tz / C)));
    if (ch) ch.dirtyCards = true;
  }

  // ================================================================== canopy shade

  _buildShade() {
    const W = this.size;
    const f = new Float32Array(W * W);
    const add = (x, z, r, s) => {
      for (let tz = Math.floor(z - r); tz <= Math.ceil(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.ceil(x + r); tx++) {
        if (!this.inBounds(tx, tz)) continue;
        const d = Math.hypot(tx + 0.5 - x, tz + 0.5 - z) / r;
        if (d < 1) f[tz * W + tx] += s * (1 - d * d);
      }
    };
    for (const o of this.w.objects) {
      if (o.kind !== 'tree') continue;
      // Canopies sit north of the trunk on screen; their shadow falls a little north too.
      const r = o.big ? 4.6 : o.type === 'palm' ? 2.4 : o.type === 'dead' ? 2 : 3.4;
      add(o.x, o.z - 1.2, r, o.type === 'dead' ? 0.45 : 0.9);
    }
    for (let i = 0; i < W * W; i++) if (this.w.brush[i] >= BRUSH.thicket) f[i] += 0.25;
    // Blur twice (3 × 3 box).
    let a = f, b = new Float32Array(W * W);
    for (let pass = 0; pass < 2; pass++) {
      for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
        let s = 0, n = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= W || zz >= W) continue;
          s += a[zz * W + xx]; n++;
        }
        b[z * W + x] = s / n;
      }
      [a, b] = [b, a];
    }
    this.shade = new Uint8Array(W * W);
    const cx = this.w.center.x, cz = this.w.center.z;
    for (let i = 0; i < W * W; i++) {
      const x = i % W, z = Math.floor(i / W);
      let v = Math.min(1, a[i] * 0.9);
      // Water and the Relay clearing open the sky.
      if (this.w.level[z * (W + 1) + x] === LEVEL.water) v *= 0.35;
      const dc = Math.hypot(x - cx, z - cz);
      if (dc < JUNGLE.relayClearing + 2) v *= Math.max(0, (dc - JUNGLE.relayClearing + 4) / 6);
      this.shade[i] = Math.round(v * 255);
    }
    const tex = new THREE.DataTexture(this.shade, W, W, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // ================================================================== chunks

  _key(cx, cz) { return cz * 1000 + cx; }

  /** Keep the chunks around (x, z) live; bake ahead in the background. Call every frame. */
  update(dt, focusX, focusZ) {
    this.time += dt;
    this.cardMat.uniforms.uTime.value = this.time;
    const ccx = Math.floor(focusX / C), ccz = Math.floor(focusZ / C);
    const R = JUNGLE.activeRadius;
    const want = new Set();
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx < 0 || cz < 0 || cx >= this.nChunks || cz >= this.nChunks) continue;
      want.add(this._key(cx, cz));
      if (!this.chunks.has(this._key(cx, cz))) this._buildChunk(cx, cz);
    }
    for (const [k, ch] of this.chunks) if (!want.has(k)) this._dropChunk(k, ch);
    for (const ch of this.chunks.values()) if (ch.dirtyCards) this._buildCards(ch);
    // Background baking: one chunk per frame within the prebake ring.
    const PR = JUNGLE.prebakeRadius;
    for (let dz = -PR; dz <= PR; dz++) for (let dx = -PR; dx <= PR; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx < 0 || cz < 0 || cx >= this.nChunks || cz >= this.nChunks) continue;
      if (!this.bakeCache.has(this._key(cx, cz))) { this._bake(cx, cz); return; }
    }
  }

  /** Bake everything around a point right away (on scene entry, behind the loading beat). */
  warm(x, z) {
    const ccx = Math.floor(x / C), ccz = Math.floor(z / C);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      if (cx >= 0 && cz >= 0 && cx < this.nChunks && cz < this.nChunks) this._bake(cx, cz);
    }
    this.update(0, x, z);
  }

  _bake(cx, cz) {
    const k = this._key(cx, cz);
    let canvas = this.bakeCache.get(k);
    if (canvas) return canvas;
    if (this.bakeCache.size >= JUNGLE.bakeCache) {
      // Evict the oldest chunk that isn't live; reuse its canvas.
      for (const [ok, c] of this.bakeCache) if (!this.chunks.has(ok)) { this.bakeCache.delete(ok); canvas = c; break; }
    }
    canvas = this.baker.bake(cx, cz, canvas);
    this.bakeCache.set(k, canvas);
    return canvas;
  }

  _buildChunk(cx, cz) {
    const canvas = this._bake(cx, cz);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(this.groundGeom, new THREE.MeshBasicMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx * C + C / 2, 0, cz * C + C / 2);
    ground.renderOrder = -10;
    ground.userData.noSnap = true;
    this.three.add(ground);
    const ch = { cx, cz, ground, cards: null, dirtyCards: true };
    this.chunks.set(this._key(cx, cz), ch);
    this._buildCards(ch);
  }

  _dropChunk(k, ch) {
    ch.ground.removeFromParent();
    ch.ground.material.map.dispose();
    ch.ground.material.dispose();
    if (ch.cards) { ch.cards.removeFromParent(); ch.cards.geometry.dispose(); }
    this.chunks.delete(k);
  }

  /** (Re)build the merged card mesh for a chunk. */
  _buildCards(ch) {
    ch.dirtyCards = false;
    const cards = chunkCards(this.w, this.atlas, this.cut, ch.cx * C, ch.cz * C, C, C);
    ch.cards?.removeFromParent();
    ch.cards?.geometry.dispose();
    ch.cards = cards.length ? cardMesh(cards, this.atlas, this.cardMat) : null;
    if (ch.cards) this.three.add(ch.cards);
  }

  /** Player position for the x-ray window (internal pixels, GL convention y up). */
  setPlayer(px, py, z, x, vis) {
    this.cardMat.uniforms.uPlayerPx.value.set(px, py);
    this.cardMat.uniforms.uPlayerZ.value = z;
    // Player outline (critic G #1): pale while brush or a tall object is around / in front of the player.
    if (vis && x !== undefined) setOutline(vis, this.coveredAt(x, z) ? ATMOS.playerOutline.cover : ATMOS.playerOutline.open);
  }

  /** Is anything that draws as an upright card (uncut brush, a collider object) around or just in front of (x, z)? */
  coveredAt(x, z) {
    const O = ATMOS.playerOutline;
    const tx = Math.floor(x), tz = Math.floor(z);
    for (let dz = -1; dz <= O.coverAhead; dz++) {
      for (let dx = -O.coverRadius; dx <= O.coverRadius; dx++) {
        const ax = tx + dx, az = tz + dz;
        if (!this.inBounds(ax, az)) continue;
        if (this.brushAt(ax, az) > 0 && (dz >= 0 || dx === 0)) return true;
        if (dz > 0 && this.objGrid[az * this.size + ax]) return true;
      }
    }
    return false;
  }

  /** Debug: outline every footprint (yellow), deep water (blue) and fords (cyan) on the ground. */
  showColliders(on = true) {
    this._dbg?.removeFromParent();
    this._dbg?.geometry.dispose();
    this._dbg?.material.dispose();
    this._dbg = null;
    if (!on) return;
    const pos = [], col = [];
    const seg = (ax, az, bx, bz, c) => { pos.push(ax, 0.03, az, bx, 0.03, bz); col.push(...c, ...c); };
    const Y = [1, 0.9, 0.2], B = [0.2, 0.4, 1], F = [0.3, 1, 1];
    for (const c of this.colliders) {
      // Rounded box: the inner box's sides pushed out by rr, plus quarter circles at the corners.
      const { x0, z0, x1, z1, rr } = c;
      if (x1 > x0) { seg(x0, z0 - rr, x1, z0 - rr, Y); seg(x0, z1 + rr, x1, z1 + rr, Y); }
      if (z1 > z0) { seg(x0 - rr, z0, x0 - rr, z1, Y); seg(x1 + rr, z0, x1 + rr, z1, Y); }
      const n = 6;
      for (const [cx, cz, a0] of [[x1, z1, 0], [x0, z1, Math.PI / 2], [x0, z0, Math.PI], [x1, z0, Math.PI * 1.5]]) {
        for (let k = 0; k < n; k++) {
          const a = a0 + (k / n) * Math.PI / 2, b = a0 + ((k + 1) / n) * Math.PI / 2;
          seg(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, cx + Math.cos(b) * rr, cz + Math.sin(b) * rr, Y);
        }
      }
    }
    const W = this.size, ford = this.w.ford;
    for (let tz = 0; tz < W; tz++) for (let tx = 0; tx < W; tx++) {
      const i = tz * W + tx;
      if (this.deep[i]) { seg(tx + 0.1, tz + 0.1, tx + 0.9, tz + 0.9, B); seg(tx + 0.9, tz + 0.1, tx + 0.1, tz + 0.9, B); }
      else if (ford && ford[i]) { seg(tx + 0.2, tz + 0.5, tx + 0.8, tz + 0.5, F); seg(tx + 0.5, tz + 0.2, tx + 0.5, tz + 0.8, F); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
    m.renderOrder = 999;
    m.frustumCulled = false;
    m.userData.noSnap = true;
    this.three.add(m);
    this._dbg = m;
  }

  dispose() {
    this.showColliders(false);
    for (const [k, ch] of [...this.chunks]) this._dropChunk(k, ch);
    this.groundGeom.dispose();
    this.cardMat.dispose();
    this.atlas.texture.dispose();
    this.shadeTex.dispose();
    this.w.brushNow = null;
  }
}

/**
 * The cards (undergrowth, cut debris, trees, ruins, rocks) whose ground point lies in the tile rect
 * [x0, x0 + w) × [z0, z0 + h) of a world. Deterministic: the same tile always gets the same sprites.
 */
export function chunkCards(world, A, cut, x0, z0, w, h) {
  const W = world.size;
  const cards = [];
  const snap = (v) => Math.round(v * 32) / 32;
  for (let tz = z0; tz < z0 + h; tz++) {
    for (let tx = x0; tx < x0 + w; tx++) {
      if (tx < 0 || tz < 0 || tx >= W || tz >= W) continue;
      const i = tz * W + tx;
      const base = world.brush[i];
      if (!base) continue;
      const b = cut && cut[i] ? 0 : base;
      if (!b) {
        // Cut: leaf debris and a stub where it stood.
        const r = hash2(tx, tz, 71);
        if (r < 0.06 && base >= BRUSH.thicket) cards.push({ e: A.pick('cutstump', tx, tz, 1), x: snap(tx + 0.3 + hash2(tx, tz, 72) * 0.4), z: snap(tz + 0.55 + hash2(tx, tz, 73) * 0.3), sway: 0, flip: hash2(tx, tz, 74) < 0.5 });
        else if (r < 0.5) cards.push({ e: A.pick('debris', tx, tz, 1), x: snap(tx + 0.5 + (hash2(tx, tz, 72) - 0.5) * 0.4), z: snap(tz + 0.1 + hash2(tx, tz, 73) * 0.3), sway: 0, flip: hash2(tx, tz, 74) < 0.5 });
        continue;
      }
      const fam = b === BRUSH.fern ? (hash2(tx, tz, 5) < 0.08 ? 'mushroom' : 'fern') : b === BRUSH.bramble ? 'bramble' : (hash2(tx, tz, 6) < 0.18 ? 'vine' : 'thicket');
      const n = b === BRUSH.fern ? (hash2(tx, tz, 9) < 0.35 ? 2 : 1) : b === BRUSH.thicket ? 2 : 1 + (hash2(tx, tz, 9) < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const e = A.pick(fam, tx * 7 + k, tz, 13);
        if (!e) continue;
        // Distinct depth slots per card in a tile so overlapping leaves never z-fight.
        const zz = tz + 0.3 + ((k * 0.37 + hash2(tx, tz, 20 + k) * 0.3) % 0.68);
        cards.push({ e, x: snap(tx + 0.15 + hash2(tx, tz, 30 + k) * 0.7), z: snap(zz), sway: 1, flip: hash2(tx, tz, 40 + k) < 0.5, phase: tx * 0.7 + tz * 0.3 });
      }
    }
  }
  for (const o of world.objects) {
    if (o.x < x0 || o.x >= x0 + w || o.z < z0 || o.z >= z0 + h) continue;
    const e = objectEntry(o, A);
    if (!e) continue;
    cards.push({ e, x: o.x, z: o.z, sway: o.kind === 'tree' ? 0.6 : 0, flip: o.flip && o.kind !== 'ruin', phase: o.x * 0.5 });
  }
  return cards.filter((c) => c.e);
}

/** The atlas sprite drawn for a world object (tree / rock / ruin), or null. Its `key` picks the collider (SOLID.art). */
export function objectEntry(o, A) {
  let fam;
  if (o.kind === 'tree') fam = `tree_${o.type}`;
  else if (o.kind === 'rock') fam = o.type;
  else if (o.kind === 'ruin') fam = `ruin_${o.type}`;
  else return null;
  return A.pick(fam, Math.floor(o.x * 3), Math.floor(o.z * 3), 51) || A.pick('boulder', 1, 1);
}

/** One merged mesh of upright cards (see the file header). */
export function cardMesh(cards, atlas, material) {
  const n = cards.length * 2;   // up to two quads per card (upright + flat part)
  const pos = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2), card = new Float32Array(n * 4 * 4);
  const idx = [];
  let q = 0;
  const AS = atlas.canvas.width;
  const quad = (verts, uvs, attrs) => {
    for (let v = 0; v < 4; v++) {
      pos.set(verts[v], (q * 4 + v) * 3);
      uv.set(uvs[v], (q * 4 + v) * 2);
      card.set(attrs[v], (q * 4 + v) * 4);
    }
    const b = q * 4;
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    q++;
  };
  for (const c of cards) {
    const e = c.e;
    const left = c.x - e.ax / 32, right = left + e.w / 32;
    let u0 = e.x / AS, u1 = (e.x + e.w) / AS;
    if (c.flip) [u0, u1] = [u1, u0];
    const vTop = e.y / AS, vAnchor = (e.y + e.ay) / AS, vBot = (e.y + e.h) / AS;
    const hUp = (e.ay / 32) * CARD_SCALE;
    const ph = c.phase ?? 0;
    if (e.ay > 0) {
      quad(
        [[left, hUp, c.z], [right, hUp, c.z], [left, 0.002, c.z], [right, 0.002, c.z]],
        [[u0, vTop], [u1, vTop], [u0, vAnchor], [u1, vAnchor]],
        [[c.z, c.sway, ph, 1], [c.z, c.sway, ph, 1], [c.z, 0, ph, 1], [c.z, 0, ph, 1]],
      );
    }
    if (e.h > e.ay) {
      const zb = c.z + (e.h - e.ay) / 32;
      quad(
        [[left, 0.004, c.z], [right, 0.004, c.z], [left, 0.004, zb], [right, 0.004, zb]],
        [[u0, vAnchor], [u1, vAnchor], [u0, vBot], [u1, vBot]],
        [[c.z, 0, ph, 0], [c.z, 0, ph, 0], [c.z, 0, ph, 0], [c.z, 0, ph, 0]],
      );
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, q * 12), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, q * 8), 2));
  g.setAttribute('aCard', new THREE.BufferAttribute(card.subarray(0, q * 16), 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.userData.noSnap = true;
  m.frustumCulled = false;
  return m;
}

/** Push circle p (radius r) out of the box [x0, z0]–[x1, z1]. */
function pushOutBox(p, r, x0, z0, x1, z1) {
  const cx = Math.max(x0, Math.min(p.x, x1)), cz = Math.max(z0, Math.min(p.z, z1));
  const ox = p.x - cx, oz = p.z - cz;
  const d2 = ox * ox + oz * oz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    p.x += (ox / d) * (r - d); p.z += (oz / d) * (r - d);
  } else {
    const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r;
  }
  return true;
}
