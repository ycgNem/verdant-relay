// Run skills (Stage 7 skill rework, critic J §3 / M7): fewer, weightier picks that build an identity.
// Earned with skill points — one per trip (the goal, or a bonus task if the goal wasn't done) and one per area boss
// killed (CONFIG.expedition.maxSkillPoints caps the trip; boss points come on top) — so a run ends with ~6–8 skills.
// Lost at the end of the run.
//
// Four branches. Each has one KEYSTONE (`keystone: true`): a build-defining pick that is only offered once you own
// `SKILL_OFFERS.keystoneNeeds` skills of its branch. Offers lean toward branches you already own (Run.skillOptions).
//
// Fields:
//   branch, name, icon (a glyph), num (the card's short "icon + number" line), desc (one plain sentence or two)
//   req          another skill that must be owned first ("Builds on …")
//   needsUnlock  a research key that must be owned (Watchtower Network needs the Pulse Beacon blueprint)
//   night        shown in night prep's "Also tonight" list
//   blade        machete modifiers (stacked with the Workbench's machete upgrades by BLADE_STACK in crafting.js;
//                read by Player through Run.bladeMods() and src/entities/BladeKit.js)
//   tower        tower stat modifiers applied in Run.towerStats (same format as crafting.js TOWER_MODS[*].tower):
//                  kinds / types   only towers of these kinds (bullet chain mortar snare support) / types
//                  when            { relayBelow: frac } — only while the Relay is below this share of its health
//                  range / rate / damage   multipliers · mult {field: ×} · add {field: +} · min {field: at least}
//   other numbers are the tuning their effect reads (scrap, scrapMult, relayMax, heal, bountyMult, …).
//
// Effects are read by id wherever they apply (Run.hasSkill), so old ids keep working through SKILL_RENAMED.

export const SKILL_BRANCHES = ['Scavenger', 'Machete', 'Engineer', 'Warden'];

// Offer tuning: ownedShare = the chance each card comes from a branch you already own (when both kinds are on
// offer); keystoneNeeds = skills of a branch before its keystone can be offered; keystoneWeight = how much more
// often an open keystone turns up than a normal skill of the same group.
export const SKILL_OFFERS = { ownedShare: 0.6, keystoneNeeds: 2, keystoneWeight: 2.5 };

export const SKILLS = {
  // ---- Scavenger: more out of every trip
  pack_rat: {
    branch: 'Scavenger', name: 'Pack Rat', icon: '⚙', num: '+50% pickup reach · +10% Scrap',
    desc: 'Loot flies to you from 50% further away, and containers hold 10% more Scrap.',
  },
  // Field Medic absorbed Safe Hands: spore clouds (SPORES.safeHands in jungle.js) hurt half and don't drain stamina.
  field_medic: {
    branch: 'Scavenger', name: 'Field Medic', icon: '✚', num: '+1 med kit every trip',
    desc: 'Start every trip with an extra med kit. Spore clouds hurt half as much and no longer drain your stamina.',
  },
  quick_extraction: {
    branch: 'Scavenger', name: 'Quick Hands', icon: '⏱', num: '−25% hold time',
    desc: 'Heading home and goal tasks take 25% less time to hold E.',
  },
  lush_finds: {
    branch: 'Scavenger', name: 'Lush Finds', icon: '❦', num: '×2 Biofiber chance',
    desc: 'Containers hold Biofiber twice as often, and crates can hold some too.',
  },
  salvage_king: {
    branch: 'Scavenger', keystone: true, night: true, name: 'Salvage King', icon: '♛', num: '×2 night bounties · −15% container Scrap',
    desc: 'Creatures killed at night pay double Scrap. Containers in the jungle hold 15% less.',
    bountyMult: 2, containerScrap: 0.85,
  },

  // ---- Machete: new ways to fight (numbers: DEFLECT / WEAPONS in config.js)
  riposte_master: {
    branch: 'Machete', name: 'Riposte Master', icon: '⚔', num: 'deflect +0.06 s · riposte ×3',
    desc: 'Your deflect window is longer (0.14 → 0.20 s) and a riposte hits ×3 instead of ×2.5.',
    blade: { deflectWindow: 0.06, riposteMult: 3 },
  },
  second_wind: {
    branch: 'Machete', name: 'Second Wind', icon: '♥', num: '+3 health per kill',
    desc: 'Every creature you kill in the jungle heals you 3 health.',
    blade: { killHeal: 3 },
  },
  brush_dancer: {
    branch: 'Machete', name: 'Brush Dancer', icon: '❧', num: 'no fern slowdown · ½ cutting stamina',
    desc: 'Ferns no longer slow you (walking or rolling), and cutting plants costs half the stamina.',
    blade: { fernFree: 1, cutStamina: 0.5 },
  },
  cleaver: {
    branch: 'Machete', name: 'Cleaver', icon: '◣', num: 'chop clears 3 tiles',
    desc: 'Your heavy chop clears every plant in a 3-tile cone in front of you, brambles included.',
    blade: { chopCut: 3 },
  },
  hunter: {
    branch: 'Machete', name: 'Hunter', icon: '➶', num: 'throw returns 2× faster · hits twice',
    desc: 'Your thrown machete (F) flies back twice as fast and hits as hard on the way back.',
    blade: { throwReturn: 0.5, throwBackFull: 1 },
  },
  duelist: {
    branch: 'Machete', keystone: true, name: 'Duelist', icon: '✦', num: 'perfect dodge → riposte · +4 health',
    desc: 'A perfect dodge also sets up a riposte, and every riposte that lands heals you 4 health.',
    blade: { dodgeRiposte: 1, riposteHeal: 4 },
  },

  // ---- Engineer: better towers
  // Efficient Assembly absorbed Circuit Recovery (circuitBack: the chance a Circuit comes back on a build that uses them).
  efficient_assembly: {
    branch: 'Engineer', night: true, name: 'Efficient Assembly', icon: '⚒', num: '−10% tower Scrap',
    desc: 'Towers cost 10% less Scrap, and a tower that uses Circuits has a 1-in-4 chance to give one back.',
    scrapMult: 0.9, circuitBack: 0.25,
  },
  // Calibration merged Long Sightlines and Overclock.
  calibration: {
    branch: 'Engineer', night: true, name: 'Calibration', icon: '◎', num: '+10% range · +8% attack speed',
    desc: 'All towers reach 10% further and attack 8% faster.',
    tower: { range: 1.1, rate: 1.08 },
  },
  field_tuning: {
    branch: 'Engineer', night: true, name: 'Field Tuning', icon: '⚙', num: '−40% first upgrade',
    desc: 'The first tower upgrade each night costs 40% less Scrap.', scrapMult: 0.6,
  },
  emergency_patch: {
    branch: 'Engineer', night: true, name: 'Emergency Patch', icon: '✚', num: '+15 Relay health, once a night',
    desc: 'Once a night, repair 15 Relay health for free, even during an attack.', heal: 15,
  },
  chain_reaction: {
    branch: 'Engineer', keystone: true, night: true, name: 'Chain Reaction', icon: 'ϟ', num: 'Arc Spires +2 jumps · −20% damage',
    desc: 'Arc Spire lightning jumps to 2 more enemies, but every bolt deals 20% less.',
    tower: { kinds: ['chain'], add: { chains: 2 }, damage: 0.8 },
  },

  // ---- Warden: a tougher Relay, slower enemies
  reinforced_core: {
    branch: 'Warden', night: true, name: 'Reinforced Core', icon: '⛨', num: '+25 Relay max health',
    desc: 'The Relay gets 25 more max health (and is repaired by 25 now).', relayMax: 25,
  },
  prepared_defenses: {
    branch: 'Warden', night: true, name: 'Prepared Defenses', icon: '⚙', num: '+15 Scrap every night',
    desc: 'Gain 15 Scrap at the start of each night.', scrap: 15,
  },
  watchtower_network: {
    branch: 'Warden', night: true, name: 'Watchtower Network', icon: '◈', num: 'beacons ×1.5',
    desc: 'Pulse Beacon bonuses are 50% stronger.', needsUnlock: 'pulse_beacon',
    tower: { kinds: ['support'], mult: { buffRate: 1.5, bonusAttackChance: 1.5, buffDamage: 1.5 } },
  },
  last_stand: {
    branch: 'Warden', night: true, name: 'Last Stand', icon: '⚑', num: '+25% damage below 35% Relay',
    desc: 'While the Relay is below 35% health, towers deal 25% more damage.', req: 'reinforced_core',
    tower: { when: { relayBelow: 0.35 }, damage: 1.25 },
  },
  rapid_response: {
    branch: 'Warden', night: true, name: 'Rapid Response', icon: '❄', num: '−30% enemy speed for 8 s',
    desc: 'Enemies are slowed 30% for the first 8 seconds of every push.',
  },
  grove_warden: {
    branch: 'Warden', keystone: true, night: true, name: 'Grove Warden', icon: '§', num: 'Snares +6 damage · roots',
    desc: 'Snare Vines deal 6 more damage a pulse and root normal enemies for 0.6 s (once every 4 s each). Root vines hold 50% longer.',
    tower: { types: ['snare_vine'], add: { damage: 6 }, mult: { rootTime: 1.5, bigRoot: 1.5 }, min: { rootTime: 0.6, rootCooldown: 4 } },
  },
};
export const SKILL_KEYS = Object.keys(SKILLS);

// Skills removed by the rework → what an old save gets instead (null = the point is refunded). Run.hasSkill reads
// old ids through this too, so code that still asks for 'pack_rat_1' sees Pack Rat. Run.normalizeSkills maps a
// saved list (two old skills merged into one refund the extra point).
export const SKILL_RENAMED = {
  pack_rat_1: 'pack_rat',
  pack_rat_2: 'pack_rat',
  safe_hands: 'field_medic',
  circuit_recovery: 'efficient_assembly',
  long_sightlines: 'calibration',
  overclock: 'calibration',
  living_barricade: null,   // folded into Snare Vine's level 2 range
};

/** The current id for a skill id (old ids map through SKILL_RENAMED; null if it no longer exists). */
export function skillId(id) {
  if (Object.prototype.hasOwnProperty.call(SKILL_RENAMED, id)) return SKILL_RENAMED[id];
  return SKILLS[id] ? id : null;
}
