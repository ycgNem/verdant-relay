// Relay Protocols at night (src/data/protocols.js): the player's active abilities during pushes and lulls.
//
// ProtocolDeck owns their state for one night: charges and cooldowns, aiming (a ring follows the mouse on
// the ground; left click casts, right click / Esc cancels), the cast telegraph, the effects, live Flares
// (scene.litAt / scene.flareMult read them), the side-panel buttons with cooldown sweeps and the hotkeys.
// DefenseScene creates it in enter(), calls update(dt) from _step (game time), handleInput() from
// _handleInput, frame() from _frameVisuals, panel() from the in-wave side panel, and dispose() on exit.
// Casting from code (the balance sim): deck.cast(key, {x, z}).

import * as THREE from 'three';
import { setAnim, updateVisual } from '../core/Assets.js';
import { el, button, costLine } from '../ui/ui.js';
import { PROTOCOLS, PROTOCOL_ICONS, perNight } from '../data/protocols.js';
import { healthMult } from '../data/waves.js';
import { toast } from '../ui/ui.js';

// Looks (critic H2 §8: no smooth-alpha discs): the aim cursor is a 1-px dashed ring; Vine Snare wraps each rooted
// enemy in fx_vine_snare (DefenseScene.makeVines); a Flare is the fx_flare_pool sprite (3-tile radius at 1x) with the
// burning fx_flare_ember canister in the middle; Arc Discharge stays code bolts. Rings on landing step out hard.
const TEXEL = 1 / 32;
const AIM_DASHES = 24;

export class ProtocolDeck {
  constructor(scene) {
    this.scene = scene;
    const run = scene.run;
    this.keys = run.protocolsFor(scene.game.meta);
    this.state = {};
    for (const k of this.keys) this.state[k] = { charges: this.maxCharges(k), cd: 0 };
    this.aiming = null;
    this.pending = [];      // casts waiting for their telegraph: { key, x, z, t }
    this.flares = [];       // live Flares: { x, z, r, t, mesh }
    this.casts = 0;         // casts made tonight (stats / sim)
    this.buttons = {};

    // Aim cursor: a 1-px dashed ring on the ground under the mouse, in the protocol's colour (no fill). Its dashes
    // are rebuilt per radius (aim) so the line stays one texel thick; the ring marches slowly.
    const T = (x) => scene._track(x);
    this.aimRingMat = T(new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false, side: THREE.DoubleSide }));
    this.aimObj = new THREE.Group();
    this.aimObj.visible = false;
    this.aimR = 0;
    scene.three.add(this.aimObj);
    // Flare ground glow fallback (no fx_flare_pool art): shared geometry, one material per flare.
    this.flareGeom = T(new THREE.CircleGeometry(1, 40));
  }

  /** (Re)build the aim ring's dashes for radius r: AIM_DASHES dashes, 1.5 texels thick (never thinner than a pixel). */
  _aimRing(r) {
    if (Math.abs(this.aimR - r) < 1e-3) return;
    this.aimR = r;
    for (const c of [...this.aimObj.children]) { c.geometry.dispose(); c.removeFromParent(); }
    const seg = (Math.PI * 2) / AIM_DASHES;
    for (let i = 0; i < AIM_DASHES; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - TEXEL * 1.5, r, 4, 1, i * seg, seg * 0.5), this.aimRingMat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 6;
      this.aimObj.add(m);
    }
  }

  /** Charges this protocol can store tonight. */
  maxCharges(k) { return perNight(PROTOCOLS[k].charges, this.scene.night) || 1; }

  /** Tonight's numbers for `k`: cooldown and radius with relics applied (Run.protocolDef: Capacitor, Signal Booster). */
  def(k) { return this.scene.run.protocolDef?.(k) || PROTOCOLS[k]; }

  /** Is a phase one where protocols can be used? */
  get live() { return this.scene.phase === 'wave' || this.scene.phase === 'lull'; }

  /** Why `k` can't be cast right now (null = it can). */
  blocked(k) {
    const P = PROTOCOLS[k], st = this.state[k], run = this.scene.run;
    if (!st) return 'Not unlocked';
    if (!this.live) return 'Only during the attack';
    if (st.charges <= 0) return `Recharging (${Math.ceil(st.cd)} s)`;
    return run.missing(P.cost);
  }

  // ---------------------------------------------------------------- aiming and casting

  /** Start (or toggle off) aiming `k`. */
  aim(k) {
    if (this.aiming === k) { this.cancelAim(); return; }
    const why = this.blocked(k);
    if (why) { this.scene.game.sfx.play('error'); toast(this.scene.game.ui, `${PROTOCOLS[k].name}: ${why}`, 'bad', 1.8); return; }
    this.aiming = k;
    const P = this.def(k);
    this.aimRingMat.color.set(P.color);
    this._aimRing(P.radius);
    this.scene.sideDirty = true;
  }

  cancelAim() {
    if (!this.aiming) return;
    this.aiming = null;
    this.aimObj.visible = false;
    this.scene.sideDirty = true;
  }

  /** Pay and fire `k` at ground point p ({x, z}). Returns true when cast. */
  cast(k, p) {
    const P = this.def(k), st = this.state[k], scene = this.scene, run = scene.run;
    if (this.blocked(k)) return false;
    if (!run.spend(P.cost)) return false;
    if (st.charges === this.maxCharges(k)) st.cd = P.cooldown;
    st.charges -= 1;
    this.casts += 1;
    if (scene.nightStats) scene.nightStats.protocols = (scene.nightStats.protocols || 0) + 1;
    const pos = new THREE.Vector3(p.x, 0, p.z);
    // Friendly telegraph: a dashed ring that closes in, in the protocol's colour.
    scene.fx.telegraph(pos, { radius: P.radius, color: P.color, time: P.telegraph, fade: 0.05, style: 'dashed' });
    this.pending.push({ key: k, x: p.x, z: p.z, t: P.telegraph });
    scene.game.sfx.play(`cast_${k}`);
    if (this.aiming === k) this.cancelAim();
    scene.sideDirty = true;
    scene._refreshTop?.();
    return true;
  }

  /** The effect lands (after the telegraph). */
  _resolve(c) {
    const P = this.def(c.key), scene = this.scene, fx = scene.fx;
    const pos = new THREE.Vector3(c.x, 0, c.z);
    const inside = (e) => !e.dead && !e.removed && e.onField && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) <= P.radius + (e.boss ? 0.8 : 0.15);
    if (c.key === 'vine_snare') {
      let n = 0, cancelled = false;
      for (const e of scene.enemies) {
        if (!inside(e)) continue;
        let held = false;
        if (e.boss) { const r = e.protocolRoot(P.bossRoot); if (r === 'cancel') cancelled = true; if (r) { n++; held = true; } }
        else if (e.applyRoot(P.root)) { n++; held = true; }
        // Held enemies take × rootDamage while the snare lasts (DefenseScene.damage reads it).
        if (held && P.rootDamage) { e.snaredUntil = (scene.waveTime || 0) + (e.boss ? P.bossRoot : P.root); e.snareDmg = P.rootDamage; }
      }
      fx.ring(pos, { color: P.color, radius: P.radius, life: 0.45, hard: true, px: 2 });
      fx.burst(pos, { color: '#63c74d', color2: '#265c42', count: 26, speed: 2.4, up: 2.5, life: 0.55, size: 0.08, y: 0.05 });
      scene.game.sfx.playAt('vine_root', c.x, c.z);
      if (cancelled) {
        toast(scene.game.ui, 'Charge cancelled! The Colossus is held.', 'good', 2.2);
        fx.text(pos, 'CHARGE STOPPED', { color: '#63c74d', cls: 'big', y: 2.6, life: 1.1 });
      } else if (n) fx.text(pos, `${n} rooted`, { color: '#63c74d', y: 1.4, life: 0.8 });
    } else if (c.key === 'arc_discharge') {
      // Scales with the night's enemy health (healthMult), so it stays worth a cast late (critic K2 #3).
      const dmg = Array.isArray(P.damage) ? P.damage[0] + P.damage[1] * scene.night : Math.round(P.damage * healthMult(scene.night));
      for (const e of [...scene.enemies]) if (inside(e)) scene.damage(e, dmg, P.damageType, { protocol: c.key });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.random();
        const to = new THREE.Vector3(c.x + Math.cos(a) * P.radius * 0.6, 0.1, c.z + Math.sin(a) * P.radius * 0.6);
        fx.bolt(new THREE.Vector3(c.x, 4.5, c.z), to, { color: i % 2 ? '#8ff8ff' : '#2ce8f5', life: 0.22, jag: 0.6 });
      }
      fx.ring(pos, { color: P.color, radius: P.radius, life: 0.35, hard: true, px: 2 });
      fx.flash({ x: c.x, y: 0.4, z: c.z }, { color: '#2ce8f5', size: 1.1, life: 0.1 });
      fx.light(pos, { color: '#2ce8f5', intensity: 6, distance: 5, life: 0.2 });
      fx.burst(pos, { color: '#2ce8f5', color2: '#ffffff', count: 24, speed: 3.2, up: 3, life: 0.45, size: 0.07, y: 0.1 });
      scene.game.shake(3, 0.2);
      scene.game.sfx.playAt('arc_discharge', c.x, c.z);
    } else if (c.key === 'flare') {
      const A = scene.game.assets;
      let mesh, mat = null, ember = null;
      if (A.hasSprite('fx_flare_pool')) {
        // The pool art is a 3-tile radius at 1x; a bigger Flare (relics) steps up a whole scale, never in between.
        mesh = A.makeVisual('fx_flare_pool', { shadow: false, scale: Math.max(1, Math.round(P.radius / 3)) });
        mesh.position.set(c.x, 0.025, c.z);
        mesh.userData.vis.body.renderOrder = -3;   // under the plinths (−2) and the towers: light on the ground
        setAnim(mesh, 'idle');
        if (A.hasSprite('fx_flare_ember')) {
          ember = A.makeVisual('fx_flare_ember', { shadow: false });
          ember.position.set(c.x, 0, c.z);
          setAnim(ember, 'idle');
          scene.three.add(ember);
        }
      } else {
        mat = scene._track(new THREE.MeshBasicMaterial({ color: '#feae34', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
        mesh = new THREE.Mesh(this.flareGeom, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(c.x, 0.045, c.z);
        mesh.scale.setScalar(P.radius);
        mesh.renderOrder = 1;
      }
      scene.three.add(mesh);
      this.flares.push({ x: c.x, z: c.z, r: P.radius, t: P.time, life: P.time, mult: P.damageMult, mesh, mat, ember, spark: 0 });
      fx.flash({ x: c.x, y: 1.2, z: c.z }, { color: '#fee761', size: 1.2, life: 0.2 });
      fx.ring(pos, { color: '#feae34', radius: P.radius, life: 0.5, hard: true, px: 2 });
      scene.game.sfx.playAt('flare_pop', c.x, c.z);
    }
  }

  /** Is world point p inside a live Flare? */
  litAt(p) {
    for (const f of this.flares) if ((p.x - f.x) ** 2 + (p.z - f.z) ** 2 <= f.r * f.r) return true;
    return false;
  }

  /** Damage multiplier for a tower standing at p (the strongest Flare covering it). */
  flareMult(p) {
    let m = 1;
    for (const f of this.flares) if ((p.x - f.x) ** 2 + (p.z - f.z) ** 2 <= f.r * f.r) m = Math.max(m, f.mult);
    return m;
  }

  // ---------------------------------------------------------------- per-step / per-frame

  /** Game-time step (pushes and lulls): cooldowns recharge, telegraphs land, Flares burn down. */
  update(dt) {
    for (const k of this.keys) {
      const st = this.state[k], max = this.maxCharges(k);
      if (st.charges >= max) { st.cd = 0; continue; }
      st.cd -= dt;
      if (st.cd <= 0) {
        st.charges += 1;
        st.cd = st.charges < max ? this.def(k).cooldown : 0;
        this.scene.sideDirty = true;
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const c = this.pending[i];
      c.t -= dt;
      if (c.t <= 0) { this.pending.splice(i, 1); this._resolve(c); }
    }
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.t -= dt;
      if (f.mat) f.mat.opacity = 0.16 * Math.min(1, f.t / 0.6) * (0.85 + 0.15 * Math.sin(f.t * 9));
      else {
        // Sprite pool: its own flicker frames; the last 0.6 s it blinks out (whole frames on / off).
        updateVisual(f.mesh, dt);
        if (f.ember) updateVisual(f.ember, dt);
        f.mesh.visible = f.t > 0.6 || Math.floor(f.t * 10) % 2 === 0;
      }
      f.spark -= dt;
      if (f.spark <= 0) {
        f.spark = 0.15;
        const a = Math.random() * Math.PI * 2, r = Math.random() * f.r;
        this.scene.fx.burst({ x: f.x + Math.cos(a) * r, y: 0, z: f.z + Math.sin(a) * r }, { color: '#fee761', color2: '#feae34', count: 1, speed: 0.3, up: 1.6, gravity: 1, life: 0.7, size: 0.05, y: 0.1 });
      }
      if (f.t <= 0) { this._dropFlare(f); this.flares.splice(i, 1); }
    }
  }

  /** Per frame (real time): the aim cursor follows the mouse; button cooldown sweeps. */
  frame() {
    const scene = this.scene;
    if (this.aiming) {
      if (!this.live || this.blocked(this.aiming)) this.cancelAim();
      else {
        const p = scene.game.mouseOnPlane(scene.camera, 0);
        this.aimObj.visible = !!p && !scene.overUi;
        if (p) this.aimObj.position.set(p.x, 0.06, p.z);
        this.aimObj.rotation.y = scene.game.time * 0.6;
      }
    }
    for (const k of this.keys) {
      const b = this.buttons[k];
      if (!b || !b.isConnected) continue;
      const st = this.state[k];
      const frac = st.charges >= this.maxCharges(k) ? 0 : Math.max(0, Math.min(1, st.cd / this.def(k).cooldown));
      const key = `${st.charges}|${Math.ceil(st.cd)}|${Math.round(frac * 40)}|${this.aiming === k}|${!!this.blocked(k)}`;
      if (b._key === key) continue;
      b._key = key;
      b.style.setProperty('--cd', frac.toFixed(3));
      b.classList.toggle('aiming', this.aiming === k);
      b.classList.toggle('disabled', !!this.blocked(k) && this.aiming !== k);
      const t = b.querySelector('.df-pt');
      // (In the one-row bar of two or three, a ready single charge shows nothing: the lit button says it.)
      if (t) t.textContent = st.charges > 0 ? (this.maxCharges(k) > 1 ? `×${st.charges}` : this.keys.length > 1 ? '' : 'Ready') : `${Math.ceil(st.cd)} s`;
    }
  }

  /**
   * Input while a push or lull runs. Returns true when the input was used (the scene skips its own
   * handling): hotkeys toggle aiming; while aiming, left click casts at the ground point, right click /
   * Esc cancels.
   */
  handleInput() {
    const scene = this.scene, inp = scene.game.input;
    if (!this.live || !this.keys.length) return false;
    for (const k of this.keys) {
      if (inp.wasPressed(PROTOCOLS[k].code)) { this.aim(k); return true; }
    }
    if (!this.aiming) return false;
    if (inp.wasPressed('Escape') || inp.mouseClicked(2)) { this.cancelAim(); return true; }
    if (inp.mouseClicked(0) && !scene.overUi) {
      const p = scene.game.mouseOnPlane(scene.camera, 0);
      if (p) this.cast(this.aiming, p);
      return true;
    }
    return false;
  }

  /** Side-panel block: one button per protocol (icon, name, cost, hotkey, cooldown sweep). */
  panel() {
    if (!this.keys.length) return null;
    // One row of buttons (critic K2 §5: three stacked buttons took 187 px of a 720p panel); with three the names go
    // to the tooltips (icon, key, cost and timer stay).
    const wrap = el(`div.df-protos.n${this.keys.length}`, {});
    for (const k of this.keys) {
      const P = PROTOCOLS[k];
      const cost = Object.keys(P.cost).length ? costLine(P.cost, this.scene.run.res) : el('span.good', 'free');
      // Sprite icon when there is one (PROTOCOL_ICONS; whole-number scale), else the coloured glyph.
      const css = PROTOCOL_ICONS[k] && this.scene.game.assets.iconStyle?.(PROTOCOL_ICONS[k], 20 * this.scene.game.u);
      const glyph = css ? el('span.df-pglyph.df-picon', { style: css }) : el('span.df-pglyph', { style: { '--c': P.color } }, P.glyph);
      const b = button(el('span.df-pmain', {}, glyph,
        el('span.df-pname', P.name), el('span.df-pcost', {}, cost), el('span.df-pt', '')),
      () => this.aim(k), { hotkey: P.hotkey, cls: 'df-proto', title: `${P.name} (${P.hotkey}): ${P.line} Click it, then click the map.` });
      b.style.setProperty('--c', P.color);
      this.buttons[k] = b;
      wrap.append(b);
    }
    return wrap;
  }

  _dropFlare(f) {
    const A = this.scene.game.assets;
    if (f.mat) f.mesh.removeFromParent(); else A.disposeVisual(f.mesh);
    if (f.ember) A.disposeVisual(f.ember);
  }

  dispose() {
    for (const f of this.flares) this._dropFlare(f);
    this.flares = [];
    for (const c of this.aimObj.children) c.geometry.dispose();
    this.aimObj.removeFromParent();
  }
}
