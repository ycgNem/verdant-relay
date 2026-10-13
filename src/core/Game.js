// The game shell: one WebGL renderer drawn at a low internal resolution and scaled up with
// nearest-neighbour (the pixel look), a letterboxed 16:9 stage, the main loop and scene switching.
//
// Scenes are classes with `constructor(game)`, `enter(params)`, `update(dt)`, `exit()`.
// A scene that draws 3D sets `this.three` (THREE.Scene) and `this.camera`; the shell renders them.
// UI lives in `game.ui` (a DOM overlay); it is cleared on every scene switch.
//
// Resolution (pixel-exact, STYLE/CLAUDE contract): the canvas is always shown at a WHOLE-NUMBER CSS
// scale k (in device px), so every texel is k×k screen pixels. The base size from settings (480×270
// "chunky" or 640×360 "sharp") sets the field of view: the internal size it gets in a 1280×720 window
// (chunky 426×240 ×3, sharp 640×360 ×2) is the reference, and every other window shows the same number of
// tiles within ±CONFIG.ui.fovTolerance (1920×1080 chunky → 454×254 ×4, 1600×900 → 400×224 ×4, 2560×1440
// → 426×240 ×6), letterboxing what's left — a bigger monitor never sees more jungle (critic G #12).
// With Settings → "Pixel-perfect scaling" (meta.settings.integerScale) the internal size is exactly
// the base size instead (whole-number multiple, larger black borders).
// A scene may call `game.setResMult(m)` (target × m) or `game.setInternalRes(w, h)` for a fixed size
// (the night map renders at 1280×720 so the whole field fits at exactly 32 px per tile); a fixed size
// is integer-scaled when that fills ≥ CONFIG.ui.minIntegerFill of the window, else stretched to fit.
// Both reset on every scene switch. 3D scenes use a PixelCamera (src/core/PixelView.js): 1 tile = 32
// internal px. `game.width/height` change with the window: size things from them every frame (PostFx
// does) or rely on _applyRes, which re-sizes the scene's PixelCamera.

import * as THREE from 'three';
import { CONFIG } from '../data/config.js';
import { Input } from './Input.js';
import { Sfx } from './Sfx.js';
import { loadMeta, saveMeta } from './Save.js';
import './PixelView.js';   // installs the upright-card sprite shader (no-op for other cameras)

const MAX_DT = 1 / 20;

export class Game {
  constructor({ stage, canvas, ui, flash, assets }) {
    this.stage = stage;
    this.canvas = canvas;
    this.ui = ui;
    this.flashEl = flash;
    this.assets = assets;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.input = new Input(stage);
    this.sfx = new Sfx();
    this.meta = loadMeta();
    this.run = null;                 // current Run (src/core/Run.js), or null on the title screen

    this.scenes = {};                // name -> class
    this.scene = null;
    this.sceneName = null;
    this.resMult = 1;
    this.resOverride = null;         // [w, h] from setInternalRes, or null
    this.time = 0;                   // seconds since boot (real time, unaffected by pause)
    this._shake = { t: 0, amp: 0 };
    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.applySettings();
    window.addEventListener('resize', () => this.fit());
    // Audio may only start after a user gesture.
    const unlock = () => { this.sfx.unlock(); this.sfx.volume = this.meta.settings.volume; };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Swallow clicks for a moment after a scene switch (see CONFIG.ui.sceneClickGuard).
    this._clickGuardUntil = 0;
    const guard = (e) => {
      if (e.isTrusted && performance.now() < this._clickGuardUntil) { e.stopPropagation(); e.preventDefault(); }
    };
    for (const type of ['click', 'dblclick', 'mousedown']) ui.addEventListener(type, guard, true);
  }

  register(name, SceneClass) { this.scenes[name] = SceneClass; }

  /** Switch scenes. The old scene's exit() runs first, then the UI is cleared. */
  go(name, params = {}) {
    const Cls = this.scenes[name];
    if (!Cls) throw new Error(`Unknown scene: ${name}`);
    // A switch requested from inside scene.update() waits until that update returns, so the old
    // scene's remaining update code can't leak UI (hints, toasts) into the new scene.
    if (this._inUpdate) { this._pendingGo = [name, params]; return; }
    if (this.scene) {
      try { this.scene.exit(); } catch (e) { console.error(e); }
    }
    this.ui.innerHTML = '';
    this.ui.className = '';
    this.resOverride = null;
    this.setResMult(1);
    this.stage.style.cursor = '';
    this._clickGuardUntil = performance.now() + (CONFIG.ui.sceneClickGuard || 0) * 1000;
    this.scene = new Cls(this);
    this.sceneName = name;
    this.scene.enter(params);
    this.input.endFrame();
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      const real = Math.min((now - last) / 1000, 0.25);
      last = now;
      this.time += real;
      const dt = Math.min(real, MAX_DT);
      if (this.scene) {
        this._inUpdate = true;
        try {
          this.scene.update(dt);
        } catch (e) {
          console.error(e);
        }
        this._inUpdate = false;
        if (this._pendingGo) {
          const [name, params] = this._pendingGo;
          this._pendingGo = null;
          this.go(name, params);
        }
        const sc = this.scene;
        if (sc && sc.three && sc.camera) {
          const cam = sc.camera;
          if (cam.isPixelCamera) {
            // Align every sprite / decal to the pixel grid for this draw (restored right after).
            cam.snapForRender(sc.three);
            if (sc.post) sc.post.render(this.renderer, sc.three, cam);   // screen-space lighting (PostFx)
            else this.renderer.render(sc.three, cam);
            cam.restoreSnap();
          } else {
            this.renderer.render(sc.three, cam);
          }
        }
      }
      this._updateShake(real);
      this.input.endFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- display

  get baseRes() { return CONFIG.resolutions[this.meta.settings.resolution] || CONFIG.resolutions.chunky; }
  get width() { return this._res()[0]; }
  get height() { return this._res()[1]; }

  setResMult(m) {
    this.resMult = m;
    this._applyRes();
  }

  /** Render at a fixed internal size (until the next scene switch), e.g. 1280×720 for the night map. */
  setInternalRes(w, h) {
    this.resOverride = [w, h];
    this._applyRes();
  }

  /**
   * Internal size and CSS stage size for the current window: { w, h, sw, sh } (sw/sh in CSS px).
   * Cached per window size / settings.
   */
  _layout() {
    const dpr = window.devicePixelRatio || 1;
    const vw = Math.floor(window.innerWidth * dpr), vh = Math.floor(window.innerHeight * dpr);   // device px
    const [BW, BH] = this.baseRes;
    const key = `${vw}x${vh}@${dpr}|${BW}x${BH}|${this.resMult}|${this.resOverride}|${!!this.meta.settings.integerScale}`;
    if (this._layoutKey === key) return this._layoutCache;
    let w, h, k;
    const fixed = this.resOverride || (this.meta.settings.integerScale ? [BW * this.resMult, BH * this.resMult] : null);
    if (fixed) {
      [w, h] = fixed;
      k = Math.floor(Math.min(vw / w, vh / h));
      if (k < 1 || (this.resOverride && !this.meta.settings.integerScale && (k * w * k * h) / (vw * vh) < (CONFIG.ui.minIntegerFill ?? 0.9))) {
        // Fixed size that can't fill the window with a whole number: keep its aspect, stretch to fit.
        k = Math.min(vw / w, vh / h);
      }
    } else {
      // Adaptive with a fixed field of view (critic G #12): the reference is the internal size this
      // setting gets in a 1280×720 window (chunky 426×240); every window shows that many tiles within
      // ±CONFIG.ui.fovTolerance — a whole-number scale k, the internal size clamped to the band and the
      // rest letterboxed — so a bigger monitor never sees more jungle. Among scales inside the band the
      // one filling the most of the window wins.
      const ar = BW / BH;
      const fit = (W, H, kk) => {
        let ww = Math.min(Math.floor(W / kk), Math.floor((Math.floor(H / kk)) * ar));
        ww -= ww % 2;
        return ww;
      };
      const nearest = (W, H, TW) => {
        let b = null;
        for (let kk = 1; kk <= 16; kk++) {
          const ww = fit(W, H, kk);
          if (ww < 160) break;
          const err = Math.abs(Math.log(ww / TW));
          if (!b || err < b.err - 1e-6) b = { err, ww, kk };
        }
        return b;
      };
      const ref = (nearest(1280, 720, BW)?.ww || BW) * this.resMult;
      const tol = CONFIG.ui.fovTolerance ?? 0.07;
      const lo = ref * (1 - tol), hi = Math.floor(ref * (1 + tol));
      let best = null;
      for (let kk = 1; kk <= 16; kk++) {
        let ww = Math.min(fit(vw, vh, kk), hi - (hi % 2));
        if (ww < 160) break;
        if (ww < lo) continue;
        const cover = ww * kk, err = Math.abs(Math.log(ww / ref));
        if (!best || cover > best.cover + 1e-6 || (Math.abs(cover - best.cover) < 1e-6 && err < best.err)) best = { cover, err, ww, kk };
      }
      if (!best) best = nearest(vw, vh, ref) || { ww: BW, kk: 1 };
      w = best.ww; k = best.kk;
      h = Math.round(w / ar); h -= h % 2;
    }
    this._layoutKey = key;
    this._layoutCache = { w, h, sw: (w * k) / dpr, sh: (h * k) / dpr, k };
    return this._layoutCache;
  }

  _res() { const L = this._layout(); return [L.w, L.h]; }

  _applyRes() {
    const [w, h] = this._res();
    this._appliedRes = `${w}x${h}`;
    this.renderer.setSize(w, h, false);
    const cam = this.scene?.camera;
    if (cam?.isPixelCamera) cam.setSize(w, h);
    else if (cam?.isPerspectiveCamera) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    this.fit();
  }

  /**
   * Size the stage: the internal canvas at a whole-number scale (device px) — see _layout. A window
   * resize may change the internal resolution too (then the renderer and camera are re-sized).
   */
  fit() {
    const L = this._layout();
    if (this._appliedRes !== `${L.w}x${L.h}`) { this._applyRes(); return; }
    const sw = L.sw, sh = L.sh;
    this.stage.style.width = `${sw}px`;
    this.stage.style.height = `${sh}px`;
    // UI scales with the stage so layouts look the same at every window size.
    this.stage.style.setProperty('--u', `${(sw / 960).toFixed(4)}px`);
    // Pixel-font quantum: the UI fonts sit on an 8-unit em, so text is only crisp at whole multiples of
    // 8 device px. CSS rounds every font-size to a multiple of --fq (see "Pixel-font grid" in style.css).
    const dpr = window.devicePixelRatio || 1;
    this.stage.style.setProperty('--fq', `${(CONFIG.ui.fontGrid / dpr).toFixed(4)}px`);
    this.stage.style.setProperty('--fpx', `${(1 / dpr).toFixed(4)}px`);   // one device px (letter-spacing)
  }

  applySettings() {
    this.sfx.volume = this.meta.settings.volume;
    this._applyRes();   // resolution / pixel-perfect scaling may have changed
  }

  saveMeta() { saveMeta(this.meta); }

  // ---------------------------------------------------------------- feedback

  /** Screen shake (skipped when disabled in settings). amp is in CSS pixels at 960-wide stage. */
  shake(amp = 4, time = 0.2) {
    if (!this.meta.settings.shake) return;
    this._shake.amp = Math.max(this._shake.amp, amp);
    this._shake.t = Math.max(this._shake.t, time);
  }

  _updateShake(dt) {
    const s = this._shake;
    if (s.t > 0) {
      s.t -= dt;
      const u = this.stage.clientWidth / 960;
      const a = s.amp * u * Math.max(0, Math.min(1, s.t / 0.2));
      this.canvas.style.transform = `translate(${((Math.random() * 2 - 1) * a).toFixed(1)}px, ${((Math.random() * 2 - 1) * a).toFixed(1)}px)`;
      if (s.t <= 0) { s.amp = 0; this.canvas.style.transform = ''; }
    }
  }

  /** Full-screen colour flash (hurt, core hit). */
  flash(color = '#e43b44', opacity = 0.35) {
    const f = this.flashEl;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = String(opacity);
    void f.offsetWidth;
    f.style.transition = 'opacity 0.35s';
    f.style.opacity = '0';
  }

  // ---------------------------------------------------------------- helpers

  /** Where the mouse ray hits the horizontal plane y = h (world). Returns a Vector3 or null.
   *  (Raycaster.setFromCamera handles both perspective and orthographic cameras.) */
  mouseOnPlane(camera, h = 0, out = new THREE.Vector3()) {
    this._raycaster.setFromCamera({ x: this.input.mouse.ndcX, y: this.input.mouse.ndcY }, camera);
    this._plane.constant = -h;
    return this._raycaster.ray.intersectPlane(this._plane, out);
  }

  /** World position → CSS pixels inside the stage (for DOM labels over the 3D view). */
  project(v, camera) {
    const p = v.clone().project(camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.stage.clientWidth,
      y: (-p.y * 0.5 + 0.5) * this.stage.clientHeight,
      visible: p.z < 1 && p.z > -1,
    };
  }
}

