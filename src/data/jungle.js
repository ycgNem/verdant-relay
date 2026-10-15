// Open-world jungle: generation and rendering tuning (src/world/JungleGen.js, JungleWorld.js, TerrainBaker.js).
// 1 unit = 1 tile = 32 texels. The world is one persistent square per run with the Relay at its centre.

export const LEVEL = { water: 0, mud: 1, dirt: 2, floor: 3, moss: 4 };
export const LEVEL_NAMES = ['water', 'mud', 'dirt', 'floor', 'moss'];

// Undergrowth per tile. 1 ferns: walkable (slow), rustles · 2 thicket: solid until cut (one slash) ·
// 3 bramble: solid, thorny; a slash only nicks it, a heavy chop clears it.
// Terrain kinds drawn from PixelLab art (public/terrain); the others use TerrainBaker's procedural textures.
export const TERRAIN_ART = ['floor', 'moss', 'paving'];
// Value structure (critic H #2, TerrainBaker): the walkable surfaces baked this much brighter than their art, so
// paths read as the lightest ground (jungle only; the night map's stand-in ground is untouched).
// critic H2 §1: dirt +20% (1.2 → 1.44) so trails reach the clearings' value band (deep trail median ≥ 65).
export const TERRAIN_VALUE = { dirt: 1.44, paving: 1.1 };

// Ground decal scatter (TerrainBaker._scatter): tries per 16 × 16-tile chunk, share of tries skipped, and the same
// decal never twice within `spacing` tiles (critic H #12: at most one per 8 × 8 tiles, across chunk borders too).
// weight: base pick weight × these (name fragments) — the crossed-twig "X" and bone piles read as UI markers when
// common. Districts add their own multipliers (REGION_LOOK.decals). Weight 0 = never scattered: the crossed-twig "X"
// still read as a map marker at 0.25 (critic H2 §1), so only the Track-the-Alpha clues use it now.
export const DECALS = {
  perChunk: 70, skip: 0.35, spacing: 8,
  weight: { twigs_crossed: 0, bones: 0.5, footprints: 0.4, burrow: 0.5, web: 0.6 },
};

// Emissives (critic H #4): texels that keep glowing in the shade and at night (PostFx light code). keys: sprite
// key → hue bands [from, to] (degrees, wrapping) in which a texel at least minV bright and minS saturated glows
// (src/core/Emissive.js draws a mask over those texels: eyes, screens, the Relay crystal, pylon tips, fire).
// decals: glowing ground decals (name fragment → minimum texel value that glows; TerrainBaker marks those texels
// with canvas alpha groundAlpha).
// Every level / branch sprite of a night tower (key, _2, _3, _3a, _3b) → the same bands, unless `over` gives one.
const towerGlow = (type, bands, over = {}) => Object.fromEntries(['', '_2', '_3', '_3a', '_3b'].map((s) => [type + s, over[s] || bands]));
export const EMISSIVE = {
  minV: 0.72, minS: 0.4,
  keys: {
    // Night towers (48 × 64 art): lamps, orbs, eyes and fire keep their light at night. The turret's band is tight:
    // its drum's lightest ochre (#bfa05a, ~41°) must stay dark; its lamps are #f0a030 (35°) and #ffd070 (40°).
    ...towerGlow('scrap_turret', [[32, 40.6]]),
    ...towerGlow('thorn_nest', [[295, 312]]),                                   // purple heart
    ...towerGlow('arc_spire', [[183, 195]]),                                    // cyan orb / arcs
    ...towerGlow('snare_vine', [[330, 345]]),                                   // pink bloom highlights
    ...towerGlow('mortar_pod', [[80, 105]], { _3a: [[12, 46]] }),               // green pod glow; 3a fire
    ...towerGlow('pulse_beacon', [[27, 46]], { _3a: [[10, 46]], _3b: [[27, 46], [183, 195]] }),   // amber lamp and rings
    relay_core: [[160, 205]], prop_relay_pylon: [[165, 205]], prop_data_terminal: [[140, 190]],
    prop_intel_terminal: [[25, 65]], prop_cell_cache: [[140, 190]], prop_rare_cache: [[260, 310]],
    prop_fuse: [[10, 50]], prop_campfire: [[5, 60]], prop_data_drive: [[10, 40]], prop_nest: [[10, 50]],
    crawler: [[340, 20]], skitter: [[35, 65]], spitter: [[340, 20]],
    // Area bosses glow at night too (critic H2 §2.6): the Thorn Mother's maw, the Brood Hive's fire mouth and egg
    // lamps, the Warden's red core, the Drowned Engine's lamp eye — phase-2 sheets (_p2) alike.
    ...Object.fromEntries([['boss_thorn_mother', [[350, 15]]], ['boss_brood_hive', [[20, 55]]], ['boss_warden', [[345, 15]]], ['boss_drowned_engine', [[20, 50]]]]
      .flatMap(([k, b]) => [[k, b], [`${k}_p2`, b]])),
    // The repainted night creatures' eyes / seeds / shield, and the derived day creatures' eyes (batch 4).
    seed_carrier: [[25, 40]], ruin_guard: [[185, 200]], seedling: [[25, 45]],
    thorn_stalker: [[40, 60]], bloater: [[40, 60]],
    fx_flare_ember: [[20, 50]],
    // The open dusk bloom's flower head (Forage.js): its cyan core and violet petals (pixel-art/forage).
    prop_dusk_bloom_open: [[180, 195], [255, 275]],
  },
  decals: { fungus_glow: 0.5, mushrooms_blue: 0.42 },
  groundAlpha: 200,
};

// Load-time palette swaps (src/core/PaletteSwap.js, critic H #10): per sprite key, texels in `bands` (hue degrees)
// with at least minS saturation are remapped onto `ramp` by brightness rank; `dark` folds deep-shadow texels of
// other hues (≤ maxV value) onto the darkest steps. The Feral's olive cloak → bone / rust (#7a4a3a / #a08060),
// so it never wears the player's olive poncho.
export const PALETTE_SWAP = {
  feral: {
    bands: [[52, 118]], minS: 0.2,
    dark: { bands: [[150, 240]], maxV: 0.4, minS: 0.15 },
    ramp: ['#2a1814', '#4e2c22', '#7a4a3a', '#a08060', '#c2a77e'],
  },
};

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

// Ground light pool under an activated pylon (src/core/PixelGlow.js lightPool): size in tiles (texel-exact at
// 32 px/tile), brightness steps, falloff power, colour and additive strength. It is a light source for PostFx
// (lit under the canopy and at night). beam: a light column (beamW × beamH texels, from beamY tiles up — the
// mast's tip) drawn above the canopy so a live pylon reads from across the jungle (critic H #12).
export const PYLON_GLOW = {
  w: 6, h: 3.5, steps: 5, power: 1.15, color: '#2ce8f5', strength: 0.55,
  beam: true, beamW: 10, beamH: 112, beamY: 2.6, beamStrength: 0.75, pulse: 2.4,
};

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
  huntDist: [15, 20],        // spawn distance from the player (off screen: view half-diagonal ≈ 11.5 + look-ahead)
  extractHold: 2.0,
  relayRadius: 3.2,          // stand this close to the Relay Core to return
  pylonRadius: 2.2,          // interact radius of a pylon (dead or online) — the sprite is 3 tiles tall
  // When interactables overlap, the prompt goes to the lowest rank (then the nearest):
  // Relay / pylons, then objectives, then containers. Exception (so a crate right next to a pylon is still
  // reachable): standing within interactPointBlank of a lower-ranked one that is at least
  // interactPointBlankLead closer than the winner picks it instead.
  // The quest wins E (critic Q fix 4: at Platform 7 E opened a strongbox, a crate, a data log and a chest first): a
  // quest step you can do now ranks just under the Relay / beacons and never loses to the point-blank exception; a
  // step not yet open ranks `lockedRank` (last). Strongboxes, shrines and data logs come after bonus tasks.
  interactRank: { extract: 0, pylon: 0, primary: 0.5, optional: 1, event: 1, relic: 1.5, shrine: 1.5, lore: 1.5, container: 2, forage: 3, forage_hint: 4 },
  interactLockedRank: 5,
  interactPointBlank: 0.8,
  interactPointBlankLead: 0.6,
  interactLoreCalm: 8,       // a data log can't be read (its text box would cover the fight) with a creature after you this close
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
  tickIframes: 0.15,         // a tick's hurt immunity (not the full hurtIframes: a cloud is no shield, critic I2)
  // The cloud thins out in steps, its drawn edge ring with it (critic I2 #1): [from life share, radius share].
  edgeSteps: [[0, 1], [0.6, 0.8], [0.8, 0.6]],
  staminaDrain: 30,          // stamina per second inside a cloud
  safeHands: 0.5,            // Safe Hands: damage × this, no stamina drain
  // Environmental kills (critic I §9B): clouds hurt creatures too (`damage` every `tick` s) and choke them (× `slow`
  // speed, no new wind-ups); creatures with `podTrigger` (Ferals, Crawlers, Razorbacks) set pods off like you do; a
  // charging Razorback pops any pod within `chargePop` at once; a heavy chop launches a pod `launch` tiles along your
  // swing, and it bursts where it lands after `launchTime` s.
  creature: { damage: 6, tick: 0.6, slow: 0.6 },
  chargePop: 0.9,
  launch: 3.5, launchTime: 0.5,
  color: '#c9d65a', color2: '#7f9a3c',   // cloud dither colours (light / dark speckle)
};

// Foraging (critic N, N2): things the jungle gives back. Generation: JungleGen (world.forage + fungus hosts on
// world.objects, own RNG stream 'forage' so nothing else in the world moves; the dusk blooms on 'forage'/'bloom').
// Live: src/entities/Forage.js. All of it regrows every morning; the map remembers fruit, fungus and blooms you have
// seen (run.world.forage).
export const FORAGE = {
  // No fruit / fungus / bloom under a tree's canopy (critic N2 P1-2): a tree hides what stands up to `depth` tiles
  // north of its trunk and `half` tiles either side (the ~150 × 150 px canopy cards).
  canopy: { half: 2.2, depth: 4.5 },
  // "On screen" round the player (tiles: |dx| ≤ x, up ≤ dz ≤ down; dz > 0 = south): what the map remembers as seen,
  // and where a glint's reveal / twinkle counts as the player's. `seenEvery`: s between checks.
  view: { x: 10, up: -5, down: 6.5 },
  seenEvery: 0.25,
  // Wild fruit bushes beside trails and clearings: hold E to eat (+heal health). Not used up at full health.
  fruit: {
    perRegion: 6, perRegionMult: { canopy_greenhouse: 1.5 },
    nearOpen: 3,            // within this many tiles of a trail or clearing
    minRelay: 18, spacing: 12, lairGap: 10, sporeGap: 3,
    siteGap: 4,             // none this close to today's goal / bonus / event props (JungleScene skips them)
    hold: 0.8, heal: 15, radius: 1.3,
    fullAt: 0.5,            // within this of max health the bush is "not hurt": info prompt, no hold (critic N2 P2-4)
    burst: ['#f77622', '#63c74d'],   // orange fruit + leaf green when eaten
    fullToastEvery: 2.5,    // s between "you are not hurt" toasts while E stays held
  },
  // Shelf fungus on old stumps and fallen logs at trail / clearing edges: hit it with the machete for Biofiber.
  fungus: {
    newStumps: 26,          // old stumps placed near open ground (the 'forage' RNG stream)
    logHosts: 0,            // + the nearest-to-trail generated logs (0: on a log the fungus card floated over foliage)
    sporeGap: 3,            // no host this close to a spore pod (a swing at the fungus popped the pod)
    nearOpen: 3, minRelay: 14, spacing: 8,
    lairGap: 10,            // none this close to a boss lair (= BOSS.clearProps.radius: a harvest woke the boss, critic N2 P1-1)
    yield: 1,               // Biofiber, × Run.lootMults().biofiber, rounded, min 1
    hitRadius: { stump: 0.5, log: 0.7 },   // machete reach on the host (centre 0.2 tiles north of its anchor)
    hint: 1.6,              // the "hit the fungus" prompt shows this close, until the first harvest of the run
    overlay: { log: [0.15, 0.06, 12] },   // the fungus card on a log: [x, z] tiles from its anchor, lifted N texels up its flank
    burst: ['#63c74d', '#e4a672'],
    hitStop: 0.04,          // a light hit-stop when the fungus breaks off
  },
  // Glints in the brush: a gold sparkle in a thicket / bramble tile is old salvage; cut the plant and it spills Scrap.
  glint: {
    chance: { thicket: 0.0035, bramble: 0.012 },   // per uncut tile, rolled per day
    scrap: { thicket: [3, 5], bramble: [6, 9] },   // × Run.lootMults().scrap × the JUNGLE.lootDistance multiplier
    minAmt: 3,              // never less than this after the multipliers (critic N2: "+1 Scrap" taught players to ignore them)
    minReturn: 12,          // none within this of the Relay or an activated pylon
    clear: 2,               // none within this of a container, trail tile or site centre
    edge: 8,                // none in the dark map-edge band (critic N2 P2-6)
    show: 8, every: [1.2, 2.0],   // sparkle range (tiles) and interval (s, random in range)
    // The sparkle: a gold star at 2× the spark star (18 px: never a 1–2 px firefly blink), then a white glint
    // `twinkle[0]` s later at `twinkle[1]` size; `y` tiles up.
    color: '#fee761', size: 18 / 32, life: 0.22, twinkle: [0.1, 9 / 32, '#ffffff'], y: 0.35,
    sound: 6,               // the soft twinkle (sfx glint_twinkle) plays with a sparkle within this many tiles, on screen
    burst: ['#fee761', '#feae34'],
  },
  // Dusk blooms (critic N §rank 4, N2 rec. 3): rare plants in site clearings away from the Relay. Closed by day; they
  // open (and glow: EMISSIVE.keys.prop_dusk_bloom_open) once `openLeft` s of daylight are left; hold E → +intel
  // (carried) and +research (counted at the summary, like a bonus task). Back every morning.
  bloom: {
    count: 3, minRelay: 30, lairGap: 10, spacing: 24,
    clear: 3,               // at least this far from a site centre, container, pylon, lore / relic spot, fruit bush or fungus stump
    openLeft: 70,           // s of daylight left when they open
    hold: 1, radius: 1.3, intel: 1, research: 5,
    nearToast: 14,          // the first bloom to open within this many tiles (per run) gets a toast + chime
    pollen: { every: [0.5, 1.1], range: 12, color: '#b09cf5', color2: '#2ce8f5' },   // drifting motes off an open bloom
    burst: ['#b09cf5', '#2ce8f5'],
  },
};

// Spore cloud look (src/world/SporeLook.js, critic H #12): `puffs` puff sprites (spore_puff_1..3), one in the
// middle and the rest on a ring at ring[0] / ring[1] × the cloud radius, floating height[0..1] tiles up; they pop in
// from the centre over `grow` s, drift up to ±drift/2 tiles/s, bob a texel, and drop out (outer first) after
// thinFrom of the cloud's life.
export const SPORE_LOOK = { puffs: 8, ring: [0.34, 0.66], height: [0.05, 0.4], drift: 0.12, grow: 0.3, thinFrom: 0.6, bobSpeed: 2 };

// Wildlife population per chunk (16 × 16 tiles), rolled per day. danger = 0 near the Relay → 1 far out.
export const POP = {
  safeRadius: 18,            // no wild spawns this close to the Relay
  base: 0.7, far: 2.4,       // expected enemies per chunk at danger 0 / 1
  byNight: [0.65, 0.8, 0.92, 0.95, 1.0, 1.05],   // (Stage 9 fix wave, critic R #3: was …1, 1.12, 1.25, 1.4 — days 3–6 were a grind)
  targetRegion: 1.2,         // today's district is busier
  group: [1, 3],
  campSize: [2, 3],          // ferals at a camp (+1 from night campGrowFrom)
  campGrowFrom: 4,           // (fix wave, critic Q #1: was night 3 — a 5-Feral camp on day 3 snowballed)
  spawnRadius: 2,            // chunks around the player whose wildlife is live
  despawnDist: 46,           // tiles: un-alerted wildlife this far away goes back into the bush
  minSpawnDist: 15,          // never pop in closer than this to the player (view half-diagonal ≈ 11.5 tiles + look-ahead + margin)
  // District enemy tables use the v1 'scav' (gunner): in the jungle it is the melee Feral Scavenger.
  remap: { scav: 'feral' },
  // Thorn Stalkers (critic I §9D): from `fromNight`, a chunk whose tiles are at least `fernShare` fern may hold one
  // (chance × the district's weight below, `max` per chunk). Placed on a fern tile; they live under the brush.
  stalker: {
    fromNight: 3, fernShare: 0.28, chance: 0.55, max: 1,
    districts: { canopy_greenhouse: 1.6, overgrown_market: 1, collapsed_residential: 1, flooded_transit: 0.8, data_center: 0.6 },
  },
};

// Look and feel per district region: which ruins and props dress its sites, how much water, brush bias,
// tree mix. Keys match src/data/districts.js.
// grade (critic H #3): the district colour grade, a linear RGB multiplier PostFx applies to everything standing on
// the region (blended over ATMOS.gradeBlur tiles at the borders; its shadows also lift toward the same hue,
// ATMOS.gradeLift). decals: ground decals this district favours (dec_* name fragments, weight multiplier;
// TerrainBaker._scatter), e.g. bolts and tin puddles in the Data Center.
// hero (critic H #3): the district's hero ruin family; JungleGen puts 1–2 of them at every MAJOR site of the region.
export const REGION_LOOK = {
  overgrown_market: {
    ruins: ['ruin_wall', 'ruin_pillar', 'ruin_car', 'ruin_stairs'], hero: 'ruin_kiosk', pave: 0.7, brushBias: 0.0, pond: 0,
    trees: { kapok: 2, fig: 2, palm: 1, dead: 1 },
    grade: [1.13, 1.02, 0.84], decals: { pot_shards: 3, seed_pod: 2, berries: 1, bones: 1.5, feathers: 2, cog: 0.75 },
  },
  flooded_transit: {
    ruins: ['ruin_train', 'ruin_pillar', 'ruin_wall', 'ruin_mast'], hero: 'ruin_platform', pave: 0.5, brushBias: -0.04, pond: -0.1,
    trees: { palm: 2, fig: 1, dead: 2, kapok: 1 },
    grade: [0.84, 1.0, 1.14], decals: { puddle: 3, lily: 2.5, reeds: 2.5, cattails: 2.5, snail: 2, tin_puddle: 2 },
  },
  canopy_greenhouse: {
    ruins: ['ruin_greenhouse', 'ruin_pillar', 'ruin_statue', 'ruin_wall'], hero: 'ruin_greenhouse', pave: 0.4, brushBias: 0.06, pond: 0,
    trees: { kapok: 2, fig: 3, palm: 1, fern: 2 },
    grade: [1.0, 1.12, 0.84], decals: { flowers: 3, fungus_glow: 4, mushrooms: 3, sapling: 2.5, monstera_leaf: 2, fern_frond: 2 },
  },
  collapsed_residential: {
    ruins: ['ruin_wall', 'ruin_stairs', 'ruin_car', 'ruin_pillar'], hero: 'ruin_facade', pave: 0.6, brushBias: 0.02, pond: 0,
    trees: { fig: 2, kapok: 1, dead: 2, palm: 1 },
    grade: [1.15, 0.94, 0.88], decals: { bricks_mossy: 3.5, pot_shards: 2.5, slab_mossy: 3, concrete_chunks: 2.5, web: 2 },
  },
  data_center: {
    ruins: ['ruin_mast', 'ruin_wall', 'ruin_pillar', 'ruin_statue'], hero: 'ruin_server', pave: 0.85, brushBias: -0.02, pond: 0,
    trees: { dead: 2, fig: 2, kapok: 1 },
    grade: [0.9, 0.95, 1.16], decals: { bolts: 2, cog: 1.75, tin_puddle: 3, concrete_chunks: 3, slab_mossy: 1.5 },
  },
};

// Body separation (critic G #6, src/entities/ExploreEnemy.js _separate): creatures don't stand on the player
// or stack on each other. Gaps are fractions of the summed radii; push = max correction speed (tiles/s).
// Skipped mid-attack, so lunges and charges still connect.
// frontGap: extra tiles kept when the creature stands in front of (south of) the player.
// playerGap 1.45 (critic I #2: at 0.95 four Ferals stood inside the player's sprite).
export const CROWD = { playerGap: 1.45, frontGap: 0.3, enemyGap: 0.8, push: 7 };

// Lighting/atmosphere (src/core/PostFx.js + the ground/foliage shaders).
export const ATMOS = {
  ambientLight: 1,           // THREE.AmbientLight for Lambert materials in the jungle (decals, placeholders)
  dayAmbient: 0.92,          // overall brightness at midday under open sky
  canopyShade: 0.42,         // how dark the deepest canopy shadow gets (0 = black, 1 = none)
  dapple: 0.22,              // sun-dapple strength in shaded areas
  dappleScale: 0.21,         // dapple noise frequency (per tile)
  wind: 0.16,                // dapple drift speed (tiles/s)
  vignette: 0.55,
  // Value structure (critic H #2): the canopy shade spares walkable trail / clearing tiles (× trailShade in
  // JungleWorld._buildShade → tShade.g; cards keep the full density, tShade.r), and upright cards are a touch
  // darker than the ground they stand on (cardShade), so path > brush > canopy in value at a glance.
  trailShade: 0.12,          // critic H2 §1: 0.4 left deep trails at a median of 45–57
  cardShade: 0.95,
  // Trails show through the brush in front of them (critic H2 §1: upright cards on the row south of an east–west
  // trail overhung it at the 55° pitch and buried half its tiles). Brush texels over open trail ground (JungleWorld
  // trail mask: trail tiles with no undergrowth) dither away: `strength` (0 = off) × the bilinear mask × `boost`
  // (> 1: fully clear over the trail, a dithered fringe about half a tile beside it); a plant keeps texels within
  // `foot` tiles of its own base. coveredAt (the player's outline) skips those texels too. Tree crowns over a trail
  // only thin out (`tree` share of their texels; the trunk keeps `treeFoot` tiles of screen height whole).
  trailXray: { strength: 1, boost: 1.7, foot: 0.25, tree: 0.7, treeFoot: 1.4 },
  // Upright brush cards darken toward their base (card shader): over the bottom `baseH` of the card (share of its
  // height) per texel row down to × baseDark, fully in the card's own shadows, about half on its lit leaves (no
  // flat band across the card) — the brush sinks, the path lifts.
  brushBase: { baseH: 0.5, baseDark: 0.8 },
  // Global shadow lift (linear RGB, added to the darkest values) and how strongly each district's grade
  // multiplier also lifts its shadows in the same hue direction (REGION_LOOK.grade, PostFx tGrade).
  shadowLift: [-0.008, 0.007, 0.015],
  gradeLift: 0.08,
  // District colour grade blur (tiles): grades blend across region borders over about this distance.
  gradeBlur: 6,
  // The player's visible radius in tiles: midday → dusk (darkness beyond). Sized for the 20 × 11-tile
  // view (CONFIG.ui.view): at dusk the dark closes in to about the screen's top/bottom edges.
  lightRadius: [13.5, 8.25],
  // Time of day (PostFx.timeOfDay, critic H #4). Golden hour: from `goldFrom` of the daylight the light warms
  // toward `gold` (× goldK at the peak, dimmed by goldDim) and the canopy shade deepens by goldShade ("longer
  // shadows"); it holds into dusk and fades over goldDusk (dusk 0..1). Night (dusk night[0] → night[1]): moonlit
  // `moon` tint (linear RGB) at nightAmbient × the day's brightness, never below moonFloor, plus a navy moonLift
  // (linear RGB) into the blacks outside the lamp. lamp: a warm pool around the player from
  // dusk `on`, radius r = [solid, gone] × the light radius, at `level` brightness in `tint`. emit: brightness of
  // emissive texels / light pools (they ignore shade, darkness and vignette).
  cycle: {
    goldFrom: 0.72, gold: '#ffb070', goldK: 0.6, goldDim: 0.08, goldShade: 0.35, goldDusk: [0.3, 0.6],
    night: [0.25, 0.9], moon: [0.46, 0.62, 1.15], nightAmbient: 0.52, moonFloor: 0.2, moonLift: [0.002, 0.006, 0.018],
    lamp: { on: [0.1, 0.55], r: [0.24, 0.46], level: 0.88, tint: [1.0, 0.84, 0.62] },
    emit: 1.08,
  },
  // Foreground leaf frame (PostFx, critic H #5): whole hand-drawn silhouettes fg_leaf_<leaf> (1 monstera,
  // 2 palm frond, 3 banana, 4 fern, 5 vine; procedural stand-ins if missing). Each leaf's stem (its manifest
  // anchor) lands on (ax × screen w + x, ay × screen h + y) internal px, mostly off-screen so only the blade
  // reaches in; `flip` mirrors it. They lag the camera a little (parallax × the camera move, settling at
  // `settle`/s, at most parallaxMax px) and sway `sway` whole px. Darkened with the light (never below minLight).
  leafFrame: {
    parallax: 0.35, parallaxMax: 10, settle: 2.2, swaySpeed: 0.9, minLight: 0.45,
    items: [
      { leaf: 1, ax: 0, ay: 1, x: -34, y: 44, sway: 1 },               // monstera from the bottom-left corner
      { leaf: 2, ax: 0, ay: 0, x: -26, y: -26, sway: 2 },              // palm frond from the top-left
      { leaf: 3, ax: 0.7, ay: 1, x: 0, y: 66, sway: 1 },               // banana rising from the bottom edge, right side
      { leaf: 4, ax: 1, ay: 1, x: 26, y: 34, sway: 2 },                // fern from the bottom-right corner
      { leaf: 5, ax: 0.24, ay: 0, x: 0, y: -46, sway: 1 },             // vines hanging from the top edge
      { leaf: 5, ax: 0.83, ay: 0, x: 0, y: -74, sway: 1 },
    ],
  },
  // Ambience particles (src/world/Ambience.js): pool size, spawn box around the camera (tiles, w × d) and
  // the box beyond which they are recycled — a bit wider than the view (20 × 11 tiles).
  // shafts: light shafts kept around the camera, placed within shaftBox (tiles).
  // flies: share of the pool that turns into fireflies at full dark (they glow: emissive); flyBlink: a firefly
  // is lit while its blink sine is above this.
  particles: { count: 620, spawn: [32, 24], keep: [36, 28], shafts: 6, shaftBox: [30, 20], flies: 0.62, flyBlink: 0.1 },
  xrayRadius: 1.55,          // foliage in front of the player turns see-through within this (tiles) — a dithered
                             // halo around the player; the player's own texels are always fully clear (playerOutline)
  xrayMax: 1,                // share of foliage texels removed at the centre of the window (fades to 0 at the rim)
  xrayInner: 0.4,            // fraction of the radius that stays at xrayMax before the dithered fade starts
  // Occlusion silhouettes (src/core/Assets.js): where brush/trees/ruins cover a creature, its outline
  // is drawn solid and its body as a dither of `fill` density, in these flat colours.
  // playerFill: the player's own dither density where a sprite (an enemy, a crate) stands in front of it — 0: just
  // the outline, so the player's x-ray never prints over a creature (critic I #3; enemy silhouettes in turn skip the
  // player's stencil-masked texels, Assets.js).
  // One colour language (simplicity pass): cyan = you / home, red = danger. Enemies must out-shine the player:
  // the player's silhouette is a calm mid cyan, hostiles a pale bone (brighter once they've spotted you) — Stage 9 fix
  // wave (critic O #6): solid red is the commit flash now ("red flash = roll"), so occluded creatures aren't red.
  silhouette: { player: '#4fb8c8', enemy: '#f0dcb4', enemyDim: '#b8a080', fill: 0.2, playerFill: 0, inner: 0.75 },
  // Player readability (critic G #1): foliage/trunk/ruin cards never cover the player's own texels or its
  // 1-texel outline (stencil mask, Assets.js), so the player is always drawn whole. The outline is dark on
  // open ground and turns `cover` only while a card in front ACTUALLY overlaps the player (critic H #10,
  // JungleWorld.coveredAt): `body` = the sampled box in texels around the feet (half width, low..high rows above
  // the feet, step); `hits` = sample points over opaque card texels to turn cyan (on) / to stay cyan (off).
  playerOutline: { open: '#141019', cover: '#5fc8d8', body: { half: 9, low: 3, high: 42, step: 3 }, hits: { on: 6, off: 3 } },
  sway: 1,                   // foliage sway amplitude (texels)
};

// Solid jungle (Stage 6, src/world/Solid.js): everything that looks solid blocks movement — player and creatures
// alike. A footprint is a rounded box in tiles around an object's ground anchor (x → east, z → south, i.e. toward
// the camera): [x0, z0, x1, z1, round] = the inner box grown by `round` on every side (a circle is a zero-size box),
// mirrored with the sprite. They follow the BASE of the art (trunk + root flare, the log on the ground, the rock's
// foot, the ruin's walls), never the canopy. `art` is per sprite key (the atlas picks one per object, JungleWorld);
// `kind` is per object kind_type: generation's reachability check and placeholder art use these, so each is the
// largest art of its type. `opaque` kinds also block sight lines.
export const SOLID = {
  art: {
    tree_kapok: [-0.2, -0.6, 0.05, -0.45, 0.5],
    tree_banyan: [-0.7, -0.65, 0.55, -0.35, 0.35],      // trunk + the curtain of aerial roots
    tree_canopy: [-0.4, -0.6, 0.25, -0.4, 0.42],
    tree_strangler_fig: [-0.35, -0.6, 0.2, -0.4, 0.4],
    tree_dead_vine: [-0.25, -0.55, 0.05, -0.45, 0.42],
    tree_palm: [0.08, -0.3, 0.08, -0.3, 0.3],
    tree_fern: [0, -0.3, 0, -0.3, 0.28],
    fol_log: [-0.65, -0.35, 0.55, 0, 0.25],
    fol_boulder: [-0.55, -0.35, 0.6, 0, 0.35],
    fol_rock_mossy: [-0.5, -0.3, 0.45, 0, 0.32],
    fol_rubble_ivy: [-0.55, -0.45, 0.45, -0.1, 0.35],
    fol_stump: [0, -0.35, 0, -0.35, 0.55],
    prop_stump_fungus: [0, -0.35, 0, -0.35, 0.55],     // fungus stumps (critic N, Forage.js): same art size / anchor
    prop_stump_bare: [0, -0.35, 0, -0.35, 0.55],
    ruin_wall: [-1.0, -0.75, 1.05, -0.15, 0.2],
    ruin_pillar: [0.05, -0.4, 0.05, -0.4, 0.48],
    ruin_train_car: [-1.6, -1.3, 1.45, -0.2, 0.15],
    ruin_greenhouse: [-1.7, -1.5, 1.3, -0.1, 0.15],
    ruin_statue_head: [-1.0, -1.1, 0.9, -0.3, 0.35],
    ruin_car_wreck: [-1.35, -0.85, 1.35, 0, 0.2],
    ruin_radio_mast: [-1.6, -0.8, 1.1, -0.1, 0.2],
    ruin_stairs: [-1.3, -1.6, 1.25, -0.25, 0.2],
    // district hero ruins (critic H #3, pixel-art/pixellab_v3/build_ruins.py)
    ruin_market_kiosks: [-2.2, -0.75, 2.2, -0.1, 0.2],      // the kiosk row (barrels in front stay walkable)
    ruin_station_platform: [-1.3, -0.8, 1.2, -0.1, 0.3],    // the diagonal slab's middle; its ends sink into mud
    ruin_apartment_facade: [-0.95, -0.7, 1.3, -0.15, 0.15], // the facade + side wall (rubble in front is walkable)
    ruin_server_hall: [-1.0, -1.1, 1.1, -0.15, 0.15],       // both rack banks and the cooling unit
  },
  kind: {
    tree_kapok: [-0.2, -0.6, 0.05, -0.45, 0.5],
    tree_fig: [-0.7, -0.65, 0.55, -0.35, 0.35],
    tree_palm: [0.08, -0.3, 0.08, -0.3, 0.3],
    tree_dead: [-0.25, -0.55, 0.05, -0.45, 0.42],
    tree_fern: [0, -0.3, 0, -0.3, 0.28],
    rock_log: [-0.65, -0.35, 0.55, 0, 0.25],
    rock_boulder: [-0.55, -0.35, 0.6, 0, 0.35],
    rock_stump: [0, -0.35, 0, -0.35, 0.55],
    ruin_wall: [-1.0, -0.75, 1.05, -0.15, 0.2],
    ruin_pillar: [0.05, -0.4, 0.05, -0.4, 0.48],
    ruin_train: [-1.6, -1.3, 1.45, -0.2, 0.15],
    ruin_greenhouse: [-1.7, -1.5, 1.3, -0.1, 0.15],
    ruin_statue: [-1.0, -1.1, 0.9, -0.3, 0.35],
    ruin_car: [-1.35, -0.85, 1.35, 0, 0.2],
    ruin_mast: [-1.6, -0.8, 1.1, -0.1, 0.2],
    ruin_stairs: [-1.3, -1.6, 1.25, -0.25, 0.2],
    ruin_kiosk: [-2.2, -0.75, 2.2, -0.1, 0.2],
    ruin_platform: [-1.3, -0.8, 1.2, -0.1, 0.3],
    ruin_facade: [-0.95, -0.7, 1.3, -0.15, 0.15],
    ruin_server: [-1.0, -1.1, 1.1, -0.15, 0.15],
    prop_campfire: [0, -0.15, 0, -0.15, 0.42],
    prop_pylon: [-0.4, -0.6, 0.4, -0.05, 0.15],          // the pylon's stone plinth
    prop_relay: [-1.2, -1.45, 1.2, -0.25, 0.25],         // the Relay Core's platform
    prop_container: [-0.3, -0.4, 0.3, -0.05, 0.18],      // crates, chests, caches, terminals (opened ones too)
    prop_objective: [-0.25, -0.4, 0.25, -0.1, 0.18],     // objective / optional props (fuse box, pump, terminal…)
    prop_nest: [0, -0.2, 0, -0.2, 0.5],
  },
  opaque: ['ruin_wall', 'ruin_train', 'ruin_statue', 'ruin_kiosk', 'ruin_facade', 'ruin_server'],
  tilePad: 0.15,             // a tile counts as blocked for flow fields when its centre is this close to a footprint
};

// Ground and water (Stage 6): movement multipliers, deep water and bridges (src/world/JungleWorld.js speedAt,
// src/world/JungleGen.js). Undergrowth: ferns are pushed through slowly (no full-speed rolls either), the machete
// clears them; thickets and brambles stay solid until cut. Creatures that slip through or bulldoze brush
// (Skitter, Crawler, Razorback) ignore the fern drag.
export const GROUND = {
  fern: 0.5,                 // walking through ferns
  fernRoll: 0.6,             // a dodge roll in ferns (× roll speed)
  rollMin: 0.6,              // a roll never drops below this × speed on slow ground (water, mud)
  mud: 0.82,
  shallow: 0.55,             // wading: shallow water, river edges, ponds (never on a bridge deck)
  // Water deeper than `deepFrom` tiles in from the shore is deep: nobody crosses it. Rivers (half-width
  // 1.4–2.6) keep a deep channel, crossed on bridges (Stage 9, JungleGen planBridge): straight plank decks `width`
  // tiles wide, N–S or E–W, over every wet row from bank to bank (≤ `maxLen` tiles; trails and reachability fixes
  // allow `fixLen`). One where each trail crosses deep water (along the trail; `turn` = score penalty for the
  // other axis), plus `extra` per river across its flow, ≥ `spacing` tiles from any other bridge. Lateral shifts
  // up to `shift` tiles are tried (`shiftCost` each); decks keep `gap` tiles apart, and a trail crossing within
  // `trailGap` tiles of an existing bridge joins that bridge (its landings) instead of getting a twin. Landings: dirt paths `landing`
  // tiles out from each end (trail bridges: to the trail point `reach` samples past the bank, ½ tile each). No tree
  // trunk, rock or log within `treeSide` tiles of a deck's sides or `treeFront` tiles south of it (its card would hide the
  // deck); no ruin within `ruinSide` / `ruinFront`.
  deepFrom: 0.85,
  bridge: { width: 2, maxLen: 12, fixLen: 22, turn: 3, shift: 2, shiftCost: 0.6, extra: 3, spacing: 30, gap: 2, trailGap: 6, landing: 2.5, reach: 5,
    treeSide: 2, treeFront: 4, ruinSide: 3.5, ruinFront: 5 },
  deepTint: 0.5,             // deep water drawn this much darker (TerrainBaker), so the channel reads
  clearFront: 1.3,           // no undergrowth this far in front of (south of) logs, rocks and ruins, so they show
  treeFront: { rock: 1.9, ruin: 2.4 },   // ...and no tree trunk this far in front of them (its card would hide them)
  // Containers and pylons (critic H #12): no undergrowth within `clear` tiles in front of (south of) them, only
  // ferns out to `low` (not for hidden caches), and no tree trunk within `tree` tiles south / `treeX` across.
  propFront: { clear: 1.1, low: 2.2, tree: 2.6, treeX: 1.4 },
  // Reachability (JungleGen): every site, pylon and container must be walkable from the Relay (brush counts as
  // passable — it can be cut; deep water, trunks, rocks and ruins don't). A tile is walkable when its centre
  // is ≥ reachPad from every footprint. Unreachable targets are fixed along the cheapest path: deep water on it
  // gets a bridge (cost fixDeep per tile), objects on it are removed (fixObject per tile).
  reachPad: 0.3,
  fixDeep: 12,
  fixObject: 30,
};

// Wading (src/world/Wading.js, critic H #6): in shallow water a character's sprites are clipped `line` texels above
// the feet (at most maxShare of a small creature's height), with the fx_ripple loop centred on that waterline
// and an fx_splash on entry (its entry texel splashEntry, frame px, on the waterline).
export const WATER = { line: 8, maxShare: 0.2, splashEntry: [8, 11] };

// Bridge look (TerrainBaker drawBridge, Stage 9), all in texels: the deck runs `end` onto each bank; planks every `plank`
// (one of them the dark gap); edge logs `kerb` wide; posts `post` tall every `postEvery` along both sides, the rope
// `ropeDrop` below their tops, sagging `sag` on an E–W span; the south face `fascia` thick with `pile` stubs into the
// water; the shadow offset `shadow` (down-right) at ×shadowK. `wood` = dark → light (gap, shade, old, weathered,
// fresh, lit). Night map (DefenseGround laneBridges): the deck is `lane` tiles wider than the lane on each side.
export const BRIDGE_LOOK = {
  lane: 0.5, end: 8, plank: 7, kerb: 3, post: 14, postEvery: 64, ropeDrop: 4, sag: 3, fascia: 3, pile: 4,
  shadow: [3, 5], shadowK: 0.55,
  wood: ['#2a1a1e', '#3e2731', '#733e39', '#8f5340', '#b86f50', '#c28569'],
  rope: '#e4a672', ropeDark: '#733e39', moss: '#3e8948', foam: '#5f9a86',
};
