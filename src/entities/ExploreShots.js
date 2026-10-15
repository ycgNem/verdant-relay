// Exploration projectiles (player bullets, enemy bolts and sap globs) and the Pulse Cutter sweep.
// Meshes are pooled per kind; every shot moves in small steps so it can't skip through a wall or a
// small enemy at high speed.

import * as THREE from 'three';
import { CONFIG, JUICE, DEFLECT, ROLL } from '../data/config.js';
import { BRUSH } from '../data/jungle.js';
import { canvasTex, lobShadowTexture } from '../core/Fx.js';
import { inFootprint } from '../world/Solid.js';

// Streak shots are camera-facing tracer quads (2 px wide, growing out of the muzzle to `trail`) with
// a bright head pixel; the sap glob is a little pixel sprite. The Feral's spear (critic I §9C) is a long
// wooden streak with a steel tip.
const KINDS = {
  bullet: { streak: true, color: '#fee761', head: '#ffffff', trail: () => JUICE.tracer.bullet, width: 1, radius: 0.12 },
  pellet: { streak: true, color: '#feae34', head: '#fff6c0', trail: () => JUICE.tracer.pellet, width: 1, radius: 0.12 },
  bolt: { streak: true, color: '#ff5a3c', head: '#ffd0b0', trail: () => JUICE.tracer.bolt, width: 1.5, radius: 0.16 },
  spear: { streak: true, color: '#a8763e', head: '#e8ecf4', trail: () => 0.95, width: 1.5, radius: 0.2 },
  glob: { sprite: true, color: '#ff4d8d', radius: 0.2 },
};

let bladeTex = null;
/**
 * The thrown machete: 8 spin frames of a 15 × 15 texel blade (steel with a lit edge, dark outline, a wooden grip),
 * each drawn texel by texel along its angle — rotated pixel art, not a rotated texture, so it stays pixel-exact.
 */
function getBladeTexture() {
  if (bladeTex) return bladeTex;
  const S = 15, N = 8;
  const c = document.createElement('canvas');
  c.width = S * N; c.height = S;
  const g = c.getContext('2d');
  const put = (f, x, y, col) => { if (x < 0 || y < 0 || x >= S || y >= S) return; g.fillStyle = col; g.fillRect(f * S + x, y, 1, 1); };
  for (let f = 0; f < N; f++) {
    const a = (f / N) * Math.PI * 2;
    const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    const cells = [];
    for (let t = -3.5; t <= 6.5; t += 0.25) {
      const blade = t > 0.5;
      const x = Math.round(7 + ux * t), y = Math.round(7 + uy * t);
      cells.push([x, y, blade ? (t > 5.5 ? '#ffffff' : '#c0cbdc') : '#5a4430']);
      if (blade && t < 5.8) cells.push([Math.round(7 + ux * t + nx), Math.round(7 + uy * t + ny), '#8b9bb4']);
    }
    // outline first (every neighbour of a body texel), then the body on top
    for (const [x, y] of cells) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(f, x + ox, y + oy, '#181425');
    for (const [x, y, col] of cells) put(f, x, y, col);
  }
  bladeTex = canvasTex(c);
  bladeTex.repeat.x = 1 / N;
  bladeTex.userData.frames = N;
  return bladeTex;
}

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
    this.puddles = [];         // sap puddles left by landed globs: { x, z, r, t } (slow the player, STATUS.sap)
    this.blades = [];          // the player's thrown machete (at most one)
    this.h = JUICE.tracer.y;   // visual height only (hits are tested on the ground plane)
  }

  /** Is (x, z) inside a sap puddle? (pad: extra reach, e.g. part of the player's radius) */
  sapAt(x, z, pad = 0) {
    for (const P of this.puddles) if ((P.x - x) ** 2 + (P.z - z) ** 2 < (P.r + pad) ** 2) return true;
    return false;
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
            if (t.dead || t.forage) continue;   // (shelf fungus: the machete in hand only)
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
              // A deflect (critic I §9A) knocks a bolt or spear out of the air.
              if (p.tryDeflect?.(s.owner || null, 'shot', s.x0, s.z0)) this._impact(s, '#ffffff', false);
              else if (p.hurt(s.damage, s.dx, s.dz, s.source, s.kind)) this._impact(s, '#e43b44', true);
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
    this._updatePuddles(dt);
    this._updateBlades(dt);
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
   * stepping out of the ring or rolling. o: { x, z, tx, tz, time, apex, y0, radius, damage, source, owner }
   * A deflect at landing bats it back at its `owner` (team 'player': it splashes creatures instead, no ring).
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
    L.ring = o.team === 'player' ? null : o.ring || this.scene.fx.ringTele({ x: o.tx, z: o.tz }, { radius: o.radius, color: '#ff4d8d', color2: '#b55088', time: o.time, fade: 0.05 });
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
      const dx = L.tx - L.x, dz = L.tz - L.z, dl = Math.hypot(dx, dz) || 1;
      if (L.team === 'player') {
        // A batted-back glob splashes the creatures where it lands (the Spitter that spat it, mostly).
        for (const e of sc.enemies) {
          if (e.dead || e.hidden || Math.hypot(e.x - L.tx, e.z - L.tz) > L.radius + e.radius) continue;
          e.hit(L.damage, dx / dl, dz / dl, 3, 'glob');
        }
      } else if (p && !p.dead) p.nearMiss?.((px, pz) => Math.hypot(px - L.tx, pz - L.tz) < L.radius + p.r * 0.5 + ROLL.nearPad);   // (critic I2 #8)
      if (L.team !== 'player' && p && !p.dead && Math.hypot(p.pos.x - L.tx, p.pos.z - L.tz) < L.radius + p.r * 0.5) {
        if (p.tryDeflect?.(L.owner || null, 'glob', L.x, L.z)) {
          const o = L.owner && !L.owner.dead ? L.owner : null;
          const bx = o ? o.x : L.x, bz = o ? o.z : L.z;
          this.lob({ x: p.pos.x, z: p.pos.z, tx: bx, tz: bz, time: 0.45, apex: 1.1, y0: 0.6, radius: L.radius, damage: DEFLECT.glob, team: 'player', source: 'deflect' });
        } else p.hurt(L.damage, dx / dl, dz / dl, L.source, 'glob');
      }
      const fx = sc.fx;
      fx.burst({ x: L.tx, y: 0, z: L.tz }, { color: '#ff4d8d', color2: '#b55088', count: 12, speed: 2.2, up: 2.2, life: 0.4, size: 2 / 32, y: 0.1 });
      fx.burst({ x: L.tx, y: 0, z: L.tz }, { color: '#ffffff', color2: '#ff9ec4', count: 4, speed: 1.4, up: 2.8, life: 0.25, size: 1 / 32, y: 0.15 });
      fx.decal({ x: L.tx, z: L.tz }, { color: '#68386c', radius: L.radius * 0.75, life: JUICE.tele.lob.puddle });
      // The puddle is sticky (STATUS.sap): it slows the player while the decal lasts.
      if (L.team !== 'player') this.puddles.push({ x: L.tx, z: L.tz, r: L.radius * 0.75, t: JUICE.tele.lob.puddle * 0.85 });
      this.scene.game.sfx.playAt('splat', L.tx, L.tz);
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

  _updatePuddles(dt) {
    for (let i = this.puddles.length - 1; i >= 0; i--) if ((this.puddles[i].t -= dt) <= 0) this.puddles.splice(i, 1);
  }

  // ---------------------------------------------------------------- the thrown machete

  /**
   * The player's thrown machete (F, critic I §9E): flies along `dir` up to spec.range at spec.speed, hitting every
   * creature / nest / pod it passes once for spec.damage and cutting ferns and thickets on its line; a bramble (it
   * nicks it), trunk, rock or ruin stops it. Then it flies back to the player over spec.returnTime (spec.returnDamage
   * to whatever it passes) and `onCatch()` runs. o: { x, z, dir: {x, z}, spec, onCatch }. Returns the blade.
   */
  throwBlade(o) {
    const tex = getBladeTexture().clone();
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, transparent: true, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(15 / 32, 15 / 32, 1);
    spr.renderOrder = 14;
    this.three.add(spr);
    if (!this._shadowMat) this._shadowMat = new THREE.MeshBasicMaterial({ map: lobShadowTexture(), transparent: false, alphaTest: 0.5, depthWrite: false });
    if (!this._shadowGeo) this._shadowGeo = new THREE.PlaneGeometry(7 / 32, 3 / 32);
    const shadow = new THREE.Mesh(this._shadowGeo, this._shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.userData.pxSnap = true;
    shadow.renderOrder = 1;
    this.three.add(shadow);
    const BT = JUICE.bladeTrail;
    this._trailMat ||= new THREE.MeshBasicMaterial({ color: BT.color, side: THREE.DoubleSide, depthWrite: false, transparent: true });
    const trail = new THREE.Mesh(this.scene.fx.quad, this._trailMat);
    trail.matrixAutoUpdate = false;
    trail.renderOrder = 13;
    this.three.add(trail);
    const b = { ...o, t: 0, phase: 'out', travelled: 0, spr, tex, shadow, trail, hitOut: new Set(), hitBack: new Set(), cuts: 0, backT: 0, mx: o.dir.x, mz: o.dir.z, trailLen: 0 };
    this.blades.push(b);
    this._placeBlade(b);
    return b;
  }

  /** Call the blade back early (F again). */
  recallBlade(b) { if (b && b.phase === 'out') this._turnBlade(b); }

  _turnBlade(b) {
    b.phase = 'back';
    b.backT = 0;
    if (b.cuts) this.scene.alertNear(b.x, b.z, 4.5 + Math.min(3, b.cuts), null, true);   // cutting is loud
  }

  _placeBlade(b) {
    const N = b.tex.userData.frames || 8;
    b.tex.offset.x = (Math.floor(b.t * 26) % N) / N;
    b.spr.position.set(b.x, 0.62, b.z);
    b.shadow.position.set(b.x, 0.02, b.z);
    // Motion streak behind it (the way it is moving now, so it bends round on the way back).
    const BT = JUICE.bladeTrail, len = Math.max(0.02, Math.min(BT.length, b.trailLen));
    const head = this._bh ||= new THREE.Vector3(), tail = this._bt ||= new THREE.Vector3();
    head.set(b.x, 0.62, b.z);
    tail.set(b.x - b.mx * len, 0.62, b.z - b.mz * len);
    this.scene.fx.orientStreak(b.trail, tail, head, BT.width);
  }

  /** Hit each creature / nest / pod within reach of the blade once per leg. Returns how many it hit. */
  _bladeHits(b, set, damage, dx, dz) {
    const sc = this.scene;
    let n = 0;
    // The thrown blade is still the machete (critic I2 #12): relic damage (Whetstone, Glass Machete, an armed
    // Hunter's Fang) and the kit's Serrated Edge bleed apply to it too.
    const dm = sc.relicsCtl?.meleeMult?.() ?? 1;
    const onHit = sc.player?.bleeds?.onHit;
    for (const t of sc.hittables()) {
      if (t.dead || t.forage) continue;   // (shelf fungus: the machete in hand only)
      const key = t.def ? t : `${t.x.toFixed(2)},${t.z.toFixed(2)}`;
      if (set.has(key)) continue;
      const r = b.spec.radius + (t.radius || 0.3);
      if ((t.x - b.x) ** 2 + (t.z - b.z) ** 2 >= r * r) continue;
      set.add(key);
      t.hit(damage * dm, dx, dz, b.spec.knockback, 'blade');
      onHit?.(t);
      sc.fx.flash({ x: t.x - dx * 0.2, y: 0.6, z: t.z - dz * 0.2 }, { color: '#ffffff', size: 0.4, life: 0.05 });
      sc.fx.hitStop(JUICE.melee.stop[0]);
      this.scene.game.sfx.playAt('blade_hit', b.x, b.z);
      n++;
    }
    if (n) sc.relicsCtl?.landed?.();
    return n;
  }

  _updateBlades(dt) {
    const sc = this.scene, w = sc.world, fx = sc.fx;
    for (let i = this.blades.length - 1; i >= 0; i--) {
      const b = this.blades[i];
      b.t += dt;
      if (b.phase === 'out') {
        const total = b.spec.speed * dt;
        const steps = Math.max(1, Math.ceil(total / 0.15));
        for (let s = 0; s < steps && b.phase === 'out'; s++) {
          const step = total / steps;
          b.x += b.dir.x * step; b.z += b.dir.z * step;
          b.travelled += step;
          b.trailLen += step;
          // Undergrowth along its line: ferns and thickets fall, a bramble catches it.
          const nx = -b.dir.z * 0.3, nz = b.dir.x * 0.3;
          for (const [px, pz] of [[b.x, b.z], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz]]) {
            const tx = Math.floor(px), tz = Math.floor(pz);
            const br = w.brushAt(tx, tz);
            if (!br) continue;
            if (br === BRUSH.bramble) {
              if (px !== b.x || pz !== b.z) continue;   // only a bramble dead ahead stops it
              w.hitBrush(tx, tz, 1);
              fx.burst({ x: tx + 0.5, y: 0.4, z: tz + 0.5 }, { color: '#c23a3a', color2: '#5c2f2e', count: 5, speed: 2, up: 1.5, life: 0.3, size: 1.5 / 32 });
              sc.game.sfx.playAt('blade_snag', b.x, b.z);
              this._turnBlade(b);
              break;
            }
            if (w.hitBrush(tx, tz, 1) > 0) { b.cuts++; sc._cutDebris?.(tx, tz, br, Math.atan2(b.dir.z, b.dir.x)); sc.game.sfx.play('cut'); }
          }
          if (b.phase !== 'out') break;
          this._bladeHits(b, b.hitOut, b.spec.damage, b.dir.x, b.dir.z);
          // Trunks, rocks, ruins and the map edge stop it with a clank.
          let stop = !w.inBounds(Math.floor(b.x), Math.floor(b.z));
          if (!stop) for (const c of w.collidersNear(b.x, b.z, 0.3)) if (inFootprint(c, b.x, b.z, 0.06)) { stop = true; break; }
          if (stop) {
            fx.spark({ x: b.x, y: 0.62, z: b.z }, { color: '#fee761', dir: b.dir });
            sc.game.sfx.playAt('blade_clank', b.x, b.z);
            this._turnBlade(b);
          } else if (b.travelled >= b.spec.range) this._turnBlade(b);
        }
      } else {
        // Back to the hand: always arrives within returnTime, wherever the player went.
        b.backT += dt;
        const p = sc.player.pos;
        const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
        const left = Math.max(0.05, b.spec.returnTime - b.backT);
        const step = Math.min(d, Math.max(d / left, b.spec.speed * 0.6) * dt);
        if (d > 1e-4) { b.x += (dx / d) * step; b.z += (dz / d) * step; b.mx = dx / d; b.mz = dz / d; b.trailLen = b.backT < dt * 1.5 ? step : b.trailLen + step; }
        if (d > 1e-4) this._bladeHits(b, b.hitBack, b.spec.returnDamage, dx / d, dz / d);
        if (d - step < 0.35 || sc.player.dead) {
          this._dropBlade(i);
          b.onCatch?.();
          continue;
        }
      }
      this._placeBlade(b);
    }
  }

  _dropBlade(i) {
    const b = this.blades[i];
    b.spr.removeFromParent();
    b.spr.material.dispose();
    b.tex.dispose();
    b.shadow.removeFromParent();
    b.trail.removeFromParent();
    this.blades.splice(i, 1);
  }

  clearEnemyShots() {
    for (const s of this.list) if (s.team === 'enemy') s.dead = true;
    for (const L of this.lobs || []) { L.ring?.cancel(); L.sprite.removeFromParent(); this.pool.glob.push(L.sprite); L.shadow.removeFromParent(); }
    if (this.lobs) this.lobs.length = 0;
  }

  dispose() {
    for (let i = this.blades.length - 1; i >= 0; i--) this._dropBlade(i);
    for (const s of this.list) { s.mesh.removeFromParent(); s.mesh.userData.head?.removeFromParent(); }
    for (const L of this.lobs || []) { L.sprite.removeFromParent(); L.shadow.removeFromParent(); }
    this.lobs = [];
    this._shadowMat?.dispose();
    this._shadowGeo?.dispose();
    this._trailMat?.dispose();
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
