// Defense-mode enemies. They walk lane waypoints toward the Relay Core.
// speed is tiles/sec. bounty is a small scrap drop; exploration stays the main income.

export const DEFENSE_ENEMIES = {
  crawler: { name: 'Bramble Crawler', role: 'Basic', hp: 30, speed: 1.5, coreDamage: 5, bounty: 1, size: 0.7 },
  skitter: { name: 'Skitter', role: 'Fast', hp: 14, speed: 3.0, coreDamage: 3, bounty: 1, size: 0.5 },
  razorback: { name: 'Razorback', role: 'Tank', hp: 140, speed: 0.9, coreDamage: 12, bounty: 3, size: 1.0 },
  spitter: {
    name: 'Spitter', role: 'Ranged', hp: 40, speed: 1.3, coreDamage: 4, bounty: 2, size: 0.75,
    // Stops once it is this close to the core (tiles), then lobs sap after a visible wind-up.
    spit: { range: 5.5, windup: 0.9, every: 3.2, damage: 3 },
  },
  burrower: {
    name: 'Burrower', role: 'Ambusher', hp: 45, speed: 1.6, coreDamage: 6, bounty: 2, size: 0.7,
    // Underground for this fraction of its route: bullet towers can't target it there.
    burrow: [0.2, 0.55],
  },
  seed_carrier: {
    name: 'Seed Carrier', role: 'Swarm', hp: 55, speed: 1.2, coreDamage: 6, bounty: 2, size: 0.85,
    // Bursts into seedlings on death unless the killing blow was a blast.
    onDeath: { spawn: 'seedling', count: 3, unlessDamageType: 'blast' },
  },
  seedling: { name: 'Seedling', role: 'Swarm', hp: 8, speed: 2.0, coreDamage: 1, bounty: 0, size: 0.35, noScale: false },
  ruin_guard: {
    name: 'Ruin Guard', role: 'Elite', hp: 180, speed: 1.0, coreDamage: 15, bounty: 4, size: 1.05,
    resist: { kinetic: 0.5 },   // shield halves kinetic damage
  },
  colossus: {
    name: 'Canopy Colossus', role: 'Boss', hp: 1800, speed: 0.55, coreDamage: 60, bounty: 0, size: 2.2, boss: true,
    // Phase loop: approach -> rooted (telegraph, then spawns crawlers) -> charge (wind-up, then fast).
    phases: { approach: 7, rootTelegraph: 1.2, rooted: 2.5, rootSpawn: 3, chargeWindup: 1.4, charge: 2.2, chargeMult: 2.6 },
  },
};

// Exploration enemies (day). Shared looks with the defense roster where it makes sense.
// attack: melee = lunge after a wind-up; ranged = aimed shot after a telegraph line; charge = straight rush.
export const EXPLORE_ENEMIES = {
  crawler: { name: 'Bramble Crawler', hp: 30, speed: 2.4, detect: 7, attack: 'melee', damage: 10, windup: 0.45, cooldown: 1.2, reach: 1.1, size: 0.7, drop: 0.25 },
  skitter: { name: 'Skitter', hp: 16, speed: 4.2, detect: 8, attack: 'melee', damage: 6, windup: 0.3, cooldown: 0.9, reach: 0.9, size: 0.5, drop: 0.15 },
  scav: { name: 'Rival Scavenger', hp: 36, speed: 2.2, detect: 9, attack: 'ranged', damage: 10, windup: 0.7, cooldown: 2.0, range: 7, shotSpeed: 8, size: 0.8, drop: 0.5, keepAway: 4 },
  spitter: { name: 'Spitter', hp: 34, speed: 0, detect: 8, attack: 'ranged', damage: 9, windup: 0.8, cooldown: 2.2, range: 7.5, shotSpeed: 7, size: 0.75, drop: 0.3 },
  razorback: { name: 'Razorback', hp: 90, speed: 1.6, detect: 7, attack: 'charge', damage: 20, windup: 0.75, cooldown: 2.4, chargeSpeed: 9, chargeTime: 0.6, size: 1.0, drop: 0.6 },
};
