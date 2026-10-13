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
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
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

/** One resource as icon + amount + label (colour is never the only cue). */
export function resChip(key, amount, opts = {}) {
  const r = RESOURCES[key];
  return el(`span.res.res-${key}${opts.short ? '.short' : ''}`, { title: r.label, style: { '--c': r.color } },
    el('span.glyph', r.glyph), el('b', String(amount)), opts.noLabel ? null : el('span.lbl', opts.short ? r.short : r.label));
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
  if (!host) { host = el('div.toasts'); ui.append(host); }
  const t = el(`div.toast${cls ? '.' + cls : ''}`, text);
  host.append(t);
  setTimeout(() => t.classList.add('out'), time * 1000);
  setTimeout(() => t.remove(), time * 1000 + 400);
  return t;
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
