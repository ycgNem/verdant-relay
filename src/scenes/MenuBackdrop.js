// Living backdrop behind the menus: a slow drift over the real jungle around the Relay clearing,
// drawn with the same renderer and lighting as the day expedition (JungleWorld + PostFx). The Relay
// Core stands in its plaza with a few towers; creatures lurk at the jungle's edge.
//
//   new MenuBackdrop(game, { mood: 'dusk'|'day'|'night'|'dawn'|'fallen', angle, speed, shiftX, seed })
//   scene uses: this.three = backdrop.scene, this.camera = backdrop.camera, this.post = backdrop.post
//
// The world is generated once (fixed seed) and cached on the game, so switching menus is instant.

import * as THREE from 'three';
import { PixelCamera } from '../core/PixelView.js';
import { PostFx } from '../core/PostFx.js';
import { updateVisual, setAnim, setFacing } from '../core/Assets.js';
import { generateWorld } from '../world/JungleGen.js';
import { JungleWorld } from '../world/JungleWorld.js';
import { DISTRICT_KEYS } from '../data/districts.js';
import { ATMOS } from '../data/jungle.js';

// tint: post colour multiplier · ambient: brightness · sprite: unit tint
const MOODS = {
  dusk: { bg: '#10140e', tint: [1.08, 0.9, 0.78], ambient: 0.85, sprite: '#ffe8d2' },
  day: { bg: '#10140e', tint: [1, 1, 0.96], ambient: 0.95, sprite: '#ffffff' },
  night: { bg: '#05070c', tint: [0.62, 0.74, 1.05], ambient: 0.62, sprite: '#a9bcff' },
  dawn: { bg: '#10140e', tint: [1.1, 0.95, 0.85], ambient: 0.92, sprite: '#fff0e0' },
  fallen: { bg: '#05040a', tint: [0.85, 0.55, 0.65], ambient: 0.55, sprite: '#d8a8b8' },
};

const TOWERS = [['scrap_turret', -3.5, 2.2], ['thorn_nest', 3.4, 2.6], ['arc_spire', -4.2, -2.4], ['snare_vine', 4.0, -1.8]];
const LURKERS = [['crawler', -8.8, 3.5], ['skitter', -9.6, 1.4], ['crawler', 9.2, 4.2], ['razorback', 10.5, -1.5], ['feral', -7.4, -5.6]];

export class MenuBackdrop {
  constructor(game, opts = {}) {
    this.game = game;
    this.opts = opts;
    const m = (this.mood = MOODS[opts.mood] || MOODS.dusk);
    this.t = 0;
    this.angle = opts.angle ?? -0.9;
    this.speed = opts.speed ?? 0.04;
    this.visuals = [];

    if (!game._menuJungle) {
      const data = generateWorld(opts.seed ?? 20261013, DISTRICT_KEYS);
      game._menuJungle = { data, cut: new Uint8Array(data.size * data.size) };
    }
    const { data, cut } = game._menuJungle;
    this.data = data;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(m.bg);
    this.camera = new PixelCamera({ dist: 30, near: 1, far: 90 });
    this.camera.setSize(game.width, game.height);
    this.world = new JungleWorld(game, scene, data, cut);
    this.post = new PostFx(game);
    const U = this.post.uniforms;
    U.tShade.value = this.world.shadeTex;
    U.uWorld.value = data.size;
    U.uTint.value.setRGB(...m.tint);
    U.uAmbient.value = m.ambient;
    U.uLightR.value = 9999;
    U.uVignette.value = ATMOS.vignette * 1.2;

    game.assets.setTint(m.sprite);
    const c = data.center;
    this._add('relay_core', c.x, c.z);
    for (const [key, x, z] of TOWERS) this._add(key, c.x + x, c.z + z);
    for (const [key, x, z] of opts.mood === 'fallen' ? LURKERS.map(([k, x, z]) => [k, x * 0.45, z * 0.5]) : LURKERS) {
      const v = this._add(key, c.x + x, c.z + z);
      setFacing(v, -x, -z);
    }
    this._placeCamera();
    this.world.warm(this.focus.x, this.focus.z);
  }

  _add(key, x, z) {
    const v = this.game.assets.makeVisual(key, {});
    v.position.set(x, 0, z);
    setAnim(v, 'idle');
    this.scene.add(v);
    this.visuals.push(v);
    return v;
  }

  _placeCamera() {
    // A slow figure-eight around the clearing, shifted for menus that keep one side clear.
    const c = this.data.center;
    const fx = c.x + Math.sin(this.angle) * 7 - ((this.opts.shiftX || 0) * this.game.width) / 32;
    const fz = c.z - 1 + Math.sin(this.angle * 1.6) * 3;
    this.focus = this.camera.setFocus(fx, fz);
  }

  update(dt) {
    this.t += dt;
    this.angle += dt * this.speed;
    this._placeCamera();
    this.world.update(dt, this.focus.x, this.focus.z + 2);
    this.post.uniforms.uTime.value = this.t;
    this.post.uniforms.uPlayer.value.set(this.game.width / 2, this.game.height / 2);
    for (const v of this.visuals) updateVisual(v, dt);
  }

  dispose() {
    for (const v of this.visuals) this.game.assets.disposeVisual(v);
    this.visuals = [];
    this.world.dispose();
    this.post.dispose();
    this.scene.clear();
    this.game.assets.setTint('#ffffff');
  }
}
