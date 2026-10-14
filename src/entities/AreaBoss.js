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
import { setAnim, updateVisual, setBaseColor, flashVisual, addGroundRing } from '../core/Assets.js';
import { bossLair, clearDisc } from '../world/JungleGen.js';
import { FeralChief, setSpeedBuff } from './DayCreatures.js';
import { el } from '../ui/ui.js';
import '../ui/objectives.css';

/** A per-phase value: [phase 1, phase 2] or a plain number. */
const pv = (v, phase) => (Array.isArray(v) ? v[Math.min(v.length, phase) - 1] : v);

/** Phase 2's particle aura (BOSS.aura2[kind]): spores / embers / sparks / steam rising off the boss. */
function bossAura(scene, kind, x, z, h, dt) {
  const A = BOSS.aura2, a = A?.[kind];
  if (!a || Math.random() > dt * A.rate) return;
  const r = Math.random() * A.spread, t = Math.random() * Math.PI * 2;
  scene.fx.burst({ x: x + Math.cos(t) * r, y: h * (0.25 + Math.random() * 0.5), z: z + Math.sin(t) * r * 0.6 },
    { color: a[0], color2: a[1], count: 1, speed: 0.5, up: a[2], gravity: a[3], life: a[4], size: a[5] / 32 });
}

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
      // (The Pack Lord's lair is cleared wider: no x-ray silhouette fight in the brush, critic H2 §2.3.)
      clearDisc(sc.data, s.x, s.z, Math.max(BOSS.arena + L.def.radius, L.def.kind === 'pack_lord' ? BOSS.packLord.clear : 0));
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
    // One fight at a time (critic H2 §5.2): while a boss is engaged no other one can start (its HUD bar never
    // switches mid-fight); a blow on another boss meanwhile doesn't provoke it.
    const busy = this.active && !this.active.dead && this.active.boss?.engaged ? this.active : null;
    for (const L of this.lairs) {
      const b = L.boss;
      if (!b || L.dead) { b?.update?.(dt); continue; }
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (busy && busy !== L) b.provoked = false;
      else if (!b.engaged && !sc.ending && !pl.dead && (d < BOSS.aggro || b.provoked)) this._engage(L);
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
    // One clean beat (critic H2 §5.1): its name and how it fights on the banner (which cuts a place name and holds
    // the toasts); the first time today, what a kill earns follows as the banner's late line. The HUD bar (which
    // names it too) waits for the banner, unless the boss is hit first.
    const first = !this._toldReward;
    this._toldReward = true;
    const time = first ? BOSS.introTime[1] : BOSS.introTime[0];
    this.barWait = time;
    sc._banner(L.def.name.toUpperCase(), L.def.intro, {
      prio: 2, time, cls: 'boss',
      extra: first ? `Kill it and the ${DISTRICTS[L.area].name} sends no danger at night for the rest of the run` : null,
    });
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
      // Said only when it was hurt: an untouched boss has nothing to recover.
      if (b.hp < b.maxHp) sc.toast(`You left the ${L.def.name}: it recovers`, 'amber', 3);
      b.reset();
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
    sc._grantSkillPoint?.({ boss: true, quiet: true });
    // The rare relic (relics stream), else a pile of parts.
    const drop = sc.dropRelic?.(x, z, { rarity: BOSS.reward.relic, quiet: true });
    if (!drop) sc._spill(BOSS.reward.fallback, x, z, true);
    // The biggest moment of the day reads on its own (critic H2 §5.1): the banner first, the rewards as its late line
    // (the relic's own label is left off: it would print over the banner).
    sc._banner(`${L.def.name.toUpperCase()} KILLED`, `The ${DISTRICTS[L.area].name} sends no danger at night for the rest of the run`, {
      prio: 2, time: BOSS.killTime,
      extra: `+1 skill point · +${BOSS.reward.research} Research when the day ends${drop ? ' · it dropped a rare relic' : ''}`,
    });
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
    // (While its name banner shows, the bar waits: one name on screen at a time — unless it is already hurt.)
    this.barWait = (this.barWait || 0) - dt;
    if (!L || (this.barWait > 0 && L.boss.hp >= L.boss.maxHp)) {
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
    const cls = `j-bossbar${b.phase === 2 ? ' p2' : ''}${b.shielded?.() ? ' shield' : ''}${b.openT > 0 ? ' open' : ''}`;   // (open: a punish window)
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
    this.maxHp = Math.round(BOSS.hp * (L.def.hpK ?? 1) * nightTune('eliteHp', night));
    this.hp = this.maxHp;
    this.phase = 1;
    this.engaged = false;
    this.dead = false;
    this.cd = {};
    this.sched = [];
    this.lobs = [];
    this.teles = [];
    this.minions = [];
    this.hurtT = 0; this.atkT = 0; this.windT = 0; this.roarT = 0; this._dt = 0;
    // The pattern (act): `step` in this phase's sequence, `busyT` the move under way, `gapT` the recovery after it,
    // `openT` an opening (punish window), `spawned` minions released this fight (capped).
    this.step = -1; this.busyT = 0; this.gapT = 0; this.openT = 0; this.pendingOpen = 0; this.spawned = 0; this._ph = 1;
    this._visOpts = {
      ring: JUICE.hostileRingJungle || JUICE.hostileRing?.color || '#a22633',
      silhouette: ATMOS.silhouette.enemyDim, silhouetteSkipsMask: true,
    };
    this.visKey = L.def.sprite;
    this.vis = this.game.assets.makeVisual(L.def.sprite, this._visOpts);
    this.vis.position.set(this.x, 0, this.z);
    setAnim(this.vis, 'idle');
    this.scene.three.add(this.vis);
    this.col = this.scene.world.addCollider({ x: this.x, z: this.z, r: this.radius * 0.8 });
  }

  /**
   * Its look for a phase (critic H2 §2.1: phase 2 was only a tint): phase 2 swaps to the `<sprite>_p2` sheet (cracks,
   * glowing veins, a hotter eye; same frame layout) when it is loaded, else the old BOSS.tint2 multiply.
   */
  _look(phase) {
    const key = phase === 2 ? `${this.def.sprite}_p2` : this.def.sprite;
    if (phase === 2 && !this.game.assets.hasSprite(key)) { setBaseColor(this.vis, BOSS.tint2); return; }
    setBaseColor(this.vis, '#ffffff');
    if (this.visKey === key) return;
    const old = this.vis;
    this.vis = this.game.assets.makeVisual(key, this._visOpts);
    this.vis.position.copy(old.position);
    this.vis.userData.alert = old.userData.alert;
    setAnim(this.vis, this._anim || 'idle', true);
    this.scene.three.add(this.vis);
    this.game.assets.disposeVisual(old);
    this.visKey = key;
  }

  get p() { return this.scene.player; }
  dist() { const p = this.p.pos; return Math.hypot(p.x - this.x, p.z - this.z); }
  aimAt() { const p = this.p.pos; return Math.atan2(p.z - this.z, p.x - this.x); }

  /** Damage multiplier on blows it takes (the Brood Hive's shield). */
  damageTaken() { return 1; }

  hurt(dmg, dx, dz, src) {
    if (this.dead) return;
    if (!this.engaged) this.provoked = true;
    // Shield (the Brood Hive's brood) × an opening's punish multiplier × the phase-2 roar's armour.
    const shield = this.damageTaken(), open = this.openT > 0;
    let k = shield * (open ? this.def.punish?.mult ?? 1 : 1);
    if (this.roarT > 0) k *= BOSS.roarTaken;
    dmg = Math.max(1, Math.round(dmg * k));
    this.hp -= dmg;
    const fx = this.scene.fx, h = this.vis.userData.vis.height;
    fx.hitFlash(this.vis, JUICE.melee?.whiteFlash ?? 0.08);
    fx.text({ x: this.x, z: this.z }, String(dmg), { color: open ? '#fee761' : k < 0.7 ? '#8b9bb4' : '#feae34', cls: open ? 'crit' : 'elite', y: h + 0.4, life: 0.6, key: this, value: dmg });
    fx.burst({ x: this.x - (dx || 0) * this.radius * 0.6, y: h * 0.4, z: this.z - (dz || 0) * this.radius * 0.6 }, { color: this.def.blood || '#7f9a3c', color2: '#ead4aa', count: 7, speed: 2.4, up: 1.8, life: 0.35, size: 2 / 32 });
    if (shield < 0.7 && Math.random() < 0.5) fx.text({ x: this.x, z: this.z }, 'SHIELDED', { color: '#8b9bb4', y: h + 0.8, life: 0.6, key: 'shield' });
    this.game.sfx.playAt('hit', this.x, this.z);
    if (this.atkT <= 0) this.hurtT = BOSS.hurtFrame;
    if (this.hp <= 0) this._die();
    else if (this.phase === 1 && this.hp <= this.maxHp * BOSS.phase2) this._phase2();
  }

  /** A deflected whip / lunge: it reels for a beat (all its moves wait). */
  deflected() {
    // (The player's "DEFLECT" is the one word said: no second label over the boss, critic H2 §3.)
    // A parried whip staggers it: a short opening (punish.parry s), its next move waits.
    for (const k of Object.keys(this.cd)) this.cd[k] += 1;
    if (this.def.punish?.parry && this.openT <= 0) this._open(this.def.punish.parry, true);
  }

  _phase2() {
    this.phase = 2;
    this.roarT = BOSS.roar;
    this._look(2);   // the _p2 sheet (else the tint)
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
    setBaseColor(this.vis, '#ffffff');   // (a phase-2 sheet keeps its own dead frame)
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
    this.step = -1; this.busyT = this.gapT = this.openT = 0; this.pendingOpen = 0; this.spawned = 0; this._ph = 1; this.windT = this.atkT = 0;
    for (const t of this.teles) t.cancel?.();
    this.teles = [];
    this.sched = [];
    this.endMoves?.();
    this._look(1);
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
  playAttack(t = 0.32) { this.atkT = t; this.windT = 0; this.hurtT = 0; }

  /**
   * Anticipation: the windup pose (strip frames 8–9) for `t` s, then the attack pose for `release` s, so the
   * silhouette telegraphs every move before it lands. Returns t.
   */
  tell(t, release = 0.35) {
    this.windT = t; this.atkT = 0; this.hurtT = 0;
    this.later(t, () => this.playAttack(release));
    return t;
  }

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
  /** Is the player inside that lane? */
  _inLane(x, z, dir, len, width) {
    const p = this.p, rx = p.pos.x - x, rz = p.pos.z - z;
    const along = rx * dir.x + rz * dir.z, perp = Math.abs(rx * -dir.z + rz * dir.x);
    return !p.dead && along >= -0.3 && along <= len + p.r && perp <= width / 2 + p.r * 0.5;
  }

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
    e.minion = true;   // a boss's minion: no loot, no kill-heals (JungleScene.onEnemyKilled)
    this.minions.push(e);
    this.spawned++;
    return e;
  }

  /** How many more minions it may release now: `max` alive at once, `cap` in the whole fight. */
  minionRoom(max, cap) { return Math.max(0, Math.min(max - this.liveMinions(), cap - this.spawned)); }

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
    this.hurtT -= dt; this.atkT -= dt; this.windT -= dt; this.roarT -= dt;
    if (!this.dead) {
      this.moves?.(dt);
      const busy = this.scene.ending || this.p.dead;
      if (this.engaged && this.roarT <= 0 && !busy) this.act(dt);
      this.vis.userData.alert = this.engaged;
      const want = this.atkT > 0 ? 'attack' : this.windT > 0 ? 'windup' : this.hurtT > 0 ? 'hurt' : 'idle';
      if (want !== this._anim) { setAnim(this.vis, want, true); this._anim = want; }
      if (this.roarT > 0 && Math.random() < dt * 20) this.scene.fx.burst({ x: this.x, y: 0.2, z: this.z }, { color: '#ff0044', count: 1, speed: 2.5, up: 2, life: 0.4, size: 2 / 32 });
      if (this.phase === 2) bossAura(this.scene, this.def.kind, this.x, this.z, this.vis.userData.vis.height, dt);
    }
    updateVisual(this.vis, dt);
  }

  /**
   * The fight (critic I2 #3): each phase runs its move PATTERN in order (bosses.js `pattern[phase]`; a '?' slot draws
   * one move from `wild[phase]`), with `gap` s of recovery after each move. A move method starts its tell and
   * telegraphs and returns how long it lasts. The big moves (`punish.after`) end in an OPENING: for `punish.time` s
   * it is spent — no moves, × `punish.mult` damage taken, its bar says so (a parried whip opens it for
   * `punish.parry` s). Phase 2 starts its own pattern from the top.
   */
  act(dt) {
    this.tick?.(dt);
    if (this._ph !== this.phase) { this._ph = this.phase; this.step = -1; this.busyT = 0; this.gapT = 0.4; this.pendingOpen = 0; this.openT = 0; }
    if (this.busyT > 0) {
      this.busyT -= dt;
      if (this.busyT <= 0 && this.pendingOpen) { this._open(this.pendingOpen); this.pendingOpen = 0; }
      return;
    }
    if (this.openT > 0) { this._opening(dt); return; }
    if (this.gapT > 0) { this.gapT -= dt; return; }
    const D = this.def, ph = this.phase, seq = pv(D.pattern, ph) || [];
    if (!seq.length) return;
    this.step = (this.step + 1) % seq.length;
    let mv = seq[this.step];
    if (mv === '?') { const w = pv(D.wild, ph) || []; mv = w[Math.floor(Math.random() * w.length)]; }
    const t = (mv && this[mv]?.()) ?? 0.5;
    this.move = mv;
    this.busyT = t;
    this.gapT = pv(D.gap, ph) ?? 0.8;
    if (D.punish?.after?.includes(mv)) this.pendingOpen = D.punish.time;
  }

  /** Spent for `time` s: × punish.mult damage, no moves, a pulsing tell (flashes + the boss's own particles). */
  _open(time, parry = false) {
    const P = this.def.punish;
    if (!P || this.dead) return;
    this.openT = time;
    this.pulseT = 0;
    // The words go on the boss bar only (barNote: one place, not a second label over the boss that can sit on the
    // bar when the boss is near the top of the view); in the world it's the gold ring and the flashing.
    this.openLabel = parry ? 'Staggered' : P.label;
    this.scene.fx.ring({ x: this.x, z: this.z }, { color: '#fee761', radius: this.radius + 0.8, life: 0.35 });
    sfxAt(this.game, this.x, this.z, 'boss_open', 'glint');
  }

  _opening(dt) {
    const P = this.def.punish;
    this.openT -= dt;
    this.pulseT -= dt;
    if (this.pulseT <= 0) {
      this.pulseT = 0.22;
      flashVisual(this.vis, '#fee761', 0.07);
      const h = this.vis.userData.vis.height;
      this.scene.fx.burst({ x: this.x, y: h * 0.7, z: this.z }, { color: P.fx?.[0] || '#fee761', color2: P.fx?.[1] || '#ffffff', count: 5, speed: 1.2, up: P.up ?? 2, life: 0.5, size: 2 / 32, gravity: P.gravity ?? 2 });
    }
  }

  /** The HUD bar's line: an opening says so; else the subclass's own (shield) or nothing. */
  barNote() { return this.openT > 0 ? `${this.openLabel || this.def.punish.label}: hit it! (×${this.def.punish.mult} damage)` : ''; }

  /** An anti-hug ring round itself (`M` = { radius, windup, damage, knock }): the move that reaches the chop's range. */
  _ringSelf(M, colors, onHit) {
    this.tell(M.windup);
    this.ringAt(this.x, this.z, M.radius, M.windup, colors[0], colors[1], () => {
      this.scene.fx.ring({ x: this.x, z: this.z }, { color: colors[2] || colors[1], radius: M.radius, life: 0.3 });
      this.game.shake(5, 0.25);
      onHit?.();
      this.hitCircle(this.x, this.z, M.radius, M.damage, M.knock);
    });
    return M.windup + 0.25;
  }

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

  // Moves (pattern in bosses.js): whip (lanes, deflectable: a parry staggers it), thorns (a ring round itself that
  // reaches the chop's range), barrage (then it wilts: the opening), brood (phase 2 Crawlers, capped).
  thorns() {
    return this._ringSelf(this.def.thorns, ['#ff0044', '#4b8139', '#c23a3a'], () => {
      const R = this.def.thorns.radius;
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; this.scene.fx.burst({ x: this.x + Math.cos(a) * R * 0.8, y: 0.2, z: this.z + Math.sin(a) * R * 0.8 }, { color: '#2a5628', color2: '#c23a3a', count: 3, speed: 1.6, up: 2.6, life: 0.4, size: 2 / 32 }); }
      sfxAt(this.game, this.x, this.z, 'roots_burst', 'crack');
    });
  }

  brood() {
    const B = this.def.brood, n = Math.min(pv(B.n, this.phase), this.minionRoom(B.max, B.cap));
    if (!n) return this.whip();
    this.tell(0.3);
    for (let i = 0; i < n; i++) this.spawnMinion(B.type);
    sfxAt(this.game, this.x, this.z, 'hive_spawn', 'nest_burst');
    return 0.6;
  }

  /** Vine lanes toward you (a fan of them in phase 2): deflectable. */
  whip() {
    const W = this.def.whip, n = pv(W.fan, this.phase), base = this.aimAt();
    this.tell(W.windup);
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
    return W.windup + 0.25;
  }

  /**
   * Spore pods lobbed round you (critic I2 #1: the telegraph tells the truth). A CLOUD pod's ring is the cloud's own
   * size (SPORES.radius, spore green) and it leaves a cloud there (`cloudLife` s; at most `maxClouds` of hers at
   * once); a HIT pod's ring (`radius`, red) is the whole of its damage. The first pod goes where you're heading.
   */
  barrage() {
    const B = this.def.barrage, n = pv(B.count, this.phase);
    const now = this.scene.time;
    this.clouds = (this.clouds || []).filter((t) => t > now);
    let clouds = Math.min(pv(B.clouds, this.phase), pv(B.maxClouds, this.phase) - this.clouds.length);
    const p = this.p, v = p.vel || { x: 0, z: 0 };
    // She rears back (`tell` s, the windup pose), then lobs: the pods are aimed at release.
    this.tell(B.tell);
    this.later(B.tell, () => this._lobPods(B, n, clouds, now, p, v));
    return B.tell + B.fuse + 0.35;
  }

  _lobPods(B, n, clouds, now, p, v) {
    sfxAt(this.game, this.x, this.z, 'spore_barrage', 'lob');
    for (let i = 0; i < n; i++) {
      let x = p.pos.x + v.x * B.fuse * B.lead, z = p.pos.z + v.z * B.fuse * B.lead;
      if (i > 0) { const a = Math.random() * Math.PI * 2, r = B.near + Math.random() * (B.spread - B.near); x += Math.cos(a) * r; z += Math.sin(a) * r; }
      const cloud = clouds-- > 0;
      if (cloud) this.clouds.push(now + B.tell + B.fuse + B.cloudLife);
      const r = cloud ? SPORES.radius : B.radius;
      this.teles.push(this.scene.fx.ringTele({ x, z }, cloud
        ? { radius: r, color: SPORES.color, color2: SPORES.color2, time: B.fuse, fade: 0.06 }
        : { radius: r, color: '#ff0044', color2: '#feae34', time: B.fuse, fade: 0.06 }));
      this.lob('spore_pod', x, z, B.fuse, (lx, lz) => {
        this.scene.fx.burst({ x: lx, y: 0.3, z: lz }, { color: SPORES.color, color2: SPORES.color2, count: 14, speed: 2.4, up: 2, life: 0.5, size: 2 / 32 });
        if (cloud) this.scene.spores?.cloudAt?.(lx, lz, { life: B.cloudLife, src: this.def.name });
        else { this.hitCircle(lx, lz, B.radius, B.damage, 3); this.game.sfx.playAt('spore_burst', lx, lz); }
      });
    }
  }
}

// ------------------------------------------------------------------ Brood Hive (Overgrown Market)

class BroodHive extends StationaryBoss {
  constructor(mgr, L) { super(mgr, L); this.def = { ...this.def, blood: '#b55088' }; this.shieldT = 0; }

  // The fight is the hive, not its brood (critic I2 #4): brood comes in waves from the pattern (`brood` move, at
  // most `spawn.max` alive and `spawn.cap` in a fight), minions drop nothing and feed no kill-heals; the burst splits
  // the shell open (the opening: no shield).
  damageTaken() { if (this.openT > 0) return 1; const S = this.def.shield; return 1 - Math.min(S.max, this.liveMinions() * S.per); }
  shielded() { return this.engaged && this.openT <= 0 && this.liveMinions() > 0; }
  barNote() {
    if (this.openT > 0) return super.barNote();
    const n = this.liveMinions();
    if (!n) return this.phase === 2 ? 'Enraged' : '';
    return `Brood shield: it takes ${Math.round((1 - this.damageTaken()) * 100)}% less damage. Kill the Crawlers`;
  }

  /** The shield shows: a pale ring pulses round the hive while its brood lives. */
  tick(dt) {
    this.shieldT -= dt;
    if (this.shieldT <= 0 && this.shielded()) { this.shieldT = 0.9; this.scene.fx.ring({ x: this.x, z: this.z }, { color: '#8b9bb4', radius: this.radius + 0.5, life: 0.5 }); }
  }

  /** A wave of brood crawls out (capped); with no room left it lobs eggs instead. */
  brood() {
    const S = this.def.spawn, n = Math.min(pv(S.n, this.phase), this.minionRoom(pv(S.max, this.phase), S.cap));
    if (!n) return this.eggs();
    this.tell(0.3);
    for (let i = 0; i < n; i++) this.later(i * 0.25, () => this.spawnMinion(S.type));
    sfxAt(this.game, this.x, this.z, 'hive_spawn', 'nest_burst');
    return 0.6 + n * 0.25;
  }

  onPhase2() {
    const S = this.def.spawn, n = Math.min(S.at2, this.minionRoom(pv(S.max, 2), S.cap));
    for (let i = 0; i < n; i++) this.spawnMinion(S.type);
    this.scene.toast('The hive splits open: more brood!', 'bad', 2.4);
  }

  /** An egg burst round the hive (it reaches the chop's range): get out of the ring. Then its shell gapes open. */
  burst() {
    const B = this.def.burst;
    this.tell(B.windup);
    sfxAt(this.game, this.x, this.z, 'hive_swell', 'windup');
    this.ringAt(this.x, this.z, B.radius, B.windup, '#ff0044', '#b55088', () => {
      const fx = this.scene.fx;
      fx.burst({ x: this.x, y: 0.5, z: this.z }, { color: '#b55088', color2: '#feae34', count: 40, speed: 4.5, up: 3, life: 0.6, size: 2 / 32 });
      fx.ring({ x: this.x, z: this.z }, { color: '#feae34', radius: B.radius, life: 0.35 });
      this.game.shake(5, 0.25);
      sfxAt(this.game, this.x, this.z, 'egg_burst', 'nest_burst');
      this.hitCircle(this.x, this.z, B.radius, B.damage, B.knock);
      const n = this.phase === 2 ? Math.min(B.hatch2.n, this.minionRoom(pv(this.def.spawn.max, 2) + B.hatch2.n, this.def.spawn.cap)) : 0;
      for (let i = 0; i < n; i++) this.spawnMinion(B.hatch2.type, 0.8, 2.6);
    });
    return B.windup + 0.35;
  }

  /** Egg sacs lobbed at you (`n` per phase); in phase 2 each hatches a Skitter where it lands (within the cap). */
  eggs() {
    const E = this.def.eggs, p = this.p, n = pv(E.n, this.phase);
    this.tell(0.25);
    sfxAt(this.game, this.x, this.z, 'egg_lob');
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = i ? 1 + Math.random() * 1.8 : 0;
      const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
      this.teles.push(this.scene.fx.ringTele({ x, z }, { radius: E.radius, color: '#ff4d8d', color2: '#b55088', time: E.fuse, fade: 0.05 }));
      this.lob('spore_pod', x, z, E.fuse, (lx, lz) => {
        this.hitCircle(lx, lz, E.radius, E.damage, 2);
        this.scene.fx.burst({ x: lx, y: 0.3, z: lz }, { color: '#b55088', color2: '#ead4aa', count: 10, speed: 2, up: 2, life: 0.4, size: 2 / 32 });
        sfxAt(this.game, lx, lz, 'egg_hatch');
        if (this.phase < 2 || this.spawned >= this.def.spawn.cap) return;
        const e = this.scene.spawnEnemy(E.hatch, lx, lz, { spawnIn: true, alerted: true });
        e.minion = true;
        this.spawned++;
        this.minions.push(e);
      }, '#e890c0');
    }
    return 0.6;
  }
}

// ------------------------------------------------------------------ Security Warden (Municipal Data Center)

class Warden extends StationaryBoss {
  constructor(mgr, L) { super(mgr, L); this.def = { ...this.def, blood: '#8b9bb4' }; this.beams = []; }

  // Moves (pattern in bosses.js): stomp (a shockwave ring that reaches the chop's range), mortar (strikes at and
  // round you: no safe range), laser (then it overheats: the opening), drones (phase 2, capped).
  drones() {
    const D = this.def.drones, n = Math.min(D.n, this.minionRoom(D.max, D.cap));
    if (!n) return this.mortar();
    this.tell(0.3);
    for (let i = 0; i < n; i++) this.spawnMinion(D.type, 1, 3, D.tint);
    sfxAt(this.game, this.x, this.z, 'drones_deploy', 'alarm');
    this.scene.toast('Security drones!', 'bad', 2);
    return 0.6;
  }

  stomp() {
    const S = this.def.stomp;
    sfxAt(this.game, this.x, this.z, 'stomp_windup', 'windup');
    return this._ringSelf(S, ['#ff0044', '#feae34'], () => {
      this.scene.fx.crack?.({ x: this.x, z: this.z });
      sfxAt(this.game, this.x, this.z, 'warden_stomp', 'crash');
    });
  }

  /** Strike markers: one where you're heading, the rest round you; each blows `fuse` s later (a bolt from the mast). */
  mortar() {
    const M = this.def.mortar, n = pv(M.n, this.phase), p = this.p, v = p.vel || { x: 0, z: 0 };
    this.tell(0.25);
    sfxAt(this.game, this.x, this.z, 'laser_charge', 'alarm');
    for (let i = 0; i < n; i++) {
      let x = p.pos.x + v.x * M.fuse * M.lead, z = p.pos.z + v.z * M.fuse * M.lead;
      if (i > 0) { const a = Math.random() * Math.PI * 2, r = M.near + Math.random() * (M.spread - M.near); x += Math.cos(a) * r; z += Math.sin(a) * r; }
      this.later(i * M.stagger, () => this.ringAt(x, z, M.radius, M.fuse, '#ff0044', '#feae34', () => {
        const fx = this.scene.fx, h = this.vis.userData.vis.height;
        fx.bolt(new THREE.Vector3(this.x, h * 0.9, this.z), new THREE.Vector3(x, 0.05, z), { color: '#ff2e2e', width: 2 / 32, core: 1 / 32, jag: 0.3, life: 0.12 });
        fx.burst({ x, y: 0.2, z }, { color: '#feae34', color2: '#ff2e2e', count: 14, speed: 2.6, up: 2.4, life: 0.4, size: 2 / 32 });
        fx.crack?.({ x, z });
        sfxAt(this.game, x, z, 'zap', 'crash');
        this.hitCircle(x, z, M.radius, M.damage, 3);
      }));
    }
    return 0.5 + (n - 1) * M.stagger;
  }

  /**
   * The laser: a thin aiming line for `warn` s, then the beam sweeps `sweep`° (through where you stood) at `speed`°/s.
   * Phase 2: a second beam on the opposite side. A roll's i-frames carry you through it.
   */
  laser() {
    const Lz = this.def.laser, n = pv(Lz.beams, this.phase);
    const aim = this.aimAt(), sign = Math.random() < 0.5 ? -1 : 1;
    const half = ((Lz.sweep / 2) * Math.PI) / 180;
    this.tell(Lz.warn, Lz.sweep / Lz.speed);
    sfxAt(this.game, this.x, this.z, 'laser_charge', 'alarm');
    for (let i = 0; i < n; i++) {
      const a0 = aim - sign * half + i * Math.PI;
      this.beams.push({ a: a0, end: a0 + sign * 2 * half, sign, t: -Lz.warn, meshes: this._beamMeshes(), hitT: 0 });
    }
    return Lz.warn + Lz.sweep / Lz.speed;
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
      // One hit (or one DODGED) per pass through the beam, not one a frame (critic I2 #12).
      if (b.hitT <= 0 && this._inLane(this.x, this.z, dir, Lz.length + 0.3, Lz.width)) { b.hitT = 0.5; this.hitLane(this.x, this.z, dir, Lz.length + 0.3, Lz.width, Lz.damage, 4); }
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

  // Moves (pattern in bosses.js): vents (rings at and round you), blast (a steam ring round itself that reaches the
  // chop's range), surge (lanes + rolling waves; then its boiler vents: the opening).
  _steam(x, z, n = 10) {
    this.scene.fx.burst({ x, y: 0.1, z }, { color: '#e8f0f4', color2: '#9fb8c8', count: n, speed: 1.4, up: 4, life: 0.8, size: 3 / 32, gravity: -1.5, drag: 1.5 });
  }

  /** Steam vents: rings under you (and round you); stand clear before they blow. */
  vents() {
    const V = this.def.vents, n = pv(V.n, this.phase), p = this.p, v = p.vel || { x: 0, z: 0 };
    this.tell(0.25);
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
    return 0.6;
  }

  /** The surge: a water lane toward you, then a wave rolls down it. Phase 2: two lanes. */
  surge() {
    const S = this.def.surge, n = pv(S.lanes, this.phase), aim = this.aimAt();
    this.tell(S.windup, 0.5);
    sfxAt(this.game, this.x, this.z, 'water_surge', 'boss_roar');
    for (let i = 0; i < n; i++) {
      const a = aim + (n > 1 ? (i - 0.5) * 2 * S.spread : 0);
      const dir = { x: Math.cos(a), z: Math.sin(a) };
      const ox = this.x + dir.x * this.radius, oz = this.z + dir.z * this.radius;
      const lane = this.scene.fx.chargeLane({ x: ox, z: oz }, { dir, length: S.length, width: S.width, time: S.windup, fade: S.length / S.speed, hole: this.p.pos });
      this.teles.push(lane);
      this.later(S.windup, () => { this.waves.push({ ox, oz, dir, pos: 0, hit: false }); this.game.shake(3, 0.2); });
    }
    return S.windup + S.length / S.speed;
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
    sfxAt(this.game, this.x, this.z, 'steam_build', 'windup');
    return this._ringSelf(B, ['#e8f0f4', '#ff0044', '#e8f0f4'], () => {
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this._steam(this.x + Math.cos(a) * B.radius * 0.7, this.z + Math.sin(a) * B.radius * 0.7, 4); }
      sfxAt(this.game, this.x, this.z, 'steam_blast', 'crash');
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
    super(scene, 'feral_chief', x, z, { elite: true, guard: true, visScale: BOSS.packLord.scale });
    this.lordOf = L;
    // Presence (critic H2 §2.3: it read as one more Feral): drawn at a whole ×BOSS.packLord.scale, on a gold ring.
    const PL = BOSS.packLord;
    if (this.vis && PL.ring) addGroundRing(this.vis, PL.ring[1], PL.ring[0]);
    const night = this.game.run.night;
    this.def = { ...this.def, name: L.def.name, drop: 0, thrust2: { ...this.def.thrust2, chance: L.def.thrust2 ?? 0.75, fromNight: 1 } };
    if (L.def.windup) this.windup = L.def.windup;   // a boss-readable lunge wind-up (s)
    if (L.def.damageK) this.damage = Math.round(this.damage * L.def.damageK);
    this.maxHp = Math.round(BOSS.hp * (L.def.hpK ?? 1) * nightTune('eliteHp', night));
    this.hp = this.maxHp;
    this.phase = 1;
    this.cryCd = 3;
  }

  get ctl() { return this.lordOf.boss; }

  /** A deflected lunge stuns it (ExploreEnemy); its rend waits that out — a parry is yours to punish. */
  deflected(kind) { this.parriedT = 1.2; return super.deflected(kind); }

  hit(dmg, dx, dz, kb = 0, src = '', stagger = 0) {
    if (this.dead || this.returning) return;
    if (!this.ctl.engaged) this.ctl.provoked = true;
    // Winded after its war cry (the opening): × punish.mult; the phase-2 roar armours it.
    const k = (this.roarT > 0 ? BOSS.roarTaken : 1) * (this.openT > 0 ? this.lordOf.def.punish?.mult ?? 1 : 1);
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
    if (this.phase === 2 && this.vis) bossAura(this.scene, 'pack_lord', this.x, this.z, this.vis.userData.vis.height, dt);
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
    this.openT = (this.openT || 0) - dt;
    // Howling (the cry's wind-up): it stands and roars, which is the moment to close in.
    if (this.crying > 0) {
      this.crying -= dt;
      this.vel.x *= 0.8; this.vel.z *= 0.8;
      this._syncVisual(dt);
      return;
    }
    super.update(dt);
    if (this.dead || !this.ctl.engaged) return;
    // The war cry: a ring the size of its reach (`radius`), then it's winded (punish.time s, × punish.mult damage).
    const C = this.lordOf.def.cry, P = this.lordOf.def.punish;
    this.cryCd -= dt;
    if (this.cryCd <= 0 && this.state !== 'windup' && this.state !== 'attack') {
      this.cryCd = pv(C.every, this.phase);
      const sc = this.scene;
      this.tele?.cancel?.();
      this.tele = null;
      this._dropToken?.();
      this.state = 'chase';
      this.crying = C.windup;
      sc.fx.ringTele({ x: this.x, z: this.z }, { radius: C.radius, color: '#feae34', color2: '#f0c040', time: C.windup, fade: 0.1 });
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
          const n = Math.min(C.summon2, C.max - live, C.cap - (this.ctl.summoned || 0));
          for (let i = 0; i < n; i++) this.ctl.summon();
        }
        if (P) { this.openT = P.time; this.stun(P.time, P.label.toUpperCase(), '#fee761'); }
      });
      return;
    }
    this._rend(dt);
  }

  /**
   * The rend (critic I2: a masher out-traded it): stand within `rend.range` and every `rend.every` s it plants its feet
   * (`windup` s, a red ring of `radius`) and spins its blades round itself: roll out, or eat `damage` and a shove.
   */
  _rend(dt) {
    const Rd = this.lordOf.def.rend, sc = this.scene, p = sc.player;
    if (!Rd) return;
    // (Its clock always runs, and it breaks a wind-up or a flinch: a hugging masher can't keep it busy. Never while
    // winded or mid-lunge.)
    this.rendCd = (this.rendCd ?? pv(Rd.every, this.phase)) - dt;
    this.parriedT = (this.parriedT || 0) - dt;
    if (this.rendCd > 0 || this.openT > 0 || this.parriedT > 0 || this.state === 'attack' || p.dead || Math.hypot(p.pos.x - this.x, p.pos.z - this.z) > Rd.range) return;
    this.stunT = 0;
    this.rendCd = pv(Rd.every, this.phase);
    this.tele?.cancel?.();
    this.tele = null;
    this._dropToken?.();
    this.state = 'chase';
    this.crying = Rd.windup;   // (stands still, like the howl)
    sc.fx.ringTele({ x: this.x, z: this.z }, { radius: Rd.radius, color: '#ff0044', color2: '#a22633', time: Rd.windup, fade: 0.08 });
    sfxAt(this.game, this.x, this.z, 'rend_windup', 'windup');
    this.ctl.later(Rd.windup, () => {
      if (this.dead) return;
      sc.fx.ring({ x: this.x, z: this.z }, { color: '#f0c040', radius: Rd.radius, life: 0.3 });
      sc.fx.burst({ x: this.x, y: 0.5, z: this.z }, { color: '#a22633', color2: '#f0c040', count: 18, speed: 4, up: 1.5, life: 0.35, size: 2 / 32 });
      sfxAt(this.game, this.x, this.z, 'rend', 'crack');
      const dx = p.pos.x - this.x, dz = p.pos.z - this.z, d = Math.hypot(dx, dz) || 1e-4;
      if (p.dead || d > Rd.radius + p.r * 0.5) return;
      const dmg = Math.round(Rd.damage * nightTune('enemyDamage', this.game.run.night));
      if (p.hurt(dmg, dx / d, dz / d, this.def.name)) { p.kb.x += (dx / d) * Rd.knock; p.kb.z += (dz / d) * Rd.knock; }
    });
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
    e.minion = true;   // no loot, no kill-heals (JungleScene.onEnemyKilled)
    if (!atStart) this.summoned = (this.summoned || 0) + 1;
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
    const away = Math.hypot(e.x - this.homeX, e.z - this.homeZ);
    if (this.engaged && !e.dead && away > BOSS.leash + 6) this.mgr._disengage(this.L, true);
    // Not in a fight (another boss holds the stage, or it only heard you): it never roams past BOSS.tether of its own
    // lair (critic H2 §5.2: it chased the player into the Warden's fight); it walks back, quietly.
    else if (!this.engaged && !e.dead && !e.returning && away > BOSS.tether) {
      e.tele?.cancel?.();
      e.tele = null;
      e.returning = true;
      e.alerted = false;
      e.state = 'chase';
    }
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
    e.openT = 0; e.crying = 0;
    this.summoned = 0;
    this.sched = [];
  }

  /** The bar's line while it is winded (AreaBosses._updateBar). */
  barNote() { const e = this.enemy, P = this.def.punish; return e.openT > 0 && P ? `${P.label}: hit it! (×${P.mult} damage)` : ''; }
  get openT() { return this.enemy.openT || 0; }

  dispose() {}   // the creature is disposed with the scene's enemies
}
