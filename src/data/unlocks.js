// Permanent unlocks bought with Research Data. They add options, never raw power.
// Costs total 535: a winning run earns ~300 Research, so buying everything takes ~2–3 runs.

export const UNLOCKS = {
  mortar_pod: { name: 'Blueprint: Mortar Pod', desc: 'Adds the Mortar Pod to the build list.', cost: 80 },
  pulse_beacon: { name: 'Blueprint: Pulse Beacon', desc: 'Adds the Pulse Beacon to the build list.', cost: 110 },
  // Key kept from v1 (saves): it unlocks the Parang, a heavier blade (WEAPONS.parang; 'scattergun' aliases to it).
  scattergun: { name: 'Starting Blade: Parang', desc: 'Start runs with a heavy parang: slower swings, harder hits, cuts brambles with any swing (toggle in Collection).', cost: 90 },
  stockpile: { name: 'Hidden Stockpile', desc: 'Start each run with +20 Scrap.', cost: 60 },
  field_kit: { name: 'Field Kit', desc: 'Start each run with one med kit carried.', cost: 55 },
  wide_choice: { name: 'Wider Choice', desc: 'Skill picks offer 4 options instead of 3.', cost: 140 },
  verdant_scarf: { name: 'Cosmetic: Verdant Scarf', desc: 'A green scarf for your scavenger. Earned by winning a run.', cost: null, victoryReward: true },
};
export const UNLOCK_KEYS = Object.keys(UNLOCKS);
