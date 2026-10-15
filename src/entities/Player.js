// The scavenger (jungle exploration): a machete fighter.
//
//   WASD move · mouse aim · LMB slash (3-hit combo; hold it while walking to hack through brush) · hold RMB charge a
//   heavy chop, release to swing (the first moment of an RMB press deflects) · Space dodge roll (i-frames, costs
//   stamina) · F throw the machete (LMB shoves while it's out; F again calls it back) · Q med kit. Interaction (E)
//   lives in the scene.
//
// States: free → swing (combo step 0/1/2) → free … · charge → chop → free · roll → free · throw → free · heal → free · dead.
// Stage 9: a hit taken stops your swing (POISE.flinch: a beat with no attacks, a roll still works); a med kit takes
// CONFIG.player.medTime to apply (walking slowly, a hit spoils it, the kit is kept); every wound is logged (hurtLog) so a
// collapse can say what got you and what to do about it (deathNote).
// A swing connects once, at its `hitAt` moment: the scene resolves what the arc touches
// (scene.meleeHit → enemies, undergrowth, nests). Inputs pressed during a swing are buffered, so
// mashing LMB flows through the combo; a Space press is buffered too (ROLL.buffer, critic I #7). Stamina is paid
// when the blade lands: full price on a creature, a nest or a pod, a token on plants (critic I #4).
//
// Critic I additions: deflect / riposte (tryDeflect, DEFLECT), perfect dodge (ROLL, nearMiss), status effects
// (sap puddles, bleeding, the Thorn Stalker's root: STATUS), the machete throw (WEAPONS.*.throw), fast turns and
// the corner nudge (CONFIG.player.turnAccel / nudge), and a collapse when you go down.
//
// HP and med kits come from the Run at the start of an expedition and go back only through the
// expedition result (Run.applyExpedition), so the Run stays the single source of truth.

import * as THREE from 'three';
import { CONFIG, WEAPONS, WEAPON_ALIAS, STAMINA, ROLL, JUICE, DEFLECT, STATUS, POISE } from '../data/config.js';
import { EXPLORE_ENEMIES } from '../data/enemies.js';
import { GROUND } from '../data/jungle.js';
import { kitWeapon, Bleeds } from './BladeKit.js';
import { keyLabel } from '../core/Input.js';
import { setAnim, setFacing, updateVisual, flashVisual, setOpacity, hasAnim, animLength, animHitFrac, setAnimSpeed, setBaseColor } from '../core/Assets.js';

/** Play the first sound name the audio data knows (new names fall back to older ones). */
function sfx(game, ...names) {
  for (const n of names) if (game.sfx.play(n)) return;
}

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
    this.maxMeds = run.maxMeds ? run.maxMeds() : C.maxMeds;   // (relic: Medic's Satchel +1)
    this.meds = Math.min(this.maxMeds, run.meds + (run.hasSkill('field_medic') ? 1 : 0));
    const wk = WEAPON_ALIAS[run.weapon] || run.weapon;
    this.weaponKey = WEAPONS[wk] ? wk : 'machete';
    // The run's machete kit (skills + Workbench upgrades: Run.bladeMods, src/entities/BladeKit.js) over the weapon data.
    this.kit = run.bladeMods?.() || {};
    this.bleeds = this.kit.bleedDps ? new Bleeds(scene, this.kit.bleedDps, this.kit.bleedTime) : null;
    this.weapon = kitWeapon(WEAPONS[this.weaponKey], this.kit, this.bleeds);
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
    this.rollQ = 0;            // a buffered Space press (s left)
    this.rollFrom = { x, z };  // where the current roll started (near-miss perfect dodges)
    this.perfectUsed = false;
    this.dodgedShown = false;  // DODGED shows once per roll
    this.turnT = 0;            // keep the snappy turn accel this long after a reversal (CONFIG.player.turnHold)
    this.iframes = 0;
    this.guardT = 0;           // a deflect's own short invulnerability (no flicker)
    this.medCd = 0;
    this.hurtT = 0;
    this.moving = false;
    this.moveDir = { x: 0, z: 0 };
    this.dead = false;
    this.deathT = 0;
    this.walkT = 0;
    this.eFreeT = 99;          // seconds since E (interact) was last held: no swing lunge right after
    this.deflectT = 0;         // deflect window open (s left)
    this.deflectLock = 0;      // no new window until this runs out
    this.riposteT = 0;         // the next light slash is a riposte
    this.hackT = 0;            // hack-through: next auto-swing
    this.hackStep = 1;
    this.throwCd = 0;
    this.blade = null;         // the thrown machete while it is out (ExploreShots.throwBlade)
    this.bleedT = 0; this.bleedTick = 0;
    this.rootT = 0;
    this.sapped = false;
    this.rimT = 0;
    this.moveOpts = { nudge: C.nudge };
    this.flinchT = 0;          // hit mid-swing: no attacks for this long (POISE.flinch)
    this.hurtLog = [];         // today's wounds: { src, how, dmg, swinging } (deathNote)
    this._tmp = new THREE.Vector3();

    this.vis = this.game.assets.makeVisual('player');
    this.vis.position.copy(this.pos);
    scene.three.add(this.vis);
    this._buildReticle();
  }

  get dodging() { return this.state === 'roll' && this.stateT < ROLL.iframes; }
  get attacking() { return this.state === 'swing' || this.state === 'chop'; }
  get charging() { return this.state === 'charge'; }
  /** The deflect window (critic I §9A): the first DEFLECT.window s after an RMB press, blade in hand. */
  get deflectOpen() { return this.deflectT > 0 && !this.dead && !this.blade && (this.state === 'charge' || this.state === 'swing' || this.state === 'free'); }

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
    this.deflectT -= dt; this.deflectLock -= dt; this.riposteT -= dt; this.hackT -= dt; this.throwCd -= dt; this.guardT -= dt; this.turnT -= dt; this.flinchT -= dt;
    this.stateT += dt;
    this.eFreeT = input.isDown('KeyE') ? 0 : this.eFreeT + dt;
    if (this.rimT > 0) { this.rimT -= dt; if (this.rimT <= 0) this.vis.userData.outlineOverride = null; }

    // ---- aim
    const hit = this.game.mouseOnPlane(sc.camera, C.shotHeight, this._tmp);
    if (hit) {
      this.aimPoint.set(hit.x, 0, hit.z);
      const dx = hit.x - this.pos.x, dz = hit.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) { this.aim.x = dx / len; this.aim.z = dz / len; }
    }
    if (this.dead) { this.deathT += dt; this._updateVisual(dt); return; }

    // ---- stamina
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else this.stamina = Math.min(STAMINA.max, this.stamina + STAMINA.regen * (this.exhausted ? STAMINA.exhaustedRegen : 1) * (sc.staminaRegenMult ?? 1) * dt);   // (Heat: src/data/weather.js)
    if (this.exhausted && this.stamina >= STAMINA.max * 0.35) this.exhausted = false;

    // ---- status effects
    this.bleeds?.update(dt);   // creatures bleeding from Serrated Edge
    this._updateStatus(dt);
    if (this.dead) { this._updateVisual(dt); return; }

    // ---- input
    let mx = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    let mz = (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0);
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    this.moving = ml > 0;
    this.moveDir.x = mx; this.moveDir.z = mz;
    const block = sc.blockFire || this.flinchT > 0;   // (a hit just stopped your swing: POISE.flinch)
    const wantSlash = !block && input.mouseClicked(0);
    const holdSlash = !block && input.mouseHeld(0);
    const holdChop = !block && input.mouseHeld(2) && !this.blade;
    const pressChop = !block && input.mouseClicked(2);
    const wantThrow = !block && input.wasPressed('KeyF');
    // A deflect window opens on every RMB press — at most one per DEFLECT.lockout, so tap-spam doesn't work.
    if (pressChop && !this.blade && this.deflectLock <= 0 && this.state !== 'roll') { this.deflectT = DEFLECT.window + (this.kit.deflectWindow || 0); this.deflectLock = DEFLECT.lockout; }
    // Roll buffer: a press in the last ROLL.buffer s of a roll (or any time it can't roll yet) waits its turn.
    if (input.wasPressed('Space') && !(this.state === 'roll' && this.stateT < ROLL.time - ROLL.buffer)) this.rollQ = ROLL.buffer;
    const wantRoll = this.rollQ > 0;

    switch (this.state) {
      case 'free':
        if (wantRoll && this.rollCd <= 0) this.startRoll(mx, mz);
        else if (wantThrow) this.startThrow();
        else if (holdChop || (pressChop && !this.blade)) this._enter('charge');
        else if (wantSlash) { if (this.blade) this.startShove(); else this.startSwing(); }
        else if (holdSlash && this.moving && !this.blade && this.hackT <= 0) this.startSwing({ hack: true });
        break;
      case 'swing': {
        if (wantSlash) this.buffer = 'slash';
        if (wantRoll) { this.buffer = 'roll'; this.rollQ = 0; }
        if (!this.hitDone && this.stateT >= this.swing.hitAt) this._connect(1);
        if (this.stateT >= this.swing.time) {
          this.comboT = this.weapon.comboWindow;
          this._enter('free');
          if (this.buffer === 'roll') this.startRoll(mx, mz);
          else if (this.buffer === 'slash') { if (this.blade) this.startShove(); else this.startSwing(); }
          else if (holdSlash && this.moving && !this.blade) this.startSwing({ hack: true });   // hack-through keeps swinging
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
        if (this.chargeT >= ch.charge * (sc.relicMod?.('chopCharge') ?? 1) && !this._chargeReady) {   // (relic: Ironwood Grip)
          this._chargeReady = true;
          sc.fx.ring(this.pos, { color: '#fee761', radius: 0.9, life: 0.25 });
          this.game.sfx.play('charge_ready');
        }
        if (Math.random() < (this._chargeReady ? 0.5 : 0.2)) {
          sc.fx.burst({ x: this.pos.x + this.aim.x * 0.4, y: 0.6, z: this.pos.z + this.aim.z * 0.4 }, { color: this._chargeReady ? '#fee761' : '#c0cbdc', count: 1, speed: 0.6, up: 1.2, life: 0.25, size: 1.5 / 32 });
        }
        if (wantRoll) { this.chargeT = 0; this._chargeReady = false; this.startRoll(mx, mz); break; }
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
      case 'throw': {
        if (wantRoll) { this._enter('free'); this.startRoll(mx, mz); break; }   // roll-cancel (nothing spent yet)
        if (this.stateT >= this.swing.hitAt) this._releaseThrow();
        break;
      }
      case 'heal': {
        // Applying a med kit (CONFIG.player.medTime): a roll cancels it (the kit is kept).
        if (wantRoll && this.rollCd <= 0) { this._enter('free'); this.startRoll(mx, mz); break; }
        if (Math.random() < 0.3) sc.fx.burst({ x: this.pos.x, y: 0.7, z: this.pos.z }, { color: '#63c74d', count: 1, speed: 0.5, up: 1.2, life: 0.3, size: 1.5 / 32 });
        if (this.stateT >= C.medTime) { this._enter('free'); this._applyMed(); }
        break;
      }
      case 'roll': {
        if (wantSlash && this.stateT > ROLL.time * 0.5) this.buffer = 'slash';
        if (this.stateT >= ROLL.time) {
          this.vel.x *= 0.4; this.vel.z *= 0.4;
          this._enter('free');
          this.rollCd = ROLL.cooldown;
          if (this.buffer === 'slash') { if (this.blade) this.startShove(); else this.startSwing(); }
          this.buffer = null;
        }
        break;
      }
    }
    // The buffered press only ages while a roll could actually start (not mid-roll, cooldown or a chop's wind-up).
    if (!(this.state === 'roll' || this.rollCd > 0 || (this.state === 'chop' && !this.hitDone) || this.state === 'swing')) this.rollQ -= dt;

    // ---- movement
    const terrain = sc.world.speedAt(this.pos.x, this.pos.z, !!this.kit.fernFree, sc.relicMod?.('fernDrag') ?? 1);   // Brush Dancer: ferns don't drag; Tapir-hide Boots: less
    this.sapped = !!sc.shots?.sapAt?.(this.pos.x, this.pos.z, this.r * 0.5);
    if (this.state === 'roll') {
      const k = 1 - Math.min(1, this.stateT / ROLL.time) * 0.5;
      // Ferns drag a roll too (no full-speed rolling through undergrowth); water/mud only down to rollMin.
      const rt = Math.max(GROUND.rollMin, sc.world.speedAt(this.pos.x, this.pos.z, true)) * (sc.world.inFern?.(this.pos.x, this.pos.z) && !this.kit.fernFree ? GROUND.fernRoll : 1);
      this.vel.x = this.rollDir.x * ROLL.speed * k * rt;
      this.vel.z = this.rollDir.z * ROLL.speed * k * rt;
      if (Math.random() < 0.5) sc.fx.burst({ x: this.pos.x, y: 0.05, z: this.pos.z }, { color: '#5a4430', count: 1, speed: 0.6, up: 0.6, life: 0.3, size: 0.06 });
    } else {
      const S = C.actSlow;
      const st = this.state;
      const slow = st === 'charge' ? S.charge : st === 'throw' ? S.throw : st === 'heal' ? S.heal
        : st === 'swing' ? (this.swing?.plantsOnly ? S.plants : S.swing) : st === 'chop' ? S.swing : 1;
      const rooted = this.rootT > 0;
      // sc.moveMult: carrying a generator core (src/scenes/JungleGoals.js, GOALS.carry.speed).
      const sp = rooted ? 0 : C.speed * terrain * slow * (this.sapped ? STATUS.sap.slow : 1) * (sc.moveMult ?? 1);
      const ix = rooted ? 0 : mx, iz = rooted ? 0 : mz;
      const tx = ix * sp, tz = iz * sp;
      const ax = tx - this.vel.x, az = tz - this.vel.z;
      // Snappy reversals (critic I #7): input against your motion turns you round at turnAccel, kept for turnHold s
      // after so the new way gets up to speed fast too (critic I2: 180 degrees in ~0.1 s); letting go stops at stopAccel.
      if ((ix || iz) && ix * this.vel.x + iz * this.vel.z < 0) this.turnT = C.turnHold;
      const accel = !(ix || iz) ? C.stopAccel : this.turnT > 0 ? C.turnAccel : C.accel;
      const al = Math.hypot(ax, az), maxA = accel * dt;
      if (al > maxA) { this.vel.x += (ax / al) * maxA; this.vel.z += (az / al) * maxA; } else { this.vel.x = tx; this.vel.z = tz; }
    }
    const kd = Math.exp(-10 * dt);
    this.kb.x *= kd; this.kb.z *= kd;
    sc.world.moveBody(this.pos, (this.vel.x + this.kb.x) * dt, (this.vel.z + this.kb.z) * dt, this.r, this.moveOpts);
    // Wading / rustling feedback.
    if (this.moving && this.state === 'free') {
      this.walkT += dt;
      if (this.walkT > 0.18) {
        this.walkT = 0;
        const lv = sc.world.levelAt(this.pos.x, this.pos.z);
        if (lv === 0 && !sc.world.onBridge?.(this.pos.x, this.pos.z)) sc.fx.ring({ x: this.pos.x, z: this.pos.z }, { color: '#5f9a86', radius: 0.45, life: 0.35 });
        else if (sc.world.brushAt(Math.floor(this.pos.x), Math.floor(this.pos.z)) === 1 && !sc.noRustle) {   // (rain: ferns don't rustle)
          this.game.sfx.play('fern_push');
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
    // Spending while already exhausted doesn't restart the regen delay: swinging on empty slows the recovery
    // (it still costs) but can't freeze it, so exhaustion always ends (critic I #4: ≤ 20% of a fight exhausted).
    if (!this.exhausted) this.staminaDelay = STAMINA.delay;
    if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
  }

  _gain(n) {
    this.stamina = Math.min(STAMINA.max, this.stamina + n);
    if (this.exhausted && this.stamina >= STAMINA.max * 0.35) this.exhausted = false;
  }

  /** Is a live creature within `r` (+ its radius)? (a swing's move-slow before it lands) */
  _creatureNear(r) {
    for (const e of this.scene.enemies) if (!e.dead && !e.hidden && Math.hypot(e.x - this.pos.x, e.z - this.pos.z) < r + e.radius) return true;
    return false;
  }

  /**
   * A light swing. o.hack: the hack-through auto-swing (LMB held while walking): it alternates the two light
   * steps (never the finisher) and cuts along where you walk unless you aim within 60° of it.
   */
  startSwing(o = {}) {
    let step;
    if (o.hack) {
      step = this.hackStep = this.hackStep ? 0 : 1;
      this.combo = 0; this.comboT = 0;
      this.hackT = this.weapon.hackEvery;
    } else {
      step = this.comboT > 0 ? this.combo : 0;
      this.combo = (step + 1) % this.weapon.combo.length;
      if (this.combo === 0) this.comboT = 0;
    }
    const spec = this.weapon.combo[step];
    const sw = this._tired(spec);
    // A riposte (the first light slash after a deflect): × DEFLECT.riposte.mult, it always staggers, reaches and
    // lunges further; it is only spent when it connects (_connect), so a whiff doesn't waste it (critic I2 #7).
    let lunge = spec.lunge;
    if (this.riposteT > 0 && !o.hack) {
      const R = DEFLECT.riposte;
      sw.damage = Math.round(spec.damage * (this.kit.riposteMult || R.mult));   // Riposte Master: ×3
      sw.stagger = Math.max(sw.stagger || 0, R.stagger);
      sw.range += R.range;
      sw.riposte = true;
      lunge += R.lunge;
    }
    sw.step = step;
    sw.plantsOnly = !this._creatureNear(sw.range + 1.2);
    this.swing = sw;
    let dir = { x: this.aim.x, z: this.aim.z };
    if (o.hack && this.moving && this.aim.x * this.moveDir.x + this.aim.z * this.moveDir.z < 0.5) dir = { x: this.moveDir.x, z: this.moveDir.z };
    this.swingDir = dir;
    this.hitDone = false;
    this._enter('swing');
    this._lunge(lunge);
    const anim = hasAnim(this.vis, 'slash') ? 'slash' : 'attack';
    setFacing(this.vis, this.swingDir.x, this.swingDir.z, true);
    this._playStrike(anim);
    this.game.sfx.play('slash');
  }

  /** A swing spec as an exhausted arm throws it: slower and weaker (STAMINA.exhaustedSwing). */
  _tired(spec) {
    if (!this.exhausted) return { ...spec };
    const X = STAMINA.exhaustedSwing;
    return { ...spec, time: spec.time * X.time, hitAt: spec.hitAt * X.time, damage: Math.round(spec.damage * X.damage) };
  }

  startChop() {
    const spec = this.weapon.chop;
    this.swing = { ...this._tired(spec), step: 3 };
    this.swingDir = { x: this.aim.x, z: this.aim.z };
    this.hitDone = false;
    this.combo = 0; this.comboT = 0;
    this._enter('chop');
    this._lunge(spec.lunge);
    const anim = hasAnim(this.vis, 'chop') ? 'chop' : hasAnim(this.vis, 'slash') ? 'slash' : 'attack';
    setFacing(this.vis, this.swingDir.x, this.swingDir.z, true);
    this._playStrike(anim);
    this.game.sfx.play('chop');
  }

  /** LMB while the machete is out: a shove (WEAPONS.*.shove) — a little damage, a big push, no cutting. */
  startShove() {
    const S = this.weapon.shove;
    this.swing = { ...S, step: 0, shove: true, plantsOnly: !this._creatureNear(S.range + 1) };
    this.swingDir = { x: this.aim.x, z: this.aim.z };
    this.hitDone = false;
    this._enter('swing');
    this._lunge(S.lunge);
    setFacing(this.vis, this.swingDir.x, this.swingDir.z, true);
    this._playStrike(hasAnim(this.vis, 'slash') ? 'slash' : 'attack');
    sfx(this.game, 'shove', 'roll');
  }

  /** F: wind up a machete throw (WEAPONS.*.throw, critic I §9E). F again while it's out calls it back. */
  startThrow() {
    const T = this.weapon.throw;
    if (!T) return;
    // F again calls it back, but not in the first `recallLock` s, so a double-tap doesn't waste the throw.
    if (this.blade) { if (this.blade.t >= (T.recallLock || 0)) this.scene.shots.recallBlade(this.blade); return; }
    if (this.throwCd > 0) { this.scene.fx.text(this.pos, 'Not yet', { color: '#8b9bb4', y: this.vis.userData.vis.height + 0.3, life: 0.5, key: 'throwcd' }); return; }
    if (this.stamina < T.stamina * 0.5) {
      this.scene.fx.text(this.pos, 'Out of breath', { color: '#8b9bb4', y: this.vis.userData.vis.height + 0.3, life: 0.6, key: 'breath' });
      this.game.sfx.play('huff');
      return;
    }
    this.swing = { hitAt: T.windup, time: T.windup + 0.12, step: 0 };
    this.swingDir = { x: this.aim.x, z: this.aim.z };
    this._enter('throw');
    setFacing(this.vis, this.aim.x, this.aim.z, true);
    this._playStrike(hasAnim(this.vis, 'slash') ? 'slash' : 'attack');
  }

  _releaseThrow() {
    const T = this.weapon.throw;
    const sc = this.scene;
    const dir = { x: this.aim.x, z: this.aim.z };
    this._spend(T.stamina);
    this.throwCd = T.cooldown;
    this._enter('free');
    setAnimSpeed(this.vis, this._postSpeed || 1);
    this.blade = sc.shots.throwBlade({ x: this.pos.x + dir.x * 0.4, z: this.pos.z + dir.z * 0.4, dir, spec: T, onCatch: () => this._catchBlade() });
    sc.fx.flash({ x: this.pos.x + dir.x * 0.45, y: 0.6, z: this.pos.z + dir.z * 0.45 }, { color: '#ffffff', size: 0.35, life: 0.05 });
    sfx(this.game, 'machete_throw', 'slash');
  }

  _catchBlade() {
    this.blade = null;
    if (this.dead) return;
    this.scene.fx.flash({ x: this.pos.x + this.aim.x * 0.3, y: 0.6, z: this.pos.z + this.aim.z * 0.3 }, { color: '#ffffff', size: 0.3, life: 0.05 });
    sfx(this.game, 'machete_catch', 'pickup');
  }

  /** The forward step of a swing — skipped while E is held (or just released) so swinging never drags you off an interaction. */
  _lunge(v) {
    if (this.eFreeT <= JUICE.melee.noLungeAfterE) return;
    this.kb.x += this.swingDir.x * v;
    this.kb.z += this.swingDir.z * v;
  }

  /**
   * Play a strike anim so its `hit` frame shows exactly when the blade connects (swing.hitAt): the
   * frames before it are sped up (skipping some anticipation if that would be too fast), the rest is
   * stretched over the recovery (see _connect).
   */
  _playStrike(anim) {
    setAnim(this.vis, anim, true);
    const len = animLength(this.vis, anim);
    if (!(len > 0)) { setAnimSpeed(this.vis, 1); this._postSpeed = 1; return; }
    const pre = Math.max(0.03, this.swing.hitAt), post = Math.max(0.05, this.swing.time - this.swing.hitAt);
    const hitT = animHitFrac(this.vis, anim, 0.5) * len;     // seconds into the anim at speed 1
    const maxSpeed = 2.6;
    const start = Math.max(0, hitT - pre * maxSpeed);
    this.vis.userData.vis.animT = start;
    setAnimSpeed(this.vis, Math.max(0.2, (hitT - start) / pre));
    this._postSpeed = Math.max(0.4, (len - hitT) / post);
  }

  /** The blade lands: the scene resolves the arc; stamina is paid now — full on a creature, a token on plants. */
  _connect(power) {
    this.hitDone = true;
    setAnimSpeed(this.vis, this._postSpeed || 1);
    const S = this.swing;
    const a = Math.atan2(this.swingDir.z, this.swingDir.x);
    const hits = this.scene.meleeHit(this.pos.x, this.pos.z, a, S, power) || 0;
    S.plantsOnly = hits === 0;
    const plant = power >= 2 ? STAMINA.plantChop : S.step === 2 ? STAMINA.plantFinisher : STAMINA.plantSwing;
    const wasTired = this.exhausted;
    this._spend(hits > 0 ? S.stamina : Math.min(S.stamina, plant * (this.kit.cutStamina || 1)));   // Brush Dancer: ½
    // A heavy chop that lands holds stamina regen a little longer (critic I2 #6: the combo is the damage option).
    if (power >= 2 && hits > 0 && !wasTired) this.staminaDelay = Math.max(this.staminaDelay, STAMINA.chopDelay);
    if (S.riposte && hits > 0) {
      this.riposteT = 0;
      const fx = this.scene.fx;
      if (this.kit.riposteHeal) this.heal(this.kit.riposteHeal);   // Duelist
      fx.text(this.pos, 'RIPOSTE!', { color: '#fee761', cls: 'big', y: this.vis.userData.vis.height + 0.35, life: 0.7, key: 'riposte' });
      fx.hitStop(0.05);
      this.game.shake(3, 0.12);
      sfx(this.game, 'riposte', 'kill');
    }
  }

  startRoll(mx, mz) {
    if (this.rollCd > 0) return false;
    // Carrying a generator core (JungleGoals): no rolling — drop it (E) first.
    if (this.scene.noRoll) { this.rollQ = 0; this.scene.onNoRoll?.(); return false; }
    const cost = (STAMINA.roll + (this.sapped ? STATUS.sap.rollCost : 0)) * (this.scene.relicMod?.('rollCost') ?? 1);   // rolling out of sap costs more; Featherfoot Anklet less
    if (this.stamina < cost * 0.5) {
      this.scene.fx.text(this.pos, 'Out of breath', { color: '#8b9bb4', y: this.vis.userData.vis.height + 0.3, life: 0.6, key: 'breath' });
      this.game.sfx.play('huff');
      this.rollCd = 0.3;
      this.rollQ = 0;
      return false;
    }
    this._spend(cost);
    this.rollQ = 0;
    this.perfectUsed = false;
    this.dodgedShown = false;
    this.rollFrom = { x: this.pos.x, z: this.pos.z };
    this.deflectT = 0;
    const fx = this.scene.fx;
    // A roll breaks a root and stops bleeding (STATUS).
    if (this.rootT > 0) {
      this.rootT = 0;
      fx.burst({ x: this.pos.x, y: 0.1, z: this.pos.z }, { color: '#8c4026', color2: '#2a5628', count: 10, speed: 2.4, up: 2, life: 0.4, size: 2 / 32, aspect: 2, gravity: 6 });
      fx.text(this.pos, 'Broke free', { color: '#e4a672', y: this.vis.userData.vis.height + 0.3, life: 0.6, key: 'status' });
    }
    if (this.bleedT > 0) {
      this.bleedT = 0;
      fx.text(this.pos, 'Bleeding stopped', { color: '#e4a672', y: this.vis.userData.vis.height + 0.3, life: 0.7, key: 'status' });
    }
    const dir = (mx || mz) ? { x: mx, z: mz } : { x: this.aim.x, z: this.aim.z };
    this.rollDir = dir;
    this.buffer = null;
    this._enter('roll');
    this.iframes = Math.max(this.iframes, ROLL.iframes);
    this.game.sfx.play('roll');
    fx.burst({ x: this.pos.x, y: 0.05, z: this.pos.z }, { color: '#5a4430', color2: '#376a30', count: 6, speed: 1.5, up: 0.8, life: 0.35, size: 0.08 });
    setFacing(this.vis, dir.x, dir.z, true);
    const anim = hasAnim(this.vis, 'roll') ? 'roll' : 'dodge';
    setAnim(this.vis, anim, true);
    const len = animLength(this.vis, anim);
    setAnimSpeed(this.vis, len > 0 ? len / ROLL.time : 1);
    return true;
  }

  /** Health from the machete kit (Second Wind, Duelist): a small green number, never past max. Returns the HP healed. */
  heal(n) {
    if (this.dead || !(n > 0) || this.hp >= this.maxHp) return 0;
    const h = Math.min(n, this.maxHp - this.hp);
    this.hp += h;
    this.scene.fx.text(this.pos, `+${h}`, { color: '#63c74d', y: this.vis.userData.vis.height + 0.3, life: 0.5, key: 'kitheal', value: h, prefix: '+' });
    return h;
  }

  /** A creature died (JungleScene.onEnemyKilled): Second Wind heals. */
  onKill() { if (this.kit.killHeal) this.heal(this.kit.killHeal); }

  useMed() {
    const C = CONFIG.player;
    if (this.medCd > 0 || this.state === 'heal') return;
    if (this.meds <= 0) { this.scene.toast('No med kits', 'bad'); this.game.sfx.play('error'); this.medCd = 0.4; return; }
    if (this.hp >= this.maxHp) { this.scene.toast('Already at full health', 'amber'); this.game.sfx.play('error'); this.medCd = 0.4; return; }
    // Stage 9: a kit takes medTime to apply, from a free stance (not mid-swing or mid-roll): heal when it's safe.
    if (C.medTime > 0) {
      if (this.state !== 'free') return;
      this._enter('heal');
      this.medCd = C.medCooldown;
      setAnim(this.vis, 'idle');
      this.scene.fx.ring(this.pos, { color: '#63c74d', radius: 0.7, life: C.medTime });
      sfx(this.game, 'med_start', 'pickup');
      return;
    }
    this._applyMed();
  }

  _applyMed() {
    const C = CONFIG.player;
    if (this.meds <= 0 || this.dead) return;
    const heal = Math.min(C.medHeal + (this.scene.relicMod?.('medHeal') || 0), this.maxHp - this.hp);   // (Medic's Satchel +10)
    this.hp += heal;
    this.meds -= 1;
    this.medCd = C.medCooldown;
    this.scene.fx.text(this.pos, `+${heal} HP`, { color: '#63c74d', cls: 'big', y: this.vis.userData.vis.height + 0.3 });
    this.scene.fx.burst(this.pos, { color: '#63c74d', color2: '#ffffff', count: 14, speed: 1.6, up: 3, life: 0.6, size: 0.07 });
    this.scene.fx.ring(this.pos, { color: '#63c74d', radius: 1.1, life: 0.4 });
    this.game.sfx.play('med');
  }

  // ---------------------------------------------------------------- deflect, perfect dodge

  /**
   * An attack is about to land (critic I §9A): if the deflect window is open and the attacker (ax, az) is in front
   * of you, turn it away. kind: 'melee' (a lunge: the attacker reels) · 'charge' (you sidestep, the Razorback takes
   * damage and reels) · 'glob' (the caller bats it back) · 'shot' (knocked out of the air). Returns true if deflected.
   */
  tryDeflect(attacker, kind, ax, az) {
    if (!this.deflectOpen) return false;
    const dx = ax - this.pos.x, dz = az - this.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    if ((dx * this.aim.x + dz * this.aim.z) / l < 0) return false;   // only the front half
    const D = DEFLECT, sc = this.scene, fx = sc.fx;
    this.deflectT = 0;
    this.deflectLock = 0;                 // a clean deflect re-arms at once (a double thrust can be deflected twice)
    this.riposteT = D.riposte.time;
    this.guardT = 0.15;                   // the rest of the same blow can't chip you
    this._gain(STAMINA.deflect);
    const cx = this.pos.x + (dx / l) * 0.55, cz = this.pos.z + (dz / l) * 0.55;
    fx.hitStop(D.hitStop);
    fx.ring(this.pos, { color: D.ring, radius: D.ringRadius, life: 0.24 });
    fx.flash({ x: cx, y: 0.75, z: cz }, { color: '#ffffff', size: 0.75, life: 0.09 });
    fx.spark({ x: cx, y: 0.8, z: cz }, { color: D.spark, dir: { x: -dx / l, z: -dz / l }, count: 9, size: 0.5 });
    // One word per deflect (critic I2 #12): creatures add none of their own; a stationary area boss prints PARRIED itself.
    if (!attacker?.stationary) fx.text(this.pos, 'DEFLECT', { color: '#ffffff', cls: 'big', y: this.vis.userData.vis.height + 0.3, life: 0.6, key: 'deflect' });
    flashVisual(this.vis, '#ffffff', 0.1);
    this.game.shake(3, 0.1);
    this.game.flash('#ffffff', 0.1);
    sfx(this.game, 'deflect', 'crack');
    if (kind === 'melee') attacker?.deflected?.('melee');
    else if (kind === 'charge' && attacker) {
      attacker.deflected?.('charge');
      // Step out of the lane, to the side you're already on.
      const ad = attacker.aimDir || { x: -dx / l, z: -dz / l };
      let sx = -ad.z, sz = ad.x;
      if ((this.pos.x - attacker.x) * sx + (this.pos.z - attacker.z) * sz < 0) { sx = -sx; sz = -sz; }
      sc.world.moveBody(this.pos, sx * D.sidestep, sz * D.sidestep, this.r);
    }
    return true;
  }

  /**
   * A near miss (critic I2 #8): an attack is committing now. `inZone(x, z)` says whether a point is inside what it
   * hits; if you started a roll from inside it within ROLL.near s, that's a perfect dodge even though the roll carried
   * you out and nothing touched you.
   */
  nearMiss(inZone) {
    if (this.dead || this.state !== 'roll' || this.perfectUsed || this.stateT > ROLL.near) return;
    if (inZone(this.rollFrom.x, this.rollFrom.z)) this._perfectDodge();
  }

  /** A perfect dodge (ROLL; critic I #7 / I2 #8): stamina back, a beat of slow-mo, a cyan rim. Once per roll. */
  _perfectDodge() {
    if (this.perfectUsed) return;
    this.perfectUsed = true;
    const fx = this.scene.fx;
    this._gain(STAMINA.perfectDodge);
    if (this.kit.dodgeRiposte) this.riposteT = DEFLECT.riposte.time;   // Duelist: the next slash is a riposte
    this.scene.relicPerfectDodge?.();   // relic: Hunter's Fang (full stamina, next hit ×2)
    fx.slowMo(ROLL.slowMo[0], ROLL.slowMo[1]);
    this.rimT = ROLL.rim;
    this.vis.userData.outlineOverride = ROLL.rimColor;
    fx.text(this.pos, 'PERFECT', { color: ROLL.rimColor, cls: 'big', y: this.vis.userData.vis.height + 0.3, life: 0.6, key: 'dodged' });
    fx.ring(this.pos, { color: ROLL.rimColor, radius: 1, life: 0.25 });
    sfx(this.game, 'perfect_dodge', 'charge_ready');
  }

  // ---------------------------------------------------------------- status effects

  /** A Bramble Crawler's bite: bleed for `t` s (STATUS.bleed); a roll stops it. */
  bleed(t) {
    if (this.dead || this.god) return;
    if (this.bleedT <= 0) {
      this.bleedTick = STATUS.bleed.tick;
      this.scene.fx.text(this.pos, 'BLEEDING', { color: STATUS.bleed.color, y: this.vis.userData.vis.height + 0.55, life: 0.8, key: 'status' });
    }
    this.bleedT = Math.max(this.bleedT, t);
  }

  /** The Thorn Stalker's grip: can't walk for `t` s; a roll breaks it. */
  root(t) {
    if (this.dead || this.god) return;
    this.rootT = Math.max(this.rootT, t);
    this.vel.x = this.vel.z = 0;
    this.scene.fx.text(this.pos, 'ROOTED: roll!', { color: '#e4a672', y: this.vis.userData.vis.height + 0.55, life: 0.8, key: 'status' });
  }

  _updateStatus(dt) {
    const fx = this.scene.fx;
    if (this.rootT > 0) {
      this.rootT -= dt;
      if (Math.random() < dt * 10) {
        const a = Math.random() * Math.PI * 2;
        fx.burst({ x: this.pos.x + Math.cos(a) * 0.3, y: 0.05, z: this.pos.z + Math.sin(a) * 0.3 }, { color: STATUS.root.color, color2: '#2a5628', count: 1, speed: 0.3, up: 1.6, life: 0.3, size: 2 / 32, aspect: 2, gravity: 4 });
      }
    }
    if (this.bleedT > 0) {
      this.bleedT -= dt;
      this.bleedTick -= dt;
      if (Math.random() < dt * 6) fx.burst({ x: this.pos.x, y: 0.5, z: this.pos.z }, { color: STATUS.bleed.color, count: 1, speed: 0.3, up: 0.2, life: 0.4, size: 1 / 32, gravity: 6 });
      if (this.bleedTick <= 0) {
        this.bleedTick += STATUS.bleed.tick;
        if (!this.scene.ending && !this.god) {
          const dmg = Math.max(1, Math.round(STATUS.bleed.dps * STATUS.bleed.tick));
          this.hp = Math.max(0, this.hp - dmg);
          this.hurtLog.push({ src: 'Bleeding', how: 'bleed', dmg, swinging: false });
          fx.text(this.pos, `-${dmg}`, { color: STATUS.bleed.color, y: this.vis.userData.vis.height + 0.25, life: 0.5, key: 'bleed', value: dmg, prefix: '-' });
          flashVisual(this.vis, '#ff4040', 0.06);
          if (this.hp <= 0) this._die();
        }
      }
    }
    if (this.sapped && Math.random() < dt * 5) fx.burst({ x: this.pos.x, y: 0.1, z: this.pos.z }, { color: '#b55088', color2: '#68386c', count: 1, speed: 0.4, up: 0.4, life: 0.3, size: 1 / 32, gravity: 5 });
  }

  // ---------------------------------------------------------------- damage

  /**
   * Take damage from a direction. source: who (a creature's name, 'Spores'…); how: the move (EXPLORE_ENEMIES moves:
   * 'lunge', 'thrust2', 'charge', 'stomp', 'spear', 'bolt', 'glob', 'erupt'…) for the wound log (deathNote).
   * Returns true if it landed (false while rolling / invulnerable).
   */
  hurt(dmg, dx = 0, dz = 0, source = '', how = '') {
    if (this.dead) return false;
    if (this.dodging) {
      // Any attack the roll's i-frames absorb is a perfect dodge (once per roll); DODGED shows once per roll, not
      // every frame a beam or a cloud keeps touching you (critic I2 #8, #12).
      if (source) {
        if (!this.perfectUsed) this._perfectDodge();
        else if (!this.dodgedShown) this.scene.fx.text(this.pos, 'DODGED', { color: '#2ce8f5', y: this.vis.userData.vis.height + 0.3, life: 0.5, key: 'dodged' });
        this.dodgedShown = true;
      }
      this.scene.onPerfectDodge?.();
      return false;
    }
    if (this.iframes > 0 || this.guardT > 0 || this.scene.ending || this.god) return false;
    const C = CONFIG.player;
    dmg = Math.max(1, Math.round(dmg * (this.scene.relicMod?.('damageTaken') ?? 1)));   // (relic: Glass Machete +30%)
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = C.hurtIframes;
    this.hurtT = 0.22;
    // Getting hit stops what you were doing (Stage 9, POISE.flinch): a swing, a chop, a charge, a throw, a med kit — and
    // for a beat you can't attack (rolling still works). Trading blows face-to-face costs you the combo.
    const swinging = this.state === 'swing' || this.state === 'chop';
    if (swinging || this.state === 'charge' || this.state === 'throw' || this.state === 'heal') {
      this._enter('free'); this._chargeReady = false; this.chargeT = 0; this.buffer = null; this.combo = 0; this.comboT = 0;
      setAnimSpeed(this.vis, 1);
    }
    this.flinchT = POISE.flinch.time;
    this.hurtLog.push({ src: source || '', how: how || '', dmg, swinging });
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
    if (this.hp <= 0) this._die();
    return true;
  }

  /**
   * What got you (Stage 9): { line, tip, wounds } for the "You went down" screen — the blow that dropped you, what to do
   * about it next time, and today's wounds by cause (biggest first). Null if nothing was logged.
   */
  deathNote() {
    const log = this.hurtLog;
    if (!log.length) return null;
    const last = log[log.length - 1];
    const what = (w) => {
      const name = w.src || 'something';
      const def = Object.values(EXPLORE_ENEMIES).find((d) => d.name === name);
      const an = /^[AEIOU]/.test(name) ? 'an' : 'a';
      const move = { lunge: 'lunge', thrust2: 'second thrust', charge: 'charge', charge2: 'second charge', stomp: 'stomp', spear: 'thrown spear', bolt: 'shot', glob: 'sap glob', erupt: 'ambush', burst: 'burst' }[w.how];
      if (w.how === 'bleed') return 'bleeding';
      if (/spore/i.test(name)) return 'spores';
      if (!def) return `the ${name}`;
      return move ? `${an} ${name}'s ${move}` : `${an} ${name}`;
    };
    const tips = {
      lunge: 'When a creature flashes red it is committed: roll ({roll}), or tap right-click to deflect. Then hit it while it is open.',
      thrust2: 'Ferals often stab twice: after you roll the first, roll the second.',
      charge: 'Step or roll sideways out of a Razorback\'s lane. It stuns itself on trees.',
      charge2: 'An elite Razorback charges twice: stay ready to roll again.',
      stomp: 'Back out of the ring when it rears up.',
      spear: 'A spear flies along its orange line: step sideways when the line locks.',
      bolt: 'Shots follow the orange line: step out of it.',
      glob: 'Leave the pink ring before the sap glob lands.',
      erupt: 'Rustling ferns hide Thorn Stalkers: keep moving, or fight on open ground.',
      burst: 'Chop a Bloater away, or throw your machete from range.',
      bleed: 'A roll stops bleeding.',
      spores: 'Yellow spore clouds hurt: stay out until they thin.',
    };
    const key = last.how === 'bleed' ? 'bleed' : /spore/i.test(last.src) ? 'spores' : /Bloater/.test(last.src) ? 'burst' : last.how;
    const traded = log.filter((w) => w.swinging).length;
    let tip = tips[key] || 'Watch for its tell, get out of the way, then hit it while it is spent.';
    if (traded >= 3 && traded >= log.length / 2) tip = `You were hit ${traded} times mid-swing. Stop swinging when something flashes red, and roll.`;
    const by = new Map();
    for (const w of log) { const k = what({ ...w, how: w.how === 'thrust2' ? 'lunge' : w.how }); by.set(k, (by.get(k) || 0) + w.dmg); }
    const wounds = [...by].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k.replace(/^an? /, '')} ${v}`);
    const keyName = this.game.input?.keyFor ? keyLabel(this.game.input.keyFor('roll')) : 'Space';
    return { line: `Taken down by ${what(last)}.`, tip: tip.replace('{roll}', keyName), wounds };
  }

  _die() {
    if (this.dead) return;
    if (this.scene.relicSave?.(this)) return;   // relic: the Lifeline Idol (1 HP, 1.5 s untouchable, once a day)
    this.dead = true;
    this.deathT = 0;
    this.rootT = this.bleedT = 0;
    this.vis.userData.outlineOverride = null;
    setAnim(this.vis, 'hurt', true);
    setAnimSpeed(this.vis, 1);
    this.scene.onPlayerDeath();
  }

  /**
   * Going down (critic I #12): the hurt flinch, then the roll's crouch, then it crumples into the curled-up roll
   * frame with a dusty thud and a dimmed tint (the scene adds the slow-mo and backs the creatures off).
   */
  _collapse() {
    const v = this.vis, vis = v.userData.vis;
    const t = this.deathT;
    const roll = vis.anims?.roll;
    const stage = t < 0.18 ? 0 : t < 0.4 ? 1 : 2;
    if (stage === 0 || !roll) { setAnim(v, 'hurt'); return; }
    if (this._fallStage === stage) return;
    this._fallStage = stage;
    setAnim(v, 'roll', true);
    setAnimSpeed(v, 0);
    vis.animT = ((stage === 1 ? 1 : 3) + 0.5) / roll.fps;
    if (stage === 2) {
      setBaseColor(v, '#b4aab8');
      this.scene.fx.burst({ x: this.pos.x, y: 0.05, z: this.pos.z }, { color: '#5a4430', color2: '#8f563b', count: 12, speed: 1.6, up: 1, life: 0.5, size: 2 / 32, gravity: 6 });
      this.game.shake(2, 0.1);
    }
  }

  _updateVisual(dt) {
    const v = this.vis;
    v.position.set(this.pos.x, 0, this.pos.z);
    const st = this.state;
    // Walking faces where you walk; standing (or charging) faces the mouse.
    if (this.dead) this._collapse();
    else {
      if (st === 'free' && this.moving && Math.hypot(this.vel.x, this.vel.z) > 0.5) setFacing(v, this.vel.x, this.vel.z);
      else if (st === 'free' || st === 'charge') setFacing(v, this.aim.x, this.aim.z);
      if (st === 'free' || st === 'charge') {
        setAnimSpeed(v, 1);
        if (this.hurtT > 0 && hasAnim(v, 'hurt')) setAnim(v, 'hurt');
        else if (this.moving && this.rootT <= 0) setAnim(v, 'walk');
        else setAnim(v, 'idle');
      }
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
