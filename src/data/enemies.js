// Defense-mode enemies. They walk lane waypoints toward the Relay Core.
// speed is tiles/sec. bounty is a small scrap drop; exploration stays the main income. Bounties may be
// fractional: the scene pays whole Scrap as the fractions add up (halved in balance round 3, when
// bounties had grown to ~70 Scrap a night).
// coreDamage is dealt once when the enemy reaches the core (it is then removed). With coreDamageMin
// (boss) the damage scales from coreDamageMin at 0 health left to coreDamage at full health.
// note: one line shown in the wave preview / first-sighting toast. color: icon colour in the UI.
// gap: default seconds between spawns when the enemy arrives as an extra (district threat) group.
// slowResist: fraction of every slow that is ignored. rootImmune: snare roots don't apply.

export const DEFENSE_ENEMIES = {
  crawler: {
    name: 'Bramble Crawler', role: 'Basic', hp: 38, speed: 1.5, coreDamage: 5, bounty: 0.5, size: 0.7,
    note: 'Steady and numerous.', color: '#3e8948', gap: 1.1,
  },
  skitter: {
    name: 'Skitter', role: 'Fast', hp: 18, speed: 3.0, coreDamage: 3, bounty: 0.5, size: 0.5,
    note: 'Very fast and fragile. Slows and rapid fire stop it.', color: '#b55088', gap: 0.5,
  },
  razorback: {
    name: 'Razorback', role: 'Tank', hp: 180, speed: 0.9, coreDamage: 12, bounty: 1.5, size: 1.0,
    note: 'Slow, armoured, very high health. Hits the Relay hard.', color: '#b86f50', gap: 3,
  },
  spitter: {
    name: 'Spitter', role: 'Ranged', hp: 52, speed: 1.3, coreDamage: 4, bounty: 1, size: 0.75,
    note: 'Stops near the Relay and lobs sap at it (up to 8 globs) until killed. Cover the Relay.', color: '#ff4d8d', gap: 2.2,
    // Stops once it is this close to the core (tiles), then lobs sap after a visible wind-up.
    // After `shots` globs its sap sac is empty and it withers away (no bounty).
    spit: { range: 5.5, windup: 0.9, every: 3.4, damage: 2, flight: 0.8, shots: 8 },
  },
  burrower: {
    name: 'Burrower', role: 'Ambusher', hp: 58, speed: 1.6, coreDamage: 6, bounty: 1, size: 0.7,
    note: 'Tunnels under part of its route. Bullet towers can\'t hit it there; arcs, mortars and snares can.', color: '#e4a672', gap: 1.4,
    // Underground for this fraction of its route: bullet towers can't target it there.
    burrow: [0.2, 0.55],
  },
  seed_carrier: {
    name: 'Seed Carrier', role: 'Swarm', hp: 70, speed: 1.2, coreDamage: 6, bounty: 1, size: 0.85,
    note: 'Bursts into 3 Seedlings when it dies, unless a blast (Mortar) kills it.', color: '#feae34', gap: 2,
    // Bursts into seedlings on death unless the killing blow was a blast.
    onDeath: { spawn: 'seedling', count: 3, unlessDamageType: 'blast' },
  },
  seedling: {
    name: 'Seedling', role: 'Swarm', hp: 10, speed: 2.0, coreDamage: 1, bounty: 0, size: 0.35,
    note: 'Tiny sprouts from a Seed Carrier.', color: '#63c74d', gap: 0.3,
  },
  ruin_guard: {
    name: 'Ruin Guard', role: 'Elite', hp: 230, speed: 1.0, coreDamage: 15, bounty: 2, size: 1.05,
    note: 'Its shield halves kinetic damage (Turrets, Thorns). Use arcs and mortars.', color: '#0099db', gap: 4,
    resist: { kinetic: 0.5 },   // shield halves kinetic damage
  },
  colossus: {
    name: 'Canopy Colossus', role: 'Boss', hp: 1020, speed: 0.55, coreDamage: 40, coreDamageMin: 15, bounty: 0, size: 2.2, boss: true,
    note: 'Boss. Walks, roots itself to spawn Crawlers, then winds up and charges. At 60% health it roars and enrages: its bark hardens (15% less damage taken), it charges faster and Skitters sprout too. If it reaches the Relay it deals 15–40 damage: the more it is hurt, the less.', color: '#ff0044', gap: 1,
    slowResist: 0.5, rootImmune: true,
    // Phase loop: approach -> rooted (telegraph, then spawns crawlers) -> charge (wind-up, then fast).
    // rootSpawn crawlers appear when it roots; the charge covers speed × chargeMult × charge tiles.
    phases: {
      approach: 8, rootTelegraph: 1.2, rooted: 2.5, rootSpawn: 2, rootSpawnType: 'crawler', rootRadius: 1.8,
      chargeWindup: 1.4, charge: 2.2, chargeMult: 2.6,
    },
    // Second act: at `at` of its health it stops and roars (telegraphed: a red ring, toast, shake),
    // then turns red and loops faster: shorter approach, a longer, faster charge, and every root also
    // spawns a Skitter pack. `phases` override the normal loop values while enraged.
    enrage: {
      at: 0.6, roar: 1.8, tint: '#ff8a7a', packType: 'skitter', packCount: 3,
      // Hardened bark: while enraged it takes damageTaken × damage (roarTaken during the roar), so the
      // second act lasts ~15–25 s against a strong build and it usually gets close to the Relay.
      damageTaken: 0.85, roarTaken: 0.3,
      phases: { approach: 4.5, rootSpawn: 2, chargeWindup: 1.2, charge: 2.6, chargeMult: 3.0 },
    },
  },
};

// Exploration enemies (day). Shared looks with the defense roster where it makes sense.
// attack: melee = lunge after a wind-up; ranged = aimed shot after a telegraph line; charge = straight rush.
//   detect: sight range (tiles, needs line of sight) · reach: distance at which a melee lunge starts
//   lunge: lunge travel (tiles) over lungeTime s · range: ranged attack distance · keepAway: backs off inside this
//   shot: 'bolt' (fast tracer) | 'glob' (slow sap blob) · chargeSpeed × chargeTime = charge lane length
//   size: collision radius ≈ size × 0.45 · drop: chance of a small loot drop · burst: death particle colours
export const EXPLORE_ENEMIES = {
  crawler: { name: 'Bramble Crawler', hp: 30, speed: 2.4, detect: 7, attack: 'melee', damage: 10, windup: 0.5, cooldown: 1.2, reach: 1.3, lunge: 2.0, lungeTime: 0.2, size: 0.7, drop: 0.25, burst: ['#3e8948', '#63c74d'] },
  skitter: { name: 'Skitter', hp: 16, speed: 4.2, detect: 8, attack: 'melee', damage: 6, windup: 0.35, cooldown: 0.9, reach: 1.1, lunge: 1.7, lungeTime: 0.16, size: 0.5, drop: 0.15, burst: ['#b55088', '#68386c'] },
  scav: { name: 'Rival Scavenger', hp: 36, speed: 2.2, detect: 9, attack: 'ranged', damage: 10, windup: 0.7, cooldown: 2.0, range: 7, shotSpeed: 9, shot: 'bolt', size: 0.8, drop: 0.5, keepAway: 4, burst: ['#a22633', '#3a4466'] },
  spitter: { name: 'Spitter', hp: 34, speed: 0, detect: 8, attack: 'ranged', damage: 9, windup: 0.8, cooldown: 2.2, range: 7.5, shotSpeed: 6.5, shot: 'glob', size: 0.75, drop: 0.3, burst: ['#b55088', '#ff0044'] },
  razorback: { name: 'Razorback', hp: 90, speed: 1.6, detect: 7, attack: 'charge', damage: 20, windup: 0.8, cooldown: 2.4, chargeSpeed: 9, chargeTime: 0.6, chargeRange: 6, stun: 0.9, size: 1.0, drop: 0.6, burst: ['#b86f50', '#e4a672'] },
};
