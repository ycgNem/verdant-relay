// Area bosses (critic J M5) and the later-day creatures (src/entities/AreaBoss.js, src/entities/DayCreatures.js).
//
// From night BOSS.fromNight every area has a boss in a lair at one of its lost sites (JungleGen `lairs`: the lost
// major site, else its furthest lost site, else the major one), marked ☠ on the map and named on the briefing card.
// Bosses are optional: none of them stands between you and a win. Killing one gives a rare relic (scene.dropRelic,
// else `reward.fallback` loot), +reward.research Research, a skill point on top of the trip's, and that area sends
// no danger at night for the rest of the run (Run.clearBoss → Run.threatFor returns `cleared`). Kills persist in
// `run.bosses`. A boss you walk away from (beyond `leash` tiles of its lair for `leashTime` s) recovers to full.
//
// Common tuning (BOSS):
//   hp × CONFIG.expedition.byNight.eliteHp · aggro: tiles at which the fight starts · phase2: health share at which
//   it roars (`roar` s, taking `roarTaken` damage) and turns to its second phase (tint2, faster, nastier moves)
//   arena: brush cleared round a stationary boss · hurtFrame: s its hurt frame shows after a blow
// Per boss (BOSSES[area]): name, sprite (strip: idle 0–3, attack 4–5, hurt 6, dead 7), kind (its behaviour), radius
// (hit / collision radius in tiles), `intro` (the line under its name when the fight starts), then its moves. A
// value [a, b] is [phase 1, phase 2]. Every move is telegraphed (rings, lines, lanes) and every hit can be rolled.
export const BOSS = {
  fromNight: 3,
  hp: 450,
  aggro: 9,
  leash: 20,
  leashTime: 4,
  phase2: 0.5,
  roar: 1.4,
  roarTaken: 0.3,
  arena: 3.2,
  hurtFrame: 0.14,
  tint2: '#ffb0a0',
  barColor: '#e43b44',
  reward: { research: 30, relic: 'R', fallback: { scrap: 30, circuits: 2, biofiber: 2 } },
};

export const BOSSES = {
  canopy_greenhouse: {
    key: 'thorn_mother', name: 'Thorn Mother', sprite: 'boss_thorn_mother', kind: 'thorn_mother', radius: 1.25,
    intro: 'It spits spore pods and lashes with its vines. Stay out of the rings.',
    // barrage: `count` pods lobbed round you (one at you, the rest within `spread`), landing after `fuse` s in a ring of
    // `radius` for `damage`; the first `clouds` of them leave a spore cloud. Only within `range` tiles.
    barrage: { every: [5, 3.6], count: [3, 4], clouds: [1, 2], spread: 3, fuse: 1.1, radius: 1.0, damage: 10, range: 13 },
    // whip: a vine lane `range` long and `width` wide toward you (`fan` lanes, `spread` rad apart), `windup` s.
    whip: { every: [2.6, 1.8], range: 5.4, width: 0.9, windup: 0.65, damage: 16, knock: 7, fan: [1, 3], spread: 0.5 },
    // brood: phase 2 sprouts `at2` Crawlers at once, then one every `every` s while fewer than `max` live.
    brood: { type: 'crawler', at2: 2, every: 12, max: 3 },
  },
  overgrown_market: {
    key: 'brood_hive', name: 'Brood Hive', sprite: 'boss_brood_hive', kind: 'brood_hive', radius: 1.45,
    intro: 'Its brood shields it. Cull the Crawlers, then hit the hive.',
    // spawn: a Crawler crawls out every `every` s while fewer than `max` of its brood live (`at2` at once on phase 2).
    spawn: { type: 'crawler', every: [6, 4], max: [4, 5], at2: 3 },
    // shield: each living brood creature takes `per` off the damage it takes (at most `max`).
    shield: { per: 0.2, max: 0.7 },
    // burst: an egg burst round the hive (ring `radius`, `windup` s): `damage`, shoves you out; phase 2 hatches Skitters.
    burst: { every: [9, 6.5], radius: 3.2, windup: 1.1, damage: 18, knock: 8, hatch2: { type: 'skitter', n: 3 } },
    // eggs (phase 2): `n` egg sacs lobbed at you (ring `radius`, `fuse` s, `damage`), each hatching a `hatch`.
    eggs: { every: 7, n: 2, fuse: 0.9, radius: 0.9, damage: 8, hatch: 'skitter', range: 12 },
  },
  data_center: {
    key: 'warden', name: 'Security Warden', sprite: 'boss_warden', kind: 'warden', radius: 1.0,
    intro: 'Its laser sweeps the yard. Roll through the beam.',
    // laser: a `warn` s aiming line, then the beam sweeps `sweep`° at `speed`°/s, `length` tiles long; the beam hits
    // for `damage` (a roll's i-frames pass through it). Phase 2: `beams` beams at once, opposite each other.
    laser: { every: [6, 4.5], warn: 0.85, sweep: 150, speed: 80, length: 9.5, width: 0.45, damage: 18, beams: [1, 2], color: '#ff2e2e', core: '#ffe0d0' },
    // stomp: anything hugging it (within `range`) gets a ring stamp.
    stomp: { range: 2.4, windup: 0.7, radius: 2.4, damage: 14, knock: 7, cooldown: 3 },
    // drones (phase 2): `n` steel-blue Skitters every `every` s while fewer than `max` live.
    drones: { type: 'skitter', every: 10, n: 3, max: 4, tint: '#9fc4e0' },
  },
  flooded_transit: {
    key: 'drowned_engine', name: 'Drowned Engine', sprite: 'boss_drowned_engine', kind: 'drowned_engine', radius: 1.35,
    intro: 'Steam vents burst under you; its surge rolls along the ground. Keep moving.',
    // vents: `n` steam rings (one under you, the rest within `spread`), `windup` s, then `damage`.
    vents: { every: [4, 2.8], n: [3, 5], spread: 4, radius: 1.2, windup: 1.0, damage: 12, range: 14 },
    // surge: a water lane `length` × `width` toward you (`windup` s), then a wave runs down it at `speed` t/s for
    // `damage` and a shove; phase 2: `lanes` lanes, `spread` rad apart.
    surge: { every: [8, 6], windup: 1.2, length: 14, width: 2.2, speed: 12, damage: 20, knock: 9, lanes: [1, 2], spread: 0.45 },
    // blast: a steam ring round itself when you hug it.
    blast: { range: 2.6, windup: 0.8, radius: 2.6, damage: 12, knock: 8, cooldown: 3 },
  },
  collapsed_residential: {
    key: 'pack_lord', name: 'Pack Lord', sprite: 'feral_chief', kind: 'pack_lord', radius: 0.45,
    intro: 'A feral chief and its pack. Its war cry makes them faster.',
    // pack: Ferals with it; cry: every `every` s a ring of `radius` (`windup` s): Ferals inside move × `speed` for
    // `time` s; phase 2 also calls `summon2` more (while fewer than `max` live) and the Lord itself is × speed2 faster.
    pack: 4, packType: 'feral',
    cry: { every: [10, 7], windup: 0.8, radius: 8, speed: 1.3, time: 5, summon2: 2, max: 6 },
    speed2: 1.2,
  },
};

/** The night danger of an area whose boss is dead (Run.threatFor): nothing joins the attack. */
export function clearedThreat(areaKey, areaName) {
  const b = BOSSES[areaKey];
  return {
    cleared: true,
    short: `None: you killed the ${b?.name || 'boss'}`,
    text: `The ${b?.name || 'boss'} is dead: ${areaName || 'this area'} sends no danger tonight.`,
  };
}

// Later-day creatures (critic J M5 part 1): gated by night in JungleScene._chunkPop.
//   bloater (night `fromNight`+): per chunk, `chance` × the area weight of one Bloater, away from the Relay.
//   chief (night `fromNight`+): one Feral of every camp is a Feral Chief; Ferals within `aura` tiles of a living
//     chief move × `speed`.
export const DAY_CREATURES = {
  bloater: {
    fromNight: 4, chance: 0.3,
    districts: { canopy_greenhouse: 1.8, overgrown_market: 1.1, flooded_transit: 1, collapsed_residential: 0.8, data_center: 0.7 },
  },
  chief: { fromNight: 5, aura: 8, speed: 1.2 },
};

// Derived sprites (src/core/PaletteSwap.js, made at load from an existing sheet): `from` key, recoloured like
// PALETTE_SWAP (hue `bands` → `ramp` by brightness rank). npc_engineer: the player in a hi-vis orange coat
// (8-way walk for the escort); feral_chief: the Feral in a blood-red cloak with gold trim (Feral Chief, Pack Lord).
export const DERIVED_SPRITES = {
  npc_engineer: {
    from: 'player',
    bands: [[52, 118]], minS: 0.18,
    ramp: ['#3b1f0e', '#7a3a12', '#c2601a', '#f08a24', '#ffc36a'],
  },
  feral_chief: {
    from: 'feral',
    bands: [[52, 118]], minS: 0.2,
    dark: { bands: [[150, 240]], maxV: 0.4, minS: 0.15 },
    ramp: ['#1e0606', '#4a0c0c', '#8a1414', '#c42a1a', '#f0c040'],
  },
};
