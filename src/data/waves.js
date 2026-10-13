// Night waves. Each group: { at: seconds after wave start, lane: 0|1, type, count, gap: seconds between spawns }.
// Scaling: enemy health × HEALTH_MULT[night − 1] (steepens from night 3 so late nights keep up with
// the towers a player can afford); counts are authored per night.
// Total wave HP (no district threat): N1 ≈360, N2 ≈1010, N3 ≈2840, N4 ≈7350, N5 ≈6850, N6 ≈7120
// (N6 includes the 2550-HP boss). Balance round 3 retuned N3–N6 with full-run sims of the real code
// (DefenseScene stepped in a browser) after wave cuts were capped at −20% and bounties halved.
// Reference run: towers funnelled around the Relay, ~90–115 Scrap / 1–3 C / 1–4 B / 3–6 Intel per
// expedition, objective boons every night, 6 defensive skills (Prepared Defenses, Reinforced Core,
// Long Sightlines, Rapid Response, Overclock, Efficient Assembly), Mortar + Beacon unlocked:
// loses ~10–60 Relay HP on N4 (median ~30), ~0–40 on N5, ~20–75 on N6 (median ~35) and wins.
// Same run without unlocks: −25–60 per night, the boss sometimes reaches the Relay. A mixed build
// spread mid-map wins N6 with ~10–60 left; no skills loses N5–N6; L1-turret spam falls on N4.
// One turret on N1 still costs ~40 HP. District threats and objective boons modify these at runtime.

export const HEALTH_MULT = [1, 1.1, 1.6, 2.4, 2.5, 2.5];

// Defense-mode tuning that isn't per tower or per enemy.
export const DEFENSE = {
  // Extra groups (district threats) arrive mid-wave: spread between these fractions of the authored
  // wave length, alternating lanes.
  extraGroupFrom: 0.3,
  extraGroupTo: 0.75,
  rapidResponse: { mult: 0.7, time: 8 },   // skill: enemies 30% slower for the first 8 s
  speeds: [1, 2],                          // game speed options in the HUD
  maxSubstep: 1 / 30,                      // sim step cap at high speed (keeps projectiles accurate)
  bossSlowMin: 0.5,                        // slows never take a boss below this speed multiplier
  endBanner: 2.6,                          // seconds the "Night survived" banner shows
  defeatBanner: 2.8,
  emergencyPatchInWave: true,              // Emergency Patch skill usable mid-wave (repairs are not)
  damageNumbersMin: 6,                     // hits below this don't show a number (keeps rapid towers readable)
  maxFloatingText: 28,
  sellConfirm: 4,                          // seconds the "Confirm sell" button stays armed
  bossEntry: 6,                            // seconds the boss's lane entry pulses (tag + arrow) after it spawns, or until it walks on screen
  laneTagDrop: 0.78,                       // lane tags sit this many tiles below the lane centre (clear of enemy rings and the path)
};

export const WAVES = [
  // Night 1: Crawlers and a few Skitters (11) — gentle; district threats add on top
  [
    { at: 0, lane: 0, type: 'crawler', count: 3, gap: 1.8 },
    { at: 6, lane: 1, type: 'crawler', count: 3, gap: 1.8 },
    { at: 16, lane: 0, type: 'skitter', count: 3, gap: 0.9 },
    { at: 24, lane: 1, type: 'crawler', count: 2, gap: 1.4 },
  ],
  // Night 2: first Razorbacks (22)
  [
    { at: 0, lane: 0, type: 'crawler', count: 5, gap: 1.3 },
    { at: 4, lane: 1, type: 'skitter', count: 5, gap: 0.6 },
    { at: 13, lane: 1, type: 'crawler', count: 5, gap: 1.2 },
    { at: 18, lane: 0, type: 'razorback', count: 2, gap: 6 },
    { at: 27, lane: 0, type: 'skitter', count: 5, gap: 0.55 },
  ],
  // Night 3: Spitters and larger mixed groups (33)
  [
    { at: 0, lane: 0, type: 'crawler', count: 9, gap: 1.0 },
    { at: 3, lane: 1, type: 'crawler', count: 9, gap: 1.0 },
    { at: 12, lane: 0, type: 'spitter', count: 2, gap: 2.5 },
    { at: 16, lane: 1, type: 'skitter', count: 6, gap: 0.5 },
    { at: 20, lane: 1, type: 'spitter', count: 1, gap: 2.5 },
    { at: 24, lane: 1, type: 'razorback', count: 2, gap: 4 },
    { at: 28, lane: 0, type: 'spitter', count: 2, gap: 2.5 },
    { at: 32, lane: 0, type: 'razorback', count: 2, gap: 5 },
  ],
  // Night 4: Burrowers and Seed Carriers (46) — the hardest regular night
  [
    { at: 0, lane: 0, type: 'crawler', count: 10, gap: 0.85 },
    { at: 2, lane: 1, type: 'burrower', count: 4, gap: 1.5 },
    { at: 10, lane: 0, type: 'seed_carrier', count: 3, gap: 2.2 },
    { at: 16, lane: 1, type: 'skitter', count: 9, gap: 0.45 },
    { at: 20, lane: 1, type: 'crawler', count: 4, gap: 0.9 },
    { at: 22, lane: 0, type: 'razorback', count: 5, gap: 3 },
    { at: 26, lane: 1, type: 'seed_carrier', count: 4, gap: 2 },
    { at: 30, lane: 0, type: 'spitter', count: 4, gap: 1.8 },
    { at: 34, lane: 1, type: 'razorback', count: 3, gap: 3 },
  ],
  // Night 5: Ruin Guards and big mixed groups (50)
  [
    { at: 0, lane: 0, type: 'crawler', count: 10, gap: 0.8 },
    { at: 2, lane: 1, type: 'crawler', count: 10, gap: 0.8 },
    { at: 10, lane: 0, type: 'ruin_guard', count: 3, gap: 4 },
    { at: 14, lane: 1, type: 'burrower', count: 7, gap: 1.1 },
    { at: 20, lane: 1, type: 'seed_carrier', count: 4, gap: 1.6 },
    { at: 24, lane: 0, type: 'skitter', count: 12, gap: 0.4 },
    { at: 30, lane: 1, type: 'ruin_guard', count: 1, gap: 1 },
    { at: 32, lane: 0, type: 'spitter', count: 3, gap: 1.5 },
  ],
  // Night 6: the Canopy Colossus with support (34 + boss; the boss enrages at half health). The boss walks the south lane while
  // most support pressure comes down the north lane, so focusing the boss is possible.
  [
    { at: 0, lane: 0, type: 'crawler', count: 8, gap: 0.8 },
    { at: 2, lane: 1, type: 'skitter', count: 6, gap: 0.5 },
    { at: 8, lane: 1, type: 'colossus', count: 1, gap: 1 },
    { at: 14, lane: 0, type: 'razorback', count: 2, gap: 3 },
    { at: 20, lane: 0, type: 'seed_carrier', count: 3, gap: 2 },
    { at: 26, lane: 0, type: 'ruin_guard', count: 1, gap: 4 },
    { at: 30, lane: 0, type: 'burrower', count: 4, gap: 1.2 },
    { at: 34, lane: 1, type: 'spitter', count: 3, gap: 2 },
    { at: 42, lane: 0, type: 'crawler', count: 6, gap: 0.6 },
  ],
];
