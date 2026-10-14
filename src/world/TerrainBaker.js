// Bakes the jungle ground of one chunk (16 × 16 tiles → a 512 × 512 canvas, 1 texel = 1 screen pixel).
//
// No tile grid ever shows: each ground PIXEL picks its terrain level from the bilinear blend of the
// four surrounding grid-vertex levels plus noise, so borders between water, mud, trail dirt, leaf floor
// and moss wander organically. Then, in pixel-art fashion:
//   · every level samples its own seamless texture (128 × 128, PixelLab base tiles when available,
//     otherwise generated here with ordered dithering on hand-picked ramps)
//   · edges get a 1 px lit rim on their north side and a darker step on their south side (light from
//     the top-left), water gets a foam line; deep (impassable) water is darker, fords get stepping stones
//   · ambient occlusion pools under trees, ruins and thickets (dithered, 3 steps)
//   · ground detail is scattered on top: dec_* sprites from the manifest, plus procedural leaf litter,
//     twigs, pebbles and flowers drawn texel by texel
//   · ruin paving is broken up so its 32-px slab motif never reads as a grid (PAVING, critic F #13):
//     world-space noise blobs that ignore tile borders punch out missing slabs (soil showing, shadowed
//     north lip, lit south edge), spread moss over the stone and stain it; then cracks and rubble.
// Canopy shade, sun dapples and colour grading are applied later, in screen space (src/core/PostFx.js).

import { LEVEL, BRUSH, JUNGLE, PAVING, GROUND, TERRAIN_VALUE, DECALS, REGION_LOOK, EMISSIVE } from '../data/jungle.js';
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
    // The jungle (not the night map's stand-in world): value lift on paths, district decal sets.
    this.jungle = !!world.region;
    this.decals = this._collectDecals();
    this._decalPx = new Map();   // decal key -> ImageData (emissive marking)
    this._candMemo = new Map();  // chunk -> decal candidates (_decalCands)
    this.paveNoise = makeNoise((world.seed ^ 0x2c1b3c6d) >>> 0);
    // Ruin slabs (critic G #9): with PixelLab paving art, stone is sampled per slab in world space —
    // staggered rows, a random flip/rotation per slab, only some slabs keep the star motif, and a
    // per-slab + large-scale colour shift — instead of one 32-px tile repeating in a grid.
    const pa = terrainArt?.paving;
    this.slabs = pa && pa.w === 32 && pa.h === 32 ? makeSlabs(pa) : null;
    this._slabMemo = new Map();
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
      const name = k.slice(4);
      let w = 1;
      for (const [frag, mul] of Object.entries(DECALS.weight)) if (name.includes(frag)) w *= mul;
      if (w <= 0) continue;   // weight 0: never scattered (the crossed-twig "X", critic H2 §1)
      const emit = Object.entries(EMISSIVE.decals).find(([frag]) => name.includes(frag));
      const entry = { key, img, name, w, emit: emit ? emit[1] : 0 };
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
    const pf = this._paveField(cx, cz);
    // Paving state of texel (x, y) (chunk coords, may be -1 / P): 0 stone, 1 missing slab, 2 moss.
    const PV = PAVING;
    const paveAt = (x, y) => {
      if (y < -1) y = -1;   // (the level border is one texel wide)
      if (lv[(y + 1) * B + x + 1] !== 5) return -1;
      const xx = Math.max(0, Math.min(P - 1, x)), yy = Math.max(0, Math.min(P - 1, y));
      const ax = xx >> 2, ay = yy >> 2, fx = (xx & 3) / 4, fy = (yy & 3) / 4;
      const j = this.blend[(((oy + y) & 255) << 8) | ((ox + x) & 255)] * PV.edgeNoise;
      const lerp = (F) => (F[ay * AOW + ax] * (1 - fx) + F[ay * AOW + ax + 1] * fx) * (1 - fy) + (F[(ay + 1) * AOW + ax] * (1 - fx) + F[(ay + 1) * AOW + ax + 1] * fx) * fy;
      if (lerp(pf.hole) + j > PV.hole) return 1;
      if (lerp(pf.moss) + j + (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * PV.mossDither > PV.moss) return 2;
      return 0;
    };
    // Pass 2: texture + edges + AO.
    const img = g.createImageData(P, P);
    const D = img.data;
    const kinds = ['water', 'mud', 'dirt', 'floor', 'moss', 'paving'];
    const texs = kinds.map((k) => this.tex[k]);
    const order = [0, 1, 2, 3, 4, 2];   // height order of each kind (paving sits at dirt height)
    const foam = hex('#5f9a86');
    // Deep water (impassable, world.deep): a darker channel with a pale ledge line along its edge.
    const deep = this.world.deep, W = this.world.size;
    const deepTile = (tx, tz) => (tx < 0 || tz < 0 || tx >= W || tz >= W ? 0 : deep[tz * W + tx]);
    const deepAt = (wx, wy) => {
      const fx = (wx + 0.5) / 32 - 0.5, fy = (wy + 0.5) / 32 - 0.5;
      const ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
      return (deepTile(ix, iy) * (1 - u) + deepTile(ix + 1, iy) * u) * (1 - v) + (deepTile(ix, iy + 1) * (1 - u) + deepTile(ix + 1, iy + 1) * u) * v;
    };
    const isDeep = (wx, wy) => deepAt(wx, wy) + this.blend[(wy & 255) * 256 + (wx & 255)] * 0.35 > 0.5;
    const ledge = hex('#2f6d64');
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
        let paved = false;
        if (k === 5) {
          const pv = paveAt(x, y);
          if (pv === 1) {
            // Missing slab: soil shows through; the slab edge north of it casts a 2-texel shadow.
            const ft = this.tex.floor, fi = ((wy % ft.h) * ft.w + (wx % ft.w)) * 4;
            r = ft.data[fi]; gg = ft.data[fi + 1]; b = ft.data[fi + 2];
            m = paveAt(x, y - 1) !== 1 || paveAt(x, y - 2) !== 1 ? 0.45 : 0.8;
            paved = true;
          } else {
            if (pv === 2) {
              const mt = this.tex.moss, mi = ((wy % mt.h) * mt.w + (wx % mt.w)) * 4;
              r = mt.data[mi]; gg = mt.data[mi + 1]; b = mt.data[mi + 2];
            } else {
              if (this.slabs) { const sl = this._slab(wx, wy); r = sl[0]; gg = sl[1]; b = sl[2]; }
              // Stains: low-frequency discolouration in 2 dithered steps (crosses slab borders).
              const ax = x >> 2, ay = y >> 2;
              const st = pf.stain[ay * AOW + ax];
              const q = Math.floor(st * 2 + BAYER4[(y & 3) * 4 + (x & 3)]);
              const f = q <= 0 ? 1 - PV.stain : q >= 2 ? 1 + PV.stain * 0.5 : 1;
              r *= f; gg *= f * (q <= 0 ? 1.04 : 1); b *= f * (q <= 0 ? 0.92 : 1);
              if (this.jungle) { r *= TERRAIN_VALUE.paving; gg *= TERRAIN_VALUE.paving; b *= TERRAIN_VALUE.paving; }
            }
            if (paveAt(x, y - 1) === 1) { m = 1.3; paved = true; }   // lit broken edge south of a hole
          }
        }
        // Value structure (critic H #2): the paths (dirt trails, paving stone) a step lighter than the floor around.
        if (this.jungle && k === LEVEL.dirt) m *= TERRAIN_VALUE.dirt;
        if (paved) { /* hole shading done */ }
        else if (k === 0 && (up > 0 || left > 0 || right > 0 || down > 0)) { r = foam[0]; gg = foam[1]; b = foam[2]; }
        else if (k === 0 && deep) {
          // A crisp drop-off: the deep channel darker and bluer, a pale ledge line on the shallow side of its edge.
          if (isDeep(wx, wy)) { m = GROUND.deepTint; b *= 1.12; }
          else if (isDeep(wx, wy + 1) || isDeep(wx, wy - 1) || isDeep(wx + 1, wy) || isDeep(wx - 1, wy)) { r = ledge[0]; gg = ledge[1]; b = ledge[2]; }
        }
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
    if (this.world.ford) this._fordStones(D, cx, cz, lv, B);
    g.putImageData(img, 0, 0);
    // Pass 3: ground detail.
    this._scatter(g, cx, cz, lv, B);
    this._ruinDetail(g, cx, cz, lv, B, paveAt);
    this._markEmissive(g);
    return c;
  }

  /** Stone colour of world texel (wx, wy) from the slab bank (PAVING.slab): [r, g, b]. */
  _slab(wx, wy) {
    const S = PAVING.slab, seed = this.world.seed;
    const row = wy >> 5;
    const sx = wx + (S.stagger ? Math.floor(hash2(row, 7, seed + 10) * 32) : 0);
    const col = sx >> 5;
    const key = col * 8192 + row;
    let m = this._slabMemo.get(key);
    if (!m) {
      if (this._slabMemo.size > 4096) this._slabMemo.clear();
      // Large-scale drift (a few slabs wide) + per-slab jitter; warm ↔ cool on the same axis.
      const big = this.paveNoise.fbm(col * S.tintScale + 311.7, row * S.tintScale - 52.3, 2) - 0.5;
      const k = 1 + (hash2(col, row, seed + 11) - 0.5) * 2 * S.jitter + big * S.drift;
      const w = big * S.warm * 2;
      m = {
        data: this.slabs[hash2(col, row, seed + 12) < S.star ? 0 : 1],
        tf: Math.floor(hash2(col, row, seed + 13) * 8),
        kr: k * (1 + w), kg: k, kb: k * (1 - w),
      };
      this._slabMemo.set(key, m);
    }
    let lx = sx & 31, ly = wy & 31;
    if (m.tf & 1) lx = 31 - lx;
    if (m.tf & 2) ly = 31 - ly;
    if (m.tf & 4) { const t = lx; lx = ly; ly = t; }
    const i = (ly * 32 + lx) * 4, D = m.data, o = this._slabOut || (this._slabOut = [0, 0, 0]);
    o[0] = D[i] * m.kr; o[1] = D[i + 1] * m.kg; o[2] = D[i + 2] * m.kb;
    return o;
  }

  /** Low-frequency fields for broken paving at 4 texels per cell: { hole, moss, stain } (0..1). */
  _paveField(cx, cz) {
    const P = CHUNK_PX, N = P / 4 + 1, n = this.paveNoise, sc = PAVING.scale;
    const hole = new Float32Array(N * N), moss = new Float32Array(N * N), stain = new Float32Array(N * N);
    const x0 = cx * JUNGLE.chunk, z0 = cz * JUNGLE.chunk;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 + i / 8, z = z0 + j / 8;
      hole[j * N + i] = n.fbm(x * sc, z * sc, 3);
      moss[j * N + i] = n.fbm(x * sc * 0.8 + 71.3, z * sc * 0.8 - 17.9, 3);
      stain[j * N + i] = n.fbm(x * sc * 1.6 - 40.1, z * sc * 1.6 + 93.7, 2);
    }
    return { hole, moss, stain };
  }

  /**
   * Glowing decals (EMISSIVE.decals: glow fungus, blue mushrooms): their bright texels get canvas alpha
   * EMISSIVE.groundAlpha (< 0.9), which the ground material turns into PostFx's emissive code, so they keep
   * glowing in the shade and at night. Only texels of the decal that are bright enough (value >= its threshold).
   */
  _markEmissive(g) {
    const list = this._emissive || [];
    if (!list.length) return;
    const P = CHUNK_PX, A = EMISSIVE.groundAlpha;
    for (const { d, x, y } of list) {
      let src = this._decalPx.get(d.key);
      if (!src) {
        const c = document.createElement('canvas');
        c.width = d.img.width; c.height = d.img.height;
        const cg = c.getContext('2d', { willReadFrequently: true });
        cg.drawImage(d.img, 0, 0);
        src = cg.getImageData(0, 0, c.width, c.height);
        this._decalPx.set(d.key, src);
      }
      const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(P, x + src.width), y1 = Math.min(P, y + src.height);
      if (x1 <= x0 || y1 <= y0) continue;
      const dst = g.getImageData(x0, y0, x1 - x0, y1 - y0);
      let any = false;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const si = ((yy - y) * src.width + (xx - x)) * 4;
        if (src.data[si + 3] < 128) continue;
        const v = Math.max(src.data[si], src.data[si + 1], src.data[si + 2]) / 255;
        if (v < d.emit) continue;
        dst.data[((yy - y0) * (x1 - x0) + (xx - x0)) * 4 + 3] = A;
        any = true;
      }
      if (any) g.putImageData(dst, x0, y0);
    }
    this._emissive = null;
  }

  /** Cracks and rubble on ruin paving (texel-level, deterministic per chunk). */
  _ruinDetail(g, cx, cz, lv, B, paveAt) {
    const P = CHUNK_PX, seed = this.world.seed;
    const stone = (x, y) => x >= 0 && y >= 0 && x < P && y < P && paveAt(x, y) === 0;
    // Cracks: wandering 1-texel dark lines with a lit texel beside them, often across slab borders.
    for (let k = 0, made = 0; k < PAVING.cracks * 8 && made < PAVING.cracks; k++) {
      let x = Math.floor(hash2(cx * 53 + k, cz, seed + 41) * P), y = Math.floor(hash2(cx, cz * 53 + k, seed + 42) * P);
      if (!stone(x, y)) continue;
      made++;
      const len = 8 + Math.floor(hash2(k, cx + cz, seed + 43) * 22);
      let dx = hash2(k, 1, seed + 44) < 0.5 ? 1 : -1;
      for (let s = 0; s < len; s++) {
        if (!stone(x, y)) break;
        g.fillStyle = '#1b1d1c'; g.fillRect(x, y, 1, 1);
        if (stone(x + 1, y)) { g.fillStyle = '#7a8176'; g.fillRect(x + 1, y, 1, 1); }
        const r = hash2(k * 97 + s, cx * 7 + cz, seed + 45);
        if (r < 0.45) y += 1; else if (r < 0.85) x += dx; else { x += dx; y += 1; }
        if (r > 0.97) dx = -dx;
      }
    }
    // Rubble: 2–4 texel concrete chips, lit top-left, dark bottom-right.
    for (let k = 0, made = 0; k < PAVING.rubble * 8 && made < PAVING.rubble; k++) {
      const x = Math.floor(hash2(cx * 71 + k, cz, seed + 51) * P), y = Math.floor(hash2(cx, cz * 71 + k, seed + 52) * P);
      if (lv[(y + 1) * B + x + 1] !== 5) continue;
      made++;
      const w = 2 + Math.floor(hash2(k, 3, seed + 53) * 3), h = 1 + Math.floor(hash2(k, 4, seed + 54) * 2);
      g.fillStyle = '#121413'; g.fillRect(x + 1, y + 1, w, h);
      g.fillStyle = '#5b625a'; g.fillRect(x, y, w, h);
      g.fillStyle = '#878f83'; g.fillRect(x, y, w - 1, 1);
    }
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

  /** Stepping stones across the fords (world.ford): 1–2 flat stones per tile, on water texels only. */
  _fordStones(D, cx, cz, lv, B) {
    const P = CHUNK_PX, C = JUNGLE.chunk, W = this.world.size, F = this.world.ford;
    const ramp = ['#1d2423', '#4f5047', '#6b6a5b', '#8a8571', '#aaa28a'].map(hex);
    for (let tz = cz * C; tz < cz * C + C; tz++) for (let tx = cx * C; tx < cx * C + C; tx++) {
      if (!F[tz * W + tx]) continue;
      const n = hash2(tx, tz, 501) < 0.55 ? 2 : 1;
      for (let s = 0; s < n; s++) {
        const sx = (tx - cx * C) * 32 + 8 + (s ? 14 : 0) + Math.floor(hash2(tx, tz, 510 + s) * 10), sy = (tz - cz * C) * 32 + 7 + Math.floor(hash2(tx, tz, 520 + s) * 18);
        if (lv[(sy + 1) * B + sx + 1] !== 0) continue;
        const rx = 5 + Math.floor(hash2(tx, tz, 530 + s) * 3), ry = 3 + Math.floor(hash2(tx, tz, 540 + s) * 2);
        for (let y = -ry - 1; y <= ry + 1; y++) for (let x = -rx - 1; x <= rx + 1; x++) {
          const px = sx + x, py = sy + y;
          if (px < 0 || py < 0 || px >= P || py >= P) continue;
          const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
          let c;
          if (d <= 1) c = ramp[Math.max(1, Math.min(4, 4 - Math.floor(((y + ry) / (2 * ry)) * 3) - (x > rx * 0.4 ? 1 : 0)))];
          else if (d <= 1.7 && y > 0) c = ramp[0];                                  // wet shadow under the stone
          else continue;
          const o = (py * P + px) * 4;
          D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2];
        }
      }
    }
  }

  /**
   * Decal candidates of chunk (cx, cz), deterministic (cached): position (world texels), a first and a backup
   * pick (weighted, districts favouring their own set: REGION_LOOK.decals) and a priority. Neighbouring chunks
   * read each other's candidates, so the spacing rule below holds across chunk borders in any bake order.
   */
  _decalCands(cx, cz) {
    const key = cz * 1000 + cx;
    let out = this._candMemo.get(key);
    if (out) return out;
    out = [];
    if (this._candMemo.size > 200) this._candMemo.clear();
    this._candMemo.set(key, out);
    const P = CHUNK_PX, seed = this.world.seed, W = this.world.size, keys = this.world.districts || [];
    const kindName = ['water', 'mud', 'dirt', 'floor', 'moss', 'dirt'];
    for (let k = 0; k < DECALS.perChunk; k++) {
      const x = Math.floor(hash2(cx * 131 + k, cz, seed) * P), y = Math.floor(hash2(cx, cz * 131 + k, seed + 1) * P);
      const wx = cx * P + x, wy = cz * P + y;
      const list = this.decals[kindName[this._levelAt(wx, wy)]];
      if (!list?.length || hash2(k, cx + cz * 99, seed + 2) < DECALS.skip) continue;
      let look = null;
      if (this.jungle) {
        const tx = Math.max(0, Math.min(W - 1, wx >> 5)), tz = Math.max(0, Math.min(W - 1, wy >> 5));
        const ri = this.world.region[tz * W + tx];
        look = ri >= 0 ? REGION_LOOK[keys[ri]]?.decals : null;
      }
      const wOf = (d) => {
        let w = d.w;
        if (look) for (const [frag, mul] of Object.entries(look)) if (d.name.includes(frag)) w *= mul;
        return w;
      };
      let tot = 0;
      for (const e of list) tot += wOf(e);
      const pick = (r) => { for (const e of list) { r -= wOf(e); if (r <= 0) return e; } return list[list.length - 1]; };
      out.push({ wx, wy, a: pick(hash2(k * 7, cz * 7 + cx, seed + 3) * tot), b: pick(hash2(k * 7 + 1, cz * 7 + cx, seed + 3) * tot), pri: hash2(k, cx * 31 + cz, seed + 5) });
    }
    return out;
  }

  _scatter(g, cx, cz, lv, B) {
    const P = CHUNK_PX;
    const seed = this.world.seed;
    // Sprite decals. The same decal never repeats within DECALS.spacing tiles (critic H #12: four crossed-twig
    // X marks in one clearing read as UI markers): a candidate yields to a same-decal candidate of higher
    // priority nearby (its own chunk or a neighbour), then tries its backup pick.
    const D2 = (DECALS.spacing * 32) ** 2;
    const near = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near.push(...this._decalCands(cx + dx, cz + dz));
    const free = (e, c) => !near.some((o) => o !== c && o.a.key === e.key && o.pri > c.pri && (o.wx - c.wx) ** 2 + (o.wy - c.wy) ** 2 < D2);
    const emissive = [];
    for (const c of this._decalCands(cx, cz)) {
      const d = free(c.a, c) ? c.a : free(c.b, c) ? c.b : null;
      if (!d) continue;
      const dx = Math.round(c.wx - cx * P - d.img.width / 2), dy = Math.round(c.wy - cz * P - d.img.height / 2);
      g.drawImage(d.img, dx, dy);
      if (d.emit) emissive.push({ d, x: dx, y: dy });
    }
    this._emissive = emissive;
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
/**
 * The slab bank from the 32 × 32 PixelLab paving tile: [with its star/diamond stain, plain]. The plain
 * slab replaces the darker motif (PAVING.slab.starBox, texels darker than starLum × the median stone)
 * with stone texels picked (deterministically) from elsewhere on the same slab.
 */
function makeSlabs(art) {
  const S = PAVING.slab, D = art.data;
  const lum = (i) => 0.3 * D[i] + 0.59 * D[i + 1] + 0.11 * D[i + 2];
  const all = [];
  for (let i = 0; i < 32 * 32; i++) all.push(lum(i * 4));
  const med = [...all].sort((a, b) => a - b)[all.length >> 1];
  const [bx0, by0, bx1, by1] = S.starBox;
  const inBox = (x, y) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
  const donors = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!inBox(x, y) && all[y * 32 + x] >= med * 0.92 && all[y * 32 + x] <= med * 1.12) donors.push((y * 32 + x) * 4);
  }
  const star = new Uint8ClampedArray(D);
  const plain = new Uint8ClampedArray(D);
  if (donors.length) {
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      if (all[y * 32 + x] >= med * S.starLum) continue;
      const i = (y * 32 + x) * 4, d = donors[Math.floor(hash2(x, y, 913) * donors.length)];
      plain[i] = D[d]; plain[i + 1] = D[d + 1]; plain[i + 2] = D[d + 2];
    }
  }
  return [star, plain];
}

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
