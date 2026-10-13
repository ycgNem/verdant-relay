// Collision footprints of world objects (Stage 6 "solid jungle"). Pure data helpers shared by generation
// (JungleGen's reachability check) and runtime collision (JungleWorld).
//
// A footprint is a rounded box: an inner box [x0, x1] × [z0, z1] grown by `rr` on every side (a circle is a
// zero-size box). Bodies are circles, so pushing one out is "closest point on the inner box, keep r + rr
// away" — convex, no corners to snag on, and bodies slide around it smoothly. Tables: SOLID in src/data/jungle.js.

import { SOLID } from '../data/jungle.js';

/**
 * Collider of a world object in world tiles: { x0, z0, x1, z1, rr, opaque }, or null if it doesn't block.
 * `artKey` = the sprite key drawn for it (SOLID.art); otherwise SOLID.kind[kind_type]; otherwise a circle of
 * radius o.r (scene props). Mirrored with the sprite (ruins are never flipped).
 */
export function footprint(o, artKey) {
  const kt = `${o.kind}_${o.type}`;
  let f = (artKey && SOLID.art[artKey]) || SOLID.kind[kt];
  if (!f && o.r > 0) f = [0, 0, 0, 0, o.r];
  if (!f) return null;
  let [x0, z0, x1, z1, rr] = f;
  if (o.flip && o.kind !== 'ruin') [x0, x1] = [-x1, -x0];
  return { x0: o.x + x0, z0: o.z + z0, x1: o.x + x1, z1: o.z + z1, rr, opaque: SOLID.opaque.includes(kt) };
}

/** Distance from (x, z) to the footprint's inner box (0 inside it). */
export function boxDist(c, x, z) {
  const dx = x < c.x0 ? c.x0 - x : x > c.x1 ? x - c.x1 : 0;
  const dz = z < c.z0 ? c.z0 - z : z > c.z1 ? z - c.z1 : 0;
  return Math.hypot(dx, dz);
}

/** Is (x, z) within `pad` of the footprint? */
export function inFootprint(c, x, z, pad = 0) { return boxDist(c, x, z) < c.rr + pad; }

/** Push circle p (radius r) out of a footprint. Returns true if it overlapped. */
export function pushOut(p, r, c) {
  const cx = p.x < c.x0 ? c.x0 : p.x > c.x1 ? c.x1 : p.x;
  const cz = p.z < c.z0 ? c.z0 : p.z > c.z1 ? c.z1 : p.z;
  const ox = p.x - cx, oz = p.z - cz;
  const m = r + c.rr;
  const d2 = ox * ox + oz * oz;
  if (d2 >= m * m) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    p.x = cx + (ox / d) * m; p.z = cz + (oz / d) * m;
  } else {
    // Centre inside the inner box: out along the shortest axis.
    const l = p.x - c.x0, rt = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z;
    const k = Math.min(l, rt, t, b);
    if (k === l) p.x = c.x0 - m; else if (k === rt) p.x = c.x1 + m; else if (k === t) p.z = c.z0 - m; else p.z = c.z1 + m;
  }
  return true;
}
