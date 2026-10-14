// Foraging (critic N): what the jungle gives back, on the verbs the player already uses. Tuning: FORAGE in
// src/data/jungle.js; placement: JungleGen (world.forage, objects with `fungus: true`). Everything here is rebuilt
// every morning, so nothing persists (a mid-day reload abandons the trip anyway).
//
//   Wild fruit      hold E beside a bush to eat it (+FORAGE.fruit.heal health); not used up at full health.
//   Shelf fungus    old stumps and fallen logs at trail edges: a machete hit breaks the fungus off for Biofiber
//                   (the host stays solid). Costs plant stamina (scene.meleeHit leaves `forage` hittables out of
//                   the creature hit count). Stumps are drawn here (prop_stump_fungus → prop_stump_bare), not by
//                   the chunk cards; logs keep their card and get a fungus overlay card.
//   Glints          a gold sparkle in a thicket / bramble tile (rolled per day): cut the plant (any cutter: the
//                   hook is JungleWorld.onCut) and it spills Scrap.

import { FORAGE, BRUSH } from '../data/jungle.js';
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
    this.fruit = [];
    this.fungus = [];
    this.glints = new Map();   // tile index → { tx, tz, type, amt, t }
    this.fullT = 0;
    this._buildFruit();
    this._buildFungus();
    this._rollGlints();
    scene.world.onCut = (tx, tz) => this._onCut(tx, tz);
  }

  /** The first manifest key that has art, else the first (its src/data/visuals.js placeholder). */
  _key(...keys) { return keys.find((k) => this.game.assets.hasSprite(k)) || keys[0]; }

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
        verb: () => (sc.player.hp >= sc.player.maxHp ? 'Eat the wild fruit (you are not hurt)' : `Eat the wild fruit (+${R.heal} health)`),
        onComplete: (it) => this._eat(b, it),
      });
      this.fruit.push(b);
    }
  }

  _eat(b, it) {
    const sc = this.scene, pl = sc.player, R = FORAGE.fruit;
    const h = pl.dead ? 0 : Math.min(R.heal, pl.maxHp - pl.hp);
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
      const h = { o, x: o.x, z: o.z, type: o.type, done: false, vis: null, cap: null };
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
    for (let tz = 1; tz < W - 1; tz++) for (let tx = 1; tx < W - 1; tx++) {
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
      const amt = Math.max(1, Math.round(roll * scrap * returnYield(w, x, z)));
      this.glints.set(tz * W + tx, { tx, tz, type, amt, t: G.every[0] * hash2(tx, tz, seed + 2) });
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
    this.game.sfx.playAt('pickup', tx + 0.5, tz + 0.5);   // (never 'glint': that's the enemy wind-up cue)
    sc.fx.burst({ x: tx + 0.5, y: 0.5, z: tz + 0.5 }, { color: G.burst[0], color2: G.burst[1], count: 10, speed: 2, up: 2.6, life: 0.5, size: 2 / 32, gravity: 6 });
    if (!this.seen.glint) {
      this.seen.glint = true;
      sc.toast('Something shiny was hidden in the brush: watch for the glint', 'good', 3);
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt) {
    const sc = this.scene, p = sc.player.pos, G = FORAGE.glint;
    // The gold sparkle (Fx.flash draws over the foliage cards: no depth test), only near the player.
    for (const g of this.glints.values()) {
      if (Math.abs(g.tx + 0.5 - p.x) > G.show || Math.abs(g.tz + 0.5 - p.z) > G.show) continue;
      if (Math.hypot(g.tx + 0.5 - p.x, g.tz + 0.5 - p.z) > G.show) continue;
      g.t -= dt;
      if (g.t > 0) continue;
      g.t = G.every[0] + Math.random() * (G.every[1] - G.every[0]);
      sc.fx.flash({ x: g.tx + 0.3 + Math.random() * 0.4, y: G.y, z: g.tz + 0.5 }, { color: G.color, size: G.size, life: G.life });
    }
    for (const b of this.fruit) if (b.vis && Math.abs(b.x - p.x) < 14 && Math.abs(b.z - p.z) < 12) updateVisual(b.vis, dt);
  }

  /** Debug / tests: vr.game.scene.debug.forage(). */
  info() {
    return {
      fruit: this.fruit.map((b) => ({ x: b.x, z: b.z, done: b.done })),
      fungus: this.fungus.map((h) => ({ x: h.x, z: h.z, type: h.type, done: h.done })),
      glints: [...this.glints.values()].map(({ tx, tz, type, amt }) => ({ tx, tz, type, amt })),
    };
  }

  dispose() {
    const A = this.game.assets;
    if (this.scene.world?.onCut) this.scene.world.onCut = null;
    for (const b of this.fruit) if (b.vis) A.disposeVisual(b.vis);
    for (const h of this.fungus) { if (h.vis) A.disposeVisual(h.vis); if (h.cap) A.disposeVisual(h.cap); }
  }
}
