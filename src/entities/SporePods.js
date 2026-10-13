// Spore pods: the jungle's hazard (thickest in the Canopy Greenhouse). Tuning: SPORES in src/data/jungle.js;
// placement: JungleGen (world.spores). Pods regrow every day, so nothing here persists.
//
// Walk within `trigger` of a pod and it swells (a ring telegraph) for `fuse` seconds, then bursts into a
// cloud. A machete hit pops it almost at once. Standing in a cloud hurts every `tick` and drains stamina;
// the Safe Hands skill halves the damage and stops the drain. The cloud is a flat, Bayer-dithered decal
// (whole texels, NearestFilter) that thickens as it bursts and thins out before it goes.

import * as THREE from 'three';
import { SPORES } from '../data/jungle.js';
import { STAMINA } from '../data/config.js';
import { setAnim, updateVisual, flashVisual } from '../core/Assets.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LEVELS = [0.3, 0.55, 0.8, 1];   // cloud density frames (burst grows through them, fade goes back down)

/** Dithered cloud textures, one per density level (texel = 1/32 tile, like every sprite). */
function cloudTextures() {
  const R = SPORES.radius, n = Math.ceil(R * 2 * 32);
  const light = new THREE.Color(SPORES.color), dark = new THREE.Color(SPORES.color2);
  return LEVELS.map((lv) => {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1;
      const r = Math.hypot(dx, dy);
      if (r >= 1) continue;
      // Lumpy falloff: denser in the middle, a few puffs of noise.
      const lump = 0.82 + 0.18 * Math.sin(dx * 7.3 + dy * 2.1) * Math.cos(dy * 6.1 - dx * 1.7);
      const dens = lv * Math.pow(1 - r * r, 0.55) * lump * 0.85;
      if ((BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 >= dens) continue;
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const col = (h % 7 === 0 || r > 0.8) ? dark : light;
      const o = (y * n + x) * 4;
      img.data[o] = col.r * 255; img.data[o + 1] = col.g * 255; img.data[o + 2] = col.b * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export class SporePods {
  constructor(scene, pods) {
    this.scene = scene;
    this.game = scene.game;
    this.pods = pods.map((p) => ({ ...p, vis: null, armed: false, fuse: 0, popped: false, tele: null }));
    this.clouds = [];
    this.tickT = 0;
    this.warned = false;
    for (const p of this.pods) {
      p.vis = this.game.assets.makeVisual('spores');
      p.vis.position.set(p.x, 0, p.z);
      setAnim(p.vis, 'idle');
      scene.three.add(p.vis);
    }
  }

  /** Pods the machete can hit (scene.hittables). */
  hittables(out) {
    for (const p of this.pods) {
      if (p.popped) continue;
      out.push({ x: p.x, z: p.z, radius: 0.35, dead: false, spore: true, hit: () => this._arm(p, SPORES.hitFuse) });
    }
    return out;
  }

  _arm(p, fuse) {
    if (p.popped || (p.armed && p.fuse <= fuse)) return;
    p.armed = true;
    p.fuse = fuse;
    p.tele?.cancel();
    p.tele = this.scene.fx.telegraph({ x: p.x, z: p.z }, { radius: SPORES.radius, color: SPORES.color, time: fuse });
    if (!this.warned) {
      this.warned = true;
      this.scene.toast('Spore pod! It bursts into a choking cloud — back off, or chop it from range', 'amber', 3.2);
    }
  }

  _burst(p) {
    p.popped = true;
    p.tele = null;
    this.game.assets.disposeVisual(p.vis);
    p.vis = null;
    const fx = this.scene.fx;
    fx.burst({ x: p.x, y: 0.3, z: p.z }, { color: SPORES.color, color2: SPORES.color2, count: 26, speed: 2.4, up: 2.2, life: 0.8, size: 2 / 32, gravity: -0.6 });
    this.game.sfx.play('spit');
    if (!this.mats) this.mats = cloudTextures().map((map) => new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, depthWrite: false }));
    if (!this.geom) this.geom = new THREE.PlaneGeometry(SPORES.radius * 2, SPORES.radius * 2);
    const m = new THREE.Mesh(this.geom, this.mats[0]);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.03, p.z);
    m.userData.pxSnap = true;
    this.scene.three.add(m);
    this.clouds.push({ x: p.x, z: p.z, t: 0, mesh: m, puffT: 0 });
  }

  update(dt) {
    const sc = this.scene, pl = sc.player;
    for (const p of this.pods) {
      if (p.popped) continue;
      if (p.vis) updateVisual(p.vis, dt);
      const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
      if (!p.armed && !pl.dead && d < SPORES.trigger) { this._arm(p, SPORES.fuse); this.game.sfx.play('rustle'); }
      if (p.armed) {
        p.fuse -= dt;
        if (p.vis && Math.floor(p.fuse * 12) % 2 === 0) flashVisual(p.vis, '#ffffff', 0.04);
        if (p.fuse <= 0) this._burst(p);
      }
    }
    // Clouds: grow, linger, thin out; hurt and sap whoever stands in one.
    let inside = false;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t += dt;
      const k = c.t / SPORES.life;
      const lv = c.t < 0.3 ? Math.floor((c.t / 0.3) * LEVELS.length) : k > 0.6 ? Math.floor((1 - (k - 0.6) / 0.4) * LEVELS.length) : LEVELS.length - 1;
      c.mesh.material = this.mats[Math.max(0, Math.min(LEVELS.length - 1, lv))];
      c.puffT -= dt;
      if (c.puffT <= 0 && k < 0.9) {
        c.puffT = 0.25;
        const a = Math.random() * Math.PI * 2, r = Math.random() * SPORES.radius * 0.8;
        sc.fx.burst({ x: c.x + Math.cos(a) * r, y: 0.2, z: c.z + Math.sin(a) * r }, { color: SPORES.color, count: 2, speed: 0.4, up: 0.9, life: 0.9, size: 2 / 32, gravity: -0.3 });
      }
      if (Math.hypot(pl.pos.x - c.x, pl.pos.z - c.z) < SPORES.radius * (k > 0.6 ? 1 - (k - 0.6) : 1)) inside = true;
      if (k >= 1) { c.mesh.removeFromParent(); this.clouds.splice(i, 1); }
    }
    if (!inside || pl.dead) { this.tickT = 0; return; }
    const safe = this.game.run.hasSkill('safe_hands');
    if (!safe) {
      pl.stamina = Math.max(0, pl.stamina - SPORES.staminaDrain * dt);
      pl.staminaDelay = Math.max(pl.staminaDelay, STAMINA.delay);
      if (pl.stamina <= 0) pl.exhausted = true;
    }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = SPORES.tick;
      pl.hurt(SPORES.damage * (safe ? SPORES.safeHands : 1), 0, 0);
    }
  }

  dispose() {
    for (const p of this.pods) { if (p.vis) this.game.assets.disposeVisual(p.vis); p.tele?.cancel(); }
    for (const c of this.clouds) c.mesh.removeFromParent();
    for (const m of this.mats || []) { m.map.dispose(); m.dispose(); }
    this.geom?.dispose();
  }
}
