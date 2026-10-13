// Seeded 2D value noise + fBm, used by the jungle generator and the terrain baker.
// Deterministic for a seed, cheap, and good enough for organic shapes (no directional artefacts
// at the octave counts we use).

import { makeRng } from '../core/rng.js';

export function makeNoise(seed) {
  const rng = makeRng(seed);
  const N = 256;
  const perm = new Uint16Array(N * 2);
  const vals = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; vals[i] = rng.next(); }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const h = (x, y) => vals[perm[(perm[x & 255] + y) & 511] & 255];
  const fade = (t) => t * t * (3 - 2 * t);

  /** Value noise in [0, 1). */
  function value(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** Fractal sum, normalised to [0, 1). */
  function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let amp = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += value(x * f + i * 17.3, y * f - i * 9.1) * amp;
      norm += amp;
      amp *= gain; f *= lac;
    }
    return sum / norm;
  }

  /** Ridged noise in [0, 1): 1 along "veins" (river-ish shapes). */
  function ridge(x, y, oct = 3) {
    return 1 - Math.abs(fbm(x, y, oct) * 2 - 1);
  }

  return { value, fbm, ridge };
}

/** Cheap integer hash → [0, 1) for per-tile decisions that must not depend on iteration order. */
export function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
