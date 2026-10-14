// The audio engine: one AudioContext, a mix graph and synthesized one-shots (WebAudio; no sample files).
// Optional by design: if audio can't start, every call is a silent no-op.
//
//   sources → bus.sfx ─┐
//             bus.ui  ─┤
//   (Music) → bus.music → musicDuck ─┼→ master (master volume, mute) → glue compressor → limiter → speakers
//   (AmbientAudio) → bus.ambience ───┘
//
//   game.sfx.play(name, { vol, pan, rate, delay, more })   one-shot from SOUNDS (src/data/audio.js)
//   game.sfx.playAt(name, x, z, opts)                      positional: pans by the sound's screen x (scene camera)
//                                                          and fades / dulls with distance from the player (jungle)
//   game.sfx.applySettings()                               re-read meta.settings (master, volume = sfx, music, ambience, muted)
//   game.sfx.toggleMute()                                  also on MIX.muteKey (F2) anywhere
//   game.sfx.ambient                                       AmbientAudio (beds; setRain(0..1) for a future weather system)
//   game.sfx.update(dt)                                    called by the Game loop: drives the AudioDirector + ambience
//
// Every play gets a small random pitch / level change so repeats don't machine-gun; a voice cap, a
// per-sound cap and a same-sound gap keep big fights (40 enemies, 8 towers) from piling up.

import * as THREE from 'three';
import { MIX, SOUNDS } from '../data/audio.js';
import { renderLayers, makeImpulse } from './synth.js';
import { AmbientAudio } from './AmbientAudio.js';
import { AudioDirector } from './AudioDirector.js';
import { toast } from '../ui/ui.js';

const BUSES = ['sfx', 'ui', 'music', 'ambience'];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : d);
// Creature wind-ups without their own voice use the generic glint.
const soundDef = (name) => SOUNDS[name] || (typeof name === 'string' && name.startsWith('windup_') ? SOUNDS.windup : null);

export class Sfx {
  constructor(game = null) {
    this.game = game;
    this.ctx = null;
    this.bus = {};
    this.voices = [];          // { name, end, gain, pri }
    this.last = {};
    this._vol = MIX.defaults.volume;   // used only without a game (tests)
    this._v = new THREE.Vector3();
    this.ambient = new AmbientAudio(this);
    this.director = game ? new AudioDirector(game, this) : null;
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      if (e.code !== MIX.muteKey || e.repeat) return;
      e.preventDefault();
      this.toggleMute();
    });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      try { if (document.hidden) this.ctx.suspend(); else this.ctx.resume(); } catch { /* ignore */ }
    });
    // Menu hover ticks (buttons in menu screens and overlays; not over the jungle / night HUD).
    const ui = game?.ui;
    if (ui) {
      ui.addEventListener('pointerover', (e) => {
        const b = e.target.closest?.('button.btn');
        if (!b || b === this._hoverEl) return;
        this._hoverEl = b;
        if (b.classList.contains('disabled')) return;
        if ((game.sceneName === 'explore' || game.sceneName === 'defense') && !b.closest('.overlay')) return;
        const now = performance.now();
        if (now - (this._hoverT || 0) < MIX.hoverGap * 1000) return;
        this._hoverT = now;
        this.play('ui_hover');
      });
      ui.addEventListener('pointerout', (e) => {
        if (this._hoverEl && !this._hoverEl.contains(e.relatedTarget)) this._hoverEl = null;
      });
    }
  }

  get settings() { return this.game?.meta?.settings || null; }
  get muted() { return !!this.settings?.muted; }

  /** Legacy: the sound-effects level. Settings (meta.settings.volume) are the source of truth. */
  get volume() { return this.settings ? num(this.settings.volume, MIX.defaults.volume) : this._vol; }
  set volume(v) { this._vol = num(v, this._vol); this.applySettings(); }

  /** Create the context (call from a user gesture). Safe to call again: resumes a suspended context. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
      return;
    }
    if (this._failed) return;
    try {
      this._build(new (window.AudioContext || window.webkitAudioContext)());
    } catch (e) {
      console.warn('Audio disabled:', e);
      this._failed = true;
      this.ctx = null;
    }
  }

  /** The context, created if needed (only call from a gesture). */
  ensure() { this.unlock(); return this.ctx; }

  _build(ctx) {
    this.ctx = ctx;
    const C = MIX.compressor, L = MIX.limiter;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = C.threshold; comp.knee.value = C.knee; comp.ratio.value = C.ratio;
    comp.attack.value = C.attack; comp.release.value = C.release;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = L.threshold; lim.knee.value = L.knee; lim.ratio.value = L.ratio;
    lim.attack.value = L.attack; lim.release.value = L.release;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    comp.connect(lim);
    lim.connect(ctx.destination);
    this.comp = comp;
    this.limiter = lim;
    for (const k of BUSES) { this.bus[k] = ctx.createGain(); this.bus[k].gain.value = 0; }
    this.musicDuck = ctx.createGain();
    this.bus.music.connect(this.musicDuck).connect(this.master);
    for (const k of BUSES) if (k !== 'music') this.bus[k].connect(this.master);
    // Shared reverb for stings and big moments (returns into the sfx bus).
    const R = MIX.reverb;
    this.reverbIn = ctx.createConvolver();
    this.reverbIn.buffer = makeImpulse(ctx, R.time, R.decay, R.tone);
    const wet = ctx.createGain();
    wet.gain.value = R.wet;
    this.reverbIn.connect(wet).connect(this.bus.sfx);
    this.applySettings(true);
    this.ambient.start(ctx, this.bus.ambience);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** Level of a bus after the sliders (0 = skip work). */
  busLevel(bus = 'sfx') {
    if (this.muted) return 0;
    const s = this.settings;
    const master = s ? num(s.master, MIX.defaults.master) : 1;
    const v = !s ? this._vol
      : bus === 'music' ? num(s.music, MIX.defaults.music)
        : bus === 'ambience' ? num(s.ambience, MIX.defaults.ambience)
          : num(s.volume, MIX.defaults.volume);
    return master * v * (MIX.trim[bus] ?? 1);
  }

  /** Re-read the volume settings (sliders, mute). */
  applySettings(snap = false) {
    if (!this.ctx) return;
    const s = this.settings;
    const now = this.ctx.currentTime;
    const set = (param, v) => { if (snap) param.setValueAtTime(v, now); else param.setTargetAtTime(v, now, 0.04); };
    const master = this.muted ? 0 : s ? num(s.master, MIX.defaults.master) : 1;
    set(this.master.gain, master);
    for (const k of BUSES) {
      const v = !s ? this._vol
        : k === 'music' ? num(s.music, MIX.defaults.music)
          : k === 'ambience' ? num(s.ambience, MIX.defaults.ambience)
            : num(s.volume, MIX.defaults.volume);
      set(this.bus[k].gain, v * (MIX.trim[k] ?? 1));
    }
  }

  toggleMute() {
    const s = this.settings;
    if (!s) return;
    s.muted = !s.muted;
    this.game.saveMeta?.();
    this.unlock();
    this.applySettings();
    if (this.game?.ui) toast(this.game.ui, s.muted ? `Sound off (${MIX.muteKey})` : 'Sound on', s.muted ? 'amber' : 'good', 1.6);
    this.onMuteChange?.(s.muted);
  }

  update(dt) {
    if (!this.ctx) return;
    try {
      this.director?.update(dt);
      this.ambient.update(dt);
    } catch (e) {
      if (!this._warned) { this._warned = true; console.warn('Audio director:', e); }
    }
  }

  _prune(now) {
    // Voices end out of order (a long boom before short ticks), so check them all (there are only a few dozen).
    if (this.voices.some((v) => v.end < now)) this.voices = this.voices.filter((v) => v.end >= now);
  }

  /**
   * Play a sound. opts: vol (× its level), pan (-1..1), rate (pitch ×), delay (s), more (extra repeats of
   * repeating layers), muffle (0..1 low-pass, set by playAt). Returns the voice when it plays, `true` when the
   * sound exists but was skipped (no audio yet, muted, throttled, voice cap) and null for an unknown name — so
   * `sfx.play(newName) || sfx.play(oldName)` falls back only when the new name doesn't exist.
   */
  play(name, opts = {}) {
    const def = soundDef(name);
    if (!def) return null;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return true;
    const bus = def.bus || 'sfx';
    if (this.busLevel(bus) <= 0) return true;
    const now = ctx.currentTime;
    if (this.last[name] != null && now - this.last[name] < (def.gap ?? MIX.gap)) return true;
    this._prune(now);
    let same = 0;
    for (const v of this.voices) if (v.name === name) same++;
    if (same >= (def.max ?? MIX.perName)) return true;
    const pri = def.pri || 1;
    if (this.voices.length >= MIX.voices) {
      // Full: ordinary sounds wait their turn; a priority cue steals the oldest ordinary voice (fast fade),
      // and only if every voice is a priority cue may it go a few over (MIX.priExtra), never further.
      if (pri < 2) return true;
      const i = this.voices.findIndex((v) => v.pri < 2);
      if (i >= 0) {
        this.voices[i].gain.gain.setTargetAtTime(0, now, 0.015);
        this.voices.splice(i, 1);
      } else if (this.voices.length >= MIX.voices + MIX.priExtra) return true;
    }
    this.last[name] = now;
    try {
      const t = now + 0.004 + (opts.delay || 0);
      const pitch = 2 ** (((Math.random() * 2 - 1) * (def.pitch || 0)) / 12) * (opts.rate || 1);
      const vol = ((def.vol ?? 0.2) * (opts.vol ?? 1) * (1 - Math.random() * (def.vary ?? 0.12))) / (1 + MIX.stack * same);
      const g = ctx.createGain();
      g.gain.value = vol;
      const nodes = [g];
      let out = g;
      if (opts.muffle > 0.02) {
        const [f0, f1] = MIX.positional.muffleHz;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = f0 * (f1 / f0) ** clamp01(opts.muffle);
        out.connect(lp);
        out = lp;
        nodes.push(lp);
      }
      if (opts.pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, opts.pan));
        out.connect(p);
        out = p;
        nodes.push(p);
      }
      out.connect(this.bus[bus] || this.bus.sfx);
      if (def.send && this.reverbIn) {
        const s = ctx.createGain();
        s.gain.value = def.send;
        out.connect(s).connect(this.reverbIn);
        nodes.push(s);
      }
      const end = renderLayers(ctx, g, def.layers, t, { pitch, more: opts.more || 0 });
      const voice = { name, end: end + 0.05, gain: g, pri };
      this.voices.push(voice);
      if (def.duck) this.duckMusic(def.duck, end - t);
      setTimeout(() => { for (const n of nodes) n.disconnect(); }, (end - now + 0.4) * 1000);
      return voice;
    } catch {
      return true;   /* audio is optional */
    }
  }

  /** A world sound at (x, z): pan by screen x, fade + dull with distance from the player (if any). */
  playAt(name, x, z, opts = {}) {
    if (!this.ctx) return soundDef(name) ? true : null;
    const P = MIX.positional;
    const sc = this.game?.scene;
    let pan = 0, gain = 1, muffle = 0;
    const cam = sc?.camera;
    if (cam?.isCamera && Number.isFinite(x) && Number.isFinite(z)) {
      const v = this._v.set(x, 0, z).project(cam);
      if (Number.isFinite(v.x)) pan = Math.max(-P.panMax, Math.min(P.panMax, v.x * P.panWidth));
    }
    const lis = sc?.player?.pos;
    if (lis) {
      const d = Math.hypot(x - lis.x, z - lis.z);
      const near = soundDef(name)?.near ?? P.near; // tells (wind-ups) stay full-volume further out
      if (d > near) gain = (1 - Math.min(1, (d - near) / Math.max(1, P.far - near))) ** P.curve;
      if (d > P.muffleFrom) muffle = Math.min(1, (d - P.muffleFrom) / (P.far - P.muffleFrom));
    }
    if (gain < P.minGain) return soundDef(name) ? true : null;
    return this.play(name, { ...opts, pan: (opts.pan || 0) + pan, vol: (opts.vol ?? 1) * gain, muffle });
  }

  /** Dip the music bus by `amount` (0..1) for about `dur` seconds (stings). */
  duckMusic(amount, dur) {
    if (!this.musicDuck) return;
    const p = this.musicDuck.gain;
    const now = this.ctx.currentTime;
    const D = MIX.duck;
    const lo = Math.max(0, 1 - amount);
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(lo, now + D.attack);
    const holdEnd = now + Math.max(D.attack, dur * 0.6);
    p.setValueAtTime(lo, holdEnd);
    p.linearRampToValueAtTime(1, holdEnd + D.release);
  }
}
