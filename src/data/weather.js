// Weather / day modifiers (critic J N2; src/world/Weather.js). From night `fromNight` a day has a `chance` of one of
// these (seeded per run and night: Run.weatherFor), shown on the briefing and as a tag on the jungle HUD.
// Gameplay fields:
//   detect     × creatures' sight range (ExploreEnemy) · noise: × the radius at which your cutting draws creatures
//   noRustle   ferns don't rustle (no fern-push sound, no rustle cue from creatures slipping through the brush)
//   lightMult  × your light radius (PostFx) · lootScrap: × Scrap in every container (Run.lootMults)
//   staminaRegen × stamina refill (Player) · pods: × spore pods (extra ones grow near the others)
// Look / sound (PostFx uniforms; all pixel-exact, world-anchored Bayer dithers):
//   tint       linear RGB multiplier over the whole view · fog: strength of a dithered veil that thickens away
//   from you (fogColor) · rain: density of 1-px rain streaks (streak length / speed in RAIN_LOOK) + puddle
//   ripples per second around you (ripples) · shafts: × the light shafts · audio: AmbientAudio.setRain level.
export const WEATHER = {
  fromNight: 2,
  chance: 0.35,
  weights: { rain: 1, fog: 1, heat: 1 },
  kinds: {
    rain: {
      name: 'Rain', icon: '☂',
      short: 'Creatures spot you later and your cutting is quieter, but nothing rustles in the ferns',
      detect: 0.7, noise: 0.6, noRustle: true,
      tint: [0.8, 0.86, 0.96], rain: 1, ripples: 9, shafts: 0, audio: 1,
    },
    fog: {
      name: 'Fog', icon: '≋',
      short: 'You see 35% less, but containers hold 20% more Scrap',
      lightMult: 0.65, lootScrap: 1.2,
      tint: [0.92, 0.95, 0.96], fog: 0.85, fogColor: [0.6, 0.66, 0.64], shafts: 0, audio: 0,
    },
    heat: {
      name: 'Heat', icon: '☀',
      short: 'Stamina refills 25% slower and spore pods are everywhere',
      staminaRegen: 0.75, pods: 1.5,
      tint: [1.08, 1.0, 0.85], fog: 0.3, fogColor: [0.86, 0.72, 0.48], shafts: 1.5, audio: 0,
    },
  },
};
export const WEATHER_KEYS = Object.keys(WEATHER.kinds);

// Rain streaks (PostFx): a streak every `gap` px across, `len` px long, falling `speed` px/s and leaning one px left
// every `slant` px down; `period` = px between drops on one streak line (varied per line); `mix` = how far a streak
// texel moves toward `color`. Ripples (Weather.js): a ring of `radius` tiles that lives `life` s.
export const RAIN_LOOK = {
  gap: 6, len: 7, speed: 420, slant: 3, period: [46, 80], mix: 0.42, color: [0.78, 0.86, 0.94],
  ripple: { radius: 0.32, life: 0.45, color: '#a8c4dc' },
};
