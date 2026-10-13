// Pooled projectiles for the night defense:
//   shoot()  homing shots (turret bullets, thorns) that follow a target and call onHit on contact
//   lob()    parabolic shells (mortar seed pods, Spitter sap) that land at a ground point
//   zone()   lingering ground patches (burning sap) that damage enemies inside every frame
// Meshes are pooled per look and reused; nothing allocates per shot except the small record.
// Impact effects go through the shared Fx instance (src/core/Fx.js).

import * as THREE from 'three';

// Looks: unlit (MeshBasic) so they read at night. Sizes are in tiles.
const LOOKS = {
  bullet: { shape: 'box', size: [0.1, 0.1, 0.26], color: '#fee761' },
  crit: { shape: 'box', size: [0.18, 0.18, 0.4], color: '#feae34' },
  thorn: { shape: 'box', size: [0.06, 0.06, 0.24], color: '#99e550' },
  shell: { shape: 'sph', size: [0.16], color: '#3e8948' },
  sap: { shape: 'sph', size: [0.14], color: '#ff4d8d' },
};

const _v = new THREE.Vector3();

/** 32×32 speckled ember disc: sparse hard pixels in sap orange/red/amber, denser at the centre. */
function makeEmberTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const cols = ['#f77622', '#e43b44', '#feae34', '#be4a2f', '#fee761'];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / 16;
      if (d > 1 || Math.random() > 0.75 - d * 0.55) continue;
      g.fillStyle = cols[Math.floor(Math.random() * (d < 0.4 ? 5 : 4))];
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const _w = new THREE.Vector3();

export class Projectiles {
  /** scene: the DefenseScene (needs .three, .fx, .enemies, .damage(enemy, amount, type, opts)). */
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.zones = [];
    this.pools = {};
    this.geoms = {};
    this.mats = {};
    for (const [k, l] of Object.entries(LOOKS)) {
      this.geoms[k] = l.shape === 'box' ? new THREE.BoxGeometry(...l.size) : new THREE.SphereGeometry(l.size[0], 6, 4);
      this.mats[k] = new THREE.MeshBasicMaterial({ color: l.color });
      this.pools[k] = [];
    }
    // Burning sap patch: a flat disc with a speckled pixel ember texture (alpha-tested, flickers).
    this.zoneGeom = new THREE.CircleGeometry(1, 20);
    this.zoneTex = makeEmberTexture();
    // Shadow dot under lobbed shells, so the landing point reads from the 55° camera.
    this.shadowGeom = new THREE.CircleGeometry(0.12, 8);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false });
  }

  _mesh(look) {
    const m = this.pools[look].pop() || new THREE.Mesh(this.geoms[look], this.mats[look]);
    m.visible = true;
    this.scene.three.add(m);
    return m;
  }

  _release(p) {
    p.mesh.visible = false;
    p.mesh.removeFromParent();
    this.pools[p.look].push(p.mesh);
    if (p.shadow) { p.shadow.removeFromParent(); p.shadow = null; }   // geometry/material are shared
  }

  /**
   * Homing shot. opts: { speed, look, onHit(enemy), canHit(enemy) }.
   * If the target dies or becomes untargetable (burrows), the shot flies to its last position and fizzles.
   */
  shoot(from, target, opts) {
    const look = opts.look || 'bullet';
    const mesh = this._mesh(look);
    mesh.position.copy(from);
    this.list.push({
      kind: 'shot', look, mesh, target, aim: target.aimPoint(new THREE.Vector3()),
      speed: opts.speed || 12, onHit: opts.onHit, canHit: opts.canHit, tracking: true,
    });
  }

  /** Parabolic lob from `from` to ground point `to`. opts: { time, height, look, onLand(point) }. */
  lob(from, to, opts) {
    const look = opts.look || 'shell';
    const mesh = this._mesh(look);
    mesh.position.copy(from);
    const shadow = new THREE.Mesh(this.shadowGeom, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(from.x, 0.03, from.z);
    this.scene.three.add(shadow);
    this.list.push({
      kind: 'lob', look, mesh, shadow, from: from.clone(), to: to.clone(), t: 0,
      time: Math.max(0.2, opts.time || 1), height: opts.height ?? 2.5, onLand: opts.onLand,
    });
  }

  /** Burning ground patch. opts: { radius, dps, time, type, color }. */
  zone(pos, opts) {
    const mat = new THREE.MeshBasicMaterial({ map: this.zoneTex, color: opts.color || '#ffffff', transparent: true, opacity: 0.9, alphaTest: 0.3, depthWrite: false });
    const mesh = new THREE.Mesh(this.zoneGeom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.035, pos.z);
    mesh.scale.setScalar(opts.radius);
    mesh.renderOrder = 1;
    this.scene.three.add(mesh);
    this.zones.push({ mesh, pos: new THREE.Vector3(pos.x, 0, pos.z), radius: opts.radius, dps: opts.dps, t: 0, time: opts.time, type: opts.type || 'burn', ember: 0 });
  }

  update(dt) {
    const fx = this.scene.fx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.kind === 'shot') {
        const tg = p.target;
        if (p.tracking) {
          if (tg.dead || tg.removed || (p.canHit && !p.canHit(tg))) p.tracking = false;
          else tg.aimPoint(p.aim);
        }
        _v.subVectors(p.aim, p.mesh.position);
        const d = _v.length();
        const step = p.speed * dt;
        if (d <= Math.max(step, 0.18)) {
          if (p.tracking) p.onHit?.(tg);
          else fx.burst(p.aim, { color: '#8b9bb4', count: 3, speed: 1, up: 1, life: 0.2, size: 0.05, y: 0 });
          this._release(p);
          this.list.splice(i, 1);
          continue;
        }
        _v.multiplyScalar(step / d);
        _w.copy(p.mesh.position).add(_v);
        p.mesh.lookAt(_w);
        p.mesh.position.copy(_w);
      } else {
        p.t += dt;
        const k = Math.min(1, p.t / p.time);
        p.mesh.position.lerpVectors(p.from, p.to, k);
        p.mesh.position.y = p.from.y * (1 - k) + p.to.y * k + p.height * 4 * k * (1 - k);
        p.shadow.position.set(p.mesh.position.x, 0.03, p.mesh.position.z);
        p.mesh.rotation.x += dt * 8;
        if (k >= 1) {
          p.onLand?.(p.to);
          this._release(p);
          this.list.splice(i, 1);
        }
      }
    }

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      const r2 = z.radius * z.radius;
      for (const e of this.scene.enemies) {
        if (e.dead || e.removed) continue;
        const dx = e.pos.x - z.pos.x, dz = e.pos.z - z.pos.z;
        if (dx * dx + dz * dz <= r2) this.scene.damage(e, z.dps * dt, z.type, { silent: true });
      }
      z.mesh.material.opacity = (0.7 + Math.random() * 0.3) * Math.min(1, (z.time - z.t) / 0.5);
      z.mesh.rotation.z += dt * 0.6;
      z.ember -= dt;
      if (z.ember <= 0) {
        z.ember = 0.12;
        const a = Math.random() * Math.PI * 2, r = Math.random() * z.radius;
        fx.burst({ x: z.pos.x + Math.cos(a) * r, y: 0, z: z.pos.z + Math.sin(a) * r },
          { color: '#feae34', color2: '#e43b44', count: 2, speed: 0.4, up: 2.2, gravity: 2, life: 0.6, size: 0.06, y: 0.05 });
      }
      if (z.t >= z.time) {
        z.mesh.removeFromParent();
        z.mesh.material.dispose();
        this.zones.splice(i, 1);
      }
    }
  }

  /** Remove everything in flight (scene reset). */
  clear() {
    for (const p of this.list) this._release(p);
    this.list = [];
    for (const z of this.zones) { z.mesh.removeFromParent(); z.mesh.material.dispose(); }
    this.zones = [];
  }

  dispose() {
    this.clear();
    for (const k of Object.keys(this.geoms)) {
      this.geoms[k].dispose();
      this.mats[k].dispose();
      for (const m of this.pools[k]) m.removeFromParent();
    }
    this.zoneGeom.dispose();
    this.zoneTex.dispose();
    this.shadowGeom.dispose();
    this.shadowMat.dispose();
  }
}
