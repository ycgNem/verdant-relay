// Exploration projectiles (player bullets, enemy bolts and sap globs) and the Pulse Cutter sweep.
// Meshes are pooled per kind; every shot moves in small steps so it can't skip through a wall or a
// small enemy at high speed.

import * as THREE from 'three';
import { CONFIG, JUICE } from '../data/config.js';
import { canvasTex, lobShadowTexture } from '../core/Fx.js';

// Streak shots are camera-facing tracer quads (2 px wide, growing out of the muzzle to `trail`) with
// a bright head pixel; the sap glob is a little pixel sprite.
const KINDS = {
  bullet: { streak: true, color: '#fee761', head: '#ffffff', trail: () => JUICE.tracer.bullet, width: 1, radius: 0.12 },
  pellet: { streak: true, color: '#feae34', head: '#fff6c0', trail: () => JUICE.tracer.pellet, width: 1, radius: 0.12 },
  bolt: { streak: true, color: '#ff5a3c', head: '#ffd0b0', trail: () => JUICE.tracer.bolt, width: 1.5, radius: 0.16 },
  glob: { sprite: true, color: '#ff4d8d', radius: 0.2 },
};

let globTex = null;
/** 9×9 sap glob: dark outline, pink body, light top-left highlight, purple underside. */
function getGlobTexture() {
  if (globTex) return globTex;
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const g = c.getContext('2d');
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const d = Math.hypot(x - 4, y - 4);
      if (d > 4.3) continue;
      let col = d > 3.4 ? '#181425' : '#ff4d8d';
      if (d <= 3.4 && x + y >= 10) col = '#b55088';
      if (d <= 3.4 && x + y <= 5) col = '#ff9ec4';
      if ((x === 3 && y === 2) || (x === 2 && y === 3)) col = '#ffffff';
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  globTex = canvasTex(c);
  return globTex;
}

export class Shots {
  constructor(scene) {
    this.scene = scene;
    this.three = scene.three;
    this.list = [];
    this.pool = {};
    this.geos = {};
    this.mats = {};
    this.sweeps = [];
    this.h = JUICE.tracer.y;   // visual height only (hits are tested on the ground plane)
  }

  _mesh(kind) {
    const k = KINDS[kind];
    if (!this.mats[kind]) {
      this.pool[kind] = [];
      if (k.streak) {
        this.mats[kind] = new THREE.MeshBasicMaterial({ color: k.color, side: THREE.DoubleSide, depthWrite: false, transparent: true });
        this.mats[kind + '_head'] = new THREE.SpriteMaterial({ color: k.head, depthWrite: false });
      } else {
        this.mats[kind] = new THREE.SpriteMaterial({ map: getGlobTexture(), alphaTest: 0.5, transparent: true });
      }
    }
    let m = this.pool[kind].pop();
    if (!m) {
      if (k.streak) {
        m = new THREE.Mesh(this.scene.fx.quad, this.mats[kind]);
        m.matrixAutoUpdate = false;
        m.renderOrder = 12;
        const head = new THREE.Sprite(this.mats[kind + '_head']);
        const hs = JUICE.tracer.headSize;
        head.scale.set(hs, hs, 1);
        head.renderOrder = 13;
        m.userData.head = head;
      } else {
        m = new THREE.Sprite(this.mats[kind]);
        m.scale.set(9 / 32, 9 / 32, 1);
        m.center.set(0.5, 0.5);
      }
    }
    m.visible = true;
    this.three.add(m);
    if (m.userData.head) this.three.add(m.userData.head);
    return m;
  }

  /** o: { team, kind, x, z, dx, dz, speed, range, damage, knockback, color } */
  fire(o) {
    const mesh = this._mesh(o.kind);
    const s = {
      ...o, travelled: 0, mesh, radius: KINDS[o.kind].radius, dead: false, t: 0, x0: o.x, z0: o.z,
    };
    this._place(s, 0);
    this.list.push(s);
    return s;
  }

  _place(s, lift) {
    const k = KINDS[s.kind];
    if (k.streak) {
      const len = Math.min(k.trail(), s.travelled + 0.15);
      const head = new THREE.Vector3(s.x, this.h, s.z);
      const tail = new THREE.Vector3(s.x - s.dx * len, this.h, s.z - s.dz * len);
      this.scene.fx.orientStreak(s.mesh, tail, head, JUICE.tracer.width * k.width);
      s.mesh.userData.head.position.copy(head);
    } else {
      s.mesh.position.set(s.x, this.h + lift, s.z);
    }
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
        // Lobbed sap globs sail over the undergrowth; anything else stops in a thicket or wall.
        if (s.kind !== 'glob' && world.opaqueAt(tx, ty)) {
          this._impact(s, world.brushAt?.(tx, ty) ? '#63c74d' : null);
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
        this._place(s, lift);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (!s.dead) continue;
      s.mesh.removeFromParent();
      s.mesh.userData.head?.removeFromParent();
      this.pool[s.kind].push(s.mesh);
      this.list.splice(i, 1);
    }
    this._updateSweeps(dt);
    this._updateLobs(dt);
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
    // Wall hits throw a spark and a puff of grit off the surface.
    if (!hitSomething) {
      fx.spark({ x: s.x - s.dx * 0.12, y: this.h, z: s.z - s.dz * 0.12 }, { color: color || (s.team === 'player' ? '#fee761' : KINDS[s.kind].color), dir: { x: s.dx, z: s.dz } });
      fx.burst({ x: s.x - s.dx * 0.1, y: this.h - 0.45, z: s.z - s.dz * 0.1 }, { color: '#8b9bb4', color2: '#5a6988', count: 3, speed: 1, up: 1, life: 0.35, size: 3 / 32, gravity: 6, vx: -s.dx, vz: -s.dz });
    }
    if (s.kind === 'glob') fx.ring({ x: s.x, z: s.z }, { color: '#ff4d8d', radius: 0.7, life: 0.3 });
  }

  /**
   * Lobbed sap glob (Spitter): arcs from (x, z) to the locked target (tx, tz) over `time` seconds, with a
   * ground shadow under it, and splashes everything within `radius` of the target on landing. The
   * landing spot is marked by a dithered ring (Fx.ringTele) for the whole flight, so it is dodged by
   * stepping out of the ring or rolling. o: { x, z, tx, tz, time, apex, y0, radius, damage, source }
   */
  lob(o) {
    const sprite = this._mesh('glob');
    if (!this._shadowMat) this._shadowMat = new THREE.MeshBasicMaterial({ map: lobShadowTexture(), transparent: false, alphaTest: 0.5, depthWrite: false });
    if (!this._shadowGeo) this._shadowGeo = new THREE.PlaneGeometry(7 / 32, 3 / 32);
    const shadow = new THREE.Mesh(this._shadowGeo, this._shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.userData.pxSnap = true;
    shadow.renderOrder = 1;
    this.three.add(shadow);
    const L = { ...o, t: 0, sprite, shadow };
    L.ring = o.ring || this.scene.fx.ringTele({ x: o.tx, z: o.tz }, { radius: o.radius, color: '#ff4d8d', color2: '#b55088', time: o.time, fade: 0.05 });
    (this.lobs ||= []).push(L);
    this._placeLob(L);
    return L;
  }

  _placeLob(L) {
    const k = Math.min(1, L.t / L.time);
    const x = L.x + (L.tx - L.x) * k, z = L.z + (L.tz - L.z) * k;
    const y = (L.y0 ?? 0.6) * (1 - k) + 0.12 * k + L.apex * 4 * k * (1 - k);
    L.sprite.position.set(x, y, z);
    L.shadow.position.set(x, 0.02, z);
    L.cx = x; L.cz = z;
  }

  _updateLobs(dt) {
    if (!this.lobs?.length) return;
    const sc = this.scene;
    for (let i = this.lobs.length - 1; i >= 0; i--) {
      const L = this.lobs[i];
      L.t += dt;
      this._placeLob(L);
      // a thin sap drip trails the glob
      if (Math.random() < dt * 14) sc.fx.burst({ x: L.cx, y: L.sprite.position.y - 0.45, z: L.cz }, { color: '#b55088', count: 1, speed: 0.2, up: 0, life: 0.25, size: 1 / 32, gravity: 6 });
      if (L.t < L.time) continue;
      // splash
      const p = sc.player;
      if (p && !p.dead && Math.hypot(p.pos.x - L.tx, p.pos.z - L.tz) < L.radius + p.r * 0.5) {
        const dx = L.tx - L.x, dz = L.tz - L.z, dl = Math.hypot(dx, dz) || 1;
        p.hurt(L.damage, dx / dl, dz / dl, L.source);
      }
      const fx = sc.fx;
      fx.burst({ x: L.tx, y: 0, z: L.tz }, { color: '#ff4d8d', color2: '#b55088', count: 12, speed: 2.2, up: 2.2, life: 0.4, size: 2 / 32, y: 0.1 });
      fx.burst({ x: L.tx, y: 0, z: L.tz }, { color: '#ffffff', color2: '#ff9ec4', count: 4, speed: 1.4, up: 2.8, life: 0.25, size: 1 / 32, y: 0.15 });
      fx.decal({ x: L.tx, z: L.tz }, { color: '#68386c', radius: L.radius * 0.75, life: JUICE.tele.lob.puddle });
      this.scene.game.sfx.play('splat');
      L.sprite.removeFromParent();
      this.pool.glob.push(L.sprite);
      L.shadow.removeFromParent();
      this.lobs.splice(i, 1);
    }
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
    for (const L of this.lobs || []) { L.ring.cancel(); L.sprite.removeFromParent(); this.pool.glob.push(L.sprite); L.shadow.removeFromParent(); }
    if (this.lobs) this.lobs.length = 0;
  }

  dispose() {
    for (const s of this.list) { s.mesh.removeFromParent(); s.mesh.userData.head?.removeFromParent(); }
    for (const L of this.lobs || []) { L.sprite.removeFromParent(); L.shadow.removeFromParent(); }
    this.lobs = [];
    this._shadowMat?.dispose();
    this._shadowGeo?.dispose();
    for (const s of this.sweeps) disposeTree(s.m);
    this.list = [];
    this.sweeps = [];
    for (const k in this.mats) this.mats[k].dispose();
  }
}

function disposeTree(o) {
  o.removeFromParent();
  o.traverse((c) => { c.geometry?.dispose(); c.material?.dispose(); });
}
