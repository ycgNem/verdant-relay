// Tiny synthesized sound effects (WebAudio). Optional by design: if audio can't start,
// every call is a silent no-op. Replace with real samples later through the same names.

const SOUNDS = {
  shoot: { type: 'square', f: 520, f2: 240, dur: 0.07, vol: 0.12 },
  cutter: { type: 'sawtooth', f: 180, f2: 90, dur: 0.12, vol: 0.14 },
  hit: { type: 'square', f: 200, f2: 120, dur: 0.06, vol: 0.12 },
  hurt: { type: 'sawtooth', f: 160, f2: 60, dur: 0.18, vol: 0.2 },
  pickup: { type: 'triangle', f: 660, f2: 990, dur: 0.08, vol: 0.12 },
  open: { type: 'triangle', f: 330, f2: 520, dur: 0.12, vol: 0.14 },
  dodge: { type: 'triangle', f: 300, f2: 600, dur: 0.1, vol: 0.08 },
  build: { type: 'square', f: 300, f2: 600, dur: 0.12, vol: 0.12 },
  sell: { type: 'square', f: 600, f2: 300, dur: 0.12, vol: 0.12 },
  zap: { type: 'sawtooth', f: 900, f2: 300, dur: 0.1, vol: 0.08 },
  boom: { type: 'sawtooth', f: 120, f2: 40, dur: 0.25, vol: 0.18 },
  core: { type: 'square', f: 110, f2: 70, dur: 0.3, vol: 0.2 },
  done: { type: 'triangle', f: 440, f2: 880, dur: 0.3, vol: 0.15 },
  alarm: { type: 'square', f: 880, f2: 660, dur: 0.35, vol: 0.12 },
  error: { type: 'square', f: 140, f2: 140, dur: 0.1, vol: 0.1 },
  // Noise-based (jungle melee): band-passed noise swept from f to f2 (q = filter resonance);
  // `thump` adds a short low sine under it.
  slash: { type: 'noise', f: 900, f2: 3200, q: 1.2, dur: 0.11, vol: 0.22 },
  chop: { type: 'noise', f: 500, f2: 1600, q: 0.9, dur: 0.18, vol: 0.3, thump: 70 },
  cut: { type: 'noise', f: 2400, f2: 1200, q: 0.7, dur: 0.09, vol: 0.16 },
  rustle: { type: 'noise', f: 3000, f2: 2200, q: 0.6, dur: 0.14, vol: 0.06 },
  flesh: { type: 'noise', f: 400, f2: 180, q: 1.5, dur: 0.08, vol: 0.22, thump: 110 },
  kill: { type: 'noise', f: 600, f2: 140, q: 1.2, dur: 0.16, vol: 0.26, thump: 80 },     // melee killing blow
  crack: { type: 'noise', f: 1400, f2: 260, q: 0.8, dur: 0.2, vol: 0.24, thump: 52 },    // heavy chop hits the ground
  glint: { type: 'triangle', f: 1700, f2: 2600, dur: 0.06, vol: 0.05 },                 // wind-up eye glint
  snort: { type: 'noise', f: 220, f2: 520, q: 2.2, dur: 0.22, vol: 0.2, thump: 60 },     // Razorback paws the ground
  spit: { type: 'noise', f: 700, f2: 300, q: 2.5, dur: 0.12, vol: 0.16 },               // Spitter lobs a glob
  splat: { type: 'noise', f: 380, f2: 120, q: 1.8, dur: 0.14, vol: 0.18, thump: 90 },    // the glob lands
};

export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.last = {};
  }

  unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
    }
  }

  play(name) {
    const s = SOUNDS[name];
    if (!s || !this.ctx || this.volume <= 0) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.03) return; // avoid stacking identical blips
    this.last[name] = now;
    try {
      if (s.type === 'noise') { this._noise(s, now); return; }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = s.type;
      osc.frequency.setValueAtTime(s.f, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, s.f2), now + s.dur);
      gain.gain.setValueAtTime(s.vol * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + s.dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + s.dur + 0.02);
    } catch {
      /* audio is optional */
    }
  }

  _noise(s, now) {
    const ctx = this.ctx;
    if (!this._noiseBuf) {
      const n = Math.floor(ctx.sampleRate * 0.4);
      this._noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = s.q || 1;
    bp.frequency.setValueAtTime(s.f, now);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, s.f2), now + s.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(s.vol * this.volume, now + Math.min(0.015, s.dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + s.dur);
    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(now, Math.random() * 0.2);
    src.stop(now + s.dur + 0.02);
    if (s.thump) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(s.thump * 1.6, now);
      o.frequency.exponentialRampToValueAtTime(s.thump, now + 0.08);
      g.gain.setValueAtTime(s.vol * this.volume * 1.2, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(now);
      o.stop(now + 0.14);
    }
  }
}
