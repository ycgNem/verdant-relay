// Relic and lore UI pieces shared by the jungle, the summary, night prep and the Codex (src/data/relics.js, lore.js).
//
//   relicKey(assets, id)        world sprite key for a relic lying in the jungle: a generic pendant in its rarity's
//                               colours (a 12×12 canvas texture registered with Assets, pixel-exact)
//   relicIcon(game, id, size, { silhouette })   DOM icon (size in UI units): the `relic_<id>` plaque art, else the
//                               pendant; unseen Codex entries as dark silhouettes
//   relicCard(game, id, opts)   icon + name + rarity + what it does (+ a cursed relic's price in red-violet)
//   relicTag(game, id)          a small inline chip (icon + name), the effect in the tooltip
// Styles: src/ui/relics.css.

import * as THREE from 'three';
import './relics.css';
import { el } from './ui.js';
import { iconEl } from './screensKit.js';
import { RELICS, RARITY } from '../data/relics.js';

// The generic pendant (the world's relic; the UI's fallback without `relic_<id>` art): c cord, o outline, h highlight, l light, m mid, d shade.
const PENDANT = [
  '...cccccc...',
  '..c......c..',
  '..c......c..',
  '...c....c...',
  '....c..c....',
  '....oooo....',
  '...ohllmo...',
  '..ohllmmmo..',
  '..ollmmmdo..',
  '...ommmdo...',
  '....omdo....',
  '.....oo.....',
];
const PALETTE = {
  C: { o: '#3a2c1c', h: '#fff8e8', l: '#ead4aa', m: '#c8a878', d: '#8a6a44' },
  R: { o: '#4a2c10', h: '#fffbe0', l: '#fee761', m: '#feae34', d: '#b86f20' },
  X: { o: '#2a0f1e', h: '#ffd8ec', l: '#e05a9a', m: '#b55088', d: '#6b2848' },
};
const CORD = '#5a4430';
const _canvas = {};
const _url = {};

function pendantCanvas(rarity) {
  if (_canvas[rarity]) return _canvas[rarity];
  const P = PALETTE[rarity] || PALETTE.C;
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const g = c.getContext('2d');
  PENDANT.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = ch === 'c' ? CORD : P[ch];
    g.fillRect(x, y, 1, 1);
  }));
  _canvas[rarity] = c;
  return c;
}

/** Data URL of the generic pendant for `rarity` (DOM icons). */
export function pendantUrl(rarity) {
  return _url[rarity] || (_url[rarity] = pendantCanvas(rarity).toDataURL());
}

/** Does the art pass have an icon for this relic yet? */
export function hasRelicArt(assets, id) { return !!assets?.hasSprite?.(`relic_${id}`); }

/**
 * World sprite key for a relic lying in the jungle: a small pendant in its rarity colours (registered once as
 * `relic__pendant_<R>` with Assets, the same way Assets.spentVariant registers derived sprites). The `relic_<id>`
 * art is a framed UI plaque, so it stays in the HUD / cards; the world shows a physical trinket.
 */
export function relicKey(assets, id) {
  const r = RELICS[id]?.rarity || 'C';
  const key = `relic__pendant_${r}`;
  if (!assets.textures[key]) {
    const tex = new THREE.CanvasTexture(pendantCanvas(r));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    assets.textures[key] = tex;
    assets.manifest[key] = { ppu: 32, frames: 1, shadow: 0.12 };
  }
  return key;
}

/**
 * A relic's DOM icon, `size` UI units square, drawn at a whole-number scale. opts.silhouette: a dark shape
 * (a relic not found yet, in the Codex).
 */
export function relicIcon(game, id, size = 18, opts = {}) {
  const R = RELICS[id];
  const sil = opts.silhouette ? '.rl-sil' : '';
  if (hasRelicArt(game.assets, id)) {
    const n = iconEl(game, `relic_${id}`, size);
    n.classList.add('rl-icon');
    if (opts.silhouette) n.classList.add('rl-sil');
    return n;
  }
  // The pendant is 12 texels: the biggest whole multiple of device px that fits the box.
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.floor((size * (game.u || 1) * dpr) / 12 + 0.15)) / dpr;
  return el(`span.vicon.rl-icon${sil}`, { style: { width: `calc(var(--u) * ${size})`, height: `calc(var(--u) * ${size})` } },
    el('span.rl-pend', { style: { width: `${12 * k}px`, height: `${12 * k}px`, backgroundImage: `url(${pendantUrl(R?.rarity || 'C')})` } }));
}

/** Rarity word in its colour ("Rare"). */
export function rarityTag(id) {
  const r = RARITY[RELICS[id]?.rarity] || RARITY.C;
  return el(`span.rl-rar.rl-${RELICS[id]?.rarity || 'C'}`, r.name);
}

/** Tooltip text for a relic: "Name (Rare): what it does. Price: …". */
export function relicTitle(id) {
  const R = RELICS[id];
  if (!R) return '';
  return `${R.name} (${RARITY[R.rarity].name}): ${R.text}${R.down ? ` Price: ${R.down}` : ''}`;
}

/**
 * A card: icon, name, rarity, what it does, and a cursed relic's price in red-violet. opts.line overrides the
 * effect text (a live value from relicLive); opts.size = icon size (UI units); opts.cls adds classes.
 */
export function relicCard(game, id, opts = {}) {
  const R = RELICS[id];
  if (!R) return null;
  return el(`div.rl-card.rl-${R.rarity}${opts.cls ? '.' + opts.cls : ''}`, { title: relicTitle(id) },
    relicIcon(game, id, opts.size || 24),
    el('div.rl-body', {},
      el('div.rl-name', {}, el('b', R.name), ' ', rarityTag(id)),
      el('div.rl-text', opts.line || R.text),
      R.down ? el('div.rl-down', `Price: ${R.down}`) : null));
}

/** A small inline chip: icon + name (the effect in the tooltip). */
export function relicTag(game, id, opts = {}) {
  const R = RELICS[id];
  if (!R) return null;
  return el(`span.rl-tag.rl-${R.rarity}${opts.lost ? '.lost' : ''}`, { title: relicTitle(id) }, relicIcon(game, id, opts.size || 14), el('span', R.name));
}
