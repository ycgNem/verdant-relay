// The night map around the Relay. Tile coordinates: tile (x, y) has its centre at (x + 0.5, y + 0.5)
// in world space (world X = x, world Z = y). Lane points are tile coordinates too, so enemies walk
// down the middle of lane tiles. Lanes are axis-aligned waypoint lists that end beside the core;
// enemies follow them exactly, so towers can never block a route. The first point sits off the
// left edge so enemies walk in from outside the view.

export const DEFENSE_MAP = {
  width: 30,
  height: 17,
  core: { x: 27.6, y: 9.0 },        // world-space centre of the Relay Core
  coreRadius: 1.2,
  lanes: [
    { name: 'North lane', short: 'North', points: [[-3, 3], [8, 3], [8, 7], [16, 7], [16, 4], [23, 4], [23, 8], [26, 8]] },
    { name: 'South lane', short: 'South', points: [[-3, 13], [6, 13], [6, 10], [13, 10], [13, 14], [20, 14], [20, 9], [26, 9]] },
  ],
  pads: [
    [4, 5], [10, 5], [6, 7], [10, 8], [14, 8], [18, 6], [19, 2], [21, 6], [25, 6],
    [4, 11], [9, 12], [11, 12], [16, 12], [18, 10], [22, 11], [25, 11],
  ],
  // Decorative scenery (tile coords). Kept off lanes and pads, and placed so tall sprites don't
  // hide a lane tile behind them (billboards cover ~0.7 × height of ground behind their base).
  trees: [
    [1, 0], [3, 1], [12, 1], [14, 1], [27, 1], [28, 3], [1, 7], [2, 9], [0, 16], [3, 16], [9, 16],
    [24, 16], [28, 14], [27, 16], [11, 3], [29, 6], [17, 16], [22, 1], [6, 16], [14, 16], [29, 11],
  ],
  rubble: [[12, 5], [2, 5], [26, 14], [17, 1], [8, 15], [23, 12], [15, 10], [20, 2]],
  bushes: [[5, 1], [9, 1], [2, 11], [5, 15], [11, 15], [19, 12], [13, 5], [18, 8], [24, 2], [21, 16], [7, 5], [15, 2], [26, 3], [8, 9]],
  lamps: [[26, 5], [26, 13]],
  // Concrete plaza under the Relay (tile rect, inclusive) and the outer ground margin drawn around
  // the 30×17 field so the view never shows the void.
  plaza: { x0: 24, y0: 6, x1: 29, y1: 11 },
  margin: { left: 8, right: 12, top: 11, bottom: 7 },
  borderTrees: 70,                   // extra trees scattered outside the field
};

// Camera and lighting for the night map. The camera is fitted at runtime so the whole field fits
// inside `view` (a rect in 960×540 UI units), leaving room for the HUD bar and the side panel.
export const DEFENSE_VIEW = {
  fov: 38,
  pitch: 55,                         // degrees below horizontal
  view: { x0: 6, y0: 46, x1: 718, y1: 534 },
  fitMargin: 0.15,                   // tiles of slack around the field
  spriteTint: '#9fb4e8',
  background: '#0a0d1a',
  light: {
    hemiSky: '#6f84c8', hemiGround: '#1b1a2e', hemi: 1.6,
    moon: '#b4c8ff', moonI: 1.4,
    core: '#2ce8f5', coreI: 7, coreDist: 9,
    lamp: '#feae34', lampI: 3.2, lampDist: 4.5,
  },
};
