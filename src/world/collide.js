// Tile collision helpers for exploration. The world is a grid of 1×1 tiles: tile (tx, ty) covers
// world x ∈ [tx, tx+1), z ∈ [ty, ty+1). `world` is anything with solidAt(tx, ty) / opaqueAt(tx, ty)
// (TileWorld implements both; out-of-bounds counts as solid and opaque).

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Move a circle (centre p = {x, z}, radius r) by (dx, dz), sliding along solid tiles.
 * Long moves are split into small steps so a fast dodge or charge can't tunnel through a wall.
 * `solidFn(tx, ty)` defaults to world.solidAt. Returns true if anything was hit.
 */
export function moveCircle(world, p, dx, dz, r, solidFn) {
  const solid = solidFn || ((x, y) => world.solidAt(x, y));
  const dist = Math.max(Math.abs(dx), Math.abs(dz));
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  const sx = dx / steps, sz = dz / steps;
  let hit = false;
  for (let i = 0; i < steps; i++) {
    p.x += sx;
    p.z += sz;
    if (resolveCircle(p, r, solid)) hit = true;
  }
  return hit;
}

/** Push a circle out of every overlapping solid tile (closest-point method, so corners slide). */
export function resolveCircle(p, r, solid) {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r);
    const z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r);
    let moved = false;
    for (let ty = z0; ty <= z1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!solid(tx, ty)) continue;
        const cx = clamp(p.x, tx, tx + 1);
        const cz = clamp(p.z, ty, ty + 1);
        const ox = p.x - cx, oz = p.z - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= r * r) continue;
        hit = true;
        moved = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          p.x += (ox / d) * (r - d);
          p.z += (oz / d) * (r - d);
        } else {
          // Centre inside the tile: push out along the shortest axis.
          const l = p.x - tx, rr = tx + 1 - p.x, t = p.z - ty, b = ty + 1 - p.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) p.x = tx - r;
          else if (m === rr) p.x = tx + 1 + r;
          else if (m === t) p.z = ty - r;
          else p.z = ty + 1 + r;
        }
      }
    }
    if (!moved) break;
  }
  return hit;
}

/** True if a circle at (x, z) overlaps any solid tile. */
export function circleBlocked(world, x, z, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
  for (let ty = z0; ty <= z1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!world.solidAt(tx, ty)) continue;
      const cx = clamp(x, tx, tx + 1), cz = clamp(z, ty, ty + 1);
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
  }
  return false;
}

/**
 * Walk the grid from a toward b (Amanatides–Woo DDA) and return the distance travelled before
 * entering a tile where blockFn(tx, ty) is true, or the full distance if nothing blocks.
 */
export function castRay(ax, az, bx, bz, blockFn) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return 0;
  const ux = dx / len, uz = dz / len;
  let tx = Math.floor(ax), ty = Math.floor(az);
  const stepX = ux > 0 ? 1 : -1, stepZ = uz > 0 ? 1 : -1;
  const tDeltaX = ux !== 0 ? Math.abs(1 / ux) : Infinity;
  const tDeltaZ = uz !== 0 ? Math.abs(1 / uz) : Infinity;
  let tMaxX = ux !== 0 ? ((ux > 0 ? tx + 1 - ax : ax - tx) * tDeltaX) : Infinity;
  let tMaxZ = uz !== 0 ? ((uz > 0 ? ty + 1 - az : az - ty) * tDeltaZ) : Infinity;
  let t = 0;
  for (let i = 0; i < 512; i++) {
    if (t > len) return len;
    if (i > 0 && blockFn(tx, ty)) return t;
    if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; }
    else { t = tMaxZ; tMaxZ += tDeltaZ; ty += stepZ; }
  }
  return len;
}

/** Clear line of sight between two points (opaque tiles block; the start tile never does). */
export function lineOfSight(world, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  return castRay(ax, az, bx, bz, (x, y) => world.opaqueAt(x, y)) >= len - 1e-4;
}

/** Distance along a direction until an opaque tile (for laser / charge-lane telegraph lengths). */
export function rayLength(world, ax, az, dirX, dirZ, maxDist, blockFn) {
  const fn = blockFn || ((x, y) => world.opaqueAt(x, y));
  return castRay(ax, az, ax + dirX * maxDist, az + dirZ * maxDist, fn);
}
