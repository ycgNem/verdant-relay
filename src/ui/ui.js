// DOM helpers for the overlay UI. Everything is plain elements styled by style.css.
// Sizes in CSS use `calc(var(--u) * N)` where --u is `game.u` = min(stage width / 960, stage height / 540),
// so layouts scale with the window and always fit a 960 × 540 UI box.

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
    const u = parseFloat(stage.style.getPropertyValue('--u')) || stage.clientWidth / 960;
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

/**
 * One resource as icon + amount + label (colour is never the only cue). opts.short = icon + amount only
 * (costs, tight bars): the full name is in the tooltip — never a 3-letter code (simplicity pass).
 */
export function resChip(key, amount, opts = {}) {
  const r = RESOURCES[key];
  return el(`span.res.res-${key}${opts.short ? '.short' : ''}`, { title: r.desc ? `${r.label}: ${r.desc}` : r.label, style: { '--c': r.color } },
    resIcon(key), el('b', String(amount)), opts.noLabel || opts.short ? null : el('span.lbl', r.label));
}

/**
 * Resources worth showing: Scrap always, the others only once you have some (they're introduced one
 * at a time, as you find them — a newcomer never sees a row of zeros).
 */
export function shownResources(res) {
  return RESOURCE_KEYS.filter((k) => k === 'scrap' || (res[k] || 0) > 0);
}

/** All resources in a row. `res` = { scrap, circuits, ... }. opts.all shows the zero ones too. */
export function resRow(res, opts = {}) {
  const keys = opts.all ? RESOURCE_KEYS : opts.skipZero ? RESOURCE_KEYS.filter((k) => res[k]) : shownResources(res);
  return el('div.resrow', {}, keys.map((k) => resChip(k, res[k] || 0, opts)));
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

/**
 * A modal dialog with a title, body and buttons. Returns the overlay node (remove() to close).
 * Keyboard (critic L §2.3, every dialog works without a mouse): the primary button has focus; Enter / Space / E
 * (and the bound interact key) press the focused button, arrows / W S / Tab move the focus, Esc presses the
 * cancel button. Only the topmost visible overlay listens, and it keeps those keys to itself (a capture
 * listener), so Esc that closes a dialog doesn't also reach the game. Keys are ignored for `opts.guard` s after
 * it opens (a key mashed in a fight can't confirm the dialog that just appeared).
 *   opts.cancel   the button Esc presses (default: the one marked with an "Esc" hotkey; else, next to a
 *                 danger button, the first safe one; else a lone button)
 *   opts.keys     false = the caller handles keys itself (screensKit.ask uses a KeyNav)
 *   opts.extraKeys  more codes that press the focused button (the jungle's bound interact key)
 */
export function modal(ui, title, body, buttons = [], opts = {}) {
  const box = panel('modal', el('h2', title), body, el('div.row.end', {}, buttons));
  const ov = el('div.overlay.ui-block', {}, box);
  ui.append(ov);
  if (opts.keys !== false) modalKeys(ui, ov, buttons.filter(Boolean), opts);
  return ov;
}

const MODAL_PRESS = new Set(['Enter', 'NumpadEnter', 'Space', 'KeyE']);
const MODAL_PREV = new Set(['ArrowUp', 'ArrowLeft', 'KeyW']);
const MODAL_NEXT = new Set(['ArrowDown', 'ArrowRight', 'KeyS']);

function modalKeys(ui, ov, buttons, opts) {
  const usable = () => buttons.filter((b) => b.isConnected && !b.classList.contains('disabled') && b.offsetParent !== null);
  const isEsc = (b) => [...b.querySelectorAll('.hotkey')].some((h) => h.textContent.trim() === 'Esc');
  const cancel = () => {
    if (opts.cancel) return opts.cancel;
    const list = usable();
    return list.find(isEsc) || (list.some((b) => b.classList.contains('danger')) ? list.find((b) => !b.classList.contains('danger')) : list.length === 1 ? list[0] : null);
  };
  let cur = null;
  const focus = (b) => {
    cur?.classList.remove('kfocus');
    cur = b || null;
    cur?.classList.add('kfocus');
  };
  focus(buttons.find((b) => b.classList.contains('primary')) || buttons[0]);
  const armAt = performance.now() + (opts.guard ?? 0.3) * 1000;
  const onKey = (e) => {
    if (!ov.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
    const shown = [...ui.querySelectorAll('.overlay')].filter((o) => o.style.display !== 'none' && o.offsetParent !== null);
    if (shown[shown.length - 1] !== ov) return;
    const c = e.code;
    const press = MODAL_PRESS.has(c) || opts.extraKeys?.includes(c);
    const move = MODAL_PREV.has(c) || MODAL_NEXT.has(c) || c === 'Tab';
    if (!press && !move && c !== 'Escape') return;
    const esc = c === 'Escape' ? cancel() : null;
    if (c === 'Escape' && !esc) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || performance.now() < armAt) return;
    if (esc) { esc.click(); return; }
    const list = usable();
    if (!list.length) return;
    if (move) {
      const d = MODAL_PREV.has(c) || (c === 'Tab' && e.shiftKey) ? -1 : 1;
      const i = list.indexOf(cur);
      focus(list[((i < 0 ? (d > 0 ? -1 : 0) : i) + d + list.length) % list.length]);
      return;
    }
    (list.includes(cur) ? cur : list[0]).click();
  };
  window.addEventListener('keydown', onKey, true);
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
