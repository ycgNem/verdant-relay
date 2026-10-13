// Day exploration: search a generated district, complete the objective, extract.
//
//   params: { district?, objective? }   (defaults: run.district, run.objectiveFor(district))
//
// Flow: generate map (src/world/ExploreGen.js) → build world/entities/HUD → play →
//   extract (hold E in the open extraction zone or at the emergency beacon), die, or abandon →
//   build the result object → run.applyExpedition(result, game) → game.go('summary').
// Loot picked up lives in `this.carried` until extraction; the Run only changes through the result.
//
// Testers: `vr.game.scene.debug` → teleport(x, z), completeObjective(), giveLoot(), killAll(),
// timeLeft(s), extract(), die(), info().

import * as THREE from 'three';
import '../ui/explore.css';
import { CONFIG, RESOURCES, RESOURCE_KEYS, TOOL } from '../data/config.js';
import { DISTRICTS, DISTRICT_KEYS } from '../data/districts.js';
import { PRIMARY, OPTIONAL, EVENTS } from '../data/objectives.js';
import { EXPLORE_ENEMIES } from '../data/enemies.js';
import { Run } from '../core/Run.js';
import { Fx } from '../core/Fx.js';
import { setAnim, setFacing, updateVisual, setStatus, setOpacity, flashVisual } from '../core/Assets.js';
import { generateExpedition, FLAG, CELL_W, CELL_H, nightTune, enemyRole } from '../world/ExploreGen.js';
import { TileWorld } from '../world/TileWorld.js';
import { moveCircle, lineOfSight } from '../world/collide.js';
import { Player } from '../entities/Player.js';
import { ExploreEnemy } from '../entities/ExploreEnemy.js';
import { Shots } from '../entities/ExploreShots.js';
import { Minimap, MARKER_STYLE, TILE_LEGEND } from '../ui/Minimap.js';
import { el, button, bar, toast, modal, fmtTime, resChip } from '../ui/ui.js';
import { showHint } from '../ui/hints.js';
import { ROOM_W, ROOM_H } from '../data/rooms.js';
import { openSettingsOverlay } from './SettingsScene.js';

const X = () => CONFIG.expedition;
const CONTAINER_NAMES = { crate: 'Crate', chest: 'Tool Chest', cache: 'Rare Cache', intel_terminal: 'Intel Terminal' };
const PROP_VERBS = {
  power_box: 'Install the fuse', terminal: 'Download the route data', pump: 'Activate the pump', cell_cache: 'Crack the power-cell cache',
};

export class ExploreScene {
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
    this.look = this.D.look;
    this.objKey = params.objective || run.objectiveFor(this.district);
    this.objDef = PRIMARY[this.objKey];
    this.map = generateExpedition({ run, district: this.district, objective: this.objKey });

    // ---- 3D scene
    const L = this.look;
    this.three = new THREE.Scene();
    this.three.background = new THREE.Color(L.fog);
    this.three.fog = new THREE.Fog(L.fog, 16, 42);
    const cam = X().camera;
    this.camera = new THREE.PerspectiveCamera(cam.fov, game.width / game.height, 0.5, 80);
    const pitch = THREE.MathUtils.degToRad(cam.pitch);
    this.camOffset = new THREE.Vector3(0, Math.sin(pitch) * cam.dist, Math.cos(pitch) * cam.dist);
    const hemi = new THREE.HemisphereLight(L.sun, L.wall, X().light.hemi);
    const sun = new THREE.DirectionalLight(L.sun, X().light.sun);
    sun.position.set(-6, 10, -4);
    this.three.add(hemi, sun, sun.target);
    game.assets.setTint('#ffffff');

    this.world = new TileWorld(game, this.three, this.map, L, this.district);
    this.fx = new Fx(game, this.three, this.camera);
    this.shots = new Shots(this);
    this.player = new Player(this, this.map.start.x, this.map.start.z);
    this.camFocus = new THREE.Vector3(this.map.start.x, 0, this.map.start.z);
    this._placeCamera(0, true);

    // ---- expedition state
    this.time = 0;
    this.timeLeft = X().time;
    this.overtime = false;
    this.overT = 0;
    this.lateT = 0;
    this.beacon = null;
    this.carried = { scrap: 0, circuits: 0, biofiber: 0, intel: 0 };
    this.kills = 0;
    this.spEarned = 0;
    this.optionalsDone = [];
    this.eventsDone = [];
    this.objectiveDone = false;
    this.objStep = 0;
    this.stepCount = 0;
    this.hasFuse = false;
    this.safeHandsUsed = false;
    this.sporeT = 0.25;
    this.paused = false;
    this.mapOpen = false;
    this.ending = false;
    this.finished = false;
    this.timeScale = 1;
    this.timers = [];
    this.enemies = [];
    this.pickups = [];
    this.interactables = [];
    this.decor = [];
    this.brambles = new Map();
    this.alarms = [];
    this.spores = [];
    this.nests = [];
    this.floaters = [];        // 3D objective markers
    this.revealed = new Uint8Array(this.map.rooms.length);
    this.knownRooms = new Set();
    this.playerRoom = -1;
    this.flow = new Int16Array(this.map.w * this.map.h).fill(-1);
    this.flowTile = -1;
    this.holdTarget = null;
    this.warned = {};
    this.medFullT = 0;

    this._spawnThings();
    this._buildExtraction();
    this.minimap = new Minimap(this.map, this.world);
    this._buildHud();
    this._updateRoom();
    this._updateFlow(true);
    // Known from the briefing: the rooms of the objective's props.
    for (const it of this.interactables) if (it.kind === 'primary') this.knownRooms.add(it.room);
    for (const e of this.enemies) if (e.objective) this.knownRooms.add(e.room);

    this._onVis = () => { if (document.hidden && !this.ending) this.setPaused(true); };
    document.addEventListener('visibilitychange', this._onVis);
    game.stage.style.cursor = 'none';
    game.music?.play('day');

    this._hintQueue = [];
    // Controls first: queued right away, so a bramble or loot hint triggered on frame one can't jump ahead.
    this._hint('explore_move', '<b>WASD</b> move · <b>mouse</b> aim · <b>LMB</b> fire · <b>RMB</b> Pulse Cutter · <b>Space</b> dodge (i-frames) · <b>E</b> interact · <b>Q</b> med kit · <b>Tab</b> map · <b>Esc</b> pause', 'bottom-left', 11);
    this.later(4, () => this._hint('explore_objective', `Your <b>objective</b> is on the right and marked <span style="color:#feae34">◆</span> on the map. Finish it to open <b>extraction</b>. Loot you carry is only kept if you extract.`, 'bottom-left', 11));
    if (this.map.things.some((t) => t.kind === 'med' && t.startKit)) {
      this.later(4.5, () => this._hint('explore_medkit', 'A <span style="color:#e43b44">✚ med kit</span> lies in this room: walk over it to carry it, press <b>Q</b> to heal 25 HP. Ranged enemies hurt: fight from cover and <b>dodge</b> when you see an aim line.', 'bottom-left', 11));
    }

    this.debug = this._makeDebug();
    toast(game.ui, `${this.D.name} — ${this.objDef.name}`, 'amber', 3);
  }

  later(t, fn) { this.timers.push({ t, fn }); }

  _hint(id, html, pos = 'bottom-left', time = 10) {
    this._hintQueue.push({ id, html, pos, time });
  }

  _pumpHints() {
    if (!this._hintQueue.length) return;
    if (this.game.ui.querySelector('.hint')) return;
    const h = this._hintQueue.shift();
    showHint(this.game, h.id, h.html, { pos: h.pos, time: h.time });
  }

  // ------------------------------------------------------------------ entities

  _spawnThings() {
    const game = this.game;
    for (const t of this.map.things) {
      switch (t.kind) {
        case 'decor': {
          const v = game.assets.makeVisual(t.key, { scale: t.key.startsWith('tree') ? 0.9 + ((t.tx * 7 + t.ty * 3) % 5) * 0.06 : 1 });
          v.position.set(t.x, 0, t.z);
          setFacing(v, t.flip ? -1 : 1, 0.01);
          if (v.userData.vis.kind === 'model') v.userData.vis.body.rotation.y = ((t.tx * 13 + t.ty * 7) % 8) * 0.785;
          setAnim(v, 'idle');
          this.three.add(v);
          this.decor.push(v);
          break;
        }
        case 'bramble': {
          const v = game.assets.makeVisual('bramble');
          v.position.set(t.x, 0, t.z);
          setFacing(v, (t.tx + t.ty) % 2 ? -1 : 1, 0.01);
          this.three.add(v);
          this.brambles.set(t.tx + t.ty * this.map.w, { tx: t.tx, ty: t.ty, vis: v });
          break;
        }
        case 'spore': {
          const v = game.assets.makeVisual('spores', { shadow: false });
          v.position.set(t.x, 0, t.z);
          setAnim(v, 'idle');
          this.three.add(v);
          this.spores.push({ tx: t.tx, ty: t.ty, vis: v, puffT: Math.random() * 2 });
          break;
        }
        case 'alarm': {
          const v = game.assets.makeVisual('alarm', { shadow: false });
          v.position.set(t.x, 0, t.z);
          setAnim(v, 'idle');
          this.three.add(v);
          this.alarms.push({ tx: t.tx, ty: t.ty, room: t.room, vis: v, active: true });
          break;
        }
        case 'container': this._addContainer(t); break;
        case 'med': this.spawnPickup('med', 1, t.x, t.z, { still: true }); break;
        case 'enemy': {
          const e = new ExploreEnemy(this, t.key, t.x, t.z, { elite: t.elite, objective: t.objective, guard: t.guard, room: t.room });
          this.enemies.push(e);
          break;
        }
        case 'primary': this._addPrimary(t); break;
        case 'optional': this._addOptional(t); break;
        case 'event': this._addEvent(t); break;
      }
    }
  }

  _makeProp(key, t) {
    const v = this.game.assets.makeVisual(key);
    v.position.set(t.x, 0, t.z);
    setAnim(v, 'off');
    this.three.add(v);
    return v;
  }

  _addInteractable(o) {
    const it = {
      progress: 0, done: false, hold: 0, enabled: () => true, reason: '', keepProgress: true, radius: X().interactRadius,
      ...o,
    };
    if (it.solid) it.radius += 0.45;
    this.interactables.push(it);
    return it;
  }

  _addContainer(t) {
    const v = this._makeProp(t.key, t);
    const def = X().containers[t.key] || {};
    this._addInteractable({
      kind: 'container', key: t.key, x: t.x, z: t.z, tx: t.tx, ty: t.ty, room: t.room, vis: v, solid: true,
      hold: def.hold || 0, loot: t.loot, ambush: t.ambush, scavenger: true,
      verb: `${t.key === 'intel_terminal' ? 'Download' : 'Open'} ${CONTAINER_NAMES[t.key]}`,
      onComplete: (it) => this._openContainer(it),
    });
  }

  _addPrimary(t) {
    const step = this.objDef.steps[t.step];
    if (t.key === 'fuse') {
      const v = this._makeProp('fuse', t);
      setAnim(v, 'idle');
      const it = this._addInteractable({
        kind: 'primary', key: 'fuse', x: t.x, z: t.z, room: t.room, vis: v, step: t.step, walkOver: true,
        verb: 'Take the fuse',
        onComplete: (it2) => {
          this._removeVis(it2);
          this.hasFuse = true;
          this.fx.burst({ x: t.x, z: t.z }, { color: '#feae34', color2: '#fee761', count: 14, speed: 2, up: 3, life: 0.5 });
          this.game.sfx.play('pickup');
          this.toast('Fuse found — install it in the power box', 'amber');
          this._advanceStep(t.step);
        },
      });
      this._addFloater(it, 'objective');
      return;
    }
    const v = this._makeProp(t.key, t);
    setStatus(v, '#e43b44');
    const hold = step.hold || 1.5;
    const spawnDuring = Math.min(step.spawnDuring || 0, nightTune('holdSpawns', this.game.run.night));
    const it = this._addInteractable({
      kind: 'primary', key: t.key, x: t.x, z: t.z, tx: t.tx, ty: t.ty, room: t.room, vis: v, solid: true, step: t.step,
      hold, spawnDuring, spawned: 0, objectiveHold: true,
      enabled: () => this.objStep === t.step,
      reason: t.key === 'power_box' ? 'Needs a fuse — find it first (◆ on the map)' : 'Not yet',
      verb: PROP_VERBS[t.key] || 'Activate',
      card: spawnDuring ? { title: this.objDef.name, lines: [`<span class="bad">Risk:</span> ${spawnDuring} enemies arrive while you hold`, `<span class="muted">${hold}s hold · progress is kept if you let go · you can shoot while holding</span>`] } : null,
      onComplete: (it2) => {
        setAnim(v, 'on');
        setStatus(v, '#63c74d');
        this.fx.burst({ x: t.x, z: t.z }, { color: '#63c74d', color2: '#2ce8f5', count: 18, speed: 2.5, up: 3, life: 0.6 });
        this.fx.ring({ x: t.x, z: t.z }, { color: '#63c74d', radius: 1.8, life: 0.4 });
        this.game.sfx.play('done');
        this._advanceStep(t.step, step.count || 1);
      },
    });
    this._addFloater(it, 'objective');
  }

  _addOptional(t) {
    const def = OPTIONAL[t.key];
    if (def.type === 'kill') {
      const v = this._makeProp(def.prop, t);
      setAnim(v, 'idle');
      const nest = {
        kind: 'nest', key: t.key, x: t.x, z: t.z, tx: t.tx, ty: t.ty, room: t.room, vis: v, radius: 0.75, assist: true,
        hp: def.hp, maxHp: def.hp, dead: false, spawnT: 3, children: [], bloodColor: '#b55088',
        hit: (dmg, dx, dz, kb, src) => this._hitNest(nest, dmg, src),
      };
      this._makeNestBar(nest);
      this.nests.push(nest);
      this._addFloater(nest, 'optional');
      return;
    }
    const v = this._makeProp(def.prop, t);
    setAnim(v, def.prop === 'data_log' ? 'idle' : 'off');
    const reward = this._rewardText(def.reward, def.flag, def.skillPoint, def.research);
    const it = this._addInteractable({
      kind: 'optional', key: t.key, x: t.x, z: t.z, tx: t.tx, ty: t.ty, room: t.room, vis: v, solid: t.solid,
      hold: def.type === 'activate' ? def.hold : 0, walkOver: def.type === 'pickup', objectiveHold: true,
      verb: def.name,
      card: { title: `Optional: ${def.name}`, lines: [`<span class="good">Reward:</span> ${reward}`] },
      onComplete: (it2) => this._completeOptional(it2, def),
    });
    this._addFloater(it, 'optional');
  }

  _addEvent(t) {
    const def = EVENTS[t.key];
    const v = this._makeProp(def.prop, t);
    if (t.key === 'power_surge') setStatus(v, '#fee761');
    const night = this.game.run.night;
    const spawnDuring = Math.min(def.spawnDuring || 0, nightTune('holdSpawns', night));
    const guards = Math.min(def.guards || 0, nightTune('guards', night));
    const risk = [];
    if (spawnDuring) risk.push(`${spawnDuring} enemies arrive while you work`);
    if (guards) risk.push(`${guards} hidden guards burst out`);
    const it = this._addInteractable({
      kind: 'event', key: t.key, x: t.x, z: t.z, tx: t.tx, ty: t.ty, room: t.room, vis: v, solid: true,
      hold: def.hold, spawnDuring, spawned: 0, guards, objectiveHold: true,
      verb: def.prompt,
      card: {
        title: `Event: ${def.name}`,
        lines: [
          `<span class="good">Reward:</span> ${this._rewardText(def.reward, def.flag)}`,
          `<span class="bad">Risk:</span> ${risk.join(' · ') || 'none'}`,
          `<span class="muted">${def.hold}s hold</span>`,
        ],
      },
      onStart: (it2) => { if (it2.guards) this._spawnGuards(it2); },
      onComplete: (it2) => this._completeEvent(it2, def),
    });
    this._addFloater(it, 'event');
  }

  _rewardText(reward, flag, sp, research) {
    const parts = [];
    for (const k of RESOURCE_KEYS) if (reward?.[k]) parts.push(`+${reward[k]} ${RESOURCES[k].glyph} ${RESOURCES[k].label}`);
    if (flag) parts.push(flag.text);
    if (research) parts.push(`+${research} Research`);
    if (sp) parts.push('+1 skill point');
    return parts.join(' · ') || '—';
  }

  _buildExtraction() {
    const ex = this.map.extract;
    this.extractZone = this._makeZone(ex.x, ex.z);
    this.extractIt = this._addInteractable({
      kind: 'extract', x: ex.x, z: ex.z, room: ex.room, radius: X().extractRadius, hold: X().extractHold, keepProgress: false, objectiveHold: true,
      enabled: () => this.objectiveDone,
      reason: 'Extraction locked — complete the objective first',
      verb: 'Extract',
      onComplete: () => this._extract(),
    });
  }

  /** Extraction ring: grey while locked, cyan with a light column when open. */
  _makeZone(x, z) {
    const r = X().extractRadius;
    const g = new THREE.Group();
    g.position.set(x, 0.03, z);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#8b9bb4', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.14, r, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    const fillMat = new THREE.MeshBasicMaterial({ color: '#8b9bb4', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r - 0.14, 40), fillMat);
    fill.rotation.x = -Math.PI / 2;
    const progMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const prog = new THREE.Mesh(new THREE.CircleGeometry(r - 0.14, 40), progMat);
    prog.rotation.x = -Math.PI / 2;
    prog.position.y = 0.005;
    prog.scale.setScalar(0.001);
    const colMat = new THREE.MeshBasicMaterial({ color: '#2ce8f5', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.9, 3.2, 24, 1, true), colMat);
    column.position.y = 1.6;
    column.visible = false;
    g.add(ring, fill, prog, column);
    this.three.add(g);
    return { g, ring, ringMat, fillMat, prog, column, open: false };
  }

  _setZoneOpen(zone, open) {
    zone.open = open;
    const c = open ? '#2ce8f5' : '#8b9bb4';
    zone.ringMat.color.set(c);
    zone.fillMat.color.set(c);
    zone.column.visible = open;
  }

  _addFloater(target, type) {
    const color = MARKER_STYLE[type].color;
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), mat);
    mesh.scale.set(1, 1.5, 1);
    mesh.renderOrder = 15;
    this.three.add(mesh);
    this.floaters.push({ target, mesh, type, phase: Math.random() * 6 });
  }

  _removeVis(it) {
    if (it.vis) { this.game.assets.disposeVisual(it.vis); it.vis = null; }
  }

  // ------------------------------------------------------------------ objective logic

  _advanceStep(step, needed = 1) {
    if (step !== this.objStep || this.objectiveDone) return;
    this.stepCount += 1;
    if (this.stepCount < needed) {
      this.toast(`${this.objDef.steps[step].label}: ${this.stepCount}/${needed}`, 'amber');
      return;
    }
    this.objStep += 1;
    this.stepCount = 0;
    if (this.objStep >= this.objDef.steps.length) this.completeObjective();
  }

  completeObjective() {
    if (this.objectiveDone) return;
    this.objectiveDone = true;
    this.objStep = this.objDef.steps.length;
    this._grantSkillPoint();
    this._setZoneOpen(this.extractZone, true);
    this.knownRooms.add(this.map.extract.room);
    this.game.sfx.play('done');
    this.toast(`Objective complete! Extraction is open`, 'good', 3.5);
    this._banner('OBJECTIVE COMPLETE', 'Extraction is open — head for the cyan zone, or keep looting');
    this._hint('explore_extract', 'Extraction is <b>open</b>: follow the <span style="color:#2ce8f5">cyan arrow</span> and <b>hold E</b> in the zone. You can keep exploring first, but the timer is running.', 'bottom-left', 10);
    // Any leftover objective props are no longer needed.
    for (const it of this.interactables) if (it.kind === 'primary') it.done = true;
  }

  _grantSkillPoint() {
    if (this.spEarned >= X().maxSkillPoints) return false;
    this.spEarned += 1;
    this.later(0.6, () => this.toast('+1 skill point', 'good'));
    return true;
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
    if (def.reward) this._spill(def.reward, it.x, it.z, it.solid);
    this.fx.burst({ x: it.x, z: it.z }, { color: '#c47bff', color2: '#ffffff', count: 18, speed: 2.4, up: 3, life: 0.6 });
    this.game.sfx.play('done');
    this.toast(`Optional complete: ${def.name}`, 'good', 3);
    if (def.flag) this.later(0.4, () => this.toast(def.flag.text, 'amber', 3.2));
    if (def.skillPoint && !this._grantSkillPoint()) this.later(0.6, () => this.toast('Skill point cap reached for this expedition', 'amber'));
    if (it.key === 'survivor' && it.vis) {
      // The engineer heads back to the Relay on their own.
      const v = it.vis;
      it.vis = null;
      this.fades = this.fades || [];
      this.fades.push({ v, t: 0 });
    }
  }

  _completeEvent(it, def) {
    it.done = true;
    if (it.vis) { setAnim(it.vis, 'on'); setStatus(it.vis, '#63c74d'); }
    const rec = { key: it.key, name: def.name };
    if (def.flag) rec.flag = def.flag;
    this.eventsDone.push(rec);
    if (def.reward) this._spill(def.reward, it.x, it.z, true);
    if (it.key === 'power_surge') {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.line(new THREE.Vector3(it.x, 1, it.z), new THREE.Vector3(it.x + Math.cos(a) * 3, 0.2, it.z + Math.sin(a) * 3), { color: '#fee761', jag: 0.6, life: 0.3 });
      }
      this.game.flash('#fee761', 0.25);
    }
    this.fx.burst({ x: it.x, z: it.z }, { color: '#fee761', color2: '#ffffff', count: 18, speed: 2.4, up: 3, life: 0.6 });
    this.game.sfx.play('done');
    this.toast(`${def.name}: done`, 'good', 3);
    if (def.flag) this.later(0.4, () => this.toast(def.flag.text, 'amber', 3.2));
  }

  _hitNest(n, dmg, src) {
    if (n.dead) return;
    dmg = Math.round(dmg);
    n.hp -= dmg;
    n.barT = 3;
    flashVisual(n.vis, '#ffffff', 0.09);
    this.fx.text({ x: n.x, z: n.z }, String(dmg), { color: src === 'cutter' ? '#2ce8f5' : '#ead4aa', y: 1.3, life: 0.6 });
    this.fx.burst({ x: n.x, z: n.z }, { color: '#b55088', count: 5, speed: 2, up: 2, life: 0.35 });
    this.game.sfx.play('hit');
    if (n.hp <= 0) {
      n.dead = true;
      this.fx.burst({ x: n.x, z: n.z }, { color: '#b55088', color2: '#ff0044', count: 40, speed: 4, up: 4, life: 0.8, size: 0.1 });
      this.fx.ring({ x: n.x, z: n.z }, { color: '#ff0044', radius: 2.5, life: 0.5 });
      this.game.sfx.play('boom');
      this.game.shake(6, 0.3);
      this._removeVis(n);
      n.barBg.visible = n.barFill.visible = false;
      // Unlock the solid tile it stood on.
      this.world.clearFlags(n.tx, n.ty, FLAG.SOLID);
      this._completeOptional({ key: n.key, x: n.x, z: n.z, solid: false, done: false, vis: null }, OPTIONAL[n.key]);
    }
  }

  _makeNestBar(n) {
    const mk = (c) => new THREE.Sprite(new THREE.SpriteMaterial({ color: c, depthTest: false, depthWrite: false }));
    n.barBg = mk('#181425'); n.barFill = mk('#c47bff');
    n.barFill.center.set(0, 0.5);
    n.barBg.scale.set(1.08, 0.13, 1);
    n.barFill.scale.set(1, 0.07, 1);
    n.barBg.renderOrder = 20; n.barFill.renderOrder = 21;
    n.barBg.visible = n.barFill.visible = false;
    this.three.add(n.barBg, n.barFill);
    n.barT = 0;
  }

  // ------------------------------------------------------------------ containers & loot

  _openContainer(it) {
    it.done = true;
    this.game.sfx.play('open');
    this._removeVis(it);
    const v = this.game.assets.makeVisual('opened');
    v.position.set(it.x, 0, it.z);
    this.three.add(v);
    it.vis = v;
    this.fx.burst({ x: it.x, z: it.z }, { color: '#e4a672', color2: '#feae34', count: 10, speed: 2, up: 3, life: 0.4 });
    this._spill(it.loot, it.x, it.z, true);
    if (!this.warned.loot) {
      this.warned.loot = true;
      this._hint('explore_loot', 'Loot is <b>carried</b> (top-left) until you <b>extract</b>. If you go down, what you carry is lost, and a lean expedition means fewer towers tonight. Extract when you\'re hurt.', 'bottom-left', 10);
    }
    if (it.ambush) this._ambush(it);
  }

  /** Scatter loot pickups out of a container / prop. */
  _spill(loot, x, z, fromSolid) {
    const pieces = [];
    for (const k of RESOURCE_KEYS) {
      let n = loot[k] || 0;
      if (!n) continue;
      if (k === 'scrap') {
        // Scrap splits into a few chunks so a container "pops".
        const chunks = Math.min(4, Math.max(1, Math.round(n / 6)));
        for (let c = 0; c < chunks; c++) {
          const a = Math.floor(n / (chunks - c));
          pieces.push([k, a]);
          n -= a;
        }
      } else {
        for (let c = 0; c < n; c++) pieces.push([k, 1]);
      }
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
    const p = {
      res, amount, x, z, y: o.still ? 0 : 0.3, vx: o.vx || 0, vz: o.vz || 0, vy: o.still ? 0 : 3.2,
      vis: v, age: 0, delay: o.delay ?? 0.3, bob: Math.random() * 6, dead: false,
    };
    if (o.out) {
      // Start just outside the container so the pickup isn't stuck inside a solid tile.
      const l = Math.hypot(p.vx, p.vz) || 1;
      p.x += (p.vx / l) * o.out; p.z += (p.vz / l) * o.out;
    }
    setAnim(v, 'idle');
    v.position.set(p.x, p.y, p.z);
    this.three.add(v);
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
      // Pop out and bounce.
      if (p.y > 0 || p.vy > 0) {
        p.vy -= 14 * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) { p.y = 0; p.vy = Math.abs(p.vy) > 1.5 ? -p.vy * 0.35 : 0; }
      }
      const fr = Math.exp(-3 * dt);
      p.vx *= fr; p.vz *= fr;
      // Loose pickups slide against walls; once the magnet has them they fly over everything.
      if (!p.magnet && Math.abs(p.vx) + Math.abs(p.vz) > 0.01) moveCircle(this.world, p, p.vx * dt, p.vz * dt, 0.15);
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
          if (this.medFullT <= 0) { this.fx.text(pl.pos, 'Med kits full', { color: '#8b9bb4', y: 1.5 }); this.medFullT = 2; }
        } else this._collect(p);
      }
      p.vis.position.set(p.x, p.y + 0.05 + (p.y === 0 ? Math.abs(Math.sin(p.age * 3 + p.bob)) * 0.06 : 0), p.z);
      updateVisual(p.vis, dt);
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (this.pickups[i].dead) { this.game.assets.disposeVisual(this.pickups[i].vis); this.pickups.splice(i, 1); }
    }
  }

  _collect(p) {
    p.dead = true;
    if (p.res === 'med') {
      this.player.meds += 1;
      this.fx.text(this.player.pos, '+1 ✚ Med kit', { color: '#e43b44', y: 1.5 });
    } else {
      this.carried[p.res] += p.amount;
      const r = RESOURCES[p.res];
      this.fx.text(this.player.pos, `+${p.amount} ${r.glyph} ${r.label}`, { color: r.color, y: 1.5 });
      this._bumpLoot(p.res);
    }
    this.game.sfx.play('pickup');
  }

  _ambush(it) {
    const [lo, hi] = X().ambushCount;
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    this.toast('Ambush!', 'bad');
    this.game.sfx.play('alarm');
    for (let i = 0; i < n; i++) {
      const p = this._spawnPointNear(it.x, it.z, 2.2, 4.5);
      if (p) this.spawnEnemy(this._pickEnemy(), p.x, p.z, { spawnIn: true });
    }
  }

  _spawnGuards(it) {
    this.toast('Guards burst out of hiding!', 'bad');
    this.game.sfx.play('alarm');
    for (let i = 0; i < it.guards; i++) {
      const p = this._spawnPointNear(it.x, it.z, 2.2, 4.5);
      if (p) this.spawnEnemy(this._pickEnemy(), p.x, p.z, { spawnIn: true });
    }
  }

  // ------------------------------------------------------------------ enemies

  hittables() {
    if (!this._hitList) this._hitList = [];
    const out = this._hitList;
    out.length = 0;
    for (const e of this.enemies) if (!e.dead && e.state !== 'spawn') out.push(e);
    for (const n of this.nests) if (!n.dead) out.push(n);
    return out;
  }

  _pickEnemy() {
    // Runtime spawns (reinforcements, guards, ambushes) skip ranged / charging enemies when the
    // player already faces as many of them nearby as tonight's room cap allows.
    const night = this.game.run.night;
    const near = { ranged: 0, charger: 0, melee: 0 };
    const pl = this.player.pos;
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - pl.x, e.z - pl.z) < 14) near[enemyRole(e.key)]++;
    const cap = { ranged: nightTune('rangedCap', night), charger: nightTune('chargerCap', night), melee: Infinity };
    let keys = Object.keys(this.D.enemies).filter((k) => EXPLORE_ENEMIES[k]);
    const capped = keys.filter((k) => near[enemyRole(k)] < cap[enemyRole(k)]);
    if (capped.length) keys = capped;
    const w = {};
    for (const k of keys) w[k] = this.D.enemies[k];
    let total = 0;
    for (const k in w) total += w[k];
    let r = Math.random() * total;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return keys[0];
  }

  spawnEnemy(key, x, z, opts = {}) {
    const e = new ExploreEnemy(this, key, x, z, { alerted: true, ...opts });
    this.enemies.push(e);
    return e;
  }

  alertNear(x, z, r, src) {
    for (const e of this.enemies) {
      if (e === src || e.dead || e.alerted) continue;
      if (Math.hypot(e.x - x, e.z - z) <= r && lineOfSight(this.world, x, z, e.x, e.z)) e.alert(false);
    }
  }

  onEnemyKilled(e) {
    this.kills += 1;
    const d = e.def;
    const drop = X().enemyDrop;
    const m = this.D.loot;
    if (Math.random() < d.drop) {
      const s = Math.max(1, Math.round((drop.scrap[0] + Math.random() * (drop.scrap[1] - drop.scrap[0])) * m.scrap));
      this.spawnPickup('scrap', s, e.x, e.z, { vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
      if (Math.random() < drop.componentChance) {
        const k = Math.random() < m.circuits / (m.circuits + m.biofiber) ? 'circuits' : 'biofiber';
        this.spawnPickup(k, 1, e.x, e.z, { vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
      }
    }
    if (Math.random() < drop.medChance * m.med) this.spawnPickup('med', 1, e.x, e.z, { vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
    if (e.objective) {
      this.toast('The Razorback is down — the way is clear', 'good');
      this._advanceStep(this.objDef.steps.findIndex((s) => s.type === 'kill'));
    }
  }

  _updateEnemies(dt) {
    for (const e of this.enemies) e.update(dt);
    // Separation: push overlapping enemies apart (not mid-lunge / mid-charge).
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.state === 'spawn') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.state === 'spawn') continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const r = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (r - d) * 0.5;
        const ax = a.state === 'attack' ? 0 : 1, bx = b.state === 'attack' ? 0 : 1;
        if (ax) moveCircle(this.world, a, (-dx / d) * push, (-dz / d) * push, a.radius);
        if (bx) moveCircle(this.world, b, (dx / d) * push, (dz / d) * push, b.radius);
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].dead) { list[i].dispose(); list.splice(i, 1); }
    }
  }

  _updateNests(dt) {
    const N = X().nest;
    for (const n of this.nests) {
      if (n.dead) continue;
      updateVisual(n.vis, dt);
      n.barT -= dt;
      n.children = n.children.filter((c) => !c.dead);
      const d = Math.hypot(this.player.pos.x - n.x, this.player.pos.z - n.z);
      if (d < N.radius && this.revealed[n.room]) {
        n.spawnT -= dt;
        if (n.spawnT <= 0 && n.children.length < N.maxAlive) {
          n.spawnT = N.spawnEvery;
          const p = this._spawnPointNear(n.x, n.z, 1, 2.2, true);
          if (p) {
            const types = Object.keys(N.types);
            let r = Math.random() * types.reduce((s, k) => s + N.types[k], 0);
            let key = types[0];
            for (const k of types) { r -= N.types[k]; if (r <= 0) { key = k; break; } }
            n.children.push(this.spawnEnemy(key, p.x, p.z, { spawnIn: true }));
          }
        }
      }
      const show = n.barT > 0 || d < 5;
      n.barBg.visible = n.barFill.visible = show;
      if (show) {
        const hy = (n.vis?.userData.vis.height || 1) + 0.3;
        n.barBg.position.set(n.x, hy, n.z);
        n.barFill.scale.x = Math.max(0.001, n.hp / n.maxHp);
        n.barFill.position.set(n.x - 0.5, hy, n.z);
      }
    }
  }

  /**
   * A spawn point for reinforcements: reachable (flow field), between minD and maxD path-tiles from
   * the player, preferring tiles the player can't see. `around` variant: near (x, z) instead, but
   * still never closer than holdSpawnMinDist to the player.
   */
  _spawnPointNear(x, z, minR, maxR, ignorePlayerDist = false) {
    const w = this.map.w;
    const cands = [];
    const pl = this.player.pos;
    const minP = ignorePlayerDist ? 1.5 : 2.2;
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const tx = Math.floor(px), ty = Math.floor(pz);
      if (this.world.solidAt(tx, ty) || (this.world.flagAt(tx, ty) & FLAG.SPORE)) continue;
      if (this.flow[tx + ty * w] < 0) continue;
      if (Math.hypot(px - pl.x, pz - pl.z) < minP) continue;
      if (!lineOfSight(this.world, x, z, px, pz)) continue;
      cands.push({ x: tx + 0.5, z: ty + 0.5 });
      if (cands.length > 4) break;
    }
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
  }

  _reinforcementPoint(minD, maxD) {
    const { w, h } = this.map;
    const pl = this.player.pos;
    const good = [], ok = [];
    for (let i = 0; i < w * h; i++) {
      const d = this.flow[i];
      if (d < minD || d > maxD) continue;
      const tx = i % w, ty = Math.floor(i / w);
      if (this.world.flagAt(tx, ty) & (FLAG.SPORE | FLAG.ALARM)) continue;
      const cx = tx + 0.5, cz = ty + 0.5;
      if (Math.hypot(cx - pl.x, cz - pl.z) < minD * 0.75) continue;
      (lineOfSight(this.world, pl.x, pl.z, cx, cz) ? ok : good).push({ x: cx, z: cz });
    }
    const pool = good.length ? good : ok;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  reinforce(n, minD = X().reinforceMinDist, maxD = X().reinforceMaxDist) {
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      if (this.enemies.filter((e) => !e.dead).length >= 32) break;
      const p = this._reinforcementPoint(minD, maxD);
      if (!p) break;
      this.spawnEnemy(this._pickEnemy(), p.x, p.z, { spawnIn: true });
      spawned++;
    }
    return spawned;
  }

  // ------------------------------------------------------------------ flow field

  /** BFS distances (in tiles) from the player's tile over walkable tiles; enemies walk downhill. */
  _updateFlow(force = false) {
    const { w, h } = this.map;
    const tx = Math.floor(this.player.pos.x), ty = Math.floor(this.player.pos.z);
    const t = tx + ty * w;
    if (!force && t === this.flowTile) return;
    this.flowTile = t;
    const dist = this.flow;
    dist.fill(-1);
    if (this.world.solidAt(tx, ty)) return;
    const q = new Int32Array(w * h);
    let qh = 0, qt = 0;
    q[qt++] = t;
    dist[t] = 0;
    while (qh < qt) {
      const c = q[qh++];
      const cx = c % w, cy = (c - cx) / w;
      const nd = dist[c] + 1;
      if (cx > 0 && dist[c - 1] < 0 && !this.world.solidAt(cx - 1, cy)) { dist[c - 1] = nd; q[qt++] = c - 1; }
      if (cx < w - 1 && dist[c + 1] < 0 && !this.world.solidAt(cx + 1, cy)) { dist[c + 1] = nd; q[qt++] = c + 1; }
      if (cy > 0 && dist[c - w] < 0 && !this.world.solidAt(cx, cy - 1)) { dist[c - w] = nd; q[qt++] = c - w; }
      if (cy < h - 1 && dist[c + w] < 0 && !this.world.solidAt(cx, cy + 1)) { dist[c + w] = nd; q[qt++] = c + w; }
    }
  }

  flowDir(x, z) {
    const w = this.map.w;
    const tx = Math.floor(x), ty = Math.floor(z);
    const cur = this.flow[tx + ty * w];
    if (cur < 0) return null;
    let best = null, bd = cur;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (this.world.solidAt(nx, ny)) continue;
        // Diagonal steps only when both side tiles are open (no corner cutting).
        if (dx && dy && (this.world.solidAt(tx + dx, ty) || this.world.solidAt(tx, ty + dy))) continue;
        const d = this.flow[nx + ny * w];
        if (d < 0) continue;
        const score = d + (dx && dy ? 0.4 : 0);
        if (score < bd) { bd = score; best = [nx + 0.5, ny + 0.5]; }
      }
    }
    if (!best) return null;
    const ddx = best[0] - x, ddz = best[1] - z;
    const l = Math.hypot(ddx, ddz) || 1;
    return { x: ddx / l, z: ddz / l };
  }

  // ------------------------------------------------------------------ player actions

  cutterSwing(x, z, angle) {
    const sc = this;
    const R = TOOL.radius, half = TOOL.arc / 2;
    this.shots.sweep(x, z, angle, R, TOOL.arc);
    this.game.sfx.play('cutter');
    const inArc = (px, pz, extra = 0) => {
      const dx = px - x, dz = pz - z;
      const d = Math.hypot(dx, dz);
      if (d > R + extra) return false;
      if (d < 0.5) return true;
      let da = Math.atan2(dz, dx) - angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) <= half + Math.min(0.5, extra / Math.max(0.5, d));
    };
    let hitAny = false;
    for (const t of this.hittables()) {
      if (inArc(t.x, t.z, t.radius) && lineOfSight(this.world, x, z, t.x, t.z)) {
        const dx = t.x - x, dz = t.z - z, l = Math.hypot(dx, dz) || 1;
        t.hit(TOOL.damage, dx / l, dz / l, TOOL.knockback, 'cutter');
        hitAny = true;
      }
    }
    // Brambles
    let cut = 0;
    for (const [k, b] of this.brambles) {
      if (!inArc(b.tx + 0.5, b.ty + 0.5, 0.5)) continue;
      this.brambles.delete(k);
      this.world.clearFlags(b.tx, b.ty, FLAG.SOLID | FLAG.OPAQUE | FLAG.BRAMBLE);
      this.fx.burst({ x: b.tx + 0.5, z: b.ty + 0.5 }, { color: '#733e39', color2: '#63c74d', count: 14, speed: 2.5, up: 3, life: 0.5, size: 0.08 });
      this.game.assets.disposeVisual(b.vis);
      cut++;
    }
    if (cut) {
      this.minimap.invalidate();
      this._updateFlow(true);
      if (!this.warned.cutFirst) { this.warned.cutFirst = true; this.fx.text({ x, z }, 'Cleared!', { color: '#63c74d', y: 1.6 }); }
    }
    // Security lasers can be cut too (carefully, from the side).
    for (const a of this.alarms) {
      if (!a.active || !inArc(a.tx + 0.5, a.ty + 0.5, 0.4)) continue;
      this._disableAlarm(a, true);
    }
    if (hitAny) this.game.shake(2, 0.08);
    void sc;
  }

  _disableAlarm(a, cut) {
    a.active = false;
    this.world.clearFlags(a.tx, a.ty, FLAG.ALARM);
    if (a.vis) { this.game.assets.disposeVisual(a.vis); a.vis = null; }
    if (cut) {
      this.fx.burst({ x: a.tx + 0.5, z: a.ty + 0.5 }, { color: '#ff0044', color2: '#2ce8f5', count: 10, speed: 2, up: 2, life: 0.4 });
      this.fx.text({ x: a.tx + 0.5, z: a.ty + 0.5 }, 'Laser cut', { color: '#2ce8f5', y: 1 });
      this.game.sfx.play('zap');
    }
    this.minimap.invalidate();
  }

  onPlayerHurt() {}

  onPlayerDeath() {
    if (this.ending) return;
    this.ending = true;
    this.timeScale = 0.35;
    this.holdTarget = null;
    this.game.sfx.play('core');
    this.fx.burst(this.player.pos, { color: '#e43b44', color2: '#3e8948', count: 30, speed: 3, up: 3, life: 0.8 });
    this.later(1.2, () => {
      this.timeScale = 1;
      const salv = this._salvage();
      const lost = RESOURCE_KEYS.filter((k) => this.carried[k] - (salv[k] || 0) > 0).map((k) => resChip(k, this.carried[k] - (salv[k] || 0)));
      const kept = RESOURCE_KEYS.filter((k) => salv[k] > 0).map((k) => resChip(k, salv[k]));
      const body = el('div.col', {},
        el('p', 'You collapse, and a passing Relay drone drags you home.'),
        lost.length ? el('div', {}, el('p.bad', 'Carried loot lost:'), el('div.resrow', {}, lost)) : el('p.muted', 'You weren\'t carrying anything.'),
        kept.length ? el('div', {}, el('p.good', 'The drone salvaged:'), el('div.resrow', {}, kept)) : null,
        this.objectiveDone ? el('p.good', 'Objective progress still counts.') : null,
        el('p.muted.small', `You return with ${CONFIG.expedition.deathReturnHp} HP. Towers, banked resources and research are safe.`));
      modal(this.game.ui, 'You went down', body, [button('Return to the Relay', () => this._finish('died'), { cls: 'primary' })]);
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
    this._banner('EXTRACTED', 'Loot secured — heading back to the Relay');
    this.later(1.4, () => this._finish('extracted'));
  }

  /** Early nights: the share of carried loot the drone recovers if the expedition fails. */
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
      timeUsed: Math.round(X().time - this.timeLeft + this.overT),
      overtime: this.overtime,
    };
    const summary = run.applyExpedition(result, this.game);
    this.game.go('summary', { result: summary });
  }

  // ------------------------------------------------------------------ pause / map

  setPaused(p) {
    if (this.ending && p) return;
    if (p === this.paused) return;
    this.paused = p;
    this.player.reticle.visible = !p;
    if (p) {
      const body = el('div.col', {},
        el('p.muted.small', 'WASD move · mouse aim · LMB fire · RMB Pulse Cutter · Space dodge · E interact (hold) · Q med kit · Tab map'),
        el('p', {}, 'Objective: ', el('b.amber', this.objDef.name), this.objectiveDone ? el('span.good', ' (done)') : null));
      this.pauseModal = modal(this.game.ui, 'Paused', body, [
        button('Abandon expedition', () => this._confirmAbandon(), { cls: 'danger' }),
        button('Quit to title', () => this._confirmQuit()),
        button('Settings', () => {
          this.settingsOpen = true;
          this.pauseModal.style.display = 'none';
          openSettingsOverlay(this.game, { onClose: () => { this.settingsOpen = false; if (this.pauseModal) this.pauseModal.style.display = ''; } });
        }),
        button('Resume', () => this.setPaused(false), { cls: 'primary', hotkey: 'Esc' }),
      ]);
      this.pauseModal.classList.add('x-pause');
      this.game.stage.style.cursor = '';
    } else {
      this.pauseModal?.remove();
      this.pauseModal = null;
      this.confirmModal?.remove();
      this.confirmModal = null;
      this.game.stage.style.cursor = 'none';
    }
  }

  _confirmAbandon() {
    this.confirmModal?.remove();
    const body = el('div.col', {},
      el('p', 'Abandoning counts as failing to extract:'),
      el('p.bad', nightTune('deathSalvage', this.game.run.night) > 0
        ? `Most carried loot is lost (the drone salvages ${Math.round(nightTune('deathSalvage', this.game.run.night) * 100)}%) and you return at low HP.`
        : 'All carried loot is lost and you return at low HP.'),
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
      el('p.muted.small', "The run continues from tonight's briefing when you press Continue. This expedition is not kept."));
    this.confirmModal = modal(this.game.ui, 'Quit to title?', body, [
      button('Keep going', () => { this.confirmModal.remove(); this.confirmModal = null; }, { cls: 'primary' }),
      button('Quit to title', () => { this.finished = true; this.game.go('title'); }, { cls: 'danger' }),
    ]);
  }

  toggleMap(open = !this.mapOpen) {
    this.mapOpen = open;
    this.hud.bigmap.style.display = open ? '' : 'none';
  }

  toast(text, cls = '', time = 2.4) { toast(this.game.ui, text, cls, time); }

  _banner(title, sub) {
    const b = el('div.x-banner', {}, el('div.x-banner-t', title), el('div.x-banner-s', sub));
    this.game.ui.append(b);
    setTimeout(() => b.classList.add('out'), 2200);
    setTimeout(() => b.remove(), 2800);
  }

  // ================================================================== update

  update(dt) {
    const input = this.game.input;
    if (input.wasPressed('Escape') && !this.settingsOpen) {
      if (this.mapOpen) this.toggleMap(false);
      else if (this.confirmModal) { this.confirmModal.remove(); this.confirmModal = null; }
      else if (!this.ending) this.setPaused(!this.paused);
    }
    if (input.wasPressed('Tab') && !this.paused) this.toggleMap();
    if (this.paused || this.finished) return;

    dt *= this.timeScale;
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    this._pumpHints();

    this.player.update(dt);
    this._updateRoom();
    this._updateFlow();
    this._updateEnemies(dt);
    this._updateNests(dt);
    this.shots.update(dt);
    this._updatePickups(dt);
    if (!this.ending) {
      this._updateInteract(dt);
      this._updateHazards(dt);
      this._updateTimer(dt);
    }
    this._updateProps(dt);
    this.world.update(dt);
    this.fx.update(dt);
    this._placeCamera(dt);
    this._updateHud(dt);
  }

  _placeCamera(dt, snap = false) {
    const C = X().camera;
    const p = this.player.pos;
    // Look ahead toward the mouse, scaled by how far out the cursor is.
    const ax = this.player.aimPoint.x - p.x, az = this.player.aimPoint.z - p.z;
    const al = Math.hypot(ax, az);
    const k = al > 0.01 ? Math.min(1, al / 7) * C.lookAhead / al : 0;
    const tx = p.x + ax * k, tz = p.z + az * k * 0.8;
    if (snap) this.camFocus.set(tx, 0, tz);
    else {
      const f = 1 - Math.exp(-C.follow * dt);
      this.camFocus.x += (tx - this.camFocus.x) * f;
      this.camFocus.z += (tz - this.camFocus.z) * f;
    }
    // Snap to the texel grid (1/32 tile) so the floor doesn't shimmer while the camera glides.
    const fx = Math.round(this.camFocus.x * 32) / 32, fz = Math.round(this.camFocus.z * 32) / 32;
    this.camera.position.set(fx + this.camOffset.x, this.camOffset.y, fz + this.camOffset.z);
    this.camera.lookAt(fx, 0, fz);
  }

  _roomAt(x, z) {
    const tx = Math.floor(x), ty = Math.floor(z);
    const cx = Math.floor((tx - 1) / CELL_W), cy = Math.floor((ty - 1) / CELL_H);
    const lx = tx - 1 - cx * CELL_W, ly = ty - 1 - cy * CELL_H;
    if (lx < 0 || ly < 0 || lx >= ROOM_W || ly >= ROOM_H) return -1;
    const r = this.map.rooms.find((rr) => rr.cx === cx && rr.cy === cy);
    return r ? r.id : -1;
  }

  _updateRoom() {
    const id = this._roomAt(this.player.pos.x, this.player.pos.z);
    if (id < 0 || id === this.playerRoom) return;
    this.playerRoom = id;
    if (this.revealed[id]) return;
    this.revealed[id] = 1;
    const room = this.map.rooms[id];
    // Announce set pieces the first time their room is seen.
    for (const it of this.interactables) {
      if (it.room !== id || it.done) continue;
      if (it.kind === 'optional') this.toast(`Optional objective: ${OPTIONAL[it.key].name}`, 'amber', 3);
      if (it.kind === 'event') this.toast(`Event: ${EVENTS[it.key].name} (risk / reward)`, 'amber', 3);
    }
    for (const n of this.nests) if (n.room === id && !n.dead) {
      this.toast(`Optional objective: ${OPTIONAL[n.key].name}`, 'amber', 3);
    }
    if (room.role === 'extract' && !this.objectiveDone) this.toast('Extraction point found — it opens when the objective is done', '', 3);
  }

  // ------------------------------------------------------------------ interaction

  _updateInteract(dt) {
    const pl = this.player;
    const input = this.game.input;
    let best = null, bd = Infinity;
    for (const it of this.interactables) {
      if (it.done) continue;
      const d = Math.hypot(it.x - pl.pos.x, it.z - pl.pos.z);
      // Walk-over pickups (fuse, data log) are taken just by touching them.
      if (it.walkOver && d < 0.6) { this._complete(it); continue; }
      if (d <= it.radius && d < bd) { bd = d; best = it; }
    }
    // A hold in progress survives a little drift (being knocked back by a hit doesn't cancel it).
    const ht = this.holdTarget;
    if (ht && !ht.done && input.isDown('KeyE') && Math.hypot(ht.x - pl.pos.x, ht.z - pl.pos.z) <= ht.radius + X().holdGrace) best = ht;
    // Nothing to interact with, but brambles in reach: say how to clear them.
    this.cutPrompt = false;
    if (!best && this.brambles.size) {
      for (const b of this.brambles.values()) {
        if (Math.hypot(b.tx + 0.5 - pl.pos.x, b.ty + 0.5 - pl.pos.z) < 2.4) { this.cutPrompt = true; break; }
      }
    }
    // Stop holding when the target changes; extraction progress resets, others keep theirs.
    if (this.holdTarget && this.holdTarget !== best) {
      if (!this.holdTarget.keepProgress) this.holdTarget.progress = 0;
      this.holdTarget = null;
    }
    this.promptTarget = best;
    if (!best) return;
    if (!best.enabled()) {
      if (input.wasPressed('KeyE')) this.game.sfx.play('error');
      return;
    }
    if (best.kind === 'container' && !this.warned.loot) {
      this.warned.lootHint = true;
    }
    const mult = best.objectiveHold && this.game.run.hasSkill('quick_extraction') ? X().quickExtraction : 1;
    const hold = best.hold * mult;
    if (hold <= 0) {
      if (input.wasPressed('KeyE')) this._complete(best);
      return;
    }
    if (input.isDown('KeyE')) {
      if (best.progress === 0 && best.onStart && !best.started) { best.started = true; best.onStart(best); }
      this.holdTarget = best;
      best.progress = Math.min(hold, best.progress + dt);
      // Enemies summoned by the hold arrive at evenly spaced points of progress.
      if (best.spawnDuring) {
        const frac = best.progress / hold;
        while (best.spawned < best.spawnDuring && frac >= (best.spawned + 0.15) / best.spawnDuring) {
          best.spawned++;
          if (this.reinforce(1, X().holdSpawnMinDist, X().holdSpawnMinDist + 6) && best.spawned === 1) this.toast('Enemies incoming!', 'bad');
        }
      }
      if (Math.random() < 0.3) this.fx.burst({ x: best.x, z: best.z }, { color: best.kind === 'extract' ? '#2ce8f5' : '#feae34', count: 1, speed: 0.8, up: 2, life: 0.4, size: 0.06 });
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

  // ------------------------------------------------------------------ hazards, timer, props

  _updateHazards(dt) {
    const pl = this.player;
    if (pl.dead) return;
    const tx = Math.floor(pl.pos.x), ty = Math.floor(pl.pos.z);
    const f = this.world.flagAt(tx, ty);
    // Spores hurt while you stand in them (a dodge carries you over).
    if ((f & FLAG.SPORE) && !pl.dodging) {
      this.sporeT -= dt;
      if (Math.random() < 0.3) this.fx.burst({ x: pl.pos.x, y: -0.3, z: pl.pos.z }, { color: '#b55088', color2: '#ff77a8', count: 1, speed: 0.6, up: 1.2, life: 0.6, size: 0.07, gravity: 1 });
      if (this.sporeT <= 0) {
        this.sporeT = X().spore.tick;
        if (this.game.run.hasSkill('safe_hands') && !this.safeHandsUsed) {
          this.safeHandsUsed = true;
          this.fx.text(pl.pos, 'Safe Hands: hazard ignored', { color: '#63c74d', y: 1.6, life: 1.2 });
          pl.iframes = Math.max(pl.iframes, 0.8);
        } else pl.hurt(X().spore.damage, 0, 0, 'spores');
      }
      if (!this.warned.spore) { this.warned.spore = true; this.toast('Spores! They hurt while you stand in them', 'bad'); }
    } else this.sporeT = 0.25;
    // Security lasers: crossing one trips the room's alarm.
    if (f & FLAG.ALARM) {
      const a = this.alarms.find((al) => al.active && al.tx === tx && al.ty === ty);
      if (a) this._tripAlarm(a);
    }
    // Hints near brambles.
    if (!this.warned.bramble && this.brambles.size) {
      for (const b of this.brambles.values()) {
        if (Math.hypot(b.tx + 0.5 - pl.pos.x, b.ty + 0.5 - pl.pos.z) < 3.5) {
          this.warned.bramble = true;
          this._hint('explore_cutter', '<b>Right-click</b> swings the <b>Pulse Cutter</b>: it clears <b>brambles</b>, hits everything in an arc and can cut security lasers.', 'bottom-left', 10);
          break;
        }
      }
    }
  }

  _tripAlarm(a) {
    for (const al of this.alarms) if (al.room === a.room && al.active) this._disableAlarm(al, false);
    this.game.sfx.play('alarm');
    this.game.flash('#ff0044', 0.2);
    this.toast('Alarm tripped! Reinforcements incoming', 'bad', 3);
    this.reinforce(X().alarmSpawn, 6, 13);
  }

  _updateTimer(dt) {
    if (!this.overtime) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 90 && !this.warned.t90) {
        this.warned.t90 = true;
        this._hint('explore_timer', 'The <b>timer</b> won\'t fail you, but when it runs out reinforcements keep coming and an <b>emergency beacon</b> appears at the start.', 'bottom-left', 10);
      }
      if (this.timeLeft <= 60 && !this.warned.t60) { this.warned.t60 = true; this.toast('1 minute left', 'amber'); this.game.sfx.play('alarm'); }
      if (this.timeLeft <= 30 && !this.warned.t30) { this.warned.t30 = true; this.toast('30 seconds left', 'bad'); this.game.sfx.play('alarm'); }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.overtime = true;
        this.overT = 0;
        this.game.music?.play('boss');
        this.lateT = 3;
        this.game.sfx.play('alarm');
        this.game.flash('#e43b44', 0.2);
        this.toast(`Time's up! Reinforcements are coming — emergency beacon in ${X().emergencyWarning}s`, 'bad', 4);
        this._banner('TIME\'S UP', `Emergency beacon at the start in ${X().emergencyWarning}s`);
      }
      return;
    }
    this.overT += dt;
    if (!this.beacon && this.overT >= X().emergencyWarning) this._spawnBeacon();
    this.lateT -= dt;
    if (this.lateT <= 0) {
      this.lateT = X().lateSpawnEvery;
      const [lo, hi] = X().lateSpawnCount;
      const n = lo + Math.floor(Math.random() * (hi - lo + 1)) + (this.game.run.night >= 4 ? 1 : 0);
      if (this.reinforce(n)) this.toast('Reinforcements!', 'bad');
    }
  }

  _spawnBeacon() {
    const s = this.map.start;
    const v = this.game.assets.makeVisual('beacon');
    v.position.set(s.x, 0, s.z);
    setAnim(v, 'idle');
    this.three.add(v);
    const zone = this._makeZone(s.x, s.z);
    this._setZoneOpen(zone, true);
    this.beacon = { vis: v, zone };
    this.beaconIt = this._addInteractable({
      kind: 'extract', beacon: true, x: s.x, z: s.z, room: s.room, radius: X().extractRadius, hold: X().extractHold, keepProgress: false, objectiveHold: true,
      verb: 'Emergency extract',
      onComplete: () => this._extract(),
    });
    this.game.sfx.play('done');
    this.toast('Emergency beacon is up at the start room', 'amber', 3.5);
  }

  _updateProps(dt) {
    for (const v of this.decor) updateVisual(v, dt);
    for (const it of this.interactables) if (it.vis) updateVisual(it.vis, dt);
    for (const s of this.spores) {
      updateVisual(s.vis, dt);
      s.puffT -= dt;
      if (s.puffT <= 0) {
        s.puffT = 1.2 + Math.random() * 2;
        this.fx.burst({ x: s.tx + 0.5, y: -0.3, z: s.ty + 0.5 }, { color: '#b55088', color2: '#ff77a8', count: 2, speed: 0.4, up: 1, life: 0.9, size: 0.06, gravity: 0.6 });
      }
    }
    for (const a of this.alarms) if (a.vis) {
      updateVisual(a.vis, dt);
      a.vis.visible = Math.sin(this.time * 18 + a.tx) > -0.7;
    }
    if (this.beacon) updateVisual(this.beacon.vis, dt);
    if (this.fades) {
      for (const f of this.fades) {
        f.t += dt;
        setOpacity(f.v, Math.max(0, 1 - f.t / 1.2));
        f.v.position.y = f.t * 0.6;
        if (f.t >= 1.2 && !f.gone) { f.gone = true; this.game.assets.disposeVisual(f.v); }
      }
      this.fades = this.fades.filter((f) => !f.gone);
    }
    // Extraction zones.
    for (const zone of [this.extractZone, this.beacon?.zone]) {
      if (!zone) continue;
      const it = zone === this.extractZone ? this.extractIt : this.beaconIt;
      const hold = X().extractHold * (this.game.run.hasSkill('quick_extraction') ? X().quickExtraction : 1);
      zone.prog.scale.setScalar(Math.max(0.001, (it?.progress || 0) / hold));
      zone.ring.rotation.z += dt * (zone.open ? 0.8 : 0.2);
      zone.column.material.opacity = 0.12 + 0.06 * Math.sin(this.time * 4);
    }
    // Floating markers over current objective targets.
    for (const f of this.floaters) {
      const t = f.target;
      let show = !t.done && !t.dead;
      if (f.type === 'objective' && t.step !== undefined) show = show && !this.objectiveDone && t.step === this.objStep;
      if (f.type !== 'objective') show = show && !!this.revealed[t.room];
      f.mesh.visible = show;
      if (!show) continue;
      const h = (t.vis?.userData.vis.height || 1) + 0.45;
      f.mesh.position.set(t.x, h + Math.sin(this.time * 3 + f.phase) * 0.12, t.z);
      f.mesh.rotation.y += dt * 2;
    }
    // Elite objective enemy floater (it moves).
    if (!this.eliteFloater) {
      const e = this.enemies.find((en) => en.objective);
      if (e) { this._addFloater(e, 'objective'); this.eliteFloater = this.floaters[this.floaters.length - 1]; }
    }
    if (this.eliteFloater) {
      const e = this.eliteFloater.target;
      this.eliteFloater.mesh.visible = !e.dead;
      if (!e.dead) {
        this.eliteFloater.mesh.position.set(e.x, e.vis.userData.vis.height + 0.65 + Math.sin(this.time * 3) * 0.12, e.z);
        this.eliteFloater.mesh.rotation.y += dt * 2;
      }
    }
  }

  // ================================================================== HUD

  _buildHud() {
    const ui = this.game.ui;
    ui.classList.add('explore-ui');
    const h = {};
    h.hp = bar('x-hpbar', 'var(--good)');
    h.meds = el('span.x-chip', '');
    h.dodge = el('span.x-cd', {}, el('span.x-cd-fill'), el('span.x-cd-l', 'Space Dodge'));
    h.cutter = el('span.x-cd', {}, el('span.x-cd-fill'), el('span.x-cd-l', 'RMB Cutter'));
    h.weapon = el('div.x-weapon.small.muted', `LMB ${this.player.weapon.name}`);
    const tl = el('div.x-tl.x-panel', {}, el('div.x-row', {}, el('span.x-lbl', 'HP'), h.hp.node), el('div.x-row', {}, h.meds, h.dodge, h.cutter), h.weapon);
    h.loot = {};
    const lootRow = el('div.x-lootrow', {}, RESOURCE_KEYS.map((k) => {
      const r = RESOURCES[k];
      const n = el('b', '0');
      const chip = el(`span.x-res`, { style: { '--c': r.color }, title: `${r.label}: ${r.desc}` }, el('span.glyph', r.glyph), n, el('span.lbl', r.short));
      h.loot[k] = { n, chip, v: -1 };
      return chip;
    }));
    const loot = el('div.x-loot.x-panel', {}, el('div.x-title', {}, 'CARRIED ', el('span.muted', '· kept only if you extract')), lootRow);
    h.timer = el('div.x-time', '3:00');
    h.timerSub = el('div.x-timesub', this.D.name);
    const timer = el('div.x-timer', {}, h.timer, h.timerSub);
    h.mini = el('canvas.x-mini');
    const mini = el('div.x-minibox', {}, h.mini, el('div.x-minihint', {}, el('span.key', 'Tab'), ' big map'));
    h.objTitle = el('div.x-objtitle', this.objDef.name);
    h.steps = el('div.x-steps');
    h.extract = el('div.x-extract');
    h.extractArrow = el('span.x-dirarrow', '➤');
    h.extractText = el('span', '');
    h.extract.append(h.extractArrow, h.extractText);
    h.optList = el('div.x-optlist');
    const obj = el('div.x-obj.x-panel', {}, el('div.x-title.amber', 'OBJECTIVE'), h.objTitle, h.steps, h.extract, h.optList);
    const tr = el('div.x-tr', {}, mini, obj);
    h.promptRing = el('span.x-ring', {}, el('span.key', 'E'));
    h.promptText = el('span.x-plabel');
    h.promptTime = el('span.x-ptime');
    h.card = el('div.x-card');
    h.prompt = el('div.x-prompt', {}, h.card, el('div.x-ptext', {}, h.promptRing, h.promptText, h.promptTime));
    h.arrowObj = el('div.x-edge.obj', {}, el('span', '▲'));
    h.arrowExt = el('div.x-edge.ext', {}, el('span', '▲'));
    h.vignette = el('div.x-vignette');
    // Big map overlay
    h.big = el('canvas.x-bigcanvas');
    const legend = el('div.x-legend', {}, ['objective', 'optional', 'event', 'extract', 'extract_locked', 'beacon', 'med', 'container'].map((k) =>
      el('span.x-leg', {}, el('i', { style: { background: MARKER_STYLE[k].color } }), MARKER_STYLE[k].label)),
      TILE_LEGEND.filter((t) => !t.district || this.D[t.district]).map((t) =>
        el('span.x-leg', {}, el('i', { style: { background: t.color } }), t.label)));
    h.bigmap = el('div.x-bigmap', { style: { display: 'none' } },
      el('div.x-bigbox.x-panel', {}, el('div.x-bigtitle', {}, el('b', this.D.name), el('span.muted', ` · ${this.objDef.name}`), el('span.muted.x-bigclose', 'Tab / Esc to close')), h.big, legend));
    h.root = el('div.x-hud', {}, h.vignette, tl, loot, timer, tr, h.prompt, h.arrowObj, h.arrowExt, h.bigmap);
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

  _updateHud() {
    const h = this.hud;
    const pl = this.player;
    const C = CONFIG.player;
    // HP
    const hpf = pl.hp / pl.maxHp;
    h.hp.set(hpf, `${Math.ceil(pl.hp)} / ${pl.maxHp}`);
    this._set('hpc', h.hp.node.firstChild, 'background', hpf > 0.5 ? 'var(--good)' : hpf > 0.25 ? 'var(--amber)' : 'var(--danger)');
    this._set('vig', h.vignette, 'opacity', hpf < 0.3 && !pl.dead ? String(0.35 + 0.25 * Math.sin(this.time * 6)) : '0');
    this._set('meds', h.meds, 'html', `<span style="color:#e43b44">✚</span> ${pl.meds}/${C.maxMeds} <span class="key">Q</span>`);
    const df = 1 - Math.max(0, pl.dodgeCd) / C.dodgeCooldown;
    const cf = 1 - Math.max(0, pl.cutCd) / TOOL.cooldown;
    h.dodge.firstChild.style.width = `${df * 100}%`;
    h.cutter.firstChild.style.width = `${cf * 100}%`;
    h.dodge.classList.toggle('ready', df >= 1);
    h.cutter.classList.toggle('ready', cf >= 1);
    // Loot
    for (const k of RESOURCE_KEYS) {
      const L = h.loot[k];
      if (L.v !== this.carried[k]) { L.v = this.carried[k]; L.n.textContent = String(L.v); L.chip.classList.toggle('zero', L.v === 0); }
    }
    // Timer
    if (!this.overtime) {
      this._set('time', h.timer, 'text', fmtTime(this.timeLeft));
      this._set('tcls', h.timer, 'color', this.timeLeft <= 30 ? 'var(--danger)' : this.timeLeft <= 60 ? 'var(--amber)' : 'var(--text)');
    } else {
      this._set('time', h.timer, 'text', `+${fmtTime(this.overT)}`);
      this._set('tcls', h.timer, 'color', 'var(--danger)');
      this._set('tsub', h.timerSub, 'text', this.beacon ? 'OVERTIME · beacon up at the start' : `OVERTIME · beacon in ${Math.ceil(X().emergencyWarning - this.overT)}s`);
    }
    // Objective steps
    const steps = this.objDef.steps.map((s, i) => {
      const done = this.objectiveDone || i < this.objStep;
      const cur = !done && i === this.objStep;
      const cnt = s.count > 1 ? ` (${cur ? this.stepCount : done ? s.count : 0}/${s.count})` : '';
      return `<div class="x-step ${done ? 'done' : cur ? 'cur' : ''}">${done ? '☑' : '☐'} ${s.label}${cnt}</div>`;
    }).join('');
    this._set('steps', h.steps, 'html', steps);
    // Extraction status + direction arrow toward the nearest open exit.
    const exit = this._nearestExit();
    let ext;
    if (exit) ext = exit === this.beaconIt ? 'Emergency beacon: hold E at the start' : 'Extraction OPEN: hold E in the zone';
    else ext = this.overtime ? 'Beacon coming…' : 'Extraction locked: finish the objective';
    this._set('ext', h.extractText, 'text', ext);
    this._set('extc', h.extract, 'color', exit ? 'var(--accent)' : 'var(--muted)');
    h.extractArrow.style.display = exit ? '' : 'none';
    if (exit) h.extractArrow.style.transform = `rotate(${Math.atan2(exit.z - pl.pos.z, exit.x - pl.pos.x)}rad)`;
    // Optionals / events found
    const opts = [];
    for (const it of this.interactables) if ((it.kind === 'optional' || it.kind === 'event') && this.revealed[it.room]) {
      const name = it.kind === 'optional' ? OPTIONAL[it.key].name : EVENTS[it.key].name;
      opts.push(`<div class="x-step ${it.done ? 'done' : ''}" style="color:${it.kind === 'optional' ? '#c47bff' : '#fee761'}">${it.done ? '☑' : it.kind === 'event' ? '!' : '●'} ${name}</div>`);
    }
    for (const n of this.nests) if (this.revealed[n.room]) opts.push(`<div class="x-step ${n.dead ? 'done' : ''}" style="color:#c47bff">${n.dead ? '☑' : '●'} ${OPTIONAL[n.key].name}</div>`);
    if (this.spEarned) opts.push(`<div class="x-step good">+${this.spEarned} skill point${this.spEarned > 1 ? 's' : ''} earned</div>`);
    this._set('opts', h.optList, 'html', opts.join(''));

    // Interaction prompt
    const t = this.promptTarget;
    if (t && !this.ending) {
      h.prompt.style.display = '';
      const en = t.enabled();
      const mult = t.objectiveHold && this.game.run.hasSkill('quick_extraction') ? X().quickExtraction : 1;
      const hold = t.hold * mult;
      const holding = en && hold > 0;
      // "Hold [E] Open Tool Chest  0.8s" with a progress ring around the key, or "Press [E] …".
      this._set('pring', h.promptRing, 'display', en ? '' : 'none');
      this._set('pringc', h.promptRing, 'className', holding ? 'x-ring hold' : 'x-ring');
      h.promptRing.style.setProperty('--p', holding ? (t.progress / hold).toFixed(3) : '0');
      this._set('ptext', h.promptText, 'html', en ? `${holding ? 'Hold' : 'Press'} · ${t.verb}` : `<span class="bad">${t.reason}</span>`);
      this._set('ptime', h.promptTime, 'text', holding ? `${(t.progress > 0 ? hold - t.progress : hold).toFixed(1)}s` : '');
      h.card.style.display = t.card ? '' : 'none';
      if (t.card) this._set('card', h.card, 'html', `<div class="x-cardt">${t.card.title}</div>${t.card.lines.map((l) => `<div>${l}</div>`).join('')}`);
    } else if (this.cutPrompt && !this.ending) {
      h.prompt.style.display = '';
      h.card.style.display = 'none';
      this._set('pring', h.promptRing, 'display', 'none');
      this._set('ptext', h.promptText, 'html', '<span class="key">RMB</span> Cut the brambles (Pulse Cutter)');
      this._set('ptime', h.promptTime, 'text', '');
    } else {
      h.prompt.style.display = 'none';
      this._hudCache.ptext = null;
    }

    // Edge arrows
    const objT = this._objectiveTarget();
    this._edgeArrow(h.arrowObj, !this.objectiveDone && !this.ending ? objT : null);
    this._edgeArrow(h.arrowExt, !this.ending ? exit : null);

    // Minimap (every other frame is plenty)
    this._miniT = (this._miniT || 0) + 1;
    const state = this._mapState();
    if (this._miniT % 2 === 0) this.minimap.draw(h.mini, 4, state);
    if (this.mapOpen) this.minimap.draw(h.big, 10, state);
  }

  _nearestExit() {
    const pl = this.player.pos;
    const list = [];
    if (this.objectiveDone) list.push(this.extractIt);
    if (this.beaconIt) list.push(this.beaconIt);
    let best = null, bd = Infinity;
    for (const it of list) {
      const d = Math.hypot(it.x - pl.x, it.z - pl.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  /** Where the current objective step is (nearest unfinished target). */
  _objectiveTarget() {
    if (this.objectiveDone) return null;
    const pl = this.player.pos;
    let best = null, bd = Infinity;
    const consider = (o) => {
      const d = Math.hypot(o.x - pl.x, o.z - pl.z);
      if (d < bd) { bd = d; best = o; }
    };
    for (const it of this.interactables) if (it.kind === 'primary' && !it.done && it.step === this.objStep) consider(it);
    for (const e of this.enemies) if (e.objective && !e.dead) consider(e);
    return best;
  }

  _edgeArrow(node, target) {
    if (!target) { node.style.display = 'none'; return; }
    const cam = this.camera;
    const p = this.game.project(new THREE.Vector3(target.x, 0.5, target.z), cam);
    const W = this.game.stage.clientWidth, H = this.game.stage.clientHeight;
    const m = W * 0.06;
    const on = p.visible && p.x > m && p.x < W - m && p.y > m && p.y < H - m;
    if (on) { node.style.display = 'none'; return; }
    // Arrow on a ring around the player, pointing at the target (never collides with the HUD panels).
    const pp = this.game.project(new THREE.Vector3(this.player.pos.x, 0.5, this.player.pos.z), cam);
    let dx = target.x - this.player.pos.x, dy = target.z - this.player.pos.z;
    if (p.visible) { dx = p.x - pp.x; dy = p.y - pp.y; }
    const a = Math.atan2(dy, dx);
    const R = H * 0.3;
    node.style.display = '';
    node.style.transform = `translate(${(pp.x + Math.cos(a) * R).toFixed(0)}px, ${(pp.y + Math.sin(a) * R * 0.85).toFixed(0)}px) translate(-50%, -50%) rotate(${a + Math.PI / 2}rad)`;
  }

  _mapState() {
    const markers = [];
    for (const it of this.interactables) {
      if (it.kind === 'primary') {
        if (it.done && !this.objectiveDone) continue;
        if (this.objectiveDone) continue;
        markers.push({ x: it.x, z: it.z, type: it.step === this.objStep ? 'objective' : 'done', room: it.room, always: it.step === this.objStep, big: true });
      } else if (it.kind === 'optional') markers.push({ x: it.x, z: it.z, type: it.done ? 'done' : 'optional', room: it.room });
      else if (it.kind === 'event') markers.push({ x: it.x, z: it.z, type: it.done ? 'done' : 'event', room: it.room });
      else if (it.kind === 'container' && !it.done) markers.push({ x: it.x, z: it.z, type: 'container', room: it.room });
      else if (it.kind === 'extract') {
        const open = it.beacon || this.objectiveDone;
        markers.push({ x: it.x, z: it.z, type: it.beacon ? 'beacon' : open ? 'extract' : 'extract_locked', room: it.room, always: open, big: true });
      }
    }
    for (const n of this.nests) markers.push({ x: n.x, z: n.z, type: n.dead ? 'done' : 'optional', room: n.room });
    for (const e of this.enemies) if (e.objective && !e.dead) markers.push({ x: e.x, z: e.z, type: 'objective', room: e.room, always: true, big: true });
    for (const p of this.pickups) if (p.res === 'med' && !p.dead) markers.push({ x: p.x, z: p.z, type: 'med', room: this._roomAt(p.x, p.z) });
    return {
      revealed: this.revealed, knownRooms: this.knownRooms, markers, time: this.time,
      player: { x: this.player.pos.x, z: this.player.pos.z, ax: this.player.aim.x, az: this.player.aim.z },
    };
  }

  // ================================================================== debug

  _makeDebug() {
    const sc = this;
    return {
      teleport(x, z) {
        // Snap to the nearest open tile so a tester can't embed the player in a wall.
        let tx = Math.floor(x), tz = Math.floor(z);
        if (sc.world.solidAt(tx, tz)) {
          let best = null;
          for (let r = 1; r < 8 && !best; r++) {
            for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
              if (!best && !sc.world.solidAt(tx + dx, tz + dz)) best = [tx + dx, tz + dz];
            }
          }
          if (best) { [tx, tz] = best; x = tx + 0.5; z = tz + 0.5; }
        }
        sc.player.pos.set(x, 0, z);
        sc._placeCamera(0, true);
      },
      completeObjective() { sc.completeObjective(); },
      giveLoot(l = { scrap: 50, circuits: 3, biofiber: 3, intel: 2 }) { for (const k of RESOURCE_KEYS) sc.carried[k] += l[k] || 0; },
      killAll() { for (const e of sc.enemies) if (!e.dead) e.hit(99999, 0, 0, 0); for (const n of sc.nests) if (!n.dead) n.hit(99999, 0, 0, 0); },
      god(on = true) { sc.player.god = on; },
      timeLeft(s) { sc.timeLeft = s; if (s > 0) sc.overtime = false; },
      extract() { sc._extract(); },
      die() { sc.player.iframes = 0; sc.player.dodgeT = 0; sc.player.hurt(9999); },
      revealAll() { sc.revealed.fill(1); },
      info() {
        return {
          district: sc.district, objective: sc.objKey, step: sc.objStep, done: sc.objectiveDone, attempt: sc.map.attempt,
          player: { x: +sc.player.pos.x.toFixed(2), z: +sc.player.pos.z.toFixed(2), hp: sc.player.hp, meds: sc.player.meds },
          extract: { x: sc.extractIt.x, z: sc.extractIt.z },
          targets: sc.interactables.filter((i) => !i.done).map((i) => ({ kind: i.kind, key: i.key, x: i.x, z: i.z, step: i.step })),
          nests: sc.nests.filter((n) => !n.dead).map((n) => ({ x: n.x, z: n.z })),
          enemies: sc.enemies.filter((e) => !e.dead).map((e) => ({ key: e.key, x: +e.x.toFixed(1), z: +e.z.toFixed(1), state: e.state, elite: e.elite })),
          carried: { ...sc.carried }, kills: sc.kills, sp: sc.spEarned, timeLeft: sc.timeLeft, overtime: sc.overtime,
        };
      },
    };
  }

  // ================================================================== exit

  exit() {
    document.removeEventListener('visibilitychange', this._onVis);
    this.timers = [];
    const A = this.game.assets;
    for (const e of this.enemies) e.dispose();
    for (const p of this.pickups) A.disposeVisual(p.vis);
    for (const it of this.interactables) if (it.vis) A.disposeVisual(it.vis);
    for (const v of this.decor) A.disposeVisual(v);
    for (const b of this.brambles.values()) A.disposeVisual(b.vis);
    for (const a of this.alarms) if (a.vis) A.disposeVisual(a.vis);
    for (const s of this.spores) A.disposeVisual(s.vis);
    for (const n of this.nests) {
      if (n.vis) A.disposeVisual(n.vis);
      for (const s of [n.barBg, n.barFill]) { s.removeFromParent(); s.material.dispose(); }
    }
    for (const f of this.fades || []) if (!f.gone) A.disposeVisual(f.v);
    if (this.beacon) A.disposeVisual(this.beacon.vis);
    for (const f of this.floaters) { f.mesh.removeFromParent(); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
    for (const zone of [this.extractZone, this.beacon?.zone]) {
      if (!zone) continue;
      zone.g.removeFromParent();
      zone.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    this.player.dispose();
    this.shots.dispose();
    this.fx.dispose();
    this.world.dispose();
    this.three.clear();
    this.game.stage.style.cursor = '';
    this.game.ui.classList.remove('explore-ui');
  }
}
