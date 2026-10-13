// The night map around the Relay. Tile coordinates; tile (x, y) has its centre at (x + 0.5, y + 0.5)
// in world space (world X = x, world Z = y). Lanes are axis-aligned waypoint lists that end at
// the core; enemies follow them exactly, so towers can never block a route.

export const DEFENSE_MAP = {
  width: 30,
  height: 17,
  core: { x: 27, y: 8.5 },          // world-space centre of the Relay Core
  coreRadius: 1.2,
  lanes: [
    { name: 'North lane', points: [[-1, 3], [8, 3], [8, 7], [16, 7], [16, 4], [23, 4], [23, 8], [26, 8]] },
    { name: 'South lane', points: [[-1, 13], [6, 13], [6, 10], [13, 10], [13, 14], [20, 14], [20, 9], [26, 9]] },
  ],
  pads: [
    [4, 5], [10, 5], [6, 7], [10, 8], [14, 8], [18, 6], [19, 2], [21, 6], [25, 6],
    [4, 11], [9, 12], [11, 12], [16, 12], [18, 10], [22, 11], [25, 11],
  ],
  // Decorative scenery (tile coords). Kept off lanes and pads.
  trees: [
    [1, 0], [3, 1], [12, 1], [14, 2], [27, 1], [28, 3], [1, 7], [2, 9], [0, 16], [3, 16], [9, 15],
    [24, 15], [28, 14], [27, 16], [11, 3], [29, 7], [17, 16], [22, 1], [6, 16], [14, 16],
  ],
  rubble: [[12, 5], [2, 5], [26, 13], [17, 1], [8, 15], [23, 12]],
};
