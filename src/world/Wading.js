// Wading (critic H #6): characters standing in shallow water (river edges, ponds, fords) sink in.
//
// Every frame, for the player and each creature: if the ground under its feet is water (deep water is
// solid, so this is the wadeable kind), every sprite of its visual (body, outline, silhouette, card mask,
// emissive, hit flash) gets a world-space clipping plane WATER.line texels above the feet — the sprites are
// upright cards, so world height = texel rows × CARD_SCALE / 32 and the cut is a clean horizontal waterline.
// Below it the water surface shows. A looping ripple (fx_ripple, flat) sits with its centre row on the
// waterline — under the body, so its near arc reads in front of the legs — and the blob shadow hides.
// Stepping in plays a one-shot splash (fx_splash, entry texel on the waterline). Pixel-exact: hard clip,
// whole-texel cut, flat 1:1 sprites.

import * as THREE from 'three';
import { CARD_SCALE } from '../core/PixelView.js';
import { updateVisual, setAnim } from '../core/Assets.js';
import { LEVEL, WATER } from '../data/jungle.js';

export class Wading {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    this.game.renderer.localClippingEnabled = true;
    this.state = new Map();     // visual root → { wet, plane, ripple, line }
    this.splashes = [];
    this.hasRipple = this.game.assets.hasSprite('fx_ripple');
    this.hasSplash = this.game.assets.hasSprite('fx_splash');
  }

  _bodies() {
    const sc = this.scene, out = this._out || (this._out = []);
    out.length = 0;
    if (sc.player?.vis) out.push([sc.player.vis, sc.player.pos.x, sc.player.pos.z]);
    for (const e of sc.enemies) if (e.vis && !e.dead) out.push([e.vis, e.x, e.z]);
    return out;
  }

  update(dt) {
    const w = this.scene.world;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (const [vis, x, z] of this._bodies()) {
      seen.add(vis);
      let st = this.state.get(vis);
      const wet = w.levelAt(x, z) === LEVEL.water && !w.deepAt(Math.floor(x), Math.floor(z));
      if (!st) {
        // Waterline in texels: WATER.line, but at most WATER.maxShare of a small creature's height.
        const v = vis.userData.vis;
        const tall = v?.anchor ? v.anchor[1] : 48;
        const line = Math.max(3, Math.min(WATER.line, Math.round(tall * WATER.maxShare)));
        st = { wet: false, known: false, line, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -(line / 32) * CARD_SCALE), ripple: null };
        this.state.set(vis, st);
      }
      if (wet !== st.wet) {
        st.wet = wet;
        vis.traverse((o) => { if (o.name === 'shadow') o.visible = !wet; });
        if (!wet) this._clip(vis, null);
        if (wet && st.known) this._splash(x, z - st.line / 32);
        if (st.ripple) st.ripple.visible = wet;
      }
      st.known = true;
      if (wet) {
        this._clip(vis, st.plane);   // every frame: sprites added later (a hit flash) get it too
        if (!st.ripple && this.hasRipple) {
          st.ripple = this.game.assets.makeVisual('fx_ripple', { shadow: false, emissive: false });
          setAnim(st.ripple, 'idle');
          this.scene.three.add(st.ripple);
        }
        if (st.ripple) {
          st.ripple.visible = true;
          st.ripple.position.set(x, 0.004, z - st.line / 32);   // centre row on the waterline
          updateVisual(st.ripple, dt);
        }
      }
    }
    // Bodies that went away (killed, despawned): drop their ripple.
    for (const [vis, st] of this.state) {
      if (seen.has(vis)) continue;
      if (st.ripple) this.game.assets.disposeVisual(st.ripple);
      this.state.delete(vis);
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.t += dt;
      updateVisual(s.vis, dt);
      if (s.t >= s.life) { this.game.assets.disposeVisual(s.vis); this.splashes.splice(i, 1); }
    }
  }

  /** Clip (or unclip) every sprite of a visual at a waterline plane. */
  _clip(vis, plane) {
    const planes = plane ? (plane._arr || (plane._arr = [plane])) : null;
    vis.traverse((o) => {
      if (!o.isSprite || !o.material) return;
      if (o.material.clippingPlanes !== planes) o.material.clippingPlanes = planes;
    });
  }

  _splash(x, z) {
    if (!this.hasSplash) return;
    const v = this.game.assets.makeVisual('fx_splash', { shadow: false, emissive: false });
    setAnim(v, 'idle', true);
    // The splash's entry texel (WATER.splashEntry, frame px) on the waterline point.
    const [ex, ey] = WATER.splashEntry, g = v.userData.vis.geom;
    v.position.set(x - (ex - g.fw / 2) / 32, 0.006, z - (ey - g.fh / 2) / 32);
    this.scene.three.add(v);
    const a = v.userData.vis.anims?.idle;
    this.splashes.push({ vis: v, t: 0, life: a ? a.frames.length / a.fps : 0.33 });
  }

  dispose() {
    for (const [vis, st] of this.state) { if (st.ripple) this.game.assets.disposeVisual(st.ripple); this._clip(vis, null); }
    this.state.clear();
    for (const s of this.splashes) this.game.assets.disposeVisual(s.vis);
    this.splashes = [];
  }
}
