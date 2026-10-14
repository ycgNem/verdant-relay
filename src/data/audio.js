// Audio tuning: the mix, every one-shot sound (as synth layers, see src/core/synth.js), the jungle
// ambience beds and the audio director's thresholds. All of it is synthesized at runtime.
//
//   game.sfx.play(name, { vol, pan, rate, delay })      one-shot (src/core/Sfx.js)
//   game.sfx.playAt(name, x, z, opts)                   positional: pan by screen-x, quieter + duller with distance
//
// Sound fields: bus ('sfx' default | 'ui'), vol (overall level), pitch (± random semitones per play),
// vary (random level drop 0..1), gap (s: same sound closer than this is skipped), max (voices of this sound
// at once), pri (2 = never dropped by the voice cap), send (reverb send 0..1), duck (dip the music bus by
// this much for the sound's length — stings), layers (synth layers).

export const MIX = {
  // Fixed trims under the player's sliders (Settings: master, music, sound effects, ambience).
  trim: { sfx: 1, ui: 0.85, music: 1, ambience: 1 },
  // Master bus → glue compressor → brick-wall limiter → speakers.
  compressor: { threshold: -18, knee: 8, ratio: 4, attack: 0.004, release: 0.2 },
  limiter: { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.06 },
  voices: 34,                // one-shots alive at once (low-priority ones are dropped beyond this)
  perName: 5,                // default `max` per sound
  gap: 0.03,                 // default `gap`
  priExtra: 6,               // pri-2 cues may exceed `voices` by this many when every voice is a pri-2 cue
  stack: 0.3,                // each voice of the same sound already playing lowers a new one by 1/(1 + stack·n)
  reverb: { time: 1.7, decay: 2.6, tone: 5200, wet: 0.9 },
  duck: { attack: 0.06, release: 0.9 },
  // playAt: listener = the player in the jungle (else no distance falloff, pan only — the night map shows it all).
  positional: { near: 4, far: 22, curve: 1.4, panWidth: 0.85, panMax: 0.8, muffleFrom: 7, muffleHz: [18000, 1600], minGain: 0.025 },
  hoverGap: 0.05,            // UI hover ticks
  muteKey: 'F2',             // global mute toggle (M is the jungle map key)
  defaults: { master: 0.8, volume: 0.6, music: 0.5, ambience: 0.6 },
};

// The wind-up tell ("it's about to hit"): a bright metallic shing, a rising chirp into an FM ring. Spread into
// every windup_* voice; tells carry further than ordinary world sounds (`near`, see Sfx.playAt).
const glint = [
  { w: 'sine', f: 1800, f2: 3600, dur: 0.06, a: 0.002, vol: 0.5 },
  { w: 'fm', f: 2900, ratio: 3.01, index: 1.2, index2: 0.1, dur: 0.24, a: 0.002, at: 0.03, vol: 0.9 },
];

export const SOUNDS = {
  // ------------------------------------------------------------------ UI (menus)
  ui_hover: { bus: 'ui', vol: 0.03, pitch: 0.5, gap: 0.04, max: 2, layers: [{ w: 'sine', f: 2300, f2: 2500, dur: 0.035, a: 0.002 }] },
  ui_move: { bus: 'ui', vol: 0.055, pitch: 0.3, gap: 0.03, max: 2, layers: [
    { w: 'triangle', f: 1480, dur: 0.05, a: 0.002 },
    { w: 'noise', fil: 'highpass', f: 6000, dur: 0.012, vol: 0.5 }] },
  ui_confirm: { bus: 'ui', vol: 0.08, pitch: 0.2, layers: [
    { w: 'triangle', f: 880, dur: 0.07, a: 0.003 },
    { w: 'triangle', f: 1318.5, dur: 0.15, a: 0.003, at: 0.055 },
    { w: 'fm', f: 2637, ratio: 2, index: 0.6, dur: 0.18, at: 0.055, vol: 0.2 }] },
  ui_back: { bus: 'ui', vol: 0.065, pitch: 0.2, layers: [
    { w: 'triangle', f: 987.8, dur: 0.06, a: 0.003 },
    { w: 'triangle', f: 659.3, dur: 0.13, a: 0.003, at: 0.05 }] },
  ui_tab: { bus: 'ui', vol: 0.07, pitch: 0.4, layers: [
    { w: 'noise', fil: 'bandpass', f: 2600, q: 3, dur: 0.03, vol: 0.8 },
    { w: 'sine', f: 1100, f2: 880, dur: 0.06, vol: 0.6 }] },
  open: { bus: 'ui', vol: 0.075, pitch: 0.3, layers: [
    { w: 'noise', fil: 'bandpass', f: 900, f2: 2600, q: 1.2, dur: 0.13, a: 0.03, vol: 0.35 },
    { w: 'triangle', f: 660, f2: 990, dur: 0.12, a: 0.005 }] },
  error: { bus: 'ui', vol: 0.085, gap: 0.08, layers: [
    { w: 'triangle', f: 233, dur: 0.07, lp: 1400 },
    { w: 'triangle', f: 185, dur: 0.13, at: 0.08, lp: 1400 }] },
  tally: { bus: 'ui', vol: 0.03, pitch: 0.3, gap: 0.035, max: 2, layers: [
    { w: 'sine', f: 1568, dur: 0.03 }, { w: 'sine', f: 3136, dur: 0.02, vol: 0.3 }] },
  coach: { bus: 'ui', vol: 0.06, layers: [{ w: 'fm', f: 1046.5, ratio: 2, index: 0.5, index2: 0.05, dur: 0.35 }], send: 0.2 },

  // ------------------------------------------------------------------ player (jungle)
  slash: { vol: 0.24, pitch: 1.5, gap: 0.04, layers: [
    { w: 'noise', fil: 'bandpass', f: 900, f2: 3400, q: 1.1, dur: 0.12, a: 0.012 },
    { w: 'pink', fil: 'lowpass', f: 1300, f2: 500, dur: 0.09, a: 0.006, vol: 0.45 },
    { w: 'fm', f: 3100, f2: 3350, ratio: 1.41, index: 0.4, dur: 0.07, at: 0.03, vol: 0.05 }] },
  chop: { vol: 0.3, pitch: 1, layers: [
    { w: 'noise', fil: 'bandpass', f: 400, f2: 1700, q: 0.9, dur: 0.2, a: 0.035 },
    { w: 'brown', fil: 'lowpass', f: 900, f2: 280, dur: 0.18, a: 0.02, vol: 0.6 },
    { w: 'sine', f: 120, f2: 68, dur: 0.14, at: 0.04, vol: 0.7 }] },
  cut: { vol: 0.16, pitch: 2, gap: 0.04, layers: [
    { w: 'noise', fil: 'highpass', f: 3200, dur: 0.035, a: 0.001 },
    { w: 'noise', fil: 'bandpass', f: 2600, f2: 1100, q: 0.7, dur: 0.17, a: 0.005, vol: 0.7, am: [38, 0.5] },
    { w: 'sine', f: 340, f2: 160, dur: 0.06, vol: 0.45 }] },
  fern_push: { vol: 0.04, pitch: 2, gap: 0.09, max: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 2300, f2: 3100, q: 0.7, dur: 0.15, a: 0.04, am: [12, 0.5] }] },
  flesh: { vol: 0.24, pitch: 1.5, layers: [   // foley, not a blip: slap + body + a low sub-thump
    { w: 'noise', fil: 'lowpass', f: 1500, f2: 300, dur: 0.09, a: 0.002 },
    { w: 'brown', fil: 'lowpass', f: 800, f2: 200, dur: 0.1, a: 0.002, vol: 0.8 },
    { w: 'sine', f: 95, f2: 50, dur: 0.09, vol: 0.45 },
    { w: 'noise', fil: 'bandpass', f: 900, f2: 500, q: 2.5, dur: 0.07, at: 0.015, vol: 0.4 }] },
  kill: { vol: 0.27, pitch: 1, layers: [
    { w: 'noise', fil: 'lowpass', f: 1800, f2: 250, dur: 0.16, a: 0.002 },
    { w: 'sine', f: 130, f2: 55, dur: 0.2, vol: 0.9 },
    { w: 'noise', fil: 'bandpass', f: 1500, q: 1.5, dur: 0.018, at: 0.02, n: [3, 5], every: [0.018, 0.03], vol: 0.45 },
    { w: 'noise', fil: 'bandpass', f: 700, f2: 350, q: 3, dur: 0.12, at: 0.04, vol: 0.3 }] },
  crack: { vol: 0.27, layers: [
    { w: 'noise', fil: 'bandpass', f: 1400, f2: 260, q: 0.8, dur: 0.22, a: 0.002 },
    { w: 'sine', f: 90, f2: 45, dur: 0.25, vol: 0.9 },
    { w: 'noise', fil: 'highpass', f: 2500, dur: 0.012, n: [2, 4], every: [0.02, 0.05], at: 0.01, vol: 0.35 }] },
  charge_ready: { vol: 0.11, layers: [
    { w: 'fm', f: 2093, ratio: 3.01, index: 1.2, index2: 0.1, dur: 0.45, a: 0.002 },
    { w: 'sine', f: 1046.5, dur: 0.3, vol: 0.3 }] },
  roll: { vol: 0.15, pitch: 1.5, layers: [
    { w: 'noise', fil: 'bandpass', f: 500, f2: 1600, ft: 0.14, q: 0.9, dur: 0.3, a: 0.06 },
    { w: 'noise', fil: 'bandpass', f: 2600, q: 1.4, dur: 0.22, a: 0.02, am: [26, 0.7], vol: 0.3 },
    { w: 'brown', fil: 'lowpass', f: 420, dur: 0.1, at: 0.24, a: 0.005, vol: 0.55 }] },
  huff: { vol: 0.15, pitch: 1.5, gap: 0.4, layers: [
    { w: 'noise', fil: 'bandpass', f: 1300, f2: 900, q: 1.2, dur: 0.38, a: 0.04 },
    { w: 'noise', fil: 'bandpass', f: 650, f2: 520, q: 2, dur: 0.3, a: 0.03, vol: 0.6 }] },
  // combat verbs (Player.js): shoulder shove, thrown machete, deflect / riposte, perfect dodge
  shove: { vol: 0.2, pitch: 1.5, layers: [
    { w: 'noise', fil: 'bandpass', f: 700, f2: 1500, q: 0.9, dur: 0.16, a: 0.02, vol: 0.5 },
    { w: 'brown', fil: 'lowpass', f: 650, f2: 250, dur: 0.14, at: 0.05, vol: 0.9 },
    { w: 'sine', f: 120, f2: 65, dur: 0.14, at: 0.05, vol: 0.7 }] },
  machete_throw: { vol: 0.17, pitch: 1, layers: [
    { w: 'noise', fil: 'bandpass', f: 1300, f2: 2600, q: 1.2, dur: 0.38, a: 0.03, am: [18, 0.85] },
    { w: 'fm', f: 2900, f2: 3200, ratio: 1.41, index: 0.5, dur: 0.12, vol: 0.12 }] },
  machete_catch: { vol: 0.12, pitch: 1, layers: [
    { w: 'noise', fil: 'bandpass', f: 2600, q: 3, dur: 0.02 },
    { w: 'fm', f: 2200, ratio: 2.76, index: 1, index2: 0.1, dur: 0.16, vol: 0.5 },
    { w: 'brown', fil: 'lowpass', f: 400, dur: 0.06, vol: 0.4 }] },
  deflect: { vol: 0.2, pitch: 1, send: 0.2, layers: [
    { w: 'fm', f: 1760, ratio: 1.41, index: 3, index2: 0.3, dur: 0.45, a: 0.001 },
    { w: 'noise', fil: 'highpass', f: 4000, dur: 0.05, vol: 0.6 },
    { w: 'sine', f: 180, f2: 90, dur: 0.08, vol: 0.5 }] },
  riposte: { vol: 0.26, pitch: 1, send: 0.15, layers: [
    { w: 'fm', f: 2600, f2: 3100, ratio: 1.41, index: 0.8, dur: 0.1, vol: 0.25 },
    { w: 'noise', fil: 'lowpass', f: 2000, f2: 250, dur: 0.18, at: 0.03 },
    { w: 'sine', f: 130, f2: 50, dur: 0.22, at: 0.03, vol: 0.9 },
    { w: 'noise', fil: 'bandpass', f: 1500, q: 1.5, dur: 0.018, at: 0.05, n: [3, 5], every: [0.018, 0.03], vol: 0.45 }] },
  perfect_dodge: { vol: 0.13, send: 0.4, layers: [
    { w: 'noise', fil: 'bandpass', f: 400, f2: 2600, q: 1.1, dur: 0.4, a: 0.25 },
    { w: 'sine', f: 1318.5, f2: 2637, ft: 0.3, dur: 0.6, a: 0.05, vol: 0.25 }] },
  hurt: { vol: 0.26, pitch: 1, gap: 0.08, layers: [
    { w: 'noise', fil: 'lowpass', f: 2200, f2: 400, dur: 0.12, a: 0.002 },
    { w: 'sine', f: 150, f2: 70, dur: 0.16, vol: 0.85 },
    { w: 'noise', fil: 'bandpass', f: 800, f2: 560, q: 3, dur: 0.22, at: 0.02, a: 0.02, vol: 0.5 }] },
  player_down: { vol: 0.28, send: 0.3, layers: [
    { w: 'brown', fil: 'lowpass', f: 600, f2: 120, dur: 0.6, a: 0.005 },
    { w: 'sine', f: 110, f2: 40, dur: 0.7, vol: 0.75 },
    { w: 'triangle', notes: [0, -1, -5], base: 57, step: 0.28, at: 0.25, dur: 0.6, a: 0.02, lp: 1400, vol: 0.25 }] },
  med: { vol: 0.12, send: 0.25, layers: [
    { w: 'noise', fil: 'highpass', f: 1800, dur: 0.16, a: 0.005, am: [55, 0.8], vol: 0.55 },
    { w: 'sine', notes: [0, 4, 7, 12], base: 72, step: 0.07, at: 0.12, dur: 0.5, a: 0.03, vol: 0.5 }] },
  heartbeat: { vol: 0.34, gap: 0.3, pri: 2, layers: [
    { w: 'sine', f: 62, f2: 44, dur: 0.14, a: 0.004 },
    { w: 'sine', f: 56, f2: 40, dur: 0.16, a: 0.004, at: 0.2, vol: 0.75 },
    { w: 'brown', fil: 'lowpass', f: 160, dur: 0.1, vol: 0.5 }] },
  hold_tick: { vol: 0.045, gap: 0.02, max: 2, layers: [
    { w: 'sine', f: 1200, dur: 0.03 }, { w: 'noise', fil: 'bandpass', f: 4000, q: 2, dur: 0.01, vol: 0.4 }] },

  // footsteps (src/core/AudioDirector.js picks the surface under the player)
  step_dirt: { vol: 0.05, pitch: 3, gap: 0.08, max: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 420, f2: 200, dur: 0.07, a: 0.003 },
    { w: 'noise', fil: 'bandpass', f: 1800, q: 0.8, dur: 0.035, at: 0.005, vol: 0.3 }] },
  step_stone: { vol: 0.05, pitch: 3, gap: 0.08, max: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 2200, q: 1.6, dur: 0.03, a: 0.001 },
    { w: 'sine', f: 260, f2: 180, dur: 0.035, vol: 0.5 },
    { w: 'noise', fil: 'highpass', f: 5000, dur: 0.015, at: 0.03, vol: 0.2 }] },
  step_leaf: { vol: 0.045, pitch: 3, gap: 0.08, max: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 350, dur: 0.06 },
    { w: 'noise', fil: 'bandpass', f: 3200, q: 0.7, dur: 0.012, n: [2, 4], every: [0.008, 0.02], vol: 0.55 }] },
  step_moss: { vol: 0.045, pitch: 3, gap: 0.08, max: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 300, f2: 180, dur: 0.09, a: 0.006 }] },
  step_mud: { vol: 0.06, pitch: 3, gap: 0.08, max: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 380, f2: 900, q: 3, dur: 0.15, a: 0.02 },
    { w: 'sine', f: 110, f2: 160, dur: 0.1, vol: 0.4 },
    { w: 'noise', fil: 'bandpass', f: 1400, f2: 2200, q: 5, dur: 0.05, at: 0.1, vol: 0.25 }] },
  step_water: { vol: 0.07, pitch: 3, gap: 0.08, max: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 1600, f2: 700, q: 0.8, dur: 0.2, a: 0.004 },
    { w: 'noise', fil: 'highpass', f: 3000, dur: 0.12, a: 0.01, vol: 0.4 },
    { w: 'sine', f: 500, f2: 1100, dur: 0.05, at: 0.06, vol: 0.18 }] },
  step_fern: { vol: 0.045, pitch: 3, gap: 0.08, max: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 2200, f2: 3000, q: 0.8, dur: 0.16, a: 0.03, am: [14, 0.5] }] },

  // pickups (one chime per resource)
  pickup: { vol: 0.09, pitch: 0.5, gap: 0.04, layers: [
    { w: 'triangle', f: 988, dur: 0.06 }, { w: 'triangle', f: 1480, dur: 0.12, at: 0.05 }] },
  pick_scrap: { vol: 0.1, pitch: 1.5, gap: 0.04, layers: [
    { w: 'fm', f: 1850, ratio: 2.76, index: 1.4, index2: 0.2, dur: 0.16 },
    { w: 'fm', f: 2480, ratio: 2.76, index: 1, index2: 0.1, dur: 0.12, at: 0.045, vol: 0.7 }] },
  pick_circuits: { vol: 0.075, pitch: 0.5, gap: 0.04, layers: [
    { w: 'square', f: 1318.5, dur: 0.05, lp: 3500 }, { w: 'square', f: 1975.5, dur: 0.08, at: 0.06, lp: 3500 }] },
  pick_biofiber: { vol: 0.11, pitch: 1.5, gap: 0.04, layers: [
    { w: 'sine', f: 420, f2: 980, dur: 0.09, a: 0.004 },
    { w: 'noise', fil: 'bandpass', f: 1800, q: 1, dur: 0.08, vol: 0.3 },
    { w: 'sine', f: 784, dur: 0.18, at: 0.07, vol: 0.4 }] },
  pick_intel: { vol: 0.085, gap: 0.05, layers: [
    { w: 'sine', notes: [0, 4, 7, 12], base: 84, step: 0.045, dur: 0.07 },
    { w: 'square', f: 2637, dur: 0.03, at: 0.2, lp: 4000, vol: 0.3 }] },
  pick_med: { vol: 0.095, gap: 0.05, layers: [
    { w: 'noise', fil: 'bandpass', f: 1500, q: 2, dur: 0.03 },
    { w: 'sine', notes: [0, 7], base: 81, step: 0.06, dur: 0.22, vol: 0.8 }] },
  crate_open: { vol: 0.17, pitch: 1, layers: [
    { w: 'noise', fil: 'bandpass', f: 2200, q: 2, dur: 0.02 },
    { w: 'sawtooth', f: 150, f2: 118, dur: 0.26, a: 0.03, at: 0.03, lp: 900, q: 6, vib: [18, 30], vol: 0.3 },
    { w: 'brown', fil: 'lowpass', f: 500, dur: 0.12, at: 0.24, vol: 0.9 },
    { w: 'sine', f: 120, f2: 80, dur: 0.1, at: 0.24, vol: 0.55 }] },

  // ------------------------------------------------------------------ success hierarchy
  done: { vol: 0.11, send: 0.2, layers: [{ w: 'triangle', notes: [0, 7, 12], base: 72, step: 0.08, dur: 0.3 }] },
  step_done: { vol: 0.11, send: 0.25, layers: [
    { w: 'fm', f: 784, ratio: 2, index: 0.8, index2: 0.1, dur: 0.35 },
    { w: 'fm', f: 1174.7, ratio: 2, index: 0.8, index2: 0.1, dur: 0.5, at: 0.09 }] },
  bonus_done: { vol: 0.12, send: 0.3, layers: [{ w: 'fm', notes: [0, 4, 7], base: 76, step: 0.08, ratio: 2, index: 0.7, index2: 0.1, dur: 0.6 }] },
  goal_done: { vol: 0.15, send: 0.35, duck: 0.5, pri: 2, layers: [
    { w: 'triangle', notes: [0, 4, 7, 14], base: 60, step: 0.03, dur: 1.4, a: 0.02, hold: 0.3, lp: 2600, vol: 0.45 },
    { w: 'fm', notes: [12, 16, 19, 24], base: 60, step: 0.1, ratio: 2, index: 1, index2: 0.1, dur: 0.9, vol: 0.55 },
    { w: 'sine', f: 98, f2: 65, dur: 0.4, vol: 0.45 }] },
  beacon_on: { vol: 0.15, send: 0.4, duck: 0.4, pri: 2, layers: [
    { w: 'sawtooth', f: 55, f2: 110, ft: 0.6, dur: 1.4, a: 0.3, hold: 0.3, lp: 400, lp2: 1800, vol: 0.35 },
    { w: 'sine', f: 220, f2: 440, ft: 0.6, dur: 1.3, a: 0.4, vol: 0.35 },
    { w: 'fm', notes: [0, 7, 12], base: 74, step: 0.12, at: 0.55, ratio: 3, index: 1, index2: 0.1, dur: 1, vol: 0.55 }] },
  extract: { vol: 0.16, send: 0.35, duck: 0.5, pri: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 300, f2: 900, q: 1.5, dur: 1.4, a: 0.4, am: [21, 0.8], vol: 0.5 },
    { w: 'noise', fil: 'bandpass', f: 400, f2: 2400, q: 0.8, dur: 0.9, a: 0.5, at: 0.5, vol: 0.35 },
    { w: 'triangle', notes: [0, 7, 12, 16], base: 62, step: 0.06, at: 0.6, dur: 1.6, a: 0.05, hold: 0.4, lp: 3000, vol: 0.4 }] },
  head_out: { vol: 0.12, send: 0.25, layers: [
    { w: 'triangle', notes: [0, 7, 12], base: 57, step: 0.02, dur: 0.6, a: 0.01, lp: 2000 },
    { w: 'fm', f: 1318.5, ratio: 2, index: 0.8, index2: 0.1, dur: 0.6, at: 0.12, vol: 0.45 }] },
  skill: { vol: 0.12, send: 0.35, layers: [{ w: 'fm', notes: [0, 4, 7, 11, 14, 19], base: 72, step: 0.06, ratio: 2, index: 0.9, index2: 0.1, dur: 0.6 }] },
  // Relics & lore (JungleRelics): a relic picked up (a bell-like shimmer over a low hum), a shrine's offer, a data log.
  relic: { vol: 0.13, send: 0.45, duck: 0.35, pri: 2, layers: [
    { w: 'fm', notes: [0, 7, 12, 19, 24], base: 69, step: 0.07, ratio: 3.5, index: 1.2, index2: 0.1, dur: 1.1, vol: 0.55 },
    { w: 'sine', f: 110, f2: 220, ft: 0.4, dur: 1, a: 0.1, vol: 0.3 }] },
  shrine: { vol: 0.12, send: 0.55, layers: [
    { w: 'triangle', notes: [0, 5, 9, 12], base: 57, step: 0.09, dur: 1.6, a: 0.05, hold: 0.3, lp: 1800, vol: 0.5 },
    { w: 'fm', notes: [19, 24], base: 57, step: 0.2, at: 0.3, ratio: 3, index: 0.8, index2: 0.1, dur: 1.2, vol: 0.4 }] },
  lore: { vol: 0.1, send: 0.3, layers: [
    { w: 'square', notes: [12, 7, 19], base: 72, step: 0.05, dur: 0.12, lp: 2400, vol: 0.4 },
    { w: 'noise', fil: 'bandpass', f: 2600, q: 3, dur: 0.25, at: 0.16, vol: 0.25 }] },
  unlock: { vol: 0.13, send: 0.4, layers: [
    { w: 'fm', notes: [0, 4, 7, 12, 16, 19, 24], base: 67, step: 0.05, ratio: 2, index: 1, index2: 0.1, dur: 0.7 },
    { w: 'triangle', notes: [0, 4, 7], base: 55, step: 0.01, dur: 1.2, a: 0.02, hold: 0.2, lp: 1800, vol: 0.4 }] },
  summary_good: { vol: 0.12, send: 0.35, layers: [
    { w: 'triangle', notes: [0, 4, 7, 11], base: 60, step: 0.04, dur: 1.4, a: 0.03, hold: 0.3, lp: 2200, vol: 0.5 },
    { w: 'fm', notes: [16, 19, 23], base: 60, step: 0.14, at: 0.15, ratio: 2, index: 0.8, index2: 0.1, dur: 0.9, vol: 0.5 }] },
  summary_bad: { vol: 0.12, send: 0.4, layers: [
    { w: 'triangle', notes: [0, 3, 7], base: 52, step: 0.04, dur: 1.6, a: 0.06, hold: 0.3, lp: 1200, vol: 0.5 },
    { w: 'sine', notes: [7, 3], base: 64, step: 0.35, dur: 0.8, a: 0.02, vol: 0.35 }] },
  // Night survived: a 2.5 s Picardy-third sting (the night's A minor resolves to A major).
  night_won: { vol: 0.2, send: 0.45, duck: 0.15, pri: 2, layers: [
    { w: 'sine', f: 98, f2: 49, dur: 0.6, vol: 0.55 },
    { w: 'brown', fil: 'lowpass', f: 520, f2: 140, dur: 0.5, vol: 0.45 },
    { w: 'sawtooth', notes: [0, 7, 12, 16], base: 45, step: 0.025, dur: 2.4, a: 0.08, hold: 0.9, lp: 1400, lp2: 500, vol: 0.12 },
    { w: 'triangle', notes: [0, 7, 12, 16], base: 57, step: 0.03, dur: 2.4, a: 0.05, hold: 0.8, lp: 2600, vol: 0.35 },
    { w: 'fm', notes: [12, 16, 19, 24, 28], base: 57, step: 0.11, at: 0.2, ratio: 2, index: 1, index2: 0.1, dur: 1.4, vol: 0.4 }] },
  // Victory: IV → I with bells and a timpani roll, ~3.5 s.
  victory: { vol: 0.2, send: 0.5, duck: 0.1, pri: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 300, dur: 0.06, n: 10, every: 0.07, vol: 0.35, nvar: 0.05 },
    { w: 'sine', f: 98, f2: 55, at: 0.7, dur: 0.8, vol: 0.6 },
    { w: 'triangle', notes: [0, 5, 9, 12], base: 50, step: 0.03, dur: 0.8, a: 0.05, hold: 0.4, lp: 2200, vol: 0.35 },
    { w: 'triangle', notes: [0, 7, 12, 16, 19], base: 45, step: 0.03, at: 0.7, dur: 2.8, a: 0.05, hold: 1.2, lp: 2600, vol: 0.4 },
    { w: 'sawtooth', notes: [0, 7, 12], base: 33, step: 0.02, at: 0.7, dur: 2.8, a: 0.1, hold: 1, lp: 900, lp2: 300, vol: 0.12 },
    { w: 'fm', notes: [12, 16, 19, 24, 28, 31], base: 57, step: 0.12, at: 0.75, ratio: 2, index: 1, index2: 0.1, dur: 1.6, vol: 0.4 }] },
  // Defeat: a falling A minor line over a low drone, ~3 s.
  defeat: { vol: 0.19, send: 0.5, duck: 0.2, pri: 2, layers: [
    { w: 'sawtooth', f: 55, dur: 3, a: 0.4, hold: 1.2, lp: 320, lp2: 140, vol: 0.4 },
    { w: 'triangle', notes: [7, 5, 3, 0], base: 57, step: 0.42, dur: 1.1, a: 0.04, lp: 1500, vol: 0.45 },
    { w: 'brown', fil: 'lowpass', f: 700, f2: 120, dur: 1.2, a: 0.01, vol: 0.4 }] },

  // ------------------------------------------------------------------ jungle creatures
  // A blow landing on a creature: noise foley only (a slap, the body, a tick of contact), no tonal blip.
  hit: { vol: 0.17, pitch: 2.5, gap: 0.03, max: 4, layers: [
    { w: 'noise', fil: 'bandpass', f: 1500, f2: 700, q: 1.3, dur: 0.05, a: 0.001 },
    { w: 'brown', fil: 'lowpass', f: 700, f2: 200, dur: 0.09, a: 0.002, vol: 0.8 },
    { w: 'noise', fil: 'highpass', f: 3500, dur: 0.012, vol: 0.3 }] },
  rustle: { vol: 0.11, pitch: 1.5, gap: 0.06, max: 3, layers: [
    { w: 'noise', fil: 'bandpass', f: 2900, f2: 2100, q: 0.6, dur: 0.22, a: 0.03, am: [17, 0.7] },
    { w: 'pink', fil: 'lowpass', f: 700, dur: 0.18, a: 0.02, vol: 0.5 }] },
  death_small: { vol: 0.2, pitch: 2, layers: [
    { w: 'noise', fil: 'lowpass', f: 1600, f2: 300, dur: 0.14 },
    { w: 'sine', f: 160, f2: 70, dur: 0.16, vol: 0.75 },
    { w: 'triangle', f: 900, f2: 380, dur: 0.12, at: 0.01, lp: 2500, vol: 0.22 }] },
  death_big: { vol: 0.28, pitch: 1.5, send: 0.15, layers: [
    { w: 'sawtooth', f: 120, f2: 52, dur: 0.6, a: 0.02, lp: 700, lp2: 200, vib: [9, 40], vol: 0.4 },
    { w: 'brown', fil: 'lowpass', f: 900, f2: 120, dur: 0.5, vol: 0.75 },
    { w: 'sine', f: 90, f2: 38, dur: 0.45, vol: 0.75 },
    { w: 'noise', fil: 'bandpass', f: 600, f2: 300, q: 2.5, dur: 0.25, at: 0.05, vol: 0.3 }] },
  crash: { vol: 0.28, layers: [
    { w: 'brown', fil: 'lowpass', f: 2200, f2: 260, dur: 0.4 },
    { w: 'noise', fil: 'bandpass', f: 1800, q: 1.2, dur: 0.02, n: [4, 7], every: [0.02, 0.05], vol: 0.45 },
    { w: 'sine', f: 75, f2: 38, dur: 0.35, vol: 0.85 }] },
  charge: { vol: 0.22, layers: [
    { w: 'sawtooth', f: 520, f2: 860, dur: 0.32, a: 0.02, lp: 2200, vib: [24, 60], vol: 0.28 },
    { w: 'noise', fil: 'bandpass', f: 1200, q: 3, dur: 0.3, a: 0.02, vol: 0.28 },
    { w: 'brown', fil: 'lowpass', f: 300, dur: 0.06, n: 5, every: 0.085, at: 0.12, vol: 0.85 }] },
  snort: { vol: 0.22, pitch: 1, near: 8, layers: [...glint,
    { w: 'noise', fil: 'bandpass', f: 220, f2: 520, q: 2.2, dur: 0.24, a: 0.02, am: [30, 0.6] },
    { w: 'sine', f: 96, f2: 60, dur: 0.12, vol: 0.8 },
    { w: 'brown', fil: 'lowpass', f: 260, dur: 0.07, at: 0.3, n: 2, every: 0.16, vol: 0.6 }] },
  glint: { vol: 0.14, pitch: 1, near: 8, layers: [...glint] },
  windup: { vol: 0.14, pitch: 1, near: 8, layers: [...glint] },
  windup_feral: { vol: 0.17, pitch: 1.5, near: 8, layers: [...glint,
    { w: 'sawtooth', f: 95, f2: 120, dur: 0.45, a: 0.06, lp: 650, vib: [24, 50], vol: 0.45 },
    { w: 'noise', fil: 'bandpass', f: 420, q: 2, dur: 0.4, a: 0.06, am: [30, 0.7], vol: 0.4 }] },
  windup_crawler: { vol: 0.15, pitch: 2, near: 8, layers: [...glint,
    { w: 'noise', fil: 'bandpass', f: 3200, q: 4, dur: 0.014, n: [5, 7], every: 0.028, vol: 0.7 }] },
  windup_skitter: { vol: 0.14, pitch: 2, near: 8, layers: [...glint,
    { w: 'noise', fil: 'bandpass', f: 4300, q: 4, dur: 0.01, n: [7, 9], every: 0.02, vol: 0.7 }] },
  windup_spitter: { vol: 0.15, pitch: 1.5, near: 8, layers: [...glint,
    { w: 'noise', fil: 'bandpass', f: 480, f2: 950, q: 3, dur: 0.55, a: 0.08, am: [16, 0.8] },
    { w: 'sine', f: 200, f2: 330, dur: 0.5, a: 0.08, vib: [11, 60], vol: 0.35 }] },
  windup_scav: { vol: 0.14, near: 8, layers: [...glint,
    { w: 'noise', fil: 'bandpass', f: 3500, q: 6, dur: 0.015, vol: 0.7 },
    { w: 'noise', fil: 'bandpass', f: 2800, q: 6, dur: 0.02, at: 0.12, vol: 0.8 },
    { w: 'fm', f: 2900, ratio: 2.76, index: 0.8, dur: 0.06, at: 0.12, vol: 0.3 }] },
  windup_razorback: { vol: 0.2, near: 8, layers: [...glint, { w: 'noise', fil: 'bandpass', f: 220, f2: 520, q: 2.2, dur: 0.24, a: 0.02, am: [30, 0.6] }] },
  windup_feral_chief: { vol: 0.17, pitch: 1, near: 8, layers: [...glint,
    { w: 'sawtooth', f: 70, f2: 95, dur: 0.6, a: 0.08, lp: 520, vib: [18, 60], vol: 0.55 },
    { w: 'noise', fil: 'bandpass', f: 330, q: 2.2, dur: 0.55, a: 0.08, am: [24, 0.7], vol: 0.45 }] },
  // Stalker: burrows at you (a rising underground rumble + gravel), erupts; under the brush a soft chk-chk.
  windup_stalker: { vol: 0.26, near: 8, layers: [
    { w: 'brown', fil: 'lowpass', f: 160, f2: 520, dur: 0.9, a: 0.5, am: [11, 0.5] },
    { w: 'noise', fil: 'bandpass', f: 900, q: 1.5, dur: 0.015, n: [8, 12], every: [0.05, 0.09], at: 0.2, vol: 0.35 }] },
  stalker: { vol: 0.07, pitch: 2, gap: 0.45, max: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 2400, q: 5, dur: 0.012, n: 2, every: 0.09, vol: 0.9 },
    { w: 'noise', fil: 'bandpass', f: 2800, f2: 2000, q: 0.7, dur: 0.15, a: 0.03, am: [15, 0.6], vol: 0.4 }] },
  stalker_erupt: { vol: 0.28, pri: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 1800, f2: 200, dur: 0.45, a: 0.002 },
    { w: 'noise', fil: 'bandpass', f: 1300, q: 1.2, dur: 0.02, n: [5, 8], every: [0.02, 0.05], vol: 0.45 },
    { w: 'sawtooth', f: 160, f2: 240, dur: 0.35, a: 0.03, at: 0.05, lp: 1100, vib: [26, 80], vol: 0.3 },
    { w: 'sine', f: 80, f2: 40, dur: 0.3, vol: 0.7 }] },
  // Crawler: the clicking chitter before it lunges.
  chitter: { vol: 0.22, pitch: 2, near: 8, layers: [
    { w: 'noise', fil: 'bandpass', f: 3000, q: 5, dur: 0.012, n: [9, 13], every: [0.02, 0.028], nvar: 0.2, vol: 0.9 },
    { w: 'square', f: 1600, f2: 2100, dur: 0.25, lp: 3000, am: [40, 0.9, 'square'], vol: 0.1 }] },
  // Feral: the thrown spear (grunt + the shaft flying).
  spear_throw: { vol: 0.18, pitch: 1.5, layers: [
    { w: 'sawtooth', f: 150, f2: 110, dur: 0.16, a: 0.02, lp: 800, vib: [20, 40], vol: 0.3 },
    { w: 'noise', fil: 'bandpass', f: 600, f2: 2400, q: 1.6, dur: 0.3, a: 0.06, at: 0.05 }] },
  // Elite stamp: it rears (snort + rising rumble), then the ground cracks.
  stomp_windup: { vol: 0.22, near: 8, layers: [...glint,
    { w: 'noise', fil: 'bandpass', f: 200, f2: 420, q: 2, dur: 0.5, a: 0.1, am: [22, 0.6] },
    { w: 'brown', fil: 'lowpass', f: 140, f2: 300, dur: 0.6, a: 0.3, vol: 0.7 }] },
  stomp: { vol: 0.3, pri: 2, layers: [
    { w: 'sine', f: 70, f2: 30, dur: 0.5, a: 0.002 },
    { w: 'brown', fil: 'lowpass', f: 1400, f2: 120, dur: 0.5, vol: 0.85 },
    { w: 'noise', fil: 'bandpass', f: 1600, q: 1, dur: 0.02, n: [5, 8], every: [0.03, 0.07], at: 0.03, vol: 0.35 }] },
  // A creature knocked into a trunk / ruin: thud, wet, crunch.
  splat_wall: { vol: 0.26, layers: [
    { w: 'brown', fil: 'lowpass', f: 1200, f2: 200, dur: 0.25, a: 0.001 },
    { w: 'noise', fil: 'bandpass', f: 800, f2: 350, q: 3, dur: 0.14, at: 0.01, vol: 0.5 },
    { w: 'noise', fil: 'bandpass', f: 2200, q: 1.5, dur: 0.015, n: 3, every: 0.025, vol: 0.4 },
    { w: 'sine', f: 110, f2: 50, dur: 0.18, vol: 0.7 }] },
  // Feral Chief: its rallying bellow when it spots you (its Ferals speed up).
  chief_rally: { vol: 0.2, send: 0.35, pri: 2, near: 9, layers: [
    { w: 'sawtooth', f: 120, fp: [[0.25, 175], [0.8, 140]], dur: 0.9, a: 0.06, lp: 900, q: 3, vib: [6, 30], vol: 0.45 },
    { w: 'sawtooth', f: 181, fp: [[0.25, 262], [0.8, 210]], dur: 0.85, a: 0.08, lp: 1200, vol: 0.2 },
    { w: 'noise', fil: 'bandpass', f: 700, q: 2, dur: 0.8, a: 0.08, am: [7, 0.4], vol: 0.3 }] },
  // Bloater: the sac stretches and creaks, then pops into a spore cloud.
  bloater_swell: { vol: 0.17, near: 8, layers: [
    { w: 'noise', fil: 'bandpass', f: 220, f2: 900, q: 5, dur: 0.9, a: 0.6, am: [8, 0.5] },
    { w: 'sine', f: 90, f2: 260, dur: 0.9, a: 0.6, vib: [9, 40], vol: 0.45 },
    { w: 'sawtooth', f: 140, f2: 120, dur: 0.6, a: 0.2, at: 0.2, lp: 700, q: 8, vib: [14, 30], vol: 0.12 }] },
  bloater_burst: { vol: 0.28, layers: [
    { w: 'brown', fil: 'lowpass', f: 2200, f2: 150, dur: 0.45, a: 0.001 },
    { w: 'pink', fil: 'highpass', f: 2500, dur: 0.6, a: 0.02, at: 0.04, vol: 0.35 },
    { w: 'noise', fil: 'bandpass', f: 700, f2: 280, q: 3, dur: 0.2, vol: 0.5 },
    { w: 'sine', f: 140, f2: 50, dur: 0.2, vol: 0.7 }] },
  // The thrown machete: hits a creature, snags in a bramble, clanks off a trunk / rock (the whirr: AudioDirector).
  blade_hit: { vol: 0.2, pitch: 2, gap: 0.04, max: 3, layers: [
    { w: 'noise', fil: 'bandpass', f: 1300, f2: 600, q: 1.4, dur: 0.07, a: 0.001 },
    { w: 'brown', fil: 'lowpass', f: 600, dur: 0.08, vol: 0.7 },
    { w: 'fm', f: 2400, ratio: 1.41, index: 0.6, dur: 0.08, vol: 0.12 }] },
  blade_snag: { vol: 0.16, pitch: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 2600, f2: 1400, q: 0.9, dur: 0.12, am: [45, 0.7] },
    { w: 'fm', f: 1900, ratio: 2.76, index: 0.8, dur: 0.12, at: 0.02, vol: 0.25 }] },
  blade_clank: { vol: 0.18, pitch: 2, layers: [
    { w: 'fm', f: 1650, ratio: 2.76, index: 2.2, index2: 0.2, dur: 0.3, a: 0.001 },
    { w: 'noise', fil: 'highpass', f: 3500, dur: 0.03, vol: 0.5 },
    { w: 'brown', fil: 'lowpass', f: 500, dur: 0.06, vol: 0.5 }] },
  blade_whirr: { vol: 0.07, gap: 0.08, max: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 1500, q: 2, dur: 0.16, a: 0.02, am: [26, 0.9] }] },

  // ------------------------------------------------------------------ area bosses (src/entities/AreaBoss.js)
  // Waking (the fight starts; also layered on the phase-2 enrage), one voice per boss.
  boss_wake_thorn_mother: { vol: 0.26, send: 0.4, duck: 0.4, pri: 2, layers: [
    { w: 'sawtooth', f: 60, f2: 48, dur: 1.6, a: 0.3, hold: 0.3, lp: 600, q: 6, vib: [4, 60], vol: 0.45 },
    { w: 'noise', fil: 'bandpass', f: 1800, f2: 900, q: 0.8, dur: 1.4, a: 0.2, am: [13, 0.7], vol: 0.45 },
    { w: 'sawtooth', f: 180, f2: 140, dur: 0.8, a: 0.15, at: 0.3, lp: 900, q: 10, vib: [17, 40], vol: 0.15 },
    { w: 'sine', f: 50, dur: 1.2, a: 0.2, vol: 0.5 }] },
  boss_wake_brood_hive: { vol: 0.26, send: 0.35, duck: 0.4, pri: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 2600, q: 3, dur: 0.012, n: [24, 32], every: [0.02, 0.04], nvar: 0.3, vol: 0.5 },
    { w: 'brown', fil: 'lowpass', f: 300, dur: 1.4, a: 0.3, am: [3.5, 0.8], vol: 0.8 },
    { w: 'noise', fil: 'bandpass', f: 600, f2: 400, q: 4, dur: 1.2, a: 0.4, am: [19, 0.6], vol: 0.35 }] },
  boss_wake_warden: { vol: 0.22, send: 0.3, duck: 0.4, pri: 2, layers: [
    { w: 'sawtooth', f: 80, f2: 320, ft: 0.8, dur: 1.4, a: 0.1, hold: 0.4, lp: 1500, vol: 0.3 },
    { w: 'square', f: 660, fp: [[0.35, 880], [0.7, 660], [1.05, 880]], at: 0.5, dur: 1.2, a: 0.02, lp: 2000, vol: 0.16 },
    { w: 'noise', fil: 'highpass', f: 4000, dur: 0.15, a: 0.01, vol: 0.3 },
    { w: 'sine', f: 55, dur: 1.5, a: 0.3, vol: 0.4 }] },
  boss_wake_drowned_engine: { vol: 0.25, send: 0.35, duck: 0.4, pri: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 1400, q: 10, dur: 1.0, a: 0.1, vol: 0.7 },
    { w: 'sine', f: 1400, dur: 1.0, a: 0.1, vib: [6, 20], vol: 0.1 },
    { w: 'brown', fil: 'lowpass', f: 250, dur: 0.12, n: 8, every: 0.16, at: 0.3, vol: 0.9 },
    { w: 'sine', f: 45, dur: 1.6, a: 0.3, vol: 0.45 }] },
  boss_wake_pack_lord: { vol: 0.24, send: 0.5, duck: 0.4, pri: 2, layers: [
    { w: 'sawtooth', f: 300, fp: [[0.5, 470], [1.4, 380], [1.8, 300]], dur: 1.9, a: 0.25, lp: 1100, q: 2, vib: [5, 25], vol: 0.4 },
    { w: 'noise', fil: 'bandpass', f: 600, fp: [[0.5, 940]], q: 3, dur: 1.8, a: 0.3, vol: 0.35 },
    { w: 'sawtooth', f: 380, fp: [[0.4, 520], [1.0, 420]], at: 0.9, dur: 1.1, a: 0.2, lp: 900, vib: [6, 30], vol: 0.18 }] },
  // The phase-2 enrage: a hit, then a dissonant swell.
  boss_phase2: { vol: 0.22, send: 0.4, duck: 0.5, pri: 2, layers: [
    { w: 'sine', f: 90, f2: 35, dur: 0.6, a: 0.002 },
    { w: 'brown', fil: 'lowpass', f: 1500, f2: 150, dur: 0.6, vol: 0.7 },
    { w: 'sawtooth', notes: [0, 1, 6], base: 40, step: 0.02, dur: 1.4, a: 0.5, hold: 0.2, lp: 500, lp2: 1600, vol: 0.16 }] },
  // Deaths of the two machines (the creatures use boss_die).
  boss_death_warden: { vol: 0.3, send: 0.45, duck: 0.6, pri: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 2600, f2: 100, dur: 1.4, a: 0.002 },
    { w: 'sawtooth', f: 440, f2: 40, dur: 1.8, a: 0.01, lp: 2500, lp2: 200, vol: 0.22 },
    { w: 'noise', fil: 'highpass', f: 3000, dur: 0.02, n: [8, 12], every: [0.04, 0.12], vol: 0.4 },
    { w: 'fm', f: 900, ratio: 2.76, index: 3, index2: 0.2, at: 0.3, dur: 0.8, vol: 0.22 }] },
  boss_death_drowned_engine: { vol: 0.3, send: 0.45, duck: 0.6, pri: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 2200, f2: 100, dur: 1.4, a: 0.002 },
    { w: 'pink', fil: 'highpass', f: 1500, dur: 2.0, a: 0.05, vol: 0.45 },
    { w: 'sawtooth', f: 70, f2: 30, dur: 1.8, a: 0.05, lp: 400, vib: [3, 50], vol: 0.32 },
    { w: 'noise', fil: 'bandpass', f: 500, f2: 1200, q: 2, dur: 0.25, n: 3, every: 0.25, at: 0.8, vol: 0.25 }] },
  // Thorn Mother: vines tense, then crack like whips; spore pods lobbed in a run of hollow thoomps.
  vine_whip_windup: { vol: 0.17, near: 9, layers: [...glint,
    { w: 'sawtooth', f: 120, f2: 165, dur: 0.6, a: 0.25, lp: 700, q: 10, vib: [21, 30], vol: 0.3 },
    { w: 'noise', fil: 'bandpass', f: 1600, f2: 3000, q: 0.8, dur: 0.55, a: 0.35, am: [16, 0.5], vol: 0.6 }] },
  vine_whip: { vol: 0.24, gap: 0.05, max: 3, layers: [
    { w: 'noise', fil: 'highpass', f: 2500, dur: 0.03, a: 0.001 },
    { w: 'noise', fil: 'bandpass', f: 3000, f2: 900, q: 1, dur: 0.14, at: 0.005, vol: 0.6 },
    { w: 'brown', fil: 'lowpass', f: 600, dur: 0.1, at: 0.01, vol: 0.5 }] },
  spore_barrage: { vol: 0.2, layers: [
    { w: 'sine', f: 240, f2: 110, dur: 0.1, n: [3, 5], every: [0.08, 0.13], nvar: 0.2 },
    { w: 'noise', fil: 'bandpass', f: 700, q: 2, dur: 0.07, n: [3, 5], every: [0.08, 0.13], vol: 0.45 }] },
  // Brood Hive: brood born, the hive swells to burst, eggs lobbed and hatching.
  hive_spawn: { vol: 0.2, layers: [
    { w: 'noise', fil: 'bandpass', f: 400, f2: 900, q: 4, dur: 0.35, a: 0.05, am: [14, 0.6] },
    { w: 'noise', fil: 'bandpass', f: 3400, q: 5, dur: 0.01, n: [6, 9], every: 0.025, at: 0.25, vol: 0.5 },
    { w: 'sine', f: 160, f2: 90, dur: 0.2, vol: 0.4 }] },
  hive_swell: { vol: 0.2, near: 10, layers: [...glint,
    { w: 'brown', fil: 'lowpass', f: 200, f2: 700, dur: 1.0, a: 0.7, am: [6, 0.6] },
    { w: 'noise', fil: 'bandpass', f: 500, f2: 1400, q: 4, dur: 1.0, a: 0.7, vol: 0.4 }] },
  egg_burst: { vol: 0.3, pri: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 1800, f2: 120, dur: 0.6, a: 0.001 },
    { w: 'noise', fil: 'bandpass', f: 900, f2: 300, q: 2.5, dur: 0.35, vol: 0.5 },
    { w: 'noise', fil: 'bandpass', f: 1600, q: 2, dur: 0.02, n: [6, 10], every: [0.02, 0.05], at: 0.05, vol: 0.3 },
    { w: 'sine', f: 110, f2: 40, dur: 0.4, vol: 0.75 }] },
  egg_lob: { vol: 0.13, layers: [
    { w: 'sine', f: 300, f2: 140, dur: 0.12, n: [2, 3], every: 0.1 },
    { w: 'noise', fil: 'bandpass', f: 600, q: 3, dur: 0.1, vol: 0.4 }] },
  egg_hatch: { vol: 0.15, pitch: 2, max: 3, layers: [
    { w: 'noise', fil: 'bandpass', f: 1200, f2: 500, q: 2.5, dur: 0.12 },
    { w: 'noise', fil: 'bandpass', f: 3800, q: 5, dur: 0.01, n: [4, 6], every: 0.022, at: 0.08, vol: 0.6 }] },
  // Security Warden: drones deploy, hydraulic stamp, the laser charging and burning across the ground.
  drones_deploy: { vol: 0.17, layers: [
    { w: 'noise', fil: 'bandpass', f: 400, f2: 1400, q: 2, dur: 0.9, a: 0.2, am: [28, 0.8] },
    { w: 'square', notes: [24, 31], base: 60, step: 0.12, at: 0.5, dur: 0.08, lp: 3000, vol: 0.22 },
    { w: 'noise', fil: 'bandpass', f: 2200, q: 6, dur: 0.02, n: 2, every: 0.1, vol: 0.5 }] },
  warden_stomp: { vol: 0.3, layers: [
    { w: 'sine', f: 75, f2: 32, dur: 0.45, a: 0.002 },
    { w: 'fm', f: 520, ratio: 2.76, index: 2.5, index2: 0.2, dur: 0.45, vol: 0.32 },
    { w: 'pink', fil: 'highpass', f: 2000, dur: 0.4, a: 0.05, at: 0.08, vol: 0.3 },
    { w: 'brown', fil: 'lowpass', f: 1000, f2: 150, dur: 0.35, vol: 0.6 }] },
  laser_charge: { vol: 0.16, near: 12, pri: 2, layers: [
    { w: 'sawtooth', f: 200, f2: 1600, dur: 1.0, a: 0.6, lp: 2500, vol: 0.35 },
    { w: 'sine', f: 400, f2: 3200, dur: 1.0, a: 0.6, am: [18, 0.5], vol: 0.35 },
    { w: 'square', f: 1760, dur: 0.06, n: 4, every: 0.22, lp: 3500, vol: 0.18 }] },
  laser_sweep: { vol: 0.11, gap: 0.1, max: 3, layers: [
    { w: 'sawtooth', f: 110, dur: 0.25, a: 0.02, lp: 1800, am: [60, 0.6], vol: 0.6 },
    { w: 'noise', fil: 'bandpass', f: 3000, q: 1.5, dur: 0.25, a: 0.02, vol: 0.5 }] },
  // Drowned Engine: pressure builds, vents blow, the surge rolls, the steam blast.
  steam_build: { vol: 0.16, near: 10, layers: [
    { w: 'pink', fil: 'highpass', f: 1200, f2: 3500, dur: 0.9, a: 0.6 },
    { w: 'brown', fil: 'lowpass', f: 150, dur: 0.9, a: 0.4, am: [9, 0.6], vol: 0.7 }] },
  steam_vent: { vol: 0.21, gap: 0.05, max: 4, layers: [
    { w: 'noise', fil: 'highpass', f: 1800, dur: 0.5, a: 0.005 },
    { w: 'noise', fil: 'bandpass', f: 900, q: 1, dur: 0.3, vol: 0.5 },
    { w: 'sine', f: 90, f2: 50, dur: 0.15, vol: 0.4 }] },
  water_surge: { vol: 0.26, send: 0.3, pri: 2, layers: [
    { w: 'sawtooth', f: 55, f2: 70, dur: 1.2, a: 0.3, lp: 300, vol: 0.4 },
    { w: 'brown', fil: 'lowpass', f: 300, f2: 1600, dur: 1.2, a: 0.5, vol: 0.7 },
    { w: 'noise', fil: 'bandpass', f: 1200, q: 0.8, dur: 1.0, a: 0.5, at: 0.3, am: [7, 0.4], vol: 0.4 }] },
  steam_blast: { vol: 0.3, pri: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 2000, f2: 150, dur: 0.6, a: 0.002 },
    { w: 'noise', fil: 'highpass', f: 1500, dur: 0.9, a: 0.01, vol: 0.5 },
    { w: 'fm', f: 300, ratio: 2.76, index: 2, index2: 0.2, dur: 0.4, vol: 0.22 },
    { w: 'sine', f: 70, f2: 35, dur: 0.4, vol: 0.7 }] },
  // Pack Lord: its war cry (a ring that speeds up every Feral in it).
  war_cry: { vol: 0.24, send: 0.45, pri: 2, near: 10, layers: [
    { w: 'sawtooth', f: 160, fp: [[0.2, 240], [0.7, 210], [1.0, 150]], dur: 1.05, a: 0.05, lp: 1300, q: 3, vib: [7, 35], vol: 0.45 },
    { w: 'sawtooth', f: 240, fp: [[0.2, 360], [0.7, 315]], dur: 0.95, a: 0.06, lp: 1500, vol: 0.18 },
    { w: 'noise', fil: 'bandpass', f: 900, q: 2, dur: 0.9, a: 0.05, am: [9, 0.5], vol: 0.35 },
    { w: 'brown', fil: 'lowpass', f: 280, dur: 0.1, n: 3, every: 0.22, vol: 0.6 }] },

  // ------------------------------------------------------------------ goals (src/scenes/JungleGoals.js)
  escort_go: { vol: 0.11, layers: [
    { w: 'noise', fil: 'bandpass', f: 1800, q: 1, dur: 0.08, am: [70, 0.8] },
    { w: 'square', notes: [0, 7], base: 76, step: 0.09, at: 0.08, dur: 0.07, lp: 2500, vol: 0.35 }] },
  npc_hurt: { vol: 0.2, pitch: 1.5, gap: 0.15, layers: [
    { w: 'noise', fil: 'lowpass', f: 1800, f2: 400, dur: 0.1 },
    { w: 'noise', fil: 'bandpass', f: 1100, f2: 800, q: 4, dur: 0.2, a: 0.015, vol: 0.55 },
    { w: 'sine', f: 180, f2: 90, dur: 0.12, vol: 0.5 }] },
  goal_fail: { vol: 0.16, send: 0.4, duck: 0.4, pri: 2, layers: [
    { w: 'sine', f: 82, f2: 41, dur: 0.6 },
    { w: 'triangle', notes: [0, -1, -6], base: 62, step: 0.3, dur: 0.7, a: 0.02, lp: 1500, vol: 0.45 },
    { w: 'sawtooth', f: 73.4, dur: 1.4, a: 0.2, lp: 300, vol: 0.22 }] },
  escort_home: { vol: 0.15, send: 0.35, duck: 0.4, pri: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 300, f2: 800, q: 1.5, dur: 1.1, a: 0.3, am: [21, 0.8], vol: 0.45 },
    { w: 'triangle', notes: [0, 4, 7, 12], base: 67, step: 0.09, at: 0.3, dur: 0.9, a: 0.02, lp: 2800, vol: 0.4 }] },
  uplink_boot: { vol: 0.13, send: 0.25, pri: 2, layers: [
    { w: 'square', notes: [0, 12, 7, 19, 24], base: 67, step: 0.07, dur: 0.06, lp: 3200, vol: 0.4 },
    { w: 'sawtooth', f: 55, f2: 110, dur: 1.2, a: 0.3, lp: 600, vol: 0.3 },
    { w: 'noise', fil: 'bandpass', f: 2000, q: 2, dur: 0.6, a: 0.2, at: 0.4, am: [31, 0.8], vol: 0.2 }] },
  uplink_loop: { vol: 0.045, gap: 0.2, max: 2, layers: [
    { w: 'square', f: 1200, dur: 0.03, n: [3, 5], every: [0.05, 0.09], nvar: 0.6, lp: 4000 },
    { w: 'sine', f: 220, dur: 0.2, a: 0.03, vol: 0.4 }] },
  uplink_hit: { vol: 0.16, gap: 0.15, layers: [
    { w: 'noise', fil: 'highpass', f: 3000, dur: 0.015, n: [3, 5], every: [0.015, 0.04] },
    { w: 'square', notes: [0, -6], base: 79, step: 0.08, dur: 0.07, lp: 2500, vol: 0.4 },
    { w: 'brown', fil: 'lowpass', f: 600, dur: 0.08, vol: 0.5 }] },
  uplink_online: { vol: 0.16, send: 0.4, duck: 0.4, pri: 2, layers: [
    { w: 'sawtooth', f: 110, f2: 440, ft: 0.5, dur: 1.2, a: 0.1, hold: 0.3, lp: 800, lp2: 3000, vol: 0.25 },
    { w: 'fm', notes: [0, 7, 12, 19], base: 72, step: 0.08, at: 0.4, ratio: 2, index: 0.9, index2: 0.1, dur: 0.9, vol: 0.5 }] },
  alpha_roar: { vol: 0.28, send: 0.4, duck: 0.4, pri: 2, near: 14, layers: [
    { w: 'sawtooth', f: 85, f2: 62, dur: 1.2, a: 0.08, hold: 0.3, lp: 1000, lp2: 350, vib: [7, 70] },
    { w: 'noise', fil: 'bandpass', f: 500, f2: 280, q: 2, dur: 1.1, a: 0.1, am: [30, 0.6], vol: 0.5 },
    { w: 'sine', f: 50, dur: 1.0, a: 0.1, vol: 0.5 }] },
  clue_found: { vol: 0.11, send: 0.3, layers: [
    { w: 'noise', fil: 'bandpass', f: 2600, f2: 1800, q: 0.8, dur: 0.2, a: 0.03, am: [15, 0.6], vol: 0.4 },
    { w: 'fm', notes: [0, 5], base: 74, step: 0.14, ratio: 3, index: 0.6, index2: 0.05, dur: 0.6, vol: 0.6 }] },
  core_pickup: { vol: 0.16, layers: [
    { w: 'brown', fil: 'lowpass', f: 500, dur: 0.12 },
    { w: 'fm', f: 700, ratio: 2.76, index: 1.2, index2: 0.2, dur: 0.2, vol: 0.3 },
    { w: 'sawtooth', f: 60, f2: 120, dur: 0.6, a: 0.15, lp: 500, am: [12, 0.4], vol: 0.3 }] },
  core_drop: { vol: 0.2, layers: [
    { w: 'sine', f: 95, f2: 45, dur: 0.22 },
    { w: 'brown', fil: 'lowpass', f: 900, f2: 200, dur: 0.18, vol: 0.8 },
    { w: 'fm', f: 620, ratio: 2.76, index: 2, index2: 0.2, dur: 0.3, vol: 0.28 },
    { w: 'sawtooth', f: 120, f2: 50, dur: 0.5, lp: 400, vol: 0.18 }] },
  core_deliver: { vol: 0.16, send: 0.35, duck: 0.4, pri: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 300, f2: 900, q: 1.5, dur: 1.1, a: 0.3, am: [21, 0.8], vol: 0.45 },
    { w: 'sawtooth', f: 55, f2: 220, ft: 0.6, dur: 1.2, a: 0.2, lp: 1200, vol: 0.2 },
    { w: 'fm', notes: [0, 7, 12], base: 69, step: 0.1, at: 0.45, ratio: 3, index: 1, index2: 0.1, dur: 0.9, vol: 0.5 }] },
  spore_nest_hit: { vol: 0.15, pitch: 2, gap: 0.04, max: 3, layers: [
    { w: 'noise', fil: 'bandpass', f: 700, f2: 300, q: 3, dur: 0.12, a: 0.002 },
    { w: 'brown', fil: 'lowpass', f: 500, dur: 0.08, vol: 0.6 },
    { w: 'pink', fil: 'highpass', f: 3000, dur: 0.15, a: 0.02, vol: 0.2 }] },
  spore_nest_pop: { vol: 0.26, layers: [
    { w: 'brown', fil: 'lowpass', f: 1800, f2: 150, dur: 0.4, a: 0.001 },
    { w: 'pink', fil: 'highpass', f: 2200, dur: 0.8, a: 0.03, at: 0.03, vol: 0.4 },
    { w: 'sine', f: 180, f2: 60, dur: 0.18, vol: 0.6 }] },
  spore_nest_puff: { vol: 0.12, near: 8, layers: [
    { w: 'pink', fil: 'lowpass', f: 600, f2: 1800, dur: 0.7, a: 0.35 },
    { w: 'noise', fil: 'bandpass', f: 1500, q: 3, dur: 0.6, a: 0.3, am: [5, 0.5], vol: 0.35 }] },
  bloom_regrow: { vol: 0.17, send: 0.3, pri: 2, layers: [
    { w: 'sawtooth', f: 90, f2: 140, dur: 1.4, a: 0.4, lp: 600, q: 9, vib: [13, 40], vol: 0.3 },
    { w: 'noise', fil: 'bandpass', f: 500, f2: 1100, q: 3, dur: 0.16, n: [5, 7], every: [0.15, 0.25], vol: 0.45 },
    { w: 'brown', fil: 'lowpass', f: 200, f2: 500, dur: 1.3, a: 0.6, vol: 0.5 }] },

  // ------------------------------------------------------------------ relics, events, places (JungleRelics / JungleScene)
  second_wind: { vol: 0.2, send: 0.45, duck: 0.4, pri: 2, layers: [
    { w: 'sine', f: 62, f2: 44, dur: 0.16 },
    { w: 'sine', f: 56, f2: 40, dur: 0.18, at: 0.22, vol: 0.8 },
    { w: 'noise', fil: 'bandpass', f: 600, f2: 1600, q: 1.2, dur: 0.7, a: 0.4, at: 0.35, vol: 0.4 },
    { w: 'fm', notes: [0, 7, 12, 16], base: 76, step: 0.06, at: 0.6, ratio: 3.5, index: 1, index2: 0.1, dur: 0.9, vol: 0.4 }] },
  relic_cache: { vol: 0.16, send: 0.3, layers: [
    { w: 'fm', f: 1500, ratio: 2.76, index: 1.5, index2: 0.2, dur: 0.12 },
    { w: 'sawtooth', f: 130, f2: 100, dur: 0.4, a: 0.05, at: 0.1, lp: 800, q: 7, vib: [15, 30], vol: 0.25 },
    { w: 'brown', fil: 'lowpass', f: 450, dur: 0.14, at: 0.45, vol: 0.8 },
    { w: 'fm', notes: [12, 19, 24], base: 72, step: 0.06, at: 0.5, ratio: 3.5, index: 0.9, index2: 0.1, dur: 0.6, vol: 0.35 }] },
  mast_crackle: { vol: 0.15, send: 0.35, layers: [
    { w: 'noise', fil: 'bandpass', f: 2000, q: 0.8, dur: 0.7, a: 0.02, am: [43, 0.9, 'square'], vol: 0.6 },
    { w: 'sine', f: 400, f2: 1200, ft: 0.5, at: 0.4, dur: 0.9, a: 0.1, vol: 0.3 },
    { w: 'square', notes: [0, 0, 7], base: 84, step: 0.12, at: 0.9, dur: 0.06, lp: 3000, vol: 0.3 }] },
  relic_drop: { vol: 0.14, send: 0.45, pri: 2, layers: [
    { w: 'fm', notes: [24, 19, 28], base: 69, step: 0.09, ratio: 3.5, index: 1.1, index2: 0.1, dur: 0.9, vol: 0.55 },
    { w: 'brown', fil: 'lowpass', f: 400, dur: 0.1, at: 0.25, vol: 0.5 },
    { w: 'noise', fil: 'highpass', f: 6000, dur: 0.6, a: 0.1, vol: 0.12 }] },
  place_found: { vol: 0.08, send: 0.55, layers: [
    { w: 'triangle', f: 659.3, dur: 0.8, a: 0.12, lp: 2400 },
    { w: 'triangle', f: 987.8, at: 0.22, dur: 1.0, a: 0.12, lp: 2400, vol: 0.8 }] },
  item_get: { vol: 0.12, layers: [
    { w: 'noise', fil: 'bandpass', f: 900, f2: 2400, q: 1, dur: 0.1, a: 0.02, vol: 0.4 },
    { w: 'noise', fil: 'bandpass', f: 2600, q: 4, dur: 0.015, at: 0.08 },
    { w: 'fm', notes: [0, 7], base: 79, step: 0.07, at: 0.08, ratio: 2, index: 0.7, index2: 0.1, dur: 0.35, vol: 0.5 }] },
  event_found: { vol: 0.1, send: 0.45, layers: [
    { w: 'fm', notes: [0, 6, 11], base: 69, step: 0.18, ratio: 3, index: 0.7, index2: 0.05, dur: 0.8 },
    { w: 'sine', f: 110, dur: 1.0, a: 0.3, vol: 0.3 }] },
  event_done: { vol: 0.14, send: 0.35, layers: [
    { w: 'sine', f: 98, f2: 60, dur: 0.3, vol: 0.5 },
    { w: 'triangle', notes: [0, 4, 7, 11, 14], base: 62, step: 0.07, dur: 0.9, a: 0.02, lp: 2600, vol: 0.45 }] },
  lunge: { vol: 0.15, pitch: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 700, f2: 2000, q: 1, dur: 0.16, a: 0.03 },
    { w: 'sawtooth', f: 180, f2: 120, dur: 0.18, lp: 900, vib: [30, 50], vol: 0.22 }] },
  cutter: { vol: 0.15, pitch: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 700, f2: 2000, q: 1, dur: 0.16, a: 0.03 },
    { w: 'sawtooth', f: 180, f2: 120, dur: 0.18, lp: 900, vib: [30, 50], vol: 0.22 }] },
  spit: { vol: 0.16, pitch: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 800, f2: 300, q: 2.5, dur: 0.13 },
    { w: 'sine', f: 380, f2: 900, ft: 0.05, dur: 0.07, vol: 0.45 }] },
  splat: { vol: 0.19, pitch: 2, layers: [
    { w: 'noise', fil: 'lowpass', f: 1400, f2: 200, dur: 0.18 },
    { w: 'noise', fil: 'bandpass', f: 700, f2: 300, q: 3, dur: 0.12, at: 0.02, vol: 0.45 },
    { w: 'sine', f: 120, f2: 70, dur: 0.12, vol: 0.55 }] },
  enemy_shot: { vol: 0.12, pitch: 1.5, layers: [
    { w: 'noise', fil: 'highpass', f: 2500, dur: 0.04 },
    { w: 'square', f: 900, f2: 260, dur: 0.09, lp: 3000, vol: 0.35 }] },
  spore_swell: { vol: 0.09, layers: [
    { w: 'noise', fil: 'bandpass', f: 300, f2: 900, q: 4, dur: 0.6, a: 0.3, am: [9, 0.5] },
    { w: 'sine', f: 140, f2: 240, dur: 0.6, a: 0.3, vol: 0.4 }] },
  spore_burst: { vol: 0.2, layers: [
    { w: 'pink', fil: 'lowpass', f: 2600, f2: 400, dur: 0.5, a: 0.004 },
    { w: 'sine', f: 220, f2: 90, dur: 0.12, vol: 0.55 },
    { w: 'noise', fil: 'highpass', f: 4000, dur: 0.4, a: 0.05, vol: 0.18 }] },
  ambush: { vol: 0.22, pri: 2, layers: [
    { w: 'noise', fil: 'bandpass', f: 1800, f2: 900, q: 0.7, dur: 0.35, a: 0.01, am: [22, 0.6] },
    { w: 'sawtooth', f: 110, f2: 150, dur: 0.5, a: 0.05, at: 0.08, lp: 700, vib: [20, 60], vol: 0.35 },
    { w: 'brown', fil: 'lowpass', f: 500, dur: 0.15, vol: 0.6 }] },
  nest_burst: { vol: 0.26, send: 0.15, layers: [
    { w: 'brown', fil: 'lowpass', f: 1600, f2: 160, dur: 0.55 },
    { w: 'noise', fil: 'bandpass', f: 800, f2: 260, q: 3, dur: 0.35, at: 0.03, vol: 0.45 },
    { w: 'sine', f: 110, f2: 42, dur: 0.4, vol: 0.75 },
    { w: 'triangle', f: 700, f2: 300, dur: 0.3, at: 0.02, lp: 1800, vib: [14, 80], vol: 0.18 }] },
  sun_warn: { vol: 0.15, send: 0.45, pri: 2, layers: [
    { w: 'fm', f: 196, ratio: 1.4, index: 2, index2: 0.3, dur: 2.5, a: 0.01 },
    { w: 'sine', f: 98, dur: 2, a: 0.02, vol: 0.35 }] },
  sunset: { vol: 0.19, send: 0.6, duck: 0.3, pri: 2, layers: [
    { w: 'sawtooth', f: 55, dur: 3, a: 1.2, hold: 0.5, lp: 200, lp2: 700, vol: 0.45 },
    { w: 'sine', f: 380, fp: [[0.6, 620], [1.6, 340]], at: 0.6, dur: 1.7, a: 0.25, vib: [5, 25], vol: 0.18 },
    { w: 'fm', f: 196, ratio: 1.4, index: 1.5, index2: 0.2, dur: 3, vol: 0.35 }] },

  // ------------------------------------------------------------------ night defense
  shoot: { vol: 0.11, pitch: 1.5, gap: 0.035, max: 4, layers: [
    { w: 'noise', fil: 'bandpass', f: 1800, f2: 900, q: 1, dur: 0.06, a: 0.001 },
    { w: 'square', f: 420, f2: 160, dur: 0.06, lp: 2400, vol: 0.35 },
    { w: 'sine', f: 140, f2: 70, dur: 0.07, vol: 0.55 }] },
  thorn: { vol: 0.085, pitch: 2, gap: 0.035, max: 4, layers: [
    { w: 'noise', fil: 'bandpass', f: 3200, f2: 1300, q: 1.6, dur: 0.07, a: 0.004 },
    { w: 'triangle', f: 950, f2: 700, dur: 0.03, vol: 0.35 }] },
  zap: { vol: 0.095, pitch: 2, gap: 0.04, max: 3, layers: [
    { w: 'noise', fil: 'highpass', f: 3500, dur: 0.014, n: [3, 5], every: [0.012, 0.03] },
    { w: 'sawtooth', f: 1100, f2: 280, dur: 0.12, lp: 4000, am: [90, 0.8], vol: 0.3 }] },
  mortar_fire: { vol: 0.17, pitch: 1.5, gap: 0.05, max: 3, layers: [
    { w: 'sine', f: 150, f2: 55, dur: 0.22 },
    { w: 'brown', fil: 'lowpass', f: 700, f2: 200, dur: 0.2, vol: 0.7 },
    { w: 'noise', fil: 'bandpass', f: 1200, q: 1, dur: 0.05, vol: 0.35 }] },
  mortar_hit: { vol: 0.21, pitch: 1.5, gap: 0.05, max: 3, layers: [
    { w: 'brown', fil: 'lowpass', f: 2400, f2: 180, dur: 0.6, a: 0.002 },
    { w: 'sine', f: 80, f2: 35, dur: 0.45, vol: 0.9 },
    { w: 'noise', fil: 'highpass', f: 2000, dur: 0.015, n: [3, 6], every: [0.03, 0.08], at: 0.05, vol: 0.28 }] },
  boom: { vol: 0.21, pitch: 1.5, gap: 0.05, max: 3, layers: [
    { w: 'brown', fil: 'lowpass', f: 2400, f2: 180, dur: 0.6, a: 0.002 },
    { w: 'sine', f: 80, f2: 35, dur: 0.45, vol: 0.9 }] },
  snare: { vol: 0.09, pitch: 1.5, gap: 0.08, max: 3, layers: [
    { w: 'noise', fil: 'bandpass', f: 1300, f2: 500, q: 1, dur: 0.25, a: 0.02 },
    { w: 'sawtooth', f: 85, f2: 70, dur: 0.35, a: 0.05, lp: 520, q: 7, vib: [7, 40], vol: 0.45 }] },
  pulse: { vol: 0.03, pitch: 0.5, gap: 0.3, max: 2, layers: [
    { w: 'sine', f: 220, dur: 0.5, a: 0.08, am: [12, 0.6] },
    { w: 'fm', f: 880, ratio: 1.5, index: 0.5, dur: 0.4, a: 0.05, vol: 0.3 }] },
  build: { vol: 0.14, layers: [
    { w: 'noise', fil: 'bandpass', f: 2600, q: 4, dur: 0.02, n: 4, every: 0.045 },
    { w: 'sine', f: 180, f2: 90, dur: 0.14, at: 0.19, vol: 0.85 },
    { w: 'brown', fil: 'lowpass', f: 800, dur: 0.12, at: 0.19, vol: 0.6 },
    { w: 'fm', f: 1568, ratio: 2, index: 0.6, dur: 0.3, at: 0.22, vol: 0.22 }] },
  sell: { vol: 0.12, layers: [
    { w: 'brown', fil: 'lowpass', f: 700, dur: 0.1 },
    { w: 'sine', f: 150, f2: 80, dur: 0.12, vol: 0.75 },
    { w: 'fm', notes: [7, 4, 0], base: 76, step: 0.06, at: 0.08, ratio: 2.76, index: 0.8, dur: 0.18, vol: 0.35 }] },
  repair: { vol: 0.12, layers: [
    { w: 'fm', f: 1400, ratio: 2.76, index: 1.5, index2: 0.2, dur: 0.12 },
    { w: 'fm', f: 1250, ratio: 2.76, index: 1.5, index2: 0.2, dur: 0.12, at: 0.13 },
    { w: 'sine', f: 440, f2: 880, at: 0.22, dur: 0.3, a: 0.05, vol: 0.4 }] },
  decrypt: { vol: 0.07, layers: [{ w: 'square', notes: [0, 7, 3, 10, 12], base: 84, step: 0.05, dur: 0.045, lp: 3500 }] },
  wave_horn: { vol: 0.2, send: 0.4, duck: 0.4, pri: 2, layers: [
    { w: 'sawtooth', f: 98, dur: 2.0, a: 0.25, hold: 0.9, lp: 450, lp2: 1100, lpt: 0.8, vib: [4.5, 10], vol: 0.5 },
    { w: 'sawtooth', f: 98, detune: 9, dur: 2.0, a: 0.3, hold: 0.85, lp: 450, lp2: 1100, lpt: 0.8, vol: 0.4 },
    { w: 'sawtooth', f: 146.8, dur: 1.8, a: 0.35, hold: 0.7, lp: 600, vol: 0.2 },
    { w: 'sine', f: 49, dur: 2, a: 0.3, hold: 0.8, vol: 0.45 },
    { w: 'sine', f: 70, f2: 40, dur: 0.5, vol: 0.5 }] },
  alarm: { vol: 0.11, layers: [{ w: 'square', notes: [0, -5, 0], base: 79, step: 0.13, dur: 0.12, a: 0.005, hold: 0.06, lp: 2200 }] },
  relay_hit: { vol: 0.22, gap: 0.06, send: 0.2, pri: 2, layers: [
    { w: 'fm', f: 1180, ratio: 1.47, index: 2.5, index2: 0.2, dur: 0.5 },
    { w: 'noise', fil: 'highpass', f: 3000, dur: 0.08, vol: 0.45 },
    { w: 'sine', f: 85, f2: 40, dur: 0.3, vol: 0.85 },
    { w: 'brown', fil: 'lowpass', f: 900, f2: 200, dur: 0.25, vol: 0.55 }] },
  core: { vol: 0.22, gap: 0.06, send: 0.2, layers: [
    { w: 'fm', f: 1180, ratio: 1.47, index: 2.5, index2: 0.2, dur: 0.5 },
    { w: 'sine', f: 85, f2: 40, dur: 0.3, vol: 0.85 }] },
  relay_alarm: { vol: 0.1, pri: 2, layers: [{ w: 'square', notes: [0, -5, 0, -5], base: 78, step: 0.16, dur: 0.15, a: 0.005, hold: 0.08, lp: 2000 }] },
  lob: { vol: 0.13, pitch: 2, gap: 0.05, layers: [
    { w: 'noise', fil: 'bandpass', f: 800, f2: 300, q: 2.5, dur: 0.13 },
    { w: 'sine', f: 380, f2: 900, ft: 0.05, dur: 0.07, vol: 0.45 }] },
  enemy_die: { vol: 0.12, pitch: 2.5, gap: 0.025, max: 5, layers: [
    { w: 'noise', fil: 'lowpass', f: 1500, f2: 250, dur: 0.1 },
    { w: 'sine', f: 240, f2: 100, dur: 0.1, vol: 0.55 }] },
  boss_roar: { vol: 0.28, send: 0.3, duck: 0.6, pri: 2, layers: [
    { w: 'sawtooth', f: 70, f2: 52, dur: 1.6, a: 0.15, hold: 0.5, lp: 900, lp2: 300, vib: [6, 60] },
    { w: 'noise', fil: 'bandpass', f: 380, f2: 220, q: 2, dur: 1.5, a: 0.2, am: [28, 0.6], vol: 0.55 },
    { w: 'sine', f: 45, dur: 1.4, a: 0.1, vol: 0.55 }] },
  boss_cue: { vol: 0.22, send: 0.25, pri: 2, layers: [
    { w: 'sawtooth', f: 80, f2: 62, dur: 0.8, a: 0.08, hold: 0.2, lp: 800, lp2: 300, vib: [7, 50] },
    { w: 'noise', fil: 'bandpass', f: 420, q: 2, dur: 0.7, a: 0.1, am: [26, 0.6], vol: 0.45 }] },
  boss_die: { vol: 0.3, send: 0.45, duck: 0.6, pri: 2, layers: [
    { w: 'sawtooth', f: 90, f2: 30, dur: 2.2, a: 0.03, lp: 900, lp2: 120, vib: [7, 80], vol: 0.4 },
    { w: 'brown', fil: 'lowpass', f: 2000, f2: 100, dur: 2.0, vol: 0.8 },
    { w: 'sine', f: 70, f2: 28, dur: 1.4, vol: 0.8 },
    { w: 'noise', fil: 'bandpass', f: 1400, q: 1.2, dur: 0.03, n: [8, 12], every: [0.06, 0.14], at: 0.2, vol: 0.3 }] },
  roots_burst: { vol: 0.22, layers: [
    { w: 'brown', fil: 'lowpass', f: 420, dur: 0.6, a: 0.05, am: [14, 0.5] },
    { w: 'noise', fil: 'bandpass', f: 1500, q: 1.5, dur: 0.02, n: [4, 7], every: [0.03, 0.07], vol: 0.4 },
    { w: 'sine', f: 60, f2: 35, dur: 0.5, vol: 0.75 }] },
  relay_fall: { vol: 0.32, send: 0.45, duck: 0.8, pri: 2, layers: [
    { w: 'brown', fil: 'lowpass', f: 2600, f2: 90, dur: 2.2, a: 0.004 },
    { w: 'sine', f: 70, f2: 25, dur: 1.6, vol: 0.85 },
    { w: 'fm', f: 1320, ratio: 1.47, index: 3, index2: 0.2, dur: 1.4, vol: 0.4 },
    { w: 'fm', f: 1760, ratio: 2.31, index: 2, dur: 0.06, n: [6, 9], every: [0.04, 0.12], at: 0.05, vol: 0.25 }] },
  // Siege of the Colossus: it rears (a groaning creak, heard across the field), the slam, its spent collapse.
  siege_windup: { vol: 0.2, pri: 2, layers: [
    { w: 'sawtooth', f: 45, f2: 70, dur: 1.0, a: 0.6, lp: 400, q: 6, vib: [5, 50], vol: 0.5 },
    { w: 'noise', fil: 'bandpass', f: 400, f2: 900, q: 3, dur: 0.9, a: 0.6, am: [12, 0.5], vol: 0.35 }] },
  siege_slam: { vol: 0.32, pri: 2, layers: [
    { w: 'sine', f: 60, f2: 25, dur: 0.7, a: 0.002 },
    { w: 'brown', fil: 'lowpass', f: 1600, f2: 90, dur: 0.7, vol: 0.85 },
    { w: 'noise', fil: 'bandpass', f: 1400, q: 1, dur: 0.02, n: [6, 9], every: [0.03, 0.08], at: 0.02, vol: 0.35 }] },
  colossus_spent: { vol: 0.28, send: 0.45, duck: 0.4, pri: 2, layers: [
    { w: 'sawtooth', f: 80, f2: 30, dur: 2.2, a: 0.1, lp: 700, lp2: 150, vib: [4, 60], vol: 0.35 },
    { w: 'brown', fil: 'lowpass', f: 900, f2: 100, dur: 1.8, a: 0.3, vol: 0.7 },
    { w: 'noise', fil: 'bandpass', f: 1200, q: 1.5, dur: 0.03, n: [8, 12], every: [0.08, 0.16], at: 0.4, vol: 0.3 }] },
  upgrade: { vol: 0.14, layers: [
    { w: 'noise', fil: 'bandpass', f: 2400, f2: 3400, q: 4, dur: 0.018, n: 5, every: 0.04 },
    { w: 'sine', f: 200, f2: 120, dur: 0.12, at: 0.21, vol: 0.7 },
    { w: 'fm', notes: [0, 7, 12], base: 79, step: 0.06, at: 0.22, ratio: 2, index: 0.6, index2: 0.1, dur: 0.4, vol: 0.3 }] },
  trade: { vol: 0.12, layers: [
    { w: 'fm', f: 2400, ratio: 2.76, index: 1, index2: 0.1, dur: 0.1, n: 3, every: 0.06, nvar: 0.15 },
    { w: 'noise', fil: 'bandpass', f: 800, f2: 2000, q: 1, dur: 0.18, at: 0.18, a: 0.04, vol: 0.4 },
    { w: 'triangle', notes: [0, 7], base: 76, step: 0.07, at: 0.25, dur: 0.15, vol: 0.4 }] },
  coins: { vol: 0.12, gap: 0.1, layers: [
    { w: 'fm', f: 2500, ratio: 2.76, index: 1, index2: 0.1, dur: 0.12, n: [4, 6], every: [0.04, 0.07], nvar: 0.2 }] },
  // A glint in the brush sparkling near you (Forage.js, critic N2): a high, soft two-note tink, panned. Not `glint`
  // (that is the enemy wind-up tell's low metallic shing).
  glint_twinkle: { vol: 0.035, near: 6, gap: 0.3, send: 0.4, layers: [
    { w: 'triangle', f: 2637, dur: 0.05, a: 0.005 },
    { w: 'triangle', f: 3520, at: 0.045, dur: 0.09, a: 0.005, vol: 0.6 }] },
  push_held: { vol: 0.15, send: 0.35, duck: 0.3, pri: 2, layers: [
    { w: 'sine', f: 110, f2: 55, dur: 0.4, vol: 0.5 },
    { w: 'triangle', notes: [0, 4, 7], base: 57, step: 0.05, dur: 1.1, a: 0.03, hold: 0.2, lp: 2200, vol: 0.4 },
    { w: 'fm', notes: [12, 19], base: 69, step: 0.12, at: 0.1, ratio: 2, index: 0.8, index2: 0.1, dur: 0.7, vol: 0.35 }] },
  salvage_pick: { vol: 0.14, layers: [
    { w: 'noise', fil: 'bandpass', f: 2200, q: 4, dur: 0.02, n: 3, every: 0.05 },
    { w: 'brown', fil: 'lowpass', f: 500, dur: 0.12, at: 0.16, vol: 0.8 },
    { w: 'fm', notes: [0, 4, 7], base: 74, step: 0.06, at: 0.2, ratio: 2.76, index: 0.7, index2: 0.1, dur: 0.4, vol: 0.4 }] },
  sabotage: { vol: 0.12, layers: [
    { w: 'noise', fil: 'bandpass', f: 1800, q: 0.7, dur: 0.6, a: 0.02, am: [37, 0.9, 'square'], vol: 0.55 },
    { w: 'square', notes: [12, 7, 0, -5], base: 72, step: 0.09, dur: 0.07, lp: 2500, vol: 0.3 }] },
  // Relay Protocols (src/scenes/DefenseProtocols.js): the cast, then the effect where it lands.
  cast_vine_snare: { vol: 0.14, layers: [
    { w: 'noise', fil: 'bandpass', f: 900, f2: 2600, q: 0.9, dur: 0.3, a: 0.05, am: [18, 0.5] },
    { w: 'sawtooth', f: 110, f2: 150, dur: 0.35, a: 0.05, lp: 600, q: 8, vib: [16, 30], vol: 0.25 }] },
  cast_arc_discharge: { vol: 0.13, layers: [
    { w: 'sawtooth', f: 150, f2: 1400, dur: 0.45, a: 0.3, lp: 3000, vol: 0.35 },
    { w: 'sine', f: 300, f2: 2600, dur: 0.45, a: 0.3, am: [24, 0.5], vol: 0.35 }] },
  cast_flare: { vol: 0.15, layers: [
    { w: 'sine', f: 180, f2: 90, dur: 0.1 },
    { w: 'noise', fil: 'bandpass', f: 800, f2: 3000, q: 1.2, dur: 0.4, a: 0.03, vol: 0.5 }] },
  vine_root: { vol: 0.2, layers: [
    { w: 'noise', fil: 'bandpass', f: 1400, f2: 600, q: 1, dur: 0.3, a: 0.01, am: [22, 0.6] },
    { w: 'sawtooth', f: 90, f2: 60, dur: 0.45, a: 0.02, lp: 500, q: 9, vib: [11, 40], vol: 0.35 },
    { w: 'noise', fil: 'bandpass', f: 2200, q: 2, dur: 0.02, n: 3, every: 0.04, at: 0.15, vol: 0.4 }] },
  arc_discharge: { vol: 0.3, send: 0.35, pri: 2, layers: [
    { w: 'noise', fil: 'highpass', f: 2500, dur: 0.06, a: 0.001 },
    { w: 'brown', fil: 'lowpass', f: 1800, f2: 80, dur: 0.9, a: 0.003, vol: 0.9 },
    { w: 'noise', fil: 'highpass', f: 3500, dur: 0.015, n: [6, 10], every: [0.02, 0.06], at: 0.05, vol: 0.45 },
    { w: 'sawtooth', f: 900, f2: 120, dur: 0.3, lp: 4000, am: [80, 0.8], vol: 0.2 }] },
  flare_pop: { vol: 0.2, send: 0.25, layers: [
    { w: 'noise', fil: 'bandpass', f: 1500, q: 1, dur: 0.05, a: 0.001 },
    { w: 'pink', fil: 'bandpass', f: 1800, f2: 900, q: 0.8, dur: 0.6, a: 0.02, vol: 0.55 },
    { w: 'sine', f: 140, f2: 70, dur: 0.12, vol: 0.4 }] },
  flare_fizzle: { vol: 0.04, gap: 0.12, max: 3, layers: [
    { w: 'noise', fil: 'bandpass', f: 4000, q: 1.2, dur: 0.35, a: 0.03, am: [33, 0.8] },
    { w: 'noise', fil: 'highpass', f: 6000, dur: 0.008, n: [2, 4], every: [0.04, 0.1], vol: 0.6 }] },
  // Workbench, skills, run flow.
  craft: { vol: 0.14, layers: [
    { w: 'fm', f: 1300, ratio: 2.76, index: 1.6, index2: 0.2, dur: 0.1, n: 3, every: 0.13, nvar: 0.08 },
    { w: 'noise', fil: 'bandpass', f: 2200, q: 1.5, dur: 0.25, at: 0.42, am: [16, 0.8], vol: 0.35 },
    { w: 'fm', notes: [0, 4, 7, 12], base: 74, step: 0.06, at: 0.7, ratio: 2, index: 0.7, index2: 0.1, dur: 0.5, vol: 0.35 }] },
  mod_fit: { vol: 0.13, layers: [
    { w: 'noise', fil: 'bandpass', f: 2600, q: 5, dur: 0.02 },
    { w: 'sawtooth', f: 300, f2: 700, dur: 0.25, at: 0.04, lp: 2000, am: [40, 0.5], vol: 0.15 },
    { w: 'fm', f: 1046.5, ratio: 2, index: 0.5, at: 0.28, dur: 0.3, vol: 0.4 }] },
  skill_keystone: { vol: 0.15, send: 0.45, duck: 0.4, pri: 2, layers: [
    { w: 'sine', f: 98, f2: 55, dur: 0.5, vol: 0.5 },
    { w: 'triangle', notes: [0, 7, 12, 16], base: 48, step: 0.03, dur: 1.6, a: 0.05, hold: 0.4, lp: 1800, vol: 0.4 },
    { w: 'fm', notes: [12, 16, 19, 23, 26, 31], base: 60, step: 0.07, at: 0.1, ratio: 2, index: 1, index2: 0.1, dur: 0.9, vol: 0.45 }] },
  run_start: { vol: 0.14, send: 0.3, layers: [
    { w: 'sine', f: 110, f2: 55, dur: 0.35, vol: 0.5 },
    { w: 'triangle', notes: [0, 7, 12, 16], base: 50, step: 0.02, dur: 0.9, a: 0.01, lp: 2000, vol: 0.45 },
    { w: 'fm', f: 1174.7, ratio: 2, index: 0.8, index2: 0.1, at: 0.12, dur: 0.7, vol: 0.35 }] },
  to_night: { vol: 0.14, send: 0.45, layers: [
    { w: 'sawtooth', f: 55, dur: 1.4, a: 0.4, lp: 250, lp2: 600, vol: 0.4 },
    { w: 'triangle', notes: [0, 3, 7], base: 57, step: 0.12, dur: 1.2, a: 0.05, lp: 1400, vol: 0.4 }] },
  ui_select: { bus: 'ui', vol: 0.08, pitch: 0.3, layers: [
    { w: 'noise', fil: 'bandpass', f: 2400, q: 3, dur: 0.02, vol: 0.6 },
    { w: 'triangle', notes: [0, 7], base: 79, step: 0.05, dur: 0.1 }] },
};

// ------------------------------------------------------------------ ambience (src/core/AmbientAudio.js)
//
// A profile is a set of layer weights (0..1). The director blends day / dusk / night by the jungle clock
// and picks defense / menu elsewhere; `water` scales the near-water layer (which follows the river).
export const AMBIENCE = {
  smooth: 1.6,               // seconds to blend between profiles
  profiles: {
    day: { wind: 0.7, insects: 1, cicada: 0, birds: 1, crickets: 0, frogs: 0.05, howl: 0, water: 1 },
    dusk: { wind: 0.55, insects: 0.45, cicada: 1, birds: 0.3, crickets: 0.35, frogs: 0.35, howl: 1, water: 1 },
    night: { wind: 0.4, insects: 0.15, cicada: 0.12, birds: 0.02, crickets: 1, frogs: 1, howl: 0.3, water: 1 },
    defense: { wind: 0.45, insects: 0.1, cicada: 0, birds: 0, crickets: 0.6, frogs: 0.45, howl: 0.15, water: 0 },
    menu: { wind: 0.5, insects: 0.35, cicada: 0, birds: 0.3, crickets: 0, frogs: 0, howl: 0, water: 0 },
  },
  level: { jungle: 1, defensePrep: 0.8, defenseWave: 0.5, menu: 0.45 },
  duck: { paused: 0.4, map: 0.6, ending: 0.6 },
  layers: {
    wind: { vol: 0.11, cutoff: 1000, sweep: 500, sweepRate: [0.05, 0.08], gustRate: 0.045, gustDepth: 0.5, width: 0.7 },   // leaf wash
    // bands: [centre Hz, Q, buzz (AM) Hz, pan]
    insects: { vol: 0.08, bands: [[5200, 6, 31, -0.45], [3800, 7, 47, 0.5]], buzz: 0.55, swellRate: 0.025, swellDepth: 0.35 },
    cicada: { vol: 0.12, bands: [[6300, 9, 150, -0.35], [5400, 8, 118, 0.4]], buzz: 0.9, swell: [5, 11], rest: [1.5, 6] },
    water: { vol: 0.17, rumble: 650, babble: [650, 1900], babbleQ: 2.6, radius: 9, scanEvery: 0.25, full: 2.2 },
    rain: { vol: 0.2, hiss: [2600, 9000], roar: 1300, drips: 7 },
  },
  events: {
    // birds: Poisson rate per second at weight 1; dist = how far (0 near … 1 far: quieter, duller, wetter)
    birds: { rate: 0.3, vol: 0.06, dist: [0.15, 1], kinds: { whistle: 3, trill: 2, chirp: 3, coo: 1.5, tink: 1.5, chatter: 0.6 } },
    crickets: { agents: 4, vol: 0.035, dist: [0.1, 0.5], f: [4200, 5600], pulses: [2, 4], pulse: 0.016, spacing: 0.034, period: [0.42, 0.9] },
    frogs: { agents: 5, vol: 0.05, dist: [0.15, 0.85], period: [1.4, 4.2], kinds: { croak: 2, peep: 2, knock: 1 } },
    howl: { rate: 0.02, vol: 0.045 },
  },
  reverb: { time: 2.2, decay: 2.2, tone: 4200, wet: 0.5 },
  // Today's weather (src/world/Weather.js; key from the director): layer weight × mult + add, bed level ×,
  // and `hush` = a low-pass (Hz) on the whole bed. The rain layer itself comes from Weather's setRain.
  weather: {
    rain: { mult: { birds: 0.25, insects: 0.5, cicada: 0.4, crickets: 0.6 } },
    fog: { level: 0.8, hush: 2400, mult: { birds: 0.4, wind: 0.5, insects: 0.7 }, add: { howl: 0.25 } },
    heat: { mult: { insects: 1.35, birds: 0.6, wind: 0.6, frogs: 0.5 }, add: { cicada: 0.55 } },
  },
};

// ------------------------------------------------------------------ director (src/core/AudioDirector.js)
export const AUDIO_DIRECTOR = {
  // Footfalls on the walk anim's contact frames (6-frame walk: 0 and 3); a stride fallback for models.
  footsteps: { contactFrames: [0, 3], stride: 1.6, minSpeed: 0.8, pan: 0.12, fern: 0.85,
    // terrain level (LEVEL in jungle.js) → surface sound; paved dirt = stone, trails = dirt
    surfaces: ['water', 'mud', 'dirt', 'leaf', 'moss'] },
  heartbeat: { below: 0.3, interval: [1.05, 0.62], vol: [0.55, 1] },
  hold: { tick: [0.17, 0.055], rate: [1, 2], humVol: 0.045, humHz: [55, 165], humCutoff: [300, 2200] },
  charge: { vol: 0.035, f: [300, 1500] },
  combat: { radius: 8, calm: 4, ownDrums: ['lair', 'boss'] },   // no combat layer over moods with their own drums
  // Loops that follow live things: the thrown machete's whirr, the uplink's boot chatter (rate rises with
  // progress), the hiss of burning Flares (night Protocol). Values = seconds between re-triggers.
  loops: { bladeEvery: 0.12, uplinkEvery: [0.7, 0.28], uplinkRate: [0.9, 1.5], flareEvery: 0.3 },
  relayAlarm: { below: 0.3, every: 5, recentHit: 6 },
  duskLead: 45,              // cicadas start to swell this many seconds before sunset
};
