// Tower definitions. `upgrades[0]` takes a tower to level 2; `upgrades[1]` is the level-3 BRANCH point:
// `{ branches: { a: {...}, b: {...} } }`, two ways to finish the tower (critic K #2). Each upgrade's or
// branch's `set` is merged over the stats, so later levels inherit earlier changes. A saved tower records
// its branch in `rec.branch` ('a' | 'b'; older saves without one count as 'a').
// Branch fields: name, line (a few plain words for the half-width button), detail (the full sentence, its
// tooltip), cost, set, and its own sprite key
// `${type}_3a` / `${type}_3b` (falls back to `${type}_3`, then `${type}`).
//
// Upgrade economics (Stage 7): level 2 is a good buy (≈ +70% damage per second for ≈ 0.9× the build cost),
// level 3 a choice of role (≈ 1.2× the build cost + components); a new tower still adds coverage, which
// upgrades never do, and each tower of a type you own adds CONFIG.towerSurcharge Scrap to the next one.
// Tall vs wide (balance sim, night 4, 3 maps × 3 variants): 11 towers with five at level 2 (639 Scrap) lose ~18,
// six level-3 towers (710 Scrap) ~14 (with level 2 at 0.6× and a 12 surcharge the gap was 25–35 HP).
//
// kind:  bullet  homing shot at one target (can't hit burrowed enemies unless a Flare lights them)
//        chain   instant arc that jumps between enemies
//        mortar  slow lobbed shell that explodes at a ground point
//        snare   pulses a slow on everything in range
//        support buffs nearby towers, no direct damage
// damageType feeds enemy resistances (Ruin Guard shields resist kinetic) and the Seed Carrier's blast tag.
//
// Optional per-kind fields:
//   bullet  projSpeed, proj (look), fifthShotMult, slowOnHit + slowTime, slowRadius,
//           pierce (ignores resistances), bigBonus (damage × this vs enemies of size ≥ bigSize)
//   chain   chains (extra jumps after the first target), chainRange, chainFalloff, chainSlow + slowTime,
//           stun (seconds, non-boss, on the first target)
//   mortar  minRange, flightTime, blastRadius, blastEdge (damage fraction at the blast edge), burnDps + burnTime,
//           bomblets (count) + bombletDamage + bombletSpread (tiles)
//   snare   slowMult + slowTime, rootTime + rootCooldown (per enemy), bigRoot (root time for size ≥ bigSize,
//           which normal roots skip), damage per pulse (Thorn Field)
//   support buffRate (attack speed bonus), bonusAttackChance, buffDamage (damage bonus), buffRange (range bonus)
// role / icon are for the build menu. `line` is the build card's one plain sentence and `pips` its 1–3
// strength bars (src/data/guide.js PIPS: Power / Slow / Boost / Speed / Range — a tower shows the rows it has);
// the exact numbers sit in the card's tooltip.

export const BIG_SIZE = 1.0;   // enemies this size or larger count as "big" (Razorback, Ruin Guard, Colossus)

export const TOWERS = {
  scrap_turret: {
    name: 'Scrap Turret',
    role: 'Single target',
    line: 'Shoots one enemy at a time. A solid all-rounder.',
    pips: { damage: 2, speed: 2, range: 2 },
    desc: 'General-purpose single-target damage.',
    icon: { glyph: '⦿', color: '#c0cbdc' },
    cost: { scrap: 45 },
    kind: 'bullet', damageType: 'kinetic', target: 'first', proj: 'bullet',
    range: 4.5, damage: 10, cooldown: 0.7, projSpeed: 14,
    upgrades: [
      { cost: { scrap: 40 }, desc: 'Fires much faster and hits harder (+70% damage per second).', set: { cooldown: 0.5, damage: 12 } },
      { branches: {
        a: { name: 'Piercer', line: 'Pierces shields. +50% on tanks.', detail: 'Heavy rounds that ignore shields and hit big enemies 50% harder.',
          cost: { scrap: 55, circuits: 1 }, set: { damage: 24, cooldown: 0.62, pierce: true, bigBonus: 1.5, proj: 'crit' } },
        b: { name: 'Repeater', line: 'Rapid fire. Shreds swarms.', detail: 'A stream of light rounds: great against swarms.',
          cost: { scrap: 55, circuits: 1 }, set: { damage: 9, cooldown: 0.22 } },
      } },
    ],
  },
  thorn_nest: {
    name: 'Thorn Nest',
    role: 'Rapid',
    line: 'Sprays thorns up close. Great against fast enemies.',
    pips: { damage: 1, speed: 3, range: 1 },
    desc: 'Cheap, short range, rapid low damage. Shreds fast enemies.',
    icon: { glyph: '✶', color: '#63c74d' },
    cost: { scrap: 35, biofiber: 1 },
    kind: 'bullet', damageType: 'kinetic', target: 'closest', proj: 'thorn',
    range: 3.5, damage: 4, cooldown: 0.24, projSpeed: 16,
    upgrades: [
      { cost: { scrap: 32, biofiber: 1 }, desc: 'Thorns hit much harder and slow the target 30%.', set: { damage: 6.5, slowOnHit: 0.7, slowTime: 1.0 } },
      { branches: {
        a: { name: 'Briar', line: 'Slows 40%, and nearby foes too.', detail: 'Thorns slow by 40% and the slow splashes onto nearby enemies.',
          cost: { scrap: 50, biofiber: 2 }, set: { damage: 7, slowOnHit: 0.6, slowTime: 1.2, slowRadius: 1.6 } },
        b: { name: 'Hornet', line: 'Faster, harder thorns.', detail: 'Faster, harder thorns: the most damage up close.',
          cost: { scrap: 50, biofiber: 2 }, set: { damage: 8, cooldown: 0.18 } },
      } },
    ],
  },
  arc_spire: {
    name: 'Arc Spire',
    role: 'Chain',
    line: 'Lightning that jumps between enemies in a group.',
    pips: { damage: 2, speed: 1, range: 2 },
    desc: 'Lightning that chains between groups. Hits burrowed enemies.',
    icon: { glyph: 'ϟ', color: '#2ce8f5' },
    cost: { scrap: 35, circuits: 2 },
    kind: 'chain', damageType: 'energy', target: 'first',
    range: 4.0, damage: 11, cooldown: 1.2, chains: 2, chainRange: 2.4, chainFalloff: 0.6,
    upgrades: [
      { cost: { scrap: 34, circuits: 1 }, desc: 'Stronger bolts that jump to one more enemy.', set: { chains: 3, damage: 14, chainFalloff: 0.7, cooldown: 1.15 } },
      { branches: {
        a: { name: 'Storm', line: 'Jumps to 5 enemies.', detail: 'Jumps to 5 enemies and loses little power per jump.',
          cost: { scrap: 55, circuits: 2 }, set: { chains: 5, chainFalloff: 0.8, damage: 18, cooldown: 1.1 } },
        b: { name: 'Lance', line: 'One huge bolt that stuns.', detail: 'One huge bolt that stuns its target for a moment (not bosses).',
          cost: { scrap: 55, circuits: 2 }, set: { chains: 0, damage: 55, cooldown: 1.2, stun: 0.25 } },
      } },
    ],
  },
  mortar_pod: {
    name: 'Mortar Pod',
    role: 'Splash',
    line: 'Lobs shells far away that hit a whole group.',
    pips: { damage: 2, speed: 1, range: 3 },
    desc: 'Lobbed seed shells. Strong vs clusters and Seed Carriers, weak vs fast enemies.',
    icon: { glyph: '◉', color: '#feae34' },
    cost: { scrap: 60, biofiber: 1 },
    kind: 'mortar', damageType: 'blast', target: 'strongest',
    range: 7.0, minRange: 1.5, damage: 28, cooldown: 1.9, flightTime: 1.1, blastRadius: 1.3, blastEdge: 0.6,
    locked: 'mortar_pod',
    upgrades: [
      { cost: { scrap: 52, biofiber: 1 }, desc: 'Bigger, harder blasts.', set: { blastRadius: 1.8, damage: 36 } },
      { branches: {
        a: { name: 'Napalm', line: 'Leaves burning sap.', detail: 'Shells leave burning sap that keeps hurting (and still counts as a blast).',
          cost: { scrap: 65, biofiber: 2 }, set: { burnDps: 12, burnTime: 2.5 } },
        b: { name: 'Cluster', line: 'Scatters 3 bomblets.', detail: 'Each shell scatters 3 bomblets over a wider area.',
          cost: { scrap: 65, biofiber: 2 }, set: { bomblets: 3, bombletDamage: 16, bombletSpread: 1.0 } },
      } },
    ],
  },
  snare_vine: {
    name: 'Snare Vine',
    role: 'Slow',
    line: 'Slows every enemy near it, so other towers hit more.',
    pips: { slow: 2, speed: 1, range: 1 },
    desc: 'Slows everything in range, even burrowed enemies, and the slow lingers after they leave. Almost no damage.',
    icon: { glyph: '§', color: '#b55088' },
    cost: { scrap: 30, biofiber: 1 },
    kind: 'snare', damageType: 'nature', target: 'first',
    range: 3.3, damage: 2, cooldown: 1.2, slowMult: 0.55, slowTime: 2.6,
    upgrades: [
      { cost: { scrap: 28, biofiber: 1 }, desc: 'Stronger slow (45% → 60%), more range.', set: { slowMult: 0.4, range: 3.7 } },
      { branches: {
        a: { name: 'Root', line: 'Roots enemies in place.', detail: 'Roots enemies in place for 0.8 s (big ones 0.5 s), once every 4 s each.',
          cost: { scrap: 50, biofiber: 2 }, set: { rootTime: 0.8, rootCooldown: 4, bigRoot: 0.5 } },
        b: { name: 'Thorn Field', line: 'Barbed: hurts all in range.', detail: 'Its vines are barbed: 12 damage a pulse to everything in range.',
          cost: { scrap: 50, biofiber: 2 }, set: { damage: 12 } },
      } },
    ],
  },
  pulse_beacon: {
    name: 'Pulse Totem',   // (not "beacon": that is the jungle's switch-on pylons, critic J2 C6; the key stays)
    role: 'Support',
    line: 'Makes the towers around it shoot faster.',
    pips: { boost: 2, range: 2 },
    desc: 'Nearby towers attack faster. Deals no damage.',
    icon: { glyph: '◈', color: '#fee761' },
    cost: { scrap: 50, circuits: 2 },
    kind: 'support', damageType: 'none', target: 'none',
    range: 4.5, damage: 0, cooldown: 0, buffRate: 0.2,
    locked: 'pulse_beacon',
    upgrades: [
      { cost: { scrap: 44, circuits: 1 }, desc: 'Attack speed bonus 20% → 35%.', set: { buffRate: 0.35 } },
      { branches: {
        a: { name: 'Overdrive', line: 'Even faster, bonus attacks.', detail: 'Boosted towers attack 40% faster, with a 15% chance of a bonus attack.',
          cost: { scrap: 60, circuits: 2 }, set: { bonusAttackChance: 0.15, buffRate: 0.4 } },
        b: { name: 'Spotter', line: '+15% damage, +10% range.', detail: 'Boosted towers also deal 15% more damage and reach 10% further.',
          cost: { scrap: 60, circuits: 2 }, set: { buffDamage: 0.15, buffRange: 0.1 } },
      } },
    ],
  },
};

export const TOWER_ORDER = ['scrap_turret', 'thorn_nest', 'arc_spire', 'snare_vine', 'mortar_pod', 'pulse_beacon'];
export const BRANCH_KEYS = ['a', 'b'];

/** The level-3 branch definition a tower record uses (null below level 3 or for towers without branches). */
export function branchOf(rec) {
  const up = TOWERS[rec.type]?.upgrades?.[1];
  if (!up?.branches || rec.level < 3) return null;
  return up.branches[rec.branch] || up.branches.a;
}

// Rule keys are saved with each tower, so they stay stable; the labels are what players see.
export const TARGET_RULES = ['first', 'closest', 'strongest'];
export const TARGET_RULE_LABEL = {
  first: 'First in line',
  closest: 'Closest',
  strongest: 'Toughest',
};
export const TARGET_RULE_TEXT = {
  first: 'First in line: the enemy furthest along its path (closest to the Relay).',
  closest: 'Closest: the enemy nearest to this tower.',
  strongest: 'Toughest: the enemy with the most health left (bosses, tanks).',
};
