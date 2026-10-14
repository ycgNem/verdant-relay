// Pixel-art glows: a soft radial light pool drawn texel by texel (1 texel = 1 screen pixel at 32 px per
// tile) as a few stepped brightness rings with a 4 × 4 Bayer dither between them, so it reads as a smooth
// falloff without any blending or a visible block pattern. Meant for additive blending (black = no light).
// Used by the activated relay pylons (critic F #14, critic H #12).
//
// lightPool() / beaconBeam() are light SOURCES for PostFx: they add their colour and mark the pixels they
// light (lightBlending: alpha ×= 1 − texel alpha), so the pool / beam keeps its brightness under the canopy
// and at night instead of being shaded like the ground.

import * as THREE from 'three';
import { lightBlending } from './PostFx.js';
import { CARD_SCALE } from './PixelView.js';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const cache = new Map();

function texOf(c, key) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.userData.shared = true;
  cache.set(key, t);
  return t;
}

/**
 * A w × h texel radial glow texture (shared, cached). `steps` brightness levels, `core` = brightness of
 * the centre (0..1), `power` shapes the falloff (>1 = tighter core). `alpha`: alpha carries the level too
 * (0 outside), for lightBlending; otherwise alpha is 1 everywhere (plain additive).
 */
export function radialGlowTexture(w, h, { steps = 4, core = 1, power = 1.4, alpha = false } = {}) {
  const key = `${w}x${h}:${steps}:${core}:${power}:${alpha}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
      const i = (y * w + x) * 4;
      img.data[i + 3] = alpha ? 0 : 255;
      if (d >= 1) continue;
      const f = Math.pow(1 - d, power) * core;
      const lvl = Math.floor(f * steps + BAYER4[(y & 3) * 4 + (x & 3)]) / steps;   // stepped + dithered
      const v = Math.round(Math.min(1, lvl) * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      if (alpha) img.data[i + 3] = v;
    }
  }
  g.putImageData(img, 0, 0);
  return texOf(c, key);
}

/**
 * A flat light pool on the ground (PYLON_GLOW-style opts: w, h in tiles, steps, power, color, strength) as a
 * light source (see the header). Texel-exact at 32 px per tile. Dispose its material (the texture is shared).
 */
export function lightPool(o) {
  const tex = radialGlowTexture(Math.round(o.w * 32), Math.round(o.h * 32), { steps: o.steps, power: o.power, alpha: true });
  const mat = lightBlending(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(o.color).multiplyScalar(o.strength ?? 1) }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), mat);
  m.rotation.x = -Math.PI / 2;
  m.userData.pxSnap = true;
  m.renderOrder = 2;
  return m;
}

/** w × h texel light column: a bright core, dithered falloff to the sides, fading out toward the top. */
function beamTexture(w, h) {
  const key = `beam${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const across = 1 - Math.abs((x + 0.5) / w - 0.5) * 2;
    // Brightest at the bottom (the beacon tip, canvas row h − 1), a quarter as bright at the top.
    const v = Math.max(0, Math.min(1, Math.pow(across, 1.6) * (0.25 + 0.75 * (y / h))));
    const lvl = Math.floor(v * 4 + BAYER4[(y & 3) * 4 + (x & 3)] - 0.25) / 4;
    const i = (y * w + x) * 4;
    if (lvl <= 0) continue;
    const b = Math.round(Math.min(1, lvl) * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
    img.data[i + 3] = b;
  }
  g.putImageData(img, 0, 0);
  return texOf(c, key);
}

/**
 * A light column rising from a lit beacon (the activated pylon's tip): an upright sprite card `w` × `h`
 * texels whose bottom sits `y0` tiles up, drawn above the canopy (no depth test) as a light source, its
 * brightness pulsing in `steps` whole steps. Reads from across the jungle; dispose its material.
 */
export function beaconBeam(o) {
  const tex = beamTexture(o.beamW, o.beamH);
  const base = new THREE.Color(o.color).multiplyScalar(o.beamStrength ?? 0.8);
  const mat = lightBlending(new THREE.SpriteMaterial({ map: tex, color: base.clone(), depthTest: false, fog: false }));
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0);
  s.scale.set(o.beamW / 32, o.beamH / 32, 1);
  s.position.y = (o.beamY ?? 2.2) * CARD_SCALE;   // tiles on screen → card height
  s.renderOrder = 30;
  const t0 = Math.random() * 10;
  s.onBeforeRender = () => {
    const t = performance.now() / 1000 + t0;
    const k = Math.floor((0.5 + 0.5 * Math.sin(t * (o.pulse ?? 2.4))) * 3) / 3;   // 4 stepped levels
    mat.color.copy(base).multiplyScalar(0.7 + 0.3 * k);
  };
  return s;
}
