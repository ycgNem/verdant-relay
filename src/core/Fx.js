// Shared visual effects for both modes: pixel particles, flashes, light pops, lightning bolts,
// ground rings / telegraphs, splat decals, death beats, hit-stop and floating text.
//
//   const fx = new Fx(game, scene3d, camera);
//   fx.burst(pos, { color, color2, count, speed, life, size, up, gravity })   square pixel particles
//   fx.ring(pos, { color, radius, life })                 expanding ground ring
//   fx.flash(pos, { color, size, life, dir })             additive pixel star (muzzle, impact, spark)
//   fx.muzzle(pos, dir, { color, size })                  directional muzzle flame + star + light pop
//   fx.spark(pos, { color, dir })                         impact spark (star + fast bright chips)
//   fx.light(pos, { color, intensity, distance, life })   short point-light pop (pooled, no shader recompiles)
//   fx.bolt(a, b, { color, life, jag })                   2-px jagged lightning ribbon with a white core
//   fx.line(a, b, { color, life, jag })                   tracer / lightning (same ribbon; kept for old callers)
//   const t = fx.telegraph(pos, { radius | (dir,length,width), color, time, style: 'dashed' })
//   fx.decal(pos, { color, radius, life })                 flat splat that dissolves pixel by pixel
//   fx.corpse(visualRoot, { dx, dz })                      takes over a dead enemy's visual: flash, squash, fade
//   fx.text(pos, '12', { color, life, rise, cls, key, value, html })   pops in, stacks, merges per key
//   fx.hitStop(t); fx.slowMo(time, scale); dt *= fx.step(realDt)       game-feel time control
//   fx.orientStreak(mesh, a, b, width)                     camera-facing quad from a to b (tracers)
//   fx.camUp                                               camera up vector (screen-up in world space)
//   fx.update(dt);  fx.dispose();
// Tuning lives in JUICE (src/data/config.js).

import * as THREE from 'three';
import { JUICE } from '../data/config.js';
import { flashVisual, setOpacity, updateVisual, setAnim } from './Assets.js';

const MAX_PARTICLES = 700;
const LIGHTS = 3;
const TEXEL = 1 / 32;
const _laneV = new THREE.Vector3();

// ------------------------------------------------------------------ procedural pixel textures

function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k > 1) c.lerp(new THREE.Color('#ffffff'), k - 1);
  else c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

/** Tiny seeded RNG so procedural pixel art is the same every run. */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

const texCache = new Map();
function cached(key, make) {
  if (!texCache.has(key)) texCache.set(key, make());
  return texCache.get(key);
}

/** 9×9 four-point pixel star: white core, light inner ring, coloured arms. Additive. */
function starTexture(color) {
  return cached(`star${color}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = 9;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 9, 9);
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const arm = shade(color, 1), mid = shade(color, 1.45);
    for (let i = 1; i <= 4; i++) {
      const col = i <= 1 ? '#ffffff' : i === 2 ? mid : arm;
      px(4 + i, 4, col); px(4 - i, 4, col); px(4, 4 + i, col); px(4, 4 - i, col);
    }
    px(3, 3, mid); px(5, 3, mid); px(3, 5, mid); px(5, 5, mid);
    px(2, 2, shade(color, 0.6)); px(6, 6, shade(color, 0.6)); px(6, 2, shade(color, 0.6)); px(2, 6, shade(color, 0.6));
    px(4, 4, '#ffffff');
    return canvasTex(c);
  });
}

/** 12×7 flame pointing +X (origin at the left edge): white root, yellow body, orange jagged tips. */
function flameTexture(color) {
  return cached(`flame${color}`, () => {
    const W = 12, H = 7;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const rows = [[0, 3, 5], [0, 7, 3], [0, 11, 2], [0, 9, 1], [0, 11, 2], [0, 7, 3], [0, 3, 5]];   // per row: start, end, hot length
    const body = shade(color, 1), tip = shade(color, 0.7), hot = shade(color, 1.6);
    rows.forEach(([x0, x1, hl], y) => {
      for (let x = x0; x <= x1; x++) {
        g.fillStyle = x < hl - 1 ? '#ffffff' : x < hl + 1 ? hot : x > x1 - 2 ? tip : body;
        g.fillRect(x, y, 1, 1);
      }
    });
    return canvasTex(c);
  });
}

/**
 * 16×16 splat: an irregular blob plus droplets in two tones. Alpha carries per-texel noise (0.5–1)
 * so raising the material's alphaTest dissolves it pixel by pixel instead of a smooth fade.
 */
// N = texture size in texels; the decal quad is N/32 tiles wide so it draws 1:1 (pixel-exact). Shaded
// (darker wet core, base, lit rim, light from the top-left) with a Bayer-dithered fringe, so a splat
// reads as a stain on the ground, not a black hole (critic F #14).
const SPLAT_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
function splatTexture(color, variant, N = 16, ground = 0) {
  return cached(`splat${color}${variant}:${N}:${ground}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const rnd = seeded(97 + variant * 131);
    // critic H #7: a stain on the ground, not paint. `ground` (0..1) pulls the colour that far toward the
    // ground colour (JUICE.death.splatGround) before the 3-tone ramp (wet core, base, lit rim) is built.
    const tone = new THREE.Color(color).lerp(new THREE.Color(JUICE.death.splatGround || '#3b3122'), ground);
    // (critic H2 §3) no step darker than the ground under it: each tone is lifted to at least splat.minLum (sRGB luma).
    const minLum = JUICE.death.splat?.minLum ?? 0;
    const hexOf = (k) => {
      const c = tone.clone().multiplyScalar(k);
      const hex = c.getHex(), l = (0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255)) / 255;
      if (l > 0 && l < minLum) c.multiplyScalar(Math.min(6, Math.pow(minLum / l, 2.2)));   // (linear)
      return `#${c.getHexString()}`;
    };
    const base = new THREE.Color(hexOf(1)), dark = new THREE.Color(hexOf(0.74)), lite = new THREE.Color(hexOf(1.22));
    const k = N / 16, h = N / 2;
    const blobs = [[h, h, (3.6 + rnd() * 0.8) * k]];
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, d = (4 + rnd() * 3.2) * k;
      blobs.push([h + Math.cos(a) * d, h + Math.sin(a) * d * 0.8, (0.6 + rnd() * 1.1) * k]);
    }
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let inside = 0, lit = 0;
        for (const [bx, by, br] of blobs) {
          const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) + (rnd() - 0.5) * 0.9;
          if (d < br && 1 - d / br > inside) { inside = 1 - d / br; lit = (bx - x - 0.5) + (by - y - 0.5); }
        }
        if (!inside) continue;
        if (inside < 0.2 && SPLAT_BAYER[(y & 3) * 4 + (x & 3)] > inside / 0.2 + 0.25) continue;   // dithered fringe
        const hex = (inside > 0.55 ? dark : inside < 0.3 && lit > 0 ? lite : base).getHex();   // sRGB bytes
        const i = (y * N + x) * 4;
        img.data[i] = (hex >> 16) & 255; img.data[i + 1] = (hex >> 8) & 255; img.data[i + 2] = hex & 255;
        img.data[i + 3] = 128 + Math.floor(rnd() * 127);
      }
    }
    g.putImageData(img, 0, 0);
    return canvasTex(c);
  });
}

/**
 * A splat decal from the artist's flat sprite (splat_<kind>_<n>): the same texels, with per-texel alpha noise
 * (128–255 on opaque texels) so it dissolves texel by texel like the procedural ones (alphaTest rises).
 */
function splatArtTexture(img, key) {
  return cached(`splatart:${key}`, () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const rnd = seeded(key.length * 977 + key.charCodeAt(key.length - 1));
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 127 ? 128 + Math.floor(rnd() * 127) : 0;
    g.putImageData(d, 0, 0);
    return canvasTex(c);
  });
}

/**
 * A splat stained into the ground under it (critic H2 §7): the artist's splat at a whole k×, flipped as given, every
 * texel pulled `toGround` toward the ground texel beneath (patch: RGBA bytes k·w × k·h from the scene's baked ground),
 * then lifted so none is darker than the darkest ground texel the splat covers. Alpha = the dissolve noise (128–255).
 * One texture per splat (the decal item disposes it).
 */
function splatStainTexture(img, k, flipU, flipV, patch, toGround) {
  const w = img.width, h = img.height, W = w * k, H = h * k;
  const src = cached(`splatpx:${img.src}`, () => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, w, h).data;
  });
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const at = (x, y) => {
    const sx = Math.floor(x / k), sy = Math.floor(y / k);
    return (((flipV ? h - 1 - sy : sy) * w) + (flipU ? w - 1 - sx : sx)) * 4;
  };
  let gmin = 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (src[at(x, y) + 3] < 128) continue;
    const o = (y * W + x) * 4;
    gmin = Math.min(gmin, lum(patch[o], patch[o + 1], patch[o + 2]));
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const out = g.createImageData(W, H), D = out.data;
  const rnd = seeded(Math.floor(Math.random() * 1e9));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = at(x, y);
    if (src[si + 3] < 128) continue;
    const o = (y * W + x) * 4;
    let r = src[si] + (patch[o] - src[si]) * toGround;
    let gg = src[si + 1] + (patch[o + 1] - src[si + 1]) * toGround;
    let b = src[si + 2] + (patch[o + 2] - src[si + 2]) * toGround;
    const l = lum(r, gg, b);
    if (l > 0 && l < gmin) { const s = gmin / l; r *= s; gg *= s; b *= s; }
    D[o] = r; D[o + 1] = gg; D[o + 2] = b;
    D[o + 3] = 128 + Math.floor(rnd() * 127);
  }
  g.putImageData(out, 0, 0);
  return canvasTex(c);
}

/** 20×10 dithered ellipse (ground glow under pickups). Additive, so black = nothing. */
function glowTexture() {
  return cached('glow', () => {
    const W = 20, H = 10;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x + 0.5 - W / 2) / (W / 2), (y + 0.5 - H / 2) / (H / 2));
        if (d >= 1) continue;
        if (d > 0.62 && (x + y) % 2) continue;      // checker dither at the rim
        g.fillStyle = d < 0.35 ? '#ffffff' : d < 0.62 ? '#9a9a9a' : '#5a5a5a';
        g.fillRect(x, y, 1, 1);
      }
    }
    return canvasTex(c);
  });
}
/**
 * Extraction beam, 48×96 texels: a pixel light column (white core, cyan body, dithered dark-cyan
 * edges, scan bands and motes). `map` repeats vertically and is scrolled; `alpha` is a static
 * dithered fade toward the top. Additive.
 */
function beamTextures() {
  return cached('beam', () => {
    const W = 48, H = 96;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const rnd = seeded(4242);
    const cx = W / 2;
    for (let y = 0; y < H; y++) {
      const band = (y % 16) < 2;            // darker scan band every 16 rows
      for (let x = 0; x < W; x++) {
        const d = Math.abs(x + 0.5 - cx);
        let col = null;
        if (d < 2) col = '#ffffff';
        else if (d < 5) col = '#8ff8ff';
        else if (d < 10) col = band ? '#127c86' : '#2ce8f5';
        else if (d < 15) col = ((x + y) % 2 === 0) ? (band ? '#0a3d44' : '#16808c') : null;
        else if (d < 19) col = ((x + y) % 4 === 0) ? '#0d5560' : null;
        if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
      }
    }
    // motes: single bright pixels and 2-px dashes drifting in the outer glow
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(cx + (rnd() - 0.5) * 34), y = Math.floor(rnd() * H);
      g.fillStyle = rnd() < 0.5 ? '#ffffff' : '#8ff8ff';
      g.fillRect(x, y, 1, rnd() < 0.4 ? 2 : 1);
    }
    const map = canvasTex(c);
    map.wrapT = THREE.RepeatWrapping;
    const a = document.createElement('canvas');
    a.width = W; a.height = H;
    const ga = a.getContext('2d');
    ga.fillStyle = '#000'; ga.fillRect(0, 0, W, H);
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    for (let y = 0; y < H; y++) {
      const k = y / H;                       // 0 at the top row of the canvas
      for (let x = 0; x < W; x++) {
        const keep = k > 0.45 ? 1 : k / 0.45; // fade over the top 45 %
        if (keep * 16 > bayer[y % 4][x % 4]) { ga.fillStyle = '#fff'; ga.fillRect(x, y, 1, 1); }
      }
    }
    const alpha = canvasTex(a);
    alpha.colorSpace = THREE.NoColorSpace;
    return { map, alpha };
  });
}

/** Give every opaque pixel's empty 4-neighbours a dark outline (selout-style hard edge). */
function outline(g, W, H, ink = '#181425') {
  const img = g.getImageData(0, 0, W, H);
  const a = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : img.data[(y * W + x) * 4 + 3];
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (a(x, y)) continue;
    if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) out.push([x, y]);
  }
  g.fillStyle = ink;
  for (const [x, y] of out) g.fillRect(x, y, 1, 1);
}

/**
 * Snare Vine L3 roots, as pixel art: `wrap` is a 24×14 upright sprite of thorny tendrils curling up
 * around the feet (drawn in front of the enemy); `roots` is a 32×20 floor decal of roots radiating
 * from under it. Both have a 1-px dark outline and hard alpha.
 */
function vineTextures() {
  return cached('vines', () => {
    const rnd = seeded(777);
    const ramp = ['#193c3e', '#265c42', '#3e8948', '#63c74d'];
    // --- upright wrap
    const W = 24, H = 14;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bases = [2, 5, 9, 12, 15, 19, 22];
    bases.forEach((bx, i) => {
      const h = 6 + Math.floor(rnd() * 6) + (i === 3 ? 2 : 0);
      const lean = (bx < W / 2 ? 1 : -1) * (1.5 + rnd() * 2.5);
      let lastX = bx;
      for (let s = 0; s <= h; s++) {
        const k = s / h;
        const x = Math.round(bx + lean * k * k);
        const y = H - 1 - s;
        g.fillStyle = ramp[Math.min(3, 1 + Math.floor(k * 3))];
        g.fillRect(x, y, 1, 1);
        if (x !== lastX) g.fillRect(lastX, y, 1, 1);   // keep the line 4-connected
        lastX = x;
        if (s > 2 && s < h && rnd() < 0.22) { g.fillStyle = '#e43b44'; g.fillRect(x + (lean > 0 ? -1 : 1), y, 1, 1); }   // thorn
      }
      if (rnd() < 0.5) { g.fillStyle = '#ff77a8'; g.fillRect(Math.round(bx + lean), H - 1 - h, 1, 1); }   // bud
    });
    outline(g, W, H);
    const wrap = canvasTex(c);
    // --- floor roots
    const RW = 32, RH = 20;
    const r = document.createElement('canvas');
    r.width = RW; r.height = RH;
    const gr = r.getContext('2d');
    const n = 9;
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rnd() * 0.4;
      let x = RW / 2 + Math.cos(a) * 5, y = RH / 2 + Math.sin(a) * 3;
      const len = 6 + rnd() * 6;
      for (let s = 0; s < len; s++) {
        a += (rnd() - 0.5) * 0.5;
        x += Math.cos(a); y += Math.sin(a) * 0.62;
        if (x < 1 || y < 1 || x > RW - 2 || y > RH - 2) break;
        gr.fillStyle = s < len * 0.5 ? '#3e2731' : s < len * 0.8 ? '#265c42' : '#3e8948';
        gr.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    outline(gr, RW, RH, '#0e0b16');
    const roots = canvasTex(r);
    return { wrap, roots, wrapSize: [W, H], rootSize: [RW, RH] };
  });
}

// ------------------------------------------------------------------ combat pixel art (machete smears, telegraphs)

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/** 4×4 Bayer threshold in [0, 1) for texel (x, y). */
export const bayer = (x, y) => BAYER4[y & 3][x & 3] / 16;
/** Stable pseudo-random value in [0, 1) for integer texel (x, y). */
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function px(img, W, x, y, hex) {
  const i = (y * W + x) * 4;
  const c = typeof hex === 'number' ? hex : parseInt(hex.slice(1), 16);
  img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = 255;
}

// Smear palettes: [edge, light, body, tail]. The slash matches the mint glow PixelLab baked into the
// player's own slash frames; the heavy chop is hot amber like the charge-ready ring.
const SMEAR_RAMPS = {
  slash: ['#ffffff', '#b5fff4', '#45ffd4', '#1f9c88'],
  heavy: ['#ffffff', '#c9fff6', '#68ffe5', '#2a8f8a'],
  chop: ['#ffffff', '#fff3a8', '#fee761', '#f77622'],
};

/**
 * Machete smear as a frame sheet drawn for the exact swing angle (so the ground texture never has to be
 * rotated: every texel stays on the pixel grid). Hard pixels only; the tail breaks up through a Bayer
 * dither instead of fading.
 *   R: outer radius (texels) · arc: total sweep (radians) · angle: aim (radians, atan2(dz, dx)) ·
 *   sign: +1 sweeps with increasing angle, -1 against · kind: 'slash' | 'heavy' (finisher) | 'chop'
 * Returns { canvas, S (frame size), n (frames) }.
 */
function smearSheet(R, arc, angle, sign, kind, T) {
  const ramp = SMEAR_RAMPS[kind].map((h) => parseInt(h.slice(1), 16));
  const frames = kind === 'slash'
    ? [{ t: 0, h: 0.6, k: 0.7 }, { t: 0.06, h: 1, k: 1 }, { t: 0.5, h: 1, k: 0.6, fray: true }]
    : [{ t: 0, h: 0.5, k: 0.7 }, { t: 0.04, h: 1, k: 1 }, { t: 0.32, h: 1, k: 0.85 }, { t: 0.66, h: 1, k: 0.5, fray: true }];
  const S = 2 * Math.ceil(R) + 4;
  const n = frames.length;
  const c = document.createElement('canvas');
  c.width = S * n; c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S * n, S);
  const half = arc / 2;
  const double = kind !== 'slash';
  for (let fi = 0; fi < n; fi++) {
    const fr = frames[fi];
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        // canvas row 0 is north (−Z): the flat quad's +Y points to −Z
        const dx = i + 0.5 - S / 2, dz = j + 0.5 - S / 2;
        const r = Math.hypot(dx, dz);
        if (r > R + 0.5 || r < R * 0.3) continue;
        let th = Math.atan2(dz, dx) - angle;
        th = Math.atan2(Math.sin(th), Math.cos(th));
        const u = sign > 0 ? (th + half) / arc : (half - th) / arc;
        if (u < fr.t || u > fr.h) continue;
        const s = (u - fr.t) / Math.max(1e-3, fr.h - fr.t);          // 0 tail → 1 head
        let w = T * fr.k * (0.25 + 0.75 * Math.pow(s, 0.85));
        if (s > 0.9) w *= Math.max(0.25, (1 - s) / 0.1);                // pointed head
        const rO = R - (1 - s) * 2.2;                                 // the tail curls slightly inward
        const q = rO - r;                                             // texels in from the outer edge
        let col = -1;
        if (q >= 0 && q < w) {
          col = q < 1 && s > 0.22 ? ramp[0] : q < w * 0.45 ? ramp[1] : ramp[2];
          if (s < 0.3) {                                              // dithered tail
            if (((i + j) & 1) || bayer(i, j) > s * 3) col = -1;
            else col = ramp[3];
          }
        } else if (double && s > 0.2 && q >= w + 2 && q < w + 2 + Math.max(1, w * 0.4)) {
          // finisher / chop: a second, thinner trailing band inside the first
          col = ((i + j) & 1) && s < 0.6 ? -1 : s > 0.6 ? ramp[2] : ramp[3];
        } else if (q >= w && q < w * 1.9 && s > 0.15 && bayer(i, j) < 0.3 * (1 - (q - w) / (w * 0.9)) * Math.min(1, s * 2)) {
          // ordered-dither haze on the inside of the blade path (volume without soft alpha)
          col = ramp[3];
        }
        if (col < 0) continue;
        if (fr.fray && bayer(i, j) > s * 1.5 - 0.1) continue;          // the last frame breaks up from the tail
        px(img, S * n, fi * S + i, j, col);
      }
    }
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, S, n };
}

/**
 * Dithered target ring (landing spots): a 2-px rim (solid outer, checker inner), four inward ticks and a
 * closing inner ring that steps from the rim toward the centre over `K` frames; frame K is the commit
 * frame (white rim, dithered fill). Cached per size and colour.
 */
function ringSheet(rPx, color, color2, K) {
  return cached(`dring${rPx}${color}${color2}${K}`, () => {
    const S = 2 * rPx + 2;
    const n = K + 1;
    const c = document.createElement('canvas');
    c.width = S * n; c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S * n, S);
    const W = S * n;
    for (let f = 0; f < n; f++) {
      const commit = f === K;
      const rk = rPx * (1 - (f + 1) / (K + 1)) + 1;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const dx = i + 0.5 - S / 2, dz = j + 0.5 - S / 2;
          const d = Math.hypot(dx, dz);
          let col = null;
          if (d <= rPx && d > rPx - 1) col = commit ? '#ffffff' : color;
          else if (d <= rPx - 1 && d > rPx - 2) col = (i + j) & 1 ? null : color2;
          else if (d < rPx - 2 && d > rPx - 5 && (Math.abs(dx) < 0.6 || Math.abs(dz) < 0.6)) col = commit ? '#ffffff' : color;
          else if (!commit && Math.abs(d - rk) < 0.5 && rk < rPx - 2) col = color2;
          else if (commit && d < rPx - 2 && !((i + j) & 1) && !(i & 1)) col = color;
          if (col) px(img, W, f * S + i, j, col);
        }
      }
    }
    g.putImageData(img, 0, 0);
    return { tex: canvasTex(c), S, n };
  });
}

/**
 * A Razorback's charge lane as ground damage, drawn for the exact direction (no texture rotation).
 * critic H #7: no hard rectangle; a capsule (rounded ends) of scuffed ground-dust dither with a dithered red rim
 * that fades inward, the jagged central crack, and bright chevrons on top. Two layers:
 *   base  — rim + dust + crack. Alpha carries the reveal order (near → far, Bayer-dithered front): lowering the
 *           material's alphaTest grows the lane.
 *   chev  — chevrons pointing along the charge. Alpha carries the phase along the lane, so sweeping the
 *           alphaTest makes the chevrons light up toward the charge direction (pulse).
 * Returns { canvas, chev, ox, oz (texel offset of the canvas corner from the lane origin), W, H }.
 */
function laneCanvas(dir, Lpx, Wpx, seed) {
  const L = JUICE.tele?.lane || {};
  const d = { x: dir.x, z: dir.z };
  const nrm = { x: -d.z, z: d.x };
  const hw = Wpx / 2;
  const xs = [], zs = [];
  for (const [a, b] of [[0, -hw], [0, hw], [Lpx, -hw], [Lpx, hw]]) { xs.push(d.x * a + nrm.x * b); zs.push(d.z * a + nrm.z * b); }
  const ox = Math.floor(Math.min(...xs)) - 1, oz = Math.floor(Math.min(...zs)) - 1;
  const W = Math.ceil(Math.max(...xs)) + 1 - ox, H = Math.ceil(Math.max(...zs)) + 1 - oz;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); return { c, g, img: g.createImageData(W, H) }; };
  const base = mk(), chev = mk();
  const rnd = seeded(seed);
  const ph1 = rnd() * 6.28, ph2 = rnd() * 6.28;
  const crack = (u) => Math.sin(u * 0.33 + ph1) * 1.6 + Math.sin(u * 0.9 + ph2) * 0.7;
  // short side cracks branching off the main one
  const branches = [];
  for (let u = 6 + rnd() * 6; u < Lpx - 6; u += 7 + rnd() * 9) branches.push({ u, s: rnd() < 0.5 ? -1 : 1, len: 3 + rnd() * 4 });
  const P = L.chevronGap ?? 16;          // texels between chevrons
  const wave = L.pulseLength ?? 48;      // texels of lane one pulse sweep covers
  const dust = L.dust ?? 0.4;            // share of the band filled with dithered dust
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = ox + i + 0.5, z = oz + j + 0.5;
      const u = x * d.x + z * d.z, v = x * nrm.x + z * nrm.z;
      // Capsule: distance to the lane's centre segment, so both ends are round.
      const cu = Math.max(hw * 0.5, Math.min(Lpx - hw * 0.5, u));
      const edge = hw - Math.hypot(u - cu, v);
      if (edge < 0 || u < -hw * 0.5 || u > Lpx + hw * 0.5) continue;
      const av = Math.abs(v);
      let col = null;
      const cv = v - crack(u);
      const rb = bayer(i + 1, j + 2);
      if (edge < 1.5) col = rb < 0.5 ? '#ff3b3b' : rb < 0.75 ? '#a22633' : null;              // dithered bright rim
      else if (edge < 4) col = rb < 0.3 ? '#c8343a' : rb < 0.5 ? '#6e2a2c' : null;            // fading inner rim
      else if (Math.abs(cv) < 0.75) col = Math.floor(u) % 7 === 3 ? '#ff3b3b' : '#3e2731';  // the crack, with embers
      else if (Math.abs(cv) < 1.6) col = cv > 0 ? '#8f563b' : null;                          // lit lower lip (light from top-left)
      else {
        for (const b of branches) {
          const du = u - b.u;
          if (du >= 0 && du < b.len && Math.abs(cv - b.s * du * 0.9) < 0.6) { col = '#3e2731'; break; }
        }
        if (!col) {
          // wide scuffed dust band (hashed grit, no dot lattice), heavier where it paws
          const near = u < 24 ? 1.35 : 1;
          const t = hash2(i + seed, j);
          if (t < dust * near * 0.35) col = '#c9a27c';
          else if (t < dust * near) col = '#8f6a50';
          else if (t > 0.97) col = '#5a4430';
        }
      }
      if (col) {
        const k = Math.max(0, Math.min(1, (u / Lpx) * 0.9 + bayer(i + 1, j + 2) * 0.1));
        px(base.img, W, i, j, col);
        base.img.data[(j * W + i) * 4 + 3] = Math.round(255 - k * 127);
      }
      // chevrons ">" along the charge: two arms meeting at the lane centre, 2 texels thick
      if (edge > 5) {
        const uc = ((u % P) + P) % P;
        const arm = uc - (P * 0.5 - av * 0.75);
        if (arm >= 0 && arm < 2.2 && u > 4 && u < Lpx - 3) {
          px(chev.img, W, i, j, arm < 1.1 ? '#fff1c4' : '#feae34');
          // phase along the lane: the alphaTest sweep reveals each pulse from the beast outward
          const ph = ((u % wave) + wave) % wave / wave;
          chev.img.data[(j * W + i) * 4 + 3] = Math.max(2, Math.round(255 - ph * 250));
        }
      }
    }
  }
  base.g.putImageData(base.img, 0, 0);
  chev.g.putImageData(chev.img, 0, 0);
  return { canvas: base.c, chev: chev.c, ox, oz, W, H };
}

/** 40×40 ground crack (heavy chop impact): jagged dark fissures radiating from a small crater, lit lips. */
function crackTexture(variant) {
  return cached(`crack${variant}`, () => {
    const N = 40;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const rnd = seeded(311 + variant * 57);
    const set = (x, y, col, a) => {
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      const i = (y * N + x) * 4;
      if (img.data[i + 3] && col !== '#3e2731') return;
      px(img, N, x, y, col);
      img.data[i + 3] = a;
    };
    const arms = 6 + Math.floor(rnd() * 3);
    for (let k = 0; k < arms; k++) {
      let a = (k / arms) * Math.PI * 2 + rnd() * 0.5;
      let x = N / 2, y = N / 2;
      const len = 8 + rnd() * 10;
      for (let s = 0; s < len; s++) {
        a += (rnd() - 0.5) * 0.7;
        x += Math.cos(a); y += Math.sin(a);
        const alpha = 255 - Math.floor((s / len) * 110 + rnd() * 16);
        set(Math.round(x), Math.round(y), '#3e2731', alpha);
        set(Math.round(x) + 1, Math.round(y) + 1, '#8f563b', alpha);   // lit lip below-right
        if (s > 3 && rnd() < 0.12) {                                     // little fork
          const fa = a + (rnd() < 0.5 ? -1 : 1) * 0.9;
          for (let t = 1; t < 4; t++) set(Math.round(x + Math.cos(fa) * t), Math.round(y + Math.sin(fa) * t), '#3e2731', alpha - 20);
        }
      }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - N / 2, (y + 0.5 - N / 2) * 1.2);
      if (d < 3.2) set(x, y, d < 1.8 ? '#181425' : '#3e2731', 255);
      else if (d < 5 && bayer(x, y) < 0.4) set(x, y, '#5a4430', 235);
    }
    g.putImageData(img, 0, 0);
    return canvasTex(c);
  });
}

/** 7×3 hard ground shadow for things in the air (the Spitter's lobbed glob). */
function lobShadowTexture() {
  return cached('lobShadow', () => {
    const c = document.createElement('canvas');
    c.width = 7; c.height = 3;
    const g = c.getContext('2d');
    g.fillStyle = '#181425';
    g.fillRect(1, 0, 5, 3);
    g.fillRect(0, 1, 7, 1);
    return canvasTex(c);
  });
}

export { glowTexture, starTexture, splatTexture, beamTextures, vineTextures, canvasTex, shade, lobShadowTexture };

// ------------------------------------------------------------------ Fx

export class Fx {
  constructor(game, scene, camera) {
    this.game = game;
    this.scene = scene;
    this.camera = camera;
    this.items = [];
    this.texts = [];
    this.corpses = [];
    this.decals = [];
    this.whites = [];            // live white hit-flash overlays
    this.tells = [];             // live commit tells (blinking flat-colour overlays)
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.camBack = new THREE.Vector3(0, 0, 1);
    this.stopT = 0;
    this.slowT = 0;
    this.slowScale = 1;
    this.clock = 0;
    this._stopEnd = -10;

    // Particles: one InstancedMesh of camera-facing squares; each instance has its own colour.
    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    this.pmesh = new THREE.InstancedMesh(geom, mat, MAX_PARTICLES);
    this.pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pmesh.count = 0;
    this.pmesh.frustumCulled = false;
    this.pmesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    scene.add(this.pmesh);
    this.parts = [];
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();

    // Shared quad for flashes / decals / streaks.
    this.quad = new THREE.PlaneGeometry(1, 1);

    // Light pool: fixed point lights at intensity 0, so pops never change the light count (no recompiles).
    this.lights = [];
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 3, 1);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push({ l, t: 0, life: 1, i0: 0 });
    }
    this._lightNext = 0;
    this._syncCamera();
  }

  _syncCamera() {
    const cam = this.camera;
    if (!cam) return;
    cam.updateMatrixWorld?.();
    this.camUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
    this.camBack.set(0, 0, 1).applyQuaternion(cam.quaternion);
  }

  // ---------------------------------------------------------------- time control

  /** Freeze the simulation for `t` real seconds (the longest pending stop wins). */
  hitStop(t) {
    if (!(t > 0)) return;
    if (this.stopT <= 0 && this.clock - this._stopEnd < JUICE.hitStop.gap) t *= 0.5;
    this.stopT = Math.max(this.stopT, t);
  }

  slowMo(time, scale) {
    this.slowT = Math.max(this.slowT, time);
    this.slowScale = scale;
  }

  /** Call once per frame with the real dt; returns the multiplier for this frame's simulation dt. */
  step(realDt) {
    this.clock += realDt;
    if (this.stopT > 0) {
      this.stopT -= realDt;
      if (this.stopT <= 0) this._stopEnd = this.clock;
      return 0;
    }
    if (this.slowT > 0) { this.slowT -= realDt; return this.slowScale; }
    return 1;
  }

  // ---------------------------------------------------------------- particles

  burst(pos, o = {}) {
    const n = o.count ?? 8;
    const col = new THREE.Color(o.color ?? '#ead4aa');
    const col2 = o.color2 ? new THREE.Color(o.color2) : null;
    for (let i = 0; i < n && this.parts.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 3) * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x: pos.x, y: (pos.y ?? 0) + (o.y ?? 0.4), z: pos.z,
        vx: Math.cos(a) * sp + (o.vx || 0), vy: (o.up ?? 2.5) * (0.5 + Math.random()), vz: Math.sin(a) * sp + (o.vz || 0),
        g: o.gravity ?? 9, life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.6), t: 0,
        size: (o.size ?? 0.08) * (0.7 + Math.random() * 0.6),
        color: col2 && Math.random() < 0.5 ? col2 : col,
        // aspect: width/height in whole texels (leaf chips 2×1) · drag: air drag per second ·
        // flutter: sideways sway amplitude (tiles/s), for leaves see-sawing down
        ar: o.aspect || 1, drag: o.drag || 0, fl: o.flutter ? o.flutter * (0.6 + Math.random() * 0.8) : 0, ph: Math.random() * 6.28,
      });
    }
  }

  ring(pos, o = {}) {
    const radius = o.radius ?? 1;
    // o.px: a line that many texels thick at full size (night Protocols), else 14% of the radius.
    const geom = new THREE.RingGeometry(o.px ? Math.max(0.5, 1 - (o.px * TEXEL) / radius) : 0.86, 1, o.px ? 48 : 32);
    const mat = new THREE.MeshBasicMaterial({ color: o.color ?? '#ead4aa', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geom, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, (pos.y ?? 0) + 0.05, pos.z);
    m.scale.setScalar(o.from ?? radius * 0.2);
    this.scene.add(m);
    // o.hard: full, then half, then gone (frames, not a smooth tween: night Protocols, critic H2 §8).
    this.items.push({ obj: m, t: 0, life: o.life ?? 0.35, kind: 'ring', r0: o.from ?? radius * 0.2, r1: radius, hard: !!o.hard });
  }

  /**
   * A one-shot hand-drawn effect from the sprite manifest (fx_spore_ring, …): `o.anim` (default idle) plays for
   * `o.life` s at whole-number `o.scale`, at height `o.y`, then it is removed — hard alpha, no fades. Null when the
   * art is missing (the caller keeps its code fallback).
   */
  sprite(pos, key, o = {}) {
    const A = this.game?.assets;
    if (!A?.hasSprite?.(key)) return null;
    const v = A.makeVisual(key, { shadow: false, scale: o.scale ?? 1, emissive: o.emissive });
    v.position.set(pos.x, o.y ?? 0, pos.z);
    setAnim(v, o.anim || 'idle', true);
    this.scene.add(v);
    const item = { obj: v, t: 0, life: o.life ?? 0.35, kind: 'sprite' };
    this.items.push(item);
    return item;
  }

  // ---------------------------------------------------------------- flashes, sparks, lights

  /** Additive pixel star billboard. o.dir (x,z) rotates nothing (stars are symmetric); o.y lifts it. */
  flash(pos, o = {}) {
    const mat = new THREE.SpriteMaterial({ map: starTexture(o.color ?? '#fee761'), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: o.depthTest ?? false, transparent: true });
    const s = new THREE.Sprite(mat);
    const size = this._snap(o.size ?? JUICE.spark.size, 9);
    s.scale.set(size, size, 1);
    s.position.set(pos.x, (pos.y ?? 0) + (o.y ?? 0), pos.z);
    s.renderOrder = 30;
    this.scene.add(s);
    this.items.push({ obj: s, t: 0, life: o.life ?? JUICE.spark.life, kind: 'flash', size });
    return s;
  }

  /** Muzzle flash: a flame quad along `dir` (x,z), a star at the barrel and a short light pop. */
  muzzle(pos, dir, o = {}) {
    const M = JUICE.muzzle;
    const color = o.color ?? '#fee761';
    const len = (o.size ?? M.size);
    const mat = new THREE.MeshBasicMaterial({ map: flameTexture(color), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.quad, mat);
    m.matrixAutoUpdate = false;
    m.renderOrder = 31;
    const a = this._v.set(pos.x, pos.y ?? 0, pos.z);
    const b = this._w.set(pos.x + dir.x * len, pos.y ?? 0, pos.z + dir.z * len);
    this.orientStreak(m, a, b, this._snap(len * 7 / 12, 7));
    this.scene.add(m);
    this.items.push({ obj: m, t: 0, life: o.life ?? M.life, kind: 'fadeHard', shared: true });
    this.flash({ x: pos.x, y: pos.y ?? 0, z: pos.z }, { color, size: len * 0.75, life: o.life ?? M.life });
    if (o.light !== false) this.light({ x: pos.x + dir.x * 0.3, y: (pos.y ?? 0) + 0.2, z: pos.z + dir.z * 0.3 }, { color, intensity: o.lightIntensity ?? M.light, distance: M.lightDist, life: M.lightLife });
  }

  /** Impact spark: a star plus a few fast, bright chips flying back along -dir. */
  spark(pos, o = {}) {
    const S = JUICE.spark;
    const color = o.color ?? '#fee761';
    this.flash(pos, { color, size: o.size ?? S.size, life: S.life });
    const d = o.dir || { x: 0, z: 0 };
    this.burst({ x: pos.x, y: (pos.y ?? 0) - 0.4, z: pos.z }, {
      color: '#ffffff', color2: color, count: o.count ?? S.count, speed: 3.2, up: 1.8, life: 0.18, size: 2 * TEXEL, gravity: 14,
      vx: -d.x * 2.2, vz: -d.z * 2.2,
    });
  }

  light(pos, o = {}) {
    const slot = this.lights[this._lightNext];
    this._lightNext = (this._lightNext + 1) % this.lights.length;
    slot.l.color.set(o.color ?? '#fee761');
    slot.l.distance = o.distance ?? 3;
    slot.l.position.set(pos.x, (pos.y ?? 0) + 0.6, pos.z);
    slot.i0 = o.intensity ?? 2;
    slot.l.intensity = slot.i0;
    slot.t = 0;
    slot.life = o.life ?? 0.08;
  }

  // ---------------------------------------------------------------- bolts and streaks

  /** Camera-facing quad (the shared unit plane) stretched from a to b, `width` tall on screen. */
  orientStreak(mesh, a, b, width) {
    const x = this._p.subVectors(b, a);
    const len = x.length() || 1e-4;
    x.multiplyScalar(1 / len);
    const y = new THREE.Vector3().crossVectors(this.camBack, x);
    if (y.lengthSq() < 1e-8) y.copy(this.camUp);
    y.normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    const m = mesh.matrix;
    m.makeBasis(x, y, z);
    m.scale(this._s.set(len, width, 1));
    m.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.matrixWorldNeedsUpdate = true;
  }

  /** Jagged lightning: a coloured 2-px ribbon with a white 1-px core, re-jagged once mid-life. */
  bolt(a, b, o = {}) {
    const B = JUICE.bolt;
    const segs = o.segments ?? B.segments;
    const jag = o.jag ?? 0.35;
    const color = o.color ?? '#2ce8f5';
    const outer = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    const core = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    outer.renderOrder = 32; core.renderOrder = 33;
    const g = new THREE.Group();
    g.add(outer, core);
    const item = { obj: g, t: 0, life: o.life ?? 0.14, kind: 'bolt', a: a.clone(), b: b.clone(), segs, jag, outer, core, w: o.width ?? B.width, cw: o.core ?? B.core, rejag: true };
    this._buildBolt(item);
    this.scene.add(g);
    this.items.push(item);
    return item;
  }

  _buildBolt(it) {
    const pts = [];
    for (let i = 0; i <= it.segs; i++) {
      const t = i / it.segs;
      const p = new THREE.Vector3().lerpVectors(it.a, it.b, t);
      if (i > 0 && i < it.segs) {
        const k = Math.sin(t * Math.PI);   // calmer near the ends, wild in the middle
        p.x += (Math.random() - 0.5) * it.jag * (0.5 + k);
        p.y += (Math.random() - 0.5) * it.jag * 0.6 * (0.5 + k);
        p.z += (Math.random() - 0.5) * it.jag * (0.5 + k);
      }
      pts.push(p);
    }
    const ribbon = (mesh, w) => {
      const pos = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
        const n = new THREE.Vector3().crossVectors(this.camBack, dir).normalize().multiplyScalar(w / 2);
        // extend each quad by half a width so joints don't show gaps
        const e = dir.clone().multiplyScalar(w / 2);
        const a0 = p0.clone().sub(e), a1 = p1.clone().add(e);
        const v = [a0.clone().add(n), a0.clone().sub(n), a1.clone().add(n), a1.clone().sub(n)];
        pos.push(...v[0].toArray(), ...v[1].toArray(), ...v[2].toArray(), ...v[1].toArray(), ...v[3].toArray(), ...v[2].toArray());
      }
      mesh.geometry.dispose();
      mesh.geometry = new THREE.BufferGeometry();
      mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    };
    ribbon(it.outer, it.w * 2);
    ribbon(it.core, it.cw * 1.5);
  }

  /** Old API: tracers and lightning are both drawn as pixel ribbons now. */
  line(a, b, o = {}) {
    return this.bolt(a, b, { color: o.color, life: o.life ?? 0.12, jag: o.jag ?? 0, segments: o.jag ? 6 : 1 });
  }

  // ---------------------------------------------------------------- telegraphs

  /**
   * Ground telegraph that fills over `time` seconds. Circle: { radius }. Line: { dir: {x,z}, length, width }.
   * style 'dashed' (friendly markers, e.g. mortar landings): a dashed ring with a closing inner ring, no fill.
   * Enemy telegraphs get a pulsing rim and a white flash at the moment they commit.
   * Returns a handle with .cancel(). It removes itself `fade` seconds after filling.
   */
  telegraph(pos, o = {}) {
    const color = o.color ?? '#e43b44';
    const group = new THREE.Group();
    group.position.set(pos.x, 0.04, pos.z);
    const time = o.time ?? 0.8;
    if (o.style === 'dashed') {
      const r = o.radius ?? 1;
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
      const dashes = 14;
      for (let i = 0; i < dashes; i++) {
        const seg = (Math.PI * 2) / dashes;
        const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.07, r, 3, 1, i * seg, seg * 0.55), mat);
        m.rotation.x = -Math.PI / 2;
        group.add(m);
      }
      const innerMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
      const inner = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 24), innerMat);
      inner.rotation.x = -Math.PI / 2;
      inner.scale.setScalar(r);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 6), mat);
      dot.rotation.x = -Math.PI / 2;
      group.add(inner, dot);
      this.scene.add(group);
      const item = { obj: group, t: 0, life: time + (o.fade ?? 0.05), fillTime: time, kind: 'teleDash', inner, r, mat };
      this.items.push(item);
      return { cancel: () => { item.t = item.life; }, group };
    }
    let outline, fill;
    const om = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    const fm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    const rimMat = new THREE.MeshBasicMaterial({ color: shade(color, 1.5), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    let rim;
    if (o.dir) {
      const len = o.length ?? 3, w = o.width ?? 0.8;
      outline = new THREE.Mesh(new THREE.PlaneGeometry(w, len), om);
      fill = new THREE.Mesh(new THREE.PlaneGeometry(w, len), fm);
      // Rim: two 1-px edges along the lane.
      rim = new THREE.Group();
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.PlaneGeometry(TEXEL * 1.5, len), rimMat);
        e.position.x = sx * (w / 2 - TEXEL);
        rim.add(e);
      }
      for (const m of [outline, fill, rim]) { m.rotation.x = -Math.PI / 2; m.position.z = -len / 2; }
      fill.geometry.translate(0, len / 2, 0);   // grows from the origin along the facing direction
      fill.position.z = 0;
      group.rotation.y = Math.atan2(-o.dir.x, -o.dir.z);
    } else {
      const r = o.radius ?? 1;
      outline = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r, 32), om);
      fill = new THREE.Mesh(new THREE.CircleGeometry(r, 32), fm);
      rim = new THREE.Mesh(new THREE.RingGeometry(r - TEXEL * 1.6, r, 40), rimMat);
      for (const m of [outline, fill, rim]) m.rotation.x = -Math.PI / 2;
    }
    rim.position.y = 0.004;
    fill.scale.set(0.001, 0.001, 1);
    group.add(outline, fill, rim);
    this.scene.add(group);
    const item = { obj: group, t: 0, life: time + (o.fade ?? 0.15), fillTime: time, kind: 'tele', fill, line: !!o.dir, rimMat, color, flashed: false };
    this.items.push(item);
    return { cancel: () => { item.t = item.life; }, group };
  }

  // ---------------------------------------------------------------- machete smears, in-world telegraphs

  /** Flat, pixel-snapped quad lying at height y (texels land 1:1 on the pixel grid). */
  _flatQuad(map, x, y, z, wPx, hPx, renderOrder = 5) {
    const mat = new THREE.MeshBasicMaterial({ map, transparent: false, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.quad, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(wPx * TEXEL, hPx * TEXEL, 1);
    m.position.set(x, y, z);
    m.renderOrder = renderOrder;
    m.userData.pxSnap = true;
    this.scene.add(m);
    return m;
  }

  /**
   * Machete smear: a hard-edged pixel arc around (x, z) at blade height, 3–4 frames.
   * o: { range, arc, sign (sweep direction), kind: 'slash'|'heavy'|'chop', frame (s per frame), y, scale, thick }
   */
  smear(x, z, angle, o = {}) {
    const kind = o.kind || 'slash';
    const R = Math.round((o.range ?? 1.5) * (o.scale ?? 0.9) * 32);
    const T = o.thick ?? (kind === 'chop' ? 13 : kind === 'heavy' ? 10 : 8);
    const sheet = smearSheet(R, o.arc ?? 2.1, angle, o.sign ?? 1, kind, T);
    const tex = canvasTex(sheet.canvas);
    tex.repeat.x = 1 / sheet.n;
    const m = this._flatQuad(tex, x, o.y ?? 0.5, z, sheet.S, sheet.S, 6);
    // Pull it toward the camera along the view axis (same pixels on screen, ortho) so the blade path
    // draws over the creature it cuts through instead of vanishing behind its sprite card; things a
    // full tile or more in front of the arc (the player when swinging north) still cover it.
    m.position.addScaledVector(this.camBack, o.depthPull ?? 0.75);
    if (o.onTop) {
      // Swings that face the camera side draw over everything (undergrowth cards would hide them).
      m.material.transparent = true;
      m.material.depthTest = false;
      m.renderOrder = 25;
    }
    this.items.push({ obj: m, t: 0, life: (o.frame ?? 0.035) * sheet.n, kind: 'smear', tex, n: sheet.n, shared: true });
    return m;
  }

  /**
   * Hit flash on a sprite visual (critic H #7): an overlay sharing its texture (so it follows the frame and
   * facing) that shows JUICE.hitFlash.white frame(s) of flat white, then tint frame(s) of the sprite pushed
   * toward red-orange, only on the sprite that was hit. Its edge texels stay dark ink, so two flashing
   * bodies that overlap never melt into one white blob. `time` above JUICE.melee.whiteFlash (a heavy chop)
   * adds a tint frame. Models fall back to flashVisual.
   */
  hitFlash(root, time = 0.08) {
    const vis = root?.userData.vis;
    if (!vis) return;
    if (vis.kind !== 'sprite' || !vis.body) { flashVisual(root, '#ffffff', time); return; }
    const HF = JUICE.hitFlash || { white: 1, tint: 2, color: '#ff6a3d', mix: 0.6, ink: '#181425' };
    const o = this._overlay(root, 'whiteOverlay', HF);
    o.visible = true;
    const heavy = time > (JUICE.melee?.whiteFlash ?? 0.08) * 1.2 ? 1 : 0;
    const frames = HF.white + HF.tint + heavy;
    const live = this.whites.find((w) => w.o === o);
    if (live) { live.n = 0; live.frames = Math.max(live.frames - live.n, frames); }
    else this.whites.push({ o, body: vis.body, n: 0, frames, white: HF.white });
    this._flashLook(o, 0, HF);
  }

  /**
   * The commit tell (Stage 9, POISE.tell): the creature's whole sprite blinks flat `color` (ink edge kept) for `time` s,
   * `blink` s on / off — "red flash: it's coming, roll or deflect". Its own overlay (a hit flash on top still shows).
   */
  tell(root, o = {}) {
    const vis = root?.userData.vis;
    if (!vis) return;
    const color = o.color || '#ff2e2e', time = o.time ?? 0.2, blink = o.blink ?? 0.05;
    if (vis.kind !== 'sprite' || !vis.body) { flashVisual(root, color, time); return; }
    const ov = this._overlay(root, 'tellOverlay', JUICE.hitFlash, 2);
    ov.material.color.set(color);
    if (ov.material.userData.flash) ov.material.userData.flash.uMode.value = 0;
    ov.visible = true;
    const live = this.tells.find((w) => w.o === ov);
    if (live) { live.t = 0; live.time = time; live.blink = blink; }
    else this.tells.push({ o: ov, body: vis.body, t: 0, time, blink });
  }

  /** A flat-colour copy of a sprite body (ink edge kept) drawn just over it: hit flashes and tells. */
  _overlay(root, key, HF, order = 1) {
    const vis = root.userData.vis;
    let o = root.userData[key];
    if (!o) {
      const mat = new THREE.SpriteMaterial({ map: vis.tex, color: '#ffffff', transparent: true, alphaTest: 0.5, depthWrite: false });
      const G = vis.geom;
      const U = {
        uTexel: { value: new THREE.Vector2(1 / (G?.iw || 64), 1 / (G?.ih || 64)) },
        uInk: { value: new THREE.Color(HF.ink) },
        uMode: { value: 0 },
        uMix: { value: HF.mix },
      };
      mat.userData.flash = U;
      mat.onBeforeCompile = (shader, r) => {
        THREE.SpriteMaterial.prototype.onBeforeCompile.call(mat, shader, r);   // keep the upright-card patch
        Object.assign(shader.uniforms, U);
        shader.fragmentShader = shader.fragmentShader
          .replace('uniform float opacity;', 'uniform float opacity;\nuniform vec2 uTexel;\nuniform vec3 uInk;\nuniform float uMode, uMix;')
          .replace('#include <map_fragment>', `vec4 sampledDiffuseColor = texture2D(map, vMapUv);
	diffuseColor *= sampledDiffuseColor;
	float vrEdge = step(texture2D(map, vMapUv + vec2(uTexel.x, 0.0)).a, 0.5) + step(texture2D(map, vMapUv - vec2(uTexel.x, 0.0)).a, 0.5)
		+ step(texture2D(map, vMapUv + vec2(0.0, uTexel.y)).a, 0.5) + step(texture2D(map, vMapUv - vec2(0.0, uTexel.y)).a, 0.5);`)
          .replace('outgoingLight = diffuseColor.rgb;', 'outgoingLight = vrEdge > 0.5 ? uInk : uMode < 0.5 ? diffuse : mix(sampledDiffuseColor.rgb, diffuse, uMix) * 1.12;');
      };
      mat.customProgramCacheKey = () => 'vr-card-sprite-hitflash';
      o = new THREE.Sprite(mat);
      o.name = key;
      o.center.copy(vis.body.center);
      o.renderOrder = (vis.body.renderOrder || 0) + order;
      root.add(o);
      root.userData[key] = o;
    }
    o.position.copy(vis.body.position);
    o.scale.copy(vis.body.scale);
    return o;
  }

  /** Colour of a hit-flash overlay on frame n (0-based): white, then the red-orange tint. */
  _flashLook(o, n, HF = JUICE.hitFlash) {
    const white = n < (HF?.white ?? 1);
    o.material.color.set(white ? '#ffffff' : HF?.color || '#ff6a3d');
    const U = o.material.userData.flash;
    if (U) U.uMode.value = white ? 0 : 1;
  }

  /**
   * Dithered landing ring that closes in steps over `time`, flashes on commit and lingers `fade`.
   * o: { radius, color, color2, time, fade, y }. Returns { cancel(), move(x, z), group }.
   */
  ringTele(pos, o = {}) {
    const K = JUICE.tele?.ringFrames ?? 6;
    const rPx = Math.max(6, Math.round((o.radius ?? 0.8) * 32));
    const sheet = ringSheet(rPx, o.color ?? '#e43b44', o.color2 ?? '#a22633', K);
    const tex = sheet.tex.clone();     // shares the image; own frame offset
    tex.repeat.x = 1 / sheet.n;
    tex.offset.x = 0;
    const m = this._flatQuad(tex, pos.x, o.y ?? 0.03, pos.z, sheet.S, sheet.S, 3);
    const time = o.time ?? 0.8;
    const fade = o.fade ?? 0.12;
    const item = { obj: m, t: 0, life: time + fade, fillTime: time, kind: 'dring', tex, n: sheet.n, K, shared: true };
    this.items.push(item);
    return {
      cancel: () => { item.t = item.life; },
      move: (x, z) => m.position.set(x, m.position.y, z),
      /** Commit in `left` seconds from now instead (the ring keeps closing from where it is). */
      retime: (left) => {
        const f = Math.min(0.99, item.t / item.fillTime);
        item.t = f * left / Math.max(1e-3, 1 - f);
        item.fillTime = item.t + left;
        item.life = item.fillTime + fade;
      },
      group: m,
    };
  }

  /**
   * Razorback charge lane: a bold dust band with bright edges that grows from the beast along its path
   * (the first JUICE.tele.lane.grow of `time`), then chevrons pulse toward the charge, faster as the
   * commit nears, and the whole lane flashes when it commits. o: { dir, length, width, time, fade }.
   * Returns { cancel(), setDir(dir, length), group }.
   */
  chargeLane(pos, o = {}) {
    const time = o.time ?? 0.8;
    const item = { obj: null, t: 0, life: time + (o.fade ?? 0.12), fillTime: time, kind: 'lane', tex: null, chevTex: null, shared: true, flashed: false };
    const seed = 1 + Math.floor(Math.random() * 9999);
    const Wpx = Math.max(8, Math.round((o.width ?? 1.2) * 32));
    const build = (dir, len) => {
      const dl = Math.hypot(dir.x, dir.z) || 1;
      const d = { x: dir.x / dl, z: dir.z / dl };
      const lc = laneCanvas(d, Math.max(8, Math.round(len * 32)), Wpx, seed);
      const tex = canvasTex(lc.canvas), chevTex = canvasTex(lc.chev);
      const cx = pos.x + (lc.ox + lc.W / 2) * TEXEL, cz = pos.z + (lc.oz + lc.H / 2) * TEXEL;
      if (!item.obj) {
        const baseM = this._flatQuad(tex, cx, 0.03, cz, lc.W, lc.H, 2);
        baseM.material.alphaTest = 0.99;
        const chevM = this._flatQuad(chevTex, cx, 0.034, cz, lc.W, lc.H, 3);
        chevM.material.alphaTest = 1;
        // X-ray chevrons: the same chevrons drawn only where foliage / props cover the lane (depthFunc
        // GREATER, after every opaque card), in a flat hot colour, so the lane reads through brush.
        // o.hole (a {x, z} like the player's position): no x-ray over that body, so the lane never hides the
        // player standing in it (an ellipse around its sprite, JUICE.tele.lane.hole = [rx, ry] internal px).
        const hole = this._laneHole ||= { value: new THREE.Vector4(-1e5, -1e5, 1, 1) };
        const xray = (src, map, color, order) => {
          const m = src.clone();
          m.material = new THREE.MeshBasicMaterial({ map, color, alphaTest: 1, transparent: true,
            blending: THREE.NoBlending, depthWrite: false, depthFunc: THREE.GreaterDepth, side: THREE.DoubleSide });
          m.material.onBeforeCompile = (sh) => {
            sh.uniforms.uHole = hole;
            sh.fragmentShader = sh.fragmentShader.replace('void main() {',
              'uniform vec4 uHole;\nvoid main() {\n  vec2 hd = (gl_FragCoord.xy - uHole.xy) / uHole.zw;\n  if (dot(hd, hd) < 1.0) discard;\n');
          };
          m.material.customProgramCacheKey = () => 'vr-lane-xray';
          m.renderOrder = order;
          return m;
        };
        item.hole = o.hole || null;
        const XC = JUICE.tele?.lane?.xray || ['#a22633', '#ffb070'];
        const xrBase = xray(baseM, tex, XC[0], 38), xr = xray(chevM, chevTex, XC[1], 39);
        // one group so Fx disposes every layer together
        const g = new THREE.Group();
        this.scene.add(g);
        g.attach(baseM); g.attach(chevM); g.add(xrBase); g.add(xr);
        item.obj = g; item.base = baseM; item.chev = chevM; item.xray = xr; item.xrayBase = xrBase;
      } else {
        item.tex?.dispose(); item.chevTex?.dispose();
        for (const [m, t] of [[item.base, tex], [item.chev, chevTex], [item.xrayBase, tex], [item.xray, chevTex]]) {
          m.material.map = t;
          m.material.needsUpdate = true;
          m.scale.set(lc.W * TEXEL, lc.H * TEXEL, 1);
          m.position.set(cx, m.position.y, cz);
        }
      }
      item.tex = tex; item.chevTex = chevTex;
      item.dir = d; item.len = len;
    };
    build(o.dir ?? { x: 1, z: 0 }, o.length ?? 3);
    this.items.push(item);
    return {
      cancel: () => { item.t = item.life; },
      setDir: (dir, len) => {
        const a = Math.atan2(dir.z, dir.x) - Math.atan2(item.dir.z, item.dir.x);
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.035 && Math.abs(len - item.len) < 0.12) return;
        build(dir, len);
      },
      group: item.obj,
      item,
    };
  }

  /** Ground crack from a heavy blow (dissolves pixel by pixel). dir picks the quarter-turn it leans to. */
  crack(pos, o = {}) {
    const mat = new THREE.MeshLambertMaterial({ map: crackTexture(Math.floor(Math.random() * 3)), transparent: false, alphaTest: 0.45, depthWrite: false });
    const m = new THREE.Mesh(this.quad, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.floor(Math.random() * 4) * Math.PI / 2;
    m.scale.set(40 * TEXEL, 40 * TEXEL, 1);
    m.position.set(pos.x, 0.013, pos.z);
    m.renderOrder = 0;
    m.userData.pxSnap = true;
    this.scene.add(m);
    this.items.push({ obj: m, t: 0, life: o.life ?? 1.4, kind: 'decal', mat, shared: true });
  }

  // ---------------------------------------------------------------- decals and deaths

  /**
   * Flat splat on the floor that dissolves pixel by pixel. Death splats (no o.life given) are desaturated toward
   * the ground (JUICE.death.splatDesat) and fade over JUICE.death.decalFade of their decalLife; splats with an
   * explicit life (sap puddles, hazards) keep their colour and dissolve over their last second.
   */
  /**
   * A creature's death splat (critic H2 §3): its kind (JUICE.death.splat.kind[key]: blood / sap / magenta / acid) as
   * the artist's decal splat_<kind>_1|2 when loaded (×2 for big creatures), else the procedural splat in that kind's
   * colour. `size` = the creature's size (def.size × scale).
   */
  splat(pos, key, size = 0.7) {
    const S = JUICE.death.splat, kind = S?.kind?.[key] || 'sap';
    const A = this.game?.assets;
    const art = `splat_${kind}_${1 + Math.floor(Math.random() * 2)}`;
    if (A?.hasSprite?.(art)) return this.decal(pos, { art, scale: size >= (S.bigFrom ?? 1) ? 2 : 1 });
    return this.decal(pos, { color: S?.color?.[kind] || '#5a5a2e', radius: (0.3 + size * 0.5) * JUICE.death.decalSize, ground: 0 });
  }

  decal(pos, o = {}) {
    const D = JUICE.death;
    // Opaque pass + alphaTest: texels are either drawn solid or discarded (no blending), and the
    // per-texel alpha noise only decides *when* each texel disappears.
    // Lambert so the splat is lit like the floor it lies on (dark at night).
    const death = o.life == null;
    let map, sx, sz, own = null, rot = null, at = null;
    const img = o.art ? this.game?.assets?.spriteInfo?.(o.art)?.tex?.image : null;
    const k = Math.max(1, Math.round(o.scale || 1));
    // this.ground (set by the scene): { patch(tx, tz, w, h) → RGBA bytes of its baked ground at world texels, or null;
    // unlit: the ground is unlit (jungle: MeshBasic, light in PostFx) so the splat is too }.
    const patch = img && this.ground?.patch ? (() => {
      const W = img.width * k, H = img.height * k;
      const tx = Math.round(pos.x * 32 - W / 2), tz = Math.round(pos.z * 32 - H / 2);
      const p = this.ground.patch(tx, tz, W, H);
      return p ? { p, tx, tz, W, H } : null;
    })() : null;
    if (img && patch) {
      // The artist's splat stained into the ground beneath it (orientation baked in, texels on the ground's grid).
      map = own = splatStainTexture(img, k, Math.random() < 0.5, Math.random() < 0.5, patch.p, D.splat?.toGround ?? 0.3);
      sx = patch.W / 32; sz = patch.H / 32;
      rot = 0;
      at = { x: (patch.tx + patch.W / 2) / 32, z: (patch.tz + patch.H / 2) / 32 };
    } else if (img) {
      // The artist's splat (o.art): 1:1 texels × a whole o.scale, turned by half-turns / mirrored only.
      map = splatArtTexture(img, o.art);
      sx = (img.width / 32) * k * (Math.random() < 0.5 ? -1 : 1); sz = (img.height / 32) * k;
    } else {
      const size = this._snap((o.radius ?? 0.5) * 2, 4);
      map = splatTexture(o.color ?? '#733e39', Math.floor(Math.random() * 3), Math.round(size * 32), death ? (o.ground ?? D.splatDesat ?? 0) : 0);
      sx = sz = size;
    }
    const Mat = this.ground?.unlit ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
    const mat = new Mat({ map, transparent: false, alphaTest: 0.45, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.quad, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot ?? (img ? Math.floor(Math.random() * 2) * 2 : Math.floor(Math.random() * 4)) * Math.PI / 2;
    m.scale.set(sx, sz, 1);
    m.position.set(at ? at.x : pos.x, 0.012 + (this.decals.length % 8) * 0.0005, at ? at.z : pos.z);
    m.renderOrder = 0;
    m.userData.pxSnap = true;   // texels on the pixel grid (the texture is size × 32 texels: 1:1)
    this.scene.add(m);
    const it = { obj: m, t: 0, life: o.life ?? D.decalLife, kind: 'decal', mat, shared: true, fade: death ? (D.decalFade ?? 1) : 1, tex: own };
    this.items.push(it);
    this.decals.push(it);
    if (this.decals.length > D.maxDecals) { const old = this.decals.shift(); old.t = Math.max(old.t, old.life - 0.4); }
  }

  /**
   * Death beat for a visual the entity no longer owns: white flash, squash-and-pop, a short slide along
   * the killing hit, then a fade. Fx disposes it afterwards (via game.assets.disposeVisual).
   */
  corpse(root, o = {}) {
    if (!root) return;
    const D = JUICE.death;
    // Re-parent to the scene keeping the world transform (defense visuals live inside a group).
    if (root.parent !== this.scene) this.scene.attach(root);
    flashVisual(root, '#ffffff', D.flash + D.squash * 0.5);
    const vis = root.userData.vis;
    const body = vis?.body;
    const sx0 = body ? body.scale.x : 1, sy0 = body ? body.scale.y : 1;
    this.corpses.push({
      root, body, sx0, sy0, t: 0, x0: root.position.x, z0: root.position.z,
      dx: (o.dx || 0) * D.knock, dz: (o.dz || 0) * D.knock, faded: false,
    });
  }

  // ---------------------------------------------------------------- floating text

  /**
   * Floating text. o.y is the world height above `pos` (use vis.height to sit on a sprite's head).
   * o.key + o.value: repeated numbers on one target within the merge
   * window add up in one label. New labels that would overlap a live one step upward.
   */
  text(pos, str, o = {}) {
    const T = JUICE.text;
    if (o.key != null && o.value != null) {
      const live = this.texts.find((t) => t.key === o.key && t.t < T.mergeWindow + 0.05 && !t.done);
      if (live) {
        live.value += o.value;
        live.n.textContent = `${o.prefix || ''}${Math.round(live.value)}`;
        live.t = Math.min(live.t, 0.02);
        live.popT = 0;
        live.fs = 0;   // re-measure the base size (text and class may have changed)
        if (o.cls) live.n.className = `float ${o.cls}`;
        return live.n;
      }
    }
    const n = document.createElement('div');
    n.className = `float ${o.cls || ''}`;
    if (o.html) n.innerHTML = o.html; else n.textContent = str;
    n.style.color = o.color ?? '#ead4aa';
    this.game.ui.append(n);
    const base = new THREE.Vector3(pos.x, pos.y ?? 0, pos.z);
    const t = {
      n, base, y: o.y ?? 1, t: 0, life: o.life ?? 0.8, rise: o.rise ?? 0.6, key: o.key, value: o.value,
      popT: 0, pop: o.cls === 'crit' ? T.critScale : (o.pop ?? T.popScale), dy: 0, w: n.offsetWidth, h: n.offsetHeight,
    };
    // Step upward while overlapping a live label (screen space).
    const p = this._projectText(t, 0);
    const u = this.game.u;
    for (let k = 0; k < 5; k++) {
      const hit = this.texts.some((q) => q.sx != null && Math.abs(q.sx - p.x) < (q.w + t.w) * 0.5 && Math.abs(q.sy - (p.y - t.dy)) < (q.h + t.h) * 0.5 * 0.9);
      if (!hit) break;
      t.dy += T.stackPx * u;
    }
    this.texts.push(t);
    return n;
  }

  _projectText(t, k) {
    // Heights are world Y (sprites are upright cards, so vis.height is the top of the sprite).
    const v = this._v.copy(t.base);
    v.y += t.y + t.rise * k;
    return this.game.project(v, this.camera);
  }

  // ---------------------------------------------------------------- frame

  update(dt) {
    this._syncCamera();
    // particles: camera-facing squares, sizes snapped to whole texels
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vz *= k; if (p.vy < 0) p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.fl && p.vy < 0) p.x += Math.sin(p.t * 11 + p.ph) * p.fl * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    }
    this._q.copy(this.camera.quaternion);
    // The pixel camera squeezes its vertical frustum by sin(pitch); pre-shrink so squares stay square.
    const ky = this.camera.isPixelCamera ? Math.sin(this.camera.pitch) : 1;
    for (const p of this.parts) {
      const s = Math.max(TEXEL, Math.round(p.size * (1 - (p.t / p.life) * 0.6) / TEXEL) * TEXEL);
      const sw = p.ar === 1 ? s : Math.max(TEXEL, Math.round((s * p.ar) / TEXEL) * TEXEL);   // whole texels wide
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s.set(sw, s * ky, s));
      this.pmesh.setMatrixAt(n, this._m);
      this.pmesh.setColorAt(n, p.color);
      n++;
    }
    this.pmesh.count = n;
    this.pmesh.instanceMatrix.needsUpdate = true;
    if (this.pmesh.instanceColor) this.pmesh.instanceColor.needsUpdate = true;

    // light pops
    for (const s of this.lights) {
      if (s.l.intensity <= 0) continue;
      s.t += dt;
      const k = s.t / s.life;
      s.l.intensity = k >= 1 ? 0 : s.i0 * (1 - k);
    }

    // rings, lines, telegraphs, flashes, decals
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.life);
      if (it.kind === 'ring') {
        it.obj.scale.setScalar(it.r0 + (it.r1 - it.r0) * Math.sqrt(k));
        it.obj.material.opacity = it.hard ? (k < 0.6 ? 0.9 : 0.45) : 0.9 * (1 - k);
      } else if (it.kind === 'sprite') {
        updateVisual(it.obj, dt);
      } else if (it.kind === 'fade') {
        it.obj.material.opacity = 1 - k;
      } else if (it.kind === 'fadeHard') {
        // two-step fade (full, then half) reads as frames rather than a smooth tween
        it.obj.material.opacity = k < 0.6 ? 1 : 0.5;
      } else if (it.kind === 'flash') {
        const s = it.size * (k < 0.5 ? 1 : 0.66);
        it.obj.scale.set(s, s, 1);
        it.obj.material.opacity = k < 0.5 ? 1 : 0.6;
      } else if (it.kind === 'bolt') {
        if (it.rejag && k > 0.45) { it.rejag = false; this._buildBolt(it); }
        it.outer.material.opacity = k < 0.6 ? 1 : 0.55;
        it.core.visible = k < 0.75;
      } else if (it.kind === 'decal') {
        // Dissolve over the last `fade` seconds, in whole steps (the per-texel alpha noise picks the order).
        const left = it.life - it.t, F = it.fade || 1;
        if (left < F) it.mat.alphaTest = 0.45 + 0.55 * Math.ceil((1 - Math.max(0, left) / F) * 12) / 12;
      } else if (it.kind === 'smear') {
        it.tex.offset.x = Math.min(it.n - 1, Math.floor(k * it.n)) / it.n;
      } else if (it.kind === 'dring') {
        const f = it.t / it.fillTime;
        it.tex.offset.x = (f >= 1 ? it.K : Math.min(it.K - 1, Math.floor(f * it.K))) / it.n;
      } else if (it.kind === 'lane') {
        const LN = JUICE.tele.lane || {};
        if (it.hole && this._laneHole) {
          // the body's centre in render-target pixels (gl_FragCoord: origin bottom-left)
          const v = _laneV.set(it.hole.x, LN.holeY ?? 0.85, it.hole.z).project(this.camera);
          const R = LN.hole || [20, 36];
          this._laneHole.value.set((v.x * 0.5 + 0.5) * this.game.width, (v.y * 0.5 + 0.5) * this.game.height, R[0], R[1]);
        }
        const f = Math.min(1, it.t / it.fillTime);
        // grows from the beast outward over the first part of the wind-up, then holds
        const g = Math.min(1, it.t / Math.max(0.05, it.fillTime * (LN.grow ?? 0.35)));
        it.base.material.alphaTest = Math.max(0.01, (255 - g * 127) / 255 - 0.002);
        it.xrayBase.material.alphaTest = it.base.material.alphaTest;
        if (f >= 1) {
          // commit: the whole lane flashes bright, chevrons stay lit while it charges
          if (!it.flashed) { it.flashed = true; it.base.material.color.setRGB(2.2, 2.2, 2.2); it.chev.material.color.setRGB(2, 2, 2); }
          else if (it.t - it.fillTime > 0.06) { it.base.material.color.setRGB(1, 1, 1); it.chev.material.color.setRGB(1, 1, 1); }
          it.chev.material.alphaTest = 0.005;
          it.xray.material.alphaTest = 0.005;
        } else if (g >= 1) {
          // chevrons sweep toward the charge, faster as the commit nears; the edges pulse brighter
          it.ph = (it.ph || 0) + dt * (LN.pulseRate ?? 2.2) * (1 + 2 * f);
          const sweep = it.ph % 1;
          it.chev.material.alphaTest = Math.max(0.005, 1 - sweep);
          it.xray.material.alphaTest = it.chev.material.alphaTest;
          const b = 1 + (LN.pulseGlow ?? 0.45) * (0.5 + 0.5 * Math.sin(it.ph * Math.PI * 2));
          it.base.material.color.setRGB(b, b, b);
        }
      } else if (it.kind === 'teleDash') {
        const f = Math.min(1, it.t / it.fillTime);
        it.inner.scale.setScalar(Math.max(0.05, it.r * (1 - f)));
        it.obj.rotation.y += dt * 0.8;
        if (it.t > it.fillTime) it.mat.opacity = 0.5;
      } else if (it.kind === 'tele') {
        const f = Math.min(1, it.t / it.fillTime);
        if (it.line) it.fill.scale.set(1, f, 1);
        else it.fill.scale.set(f, f, 1);
        // bright rim pulses faster as the attack nears
        it.rimMat.opacity = 0.55 + 0.45 * Math.abs(Math.sin(it.t * (8 + 14 * f)));
        if (it.t > it.fillTime) {
          if (!it.flashed) { it.flashed = true; it.fill.material.color.set('#ffffff'); it.rimMat.color.set('#ffffff'); }
          const fk = (it.t - it.fillTime) / Math.max(0.01, it.life - it.fillTime);
          it.fill.material.opacity = 0.75 * (1 - fk);
          if (fk > 0.35) it.fill.material.color.set(it.color);
        }
      }
      if (it.t >= it.life) {
        if (it.kind === 'sprite') this.game.assets.disposeVisual(it.obj);
        else this._disposeObj(it.obj, it.shared);
        it.tex?.dispose();
        it.chevTex?.dispose();
        this.items.splice(i, 1);
        if (it.kind === 'decal') { const j = this.decals.indexOf(it); if (j >= 0) this.decals.splice(j, 1); }
      }
    }

    // hit-flash overlays follow their body (corpse squash, burrow offsets), count whole frames (white, then
    // tint) and switch off — frames, not seconds, so a hit-stop shows the same 1 + 2 frames
    for (let i = this.whites.length - 1; i >= 0; i--) {
      const w = this.whites[i];
      w.o.position.copy(w.body.position);
      w.o.scale.copy(w.body.scale);
      if (w.n > 0) this._flashLook(w.o, w.n);
      w.n++;
      if (w.n > w.frames || !w.o.parent) { w.o.visible = false; this.whites.splice(i, 1); }
    }
    // commit tells blink on real (sim) time, so they read the same at any frame rate
    for (let i = this.tells.length - 1; i >= 0; i--) {
      const w = this.tells[i];
      w.t += dt;
      w.o.position.copy(w.body.position);
      w.o.scale.copy(w.body.scale);
      w.o.visible = Math.floor(w.t / w.blink) % 2 === 0;
      if (w.t >= w.time || !w.o.parent) { w.o.visible = false; this.tells.splice(i, 1); }
    }

    // corpses: flash → squash & pop → slide → fade
    const D = JUICE.death;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t += dt;
      updateVisual(c.root, dt);
      const ks = Math.min(1, c.t / D.squash);
      const slide = Math.min(1, c.t / 0.1);
      c.root.position.x = c.x0 + c.dx * slide;
      c.root.position.z = c.z0 + c.dz * slide;
      if (c.body) {
        // quick stretch up, then flatten wide
        const sy = ks < 0.3 ? 1 + 0.18 * (ks / 0.3) : 1.18 - 0.6 * ((ks - 0.3) / 0.7);
        const sx = ks < 0.3 ? 1 - 0.1 * (ks / 0.3) : 0.9 + 0.38 * ((ks - 0.3) / 0.7);
        c.body.scale.x = c.sx0 * sx;
        c.body.scale.y = c.sy0 * sy;
      }
      if (c.t > D.squash) {
        if (!c.faded) {
          c.faded = true;
          c.root.traverse((o) => { if (o.name === 'shadow' || o.userData?.ring) o.visible = false; });
        }
        const kf = (c.t - D.squash) / D.fade;
        // stepped fade (3 levels) so it doesn't look like a smooth tween over pixel art
        setOpacity(c.root, kf < 0.34 ? 0.75 : kf < 0.67 ? 0.45 : 0.2);
      }
      if (c.t >= D.squash + D.fade) {
        this.game.assets.disposeVisual(c.root);
        this.corpses.splice(i, 1);
      }
    }

    // floating text
    const T = JUICE.text;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      t.popT += dt;
      if (t.t >= t.life) { t.done = true; t.n.remove(); this.texts.splice(i, 1); continue; }
      const k = t.t / t.life;
      const p = this._projectText(t, 1 - (1 - k) * (1 - k));
      const pk = Math.min(1, t.popT / T.pop);
      const sc = 1 + (t.pop - 1) * (1 - pk);
      t.sx = p.x; t.sy = p.y - t.dy;
      // Pixel-exact pop (critic M P0-3): the pop is a font-size step on the pixel-font grid (T.popSteps, each size a
      // whole multiple of --fq), never a fractional scale() that re-samples the glyphs, and the label is centred by
      // whole pixels from its measured size, never translate(-50%) (half a pixel on an odd width).
      if (!t.fs) {
        t.n.style.fontSize = '';
        t.fs = parseFloat(getComputedStyle(t.n).fontSize) || 16;
        t.w0 = t.n.offsetWidth; t.h0 = t.n.offsetHeight;
        t.fsNow = t.fs;
      }
      const step = (T.popSteps || [1]).reduce((a, b) => (Math.abs(b - sc) < Math.abs(a - sc) ? b : a));
      const fq = parseFloat(this.game.stage?.style.getPropertyValue('--fq')) || t.fs / 2;
      const fs = Math.max(t.fs, Math.round((t.fs * step) / fq) * fq);
      if (fs !== t.fsNow) { t.fsNow = fs; t.n.style.fontSize = fs === t.fs ? '' : `${fs}px`; }
      const r = fs / t.fs;
      t.n.style.transform = `translate(${Math.round(p.x - (t.w0 * r) / 2)}px, ${Math.round(p.y - t.dy - (t.h0 * r) / 2)}px)`;
      t.n.style.opacity = String(1 - Math.max(0, (k - 0.65) / 0.35));
    }
  }

  /** Round a size to whole texels of a texture `texels` wide at 32 texels per tile. */
  _snap(size, texels) {
    const step = texels * TEXEL;
    return Math.max(step, Math.round(size / step) * step);
  }

  _disposeObj(o, sharedGeom = false) {
    o.removeFromParent();
    o.traverse((c) => {
      if (c.geometry && !(sharedGeom && c.geometry === this.quad)) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }

  dispose() {
    for (const it of this.items) { if (it.obj) this._disposeObj(it.obj, true); it.tex?.dispose(); }
    this.items = [];
    this.whites = [];
    this.tells = [];
    this.decals = [];
    for (const c of this.corpses) this.game.assets.disposeVisual(c.root);
    this.corpses = [];
    for (const t of this.texts) t.n.remove();
    this.texts = [];
    for (const s of this.lights) s.l.removeFromParent();
    this.pmesh.removeFromParent();
    this.pmesh.geometry.dispose();
    this.pmesh.material.dispose();
    this.pmesh.dispose();
    this.quad.dispose();
  }
}
