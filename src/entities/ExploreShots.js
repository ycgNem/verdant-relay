// Exploration projectiles (player bullets, enemy bolts and sap globs) and the Pulse Cutter sweep.
// Meshes are pooled per kind; every shot moves in small steps so it can't skip through a wall or a
// small enemy at high speed.

import * as THREE from 'three';
import { FLAG } from '../world/ExploreGen.js';
import { CONFIG } from '../data/config.js';

const KINDS = {
  bullet: { geo: () => new THREE.BoxGeometry(0.07, 0.07, 0.42), color: '#fee761', radius: 0.12 },
  pellet: { geo: () => new THREE.BoxGeometry(0.06, 0.06, 0.28), color: '#feae34', radius: 0.12 },
  bolt: { geo: () => new THREE.BoxGeometry(0.09, 0.09, 0.5), color: '#ff5a3c', radius: 0.16 },
  glob: { geo: () => new THREE.IcosahedronGeometry(0.15, 0), color: '#ff4d8d', radius: 0.2 },
};

export class Shots {
  constructor(scene) {
    this.scene = scene;
    this.three = scene.three;
    this.list = [];
    this.pool = {};
    this.geos = {};
    this.mats = {};
    this.sweeps = [];
    this.h = CONFIG.player.shotHeight;
  }

  _mesh(kind) {
    const k = KINDS[kind];
    if (!this.geos[kind]) {
      this.geos[kind] = k.geo();
      this.mats[kind] = new THREE.MeshBasicMaterial({ color: k.color });
      this.pool[kind] = [];
    }
    const m = this.pool[kind].pop() || new THREE.Mesh(this.geos[kind], this.mats[kind]);
    m.visible = true;
    this.three.add(m);
    return m;
  }

  /** o: { team, kind, x, z, dx, dz, speed, range, damage, knockback, color } */
  fire(o) {
    const mesh = this._mesh(o.kind);
    mesh.rotation.set(0, Math.atan2(o.dx, o.dz), 0);
    const s = {
      ...o, travelled: 0, mesh, radius: KINDS[o.kind].radius, dead: false, t: 0,
    };
    mesh.position.set(o.x, this.h, o.z);
    this.list.push(s);
    return s;
  }

  update(dt) {
    const sc = this.scene;
    const world = sc.world;
    for (const s of this.list) {
      if (s.dead) continue;
      s.t += dt;
      const total = s.speed * dt;
      const steps = Math.max(1, Math.ceil(total / 0.2));
      const step = total / steps;
      for (let i = 0; i < steps && !s.dead; i++) {
        s.x += s.dx * step;
        s.z += s.dz * step;
        s.travelled += step;
        const tx = Math.floor(s.x), ty = Math.floor(s.z);
        const f = world.flagAt(tx, ty);
        if (f & FLAG.OPAQUE) {
          this._impact(s, (f & FLAG.BRAMBLE) ? '#63c74d' : null);
          break;
        }
        if (s.team === 'player') {
          for (const t of sc.hittables()) {
            if (t.dead) continue;
            const r = s.radius + t.radius;
            if ((t.x - s.x) ** 2 + (t.z - s.z) ** 2 < r * r) {
              t.hit(s.damage, s.dx, s.dz, s.knockback || 0, 'shot');
              this._impact(s, t.bloodColor || null, true);
              break;
            }
          }
        } else {
          const p = sc.player;
          if (p && !p.dead) {
            const r = s.radius + p.r;
            if ((p.pos.x - s.x) ** 2 + (p.pos.z - s.z) ** 2 < r * r) {
              if (p.hurt(s.damage, s.dx, s.dz, s.source)) this._impact(s, '#e43b44', true);
              else if (!p.dodging) this._impact(s, null, true);
              // A dodge passes straight through the shot.
            }
          }
        }
        if (s.travelled >= s.range) { this._impact(s, null, false, true); break; }
      }
      if (!s.dead) {
        const lift = s.kind === 'glob' ? Math.sin(Math.min(1, s.travelled / s.range) * Math.PI) * 0.35 : 0;
        s.mesh.position.set(s.x, this.h + lift, s.z);
        if (s.kind === 'glob') s.mesh.rotation.x += dt * 8;
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (!s.dead) continue;
      s.mesh.removeFromParent();
      this.pool[s.kind].push(s.mesh);
      this.list.splice(i, 1);
    }
    this._updateSweeps(dt);
  }

  _impact(s, color, hitSomething = false, fizzle = false) {
    s.dead = true;
    const fx = this.scene.fx;
    const c = color || KINDS[s.kind].color;
    const pos = { x: s.x - s.dx * 0.1, y: this.h - 0.4, z: s.z - s.dz * 0.1 };
    if (fizzle) {
      fx.burst(pos, { color: c, count: 2, speed: 0.8, up: 0.5, life: 0.2, size: 0.05 });
      return;
    }
    fx.burst(pos, { color: c, color2: '#ffffff', count: hitSomething ? 6 : 4, speed: 2.4, up: 1.6, life: 0.3, size: 0.07, vx: -s.dx * 1.5, vz: -s.dz * 1.5 });
    if (s.kind === 'glob') fx.ring({ x: s.x, z: s.z }, { color: '#ff4d8d', radius: 0.7, life: 0.3 });
  }

  /** Pulse Cutter arc: a fading wedge on the ground in front of the player. */
  sweep(x, z, angle, radius, arc) {
    const geo = new THREE.RingGeometry(0.35, radius, 18, 1, -arc / 2, arc);
    const mat = new THREE.MeshBasicMaterial({ color: '#2ce8f5', transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    // Ring geometry is in XY; after rotating flat its angle θ points along (cos θ, -sin θ) in XZ.
    m.rotation.z = -angle;
    m.position.set(x, 0.08, z);
    m.renderOrder = 2;
    this.three.add(m);
    const edgeGeo = new THREE.RingGeometry(radius - 0.12, radius, 18, 1, -arc / 2, arc);
    const edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    m.add(edge);
    this.sweeps.push({ m, t: 0, life: 0.18 });
  }

  _updateSweeps(dt) {
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const s = this.sweeps[i];
      s.t += dt;
      const k = s.t / s.life;
      s.m.material.opacity = 0.75 * (1 - k);
      s.m.children[0].material.opacity = 0.9 * (1 - k);
      s.m.scale.setScalar(0.85 + 0.15 * Math.min(1, k * 2));
      if (k >= 1) {
        disposeTree(s.m);
        this.sweeps.splice(i, 1);
      }
    }
  }

  clearEnemyShots() {
    for (const s of this.list) if (s.team === 'enemy') s.dead = true;
  }

  dispose() {
    for (const s of this.list) s.mesh.removeFromParent();
    for (const s of this.sweeps) disposeTree(s.m);
    this.list = [];
    this.sweeps = [];
    for (const k in this.geos) { this.geos[k].dispose(); this.mats[k].dispose(); }
  }
}

function disposeTree(o) {
  o.removeFromParent();
  o.traverse((c) => { c.geometry?.dispose(); c.material?.dispose(); });
}
