// Jungle ambience beds (WebAudio, all synthesized). Owned by the audio engine (game.sfx.ambient) and
// driven by the AudioDirector, which picks a blend of profiles (src/data/audio.js AMBIENCE.profiles):
//
//   continuous layers  wind / leaf wash, day insect drone, dusk cicada swells, near-water babble (follows
//                      the river near the player), rain (setRain 0..1, from src/world/Weather.js)
//   creature calls     day birds (whistles, trills, chirps, coos, bell-pings, far chatter), a distant howler
//                      at dusk, night crickets and frogs (each a little "agent" with its own pitch, place and
//                      rhythm, so the chorus breathes instead of looping)
//
//   setProfile(weights, level)   target layer weights (0..1) and overall bed level; blends over AMBIENCE.smooth
//   setWater(level, pan)         0..1 loudness and -1..1 pan of the nearest water
//   setRain(v)                   0..1
//   setWeather(key)              today's weather (AMBIENCE.weather): fog hushes the bed (a low-pass on the
//                                whole thing), heat brings the cicadas out by day, rain quiets the birds
//
// Continuous layers only exist while audible (built on demand, torn down after a few silent seconds),
// and creature calls are only scheduled while the ambience bus is up, so a muted bed costs ~nothing.

import { AMBIENCE } from '../data/audio.js';
import { noiseBuffers, makeImpulse, renderLayers } from './synth.js';

const KEYS = ['wind', 'insects', 'cicada', 'birds', 'crickets', 'frogs', 'howl', 'water'];
const pick = (v) => (Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v);
const rint = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const weighted = (table) => {
  const e = Object.entries(table);
  let r = Math.random() * e.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of e) { r -= w; if (r <= 0) return k; }
  return e[0][0];
};

export class AmbientAudio {
  constructor(engine) {
    this.e = engine;
    this.ctx = null;
    this.mix = Object.fromEntries(KEYS.map((k) => [k, 0]));
    this.target = { ...this.mix };
    this.level = 0;
    this.levelTarget = 0;
    this.water = { level: 0, pan: 0 };
    this.rain = 0;
    this.wx = null;            // AMBIENCE.weather[key] (or null)
    this.layers = {};          // name → { gain, nodes, quietT, ... }
    this.agents = { crickets: [], frogs: [] };
  }

  start(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.hush = ctx.createBiquadFilter();   // weather low-pass on the whole bed (open = 20 kHz)
    this.hush.type = 'lowpass';
    this.hush.frequency.value = 20000;
    this.out.connect(this.hush).connect(dest);
    const R = AMBIENCE.reverb;
    this.verb = ctx.createConvolver();
    this.verb.buffer = makeImpulse(ctx, R.time, R.decay, R.tone);
    const wet = ctx.createGain();
    wet.gain.value = R.wet;
    this.verb.connect(wet).connect(this.out);
    this.events = ctx.createGain();
    this.events.connect(this.out);
  }

  setProfile(weights, level = 1) {
    const W = this.wx;
    for (const k of KEYS) this.target[k] = Math.max(0, (weights?.[k] || 0) * (W?.mult?.[k] ?? 1) + (W?.add?.[k] || 0));
    this.levelTarget = Math.max(0, level * (W?.level ?? 1));
  }

  /** Today's weather key (or null): applied by the next setProfile; the hush glides in over a few seconds. */
  setWeather(key) { this.wx = (key && AMBIENCE.weather[key]) || null; }

  setWater(level, pan = 0) { this.water.level = Math.max(0, Math.min(1, level)); this.water.pan = Math.max(-1, Math.min(1, pan)); }
  setRain(v) { this.rain = Math.max(0, Math.min(1, Number(v) || 0)); }

  update(dt) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const k = 1 - Math.exp(-dt / AMBIENCE.smooth);
    for (const key of KEYS) this.mix[key] += (this.target[key] - this.mix[key]) * k;
    this.level += (this.levelTarget - this.level) * k;
    this.out.gain.setTargetAtTime(this.level, now, 0.25);
    this.hush.frequency.setTargetAtTime(this.wx?.hush || 20000, now, 1.5);
    const audible = this.level > 0.01 && this.e.busLevel('ambience') > 0;
    const L = AMBIENCE.layers;
    const want = audible ? {
      wind: this.mix.wind * L.wind.vol,
      insects: this.mix.insects * L.insects.vol,
      cicada: this.mix.cicada * L.cicada.vol,
      water: this.mix.water * this.water.level * L.water.vol,
      rain: this.rain * L.rain.vol,
    } : { wind: 0, insects: 0, cicada: 0, water: 0, rain: 0 };
    for (const [name, v] of Object.entries(want)) this._layer(name, v, dt, now);
    if (this.layers.water) this.layers.water.pan.pan.setTargetAtTime(this.water.pan, now, 0.4);
    if (this.layers.cicada) this._cicadaSwells(now);
    if (!audible) return;
    // creature calls
    const E = AMBIENCE.events;
    if (Math.random() < E.birds.rate * this.mix.birds * dt) this._bird(now + 0.05);
    if (Math.random() < E.howl.rate * this.mix.howl * dt) this._howl(now + 0.05);
    if (this.rain > 0.02 && Math.random() < L.rain.drips * this.rain * dt) this._drip(now + 0.02);
    this._agents('crickets', E.crickets, now);
    this._agents('frogs', E.frogs, now);
  }

  // ------------------------------------------------------------------ continuous layers

  _layer(name, v, dt, now) {
    let l = this.layers[name];
    if (v > 0.0005 && !l) l = this.layers[name] = this._build(name);
    if (!l) return;
    l.gain.gain.setTargetAtTime(v, now, 0.5);
    if (v <= 0.0005) {
      l.quietT += dt;
      if (l.quietT > 3) { this._teardown(l); delete this.layers[name]; }
    } else l.quietT = 0;
  }

  _teardown(l) {
    for (const s of l.sources) { try { s.stop(); } catch { /* already stopped */ } }
    for (const n of l.nodes) n.disconnect();
  }

  _noise(kind, l) {
    const ctx = this.ctx;
    const b = noiseBuffers(ctx);
    const s = ctx.createBufferSource();
    s.buffer = b[kind] || b.white;
    s.loop = true;
    s.start(ctx.currentTime, Math.random() * 3.9);
    l.sources.push(s);
    l.nodes.push(s);
    return s;
  }

  _filter(type, f, q, l) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    l.nodes.push(n);
    return n;
  }

  _gain(v, l) { const g = this.ctx.createGain(); g.gain.value = v; l.nodes.push(g); return g; }

  _pan(v, l) { const p = this.ctx.createStereoPanner(); p.pan.value = v; l.nodes.push(p); return p; }

  /** An LFO into `param`: offset value + depth swing. */
  _lfo(param, rate, depth, l, type = 'sine') {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = rate;
    const g = this._gain(depth, l);
    o.connect(g).connect(param);
    o.start();
    l.sources.push(o);
    l.nodes.push(o);
  }

  /** src → amplitude-modulated gain (buzz): base 1 - d/2 ± d/2. */
  _buzz(rate, depth, l, type = 'sine') {
    const g = this._gain(1 - depth / 2, l);
    this._lfo(g.gain, rate, depth / 2, l, type);
    return g;
  }

  _build(name) {
    const ctx = this.ctx;
    const L = AMBIENCE.layers[name];
    const l = { gain: null, nodes: [], sources: [], quietT: 0 };
    l.gain = this._gain(0, l);
    l.gain.connect(this.out);
    if (name === 'wind') {
      const gust = this._gain(1 - L.gustDepth / 2, l);
      this._lfo(gust.gain, L.gustRate, L.gustDepth / 2, l);
      gust.connect(l.gain);
      for (const side of [-1, 1]) {
        const src = this._noise('pink', l);
        const lp = this._filter('lowpass', L.cutoff, 0.5, l);
        this._lfo(lp.frequency, pick(L.sweepRate), L.sweep, l);
        src.connect(lp).connect(this._pan(side * L.width, l)).connect(gust);
      }
    } else if (name === 'insects') {
      const swell = this._gain(1 - L.swellDepth / 2, l);
      this._lfo(swell.gain, L.swellRate, L.swellDepth / 2, l);
      swell.connect(l.gain);
      for (const [f, q, am, pan] of L.bands) {
        const src = this._noise('white', l);
        src.connect(this._filter('bandpass', f, q, l)).connect(this._buzz(am, L.buzz, l)).connect(this._pan(pan, l)).connect(swell);
      }
    } else if (name === 'cicada') {
      l.bands = L.bands.map(([f, q, am, pan]) => {
        const src = this._noise('white', l);
        const sw = this._gain(0.0001, l);
        src.connect(this._filter('bandpass', f, q, l)).connect(this._buzz(am, L.buzz, l, 'sawtooth')).connect(this._pan(pan, l)).connect(sw).connect(l.gain);
        return { swell: sw, next: ctx.currentTime + Math.random() * 2 };
      });
    } else if (name === 'water') {
      l.pan = this._pan(0, l);
      l.pan.connect(l.gain);
      const rumble = this._noise('brown', l);
      rumble.connect(this._filter('lowpass', L.rumble, 0.6, l)).connect(this._gain(0.8, l)).connect(l.pan);
      // babble: a narrow band whose centre wanders with two unrelated LFOs (burbling, never periodic)
      const [b0, b1] = L.babble;
      const bp = this._filter('bandpass', (b0 + b1) / 2, L.babbleQ, l);
      this._lfo(bp.frequency, 0.71, (b1 - b0) * 0.3, l);
      this._lfo(bp.frequency, 1.93, (b1 - b0) * 0.18, l);
      this._noise('white', l).connect(bp).connect(this._buzz(5.3, 0.4, l)).connect(this._gain(0.55, l)).connect(l.pan);
    } else if (name === 'rain') {
      const [h0, h1] = L.hiss;
      this._noise('white', l).connect(this._filter('highpass', h0, 0.5, l)).connect(this._filter('lowpass', h1, 0.5, l)).connect(this._gain(0.5, l)).connect(l.gain);
      this._noise('pink', l).connect(this._filter('lowpass', L.roar, 0.5, l)).connect(this._gain(0.7, l)).connect(l.gain);
    }
    return l;
  }

  /** Cicadas don't drone: each band swells up, holds, and falls away, then rests. */
  _cicadaSwells(now) {
    const C = AMBIENCE.layers.cicada;
    for (const b of this.layers.cicada.bands) {
      if (now < b.next) continue;
      const dur = pick(C.swell);
      const p = b.swell.gain;
      const t = now + 0.05;
      p.cancelScheduledValues(t);
      p.setValueAtTime(0.0001, t);
      p.exponentialRampToValueAtTime(1, t + dur * 0.45);
      p.setValueAtTime(1, t + dur * 0.7);
      p.exponentialRampToValueAtTime(0.0001, t + dur);
      b.next = t + dur + pick(C.rest);
    }
  }

  // ------------------------------------------------------------------ creature calls

  /** A call at `pan`, `dist` 0 (near) … 1 (far): quieter, duller and wetter with distance. */
  _call(layers, t, vol, pan, dist) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol * (1 - 0.7 * dist);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 12000 * 0.13 ** dist;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const send = ctx.createGain();
    send.gain.value = 0.15 + 0.6 * dist;
    g.connect(lp).connect(p);
    p.connect(this.events);
    p.connect(send).connect(this.verb);
    const end = renderLayers(ctx, g, layers, t);
    setTimeout(() => { g.disconnect(); lp.disconnect(); p.disconnect(); send.disconnect(); }, (end - ctx.currentTime + 0.3) * 1000);
  }

  _bird(t) {
    const B = AMBIENCE.events.birds;
    const kind = weighted(B.kinds);
    const dist = pick(B.dist);
    const pan = (Math.random() * 2 - 1) * 0.9;
    const layers = [];
    if (kind === 'whistle') {
      let f = 1500 + Math.random() * 1100;
      const n = rint(2, 4), drop = 0.84 + Math.random() * 0.1, vib = [6 + Math.random() * 3, 15 + Math.random() * 15];
      let at = 0;
      for (let i = 0; i < n; i++) {
        const dur = 0.18 + Math.random() * 0.17;
        layers.push({ w: 'sine', f, f2: f * 0.93, at, dur, a: 0.04, vib, vol: 1 - i * 0.12 });
        at += dur + 0.12 + Math.random() * 0.18;
        f *= drop;
      }
    } else if (kind === 'trill') {
      const f = 3200 + Math.random() * 1400;
      layers.push({ w: 'sine', f, f2: f * 1.15, dur: 0.03, a: 0.004, n: [6, 14], every: [0.045, 0.06], nvar: 0.04, vol: 0.8 });
    } else if (kind === 'chirp') {
      const f = 2300 + Math.random() * 700;
      layers.push({ w: 'sine', f, f2: f * 1.8, dur: 0.07, a: 0.006, n: [2, 4], every: [0.11, 0.16], nvar: 0.06 });
    } else if (kind === 'coo') {
      const f = 470 + Math.random() * 150;
      layers.push({ w: 'sine', f, f2: f * 0.92, dur: 0.32, a: 0.08, vol: 1.3 });
      layers.push({ w: 'sine', f: f * 0.89, f2: f * 0.84, at: 0.45, dur: 0.4, a: 0.08, vol: 1.2 });
      if (Math.random() < 0.5) layers.push({ w: 'sine', f: f * 0.89, f2: f * 0.84, at: 0.98, dur: 0.4, a: 0.08, vol: 1 });
    } else if (kind === 'tink') {
      const f = 2400 + Math.random() * 800;
      layers.push({ w: 'fm', f, ratio: 3.5, index: 0.8, index2: 0.05, dur: 0.25, n: [1, 3], every: [0.24, 0.32], nvar: 0.02, vol: 0.7 });
    } else {
      const f = 1100 + Math.random() * 300;
      layers.push({ w: 'sawtooth', f, f2: f * 0.8, dur: 0.07, lp: 2400, am: [40, 0.6], n: [3, 5], every: [0.09, 0.12], vol: 0.35 });
    }
    this._call(layers, t, B.vol, pan, kind === 'chatter' ? Math.max(0.7, dist) : dist);
  }

  _howl(t) {
    const H = AMBIENCE.events.howl;
    const f = 280 + Math.random() * 60;
    const layers = [];
    const n = rint(2, 3);
    for (let i = 0; i < n; i++) {
      const at = i * (1.1 + Math.random() * 0.3);
      layers.push({ w: 'sawtooth', f, fp: [[0.5, f * 1.45], [1.2, f * 0.95]], at, dur: 1.25, a: 0.25, lp: 900, am: [6, 0.4], vol: 0.6 });
      layers.push({ w: 'noise', fil: 'bandpass', f: f * 2, fp: [[0.5, f * 2.8]], q: 3, at, dur: 1.2, a: 0.3, vol: 0.5 });
    }
    this._call(layers, t, H.vol, (Math.random() * 2 - 1) * 0.8, 0.85 + Math.random() * 0.15);
  }

  _drip(t) {
    const f = 1800 + Math.random() * 1400;
    this._call([{ w: 'sine', f, f2: f * 1.6, dur: 0.03, a: 0.002 }], t, 0.025, (Math.random() * 2 - 1) * 0.9, Math.random() * 0.6);
  }

  /** Crickets / frogs: persistent callers, each with its own pitch, place, rhythm and rests. */
  _agents(kind, E, now) {
    const list = this.agents[kind];
    const weight = this.mix[kind];
    const n = Math.round(E.agents * Math.min(1, weight * 1.15));
    while (list.length < n) list.push(this._newAgent(kind, E, now));
    while (list.length > n) list.pop();
    const vol = E.vol * Math.sqrt(Math.min(1, weight));
    for (const a of list) {
      if (a.next > now + 0.3) continue;
      const t = Math.max(now + 0.02, a.next);
      if (kind === 'crickets') {
        this._call([{ w: 'sine', f: a.f, dur: E.pulse, a: 0.002, n: a.pulses, every: E.spacing, nvar: 0.01 }], t, vol, a.pan, a.dist);
      } else this._call(this._frog(a), t, vol * (a.kind === 'peep' ? 0.6 : 1), a.pan, a.dist);
      a.next = t + a.period * (0.93 + Math.random() * 0.14);
      if (Math.random() < 0.06) a.next += 2 + Math.random() * 6;   // a rest
    }
  }

  _newAgent(kind, E, now) {
    const a = { pan: (Math.random() * 2 - 1) * 0.85, dist: pick(E.dist || [0.15, 0.85]), next: now + Math.random() * 2, period: pick(E.period) };
    if (kind === 'crickets') { a.f = pick(E.f); a.pulses = rint(E.pulses[0], E.pulses[1]); } else {
      a.kind = weighted(E.kinds);
      a.f = a.kind === 'croak' ? 160 + Math.random() * 110 : a.kind === 'peep' ? 2200 + Math.random() * 800 : 380 + Math.random() * 160;
    }
    return a;
  }

  _frog(a) {
    if (a.kind === 'croak') return [{ w: 'square', f: a.f, f2: a.f * 0.92, dur: 0.12, a: 0.01, lp: 900, q: 3, am: [28, 0.9], n: [1, 2], every: 0.19 }];
    if (a.kind === 'peep') return [{ w: 'sine', f: a.f, f2: a.f * 1.25, dur: 0.06, a: 0.005, n: [1, 3], every: 0.13, nvar: 0.03 }];
    return [{ w: 'sine', f: a.f, f2: a.f * 0.8, dur: 0.05, a: 0.003, n: [2, 5], every: 0.09, nvar: 0.03 },
      { w: 'noise', fil: 'bandpass', f: 1600, q: 3, dur: 0.012, n: [2, 5], every: 0.09, vol: 0.3 }];
  }
}
