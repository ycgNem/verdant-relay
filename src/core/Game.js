// The game shell: one WebGL renderer drawn at a low internal resolution and scaled up with
// nearest-neighbour (the pixel look), a letterboxed 16:9 stage, the main loop and scene switching.
//
// Scenes are classes with `constructor(game)`, `enter(params)`, `update(dt)`, `exit()`.
// A scene that draws 3D sets `this.three` (THREE.Scene) and `this.camera`; the shell renders them.
// UI lives in `game.ui` (a DOM overlay); it is cleared on every scene switch.
//
// Resolution: the base size comes from settings (480×270 "chunky" or 640×360 "sharp"). A scene may
// call `game.setResMult(2)` to render at twice that (the night map shows the whole field, so it
// needs more pixels to keep sprites at roughly one texel per screen pixel).

import * as THREE from 'three';
import { CONFIG } from '../data/config.js';
import { Input } from './Input.js';
import { Sfx } from './Sfx.js';
import { loadMeta, saveMeta } from './Save.js';

const MAX_DT = 1 / 20;

export class Game {
  constructor({ stage, canvas, ui, flash, assets }) {
    this.stage = stage;
    this.canvas = canvas;
    this.ui = ui;
    this.flashEl = flash;
    this.assets = assets;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
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
  }

  register(name, SceneClass) { this.scenes[name] = SceneClass; }

  /** Switch scenes. The old scene's exit() runs first, then the UI is cleared. */
  go(name, params = {}) {
    const Cls = this.scenes[name];
    if (!Cls) throw new Error(`Unknown scene: ${name}`);
    if (this.scene) {
      try { this.scene.exit(); } catch (e) { console.error(e); }
    }
    this.ui.innerHTML = '';
    this.ui.className = '';
    this.setResMult(1);
    this.stage.style.cursor = '';
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
        try {
          this.scene.update(dt);
        } catch (e) {
          console.error(e);
        }
        if (this.scene && this.scene.three && this.scene.camera) {
          this.renderer.render(this.scene.three, this.scene.camera);
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
  get width() { return this.baseRes[0] * this.resMult; }
  get height() { return this.baseRes[1] * this.resMult; }

  setResMult(m) {
    this.resMult = m;
    this.renderer.setSize(this.width, this.height, false);
    if (this.scene?.camera?.isPerspectiveCamera) {
      this.scene.camera.aspect = this.width / this.height;
      this.scene.camera.updateProjectionMatrix();
    }
    this.fit();
  }

  /** Letterbox the stage to 16:9 at the largest size that fits the window. */
  fit() {
    const [W, H] = this.baseRes;
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    this.stage.style.width = `${Math.floor(W * s)}px`;
    this.stage.style.height = `${Math.floor(H * s)}px`;
    // UI scales with the stage so layouts look the same at every window size.
    this.stage.style.setProperty('--u', `${(Math.floor(W * s) / 960).toFixed(4)}px`);
  }

  applySettings() {
    this.sfx.volume = this.meta.settings.volume;
    this.renderer.setSize(this.width, this.height, false);
    this.fit();
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

  /** Where the mouse ray hits the horizontal plane y = h (world). Returns a Vector3 or null. */
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
