// Foraging (critic N): what the jungle gives back, on the verbs the player already uses. Tuning: FORAGE in
// src/data/jungle.js; placement: JungleGen (world.forage, objects with `fungus: true`). Everything here is rebuilt
// every morning (a mid-day reload abandons the trip anyway); only "seen" persists: the map remembers the fruit bushes,
// fungus stumps and dusk blooms you have had on screen (scene.state.forage = run.world.forage, critic N2).
//
//   Wild fruit      hold E beside a bush to eat it (+FORAGE.fruit.heal health, whole numbers, never more than you
//                   miss); at full health the prompt is a line with no hold and the bush keeps.
//   Shelf fungus    old stumps and fallen logs at trail edges: a machete hit breaks the fungus off for Biofiber
//                   (the host stays solid). Costs plant stamina (scene.meleeHit leaves `forage` hittables out of
//                   the creature hit count). Stumps are drawn here (prop_stump_fungus → prop_stump_bare), not by
//                   the chunk cards; logs keep their card and get a fungus overlay card.
//   Glints          a gold sparkle in a thicket / bramble tile (rolled per day): cut the plant (any cutter: the
//                   hook is JungleWorld.onCut) and it spills Scrap (at least glint.minAmt). A soft twinkle plays with
//                   a sparkle on screen; the reveal cues (and the first-time line) only when it happens on screen.
//   Dusk blooms     closed by day; open (and glow) for the last bloom.openLeft s of daylight: hold E -> +Intel
//                   (carried) and +Research (JungleScene result.bloomResearch -> Run.applyExpedition).

import { FORAGE, BRUSH, DAY } from '../data/jungle.js';
import { RESOURCES } from '../data/config.js';
import { hash2 } from '../world/noise.js';
import { returnYield } from '../world/JungleGen.js';
import { updateVisual } from '../core/Assets.js';
import { CARD_SCALE } from '../core/PixelView.js';

const TEXT_GREEN = '#63c74d';

export class Forage {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    const run = this.game.run;
    this.seen = run.forageSeen || (run.forageSeen = { fungus: false, glint: false });   // first-time lines, per run
    this.mapSeen = scene.state.forage || (scene.state.forage = new Set());   // ids on the map (run.world.forage)
    this.fruit = [];
    this.fungus = [];
    this.blooms = [];
    this.glints = new Map();   // tile index → { tx, tz, type, amt, t, tw }
    this.fullT = 0;
    this.seenT = 0;
    this.picked = 0;           // dusk blooms picked today (Research at the summary)
    this._buildFruit();
    this._buildFungus();
    this._buildBlooms();
    this._rollGlints();
    scene.world.onCut = (tx, tz) => this._onCut(tx, tz);
  }

  /** The first manifest key that has art, else the first (its src/data/visuals.js placeholder). */
  _key(...keys) { return keys.find((k) => this.game.assets.hasSprite(k)) || keys[0]; }

  /** Is (x, z) in view round the player (FORAGE.view)? */
  _onScreen(x, z) {
    const p = this.scene.player.pos, V = FORAGE.view, dz = z - p.z;
    return Math.abs(x - p.x) <= V.x && dz >= V.up && dz <= V.down;
  }

  /** Missing health in whole points (fractional HP never shows as "+0.2999"). */
  _missing() { const pl = this.scene.player; return pl.dead ? 0 : Math.floor(pl.maxHp - pl.hp); }

  // ------------------------------------------------------------ wild fruit

  _buildFruit() {
    const sc = this.scene, R = FORAGE.fruit;
    // Not beside today's goal, bonus or event props (a heal there would trivialise the fight).
    const busy = [...(sc.objTargets || []), ...sc.interactables.filter((it) => it.kind === 'primary' || it.kind === 'optional' || it.kind === 'event'), ...(sc.nests || [])];
    for (const f of sc.data.forage || []) {
      if (f.kind !== 'fruit' || busy.some((p) => Math.hypot((p.x ?? 0) - f.x, (p.z ?? 0) - f.z) < R.siteGap)) continue;
      const b = { ...f, done: false, vis: sc._visual(this._key('prop_fruit_bush'), f.x, f.z) };
      b.it = sc._addInteractable({
        kind: 'forage', x: f.x, z: f.z, radius: R.radius, hold: R.hold, keepProgress: false,
        // At full health it's a line with no hold (update() sets hold 0 / noKey): no ring that fills to say no.
        verb: () => { const m = this._missing(); return m < R.fullAt ? 'Wild fruit: it will keep until you are hurt' : `Eat the wild fruit (+${Math.min(R.heal, m)} health)`; },
        onComplete: (it) => this._eat(b, it),
      });
      this.fruit.push(b);
    }
  }

  _eat(b, it) {
    const sc = this.scene, pl = sc.player, R = FORAGE.fruit;
    const m = this._missing(), h = m < R.fullAt ? 0 : Math.min(R.heal, m);
    if (h <= 0) {
      // The glasshouse cistern's rule: at full health it isn't used up.
      it.done = false;
      it.progress = 0;
      if (sc.time >= this.fullT) {
        this.fullT = sc.time + R.fullToastEvery;
        sc.toast('You are not hurt: the fruit will keep. Come back when you are.', 'amber', 2.5);
        this.game.sfx.play('ui_back');
      }
      return;
    }
    pl.hp += h;
    b.done = true;
    this.game.assets.disposeVisual(b.vis);
    b.vis = sc._visual(this._key('prop_fruit_bush_bare'), b.x, b.z);
    this.game.sfx.play('med');
    sc.fx.text(pl.pos, `+${h} Health`, { color: TEXT_GREEN, cls: 'big', y: (pl.vis?.userData.vis.height || 1.6) + 0.3 });
    sc.fx.burst({ x: b.x, y: 0.45, z: b.z }, { color: R.burst[0], color2: R.burst[1], count: 12, speed: 1.8, up: 2.6, life: 0.6, size: 2 / 32, gravity: 6 });
  }

  // ------------------------------------------------------------ shelf fungus

  _buildFungus() {
    const sc = this.scene, F = FORAGE.fungus;
    for (const o of sc.data.objects) {
      if (!o.fungus) continue;
      const h = { o, id: o.id, x: o.x, z: o.z, type: o.type, done: false, vis: null, cap: null };
      this._drawHost(h);
      // The first time (per run): a prompt with no E, until the first harvest.
      h.hint = sc._addInteractable({
        kind: 'forage_hint', x: o.x, z: o.z, radius: F.hint, hold: 0, keepProgress: false, noKey: true,
        hidden: () => this.seen.fungus || h.done,
        verb: () => 'Hit the fungus with your machete for Biofiber',
        onComplete: (it) => { it.done = false; },
      });
      this.fungus.push(h);
    }
  }

  /** A stump: the whole sprite (fungus / bare). A log: its card stays; the fungus is a card over it. */
  _drawHost(h) {
    const sc = this.scene, A = this.game.assets, F = FORAGE.fungus;
    if (h.vis) { A.disposeVisual(h.vis); h.vis = null; }
    if (h.cap) { A.disposeVisual(h.cap); h.cap = null; }
    if (h.type === 'stump') {
      h.vis = sc._visual(h.done ? this._key('prop_stump_bare', 'fol_stump') : this._key('prop_stump_fungus', 'fol_stump'), h.x, h.z, { shadow: false });
    } else if (!h.done) {
      const [ox, oz, lift] = F.overlay.log;
      h.cap = sc._visual(this._key('prop_fungus_log_overlay', 'dec_fungus_shelf'), h.x + (h.o.flip ? -ox : ox), h.z + oz, { shadow: false });
      h.cap.position.y = (lift * CARD_SCALE) / 32;   // up onto the log's flank (texels on screen; PixelCamera snaps it)
    }
  }

  /** Fungus the machete can hit (scene.hittables). `forage`: plant stamina, not a creature hit. */
  hittables(out) {
    const F = FORAGE.fungus;
    for (const h of this.fungus) {
      if (h.done) continue;
      out.push({ x: h.x, z: h.z - 0.2, radius: F.hitRadius[h.type] ?? F.hitRadius.stump, dead: false, forage: true, hit: () => this._harvest(h) });
    }
    return out;
  }

  _harvest(h) {
    if (h.done) return;
    const sc = this.scene, F = FORAGE.fungus;
    h.done = true;
    this._drawHost(h);
    const n = Math.max(1, Math.round(F.yield * (this.game.run.lootMults().biofiber ?? 1)));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.4 + Math.random() * 1.2;
      sc.spawnPickup('biofiber', 1, h.x, h.z + 0.25, { vx: Math.cos(a) * sp, vz: Math.abs(Math.sin(a)) * sp, delay: 0.3 + i * 0.05 });
    }
    this.game.sfx.play('splat');
    sc.fx.burst({ x: h.x, y: 0.4, z: h.z }, { color: F.burst[0], color2: F.burst[1], count: 12, speed: 2.2, up: 2.4, life: 0.5, size: 2 / 32, gravity: 8 });
    sc.fx.hitStop(F.hitStop);
    this.seen.fungus = true;
  }

  // ------------------------------------------------------------ glints in the brush

  /** Today's glints: a hash per uncut thicket / bramble tile (new ones every day), away from home and from loot. */
  _rollGlints() {
    const sc = this.scene, w = sc.data, G = FORAGE.glint, W = w.size, run = this.game.run;
    const seed = (w.seed ^ Math.imul(run.night, 0x9e37)) & 0x7fffffff;
    const homes = [w.center, ...w.pylons.filter((p) => sc.state.pylons.has(p.id))];
    const props = [...w.containers, ...w.sites];
    const scrap = run.lootMults().scrap;
    for (let tz = G.edge; tz < W - G.edge; tz++) for (let tx = G.edge; tx < W - G.edge; tx++) {   // (not in the dark edge band)
      const b = sc.world.brushAt(tx, tz);
      if (b !== BRUSH.thicket && b !== BRUSH.bramble) continue;
      const type = b === BRUSH.bramble ? 'bramble' : 'thicket';
      if (hash2(tx, tz, seed) >= G.chance[type]) continue;
      const x = tx + 0.5, z = tz + 0.5;
      if (homes.some((p) => Math.hypot(p.x - x, p.z - z) < G.minReturn)) continue;
      if (props.some((p) => Math.hypot(p.x - x, p.z - z) < G.clear)) continue;
      let trail = false;
      for (let dz = -G.clear; dz <= G.clear && !trail; dz++) for (let dx = -G.clear; dx <= G.clear; dx++) {
        const i = (tz + dz) * W + tx + dx;
        if (i >= 0 && i < W * W && (w.trail[i] || w.site[i] >= 0)) { trail = true; break; }
      }
      if (trail) continue;
      const [lo, hi] = G.scrap[type];
      const roll = lo + Math.floor(hash2(tx, tz, seed + 1) * (hi - lo + 1));
      const amt = Math.max(G.minAmt, Math.round(roll * scrap * returnYield(w, x, z)));
      this.glints.set(tz * W + tx, { tx, tz, type, amt, t: G.every[0] * hash2(tx, tz, seed + 2), tw: -1, fx: x });
    }
  }

  _onCut(tx, tz) {
    const i = tz * this.scene.data.size + tx;
    const g = this.glints.get(i);
    if (!g) return;
    this.glints.delete(i);
    const sc = this.scene, G = FORAGE.glint;
    const pieces = g.amt >= 4 ? 2 : 1;
    let left = g.amt;
    for (let k = 0; k < pieces; k++) {
      const a = Math.floor(left / (pieces - k));
      left -= a;
      const ang = Math.random() * Math.PI * 2, sp = 1.4 + Math.random() * 1.2;
      sc.spawnPickup('scrap', a, tx + 0.5, tz + 0.5, { vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp, delay: 0.3 + k * 0.05 });
    }
    // The Scrap spills for any cutter (a Razorback crash too); the cues and the first-time line only on screen, so a
    // Feral 20 tiles off never spends them (critic N2 P2-5).
    if (!this._onScreen(tx + 0.5, tz + 0.5)) return;
    this.game.sfx.playAt('coins', tx + 0.5, tz + 0.5);   // (never 'glint': that's the enemy wind-up cue)
    sc.fx.burst({ x: tx + 0.5, y: 0.5, z: tz + 0.5 }, { color: G.burst[0], color2: G.burst[1], count: 10, speed: 2, up: 2.6, life: 0.5, size: 2 / 32, gravity: 6 });
    if (!this.seen.glint) {
      this.seen.glint = true;
      sc.toast('Something shiny was hidden in the brush: watch for the glint', 'good', 3);
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    const sc = this.scene, p = sc.player.pos, G = FORAGE.glint;
    // The gold sparkle (Fx.flash draws over the foliage cards: no depth test), only near the player: a big gold
    // star, then a small white glint beside it (a two-beat twinkle no firefly makes), and a soft tink on screen.
    for (const g of this.glints.values()) {
      if (Math.abs(g.tx + 0.5 - p.x) > G.show || Math.abs(g.tz + 0.5 - p.z) > G.show) continue;
      const d = Math.hypot(g.tx + 0.5 - p.x, g.tz + 0.5 - p.z);
      if (d > G.show) continue;
      if (g.tw >= 0 && (g.tw -= dt) < 0) {
        const [, size, color] = G.twinkle;
        sc.fx.flash({ x: g.fx + 0.12, y: G.y + 0.12, z: g.tz + 0.5 }, { color, size, life: G.life * 0.7 });
      }
      g.t -= dt;
      if (g.t > 0) continue;
      g.t = G.every[0] + Math.random() * (G.every[1] - G.every[0]);
      g.fx = g.tx + 0.3 + Math.random() * 0.4;
      g.tw = G.twinkle[0];
      sc.fx.flash({ x: g.fx, y: G.y, z: g.tz + 0.5 }, { color: G.color, size: G.size, life: G.life });
      if (d <= G.sound && this._onScreen(g.tx + 0.5, g.tz + 0.5)) this.game.sfx.playAt('glint_twinkle', g.tx + 0.5, g.tz + 0.5);
    }
    // Full health: the fruit's prompt is a plain line (no hold ring, no E keycap); E still answers with the toast.
    const full = this._missing() < FORAGE.fruit.fullAt;
    for (const b of this.fruit) {
      if (b.done) continue;
      b.it.hold = full ? 0 : FORAGE.fruit.hold;
      b.it.noKey = full;
      if (b.vis && Math.abs(b.x - p.x) < 14 && Math.abs(b.z - p.z) < 12) updateVisual(b.vis, dt);
    }
    this._updateBlooms(dt);
    // The map remembers what you have had on screen.
    if ((this.seenT -= dt) <= 0) {
      this.seenT = FORAGE.seenEvery;
      for (const list of [this.fruit, this.fungus, this.blooms]) for (const f of list) if (!this.mapSeen.has(f.id) && this._onScreen(f.x, f.z)) this.mapSeen.add(f.id);
    }
  }

  // ------------------------------------------------------------ dusk blooms

  _buildBlooms() {
    const sc = this.scene, BL = FORAGE.bloom;
    for (const f of sc.data.forage || []) {
      if (f.kind !== 'bloom') continue;
      const b = { ...f, open: false, done: false, vis: null, pollenT: 0 };
      this._drawBloom(b);
      // Closed: a plain line (no E). Open: hold E (_updateBlooms switches it).
      b.it = sc._addInteractable({
        kind: 'forage', x: f.x, z: f.z, radius: BL.radius, hold: 0, keepProgress: false, noKey: true,
        verb: () => (b.open ? `Pick the dusk bloom (+${BL.intel} Intel)` : 'A dusk bloom, still closed: it opens at dusk'),
        onComplete: (it) => { if (b.open) this._pick(b); else it.done = false; },
      });
      this.blooms.push(b);
    }
  }

  _drawBloom(b) {
    if (b.vis) this.game.assets.disposeVisual(b.vis);
    const key = b.done ? 'prop_dusk_bloom_spent' : b.open ? 'prop_dusk_bloom_open' : 'prop_dusk_bloom_closed';
    b.vis = this.scene._visual(this._key(key), b.x, b.z);
  }

  /** Open at dusk: the last bloom.openLeft s of daylight (and after sunset). */
  _updateBlooms(dt) {
    if (!this.blooms.length) return;
    const sc = this.scene, BL = FORAGE.bloom, p = sc.player.pos;
    const open = DAY.length - sc.dayT <= BL.openLeft;
    for (const b of this.blooms) {
      if (b.done) continue;
      if (open && !b.open) {
        b.open = true;
        b.it.hold = BL.hold;
        b.it.noKey = false;
        this._drawBloom(b);
      }
      if (!b.open) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (!this.seen.bloom && d <= BL.nearToast) {
        this.seen.bloom = true;
        sc.toast('A dusk bloom is opening nearby', 'good', 3);
        this.game.sfx.playAt('place_found', b.x, b.z);
      }
      if (d > BL.pollen.range) continue;
      if (b.vis) updateVisual(b.vis, dt);
      if ((b.pollenT -= dt) <= 0) {
        b.pollenT = BL.pollen.every[0] + Math.random() * (BL.pollen.every[1] - BL.pollen.every[0]);
        sc.fx.burst({ x: b.x, y: 0.5, z: b.z }, { color: BL.pollen.color, color2: BL.pollen.color2, count: 2, speed: 0.25, up: 0.7, life: 1.3, size: 1.5 / 32, gravity: 0.2 });
      }
    }
  }

  _pick(b) {
    const sc = this.scene, BL = FORAGE.bloom, pl = sc.player;
    b.done = true;
    this.picked++;
    this._drawBloom(b);
    for (let i = 0; i < BL.intel; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random();
      sc.spawnPickup('intel', 1, b.x, b.z + 0.2, { vx: Math.cos(a) * sp, vz: Math.abs(Math.sin(a)) * sp, delay: 0.3 + i * 0.05 });
    }
    this.game.sfx.play('item_get');
    sc.fx.text(pl.pos, `+${BL.research} Research`, { color: RESOURCES.intel.color, cls: 'big', y: (pl.vis?.userData.vis.height || 1.6) + 0.3 });
    sc.fx.burst({ x: b.x, y: 0.5, z: b.z }, { color: BL.burst[0], color2: BL.burst[1], count: 14, speed: 1.6, up: 2.4, life: 0.7, size: 2 / 32, gravity: 4 });
  }

  /** Research for today's picked blooms (JungleScene's day result -> Run.applyExpedition). */
  bloomResearch() { return this.picked * FORAGE.bloom.research; }

  /** Map dots for the forage you have seen (JungleScene._markers); dim once used today. No glints: those are discovery. */
  markers(out) {
    for (const [list, type] of [[this.fruit, 'forage_fruit'], [this.fungus, 'forage_fungus'], [this.blooms, 'forage_bloom']]) {
      for (const f of list) if (this.mapSeen.has(f.id)) out.push({ x: f.x, z: f.z, type, dim: f.done });
    }
    return out;
  }

  /** Debug / tests: vr.game.scene.debug.forage(). */
  info() {
    return {
      fruit: this.fruit.map((b) => ({ x: b.x, z: b.z, done: b.done })),
      fungus: this.fungus.map((h) => ({ x: h.x, z: h.z, type: h.type, done: h.done })),
      bloom: this.blooms.map((b) => ({ x: b.x, z: b.z, open: b.open, done: b.done })),
      picked: this.picked,
      seen: [...this.mapSeen],
      glints: [...this.glints.values()].map(({ tx, tz, type, amt }) => ({ tx, tz, type, amt })),
    };
  }

  dispose() {
    const A = this.game.assets;
    if (this.scene.world?.onCut) this.scene.world.onCut = null;
    for (const b of this.fruit) if (b.vis) A.disposeVisual(b.vis);
    for (const h of this.fungus) { if (h.vis) A.disposeVisual(h.vis); if (h.cap) A.disposeVisual(h.cap); }
    for (const b of this.blooms) if (b.vis) A.disposeVisual(b.vis);
  }
}
