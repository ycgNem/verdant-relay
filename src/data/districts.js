// Districts: where the day expedition happens. Each one biases loot, picks its room types and
// enemies, and adds one readable threat to that night's wave (`nightThreat`).

export const DISTRICTS = {
  overgrown_market: {
    name: 'Overgrown Market',
    env: 'Tight stalls, collapsed awnings, ambushes in the aisles.',
    enemyNote: 'Bramble Crawlers, ambushes at caches',
    bonusText: 'Scrap ×1.3',
    loot: { scrap: 1.3, circuits: 1, biofiber: 1, intel: 1, med: 1 },
    rooms: ['street', 'shop', 'courtyard', 'shop'],
    enemies: { crawler: 5, skitter: 2, scav: 1 },
    ambushChance: 0.35,
    // look: floor/alt/wall colours + procedural texture patterns used until tile sprites exist (src/world/TileWorld.js)
    look: { floor: '#5a6988', floorAlt: '#3e8948', wall: '#3a4466', fog: '#22312d', sun: '#ffe9c4',
      pattern: 'paving', altPattern: 'moss', wallPattern: 'concrete', moss: '#3e8948', canopy: '#265c42' },
    nightThreat: { text: 'Market swarm: an extra Crawler group joins tonight.', extraGroup: { type: 'crawler', count: 6 } },
  },
  flooded_transit: {
    name: 'Flooded Transit Station',
    env: 'Drowned platforms and pump rooms. Long sightlines, ranged threats.',
    enemyNote: 'Spitters and Rival Scavengers',
    bonusText: 'Circuits ×2',
    loot: { scrap: 1, circuits: 2, biofiber: 0.8, intel: 1, med: 1 },
    rooms: ['platform', 'flooded', 'utility', 'platform'],
    enemies: { spitter: 3, scav: 3, crawler: 2 },
    // look: floor/alt/wall colours + procedural texture patterns used until tile sprites exist (src/world/TileWorld.js)
    look: { floor: '#3a4466', floorAlt: '#124e89', wall: '#262b44', fog: '#14243a', sun: '#c8e6ff',
      pattern: 'tiles', altPattern: 'puddle', wallPattern: 'tiles', moss: '#265c42', canopy: '#193c3e' },
    nightThreat: { text: 'Tunnels opened: Burrowers join tonight.', extraGroup: { type: 'burrower', count: 4 } },
  },
  canopy_greenhouse: {
    name: 'Canopy Greenhouse',
    env: 'Dense vegetation, spore hazards, plant-based enemies.',
    enemyNote: 'Crawlers, Spitters, spore patches',
    bonusText: 'Biofiber ×2',
    loot: { scrap: 0.9, circuits: 0.8, biofiber: 2, intel: 1, med: 1 },
    rooms: ['greenhouse', 'courtyard', 'greenhouse', 'street'],
    enemies: { crawler: 4, spitter: 3, skitter: 2 },
    // look: floor/alt/wall colours + procedural texture patterns used until tile sprites exist (src/world/TileWorld.js)
    look: { floor: '#265c42', floorAlt: '#3e8948', wall: '#193c3e', fog: '#16301f', sun: '#e9ffc4',
      pattern: 'grass', altPattern: 'leaves', wallPattern: 'brick', moss: '#63c74d', canopy: '#265c42' },
    nightThreat: { text: 'Pollen-drunk: enemies move 15% faster tonight.', enemySpeed: 1.15 },
  },
  collapsed_residential: {
    name: 'Collapsed Residential Block',
    env: 'Many small rooms and side caches. Rival scavengers everywhere.',
    enemyNote: 'Rival Scavengers, Skitters',
    bonusText: 'More med kits and caches',
    loot: { scrap: 1, circuits: 1, biofiber: 1, intel: 1, med: 2.5 },
    rooms: ['residential', 'residential', 'street', 'courtyard'],
    enemies: { scav: 4, skitter: 3, crawler: 2 },
    extraContainers: 2,
    // look: floor/alt/wall colours + procedural texture patterns used until tile sprites exist (src/world/TileWorld.js)
    look: { floor: '#733e39', floorAlt: '#5a6988', wall: '#3e2731', fog: '#2a1d1d', sun: '#ffe0c4',
      pattern: 'boards', altPattern: 'concrete', wallPattern: 'brick', moss: '#3e8948', canopy: '#265c42' },
    nightThreat: { text: 'You were followed: an extra Skitter pack joins tonight.', extraGroup: { type: 'skitter', count: 8 } },
  },
  data_center: {
    name: 'Municipal Data Center',
    env: 'Security lasers and server halls. Dangerous, valuable.',
    enemyNote: 'Razorbacks, Rival Scavengers, alarms',
    bonusText: 'Intel ×2, Circuits ×1.5',
    loot: { scrap: 1, circuits: 1.5, biofiber: 0.7, intel: 2, med: 1 },
    rooms: ['security', 'utility', 'shop', 'security'],
    enemies: { scav: 3, razorback: 2, skitter: 2 },
    alarms: true,
    minNight: 2,
    // look: floor/alt/wall colours + procedural texture patterns used until tile sprites exist (src/world/TileWorld.js)
    look: { floor: '#8b9bb4', floorAlt: '#3a4466', wall: '#262b44', fog: '#141826', sun: '#d8e4ff',
      pattern: 'panels', altPattern: 'grate', wallPattern: 'panel', moss: '#265c42', canopy: '#193c3e' },
    nightThreat: { text: 'Security logs traced you: a Razorback joins tonight.', extraGroup: { type: 'razorback', count: 1 } },
  },
};

export const DISTRICT_KEYS = Object.keys(DISTRICTS);
