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
//   hp × CONFIG.expedition.byNight.eliteHp (× a boss's own `hpK`) · aggro: the fight starts when YOU come within
//     `aggro` tiles of its lair spot (the ☠: you stepped into its clearing) or hit it / its pack — never because it
//     wandered toward you (critic J2 §4: the Pack Lord engaged at a goal 20 tiles out). Out of a fight the Pack Lord and
//     its pack hold the lair (they ignore you, noise and each other's alarms).
//   phase2: health share at which it roars (`roar` s, taking `roarTaken` damage) and turns to its second phase (tint2, faster, nastier moves)
//   arena: brush cleared round a stationary boss · hurtFrame: s its hurt frame shows after a blow
//   camPull: while the fight is on and the boss is within camRange tiles, the camera moves this share of the way
//   from you toward it (so it stays in view)
// Per boss (BOSSES[area]): name, sprite (strip: idle 0–3, attack 4–5, hurt 6, dead 7), kind (its behaviour), radius
// (hit / collision radius in tiles), `intro` (the line under its name when the fight starts), then its moves. A
// value [a, b] is [phase 1, phase 2]. Every move is telegraphed (rings, lines, lanes) and every hit can be rolled.
//   The fight is a PATTERN (critic I2 #2), not moves on independent cooldowns: `pattern[phase]` is the move order
//   (looped; '?' = one move drawn from `wild[phase]`), `gap[phase]` s of recovery after each move. Its big move
//   (`punish.after`) ends in an OPENING: `punish.time` s in which it is spent (no moves, the bar turns yellow and
//   says `label`) and takes × `punish.mult` damage. Each stationary boss has a ring round itself whose radius is at
//   least its radius + 2.2 (the chop's reach), so no spot near it is safe; and a ranged move (lobs, mortar, vents,
//   beam) so no spot far off is either. Minions (brood, drones, the pack) drop nothing and feed no kill-heals (critic
//   I2 #4), and are capped per fight (`cap`).
//   clearProps: containers (crates, chests, terminals), relic strongboxes and data logs move out of `radius` tiles of
//   a lair to `to` [min, max] tiles from it (JungleGen.clearLairProps; critic I2 #5): nothing to snag on mid-fight, and
//   (critic J2 §4) looting them never wakes the boss: `to[0]` ≥ aggro + 3.5 (the open radius + a boss spot off the
//   site centre). (Landmark shrines stay by their ruin: no collider.) Wild spore pods inside `radius` are dropped.
//   siteGap: goal, bonus-task and event sites within this many tiles of a living boss's lair are picked last
//   (JungleScene._sitesIn).
//   One fight at a time (critic H2 §5.2): lairs are at least aggro + leash + lairGap tiles apart (JungleGen bossLairs);
//   while one boss is engaged no other can start; the Pack Lord, out of a fight, never roams past `tether` tiles of
//   its lair. introTime: s the name banner shows [later fights, the day's first (with the reward line)]; killTime:
//   s the "KILLED" banner shows (its rewards line fades in after TEXT_LANE.banner.extraDelay, src/data/hud.js).
export const BOSS = {
  fromNight: 3,
  hp: 600,
  aggro: 6.5,
  leash: 20,
  leashTime: 4,
  lairGap: 8.5,     // (aggro + leash + lairGap = 35, as before the J2 wake change: the lairs stay where they were)
  siteGap: 16,
  tether: 9,
  introTime: [2.6, 3.8],
  killTime: 3.8,
  phase2: 0.5,
  roar: 1.4,
  roarTaken: 0.3,
  arena: 3.2,
  hurtFrame: 0.14,
  camPull: 0.45,
  camRange: 16,
  clearProps: { radius: 10, to: [10, 12.5] },
  tint2: '#ffb0a0',
  // Phase 2 reads beyond the _p2 sheet (critic H2 §2.1): a particle aura by kind, `rate` puffs a second within
  // `spread` tiles of it — [color, color2, up (tiles/s), gravity, life, size (texels)].
  aura2: {
    rate: 9, spread: 1.1,
    thorn_mother: ['#c9d65a', '#7f9a3c', 1.4, -0.6, 1.1, 2],     // spores drifting up
    brood_hive: ['#feae34', '#b55088', 2.2, -0.4, 0.8, 1],       // embers from the fire mouth
    warden: ['#ff6a3d', '#fee761', 3.2, 4, 0.45, 1],             // sparks
    drowned_engine: ['#e8f0f4', '#9fb8c8', 2.4, -1.4, 1.0, 3],   // steam
    pack_lord: ['#f0c040', '#a22633', 1.6, 1, 0.6, 1],           // a war-paint glint
  },
  // The Pack Lord's presence (critic H2 §2.3): its lair brush is cleared `clear` tiles round it (no x-ray silhouette
  // fight), it is drawn at a whole ×`scale`, and it stands on a gold ring `ring` (colour, radius in tiles).
  packLord: { clear: 4, scale: 2, ring: ['#f0c040', 0.85] },
  barColor: '#e43b44',
  reward: { research: 30, relic: 'R', fallback: { scrap: 30, circuits: 2, biofiber: 2 } },
};

export const BOSSES = {
  canopy_greenhouse: {
    key: 'thorn_mother', name: 'Thorn Mother', sprite: 'boss_thorn_mother', kind: 'thorn_mother', radius: 1.25,
    intro: 'Vines lash, spores rain. After a barrage she wilts: hit her then.',
    // whip: a vine lane `range` long and `width` wide toward you (`fan` lanes, `spread` rad apart), `windup` s.
    // Deflectable: a parried whip staggers her (punish.parry).
    whip: { range: 5.4, width: 0.9, windup: 0.7, damage: 14, knock: 7, fan: [1, 3], spread: 0.5 },
    // thorns: a ring of thorns round her (`radius` reaches the chop's range), `windup` s.
    thorns: { radius: 3.5, windup: 0.9, damage: 12, knock: 7 },
    // barrage: she rears back for `tell` s, then lobs `count` pods (the first where you're heading: `lead` × your velocity × fuse; the rest `near`–
    // `spread` tiles round it), landing after `fuse` s. The first `clouds` are CLOUD pods: their ring is the cloud's
    // own size (SPORES.radius) and they leave a cloud for `cloudLife` s (at most `maxClouds` of hers at once). The
    // rest are HIT pods: a red ring of `radius` for `damage`.
    barrage: { tell: 0.35, count: [3, 4], clouds: [1, 1], maxClouds: [1, 2], cloudLife: 3.5, lead: 0.5, near: 1.4, spread: 3.2, fuse: 1.15, radius: 1.0, damage: 10 },
    // brood (phase 2): `n` Crawlers per call (at most `max` alive, `cap` in the whole fight).
    brood: { type: 'crawler', n: 2, max: 2, cap: 6 },
    // The fight: per phase, the move order ('?' = one of `wild`), `gap` s of recovery after each move.
    pattern: [['whip', '?', 'whip', 'barrage'], ['whip', 'thorns', '?', 'barrage', 'whip', 'thorns', 'brood', 'barrage']],
    wild: [['thorns', 'whip'], ['whip', 'thorns']],
    gap: [0.9, 0.6],
    // punish: after `after` moves it is spent for `time` s and takes × `mult` damage (a parried whip: `parry` s).
    punish: { after: ['barrage'], time: 2.2, mult: 1.5, parry: 1.2, label: 'Wilted', fx: ['#a8ca58', '#4b8139'], up: 0.6, gravity: 3 },
  },
  overgrown_market: {
    key: 'brood_hive', name: 'Brood Hive', sprite: 'boss_brood_hive', kind: 'brood_hive', radius: 1.45,
    intro: 'Its brood shields it. Cull them, dodge the burst, then hit the split shell.',
    // spawn: the `brood` move releases `n` Crawlers (at most `max` alive, `cap` in the whole fight; `at2` at phase 2).
    spawn: { type: 'crawler', n: [2, 2], max: [3, 3], cap: 12, at2: 2 },
    // shield: each living brood creature takes `per` off the damage the hive takes (at most `max`).
    shield: { per: 0.15, max: 0.6 },
    // burst: an egg burst round the hive (ring `radius` reaches the chop's range, `windup` s): `damage`, shoves you
    // out; phase 2 hatches `hatch2.n` Skitters (within the cap).
    burst: { radius: 3.7, windup: 1.1, damage: 16, knock: 8, hatch2: { type: 'skitter', n: 2 } },
    // eggs: `n` egg sacs lobbed at and round you (ring `radius`, `fuse` s, `damage`); phase 2 each hatches a `hatch`.
    eggs: { n: [2, 3], fuse: 0.95, radius: 0.9, damage: 8, hatch: 'skitter' },
    pattern: [['brood', 'eggs', '?', 'burst'], ['brood', 'eggs', 'burst', 'eggs', '?', 'burst']],
    wild: [['eggs', 'burst'], ['eggs', 'brood']],
    gap: [1.0, 0.7],
    punish: { after: ['burst'], time: 2.6, mult: 1.5, label: 'Split open', fx: ['#ff4d8d', '#ead4aa'], up: 1.2, gravity: 3 },
  },
  data_center: {
    key: 'warden', name: 'Security Warden', sprite: 'boss_warden', kind: 'warden', radius: 1.0,
    intro: 'Strikes, stomps and a sweeping laser. After the laser it overheats: hit it then.',
    // laser: a `warn` s aiming line, then the beam sweeps `sweep`° at `speed`°/s, `length` tiles long; the beam hits
    // for `damage` (a roll's i-frames pass through it). Phase 2: `beams` beams at once, opposite each other.
    laser: { warn: 0.85, sweep: 150, speed: 85, length: 9.5, width: 0.45, damage: 16, beams: [1, 2], color: '#ff2e2e', core: '#ffe0d0' },
    // stomp: a shockwave ring round it (`radius` reaches the chop's range), `windup` s.
    stomp: { radius: 3.4, windup: 0.75, damage: 14, knock: 7 },
    // mortar: `n` strike rings (the first where you're heading, the rest `near`–`spread` round it, `stagger` s apart),
    // each blowing `fuse` s later: no range is safe.
    mortar: { n: [2, 3], radius: 1.2, fuse: 1.0, damage: 12, lead: 0.5, near: 1.5, spread: 3.5, stagger: 0.15 },
    // drones (phase 2): `n` steel-blue Skitters (at most `max` alive, `cap` in the whole fight).
    drones: { type: 'skitter', n: 2, max: 3, cap: 6, tint: '#9fc4e0' },
    pattern: [['mortar', '?', 'stomp', 'laser'], ['stomp', 'mortar', 'laser', '?', 'stomp', 'laser']],
    wild: [['stomp', 'mortar'], ['mortar', 'drones']],
    gap: [0.9, 0.65],
    punish: { after: ['laser'], time: 2.4, mult: 1.5, label: 'Overheated', fx: ['#feae34', '#e8f0f4'], up: 3, gravity: -1 },
  },
  flooded_transit: {
    key: 'drowned_engine', name: 'Drowned Engine', sprite: 'boss_drowned_engine', kind: 'drowned_engine', radius: 1.35,
    intro: 'Vents, steam blasts and a rolling surge. After the surge it vents: hit it then.',
    // vents: `n` steam rings (one under you, the rest within `spread`), `windup` s, then `damage`.
    vents: { n: [3, 4], spread: 4, radius: 1.2, windup: 1.0, damage: 12 },
    // surge: a water lane `length` × `width` toward you (`windup` s), then a wave runs down it at `speed` t/s for
    // `damage` and a shove; phase 2: `lanes` lanes, `spread` rad apart.
    surge: { windup: 1.2, length: 14, width: 2.2, speed: 12, damage: 18, knock: 9, lanes: [1, 2], spread: 0.45 },
    // blast: a steam ring round itself (`radius` reaches the chop's range), `windup` s.
    blast: { radius: 3.6, windup: 0.8, damage: 12, knock: 8 },
    pattern: [['vents', 'blast', '?', 'surge'], ['vents', 'blast', 'surge', '?', 'vents', 'surge']],
    wild: [['vents', 'blast'], ['blast', 'vents']],
    gap: [0.9, 0.65],
    punish: { after: ['surge'], time: 2.4, mult: 1.5, label: 'Venting', fx: ['#e8f0f4', '#9fb8c8'], up: 4, gravity: -1.5 },
  },
  collapsed_residential: {
    key: 'pack_lord', name: 'Pack Lord', sprite: 'feral_chief', kind: 'pack_lord', radius: 0.45,
    intro: 'A feral chief and its pack. After its war cry it is winded: hit it then.',
    // pack: Ferals with it at the start; cry: every `every` s it stands and howls (`windup` s, a ring of `radius`):
    // Ferals inside move × `speed` for `time` s, then it is winded (punish). Phase 2 also calls `summon2` more (while
    // fewer than `max` live, `cap` in the whole fight) and the Lord itself is × speed2 faster.
    // hpK: × BOSS.hp (it brings a pack: a shorter fight); thrust2: its double-thrust chance per lunge; windup:
    // its lunge wind-up (s; a boss-readable beat: an elite Feral's is 0.8); damageK: × its lunge damage.
    hpK: 0.75, thrust2: 0.35, windup: 1.0, damageK: 0.85,
    pack: 2, packType: 'feral',
    cry: { every: [9, 7], windup: 0.9, radius: 6, speed: 1.3, time: 5, summon2: 1, max: 4, cap: 3 },
    speed2: 1.2,
    // rend: within `range` tiles, every `every` s it plants its feet (`windup` s, a red ring of `radius`: past the chop's
    // reach) and spins: `damage`, a shove. A masher eats every one.
    rend: { every: [4, 3.2], range: 2.2, windup: 0.9, radius: 2.7, damage: 15, knock: 7 },
    punish: { time: 1.8, mult: 1.5, label: 'Winded' },
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
