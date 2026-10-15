// The Stage 7 goal types (critic J M4) for the jungle: escort, defend (the uplink), track (the Alpha), carry (the
// generator core) and purge (the spore bloom). Data and tuning: PRIMARY / GOALS in src/data/objectives.js.
//
// JungleScene owns the objective flow (objStep, _advanceStep, completeObjective, objTargets for the HUD arrow and the
// map ◆); this module places what these step types need and runs them:
//   claims(step) · setupStep(step, si, used) from _setupObjective · update(dt) every frame (before interaction)
//   hittables(out) (spore nests) · onEnemyKilled(e) (the Alpha's relic) · note() (a live line on the goal strip:
//   timers, counts, warnings) · carrying (the scene blocks swings; Player reads scene.moveMult / noRoll)
//   failed (the engineer went down) · dispose()
// "Home" = the Relay or a beacon you switched on (where the escort and the core are taken by the drone).
//
// Wards: creatures that go for the engineer / the uplink instead of you get `e.ward` (JungleScene._updateEnemies
// runs their AI with that ward standing in for the player: same moves, same telegraphs).

import * as THREE from 'three';
import { GOALS } from '../data/objectives.js';
import { DISTRICTS } from '../data/districts.js';
import { DAY, POP, SPORES, LEVEL } from '../data/jungle.js';
import { nightTune } from '../data/config.js';
import { EXPLORE_ENEMIES } from '../data/enemies.js';
import { BOSS } from '../data/bosses.js';
import { setAnim, setFacing, updateVisual, flashVisual, setBaseColor } from '../core/Assets.js';
import { clearDisc, compass } from '../world/JungleGen.js';
import { WORDS } from '../data/guide.js';
import { fmtTime } from '../ui/ui.js';

const TYPES = ['escort', 'defend', 'track', 'carry', 'purge'];

export class Goals {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    this.failed = false;
    this.carrying = false;
    this.npc = null;        // the engineer (escort)
    this.uplink = null;     // the uplink (defend)
    this.clues = [];        // the tracks (track)
    this.alpha = null;      // the Alpha's objective target (track)
    this.core = null;       // the generator core (carry)
    this.nests = [];        // spore nests (purge)
    this.wardT = 0;
    this.noRollT = -9;
    // Player.startRoll asks the scene when rolling is off (carrying the core): say why, now and then.
    scene.onNoRoll = () => {
      if (scene.time - this.noRollT < 4) return;
      this.noRollT = scene.time;
      scene.toast("You can't roll while carrying the core: press E to drop it", 'amber', 2.4);
    };
  }

  /** Does this module set up `step`? (Its own types, plus the Alpha hunt's closing kill step.) */
  claims(step) {
    return TYPES.includes(step.type) || (step.type === 'kill' && this.scene.objDef.steps.some((s) => s.type === 'track'));
  }

  // ================================================================== setup

  /** Place what step `si` needs. `used` = sites already taken by this goal. */
  setupStep(step, si, used) {
    const sc = this.scene;
    const deepSite = () => {
      const s = sc._sitesIn(['major', 'minor'], 1, used, true)[0];
      if (s) { used.push(s); sc.state.used.add(s.id); clearDisc(sc.data, s.x, s.z, 2.2); this._dirty(); }
      return s;
    };
    if (step.type === 'kill') return;   // the Alpha: placed with the tracks (_planTrack)
    if (step.type === 'escort') {
      if (step.phase === 'find') { const s = deepSite(); if (s) this._setupEscort(step, si, s); }
      else sc.objTargets.push(this._homeTarget(si, () => this.npc?.pos));
    } else if (step.type === 'defend') {
      if (step.phase === 'start') this._setupUplink(step, si, deepSite);
      else if (this.uplink) sc.objTargets.push({ step: si, x: this.uplink.x, z: this.uplink.z, done: false });
    } else if (step.type === 'track') {
      if (!this.clues.length) this._planTrack(deepSite());
      const c = this.clues[si];
      if (c) this._setupClue(c, si);
    } else if (step.type === 'carry') {
      if (step.phase === 'pickup') { const s = deepSite(); if (s) this._setupCore(step, si, s); }
      else sc.objTargets.push(this._coreTarget(si));
    } else if (step.type === 'purge') {
      const s = deepSite();
      if (s) this._setupBloom(step, si, s);
    }
  }

  _dirty() { for (const ch of this.scene.world.chunks.values()) ch.dirtyCards = true; }

  /** Nearest home point (the Relay, or a switched-on beacon) to (x, z): { x, z, d, r }. */
  _home(x, z) {
    const sc = this.scene, R = sc.relayPos;
    let best = { x: R.x, z: R.z, d: Math.hypot(R.x - x, R.z - z), r: DAY.relayRadius };
    for (const p of sc.data.pylons) {
      if (!sc.state.pylons.has(p.id)) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < best.d) best = { x: p.x, z: p.z, d, r: DAY.pylonRadius };
    }
    return best;
  }

  /** An objective target that points home from wherever `from()` is (the engineer, the carried core). */
  _homeTarget(si, from) {
    const self = this;
    return {
      step: si, done: false,
      get x() { const f = from() || self.scene.player.pos; return self._home(f.x, f.z).x; },
      get z() { const f = from() || self.scene.player.pos; return self._home(f.x, f.z).z; },
    };
  }

  // ================================================================== escort

  _setupEscort(step, si, s) {
    const sc = this.scene, G = GOALS.escort;
    const p = sc._spotNear(s, 0, 1.5);
    const vis = this.game.assets.makeVisual(this.game.assets.hasSprite(G.sprite) ? G.sprite : 'survivor', { outline: G.outline, silhouette: G.silhouette });
    vis.position.set(p.x, 0, p.z);
    setAnim(vis, 'idle');
    sc.three.add(vis);
    const self = this;
    const npc = this.npc = {
      pos: new THREE.Vector3(p.x, 0, p.z), vel: { x: 0, z: 0 }, kb: { x: 0, z: 0 }, aim: { x: 0, z: 1 }, r: G.radius,
      hp: G.hp, maxHp: G.hp, dead: false, dodging: false, iframes: 0, following: false, crumbs: [], vis, stuckT: 0,
      delivered: false, waiting: false, face: { x: 0, z: 1 },
      // ExploreEnemy calls these on its target (the ward stands in for the player).
      hurt(dmg, dx = 0, dz = 0) { return self._hurtNpc(dmg, dx, dz); },
    };
    this._makeBar(npc, G.bar);
    const it = sc._addInteractable({
      kind: 'primary', step: si, prop: 'engineer', x: p.x, z: p.z, site: s, radius: 1.7, hold: step.hold || 1, keepProgress: true,
      verb: () => 'Lead the engineer home (he follows you)',
      enabled: () => si === sc.objStep,
      onComplete: (t) => {
        t.done = true;
        npc.following = true;
        npc.crumbs = [];
        this.game.sfx.play('escort_go');
        sc.fx.text(npc.pos, '"Lead the way!"', { color: '#63c74d', y: 2.2, life: 1.4 });
        sc._advanceStep(si);
        sc.later(0.8, () => sc.toast(`Lead him to the Relay or a ${WORDS.pylon} you switched on. Creatures will go for him.`, 'amber', 3.6));
      },
    });
    sc.objTargets.push(it);
  }

  _hurtNpc(dmg, dx, dz) {
    const n = this.npc, sc = this.scene;
    if (!n || n.dead || n.delivered || n.iframes > 0) return false;
    dmg = Math.max(1, Math.round(dmg));
    n.hp -= dmg;
    n.iframes = GOALS.escort.hurtIframes;
    const l = Math.hypot(dx, dz) || 1;
    n.kb.x += (dx / l) * 4; n.kb.z += (dz / l) * 4;
    flashVisual(n.vis, '#ff4040', 0.12);
    setAnim(n.vis, 'hurt', true);
    sc.fx.text(n.pos, `-${dmg}`, { color: '#e43b44', y: (n.vis.userData.vis.height || 1.6) + 0.2, life: 0.6, key: n, value: dmg });
    sc.fx.burst(n.pos, { color: '#e43b44', count: 6, speed: 2, up: 2, life: 0.4, size: 0.07, y: 0.6 });
    this.game.sfx.playAt('npc_hurt', n.pos.x, n.pos.z);
    n.barT = 3;
    if (!this._warnedNpc) { this._warnedNpc = true; sc.toast('The engineer is under attack: protect him!', 'bad', 2.6); }
    if (n.hp <= 0) this._npcDown();
    return true;
  }

  _npcDown() {
    const n = this.npc, sc = this.scene;
    n.dead = true;
    n.hp = 0;
    sc.fx.burst(n.pos, { color: '#e43b44', color2: '#f08a24', count: 24, speed: 3, up: 3, life: 0.8, y: 0.6 });
    sc.fades = sc.fades || [];
    sc.fades.push({ v: n.vis, t: 0 });
    n.vis = null;
    n.barBg.visible = n.barFill.visible = false;
    for (const e of sc.enemies) if (e.ward === n) e.ward = null;
    this._fail('The engineer went down', 'He didn\'t make it. The goal can\'t be finished today, but the jungle is still yours to loot');
  }

  _fail(title, sub) {
    const sc = this.scene;
    this.failed = true;
    sc.objectiveFailed = true;
    for (const t of sc.objTargets) t.done = true;
    for (const it of sc.interactables) if (it.kind === 'primary') it.done = true;
    sc._banner('GOAL FAILED', sub);
    this.game.sfx.play('goal_fail');
    sc.toast(title, 'bad', 3);
  }

  _updateNpc(dt) {
    const n = this.npc, sc = this.scene, G = GOALS.escort;
    if (!n || n.dead || n.delivered) return;
    n.iframes -= dt;
    const pl = sc.player.pos;
    let moving = false;
    if (n.following) {
      // Breadcrumbs: your trail (every G.crumb tiles), with loops cut out when you double back.
      const last = n.crumbs[n.crumbs.length - 1];
      if (!last || Math.hypot(pl.x - last.x, pl.z - last.z) >= G.crumb) {
        let cut = -1;
        for (let i = 0; i < n.crumbs.length - 3; i++) if (Math.hypot(n.crumbs[i].x - pl.x, n.crumbs[i].z - pl.z) < 1) { cut = i; break; }
        if (cut >= 0) n.crumbs.length = cut + 1;
        else n.crumbs.push({ x: pl.x, z: pl.z });
        if (n.crumbs.length > 400) n.crumbs.shift();
      }
      const dp = Math.hypot(pl.x - n.pos.x, pl.z - n.pos.z);
      n.waiting = dp > G.wait * 2;
      // Drop crumbs he has reached; walk to the next one until he is `follow` behind you.
      while (n.crumbs.length && Math.hypot(n.crumbs[0].x - n.pos.x, n.crumbs[0].z - n.pos.z) < 0.45) n.crumbs.shift();
      if (dp > G.follow && n.crumbs.length && !n.waiting) {
        const c = n.crumbs[0];
        const dx = c.x - n.pos.x, dz = c.z - n.pos.z, d = Math.hypot(dx, dz) || 1;
        const sp = G.speed * sc.world.speedAt(n.pos.x, n.pos.z);
        const ox = n.pos.x, oz = n.pos.z;
        sc.world.moveBody(n.pos, (dx / d) * sp * dt, (dz / d) * sp * dt, n.r, { nudge: { cone: 40, edge: 0.45, tileEdge: 12 / 32, speed: 0.6 } });
        const prog = Math.hypot(n.pos.x - ox, n.pos.z - oz);
        n.stuckT = prog < sp * dt * 0.25 ? n.stuckT + dt : 0;
        // Wedged on a corner for a while: hop to the crumb (it is where you walked, so it is open ground).
        if (n.stuckT > 1.6) { n.pos.x = c.x; n.pos.z = c.z; n.crumbs.shift(); n.stuckT = 0; }
        n.face = { x: dx / d, z: dz / d };
        moving = true;
      } else n.face = { x: pl.x - n.pos.x, z: pl.z - n.pos.z };
      if (dp > G.wait && !n.toldBehind) { n.toldBehind = true; sc.toast('The engineer is falling behind', 'amber', 2.4); }
      if (dp < G.wait * 0.6) n.toldBehind = false;
      // Home: the drone takes him.
      const h = this._home(n.pos.x, n.pos.z);
      if (h.d < Math.max(G.deliver, h.r + 0.6)) this._deliverNpc();
    } else if (Math.hypot(pl.x - n.pos.x, pl.z - n.pos.z) < 6) n.face = { x: pl.x - n.pos.x, z: pl.z - n.pos.z };
    // Knockback.
    const kd = Math.exp(-9 * dt);
    n.kb.x *= kd; n.kb.z *= kd;
    if (Math.abs(n.kb.x) + Math.abs(n.kb.z) > 0.05) sc.world.moveBody(n.pos, n.kb.x * dt, n.kb.z * dt, n.r);
    if (!n.vis) return;
    n.vis.position.set(n.pos.x, 0, n.pos.z);
    setFacing(n.vis, n.face.x, n.face.z);
    const vis = n.vis.userData.vis;
    if (vis.anim !== 'hurt' || n.iframes <= 0) setAnim(n.vis, moving ? 'walk' : 'idle');
    updateVisual(n.vis, dt);
    this._placeBar(n, dt);
  }

  _deliverNpc() {
    const n = this.npc, sc = this.scene;
    n.delivered = true;
    for (const e of sc.enemies) if (e.ward === n) e.ward = null;
    sc.fx.burst(n.pos, { color: '#2ce8f5', color2: '#ffffff', count: 30, speed: 2, up: 6, life: 1, gravity: -2 });
    sc.fx.ring(n.pos, { color: '#2ce8f5', radius: 2.5, life: 0.6 });
    this.game.sfx.play('escort_home');
    sc.fx.text(n.pos, '"Thanks! I\'ll get to work."', { color: '#63c74d', y: 2.2, life: 1.6 });
    sc.fades = sc.fades || [];
    sc.fades.push({ v: n.vis, t: 0 });
    n.vis = null;
    n.barBg.visible = n.barFill.visible = false;
    sc._advanceStep(sc.objStep);
  }

  // ================================================================== defend (the uplink)

  _setupUplink(step, si, deepSite) {
    const sc = this.scene, G = GOALS.uplink;
    // Today's area beacon, if it is still off: holding the uplink switches it on. Else an uplink terminal at a site.
    const py = sc.data.pylons.find((p) => p.region === sc.regionIdx && !sc.state.pylons.has(p.id) && p.it);
    let x, z, vis = null, site = null;
    if (py) {
      x = py.x; z = py.z + 1.6;
      py.it.hidden = () => !sc.objectiveDone && !this.failed;   // its own "switch on" waits for the uplink
      this._dirty();
    } else {
      site = deepSite();
      if (!site) return;
      const p = sc._spotNear(site, 0, 1.2);
      x = p.x; z = p.z;
      vis = sc._visual('terminal', x, z, { anim: 'off' });
      sc.world.addCollider({ kind: 'prop', type: 'objective', x, z });
    }
    const self = this;
    const u = this.uplink = {
      x, z, vis, pylon: py || null, site, t: 0, running: false, wave: 0, iframes: 0, ring: null,
      // The ward creatures hit (see the header): every hit costs the uplink G.hitCost s.
      pos: { x, z }, vel: { x: 0, z: 0 }, kb: { x: 0, z: 0 }, aim: { x: 0, z: 1 }, r: 0.6, dead: false, dodging: false,
      hurt() { return self._hurtUplink(); },
    };
    const it = sc._addInteractable({
      kind: 'primary', step: si, prop: 'uplink', x, z, site, radius: 1.9, hold: step.hold || 1, keepProgress: true,
      verb: () => 'Start the uplink (creatures will come)',
      enabled: () => si === sc.objStep,
      onComplete: (t) => {
        t.done = true;
        u.running = true;
        this._uplinkRing(true);
        this.game.sfx.play('uplink_boot');
        sc._advanceStep(si);
        sc.toast(`Stay within ${G.radius} m of the uplink while it boots. Creatures are coming!`, 'amber', 3.4);
      },
    });
    sc.objTargets.push(it);
  }

  _uplinkRing(on) {
    const u = this.uplink, sc = this.scene;
    if (!on) {
      if (u.ring) { u.ring.removeFromParent(); u.ring.geometry.dispose(); u.ring.material.dispose(); u.ring.children[0]?.material.dispose(); u.ring = null; }
      return;
    }
    const R = GOALS.uplink.radius;
    const m = new THREE.Mesh(new THREE.RingGeometry(R - 2 / 32, R, 96), new THREE.MeshBasicMaterial({ color: GOALS.uplink.ring, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(u.x, 0.05, u.z);
    // X-ray: where foliage covers the ring it still shows, fainter (drawn only behind the cards, like the charge lanes).
    const xr = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: GOALS.uplink.ring, transparent: true, opacity: 0.45, depthWrite: false, depthFunc: THREE.GreaterDepth, side: THREE.DoubleSide }));
    xr.renderOrder = 38;
    m.add(xr);
    sc.three.add(m);
    u.ring = m;
  }

  _hurtUplink() {
    const u = this.uplink, sc = this.scene, G = GOALS.uplink;
    if (!u.running || u.iframes > 0) return false;
    u.iframes = 0.6;
    u.t = Math.max(0, u.t - G.hitCost);
    sc.fx.text({ x: u.x, z: u.z }, `-${G.hitCost} s`, { color: '#e43b44', cls: 'big', y: 2.4, life: 0.8, key: u, value: G.hitCost });
    sc.fx.burst({ x: u.x, y: 1, z: u.z }, { color: '#fee761', color2: '#2ce8f5', count: 10, speed: 2.4, up: 2.4, life: 0.4, size: 2 / 32 });
    if (u.vis) flashVisual(u.vis, '#ff4040', 0.12);
    else if (u.pylon?.it?.vis) flashVisual(u.pylon.it.vis, '#ff4040', 0.12);
    this.game.sfx.playAt('uplink_hit', u.x, u.z);
    if (!this._warnedUplink) { this._warnedUplink = true; sc.toast('They\'re attacking the uplink: every hit costs it time', 'bad', 2.8); }
    return true;
  }

  _updateUplink(dt) {
    const u = this.uplink, sc = this.scene, G = GOALS.uplink;
    if (!u || !u.running || sc.objectiveDone) return;
    u.iframes -= dt;
    const pl = sc.player.pos;
    u.inside = Math.hypot(pl.x - u.x, pl.z - u.z) <= G.radius;
    if (u.inside && !sc.player.dead) u.t += dt;
    if (u.ring) { u.ring.material.opacity = u.inside ? 0.7 : (Math.floor(sc.time * 4) % 2 ? 0.9 : 0.3); u.ring.children[0].material.opacity = u.ring.material.opacity * 0.65; }
    // Waves.
    while (u.wave < G.waves.length && u.t >= G.waves[u.wave].at) {
      this._uplinkWave(G.waves[u.wave].n);
      u.wave++;
    }
    if (Math.random() < dt * 6) sc.fx.burst({ x: u.x, y: 2.2, z: u.z }, { color: '#2ce8f5', count: 1, speed: 0.6, up: 1.4, life: 0.5, size: 2 / 32, gravity: 0 });
    if (u.t >= G.time) this._uplinkDone();
  }

  _uplinkWave(n) {
    const sc = this.scene, G = GOALS.uplink, u = this.uplink;
    // Today's area adds its own walkers to the mix (no Spitters: they'd never reach the uplink).
    const types = { ...G.types };
    for (const [t, w] of Object.entries(DISTRICTS[sc.district]?.enemies || {})) {
      const k = POP.remap[t] || t;
      if (EXPLORE_ENEMIES[k] && EXPLORE_ENEMIES[k].speed > 0 && k !== 'razorback') types[k] = (types[k] || 0) + w * 0.5;
    }
    const a0 = Math.random() * Math.PI * 2;
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 16; t++) {
        const a = a0 + (Math.random() - 0.5) * 1.6, d = G.spawnDist[0] + Math.random() * (G.spawnDist[1] - G.spawnDist[0]);
        const x = u.x + Math.cos(a) * d, z = u.z + Math.sin(a) * d;
        if (!sc.world.inBounds(Math.floor(x), Math.floor(z)) || sc.world.blockedCircle(x, z, 0.4, true) || sc.world.levelAt(x, z) <= LEVEL.water) continue;
        const e = sc.spawnEnemy(sc.rng.weighted(types), x, z, { spawnIn: true, alerted: true });
        if (Math.random() < G.share && (e.def.attack === 'melee' || e.def.attack === 'charge')) { e.ward = u; e._wardRoll = true; }
        else e._wardRoll = true;
        spawned++;
        break;
      }
    }
    if (spawned) { if (u.wave > 0) sc.toast('More are coming!', 'bad', 2); this.game.sfx.play('ambush'); }
  }

  _uplinkDone() {
    const u = this.uplink, sc = this.scene;
    u.running = false;
    this._uplinkRing(false);
    for (const e of sc.enemies) if (e.ward === u) e.ward = null;
    if (u.vis) setAnim(u.vis, 'on');
    this.game.sfx.play('uplink_online');
    sc.fx.burst({ x: u.x, y: 1.5, z: u.z }, { color: '#2ce8f5', color2: '#ffffff', count: 30, speed: 2, up: 5, life: 0.9 });
    sc._advanceStep(sc.objStep);
    if (u.pylon?.it) {
      // The area's beacon comes on with it (a way home from now on), once the GOAL DONE banner has gone (~3.2 s).
      u.pylon.it.hidden = null;
      sc.later(3.3, () => { if (u.pylon.it.kind === 'pylon') sc._completePylon(u.pylon.it); });
    }
  }

  // ================================================================== track (the Alpha)

  /**
   * Chain the clues from a first site: three legs to reachable points (sites or containers), `follow` m apart and
   * the Alpha's lair `alphaDist` m past the last clue. Seeded tries, scored: legs near their length, turns within
   * `turn` rad, never doubling back onto an earlier clue, a trail that ends far from where it began, and a lair
   * `campGap` tiles clear of Feral camps.
   */
  _planTrack(first) {
    const sc = this.scene, G = GOALS.track, rng = sc.rng, data = sc.data;
    if (!first) return;
    const lairs = sc.bosses?.lairSites?.() || [];
    const camps = data.sites.filter((s) => s.type === 'camp');
    const R = sc.relayPos;
    const near = DAY.objectiveMinDist * 0.5;
    const anchors = [...data.sites.filter((s) => s.type !== 'pylon' && s.type !== 'camp' && !lairs.includes(s)), ...data.containers]
      .filter((a) => Math.hypot(a.x - R.x, a.z - R.z) >= near)
      // (no clue or Alpha at a boss's door: critic J2 §4)
      .filter((a) => !lairs.some((L) => Math.hypot(a.x - L.x, a.z - L.z) < BOSS.clearProps.to[0]));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const start = sc._spotNear(first, 0.5, 2.2);
    const legs = [G.follow, G.follow, G.alphaDist];
    let best = null, bestScore = -Infinity;
    for (let attempt = 0; attempt < G.tries; attempt++) {
      const chain = [start];
      let score = 0, heading = null;
      for (let i = 0; i < legs.length; i++) {
        const [lo, hi] = legs[i], cur = chain[chain.length - 1];
        const cands = anchors.filter((a) => { const d = dist(a, cur); return d >= lo * 0.6 && d <= hi * 1.5 && chain.every((q) => dist(q, a) >= lo * 0.6); });
        if (!cands.length) break;
        const a = rng.pick(cands), d = dist(a, cur), h = Math.atan2(a.z - cur.z, a.x - cur.x);
        score -= (d < lo ? lo - d : d > hi ? d - hi : 0) * 2;
        if (heading != null) score -= Math.max(0, Math.abs(wrap(h - heading)) - G.turn) * 20;
        if (i === legs.length - 1 && camps.some((q) => dist(q, a) < G.campGap)) score -= 30;
        chain.push(a);
        heading = h;
      }
      if (chain.length < legs.length + 1) continue;
      score += dist(chain[chain.length - 1], start) * 0.5;
      if (score > bestScore) { bestScore = score; best = chain; }
    }
    this.clues = [{ x: start.x, z: start.z }];
    let cur = start, heading = Math.atan2(start.z - R.z, start.x - R.x);
    for (let i = 1; i <= legs.length; i++) {
      let p;
      if (best) p = sc._spotNear(best[i], 1.2, 3);
      else {   // (no chain fits: carry straight on)
        const d = (legs[i - 1][0] + legs[i - 1][1]) / 2;
        p = sc._spotNear({ x: Math.max(6, Math.min(data.size - 6, cur.x + Math.cos(heading) * d)), z: Math.max(6, Math.min(data.size - 6, cur.z + Math.sin(heading) * d)) }, 0, 2);
      }
      heading = Math.atan2(p.z - cur.z, p.x - cur.x);
      this.clues.push({ x: p.x, z: p.z });
      cur = p;
    }
    // The last point is the Alpha's lair; pick its beast from today's area.
    const lair = this.clues.pop();
    const table = DISTRICTS[sc.district]?.enemies || {};
    const has = (k) => Object.keys(table).some((t) => (POP.remap[t] || t) === k);
    const beast = G.beasts.find(has) || 'feral';
    const kill = sc.objDef.steps.findIndex((s) => s.type === 'kill');
    clearDisc(data, lair.x, lair.z, 2);
    this.alpha = {
      step: kill, x: lair.x, z: lair.z, kill: beast, spawned: false,
      onSpawn: (e) => {
        e.maxHp = e.hp = Math.round(e.maxHp * G.alphaHp);
        e.alpha = true;
        sc.fx.text({ x: e.x, z: e.z }, 'ALPHA', { color: '#feae34', cls: 'big', y: (e.vis?.userData.vis.height || 1.5) + 0.5, life: 1.6 });
        sc.toast(`The Alpha ${EXPLORE_ENEMIES[beast]?.name || beast}! Kill it`, 'bad', 3);
        this.game.sfx.playAt('alpha_roar', e.x, e.z);
      },
    };
    if (kill >= 0) sc.objTargets.push(this.alpha);
    this._dirty();
  }

  _setupClue(c, si) {
    const sc = this.scene, G = GOALS.track;
    clearDisc(sc.data, c.x, c.z, 1.8);
    this._dirty();
    const decals = G.decals.filter((k) => this.game.assets.hasSprite(k));
    c.vis = [];
    const k0 = decals[si % Math.max(1, decals.length)] || 'dec_footprints';
    c.vis.push(sc._visual(k0, c.x, c.z));
    if (decals.length > 1) c.vis.push(sc._visual(decals[(si + 1) % decals.length], c.x + 0.7, c.z + 0.4));
    const it = sc._addInteractable({
      kind: 'primary', step: si, prop: 'tracks', x: c.x, z: c.z, radius: G.read, hold: 0, walkOver: true,
      verb: () => 'Read the tracks',
      enabled: () => si === sc.objStep,
      onComplete: (t) => {
        t.done = true;
        const next = this.clues[si + 1] || this.alpha;
        sc.fx.burst({ x: c.x, y: 0.3, z: c.z }, { color: '#feae34', color2: '#ffffff', count: 12, speed: 1.8, up: 2, life: 0.5 });
        this.game.sfx.play('clue_found');
        const where = next ? compass(next.x - c.x, next.z - c.z) : '';
        const lines = ['Fresh tracks', 'Claw marks on the bark', 'Bones, picked clean'];
        sc.toast(si + 1 < this.clues.length ? `${lines[si % lines.length]}: it went ${where}` : `${lines[si % lines.length]}: its lair is close, to the ${where}`, 'amber', 3.2);
        sc._advanceStep(si);
      },
    });
    c.it = it;
    sc.objTargets.push(it);
  }

  /** Walking within `read` of the current tracks reads them (no key needed); until then they glint now and then. */
  _updateClues(dt) {
    const sc = this.scene, pl = sc.player.pos, G = GOALS.track;
    for (const c of this.clues) {
      const it = c.it;
      if (!it || it.done || !it.enabled() || sc.player.dead) continue;
      const d = Math.hypot(c.x - pl.x, c.z - pl.z);
      if (d <= G.read) { sc._complete(it); continue; }
      c.glintT = (c.glintT ?? 0) - dt;
      if (d < G.glint[1] && c.glintT <= 0) {
        c.glintT = G.glint[0];
        sc.fx.flash({ x: c.x + (Math.random() - 0.5) * 0.8, y: 0.15, z: c.z + (Math.random() - 0.5) * 0.6 }, { color: '#feae34', size: 9 / 32, life: 0.14 });
      }
    }
  }

  // ================================================================== carry (the generator core)

  _setupCore(step, si, s) {
    const sc = this.scene, G = GOALS.carry;
    const p = sc._spotNear(s, 0, 1.4);
    this.core = { x: p.x, z: p.z, vis: sc._visual(G.sprite, p.x, p.z), it: null, picked: false, carryVis: null, dropLock: false };
    this.core.it = this._coreInteractable(si, step.hold || 0.8, 'Pick up the generator core (slow, no rolling)');
  }

  _coreInteractable(si, hold, verb) {
    const sc = this.scene, c = this.core;
    const it = sc._addInteractable({
      kind: 'primary', step: si, prop: 'core', x: c.x, z: c.z, radius: 1.5, hold, keepProgress: true,
      verb: () => verb,
      enabled: () => si === sc.objStep,
      hidden: () => c.dropLock,
      onComplete: (t) => { t.done = true; this._pickCore(si); },
    });
    if (si === 0) sc.objTargets.push(it);
    return it;
  }

  _coreTarget(si) {
    const self = this;
    const home = this._homeTarget(si, () => self.scene.player.pos);
    return {
      step: si, done: false,
      get x() { return self.core && !self.carrying && self.core.picked ? self.core.x : home.x; },
      get z() { return self.core && !self.carrying && self.core.picked ? self.core.z : home.z; },
    };
  }

  _pickCore(si) {
    const sc = this.scene, c = this.core, G = GOALS.carry;
    const first = !c.picked;
    c.picked = true;
    this.carrying = true;
    sc._removeVis(c);
    c.carryVis = this.game.assets.makeVisual(G.sprite, { shadow: false });
    setAnim(c.carryVis, 'idle');
    sc.three.add(c.carryVis);
    sc.moveMult = G.speed;
    sc.noRoll = true;
    this.game.sfx.play('core_pickup');
    if (first) {
      sc._advanceStep(si);
      sc.toast('Carrying the core: you are slower and can\'t roll or swing. Press E to drop it and fight.', 'amber', 4);
    }
  }

  _dropCore() {
    const sc = this.scene, c = this.core, p = sc.player.pos;
    this.carrying = false;
    sc.moveMult = 1;
    sc.noRoll = false;
    if (c.carryVis) { this.game.assets.disposeVisual(c.carryVis); c.carryVis = null; }
    // Set down a step in front of you (so it shows), or at your feet if that spot is blocked.
    const f = sc.player.aim || { x: 0, z: 1 }, fl = Math.hypot(f.x, f.z) || 1;
    const fx = p.x + (f.x / fl) * GOALS.carry.dropAhead, fz = p.z + (f.z / fl) * GOALS.carry.dropAhead;
    const ok = !sc.world.blockedCircle(fx, fz, 0.3, true) && sc.world.levelAt(fx, fz) > LEVEL.water;
    c.x = Math.round((ok ? fx : p.x) * 2) / 2; c.z = Math.round((ok ? fz : p.z) * 2) / 2;
    c.vis = sc._visual(GOALS.carry.sprite, c.x, c.z);
    c.dropLock = true;   // until E is let go (the same press mustn't pick it straight back up)
    c.it = this._coreInteractable(sc.objStep, GOALS.carry.regrab, 'Pick the core back up');
    this.game.sfx.play('core_drop');
    sc.fx.burst({ x: c.x, y: 0.3, z: c.z }, { color: '#5a4430', count: 6, speed: 1.4, up: 1.4, life: 0.3, size: 0.06 });
  }

  _updateCore(dt) {
    const sc = this.scene, c = this.core, input = this.game.input;
    if (!c) return;
    if (c.dropLock && !input.isDown('KeyE')) c.dropLock = false;
    if (!this.carrying) return;
    const p = sc.player;
    if (p.dead) { this._dropCore(); return; }
    // Above the head, a hair in front so it draws over the player.
    c.carryVis.position.set(p.pos.x, (p.vis?.userData.vis.height || 1.6) * 0.42, p.pos.z + 0.05);
    updateVisual(c.carryVis, dt);
    const h = this._home(p.pos.x, p.pos.z);
    if (h.d < Math.max(GOALS.carry.deliver, h.r + 0.5)) { this._deliverCore(); return; }
    if (input.wasPressed('KeyE')) this._dropCore();
  }

  _deliverCore() {
    const sc = this.scene, c = this.core, p = sc.player.pos;
    this.carrying = false;
    sc.moveMult = 1;
    sc.noRoll = false;
    if (c.carryVis) {
      sc.fades = sc.fades || [];
      sc.fades.push({ v: c.carryVis, t: 0 });
      c.carryVis = null;
    }
    sc.fx.burst(p, { color: '#2ce8f5', color2: '#ffffff', count: 26, speed: 2, up: 6, life: 1, gravity: -2 });
    this.game.sfx.play('core_deliver');
    sc.toast('The drone takes the core', 'good', 2.4);
    c.delivered = true;
    sc._advanceStep(sc.objStep);
  }

  // ================================================================== purge (the spore bloom)

  _setupBloom(step, si, s) {
    const sc = this.scene, G = GOALS.purge;
    const night = this.game.run.night;
    const hpK = nightTune('enemyHp', night);   // the night's creature HP scales the nests too
    const w = sc.world;
    for (let i = 0; i < G.count; i++) {
      // Around the site, the least shaded open spot of a few tries (under a tree crown a nest can't be seen).
      let p = null, best = Infinity;
      for (let t = 0; t < G.tries; t++) {
        const a = (i / G.count) * Math.PI * 2 + (sc.rng.next() - 0.5) * 1.6, d = G.spread[0] + sc.rng.next() * (G.spread[1] - G.spread[0]);
        const x = Math.round((s.x + Math.cos(a) * d) * 2) / 2, z = Math.round((s.z + Math.sin(a) * d) * 2) / 2;
        if (!w.inBounds(Math.floor(x), Math.floor(z)) || w.deepAt(Math.floor(x), Math.floor(z)) || w.levelAt(x, z) <= LEVEL.water) continue;
        if (w.blockedCircle(x, z, 0.7, true) || this.nests.some((q) => Math.hypot(q.x - x, q.z - z) < G.spread[0])) continue;
        const score = w.shadeAt(x, z) + w.shadeAt(x, z + 1.5) * 0.5;   // (crowns south of it hide it too)
        if (score < best) { best = score; p = { x, z }; }
      }
      if (!p) p = sc._spotNear(s, 1.5, 4);
      clearDisc(sc.data, p.x, p.z, 1.5);
      const n = { x: p.x, z: p.z, maxHp: Math.round(G.hp * hpK), hp: 0, popped: false, vis: null, puffT: G.puffEvery * (0.4 + i * 0.25), radius: 0.7 };
      this._growNest(n);
      this.scene._makeNestBar(n);
      this.nests.push(n);
      const self = this;
      sc.objTargets.push({ step: si, x: n.x, z: n.z, get done() { return n.popped || self.failed; }, set done(v) { /* the nest's own state rules */ } });
    }
    this.bloom = { si, t: 0, running: false };
    this._dirty();
  }

  _growNest(n) {
    const sc = this.scene;
    n.hp = n.maxHp;
    n.popped = false;
    n.vis = sc._visual('nest', n.x, n.z);
    setBaseColor(n.vis, GOALS.purge.tint);
  }

  _hitNest(n, dmg, src) {
    const sc = this.scene;
    if (n.popped) return;
    dmg = Math.round(dmg);
    n.hp -= dmg;
    n.barT = 3;
    if (n.vis) flashVisual(n.vis, '#ffffff', 0.09);
    sc.fx.text({ x: n.x, z: n.z }, String(dmg), { color: '#c9d65a', y: 1.4, life: 0.6, key: n, value: dmg });
    sc.fx.burst({ x: n.x, z: n.z }, { color: SPORES.color, color2: SPORES.color2, count: 6, speed: 2, up: 2, life: 0.35, y: 0.5 });
    this.game.sfx.playAt('spore_nest_hit', n.x, n.z);
    if (n.hp > 0) return;
    // Popped: it bursts into a spore cloud (back off!), and the clock starts on the first one.
    n.popped = true;
    sc._removeVis(n);
    n.barBg.visible = n.barFill.visible = false;
    sc.spores?.cloudAt?.(n.x, n.z);
    sc.fx.burst({ x: n.x, z: n.z }, { color: SPORES.color, color2: '#ffffff', count: 30, speed: 3.6, up: 3.5, life: 0.7, size: 2 / 32, y: 0.5 });
    sc.fx.decal({ x: n.x, z: n.z }, { color: '#4a5a24', radius: 0.8, life: 20 });
    this.game.sfx.playAt('spore_nest_pop', n.x, n.z);
    this.game.shake(4, 0.2);
    const B = this.bloom, left = this.nests.filter((q) => !q.popped).length;
    if (!B.running) { B.running = true; B.t = GOALS.purge.time; }
    if (!left) { B.running = false; sc._advanceStep(B.si); return; }
    sc.toast(`Spore nest popped: ${this.nests.length - left}/${this.nests.length}. ${Math.ceil(B.t)} s to pop the rest`, 'amber', 2.6);
  }

  _updateBloom(dt) {
    const sc = this.scene, G = GOALS.purge, B = this.bloom;
    if (!B || sc.objectiveDone || this.failed) return;
    const pl = sc.player.pos;
    for (const n of this.nests) {
      if (n.popped) continue;
      if (n.vis) updateVisual(n.vis, dt);
      const d = Math.hypot(pl.x - n.x, pl.z - n.z);
      // It breathes spores at you when you're close: a ring, then a cloud.
      n.puffT -= dt;
      if (d < G.puffRange && n.puffT <= 0) {
        n.puffT = G.puffEvery;
        // The puff lands on you, a tile beyond where you stand (critic R #6: on the nest itself, popping a nest meant
        // standing in its spores) — step in toward the nest, out of the ring, and the nest is free to hit.
        const k = (Math.max(d, 1.2) + 1) / Math.max(d, 1e-3);
        const at = { x: n.x + (pl.x - n.x) * k, z: n.z + (pl.z - n.z) * k };
        sc.fx.ringTele(at, { radius: SPORES.radius, color: SPORES.color, color2: SPORES.color2, time: G.puffFuse, fade: 0.05 });
        this.game.sfx.playAt('spore_nest_puff', n.x, n.z);
        sc.later(G.puffFuse, () => { if (!n.popped) sc.spores?.cloudAt?.(at.x, at.z); });
      }
      if (Math.random() < dt * 2) sc.fx.burst({ x: n.x, y: 0.8, z: n.z }, { color: SPORES.color, count: 1, speed: 0.4, up: 0.8, life: 0.9, size: 2 / 32, gravity: -0.3 });
      n.barT = (n.barT || 0) - dt;
      const show = (n.barT > 0 || d < 5) && n.hp < n.maxHp;
      n.barBg.visible = n.barFill.visible = show;
      if (show) {
        const y = (n.vis?.userData.vis.height || 1) + 0.3;
        n.barBg.position.set(n.x, y, n.z);
        n.barFill.scale.x = Math.max(0.001, n.hp / n.maxHp);
        n.barFill.position.set(n.x - 0.5, y, n.z);
      }
    }
    if (!B.running) return;
    B.t -= dt;
    if (B.t > 0) return;
    // Too slow: the popped nests grow back.
    B.running = false;
    for (const n of this.nests) if (n.popped) this._growNest(n);
    sc.toast(`The bloom grew back: pop all ${this.nests.length} nests within ${GOALS.purge.time} s`, 'bad', 3.4);
    this.game.sfx.play('bloom_regrow');
  }

  // ================================================================== frame

  hittables(out) {
    for (const n of this.nests) {
      if (n.popped) continue;
      out.push({ x: n.x, z: n.z, radius: n.radius, dead: false, hit: (dmg, _dx, _dz, _kb, src) => this._hitNest(n, dmg, src) });
    }
    return out;
  }

  update(dt) {
    this._updateNpc(dt);
    this._updateUplink(dt);
    this._updateCore(dt);
    this._updateBloom(dt);
    this._updateClues(dt);
    this._assignWards(dt);
  }

  /** A share of the creatures that come for you near the engineer go for him instead. */
  _assignWards(dt) {
    const n = this.npc, sc = this.scene, G = GOALS.escort;
    for (const e of sc.enemies) if (e.ward && (e.ward.dead || e.ward.delivered || (e.ward === this.uplink && !this.uplink.running))) e.ward = null;
    if (!n || !n.following || n.dead || n.delivered) return;
    this.wardT -= dt;
    if (this.wardT > 0) return;
    this.wardT = 0.3;
    for (const e of sc.enemies) {
      if (e.dead || e._wardRoll || !e.alerted || e.hidden || e.lordOf || e.objective) continue;
      if (e.def.attack !== 'melee' && e.def.attack !== 'charge') continue;
      if (Math.hypot(e.x - n.pos.x, e.z - n.pos.z) > G.range) continue;
      e._wardRoll = true;
      if (Math.random() < G.share) e.ward = n;
    }
  }

  onEnemyKilled(e) {
    if (!e.alpha) return;
    const sc = this.scene, r = sc.objDef.relic;
    if (r && !sc.dropRelic?.(e.x, e.z, { rarity: r })) sc._spill({ scrap: 15, circuits: 1, biofiber: 1 }, e.x, e.z, false);
  }

  /** A live line for the goal strip (HTML) — '' when there's nothing to add. */
  note() {
    const sc = this.scene;
    if (sc.objectiveDone || this.failed) return '';
    const s = sc.objDef.steps[sc.objStep];
    if (!s) return '';
    const warn = (t) => ` <span class="g-note warn">${t}</span>`, ok = (t) => ` <span class="g-note">${t}</span>`;
    if (s.type === 'escort' && s.phase === 'lead' && this.npc) {
      const n = this.npc;
      return n.waiting ? warn('he lost you: go back for him') : ok(`(his health ${Math.ceil(n.hp)}/${n.maxHp})`);
    }
    if (s.type === 'defend' && s.phase === 'hold' && this.uplink?.running) {
      const u = this.uplink, left = Math.max(0, GOALS.uplink.time - u.t);
      return u.inside ? ok(`(${fmtTime(left)} to go)`) : warn(`get back to it! (${fmtTime(left)} to go)`);
    }
    if (s.type === 'carry' && s.phase === 'deliver' && this.core) return this.carrying ? ok('(E drops it)') : warn('pick the core back up');
    if (s.type === 'purge' && this.nests.length) {
      const done = this.nests.filter((n) => n.popped).length;
      return ok(`(${done}/${this.nests.length}${this.bloom?.running ? `, ${Math.ceil(this.bloom.t)} s` : ''})`);
    }
    return '';
  }

  // ================================================================== bars, cleanup

  _makeBar(o, color) {
    const mk = (c) => new THREE.Sprite(new THREE.SpriteMaterial({ color: c, depthTest: false, depthWrite: false }));
    o.barBg = mk('#181425'); o.barFill = mk(color);
    o.barFill.center.set(0, 0.5);
    o.barBg.scale.set(0.84, 4 / 32, 1);
    o.barFill.scale.set(0.78, 2 / 32, 1);
    o.barBg.renderOrder = 20; o.barFill.renderOrder = 21;
    o.barBg.visible = o.barFill.visible = false;
    this.scene.three.add(o.barBg, o.barFill);
    o.barT = 0;
  }

  _placeBar(o, dt) {
    o.barT -= dt;
    const show = o.following && (o.hp < o.maxHp || o.barT > 0);
    o.barBg.visible = o.barFill.visible = show;
    if (!show) return;
    const y = (o.vis?.userData.vis.height || 1.6) + 0.25;
    o.barBg.position.set(o.pos.x, y, o.pos.z);
    o.barFill.scale.x = Math.max(0.001, 0.78 * (o.hp / o.maxHp));
    o.barFill.position.set(o.pos.x - 0.39, y, o.pos.z);
  }

  dispose() {
    const A = this.game.assets;
    const sc = this.scene;
    sc.moveMult = 1;
    sc.noRoll = false;
    if (this.npc) { if (this.npc.vis) A.disposeVisual(this.npc.vis); for (const s of [this.npc.barBg, this.npc.barFill]) { s?.removeFromParent(); s?.material.dispose(); } }
    if (this.uplink) { this._uplinkRing(false); if (this.uplink.vis) A.disposeVisual(this.uplink.vis); }
    for (const c of this.clues) for (const v of c.vis || []) A.disposeVisual(v);
    if (this.core) { if (this.core.vis) A.disposeVisual(this.core.vis); if (this.core.carryVis) A.disposeVisual(this.core.carryVis); }
    for (const n of this.nests) { if (n.vis) A.disposeVisual(n.vis); for (const s of [n.barBg, n.barFill]) { s?.removeFromParent(); s?.material.dispose(); } }
  }
}
