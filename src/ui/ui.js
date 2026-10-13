// DOM helpers for the overlay UI. Everything is plain elements styled by style.css.
// Sizes in CSS use `calc(var(--u) * N)` where --u is 1/960 of the stage width, so layouts
// scale with the window.

import { RESOURCES, RESOURCE_KEYS } from '../data/config.js';

/** el('div.panel.wide', { onclick, style, title }, ...children) */
export function el(spec, attrs = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = {};
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      // CSS custom properties ('--c') must go through setProperty; Object.assign drops them.
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) node.style.setProperty(sk, sv);
        else node.style[sk] = sv;
      }
    }
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** A clickable button. `opts.disabled` greys it out; `opts.reason` shows as tooltip + small text. */
export function button(label, onClick, opts = {}) {
  const b = el(`button.btn${opts.cls ? '.' + opts.cls.split(' ').join('.') : ''}`, {
    title: opts.title || opts.reason || null,
    onclick: (e) => {
      e.stopPropagation();
      if (b.classList.contains('disabled')) { opts.onDisabled?.(); return; }
      onClick?.(e);
    },
  }, label);
  if (opts.disabled) b.classList.add('disabled');
  if (opts.hotkey) b.append(el('span.hotkey', opts.hotkey));
  return b;
}

/** A framed panel. */
export function panel(cls = '', ...children) {
  return el(`div.panel.ui-block${cls ? '.' + cls.split(' ').join('.') : ''}`, {}, ...children);
}

// Sprite icons for DOM text (resources, med kits). The pick_* sprites are 12×12; they are drawn at a
// whole multiple of their size (--ri = 12, 24 or 36 px, picked from the stage width) so every texel is
// a whole number of screen pixels. A ResizeObserver keeps --ri in step with the letterboxed stage.
const ICON_FILES = { pick_scrap: 'pick_scrap.png', pick_circuits: 'pick_circuits.png', pick_biofiber: 'pick_biofiber.png', pick_intel: 'pick_intel.png', pick_med: 'pick_med.png' };
(function watchIconScale() {
  const stage = typeof document !== 'undefined' && document.getElementById('stage');
  if (!stage || typeof ResizeObserver === 'undefined') return;
  const set = () => {
    const u = stage.clientWidth / 960;
    const s = Math.max(1, Math.round(u * 1.2 * (window.devicePixelRatio || 1))) / (window.devicePixelRatio || 1);
    stage.style.setProperty('--ri', `${12 * s}px`);
  };
  new ResizeObserver(set).observe(stage);
  set();
})();

/** A pixel icon span for a sprite key (pick_scrap…) or a resource key ('scrap'). Falls back to the glyph. */
export function resIcon(key, opts = {}) {
  const r = RESOURCES[key];
  const sk = r ? r.icon : key;
  const file = ICON_FILES[sk];
  if (!file) return el('span.glyph', r?.glyph || '◆');
  return el(`span.ricon${opts.cls ? '.' + opts.cls : ''}`, { style: { backgroundImage: `url(${import.meta.env.BASE_URL}sprites/${file})` }, 'aria-hidden': 'true' });
}

/** HTML string version of resIcon() for innerHTML / floating text. */
export function resIconHtml(key) {
  const r = RESOURCES[key];
  const file = ICON_FILES[r ? r.icon : key];
  if (!file) return r?.glyph || '';
  return `<span class="ricon" style="background-image:url(${import.meta.env.BASE_URL}sprites/${file})"></span>`;
}

/** One resource as icon + amount + label (colour is never the only cue). */
export function resChip(key, amount, opts = {}) {
  const r = RESOURCES[key];
  return el(`span.res.res-${key}${opts.short ? '.short' : ''}`, { title: r.desc ? `${r.label}: ${r.desc}` : r.label, style: { '--c': r.color } },
    resIcon(key), el('b', String(amount)), opts.noLabel ? null : el('span.lbl', opts.short ? r.short : r.label));
}

/** All resources in a row. `res` = { scrap, circuits, ... } */
export function resRow(res, opts = {}) {
  return el('div.resrow', {}, RESOURCE_KEYS.filter((k) => !opts.skipZero || res[k]).map((k) => resChip(k, res[k] || 0, opts)));
}

/** A cost line, e.g. "45 ⚙ Scrap · 1 ❦ Biofiber"; marks unaffordable parts red. */
export function costLine(cost, have) {
  const parts = RESOURCE_KEYS.filter((k) => cost[k]).map((k) => {
    const chip = resChip(k, cost[k], { short: true });
    if (have && (have[k] || 0) < cost[k]) chip.classList.add('short-of');
    return chip;
  });
  if (!parts.length) return el('span.cost.free', 'FREE');
  return el('span.cost', {}, parts);
}

/** A horizontal bar. Returns { node, set(frac, text) }. */
export function bar(cls = '', color = 'var(--good)') {
  const fill = el('div.fill', { style: { background: color } });
  const label = el('span.barlbl');
  const node = el(`div.bar${cls ? '.' + cls : ''}`, {}, fill, label);
  return {
    node,
    set(frac, text) {
      fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      if (text != null) label.textContent = text;
    },
  };
}

/** Transient message near the top-centre of the stage. */
export function toast(ui, text, cls = '', time = 2.4) {
  let host = ui.querySelector('.toasts');
  if (!host) { host = el('div.toasts'); ui.append(host); host._queue = []; }
  // Hosts can cap how many toasts show at once (the night map: 2). Extra ones wait their turn
  // instead of stacking over the play area; a toast identical to one on screen is dropped.
  const max = Number(getComputedStyle(host).getPropertyValue('--max-toasts')) || 3;
  const live = () => [...host.children].filter((c) => !c.classList.contains('out'));
  if (live().some((c) => c.textContent === String(text))) return null;
  const t = el(`div.toast${cls ? '.' + cls : ''}`, text);
  const show = () => {
    if (!host.isConnected) return;
    host.append(t);
    // Game-time lifetime: the clock stops while the host is paused (setToastsPaused).
    let left = time * 1000, last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      if (!host._paused) left -= now - last;
      last = now;
      if (!host.isConnected) { clearInterval(tick); return; }
      if (left > 0) return;
      clearInterval(tick);
      t.classList.add('out');
      setTimeout(() => { t.remove(); const next = host._queue.shift(); if (next) next(); }, 400);
    }, 100);
  };
  if (live().length >= max) {
    if (host._queue.length >= 4) host._queue.shift();   // a long backlog: drop the stalest message
    host._queue.push(show);
  } else show();
  return t;
}

/** Freeze (or resume) toast timers, e.g. while the game is paused. */
export function setToastsPaused(ui, paused) {
  let host = ui.querySelector('.toasts');
  if (!host) { host = el('div.toasts'); ui.append(host); host._queue = []; }
  host._paused = !!paused;
}

/** A modal dialog with a title, body and buttons. Returns the overlay node (remove() to close). */
export function modal(ui, title, body, buttons = []) {
  const box = panel('modal', el('h2', title), body, el('div.row.end', {}, buttons));
  const ov = el('div.overlay.ui-block', {}, box);
  ui.append(ov);
  return ov;
}

/** Floating world text (damage numbers, pickups). Positioned each frame by the caller via place(). */
export function floatText(ui, text, color = '#ead4aa', cls = '') {
  const n = el(`div.float${cls ? '.' + cls : ''}`, { style: { color } }, text);
  ui.append(n);
  return n;
}

export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
