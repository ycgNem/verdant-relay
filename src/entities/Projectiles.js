// Pooled projectiles for the night defense:
//   shoot()  homing shots (turret bullets, thorns) that follow a target and call onHit on contact
//   lob()    parabolic shells (mortar seed pods, Spitter sap) that land at a ground point
//   zone()   lingering ground patches (burning sap) that damage enemies inside every frame
// Meshes are pooled per look and reused; nothing allocates per shot except the small record.
// Impact effects go through the shared Fx instance (src/core/Fx.js).

import * as THREE from 'three';
import { JUICE } from '../data/config.js';
import { canvasTex } from '../core/Fx.js';

// Looks: unlit so they read at night. Streaks are camera-facing tracer quads (`w` texels wide, `len`
// tiles long) with a bright head pixel; shells and sap are small pixel sprites (`px` texels).
const LOOKS = {
  bullet: { streak: true, w: 2, len: 0.42, color: '#fee761', head: '#ffffff' },
  crit: { streak: true, w: 3, len: 0.62, color: '#feae34', head: '#ffffff' },
  thorn: { streak: true, w: 2, len: 0.3, color: '#99e550', head: '#e4ffb0' },
  shell: { sprite: 'shell', px: 9 },
  sap: { sprite: 'sap', px: 8 },
};

/** Pixel sprites for lobbed shots: a green seed pod with a dark outline, a pink sap glob. */
function lobTexture(kind) {
  const N = kind === 'shell' ? 9 : 8;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const [body, hi, lo] = kind === 'shell' ? ['#3e8948', '#63c74d', '#265c42'] : ['#ff4d8d', '#ff9ec4', '#b55088'];
  const r = N / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      if (d > r) continue;
      let col = d > r - 1 ? '#181425' : body;
      if (d <= r - 1 && x + y >= N + 1) col = lo;
      if (d <= r - 1 && x + y <= N / 2) col = hi;
      if (kind === 'shell' && d <= r - 1 && y === Math.floor(r) && x > 1 && x < N - 2 && x % 2) col = '#feae34';   // glowing seed band
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return canvasTex(c);
}

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
const _t = new THREE.Vector3();

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
      if (l.streak) {
        this.mats[k] = new THREE.MeshBasicMaterial({ color: l.color, side: THREE.DoubleSide, depthWrite: false, depthTest: false, transparent: true });
        this.mats[k + '_head'] = new THREE.SpriteMaterial({ color: l.head, depthWrite: false, depthTest: false });
      } else {
        this.mats[k] = new THREE.SpriteMaterial({ map: lobTexture(l.sprite), alphaTest: 0.5, transparent: true });
      }
      this.pools[k] = [];
    }
    this.streakGeom = new THREE.PlaneGeometry(1, 1);
    // Burning sap patch: a flat disc with a speckled pixel ember texture (alpha-tested, flickers).
    this.zoneGeom = new THREE.CircleGeometry(1, 20);
    this.zoneTex = makeEmberTexture();
    // Shadow dot under lobbed shells, so the landing point reads from the 55° camera.
    this.shadowGeom = new THREE.CircleGeometry(0.12, 8);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false });
  }

  _mesh(look) {
    const L = LOOKS[look];
    let m = this.pools[look].pop();
    if (!m) {
      if (L.streak) {
        m = new THREE.Mesh(this.streakGeom, this.mats[look]);
        m.matrixAutoUpdate = false;
        m.renderOrder = 34;
        const head = new THREE.Sprite(this.mats[look + '_head']);
        head.scale.set((L.w + 1) / 32, (L.w + 1) / 32, 1);
        head.renderOrder = 35;
        m.userData.head = head;
      } else {
        m = new THREE.Sprite(this.mats[look]);
        m.scale.set(L.px / 32, L.px / 32, 1);
      }
    }
    m.visible = true;
    this.scene.three.add(m);
    if (m.userData.head) this.scene.three.add(m.userData.head);
    return m;
  }

  /** Streak from the shot's start (or `len` behind its head) to its head. */
  _streak(p) {
    const L = LOOKS[p.look];
    const head = p.pos;
    _t.subVectors(p.start, head);
    const back = Math.min(L.len, _t.length());
    if (back > 1e-4) _t.multiplyScalar(back / _t.length()); else _t.set(-0.01, 0, 0);
    _t.add(head);
    this.scene.fx.orientStreak(p.mesh, _t, head, (L.w / 32));
    p.mesh.userData.head.position.copy(head);
  }

  _release(p) {
    p.mesh.visible = false;
    p.mesh.removeFromParent();
    p.mesh.userData.head?.removeFromParent();
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
    const p = {
      kind: 'shot', look, mesh, target, aim: target.aimPoint(new THREE.Vector3()), pos: from.clone(), start: from.clone(),
      speed: opts.speed || 12, onHit: opts.onHit, canHit: opts.canHit, tracking: true,
    };
    this._streak(p);
    this.list.push(p);
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

  /** Burning ground patch. opts: { radius, dps, time, type, color, source (tower credited with the damage) }. */
  zone(pos, opts) {
    const mat = new THREE.MeshBasicMaterial({ map: this.zoneTex, color: opts.color || '#ffffff', transparent: true, opacity: 0.9, alphaTest: 0.3, depthWrite: false });
    const mesh = new THREE.Mesh(this.zoneGeom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.035, pos.z);
    mesh.scale.setScalar(opts.radius);
    mesh.renderOrder = 1;
    this.scene.three.add(mesh);
    this.zones.push({ mesh, pos: new THREE.Vector3(pos.x, 0, pos.z), radius: opts.radius, dps: opts.dps, t: 0, time: opts.time, type: opts.type || 'burn', ember: 0, source: opts.source || null });
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
        _v.subVectors(p.aim, p.pos);
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
        p.pos.add(_v);
        this._streak(p);
      } else {
        p.t += dt;
        const k = Math.min(1, p.t / p.time);
        p.mesh.position.lerpVectors(p.from, p.to, k);
        p.mesh.position.y = p.from.y * (1 - k) + p.to.y * k + p.height * 4 * k * (1 - k);
        p.shadow.position.set(p.mesh.position.x, 0.03, p.mesh.position.z);
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
        if (dx * dx + dz * dz <= r2) this.scene.damage(e, z.dps * dt, z.type, { silent: true, source: z.source });
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
    for (const k of Object.keys(this.mats)) this.mats[k].dispose();
    for (const k of Object.keys(this.pools)) for (const m of this.pools[k]) { m.removeFromParent(); m.userData.head?.removeFromParent(); }
    this.streakGeom.dispose();
    this.zoneGeom.dispose();
    this.zoneTex.dispose();
    this.shadowGeom.dispose();
    this.shadowMat.dispose();
  }
}
