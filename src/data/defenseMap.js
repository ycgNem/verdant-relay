// The night maps around the Relay (Stage 7 "night board", critics K §2.2 / §4, J M2, H §4).
//
// Tile coordinates: tile (x, y) has its centre at (x + 0.5, y + 0.5) in world space (world X = x, world
// Z = y; screen up = north, as on the jungle map). Lane points are tile coordinates too, so enemies walk down
// the middle of lane tiles. Lanes are axis-aligned waypoint lists that end beside the Relay; enemies follow
// them exactly, so towers can never block a route. Each lane starts one tile off the field (x = −1), so an
// enemy appears at the edge at once (critic K §6: no 3-tile walk-in) — the trail continues off-field into the
// jungle (DefenseGround draws it to the edge of the ground).
//
// Field size: every map is FIELD.w × FIELD.h tiles (23 × 15 = 736 × 480 px at 32 px per tile), so the whole
// board fits beside the side panel at an integer zoom: ×2 at 1920×1080 (960 × 540 internal), ×1 at 720p
// (DefenseScene._fitCamera / src/world/NightCamera.js).
//
// A run plays ONE map (towers stay on their pads all run): `run.mapKey`, picked from the run seed
// (pickMapKey); old saves without one play 'twin'. Save.js checks tower pads against padCount(map).
//
// Lanes are labelled by compass direction: the Relay is the centre of the jungle (JungleGen) and each trail
// leads out toward part of it. `bearing` is the screen/world angle (degrees, atan2(dz, dx): 0 = east,
// 90 = south, −90 = north, 180 = west) the trail heads off to. laneForAngle() maps any jungle direction (an
// area, a beacon) to the lane facing it:
//   · tonight's area danger (the district's extra group) enters from the lane facing that area
//     (DefenseScene.dangerLane / laneForDistrict; the wave builder sends tonight.extraGroups down it);
//   · every ONLINE beacon (run.world.pylons) opens a "forward pad" on the lane facing it (`forward` slots,
//     in order; pad indices continue after the map's pads, so saves stay valid as beacons come on).
// Waves reference lanes by index and use `lane % lanes.length`: 2-lane wave data works on every map, and a
// 3rd lane (if a map has one) only gets enemies through the danger lane.

export const FIELD = { w: 23, h: 15 };

/** Compass words → bearing in degrees (screen angle, see the header). */
export const COMPASS_DEG = {
  east: 0, 'south-east': 45, south: 90, 'south-west': 135, west: 180, 'north-west': -135, north: -90, 'north-east': -45,
};

const lane = (name, short, bearing, points, forward = []) => ({ name, short, bearing, points, forward });

export const DEFENSE_MAPS = {
  // The classic: two winding trails from the north-west and south-west that meet at the Relay.
  twin: {
    key: 'twin', name: 'Twin Paths', blurb: 'Two winding trails meet at the Relay.',
    hpMult: 0.86,   // enemy health × this on this map (DefenseScene.hpMult; balance sim: the trails only meet at the Relay, so few pads see both)
    width: FIELD.w, height: FIELD.h,
    core: { x: 20.6, y: 8.2 }, coreRadius: 1.2,
    lanes: [
      lane('North path', 'North', COMPASS_DEG['north-west'],
        [[-1, 2], [3, 2], [3, 6], [8, 6], [8, 2], [13, 2], [13, 5], [16, 5], [16, 7], [19, 7]],
        [[0.75, 4.25], [5.25, 0.75]]),
      lane('South path', 'South', COMPASS_DEG['south-west'],
        [[-1, 12], [4, 12], [4, 9], [9, 9], [9, 13], [14, 13], [14, 10], [17, 10], [17, 8], [19, 8]],
        [[1, 9.5], [1.25, 13.375]]),
    ],
    // Build pads: tile coords of the pad's top-left, nudged off the grid by multiples of 1/8 tile (still
    // pixel-exact) so the plinths don't read as a TD grid. Every footprint (tile + plinth face) stays clear
    // of lane tiles and pads are ≥ 2 tiles apart (room for 48-px tower art). Stage 7 balance: on each map two
    // pads that saw one path (or almost none) moved to spots that see both (pad indices kept, so forward
    // pads and saves keep their numbers), so a wide build's 9th–11th towers aren't wasted.
    pads: [
      [5.125, 3.25], [10.25, 3.5], [6.25, 7.625], [11.25, 7.5], [14.375, 7.375], [16.5, 2.75],
      [6.125, 10.625], [11.25, 10.75], [16.125, 12.125], [17, 5.75], [1.25, 7.5], [16, 8.75],
    ],
    woodPads: [2, 6, 9],
    trees: [[1, 0], [11, 0], [21, 1], [22, 13], [12, 14], [2, 14]],
    rubble: [[7, 4], [15, 3], [2, 10], [12, 12], [19, 13]],
    bushes: [[10, 1], [6, 4], [14, 6], [3, 8], [8, 11], [11, 4], [15, 11], [20, 12], [1, 6], [13, 8]],
    lamps: [[18, 5], [18, 11]],
    plaza: { x0: 18, y0: 5, x1: 22, y1: 10 },
    margin: { left: 14 },
  },

  // The trails cross mid-map: one pad by the crossing covers both for a long stretch (critic K item 11).
  crossing: {
    key: 'crossing', name: 'Crossing', blurb: 'The two trails cross in the middle of the clearing.',
    hpMult: 1.07,   // enemy health × this on this map (DefenseScene.hpMult; balance sim: its middle pads see both trails)
    width: FIELD.w, height: FIELD.h,
    core: { x: 20.6, y: 8.2 }, coreRadius: 1.2,
    lanes: [
      lane('North path', 'North', COMPASS_DEG['north-west'],
        [[-1, 2], [9, 2], [9, 12], [16, 12], [16, 8], [19, 8]],
        [[2, 4], [4.25, 4.5]]),
      lane('South path', 'South', COMPASS_DEG['south-west'],
        [[-1, 13], [4, 13], [4, 7], [13, 7], [13, 4], [17, 4], [17, 7], [19, 7]],
        [[1, 8.25], [1.75, 11]]),
    ],
    pads: [
      [7, 4.25], [10.75, 4.25], [14.75, 5.25], [8, 8], [14.75, 8.25], [6.25, 9.25],
      [11.25, 9.25], [13.75, 10], [12.5, 13.375], [18.75, 11.25], [16.5, 13.25],
    ],
    woodPads: [1, 5, 8],
    trees: [[0, 0], [12, 0], [21, 0], [22, 12], [3, 15], [14, 15]],
    rubble: [[6, 1], [11, 2], [2, 11], [13, 10], [20, 13]],
    bushes: [[7, 3], [12, 5], [15, 6], [3, 5], [6, 11], [10, 10], [18, 2], [17, 13], [21, 12], [0, 9]],
    lamps: [[18, 5], [18, 11]],
    plaza: { x0: 18, y0: 5, x1: 22, y1: 10 },
    margin: { left: 14 },
  },

  // The north trail fords a stream and joins the south trail for the last stretch: one big choke point.
  ford: {
    key: 'ford', name: 'Ford', blurb: 'The north trail fords a stream and joins the south trail before the Relay.',
    hpMult: 1.18,   // enemy health × this on this map (DefenseScene.hpMult; balance sim: the trails share their last stretch: one big choke point)
    width: FIELD.w, height: FIELD.h,
    core: { x: 20.6, y: 8.2 }, coreRadius: 1.2,
    lanes: [
      lane('North path', 'North', COMPASS_DEG['north-west'],
        [[-1, 2], [4, 2], [4, 6], [9, 6], [9, 3], [13, 3], [13, 7], [15, 7], [15, 10], [17, 10], [17, 8], [19, 8]],
        [[1.5, 4.25], [1.25, 7]]),
      lane('South path', 'South', COMPASS_DEG['south-west'],
        [[-1, 12], [5, 12], [5, 9], [10, 9], [10, 12], [15, 12], [15, 10], [17, 10], [17, 8], [19, 8]],
        [[3, 10.5], [1.5, 13.375]]),
    ],
    pads: [
      [6.25, 3.25], [10.75, 4.25], [6.75, 7.5], [11.25, 7.25], [13, 9.25], [15.75, 4],
      [7.25, 10.375], [9, 7.75], [17.75, 11.75], [17, 5.75], [16, 8.75],
    ],
    woodPads: [3, 6, 10],
    trees: [[0, 0], [12, 0], [21, 0], [22, 13], [3, 15], [16, 14]],
    rubble: [[3, 4], [11, 1], [2, 10], [8, 13], [20, 13]],
    bushes: [[7, 4], [12, 5], [14, 2], [0, 6], [9, 11], [3, 13], [16, 6], [19, 12], [13, 13], [20, 4]],
    lamps: [[18, 5], [18, 11]],
    plaza: { x0: 18, y0: 5, x1: 22, y1: 10 },
    // A shallow stream (decorative: water with mud banks) crossing the north trail at a ford.
    stream: [[6.5, -6], [6.8, 1], [6.2, 5], [7.4, 8.4], [6.6, 16], [7, 22]],
    margin: { left: 14 },
  },
};

export const MAP_KEYS = Object.keys(DEFENSE_MAPS);

/** Back-compat alias (the classic layout). Code should use mapFor(run) / scene.map instead. */
export const DEFENSE_MAP = DEFENSE_MAPS.twin;

/** The map a run plays (unknown or missing key → 'twin', so saves from before map variants still load). */
export function mapFor(runOrKey) {
  const key = typeof runOrKey === 'string' ? runOrKey : runOrKey?.mapKey;
  return DEFENSE_MAPS[key] || DEFENSE_MAPS.twin;
}

/** A run's map from its seed (stable: the same seed always plays the same map). */
export function pickMapKey(seed) {
  let h = (Number(seed) || 0) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return MAP_KEYS[(h ^ (h >>> 16)) % MAP_KEYS.length];
}

/** Forward-pad slots of a map, flattened: [{ lane, at: [x, y], rank }] — pad index = map.pads.length + i. */
export function forwardSlots(map) {
  const out = [];
  map.lanes.forEach((l, li) => (l.forward || []).forEach((at, rank) => out.push({ lane: li, at, rank })));
  return out;
}

/** Highest pad index + 1 any tower may use on this map (base pads + every forward slot). */
export function padCount(map) {
  return map.pads.length + forwardSlots(map).length;
}

const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/**
 * The lane facing a jungle direction (radians or degrees: `deg` true when degrees), screen convention
 * (atan2(dz, dx)). The lane whose bearing is closest wins; ties go to the lower index.
 */
export function laneForAngle(map, angle, deg = false) {
  const a = deg ? angle : (angle * 180) / Math.PI;
  let best = 0, bd = Infinity;
  map.lanes.forEach((l, i) => {
    const d = angDiff(a, l.bearing);
    if (d < bd - 1e-6) { bd = d; best = i; }
  });
  return best;
}

// Camera and lighting for the night map (DefenseScene, src/world/NightCamera.js). The night renders through
// the same integer pipeline as the day: internal size = window ÷ k (device px) at 32 px per tile, with k a
// whole number, so every texel is k × k screen pixels. The map viewport is the stage left of the side
// panel and below the top bar (measured from the DOM; `view` is the fallback in 960×540 UI units).
export const DEFENSE_VIEW = {
  res: [1280, 720],           // legacy fixed internal size (unused once NightCamera drives the zoom)
  woodPlinths: [],            // legacy (maps list their own woodPads)
  view: { x0: 0, y0: 46, x1: 750, y1: 540 },
  zoom: {
    // Default zoom: the largest k at which the whole field fits the map viewport. When that is only ×1 on a
    // window whose day view is ×3 or more (a browser window on a 1080p screen), ×2 is used if it still
    // shows `prefer` of the field (pan for the rest), so texels never shrink to 1 px on a big screen.
    prefer: 0.8,
    maxOverDay: 0,            // highest zoom = the day's scale + this
    panKeys: 700,             // arrow-key pan speed, CSS px per second
    dragThreshold: 4,         // CSS px a right/middle drag moves before it pans (a plain right click cancels)
    margin: 1.5,              // tiles of jungle the camera may show beyond the field when panning
  },
  spriteTint: '#a9b6e6',
  // Build-pad plinths: drawn per pad seed; their size follows the widest tower sprite (towerArt), so bigger
  // tower art (48 × 64) gets bigger plinths without new data.
  plinth: { w: [27, 33], top: [21, 27], face: [5, 8], chips: [1, 3] },
  // Towers draw a 1-texel outline (Assets outline) in their type colour so they separate from the plinth
  // and the dark ground; `towerOutlineMix` darkens that colour toward black (0 = type colour, 1 = black).
  // typeBrackets: also the dashed type-coloured square on the pad (off: reads as a TD board, critic G #12).
  towerOutlineMix: 0.3,
  typeBrackets: false,
  levelPips: false,           // amber level pips on the plinth (off: the chevrons say the level, critic K §4.3)
  background: '#070a14',
  // Moonlit jungle night (critic H §4.5: the old map was lit greener and brighter than the jungle at night):
  // a cool blue hemisphere + moon, cyan Relay light, amber lamp pools (dithered PixelGlow decals + lights).
  light: {
    hemiSky: '#5a72c0', hemiGround: '#141428', hemi: 1.45,
    moon: '#a8bcff', moonI: 1.25,
    core: '#2ce8f5', coreI: 7, coreDist: 8,
    lamp: '#feae34', lampI: 3.4, lampDist: 4.2,
  },
  // Night grade through the jungle's PostFx (src/core/PostFx.js) at full dark: the scene is lit near-neutral
  // (post.light over light) and the grade makes it moonlit (tint × ambient, a navy lift into the blacks), while
  // glowing texels (Emissive.js: eyes, the Relay crystal) and light pools (PixelGlow.lightPool) skip it, so at
  // night the glows are what you see and the board is the jungle after dark (critic H §4.4–4.5).
  // on: false = the older lit-scene look (light, spriteTint, additive pools).
  post: {
    on: true, ambient: 0.64, tint: [0.6, 0.72, 1.08], moonFloor: 0.2, lift: [0.004, 0.008, 0.02], emit: 1.06, vignette: 0.28,
    spriteTint: '#ffffff',
    unitLift: 0.3,            // enemies and towers: share of the way back to full colour (readable without rings)
    barLift: 1,               // enemy health bars: fully lit
    light: { hemiSky: '#ffffff', hemiGround: '#6a7088', hemi: 2.0, moon: '#ffffff', moonI: 2.2, coreI: 4, lampI: 2 },
  },
  // Light pools (PixelGlow): with post.on they are light sources: `strength` is the colour they add, `emit`
  // how far the pixels they light escape the moonlight (0 = still moonlit, 1 = full daylight at the centre).
  glow: {
    core: { w: 5, h: 3, color: '#2ce8f5', strength: 0.26, emit: 0.4, steps: 4, power: 1.6 },
    lamp: { w: 4, h: 2.75, color: '#feae34', strength: 0.3, emit: 0.45, steps: 4, power: 1.6 },
    forward: { w: 1.6, h: 1, color: '#2ce8f5', strength: 0.4, emit: 0.5, steps: 3, power: 1.2 },
  },
  // Lane wear (DefenseGround): a trodden, lighter centre band (moonlit: the trails read at night), two
  // broken wobbly wheel ruts, mud puddles, stones and footprints, like the day's trails.
  wear: { band: 13, bandLight: 1.08, bandTarget: 122, bandMax: 1.5, rutOffset: 6, rutGap: 0.3, puddles: 0.12, stones: 0.22 },
  // Board clutter (critic H fix 9): empty pads glow only when they matter; hostile rings only on the
  // hovered enemy and the selected tower's target.
  pads: { idleOpacity: 0.32, pulse: [0.4, 0.25] },
  leakRows: 3,                // live leak feed (in-wave side panel): newest rows shown
  // Visible rewards: a flooded-path tint on a laneSlow lane, a glint on towers while towerRate/towerDamage apply.
  rewards: { laneTint: '#3a7cc0', laneTintAlpha: 0.5, glintEvery: 2.2 },   // laneTint multiplies the trail (wet, cooler)
};
