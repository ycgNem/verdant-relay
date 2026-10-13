// Tower definitions. `upgrades[0]` takes a tower to level 2, `upgrades[1]` to level 3.
// Each upgrade's `set` is merged over the stats, so later levels inherit earlier changes.
//
// kind:  bullet  homing shot at one target
//        chain   instant arc that jumps between enemies
//        mortar  slow lobbed shell that explodes at a ground point
//        snare   pulses a slow on everything in range
//        support buffs nearby towers, no direct damage
// damageType feeds enemy resistances (Ruin Guard shields resist kinetic).

export const TOWERS = {
  scrap_turret: {
    name: 'Scrap Turret',
    desc: 'General-purpose single-target damage.',
    cost: { scrap: 45 },
    kind: 'bullet', damageType: 'kinetic', target: 'first',
    range: 4.5, damage: 10, cooldown: 0.7, projSpeed: 14,
    upgrades: [
      { cost: { scrap: 40 }, desc: 'Fire rate +40%.', set: { cooldown: 0.5 } },
      { cost: { scrap: 60, circuits: 1 }, desc: 'Every 5th shot deals triple damage.', set: { fifthShotMult: 3 } },
    ],
  },
  thorn_nest: {
    name: 'Thorn Nest',
    desc: 'Cheap, short range, rapid low damage.',
    cost: { scrap: 35, biofiber: 1 },
    kind: 'bullet', damageType: 'kinetic', target: 'closest',
    range: 3.0, damage: 4, cooldown: 0.22, projSpeed: 16,
    upgrades: [
      { cost: { scrap: 30, biofiber: 1 }, desc: 'Thorns slow the target briefly.', set: { slowOnHit: 0.75, slowTime: 0.8 } },
      { cost: { scrap: 45, biofiber: 2 }, desc: 'Slow splashes to nearby enemies.', set: { slowRadius: 1.2 } },
    ],
  },
  arc_spire: {
    name: 'Arc Spire',
    desc: 'Lightning that chains between groups.',
    cost: { scrap: 35, circuits: 2 },
    kind: 'chain', damageType: 'energy', target: 'first',
    range: 4.0, damage: 14, cooldown: 1.2, chains: 2, chainRange: 2.4, chainFalloff: 0.65,
    upgrades: [
      { cost: { scrap: 35, circuits: 1 }, desc: 'Chains to one more enemy.', set: { chains: 3 } },
      { cost: { scrap: 50, circuits: 2 }, desc: 'Chained enemies are briefly slowed.', set: { chainSlow: 0.5, slowTime: 0.6 } },
    ],
  },
  mortar_pod: {
    name: 'Mortar Pod',
    desc: 'Long-range splash. Strong vs clusters, weak vs fast enemies.',
    cost: { scrap: 60, biofiber: 1 },
    kind: 'mortar', damageType: 'blast', target: 'strongest',
    range: 7.0, minRange: 1.5, damage: 22, cooldown: 2.6, flightTime: 1.1, blastRadius: 1.3,
    locked: 'mortar_pod',
    upgrades: [
      { cost: { scrap: 50, biofiber: 1 }, desc: 'Blast radius +40%.', set: { blastRadius: 1.8 } },
      { cost: { scrap: 70, biofiber: 2 }, desc: 'Leaves burning sap for 2.5s.', set: { burnDps: 8, burnTime: 2.5 } },
    ],
  },
  snare_vine: {
    name: 'Snare Vine',
    desc: 'Slows everything in range. Almost no damage.',
    cost: { scrap: 30, biofiber: 1 },
    kind: 'snare', damageType: 'nature', target: 'first',
    range: 2.8, damage: 1, cooldown: 1.5, slowMult: 0.6, slowTime: 1.6,
    upgrades: [
      { cost: { scrap: 30, biofiber: 1 }, desc: 'Stronger slow.', set: { slowMult: 0.45 } },
      { cost: { scrap: 45, biofiber: 2 }, desc: 'Roots non-boss enemies for 0.8s (once per 4s per enemy).', set: { rootTime: 0.8, rootCooldown: 4 } },
    ],
  },
  pulse_beacon: {
    name: 'Pulse Beacon',
    desc: 'Support. Nearby towers attack faster.',
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
