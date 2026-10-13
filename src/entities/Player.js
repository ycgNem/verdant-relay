// The scavenger (exploration). WASD move · mouse aim · LMB fire · RMB Pulse Cutter · Space dodge ·
// Q med kit. Interaction (E) is handled by ExploreScene because it knows what is interactable.
//
// HP and med kits are read from the Run at the start of an expedition and written back only through
// the expedition result (Run.applyExpedition), so the Run stays the single source of truth.

import * as THREE from 'three';
import { CONFIG, WEAPONS, TOOL } from '../data/config.js';
import { setAnim, setFacing, updateVisual, flashVisual, setOpacity } from '../core/Assets.js';
import { moveCircle, lineOfSight } from '../world/collide.js';

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
    this.weaponKey = WEAPONS[run.weapon] ? run.weapon : 'carbine';
    this.weapon = WEAPONS[this.weaponKey];
    this.aim = { x: 1, z: 0 };
    this.aimPoint = new THREE.Vector3(x + 2, 0, z);
    this.fireCd = 0;
    this.cutCd = 0;
    this.dodgeCd = 0;
    this.dodgeT = 0;
    this.dodgeDir = { x: 1, z: 0 };
    this.iframes = 0;
    this.medCd = 0;
    this.attackT = 0;
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

  get dodging() { return this.dodgeT > 0; }

  _buildReticle() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ead4aa', transparent: true, opacity: 0.85, depthWrite: false, depthTest: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.28, 16), mat);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.16), mat);
      tick.rotation.x = -Math.PI / 2;
      const a = (i * Math.PI) / 2;
      tick.position.set(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
      tick.rotation.z = a + Math.PI / 2;
      g.add(tick);
    }
    g.renderOrder = 10;
    g.children.forEach((c) => { c.renderOrder = 10; });
    this.reticle = g;
    this.reticleMat = mat;
    this.scene.three.add(g);
  }

  update(dt) {
    const C = CONFIG.player;
    const input = this.game.input;
    const sc = this.scene;
    this.fireCd -= dt; this.cutCd -= dt; this.dodgeCd -= dt; this.iframes -= dt;
    this.medCd -= dt; this.attackT -= dt; this.hurtT -= dt;

    // ---- aim: mouse ray onto the bullet plane
    const hit = this.game.mouseOnPlane(sc.camera, C.shotHeight, this._tmp);
    if (hit) {
      this.aimPoint.set(hit.x, 0, hit.z);
      const dx = hit.x - this.pos.x, dz = hit.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) { this.aim.x = dx / len; this.aim.z = dz / len; }
    }

    if (this.dead) { this._updateVisual(dt); return; }

    // ---- movement
    let mx = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    let mz = (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0);
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    this.moving = ml > 0;

    if (input.wasPressed('Space') && this.dodgeCd <= 0) this.startDodge(mx, mz);

    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      this.vel.x = this.dodgeDir.x * C.dodgeSpeed;
      this.vel.z = this.dodgeDir.z * C.dodgeSpeed;
      if (Math.random() < 0.6) sc.fx.burst({ x: this.pos.x, y: -0.35, z: this.pos.z }, { color: '#8b9bb4', count: 1, speed: 0.6, up: 0.6, life: 0.3, size: 0.07 });
      if (this.dodgeT <= 0) { this.vel.x *= 0.35; this.vel.z *= 0.35; }
    } else {
      const tx = mx * C.speed, tz = mz * C.speed;
      const ax = tx - this.vel.x, az = tz - this.vel.z;
      const al = Math.hypot(ax, az), maxA = C.accel * dt;
      if (al > maxA) { this.vel.x += (ax / al) * maxA; this.vel.z += (az / al) * maxA; } else { this.vel.x = tx; this.vel.z = tz; }
    }
    const kd = Math.exp(-10 * dt);
    this.kb.x *= kd; this.kb.z *= kd;
    moveCircle(sc.world, this.pos, (this.vel.x + this.kb.x) * dt, (this.vel.z + this.kb.z) * dt, this.r);

    // ---- weapon
    if (input.mouseHeld(0) && this.fireCd <= 0 && !this.dodging && !sc.blockFire) this.fire();
    // ---- Pulse Cutter
    if ((input.mouseClicked(2) || input.mouseHeld(2)) && this.cutCd <= 0 && !this.dodging && !sc.blockFire) this.cut();
    // ---- med kit
    if (input.wasPressed('KeyQ')) this.useMed();

    this._updateVisual(dt);
  }

  startDodge(mx, mz) {
    const C = CONFIG.player;
    const dir = (mx || mz) ? { x: mx, z: mz } : { x: this.aim.x, z: this.aim.z };
    this.dodgeDir = dir;
    this.dodgeT = C.dodgeDuration;
    this.dodgeCd = C.dodgeCooldown;
    this.iframes = Math.max(this.iframes, C.dodgeDuration);
    this.game.sfx.play('dodge');
    this.scene.fx.burst({ x: this.pos.x, y: -0.35, z: this.pos.z }, { color: '#c0cbdc', count: 6, speed: 1.5, up: 0.8, life: 0.35, size: 0.08 });
    setAnim(this.vis, 'dodge', true);
  }

  /** Aim direction with a light assist toward an enemy close to the aim line. */
  _assistedAim() {
    const C = CONFIG.player;
    const sc = this.scene;
    let best = null, bestA = C.aimAssist;
    const base = Math.atan2(this.aim.z, this.aim.x);
    for (const t of sc.hittables()) {
      if (t.dead || !t.assist) continue;
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > this.weapon.range || d < 0.3) continue;
      let da = Math.atan2(dz, dx) - base;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      // Allow a little more slack up close, where a small angle is a big miss.
      const tol = bestA + Math.min(0.25, (t.radius || 0.3) / d);
      if (Math.abs(da) < tol && lineOfSight(sc.world, this.pos.x, this.pos.z, t.x, t.z)) {
        if (!best || Math.abs(da) < best.da) best = { da: Math.abs(da), a: Math.atan2(dz, dx) };
      }
    }
    return best ? best.a : base;
  }

  fire() {
    const w = this.weapon;
    const sc = this.scene;
    this.fireCd = w.cooldown;
    this.attackT = 0.16;
    setAnim(this.vis, 'attack', true);
    const base = this._assistedAim();
    const n = w.pellets || 1;
    const mx = this.pos.x + Math.cos(base) * 0.45, mz = this.pos.z + Math.sin(base) * 0.45;
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? w.spread * (i / (n - 1) - 0.5) : 0) + (Math.random() - 0.5) * 2 * (w.jitter || 0);
      sc.shots.fire({
        team: 'player', kind: n > 1 ? 'pellet' : 'bullet', x: mx, z: mz, dx: Math.cos(a), dz: Math.sin(a),
        speed: w.speed, range: w.range, damage: w.damage, knockback: w.knockback,
      });
    }
    sc.fx.burst({ x: mx, y: CONFIG.player.shotHeight - 0.4, z: mz }, { color: w.color || '#fee761', color2: '#ffffff', count: 3, speed: 1.2, up: 0.6, life: 0.12, size: 0.07, vx: Math.cos(base) * 2, vz: Math.sin(base) * 2 });
    this.game.sfx.play('shoot');
    if (n > 1) this.game.shake(1.5, 0.08);
    // Small recoil.
    this.kb.x -= Math.cos(base) * (n > 1 ? 1.6 : 0.6);
    this.kb.z -= Math.sin(base) * (n > 1 ? 1.6 : 0.6);
  }

  cut() {
    this.cutCd = TOOL.cooldown;
    this.attackT = 0.2;
    setAnim(this.vis, 'attack', true);
    const a = Math.atan2(this.aim.z, this.aim.x);
    this.scene.cutterSwing(this.pos.x, this.pos.z, a);
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
    this.scene.fx.text(this.pos, `+${heal} HP`, { color: '#63c74d', cls: 'big', y: 1.4 });
    this.scene.fx.burst(this.pos, { color: '#63c74d', color2: '#ffffff', count: 14, speed: 1.6, up: 3, life: 0.6, size: 0.07 });
    this.scene.fx.ring(this.pos, { color: '#63c74d', radius: 1.1, life: 0.4 });
    this.game.sfx.play('pickup');
  }

  /**
   * Take damage from a direction. Returns true if it landed (false while dodging / invulnerable).
   */
  hurt(dmg, dx = 0, dz = 0, source = '') {
    if (this.dead) return false;
    if (this.dodging) {
      if (source && Math.random() < 0.5) this.scene.fx.text(this.pos, 'DODGED', { color: '#2ce8f5', y: 1.5, life: 0.5 });
      return false;
    }
    if (this.iframes > 0 || this.scene.ending || this.god) return false;
    const C = CONFIG.player;
    dmg = Math.max(1, Math.round(dmg));
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = C.hurtIframes;
    this.hurtT = 0.2;
    const l = Math.hypot(dx, dz);
    if (l > 0) { this.kb.x += (dx / l) * C.hurtKnockback; this.kb.z += (dz / l) * C.hurtKnockback; }
    flashVisual(this.vis, '#ff4040', 0.12);
    setAnim(this.vis, 'hurt', true);
    this.game.flash('#e43b44', 0.3);
    this.game.shake(5, 0.2);
    this.game.sfx.play('hurt');
    this.scene.fx.text(this.pos, `-${dmg}`, { color: '#e43b44', cls: 'big', y: 1.4 });
    this.scene.fx.burst(this.pos, { color: '#e43b44', count: 8, speed: 2, up: 2, life: 0.4, size: 0.07 });
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
    setFacing(v, this.aim.x, this.aim.z);
    if (this.dead) setAnim(v, 'hurt');
    else if (this.dodging) setAnim(v, 'dodge');
    else if (this.hurtT > 0) setAnim(v, 'hurt');
    else if (this.attackT > 0) setAnim(v, 'attack');
    else if (this.moving) setAnim(v, 'walk');
    else setAnim(v, 'idle');
    // Dodge squash and a walk bob for the placeholder model.
    const vis = v.userData.vis;
    if (this.dodging) v.scale.set(1.12, 0.82, 1.12);
    else v.scale.set(1, 1, 1);
    if (vis.kind === 'model') {
      this.walkT += this.moving ? dt * 12 : 0;
      vis.body.position.y = this.moving ? Math.abs(Math.sin(this.walkT)) * 0.06 : 0;
    }
    // Invulnerability flicker after a hit (not during a dodge, which has its own squash).
    const flicker = this.iframes > 0 && !this.dodging && !this.dead && Math.floor(this.iframes * 20) % 2 === 0;
    if (flicker !== this._flicker) { this._flicker = flicker; setOpacity(v, flicker ? 0.35 : 1); }
    updateVisual(v, dt);

    this.reticle.position.set(this.aimPoint.x, 0.04, this.aimPoint.z);
    this.reticle.rotation.y += dt * 1.5;
    this.reticle.visible = !this.dead && !this.scene.paused;
  }

  dispose() {
    this.game.assets.disposeVisual(this.vis);
    this.reticle.removeFromParent();
    this.reticle.traverse((o) => { o.geometry?.dispose(); });
    this.reticleMat.dispose();
  }
}
