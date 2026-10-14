// Procedural ambient music (WebAudio). Moods live in src/data/music.js.
//
//   game.music.play('title' | 'day' | 'dusk' | 'night' | 'boss' | 'results' | 'defeat')
//   game.music.stop()
//   game.music.setCombat(on)    jungle combat tension layer (toms, pulse, shaker) over the current mood;
//                               fades in / out (MUSIC.combat), driven by the AudioDirector
//
// play() is safe to call every frame: asking for the mood that is already playing does nothing.
// A new mood crossfades over the old one. Output goes into the audio engine's music bus (game.sfx.bus.music),
// so the Music / Master sliders and mute apply there; stings duck that bus. Audio may only start after a
// user gesture, so play() before that just remembers the mood and it starts on the first click/key. If
// WebAudio is unavailable, everything is a silent no-op.
//
// CPU: a 120 ms timer schedules notes ~0.5 s ahead; each note is a short-lived oscillator, a few
// per second at most. Nothing is scheduled while the tab is hidden or the music is muted.

import { MUSIC } from '../data/music.js';
import { midiHz } from './synth.js';

const LOOKAHEAD = 0.5;
const TICK_MS = 120;
const STEPS_PER_BAR = 8;

export class Music {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.mood = null;          // requested mood (even before audio can start)
    this.player = null;        // the active mood player
    this.fading = [];          // players fading out
    this.noise = null;
    this.combat = false;
    this._timer = null;
    this._failed = false;

    this._unlock = () => this._start();
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
  }

  /** Switch to a mood (crossfade). Unknown moods are ignored; the same mood again is a no-op. */
  play(mood) {
    if (!mood || !MUSIC.moods[mood]) return;
    if (this.mood === mood && (this.player || !this.ctx)) return;
    this.mood = mood;
    if (!this.ctx || this._failed) return;      // starts on the first user gesture
    try {
      this._fadeOutCurrent();
      this.player = this._makePlayer(mood);
    } catch (e) {
      this._fail(e);
    }
  }

  /** Fade out and stay silent until the next play(). */
  stop() {
    this.mood = null;
    try { this._fadeOutCurrent(); } catch { /* ignore */ }
  }

  /** Combat tension layer on/off (crossfaded; cheap to call every frame). */
  setCombat(on) {
    on = !!on;
    if (on === this.combat) return;
    this.combat = on;
    const p = this.player;
    if (p && this.ctx) this._combatGain(p, on);
  }

  /** The user's music level (the bus applies it; here it only gates scheduling). */
  get volume() {
    const s = this.game.meta?.settings;
    if (s?.muted) return 0;
    const v = s?.music;
    return typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 0.5;
  }

  /** Re-read the volume settings (the engine owns the buses). */
  refreshVolume() { this.game.sfx?.applySettings?.(); }

  // ------------------------------------------------------------------ internals

  _start() {
    if (this._failed) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
      return;
    }
    try {
      // One AudioContext for the whole game: the engine's (src/core/Sfx.js).
      const engine = this.game.sfx;
      this.ctx = engine?.ensure?.() || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this.master = this.ctx.createGain();
      this.master.gain.value = MUSIC.master;
      this.master.connect(engine?.bus?.music || this.ctx.destination);
      // One second of white noise, reused for hats and shakers.
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._timer = setInterval(() => this._tick(), TICK_MS);
      window.removeEventListener('pointerdown', this._unlock);
      window.removeEventListener('keydown', this._unlock);
      if (this.mood) this.player = this._makePlayer(this.mood);
    } catch (e) {
      this._fail(e);
    }
  }

  _fail(e) {
    console.warn('Music disabled:', e);
    this._failed = true;
    clearInterval(this._timer);
    this._timer = null;
    this.player = null;
  }

  _makePlayer(mood) {
    const ctx = this.ctx;
    const spec = MUSIC.moods[mood];
    const now = ctx.currentTime;
    const p = { mood, spec, step: 0, next: now + 0.08, stepDur: 60 / spec.bpm / 2, nodes: [] };

    p.out = ctx.createGain();
    p.out.gain.setValueAtTime(0.0001, now);
    p.out.gain.exponentialRampToValueAtTime(1, now + MUSIC.fadeIn);
    p.out.connect(this.master);

    // Pad filter with a slow sweep.
    p.padFilter = ctx.createBiquadFilter();
    p.padFilter.type = 'lowpass';
    p.padFilter.frequency.value = spec.pad.cutoff;
    p.padFilter.Q.value = 0.7;
    p.padFilter.connect(p.out);
    p.lfo = ctx.createOscillator();
    p.lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = spec.pad.sweep || 0;
    p.lfo.connect(lfoGain).connect(p.padFilter.frequency);
    p.lfo.start(now);
    p.nodes.push(lfoGain);

    // Echo for the arp: delay -> darkening filter -> feedback, plus a wet send to the output.
    const dl = spec.delay;
    p.send = ctx.createGain();
    p.send.gain.value = dl.wet;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = dl.time;
    const fb = ctx.createGain();
    fb.gain.value = dl.feedback;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    p.send.connect(delay);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay);
    tone.connect(p.out);
    p.nodes.push(delay, fb, tone);

    // Bass gets its own filter (used by the brighter saw bass in the boss mood).
    p.bassFilter = ctx.createBiquadFilter();
    p.bassFilter.type = 'lowpass';
    p.bassFilter.frequency.value = spec.bass.cutoff || 3000;
    p.bassFilter.connect(p.out);

    // Combat layer: its own gain (0 → 1 while fighting) and a dark filter for the ostinato.
    const C = MUSIC.combat;
    p.combat = ctx.createGain();
    p.combat.gain.value = 0.0001;
    p.combat.connect(p.out);
    p.combatFilter = ctx.createBiquadFilter();
    p.combatFilter.type = 'lowpass';
    p.combatFilter.frequency.value = C.pulse.cutoff;
    p.combatFilter.Q.value = 4;
    p.combatFilter.connect(p.combat);
    p.nodes.push(p.combat, p.combatFilter);
    if (this.combat) this._combatGain(p, true);
    return p;
  }

  _combatGain(p, on) {
    const C = MUSIC.combat;
    const now = this.ctx.currentTime;
    const g = p.combat.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.setTargetAtTime(on ? C.level : 0.0001, now, (on ? C.fadeIn : C.fadeOut) / 3);
    p.combatUntil = on ? Infinity : now + C.fadeOut + 0.3;
  }

  _fadeOutCurrent() {
    const p = this.player;
    this.player = null;
    if (!p || !this.ctx) return;
    const now = this.ctx.currentTime;
    p.out.gain.cancelScheduledValues(now);
    p.out.gain.setValueAtTime(Math.max(0.0001, p.out.gain.value), now);
    p.out.gain.exponentialRampToValueAtTime(0.0001, now + MUSIC.fadeOut);
    p.dead = now + MUSIC.fadeOut + 0.2;
    this.fading.push(p);
  }

  _dispose(p) {
    try {
      p.lfo.stop();
      for (const n of [p.out, p.padFilter, p.lfo, p.send, p.bassFilter, ...p.nodes]) n.disconnect();
    } catch { /* ignore */ }
  }

  _tick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      const now = this.ctx.currentTime;
      for (let i = this.fading.length - 1; i >= 0; i--) {
        if (now > this.fading[i].dead) { this._dispose(this.fading[i]); this.fading.splice(i, 1); }
      }
      const p = this.player;
      if (!p) return;
      if (p.next < now - 0.2) p.next = now + 0.05;           // resumed after a pause: don't burst
      if (this.volume <= 0) { p.next = now + 0.1; return; }   // muted: schedule nothing
      while (p.next < now + LOOKAHEAD) {
        this._step(p, p.step, p.next);
        p.step += 1;
        p.next += p.stepDur;
      }
    } catch (e) {
      this._fail(e);
    }
  }

  _step(p, step, t) {
    const s = p.spec;
    const inBar = step % STEPS_PER_BAR;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const chordSteps = STEPS_PER_BAR * s.barsPerChord;
    const chord = s.chords[Math.floor(bar / s.barsPerChord) % s.chords.length];
    const root = s.root;

    // Pad: a new chord at the start of each chord span, overlapping the previous release.
    if (step % chordSteps === 0) {
      const span = chordSteps * p.stepDur;
      const hold = Math.max(0.1, span - s.pad.attack);
      chord.forEach((n, i) => {
        const f = midiHz(root + n + 12);
        const vol = s.pad.vol / Math.sqrt(chord.length);
        this._tone(p.padFilter, { freq: f, wave: s.pad.wave, t: t + i * 0.03, attack: s.pad.attack, hold, release: s.pad.release, vol, detune: -s.pad.detune });
        this._tone(p.padFilter, { freq: f, wave: s.pad.wave, t: t + i * 0.03, attack: s.pad.attack, hold, release: s.pad.release, vol: vol * 0.8, detune: s.pad.detune });
      });
      // Drone: the mood's root (not the chord's) held under everything.
      if (s.drone) this._tone(p.padFilter, { freq: midiHz(root - 12), wave: s.drone.wave || 'sine', t, attack: 1.2, hold: Math.max(0.1, span - 1.2), release: 2.2, vol: s.drone.vol });
    }

    // Bass: chord root an octave down.
    if (s.bass.steps.includes(inBar)) {
      const accent = inBar === 0 ? 1 : 0.7;
      this._pluck(p.bassFilter, { freq: midiHz(root + chord[0] - 12), wave: s.bass.wave, t, vol: s.bass.vol * accent, decay: s.bass.decay });
    }

    // Arp: sparse random chord tones, into the echo.
    if (Math.random() < s.arp.chance) {
      const n = chord[Math.floor(Math.random() * chord.length)];
      const oct = s.arp.octaves[Math.floor(Math.random() * s.arp.octaves.length)];
      const vol = s.arp.vol * (0.6 + Math.random() * 0.4);
      const freq = midiHz(root + n + oct);
      this._pluck(p.out, { freq, wave: s.arp.wave, t, vol, decay: s.arp.decay, send: p.send });
    }

    // Percussion.
    const pc = s.perc;
    if (pc) {
      if (pc.kick?.includes(inBar)) this._kick(p.out, t, pc.kickVol);
      if (pc.hat?.includes(inBar)) this._hat(p.out, t, pc.hatVol * (inBar % 2 ? 1 : 0.7));
      if (pc.shaker?.includes(inBar)) this._shaker(p.out, t, pc.shakerVol * (0.7 + Math.random() * 0.3));
      if (pc.tom?.includes(inBar)) this._tom(p.out, t, pc.tomVol * (0.75 + Math.random() * 0.25), midiHz(root + chord[0] - 12) * (pc.tomPitch || 2));
      if (pc.tick?.includes(inBar) && Math.random() < (pc.tickChance ?? 1)) this._tick2(p.out, t, pc.tickVol);
    }

    // Combat layer (while on, and through its fade-out).
    if (this.ctx.currentTime < (p.combatUntil ?? -1)) this._combatStep(p, inBar, bar, chord, t);
  }

  _combatStep(p, inBar, bar, chord, t) {
    const C = MUSIC.combat;
    const root = p.spec.root;
    const low = midiHz(root + chord[0] - 12);
    if (C.tom.steps.includes(inBar)) this._tom(p.combat, t, C.tom.vol * (inBar === 0 ? 1 : 0.75), low * C.tom.pitch);
    if (C.kick.steps.includes(inBar)) this._kick(p.combat, t, C.kick.vol);
    if (C.shaker.steps.includes(inBar)) this._shaker(p.combat, t, C.shaker.vol * (inBar % 2 ? 1 : 0.6));
    // The pulse: an eighth-note ostinato on the root, with a semitone push on the last step of every other bar.
    if (C.pulse.steps.includes(inBar)) {
      const push = inBar === 7 && bar % 2 === 1 ? 1 : 0;
      this._pluck(p.combatFilter, { freq: midiHz(root + chord[0] - 12 + push), wave: C.pulse.wave, t, vol: C.pulse.vol * (inBar === 0 ? 1 : 0.7), decay: C.pulse.decay });
    }
  }

  _tone(dest, { freq, wave, t, attack, hold, release, vol, detune = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + hold + release + 0.05);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  _pluck(dest, { freq, wave, t, vol, decay, send }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(dest);
    if (send) g.connect(send);
    o.start(t);
    o.stop(t + decay + 0.05);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  _kick(dest, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.35);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  /** A hand drum: a sine dropping a fifth, plus a little skin noise. */
  _tom(dest, t, vol, freq) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.4);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    this._noiseHit(dest, t, vol * 0.25, 'bandpass', 900, 1.2, 0.05);
  }

  _hat(dest, t, vol) { this._noiseHit(dest, t, vol, 'highpass', 7000, 0.7, 0.05); }

  /** Seed shaker: soft attack, band-passed. */
  _shaker(dest, t, vol) { this._noiseHit(dest, t, vol, 'bandpass', 5200, 1.4, 0.09, 0.02); }

  /** Woodblock tick. */
  _tick2(dest, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 1750 + Math.random() * 120;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.06);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  _noiseHit(dest, t, vol, type, freq, q, len, attack = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    if (attack > 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
    } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.85, len + 0.05);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }
}
