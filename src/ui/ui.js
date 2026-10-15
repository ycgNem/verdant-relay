// DOM helpers for the overlay UI. Everything is plain elements styled by style.css.
// Sizes in CSS use `calc(var(--u) * N)` where --u is `game.u` = min(stage width / 960, stage height / 540),
// so layouts scale with the window and always fit a 960 × 540 UI box.

import { RESOURCES, RESOURCE_KEYS } from '../data/config.js';
import { TEXT_LANE } from '../data/hud.js';

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
      if (text != null && label.textContent !== text) {
        label.textContent = text;
        requestAnimationFrame(() => snapLine(label));   // the centred number on whole pixels (critic M2 P1-3)
      }
    },
  };
}

/**
 * Centred one-line text on whole pixels (critic M2 P1-3): centring an integer-wide line in a box of the other parity
 * puts every glyph stem on x.5. Measures where the line starts and pads the box's left by twice the shortfall, which
 * moves the centred line right by exactly that. Only for centred, one-line content; call after layout.
 */
export function snapLine(node) {
  if (!node?.isConnected) return;
  node.style.paddingLeft = '';
  const rg = document.createRange();
  rg.selectNodeContents(node);
  const rr = [...rg.getClientRects()].filter((r) => r.width > 0);
  if (!rr.length || rr.some((r) => Math.abs(r.top - rr[0].top) > 1)) return;
  const x = Math.min(...rr.map((r) => r.x)), f = x - Math.floor(x);
  if (f > 0.02 && f < 0.98) node.style.paddingLeft = `${(parseFloat(getComputedStyle(node).paddingLeft) + (Math.ceil(x) - x) * 2).toFixed(3)}px`;
}

/**
 * A box centred by its container (grid / flex centring: modals, the settings panel, the big map) on whole pixels
 * (critic M2 P1-3: an odd leftover put the whole panel, and every line in it, on x.5): nudged by the `translate`
 * property by the fraction it is off, again whenever it or its container changes size.
 */
export function snapBox(node) {
  if (!node) return node;
  let ro = null;
  const snap = () => {
    if (!node.isConnected) { ro?.disconnect(); return; }
    node.style.translate = '';
    const r = node.getBoundingClientRect();
    if (!r.width) return;
    const dx = Math.round(r.x) - r.x, dy = Math.round(r.y) - r.y;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) node.style.translate = `${dx.toFixed(3)}px ${dy.toFixed(3)}px`;
  };
  requestAnimationFrame(snap);
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => requestAnimationFrame(snap));
    ro.observe(node);
    if (node.parentElement) ro.observe(node.parentElement);
  }
  return node;
}

/** snapLine for every centred element under `root` that holds text directly (results, menus). */
export function snapCentred(root) {
  if (!root?.isConnected) return;
  for (const e of root.querySelectorAll('*')) {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.querySelector(':scope > span, :scope > b')) continue;
    const cs = getComputedStyle(e);
    if (cs.textAlign !== 'center' || cs.display === 'inline') continue;
    snapLine(e);
  }
}

/** The toast host: the first `.toasts` under `ui` (a scene may place its own, e.g. under the jungle HUD panel). */
function toastHost(ui) {
  let host = ui.querySelector('.toasts');
  if (!host) { host = el('div.toasts'); ui.append(host); }
  host._queue ||= [];
  return host;
}

// One text lane (critic H2 §5.1): toasts never pile up. A host shows at most `--max-toasts` at once (CSS; the jungle
// 1, the night map 2, else 3); the rest wait in a short queue (the stalest dropped from a long backlog, entries
// older than TOAST_QUEUE.stale s dropped) while a toast on screen with a queue behind it is cut to TOAST_QUEUE.hurry s.
// setToastsHeld() holds new ones back while a banner owns the screen, each for at most TOAST_QUEUE.hold s.
const TOAST_QUEUE = TEXT_LANE.toast;

/** Transient message (where the host sits: top centre by default, under the HUD panel in the jungle). */
export function toast(ui, text, cls = '', time = 2.4) {
  const host = toastHost(ui);
  const max = Number(getComputedStyle(host).getPropertyValue('--max-toasts')) || 3;
  const live = () => [...host.children].filter((c) => !c.classList.contains('out'));
  // A toast identical to one on screen or waiting is dropped.
  if (live().some((c) => c.textContent === String(text)) || host._queue.some((q) => q.text === String(text))) return null;
  const t = el(`div.toast${cls ? '.' + cls : ''}`, text);
  const show = () => {
    if (!host.isConnected) return;
    host.append(t);
    // Game-time lifetime: the clock stops while the host is paused (setToastsPaused).
    let left = time * 1000, last = performance.now(), shown = 0;
    const tick = setInterval(() => {
      const now = performance.now();
      if (!host._paused) { left -= now - last; shown += now - last; }
      last = now;
      if (!host.isConnected) { clearInterval(tick); return; }
      // Others are waiting: let this one go sooner (it has been read by now).
      if (host._queue.length && left > TOAST_QUEUE.hurry * 1000 - shown) left = Math.max(0, TOAST_QUEUE.hurry * 1000 - shown);
      if (left > 0) return;
      clearInterval(tick);
      t.classList.add('out');
      setTimeout(() => { t.remove(); pumpToasts(host); }, 400);
    }, 100);
  };
  if (host._queue.length || live().length >= max || toastsHeld(host)) {
    if (host._queue.length >= TOAST_QUEUE.max) host._queue.shift();   // a long backlog: drop the stalest message
    host._queue.push({ show, text: String(text), at: performance.now() });
    watchQueue(host);
  } else show();
  return t;
}

function toastsHeld(host) { return performance.now() < (host._heldUntil || 0); }

/** Show waiting toasts while there is room (and no banner holds them, or they've waited long enough). */
function pumpToasts(host) {
  if (!host.isConnected) return;
  const max = Number(getComputedStyle(host).getPropertyValue('--max-toasts')) || 3;
  const now = performance.now();
  host._queue = host._queue.filter((q) => now - q.at < TOAST_QUEUE.stale * 1000);
  for (;;) {
    const live = [...host.children].filter((c) => !c.classList.contains('out')).length;
    const q = host._queue[0];
    if (!q || live >= max || (toastsHeld(host) && now - q.at < TOAST_QUEUE.hold * 1000)) break;
    host._queue.shift();
    q.show();
  }
}

/** While the queue has entries, re-check it a few times a second (holds expire on their own). */
function watchQueue(host) {
  if (host._watch) return;
  host._watch = setInterval(() => {
    if (!host.isConnected || !host._queue.length) { clearInterval(host._watch); host._watch = null; return; }
    if (!host._paused) pumpToasts(host);
  }, 120);
}

/** Freeze (or resume) toast timers, e.g. while the game is paused. */
export function setToastsPaused(ui, paused) {
  toastHost(ui)._paused = !!paused;
}

/** Hold new toasts back for `seconds` (a banner owns the screen); 0 releases them. */
export function setToastsHeld(ui, seconds) {
  const host = toastHost(ui);
  host._heldUntil = seconds > 0 ? performance.now() + seconds * 1000 : 0;
  if (!(seconds > 0)) pumpToasts(host);
}

/**
 * Pin a centred, absolutely positioned node (CSS `left: X; transform: translate(-50%[, -50%])`) to whole pixels
 * (critic M2 P1-3: translate(-50%) on an odd width put "SUNSET" on a half pixel, every stem a blurred pair). Takes
 * the CSS layout box (offsetLeft / offsetTop: the anchor, transforms and running animations ignored) and replaces
 * the centring transform with integer left / top and a whole-pixel width; again whenever its size changes (a
 * countdown line). opts.cy: the CSS also centres it vertically (translate(-50%, -50%)). Must be in the document.
 */
export function pinWhole(node, opts = {}) {
  let busy = false;
  const pin = () => {
    if (busy || !node.offsetParent || !node.isConnected) return;
    busy = true;
    const s = node.style;
    s.left = s.top = s.transform = s.width = s.right = s.bottom = '';
    // The used (fractional, border-box) width rounded up, so the text never re-wraps.
    const w = Math.ceil(parseFloat(getComputedStyle(node).width) - 0.01);
    const x = node.offsetLeft, y = node.offsetTop, h = node.offsetHeight;
    s.width = `${w}px`;
    s.left = `${Math.round(x - w / 2)}px`;
    s.top = `${Math.round(opts.cy ? y - h / 2 : y)}px`;
    s.right = s.bottom = 'auto';
    s.transform = 'none';
    busy = false;
  };
  pin();
  // Again after its content changes (one re-pin per frame) or it is resized / shown; stops once it leaves the page.
  let queued = false;
  const later = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!node.isConnected) { mo?.disconnect(); ro?.disconnect(); return; }
      pin();
    });
  };
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(later) : null;
  mo?.observe(node, { subtree: true, childList: true, characterData: true });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(later) : null;
  ro?.observe(node);
  return node;
}

/**
 * A banner in the top-centre band (critic H2 §5.1, TEXT_LANE.banner): one at a time per `parent` (the lane lives on
 * it, so it goes with the scene's HUD). The node is appended to `parent`, gets class `out` for its last `fade` s and
 * is removed. opts:
 *   prio   a higher one cuts a lower one on screen; an equal or lower one waits its turn (default 1)
 *   time   seconds on screen before the fade (default TEXT_LANE.banner.time)
 *   wait   drop it if it has waited this long (s) for its turn (place names)
 *   toasts the UI root whose toasts are held while it shows (setToastsHeld)
 *   onShow called when it actually shows (its sound)
 * Returns the node.
 */
export function showBanner(parent, node, opts = {}) {
  const B = TEXT_LANE.banner;
  const L = parent._lane ||= { cur: null, q: [] };
  const item = { node, prio: opts.prio ?? 1, time: opts.time ?? B.time, wait: opts.wait ?? Infinity, at: performance.now(), toasts: opts.toasts || null, onShow: opts.onShow };
  if (L.cur && item.prio > L.cur.prio) endBanner(parent, L.cur, true);
  L.q.push(item);
  L.q.sort((a, b) => b.prio - a.prio);   // stable: equal priorities keep their order
  nextBanner(parent);
  return node;
}

function nextBanner(parent) {
  const L = parent._lane;
  if (!L || L.cur || !parent.isConnected) return;
  const now = performance.now();
  L.q = L.q.filter((it) => now - it.at < it.wait * 1000);
  const it = L.q.shift();
  if (!it) return;
  const B = TEXT_LANE.banner;
  L.cur = it;
  parent.append(it.node);
  // Whole-pixel centring (pinWhole): the jungle's .x-banner is centred both ways, the rest horizontally.
  pinWhole(it.node, { cy: it.node.classList.contains('x-banner') });
  it.onShow?.();
  if (it.toasts) setToastsHeld(it.toasts, it.time + B.fade);
  it.timers = [
    setTimeout(() => it.node.classList.add('out'), it.time * 1000),
    setTimeout(() => endBanner(parent, it), (it.time + B.fade) * 1000),
  ];
}

function endBanner(parent, it, cut = false) {
  const L = parent._lane;
  for (const t of it.timers || []) clearTimeout(t);
  it.node.remove();
  if (L.cur === it) L.cur = null;
  if (it.toasts && !cut) setToastsHeld(it.toasts, 0);
  if (!cut) nextBanner(parent);
}

/** End this banner early (it fades out first), or drop it if it is still waiting (the quest card once you walk off). */
export function dismissBanner(parent, node) {
  const L = parent?._lane;
  if (!L) return;
  const it = L.cur?.node === node ? L.cur : null;
  if (!it) { L.q = L.q.filter((q) => q.node !== node); return; }
  for (const t of it.timers || []) clearTimeout(t);
  node.classList.add('out');
  it.timers = [setTimeout(() => endBanner(parent, it), TEXT_LANE.banner.fade * 1000)];
}

/** True while a banner is up (or waiting) in this parent's lane. */
export function bannerBusy(parent) { const L = parent?._lane; return !!(L && (L.cur || L.q.length)); }

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
  snapBox(box);   // whole pixels (critic M2 P1-3)
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
