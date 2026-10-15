// Areas ("districts" in code): the five sectors of the jungle around the Relay. Picking one at the briefing
// decides three things, all shown on its card:
//   - today's goal is in that area (objectives.js), with its night reward;
//   - its FINDS apply to everything you loot that day, wherever you open it (`loot` multipliers, read by
//     Run.lootMults → JungleScene rollLoot): `finds` is the card's short line, `bonusText` the full sentence;
//   - its danger joins that night's attack (`nightThreat`: `short` on the briefing card, `text` everywhere else).
// `enemies` weights the creatures that roam that sector by day (JungleScene wildlife; `feral` = Feral Scavenger),
// `enemyNote` names them. `env` describes the place (only what is really there). `look` = card / codex colours.

export const DISTRICTS = {
  overgrown_market: {
    name: 'Overgrown Market',
    env: 'Collapsed market stalls and awnings under the canopy. Crawler country.',
    enemyNote: 'Bramble Crawlers, Skitters, a few Ferals',
    finds: '+30% Scrap',
    bonusText: 'Today: 30% more Scrap from every container you open.',
    loot: { scrap: 1.3, circuits: 1, biofiber: 1, intel: 1, med: 1 },
    enemies: { crawler: 5, skitter: 2, feral: 1 },
    look: { floor: '#5a6988', floorAlt: '#3e8948' },
    nightThreat: { short: 'Extra Crawlers attack tonight', text: 'Market swarm: an extra group of Crawlers attacks tonight.', extraGroup: { type: 'crawler', count: 6 } },
  },
  flooded_transit: {
    name: 'Flooded Transit Station',
    env: 'Drowned platforms and rail cars along the river. Spitters lob sap from the reeds.',
    enemyNote: 'Spitters, Ferals, Crawlers',
    finds: 'Twice the Circuits',
    bonusText: 'Today: twice the Circuits from every container (a little less Biofiber).',
    loot: { scrap: 1, circuits: 2, biofiber: 0.8, intel: 1, med: 1 },
    enemies: { spitter: 3, feral: 3, crawler: 2 },
    look: { floor: '#3a4466', floorAlt: '#124e89' },
    nightThreat: { short: 'Burrowers attack tonight (they tunnel under towers)', text: 'Tunnels opened: Burrowers attack tonight.', extraGroup: { type: 'burrower', count: 4 } },
  },
  canopy_greenhouse: {
    name: 'Canopy Greenhouse',
    env: 'The densest jungle, thick with spore pods that burst into choking clouds.',
    enemyNote: 'Crawlers, Spitters, Skitters, spore pods',
    finds: 'Twice the Biofiber',
    bonusText: 'Today: twice the Biofiber from every container (a little less Scrap and Circuits).',
    loot: { scrap: 0.9, circuits: 0.8, biofiber: 2, intel: 1, med: 1 },
    enemies: { crawler: 4, spitter: 3, skitter: 2 },
    look: { floor: '#265c42', floorAlt: '#3e8948' },
    nightThreat: { short: 'Enemies move 15% faster tonight', text: 'Pollen-drunk: enemies move 15% faster tonight.', enemySpeed: 1.15 },
  },
  collapsed_residential: {
    name: 'Collapsed Residential Block',
    env: 'Fallen apartment blocks and back yards. Feral camps and Skitter packs.',
    enemyNote: 'Ferals, Skitters, Crawlers',
    finds: 'More med kits',
    bonusText: 'Today: med kits turn up in containers 2.5 times as often.',
    loot: { scrap: 1, circuits: 1, biofiber: 1, intel: 1, med: 2.5 },
    enemies: { feral: 3, skitter: 3, crawler: 4 },   // (Stage 9 fix wave, critic O #1: Feral share 44% → 30%)
    look: { floor: '#733e39', floorAlt: '#5a6988' },
    nightThreat: { short: 'Extra Skitters attack tonight', text: 'You were followed: an extra pack of Skitters attacks tonight.', extraGroup: { type: 'skitter', count: 8 } },
  },
  data_center: {
    name: 'Municipal Data Center',
    env: 'Server halls swallowed by roots. Razorbacks root through the cable trenches.',
    enemyNote: 'Razorbacks, Ferals, Skitters',
    finds: 'Intel ×2, Circuits +50%',
    bonusText: 'Today: twice the Intel and 50% more Circuits from every container (less Biofiber).',
    loot: { scrap: 1, circuits: 1.5, biofiber: 0.7, intel: 2, med: 1 },
    enemies: { feral: 2, razorback: 2, skitter: 2, crawler: 1 },   // (Stage 9 fix wave: Feral share 43% → 29%)
    minNight: 2,
    look: { floor: '#8b9bb4', floorAlt: '#3a4466' },
    nightThreat: { short: 'A Razorback attacks tonight', text: 'Security logs traced you: a Razorback attacks tonight.', extraGroup: { type: 'razorback', count: 1 } },
  },
};

export const DISTRICT_KEYS = Object.keys(DISTRICTS);

// Area offers (Run.districtChoices): a seeded weighted draw that avoids repeats. An area's weight is × lastNight
// if it was offered last night, × earlier for each other earlier night it was offered, and × visited once you
// have been there (new places first). Critic J: 74% of runs used to offer one area on 4+ of 6 nights; now ~3%
// (2,000-run sim: .playwright-mcp/runsys/sim_offers.mjs).
export const AREA_OFFERS = { lastNight: 0.08, earlier: 0.3, visited: 0.8 };
