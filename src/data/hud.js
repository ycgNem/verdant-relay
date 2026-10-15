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
  questBig: 2,           // the quest ◆ × this on the big map (with a blinking ring), critic Q
  questMini: 1.3,        // … and on the minimap
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

// The day's quest (Stage 9, src/scenes/JungleQuest.js): the quest card, the tracker, the edge arrow, the marker over
// the target, the pointer by the player and the light beam over the quest site. Sizes in world texels (×2 at 720p,
// ×3 at 1080p: --tx), times in s, distances in tiles.
//   card     the card at the day's start (and on the quest key): on screen at least `min` s, then gone once you have
//            walked `moveDist` tiles, else after `time` s. The quest key (Settings → Controls, default J) re-opens it.
//   tick     a finished step stays on the tracker, ticked, this long before the next one shows
//   done     the QUEST COMPLETE banner's time on screen
//   arrow    the edge arrow: `size` art pixels (with its outline and a `glow` ring that wide), each `scale` world
//            texels (2: twice the world's pixel size, user: "much more obvious"), `dirs` directions, `margin` texels
//            from the stage edge, `bob` art pixels it bobs toward the target, `gap` texels to its distance badge
//   mark     the marker over an on-screen target (◆ + ▼): `lift` tiles above the sprite's top; hidden within `near`
//            tiles of you (the prompt takes over)
//   orbit    the small pointer by the player: shown when the target is off screen and at least `minDist` m away and
//            no creature is after you within `calm` tiles; `radius` texels from the player, `size` texels
//   beam     a light pool + column over each target of the current step (PixelGlow, like a switched-on beacon but
//            amber); hidden within `hideNear` tiles of you
export const QUEST = {
  card: { min: 2.5, time: 8, moveDist: 1.5 },
  tick: 1.4,
  done: 3.8,
  arrow: { size: 25, glow: 2, scale: 2, dirs: 8, margin: 2, bob: 2, gap: 2 },
  mark: { lift: 0.3, near: 1.6, bridgeTop: 0.4 },
  orbit: { minDist: 22, calm: 8, radius: 44, size: 13 },
  // "cross at the bridge" (JungleScene._updateFord, critic Q): rechecked every `every` frames; the walk fields from the
  // target rebuilt when it moves more than `move` tiles (at most every `refield` s); no hint when a land-only route is at
  // most `landSlack` × the shortest walk.
  ford: { every: 15, move: 3, refield: 1, landSlack: 1.3 },
  beam: {
    w: 3.2, h: 2, steps: 4, power: 1.2, color: '#feae34', strength: 0.45,
    beam: true, beamW: 12, beamH: 128, beamY: 1.4, beamStrength: 0.95, pulse: 3,
    hideNear: 5,
  },
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
