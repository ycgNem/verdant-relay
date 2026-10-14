// Tiny WebAudio synth kit shared by Sfx (one-shots), AmbientAudio (beds + creature calls) and the
// tests (OfflineAudioContext renders). Everything is synthesized: no sample files.
//
// A sound is a list of LAYERS rendered into one destination node at a start time. Layer fields
// (all optional except `w`):
//
//   w       'sine' | 'triangle' | 'square' | 'sawtooth'   oscillator
//           'noise' | 'pink' | 'brown'                    filtered noise (white / pink / brown)
//           'fm'                                          2-operator FM (bells, chimes, metal)
//   f, f2   frequency (Hz) and the sweep target (exponential, over `ft`, default the whole `dur`).
//           For noise this is the filter centre/cutoff.  fp: [[t, hz], …] extra sweep points.
//   fil     noise filter: 'bandpass' (default) | 'lowpass' | 'highpass';  q = resonance
//   lp, lp2 extra low-pass on an oscillator (cutoff → sweep target over `lpt`, default dur), q
//   dur     total length (s) · at = start offset · a = attack · hold = time at full level before
//           the exponential (or `curve: 'lin'`) decay · vol = peak (relative; the sound's vol scales it)
//   vib     [rateHz, cents] vibrato · am = [rateHz, depth 0..1] tremolo
//   detune  cents · ratio / index / index2 (fm: modulator ratio, index at start → end)
//   notes   [semitones] + base (MIDI) + step (s between notes): one copy of the layer per note
//   n       repeat count (number or [min, max]) every `every` s (number or [min, max]) — crackles,
//           ticks, hoof beats; `jit` adds ± random time
//   pan     extra StereoPanner for this layer (-1..1)
//
// renderLayers(ctx, dest, layers, t0, { pitch }) → the time the last layer ends.

export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

const pick = (v) => (Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v);

const BUFS = new WeakMap();

/** Cached 4-second noise buffers for a context: { white, pink, brown }. */
export function noiseBuffers(ctx) {
  let b = BUFS.get(ctx);
  if (b) return b;
  const n = Math.floor(ctx.sampleRate * 4);
  const mk = () => ctx.createBuffer(1, n, ctx.sampleRate);
  const white = mk(), pink = mk(), brown = mk();
  const w = white.getChannelData(0), p = pink.getChannelData(0), br = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    // Paul Kellet's pink filter
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    br[i] = last * 3.5;
  }
  // Fade the loop seam (these buffers also loop in the ambience beds).
  const fade = Math.floor(ctx.sampleRate * 0.02);
  for (const d of [w, p, br]) for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[n - 1 - i] *= k; }
  b = { white, pink, brown };
  BUFS.set(ctx, b);
  return b;
}

/** A stereo impulse response: decaying noise that darkens over time (a jungle-clearing space). */
export function makeImpulse(ctx, time = 1.6, decay = 2.5, tone = 5000) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * time));
  const ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      // one-pole low-pass whose cutoff falls with time: early reflections bright, the tail dull
      const a = Math.min(1, (tone * (1 - 0.8 * k)) / ctx.sampleRate * 6.28);
      lp += a * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * (1 - k) ** decay * (i < ctx.sampleRate * 0.008 ? i / (ctx.sampleRate * 0.008) : 1);
    }
  }
  return ir;
}

function envelope(param, t, a, hold, end, vol, curve) {
  param.setValueAtTime(0.0001, t);
  if (a > 0.0015) {
    if (curve === 'lin') param.linearRampToValueAtTime(vol, t + a);
    else param.exponentialRampToValueAtTime(vol, t + a);
  } else param.setValueAtTime(vol, t);
  if (hold > 0) param.setValueAtTime(vol, t + a + hold);
  if (curve === 'lin') param.linearRampToValueAtTime(0.0001, end);
  else param.exponentialRampToValueAtTime(0.0001, end);
}

function sweep(param, t, f, f2, ft, fp, pm) {
  param.setValueAtTime(Math.max(10, f * pm), t);
  if (f2) param.exponentialRampToValueAtTime(Math.max(10, f2 * pm), t + ft);
  if (fp) for (const [pt, pf] of fp) param.exponentialRampToValueAtTime(Math.max(10, pf * pm), t + pt);
}

/** Start a low-frequency oscillator into `param` (scaled by `depth`) for [t, end]. */
function lfo(ctx, param, rate, depth, t, end, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(param);
  o.start(t);
  o.stop(end + 0.03);
  o.onended = () => { o.disconnect(); g.disconnect(); };
}

/** Render one layer instance (no notes / repeats) starting at t. Returns its end time. */
function renderOne(ctx, dest, L, t, pm, f) {
  const dur = Math.max(0.005, L.dur || 0.1);
  const a = Math.min(L.a ?? 0.003, dur * 0.9);
  const hold = L.hold || 0;
  const end = t + Math.max(dur, a + hold + 0.005);
  const vol = Math.max(0.0002, L.vol ?? 1);
  const ft = Math.max(0.005, L.ft ?? dur);
  const env = ctx.createGain();
  envelope(env.gain, t, a, hold, end, vol, L.curve);
  let head = env;                       // where the source connects
  // Tremolo sits between the source and the envelope.
  if (L.am) {
    const amG = ctx.createGain();
    const d = Math.max(0, Math.min(1, L.am[1]));
    amG.gain.value = 1 - d / 2;
    lfo(ctx, amG.gain, L.am[0], d / 2, t, end, L.am[2] || 'sine');
    amG.connect(env);
    head = amG;
  }
  let out = env;
  if (L.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, L.pan));
    env.connect(p);
    out = p;
  }
  out.connect(dest);
  const nodes = [env, out, head];
  let src;
  const w = L.w;
  if (w === 'noise' || w === 'pink' || w === 'brown') {
    const bufs = noiseBuffers(ctx);
    src = ctx.createBufferSource();
    src.buffer = w === 'pink' ? bufs.pink : w === 'brown' ? bufs.brown : bufs.white;
    src.loop = end - t > 3.5;
    const fl = ctx.createBiquadFilter();
    fl.type = L.fil || 'bandpass';
    fl.Q.value = L.q ?? (fl.type === 'bandpass' ? 1 : 0.7);
    sweep(fl.frequency, t, f, L.f2, ft, L.fp, pm);
    src.connect(fl).connect(head);
    nodes.push(fl);
    src.start(t, src.loop ? Math.random() * 3.9 : Math.random() * Math.max(0, 3.95 - (end - t)));
  } else if (w === 'fm') {
    src = ctx.createOscillator();
    src.type = 'sine';
    sweep(src.frequency, t, f, L.f2, ft, L.fp, pm);
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    const ratio = L.ratio || 2;
    sweep(mod.frequency, t, f * ratio, L.f2 ? L.f2 * ratio : 0, ft, null, pm);
    const mg = ctx.createGain();
    const i0 = (L.index ?? 1) * f * pm, i1 = (L.index2 ?? (L.index ?? 1) * 0.3) * f * pm;
    mg.gain.setValueAtTime(Math.max(0.01, i0), t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.01, i1), end);
    mod.connect(mg).connect(src.frequency);
    mod.start(t);
    mod.stop(end + 0.02);
    mod.onended = () => { mod.disconnect(); mg.disconnect(); };
    if (L.detune) src.detune.value = L.detune;
    src.connect(head);
    src.start(t);
  } else {
    src = ctx.createOscillator();
    src.type = w || 'sine';
    sweep(src.frequency, t, f, L.f2, ft, L.fp, pm);
    if (L.detune) src.detune.value = L.detune;
    if (L.vib) lfo(ctx, src.detune, L.vib[0], L.vib[1], t, end);
    if (L.lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.Q.value = L.q ?? 0.8;
      fl.frequency.setValueAtTime(L.lp, t);
      if (L.lp2) fl.frequency.exponentialRampToValueAtTime(L.lp2, t + (L.lpt ?? dur));
      src.connect(fl).connect(head);
      nodes.push(fl);
    } else src.connect(head);
    src.start(t);
  }
  src.stop(end + 0.02);
  src.onended = () => { src.disconnect(); for (const n of nodes) n.disconnect(); };
  return end;
}

/**
 * Render layers into `dest` from t0. opts.pitch multiplies every frequency (per-play variation),
 * opts.more adds repeats to every repeating layer (e.g. an Arc chain with more links crackles longer).
 * Returns the end time of the last layer.
 */
export function renderLayers(ctx, dest, layers, t0, opts = {}) {
  const pm = opts.pitch || 1;
  let end = t0;
  for (const L of layers) {
    const t = t0 + (L.at || 0);
    const notes = L.notes ? L.notes.map((n) => midiHz((L.base ?? 60) + n)) : [L.f ?? 440];
    notes.forEach((f, k) => {
      const tn = t + k * (L.step || 0);
      if (L.n != null) {
        const n = Math.max(1, Math.round(pick(L.n)) + (opts.more || 0));
        let tt = tn;
        for (let i = 0; i < n; i++) {
          // repeats drift a little in pitch so a crackle never sounds like a loop
          end = Math.max(end, renderOne(ctx, dest, L, Math.max(t0, tt + (L.jit ? (Math.random() - 0.5) * 2 * L.jit : 0)), pm * (1 + (Math.random() - 0.5) * (L.nvar ?? 0.12)), f));
          tt += pick(L.every ?? 0.05);
        }
      } else end = Math.max(end, renderOne(ctx, dest, L, tn, pm, f));
    });
  }
  return end;
}

/** Peak + RMS of a rendered AudioBuffer (tests). */
export function measure(buf) {
  let peak = 0, sum = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; n++; }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}
