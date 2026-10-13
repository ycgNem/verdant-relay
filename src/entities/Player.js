// The scavenger (jungle exploration): a machete fighter.
//
//   WASD move · mouse aim · LMB slash (3-hit combo) · hold RMB charge a heavy chop, release to swing ·
//   Space dodge roll (i-frames, costs stamina) · Q med kit. Interaction (E) lives in the scene.
//
// States: free → swing (combo step 0/1/2) → free … · charge → chop → free · roll → free · dead.
// A swing connects once, at its `hitAt` moment: the scene resolves what the arc touches
// (scene.meleeHit → enemies, undergrowth, nests). Inputs pressed during a swing are buffered, so
// mashing LMB flows through the combo. Stamina gates rolls and slows swings when empty.
//
// HP and med kits come from the Run at the start of an expedition and go back only through the
// expedition result (Run.applyExpedition), so the Run stays the single source of truth.

import * as THREE from 'three';
import { CONFIG, WEAPONS, WEAPON_ALIAS, STAMINA, ROLL, JUICE } from '../data/config.js';
import { setAnim, setFacing, updateVisual, flashVisual, setOpacity, hasAnim, animLength, setAnimSpeed } from '../core/Assets.js';

export class Player {
  constructor(scene, x, z) {
    const C = CONFIG.player;
    this.scene = scene;
    this.game = scene.game;
    const run = this.game.run;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = { x: 0, z: 0 };
    this.kb = { x: 0, z: 0 };
    this.r = C.radius;
    this.maxHp = C.hp;
    this.hp = Math.max(1, Math.min(C.hp, run.playerHp));
    this.meds = Math.min(C.maxMeds, run.meds + (run.hasSkill('field_medic') ? 1 : 0));
    const wk = WEAPON_ALIAS[run.weapon] || run.weapon;
    this.weaponKey = WEAPONS[wk] ? wk : 'machete';
    this.weapon = WEAPONS[this.weaponKey];
    this.aim = { x: 1, z: 0 };
    this.aimPoint = new THREE.Vector3(x + 2, 0, z);
    this.state = 'free';
    this.stateT = 0;
    this.combo = 0;            // next combo step
    this.comboT = 0;           // time left to continue the combo
    this.buffer = null;        // buffered input during a swing: 'slash' | 'roll'
    this.swing = null;         // current swing spec
    this.swingDir = { x: 1, z: 0 };
    this.hitDone = false;
    this.chargeT = 0;
    this.stamina = STAMINA.max;
    this.staminaDelay = 0;
    this.exhausted = false;
    this.rollCd = 0;
    this.rollDir = { x: 1, z: 0 };
    this.iframes = 0;
    this.medCd = 0;
    this.hurtT = 0;
    this.moving = false;
    this.dead = false;
    this.walkT = 0;
    this._tmp = new THREE.Vector3();

    this.vis = this.game.assets.makeVisual('player');
    this.vis.position.copy(this.pos);
    scene.three.add(this.vis);
    this._buildReticle();
  }

  get dodging() { return this.state === 'roll' && this.stateT < ROLL.iframes; }
  get attacking() { return this.state === 'swing' || this.state === 'chop'; }
  get charging() { return this.state === 'charge'; }

  _buildReticle() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ead4aa', transparent: true, opacity: 0.8, depthWrite: false, depthTest: false });
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(2 / 32, 5 / 32), mat);
      tick.rotation.x = -Math.PI / 2;
      const a = (i * Math.PI) / 2;
      tick.position.set(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
      tick.rotation.z = a + Math.PI / 2;
      tick.renderOrder = 10;
      g.add(tick);
    }
    this.reticle = g;
    this.reticleMat = mat;
    this.scene.three.add(g);
  }

  update(dt) {
    const C = CONFIG.player;
    const input = this.game.input;
    const sc = this.scene;
    this.iframes -= dt; this.medCd -= dt; this.hurtT -= dt; this.rollCd -= dt; this.comboT -= dt;
    this.stateT += dt;

    // ---- aim
    const hit = this.game.mouseOnPlane(sc.camera, C.shotHeight, this._tmp);
    if (hit) {
      this.aimPoint.set(hit.x, 0, hit.z);
      const dx = hit.x - this.pos.x, dz = hit.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) { this.aim.x = dx / len; this.aim.z = dz / len; }
    }
    if (this.dead) { this._updateVisual(dt); return; }

    // ---- stamina
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else this.stamina = Math.min(STAMINA.max, this.stamina + STAMINA.regen * (this.exhausted ? STAMINA.exhaustedRegen : 1) * dt);
    if (this.exhausted && this.stamina >= STAMINA.max * 0.35) this.exhausted = false;

    // ---- input
    let mx = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    let mz = (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0);
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    this.moving = ml > 0;
    const block = sc.blockFire;
    const wantSlash = !block && input.mouseClicked(0);
    const wantRoll = input.wasPressed('Space');
    const holdChop = !block && input.mouseHeld(2);

    switch (this.state) {
      case 'free':
        if (wantRoll) this.startRoll(mx, mz);
        else if (holdChop) this._enter('charge');
        else if (wantSlash) this.startSwing();
        break;
      case 'swing': {
        if (wantSlash) this.buffer = 'slash';
        if (wantRoll) this.buffer = 'roll';
        if (!this.hitDone && this.stateT >= this.swing.hitAt) this._connect(1);
        if (this.stateT >= this.swing.time) {
          this.comboT = this.weapon.comboWindow;
          this._enter('free');
          if (this.buffer === 'roll') this.startRoll(mx, mz);
          else if (this.buffer === 'slash') this.startSwing();
          this.buffer = null;
        } else if (this.buffer === 'roll' && this.hitDone && this.stateT > this.swing.hitAt + 0.05) {
          // Roll-cancel the recovery of a swing.
          this.buffer = null;
          this.startRoll(mx, mz);
        }
        break;
      }
      case 'charge': {
        this.chargeT += dt;
        const ch = this.weapon.chop;
        if (this.chargeT >= ch.charge && !this._chargeReady) {
          this._chargeReady = true;
          sc.fx.ring(this.pos, { color: '#fee761', radius: 0.9, life: 0.25 });
          this.game.sfx.play('zap');
        }
        if (Math.random() < (this._chargeReady ? 0.5 : 0.2)) {
          sc.fx.burst({ x: this.pos.x + this.aim.x * 0.4, y: 0.6, z: this.pos.z + this.aim.z * 0.4 }, { color: this._chargeReady ? '#fee761' : '#c0cbdc', count: 1, speed: 0.6, up: 1.2, life: 0.25, size: 1.5 / 32 });
        }
        if (wantRoll) { this.chargeT = 0; this.startRoll(mx, mz); break; }
        if (!holdChop) {
          if (this._chargeReady) this.startChop();
          else { this._enter('free'); this.startSwing(); }
          this._chargeReady = false;
          this.chargeT = 0;
        }
        break;
      }
      case 'chop': {
        if (!this.hitDone && this.stateT >= this.swing.hitAt) this._connect(2);
        if (wantRoll && this.hitDone) { this.startRoll(mx, mz); break; }
        if (this.stateT >= this.swing.time) this._enter('free');
        break;
      }
      case 'roll': {
        if (wantSlash && this.stateT > ROLL.time * 0.5) this.buffer = 'slash';
        if (this.stateT >= ROLL.time) {
          this.vel.x *= 0.4; this.vel.z *= 0.4;
          this._enter('free');
          this.rollCd = ROLL.cooldown;
          if (this.buffer === 'slash') this.startSwing();
          this.buffer = null;
        }
        break;
      }
    }

    // ---- movement
    const terrain = sc.world.speedAt(this.pos.x, this.pos.z);
    if (this.state === 'roll') {
      const k = 1 - Math.min(1, this.stateT / ROLL.time) * 0.5;
      this.vel.x = this.rollDir.x * ROLL.speed * k * Math.max(0.7, terrain);
      this.vel.z = this.rollDir.z * ROLL.speed * k * Math.max(0.7, terrain);
      if (Math.random() < 0.5) sc.fx.burst({ x: this.pos.x, y: 0.05, z: this.pos.z }, { color: '#5a4430', count: 1, speed: 0.6, up: 0.6, life: 0.3, size: 0.06 });
    } else {
      const slow = this.state === 'charge' ? 0.42 : this.attacking ? 0.3 : 1;
      const sp = C.speed * terrain * slow;
      const tx = mx * sp, tz = mz * sp;
      const ax = tx - this.vel.x, az = tz - this.vel.z;
      const al = Math.hypot(ax, az), maxA = C.accel * dt;
      if (al > maxA) { this.vel.x += (ax / al) * maxA; this.vel.z += (az / al) * maxA; } else { this.vel.x = tx; this.vel.z = tz; }
    }
    const kd = Math.exp(-10 * dt);
    this.kb.x *= kd; this.kb.z *= kd;
    sc.world.moveBody(this.pos, (this.vel.x + this.kb.x) * dt, (this.vel.z + this.kb.z) * dt, this.r);
    // Wading / rustling feedback.
    if (this.moving && this.state === 'free') {
      this.walkT += dt;
      if (this.walkT > 0.18) {
        this.walkT = 0;
        const lv = sc.world.levelAt(this.pos.x, this.pos.z);
        if (lv === 0) sc.fx.ring({ x: this.pos.x, z: this.pos.z }, { color: '#5f9a86', radius: 0.45, life: 0.35 });
        else if (sc.world.brushAt(Math.floor(this.pos.x), Math.floor(this.pos.z)) === 1) {
          this.game.sfx.play('rustle');
          sc.fx.burst({ x: this.pos.x, y: 0.3, z: this.pos.z }, { color: '#376a30', color2: '#4b8139', count: 2, speed: 0.8, up: 1.2, life: 0.35, size: 1.5 / 32, gravity: 4 });
        }
      }
    }

    if (input.wasPressed('KeyQ')) this.useMed();
    this._updateVisual(dt);
  }

  _enter(state) {
    this.state = state;
    this.stateT = 0;
  }

  _spend(n) {
    this.stamina -= n;
    this.staminaDelay = STAMINA.delay;
    if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
  }

  startSwing() {
    const step = this.comboT > 0 ? this.combo : 0;
    const spec = this.weapon.combo[step];
    this.combo = (step + 1) % this.weapon.combo.length;
    if (this.combo === 0) this.comboT = 0;
    // Exhausted swings are slower and weaker.
    const tired = this.exhausted;
    this.swing = tired ? { ...spec, time: spec.time * 1.35, hitAt: spec.hitAt * 1.35, damage: Math.round(spec.damage * 0.7) } : spec;
    this.swing.step = step;
    this._spend(spec.stamina);
    this.swingDir = { x: this.aim.x, z: this.aim.z };
    this.hitDone = false;
    this._enter('swing');
    this.kb.x += this.swingDir.x * spec.lunge;
    this.kb.z += this.swingDir.z * spec.lunge;
    const anim = hasAnim(this.vis, 'slash') ? 'slash' : 'attack';
    setFacing(this.vis, this.swingDir.x, this.swingDir.z, true);
    setAnim(this.vis, anim, true);
    const len = animLength(this.vis, anim);
    setAnimSpeed(this.vis, len > 0 ? len / this.swing.time : 1);
    this.game.sfx.play('slash');
  }

  startChop() {
    const spec = this.weapon.chop;
    this.swing = { ...spec, step: 3 };
    this._spend(spec.stamina);
    this.swingDir = { x: this.aim.x, z: this.aim.z };
    this.hitDone = false;
    this.combo = 0; this.comboT = 0;
    this._enter('chop');
    this.kb.x += this.swingDir.x * spec.lunge;
    this.kb.z += this.swingDir.z * spec.lunge;
    const anim = hasAnim(this.vis, 'chop') ? 'chop' : hasAnim(this.vis, 'slash') ? 'slash' : 'attack';
    setFacing(this.vis, this.swingDir.x, this.swingDir.z, true);
    setAnim(this.vis, anim, true);
    const len = animLength(this.vis, anim);
    setAnimSpeed(this.vis, len > 0 ? len / spec.time : 1);
    this.game.sfx.play('chop');
  }

  _connect(power) {
    this.hitDone = true;
    const a = Math.atan2(this.swingDir.z, this.swingDir.x);
    this.scene.meleeHit(this.pos.x, this.pos.z, a, this.swing, power);
  }

  startRoll(mx, mz) {
    if (this.rollCd > 0) return;
    if (this.stamina < STAMINA.roll * 0.5) {
      this.scene.fx.text(this.pos, 'Out of breath', { color: '#8b9bb4', y: this.vis.userData.vis.height + 0.3, life: 0.6, key: 'breath' });
      this.game.sfx.play('error');
      this.rollCd = 0.3;
      return;
    }
    this._spend(STAMINA.roll);
    const dir = (mx || mz) ? { x: mx, z: mz } : { x: this.aim.x, z: this.aim.z };
    this.rollDir = dir;
    this.buffer = null;
    this._enter('roll');
    this.iframes = Math.max(this.iframes, ROLL.iframes);
    this.game.sfx.play('dodge');
    this.scene.fx.burst({ x: this.pos.x, y: 0.05, z: this.pos.z }, { color: '#5a4430', color2: '#376a30', count: 6, speed: 1.5, up: 0.8, life: 0.35, size: 0.08 });
    setFacing(this.vis, dir.x, dir.z, true);
    const anim = hasAnim(this.vis, 'roll') ? 'roll' : 'dodge';
    setAnim(this.vis, anim, true);
    const len = animLength(this.vis, anim);
    setAnimSpeed(this.vis, len > 0 ? len / ROLL.time : 1);
  }

  useMed() {
    const C = CONFIG.player;
    if (this.medCd > 0) return;
    if (this.meds <= 0) { this.scene.toast('No med kits', 'bad'); this.game.sfx.play('error'); this.medCd = 0.4; return; }
    if (this.hp >= this.maxHp) { this.scene.toast('Already at full health', 'amber'); this.game.sfx.play('error'); this.medCd = 0.4; return; }
    const heal = Math.min(C.medHeal, this.maxHp - this.hp);
    this.hp += heal;
    this.meds -= 1;
    this.medCd = C.medCooldown;
    this.scene.fx.text(this.pos, `+${heal} HP`, { color: '#63c74d', cls: 'big', y: this.vis.userData.vis.height + 0.3 });
    this.scene.fx.burst(this.pos, { color: '#63c74d', color2: '#ffffff', count: 14, speed: 1.6, up: 3, life: 0.6, size: 0.07 });
    this.scene.fx.ring(this.pos, { color: '#63c74d', radius: 1.1, life: 0.4 });
    this.game.sfx.play('pickup');
  }

  /** Take damage from a direction. Returns true if it landed (false while rolling / invulnerable). */
  hurt(dmg, dx = 0, dz = 0, source = '') {
    if (this.dead) return false;
    if (this.dodging) {
      if (source) this.scene.fx.text(this.pos, 'DODGED', { color: '#2ce8f5', y: this.vis.userData.vis.height + 0.3, life: 0.5, key: 'dodged' });
      this.scene.onPerfectDodge?.();
      return false;
    }
    if (this.iframes > 0 || this.scene.ending || this.god) return false;
    const C = CONFIG.player;
    dmg = Math.max(1, Math.round(dmg));
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = C.hurtIframes;
    this.hurtT = 0.22;
    // Getting hit interrupts a charge (not a committed swing).
    if (this.state === 'charge') { this._enter('free'); this._chargeReady = false; this.chargeT = 0; }
    const l = Math.hypot(dx, dz);
    if (l > 0) { this.kb.x += (dx / l) * C.hurtKnockback; this.kb.z += (dz / l) * C.hurtKnockback; }
    flashVisual(this.vis, '#ff4040', 0.12);
    if (this.state === 'free') setAnim(this.vis, 'hurt', true);
    this.game.flash('#e43b44', 0.25);
    this.game.shake(5, 0.2);
    this.scene.fx.hitStop(JUICE.hitStop.playerHurt);
    this.game.sfx.play('hurt');
    this.scene.fx.text(this.pos, `-${dmg}`, { color: '#e43b44', cls: 'big', y: this.vis.userData.vis.height + 0.25 });
    this.scene.fx.burst(this.pos, { color: '#e43b44', count: 8, speed: 2, up: 2, life: 0.4, size: 0.07, y: 0.6 });
    this.scene.onPlayerHurt?.(dmg);
    if (this.hp <= 0) {
      this.dead = true;
      this.scene.onPlayerDeath();
    }
    return true;
  }

  _updateVisual(dt) {
    const v = this.vis;
    v.position.set(this.pos.x, 0, this.pos.z);
    const st = this.state;
    // Walking faces where you walk; standing (or charging) faces the mouse.
    if (st === 'free' && this.moving && Math.hypot(this.vel.x, this.vel.z) > 0.5) setFacing(v, this.vel.x, this.vel.z);
    else if (st === 'free' || st === 'charge') setFacing(v, this.aim.x, this.aim.z);
    if (this.dead) setAnim(v, 'hurt');
    else if (st === 'free' || st === 'charge') {
      setAnimSpeed(v, 1);
      if (this.hurtT > 0 && hasAnim(v, 'hurt')) setAnim(v, 'hurt');
      else if (this.moving) setAnim(v, 'walk');
      else setAnim(v, 'idle');
    }
    const vis = v.userData.vis;
    if (vis.kind === 'model') {
      this.walkT += this.moving ? dt * 12 : 0;
      vis.body.position.y = this.moving ? Math.abs(Math.sin(this.walkT * 12)) * 0.06 : 0;
    }
    // Invulnerability flicker after a hit (not during a roll).
    const flicker = this.iframes > 0 && st !== 'roll' && !this.dead && Math.floor(this.iframes * 20) % 2 === 0;
    if (flicker !== this._flicker) { this._flicker = flicker; setOpacity(v, flicker ? 0.35 : 1); }
    updateVisual(v, dt);
    this.reticle.position.set(this.aimPoint.x, 0.04, this.aimPoint.z);
    this.reticle.visible = !this.dead && !this.scene.paused;
  }

  dispose() {
    this.game.assets.disposeVisual(this.vis);
    this.reticle.removeFromParent();
    this.reticle.traverse((o) => { o.geometry?.dispose(); });
    this.reticleMat.dispose();
  }
}
