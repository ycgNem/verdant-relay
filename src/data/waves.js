// Night waves. Each group: { at: seconds after wave start, lane: 0|1, type, count, gap: seconds between spawns }.
// Scaling: enemy health ×(1 + 0.10 per night after the first); counts are authored per night
// (roughly +20–25% budget each night). District threats and objective boons modify these at runtime.

export const HEALTH_SCALE_PER_NIGHT = 0.10;

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
};

export const WAVES = [
  // Night 1: Crawlers and a few Skitters (14) — gentle; district threats add on top
  [
    { at: 0, lane: 0, type: 'crawler', count: 4, gap: 1.8 },
    { at: 6, lane: 1, type: 'crawler', count: 4, gap: 1.8 },
    { at: 16, lane: 0, type: 'skitter', count: 3, gap: 0.9 },
    { at: 24, lane: 1, type: 'crawler', count: 3, gap: 1.4 },
  ],
  // Night 2: first Razorbacks (26)
  [
    { at: 0, lane: 0, type: 'crawler', count: 7, gap: 1.2 },
    { at: 4, lane: 1, type: 'skitter', count: 5, gap: 0.6 },
    { at: 13, lane: 1, type: 'crawler', count: 7, gap: 1.1 },
    { at: 18, lane: 0, type: 'razorback', count: 2, gap: 6 },
    { at: 27, lane: 0, type: 'skitter', count: 5, gap: 0.55 },
  ],
  // Night 3: Spitters and larger mixed groups (32)
  [
    { at: 0, lane: 0, type: 'crawler', count: 9, gap: 1.0 },
    { at: 3, lane: 1, type: 'crawler', count: 9, gap: 1.0 },
    { at: 12, lane: 0, type: 'spitter', count: 2, gap: 2.5 },
    { at: 16, lane: 1, type: 'skitter', count: 6, gap: 0.5 },
    { at: 24, lane: 1, type: 'razorback', count: 2, gap: 4 },
    { at: 28, lane: 0, type: 'spitter', count: 2, gap: 2.5 },
    { at: 32, lane: 0, type: 'razorback', count: 2, gap: 5 },
  ],
  // Night 4: Burrowers and Seed Carriers (40)
  [
    { at: 0, lane: 0, type: 'crawler', count: 10, gap: 0.85 },
    { at: 2, lane: 1, type: 'burrower', count: 4, gap: 1.5 },
    { at: 10, lane: 0, type: 'seed_carrier', count: 3, gap: 2.2 },
    { at: 16, lane: 1, type: 'skitter', count: 9, gap: 0.45 },
    { at: 20, lane: 1, type: 'crawler', count: 4, gap: 0.9 },
    { at: 22, lane: 0, type: 'razorback', count: 3, gap: 3 },
    { at: 26, lane: 1, type: 'seed_carrier', count: 3, gap: 2 },
    { at: 30, lane: 0, type: 'spitter', count: 4, gap: 1.8 },
  ],
  // Night 5: Ruin Guards and big mixed groups (45)
  [
    { at: 0, lane: 0, type: 'crawler', count: 10, gap: 0.8 },
    { at: 2, lane: 1, type: 'crawler', count: 10, gap: 0.8 },
    { at: 10, lane: 0, type: 'ruin_guard', count: 2, gap: 4 },
    { at: 14, lane: 1, type: 'burrower', count: 5, gap: 1.2 },
    { at: 20, lane: 1, type: 'seed_carrier', count: 4, gap: 1.6 },
    { at: 24, lane: 0, type: 'skitter', count: 10, gap: 0.4 },
    { at: 30, lane: 1, type: 'ruin_guard', count: 1, gap: 1 },
    { at: 32, lane: 0, type: 'spitter', count: 3, gap: 1.5 },
  ],
  // Night 6: the Canopy Colossus with support (39 + boss). The boss walks the south lane while
  // most support pressure comes down the north lane, so focusing the boss is possible.
  [
    { at: 0, lane: 0, type: 'crawler', count: 10, gap: 0.8 },
    { at: 2, lane: 1, type: 'skitter', count: 8, gap: 0.5 },
    { at: 8, lane: 1, type: 'colossus', count: 1, gap: 1 },
    { at: 14, lane: 0, type: 'razorback', count: 2, gap: 3 },
    { at: 20, lane: 0, type: 'seed_carrier', count: 3, gap: 2 },
    { at: 26, lane: 0, type: 'ruin_guard', count: 1, gap: 4 },
    { at: 30, lane: 0, type: 'burrower', count: 4, gap: 1.2 },
    { at: 34, lane: 1, type: 'spitter', count: 3, gap: 2 },
    { at: 42, lane: 0, type: 'crawler', count: 8, gap: 0.6 },
  ],
];
