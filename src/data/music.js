// Procedural music moods for src/core/Music.js. Everything is synthesized on WebAudio at runtime.
//
// Timing: one step = an eighth note; a bar = 8 steps. `chords` are lists of semitones above `root`
// (a MIDI note number); each chord lasts `barsPerChord` bars and the progression loops forever.
//
//   pad   sustained chord voices through a slowly swept low-pass filter
//   bass  plucked chord root, one octave below, on the listed steps of each bar
//   arp   random chord tones on any step with probability `chance`, sent into the echo
//   perc  optional kick / hat steps within the bar (night and boss)
//   delay feedback echo on the arp for space

export const MUSIC = {
  master: 0.5,     // overall level at music volume 1.0
  fadeIn: 2.5,     // seconds for a new mood to fade in
  fadeOut: 1.8,    // seconds for the old mood to fade out
  moods: {
    // Dusky, dreamy D dorian for the title and menus.
    title: {
      bpm: 58, root: 50, barsPerChord: 2,
      chords: [[0, 3, 7, 10, 14], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 7, 12]],
      pad: { wave: 'triangle', vol: 0.075, cutoff: 1100, sweep: 380, attack: 2.4, release: 3.2, detune: 7 },
      bass: { wave: 'sine', vol: 0.15, steps: [0], decay: 3.2 },
      arp: { wave: 'sine', vol: 0.05, chance: 0.26, octaves: [12, 24], decay: 1.5 },
      delay: { time: 0.78, feedback: 0.42, wet: 0.45 },
    },
    // Briefing, exploration and summary: light, curious G major with a little more motion.
    day: {
      bpm: 82, root: 55, barsPerChord: 2,
      chords: [[0, 4, 7, 14], [-3, 0, 4, 7], [5, 9, 12, 16], [7, 12, 14, 19]],
      pad: { wave: 'triangle', vol: 0.06, cutoff: 1500, sweep: 500, attack: 1.6, release: 2.4, detune: 5 },
      bass: { wave: 'triangle', vol: 0.12, steps: [0, 3, 6], decay: 0.9 },
      arp: { wave: 'triangle', vol: 0.04, chance: 0.42, octaves: [12, 24], decay: 0.7 },
      perc: { hat: [2, 6], hatVol: 0.018 },
      delay: { time: 0.55, feedback: 0.35, wet: 0.35 },
    },
    // Night preparation and waves: tense A minor, low pulse, ticking hats.
    night: {
      bpm: 76, root: 45, barsPerChord: 2,
      chords: [[0, 3, 7, 12], [-4, 0, 3, 8], [5, 8, 12, 15], [7, 11, 14, 19]],
      pad: { wave: 'sawtooth', vol: 0.04, cutoff: 720, sweep: 260, attack: 1.8, release: 2.6, detune: 9 },
      bass: { wave: 'sine', vol: 0.17, steps: [0, 2, 4, 6], decay: 0.45 },
      arp: { wave: 'square', vol: 0.016, chance: 0.22, octaves: [12, 24], decay: 0.5 },
      perc: { kick: [0], kickVol: 0.16, hat: [1, 3, 5, 7], hatVol: 0.014 },
      delay: { time: 0.59, feedback: 0.38, wet: 0.3 },
    },
    // Night 6 boss siege: driving E phrygian, eighth-note bass and a steady beat.
    boss: {
      bpm: 104, root: 40, barsPerChord: 1,
      chords: [[0, 3, 7, 12], [1, 5, 8, 13], [0, 3, 7, 12], [-2, 2, 5, 10], [0, 3, 7, 12], [1, 5, 8, 13], [3, 7, 10, 15], [1, 5, 8, 13]],
      pad: { wave: 'sawtooth', vol: 0.045, cutoff: 950, sweep: 420, attack: 0.5, release: 1.2, detune: 11 },
      bass: { wave: 'sawtooth', vol: 0.09, steps: [0, 1, 2, 3, 4, 5, 6, 7], decay: 0.22, cutoff: 520 },
      arp: { wave: 'square', vol: 0.02, chance: 0.35, octaves: [12, 24], decay: 0.3 },
      perc: { kick: [0, 3, 4], kickVol: 0.22, hat: [1, 2, 3, 5, 6, 7], hatVol: 0.02 },
      delay: { time: 0.43, feedback: 0.3, wet: 0.22 },
    },
    // Victory / results: warm, reflective F major.
    results: {
      bpm: 64, root: 53, barsPerChord: 2,
      chords: [[0, 4, 7, 11], [4, 7, 11, 14], [5, 9, 12, 16], [7, 11, 14, 19]],
      pad: { wave: 'triangle', vol: 0.075, cutoff: 1400, sweep: 420, attack: 2.0, release: 3.0, detune: 6 },
      bass: { wave: 'sine', vol: 0.14, steps: [0, 4], decay: 2.0 },
      arp: { wave: 'sine', vol: 0.055, chance: 0.34, octaves: [12, 24], decay: 1.3 },
      delay: { time: 0.7, feedback: 0.45, wet: 0.45 },
    },
    // Defeat: slow, somber C minor.
    defeat: {
      bpm: 52, root: 48, barsPerChord: 2,
      chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [5, 8, 12, 15], [7, 11, 14, 17]],
      pad: { wave: 'triangle', vol: 0.075, cutoff: 850, sweep: 300, attack: 2.6, release: 3.4, detune: 8 },
      bass: { wave: 'sine', vol: 0.15, steps: [0], decay: 3.5 },
      arp: { wave: 'sine', vol: 0.04, chance: 0.18, octaves: [12, 24], decay: 1.8 },
      delay: { time: 0.85, feedback: 0.45, wet: 0.45 },
    },
  },
};
