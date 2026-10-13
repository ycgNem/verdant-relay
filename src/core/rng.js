// Seeded RNG (mulberry32) so a run's districts, maps and loot are reproducible from its seed.

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),   // inclusive
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted: (weights) => {
      const entries = Object.entries(weights);
      let total = 0;
      for (const [, w] of entries) total += w;
      let r = next() * total;
      for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
      return entries[entries.length - 1][0];
    },
  };
  return rng;
}

export const newSeed = () => (Math.random() * 2 ** 31) | 0;

// Derive a sub-seed so each night/district gets its own stream from the run seed.
export const subSeed = (seed, ...parts) => parts.reduce((h, p) => Math.imul(h ^ (typeof p === 'number' ? p : hashStr(p)), 2654435761) >>> 0, seed >>> 0);

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
