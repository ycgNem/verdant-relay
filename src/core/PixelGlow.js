// Pixel-art ground glows: a soft radial light pool drawn texel by texel (1 texel = 1 screen pixel at
// 32 px per tile) as a few stepped brightness rings with a 4 × 4 Bayer dither between them, so it reads
// as a smooth falloff without any blending or a visible block pattern. Meant for additive blending
// (black = no light). Used by the activated relay pylons (critic F #14).

import * as THREE from 'three';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const cache = new Map();

/**
 * A w × h texel radial glow texture (shared, cached). `steps` brightness levels, `core` = brightness of
 * the centre (0..1), `power` shapes the falloff (>1 = tighter core).
 */
export function radialGlowTexture(w, h, { steps = 4, core = 1, power = 1.4 } = {}) {
  const key = `${w}x${h}:${steps}:${core}:${power}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
      const i = (y * w + x) * 4;
      img.data[i + 3] = 255;
      if (d >= 1) continue;
      const f = Math.pow(1 - d, power) * core;
      const lvl = Math.floor(f * steps + BAYER4[(y & 3) * 4 + (x & 3)]) / steps;   // stepped + dithered
      const v = Math.round(Math.min(1, lvl) * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.userData.shared = true;
  cache.set(key, t);
  return t;
}
