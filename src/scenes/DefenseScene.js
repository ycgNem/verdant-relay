// Night defense: the Relay map with two lanes and 16 build pads.
//
// Phases:
//   prep  build / upgrade / sell / set targeting / repair, read the wave preview, then Start Wave.
//   wave  a push is running: enemies spawn from its schedule; no building, upgrades or repairs.
//         Pause, 1×/2×/3×, targeting, Relay Protocols (Q/W/E, DefenseProtocols.js).
//   lull  between two pushes (DEFENSE.lull s, real time): build / upgrade / sell / repair like prep;
//         "Call next push" (N) ends it early for Scrap. Once a push has finished spawning, the next one
//         can also be called while its last enemies still walk in (no lull, full bonus).
//   won   "Night N survived" banner with the salvage pick, then next night's briefing (or results).
//   lost  the Relay fell: banner, then results.
// Rules entry points: startWave → _startPush(k) → _step (spawns, protocols, push end → lull / _endNight),
// damage → _kill (bounties, Seed Carrier blast tag, boss), enemyReachedCore / spitAtCore / bossSlam → coreHit.
//
// Run state (resources, towers, relay HP) lives in game.run (src/core/Run.js) — this scene only
// keeps views of it (Tower / DefenseEnemy objects) and the transient wave state.
//
// Saving: every prep action re-saves the 'prep' snapshot; Start Wave saves a 'wave' snapshot (build
// locked, Relay HP as the wave began, run.wavePush 0). A lull saves a 'wave' snapshot with run.wavePush =
// the next push (and again after every lull action). Continue from 'wave' re-enters here: push 0 restarts
// the night at once; a later push re-enters its lull. Surviving saves the next 'briefing' immediately
// (before the banner); a defeat clears the save.

import * as THREE from 'three';
import { buildDefenseGround, makePlinth } from '../world/DefenseGround.js';
import '../ui/defense.css';
import { el, button, resChip, resRow, costLine, bar, toast, modal, resIconHtml, setToastsPaused, pinWhole, snapCentred } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { JUICE } from '../data/config.js';
import { vineTextures, shade } from '../core/Fx.js';
import { Fx } from '../core/Fx.js';
import { PixelCamera } from '../core/PixelView.js';
import { updateVisual, flashVisual, setAnim, animDone } from '../core/Assets.js';
import { CONFIG, RESOURCE_KEYS } from '../data/config.js';
import { TOWERS, TARGET_RULES, TARGET_RULE_TEXT, TARGET_RULE_LABEL, BRANCH_KEYS, branchOf } from '../data/towers.js';
import { DEFENSE_ENEMIES } from '../data/enemies.js';
import { WAVE_VARIANTS, DEFENSE, SALVAGE, RELAY_ZAP, relayZapDamage, healthMult, waveFor, variantFor } from '../data/waves.js';
import { PROTOCOLS } from '../data/protocols.js';
import { ProtocolDeck } from './DefenseProtocols.js';
import { forecastNight } from './DefenseForecast.js';
import { DEFENSE_MAP, DEFENSE_VIEW, mapFor, forwardSlots, laneForAngle } from '../data/defenseMap.js';
import { NightCamera } from '../world/NightCamera.js';
import { laneTint } from '../world/DefenseGround.js';
import { worldForRun, compass } from '../world/JungleGen.js';
import { DISTRICT_KEYS } from '../data/districts.js';
import { radialGlowTexture, lightPool } from '../core/PixelGlow.js';
import { PostFx } from '../core/PostFx.js';
import { GROUND } from '../world/DefenseGround.js';
import { DISTRICTS } from '../data/districts.js';
import { SKILLS } from '../data/skills.js';
import { Lane, DefenseEnemy } from '../entities/DefenseEnemy.js';
import { Tower } from '../entities/Tower.js';
import { Projectiles } from '../entities/Projectiles.js';
import { openSettingsOverlay } from './SettingsScene.js';
import { READINESS } from '../data/guide.js';
import { modRow } from '../ui/workbench.js';
import { relicIcon, relicTitle } from '../ui/relics.js';

const DEG = Math.PI / 180;
const UI_W = 960, UI_H = 540;   // UI unit space (see style.css --u)

// Skills that change the defense, shown in the preview's modifier list.
// (Skills that change the defense carry `night: true` in src/data/skills.js.)

/**
 * Scale a wave's total enemy count by `mult` (boons, Intel sabotage). The change is applied to the
 * whole wave, one enemy at a time from the currently largest group (later groups first on ties), so a
 * 10% cut always removes something even when every group is small. Groups never drop below 1 and
 * bosses are never added or removed.
 */
function scaleWaveCount(groups, mult) {
  if (!mult || mult === 1) return;
  const total = groups.reduce((n, g) => n + g.count, 0);
  const target = mult < 1 ? Math.min(total - 1, Math.round(total * mult)) : Math.max(total + 1, Math.round(total * mult));
  const pickLargest = (min) => {
    let best = null;
    for (const g of groups) {
      if (DEFENSE_ENEMIES[g.type]?.boss || g.count < min) continue;
      if (!best || g.count > best.count || (g.count === best.count && g.at >= best.at)) best = g;
    }
    return best;
  };
  for (let n = total; n > target; n--) { const g = pickLargest(2); if (!g) break; g.count -= 1; }
  for (let n = total; n < target; n++) { const g = pickLargest(1); if (!g) break; g.count += 1; }
}

/**
 * Build tonight's spawn schedule from data. Steps:
 *  1. Take tonight's variant (waveFor(night, variantFor(run)): A/B/C per run and night, generated past
 *     night 6). Groups belong to pushes; `at` counts from the start of their push.
 *  2. District threats add `tonight.extraGroups`. They come in push DEFENSE.extraPush (the last push if the
 *     night has fewer), spread evenly between DEFENSE.extraGroupFrom and extraGroupTo of that push's length.
 *     They take `opts.dangerLane` (the map lane facing tonight's area, when the map has one) or else
 *     alternate lanes, the first going to the lane with fewer authored enemies. Each uses the enemy type's
 *     own spawn gap; its count is scaled by DEFENSE.threatScale[night − 1] (smaller threats early).
 *  3. tonight.enemyCount (objective boons, optional flags, Intel sabotage) scales the whole wave's
 *     count (see scaleWaveCount). The cuts stack but are floored at CONFIG.waveSizeFloor (−20%).
 *  4. Lanes are taken % opts.lanes (a map may have 2 or 3 lanes). Groups expand into one spawn event per
 *     enemy { push, t (from its push's start), lane, type, hpMult? }, sorted by push, then time.
 * Per-enemy modifiers (HP × healthMult(night) or the group's hpMult, tonight.enemySpeed, laneSlow,
 * Rapid Response) are applied when each enemy spawns / moves, not here.
 * Returns { variant, name, groups, events, pushes (count), pushEvents ([[events]]), total, perLane, duration }.
 */
export function buildWave(run, opts = {}) {
  const night = Math.max(1, run.night);
  const nLanes = Math.max(1, opts.lanes || DEFENSE_MAP.lanes.length);
  const t = run.tonight || {};
  const mult = run.waveCountMult ? run.waveCountMult() : Math.max(CONFIG.waveSizeFloor ?? 0, t.enemyCount ?? 1);
  const variant = variantFor(run);
  const W = waveFor(night, variant);
  const groups = W.groups.map((g) => ({ ...g, push: g.push || 0, lane: ((g.lane % nLanes) + nLanes) % nLanes, extra: false }));
  const pushes = W.pushes;
  const xp = Math.min(pushes - 1, DEFENSE.extraPush ?? 0);
  const inPush = groups.filter((g) => g.push === xp);
  const length = Math.max(1, ...inPush.map((g) => g.at + g.gap * (g.count - 1)));
  const load = new Array(nLanes).fill(0);
  for (const g of groups) load[g.lane] += g.count;
  let lane = load.indexOf(Math.min(...load));
  const extras = t.extraGroups || [];
  const scale = DEFENSE.threatScale?.[Math.min(DEFENSE.threatScale.length, night) - 1] ?? 1;
  extras.forEach((x, i) => {
    const f = extras.length === 1
      ? (DEFENSE.extraGroupFrom + DEFENSE.extraGroupTo) / 2
      : DEFENSE.extraGroupFrom + (DEFENSE.extraGroupTo - DEFENSE.extraGroupFrom) * (i / (extras.length - 1));
    const def = DEFENSE_ENEMIES[x.type];
    groups.push({
      push: xp, at: Math.round(length * f * 10) / 10, lane: opts.dangerLane ?? lane, type: x.type,
      count: Math.max(1, Math.round(x.count * scale)), gap: x.gap ?? def?.gap ?? 1, extra: true,
    });
    lane = (lane + 1) % nLanes;
  });
  scaleWaveCount(groups, mult);
  const events = [];
  for (const g of groups) {
    if (!DEFENSE_ENEMIES[g.type]) continue;
    for (let k = 0; k < g.count; k++) events.push({ push: g.push, t: g.at + k * g.gap, lane: g.lane, type: g.type, hpMult: g.hpMult });
  }
  events.sort((a, b) => a.push - b.push || a.t - b.t);
  const pushEvents = Array.from({ length: pushes }, (_, k) => events.filter((e) => e.push === k));
  // Preview: counts per lane per type (in order of first appearance).
  const perLane = Array.from({ length: nLanes }, () => new Map());
  for (const e of events) perLane[e.lane].set(e.type, (perLane[e.lane].get(e.type) || 0) + 1);
  return {
    variant, name: W.name, groups, events, pushes, pushEvents, total: events.length, perLane,
    duration: pushEvents.reduce((s, p) => s + (p.length ? p[p.length - 1].t : 0), 0),
  };
}

/** Is this enemy type new tonight (not in any earlier night's waves, any variant)? */
function isNewType(type, night) {
  return !WAVE_VARIANTS.slice(0, night - 1).some((vs) => vs.some((v) => v.groups.some((g) => g.type === type)));
}

const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString();

/** Readable name of a Relay-damage source: an enemy type key, 'sap' (Spitter globs) or 'colossus' (slams). */
export function leakName(src, plural = false) {
  if (src === 'sap') return 'Spitter sap';
  if (src === 'colossus') return plural ? 'Colossus slams' : 'Colossus slam';
  const n = DEFENSE_ENEMIES[src]?.name || src;
  return plural ? `${n}s` : n;
}

/**
 * One line on what got through tonight, worst first: "4 Ruin Guards −40 · Spitter sap −20 · 2 Razorbacks −18"
 * (from nightStats / run.lastNight { leaks: count per source, leakHp: damage per source }). '' if nothing.
 */
export function leakSummaryText(night, max = 4) {
  const hp = night?.leakHp || {}, n = night?.leaks || {};
  const rows = Object.keys(hp).filter((k) => hp[k] > 0).sort((a, b) => hp[b] - hp[a]);
  if (!rows.length) return '';
  const part = (k) => (k === 'sap' ? `${leakName(k)} −${Math.round(hp[k])}`
    : `${n[k] > 1 ? `${n[k]} ` : ''}${leakName(k, n[k] > 1)} −${Math.round(hp[k])}`);
  return rows.slice(0, max).map(part).join(' · ') + (rows.length > max ? ' · …' : '');
}

export class DefenseScene {
  constructor(game) {
    this.game = game;
    this.run = game.run;
    this._disp = [];          // geometries / materials / textures to dispose
    this._visuals = [];       // makeVisual roots owned by the scene (scenery, pads, core)
    this._listeners = [];
  }

  // =================================================================== lifecycle

  enter() {
    const game = this.game;
    const run = this.run;
    if (!run) { setTimeout(() => game.go('title'), 0); return; }

    this.three = new THREE.Scene();
    this.three.background = new THREE.Color(DEFENSE_VIEW.background);
    // Orthographic, exactly 32 px per tile (sprites 1:1), rendered at DEFENSE_VIEW.res (1280×720).
    this.camera = new PixelCamera({ dist: 30, near: 0.5, far: 300 });
    // Night grade (critic H §4.4–4.5): the jungle's PostFx at full dark (DEFENSE_VIEW.post): moonlit blue, while
    // glowing texels (eyes, the Relay crystal) and light pools keep their colour. Off: the older lit-scene look.
    this._buildPost();
    game.assets.setTint(this.spriteTint);

    // Tonight's night number / modifiers as they were when the scene opened: run.nightSurvived()
    // advances run.night and clears run.tonight before the "survived" banner, and the HUD and side
    // panel must keep showing this night.
    this.night = run.night;
    this.tonight = run.tonight;
    this.district = run.district;
    const resumeWave = run.phase === 'wave';

    // The run's night map (src/data/defenseMap.js; run.mapKey, 'twin' for old saves).
    this.map = mapFor(run);
    this.lanes = this.map.lanes.map((d, i) => new Lane(d, i));
    this.corePos = new THREE.Vector3(this.map.core.x, 0, this.map.core.y);
    this.coreRadius = this.map.coreRadius;
    // Enemy health tonight: the night curve (healthMult) × any run modifier (Run.nightHpMult, e.g. Overgrowth)
    // × the map's hpMult (layouts whose pads see both paths get tougher enemies, so every map plays fair).
    this.hpMult = (run.nightHpMult ? run.nightHpMult() : healthMult(run.night)) * (this.map.hpMult ?? 1);
    // The lane facing tonight's area: its danger group comes down it (buildWave via _waveOpts).
    this.dangerLane = this.laneForDistrict(this.district);

    this._makeShared();
    this.fx = new Fx(game, this.three, this.camera);
    this.projectiles = new Projectiles(this);
    this._buildLights();
    this._buildGround();
    this.fx.ground = { patch: (tx, tz, w, h) => this.ground?.patch?.(tx, tz, w, h) || null, unlit: false };   // splats stain the board (Fx.decal)
    this._buildScenery();
    this._buildCore();
    this._buildPads();
    this._buildIndicators();
    this._buildChevrons();
    this._fitCamera();   // NightCamera: integer zoom (pixel-exact like the day), framed on the board

    // State
    this.phase = 'prep';
    this.paused = false;
    this.speed = 1;
    this.waveTime = 0;
    this.prepTime = 0;
    this.enemies = [];
    this.towers = run.towers.map((rec) => new Tower(this, rec));
    this.selPad = -1;
    this.placing = null;
    this.hoverPad = -1;
    this.hoverType = null;
    this.sellArmed = null;
    this.boss = null;
    this.resolved = 0;
    this.totalEnemies = 0;
    this.seenTypes = new Set();
    this.endTimer = 0;
    this.coreHitT = 0;
    this.overUi = false;
    this.wave = buildWave(run, this._waveOpts());
    // Night bookkeeping for the rules (leaks by type, protocol casts, boss outcome) and the salvage pick.
    this.nightStats = { leaks: {}, leakHp: {}, protocols: 0, bossKilled: false, bossSpent: false, callEarly: 0 };
    this.pushIdx = -1;
    this.lullT = 0;
    this.protocols = new ProtocolDeck(this);

    this._buildUI();
    this._bindInput();

    // Prep begins: one-time nightly bonuses, then snapshot for Continue.
    const notes = run.beginPrep();
    notes.forEach((n, i) => setTimeout(() => this._alive && toast(game.ui, n, 'good', 3.2), 250 + i * 500));
    if (!resumeWave) {
      run.save('prep');
      toast(game.ui, `Night ${run.night} — prepare the defenses`, 'amber', 2.6);
    }

    const bossLane = this.wave.events.find((e) => DEFENSE_ENEMIES[e.type]?.boss)?.lane;
    this._hintQueue = [
      { id: 'def_boss_target', pos: 'map-bottom-left', when: () => this.phase === 'prep' && bossLane != null,
        html: `The <b>${DEFENSE_ENEMIES.colossus.name}</b> comes down the <b>${this.lanes[bossLane ?? 0]?.name}</b> in the last push. Set <b>one or two</b> towers deep on its path to <b>Toughest</b> (<span class="key">T</span>); keep the rest on <b>First in line</b> for its escort. On the plaza it stops and slams the Relay until it dies.` },
      { id: 'def_build', pos: 'map-bottom-left', when: () => this.phase === 'prep', spot: () => this._padHintSpot(),
        html: 'Enemies walk the dirt paths to your base. <b>Click a glowing square</b> beside a path to build a tower there.' },
      { id: 'def_select', pos: 'map-bottom-left', when: () => this.phase === 'prep' && this.towers.length > 0,
        html: 'Click a tower to <b>upgrade</b> it (<span class="key">U</span>) or <b>sell</b> it back (<span class="key">S</span>).' },
      { id: 'def_preview', pos: 'map-bottom-left', when: () => this.phase === 'prep' && (this.towers.length > 0 || this.prepTime > 14),
        html: 'The right panel lists tonight\'s enemies on each path (click empty ground to bring it back).' },
      { id: 'def_start', pos: 'map-bottom-left', when: () => this.phase === 'prep' && this.towers.length > 0,
        html: 'Ready? Press <b>Start Wave</b> (<span class="key">Space</span>). Once it starts you can\'t build until it ends.' },
      { id: 'def_intel', pos: 'map-bottom-left', when: () => this.phase === 'prep' && run.res.intel > 0 && this.prepTime > 3,
        html: `You found <b>Intel</b>. Spend it under the enemy list: <b>Read it</b> (${CONFIG.intel.decryptCost} Intel → ${CONFIG.intel.decryptResearch} Research, kept forever) or <b>Disrupt the attack</b> (${CONFIG.intel.sabotageCost} Intel → ${Math.round((1 - CONFIG.intel.sabotageWave) * 100)}% fewer enemies tonight).` },
      { id: 'def_wave', pos: 'map-bottom-left', when: () => this.phase === 'wave',
        html: 'Enemies that reach the Relay damage it. Pause with <span class="key">Esc</span>, speed up with <span class="key">F</span>.' },
      // (Taught in prep: in a 16:9 window the night's side panel has no room for a docked hint, critic K2 §5.)
      { id: 'def_protocol', pos: 'map-bottom-left', when: () => this.phase === 'prep' && this.protocols.keys.length > 0 && this.towers.length > 0 && this.prepTime > 6,
        html: `<b>Relay Protocols</b>: during the attack press <span class="key">${PROTOCOLS.vine_snare.hotkey}</span> (or its button), then click the path: <b>Vine Snare</b> roots every enemy in the circle for 2 s (they take 25% more damage meanwhile). It recharges in ${PROTOCOLS.vine_snare.cooldown} s.` },
      { id: 'def_lull', pos: 'map-bottom-left', when: () => this.phase === 'lull',
        html: `A lull between pushes: you can <b>build, upgrade and repair</b> now. The next push comes when the timer runs out, or <b>call it early</b> (<span class="key">N</span>) for bonus Scrap.` },
      { id: 'def_boss', pos: 'map-bottom-left', float: true, when: () => this.phase === 'wave' && !!this.boss,
        html: 'The <b>Canopy Colossus</b> roots itself to spawn Crawlers (the <b style="color:#63c74d">filled green disc</b> around it), then charges along the <b>red</b> path — a <b>Vine Snare</b> on it cancels the charge. At 60% health it <b>roars and enrages</b>: it charges faster and Skitters sprout with its roots. On the plaza it stops and <b>slams the Relay</b> every few seconds until it dies.' },
    ];
    this._curHint = null;

    this.debug = {
      win: () => this._endNight(),
      lose: () => { run.relayHp = 0; this._defeat(); },
      spawn: (type, lane = 0) => {
        if (!DEFENSE_ENEMIES[type]) return `unknown type: ${type}`;
        if (this.phase === 'prep') this.startWave();
        this.totalEnemies += 1;
        return this.spawnEnemy(type, lane);
      },
      setSpeed: (n) => { this.speed = Math.max(0.25, Math.min(16, n)); this._refreshTop(true); return this.speed; },
      money: (n = 500) => { run.add({ scrap: n, circuits: Math.ceil(n / 25), biofiber: Math.ceil(n / 25) }); this.sideDirty = true; this._refreshTop(true); return { ...run.res }; },
      state: () => ({ phase: this.phase, waveTime: this.waveTime, push: this.pushIdx, pushes: this.wave.pushes, lullT: this.lullT, enemies: this.enemies.length, toSpawn: this.events ? this.events.length - this.spawnIdx : this.wave.total, relayHp: run.relayHp, res: { ...run.res }, towers: run.towers.length, variant: this.wave.name }),
      callNext: () => this.callNextPush(),
      cast: (key, x, z) => this.protocols.cast(key, { x, z }),
    };
    this._alive = true;

    // Continue from a mid-wave quit: push 0 restarts the night with the build locked when it began; a
    // later push re-enters the lull before it (the snapshot was taken there, build as it stood).
    if (resumeWave) {
      const k = Math.max(0, Math.min((this.wave.pushes || 1) - 1, run.wavePush || 0));
      this.startWave(k);
      if (k > 0) {
        toast(game.ui, `Night ${this.night}: back in the lull before push ${k + 1} of ${this.wave.pushes}`, 'amber', 3.5);
      } else {
        toast(game.ui, `Night ${this.night}: the wave restarts — your build was locked when it began`, 'amber', 3.5);
        // A short "get ready" beat before the restarted wave runs (DEFENSE.resumeReady seconds).
        this.readyT = DEFENSE.resumeReady || 0;
        if (this.readyT > 0) {
          this.readyEl = el('div.df-ready', {}, el('div.df-ready-t', 'Get ready'), el('div.df-ready-s', ''));
          this.uiRoot.append(this.readyEl);
          pinWhole(this.readyEl, { cy: true });   // whole pixels, not translate(-50%) (critic M2 P1-3)
        }
      }
    }
  }

  /** buildWave options from this map: lane count, and the lane facing tonight's area if the map has one. */
  _waveOpts() {
    const dl = typeof this.dangerLane === 'function' ? this.dangerLane(this.district) : this.dangerLane;
    return { lanes: this.lanes.length, dangerLane: Number.isInteger(dl) && dl >= 0 && dl < this.lanes.length ? dl : undefined };
  }

  /** Flares (Relay Protocols): is p lit? / damage multiplier for a tower standing at p. */
  litAt(p) { return this.protocols?.litAt(p) ?? false; }
  flareMult(p) { return this.protocols?.flareMult(p) ?? 1; }

  /** Build / upgrade / sell / repair are open (prep, or a lull between pushes). */
  get canBuild() { return this.phase === 'prep' || this.phase === 'lull'; }

  exit() {
    if (!this._alive) return;
    this._alive = false;
    this._sideRO?.disconnect();
    const game = this.game;
    try { this.settingsOpen?.close?.(); } catch { /* overlay already gone */ }
    for (const [target, ev, fn, opt] of this._listeners) target.removeEventListener(ev, fn, opt);
    this._listeners = [];
    for (const e of this.enemies) e.remove();
    this.enemies = [];
    for (const t of this.towers) t.dispose();
    this.towers = [];
    this.protocols?.dispose();
    this.cam?.dispose();
    this._tip?.remove();
    this.post?.dispose();
    this._postShade?.dispose();
    this.post = null;
    this.projectiles.dispose();
    this.fx.dispose();
    for (const v of this._visuals) game.assets.disposeVisual(v);
    this._visuals = [];
    for (const d of this._disp) d.dispose?.();
    this._disp = [];
    this.three.traverse((o) => { if (o.isLight && o.dispose) o.dispose(); });
    this.three.clear();
    game.assets.setTint('#ffffff');
    game.stage.style.cursor = '';
  }

  _track(...items) { this._disp.push(...items); return items[0]; }

  _listen(target, ev, fn, opt) {
    target.addEventListener(ev, fn, opt);
    this._listeners.push([target, ev, fn, opt]);
  }

  // =================================================================== world building

  _makeShared() {
    const T = (x) => this._track(x);
    this.hpMats = {
      bg: T(new THREE.SpriteMaterial({ color: '#181425', depthTest: false, depthWrite: false })),
      good: T(new THREE.SpriteMaterial({ color: '#63c74d', depthTest: false, depthWrite: false })),
      mid: T(new THREE.SpriteMaterial({ color: '#feae34', depthTest: false, depthWrite: false })),
      low: T(new THREE.SpriteMaterial({ color: '#e43b44', depthTest: false, depthWrite: false })),
    };
    this.pipGeom = T(new THREE.BoxGeometry(0.11, 0.06, 0.11));
    this.pipMat = T(new THREE.MeshBasicMaterial({ color: '#feae34' }));
    this.moundGeom = T(new THREE.SphereGeometry(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2));
    this.moundMat = T(new THREE.MeshLambertMaterial({ color: '#6b4a3a' }));
    // Amber ring under towers boosted by a Pulse Beacon (opacity pulses in _frameVisuals).
    // Wider than the pad base and drawn before the sprites, so it reads as a halo around the tower.
    this.buffRingGeom = T(new THREE.RingGeometry(0.6, 0.76, 32));
    this.buffRingMat = T(new THREE.MeshBasicMaterial({ color: '#fee761', transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    // Icy ring under slowed enemies: a colour tint alone doesn't read under the blue night light.
    // Rank badges floating over level 2 / 3 towers (2 or 3 amber chevrons), shared per level.
    this.levelBadge = {};
    for (const n of [2, 3]) {
      const c = document.createElement('canvas');
      c.width = 16; c.height = n * 4 + 6;
      const g = c.getContext('2d');
      // Hard pixel chevrons (no anti-aliased strokes): a 2 px colour line inside a 1 px dark outline.
      const chevron = (y, color, grow) => {
        for (let x = 2 - grow; x <= 13 + grow; x++) {
          const py = y + Math.round(Math.abs(x - 7.5) * (4 / 6));
          g.fillStyle = color;
          g.fillRect(x, py - grow, 1, 2 + grow * 2);
        }
      };
      for (let k = 0; k < n; k++) chevron(2 + k * 4, '#181425', 1);
      for (let k = 0; k < n; k++) chevron(2 + k * 4, n === 3 ? '#fee761' : '#feae34', 0);
      const tex = T(new THREE.CanvasTexture(c));
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.levelBadge[n] = { mat: T(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false })), aspect: c.height / c.width, w: c.width, h: c.height };
    }
    this.slowRingGeom = T(new THREE.RingGeometry(0.3, 0.42, 20));
    this.slowRingMat = T(new THREE.MeshBasicMaterial({ color: '#8ff8ff', transparent: true, opacity: 0.75, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  }

  /**
   * The rank badge for a level 2 / 3 tower (critic H2 §11): rank_badge_<n> lying flat on its plinth's front face
   * (DEFENSE_VIEW.rankBadgeOnPlinth), at 1× (1 texel = 1 px), or null (Tower falls back to the floating chevrons).
   */
  rankBadge(tower, level) {
    const key = `rank_badge_${level}`;
    const pad = this.pads?.[tower.rec.pad];
    if (!DEFENSE_VIEW.rankBadgeOnPlinth || !pad?.faceZ || !this.game.assets.hasSprite(key)) return null;
    this._rankMats ||= {};
    if (!this._rankMats[key]) {
      const info = this.game.assets.spriteInfo(key);
      const img = info.tex.image;
      const mat = this._track(new THREE.MeshBasicMaterial({ map: info.tex, transparent: true, alphaTest: 0.5, depthWrite: false }));
      this._rankMats[key] = { mat, geom: this._track(new THREE.PlaneGeometry(img.width / 32, img.height / 32)) };
    }
    const R = this._rankMats[key];
    const m = new THREE.Mesh(R.geom, R.mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.03, pad.faceZ);
    m.renderOrder = -1;   // on the plinth (−2), under the tower sprite
    m.userData.pxSnap = true;
    return m;
  }

  /** Ground ring shown under a slowed enemy (shared geometry). */
  makeSlowRing(enemy) {
    const m = new THREE.Mesh(this.slowRingGeom, this.slowRingMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.06;
    m.scale.setScalar(0.7 + (enemy.def.size || 0.6) * 0.6);
    m.renderOrder = -1;   // before the sprites: the enemy stands on top of its ring
    enemy.obj.add(m);
    return m;
  }

  /**
   * Root vines around a rooted enemy, as pixel art: a floor decal of roots plus an upright sprite of
   * thorny tendrils wrapped around the feet (drawn in front of the enemy). Shared textures.
   */
  makeVines(enemy) {
    // Hand-drawn snare (critic H2 §8): fx_vine_snare (roots out of a cracked ring, coiled round the feet) just in
    // front of the enemy, 'burst' then 'hold' (vinesLook); the procedural wrap + roots below when the art is missing.
    const big = (enemy.def.size || 0.6) >= 1.1 ? 2 : 1;   // whole-number scales only (crisp texels)
    if (this.game.assets.hasSprite('fx_vine_snare')) {
      const g = new THREE.Group();
      const snare = this.game.assets.makeVisual('fx_vine_snare', { shadow: false, scale: big });
      snare.position.z = 0.06;
      // Drawn after its enemy and writing no depth, so it doesn't trip the enemy's x-ray silhouette (red checker).
      snare.userData.vis.body.renderOrder = 3;
      for (const m of snare.userData.vis.mats) m.depthWrite = false;
      setAnim(snare, 'burst', true);
      g.userData.snare = snare;
      g.add(snare);
      enemy.obj.add(g);
      return g;
    }
    if (!this.vineMats) {
      const v = vineTextures();
      this.vineMats = {
        wrap: this._track(new THREE.SpriteMaterial({ map: v.wrap, alphaTest: 0.5, transparent: true })),
        roots: this._track(new THREE.MeshLambertMaterial({ map: v.roots, alphaTest: 0.5, depthWrite: false })),
        wrapSize: v.wrapSize, rootSize: v.rootSize,
      };
      this.vineRootGeom = this._track(new THREE.PlaneGeometry(v.rootSize[0] / 32, v.rootSize[1] / 32));
    }
    const M = this.vineMats;
    const g = new THREE.Group();
    const roots = new THREE.Mesh(this.vineRootGeom, M.roots);
    roots.rotation.x = -Math.PI / 2;
    roots.position.y = 0.025;
    roots.scale.setScalar(big);
    roots.userData.pxSnap = true;
    const wrap = new THREE.Sprite(M.wrap);
    wrap.center.set(0.5, 0);
    wrap.scale.set((M.wrapSize[0] / 32) * big, (M.wrapSize[1] / 32) * big, 1);
    wrap.position.z = 0.06;   // just in front of the feet
    wrap.renderOrder = 3;
    g.add(roots, wrap);
    enemy.obj.add(g);
    return g;
  }

  /** A rooted enemy's vines (DefenseEnemy._updateStatusLook): shown while rooted; the sprite snare bursts on, then holds. */
  vinesLook(g, on, dt) {
    const s = g.userData.snare;
    if (s && on && !g.visible) setAnim(s, 'burst', true);
    g.visible = on;
    if (!s || !on) return;
    if (s.userData.vis.anim === 'burst' && animDone(s)) setAnim(s, 'hold');
    updateVisual(s, dt);
  }

  /** Dirt mound shown while a burrower is underground. */
  makeMound(enemy) {
    const m = new THREE.Mesh(this.moundGeom, this.moundMat);
    m.scale.set(1.1, 0.5, 1.1);
    m.visible = false;
    enemy.obj.add(m);
    return m;
  }

  /** The night grade (DEFENSE_VIEW.post): a PostFx pass with no canopy, no player light, the moon at full dark. */
  _buildPost() {
    const P = DEFENSE_VIEW.post;
    this.post = null;
    this.lightCfg = DEFENSE_VIEW.light;
    this.spriteTint = DEFENSE_VIEW.spriteTint;
    if (!P?.on) return;
    this.post = new PostFx(this.game);
    this._postShade = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    this._postShade.needsUpdate = true;
    this.post.setWorld({ shadeTex: this._postShade, gradeTex: null, size: GROUND.size });
    const U = this.post.uniforms;
    U.uTint.value.setRGB(...P.tint);
    U.uAmbient.value = P.ambient;
    U.uDark.value = 0;
    U.uLightR.value = 1e6;     // no player light radius: the whole board is lit
    U.uLamp.value = 0;
    U.uDapple.value = 0;
    U.uCardK.value = 1;        // no stepped card shade (it would dither every card)
    U.uMoonFloor.value = P.moonFloor;
    U.uNightLift.value.set(...P.lift);
    U.uEmit.value = P.emit;
    U.uVignette.value = P.vignette;
    this.lightCfg = { ...DEFENSE_VIEW.light, ...P.light };
    this.spriteTint = P.spriteTint;
  }

  _buildLights() {
    const L = this.lightCfg;
    this.three.add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi));
    const moon = new THREE.DirectionalLight(L.moon, L.moonI);
    moon.position.set(-12, 20, -8);
    moon.target.position.set(15, 0, 8);
    this.three.add(moon, moon.target);
    this.coreLight = new THREE.PointLight(L.core, L.coreI, L.coreDist, 1);
    this.coreLight.position.set(this.corePos.x, 2.4, this.corePos.z);
    this.three.add(this.coreLight);
    this.coreLightColor = new THREE.Color(L.core);
    for (const [x, y] of this.map.lamps || []) {
      const l = new THREE.PointLight(L.lamp, L.lampI, L.lampDist, 1);
      l.position.set(x + 0.5, 1.9, y + 0.5);
      this.three.add(l);
      // Amber light pool on the ground (dithered, texel-exact: PixelGlow), like the jungle's lit spots.
      this._glowPool(x + 0.5, y + 0.8, DEFENSE_VIEW.glow.lamp);
    }
  }

  /**
   * Stepped light pool (PixelGlow) on the ground at (x, z). With the night grade it is a light source
   * (lightPool: the pixels it lights skip the moonlight); otherwise a plain additive decal. Returns the mesh;
   * _setGlow(m, k) scales its brightness.
   */
  _glowPool(x, z, G) {
    let m;
    if (this.post) {
      m = lightPool(G);
      m.material.opacity = G.emit ?? 1;   // alpha only: how far the lit pixels escape the moonlight
      this._track(m.geometry);
      this._track(m.material);
    } else {
      const tex = radialGlowTexture(Math.round(G.w * 32), Math.round(G.h * 32), { steps: G.steps, power: G.power });
      m = new THREE.Mesh(this._track(new THREE.PlaneGeometry(Math.round(G.w * 32) / 32, Math.round(G.h * 32) / 32)),
        this._track(new THREE.MeshBasicMaterial({ map: tex, color: G.color, transparent: true, opacity: G.strength, depthWrite: false, blending: THREE.AdditiveBlending })));
      m.userData.pxSnap = true;
    }
    m.userData.glow = { color: new THREE.Color(G.color).multiplyScalar(G.strength ?? 1), strength: G.strength ?? 1 };
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.021, z);
    m.renderOrder = -3;   // ground light: before plinths (−2), ground marks (−1) and every sprite (0)
    this.three.add(m);
    return m;
  }

  /** Brightness of a _glowPool mesh: k × its configured strength (lightPool ignores opacity: scale the colour). */
  _setGlow(m, k) {
    const g = m?.userData.glow;
    if (!g) return;
    if (this.post) m.material.color.copy(g.color).multiplyScalar(k);
    else m.material.opacity = g.strength * k;
  }

  /**
   * Tiles covered by lanes (tile keys "x,y"), including each trail's off-field run back to the edge of the
   * ground (`map.margin.left` tiles, along the first segment's direction).
   */
  _laneTiles(laneIndex = null) {
    const set = new Set();
    const back = this.map.margin?.left ?? 12;
    this.map.lanes.forEach((lane, li) => {
      if (laneIndex != null && li !== laneIndex) return;
      const [p0, p1] = lane.points;
      const dx = Math.sign(p1[0] - p0[0]), dy = Math.sign(p1[1] - p0[1]);
      const pts = laneIndex != null ? lane.points : [[p0[0] - dx * back, p0[1] - dy * back], ...lane.points];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let k = 0; k <= n; k++) {
          set.add(`${Math.round(ax + ((bx - ax) * k) / n)},${Math.round(ay + ((by - ay) * k) / n)}`);
        }
      }
    });
    return set;
  }

  /**
   * Ground and jungle: the same blended terrain and foliage cards as the day jungle
   * (src/world/DefenseGround.js), lit by the night lights, sprites tinted like the units. Cards that would
   * cover a lane, a pad (forward pads too) or the Relay are dropped there.
   */
  _buildGround() {
    const pads = this._padSpots().map(({ at: [x, y] }) => ({ x: x + 0.5, z: y + 0.5 }));
    this.ground = buildDefenseGround(this.game, this.map, { seed: this.run.seed, laneTiles: this._laneTiles(), pads, tint: this.spriteTint });
    this.three.add(this.ground.group);
    this._track(this.ground);
    // Visible rewards: a slowed path (tonight.laneSlow, e.g. "pumps flood the north path") is tinted wet.
    const ls = this.tonight?.laneSlow;
    if (ls && this.map.lanes[ls.lane % this.map.lanes.length]) {
      const R = DEFENSE_VIEW.rewards;
      const tiles = [...this._laneTiles(ls.lane % this.map.lanes.length)].map((k) => k.split(',').map(Number)).filter(([x, y]) => x >= 0);
      const m = laneTint(tiles, R.laneTint, R.laneTintAlpha, this.run.seed);
      if (m) { this.three.add(m); this._track({ dispose: m.userData.dispose }); this.laneTintMesh = m; }
    }
  }

  // ------------------------------------------------------------------ map: pads, beacons, area directions

  /** The jungle (cached per run) for directions: area bearings and beacons. Null if it can't be built. */
  _jungle() {
    if (this._jungleData === undefined) {
      try { this._jungleData = worldForRun(this.game, this.run, DISTRICT_KEYS); } catch (e) { console.warn(e); this._jungleData = null; }
    }
    return this._jungleData;
  }

  /**
   * The lane facing an area (district key) on this map: the trail whose compass bearing is closest to the
   * direction of that area's sector from the Relay in this run's jungle. The area's danger group (the
   * district threat, tonight.extraGroups) enters by it. null when unknown.
   */
  laneForDistrict(key) {
    const ri = DISTRICT_KEYS.indexOf(key);
    const data = ri >= 0 ? this._jungle() : null;
    const a = data?.regionAngles?.[ri];
    if (a == null) return null;
    return laneForAngle(this.map, a);
  }

  /** Compass word for an area's direction from the Relay ("north-east"), or ''. */
  _districtDir(key) {
    const ri = DISTRICT_KEYS.indexOf(key);
    const a = ri >= 0 ? this._jungle()?.regionAngles?.[ri] : null;
    return a == null ? '' : compass(Math.cos(a), Math.sin(a));
  }

  /**
   * Every pad spot of the map: its pads, then each forward slot that is open — a beacon (pylon) switched on
   * in the jungle opens the next forward slot on the lane facing it (DEFENSE_MAPS[*].lanes[*].forward).
   * A slot with a tower already on it stays (a save, or a beacon from an earlier night). Pad index =
   * map.pads.length + slot index, stable for the run. → [{ i, at: [x, y], forward?, beacon? }]
   */
  _padSpots() {
    if (this._spots) return this._spots;
    const map = this.map, base = map.pads.length;
    const spots = map.pads.map((at, i) => ({ i, at }));
    const slots = forwardSlots(map);
    const open = new Map();
    const on = new Set(this.run.world?.pylons || []);
    const data = on.size ? this._jungle() : null;
    if (data) {
      const used = new Map();
      for (const p of data.pylons) {
        if (!on.has(p.id)) continue;
        const li = laneForAngle(map, Math.atan2(p.z - data.center.z, p.x - data.center.x));
        const rank = used.get(li) || 0;
        used.set(li, rank + 1);
        const si = slots.findIndex((s) => s.lane === li && s.rank === rank);
        if (si >= 0) open.set(si, { district: DISTRICT_KEYS[p.region] || null, dir: compass(p.x - data.center.x, p.z - data.center.z) });
      }
    }
    slots.forEach((s, si) => {
      const i = base + si;
      const beacon = open.get(si) || (this.run.towers.some((t) => t.pad === i) ? { district: null, dir: '' } : null);
      if (beacon) spots.push({ i, at: s.at, forward: true, lane: s.lane, beacon });
    });
    this._spots = spots;
    return spots;
  }

  _addVisual(key, x, z, opts) {
    const v = this.game.assets.makeVisual(key, opts);
    v.position.set(x, 0, z);
    this.three.add(v);
    this._visuals.push(v);
    return v;
  }

  _buildScenery() {
    // Trees, rocks and the jungle border are foliage cards in the ground (DefenseGround); lamps stay sprites.
    for (const [x, y] of this.map.lamps || []) this._addVisual('lamp_post', x + 0.5, y + 0.5);
  }

  _buildCore() {
    this.coreVis = this._addVisual('relay_core', this.corePos.x, this.corePos.z);
    // Painter's order only (no depth write): an enemy walking up behind the Relay never x-rays through it.
    this._noDepthWrite(this.coreVis);
    // Cyan light pool under the core (dithered, texel-exact: PixelGlow); its strength pulses in _frameVisuals.
    this.coreGlow = this._glowPool(this.corePos.x, this.corePos.z + 0.2, DEFENSE_VIEW.glow.core);
  }

  /**
   * Units and buildings draw in painter's order (sorted by their feet) instead of writing depth, so the
   * occlusion silhouettes (Assets.js, depthFunc GREATER) only ever fire for scenery — never enemy-on-enemy,
   * tower-on-enemy or Relay-on-enemy (critic K §4.2). Cards still write depth, so a tree in front of an
   * enemy still shows its silhouette. Idempotent (flags the visual).
   */
  _noDepthWrite(root) {
    const vis = root?.userData?.vis;
    if (!vis || vis._noDW) return;
    vis._noDW = true;
    root.traverse((o) => {
      if (o.isSprite && o.name !== 'silhouette' && o.name !== 'cardMask' && o.material) o.material.depthWrite = false;
      // Ground marks (blob shadow, hostile ring) draw before every sprite: with no depth writes a later-sorted
      // shadow would tint the base of the sprite standing on it.
      if (o.name === 'shadow' || o.name === 'ring') o.renderOrder = -1;
    });
    // Night grade: units and towers stand a little out of the moonlight (readable without hostile rings).
    if (this.post && vis.body?.isSprite) this._lightCode(vis.body.material, DEFENSE_VIEW.post.unitLift);
  }

  /**
   * PostFx light code for an alpha-tested material: its texels write alpha 1 − share, so the night grade lights
   * them `share` of the way back to full colour (0 = moonlit like the ground, 1 = emissive). Colour blends as usual.
   */
  _lightCode(mat, share) {
    if (!mat || !(share > 0)) return;
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.SrcAlphaFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    mat.blendEquationAlpha = THREE.AddEquation;
    mat.blendSrcAlpha = THREE.ConstantAlphaFactor;
    mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    mat.blendAlpha = 1 - Math.min(1, share);
    mat.needsUpdate = true;
  }

  /** Widest / tallest tower sprite frame (texels), so plinths and markers grow with bigger tower art. */
  _towerArt() {
    if (this._art) return this._art;
    let w = 32, h = 48;
    for (const type of Object.keys(TOWERS)) {
      for (const key of [type, `${type}_2`, `${type}_3`]) {
        const info = this.game.assets.spriteInfo?.(key);
        const img = info?.tex?.image;
        if (!img) continue;
        const def = info.def || {};
        w = Math.max(w, def.fw || Math.floor(img.width / (def.frames || 1)));
        h = Math.max(h, def.fh || img.height);
      }
    }
    return (this._art = { w, h });
  }

  /** A dashed 1-texel rim (solid corners) w × h texels: the "build here" / selected pad marker. */
  _markerTex(w, h) {
    this._markerTexs ||= new Map();
    const key = `${w}x${h}`;
    if (this._markerTexs.has(key)) return this._markerTexs.get(key);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    const rx0 = 0, rx1 = w - 1, ry0 = 0, ry1 = h - 1;
    for (let x = rx0; x <= rx1; x++) if (((x - rx0) & 3) < 2 || x - rx0 < 3 || rx1 - x < 3) { g.fillRect(x, ry0, 1, 1); g.fillRect(x, ry1, 1, 1); }
    for (let y = ry0; y <= ry1; y++) if (((y - ry0) & 3) < 2 || y - ry0 < 3 || ry1 - y < 3) { g.fillRect(rx0, y, 1, 1); g.fillRect(rx1, y, 1, 1); }
    const tex = this._track(new THREE.CanvasTexture(c));
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const out = { tex, geom: this._track(new THREE.PlaneGeometry(w / 32, h / 32)) };
    this._markerTexs.set(key, out);
    return out;
  }

  /**
   * Build pads: an in-world stone / timber plinth per pad (DefenseGround.makePlinth), sized from the widest
   * tower sprite, with a dashed rim marker hugging its top face. Forward pads (open beacon slots) get a
   * cyan-trimmed marker. this.pads is indexed by pad index (map pads, then every forward slot); closed
   * forward slots are entries with `closed: true` and nothing drawn.
   */
  _buildPads() {
    // Occupied pads may keep corner brackets in the tower's type colour (DEFENSE_VIEW.typeBrackets).
    this.typeMarkMats = {};
    this.padBaseY = 0;
    const grow = Math.max(0, this._towerArt().w - 32);
    const spots = new Map(this._padSpots().map((s) => [s.i, s]));
    const total = this.map.pads.length + forwardSlots(this.map).length;
    const wood = this.map.woodPads || [];
    this.pads = [];
    for (let i = 0; i < total; i++) {
      const s = spots.get(i);
      const at = s ? s.at : (i < this.map.pads.length ? this.map.pads[i] : forwardSlots(this.map)[i - this.map.pads.length].at);
      const [x, y] = at;
      const pad = { i, x: x + 0.5, z: y + 0.5, closed: !s, forward: !!s?.forward, beacon: s?.beacon || null, lane: s?.lane };
      if (s) {
        const base = makePlinth(i * 7 + 3, wood.includes(i), grow, this.game.assets);
        base.position.set(x + 0.5 + (base.userData.xOffset || 0), 0.02, y + 0.5 + base.userData.zOffset);
        pad.faceZ = base.userData.faceZ;
        this.three.add(base);
        this._track(base.geometry, base.material, base.material.map);
        const mw = Math.round(base.userData.topW * 32) + 2, mh = Math.round(base.userData.topH * 32) + 2;
        const mk = this._markerTex(mw, mh);
        const mat = this._track(new THREE.MeshBasicMaterial({ map: mk.tex, color: '#feae34', transparent: true, opacity: 0.6, depthWrite: false }));
        const marker = new THREE.Mesh(mk.geom, mat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(x + 0.5, this.padBaseY + 0.03, y + 0.5);
        marker.renderOrder = -1;   // ground mark: under the tower standing on it
        marker.userData.pxSnap = true;
        marker.visible = false;
        this.three.add(marker);
        Object.assign(pad, { base, marker, mat, topW: base.userData.topW, topH: base.userData.topH });
        if (pad.forward) {
          // Forward pad: a small cyan beacon lamp at its back-left corner (your beacon's light).
          const lamp = this._glowPool(x + 0.5, y + 0.5, DEFENSE_VIEW.glow.forward);
          pad.glow = lamp;
        }
      } else {
        // Closed slot: a hidden marker so code that hides markers wholesale keeps working.
        const marker = new THREE.Object3D();
        marker.visible = false;
        Object.assign(pad, { base: null, marker, mat: null });
      }
      this.pads.push(pad);
    }
    // Legacy selection marker (kept for code that toggles it); pad markers turn cyan when selected now.
    this.selMarker = new THREE.Object3D();
    this.selMarker.visible = false;
  }

  /** Shared material for the type-coloured pad brackets under a tower (see Tower.refreshVisual). */
  typeMarkMat(type) {
    if (!this.typeMarkMats[type]) {
      this.typeMarkMats[type] = this._track(new THREE.MeshBasicMaterial({
        map: this.markerTex, color: TOWERS[type]?.icon?.color || '#ead4aa', transparent: true, opacity: 0.9, depthWrite: false,
      }));
    }
    return this.typeMarkMats[type];
  }

  _buildIndicators() {
    const T = (x) => this._track(x);
    this.range = new THREE.Group();
    this.rangeFillMat = T(new THREE.MeshBasicMaterial({ color: '#2ce8f5', transparent: true, opacity: 0.1, depthWrite: false }));
    this.rangeRingMat = T(new THREE.MeshBasicMaterial({ color: '#2ce8f5', transparent: true, opacity: 0.85, depthWrite: false }));
    const fill = new THREE.Mesh(T(new THREE.CircleGeometry(1, 64)), this.rangeFillMat);
    const ring = new THREE.Mesh(T(new THREE.RingGeometry(0.97, 1, 64)), this.rangeRingMat);
    this.rangeMin = new THREE.Mesh(T(new THREE.RingGeometry(0.94, 1, 48)), this.rangeRingMat);
    this.rangeOuter = new THREE.Group();
    this.rangeOuter.add(fill, ring);
    for (const m of [fill, ring, this.rangeMin]) { m.rotation.x = -Math.PI / 2; m.renderOrder = -1; }   // on the ground, under sprites
    this.range.add(this.rangeOuter, this.rangeMin);
    this.range.position.y = 0.05;
    this.range.visible = false;
    this.three.add(this.range);
  }

  _showRange(x, z, s, color = '#2ce8f5', strong = true) {
    this.range.visible = true;
    this.range.position.set(x, 0.05, z);
    this.rangeOuter.scale.setScalar(s.range);
    this.rangeMin.visible = !!s.minRange;
    if (s.minRange) this.rangeMin.scale.setScalar(s.minRange);
    this.rangeFillMat.color.set(color);
    this.rangeRingMat.color.set(color);
    this.rangeFillMat.opacity = strong ? 0.12 : 0.06;
    this.rangeRingMat.opacity = strong ? 0.9 : 0.45;
  }

  /** Animated chevrons along each lane during prep (shows direction of travel). */
  _buildChevrons() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.16, -0.2); shape.lineTo(0.2, 0); shape.lineTo(-0.16, 0.2); shape.lineTo(-0.04, 0);
    const geom = this._track(new THREE.ShapeGeometry(shape));
    this.chevMat = this._track(new THREE.MeshBasicMaterial({ color: '#feae34', transparent: true, opacity: 0.55, depthWrite: false }));
    this.chevrons = [];
    for (const lane of this.lanes) {
      const n = Math.floor(lane.total / 2.2);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geom, this.chevMat);
        m.renderOrder = -1;   // on the trail, under the enemies walking it
        this.three.add(m);
        this.chevrons.push({ m, lane, d: (i / n) * lane.total });
      }
    }
  }

  _updateChevrons(dt) {
    const show = this.canBuild;
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    for (const c of this.chevrons) {
      c.m.visible = show;
      if (!show) continue;
      c.d = (c.d + dt * 1.6) % c.lane.total;
      c.lane.pointAt(c.d, p);
      c.lane.dirAt(c.d, d);
      c.m.position.set(p.x, 0.04, p.z);
      c.m.rotation.set(-Math.PI / 2, 0, Math.atan2(-d.z, d.x));
    }
    this.chevMat.opacity = 0.35 + 0.2 * Math.sin(this.game.time * 3);
  }

  /**
   * Per-frame board furniture (critic H fix 9 — show things when they matter):
   *  · pad markers: the selected pad (cyan, also under a tower); while placing, every empty pad (green);
   *    the hovered pad (white); otherwise empty pads show a dim static rim only while you can afford a
   *    tower, and pulse only during the very first prep; built pads show nothing (no orange dot);
   *  · units draw in painter's order (_noDepthWrite) so silhouettes only fire for scenery;
   *  · hostile rings only under the hovered enemy, the selected tower's current target and the boss;
   *  · visible rewards: towers glint while tonight's towerRate / towerDamage reward applies.
   */
  _updateBoard(dt) {
    const t = this.game.time, run = this.run, P = DEFENSE_VIEW.pads;
    const build = this.canBuild;
    if (build && (this._affordT = (this._affordT || 0) - dt) <= 0) {
      this._affordT = 0.25;
      this._anyAffordable = run.availableTowers(this.game.meta).some((ty) => run.canAfford(run.buildCost(ty)));
    }
    const firstPrep = this.phase === 'prep' && this.night === 1 && this.towers.length === 0;
    for (const p of this.pads) {
      if (p.closed || !p.mat) continue;
      const tw = this._towerOn(p.i);
      const hovered = p.i === this.hoverPad, selected = p.i === this.selPad;
      let show = false, color = p.forward ? '#2ce8f5' : '#feae34', op = P.idleOpacity;
      if (selected) { show = true; color = '#2ce8f5'; op = tw ? 0.7 + 0.3 * Math.sin(t * 5) : 1; }
      else if (!build || tw) show = false;
      else if (this.placing) { show = true; color = hovered ? '#ffffff' : '#63c74d'; op = hovered ? 1 : 0.45 + 0.25 * Math.sin(t * 3 + p.i * 0.7); }
      else if (hovered) { show = true; color = '#ffffff'; op = 1; }
      else if (firstPrep) { show = true; op = P.pulse[0] + P.pulse[1] * Math.sin(t * 3 + p.i * 0.7); }
      else if (this._anyAffordable) show = true;
      p.marker.visible = show;
      if (show) { p.mat.color.set(color); p.mat.opacity = op; }
    }
    for (const tw of this.towers) this._noDepthWrite(tw.visual);
    if (this.post && !this._hpLit && this.hpMats) {
      // Enemy health bars keep their colours at night (emissive light code).
      this._hpLit = true;
      for (const m of Object.values(this.hpMats)) this._lightCode(m, DEFENSE_VIEW.post.barLift);
    }
    // Hovered enemy (for its ring and name tag) and the selected tower's target.
    this.hoverEnemy = this._pickEnemy();
    const selT = this._towerOn(this.selPad);
    const k = selT?.stats?.kind;
    const target = selT && k && k !== 'support' && k !== 'snare' && selT.pickTarget ? selT.pickTarget(this.enemies, selT.stats) : null;
    for (const e of this.enemies) {
      if (!e.visual || e.removed) continue;
      this._noDepthWrite(e.visual);
      if (e._ring === undefined) e._ring = e.visual.getObjectByName('ring') || null;
      if (e._ring) e._ring.visible = e === this.hoverEnemy || e === target || !!e.boss;
      // Health bar only on the enemies you're looking at, the boss and the big ones (DEFENSE_VIEW.hpBarRoles).
      e.barFocus = e === this.hoverEnemy || e === target || !!e.boss || (DEFENSE_VIEW.hpBarRoles || []).includes(e.def?.role);
    }
    // Rewards that boost towers tonight: a small glint over every tower now and then.
    const tn = this.tonight;
    if (!this.paused && (tn?.towerRate > 1 || tn?.towerDamage > 1)) {
      const R = DEFENSE_VIEW.rewards;
      for (const tw of this.towers) {
        tw._glintT = (tw._glintT ?? ((tw.rec.pad * 0.61) % R.glintEvery)) - dt;
        if (tw._glintT > 0) continue;
        tw._glintT = R.glintEvery;
        this.fx.flash({ x: tw.pos.x + 0.22, y: this.padBaseY + tw.height * 0.85, z: tw.pos.z + 0.05 }, { color: tn.towerDamage > 1 ? '#feae34' : '#fee761', size: 0.3, life: 0.14 });
      }
    }
    // The Relay zap's reach (critic K2 E): a thin dashed cyan ring while you hover the Relay, and for a moment the
    // first time it fires each night (RELAY_ZAP.ringShow).
    if (!this.zapRing) this._buildZapRing();
    this.zapRingT = Math.max(0, (this.zapRingT || 0) - dt);
    const showZap = this._overRelay() || this.zapRingT > 0;
    if (this.zapRing.visible !== showZap) this.zapRing.visible = showZap;
    if (showZap) this.zapRing.rotation.y = t * 0.25;
  }

  /** The zap's range ring: RELAY_ZAP.dashes dashes 1 texel thick at RELAY_ZAP.range round the Relay. */
  _buildZapRing() {
    const Z = RELAY_ZAP, r = Z.range, n = Z.dashes || 28, seg = (Math.PI * 2) / n;
    const mat = this._track(new THREE.MeshBasicMaterial({ color: Z.color, depthWrite: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this._lightCode(mat, 0.5);
    this.zapRing = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this._track(new THREE.RingGeometry(r - 1 / 32, r, 4, 1, i * seg, seg * 0.5)), mat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = -1;
      this.zapRing.add(m);
    }
    this.zapRing.position.set(this.corePos.x, 0.05, this.corePos.z);
    this.zapRing.visible = false;
    this.three.add(this.zapRing);
  }

  /** Is the mouse over the Relay (its base to the top of the crystal, screen space)? */
  _overRelay() {
    if (!this.mouse?.inside || this.overUi || !this.corePos) return false;
    const v = this._v3 || (this._v3 = new THREE.Vector3()), cam = this.camera;
    const b = this.game.project(v.set(this.corePos.x, 0, this.corePos.z), cam);
    const top = this.game.project(v.set(this.corePos.x, RELAY_ZAP.originY, this.corePos.z), cam);
    const a0 = this.game.project(v.set(0, 0, 8), cam), a1 = this.game.project(v.set(1, 0, 8), cam);
    const hw = Math.abs(a1.x - a0.x) * (this.map.coreRadius || 1.2);
    return this.mouse.x > b.x - hw && this.mouse.x < b.x + hw && this.mouse.y > top.y && this.mouse.y < b.y + hw * 0.4;
  }

  /** The enemy under the mouse (screen-space box around its sprite), or null. */
  _pickEnemy() {
    if (!this.mouse?.inside || this.overUi || !this.enemies?.length) return null;
    const mx = this.mouse.x, my = this.mouse.y, cam = this.camera, v = this._v3 || (this._v3 = new THREE.Vector3());
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.removed || !e.visual) continue;
      const b = this.game.project(v.set(e.pos.x, 0, e.pos.z), cam);
      const top = this.game.project(v.set(e.pos.x, e.height, e.pos.z), cam);
      const hw = Math.max(8, Math.abs(top.y - b.y) * 0.35);
      if (mx < b.x - hw || mx > b.x + hw || my < top.y || my > b.y + 4) continue;
      const d = Math.abs(mx - b.x) + Math.abs(my - (b.y + top.y) / 2) * 0.5;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Clamp a stage point (CSS px) so a DOM tag of `node` stays inside the map viewport. */
  _clampToView(p, node) {
    const vp = this.cam?.vp;
    if (!vp) return p;
    const s = this.game.stage.clientWidth / this.game.width;   // CSS px per internal px
    const w = node?.offsetWidth || 0, h = node?.offsetHeight || 0;
    return { x: Math.max(vp.x0 * s + 4, Math.min(vp.x1 * s - w - 4, p.x)), y: Math.max(vp.y0 * s + 2, Math.min(vp.y1 * s - h - 2, p.y)) };
  }

  /**
   * The night camera (src/world/NightCamera.js): pixel-exact integer zoom through the same pipeline as the
   * day (internal size = window ÷ k), 32 px per tile. Default: the largest zoom at which the whole board
   * (the field plus the lane mouths) fits the map viewport left of the side panel; wheel / + − zoom, right /
   * middle drag and the arrow keys pan (clamped to the field + DEFENSE_VIEW.zoom.margin). Home re-frames.
   */
  _fitCamera() {
    if (!this.cam) {
      const m = this.map, M = DEFENSE_VIEW.zoom.margin;
      this.cam = new NightCamera(this,
        { x0: -0.2, z0: 0, x1: m.width, z1: m.height },
        { x0: -M - 0.5, z0: -M, x1: m.width + M, z1: m.height + M });
    }
    this.cam.frame();
  }

  // =================================================================== UI

  _buildUI() {
    const game = this.game;
    const run = this.run;
    game.ui.classList.add('defense-ui');
    const root = el('div.df-root');
    this.uiRoot = root;

    // ---- top bar
    this.topNight = el('div.df-night');
    this.relayBar = bar('df-relaybar', 'linear-gradient(#2ce8f5, #0099db)');
    this.resHost = el('div.df-res');
    this.waveStat = el('div.df-wavestat');
    this.waveBar = bar('df-wavebar', 'linear-gradient(#feae34, #f77622)');
    this.pauseBtn = button('❚❚', () => this.togglePause(), { title: 'Pause (Esc / P)', cls: 'df-icon' });
    this.speedBtns = DEFENSE.speeds.map((s) => {
      const b = button(`${s}×`, () => { this.speed = s; this._refreshTop(true); }, { title: `Speed ${s}× (F toggles)`, cls: 'df-icon' });
      b.dataset.speed = s;
      return b;
    });
    // Zoom (NightCamera): − / + step the integer zoom; the label says the texel scale. Hidden when the
    // window allows only one zoom.
    this.zoomLbl = el('span.df-zoomlbl');
    this.zoomOut = button('−', () => { this.cam?.zoomStep(-1); this._refreshTop(true); }, { title: 'Zoom out (mouse wheel, −). Drag with the right mouse button or use the arrow keys to look around; Home re-frames.', cls: 'df-icon df-zbtn' });
    this.zoomIn = button('+', () => { this.cam?.zoomStep(1); this._refreshTop(true); }, { title: 'Zoom in (mouse wheel, +). Drag with the right mouse button or use the arrow keys to look around; Home re-frames.', cls: 'df-icon df-zbtn' });
    this.zoomBox = el('div.df-zoom', {}, this.zoomOut, this.zoomLbl, this.zoomIn);
    // The top bar fits 1280×720 with every currency and three speeds: short resource chips (names in the
    // tooltip), no "WAVE" label, and the controls never shrink (critic K §5.1: 2× was off-screen).
    this.top = el('div.df-top.ui-block', {},
      this.topNight,
      el('div.df-relay', { title: `Relay Core health. The run ends at 0. ${RELAY_ZAP.hint}` }, el('span.df-lbl', '♥ RELAY'), this.relayBar.node),
      this.resHost,
      el('div.grow'),
      this.waveStat,
      this.zoomBox,
      el('div.df-ctrl', {}, this.pauseBtn, ...this.speedBtns),
    );

    // ---- side panel
    this.sideHead = el('div.df-head');
    this.sideBody = el('div.df-body.scroll');
    this.sideFoot = el('div.df-foot');
    // Relay Protocol buttons (pushes and lulls): built once and kept out of the panel's re-renders, so a
    // click on them is never lost to a refresh mid-press (ProtocolDeck.panel / frame).
    this.protoBar = el('div.df-protobar', { style: { display: 'none' } });
    // Leak feed (pushes and lulls): what got through to the Relay tonight, newest first (_pushLeakFeed).
    this.leakFeed = el('div.df-leaks', { style: { display: 'none' } });
    // Coach hints dock here, under the panel's title (critic H2 §5.1: never over the board); kept out of re-renders.
    this.hintDock = el('div.df-hintdock');
    this.side = el('div.df-side.panel.ui-block', {}, this.sideHead, this.hintDock, this.sideBody, this.leakFeed, this.protoBar, this.sideFoot);
    // Fade the bottom edge while more content sits below the scroll fold.
    this.sideBody.addEventListener('scroll', () => this._sideMore());

    // ---- boss bar, banner, lane tags
    this.bossBar = bar('df-bossbar', 'linear-gradient(#ff0044, #a22633)');
    this.bossPhase = el('div.df-bossphase');
    this.bossBox = el('div.df-boss', {}, el('div.df-bossname', '☠ ' + DEFENSE_ENEMIES.colossus.name), this.bossBar.node, this.bossPhase);
    this.bossBox.style.display = 'none';
    this.laneTags = this.lanes.map((l) => {
      const n = el('div.df-lanetag');
      root.append(n);
      return n;
    });
    // Name tag over the hovered tower (towers are small at night zoom).
    this.towerTag = el('div.df-towertag', { style: { display: 'none' } });
    root.append(this.towerTag);
    // Boss entry marker: a pulsing arrow at the lane mouth while the boss walks in from off-screen.
    this.bossArrow = el('div.df-bossarrow', { style: { display: 'none' } }, '☠ ▶▶');
    root.append(this.bossArrow);

    root.append(this.top, this.side, this.bossBox);
    game.ui.append(root);
    this._bindTips();
    this.sideDirty = true;
    this._topKey = {};
    this._refreshTop(true);
    this._renderSide();
    requestAnimationFrame(() => snapCentred(this.zoomBox.parentNode ? this.top : null));   // centred button glyphs on whole pixels (critic M2 P1-3)
  }

  /**
   * Styled in-game tooltips instead of native `title`s (critic K §5.5: they took ~1 s and were unstyled):
   * any element under the night UI with `data-tip` (HTML) shows it at once — beside the side panel for
   * panel items, under the top bar for its items. `_tipify(root)` turns `title` attributes (buttons,
   * resource chips) into `data-tip` after each render.
   */
  _bindTips() {
    this._tip = el('div.df-tip', { style: { display: 'none' } });
    this.uiRoot.append(this._tip);
    this._tipFor = null;
    this._listen(this.uiRoot, 'pointerover', (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (t !== this._tipFor) this._showTip(t && this.uiRoot.contains(t) ? t : null);
    });
    this._listen(this.uiRoot, 'pointerout', (e) => {
      if (!e.relatedTarget || !this._tipFor?.contains(e.relatedTarget)) {
        const t = e.relatedTarget?.closest?.('[data-tip]');
        if (t !== this._tipFor) this._showTip(t && this.uiRoot.contains(t) ? t : null);
      }
    });
    this._tipify(this.uiRoot);
  }

  _showTip(t) {
    this._tipFor = t;
    if (!t) { this._tip.style.display = 'none'; return; }
    this._tip.innerHTML = t.dataset.tip;
    this._tip.style.display = '';
    this._placeTip();
  }

  /** Position the tooltip next to its anchor, inside the stage. */
  _placeTip() {
    const t = this._tipFor, tip = this._tip;
    if (!t?.isConnected) { this._tipFor = null; tip.style.display = 'none'; return; }
    const sr = this.game.stage.getBoundingClientRect(), r = t.getBoundingClientRect();
    const u = this.game.u, tw = tip.offsetWidth, th = tip.offsetHeight;
    let x, y;
    if (t.closest('.df-side')) {
      x = this.side.getBoundingClientRect().left - sr.left - tw - 6 * u;   // left of the side panel
      y = r.top - sr.top;
    } else {
      x = r.left - sr.left + r.width / 2 - tw / 2;                       // under the element
      y = r.bottom - sr.top + 4 * u;
      // Top-bar tips (speed, zoom) stay off the side panel: they'd cover its title. End them at its left edge.
      const sl = this.side ? this.side.getBoundingClientRect().left - sr.left : 0;
      if (sl > 0 && x + tw > sl - 4 * u) x = sl - tw - 4 * u;
    }
    x = Math.max(4 * u, Math.min(sr.width - tw - 4 * u, x));
    y = Math.max(4 * u, Math.min(sr.height - th - 4 * u, y));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /** Move native `title` tooltips under `root` to the styled tooltip (data-tip, HTML-escaped). */
  _tipify(root) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    for (const n of root.querySelectorAll('[title]')) {
      const s = n.getAttribute('title');
      n.removeAttribute('title');
      // Inside something that already has a tip (a cost chip on a tower card): the outer tip wins.
      if (s && !n.dataset.tip && !n.parentElement?.closest('[data-tip]')) n.dataset.tip = esc(s);
    }
    // A re-render replaced the hovered element: pick up its replacement under the pointer.
    if (this._tipFor && !this._tipFor.isConnected) {
      const sr = this.game.stage.getBoundingClientRect();
      const at = this.mouse ? document.elementFromPoint(sr.left + this.mouse.x, sr.top + this.mouse.y) : null;
      const t = at?.closest?.('[data-tip]');
      this._showTip(t && this.uiRoot.contains(t) ? t : null);
    }
  }

  _bindInput() {
    // Buttons must not keep keyboard focus (Space would re-click them).
    this._listen(this.game.ui, 'mousedown', (e) => { if (e.target.closest?.('button')) e.preventDefault(); });
    // Track the pointer ourselves on move *and* press, so a click without a prior move still picks.
    this.mouse = { x: 0, y: 0, inside: false };
    const track = (e) => {
      this.overUi = !!e.target.closest?.('.ui-block');
      const r = this.game.stage.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.inside = this.mouse.x >= 0 && this.mouse.y >= 0 && this.mouse.x <= r.width && this.mouse.y <= r.height;
    };
    this._listen(window, 'pointermove', track, true);
    this._listen(window, 'pointerdown', track, true);
  }

  /** Icon for a tower / enemy, at most `size` stage units (N px on a 960-wide stage), integer-scaled. */
  _iconFor(kind, key, size = 22) {
    const spec = this.game.assets.iconSpec(key, size * this.game.u);
    if (spec) {
      // A half-texel crop can leave a fractional width (31.5 px): pad it to a whole pixel so the text after it stays
      // on whole pixels too (critic M2 P1-3).
      const n = el('span.df-ico', { style: spec.css });
      const padW = Math.ceil(spec.w - 0.001) - spec.w;
      if (padW > 0.001) n.style.marginRight = `${padW}px`;
      return n;
    }
    if (kind === 'tower') {
      const ic = TOWERS[key].icon || { glyph: '?', color: '#8b9bb4' };
      return el('span.df-glyph', { style: { '--c': ic.color } }, ic.glyph);
    }
    const d = DEFENSE_ENEMIES[key];
    return el('span.df-glyph.enemy', { style: { '--c': d?.color || '#8b9bb4' } }, (d?.name || key)[0]);
  }

  _refreshTop(force = false) {
    const run = this.run;
    const k = this._topKey;
    const nightTxt = `${this.night}|${this.phase}|${this.pushIdx}`;
    if (force || k.night !== nightTxt) {
      k.night = nightTxt;
      const P = this.wave.pushes || 1, pk = Math.max(0, this.pushIdx) + 1;
      const sub = {
        prep: 'Preparation', wave: P > 1 ? `Push ${pk} of ${P}` : 'Wave in progress', lull: `Lull · push ${Math.min(P, pk + 1)} next`,
        won: 'Night survived', lost: 'Relay down',
      }[this.phase];
      this.topNight.replaceChildren(el('b', `NIGHT ${this.night}`), el('span.muted', this.run.isLongNight?.() ? ' · Long Night' : ` / ${CONFIG.nights}`), el('div.df-phase', sub));
    }
    const hpTxt = `${Math.ceil(run.relayHp)}|${run.relayMax}`;
    if (force || k.hp !== hpTxt) {
      k.hp = hpTxt;
      const f = run.relayHp / run.relayMax;
      this.relayBar.set(f, `${Math.ceil(run.relayHp)} / ${run.relayMax}`);
      this.relayBar.node.style.setProperty('--f', Math.max(0, Math.min(1, f)).toFixed(3));   // two-tone digits (defense.css)
      this.relayBar.node.classList.toggle('low', f < 0.3);
    }
    const resTxt = RESOURCE_KEYS.map((r) => run.res[r]).join('|');
    if (force || k.res !== resTxt) {
      k.res = resTxt;
      // Icon + number (the name is in the tooltip): every currency fits the bar at 720p.
      this.resHost.replaceChildren(resRow(run.res, { short: true }));
      this._tipify(this.resHost);
      if (this.canBuild) this.sideDirty = true;
    }
    // Wave status
    let wTxt;
    if (this.phase === 'prep') wTxt = `p|${this.wave.total}`;
    else wTxt = `w|${this._toGo()}|${Math.floor(this._progress() * 100)}|${this.phase === 'lull' ? Math.ceil(this.lullT) : ''}`;
    if (force || k.wave !== wTxt) {
      k.wave = wTxt;
      if (this.phase === 'prep') {
        this.waveStat.replaceChildren(el('span.df-lbl', 'TONIGHT'), el('b', `${this.wave.total}`), el('span.muted', ' enemies'));
      } else {
        // "N to go" = alive + not yet spawned, so it matches the per-path counts.
        this.waveBar.set(this._progress(), this.phase === 'lull' ? `next ${Math.ceil(this.lullT)}s` : `${Math.floor(this._progress() * 100)}%`);
        this.waveStat.replaceChildren(this.waveBar.node, el('span.df-left', {}, el('b', String(this._toGo())), el('span.muted', ' to go')));
      }
    }
    const ctlTxt = `${this.paused}|${this.speed}`;
    if (force || k.ctl !== ctlTxt) {
      k.ctl = ctlTxt;
      this.pauseBtn.textContent = this.paused ? '▶' : '❚❚';
      this.pauseBtn.classList.toggle('selected', this.paused);
      for (const b of this.speedBtns) b.classList.toggle('selected', Number(b.dataset.speed) === this.speed);
    }
    const cam = this.cam;
    const zTxt = cam ? `${cam.k}|${cam.ks.join(',')}` : '';
    if (force || k.zoom !== zTxt) {
      k.zoom = zTxt;
      const many = cam && cam.ks.length > 1;
      this.zoomBox.style.display = many ? '' : 'none';
      if (many) {
        this.zoomLbl.textContent = cam.label;
        this.zoomOut.classList.toggle('disabled', !cam.canZoomOut);
        this.zoomIn.classList.toggle('disabled', !cam.canZoomIn);
      }
      this._tipify(this.top);
    }
  }

  /** Enemies still to deal with tonight: alive on the map + not yet spawned. */
  _toGo() {
    const pending = this.events ? this.events.length - this.spawnIdx : this.wave.total;
    return Math.max(0, this.totalEnemies - this.resolved) + Math.max(0, pending);
  }

  /**
   * Readiness for tonight (READINESS, src/data/guide.js) from a forecast of the night (DefenseForecast.js):
   * a fast 1-D replay of tonight's pushes against the towers' real stats, the path each tower covers, slows,
   * tanks and Spitters, plus the Relay Protocols as damage-equivalents. → { level: 'weak' | 'risky' |
   * 'strong', lost (expected Relay loss), lo, hi, lanes: [{ name, short, lost, dots 0–3 }], ratio }.
   * Cached until the build, the wave or the Relay changes.
   */
  _readiness() {
    const run = this.run;
    const key = `${this.night}|${run.towers.map((t) => `${t.pad}${t.type}${t.level}${t.branch || ''}${t.target}${t.rangeMod || ''}`).join(',')}`
      + `|${this.wave.total}|${Math.round(run.relayHp)}|${this.protocols.keys.join(',')}|${run.skills.length}`;
    if (this._rdKey === key && this._rd) return this._rd;
    this._computeTowerStats();
    this._rd = forecastNight(this);
    this._rdKey = key;
    return this._rd;
  }

  /**
   * Start Wave from the button / Space. A weak-looking defense asks first: the button turns into
   * "Start anyway" for DEFENSE.startGuard.confirm s, and only that button or Shift+Space starts it
   * (`how`: 'button' | 'space' | 'shift'), so a plain Space double-tap can't skip the warning.
   */
  _tryStartWave(how = 'button') {
    if (this.phase !== 'prep') return;
    const r = this._readiness();
    const armed = this.startArmed && this.game.time < this.startArmed;
    if (r.level === 'weak' && (!armed || how === 'space')) {
      if (!armed) this.startArmed = this.game.time + DEFENSE.startGuard.confirm;
      this.game.sfx.play('error');
      toast(this.game.ui, armed ? 'To start anyway, click Start anyway or press Shift+Space.'
        : this.towers.length ? 'Your defense looks too weak for tonight. Build or upgrade more, or click Start anyway (Shift+Space).'
          : 'You have no towers! Build some first, or click Start anyway (Shift+Space).', 'bad', 3);
      this.sideDirty = true;
      return;
    }
    this.startArmed = 0;
    this.startWave();
  }

  /** Fraction of tonight's enemies resolved (killed or leaked), counting spawns not yet made. */
  _progress() {
    const total = Math.max(1, this.totalEnemies + (this.events ? this.events.length - this.spawnIdx : this.wave.total));
    return Math.min(1, this.resolved / total);
  }

  // ---- side panel

  _renderSide() {
    this.sideDirty = false;
    const t = this._towerOn(this.selPad);
    let mode = 'preview';
    if (this.placing) mode = 'placing';
    else if (t) mode = 'tower';
    else if (this.selPad >= 0 && this.canBuild) mode = 'build';
    this.sideMode = mode;
    const head = this.sideHead, body = this.sideBody, foot = this.sideFoot;
    head.replaceChildren();
    body.replaceChildren();
    foot.replaceChildren();
    if (mode === 'build') this._renderBuild(head, body);
    else if (mode === 'placing') this._renderPlacing(head, body);
    else if (mode === 'tower') this._renderTower(t, head, body);
    else this._renderPreview(head, body);
    // The coach hint docks under the paths in the wave preview (critic M2 P0-1: the night-6 boss hint pushed both
    // paths and Start Wave out of the panel), under the title otherwise.
    // Preview: after the paths, the danger, the rewards and the night-1 zap line (QA 8 P2-1). A selected tower: at the
    // end of its details (QA 8 P1-2: the Colossus hint pushed Upgrade / Sell below the fold).
    const lanes = mode === 'preview' ? body.querySelectorAll(':scope > .df-lane, :scope > .df-threat1, :scope > .df-boons, :scope > .df-zapline') : [];
    if (lanes.length) lanes[lanes.length - 1].after(this.hintDock);
    else if (mode === 'tower') body.append(this.hintDock);
    else if (this.hintDock.parentNode !== this.side || this.hintDock.nextSibling !== body) this.side.insertBefore(this.hintDock, body);
    // "▾ more" pinned to the body's bottom edge while content sits below the fold (_sideMore).
    this._moreCue = el('div.df-morecue');
    body.append(this._moreCue);
    this._renderFoot(foot);
    // A different panel (or another tower) starts at the top: the wave preview's THREAT block must not
    // stay scrolled out of view from an earlier panel.
    const sideKey = `${mode}|${this.selPad}|${this.phase}`;
    if (sideKey !== this._sideKey) {
      this._sideKey = sideKey;
      body.scrollTop = 0;
    }
    this._renderLeakFeed();   // (ends with _keepActInView: the feed's height changes the body's)
    this._tipify(this.side);
    this._fitBody();
  }

  /**
   * The body scroller ends on a whole block, never through a line of text (QA 8 P1-2: the danger box, a hint and a
   * button were cut mid-line under "▾ more"): when it overflows, its height stops at the last block (or row inside
   * one) that fits above a full-width "▾ more" bar; the room left over goes under it. Re-run when the panel or the
   * docked hint changes size (_watchSide).
   */
  _fitBody() {
    const b = this.sideBody;
    if (!b?.isConnected) return;
    this._watchSide();
    b.style.flex = ''; b.style.height = ''; b.style.marginBottom = '';
    const H = b.clientHeight;
    if (b.scrollHeight <= H + 1) { this._sideMore(); return; }
    const cs = this._moreCue && getComputedStyle(this._moreCue, '::before');
    const cueH = Math.ceil(parseFloat(cs?.height) || (parseFloat(cs?.fontSize) || 16) * 1.25 + 2);
    const top = b.getBoundingClientRect().top - b.scrollTop;
    const room = H - cueH;
    let cut = 0;
    const consider = (n) => {
      if (n === this._moreCue || !n.getBoundingClientRect) return;
      if (/absolute|fixed/.test(getComputedStyle(n).position)) return;   // (a hint's × sits at its top)
      if (n.parentElement?.closest('.btn')) return;
      const bot = Math.ceil(n.getBoundingClientRect().bottom - top);
      if (bot <= room && bot > cut) cut = bot;
    };
    for (const c of b.children) {
      consider(c);
      // Rows inside a tall block (a hint's lines, the "Also tonight" list) count too, so one long block can't empty the
      // view; never inside a path, which shows whole or not at all.
      if (c !== this._moreCue && !c.classList.contains('df-lane') && c.getBoundingClientRect().bottom - top > room) {
        for (const cc of c.querySelectorAll(':scope > *, :scope > * > *')) consider(cc);
        // …and its text lines (a hint is one paragraph): the bottom of each line box, plus the block's padding.
        const pad = Math.ceil(parseFloat(getComputedStyle(c).paddingBottom) || 0);
        const tw = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        const rg = document.createRange();
        while (tw.nextNode()) {
          if (!tw.currentNode.textContent.trim() || tw.currentNode.parentElement?.closest('.btn')) continue;   // (never through a button)
          rg.selectNodeContents(tw.currentNode);
          for (const r of rg.getClientRects()) {
            const bot = Math.ceil(r.bottom - top) + pad;
            if (bot <= room && bot > cut) cut = bot;
          }
        }
      }
    }
    if (cut < room * 0.5) { this._sideMore(); return; }   // (nothing sensible to stop on: leave it)
    const hgt = cut + cueH;
    b.style.flex = '0 0 auto';
    b.style.height = `${hgt}px`;
    b.style.marginBottom = `${H - hgt}px`;
    this._sideMore();
  }

  /** Re-fit the body (one per frame) when the side panel or its docked hint changes size. */
  _watchSide() {
    if (this._sideRO || typeof ResizeObserver !== 'function') return;
    let queued = false;
    const later = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; if (this.side?.isConnected) this._fitBody(); });
    };
    this._sideRO = new ResizeObserver(later);
    this._sideRO.observe(this.side);
    this._sideRO.observe(this.hintDock);
  }

  /**
   * A tower panel taller than its space (720p, or the leak feed and protocols showing mid-wave): scroll just
   * enough to keep the row you act on in view — Upgrade / Sell (and the line under it) while building, the
   * targeting buttons during a push.
   */
  _keepActInView() {
    const body = this.sideBody;
    if (!body) return;
    const act = this.sideMode === 'tower' && (body.querySelector('.df-act') || body.querySelector('.df-targets'));
    if (act) {
      const last = act.classList.contains('df-act') ? act.nextElementSibling || act : act;
      const over = last.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
      if (over > 0) body.scrollTop += Math.ceil(over) + 2;
    }
    this._sideMore();
  }

  _sideMore() {
    const b = this.sideBody;
    const more = b.scrollTop + b.clientHeight < b.scrollHeight - 2;
    b.classList.toggle('df-more', more);
    if (this._moreCue) this._moreCue.style.visibility = more ? 'visible' : 'hidden';
  }

  _renderBuild(head, body) {
    const run = this.run;
    const pad = this.pads[this.selPad];
    const fwd = pad?.forward ? (pad.beacon?.dir ? `Forward pad · your ${pad.beacon.dir} beacon` : 'Forward pad') : null;
    head.append(el('h2', 'Build a tower'), el('div.small.muted', fwd || 'Pick one · Esc cancels · hover for numbers'));
    // Compact list (critic K §5.3): one row per tower — icon, name, price, one plain line — so every tower
    // fits at 1280×720 without scrolling (6 today, room for ~9). Bars and exact numbers are in the tooltip.
    const list = el('div.df-cards');
    run.availableTowers(this.game.meta).forEach((type, i) => list.append(this._towerCard(type, i, () => this._build(type, this.selPad))));
    body.append(list);
    const locked = Object.keys(TOWERS).filter((k) => !run.isTowerUnlocked(k, this.game.meta));
    if (locked.length && this.game.meta.lifetime.runs > 1) body.append(el('div.small.muted.df-note', `🔒 ${locked.map((k) => TOWERS[k].name).join(', ')}: unlock with Research (Collection).`));
  }

  /** HTML for a tower's tooltip: name, plain line, strength bars as text, exact numbers, price notes. */
  _towerTip(type, extra = '') {
    const def = TOWERS[type];
    const P = def.pips || {};
    const bars = [['Power', 'damage'], ['Slow', 'slow'], ['Boost', 'boost'], ['Speed', 'speed'], ['Range', 'range']]
      .filter(([, k]) => k in P).map(([l, k]) => `${l} <span class="df-tipbar">${'■'.repeat(P[k] || 0)}<i>${'■'.repeat(3 - (P[k] || 0))}</i></span>`).join('  ');
    return `<b>${def.name}</b><div>${def.desc || def.line || ''}</div>${bars ? `<div class="df-tipbars">${bars}</div>` : ''}`
      + `<div class="df-tipnum">${this._statSummary(this._previewStats(type))}</div>${extra}`;
  }

  _towerCard(type, i, onPick) {
    const run = this.run;
    const def = TOWERS[type];
    const cost = run.buildCost(type);
    const ok = run.canAfford(cost);
    const reason = ok ? null : run.missing(cost);
    const owned = run.towerCount(type);
    const surcharge = run.buildSurcharge(type);
    const notes = (surcharge ? `<div class="amber">+${surcharge} Scrap: you own ${owned} (each ${def.name} raises the next one's price, so mixing types pays)</div>` : '')
      + (reason ? `<div class="bad">${reason}</div>` : '');
    const card = el(`div.df-card${ok ? '' : '.disabled'}`, {
      'data-tip': this._towerTip(type, notes),
      onclick: () => {
        if (!ok) { this.game.sfx.play('error'); toast(this.game.ui, reason, 'bad'); return; }
        onPick();
      },
      onmouseenter: () => { this.hoverType = type; },
      onmouseleave: () => { if (this.hoverType === type) this.hoverType = null; },
    },
    el('div.df-cardicon', {}, this._iconFor('tower', type, 22), i < 9 ? el('span.df-hk', String(i + 1)) : null),
    el('div.df-cardmain', {},
      el('div.df-cardtop', {}, el('b', def.name), el('span.grow'), surcharge ? el('span.df-sur', `+${surcharge}`) : null, costLine(cost, run.res))));
    // (The tower's one plain line is the card's tooltip, critic M2 P0-1: ellipsised in the panel, and every card fits.)
    return card;
  }

  /**
   * Strength as 1–3 pips (TOWERS[*].pips): the rows a tower has, in this order — Power (damage), Slow
   * (Snare Vine), Boost (Pulse Beacon), Speed, Range. Pips must tell the truth (critic K #7).
   */
  _pips(def) {
    const P = def.pips;
    if (!P) return null;
    const rows = [['Power', 'damage'], ['Slow', 'slow'], ['Boost', 'boost'], ['Speed', 'speed'], ['Range', 'range']].filter(([, k]) => k in P);
    return el('div.df-pips', {}, rows.map(([lbl, k]) =>
      el('span.df-piprow', {}, el('span.df-pipl', lbl), el('span.df-pipbar', {}, [1, 2, 3].map((n) => el(`i${n <= (P[k] || 0) ? '.on' : ''}`))))));
  }

  _statSummary(s) {
    switch (s.kind) {
      case 'bullet': return `DMG ${fmt(s.damage)} · ${fmt(1 / s.cooldown)}/s · RNG ${fmt(s.range)}`;
      case 'chain': return `DMG ${fmt(s.damage)} · chains ${s.chains} · RNG ${fmt(s.range)}`;
      case 'mortar': return `DMG ${fmt(s.damage)} splash · RNG ${fmt(s.minRange)}–${fmt(s.range)}`;
      case 'snare': return `Slow ${Math.round((1 - s.slowMult) * 100)}% · RNG ${fmt(s.range)}`;
      case 'support': return `+${Math.round(s.buffRate * 100)}% attack speed · RNG ${fmt(s.range)}`;
      default: return '';
    }
  }

  _renderPlacing(head, body) {
    const def = TOWERS[this.placing];
    head.append(el('h2', `Place ${def.name}`), el('div.small.muted', 'Click an empty pad · Esc / right-click to cancel'));
    const i = this.run.availableTowers(this.game.meta).indexOf(this.placing);
    body.append(this._towerCard(this.placing, i, () => {}));
  }

  _renderTower(t, head, body) {
    const run = this.run;
    const def = TOWERS[t.rec.type];
    const s = t.stats || run.towerStats(t.rec, run.relayHp / run.relayMax);
    const lvl = t.rec.level;
    head.append(
      el('div.row', {}, this._iconFor('tower', t.rec.type, 26), el('div', {}, el('h2', def.name),
        el('div.df-level', {}, [1, 2, 3].map((n) => el(`span.df-pip${n <= lvl ? '.on' : ''}`)),
          el('span.small.muted', ` Level ${lvl} of 3${branchOf(t.rec) ? ` · ${branchOf(t.rec).name}` : ''}`)))),
    );
    // During a push the panel is short on room (leak feed, protocols): the description moves to the name's tooltip.
    if (this.canBuild) body.append(el('div.small', def.line || def.desc));
    else head.querySelector('h2')?.setAttribute('title', def.line || def.desc);

    // Stats (effective: upgrades, skills, boons and beacon buffs applied).
    const rows = [];
    const rate = 1 / (s.cooldown / (1 + t.buffRate));
    if (s.kind === 'bullet') {
      rows.push(['Damage', fmt(s.damage) + (s.fifthShotMult ? ` (×${s.fifthShotMult} every 5th)` : '') + (s.bigBonus ? ` (×${s.bigBonus} vs big enemies)` : '')], ['Attacks', `${fmt(rate, 2)}/s`], ['Range', fmt(s.range)]);
      if (s.pierce) rows.push(['Shields', 'ignored']);
      if (s.slowOnHit) rows.push(['Slow', `${Math.round((1 - s.slowOnHit) * 100)}% for ${s.slowTime}s${s.slowRadius ? ', splashes' : ''}`]);
    } else if (s.kind === 'chain') {
      rows.push(['Damage', s.chains ? `${fmt(s.damage)} (−${Math.round((1 - s.chainFalloff) * 100)}% per jump)` : fmt(s.damage)], ['Chains', `${s.chains} extra targets`], ['Attacks', `${fmt(rate, 2)}/s`], ['Range', fmt(s.range)]);
      if (s.stun) rows.push(['Stun', `${s.stun}s (not bosses)`]);
      if (s.chainSlow) rows.push(['Slow', `${Math.round((1 - s.chainSlow) * 100)}% for ${s.slowTime}s`]);
    } else if (s.kind === 'mortar') {
      rows.push(['Damage', `${fmt(s.damage)} blast`], ['Blast radius', fmt(s.blastRadius)], ['Attacks', `${fmt(rate, 2)}/s`], ['Range', `${fmt(s.minRange)}–${fmt(s.range)}`]);
      if (s.burnDps) rows.push(['Burning sap', `${s.burnDps}/s for ${s.burnTime}s`]);
      if (s.bomblets) rows.push(['Bomblets', `${s.bomblets} × ${s.bombletDamage}`]);
    } else if (s.kind === 'snare') {
      rows.push(['Slow', `${Math.round((1 - s.slowMult) * 100)}% for ${s.slowTime}s`], ['Pulse', `every ${fmt(s.cooldown / (1 + t.buffRate), 2)}s`], ['Range', fmt(s.range)]);
      if (s.rootTime) rows.push(['Root', `${s.rootTime}s, big enemies ${s.bigRoot || 0}s (each once per ${s.rootCooldown}s)`]);
      if (s.damage >= 5) rows.push(['Thorns', `${fmt(s.damage)} per pulse`]);
    } else if (s.kind === 'support') {
      rows.push(['Buff', `+${Math.round(s.buffRate * 100)}% attack speed`], ['Range', fmt(s.range)]);
      if (s.bonusAttackChance) rows.push(['Bonus attack', `${Math.round(s.bonusAttackChance * 100)}% chance`]);
      if (s.buffDamage) rows.push(['Spotting', `+${Math.round(s.buffDamage * 100)}% damage, +${Math.round((s.buffRange || 0) * 100)}% range`]);
      const n = this.towers.filter((o) => o !== t && o.def.kind !== 'support' && o.pos.distanceTo(t.pos) <= s.range + 0.01).length;
      rows.push(['Buffing', `${n} tower${n === 1 ? '' : 's'}`]);
    }
    if (t.buffRate > 0) rows.push(['Beacon', `+${Math.round(t.buffRate * 100)}% speed${t.bonusChance ? `, ${Math.round(t.bonusChance * 100)}% bonus` : ''}`]);
    // Exact stats stay one hover away: the panel shows the three bars.
    const pips = this._pips(def);
    if (pips) { pips.title = rows.map(([a, b]) => `${a}: ${b}`).join(' · '); body.append(pips); }
    if (t.dmgDealt) body.append(el('div.small.muted', `Damage tonight: ${Math.round(t.dmgDealt)}`));
    // The tower's one Workbench mod socket (src/ui/workbench.js: fit / swap / take out in prep and lulls).
    const modR = modRow(this, t);
    if (modR) body.append(modR);

    // Targeting: from night 2 (night 1 towers shoot the enemy first in line).
    if (['bullet', 'chain', 'mortar'].includes(s.kind) && this.night >= 2) {
      body.append(el('h3', {}, 'Targeting ', el('span.key', 'T')));
      body.append(el('div.row.df-targets', {}, TARGET_RULES.map((r) => {
        const b = button(TARGET_RULE_LABEL[r], () => this._setTarget(t, r), { title: TARGET_RULE_TEXT[r], cls: t.rec.target === r ? 'selected df-tgt' : 'df-tgt' });
        return b;
      })));
      // (Each rule's plain explanation is its button's tooltip: the panel must fit at 1280×720 with Upgrade/Sell.)
    }

    // Upgrade (level 3 is a choice of two branches: two half buttons, each with its own price).
    const up = def.upgrades[lvl - 1];
    const wave = !this.canBuild;
    if (wave) {
      // Upgrades and selling are locked mid-wave: keep the panel short so nothing is clipped.
      const next = up?.branches ? `level 3: ${Object.values(up.branches).map((b) => b.name).join(' or ')}` : up?.desc;
      body.append(el('div.small.muted.df-note', up ? `Next upgrade (in a lull or after the attack): ${next}` : '★ Max level'));
      return;
    }
    const notes = [];   // lines under the Upgrade / Sell row
    let upBtn = null;
    // The buttons you act on are pinned at the top of the footer, like Start Wave (QA 8 P1-2: with the Colossus hint up,
    // Upgrade / Sell scrolled below the fold); the details above them scroll.
    const pin = this.sideFoot;
    if (!up) {
      body.append(el('div.small.good', '★ Max level'));
    } else if (up.branches) {
      body.append(el('h3', { title: "Level 3 is a choice of two: pick one. It can't be changed later." }, 'Level 3: pick one ', el('span.small.muted', '(final)')));
      let anyReason = null, free = false;
      const row = el('div.df-intel.df-branches', {}, BRANCH_KEYS.map((bk) => {
        const b = up.branches[bk];
        const cost = run.upgradeCost(t.rec, bk);
        free = Object.keys(cost).length === 0;
        const reason = run.canAfford(cost) ? null : run.missing(cost);
        anyReason = anyReason || reason;
        return button(el('span', {}, el('b', b.name), el('span.df-bline', b.line), costLine(cost, run.res)),
          () => this._upgrade(t, bk), { disabled: !!reason, reason, cls: 'df-half df-branch', title: `${b.name}: ${b.detail || b.line}${reason ? ` (${reason})` : ''}` });
      }));
      pin.append(row);
      if (free) pin.append(el('div.small.good', 'Free upgrade: tonight\'s reward.'));
      else if (anyReason) pin.append(el('div.small.bad', anyReason));
    } else {
      const cost = run.upgradeCost(t.rec);
      const ok = run.canAfford(cost);
      const free = Object.keys(cost).length === 0;
      const discount = !free && run.hasSkill('field_tuning') && !run.tonight.fieldTuningUsed;
      const reason = wave ? 'Not during a wave' : ok ? null : run.missing(cost);
      body.append(el('div.small.df-upline', {}, el('b.amber', `Upgrade to level ${lvl + 1}: `), up.desc));
      upBtn = button(el('span', {}, 'Upgrade', costLine(cost, run.res)), () => this._upgrade(t), { disabled: !!reason, reason, hotkey: 'U', cls: 'primary', title: `Level ${lvl + 1}: ${up.desc}${reason ? ` (${reason})` : ''}` });
      if (free) notes.push(el('div.small.good', 'Free upgrade: tonight\'s reward.'));
      else if (discount) notes.push(el('div.small.good', `Field Tuning: first upgrade tonight is ${Math.round((1 - SKILLS.field_tuning.scrapMult) * 100)}% off Scrap.`));
      if (reason) notes.push(el('div.small.bad', reason));
    }

    // Sell: beside Upgrade (critic K §5.4: one short row, both on screen at 720p); the refund rule is in its tooltip.
    const v = run.sellValue(t.rec);
    const armed = this.sellArmed && this.sellArmed.pad === t.rec.pad;
    const sellReason = wave ? 'Not during a wave' : null;
    const refundNote = `Refunds ${Math.round(CONFIG.sellRefund * 100)}% of ${t.rec.spent.scrap || 0} Scrap spent (rounded down). Components aren't refunded.`;
    const sellBtn = button(el('span', {}, armed ? 'Confirm' : 'Sell', resChip('scrap', v, { short: true })), () => this._sell(t), {
      disabled: !!sellReason, reason: sellReason, hotkey: 'S', cls: armed ? 'danger df-sellarmed' : '', title: refundNote,
    });
    if (armed) {
      // Shrinking bar: how long the confirm stays armed (continues across panel re-renders).
      const left = Math.max(0, this.sellArmed.until - this.game.time);
      sellBtn.append(el('span.df-sellbar', { style: { animationDuration: `${DEFENSE.sellConfirm}s`, animationDelay: `${-(DEFENSE.sellConfirm - left).toFixed(2)}s` } }));
    }
    pin.append(el(`div.df-act${upBtn ? '' : '.df-act1'}`, {}, upBtn, sellBtn));
    pin.append(...notes);
    if (armed) {
      pin.append(el('div.small.bad', 'Click Sell again (or press S) to confirm.'));
      requestAnimationFrame(() => sellBtn.scrollIntoView({ block: 'nearest' }));
    }
  }

  /** Does tonight's area danger send a group down a path (an extra group), not just a global change (speed)? */
  _dangerHasPath() {
    const t = this.tonight;
    return !!(t?.threat && !t.threat.cleared && (t.threat.extraGroup || t.threat2?.extraGroup));
  }

  _renderPreview(head, body) {
    const run = this.run;
    const night = this.night;
    const tn = this.tonight;
    const inWave = this.phase !== 'prep';
    // In a lull: the NEXT push's makeup per path (critic K2 #2: the lull is the moment to answer it).
    const lull = this.phase === 'lull' && this.events;
    const nextPush = lull ? this.pushIdx + 1 : -1;
    const nextN = lull ? this.events.filter((e) => e.push === nextPush).length : 0;
    // (Prep: no subtitle — the top bar says "Tonight N enemies" and each path head its count; critic M2 P0-1.)
    head.append(el('h2', lull ? `Next: push ${nextPush + 1} of ${this.wave.pushes}` : inWave ? 'Still coming' : 'Tonight\'s attack'));
    if (inWave) head.append(el('div.small.muted', lull ? `${nextN} enemies on these paths. Build for them now` : 'Enemies still to arrive on each path'));

    // Per-lane counts first (critic M2 P0-1: the list is the most important thing on the night screen; in a wave:
    // what's still to spawn). In prep each path is a row of icon chips (icon + ×N; name, role and NEW in the
    // tooltip, NEW also as an amber corner dot), like the briefing (mid-wave too: the counts update).
    let perLane = this.wave.perLane;
    if (inWave && this.events) {
      perLane = this.lanes.map(() => new Map());
      for (let i = this.spawnIdx; i < this.events.length; i++) {
        const e = this.events[i];
        if (lull && e.push !== nextPush) continue;
        perLane[e.lane].set(e.type, (perLane[e.lane].get(e.type) || 0) + 1);
      }
    }
    this.lanes.forEach((lane, li) => {
      const m = perLane[li];
      let n = 0;
      for (const c of m.values()) n += c;
      // Chips mid-wave too (QA 8 P1-2: on night 6 the row form put the second path below the fold mid-wave).
      const box = el('div.df-lane.df-chips', {}, el('div.df-lanehead', {}, el('b', lane.name.replace(/lane/i, 'path')), el('span.muted', ` ${n}`)));
      if (!m.size) box.append(el('div.small.muted', lull ? 'Quiet in this push.' : inWave ? 'All here.' : 'Quiet tonight.'));
      for (const [type, c] of m) {
        const d = DEFENSE_ENEMIES[type];
        const fresh = night > 1 && isNewType(type, night) && !inWave;
        box.append(el(`span.df-echip${d.boss ? '.boss' : ''}${fresh ? '.new' : ''}`, { title: `${d.name}${fresh ? ' (NEW tonight)' : ''} · ${d.role}${d.note ? `: ${d.note}` : ''}` },
          this._iconFor('enemy', type, d.boss ? 28 : 18), el('b', `×${c}`)));
      }
      body.append(box);
    });

    // Then the district threat and boons: what makes tonight different. In prep the threat is one short line
    // (its full text and where it comes from in the tooltip); the briefing already said it in full.
    const thr = tn.threat;
    if (thr) {
      // Tag kept short: wide pixel caps would wrap a district name onto 2–3 lines.
      // Which path it comes down: the one facing the area you visited (laneForDistrict; ⚠ on that lane's tag).
      // Only a danger that sends a group has a path (critic J2 C9: a speed-only danger "came down the North path").
      const dl = this._dangerHasPath() ? this.lanes[this.dangerLane] : null;
      const dir = this._districtDir(this.district);
      // Name the area's direction only when the path really faces it (both trails face west: an area to the east
      // still comes down the nearer one, and "lies east" beside "South path" would read wrong).
      const ri = DISTRICT_KEYS.indexOf(this.district);
      const ang = ri >= 0 ? this._jungle()?.regionAngles?.[ri] : null;
      const bearing = this.map.lanes[this.dangerLane]?.bearing;
      const faces = ang != null && bearing != null && Math.abs(((ang * 180 / Math.PI - bearing) % 360 + 540) % 360 - 180) <= 67.5;
      const area = DISTRICTS[this.district]?.name || 'the area';
      // One row (critic H2 §4.5: the box clipped at 720p prep with a docked hint above it and mid-wave at 1080p); where
      // the area lies goes in the box's tooltip.
      const where = dl ? ` It comes down the ${dl.name.replace(/lane/i, 'path')}${dir && faces ? ` (${area} lies ${dir})` : `, the side nearest ${area}`}.` : '';
      // (Mid-wave too, QA 8 P1-2: the full box was cut to its heading in a lull.)
      body.append(el('div.df-threat.df-threat1', { title: `${thr.text} Danger from ${area}, the area you visited.${where}` },
        el('div.small', {}, el('span.df-threatglyph', '⚠ '), thr.short || thr.text, dl ? el('span.df-via', `: ${dl.name.replace(/lane/i, 'path')}`) : null)));
    }
    const boons = tn.boons || [];
    // Wave-size cuts stack under one cap (critic J2 C3): say the combined cut and the cap plainly.
    const cut = tn.enemyCount ?? 1, floor = CONFIG.waveSizeFloor ?? 0;
    const cutLine = cut < 1 - 1e-6 ? (() => {
      const raw = Math.round((1 - cut) * 100), used = Math.round((1 - Math.max(floor, cut)) * 100), cap = Math.round((1 - floor) * 100);
      return el('div.small.df-cut', {}, el('b', `Wave −${used}% tonight`),
        raw > used ? el('span.amber', ` (your cuts add up to −${raw}%, but −${cap}% is the most)`) : el('span.muted', ` (cuts add up, −${cap}% at most)`));
    })() : null;
    if (boons.length || cutLine) {
      body.append(el('div.df-boons', {}, el('div.df-tag.good', '▲ Rewards'), boons.map((b) => el('div.small', b.text)), cutLine));
    }
    // Priority order (QA 8 P2-1): paths, danger, rewards, the night-1 zap line; tips and notes after.
    if (!inWave && run.night <= 1 && !this.game.meta.hints?.relay_zap) {
      // The Relay's own zap (RELAY_ZAP), said once on night 1 (critic M P1-6: after that it lives in the Relay bar's
      // tooltip). In the body, under the paths (critic M2 P0-1: in the footer it pushed the enemy list out of view).
      body.append(el('div.small.df-zapline', {}, el('span.df-zapglyph', 'ϟ '), RELAY_ZAP.hint));
    }

    // Boss tip (critic K #3: putting every tower on Toughest abandons the escort).
    const bossEv = this.wave.events.find((e) => DEFENSE_ENEMIES[e.type]?.boss);
    if (bossEv && !inWave) {
      body.append(el('div.small.df-note', {}, el('b.amber', 'Boss tip: '),
        `set one or two towers deep on the ${this.lanes[bossEv.lane].name.replace(/lane/i, 'path')} to `, el('b', TARGET_RULE_LABEL.strongest),
        '; keep the rest on ', el('b', TARGET_RULE_LABEL.first), '. A Vine Snare cancels its charge.'));
    }

    // New enemy notes
    if (!inWave) {
      const types = new Set(this.wave.perLane.flatMap((m) => [...m.keys()]));
      const fresh = [...types].filter((t) => isNewType(t, night));
      for (const tpe of fresh) {
        const d = DEFENSE_ENEMIES[tpe];
        body.append(el('div.small.df-note', {}, el('b.amber', `${d.name}: `), d.note || d.role));
      }
    }

    // Modifiers
    const mods = [];
    if (night > 1) mods.push(`Enemies are tougher every night (+${Math.round((this.hpMult - 1) * 100)}% health tonight)`);
    const t = tn;
    if (t.enemyCount !== 1) {
      const wm = Math.max(CONFIG.waveSizeFloor ?? 0, t.enemyCount);
      const capped = t.enemyCount <= (CONFIG.waveSizeFloor ?? 0) + 1e-6;
      mods.push(`${Math.round(Math.abs(1 - wm) * 100)}% ${wm < 1 ? 'fewer' : 'more'} enemies${capped ? ` (−${Math.round((1 - CONFIG.waveSizeFloor) * 100)}% is the most)` : ''}`);
    }
    if (t.enemySpeed !== 1) mods.push(`Enemies move ${Math.round(Math.abs(t.enemySpeed - 1) * 100)}% ${t.enemySpeed > 1 ? 'faster' : 'slower'}`);
    if (t.laneSlow) mods.push(`${(this.lanes[t.laneSlow.lane]?.name || 'Path').replace(/lane/i, 'path')}: enemies ${Math.round((1 - t.laneSlow.mult) * 100)}% slower`);
    if (t.towerRate !== 1) mods.push(`Towers attack ${Math.round((t.towerRate - 1) * 100)}% faster`);
    if (t.towerDamage !== 1) mods.push(`Towers deal ${Math.round((t.towerDamage - 1) * 100)}% more damage`);
    if (t.freeUpgrades > 0) mods.push(`${t.freeUpgrades} free tower upgrade${t.freeUpgrades > 1 ? 's' : ''} left`);
    const skills = run.skills.filter((k) => SKILLS[k]?.night);
    const relics = run.relicNightLines?.() || [];   // relics that work at night, with live values (src/data/relics.js)
    if (mods.length || skills.length || relics.length) {
      body.append(el('div.df-mods', {}, el('div.df-tag', 'Also tonight'),
        mods.map((m) => el('div.small', '• ' + m)),
        skills.map((k) => el('div.small.accent', { title: SKILLS[k].desc }, `${SKILLS[k].icon || '◆'} ${SKILLS[k].name}: ${SKILLS[k].num || SKILLS[k].desc}`)),
        relics.map((r) => el('div.small.df-relic', { title: relicTitle(r.id) }, relicIcon(this.game, r.id, 11), ` ${r.name}: ${r.text}`,
          r.down ? el('span.rl-down', ` · ${r.down}`) : null))));
    }
    if (!inWave) body.append(el('div.small.muted.df-note', 'Click a glowing square to build. Click a tower to upgrade it.'));
  }

  _renderFoot(foot) {
    const run = this.run;
    const prep = this.phase === 'prep';
    // Intel and trades go in the body under the must-see blocks (paths, danger, rewards, the coach hint), not in the
    // pinned footer (QA 8 P1-2 / P2-1: with both up, the footer left the second path below the fold).
    const acts = el('div.df-prepacts');
    if (prep && this.sideMode === 'preview' && run.res.intel > 0) {
      // Intel: Decrypt (→ Research Data) and Sabotage (smaller wave, once per night). Shown with the
      // wave preview only, and only once you have Intel (a newcomer never sees two dead buttons).
      const I = CONFIG.intel;
      const dCost = run.decryptCost();
      const dReason = run.missing(dCost);
      const sReason = run.sabotageBlocked();
      const cut = Math.round((1 - I.sabotageWave) * 100);
      acts.append(el('div.df-intel', {},
        button(el('span', {}, 'Read ', costLine(dCost, run.res), el('span.df-arrow', ` → +${I.decryptResearch} Research`)), () => this._decrypt(), {
          disabled: !!dReason, cls: 'df-half',
          title: `Read Intel: spend ${I.decryptCost} Intel for ${I.decryptResearch} Research (kept forever; spend it on new gear in Collection).${dReason ? ` ${dReason}.` : ''}`,
        }),
        button(el('span', {}, 'Disrupt ', costLine(run.sabotageCost(), run.res), el('span.df-arrow', ` → −${cut}% enemies`)), () => this._sabotage(), {
          disabled: !!sReason, cls: 'df-half',
          title: `Disrupt the attack: spend ${I.sabotageCost} Intel for ${cut}% fewer enemies tonight (once per night).${sReason ? ` ${sReason}.` : ''}`,
        })));
    }
    // Late-game Scrap sink: trade Scrap for a Circuit or Biofiber (DEFENSE.exchange), with the wave preview,
    // once you hold enough Scrap for it to matter.
    const X = DEFENSE.exchange;
    if (this.phase === 'prep' && this.sideMode === 'preview' && run.res.scrap >= X.showAt && run.exchangeLeft() > 0) {
      // One row: "Trade [⚙35 → ▣1] [⚙35 → ✿1]" (critic M2 P0-1: two-line buttons ate the enemy list's room).
      acts.append(el('div.df-intel.df-exchange', {}, el('span.df-xlbl', 'Trade'), X.gives.map((k) => button(
        el('span', {}, costLine({ scrap: X.scrap }, run.res), el('span.df-arrow', '→'), costLine({ [k]: 1 })),
        () => this._exchange(k), { cls: 'df-half', title: `Trade ${X.scrap} Scrap for 1 ${k === 'circuits' ? 'Circuit' : 'Biofiber'} (${run.exchangeLeft()} trade${run.exchangeLeft() === 1 ? '' : 's'} left tonight).` }))));
    }
    if (acts.childNodes.length) {
      const body = this.sideBody;
      const at = this.hintDock.parentNode === body ? this.hintDock.nextSibling
        : [...body.querySelectorAll(':scope > .df-lane, :scope > .df-threat1, :scope > .df-boons, :scope > .df-zapline')].pop()?.nextSibling;
      body.insertBefore(acts, at || this._moreCue || null);
    }
    // Repair and Emergency Patch: side by side as half buttons when both show (keeps the footer short
    // so the wave preview above keeps its room), full width otherwise. Repairs work in prep and lulls.
    const patchOn = run.hasSkill('emergency_patch') && (prep || DEFENSE.emergencyPatchInWave) && ['prep', 'wave', 'lull'].includes(this.phase);
    const damaged = run.relayHp < run.relayMax;   // Repair shows only when there is something to repair
    const halves = this.canBuild && patchOn && damaged;
    const pair = halves ? el('div.df-intel') : foot;
    if (this.canBuild && damaged) {
      const full = run.relayHp >= run.relayMax;
      const cost = run.repairCost();
      const reason = full ? 'Relay at full health' : run.missing(cost);
      const label = halves
        ? (full ? el('span', {}, 'Repair', el('span.muted', ' Relay full')) : el('span', {}, `Repair +${run.repairAmount()} HP `, costLine(cost, run.res)))
        : (full ? el('span', {}, 'Repair (Relay full)') : el('span', {}, `Repair +${run.repairAmount()} HP `, costLine(cost, run.res)));
      pair.append(button(label, () => this._repair(), {
        disabled: !!reason, hotkey: full || halves ? null : 'R', cls: halves ? 'df-half' : 'df-wide',
        title: `${CONFIG.relay.repairScrap} Scrap restores ${CONFIG.relay.repairAmount} HP; near full health you pay only for the HP restored (R).${reason ? ` ${reason}.` : ''}`,
      }));
    }
    if (patchOn) {
      const used = run.tonight.emergencyPatchUsed;
      const full = run.relayHp >= run.relayMax;
      const reason = used ? 'Already used tonight' : full ? 'Relay at full health' : null;
      const label = halves ? el('span', {}, 'Patch +15', el('span.good', ' free')) : 'Emergency Patch +15 (free)';
      pair.append(button(label, () => this._patch(), { disabled: !!reason, reason, cls: halves ? 'df-half' : 'df-wide', title: `Emergency Patch: ${SKILLS.emergency_patch.desc}` }));
    }
    if (halves) foot.append(pair);
    // (The night-1 Relay zap line is in the wave preview's body now: _renderPreview.)
    if (prep) {
      // Readiness (critic K §4.6 / L §6.2): per path and a predicted Relay loss from the night forecast;
      // a weak defense asks before starting.
      const r = this._readiness();
      const armed = this.startArmed && this.game.time < this.startArmed;
      // Not while picking or placing a tower (critic M2 P0-1: not actionable then, and it hid half the build list).
      const showRd = this.sideMode === 'preview';   // (a selected tower pins its Upgrade / Sell here instead, QA 8 P1-2)
      const say = {
        weak: this.towers.length ? 'Too weak: expect heavy damage' : 'No towers yet: enemies will walk right in',
        risky: 'Risky: the Relay will take damage',
        strong: 'Looks strong',
      }[r.level];
      const dots = (n) => '●'.repeat(n) + '○'.repeat(3 - n);
      const expect = r.hi <= 0 ? 'Expect no Relay damage'
        : r.hi >= run.relayHp ? `Expect −${Math.min(r.lo, Math.round(run.relayHp))} or worse: the Relay may fall`
        : r.lo <= 0 ? `Expect up to −${r.hi} Relay health` : `Expect −${r.lo} to −${r.hi} Relay health`;
      if (showRd) foot.append(el(`div.df-rd-line.${r.level}`, {
        title: `Forecast: tonight's pushes replayed against your towers' damage, the stretch of path each one covers, slows and tanks, and the Relay's own zap (${RELAY_ZAP.range} tiles round it)${this.protocols.keys.length ? ', counting your Relay Protocols' : ''}. Predicted Relay loss ~${r.lost}.`,
      },
      el('span.df-rd-k', 'Your defense'),
      el('span.df-meter', {}, [0, 1, 2].map((n) => el(`i${n <= ({ weak: 0, risky: 1, strong: 2 })[r.level] ? '.on' : ''}`))),
      el('span.df-rd-t', say)));
      // The weakest path names what gets through it (critic K2 #8: the forecast's top leaker; every path's in its tooltip).
      // Two short lines (critic M P1-6, was one run-on): the weakest path, its dots and what gets through it (else every
      // path's dots), then the expected Relay loss. Every path's dots and damage stay in the tooltips.
      const worst = r.lanes.reduce((w, l) => (l.top && l.dots <= 1 && (!w || l.lost > w.lost) ? l : w), null);
      const laneTip = (l) => `${l.name}: about ${l.lost} Relay damage from this path${l.top ? `, most of it from ${leakName(l.top, true)}` : ''}`;
      if (showRd) foot.append(el('div.small.df-rd-lanes', {},
        worst
          ? el('div.df-rd-lane', { title: r.lanes.map((l) => `${l.short} ${dots(l.dots)}`).join(' · ') + `\n${laneTip(worst)}` },
            `${worst.short} `, el(`b.df-rd-dots.d${worst.dots}`, dots(worst.dots)), el('span.bad', ` ${leakName(worst.top, true)}`))
          : el('div', {}, r.lanes.map((l, i) => el('span.df-rd-lane', { title: laneTip(l) }, i ? ' · ' : '', `${l.short} `, el(`b.df-rd-dots.d${l.dots}`, dots(l.dots))))),
        el('div.muted', expect)));
      foot.append(button(el('span', {}, armed ? '▶ Start anyway' : '▶ Start Wave'), () => this._tryStartWave('button'), { hotkey: armed ? 'Shift+Space' : 'Space', cls: `primary big df-wide df-start${armed ? ' df-armed' : ''}` }));
    } else if (this.phase === 'lull') {
      // Between pushes: the countdown, and the call-early button (+Scrap for the time skipped).
      const bonus = this._callBonus();
      foot.append(el('div.small.amber', `Push ${this.pushIdx + 2} of ${this.wave.pushes} in ${Math.ceil(this.lullT)} s: build and repair now.`));
      const per = DEFENSE.callEarly.every === 1 ? 'second' : `${DEFENSE.callEarly.every} s`;
      foot.append(button(el('span', {}, '▶ Call next push', bonus > 0 ? el('span.good', ` +${bonus} Scrap`) : null), () => this.callNextPush(),
        { hotkey: 'N', cls: 'primary big df-wide df-start df-callnext', title: `Start the next push now: +${DEFENSE.callEarly.scrap} Scrap for every ${per} of the lull you skip.` }));
    } else if (this.phase === 'wave') {
      const P = this.wave.pushes || 1;
      const canCall = this._canCallEarly();
      foot.append(el('div.small.muted', P > 1
        ? `Push ${this.pushIdx + 1} of ${P}. You can build in the lull after it.${this.night >= 2 ? ' Targeting can change any time.' : ''}`
        : this.night >= 2 ? "You can't build until the attack ends. You can still change a tower's targeting." : "You can't build until the attack ends."));
      if (canCall) {
        foot.append(button(el('span', {}, '▶ Call next push now', el('span.good', ` +${this._callBonus()} Scrap`)), () => this.callNextPush(),
          { hotkey: 'N', cls: 'df-wide df-callnext', title: 'Skip the lull: the next push starts while these enemies are still on the field.' }));
      }
    }
  }

  /** Scrap paid for calling the next push now (DEFENSE.callEarly: per `every` s of lull skipped). */
  _callBonus() {
    const C = DEFENSE.callEarly;
    const left = this.phase === 'lull' ? this.lullT : DEFENSE.lull;
    return Math.floor(Math.max(0, left) / C.every) * C.scrap;
  }

  /** The current push has finished spawning and another one follows: it can be called early. */
  _canCallEarly() {
    return this.phase === 'wave' && this.pushIdx < (this.wave.pushes || 1) - 1 && this._pushSpawned();
  }

  _exchange(kind) {
    const run = this.run;
    if (this.phase !== 'prep') return;
    if (!run.exchange(kind)) { this.game.sfx.play('error'); toast(this.game.ui, run.exchangeLeft() ? run.missing({ scrap: DEFENSE.exchange.scrap }) : 'No more trades tonight', 'bad'); return; }
    this.game.sfx.play('trade');
    toast(this.game.ui, `Traded ${DEFENSE.exchange.scrap} Scrap for 1 ${kind === 'circuits' ? 'Circuit' : 'Biofiber'}`, 'good', 2);
    this._saveBuild();
    this.sideDirty = true;
    this._refreshTop();
  }

  /** Save after a build action: a 'prep' snapshot in prep, a lull 'wave' snapshot (resumes at the next push) in a lull. */
  _saveBuild() {
    if (this.phase === 'prep') this.run.save('prep');
    else if (this.phase === 'lull') { this.run.wavePush = this.pushIdx + 1; this.run.save('wave'); }
  }

  // =================================================================== actions

  _towerOn(pad) { return pad >= 0 ? this.towers.find((t) => t.rec.pad === pad) || null : null; }

  _select(pad) {
    if (this.selPad !== pad) this.sellArmed = null;
    this.selPad = pad;
    this.placing = null;
    this.sideDirty = true;
  }

  _build(type, pad) {
    const run = this.run;
    const game = this.game;
    if (!this.canBuild || pad < 0 || this._towerOn(pad)) return false;
    const cost = run.buildCost(type);
    if (!run.canAfford(cost)) { game.sfx.play('error'); toast(game.ui, run.missing(cost), 'bad'); return false; }
    const rec = run.build(type, pad);
    if (!rec) { game.sfx.play('error'); return false; }
    const t = new Tower(this, rec);
    this.towers.push(t);
    game.sfx.play('build');
    this.fx.ring(t.pos, { color: '#feae34', radius: 0.9, life: 0.35 });
    this.fx.burst(t.pos, { color: '#c0cbdc', color2: '#feae34', count: 14, speed: 2, up: 3, life: 0.5, size: 0.07, y: 0.3 });
    if (rec.refunded) toast(game.ui, 'Efficient Assembly: +1 Circuit back', 'good');
    this._saveBuild();
    this.selPad = pad;
    this.placing = null;
    this.hoverType = null;
    this.sideDirty = true;
    this._refreshTop();
    return true;
  }

  /** Upgrade a tower; at the level-3 branch point `branch` ('a' | 'b') is required (the U key asks). */
  _upgrade(t, branch) {
    const run = this.run;
    const game = this.game;
    if (!this.canBuild || !t) return;
    const branches = run.upgradeBranches(t.rec);
    if (branches && !BRANCH_KEYS.includes(branch)) {
      toast(game.ui, `Level 3: pick ${Object.values(branches).map((b) => b.name).join(' or ')} in the panel`, 'amber', 2.4);
      return;
    }
    const cost = run.upgradeCost(t.rec, branch);
    if (!cost) { toast(game.ui, 'Already at max level', 'amber'); return; }
    if (!run.canAfford(cost)) { game.sfx.play('error'); toast(game.ui, run.missing(cost), 'bad'); return; }
    const free = Object.keys(cost).length === 0;
    if (!run.upgrade(t.rec, branch)) { game.sfx.play('error'); return; }
    t.refreshVisual();
    game.sfx.play('upgrade');
    this.fx.ring(t.pos, { color: '#fee761', radius: 1.1, life: 0.45 });
    this.fx.burst(t.pos, { color: '#fee761', color2: '#feae34', count: 18, speed: 1.6, up: 4, life: 0.6, size: 0.07, y: 0.5 });
    const bn = branchOf(t.rec)?.name;
    this.fx.text(t.pos, bn ? bn.toUpperCase() : `LEVEL ${t.rec.level}`, { color: '#fee761', cls: 'big', y: this.padBaseY + t.height + 0.7, life: 1 });
    if (free) toast(game.ui, 'Free upgrade used', 'good');
    this._saveBuild();
    this.sideDirty = true;
    this._refreshTop();
  }

  _sell(t) {
    const run = this.run;
    const game = this.game;
    if (!this.canBuild || !t) return;
    if (!this.sellArmed || this.sellArmed.pad !== t.rec.pad) {
      this.sellArmed = { pad: t.rec.pad, until: game.time + DEFENSE.sellConfirm };
      this.sideDirty = true;
      return;
    }
    this.sellArmed = null;
    const v = run.sell(t.rec);
    t.dispose();
    this.towers.splice(this.towers.indexOf(t), 1);
    game.sfx.play('sell');
    this.fx.burst(t.pos, { color: '#c0cbdc', count: 12, speed: 2, up: 2.5, life: 0.4, size: 0.07, y: 0.3 });
    this.fx.text(t.pos, '', { html: `+${v} ${resIconHtml('scrap')}`, color: '#c0cbdc', y: this.padBaseY + t.height + 0.4 });
    this._saveBuild();
    this.sideDirty = true;
    this._refreshTop();
  }

  _setTarget(t, rule) {
    if (!t || !TARGET_RULES.includes(rule)) return;
    t.rec.target = rule;
    this._saveBuild();
    this.sideDirty = true;
  }

  _repair() {
    const run = this.run;
    const game = this.game;
    if (!this.canBuild) return;
    if (run.repairAmount() <= 0) { toast(game.ui, 'Relay at full health', 'amber'); return; }
    if (!run.canAfford(run.repairCost())) { game.sfx.play('error'); toast(game.ui, run.missing(run.repairCost()), 'bad'); return; }
    const before = run.relayHp;
    if (!run.repair()) return;
    game.sfx.play('repair');
    this.fx.burst(this.corePos, { color: '#2ce8f5', color2: '#63c74d', count: 16, speed: 1.5, up: 3, life: 0.6, size: 0.07, y: 1 });
    this.fx.text(this.corePos, `+${Math.round(run.relayHp - before)} HP`, { color: '#63c74d', cls: 'big', y: 3 });
    this._saveBuild();
    this.sideDirty = true;
    this._refreshTop();
  }

  _decrypt() {
    const run = this.run;
    const game = this.game;
    if (this.phase !== 'prep') return;
    if (!run.decrypt(game)) { game.sfx.play('error'); toast(game.ui, run.missing(run.decryptCost()) || 'Can\'t decrypt now', 'bad'); return; }
    run.save('prep');
    game.sfx.play('decrypt');
    toast(game.ui, `Decrypted Intel: +${CONFIG.intel.decryptResearch} Research Data`, 'good', 2.2);
    this.sideDirty = true;
    this._refreshTop();
  }

  _sabotage() {
    const run = this.run;
    const game = this.game;
    if (this.phase !== 'prep') return;
    const why = run.sabotageBlocked();
    if (why || !run.sabotage()) { game.sfx.play('error'); toast(game.ui, why || 'Can\'t sabotage now', 'bad'); return; }
    const before = this.wave.total;
    this.wave = buildWave(run, this._waveOpts());
    run.save('prep');
    game.sfx.play('sabotage');
    toast(game.ui, `Sabotage: ${before - this.wave.total} fewer enemies tonight`, 'good', 2.4);
    this.sideDirty = true;
    this._refreshTop(true);
  }

  _patch() {
    const run = this.run;
    const before = run.relayHp;
    if (!run.emergencyPatch()) { this.game.sfx.play('error'); return; }
    this.game.sfx.play('repair');
    this.fx.text(this.corePos, `+${Math.round(run.relayHp - before)} HP`, { color: '#63c74d', cls: 'big', y: 3 });
    this.fx.ring(this.corePos, { color: '#63c74d', radius: 2, life: 0.5 });
    this.sideDirty = true;
    this._refreshTop();
  }

  togglePause(force) {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.paused = force ?? !this.paused;
    setToastsPaused(this.game.ui, this.paused);
    if (this.paused && !this.pauseOv) {
      const body = el('div', {},
        el('p', `Night ${this.night} · ${this.phase === 'prep' ? 'Preparation' : 'Wave in progress'}`),
        el('p.small.muted', this.phase === 'prep'
          ? 'Your run is saved. Quitting returns to the title; Continue resumes this preparation as you left it.'
          : 'Your run was saved when this wave began. If you quit, Continue restarts the wave with the same towers and the Relay health it started with; the build can\'t be changed.'),
        el('p.small.muted', {}, el('span.key', 'Esc'), ' resume · ', el('span.key', 'F'), ' speed · ', el('span.key', 'Space'), ' start / pause'));
      // Resume first and loudest, the destructive choice last.
      this.pauseOv = modal(this.game.ui, 'Paused', body, [
        button('Resume', () => this.togglePause(false), { cls: 'primary', hotkey: 'Esc' }),
        button('Settings', () => {
          if (this.settingsOpen) return;
          // Hide the pause dialog while Settings is open (it showed through the settings overlay).
          if (this.pauseOv) this.pauseOv.style.display = 'none';
          this.settingsOpen = openSettingsOverlay(this.game, { onClose: () => { this.settingsOpen = null; this._skipInput = true; if (this.pauseOv) this.pauseOv.style.display = ''; } });
        }),
        button('Quit to Title', () => this._confirmQuit(), { cls: 'danger' }),
      ]);
      this.pauseOv.classList.add('x-pause');
      // In prep, a click on the dimmed map outside the dialog just closes it (Esc there is often a
      // "deselect" reflex; the next pad click must not land on a menu button).
      this.pauseOv.addEventListener('mousedown', (ev) => {
        if (ev.target === this.pauseOv && this.phase === 'prep' && !this.settingsOpen) this.togglePause(false);
      });
    } else if (!this.paused && this.pauseOv) {
      this.pauseOv.remove();
      this.pauseOv = null;
      this.confirmOv?.remove();
      this.confirmOv = null;
    }
    this._refreshTop(true);
  }

  /** Quitting needs a second, deliberate click (a stray pad click must never quit the run). */
  _confirmQuit() {
    this.confirmOv?.remove();
    const body = el('div.col', {},
      el('p', 'Quit to the title screen?'),
      el('p.muted.small', this.phase === 'prep'
        ? 'Your preparation is saved; Continue resumes it as you left it.'
        : 'Continue restarts this wave with the same towers and the Relay health it began with.'));
    this.confirmOv = modal(this.game.ui, 'Quit to title?', body, [
      button('Keep playing', () => { this.confirmOv?.remove(); this.confirmOv = null; }, { cls: 'primary' }),
      button('Quit to title', () => this.game.go('title'), { cls: 'danger' }),
    ]);
    this.confirmOv.classList.add('x-pause');
  }

  /**
   * The night begins. `fromPush` > 0 (Continue from a lull snapshot) skips the pushes already fought and
   * re-enters the lull before that push.
   */
  startWave(fromPush = 0) {
    if (this.phase !== 'prep') return;
    const game = this.game;
    this.waveTime = 0;
    this.wave = buildWave(this.run, this._waveOpts());
    this.events = this.wave.events;
    this.totalEnemies = 0;
    this.resolved = 0;
    this.startHp = this.run.relayHp;
    this.protocols.cancelAim();
    if (fromPush > 0) {
      // Earlier pushes count as done (the progress bar and "to go" include them as resolved).
      const i = this.events.findIndex((e) => e.push >= fromPush);
      this.spawnIdx = i < 0 ? this.events.length : i;
      this.totalEnemies = this.resolved = this.spawnIdx;
      this.pushIdx = fromPush - 1;
      this._enterLull(false);
    } else {
      this.spawnIdx = 0;
      // Snapshot with the build locked: quitting mid-push restarts the night (or the lull it reached).
      this.run.wavePush = 0;
      this.run.save('wave');
      if (!game.meta.hints?.relay_zap && !this.run.debug) { game.meta.hints.relay_zap = true; game.saveMeta(); }
      game.sfx.play('wave_horn');
      toast(game.ui, `Night ${this.night}: they're coming!`, 'bad', 2);
      this._startPush(0);
    }
    this.sideDirty = true;
    this._refreshTop(true);
  }

  /** Push `k` starts spawning (DEFENSE: lulls between pushes, call-early bonus). */
  _startPush(k) {
    const game = this.game;
    this.phase = 'wave';
    this.pushIdx = k;
    this.pushT = 0;
    this.lullT = 0;
    this.placing = null;
    this.hoverType = null;
    if (this.selPad >= 0 && !this._towerOn(this.selPad)) this.selPad = -1;
    this.sellArmed = null;
    for (const p of this.pads) p.marker.visible = false;
    if (k > 0) {
      game.sfx.play('wave_horn');
      toast(game.ui, `Push ${k + 1} of ${this.wave.pushes}: here they come!`, 'bad', 1.8);
    }
    this.spaceGuardT = game.time + DEFENSE.startGuard.pauseGrace;   // a double-tap Space doesn't start-then-pause
    this.sideDirty = true;
    this._refreshTop(true);
  }

  /** Every enemy of the current push has spawned. */
  _pushSpawned() {
    return !this.events || this.spawnIdx >= this.events.length || this.events[this.spawnIdx].push > this.pushIdx;
  }

  /** The current push is over (spawned out, field clear): a lull before the next one. Saves a lull snapshot. */
  _enterLull(save = true) {
    this.phase = 'lull';
    this.lullT = DEFENSE.lull;
    this.selPad = this._towerOn(this.selPad) ? this.selPad : -1;
    this.sideDirty = true;
    if (save) {
      this.run.wavePush = this.pushIdx + 1;
      this.run.save('wave');
      this.game.sfx.play('push_held');
      toast(this.game.ui, `Push ${this.pushIdx + 1} held! Build, upgrade or repair before the next one.`, 'good', 2.6);
    }
    this._refreshTop(true);
  }

  /** "Call next push": from a lull (+Scrap for the lull time skipped) or once this push has spawned out (full bonus). */
  callNextPush() {
    if (!(this.phase === 'lull' || this._canCallEarly())) return false;
    const bonus = this._callBonus();
    if (bonus > 0) {
      this.run.add({ scrap: bonus });
      this.nightStats.callEarly += bonus;
      this.game.sfx.play('coins');
      this.fx.text(this.corePos, '', { html: `+${bonus} ${resIconHtml('scrap')}`, color: '#63c74d', cls: 'big', y: 3.4, life: 1 });
    }
    this._startPush(this.pushIdx + 1);
    return true;
  }

  // =================================================================== combat hooks (entities call these)

  enemySpeedMult(laneIndex) {
    const t = this.run.tonight;
    let m = t.enemySpeed || 1;
    if (t.laneSlow && t.laneSlow.lane === laneIndex) m *= t.laneSlow.mult;
    return m;
  }

  spawnEnemy(type, lane, opts = {}) {
    const e = new DefenseEnemy(this, type, lane, { hpMult: this.hpMult, ...opts });
    this.enemies.push(e);
    if (!this.seenTypes.has(type)) {
      this.seenTypes.add(type);
      const d = DEFENSE_ENEMIES[type];
      if (isNewType(type, this.night) && type !== 'seedling' && !d.boss) toast(this.game.ui, `New: ${d.name} — ${d.note || d.role}`, 'amber', 3.5);
    }
    if (e.boss) {
      this.boss = e;
      this.bossBox.style.display = '';
      this.game.sfx.play('boss_roar');
      this.game.shake(4, 0.4);
      toast(this.game.ui, `☠ The ${DEFENSE_ENEMIES[type].name} approaches on the ${this.lanes[lane].name}!`, 'bad', 3);
      this._bossEntry = { lane, until: this.game.time + DEFENSE.bossEntry };
    }
    return e;
  }

  /**
   * Apply damage from a tower / zone / protocol. Handles numbers, boss research and kills.
   * opts: { source (tower, credited), crit, silent, pierce (ignores resistances), protocol }.
   */
  damage(e, amount, type, opts = {}) {
    if (!e || e.dead || e.removed || amount <= 0) return 0;
    // Seed Carrier blast tag (critic K #9): any blast hit in its last few seconds destroys the seeds.
    if (type === 'blast') e.blastT = this.waveTime;
    // Thorn Coating (a Workbench tower mod, crafting.js): more damage to slowed / rooted / stunned enemies.
    const sb = opts.source?.stats?.slowedBonus;
    if (sb && (e.slowMult < 0.999 || e.slows?.size > 0 || e.rootT > 0 || e.stunT > 0)) amount *= sb;
    // Vine Snare protocol: enemies it holds take more damage while it lasts (DefenseProtocols, PROTOCOLS.vine_snare.rootDamage).
    if (e.snaredUntil != null && this.waveTime <= e.snaredUntil) amount *= e.snareDmg || 1;
    // Relics (Run.relicHitMult): Rusted Bell vs Razorbacks / Ruin Guards, Cracked Lens on a tower's first hit each push.
    if (opts.source?.rec && this.run.relicHitMult) amount *= this.run.relicHitMult(opts.source, e.type, this.pushIdx);
    const dealt = e.hit(amount, type, opts);
    if (opts.source) opts.source.dmgDealt = (opts.source.dmgDealt || 0) + dealt;
    if (!opts.silent && (dealt >= DEFENSE.damageNumbersMin || opts.crit) && this.fx.texts.length < DEFENSE.maxFloatingText) {
      const resisted = (e.def.resist?.[type] ?? 1) < 1;
      // Rapid hits on one enemy merge into one rising number (key = the enemy); crits pop bigger.
      this.fx.text(e.pos, String(Math.round(dealt)), {
        color: opts.crit ? '#feae34' : resisted ? '#6fd3ff' : '#ead4aa', cls: opts.crit ? 'crit' : '', y: e.height + 0.45, life: 0.6, rise: 0.6,
        key: opts.crit ? null : e, value: dealt,
      });
    }
    if (e.boss) {
      this.run.awardBossDamage(this.game, 1 - e.hp / e.maxHp);
      this.run.stats.bossDamage = Math.max(this.run.stats.bossDamage || 0, Math.round(e.maxHp - e.hp));
    }
    if (e.dead) this._kill(e);
    return dealt;
  }

  _kill(e) {
    const run = this.run;
    const d = e.def;
    run.stats.kills += 1;
    if (d.bounty) {
      // Fractional bounties accumulate; whole Scrap is paid as it adds up.
      this._bountyAcc = (this._bountyAcc || 0) + d.bounty * (run.bountyMult?.() ?? 1);   // Salvage King: ×2
      const pay = Math.floor(this._bountyAcc + 1e-6);
      if (pay > 0) {
        this._bountyAcc -= pay;
        run.add({ scrap: pay });
        this.bountyEarned = (this.bountyEarned || 0) + pay;
        if (this.fx.texts.length < DEFENSE.maxFloatingText) this.fx.text(e.pos, '', { html: `+${pay} ${resIconHtml('scrap')}`, color: '#c0cbdc', y: e.height + 0.9, life: 0.7, rise: 0.5 });
      }
    }
    this.fx.burst(e.pos, { color: d.color || '#3e8948', color2: '#181425', count: e.boss ? 60 : 10 + Math.round((d.size || 0.6) * 6), speed: e.boss ? 5 : 2.4, up: 3, life: 0.6, size: e.boss ? 0.14 : 0.08, y: e.height * 0.4 });
    // Death beat: a flash, the sprite squashes and pops (Fx.corpse), and a splat stays on the grass.
    this.fx.flash({ x: e.pos.x, y: e.height * 0.45, z: e.pos.z }, { color: d.color || '#ead4aa', size: 0.45 + (d.size || 0.6) * 0.4, life: 0.07 });
    this.fx.splat(e.pos, e.type, d.size || 0.6);   // its kind of splat (critic H2 §3), the same as by day
    if (!e.burrowed) this.fx.corpse(e.detachVisual(), { dx: e.dir.x, dz: e.dir.z });
    this.game.sfx.playAt((d.size || 0.6) >= 1 && !e.boss ? 'death_big' : 'enemy_die', e.pos.x, e.pos.z);
    // Seed Carrier: bursts into seedlings unless the killing blow was a blast, or a blast hit it within its
    // last `blastTag` seconds (critic K #9: another tower almost always landed the last hit).
    const od = d.onDeath;
    if (od) {
      const tagged = od.blastTag != null && e.blastT != null && this.waveTime - e.blastT <= od.blastTag;
      if (e.killedBy !== od.unlessDamageType && !tagged) {
        for (let i = 0; i < od.count; i++) {
          this.spawnEnemy(od.spawn, e.laneIndex, { dist: Math.max(0, e.dist + (i - (od.count - 1) / 2) * 0.35) });
          this.totalEnemies += 1;
        }
        this.fx.burst(e.pos, { color: '#feae34', color2: '#63c74d', count: 14, speed: 2.5, up: 3, life: 0.5, size: 0.08, y: 0.4 });
        if (this.fx.texts.length < DEFENSE.maxFloatingText) this.fx.text(e.pos, 'Seeds burst!', { color: '#feae34', y: e.height + 0.9, life: 0.9 });
      } else if (this.fx.texts.length < DEFENSE.maxFloatingText) {
        this.fx.text(e.pos, 'Seeds destroyed', { color: '#63c74d', y: e.height + 0.9, life: 0.9 });
      }
    }
    if (e.boss) {
      this.nightStats.bossKilled = true;
      run.stats.bossKilled = true;
      run.awardBossDamage(this.game, 1);
      this.game.shake(10, 0.6);
      this.game.sfx.play('boss_die');
      this.fx.ring(e.pos, { color: '#ff0044', radius: 4, life: 0.8 });
      // Boss down: white screen flash, hit-stop into half a second of slow motion, a multi-burst of
      // bark and heart-core embers, falling leaves and a big splat.
      this.game.flash('#ffffff', JUICE.defense.bossDeathFlash);
      this.fx.hitStop(JUICE.hitStop.bossDeath);
      this.fx.slowMo(JUICE.slowmo.bossDeath.time, JUICE.slowmo.bossDeath.scale);
      for (let i = 0; i < 4; i++) {
        const o = { x: e.pos.x + (Math.random() - 0.5) * 1.6, y: e.height * (0.3 + Math.random() * 0.5), z: e.pos.z + (Math.random() - 0.5) * 0.8 };
        this.fx.flash(o, { color: i % 2 ? '#ff0044' : '#feae34', size: 1.1, life: 0.1 + i * 0.03 });
        this.fx.burst(o, { color: '#ff0044', color2: '#feae34', count: 14, speed: 4, up: 4, life: 0.8, size: 0.1, y: 0 });
      }
      this.fx.burst(e.pos, { color: '#63c74d', color2: '#3e8948', count: 40, speed: 2.2, up: 5, gravity: 2.5, life: 2.2, size: 3 / 32, y: e.height * 0.8 });
      this.fx.ring(e.pos, { color: '#ffffff', radius: 6, life: 1 });
      this.fx.light(e.pos, { color: '#ff0044', intensity: 6, distance: 8, life: 0.6 });
      this.fx.decal(e.pos, { color: '#3e2731', radius: 1.6, life: 30 });
      toast(this.game.ui, `The ${d.name} falls!`, 'good', 3.5);
      this.bossBox.style.display = 'none';
    }
    e.remove();
    this.resolved += 1;
  }

  /** Damage an enemy deals on reaching the Relay. With `coreDamageMin` (the boss) it scales with the
   *  health it has left, so nearly killing it still pays off. */
  leakDamage(e) {
    const d = e.def;
    if (d.coreDamageMin == null) return d.coreDamage;
    return Math.round(d.coreDamageMin + (d.coreDamage - d.coreDamageMin) * Math.max(0, Math.min(1, e.hp / e.maxHp)));
  }

  enemyReachedCore(e) {
    const dmg = this.leakDamage(e);
    this._noteLeak(e.type, dmg, 1, e.laneIndex);
    this.coreHit(dmg);
    e.leaked = true;
    if (e.boss) this.bossBox.style.display = 'none';
    e.remove();
    this.resolved += 1;
  }

  /**
   * Relay damage bookkeeping for tonight (nightStats.leaks = count per enemy type, leakHp = damage per
   * source: an enemy type, 'sap' for Spitter globs, 'colossus' for siege slams). The leak feed / banner
   * breakdown read it.
   */
  _noteLeak(src, dmg, count = 1, lane = null) {
    const S = this.nightStats;
    S.leaks[src] = (S.leaks[src] || 0) + count;
    S.leakHp[src] = (S.leakHp[src] || 0) + dmg;
    // The board's live leak feed + the run's per-night tally (Results says why a run was lost).
    this._pushLeakFeed(src, dmg, lane);
    // run.lastNight.leaks = { enemy type: { count, damage } } (Run.finish → results "What got through");
    // Spitter sap counts as Spitter damage.
    const leaks = {};
    for (const k of Object.keys(S.leakHp)) {
      const type = k === 'sap' ? 'spitter' : k;
      const L = leaks[type] || (leaks[type] = { count: 0, damage: 0 });
      if (k !== 'sap') L.count += S.leaks[k] || 0;
      L.damage += S.leakHp[k] || 0;
    }
    this.run.lastNight = { night: this.night, leaks };
  }

  /**
   * Live leak feed (critic K §4.5 / item 8) in the side panel during pushes and lulls: "−15 Ruin Guard ·
   * South", newest first; sap globs and siege slams from one source merge while they keep landing.
   */
  _pushLeakFeed(src, dmg, lane) {
    this._leaks ||= [];
    const last = this._leaks[0];
    if (last && last.src === src && last.lane === lane && (src === 'sap' || src === 'colossus') && this.game.time - last.t < 3) {
      last.dmg += dmg; last.n += 1; last.t = this.game.time;
    } else this._leaks.unshift({ src, dmg, lane, n: 1, t: this.game.time });
    if (this._leaks.length > 8) this._leaks.length = 8;
    this._renderLeakFeed();
  }

  _renderLeakFeed() {
    const box = this.leakFeed;
    if (!box) return;
    const show = (this.phase === 'wave' || this.phase === 'lull') && !!this._leaks?.length;
    if (box.style.display !== (show ? '' : 'none')) box.style.display = show ? '' : 'none';
    if (show) {
      const total = Object.values(this.nightStats?.leakHp || {}).reduce((a, b) => a + b, 0);
      // In a lull the feed folds to its header (critic K2 §5: the build list needs the room); the rows are its tooltip.
      const rows = this.phase === 'lull' ? 0 : DEFENSE_VIEW.leakRows;
      if (this.phase === 'lull') box.dataset.tip = this._leaks.slice(0, 6).map((r) => `−${Math.round(r.dmg)} ${leakName(r.src)}${r.n > 1 ? ` ×${r.n}` : ''}${this.lanes[r.lane]?.short ? ` · ${this.lanes[r.lane].short}` : ''}`).join('<br>');
      else delete box.dataset.tip;
      box.replaceChildren(
        el('div.df-leakhead', {}, el('span.df-tag.bad', 'Got through'), el('span.grow'), el('span.bad', `−${Math.round(total)} tonight`)),
        ...this._leaks.slice(0, rows).map((r) => el('div.df-leakrow', {},
          el('span.df-leakhp', `−${Math.round(r.dmg)}`),
          el('span.df-leakname', `${leakName(r.src)}${r.n > 1 ? ` ×${r.n}` : ''}`),
          el('span.muted', this.lanes[r.lane]?.short ? ` · ${this.lanes[r.lane].short}` : ''))));
    }
    this._keepActInView();
  }

  /** Colossus siege slam (DefenseEnemy 'siege'): a shockwave from the plaza into the Relay. */
  bossSlam(boss, dmg) {
    this._noteLeak('colossus', dmg, 1, boss.laneIndex);
    this.fx.ring(boss.pos, { color: '#e43b44', radius: 2.4, life: 0.4, from: 0.5 });
    this.fx.burst(boss.pos, { color: '#8f563b', color2: '#5a6988', count: 18, speed: 3, up: 2, life: 0.5, size: 0.1, y: 0.05 });
    this.game.sfx.playAt('siege_slam', boss.pos.x, boss.pos.z);
    this.coreHit(dmg);
  }

  /** The Colossus used up its slams (siege.maxSlams): it collapses, spent. Resolved, not a kill. */
  bossSpent(boss) {
    this.nightStats.bossSpent = true;
    this.fx.burst(boss.pos, { color: '#8f563b', color2: '#3e8948', count: 40, speed: 2, up: 3, life: 1, size: 0.1, y: boss.height * 0.5 });
    this.fx.ring(boss.pos, { color: '#feae34', radius: 3, life: 0.7 });
    this.game.sfx.playAt('colossus_spent', boss.pos.x, boss.pos.z);
    toast(this.game.ui, 'The Colossus collapses, spent. The Relay held it off.', 'amber', 3.5);
    this.bossBox.style.display = 'none';
    boss.remove();
    this.resolved += 1;
  }

  /** A Spitter that has emptied its sap sac withers away (resolved, no kill or bounty). */
  enemyWithered(e) {
    this.fx.burst(e.pos, { color: '#b55088', color2: '#5a3c33', count: 12, speed: 1.2, up: 1.5, life: 0.6, size: 0.07, y: 0.3 });
    if (this.fx.texts.length < DEFENSE.maxFloatingText) this.fx.text(e.pos, 'withered', { color: '#b55088', y: e.height + 0.4, life: 0.9 });
    e.remove();
    this.resolved += 1;
  }

  /** Spitter sap: a lobbed glob that hurts the core when it lands. */
  spitAtCore(e, sp) {
    const from = new THREE.Vector3(e.pos.x, e.height * 0.7, e.pos.z);
    const to = new THREE.Vector3(this.corePos.x + (Math.random() - 0.5) * 0.8, 0.9, this.corePos.z + (Math.random() - 0.5) * 0.8);
    this.projectiles.lob(from, to, {
      time: sp.flight || 0.8, height: 2, look: 'sap',
      onLand: (p) => {
        this.fx.burst(p, { color: '#ff4d8d', color2: '#b55088', count: 10, speed: 2, up: 2, life: 0.4, size: 0.07, y: 0 });
        if (this.phase === 'wave') this._noteLeak('sap', sp.damage, 1, e.laneIndex);
        this.coreHit(sp.damage);
      },
    });
    this.game.sfx.playAt('lob', from.x, from.z);
  }

  coreHit(amount) {
    if (this.phase !== 'wave') return;
    const run = this.run;
    const game = this.game;
    run.relayHp = Math.max(0, run.relayHp - amount);
    flashVisual(this.coreVis, '#ff3040', 0.25);
    game.flash('#e43b44', Math.min(0.35, 0.1 + amount * 0.012));
    game.shake(Math.min(10, 2.5 + amount * 0.35), 0.25);
    game.sfx.play('relay_hit');
    this.coreHitT = 0.35;
    this.fx.burst(this.corePos, { color: '#e43b44', color2: '#2ce8f5', count: 10 + Math.min(30, amount * 2), speed: 2.5, up: 3, life: 0.5, size: 0.08, y: 1.2 });
    // Debris off the plinth, a shockwave ring on the plaza and a crystal flicker.
    this.fx.burst(this.corePos, { color: '#8b9bb4', color2: '#5a6988', count: 8 + Math.min(12, amount), speed: 3.5, up: 2.5, life: 0.6, size: 3 / 32, y: 0.3, gravity: 12 });
    this.fx.ring(this.corePos, { color: '#e43b44', radius: JUICE.defense.coreShock, life: 0.4, from: 0.6 });
    this.fx.flash({ x: this.corePos.x, y: 2.2, z: this.corePos.z + 0.05 }, { color: '#2ce8f5', size: 0.9, life: 0.08 });
    this.fx.hitStop(JUICE.hitStop.coreHit * Math.min(1, amount / 8));
    this.fx.text(this.corePos, `-${amount}`, { color: '#e43b44', cls: 'big', y: 3.2, life: 0.9 });
    this.relayBar.node.classList.remove('hit');
    void this.relayBar.node.offsetWidth;
    this.relayBar.node.classList.add('hit');
    if (run.relayHp <= 0) this._defeat();
  }

  bossCue(kind) {
    this.game.sfx.play(kind === 'enrage' ? 'boss_roar' : 'boss_cue');
    if (kind === 'charge') this.game.shake(3, 0.3);
    this._bossCues = this._bossCues || {};
    if (kind === 'enrage') {
      // The second act: a roar, a heavy shake and a red pulse; it turns red and loops faster.
      this.game.shake(7, 0.6);
      this.game.sfx.play('roots_burst');
      const b = this.boss;
      if (b && !b.removed) {
        this.fx.ring(b.pos, { color: '#e43b44', radius: 3.2, life: 0.7 });
        this.fx.burst(b.pos, { color: '#ff0044', color2: '#feae34', count: 36, speed: 3.5, up: 3, life: 0.7, size: 0.1, y: b.height * 0.6 });
      }
      this.game.flash('#e43b44', 0.18);
    }
    if (!this._bossCues[kind]) {
      this._bossCues[kind] = true;
      const snare = this.protocols?.keys.includes('vine_snare') ? ` A Vine Snare (${PROTOCOLS.vine_snare.hotkey}) on it cancels the charge.` : '';
      const msg = {
        root: 'The Colossus roots itself — Crawlers will sprout!',
        charge: `The Colossus is about to CHARGE along the red path!${snare}`,
        enrage: 'The Colossus is enraged! It charges faster, and Skitters sprout with its roots.',
        siege: 'The Colossus is slamming the Relay! Every slam hurts: kill it.',
      }[kind];
      toast(this.game.ui, msg, 'bad', kind === 'enrage' ? 3.2 : 2.6);
    }
  }

  bossRootSpawn(boss, type, count, radius, extra = null) {
    this.fx.ring(boss.pos, { color: '#63c74d', radius, life: 0.5 });
    this.fx.burst(boss.pos, { color: '#63c74d', color2: '#733e39', count: 30, speed: 3, up: 3, life: 0.6, size: 0.09, y: 0.1 });
    this.game.shake(3, 0.25);
    this.game.sfx.playAt('roots_burst', boss.pos.x, boss.pos.z);
    for (let i = 0; i < count; i++) {
      this.spawnEnemy(type, boss.laneIndex, { dist: boss.dist + 0.6 + i * 0.55 });
      this.totalEnemies += 1;
    }
    // Enraged: a pack of a second type sprouts too (spread just behind the first group).
    for (let i = 0; extra && i < extra.count; i++) {
      this.spawnEnemy(extra.type, boss.laneIndex, { dist: Math.max(0, boss.dist + 0.3 - i * 0.45) });
      this.totalEnemies += 1;
    }
  }

  lanePieces(lane, d0, d1) { return lane.pieces(d0, d1); }

  towerFired() { /* hook for future feedback (e.g. stats) */ }

  // =================================================================== end of night

  _endNight() {
    if (this.phase === 'won' || this.phase === 'lost') return;
    const game = this.game;
    const run = this.run;
    if (this.paused) this.togglePause(false);
    // Clear any remaining enemies (debug win) without awarding kills.
    for (const e of this.enemies) e.remove();
    this.enemies = [];
    this.projectiles.clear();
    const night = this.night;
    this.phase = 'won';
    this.protocols.cancelAim();
    // Relay HP lost tonight (from the night's start, or from the lull a Continue resumed at) → salvage picks.
    this.nightLost = Math.max(0, Math.round((this.startHp ?? run.relayHp) - run.relayHp));
    const best = this.towers.reduce((b, t) => ((t.dmgDealt || 0) > (b?.dmgDealt || 0) ? t : b), null);
    this._bestPad = best?.rec.pad ?? -1;
    run.wavePush = 0;
    this.result = run.nightSurvived(game);
    // Save right away (not after the banner) so quitting during it can't replay the night.
    if (this.result === 'victory') {
      this.finalResult = run.finish(game, true);
      this.finalResult.bossKilled = this.nightStats.bossKilled;
    } else {
      this.salvage = run.salvageOptions(this.nightLost, night);
      run.save('briefing');
    }
    game.sfx.play('night_won');
    const last = this.result === 'victory';
    // Long Night: holding night 6 is the run's win (Run.recordVictory), and the nights go on.
    const longWin = !last && run.isLongNight?.() && night === CONFIG.nights;
    this._banner(last || longWin ? 'THE RELAY HOLDS' : `NIGHT ${night} SURVIVED`,
      last
        ? (this.nightStats.bossKilled ? 'The Canopy Colossus is beaten. Dawn breaks over Verdant Relay.' : 'The Relay held the Colossus off. Dawn breaks over Verdant Relay.')
        : longWin ? `Night ${night} held: the run counts as a win. The Long Night goes on — how far can you get?`
        : `Relay ${Math.ceil(run.relayHp)} / ${run.relayMax} (−${this.nightLost} tonight) · everything you stored and built stays for tomorrow`,
      'good', last ? null : this._salvagePanel());
    // The banner waits for a click / Enter / Space (DEFENSE.bannerWait): an auto-advance could switch to the
    // briefing just as the player clicks the banner, and that click then lands on a district card (critic G #12).
    this.endTimer = DEFENSE.bannerWait ? Infinity : DEFENSE.endBanner + (last ? 1 : 0);
    this.sideDirty = true;
    this._refreshTop(true);
  }

  _defeat() {
    if (this.phase === 'won' || this.phase === 'lost') return;
    const game = this.game;
    if (this.paused) this.togglePause(false);
    this.phase = 'lost';
    this.protocols?.cancelAim();
    game.sfx.play('relay_fall');
    game.shake(12, 0.8);
    game.flash('#e43b44', 0.5);
    for (let i = 0; i < 4; i++) this.fx.burst(this.corePos, { color: '#2ce8f5', color2: '#e43b44', count: 40, speed: 4 + i, up: 5, life: 1, size: 0.12, y: 1.5 });
    this.fx.ring(this.corePos, { color: '#e43b44', radius: 5, life: 1 });
    // Close the run now (clears the save) so quitting during the banner can't undo the loss.
    this.finalResult = this.run.finish(game, false);
    this._banner('THE RELAY HAS FALLEN', `Night ${this.night} · the run is over`, 'bad');
    this.endTimer = DEFENSE.bannerWait ? Infinity : DEFENSE.defeatBanner;
    this.sideDirty = true;
    this._refreshTop(true);
  }

  _banner(title, sub, cls, extra = null) {
    this.bannerEl?.remove();
    // Any pointerdown while the banner is up is swallowed (window capture, so nothing under it reacts); after
    // DEFENSE.bannerMinTime it dismisses. The scene switches on the next frame, and the next screen (the
    // briefing) ignores the rest of this click — see BriefingScene._guardInput. A salvage pick card is the
    // exception: its click picks (and the banner waits for a pick when there is one to make).
    this.bannerT = 0;
    if (!this._bannerHooked) {
      this._bannerHooked = true;
      this._listen(window, 'pointerdown', (e) => {
        if (!this.bannerEl || (this.phase !== 'won' && this.phase !== 'lost')) return;
        if (e.target.closest?.('.df-salvage-card')) return;
        e.stopPropagation(); e.preventDefault();
        this._dismissBanner();
      }, true);
    }
    this.bannerHint = el('div.small.muted', this._salvagePending() ? `pick one to continue (${this.salvage.length > 1 ? `1–${this.salvage.length}` : '1'})` : 'click or press Enter to continue');
    // What got through tonight (critic K §4.5): "Got through: 4 Ruin Guards −40 · Spitter sap −20".
    const leaks = leakSummaryText(this.nightStats);
    this.bannerEl = el(`div.df-banner.${cls}.ui-block`, {},
      el('div.df-bannertitle', title), el('div.df-bannersub', sub),
      leaks ? el('div.df-leakline', {}, el('span.bad', 'Got through: '), leaks) : el('div.df-leakline.good', 'Nothing got through to the Relay.'),
      extra, this.bannerHint);
    this.uiRoot.append(this.bannerEl);
  }

  /** Continue past the end banner (once it has shown for DEFENSE.bannerMinTime, and a salvage pick is made). */
  _dismissBanner() {
    if ((this.bannerT || 0) < (DEFENSE.bannerMinTime || 0)) return;
    if (this._salvagePending()) {
      this.bannerEl?.querySelector('.df-salvage')?.classList.remove('df-nudge');
      void this.bannerEl?.offsetWidth;
      this.bannerEl?.querySelector('.df-salvage')?.classList.add('df-nudge');
      return;
    }
    this.endTimer = Math.min(this.endTimer, 0.01);
  }

  // ---- post-night salvage pick (critic K §9; SALVAGE in src/data/waves.js)

  _salvagePending() { return this.phase === 'won' && !!this.salvage?.length && this.salvagePicked == null; }

  /** The pick cards on the "Night survived" banner: more choices the less the Relay lost tonight. */
  _salvagePanel() {
    if (!this.salvage?.length) return null;
    const n = this.salvage.length;
    const why = n >= 3 ? 'A clean night: pick a reward.' : n === 2 ? 'Pick a reward (a cleaner night offers more).' : 'Salvage what you can (a cleaner night offers more choices).';
    return el('div.df-salvage', {}, el('div.small.amber', why), el('div.df-salvage-row', {}, this.salvage.map((k, i) => {
      const o = SALVAGE.options[k];
      return el('button.btn.df-salvage-card', { onclick: (ev) => { ev.stopPropagation(); this.pickSalvage(i); }, title: o.line },
        el('span.hotkey', String(i + 1)), el('b', o.name), el('span.small', o.line));
    })));
  }

  /** Take salvage option `i` (banner click, keys 1–3, or the balance sim). */
  pickSalvage(i) {
    if (!this._salvagePending()) return null;
    const key = this.salvage[i];
    if (!key) return null;
    const run = this.run;
    const note = run.applySalvage(key, this._bestPad);
    this.salvagePicked = key;
    run.save('briefing');
    this.game.sfx.play('salvage_pick');
    if (note) toast(this.game.ui, `Salvage: ${note}`, 'good', 2.6);
    this.bannerEl?.querySelectorAll('.df-salvage-card').forEach((b, j) => { b.classList.toggle('picked', j === i); b.classList.toggle('disabled', j !== i); });
    if (this.bannerHint) this.bannerHint.textContent = 'click or press Enter to continue';
    this.bannerT = Math.min(this.bannerT, 0);   // the pick click must not also dismiss the banner
    this._refreshTop(true);
    return key;
  }

  _finishTransition() {
    const game = this.game;
    const run = this.run;
    if (this.phase === 'won') {
      if (this.result === 'victory') game.go('results', { result: this.finalResult || run.finish(game, true) });
      else game.go('briefing');
    } else if (this.phase === 'lost') {
      game.go('results', { result: this.finalResult || run.finish(game, false) });
    }
  }

  // =================================================================== frame

  update(dt) {
    if (!this._alive) return;
    const game = this.game;

    if (this.phase === 'won' || this.phase === 'lost') {
      this.endTimer -= dt;
      this.bannerT = (this.bannerT || 0) + dt;
      const inp = game.input;
      if (inp.wasPressed('Enter') || inp.wasPressed('NumpadEnter') || inp.wasPressed('Space')) this._dismissBanner();
      for (let i = 0; i < 3; i++) if (inp.wasPressed(`Digit${i + 1}`) || inp.wasPressed(`Numpad${i + 1}`)) this.pickSalvage(i);
      this._step(dt, false);
      this._frameVisuals(dt);
      if (this.endTimer <= 0) { this._finishTransition(); return; }
      return;
    }

    this.cam?.update(dt);   // zoom / pan; must read the right button before _handleInput (drag vs click)
    this._handleInput();
    if (!this._alive) return;   // a key may have quit the scene

    if (this.readyT > 0 && !this.paused && this.phase === 'wave') {
      this.readyT -= dt;
      const sub = this.readyEl?.querySelector('.df-ready-s');
      if (sub) sub.textContent = `The wave restarts in ${Math.max(1, Math.ceil(this.readyT))}…`;
      if (this.readyT <= 0) { this.readyEl?.remove(); this.readyEl = null; }
      this._frameVisuals(dt);
      return;
    }
    if (!this.paused) {
      if (this.phase === 'wave') {
        // Fixed sub-steps: 2× speed runs the simulation twice per frame (keeps hits accurate).
        // Hit-stop / slow motion (Fx.step) scale the simulation, never the UI.
        let remaining = dt * this.speed * this.fx.step(dt);
        while (remaining > 1e-6 && this.phase === 'wave') {
          const step = Math.min(remaining, DEFENSE.maxSubstep);
          this._step(step, true);
          remaining -= step;
        }
        if (!this._alive) return;
      } else if (this.phase === 'lull') {
        // The lull runs in real time (2×/3× don't shorten your building time).
        this._step(dt, true);
      } else {
        this.prepTime += dt;
        this._step(dt, false);
      }
    }
    this.ground?.update(dt);
    this._frameVisuals(dt);
    this._updateHints();
  }

  /**
   * One simulation step. `active` = the night is running (a push or a lull): spawns, combat, protocols.
   * In a push, events of the current push spawn on its own clock (pushT); when the push has spawned out
   * and the field is clear, a lull starts (or the night ends after the last push). In a lull the timer
   * runs down and the next push starts at 0. The balance sim calls this directly (any phase).
   */
  _step(dt, active) {
    const run = this.run;
    const wasWave = this.phase === 'wave';
    if (active) {
      this.waveTime += dt;
      if (wasWave) {
        this.pushT += dt;
        while (this.spawnIdx < this.events.length && this.events[this.spawnIdx].push === this.pushIdx && this.events[this.spawnIdx].t <= this.pushT) {
          const ev = this.events[this.spawnIdx++];
          // A group's own hpMult (the boss) replaces the night curve; run modifiers still apply on top.
          this.spawnEnemy(ev.type, ev.lane, ev.hpMult ? { hpMult: ev.hpMult * (this.hpMult / healthMult(this.night)) } : {});
          this.totalEnemies += 1;
          this.sideDirty = this.sideDirty || this.sideMode === 'preview';
        }
        // Rapid Response skill: everything is slowed for the first seconds of each push.
        if (run.hasSkill('rapid_response') && this.pushT < DEFENSE.rapidResponse.time) {
          const left = DEFENSE.rapidResponse.time - this.pushT;
          for (const e of this.enemies) e.applySlow(DEFENSE.rapidResponse.mult, Math.min(left, 0.25) + dt, 'rapid');
        }
        // Root Heart (relic): the Relay heals during pushes.
        const regen = run.relicMod ? run.relicMod('relayRegen') : 0;
        if (regen > 0 && run.relayHp < run.relayMax) run.relayHp = Math.min(run.relayMax, run.relayHp + regen * dt);
      } else if (this.phase === 'lull') {
        const before = Math.ceil(this.lullT);
        this.lullT -= dt;
        if (Math.ceil(this.lullT) !== before) this.sideDirty = true;   // the countdown and the call-early bonus
        if (this.lullT <= 0) this._startPush(this.pushIdx + 1);
      }
      this.protocols.update(dt);
    }
    this._computeTowerStats();
    if (active) {
      for (const e of this.enemies) e.update(dt);
      if (this.phase === 'lost' || this.phase === 'won') return;          // defeat mid-step
    } else {
      for (const e of this.enemies) updateVisual(e.visual, dt);
    }
    for (const t of this.towers) t.update(dt, this.enemies, active && this.phase === 'wave');
    if (active && this.phase === 'wave') this._relayZap(dt);
    this.projectiles.update(dt);
    this.fx.update(dt);
    if (this.enemies.some((e) => e.removed)) this.enemies = this.enemies.filter((e) => !e.removed);
    if (this.boss && this.boss.removed) this.boss = null;

    if (active && this.phase === 'wave' && this._pushSpawned() && this.enemies.length === 0 && this.projectiles.list.length === 0) {
      if (this.spawnIdx >= this.events.length) this._endNight();
      else this._enterLull();
    }
    // A push that has spawned out can be called early: the panel shows the button from then on.
    if (wasWave && this._pushSpawned() && !this._calledShown) { this._calledShown = true; this.sideDirty = true; }
    if (!this._pushSpawned()) this._calledShown = false;
  }

  /**
   * The Relay's own zap (RELAY_ZAP): during a push, the enemy closest to the Relay within range (else a planted
   * Spitter lobbing sap at it) takes an energy bolt from the crystal every cooldown s. Never a burrowed one.
   * Steps with the sim (pause / 1×–3× respected).
   */
  _relayZap(dt) {
    const Z = RELAY_ZAP;
    this.zapT = (this.zapT || 0) - dt;
    if (this.zapT > 0) return;
    let best = null, bd = Z.range * Z.range, spitter = null, sd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.removed || e.burrowed || !e.onField) continue;
      const d2 = (e.pos.x - this.corePos.x) ** 2 + (e.pos.z - this.corePos.z) ** 2;
      if (d2 <= bd) { bd = d2; best = e; }
      else if (Z.spitters && e.def.spit && e.state !== 'walk' && d2 < sd) { sd = d2; spitter = e; }   // returns fire
    }
    best = best || spitter;
    if (!best) { this.zapT = 0; return; }
    this.zapT = Z.cooldown;
    const from = new THREE.Vector3(this.corePos.x, Z.originY, this.corePos.z);
    const to = best.aimPoint(new THREE.Vector3());
    this.fx.bolt(from, to, { color: Z.color, life: 0.16, jag: 0.5 });
    this.fx.flash(from, { color: Z.color, size: 0.5, life: 0.08 });
    this.fx.flash(to, { color: Z.color, size: 0.38, life: 0.07 });
    this.fx.light(to, { color: Z.color, intensity: JUICE.bolt.light, distance: JUICE.bolt.lightDist, life: 0.1 });
    this.damage(best, relayZapDamage(this.night), Z.damageType, { relay: true });
    this.nightStats.zapHits = (this.nightStats.zapHits || 0) + 1;
    if (this.nightStats.zapHits === 1) this.zapRingT = Z.ringShow || 0;   // its first bolt tonight shows its reach
    this.game.sfx.playAt('zap', this.corePos.x, this.corePos.z);
  }

  _computeTowerStats() {
    const run = this.run;
    const frac = run.relayHp / run.relayMax;
    for (const t of this.towers) {
      t.stats = run.towerStats(t.rec, frac);
      t.buffRate = 0;
      t.bonusChance = 0;
      t.buffDamage = 0;
      t.buffRange = 0;
    }
    for (const b of this.towers) {
      if (b.stats.kind !== 'support') continue;
      const r = b.stats.range + 0.01;
      for (const t of this.towers) {
        if (t === b || t.stats.kind === 'support') continue;
        if (t.pos.distanceTo(b.pos) <= r) {
          t.buffRate = Math.max(t.buffRate, b.stats.buffRate);
          t.bonusChance = Math.max(t.bonusChance, b.stats.bonusAttackChance || 0);
          t.buffDamage = Math.max(t.buffDamage, b.stats.buffDamage || 0);
          t.buffRange = Math.max(t.buffRange, b.stats.buffRange || 0);
        }
      }
    }
    // Spotter beacons: damage / range bonuses go straight into the boosted towers' stats.
    for (const t of this.towers) {
      if (t.buffDamage) t.stats.damage *= 1 + t.buffDamage;
      if (t.buffRange) t.stats.range *= 1 + t.buffRange;
    }
  }

  /** Per-frame visuals that run even while paused-free: core, pads, range, lane tags, HUD. */
  _frameVisuals(dt) {
    const game = this.game;
    const paused = this.paused;
    const t = game.time;
    // Music (safe to call every frame): boss theme while the Colossus is alive.
    game.music?.play(this.boss && !this.boss.removed ? 'boss' : 'night');
    if (!paused) {
      updateVisual(this.coreVis, dt);
      this._updateChevrons(dt);
    }
    // Core light: gentle pulse, red flash when hit.
    this.coreHitT = Math.max(0, this.coreHitT - dt);
    const L = this.lightCfg;
    const k = this.coreHitT / 0.35;
    this.coreLight.color.copy(this.coreLightColor).lerp(new THREE.Color('#ff3040'), k);
    this.coreLight.intensity = L.coreI * (0.85 + 0.15 * Math.sin(t * 2.2)) * (this.phase === 'lost' ? 0.2 : 1) + k * 4;
    this._setGlow(this.coreGlow, (0.85 + 0.15 * Math.sin(t * 2.2)) * (this.phase === 'lost' ? 0.3 : 1));

    // Board furniture: pad markers + selection, hostile rings, painter's-order units, reward glints.
    const prep = this.canBuild;
    this._updateBoard(dt);
    // Pulse Beacon buff: amber ring under every boosted tower.
    this.buffRingMat.opacity = 0.4 + 0.3 * Math.sin(t * 4);
    for (const tw of this.towers) {
      if (!tw.buffRing) continue;
      tw.buffRing.visible = tw.buffRate > 0;
      if (tw.buffRing.visible) tw.buffRing.scale.setScalar(1 + 0.06 * Math.sin(t * 4 + tw.rec.pad));
    }
    const selT = this._towerOn(this.selPad);

    // Range indicator priority: card hover at selected pad > placing at hovered pad > selected tower > hovered tower.
    this.range.visible = false;
    const run = this.run;
    if (this.hoverType && this.selPad >= 0 && !selT && prep) {
      const p = this.pads[this.selPad];
      this._showRange(p.x, p.z, this._previewStats(this.hoverType), run.canAfford(run.buildCost(this.hoverType)) ? '#2ce8f5' : '#e43b44');
    } else if (this.placing && prep) {
      const p = this.pads[this.hoverPad];
      if (p && !this._towerOn(p.i)) this._showRange(p.x, p.z, this._previewStats(this.placing), run.canAfford(run.buildCost(this.placing)) ? '#63c74d' : '#e43b44');
    } else if (selT && selT.stats) {
      this._showRange(selT.pos.x, selT.pos.z, selT.stats, selT.stats.kind === 'support' ? '#fee761' : '#2ce8f5');
    } else {
      const ht = this._towerOn(this.hoverPad);
      if (ht && ht.stats) this._showRange(ht.pos.x, ht.pos.z, ht.stats, '#ead4aa', false);
    }

    // Hovered tower: name + level tag above it; else a hovered enemy: name + health.
    const tagT = this._towerOn(this.hoverPad);
    const tagE = !tagT ? this.hoverEnemy : null;
    if ((tagT && tagT !== selT) || tagE) {
      const txt = tagT ? `${TOWERS[tagT.rec.type].name} · L${tagT.rec.level}` : `${tagE.def.name} · ${Math.ceil(tagE.hp)} / ${Math.ceil(tagE.maxHp)}`;
      if (this.towerTag.textContent !== txt) { this.towerTag.textContent = txt; this._tagW = 0; }
      this.towerTag.style.setProperty('--c', tagT ? TOWERS[tagT.rec.type].icon?.color || '#ead4aa' : '#e43b44');
      const at = tagT ? new THREE.Vector3(tagT.pos.x, this.padBaseY + tagT.height + 0.55, tagT.pos.z) : new THREE.Vector3(tagE.pos.x, tagE.height + 0.6, tagE.pos.z);
      const tp = game.project(at, this.camera);
      // Whole pixels (critic M2 P1-3: translate(-50%) on an odd width put the tag on a half pixel): its size, measured
      // once per text, as integer offsets.
      this.towerTag.style.display = '';
      if (!this._tagW) { this._tagW = this.towerTag.offsetWidth; this._tagH = this.towerTag.offsetHeight; }
      this.towerTag.style.transform = `translate(${Math.round(tp.x) - Math.round(this._tagW / 2)}px, ${Math.round(tp.y) - this._tagH}px)`;
    } else if (this.towerTag.style.display !== 'none') this.towerTag.style.display = 'none';

    // Lane tags at the field entrance. While the boss walks in from off-screen its lane's tag and an
    // arrow at the lane mouth pulse red (until it is on the field or DEFENSE.bossEntry runs out).
    const tagPos = new THREE.Vector3();
    let bossEntry = this._bossEntry;
    if (bossEntry && (game.time > bossEntry.until || !this.boss || this.boss.removed || this.boss.dead || this.boss.pos.x > 1.2)) bossEntry = this._bossEntry = null;
    this.lanes.forEach((lane, i) => {
      const n = this.laneTags[i];
      let count;
      if (this.phase === 'prep') { count = 0; for (const c of this.wave.perLane[i].values()) count += c; }
      else if (this.events) { count = 0; for (let j = this.spawnIdx; j < this.events.length; j++) if (this.events[j].lane === i) count++; }
      const bossHere = bossEntry && bossEntry.lane === i;
      // The lane facing tonight's area carries its danger group: ⚠ on its tag in prep.
      const danger = this.phase === 'prep' && this._dangerHasPath() && this.dangerLane === i ? ' ⚠' : '';
      const txt = bossHere ? `☠ ${lane.short} ▸ Colossus` : this.phase === 'prep' ? `${lane.short} ▸ ${count}${danger}` : count > 0 ? `${lane.short} ▸ ${count} coming` : '';
      if (n.textContent !== txt) n.textContent = txt;
      n.classList.toggle('boss', !!bossHere);
      n.classList.toggle('danger', !!danger);
      n.style.display = txt ? '' : 'none';
      if (!txt) return;
      // Below the lane's entry row at the field edge, clear of the path: enemies (and the boss) walk in
      // along the lane and draw upward from their feet, and their jitter + ground ring stay above
      // DEFENSE.laneTagDrop, so the tag never covers a spawning enemy. Kept inside the map viewport when
      // the camera is zoomed or panned.
      lane.pointAt(0, tagPos);
      const laneZ = tagPos.z;
      tagPos.set(0.2, 0, laneZ + DEFENSE.laneTagDrop);
      const p = this._clampToView(game.project(tagPos, this.camera), n);
      n.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
      if (bossHere) {
        tagPos.set(0.15, 0, laneZ);
        const a = this._clampToView(game.project(tagPos, this.camera), this.bossArrow);
        this.bossArrow.style.transform = `translate(${a.x.toFixed(0)}px, ${a.y.toFixed(0)}px) translateY(-50%)`;
      }
    });
    if (this.bossArrow.style.display !== (bossEntry ? '' : 'none')) this.bossArrow.style.display = bossEntry ? '' : 'none';

    // Boss bar
    if (this.boss && !this.boss.removed) {
      this.bossBar.set(this.boss.hp / this.boss.maxHp, `${Math.ceil(this.boss.hp)} / ${Math.ceil(this.boss.maxHp)}`);
      if (this.bossPhase.textContent !== this.boss.phaseLabel) {
        this.bossPhase.textContent = this.boss.phaseLabel;
        this.bossPhase.className = `df-bossphase ${/CHARG|charge|ENRAG|SIEGE/.test(this.boss.phaseLabel) ? 'bad' : /Root|stopped/.test(this.boss.phaseLabel) ? 'good' : ''}`;
      }
    }

    if (this.sellArmed && game.time > this.sellArmed.until) { this.sellArmed = null; this.sideDirty = true; }
    if (this.sideDirty) this._renderSide();
    // Relay Protocols: their bar shows during pushes and lulls; aim cursor + cooldown sweeps every frame.
    if (this.protoBar) {
      const show = (this.phase === 'wave' || this.phase === 'lull') && this.protocols.keys.length > 0;
      if (show && !this.protoBar.firstChild) this.protoBar.append(this.protocols.panel());
      if (this.protoBar.style.display !== (show ? '' : 'none')) this.protoBar.style.display = show ? '' : 'none';
    }
    this.protocols?.frame();
    this._refreshTop();
  }

  /** Stats for a tower type at level 1 with tonight's modifiers (range preview before building). */
  _previewStats(type) {
    return this.run.towerStats({ type, level: 1, target: TOWERS[type].target, spent: {} }, this.run.relayHp / this.run.relayMax);
  }

  // =================================================================== input

  _pickPad() {
    if (!this.mouse.inside || this.overUi) return -1;
    const mx = this.mouse.x, my = this.mouse.y;
    const cam = this.camera;
    const v = new THREE.Vector3();
    let best = -1, bestD = Infinity;
    // Screen-space pick: distance from the mouse to the pad's vertical span (base → tower top),
    // so clicking a tall tower sprite selects it, not just its footprint.
    const a0 = this.game.project(v.set(0, 0, 8), cam), a1 = this.game.project(v.set(1, 0, 8), cam);
    const tilePx = Math.abs(a1.x - a0.x);
    for (const p of this.pads) {
      if (p.closed) continue;   // a forward slot no beacon has opened
      const t = this._towerOn(p.i);
      const b = this.game.project(v.set(p.x, 0, p.z), cam);
      const top = this.game.project(v.set(p.x, t ? this.padBaseY + t.height * 0.8 : 0.2, p.z), cam);
      const sx = top.x - b.x, sy = top.y - b.y;
      const len2 = sx * sx + sy * sy || 1;
      let k = ((mx - b.x) * sx + (my - b.y) * sy) / len2;
      k = Math.max(0, Math.min(1, k));
      const dx = mx - (b.x + sx * k), dy = my - (b.y + sy * k);
      const d = Math.hypot(dx, dy);
      if (d < tilePx * 0.6 && d < bestD) { bestD = d; best = p.i; }
    }
    return best;
  }

  _handleInput() {
    const game = this.game;
    const inp = game.input;
    const run = this.run;
    const prep = this.canBuild;   // prep, or a lull between pushes

    if (this._skipInput) { this._skipInput = false; return; }   // the key that closed Settings
    if (this.paused) {
      if (this.settingsOpen) return;   // the settings overlay handles its own keys
      if (inp.wasPressed('Escape') || inp.wasPressed('KeyP') || (inp.wasPressed('Space') && this.phase !== 'prep')) this.togglePause(false);
      return;
    }

    this.hoverPad = this._pickPad();
    game.stage.style.cursor = this.protocols.aiming ? 'crosshair' : this.hoverPad >= 0 && (prep || this._towerOn(this.hoverPad)) ? 'pointer' : '';

    // Relay Protocols (Q / W / E, aiming, click to cast) take the input first while a push or lull runs.
    if (this.protocols.handleInput()) return;

    // Keyboard
    if (inp.wasPressed('Escape')) {
      if (this.placing) { this.placing = null; this.sideDirty = true; }
      else if (this.selPad >= 0) this._select(-1);
      else this.togglePause(true);
      return;
    }
    if (inp.wasPressed('KeyP')) { this.togglePause(true); return; }
    if (this.startArmed && game.time >= this.startArmed) { this.startArmed = 0; this.sideDirty = true; }   // "Start anyway" expired
    if (inp.wasPressed('Space')) {
      // Shift held (or pressed and let go within this frame) makes it a deliberate "Start anyway".
      const shift = ['ShiftLeft', 'ShiftRight'].some((c) => inp.isDown(c) || inp.wasPressed(c));
      if (this.phase === 'prep') this._tryStartWave(shift ? 'shift' : 'space');
      else if (!(game.time < (this.spaceGuardT || 0))) this.togglePause(true);
      return;
    }
    if (inp.wasPressed('KeyN') && this.callNextPush()) return;
    if (inp.wasPressed('KeyF')) {
      const s = DEFENSE.speeds;
      this.speed = s[(s.indexOf(this.speed) + 1) % s.length] ?? 1;
      this._refreshTop(true);
    }
    if (prep) {
      const types = run.availableTowers(game.meta);
      for (let i = 0; i < 6; i++) {
        if (!inp.wasPressed(`Digit${i + 1}`) && !inp.wasPressed(`Numpad${i + 1}`)) continue;
        const type = types[i];
        if (!type) continue;
        if (this.selPad >= 0 && !this._towerOn(this.selPad)) this._build(type, this.selPad);
        else { this.placing = this.placing === type ? null : type; this.selPad = -1; this.sideDirty = true; }
      }
      if (inp.wasPressed('KeyR')) this._repair();
    }
    const selT = this._towerOn(this.selPad);
    if (selT) {
      if (inp.wasPressed('KeyU')) {
        if (prep) this._upgrade(selT); else toast(game.ui, 'Upgrades wait for the lull after this push', 'amber');
      }
      if (inp.wasPressed('KeyS')) {
        if (prep) this._sell(selT); else toast(game.ui, 'Selling waits for the lull after this push', 'amber');
      }
      if (inp.wasPressed('KeyT') && ['bullet', 'chain', 'mortar'].includes(selT.def.kind)) {
        this._setTarget(selT, TARGET_RULES[(TARGET_RULES.indexOf(selT.rec.target) + 1) % TARGET_RULES.length]);
      }
    }

    // Mouse
    if (inp.mouseClicked(2)) {
      if (this.placing) { this.placing = null; this.sideDirty = true; } else if (this.selPad >= 0) this._select(-1);
    }
    if (inp.mouseClicked(0) && !this.overUi) {
      const pad = this.hoverPad;
      if (this.placing && prep) {
        if (pad >= 0 && !this._towerOn(pad)) this._build(this.placing, pad);
        else if (pad >= 0) this._select(pad);
        else { this.placing = null; this.sideDirty = true; }
      } else if (pad >= 0) {
        if (prep || this._towerOn(pad)) this._select(pad === this.selPad ? -1 : pad);
      } else if (this.selPad >= 0) {
        this._select(-1);
      }
    }
  }

  /** Next to an empty build pad near the Relay, so the "click a glowing square" hint points at one. */
  _padHintSpot() {
    const pad = this.pads.filter((p) => !p.closed && !this._towerOn(p.i)).sort((a, b) => Math.hypot(a.x - this.corePos.x, a.z - this.corePos.z) - Math.hypot(b.x - this.corePos.x, b.z - this.corePos.z))[0];
    if (!pad) return null;
    const pr = this.game.project(new THREE.Vector3(pad.x, 0, pad.z), this.camera);
    const sw = this.game.stage.clientWidth, u = this.game.u;
    return { right: `${Math.round(sw - pr.x + 22 * u)}px`, top: `${Math.round(pr.y - 14 * u)}px`, maxWidth: `${Math.round(230 * u)}px` };
  }

  _updateHints() {
    // A short window (critic K2 §5: a docked hint left the lull's build list 17 px): no docked hints once the night
    // is on; one still up from prep goes.
    const short = this.hintDock && this.phase !== 'prep' && (this.side?.clientHeight || 0) / (this.game.u || 1) < (DEFENSE_VIEW.dockMinPanel || 0);
    if (short && this._curHint?.isConnected && this.hintDock.contains(this._curHint)) { this._curHint.remove(); this._curHint = null; }
    this.side?.classList.toggle('df-nodock', !!short);
    if (this._curHint && this._curHint.isConnected) return;
    this._curHint = null;
    for (let i = 0; i < this._hintQueue.length; i++) {
      const h = this._hintQueue[i];
      // (No room to dock: only a `float` hint — the boss's — shows, over the board's corner.)
      if ((short && !h.float) || !h.when()) continue;
      this._hintQueue.splice(i, 1);
      // Docked in the side panel (critic H2 §5.1), never over the board; the panel's body scrolls under it.
      const n = showHint(this.game, h.id, h.html, this.hintDock && !short ? { parent: this.hintDock, time: 11 } : { pos: h.pos, style: h.spot?.() || null, time: 11 });
      if (n) { this._clickThroughHint(n); this._curHint = n; break; }
      i--;
    }
  }

  /**
   * Night hints never eat pad clicks (critic K §5.2): the hint lets the pointer through to the map, and only
   * its × button takes clicks.
   */
  _clickThroughHint(n) {
    n.classList.remove('ui-block');
    n.classList.add('df-hint');
    const dismiss = [...n.children].find((c) => /click to dismiss/i.test(c.textContent));
    dismiss?.remove();
    n.append(el('button.df-hint-x.ui-block', { 'aria-label': 'Close hint', onclick: (e) => { e.stopPropagation(); n.remove(); } }, '×'));
  }
}
