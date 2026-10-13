// Global tuning numbers. Everything here is a starting value for playtesting.
// World units: 1 unit = 1 tile.

export const CONFIG = {
  saveVersion: 1,
  resolutions: { chunky: [480, 270], sharp: [640, 360] },
  nights: 6,

  player: {
    hp: 100,
    speed: 5.6,          // tiles/sec (~180 px/s at 32 px tiles)
    accel: 48,           // tiles/sec² toward the input direction (snappy, slight weight)
    radius: 0.32,
    dodgeCooldown: 2.0,
    dodgeDuration: 0.25,
    dodgeSpeed: 15,
    hurtIframes: 0.6,
    hurtKnockback: 5,    // tiles/sec impulse when hit
    pickupRadius: 2.2,   // loot magnet radius
    pickupSpeed: 11,     // magnet pull speed (tiles/sec)
    maxMeds: 2,
    medHeal: 25,
    medCooldown: 0.6,
    aimAssist: 0.1,      // radians: shots snap to an enemy this close to the aim line
    shotHeight: 0.55,    // world height of bullets / aim plane
  },

  expedition: {
    time: 180,
    emergencyWarning: 8,     // seconds between time-out and the emergency beacon appearing
    lateSpawnEvery: 14,      // after time-out, reinforcements arrive this often
    lateSpawnCount: [2, 3],  // enemies per late reinforcement group (+1 from night 4)
    extractHold: 2.0,
    extractRadius: 1.8,
    interactRadius: 1.4,
    deathReturnHp: 35,       // player HP after a failed expedition
    nightlyHeal: 25,         // player HP recovered each night
    maxSkillPoints: 2,       // skill points one expedition can earn (primary + bonus optionals)
    quickExtraction: 0.75,   // hold-time multiplier with the Quick Extraction skill
    packRatMagnet: 1.5,      // magnet radius multiplier with Pack Rat I
    packRatScrap: 1.1,       // container Scrap multiplier with Pack Rat II
    lushBiofiber: 2,         // Biofiber weight multiplier in containers with Lush Finds (+ crates may hold one)

    // ---- generation
    grid: [4, 3],            // room cells (cols × rows); unused cells become solid canopy
    exploreRooms: [3, 5],
    optionalRooms: [1, 2],
    extraLoopChance: 0.4,    // chance of a second loop beyond the guaranteed one
    eventChance: 0.7,        // chance an event (workshop / surge / infested cache) appears
    brambleDoors: [1, 2],    // doors choked with brambles (cut them with the Pulse Cutter)
    containersPerRoom: { start: [0, 1], explore: [1, 2], objective: [0, 1], extract: [0, 1], optional: [1, 2] },
    containerWeights: { crate: 50, chest: 25, cache: 8, intel_terminal: 17 },
    containers: {
      crate: { scrap: [8, 15] },
      chest: { scrap: [15, 25], componentChance: 0.5 },
      cache: { scrap: [20, 30], components: [1, 3], hold: 0.8 },
      intel_terminal: { intel: [1, 3], hold: 1.0 },
    },
    containerMedChance: 0.08,  // × district med multiplier
    medKits: 1,                // loose med kits per map (× district med multiplier)
    enemiesPerRoom: { start: [0, 0], explore: [1, 2], objective: [1, 2], extract: [0, 1], optional: [1, 2] },
    enemiesPerNight: 0.3,      // extra enemies per room per night after the first (fractional = chance)
    enemyHpPerNight: 0.08,     // exploration enemy HP +8% per night
    spawnMinDist: 9,           // generated enemies are at least this far (tiles) from the start
    reinforceMinDist: 7,       // runtime spawns: at least this far from the player
    reinforceMaxDist: 14,
    spawnInTime: 0.7,          // seconds a reinforcement spends emerging (harmless, telegraphed)
    enemyDrop: { scrap: [2, 4], componentChance: 0.15, medChance: 0.04 },
    ambushCount: [2, 3],       // districts with ambushChance: enemies that burst out of a container
    alarmSpawn: 3,             // reinforcements when a security laser is tripped
    spore: { damage: 6, tick: 0.6 },
    extraSpores: { canopy_greenhouse: 6 },   // extra spore patches scattered by district
    elite: { hpMult: 3, scale: 1.3, damageMult: 1.25, tint: '#ffb3a0' },
    nest: { spawnEvery: 7, maxAlive: 3, radius: 9, types: { crawler: 2, skitter: 1 } },
    holdSpawnMinDist: 6,       // enemies summoned by a hold (terminal, workshop…) appear at least this far
    camera: { fov: 38, pitch: 55, dist: 12.4, lookAhead: 2.2, follow: 7 },
    light: { hemi: 2.4, sun: 2.0 },
  },

  relay: { hp: 100, repairScrap: 20, repairAmount: 20 },
  sellRefund: 0.7,
  startResources: { scrap: 60, circuits: 2, biofiber: 1, intel: 0 },

  research: {
    expedition: 5, objective: 3, optional: 3, night: 10, newDistrict: 10, victory: 50, bossMax: 30,
  },
};

// Player weapons (exploration). spread = total cone in radians for multi-pellet weapons;
// knockback = tiles/sec impulse on hit; jitter = random aim error in radians.
export const WEAPONS = {
  carbine: { name: 'Scrap Carbine', damage: 14, cooldown: 0.42, range: 9, speed: 16, pellets: 1, spread: 0, jitter: 0.025, knockback: 3, color: '#fee761' },
  scattergun: { name: 'Scattergun', damage: 8, cooldown: 0.75, range: 6, speed: 14, pellets: 4, spread: 0.32, jitter: 0.04, knockback: 2.2, color: '#feae34' },
};

// Pulse Cutter: arc melee in front of the aim direction; also cuts brambles and security lasers.
export const TOOL = { name: 'Pulse Cutter', damage: 22, radius: 1.8, arc: 1.7, cooldown: 0.6, knockback: 7 };

export const RESOURCES = {
  scrap: { label: 'Scrap', short: 'SCR', color: '#c0cbdc', glyph: '⚙' },
  circuits: { label: 'Circuits', short: 'CIR', color: '#2ce8f5', glyph: '▣' },
  biofiber: { label: 'Biofiber', short: 'BIO', color: '#63c74d', glyph: '❦' },
  intel: { label: 'Intel', short: 'INT', color: '#feae34', glyph: '✉' },
};
export const RESOURCE_KEYS = ['scrap', 'circuits', 'biofiber', 'intel'];
