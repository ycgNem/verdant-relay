// Exploration enemies: Crawler, Skitter, Rival Scavenger, Spitter, Razorback.
//
// State machine:  spawn → idle ⇄ chase → windup → attack → recover → chase …   (+ stunned)
//   idle     stands / wanders near home until the player is within `detect` with line of sight
//            (or it is hit, or a neighbour raises the alarm).
//   chase    paths toward the player (straight line when the way is clear, otherwise down the
//            scene's flow field, so walls and room doors are handled). Scavengers keep their distance
//            and strafe; Spitters are rooted.
//   windup   EVERY attack is telegraphed: lunges show a ground circle where they will land, ranged
//            shots show an aim line (which tracks briefly, then locks), charges show the full lane.
//   attack   lunge / shot / charge along the locked telegraph. A charge that hits a wall stuns.
//
// Fairness rules: telegraphs always match the real hit area; spawns emerge over spawnInTime with a
// ground warning and can't attack while emerging; nothing spawns near the player (see the scene).

import * as THREE from 'three';
import { CONFIG, JUICE } from '../data/config.js';
import { EXPLORE_ENEMIES } from '../data/enemies.js';
import { setAnim, setFacing, updateVisual, flashVisual, setBaseColor } from '../core/Assets.js';
import { shade } from '../core/Fx.js';
import { rayLength, castRay } from '../world/collide.js';
import { nightTune } from '../data/config.js';

let barTex = null;
function barMaterial(color) {
  if (!barTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 2, 2);
    barTex = new THREE.CanvasTexture(c);
  }
  return new THREE.SpriteMaterial({ map: barTex, color, depthTest: false, depthWrite: false, transparent: true });
}

export class ExploreEnemy {
  constructor(scene, key, x, z, opts = {}) {
    const X = CONFIG.expedition;
    this.scene = scene;
    this.game = scene.game;
    this.key = key;
    this.def = EXPLORE_ENEMIES[key];
    this.elite = !!opts.elite;
    this.objective = !!opts.objective;
    this.guard = !!opts.guard;
    this.id = opts.id || null;
    this.site = opts.site ?? -1;
    // Undergrowth handling: Crawlers/Skitters slip through it, Razorbacks bulldoze it, the rest path around.
    this.moveOpts = this.def.brush === 'through' ? { throughBrush: true }
      : this.def.brush === 'crash' ? { onBrush: (tx, tz) => scene.crashBrush?.(tx, tz, this) } : {};
    const night = this.game.run.night;
    const scale = this.elite ? X.elite.scale : 1;
    this.scale = scale;
    this.maxHp = Math.round(this.def.hp * nightTune('enemyHp', night) * (this.elite ? nightTune('eliteHp', night) : 1));
    this.hp = this.maxHp;
    this.damage = Math.round(this.def.damage * nightTune('enemyDamage', night) * (this.elite ? X.elite.damageMult : 1));
    // Elites telegraph longer, so their big attacks are always readable.
    this.windup = this.def.windup * (this.elite ? X.elite.windupMult : 1);
    this.radius = Math.max(0.22, this.def.size * 0.45 * scale);
    this.x = x; this.z = z;
    this.home = { x, z };
    this.kb = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.face = { x: 1, z: 0 };
    this.cd = 0.6 + Math.random() * 0.6;
    this.alerted = !!opts.alerted;
    this.dead = false;
    this.assist = true;
    this.state = opts.spawnIn ? 'spawn' : 'idle';
    this.stateT = opts.spawnIn ? X.spawnInTime : 0;
    this.wanderT = Math.random() * 2;
    this.wanderTo = null;
    this.senseT = Math.random() * 0.2;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 1 + Math.random() * 1.5;
    this.tele = null;
    this.hitDone = false;
    this.barT = 0;
    this.seenT = 0;
    this.walkT = Math.random() * 10;

    // Sprites stay 1:1 (whole-number scales only, no mixels): an elite reads through its tint and an
    // amber ground ring instead of being drawn bigger. `scale` still sizes its hitbox.
    this.vis = this.game.assets.makeVisual(key, { scale: this.game.assets.hasSprite(key) ? 1 : scale, ring: this.elite ? (X.elite.ringColor || JUICE.hostileRing.color) : JUICE.hostileRing.color });
    if (this.elite) setBaseColor(this.vis, X.elite.tint);
    scene.three.add(this.vis);
    // HP bar (two sprites: back + left-anchored fill), drawn on top.
    this.barW = 0.8 * Math.max(1, scale);
    this.barBg = new THREE.Sprite(barMaterial('#181425'));
    this.barFill = new THREE.Sprite(barMaterial(this.elite ? '#feae34' : '#e43b44'));
    this.barBg.center.set(0.5, 0.5);
    this.barFill.center.set(0, 0.5);
    // Whole-pixel bar sizes (32 px per tile): a 4 px back with a 2 px fill and a 1 px border.
    this.barW = Math.round(this.barW * 32) / 32;
    this.barBg.scale.set(this.barW + 2 / 32, 4 / 32, 1);
    this.barFill.scale.set(this.barW, 2 / 32, 1);
    this.barBg.renderOrder = 20; this.barFill.renderOrder = 21;
    scene.three.add(this.barBg, this.barFill);
    if (this.state === 'spawn') {
      scene.fx.telegraph({ x, z }, { radius: this.radius + 0.35, color: '#feae34', time: this.stateT, fade: 0.1 });
      this.vis.position.set(x, -1.2, z);
    }
    this._syncVisual(0);
  }

  get bloodColor() { return this.def.burst?.[0] || '#e43b44'; }

  // ---------------------------------------------------------------- damage

  hit(dmg, dx, dz, kb = 0, src = '', stagger = 0) {
    if (this.dead || this.state === 'spawn') return;
    // A heavy blow interrupts a wind-up (elites shrug most of it off).
    const st = stagger * (this.elite ? 0.35 : 1);
    if (st > 0.15 && (this.state === 'windup' || this.state === 'chase' || this.state === 'recover')) {
      this.tele?.cancel();
      this.tele = null;
      this.state = 'stunned';
      this.stateT = st;
      setAnim(this.vis, 'hurt', true);
    }
    dmg = Math.round(dmg);
    this.hp -= dmg;
    this.barT = 2.5;
    this.lastHit = { x: dx, z: dz };
    flashVisual(this.vis, '#ffffff', 0.09);
    const fx = this.scene.fx;
    const H = JUICE.hitStop;
    const big = this.elite || this.objective;
    fx.text({ x: this.x, z: this.z }, String(dmg), {
      color: big ? '#feae34' : src === 'chop' ? '#fee761' : '#ead4aa', cls: big ? 'elite' : '',
      y: this.vis.userData.vis.height + 0.55, life: 0.6, key: this, value: dmg,
    });
    fx.burst({ x: this.x, z: this.z }, { color: this.bloodColor, count: 4, speed: 1.8, up: 1.5, life: 0.3, size: 0.06, vx: dx * 1.5, vz: dz * 1.5 });
    // Impact spark on the side the hit came from.
    fx.flash({ x: this.x - dx * this.radius * 0.6, y: this.vis.userData.vis.height * 0.45, z: this.z - dz * this.radius * 0.6 }, { color: '#ffffff', size: big ? 0.42 : 0.3, life: 0.05 });
    if (src === 'slash' || src === 'chop') fx.hitStop(src === 'chop' ? H.cutterHit * 1.8 : H.cutterHit);
    else if (dmg >= H.heavyDamage || big) fx.hitStop(H.heavyHit);
    this.game.sfx.play('hit');
    // Knockback (heavier enemies resist; lunges and charges carry through).
    if (this.state !== 'attack') {
      const resist = this.def.size * this.scale;
      this.kb.x += dx * kb / resist;
      this.kb.z += dz * kb / resist;
    }
    if (!this.alerted) this.alert(true);
    if (this.hp <= 0) this.die();
  }

  alert(spread = false) {
    if (this.alerted || this.dead) return;
    this.alerted = true;
    if (this.state === 'idle') this.state = 'chase';
    this.scene.fx.text({ x: this.x, z: this.z }, '!', { color: '#feae34', cls: 'big', y: this.vis.userData.vis.height + 0.35, life: 0.6 });
    if (spread) this.scene.alertNear(this.x, this.z, 6, this);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.tele?.cancel();
    const fx = this.scene.fx;
    const [c1, c2] = this.def.burst || ['#e43b44', '#733e39'];
    const h = this.vis.userData.vis.height;
    const kd = this.lastHit || { x: 0, z: 0 };
    fx.burst({ x: this.x, z: this.z }, { color: c1, color2: c2, count: 16 + Math.round(this.scale * 8), speed: 3, up: 3, life: 0.6, size: 0.09, y: h * 0.4, vx: kd.x * 1.5, vz: kd.z * 1.5 });
    fx.burst({ x: this.x, z: this.z }, { color: '#ffffff', color2: c1, count: 6, speed: 4.5, up: 2, life: 0.18, size: 2 / 32, y: h * 0.5 });
    fx.flash({ x: this.x, y: h * 0.5, z: this.z }, { color: c1, size: 0.55 + this.radius, life: 0.07 });
    fx.ring({ x: this.x, z: this.z }, { color: c1, radius: 1 + this.radius, life: 0.35 });
    fx.decal({ x: this.x + kd.x * 0.15, z: this.z + kd.z * 0.15 }, { color: shade(c2 || c1, JUICE.death.decalShade), radius: (0.3 + this.radius) * JUICE.death.decalSize });
    // The sprite stays for a beat: flash, squash and pop, slide along the killing hit, fade.
    for (const s of [this.barBg, this.barFill]) s.visible = false;
    fx.corpse(this.vis, { dx: kd.x, dz: kd.z });
    this.vis = null;
    this.game.sfx.play(this.def.size >= 1 ? 'boom' : 'hit');
    if (this.elite || this.objective) {
      this.game.shake(7, 0.35);
      this.game.flash('#ffffff', 0.18);
      fx.hitStop(JUICE.hitStop.eliteKill);
      fx.ring({ x: this.x, z: this.z }, { color: '#feae34', radius: 2.6, life: 0.5 });
      fx.light({ x: this.x, z: this.z }, { color: '#feae34', intensity: 3, distance: 5, life: 0.25 });
    } else {
      fx.hitStop(JUICE.hitStop.kill);
    }
    this.scene.onEnemyKilled(this);
  }

  // ---------------------------------------------------------------- AI

  update(dt) {
    if (this.dead) return;
    const sc = this.scene;
    const p = sc.player;
    const d = this.def;
    this.cd -= dt;
    this.stateT -= dt;
    this.barT -= dt;
    const dx = p.pos.x - this.x, dz = p.pos.z - this.z;
    const dist = Math.hypot(dx, dz);
    const toP = dist > 1e-4 ? { x: dx / dist, z: dz / dist } : { x: 1, z: 0 };
    let move = null, speed = d.speed;

    // Line of sight is checked a few times a second, not every frame.
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.15;
      this.los = dist < 22 && sc.world.lineOfSight(this.x, this.z, p.pos.x, p.pos.z);
    }
    const playerTarget = !p.dead && !sc.ending;

    switch (this.state) {
      case 'spawn': {
        if (this.stateT <= 0) {
          this.state = 'chase';
          this.alerted = true;
          sc.fx.burst({ x: this.x, z: this.z }, { color: '#733e39', color2: '#8b9bb4', count: 10, speed: 2, up: 2.5, life: 0.4, size: 0.08 });
        }
        this._syncVisual(dt);
        return;
      }
      case 'idle': {
        if (playerTarget && ((this.los && dist <= d.detect) || (this.guard && dist <= d.detect + 2))) this.alert(true);
        if (d.speed > 0) {
          this.wanderT -= dt;
          if (this.wanderT <= 0) {
            this.wanderT = 2 + Math.random() * 2.5;
            this.wanderTo = Math.random() < 0.6 ? { x: this.home.x + (Math.random() - 0.5) * 3, z: this.home.z + (Math.random() - 0.5) * 3 } : null;
          }
          if (this.wanderTo) {
            const wx = this.wanderTo.x - this.x, wz = this.wanderTo.z - this.z;
            const wl = Math.hypot(wx, wz);
            if (wl > 0.2) { move = { x: wx / wl, z: wz / wl }; speed = d.speed * 0.35; } else this.wanderTo = null;
          }
        }
        if (this.alerted) this.state = 'chase';
        break;
      }
      case 'chase': {
        if (!playerTarget) { this.state = 'idle'; this.alerted = false; this.home = { x: this.x, z: this.z }; break; }
        this.face = toP;
        if (d.attack === 'melee') {
          if (this.los && dist <= d.reach && this.cd <= 0) { this._startWindup(toP, dist); break; }
          move = this._pathTo(p.pos.x, p.pos.z);
        } else if (d.attack === 'ranged') {
          if (this.los && dist <= d.range && this.cd <= 0) { this._startWindup(toP, dist); break; }
          if (d.speed > 0) {
            this.strafeT -= dt;
            if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 1.5; this.strafeSign *= -1; }
            if (dist < (d.keepAway || 0)) move = { x: -toP.x, z: -toP.z };
            else if (!this.los || dist > d.range * 0.85) move = this._pathTo(p.pos.x, p.pos.z);
            else { move = { x: -toP.z * this.strafeSign, z: toP.x * this.strafeSign }; speed = d.speed * 0.6; }
          }
        } else if (d.attack === 'charge') {
          if (this.los && dist <= d.chargeRange && this.cd <= 0) { this._startWindup(toP, dist); break; }
          move = this._pathTo(p.pos.x, p.pos.z);
        }
        break;
      }
      case 'windup': {
        // Ranged aim and charge direction track the player for the first part of the wind-up, then lock.
        const lockAt = d.attack === 'ranged' ? 0.55 : 0.7;
        if (d.attack !== 'melee' && this.stateT > this.windup * lockAt && playerTarget) {
          this.face = toP;
          this.aimDir = { ...toP };
          if (this.tele) this.tele.group.rotation.y = Math.atan2(-toP.x, -toP.z);
          this._resizeLane();
        }
        if (this.stateT <= 0) this._startAttack();
        break;
      }
      case 'attack': {
        if (d.attack === 'melee') {
          const v = d.lunge / d.lungeTime;
          const hitWall = sc.world.moveBody(this, this.aimDir.x * v * dt, this.aimDir.z * v * dt, this.radius, this.moveOpts);
          this._contact(dist);
          if (this.stateT <= 0 || hitWall) this._recover(d.cooldown);
        } else if (d.attack === 'charge') {
          const hitWall = sc.world.moveBody(this, this.aimDir.x * d.chargeSpeed * dt, this.aimDir.z * d.chargeSpeed * dt, this.radius, this.moveOpts) && sc.world.blockedCircle(this.x + this.aimDir.x * 0.15, this.z + this.aimDir.z * 0.15, this.radius, true);
          if (Math.random() < 0.7) sc.fx.burst({ x: this.x, y: -0.35, z: this.z }, { color: '#8b9bb4', count: 1, speed: 1, up: 1, life: 0.3, size: 0.09 });
          this._contact(dist);
          if (hitWall) {
            this.state = 'stunned';
            this.stateT = d.stun || 0.8;
            this.cd = d.cooldown;
            sc.fx.burst({ x: this.x + this.aimDir.x * this.radius, z: this.z + this.aimDir.z * this.radius }, { color: '#c0cbdc', color2: '#733e39', count: 14, speed: 3, up: 3, life: 0.5, size: 0.09 });
            this.game.sfx.play('boom');
            if (dist < 8) this.game.shake(4, 0.2);
            sc.fx.text({ x: this.x, z: this.z }, 'STUNNED', { color: '#fee761', y: this.vis.userData.vis.height + 0.3, life: 0.8 });
          } else if (this.stateT <= 0) this._recover(d.cooldown);
        } else {
          this._recover(d.cooldown);
        }
        break;
      }
      case 'stunned': {
        if (Math.random() < 0.15) sc.fx.burst({ x: this.x, y: this.vis.userData.vis.height - 0.2, z: this.z }, { color: '#fee761', count: 1, speed: 0.8, up: 1, life: 0.4, size: 0.06, gravity: 2 });
        if (this.stateT <= 0) this.state = 'chase';
        break;
      }
      case 'recover': {
        if (d.speed > 0 && playerTarget) { move = this._pathTo(p.pos.x, p.pos.z); speed = d.speed * 0.4; }
        if (this.stateT <= 0) this.state = 'chase';
        break;
      }
    }

    // Movement + knockback.
    if (this.state !== 'attack') {
      const tx = move ? move.x * speed : 0, tz = move ? move.z * speed : 0;
      const k = 1 - Math.exp(-12 * dt);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      const kd = Math.exp(-9 * dt);
      this.kb.x *= kd; this.kb.z *= kd;
      const mx = (this.vel.x + this.kb.x) * dt, mz = (this.vel.z + this.kb.z) * dt;
      if (Math.abs(mx) + Math.abs(mz) > 1e-5) sc.world.moveBody(this, mx * sc.world.speedAt(this.x, this.z), mz * sc.world.speedAt(this.x, this.z), this.radius, this.moveOpts);
      // Rustling: something moving through the undergrowth gives itself away.
      if (this.moveOpts.throughBrush && Math.hypot(this.vel.x, this.vel.z) > 0.6 && sc.world.brushAt(Math.floor(this.x), Math.floor(this.z)) >= 1 && Math.random() < dt * 5) {
        sc.fx.burst({ x: this.x, y: 0.5, z: this.z }, { color: '#2a5628', color2: '#4b8139', count: 2, speed: 1, up: 1.6, life: 0.4, size: 1.5 / 32, gravity: 5 });
        if (Math.hypot(this.x - sc.player.pos.x, this.z - sc.player.pos.z) < 9 && Math.random() < 0.35) this.game.sfx.play('rustle');
      }
      if (move && this.state !== 'windup') this.face = Math.hypot(this.vel.x, this.vel.z) > 0.3 && this.state === 'idle' ? { x: this.vel.x, z: this.vel.z } : this.face;
    }
    this.moving = Math.hypot(this.vel.x, this.vel.z) > 0.4 && this.state !== 'attack';
    this._syncVisual(dt);
  }

  /** Direction toward (tx, tz): straight if the walk is clear, otherwise down the flow field. */
  _pathTo(tx, tz) {
    const sc = this.scene;
    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return null;
    // Straight line works when no solid tile is in the way (checked with the body's width).
    const off = this.radius * 0.9;
    const nx = -dz / dist * off, nz = dx / dist * off;
    const through = !!this.moveOpts.throughBrush || !!this.moveOpts.onBrush;
    const solid = (x, y) => sc.world.blockedAt(x, y, through);
    if (dist < 12 && castRay(this.x + nx, this.z + nz, tx + nx, tz + nz, solid) >= dist - 0.01
      && castRay(this.x - nx, this.z - nz, tx - nx, tz - nz, solid) >= dist - 0.01) {
      return { x: dx / dist, z: dz / dist };
    }
    return sc.flowDir(this.x, this.z, through) || { x: dx / dist, z: dz / dist };
  }

  _startWindup(toP, dist) {
    const d = this.def;
    const sc = this.scene;
    this.state = 'windup';
    this.stateT = this.windup;
    this.aimDir = { ...toP };
    this.face = toP;
    this.hitDone = false;
    this.vel.x *= 0.2; this.vel.z *= 0.2;
    setAnim(this.vis, 'windup', true);
    if (d.attack === 'melee') {
      // The lunge lands exactly where the circle is drawn.
      const travel = Math.min(d.lunge, Math.max(0.4, dist));
      const solidLen = rayLength(sc.world, this.x, this.z, toP.x, toP.z, travel, (x, y) => sc.world.solidAt(x, y));
      const reach = Math.max(0.3, Math.min(travel, solidLen - this.radius));
      this.lungeTarget = { x: this.x + toP.x * reach, z: this.z + toP.z * reach };
      this.tele = sc.fx.telegraph(this.lungeTarget, { radius: this.radius + 0.55, color: '#e43b44', time: this.windup, fade: 0.12 });
    } else if (d.attack === 'ranged') {
      const len = rayLength(sc.world, this.x, this.z, toP.x, toP.z, d.range);
      this.tele = sc.fx.telegraph({ x: this.x, z: this.z }, { dir: toP, length: Math.max(0.5, len), width: 0.22, color: d.shot === 'glob' ? '#ff4d8d' : '#ff7a3c', time: this.windup, fade: 0.08 });
      this.teleLen = this.curLen = len;
    } else if (d.attack === 'charge') {
      const len = this._laneLength(toP);
      this.tele = sc.fx.telegraph({ x: this.x, z: this.z }, { dir: toP, length: len, width: this.radius * 2 + 0.3, color: '#e43b44', time: this.windup, fade: 0.1 });
      this.teleLen = this.curLen = len;
    }
    this.game.sfx.play(d.attack === 'charge' ? 'alarm' : 'zap');
  }

  _laneLength(dir) {
    const d = this.def;
    const sc = this.scene;
    return Math.max(0.6, rayLength(sc.world, this.x, this.z, dir.x, dir.z, d.chargeSpeed * d.chargeTime, (x, y) => sc.world.solidAt(x, y)));
  }

  /** While a tracking telegraph rotates, keep its length matching the wall it now points at. */
  _resizeLane() {
    if (!this.tele) return;
    const d = this.def;
    const sc = this.scene;
    const len = d.attack === 'charge' ? this._laneLength(this.aimDir) : rayLength(sc.world, this.x, this.z, this.aimDir.x, this.aimDir.z, d.range);
    // The lane lies along the group's local -Z, so scaling Z stretches it to the new wall distance.
    this.tele.group.scale.z = Math.max(0.1, len) / Math.max(0.1, this.teleLen);
    this.curLen = len;
  }

  _startAttack() {
    const d = this.def;
    const sc = this.scene;
    this.state = 'attack';
    this.tele = null;
    setAnim(this.vis, 'attack', true);
    if (d.attack === 'melee') {
      const lx = this.lungeTarget.x - this.x, lz = this.lungeTarget.z - this.z;
      const ll = Math.hypot(lx, lz) || 1;
      this.aimDir = { x: lx / ll, z: lz / ll };
      this.stateT = (ll / d.lunge) * d.lungeTime + 0.02;
      this.game.sfx.play('cutter');
    } else if (d.attack === 'ranged') {
      const ox = this.x + this.aimDir.x * (this.radius + 0.1), oz = this.z + this.aimDir.z * (this.radius + 0.1);
      sc.shots.fire({ team: 'enemy', kind: d.shot || 'bolt', x: ox, z: oz, dx: this.aimDir.x, dz: this.aimDir.z, speed: d.shotSpeed, range: d.range + 0.5, damage: this.damage, source: d.name });
      sc.fx.burst({ x: ox, y: 0.1, z: oz }, { color: d.shot === 'glob' ? '#ff4d8d' : '#feae34', count: 4, speed: 1.5, up: 1, life: 0.2, size: 0.07 });
      this.game.sfx.play('shoot');
      this.stateT = 0;
    } else if (d.attack === 'charge') {
      this.stateT = ((this.curLen ?? this.teleLen) / d.chargeSpeed) + 0.05;
      this.game.sfx.play('boom');
    }
  }

  _contact(dist) {
    if (this.hitDone) return;
    const p = this.scene.player;
    if (dist < this.radius + p.r + 0.2) {
      if (p.hurt(this.damage, this.aimDir.x, this.aimDir.z, this.def.name)) this.hitDone = true;
      else if (p.dodging) this.hitDone = true;
    }
  }

  _recover(cd) {
    this.state = 'recover';
    this.stateT = 0.35;
    this.cd = cd * (0.85 + Math.random() * 0.3);
  }

  // ---------------------------------------------------------------- visuals

  _syncVisual(dt) {
    const v = this.vis;
    let y = 0, ox = 0, oz = 0;
    if (this.state === 'spawn') {
      const k = 1 - Math.max(0, this.stateT) / CONFIG.expedition.spawnInTime;
      y = -1.2 * (1 - k);
      if (Math.random() < 0.5) this.scene.fx.burst({ x: this.x, y: -0.35, z: this.z }, { color: '#733e39', count: 1, speed: 1.5, up: 2, life: 0.3, size: 0.07 });
    } else if (this.state === 'windup') {
      ox = (Math.random() - 0.5) * 0.06; oz = (Math.random() - 0.5) * 0.06;
    }
    const vis = v.userData.vis;
    if (vis.kind === 'model' && this.moving) {
      this.walkT += dt * 14;
      y += Math.abs(Math.sin(this.walkT)) * 0.05;
    }
    v.position.set(this.x + ox, y, this.z + oz);
    setFacing(v, this.face.x, this.face.z);
    if (this.state === 'windup') setAnim(v, 'windup');
    else if (this.state === 'attack') setAnim(v, 'attack');
    else if (this.moving) setAnim(v, 'walk');
    else setAnim(v, 'idle');
    if (this.state === 'windup' && vis.kind === 'model') flashVisual(v, '#ff6060', 0.03);
    updateVisual(v, dt);
    // HP bar: always for elites / objective targets, otherwise briefly after a hit.
    const show = !this.dead && this.state !== 'spawn' && (this.elite || this.objective || this.barT > 0) && this.hp < this.maxHp + (this.elite ? 1 : 0);
    this.barBg.visible = this.barFill.visible = show;
    if (show) {
      const hy = vis.height + 0.2;
      this.barBg.position.set(this.x, hy, this.z);
      const f = Math.max(0, this.hp / this.maxHp);
      this.barFill.scale.x = Math.max(0.001, this.barW * f);
      this.barFill.position.set(this.barBg.position.x - this.barW / 2, this.barBg.position.y, this.barBg.position.z);
    }
  }

  dispose() {
    this.tele?.cancel();
    if (this.vis) this.game.assets.disposeVisual(this.vis);
    for (const s of [this.barBg, this.barFill]) { s.removeFromParent(); s.material.dispose(); }
  }
}
