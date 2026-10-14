// Spore pod visuals (critic H #12): the hand-drawn pod (spore_pod: idle breathing, swell before it bursts)
// and the cloud as a handful of instanced puff sprites (spore_puff_1..3) instead of a flat dithered slab.
// Gameplay (fuse, damage, radius) stays in src/entities/SporePods.js; this is only the look. Falls back to the
// V1 'spores' decal and the old dithered disc when the art is missing (SporeCloud.make returns null).
//
// A cloud: SPORE_LOOK.puffs sprites spread over the cloud radius (one in the middle, the rest on a ring),
// popping in from the centre outward as it bursts, drifting and bobbing a whole texel, and dropping out one by
// one (outer first) as it thins — every step whole sprites, hard alpha, no fades.

import { setAnim, updateVisual, hasAnim } from '../core/Assets.js';
import { SPORES, SPORE_LOOK } from '../data/jungle.js';
import { CARD_SCALE } from '../core/PixelView.js';

/** The pod's visual: spore_pod (idle) if drawn, else the V1 spores decal. */
export function podVisual(assets) {
  const v = assets.makeVisual(assets.hasSprite('spore_pod') ? 'spore_pod' : 'spores');
  setAnim(v, 'idle');
  return v;
}

/** The pod is about to burst: its swell frames (when the art has them). */
export function swellPod(vis) {
  if (vis && hasAnim(vis, 'swell')) setAnim(vis, 'swell');
}

export class SporeCloud {
  /** A puff cloud at (x, z), or null when the puff art is missing (use the old disc). */
  static make(scene, x, z) {
    const A = scene.game.assets;
    const keys = [1, 2, 3].map((n) => `spore_puff_${n}`).filter((k) => A.hasSprite(k));
    return keys.length ? new SporeCloud(scene, x, z, keys) : null;
  }

  constructor(scene, x, z, keys) {
    this.scene = scene;
    this.assets = scene.game.assets;
    this.x = x; this.z = z;
    const L = SPORE_LOOK, R = SPORES.radius;
    const n = L.puffs;
    this.puffs = [];
    for (let i = 0; i < n; i++) {
      // One in the middle, the rest on a ring (alternating inner / outer), angles jittered.
      const a = (i / Math.max(1, n - 1)) * Math.PI * 2 + Math.random() * 0.5;
      const r = i === 0 ? 0 : R * (i % 2 ? L.ring[0] : L.ring[1]);
      const v = this.assets.makeVisual(keys[i % keys.length], { shadow: false, emissive: false });
      v.visible = false;
      scene.three.add(v);
      this.puffs.push({
        v, ox: Math.cos(a) * r, oz: Math.sin(a) * r * 0.8,
        y: L.height[0] + Math.random() * (L.height[1] - L.height[0]),
        dx: (Math.random() - 0.5) * L.drift, dz: (Math.random() - 0.5) * L.drift,
        ph: Math.random() * 6.28, order: r / Math.max(1e-3, R) + Math.random() * 0.2,
      });
    }
    // Pop-in order: centre first; thin-out order: outer first.
    this.byOrder = [...this.puffs].sort((p, q) => p.order - q.order);
    this.t = 0;
  }

  /** Advance; `k` = cloud age / SPORES.life (0..1). */
  update(dt, k) {
    this.t += dt;
    const L = SPORE_LOOK, n = this.byOrder.length;
    const grow = Math.min(n, Math.ceil((this.t / L.grow) * n));
    const thin = k > L.thinFrom ? Math.ceil(((k - L.thinFrom) / (1 - L.thinFrom)) * n) : 0;
    this.byOrder.forEach((p, i) => {
      const on = i < grow && i < n - thin;
      p.v.visible = on;
      if (!on) return;
      const bob = Math.round(Math.sin(this.t * L.bobSpeed + p.ph)) / 32;   // a whole texel up / down
      p.v.position.set(this.x + p.ox + p.dx * this.t, (p.y + bob) * CARD_SCALE, this.z + p.oz + p.dz * this.t);
      updateVisual(p.v, dt);
    });
  }

  dispose() {
    for (const p of this.puffs) this.assets.disposeVisual(p.v);
    this.puffs = [];
  }
}
