// Procedural music moods for src/core/Music.js. Everything is synthesized on WebAudio at runtime.
//
// Timing: one step = an eighth note; a bar = 8 steps. `chords` are lists of semitones above `root`
// (a MIDI note number); each chord lasts `barsPerChord` bars and the progression loops forever.
//
//   pad   sustained chord voices through a slowly swept low-pass filter
//   bass  plucked chord root, one octave below, on the listed steps of each bar
//   arp   random chord tones on any step with probability `chance`, sent into the echo
//   perc  optional steps within the bar: kick, hat, shaker (seed shaker), tom (hand drum on the chord
//         root × tomPitch), tick (woodblock, played with tickChance)
//   drone optional held root under everything (dusk)
//   delay feedback echo on the arp for space
//
// Moods: title (menus), day (briefing, jungle, summary), dusk (the jungle from sunset; the boss track is
// only for the Colossus on night 6), night (night prep + waves), boss, results, defeat.
// `combat` is the jungle tension layer (Music.setCombat) played on the current mood's grid and chords.

export const MUSIC = {
  master: 0.5,     // overall level at music volume 1.0
  fadeIn: 2.5,     // seconds for a new mood to fade in
  fadeOut: 1.8,    // seconds for the old mood to fade out
  // Jungle combat layer (Music.setCombat, driven by the AudioDirector: an alerted creature within 8 tiles,
  // off after 4 s of calm). Steps are eighth notes within the bar, on the current mood's tempo and chords.
  combat: {
    level: 1, fadeIn: 1.2, fadeOut: 3,
    tom: { steps: [0, 3, 6], vol: 0.13, pitch: 2 },
    kick: { steps: [0, 4], vol: 0.12 },
    shaker: { steps: [1, 2, 3, 5, 6, 7], vol: 0.016 },
    pulse: { steps: [0, 1, 2, 3, 4, 5, 6, 7], wave: 'sawtooth', vol: 0.05, decay: 0.2, cutoff: 700 },
  },
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
    // Briefing, jungle and summary: E minor (i–VI–iv–VII), slow and watchful. Marimba-like plucks, a hand
    // drum and a seed shaker instead of hats: the jungle is beautiful but it is not friendly.
    day: {
      bpm: 72, root: 52, barsPerChord: 2,
      chords: [[0, 3, 7, 14], [-4, 0, 3, 7], [-7, -4, 0, 3], [-2, 2, 5, 10]],
      pad: { wave: 'triangle', vol: 0.05, cutoff: 1000, sweep: 360, attack: 2.2, release: 3.0, detune: 6 },
      bass: { wave: 'sine', vol: 0.13, steps: [0, 5], decay: 1.4 },
      arp: { wave: 'triangle', vol: 0.032, chance: 0.28, octaves: [12, 24], decay: 0.45 },
      perc: { shaker: [2, 6], shakerVol: 0.012, tom: [0, 3], tomVol: 0.05, tomPitch: 2, tick: [5], tickVol: 0.012, tickChance: 0.35 },
      delay: { time: 0.62, feedback: 0.38, wet: 0.38 },
    },
    // Sunset in the jungle: C# minor with a flat-II and a diminished turn, a heartbeat kick and a drone.
    dusk: {
      bpm: 64, root: 49, barsPerChord: 2,
      chords: [[0, 3, 7, 12], [1, 5, 8, 13], [-2, 2, 5, 10], [0, 3, 6, 9]],
      pad: { wave: 'sawtooth', vol: 0.032, cutoff: 620, sweep: 260, attack: 2.4, release: 3.2, detune: 10 },
      bass: { wave: 'sine', vol: 0.15, steps: [0], decay: 2.6 },
      arp: { wave: 'sine', vol: 0.03, chance: 0.12, octaves: [24, 36], decay: 1.6 },
      perc: { kick: [0, 1], kickVol: 0.09, tick: [4], tickVol: 0.01, tickChance: 0.5 },
      drone: { vol: 0.035, wave: 'triangle' },
      delay: { time: 0.94, feedback: 0.45, wet: 0.42 },
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
