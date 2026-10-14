// Relics, landmark shrines, data logs and named places in the day jungle (Stage 7, critic J §7 / M3 / N4;
// tuning in src/data/relics.js and src/data/lore.js, placement in JungleGen `siteFeatures`).
//
// JungleScene makes one per day (`scene.relicsCtl`, after its HUD) and calls: update(dt), markers() (minimap +
// big map), labels() (big-map place names), onContainerOpened(it) (hidden caches), meleeMult() / landed() /
// cutPower (meleeHit), onKill(e), huntDelay, light(uniforms), lostLines(), dispose(). The scene forwards
// dropRelic(x, z, opts) (area bosses), relicSave(player) (Second Wind) and relicPerfectDodge() (Hunter's Fang).
//
// Relics picked up today are CARRIED (`carried`, the HUD strip under the loot): JungleScene._finish passes them
// in the trip result and Run.applyExpedition keeps them if you got home. Sources: a strongbox at every lost major
// site (hold E), a shrine at every landmark (hold E, then pick 1 of 2; a radio mast also maps the land around it,
// a glasshouse heals you), hidden caches (RELIC_SOURCES.hiddenChance), bosses. Data logs are knowledge, not loot:
// read = kept forever (meta.lore). What's used persists in run.world (state.relics / lore / visited).
// The guided first day stays uncluttered: none of this is built then (no prompts, no banners).

import { CONFIG, STAMINA } from '../data/config.js';
import { DISTRICTS } from '../data/districts.js';
import { RELICS, RELIC_SOURCES, drawRelic } from '../data/relics.js';
import { LORE_LOGS, LANDMARK_KINDS, LORE_SPOTS } from '../data/lore.js';
import { makeRng, subSeed } from '../core/rng.js';
import { setAnim, updateVisual } from '../core/Assets.js';
import { lightPool } from '../core/PixelGlow.js';
import { el, button, modal, showBanner } from '../ui/ui.js';
import { TEXT_LANE } from '../data/hud.js';
import { relicKey, relicIcon, relicCard, relicTitle, relicTag } from '../ui/relics.js';

const RS = () => RELIC_SOURCES;
const GLOW = { w: 2.6, h: 1.6, steps: 4, power: 1.3, color: '#fee761', strength: 0.5 };

export class JungleRelics {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    this.run = scene.game.run;
    this.data = scene.data;
    this.state = scene.state;
    if (!this.state.relics) this.state.relics = new Set();
    if (!this.state.lore) this.state.lore = new Set();
    if (!this.state.visited) this.state.visited = new Set();
    this.carried = [];        // relic ids picked up today (banked when you get home)
    this.drops = [];          // relics on the ground: { id, x, z, y, vx, vz, vy, vis, glow, age }
    this.its = [];            // this module's interactables (strongboxes, shrines, logs)
    this.glows = [];
    this.readToday = [];      // data logs read on this trip
    this.secondWindUsed = false;
    this.fangT = 0;
    this.seen = new Set();
    this.quiet = this.run.isGuidedDay();   // the guided first day: nothing extra
    if (!this.quiet) {
      this._buildCaches();
      this._buildShrines();
      this._buildLore();
    }
    this._buildHud();
    this.debug = this._makeDebug();
  }

  // ================================================================== effects the scene asks for

  get mod() { return (f) => this.run.relicMod(f); }

  /** Damage multiplier for the next machete hit: Whetstone / Glass Machete, × 2 while Hunter's Fang is armed. */
  meleeMult() { return this.run.relicMod('meleeDamage') * (this.fangT > 0 ? 2 : 1); }

  /** A swing connected with something (meleeHit): Hunter's Fang is spent. */
  landed() {
    if (this.fangT <= 0) return;
    this.fangT = 0;
    const p = this.scene.player;
    this.scene.fx.text(p.pos, 'FANG ×2', { color: '#fee761', cls: 'big', y: this.scene._headY(), life: 0.6, key: 'fang' });
  }

  /** Cutting power for undergrowth: Bramble Gloves make a light slash cut brambles (2 = a chop). */
  get cutPower() { return this.run.relicMod('brambleSlash') ? 2 : 0; }

  /** Lantern Moth: seconds added between dusk hunter packs. */
  get huntDelay() { return this.run.relicMod('huntDelay'); }

  /** Lantern Moth: a wider light after sunset (PostFx uLightR, in px; grows in with the dusk). */
  light(U) {
    const t = this.run.relicMod('duskLight');
    if (t > 0 && this.scene.duskK > 0) U.uLightR.value += t * 32 * Math.min(1, this.scene.duskK * 3);
  }

  /** Blood Moss: a kill heals you. */
  onKill() {
    const h = this.run.relicMod('killHeal');
    const p = this.scene.player;
    if (h <= 0 || !p || p.dead || p.hp >= p.maxHp) return;
    const n = Math.min(h, p.maxHp - p.hp);
    p.hp += n;
    this.scene.fx.text(p.pos, `+${Math.round(n)}`, { color: '#e05a9a', y: this.scene._headY(), life: 0.5, key: 'moss', value: n });
  }

  /** Lifeline Idol: a lethal hit leaves 1 HP and a moment of invulnerability, once a day. True = saved. */
  relicSave(player) {
    if (this.secondWindUsed || !this.run.relicMod('secondWind')) return false;
    this.secondWindUsed = true;
    player.hp = 1;
    player.iframes = Math.max(player.iframes || 0, 1.5);
    const fx = this.scene.fx;
    fx.text(player.pos, 'LIFELINE', { color: '#fee761', cls: 'big', y: this.scene._headY() + 0.2, life: 1.2 });   // (not "Second Wind": that's a Machete skill)
    fx.ring(player.pos, { color: '#fee761', radius: 1.6, life: 0.5 });
    fx.slowMo?.(0.4, 0.35);
    this.game.flash('#fee761', 0.25);
    this.game.sfx.play('second_wind') || this.game.sfx.play('relic');
    this.scene.toast('Lifeline Idol: you get back up (once a day)', 'amber', 3);
    return true;
  }

  /** Hunter's Fang: a perfect dodge refills stamina and arms a ×2 hit. */
  relicPerfectDodge() {
    if (!this.run.relicMod('fangDodge')) return;
    const p = this.scene.player;
    p._gain?.(STAMINA.max);
    this.fangT = 4;
    this.scene.fx.ring(p.pos, { color: '#fee761', radius: 1.2, life: 0.3 });
  }

  // ================================================================== sources

  _addIt(o) {
    const it = this.scene._addInteractable(o);
    this.its.push(it);
    return it;
  }

  _glow(x, z) {
    const m = lightPool(GLOW);
    m.position.set(x, 0.02, z);
    this.scene.three.add(m);
    this.glows.push(m);
    return m;
  }

  _offGlow(it) {
    if (!it.glow) return;
    it.glow.removeFromParent();
    it.glow.material.dispose();
    this.glows = this.glows.filter((g) => g !== it.glow);
    it.glow = null;
  }

  /** Strongboxes at lost major sites: hold E, a relic pops out. Opened ones stay (open) for the run. */
  _buildCaches() {
    const A = this.game.assets;
    for (const c of this.data.relicCaches || []) {
      const opened = this.state.relics.has(c.id);
      const key = this.scene._propKey('locked_cache');
      const v = this.scene._visual(opened ? (A.spentVariant(key, 'gutted') || 'locked_cache') : 'locked_cache', c.x, c.z);
      this.scene.world.addCollider({ kind: 'prop', type: 'container', x: c.x, z: c.z });
      const it = this._addIt({
        kind: 'relic', src: c, x: c.x, z: c.z, vis: v, done: opened, radius: 1.4, hold: RS().cacheHold, keepProgress: true,
        verb: () => 'Break open the old strongbox (a relic)',
        onComplete: (t) => this._openCache(t),
      });
      if (!opened) it.glow = this._glow(c.x, c.z + 0.2);
    }
  }

  _openCache(it) {
    it.done = true;
    this.state.relics.add(it.src.id);
    this._offGlow(it);
    const A = this.game.assets, sc = this.scene;
    sc._removeVis(it);
    const key = sc._propKey('locked_cache');
    it.vis = sc._visual(A.spentVariant(key, 'gutted') || 'locked_cache', it.x, it.z);
    sc.fx.burst({ x: it.x, z: it.z }, { color: '#fee761', color2: '#ffffff', count: 22, speed: 2.4, up: 3.2, life: 0.6, y: 0.5 });
    this.game.sfx.play('relic_cache');
    const id = this._draw({ weights: RS().weights }, `cache:${it.src.id}`);
    if (id) this.spawnDrop(id, it.x, it.z + 0.6);
    else sc.toast('The strongbox is empty: you have every relic already', 'amber', 2.6);
  }

  /** Landmark shrines: hold E, then the pick of two (plus the landmark's one-time extra). */
  _buildShrines() {
    for (const sh of this.data.shrines || []) {
      const used = this.state.relics.has(sh.id);
      const K = LANDMARK_KINDS[sh.kind] || LANDMARK_KINDS.statue;
      const it = this._addIt({
        kind: 'shrine', src: sh, x: sh.x, z: sh.z, done: used, radius: 1.6, hold: RS().shrineHold, keepProgress: false,
        verb: () => `${K.verb} (a relic: pick 1 of 2)`,
        onComplete: (t) => this._useShrine(t),
      });
      if (!used) {
        it.glow = this._glow(sh.x, sh.z);
        // A pendant hovers over the glow: there is something to take here.
        it.vis = this.game.assets.makeVisual(relicKey(this.game.assets, 'compass'), { shadow: false });
        it.vis.position.set(sh.x, 0.35, sh.z);
        this.scene.three.add(it.vis);
        it.bob = Math.random() * 6;
      }
    }
  }

  /** The two relics a shrine offers (seeded per shrine; never one you already have or carry). */
  _offers(sh) {
    const rng = makeRng(subSeed(this.run.seed, 'shrine', sh.id));
    const ex = this._taken();
    const a = drawRelic(rng, ex, { weights: RS().shrineWeights });
    const b = a ? drawRelic(rng, [...ex, a], { weights: RS().shrineWeights }) : null;
    return [a, b].filter(Boolean);
  }

  _useShrine(it) {
    const sc = this.scene, sh = it.src;
    it.done = false;   // stays until a relic is taken
    // The landmark's one-time extra (radio mast: maps the land; glasshouse: heals).
    const extraKey = `${sh.id}+`;
    let extra = null;
    if (!this.state.relics.has(extraKey)) {
      this.state.relics.add(extraKey);
      if (sh.kind === 'mast') {
        sc.map.reveal(sh.x, sh.z, RS().mastReveal);
        extra = 'The mast crackles back to life: the land around it is now on your map.';
        this.game.sfx.play('mast_crackle');
        sc.fx.ring({ x: sh.x, z: sh.z }, { color: '#2ce8f5', radius: 4, life: 0.8 });
      } else if (sh.kind === 'greenhouse') {
        const p = sc.player;
        const n = Math.min(RS().glasshouseHeal, p.maxHp - p.hp);
        if (n > 0) { p.hp += n; sc.fx.text(p.pos, `+${Math.round(n)} HP`, { color: '#63c74d', cls: 'big', y: sc._headY() }); }
        extra = n > 0 ? `You drink from the glasshouse's rain cistern: +${Math.round(n)} health.` : 'The glasshouse\'s rain cistern is cool and clean (you are already at full health).';
      }
    }
    const offers = this._offers(sh);
    this.run.seeRelics(this.game, offers);
    this.game.sfx.play('shrine') || this.game.sfx.play('bonus_done');
    this._pick(it, offers, extra);
  }

  /** The pick of two (pauses the day; 1 / 2 take, Esc leaves both). */
  _pick(it, offers, extra) {
    const sc = this.scene, sh = it.src;
    const site = this.data.sites[sh.site];
    sc.setPaused(true);
    if (!sc.paused) return;
    if (sc.pauseModal) sc.pauseModal.style.display = 'none';
    sc.confirmModal?.remove();
    const close = () => { this._unkeys(); sc.setPaused(false); };
    const take = (id) => {
      close();
      it.done = true;
      this.state.relics.add(sh.id);
      this._offGlow(it);
      if (it.vis) { this.game.assets.disposeVisual(it.vis); it.vis = null; }
      this.carry(id, it.x, it.z);
    };
    const body = el('div.col.rl-pick', {},
      extra ? el('p.small.rl-extra', extra) : null,
      offers.length
        ? el('p.small', {}, 'Take one. ', el('span.muted', 'It works for the rest of the run once you get it '), el('span.accent', 'home'), el('span.muted', '; if you go down out here it is lost.'))
        : el('p.small.muted', 'Nothing is left here: you already have every relic.'),
      offers.length ? el('div.rl-choices', {}, offers.map((id, i) => el('div.rl-choice', {},
        relicCard(this.game, id, { size: 36 }),
        button(`Take ${RELICS[id].name}`, () => take(id), { cls: i === 0 ? 'primary' : '', hotkey: String(i + 1) })))) : null);
    const K = LANDMARK_KINDS[sh.kind] || LANDMARK_KINDS.statue;
    sc.confirmModal = modal(this.game.ui, site?.name || K.label, body, [
      button(offers.length ? 'Leave both (come back later)' : 'Close', () => {
        if (!offers.length) { it.done = true; this.state.relics.add(sh.id); this._offGlow(it); }
        close();
      }, { hotkey: 'Esc' }),
    ]);
    sc.confirmModal.querySelector('.modal')?.classList.add('rl-pickbox');
    this.pickModal = sc.confirmModal;
    this._keys = (e) => {
      const m = /^Digit([12])$/.exec(e.code);
      if (m && offers[Number(m[1]) - 1]) { e.preventDefault(); take(offers[Number(m[1]) - 1]); }
    };
    window.addEventListener('keydown', this._keys);
  }

  _unkeys() {
    if (this._keys) window.removeEventListener('keydown', this._keys);
    this._keys = null;
    this.pickModal = null;
  }

  /** Data logs: hold E to read the next one you haven't read (one per site, kept forever in the Codex). */
  _buildLore() {
    if (!this._nextLog()) return;   // every log read already: the spots stay dark
    for (const s of this.data.loreSpots || []) {
      if (this.state.lore.has(s.id)) continue;
      const v = this.game.assets.makeVisual('data_log');
      v.position.set(s.x, 0, s.z);
      setAnim(v, 'idle');
      this.scene.three.add(v);
      this._addIt({
        kind: 'lore', src: s, x: s.x, z: s.z, vis: v, radius: 1.3, hold: LORE_SPOTS.hold, keepProgress: true,
        hidden: () => !this._nextLog(),
        verb: () => 'Read the data log',
        onComplete: (t) => this._readLog(t),
      });
    }
  }

  /** The next log in story order not read yet (meta.lore, plus today's). */
  _nextLog() {
    const read = new Set([...(this.game.meta.lore || []), ...this.readToday]);
    return LORE_LOGS.find((l) => !read.has(l.id)) || null;
  }

  _readLog(it) {
    const log = this._nextLog();
    it.done = true;
    this.state.lore.add(it.src.id);
    if (it.vis) { this.scene._removeVis(it); }
    if (!log) return;
    this.readToday.push(log.id);
    this.run.readLore(this.game, log.id);
    this.game.sfx.play('lore') || this.game.sfx.play('pickup');
    this.scene.fx.burst({ x: it.x, z: it.z }, { color: '#2ce8f5', color2: '#ffffff', count: 12, speed: 1.6, up: 2.4, life: 0.5, y: 0.3 });
    const n = new Set([...(this.game.meta.lore || []), ...this.readToday]).size;
    this._loreCard(log, n);
    // That was the last unread log: the other spots go dark.
    if (!this._nextLog()) for (const o of this.its) if (o.kind === 'lore' && !o.done && o.vis) this.scene._removeVis(o);
  }

  _loreCard(log, n) {
    this.loreNode?.remove();
    const card = el('div.j-lore', {},
      el('div.j-lore-h', {}, el('b', `Data log ${n}/${LORE_LOGS.length}: ${log.title}`)),
      el('div', log.text),
      el('div.j-lore-w.small', `— ${log.who}. Saved to the Codex.`));
    this.scene.hud.root.append(card);
    this.loreNode = card;
    const t = 5 + log.text.split(' ').length / 3.2;
    this.loreT = t;
  }

  /** Hidden caches may hold a relic (seeded per cache). */
  onContainerOpened(it) {
    const c = it.cont;
    if (this.quiet || !c?.hidden) return;
    const rng = makeRng(subSeed(this.run.seed, 'relic', c.id));
    if (!rng.chance(RS().hiddenChance)) return;
    const id = this._draw({ weights: RS().weights }, `hidden:${c.id}`);
    if (id) this.spawnDrop(id, it.x, it.z + 0.5);
  }

  /** Relics already spoken for: owned, carried, or lying on the ground. */
  _taken() { return [...(this.run.relics || []), ...this.carried, ...this.drops.map((d) => d.id)]; }

  _draw(opts, salt) {
    return drawRelic(makeRng(subSeed(this.run.seed, this.run.night, 'relicdraw', salt)), this._taken(), opts);
  }

  /**
   * A relic falls at (x, z) (area bosses: { rarity: 'R' }; or { id }). Returns its id, or null when every relic
   * is already taken.
   */
  dropRelic(x, z, opts = {}) {
    const id = opts.id && RELICS[opts.id] && !this._taken().includes(opts.id) ? opts.id
      : this._draw({ rarity: opts.rarity, weights: RS().weights }, `drop:${Math.round(x)}:${Math.round(z)}:${this.drops.length}`);
    if (id) this.spawnDrop(id, x, z, opts);
    return id;
  }

  /** opts.quiet: no "RELIC: …" label over it (an area boss's kill banner already says so, critic H2 §5.1). */
  spawnDrop(id, x, z, opts = {}) {
    const A = this.game.assets;
    const vis = A.makeVisual(relicKey(A, id));
    const a = Math.random() * Math.PI * 2;
    const d = { id, x, z, y: 0.3, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2 + 0.6, vy: 4.2, vis, age: 0, sparkT: 0 };
    vis.position.set(x, d.y, z);
    setAnim(vis, 'idle');
    this.scene.three.add(vis);
    d.glow = lightPool({ ...GLOW, w: 1.4, h: 0.9, strength: 0.6 });
    d.glow.position.set(x, 0.02, z);
    this.scene.three.add(d.glow);
    this.drops.push(d);
    const R = RELICS[id];
    if (!opts.quiet) this.scene.fx.text({ x, z }, `RELIC: ${R.name}`, { color: R.rarity === 'X' ? '#e05a9a' : '#fee761', cls: 'big', y: 1.4, life: 1.4 });
    this.scene.fx.ring({ x, z }, { color: '#fee761', radius: 1.4, life: 0.5 });
    this.game.sfx.play('relic_drop') || this.game.sfx.play('relic');
    return d;
  }

  /** Pick up a relic: it is carried from now on (HUD strip); the codex notes it. */
  carry(id, x, z) {
    if (!RELICS[id] || this.carried.includes(id)) return;
    this.carried.push(id);
    this.run.seeRelics(this.game, [id]);
    const R = RELICS[id], sc = this.scene, p = sc.player;
    this.game.sfx.play('relic') || this.game.sfx.play('pickup');
    sc.fx.text(p.pos, '', { html: `+ ${R.name}`, color: R.rarity === 'X' ? '#e05a9a' : '#fee761', cls: 'big', y: sc._headY(), life: 1.2 });
    sc.toast(`${R.name}: ${R.text}${R.down ? ` Price: ${R.down}` : ''}`, R.rarity === 'X' ? 'bad' : 'amber', 4.5);
    this._renderStrip(id);
    sc._hint('relic_carry', 'A <b>relic</b>! It works for the rest of the run once you get it <span style="color:#2ce8f5">home</span>. Go down out here and it is lost. Relics you carry show under your loot.', 'bottom-left', 11);
  }

  // ================================================================== per frame

  update(dt) {
    const sc = this.scene, pl = sc.player;
    if (this.pickModal && sc.confirmModal !== this.pickModal) this._unkeys();   // closed by Esc / unpause
    if (this.fangT > 0) this.fangT -= dt;
    if (this.loreT > 0) {
      this.loreT -= dt;
      if (this.loreT <= 0.6 && this.loreNode && !this.loreNode.classList.contains('out')) this.loreNode.classList.add('out');
      if (this.loreT <= 0) { this.loreNode?.remove(); this.loreNode = null; }
    }
    // Relics on the ground: a hop, then a slow magnet once you are near.
    for (const d of this.drops) {
      d.age += dt;
      if (d.y > 0 || d.vy > 0) {
        d.vy -= 14 * dt;
        d.y += d.vy * dt;
        if (d.y <= 0) { d.y = 0; d.vy = Math.abs(d.vy) > 1.5 ? -d.vy * 0.3 : 0; }
      }
      const fr = Math.exp(-3 * dt);
      d.vx *= fr; d.vz *= fr;
      if (Math.abs(d.vx) + Math.abs(d.vz) > 0.01) sc.world.moveBody(d, d.vx * dt, d.vz * dt, 0.15, { throughBrush: true });
      const dx = pl.pos.x - d.x, dz = pl.pos.z - d.z, dist = Math.hypot(dx, dz);
      if (!pl.dead && !sc.ending && d.age > RS().delay && dist < RS().magnet) {
        const step = Math.min(dist, (4 + (RS().magnet - dist) * 4) * dt);
        d.x += (dx / (dist || 1)) * step; d.z += (dz / (dist || 1)) * step;
      }
      if (!pl.dead && !sc.ending && d.age > RS().delay && dist < 0.6) { d.dead = true; this.carry(d.id, d.x, d.z); }
      const bob = d.y === 0 ? Math.round((Math.sin(d.age * 3) * 0.5 + 0.5) * 2) / 32 : 0;
      d.vis.position.set(d.x, d.y + 0.06 + bob, d.z);
      d.glow.position.set(d.x, 0.02, d.z);
      updateVisual(d.vis, dt);
      d.sparkT -= dt;
      if (d.sparkT <= 0 && d.y === 0) {
        d.sparkT = 0.35 + Math.random() * 0.3;
        sc.fx.flash({ x: d.x + (Math.random() - 0.5) * 0.3, y: 0.25 + Math.random() * 0.3, z: d.z }, { color: '#fee761', size: 7 / 32, life: 0.08 });
      }
    }
    for (const d of this.drops) if (d.dead) this._disposeDrop(d);
    this.drops = this.drops.filter((d) => !d.dead);
    // Shrine pendants bob over their glow; strongboxes and shrines glint now and then.
    this._glintT = (this._glintT || 0) - dt;
    const glint = this._glintT <= 0;
    if (glint) this._glintT = 0.5;
    for (const it of this.its) {
      if (it.done) continue;
      if (Math.abs(it.x - pl.pos.x) > 14 || Math.abs(it.z - pl.pos.z) > 12) continue;
      if (it.kind === 'shrine' && it.vis) {
        it.bob += dt;
        it.vis.position.y = 0.3 + Math.round((Math.sin(it.bob * 2.2) * 0.5 + 0.5) * 3) / 32;
        updateVisual(it.vis, dt);
      }
      if (glint && it.kind !== 'lore' && Math.random() < 0.6) sc.fx.flash({ x: it.x + (Math.random() - 0.5) * 0.8, y: 0.3 + Math.random() * 0.6, z: it.z }, { color: '#fee761', size: 6 / 32, life: 0.08 });
    }
    this._discover();
  }

  /** First time near: a strongbox / shrine is announced; a named place shows its banner once per run. */
  _discover() {
    if (this.quiet) return;
    const sc = this.scene, p = sc.player.pos;
    for (const it of this.its) {
      if (it.done || this.seen.has(it) || Math.hypot(it.x - p.x, it.z - p.z) > RS().seenRange) continue;
      this.seen.add(it);
      if (it.kind === 'relic') sc.toast('An old strongbox, chained shut: hold E to break it open (a relic inside)', 'amber', 3.6);
    }
    for (const s of this.data.sites) {
      if (!s.name || this.state.visited.has(s.id)) continue;
      if (Math.hypot(s.x - p.x, s.z - p.z) > s.r * RS().placeRange) continue;
      this.state.visited.add(s.id);
      this._placeBanner(s);
    }
  }

  _placeBanner(s) {
    const D = DISTRICTS[this.data.districts[s.region]];
    const sh = s.type === 'landmark' ? (this.data.shrines || []).find((x) => x.site === s.idx) : null;
    const K = sh ? LANDMARK_KINDS[sh.kind] : null;
    const sub = K && !this.state.relics.has(sh.id)
      ? `${K.label}${K.extra ? ` · ${K.extra.toLowerCase()}` : ''} · a relic: pick 1 of 2`
      : D?.name || '';
    // The top-centre lane (critic H2 §5.1, ui.showBanner): a place name is the least of the banners — it waits for
    // one on screen (and goes stale after TEXT_LANE.banner.placeWait s), and an area boss's name cuts it.
    const b = el('div.j-place', {}, el('div.j-place-n', s.name), el('div.j-place-s', sub));
    const L = TEXT_LANE.banner;
    showBanner(this.scene.hud.root, b, { prio: 0, time: L.placeTime, wait: L.placeWait, onShow: () => this.game.sfx.play('place_found') });
  }

  // ================================================================== HUD, map

  _buildHud() {
    this.strip = el('div.j-relics', { title: 'Relics you carry: yours once you get home, lost if you go down' });
    this.scene.hud?.tl?.append(this.strip);
    this._renderStrip();
  }

  _renderStrip(fresh) {
    if (!this.strip) return;
    this.strip.innerHTML = '';
    if (!this.carried.length) return;
    this.strip.append(el('span.rl-k', 'RELICS'));
    // Icons at the world's texel size (critic H2 §7: ×2 at 720p, ×3 at 1080p, like everything in the jungle): a slot
    // of 24 world texels in UI units, so Assets.iconScale lands on the same whole device-px scale as the world.
    const K = this.game._layout?.().k || 2, dpr = window.devicePixelRatio || 1;
    const size = (24 * K) / dpr / (this.game.u || 1);
    for (const id of this.carried) {
      const n = relicIcon(this.game, id, size);
      n.classList.add(`rl-${RELICS[id].rarity}`);
      if (id === fresh) n.classList.add('new');
      n.title = `${relicTitle(id)}\nCarried: yours once you get home, lost if you go down.`;
      this.strip.append(n);
    }
  }

  /** Map markers: strongboxes / shrines once mapped or seen, relics on the ground, logs seen, compass caches. */
  markers() {
    const out = [];
    if (this.quiet) return out;
    const map = this.scene.map, p = this.scene.player.pos;
    for (const it of this.its) {
      if (it.done || it.hidden?.()) continue;
      const known = this.seen.has(it) || map.isExplored(it.x, it.z);
      if (it.kind === 'lore') { if (Math.hypot(it.x - p.x, it.z - p.z) < RS().seenRange) out.push({ x: it.x, z: it.z, type: 'lore' }); }
      else if (known) out.push({ x: it.x, z: it.z, type: 'relic' });
    }
    for (const d of this.drops) out.push({ x: d.x, z: d.z, type: 'relic' });
    // Scavenger's Compass: hidden caches nearby show even before you've seen them.
    const R = this.run.relicMod('cacheRadar');
    if (R > 0) {
      for (const c of this.data.containers) {
        if (!c.hidden || this.state.opened.has(c.id) || Math.abs(c.x - p.x) > R || Math.abs(c.z - p.z) > R) continue;
        if (Math.hypot(c.x - p.x, c.z - p.z) <= R) out.push({ x: c.x, z: c.z, type: 'cache' });
      }
    }
    return out;
  }

  /** Big-map labels: every named place once it's on your map. */
  labels() {
    const map = this.scene.map;
    return this.data.sites.filter((s) => s.name && map.isExplored(s.x, s.z)).map((s) => ({ x: s.x, z: s.z - s.r * 0.6, text: s.name }));
  }

  /** The pause menu: relics working for you, and the ones carried today (null when there are none). */
  pauseLine() {
    const own = (this.run.relics || []).filter((id) => RELICS[id]);
    if (!own.length && !this.carried.length) return null;
    return el('div.rl-pause.small', {},
      own.length ? el('div', {}, el('span.muted', 'Relics working for you: '), own.map((id) => relicTag(this.game, id))) : null,
      this.carried.length ? el('div', {}, el('span.amber', 'Carried (home to keep): '), this.carried.map((id) => relicTag(this.game, id))) : null);
  }

  /** Lines for the death modal / abandon confirm: the relics you'd lose. */
  lostLines() {
    if (!this.carried.length) return null;
    return el('p.small', {}, el('span.bad', `Relics lost (${this.carried.length}): `), this.carried.map((id) => RELICS[id].name).join(', '));
  }

  // ================================================================== teardown, debug

  _disposeDrop(d) {
    this.game.assets.disposeVisual(d.vis);
    d.glow.removeFromParent();
    d.glow.material.dispose();
  }

  dispose() {
    this._unkeys();
    for (const d of this.drops) this._disposeDrop(d);
    this.drops = [];
    for (const g of this.glows) { g.removeFromParent(); g.material.dispose(); }
    this.glows = [];
    this.loreNode?.remove();
    this.placeNode?.remove();
  }

  _makeDebug() {
    const sc = this.scene;
    const near = (list) => {
      const p = sc.player.pos;
      return [...(list || [])].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    };
    return {
      carry: (id) => this.carry(id, sc.player.pos.x, sc.player.pos.z),
      drop: (opts = {}) => this.dropRelic(sc.player.pos.x + 1.5, sc.player.pos.z, opts),
      // Teleport next to the nearest strongbox / shrine / data log (or the n-th one).
      goto: (kind = 'shrine', n = -1) => {
        const list = kind === 'cache' ? this.data.relicCaches : kind === 'lore' ? this.data.loreSpots : this.data.shrines;
        const t = n >= 0 ? list[n] : near(list);
        if (t) sc.debug.teleport(t.x, t.z + 1.2);
        return t;
      },
      info: () => ({ carried: [...this.carried], owned: [...(this.run.relics || [])], drops: this.drops.map((d) => d.id), caches: this.data.relicCaches?.length, shrines: this.data.shrines?.map((s) => s.kind), logs: this.data.loreSpots?.length, quiet: this.quiet }),
    };
  }
}

/** Med kits the player can carry (Medic's Satchel): Run.maxMeds when present. */
export function maxMeds(run) { return run?.maxMeds ? run.maxMeds() : CONFIG.player.maxMeds; }
