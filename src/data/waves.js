// Night waves. Each group: { at: seconds after wave start, lane: 0|1, type, count, gap: seconds between spawns }.
// Scaling: enemy health ×(1 + 0.10 per night after the first); counts are authored per night
// (roughly +20–25% budget each night). District threats and objective boons modify these at runtime.

export const HEALTH_SCALE_PER_NIGHT = 0.10;

export const WAVES = [
  // Night 1: Crawlers and a few Skitters
  [
    { at: 0, lane: 0, type: 'crawler', count: 5, gap: 1.6 },
    { at: 5, lane: 1, type: 'crawler', count: 5, gap: 1.6 },
    { at: 16, lane: 0, type: 'skitter', count: 3, gap: 0.8 },
    { at: 22, lane: 1, type: 'crawler', count: 4, gap: 1.2 },
  ],
  // Night 2: first Razorback
  [
    { at: 0, lane: 0, type: 'crawler', count: 6, gap: 1.3 },
    { at: 4, lane: 1, type: 'skitter', count: 5, gap: 0.7 },
    { at: 14, lane: 1, type: 'crawler', count: 6, gap: 1.2 },
    { at: 20, lane: 0, type: 'razorback', count: 1, gap: 1 },
    { at: 26, lane: 0, type: 'skitter', count: 4, gap: 0.6 },
  ],
  // Night 3: Spitters and larger mixed groups
  [
    { at: 0, lane: 0, type: 'crawler', count: 8, gap: 1.0 },
    { at: 3, lane: 1, type: 'crawler', count: 8, gap: 1.0 },
    { at: 12, lane: 0, type: 'spitter', count: 2, gap: 2.5 },
    { at: 16, lane: 1, type: 'skitter', count: 6, gap: 0.5 },
    { at: 24, lane: 1, type: 'razorback', count: 2, gap: 4 },
    { at: 28, lane: 0, type: 'spitter', count: 2, gap: 2.5 },
  ],
  // Night 4: Burrowers and Seed Carriers
  [
    { at: 0, lane: 0, type: 'crawler', count: 8, gap: 0.9 },
    { at: 2, lane: 1, type: 'burrower', count: 4, gap: 1.6 },
    { at: 10, lane: 0, type: 'seed_carrier', count: 3, gap: 2.2 },
    { at: 16, lane: 1, type: 'skitter', count: 8, gap: 0.45 },
    { at: 22, lane: 0, type: 'razorback', count: 2, gap: 3 },
    { at: 26, lane: 1, type: 'seed_carrier', count: 3, gap: 2 },
    { at: 30, lane: 0, type: 'spitter', count: 3, gap: 2 },
  ],
  // Night 5: Ruin Guards and big mixed groups
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
  // Night 6: the Canopy Colossus with support
  [
    { at: 0, lane: 0, type: 'crawler', count: 10, gap: 0.8 },
    { at: 2, lane: 1, type: 'skitter', count: 8, gap: 0.5 },
    { at: 8, lane: 1, type: 'colossus', count: 1, gap: 1 },
    { at: 14, lane: 0, type: 'razorback', count: 2, gap: 3 },
    { at: 20, lane: 0, type: 'seed_carrier', count: 3, gap: 2 },
    { at: 26, lane: 1, type: 'ruin_guard', count: 2, gap: 4 },
    { at: 34, lane: 0, type: 'spitter', count: 3, gap: 2 },
    { at: 40, lane: 1, type: 'crawler', count: 12, gap: 0.6 },
  ],
];
