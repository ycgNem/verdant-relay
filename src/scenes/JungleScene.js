// Day exploration in the persistent open-world jungle (registered as 'explore').
//
//   params: { district?, objective? }   (defaults: run.district, run.objectiveFor(district))
//
// The world (src/world/JungleGen.js) is generated once per run from run.seed and is the same every day;
// what the player changes persists in run.world (cut undergrowth, opened supplies, activated pylons,
// the explored map). Each day: start at the Relay, cross the jungle to today's district, do the
// objective (marked on the map from the start), loot, and return to the Relay or any activated relay
// pylon before dark. Dusk brings darkness and hunters. Loot is carried until you return.
//
// Combat is melee (src/entities/Player.js): the machete's arc hits enemies, nests and undergrowth
// (scene.meleeHit). Cutting is noisy: wildlife nearby comes to look.
//
// Testers: `vr.game.scene.debug` → teleport(x, z), completeObjective(), giveLoot(), killAll(), timeLeft(s),
// extract(), die(), reveal(), info().

import * as THREE from 'three';
import '../ui/explore.css';
import '../ui/jungle.css';
import { CONFIG, RESOURCES, RESOURCE_KEYS, JUICE, nightTune, STAMINA } from '../data/config.js';
import { DISTRICTS, DISTRICT_KEYS } from '../data/districts.js';
import { PRIMARY, OPTIONAL } from '../data/objectives.js';
import { EXPLORE_ENEMIES } from '../data/enemies.js';
import { JUNGLE, DAY, POP, BRUSH, LEVEL, ATMOS } from '../data/jungle.js';
import { Run } from '../core/Run.js';
import { makeRng, subSeed } from '../core/rng.js';
import { Fx, glowTexture } from '../core/Fx.js';
import { PixelCamera } from '../core/PixelView.js';
import { PostFx } from '../core/PostFx.js';
import { setAnim, updateVisual, setOpacity, flashVisual } from '../core/Assets.js';
import { generateWorld, clearDisc } from '../world/JungleGen.js';
import { JungleWorld } from '../world/JungleWorld.js';
import { Player } from '../entities/Player.js';
import { ExploreEnemy } from '../entities/ExploreEnemy.js';
import { Shots } from '../entities/ExploreShots.js';
import { JungleMap, MAP_MARKERS } from '../ui/JungleMap.js';
import { el, button, bar, toast, modal, fmtTime, resChip, resIcon, resIconHtml, setToastsPaused } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { openSettingsOverlay } from './SettingsScene.js';

const X = () => CONFIG.expedition;
const CONTAINER_NAMES = { crate: 'Crate', chest: 'Tool Chest', cache: 'Rare Cache', intel_terminal: 'Intel Terminal' };

// Sprite keys per prop (first one that exists in the manifest wins; the last is the V1 fallback).
const PROP_KEYS = {
  crate: [['crate'], ['opened', 'supply', 'drop']], chest: [['chest'], []], cache: [['rare'], []],
  intel_terminal: [['intel'], ['pick']], opened: [['opened'], []], fuse: [['fuse'], []], power_box: [['power', 'box'], []],
  terminal: [['data', 'terminal'], ['intel']], pump: [['pump'], []], cell_cache: [['cell'], []], nest: [['nest'], []],
  data_log: [['drive'], []], locked_cache: [['locked'], []], workbench: [['workbench'], []], pylon: [['pylon'], []],
  campfire: [['campfire'], []],
};
const V1_FALLBACK = { pylon: 'beacon', campfire: 'lamp_post', data_log: 'data_log' };

/** The cached world for a run (generation takes ~150 ms; it never changes within a run). */
function worldFor(game, run) {
  if (game._jungle?.seed !== run.seed) game._jungle = { seed: run.seed, data: generateWorld(run.seed, DISTRICT_KEYS) };
  return game._jungle.data;
}

export class JungleScene {
  constructor(game) {
    this.game = game;
  }

  // ================================================================== setup

  enter(params = {}) {
    const game = this.game;
    if (!game.run) game.run = Run.create(game.meta);
    const run = game.run;
    this.district = params.district || run.district || DISTRICT_KEYS[0];
    if (run.district !== this.district) run.chooseDistrict(this.district);
    this.D = DISTRICTS[this.district];
    this.regionIdx = DISTRICT_KEYS.indexOf(this.district);
    this.objKey = params.objective || run.objectiveFor(this.district);
    this.objDef = PRIMARY[this.objKey];

    // ---- world data + persistent state
    this.data = worldFor(game, run);
    this.state = run.worldState(this.data.size, JUNGLE.explore.cell);
    if (this.state.day !== run.night) {
      if (this.state.day > 0) JungleWorld.regrow(this.data, this.state.cut, subSeed(run.seed, run.night, 'regrow'));
      this.state.day = run.night;
    }
    this.rng = makeRng(subSeed(run.seed, run.night, 'day', this.district));

    // ---- 3D
    this.three = new THREE.Scene();
    this.three.background = new THREE.Color('#0b120c');
    this.camera = new PixelCamera({ dist: 30, near: 1, far: 90 });
    this.camera.setSize(game.width, game.height);
    game.assets.setTint('#ffffff');
    this.post = new PostFx(game);
    this.world = new JungleWorld(game, this.three, this.data, this.state.cut);
    this.post.uniforms.tShade.value = this.world.shadeTex;
    this.post.uniforms.uWorld.value = this.data.size;
    this.fx = new Fx(game, this.three, this.camera);
    this.shots = new Shots(this);
    const c = this.data.center;
    this.relayPos = { x: c.x, z: c.z };
    this.player = new Player(this, c.x + DAY.startOffset[0], c.z + DAY.startOffset[1]);
    this.camFocus = new THREE.Vector3(this.player.pos.x, 0, this.player.pos.z);

    // ---- expedition state
    this.time = 0;
    this.dayT = 0;
    this.duskK = 0;
    this.huntT = 0;
    this.carried = { scrap: 0, circuits: 0, biofiber: 0, intel: 0 };
    this.kills = 0;
    this.spEarned = 0;
    this.optionalsDone = [];
    this.eventsDone = [];
    this.objectiveDone = false;
    this.objStep = 0;
    this.stepCount = 0;
    this.paused = false;
    this.mapOpen = false;
    this.ending = false;
    this.finished = false;
    this.timeScale = 1;
    this.timers = [];
    this.enemies = [];
    this.pickups = [];
    this.interactables = [];
    this.nests = [];
    this.props = [];             // non-interactive visuals (campfires, relay)
    this.killed = new Set();     // wildlife ids killed today (they stay dead until tomorrow)
    this.spawned = new Map();    // wildlife id → enemy
    this.pops = new Map();       // chunk key → spawn specs
    this.flow = { through: null, blocked: null, tx: -999, tz: -999, t: 0 };
    this.holdTarget = null;
    this.warned = {};
    this.medFullT = 0;
    this.seen = new Set();       // announced sites

    this._buildRelay();
    this._buildPylons();
    this._buildContainers();
    this._setupObjective();
    this._setupOptionals();
    this.map = new JungleMap(this.data, this.state.explored);
    this.map.reveal(c.x, c.z, JUNGLE.relayClearing + 6);
    for (const p of this.data.pylons) if (this.state.pylons.has(p.id)) this.map.reveal(p.x, p.z, 6);
    this._buildHud();

    this.world.warm(this.player.pos.x, this.player.pos.z);
    this._placeCamera(0, true);

    this._onVis = () => { if (document.hidden && !this.ending) this.setPaused(true); };
    document.addEventListener('visibilitychange', this._onVis);
    game.stage.style.cursor = 'none';
    game.music?.play('day');

    this._hintQueue = [];
    this._hint('jungle_move', '<b>WASD</b> move · <b>LMB</b> slash (3-hit combo) · hold <b>RMB</b> heavy chop · <b>Space</b> roll · <b>E</b> interact · <b>Q</b> med kit · <b>Tab</b> map', 'bottom-left', 12);
    this.later(5, () => this._hint('jungle_cut', 'The machete <b>cuts undergrowth</b>: slash through thickets to make your own paths. A <b>heavy chop</b> clears thorny brambles. Cutting is <b>loud</b>.', 'bottom-left', 11));
    this.later(18, () => this._hint('jungle_return', `Your objective is marked <span style="color:#feae34">◆</span>. Return to the <span style="color:#2ce8f5">Relay</span> or an activated <span style="color:#2ce8f5">pylon</span> to bank your loot. After sunset the jungle hunts you.`, 'bottom-left', 11));

    this.debug = this._makeDebug();
    toast(game.ui, `${this.D.name} — ${this.objDef.name}`, 'amber', 3);
  }

  later(t, fn) { this.timers.push({ t, fn }); }
  toast(text, cls = '', time = 2.4) { toast(this.game.ui, text, cls, time); }

  _hint(id, html, pos = 'bottom-left', time = 10) { this._hintQueue.push({ id, html, pos, time }); }
  _pumpHints() {
    if (!this._hintQueue.length || this.game.ui.querySelector('.hint')) return;
    const h = this._hintQueue.shift();
    showHint(this.game, h.id, h.html, { pos: h.pos, time: h.time });
  }

  /** First manifest sprite key matching a prop, or its V1 fallback. */
  _propKey(name) {
    const A = this.game.assets;
    const spec = PROP_KEYS[name];
    if (spec) {
      const [inc, exc] = spec;
      const k = Object.keys(A.manifest || {}).find((key) => key.startsWith('prop_') && inc.every((t) => key.includes(t)) && !exc.some((t) => key.includes(t)));
      if (k) return k;
    }
    return V1_FALLBACK[name] || name;
  }

  _visual(name, x, z, opts = {}) {
    const v = this.game.assets.makeVisual(this._propKey(name), opts);
    v.position.set(x, 0, z);
    setAnim(v, opts.anim || 'idle');
    this.three.add(v);
    return v;
  }

  _buildRelay() {
    const c = this.relayPos;
    const v = this.game.assets.makeVisual('relay_core');
    v.position.set(c.x, 0, c.z);
    setAnim(v, 'idle');
    this.three.add(v);
    this.props.push(v);
    this.world.addCollider({ kind: 'prop', type: 'relay', x: c.x, z: c.z, r: 1.3 });
    this.relayIt = this._addInteractable({
      kind: 'extract', x: c.x, z: c.z, radius: DAY.relayRadius, hold: DAY.extractHold, keepProgress: false, objectiveHold: true,
      verb: () => (this.objectiveDone ? 'Return to the Relay (bank your loot)' : 'Return to the Relay — objective not done'),
      onComplete: (it) => { it.done = false; this._extract(); },
    });
  }

  _buildPylons() {
    for (const p of this.data.pylons) {
      const on = this.state.pylons.has(p.id);
      const v = this._visual('pylon', p.x, p.z);
      const it = this._addInteractable({
        kind: on ? 'extract' : 'pylon', pylon: p, x: p.x, z: p.z, vis: v, radius: on ? DAY.pylonRadius : 1.6,
        hold: on ? DAY.extractHold : DAY.pylonHold, keepProgress: !on, objectiveHold: on,
        verb: () => (it.kind === 'extract' ? 'Extract here (bank your loot)' : 'Activate the relay pylon'),
        onComplete: (t) => this._completePylon(t),
      });
      p.it = it;
      this._pylonGlow(it, on);
    }
  }

  _pylonGlow(it, on) {
    if (it.glow) it.glow.visible = on;
    if (!on || it.glow) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6), new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#2ce8f5', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(it.x, 0.02, it.z);
    m.userData.pxSnap = true;
    this.three.add(m);
    it.glow = m;
  }

  _completePylon(it) {
    if (it.kind === 'extract') { it.done = false; this._extract(); return; }
    // Activated: it becomes an extraction point for the rest of the run and maps its surroundings.
    it.done = false;
    it.kind = 'extract';
    it.hold = DAY.extractHold;
    it.radius = DAY.pylonRadius;
    it.keepProgress = false;
    it.objectiveHold = true;
    it.progress = 0;
    this.state.pylons.add(it.pylon.id);
    this.map.reveal(it.x, it.z, DAY.pylonReveal);
    this._pylonGlow(it, true);
    this.game.sfx.play('done');
    this.fx.ring({ x: it.x, z: it.z }, { color: '#2ce8f5', radius: 3, life: 0.6 });
    this.fx.burst({ x: it.x, z: it.z }, { color: '#2ce8f5', color2: '#ffffff', count: 30, speed: 2, up: 5, life: 0.9, y: 1.5 });
    this._banner('PYLON ONLINE', 'You can return to the Relay from here — today and every day after');
  }

  _buildContainers() {
    const run = this.game.run;
    for (const c of this.data.containers) {
      const opened = this.state.opened.has(c.id);
      // Hidden caches only show once you are close (they sit in the brush).
      const v = this._visual(opened ? 'opened' : c.type, c.x, c.z);
      if (!opened) this.world.addCollider({ kind: 'prop', x: c.x, z: c.z - 0.05, r: 0.3 });
      const district = DISTRICTS[DISTRICT_KEYS[c.region]] || this.D;
      this._addInteractable({
        kind: 'container', type: c.type, cont: c, x: c.x, z: c.z, vis: v, done: opened, radius: 1.35,
        hold: X().containers[c.type].hold, keepProgress: true,
        verb: () => `Open ${CONTAINER_NAMES[c.type]}`,
        onComplete: (it) => this._openContainer(it, rollLoot(makeRng(subSeed(run.seed, 'loot', c.id)), c.type, district, run)),
      });
    }
  }

  // ================================================================== objectives

  /** Pick today's objective sites in the target district (never a site used on an earlier day). */
  _sitesIn(types, n = 1, exclude = []) {
    const ri = this.regionIdx;
    const all = this.data.sites.filter((s) => s.region === ri && !this.state.used.has(s.id) && !exclude.includes(s));
    const out = [];
    for (const t of types) {
      for (const s of this.rng.shuffle(all.filter((x) => x.type === t))) { if (out.length < n && !out.includes(s)) out.push(s); }
    }
    // Fall back to any site in the region, then anywhere.
    if (out.length < n) for (const s of this.rng.shuffle(this.data.sites.filter((x) => x.region === ri && !out.includes(x) && !exclude.includes(x) && x.type !== 'pylon'))) if (out.length < n) out.push(s);
    if (out.length < n) for (const s of this.rng.shuffle(this.data.sites.filter((x) => !out.includes(x) && !exclude.includes(x) && x.type !== 'pylon'))) if (out.length < n) out.push(s);
    return out;
  }

  _spotNear(s, minR = 0, maxR = 2.5) {
    for (let t = 0; t < 40; t++) {
      const a = this.rng.next() * Math.PI * 2, d = minR + this.rng.next() * (maxR - minR);
      const x = Math.round((s.x + Math.cos(a) * d) * 2) / 2, z = Math.round((s.z + Math.sin(a) * d) * 2) / 2;
      if (!this.world.blockedCircle(x, z, 0.45, true) && this.world.levelAt(x, z) > LEVEL.water) return { x, z };
    }
    return { x: s.x, z: s.z };
  }

  _setupObjective() {
    const def = this.objDef;
    this.objTargets = [];
    const used = [];
    def.steps.forEach((step, si) => {
      const count = step.count || 1;
      const types = step.room === 'side' ? ['minor', 'landmark', 'camp'] : ['major', 'minor'];
      const sites = this._sitesIn(types, count, used);
      sites.forEach((s) => {
        used.push(s);
        this.state.used.add(s.id);
        clearDisc(this.data, s.x, s.z, 2.2);
        for (const ch of this.world.chunks.values()) ch.dirtyCards = true;
        const p = this._spotNear(s, 0, 1.5);
        if (step.type === 'kill') {
          this.objTargets.push({ step: si, site: s, x: p.x, z: p.z, kill: step.enemy, spawned: false });
          return;
        }
        const it = this._addInteractable({
          kind: 'primary', step: si, prop: step.prop, x: p.x, z: p.z, site: s,
          radius: step.type === 'pickup' ? 1.2 : 1.5, hold: step.type === 'pickup' ? 0 : step.hold || 1.5, walkOver: step.type === 'pickup',
          keepProgress: true, spawnDuring: step.spawnDuring ? Math.min(step.spawnDuring, nightTune('holdSpawns', this.game.run.night)) : 0, spawned: 0,
          guards: step.guards ? Math.min(step.guards, nightTune('guards', this.game.run.night)) : 0,
          verb: () => step.label,
          enabled: () => si === this.objStep,
          onComplete: (t) => this._stepDone(t, step, count),
        });
        it.vis = this._visual(step.prop, p.x, p.z, { anim: 'off' });
        if (step.type !== 'pickup') this.world.addCollider({ kind: 'prop', x: p.x, z: p.z - 0.1, r: 0.35 });
        this.objTargets.push(it);
      });
    });
  }

  _stepDone(it, step, count) {
    if (step.type === 'pickup') {
      this._removeVis(it);
      this.toast(`Got the ${step.prop}`, 'good');
      this.game.sfx.play('pickup');
    } else if (it.vis) setAnim(it.vis, 'on');
    this.fx.burst({ x: it.x, z: it.z }, { color: '#feae34', color2: '#ffffff', count: 16, speed: 2.2, up: 3, life: 0.5, y: 0.6 });
    this._advanceStep(it.step, count);
  }

  _advanceStep(step, needed = 1) {
    if (step !== this.objStep || this.objectiveDone) return;
    this.stepCount += 1;
    if (this.stepCount < needed) {
      this.toast(`${this.objDef.steps[step].label}: ${this.stepCount}/${needed}`, 'amber');
      this.game.sfx.play('done');
      return;
    }
    this.objStep += 1;
    this.stepCount = 0;
    if (this.objStep >= this.objDef.steps.length) this.completeObjective();
    else { this.game.sfx.play('done'); this.toast(this.objDef.steps[this.objStep].label, 'amber', 3); }
  }

  completeObjective() {
    if (this.objectiveDone) return;
    this.objectiveDone = true;
    this.objStep = this.objDef.steps.length;
    this._grantSkillPoint();
    this.game.sfx.play('done');
    this._banner('OBJECTIVE COMPLETE', 'Return to the Relay or a pylon to claim it — or keep exploring');
    for (const it of this.interactables) if (it.kind === 'primary') it.done = true;
  }

  _grantSkillPoint() {
    if (this.spEarned >= X().maxSkillPoints) return false;
    this.spEarned += 1;
    this.later(0.6, () => this.toast('+1 skill point', 'good'));
    return true;
  }

  _setupOptionals() {
    const night = this.game.run.night;
    const n = night <= 1 ? 1 : 2;
    const keys = this.rng.shuffle(['nest', 'survivor', 'data_log', 'locked_cache']).slice(0, n);
    const taken = this.objTargets.map((t) => t.site);
    for (const key of keys) {
      const def = OPTIONAL[key];
      const s = this._sitesIn(key === 'nest' ? ['camp', 'minor'] : key === 'data_log' ? ['landmark', 'minor'] : ['minor', 'major', 'camp'], 1, taken)[0];
      if (!s) continue;
      taken.push(s);
      this.state.used.add(s.id);
      clearDisc(this.data, s.x, s.z, 2);
      const p = this._spotNear(s, 0, 1.2);
      if (key === 'nest') {
        const v = this._visual('nest', p.x, p.z);
        this.world.addCollider({ kind: 'prop', x: p.x, z: p.z - 0.1, r: 0.55 });
        const nest = { key, x: p.x, z: p.z, vis: v, hp: def.hp, maxHp: def.hp, radius: 0.7, dead: false, spawnT: 3, alive: [], site: s, optional: true };
        this._makeNestBar(nest);
        this.nests.push(nest);
        continue;
      }
      const it = this._addInteractable({
        kind: 'optional', key, x: p.x, z: p.z, site: s, radius: 1.4, hold: def.type === 'pickup' ? 0 : def.hold || 1.5, walkOver: def.type === 'pickup', keepProgress: true,
        verb: () => def.name,
        onComplete: (t) => this._completeOptional(t, def),
      });
      it.vis = this._visual(key, p.x, p.z, { anim: key === 'locked_cache' ? 'off' : 'idle' });
      if (key !== 'data_log') this.world.addCollider({ kind: 'prop', x: p.x, z: p.z - 0.1, r: 0.35 });
    }
    for (const ch of this.world.chunks.values()) ch.dirtyCards = true;
  }

  _completeOptional(it, def) {
    it.done = true;
    if (it.vis) {
      if (def.type === 'pickup') this._removeVis(it);
      else setAnim(it.vis, 'on');
    }
    const rec = { key: it.key, name: def.name };
    if (def.flag) rec.flag = def.flag;
    if (def.research) rec.research = def.research;
    this.optionalsDone.push(rec);
    if (def.reward) this._spill(def.reward, it.x, it.z, true);
    this.fx.burst({ x: it.x, z: it.z }, { color: '#c47bff', color2: '#ffffff', count: 18, speed: 2.4, up: 3, life: 0.6, y: 0.5 });
    this.game.sfx.play('done');
    this.toast(`Optional complete: ${def.name}`, 'good', 3);
    if (def.flag) this.later(0.4, () => this.toast(def.flag.text, 'amber', 3.2));
    if (def.skillPoint && !this._grantSkillPoint()) this.later(0.6, () => this.toast('Skill point cap reached for this expedition', 'amber'));
    if (it.key === 'survivor' && it.vis) {
      const v = it.vis;
      it.vis = null;
      this.fades = this.fades || [];
      this.fades.push({ v, t: 0 });
    }
  }

  _makeNestBar(n) {
    const mk = (c) => new THREE.Sprite(new THREE.SpriteMaterial({ color: c, depthTest: false, depthWrite: false }));
    n.barBg = mk('#181425'); n.barFill = mk('#c47bff');
    n.barFill.center.set(0, 0.5);
    n.barBg.scale.set(1.08, 4 / 32, 1);
    n.barFill.scale.set(1, 2 / 32, 1);
    n.barBg.renderOrder = 20; n.barFill.renderOrder = 21;
    n.barBg.visible = n.barFill.visible = false;
    this.three.add(n.barBg, n.barFill);
    n.barT = 0;
  }

  _hitNest(n, dmg, src) {
    if (n.dead) return;
    dmg = Math.round(dmg);
    n.hp -= dmg;
    n.barT = 3;
    flashVisual(n.vis, '#ffffff', 0.09);
    this.fx.text({ x: n.x, z: n.z }, String(dmg), { color: '#ead4aa', y: (n.vis?.userData.vis.height || 1) + 0.6, life: 0.6, key: n, value: dmg });
    this.fx.burst({ x: n.x, z: n.z }, { color: '#b55088', count: 6, speed: 2, up: 2, life: 0.35, y: 0.5 });
    this.fx.hitStop(src === 'chop' ? JUICE.hitStop.cutterHit * 1.6 : JUICE.hitStop.cutterHit);
    this.game.sfx.play('hit');
    if (n.hp <= 0) {
      n.dead = true;
      this.fx.burst({ x: n.x, z: n.z }, { color: '#b55088', color2: '#ff0044', count: 40, speed: 4, up: 4, life: 0.8, size: 0.1, y: 0.5 });
      this.fx.ring({ x: n.x, z: n.z }, { color: '#ff0044', radius: 2.5, life: 0.5 });
      this.fx.decal({ x: n.x, z: n.z }, { color: '#4a1f3a', radius: 0.9, life: 8 });
      this.fx.hitStop(JUICE.hitStop.eliteKill);
      this.game.sfx.play('boom');
      this.game.shake(6, 0.3);
      this._removeVis(n);
      n.barBg.visible = n.barFill.visible = false;
      this._completeOptional({ key: n.key, x: n.x, z: n.z, done: false, vis: null }, OPTIONAL[n.key]);
    }
  }

  _updateNests(dt) {
    const N = X().nest;
    const pl = this.player.pos;
    for (const n of this.nests) {
      if (n.dead) continue;
      if (n.vis) updateVisual(n.vis, dt);
      n.alive = n.alive.filter((e) => !e.dead);
      const d = Math.hypot(pl.x - n.x, pl.z - n.z);
      if (d < N.radius && n.alive.length < N.maxAlive) {
        n.spawnT -= dt;
        if (n.spawnT <= 0) {
          n.spawnT = N.spawnEvery;
          const p = this._openSpot(n.x, n.z, 1.2, 2.5);
          if (p) n.alive.push(this.spawnEnemy(this.rng.weighted(N.types), p.x, p.z, { spawnIn: true, alerted: true }));
        }
      }
      n.barT -= dt;
      const show = n.barT > 0 || d < 5;
      n.barBg.visible = n.barFill.visible = show && n.hp < n.maxHp;
      if (show) {
        const y = (n.vis?.userData.vis.height || 1) + 0.3;
        n.barBg.position.set(n.x, y, n.z);
        n.barFill.scale.x = Math.max(0.001, n.hp / n.maxHp);
        n.barFill.position.set(n.x - 0.5, y, n.z);
      }
    }
  }

  // ================================================================== interactables & loot

  _addInteractable(o) {
    const it = { progress: 0, done: false, enabled: () => true, ...o };
    this.interactables.push(it);
    return it;
  }

  _removeVis(it) {
    if (!it.vis) return;
    this.game.assets.disposeVisual(it.vis);
    it.vis = null;
  }

  _openContainer(it, loot) {
    it.done = true;
    this.state.opened.add(it.cont.id);
    this.game.sfx.play('open');
    this._removeVis(it);
    it.vis = this._visual('opened', it.x, it.z);
    this.fx.burst({ x: it.x, z: it.z }, { color: '#e4a672', color2: '#feae34', count: 10, speed: 2, up: 3, life: 0.4, y: 0.4 });
    this._spill(loot, it.x, it.z, true);
    if (!this.warned.loot) {
      this.warned.loot = true;
      this._hint('jungle_loot', 'Loot is <b>carried</b> (top-left) until you get back to the <b>Relay</b> or an activated <b>pylon</b>. Go down out here and it\'s lost.', 'bottom-left', 10);
    }
  }

  _spill(loot, x, z, fromSolid) {
    const pieces = [];
    for (const k of RESOURCE_KEYS) {
      let n = loot[k] || 0;
      if (!n) continue;
      if (k === 'scrap') {
        const chunks = Math.min(4, Math.max(1, Math.round(n / 6)));
        for (let c = 0; c < chunks; c++) { const a = Math.floor(n / (chunks - c)); pieces.push([k, a]); n -= a; }
      } else for (let c = 0; c < n; c++) pieces.push([k, 1]);
    }
    if (loot.med) pieces.push(['med', 1]);
    pieces.forEach(([k, a], i) => {
      const ang = (i / pieces.length) * Math.PI * 2 + Math.random() * 0.6;
      const sp = 1.6 + Math.random() * 1.4;
      this.spawnPickup(k, a, x, z, { vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp, delay: 0.35 + i * 0.03, out: fromSolid ? 0.55 : 0 });
    });
  }

  spawnPickup(res, amount, x, z, o = {}) {
    const key = res === 'med' ? 'pick_med' : `pick_${res}`;
    const v = this.game.assets.makeVisual(key);
    const p = { res, amount, x, z, y: 0.3, vx: o.vx || 0, vz: o.vz || 0, vy: 3.2, vis: v, age: 0, delay: o.delay ?? 0.3, bob: Math.random() * 6, dead: false };
    if (o.out) { const l = Math.hypot(p.vx, p.vz) || 1; p.x += (p.vx / l) * o.out; p.z += (p.vz / l) * o.out; }
    setAnim(v, 'idle');
    v.position.set(p.x, p.y, p.z);
    this.three.add(v);
    if (!this._glowMats) this._glowMats = {};
    const gc = res === 'med' ? '#e43b44' : RESOURCES[res].color;
    if (!this._glowMats[gc]) this._glowMats[gc] = new THREE.MeshBasicMaterial({ map: glowTexture(), color: gc, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    if (!this._glowGeom) this._glowGeom = new THREE.PlaneGeometry(20 / 32, 10 / 32);
    p.glow = new THREE.Mesh(this._glowGeom, this._glowMats[gc]);
    p.glow.rotation.x = -Math.PI / 2;
    p.glow.userData.pxSnap = true;
    p.glow.position.set(p.x, 0.016, p.z);
    this.three.add(p.glow);
    p.sparkT = Math.random() * JUICE.pickup.sparkleEvery;
    this.pickups.push(p);
    return p;
  }

  _updatePickups(dt) {
    const pl = this.player;
    const magnet = CONFIG.player.pickupRadius * (this.game.run.hasSkill('pack_rat_1') ? X().packRatMagnet : 1);
    this.medFullT -= dt;
    for (const p of this.pickups) {
      if (p.dead) continue;
      p.age += dt;
      if (p.y > 0 || p.vy > 0) {
        p.vy -= 14 * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) { p.y = 0; p.vy = Math.abs(p.vy) > 1.5 ? -p.vy * 0.35 : 0; }
      }
      const fr = Math.exp(-3 * dt);
      p.vx *= fr; p.vz *= fr;
      if (!p.magnet && Math.abs(p.vx) + Math.abs(p.vz) > 0.01) this.world.moveBody(p, p.vx * dt, p.vz * dt, 0.15, { throughBrush: true });
      const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const full = p.res === 'med' && pl.meds >= CONFIG.player.maxMeds;
      if (!pl.dead && !full && p.age > p.delay && d < magnet) {
        p.magnet = true;
        const sp = CONFIG.player.pickupSpeed * (1.2 - d / magnet) + 2;
        const step = Math.min(d, sp * dt);
        p.x += (dx / d) * step; p.z += (dz / d) * step;
      } else p.magnet = false;
      if (!pl.dead && d < 0.6 && p.age > p.delay * 0.5) {
        if (full) {
          if (this.medFullT <= 0) { this.fx.text(pl.pos, 'Med kits full', { color: '#8b9bb4', y: this._headY() }); this.medFullT = 2; }
        } else this._collect(p);
      }
      const bob = p.y === 0 && Math.sin(p.age * 3.2 + p.bob) > 0 ? (JUICE.pickup.bobPx * 2) / 32 : 0;
      p.vis.position.set(p.x, p.y + 0.05 + bob, p.z);
      p.glow.position.set(p.x, 0.016, p.z);
      p.glow.visible = !p.magnet;
      updateVisual(p.vis, dt);
      p.sparkT -= dt;
      if (p.sparkT <= 0 && p.y === 0) {
        p.sparkT = JUICE.pickup.sparkleEvery * (0.75 + Math.random() * 0.5);
        this.fx.flash({ x: p.x + (Math.random() - 0.5) * 0.2, y: p.y + 0.25 + Math.random() * 0.15, z: p.z }, { color: '#ffffff', size: 9 / 32, life: 0.09 });
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (this.pickups[i].dead) { this.game.assets.disposeVisual(this.pickups[i].vis); this.pickups[i].glow.removeFromParent(); this.pickups.splice(i, 1); }
    }
  }

  _headY() { return (this.player.vis?.userData.vis.height || 1.6) + 0.3; }

  _collect(p) {
    p.dead = true;
    this.fx.flash({ x: p.x, y: 0.3, z: p.z }, { color: '#ffffff', size: 9 / 32, life: 0.06 });
    if (p.res === 'med') {
      this.player.meds += 1;
      this.fx.text(this.player.pos, '', { html: `+1 ${resIconHtml('pick_med')} Med kit`, color: '#e43b44', y: this._headY() });
      this._flyLoot(p, 'pick_med', this.hud.meds);
    } else {
      this.carried[p.res] += p.amount;
      const r = RESOURCES[p.res];
      this.fx.text(this.player.pos, '', { html: `+${p.amount} ${resIconHtml(p.res)} ${r.label}`, color: r.color, y: this._headY(), key: `loot-${p.res}`, value: p.amount });
      this._flyLoot(p, p.res, this.hud.loot[p.res].chip, () => this._bumpLoot(p.res));
    }
    this.game.sfx.play('pickup');
  }

  _flyLoot(p, key, target, done) {
    const ui = this.game.ui;
    if (!target || !target.isConnected) { done?.(); return; }
    const sr = this.game.stage.getBoundingClientRect();
    const from = this.game.project(new THREE.Vector3(p.x, 0.3, p.z), this.camera);
    const r = target.getBoundingClientRect();
    const tx = r.left - sr.left + Math.min(r.width * 0.3, 14), ty = r.top - sr.top + r.height / 2;
    const n = resIcon(key, { cls: 'x-fly' });
    ui.append(n);
    const at = (x, y, s) => `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%) scale(${s})`;
    const mx = (from.x + tx) / 2, my = Math.min(from.y, ty) - 40 * (sr.width / 960);
    const ms = JUICE.pickup.flyTime * 1000;
    n.style.transform = at(from.x, from.y, 1.3);
    if (n.animate) n.animate([{ transform: at(from.x, from.y, 1.3) }, { transform: at(mx, my, 1.15), offset: 0.45 }, { transform: at(tx, ty, 0.9) }], { duration: ms, easing: 'ease-in', fill: 'forwards' });
    setTimeout(() => { n.remove(); done?.(); }, ms);
  }

  // ================================================================== combat

  hittables() {
    const out = this.enemies.filter((e) => !e.dead);
    for (const n of this.nests) if (!n.dead) out.push({ x: n.x, z: n.z, radius: n.radius, dead: false, hit: (dmg, _dx, _dz, _kb, src) => this._hitNest(n, dmg, src) });
    return out;
  }

  /** The machete connects: hit every enemy, nest and undergrowth tile inside the arc. */
  meleeHit(x, z, angle, spec, power) {
    const half = spec.arc / 2, R = spec.range;
    const src = power >= 2 ? 'chop' : 'slash';
    let hits = 0;
    const inArc = (tx, tz, rad) => {
      const dx = tx - x, dz = tz - z;
      const d = Math.hypot(dx, dz);
      if (d > R + rad) return null;
      if (d < 0.35 + rad) return { d, dx: d > 1e-4 ? dx / d : Math.cos(angle), dz: d > 1e-4 ? dz / d : Math.sin(angle) };
      let da = Math.atan2(dz, dx) - angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) <= half + Math.atan2(rad, d) ? { d, dx: dx / d, dz: dz / d } : null;
    };
    for (const t of this.hittables()) {
      const h = inArc(t.x, t.z, t.radius || 0.3);
      if (!h) continue;
      t.hit(spec.damage, h.dx, h.dz, spec.knockback, src, spec.stagger || 0);
      hits++;
    }
    // Undergrowth: tiles whose centre is in the arc (and the tile right in front of you).
    let cut = 0, nicked = 0;
    const fx = this.fx;
    const tx0 = Math.floor(x - R - 1), tx1 = Math.floor(x + R + 1), tz0 = Math.floor(z - R - 1), tz1 = Math.floor(z + R + 1);
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      if (!this.world.brushAt(tx, tz)) continue;
      if (!inArc(tx + 0.5, tz + 0.5, 0.45)) continue;
      const b = this.world.hitBrush(tx, tz, spec.cut || power);
      if (b === -1) {
        nicked++;
        fx.burst({ x: tx + 0.5, y: 0.4, z: tz + 0.5 }, { color: '#c23a3a', color2: '#5c2f2e', count: 4, speed: 2, up: 1.5, life: 0.3, size: 1.5 / 32 });
      } else if (b > 0) {
        cut++;
        const cols = b === BRUSH.bramble ? ['#4a2428', '#c23a3a'] : b === BRUSH.fern ? ['#4b8139', '#62983f'] : ['#2a5628', '#4b8139'];
        fx.burst({ x: tx + 0.5, y: 0.5, z: tz + 0.6 }, { color: cols[0], color2: cols[1], count: b === BRUSH.fern ? 5 : 9, speed: 2.4, up: 2.6, life: 0.55, size: 2 / 32, gravity: 6, vx: Math.cos(angle) * 1.5, vz: Math.sin(angle) * 1.5 });
      }
    }
    this._slashFx(x, z, angle, R, spec.arc, power, hits > 0);
    if (cut) {
      this.game.sfx.play('hit');
      // Cutting is loud: anything nearby comes to look.
      this.alertNear(x, z, 4.5 + Math.min(3, cut), null, true);
      if (!this.warned.cut) { this.warned.cut = true; }
    }
    if (nicked && !this.warned.bramble) {
      this.warned.bramble = true;
      this.toast('Thorny bramble: a heavy chop (hold RMB) clears it', 'amber', 3);
    }
    if (hits) this.game.shake(power >= 2 ? 3.5 : 1.6, 0.1);
  }

  _slashFx(x, z, angle, R, arc, power, hit) {
    if (!this._slashMats) {
      this._slashMats = [
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
        new THREE.MeshBasicMaterial({ color: '#d8f0e8', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
      ];
      this.slashes = [];
    }
    const g = new THREE.Group();
    const segs = 14;
    const edge = new THREE.Mesh(new THREE.RingGeometry(R - (power >= 2 ? 0.16 : 0.1), R, segs, 1, -arc / 2, arc), this._slashMats[0].clone());
    const body = new THREE.Mesh(new THREE.RingGeometry(R * 0.45, R - 0.1, segs, 1, -arc / 2, arc), this._slashMats[1].clone());
    if (power >= 2) { edge.material.color.set('#fee761'); body.material.color.set('#feae34'); }
    g.add(body, edge);
    g.rotation.x = -Math.PI / 2;
    g.rotation.z = -angle;
    g.position.set(x, 0.5, z);
    g.renderOrder = 5;
    this.three.add(g);
    this.slashes.push({ g, t: 0, life: power >= 2 ? 0.16 : 0.11 });
    if (hit) this.fx.flash({ x: x + Math.cos(angle) * R * 0.8, y: 0.6, z: z + Math.sin(angle) * R * 0.8 }, { color: '#ffffff', size: 0.45, life: 0.05 });
  }

  _updateSlashes(dt) {
    if (!this.slashes) return;
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.t += dt;
      const k = s.t / s.life;
      const [body, edge] = s.g.children;
      edge.material.opacity = 0.9 * (1 - k);
      body.material.opacity = 0.35 * (1 - k);
      s.g.scale.setScalar(0.9 + 0.1 * Math.min(1, k * 2));
      if (k >= 1) {
        s.g.removeFromParent();
        s.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
        this.slashes.splice(i, 1);
      }
    }
  }

  /** A Razorback bulldozes through undergrowth. */
  crashBrush(tx, tz) {
    const b = this.world.hitBrush(tx, tz, 2);
    if (b > 0) this.fx.burst({ x: tx + 0.5, y: 0.5, z: tz + 0.5 }, { color: '#2a5628', color2: '#5a4430', count: 6, speed: 2.5, up: 2.5, life: 0.5, size: 2 / 32, gravity: 6 });
  }

  alertNear(x, z, r, src, noise = false) {
    for (const e of this.enemies) {
      if (e === src || e.dead || e.alerted) continue;
      if (Math.hypot(e.x - x, e.z - z) <= r) {
        e.alert(false);
        if (noise) e.home = { x, z };
      }
    }
  }

  spawnEnemy(key, x, z, opts = {}) {
    const e = new ExploreEnemy(this, key, x, z, opts);
    this.enemies.push(e);
    return e;
  }

  onEnemyKilled(e) {
    this.kills += 1;
    if (e.id) { this.killed.add(e.id); this.spawned.delete(e.id); }
    if (e.objective) this._advanceStep(e.objStep ?? this.objStep);
    const D = X().enemyDrop;
    if (Math.random() < (e.def.drop || 0)) {
      const loot = { scrap: D.scrap[0] + Math.floor(Math.random() * (D.scrap[1] - D.scrap[0] + 1)) };
      if (Math.random() < D.componentChance) loot[Math.random() < 0.5 ? 'circuits' : 'biofiber'] = 1;
      if (Math.random() < D.medChance) loot.med = 1;
      this._spill(loot, e.x, e.z, false);
    }
  }

  onPlayerHurt() {
    this.post.uniforms.uHurt.value = 0.6;
  }

  // ================================================================== wildlife

  _chunkPop(cx, cz) {
    const k = cz * 1000 + cx;
    let list = this.pops.get(k);
    if (list) return list;
    list = [];
    this.pops.set(k, list);
    const run = this.game.run;
    const rng = makeRng(subSeed(run.seed, run.night, 'pop', cx, cz));
    const C = JUNGLE.chunk, W = this.data.size;
    const mx = cx * C + C / 2, mz = cz * C + C / 2;
    const dc = Math.hypot(mx - this.relayPos.x, mz - this.relayPos.z);
    if (dc < POP.safeRadius) return list;
    const danger = Math.min(1, Math.max(0, (dc - POP.safeRadius) / 64));
    const ri = this.data.region[Math.min(W - 1, Math.floor(mz)) * W + Math.min(W - 1, Math.floor(mx))];
    const dKey = DISTRICT_KEYS[ri] || this.district;
    const weights = {};
    for (const [t, w] of Object.entries(DISTRICTS[dKey].enemies)) {
      const key = POP.remap[t] || t;
      if (EXPLORE_ENEMIES[key]) weights[key] = (weights[key] || 0) + w;
    }
    const nightMul = POP.byNight[Math.min(POP.byNight.length - 1, run.night - 1)];
    let n = Math.round((POP.base + POP.far * danger) * nightMul * (ri === this.regionIdx ? POP.targetRegion : 1) + rng.next() - 0.5);
    let id = 0;
    const spot = (x0, z0, r) => {
      for (let t = 0; t < 24; t++) {
        const x = x0 + (rng.next() - 0.5) * 2 * r, z = z0 + (rng.next() - 0.5) * 2 * r;
        const tx = Math.floor(x), tz = Math.floor(z);
        if (tx < 1 || tz < 1 || tx >= W - 1 || tz >= W - 1) continue;
        if (this.world.levelAt(x, z) === LEVEL.water) continue;
        return { x: tx + 0.5, z: tz + 0.5 };
      }
      return null;
    };
    while (n > 0) {
      const g = Math.min(n, rng.int(POP.group[0], POP.group[1]));
      n -= g;
      const c = spot(mx, mz, C / 2 - 1);
      if (!c) continue;
      const type = rng.weighted(weights);
      for (let i = 0; i < g; i++) {
        const p = spot(c.x, c.z, 1.6) || c;
        list.push({ id: `w${cx}_${cz}_${id++}`, key: i > 0 && type === 'razorback' ? 'crawler' : type, x: p.x, z: p.z });
      }
    }
    // Feral camps.
    for (const s of this.data.sites) {
      if (s.type !== 'camp' || Math.floor(s.x / C) !== cx || Math.floor(s.z / C) !== cz) continue;
      const m = rng.int(POP.campSize[0], POP.campSize[1]) + (run.night >= 3 ? 1 : 0);
      for (let i = 0; i < m; i++) {
        const a = (i / m) * Math.PI * 2;
        list.push({ id: `c${s.id}_${i}`, key: 'feral', x: s.x + Math.cos(a) * 1.8, z: s.z + Math.sin(a) * 1.8, guard: true, site: s.idx });
      }
    }
    return list;
  }

  _updateWildlife(dt) {
    this._wildT = (this._wildT || 0) - dt;
    if (this._wildT > 0) return;
    this._wildT = 0.4;
    const pl = this.player.pos;
    const C = JUNGLE.chunk;
    const pcx = Math.floor(pl.x / C), pcz = Math.floor(pl.z / C);
    const R = POP.spawnRadius;
    const n = this.data.size / C;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (cx < 0 || cz < 0 || cx >= n || cz >= n) continue;
      for (const s of this._chunkPop(cx, cz)) {
        if (this.killed.has(s.id) || this.spawned.has(s.id)) continue;
        if (Math.hypot(s.x - pl.x, s.z - pl.z) < POP.minSpawnDist) continue;
        const e = this.spawnEnemy(s.key, s.x, s.z, { id: s.id, guard: s.guard, site: s.site });
        this.spawned.set(s.id, e);
      }
    }
    // Despawn wildlife that wandered far from the player (it comes back when you return).
    for (const e of this.enemies) {
      if (e.dead || !e.id || e.objective) continue;
      const d = Math.hypot(e.x - pl.x, e.z - pl.z);
      if (d > POP.despawnDist || (d > POP.despawnDist * 0.75 && !e.alerted)) {
        e.dead = true;
        e.despawned = true;
        this.spawned.delete(e.id);
      }
    }
  }

  _updateEnemies(dt) {
    for (const e of this.enemies) e.update(dt);
    // Keep bodies apart.
    const list = this.enemies.filter((e) => !e.dead && e.state !== 'spawn');
    const pad = JUICE.separation.pad;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = b.x - a.x, dz = b.z - a.z, m = a.radius + b.radius + pad;
      const d2 = dx * dx + dz * dz;
      if (d2 > m * m || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), push = (m - d) * 0.5;
      a.x -= (dx / d) * push; a.z -= (dz / d) * push;
      b.x += (dx / d) * push; b.z += (dz / d) * push;
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.dead) continue;
      if (e.despawned) e.dispose();
      else if (!e._disposedBars) { e._disposedBars = true; e.dispose(); }
      this.enemies.splice(i, 1);
    }
  }

  /** Objective kill targets appear when you get near their site. */
  _updateObjectiveSpawns() {
    const pl = this.player.pos;
    for (const t of this.objTargets) {
      if (!t.kill || t.spawned || t.step !== this.objStep) continue;
      if (Math.hypot(t.x - pl.x, t.z - pl.z) > 26) continue;
      t.spawned = true;
      const e = this.spawnEnemy(t.kill, t.x, t.z, { elite: true, objective: true });
      e.objStep = t.step;
      t.enemy = e;
      const sup = X().elite.supportTypes;
      const n = nightTune('eliteSupport', this.game.run.night);
      for (let i = 0; i < n; i++) {
        const p = this._openSpot(t.x, t.z, 2.5, 4);
        if (p) this.spawnEnemy(this.rng.weighted(sup), p.x, p.z, {});
      }
    }
    // Guards burst out when you reach a guarded cache.
    for (const it of this.interactables) {
      if (!it.guards || it.guardsOut || it.done) continue;
      if (Math.hypot(it.x - pl.x, it.z - pl.z) > 7) continue;
      it.guardsOut = true;
      this.toast('Guards burst out of the undergrowth!', 'bad');
      this.game.sfx.play('alarm');
      for (let i = 0; i < it.guards; i++) {
        const p = this._openSpot(it.x, it.z, 3, 5.5);
        if (p) this.spawnEnemy(i === 0 ? 'feral' : this.rng.pick(['crawler', 'feral', 'skitter']), p.x, p.z, { spawnIn: true, alerted: true });
      }
    }
  }

  _openSpot(x, z, minR, maxR, through = true) {
    for (let t = 0; t < 30; t++) {
      const a = Math.random() * Math.PI * 2, d = minR + Math.random() * (maxR - minR);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!this.world.blockedCircle(px, pz, 0.4, through) && this.world.levelAt(px, pz) > LEVEL.water) return { x: px, z: pz };
    }
    return null;
  }

  /** Hunters at dusk: packs that come for you from out of sight. */
  _hunt(n) {
    const pl = this.player.pos;
    const W = this.data.size;
    const ri = this.data.region[Math.floor(pl.z) * W + Math.floor(pl.x)];
    const dKey = DISTRICT_KEYS[ri] || this.district;
    const types = Object.keys(DISTRICTS[dKey].enemies).map((t) => POP.remap[t] || t).filter((t) => EXPLORE_ENEMIES[t] && t !== 'spitter' && t !== 'razorback');
    let any = false;
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 20; t++) {
        const a = Math.random() * Math.PI * 2, d = DAY.huntDist[0] + Math.random() * (DAY.huntDist[1] - DAY.huntDist[0]);
        const x = pl.x + Math.cos(a) * d, z = pl.z + Math.sin(a) * d;
        if (this.world.blockedCircle(x, z, 0.4, true) || !this.world.inBounds(Math.floor(x), Math.floor(z))) continue;
        this.spawnEnemy(types.length ? types[Math.floor(Math.random() * types.length)] : 'crawler', x, z, { spawnIn: true, alerted: true });
        any = true;
        break;
      }
    }
    return any;
  }

  // ================================================================== flow fields

  /** BFS flow fields around the player: one for walkers that need open ground, one for brush-slippers. */
  _updateFlow(dt) {
    const f = this.flow;
    f.t -= dt;
    const tx = Math.floor(this.player.pos.x), tz = Math.floor(this.player.pos.z);
    if (f.t > 0 && tx === f.tx && tz === f.tz) return;
    f.t = 0.35;
    f.tx = tx; f.tz = tz;
    f.blocked = this._bfs(tx, tz, false);
    f.through = this._bfs(tx, tz, true);
  }

  _bfs(sx, sz, through) {
    const R = 24, S = 2 * R + 1;
    const dist = new Int16Array(S * S).fill(-1);
    const q = new Int32Array(S * S);
    let h = 0, t = 0;
    const idx = (x, z) => (z - sz + R) * S + (x - sx + R);
    dist[idx(sx, sz)] = 0;
    q[t++] = idx(sx, sz);
    const W = this.world;
    while (h < t) {
      const i = q[h++];
      const x = (i % S) - R + sx, z = Math.floor(i / S) - R + sz;
      const d = dist[i];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (Math.abs(nx - sx) > R || Math.abs(nz - sz) > R) continue;
        const ni = idx(nx, nz);
        if (dist[ni] >= 0 || W.blockedAt(nx, nz, through)) continue;
        if (dx && dz && (W.blockedAt(x + dx, z, through) || W.blockedAt(x, z + dz, through))) continue;
        dist[ni] = d + 1;
        q[t++] = ni;
      }
    }
    return { dist, sx, sz, R, S };
  }

  flowDir(x, z, through) {
    const f = through ? this.flow.through : this.flow.blocked;
    if (!f) return null;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (Math.abs(tx - f.sx) > f.R || Math.abs(tz - f.sz) > f.R) return null;
    const idx = (xx, zz) => (zz - f.sz + f.R) * f.S + (xx - f.sx + f.R);
    const here = f.dist[idx(tx, tz)];
    let best = null, bd = here >= 0 ? here : 1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = tx + dx, nz = tz + dz;
      if (Math.abs(nx - f.sx) > f.R || Math.abs(nz - f.sz) > f.R) continue;
      const d = f.dist[idx(nx, nz)];
      if (d >= 0 && d < bd) { bd = d; best = [nx + 0.5, nz + 0.5]; }
    }
    if (!best) return null;
    const ddx = best[0] - x, ddz = best[1] - z, l = Math.hypot(ddx, ddz) || 1;
    return { x: ddx / l, z: ddz / l };
  }

  // ================================================================== ending

  onPlayerDeath() {
    if (this.ending) return;
    this.ending = true;
    this.timeScale = 0.35;
    this.holdTarget = null;
    this.game.sfx.play('core');
    this.fx.burst(this.player.pos, { color: '#e43b44', color2: '#3e8948', count: 30, speed: 3, up: 3, life: 0.8, y: 0.6 });
    this.later(1.2, () => {
      this.timeScale = 1;
      const salv = this._salvage();
      const lost = RESOURCE_KEYS.filter((k) => this.carried[k] - (salv[k] || 0) > 0).map((k) => resChip(k, this.carried[k] - (salv[k] || 0)));
      const kept = RESOURCE_KEYS.filter((k) => salv[k] > 0).map((k) => resChip(k, salv[k]));
      const meds = Math.min(CONFIG.player.maxMeds, this.player.meds | 0);
      if (meds > 0) lost.push(el('span.res', { style: { '--c': '#e43b44' }, html: `${resIconHtml('pick_med')} <b>${meds}</b> <span class="lbl">${meds === 1 ? 'Med kit' : 'Med kits'}</span>` }));
      const body = el('div.col', {},
        el('p', 'You collapse in the undergrowth, and a Relay drone drags you home.'),
        lost.length ? el('div', {}, el('p.bad', 'Carried loot lost:'), el('div.resrow', {}, lost)) : el('p.muted', 'You weren\'t carrying anything.'),
        kept.length ? el('div', {}, el('p.good', 'The drone salvaged:'), el('div.resrow', {}, kept)) : null,
        this.objectiveDone ? el('p.good', 'Objective progress still counts.') : null,
        el('p.muted.small', `You return with ${CONFIG.expedition.deathReturnHp} HP. Towers, banked resources, cut trails and pylons are safe.`));
      const ov = modal(this.game.ui, 'You went down', body, [button('Return to the Relay', () => this._finish('died'), { cls: 'primary' })]);
      ov.querySelector('h2')?.classList.add('bad');
    });
  }

  _extract() {
    if (this.ending) return;
    this.ending = true;
    this.holdTarget = null;
    this.game.sfx.play('done');
    this.shots.clearEnemyShots();
    const p = this.player.pos;
    this.fx.burst(p, { color: '#2ce8f5', color2: '#ffffff', count: 40, speed: 2, up: 6, life: 1, gravity: -2 });
    this.fx.ring(p, { color: '#2ce8f5', radius: 3, life: 0.6 });
    this.game.flash('#2ce8f5', 0.3);
    this._banner('BACK AT THE RELAY', this.objectiveDone ? 'Loot secured — objective complete' : 'Loot secured');
    this.later(1.4, () => this._finish('extracted'));
  }

  _salvage() {
    const share = nightTune('deathSalvage', this.game.run.night);
    const out = {};
    if (share > 0) for (const k of RESOURCE_KEYS) { const n = Math.round(this.carried[k] * share); if (n > 0) out[k] = n; }
    return out;
  }

  _finish(kind) {
    if (this.finished) return;
    this.finished = true;
    const run = this.game.run;
    run.storeWorld(this.state);
    const extracted = kind === 'extracted';
    const salvaged = extracted ? null : this._salvage();
    const result = {
      district: this.district,
      extracted,
      died: kind === 'died',
      abandoned: kind === 'abandoned',
      carried: { ...this.carried },
      salvaged: salvaged && Object.keys(salvaged).length ? salvaged : null,
      objectiveDone: this.objectiveDone,
      objective: this.objKey,
      objectiveName: this.objDef.name,
      boon: this.objectiveDone ? this.objDef.boon : null,
      optionals: this.optionalsDone.map((o) => ({ ...o })),
      events: this.eventsDone.map((e) => ({ ...e })),
      skillPointsEarned: this.spEarned,
      medsLeft: Math.min(CONFIG.player.maxMeds, this.player.meds),
      playerHp: Math.max(1, Math.round(this.player.hp)),
      kills: this.kills,
      timeUsed: Math.round(this.dayT),
      overtime: this.dayT > DAY.length,
    };
    const summary = run.applyExpedition(result, this.game);
    this.game.go('summary', { result: summary });
  }

  // ================================================================== pause / map

  setPaused(p) {
    if (this.ending && p) return;
    if (p === this.paused) return;
    this.paused = p;
    this.player.reticle.visible = !p;
    setToastsPaused(this.game.ui, p);
    if (p) {
      const body = el('div.col', {},
        el('p.muted.small', 'WASD move · LMB slash (combo) · hold RMB heavy chop · Space roll · E interact (hold) · Q med kit · Tab map'),
        el('p', {}, 'Objective: ', el('b.amber', this.objDef.name), this.objectiveDone ? el('span.good', ' (done)') : null));
      this.pauseModal = modal(this.game.ui, 'Paused', body, [
        button('Resume', () => this.setPaused(false), { cls: 'primary', hotkey: 'Esc' }),
        button('Settings', () => {
          this.settingsOpen = true;
          this.pauseModal.style.display = 'none';
          openSettingsOverlay(this.game, { onClose: () => { this.settingsOpen = false; if (this.pauseModal) this.pauseModal.style.display = ''; } });
        }),
        button('Quit to title', () => this._confirmQuit()),
        button('Abandon expedition', () => this._confirmAbandon(), { cls: 'danger' }),
      ]);
      this.pauseModal.classList.add('x-pause');
      this.hud.root.classList.add('paused');
      this.game.stage.style.cursor = '';
    } else {
      this.pauseModal?.remove();
      this.pauseModal = null;
      this.hud.root.classList.remove('paused');
      this.confirmModal?.remove();
      this.confirmModal = null;
      this.game.stage.style.cursor = 'none';
    }
  }

  _confirmAbandon() {
    this.confirmModal?.remove();
    const share = nightTune('deathSalvage', this.game.run.night);
    const body = el('div.col', {},
      el('p', 'Abandoning counts as not making it back:'),
      el('p.bad', share > 0 ? `Most carried loot is lost (the drone salvages ${Math.round(share * 100)}%) and you return at low HP.` : 'All carried loot is lost and you return at low HP.'),
      this.objectiveDone ? el('p.muted.small', 'Your objective still counts.') : null);
    this.confirmModal = modal(this.game.ui, 'Abandon expedition?', body, [
      button('Keep going', () => { this.confirmModal.remove(); this.confirmModal = null; }, { cls: 'primary' }),
      button('Abandon', () => this._finish('abandoned'), { cls: 'danger' }),
    ]);
  }

  _confirmQuit() {
    this.confirmModal?.remove();
    const body = el('div.col', {},
      el('p', 'Quit this expedition and return to the title screen?'),
      el('p.muted.small', "The run continues from tonight's briefing when you press Continue. Today's progress in the jungle is not kept."));
    this.confirmModal = modal(this.game.ui, 'Quit to title?', body, [
      button('Keep going', () => { this.confirmModal.remove(); this.confirmModal = null; }, { cls: 'primary' }),
      button('Quit to title', () => { this.finished = true; this.game.go('title'); }, { cls: 'danger' }),
    ]);
  }

  toggleMap(open = !this.mapOpen) {
    this.mapOpen = open;
    this.hud.bigmap.style.display = open ? '' : 'none';
    if (open) {
      for (const b of this.game.ui.querySelectorAll('.x-banner')) b.remove();
      const dpr = window.devicePixelRatio || 1;
      const st = this.game.stage;
      const px = Math.floor(Math.min(st.clientWidth * 0.62, st.clientHeight * 0.78) * dpr / this.data.size) * this.data.size;
      this.hud.big.width = this.hud.big.height = Math.max(this.data.size, px);
      this.hud.big.style.width = this.hud.big.style.height = `${Math.max(this.data.size, px) / dpr}px`;
    }
  }

  _banner(title, sub) {
    const b = el('div.x-banner', {}, el('div.x-banner-t', title), el('div.x-banner-s', sub));
    this.game.ui.append(b);
    setTimeout(() => b.classList.add('out'), 2600);
    setTimeout(() => b.remove(), 3200);
  }

  // ================================================================== update

  update(dt) {
    const input = this.game.input;
    if (input.wasPressed('Escape') && !this.settingsOpen) {
      if (this.mapOpen) this.toggleMap(false);
      else if (this.confirmModal) { this.confirmModal.remove(); this.confirmModal = null; }
      else if (!this.ending) this.setPaused(!this.paused);
    }
    if ((input.wasPressed('Tab') || input.wasPressed('KeyM')) && !this.paused) this.toggleMap();
    if (this.paused || this.finished) return;

    dt *= this.timeScale * this.fx.step(dt);
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    this._pumpHints();

    this.blockFire = this.mapOpen;
    this.player.update(dt);
    this._updateFlow(dt);
    this._updateWildlife(dt);
    this._updateObjectiveSpawns();
    this._updateEnemies(dt);
    this._updateNests(dt);
    this.shots.update(dt);
    this._updatePickups(dt);
    this._updateSlashes(dt);
    if (!this.ending) {
      this._updateInteract(dt);
      this._updateDay(dt);
      this._updateDiscovery();
    }
    this._updateProps(dt);
    this._placeCamera(dt);
    this.world.update(dt, this.camFocus.x, this.camFocus.z + 2);
    this.fx.update(dt);
    this._updateLight(dt);
    this._updateHud(dt);
  }

  _placeCamera(dt, snap = false) {
    const p = this.player.pos;
    const ax = this.player.aimPoint.x - p.x, az = this.player.aimPoint.z - p.z;
    const al = Math.hypot(ax, az);
    const k = al > 0.01 ? (Math.min(1, al / 7) * 1.6) / al : 0;
    const tx = p.x + ax * k, tz = p.z - 0.6 + az * k * 0.8;
    if (snap) this.camFocus.set(tx, 0, tz);
    else {
      const f = 1 - Math.exp(-7 * dt);
      this.camFocus.x += (tx - this.camFocus.x) * f;
      this.camFocus.z += (tz - this.camFocus.z) * f;
    }
    this.camera.setFocus(this.camFocus.x, this.camFocus.z);
  }

  _updateLight(dt) {
    const U = this.post.uniforms;
    const cam = this.camera;
    const pp = cam.toPixel(new THREE.Vector3(this.player.pos.x, 0.9, this.player.pos.z));
    U.uPlayer.value.set(pp.x, pp.y);
    U.uTime.value = this.time;
    const k = this.duskK;
    U.uLightR.value = (ATMOS.lightRadius[0] + (ATMOS.lightRadius[1] - ATMOS.lightRadius[0]) * k) * 32;
    U.uDark.value = k;
    U.uAmbient.value = ATMOS.dayAmbient * (1 - 0.45 * k);
    // Warm late-afternoon → blue night.
    const sunset = Math.max(0, Math.min(1, (this.dayT - DAY.length * 0.7) / (DAY.length * 0.3)));
    U.uTint.value.setRGB(1 + 0.08 * sunset - 0.25 * k, 1 - 0.04 * sunset - 0.15 * k, 1 - 0.12 * sunset + 0.12 * k);
    U.uHurt.value = Math.max(0, U.uHurt.value - dt * 2);
    // X-ray window for foliage in front of the player (GL pixel coordinates: y up).
    const body = cam.toPixel(new THREE.Vector3(this.player.pos.x, 0.75, this.player.pos.z));
    this.world.setPlayer(body.x, this.game.height - body.y, this.player.pos.z);
  }

  _updateDay(dt) {
    this.dayT += dt;
    const t = this.dayT;
    if (t > DAY.length - 60 && !this.warned.sun60) { this.warned.sun60 = true; this.toast('The sun is going down — 1 minute of daylight', 'amber', 3); this.game.sfx.play('alarm'); }
    if (t >= DAY.length && !this.warned.sunset) {
      this.warned.sunset = true;
      this.game.music?.play('boss');
      this.game.sfx.play('alarm');
      this._banner('SUNSET', 'The jungle wakes up. Get back to the Relay or a pylon');
      this.huntT = 4;
    }
    this.duskK = Math.max(0, Math.min(1, (t - DAY.length) / DAY.dusk));
    if (t >= DAY.length) {
      this.huntT -= dt;
      if (this.huntT <= 0) {
        this.huntT = DAY.huntEvery[0] + (DAY.huntEvery[1] - DAY.huntEvery[0]) * this.duskK;
        const n = DAY.huntCount[0] + Math.floor(Math.random() * (DAY.huntCount[1] - DAY.huntCount[0] + 1)) + (this.game.run.night >= 4 ? 1 : 0);
        if (this._hunt(n)) this.toast('Something is hunting you…', 'bad');
      }
    }
  }

  _updateDiscovery() {
    const p = this.player.pos;
    this.map.reveal(p.x, p.z, JUNGLE.explore.revealRadius);
    // Announce sites the first time you get near them.
    for (const it of this.interactables) {
      if (it.done || this.seen.has(it) || Math.hypot(it.x - p.x, it.z - p.z) > 9) continue;
      this.seen.add(it);
      if (it.kind === 'optional') this.toast(`Optional objective: ${OPTIONAL[it.key].name}`, 'amber', 3);
      if (it.kind === 'pylon') this.toast('A dead relay pylon — activate it to return from here', '', 3);
    }
    for (const n of this.nests) {
      if (n.dead || this.seen.has(n) || Math.hypot(n.x - p.x, n.z - p.z) > 10) continue;
      this.seen.add(n);
      this.toast(`Optional objective: ${OPTIONAL[n.key].name}`, 'amber', 3);
    }
  }

  _updateInteract(dt) {
    const pl = this.player;
    const input = this.game.input;
    let best = null, bd = Infinity;
    for (const it of this.interactables) {
      if (it.done) continue;
      const d = Math.hypot(it.x - pl.pos.x, it.z - pl.pos.z);
      if (d > 4) continue;
      if (it.walkOver && d < 0.75 && it.enabled()) { this._complete(it); continue; }
      if (d <= it.radius && d < bd) { bd = d; best = it; }
    }
    const ht = this.holdTarget;
    if (ht && !ht.done && input.isDown('KeyE') && Math.hypot(ht.x - pl.pos.x, ht.z - pl.pos.z) <= ht.radius + X().holdGrace) best = ht;
    if (this.holdTarget && this.holdTarget !== best) {
      if (!this.holdTarget.keepProgress) this.holdTarget.progress = 0;
      this.holdTarget = null;
    }
    this.promptTarget = best;
    if (!best) return;
    if (!best.enabled()) { if (input.wasPressed('KeyE')) this.game.sfx.play('error'); return; }
    const mult = best.objectiveHold && this.game.run.hasSkill('quick_extraction') ? X().quickExtraction : 1;
    const hold = best.hold * mult;
    if (hold <= 0) { if (input.wasPressed('KeyE')) this._complete(best); return; }
    if (input.isDown('KeyE')) {
      this.holdTarget = best;
      best.progress = Math.min(hold, best.progress + dt);
      if (best.spawnDuring) {
        const frac = best.progress / hold;
        while (best.spawned < best.spawnDuring && frac >= (best.spawned + 0.15) / best.spawnDuring) {
          best.spawned++;
          const p = this._openSpot(best.x, best.z, X().holdSpawnMinDist, X().holdSpawnMinDist + 5);
          if (p) {
            this.spawnEnemy(this.rng.pick(['crawler', 'feral', 'skitter']), p.x, p.z, { spawnIn: true, alerted: true });
            if (best.spawned === 1) this.toast('Something heard that — incoming!', 'bad');
          }
        }
      }
      if (Math.random() < 0.3) this.fx.burst({ x: best.x, z: best.z }, { color: best.kind === 'extract' ? '#2ce8f5' : '#feae34', count: 1, speed: 0.8, up: 2, life: 0.4, size: 0.06, y: 0.4 });
      if (best.progress >= hold) this._complete(best);
    } else if (this.holdTarget === best) {
      if (!best.keepProgress) best.progress = 0;
      this.holdTarget = null;
    }
  }

  _complete(it) {
    if (it.done) return;
    it.done = true;
    this.holdTarget = null;
    it.onComplete?.(it);
  }

  _updateProps(dt) {
    for (const v of this.props) updateVisual(v, dt);
    const p = this.player.pos;
    for (const it of this.interactables) {
      if (!it.vis) continue;
      // Only animate what is near (there are a couple of hundred props in the world).
      if (Math.abs(it.x - p.x) < 14 && Math.abs(it.z - p.z) < 12) updateVisual(it.vis, dt);
    }
    if (this.fades) {
      for (const f of this.fades) {
        f.t += dt;
        setOpacity(f.v, Math.max(0, 1 - f.t / 1.2));
        f.v.position.y = f.t * 0.6;
        if (f.t >= 1.2 && !f.gone) { f.gone = true; this.game.assets.disposeVisual(f.v); }
      }
      this.fades = this.fades.filter((f) => !f.gone);
    }
  }

  // ================================================================== HUD

  _buildHud() {
    const ui = this.game.ui;
    ui.classList.add('explore-ui', 'jungle-ui');
    const h = {};
    h.hp = bar('x-hpbar', 'var(--good)');
    h.stam = bar('j-stambar', '#feae34');
    h.meds = el('span.x-chip', '');
    h.weapon = el('div.x-weapon.small.muted', `${this.player.weapon.name} · LMB slash · hold RMB chop · Space roll`);
    const tl = el('div.x-tl.x-panel', {}, el('div.x-row', {}, el('span.x-lbl', 'HP'), h.hp.node), el('div.x-row', {}, el('span.x-lbl.j-st', 'ST'), h.stam.node, h.meds), h.weapon);
    h.loot = {};
    const lootRow = el('div.x-lootrow', {}, RESOURCE_KEYS.map((k) => {
      const r = RESOURCES[k];
      const n = el('b', '0');
      const chip = el('span.x-res', { style: { '--c': r.color }, title: `${r.label}: ${r.desc}` }, resIcon(k), n, el('span.lbl', r.short));
      h.loot[k] = { n, chip, v: -1 };
      return chip;
    }));
    const loot = el('div.x-loot.x-panel', {}, el('div.x-title', {}, 'CARRIED ', el('span.muted', '· banked when you return')), lootRow);
    h.sun = el('div.j-sun', {}, el('div.j-sunfill'), el('div.j-sundot'));
    h.timer = el('div.x-time', '');
    h.timerSub = el('div.x-timesub', this.D.name);
    const timer = el('div.x-timer', {}, h.sun, h.timer, h.timerSub);
    h.mini = el('canvas.x-mini');
    h.mini.width = h.mini.height = 160;
    const mini = el('div.x-minibox', {}, h.mini, el('div.x-minihint', {}, el('span.key', 'Tab'), ' map'));
    h.objTitle = el('div.x-objtitle', this.objDef.name);
    h.steps = el('div.x-steps');
    h.objDir = el('div.x-extract', {}, el('span.x-dirarrow.amber', '➤'), el('span', ''));
    h.extract = el('div.x-extract', {}, el('span.x-dirarrow', '➤'), el('span', ''));
    h.optList = el('div.x-optlist');
    const obj = el('div.x-obj.x-panel', {}, el('div.x-title.amber', 'OBJECTIVE'), h.objTitle, h.steps, h.objDir, h.extract, h.optList);
    const tr = el('div.x-tr', {}, mini, obj);
    h.promptRing = el('span.x-ring', {}, el('span.key', 'E'));
    h.promptText = el('span.x-plabel');
    h.promptTime = el('span.x-ptime');
    h.prompt = el('div.x-prompt', {}, el('div.x-ptext', {}, h.promptRing, h.promptText, h.promptTime));
    h.arrowObj = el('div.x-edge.obj', {}, el('span', '▲'));
    h.arrowExt = el('div.x-edge.ext', {}, el('span', '▲'));
    h.big = el('canvas.x-bigcanvas');
    const legend = el('div.x-legend', {}, ['objective', 'optional', 'relay', 'pylon_on', 'pylon_off', 'player'].map((k) =>
      el('span.x-leg', {}, el('i', { style: { background: MAP_MARKERS[k].color } }), MAP_MARKERS[k].label)));
    h.bigmap = el('div.x-bigmap', { style: { display: 'none' } },
      el('div.x-bigbox.x-panel', {}, el('div.x-bigtitle', {}, el('b', 'The Jungle'), el('span.muted', ` · today: ${this.D.name} — ${this.objDef.name}`), el('span.muted.x-bigclose', 'Tab / Esc to close')), h.big, legend));
    h.root = el('div.x-hud', {}, tl, loot, timer, tr, h.prompt, h.arrowObj, h.arrowExt, h.bigmap);
    ui.append(h.root);
    this.hud = h;
    this._hudCache = {};
  }

  _bumpLoot(k) {
    const c = this.hud.loot[k].chip;
    c.classList.remove('bump');
    void c.offsetWidth;
    c.classList.add('bump');
  }

  _set(key, node, prop, val) {
    if (this._hudCache[key] === val) return;
    this._hudCache[key] = val;
    if (prop === 'text') node.textContent = val;
    else if (prop === 'html') node.innerHTML = val;
    else if (prop === 'className') node.className = val;
    else node.style[prop] = val;
  }

  /** Current objective target point (or null). */
  _objectiveTarget() {
    if (this.objectiveDone) return null;
    let best = null, bd = Infinity;
    const p = this.player.pos;
    for (const t of this.objTargets) {
      if (t.step !== this.objStep || t.done) continue;
      const x = t.enemy && !t.enemy.dead ? t.enemy.x : t.x, z = t.enemy && !t.enemy.dead ? t.enemy.z : t.z;
      if (t.enemy?.dead) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bd) { bd = d; best = { x, z, d }; }
    }
    return best;
  }

  _nearestExit() {
    const p = this.player.pos;
    let best = { x: this.relayPos.x, z: this.relayPos.z, d: Math.hypot(this.relayPos.x - p.x, this.relayPos.z - p.z), name: 'Relay' };
    for (const py of this.data.pylons) {
      if (!this.state.pylons.has(py.id)) continue;
      const d = Math.hypot(py.x - p.x, py.z - p.z);
      if (d < best.d) best = { x: py.x, z: py.z, d, name: 'Pylon' };
    }
    return best;
  }

  _dirArrow(node, tx, tz) {
    const p = this.player.pos;
    const a = Math.atan2(tz - p.z, tx - p.x);
    node.style.transform = `rotate(${Math.round((a * 180) / Math.PI / 15) * 15}deg)`;
  }

  _edgeArrow(node, target) {
    if (!target) { node.style.display = 'none'; return; }
    const pr = this.game.project(new THREE.Vector3(target.x, 0.5, target.z), this.camera);
    const sw = this.game.stage.clientWidth, sh = this.game.stage.clientHeight;
    const m = 40 * sw / 960;
    if (pr.x > m && pr.y > m && pr.x < sw - m && pr.y < sh - m) { node.style.display = 'none'; return; }
    const cx = sw / 2, cy = sh / 2;
    const a = Math.atan2(pr.y - cy, pr.x - cx);
    const k = Math.min((sw / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (sh / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
    node.style.display = '';
    node.style.left = `${cx + Math.cos(a) * k}px`;
    node.style.top = `${cy + Math.sin(a) * k}px`;
    node.firstChild.style.transform = `rotate(${(a * 180) / Math.PI + 90}deg)`;
  }

  _markers() {
    const out = [{ x: this.relayPos.x, z: this.relayPos.z, type: 'relay' }];
    for (const p of this.data.pylons) {
      const on = this.state.pylons.has(p.id);
      if (on || this.map.isExplored(p.x, p.z)) out.push({ x: p.x, z: p.z, type: on ? 'pylon_on' : 'pylon_off' });
    }
    for (const t of this.objTargets) {
      if (this.objectiveDone || t.step !== this.objStep || t.done || t.enemy?.dead) continue;
      out.push({ x: t.enemy && !t.enemy.dead ? t.enemy.x : t.x, z: t.enemy && !t.enemy.dead ? t.enemy.z : t.z, type: 'objective' });
    }
    for (const it of this.interactables) {
      if (it.done) continue;
      if (it.kind === 'optional' && this.seen.has(it)) out.push({ x: it.x, z: it.z, type: 'optional' });
      else if (it.kind === 'container' && this.map.isExplored(it.x, it.z) && Math.hypot(it.x - this.player.pos.x, it.z - this.player.pos.z) < 18) out.push({ x: it.x, z: it.z, type: 'container' });
    }
    for (const n of this.nests) if (!n.dead && this.seen.has(n)) out.push({ x: n.x, z: n.z, type: 'optional' });
    out.push({ x: this.player.pos.x, z: this.player.pos.z, type: 'player' });
    return out;
  }

  _updateHud() {
    const h = this.hud;
    const pl = this.player;
    const hpf = pl.hp / pl.maxHp;
    h.hp.set(hpf, `${Math.ceil(pl.hp)} / ${pl.maxHp}`);
    this._set('hpc', h.hp.node.firstChild, 'background', hpf > 0.5 ? 'var(--good)' : hpf > 0.25 ? 'var(--amber)' : 'var(--danger)');
    h.stam.set(pl.stamina / STAMINA.max, '');
    this._set('stc', h.stam.node.firstChild, 'background', pl.exhausted ? '#8b9bb4' : '#feae34');
    this._set('meds', h.meds, 'html', `${resIconHtml('pick_med')} <b>${pl.meds}</b>/${CONFIG.player.maxMeds} <span class="muted">Q</span>`);
    for (const k of RESOURCE_KEYS) {
      const L = h.loot[k];
      if (L.v !== this.carried[k]) { L.v = this.carried[k]; L.n.textContent = String(L.v); L.chip.classList.toggle('zero', L.v === 0); }
    }
    // Sun dial: daylight drains left to right; after sunset it reads DUSK / NIGHT.
    const dayLeft = Math.max(0, DAY.length - this.dayT);
    this._set('timer', h.timer, 'text', dayLeft > 0 ? fmtTime(dayLeft) : this.duskK < 1 ? 'DUSK' : 'NIGHT');
    this._set('timerc', h.timer, 'className', `x-time${dayLeft <= 0 ? ' bad' : dayLeft < 60 ? ' amber' : ''}`);
    this._set('sun', h.sun.firstChild, 'width', `${Math.round((dayLeft / DAY.length) * 100)}%`);
    // Objective steps.
    const steps = this.objDef.steps.map((s, i) => {
      const cls = this.objectiveDone || i < this.objStep ? 'done' : i === this.objStep ? 'cur' : '';
      const cnt = s.count && i === this.objStep ? ` (${this.stepCount}/${s.count})` : '';
      return `<div class="x-step ${cls}">${cls === 'done' ? '✔' : '☐'} ${s.label}${cnt}</div>`;
    }).join('');
    this._set('steps', h.steps, 'html', this.objectiveDone ? '<div class="x-step done">✔ Objective complete — return to claim it</div>' : steps);
    const ot = this._objectiveTarget();
    h.objDir.style.display = ot ? '' : 'none';
    if (ot) {
      this._dirArrow(h.objDir.firstChild, ot.x, ot.z);
      this._set('objd', h.objDir.lastChild, 'text', `${Math.round(ot.d)} m to the objective`);
    }
    const ex = this._nearestExit();
    this._dirArrow(h.extract.firstChild, ex.x, ex.z);
    this._set('ext', h.extract.lastChild, 'text', `${Math.round(ex.d)} m to the ${ex.name} (return)`);
    this._edgeArrow(h.arrowObj, ot);
    this._edgeArrow(h.arrowExt, (this.objectiveDone || this.dayT > DAY.length - 45) && ex.d > 6 ? ex : null);
    const opts = this.optionalsDone.map((o) => `<div class="x-step done">✔ ${o.name}</div>`).join('');
    this._set('opts', h.optList, 'html', opts);
    // Prompt.
    const t = this.promptTarget;
    h.prompt.style.display = t && !this.ending ? '' : 'none';
    if (t && !this.ending) {
      const mult = t.objectiveHold && this.game.run.hasSkill('quick_extraction') ? X().quickExtraction : 1;
      const hold = t.hold * mult;
      const verb = typeof t.verb === 'function' ? t.verb() : t.verb;
      const en = t.enabled();
      this._set('pt', h.promptText, 'text', en ? (hold > 0 ? `Hold · ${verb}` : verb) : `${verb} (not yet)`);
      this._set('ptt', h.promptTime, 'text', hold > 0 ? `${Math.max(0, hold - t.progress).toFixed(1)}s` : '');
      const f = hold > 0 ? t.progress / hold : 0;
      h.promptRing.style.background = `conic-gradient(var(--amber) ${Math.round(f * 360)}deg, rgba(58,68,102,0.6) 0deg)`;
    }
    // Minimap (a few times a second) and big map.
    this._mapT = (this._mapT || 0) - 1;
    if (this._mapT <= 0) {
      this._mapT = 6;
      const m = this._markers();
      this.map.draw(h.mini, pl.pos.x, pl.pos.z, 56, m, false, this.time);
      if (this.mapOpen) this.map.draw(h.big, 0, 0, 0, m, true, this.time);
    }
  }

  // ================================================================== debug

  _makeDebug() {
    return {
      teleport: (x, z) => { this.player.pos.set(x, 0, z); this._placeCamera(0, true); },
      completeObjective: () => this.completeObjective(),
      giveLoot: () => { for (const k of RESOURCE_KEYS) this.carried[k] += 20; },
      killAll: () => { for (const e of this.enemies) if (!e.dead) e.hit(9999, 1, 0); },
      timeLeft: (s) => { this.dayT = DAY.length - s; },
      extract: () => this._extract(),
      die: () => this.player.hurt(9999),
      reveal: () => { this.map.reveal(this.data.size / 2, this.data.size / 2, this.data.size); },
      god: (on = true) => { this.player.god = on; },
      info: () => ({ pos: { ...this.player.pos }, enemies: this.enemies.length, chunks: this.world.chunks.size, day: this.dayT, objective: this.objKey, target: this._objectiveTarget() }),
    };
  }

  exit() {
    document.removeEventListener('visibilitychange', this._onVis);
    for (const e of this.enemies) e.dispose();
    for (const p of this.pickups) { this.game.assets.disposeVisual(p.vis); p.glow.removeFromParent(); }
    for (const it of this.interactables) { if (it.vis) this.game.assets.disposeVisual(it.vis); it.glow?.geometry.dispose(); it.glow?.material.dispose(); }
    for (const n of this.nests) { if (n.vis) this.game.assets.disposeVisual(n.vis); n.barBg.material.dispose(); n.barFill.material.dispose(); }
    for (const v of this.props) this.game.assets.disposeVisual(v);
    for (const s of this.slashes || []) s.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    for (const m of this._slashMats || []) m.dispose();
    for (const m of Object.values(this._glowMats || {})) m.dispose();
    this._glowGeom?.dispose();
    this.player.dispose();
    this.shots.dispose();
    this.fx.dispose();
    this.world.dispose();
    this.post.dispose();
    this.game.stage.style.cursor = '';
  }
}

/** Container loot (seeded per container), with district multipliers and skills. */
function rollLoot(rng, key, district, run) {
  const Xc = CONFIG.expedition;
  const def = Xc.containers[key];
  const m = district.loot;
  const lush = run.hasSkill('lush_finds');
  const scrapMult = m.scrap * (run.hasSkill('pack_rat_2') ? Xc.packRatScrap : 1);
  const loot = { scrap: 0, circuits: 0, biofiber: 0, intel: 0, med: 0 };
  const sround = (v) => Math.floor(v) + (rng.next() < v - Math.floor(v) ? 1 : 0);
  const component = () => rng.weighted({ circuits: m.circuits, biofiber: m.biofiber * (lush ? Xc.lushBiofiber : 1) });
  if (def.scrap) loot.scrap = Math.round(rng.int(def.scrap[0], def.scrap[1]) * scrapMult);
  if (def.intel) loot.intel = sround(rng.int(def.intel[0], def.intel[1]) * m.intel);
  let comps = 0;
  if (def.componentChance && rng.chance(def.componentChance)) comps = 1;
  if (def.components) comps = rng.int(def.components[0], def.components[1]);
  for (let n = 0; n < comps; n++) { const c = component(); loot[c] += sround(m[c]); }
  if (key === 'crate' && lush && rng.chance(0.2)) loot.biofiber += 1;
  if (rng.chance(Xc.containerMedChance * m.med)) loot.med = 1;
  return loot;
}
