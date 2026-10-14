// Camp crafting (Stage 7, critic J §8 / M9): the Workbench step between the trip summary and night prep turns
// spare Circuits, Biofiber and Intel (and some Scrap) into gear — a sink you choose for the three currencies that
// used to only gate tower types.
//
// Run state (src/core/Run.js, validated in Save.js):
//   run.items    { modKey: count } tower mods crafted but not fitted yet
//   run.blade    [recipeKey] machete upgrades owned this run (each once)
//   run.crafted  { recipeKey: count } everything crafted this run (`once` recipes check it)
//   tower.mod    the mod fitted in a tower's one socket (night prep's tower panel: fit / take out, free)
// Selling a tower returns its mod to run.items.
//
// RECIPES fields: group ('gear' | 'mod' | 'blade' | 'relay'), name, icon (glyph), num (short "icon + number" line),
// line (one plain sentence), cost, and what it makes: gives.meds · mod (a TOWER_MODS key) · blade (machete
// modifiers, see BLADE_STACK) · relayMax (+max Relay health, also repairs that much) · once (one per run).

export const WORKBENCH = {
  // The first time the Workbench opens in a run it says this under the title (plain words, one line).
  intro: 'Turn spare parts into gear. Tower mods are fitted in night prep. Skip it to keep everything for towers.',
  // A craft that costs Scrap warns when it would leave less than the cheapest tower you can build.
  warnScrap: true,
};

// How the Workbench lays the recipes out: one block per entry (recipes whose group is in `groups`), in this order.
export const RECIPE_GROUPS = [
  { title: 'Tower mods', note: 'One socket per tower: fit them in night prep (click a tower).', groups: ['mod'] },
  { title: 'Machete', note: 'Upgrades for the rest of the run.', groups: ['blade'] },
  { title: 'Supplies', note: null, groups: ['gear', 'relay'] },
];

import { WEAPONS } from './config.js';

export const RECIPES = {
  focusing_lens: { group: 'mod', mod: 'focusing_lens', cost: { circuits: 2 } },
  thorn_coating: { group: 'mod', mod: 'thorn_coating', cost: { biofiber: 2 } },
  uplink: { group: 'mod', mod: 'uplink', cost: { intel: 2 } },
  overcharger: { group: 'mod', mod: 'overcharger', cost: { circuits: 1, intel: 1 } },
  serrated_edge: {
    group: 'blade', name: 'Serrated Edge', icon: '✂', num: 'bleed 3 a second for 3 s',
    line: 'Machete hits make creatures bleed: 3 damage a second for 3 s (area bosses: half).',
    cost: { scrap: 20, biofiber: 3 }, blade: { bleedDps: 3, bleedTime: 3 },
  },
  balanced_grip: {
    group: 'blade', name: 'Balanced Grip', icon: '⟳', num: '+10% slash speed',
    line: 'Your slashes (and hacking through plants) come 10% faster.',
    cost: { scrap: 15, circuits: 2 }, blade: { comboTime: 0.9 },
  },
  heavy_spine: {
    group: 'blade', name: 'Heavy Spine', icon: '▼', num: '+25% chop damage',
    // (the numbers come from WEAPONS, so the line can't go stale again: critic J2 C8)
    line: `The heavy chop hits 25% harder (${WEAPONS.machete.chop.damage} → ${Math.round(WEAPONS.machete.chop.damage * 1.25)} with the machete).`,
    cost: { scrap: 25, circuits: 1 }, blade: { chopDamage: 1.25 },
  },
  // hideWith: a research node that replaces this recipe — Field Dressing's briefing shop sells med kits for 15 Scrap
  // (no Biofiber), so the Workbench stops offering them (critic J2 C1: one med-kit shop at a time).
  med_kit: {
    group: 'gear', name: 'Med kit', icon: '✚', num: 'heals 25',
    line: 'Heals 25 health in the jungle (Q). You can carry 2.',
    cost: { scrap: 15, biofiber: 1 }, gives: { meds: 1 }, hideWith: 'field_dressing',
  },
  reinforced_plating: {
    group: 'relay', name: 'Reinforced Plating', icon: '⛨', num: '+10 Relay max health',
    line: 'The Relay gets 10 more max health, and is repaired by 10 now. Once per run.',
    cost: { scrap: 30, circuits: 1 }, relayMax: 10, once: true,
  },
};
export const RECIPE_KEYS = Object.keys(RECIPES);

/** Is this recipe on the Workbench for this profile (not replaced by a research node: `hideWith`)? */
export function recipeOffered(key, meta) {
  const r = RECIPES[key];
  return !!r && !(r.hideWith && meta?.unlocks?.includes(r.hideWith));
}

// Tower mods: one socket per tower. `kinds` = the tower kinds (towers.js) it fits; `tower` = the stat change,
// applied in Run.towerStats with the same format as SKILLS[*].tower, plus two flags Tower / DefenseScene read:
//   slowedBonus   damage × this against slowed, rooted or stunned enemies (DefenseScene.damage)
//   seesBurrowed  bullet towers can target and hit burrowed enemies (Tower.pickTarget / _bullet)
export const TOWER_MODS = {
  focusing_lens: {
    name: 'Focusing Lens', icon: '◎', color: '#2ce8f5', num: '+15% range',
    line: 'The tower reaches 15% further.',
    kinds: ['bullet', 'chain', 'mortar', 'snare', 'support'], tower: { range: 1.15 },
  },
  thorn_coating: {
    name: 'Thorn Coating', icon: '✶', color: '#63c74d', num: '+25% damage vs slowed',
    line: 'The tower deals 25% more damage to slowed, rooted or stunned enemies.',
    kinds: ['bullet', 'chain', 'mortar'], tower: { slowedBonus: 1.25 },
  },
  uplink: {
    name: 'Tunnel Sight', icon: '⌁', color: '#feae34', num: 'hits burrowed enemies',
    line: 'The tower can shoot enemies while they tunnel underground.',
    kinds: ['bullet'], tower: { seesBurrowed: true },
  },
  overcharger: {
    name: 'Overcharger', icon: 'ϟ', color: '#fee761', num: '+10% attack speed',
    line: 'The tower attacks 10% faster.',
    kinds: ['bullet', 'chain', 'mortar', 'snare'], tower: { rate: 1.1 },
  },
};
export const TOWER_MOD_KEYS = Object.keys(TOWER_MODS);

// How machete modifiers stack across skills (SKILLS[*].blade) and Workbench upgrades (RECIPES[*].blade):
//   add: summed · mult: multiplied · max: the biggest · or: any.
//   deflectWindow  + s to the deflect window (DEFLECT.window)      riposteMult   riposte damage × (replaces DEFLECT's)
//   killHeal       health per jungle kill                          fernFree      ferns don't slow you (walk or roll)
//   cutStamina     × stamina for swings that only meet plants      chopCut       the chop clears plants this far (tiles)
//   throwReturn    × the thrown machete's return time              throwBackFull the way back hits for full damage
//   dodgeRiposte   a perfect dodge sets up a riposte               riposteHeal   health per riposte that lands
//   bleedDps / bleedTime  melee hits make creatures bleed          comboTime     × light-swing time (and hack-through)
//   chopDamage     × heavy chop damage
export const BLADE_STACK = {
  deflectWindow: 'add', riposteMult: 'max', killHeal: 'add', fernFree: 'or', cutStamina: 'mult', chopCut: 'max',
  throwReturn: 'mult', throwBackFull: 'or', dodgeRiposte: 'or', riposteHeal: 'add', bleedDps: 'max', bleedTime: 'max',
  comboTime: 'mult', chopDamage: 'mult',
};

// Bleeding creatures (Serrated Edge, src/entities/BladeKit.js): damage lands every `tick` s, drawn in `color`.
// Area bosses (and the Pack Lord) bleed at × `boss` (critic I2 #12).
export const BLEED = { tick: 0.5, color: '#e43b44', boss: 0.5 };
