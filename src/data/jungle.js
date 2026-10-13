// Open-world jungle: generation and rendering tuning (src/world/JungleGen.js, JungleWorld.js, TerrainBaker.js).
// 1 unit = 1 tile = 32 texels. The world is one persistent square per run with the Relay at its centre.

export const LEVEL = { water: 0, mud: 1, dirt: 2, floor: 3, moss: 4 };
export const LEVEL_NAMES = ['water', 'mud', 'dirt', 'floor', 'moss'];

// Undergrowth per tile. 1 ferns: walkable (slow), rustles · 2 thicket: solid until cut (one slash) ·
// 3 bramble: solid, thorny; a slash only nicks it, a heavy chop clears it.
// Terrain kinds drawn from PixelLab art (public/terrain); the others use TerrainBaker's procedural textures.
export const TERRAIN_ART = ['floor', 'moss', 'paving'];

export const BRUSH = { none: 0, fern: 1, thicket: 2, bramble: 3 };

// Ruin paving break-up (src/world/TerrainBaker.js): world-space noise fields (scale = per tile) that
// cross slab borders. hole/moss = fBm thresholds (higher = rarer), edgeNoise jitters their outlines,
// stain = brightness swing of the stains, cracks/rubble = how many per chunk (on paved texels only).
export const PAVING = {
  scale: 0.42, hole: 0.65, moss: 0.58, edgeNoise: 0.18, mossDither: 0.1, stain: 0.16, cracks: 16, rubble: 26,
  // Slab bank (critic G #9, PixelLab paving only): star = share of slabs that keep the star motif;
  // stagger = random row offsets (running bond); every slab gets a random flip/rotation; jitter = per-slab
  // brightness ±; drift/warm = large-scale brightness and warm↔cool shift over tintScale (per slab).
  // starBox/starLum locate the motif on the 32 × 32 tile (x0, y0, x1, y1; darker than starLum × median).
  slab: { star: 0.22, stagger: true, jitter: 0.06, drift: 0.22, warm: 0.07, tintScale: 0.35, starBox: [14, 4, 30, 20], starLum: 0.9 },
};

// What an opened container looks like (Assets.spentVariant on its own sprite; null = the shared
// opened-crate sprite). 'open' chest, 'gutted' cache, 'dark' terminal.
export const OPENED_LOOK = { crate: null, chest: 'open', cache: 'gutted', intel_terminal: 'dark' };

// Where an opened container's interior goes on its closed sprite (Assets.spentVariant 'open'/'gutted',
// critic G #10): the top-face polygon in sprite texels (left, back, right, front corner), the rim kept
// around it, inner-wall depth, floor shadow width, and the interior colours (sRGB 0–255).
const INTERIOR = {
  wallDarkTop: [58, 36, 26], wallDark: [44, 27, 20], wallLitTop: [104, 66, 42], wallLit: [80, 50, 33],
  floor: [31, 20, 15], deep: [17, 11, 10],
};
export const OPENED_TOP = {
  prop_tool_chest: { poly: [[4, 12], [28, 1], [40, 9], [15, 18]], rim: 2, wall: 3, shade: 3, colors: INTERIOR },
  prop_rare_cache: { poly: [[5, 10], [26, 1], [42, 9], [21, 17]], rim: 2, wall: 3, shade: 3,
    colors: { ...INTERIOR, wallDarkTop: [52, 34, 52], wallDark: [38, 25, 40], wallLitTop: [92, 62, 96], wallLit: [70, 46, 74] } },
};

// Ground light pool under an activated pylon (src/core/PixelGlow.js): size in tiles (texel-exact at
// 32 px/tile), brightness steps, falloff power, colour and additive strength.
export const PYLON_GLOW = { w: 3.5, h: 2, steps: 4, power: 1.3, color: '#2ce8f5', strength: 0.7 };

// Brush legibility (src/world/FloraAtlas.js _tint): a colour grade per flora family so the three brush
// types read apart at a glance. mul/add per RGB channel, sat = saturation factor, ramp = brightness
// remapped onto these colours (rampMix = how much, rampGain stretches brightness onto the ramp).
export const BRUSH_LOOK = {
  fern: { mul: [1.08, 1.16, 0.92], add: [16, 18, 4], sat: 0.78 },          // low, pale yellow-green: walk through
  thicket: { mul: [0.7, 0.8, 0.84], sat: 1.08 },                           // dense, dark blue-green: one slash
  vine: { mul: [0.7, 0.8, 0.84], sat: 1.08 },
  bramble: {                                                               // thorny red-brown: heavy chop
    ramp: ['#160909', '#2e1210', '#4a1d16', '#6b2c1e', '#8c4026', '#b05a32', '#d08850'],
    rampMix: 0.78, rampGain: 2.1, mul: [1.1, 1, 0.94], sat: 0.95,
  },
};

export const JUNGLE = {
  size: 192,                 // tiles per side
  chunk: 16,                 // tiles per render chunk (512 × 512 px ground texture)
  activeRadius: 1,           // chunks around the camera's chunk that are built and drawn (3 × 3)
  prebakeRadius: 2,          // chunks baked ahead of time (one per frame) so walking never hitches
  bakeCache: 40,             // baked chunk textures kept in memory

  relayClearing: 8.5,        // radius of the open clearing around the Relay (tiles)
  relayWobble: 6,            // the clearing's edge wanders about -1..+2 tiles around that (JungleGen relayR)
  regionStart: 13,           // districts begin this far from the Relay
  regionNoise: 0.55,         // radians of wobble on the borders between district sectors

  rivers: 2,
  riverWidth: [1.4, 2.6],    // half-width of the water (tiles)
  bankWidth: 1.2,            // mud band beyond the water
  pondThreshold: 0.73,       // fBm above this → swamp ponds (flooded districts lower it, see REGION_LOOK)

  trailWidth: [0.9, 1.6],    // half-width of trails (tiles)
  trailWobble: 2.2,          // routing noise (higher = windier trails)
  extraTrailLinks: 0.35,     // extra links beyond the spanning tree (loops)
  // Trails meander: every `trailBend` tiles of a link the route swings sideways by `trailSwing` × that
  // spacing, alternating sides (S-bends), so a trail runs ~1.3–1.5× the straight line and cutting
  // cross-country is a real shortcut.
  trailBend: 13,
  trailSwing: [0.45, 0.65],
  // Dead ends: old trails that just fade out in the brush (per district region).
  deadEnds: [2, 3],
  deadEndLength: [10, 22],
  // Lost sites: no trail leads there; a ring of thick brush (`lostRing` tiles, some of it bramble)
  // surrounds the clearing, so you cut your way in. Chance per site type. Objectives prefer lost sites.
  lostSites: { major: 0.8, minor: 0.45, landmark: 0.3, camp: 0, pylon: 0 },
  lostRing: 4,
  lostBramble: 0.3,

  // Undergrowth coverage. density = fBm + region bias; thresholds pick fern / thicket.
  brushFern: 0.34,
  brushThicket: 0.44,
  deepBrush: 0.1,            // density bonus in the deep jungle, away from trails and clearings...
  deepBrushFrom: 2,          // ...starting this many tiles from them...
  deepBrushRamp: 8,          // ...and reaching full strength this much further out
  brambleNoise: 0.73,        // second noise above this turns thicket to bramble
  trailOvergrowth: [0.05, 0.55],   // chance a trail tile is overgrown, near → far from the Relay
  siteClear: 0.85,           // fraction of a site's radius kept clear

  deepRuins: 90,             // ruin fragments scattered through the brush (attempts)
  trailDressing: 0.018,      // chance per trail tile of a wreck / pillar / boulder at its edge
  treeSpacing: 2.6,          // jitter-grid step for tree candidates
  treeChance: 0.62,
  bigTreeChance: 0.14,

  sites: {
    major: 1, minor: [2, 3], camp: [1, 2], landmark: 1,   // per district region
    radius: { major: [6, 8], minor: [3.5, 5], camp: [3, 4], landmark: [3, 4], pylon: [2.5, 3] },
  },
  pylonsPerRegion: 1,
  // Loot budget (DESIGN §4): a normal day banks ~70–100 Scrap. Containers per site, +lostBonus at lost sites.
  containersPerSite: { major: [2, 4], minor: [1, 2], camp: [0, 1], landmark: [0, 1], pylon: [0, 0] },
  lostBonus: 1,
  hiddenCaches: 34,          // lone containers scattered in the thick of the jungle
  hiddenTrailGap: 3,         // ...at least this many tiles from any trail (you find them by cutting)
  containerWeights: { crate: 54, chest: 27, cache: 5, intel_terminal: 14 },
  hiddenWeights: { crate: 48, chest: 40, cache: 12 },
  // Yields grow with distance from the nearest return point (the Relay or any pylon): a container's
  // Scrap × mult[0] within `near` tiles → mult[1] beyond `far`. Rare caches closer than `cacheMin`
  // become tool chests (no rare-cache clusters by a pylon).
  lootDistance: { near: 12, far: 50, mult: [0.45, 0.9], cacheMin: 28 },

  explore: { cell: 2, revealRadius: 7 },   // map discovery grid (tiles per cell) and reveal radius
  regrowth: 0.18,            // share of cut tiles that grow back each night (never trails or clearings)
};

// The day: daylight, then dusk (darkness closes in, hunters roam), then night (hunters every few seconds).
// Extraction (Relay or an activated pylon) is open all day; the objective is what earns the boon.
export const DAY = {
  length: 300,               // seconds of daylight
  dusk: 70,                  // seconds from sunset to full dark
  huntEvery: [18, 9],        // seconds between hunter packs: at sunset → at full dark
  huntCount: [2, 3],         // hunters per pack (+1 from night 4)
  huntDist: [12, 17],        // spawn distance from the player (out of sight when possible)
  extractHold: 2.0,
  relayRadius: 3.2,          // stand this close to the Relay Core to return
  pylonRadius: 2.2,          // interact radius of a pylon (dead or online) — the sprite is 3 tiles tall
  // When interactables overlap, the prompt goes to the lowest rank (then the nearest):
  // Relay / pylons, then objectives, then containers. Exception (so a crate right next to a pylon is still
  // reachable): standing within interactPointBlank of a lower-ranked one that is at least
  // interactPointBlankLead closer than the winner picks it instead.
  interactRank: { extract: 0, pylon: 0, primary: 1, optional: 1, container: 2 },
  interactPointBlank: 0.8,
  interactPointBlankLead: 0.6,
  pylonHold: 2.5,
  pylonReveal: 22,           // activating a pylon maps this radius around it
  startOffset: [2.4, 1.4],   // where the day starts relative to the Relay Core
  // Arrival framing (JungleScene._placeCamera): the camera centres `z` tiles from the Relay (whole Relay +
  // player on screen, below the arrival toast) until the player walks `leave` tiles off or `time` s pass.
  spawnFrame: { z: -1.1, leave: 1.5, time: 6 },
  // The drone drops you at an online pylon instead of the Relay only if the trek from it to the
  // objective (start → every step, straight-line metres) is still ≥ minTrek and it saves ≥ pylonSaving.
  minTrek: 50,
  pylonSaving: 12,
  objectiveMinDist: 45,      // primary objectives prefer sites at least this far from the Relay
};

// Spore pods (jungle hazard; the Canopy Greenhouse is thick with them). Placed by JungleGen beside trails
// and clearings; they grow back every day. Walk close and a pod swells (telegraph), then bursts into a
// dithered cloud that hurts and saps stamina while you stand in it. A machete hit pops it at once (the
// heavy chop's reach is about the cloud's radius). The Safe Hands skill halves the damage and stops the drain.
export const SPORES = {
  perRegion: { canopy_greenhouse: 28 },   // pods per district region...
  perRegionDefault: 5,                    // ...in the others
  minRelay: 20,              // none this close to the Relay
  nearOpen: 4,               // only within this many tiles of a trail or clearing (where you walk)
  spacing: 4,                // min tiles between pods
  trigger: 1.3,              // walking this close sets a pod off...
  fuse: 0.7,                 // ...it swells for this long, then bursts (a hit: 0.12 s)
  hitFuse: 0.12,
  radius: 1.9,               // cloud radius (tiles)
  life: 5,                   // seconds the cloud lingers (it thins out over the last 40%)
  tick: 0.6,                 // damage interval inside a cloud
  damage: 5,
  staminaDrain: 30,          // stamina per second inside a cloud
  safeHands: 0.5,            // Safe Hands: damage × this, no stamina drain
  color: '#c9d65a', color2: '#7f9a3c',   // cloud dither colours (light / dark speckle)
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

// Body separation (critic G #6, src/entities/ExploreEnemy.js _separate): creatures don't stand on the player
// or stack on each other. Gaps are fractions of the summed radii; push = max correction speed (tiles/s).
// Skipped mid-attack, so lunges and charges still connect.
// frontGap: extra tiles kept when the creature stands in front of (south of) the player.
export const CROWD = { playerGap: 0.95, frontGap: 0.3, enemyGap: 0.8, push: 7 };

// Lighting/atmosphere (src/core/PostFx.js + the ground/foliage shaders).
export const ATMOS = {
  ambientLight: 1,           // THREE.AmbientLight for Lambert materials in the jungle (decals, placeholders)
  dayAmbient: 0.92,          // overall brightness at midday under open sky
  canopyShade: 0.42,         // how dark the deepest canopy shadow gets (0 = black, 1 = none)
  dapple: 0.22,              // sun-dapple strength in shaded areas
  dappleScale: 0.21,         // dapple noise frequency (per tile)
  wind: 0.16,                // dapple drift speed (tiles/s)
  vignette: 0.55,
  lightRadius: [9, 5.5],     // the player's visible radius in tiles: midday → dusk (darkness beyond)
  xrayRadius: 1.55,          // foliage in front of the player turns see-through within this (tiles) — a dithered
                             // halo around the player; the player's own texels are always fully clear (playerOutline)
  xrayMax: 1,                // share of foliage texels removed at the centre of the window (fades to 0 at the rim)
  xrayInner: 0.4,            // fraction of the radius that stays at xrayMax before the dithered fade starts
  // Occlusion silhouettes (src/core/Assets.js): where brush/trees/ruins cover a creature, its outline
  // is drawn solid and its body as a dither of `fill` density, in these flat colours.
  // playerFill: the player's own dither density where a sprite (an enemy, a crate) stands in front of it.
  silhouette: { player: '#d8fdff', enemy: '#ff5a2e', enemyDim: '#c0603e', fill: 0.2, playerFill: 0.45, inner: 0.75 },
  // Player readability (critic G #1): foliage/trunk/ruin cards never cover the player's own texels or its
  // 1-texel outline (stencil mask, Assets.js), so the player is always drawn whole. The outline is dark on
  // open ground and turns `cover` while brush or a tall object is right around / in front of the player.
  playerOutline: { open: '#141019', cover: '#d8fdff', coverRadius: 1, coverAhead: 2 },
  sway: 1,                   // foliage sway amplitude (texels)
};
