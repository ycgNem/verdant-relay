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
    // hold: seconds of "hold E" to open (shown in the prompt). Containers are short; objective and
    // event holds live in src/data/objectives.js.
    containers: {
      crate: { scrap: [8, 15], hold: 0.4 },
      chest: { scrap: [15, 25], componentChance: 0.5, hold: 0.8 },
      cache: { scrap: [20, 30], components: [1, 3], hold: 1.2 },
      intel_terminal: { intel: [1, 3], hold: 1.0 },
    },
    holdGrace: 0.8,            // once a hold has started it survives drifting this far past the interact radius (knockback)
    containerMedChance: 0.08,  // × district med multiplier
    medKits: 1,                // loose med kits per map (× district med multiplier)
    enemiesPerRoom: { start: [0, 0], explore: [1, 2], objective: [1, 2], extract: [0, 1], optional: [1, 2] },
    // Expedition difficulty by night (index = night - 1; the last entry repeats). Night 1–2 are a
    // gentle on-ramp: fewer, weaker enemies and lightly guarded objectives; nights 4–6 stay tense.
    byNight: {
      enemyHp:      [0.85, 0.92, 1.0, 1.1, 1.2, 1.3],   // exploration enemy HP multiplier
      enemyDamage:  [0.75, 0.85, 1.0, 1.0, 1.05, 1.1], // exploration enemy damage multiplier
      extraEnemies: [-0.4, -0.1, 0.5, 0.85, 1.2, 1.5],  // extra enemies per room (fractional = chance; negative removes)
      rangedCap:    [1, 1, 2, 2, 3, 3],                 // Spitters + Rival Scavengers per room
      chargerCap:   [1, 1, 1, 1, 2, 2],                 // Razorbacks per room (the elite room has none besides the elite)
      objectiveCap: [3, 3, 4, 4, 5, 5],                 // enemies in the objective room, guards included
      guards:       [2, 2, 3, 3, 3, 4],                 // max guards on guarded caches (objective + infested cache)
      holdSpawns:   [2, 3, 3, 4, 4, 5],                 // max enemies summoned during an objective / event hold
      eliteHp:      [1.8, 2.0, 2.1, 2.2, 2.4, 2.6],     // elite HP multiplier (× the night's enemyHp)
      eliteSupport: [1, 1, 1, 2, 2, 2],                 // light enemies (Crawlers / Skitters) beside the elite
      deathSalvage: [0.3, 0.2, 0, 0, 0, 0],             // share of carried loot the drone recovers when you go down
    },
    startMedNights: 2,         // a med kit lies in the start room on nights up to this one
    spawnMinDist: 9,           // generated enemies are at least this far (tiles) from the start
    reinforceMinDist: 7,       // runtime spawns: at least this far from the player
    reinforceMaxDist: 14,
    spawnInTime: 0.7,          // seconds a reinforcement spends emerging (harmless, telegraphed)
    enemyDrop: { scrap: [2, 4], componentChance: 0.15, medChance: 0.04 },
    ambushCount: [2, 3],       // districts with ambushChance: enemies that burst out of a container
    alarmSpawn: 3,             // reinforcements when a security laser is tripped
    spore: { damage: 6, tick: 0.6 },
    extraSpores: { canopy_greenhouse: 6 },   // extra spore patches scattered by district
    // Elite objective enemy (Clear the Blockage). HP multiplier comes from byNight.eliteHp.
    // windupMult: longer, clearer charge telegraphs; supportTypes: the only enemies allowed beside it.
    elite: { scale: 1.3, damageMult: 1.2, windupMult: 1.35, tint: '#ffb3a0', supportTypes: { crawler: 2, skitter: 1 } },
    nest: { spawnEvery: 7, maxAlive: 3, radius: 9, types: { crawler: 2, skitter: 1 } },
    holdSpawnMinDist: 6,       // enemies summoned by a hold (terminal, workshop…) appear at least this far
    camera: { fov: 38, pitch: 55, dist: 12.4, lookAhead: 2.2, follow: 7 },
    light: { hemi: 2.4, sun: 2.0 },
  },

  // Repair: repairScrap buys repairAmount HP; a partial repair near max pays only for the HP restored
  // (rounded up), so Relay health is never cheaper than towers.
  relay: { hp: 100, repairScrap: 25, repairAmount: 15 },
  sellRefund: 0.7,
  // Each tower of a type you already own makes the next one of that type cost this much more Scrap
  // (keeps one-tower spam from beating upgrades and mixed builds). Shown on the build cards.
  towerSurcharge: 5,
  // Intel is spent during night prep: Decrypt turns it into Research Data; Sabotage shrinks
  // tonight's wave (once per night).
  intel: { decryptCost: 1, decryptResearch: 4, sabotageCost: 2, sabotageWave: 0.9 },
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
  scrap: { label: 'Scrap', short: 'SCR', color: '#c0cbdc', glyph: '⚙', desc: 'Builds towers, pays for repairs and most upgrades.' },
  circuits: { label: 'Circuits', short: 'CIR', color: '#2ce8f5', glyph: '▣', desc: 'The bottleneck for electronic towers: Arc Spires and Pulse Beacons cost 2, upgrades 1–2.' },
  biofiber: { label: 'Biofiber', short: 'BIO', color: '#63c74d', glyph: '❦', desc: 'Organic towers and traps: Thorn Nests, Snare Vines, Mortar Pods.' },
  intel: { label: 'Intel', short: 'INT', color: '#feae34', glyph: '✉', desc: 'Spend it in night prep: Decrypt for Research Data, or Sabotage the wave.' },
};
export const RESOURCE_KEYS = ['scrap', 'circuits', 'biofiber', 'intel'];
