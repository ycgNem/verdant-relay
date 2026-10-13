// Night defense: the Relay map with two lanes and 16 build pads.
//
// Phases:
//   prep  build / upgrade / sell / set targeting / repair, read the wave preview, then Start Wave.
//   wave  enemies spawn from the night's schedule; no building, upgrades or repairs. Pause, 1×/2×.
//   won   "Night N survived" banner, then next night's briefing (or results after night 6).
//   lost  the Relay fell: banner, then results.
//
// Run state (resources, towers, relay HP) lives in game.run (src/core/Run.js) — this scene only
// keeps views of it (Tower / DefenseEnemy objects) and the transient wave state.
//
// Saving: every prep action re-saves the 'prep' snapshot; Start Wave saves a 'wave' snapshot (build
// locked, Relay HP as the wave began). Continue from 'wave' re-enters here and restarts the wave at
// once. Surviving saves the next 'briefing' immediately (before the banner); a defeat clears the save.

import * as THREE from 'three';
import { buildDefenseGround, makePlinth } from '../world/DefenseGround.js';
import '../ui/defense.css';
import { el, button, resChip, resRow, costLine, bar, toast, modal, resIconHtml, setToastsPaused } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { JUICE } from '../data/config.js';
import { vineTextures, shade } from '../core/Fx.js';
import { Fx } from '../core/Fx.js';
import { PixelCamera } from '../core/PixelView.js';
import { updateVisual, flashVisual, setAnim } from '../core/Assets.js';
import { CONFIG, RESOURCE_KEYS } from '../data/config.js';
import { TOWERS, TARGET_RULES, TARGET_RULE_TEXT, TARGET_RULE_LABEL } from '../data/towers.js';
import { DEFENSE_ENEMIES } from '../data/enemies.js';
import { WAVES, HEALTH_MULT, DEFENSE } from '../data/waves.js';
import { DEFENSE_MAP, DEFENSE_VIEW } from '../data/defenseMap.js';
import { DISTRICTS } from '../data/districts.js';
import { SKILLS } from '../data/skills.js';
import { Lane, DefenseEnemy } from '../entities/DefenseEnemy.js';
import { Tower } from '../entities/Tower.js';
import { Projectiles } from '../entities/Projectiles.js';
import { openSettingsOverlay } from './SettingsScene.js';
import { READINESS } from '../data/guide.js';

const DEG = Math.PI / 180;
const UI_W = 960, UI_H = 540;   // UI unit space (see style.css --u)

// Skills that change the defense, shown in the preview's modifier list.
const DEFENSE_SKILLS = ['efficient_assembly', 'circuit_recovery', 'long_sightlines', 'field_tuning', 'overclock', 'emergency_patch',
  'reinforced_core', 'prepared_defenses', 'watchtower_network', 'last_stand', 'rapid_response', 'living_barricade'];

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
 *  1. Take the authored groups for this night (WAVES[night − 1]).
 *  2. District threats add `tonight.extraGroups`. They are scheduled mid-wave, spread evenly between
 *     DEFENSE.extraGroupFrom and extraGroupTo of the authored wave's length, alternating lanes (the
 *     first goes to the lane with fewer authored enemies). Each uses the enemy type's own spawn gap;
 *     its count is scaled by DEFENSE.threatScale[night − 1] (smaller threats on the first nights).
 *  3. tonight.enemyCount (objective boons, optional flags, Intel sabotage) scales the whole wave's
 *     count (see scaleWaveCount). The cuts stack but are floored at CONFIG.waveSizeFloor (−20%).
 *  4. Groups expand into one spawn event per enemy, sorted by time.
 * Per-enemy modifiers (HP × HEALTH_MULT[night − 1], tonight.enemySpeed, laneSlow, Rapid Response)
 * are applied when each enemy spawns / moves, not here.
 */
export function buildWave(run) {
  const night = Math.max(1, Math.min(WAVES.length, run.night));
  const t = run.tonight || {};
  const mult = run.waveCountMult ? run.waveCountMult() : Math.max(CONFIG.waveSizeFloor ?? 0, t.enemyCount ?? 1);
  const groups = WAVES[night - 1].map((g) => ({ ...g, extra: false }));
  const length = Math.max(...groups.map((g) => g.at + g.gap * (g.count - 1)));
  const load = [0, 0];
  for (const g of groups) load[g.lane] += g.count;
  let lane = load[0] <= load[1] ? 0 : 1;
  const extras = t.extraGroups || [];
  extras.forEach((x, i) => {
    const f = extras.length === 1
      ? (DEFENSE.extraGroupFrom + DEFENSE.extraGroupTo) / 2
      : DEFENSE.extraGroupFrom + (DEFENSE.extraGroupTo - DEFENSE.extraGroupFrom) * (i / (extras.length - 1));
    const def = DEFENSE_ENEMIES[x.type];
    groups.push({
      at: Math.round(length * f * 10) / 10, lane, type: x.type,
      count: Math.max(1, Math.round(x.count * (DEFENSE.threatScale?.[night - 1] ?? 1))), gap: x.gap ?? def?.gap ?? 1, extra: true,
    });
    lane = 1 - lane;
  });
  scaleWaveCount(groups, mult);
  const events = [];
  for (const g of groups) {
    if (!DEFENSE_ENEMIES[g.type]) continue;
    for (let k = 0; k < g.count; k++) events.push({ t: g.at + k * g.gap, lane: g.lane, type: g.type });
  }
  events.sort((a, b) => a.t - b.t);
  // Preview: counts per lane per type (in order of first appearance).
  const perLane = [new Map(), new Map()];
  for (const e of events) perLane[e.lane].set(e.type, (perLane[e.lane].get(e.type) || 0) + 1);
  return { groups, events, total: events.length, perLane, duration: events.length ? events[events.length - 1].t : 0 };
}

/** Is this enemy type new tonight (not in any earlier night's authored wave)? */
function isNewType(type, night) {
  return !WAVES.slice(0, night - 1).some((w) => w.some((g) => g.type === type));
}

const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString();

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
    game.assets.setTint(DEFENSE_VIEW.spriteTint);

    // Tonight's night number / modifiers as they were when the scene opened: run.nightSurvived()
    // advances run.night and clears run.tonight before the "survived" banner, and the HUD and side
    // panel must keep showing this night.
    this.night = run.night;
    this.tonight = run.tonight;
    this.district = run.district;
    const resumeWave = run.phase === 'wave';

    this.lanes = DEFENSE_MAP.lanes.map((d, i) => new Lane(d, i));
    this.corePos = new THREE.Vector3(DEFENSE_MAP.core.x, 0, DEFENSE_MAP.core.y);
    this.coreRadius = DEFENSE_MAP.coreRadius;
    this.hpMult = HEALTH_MULT[Math.max(0, Math.min(HEALTH_MULT.length, run.night) - 1)] ?? 1;

    this._makeShared();
    this.fx = new Fx(game, this.three, this.camera);
    this.projectiles = new Projectiles(this);
    this._buildLights();
    this._buildGround();
    this._buildScenery();
    this._buildCore();
    this._buildPads();
    this._buildIndicators();
    this._buildChevrons();
    game.setInternalRes(...DEFENSE_VIEW.res);
    this._fitCamera();

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
    this.wave = buildWave(run);

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
        html: `The <b>${DEFENSE_ENEMIES.colossus.name}</b> comes down the <b>${this.lanes[bossLane ?? 0]?.name}</b> tonight. Select the towers covering it and set targeting to <b>Toughest</b> (<span class="key">T</span>) so they focus the boss; leave the other path on <b>First in line</b>.` },
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
      { id: 'def_boss', pos: 'map-bottom-left', when: () => this.phase === 'wave' && !!this.boss,
        html: 'The <b>Canopy Colossus</b> roots itself to spawn Crawlers (the <b style="color:#63c74d">filled green disc</b> around it), then charges along the <b>red</b> path. Your Mortar Pod landings show as <b style="color:#feae34">dashed amber rings</b>. At 60% health it <b>roars and enrages</b>: its bark hardens, it charges faster, and Skitters sprout with its roots. Slow it and focus fire.' },
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
      state: () => ({ phase: this.phase, waveTime: this.waveTime, enemies: this.enemies.length, toSpawn: this.events ? this.events.length - this.spawnIdx : this.wave.total, relayHp: run.relayHp, res: { ...run.res }, towers: run.towers.length }),
    };
    this._alive = true;

    // Continue from a mid-wave quit: the build was locked when the wave began, so restart it now.
    if (resumeWave) {
      this.startWave();
      toast(game.ui, `Night ${this.night}: the wave restarts — your build was locked when it began`, 'amber', 3.5);
      // A short "get ready" beat before the restarted wave runs (DEFENSE.resumeReady seconds).
      this.readyT = DEFENSE.resumeReady || 0;
      if (this.readyT > 0) {
        this.readyEl = el('div.df-ready', {}, el('div.df-ready-t', 'Get ready'), el('div.df-ready-s', ''));
        this.uiRoot.append(this.readyEl);
      }
    }
  }

  exit() {
    if (!this._alive) return;
    this._alive = false;
    const game = this.game;
    try { this.settingsOpen?.close?.(); } catch { /* overlay already gone */ }
    for (const [target, ev, fn, opt] of this._listeners) target.removeEventListener(ev, fn, opt);
    this._listeners = [];
    for (const e of this.enemies) e.remove();
    this.enemies = [];
    for (const t of this.towers) t.dispose();
    this.towers = [];
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
    const big = (enemy.def.size || 0.6) >= 1.1 ? 2 : 1;   // whole-number scales only (crisp texels)
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

  /** Dirt mound shown while a burrower is underground. */
  makeMound(enemy) {
    const m = new THREE.Mesh(this.moundGeom, this.moundMat);
    m.scale.set(1.1, 0.5, 1.1);
    m.visible = false;
    enemy.obj.add(m);
    return m;
  }

  _buildLights() {
    const L = DEFENSE_VIEW.light;
    this.three.add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi));
    const moon = new THREE.DirectionalLight(L.moon, L.moonI);
    moon.position.set(-12, 20, -8);
    moon.target.position.set(15, 0, 8);
    this.three.add(moon, moon.target);
    this.coreLight = new THREE.PointLight(L.core, L.coreI, L.coreDist, 1);
    this.coreLight.position.set(this.corePos.x, 2.4, this.corePos.z);
    this.three.add(this.coreLight);
    this.coreLightColor = new THREE.Color(L.core);
    for (const [x, y] of DEFENSE_MAP.lamps || []) {
      const l = new THREE.PointLight(L.lamp, L.lampI, L.lampDist, 1);
      l.position.set(x + 0.5, 1.9, y + 0.5);
      this.three.add(l);
    }
  }

  /** Tiles covered by lanes (tile keys "x,y"), including the off-map extension to the left edge. */
  _laneTiles() {
    const set = new Set();
    const X0 = -DEFENSE_MAP.margin.left;
    for (const lane of DEFENSE_MAP.lanes) {
      const pts = [[X0, lane.points[0][1]], ...lane.points];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let k = 0; k <= n; k++) {
          set.add(`${Math.round(ax + ((bx - ax) * k) / n)},${Math.round(ay + ((by - ay) * k) / n)}`);
        }
      }
    }
    return set;
  }

  /**
   * Ground and jungle: the same blended terrain and foliage cards as the day jungle
   * (src/world/DefenseGround.js), lit by the night lights, sprites tinted like the units.
   */
  _buildGround() {
    this.ground = buildDefenseGround(this.game, this.run.seed, this._laneTiles(), DEFENSE_VIEW.spriteTint);
    this.three.add(this.ground.group);
    this._track(this.ground);
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
    for (const [x, y] of DEFENSE_MAP.lamps || []) this._addVisual('lamp_post', x + 0.5, y + 0.5);
  }

  _buildCore() {
    this.coreVis = this._addVisual('relay_core', this.corePos.x, this.corePos.z);
    // Cyan glow decal under the core.
    const geom = this._track(new THREE.CircleGeometry(1.7, 32));
    const mat = this._track(new THREE.MeshBasicMaterial({ color: '#2ce8f5', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.coreGlow = new THREE.Mesh(geom, mat);
    this.coreGlow.rotation.x = -Math.PI / 2;
    this.coreGlow.position.set(this.corePos.x, 0.03, this.corePos.z);
    this.three.add(this.coreGlow);
  }

  _buildPads() {
    // Pad marker: a dashed 1-texel rim hugging the plinth's top face (texel-exact, 32 × 32 = one tile),
    // with solid corners — reads as "build here" without the old hazard-bracket look.
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    const rx0 = 1, rx1 = 30, ry0 = 2, ry1 = 29;
    for (let x = rx0; x <= rx1; x++) if (((x - rx0) & 3) < 2 || x - rx0 < 3 || rx1 - x < 3) { g.fillRect(x, ry0, 1, 1); g.fillRect(x, ry1, 1, 1); }
    for (let y = ry0; y <= ry1; y++) if (((y - ry0) & 3) < 2 || y - ry0 < 3 || ry1 - y < 3) { g.fillRect(rx0, y, 1, 1); g.fillRect(rx1, y, 1, 1); }
    const tex = this._track(new THREE.CanvasTexture(c));
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    this.markerGeom = this._track(new THREE.PlaneGeometry(1, 1));
    this.markerTex = tex;
    // Occupied pads keep their corner brackets in the tower's type colour (towers are small at night
    // zoom: the coloured pad says "Arc" vs "Beacon" vs "Snare" at a glance). One material per type.
    this.typeMarkMats = {};

    this.pads = DEFENSE_MAP.pads.map(([x, y], i) => {
      // In-world stone / timber plinth (DefenseGround.makePlinth) instead of the metal pad sprite.
      const base = makePlinth(i * 7 + 3, DEFENSE_VIEW.woodPlinths?.includes(i));
      base.position.set(x + 0.5, 0.02, y + 0.5 + base.userData.zOffset);
      this.three.add(base);
      this._track(base.geometry, base.material, base.material.map);
      if (i === 0) this.padBaseY = 0;
      const mat = this._track(new THREE.MeshBasicMaterial({ map: tex, color: '#feae34', transparent: true, opacity: 0.6, depthWrite: false }));
      const marker = new THREE.Mesh(this.markerGeom, mat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(x + 0.5, this.padBaseY + 0.03, y + 0.5);
      marker.renderOrder = 2;
      marker.userData.pxSnap = true;
      this.three.add(marker);
      return { i, x: x + 0.5, z: y + 0.5, base, marker, mat };
    });
    const selMat = this._track(new THREE.MeshBasicMaterial({ map: tex, color: '#2ce8f5', transparent: true, opacity: 0.95, depthWrite: false }));
    this.selMarker = new THREE.Mesh(this.markerGeom, selMat);
    this.selMarker.rotation.x = -Math.PI / 2;
    this.selMarker.userData.pxSnap = true;
    this.selMarker.renderOrder = 3;
    this.selMarker.visible = false;
    this.three.add(this.selMarker);
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
    for (const m of [fill, ring, this.rangeMin]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 4; }
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
        m.renderOrder = 2;
        this.three.add(m);
        this.chevrons.push({ m, lane, d: (i / n) * lane.total });
      }
    }
  }

  _updateChevrons(dt) {
    const show = this.phase === 'prep';
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
   * Fixed camera: the night map renders at DEFENSE_VIEW.res with 1 tile = 32 px, so the 30×17 field
   * is 960×544 px. It is placed (on whole pixels) centred inside DEFENSE_VIEW.view — the part of the
   * stage left of the side panel and below the top bar (960×540 UI units).
   */
  _fitCamera() {
    const V = DEFENSE_VIEW, cam = this.camera, g = this.game;
    cam.setSize(g.width, g.height);
    const W = g.width, H = g.height, ppu = cam.ppu;
    const fw = DEFENSE_MAP.width * ppu, fh = DEFENSE_MAP.height * ppu;
    const x0 = (V.view.x0 / UI_W) * W, x1 = (V.view.x1 / UI_W) * W;
    const y0 = (V.view.y0 / UI_H) * H, y1 = (V.view.y1 / UI_H) * H;
    // World (0, 0) — the field's top-left corner — lands on this internal pixel.
    cam.placeAt(0, 0, x0 + Math.max(0, (x1 - x0 - fw) / 2), y0 + Math.max(0, (y1 - y0 - fh) / 2));
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
    this.top = el('div.df-top.ui-block', {},
      this.topNight,
      el('div.df-relay', {}, el('span.df-lbl', { title: 'Relay Core health. The run ends at 0.' }, '♥ RELAY'), this.relayBar.node),
      this.resHost,
      el('div.grow'),
      this.waveStat,
      el('div.df-ctrl', {}, this.pauseBtn, ...this.speedBtns),
    );

    // ---- side panel
    this.sideHead = el('div.df-head');
    this.sideBody = el('div.df-body.scroll');
    this.sideFoot = el('div.df-foot');
    this.side = el('div.df-side.panel.ui-block', {}, this.sideHead, this.sideBody, this.sideFoot);
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
    this.sideDirty = true;
    this._topKey = {};
    this._refreshTop(true);
    this._renderSide();
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
    const css = this.game.assets.iconStyle(key, size * this.game.u);
    if (css) return el('span.df-ico', { style: css });
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
    const nightTxt = `${this.night}|${this.phase}`;
    if (force || k.night !== nightTxt) {
      k.night = nightTxt;
      const sub = { prep: 'Preparation', wave: 'Wave in progress', won: 'Night survived', lost: 'Relay down' }[this.phase];
      this.topNight.replaceChildren(el('b', `NIGHT ${this.night}`), el('span.muted', ` / ${CONFIG.nights}`), el('div.df-phase', sub));
    }
    const hpTxt = `${Math.ceil(run.relayHp)}|${run.relayMax}`;
    if (force || k.hp !== hpTxt) {
      k.hp = hpTxt;
      const f = run.relayHp / run.relayMax;
      this.relayBar.set(f, `${Math.ceil(run.relayHp)} / ${run.relayMax}`);
      this.relayBar.node.classList.toggle('low', f < 0.3);
    }
    const resTxt = RESOURCE_KEYS.map((r) => run.res[r]).join('|');
    if (force || k.res !== resTxt) {
      k.res = resTxt;
      this.resHost.replaceChildren(resRow(run.res));
      if (this.phase === 'prep') this.sideDirty = true;
    }
    // Wave status
    let wTxt;
    if (this.phase === 'prep') wTxt = `p|${this.wave.total}`;
    else wTxt = `w|${this._toGo()}|${Math.floor(this._progress() * 100)}`;
    if (force || k.wave !== wTxt) {
      k.wave = wTxt;
      if (this.phase === 'prep') {
        this.waveStat.replaceChildren(el('span.df-lbl', 'TONIGHT'), el('b', `${this.wave.total}`), el('span.muted', ' enemies'));
      } else {
        // "N to go" = alive + not yet spawned, so it matches the per-path counts.
        this.waveBar.set(this._progress(), `${Math.floor(this._progress() * 100)}%`);
        this.waveStat.replaceChildren(el('span.df-lbl', 'WAVE'), this.waveBar.node, el('span.df-left', {}, el('b', String(this._toGo())), el('span.muted', ' to go')));
      }
    }
    const ctlTxt = `${this.paused}|${this.speed}`;
    if (force || k.ctl !== ctlTxt) {
      k.ctl = ctlTxt;
      this.pauseBtn.textContent = this.paused ? '▶' : '❚❚';
      this.pauseBtn.classList.toggle('selected', this.paused);
      for (const b of this.speedBtns) b.classList.toggle('selected', Number(b.dataset.speed) === this.speed);
    }
  }

  /** Enemies still to deal with tonight: alive on the map + not yet spawned. */
  _toGo() {
    const pending = this.events ? this.events.length - this.spawnIdx : this.wave.total;
    return Math.max(0, this.totalEnemies - this.resolved) + Math.max(0, pending);
  }

  /**
   * Rough readiness for tonight (READINESS, src/data/guide.js): tower damage over a wave's worth of fire vs
   * the wave's total health. → { ratio, level: 'weak' | 'risky' | 'strong', dps, hp }.
   */
  _readiness() {
    const run = this.run, Rd = READINESS;
    let dps = 0, slow = 0, beacons = 0;
    for (const rec of run.towers) {
      const st = run.towerStats(rec, run.relayHp / run.relayMax);
      const rate = st.cooldown > 0 ? 1 / st.cooldown : 0;
      if (st.kind === 'bullet') dps += st.damage * rate * (st.fifthShotMult ? 1 + (st.fifthShotMult - 1) / 5 : 1);
      else if (st.kind === 'chain') { let m = 1, f = 1; for (let i = 0; i < (st.chains || 0); i++) { f *= st.chainFalloff || 0.7; m += f * 0.6; } dps += st.damage * rate * m; }
      else if (st.kind === 'mortar') dps += st.damage * rate * 2;
      else if (st.kind === 'snare') slow += Rd.slowValue;
      else if (st.kind === 'support') beacons += 1;
    }
    dps = dps * (1 + beacons * Rd.supportValue) + slow;
    let hp = 0;
    for (const e of this.wave.events) hp += (DEFENSE_ENEMIES[e.type]?.hp || 0) * this.hpMult;
    const secs = Rd.waveSeconds[Math.min(Rd.waveSeconds.length, this.night) - 1] || 30;
    const ratio = hp > 0 ? (dps * secs) / hp : 9;
    return { ratio, dps, hp, level: ratio < Rd.weak ? 'weak' : ratio < Rd.ok ? 'risky' : 'strong' };
  }

  /** Start Wave from the button / Space: a weak-looking defense asks once (press again within a few s). */
  _tryStartWave() {
    if (this.phase !== 'prep') return;
    const r = this._readiness();
    if (r.level === 'weak' && !(this.startArmed && this.game.time < this.startArmed)) {
      this.startArmed = this.game.time + 4;
      this.game.sfx.play('error');
      toast(this.game.ui, this.towers.length ? 'Your defense looks too weak for tonight. Build or upgrade more, or press Start again.' : 'You have no towers! Build some first, or press Start again.', 'bad', 3);
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
    else if (this.selPad >= 0 && this.phase === 'prep') mode = 'build';
    this.sideMode = mode;
    const head = this.sideHead, body = this.sideBody, foot = this.sideFoot;
    head.replaceChildren();
    body.replaceChildren();
    foot.replaceChildren();
    if (mode === 'build') this._renderBuild(head, body);
    else if (mode === 'placing') this._renderPlacing(head, body);
    else if (mode === 'tower') this._renderTower(t, head, body);
    else this._renderPreview(head, body);
    this._renderFoot(foot);
    // A different panel (or another tower) starts at the top: the wave preview's THREAT block must not
    // stay scrolled out of view from an earlier panel.
    const sideKey = `${mode}|${this.selPad}|${this.phase}`;
    if (sideKey !== this._sideKey) { this._sideKey = sideKey; body.scrollTop = 0; }
    this._sideMore();
  }

  _sideMore() {
    const b = this.sideBody;
    b.classList.toggle('df-more', b.scrollTop + b.clientHeight < b.scrollHeight - 2);
  }

  _renderBuild(head, body) {
    const run = this.run;
    head.append(el('h2', 'Build a tower'), el('div.small.muted', 'Pick one · Esc to cancel · hover for exact numbers'));
    run.availableTowers(this.game.meta).forEach((type, i) => body.append(this._towerCard(type, i, () => this._build(type, this.selPad))));
    const locked = Object.keys(TOWERS).filter((k) => !run.isTowerUnlocked(k, this.game.meta));
    if (locked.length && this.game.meta.lifetime.runs > 1) body.append(el('div.small.muted.df-note', `🔒 ${locked.map((k) => TOWERS[k].name).join(', ')}: unlock with Research (Collection).`));
  }

  _towerCard(type, i, onPick) {
    const run = this.run;
    const def = TOWERS[type];
    const cost = run.buildCost(type);
    const ok = run.canAfford(cost);
    const reason = ok ? null : run.missing(cost);
    const owned = run.towerCount(type);
    const surcharge = run.buildSurcharge(type);
    // Plain card: name, price, one line, three strength bars. The exact numbers are in the tooltip.
    const exact = `${def.name}: ${def.desc}\n${this._statSummary(this._previewStats(type))}`;
    const card = el(`div.df-card${ok ? '' : '.disabled'}`, {
      title: reason ? `${reason}\n${exact}` : exact,
      onclick: () => {
        if (!ok) { this.game.sfx.play('error'); toast(this.game.ui, reason, 'bad'); return; }
        onPick();
      },
      onmouseenter: () => { this.hoverType = type; },
      onmouseleave: () => { if (this.hoverType === type) this.hoverType = null; },
    },
    el('div.df-cardicon', {}, this._iconFor('tower', type, 26), el('span.df-hk', String(i + 1))),
    el('div.df-cardmain', {},
      el('div.df-cardtop', {}, el('b', def.name), el('span.grow'), costLine(cost, run.res)),
      el('div.df-desc', def.line || def.desc),
      this._pips(def),
      surcharge ? el('div.df-desc.amber', { title: `Each ${def.name} you own adds ${CONFIG.towerSurcharge} Scrap to the next one, so mixing tower types pays.` },
        `+${surcharge} Scrap: you own ${owned} (each one raises the price)`) : null,
      reason ? el('div.df-desc.bad', reason) : null,
    ));
    return card;
  }

  /** Damage / speed / range as 1–3 pips (TOWERS[*].pips). */
  _pips(def) {
    const P = def.pips;
    if (!P) return null;
    return el('div.df-pips', {}, [['Power', 'damage'], ['Speed', 'speed'], ['Range', 'range']].map(([lbl, k]) =>
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
        el('div.df-level', {}, [1, 2, 3].map((n) => el(`span.df-pip${n <= lvl ? '.on' : ''}`)), el('span.small.muted', ` Level ${lvl} of 3`)))),
    );
    body.append(el('div.small', def.line || def.desc));

    // Stats (effective: upgrades, skills, boons and beacon buffs applied).
    const rows = [];
    const rate = 1 / (s.cooldown / (1 + t.buffRate));
    if (s.kind === 'bullet') {
      rows.push(['Damage', fmt(s.damage) + (s.fifthShotMult ? ` (×${s.fifthShotMult} every 5th)` : '')], ['Attacks', `${fmt(rate, 2)}/s`], ['Range', fmt(s.range)]);
      if (s.slowOnHit) rows.push(['Slow', `${Math.round((1 - s.slowOnHit) * 100)}% for ${s.slowTime}s${s.slowRadius ? ', splashes' : ''}`]);
    } else if (s.kind === 'chain') {
      rows.push(['Damage', `${fmt(s.damage)} (−${Math.round((1 - s.chainFalloff) * 100)}% per jump)`], ['Chains', `${s.chains} extra targets`], ['Attacks', `${fmt(rate, 2)}/s`], ['Range', fmt(s.range)]);
      if (s.chainSlow) rows.push(['Slow', `${Math.round((1 - s.chainSlow) * 100)}% for ${s.slowTime}s`]);
    } else if (s.kind === 'mortar') {
      rows.push(['Damage', `${fmt(s.damage)} blast`], ['Blast radius', fmt(s.blastRadius)], ['Attacks', `${fmt(rate, 2)}/s`], ['Range', `${fmt(s.minRange)}–${fmt(s.range)}`]);
      if (s.burnDps) rows.push(['Burning sap', `${s.burnDps}/s for ${s.burnTime}s`]);
    } else if (s.kind === 'snare') {
      rows.push(['Slow', `${Math.round((1 - s.slowMult) * 100)}% for ${s.slowTime}s`], ['Pulse', `every ${fmt(s.cooldown / (1 + t.buffRate), 2)}s`], ['Range', fmt(s.range)]);
      if (s.rootTime) rows.push(['Root', `${s.rootTime}s (each enemy once per ${s.rootCooldown}s)`]);
    } else if (s.kind === 'support') {
      rows.push(['Buff', `+${Math.round(s.buffRate * 100)}% attack speed`], ['Range', fmt(s.range)]);
      if (s.bonusAttackChance) rows.push(['Bonus attack', `${Math.round(s.bonusAttackChance * 100)}% chance`]);
      const n = this.towers.filter((o) => o !== t && o.def.kind !== 'support' && o.pos.distanceTo(t.pos) <= s.range + 0.01).length;
      rows.push(['Buffing', `${n} tower${n === 1 ? '' : 's'}`]);
    }
    if (t.buffRate > 0) rows.push(['Beacon', `+${Math.round(t.buffRate * 100)}% speed${t.bonusChance ? `, ${Math.round(t.bonusChance * 100)}% bonus` : ''}`]);
    // Exact stats stay one hover away: the panel shows the three bars.
    const pips = this._pips(def);
    if (pips) { pips.title = rows.map(([a, b]) => `${a}: ${b}`).join(' · '); body.append(pips); }
    if (t.dmgDealt) body.append(el('div.small.muted', `Damage tonight: ${Math.round(t.dmgDealt)}`));

    // Targeting: from night 2 (night 1 towers shoot the enemy first in line).
    if (['bullet', 'chain', 'mortar'].includes(s.kind) && this.night >= 2) {
      body.append(el('h3', {}, 'Targeting ', el('span.key', 'T')));
      body.append(el('div.row.df-targets', {}, TARGET_RULES.map((r) => {
        const b = button(TARGET_RULE_LABEL[r], () => this._setTarget(t, r), { title: TARGET_RULE_TEXT[r], cls: t.rec.target === r ? 'selected df-tgt' : 'df-tgt' });
        return b;
      })));
      body.append(el('div.small.muted', TARGET_RULE_TEXT[t.rec.target]));
    }

    // Upgrade
    const up = def.upgrades[lvl - 1];
    const wave = this.phase !== 'prep';
    if (wave) {
      // Upgrades and selling are locked mid-wave: keep the panel short so nothing is clipped.
      body.append(el('div.small.muted.df-note', up ? `Next upgrade (after the attack): ${up.desc}` : '★ Max level'));
      return;
    }
    body.append(el('h3', 'Upgrade'));
    if (!up) {
      body.append(el('div.small.good', '★ Max level'));
    } else {
      const cost = run.upgradeCost(t.rec);
      const ok = run.canAfford(cost);
      const free = Object.keys(cost).length === 0;
      const discount = !free && run.hasSkill('field_tuning') && !run.tonight.fieldTuningUsed;
      const reason = wave ? 'Not during a wave' : ok ? null : run.missing(cost);
      body.append(el('div.small', {}, el('b.amber', `Level ${lvl + 1}: `), up.desc));
      const btn = button(el('span', {}, 'Upgrade ', costLine(cost, run.res)), () => this._upgrade(t), { disabled: !!reason, reason, hotkey: 'U', cls: 'primary df-wide' });
      body.append(btn);
      if (free) body.append(el('div.small.good', 'Free upgrade: tonight\'s reward.'));
      else if (discount) body.append(el('div.small.good', `Field Tuning: first upgrade tonight is ${Math.round((1 - SKILLS.field_tuning.scrapMult) * 100)}% off Scrap.`));
      if (reason) body.append(el('div.small.bad', reason));
    }

    // Sell
    const v = run.sellValue(t.rec);
    const armed = this.sellArmed && this.sellArmed.pad === t.rec.pad;
    const sellReason = wave ? 'Not during a wave' : null;
    const refundNote = `Refunds ${Math.round(CONFIG.sellRefund * 100)}% of ${t.rec.spent.scrap || 0} Scrap spent (rounded down). Components aren't refunded.`;
    // The refund rule sits in the heading row (short) and the button tooltip, so nothing is cut off below the button.
    body.append(el('h3.df-sellhead', {}, 'Sell', el('span.small.muted', ` · get back ${Math.round(CONFIG.sellRefund * 100)}% of the Scrap`)));
    const sellBtn = button(el('span', {}, armed ? 'Confirm sell ' : 'Sell for ', resChip('scrap', v, { short: true })), () => this._sell(t), {
      disabled: !!sellReason, reason: sellReason, hotkey: 'S', cls: armed ? 'danger df-wide df-sellarmed' : 'df-wide', title: refundNote,
    });
    if (armed) {
      // Shrinking bar: how long the confirm stays armed (continues across panel re-renders).
      const left = Math.max(0, this.sellArmed.until - this.game.time);
      sellBtn.append(el('span.df-sellbar', { style: { animationDuration: `${DEFENSE.sellConfirm}s`, animationDelay: `${-(DEFENSE.sellConfirm - left).toFixed(2)}s` } }));
    }
    body.append(sellBtn);
    if (armed) {
      body.append(el('div.small.bad', 'Click again (or press S) to confirm.'));
      requestAnimationFrame(() => sellBtn.scrollIntoView({ block: 'nearest' }));
    }
  }

  _renderPreview(head, body) {
    const run = this.run;
    const night = this.night;
    const tn = this.tonight;
    const inWave = this.phase !== 'prep';
    head.append(el('h2', inWave ? 'Still coming' : 'Tonight\'s attack'),
      el('div.small.muted', inWave ? 'Enemies still to arrive on each path' : `Night ${night} · ${this.wave.total} enemies`));

    // District threat and boons first: they're what makes tonight different.
    const thr = tn.threat;
    if (thr) {
      // Tag kept short: wide pixel caps would wrap a district name onto 2–3 lines.
      body.append(el('div.df-threat', { title: `Danger from ${DISTRICTS[this.district]?.name || 'the area'} you visited` }, el('div.df-tag.bad', '⚠ Danger tonight'), el('div.small', thr.text)));
    }
    const boons = tn.boons || [];
    if (boons.length) {
      body.append(el('div.df-boons', {}, el('div.df-tag.good', '▲ Rewards'), boons.map((b) => el('div.small', b.text))));
    }

    // Per-lane counts (in a wave: what's still to spawn).
    let perLane = this.wave.perLane;
    if (inWave && this.events) {
      perLane = [new Map(), new Map()];
      for (let i = this.spawnIdx; i < this.events.length; i++) {
        const e = this.events[i];
        perLane[e.lane].set(e.type, (perLane[e.lane].get(e.type) || 0) + 1);
      }
    }
    this.lanes.forEach((lane, li) => {
      const m = perLane[li];
      let n = 0;
      for (const c of m.values()) n += c;
      const box = el('div.df-lane', {}, el('div.df-lanehead', {}, el('b', lane.name.replace(/lane/i, 'path')), el('span.muted', ` ${n}`)));
      if (!m.size) box.append(el('div.small.muted', inWave ? 'All here.' : 'Quiet tonight.'));
      for (const [type, c] of m) {
        const d = DEFENSE_ENEMIES[type];
        box.append(el(`div.df-erow${d.boss ? '.boss' : ''}`, { title: `${d.name} (${d.role}): ${d.note || ''}` },
          el(`span.df-icoslot${d.boss ? '.boss' : ''}`, {}, this._iconFor('enemy', type, d.boss ? 28 : 18)),
          el('span.df-ename', d.name),
          night > 1 && isNewType(type, night) && !inWave ? el('span.df-new', 'NEW') : null,
          el('span.grow'),
          el('b', `×${c}`)));
      }
      body.append(box);
    });

    // Boss tip: lane-split targeting decides the fight.
    const bossEv = this.wave.events.find((e) => DEFENSE_ENEMIES[e.type]?.boss);
    if (bossEv && !inWave) {
      body.append(el('div.small.df-note', {}, el('b.amber', 'Boss tip: '),
        `set towers covering the ${this.lanes[bossEv.lane].name} to `, el('b', TARGET_RULE_LABEL.strongest), ' so they focus the Colossus.'));
    }

    // New enemy notes
    if (!inWave) {
      const types = new Set([...this.wave.perLane[0].keys(), ...this.wave.perLane[1].keys()]);
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
    const skills = run.skills.filter((k) => DEFENSE_SKILLS.includes(k) && SKILLS[k]);
    if (mods.length || skills.length) {
      body.append(el('div.df-mods', {}, el('div.df-tag', 'Also tonight'),
        mods.map((m) => el('div.small', '• ' + m)),
        skills.map((k) => el('div.small.accent', { title: SKILLS[k].desc }, `◆ ${SKILLS[k].name}: ${SKILLS[k].desc}`))));
    }
    if (!inWave) body.append(el('div.small.muted.df-note', 'Click a glowing square to build. Click a tower to upgrade it.'));
  }

  _renderFoot(foot) {
    const run = this.run;
    const prep = this.phase === 'prep';
    if (prep && this.sideMode === 'preview' && run.res.intel > 0) {
      // Intel: Decrypt (→ Research Data) and Sabotage (smaller wave, once per night). Shown with the
      // wave preview only, and only once you have Intel (a newcomer never sees two dead buttons).
      const I = CONFIG.intel;
      const dCost = run.decryptCost();
      const dReason = run.missing(dCost);
      const sReason = run.sabotageBlocked();
      const cut = Math.round((1 - I.sabotageWave) * 100);
      foot.append(el('div.df-intel', {},
        button(el('span', {}, 'Read ', costLine(dCost, run.res), el('span.df-arrow', ` → +${I.decryptResearch} Research`)), () => this._decrypt(), {
          disabled: !!dReason, cls: 'df-half',
          title: `Read Intel: spend ${I.decryptCost} Intel for ${I.decryptResearch} Research (kept forever; spend it on new gear in Collection).${dReason ? ` ${dReason}.` : ''}`,
        }),
        button(el('span', {}, 'Disrupt ', costLine(run.sabotageCost(), run.res), el('span.df-arrow', ` → ${cut}% fewer enemies`)), () => this._sabotage(), {
          disabled: !!sReason, cls: 'df-half',
          title: `Disrupt the attack: spend ${I.sabotageCost} Intel for ${cut}% fewer enemies tonight (once per night).${sReason ? ` ${sReason}.` : ''}`,
        })));
    }
    // Repair and Emergency Patch: side by side as half buttons when both show (keeps the footer short
    // so the wave preview above keeps its room), full width otherwise.
    const patchOn = run.hasSkill('emergency_patch') && (prep || DEFENSE.emergencyPatchInWave) && (this.phase === 'prep' || this.phase === 'wave');
    const damaged = run.relayHp < run.relayMax;   // Repair shows only when there is something to repair
    const halves = prep && patchOn && damaged;
    const pair = halves ? el('div.df-intel') : foot;
    if (prep && damaged) {
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
    if (prep) {
      // Readiness: one plain line (and a meter) before Start Wave; a weak defense asks before starting.
      const r = this._readiness();
      const armed = this.startArmed && this.game.time < this.startArmed;
      const say = {
        weak: this.towers.length ? "Too weak: this probably won't hold" : 'No towers yet: enemies will walk right in',
        risky: 'Risky: the Relay may take some damage',
        strong: 'Looks strong',
      }[r.level];
      foot.append(el(`div.df-rd-line.${r.level}`, { title: `Rough estimate: your towers' damage over the attack vs the enemies' total health (${Math.round(r.ratio * 100)}%).` },
        el('span.df-rd-k', 'Your defense'),
        el('span.df-meter', {}, [0, 1, 2].map((n) => el(`i${n <= ({ weak: 0, risky: 1, strong: 2 })[r.level] ? '.on' : ''}`))),
        el('span.df-rd-t', say)));
      foot.append(button(el('span', {}, armed ? '▶ Start anyway' : '▶ Start Wave'), () => this._tryStartWave(), { hotkey: 'Space', cls: `primary big df-wide df-start${armed ? ' df-armed' : ''}` }));
    } else if (this.phase === 'wave') {
      foot.append(el('div.small.muted', this.night >= 2
        ? "You can't build until the attack ends. You can still change a tower's targeting."
        : "You can't build until the attack ends."));
    }
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
    if (this.phase !== 'prep' || pad < 0 || this._towerOn(pad)) return false;
    const cost = run.buildCost(type);
    if (!run.canAfford(cost)) { game.sfx.play('error'); toast(game.ui, run.missing(cost), 'bad'); return false; }
    const rec = run.build(type, pad);
    if (!rec) { game.sfx.play('error'); return false; }
    const t = new Tower(this, rec);
    this.towers.push(t);
    game.sfx.play('build');
    this.fx.ring(t.pos, { color: '#feae34', radius: 0.9, life: 0.35 });
    this.fx.burst(t.pos, { color: '#c0cbdc', color2: '#feae34', count: 14, speed: 2, up: 3, life: 0.5, size: 0.07, y: 0.3 });
    if (rec.refunded) toast(game.ui, 'Circuit Recovery: +1 Circuit refunded', 'good');
    run.save('prep');
    this.selPad = pad;
    this.placing = null;
    this.hoverType = null;
    this.sideDirty = true;
    this._refreshTop();
    return true;
  }

  _upgrade(t) {
    const run = this.run;
    const game = this.game;
    if (this.phase !== 'prep' || !t) return;
    const cost = run.upgradeCost(t.rec);
    if (!cost) { toast(game.ui, 'Already at max level', 'amber'); return; }
    if (!run.canAfford(cost)) { game.sfx.play('error'); toast(game.ui, run.missing(cost), 'bad'); return; }
    const free = Object.keys(cost).length === 0;
    if (!run.upgrade(t.rec)) { game.sfx.play('error'); return; }
    t.refreshVisual();
    game.sfx.play('build');
    this.fx.ring(t.pos, { color: '#fee761', radius: 1.1, life: 0.45 });
    this.fx.burst(t.pos, { color: '#fee761', color2: '#feae34', count: 18, speed: 1.6, up: 4, life: 0.6, size: 0.07, y: 0.5 });
    this.fx.text(t.pos, `LEVEL ${t.rec.level}`, { color: '#fee761', cls: 'big', y: this.padBaseY + t.height + 0.7, life: 1 });
    if (free) toast(game.ui, 'Free upgrade used', 'good');
    run.save('prep');
    this.sideDirty = true;
    this._refreshTop();
  }

  _sell(t) {
    const run = this.run;
    const game = this.game;
    if (this.phase !== 'prep' || !t) return;
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
    run.save('prep');
    this.sideDirty = true;
    this._refreshTop();
  }

  _setTarget(t, rule) {
    if (!t || !TARGET_RULES.includes(rule)) return;
    t.rec.target = rule;
    if (this.phase === 'prep') this.run.save('prep');
    this.sideDirty = true;
  }

  _repair() {
    const run = this.run;
    const game = this.game;
    if (this.phase !== 'prep') return;
    if (run.repairAmount() <= 0) { toast(game.ui, 'Relay at full health', 'amber'); return; }
    if (!run.canAfford(run.repairCost())) { game.sfx.play('error'); toast(game.ui, run.missing(run.repairCost()), 'bad'); return; }
    const before = run.relayHp;
    if (!run.repair()) return;
    game.sfx.play('pickup');
    this.fx.burst(this.corePos, { color: '#2ce8f5', color2: '#63c74d', count: 16, speed: 1.5, up: 3, life: 0.6, size: 0.07, y: 1 });
    this.fx.text(this.corePos, `+${Math.round(run.relayHp - before)} HP`, { color: '#63c74d', cls: 'big', y: 3 });
    run.save('prep');
    this.sideDirty = true;
    this._refreshTop();
  }

  _decrypt() {
    const run = this.run;
    const game = this.game;
    if (this.phase !== 'prep') return;
    if (!run.decrypt(game)) { game.sfx.play('error'); toast(game.ui, run.missing(run.decryptCost()) || 'Can\'t decrypt now', 'bad'); return; }
    run.save('prep');
    game.sfx.play('pickup');
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
    this.wave = buildWave(run);
    run.save('prep');
    game.sfx.play('zap');
    toast(game.ui, `Sabotage: ${before - this.wave.total} fewer enemies tonight`, 'good', 2.4);
    this.sideDirty = true;
    this._refreshTop(true);
  }

  _patch() {
    const run = this.run;
    const before = run.relayHp;
    if (!run.emergencyPatch()) { this.game.sfx.play('error'); return; }
    this.game.sfx.play('pickup');
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

  startWave() {
    if (this.phase !== 'prep') return;
    const game = this.game;
    this.phase = 'wave';
    this.waveTime = 0;
    this.wave = buildWave(this.run);
    this.events = this.wave.events;
    this.spawnIdx = 0;
    this.totalEnemies = 0;
    this.resolved = 0;
    this.placing = null;
    this.hoverType = null;
    if (this.selPad >= 0 && !this._towerOn(this.selPad)) this.selPad = -1;
    this.sellArmed = null;
    for (const p of this.pads) p.marker.visible = false;
    // Snapshot with the build locked: quitting mid-wave restarts this wave, never the prep.
    this.run.save('wave');
    game.sfx.play('alarm');
    toast(game.ui, `Night ${this.night}: they're coming!`, 'bad', 2);
    this.sideDirty = true;
    this._refreshTop(true);
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
      this.game.sfx.play('alarm');
      this.game.shake(4, 0.4);
      toast(this.game.ui, `☠ The ${DEFENSE_ENEMIES[type].name} approaches on the ${this.lanes[lane].name}!`, 'bad', 3);
      this._bossEntry = { lane, until: this.game.time + DEFENSE.bossEntry };
    }
    return e;
  }

  /** Apply damage from a tower / zone. Handles numbers, boss research and kills. */
  damage(e, amount, type, opts = {}) {
    if (!e || e.dead || e.removed || amount <= 0) return 0;
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
      this._bountyAcc = (this._bountyAcc || 0) + d.bounty;
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
    this.fx.decal(e.pos, { color: shade(d.color || '#3e8948', JUICE.death.decalShade), radius: (0.25 + (d.size || 0.6) * 0.35) * JUICE.death.decalSize });
    if (!e.burrowed) this.fx.corpse(e.detachVisual(), { dx: e.dir.x, dz: e.dir.z });
    this.game.sfx.play('hit');
    // Seed Carrier: bursts into seedlings unless the killing blow was a blast.
    const od = d.onDeath;
    if (od) {
      if (e.killedBy !== od.unlessDamageType) {
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
      run.awardBossDamage(this.game, 1);
      this.game.shake(10, 0.6);
      this.game.sfx.play('boom');
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
    this.coreHit(this.leakDamage(e));
    e.leaked = true;
    if (e.boss) this.bossBox.style.display = 'none';
    e.remove();
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
        this.coreHit(sp.damage);
      },
    });
    this.game.sfx.play('dodge');
  }

  coreHit(amount) {
    if (this.phase !== 'wave') return;
    const run = this.run;
    const game = this.game;
    run.relayHp = Math.max(0, run.relayHp - amount);
    flashVisual(this.coreVis, '#ff3040', 0.25);
    game.flash('#e43b44', Math.min(0.35, 0.1 + amount * 0.012));
    game.shake(Math.min(10, 2.5 + amount * 0.35), 0.25);
    game.sfx.play('core');
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
    this.game.sfx.play('alarm');
    if (kind === 'charge') this.game.shake(3, 0.3);
    this._bossCues = this._bossCues || {};
    if (kind === 'enrage') {
      // The second act: a roar, a heavy shake and a red pulse; it turns red and loops faster.
      this.game.shake(7, 0.6);
      this.game.sfx.play('boom');
      const b = this.boss;
      if (b && !b.removed) {
        this.fx.ring(b.pos, { color: '#e43b44', radius: 3.2, life: 0.7 });
        this.fx.burst(b.pos, { color: '#ff0044', color2: '#feae34', count: 36, speed: 3.5, up: 3, life: 0.7, size: 0.1, y: b.height * 0.6 });
      }
      this.game.flash('#e43b44', 0.18);
    }
    if (!this._bossCues[kind]) {
      this._bossCues[kind] = true;
      const msg = {
        root: 'The Colossus roots itself — Crawlers will sprout!',
        charge: 'The Colossus is about to CHARGE along the red path!',
        enrage: 'The Colossus is enraged! Its bark hardens, it charges faster, and Skitters sprout with its roots.',
      }[kind];
      toast(this.game.ui, msg, 'bad', kind === 'enrage' ? 3.2 : 2.6);
    }
  }

  bossRootSpawn(boss, type, count, radius, extra = null) {
    this.fx.ring(boss.pos, { color: '#63c74d', radius, life: 0.5 });
    this.fx.burst(boss.pos, { color: '#63c74d', color2: '#733e39', count: 30, speed: 3, up: 3, life: 0.6, size: 0.09, y: 0.1 });
    this.game.shake(3, 0.25);
    this.game.sfx.play('boom');
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
    this.result = run.nightSurvived(game);
    // Save right away (not after the banner) so quitting during it can't replay the night.
    if (this.result === 'victory') this.finalResult = run.finish(game, true);
    else run.save('briefing');
    game.sfx.play('done');
    const last = this.result === 'victory';
    this._banner(last ? 'THE RELAY HOLDS' : `NIGHT ${night} SURVIVED`,
      last ? 'The Canopy Colossus is beaten. Dawn breaks over Verdant Relay.' : `Relay ${Math.ceil(run.relayHp)} / ${run.relayMax} · everything you stored and built stays for tomorrow`, 'good');
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
    game.sfx.play('boom');
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

  _banner(title, sub, cls) {
    this.bannerEl?.remove();
    // Any pointerdown while the banner is up is swallowed (window capture, so nothing under it reacts); after
    // DEFENSE.bannerMinTime it dismisses. The scene switches on the next frame, and the next screen (the
    // briefing) ignores the rest of this click — see BriefingScene._guardInput.
    this.bannerT = 0;
    if (!this._bannerHooked) {
      this._bannerHooked = true;
      this._listen(window, 'pointerdown', (e) => {
        if (!this.bannerEl || (this.phase !== 'won' && this.phase !== 'lost')) return;
        e.stopPropagation(); e.preventDefault();
        this._dismissBanner();
      }, true);
    }
    this.bannerEl = el(`div.df-banner.${cls}.ui-block`, {},
      el('div.df-bannertitle', title), el('div.df-bannersub', sub), el('div.small.muted', 'click or press Enter to continue'));
    this.uiRoot.append(this.bannerEl);
  }

  /** Continue past the end banner (once it has shown for DEFENSE.bannerMinTime). */
  _dismissBanner() {
    if ((this.bannerT || 0) < (DEFENSE.bannerMinTime || 0)) return;
    this.endTimer = Math.min(this.endTimer, 0.01);
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
      this._step(dt, false);
      this._frameVisuals(dt);
      if (this.endTimer <= 0) { this._finishTransition(); return; }
      return;
    }

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
      } else {
        this.prepTime += dt;
        this._step(dt, false);
      }
    }
    this.ground?.update(dt);
    this._frameVisuals(dt);
    this._updateHints();
  }

  /** One simulation step. `active` = wave running (spawns, combat). */
  _step(dt, active) {
    const run = this.run;
    if (active) {
      this.waveTime += dt;
      while (this.spawnIdx < this.events.length && this.events[this.spawnIdx].t <= this.waveTime) {
        const ev = this.events[this.spawnIdx++];
        this.spawnEnemy(ev.type, ev.lane);
        this.totalEnemies += 1;
        this.sideDirty = this.sideDirty || this.sideMode === 'preview';
      }
      // Rapid Response skill: everything is slowed for the first seconds of the wave.
      if (run.hasSkill('rapid_response') && this.waveTime < DEFENSE.rapidResponse.time) {
        const left = DEFENSE.rapidResponse.time - this.waveTime;
        for (const e of this.enemies) e.applySlow(DEFENSE.rapidResponse.mult, Math.min(left, 0.25) + dt, 'rapid');
      }
    }
    this._computeTowerStats();
    if (active) {
      for (const e of this.enemies) e.update(dt);
      if (this.phase !== 'wave') return;          // defeat mid-step
    } else {
      for (const e of this.enemies) updateVisual(e.visual, dt);
    }
    for (const t of this.towers) t.update(dt, this.enemies, active);
    this.projectiles.update(dt);
    this.fx.update(dt);
    if (this.enemies.some((e) => e.removed)) this.enemies = this.enemies.filter((e) => !e.removed);
    if (this.boss && this.boss.removed) this.boss = null;

    if (active && this.phase === 'wave' && this.spawnIdx >= this.events.length && this.enemies.length === 0 && this.projectiles.list.length === 0) {
      this._endNight();
    }
  }

  _computeTowerStats() {
    const run = this.run;
    const frac = run.relayHp / run.relayMax;
    for (const t of this.towers) {
      t.stats = run.towerStats(t.rec, frac);
      t.buffRate = 0;
      t.bonusChance = 0;
    }
    for (const b of this.towers) {
      if (b.stats.kind !== 'support') continue;
      const r = b.stats.range + 0.01;
      for (const t of this.towers) {
        if (t === b || t.stats.kind === 'support') continue;
        if (t.pos.distanceTo(b.pos) <= r) {
          t.buffRate = Math.max(t.buffRate, b.stats.buffRate);
          t.bonusChance = Math.max(t.bonusChance, b.stats.bonusAttackChance || 0);
        }
      }
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
    const L = DEFENSE_VIEW.light;
    const k = this.coreHitT / 0.35;
    this.coreLight.color.copy(this.coreLightColor).lerp(new THREE.Color('#ff3040'), k);
    this.coreLight.intensity = L.coreI * (0.85 + 0.15 * Math.sin(t * 2.2)) * (this.phase === 'lost' ? 0.2 : 1) + k * 4;
    this.coreGlow.material.opacity = 0.14 + 0.06 * Math.sin(t * 2.2);

    // Pads
    const prep = this.phase === 'prep';
    for (const p of this.pads) {
      const occupied = !!this._towerOn(p.i);
      p.marker.visible = prep && !occupied;
      if (!p.marker.visible) continue;
      const hovered = p.i === this.hoverPad;
      const selected = p.i === this.selPad;
      if (selected) { p.mat.color.set('#2ce8f5'); p.mat.opacity = 1; }
      else if (hovered) { p.mat.color.set(this.placing ? '#63c74d' : '#ffffff'); p.mat.opacity = 1; }
      else { p.mat.color.set(this.placing ? '#63c74d' : '#feae34'); p.mat.opacity = 0.4 + 0.25 * Math.sin(t * 3 + p.i * 0.7); }
    }
    // Pulse Beacon buff: amber ring under every boosted tower.
    this.buffRingMat.opacity = 0.4 + 0.3 * Math.sin(t * 4);
    for (const tw of this.towers) {
      if (!tw.buffRing) continue;
      tw.buffRing.visible = tw.buffRate > 0;
      if (tw.buffRing.visible) tw.buffRing.scale.setScalar(1 + 0.06 * Math.sin(t * 4 + tw.rec.pad));
    }
    const selT = this._towerOn(this.selPad);
    if (selT) {
      this.selMarker.visible = true;
      this.selMarker.position.set(selT.pos.x, this.padBaseY + 0.04, selT.pos.z);
      this.selMarker.material.opacity = 0.7 + 0.3 * Math.sin(t * 5);
    } else this.selMarker.visible = false;

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

    // Hovered tower: name + level tag above it.
    const tagT = this._towerOn(this.hoverPad);
    if (tagT && tagT !== selT) {
      const txt = `${TOWERS[tagT.rec.type].name} · L${tagT.rec.level}`;
      if (this.towerTag.textContent !== txt) this.towerTag.textContent = txt;
      this.towerTag.style.setProperty('--c', TOWERS[tagT.rec.type].icon?.color || '#ead4aa');
      const tp = game.project(new THREE.Vector3(tagT.pos.x, this.padBaseY + tagT.height + 0.55, tagT.pos.z), this.camera);
      this.towerTag.style.transform = `translate(${Math.round(tp.x)}px, ${Math.round(tp.y)}px) translate(-50%, -100%)`;
      this.towerTag.style.display = '';
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
      const txt = bossHere ? `☠ ${lane.short} ▸ Colossus` : this.phase === 'prep' ? `${lane.short} ▸ ${count}` : count > 0 ? `${lane.short} ▸ ${count} coming` : '';
      if (n.textContent !== txt) n.textContent = txt;
      n.classList.toggle('boss', !!bossHere);
      n.style.display = txt ? '' : 'none';
      if (!txt) return;
      // Below the lane's entry row at the field edge, clear of the path: enemies (and the boss) walk in
      // along the lane and draw upward from their feet, and their jitter + ground ring stay above
      // DEFENSE.laneTagDrop, so the tag never covers a spawning enemy.
      lane.pointAt(0, tagPos);
      const laneZ = tagPos.z;
      tagPos.set(0.2, 0, laneZ + DEFENSE.laneTagDrop);
      const p = game.project(tagPos, this.camera);
      n.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
      if (bossHere) {
        tagPos.set(0.15, 0, laneZ);
        const a = game.project(tagPos, this.camera);
        this.bossArrow.style.transform = `translate(${a.x.toFixed(0)}px, ${a.y.toFixed(0)}px) translateY(-50%)`;
      }
    });
    if (this.bossArrow.style.display !== (bossEntry ? '' : 'none')) this.bossArrow.style.display = bossEntry ? '' : 'none';

    // Boss bar
    if (this.boss && !this.boss.removed) {
      this.bossBar.set(this.boss.hp / this.boss.maxHp, `${Math.ceil(this.boss.hp)} / ${Math.ceil(this.boss.maxHp)}`);
      if (this.bossPhase.textContent !== this.boss.phaseLabel) {
        this.bossPhase.textContent = this.boss.phaseLabel;
        this.bossPhase.className = `df-bossphase ${/CHARG|charge|ENRAG/.test(this.boss.phaseLabel) ? 'bad' : /Root/.test(this.boss.phaseLabel) ? 'good' : ''}`;
      }
    }

    if (this.sellArmed && game.time > this.sellArmed.until) { this.sellArmed = null; this.sideDirty = true; }
    if (this.sideDirty) this._renderSide();
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
    const prep = this.phase === 'prep';

    if (this._skipInput) { this._skipInput = false; return; }   // the key that closed Settings
    if (this.paused) {
      if (this.settingsOpen) return;   // the settings overlay handles its own keys
      if (inp.wasPressed('Escape') || inp.wasPressed('KeyP') || (inp.wasPressed('Space') && this.phase === 'wave')) this.togglePause(false);
      return;
    }

    this.hoverPad = this._pickPad();
    game.stage.style.cursor = this.hoverPad >= 0 && (prep || this._towerOn(this.hoverPad)) ? 'pointer' : '';

    // Keyboard
    if (inp.wasPressed('Escape')) {
      if (this.placing) { this.placing = null; this.sideDirty = true; }
      else if (this.selPad >= 0) this._select(-1);
      else this.togglePause(true);
      return;
    }
    if (inp.wasPressed('KeyP')) { this.togglePause(true); return; }
    if (inp.wasPressed('Space')) {
      if (prep) this._tryStartWave();
      else this.togglePause(true);
      return;
    }
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
        if (prep) this._upgrade(selT); else toast(game.ui, 'Upgrades are locked during the wave', 'amber');
      }
      if (inp.wasPressed('KeyS')) {
        if (prep) this._sell(selT); else toast(game.ui, 'Selling is locked during the wave', 'amber');
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
    const pad = this.pads.filter((p) => !this._towerOn(p.i)).sort((a, b) => Math.hypot(a.x - this.corePos.x, a.z - this.corePos.z) - Math.hypot(b.x - this.corePos.x, b.z - this.corePos.z))[0];
    if (!pad) return null;
    const pr = this.game.project(new THREE.Vector3(pad.x, 0, pad.z), this.camera);
    const sw = this.game.stage.clientWidth, u = this.game.u;
    return { right: `${Math.round(sw - pr.x + 22 * u)}px`, top: `${Math.round(pr.y - 14 * u)}px`, maxWidth: `${Math.round(230 * u)}px` };
  }

  _updateHints() {
    if (this._curHint && this._curHint.isConnected) return;
    this._curHint = null;
    for (let i = 0; i < this._hintQueue.length; i++) {
      const h = this._hintQueue[i];
      if (!h.when()) continue;
      this._hintQueue.splice(i, 1);
      const n = showHint(this.game, h.id, h.html, { pos: h.pos, style: h.spot?.() || null, time: 11 });
      if (n) { this._curHint = n; break; }
      i--;
    }
  }
}
