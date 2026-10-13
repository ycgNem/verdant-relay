// localStorage persistence. Two records:
//   meta  permanent: research, unlocks, best run, lifetime stats, settings
//   run   the current run snapshot (saved at safe points: briefing, preparation and wave start)
// Every record carries a version; anything invalid or from another version is discarded
// rather than half-loaded.

import { CONFIG, RESOURCE_KEYS } from '../data/config.js';
import { TOWERS, TARGET_RULES } from '../data/towers.js';
import { SKILLS } from '../data/skills.js';
import { DISTRICTS } from '../data/districts.js';
import { DEFENSE_MAP } from '../data/defenseMap.js';

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
    settings: { shake: true, volume: 0.6, music: 0.5, resolution: 'chunky', hints: true },
    hints: {},                      // tutorial hint ids already shown
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
  return { ...def, ...m, best: { ...def.best, ...m.best }, lifetime: { ...def.lifetime, ...m.lifetime }, settings: { ...def.settings, ...m.settings }, hints: { ...(m.hints || {}) } };
}

export function saveMeta(meta) {
  write(META_KEY, meta);
}

// Phases a run snapshot can be saved in (see Run.save).
export const RUN_PHASES = ['briefing', 'prep', 'wave'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** One placed tower record: known type, level 1..max, a real pad, a known targeting rule. */
function validTower(t) {
  const def = t && TOWERS[t.type];
  return !!def
    && Number.isInteger(t.level) && t.level >= 1 && t.level <= def.upgrades.length + 1
    && Number.isInteger(t.pad) && t.pad >= 0 && t.pad < DEFENSE_MAP.pads.length
    && (TARGET_RULES.includes(t.target) || def.target === 'none')
    && !!t.spent && typeof t.spent === 'object';
}

/** Full shape check of a run snapshot. Anything off means the whole save is discarded. */
export function validRun(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.version !== CONFIG.saveVersion || !isNum(r.seed)) return false;
  if (!Number.isInteger(r.night) || r.night < 1 || r.night > CONFIG.nights) return false;
  if (!RUN_PHASES.includes(r.phase)) return false;
  if (!r.res || !RESOURCE_KEYS.every((k) => isNum(r.res[k]) && r.res[k] >= 0)) return false;
  if (!isNum(r.relayHp) || r.relayHp <= 0) return false;
  if (!Array.isArray(r.skills) || !r.skills.every((k) => typeof k === 'string' && SKILLS[k])) return false;
  if (r.skillPoints != null && (!Number.isInteger(r.skillPoints) || r.skillPoints < 0)) return false;
  if (!Array.isArray(r.towers) || !r.towers.every(validTower)) return false;
  if (new Set(r.towers.map((t) => t.pad)).size !== r.towers.length) return false;   // one tower per pad
  if (r.district != null && !DISTRICTS[r.district]) return false;
  if (r.tonight != null && typeof r.tonight !== 'object') return false;
  if (r.stats != null && typeof r.stats !== 'object') return false;
  if ((r.phase === 'prep' || r.phase === 'wave') && !r.district) return false;
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
