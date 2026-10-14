// Load-time palette swaps (critic H #10): recolour part of a sprite sheet per texel, no new PNG.
//
// PALETTE_SWAP (src/data/jungle.js) lists, per sprite key, the hue bands to replace (degrees, wrapping) and a
// target ramp. Matching texels keep their shading: each one's brightness, ranked among all matching texels,
// picks the ramp step (dark → light). `dark` optionally folds deep shadow texels of another hue band (the
// cloak's navy creases) onto the darkest steps. Hard alpha is untouched. The Feral's olive hooded cloak
// becomes bone / rust, so it no longer wears the player's costume.

import * as THREE from 'three';
import { PALETTE_SWAP } from '../data/jungle.js';
import { DERIVED_SPRITES } from '../data/bosses.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const inBand = (h, [a, b]) => (a <= b ? h >= a && h <= b : h >= a || h <= b);

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx / 255];
}

/**
 * Recolour the textures listed in PALETTE_SWAP in place (Assets.load, after the sheets are loaded). First, the
 * DERIVED_SPRITES (src/data/bosses.js) are made from their untouched source sheets as new keys (same manifest
 * entry, recoloured texture): the escort engineer, the Feral Chief / Pack Lord.
 */
export function paletteSwap(assets) {
  for (const [key, rule] of Object.entries(DERIVED_SPRITES)) {
    const src = assets.textures[rule.from];
    if (!src?.image?.width || assets.textures[key] || !assets.manifest[rule.from]) continue;
    assets.manifest[key] = { ...assets.manifest[rule.from] };
    assets.textures[key] = src;   // swapRule replaces it with a recoloured copy (the source stays)
    if (!swapRule(assets, key, rule, false)) { delete assets.textures[key]; delete assets.manifest[key]; }
  }
  for (const [key, rule] of Object.entries(PALETTE_SWAP)) swapRule(assets, key, rule, true);
}

/** Recolour assets.textures[key] by `rule` into a new texture (disposing the old one if `dispose`). False = nothing matched. */
function swapRule(assets, key, rule, dispose) {
  {
    const tex = assets.textures[key];
    const img = tex?.image;
    if (!img?.width) return false;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height), D = id.data;
    const ramp = rule.ramp.map(hex);
    const hit = [], dark = [];
    for (let i = 0; i < D.length; i += 4) {
      if (D[i + 3] < 128) continue;
      const [h, s, v] = hsv(D[i], D[i + 1], D[i + 2]);
      if (s >= rule.minS && v >= (rule.minV ?? 0) && rule.bands.some((b) => inBand(h, b))) hit.push([i, v]);
      else if (rule.dark && v <= rule.dark.maxV && s >= (rule.dark.minS ?? 0.1) && rule.dark.bands.some((b) => inBand(h, b))) dark.push([i, v]);
    }
    if (!hit.length) return false;
    // Rank brightness among the matches so the whole ramp is used, whatever the source's range.
    const vs = hit.map((t) => t[1]).sort((a, b) => a - b);
    const q = (p) => vs[Math.min(vs.length - 1, Math.floor(p * vs.length))];
    const lo = q(0.03), hi = q(0.97);
    const n = ramp.length;
    const put = (i, k) => { const col = ramp[Math.max(0, Math.min(n - 1, k))]; D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; };
    for (const [i, v] of hit) put(i, Math.floor(((v - lo) / Math.max(1e-3, hi - lo)) * (n - (rule.dark ? 1 : 0)) + (rule.dark ? 1 : 0)));
    for (const [i, v] of dark) put(i, v < rule.dark.maxV * 0.6 ? 0 : 1);
    g.putImageData(id, 0, 0);
    const nt = new THREE.CanvasTexture(c);
    nt.magFilter = THREE.NearestFilter;
    nt.minFilter = THREE.NearestFilter;
    nt.generateMipmaps = false;
    nt.colorSpace = THREE.SRGBColorSpace;
    assets.textures[key] = nt;
    if (dispose) tex.dispose();
    return true;
  }
}
