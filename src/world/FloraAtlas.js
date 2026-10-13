// One texture atlas holding every static world sprite the jungle draws in bulk: undergrowth (fol_*),
// trees (tree_*), ruins (ruin_*) and rocks/logs. Chunks reference atlas entries by family, so a whole
// chunk of foliage is a single draw call (src/world/JungleWorld.js).
//
// Families resolve to manifest sprites by name; a family with no art yet gets procedural placeholder
// sprites painted here (ordered-dither pixel art), so the world is always complete.

import * as THREE from 'three';
import { hash2 } from './noise.js';

const ATLAS = 2048;

// family → name patterns (first matching group wins; several sprites per family = variety)
export const FAMILIES = {
  fern: [/^fol_(fern|tall_?grass|heliconia|palm_?sapling|grass|fiddlehead|bromeliad|ginger|cycad|agave)/],
  thicket: [/^fol_(thicket|monstera|elephant|bamboo|shrub|bush|taro|dense)/],
  vine: [/^fol_(vine|tangle|liana|hanging)/],
  bramble: [/^fol_(bramble|thorn)/],
  debris: [/^dec_cut_leaves/],          // flat leaf litter where undergrowth was cut
  cutstump: [/^fol_cut_?stump/],
  mushroom: [/^fol_(mush|fung)/],
  boulder: [/^fol_(boulder|rock|rubble|stone)/],
  log: [/^fol_(log|rotten)/],
  stump: [/^fol_stump/],
  tree_kapok: [/^tree_(kapok|giant|buttress)/],
  tree_fig: [/^tree_(fig|strangler|banyan|broad|canopy)/],
  tree_palm: [/^tree_(palm)/],
  tree_dead: [/^tree_(dead|vine|twisted)/],
  tree_fern: [/^tree_(fern)/],
  tree_fallen: [/^tree_(fallen)/],
  ruin_wall: [/^ruin_(wall|broken_?wall|concrete)/],
  ruin_pillar: [/^ruin_(pillar|column)/],
  ruin_train: [/^ruin_(train|carriage|tram)/],
  ruin_greenhouse: [/^ruin_(greenhouse|frame)/],
  ruin_statue: [/^ruin_(statue|head)/],
  ruin_car: [/^ruin_(car|wreck|vehicle)/],
  ruin_mast: [/^ruin_(mast|radio|antenna|tower)/],
  ruin_stairs: [/^ruin_(stair|steps)/],
};
// Fallbacks between families when one has neither art nor a placeholder painter.
const ALIAS = { cutstump: 'stump', tree_fern: 'tree_palm', tree_fallen: 'log', ruin_stairs: 'ruin_wall', ruin_mast: 'ruin_pillar', ruin_greenhouse: 'ruin_pillar', vine: 'thicket', mushroom: 'fern' };

export class FloraAtlas {
  constructor(assets) {
    this.assets = assets;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS;
    this.g = this.canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.shelf = { x: 0, y: 0, h: 0 };
    this.families = {};
    this.byKey = {};
    for (const fam of Object.keys(FAMILIES)) this.families[fam] = [];
    // Real art first.
    const keys = Object.keys(assets.manifest || {}).sort();
    for (const key of keys) {
      const fam = Object.keys(FAMILIES).find((f) => FAMILIES[f].some((re) => re.test(key)));
      if (!fam) continue;
      const info = assets.spriteInfo(key);
      const def = assets.manifest[key];
      if (!info?.tex?.image || (def.flat && fam !== 'debris')) continue;
      const img = info.tex.image;
      const fw = def.fw || img.width / (def.frames || 1), fh = def.fh || img.height;
      // Flat decals lie on the ground entirely (anchor row 0 → no upright part).
      const e = def.flat ? this._add(img, 0, 0, fw, fh, fw / 2, 0)
        : this._add(img, 0, 0, fw, fh, def.anchor ? def.anchor[0] : fw / 2, def.anchor ? def.anchor[1] : fh - (def.anchorY || 0));
      if (!e) continue;
      e.key = key;
      this.families[fam].push(e);
      this.byKey[key] = e;
    }
    // Placeholders for empty families.
    for (const fam of Object.keys(FAMILIES)) {
      if (this.families[fam].length) continue;
      const painter = PAINTERS[fam];
      if (!painter) continue;
      for (let v = 0; v < 3; v++) {
        const c = painter(v);
        const e = this._add(c, 0, 0, c.width, c.height, c.ax ?? c.width / 2, c.ay ?? c.height);
        if (e) this.families[fam].push(e);
      }
    }
    for (const [fam, to] of Object.entries(ALIAS)) if (!this.families[fam].length) this.families[fam] = this.families[to];
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
  }

  _add(src, sx, sy, w, h, ax, ay) {
    const s = this.shelf;
    if (s.x + w + 1 > ATLAS) { s.x = 0; s.y += s.h + 1; s.h = 0; }
    if (s.y + h > ATLAS) { console.warn('flora atlas full'); return null; }
    this.g.drawImage(src, sx, sy, w, h, s.x, s.y, w, h);
    const e = { x: s.x, y: s.y, w, h, ax: Math.round(ax), ay: Math.round(ay) };
    s.x += w + 1;
    s.h = Math.max(s.h, h);
    return e;
  }

  /** Deterministic pick from a family. */
  pick(fam, a, b, c = 0) {
    const list = this.families[fam];
    if (!list?.length) return null;
    return list[Math.floor(hash2(a, b, c) * list.length) % list.length];
  }
}

// ------------------------------------------------------------------ placeholder painters

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Paint a cluster of shaded leaf blobs (light from the top-left) with a dark outline. */
function blobCanvas(w, h, blobs, ramp, seed, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const shade = new Float32Array(w * h).fill(-1);
  for (const [bx, by, rx, ry] of blobs) {
    for (let y = Math.floor(by - ry); y <= Math.ceil(by + ry); y++) {
      for (let x = Math.floor(bx - rx); x <= Math.ceil(bx + rx); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dx = (x + 0.5 - bx) / rx, dy = (y + 0.5 - by) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        // Lambert-ish: normal from the blob, light from the top-left.
        const nz = Math.sqrt(Math.max(0, 1 - d));
        const l = Math.max(0, -dx * 0.55 - dy * 0.65 + nz * 0.55) + hash2(x, y, seed) * 0.18;
        shade[y * w + x] = Math.max(shade[y * w + x], l);
      }
    }
  }
  const outline = opts.outline || '#0b140d';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = shade[y * w + x];
      if (v < 0) {
        // Outline where a neighbour is filled.
        const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && shade[yy * w + xx] >= 0;
        if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) { g.fillStyle = outline; g.fillRect(x, y, 1, 1); }
        continue;
      }
      const t = Math.max(0, Math.min(0.999, v * 0.95 + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.25));
      g.fillStyle = ramp[Math.floor(t * ramp.length)];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

const GREEN = ['#0f2414', '#163319', '#1f4420', '#2a5628', '#376a30', '#4b8139', '#62983f'];
const DARKGREEN = ['#0c1c10', '#122916', '#19361b', '#224522', '#2d5629', '#3b6a31'];
const GREY = ['#22262a', '#2e3438', '#3c4347', '#4c5457', '#5e6668', '#737b7a'];
const BARK = ['#1e140e', '#2a1c13', '#382618', '#47321f', '#583f27'];

function rnd(v, i, s = 0) { return hash2(v * 31 + i, s, 4242); }

const PAINTERS = {
  fern(v) {
    const w = 36, h = 30;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const fronds = 7 + v;
    for (let f = 0; f < fronds; f++) {
      const a = -Math.PI * (0.08 + 0.84 * (f + rnd(v, f) * 0.6) / fronds);
      const len = 12 + rnd(v, f + 9) * 6;
      for (let s = 0; s < len; s++) {
        const k = s / len;
        const x = Math.round(w / 2 + Math.cos(a) * s), y = Math.round(h - 2 + Math.sin(a) * s * 1.1 + k * k * 6);
        g.fillStyle = GREEN[Math.min(6, 2 + Math.floor((1 - k) * 2 + (Math.cos(a) < 0 ? 2 : 0)))];
        g.fillRect(x, y, 1, 1);
        if (s % 2 === 0 && s > 2) {
          g.fillStyle = GREEN[3 + (s % 3)];
          g.fillRect(x - 1, y + 1, 1, 1);
          g.fillRect(x + 1, y + 1, 1, 1);
        }
      }
    }
    return c;
  },
  thicket(v) {
    const w = 48, h = 44, blobs = [];
    for (let i = 0; i < 9; i++) blobs.push([10 + rnd(v, i) * 28, 12 + rnd(v, i + 20) * 24, 7 + rnd(v, i + 40) * 6, 6 + rnd(v, i + 60) * 5]);
    blobs.push([24, h - 9, 18, 8]);
    return blobCanvas(w, h, blobs, v === 1 ? DARKGREEN : GREEN, v + 3);
  },
  bramble(v) {
    const w = 44, h = 34, blobs = [];
    for (let i = 0; i < 7; i++) blobs.push([8 + rnd(v, i) * 28, 10 + rnd(v, i + 20) * 18, 6 + rnd(v, i + 40) * 4, 5 + rnd(v, i + 60) * 4]);
    blobs.push([22, h - 8, 17, 7]);
    const c = blobCanvas(w, h, blobs, ['#1c0e12', '#2a1418', '#3a1c20', '#4a2428', '#5c2f2e'], v + 7, { outline: '#0c0608' });
    const g = c.getContext('2d');
    for (let k = 0; k < 26; k++) {
      const x = Math.floor(4 + rnd(v, k + 100) * (w - 8)), y = Math.floor(4 + rnd(v, k + 200) * (h - 8));
      g.fillStyle = k % 3 ? '#c23a3a' : '#e8d0a0';
      g.fillRect(x, y, 1, 1);
    }
    return c;
  },
  debris(v) {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 14;
    const g = c.getContext('2d');
    for (let k = 0; k < 18; k++) {
      g.fillStyle = GREEN[1 + (k % 4)];
      g.fillRect(Math.floor(2 + rnd(v, k) * 19), Math.floor(4 + rnd(v, k + 50) * 9), 2, 1);
    }
    g.fillStyle = BARK[3];
    g.fillRect(9, 7, 5, 3);
    g.fillStyle = '#9a8460';
    g.fillRect(9, 7, 5, 1);
    c.ay = 10;
    return c;
  },
  boulder(v) {
    const c = blobCanvas(40, 30, [[20, 18, 17, 11], [13 + v * 3, 12, 9, 7]], GREY, v + 11, { outline: '#101214' });
    const g = c.getContext('2d');
    for (let k = 0; k < 40; k++) { g.fillStyle = GREEN[2 + (k % 3)]; g.fillRect(Math.floor(6 + rnd(v, k) * 26), Math.floor(5 + rnd(v, k + 9) * 8), 2, 1); }
    c.ay = 27;
    return c;
  },
  log(v) {
    const c = blobCanvas(60, 24, [[30, 14, 27, 7]], BARK, v + 13, { outline: '#0e0907' });
    const g = c.getContext('2d');
    g.fillStyle = '#7a6040'; g.fillRect(55, 10, 3, 8);
    for (let k = 0; k < 30; k++) { g.fillStyle = GREEN[2 + (k % 4)]; g.fillRect(Math.floor(6 + rnd(v, k) * 46), Math.floor(7 + rnd(v, k + 9) * 3), 2, 1); }
    c.ay = 21;
    return c;
  },
  stump(v) {
    const c = blobCanvas(26, 24, [[13, 15, 10, 8]], BARK, v + 17, { outline: '#0e0907' });
    const g = c.getContext('2d');
    g.fillStyle = '#8a7050'; g.fillRect(6, 9, 14, 3);
    g.fillStyle = '#6a5438'; g.fillRect(9, 10, 8, 1);
    c.ay = 22;
    return c;
  },
  tree_kapok: (v) => treeCanvas(v, 120, 150, 26, 44, GREEN),
  tree_fig: (v) => treeCanvas(v + 3, 104, 128, 20, 36, DARKGREEN),
  tree_palm(v) {
    const w = 80, h = 120;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const bend = (v - 1) * 6;
    for (let y = 28; y < h; y++) {
      const k = (h - y) / h;
      const x = Math.round(w / 2 + bend * k * k);
      g.fillStyle = y % 6 < 2 ? BARK[1] : BARK[3];
      g.fillRect(x - 3, y, 6, 1);
      g.fillStyle = BARK[0]; g.fillRect(x - 4, y, 1, 1); g.fillRect(x + 3, y, 1, 1);
    }
    const tx = Math.round(w / 2 + bend), ty = 28;
    for (let f = 0; f < 9; f++) {
      const a = (f / 9) * Math.PI * 2 + v;
      for (let s = 0; s < 30; s++) {
        const x = Math.round(tx + Math.cos(a) * s), y = Math.round(ty + Math.sin(a) * s * 0.55 + (s * s) / 60);
        g.fillStyle = GREEN[Math.max(1, 5 - Math.floor(s / 8) - (Math.sin(a) > 0 ? 1 : 0))];
        g.fillRect(x, y, 1, 2);
        if (s % 3 === 0) { g.fillStyle = GREEN[3]; g.fillRect(x, y + 2, 1, 2); }
      }
    }
    return c;
  },
  tree_dead: (v) => treeCanvas(v + 7, 88, 120, 14, 18, ['#14200f', '#1d2c14', '#2a3a1a', '#3a4a22']),
  ruin_wall(v) {
    const w = 96, h = 64;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const top = 14 + v * 4;
    for (let x = 4; x < w - 4; x++) {
      const broken = Math.floor(rnd(v, x >> 3) * 14);
      for (let y = top + broken; y < h - 2; y++) {
        const face = y > h - 22;
        g.fillStyle = face ? GREY[(x + y) % 7 === 0 ? 1 : 2] : GREY[y === top + broken ? 5 : 3 + ((x >> 3) + (y >> 3)) % 2];
        g.fillRect(x, y, 1, 1);
      }
    }
    g.fillStyle = GREY[0];
    for (let y = top + 12; y < h - 2; y += 8) g.fillRect(4, y, w - 8, 1);
    for (let k = 0; k < 120; k++) { g.fillStyle = GREEN[1 + (k % 5)]; g.fillRect(Math.floor(4 + rnd(v, k) * (w - 8)), Math.floor(top + 8 + rnd(v, k + 70) * (h - top - 10)), 2, 1 + (k % 3)); }
    return c;
  },
  ruin_pillar(v) {
    const w = 32, h = 80;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const top = 6 + v * 8;
    for (let y = top; y < h - 1; y++) for (let x = 8; x < 24; x++) { g.fillStyle = GREY[x < 12 ? 4 : x > 20 ? 1 : 3]; g.fillRect(x, y, 1, 1); }
    g.fillStyle = GREY[5]; g.fillRect(6, top, 20, 4);
    for (let k = 0; k < 60; k++) { g.fillStyle = GREEN[1 + (k % 5)]; g.fillRect(Math.floor(7 + rnd(v, k) * 18), Math.floor(top + rnd(v, k + 70) * (h - top)), 1, 2); }
    return c;
  },
  ruin_train(v) {
    const w = 160, h = 72;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const rust = ['#2a1a14', '#3d2418', '#55301c', '#6e4022', '#88532c'];
    for (let y = 12; y < h - 2; y++) for (let x = 4; x < w - 4; x++) {
      const side = y > 36;
      g.fillStyle = side ? rust[1 + ((x >> 4) % 2)] : rust[3 + ((x + y) % 9 === 0 ? 1 : 0)];
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = '#0e1414';
    for (let x = 12; x < w - 20; x += 22) g.fillRect(x, 42, 14, 10);
    for (let k = 0; k < 260; k++) { g.fillStyle = GREEN[1 + (k % 6)]; g.fillRect(Math.floor(4 + rnd(v, k) * (w - 8)), Math.floor(10 + rnd(v, k + 70) * (h - 14)), 2, 1 + (k % 4)); }
    return c;
  },
  ruin_statue(v) {
    const c = blobCanvas(84, 76, [[42, 42, 34, 30], [42, 22, 22, 16]], GREY, v + 21, { outline: '#101214' });
    const g = c.getContext('2d');
    g.fillStyle = '#121416'; g.fillRect(28, 34, 9, 4); g.fillRect(48, 34, 9, 4); g.fillRect(36, 54, 14, 3);
    for (let k = 0; k < 160; k++) { g.fillStyle = GREEN[1 + (k % 6)]; g.fillRect(Math.floor(10 + rnd(v, k) * 64), Math.floor(8 + rnd(v, k + 70) * 34), 2, 1 + (k % 3)); }
    c.ay = 72;
    return c;
  },
  ruin_car(v) {
    const c = blobCanvas(72, 44, [[36, 26, 32, 14], [34, 16, 18, 10]], ['#22140e', '#33201a', '#4a2c1e', '#623a24', '#7a4a2c'], v + 25, { outline: '#0e0907' });
    const g = c.getContext('2d');
    g.fillStyle = '#0f1414'; g.fillRect(22, 12, 10, 6); g.fillRect(36, 12, 10, 6);
    for (let k = 0; k < 120; k++) { g.fillStyle = GREEN[1 + (k % 6)]; g.fillRect(Math.floor(6 + rnd(v, k) * 60), Math.floor(6 + rnd(v, k + 70) * 30), 2, 1 + (k % 3)); }
    c.ay = 40;
    return c;
  },
};
PAINTERS.vine = PAINTERS.thicket;

function treeCanvas(v, w, h, trunkW, canopyR, ramp) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const cx = w / 2;
  // Trunk with buttress roots.
  for (let y = Math.floor(h * 0.42); y < h; y++) {
    const k = (y - h * 0.42) / (h * 0.58);
    const half = trunkW / 2 + (k > 0.8 ? (k - 0.8) * trunkW * 2.2 : 0);
    for (let x = Math.floor(cx - half); x < cx + half; x++) {
      const t = (x - (cx - half)) / (2 * half);
      g.fillStyle = BARK[t < 0.25 ? 4 : t > 0.75 ? 0 : 2 + ((x * 7 + y) % 11 === 0 ? 1 : 0)];
      g.fillRect(x, y, 1, 1);
    }
  }
  // Canopy: overlapping blobs painted onto a second canvas then composited.
  const blobs = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd(v, i) * Math.PI * 2, d = rnd(v, i + 9) * canopyR * 0.8;
    blobs.push([cx + Math.cos(a) * d, canopyR + 4 + Math.sin(a) * d * 0.6, canopyR * (0.45 + rnd(v, i + 30) * 0.3), canopyR * (0.38 + rnd(v, i + 40) * 0.25)]);
  }
  const can = blobCanvas(w, Math.min(h, Math.round(canopyR * 2.3 + 8)), blobs, ramp.length >= 6 ? ramp : GREEN, v + 31);
  g.drawImage(can, 0, 0);
  return c;
}
