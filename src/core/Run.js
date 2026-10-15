// Run state: the single source of truth for everything that lasts for one run. Scenes read and
// write it; they never keep their own resource totals.
//
// Night flow:  briefing → explore → summary → prep → defense → (next night's briefing | results)
// `run.phase` records where the run is; Continue resumes from 'briefing', 'explore', 'summary', 'prep' or
// 'wave' snapshots. 'explore' is written as the trip starts: Continue from it means the game closed mid-day,
// and the trip counts as abandoned (abandonTrip), so quitting can't dodge a bad day.
// A 'wave' snapshot is written when a wave starts (towers locked, Relay HP as it began); Continue
// from it restarts that wave with the same build, so quitting mid-wave can't undo a loss or re-shop.
//
// "Tonight" (`run.tonight`) collects every modifier for the coming defense: the chosen district's
// threat, objective boons and optional/event flags. It is rebuilt each night.
//
// Modes (src/data/modes.js): `mode` 'normal' | 'long' (Long Night: endless past night 6) | 'daily' (date seed);
// `overgrowth` = the difficulty level; `mods` = the active modifier keys (Overgrowth's first N, or the Daily's);
// mod(field) / modSum(field) read them wherever they apply.

import { CONFIG, RESOURCE_KEYS, RESOURCES, nightTune } from '../data/config.js';
import { DISTRICTS, DISTRICT_KEYS, AREA_OFFERS } from '../data/districts.js';
import { MODES, OVERGROWTH, DAILY } from '../data/modes.js';
import { RESEARCH_TREE } from '../data/unlocks.js';
import { PRIMARY, PRIMARY_KEYS } from '../data/objectives.js';
import { BOSS, BOSSES, clearedThreat } from '../data/bosses.js';
import { WEATHER } from '../data/weather.js';
import { GUIDE } from '../data/guide.js';
import { SKILLS, SKILL_KEYS, SKILL_OFFERS, skillId } from '../data/skills.js';
import { RECIPES, TOWER_MODS, BLADE_STACK } from '../data/crafting.js';
import { TOWERS, TOWER_ORDER, BRANCH_KEYS } from '../data/towers.js';
import { DEFENSE, SALVAGE, healthMult } from '../data/waves.js';
import { PROTOCOLS, PROTOCOL_ORDER } from '../data/protocols.js';
import { RELICS, relicMod as relicFx, relicLive } from '../data/relics.js';
import { makeRng, newSeed, subSeed } from './rng.js';
import { pickMapKey, mapFor, legacyPadTile } from '../data/defenseMap.js';
import { saveRun, clearRun, patchRun } from './Save.js';

const emptyRes = () => ({ scrap: 0, circuits: 0, biofiber: 0, intel: 0 });

export function emptyTonight() {
  return {
    threat: null,          // district nightThreat object
    boons: [],             // [{ text, ...effect }] from objectives / optionals / events
    freeUpgrades: 0,       // free tower upgrades left tonight
    freeRepair: 0,         // relay HP restored for free at prep start (applied once)
    towerRate: 1,          // tower attack-speed multiplier
    towerDamage: 1,        // tower damage multiplier
    enemyCount: 1,         // wave size multiplier
    enemySpeed: 1,         // enemy speed multiplier
    laneSlow: null,        // { lane, mult }
    extraGroups: [],       // extra wave groups [{ type, count }]
    fieldTuningUsed: false,
    emergencyPatchUsed: false,
    sabotaged: false,      // Intel sabotage used tonight
    prepBonusGiven: false,
    exchanged: 0,          // Scrap → component trades made tonight (DEFENSE.exchange.max)
  };
}

export class Run {
  constructor() {
    this.version = CONFIG.saveVersion;
    this.seed = newSeed();
    this.night = 1;
    this.phase = 'briefing';
    this.relayHp = CONFIG.relay.hp;
    this.playerHp = CONFIG.player.hp;
    this.meds = 0;
    this.weapon = 'machete';
    this.res = { ...CONFIG.startResources };
    this.towers = [];            // [{ x, y (tile), type, level, target, spent: {scrap,...} }] (old saves: pad → tile in fromSave)
    this.skills = [];
    this.skillPoints = 0;
    // Camp crafting (src/data/crafting.js; the Workbench step after the summary). Older saves have none:
    // Object.assign in fromSave keeps these defaults.
    this.items = {};             // tower mods crafted but not fitted yet: { modKey: count }
    this.blade = [];             // machete upgrades owned this run (recipe keys)
    this.crafted = {};           // everything crafted this run: { recipeKey: count }
    // Relics (src/data/relics.js) brought home and working for the rest of the run; read through relicMod().
    // Ones picked up on a trip are carried by the JungleScene until applyExpedition banks them.
    this.relics = [];
    this.district = null;        // district chosen for today
    // The persistent jungle (src/world/JungleGen.js is regenerated from `seed`; only what the player
    // changed is stored): cut = undergrowth cleared (bitset, base64), opened = container ids,
    // pylons = activated relay pylons, explored = map discovery (bitset), used = sites whose objective
    // props are spent, day = the night the regrowth was last applied for; relics = relic sources used
    // (strongboxes, shrines, '<shrine>+' = a landmark's one-time extra), lore = data logs taken, visited = named
    // places already announced (Stage 7 relics & lore; older saves: empty); forage = wild fruit bushes, fungus stumps
    // and dusk blooms you have seen (ids; the map remembers them, critic N2).
    this.world = { cut: '', opened: [], pylons: [], explored: '', used: [], day: 0, relics: [], lore: [], visited: [], forage: [] };
    // The night map this run plays (src/data/defenseMap.js DEFENSE_MAPS; picked from the seed in create()).
    // Saves from before map variants have none: Object.assign in fromSave keeps this default.
    this.mapKey = 'twin';
    this.tonight = emptyTonight();
    this.lastExpedition = null;  // result object for the summary screen
    this.stats = {
      kills: 0, districts: [], peak: { ...CONFIG.startResources }, research: 0,
      bossDamage: 0, nightsSurvived: 0, deaths: 0, extractions: 0,
    };
    this.bossResearchGiven = 0;
    // Night pushes (DefenseScene): a 'wave' snapshot taken in a lull records the push to resume at, so Continue
    // re-enters that lull with the build as it stood; 0 = restart the night's first push.
    this.wavePush = 0;
    this.salvage = null;         // post-night salvage pick waiting for the next prep: { freeUpgrades }
    this.guided = false;        // the player's first run: night 1 offers one area and the day is coached (src/data/guide.js)
    this.debug = false;          // started from a ?debug= URL (kept out of lifetime stats)
    this.noSave = false;         // debug runs don't write the run save (see Run.save)
    // Run systems (Stage 7, src/data/modes.js; see the header).
    this.mode = 'normal';
    this.overgrowth = 0;
    this.mods = [];
    this.dailyDate = null;       // 'YYYY-MM-DD' of a Daily run
    this.kit = null;             // the starting kit taken (a research node key)
    this.offers = [];            // areas offered each night (index = night − 1): later offers avoid repeating them
    this.goals = [];             // the goal taken each night (index = night − 1): later goals avoid repeating them
    this.objective = null;       // today's goal key (fixed when the area is chosen)
    this.areaRolls = 0;          // Second Look re-rolls used (a salt for the area draw) …
    this.areaRollNight = 0;      // … and the night the last one was used (once a night)
    this.skillRolls = 0;         // Fresh Ideas re-rolls used (a salt for the skill draw) …
    this.skillRollNight = 0;     // … and the night the last one was used
    this.areaCount = 2;          // areas the briefing offers (Scout Report: 3; fixed when the run starts)
    this.sellRefund = null;      // share of a tower's Scrap a sale gives back (Salvage Logic; null = CONFIG.sellRefund)
    // Area bosses (src/data/bosses.js): areas whose boss is dead (their night danger is gone for the run).
    this.bosses = [];
    this.weatherKey = null;      // a forced weather for every day (debug &weather=…); null = seeded (weatherFor)
  }

  /**
   * Start a new run, applying permanent unlocks from meta. opts: { mode: 'normal' | 'long' | 'daily',
   * overgrowth: level (normal / long), date: 'YYYY-MM-DD' (daily; default today) }.
   */
  static create(meta, opts = {}) {
    const r = new Run();
    r.mode = MODES.includes(opts.mode) ? opts.mode : 'normal';
    if (r.mode === 'daily') {
      r.dailyDate = opts.date || localDate();
      r.seed = dailySeed(r.dailyDate);
      r.mods = dailyMods(r.dailyDate);
    } else {
      r.overgrowth = Math.max(0, Math.min(OVERGROWTH.max, Math.floor(opts.overgrowth || 0)));
      r.mods = OVERGROWTH.order.slice(0, r.overgrowth);
    }
    if (meta.unlocks.includes('stockpile')) r.res.scrap += 20;
    if (meta.unlocks.includes('field_kit')) r.meds = 1;
    if (meta.unlocks.includes('scattergun') && meta.startWeapon === 'scattergun') r.weapon = 'parang';
    // A starting kit trades one resource for another (research tree, chosen in the Collection).
    const kit = meta.startKit && meta.unlocks.includes(meta.startKit) ? RESEARCH_TREE[meta.startKit]?.kit : null;
    if (kit) {
      r.kit = meta.startKit;
      for (const k of RESOURCE_KEYS) r.res[k] = Math.max(0, r.res[k] + (kit.res[k] || 0));
    }
    r.res.scrap = Math.max(0, r.res.scrap + r.modSum('startScrap'));
    if (meta.unlocks.includes('scout_report')) r.areaCount = RESEARCH_TREE.scout_report.areas;
    if (meta.unlocks.includes('salvage_logic')) r.sellRefund = RESEARCH_TREE.salvage_logic.refund;
    // Records as they stood when the run began (Results says "new best" against these).
    if (r.mode === 'long') r.stats.longBefore = meta.longNight?.best || 0;
    if (r.mode === 'daily') r.stats.dailyBefore = meta.daily?.[r.dailyDate]?.nights || 0;
    r.mapKey = pickMapKey(r.seed);   // the night map, fixed for the run (towers stay where they were built)
    r.relayHp = r.relayMax;
    r.stats.peak = { ...r.res };   // after unlock bonuses (Hidden Stockpile, kits)
    // Lifetime run count is bumped by startNewRun (TitleScene), so debug runs don't inflate it.
    return r;
  }

  // ---------------------------------------------------------------- modes and modifiers

  isLongNight() { return this.mode === 'long'; }
  isDaily() { return this.mode === 'daily'; }

  /** Product of a numeric modifier field over the active mods (1 when none has it). */
  mod(field) {
    let m = 1;
    for (const k of this.mods || []) { const v = OVERGROWTH.mods[k]?.[field]; if (typeof v === 'number') m *= v; }
    return m;
  }

  /** Sum of a numeric modifier field (0 when none has it); `true` flags count as 1. */
  modSum(field) {
    let s = 0;
    for (const k of this.mods || []) { const v = OVERGROWTH.mods[k]?.[field]; if (typeof v === 'number') s += v; else if (v === true) s += 1; }
    return s;
  }

  hasMod(field) { return (this.mods || []).some((k) => OVERGROWTH.mods[k]?.[field] != null); }

  /** Research multiplier: Overgrowth +10% a level (the Daily: per modifier), Archivist +10%. */
  researchMult(meta) {
    const bonus = this.isDaily() ? (this.mods.length * DAILY.researchPerMod) : this.overgrowth * OVERGROWTH.researchPerLevel;
    return (1 + bonus) * (meta?.unlocks?.includes('archivist') ? RESEARCH_TREE.archivist.mult : 1);
  }

  /** Short label for the run's mode: "Overgrowth 3", "Long Night", "Daily 2026-10-13", or '' for a plain run. */
  modeLabel() {
    const parts = [];
    if (this.isLongNight()) parts.push('Long Night');
    if (this.isDaily()) parts.push(`Daily ${this.dailyDate}`);
    if (this.overgrowth > 0) parts.push(`Overgrowth ${this.overgrowth}`);
    return parts.join(' · ');
  }

  /** The night with the boss: night 6, and in the Long Night every bossEvery-th night after it. */
  isBossNight(night = this.night) {
    if (night === CONFIG.nights) return true;
    return this.isLongNight() && night > CONFIG.nights && night % (DEFENSE.longNight?.bossEvery || 3) === 0;
  }

  /** Enemy health multiplier tonight: the night curve (healthMult, which grows past night 6) × Overgrowth. */
  nightHpMult(night = this.night) { return healthMult(night) * this.mod('hpMult'); }

  // ---------------------------------------------------------------- relics (src/data/relics.js)

  hasRelic(id) { return (this.relics || []).includes(id); }

  /** Med kits you can carry (CONFIG.player.maxMeds; Medic's Satchel +1). */
  maxMeds() { return CONFIG.player.maxMeds + this.relicMod('maxMeds'); }

  /** THE place relic effects are read: field `field` combined over the relics brought home (relics.js FX_MODE). */
  relicMod(field) { return relicFx(this.relics, field); }

  /** Extra wave groups from relics (Hungry Idol), added to tonight.extraGroups. */
  relicExtraGroups(ids = this.relics) {
    return (ids || []).map((id) => RELICS[id]?.fx?.nightGroup).filter(Boolean).map((g) => ({ ...g, relic: true }));
  }

  /** Put relics' night effects into `tonight` (chooseDistrict; applyExpedition for ones just brought home). */
  applyRelicsTonight(ids = this.relics) {
    const t = this.tonight;
    t.extraGroups.push(...this.relicExtraGroups(ids));
    t.enemySpeed *= relicFx(ids, 'enemySpeed');
  }

  /**
   * Tower damage multiplier from relics for one hit (DefenseScene.damage): Rusted Bell (vsType) and the Cracked
   * Lens (`firstShot`: a tower's first hit in each push; `tower._lensPush` remembers the push it fired in).
   */
  relicHitMult(tower, enemyType, push) {
    let m = this.relicMod('vsType')[enemyType] || 1;
    const lens = this.relicMod('firstShot');
    if (lens !== 1 && tower && tower._lensPush !== push) { tower._lensPush = push; m *= lens; }
    return m;
  }

  /** A Relay Protocol's numbers with relics applied (Overcharged Capacitor, Signal Booster). */
  protocolDef(key) {
    const P = PROTOCOLS[key];
    const cd = this.relicMod('protocolCooldown'), r = this.relicMod('protocolRadius');
    return cd === 1 && r === 1 ? P : { ...P, cooldown: P.cooldown * cd, radius: P.radius * r };
  }

  /**
   * Relics carried home (`result.relics`): kept for the rest of the run if you got home — their night effects join
   * tonight at once and a lower Relay maximum (Blood Moss) clips its health — else lost. The summary lists them
   * (`relicsFound` / `relicsLost`).
   */
  bankRelics(result, game, summary) {
    const ids = [...new Set((result.relics || []).filter((id) => RELICS[id]))];
    if (!ids.length) return;
    if (!result.extracted) { summary.relicsLost = ids; return; }
    const fresh = ids.filter((id) => !this.hasRelic(id));
    if (!Array.isArray(this.relics)) this.relics = [];
    this.relics.push(...fresh);
    summary.relicsFound = fresh;
    this.applyRelicsTonight(fresh);
    this.relayHp = Math.max(1, Math.min(this.relayHp, this.relayMax));
    this.seeRelics(game, fresh);
  }

  /**
   * The codex (meta.relicsSeen / meta.lore): a relic counts as seen once you pick it up or a shrine offers it; a
   * data log once you read it. Debug runs only record with &save=1 (they never touch the real save otherwise).
   */
  seeRelics(game, ids) { this._codex(game, 'relicsSeen', ids); }
  readLore(game, id) { this._codex(game, 'lore', [id]); }
  _codex(game, field, ids) {
    if (this.debug && this.noSave) return;
    const m = game.meta;
    if (!Array.isArray(m[field])) m[field] = [];
    let any = false;
    for (const id of ids) if (id && !m[field].includes(id)) { m[field].push(id); any = true; }
    if (any) game.saveMeta();
  }

  /** "Name: what it does now" for the relics that matter at night (night prep's "Also tonight"). */
  relicNightLines() {
    return (this.relics || []).filter((id) => RELICS[id] && RELICS[id].when !== 'day')
      .map((id) => ({ id, name: RELICS[id].name, text: relicLive(id, this), down: RELICS[id].down || null }));
  }

  static fromSave(obj) {
    const r = new Run();
    Object.assign(r, obj);
    r.tonight = { ...emptyTonight(), ...obj.tonight };
    r.stats = { ...new Run().stats, ...obj.stats };
    r.setSkills(obj.skills || []);   // skills removed by the Stage 7 rework map to their replacement (or a refund)
    r.items = { ...(obj.items || {}) };
    r.blade = [...(obj.blade || [])];
    r.crafted = { ...(obj.crafted || {}) };
    // Stage 9 (build anywhere): towers saved on an old build pad stand on that pad's tile.
    const map = mapFor(r.mapKey);
    r.towers = (obj.towers || []).map((t) => {
      if (Number.isInteger(t.x) && Number.isInteger(t.y)) return t;
      const at = legacyPadTile(map, t.pad);
      const { pad, ...rest } = t;
      return at ? { ...rest, x: at.x, y: at.y } : null;
    }).filter(Boolean);
    return r;
  }

  /** Decode the persistent jungle state into working arrays for a world of `size` tiles. */
  worldState(size, exploreCell) {
    const w = this.world || (this.world = { cut: '', opened: [], pylons: [], explored: '', used: [], day: 0 });
    const ec = Math.ceil(size / exploreCell);
    return {
      cut: unpackBits(w.cut, size * size),
      opened: new Set(w.opened || []),
      pylons: new Set(w.pylons || []),
      explored: unpackBits(w.explored, ec * ec),
      used: new Set(w.used || []),
      day: w.day || 0,
      relics: new Set(w.relics || []),
      lore: new Set(w.lore || []),
      visited: new Set(w.visited || []),
      forage: new Set(w.forage || []),
    };
  }

  /** Store the working jungle state back (called when an expedition ends). */
  storeWorld(st) {
    this.world = {
      cut: packBits(st.cut), opened: [...st.opened], pylons: [...st.pylons],
      explored: packBits(st.explored), used: [...st.used], day: st.day,
      relics: [...(st.relics || [])], lore: [...(st.lore || [])], visited: [...(st.visited || [])],
      forage: [...(st.forage || [])],
    };
  }

  toSave() {
    return JSON.parse(JSON.stringify(this));
  }

  /** Snapshot at a safe point ('briefing', 'explore', 'summary', 'prep' or 'wave'; Save.RUN_PHASES). */
  save(phase) {
    this.phase = phase;
    if (this.noSave) return;   // debug-URL runs never touch the real run save (unless &save=1)
    saveRun(this.toSave());
  }

  end() { if (!this.noSave) clearRun(); }

  rng(...parts) { return makeRng(subSeed(this.seed, this.night, ...parts)); }

  // ---------------------------------------------------------------- districts

  /**
   * Today's area options, seeded so a reload offers the same ones. A weighted draw without repeats that
   * avoids areas offered on earlier nights (most of all last night's) and prefers unvisited ones
   * (AREA_OFFERS), so one area is rarely offered night after night. `this.offers` holds what earlier nights
   * offered; `areaRolls` (Second Look) re-rolls tonight's draw; `areaCount` is 2, or 3 with Scout Report
   * (fixed when the run starts).
   */
  districtChoices() {
    // The guided first night: one easy area, no choice yet (GUIDE.district).
    if (this.isGuidedDay()) return [GUIDE.district];
    const rng = this.rng('districts', this.areaRolls || 0);
    const pool = DISTRICT_KEYS.filter((k) => (DISTRICTS[k].minNight || 1) <= this.night);
    const past = (this.offers || []).slice(0, this.night - 1);
    const w = {};
    for (const k of pool) {
      let x = 1;
      past.forEach((offer, i) => { if (Array.isArray(offer) && offer.includes(k)) x *= i === past.length - 1 ? AREA_OFFERS.lastNight : AREA_OFFERS.earlier; });
      if (this.stats.districts.includes(k)) x *= AREA_OFFERS.visited;
      w[k] = x;
    }
    const out = [];
    const n = Math.min(pool.length, this.areaCount || 2);
    while (out.length < n) {
      const k = rng.weighted(w);
      out.push(k);
      delete w[k];
    }
    return out;
  }

  /** Second Look (research): can tonight's area offer still be re-rolled? */
  canRerollAreas(meta) {
    return !!meta?.unlocks?.includes('second_look') && !this.isGuidedDay() && this.areaRollNight !== this.night && !this.district;
  }

  /** Re-roll tonight's area offer (once a night). */
  rerollAreas(meta) {
    if (!this.canRerollAreas(meta)) return false;
    this.areaRolls = (this.areaRolls || 0) + 1;
    this.areaRollNight = this.night;
    return true;
  }

  /**
   * The primary objective for a district today (seeded). Once the area is chosen it is fixed (`this.objective`).
   * The areas on offer always get different objectives; goals taken on the last two nights go to the back of
   * the deal, so the same goal rarely comes twice in a row.
   */
  objectiveFor(districtKey) {
    if (this.isGuidedDay() && districtKey === GUIDE.district) return GUIDE.objective;
    if (districtKey === this.district && this.objective) return this.objective;
    const i = this.districtChoices().indexOf(districtKey);
    // Goals with a minNight (the Stage 7 ones: escort, uplink, tracking, haul, purge) join the deal from that night.
    const keys = PRIMARY_KEYS.filter((k) => (PRIMARY[k].minNight || 1) <= this.night);
    if (i < 0) return this.rng('objective', districtKey).pick(keys);
    const recent = (this.goals || []).slice(Math.max(0, this.night - 3), this.night - 1);
    const deal = this.rng('objectives', this.areaRolls || 0).shuffle(keys);
    const order = [...deal.filter((k) => !recent.includes(k)), ...deal.filter((k) => recent.includes(k))];
    return order[i % order.length];
  }

  /** Night 1 of the player's first run: one area, an easy objective, a coached day. */
  isGuidedDay() { return !!this.guided && this.night === 1; }

  /** What tonight's wave looks like if this district is chosen (nothing once its area boss is dead: clearedThreat). */
  threatFor(districtKey) {
    if (this.bossCleared(districtKey)) return clearedThreat(districtKey, DISTRICTS[districtKey].name);
    return DISTRICTS[districtKey].nightThreat;
  }

  // ---------------------------------------------------------------- area bosses (src/data/bosses.js)

  /** Has this area's boss been killed this run? */
  bossCleared(districtKey) { return Array.isArray(this.bosses) && this.bosses.includes(districtKey); }

  /** Is this area's boss in its lair today (from BOSS.fromNight, until it is killed)? */
  bossAlive(districtKey, night = this.night) { return !!BOSSES[districtKey] && night >= BOSS.fromNight && !this.bossCleared(districtKey); }

  /**
   * An area boss is dead: its area sends no danger for the rest of the run. If it is today's area, tonight's danger
   * (already set by chooseDistrict) goes at once.
   */
  clearBoss(districtKey) {
    if (!DISTRICTS[districtKey] || this.bossCleared(districtKey)) return false;
    if (!Array.isArray(this.bosses)) this.bosses = [];
    const old = DISTRICTS[districtKey].nightThreat;
    this.bosses.push(districtKey);
    const t = this.tonight;
    if (this.district === districtKey && t?.threat && !t.threat.cleared) {
      if (old.extraGroup) {
        const i = t.extraGroups.findIndex((g) => g.type === old.extraGroup.type && g.count === old.extraGroup.count);
        if (i >= 0) t.extraGroups.splice(i, 1);
      }
      if (old.enemySpeed) t.enemySpeed /= old.enemySpeed;
      t.threat = this.threatFor(districtKey);
    }
    return true;
  }

  /** Today's weather key (src/data/weather.js), or null for a plain day. Seeded per run and night. */
  weatherFor(night = this.night) {
    if (this.weatherKey) return WEATHER.kinds[this.weatherKey] ? this.weatherKey : null;
    if (night < WEATHER.fromNight || this.isGuidedDay()) return null;
    const rng = makeRng(subSeed(this.seed, night, 'weather'));
    if (!rng.chance(WEATHER.chance)) return null;
    return rng.weighted(WEATHER.weights);
  }

  /** Today's weather definition, or null. */
  weather(night = this.night) { const k = this.weatherFor(night); return k ? { key: k, ...WEATHER.kinds[k] } : null; }

  chooseDistrict(key) {
    // Remember what tonight offered and which goal was taken (later nights avoid repeating them).
    const offered = this.districtChoices();
    this.objective = null;
    this.objective = this.objectiveFor(key);
    if (!Array.isArray(this.offers)) this.offers = [];
    if (!Array.isArray(this.goals)) this.goals = [];
    this.offers[this.night - 1] = offered;
    this.goals[this.night - 1] = this.objective;
    this.district = key;
    this.tonight = emptyTonight();
    this.tonight.threat = this.threatFor(key);   // nothing once the area's boss is dead (clearBoss)
    const t = this.tonight.threat;
    if (t.extraGroup) this.tonight.extraGroups.push(t.extraGroup);
    if (t.enemySpeed) this.tonight.enemySpeed *= t.enemySpeed;
    // Overgrowth "Restless jungle": a second area's danger joins tonight (seeded, never the chosen one's).
    const second = this.secondThreat();
    if (second) {
      this.tonight.threat2 = second;
      if (second.extraGroup) this.tonight.extraGroups.push(second.extraGroup);
      if (second.enemySpeed) this.tonight.enemySpeed *= second.enemySpeed;
    }
    this.tonight.enemySpeed *= this.mod('enemySpeed');
    this.applyRelicsTonight();   // relics' night costs (Hungry Idol's Crawlers, Storm Totem's speed)
    if (!this.stats.districts.includes(key)) this.stats.districts.push(key);
    this.phase = 'explore';
  }

  /** The Overgrowth second danger for tonight if `key` is chosen (null without the modifier). */
  secondThreat(key = this.district) {
    if (!this.hasMod('secondDanger') || !key) return null;
    const others = DISTRICT_KEYS.filter((k) => k !== key && (DISTRICTS[k].minNight || 1) <= this.night && !this.bossCleared(k));
    return others.length ? DISTRICTS[this.rng('danger2', key).pick(others)].nightThreat : null;
  }

  /**
   * Loot multipliers for today's containers (JungleScene rollLoot): the chosen area's FINDS apply to everything
   * you open today, wherever it is (the briefing card promises exactly that), × Overgrowth "Picked over".
   */
  lootMults() {
    const base = DISTRICTS[this.district]?.loot || { scrap: 1, circuits: 1, biofiber: 1, intel: 1, med: 1 };
    const wx = this.weather?.()?.lootScrap || 1;   // Fog: containers hold more Scrap (src/data/weather.js)
    return { ...base, scrap: base.scrap * this.mod('lootScrap') * this.skillMult('containerScrap') * this.relicMod('containerScrap') * wx };   // (Salvage King, Hungry Idol)
  }

  // ---------------------------------------------------------------- resources

  canAfford(cost) {
    return RESOURCE_KEYS.every((k) => (this.res[k] || 0) >= (cost[k] || 0));
  }

  /** Human-readable reason a cost can't be paid, e.g. "Need 12 more Scrap". Null if affordable. */
  missing(cost) {
    const out = [];
    for (const k of RESOURCE_KEYS) {
      const short = (cost[k] || 0) - (this.res[k] || 0);
      if (short > 0) {
        const label = RESOURCES[k].label;
        out.push(`${short} more ${short === 1 ? label.replace(/s$/, '') : label}`);
      }
    }
    return out.length ? `Need ${out.join(', ')}` : null;
  }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    for (const k of RESOURCE_KEYS) this.res[k] -= cost[k] || 0;
    return true;
  }

  add(gain) {
    for (const k of RESOURCE_KEYS) this.res[k] += Math.floor(gain[k] || 0);
    for (const k of RESOURCE_KEYS) this.stats.peak[k] = Math.max(this.stats.peak[k], this.res[k]);
  }

  // ---------------------------------------------------------------- skills

  /** Owns this skill? Old ids from before the Stage 7 rework read through SKILL_RENAMED ('pack_rat_1' → Pack Rat). */
  hasSkill(id) {
    const k = skillId(id);
    return !!k && this.skills.includes(k);
  }

  /**
   * Set the owned skills from a list that may hold old ids (a save from before the rework, a debug URL): each maps
   * to its replacement (SKILL_RENAMED); a removed skill, or a second old skill merged into one already listed,
   * becomes an unspent skill point instead. Returns the points refunded.
   */
  setSkills(list) {
    const out = [];
    let refund = 0;
    for (const raw of Array.isArray(list) ? list : []) {
      const k = skillId(raw);
      if (!k || out.includes(k)) { refund += 1; continue; }
      out.push(k);
    }
    this.skills = out;
    this.skillPoints = (this.skillPoints || 0) + refund;
    return refund;
  }

  /** Skills owned in a branch (keystones not counted). */
  branchCount(branch) { return this.skills.filter((k) => SKILLS[k]?.branch === branch && !SKILLS[k].keystone).length; }

  /** Can this skill be offered now? Unowned, its `req` owned, its research unlock owned; a keystone needs SKILL_OFFERS.keystoneNeeds of its branch. */
  skillOffered(k, meta) {
    const s = SKILLS[k];
    if (!s || this.skills.includes(k)) return false;
    if (s.req && !this.hasSkill(s.req)) return false;
    if (s.needsUnlock && !meta?.unlocks?.includes(s.needsUnlock)) return false;
    if (s.keystone && this.branchCount(s.branch) < SKILL_OFFERS.keystoneNeeds) return false;
    return true;
  }

  /** Cards in a skill pick: 3, Wider Choice 4, Field Notes +2 on the run's first pick, Overgrowth "Narrow choice" −1. */
  skillCardCount(meta) {
    let n = meta.unlocks.includes('wide_choice') ? 4 : 3;
    if (meta.unlocks.includes('field_notes') && this.skills.length === 0) n += RESEARCH_TREE.field_notes.extra;
    return Math.max(1, n + this.modSum('skillOptions'));
  }

  /**
   * Skill options for one pick (seeded: a reload deals the same hand; skillRolls = Fresh Ideas re-rolls deal a new one).
   * Each card is drawn from the skills that can be offered (skillOffered): with chance SKILL_OFFERS.ownedShare from
   * a branch you already own (when both kinds are left), else from the others — so builds lean into an identity
   * without locking you in. Within that group, branches not on the table yet come first, and an open keystone
   * weighs SKILL_OFFERS.keystoneWeight. The first pick of a run (nothing owned) spans three branches.
   */
  skillOptions(meta, salt = 0) {
    const n = this.skillCardCount(meta);
    const O = SKILL_OFFERS;
    const rng = this.rng('skills', this.skills.length, salt, this.skillRolls || 0);
    const owned = new Set(this.skills.map((k) => SKILLS[k]?.branch).filter(Boolean));
    const left = SKILL_KEYS.filter((k) => this.skillOffered(k, meta));
    const picks = [];
    while (picks.length < n && left.length) {
      const mine = left.filter((k) => owned.has(SKILLS[k].branch));
      const other = left.filter((k) => !owned.has(SKILLS[k].branch));
      let group = mine.length && other.length ? (rng.next() < O.ownedShare ? mine : other) : (mine.length ? mine : other);
      const fresh = group.filter((k) => !picks.some((p) => SKILLS[p].branch === SKILLS[k].branch));
      if (fresh.length) group = fresh;
      const w = {};
      for (const k of group) w[k] = SKILLS[k].keystone ? O.keystoneWeight : 1;
      const k = rng.weighted(w);
      picks.push(k);
      left.splice(left.indexOf(k), 1);
    }
    return picks;
  }

  takeSkill(id) {
    if (this.skillPoints <= 0 || !SKILLS[id] || this.skills.includes(id)) return false;
    this.skillPoints -= 1;
    this.skills.push(id);
    if (SKILLS[id].relayMax) this.relayHp += SKILLS[id].relayMax;   // Reinforced Core: the new health arrives repaired
    return true;
  }

  /** Product of a numeric skill field over owned skills (1 when none has it), e.g. skillMult('bountyMult'). */
  skillMult(field) {
    let m = 1;
    for (const k of this.skills) { const v = SKILLS[k]?.[field]; if (typeof v === 'number') m *= v; }
    return m;
  }

  /** Night kills' Scrap bounty multiplier (Salvage King). */
  bountyMult() { return this.skillMult('bountyMult') * (this.tonight?.provoked ? DEFENSE.provoke?.bounty ?? 1 : 1); }

  /** Fresh Ideas (research): can the skill cards be re-rolled now (once a night, with a point to spend)? */
  canRerollSkills(meta) {
    return !!meta?.unlocks?.includes('skill_reroll') && this.skillPoints > 0 && this.skillRollNight !== this.night;
  }

  rerollSkills(meta) {
    if (!this.canRerollSkills(meta)) return false;
    this.skillRolls = (this.skillRolls || 0) + 1;
    this.skillRollNight = this.night;
    return true;
  }

  /** Relay max health: base + skills (Reinforced Core) + Workbench plating + Overgrowth (Brittle Relay). */
  get relayMax() {
    let m = CONFIG.relay.hp + this.modSum('relayMax') + this.relicMod('relayMax');   // (Blood Moss)
    for (const k of this.skills) m += SKILLS[k]?.relayMax || 0;
    for (const [k, n] of Object.entries(this.crafted || {})) m += (RECIPES[k]?.relayMax || 0) * n;
    return m;
  }

  // ---------------------------------------------------------------- towers

  isTowerUnlocked(key, meta) {
    const t = TOWERS[key];
    return !t.locked || meta.unlocks.includes(t.locked);
  }

  availableTowers(meta) { return TOWER_ORDER.filter((k) => this.isTowerUnlocked(k, meta)); }

  /** Towers of this type already built (each one adds CONFIG.towerSurcharge Scrap to the next). */
  towerCount(type) { return this.towers.filter((t) => t.type === type).length; }

  /** Extra Scrap the next tower of this type costs because of the ones already built. */
  buildSurcharge(type) { return (CONFIG.towerSurcharge || 0) * this.towerCount(type); }

  /** Build cost for a tower type with skills and the same-type surcharge applied. */
  buildCost(type) {
    const c = { ...TOWERS[type].cost };
    c.scrap = (c.scrap || 0) + this.buildSurcharge(type);
    if (this.hasSkill('efficient_assembly')) c.scrap = Math.round(c.scrap * SKILLS.efficient_assembly.scrapMult);
    if (this.relicMod('noBiofiber').includes(type)) delete c.biofiber;   // (Seed Bank)
    return c;
  }

  /**
   * Cost of the next upgrade for a placed tower, or null at max level. Free upgrades → {}.
   * At the level-3 branch point `branch` ('a' | 'b') picks which branch's price (default 'a').
   */
  upgradeCost(tower, branch) {
    const up = TOWERS[tower.type].upgrades[tower.level - 1];
    if (!up) return null;
    if (this.tonight.freeUpgrades > 0) return {};
    const c = { ...(up.branches ? (up.branches[branch] || up.branches.a) : up).cost };
    if (this.hasSkill('field_tuning') && !this.tonight.fieldTuningUsed) c.scrap = Math.floor(c.scrap * SKILLS.field_tuning.scrapMult);
    if (this.relicMod('noBiofiber').includes(tower.type)) delete c.biofiber;   // (Seed Bank)
    return c;
  }

  /** True when the tower's next upgrade is the level-3 choice of two branches. */
  upgradeBranches(tower) {
    return TOWERS[tower.type].upgrades[tower.level - 1]?.branches || null;
  }

  sellValue(tower) {
    // sellRefund: Salvage Logic (research) raises it for the run; null = CONFIG.sellRefund.
    return Math.floor((tower.spent.scrap || 0) * (this.sellRefund || CONFIG.sellRefund));
  }

  /** Place a tower on tile (x, y) (the scene checks the spot: DefenseScene._placeCheck). Returns the record or null. */
  build(type, x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || this.towers.some((t) => t.x === x && t.y === y)) return null;
    const cost = this.buildCost(type);
    if (!this.spend(cost)) return null;
    const tower = { x, y, type, level: 1, target: TOWERS[type].target, spent: { ...cost } };
    // Efficient Assembly (it absorbed Circuit Recovery): a build that uses Circuits may give one back.
    if (this.hasSkill('efficient_assembly') && (cost.circuits || 0) > 0 && Math.random() < SKILLS.efficient_assembly.circuitBack) {
      this.res.circuits += 1;
      tower.refunded = true;
    }
    this.towers.push(tower);
    return tower;
  }

  /** Upgrade a placed tower one level; at the level-3 branch point `branch` ('a' | 'b') is the choice. */
  upgrade(tower, branch) {
    const branches = this.upgradeBranches(tower);
    if (branches && !BRANCH_KEYS.includes(branch)) branch = 'a';
    const cost = this.upgradeCost(tower, branch);
    if (!cost || !this.spend(cost)) return false;
    if (this.tonight.freeUpgrades > 0 && Object.keys(cost).length === 0) this.tonight.freeUpgrades -= 1;
    else if (this.hasSkill('field_tuning')) this.tonight.fieldTuningUsed = true;
    for (const k of RESOURCE_KEYS) tower.spent[k] = (tower.spent[k] || 0) + (cost[k] || 0);
    tower.level += 1;
    if (branches) tower.branch = branch;
    return true;
  }

  sell(tower) {
    const i = this.towers.indexOf(tower);
    if (i < 0) return 0;
    const v = this.sellValue(tower);
    this.towers.splice(i, 1);
    this.res.scrap += v;
    if (tower.mod) this.addItem(tower.mod);   // a fitted Workbench mod goes back to the bench, ready to refit
    return v;
  }

  /** Effective stats for a placed tower: data + upgrades + skills + tonight's modifiers. */
  towerStats(tower, relayFrac = 1) {
    const def = TOWERS[tower.type];
    const s = { ...def };
    delete s.upgrades;
    for (let i = 0; i < tower.level - 1; i++) {
      const up = def.upgrades[i];
      // The level-3 branch point merges the chosen branch (old saves without one: 'a').
      Object.assign(s, up.branches ? (up.branches[tower.branch] || up.branches.a).set : up.set);
    }
    // Multipliers: the salvage tune-up (rangeMod), tonight's boons, then every skill's and the fitted Workbench
    // mod's `tower` block (applyTowerMod: same format in skills.js and crafting.js).
    const acc = { range: tower.rangeMod || 1, rate: this.tonight.towerRate, dmg: this.tonight.towerDamage };
    // Relics: Storm Totem (damage), Pylon Coil (attack speed per beacon switched on, capped).
    acc.dmg *= this.relicMod('towerDamage');
    acc.rate *= 1 + Math.min(this.relicMod('beaconRateMax'), this.relicMod('beaconRate') * (this.world?.pylons?.length || 0));
    for (const k of this.skills) if (SKILLS[k]?.tower) applyTowerMod(s, tower.type, SKILLS[k].tower, acc, relayFrac);
    const mod = TOWER_MODS[tower.mod];
    if (mod && mod.kinds.includes(s.kind)) applyTowerMod(s, tower.type, mod.tower, acc, relayFrac);
    s.range *= acc.range;
    if (s.cooldown) s.cooldown /= acc.rate;
    s.damage *= acc.dmg;
    return s;
  }

  // ---------------------------------------------------------------- crafting (src/data/crafting.js)

  /** Tower mods of this kind waiting for a socket. */
  itemCount(key) { return this.items?.[key] || 0; }

  addItem(key, n = 1) {
    if (!TOWER_MODS[key]) return;
    if (!this.items) this.items = {};
    this.items[key] = Math.max(0, (this.items[key] || 0) + n);
    if (!this.items[key]) delete this.items[key];
  }

  /** Every tower mod owned: in the bench and fitted ({ key: count }). */
  modsOwned() {
    const out = { ...(this.items || {}) };
    for (const t of this.towers) if (t.mod) out[t.mod] = (out[t.mod] || 0) + 1;
    return out;
  }

  /** Why a recipe can't be crafted right now (a plain sentence), or null. */
  craftBlocked(key) {
    const r = RECIPES[key];
    if (!r) return 'Unknown recipe';
    if (r.once && (this.crafted?.[key] || 0) > 0) return 'Already built this run';
    if (r.blade && (this.blade || []).includes(key)) return 'Already on your machete';
    if (r.gives?.meds && this.meds >= this.maxMeds()) return `You can carry ${this.maxMeds()} med kits`;
    return this.missing(r.cost);
  }

  /** Craft a recipe at the Workbench. Returns true when it was made. */
  craft(key) {
    const r = RECIPES[key];
    if (!r || this.craftBlocked(key) || !this.spend(r.cost)) return false;
    if (!this.crafted) this.crafted = {};
    this.crafted[key] = (this.crafted[key] || 0) + 1;
    if (r.gives?.meds) this.meds = Math.min(this.maxMeds(), this.meds + r.gives.meds);
    if (r.mod) this.addItem(r.mod);
    if (r.blade) this.blade = [...(this.blade || []), key];
    if (r.relayMax) this.relayHp = Math.min(this.relayMax, this.relayHp + r.relayMax);   // (relayMax already counts it)
    return true;
  }

  /** Can this mod go in this tower's socket? (the tower kinds in TOWER_MODS[key].kinds) */
  modFits(rec, key) {
    const m = TOWER_MODS[key], d = TOWERS[rec?.type];
    return !!(m && d && m.kinds.includes(d.kind));
  }

  /** Fit a mod from the bench into a tower's socket (free; a mod already there goes back to the bench). */
  fitMod(rec, key) {
    if (!this.modFits(rec, key) || this.itemCount(key) <= 0 || rec.mod === key) return false;
    if (rec.mod) this.addItem(rec.mod);
    this.addItem(key, -1);
    rec.mod = key;
    return true;
  }

  /** Take a tower's mod out (back to the bench). */
  unfitMod(rec) {
    if (!rec?.mod) return false;
    this.addItem(rec.mod);
    delete rec.mod;
    return true;
  }

  /**
   * The machete's modifiers this run: every owned skill's `blade` block and every Workbench machete upgrade's,
   * stacked by BLADE_STACK (add / mult / max / or). Player reads it when a trip starts (src/entities/BladeKit.js).
   */
  bladeMods() {
    const out = {};
    const blocks = [...this.skills.map((k) => SKILLS[k]?.blade), ...(this.blade || []).map((k) => RECIPES[k]?.blade)].filter(Boolean);
    for (const b of blocks) {
      for (const [f, v] of Object.entries(b)) {
        const how = BLADE_STACK[f] || 'max';
        const cur = out[f];
        if (cur == null) out[f] = v;
        else if (how === 'add') out[f] = cur + v;
        else if (how === 'mult') out[f] = cur * v;
        else if (how === 'or') out[f] = cur || v;
        else out[f] = Math.max(cur, v);
      }
    }
    return out;
  }

  /** Scrap the coming night prep adds on its own (Relay stipend, Prepared Defenses): the Workbench's Scrap note. */
  prepScrapComing() {
    if (this.tonight?.prepBonusGiven) return 0;
    const st = CONFIG.relay.stipend;
    let n = st ? st[Math.max(0, Math.min(st.length - 1, this.night - 1))] : 0;
    if (this.hasSkill('prepared_defenses')) n += SKILLS.prepared_defenses.scrap;
    return n;
  }

  /** Scrap the cheapest tower you could build tonight costs (the Workbench warns before a craft leaves less). */
  cheapestTowerScrap(meta) {
    const costs = this.availableTowers(meta).map((k) => this.buildCost(k).scrap || 0);
    return costs.length ? Math.min(...costs) : 0;
  }

  // ---------------------------------------------------------------- relay

  /** HP the next repair restores (a full step, or less near max; 0 at full health). */
  repairAmount() {
    return Math.max(0, Math.min(CONFIG.relay.repairAmount, Math.ceil(this.relayMax - this.relayHp)));
  }

  /** Scrap for the next repair, prorated to the HP actually restored (rounded up). */
  repairCost() {
    const R = CONFIG.relay;
    const hp = this.repairAmount() || R.repairAmount;
    return { scrap: Math.ceil((R.repairScrap * hp) / R.repairAmount) };
  }

  repair() {
    const hp = this.repairAmount();
    if (hp <= 0) return false;
    if (!this.spend(this.repairCost())) return false;
    this.relayHp = Math.min(this.relayMax, this.relayHp + hp);
    return true;
  }

  // ---------------------------------------------------------------- intel (night prep)

  decryptCost() { return { intel: CONFIG.intel.decryptCost }; }

  /** Spend Intel for Research Data (banked to meta at once). */
  decrypt(game) {
    if (!this.spend(this.decryptCost())) return false;
    this.award(game, CONFIG.intel.decryptResearch, 'Decrypted Intel');
    return true;
  }

  sabotageCost() { return { intel: CONFIG.intel.sabotageCost }; }

  /** Why Sabotage can't be used right now, or null. */
  sabotageBlocked() {
    if (this.tonight.sabotaged) return 'Already used tonight';
    if (this.waveCutCapped()) return `Wave cuts are already at the −${Math.round((1 - CONFIG.waveSizeFloor) * 100)}% cap`;
    return this.missing(this.sabotageCost());
  }

  /** Spend Intel to shrink tonight's wave (once per night). */
  sabotage() {
    if (this.sabotageBlocked() || !this.spend(this.sabotageCost())) return false;
    const mult = CONFIG.intel.sabotageWave;
    this.tonight.sabotaged = true;
    this.addBoon({ text: `Sabotage: wave ${Math.round((1 - mult) * 100)}% smaller.`, enemyCount: mult });
    return true;
  }

  /**
   * Wave-size multiplier actually used tonight: every cut stacks, floored at CONFIG.waveSizeFloor; Overgrowth
   * "Swarming" then grows the result (so the cuts keep their full −20% room).
   */
  waveCountMult() {
    return Math.max(CONFIG.waveSizeFloor ?? 0, this.tonight.enemyCount ?? 1) * this.mod('enemyCount')
      * (this.tonight.provoked ? DEFENSE.provoke?.enemies ?? 1 : 1);
  }

  /** Why Provoke can't be used now, or null (DEFENSE.provoke: from its night, once a night). */
  provokeBlocked() {
    const P = DEFENSE.provoke;
    if (!P) return 'Off';
    if (this.night < P.fromNight) return `From night ${P.fromNight}`;
    if (this.tonight.provoked) return 'Already provoked tonight';
    return null;
  }

  /** Dare a bigger wave tonight: DEFENSE.provoke.enemies × its size, +scrap now, kill bounties × bounty. */
  provoke() {
    if (this.provokeBlocked()) return false;
    this.tonight.provoked = true;
    this.add({ scrap: DEFENSE.provoke.scrap });
    return true;
  }

  /** True when tonight's stacked wave cuts reach (or would pass) the floor. */
  waveCutCapped() { return (this.tonight.enemyCount ?? 1) <= (CONFIG.waveSizeFloor ?? 0) + 1e-6; }

  /** Called when prep starts each night: one-time bonuses (free repairs, Prepared Defenses). */
  beginPrep() {
    const t = this.tonight;
    if (t.prepBonusGiven) return [];
    t.prepBonusGiven = true;
    const notes = [];
    // Relay stipend (CONFIG.relay.stipend, by night): income that follows the difficulty curve.
    const st = CONFIG.relay.stipend;
    const stipend = st ? st[Math.max(0, Math.min(st.length - 1, this.night - 1))] : 0;
    if (stipend > 0) { this.add({ scrap: stipend }); notes.push(`Relay stipend: +${stipend} Scrap`); }
    // …and from night 3 a Circuit and a Biofiber (CONFIG.relay.stipendParts).
    const sp = CONFIG.relay.stipendParts;
    const parts = sp ? sp[Math.max(0, Math.min(sp.length - 1, this.night - 1))] : 0;
    if (parts > 0) { this.add({ circuits: parts, biofiber: parts }); notes.push(`Relay stipend: +${parts} Circuit${parts > 1 ? 's' : ''} and +${parts} Biofiber`); }
    // Last night's salvage pick (a free upgrade waits for this prep).
    if (this.salvage?.freeUpgrades) {
      t.freeUpgrades += this.salvage.freeUpgrades;
      notes.push(`Salvage: ${this.salvage.freeUpgrades} free tower upgrade${this.salvage.freeUpgrades > 1 ? 's' : ''} tonight`);
    }
    this.salvage = null;
    if (this.hasSkill('prepared_defenses')) { this.add({ scrap: SKILLS.prepared_defenses.scrap }); notes.push(`Prepared Defenses: +${SKILLS.prepared_defenses.scrap} Scrap`); }
    const cells = this.relicMod('prepCircuits');   // (Old Battery)
    if (cells > 0) { this.add({ circuits: cells }); notes.push(`Old Battery: +${cells} Circuit${cells > 1 ? 's' : ''}`); }
    if (t.freeRepair > 0) {
      const before = this.relayHp;
      this.relayHp = Math.min(this.relayMax, this.relayHp + t.freeRepair);
      const healed = Math.round(this.relayHp - before);
      if (healed > 0) notes.push(`Engineer repaired the Relay (+${healed} HP)`);
      else {
        // Relay already full: the engineer's work becomes salvage instead of being lost.
        this.add({ scrap: CONFIG.relay.fullRepairScrap });
        notes.push(`Relay full: the engineer's repair became +${CONFIG.relay.fullRepairScrap} Scrap`);
      }
    }
    return notes;
  }

  emergencyPatch() {
    if (!this.hasSkill('emergency_patch') || this.tonight.emergencyPatchUsed || this.relayHp >= this.relayMax) return false;
    this.tonight.emergencyPatchUsed = true;
    this.relayHp = Math.min(this.relayMax, this.relayHp + SKILLS.emergency_patch.heal);
    return true;
  }

  // ---------------------------------------------------------------- night extras (Stage 7 night mechanics)

  /** Scrap → component trades left tonight (DEFENSE.exchange). */
  exchangeLeft() {
    if (this.night < (DEFENSE.exchange.fromNight || 1)) return 0;
    return Math.max(0, DEFENSE.exchange.max - (this.tonight.exchanged || 0));
  }

  /** Trade DEFENSE.exchange.scrap Scrap for 1 Circuit or 1 Biofiber (night prep). */
  exchange(kind) {
    const X = DEFENSE.exchange;
    if (!X.gives.includes(kind) || this.exchangeLeft() <= 0 || !this.spend({ scrap: X.scrap })) return false;
    this.tonight.exchanged = (this.tonight.exchanged || 0) + 1;
    this.add({ [kind]: 1 });
    return true;
  }

  /** Relay Protocols this run can use (src/data/protocols.js): research unlocks; debug runs get all. */
  protocolsFor(meta) {
    return PROTOCOL_ORDER.filter((k) => !PROTOCOLS[k].unlock || this.debug || meta?.unlocks?.includes(PROTOCOLS[k].unlock));
  }

  /**
   * The post-night salvage pick (SALVAGE): `lost` = Relay HP lost tonight → how many options, drawn
   * (weighted, no repeats) from a stream seeded by the run and night, so a reload offers the same ones.
   */
  salvageOptions(lost, night = this.night) {
    const tier = SALVAGE.tiers.find((t) => lost <= t.lost) || SALVAGE.tiers[SALVAGE.tiers.length - 1];
    const rng = makeRng(subSeed(this.seed, night, 'salvage'));
    const pool = { ...Object.fromEntries(Object.entries(SALVAGE.options).map(([k, o]) => [k, o.weight || 1])) };
    // A tune-up needs a tower that hasn't had one; a Relay patch needs a Relay that isn't full (critic J2 §4).
    if (!this.towers.some((t) => !t.rangeMod)) delete pool.tune;
    if (this.relayHp >= this.relayMax) delete pool.patch;
    // After a bad night, repair and parts come up more often.
    if (lost > SALVAGE.tiers[0].lost) for (const [k, m] of Object.entries(SALVAGE.badNight || {})) if (pool[k]) pool[k] *= m;
    const out = [];
    while (out.length < tier.picks && Object.keys(pool).length) {
      const k = rng.weighted(pool);
      delete pool[k];
      out.push(k);
    }
    return out;
  }

  /** Apply a salvage pick. `best`: tonight's top-damage tower record (for a tune-up). Returns a note. */
  applySalvage(key, best) {
    const o = SALVAGE.options[key];
    if (!o) return null;
    if (o.give) this.add(o.give);
    if (o.relayHp) this.relayHp = Math.min(this.relayMax, this.relayHp + o.relayHp);
    if (o.freeUpgrades) this.salvage = { freeUpgrades: (this.salvage?.freeUpgrades || 0) + o.freeUpgrades };
    if (o.rangeMod) {
      const t = this.towers.find((x) => x === best && !x.rangeMod) || this.towers.find((x) => !x.rangeMod);
      if (!t) return null;
      t.rangeMod = o.rangeMod;
      return `${TOWERS[t.type].name}: +${Math.round((o.rangeMod - 1) * 100)}% range`;
    }
    return o.line;
  }

  // ---------------------------------------------------------------- expedition results

  /**
   * What the drone recovers when you go down (or abandon the trip): a share of each carried resource
   * (byNight.deathSalvage) and, once `deathFloorAfter` s into the day, at least the night's Scrap floor — but never
   * more than you carried: Scrap = min(carried, max(floor, share × carried)). Overgrowth "No drone": nothing.
   */
  salvageFor(carried = {}, dayT = Infinity) {
    const out = {};
    if (this.hasMod('noSalvage')) return out;
    const share = Math.max(nightTune('deathSalvage', this.night) || 0, this.relicMod('droneShare'));   // (Drone Tag)
    for (const k of RESOURCE_KEYS) { const n = Math.round((carried[k] || 0) * share); if (n > 0) out[k] = n; }
    const floor = dayT >= (CONFIG.expedition.deathFloorAfter || 0) ? (nightTune('deathScrapFloor', this.night) || 0) : 0;
    const scrap = Math.min(Math.floor(carried.scrap || 0), Math.max(floor, out.scrap || 0));
    if (scrap > 0) out.scrap = scrap; else delete out.scrap;
    return out;
  }

  /** Health you wake with after a night: hp + nightlyHeal, but at least dawnHpFloor, whether you got home or went down. */
  dawnHp(hp = this.playerHp) {
    const X = CONFIG.expedition;
    let floor = X.dawnHpFloor ?? 0;
    for (const k of this.mods || []) { const f = OVERGROWTH.mods[k]?.dawnFloor; if (typeof f === 'number') floor = Math.min(floor, f); }
    return Math.max(Math.min(CONFIG.player.hp, hp + X.nightlyHeal), Math.min(CONFIG.player.hp, floor));
  }

  /**
   * Continue from an 'explore' snapshot (the game closed mid-day): the trip counts as abandoned, with the same
   * outcome as going down (nothing carried is known, so nothing is salvaged). Returns the summary record.
   */
  abandonTrip(game) {
    return this.applyExpedition({
      district: this.district, extracted: false, died: false, abandoned: true, closed: true,
      carried: emptyRes(), salvaged: null, objectiveDone: false, objective: this.objective,
      optionals: [], events: [], skillPointsEarned: 0, medsLeft: 0, playerHp: CONFIG.expedition.deathReturnHp, kills: 0,
    }, game);
  }

  /**
   * Apply an expedition's outcome. `result`:
   *   { district, extracted, died, abandoned, carried: {scrap,...}, salvaged, objectiveDone, boon,
   *     optionals: [{key, flag?, reward?}], events: [{key, flag?}], skillPointsEarned, medsLeft, playerHp, kills }
   * Carried loot is banked only if extracted (going down / abandoning: the drone's salvage, never more than was
   * carried). The goal's skill point and Research count either way, but its night reward needs you home.
   * Returns the summary record (also stored as lastExpedition).
   */
  applyExpedition(result, game) {
    const meta = game.meta;
    const R = CONFIG.research;
    const summary = { ...result, banked: emptyRes(), research: [], boons: [] };
    const district = result.district;
    if (!meta.discovered.includes(district) && !this.debug) {
      meta.discovered.push(district);
      this.award(game, R.newDistrict, 'First visit to ' + DISTRICTS[district].name, summary);
    }
    this.stats.kills += result.kills || 0;
    if (result.extracted) {
      this.stats.extractions += 1;
      this.add(result.carried);
      summary.banked = { ...result.carried };
      this.award(game, R.expedition, 'Got home safe', summary);
      this.meds = result.medsLeft;
      this.playerHp = result.playerHp;
    } else {
      this.stats.deaths += result.died ? 1 : 0;
      this.meds = 0;
      this.playerHp = CONFIG.expedition.deathReturnHp;
      // The drone recovers a share of what you carried (salvageFor; JungleScene passes it in) — capped at the carried amounts.
      if (result.salvaged) {
        const s = {};
        for (const k of RESOURCE_KEYS) s[k] = Math.max(0, Math.min(result.salvaged[k] || 0, Math.floor(result.carried?.[k] || 0)));
        this.add(s);
        summary.salvaged = s;
        summary.banked = s;
      }
    }
    this.bankRelics(result, game, summary);
    summary.dawnHp = this.dawnHp();
    // The goal: Research and its skill point count even if you went down (the work was done), but its night
    // reward (the boon) only arrives if you got home — or if the goal itself ended at home (`objectiveSecured`:
    // the drone took the engineer / the core, critic J2 C10).
    if (result.objectiveDone) {
      this.award(game, R.objective, 'Goal done', summary);
      if (result.boon && (result.extracted || result.objectiveSecured)) this.addBoon(result.boon, summary, true);
      else if (result.boon) summary.rewardLost = result.boon.text;
    }
    for (const o of result.optionals || []) {
      this.award(game, R.optional + (o.research || 0), 'Optional: ' + o.name, summary);
      if (o.flag) this.addBoon(o.flag, summary, true);
    }
    for (const e of result.events || []) {
      if (e.flag) this.addBoon(e.flag, summary, true);
    }
    // Dusk blooms picked today (Forage.js): Research like a bonus task, whether or not you got home.
    if (result.bloomResearch) this.award(game, result.bloomResearch, `Dusk bloom${result.blooms > 1 ? 's' : ''} picked`, summary);
    // Area bosses killed today (JungleScene, AreaBoss.js): Research whether or not you got home (the kill stands).
    for (const k of result.bossesKilled || []) {
      if (BOSSES[k]) this.award(game, BOSS.reward.research, `Killed the ${BOSSES[k].name}`, summary);
    }
    this.skillPoints += result.skillPointsEarned || 0;
    summary.skillPointsEarned = result.skillPointsEarned || 0;
    this.lastExpedition = summary;
    this.phase = 'summary';
    game.saveMeta();
    return summary;
  }

  addBoon(b, summary, extracted = true) {
    const t = this.tonight;
    if (b.bankScrap) {
      if (!extracted) return;
      this.add({ scrap: b.bankScrap });
      // The summary's loot rows show it next to the carried Scrap, so "+carried +bonus = now" adds up.
      if (summary) summary.bonusScrap = (summary.bonusScrap || 0) + b.bankScrap;
    }
    // bankRes (Haul the core): other resources banked with it (the boon text names them).
    if (b.bankRes) { if (!extracted) return; this.add(b.bankRes); }
    t.boons.push(b);
    summary?.boons.push(b.text);
    if (b.freeUpgrades) t.freeUpgrades += b.freeUpgrades;
    if (b.freeRepair) t.freeRepair += b.freeRepair;
    if (b.towerRate) t.towerRate *= b.towerRate;
    if (b.towerDamage) t.towerDamage *= b.towerDamage;
    if (b.enemyCount) t.enemyCount *= b.enemyCount;
    if (b.enemySpeed) t.enemySpeed *= b.enemySpeed;   // (Purge the bloom)
    if (b.laneSlow) t.laneSlow = b.laneSlow;
  }

  /**
   * Research is banked to meta immediately so it survives a quit or a loss. Overgrowth / Daily modifiers and
   * Archivist raise every gain (researchMult).
   */
  award(game, amount, reason, summary) {
    if (!amount) return;
    amount = Math.round(amount * this.researchMult(game.meta));
    if (!this.debug) game.meta.research += amount;   // debug runs show research but don't bank it
    this.stats.research += amount;
    summary?.research.push({ amount, reason });
    game.saveMeta();
  }

  /**
   * Boss damage research: up to CONFIG.research.bossMax for the fraction of the boss's HP removed.
   * The amount already given is written into the saved 'wave' snapshot at once, so quitting and
   * restarting the wave can't award it again.
   */
  awardBossDamage(game, fraction) {
    const target = Math.floor(Math.min(1, fraction) * CONFIG.research.bossMax);
    const add = target - this.bossResearchGiven;
    if (add > 0) {
      this.bossResearchGiven = target;
      this.award(game, add, 'Boss damage');
      const research = this.stats.research;
      if (!this.noSave) patchRun((r) => {
        if (r.seed !== this.seed || r.night !== this.night) return false;
        r.bossResearchGiven = target;
        if (r.stats) r.stats.research = research;
        return true;
      });
    }
  }

  // ---------------------------------------------------------------- night end

  /** After a defended night. Returns 'victory' after the last night, otherwise 'next'. */
  nightSurvived(game) {
    this.stats.nightsSurvived = this.night;
    // Update the record before award(), which is what saves meta (else the record lags a night).
    if (!this.debug) game.meta.best.nights = Math.max(game.meta.best.nights, Math.min(this.night, CONFIG.nights));
    if (!this.debug && this.isLongNight()) game.meta.longNight.best = Math.max(game.meta.longNight?.best || 0, this.night);
    this.award(game, CONFIG.research.night, `Night ${this.night} survived`);
    if (this.night >= CONFIG.nights && !this.isLongNight()) return 'victory';
    // The Long Night: holding night 6 is a win (recorded now), and the run goes on until the Relay falls.
    if (this.night === CONFIG.nights) this.recordVictory(game);
    this.night += 1;
    this.playerHp = this.dawnHp(this.playerHp);   // hp + nightlyHeal, at least dawnHpFloor (going down never beats getting home)
    this.district = null;
    this.tonight = emptyTonight();
    this.lastExpedition = null;
    this.phase = 'briefing';
    return 'next';
  }

  /**
   * A won run (night 6 held; in the Long Night the run then goes on): victory Research, lifetime / best records,
   * the next Overgrowth level, the win cosmetic. Once per run (`stats.won`). Debug runs record nothing.
   */
  recordVictory(game) {
    if (this.stats.won) return;
    this.stats.won = true;
    if (this.debug) { this.award(game, CONFIG.research.victory, 'Victory'); return; }
    const meta = game.meta;
    meta.lifetime.victories += 1;
    meta.best.victory = true;
    if (!meta.unlocks.includes('verdant_scarf')) meta.unlocks.push('verdant_scarf');
    // The ladder: a win at Overgrowth N unlocks N + 1 (the Daily's fixed modifiers don't climb it).
    if (!this.isDaily() && meta.overgrowth) {
      this.stats.ogBefore = meta.overgrowth.best || 0;
      meta.overgrowth.best = Math.max(meta.overgrowth.best || 0, this.overgrowth);
    }
    this.award(game, CONFIG.research.victory, 'Victory');   // saves meta
  }

  /** Close out the run (victory or defeat), update meta. Returns the results record. */
  finish(game, victory) {
    const meta = game.meta;
    // Debug-URL runs (`?debug=…`) don't count toward lifetime stats, records or the win cosmetic.
    if (victory) this.recordVictory(game);
    const nights = victory ? this.night : this.night - 1;
    const rec = {};
    if (!this.debug) {
      meta.lifetime.kills += this.stats.kills;
      meta.best.nights = Math.max(meta.best.nights, Math.min(nights, CONFIG.nights));
      if (this.isLongNight()) {
        rec.longBefore = this.stats.longBefore ?? (meta.longNight?.best || 0);
        meta.longNight.best = Math.max(meta.longNight?.best || 0, nights);
      }
      if (this.isDaily()) {
        const d = dailyRecord(meta, this.dailyDate);
        rec.dailyBefore = this.stats.dailyBefore ?? d.nights;
        d.nights = Math.max(d.nights, nights);
        d.victory = d.victory || !!this.stats.won;
      }
    }
    game.saveMeta();
    this.end();
    return {
      victory,
      won: !!this.stats.won,          // night 6 was held (a Long Night run is won before it ends)
      mode: this.mode,
      overgrowth: this.overgrowth,
      mods: [...(this.mods || [])],
      dailyDate: this.dailyDate,
      ogBefore: this.stats.ogBefore,  // the Overgrowth best before this win (a new level unlocked if lower)
      nights,
      night: this.night,
      kills: this.stats.kills,
      districts: this.stats.districts.map((k) => DISTRICTS[k].name),
      peak: { ...this.stats.peak },
      research: this.stats.research,
      leaks: this.lastNight?.leaks || null,   // the night board's leak tally for the night that ended the run
      ...rec,
      debug: !!this.debug,   // debug-URL runs show research but don't bank it
    };
  }
}

/**
 * Apply one `tower` modifier block (SKILLS[*].tower, TOWER_MODS[*].tower) to a tower's stats `s`. `acc` collects the
 * range / rate / damage multipliers (towerStats applies them once at the end). Filters: kinds, types,
 * when.relayBelow. Then mult {field: ×} (fields the tower has), add {field: +}, min {field: at least}, and the
 * flags slowedBonus (× damage vs slowed enemies) and seesBurrowed (bullets reach burrowed enemies).
 */
export function applyTowerMod(s, type, m, acc, relayFrac = 1) {
  if (!m) return;
  if (m.kinds && !m.kinds.includes(s.kind)) return;
  if (m.types && !m.types.includes(type)) return;
  if (m.when?.relayBelow != null && !(relayFrac < m.when.relayBelow)) return;
  acc.range *= m.range ?? 1;
  acc.rate *= m.rate ?? 1;
  acc.dmg *= m.damage ?? 1;
  for (const [f, v] of Object.entries(m.mult || {})) if (typeof s[f] === 'number') s[f] *= v;
  for (const [f, v] of Object.entries(m.add || {})) s[f] = (s[f] || 0) + v;
  for (const [f, v] of Object.entries(m.min || {})) s[f] = Math.max(s[f] || 0, v);
  if (m.slowedBonus) s.slowedBonus = (s.slowedBonus || 1) * m.slowedBonus;
  if (m.seesBurrowed) s.seesBurrowed = true;
}

/** Today's local date as 'YYYY-MM-DD' (the Daily run's key). */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The Daily run's seed for a date (the same for everyone that day). */
export function dailySeed(date) {
  return subSeed(0x5eed, 'daily', date) & 0x7fffffff;
}

/** The Daily run's fixed modifiers for a date (DAILY.mods of OVERGROWTH.mods, drawn by the date). */
export function dailyMods(date) {
  return makeRng(subSeed(0xda11, 'daily-mods', date)).shuffle(OVERGROWTH.order).slice(0, DAILY.mods);
}

/** meta.daily's entry for a date (created if missing; old days beyond DAILY.keepDays are dropped). */
export function dailyRecord(meta, date) {
  if (!meta.daily || typeof meta.daily !== 'object') meta.daily = {};
  if (!meta.daily[date]) meta.daily[date] = { nights: 0, victory: false, runs: 0 };
  const days = Object.keys(meta.daily).sort();
  while (days.length > DAILY.keepDays) delete meta.daily[days.shift()];
  return meta.daily[date] || { nights: 0, victory: false, runs: 0 };
}

/** Uint8Array of 0/1 → base64 bitset. */
export function packBits(arr) {
  const bytes = new Uint8Array(Math.ceil(arr.length / 8));
  for (let i = 0; i < arr.length; i++) if (arr[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  return btoa(s);
}

/** base64 bitset → Uint8Array(n) of 0/1 (empty or invalid input → all zero). */
export function unpackBits(b64, n) {
  const out = new Uint8Array(n);
  if (!b64) return out;
  try {
    const s = atob(b64);
    for (let i = 0; i < n && (i >> 3) < s.length; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch { /* corrupt → fresh */ }
  return out;
}
