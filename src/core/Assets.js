// Visuals for every entity key. A key listed in public/sprites/manifest.json is drawn as a pixel-art
// sprite; anything else falls back to the primitive placeholder model in src/data/visuals.js.
//
// Manifest entry:
//   "crawler": {
//     "file": "crawler.png",   // a horizontal strip of equal frames (or a single image)
//     "ppu": 32,               // texels per world unit (1 tile)
//     "frames": 8,             // optional, frames in the strip (default 1)
//     "anims": { "idle": [0,1], "walk": [2,3,4,5], "attack": [6,7] },   // optional frame lists
//     "fps": 8,                // optional, default 8 (per-anim override: "animFps": { "walk": 10 })
//     "flat": true,            // optional: a ground decal (horizontal quad) instead of a billboard
//     "shadow": 0.5,           // optional: blob-shadow radius in tiles (0 = none). Default from width.
//     "anchorY": 0,            // optional: texels of transparent padding under the feet
//     "anchor": [32, 54],      // optional: ground-point texel [x, y-from-top] inside one frame
//     "fw": 64, "fh": 64       // optional: frame size when the sheet is a grid
//   }
//
// Directional sheets (8-way, STYLE.md): "dirs": ["s","se","e","ne","n"] and anims as objects
// { row, frames, fps, hit?, loop? }; direction i of an anim is on row `row + i`. West-side directions
// that aren't listed are mirrored from their east twins. setFacing() picks the direction.
//
// Sprites face RIGHT in the art; setFacing() flips them horizontally when moving/aiming left.
// Keys with a level suffix ("scrap_turret_3") fall back to the base key when not listed.
//
// Every visual is a THREE.Group:  root ─ body (sprite or model) ─ … ; root.userData.vis holds state.
// Call updateVisual(root, dt) once per frame for animation, flashes and facing.

import * as THREE from 'three';
import { VISUALS } from '../data/visuals.js';
import { CARD_SCALE } from './PixelView.js';
import { TERRAIN_ART } from '../data/jungle.js';

const GEOMS = {
  box: (s) => new THREE.BoxGeometry(...s),
  cyl: (s) => new THREE.CylinderGeometry(s[0], s[1], s[2], 8),
  cone: (s) => new THREE.ConeGeometry(s[0], s[1], 8),
  sph: (s) => new THREE.SphereGeometry(s[0], 8, 6),
  ico: (s) => new THREE.IcosahedronGeometry(s[0], 0),
  oct: (s) => new THREE.OctahedronGeometry(s[0], 0),
  dod: (s) => new THREE.DodecahedronGeometry(s[0], 0),
};

const TINT = new THREE.Color(1, 1, 1);
const PPU = 32;

// Blob shadows are drawn at the sprites' own texel size (1 texel = 1/32 tile), one shared texture +
// plane per pixel size, so they stay crisp next to the sprites instead of being a stretched 16 px blob.
const shadowCache = new Map();
function getShadow(r) {
  const w = Math.max(4, 2 * Math.round(r * PPU)), h = Math.max(2, 2 * Math.round(r * 0.7 * PPU));
  const key = `${w}x${h}`;
  let s = shadowCache.get(key);
  if (s) return s;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // A hard-edged pixel ellipse with a darker core reads better than a soft gradient at low res.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
      if (d < 1) {
        g.fillStyle = d < 0.62 ? 'rgba(10,8,20,0.68)' : 'rgba(10,8,20,0.42)';
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const geom = new THREE.PlaneGeometry(w / PPU, h / PPU);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  geom.userData.shared = mat.userData.shared = tex.userData.shared = true;
  s = { geom, mat };
  shadowCache.set(key, s);
  return s;
}

// Hostile marker: a 1-texel elliptical ring on the floor around an enemy's feet (front arc in the
// marker colour over a dark inner line, back arc darker), drawn at the sprites' texel size so it is
// as crisp as they are. It keeps enemies from melting into a same-coloured floor.
const ringCache = new Map();
function getRing(r, color) {
  const w = Math.max(10, 2 * Math.round(r * 1.25 * PPU)), h = Math.max(6, 2 * Math.round(r * 0.85 * PPU));
  const key = `${w}x${h}${color}`;
  let s = ringCache.get(key);
  if (s) return s;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const back = `#${new THREE.Color(color).multiplyScalar(0.6).getHexString()}`;
  const inside = (x, y, k) => Math.hypot((x + 0.5 - w / 2) / (w / 2 - k), (y + 0.5 - h / 2) / (h / 2 - k)) < 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const front = y >= h / 2 - 1;
      if (inside(x, y, 0) && !inside(x, y, 1)) { g.fillStyle = front ? color : back; g.fillRect(x, y, 1, 1); }
      else if (front && inside(x, y, 1) && !inside(x, y, 2)) { g.fillStyle = '#181425'; g.fillRect(x, y, 1, 1); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geom = new THREE.PlaneGeometry(w / PPU, h / PPU);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
  geom.userData.shared = mat.userData.shared = tex.userData.shared = true;
  s = { geom, mat };
  ringCache.set(key, s);
  return s;
}
function makeRing(r, color) {
  const { geom, mat } = getRing(r, color);
  const m = new THREE.Mesh(geom, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.018;
  m.renderOrder = 0;
  m.name = 'ring';
  m.userData.pxSnap = true;
  m.userData.ring = true;
  return m;
}

// Stand-ins while a key has no art of its own (the Feral Scavenger borrows the v1 Rival Scavenger).
const SPRITE_ALIAS = { feral: 'scav' };

const DIR_VEC = { s: [0, 1], se: [1, 1], e: [1, 0], ne: [1, -1], n: [0, -1], nw: [-1, -1], w: [-1, 0], sw: [-1, 1] };
const DIR_ORDER = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];   // by screen angle atan2(dz, dx), 45° steps
const MIRROR = { sw: 'se', w: 'e', nw: 'ne', se: 'sw', e: 'w', ne: 'nw' };

/** Frame size and grid of a manifest sprite: { fw, fh, cols, rows }. */
export function frameGeom(def, img) {
  const frames = def.frames || 1;
  const fw = def.fw || img.width / frames;
  const fh = def.fh || img.height;
  return { fw, fh, cols: Math.max(1, Math.round(img.width / fw)), rows: Math.max(1, Math.round(img.height / fh)) };
}

/** Normalised anims: name → { frames: [frame indices], row (directional base row or -1), fps, loop, hit }. */
function normAnims(def) {
  if (!def.anims) return null;
  const out = {};
  for (const [name, a] of Object.entries(def.anims)) {
    if (Array.isArray(a)) out[name] = { frames: a, row: -1, fps: def.animFps?.[name] || def.fps || 8, loop: true, hit: -1 };
    else out[name] = { frames: Array.from({ length: a.frames || 1 }, (_, i) => i), row: a.row ?? 0, fps: a.fps || def.fps || 8, loop: a.loop !== false, hit: a.hit ?? -1 };
  }
  return out;
}

export class Assets {
  constructor() {
    this.manifest = {};
    this.textures = {};       // key -> THREE.Texture (shared; each sprite clones for its own UV offset)
    this.tint = TINT;   // scene ambient tint applied to every sprite (night = blue)
    this._live = new Set();   // sprite roots, so a tint change reaches existing sprites
  }

  async load() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sprites/manifest.json`, { cache: 'no-cache' });
      this.manifest = res.ok ? await res.json() : {};
    } catch {
      this.manifest = {};
    }
    const loader = new THREE.TextureLoader();
    const jobs = Object.entries(this.manifest).map(([key, def]) => new Promise((resolve) => {
      if (!def || !def.file) return resolve();
      loader.load(`${import.meta.env.BASE_URL}sprites/${def.file}`, (tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.textures[key] = tex;
        resolve();
      }, undefined, () => { console.warn(`Sprite failed to load: ${def.file}`); resolve(); });
    }));
    await Promise.all(jobs);
    await this._loadTerrain();
  }

  /**
   * Terrain art (public/terrain, STYLE.md): for each terrain kind, the PixelLab Wang tile whose four
   * corners are all that terrain, as raw RGBA ({ data, w, h }) for TerrainBaker. Only the kinds listed
   * in TERRAIN_ART are used; the rest stay procedural (flat AI base tiles read as a grid).
   */
  async _loadTerrain() {
    this.terrainArt = null;
    try {
      const base = `${import.meta.env.BASE_URL}terrain/`;
      const res = await fetch(`${base}manifest.json`, { cache: 'no-cache' });
      if (!res.ok) return;
      const man = await res.json();
      const out = {};
      for (const set of Object.values(man.sets || {})) {
        const [meta, img] = await Promise.all([
          fetch(base + set.meta).then((r) => r.json()),
          new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = base + set.png; }),
        ]);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        for (const t of meta.tileset_data?.tiles || []) {
          const corners = new Set(Object.values(t.corners || {}));
          if (corners.size !== 1) continue;
          const kind = set[[...corners][0]];
          if (!TERRAIN_ART.includes(kind) || out[kind]) continue;
          const bb = t.bounding_box;
          const d = g.getImageData(bb.x, bb.y, bb.width, bb.height);
          out[kind] = { data: d.data, w: bb.width, h: bb.height };
        }
      }
      this.terrainArt = Object.keys(out).length ? out : null;
    } catch (e) {
      console.warn('terrain art not loaded', e);
    }
  }

  /** The manifest key actually used for `key` (handles "_2"/"_3" level suffixes). */
  resolveKey(key) {
    if (this.textures[key]) return key;
    const base = key.replace(/_\d+$/, '');
    if (base !== key && this.textures[base]) return base;
    const alias = SPRITE_ALIAS[key];
    if (alias && this.textures[alias]) return alias;
    return null;
  }

  hasSprite(key) { return !!this.resolveKey(key); }

  /** Raw texture for UI use (icons). Returns { tex, def } or null. */
  spriteInfo(key) {
    const k = this.resolveKey(key);
    return k ? { tex: this.textures[k], def: this.manifest[k] } : null;
  }

  /**
   * CSS px per texel for a sprite icon sized for a `boxPx` CSS px slot: the largest whole number of
   * DEVICE px per texel (1×, 2×, 3×…) that (about) fits, or an even 1/n step down when the sprite is much
   * bigger than the slot — never an arbitrary ratio, which draws texels 1 or 2 px wide at random.
   */
  iconScale(key, boxPx) {
    const k = this.resolveKey(key);
    if (!k) return null;
    const def = this.manifest[k];
    const img = this.textures[k].image;
    const { fw, fh } = frameGeom(def, img);
    const dpr = window.devicePixelRatio || 1;
    const r = (boxPx * dpr) / Math.max(fw, fh);
    // Up to ~15% over the box is allowed (a 48 px tower in a 45 px slot stays 1× instead of halving).
    const ds = r >= 0.85 ? Math.max(1, Math.floor(r + 0.15)) : 1 / Math.ceil(1 / r - 0.15);
    return ds / dpr;
  }

  /** CSS for a DOM icon of a sprite's first frame, at most `sizePx` CSS px on its long side
   *  (integer-scaled, see iconScale), or null. */
  iconStyle(key, sizePx = 32) {
    const k = this.resolveKey(key);
    if (!k) return null;
    const def = this.manifest[k];
    const img = this.textures[k].image;
    const { fw, fh } = frameGeom(def, img);
    const scale = this.iconScale(key, sizePx);
    return `background-image:url(${import.meta.env.BASE_URL}sprites/${def.file});background-size:${img.width * scale}px ${img.height * scale}px;background-position:0 0;width:${fw * scale}px;height:${fh * scale}px;image-rendering:pixelated;background-repeat:no-repeat;`;
  }

  setTint(color) {
    this.tint.set(color);
    for (const root of this._live) applyColor(root.userData.vis, this.tint);
  }

  /**
   * Build the visual for `key`. Options:
   *   shadow: false to skip the blob shadow
   *   ring: colour of a ground marker ring under the feet (hostile units)
   *   scale: uniform scale. Sprites only take whole-number scales (1, 2…): a fractional scale would
   *          draw uneven 1–2 px texels, so it is rounded.
   */
  makeVisual(key, opts = {}) {
    const root = new THREE.Group();
    root.name = key;
    const vis = {
      key, kind: 'model', body: null, mats: [], faceParts: [], statusParts: [],
      anim: null, animT: 0, frame: 0, frames: 1, anims: null, fps: 8, animFps: {},
      flashT: 0, flashColor: new THREE.Color(1, 1, 1), facingLeft: false, opacity: 1, height: 1, width: 1,
      baseColor: new THREE.Color(1, 1, 1),
    };
    root.userData.vis = vis;
    const sk = this.resolveKey(key);
    const scale = sk ? Math.max(1, Math.round(opts.scale ?? 1)) : (opts.scale ?? 1);

    if (sk) {
      const def = this.manifest[sk];
      const base = this.textures[sk];
      const tex = base.clone();
      tex.needsUpdate = true;
      const img = base.image;
      const G = frameGeom(def, img);
      tex.repeat.set(G.fw / img.width, G.fh / img.height);
      const ppu = def.ppu || 32;
      const w = (G.fw / ppu) * scale;
      const h = (G.fh / ppu) * scale;
      vis.kind = def.flat ? 'flat' : 'sprite';
      vis.geom = { ...G, iw: img.width, ih: img.height };
      vis.frames = G.cols;
      vis.anims = normAnims(def);
      vis.fps = def.fps || 8;
      vis.animFps = def.animFps || {};
      vis.dirs = def.dirs || null;
      vis.dir = vis.dirs ? (vis.dirs.includes('s') ? 's' : vis.dirs[0]) : null;
      vis.tex = tex;
      vis.width = w;
      // Ground point inside the frame: "anchor" [x, y-from-top], else bottom centre (+ anchorY padding).
      const ax = def.anchor ? def.anchor[0] : G.fw / 2;
      const ay = def.anchor ? def.anchor[1] : G.fh - (def.anchorY || 0);
      vis.anchor = [ax, ay];
      // Sprites are drawn as upright cards (src/core/PixelView.js): h sprite units tall on screen is
      // h × CARD_SCALE world units, so labels/bars at vis.height sit on top of the sprite.
      vis.height = def.flat ? 0.05 : (ay / ppu) * scale * CARD_SCALE;
      if (def.flat) {
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.02 + (def.layer || 0) * 0.005;
        mesh.renderOrder = 1;
        mesh.userData.pxSnap = true;   // PixelCamera aligns its texels to the pixel grid
        vis.body = mesh;
        vis.mats.push(mat);
        root.add(mesh);
      } else {
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
        const spr = new THREE.Sprite(mat);
        spr.center.set(ax / G.fw, (G.fh - ay) / G.fh);
        spr.scale.set(w, h, 1);
        vis.body = spr;
        vis.mats.push(mat);
        root.add(spr);
        this._live.add(root);
        applyColor(vis, this.tint);
      }
      const shadowR = def.shadow ?? (def.flat ? 0 : Math.min(1.4, w * 0.36));
      if (opts.shadow !== false && shadowR > 0) root.add(makeShadow(shadowR));
      if (opts.ring) root.add(makeRing(Math.max(0.3, shadowR), opts.ring));   // hostile marker (enemies)
      setFrame(vis, 0);
    } else {
      const parts = VISUALS[key] || VISUALS[key.replace(/_\d+$/, '')];
      const model = new THREE.Group();
      let top = 0.5;
      if (parts) {
        for (const [shape, size, pos, color, extra] of parts) {
          const mat = extra?.emissive
            ? new THREE.MeshBasicMaterial({ color })
            : new THREE.MeshLambertMaterial({ color, flatShading: true });
          mat.userData.base = new THREE.Color(color);
          mat.userData.emissive = !!extra?.emissive;
          const m = new THREE.Mesh(GEOMS[shape](size), mat);
          m.position.set(...pos);
          if (extra?.tilt) m.rotation.x = extra.tilt;
          model.add(m);
          vis.mats.push(mat);
          if (extra?.face) vis.faceParts.push(m);
          if (extra?.status) vis.statusParts.push(m);
          top = Math.max(top, pos[1] + (size[1] ?? size[0]) * 0.5);
        }
      } else {
        const mat = new THREE.MeshLambertMaterial({ color: '#ff00ff' });
        mat.userData.base = new THREE.Color('#ff00ff');
        model.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat));
        vis.mats.push(mat);
      }
      model.scale.setScalar(scale);
      vis.body = model;
      vis.height = top * scale;
      root.add(model);
      if (opts.shadow !== false) root.add(makeShadow(0.4 * scale));
    }
    return root;
  }

  /** Release GPU resources of a visual made by makeVisual. */
  disposeVisual(root) {
    if (!root) return;
    this._live.delete(root);
    root.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) {
        if (o.material.map && !o.material.map.userData.shared) o.material.map.dispose();
        o.material.dispose();
      }
    });
    root.removeFromParent();
  }
}

function makeShadow(r) {
  const { geom, mat } = getShadow(r);
  const m = new THREE.Mesh(geom, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.renderOrder = 0;
  m.name = 'shadow';
  m.userData.pxSnap = true;
  return m;
}

function setFrame(vis, f) {
  vis.frame = f;
  if (!vis.tex) return;
  const G = vis.geom;
  let col, row, flip = vis.kind === 'sprite' && vis.facingLeft;
  const a = vis.anim && vis.anims?.[vis.anim];
  if (a && a.row >= 0 && vis.dirs) {
    // Directional sheet: column = frame, row = anim row + direction (west side mirrored from east).
    let i = vis.dirs.indexOf(vis.dir);
    flip = false;
    if (i < 0 && MIRROR[vis.dir]) { i = vis.dirs.indexOf(MIRROR[vis.dir]); flip = true; }
    col = Math.min(f, G.cols - 1);
    row = a.row + Math.max(0, i);
  } else if (a && a.row >= 0) {
    col = f; row = a.row;
  } else {
    col = f % G.cols; row = Math.floor(f / G.cols);
  }
  // Facing left mirrors the frame through its UVs: THREE.Sprite ignores a negative scale (its shader
  // uses the matrix column length), so flipping body.scale.x would not mirror anything.
  const u = G.fw / G.iw, v = G.fh / G.ih;
  vis.tex.repeat.x = (flip ? -1 : 1) * u;
  vis.tex.offset.x = (col + (flip ? 1 : 0)) * u;
  vis.tex.repeat.y = v;
  vis.tex.offset.y = 1 - (row + 1) * v;
}

function applyColor(vis, tint) {
  // Sprite colour = ambient tint, pushed toward the flash colour while flashing.
  for (const mat of vis.mats) {
    if (vis.kind === 'model') {
      const base = mat.userData.base;
      if (!base) continue;
      if (vis.flashT > 0) mat.color.copy(vis.flashColor);
      else mat.color.copy(base);
    } else {
      mat.color.copy(vis.baseColor).multiply(tint);
      if (vis.flashT > 0) mat.color.lerp(vis.flashColor, 0.85).multiplyScalar(2.2);
    }
  }
}

// ------------------------------------------------------------------ per-visual controls

/** Play a named animation from the manifest ("idle", "walk", "attack", "windup", "hurt", "death"). */
export function setAnim(root, name, restart = false) {
  const vis = root?.userData.vis;
  if (!vis || !vis.anims) return;
  if (!vis.anims[name]) name = vis.anims.idle ? 'idle' : Object.keys(vis.anims)[0];
  if (vis.anim === name && !restart) return;
  vis.anim = name;
  vis.animT = 0;
  setFrame(vis, vis.anims[name].frames[0]);
}

/** Does this visual have a real animation called `name` (not the idle fallback)? */
export function hasAnim(root, name) { return !!root?.userData.vis?.anims?.[name]; }

/** Seconds one pass of an animation takes at speed 1 (0 if missing). */
export function animLength(root, name) {
  const a = root?.userData.vis?.anims?.[name];
  return a ? a.frames.length / a.fps : 0;
}

/** The anim's `hit` frame as a fraction of its length (where the blow lands), or `fallback`. */
export function animHitFrac(root, name, fallback = 0.5) {
  const a = root?.userData.vis?.anims?.[name];
  return a && a.hit >= 0 ? (a.hit + 0.5) / a.frames.length : fallback;
}

/** Playback speed multiplier (e.g. an attack anim stretched to a wind-up time). */
export function setAnimSpeed(root, k) { const vis = root?.userData.vis; if (vis) vis.animSpeed = k; }

/** True once a non-looping use of the current animation has played through at least once. */
export function animDone(root) {
  const vis = root?.userData.vis;
  if (!vis || !vis.anims || !vis.anim) return true;
  const a = vis.anims[vis.anim];
  return vis.animT * a.fps >= a.frames.length;
}

/**
 * Face a world direction. Directional sheets pick one of 8 directions (with a little hysteresis so
 * diagonal movement doesn't flicker); strip sprites flip horizontally; models rotate.
 */
export function setFacing(root, dx, dz, snap = false) {
  const vis = root?.userData.vis;
  if (!vis || (dx === 0 && dz === 0)) return;
  if (vis.kind === 'sprite' && vis.dirs) {
    const ang = Math.atan2(dz, dx);
    const cur = vis.dir && DIR_VEC[vis.dir];
    if (cur && !snap) {
      // Keep the current direction while within 22.5° + 8° of it.
      let da = ang - Math.atan2(cur[1], cur[0]);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < Math.PI / 8 + 0.14) return;
    }
    const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    const d = DIR_ORDER[idx];
    if (d !== vis.dir) { vis.dir = d; setFrame(vis, vis.frame); }
  } else if (vis.kind === 'sprite') {
    const was = vis.facingLeft;
    if (Math.abs(dx) > 0.05) vis.facingLeft = dx < 0;
    if (vis.facingLeft !== was) setFrame(vis, vis.frame);
  } else if (vis.kind === 'model') {
    vis.body.rotation.y = Math.atan2(-dx, -dz);
  }
}

/** Brief colour flash (hits). */
export function flashVisual(root, color = '#ffffff', time = 0.1) {
  const vis = root?.userData.vis;
  if (!vis) return;
  vis.flashT = time;
  vis.flashColor.set(color);
}

/** Persistent multiplier colour, e.g. blue while slowed. Pass '#ffffff' to clear. */
export function setBaseColor(root, color) {
  const vis = root?.userData.vis;
  if (!vis) return;
  vis.baseColor.set(color);
  if (vis.kind === 'model') {
    for (const mat of vis.mats) {
      if (!mat.userData.base || mat.userData.emissive) continue;
      if (!mat.userData.orig) mat.userData.orig = mat.userData.base.clone();
      mat.userData.base.copy(mat.userData.orig).multiply(vis.baseColor);
    }
  }
}

export function setOpacity(root, a) {
  const vis = root?.userData.vis;
  if (!vis) return;
  vis.opacity = a;
  for (const mat of vis.mats) {
    mat.transparent = true;
    mat.opacity = a;
    if ('alphaTest' in mat && vis.kind !== 'model') mat.alphaTest = a < 1 ? 0.01 : 0.5;
  }
}

/** Status lights on placeholder props (red → green when activated). */
export function setStatus(root, color) {
  const vis = root?.userData.vis;
  if (!vis) return;
  for (const m of vis.statusParts) { m.material.color.set(color); m.material.userData.base?.set(color); }
}

export function updateVisual(root, dt) {
  const tint = TINT;
  const vis = root?.userData.vis;
  if (!vis) return;
  if (vis.anims && vis.anim) {
    const a = vis.anims[vis.anim];
    vis.animT += dt * (vis.animSpeed || 1);
    const i = Math.floor(vis.animT * a.fps);
    const f = a.frames[a.loop ? i % a.frames.length : Math.min(i, a.frames.length - 1)];
    if (f !== vis.frame) setFrame(vis, f);
  }
  if (vis.flashT > 0) {
    vis.flashT -= dt;
    applyColor(vis, tint);
    if (vis.flashT <= 0) { vis.flashT = 0; applyColor(vis, tint); }
  } else if (vis.kind === 'model' && vis._lastBase !== vis.baseColor.getHex()) {
    vis._lastBase = vis.baseColor.getHex();
    applyColor(vis, tint);
  } else if (vis.kind !== 'model' && vis._lastBase !== vis.baseColor.getHex()) {
    vis._lastBase = vis.baseColor.getHex();
    applyColor(vis, tint);
  }
}

