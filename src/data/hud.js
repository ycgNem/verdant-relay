// HUD / map / menu-input tuning (src/ui/JungleMap.js, the jungle HUD in JungleScene, BriefingScene).

export const MAP_VIEW = {
  // HUD minimap (round, top-right).
  miniSpan: 40,          // tiles across the minimap circle
  miniEvery: 6,          // redraw every N frames
  containerRange: 18,    // supply caches show on the maps within this many tiles of the player
  // Big map (Tab). Zoom is whole device px per tile so the map stays pixel-exact.
  bigFitPad: 10,         // tiles of margin around the explored area when the map opens
  bigZoomMax: 12,        // device px per tile, most zoomed in
  bigZoomMinFit: true,   // most zoomed out = the whole jungle fits the canvas
  panSpeed: 520,         // keyboard pan speed, device px per second
};

export const HUD = {
  edgeMargin: 26,        // off-screen arrows sit this many --u from the stage edge
  threatFadeEvery: 6,    // frames between "enemy behind a HUD panel" checks
  // Health bar (critic L §3: at 28–38 HP it was the stamina bar's orange): green above `ok`, yellow above `low`,
  // red below; under `pulse` the screen edge pulses red.
  health: { ok: 0.6, low: 0.3, pulse: 0.3, colors: ['#63c74d', '#fee761', '#e43b44'] },
  markLift: 0.35,        // world units above a sprite's top where an in-world ◆ marker floats
};

export const MENU_INPUT = {
  // The briefing ignores pointer input this long after it opens, and a card only takes a click
  // whose pointerdown also landed on it (the "Night survived" banner's dismiss click can't leak in).
  briefingGuard: 0.7,
};
