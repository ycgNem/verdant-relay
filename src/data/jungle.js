// Open-world jungle: generation and rendering tuning (src/world/JungleGen.js, JungleWorld.js, TerrainBaker.js).
// 1 unit = 1 tile = 32 texels. The world is one persistent square per run with the Relay at its centre.

export const LEVEL = { water: 0, mud: 1, dirt: 2, floor: 3, moss: 4 };
export const LEVEL_NAMES = ['water', 'mud', 'dirt', 'floor', 'moss'];

// Undergrowth per tile. 1 ferns: walkable (slow), rustles · 2 thicket: solid until cut (one slash) ·
// 3 bramble: solid, thorny; a slash only nicks it, a heavy chop clears it.
// Terrain kinds drawn from PixelLab art (public/terrain); the others use TerrainBaker's procedural textures.
export const TERRAIN_ART = ['floor', 'moss', 'paving'];

export const BRUSH = { none: 0, fern: 1, thicket: 2, bramble: 3 };

export const JUNGLE = {
  size: 192,                 // tiles per side
  chunk: 16,                 // tiles per render chunk (512 × 512 px ground texture)
  activeRadius: 1,           // chunks around the camera's chunk that are built and drawn (3 × 3)
  prebakeRadius: 2,          // chunks baked ahead of time (one per frame) so walking never hitches
  bakeCache: 40,             // baked chunk textures kept in memory

  relayClearing: 8.5,        // radius of the open clearing around the Relay (tiles)
  regionStart: 13,           // districts begin this far from the Relay
  regionNoise: 0.55,         // radians of wobble on the borders between district sectors

  rivers: 2,
  riverWidth: [1.4, 2.6],    // half-width of the water (tiles)
  bankWidth: 1.6,            // mud band beyond the water
  pondThreshold: 0.73,       // fBm above this → swamp ponds (flooded districts lower it, see REGION_LOOK)

  trailWidth: [0.9, 1.6],    // half-width of trails (tiles)
  trailWobble: 2.2,          // routing noise (higher = windier trails)
  extraTrailLinks: 0.35,     // extra links beyond the spanning tree (loops)

  // Undergrowth coverage. density = fBm + region bias; thresholds pick fern / thicket.
  brushFern: 0.36,
  brushThicket: 0.47,
  brambleNoise: 0.69,        // second noise above this turns thicket to bramble
  trailOvergrowth: [0.05, 0.55],   // chance a trail tile is overgrown, near → far from the Relay
  siteClear: 0.85,           // fraction of a site's radius kept clear

  treeSpacing: 2.6,          // jitter-grid step for tree candidates
  treeChance: 0.62,
  bigTreeChance: 0.14,

  sites: {
    major: 1, minor: [2, 3], camp: [1, 2], landmark: 1,   // per district region
    radius: { major: [6, 8], minor: [3.5, 5], camp: [3, 4], landmark: [3, 4], pylon: [2.5, 3] },
  },
  pylonsPerRegion: 1,
  containersPerSite: { major: [3, 5], minor: [1, 3], camp: [1, 2], landmark: [0, 1], pylon: [0, 1] },
  hiddenCaches: 70,          // lone containers scattered in the thick of the jungle
  containerWeights: { crate: 50, chest: 26, cache: 9, intel_terminal: 15 },
  hiddenWeights: { crate: 40, chest: 35, cache: 25 },

  explore: { cell: 2, revealRadius: 7 },   // map discovery grid (tiles per cell) and reveal radius
  regrowth: 0.18,            // share of cut tiles that grow back each night (never trails or clearings)
};

// The day: daylight, then dusk (darkness closes in, hunters roam), then night (hunters every few seconds).
// Extraction (Relay or an activated pylon) is open all day; the objective is what earns the boon.
export const DAY = {
  length: 330,               // seconds of daylight
  dusk: 70,                  // seconds from sunset to full dark
  huntEvery: [18, 9],        // seconds between hunter packs: at sunset → at full dark
  huntCount: [2, 3],         // hunters per pack (+1 from night 4)
  huntDist: [12, 17],        // spawn distance from the player (out of sight when possible)
  extractHold: 2.0,
  relayRadius: 3.2,          // stand this close to the Relay Core to return
  pylonRadius: 2.0,
  pylonHold: 2.5,
  pylonReveal: 22,           // activating a pylon maps this radius around it
  startOffset: [0, 3.2],     // where the day starts relative to the Relay Core
};

// Wildlife population per chunk (16 × 16 tiles), rolled per day. danger = 0 near the Relay → 1 far out.
export const POP = {
  safeRadius: 18,            // no wild spawns this close to the Relay
  base: 0.7, far: 2.4,       // expected enemies per chunk at danger 0 / 1
  byNight: [0.65, 0.8, 1, 1.12, 1.25, 1.4],
  targetRegion: 1.2,         // today's district is busier
  group: [1, 3],
  campSize: [2, 3],          // ferals at a camp (+1 from night 3)
  spawnRadius: 2,            // chunks around the player whose wildlife is live
  despawnDist: 46,           // tiles: un-alerted wildlife this far away goes back into the bush
  minSpawnDist: 11,          // never pop in closer than this to the player
  // District enemy tables use the v1 'scav' (gunner): in the jungle it is the melee Feral Scavenger.
  remap: { scav: 'feral' },
};

// Look and feel per district region: which ruins and props dress its sites, how much water, brush bias,
// tree mix. Keys match src/data/districts.js.
export const REGION_LOOK = {
  overgrown_market: {
    ruins: ['ruin_wall', 'ruin_pillar', 'ruin_car', 'ruin_stairs'], pave: 0.7, brushBias: 0.0, pond: 0,
    trees: { kapok: 2, fig: 2, palm: 1, dead: 1 }, tint: [1.0, 1.0, 0.96],
  },
  flooded_transit: {
    ruins: ['ruin_train', 'ruin_pillar', 'ruin_wall', 'ruin_mast'], pave: 0.5, brushBias: -0.04, pond: -0.1,
    trees: { palm: 2, fig: 1, dead: 2, kapok: 1 }, tint: [0.92, 1.0, 1.05],
  },
  canopy_greenhouse: {
    ruins: ['ruin_greenhouse', 'ruin_pillar', 'ruin_statue', 'ruin_wall'], pave: 0.4, brushBias: 0.06, pond: 0,
    trees: { kapok: 2, fig: 3, palm: 1, fern: 2 }, tint: [0.95, 1.06, 0.95],
  },
  collapsed_residential: {
    ruins: ['ruin_wall', 'ruin_stairs', 'ruin_car', 'ruin_pillar'], pave: 0.6, brushBias: 0.02, pond: 0,
    trees: { fig: 2, kapok: 1, dead: 2, palm: 1 }, tint: [1.04, 0.98, 0.94],
  },
  data_center: {
    ruins: ['ruin_mast', 'ruin_wall', 'ruin_pillar', 'ruin_statue'], pave: 0.85, brushBias: -0.02, pond: 0,
    trees: { dead: 2, fig: 2, kapok: 1 }, tint: [0.94, 0.98, 1.06],
  },
};

// Lighting/atmosphere (src/core/PostFx.js + the ground/foliage shaders).
export const ATMOS = {
  dayAmbient: 0.92,          // overall brightness at midday under open sky
  canopyShade: 0.42,         // how dark the deepest canopy shadow gets (0 = black, 1 = none)
  dapple: 0.22,              // sun-dapple strength in shaded areas
  dappleScale: 0.21,         // dapple noise frequency (per tile)
  wind: 0.16,                // dapple drift speed (tiles/s)
  vignette: 0.55,
  lightRadius: [9, 5.5],     // the player's visible radius in tiles: midday → dusk (darkness beyond)
  xrayRadius: 1.25,          // foliage in front of the player turns see-through within this (tiles)
  sway: 1,                   // foliage sway amplitude (texels)
};
