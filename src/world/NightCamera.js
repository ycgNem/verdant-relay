// The night map's camera (Stage 7 "night board", critics H §4.1 / K §4.4): pixel-exact at every window size,
// with integer zoom steps and panning.
//
// The night renders through the same integer pipeline as the day (Game._layout): the internal size is the
// window ÷ k in device pixels (k a whole number, sizes kept even), 32 px per tile, so every texel is k × k
// screen pixels — never the old fixed 1280 × 720 stretched ×1.5 at 1080p. k is the ZOOM:
//   · default: the largest k at which the whole field fits the map viewport (the stage left of the side
//     panel, below the top bar — measured from DEFENSE_VIEW.view in UI units); ×2 at 1920×1080 and
//     2560×1440, ×1 at 1280×720 / 1366×768. If that is only ×1 on a window whose day view is ×3 or more (a
//     browser window on a 1080p screen), ×2 is used while it still shows DEFENSE_VIEW.zoom.prefer of the
//     field, centred on the board (pan for the rest), so texels never shrink to one pixel on a big screen;
//   · range: from the full-field zoom up to the day's own scale (+ zoom.maxOverDay);
//   · mouse wheel (or + / −) steps between them, keeping the ground point under the cursor fixed;
//   · pan: drag with the right or middle mouse button, or the arrow keys (not while the scene uses them to move
//     its build cursor: scene.arrowsTaken()); clamped to the field + a margin. follow(x, z) pans just enough to
//     keep a point (the build cursor, a selected tower) in view.
//     A right press that doesn't move (zoom.dragThreshold) is still a right CLICK (cancel / deselect):
//     update() withholds button 2 from game.input until it knows, so call it before the scene reads input.
// The focus (the world point at the viewport's centre) is snapped to the 1/32-tile grid by PixelCamera.
// Keys used: arrows, + / −, Home (re-frame). Never Q/W/E/R/F/Space/digits (the scene's own keys).

import { DEFENSE_VIEW } from '../data/defenseMap.js';
import { CONFIG } from '../data/config.js';

const UI_W = 960, UI_H = 540;
const even = (n) => n - (n % 2);

/** The day view's whole-number scale for a window (mirrors Game._layout for resMult 1). */
export function dayScale(vw, vh) {
  const [RW, RH] = CONFIG.ui.view;
  const B = CONFIG.ui.viewBand;
  const maxW = even(Math.floor(RW * B.w[1])), maxH = even(Math.floor(RH * B.h[1]));
  let best = null;
  for (let k = 1; k <= 16; k++) {
    const ww = Math.min(even(Math.floor(vw / k)), maxW), hh = Math.min(even(Math.floor(vh / k)), maxH);
    if (ww < RW * B.w[0] || hh < RH * B.h[0]) continue;
    const cover = (ww * k * hh * k) / (vw * vh);
    const err = Math.abs(Math.log((ww * hh) / (RW * RH)));
    if (!best || cover > best.cover + 1e-6 || (Math.abs(cover - best.cover) <= 1e-6 && err < best.err)) best = { cover, err, k };
  }
  return best ? best.k : 1;
}

export class NightCamera {
  /**
   * @param scene  DefenseScene (game, camera)
   * @param fit    world box that must show at the default zoom {x0, z0, x1, z1} (tiles)
   * @param bounds world box the view may pan over (the field + a margin)
   */
  constructor(scene, fit, bounds) {
    this.scene = scene;
    this.game = scene.game;
    this.fitBox = fit;
    this.bounds = bounds;
    this.k = 0;
    this.ks = [1];
    this.fx = (fit.x0 + fit.x1) / 2;
    this.fz = (fit.z0 + fit.z1) / 2;
    this.drag = null;
    this._wheelT = 0;
    this._listeners = [];
    this.userZoomed = false;
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); this._listeners.push([t, ev, fn, opt]); };
    on(window, 'resize', () => this.relayout(), false);
    // Wheel over the map (not over the side panel, which scrolls).
    on(this.game.stage, 'wheel', (e) => {
      if (e.target.closest?.('.ui-block') || this.scene.paused) return;
      e.preventDefault();
      const now = performance.now();
      if (now - this._wheelT < 90 || Math.abs(e.deltaY) < 1) return;   // a trackpad sends bursts: one step each
      this._wheelT = now;
      this.zoomStep(e.deltaY < 0 ? 1 : -1, this._stageXY(e));
    }, { passive: false });
    on(this.game.stage, 'pointerdown', (e) => {
      if ((e.button !== 1 && e.button !== 2) || e.target.closest?.('.ui-block')) return;
      if (e.button === 1) e.preventDefault();   // no browser autoscroll
      this.drag = { button: e.button, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, rest: [0, 0] };
    }, true);
    // Chrome starts middle-button autoscroll on mousedown: cancel it over the map.
    on(this.game.stage, 'mousedown', (e) => { if (e.button === 1 && !e.target.closest?.('.ui-block')) e.preventDefault(); }, true);
    on(window, 'pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= DEFENSE_VIEW.zoom.dragThreshold) d.moved = true;
      if (d.moved) this.panBy(e.clientX - d.lx, e.clientY - d.ly);
      d.lx = e.clientX; d.ly = e.clientY;
    }, true);
    on(window, 'pointerup', (e) => {
      const d = this.drag;
      if (!d || e.button !== d.button) return;
      this.drag = null;
      // A right press that never moved is a click: hand it back to the scene's input this frame.
      if (d.button === 2 && !d.moved) this._replayRight = true;
    }, true);
    on(window, 'blur', () => { this.drag = null; }, false);
  }

  dispose() {
    for (const [t, ev, fn, opt] of this._listeners) t.removeEventListener(ev, fn, opt);
    this._listeners = [];
  }

  _stageXY(e) {
    const r = this.game.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Device window size (as Game._layout). */
  _window() {
    const dpr = window.devicePixelRatio || 1;
    return { vw: Math.floor(window.innerWidth * dpr), vh: Math.floor(window.innerHeight * dpr), dpr };
  }

  /** Internal size and map viewport (internal px) at zoom k. */
  _frame(k) {
    const { vw, vh, dpr } = this._window();
    const w = Math.max(2, even(Math.floor(vw / k))), h = Math.max(2, even(Math.floor(vh / k)));
    const sw = (w * k) / dpr, sh = (h * k) / dpr;              // stage CSS size
    const u = Math.min(sw / UI_W, sh / UI_H);                   // UI unit (game.u)
    const V = DEFENSE_VIEW.view;
    const toPx = dpr / k;                                        // CSS px → internal px
    // The side panel is anchored to the stage's right edge, the top bar to its top (defense.css).
    const vp = {
      x0: V.x0 * u * toPx, x1: (sw - (UI_W - V.x1) * u) * toPx,
      y0: V.y0 * u * toPx, y1: (sh - (UI_H - V.y1) * u) * toPx,
    };
    return { k, w, h, vp };
  }

  /** Fraction of the fit box visible at zoom k (min over both axes; ≥ 1 = it all fits). */
  _fits(k) {
    const { vp } = this._frame(k);
    const B = this.fitBox, ppu = this.scene.camera.ppu;
    return Math.min((vp.x1 - vp.x0) / ((B.x1 - B.x0) * ppu), (vp.y1 - vp.y0) / ((B.z1 - B.z0) * ppu));
  }

  /** Recompute the zoom range for the window; keep the zoom when still allowed. */
  _zoomRange() {
    const { vw, vh } = this._window();
    const Z = DEFENSE_VIEW.zoom;
    const day = dayScale(vw, vh);
    let fit = 1;
    for (let k = 2; k <= 8; k++) if (this._fits(k) >= 1) fit = k;
    let def = fit;
    if (fit === 1 && day >= 3 && this._fits(2) >= Z.prefer) def = 2;
    const max = Math.max(def, day + (Z.maxOverDay || 0));
    this.ks = [];
    for (let k = Math.min(fit, def); k <= max; k++) this.ks.push(k);
    this.kDefault = def;
  }

  /** First layout (and Home): default zoom, framed on the board. */
  frame() {
    this._zoomRange();
    this.userZoomed = false;
    this.fx = (this.fitBox.x0 + this.fitBox.x1) / 2;
    this.fz = (this.fitBox.z0 + this.fitBox.z1) / 2;
    this._setZoom(this.kDefault);
  }

  /** Window resized: new zoom range; keep the user's zoom when it is still in range. */
  relayout() {
    if (!this.scene._alive) return;
    this._zoomRange();
    const k = this.userZoomed && this.ks.includes(this.k) ? this.k : this.kDefault;
    if (!this.userZoomed) {
      this.fx = (this.fitBox.x0 + this.fitBox.x1) / 2;
      this.fz = (this.fitBox.z0 + this.fitBox.z1) / 2;
    }
    this._setZoom(k);
  }

  _setZoom(k) {
    const f = this._frame(k);
    this.k = k;
    this.vp = f.vp;
    if (this.game.width !== f.w || this.game.height !== f.h || !this.game.resOverride) this.game.setInternalRes(f.w, f.h);
    this.place();
  }

  /** Step the zoom by ±1 around a stage point (CSS px), keeping the ground under it fixed. */
  zoomStep(dir, at = null) {
    const i = this.ks.indexOf(this.k);
    const j = Math.max(0, Math.min(this.ks.length - 1, i + dir));
    if (j === i) return false;
    const { dpr } = this._window();
    const cam = this.scene.camera, ppu = cam.ppu;
    // The ground point under the cursor (or the viewport centre) before the change…
    const px = at ? (at.x * dpr) / this.k : (this.vp.x0 + this.vp.x1) / 2;
    const py = at ? (at.y * dpr) / this.k : (this.vp.y0 + this.vp.y1) / 2;
    const gx = cam.focus.x + (px - this.game.width / 2) / ppu, gz = cam.focus.z + (py - this.game.height / 2) / ppu;
    const k = this.ks[j];
    const f = this._frame(k);
    // …lands under the same CSS point after it.
    const npx = at ? (at.x * dpr) / k : (f.vp.x0 + f.vp.x1) / 2, npy = at ? (at.y * dpr) / k : (f.vp.y0 + f.vp.y1) / 2;
    const ncx = (f.vp.x0 + f.vp.x1) / 2, ncy = (f.vp.y0 + f.vp.y1) / 2;
    this.fx = gx + (ncx - npx) / ppu;
    this.fz = gz + (ncy - npy) / ppu;
    this.userZoomed = k !== this.kDefault;
    this._setZoom(k);
    return true;
  }

  /** Pan by a drag of (dx, dy) CSS px (the ground follows the cursor). */
  panBy(dx, dy) {
    const { dpr } = this._window();
    const s = dpr / this.k / this.scene.camera.ppu;
    this.fx -= dx * s;
    this.fz -= dy * s;
    this.place();
  }

  /** Clamp the focus to the bounds and put the camera on whole pixels. */
  place() {
    const cam = this.scene.camera, ppu = cam.ppu, vp = this.vp, B = this.bounds;
    const hw = (vp.x1 - vp.x0) / 2 / ppu, hh = (vp.y1 - vp.y0) / 2 / ppu;
    const clamp = (v, a, b, h) => (b - a <= 2 * h ? (a + b) / 2 : Math.max(a + h, Math.min(b - h, v)));
    this.fx = clamp(this.fx, B.x0, B.x1, hw);
    this.fz = clamp(this.fz, B.z0, B.z1, hh);
    cam.setSize(this.game.width, this.game.height);
    cam.placeAt(this.fx, this.fz, (vp.x0 + vp.x1) / 2, (vp.y0 + vp.y1) / 2);
  }

  /** Per frame, BEFORE the scene reads game.input: arrow-key pan, + / − zoom, and the right-click hand-back. */
  update(dt) {
    const inp = this.game.input;
    if (this.drag?.button === 2 || this._holdRight) {
      // Withhold the right press until we know whether it is a drag (pan) or a click (cancel).
      this._holdRight = !!this.drag;
      inp.clicked.delete(2);
    }
    if (this._replayRight) { this._replayRight = false; this._holdRight = false; inp.clicked.add(2); }
    if (this.scene.paused) return;
    const Z = DEFENSE_VIEW.zoom;
    let dx = 0, dy = 0;
    const arrows = !this.scene.arrowsTaken?.();
    if (arrows && inp.isDown('ArrowLeft')) dx -= 1;
    if (arrows && inp.isDown('ArrowRight')) dx += 1;
    if (arrows && inp.isDown('ArrowUp')) dy -= 1;
    if (arrows && inp.isDown('ArrowDown')) dy += 1;
    if (dx || dy) this.panBy(-dx * Z.panKeys * dt, -dy * Z.panKeys * dt);
    if (inp.wasPressed('Equal') || inp.wasPressed('NumpadAdd')) this.zoomStep(1);
    if (inp.wasPressed('Minus') || inp.wasPressed('NumpadSubtract')) this.zoomStep(-1);
    if (inp.wasPressed('Home')) this.frame();
  }

  /** Pan (whole tiles' worth, clamped) so ground point (x, z) is at least `margin` tiles inside the viewport. */
  follow(x, z, margin = 1) {
    const cam = this.scene.camera, ppu = cam.ppu, vp = this.vp;
    const cx = (vp.x0 + vp.x1) / 2, cy = (vp.y0 + vp.y1) / 2;
    const hw = Math.max(0, (vp.x1 - vp.x0) / 2 / ppu - margin), hh = Math.max(0, (vp.y1 - vp.y0) / 2 / ppu - margin);
    // The ground point at the viewport's centre now.
    const gx = cam.focus.x + (cx - this.game.width / 2) / ppu, gz = cam.focus.z + (cy - this.game.height / 2) / ppu;
    let mx = 0, mz = 0;
    if (x < gx - hw) mx = x - (gx - hw); else if (x > gx + hw) mx = x - (gx + hw);
    if (z < gz - hh) mz = z - (gz - hh); else if (z > gz + hh) mz = z - (gz + hh);
    if (!mx && !mz) return;
    this.fx += mx;
    this.fz += mz;
    this.place();
  }

  /** Is a world ground point inside the map viewport right now? */
  inView(x, z, pad = 0) {
    const cam = this.scene.camera, ppu = cam.ppu;
    const px = (x - cam.focus.x) * ppu + this.game.width / 2, py = (z - cam.focus.z) * ppu + this.game.height / 2;
    return px >= this.vp.x0 - pad && px <= this.vp.x1 + pad && py >= this.vp.y0 - pad && py <= this.vp.y1 + pad;
  }

  /** Label for the HUD: "×2". */
  get label() { return `×${this.k}`; }
  get canZoomIn() { return this.ks.indexOf(this.k) < this.ks.length - 1; }
  get canZoomOut() { return this.ks.indexOf(this.k) > 0; }
}
