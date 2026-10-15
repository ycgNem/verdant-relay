// localStorage persistence. Two records:
//   meta  permanent: research, unlocks, best run, lifetime stats, settings, Overgrowth / Long Night / Daily records
//   run   the current run snapshot (saved at safe points: briefing, trip start, summary, preparation and wave start)
// Every record carries a version; anything invalid or from another version is discarded
// rather than half-loaded.

import { CONFIG, RESOURCE_KEYS } from '../data/config.js';
import { TOWERS, TARGET_RULES } from '../data/towers.js';
import { SKILLS, SKILL_RENAMED } from '../data/skills.js';
import { RECIPES, TOWER_MODS } from '../data/crafting.js';
import { DISTRICTS } from '../data/districts.js';
import { WEATHER } from '../data/weather.js';
import { DEFENSE_MAPS, mapFor, padCount } from '../data/defenseMap.js';
import { MODES, OVERGROWTH, LONG_NIGHT } from '../data/modes.js';
import { RESEARCH_TREE } from '../data/unlocks.js';
import { KEY_ACTIONS, RESERVED_KEYS } from '../data/controls.js';
import { RELICS } from '../data/relics.js';
import { LORE_BY_ID } from '../data/lore.js';

const META_KEY = 'verdant-relay/meta';
const RUN_KEY = 'verdant-relay/run';

export function defaultMeta() {
  return {
    version: CONFIG.saveVersion,
    research: 0,
    unlocks: [],
    startWeapon: 'carbine',
    discovered: [],                 // district keys seen at least once (first-time bonus)
    best: { nights: 0, victory: false },
    lifetime: { runs: 0, victories: 0, kills: 0 },
    // volume = sound effects; master / ambience / muted added with the audio pass (old saves get these defaults)
    settings: { shake: true, volume: 0.6, music: 0.5, hints: true, master: 0.8, ambience: 0.6, muted: false, keys: {} },
    // keys: jungle key bindings { action: KeyboardEvent.code } (src/data/controls.js; missing = default)
    hints: {},                      // tutorial hint ids already shown
    // Run systems (Stage 7; old saves get these defaults, see loadMeta):
    startKit: null,                 // the starting kit chosen in the Collection (a research node key with `kit`), or none
    overgrowth: { best: 0, level: 0 },   // best = highest Overgrowth level won (src/data/modes.js); level = the one picked on the title
    longNight: { best: 0 },         // the Long Night's best night survived
    daily: {},                      // 'YYYY-MM-DD' → { nights, victory, runs } (local bests, the last DAILY.keepDays days)
    // The Codex (Stage 7 relics & lore; old saves get these defaults): relic ids seen (picked up or offered at a
    // shrine) and data-log ids read (src/data/relics.js, src/data/lore.js).
    relicsSeen: [],
    lore: [],
  };
}

/** Codex lists: known ids only, each once (unknown ids from a later build are dropped, not the save). */
function metaCodex(m) {
  const ids = (v, known) => (Array.isArray(v) ? [...new Set(v.filter((k) => typeof k === 'string' && known[k]))] : []);
  return { relicsSeen: ids(m.relicsSeen, RELICS), lore: ids(m.lore, LORE_BY_ID) };
}

const intIn = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);

/** The Stage 7 run-system meta fields, each checked on its own (a bad one falls back to its default). */
function metaModes(m) {
  const og = m.overgrowth && typeof m.overgrowth === 'object' ? m.overgrowth : {};
  const best = intIn(og.best, 0, OVERGROWTH.max, 0);
  const daily = {};
  if (m.daily && typeof m.daily === 'object') {
    for (const [d, v] of Object.entries(m.daily)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === 'object') {
        daily[d] = { nights: intIn(v.nights, 0, LONG_NIGHT.maxNight, 0), victory: !!v.victory, runs: intIn(v.runs, 0, 1e6, 0) };
      }
    }
  }
  return {
    startKit: typeof m.startKit === 'string' && RESEARCH_TREE[m.startKit]?.kit ? m.startKit : null,
    overgrowth: { best, level: intIn(og.level, 0, Math.min(OVERGROWTH.max, best + 1), 0) },
    longNight: { best: intIn(m.longNight?.best, 0, LONG_NIGHT.maxNight, 0) },
    daily,
  };
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadMeta() {
  const m = read(META_KEY);
  const def = defaultMeta();
  if (!m || m.version !== CONFIG.saveVersion || typeof m.research !== 'number' || !Array.isArray(m.unlocks)) {
    if (m) console.warn('Verdant Relay: progress save invalid, starting fresh.');
    return def;
  }
  // Fill any fields added since the save was written.
  return { ...def, ...m, best: { ...def.best, ...m.best }, lifetime: { ...def.lifetime, ...m.lifetime }, settings: { ...def.settings, ...m.settings, keys: validKeys(m.settings?.keys) }, hints: { ...(m.hints || {}) }, ...metaModes(m), ...metaCodex(m) };
}

/** Stored key bindings: known actions with a non-reserved code, each code used once (anything else = default). */
function validKeys(k) {
  const out = {};
  if (!k || typeof k !== 'object') return out;
  const used = new Set();
  for (const a of KEY_ACTIONS) {
    const c = k[a.id];
    if (typeof c !== 'string' || !/^[A-Za-z0-9]{2,24}$/.test(c) || RESERVED_KEYS.has(c) || used.has(c)) continue;
    used.add(c);
    out[a.id] = c;
  }
  return out;
}

export function saveMeta(meta) {
  write(META_KEY, meta);
}

// Phases a run snapshot can be saved in (see Run.save). 'explore' = written as a trip starts: a Continue from it
// means the game closed mid-day, and the trip counts as abandoned (Run.abandonTrip). 'summary' = back from a trip.
export const RUN_PHASES = ['briefing', 'explore', 'summary', 'prep', 'wave'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * One placed tower record: known type, level 1..max, a tile of the map's field (`x`, `y`; Stage 9 build anywhere)
 * or, in a save from before, a real old build pad (`pad`: Run.fromSave moves it to that pad's tile), a known
 * targeting rule. Optional (Stage 7): `branch` 'a' | 'b' (the level-3 choice; missing = 'a'), `rangeMod` (salvage
 * tune-up, 1–1.5).
 */
function validTower(t, map = mapFor('twin')) {
  const def = t && TOWERS[t.type];
  const tile = t && Number.isInteger(t.x) && Number.isInteger(t.y) && t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height;
  const pad = t && !tile && Number.isInteger(t.pad) && t.pad >= 0 && t.pad < padCount(map);
  return !!def
    && Number.isInteger(t.level) && t.level >= 1 && t.level <= def.upgrades.length + 1
    && (tile || pad)
    && (TARGET_RULES.includes(t.target) || def.target === 'none')
    && !!t.spent && typeof t.spent === 'object'
    && (t.branch == null || t.branch === 'a' || t.branch === 'b')
    && (t.rangeMod == null || (isNum(t.rangeMod) && t.rangeMod >= 1 && t.rangeMod <= 1.5))
    && (t.mod == null || !!TOWER_MODS[t.mod]);   // a fitted Workbench mod (src/data/crafting.js)
}

/**
 * Camp crafting fields (Stage 7; missing in older saves = nothing crafted): `items` { modKey: count ≥ 0 },
 * `blade` [machete recipe keys, each once], `crafted` { recipeKey: count ≥ 0 }.
 */
function validCrafting(r) {
  const counts = (o, known) => o == null || (typeof o === 'object' && !Array.isArray(o)
    && Object.entries(o).every(([k, n]) => known[k] && Number.isInteger(n) && n >= 0 && n < 1000));
  if (!counts(r.items, TOWER_MODS) || !counts(r.crafted, RECIPES)) return false;
  if (r.blade != null && (!Array.isArray(r.blade) || !r.blade.every((k) => RECIPES[k]?.blade) || new Set(r.blade).size !== r.blade.length)) return false;
  return true;
}

/** Full shape check of a run snapshot. Anything off means the whole save is discarded. */
export function validRun(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.version !== CONFIG.saveVersion || !isNum(r.seed)) return false;
  // Run systems (Stage 7; missing in older saves = a normal run): mode, Overgrowth level, active modifiers.
  if (r.mode != null && !MODES.includes(r.mode)) return false;
  if (r.overgrowth != null && (!Number.isInteger(r.overgrowth) || r.overgrowth < 0 || r.overgrowth > OVERGROWTH.max)) return false;
  if (r.mods != null && (!Array.isArray(r.mods) || !r.mods.every((k) => OVERGROWTH.mods[k]))) return false;
  if (r.offers != null && !Array.isArray(r.offers)) return false;
  if (r.goals != null && !Array.isArray(r.goals)) return false;
  if (r.areaCount != null && (!Number.isInteger(r.areaCount) || r.areaCount < 1 || r.areaCount > 5)) return false;
  const lastNight = r.mode === 'long' ? LONG_NIGHT.maxNight : CONFIG.nights;
  if (!Number.isInteger(r.night) || r.night < 1 || r.night > lastNight) return false;
  if (!RUN_PHASES.includes(r.phase)) return false;
  if (!r.res || !RESOURCE_KEYS.every((k) => isNum(r.res[k]) && r.res[k] >= 0)) return false;
  if (!isNum(r.relayHp) || r.relayHp <= 0) return false;
  // Skills: current ids, or ids removed by the Stage 7 rework (SKILL_RENAMED) — Run.fromSave maps those to their
  // replacement or refunds the point, so an old save still Continues.
  if (!Array.isArray(r.skills) || !r.skills.every((k) => typeof k === 'string' && (SKILLS[k] || Object.prototype.hasOwnProperty.call(SKILL_RENAMED, k)))) return false;
  if (r.skillPoints != null && (!Number.isInteger(r.skillPoints) || r.skillPoints < 0)) return false;
  if (!validCrafting(r)) return false;
  // The night map (Stage 7 map variants; missing in older saves = 'twin'): tower tiles (or, in an older save, pads)
  // are checked against it. One tower per tile (per pad).
  if (r.mapKey != null && !DEFENSE_MAPS[r.mapKey]) return false;
  const map = mapFor(r.mapKey);
  if (!Array.isArray(r.towers) || !r.towers.every((t) => validTower(t, map))) return false;
  const spot = (t) => (Number.isInteger(t.x) ? `${t.x},${t.y}` : `pad${t.pad}`);
  if (new Set(r.towers.map(spot)).size !== r.towers.length) return false;
  if (r.district != null && !DISTRICTS[r.district]) return false;
  if (r.tonight != null && typeof r.tonight !== 'object') return false;
  if (r.stats != null && typeof r.stats !== 'object') return false;
  if (r.phase !== 'briefing' && !r.district) return false;
  // Stage 7 night mechanics (missing in older saves = defaults): the push a lull snapshot resumes at, and a
  // salvage pick waiting for the next prep.
  if (r.wavePush != null && (!Number.isInteger(r.wavePush) || r.wavePush < 0 || r.wavePush > 8)) return false;
  if (r.salvage != null && (typeof r.salvage !== 'object' || (r.salvage.freeUpgrades != null && !Number.isInteger(r.salvage.freeUpgrades)))) return false;
  // Relics brought home (Stage 7; missing in older saves = none): known ids, each once. The jungle's relic / lore /
  // visited lists (run.world) are id lists of strings.
  if (r.relics != null && (!Array.isArray(r.relics) || !r.relics.every((k) => RELICS[k]) || new Set(r.relics).size !== r.relics.length)) return false;
  for (const f of ['relics', 'lore', 'visited']) {
    const v = r.world?.[f];
    if (v != null && (!Array.isArray(v) || !v.every((k) => typeof k === 'string'))) return false;
  }
  // Area bosses killed (Stage 7; missing = none): area keys, each once. A forced weather (debug) is a known kind or 'none'.
  if (r.bosses != null && (!Array.isArray(r.bosses) || !r.bosses.every((k) => DISTRICTS[k]) || new Set(r.bosses).size !== r.bosses.length)) return false;
  if (r.weatherKey != null && r.weatherKey !== 'none' && !WEATHER.kinds[r.weatherKey]) return false;
  return true;
}

export function loadRun() {
  const r = read(RUN_KEY);
  if (!r) return null;
  const ok = validRun(r);
  if (!ok) {
    console.warn('Verdant Relay: run save invalid, discarded.');
    clearRun();
    return null;
  }
  return r;
}

export function saveRun(run) {
  write(RUN_KEY, run);
}

/**
 * Edit the saved run snapshot in place (e.g. research already awarded mid-wave). `fn(save)` returns
 * false to leave it untouched. No-op when there is no valid save.
 */
export function patchRun(fn) {
  const r = read(RUN_KEY);
  if (!r || !validRun(r)) return;
  if (fn(r) !== false) write(RUN_KEY, r);
}

export function clearRun() {
  try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ }
}

export function resetAll() {
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(RUN_KEY);
  } catch { /* ignore */ }
}
