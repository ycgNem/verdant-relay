// Global tuning numbers. Everything here is a starting value for playtesting.
// World units: 1 unit = 1 tile.

export const CONFIG = {
  saveVersion: 1,
  resolutions: { chunky: [480, 270], sharp: [640, 360] },
  nights: 6,

  player: {
    hp: 100,
    speed: 5.6,          // tiles/sec (~180 px/s at 32 px tiles)
    radius: 0.32,
    dodgeCooldown: 2.0,
    dodgeDuration: 0.25,
    dodgeSpeed: 15,
    hurtIframes: 0.6,
    pickupRadius: 2.2,   // loot magnet radius
    maxMeds: 2,
    medHeal: 25,
  },

  expedition: {
    time: 180,
    emergencyWarning: 8,     // seconds between time-out and the emergency beacon appearing
    lateSpawnEvery: 14,      // after time-out, reinforcements arrive this often
    extractHold: 2.0,
    extractRadius: 1.8,
    interactRadius: 1.4,
    deathReturnHp: 35,       // player HP after a failed expedition
    nightlyHeal: 25,         // player HP recovered each night
  },

  relay: { hp: 100, repairScrap: 20, repairAmount: 20 },
  sellRefund: 0.7,
  startResources: { scrap: 60, circuits: 2, biofiber: 1, intel: 0 },

  research: {
    expedition: 5, objective: 3, optional: 3, night: 10, newDistrict: 10, victory: 50, bossMax: 30,
  },
};

export const WEAPONS = {
  carbine: { name: 'Scrap Carbine', damage: 14, cooldown: 0.42, range: 9, speed: 16, pellets: 1, spread: 0 },
  scattergun: { name: 'Scattergun', damage: 8, cooldown: 0.75, range: 6, speed: 14, pellets: 4, spread: 0.32 },
};

export const TOOL = { name: 'Pulse Cutter', damage: 22, radius: 1.8, arc: 1.7, cooldown: 0.6 };

export const RESOURCES = {
  scrap: { label: 'Scrap', short: 'SCR', color: '#c0cbdc', glyph: '⚙' },
  circuits: { label: 'Circuits', short: 'CIR', color: '#2ce8f5', glyph: '▣' },
  biofiber: { label: 'Biofiber', short: 'BIO', color: '#63c74d', glyph: '❦' },
  intel: { label: 'Intel', short: 'INT', color: '#feae34', glyph: '✉' },
};
export const RESOURCE_KEYS = ['scrap', 'circuits', 'biofiber', 'intel'];
