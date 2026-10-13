// Tower definitions. `upgrades[0]` takes a tower to level 2, `upgrades[1]` to level 3.
// Each upgrade's `set` is merged over the stats, so later levels inherit earlier changes.
//
// kind:  bullet  homing shot at one target (can't hit burrowed enemies)
//        chain   instant arc that jumps between enemies
//        mortar  slow lobbed shell that explodes at a ground point
//        snare   pulses a slow on everything in range
//        support buffs nearby towers, no direct damage
// damageType feeds enemy resistances (Ruin Guard shields resist kinetic; Seed Carriers only stay
// whole when the killing blow is 'blast').
//
// Optional per-kind fields:
//   bullet  projSpeed, proj (look), fifthShotMult, slowOnHit + slowTime, slowRadius
//   chain   chains (extra jumps after the first target), chainRange, chainFalloff, chainSlow + slowTime
//   mortar  minRange, flightTime, blastRadius, blastEdge (damage fraction at the blast edge), burnDps + burnTime
//   snare   slowMult + slowTime, rootTime + rootCooldown (per enemy)
//   support buffRate (attack speed bonus), bonusAttackChance
// role / icon are for the build menu.

export const TOWERS = {
  scrap_turret: {
    name: 'Scrap Turret',
    role: 'Single target',
    desc: 'General-purpose single-target damage.',
    icon: { glyph: '⦿', color: '#c0cbdc' },
    cost: { scrap: 45 },
    kind: 'bullet', damageType: 'kinetic', target: 'first', proj: 'bullet',
    range: 4.5, damage: 10, cooldown: 0.7, projSpeed: 14,
    upgrades: [
      { cost: { scrap: 40 }, desc: 'Fire rate +40%.', set: { cooldown: 0.5 } },
      { cost: { scrap: 60, circuits: 1 }, desc: 'Every 5th shot deals triple damage.', set: { fifthShotMult: 3, damage: 12 } },
    ],
  },
  thorn_nest: {
    name: 'Thorn Nest',
    role: 'Short, rapid',
    desc: 'Cheap, short range, rapid low damage. Shreds fast enemies.',
    icon: { glyph: '✶', color: '#63c74d' },
    cost: { scrap: 35, biofiber: 1 },
    kind: 'bullet', damageType: 'kinetic', target: 'closest', proj: 'thorn',
    range: 3.0, damage: 4, cooldown: 0.24, projSpeed: 16,
    upgrades: [
      { cost: { scrap: 30, biofiber: 1 }, desc: 'Thorns slow the target briefly.', set: { slowOnHit: 0.75, slowTime: 0.8 } },
      { cost: { scrap: 45, biofiber: 2 }, desc: 'Slow splashes to nearby enemies; thorns hit harder.', set: { slowRadius: 1.2, damage: 5 } },
    ],
  },
  arc_spire: {
    name: 'Arc Spire',
    role: 'Chain lightning',
    desc: 'Lightning that chains between groups. Hits burrowed enemies.',
    icon: { glyph: 'ϟ', color: '#2ce8f5' },
    cost: { scrap: 35, circuits: 2 },
    kind: 'chain', damageType: 'energy', target: 'first',
    range: 4.0, damage: 14, cooldown: 1.2, chains: 2, chainRange: 2.4, chainFalloff: 0.7,
    upgrades: [
      { cost: { scrap: 35, circuits: 1 }, desc: 'Chains to one more enemy.', set: { chains: 3, damage: 16 } },
      { cost: { scrap: 50, circuits: 2 }, desc: 'Chained enemies are briefly slowed.', set: { chainSlow: 0.5, slowTime: 0.6, damage: 18 } },
    ],
  },
  mortar_pod: {
    name: 'Mortar Pod',
    role: 'Long-range splash',
    desc: 'Lobbed seed shells. Strong vs clusters and Seed Carriers, weak vs fast enemies.',
    icon: { glyph: '◉', color: '#feae34' },
    cost: { scrap: 60, biofiber: 1 },
    kind: 'mortar', damageType: 'blast', target: 'strongest',
    range: 7.0, minRange: 1.5, damage: 24, cooldown: 2.6, flightTime: 1.1, blastRadius: 1.3, blastEdge: 0.6,
    locked: 'mortar_pod',
    upgrades: [
      { cost: { scrap: 50, biofiber: 1 }, desc: 'Blast radius +40%.', set: { blastRadius: 1.8 } },
      { cost: { scrap: 70, biofiber: 2 }, desc: 'Leaves burning sap for 2.5s.', set: { burnDps: 9, burnTime: 2.5 } },
    ],
  },
  snare_vine: {
    name: 'Snare Vine',
    role: 'Area slow',
    desc: 'Slows everything in range, even burrowed enemies. Almost no damage.',
    icon: { glyph: '§', color: '#b55088' },
    cost: { scrap: 30, biofiber: 1 },
    kind: 'snare', damageType: 'nature', target: 'first',
    range: 2.8, damage: 1, cooldown: 1.5, slowMult: 0.6, slowTime: 1.6,
    upgrades: [
      { cost: { scrap: 30, biofiber: 1 }, desc: 'Stronger slow (40% → 55%).', set: { slowMult: 0.45 } },
      { cost: { scrap: 45, biofiber: 2 }, desc: 'Roots non-boss enemies for 0.8s (once per 4s per enemy).', set: { rootTime: 0.8, rootCooldown: 4 } },
    ],
  },
  pulse_beacon: {
    name: 'Pulse Beacon',
    role: 'Support',
    desc: 'Nearby towers attack faster. Deals no damage.',
    icon: { glyph: '◈', color: '#fee761' },
    cost: { scrap: 50, circuits: 2 },
    kind: 'support', damageType: 'none', target: 'none',
    range: 2.6, damage: 0, cooldown: 0, buffRate: 0.2,
    locked: 'pulse_beacon',
    upgrades: [
      { cost: { scrap: 40, circuits: 1 }, desc: 'Attack speed bonus 20% → 35%.', set: { buffRate: 0.35 } },
      { cost: { scrap: 60, circuits: 2 }, desc: 'Buffed towers get a 15% bonus-attack chance.', set: { bonusAttackChance: 0.15 } },
    ],
  },
};

export const TOWER_ORDER = ['scrap_turret', 'thorn_nest', 'arc_spire', 'snare_vine', 'mortar_pod', 'pulse_beacon'];
export const TARGET_RULES = ['first', 'closest', 'strongest'];
export const TARGET_RULE_TEXT = {
  first: 'Closest to the Relay',
  closest: 'Nearest to this tower',
  strongest: 'Most health',
};
