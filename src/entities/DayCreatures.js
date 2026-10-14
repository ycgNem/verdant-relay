// Later-day creatures (critic J M5): days escalate with new problems, not only bigger numbers.
//   Bloater (night 4+)      walks at you, swells (a ring as wide as a spore cloud) and bursts into one; it bursts when
//                           it dies too — a heavy chop launches it away first, the thrown machete pops it from range.
//   Feral Chief (night 5+)  one per feral camp: a tougher Feral whose aura speeds up the Ferals round it.
// Gating per night: DAY_CREATURES (src/data/bosses.js), read by JungleScene._chunkPop. Stats: EXPLORE_ENEMIES
// (src/data/enemies.js). Both reuse existing art (a tinted Crawler + a spore pod; a palette-swapped Feral).
//
// makeEnemy(scene, key, x, z, opts) is the scene's spawn factory: these keys get their subclass, everything else a
// plain ExploreEnemy. Speed buffs (aura, war cry) go through setSpeedBuff / tickSpeedBuffs → enemy.speedMult.

import { ExploreEnemy } from './ExploreEnemy.js';
import { setAnim, updateVisual, flashVisual } from '../core/Assets.js';
import { nightTune } from '../data/config.js';
import { SPORES } from '../data/jungle.js';
import { DAY_CREATURES } from '../data/bosses.js';

/** Spawn factory (JungleScene.spawnEnemy). */
export function makeEnemy(scene, key, x, z, opts = {}) {
  if (key === 'bloater') return new Bloater(scene, key, x, z, opts);
  if (key === 'feral_chief') return new FeralChief(scene, key, x, z, opts);
  return new ExploreEnemy(scene, key, x, z, opts);
}

/** A timed speed buff on a creature (`kind` = its source); enemy.speedMult is the product of the live ones. */
export function setSpeedBuff(e, kind, mult, until) {
  e.speedBuffs ||= {};
  e.speedBuffs[kind] = { mult, until };
  e.speedMult = Object.values(e.speedBuffs).reduce((m, b) => m * b.mult, 1);
}

/** Drop expired speed buffs (call once a frame with the scene clock). */
export function tickSpeedBuffs(enemies, now) {
  for (const e of enemies) {
    if (!e.speedBuffs) continue;
    let changed = false;
    for (const [k, b] of Object.entries(e.speedBuffs)) if (b.until <= now) { delete e.speedBuffs[k]; changed = true; }
    if (changed) e.speedMult = Object.values(e.speedBuffs).reduce((m, b) => m * b.mult, 1);
  }
}

// ==================================================================== Bloater

export class Bloater extends ExploreEnemy {
  constructor(scene, key, x, z, opts = {}) {
    super(scene, key, x, z, opts);
    const d = this.def;
    // The spore sac on its back: a spore pod drawn ×podScale (a whole number), a hair in front of the body. Its own
    // root in the scene (it bursts with the Bloater; the body's corpse fades without it).
    if (d.pod && this.game.assets.hasSprite(d.pod)) {
      this.pod = this.game.assets.makeVisual(d.pod, { scale: d.podScale || 1, shadow: false, emissive: false });
      setAnim(this.pod, 'idle');
      scene.three.add(this.pod);
      this._placePod();
    }
    this.burstDamage = Math.round(d.damage * nightTune('enemyDamage', this.night));
  }

  _placePod() {
    if (!this.pod) return;
    const v = this.vis?.position;
    this.pod.position.set(v ? v.x : this.x, (v ? v.y : 0) + (this.def.podY || 0.5), (v ? v.z : this.z) + 0.04);
    this.pod.visible = !!this.vis?.visible;
  }

  _dropPod() {
    if (!this.pod) return;
    this.game.assets.disposeVisual(this.pod);
    this.pod = null;
  }

  hit(dmg, dx, dz, kb = 0, src = '', stagger = 0) {
    if (this.flying || this.popped) return;
    this.lastSrc = src;
    super.hit(dmg, dx, dz, kb, src, stagger);
  }

  /** Killed: it bursts. A heavy chop sends it flying `launch` tiles along the swing first (short of trunks / ruins). */
  die() {
    if (this.dead || this.flying) return;
    const d = this.def;
    if (this.lastSrc === 'chop' && !this.popped) {
      const w = this.scene.world;
      const kd = this.lastHit || { x: 1, z: 0 }, l = Math.hypot(kd.x, kd.z) || 1, ux = kd.x / l, uz = kd.z / l;
      let dist = d.launch;
      for (let s = 0.25; s <= d.launch; s += 0.25) if (w.blockedAt(Math.floor(this.x + ux * s), Math.floor(this.z + uz * s), true)) { dist = Math.max(0.5, s - 0.4); break; }
      this.tele?.cancel();
      this.tele = null;
      this._dropToken();
      this.flying = { x0: this.x, z0: this.z, x1: this.x + ux * dist, z1: this.z + uz * dist, t: 0 };
      this.scene.fx.telegraph({ x: this.flying.x1, z: this.flying.z1 }, { radius: SPORES.radius, color: SPORES.color, time: d.launchTime });
      for (const s of [this.barBg, this.barFill]) s.visible = false;
      return;
    }
    this._pop();
    super.die();
  }

  /** The burst: damage in the ring, a spore cloud (it chokes creatures too). */
  _pop() {
    if (this.popped) return;
    this.popped = true;
    this.tele?.cancel();
    this.tele = null;
    this._dropPod();
    const sc = this.scene, p = sc.player, fx = sc.fx;
    const dx = p.pos.x - this.x, dz = p.pos.z - this.z, d = Math.hypot(dx, dz) || 1e-4;
    if (!p.dead && d < SPORES.radius + p.r * 0.5) p.hurt(this.burstDamage, dx / d, dz / d, this.def.name);
    sc.spores?.cloudAt?.(this.x, this.z);
    fx.burst({ x: this.x, y: 0.4, z: this.z }, { color: SPORES.color, color2: '#ffffff', count: 22, speed: 3.2, up: 2.6, life: 0.6, size: 2 / 32, gravity: 2 });
    fx.ring({ x: this.x, z: this.z }, { color: SPORES.color, radius: SPORES.radius, life: 0.35 });
    if (d < 10) this.game.shake(4, 0.2);
    this.game.sfx.playAt('spore_burst', this.x, this.z);
  }

  update(dt) {
    if (this.dead) return;
    const sc = this.scene, d = this.def;
    if (this.flying) {
      // Launched by a chop: an arc to the landing spot, then it bursts there.
      const F = this.flying;
      F.t += dt;
      const k = Math.min(1, F.t / d.launchTime);
      this.x = F.x0 + (F.x1 - F.x0) * k; this.z = F.z0 + (F.z1 - F.z0) * k;
      this.vis.position.set(this.x, Math.sin(k * Math.PI) * 1.2, this.z);
      updateVisual(this.vis, dt);
      this._placePod();
      if (this.pod) updateVisual(this.pod, dt);
      if (k >= 1) { this.flying = null; this.vis.position.y = 0; this._pop(); super.die(); }
      return;
    }
    const p = sc.player;
    this.stateT -= dt; this.barT -= dt; this.chokeT -= dt; this.knockT -= dt; this.splatCd -= dt; this.cd -= dt;
    const dx = p.pos.x - this.x, dz = p.pos.z - this.z, dist = Math.hypot(dx, dz);
    const toP = dist > 1e-4 ? { x: dx / dist, z: dz / dist } : { x: 1, z: 0 };
    this.senseT -= dt;
    if (this.senseT <= 0) { this.senseT = 0.15; this.los = dist < 22 && sc.world.lineOfSight(this.x, this.z, p.pos.x, p.pos.z); }
    const playerTarget = !p.dead && !sc.ending;
    let move = null, speed = d.speed * (this.chokeT > 0 ? SPORES.creature.slow : 1) * (this.speedMult || 1);
    switch (this.state) {
      case 'spawn':
        if (this.stateT <= 0) { this.state = 'chase'; this.alerted = true; }
        this._syncVisual(dt);
        return;
      case 'idle': {
        const det = d.detect * (sc.detectMult ?? 1);
        if (playerTarget && this.los && dist <= det) this.alert(true);
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 2.5 + Math.random() * 2.5;
          this.wanderTo = Math.random() < 0.6 ? { x: this.home.x + (Math.random() - 0.5) * 3, z: this.home.z + (Math.random() - 0.5) * 3 } : null;
        }
        if (this.wanderTo) {
          const wx = this.wanderTo.x - this.x, wz = this.wanderTo.z - this.z, wl = Math.hypot(wx, wz);
          if (wl > 0.2) { move = { x: wx / wl, z: wz / wl }; speed *= 0.35; } else this.wanderTo = null;
        }
        if (this.alerted) this.state = 'chase';
        break;
      }
      case 'chase': {
        if (!playerTarget) { this.state = 'idle'; this.alerted = false; this.home = { x: this.x, z: this.z }; break; }
        this.face = toP;
        // It doesn't need an attack token: walking bombs don't queue.
        if (dist <= d.reach && this.cd <= 0 && this.chokeT <= 0) { this._swell(); break; }
        move = this._pathTo(p.pos.x, p.pos.z);
        break;
      }
      case 'windup': {
        // Swelling: the sac flashes faster and faster, then it bursts (dies).
        if (this.pod && Math.floor(this.stateT * (this.stateT < 0.35 ? 16 : 8)) % 2 === 0) flashVisual(this.pod, '#ffffff', 0.04);
        if (this.stateT <= 0) { this.hp = 0; this.lastSrc = 'burst'; this.die(); return; }
        break;
      }
      case 'stunned': if (this.stateT <= 0) this.state = 'chase'; break;
      default: this.state = 'chase';
    }
    if (this.stunT > 0) { this.stunT -= dt; move = null; }
    const tx = move ? move.x * speed : 0, tz = move ? move.z * speed : 0;
    const k = 1 - Math.exp(-10 * dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    const kd = Math.exp(-9 * dt);
    this.kb.x *= kd; this.kb.z *= kd;
    const mx = (this.vel.x + this.kb.x) * dt, mz = (this.vel.z + this.kb.z) * dt;
    if (Math.abs(mx) + Math.abs(mz) > 1e-5) {
      this._hit.obj = undefined;
      const blocked = sc.world.moveBody(this, mx, mz, this.radius, this.moveOptsHit);
      if (this.knockT > 0 && this.splatCd <= 0) this._checkSplat(blocked);
    }
    if (this.dead) return;
    this.moving = Math.hypot(this.vel.x, this.vel.z) > 0.4;
    if (this.state !== 'windup') this._separate(dt);
    this._syncVisual(dt);
    this._placePod();
    if (this.pod) updateVisual(this.pod, dt);
  }

  _swell() {
    const d = this.def, sc = this.scene;
    this.state = 'windup';
    this.mv = 'swell';
    this.stateT = this.windT = d.windup;
    this.vel.x *= 0.2; this.vel.z *= 0.2;
    setAnim(this.vis, 'windup', true);
    if (this.pod) setAnim(this.pod, 'swell', true);
    this.tele = sc.fx.ringTele({ x: this.x, z: this.z }, { radius: SPORES.radius, color: SPORES.color, color2: SPORES.color2, time: d.windup, fade: 0.05 });
    this.game.sfx.playAt('spore_swell', this.x, this.z);
  }

  dispose() {
    this._dropPod();
    super.dispose();
  }
}

// ==================================================================== Feral Chief

export class FeralChief extends ExploreEnemy {
  constructor(scene, key, x, z, opts = {}) {
    super(scene, key, x, z, opts);
    this.auraT = 0;
  }

  update(dt) {
    super.update(dt);
    if (this.dead) return;
    // Aura: Ferals within DAY_CREATURES.chief.aura move faster while it lives (refreshed a few times a second).
    this.auraT -= dt;
    if (this.auraT > 0) return;
    this.auraT = 0.3;
    const C = DAY_CREATURES.chief, sc = this.scene, now = sc.dayT ?? 0;
    for (const e of sc.enemies) {
      if (e === this || e.dead || (e.key !== 'feral' && e.key !== 'feral_chief')) continue;
      if (Math.hypot(e.x - this.x, e.z - this.z) > C.aura) continue;
      setSpeedBuff(e, 'chief', C.speed, now + 0.6);
      if (e.vis && Math.random() < 0.35) sc.fx.burst({ x: e.x, y: 0.2, z: e.z }, { color: '#f0c040', count: 1, speed: 0.4, up: 1.2, life: 0.4, size: 1.5 / 32, gravity: 2 });
    }
  }
}
