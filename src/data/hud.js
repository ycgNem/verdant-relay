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
  // Day creatures' hostile ground ring (critic H2 §5.8): only on one winding up / attacking / holding an attack slot,
  // an alerted one within ringNear tiles, elites and area bosses (JungleScene, the occlusion loop).
  ringNear: 2.6,
};

// One text lane (critic H2 §5.1; src/ui/ui.js toast, JungleScene._banner). Toasts: a host shows at most its CSS
// `--max-toasts` at once; the rest wait (at most `max`, dropped after `stale` s); a toast on screen with others waiting
// leaves after `hurry` s; while a banner is up new toasts are held, each for at most `hold` s.
// Banners own the top-centre band, one at a time: `time` s on screen (+ `fade`), a higher `prio` cuts a lower one
// (place names 0 < goal / sunset 1 < area boss 2); a waiting place name is dropped after `placeWait` s.
// `extraDelay`: a banner's follow-up line (a boss kill's rewards) fades in this long after it.
export const TEXT_LANE = {
  toast: { max: 4, stale: 10, hold: 2.5, hurry: 1.6 },
  banner: { time: 2.6, fade: 0.6, placeTime: 2.8, placeWait: 4, extraDelay: 1.2 },
};

export const MENU_INPUT = {
  // The briefing ignores pointer input this long after it opens, and a card only takes a click
  // whose pointerdown also landed on it (the "Night survived" banner's dismiss click can't leak in).
  briefingGuard: 0.7,
};
