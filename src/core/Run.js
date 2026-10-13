// Run state: the single source of truth for everything that lasts for one run. Scenes read and
// write it; they never keep their own resource totals.
//
// Night flow:  briefing → explore → summary → prep → defense → (next night's briefing | results)
// `run.phase` records where the run is; Continue resumes from 'briefing', 'prep' or 'wave' snapshots.
// A 'wave' snapshot is written when a wave starts (towers locked, Relay HP as it began); Continue
// from it restarts that wave with the same build, so quitting mid-wave can't undo a loss or re-shop.
//
// "Tonight" (`run.tonight`) collects every modifier for the coming defense: the chosen district's
// threat, objective boons and optional/event flags. It is rebuilt each night.

import { CONFIG, RESOURCE_KEYS, RESOURCES } from '../data/config.js';
import { DISTRICTS, DISTRICT_KEYS } from '../data/districts.js';
import { PRIMARY_KEYS } from '../data/objectives.js';
import { GUIDE } from '../data/guide.js';
import { SKILLS, SKILL_KEYS } from '../data/skills.js';
import { TOWERS, TOWER_ORDER } from '../data/towers.js';
import { makeRng, newSeed, subSeed } from './rng.js';
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
    this.towers = [];            // [{ pad, type, level, target, spent: {scrap,...} }]
    this.skills = [];
    this.skillPoints = 0;
    this.district = null;        // district chosen for today
    // The persistent jungle (src/world/JungleGen.js is regenerated from `seed`; only what the player
    // changed is stored): cut = undergrowth cleared (bitset, base64), opened = container ids,
    // pylons = activated relay pylons, explored = map discovery (bitset), used = sites whose objective
    // props are spent, day = the night the regrowth was last applied for.
    this.world = { cut: '', opened: [], pylons: [], explored: '', used: [], day: 0 };
    this.tonight = emptyTonight();
    this.lastExpedition = null;  // result object for the summary screen
    this.stats = {
      kills: 0, districts: [], peak: { ...CONFIG.startResources }, research: 0,
      bossDamage: 0, nightsSurvived: 0, deaths: 0, extractions: 0,
    };
    this.bossResearchGiven = 0;
    this.guided = false;         // the player's first run: night 1 offers one area and the day is coached (src/data/guide.js)
    this.debug = false;          // started from a ?debug= URL (kept out of lifetime stats)
    this.noSave = false;         // debug runs don't write the run save (see Run.save)
  }

  /** Start a new run, applying permanent unlocks from meta. */
  static create(meta) {
    const r = new Run();
    if (meta.unlocks.includes('stockpile')) r.res.scrap += 20;
    if (meta.unlocks.includes('field_kit')) r.meds = 1;
    if (meta.unlocks.includes('scattergun') && meta.startWeapon === 'scattergun') r.weapon = 'parang';
    r.stats.peak = { ...r.res };   // after unlock bonuses (Hidden Stockpile)
    // Lifetime run count is bumped by startNewRun (TitleScene), so debug runs don't inflate it.
    return r;
  }

  static fromSave(obj) {
    const r = new Run();
    Object.assign(r, obj);
    r.tonight = { ...emptyTonight(), ...obj.tonight };
    r.stats = { ...new Run().stats, ...obj.stats };
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
    };
  }

  /** Store the working jungle state back (called when an expedition ends). */
  storeWorld(st) {
    this.world = {
      cut: packBits(st.cut), opened: [...st.opened], pylons: [...st.pylons],
      explored: packBits(st.explored), used: [...st.used], day: st.day,
    };
  }

  toSave() {
    return JSON.parse(JSON.stringify(this));
  }

  /** Snapshot at a safe point ('briefing', 'prep' or 'wave'). */
  save(phase) {
    this.phase = phase;
    if (this.noSave) return;   // debug-URL runs never touch the real run save (unless &save=1)
    saveRun(this.toSave());
  }

  end() { if (!this.noSave) clearRun(); }

  rng(...parts) { return makeRng(subSeed(this.seed, this.night, ...parts)); }

  // ---------------------------------------------------------------- districts

  /** Today's two district options, seeded so a reload offers the same pair. */
  districtChoices() {
    // The guided first night: one easy area, no choice yet (GUIDE.district).
    if (this.isGuidedDay()) return [GUIDE.district];
    const rng = this.rng('districts');
    const pool = DISTRICT_KEYS.filter((k) => (DISTRICTS[k].minNight || 1) <= this.night);
    return rng.shuffle(pool).slice(0, 2);
  }

  /** The primary objective for a district today (seeded). */
  objectiveFor(districtKey) {
    if (this.isGuidedDay() && districtKey === GUIDE.district) return GUIDE.objective;
    // The two districts on offer always get different objectives (a seeded shuffle dealt in order).
    const i = this.districtChoices().indexOf(districtKey);
    if (i < 0) return this.rng('objective', districtKey).pick(PRIMARY_KEYS);
    return this.rng('objectives').shuffle(PRIMARY_KEYS)[i];
  }

  /** Night 1 of the player's first run: one area, an easy objective, a coached day. */
  isGuidedDay() { return !!this.guided && this.night === 1; }

  /** What tonight's wave looks like if this district is chosen. */
  threatFor(districtKey) { return DISTRICTS[districtKey].nightThreat; }

  chooseDistrict(key) {
    this.district = key;
    this.tonight = emptyTonight();
    this.tonight.threat = DISTRICTS[key].nightThreat;
    const t = this.tonight.threat;
    if (t.extraGroup) this.tonight.extraGroups.push(t.extraGroup);
    if (t.enemySpeed) this.tonight.enemySpeed *= t.enemySpeed;
    if (!this.stats.districts.includes(key)) this.stats.districts.push(key);
    this.phase = 'explore';
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

  hasSkill(id) { return this.skills.includes(id); }

  /** Skill options for one pick: up to n random unowned skills whose prerequisites are met. */
  skillOptions(meta, salt = 0) {
    const n = meta.unlocks.includes('wide_choice') ? 4 : 3;
    // Skip skills whose effect needs a locked tower (needsUnlock: a meta unlock key).
    const pool = SKILL_KEYS.filter((k) => !this.hasSkill(k) && (!SKILLS[k].req || this.hasSkill(SKILLS[k].req))
      && (!SKILLS[k].needsUnlock || meta.unlocks.includes(SKILLS[k].needsUnlock)));
    const shuffled = this.rng('skills', this.skills.length, salt).shuffle(pool);
    // Spread the picks: the first skill of each branch (in shuffled order) goes in before any branch
    // gets a second slot, so a pick spans as many branches as the pool allows.
    const seen = new Set(), picks = [];
    for (const k of shuffled) {
      if (picks.length >= n) break;
      if (!seen.has(SKILLS[k].branch)) { seen.add(SKILLS[k].branch); picks.push(k); }
    }
    for (const k of shuffled) {
      if (picks.length >= n) break;
      if (!picks.includes(k)) picks.push(k);
    }
    return picks;
  }

  takeSkill(id) {
    if (this.skillPoints <= 0 || this.hasSkill(id)) return false;
    this.skillPoints -= 1;
    this.skills.push(id);
    if (id === 'reinforced_core') this.relayHp += 25;
    return true;
  }

  get relayMax() { return CONFIG.relay.hp + (this.hasSkill('reinforced_core') ? 25 : 0); }

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
    if (this.hasSkill('efficient_assembly')) c.scrap = Math.round(c.scrap * 0.9);
    return c;
  }

  /** Cost of the next upgrade for a placed tower, or null at max level. Free upgrades → {}. */
  upgradeCost(tower) {
    const up = TOWERS[tower.type].upgrades[tower.level - 1];
    if (!up) return null;
    if (this.tonight.freeUpgrades > 0) return {};
    const c = { ...up.cost };
    if (this.hasSkill('field_tuning') && !this.tonight.fieldTuningUsed) c.scrap = Math.floor(c.scrap * SKILLS.field_tuning.scrapMult);
    return c;
  }

  sellValue(tower) {
    return Math.floor((tower.spent.scrap || 0) * CONFIG.sellRefund);
  }

  /** Place a tower on a pad. Returns the tower record or null. */
  build(type, pad) {
    if (this.towers.some((t) => t.pad === pad)) return null;
    const cost = this.buildCost(type);
    if (!this.spend(cost)) return null;
    const tower = { pad, type, level: 1, target: TOWERS[type].target, spent: { ...cost } };
    if (this.hasSkill('circuit_recovery') && (cost.circuits || 0) > 0 && Math.random() < 0.25) {
      this.res.circuits += 1;
      tower.refunded = true;
    }
    this.towers.push(tower);
    return tower;
  }

  upgrade(tower) {
    const cost = this.upgradeCost(tower);
    if (!cost || !this.spend(cost)) return false;
    if (this.tonight.freeUpgrades > 0 && Object.keys(cost).length === 0) this.tonight.freeUpgrades -= 1;
    else if (this.hasSkill('field_tuning')) this.tonight.fieldTuningUsed = true;
    for (const k of RESOURCE_KEYS) tower.spent[k] = (tower.spent[k] || 0) + (cost[k] || 0);
    tower.level += 1;
    return true;
  }

  sell(tower) {
    const i = this.towers.indexOf(tower);
    if (i < 0) return 0;
    const v = this.sellValue(tower);
    this.towers.splice(i, 1);
    this.res.scrap += v;
    return v;
  }

  /** Effective stats for a placed tower: data + upgrades + skills + tonight's modifiers. */
  towerStats(tower, relayFrac = 1) {
    const def = TOWERS[tower.type];
    const s = { ...def };
    delete s.upgrades;
    for (let i = 0; i < tower.level - 1; i++) Object.assign(s, def.upgrades[i].set);
    let range = 1, rate = this.tonight.towerRate, dmg = this.tonight.towerDamage;
    if (this.hasSkill('long_sightlines')) range *= 1.1;
    if (this.hasSkill('living_barricade') && tower.type === 'snare_vine') range *= 1.2;
    if (this.hasSkill('overclock')) rate *= 1.08;
    if (this.hasSkill('last_stand') && relayFrac < 0.3) dmg *= 1.2;
    s.range *= range;
    if (s.cooldown) s.cooldown /= rate;
    s.damage *= dmg;
    if (s.kind === 'support' && this.hasSkill('watchtower_network')) {
      s.buffRate *= 1.5;
      if (s.bonusAttackChance) s.bonusAttackChance *= 1.5;
    }
    return s;
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

  /** Wave-size multiplier actually used tonight: every cut stacks, floored at CONFIG.waveSizeFloor. */
  waveCountMult() { return Math.max(CONFIG.waveSizeFloor ?? 0, this.tonight.enemyCount ?? 1); }

  /** True when tonight's stacked wave cuts reach (or would pass) the floor. */
  waveCutCapped() { return (this.tonight.enemyCount ?? 1) <= (CONFIG.waveSizeFloor ?? 0) + 1e-6; }

  /** Called when prep starts each night: one-time bonuses (free repairs, Prepared Defenses). */
  beginPrep() {
    const t = this.tonight;
    if (t.prepBonusGiven) return [];
    t.prepBonusGiven = true;
    const notes = [];
    if (this.hasSkill('prepared_defenses')) { this.add({ scrap: SKILLS.prepared_defenses.scrap }); notes.push(`Prepared Defenses: +${SKILLS.prepared_defenses.scrap} Scrap`); }
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
    this.relayHp = Math.min(this.relayMax, this.relayHp + 15);
    return true;
  }

  // ---------------------------------------------------------------- expedition results

  /**
   * Apply an expedition's outcome. `result`:
   *   { district, extracted, died, carried: {scrap,...}, objectiveDone, boon, optionals: [{key, flag?, reward?}],
   *     events: [{key, flag?}], skillPointsEarned, medsLeft, playerHp, kills }
   * Carried loot is banked only if extracted. Returns the summary record (also stored as lastExpedition).
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
      // Early nights: the drone recovers a share of what you carried (JungleScene computes it).
      if (result.salvaged) {
        this.add(result.salvaged);
        summary.banked = { ...emptyRes(), ...result.salvaged };
      }
    }
    // Objectives and flags count even on death (the work was done), but the scrap bonus needs extraction.
    if (result.objectiveDone) {
      this.award(game, R.objective, 'Goal done', summary);
      if (result.boon) this.addBoon(result.boon, summary, result.extracted);
    }
    for (const o of result.optionals || []) {
      this.award(game, R.optional + (o.research || 0), 'Optional: ' + o.name, summary);
      if (o.flag) this.addBoon(o.flag, summary, true);
    }
    for (const e of result.events || []) {
      if (e.flag) this.addBoon(e.flag, summary, true);
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
    t.boons.push(b);
    summary?.boons.push(b.text);
    if (b.freeUpgrades) t.freeUpgrades += b.freeUpgrades;
    if (b.freeRepair) t.freeRepair += b.freeRepair;
    if (b.towerRate) t.towerRate *= b.towerRate;
    if (b.towerDamage) t.towerDamage *= b.towerDamage;
    if (b.enemyCount) t.enemyCount *= b.enemyCount;
    if (b.laneSlow) t.laneSlow = b.laneSlow;
  }

  /** Research is banked to meta immediately so it survives a quit or a loss. */
  award(game, amount, reason, summary) {
    if (!amount) return;
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
    if (!this.debug) game.meta.best.nights = Math.max(game.meta.best.nights, this.night);
    this.award(game, CONFIG.research.night, `Night ${this.night} survived`);
    if (this.night >= CONFIG.nights) return 'victory';
    this.night += 1;
    this.playerHp = Math.min(CONFIG.player.hp, this.playerHp + CONFIG.expedition.nightlyHeal);
    this.district = null;
    this.tonight = emptyTonight();
    this.lastExpedition = null;
    this.phase = 'briefing';
    return 'next';
  }

  /** Close out the run (victory or defeat), update meta. Returns the results record. */
  finish(game, victory) {
    const meta = game.meta;
    // Debug-URL runs (`?debug=…`) don't count toward lifetime stats, records or the win cosmetic.
    if (victory && !this.debug) {
      this.award(game, CONFIG.research.victory, 'Victory');
      meta.lifetime.victories += 1;
      meta.best.victory = true;
      if (!meta.unlocks.includes('verdant_scarf')) meta.unlocks.push('verdant_scarf');
    }
    if (!this.debug) {
      meta.lifetime.kills += this.stats.kills;
      meta.best.nights = Math.max(meta.best.nights, victory ? this.night : this.night - 1);
    }
    game.saveMeta();
    this.end();
    return {
      victory,
      nights: victory ? this.night : this.night - 1,
      night: this.night,
      kills: this.stats.kills,
      districts: this.stats.districts.map((k) => DISTRICTS[k].name),
      peak: { ...this.stats.peak },
      research: this.stats.research,
      debug: !!this.debug,   // debug-URL runs show research but don't bank it
    };
  }
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
