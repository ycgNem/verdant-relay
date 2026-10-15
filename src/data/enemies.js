// Defense-mode enemies. They walk lane waypoints toward the Relay Core.
// speed is tiles/sec. bounty is a small scrap drop; exploration stays the main income. Bounties may be
// fractional: the scene pays whole Scrap as the fractions add up (halved in balance round 3, when
// bounties had grown to ~70 Scrap a night).
// coreDamage is dealt once when the enemy reaches the core (it is then removed). With coreDamageMin
// (boss) the damage scales from coreDamageMin at 0 health left to coreDamage at full health.
// note: one line shown in the wave preview / first-sighting toast. color: icon colour in the UI.
// counter: what beats it, said under the readiness check when it is the weakest path's top leaker (Stage 9 round 2).
// gap: default seconds between spawns when the enemy arrives as an extra (district threat) group.
// slowResist: fraction of every slow that is ignored. rootImmune: snare roots don't apply (the Vine Snare
// protocol still holds a boss for its bossRoot time). size ≥ BIG_SIZE (towers.js) = "big": Piercer bonus,
// Snare Root's short bigRoot.
// Stage 7 (critic K #4): tanks leak for less (Razorback 12 → 9, Ruin Guard 15 → 10, Guard HP 230 → 190); the
// Seed Carrier's seeds are destroyed by any blast hit in its last `blastTag` seconds (not only a blast kill);
// the Colossus besieges the Relay instead of walking into it (`siege`).

export const DEFENSE_ENEMIES = {
  crawler: {
    name: 'Bramble Crawler', role: 'Basic', hp: 38, speed: 1.5, coreDamage: 5, bounty: 0.5, size: 0.7,
    note: 'Steady and numerous.', color: '#3e8948', gap: 1.1,
    counter: 'Crawlers come in numbers: more towers covering that path.',
  },
  skitter: {
    name: 'Skitter', role: 'Fast', hp: 18, speed: 3.0, coreDamage: 3, bounty: 0.5, size: 0.5,
    note: 'Very fast and fragile. Slows and rapid fire stop it.', color: '#b55088', gap: 0.5,
    counter: 'Skitters are fast: a Snare Vine or rapid fire stops them.',
  },
  razorback: {
    name: 'Razorback', role: 'Tank', hp: 180, speed: 0.9, coreDamage: 9, bounty: 1.5, size: 1.0,
    note: 'Slow, armoured, very high health. Hits the Relay hard.', color: '#b86f50', gap: 3,
    counter: 'Razorbacks are tanks: upgrade towers, or slow them with a Snare Vine.',
  },
  spitter: {
    name: 'Spitter', role: 'Ranged', hp: 52, speed: 1.3, coreDamage: 4, bounty: 1, size: 0.75,
    note: 'Stops near the Relay and lobs sap at it (up to 8 globs) until killed. Cover the Relay.', color: '#ff4d8d', gap: 2.2,
    counter: 'Spitters stop near the Relay to spit: a tower there must reach them.',
    // Stops once it is this close to the core (tiles), then lobs sap after a visible wind-up.
    // After `shots` globs its sap sac is empty and it withers away (no bounty).
    spit: { range: 5.5, windup: 0.9, every: 3.4, damage: 2, flight: 0.8, shots: 8 },
  },
  burrower: {
    name: 'Burrower', role: 'Ambusher', hp: 58, speed: 1.6, coreDamage: 6, bounty: 1, size: 0.7,
    note: 'Tunnels under part of its route. Bullet towers can\'t hit it there; arcs, mortars and snares can.', color: '#e4a672', gap: 1.4,
    counter: 'Bullets can\'t hit Burrowers underground: use an Arc Spire or a Snare Vine (or a beacon\'s light).',
    // needs: tower kinds that answer it; when a path brings it and none of these covers that path, prep warns first.
    needs: ['chain', 'mortar', 'snare'], uncovered: 'only Arc Spires and Snare Vines reach them underground, and none covers that path',
    // Underground for this fraction of its route: bullet towers can't target it there.
    burrow: [0.2, 0.55],
  },
  seed_carrier: {
    name: 'Seed Carrier', role: 'Swarm', hp: 70, speed: 1.2, coreDamage: 6, bounty: 1, size: 0.85,
    note: 'Bursts into 3 Seedlings when it dies, unless a blast (Mortar) hit it in its last 3 seconds.', color: '#feae34', gap: 2,
    counter: 'Seed Carriers burst into Seedlings: a Mortar hit stops it, or more towers near the Relay.',
    // Bursts into seedlings on death unless a hit of `unlessDamageType` landed within its last `blastTag` s.
    onDeath: { spawn: 'seedling', count: 3, unlessDamageType: 'blast', blastTag: 3 },
  },
  seedling: {
    name: 'Seedling', role: 'Swarm', hp: 10, speed: 2.0, coreDamage: 1, bounty: 0, size: 0.35,
    note: 'Tiny sprouts from a Seed Carrier.', color: '#63c74d', gap: 0.3,
  },
  ruin_guard: {
    name: 'Ruin Guard', role: 'Elite', hp: 190, speed: 1.0, coreDamage: 10, bounty: 2, size: 1.05,
    note: 'Its shield halves kinetic damage (Turrets, Thorns). Use arcs, mortars or Piercer turrets.', color: '#0099db', gap: 4,
    counter: 'Ruin Guard shields halve Turret and Thorn damage: use Arc Spires.',
    needs: ['chain', 'mortar'], uncovered: 'their shields halve Turret and Thorn damage, and no Arc Spire covers that path',
    resist: { kinetic: 0.5 },   // shield halves kinetic damage
  },
  colossus: {
    name: 'Canopy Colossus', role: 'Boss', hp: 1020, speed: 0.55, coreDamage: 40, coreDamageMin: 15, bounty: 0, size: 2.2, boss: true,
    note: 'Boss. Walks, roots itself to spawn a Crawler, then winds up and charges (a Vine Snare cancels the charge). At 60% health it roars and enrages: it charges faster and Skitters sprout too. On the plaza it stops and slams the Relay (6 damage every 3 s, 7 slams at most) until it is killed.', color: '#ff0044', gap: 1,
    slowResist: 0.5, rootImmune: true,
    // Phase loop: approach -> rooted (telegraph, then spawns crawlers) -> charge (wind-up, then fast).
    // rootSpawn crawlers appear when it roots; the charge covers speed × chargeMult × charge tiles.
    // firstApproach: the first walk is longer, so its first root happens on the field, in tower range.
    phases: {
      approach: 8, firstApproach: 14, rootTelegraph: 1.2, rooted: 2.5, rootSpawn: 1, rootSpawnType: 'crawler', rootRadius: 1.8,
      chargeWindup: 1.4, charge: 2.2, chargeMult: 2.6,
    },
    // Second act: at `at` of its health it stops and roars (telegraphed: a red ring, toast, shake),
    // then turns red and loops faster: shorter approach, a longer, faster charge, and every root also
    // spawns a Skitter pack. `phases` override the normal loop values while enraged.
    enrage: {
      at: 0.6, roar: 1.8, tint: '#ff8a7a', packType: 'skitter', packCount: 3,
      // It takes damageTaken × damage while enraged (roarTaken during the roar beat).
      damageTaken: 1.0, roarTaken: 0.3,
      phases: { approach: 4.5, rootSpawn: 1, chargeWindup: 1.2, charge: 2.6, chargeMult: 3.0 },
    },
    // The finale (critic K #3): `stopAt` tiles before the end of its lane it stops on the plaza and slams the
    // Relay — a `windup` s ring telegraph, then `damage` — every `every` s until it is killed. After
    // `maxSlams` it collapses, spent (the night ends without a kill). No leak, no 15–40 damage walk-in.
    siege: { stopAt: 2.5, every: 3, windup: 0.8, damage: 6, maxSlams: 7 },   // (5 → 8, critic K2 #5; Stage 9 round 2, critic R: 8 × 8 slams
    // cost a near-fixed ~60 Relay HP whatever the build, so 6 × 7: a build that kills it sooner pays less)
  },
};

// Exploration enemies (day). Shared looks with the defense roster where it makes sense.
// attack: melee = lunge after a wind-up; ranged = aimed shot after a telegraph line; charge = straight rush.
//   detect: sight range (tiles, needs line of sight) · reach: distance at which a melee lunge starts
//   lunge: lunge travel (tiles) over lungeTime s · range: ranged attack distance · keepAway: backs off inside this
//   shot: 'bolt' (fast tracer) | 'glob' (slow sap blob) · chargeSpeed × chargeTime = charge lane length
//   size: collision radius ≈ size × 0.45 · drop: chance of a small loot drop · burst: death particle colours
// brush: 'through' = slips through undergrowth (ambushes from the thickets) · 'crash' = bulldozes it
// (clears the tiles it charges/walks through) · absent = needs open ground or cut paths, like you.
// lobOverBrush: its line of sight ignores undergrowth (only walls, trees and ruins block it): the Spitter's sap arcs over.
// Melee lunges (critic I #1): the landing ring tracks you for the first `track` of the wind-up, aimed ahead of where
// you're walking by `lead` × the time from the lock to the lunge arriving (≈0.3–0.4 s: an intercept, so walking past
// or circling a pack isn't safe), then locks (turn after the lock, or roll); the creature creeps in at `creep` × its
// speed while it tracks. HP breakpoints (critic I #12): a light slash (13) kills a Skitter on nights 1–3, two kill a
// Crawler through night 3.
//   cue: s of a chitter before the wind-up (the Skitter flanks from your back arc: you hear it first)
//   bleed: s of bleeding a bite leaves (STATUS.bleed) · podTrigger: walking near a spore pod sets it off
//   thrust2: the Feral's double thrust (chance per lunge from `fromNight`): a second, shorter lunge after `delay` s
//     at × `damage` · spear: the Feral's throw when it can see you but can't reach you (stuck `attackers.stuck` s,
//     or you're > `brushDist` tiles off in the brush): line telegraph `width` wide for `windup` s (it tracks you,
//     `lead` × the time to impact ahead of where you're walking, until `lock` of the wind-up is left), then a spear
//     at `speed` tiles/s for up to `range` tiles (never closer than `min`), `damage` (× night enemyDamage), `cooldown` s.
//     It needs no attack token; one Feral spear at a time.
//   elite (Razorback): `reaim` — after its charge it re-aims and charges again; `stomp` — up close it rears
//     (ring `radius` for `windup` s) and stamps for `damage`, shoving you `knock` tiles/s, every `cooldown` s.
// Thorn Stalker (critic I §9D, 'ambush', night 3+ in fern-heavy chunks, POP.stalker): travels *under* the brush
// (only rustling shows), surfaces under you — a `ring`-tile ring for `windup` s — for `damage` plus a `root` s grip
// (a roll breaks it), then stays out `exposed` s (the only time you can hit it) and burrows back in `burrow` s.
// Art: its own derived sheet `thorn_stalker` (batch 4: a red-violet Crawler with a bone-white thorn crest); without
// it, `fallback` = the old re-tinted Crawler. (`fallback` = { sprite, tint, pod… } used when `sprite` isn't loaded.)
// Stage 9 (skillful combat, POISE in config.js): every melee / charge attack has an aim phase (`track` of the
// wind-up: the telegraph follows you) and a committed phase that starts with a red flash — after it nothing you do
// with the blade stops it (only a deflect); roll or deflect. poise: the stagger (s) a hit needs to interrupt the aim
// phase (light slashes have none, the finisher 0.35, the chop 0.9) and to flinch it at all — under it a slash barely
// shoves it and it hits back (POISE.counter). recover: s it stands open after an attack that missed you (hits on it
// then deal × POISE.punish.mult); after one that landed it hops back instead. dart: the Skitter darts back out after its
// open beat. guard (Ferals): hit from the front twice within `window` s while it can't hit back, it raises its guard for
// `time` s (frontal slashes are blocked; a chop or a blow from the side / back breaks it: stunned `break` s), then
// thrusts out of it. HP / damage re-cut so a combo traded face-to-face doesn't kill a Feral but a punished one does.
export const EXPLORE_ENEMIES = {
  feral: {
    name: 'Feral Scavenger', hp: 66, speed: 2.7, detect: 8, attack: 'melee', damage: 17, windup: 0.8, cooldown: 1.3, reach: 1.7, lunge: 2.8, lungeTime: 0.24,
    track: 0.5, lead: 0.9, creep: 0.35, podTrigger: true, size: 0.8, drop: 0.55, burst: ['#a22633', '#3a4466'],
    poise: 0.5, recover: 0.8,
    guard: { hits: 2, window: 1.0, time: 0.8, break: 1.0, cooldown: 3.5, arc: 100 },
    // (fix wave, critic O #2: track 0.35 → 0.15 so it flashes ≥ 0.4 s before it lands, like the first; chance by night)
    thrust2: { chance: [0, 0.2, 0.3, 0.4], fromNight: 2, delay: 0.45, damage: 0.8, lunge: 2.0, track: 0.15 },
    spear: { windup: 0.9, width: 0.3, speed: 11, damage: 15, range: 7, min: 2.5, cooldown: 3.5, brushDist: 4, lead: 0.8, lock: 0.45 },
  },
  crawler: {
    // (fix wave, critic O #3: hp 34 → 56 so a face-traded combo (54) no longer kills one from night 3 and its counter-bite
    // lands; track 0.5 → 0.42: 0.45 s from its flash to the bite)
    name: 'Bramble Crawler', brush: 'through', hp: 56, speed: 2.4, detect: 7, attack: 'melee', damage: 11, windup: 0.7, cooldown: 1.2, reach: 1.5, lunge: 2.4, lungeTime: 0.24,
    track: 0.42, lead: 0.9, creep: 0.3, bleed: 3, podTrigger: true, size: 0.7, drop: 0.25, burst: ['#3e8948', '#63c74d'],
    poise: 0.3, recover: 0.7,
  },
  skitter: {
    name: 'Skitter', brush: 'through', hp: 16, speed: 4.2, detect: 8, attack: 'melee', damage: 8, windup: 0.5, cooldown: 0.9, reach: 1.5, lunge: 1.9, lungeTime: 0.16,
    track: 0.4, lead: 0.9, creep: 0, cue: 0.15, backArc: true, size: 0.5, drop: 0.15, burst: ['#b55088', '#68386c'],
    poise: 0, recover: 0.45, dart: true,
  },
  scav: { name: 'Rival Scavenger', hp: 36, speed: 2.2, detect: 9, attack: 'ranged', damage: 10, windup: 0.7, cooldown: 2.0, range: 7, shotSpeed: 9, shot: 'bolt', size: 0.8, drop: 0.5, keepAway: 4, burst: ['#a22633', '#3a4466'] },
  spitter: { name: 'Spitter', hp: 34, speed: 0, detect: 8, attack: 'ranged', damage: 10, windup: 0.8, cooldown: 2.2, range: 7.5, shotSpeed: 6.5, shot: 'glob', lobOverBrush: true, size: 0.75, drop: 0.3, burst: ['#b55088', '#ff0044'] },
  razorback: {
    name: 'Razorback', brush: 'crash', hp: 110, speed: 1.6, detect: 7, attack: 'charge', damage: 26, windup: 0.9, cooldown: 2.4, chargeSpeed: 9, chargeTime: 0.6, chargeRange: 6, stun: 1.2,
    podTrigger: true, size: 1.0, drop: 0.6, burst: ['#b86f50', '#e4a672'],
    poise: 1.0, recover: 1.0,
    elite: { reaim: 0.55, stomp: { windup: 0.8, radius: 1.6, damage: 16, range: 2.2, cooldown: 2.6, knock: 6 } },
  },
  stalker: {
    name: 'Thorn Stalker', brush: 'under', hp: 40, speed: 3.2, detect: 8, attack: 'ambush', damage: 16, windup: 0.7, cooldown: 2.6, reach: 1.6,
    ring: 1.0, root: 0.6, exposed: 1.5, burrow: 0.35, size: 0.7, drop: 0.45, sprite: 'thorn_stalker', fallback: { sprite: 'crawler', tint: '#e0906c' },
    burst: ['#8c4026', '#c23a3a'],
  },
  // Later-day creatures (critic J M5, src/entities/DayCreatures.js; gating in src/data/bosses.js DAY_CREATURES).
  // Bloater (night 4+): a swollen, spore-yellow Crawler with a pod on its back. It walks at you and, `reach` away,
  // swells (a ring as wide as the spore cloud, `windup` s) and bursts: `damage` in the ring plus a spore cloud.
  // It bursts when it dies too: a heavy chop launches it `launch` tiles along your swing first, the thrown machete
  // pops it where it stands — so kill it from range. Art: the derived `bloater` sheet (the spore sac is part of it —
// critic H2 §2.5: the overlaid pod drew as an occlusion silhouette); fallback a tinted Crawler + spore_pod × podScale.
  bloater: {
    name: 'Bloater', brush: 'through', hp: 50, speed: 1.7, detect: 7, attack: 'burst', damage: 10, windup: 0.9, cooldown: 1, reach: 1.6,
    launch: 3.5, launchTime: 0.45, size: 0.85, drop: 0.35, sprite: 'bloater',
    fallback: { sprite: 'crawler', tint: '#d0dc68', pod: 'spore_pod', podScale: 2, podY: 0.55 },
    burst: ['#c9d65a', '#7f9a3c'],
  },
};
// Feral Chief (night 5+, one per camp; the Pack Lord boss wears the same look): a tougher Feral in a red-and-gold
// cloak (DERIVED_SPRITES.feral_chief) whose aura speeds up the Ferals round it (DAY_CREATURES.chief).
EXPLORE_ENEMIES.feral_chief = { ...EXPLORE_ENEMIES.feral, name: 'Feral Chief', hp: 96, damage: 19, drop: 0.9, sprite: 'feral_chief', burst: ['#a22633', '#f0c040'] };
