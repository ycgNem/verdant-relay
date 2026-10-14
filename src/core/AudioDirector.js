// The audio director: reads the active scene every frame (no hooks needed in gameplay code) and drives
// the state-dependent audio. Ticked by game.sfx.update(dt) from the Game loop. Tuning: AUDIO_DIRECTOR
// and AMBIENCE in src/data/audio.js.
//
//   jungle ('explore')  ambience blend day → dusk (cicadas swell ahead of sunset) → night (frogs, crickets),
//                       ducked while paused / on the big map; the water layer follows the nearest river;
//                       footsteps by surface on the walk anim's contact frames (alternating L/R);
//                       heartbeat under 30% HP; a breathy huff when stamina runs out; a rising tick (and,
//                       on beacons / the way home, a rising hum) while E is held; a tension swell while a
//                       heavy chop charges; the music's combat layer while an alerted creature is close
//   night ('defense')   calmer night bed (lower during waves); Relay-critical alarm under 30% (throttled,
//                       only while it is still being hit)
//   menus               a quiet distant bed

import { AMBIENCE, AUDIO_DIRECTOR as D } from '../data/audio.js';
import { DAY, LEVEL } from '../data/jungle.js';
import { CONFIG } from '../data/config.js';
import { noiseBuffers } from './synth.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class AudioDirector {
  constructor(game, engine) {
    this.game = game;
    this.e = engine;
    this.scene = null;
    this._reset();
  }

  _reset() {
    this.stepSide = 1;
    this.lastFrame = -1;
    this.strideAcc = 0;
    this.lastPos = null;
    this.beatT = 0;
    this.holdT = 0;
    this.hum = null;
    this.chargeV = null;
    this.wasExhausted = false;
    this.waterT = 0;
    this.calmT = 99;
    this.relayHp = null;
    this.relayHitAt = -99;
    this.alarmAt = -99;
  }

  update(dt) {
    const game = this.game;
    const sc = game.scene;
    if (sc !== this.scene) {
      this._stopLoops();
      this.scene = sc;
      this._reset();
      game.music?.setCombat?.(false);
    }
    const amb = this.e.ambient;
    const name = game.sceneName;
    if (name === 'explore' && sc?.player) this._jungle(dt, sc, amb);
    else if (name === 'defense') this._defense(dt, sc, amb);
    else amb.setProfile(AMBIENCE.profiles.menu, AMBIENCE.level.menu);
  }

  // ================================================================== jungle

  _jungle(dt, sc, amb) {
    const P = AMBIENCE.profiles;
    const t = sc.dayT || 0;
    const pre = clamp01((t - (DAY.length - D.duskLead)) / D.duskLead);   // sunset approaching
    const night = clamp01(sc.duskK || 0);
    const wDusk = pre * (1 - night * 0.8);
    const wNight = night;
    const wDay = Math.max(0, 1 - wDusk - wNight);
    const mix = {};
    for (const k of Object.keys(P.day)) mix[k] = P.day[k] * wDay + P.dusk[k] * wDusk + P.night[k] * wNight;
    const duck = sc.paused ? AMBIENCE.duck.paused : sc.mapOpen ? AMBIENCE.duck.map : sc.ending ? AMBIENCE.duck.ending : 1;
    amb.setProfile(mix, AMBIENCE.level.jungle * duck);

    const pl = sc.player;
    const live = !sc.paused && !sc.mapOpen && !sc.finished && !pl.dead;
    this.waterT -= dt;
    if (this.waterT <= 0 && sc.world) { this.waterT = AMBIENCE.layers.water.scanEvery; this._scanWater(sc, amb); }
    if (!live) {
      this._stopLoops();
      this.lastPos = null;
      if (sc.finished || pl.dead) this.game.music?.setCombat?.(false);
      return;
    }

    this._footsteps(dt, sc, pl);
    this._heartbeat(dt, pl);
    this._hold(dt, sc);
    this._charge(sc, pl);
    if (pl.exhausted && !this.wasExhausted) this.e.play('huff');
    this.wasExhausted = !!pl.exhausted;
    this._combat(dt, sc, pl);
  }

  /** Loudness / pan of water around the player (shallow + deep tiles within the radius). */
  _scanWater(sc, amb) {
    const W = AMBIENCE.layers.water;
    const w = sc.world, p = sc.player.pos;
    const R = W.radius;
    let sum = 0, px = 0;
    const x0 = Math.floor(p.x), z0 = Math.floor(p.z);
    for (let dz = -R; dz <= R; dz += 1) for (let dx = -R; dx <= R; dx += 1) {
      const d2 = dx * dx + dz * dz;
      if (d2 > R * R) continue;
      const x = x0 + dx, z = z0 + dz;
      const deep = w.deepAt?.(x, z);
      if (!deep && w.levelAt(x + 0.5, z + 0.5) !== LEVEL.water) continue;
      const k = (deep ? 1.6 : 1) / (1 + d2 * 0.18);
      sum += k;
      px += k * dx;
    }
    amb.setWater(clamp01(sum / W.full), sum > 0 ? clamp01(Math.abs(px / sum) / R * 1.6) * Math.sign(px) : 0);
  }

  _footsteps(dt, sc, pl) {
    const F = D.footsteps;
    const p = pl.pos;
    const moved = this.lastPos ? Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) : 0;
    this.lastPos = { x: p.x, z: p.z };
    const speed = dt > 0 ? moved / dt : 0;
    if (!pl.moving || pl.state !== 'free' || speed < F.minSpeed) { this.lastFrame = -1; this.strideAcc = 0; return; }
    const vis = pl.vis?.userData?.vis;
    const a = vis?.anim === 'walk' && vis.anims?.walk;
    let step = false;
    if (a) {
      const fi = Math.floor(vis.animT * a.fps) % a.frames.length;
      if (fi !== this.lastFrame && F.contactFrames.includes(fi) && this.lastFrame !== -1) step = true;
      this.lastFrame = fi;
    } else {
      this.strideAcc += moved;
      if (this.strideAcc >= F.stride) { this.strideAcc = 0; step = true; }
    }
    if (!step) return;
    this.stepSide = -this.stepSide;
    const surf = this._surface(sc, p.x, p.z);
    const opts = { pan: this.stepSide * F.pan, vol: 0.8 + Math.min(0.4, speed / 14) };
    this.e.play(`step_${surf}`, opts);
    if (surf !== 'water' && sc.world.inFern?.(p.x, p.z)) this.e.play('step_fern', { pan: opts.pan, vol: F.fern });
  }

  _surface(sc, x, z) {
    const w = sc.world;
    const lv = w.levelAt(x, z);
    const s = D.footsteps.surfaces[lv] || 'dirt';
    if (lv !== LEVEL.dirt && lv !== LEVEL.floor) return s;
    const data = w.w;
    const V = (data?.size || 0) + 1;
    const vi = Math.round(z) * V + Math.round(x);
    if (lv === LEVEL.dirt && data?.pave?.[vi]) return 'stone';
    const ti = Math.floor(z) * (data?.size || 0) + Math.floor(x);
    if (data?.trail?.[ti]) return 'dirt';
    return s;
  }

  _heartbeat(dt, pl) {
    const H = D.heartbeat;
    const frac = pl.hp / (pl.maxHp || 100);
    if (frac >= H.below || pl.hp <= 0) { this.beatT = 0; return; }
    const sev = clamp01(1 - frac / H.below);
    this.beatT -= dt;
    if (this.beatT > 0) return;
    this.beatT = lerp(H.interval[0], H.interval[1], sev);
    this.e.play('heartbeat', { vol: lerp(H.vol[0], H.vol[1], sev) });
  }

  _hold(dt, sc) {
    const it = sc.holdTarget;
    const H = D.hold;
    if (!it || it.done || !(it.hold > 0)) { this._stopHum(); this.holdT = 0; return; }
    const mult = it.objectiveHold && this.game.run?.hasSkill?.('quick_extraction') ? CONFIG.expedition.quickExtraction : 1;
    const frac = clamp01(it.progress / (it.hold * mult));
    this.holdT -= dt;
    if (this.holdT <= 0) {
      this.holdT = lerp(H.tick[0], H.tick[1], frac);
      this.e.play('hold_tick', { rate: lerp(H.rate[0], H.rate[1], frac) });
    }
    if (it.kind === 'pylon' || it.kind === 'extract') this._humTo(frac);
    else this._stopHum();
  }

  /** A rising power-up hum while a beacon / the way home charges. */
  _humTo(frac) {
    const ctx = this.e.ctx;
    const H = D.hold;
    const now = ctx.currentTime;
    if (!this.hum) {
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'sine';
      o1.connect(lp); o2.connect(lp);
      lp.connect(g).connect(this.e.bus.sfx);
      o1.start(); o2.start();
      this.hum = { g, lp, o1, o2 };
      g.gain.setTargetAtTime(H.humVol, now, 0.08);
    }
    const f = lerp(H.humHz[0], H.humHz[1], frac);
    this.hum.o1.frequency.setTargetAtTime(f, now, 0.05);
    this.hum.o2.frequency.setTargetAtTime(f * 2.01, now, 0.05);
    this.hum.lp.frequency.setTargetAtTime(lerp(H.humCutoff[0], H.humCutoff[1], frac), now, 0.05);
  }

  _stopHum() {
    const h = this.hum;
    if (!h) return;
    this.hum = null;
    const now = this.e.ctx.currentTime;
    h.g.gain.setTargetAtTime(0.0001, now, 0.06);
    h.o1.stop(now + 0.4); h.o2.stop(now + 0.4);
    h.o2.onended = () => { h.o1.disconnect(); h.o2.disconnect(); h.lp.disconnect(); h.g.disconnect(); };
  }

  /** Heavy chop wind-up: filtered noise that rises until the chop is ready, then holds. */
  _charge(sc, pl) {
    const C = D.charge;
    if (pl.state !== 'charge') { this._stopCharge(); return; }
    const ctx = this.e.ctx;
    const now = ctx.currentTime;
    if (!this.chargeV) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffers(ctx).white;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.value = C.f[0];
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(bp).connect(g).connect(this.e.bus.sfx);
      src.start();
      g.gain.setTargetAtTime(C.vol, now, 0.05);
      this.chargeV = { src, bp, g };
    }
    const need = pl.weapon?.chop?.charge || 0.5;
    const k = clamp01((pl.chargeT || 0) / need);
    this.chargeV.bp.frequency.setTargetAtTime(lerp(C.f[0], C.f[1], k), now, 0.04);
    this.chargeV.g.gain.setTargetAtTime(C.vol * (k >= 1 ? 0.55 : 0.6 + 0.4 * k), now, 0.05);
  }

  _stopCharge() {
    const c = this.chargeV;
    if (!c) return;
    this.chargeV = null;
    const now = this.e.ctx.currentTime;
    c.g.gain.setTargetAtTime(0.0001, now, 0.03);
    c.src.stop(now + 0.2);
    c.src.onended = () => { c.src.disconnect(); c.bp.disconnect(); c.g.disconnect(); };
  }

  _stopLoops() {
    if (!this.e.ctx) return;
    this._stopHum();
    this._stopCharge();
  }

  /** The music's combat layer: on while an alerted creature is within reach, off after a calm spell. */
  _combat(dt, sc, pl) {
    const C = D.combat;
    const r2 = C.radius * C.radius;
    let near = false;
    for (const e of sc.enemies || []) {
      if (e.dead || !e.alerted) continue;
      const dx = e.x - pl.pos.x, dz = e.z - pl.pos.z;
      if (dx * dx + dz * dz <= r2) { near = true; break; }
    }
    this.calmT = near ? 0 : this.calmT + dt;
    this.game.music?.setCombat?.(this.calmT < C.calm);
  }

  // ================================================================== night defense

  _defense(dt, sc, amb) {
    const wave = sc?.phase === 'wave';
    amb.setProfile(AMBIENCE.profiles.defense, (wave ? AMBIENCE.level.defenseWave : AMBIENCE.level.defensePrep) * (sc?.paused ? AMBIENCE.duck.paused : 1));
    const run = this.game.run;
    if (!run || !wave || sc.paused) { this.relayHp = run?.relayHp ?? null; return; }
    const A = D.relayAlarm;
    const now = this.game.time;
    if (this.relayHp != null && run.relayHp < this.relayHp) this.relayHitAt = now;
    this.relayHp = run.relayHp;
    const frac = run.relayHp / (run.relayMax || 100);
    if (frac > 0 && frac < A.below && now - this.relayHitAt < A.recentHit && now - this.alarmAt > A.every) {
      this.alarmAt = now;
      this.e.play('relay_alarm');
    }
  }
}
