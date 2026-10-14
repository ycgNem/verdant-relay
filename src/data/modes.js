// Run modes and the difficulty ladder (Stage 7 "run systems", critic J M8 / N5). Read by Run.js (create,
// modifiers, records), TitleScene (the mode buttons), BriefingScene / ResultsScene (labels) and Save.js (checks).
//
//   normal   six nights, the Colossus on night 6 (CONFIG.nights)
//   long     "Long Night" (unlocked by the first win): beating night 6 counts as a win and the run goes on —
//            nights past 6 come from waveFor()'s generator in src/data/waves.js (health ×1.2 a night, a Colossus
//            every 3rd night); the run ends when the Relay falls. meta.longNight.best = the best night reached.
//   daily    one run a day for everyone on this machine: the seed comes from the local date, plus DAILY.mods fixed
//            modifiers picked by that date; meta.daily[date] keeps the day's best.

export const MODES = ['normal', 'long', 'daily'];

// Overgrowth (unlocked by the first win): level N stacks the first N modifiers in `order` and adds
// `researchPerLevel` × N to every Research gain. A win at level N unlocks N + 1 (meta.overgrowth.best).
// Every modifier works through a system that already exists (field → where it is read):
//   hpMult        night enemy health ×            Run.nightHpMult → DefenseScene
//   lootScrap     container Scrap ×               Run.lootMults → JungleScene rollLoot
//   relayMax      Relay max health +              Run.relayMax
//   skillOptions  skill-pick cards +              Run.skillOptions
//   secondDanger  another area's danger joins     Run.chooseDistrict (tonight.extraGroups / enemySpeed)
//   noSalvage     the drone saves nothing         Run.salvageFor
//   enemyCount    night wave size ×               Run.waveCountMult (after the −20% cut floor)
//   startScrap    starting Scrap +                Run.create
//   dawnFloor     the health you wake with is at least this (instead of CONFIG.expedition.dawnHpFloor)
//   enemySpeed    night enemy speed ×             Run.chooseDistrict → tonight.enemySpeed
export const OVERGROWTH = {
  max: 10,
  researchPerLevel: 0.1,
  order: ['thick_hides', 'picked_over', 'brittle_relay', 'narrow_choice', 'restless', 'no_drone', 'swarming', 'lean_start', 'hard_dawn', 'deep_roots'],
  mods: {
    thick_hides: { name: 'Thick Hides', text: 'Night enemies have 10% more health.', hpMult: 1.1 },
    picked_over: { name: 'Picked Over', text: 'Containers hold 15% less Scrap.', lootScrap: 0.85 },
    brittle_relay: { name: 'Brittle Relay', text: 'The Relay has 20 less max health.', relayMax: -20 },
    narrow_choice: { name: 'Narrow Choice', text: 'Skill picks show one card fewer.', skillOptions: -1 },
    restless: { name: 'Restless Jungle', text: "A second area's danger joins the attack every night.", secondDanger: true },
    no_drone: { name: 'No Drone', text: 'When you go down, the drone saves nothing you carried.', noSalvage: true },
    swarming: { name: 'Swarming', text: '15% more enemies attack every night.', enemyCount: 1.15 },
    lean_start: { name: 'Lean Start', text: 'Start the run with 25 less Scrap.', startScrap: -25 },
    hard_dawn: { name: 'Hard Dawn', text: 'You wake with at least 40 health instead of 60.', dawnFloor: 40 },
    deep_roots: { name: 'Deep Overgrowth', text: 'Night enemies move 10% faster and have 10% more health.', enemySpeed: 1.1, hpMult: 1.1 },
  },
};

// The Daily run: `mods` modifiers drawn from OVERGROWTH.mods by the date (the same for everyone on that day),
// Research +researchPerMod each; `keepDays` days of local bests are kept in meta.daily.
export const DAILY = { mods: 2, researchPerMod: 0.1, keepDays: 30 };

// The Long Night: the highest night a save may hold (a sanity cap for Save.validRun).
export const LONG_NIGHT = { maxNight: 99 };
