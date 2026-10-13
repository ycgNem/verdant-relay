// Night waves. Each group: { at: seconds after wave start, lane: 0|1, type, count, gap: seconds between spawns }.
// Scaling: enemy health × HEALTH_MULT[night − 1]; counts are authored per night.
// Total wave HP (no district threat): N1 ≈355, N2 ≈1750, N3 ≈4080, N4 ≈5540, N5 ≈6570, N6 ≈6550
// (N6 includes the 2550-HP boss, which also hardens when enraged).
// Balance round 4 (final pass) retuned with full-run sims of the real DefenseScene (stepped in a browser,
// budgets accumulating over the nights: ~70 / 90 / 100 / 100 / 100 / 105 Scrap per expedition + bounties):
//   well-played (towers funnelled at the Relay, 6–7 defensive skills, Mortar + Beacon): loses ~0–15 on N2,
//     ~12–27 on N3, ~24–40 on N4, ~0–35 on N5, ~19–35 on N6; fights the enraged Colossus ~20–23 s, which
//     gets to ~96% of its lane (sometimes reaches the Relay with a sliver of health left) and wins.
//   typical (3 defensive skills + scavenger picks): similar, N4 ~25–40; without unlocks the boss usually
//     reaches the Relay (−15–20) but the night is held. No skills falls on N5; L1-turret spam on N4;
//     a build spread mid-map loses ~45–95 a night from N4 and usually falls on N6.
//   N1 (critic F pass: HP ×0.9, +3 Skitters): one turret ~35–40, two towers ~0–6 near the Relay, nothing ~70.
// Most Relay damage comes from tanks reaching the core (Razorbacks 12, Ruin Guards 15), so counts of those
// matter more than HP. District threats and objective boons modify these at runtime.

export const HEALTH_MULT = [0.9, 1.9, 2.3, 2.05, 2.4, 2.5];

// Defense-mode tuning that isn't per tower or per enemy.
export const DEFENSE = {
  // Extra groups (district threats) arrive mid-wave: spread between these fractions of the authored
  // wave length, alternating lanes.
  extraGroupFrom: 0.3,
  extraGroupTo: 0.75,
  // District-threat group sizes × this per night (an 8-Skitter pack is most of a night-1 wave otherwise).
  threatScale: [0.5, 0.75, 1, 1, 1, 1],
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
  resumeReady: 3,                          // seconds of "get ready" before a wave restarted by Continue runs
  bossEntry: 6,                            // seconds the boss's lane entry pulses (tag + arrow) after it spawns, or until it walks on screen
  laneTagDrop: 0.78,                       // lane tags sit this many tiles below the lane centre (clear of enemy rings and the path)
};

export const WAVES = [
  // Night 1: Crawlers and Skitters (13) — gentle, but two towers should still take a scratch; district threats add on top (at half size)
  [
    { at: 0, lane: 0, type: 'crawler', count: 3, gap: 1.8 },
    { at: 6, lane: 1, type: 'crawler', count: 3, gap: 1.8 },
    { at: 16, lane: 0, type: 'skitter', count: 2, gap: 1.2 },
    { at: 24, lane: 1, type: 'crawler', count: 2, gap: 1.6 },
    { at: 30, lane: 1, type: 'skitter', count: 3, gap: 0.8 },
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
  // Night 4: Burrowers and Seed Carriers (44)
  [
    { at: 0, lane: 0, type: 'crawler', count: 10, gap: 0.85 },
    { at: 2, lane: 1, type: 'burrower', count: 4, gap: 1.5 },
    { at: 10, lane: 0, type: 'seed_carrier', count: 3, gap: 2.2 },
    { at: 16, lane: 1, type: 'skitter', count: 9, gap: 0.45 },
    { at: 20, lane: 1, type: 'crawler', count: 4, gap: 0.9 },
    { at: 22, lane: 0, type: 'razorback', count: 4, gap: 3.5 },
    { at: 26, lane: 1, type: 'seed_carrier', count: 4, gap: 2 },
    { at: 30, lane: 0, type: 'spitter', count: 4, gap: 1.8 },
    { at: 34, lane: 1, type: 'razorback', count: 2, gap: 3.5 },
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
  // Night 6: the Canopy Colossus with thinner support (28 + boss; it enrages at 60% health and hardens). The boss walks the south lane while
  // most support pressure comes down the north lane, so focusing the boss is possible.
  [
    { at: 0, lane: 0, type: 'crawler', count: 6, gap: 0.9 },
    { at: 2, lane: 1, type: 'skitter', count: 5, gap: 0.6 },
    { at: 8, lane: 1, type: 'colossus', count: 1, gap: 1 },
    { at: 14, lane: 0, type: 'razorback', count: 2, gap: 3 },
    { at: 20, lane: 0, type: 'seed_carrier', count: 3, gap: 2 },
    { at: 26, lane: 0, type: 'ruin_guard', count: 1, gap: 4 },
    { at: 30, lane: 0, type: 'burrower', count: 3, gap: 1.2 },
    { at: 34, lane: 1, type: 'spitter', count: 3, gap: 2 },
    { at: 42, lane: 0, type: 'crawler', count: 4, gap: 0.6 },
  ],
];
