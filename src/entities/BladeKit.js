// The machete's run modifiers in play (Stage 7 skills & crafting). Run.bladeMods() stacks every owned skill's
// `blade` block (src/data/skills.js) and every Workbench machete upgrade's (src/data/crafting.js); Player turns
// them into a derived weapon spec once per trip (kitWeapon) and ticks the Serrated Edge bleed (Bleeds).
// The rest of the kit (deflect window, riposte ×, fern-free walking, kill / riposte heals, perfect-dodge riposte,
// cheaper cutting) is read straight from `player.kit` at the one place each applies.

import { BLEED } from '../data/crafting.js';

/**
 * A copy of a weapon spec (WEAPONS.machete / parang) with the kit applied: comboTime speeds the light swings and
 * hack-through, chopDamage scales the chop, chopCut widens what the chop cuts (`cutRange`, read by
 * JungleScene.meleeHit), throwReturn / throwBackFull change the thrown blade, and a Bleeds tracker hooks every
 * melee swing (`onHit`, called by JungleScene.meleeHit for each thing it strikes).
 */
export function kitWeapon(base, kit = {}, bleeds = null) {
  const ct = kit.comboTime || 1;
  const w = { ...base };
  w.combo = base.combo.map((s) => ({ ...s, time: s.time * ct, hitAt: s.hitAt * ct }));
  w.hackEvery = base.hackEvery * ct;
  w.chop = { ...base.chop, damage: Math.round(base.chop.damage * (kit.chopDamage || 1)) };
  if (kit.chopCut) w.chop.cutRange = Math.max(base.chop.range, kit.chopCut);
  if (base.throw) {
    w.throw = { ...base.throw, returnTime: base.throw.returnTime * (kit.throwReturn || 1) };
    if (kit.throwBackFull) w.throw.returnDamage = base.throw.damage;
  }
  if (bleeds) {
    for (const s of w.combo) s.onHit = bleeds.onHit;
    w.chop.onHit = bleeds.onHit;
  }
  return w;
}

/**
 * Serrated Edge: creatures hit by the machete bleed `dps` a second for `time` s (a new hit refreshes it). Damage
 * lands every BLEED.tick s straight off their health (no flinch or knockback), in red numbers; a Thorn Stalker
 * under the brush doesn't take it until it surfaces. Kills go through the creature's own die().
 */
export class Bleeds {
  constructor(scene, dps, time) {
    this.scene = scene;
    this.dps = dps;
    this.time = time;
    this.list = new Map();          // creature → { t: seconds left, tick, acc: fractional damage, key }
    this.onHit = (t) => this.add(t);
  }

  add(e) {
    // Creatures only (nests and spore pods have no `def`).
    if (!e || e.dead || !e.def || typeof e.hp !== 'number') return;
    const b = this.list.get(e);
    if (b) b.t = this.time;
    else this.list.set(e, { t: this.time, tick: BLEED.tick, acc: 0, key: {} });   // key: its own merging number
  }

  update(dt) {
    for (const [e, b] of this.list) {
      if (e.dead) { this.list.delete(e); continue; }
      b.t -= dt;
      b.tick -= dt;
      if (b.tick <= 0) {
        b.tick += BLEED.tick;
        if (!e.hidden && e.vis) this._tick(e, b);
      }
      if (b.t <= 0 || e.dead) this.list.delete(e);
    }
  }

  _tick(e, b) {
    b.acc += this.dps * BLEED.tick;
    const dmg = Math.floor(b.acc);
    if (dmg <= 0) return;
    b.acc -= dmg;
    const fx = this.scene.fx;
    const h = e.vis.userData.vis?.height || 1;
    e.hp -= dmg;
    e.barT = 2.5;
    fx.text({ x: e.x, z: e.z }, String(dmg), { color: BLEED.color, y: h + 0.4, life: 0.5, key: b.key, value: dmg });
    fx.burst({ x: e.x, z: e.z }, { color: BLEED.color, color2: '#733e39', count: 2, speed: 0.6, up: 0.4, life: 0.35, size: 1 / 32, y: h * 0.45, gravity: 6 });
    if (e.hp <= 0) e.die();
  }

  dispose() { this.list.clear(); }
}
