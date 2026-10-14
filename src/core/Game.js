// The game shell: one WebGL renderer drawn at a low internal resolution and scaled up with
// nearest-neighbour (the pixel look), a letterboxed 16:9 stage, the main loop and scene switching.
//
// Scenes are classes with `constructor(game)`, `enter(params)`, `update(dt)`, `exit()`.
// A scene that draws 3D sets `this.three` (THREE.Scene) and `this.camera`; the shell renders them.
// UI lives in `game.ui` (a DOM overlay); it is cleared on every scene switch.
//
// Resolution (pixel-exact, STYLE/CLAUDE contract): the canvas is always shown at a WHOLE-NUMBER CSS
// scale k (in device px), so every texel is k×k screen pixels. The world view is a fixed field of view:
// CONFIG.ui.view (640×360 internal px = 20 × 11.25 tiles) — ×2 at 1280×720, ×3 at 1920×1080, ×4 at
// 2560×1440. Other windows pick the whole-number scale that fills the most of the window while the
// internal size stays inside CONFIG.ui.viewBand (each side may shrink a little — a browser's toolbars
// cost ~10% of the height — or grow a little), and letterbox the rest: 1366×768 → 682×384 ×2,
// 1920×950 → 640×316 ×3, 1600×900 / 1440×900 → 704×396 ×2. A bigger monitor never sees much more
// jungle (critic G #12). Windows too small for ×2 get ×1 at the view size (or as much of it as fits) —
// unless ×1 would leave most of the window black, then ×2 with a smaller view (viewBand.small: 1024×600
// → 512×300 ×2).
// Device px (window size × devicePixelRatio) are used throughout, so Windows display scaling still
// lands on whole device pixels. The stage aspect therefore varies a little; the DOM UI unit --u
// (game.u) is min(width / 960, height / 540) so a 960×540-unit layout always fits.
// A scene may call `game.setResMult(m)` (view × m) or `game.setInternalRes(w, h)` for a fixed size
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
    this.sfx = new Sfx(this);       // audio engine: mix buses, one-shots, ambience, audio director
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
    const unlock = () => { this.sfx.unlock(); this.sfx.applySettings(); };
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
        this.sfx.update(real);   // audio director + ambience (reads the scene; never throws)
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

  get width() { return this._res()[0]; }
  get height() { return this._res()[1]; }
  /** CSS px per UI unit (--u): a 960×540-unit layout always fits the stage. */
  get u() { const L = this._layout(); return Math.min(L.sw / 960, L.sh / 540); }

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
   * Internal size and CSS stage size for the current window: { w, h, sw, sh, k } (sw/sh in CSS px).
   * Cached per window size / settings.
   */
  _layout() {
    const dpr = window.devicePixelRatio || 1;
    const vw = Math.floor(window.innerWidth * dpr), vh = Math.floor(window.innerHeight * dpr);   // device px
    const key = `${vw}x${vh}@${dpr}|${this.resMult}|${this.resOverride}`;
    if (this._layoutKey === key) return this._layoutCache;
    let w, h, k;
    if (this.resOverride) {
      [w, h] = this.resOverride;
      k = Math.floor(Math.min(vw / w, vh / h));
      if (k < 1 || (k * w * k * h) / (vw * vh) < (CONFIG.ui.minIntegerFill ?? 0.9)) {
        // Fixed size that can't fill the window with a whole number: keep its aspect, stretch to fit.
        k = Math.min(vw / w, vh / h);
      }
    } else {
      // Fixed field of view (see the header): among whole-number scales whose internal size stays in
      // the band, the one covering the most of the window wins (ties: closest to the view size).
      const [VW, VH] = CONFIG.ui.view;
      const B = CONFIG.ui.viewBand;
      const RW = VW * this.resMult, RH = VH * this.resMult;
      const even = (n) => n - (n % 2);
      const maxW = even(Math.floor(RW * B.w[1])), maxH = even(Math.floor(RH * B.h[1]));
      const pick = (fw, fh) => {
        const minW = RW * fw, minH = RH * fh;
        let best = null;
        for (let kk = 1; kk <= 16; kk++) {
          const ww = Math.min(even(Math.floor(vw / kk)), maxW), hh = Math.min(even(Math.floor(vh / kk)), maxH);
          if (ww < minW || hh < minH) continue;
          const cover = (ww * kk * hh * kk) / (vw * vh);
          const err = Math.abs(Math.log((ww * hh) / (RW * RH)));
          if (!best || cover > best.cover + 1e-6 || (Math.abs(cover - best.cover) <= 1e-6 && err < best.err)) best = { cover, err, ww, hh, kk };
        }
        return best;
      };
      let best = pick(B.w[0], B.h[0]);
      // A small window (laptop, half a screen) where the band only allows ×1 and that leaves most of the
      // window black: take ×2 with a somewhat smaller view instead (B.small), so the HUD stays readable.
      if (B.small && (!best || (best.kk === 1 && best.cover < B.small.cover))) {
        const alt = pick(B.small.w, B.small.h);
        if (alt && alt.kk > 1) best = alt;
      }
      // Too small for the band even at ×1: show ×1, as much of the view as fits.
      if (!best) best = { ww: Math.max(2, Math.min(even(vw), maxW)), hh: Math.max(2, Math.min(even(vh), maxH)), kk: 1 };
      w = best.ww; h = best.hh; k = best.kk;
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
    // UI scales with the stage so layouts look the same at every window size; the stage aspect varies a
    // little (see _layout), so the unit is sized for a 960×540-unit layout to fit either way.
    this.stage.style.setProperty('--u', `${this.u.toFixed(4)}px`);
    // Pixel-font quantum: the UI fonts sit on an 8-unit em, so text is only crisp at whole multiples of
    // 8 device px. CSS rounds every font-size to a multiple of --fq (see "Pixel-font grid" in style.css).
    const dpr = window.devicePixelRatio || 1;
    this.stage.style.setProperty('--fq', `${(CONFIG.ui.fontGrid / dpr).toFixed(4)}px`);
    this.stage.style.setProperty('--fpx', `${(1 / dpr).toFixed(4)}px`);   // one device px (letter-spacing)
    // The world's texel in CSS px (pixel art in the DOM at the game's own scale: the 9-slice panel frame, icons)
    // and the frame image as an absolute URL (a relative one would resolve against the built stylesheet).
    this.stage.style.setProperty('--tx', `${(L.k / dpr).toFixed(4)}px`);
    this._frameUrl ||= `url("${new URL(`${import.meta.env.BASE_URL}sprites/ui_panel_frame.png`, document.baseURI).href}")`;
    this.stage.style.setProperty('--frame', this._frameUrl);
  }

  applySettings() {
    this.sfx.applySettings();
    this._applyRes();
  }

  saveMeta() { saveMeta(this.meta); }

  // ---------------------------------------------------------------- feedback

  /** Screen shake (skipped when disabled in settings). amp is in UI units (--u). */
  shake(amp = 4, time = 0.2) {
    if (!this.meta.settings.shake) return;
    this._shake.amp = Math.max(this._shake.amp, amp);
    this._shake.t = Math.max(this._shake.t, time);
  }

  _updateShake(dt) {
    const s = this._shake;
    if (s.t > 0) {
      s.t -= dt;
      const u = this.u;
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

