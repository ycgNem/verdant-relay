// Bakes the jungle ground of one chunk (16 × 16 tiles → a 512 × 512 canvas, 1 texel = 1 screen pixel).
//
// No tile grid ever shows: each ground PIXEL picks its terrain level from the bilinear blend of the
// four surrounding grid-vertex levels plus noise, so borders between water, mud, trail dirt, leaf floor
// and moss wander organically. Then, in pixel-art fashion:
//   · every level samples its own seamless texture (128 × 128, PixelLab base tiles when available,
//     otherwise generated here with ordered dithering on hand-picked ramps)
//   · edges get a 1 px lit rim on their north side and a darker step on their south side (light from
//     the top-left), water gets a foam line
//   · ambient occlusion pools under trees, ruins and thickets (dithered, 3 steps)
//   · ground detail is scattered on top: dec_* sprites from the manifest, plus procedural leaf litter,
//     twigs, pebbles and flowers drawn texel by texel
// Canopy shade, sun dapples and colour grading are applied later, in screen space (src/core/PostFx.js).

import { LEVEL, BRUSH, JUNGLE } from '../data/jungle.js';
import { makeNoise, hash2 } from './noise.js';

export const CHUNK_PX = JUNGLE.chunk * 32;
const TEX = 128;   // texture period (texels)

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// Hand-picked ramps (dark → light) for the generated textures.
const RAMPS = {
  water: ['#0b2226', '#0f2f31', '#143d3b', '#1a4c46', '#215a50', '#2f6d5c'],
  mud: ['#1a120e', '#241913', '#2f2118', '#3b2a1e', '#4a3626', '#5a4430'],
  dirt: ['#2e2016', '#3b2a1c', '#4a3524', '#5a422d', '#6b5136', '#7d6142'],
  floor: ['#15140e', '#1d1c13', '#262418', '#302c1c', '#3b3521', '#474027'],
  moss: ['#122617', '#18321c', '#1f3f21', '#284f27', '#33602d', '#407337'],
  paving: ['#2a2d2b', '#353936', '#414642', '#4e544e', '#5b625a', '#6a7168'],
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Tileable value noise (period p) for seamless textures. */
function periodicNoise(seed, p) {
  const g = new Float32Array(p * p);
  for (let i = 0; i < p * p; i++) g[i] = hash2(i % p, Math.floor(i / p), seed);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = g[y0 * p + x0], b = g[y0 * p + x1], c = g[y1 * p + x0], d = g[y1 * p + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** A seamless TEX × TEX texture for a terrain kind, as RGBA bytes. */
function makeTexture(kind, seed) {
  const ramp = RAMPS[kind].map(hex);
  const out = new Uint8ClampedArray(TEX * TEX * 4);
  const octs = [4, 8, 16, 32].map((p, i) => periodicNoise(seed + i * 101, p));
  const fbm = (x, y) => {
    let s = 0, a = 1, n = 0;
    for (let i = 0; i < octs.length; i++) { const p = 4 << i; s += octs[i]((x / TEX) * p, (y / TEX) * p) * a; n += a; a *= 0.55; }
    return s / n;
  };
  const put = (x, y, c) => {
    const i = ((((y % TEX) + TEX) % TEX) * TEX + (((x % TEX) + TEX) % TEX)) * 4;
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
  };
  const rnd = (i) => hash2(i, seed, 77);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      let v = fbm(x, y);
      if (kind === 'water') v = v * 0.7 + Math.sin((y + fbm(x * 2, y) * 18) * 0.5) * 0.06 + 0.12;
      if (kind === 'paving') v = 0.35 + v * 0.45;
      const t = Math.max(0, Math.min(0.999, (v - 0.22) * 1.65 + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.22));
      put(x, y, ramp[Math.floor(t * ramp.length)]);
    }
  }
  // Material details, all wrapped so the texture stays seamless.
  if (kind === 'paving') {
    // Slabs: offset rows of ~20 × 14 texel stones, dark gaps with moss, a few cracks.
    const gap = hex('#1d201e'), moss = hex('#2a4a27'), lit = hex('#767d72');
    for (let row = 0; row < TEX / 16; row++) {
      const off = (row * 11) % 24;
      for (let x = 0; x < TEX; x++) {
        put(x, row * 16, (hash2(x, row, seed) < 0.35) ? moss : gap);
        if (hash2(x, row, seed + 5) < 0.6) put(x, row * 16 + 1, lit);
      }
      for (let k = 0; k * 24 < TEX; k++) {
        const x = k * 24 + off;
        for (let y = 1; y < 16; y++) put(x, row * 16 + y, hash2(k, y + row * 16, seed) < 0.3 ? moss : gap);
      }
    }
    for (let k = 0; k < 18; k++) {
      let x = Math.floor(rnd(k) * TEX), y = Math.floor(rnd(k + 50) * TEX);
      for (let s = 0; s < 6 + rnd(k + 9) * 10; s++) { put(x, y, gap); x += rnd(k * 31 + s) < 0.5 ? 1 : 0; y += 1; }
    }
  } else if (kind === 'dirt') {
    // Pebbles: 2–3 texel stones with a lit top-left.
    const dark = hex('#2a1d14'), stone = hex('#857059'), hi = hex('#a48d70');
    for (let k = 0; k < 70; k++) {
      const x = Math.floor(rnd(k) * TEX), y = Math.floor(rnd(k + 300) * TEX);
      put(x, y, stone); put(x + 1, y, stone); put(x, y - 1, hi); put(x + 1, y + 1, dark); put(x, y + 1, dark);
    }
  } else if (kind === 'floor') {
    // Leaf litter: tiny 2–4 texel leaves in rust, ochre and dead green.
    const cols = ['#5c3218', '#7a4a22', '#8a6a2e', '#4d4a22', '#3a2a16'].map(hex);
    for (let k = 0; k < 520; k++) {
      const x = Math.floor(rnd(k) * TEX), y = Math.floor(rnd(k + 900) * TEX);
      const c = cols[Math.floor(rnd(k + 1700) * cols.length)];
      const dir = rnd(k + 2500) < 0.5;
      put(x, y, c); put(x + (dir ? 1 : 0), y + (dir ? 0 : 1), c);
      if (rnd(k + 3300) < 0.5) put(x + (dir ? 2 : 1), y + 1, c);
    }
  } else if (kind === 'moss') {
    // Tufts: little bright stems.
    const lit = hex('#55893f'), tip = hex('#6fa24c'), dark = hex('#0f2213');
    for (let k = 0; k < 260; k++) {
      const x = Math.floor(rnd(k) * TEX), y = Math.floor(rnd(k + 600) * TEX);
      put(x, y, lit); put(x, y - 1, tip); put(x + 1, y + 1, dark);
    }
  } else if (kind === 'mud') {
    const wet = hex('#6b5640'), dark = hex('#120c09');
    for (let k = 0; k < 90; k++) {
      const x = Math.floor(rnd(k) * TEX), y = Math.floor(rnd(k + 400) * TEX);
      put(x, y, wet); put(x + 1, y, wet); put(x, y + 1, dark);
    }
  } else if (kind === 'water') {
    const glint = hex('#4f8f78'), deep = hex('#08191c');
    for (let k = 0; k < 80; k++) {
      const x = Math.floor(rnd(k) * TEX), y = Math.floor(rnd(k + 400) * TEX);
      const n = 2 + Math.floor(rnd(k + 800) * 4);
      for (let s = 0; s < n; s++) put(x + s, y, glint);
      put(x + 1, y + 1, deep);
    }
  }
  return out;
}

export class TerrainBaker {
  /**
   * @param world  JungleGen world data
   * @param assets the game's Assets (manifest sprites: dec_* ground decals, terrain art if present)
   * @param terrainArt optional { [kind]: ImageData-like {data, w, h} } base textures from public/terrain
   */
  constructor(world, assets, terrainArt = null) {
    this.world = world;
    this.assets = assets;
    this.noise = makeNoise(world.seed ^ 0x5bd1e995);
    this.tex = {};
    for (const kind of ['water', 'mud', 'dirt', 'floor', 'moss', 'paving']) {
      const art = terrainArt?.[kind];
      this.tex[kind] = art ? tileArt(art) : { data: makeTexture(kind, (world.seed + kind.length * 977) >>> 0), w: TEX, h: TEX };
    }
    this.decals = this._collectDecals();
    // Per-pixel blend noise: a 256 × 256 tileable field mixing two frequencies (edges wander at the
    // tile scale, with small bites at the 3–4 texel scale).
    const n1 = periodicNoise(world.seed ^ 0x1234, 16), n2 = periodicNoise(world.seed ^ 0x9876, 64);
    const amp = world.blendAmp ?? 1;   // the night map uses tighter edges so lanes stay readable
    this.blend = new Float32Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      this.blend[y * 256 + x] = ((n1(x / 16, y / 16) - 0.5) * 0.85 + (n2(x / 4, y / 4) - 0.5) * 0.45) * amp;
    }
  }

  _collectDecals() {
    // Group dec_* sprites by what they suit (matched from their names).
    const A = this.assets;
    const groups = { floor: [], moss: [], dirt: [], mud: [], water: [] };
    for (const key of Object.keys(A.manifest || {})) {
      if (!key.startsWith('dec_')) continue;
      const info = A.spriteInfo(key);
      if (!info?.tex?.image) continue;
      const k = key.toLowerCase();
      const img = info.tex.image;
      const entry = { key, img };
      if (/lily|reed/.test(k)) groups.water.push(entry);
      else if (/puddle|root/.test(k)) { groups.mud.push(entry); groups.floor.push(entry); }
      else if (/pebble|stone|twig|bone/.test(k)) { groups.dirt.push(entry); groups.floor.push(entry); }
      else if (/flower|moss|tuft|fung|mush/.test(k)) { groups.moss.push(entry); groups.floor.push(entry); }
      else { groups.floor.push(entry); groups.moss.push(entry); }
    }
    return groups;
  }

  /** Level (and paving flag) of a texel in world texel coordinates. */
  _levelAt(wx, wy) {
    const W = this.world.size, V = W + 1, L = this.world.level;
    const tx = Math.min(W - 1, Math.max(0, wx >> 5)), ty = Math.min(W - 1, Math.max(0, wy >> 5));
    const fx = (wx & 31) / 32 + 1 / 64, fy = (wy & 31) / 32 + 1 / 64;
    const i = ty * V + tx;
    const a = L[i], b = L[i + 1], c = L[i + V], d = L[i + V + 1];
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
    let f = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    if (hi !== lo) f += this.blend[((wy & 255) << 8) | (wx & 255)];
    let lv = Math.round(f);
    if (lv < lo) lv = lo; else if (lv > hi) lv = hi;
    let pave = false;
    if (lv === LEVEL.dirt) {
      const P = this.world.pave;
      const p = (P[i] * (1 - fx) + P[i + 1] * fx) * (1 - fy) + (P[i + V] * (1 - fx) + P[i + V + 1] * fx) * fy;
      pave = p + this.blend[(((wy + 97) & 255) << 8) | ((wx + 31) & 255)] * 0.7 > 0.5;
    }
    return pave ? 5 : lv;
  }

  /** Bake chunk (cx, cz) into a canvas (reuses `canvas` if given). */
  bake(cx, cz, canvas) {
    const P = CHUNK_PX, B = P + 2;
    const c = canvas || document.createElement('canvas');
    c.width = P; c.height = P;
    const g = c.getContext('2d', { willReadFrequently: true });
    const ox = cx * P, oy = cz * P;
    // Pass 1: level per texel (with a 1-texel border for edge tests).
    const lv = new Uint8Array(B * B);
    for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) lv[y * B + x] = this._levelAt(ox + x - 1, oy + y - 1);
    // Ambient occlusion field at 4 texels per cell.
    const ao = this._aoField(cx, cz);
    const AOW = P / 4 + 1;
    // Pass 2: texture + edges + AO.
    const img = g.createImageData(P, P);
    const D = img.data;
    const kinds = ['water', 'mud', 'dirt', 'floor', 'moss', 'paving'];
    const texs = kinds.map((k) => this.tex[k]);
    const order = [0, 1, 2, 3, 4, 2];   // height order of each kind (paving sits at dirt height)
    const foam = hex('#5f9a86');
    for (let y = 0; y < P; y++) {
      for (let x = 0; x < P; x++) {
        const k = lv[(y + 1) * B + x + 1];
        const t = texs[k];
        const wx = ox + x, wy = oy + y;
        const si = ((wy % t.h) * t.w + (wx % t.w)) * 4;
        let r = t.data[si], gg = t.data[si + 1], b = t.data[si + 2];
        const h = order[k];
        const up = order[lv[y * B + x + 1]], down = order[lv[(y + 2) * B + x + 1]];
        const left = order[lv[(y + 1) * B + x]], right = order[lv[(y + 1) * B + x + 2]];
        let m = 1;
        if (k === 0 && (up > 0 || left > 0 || right > 0 || down > 0)) { r = foam[0]; gg = foam[1]; b = foam[2]; }
        else if (up < h) m = 1.22;                       // lit north rim of higher ground
        else if (down < h) m = 0.62;                     // shaded south step
        else if (left < h && h > 1) m = 1.1;
        else if (right < h && h > 1) m = 0.8;
        else if (up > h && h > 0) m = 0.78;              // shadow cast by the higher ground just north
        // AO (dithered into 3 steps).
        const ax = x >> 2, ay = y >> 2;
        const fx = (x & 3) / 4, fy = (y & 3) / 4;
        const av = (ao[ay * AOW + ax] * (1 - fx) + ao[ay * AOW + ax + 1] * fx) * (1 - fy) + (ao[(ay + 1) * AOW + ax] * (1 - fx) + ao[(ay + 1) * AOW + ax + 1] * fx) * fy;
        const step = Math.floor(Math.min(0.99, av) * 3 + BAYER4[(y & 3) * 4 + (x & 3)] - 0.5 + 0.5);
        m *= 1 - Math.max(0, step) * 0.16;
        const o = (y * P + x) * 4;
        D[o] = r * m; D[o + 1] = gg * m; D[o + 2] = b * m; D[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // Pass 3: ground detail.
    this._scatter(g, cx, cz, lv, B);
    return c;
  }

  _aoField(cx, cz) {
    const P = CHUNK_PX, N = P / 4 + 1;
    const ao = new Float32Array(N * N);
    const W = this.world.size;
    const x0 = cx * JUNGLE.chunk, z0 = cz * JUNGLE.chunk;
    const add = (x, z, r, s) => {
      // (x, z) in tiles; cells are 1/8 tile.
      const gx = (x - x0) * 8, gz = (z - z0) * 8, gr = r * 8;
      for (let j = Math.max(0, Math.floor(gz - gr)); j <= Math.min(N - 1, Math.ceil(gz + gr)); j++) {
        for (let i = Math.max(0, Math.floor(gx - gr)); i <= Math.min(N - 1, Math.ceil(gx + gr)); i++) {
          const d = Math.hypot((i - gx) / gr, ((j - gz) / gr) * 1.4);
          if (d < 1) ao[j * N + i] += s * (1 - d * d);
        }
      }
    };
    for (let z = z0 - 2; z < z0 + JUNGLE.chunk + 2; z++) {
      for (let x = x0 - 2; x < x0 + JUNGLE.chunk + 2; x++) {
        if (x < 0 || z < 0 || x >= W || z >= W) continue;
        const b = this.world.brushNow ? this.world.brushNow(x, z) : this.world.brush[z * W + x];
        if (b >= BRUSH.thicket) add(x + 0.5, z + 0.6, 1.0, 0.55);
        else if (b === BRUSH.fern) add(x + 0.5, z + 0.6, 0.7, 0.25);
      }
    }
    for (const o of this.world.objects) {
      if (o.x < x0 - 6 || o.x > x0 + JUNGLE.chunk + 6 || o.z < z0 - 6 || o.z > z0 + JUNGLE.chunk + 6) continue;
      if (o.kind === 'tree') add(o.x, o.z + 0.1, o.big ? 2.6 : 1.7, o.big ? 0.75 : 0.6);
      else if (o.kind === 'ruin') add(o.x, o.z + 0.2, 2.2, 0.6);
      else add(o.x, o.z + 0.1, 0.9, 0.5);
    }
    return ao;
  }

  _scatter(g, cx, cz, lv, B) {
    const P = CHUNK_PX;
    const seed = this.world.seed;
    const n = 70;
    const kindName = ['water', 'mud', 'dirt', 'floor', 'moss', 'dirt'];
    // Sprite decals.
    for (let k = 0; k < n; k++) {
      const x = Math.floor(hash2(cx * 131 + k, cz, seed) * P), y = Math.floor(hash2(cx, cz * 131 + k, seed + 1) * P);
      const kind = kindName[lv[(y + 1) * B + x + 1]];
      const list = this.decals[kind];
      if (!list?.length || hash2(k, cx + cz * 99, seed + 2) < 0.35) continue;
      const d = list[Math.floor(hash2(k, cz * 7 + cx, seed + 3) * list.length)];
      g.drawImage(d.img, Math.round(x - d.img.width / 2), Math.round(y - d.img.height / 2));
    }
    // Procedural detail: fallen leaves, twigs, flowers (texel-level), denser on the leaf floor.
    const leafCols = ['#6b3a1f', '#8a5a2b', '#9a7a32', '#5a5a26', '#a3472a'];
    const flowerCols = ['#e4a3c8', '#f2d06b', '#e8e0d0', '#d65a4a'];
    for (let k = 0; k < 420; k++) {
      const x = Math.floor(hash2(cx * 977 + k, cz * 13, seed + 9) * P), y = Math.floor(hash2(cx * 31, cz * 977 + k, seed + 10) * P);
      const l = lv[(y + 1) * B + x + 1];
      const r = hash2(k, cx * 5 + cz, seed + 11);
      if (l === LEVEL.floor || (l === LEVEL.dirt && r < 0.3)) {
        g.fillStyle = leafCols[Math.floor(r * 997) % leafCols.length];
        const vert = (k & 1) === 0;
        g.fillRect(x, y, vert ? 1 : 2, vert ? 2 : 1);
        if (r < 0.25) { g.fillStyle = '#1a140c'; g.fillRect(x + 1, y + 1, 1, 1); }
      } else if (l === LEVEL.moss && r < 0.18) {
        g.fillStyle = flowerCols[Math.floor(r * 9973) % flowerCols.length];
        g.fillRect(x, y, 1, 1);
        g.fillStyle = '#2f5a2a';
        g.fillRect(x, y + 1, 1, 1);
      } else if (l === LEVEL.dirt && r < 0.45) {
        // Twig.
        g.fillStyle = '#2a1c12';
        const len = 3 + Math.floor(r * 10) % 4;
        for (let s = 0; s < len; s++) g.fillRect(x + s, y + ((s * 3 + k) % 5 === 0 ? 1 : 0), 1, 1);
      }
    }
  }
}

/** Repeat a PixelLab base tile into a TEX-sized texture with mirrored quadrants so it doesn't grid. */
function tileArt(art) {
  const out = new Uint8ClampedArray(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const qx = Math.floor(x / art.w), qy = Math.floor(y / art.h);
    let sx = x % art.w, sy = y % art.h;
    if (hash2(qx, qy, 5) < 0.5) sx = art.w - 1 - sx;
    if (hash2(qx, qy, 6) < 0.5) sy = art.h - 1 - sy;
    const si = (sy * art.w + sx) * 4, o = (y * TEX + x) * 4;
    out[o] = art.data[si]; out[o + 1] = art.data[si + 1]; out[o + 2] = art.data[si + 2]; out[o + 3] = 255;
  }
  return { data: out, w: TEX, h: TEX };
}
