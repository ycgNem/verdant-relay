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
}
