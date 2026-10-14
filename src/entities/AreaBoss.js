// Area bosses (critic J M5; tuning in src/data/bosses.js). From night BOSS.fromNight every area whose boss is still
// alive has it in a lair at one of its lost sites (JungleGen `lairs` / bossLair), marked ☠ on the map. Optional:
// walk up to it (BOSS.aggro tiles) and the fight starts — its name and a big HP bar at the top of the HUD, the boss
// music. Walk away (beyond BOSS.leash tiles of the lair for BOSS.leashTime s) and it recovers to full. At
// BOSS.phase2 of its health it roars (a short beat in which it takes little damage) and its moves get nastier.
// The kill: a rare relic (scene.dropRelic; else BOSS.reward.fallback loot), Research (Run.applyExpedition, from
// `killed`), a skill point on top of the trip's, and Run.clearBoss → that area sends no danger at night for the
// rest of the run (persisted in run.bosses, so it never comes back).
//
//   AreaBosses (the scene's manager): lairSites() · inLair(x, z) · build() · update(dt) · hittables(out) ·
//   markers(out) · focus() (camera) · onEnemyKilled(e) · killed[] · dispose()
//   StationaryBoss → ThornMother, BroodHive, Warden, DrownedEngine: sprite strips (idle 0–3, attack 4–5, hurt 6,
//     dead 7), a solid collider, timed moves with ground telegraphs; act(dt) picks the next move.
//   PackLordEnemy: the mobile one — a Feral Chief (ExploreEnemy) with boss health, a war cry and a pack.
// Every move is telegraphed and every hit can be rolled through (Player.hurt ignores i-frames hits).

import * as THREE from 'three';
import { BOSS, BOSSES } from '../data/bosses.js';
import { DISTRICTS, DISTRICT_KEYS } from '../data/districts.js';
import { nightTune, JUICE } from '../data/config.js';
import { SPORES, ATMOS } from '../data/jungle.js';
import { setAnim, updateVisual, setBaseColor, flashVisual } from '../core/Assets.js';
import { bossLair, clearDisc } from '../world/JungleGen.js';
import { FeralChief, setSpeedBuff } from './DayCreatures.js';
import { el } from '../ui/ui.js';
import '../ui/objectives.css';

/** A per-phase value: [phase 1, phase 2] or a plain number. */
const pv = (v, phase) => (Array.isArray(v) ? v[Math.min(v.length, phase) - 1] : v);

/** Positional sound with fallbacks (new names fall back to older ones). */
function sfxAt(game, x, z, ...names) {
  for (const n of names) if (game.sfx.playAt ? game.sfx.playAt(n, x, z) : game.sfx.play(n)) return;
}

// ==================================================================== the manager

export class AreaBosses {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    this.lairs = [];
    this.killed = [];      // area keys killed today (→ the trip result's bossesKilled)
    this.active = null;    // the lair whose fight is on (HUD bar)
    const run = this.game.run, data = scene.data;
    if (!run.bossAlive) return;
    DISTRICT_KEYS.forEach((k, ri) => {
      if (!run.bossAlive(k)) return;
      const si = Array.isArray(data.lairs) ? data.lairs[ri] : bossLair(data, ri);
      const site = data.sites[si];
      if (site) this.lairs.push({ area: k, ri, site, def: BOSSES[k], boss: null, dead: false, away: 0 });
    });
  }

  /** Sites the bosses hold today: goals, bonus tasks and events stay out of them. */
  lairSites() { return this.lairs.map((L) => L.site); }

  /** Is (x, z) inside a living boss's arena? */
  inLair(x, z, pad = 0) { return this.lairs.some((L) => !L.dead && Math.hypot(x - L.site.x, z - L.site.z) < L.site.r + pad); }

  build() {
    const sc = this.scene;
    for (const L of this.lairs) {
      const s = L.site;
      clearDisc(sc.data, s.x, s.z, BOSS.arena + L.def.radius);
      const spot = this._spot(s.x, s.z, L.def.radius + 0.3);
      L.x = spot.x; L.z = spot.z;
      const Kind = KINDS[L.def.kind];
      L.boss = L.def.kind === 'pack_lord' ? new PackLordCtl(this, L) : new (Kind || StationaryBoss)(this, L);
    }
    for (const ch of sc.world.chunks.values()) ch.dirtyCards = true;
  }

  /** An open spot for a body of radius r near (x, z) (the site's centre if it is free). */
  _spot(x, z, r) {
    const w = this.scene.world;
    for (let ring = 0; ring < 8; ring++) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, d = ring * 0.6;
        const px = Math.round((x + Math.cos(a) * d) * 2) / 2, pz = Math.round((z + Math.sin(a) * d) * 2) / 2;
        if (!w.blockedCircle(px, pz, r, true)) return { x: px, z: pz };
        if (!ring) break;
      }
    }
    return { x, z };
  }

  update(dt) {
    const sc = this.scene, pl = sc.player, p = pl.pos;
    for (const L of this.lairs) {
      const b = L.boss;
      if (!b || L.dead) { b?.update?.(dt); continue; }
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (!b.engaged && !sc.ending && !pl.dead && (d < BOSS.aggro || b.provoked)) this._engage(L);
      if (b.engaged) {
        const far = Math.hypot(p.x - L.site.x, p.z - L.site.z) > BOSS.leash;
        L.away = far ? L.away + dt : 0;
        if (L.away > BOSS.leashTime || pl.dead) this._disengage(L, !pl.dead);
      }
      if (d < 44 || b.engaged) b.update(dt);
    }
    this._updateBar(dt);
  }

  _engage(L) {
    const b = L.boss, sc = this.scene;
    if (b.engaged || L.dead) return;
    b.engaged = true;
    b.provoked = false;
    L.away = 0;
    this.active = L;
    b.onEngage?.();
    sc._banner(L.def.name.toUpperCase(), L.def.intro);
    if (!this._toldReward) {
      this._toldReward = true;
      sc.later(3.2, () => sc.toast(`Kill it and the ${DISTRICTS[L.area].name} sends no danger at night for the rest of the run`, 'amber', 4));
    }
    sfxAt(this.game, b.x, b.z, `boss_wake_${L.def.kind}`, 'boss_roar', 'boss_cue');
    this.game.shake(4, 0.3);
    this.game.music?.play('lair');
  }

  _disengage(L, recover = true) {
    const b = L.boss, sc = this.scene;
    b.engaged = false;
    L.away = 0;
    if (this.active === L) this.active = null;
    if (recover) {
      b.reset();
      sc.toast(`You left the ${L.def.name}: it recovers`, 'amber', 3);
    }
    if (!sc.ending) this.game.music?.play(sc.duskK > 0 ? 'dusk' : 'day');
  }

  /** A boss is dead: the rewards, the area's danger lifted for the run. */
  onKilled(L) {
    if (L.dead) return;
    L.dead = true;
    const sc = this.scene, run = this.game.run, b = L.boss;
    const x = b.x, z = b.z;
    run.clearBoss?.(L.area);
    this.killed.push(L.area);
    if (this.active === L) this.active = null;
    sc._grantSkillPoint?.({ boss: true });
    // The rare relic (relics stream), else a pile of parts.
    const drop = sc.dropRelic?.(x, z, { rarity: BOSS.reward.relic });
    if (!drop) sc._spill(BOSS.reward.fallback, x, z, true);
    sc._banner(`${L.def.name.toUpperCase()} KILLED`, `The ${DISTRICTS[L.area].name} sends no danger at night for the rest of the run`);
    sc.later(1.2, () => sc.toast(`+${BOSS.reward.research} Research when the day ends · +1 skill point`, 'good', 3.5));
    sc.fx.slowMo?.(JUICE.slowmo?.bossDeath?.time ?? 0.6, JUICE.slowmo?.bossDeath?.scale ?? 0.3);
    sc.fx.hitStop(JUICE.hitStop.bossDeath ?? 0.14);
    this.game.shake(10, 0.6);
    this.game.flash('#ffffff', 0.3);
    sfxAt(this.game, x, z, `boss_death_${L.def.kind}`, 'boss_die', 'death_big');
    if (!sc.ending) this.game.music?.play(sc.duskK > 0 ? 'dusk' : 'day');
  }

  /** The machete / thrown blade can hit the stationary bosses (the Pack Lord is an ordinary creature). */
  hittables(out) {
    for (const L of this.lairs) {
      const b = L.boss;
      if (!b || L.dead || !b.stationary) continue;
      out.push({ x: b.x, z: b.z, radius: b.radius, dead: false, boss: true, hit: (dmg, dx, dz, kb, src) => b.hurt(dmg, dx, dz, src) });
    }
    return out;
  }

  /** While a fight is on: a point for the camera to lean toward (JungleScene._placeCamera), or null. */
  focus() {
    const L = this.active, p = this.scene.player.pos;
    if (!L || L.dead || !L.boss?.engaged) return null;
    const b = L.boss;
    if (Math.hypot(b.x - p.x, b.z - p.z) > BOSS.camRange) return null;
    return { x: b.x, z: b.z, k: BOSS.camPull };
  }

  markers(out) {
    for (const L of this.lairs) if (!L.dead) out.push({ x: L.boss?.homeX ?? L.x ?? L.site.x, z: L.boss?.homeZ ?? L.z ?? L.site.z, type: 'boss' });
    return out;
  }

  onEnemyKilled(e) {
    if (e.lordOf) this.onKilled(e.lordOf);
  }

  // ------------------------------------------------------------------ the HUD bar

  _updateBar(dt) {
    const L = this.active && !this.active.dead ? this.active : null;
    const hud = this.scene.hud;
    if (!L) {
      if (this.bar) { this.bar.root.style.display = 'none'; this.bar.L = null; }
      return;
    }
    if (!this.bar && hud?.root) {
      const fill = el('div.bb-fill'), lag = el('div.bb-lag'), mark = el('div.bb-mark', { style: { left: `${BOSS.phase2 * 100}%` } });
      const name = el('div.bb-name'), sub = el('div.bb-sub');
      const root = el('div.j-bossbar', {}, name, el('div.bb-track', {}, lag, fill, mark), sub);
      hud.root.append(root);
      this.bar = { root, fill, lag, name, sub, lagF: 1, key: '' };
    }
    const B = this.bar;
    if (!B) return;
    const b = L.boss;
    if (B.L !== L) { B.L = L; B.name.textContent = L.def.name.toUpperCase(); B.lagF = b.hp / b.maxHp; }
    B.root.style.display = '';
    const f = Math.max(0, b.hp / b.maxHp);
    B.lagF = Math.max(f, B.lagF - dt * 0.35);
    B.fill.style.width = `calc(${(f * 100).toFixed(2)}% - var(--u) * 2)`;
    B.lag.style.width = `calc(${(B.lagF * 100).toFixed(2)}% - var(--u) * 2)`;
    const note = b.barNote?.() || (b.phase === 2 ? 'Enraged' : '');
    const cls = `j-bossbar${b.phase === 2 ? ' p2' : ''}${b.shielded?.() ? ' shield' : ''}`;
    if (B.key !== `${cls}|${note}`) { B.key = `${cls}|${note}`; B.root.className = cls; B.sub.textContent = note; }
  }

  dispose() {
    for (const L of this.lairs) L.boss?.dispose?.();
    this.bar?.root.remove();
  }
}

// ==================================================================== stationary bosses

class StationaryBoss {
  constructor(mgr, L) {
    this.mgr = mgr;
    this.L = L;
    this.scene = mgr.scene;
    this.game = mgr.game;
    this.def = L.def;
    this.stationary = true;
    this.x = this.homeX = L.x;
    this.z = this.homeZ = L.z;
    this.radius = L.def.radius;
    const night = this.game.run.night;
    this.dmgK = nightTune('enemyDamage', night);
    this.maxHp = Math.round(BOSS.hp * nightTune('eliteHp', night));
    this.hp = this.maxHp;
    this.phase = 1;
    this.engaged = false;
    this.dead = false;
    this.cd = {};
    this.sched = [];
    this.lobs = [];
    this.teles = [];
    this.minions = [];
    this.hurtT = 0; this.atkT = 0; this.roarT = 0; this._dt = 0;
    this.vis = this.game.assets.makeVisual(L.def.sprite, {
      ring: JUICE.hostileRingJungle || JUICE.hostileRing?.color || '#a22633',
      silhouette: ATMOS.silhouette.enemyDim, silhouetteSkipsMask: true,
    });
    this.vis.position.set(this.x, 0, this.z);
    setAnim(this.vis, 'idle');
    this.scene.three.add(this.vis);
    this.col = this.scene.world.addCollider({ x: this.x, z: this.z, r: this.radius * 0.8 });
  }

  get p() { return this.scene.player; }
  dist() { const p = this.p.pos; return Math.hypot(p.x - this.x, p.z - this.z); }
  aimAt() { const p = this.p.pos; return Math.atan2(p.z - this.z, p.x - this.x); }

  /** Damage multiplier on blows it takes (the Brood Hive's shield). */
  damageTaken() { return 1; }

  hurt(dmg, dx, dz, src) {
    if (this.dead) return;
    if (!this.engaged) this.provoked = true;
    let k = this.damageTaken();
    if (this.roarT > 0) k *= BOSS.roarTaken;
    dmg = Math.max(1, Math.round(dmg * k));
    this.hp -= dmg;
    const fx = this.scene.fx, h = this.vis.userData.vis.height;
    fx.hitFlash(this.vis, JUICE.melee?.whiteFlash ?? 0.08);
    fx.text({ x: this.x, z: this.z }, String(dmg), { color: k < 0.7 ? '#8b9bb4' : '#feae34', cls: 'elite', y: h + 0.4, life: 0.6, key: this, value: dmg });
    fx.burst({ x: this.x - (dx || 0) * this.radius * 0.6, y: h * 0.4, z: this.z - (dz || 0) * this.radius * 0.6 }, { color: this.def.blood || '#7f9a3c', color2: '#ead4aa', count: 7, speed: 2.4, up: 1.8, life: 0.35, size: 2 / 32 });
    if (k < 0.7 && Math.random() < 0.5) fx.text({ x: this.x, z: this.z }, 'SHIELDED', { color: '#8b9bb4', y: h + 0.8, life: 0.6, key: 'shield' });
    this.game.sfx.playAt('hit', this.x, this.z);
    if (this.atkT <= 0) this.hurtT = BOSS.hurtFrame;
    if (this.hp <= 0) this._die();
    else if (this.phase === 1 && this.hp <= this.maxHp * BOSS.phase2) this._phase2();
  }

  /** A deflected whip / lunge: it reels for a beat (all its moves wait). */
  deflected() {
    for (const k of Object.keys(this.cd)) this.cd[k] += 1;
    this.scene.fx.text({ x: this.x, z: this.z }, 'PARRIED', { color: '#ffffff', cls: 'big', y: this.vis.userData.vis.height + 0.3, life: 0.7 });
  }

  _phase2() {
    this.phase = 2;
    this.roarT = BOSS.roar;
    setBaseColor(this.vis, BOSS.tint2);
    const fx = this.scene.fx;
    fx.ring({ x: this.x, z: this.z }, { color: '#ff0044', radius: 4, life: 0.6 });
    fx.burst({ x: this.x, y: 1, z: this.z }, { color: '#ff0044', color2: '#feae34', count: 30, speed: 3.5, up: 3, life: 0.7, size: 2 / 32 });
    this.game.shake(8, 0.5);
    sfxAt(this.game, this.x, this.z, 'boss_phase2', 'boss_roar'); sfxAt(this.game, this.x, this.z, `boss_wake_${this.def.kind}`);
    this.scene.toast(`The ${this.def.name} is enraged!`, 'bad', 2.6);
    this.atkT = 0.35;
    this.onPhase2?.();
  }

  _die() {
    this.dead = true;
    this.hp = 0;
    for (const t of this.teles) t.cancel?.();
    this.teles = [];
    this.sched = [];
    this.endMoves?.();
    for (const l of this.lobs) this.game.assets.disposeVisual(l.vis);
    this.lobs = [];
    setBaseColor(this.vis, '#ffffff');
    setAnim(this.vis, 'dead', true);
    this.vis.userData.alert = false;
    const fx = this.scene.fx, h = this.vis.userData.vis.height;
    fx.burst({ x: this.x, y: h * 0.4, z: this.z }, { color: this.def.blood || '#7f9a3c', color2: '#ffffff', count: 50, speed: 4.5, up: 4, life: 0.9, size: 3 / 32 });
    fx.ring({ x: this.x, z: this.z }, { color: '#feae34', radius: 4.5, life: 0.7 });
    fx.decal({ x: this.x, z: this.z }, { color: '#3a2a20', radius: 1.6, life: 30 });
    this.mgr.onKilled(this.L);
  }

  /** Walked away: back to full health and phase 1, nothing pending. */
  reset() {
    this.hp = this.maxHp;
    this.phase = 1;
    this.roarT = 0;
    this.cd = {};
    for (const t of this.teles) t.cancel?.();
    this.teles = [];
    this.sched = [];
    this.endMoves?.();
    setBaseColor(this.vis, '#ffffff');
  }

  /** True `every` s apart (with a little jitter); the first time after a short delay. */
  ready(name, every) {
    if (this.cd[name] == null) this.cd[name] = every * (0.35 + Math.random() * 0.35);
    this.cd[name] -= this._dt;
    if (this.cd[name] > 0) return false;
    this.cd[name] = every * (0.85 + Math.random() * 0.3);
    return true;
  }

  later(t, fn) { this.sched.push({ t, fn }); }
  playAttack(t = 0.32) { this.atkT = t; this.hurtT = 0; }

  /** Ring telegraph at (x, z), then fn() when it commits. */
  ringAt(x, z, radius, time, color, color2, fn) {
    this.teles.push(this.scene.fx.ringTele({ x, z }, { radius, color, color2, time, fade: 0.08 }));
    this.later(time, fn);
  }

  /** Hit the player if they stand within r of (x, z). Returns true if it landed. */
  hitCircle(x, z, r, dmg, knock = 0) {
    const p = this.p;
    const dx = p.pos.x - x, dz = p.pos.z - z, d = Math.hypot(dx, dz) || 1e-4;
    if (p.dead || d > r + p.r * 0.5) return false;
    const ok = p.hurt(Math.round(dmg * this.dmgK), dx / d, dz / d, this.def.name);
    if (ok && knock) { p.kb.x += (dx / d) * knock; p.kb.z += (dz / d) * knock; }
    return ok;
  }

  /** Hit the player if they stand within a lane from (x, z) along dir, `len` long and `width` wide. */
  hitLane(x, z, dir, len, width, dmg, knock = 0, deflectable = false) {
    const p = this.p;
    const rx = p.pos.x - x, rz = p.pos.z - z;
    const along = rx * dir.x + rz * dir.z, perp = Math.abs(rx * -dir.z + rz * dir.x);
    if (p.dead || along < -0.3 || along > len + p.r || perp > width / 2 + p.r * 0.5) return false;
    if (deflectable && p.tryDeflect?.(this, 'melee', this.x, this.z)) return false;
    const ok = p.hurt(Math.round(dmg * this.dmgK), dir.x, dir.z, this.def.name);
    if (ok && knock) { p.kb.x += dir.x * knock; p.kb.z += dir.z * knock; }
    return ok;
  }

  /** Lob a sprite from the boss to (tx, tz) over `time` s; onLand(x, z) when it lands. */
  lob(key, tx, tz, time, onLand, tint) {
    const vis = this.game.assets.makeVisual(key, { shadow: false, emissive: false });
    if (tint) setBaseColor(vis, tint);
    setAnim(vis, 'idle');
    const y0 = this.vis.userData.vis.height * 0.5;
    vis.position.set(this.x, y0, this.z);
    this.scene.three.add(vis);
    this.lobs.push({ vis, x0: this.x, z0: this.z, x1: tx, z1: tz, t: 0, time, y0, apex: 1.6 + Math.hypot(tx - this.x, tz - this.z) * 0.18, onLand });
  }

  /** Spawn a minion near the boss (alerted, emerging). */
  spawnMinion(type, r0 = 1, r1 = 2.4, tint) {
    const sc = this.scene;
    const p = sc._openSpot?.(this.x, this.z, this.radius + r0, this.radius + r1);
    if (!p) return null;
    const e = sc.spawnEnemy(type, p.x, p.z, { spawnIn: true, alerted: true });
    if (tint && e.vis) setBaseColor(e.vis, tint);
    this.minions.push(e);
    return e;
  }

  liveMinions() { this.minions = this.minions.filter((e) => !e.dead); return this.minions.length; }

  update(dt) {
    this._dt = dt;
    for (let i = this.sched.length - 1; i >= 0; i--) {
      const s = this.sched[i];
      s.t -= dt;
      if (s.t <= 0) { this.sched.splice(i, 1); if (!this.dead) s.fn(); }
    }
    for (let i = this.lobs.length - 1; i >= 0; i--) {
      const l = this.lobs[i];
      l.t += dt;
      const k = Math.min(1, l.t / l.time);
      l.vis.position.set(l.x0 + (l.x1 - l.x0) * k, l.y0 * (1 - k) + Math.sin(k * Math.PI) * l.apex, l.z0 + (l.z1 - l.z0) * k);
      updateVisual(l.vis, dt);
      if (k >= 1) { this.lobs.splice(i, 1); this.game.assets.disposeVisual(l.vis); if (!this.dead) l.onLand(l.x1, l.z1); }
    }
    this.hurtT -= dt; this.atkT -= dt; this.roarT -= dt;
    if (!this.dead) {
      this.moves?.(dt);
      const busy = this.scene.ending || this.p.dead;
      if (this.engaged && this.roarT <= 0 && !busy) this.act(dt);
      this.vis.userData.alert = this.engaged;
      const want = this.atkT > 0 ? 'attack' : this.hurtT > 0 ? 'hurt' : 'idle';
      if (want !== this._anim) { setAnim(this.vis, want, true); this._anim = want; }
      if (this.roarT > 0 && Math.random() < dt * 20) this.scene.fx.burst({ x: this.x, y: 0.2, z: this.z }, { color: '#ff0044', count: 1, speed: 2.5, up: 2, life: 0.4, size: 2 / 32 });
    }
    updateVisual(this.vis, dt);
  }

  act() {}

  dispose() {
    for (const t of this.teles) t.cancel?.();
    this.endMoves?.();
    for (const l of this.lobs) this.game.assets.disposeVisual(l.vis);
    this.game.assets.disposeVisual(this.vis);
  }
}

// ------------------------------------------------------------------ Thorn Mother (Canopy Greenhouse)

class ThornMother extends StationaryBoss {
  constructor(mgr, L) { super(mgr, L); this.def = { ...this.def, blood: '#7f9a3c' }; }

  act() {
    const D = this.def, ph = this.phase, dist = this.dist();
    if (dist < D.whip.range + 0.5 && this.ready('whip', pv(D.whip.every, ph))) this.whip();
    else if (dist < D.barrage.range && this.ready('barrage', pv(D.barrage.every, ph))) this.barrage();
    if (ph === 2 && this.liveMinions() < D.brood.max && this.ready('brood', D.brood.every)) this.spawnMinion(D.brood.type);
  }

  onPhase2() { for (let i = 0; i < this.def.brood.at2; i++) this.spawnMinion(this.def.brood.type); }

  /** Vine lanes toward you (a fan of them in phase 2): deflectable. */
  whip() {
    const W = this.def.whip, n = pv(W.fan, this.phase), base = this.aimAt();
    this.playAttack(W.windup + 0.2);
    sfxAt(this.game, this.x, this.z, 'vine_whip_windup', 'windup');
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * W.spread;
      const dir = { x: Math.cos(a), z: Math.sin(a) };
      const ox = this.x + dir.x * this.radius * 0.5, oz = this.z + dir.z * this.radius * 0.5;
      this.teles.push(this.scene.fx.telegraph({ x: ox, z: oz }, { dir, length: W.range, width: W.width, color: '#ff0044', time: W.windup, fade: 0.1 }));
      this.later(W.windup, () => {
        const fx = this.scene.fx;
        fx.bolt(new THREE.Vector3(ox, 0.35, oz), new THREE.Vector3(ox + dir.x * W.range, 0.2, oz + dir.z * W.range), { color: '#4b8139', width: 3 / 32, core: 1 / 32, jag: 0.25, life: 0.18 });
        for (let s = 0.6; s < W.range; s += 0.9) fx.burst({ x: ox + dir.x * s, y: 0.2, z: oz + dir.z * s }, { color: '#2a5628', color2: '#c23a3a', count: 2, speed: 1.4, up: 1.4, life: 0.35, size: 2 / 32 });
        this.hitLane(ox, oz, dir, W.range, W.width, W.damage, W.knock, true);
        sfxAt(this.game, ox + dir.x * W.range * 0.5, oz + dir.z * W.range * 0.5, 'vine_whip', 'crack');
      });
    }
  }

  /** Spore pods lobbed round you: each lands in a ring; the first few leave a spore cloud. */
  barrage() {
    const B = this.def.barrage, n = pv(B.count, this.phase), clouds = pv(B.clouds, this.phase);
    const p = this.p, v = p.vel || { x: 0, z: 0 };
    this.playAttack(0.5);
    sfxAt(this.game, this.x, this.z, 'spore_barrage', 'lob');
    for (let i = 0; i < n; i++) {
      let x = p.pos.x + v.x * B.fuse * 0.5, z = p.pos.z + v.z * B.fuse * 0.5;
      if (i > 0) { const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * (B.spread - 1.2); x += Math.cos(a) * r; z += Math.sin(a) * r; }
      const cloud = i < clouds;
      this.teles.push(this.scene.fx.ringTele({ x, z }, { radius: B.radius, color: SPORES.color, color2: '#7f9a3c', time: B.fuse, fade: 0.06 }));
      this.lob('spore_pod', x, z, B.fuse, (lx, lz) => {
        this.scene.fx.burst({ x: lx, y: 0.3, z: lz }, { color: SPORES.color, color2: SPORES.color2, count: 14, speed: 2.4, up: 2, life: 0.5, size: 2 / 32 });
        this.hitCircle(lx, lz, B.radius, B.damage, 3);
        if (cloud) this.scene.spores?.cloudAt?.(lx, lz);
        else this.game.sfx.playAt('spore_burst', lx, lz);
      });
    }
  }
}

// ------------------------------------------------------------------ Brood Hive (Overgrown Market)

class BroodHive extends StationaryBoss {
  constructor(mgr, L) { super(mgr, L); this.def = { ...this.def, blood: '#b55088' }; this.shieldT = 0; }

  damageTaken() { const S = this.def.shield; return 1 - Math.min(S.max, this.liveMinions() * S.per); }
  shielded() { return this.engaged && this.liveMinions() > 0; }
  barNote() {
    const n = this.liveMinions();
    if (!n) return this.phase === 2 ? 'Enraged' : '';
    return `Brood shield: it takes ${Math.round((1 - this.damageTaken()) * 100)}% less damage. Kill the Crawlers`;
  }

  act(dt) {
    const D = this.def, ph = this.phase, dist = this.dist();
    if (this.liveMinions() < pv(D.spawn.max, ph) && this.ready('spawn', pv(D.spawn.every, ph))) {
      this.playAttack();
      this.spawnMinion(D.spawn.type);
      sfxAt(this.game, this.x, this.z, 'hive_spawn', 'nest_burst');
    }
    if (dist < D.burst.radius + 3 && this.ready('burst', pv(D.burst.every, ph))) this.burst();
    if (ph === 2 && dist < D.eggs.range && this.ready('eggs', D.eggs.every)) this.eggs();
    // The shield shows: a pale ring pulses round the hive while its brood lives.
    this.shieldT -= dt;
    if (this.shieldT <= 0 && this.shielded()) { this.shieldT = 0.9; this.scene.fx.ring({ x: this.x, z: this.z }, { color: '#8b9bb4', radius: this.radius + 0.5, life: 0.5 }); }
  }

  onPhase2() {
    for (let i = 0; i < this.def.spawn.at2; i++) this.spawnMinion(this.def.spawn.type);
    this.scene.toast('The hive splits open: more brood!', 'bad', 2.4);
  }

  /** An egg burst round the hive: get out of the ring. Phase 2 hatches Skitters. */
  burst() {
    const B = this.def.burst;
    this.playAttack(B.windup + 0.3);
    sfxAt(this.game, this.x, this.z, 'hive_swell', 'windup');
    this.ringAt(this.x, this.z, B.radius, B.windup, '#ff0044', '#b55088', () => {
      const fx = this.scene.fx;
      fx.burst({ x: this.x, y: 0.5, z: this.z }, { color: '#b55088', color2: '#feae34', count: 40, speed: 4.5, up: 3, life: 0.6, size: 2 / 32 });
      fx.ring({ x: this.x, z: this.z }, { color: '#feae34', radius: B.radius, life: 0.35 });
      this.game.shake(5, 0.25);
      sfxAt(this.game, this.x, this.z, 'egg_burst', 'nest_burst');
      this.hitCircle(this.x, this.z, B.radius, B.damage, B.knock);
      if (this.phase === 2) for (let i = 0; i < B.hatch2.n; i++) this.spawnMinion(B.hatch2.type, 0.8, 2.6);
    });
  }

  /** Egg sacs lobbed at you; each hatches a Skitter where it lands. */
  eggs() {
    const E = this.def.eggs, p = this.p;
    this.playAttack(0.4);
    sfxAt(this.game, this.x, this.z, 'egg_lob');
    for (let i = 0; i < E.n; i++) {
      const a = Math.random() * Math.PI * 2, r = i ? 1 + Math.random() * 1.8 : 0;
      const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
      this.teles.push(this.scene.fx.ringTele({ x, z }, { radius: E.radius, color: '#ff4d8d', color2: '#b55088', time: E.fuse, fade: 0.05 }));
      this.lob('spore_pod', x, z, E.fuse, (lx, lz) => {
        this.hitCircle(lx, lz, E.radius, E.damage, 2);
        this.scene.fx.burst({ x: lx, y: 0.3, z: lz }, { color: '#b55088', color2: '#ead4aa', count: 10, speed: 2, up: 2, life: 0.4, size: 2 / 32 });
        const e = this.scene.spawnEnemy(E.hatch, lx, lz, { spawnIn: true, alerted: true });
        sfxAt(this.game, lx, lz, 'egg_hatch');
        this.minions.push(e);
      }, '#e890c0');
    }
  }
}

// ------------------------------------------------------------------ Security Warden (Municipal Data Center)

class Warden extends StationaryBoss {
  constructor(mgr, L) { super(mgr, L); this.def = { ...this.def, blood: '#8b9bb4' }; this.beams = []; }

  act() {
    const D = this.def, ph = this.phase;
    if (this.beams.length) return;   // while the laser sweeps, nothing else
    if (this.dist() < D.stomp.range && this.ready('stomp', D.stomp.cooldown)) this.stomp();
    else if (this.dist() < D.laser.length + 3 && this.ready('laser', pv(D.laser.every, ph))) this.laser();
    if (ph === 2 && this.liveMinions() < D.drones.max && this.ready('drones', D.drones.every)) {
      for (let i = 0; i < D.drones.n; i++) this.spawnMinion(D.drones.type, 1, 3, D.drones.tint);
      sfxAt(this.game, this.x, this.z, 'drones_deploy', 'alarm');
      this.scene.toast('Security drones!', 'bad', 2);
    }
  }

  stomp() {
    const S = this.def.stomp;
    this.playAttack(S.windup + 0.2);
    sfxAt(this.game, this.x, this.z, 'stomp_windup', 'windup');
    this.ringAt(this.x, this.z, S.radius, S.windup, '#ff0044', '#feae34', () => {
      this.scene.fx.ring({ x: this.x, z: this.z }, { color: '#feae34', radius: S.radius, life: 0.3 });
      this.scene.fx.crack?.({ x: this.x, z: this.z });
      this.game.shake(5, 0.25);
      sfxAt(this.game, this.x, this.z, 'warden_stomp', 'crash');
      this.hitCircle(this.x, this.z, S.radius, S.damage, S.knock);
    });
  }

  /**
   * The laser: a thin aiming line for `warn` s, then the beam sweeps `sweep`° (through where you stood) at `speed`°/s.
   * Phase 2: a second beam on the opposite side. A roll's i-frames carry you through it.
   */
  laser() {
    const Lz = this.def.laser, n = pv(Lz.beams, this.phase);
    const aim = this.aimAt(), sign = Math.random() < 0.5 ? -1 : 1;
    const half = ((Lz.sweep / 2) * Math.PI) / 180;
    this.playAttack(Lz.warn);
    sfxAt(this.game, this.x, this.z, 'laser_charge', 'alarm');
    for (let i = 0; i < n; i++) {
      const a0 = aim - sign * half + i * Math.PI;
      this.beams.push({ a: a0, end: a0 + sign * 2 * half, sign, t: -Lz.warn, meshes: this._beamMeshes(), hitT: 0 });
    }
  }

  _beamMeshes() {
    const Lz = this.def.laser;
    const mk = (w, color, order) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false }));
      m.rotation.order = 'YXZ';
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = order;
      m.userData.w = w;
      this.scene.three.add(m);
      return m;
    };
    return [mk(Lz.width, Lz.color, 26), mk(Lz.width * 0.4, Lz.core, 27)];
  }

  _placeBeam(b, live) {
    const Lz = this.def.laser;
    const dir = { x: Math.cos(b.a), z: Math.sin(b.a) };
    const len = Lz.length;
    for (const m of b.meshes) {
      const w = live ? m.userData.w : 2 / 32;
      m.scale.set(w, len, 1);
      m.rotation.y = Math.atan2(-dir.x, -dir.z);
      m.position.set(this.x + dir.x * (len / 2 + 0.3), 0.06, this.z + dir.z * (len / 2 + 0.3));
      m.material.opacity = live ? 0.95 : (Math.floor(b.t * 16) % 2 ? 0.85 : 0.35);
      m.visible = live || m === b.meshes[0];
    }
    return dir;
  }

  moves(dt) {
    const Lz = this.def.laser;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      if (b.t < 0) { this._placeBeam(b, false); continue; }
      const step = ((Lz.speed * Math.PI) / 180) * dt * b.sign;
      b.a += step;
      const done = b.sign > 0 ? b.a >= b.end : b.a <= b.end;
      const dir = this._placeBeam(b, true);
      if (Math.random() < dt * 30) this.scene.fx.burst({ x: this.x + dir.x * Lz.length, y: 0.1, z: this.z + dir.z * Lz.length }, { color: '#ff6a3d', color2: '#fee761', count: 2, speed: 1.6, up: 1.5, life: 0.3, size: 2 / 32 });
      b.hitT -= dt;
      if (b.hitT <= 0 && this.hitLane(this.x, this.z, dir, Lz.length + 0.3, Lz.width, Lz.damage, 4)) b.hitT = 0.5;
      if (Math.random() < dt * 6) sfxAt(this.game, this.x + dir.x * Lz.length * 0.5, this.z + dir.z * Lz.length * 0.5, 'laser_sweep', 'zap');
      if (done) { for (const m of b.meshes) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } this.beams.splice(i, 1); }
    }
  }

  endMoves() {
    for (const b of this.beams) for (const m of b.meshes) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    this.beams = [];
  }
}

// ------------------------------------------------------------------ Drowned Engine (Flooded Transit Station)

class DrownedEngine extends StationaryBoss {
  constructor(mgr, L) { super(mgr, L); this.def = { ...this.def, blood: '#5f9a86' }; this.waves = []; }

  act() {
    const D = this.def, ph = this.phase, dist = this.dist();
    if (dist < D.blast.range && this.ready('blast', D.blast.cooldown)) this.blast();
    else if (dist < D.surge.length && this.ready('surge', pv(D.surge.every, ph))) this.surge();
    else if (dist < D.vents.range && this.ready('vents', pv(D.vents.every, ph))) this.vents();
  }

  _steam(x, z, n = 10) {
    this.scene.fx.burst({ x, y: 0.1, z }, { color: '#e8f0f4', color2: '#9fb8c8', count: n, speed: 1.4, up: 4, life: 0.8, size: 3 / 32, gravity: -1.5, drag: 1.5 });
  }

  /** Steam vents: rings under you (and round you); stand clear before they blow. */
  vents() {
    const V = this.def.vents, n = pv(V.n, this.phase), p = this.p, v = p.vel || { x: 0, z: 0 };
    this.playAttack(0.4);
    sfxAt(this.game, this.x, this.z, 'steam_build', 'windup');
    for (let i = 0; i < n; i++) {
      let x = p.pos.x + v.x * V.windup * 0.4, z = p.pos.z + v.z * V.windup * 0.4;
      if (i > 0) { const a = Math.random() * Math.PI * 2, r = 1.4 + Math.random() * (V.spread - 1.4); x += Math.cos(a) * r; z += Math.sin(a) * r; }
      if (this.scene.world.blockedAt(Math.floor(x), Math.floor(z), true)) continue;
      this.later(Math.random() * 0.25, () => {
        this.ringAt(x, z, V.radius, V.windup, '#e8f0f4', '#5f9a86', () => {
          this._steam(x, z, 14);
          this.game.sfx.playAt('steam_vent', x, z);
          this.hitCircle(x, z, V.radius, V.damage, 3);
        });
      });
    }
  }

  /** The surge: a water lane toward you, then a wave rolls down it. Phase 2: two lanes. */
  surge() {
    const S = this.def.surge, n = pv(S.lanes, this.phase), aim = this.aimAt();
    this.playAttack(S.windup);
    sfxAt(this.game, this.x, this.z, 'water_surge', 'boss_roar');
    for (let i = 0; i < n; i++) {
      const a = aim + (n > 1 ? (i - 0.5) * 2 * S.spread : 0);
      const dir = { x: Math.cos(a), z: Math.sin(a) };
      const ox = this.x + dir.x * this.radius, oz = this.z + dir.z * this.radius;
      const lane = this.scene.fx.chargeLane({ x: ox, z: oz }, { dir, length: S.length, width: S.width, time: S.windup, fade: S.length / S.speed, hole: this.p.pos });
      this.teles.push(lane);
      this.later(S.windup, () => { this.waves.push({ ox, oz, dir, pos: 0, hit: false }); this.game.shake(3, 0.2); });
    }
  }

  moves(dt) {
    const S = this.def.surge, fx = this.scene.fx;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.pos += S.speed * dt;
      const fxp = { x: w.ox + w.dir.x * w.pos, z: w.oz + w.dir.z * w.pos };
      for (let k = -1; k <= 1; k++) {
        const sx = fxp.x + -w.dir.z * k * S.width * 0.4, sz = fxp.z + w.dir.x * k * S.width * 0.4;
        fx.burst({ x: sx, y: 0.1, z: sz }, { color: '#9fd0e8', color2: '#ffffff', count: 2, speed: 1.6, up: 2.6, life: 0.35, size: 2 / 32, vx: w.dir.x * 3, vz: w.dir.z * 3 });
      }
      if (!w.hit) {
        const p = this.p, rx = p.pos.x - w.ox, rz = p.pos.z - w.oz;
        const along = rx * w.dir.x + rz * w.dir.z, perp = Math.abs(rx * -w.dir.z + rz * w.dir.x);
        if (Math.abs(along - w.pos) < 0.9 && perp < S.width / 2 + p.r * 0.5 && !p.dead) {
          w.hit = true;
          if (p.hurt(Math.round(S.damage * this.dmgK), w.dir.x, w.dir.z, this.def.name)) { p.kb.x += w.dir.x * S.knock; p.kb.z += w.dir.z * S.knock; }
        }
      }
      if (w.pos >= S.length) this.waves.splice(i, 1);
    }
  }

  endMoves() { this.waves = []; }

  blast() {
    const B = this.def.blast;
    this.playAttack(B.windup + 0.2);
    sfxAt(this.game, this.x, this.z, 'steam_build', 'windup');
    this.ringAt(this.x, this.z, B.radius, B.windup, '#e8f0f4', '#ff0044', () => {
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this._steam(this.x + Math.cos(a) * B.radius * 0.7, this.z + Math.sin(a) * B.radius * 0.7, 4); }
      this.game.shake(5, 0.25);
      sfxAt(this.game, this.x, this.z, 'steam_blast', 'crash');
      this.hitCircle(this.x, this.z, B.radius, B.damage, B.knock);
    });
  }
}

const KINDS = { thorn_mother: ThornMother, brood_hive: BroodHive, warden: Warden, drowned_engine: DrownedEngine };

// ==================================================================== the Pack Lord (mobile)

/**
 * The Pack Lord: a Feral Chief with boss health and an elite's ring, a pack of Ferals and a war cry (a ring that
 * speeds up every Feral inside it). Phase 2: tinted, faster, the cry calls more Ferals. It lives in scene.enemies
 * like any creature (combat, deflects, splats all apply); dragged too far from its lair it walks home and recovers.
 */
class PackLordEnemy extends FeralChief {
  constructor(scene, x, z, L) {
    super(scene, 'feral_chief', x, z, { elite: true, guard: true });
    this.lordOf = L;
    const night = this.game.run.night;
    this.def = { ...this.def, name: L.def.name, drop: 0, thrust2: { ...this.def.thrust2, chance: 0.75, fromNight: 1 } };
    this.maxHp = Math.round(BOSS.hp * nightTune('eliteHp', night));
    this.hp = this.maxHp;
    this.phase = 1;
    this.cryCd = 3;
  }

  get ctl() { return this.lordOf.boss; }

  hit(dmg, dx, dz, kb = 0, src = '', stagger = 0) {
    if (this.dead || this.returning) return;
    if (!this.ctl.engaged) this.ctl.provoked = true;
    const k = this.roarT > 0 ? BOSS.roarTaken : 1;
    super.hit(dmg * k, dx, dz, kb * 0.4, src, stagger * 0.5);
    if (!this.dead && this.phase === 1 && this.hp <= this.maxHp * BOSS.phase2) this._phase2();
  }

  _phase2() {
    const L = this.lordOf.def, sc = this.scene;
    this.phase = 2;
    this.roarT = BOSS.roar;
    setBaseColor(this.vis, BOSS.tint2);
    setSpeedBuff(this, 'rage', L.speed2, Infinity);
    sc.fx.ring({ x: this.x, z: this.z }, { color: '#ff0044', radius: 4, life: 0.6 });
    this.game.shake(7, 0.4);
    sfxAt(this.game, this.x, this.z, 'boss_phase2', 'boss_roar'); sfxAt(this.game, this.x, this.z, 'boss_wake_pack_lord');
    sc.toast(`The ${L.name} is enraged!`, 'bad', 2.6);
    this.cryCd = 0.5;
  }

  update(dt) {
    if (this.dead) return;
    this.roarT = (this.roarT || 0) - dt;
    if (this.returning) {
      // Walking home to its lair, ignoring you; it recovers when it gets there.
      const hx = this.ctl.homeX - this.x, hz = this.ctl.homeZ - this.z, d = Math.hypot(hx, hz);
      if (d < 1.5) { this.returning = false; this.state = 'idle'; this.alerted = false; this.home = { x: this.x, z: this.z }; }
      else {
        const m = this._pathTo(this.ctl.homeX, this.ctl.homeZ) || { x: hx / d, z: hz / d };
        this.face = m;
        this.scene.world.moveBody(this, m.x * this.def.speed * dt, m.z * this.def.speed * dt, this.radius, this.moveOpts);
        this.moving = true;
      }
      this._syncVisual(dt);
      return;
    }
    if (this.roarT > 0) { this._syncVisual(dt); return; }
    super.update(dt);
    if (this.dead || !this.ctl.engaged) return;
    // The war cry.
    const C = this.lordOf.def.cry;
    this.cryCd -= dt;
    if (this.cryCd <= 0 && this.state !== 'windup' && this.state !== 'attack') {
      this.cryCd = pv(C.every, this.phase);
      const sc = this.scene;
      sc.fx.ringTele({ x: this.x, z: this.z }, { radius: Math.min(C.radius, 6), color: '#feae34', color2: '#f0c040', time: C.windup, fade: 0.1 });
      sfxAt(this.game, this.x, this.z, 'war_cry', 'boss_cue');
      sc.fx.text({ x: this.x, z: this.z }, 'WAR CRY', { color: '#f0c040', cls: 'big', y: this.vis.userData.vis.height + 0.4, life: 0.9 });
      this.ctl.later(C.windup, () => {
        if (this.dead) return;
        const now = sc.dayT ?? 0;
        for (const e of sc.enemies) {
          if (e.dead || (e.key !== 'feral' && e.key !== 'feral_chief') || Math.hypot(e.x - this.x, e.z - this.z) > C.radius) continue;
          setSpeedBuff(e, 'cry', C.speed, now + C.time);
          sc.fx.burst({ x: e.x, y: 0.6, z: e.z }, { color: '#f0c040', count: 4, speed: 1, up: 2, life: 0.5, size: 2 / 32 });
        }
        if (this.phase === 2) {
          const live = sc.enemies.filter((e) => !e.dead && e.key === 'feral' && e.packOf === this.lordOf).length;
          for (let i = 0; i < Math.min(C.summon2, C.max - live); i++) this.ctl.summon();
        }
      });
    }
  }
}

/** The manager's handle on the Pack Lord: the creature, its pack, its lair. */
class PackLordCtl {
  constructor(mgr, L) {
    this.mgr = mgr;
    this.L = L;
    this.scene = mgr.scene;
    this.game = mgr.game;
    this.def = L.def;
    this.stationary = false;
    this.homeX = L.x; this.homeZ = L.z;
    this.engaged = false;
    this.sched = [];
    this.enemy = new PackLordEnemy(this.scene, L.x, L.z, L);
    this.scene.enemies.push(this.enemy);
    for (let i = 0; i < this.def.pack; i++) this.summon(true);
  }

  get x() { return this.enemy.x; }
  get z() { return this.enemy.z; }
  get hp() { return Math.max(0, this.enemy.hp); }
  get maxHp() { return this.enemy.maxHp; }
  get phase() { return this.enemy.phase; }
  get dead() { return this.enemy.dead; }

  later(t, fn) { this.sched.push({ t, fn }); }

  /** One more Feral for the pack (at the lair when the day starts, beside the Lord in phase 2). */
  summon(atStart = false) {
    const sc = this.scene, e0 = this.enemy;
    const p = atStart ? sc._openSpot?.(this.homeX, this.homeZ, 1.6, 3.2) : sc._openSpot?.(e0.x, e0.z, 2, 4);
    if (!p) return null;
    const e = sc.spawnEnemy(this.def.packType, p.x, p.z, atStart ? { guard: true } : { spawnIn: true, alerted: true });
    e.packOf = this.L;
    return e;
  }

  onEngage() {
    const e = this.enemy;
    if (!e.alerted) e.alert(true);
  }

  update(dt) {
    for (let i = this.sched.length - 1; i >= 0; i--) {
      const s = this.sched[i];
      s.t -= dt;
      if (s.t <= 0) { this.sched.splice(i, 1); s.fn(); }
    }
    // Dragged too far from its lair: it walks home and recovers there (AreaBosses._disengage → reset()).
    const e = this.enemy;
    if (this.engaged && !e.dead && Math.hypot(e.x - this.homeX, e.z - this.homeZ) > BOSS.leash + 6) this.mgr._disengage(this.L, true);
  }

  reset() {
    const e = this.enemy;
    e.hp = e.maxHp;
    e.phase = 1;
    e.roarT = 0;
    setBaseColor(e.vis, '#ffffff');
    if (e.speedBuffs) { delete e.speedBuffs.rage; setSpeedBuff(e, 'none', 1, Infinity); }
    e.tele?.cancel?.();
    e.tele = null;
    e.returning = true;
    e.alerted = false;
    e.state = 'chase';
    this.sched = [];
  }

  dispose() {}   // the creature is disposed with the scene's enemies
}
