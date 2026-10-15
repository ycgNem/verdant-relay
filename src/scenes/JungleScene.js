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
// extract(), die(), reveal(), info(), forage(), gotoForage(kind, n).

import * as THREE from 'three';
import '../ui/explore.css';
import '../ui/jungle.css';
import { CONFIG, RESOURCES, RESOURCE_KEYS, JUICE, nightTune, STAMINA } from '../data/config.js';
import { DISTRICTS, DISTRICT_KEYS } from '../data/districts.js';
import { PRIMARY, OPTIONAL, EVENTS, EVENT_KEYS, EVENT_RULES } from '../data/objectives.js';
import { DAY_CREATURES, BOSS } from '../data/bosses.js';
import { EXPLORE_ENEMIES } from '../data/enemies.js';
import { JUNGLE, DAY, POP, BRUSH, LEVEL, ATMOS, PYLON_GLOW } from '../data/jungle.js';
import { lightPool, beaconBeam } from '../core/PixelGlow.js';
import { Run } from '../core/Run.js';
import { makeRng, subSeed } from '../core/rng.js';
import { Fx, glowTexture } from '../core/Fx.js';
import { PixelCamera } from '../core/PixelView.js';
import { PostFx } from '../core/PostFx.js';
import { setAnim, updateVisual, setOpacity, flashVisual } from '../core/Assets.js';
import { worldForRun, clearDisc } from '../world/JungleGen.js';
import { JungleWorld } from '../world/JungleWorld.js';
import { Ambience } from '../world/Ambience.js';
import { Wading } from '../world/Wading.js';
import { Player } from '../entities/Player.js';
import { ExploreEnemy } from '../entities/ExploreEnemy.js';
import { Shots } from '../entities/ExploreShots.js';
import { SporePods } from '../entities/SporePods.js';
import { Forage } from '../entities/Forage.js';
import { JungleMap, MAP_MARKERS, drawMarker } from '../ui/JungleMap.js';
import { MAP_VIEW, HUD, TEXT_LANE, QUEST } from '../data/hud.js';
import { DEFAULT_KEYS } from '../data/controls.js';
import { el, button, bar, toast, modal, fmtTime, resChip, resIcon, resIconHtml, setToastsPaused, showBanner, pinWhole, snapLine, snapBox } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { GUIDE, FIRST_DAY, RETURN_PROMPT, HOME_HINT, WORDS, TIPS } from '../data/guide.js';
import { openSettingsOverlay } from './SettingsScene.js';
import { keyLabel } from '../core/Input.js';
import { JungleRelics } from './JungleRelics.js';
import { Goals } from './JungleGoals.js';
import { JungleQuest, stepText, stepVerb } from './JungleQuest.js';
import { AreaBosses } from '../entities/AreaBoss.js';
import { makeEnemy, tickSpeedBuffs } from '../entities/DayCreatures.js';
import { Weather } from '../world/Weather.js';

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

const worldFor = (game, run) => worldForRun(game, run, DISTRICT_KEYS);

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
    this._forceEvent = params.event;   // (debug: ?event=<key>)

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
    // Flat white ambient so lit (Lambert) bits — splat decals, placeholder models — show their own colour
    // instead of black; the real lighting is screen-space (PostFx).
    this.three.add(new THREE.AmbientLight('#ffffff', ATMOS.ambientLight));
    this.camera = new PixelCamera({ dist: 30, near: 1, far: 90 });
    this.camera.setSize(game.width, game.height);
    game.assets.setTint('#ffffff');
    this.post = new PostFx(game);
    this.world = new JungleWorld(game, this.three, this.data, this.state.cut);
    this.post.setWorld(this.world);   // canopy shade + district grade
    this.post.uniforms.uLeaves.value = 1;
    this.ambience = new Ambience(this.three, this.world);
    this.wading = new Wading(this);   // waterline clip + ripple / splash in shallow water
    this.fx = new Fx(game, this.three, this.camera);
    // Splats are stained into the baked ground (Fx.decal); the jungle ground is unlit (its light is PostFx's).
    this.fx.ground = { patch: (tx, tz, w, h) => this.world.groundPatch(tx, tz, w, h), unlit: true };
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
    // Today's weather (src/world/Weather.js, src/data/weather.js): rain / fog / heat, or none. Heat grows extra pods.
    this.weather = new Weather(this);
    this.spores = new SporePods(this, this.weather.pods(this.data.spores || []));   // hazard (regrows daily)
    this.bosses = new AreaBosses(this);   // area bosses in their lairs, from day 3 (src/entities/AreaBoss.js)
    this.goals = new Goals(this);         // escort / uplink / Alpha / core / bloom goals (src/scenes/JungleGoals.js)
    this._setupObjective();
    this._setupOptionals();
    this._setupEvents();
    this.bosses.build();
    this.forage = new Forage(this);       // wild fruit, shelf fungus, glints in the brush (critic N; after the day's sites)
    this.map = new JungleMap(this.data, this.state.explored);
    this.map.reveal(c.x, c.z, JUNGLE.relayClearing + 6);
    for (const p of this.data.pylons) if (this.state.pylons.has(p.id)) this.map.reveal(p.x, p.z, 6);
    this._chooseStart();
    // Key bindings (Settings → Controls) apply while the jungle runs: a rebound key reads as the default code.
    game.input.useBindings(() => game.meta.settings.keys);
    this._tips = { cur: null, q: [], gapT: 0, scanT: 0 };   // one-off verb tips (TIPS, _tip / _checkTips)
    this._buildHud();
    this.weather.apply();         // the grade, fog / rain, light radius, rain sound
    this.weather.hud(this.hud);   // its tag under the clock
    for (const n of [this.hud.timerSub, this.hud.tr.querySelector('.j-weather')]) if (n) snapBox(n);   // centred lines on whole px
    // Relics, landmark shrines, data logs, named places (Stage 7; src/scenes/JungleRelics.js).
    this.relicsCtl = new JungleRelics(this);

    this.world.warm(this.player.pos.x, this.player.pos.z);
    this._placeCamera(0, true);

    this._onVis = () => { if (document.hidden && !this.ending) this.setPaused(true); };
    document.addEventListener('visibilitychange', this._onVis);
    window.addEventListener('blur', this._onBlur = () => { if (!this.ending) this.setPaused(true); });   // alt-tab pauses too
    game.stage.style.cursor = 'none';
    game.music?.play('day');

    this._hintQueue = [];
    // The guided first day teaches one thing at a time (the coach line, top centre); otherwise one-time
    // hints, one control each, in the order you need them.
    this._setupCoach();
    if (!this.coach) {
      this._hint('jungle_move', `Move with ${this._moveKeys()}. <b>Click</b> to swing your machete. ${this._key('map')} opens the map.`, 'bottom-left', 10);
      this.later(5, () => this._hint('jungle_cut', 'Your machete <b>cuts through plants</b>: click to clear a path. Thorny red brambles need a <b>heavy chop</b> (hold right-click). Cutting is <b>loud</b>.', 'bottom-left', 11));
      this.later(18, () => this._hint('jungle_return', `Follow the <span style="color:#feae34">amber arrow</span> to today's quest (◆). What you pick up is yours once you get <span style="color:#2ce8f5">home</span> (the Relay or a ${WORDS.pylon} you switched on). After sunset the jungle hunts you.`, 'bottom-left', 11));
    }

    this.debug = this._makeDebug();
    // The day's quest card (Stage 9, JungleQuest): QUEST, its name, steps and reward, in the top-centre lane.
    this.quest.showCard();
  }

  /** The Relay drone drops you at the activated pylon closest to today's objective (or at the Relay). */
  _chooseStart() {
    // The trek: start → first step → … → last step (one target per step).
    const legs = [];
    for (const t of this.objTargets) if (!legs.some((l) => l.step === t.step)) legs.push(t);
    if (!legs.length) return;
    let rest = 0;
    for (let i = 1; i < legs.length; i++) rest += Math.hypot(legs[i].x - legs[i - 1].x, legs[i].z - legs[i - 1].z);
    const trek = (p) => Math.hypot(legs[0].x - p.x, legs[0].z - p.z) + rest;
    // A pylon only takes over if it still leaves a real trek (DAY.minTrek) and saves a good stretch.
    let best = null, bd = trek(this.relayPos) - DAY.pylonSaving;
    for (const p of this.data.pylons) {
      if (!this.state.pylons.has(p.id)) continue;
      const d = trek(p);
      if (d >= DAY.minTrek && d < bd) { bd = d; best = p; }
    }
    this.trek = best ? bd : trek(this.relayPos);
    if (!best) return;
    this.player.pos.set(best.x, 0, best.z + 1.6);
    this.startPylon = best;
    this.later(1.2, () => this.toast(`The drone dropped you at your ${WORDS.pylon}: ${Math.round(bd)} m from today's quest`, 'good', 3.2));
  }

  later(t, fn) { this.timers.push({ t, fn }); }
  toast(text, cls = '', time = 2.4) { toast(this.game.ui, text, cls, time); }

  /** Keycap HTML for an action's bound key ('roll' → Space), so every tip names the key the player picked. */
  _key(action) {
    const t = keyLabel(this.game.input.keyFor(action)).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    return `<span class="key">${t}</span>`;
  }
  _moveKeys() { return ['up', 'left', 'down', 'right'].map((a) => this._key(a)).join(''); }

  _hint(id, html, pos = 'bottom-left', time = 10) { this._hintQueue.push({ id, html, pos, time }); }
  _pumpHints() {
    // One coach hint at a time (critic H2 §5.1): a hint waits while a verb tip is on the coach line.
    if (!this._hintQueue.length || this.game.ui.querySelector('.hint') || this._tips?.cur) return;
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

  /** Sprite for an opened container: a per-type spent look (Assets.openedVariant) or the opened crate. */
  _openedName(type) { return this.game.assets.openedVariant(type, this._propKey(type)) || 'opened'; }

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
      verb: () => (this.objectiveDone ? 'Head home (keep your loot)' : this.objectiveFailed ? 'Head home (quest failed)' : 'Head home early (quest not done)'),
      // Not offered at the drop-off right away: only once there is something to bring home (or a reason to leave).
      hidden: () => !this._homeOffered(),
      onComplete: (it) => { it.done = false; this._extract(); },
    });
  }

  _buildPylons() {
    for (const p of this.data.pylons) {
      const on = this.state.pylons.has(p.id);
      const v = this._visual('pylon', p.x, p.z);
      const it = this._addInteractable({
        kind: on ? 'extract' : 'pylon', pylon: p, x: p.x, z: p.z, vis: v, radius: DAY.pylonRadius,
        hold: on ? DAY.extractHold : DAY.pylonHold, keepProgress: !on, objectiveHold: on,
        verb: () => (it.kind === 'extract' ? (this.objectiveDone || this.objectiveFailed ? `Head home from this ${WORDS.pylon}` : `Head home early from this ${WORDS.pylon}`) : `Switch on this ${WORDS.pylon} (a way home)`),
        onComplete: (t) => this._completePylon(t),
      });
      p.it = it;
      this._pylonGlow(it, on);
    }
  }

  _pylonGlow(it, on) {
    if (it.vis) setAnim(it.vis, on ? 'on' : 'off');   // sprite: dead mast vs cyan beacon pulse + lit dish
    if (it.glow) it.glow.visible = on;
    if (!on || it.glow) return;
    // A dithered light pool that stays lit under the canopy and at night, plus a light column above the
    // canopy so a live pylon reads from afar (PixelGlow lightPool / beaconBeam, PYLON_GLOW).
    const m = lightPool(PYLON_GLOW);
    m.position.set(it.x, 0.02, it.z);
    if (PYLON_GLOW.beam) { const b = beaconBeam(PYLON_GLOW); b.position.set(0, 0, b.position.y); m.add(b); m.userData.beam = b; }
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
    this.game.sfx.play('beacon_on');
    this.fx.ring({ x: it.x, z: it.z }, { color: '#2ce8f5', radius: 3, life: 0.6 });
    this.fx.burst({ x: it.x, z: it.z }, { color: '#2ce8f5', color2: '#ffffff', count: 30, speed: 2, up: 5, life: 0.9, y: 1.5 });
    this._banner(`${WORDS.Pylon.toUpperCase()} ON`, 'You can head home from here: today and every day after');
  }

  _buildContainers() {
    const run = this.game.run;
    // The chosen area's FINDS apply to everything opened today, wherever it is (Run.lootMults; the briefing card says so).
    const district = { loot: run.lootMults ? run.lootMults() : this.D.loot };
    for (const c of this.data.containers) {
      const opened = this.state.opened.has(c.id);
      // Hidden caches only show once you are close (they sit in the brush).
      const v = this._visual(opened ? this._openedName(c.type) : c.type, c.x, c.z);
      this.world.addCollider({ kind: 'prop', type: 'container', x: c.x, z: c.z });   // opened ones still stand there
      this._addInteractable({
        kind: 'container', type: c.type, cont: c, x: c.x, z: c.z, vis: v, done: opened, radius: 1.35,
        hold: X().containers[c.type].hold, keepProgress: true,
        verb: () => `Open ${CONTAINER_NAMES[c.type]}`,
        onComplete: (it) => this._openContainer(it, rollLoot(makeRng(subSeed(run.seed, 'loot', c.id)), c.type, district, run, c.yield ?? 1)),
      });
    }
  }

  // ================================================================== objectives

  /** Pick today's objective sites in the target district (never a site used on an earlier day). */
  _sitesIn(types, n = 1, exclude = [], deep = false) {
    const ri = this.regionIdx;
    exclude = [...exclude, ...(this.bosses?.lairSites() || [])];   // an area boss's lair is nobody's goal site
    const all = this.data.sites.filter((s) => s.region === ri && !this.state.used.has(s.id) && !exclude.includes(s));
    const out = [];
    // deep (primary objectives): far from the Relay first (a real trek), then lost sites (off-trail: cut
    // your way in), then by type order. Otherwise just by type order.
    const rel = this.relayPos;
    // The guided first day prefers a trail-side site at a short walk (GUIDE.objectiveDist).
    const guided = deep && this.game.run.isGuidedDay();
    const [g0, g1] = GUIDE.objectiveDist;
    const far = (s) => {
      const d = Math.hypot(s.x - rel.x, s.z - rel.z);
      if (guided) return d >= g0 && d <= g1 ? 0 : 1;
      return d >= DAY.objectiveMinDist ? 0 : 1;
    };
    // (The guided run's world marks its goal site: the trail there is lined with crates, JungleGen guidedRoute.)
    const gSite = guided ? this.data.guided?.site : null;
    // Sites within BOSS.siteGap of a living boss's lair go last (critic J2 §4: a goal beside a lair).
    const lairs = this.bosses?.lairSites() || [];
    const byLair = (s) => (lairs.some((L) => Math.hypot(s.x - L.x, s.z - L.z) < BOSS.siteGap) ? 1000 : 0);
    const rank = (s) => (s.id === gSite ? -1000 : 0) + byLair(s) + (deep ? far(s) * 100 + (guided ? (s.lost ? 50 : 0) : (s.lost ? 0 : 10)) : 0) + types.indexOf(s.type);
    const cand = this.rng.shuffle(all.filter((x) => types.includes(x.type)));
    cand.sort((a, b) => rank(a) - rank(b));
    for (const s of cand) if (out.length < n) out.push(s);
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
    this._firstDay = this.game.run.night === 1;   // run day 1: gentler wildlife (FIRST_DAY)
    const def = this.objDef;
    this.objTargets = [];
    const used = [];
    def.steps.forEach((step, si) => {
      // escort / defend / track / carry / purge steps (and the Alpha's kill) are placed by src/scenes/JungleGoals.js.
      if (this.goals?.claims(step)) { this.goals.setupStep(step, si, used); return; }
      const count = step.count || 1;
      const types = step.room === 'side' ? ['minor', 'landmark', 'camp'] : ['major', 'minor'];
      const sites = this._sitesIn(types, count, used, step.room !== 'side');
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
          keepProgress: true, spawnDuring: step.spawnDuring ? Math.min(step.spawnDuring, nightTune('holdSpawns', this.game.run.night), this._firstDay ? FIRST_DAY.holdSpawns : 99) : 0, spawned: 0,
          guards: step.guards ? Math.min(step.guards, nightTune('guards', this.game.run.night), this._firstDay ? FIRST_DAY.guards : 99) : 0,
          verb: () => stepVerb(step),
          enabled: () => si === this.objStep,
          onComplete: (t) => this._stepDone(t, step, count),
        });
        it.vis = this._visual(step.prop, p.x, p.z, { anim: 'off' });
        if (step.type !== 'pickup') this.world.addCollider({ kind: 'prop', type: 'objective', x: p.x, z: p.z });
        this.objTargets.push(it);
      });
    });
  }

  _stepDone(it, step, count) {
    if (step.type === 'pickup') {
      this._removeVis(it);
      this.toast(`Got the ${step.prop}`, 'good');
      this.game.sfx.play('item_get');
    } else if (it.vis && step.prop === 'cell_cache') {
      // The cracked power-cell cache goes dark (its cell is gone), instead of glowing on.
      const k = this.game.assets.spentVariant(this._propKey('cell_cache'), 'dark');
      if (k) { this._removeVis(it); it.vis = this._visual(k, it.x, it.z); } else setAnim(it.vis, 'on');
    } else if (it.vis) setAnim(it.vis, 'on');
    this.fx.burst({ x: it.x, z: it.z }, { color: '#feae34', color2: '#ffffff', count: 16, speed: 2.2, up: 3, life: 0.5, y: 0.6 });
    this._advanceStep(it.step, count);
  }

  _advanceStep(step, needed = 1) {
    if (step !== this.objStep || this.objectiveDone) return;
    this.stepCount += 1;
    if (this.stepCount < needed) {
      this.toast(`${this.objDef.name}: ${this.stepCount}/${needed}`, 'amber');
      this.game.sfx.play('step_done');
      return;
    }
    this.objStep += 1;
    this.stepCount = 0;
    if (this.objStep >= this.objDef.steps.length) this.completeObjective();
    else {
      // The tracker ticks the step off, then shows the next one (JungleQuest.onStep).
      this.game.sfx.play('step_done');
      this.quest?.onStep(this.objStep - 1);
      this.toast(`Next: ${stepText(this.objDef.steps[this.objStep], this.quest?._site(this.objStep))}`, 'amber', 3);
    }
  }

  completeObjective() {
    if (this.objectiveDone) return;
    this.objectiveDone = true;
    this.objStep = this.objDef.steps.length;
    this._grantSkillPoint();
    this.game.sfx.play('goal_done');
    // QUEST COMPLETE + the reward, a burst, the tracker flashes (JungleQuest.complete).
    if (this.quest) this.quest.complete();
    else this._banner('QUEST COMPLETE', this._rewardSafe() ? 'The drone has it: the reward is yours' : 'Head home to claim the reward');
    for (const it of this.interactables) if (it.kind === 'primary') it.done = true;
  }

  /**
   * Is the quest's night reward already safe once it's done (fix wave, critic R / Q: losing it on the way home read as a
   * betrayal)? Goals the drone takes at delivery, and any quest on nights up to CONFIG.expedition.keepRewardThrough.
   */
  _rewardSafe() { return !!this.objDef?.rewardAtDelivery || this.game.run.night <= (X().keepRewardThrough ?? 0); }

  /**
   * +1 skill point for this trip. The goal (bonus tasks no longer do: OPTIONAL.skillPoint) gives at most
   * CONFIG.expedition.maxSkillPoints a trip; `{ boss: true }` (an area boss killed) always gives one on top.
   */
  _grantSkillPoint(opts = {}) {
    if (!opts.boss && this.spEarned - (this.spBoss || 0) >= X().maxSkillPoints) return false;
    if (opts.boss) this.spBoss = (this.spBoss || 0) + 1;
    this.spEarned += 1;
    // opts.quiet: the caller says it (an area boss kill prints it on its banner's reward line).
    if (!opts.quiet) this.later(0.6, () => this.toast('+1 skill point', 'good'));
    return true;
  }

  _setupOptionals() {
    const night = this.game.run.night;
    const n = night <= 1 ? 1 : 2;
    // (No second stranded engineer on a day whose goal is to bring one home.)
    const pool = ['nest', 'survivor', 'data_log', 'locked_cache'].filter((k) => k !== 'survivor' || !this.objDef.steps.some((s) => s.type === 'escort'));
    const keys = this.rng.shuffle(pool).slice(0, n);
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
        this.world.addCollider({ kind: 'prop', type: 'nest', x: p.x, z: p.z });
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
      if (key !== 'data_log') this.world.addCollider({ kind: 'prop', type: 'objective', x: p.x, z: p.z });
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
    this.game.sfx.play('bonus_done');
    this.toast(`Bonus done: ${def.name}`, 'good', 3);
    if (def.flag) this.later(0.4, () => this.toast(def.flag.text, 'amber', 3.2));
    if (def.skillPoint) this._grantSkillPoint();   // only if the trip's point isn't earned yet (skills.js header)
    if (it.key === 'survivor' && it.vis) {
      const v = it.vis;
      it.vis = null;
      this.fades = this.fades || [];
      this.fades.push({ v, t: 0 });
    }
  }

  /**
   * Today's event (EVENTS in src/data/objectives.js; from EVENT_RULES.fromNight, never on the guided day): one
   * risk/reward set piece at a camp or minor site in today's area. Announced with its reward and its risk once you
   * come within EVENT_RULES.announce tiles, then marked on the map; the prompt repeats both before you commit.
   * `params.event` (debug) forces one.
   */
  _setupEvents() {
    const run = this.game.run;
    this.events = [];
    if (!EVENT_KEYS.length || run.night < EVENT_RULES.fromNight || run.isGuidedDay()) return;
    const key = EVENTS[this._forceEvent] ? this._forceEvent : makeRng(subSeed(run.seed, run.night, 'event')).pick(EVENT_KEYS);
    const def = EVENTS[key];
    const taken = [...this.objTargets.map((t) => t.site), ...this.interactables.map((i) => i.site), ...this.nests.map((n) => n.site)].filter(Boolean);
    const s = this._sitesIn(EVENT_RULES.sites, 1, taken)[0];
    if (!s) return;
    this.state.used.add(s.id);
    clearDisc(this.data, s.x, s.z, 2);
    for (const ch of this.world.chunks.values()) ch.dirtyCards = true;
    // A spot clear of the site's crates (so their prompts don't crowd the event's).
    let p = this._spotNear(s, 0, 1.2);
    for (let t = 0; t < 8 && this.data.containers.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 2); t++) p = this._spotNear(s, 0.5, 2.5);
    const night = run.night;
    const it = this._addInteractable({
      kind: 'event', key, x: p.x, z: p.z, site: s, radius: 1.5, hold: def.hold || 1.5, keepProgress: true,
      spawnDuring: def.spawnDuring ? Math.min(def.spawnDuring, nightTune('holdSpawns', night)) : 0, spawned: 0,
      guards: def.guards ? Math.min(def.guards, nightTune('guards', night)) : 0,
      verb: () => def.prompt,
      onComplete: (t) => this._completeEvent(t, def),
    });
    it.vis = this._visual(def.prop, p.x, p.z, { anim: 'off' });
    this.world.addCollider({ kind: 'prop', type: 'objective', x: p.x, z: p.z });
    this.events.push(it);
  }

  _completeEvent(it, def) {
    it.done = true;
    if (it.vis && def.prop === 'cache') { this._removeVis(it); it.vis = this._visual(this._openedName('cache'), it.x, it.z); }
    else if (it.vis) setAnim(it.vis, 'on');
    const rec = { key: it.key, name: def.name };
    if (def.flag) rec.flag = def.flag;
    this.eventsDone.push(rec);
    if (def.reward) this._spill(def.reward, it.x, it.z, true);
    this.fx.burst({ x: it.x, z: it.z }, { color: '#feae34', color2: '#ffffff', count: 22, speed: 2.6, up: 3.2, life: 0.7, y: 0.5 });
    this.game.sfx.play('event_done');
    this.toast(`${def.name}: done`, 'good', 3);
    if (def.flag) this.later(0.4, () => this.toast(def.flag.text, 'amber', 3.4));
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
    this.game.sfx.playAt('hit', n.x, n.z);
    if (n.hp <= 0) {
      n.dead = true;
      this.fx.burst({ x: n.x, z: n.z }, { color: '#b55088', color2: '#ff0044', count: 40, speed: 4, up: 4, life: 0.8, size: 0.1, y: 0.5 });
      this.fx.ring({ x: n.x, z: n.z }, { color: '#ff0044', radius: 2.5, life: 0.5 });
      this.fx.decal({ x: n.x, z: n.z }, { color: '#4a1f3a', radius: 0.9, life: 8 });
      this.fx.hitStop(JUICE.hitStop.eliteKill);
      this.game.sfx.playAt('nest_burst', n.x, n.z);
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
    this._openedCount = (this._openedCount || 0) + 1;
    this.state.opened.add(it.cont.id);
    this.game.sfx.play('crate_open');
    this._removeVis(it);
    it.vis = this._visual(this._openedName(it.type), it.x, it.z);
    this.fx.burst({ x: it.x, z: it.z }, { color: '#e4a672', color2: '#feae34', count: 10, speed: 2, up: 3, life: 0.4, y: 0.4 });
    this._spill(loot, it.x, it.z, true);
    this.relicsCtl?.onContainerOpened(it);   // a hidden cache may hold a relic
    if (!this.warned.loot) {
      this.warned.loot = true;
      if (!this.coach) this._hint('jungle_loot', `What you pick up is <b>carried</b> (top-left) until you get home. Go down out here and most of it is lost.`, 'bottom-left', 10);
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
      const full = p.res === 'med' && pl.meds >= (pl.maxMeds ?? CONFIG.player.maxMeds);   // (Medic's Satchel: 3)
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
      p.glow.position.set(p.x, 0.016, p.z + (JUICE.pickup.glowZ ?? 0));   // centred under the item's base
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
    this.game.sfx.play(`pick_${p.res}`);
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
    const hw = Math.round(n.offsetWidth / 2), hh = Math.round(n.offsetHeight / 2);   // whole pixels, not translate(-50%) (critic M2 P1-3)
    const at = (x, y, s) => `translate(${Math.round(x) - hw}px, ${Math.round(y) - hh}px) scale(${s})`;
    const mx = (from.x + tx) / 2, my = Math.min(from.y, ty) - 40 * this.game.u;
    const ms = JUICE.pickup.flyTime * 1000;
    n.style.transform = at(from.x, from.y, 1.3);
    if (n.animate) n.animate([{ transform: at(from.x, from.y, 1.3) }, { transform: at(mx, my, 1.15), offset: 0.45 }, { transform: at(tx, ty, 0.9) }], { duration: ms, easing: 'ease-in', fill: 'forwards' });
    setTimeout(() => { n.remove(); done?.(); }, ms);
  }

  // ================================================================== combat

  hittables() {
    const out = this.enemies.filter((e) => !e.dead && !e.hidden);   // (a Thorn Stalker under the brush can't be hit)
    for (const n of this.nests) if (!n.dead) out.push({ x: n.x, z: n.z, radius: n.radius, dead: false, hit: (dmg, _dx, _dz, _kb, src) => this._hitNest(n, dmg, src) });
    this.spores?.hittables(out);   // a hit pops a spore pod
    this.bosses?.hittables(out);   // the stationary area bosses
    this.goals?.hittables(out);    // the bloom's spore nests (Purge the bloom)
    this.forage?.hittables(out);   // shelf fungus on old stumps and logs (`forage`: not a creature hit)
    return out;
  }

  /** The machete connects: hit every enemy, nest and undergrowth tile inside the arc. */
  meleeHit(x, z, angle, spec, power) {
    const half = spec.arc / 2, R = spec.range;
    const src = power >= 2 ? 'chop' : 'slash';
    let hits = 0;
    const inArc = (tx, tz, rad, r = R) => {
      const dx = tx - x, dz = tz - z;
      const d = Math.hypot(dx, dz);
      if (d > r + rad) return null;
      if (d < 0.35 + rad) return { d, dx: d > 1e-4 ? dx / d : Math.cos(angle), dz: d > 1e-4 ? dz / d : Math.sin(angle) };
      let da = Math.atan2(dz, dx) - angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) <= half + Math.atan2(rad, d) ? { d, dx: dx / d, dz: dz / d } : null;
    };
    const M = JUICE.melee;
    const chop = power >= 2;
    const step = chop ? 3 : Math.min(2, spec.step ?? 0);
    let kills = 0, hitAt = null;
    const dm = this.relicsCtl?.meleeMult() ?? 1;   // relics: Whetstone / Glass Machete, an armed Hunter's Fang
    for (const t of this.hittables()) {
      const h = inArc(t.x, t.z, t.radius || 0.3);
      if (!h) continue;
      if (t.forage) { t.hit(); continue; }   // shelf fungus (Forage.js): a plant, so the swing costs plant stamina
      t.hit(spec.damage * dm, h.dx, h.dz, spec.knockback, src, spec.stagger || 0, spec);   // (spec: a riposte isn't also a punish)
      spec.onHit?.(t);   // the machete kit (src/entities/BladeKit.js): Serrated Edge bleeding
      hits++;
      if (t.dead) kills++;
      if (!hitAt || h.d < hitAt.d) hitAt = { d: h.d, x: t.x, z: t.z };
    }
    // Undergrowth: tiles whose centre is in the arc (and the tile right in front of you). spec.cutRange: the Cleaver
    // skill's chop clears plants further out than it hits.
    let cut = 0, nicked = 0;
    const fx = this.fx;
    const CR = spec.cutRange || R;
    const tx0 = Math.floor(x - CR - 1), tx1 = Math.floor(x + CR + 1), tz0 = Math.floor(z - CR - 1), tz1 = Math.floor(z + CR + 1);
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      if (spec.noCut || !this.world.brushAt(tx, tz)) continue;   // (a bare-handed shove cuts nothing)
      if (!inArc(tx + 0.5, tz + 0.5, 0.45, CR)) continue;
      const b = this.world.hitBrush(tx, tz, Math.max(spec.cut || power, this.relicsCtl?.cutPower || 0));   // (Bramble Gloves)
      if (b === -1) {
        nicked++;
        fx.burst({ x: tx + 0.5, y: 0.4, z: tz + 0.5 }, { color: '#c23a3a', color2: '#5c2f2e', count: 4, speed: 2, up: 1.5, life: 0.3, size: 1.5 / 32 });
        fx.burst({ x: tx + 0.5, y: 0.5, z: tz + 0.5 }, { color: '#4a2428', count: 2, speed: 1.4, up: 1.6, life: 0.6, size: 1 / 32, aspect: 2, gravity: 3, drag: 2, flutter: 1.2 });
      } else if (b > 0) {
        cut++;
        this._cutDebris(tx, tz, b, angle);
      }
    }
    // The swing itself: a hand-pixelled smear (3 combo arcs, heavy chop), one hit-stop per swing,
    // a camera kick along the blow and a little shake. (A shove — the machete is out — has no blade arc.)
    if (!spec.shove) fx.smear(x, z, angle, {
      range: R, arc: spec.arc, sign: step === 1 ? -1 : 1, kind: chop ? 'chop' : step === 2 ? 'heavy' : 'slash',
      frame: chop ? M.chopSmearFrames : M.smearFrames[step], y: M.smearY, scale: M.smearScale,
      // unless the swing points away from the camera (behind the player), draw it over the undergrowth
      onTop: Math.sin(angle) > -0.4,
    });
    if (hits) {
      this.relicsCtl?.landed();
      fx.hitStop(kills ? (chop ? M.chopKillStop : M.killStop) : chop ? M.chopStop : M.stop[step]);
      const hx = hitAt.x - Math.cos(angle) * 0.25, hz = hitAt.z - Math.sin(angle) * 0.25;
      fx.flash({ x: hx, y: 0.6, z: hz }, { color: chop ? '#fee761' : '#ffffff', size: chop ? 0.55 : 0.45, life: 0.06 });
      this.game.sfx.play(kills ? 'kill' : 'flesh');
      this.game.shake(chop ? M.chopShake : M.shake[step], 0.1);
    }
    const kick = hits ? (chop ? M.chopKick : M.kick[step]) : cut ? M.whiffKick : 0;
    if (kick) { this.camFocus.x += Math.cos(angle) * kick; this.camFocus.z += Math.sin(angle) * kick; }
    if (chop) {
      // The heavy blow bites into the ground in front of you.
      const cx = x + Math.cos(angle) * R * 0.6, cz = z + Math.sin(angle) * R * 0.6;
      if (this.world.levelAt(cx, cz) > LEVEL.water) {
        fx.crack({ x: cx, z: cz });
        fx.burst({ x: cx, y: 0, z: cz }, { color: '#8f563b', color2: '#5a4430', count: 10, speed: 2.2, up: 2.4, life: 0.45, size: 2 / 32, gravity: 10, y: 0.1 });
        fx.burst({ x: cx, y: 0, z: cz }, { color: '#b86f50', color2: '#e4a672', count: 5, speed: 1, up: 0.8, life: 0.6, size: 3 / 32, gravity: 1, drag: 3, y: 0.1 });
      }
      this.game.sfx.play('crack');
      if (!hits) this.game.shake(M.chopShake * 0.5, 0.08);
    }
    if (cut) {
      this.game.sfx.play('cut');
      // Cutting is loud: anything nearby comes to look.
      this.alertNear(x, z, (4.5 + Math.min(3, cut)) * (this.noiseMult ?? 1), null, true);   // (rain muffles it: Weather.js)
      if (!this.warned.cut) { this.warned.cut = true; }
      this._cutCount = (this._cutCount || 0) + cut;
    }
    if (nicked && !this.warned.bramble) {
      this.warned.bramble = true;
      this.toast('Thorny bramble: hold right-click for a heavy chop to clear it', 'amber', 3);
    }
    return hits;   // creatures / nests / pods struck (Player pays full stamina only for those)
  }

  /** Debris from a cut undergrowth tile: leaf chips that see-saw down, plus stem / bark / thorn bits. */
  _cutDebris(tx, tz, b, angle) {
    const fx = this.fx;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    // leaf chips show their pale undersides as they tumble (bright enough to read in canopy shade)
    const leaves = b === BRUSH.bramble ? ['#c23a3a', '#4a2428'] : b === BRUSH.fern ? ['#99e550', '#62983f'] : ['#63c74d', '#2a5628'];
    const chips = b === BRUSH.bramble ? ['#e4a672', '#733e39'] : b === BRUSH.fern ? ['#3e8948', '#c0d470'] : ['#8f563b', '#e4a672'];
    const p = { x: tx + 0.5, y: 0.5, z: tz + 0.55 };
    fx.burst(p, { color: leaves[0], color2: leaves[1], count: b === BRUSH.fern ? 6 : 10, speed: 2.2, up: 2.6, life: 1.0, size: 2 / 32, aspect: 1.5, gravity: 3, drag: 2.4, flutter: 1.6, vx: ca * 1.8, vz: sa * 1.8 });
    fx.burst(p, { color: leaves[1], color2: leaves[0], count: b === BRUSH.fern ? 3 : 5, speed: 2.6, up: 2.2, life: 0.55, size: 2 / 32, gravity: 7, vx: ca * 2.2, vz: sa * 2.2 });
    fx.burst({ x: p.x, y: 0.2, z: p.z }, { color: chips[0], color2: chips[1], count: b === BRUSH.fern ? 3 : 6, speed: 3, up: 2, life: 0.4, size: 1 / 32, aspect: b === BRUSH.fern ? 1 : 2, gravity: 13, vx: ca * 1.2, vz: sa * 1.2 });
  }

  /** Old wedge FX were replaced by Fx.smear (pixel arcs); kept so the frame loop's call stays valid. */
  _updateSlashes() {}

  /** A Razorback bulldozes through undergrowth. */
  crashBrush(tx, tz) {
    const b = this.world.hitBrush(tx, tz, 2);
    if (b > 0) {
      this.fx.burst({ x: tx + 0.5, y: 0.5, z: tz + 0.5 }, { color: '#2a5628', color2: '#5a4430', count: 6, speed: 2.5, up: 2.5, life: 0.5, size: 2 / 32, gravity: 6 });
      this.fx.burst({ x: tx + 0.5, y: 0.6, z: tz + 0.5 }, { color: '#2a5628', color2: '#4b8139', count: 6, speed: 2, up: 2.4, life: 0.9, size: 1 / 32, aspect: 2, gravity: 3, drag: 2.4, flutter: 1.5 });
    }
  }

  alertNear(x, z, r, src, noise = false) {
    for (const e of this.enemies) {
      if (e === src || e.dead || e.alerted) continue;
      if (Math.hypot(e.x - x, e.z - z) <= r) {
        e.alert(false);
        if (noise && e.alerted) e.home = { x, z };   // (a lair's Pack Lord / pack ignore it and keep their home)
      }
    }
  }

  spawnEnemy(key, x, z, opts = {}) {
    const e = makeEnemy(this, key, x, z, opts);   // (Bloater / Feral Chief get their own classes, DayCreatures.js)
    this.enemies.push(e);
    return e;
  }

  onEnemyKilled(e) {
    this.kills += 1;
    if (e.id) { this.killed.add(e.id); this.spawned.delete(e.id); }
    // A boss's minion (brood, drones, the pack: e.minion) feeds no kill-heals and drops nothing (critic I2 #4).
    if (!e.minion) this.player?.onKill?.(e);   // the machete kit: Second Wind heals
    if (!e.minion) this.relicsCtl?.onKill(e);   // relic: Blood Moss heals
    this.goals?.onEnemyKilled(e);    // the Alpha's relic
    this.bosses?.onEnemyKilled(e);   // the Pack Lord
    if (e.objective) this._advanceStep(e.objStep ?? this.objStep);
    const D = X().enemyDrop;
    if (!e.minion && Math.random() < (e.def.drop || 0)) {
      const loot = { scrap: D.scrap[0] + Math.floor(Math.random() * (D.scrap[1] - D.scrap[0] + 1)) };
      if (Math.random() < D.componentChance) loot[Math.random() < 0.5 ? 'circuits' : 'biofiber'] = 1;
      if (Math.random() < D.medChance) loot.med = 1;
      this._spill(loot, e.x, e.z, false);
    }
  }

  onPlayerHurt() {
    this.post.uniforms.uHurt.value = 0.6;
  }

  // ---- relics (src/scenes/JungleRelics.js; effects read through Run.relicMod)

  /** A relic's effect field for entities (Player, SporePods): `scene.relicMod?.('rollCost')`. */
  relicMod(field) { return this.game.run.relicMod(field); }

  /** A relic falls at (x, z) for the player to pick up (area bosses: { rarity: 'R' }). Returns its id or null. */
  dropRelic(x, z, opts = {}) { return this.relicsCtl?.dropRelic(x, z, opts) ?? null; }

  /** Player._die asks first: the Lifeline Idol may save a lethal hit (true = saved). */
  relicSave(player) { return this.relicsCtl?.relicSave(player) ?? false; }

  /** Player._perfectDodge tells relics (Hunter's Fang). */
  relicPerfectDodge() { this.relicsCtl?.relicPerfectDodge(); }

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
    const first = run.night === 1;   // FIRST_DAY: a quieter ring around the Relay, fewer and lone creatures
    if (dc < (first ? FIRST_DAY.safeRadius : POP.safeRadius)) return list;
    const danger = Math.min(1, Math.max(0, (dc - POP.safeRadius) / 64));
    const ri = this.data.region[Math.min(W - 1, Math.floor(mz)) * W + Math.min(W - 1, Math.floor(mx))];
    const dKey = DISTRICT_KEYS[ri] || this.district;
    const weights = {};
    for (const [t, w] of Object.entries(DISTRICTS[dKey].enemies)) {
      const key = POP.remap[t] || t;
      if (EXPLORE_ENEMIES[key]) weights[key] = (weights[key] || 0) + w;
    }
    if (first) {   // day 1: no tanks or ranged creatures roaming yet
      for (const t of FIRST_DAY.noRoam) delete weights[t];
      if (!Object.keys(weights).length) weights.crawler = 1;
    }
    const nightMul = POP.byNight[Math.min(POP.byNight.length - 1, run.night - 1)];
    let n = Math.round((POP.base + POP.far * danger) * nightMul * (first ? FIRST_DAY.pop : 1) * (ri === this.regionIdx ? POP.targetRegion : 1) + rng.next() - 0.5);
    let id = 0;
    // Walkers (no brush 'through' / 'crash' / 'under') need an open tile with ≥ 3 open neighbours: no Feral starts
    // boxed into a thicket (critic I #5).
    const walker = (key) => { const b = EXPLORE_ENEMIES[key]?.brush; return b !== 'through' && b !== 'crash' && b !== 'under'; };
    const spot = (x0, z0, r, walk = false) => {
      for (let t = 0; t < 24; t++) {
        const x = x0 + (rng.next() - 0.5) * 2 * r, z = z0 + (rng.next() - 0.5) * 2 * r;
        const tx = Math.floor(x), tz = Math.floor(z);
        if (tx < 1 || tz < 1 || tx >= W - 1 || tz >= W - 1) continue;
        if (this.world.levelAt(x, z) === LEVEL.water || this.world.blockedAt(tx, tz, true)) continue;   // not in a trunk / rock / ruin
        if (walk && !this._openForWalker(tx, tz)) continue;
        return { x: tx + 0.5, z: tz + 0.5 };
      }
      return null;
    };
    while (n > 0) {
      const g = Math.min(n, rng.int(POP.group[0], POP.group[1]), first ? FIRST_DAY.groupMax : 99);
      n -= g;
      const type = rng.weighted(weights);
      const c = spot(mx, mz, C / 2 - 1, walker(type));
      if (!c) continue;
      for (let i = 0; i < g; i++) {
        const key = i > 0 && type === 'razorback' ? 'crawler' : type;
        const p = spot(c.x, c.z, 1.6, walker(key)) || c;
        list.push({ id: `w${cx}_${cz}_${id++}`, key, x: p.x, z: p.z });
      }
    }
    // Feral camps.
    for (const s of this.data.sites) {
      if (s.type !== 'camp' || Math.floor(s.x / C) !== cx || Math.floor(s.z / C) !== cz) continue;
      const cs = first ? FIRST_DAY.campSize : POP.campSize;
      const m = rng.int(cs[0], cs[1]) + (run.night >= (POP.campGrowFrom ?? 3) ? 1 : 0);
      // From DAY_CREATURES.chief.fromNight a Feral Chief leads the camp (its aura speeds the Ferals up).
      const chief = EXPLORE_ENEMIES.feral_chief && run.night >= DAY_CREATURES.chief.fromNight;
      for (let i = 0; i < m; i++) {
        const a = (i / m) * Math.PI * 2;
        let x = s.x + Math.cos(a) * 1.8, z = s.z + Math.sin(a) * 1.8;
        if (!this._openForWalker(Math.floor(x), Math.floor(z))) { const q = spot(s.x, s.z, 2.6, true); if (q) { x = q.x; z = q.z; } }
        list.push({ id: `c${s.id}_${i}`, key: chief && i === 0 ? 'feral_chief' : 'feral', x, z, guard: true, site: s.idx });
      }
    }
    // Thorn Stalkers (critic I §9D): from POP.stalker.fromNight, in chunks thick with ferns, under a fern tile.
    const ST = POP.stalker;
    if (ST && EXPLORE_ENEMIES.stalker && run.night >= ST.fromNight && !first) {
      let fern = 0, total = 0;
      for (let z = cz * C; z < cz * C + C; z += 2) for (let x = cx * C; x < cx * C + C; x += 2) { total++; if (this.world.brushAt(x, z) === BRUSH.fern) fern++; }
      const chance = ST.chance * (ST.districts?.[dKey] ?? 1);
      if (fern / Math.max(1, total) >= ST.fernShare) {
        for (let i = 0; i < ST.max; i++) {
          if (rng.next() >= chance) continue;
          for (let t = 0; t < 30; t++) {
            const tx = cx * C + 1 + Math.floor(rng.next() * (C - 2)), tz = cz * C + 1 + Math.floor(rng.next() * (C - 2));
            if (this.world.brushAt(tx, tz) !== BRUSH.fern || this.world.blockedAt(tx, tz, true)) continue;
            list.push({ id: `s${cx}_${cz}_${i}`, key: 'stalker', x: tx + 0.5, z: tz + 0.5 });
            break;
          }
        }
      }
    }
    // Bloaters (DAY_CREATURES, src/data/bosses.js): from day 4, a chance per chunk (by area).
    const BL = DAY_CREATURES.bloater;
    if (BL && EXPLORE_ENEMIES.bloater && run.night >= BL.fromNight && !first && rng.next() < BL.chance * (BL.districts?.[dKey] ?? 1)) {
      const p = spot(mx, mz, C / 2 - 1);
      if (p) list.push({ id: `b${cx}_${cz}`, key: 'bloater', x: p.x, z: p.z });
    }
    // Nothing roams inside a living area boss's arena (that fight is its own).
    if (this.bosses?.lairs.length) for (let i = list.length - 1; i >= 0; i--) if (this.bosses.inLair(list[i].x, list[i].z, 2)) list.splice(i, 1);
    return list;
  }

  /** Can a creature that needs open ground stand on tile (tx, tz) and walk off it (≥ 3 open neighbours)? */
  _openForWalker(tx, tz) {
    const w = this.world;
    if (w.blockedAt(tx, tz, false)) return false;
    let free = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && !w.blockedAt(tx + dx, tz + dz, false)) free++;
    return free >= 3;
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
        if (this._inDuel(s.x, s.z)) continue;   // (POP.duel: no wildlife round a live elite-duel target)
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
    const pl = this.player;
    for (const e of this.enemies) {
      // A creature with a ward (the engineer / the uplink, JungleGoals.js) runs its AI against that instead of you.
      if (!e.ward || e.dead) { e.update(dt); continue; }
      this.player = e.ward;
      try { e.update(dt); } finally { this.player = pl; }
    }
    // Keep bodies apart.
    const list = this.enemies.filter((e) => !e.dead && !e.hidden && e.state !== 'spawn');
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

  /** Is (x, z) inside a live duel quest's ring (POP.duel: the elite Razorback is fought alone, not in a brawl)? */
  _inDuel(x, z) {
    const D = POP.duel;
    if (!D) return false;
    for (const t of this.objTargets) {
      if (!t.kill || !D.kills.includes(t.kill) || t.step < this.objStep || t.enemy?.dead || this.objectiveDone) continue;
      const c = t.enemy && !t.enemy.dead ? t.enemy : t;   // (the ring moves with the beast once it's out)
      if (Math.hypot(c.x - x, c.z - z) < D.radius) return true;
    }
    return false;
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
      // A duel (POP.duel, Stage 9 fix wave 2): calm wildlife already round it slips back into the bush.
      if (POP.duel?.kills.includes(t.kill)) {
        for (const w of this.enemies) {
          if (w === e || w.dead || !w.id || w.alerted || Math.hypot(w.x - t.x, w.z - t.z) > POP.duel.radius) continue;
          w.dead = true; w.despawned = true; this.spawned.delete(w.id);
        }
      }
      t.enemy = e;
      t.onSpawn?.(e);   // (the Alpha, JungleGoals.js)
      const sup = X().elite.supportTypes;
      const n = POP.duel?.kills.includes(t.kill) ? 0 : nightTune('eliteSupport', this.game.run.night);   // (a duel: no adds)
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
      this.game.sfx.play('ambush');
      for (let i = 0; i < it.guards; i++) {
        const p = this._openSpot(it.x, it.z, 3, 5.5);
        // Day 1: the guard is a lone Crawler (the first fight is meant to be easy).
        const type = this._firstDay ? 'crawler' : i === 0 ? 'feral' : this.rng.pick(['crawler', 'feral', 'skitter']);
        if (p) this.spawnEnemy(type, p.x, p.z, { spawnIn: true, alerted: true });
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
    // The death beat (critic I #12): a beat of slow-mo over the collapse (Player._collapse) while the creatures
    // around back off the body.
    const PD = CONFIG.player.death;
    this.fx.slowMo(PD.slowMo, PD.scale);
    for (const e of this.enemies) if (Math.hypot(e.x - this.player.pos.x, e.z - this.player.pos.z) < PD.radius) e.stepBack?.(this.player.pos.x, this.player.pos.z, PD.stepBack);
    this.holdTarget = null;
    this.game.sfx.play('player_down');
    this.fx.burst(this.player.pos, { color: '#e43b44', color2: '#3e8948', count: 30, speed: 3, up: 3, life: 0.8, y: 0.6 });
    this.later(1.2, () => {
      this.timeScale = 1;
      // Death rules (Run.salvageFor / dawnHp): the drone saves a share of what you carried (never more), the goal
      // keeps its skill point but its night reward needed you home, and you wake tomorrow with at least 60 health.
      const salv = this._salvage();
      const lostOf = (k) => Math.max(0, Math.floor(this.carried[k]) - (salv[k] || 0));
      const lost = RESOURCE_KEYS.filter((k) => lostOf(k) > 0).map((k) => resChip(k, lostOf(k)));
      const kept = RESOURCE_KEYS.filter((k) => salv[k] > 0).map((k) => resChip(k, salv[k]));
      const meds = Math.min(this.player.maxMeds ?? CONFIG.player.maxMeds, this.player.meds | 0);
      if (meds > 0) lost.push(el('span.res', { style: { '--c': '#e43b44' }, html: `${resIconHtml('pick_med')} <b>${meds}</b> <span class="lbl">${meds === 1 ? 'Med kit' : 'Med kits'}</span>` }));
      const run = this.game.run;
      const dawn = run.dawnHp ? run.dawnHp(CONFIG.expedition.deathReturnHp) : CONFIG.expedition.deathReturnHp;
      const note = this.player.deathNote?.();   // what got you, and what to do about it (Player.deathNote, Stage 9)
      const body = el('div.col', {},
        el('p.small.muted', 'You collapse in the undergrowth, and a Relay drone drags you home.'),
        note ? el('div', {}, el('p.bad', note.line), el('p.small', note.tip), note.wounds.length > 1 ? el('p.small.muted', `Today's wounds: ${note.wounds.join(' · ')}`) : null) : null,
        lost.length ? el('div', {}, el('p.bad', 'Carried loot lost:'), el('div.resrow', {}, lost)) : el('p.muted', 'You weren\'t carrying anything.'),
        kept.length ? el('div', {}, el('p.good', 'The drone salvaged:'), el('div.resrow', {}, kept)) : null,
        this.relicsCtl?.lostLines(),   // relics you carried are lost (never salvaged)
        this.objectiveDone ? el('p', {}, el('span.good', this._rewardSafe() ? 'Your quest keeps its skill point and its reward (the drone already has it).' : 'Your quest still earns its skill point'),
          this._rewardSafe() ? null : el('span.bad', this.objDef.boon ? ', but its reward tonight needed you home.' : '.')) : null,
        el('p', `You start tomorrow with ${dawn} health. Everything stored at base, and your towers, are safe.`));   // the consequence: body text (critic M P2-5)
      // Keys too (critic L §2.3): Enter / Space / E / Esc, after a short guard so a key mashed in the fight can't skip it.
      const ov = modal(this.game.ui, 'You went down', body, [button('Back to base', () => this._finish('died'), { cls: 'primary', hotkey: 'Enter' })], { guard: 0.6, extraKeys: [this.game.input.keyFor('interact')] });
      ov.querySelector('h2')?.classList.add('bad');
    });
  }

  /** Nothing to show for the trip: no loot carried, goal not done, no bonus task. Going home then asks first. */
  _emptyHanded() {
    return !this.objectiveDone && !this.optionalsDone.length && !RESOURCE_KEYS.some((k) => this.carried[k] > 0) && !this.relicsCtl?.carried.length;
  }

  /** "Head home with nothing?" (critic J: a second E-hold at a fresh beacon used to end the day at t≈25 s). */
  _confirmEmptyHome() {
    this.setPaused(true);
    if (!this.paused) return;
    if (this.pauseModal) this.pauseModal.style.display = 'none';   // the pause menu waits behind the question
    this.confirmModal?.remove();
    const body = el('div.col', {},
      el('p', 'You carry no loot and the quest isn\'t done.'),
      el('p.muted.small', 'Going home now ends today\'s trip with nothing to show for it. Tonight\'s attack still comes.'));
    this.confirmModal = modal(this.game.ui, 'Head home with nothing?', body, [
      button('Keep exploring', () => this.setPaused(false), { cls: 'primary', hotkey: 'Esc' }),
      button('Head home', () => { this.setPaused(false); this._extract(true); }),
    ]);
  }

  _extract(confirmed = false) {
    if (this.ending) return;
    if (!confirmed && this._emptyHanded()) { this._confirmEmptyHome(); return; }
    this.ending = true;
    this.holdTarget = null;
    this.game.sfx.play('extract');
    this.shots.clearEnemyShots();
    const p = this.player.pos;
    this.fx.burst(p, { color: '#2ce8f5', color2: '#ffffff', count: 40, speed: 2, up: 6, life: 1, gravity: -2 });
    this.fx.ring(p, { color: '#2ce8f5', radius: 3, life: 0.6 });
    this.game.flash('#2ce8f5', 0.3);
    this._banner('BACK HOME SAFE', this.objectiveDone ? 'Loot stored, quest done' : 'Loot stored', { prio: 3 });
    this.later(1.4, () => this._finish('extracted'));
  }

  /**
   * What the drone recovers when you go down or abandon the trip (Run.salvageFor): a share of the carried loot,
   * on early nights at least a floor of Scrap — never more than you carried.
   */
  _salvage() {
    return this.game.run.salvageFor(this.carried, this.dayT);
  }

  /** End the trip: 'extracted' | 'died' | 'abandoned'. toTitle: a mid-day quit (abandoned, then the title screen). */
  _finish(kind, toTitle = false) {
    if (this.finished) return;
    this.finished = true;
    const run = this.game.run;
    run.storeWorld(this.state);
    const extracted = kind === 'extracted';
    const salvaged = extracted ? null : this._salvage();
    // A quest you didn't finish but came home from still earns its skill point from night failedQuestPointFrom (fix wave,
    // critic R: a hard day used to cost the point too, and the run spiralled).
    if (extracted && !this.objectiveDone && run.night >= (X().failedQuestPointFrom ?? 99)) this._grantSkillPoint({ quiet: true });
    const result = {
      district: this.district,
      extracted,
      died: kind === 'died',
      abandoned: kind === 'abandoned',
      carried: { ...this.carried },
      salvaged: salvaged && Object.keys(salvaged).length ? salvaged : null,
      objectiveDone: this.objectiveDone,
      // A goal finished by handing something to the drone at home (escort, haul) is already home: its reward stands
      // even if you go down afterwards (critic J2 C10).
      objectiveSecured: !!(this.objectiveDone && this._rewardSafe()),
      objective: this.objKey,
      objectiveName: this.objDef.name,
      boon: this.objectiveDone ? this.objDef.boon : null,
      optionals: this.optionalsDone.map((o) => ({ ...o })),
      events: this.eventsDone.map((e) => ({ ...e })),
      objectiveFailed: !!this.objectiveFailed,                 // (the engineer went down)
      bossesKilled: [...(this.bosses?.killed || [])],          // area bosses killed today (Research; Run.clearBoss already ran)
      blooms: this.forage?.picked || 0, bloomResearch: this.forage?.bloomResearch() || 0,   // dusk blooms picked (Research)
      weather: this.weather?.key || null,
      skillPointsEarned: this.spEarned,
      medsLeft: Math.min(this.player.maxMeds ?? CONFIG.player.maxMeds, this.player.meds),
      playerHp: Math.max(1, Math.round(this.player.hp)),
      kills: this.kills,
      relics: [...(this.relicsCtl?.carried || [])],   // carried relics: kept only if extracted (Run.bankRelics)
      timeUsed: Math.round(this.dayT),
      overtime: this.dayT > DAY.length,
    };
    const summary = run.applyExpedition(result, this.game);
    // Quit to title: the abandoned trip is settled and saved, and Continue opens its summary.
    if (toTitle) { run.save('summary'); this.game.go('title'); return; }
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
        el('p.muted.small', { html: `${this._moveKeys()} move · <b>Click</b> slash (hold while walking: hack through) · hold <b>right-click</b> heavy chop (tap just before a hit: deflect) · ${this._key('roll')} roll · ${this._key('throw')} throw machete · ${this._key('interact')} interact (hold) · ${this._key('med')} med kit · ${this._key('map')} map · keys in Settings` }),
        el('p', {}, 'Quest: ', el('b.amber', this.objDef.name), this.objectiveDone ? el('span.good', ' (done)') : null),
        this.relicsCtl?.pauseLine());   // your relics (working / carried), when you have any
      this.pauseModal = modal(this.game.ui, 'Paused', body, [
        button('Resume', () => this.setPaused(false), { cls: 'primary', hotkey: 'Esc' }),
        button('Settings', () => {
          this.settingsOpen = true;
          this.pauseModal.style.display = 'none';
          // (The Esc that closed Settings goes back to this menu, not on to the game: drop its press.)
          openSettingsOverlay(this.game, { onClose: () => { this.settingsOpen = false; this.game.input.pressed.delete('Escape'); if (this.pauseModal) this.pauseModal.style.display = ''; } });
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

  /** The death-rule lines shared by the abandon and quit confirms: what's lost, what the drone saves, tomorrow's health. */
  _abandonLines() {
    const run = this.game.run;
    const salv = this._salvage();
    const carried = RESOURCE_KEYS.some((k) => this.carried[k] > 0);
    const saved = RESOURCE_KEYS.filter((k) => salv[k] > 0).map((k) => `${salv[k]} ${RESOURCES[k].label}`).join(', ');
    return [
      el(carried ? 'p.bad' : 'p.muted', !carried ? 'You carry nothing, so nothing is lost.'
        : saved ? `What you carry is lost, except what the drone saves (${saved}).` : 'Everything you carry is lost.'),
      this.objectiveDone && this.objDef.boon ? el('p.small', {}, el('span.good', this._rewardSafe() ? 'The quest keeps its skill point and its reward (the drone already has it).' : 'The quest keeps its skill point'),
        this._rewardSafe() ? null : el('span.bad', ', but its reward tonight needs you home.')) : null,
      this.relicsCtl?.lostLines(),
      el('p.muted.small', `You start tomorrow with ${run.dawnHp(CONFIG.expedition.deathReturnHp)} health. Stored resources and towers are safe.`),
    ];
  }

  _confirmAbandon() {
    this.confirmModal?.remove();
    const body = el('div.col', {}, el('p', 'Abandoning counts as going down:'), ...this._abandonLines());
    this.confirmModal = modal(this.game.ui, 'Abandon expedition?', body, [
      button('Keep going', () => { this.confirmModal.remove(); this.confirmModal = null; }, { cls: 'primary' }),
      button('Abandon', () => this._finish('abandoned'), { cls: 'danger' }),
    ]);
  }

  /** Quitting mid-day abandons the trip (critic L §5: it used to be a free reset of a bad day). */
  _confirmQuit() {
    this.confirmModal?.remove();
    const body = el('div.col', {},
      el('p', 'Quitting now abandons this trip, the same as going down:'),
      ...this._abandonLines(),
      el('p.muted.small', 'Continue picks the run up after the trip, before tonight\'s attack.'));
    this.confirmModal = modal(this.game.ui, 'Quit to title?', body, [
      button('Keep going', () => { this.confirmModal.remove(); this.confirmModal = null; }, { cls: 'primary' }),
      button('Abandon & quit', () => this._finish('abandoned', true), { cls: 'danger' }),
    ]);
  }

  toggleMap(open = !this.mapOpen) {
    if (open === this.mapOpen) return;
    this.mapOpen = open;
    const h = this.hud;
    h.bigmap.style.display = open ? '' : 'none';
    setToastsPaused(this.game.ui, open);
    this.game.ui.classList.toggle('j-mapopen', open);
    this.player.reticle.visible = !open;
    this.game.stage.style.cursor = open ? '' : 'none';
    if (open) {
      this._mapOpened = true;   // (the guided day's "map" coach step)
      h.fillLegend?.();
      for (const b of this.game.ui.querySelectorAll('.x-banner')) b.remove();
      h.bigSteps.innerHTML = this.quest.bigHtml();   // the quest: every step ✔ / ☐ and its reward
      this._sizeBig();
      // Frame the explored area (plus the Relay and you); a far objective sticks to the map edge.
      const extra = this._markers().filter((m) => m.type === 'relay' || m.type === 'player');
      this.bigView = this.map.fitView(h.big.width, h.big.height, extra);
      this._updateBigMap(0);
    }
  }

  /** Match the big-map canvas to its CSS box in device pixels (the map is drawn pixel-exact). */
  _sizeBig() {
    const cv = this.hud.big, dpr = window.devicePixelRatio || 1;
    const w = Math.max(64, Math.round(cv.clientWidth * dpr)), hh = Math.max(64, Math.round(cv.clientHeight * dpr));
    if (cv.width === w && cv.height === hh) return;
    cv.width = w; cv.height = hh;
    if (this.bigView) this.bigView.ppt = this.map.clampZoom(this.bigView.ppt, w, hh);
  }

  /** Drag to pan, wheel to zoom (around the cursor). */
  _bindBigMap(cv) {
    const dpr = () => window.devicePixelRatio || 1;
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.bigView) return;
      drag = { x: e.clientX, y: e.clientY };
      cv.setPointerCapture?.(e.pointerId);
      cv.classList.add('drag');
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || !this.bigView) return;
      const k = dpr() / this.bigView.ppt;
      this.bigView.cx -= (e.clientX - drag.x) * k;
      this.bigView.cz -= (e.clientY - drag.y) * k;
      drag.x = e.clientX; drag.y = e.clientY;
      this.map.clampView(this.bigView);
    });
    const end = () => { drag = null; cv.classList.remove('drag'); };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this._zoomBig(e.deltaY < 0 ? 1 : -1, (e.clientX - r.left) * dpr(), (e.clientY - r.top) * dpr());
    }, { passive: false });
  }

  _zoomBig(dir, px, py) {
    const v = this.bigView, cv = this.hud.big;
    if (!v) return;
    if (px == null) { px = cv.width / 2; py = cv.height / 2; }
    const ppt = this.map.clampZoom(v.ppt + dir * Math.max(1, Math.round(v.ppt * 0.25)), cv.width, cv.height);
    if (ppt === v.ppt) return;
    // Keep the tile under the cursor where it is.
    const wx = v.cx + (px - cv.width / 2) / v.ppt, wz = v.cz + (py - cv.height / 2) / v.ppt;
    v.ppt = ppt;
    v.cx = wx - (px - cv.width / 2) / ppt;
    v.cz = wz - (py - cv.height / 2) / ppt;
    this.map.clampView(v);
  }

  /** While the big map is open (the day is paused): pan / zoom keys, then draw. `dt` is real time. */
  _updateBigMap(dt) {
    const v = this.bigView;
    if (!v) return;
    const input = this.game.input;
    this._sizeBig();
    const k = (MAP_VIEW.panSpeed * dt) / v.ppt;
    // The movement keys (as bound: they read as KeyW…) and the arrow keys (physical) pan.
    const key = (code, arrow) => input.isDown(code) || input.rawIsDown(arrow);
    v.cx += ((key('KeyD', 'ArrowRight') ? 1 : 0) - (key('KeyA', 'ArrowLeft') ? 1 : 0)) * k;
    v.cz += ((key('KeyS', 'ArrowDown') ? 1 : 0) - (key('KeyW', 'ArrowUp') ? 1 : 0)) * k;
    if (input.rawWasPressed('Equal') || input.rawWasPressed('NumpadAdd')) this._zoomBig(1);
    if (input.rawWasPressed('Minus') || input.rawWasPressed('NumpadSubtract')) this._zoomBig(-1);
    if (input.rawWasPressed('Space') || input.wasPressed('Space')) { v.cx = this.player.pos.x; v.cz = this.player.pos.z; }
    this.map.clampView(v);
    this.map.drawBig(this.hud.big, v, this._markers(), this.game.time, this.relicsCtl?.labels());   // + place names
  }

  /**
   * A banner in the top-centre band (critic H2 §5.1: one text lane, ui.showBanner): one at a time, toasts held while it
   * shows. opts.prio (place names 0 < default 1 < area boss 2 < going home 3: a higher one cuts a lower one),
   * opts.extra (HTML: a follow-up line that fades in TEXT_LANE.banner.extraDelay s later, e.g. a boss kill's rewards),
   * opts.time (s on screen), opts.cls (an extra class: 'boss'). Before the HUD exists it goes to the UI root.
   */
  _banner(title, sub, opts = {}) {
    const extra = opts.extra ? el('div.x-banner-x', { html: opts.extra, style: { animationDelay: `${TEXT_LANE.banner.extraDelay}s` } }) : null;
    const b = el(`div.x-banner${opts.cls ? '.' + opts.cls : ''}`, {}, el('div.x-banner-t', title), sub ? el('div.x-banner-s', sub) : null, extra);
    return showBanner(this.hud?.root || this.game.ui, b, { prio: opts.prio ?? 1, time: opts.time, toasts: this.game.ui });
  }

  // ================================================================== update

  update(dt) {
    const input = this.game.input;
    if (input.wasPressed('Escape') && !this.settingsOpen) {
      if (this.mapOpen) this.toggleMap(false);
      else if (this.confirmModal) {
        this.confirmModal.remove(); this.confirmModal = null;
        // "Head home with nothing?" hides the pause menu behind it: Esc there means "keep exploring".
        if (this.pauseModal?.style.display === 'none') this.setPaused(false);
      }
      else if (!this.ending) this.setPaused(!this.paused);
    }
    if ((input.wasPressed('Tab') || input.wasPressed('KeyM')) && !this.paused) this.toggleMap();
    // The quest key (Settings → Controls 'quest', default J; it reads as its default code): the quest card again.
    if (input.wasPressed(DEFAULT_KEYS.quest) && !this.paused && !this.mapOpen && !this.ending) this.quest?.toggleCard();
    if (this.paused || this.finished) return;
    // The big map pauses the day: the world, the timer and every entity freeze while it is open.
    if (this.mapOpen) { this._updateBigMap(dt); return; }

    dt *= this.timeScale * this.fx.step(dt);
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    this._pumpHints();

    this.blockFire = this.mapOpen || !!this.goals?.carrying;   // (no swinging with the generator core in your arms)
    this.player.update(dt);
    this._updateFlow(dt);
    this._updateWildlife(dt);
    this._updateObjectiveSpawns();
    tickSpeedBuffs(this.enemies, this.dayT);   // Feral Chief aura / Pack Lord war cry (DayCreatures.js)
    this._updateEnemies(dt);
    this._updateNests(dt);
    this.goals?.update(dt);     // escort, uplink, tracks, core, bloom (before interaction: E drops the core)
    this.bosses?.update(dt);    // area bosses and their HP bar
    this.weather?.update(dt);   // rain ripples
    this.spores.update(dt);
    this.forage?.update(dt);    // glint sparkles
    this.shots.update(dt);
    this._updatePickups(dt);
    this.relicsCtl?.update(dt);   // relics on the ground, shrines, place names
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
    this.wading.update(dt);
    this.ambience.update(dt, this.camFocus.x, this.camFocus.z, this.duskK);
    this._updateLight(dt);
    this._updateHud(dt);
  }

  _placeCamera(dt, snap = false) {
    const p = this.player.pos;
    const ax = this.player.aimPoint.x - p.x, az = this.player.aimPoint.z - p.z;
    const al = Math.hypot(ax, az);
    const k = al > 0.01 ? (Math.min(1, al / 7) * 1.6) / al : 0;
    let tx = p.x + ax * k, tz = p.z - 0.6 + az * k * 0.8;
    // An area boss fight leans the view toward the boss so it stays on screen (AreaBoss.js focus, BOSS.camPull).
    const bf = this.bosses?.focus();
    if (bf) { tx += (bf.x - p.x) * bf.k; tz += (bf.z - p.z) * bf.k; }
    // Arrival at the Relay (critic G #10): frame the Relay + player (clear of the arrival toast) until
    // the player walks off or DAY.spawnFrame.time passes.
    const SF = DAY.spawnFrame, R = this.relayPos;
    if (SF && !this.startPylon && (this.time || 0) < SF.time
      && Math.hypot(p.x - R.x - DAY.startOffset[0], p.z - R.z - DAY.startOffset[1]) < SF.leave) {
      tx = (p.x + R.x) / 2; tz = R.z + SF.z;
    }
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
    // Golden hour → moonlit night, lamp pool, light radius (PostFx.timeOfDay, ATMOS.cycle).
    this.post.timeOfDay(this.dayT / DAY.length, this.duskK);
    this.relicsCtl?.light(U);   // Lantern Moth: a wider light after sunset
    U.uHurt.value = Math.max(0, U.uHurt.value - dt * 2);
    // X-ray window for foliage in front of the player (GL pixel coordinates: y up).
    const body = cam.toPixel(new THREE.Vector3(this.player.pos.x, 0.75, this.player.pos.z));
    this.world.setPlayer(body.x, this.game.height - body.y, this.player.pos.z, this.player.pos.x, this.player.vis);
    // Occlusion silhouettes (Assets.js): enemies show bright once alerted, dim while unaware.
    for (const e of this.enemies) {
      if (e.vis) {
        e.vis.userData.alert = !!e.alerted;
        // One colour language, quieter (critic H2 §5.8, like the night): the hostile ground ring shows only on a
        // creature that is coming for you — winding up, attacking, holding an attack slot, or right on you — and on
        // elites / area bosses (their mark). The rest keep just their shadow; wind-up telegraphs are separate.
        const ring = e.vis.userData.ringNode ??= e.vis.children.find((c) => c.name === 'ring') || false;
        if (ring) {
          const near = e.alerted && Math.hypot(e.x - this.player.pos.x, e.z - this.player.pos.z) < HUD.ringNear;
          ring.visible = !!(e.elite || e.lordOf || e.token || near || e.state === 'windup' || e.state === 'attack');
        }
      }
      // A red "!" over a creature winding up an attack (on top of its ground telegraph): plain "it's about to hit".
      // (Stage 9: it pops with the red commit flash, e.committed — "red flash = roll"; ranged wind-ups have no commit.)
      if (e.state === 'windup' && (e.committed || !/^(lunge|thrust2|charge2?|stomp)$/.test(e.mv || '')) && !e._bang && !e.dead) {
        e._bang = true;
        this.fx.text({ x: e.x, z: e.z }, '!', { color: JUICE.attackBang?.color || '#ff2e2e', cls: 'big', life: JUICE.attackBang?.life || 0.55, y: (e.vis?.userData.vis?.height || 1) + 0.3 });
      } else if (e.state !== 'windup') e._bang = false;
    }
  }

  _updateDay(dt) {
    this.dayT += dt;
    const t = this.dayT;
    if (t > DAY.length - TIPS.sunset.lead && !this.warned.sun60) {
      this.warned.sun60 = true;
      // The first time it is a tip that says what sunset means; after that a toast.
      if (!this._tip('sunset', { cls: 'warn' })) this.toast('The sun is going down: 1 minute of daylight', 'amber', 3);
      this.game.sfx.play('sun_warn');
    }
    if (t >= DAY.length && !this.warned.sunset) {
      this.warned.sunset = true;
      this.game.music?.play('dusk');
      this.game.sfx.play('sunset');
      this._banner('SUNSET', `The jungle wakes up. Head home (the Relay or a ${WORDS.pylon})`);
      this.huntT = 4;
    }
    this.duskK = Math.max(0, Math.min(1, (t - DAY.length) / DAY.dusk));
    if (t >= DAY.length) {
      this.huntT -= dt;
      if (this.huntT <= 0) {
        this.huntT = DAY.huntEvery[0] + (DAY.huntEvery[1] - DAY.huntEvery[0]) * this.duskK + (this.relicsCtl?.huntDelay || 0);   // (Lantern Moth)
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
      if (it.done || this.seen.has(it) || Math.hypot(it.x - p.x, it.z - p.z) > (it.kind === 'pylon' ? TIPS.beacon.range : it.kind === 'event' ? EVENT_RULES.announce : 9)) continue;
      this.seen.add(it);
      if (it.kind === 'optional') this.toast(`Bonus task: ${OPTIONAL[it.key].name}`, 'amber', 3);
      if (it.kind === 'event') { this.toast(`${EVENTS[it.key].name}: ${EVENTS[it.key].prompt}`, 'amber', 4.5); this.game.sfx.play('event_found'); }
      if (it.kind === 'pylon' && !this._tip('beacon')) this.toast(`A ${WORDS.pylon} nearby: switch it on (hold ${keyLabel(this.game.input.keyFor('interact'))}) and you can head home from it`, '', 3.5);
    }
    for (const n of this.nests) {
      if (n.dead || this.seen.has(n) || Math.hypot(n.x - p.x, n.z - p.z) > 10) continue;
      this.seen.add(n);
      this.toast(`Bonus task: ${OPTIONAL[n.key].name}`, 'amber', 3);
    }
  }

  /** True when a live creature is alerted (after you) within `r` tiles. */
  _threatWithin(r) {
    const p = this.player.pos;
    return this.enemies.some((e) => !e.dead && e.alerted && Math.abs(e.x - p.x) < r && Math.abs(e.z - p.z) < r && Math.hypot(e.x - p.x, e.z - p.z) < r);
  }

  _updateInteract(dt) {
    const pl = this.player;
    const input = this.game.input;
    // Overlapping prompts: Relay / pylons beat objectives beat containers (DAY.interactRank), nearest
    // first within a rank — unless you stand right on top of a lower-ranked one (point-blank exception).
    let best = null, bd = Infinity, br = Infinity, near = null, nd = Infinity, threat = null;
    for (const it of this.interactables) {
      if (it.done || it.hidden?.()) continue;
      const d = Math.hypot(it.x - pl.pos.x, it.z - pl.pos.z);
      if (d > 4) continue;
      if (it.walkOver && d < 0.75 && it.enabled()) { this._complete(it); continue; }
      if (d > it.radius) continue;
      // (a data log waits until nothing is after you: its text box would cover the fight)
      if (it.kind === 'lore' && (threat ??= this._threatWithin(DAY.interactLoreCalm))) continue;
      const r = it.kind === 'primary' && !it.enabled() ? DAY.interactLockedRank : DAY.interactRank[it.kind] ?? 1;
      if (r < br || (r === br && d < bd)) { best = it; bd = d; br = r; }
      if (d < nd) { near = it; nd = d; }
    }
    if (near && near !== best && best?.kind !== 'primary' && nd <= DAY.interactPointBlank && bd - nd >= DAY.interactPointBlankLead) best = near;
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
    // Top-left: one compact panel — health, stamina + med kits, carried loot (banked when you return).
    h.hp = bar('x-hpbar', 'var(--good)');
    h.stam = bar('j-stambar', '#feae34');
    h.meds = el('span.x-chip.j-meds', { title: 'Med kits: press Q to heal' }, '');
    h.loot = {};
    const lootRow = el('div.j-lootrow', { title: 'What you carry: stored at base once you get home' }, RESOURCE_KEYS.map((k) => {
      const r = RESOURCES[k];
      const n = el('b', '0');
      const chip = el('span.x-res.j-res', { style: { '--c': r.color }, title: `${r.label}: ${r.desc}` }, resIcon(k), n);
      h.loot[k] = { n, chip, v: -1 };
      return chip;
    }));
    h.tl = el('div.j-tl.x-panel', {},
      el('div.j-row', { title: 'Your health' }, el('span.x-lbl', 'Health'), h.hp.node),
      el('div.j-row.j-stamrow', { title: 'Stamina: swings and rolls use it; it refills when you stop' }, el('span.x-lbl.j-st', 'Stamina'), h.stam.node, h.meds),
      lootRow);
    // The top-left column: this panel (the relic strip joins it at the bottom, JungleRelics), then the coach / tip
    // line, which flows under whatever is above it. The top centre stays free for an area boss's bar, and the
    // top-right column ends with room for the weather tag (src/world/Weather.js appends it to h.tr).
    h.tlcol = el('div.j-tlcol', {}, h.tl);
    // Top-right corner: a small round minimap ringed by the daylight left; under it the clock with a sun
    // (a moon after sunset) and its "Daylight" label (critic L §2.2), then the area name.
    h.mini = el('canvas.j-mini');
    h.tabKey = el('span.key.j-tabkey', keyLabel(this.game.input.keyFor('map')));
    h.ring = el('div.j-ring', { title: 'The ring is the daylight left' }, h.mini, h.tabKey);
    h.sun = el('span.j-sun', { style: { backgroundImage: `url(${import.meta.env.BASE_URL}sprites/ui_daylight.png)` }, 'aria-hidden': 'true' });
    h.timer = el('span.x-time.j-time', '');
    h.dayLbl = el('div.j-daylbl', 'Daylight');
    h.timerSub = el('div.j-district', this.D.name);
    h.tr = el('div.j-tr', {}, h.ring, el('div.j-clock', { title: 'Daylight left: at sunset the jungle starts hunting you' }, h.sun, h.timer), h.dayLbl, h.timerSub);
    // Bottom centre: the quest tracker (Stage 9, src/scenes/JungleQuest.js): QUEST + name + distance, the step to do
    // now, the reward; the ford / home / bonus chips on its last line. It also owns the edge arrows and the markers.
    h.ford = el('span.j-dir.ford', { title: 'Deep water is in the way: cross on the bridge (the plank sign on the minimap)' }, el('span.x-dirarrow', '➤'), el('span', ''));
    this.quest = new JungleQuest(this);
    const questNodes = this.quest.build(h);   // (sets h.extract, h.optList)
    h.strip = this.quest.root;
    h.coach = el('div.j-coach', { style: { display: 'none' } });
    h.tlcol.append(h.coach);
    // Toasts queue under the coach line, one at a time (critic H2 §5.1: the top centre belongs to banners and the
    // boss bar). ui.toast() finds this host first; a stray one made before the HUD existed goes.
    ui.querySelector(':scope > .toasts')?.remove();
    h.toasts = el('div.toasts.j-toasts');
    h.tlcol.append(h.toasts);
    h.promptKey = el('span.key', keyLabel(this.game.input.keyFor('interact')));
    h.promptRing = el('span.x-ring', {}, h.promptKey);
    h.promptText = el('span.x-plabel');
    h.promptTime = el('span.x-ptime');
    h.prompt = el('div.x-prompt', {}, el('div.x-ptext', {}, h.promptRing, h.promptText, h.promptTime));
    // In-world ◆ over the coached crate and the guided route's crates (pixel diamonds at the world's texel scale).
    h.marks = [];
    h.lowhp = el('div.j-lowhp');   // red screen-edge pulse at low health
    // Big map (Tab): pauses the day; zoom + pan.
    h.big = el('canvas.x-bigcanvas');
    // Beacons join the legend once you have met one (no unexplained terms on day 1).
    // Rebuilt each time the map opens (QA 8 P2-3: a bloom met today, a beacon found, joined only the next day).
    const legend = el('div.x-legend');
    h.fillLegend = () => {
    const metPylon = this.data.pylons.some((p) => this.map.isExplored(p.x, p.z));
    const legendKeys = ['player', 'relay', this.state.pylons.size ? 'pylon_on' : null, metPylon ? 'pylon_off' : null, 'objective', 'optional', 'container',
      this.game.run.isGuidedDay() ? null : 'relic', 'ford', this.bosses?.lairs.length ? 'boss' : null,
      'forage_fruit', 'forage_fungus', [...(this.state.forage || [])].some((id) => id[0] === 'b') ? 'forage_bloom' : null].filter(Boolean);   // relics: strongboxes / shrines (not on the guided day); ford: the crossing to use; ☠ area bosses (day 3+); forage you have seen (the bloom once met)
    const key = legendKeys.join('|');
    if (legend._key === key) return;
    legend._key = key;
    legend.replaceChildren(...legendKeys.map((k) =>
      el('span.x-leg', {}, JungleMap.legendIcon(k, 12 * this.game.u), MAP_MARKERS[k].label)));
    };
    h.fillLegend();
    h.bigSteps = el('div.j-bigsteps');
    h.bigmap = el('div.x-bigmap.ui-block', { style: { display: 'none' }, onclick: (e) => { if (e.target === h.bigmap) this.toggleMap(false); } },
      el('div.x-bigbox.x-panel', {},
        el('div.x-bigtitle', {}, el('b', 'The Jungle'), el('span.muted', ` · ${this.D.name}: `), el('span.amber', this.objDef.name),
          el('span.j-paused', 'DAY PAUSED'), el('span.muted.x-bigclose', 'Tab / Esc close')),
        h.big,
        el('div.j-bigfoot', {}, h.bigSteps, el('div.j-bighelp.muted', {}, `Drag / ${['up', 'left', 'down', 'right'].map((a) => keyLabel(this.game.input.keyFor(a))).join('')} / arrows pan · wheel / + − zoom · Space: you`, el('br'), 'Dark blue: deep water · plank strips: bridges (the only way across)')),
        legend));
    this._bindBigMap(h.big);
    h.root = el('div.x-hud', {}, h.lowhp, h.tlcol, h.tr, h.prompt, ...questNodes, h.bigmap);
    h.root.style.setProperty('--hudfade', String(JUICE.hudFade?.opacity ?? 0.5));
    ui.append(h.root);
    // Whole pixels (critic M2 P1-3): the centred quest tracker is pinned, the clock lines are snapped when they change.
    pinWhole(h.strip);
    snapBox(h.bigmap.firstElementChild);
    h.timer._snap = h.dayLbl._snap = true;
    this.hud = h;
    this._hudCache = {};
  }

  /** An in-world ◆ marker (DOM canvas, pixel diamond scaled by whole texels); pooled. */
  _mark(i) {
    const h = this.hud;
    if (!h.marks[i]) {
      const c = el('canvas.j-mark');
      c.width = c.height = 13;
      drawMarker(c.getContext('2d'), 'objective', 6, 6, 6.5);   // a 9-texel diamond, ink outline
      h.root.append(c);
      h.marks[i] = c;
    }
    return h.marks[i];
  }

  /** Place in-world ◆ markers over these containers (hide the rest of the pool). */
  _placeMarks(list) {
    const h = this.hud;
    const v = new THREE.Vector3();
    let n = 0;
    for (const it of list) {
      const top = (it.vis?.userData?.vis?.height || 0.8) + HUD.markLift;
      const pr = this.game.project(v.set(it.x, top, it.z), this.camera);
      if (!pr.visible) continue;
      const m = this._mark(n++);
      m.style.display = '';
      // Whole pixels (critic M2 P1-3): the mark's size, measured once, as integer offsets (not translate(-50%)).
      if (!m._wh?.[0]) m._wh = [m.offsetWidth, m.offsetHeight];
      m.style.transform = `translate(${Math.round(pr.x) - Math.round(m._wh[0] / 2)}px, ${Math.round(pr.y) - m._wh[1]}px)`;
    }
    for (let i = n; i < h.marks.length; i++) h.marks[i].style.display = 'none';
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
    if (prop === 'text') { node.textContent = val; if (node._snap) requestAnimationFrame(() => snapLine(node)); }
    else if (prop === 'html') node.innerHTML = val;
    else if (prop === 'className') node.className = val;
    else if (prop.startsWith('--')) node.style.setProperty(prop, val);
    else node.style[prop] = val;
  }

  /** Current objective target point (or null). */
  _objectiveTarget() {
    if (this.objectiveDone || this.objectiveFailed) return null;
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
    let best = { x: this.relayPos.x, z: this.relayPos.z, d: Math.hypot(this.relayPos.x - p.x, this.relayPos.z - p.z), name: 'Home' };
    for (const py of this.data.pylons) {
      if (!this.state.pylons.has(py.id)) continue;
      const d = Math.hypot(py.x - p.x, py.z - p.z);
      if (d < best.d) best = { x: py.x, z: py.z, d, name: WORDS.Pylon };
    }
    return best;
  }

  _dirArrow(node, tx, tz) {
    const p = this.player.pos;
    const a = Math.atan2(tz - p.z, tx - p.x);
    node.style.transform = `rotate(${Math.round((a * 180) / Math.PI / 15) * 15}deg)`;
  }

  /** HUD boxes in stage px (for arrows that must not sit on them, and the threat fade). */
  _hudRects() {
    const st = this.game.stage.getBoundingClientRect();
    const out = [];
    for (const n of [this.hud.tl, this.hud.tr, this.hud.timerSub, this.hud.strip, this.hud.prompt, this.hud.coach, this.hud.toasts]) {
      if (n.style.display === 'none') continue;
      const r = n.getBoundingClientRect();
      if (r.width > 0) out.push({ n, l: r.left - st.left, t: r.top - st.top, r: r.right - st.left, b: r.bottom - st.top });
    }
    return out;
  }

  /** Fade a HUD box while a live enemy is behind it (so the corners never hide a threat). */
  _fadeHudOverThreats(rects) {
    const hit = new Set();
    const p = this.player.pos;
    const v = new THREE.Vector3();
    const pad = (JUICE.hudFade?.pad ?? 8) * this.game.u * 0.6;
    for (const e of this.enemies) {
      if (e.dead || Math.abs(e.x - p.x) > 16 || Math.abs(e.z - p.z) > 12) continue;
      const pr = this.game.project(v.set(e.x, 0.6, e.z), this.camera);
      for (const r of rects) if (pr.x > r.l - pad && pr.x < r.r + pad && pr.y > r.t - pad && pr.y < r.b + pad) hit.add(r.n);
    }
    // (to --hudfade, JUICE.hudFade.opacity: half see-through, so the clock and minimap stay readable)
    for (const n of [this.hud.tl, this.hud.tr, this.hud.strip, this.hud.coach]) n.classList.toggle('x-fade', hit.has(n));
  }

  /** Player heading for the map arrow: movement direction, else where you aim. */
  _heading() {
    const pl = this.player;
    if (Math.hypot(pl.vel.x, pl.vel.z) > 0.5) this._head = Math.atan2(pl.vel.z, pl.vel.x);
    else if (this._head == null) this._head = Math.atan2(pl.aimPoint.z - pl.pos.z, pl.aimPoint.x - pl.pos.x);
    return this._head;
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
      if ((it.kind === 'optional' || it.kind === 'event') && this.seen.has(it)) out.push({ x: it.x, z: it.z, type: 'optional' });
      else if (it.kind === 'container' && this.map.isExplored(it.x, it.z) && Math.hypot(it.x - this.player.pos.x, it.z - this.player.pos.z) < MAP_VIEW.containerRange) out.push({ x: it.x, z: it.z, type: 'container' });
    }
    for (const n of this.nests) if (!n.dead && this.seen.has(n)) out.push({ x: n.x, z: n.z, type: 'optional' });
    this.forage?.markers(out);   // wild fruit, fungus stumps and dusk blooms you have seen (dim once used today)
    if (this.relicsCtl) out.push(...this.relicsCtl.markers());   // strongboxes, shrines, relics, logs, compass caches
    this.bosses?.markers(out);   // ☠ area bosses' lairs
    if (this._ford) out.push({ x: this._ford.x, z: this._ford.z, type: 'ford' });   // deep water in the way: cross here
    out.push({ x: this.player.pos.x, z: this.player.pos.z, type: 'player', a: this._heading() });
    return out;
  }

  _updateHud(dt = 0) {
    const h = this.hud;
    const pl = this.player;
    const hpf = pl.hp / pl.maxHp;
    h.hp.set(hpf, `${Math.ceil(pl.hp)} / ${pl.maxHp}`);
    // Green → yellow → red (never the stamina bar's orange), and a red screen-edge pulse when low (HUD.health).
    const HH = HUD.health;
    this._set('hpc', h.hp.node.firstChild, 'background', hpf > HH.ok ? HH.colors[0] : hpf > HH.low ? HH.colors[1] : HH.colors[2]);
    this._set('lowhp', h.lowhp, 'className', `j-lowhp${hpf < HH.pulse && !this.ending && !pl.dead ? ' on' : ''}`);
    // The world's texel size in CSS px (×2 at 720p, ×3 at 1080p): pixel icons in the HUD are drawn on that grid.
    this._set('tx', h.root, '--tx', `${this.game._layout().k / (window.devicePixelRatio || 1)}px`);
    h.stam.set(pl.stamina / STAMINA.max, '');
    this._set('stc', h.stam.node.firstChild, 'background', pl.exhausted ? '#8b9bb4' : '#feae34');
    this._set('meds', h.meds, 'html', `${resIconHtml('pick_med')}<b>${pl.meds}</b><span class="muted">/${pl.maxMeds ?? CONFIG.player.maxMeds}</span>`);
    this._set('medsd', h.meds, 'display', pl.meds > 0 ? '' : 'none');   // shows once you carry one
    for (const k of RESOURCE_KEYS) {
      const L = h.loot[k];
      // Currencies appear as you find them (Scrap always shows).
      if (L.v !== this.carried[k]) { L.v = this.carried[k]; L.n.textContent = String(L.v); L.chip.classList.toggle('zero', L.v === 0); L.chip.style.display = L.v > 0 || k === 'scrap' ? '' : 'none'; }
    }
    // Out of stamina: the bar flashes and says so.
    this._set('stx', h.stam.node, 'className', `bar j-stambar${pl.exhausted ? ' tired' : ''}`);
    if (pl.exhausted !== this._wasTired) {
      this._wasTired = pl.exhausted;
      h.stam.set(pl.stamina / STAMINA.max, pl.exhausted ? 'tired' : '');
      if (pl.exhausted && !this.warned.tired) { this.warned.tired = true; this._coachTip('Out of stamina: back off a moment and it refills', 'warn'); }
    }
    // Clock under the minimap; the ring around the minimap drains with the daylight.
    const dayLeft = Math.max(0, DAY.length - this.dayT);
    this._set('timer', h.timer, 'text', dayLeft > 0 ? fmtTime(dayLeft) : this.duskK < 1 ? 'DUSK' : 'NIGHT');
    this._set('timerc', h.timer, 'className', `x-time j-time${dayLeft <= 0 ? ' bad' : dayLeft < 60 ? ' amber' : ''}`);
    this._set('sun', h.ring, '--day', String(Math.round((dayLeft / DAY.length) * 200) / 200));
    this._set('ringc', h.ring, 'className', `j-ring${dayLeft <= 0 ? ' bad' : dayLeft < 60 ? ' amber' : ''}`);
    // The sun icon turns into a moon after sunset; the label says what the clock is (critic L §2.2).
    this._set('sunf', h.sun, 'className', `j-sun${dayLeft <= 0 ? ' moon' : ''}`);
    this._set('daylbl', h.dayLbl, 'text', dayLeft <= 0 ? 'After dark: head home' : dayLeft < TIPS.sunset.lead ? 'Daylight: sunset soon' : 'Daylight');
    this._set('daylblc', h.dayLbl, 'className', `j-daylbl${dayLeft <= 0 ? ' bad' : dayLeft < TIPS.sunset.lead ? ' amber' : ''}`);
    // Keycaps follow the bindings (Settings → Controls can change them from the pause menu).
    this._set('tabk', h.tabKey, 'text', keyLabel(this.game.input.keyFor('map')));
    this._set('promptk', h.promptKey, 'text', keyLabel(this.game.input.keyFor('interact')));
    // The quest tracker, edge arrows and markers are drawn by JungleQuest.update (below).
    const ot = this._objectiveTarget();
    // River wayfinding (critic L §3): deep water on the straight line to the goal → the crossing to use.
    this._updateFord(ot);
    const fd = this._ford;
    this._set('fordd', h.ford, 'display', fd ? '' : 'none');
    if (fd) {
      this._dirArrow(h.ford.firstChild, fd.x, fd.z);
      this._set('fordt', h.ford.lastChild, 'text', `cross at the bridge ${Math.round(Math.hypot(fd.x - pl.pos.x, fd.z - pl.pos.z))} m`);
    }
    const ex = this._nearestExit();
    // "Home N m" only when going home is the next thing to do (goal done, sunset close, low health).
    const homeNow = this.objectiveDone || this.dayT > DAY.length - HOME_HINT.lastSeconds || pl.hp / pl.maxHp < HOME_HINT.lowHp;
    this._updateCoach();
    // Prompt.
    const t = this.promptTarget;
    h.prompt.style.display = t && !this.ending ? '' : 'none';
    if (t && !this.ending) {
      const mult = t.objectiveHold && this.game.run.hasSkill('quick_extraction') ? X().quickExtraction : 1;
      const hold = t.hold * mult;
      const verb = typeof t.verb === 'function' ? t.verb() : t.verb;
      const en = t.enabled();
      this._set('pt', h.promptText, 'text', en ? (hold > 0 ? `Hold: ${verb}` : verb) : `${verb} (not yet)`);
      h.promptRing.style.display = t.noKey ? 'none' : '';   // (a line with no E: the shelf-fungus hint, Forage.js)
      this._set('ptt', h.promptTime, 'text', hold > 0 ? `${Math.max(0, hold - t.progress).toFixed(1)}s` : '');
      const f = hold > 0 ? t.progress / hold : 0;
      h.promptRing.style.background = `conic-gradient(var(--amber) ${Math.round(f * 360)}deg, rgba(58,68,102,0.6) 0deg)`;
    }
    // The guided day's crates: an in-world ◆ over the coached one (and over the trail-side ones on the route, when
    // near); while "open the crate" is the step, its arrow replaces the goal's at the screen edge (one arrow at a time).
    const cc = this._coachCrate();
    this._placeMarks(this.mapOpen ? [] : this._coachMarks(cc));
    // The quest (JungleQuest): the tracker, the off-screen arrows (clear of the HUD boxes and of each other), the
    // markers over on-screen targets, the pointer by the player, the light beams over the quest site.
    const rects = this._hudRects();
    this.quest.update(dt, { ot, ex, homeNow, cc, rects });
    // Minimap and threat fade (a few times a second).
    this._mapT = (this._mapT || 0) - 1;
    if (this._mapT <= 0) {
      this._mapT = MAP_VIEW.miniEvery;
      const dpr = window.devicePixelRatio || 1;
      const px = Math.max(32, Math.round(h.mini.clientWidth * dpr));
      if (h.mini.width !== px) h.mini.width = h.mini.height = px;
      this.map.drawMini(h.mini, pl.pos.x, pl.pos.z, this._markers(), this.time);
      this._fadeHudOverThreats(rects.filter((r) => r.n !== h.prompt));
    }
  }

  // ================================================================== guided first day (coach)

  /** "Head home" is offered once there is something to bring home or a reason to leave (RETURN_PROMPT). */
  _homeOffered() {
    if (this.objectiveDone || this.dayT > RETURN_PROMPT.after || this.duskK > 0) return true;
    if (RESOURCE_KEYS.some((k) => this.carried[k] > 0) || this.relicsCtl?.carried.length) return true;   // (loot or a relic)
    return this.player.hp / this.player.maxHp < RETURN_PROMPT.lowHp;
  }

  /**
   * The guided first day (GUIDE): one instruction at a time in a line at the top-left — move → cut through
   * plants → open the crate on the way (◆ over it, an arrow at the screen edge) → the map → the goal → loot the
   * goal site → head home. One-off tips (TIPS: each verb when it first matters; an enemy; out of stamina) briefly
   * take the line over.
   */
  _setupCoach() {
    const run = this.game.run;
    if (!run.isGuidedDay() || !this.game.meta.settings.hints) return;
    // The coach replaces the regular jungle hints on this run (they'd say the same things).
    for (const id of ['jungle_move', 'jungle_cut', 'jungle_return', 'jungle_loot']) this.game.meta.hints[id] = true;
    this.game.saveMeta();
    const C = GUIDE.coach;
    const p0 = { x: this.player.pos.x, z: this.player.pos.z };
    const dirTo = (it) => {
      const p = this.player.pos;
      const d = Math.round(Math.hypot(it.x - p.x, it.z - p.z));
      const a = Math.round((Math.atan2(it.z - p.z, it.x - p.x) * 180) / Math.PI / 15) * 15;
      return `${d} m <span class="x-dirarrow" style="transform:rotate(${a}deg)">➤</span>`;
    };
    const opened = () => this._openedCount || 0;
    this.coach = {
      i: -1, t: 0, crate: null, loot: [], seenFoe: false, seenCrate: false,
      steps: [
        { id: 'move', text: () => `Move with ${this._moveKeys()}`,
          done: () => Math.hypot(this.player.pos.x - p0.x, this.player.pos.z - p0.z) >= C.moveDist },
        { id: 'cut', text: () => `Plants slow you down or block the way: <b>click</b> to swing your machete and cut a path`,
          done: (t) => (this._cutCount || 0) >= 2 || t > C.cutWait },
        { id: 'crate', text: () => (this.coach.crate ? `Open the supply crate (◆) ${dirTo(this.coach.crate)}: walk up to it and hold ${this._key('interact')}` : ''),
          start: () => { this.coach.crate = this._guidedCrate(); this.coach.opened0 = opened(); return !!this.coach.crate; },
          done: (t) => opened() > this.coach.opened0 || this.coach.crate?.done || t > C.crateWait },
        { id: 'map', text: () => `Lost? ${this._key('map')} opens the map. The day waits while it is open`,
          done: (t) => this._mapOpened || t > C.mapWait },
        { id: 'goal', text: () => `Your quest: <b>${this.objDef.name}</b>. Follow the big <span class="amber">amber arrow</span> to the <span class="amber">◆</span>`,
          done: () => this.objectiveDone },
        { id: 'loot', text: () => { const n = this.coach.loot.filter((it) => !it.done).length; return `Quest done! Open the ${n === 1 ? 'crate' : `${n} crates`} here (◆): the Scrap you bring home builds towers`; },
          start: () => { this.coach.loot = this._siteCrates(); return this.coach.loot.length > 0; },
          done: (t) => !this.coach.loot.some((it) => !it.done) || t > C.crateWait },
        { id: 'home', text: () => `Head home: follow the <span class="accent">cyan arrow</span> to the Relay and hold ${this._key('interact')}`,
          done: () => false },
      ],
    };
    this._coachNext();
  }

  /**
   * The crate the coach points at: the nearest unopened trail-side crate of the guided route (JungleGen
   * guidedRoute), else the nearest easy-to-reach one on the way to the goal.
   */
  _guidedCrate() {
    const p = this.player.pos;
    let best = null, bd = Infinity;
    for (const it of this.interactables) {
      if (it.kind !== 'container' || it.done || !it.cont?.guided) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < bd && d < GUIDE.coach.crateRange * 1.5) { bd = d; best = it; }
    }
    return best || this._nearCrate(GUIDE.coach.crateRange, true);
  }

  /** Unopened containers at the goal's site (the guided day's "loot here" step). */
  _siteCrates() {
    const site = this.objTargets.find((t) => t.site)?.site;
    if (!site) return [];
    return this.interactables.filter((it) => it.kind === 'container' && !it.done && !it.cont?.hidden && Math.hypot(it.x - site.x, it.z - site.z) < (site.r || 6) + 3);
  }

  /** The container the coach points at right now (the crate step, the nearest left at the goal site), or null. */
  _coachCrate() {
    const c = this.coach;
    const st = c && !this.ending ? c.steps[c.i] : null;
    if (!st) return null;
    if (st.id === 'crate') return c.crate && !c.crate.done ? c.crate : null;
    if (st.id === 'loot') {
      const p = this.player.pos;
      let best = null, bd = Infinity;
      for (const it of c.loot) { const d = Math.hypot(it.x - p.x, it.z - p.z); if (!it.done && d < bd) { bd = d; best = it; } }
      return best;
    }
    return null;
  }

  /** In-world ◆ markers this frame: the coached crate, the goal site's crates (loot step), the route's crates nearby. */
  _coachMarks(cc) {
    const out = cc ? [cc] : [];
    const c = this.coach;
    if (!this.game.run.isGuidedDay() || this.ending || this.mapOpen) return out;
    if (c?.steps[c.i]?.id === 'loot') for (const it of c.loot) if (!it.done && it !== cc) out.push(it);
    const p = this.player.pos;
    for (const it of this.interactables) {
      if (it.kind === 'container' && !it.done && it.cont?.guided && !out.includes(it) && Math.hypot(it.x - p.x, it.z - p.z) < GUIDE.coach.markRange) out.push(it);
    }
    return out;
  }

  /**
   * Nearest unopened container within `range` that is easy to reach (GUIDE.coach: a walking path over open ground
   * at most cratePath × the straight line, within crateTrail tiles of a trail). `onTheWay`: only ones roughly toward
   * the objective (GUIDE.coach.crateCone).
   */
  _nearCrate(range, onTheWay = false) {
    const C = GUIDE.coach;
    const p = this.player.pos;
    const ot = onTheWay ? this._objectiveTarget() : null;
    const oa = ot ? Math.atan2(ot.z - p.z, ot.x - p.x) : 0;
    const ptx = Math.floor(p.x), ptz = Math.floor(p.z);
    const f = this._bfs(ptx, ptz, false);   // open-ground steps from the player (brush blocks), radius 24
    const W = this.data.size, trail = this.data.trail;
    const steps = (tx, tz) => {
      let m = -1;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, z = tz + dz;
        if (Math.abs(x - f.sx) > f.R || Math.abs(z - f.sz) > f.R) continue;
        const d = f.dist[(z - f.sz + f.R) * f.S + (x - f.sx + f.R)];
        if (d >= 0 && (m < 0 || d < m)) m = d;
      }
      return m < 0 ? Infinity : m + 1;
    };
    const nearTrail = (tx, tz) => {
      const r = C.crateTrail;
      for (let z = tz - r; z <= tz + r; z++) for (let x = tx - r; x <= tx + r; x++) if (x >= 0 && z >= 0 && x < W && z < W && trail[z * W + x]) return true;
      return false;
    };
    let best = null, bd = range;
    for (const it of this.interactables) {
      if (it.kind !== 'container' || it.done || it.cont?.hidden) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d >= bd) continue;
      if (ot) {
        let da = Math.atan2(it.z - p.z, it.x - p.x) - oa;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > (C.crateCone * Math.PI) / 180) continue;
      }
      const tx = Math.floor(it.x), tz = Math.floor(it.z);
      const cheb = Math.max(1, Math.abs(tx - ptx), Math.abs(tz - ptz));
      if (steps(tx, tz) > cheb * C.cratePath + 1 || !nearTrail(tx, tz)) continue;
      bd = d; best = it;
    }
    return best;
  }

  /**
   * River wayfinding (critic Q fix 2: the straight-line test sent players to a bridge on the wrong bank): a whole-map
   * walk field from the quest target (deep water and solid props block; brush doesn't, you can cut it), with bridge
   * decks and without. The "cross at the bridge" hint (this._ford) shows only when the shortest walk you → target goes
   * over a deck and walking round on land is impossible or much longer (QUEST.ford.landSlack); it points at the first
   * deck on that walk.
   */
  _updateFord(ot) {
    const F = QUEST.ford;
    this._fordT = (this._fordT || 0) - 1;
    if (this._fordT > 0) return;
    this._fordT = F.every;   // frames
    this._ford = null;
    const deck = this.data.ford;
    if (!ot || this.objectiveDone || !deck || !this.data.bridges?.length) return;
    const W = this.data.size, gx = Math.floor(ot.x), gz = Math.floor(ot.z);
    // The two fields, rebuilt when the target moves (an escort's way home, a roaming Alpha) at most every F.refield s.
    let fd = this._fordField;
    if (!fd || ((Math.abs(fd.gx - gx) > F.move || Math.abs(fd.gz - gz) > F.move) && this.time - fd.at > F.refield)) {
      fd = this._fordField = { gx, gz, at: this.time, all: this._walkField(gx, gz, false), land: this._walkField(gx, gz, true) };
    }
    const at = (f, x, z) => (x < 0 || z < 0 || x >= W || z >= W ? -1 : f[z * W + x]);
    // Start from the player's tile (or a walkable neighbour: standing against a prop).
    let px = Math.floor(this.player.pos.x), pz = Math.floor(this.player.pos.z);
    if (at(fd.all, px, pz) < 0) {
      let best = null;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const d = at(fd.all, px + dx, pz + dz); if (d >= 0 && (!best || d < best[2])) best = [px + dx, pz + dz, d]; }
      if (!best) return;   // (no walk to it at all: nothing to point at)
      [px, pz] = best;
    }
    const dAll = at(fd.all, px, pz), dLand = at(fd.land, px, pz);
    if (dLand >= 0 && dLand <= dAll * F.landSlack) return;   // a land route about as short: no bridge needed
    // Walk the field downhill to the target; the first deck tile on the way is the bridge to use.
    for (let n = 0; n < 4 * W; n++) {
      const i = pz * W + px;
      if (deck[i]) {
        const br = this.data.bridges.find((q) => px >= Math.floor(q.x0) && px <= Math.ceil(q.x1) && pz >= Math.floor(q.z0) && pz <= Math.ceil(q.z1));
        this._ford = br ? { x: (br.x0 + br.x1) / 2, z: (br.z0 + br.z1) / 2 } : { x: px + 0.5, z: pz + 0.5 };
        return;
      }
      const here = fd.all[i];
      if (here <= 0) return;
      let nx = -1, nz = -1, nd = here;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const d = at(fd.all, px + dx, pz + dz); if (d >= 0 && d < nd) { nd = d; nx = px + dx; nz = pz + dz; } }
      if (nx < 0) return;
      px = nx; pz = nz;
    }
  }

  /**
   * Steps to tile (gx, gz) from every tile (8-way, no corner cutting; −1 = no walk), over the whole map: deep water and
   * solid props block, brush doesn't (it can be cut). `noDecks`: bridge decks block too (is there a land route?).
   */
  _walkField(gx, gz, noDecks) {
    const W = this.data.size, w = this.world, deck = this.data.ford;
    const dist = new Int32Array(W * W).fill(-1), q = new Int32Array(W * W);
    const open = (x, z) => x >= 0 && z >= 0 && x < W && z < W && !w.deep[z * W + x] && !w.objGrid[z * W + x] && !(noDecks && deck[z * W + x]);
    let h = 0, t = 0;
    // Seed the target's tile (its own prop may sit on it) and its open neighbours.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx, z = gz + dz;
      if (x < 0 || z < 0 || x >= W || z >= W || (dx || dz) && !open(x, z)) continue;
      if (dist[z * W + x] < 0) { dist[z * W + x] = dx || dz ? 1 : 0; q[t++] = z * W + x; }
    }
    while (h < t) {
      const i = q[h++], x = i % W, z = (i - x) / W, d = dist[i] + 1;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (!open(nx, nz) || dist[nz * W + nx] >= 0) continue;
        if (dx && dz && (!open(x + dx, z) || !open(x, z + dz))) continue;
        dist[nz * W + nx] = d;
        q[t++] = nz * W + nx;
      }
    }
    return dist;
  }

  _coachNext() {
    const c = this.coach;
    for (;;) {
      c.i += 1;
      c.t = 0;
      const st = c.steps[c.i];
      if (!st) return;
      if (!st.start || st.start()) break;   // a step whose start() says "not now" is skipped
    }
    this.game.sfx.play('coach');
    this._coachKey = null;
  }

  /** A passing tip in the coach / tip line ('warn' = red, danger): feedback, not tied to the profile. */
  _coachTip(html, cls = '') {
    this._tipN = (this._tipN || 0) + 1;
    this._tip(`x${this._tipN}`, { html, cls, once: false, time: GUIDE.coach.tipTime });
  }

  // ---------------------------------------------------------------- tips: each verb when it first matters

  /**
   * Queue a one-off tip (TIPS; text from TIPS.text[id] unless opts.html). It shows once per profile
   * (meta.hints['tip_' + id], only with tutorial hints on) unless opts.once === false. opts.urgent: shows at once
   * (a calm tip on screen waits its turn again), and goes stale after 1.5 s in the queue. Returns true if it is
   * showing or queued (so the caller can skip its plain toast), false if it was seen before.
   */
  _tip(id, opts = {}) {
    const T = this._tips, meta = this.game.meta;
    if (!T) return false;
    const once = opts.once !== false;
    if (once && (!meta.settings.hints || meta.hints[`tip_${id}`])) return false;
    if (T.cur?.id === id || T.q.some((t) => t.id === id)) return true;
    const t = { id, once, html: opts.html || this._tipText(TIPS.text[id] || ''), cls: opts.cls || '', urgent: !!opts.urgent, time: opts.time ?? TIPS[id]?.time ?? TIPS.time, at: this.time };
    if (t.urgent) T.q.unshift(t); else T.q.push(t);
    return true;
  }

  /** TIPS text → HTML: {action} = that action's bound key, {heal} = a med kit's heal. */
  _tipText(s) {
    return s.replace(/\{(\w+)\}/g, (m, k) => (k === 'heal' ? String(CONFIG.player.medHeal) : this._key(k)));
  }

  /** The triggers (a few times a second): roll, deflect, heavy chop, machete throw, med kit (TIPS). */
  _checkTips(dt) {
    const T = this._tips, meta = this.game.meta;
    if (!meta.settings.hints) return;
    T.scanT -= dt;
    if (T.scanT > 0) return;
    T.scanT = 0.15;
    const seen = meta.hints, p = this.player, pp = p.pos, run = this.game.run, TT = TIPS;
    if (p.dead) return;
    const near = (e, r) => Math.hypot(e.x - pp.x, e.z - pp.z) < r;
    if (!seen.tip_roll) {
      // Roll: the first wind-up close to you.
      if (this.enemies.some((e) => !e.dead && !e.hidden && e.state === 'windup' && near(e, TT.roll.range))) this._tip('roll', { urgent: true, cls: 'warn' });
    } else if (!seen.tip_deflect) {
      // Deflect: a lunge at you, from day 2 (on the guided day, a while after the roll tip).
      const rollAt = T.shownAt?.roll;
      const ok = run.night >= TT.deflect.fromNight || (run.isGuidedDay() && rollAt != null && this.time - rollAt > TT.deflect.afterRoll);
      if (ok && this.enemies.some((e) => !e.dead && e.state === 'windup' && (e.mv === 'lunge' || e.mv === 'thrust2') && near(e, (e.def?.reach || 1.5) + (e.def?.lunge || 2) + 0.5))) {
        this._tip('deflect', { urgent: true, cls: 'warn' });
      }
    }
    // Heavy chop: the first bramble you walk into.
    if (!seen.tip_bramble && p.moving && p.state === 'free') {
      const a = TT.bramble.ahead;
      if (this.world.brushAt(Math.floor(pp.x + p.moveDir.x * a), Math.floor(pp.z + p.moveDir.z * a)) === BRUSH.bramble) this._tip('bramble');
    }
    // Machete throw: the first Spitter (or another shooter) close by that you can't walk up to.
    if (!seen.tip_throw && p.weapon?.throw && !p.blade) {
      const f = this.flow.blocked;
      const reachable = (e) => {
        if (!f) return true;
        const tx = Math.floor(e.x), tz = Math.floor(e.z);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx, z = tz + dz;
          if (Math.abs(x - f.sx) <= f.R && Math.abs(z - f.sz) <= f.R && f.dist[(z - f.sz + f.R) * f.S + (x - f.sx + f.R)] >= 0) return true;
        }
        return false;
      };
      if (this.enemies.some((e) => !e.dead && !e.hidden && e.alerted && e.def?.attack === 'ranged' && near(e, TT.throw.range) && !reachable(e))) this._tip('throw');
    }
    // Med kit: hurt, with a kit in the bag.
    if (!seen.tip_med && p.meds > 0 && p.hp / p.maxHp < TT.med.below) this._tip('med');
  }

  /** One tip at a time: urgent ones first (a calm tip on screen goes back in the queue), a short gap between. */
  _updateTips() {
    const T = this._tips;
    const dt = Math.max(0, this.time - (T.last ?? this.time));
    T.last = this.time;
    if (!this.ending) this._checkTips(dt);
    if (T.cur) {
      T.cur.left -= dt;
      if (T.cur.left <= 0 || this.ending) { T.cur = null; T.gapT = TIPS.gap; }
    }
    T.gapT -= dt;
    T.q = T.q.filter((t) => this.time - t.at < (t.urgent ? 1.5 : TIPS.wait));
    if (T.q[0]?.urgent && T.cur && !T.cur.urgent) {
      if (T.cur.left > 1.5) { T.cur.at = this.time; T.q.splice(1, 0, T.cur); }
      T.cur = null;
    }
    // (A calm tip also waits while a one-time hint is up: one coach hint on screen at a time.)
    if (!T.cur && T.q.length && !this.ending && (T.gapT <= 0 || T.q[0].urgent) && (T.q[0].urgent || !this.game.ui.querySelector('.hint'))) {
      const t = T.q.shift();
      t.left = t.left ?? t.time;
      T.cur = t;
      if (t.once && !this.game.meta.hints[`tip_${t.id}`]) { this.game.meta.hints[`tip_${t.id}`] = true; this.game.saveMeta(); }
      T.shownAt = { ...(T.shownAt || {}), [t.id]: this.time };
      if (!t.urgent) this.game.sfx.play('coach');
    }
  }

  /** The top-left line: the current tip, else the guided day's step (with its number), else nothing. */
  _updateCoach() {
    const n = this.hud.coach;
    this._updateTips();
    const c = this.coach;
    if (c && !this.ending) {
      const dt = Math.max(0, this.time - (c.last ?? this.time));
      c.last = this.time;
      c.t += dt;
      const st = c.steps[c.i];
      if (st && st.done(c.t)) this._coachNext();
      // Passing tips: the first creature that comes for you, a crate you walk past later.
      if (!c.seenFoe && this.enemies.some((e) => !e.dead && e.alerted && Math.hypot(e.x - this.player.pos.x, e.z - this.player.pos.z) < 9)) {
        c.seenFoe = true;
        this._coachTip('Enemy! <b>Click</b> to slash it. Watch for the red <b>!</b>: it is about to strike', 'warn');
      }
      if (!c.seenCrate && c.i > 2 && !this._openedCount && this._nearCrate(5)) {
        c.seenCrate = true;
        this._coachTip(`A supply crate: walk up to it and hold ${this._key('interact')} to open it`);
      }
    }
    const tip = this._tips.cur;
    const cur = c && !this.ending ? c.steps[c.i] : null;
    const html = this.ending ? '' : tip ? tip.html : cur ? cur.text() : '';
    const key = `${c?.i}|${tip ? tip.id : ''}|${html}`;
    if (key === this._coachKey) return;
    this._coachKey = key;
    n.style.display = html ? '' : 'none';
    n.className = `j-coach${tip ? ` tip ${tip.cls}` : ''}`;
    n.innerHTML = tip || !cur ? `<span class="j-coach-t">${html}</span>` : `<span class="j-coach-n">${c.i + 1}/${c.steps.length}</span><span class="j-coach-t">${html}</span>`;
  }

  // ================================================================== debug

  _makeDebug() {
    return {
      teleport: (x, z) => { this.player.pos.set(x, 0, z); this._placeCamera(0, true); },
      completeObjective: () => this.completeObjective(),
      giveLoot: () => { for (const k of RESOURCE_KEYS) this.carried[k] += 20; },
      // Kills every live creature (including ones still emerging) and clears the wildlife not yet streamed in
      // around the player (chunks within POP.spawnRadius), so nothing pops in right after. Returns the counts.
      killAll: () => {
        let killed = 0, cleared = 0;
        for (const e of [...this.enemies]) {
          if (e.dead || e.lordOf) continue;   // (not an area boss: that would count as a kill)
          try {
            if (e.state === 'spawn') e.state = 'chase';
            e.hit(99999, 1, 0);
            if (!e.dead) e.die();
          } catch (err) { console.warn('killAll', err); e.dead = true; }
          killed++;
        }
        const C = JUNGLE.chunk, n = this.data.size / C, R = POP.spawnRadius;
        const pcx = Math.floor(this.player.pos.x / C), pcz = Math.floor(this.player.pos.z / C);
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
          const cx = pcx + dx, cz = pcz + dz;
          if (cx < 0 || cz < 0 || cx >= n || cz >= n) continue;
          for (const s of this._chunkPop(cx, cz)) if (!this.killed.has(s.id) && !this.spawned.has(s.id)) { this.killed.add(s.id); cleared++; }
        }
        return { killed, cleared };
      },
      timeLeft: (s) => { this.dayT = DAY.length - s; },
      extract: () => this._extract(),
      die: () => this.player.hurt(9999),
      reveal: () => { this.map.reveal(this.data.size / 2, this.data.size / 2, this.data.size); },
      god: (on = true) => { this.player.god = on; },
      // Stage 6 solid jungle: outline every collider footprint / deep water / ford; the generator's reachability report.
      colliders: (on = true) => this.world.showColliders(on),
      reach: () => this.data.reach,
      // Stage 7 days: the goal module, the area bosses (`boss(area?)` stands you 6 tiles from a lair), today's event.
      goals: () => this.goals,
      bosses: () => (this.bosses?.lairs || []).map((L) => ({ area: L.area, x: L.boss?.x ?? L.x, z: L.boss?.z ?? L.z, hp: L.boss?.hp, maxHp: L.boss?.maxHp, phase: L.boss?.phase, engaged: !!L.boss?.engaged, dead: L.dead })),
      boss: (area) => {
        const L = (this.bosses?.lairs || []).find((q) => !area || q.area === area);
        if (!L) return null;
        const x = L.boss?.x ?? L.x, z = (L.boss?.z ?? L.z) + 6;
        this.player.pos.set(x, 0, z); this._placeCamera(0, true);
        return { area: L.area, x, z };
      },
      event: () => (this.events || []).map((it) => ({ key: it.key, x: it.x, z: it.z, done: it.done })),
      weather: () => this.weather?.key || null,
      // Foraging (critic N): today's fruit / fungus hosts / glints; gotoForage stands you 1.5 tiles south of one (fruit: 1)
      // (a glint: the nearest open tile to that).
      forage: () => this.forage?.info(),
      gotoForage: (kind = 'fruit', n = 0) => {
        const f = this.forage?.info();
        const t = f?.[kind === 'glint' ? 'glints' : kind]?.[n];
        if (!t) return null;
        const x = t.tx != null ? t.tx + 0.5 : t.x, z = t.tz != null ? t.tz + 0.5 : t.z;
        let p = { x, z: z + (kind === 'fruit' || kind === 'bloom' ? 1 : 1.5) };   // (inside the fruit's / bloom's E radius)
        if (kind === 'glint') {
          const W = this.world;
          let best = null;
          for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
            const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz;
            if ((!dx && !dz) || W.blockedAt(tx, tz, false)) continue;
            const d = Math.hypot(dx, dz) + (dz > 0 ? 0 : 0.5);   // (south of it first: the camera sees it)
            if (!best || d < best.d) best = { d, x: tx + 0.5, z: tz + 0.5 };
          }
          if (best) p = best;
        }
        this.player.pos.set(p.x, 0, p.z); this._placeCamera(0, true);
        return { kind, x, z, at: { x: p.x, z: p.z } };
      },
      info: () => ({ pos: { ...this.player.pos }, enemies: this.enemies.length, chunks: this.world.chunks.size, day: this.dayT, objective: this.objKey, target: this._objectiveTarget() }),
    };
  }

  exit() {
    this.game.input.useBindings(null);   // other scenes read physical keys
    document.removeEventListener('visibilitychange', this._onVis);
    window.removeEventListener('blur', this._onBlur);
    for (const e of this.enemies) e.dispose();
    for (const p of this.pickups) { this.game.assets.disposeVisual(p.vis); p.glow.removeFromParent(); }
    for (const it of this.interactables) { if (it.vis) this.game.assets.disposeVisual(it.vis); it.glow?.geometry.dispose(); it.glow?.material.dispose(); it.glow?.userData.beam?.material.dispose(); }
    for (const n of this.nests) { if (n.vis) this.game.assets.disposeVisual(n.vis); n.barBg.material.dispose(); n.barFill.material.dispose(); }
    for (const v of this.props) this.game.assets.disposeVisual(v);
    for (const s of this.slashes || []) s.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    for (const m of this._slashMats || []) m.dispose();
    for (const m of Object.values(this._glowMats || {})) m.dispose();
    this._glowGeom?.dispose();
    this.player.dispose();
    this.relicsCtl?.dispose();
    this.goals?.dispose();
    this.quest?.dispose();
    this.bosses?.dispose();
    this.weather?.dispose();
    this.spores?.dispose();
    this.forage?.dispose();
    this.shots.dispose();
    this.fx.dispose();
    this.ambience.dispose();
    this.wading.dispose();
    this.world.dispose();
    this.post.dispose();
    this.game.stage.style.cursor = '';
  }
}

/** Container loot (seeded per container), with district multipliers and skills. */
function rollLoot(rng, key, district, run, yieldMult = 1) {
  const Xc = CONFIG.expedition;
  const def = Xc.containers[key];
  const m = district.loot;
  const lush = run.hasSkill('lush_finds');
  // yieldMult: the container's distance from the nearest return point (JungleGen, JUNGLE.lootDistance).
  const scrapMult = m.scrap * yieldMult * (run.hasSkill('pack_rat_2') ? Xc.packRatScrap : 1);
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
