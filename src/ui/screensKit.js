// Shared pieces for the menu / meta screens (title, settings, collection, briefing, summary, results).
//
//   KeyNav     arrow-key focus + Enter/Esc for a list of buttons; one active layer at a time
//   ask()      confirm dialog → Promise<boolean>
//   sbtn()     button() + click sound
//   iconEl()   pixel icon for any visual key (sprite frame, rendered placeholder thumbnail, or glyph)
//   skillPicker()  the "spend a skill point" card row used by Briefing and Summary
//
// Note: Input.js swallows Tab and Space, so keyboard support here is explicit (arrows, Enter, Esc, digits).

import * as THREE from 'three';
import { el, button, modal, toast } from './ui.js';
import { SKILLS } from '../data/skills.js';
import { VISUALS } from '../data/visuals.js';

export const RESEARCH = { label: 'Research', color: '#fee761', glyph: '◈' };
export const BRANCH_COLOR = { Scavenger: '#feae34', Machete: '#c0cbdc', Engineer: '#2ce8f5', Warden: '#63c74d' };   // Machete: blade steel

/** Research Data as icon + amount + label, matching resChip(). */
export function researchChip(amount, opts = {}) {
  return el(`span.res.res-research${opts.cls ? '.' + opts.cls : ''}`, { title: 'Research Data (permanent)', style: { '--c': RESEARCH.color } },
    el('span.glyph', RESEARCH.glyph), el('b', String(amount)), opts.noLabel ? null : el('span.lbl', opts.label || RESEARCH.label));
}

/** button() that also plays a sound. opts.sfx (default 'ui_confirm'); disabled clicks play 'error'. */
export function sbtn(game, label, onClick, opts = {}) {
  const sfx = 'sfx' in opts ? opts.sfx : 'ui_confirm';
  const b = button(label, (e) => { if (sfx) game.sfx.play(sfx); onClick?.(e); }, {
    ...opts,
    onDisabled: () => {
      game.sfx.play('error');
      if (opts.reason) toast(game.ui, opts.reason, 'bad', 1.8);
      opts.onDisabled?.();
    },
  });
  return b;
}

// ------------------------------------------------------------------ keyboard navigation

/**
 * new KeyNav(game, { items: () => [elements], layer, onKey(e) → true if handled, onEnter(), onEscape(), start })
 * Only the topmost layer reacts: a nav with `layer` = an overlay element is active while that overlay is
 * the last .overlay in game.ui; a nav without a layer is active only while no overlay is open.
 */
export class KeyNav {
  constructor(game, opts = {}) {
    this.game = game;
    this.opts = opts;
    this.layer = opts.layer || null;
    this.index = -1;
    this.cur = null;
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
    if (opts.start != null) this.focus(opts.start);
  }

  active() {
    if (this.layer && !this.layer.isConnected) { this.dispose(); return false; }
    const ovs = this.game.ui.querySelectorAll('.overlay');
    const top = ovs.length ? ovs[ovs.length - 1] : null;
    return this.layer ? top === this.layer : !top;
  }

  items() {
    return (this.opts.items?.() || []).filter((n) => n && n.isConnected && !n.classList.contains('disabled') && n.offsetParent !== null);
  }

  focus(i) {
    const list = this.items();
    if (!list.length) return;
    this.index = ((i % list.length) + list.length) % list.length;
    this.cur?.classList.remove('kfocus');
    this.cur = list[this.index];
    this.cur.classList.add('kfocus');
    this.cur.scrollIntoView?.({ block: 'nearest' });
  }

  move(d) {
    const list = this.items();
    if (!list.length) return;
    let i = this.cur ? list.indexOf(this.cur) : -1;
    if (i < 0) {
      const hovered = list.findIndex((n) => n.matches(':hover'));
      i = hovered >= 0 ? hovered - d : d > 0 ? -1 : 0;
    }
    this.focus(i + d);
    this.game.sfx.play('ui_move');
  }

  clear() {
    this.cur?.classList.remove('kfocus');
    this.cur = null;
    this.index = -1;
  }

  _key(e) {
    if (!this.active()) return;
    if (this.opts.onKey?.(e)) { e.preventDefault(); return; }
    switch (e.code) {
      case 'ArrowUp': case 'ArrowLeft': case 'KeyW':
        if (this.opts.horizontalOnly && (e.code === 'ArrowUp' || e.code === 'KeyW')) return;
        e.preventDefault(); this.move(-1); break;
      case 'ArrowDown': case 'ArrowRight': case 'KeyS':
        if (this.opts.horizontalOnly && (e.code === 'ArrowDown' || e.code === 'KeyS')) return;
        e.preventDefault(); this.move(1); break;
      case 'Enter': case 'NumpadEnter': case 'Space':
        e.preventDefault();
        if (e.repeat) return;
        if (this.cur && this.cur.isConnected && this.cur.offsetParent !== null) this.cur.click();
        else this.opts.onEnter?.();
        break;
      case 'Escape':
        e.preventDefault();
        if (this.opts.onEscape) this.game.sfx.play('ui_back');
        this.opts.onEscape?.();
        break;
      default:
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.cur?.classList.remove('kfocus');
  }
}

/** Disposable bag for scenes: track KeyNavs, timers and callbacks, then free them in exit(). */
export class Bag {
  constructor() { this.items = []; }
  add(x) { this.items.push(x); return x; }
  timeout(fn, ms) { const id = setTimeout(fn, ms); this.items.push(() => clearTimeout(id)); return id; }
  dispose() {
    for (const x of this.items) {
      try { typeof x === 'function' ? x() : x.dispose?.(); } catch (e) { console.error(e); }
    }
    this.items = [];
  }
}

// ------------------------------------------------------------------ dialogs

/**
 * Confirmation dialog. Returns a Promise<boolean>. Enter = focused button, Esc = cancel.
 * opts: { title, text | body, confirm, cancel, danger, defaultCancel }
 */
export function ask(game, opts) {
  return new Promise((resolve) => {
    let done = false;
    const close = (v) => {
      if (done) return;
      done = true;
      nav.dispose();
      ov.remove();
      resolve(v);
    };
    const cancel = sbtn(game, opts.cancel || 'Cancel', () => close(false), { hotkey: 'Esc' });
    const ok = sbtn(game, opts.confirm || 'Confirm', () => close(true), { cls: opts.danger ? 'danger' : 'primary', sfx: opts.danger ? 'sell' : 'ui_confirm' });
    const body = opts.body || el('p', opts.text || '');
    const ov = modal(game.ui, opts.title || 'Are you sure?', body, [cancel, ok], { keys: false });   // KeyNav below
    ov.classList.add('scr-modal');
    ov.addEventListener('click', (e) => { if (e.target === ov) close(false); });
    const nav = new KeyNav(game, { layer: ov, items: () => [cancel, ok], onEscape: () => close(false), start: opts.defaultCancel ? 0 : 1 });
  });
}

/** A modal overlay holding arbitrary content (pause menus, embedded settings). Returns { ov, close }. */
export function overlay(game, content, opts = {}) {
  const ov = el('div.overlay.ui-block.scr-modal', {}, content);
  game.ui.append(ov);
  if (opts.clickOutside) ov.addEventListener('click', (e) => { if (e.target === ov) opts.clickOutside(); });
  return { ov, close: () => ov.remove() };
}

// ------------------------------------------------------------------ icons

const thumbCache = new Map();

function toSrgb(v) {
  const c = v / 255;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}

/** Render a placeholder model to a small transparent PNG (cached for the session). */
function renderThumb(game, key, px = 40) {
  const ck = `${key}@${px}`;
  if (thumbCache.has(ck)) return thumbCache.get(ck);
  let url = null;
  const r = game.renderer;
  let rt = null, v = null;
  const prevColor = new THREE.Color();
  r.getClearColor(prevColor);
  const prevAlpha = r.getClearAlpha();
  const prevTarget = r.getRenderTarget();
  try {
    rt = new THREE.WebGLRenderTarget(px, px);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a4466', 1.7));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
    sun.position.set(3, 5, -2);
    scene.add(sun);
    v = game.assets.makeVisual(key, { shadow: false });
    scene.add(v);
    v.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(v);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    cam.position.copy(center).add(new THREE.Vector3(0.75, 0.75, -1.3).normalize().multiplyScalar(size * 2 + 2));
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    // Fit the ortho frustum to the projected box corners.
    const inv = cam.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const half = Math.max(maxX - minX, maxY - minY) / 2 * 0.98;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    cam.left = cx - half; cam.right = cx + half; cam.top = cy + half; cam.bottom = cy - half;
    cam.updateProjectionMatrix();

    r.setClearColor(0x000000, 0);
    r.setRenderTarget(rt);
    r.clear();
    r.render(scene, cam);
    const buf = new Uint8Array(px * px * 4);
    r.readRenderTargetPixels(rt, 0, 0, px, px, buf);
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    const img = g.createImageData(px, px);
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const si = ((px - 1 - y) * px + x) * 4, di = (y * px + x) * 4;
        const a = buf[si + 3];
        img.data[di] = toSrgb(buf[si]);
        img.data[di + 1] = toSrgb(buf[si + 1]);
        img.data[di + 2] = toSrgb(buf[si + 2]);
        img.data[di + 3] = a > 127 ? 255 : 0;
      }
    }
    // 1px dark outline around the silhouette, like the sprite style.
    const out = g.createImageData(px, px);
    out.data.set(img.data);
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const i = (y * px + x) * 4;
        if (img.data[i + 3]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < px && ny < px && img.data[(ny * px + nx) * 4 + 3];
        });
        if (near) { out.data[i] = 0x18; out.data[i + 1] = 0x14; out.data[i + 2] = 0x25; out.data[i + 3] = 255; }
      }
    }
    g.putImageData(out, 0, 0);
    url = c.toDataURL();
  } catch (e) {
    console.warn('Icon render failed for', key, e);
    url = null;
  } finally {
    try {
      r.setRenderTarget(prevTarget);
      r.setClearColor(prevColor, prevAlpha);
      if (v) game.assets.disposeVisual(v);
      rt?.dispose();
    } catch { /* ignore */ }
  }
  thumbCache.set(ck, url);
  return url;
}

/**
 * A pixel icon for a visual key, sized `size` stage units (scales with the window).
 * Sprite listed in the manifest → its first frame. Otherwise a rendered thumbnail of the placeholder
 * model. Otherwise a coloured glyph.
 */
export function iconEl(game, key, size = 28, opts = {}) {
  const box = el('span.vicon', { style: { width: `calc(var(--u) * ${size})`, height: `calc(var(--u) * ${size})` } });
  const info = game.assets.spriteInfo?.(key);
  if (info?.tex?.image) {
    // Integer-scaled (Assets.iconScale): the biggest 1×/2×/3× (or even 1/n) that fits the box.
    const boxPx = size * (game.u || 1);
    const spec = game.assets.iconSpec ? game.assets.iconSpec(key, boxPx) : { css: game.assets.iconStyle(key, boxPx) };
    box.append(el('span.vicon-sprite', { style: spec.css }));
    // A creature drawn at 1× may be bigger than the slot (never ½: Assets.iconScale): the box grows with it.
    if (spec.w > boxPx) box.style.minWidth = `${spec.w}px`;
    if (spec.h > boxPx) box.style.minHeight = `${spec.h}px`;
    return box;
  }
  const base = key.replace(/_\d+$/, '');
  if (VISUALS[key] || VISUALS[base]) {
    const url = renderThumb(game, VISUALS[key] ? key : base, opts.px || 40);
    if (url) {
      box.append(el('img.vicon-img', { src: url, alt: '', draggable: 'false' }));
      return box;
    }
  }
  const color = opts.color || VISUALS[base]?.[0]?.[3] || '#8b9bb4';
  box.classList.add('glyph');
  box.style.setProperty('--c', color);
  box.append(opts.glyph || '◆');
  return box;
}

// ------------------------------------------------------------------ skills

export function skillTag(id) {
  const s = SKILLS[id];
  if (!s) return null;
  return el(`span.skill-tag${s.keystone ? '.keystone' : ''}`, { title: `${s.branch}${s.keystone ? ' keystone' : ''}: ${s.desc}`, style: { '--c': BRANCH_COLOR[s.branch] } },
    el('span.skill-ic', s.icon || '◆'), s.name);
}

/**
 * The skill pick UI. Returns { node, handleKey(e) → bool, refresh() }.
 * opts: { onChange(), onSave(), saveLabel }
 */
export function skillPicker(game, opts = {}) {
  const node = el('div.skill-picker');
  let cards = [];
  const refresh = () => {
    const run = game.run;
    node.innerHTML = '';
    cards = [];
    if (!run || run.skillPoints <= 0) return;
    const ids = run.skillOptions(game.meta);
    node.append(el('div.row.picker-head', {},
      el('span.pts', { title: 'One skill point per trip (from its goal), and one per area boss killed' }, el('b', String(run.skillPoints)), run.skillPoints === 1 ? ' skill point to spend' : ' skill points to spend'),
      el('span.small.muted', `Pick 1 of ${ids.length} · keys 1–${Math.max(1, ids.length)}`),
      el('span.grow'),
      opts.onSave ? sbtn(game, opts.saveLabel || 'Save point for later', () => opts.onSave(), { hotkey: 'L', cls: 'save-pt small-btn' }) : null));
    if (!ids.length) {
      node.append(el('p.muted', 'You have learned every skill available. Points carry no further use this run.'));
      return;
    }
    const row = el('div.skill-cards');
    ids.forEach((id, i) => {
      const s = SKILLS[id];
      // Branch line: how many of its skills you own (builds lean into an identity); a keystone says why it's here.
      const have = run.branchCount ? run.branchCount(s.branch) : 0;
      const req = s.req ? el('div.small.muted', `Builds on ${SKILLS[s.req].name}`)
        : s.keystone ? el('div.small.muted', `Opened by your ${have} ${s.branch} skills. One per branch.`) : null;
      const card = el(`button.btn.skill-card${s.keystone ? '.keystone' : ''}`, {
        style: { '--c': BRANCH_COLOR[s.branch] },
        onclick: (e) => { e.stopPropagation(); take(id); },
      },
      el('div.skill-branch', {}, s.branch, s.keystone ? el('span.skill-key', '★ Keystone') : have ? el('span.skill-own', ` · ${have} owned`) : null),
      el('div.skill-name', {}, el('span.skill-ic', s.icon || '◆'), s.name),
      s.num ? el('div.skill-num', s.num) : null,
      el('div.skill-desc', s.desc), req, el('span.hotkey', String(i + 1)));
      cards.push(card);
      row.append(card);
    });
    node.append(row);
  };
  const take = (id) => {
    const run = game.run;
    if (!run || !run.takeSkill(id)) { game.sfx.play('error'); return; }
    game.sfx.play(SKILLS[id].keystone ? 'skill_keystone' : 'skill');
    toast(game.ui, `Learned ${SKILLS[id].name}`, 'good', 2);
    refresh();
    opts.onChange?.(id);
  };
  const handleKey = (e) => {
    if (!cards.length) return false;
    const m = /^Digit([1-9])$|^Numpad([1-9])$/.exec(e.code);
    if (m) {
      const i = Number(m[1] || m[2]) - 1;
      if (cards[i]) { cards[i].click(); return true; }
    }
    if (e.code === 'KeyL' && opts.onSave) { game.sfx.play('open'); opts.onSave(); return true; }
    return false;
  };
  refresh();
  return { node, handleKey, refresh, cards: () => cards };
}

/** Escape HTML for hint text built from data. */
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
