// A placed tower on a build pad. The persistent record lives in run.towers ({ pad, type, level,
// target, spent }); this class is only its view + combat behaviour for the night.
//
// Stats come from run.towerStats(record, relayFrac) every frame (upgrades, skills and tonight's
// boons applied there), then the scene adds Pulse Beacon buffs (`buffRate`, `bonusChance`).
// Kinds (src/data/towers.js):
//   bullet   homing shot; L3 turret: every 5th shot ×3; thorns: slow on hit, then slow splash
//   chain    instant lightning that jumps to nearby enemies with falloff; L3 slows everything hit
//   mortar   leads its target and lobs a shell; splash with edge falloff; L3 leaves burning sap
//   snare    pulses a slow on everything in range; L3 roots non-bosses (per-enemy cooldown)
//   support  no attack; buffs nearby towers (handled by the scene), pulses a ring for feedback

import * as THREE from 'three';
import { TOWERS } from '../data/towers.js';
import { DEFENSE_MAP } from '../data/defenseMap.js';
import { setAnim, setFacing, updateVisual } from '../core/Assets.js';
import { JUICE } from '../data/config.js';
import { CARD_SCALE } from '../core/PixelView.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Tower {
  constructor(scene, rec) {
    this.scene = scene;
    this.rec = rec;
    this.def = TOWERS[rec.type];
    const [px, py] = DEFENSE_MAP.pads[rec.pad];
    this.pos = new THREE.Vector3(px + 0.5, 0, py + 0.5);
    this.obj = new THREE.Group();
    this.obj.position.copy(this.pos);
    scene.three.add(this.obj);
    this.cd = 0.15 + Math.random() * 0.3;
    this.shots = 0;
    this.attackT = 0;
    this.bonusT = -1;
    this.pulseT = Math.random();
    this.stats = null;
    this.buffRate = 0;
    this.bonusChance = 0;
    this.level = 0;
    this.visual = null;
    this.pips = [];
    // Amber ring shown while a Pulse Beacon boosts this tower (visibility/pulse set by the scene).
    if (this.def.kind !== 'support' && scene.buffRingGeom) {
      this.buffRing = new THREE.Mesh(scene.buffRingGeom, scene.buffRingMat);
      this.buffRing.rotation.x = -Math.PI / 2;
      this.buffRing.position.y = (scene.padBaseY || 0) + 0.06;
      this.buffRing.renderOrder = -1;   // drawn before sprites (the tower stands on its halo)
      this.buffRing.visible = false;
      this.obj.add(this.buffRing);
    }
    this.refreshVisual();
  }

  get kind() { return this.def.kind; }
  get type() { return this.rec.type; }

  /** Rebuild the sprite/model when the level changes (keys scrap_turret, scrap_turret_2, …). */
  refreshVisual() {
    if (this.visual && this.level === this.rec.level) return;
    const scene = this.scene;
    if (this.visual) scene.game.assets.disposeVisual(this.visual);
    for (const p of this.pips) p.removeFromParent();
    this.pips = [];
    this.level = this.rec.level;
    const key = this.level > 1 ? `${this.rec.type}_${this.level}` : this.rec.type;
    this.visual = scene.game.assets.makeVisual(key);
    const vis = this.visual.userData.vis;
    // Placeholder models grow a little per level; real sprites have their own level art.
    if (vis.kind === 'model' && !scene.game.assets.hasSprite(key)) vis.body.scale.setScalar(1 + 0.1 * (this.level - 1));
    this.visual.position.y = scene.padBaseY;
    this.obj.add(this.visual);
    // Level pips along the front edge of the pad.
    for (let i = 0; i < this.level; i++) {
      const pip = new THREE.Mesh(scene.pipGeom, scene.pipMat);
      pip.position.set((i - (this.level - 1) / 2) * 0.2, scene.padBaseY + 0.04, 0.4);
      this.obj.add(pip);
      this.pips.push(pip);
    }
    this.height = Math.max(0.6, vis.height * (vis.kind === 'model' ? 1 + 0.1 * (this.level - 1) : 1));
    this.muzzleY = scene.padBaseY + this.height * 0.72;
    // Rank badge (chevrons) above level 2/3 towers so levels read at night zoom.
    this.badge?.removeFromParent();
    this.badge = null;
    const b = scene.levelBadge?.[this.level];
    if (b) {
      this.badge = new THREE.Sprite(b.mat);
      this.badge.scale.set(b.w / 32, b.h / 32, 1);   // 1 texel = 1 px (32 px per tile)
      this.badge.center.set(0.5, 0);
      this.badge.position.y = scene.padBaseY + this.height + 0.08;
      this.badge.renderOrder = 40;
      this.obj.add(this.badge);
    }
  }

  /** The sprite's drawn muzzle / emitter in world space (JUICE.towerMuzzle; mirrors with facing). */
  muzzle(out = new THREE.Vector3()) {
    const m = JUICE.towerMuzzle[this.rec.type];
    const vis = this.visual?.userData.vis;
    if (!m || !vis || vis.kind !== 'sprite') return out.set(this.pos.x, this.muzzleY, this.pos.z);
    const sx = vis.facingLeft ? -1 : 1;
    return out.set(this.pos.x + sx * (m[0] - 16) / 32, this.scene.padBaseY + (m[1] / 32) * CARD_SCALE, this.pos.z + 0.02);
  }

  /** Muzzle flash matched to the art: a pixel star at the drawn flash + a small light pop. */
  _flash(color, size = 0.34, light = 1.6) {
    const m = this.muzzle(new THREE.Vector3());
    const c = color || JUICE.towerMuzzle[this.rec.type]?.[2] || '#fee761';
    this.scene.fx.flash(m, { color: c, size, life: 0.06 });
    if (light) this.scene.fx.light(m, { color: c, intensity: light, distance: 2.6, life: 0.07 });
  }

  /** Effective seconds between attacks after beacon buffs. */
  get cooldown() { return (this.stats?.cooldown || 1) / (1 + this.buffRate); }

  update(dt, enemies, active) {
    updateVisual(this.visual, dt);
    if (this.attackT > 0) {
      this.attackT -= dt;
      if (this.attackT <= 0) setAnim(this.visual, 'idle');
    }
    const s = this.stats;
    if (!s || !active) return;

    if (s.kind === 'support') {
      this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = 1.6;
        this.scene.fx.ring(this.pos, { color: '#fee761', radius: s.range, life: 0.7, from: 0.3 });
        setAnim(this.visual, 'attack', true);
        this.attackT = 0.4;
      }
      return;
    }

    if (this.bonusT >= 0) {
      this.bonusT -= dt;
      if (this.bonusT < 0) {
        const t = this.pickTarget(enemies, s);
        if (t) {
          this.attack(t, s, enemies);
          this.scene.fx.burst(this.muzzle(_a), { color: '#fee761', count: 4, speed: 1, up: 1.5, life: 0.3, size: 0.05, y: 0 });
        }
      }
    }

    this.cd -= dt;
    if (this.cd > 0) return;
    const target = this.pickTarget(enemies, s);
    if (!target) { this.cd = 0; return; }
    this.attack(target, s, enemies);
    this.cd += this.cooldown;
    if (this.cd < 0) this.cd = 0;
    if (this.bonusChance > 0 && Math.random() < this.bonusChance) this.bonusT = 0.12;
  }

  /** Choose a target in range by this tower's rule (first = nearest the Relay along its lane). */
  pickTarget(enemies, s) {
    const r2 = s.range * s.range;
    const m2 = (s.minRange || 0) * (s.minRange || 0);
    const rule = s.kind === 'snare' ? 'first' : this.rec.target;
    let best = null, bestScore = Infinity;
    for (const e of enemies) {
      if (!e.canBeTargetedBy(s.kind)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2 || d2 < m2) continue;
      const score = rule === 'closest' ? d2 : rule === 'strongest' ? -e.hp : e.remaining;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  attack(target, s, enemies) {
    const scene = this.scene;
    setFacing(this.visual, target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    setAnim(this.visual, 'attack', true);
    this.attackT = 0.28;
    if (s.kind === 'bullet') this._bullet(target, s, enemies);
    else if (s.kind === 'chain') this._chain(target, s, enemies);
    else if (s.kind === 'mortar') this._mortar(target, s);
    else if (s.kind === 'snare') this._snare(s, enemies);
    scene.towerFired(this);
  }

  _bullet(target, s, enemies) {
    const scene = this.scene;
    this.shots += 1;
    const crit = !!s.fifthShotMult && this.shots % 5 === 0;
    const dmg = s.damage * (crit ? s.fifthShotMult : 1);
    const from = this.muzzle(_a);
    this._flash(crit ? '#feae34' : null, crit ? 0.5 : 0.32, crit ? 2.4 : 1.2);
    scene.fx.burst(from, { color: crit ? '#feae34' : '#fee761', count: crit ? 5 : 2, speed: 1.2, up: 0.5, life: 0.12, size: 0.05, y: 0, gravity: 0 });
    if (this.rec.type === 'scrap_turret') scene.game.sfx.play('shoot');
    scene.projectiles.shoot(from, target, {
      speed: s.projSpeed || 14,
      look: crit ? 'crit' : s.proj || 'bullet',
      canHit: (e) => e.canBeTargetedBy('bullet'),
      onHit: (e) => {
        scene.damage(e, dmg, s.damageType, { crit, source: this });
        const hp = e.aimPoint(new THREE.Vector3());
        scene.fx.flash(hp, { color: crit ? '#feae34' : '#ffffff', size: crit ? 0.5 : 0.26, life: 0.05 });
        if (crit) { scene.fx.spark(hp, { color: '#feae34', count: 6 }); scene.game.shake(JUICE.defense.critShake, 0.08); }
        if (s.slowOnHit) {
          e.applySlow(s.slowOnHit, s.slowTime, 'thorn');
          if (s.slowRadius) {
            const r2 = s.slowRadius * s.slowRadius;
            for (const o of enemies) {
              if (o === e || o.dead) continue;
              const dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z;
              if (dx * dx + dz * dz <= r2) o.applySlow(s.slowOnHit, s.slowTime, 'thorn');
            }
            scene.fx.ring(e.pos, { color: '#7d9cff', radius: s.slowRadius, life: 0.25, from: 0.2 });
          }
        }
      },
    });
  }

  _chain(target, s, enemies) {
    const scene = this.scene;
    const hits = [target];
    let cur = target;
    const r2 = s.chainRange * s.chainRange;
    for (let j = 0; j < (s.chains || 0); j++) {
      let next = null, bd = Infinity;
      for (const e of enemies) {
        if (hits.includes(e) || !e.canBeTargetedBy('chain')) continue;
        const dx = e.pos.x - cur.pos.x, dz = e.pos.z - cur.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2 && d2 < bd) { bd = d2; next = e; }
      }
      if (!next) break;
      hits.push(next);
      cur = next;
    }
    let from = this.muzzle(new THREE.Vector3());
    this._flash('#8ff8ff', 0.42, 0);
    const B = JUICE.bolt;
    hits.forEach((e, k) => {
      const to = e.aimPoint(new THREE.Vector3());
      // 2-px pixel bolt (white core) + impact star and a cyan light pop at each link.
      scene.fx.bolt(from, to, { color: k === 0 ? '#2ce8f5' : '#8ff8ff', life: 0.15, jag: 0.4 });
      scene.fx.flash(to, { color: '#2ce8f5', size: 0.38, life: 0.07 });
      if (k === 0) scene.fx.light(to, { color: '#2ce8f5', intensity: B.light, distance: B.lightDist, life: 0.1 });
      scene.fx.burst(to, { color: '#2ce8f5', color2: '#ffffff', count: 3, speed: 1.5, up: 1, life: 0.2, size: 0.05, y: 0 });
      scene.damage(e, s.damage * Math.pow(s.chainFalloff ?? 0.7, k), s.damageType, { source: this });
      if (s.chainSlow) e.applySlow(s.chainSlow, s.slowTime || 0.6, 'arc');
      from = to;
    });
    scene.game.sfx.play('zap');
  }

  _mortar(target, s) {
    const scene = this.scene;
    const aim = target.predict(s.flightTime, new THREE.Vector3());
    aim.y = 0;
    const from = this.muzzle(new THREE.Vector3());
    this._flash('#feae34', 0.36, 1.4);
    scene.fx.burst(from, { color: '#8b9bb4', color2: '#3e8948', count: 5, speed: 1, up: 2, life: 0.35, size: 0.08, y: 0 });
    // Landing marker so the player can read where shells fall. Friendly markers use their own language
    // (dashed amber ring that closes in, no fill), never the filled discs of enemy threats.
    scene.fx.telegraph(aim, { radius: s.blastRadius, color: '#feae34', time: s.flightTime, fade: 0.05, style: 'dashed' });
    scene.projectiles.lob(from, aim, {
      time: s.flightTime,
      height: 3,
      look: 'shell',
      onLand: (p) => {
        const r = s.blastRadius;
        for (const e of scene.enemies) {
          if (e.dead || e.removed || !e.onField) continue;
          const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > r) continue;
          const k = 1 - (1 - (s.blastEdge ?? 0.6)) * (d / r);
          scene.damage(e, s.damage * k, s.damageType, { source: this });
        }
        scene.fx.ring(p, { color: '#feae34', radius: r, life: 0.35 });
        scene.fx.flash({ x: p.x, y: 0.3, z: p.z }, { color: '#f77622', size: 0.8, life: 0.08 });
        scene.fx.light(p, { color: '#f77622', intensity: 2.4, distance: 3.5, life: 0.12 });
        scene.fx.burst(p, { color: '#f77622', color2: '#3e8948', count: 16, speed: 3, up: 3, life: 0.5, size: 0.09, y: 0.05 });
        scene.game.sfx.play('boom');
        // Burning sap is still a blast (so it destroys Seed Carriers' seeds, as the note promises).
        if (s.burnDps) scene.projectiles.zone(p, { radius: r * 0.8, dps: s.burnDps, time: s.burnTime, type: s.damageType });
      },
    });
  }

  _snare(s, enemies) {
    const scene = this.scene;
    const r2 = s.range * s.range;
    const now = scene.waveTime;
    for (const e of enemies) {
      if (!e.canBeTargetedBy('snare')) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      if (dx * dx + dz * dz > r2) continue;
      e.applySlow(s.slowMult, s.slowTime, 'snare');
      if (s.damage) scene.damage(e, s.damage, s.damageType, { silent: true, source: this });
      if (s.rootTime && !e.def.rootImmune && now >= e.rootReady) {
        if (e.applyRoot(s.rootTime)) e.rootReady = now + s.rootCooldown;
      }
      _b.copy(e.pos);
      scene.fx.burst(_b, { color: '#b55088', color2: '#63c74d', count: 3, speed: 0.8, up: 1.6, life: 0.3, size: 0.06, y: 0.05 });
    }
    scene.fx.ring(this.pos, { color: '#b55088', radius: s.range, life: 0.45, from: 0.4 });
  }

  dispose() {
    this.scene.game.assets.disposeVisual(this.visual);
    this.obj.removeFromParent();
  }
}
