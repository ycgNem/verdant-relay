// localStorage persistence. Two records:
//   meta  permanent: research, unlocks, best run, lifetime stats, settings
//   run   the current run snapshot (saved at safe points: briefing and preparation)
// Every record carries a version; anything invalid or from another version is discarded
// rather than half-loaded.

import { CONFIG } from '../data/config.js';

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

export function loadRun() {
  const r = read(RUN_KEY);
  if (!r) return null;
  const ok = r.version === CONFIG.saveVersion
    && typeof r.seed === 'number'
    && Number.isInteger(r.night) && r.night >= 1 && r.night <= CONFIG.nights
    && r.res && typeof r.res.scrap === 'number'
    && Array.isArray(r.towers)
    && (r.phase === 'briefing' || r.phase === 'prep');
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

export function clearRun() {
  try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ }
}

export function resetAll() {
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(RUN_KEY);
  } catch { /* ignore */ }
}
