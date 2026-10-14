// Research tree (critic J M8): permanent unlocks bought with Research Data, in three branches.
// Unlocks add OPTIONS, never raw power: new towers and night abilities, starting kits that trade one thing for
// another, and more choices before and between trips. The tree costs ~2,500 Research in all (a lost run earns
// ~60–150, a win ~300), so it lasts ~10–12 runs.
//
// Node fields:
//   branch     'blueprints' | 'field' | 'relay' (BRANCHES)
//   tier, col  grid position inside its branch (tier 1 = top row; col 0–2)
//   req        keys that must all be owned before this one can be bought (drawn as lines in the Collection)
//   cost       Research Data (null = not for sale: `victoryReward`)
//   short      the name on the tree card; `name` / `desc` = the detail line (plain words)
//   icon       { key } a sprite / visual key, or { glyph, color }
//   kit        a starting kit: { res } added to (negative: taken from) the starting resources. One owned kit is
//              chosen in the Collection (meta.startKit) and applied by Run.create.
//   available  false = hidden and not for sale yet (a tower still being built): flip it when the tower lands,
//              and give the tower `locked: '<this key>'` in src/data/towers.js.
//   Numbers a node's effect reads (price, refund, n…) sit on the node; Run.js / the scenes read them.
// Keys are saved in meta.unlocks: never rename them (old saves keep what they bought). 'scattergun' is the Parang.

export const BRANCHES = [
  { key: 'blueprints', name: 'Blueprints', color: '#feae34', line: 'Towers and night abilities' },
  { key: 'field', name: 'Field Gear', color: '#63c74d', line: 'What you carry into the jungle' },
  { key: 'relay', name: 'Relay', color: '#2ce8f5', line: 'More choices before and between trips' },
];

export const RESEARCH_TREE = {
  // ------------------------------------------------------------ Blueprints (the night)
  mortar_pod: {
    branch: 'blueprints', tier: 1, col: 0, cost: 80, icon: { key: 'mortar_pod' },
    short: 'Mortar Pod', name: 'Blueprint: Mortar Pod',
    desc: 'Adds the Mortar Pod to the build list: long-range shells that hit a whole group.',
  },
  protocol_arc: {
    branch: 'blueprints', tier: 1, col: 2, cost: 100, icon: { key: 'icon_arc', glyph: 'ϟ', color: '#2ce8f5' },
    short: 'Arc Discharge', name: 'Protocol: Arc Discharge',
    desc: 'A new night ability: click a spot and lightning strikes everything there (costs a Circuit and some Scrap each time).',
  },
  pulse_beacon: {
    branch: 'blueprints', tier: 2, col: 0, cost: 120, req: ['mortar_pod'], icon: { key: 'pulse_beacon' },
    short: 'Pulse Beacon', name: 'Blueprint: Pulse Beacon',
    desc: 'Adds the Pulse Beacon: a support tower that makes the towers around it shoot faster.',
  },
  salvage_logic: {
    branch: 'blueprints', tier: 2, col: 1, cost: 70, icon: { key: 'icon_salvage', glyph: '⟲', color: '#c0cbdc' }, refund: 0.9,
    short: 'Salvage Logic', name: 'Salvage Logic',
    desc: 'Selling a tower gives back 90% of its Scrap instead of 70%, so moving your defense costs little.',
  },
  protocol_flare: {
    branch: 'blueprints', tier: 2, col: 2, cost: 150, req: ['protocol_arc'], icon: { key: 'icon_flare', glyph: '✹', color: '#feae34' },
    short: 'Flare', name: 'Protocol: Flare',
    desc: 'A new night ability: light an area so tunnelling enemies can be shot and towers there hit harder (costs 1 Intel).',
  },
  // Towers still being built (critic J M8): hidden until `available` is flipped.
  sap_cannon: {
    branch: 'blueprints', tier: 3, col: 0, cost: 150, req: ['pulse_beacon'], available: false, icon: { key: 'icon_sap_cannon', glyph: '◍', color: '#99e550' },
    short: 'Sap Cannon', name: 'Blueprint: Sap Cannon',
    desc: 'Adds the Sap Cannon: burning sap that is strong against Seed Carriers.',
  },
  lure_totem: {
    branch: 'blueprints', tier: 3, col: 1, cost: 140, req: ['salvage_logic'], available: false, icon: { key: 'icon_lure_totem', glyph: '♁', color: '#feae34' },
    short: 'Lure Totem', name: 'Blueprint: Lure Totem',
    desc: 'Adds the Lure Totem: a decoy that makes passing enemies stop for a moment.',
  },
  bramble_wall: {
    branch: 'blueprints', tier: 3, col: 2, cost: 160, req: ['protocol_flare'], available: false, icon: { key: 'icon_bramble_wall', glyph: '♣', color: '#b55088' },
    short: 'Bramble Wall', name: 'Blueprint: Bramble Wall',
    desc: 'Adds the Bramble Wall: a pad that makes enemies take a detour.',
  },

  // ------------------------------------------------------------ Field Gear (the day)
  field_kit: {
    branch: 'field', tier: 1, col: 0, cost: 55, icon: { key: 'pick_med' },
    short: 'Field Kit', name: 'Field Kit',
    desc: 'Start each run carrying one med kit.',
  },
  scattergun: {
    branch: 'field', tier: 1, col: 1, cost: 90, icon: { key: 'icon_parang', glyph: '⁘', color: '#c0cbdc' },
    short: 'Parang', name: 'Starting Blade: Parang',
    desc: 'A heavier blade to start runs with: slower swings, harder hits, cuts brambles with any swing (choose it below).',
  },
  stockpile: {
    branch: 'field', tier: 1, col: 2, cost: 60, icon: { key: 'pick_scrap' },
    short: 'Stockpile', name: 'Hidden Stockpile',
    desc: 'Start each run with +20 Scrap.',
  },
  field_dressing: {
    branch: 'field', tier: 2, col: 0, cost: 65, req: ['field_kit'], icon: { key: 'pick_med' }, price: { scrap: 15 },
    short: 'Field Dressing', name: 'Field Dressing',
    desc: 'Buy med kits at the morning briefing, 15 Scrap each (you can carry 2).',
  },
  cartographer: {
    branch: 'field', tier: 2, col: 1, cost: 70, icon: { key: 'icon_map', glyph: '⌖', color: '#ead4aa' }, radius: 42,
    short: 'Survey Map', name: 'Survey Map',
    desc: 'Each run starts with the land around the Relay (about 40 m out) already on your map.',
  },
  kit_engineer: {
    branch: 'field', tier: 2, col: 2, cost: 70, req: ['stockpile'], icon: { key: 'pick_circuits' }, kit: { res: { circuits: 2, scrap: -15 } },
    short: 'Engineer Kit', name: "Starting Kit: Engineer's",
    desc: 'A starting kit to choose: 2 more Circuits, 15 less Scrap.',
  },
  beacon_codes: {
    branch: 'field', tier: 3, col: 0, cost: 140, req: ['field_dressing'], icon: { key: 'icon_beacon', glyph: '⊚', color: '#2ce8f5' },
    short: 'Beacon Codes', name: 'Beacon Codes',
    desc: "On each run's first trip, the beacon in the area you pick is already switched on: a way home from day 1.",
  },
  kit_botanist: {
    branch: 'field', tier: 3, col: 2, cost: 75, req: ['kit_engineer'], icon: { key: 'pick_biofiber' }, kit: { res: { biofiber: 2, scrap: -15 } },
    short: 'Botanist Kit', name: "Starting Kit: Botanist's",
    desc: 'A starting kit to choose: 2 more Biofiber, 15 less Scrap.',
  },
  kit_spy: {
    branch: 'field', tier: 4, col: 2, cost: 85, req: ['kit_botanist'], icon: { key: 'pick_intel' }, kit: { res: { intel: 3, scrap: -15 } },
    short: 'Spy Kit', name: "Starting Kit: Spy's",
    desc: 'A starting kit to choose: 3 Intel, 15 less Scrap.',
  },

  // ------------------------------------------------------------ Relay (planning)
  second_look: {
    branch: 'relay', tier: 1, col: 0, cost: 80, icon: { key: 'icon_swap', glyph: '⇄', color: '#2ce8f5' },
    short: 'Second Look', name: 'Second Look',
    desc: 'Once a night, swap the areas the briefing offers for different ones.',
  },
  field_notes: {
    branch: 'relay', tier: 1, col: 2, cost: 90, icon: { key: 'icon_notes', glyph: '✎', color: '#feae34' }, extra: 2,
    short: 'Field Notes', name: 'Field Notes',
    desc: 'The first skill pick of each run shows 2 more cards.',
  },
  scout_report: {
    branch: 'relay', tier: 2, col: 0, cost: 150, req: ['second_look'], icon: { key: 'icon_scout', glyph: '◫', color: '#2ce8f5' }, areas: 3,
    short: 'Scout Report', name: 'Scout Report',
    desc: 'The briefing offers 3 areas to choose from instead of 2.',
  },
  skill_reroll: {
    branch: 'relay', tier: 2, col: 2, cost: 110, req: ['field_notes'], icon: { key: 'icon_reroll', glyph: '↻', color: '#63c74d' },
    short: 'Fresh Ideas', name: 'Fresh Ideas',
    desc: 'Once a night, re-roll the skill cards you are offered.',
  },
  archivist: {
    branch: 'relay', tier: 3, col: 0, cost: 200, req: ['scout_report'], icon: { key: 'icon_archivist', glyph: '◈', color: '#fee761' }, mult: 1.1,
    short: 'Archivist', name: 'Archivist',
    desc: '+10% Research from everything you do (it speeds up the rest of this tree).',
  },
  verdant_scarf: {
    branch: 'relay', tier: 3, col: 1, cost: null, victoryReward: true, icon: { key: 'icon_scarf', glyph: '❦', color: '#63c74d' },
    short: 'Verdant Scarf', name: 'Cosmetic: Verdant Scarf',
    desc: 'A green scarf for your scavenger. Earned by winning a run.',
  },
  wide_choice: {
    branch: 'relay', tier: 3, col: 2, cost: 160, req: ['skill_reroll'], icon: { key: 'icon_wide_choice', glyph: '✦', color: '#2ce8f5' },
    short: 'Wider Choice', name: 'Wider Choice',
    desc: 'Skill picks offer 4 cards instead of 3.',
  },
};

/** Old name (V1 unlock list): every node, hidden ones included. */
export const UNLOCKS = RESEARCH_TREE;
/** Nodes that exist in the game right now (hidden future towers left out). */
export const UNLOCK_KEYS = Object.keys(RESEARCH_TREE).filter((k) => RESEARCH_TREE[k].available !== false);
/** Starting kits (one is chosen per run). */
export const KIT_KEYS = UNLOCK_KEYS.filter((k) => RESEARCH_TREE[k].kit);

/** Does the player own this unlock? */
export const owns = (meta, k) => !!meta?.unlocks?.includes(k);

/** Prerequisites of a node that aren't owned yet (names). */
export function missingReqs(meta, k) {
  return (RESEARCH_TREE[k]?.req || []).filter((r) => !owns(meta, r)).map((r) => RESEARCH_TREE[r]?.short || r);
}

/**
 * A node's state for the tree: 'owned' | 'reward' (victory reward not earned) | 'locked' (prerequisites missing)
 * | 'open' (buyable now) | 'short' (prerequisites met, not enough Research).
 */
export function nodeStatus(meta, k) {
  const n = RESEARCH_TREE[k];
  if (owns(meta, k)) return 'owned';
  if (n.victoryReward || n.cost == null) return 'reward';
  if (missingReqs(meta, k).length) return 'locked';
  return (meta.research || 0) >= n.cost ? 'open' : 'short';
}

/** Buyable right now, cheapest first. */
export function affordableNodes(meta) {
  return UNLOCK_KEYS.filter((k) => nodeStatus(meta, k) === 'open').sort((a, b) => RESEARCH_TREE[a].cost - RESEARCH_TREE[b].cost);
}

/** The cheapest node whose prerequisites are met but which costs more than the player has (a goal to name). */
export function nextGoal(meta) {
  return UNLOCK_KEYS.filter((k) => nodeStatus(meta, k) === 'short').sort((a, b) => RESEARCH_TREE[a].cost - RESEARCH_TREE[b].cost)[0] || null;
}

/** "N/M" research progress (visible nodes, the victory cosmetic included). */
export function ownedCount(meta) {
  return UNLOCK_KEYS.filter((k) => owns(meta, k)).length;
}
