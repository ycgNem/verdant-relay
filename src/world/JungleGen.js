// The persistent jungle: one seeded world per run, the Relay in a clearing at its centre.
//
//   generateWorld(seed, districtKeys) → world data (pure data, no three.js):
//     size            tiles per side (W = H)
//     level           Uint8Array((W+1)²)  terrain level per grid VERTEX (src/data/jungle.js LEVEL); neighbours
//                     differ by ≤ 1, so the Wang terrain has a tile for every cell
//     pave            Uint8Array((W+1)²)  1 = paving instead of dirt at level 2 (ruins, old roads)
//     brush           Uint8Array(W²)      undergrowth per tile (BRUSH); the run's cut-mask hides cut tiles
//     region          Int8Array(W²)       district index per tile (-1 = the Relay's clearing)
//     trail           Uint8Array(W²)      1 = trail tile (kept clear of regrowth, drawn on the map)
//     objects         [{ id, kind, type, x, z, r, flip, big }]  trees / ruins / rocks (visual + collider)
//     sites           [{ id, type, region, x, z, r, ruins, lost }]   points of interest (lost: no trail
//                     leads there, a ring of thick brush around it)
//     containers      [{ id, type, x, z, site, hidden, yield }] world loot (opened ones persist in the run);
//                     yield = Scrap multiplier by distance from the nearest return point
//     spores          [{ id, x, z, region }]                    spore pods (a hazard; they regrow every day)
//     forage          [{ id, kind: 'fruit', x, z, region }]     wild fruit bushes (critic N; own 'forage' stream);
//                     objects with `fungus: true` (old stumps near trails + the nearest-to-trail logs) are
//                     shelf-fungus hosts (src/entities/Forage.js)
//     pylons          [{ id, x, z, region }]                    extraction relays (activated ones persist)
//     relicCaches / shrines / loreSpots   site features (siteFeatures: relic strongboxes at lost majors, a
//                     shrine per landmark, data logs); sites[].name / .kind = place names (src/data/lore.js)
//     deep            Uint8Array(W²)      1 = deep water: impassable for everyone (GROUND.deepFrom)
//     ford            Uint8Array(W²)      1 = a shallow crossing through a river (trail fords + a few extra)
//     reach           { targets, unreachable, fords, removed, passes } — the reachability check's report
//
// Generation order: regions → water (rivers, ponds) → sites → trails between them → base ground →
// level smoothing (banks) → deep water + fords → undergrowth → trees → site dressing (ruins, paving) →
// containers → reachability (every site, pylon and container walkable from the Relay; fixed with fords or by
// removing the objects in the way).
// Everything is deterministic for (seed, districtKeys).

import { makeRng, subSeed } from '../core/rng.js';
import { makeNoise, hash2 } from './noise.js';
import { JUNGLE, LEVEL, BRUSH, REGION_LOOK, SPORES, GROUND, DAY, FORAGE } from '../data/jungle.js';
import { footprint, inFootprint } from './Solid.js';
import { PLACE_NAMES, LANDMARK_NAMES, LORE_SPOTS } from '../data/lore.js';
import { GUIDE } from '../data/guide.js';
import { BOSS } from '../data/bosses.js';

const TAU = Math.PI * 2;

// opts.guided: the player's guided first run (Run.guided): trail-side crates line the route to the guided goal.
export function generateWorld(seed, districtKeys, opts = {}) {
  const J = JUNGLE;
  const W = J.size, V = W + 1;
  const rng = makeRng(subSeed(seed, 'world'));
  const nA = makeNoise(subSeed(seed, 'nA'));
  const nB = makeNoise(subSeed(seed, 'nB'));
  const nC = makeNoise(subSeed(seed, 'nC'));
  const cx = W / 2, cz = W / 2;

  const world = {
    seed, size: W, center: { x: cx, z: cz }, districts: districtKeys.slice(),
    level: new Uint8Array(V * V).fill(LEVEL.floor),
    pave: new Uint8Array(V * V),
    brush: new Uint8Array(W * W),
    region: new Int8Array(W * W).fill(-1),
    trail: new Uint8Array(W * W),
    site: new Int16Array(W * W).fill(-1),   // site index whose clearing covers the tile
    objects: [], sites: [], containers: [], pylons: [],
    deep: new Uint8Array(W * W), ford: new Uint8Array(W * W),
    regionAngles: [],
  };

  // ---------------------------------------------------------------- regions (noisy angular sectors)
  const nReg = districtKeys.length;
  const rot = rng.next() * TAU;
  const sector = TAU / nReg;
  world.regionAngles = districtKeys.map((_, i) => rot + (i + 0.5) * sector);
  const regionAt = (x, z) => {
    const dx = x - cx, dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d < J.relayClearing + 1.5) return -1;
    let a = Math.atan2(dz, dx) - rot + (nA.fbm(x * 0.03, z * 0.03, 3) - 0.5) * 2 * J.regionNoise;
    a = ((a % TAU) + TAU) % TAU;
    return Math.min(nReg - 1, Math.floor(a / sector));
  };
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) world.region[z * W + x] = regionAt(x + 0.5, z + 0.5);
  const regionKey = (i) => (i >= 0 ? districtKeys[i] : null);

  // ---------------------------------------------------------------- water: rivers + ponds (vertex field)
  const water = new Float32Array(V * V);   // > 0 water, (−bank, 0] mud bank
  const stamp = (px, pz, rad, bank) => {
    const r = rad + bank;
    for (let z = Math.max(0, Math.floor(pz - r)); z <= Math.min(W, Math.ceil(pz + r)); z++) {
      for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(W, Math.ceil(px + r)); x++) {
        const d = Math.hypot(x - px, z - pz);
        const v = rad - d;               // positive inside the water
        const i = z * V + x;
        if (v > water[i] || water[i] === 0) water[i] = Math.max(water[i] || -99, v);
      }
    }
  };
  water.fill(-99);
  const riverLines = [];   // centreline samples per river (extra fords go on them)
  for (let r = 0; r < J.rivers; r++) {
    const line = [];
    riverLines.push(line);
    // A river crosses the whole map, bending away from the Relay's clearing.
    const a0 = rng.next() * TAU;
    const a1 = a0 + Math.PI + (rng.next() - 0.5) * 1.2;
    const R = W * 0.72;
    const p0 = { x: cx + Math.cos(a0) * R, z: cz + Math.sin(a0) * R };
    const p1 = { x: cx + Math.cos(a1) * R, z: cz + Math.sin(a1) * R };
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const ux = (p1.x - p0.x) / len, uz = (p1.z - p0.z) / len;
    const nx = -uz, nz = ux;
    // Push the river's middle off the centre so the Relay never floods.
    const midOff = ((p0.x + p1.x) / 2 - cx) * nx + ((p0.z + p1.z) / 2 - cz) * nz;
    const push = Math.abs(midOff) < 28 ? (midOff >= 0 ? 1 : -1) * (28 - Math.abs(midOff)) : 0;
    const wseed = rng.next() * 100;
    for (let t = 0; t <= len; t += 0.5) {
      const k = t / len;
      const bow = Math.sin(k * Math.PI) * push;
      const wig = (nB.fbm(t * 0.025 + wseed, wseed, 3) - 0.5) * 36 + Math.sin(t * 0.07 + wseed) * 5;
      const x = p0.x + ux * t + nx * (bow + wig), z = p0.z + uz * t + nz * (bow + wig);
      if (x < -4 || z < -4 || x > W + 4 || z > W + 4) continue;
      const rad = J.riverWidth[0] + (J.riverWidth[1] - J.riverWidth[0]) * nC.fbm(t * 0.05, wseed, 2);
      stamp(x, z, rad, J.bankWidth);
      if (t % 2 === 0 && x > 6 && z > 6 && x < W - 6 && z < W - 6) line.push([x, z]);
    }
  }
  // Ponds / swamp pools (more in flooded regions).
  for (let z = 0; z <= W; z++) {
    for (let x = 0; x <= W; x++) {
      const ri = regionAt(Math.min(W - 0.5, x), Math.min(W - 0.5, z));
      const look = REGION_LOOK[regionKey(ri)] || {};
      const th = J.pondThreshold + (look.pond || 0);
      const v = (nB.fbm(x * 0.045 + 40, z * 0.045 - 13, 4) - th) * 18;
      const i = z * V + x;
      if (v > water[i]) water[i] = v;
    }
  }
  // Keep the clearing dry.
  for (let z = 0; z <= W; z++) for (let x = 0; x <= W; x++) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < J.relayClearing + 6) water[z * V + x] = Math.min(water[z * V + x], -2 - (J.relayClearing + 6 - d));
  }
  const isWaterTile = (x, z) => {
    const i = z * V + x;
    return water[i] > 0 && water[i + 1] > 0 && water[i + V] > 0 && water[i + V + 1] > 0;
  };

  // ---------------------------------------------------------------- sites
  const sites = world.sites;
  const free = (x, z, r) => {
    if (x < r + 4 || z < r + 4 || x > W - r - 4 || z > W - r - 4) return false;
    if (Math.hypot(x - cx, z - cz) < J.relayClearing + r + 6) return false;
    for (const s of sites) if (Math.hypot(s.x - x, s.z - z) < s.r + r + 7) return false;
    // Not in water.
    for (let a = 0; a < 8; a++) {
      const px = Math.round(x + Math.cos(a * TAU / 8) * r * 0.7), pz = Math.round(z + Math.sin(a * TAU / 8) * r * 0.7);
      if (water[Math.max(0, Math.min(W, pz)) * V + Math.max(0, Math.min(W, px))] > -0.5) return false;
    }
    return water[Math.round(z) * V + Math.round(x)] < -1;
  };
  const placeSite = (type, ri, dMin, dMax) => {
    const S = J.sites.radius[type];
    for (let tries = 0; tries < 400; tries++) {
      const a = world.regionAngles[ri] + (rng.next() - 0.5) * sector * 0.8;
      const d = dMin + rng.next() * (dMax - dMin);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const r = S[0] + rng.next() * (S[1] - S[0]);
      if (regionAt(x, z) !== ri || !free(x, z, r)) continue;
      const s = { id: `s${sites.length}`, idx: sites.length, type, region: ri, x: Math.round(x) + 0.5, z: Math.round(z) + 0.5, r, ruins: [] };
      sites.push(s);
      return s;
    }
    return null;
  };
  const maxD = W * 0.46;
  for (let ri = 0; ri < nReg; ri++) {
    placeSite('pylon', ri, 30, 44);
    placeSite('major', ri, 46, maxD - 8);
    const nMinor = rng.int(...J.sites.minor);
    for (let i = 0; i < nMinor; i++) placeSite('minor', ri, 24, maxD);
    const nCamp = rng.int(...J.sites.camp);
    for (let i = 0; i < nCamp; i++) placeSite('camp', ri, 34, maxD);
    placeSite('landmark', ri, 22, maxD);
  }

  // Lost sites: no trail leads there (cut your way in). A separate stream so the rest of the world's
  // rolls don't shift when the chances are tuned.
  const lrng = makeRng(subSeed(seed, 'lost'));
  for (const s of sites) s.lost = lrng.chance(J.lostSites[s.type] || 0);

  // ---------------------------------------------------------------- trails (A* between sites, wiggly cost)
  const nodes = [{ x: cx, z: cz }, ...sites.filter((s) => !s.lost)];
  const edges = [];
  // Spanning tree by nearest connection (Prim), then a few extra links for loops.
  const inTree = [0];
  const rest = nodes.slice(1).map((_, i) => i + 1);
  while (rest.length) {
    let best = null;
    for (const a of inTree) for (const b of rest) {
      const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
      if (!best || d < best.d) best = { a, b, d };
    }
    edges.push([best.a, best.b]);
    inTree.push(best.b);
    rest.splice(rest.indexOf(best.b), 1);
  }
  for (let i = 1; i < nodes.length; i++) {
    if (!rng.chance(J.extraTrailLinks)) continue;
    let best = null;
    for (let j = 0; j < nodes.length; j++) {
      if (j === i || edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
      if (d < 55 && (!best || d < best.d)) best = { j, d };
    }
    if (best) edges.push([i, best.j]);
  }
  const cost = new Float32Array(W * W);
  const nearLost = (x, z, pad) => sites.some((s) => s.lost && Math.hypot(x - s.x, z - s.z) < s.r + pad);
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    cost[z * W + x] = 1 + nC.fbm(x * 0.09, z * 0.09, 3) * J.trailWobble * 2 + (isWaterTile(x, z) ? 9 : 0)
      + (nearLost(x + 0.5, z + 0.5, J.lostRing + 3) ? 40 : 0);   // trails steer around lost sites
  }
  const trailVerts = new Float32Array(V * V).fill(99);   // distance to the nearest trail centreline
  const trailHalf = new Float32Array(V * V);
  const trng = makeRng(subSeed(seed, 'trails'));
  const okBend = (x, z) => x > 4 && z > 4 && x < W - 4 && z < W - 4 && !isWaterTile(Math.floor(x), Math.floor(z)) && !nearLost(x, z, J.lostRing + 2);
  // A meandering route: S-bends every ~trailBend tiles, each leg found with A* on the wiggly cost.
  const route = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / (L || 1), uz = (bz - az) / (L || 1);
    const nBends = Math.floor(L / J.trailBend);
    const way = [[ax, az]];
    let side = trng.chance(0.5) ? 1 : -1;
    for (let k = 1; k <= nBends; k++) {
      const f = (k + (trng.next() - 0.5) * 0.3) / (nBends + 1);
      let off = side * (L / (nBends + 1)) * (J.trailSwing[0] + trng.next() * (J.trailSwing[1] - J.trailSwing[0]));
      let wx = ax + ux * L * f, wz = az + uz * L * f;
      for (let t = 0; t < 3 && !okBend(wx - uz * off, wz + ux * off); t++) off *= 0.5;
      if (okBend(wx - uz * off, wz + ux * off)) { wx -= uz * off; wz += ux * off; }
      way.push([wx, wz]);
      side = -side;
    }
    way.push([bx, bz]);
    const out = [];
    for (let k = 0; k < way.length - 1; k++) {
      const seg = astar(W, cost, Math.floor(way[k][0]), Math.floor(way[k][1]), Math.floor(way[k + 1][0]), Math.floor(way[k + 1][1]));
      if (!seg) return null;
      out.push(...(k ? seg.slice(1) : seg));
    }
    return out;
  };
  // Smooth the tile path into a polyline, then rasterise its width onto the vertices.
  const lay = (path, half) => {
    const pts = smooth(path, 3);
    for (const [px, pz] of pts) {
      const r = half + 1.5;
      for (let z = Math.max(0, Math.floor(pz - r)); z <= Math.min(W, Math.ceil(pz + r)); z++) {
        for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(W, Math.ceil(px + r)); x++) {
          const d = Math.hypot(x - px, z - pz);
          const i = z * V + x;
          if (d < trailVerts[i]) { trailVerts[i] = d; trailHalf[i] = half; }
        }
      }
    }
    return pts;
  };
  const trailPts = [];   // [x, z, region] samples along the trails (dead-end spurs branch off them)
  for (const [a, b] of edges) {
    const path = route(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z);
    if (!path) continue;
    const half = J.trailWidth[0] + rng.next() * (J.trailWidth[1] - J.trailWidth[0]);
    const pts = lay(path, half);
    for (let k = 0; k < pts.length; k += 8) trailPts.push(pts[k]);
  }
  // Dead ends: spurs that leave a trail and fade out in the brush.
  for (let ri = 0; ri < nReg; ri++) {
    const from = trailPts.filter(([x, z]) => regionAt(x, z) === ri && Math.hypot(x - cx, z - cz) > J.relayClearing + 10);
    const n = trng.int(...J.deadEnds);
    for (let k = 0, tries = 0; k < n && tries < 30 && from.length; tries++) {
      const [px, pz] = trng.pick(from);
      const a = trng.next() * TAU, len = J.deadEndLength[0] + trng.next() * (J.deadEndLength[1] - J.deadEndLength[0]);
      const ex = px + Math.cos(a) * len, ez = pz + Math.sin(a) * len;
      if (!okBend(ex, ez) || Math.hypot(ex - cx, ez - cz) < J.relayClearing + 8) continue;
      if (sites.some((s) => Math.hypot(ex - s.x, ez - s.z) < s.r + 8)) continue;
      // Not just a shortcut back onto another trail: the end must be well away from every trail.
      if (trailPts.some(([x, z]) => Math.hypot(ex - x, ez - z) < 9)) continue;
      const path = route(px, pz, ex, ez);
      if (!path) continue;
      lay(path, J.trailWidth[0] + trng.next() * 0.3);
      k++;
    }
  }

  // ---------------------------------------------------------------- base ground levels
  const L = world.level;
  // The Relay clearing's edge wanders (lobes and bites, not a circle): radius at a point.
  const relayR = (x, z) => J.relayClearing + (nC.fbm(x * 0.16 + 50, z * 0.16 - 30, 2) - 0.4) * J.relayWobble;
  for (let z = 0; z <= W; z++) {
    for (let x = 0; x <= W; x++) {
      const i = z * V + x;
      let lv = nA.fbm(x * 0.06 + 7, z * 0.06 - 3, 4) > 0.5 ? LEVEL.moss : LEVEL.floor;
      // Patchy bare soil in the floor.
      if (lv === LEVEL.floor && nC.fbm(x * 0.11 - 20, z * 0.11, 3) > 0.66) lv = LEVEL.dirt;
      const dc = Math.hypot(x - cx, z - cz);
      const rc = relayR(x, z);
      if (dc < rc) lv = dc < rc - 3 ? LEVEL.dirt : Math.min(lv, LEVEL.floor);
      // Trails: dirt with a wobbly edge.
      const wob = (nB.value(x * 0.4, z * 0.4) - 0.5) * 0.9;
      if (trailVerts[i] < trailHalf[i] + wob) lv = LEVEL.dirt;
      if (water[i] > 0) lv = LEVEL.water;
      else if (water[i] > -J.bankWidth) lv = Math.min(lv, LEVEL.mud);
      L[i] = lv;
    }
  }
  // Sites: clear dirt/floor centre (paving later).
  for (const s of sites) {
    for (let z = Math.floor(s.z - s.r - 1); z <= Math.ceil(s.z + s.r + 1); z++) {
      for (let x = Math.floor(s.x - s.r - 1); x <= Math.ceil(s.x + s.r + 1); x++) {
        if (x < 0 || z < 0 || x > W || z > W) continue;
        const d = Math.hypot(x - s.x, z - s.z) + (nB.value(x * 0.5, z * 0.5) - 0.5) * 1.6;
        if (d < s.r * 0.75 && L[z * V + x] > LEVEL.mud) L[z * V + x] = s.type === 'camp' || s.type === 'pylon' ? LEVEL.dirt : Math.min(L[z * V + x], LEVEL.floor);
      }
    }
  }
  // Paving: ruins and the old roads near them; data-center roads are mostly paved.
  for (const s of sites) {
    if (s.type !== 'major' && s.type !== 'minor') continue;
    const look = REGION_LOOK[regionKey(s.region)] || {};
    const pr = s.r * (0.55 + (look.pave || 0.5) * 0.45);
    for (let z = Math.floor(s.z - pr - 2); z <= Math.ceil(s.z + pr + 2); z++) {
      for (let x = Math.floor(s.x - pr - 2); x <= Math.ceil(s.x + pr + 2); x++) {
        if (x < 0 || z < 0 || x > W || z > W) continue;
        const i = z * V + x;
        const d = Math.hypot(x - s.x, z - s.z) + (nC.fbm(x * 0.3, z * 0.3, 2) - 0.5) * 4;
        if (d < pr && L[i] >= LEVEL.dirt) { L[i] = LEVEL.dirt; world.pave[i] = 1; }
      }
    }
  }
  // Relay plaza paving.
  for (let z = 0; z <= W; z++) for (let x = 0; x <= W; x++) {
    const d = Math.hypot(x - cx, z - cz) + (nC.fbm(x * 0.3, z * 0.3, 2) - 0.5) * 3;
    if (d < 4.5) { L[z * V + x] = LEVEL.dirt; world.pave[z * V + x] = 1; }
  }

  // Smooth: neighbouring vertices may differ by at most 1 level (lowering creates natural banks).
  smoothLevels(L, V);
  // Paving only where the vertex really is level 2.
  for (let i = 0; i < V * V; i++) if (L[i] !== LEVEL.dirt) world.pave[i] = 0;

  // ---------------------------------------------------------------- per-tile classification
  const tileLevelMin = (x, z) => Math.min(L[z * V + x], L[z * V + x + 1], L[(z + 1) * V + x], L[(z + 1) * V + x + 1]);
  const tileLevelAvg = (x, z) => (L[z * V + x] + L[z * V + x + 1] + L[(z + 1) * V + x] + L[(z + 1) * V + x + 1]) / 4;
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const tx = x + 0.5, tz = z + 0.5;
    const i = z * W + x;
    if (trailVerts[z * V + x] < trailHalf[z * V + x] + 0.3) world.trail[i] = 1;
    for (const s of sites) if (Math.hypot(tx - s.x, tz - s.z) < s.r * J.siteClear) { world.site[i] = s.idx; break; }
  }
  // ---------------------------------------------------------------- deep water + fords
  // Deep: well inside the water (the tile's mean depth below the shore line > deepFrom). Trails cross it at fords; each river
  // gets a few extra fords. Ford tiles stay shallow (wading speed) and are drawn with stepping stones.
  const G = GROUND;
  const deep = world.deep, ford = world.ford;
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const i = z * V + x;
    if ((water[i] + water[i + 1] + water[i + V] + water[i + V + 1]) / 4 > G.deepFrom && tileLevelAvg(x, z) === 0) deep[z * W + x] = 1;
  }
  const makeFord = (x, z, r) => {
    for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (tx < 0 || tz < 0 || tx >= W || tz >= W || Math.hypot(tx + 0.5 - x, tz + 0.5 - z) > r) continue;
      const i = tz * W + tx;
      if (deep[i] || tileLevelMin(tx, tz) === LEVEL.water) ford[i] = 1;
      deep[i] = 0;
    }
  };
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    if (!deep[z * W + x]) continue;
    let near = false;
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const v = (z + dz) * V + x + dx; if (trailVerts[v] < trailHalf[v] + 0.3) near = true; }
    if (near) makeFord(x + 0.5, z + 0.5, G.fordPad);   // the trail itself crosses here
  }
  const frng = makeRng(subSeed(seed, 'fords'));
  for (const line of riverLines) {
    const cand = frng.shuffle(line.filter(([x, z]) => deep[Math.floor(z) * W + Math.floor(x)]));
    let n = 0;
    for (const [x, z] of cand) {
      if (n >= G.extraFords) break;
      let clash = false;
      for (let tz = Math.floor(z - G.fordSpacing); tz <= z + G.fordSpacing && !clash; tz += 2) for (let tx = Math.floor(x - G.fordSpacing); tx <= x + G.fordSpacing; tx += 2) {
        if (tx >= 0 && tz >= 0 && tx < W && tz < W && ford[tz * W + tx] && Math.hypot(tx - x, tz - z) < G.fordSpacing) { clash = true; break; }
      }
      if (clash) continue;
      makeFord(x, z, G.fordRadius);
      n++;
    }
  }

  // Distance (tiles) to the nearest trail or open clearing: the deep jungle away from them grows denser.
  const openDist = new Float32Array(W * W).fill(999);
  for (let i = 0; i < W * W; i++) {
    const x = i % W, z = (i - x) / W;
    if (world.trail[i] || world.site[i] >= 0 || Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < J.relayClearing) openDist[i] = 0;
  }
  chamfer(openDist, W);

  // ---------------------------------------------------------------- undergrowth
  const B = world.brush;
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const tx = x + 0.5, tz = z + 0.5;
      if (tileLevelMin(x, z) <= LEVEL.mud && tileLevelAvg(x, z) < 1) continue;   // water / deep mud: open
      if (Math.hypot(tx - cx, tz - cz) < relayR(tx, tz)) continue;
      if (world.site[i] >= 0) {
        // Sites are mostly clear: a few ferns.
        if (hash2(x, z, 11) < 0.12) B[i] = BRUSH.fern;
        continue;
      }
      const look = REGION_LOOK[regionKey(world.region[i])] || {};
      const dens = nA.fbm(x * 0.13 - 50, z * 0.13 + 22, 4) + (look.brushBias || 0) + (hash2(x, z, 3) - 0.5) * 0.08
        + J.deepBrush * Math.max(0, Math.min(1, (openDist[i] - J.deepBrushFrom) / J.deepBrushRamp));
      let b = dens > J.brushThicket ? BRUSH.thicket : dens > J.brushFern ? BRUSH.fern : BRUSH.none;
      if (b === BRUSH.thicket && nC.fbm(x * 0.09 + 90, z * 0.09, 3) > J.brambleNoise) b = BRUSH.bramble;
      if (world.trail[i]) {
        // Trails get more overgrown the further they are from the Relay.
        const dk = Math.min(1, Math.max(0, (Math.hypot(tx - cx, tz - cz) - 14) / 70));
        const p = J.trailOvergrowth[0] + (J.trailOvergrowth[1] - J.trailOvergrowth[0]) * dk;
        b = hash2(x, z, 7) < p ? (hash2(x, z, 8) < 0.55 ? BRUSH.fern : BRUSH.thicket) : BRUSH.none;
      }
      if (tileLevelMin(x, z) === LEVEL.mud && b > BRUSH.fern) b = BRUSH.fern;   // reeds, not thickets, on banks
      B[i] = b;
    }
  }
  // ---------------------------------------------------------------- trees (jittered grid)
  let oid = 0;
  const objects = world.objects;
  const occupied = new Uint8Array(W * W);   // tiles under a collider (no containers / spawns here)
  const markCircle = (x, z, r) => {
    for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (tx >= 0 && tz >= 0 && tx < W && tz < W) occupied[tz * W + tx] = 1;
    }
  };
  // Also every tile under (or within `pad` of) an object's collision footprint (SOLID.kind), so no container,
  // spore pod or later object lands inside a trunk, log or ruin.
  const markFoot = (o, pad) => {
    markCircle(o.x, o.z, 0);
    const f = footprint(o);
    if (!f) return;
    for (let tz = Math.floor(f.z0 - f.rr - pad); tz <= Math.floor(f.z1 + f.rr + pad); tz++) for (let tx = Math.floor(f.x0 - f.rr - pad); tx <= Math.floor(f.x1 + f.rr + pad); tx++) {
      if (tx >= 0 && tz >= 0 && tx < W && tz < W && inFootprint(f, tx + 0.5, tz + 0.5, pad)) occupied[tz * W + tx] = 1;
    }
  };
  const step = J.treeSpacing;
  for (let gz = 2; gz < W - 2; gz += step) {
    for (let gx = 2; gx < W - 2; gx += step) {
      const x = gx + rng.next() * step, z = gz + rng.next() * step;
      const tx = Math.floor(x), tz = Math.floor(z);
      if (tx < 1 || tz < 1 || tx >= W - 1 || tz >= W - 1) continue;
      const i = tz * W + tx;
      if (world.trail[i] || world.site[i] >= 0) continue;
      if (Math.hypot(x - cx, z - cz) < J.relayClearing + 1) continue;
      if (tileLevelMin(tx, tz) <= LEVEL.mud) continue;
      if (occupied[i]) continue;
      const dens = nA.fbm(x * 0.05 + 300, z * 0.05, 3);
      if (rng.next() > J.treeChance * (0.6 + dens * 0.8)) continue;
      const look = REGION_LOOK[regionKey(world.region[i])] || REGION_LOOK.overgrown_market;
      const type = rng.weighted(look.trees);
      const big = rng.chance(J.bigTreeChance) && type !== 'fern';
      const r = big ? 0.62 : type === 'palm' || type === 'fern' ? 0.3 : 0.42;
      const px = Math.round(x * 32) / 32, pz = Math.round(z * 32) / 32;
      objects.push({ id: `o${oid++}`, kind: 'tree', type, x: px, z: pz, r, big, flip: rng.chance(0.5) });
      markCircle(px, pz, r + 0.3);
      markFoot(objects[objects.length - 1], 0.35);
      // The trunk's own tile has no brush.
      B[i] = BRUSH.none;
    }
  }

  // ---------------------------------------------------------------- site dressing: ruins + props
  const hrng = makeRng(subSeed(seed, 'heroes'));   // own stream: the rest of the layout stays as it was
  for (const s of sites) {
    const look = REGION_LOOK[regionKey(s.region)] || REGION_LOOK.overgrown_market;
    // District hero ruins (critic H #3): 1–2 of the region's signature ruin (REGION_LOOK.hero) at each major site,
    // on the far (north) side of the clearing, so they frame it without covering the objective spot at its centre.
    if (s.type === 'major' && look.hero) {
      const nh = hrng.int(1, 2);
      for (let k = 0; k < nh; k++) {
        const a = -Math.PI / 2 + (nh === 1 ? (hrng.next() - 0.5) * 1.2 : (k ? 0.75 : -0.75) + (hrng.next() - 0.5) * 0.4);
        const d = s.r * (0.5 + hrng.next() * 0.15);
        const x = Math.round((s.x + Math.cos(a) * d) * 32) / 32, z = Math.round((s.z + Math.sin(a) * d) * 32) / 32;
        const o = { id: `o${oid}`, kind: 'ruin', type: look.hero.replace('ruin_', ''), x, z, r: 0, flip: false, site: s.idx, hero: true };
        const f = footprint(o);
        if (f && inFootprint(f, s.x, s.z, 2)) continue;
        if (objects.some((q) => q.kind === 'ruin' && Math.hypot(q.x - x, q.z - z) < 5)) continue;
        oid++;
        objects.push(o);
        markCircle(x, z, 2);
        markFoot(o, 0.5);
      }
    }
    if (s.type === 'major' || s.type === 'minor' || s.type === 'landmark') {
      const n = s.type === 'major' ? rng.int(4, 6) : s.type === 'minor' ? rng.int(2, 3) : 1;
      for (let k = 0; k < n; k++) {
        const a = rng.next() * TAU;
        const d = s.type === 'landmark' ? 0 : s.r * (0.55 + rng.next() * 0.35);
        const x = Math.round((s.x + Math.cos(a) * d) * 32) / 32, z = Math.round((s.z + Math.sin(a) * d) * 32) / 32;
        const type = s.type === 'landmark' ? rng.pick(['statue', 'mast', 'greenhouse']) : rng.pick(look.ruins).replace('ruin_', '');
        if (objects.some((o) => o.kind === 'ruin' && Math.hypot(o.x - x, o.z - z) < (o.hero ? 4.5 : 3))) continue;
        objects.push({ id: `o${oid++}`, kind: 'ruin', type, x, z, r: 0, flip: rng.chance(0.5), site: s.idx });
        markCircle(x, z, 1.5);
        markFoot(objects[objects.length - 1], 0.5);
      }
    }
    if (s.type === 'camp') {
      objects.push({ id: `o${oid++}`, kind: 'prop', type: 'campfire', x: s.x, z: s.z, r: 0.35, site: s.idx });
      markCircle(s.x, s.z, 0.8);
    }
  }
  // Mossy boulders and logs scattered in the jungle (solid, break sightlines a little).
  for (let k = 0; k < 140; k++) {
    const x = 3 + rng.next() * (W - 6), z = 3 + rng.next() * (W - 6);
    const tx = Math.floor(x), tz = Math.floor(z), i = tz * W + tx;
    if (world.trail[i] || world.site[i] >= 0 || occupied[i] || tileLevelMin(tx, tz) <= LEVEL.mud) continue;
    if (Math.hypot(x - cx, z - cz) < J.relayClearing + 2) continue;
    // A lone stump deep in the brush read as forage that did nothing (critic N §2): the pick stays (the main stream
    // draws the same numbers, so every seed keeps its world) but a 'stump' becomes a fallen log. Old stumps now
    // stand at trail and clearing edges and carry shelf fungus (placeForage).
    const picked = rng.pick(['boulder', 'boulder', 'log', 'stump']);
    const type = picked === 'stump' ? 'log' : picked;
    objects.push({ id: `o${oid++}`, kind: 'rock', type, x: Math.round(x * 32) / 32, z: Math.round(z * 32) / 32, r: type === 'log' ? 0.5 : 0.45, flip: rng.chance(0.5) });
    markCircle(x, z, 0.8);
    markFoot({ ...objects[objects.length - 1], type: picked }, 0.4);   // (the picked footprint: later placements don't shift)
    B[i] = BRUSH.none;
  }

  // ---------------------------------------------------------------- the dead city under the jungle
  // Ruin fragments deep in the brush, and wrecks / pillars / boulders along the old trails.
  const ruinFree = (x, z, r) => {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (tx < 2 || tz < 2 || tx >= W - 2 || tz >= W - 2) return false;
    if (Math.hypot(x - cx, z - cz) < J.relayClearing + 4) return false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const i = (tz + dz) * W + tx + dx;
      if (occupied[i] || world.site[i] >= 0 || tileLevelMin(tx + dx, tz + dz) <= LEVEL.mud) return false;
    }
    return !objects.some((o) => o.kind === 'ruin' && Math.hypot(o.x - x, o.z - z) < r);
  };
  for (let k = 0; k < J.deepRuins; k++) {
    const x = 4 + rng.next() * (W - 8), z = 4 + rng.next() * (W - 8);
    if (!ruinFree(x, z, 6)) continue;
    const ri = world.region[Math.floor(z) * W + Math.floor(x)];
    const look = REGION_LOOK[regionKey(ri)] || REGION_LOOK.overgrown_market;
    const type = rng.chance(0.15) ? 'statue' : rng.pick(look.ruins).replace('ruin_', '');
    const px = Math.round(x * 32) / 32, pz = Math.round(z * 32) / 32;
    objects.push({ id: `o${oid++}`, kind: 'ruin', type, x: px, z: pz, r: 0, flip: rng.chance(0.5) });
    markCircle(px, pz, 1.4);
    markFoot(objects[objects.length - 1], 0.5);
    // The brush thins right around it, so the ruin reads (ferns, not thickets).
    for (let tz = Math.floor(pz - 2); tz <= Math.floor(pz + 1); tz++) for (let tx = Math.floor(px - 2); tx <= Math.floor(px + 2); tx++) {
      const i = tz * W + tx;
      if (B[i] >= BRUSH.thicket && hash2(tx, tz, 97) < 0.75) B[i] = BRUSH.fern;
    }
  }
  for (let z = 2; z < W - 2; z++) {
    for (let x = 2; x < W - 2; x++) {
      if (!world.trail[z * W + x] || hash2(x, z, 91) > J.trailDressing) continue;
      // Step off the trail to its edge.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]]) {
        const tx = x + dx, tz = z + dz;
        if (world.trail[tz * W + tx]) continue;
        const px = tx + 0.5, pz = tz + 0.7;
        if (!ruinFree(px, pz, 5)) break;
        const ri = world.region[tz * W + tx];
        const look = REGION_LOOK[regionKey(ri)] || REGION_LOOK.overgrown_market;
        const r = hash2(x, z, 92);
        if (r < 0.45) {
          const type = rng.pick(['car', 'pillar', ...look.ruins.map((t) => t.replace('ruin_', ''))]);
          objects.push({ id: `o${oid++}`, kind: 'ruin', type, x: px, z: pz, r: 0, flip: rng.chance(0.5) });
          markCircle(px, pz, 1.2);
          markFoot(objects[objects.length - 1], 0.5);
        } else {
          objects.push({ id: `o${oid++}`, kind: 'rock', type: r < 0.75 ? 'boulder' : 'log', x: px, z: pz, r: 0.45, flip: rng.chance(0.5) });
          markCircle(px, pz, 0.7);
          markFoot(objects[objects.length - 1], 0.4);
        }
        break;
      }
    }
  }

  // Lost sites hide behind a ring of thicket and bramble (water and banks stay as they are;
  // after the trees and ruins so nothing thins it).
  for (const s of sites) {
    if (!s.lost) continue;
    const r0 = s.r * J.siteClear, r1 = r0 + J.lostRing;
    for (let z = Math.floor(s.z - r1 - 1); z <= Math.ceil(s.z + r1); z++) for (let x = Math.floor(s.x - r1 - 1); x <= Math.ceil(s.x + r1); x++) {
      if (x < 1 || z < 1 || x >= W - 1 || z >= W - 1) continue;
      const i = z * W + x;
      const d = Math.hypot(x + 0.5 - s.x, z + 0.5 - s.z) + (nB.value(x * 0.6, z * 0.6) - 0.5) * 1.5;
      if (d < r0 || d > r1 || world.site[i] >= 0 || world.trail[i] || tileLevelAvg(x, z) < 1.5) continue;   // reed thickets on the banks too
      B[i] = Math.max(B[i], hash2(x, z, 41) < J.lostBramble ? BRUSH.bramble : BRUSH.thicket);
    }
  }

  // ---------------------------------------------------------------- pylons + containers
  for (const s of sites) {
    if (s.type !== 'pylon') continue;
    world.pylons.push({ id: `p${world.pylons.length}`, x: s.x, z: s.z, region: s.region, site: s.idx });
    markCircle(s.x, s.z, 0.6);
  }
  let cid = 0;
  const openTileNear = (x, z, r) => {
    for (let t = 0; t < 30; t++) {
      const a = rng.next() * TAU, d = rng.next() * r;
      const tx = Math.floor(x + Math.cos(a) * d), tz = Math.floor(z + Math.sin(a) * d);
      if (tx < 1 || tz < 1 || tx >= W - 1 || tz >= W - 1) continue;
      const i = tz * W + tx;
      if (occupied[i] || B[i] >= BRUSH.thicket || tileLevelMin(tx, tz) <= LEVEL.mud) continue;
      occupied[i] = 1;
      return { x: tx + 0.5, z: tz + 0.5 };
    }
    return null;
  };
  for (const s of sites) {
    const [a, b] = J.containersPerSite[s.type] || [0, 0];
    const n = rng.int(a, b) + (s.lost ? J.lostBonus : 0);
    for (let k = 0; k < n; k++) {
      const p = openTileNear(s.x, s.z, s.r * 0.75);
      if (!p) continue;
      world.containers.push({ id: `c${cid++}`, type: rng.weighted(J.containerWeights), x: p.x, z: p.z, site: s.idx, region: s.region });
    }
  }
  for (let k = 0; k < J.hiddenCaches; k++) {
    // Hidden caches sit inside the thick of it: you find them by cutting.
    for (let t = 0; t < 40; t++) {
      const x = 4 + rng.next() * (W - 8), z = 4 + rng.next() * (W - 8);
      const tx = Math.floor(x), tz = Math.floor(z), i = tz * W + tx;
      if (Math.hypot(x - cx, z - cz) < 22 || occupied[i] || world.trail[i] || world.site[i] >= 0 || tileLevelMin(tx, tz) <= LEVEL.mud) continue;
      if (trailVerts[tz * V + tx] < trailHalf[tz * V + tx] + J.hiddenTrailGap) continue;   // off the trails
      if (world.pylons.some((p) => Math.hypot(x - p.x, z - p.z) < 10)) continue;
      B[i] = BRUSH.none;   // a little hollow in the brush
      occupied[i] = 1;
      world.containers.push({ id: `c${cid++}`, type: rng.weighted(J.hiddenWeights), x: tx + 0.5, z: tz + 0.5, site: -1, region: world.region[i], hidden: true });
      break;
    }
  }
  // Spore pods: beside trails and clearings (where you walk), on open or fern ground.
  world.spores = [];
  const srng = makeRng(subSeed(seed, 'spores'));
  for (let ri = 0; ri < nReg; ri++) {
    const want = SPORES.perRegion[districtKeys[ri]] ?? SPORES.perRegionDefault;
    for (let k = 0, t = 0; k < want && t < want * 250; t++) {
      const x = 3 + srng.next() * (W - 6), z = 3 + srng.next() * (W - 6);
      const tx = Math.floor(x), tz = Math.floor(z), i = tz * W + tx;
      if (world.region[i] !== ri || occupied[i] || B[i] > BRUSH.fern || openDist[i] > SPORES.nearOpen || tileLevelMin(tx, tz) <= LEVEL.mud) continue;
      if (Math.hypot(x - cx, z - cz) < SPORES.minRelay || sites.some((s) => Math.hypot(tx + 0.5 - s.x, tz + 0.5 - s.z) < 2.5)) continue;
      if (world.spores.some((p) => Math.hypot(p.x - tx - 0.5, p.z - tz - 0.5) < SPORES.spacing)) continue;
      occupied[i] = 1;
      world.spores.push({ id: `sp${world.spores.length}`, x: tx + 0.5, z: tz + 0.5, region: ri });
      k++;
    }
  }
  // Relic strongboxes, landmark shrines, data logs and place names (src/data/relics.js, lore.js): own streams,
  // after everything else is placed, so the rest of the layout doesn't shift.
  siteFeatures(world, seed, occupied, B, (tx, tz) => tileLevelMin(tx, tz) <= LEVEL.mud);
  // Area boss lairs (src/data/bosses.js): one site index per region (bossLairs; no random draws, nothing shifts).
  // Their arenas are cleared of loot and lore (critic I2 #5), before reachability is checked.
  world.lairs = bossLairs(world, districtKeys.length);
  clearLairProps(world, seed, occupied, B, (tx, tz) => tileLevelMin(tx, tz) <= LEVEL.mud);
  world.occupied = occupied;
  // Far from a return point (the Relay or any pylon) = richer: `yield` multiplies a container's Scrap.
  for (const c of world.containers) {
    c.yield = returnYield(world, c.x, c.z);
    if (c.type === 'cache' && returnDist(world, c.x, c.z) < J.lootDistance.cacheMin) c.type = 'chest';
  }

  // The guided first run (critic L §2.1, the guided day must pay): pick the guided goal site (GUIDE.district's
  // region, a trail-side major/minor site GUIDE.objectiveDist from the Relay; JungleScene prefers it) and line the
  // trail there with a few crates (GUIDE.routeCrates), each in a cleared nook beside the trail.
  if (opts.guided) guidedRoute(world, sites, districtKeys, occupied, makeRng(subSeed(seed, 'guided')));

  // Foraging (critic N, FORAGE): shelf-fungus hosts and wild fruit, from their own stream after everything else is
  // placed (nothing above moves) and before reachability (so a new stump never walls a site off).
  placeForage(world, makeRng(subSeed(seed, 'forage')), { occupied, openDist, markFoot, nextId: () => `o${oid++}`, wet: (tx, tz) => tileLevelMin(tx, tz) <= LEVEL.mud });

  // Make sure the Relay clearing and every site/pylon are clear of brush at their centres.
  for (const s of sites) clearDisc(world, s.x, s.z, s.type === 'pylon' ? 1.6 : 1.2);
  world.reach = ensureReachable(world);
  // Nothing solid hides: no undergrowth under a footprint, and none right in front (south) of the low ones (logs,
  // rocks, stumps, ruins) — fern cards there would cover them and you'd walk into an unseen wall. A tree standing
  // right in front of a log / rock / stump (GROUND.treeFront.rock tiles) or a ruin (.ruin) goes too: its trunk
  // and canopy cards would hide it.
  const hiders = world.objects.filter((o) => o.kind === 'rock' || o.kind === 'ruin').map((o) => ({ f: footprint(o), d: GROUND.treeFront[o.kind] }));
  world.objects = world.objects.filter((o) => o.kind !== 'tree' || !hiders.some(({ f, d }) => o.z > f.z1 && o.z < f.z1 + f.rr + d && o.x > f.x0 - f.rr - 0.6 && o.x < f.x1 + f.rr + 0.6));
  for (const o of world.objects) {
    const f = footprint(o);
    if (!f) continue;
    const low = o.kind !== 'tree';
    const zEnd = f.z1 + f.rr + (low ? GROUND.clearFront : 0);
    for (let tz = Math.floor(f.z0 - f.rr); tz <= Math.floor(zEnd); tz++) for (let tx = Math.floor(f.x0 - f.rr); tx <= Math.floor(f.x1 + f.rr); tx++) {
      if (tx < 0 || tz < 0 || tx >= W || tz >= W) continue;
      if (inFootprint(f, tx + 0.5, tz + 0.5, 0.25) || (low && tz + 0.5 > f.z1 && tz + 0.5 < zEnd && tx + 0.5 > f.x0 - f.rr && tx + 0.5 < f.x1 + f.rr)) B[tz * W + tx] = BRUSH.none;
    }
  }
  // Loot, pylons and spore pods stay in view (critic H #12: a chest 80% hidden behind an elephant-ear card): no undergrowth
  // within GROUND.propFront.clear in front of (south of) a container or pylon, only low ferns out to .low
  // (hidden caches keep their thicket: you still cut your way to them), and no tree right in front.
  const PF = GROUND.propFront;
  // Spore pods too (a hazard you should see coming), but only the near clearing.
  const props = [...world.containers.map((c) => ({ x: c.x, z: c.z, hidden: !!c.hidden })), ...world.pylons.map((p) => ({ x: p.x, z: p.z, hidden: false })),
    ...(world.spores || []).map((p) => ({ x: p.x, z: p.z, hidden: true })),
    ...[...(world.relicCaches || []), ...(world.shrines || []), ...(world.loreSpots || []), ...(world.forage || [])].map((p) => ({ x: p.x, z: p.z, hidden: false }))];
  for (const p of props) {
    const R = p.hidden ? PF.clear : PF.low;
    for (let tz = Math.floor(p.z - 0.5); tz <= Math.floor(p.z + R); tz++) for (let tx = Math.floor(p.x - R); tx <= Math.floor(p.x + R); tx++) {
      if (tx < 0 || tz < 0 || tx >= W || tz >= W) continue;
      const dx = tx + 0.5 - p.x, dz = tz + 0.5 - p.z, d = Math.hypot(dx, dz), i = tz * W + tx;
      if (dz < -0.1) continue;
      if (d <= PF.clear) B[i] = BRUSH.none;
      else if (d <= R && B[i] > BRUSH.fern) B[i] = BRUSH.fern;
    }
  }
  world.objects = world.objects.filter((o) => o.kind !== 'tree' || !props.some((p) => o.z > p.z && o.z < p.z + PF.tree && Math.abs(o.x - p.x) < PF.treeX));
  return world;   // (world.lairs: chosen above, after the site features)
}

/** Distance (tiles) from (x, z) to the nearest return point: the Relay or any pylon. */
export function returnDist(world, x, z) {
  return Math.min(Math.hypot(x - world.center.x, z - world.center.z), ...world.pylons.map((p) => Math.hypot(x - p.x, z - p.z)));
}

/** Loot distance multiplier at (x, z) (JUNGLE.lootDistance): far from a return point = richer. Containers' `yield`, glints. */
export function returnYield(world, x, z) {
  const LD = JUNGLE.lootDistance;
  const k = Math.max(0, Math.min(1, (returnDist(world, x, z) - LD.near) / (LD.far - LD.near)));
  return Math.round((LD.mult[0] + (LD.mult[1] - LD.mult[0]) * k) * 100) / 100;
}

/**
 * Foraging (critic N, FORAGE in src/data/jungle.js), from its own RNG stream `rng`:
 *   - fungus hosts: the FORAGE.fungus.logHosts generated logs nearest a trail / clearing, plus newStumps old stumps
 *     ({ kind: 'rock', type: 'stump' }: the rock_stump collider) on free ground within nearOpen tiles of a trail or
 *     clearing (not on it); all marked `fungus: true`, at least `spacing` apart. Forage.js draws the stumps.
 *   - world.forage: wild fruit bushes per district region (perRegion × perRegionMult), open ground within nearOpen
 *     of a trail or clearing (not on it), away from the Relay, each other and the boss lairs.
 */
function placeForage(world, rng, { occupied, openDist, markFoot, nextId, wet }) {
  const W = world.size, B = world.brush, cx = world.center.x, cz = world.center.z;
  const F = FORAGE.fungus, R = FORAGE.fruit;
  const hosts = [];
  const farFromHosts = (x, z) => hosts.every((o) => Math.hypot(o.x - x, o.z - z) >= F.spacing);
  const nearSpore = (x, z, r) => (world.spores || []).some((p) => Math.hypot(p.x - x, p.z - z) < r);
  // Logs nearest open ground first (deterministic: by distance, then generation order).
  const logs = world.objects.filter((o) => o.kind === 'rock' && o.type === 'log' && Math.hypot(o.x - cx, o.z - cz) >= F.minRelay)
    .map((o) => ({ o, d: openDist[Math.floor(o.z) * W + Math.floor(o.x)] }))
    .sort((a, b) => a.d - b.d);
  for (const { o } of logs) {
    if (hosts.length >= F.logHosts) break;
    if (!farFromHosts(o.x, o.z)) continue;
    o.fungus = true;
    hosts.push(o);
  }
  // New old stumps: the whole footprint (+ half a tile) on free, dry ground off the trails and clearings.
  const stumpOk = (o) => {
    const f = footprint(o);
    for (let tz = Math.floor(f.z0 - f.rr - 0.5); tz <= Math.floor(f.z1 + f.rr + 0.5); tz++) for (let tx = Math.floor(f.x0 - f.rr - 0.5); tx <= Math.floor(f.x1 + f.rr + 0.5); tx++) {
      if (tx < 1 || tz < 1 || tx >= W - 1 || tz >= W - 1) return false;
      const i = tz * W + tx;
      if (!inFootprint(f, tx + 0.5, tz + 0.5, 0.5)) continue;
      if (occupied[i] || world.trail[i] || world.site[i] >= 0 || world.deep[i] || wet(tx, tz)) return false;
    }
    return true;
  };
  // Candidate tiles: a band beside the trails and clearings (not on them), shuffled by the forage stream.
  const band = (near, minRelay) => {
    const out = [];
    for (let tz = 3; tz < W - 3; tz++) for (let tx = 3; tx < W - 3; tx++) {
      const i = tz * W + tx;
      if (openDist[i] >= 1 && openDist[i] <= near && Math.hypot(tx + 0.5 - cx, tz + 0.5 - cz) >= minRelay) out.push(i);
    }
    return rng.shuffle(out);
  };
  for (const i of band(F.nearOpen, F.minRelay)) {
    if (hosts.length >= F.logHosts + F.newStumps) break;
    const tx = i % W, tz = (i - tx) / W;
    const o = { id: '', kind: 'rock', type: 'stump', x: tx + 0.5, z: tz + 0.5, r: 0.45, flip: hash2(tx, tz, 61) < 0.5, fungus: true };
    if (!farFromHosts(o.x, o.z) || !stumpOk(o) || nearSpore(o.x, o.z, F.sporeGap)) continue;
    o.id = nextId();
    world.objects.push(o);
    markFoot(o, 0.4);
    // A little clearing round it (an old logging edge), so no plant card hides the fungus on its flanks.
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 1; dx++) B[(tz + dz) * W + tx + dx] = BRUSH.none;
    hosts.push(o);
  }
  // Wild fruit.
  world.forage = [];
  const lairs = (world.lairs || []).map((i) => world.sites[i]).filter(Boolean);
  const fruitBand = band(R.nearOpen, R.minRelay);
  for (let ri = 0; ri < world.districts.length; ri++) {
    const want = Math.round(R.perRegion * (R.perRegionMult[world.districts[ri]] ?? 1));
    let k = 0;
    for (const i of fruitBand) {
      if (k >= want) break;
      const tx = i % W, tz = (i - tx) / W;
      if (world.region[i] !== ri || occupied[i] || world.trail[i] || world.site[i] >= 0 || world.deep[i] || wet(tx, tz) || B[i] === BRUSH.bramble) continue;
      const px = tx + 0.5, pz = tz + 0.5;
      if (lairs.some((s) => Math.hypot(px - s.x, pz - s.z) < R.lairGap)) continue;
      if (nearSpore(px, pz, R.sporeGap)) continue;
      if (world.forage.some((f) => Math.hypot(f.x - px, f.z - pz) < R.spacing)) continue;
      occupied[i] = 1;
      B[i] = BRUSH.none;   // (and GROUND.propFront keeps the ground in front of it low)
      world.forage.push({ id: `f${world.forage.length}`, kind: 'fruit', x: px, z: pz, region: ri });
      k++;
    }
  }
}

/**
 * Clear the lairs (critic I2 #5: crates, terminals, lore stones and the relic strongbox stood 0.7–3.4 tiles from
 * the bosses): every container, relic strongbox and data log within BOSS.clearProps.radius of a lair moves to an
 * open tile BOSS.clearProps.to [min, max] tiles from it (outside every lair's radius). Its own seeded stream and
 * the same id, so the layout is the same every day and opened ones stay opened.
 */
function clearLairProps(world, seed, occupied, B, wet) {
  const CP = BOSS.clearProps, W = world.size;
  const lairs = (world.lairs || []).map((i) => world.sites[i]).filter(Boolean);
  if (!CP || !lairs.length) return;
  const rng = makeRng(subSeed(seed, 'lairprops'));
  const near = (x, z) => lairs.find((s) => Math.hypot(x - s.x, z - s.z) < CP.radius);
  // No wild spore pods in an arena either (the Thorn Mother brings her own): the fight is the boss.
  world.spores = (world.spores || []).filter((p) => !near(p.x, p.z));
  for (const list of [world.containers, world.relicCaches, world.loreSpots]) for (const c of list || []) {
    const L = near(c.x, c.z);
    if (!L) continue;
    for (let t = 0; t < 160; t++) {
      const late = t >= 80;   // after 80 tries: further out, and brush tiles count (cleared)
      const a = rng.next() * TAU, d = CP.to[0] + rng.next() * (CP.to[1] - CP.to[0] + (late ? 4 : 0));
      const tx = Math.floor(L.x + Math.cos(a) * d), tz = Math.floor(L.z + Math.sin(a) * d);
      if (tx < 1 || tz < 1 || tx >= W - 1 || tz >= W - 1) continue;
      const i = tz * W + tx;
      if (occupied[i] || (!late && B[i] >= BRUSH.thicket) || wet(tx, tz) || world.deep[i] || near(tx + 0.5, tz + 0.5)) continue;
      occupied[Math.floor(c.z) * W + Math.floor(c.x)] = 0;
      occupied[i] = 1;
      if (!c.hidden) B[i] = BRUSH.none;
      c.x = tx + 0.5; c.z = tz + 0.5;
      break;
    }
  }
}

/** An area's lair candidates in order of preference (bossLair). */
function lairCandidates(world, ri) {
  const c = world.center;
  const mine = world.sites.filter((s) => s.region === ri && s.type !== 'pylon');
  const far = (a, b) => Math.hypot(b.x - c.x, b.z - c.z) - Math.hypot(a.x - c.x, a.z - c.z);
  const out = [];
  const add = (s) => { if (s && !out.includes(s)) out.push(s); };
  add(mine.find((s) => s.type === 'major' && s.lost));
  mine.filter((s) => s.lost && s.type !== 'camp').sort(far).forEach(add);
  add(mine.find((s) => s.type === 'major'));
  mine.slice().sort(far).forEach(add);
  return out;
}

/**
 * The site an area's boss holds (critic J M5): the region's lost major site, else its lost site furthest from the
 * Relay, else its major site (else any non-pylon site). Returns the site index, or -1.
 */
export function bossLair(world, ri) {
  return lairCandidates(world, ri)[0]?.idx ?? -1;
}

/**
 * Every area's lair, spread out (critic H2 §5.2: two bosses joined one fight): each area takes its most preferred
 * site at least BOSS.aggro + leash + lairGap tiles from the lairs already chosen (areas in order); if none is, the
 * candidate furthest from them. Deterministic (no RNG).
 */
export function bossLairs(world, nAreas) {
  const gap = BOSS.aggro + BOSS.leash + BOSS.lairGap;
  const picked = [];
  const lairs = [];
  for (let ri = 0; ri < nAreas; ri++) {
    const cands = lairCandidates(world, ri);
    const minD = (s) => picked.reduce((m, q) => Math.min(m, Math.hypot(s.x - q.x, s.z - q.z)), Infinity);
    let pick = cands.find((s) => minD(s) >= gap);
    if (!pick && cands.length) pick = cands.reduce((a, b) => (minD(b) > minD(a) ? b : a));
    if (pick) picked.push(pick);
    lairs.push(pick ? pick.idx : -1);
  }
  return lairs;
}

/**
 * Site features (Stage 7 relics & lore: src/data/relics.js, src/data/lore.js), each from its own seeded stream so
 * the rest of the world's layout never shifts:
 *   s.name        majors and landmarks get a place name from their area's list (never twice in one jungle);
 *                 landmarks also get s.kind = the ruin standing there ('statue' | 'mast' | 'greenhouse')
 *   relicCaches   [{ id, site, x, z }]        an old strongbox at every LOST major site (inside its bramble ring)
 *   shrines       [{ id, site, x, z, kind }]  one per landmark, on the ground in front of its ruin
 *   loreSpots     [{ id, site, x, z }]        sites holding a data log (LORE_SPOTS chance per type; one per site)
 * Each spot is an open tile of the site's clearing (no footprint, no thicket, no water), then marked occupied.
 */
function siteFeatures(world, seed, occupied, B, wet) {
  const W = world.size;
  const nrng = makeRng(subSeed(seed, 'names'));
  const fill = (t) => t.replace('{n}', String(nrng.int(2, 9))).replace('{L}', 'ABCDEF'[nrng.int(0, 5)]);
  const majors = {};
  for (const k of world.districts) majors[k] = nrng.shuffle(PLACE_NAMES[k]?.major || []);
  const lands = {};
  for (const [k, list] of Object.entries(LANDMARK_NAMES)) lands[k] = nrng.shuffle(list);
  const free = (x, z, anyBrush) => {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (tx < 1 || tz < 1 || tx >= W - 1 || tz >= W - 1) return false;
    const i = tz * W + tx;
    return !occupied[i] && (anyBrush || B[i] < BRUSH.thicket) && !wet(tx, tz) && !world.deep[i];
  };
  // Taken: occupied, and no undergrowth on the tile itself (a crowded clearing may push a spot into the brush).
  const take = (x, z) => { const tx = Math.floor(x), tz = Math.floor(z); occupied[tz * W + tx] = 1; B[tz * W + tx] = BRUSH.none; return { x: tx + 0.5, z: tz + 0.5 }; };
  const frng = makeRng(subSeed(seed, 'features'));
  // An open tile in the clearing between r0 and r1 × the site's radius (or the `prefer` point if it is open);
  // after 40 tries the ring widens and brush tiles count.
  const spot = (s, r0, r1, prefer) => {
    if (prefer && free(prefer.x, prefer.z)) return take(prefer.x, prefer.z);
    for (let t = 0; t < 80; t++) {
      const late = t >= 40;
      const a = frng.next() * TAU, d = s.r * (r0 + frng.next() * (r1 - r0 + (late ? 0.5 : 0)));
      const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      if (free(x, z, late)) return take(x, z);
    }
    return null;
  };
  world.relicCaches = [];
  world.shrines = [];
  world.loreSpots = [];
  const lrng = makeRng(subSeed(seed, 'lore'));
  for (const s of world.sites) {
    if (s.type === 'major') {
      const list = majors[world.districts[s.region]] || [];
      if (list.length) s.name = fill(list.shift());
    }
    if (s.type === 'landmark') {
      // The ruin standing at the landmark's centre decides what it is (JungleGen site dressing).
      const ruin = world.objects.find((o) => o.kind === 'ruin' && o.site === s.idx && LANDMARK_NAMES[o.type]);
      s.kind = ruin?.type || 'statue';
      const list = lands[s.kind];
      if (list?.length) s.name = fill(list.shift());
      // In front of (south of) its ruin, so the shrine's glow sits in view under it.
      const f = ruin ? footprint(ruin) : null;
      const p = spot(s, 0.3, 0.8, f ? { x: ruin.x, z: f.z1 + f.rr + 1.0 } : null);
      if (p) world.shrines.push({ id: `sh${s.idx}`, site: s.idx, kind: s.kind, ...p });
    }
    if (s.type === 'major' && s.lost) {
      const p = spot(s, 0.25, 0.65);
      if (p) world.relicCaches.push({ id: `rc${s.idx}`, site: s.idx, ...p });
    }
    if (lrng.chance(LORE_SPOTS[s.type] || 0)) {
      const p = spot(s, 0.4, 0.75);
      if (p) world.loreSpots.push({ id: `lg${s.idx}`, site: s.idx, ...p });
    }
  }
}

/**
 * Reachability (Stage 6): every site, pylon and container must be walkable from the Relay. Brush counts as
 * passable (it can be cut); deep water and object footprints (SOLID.kind, the largest art of each type, so
 * the runtime colliders are never bigger) don't. A tile is walkable when its centre is >= GROUND.reachPad from
 * every footprint. Anything unreachable is fixed along the cheapest path from the reachable area: deep water on
 * it becomes a ford, objects on it are removed. Returns a report.
 */
export function ensureReachable(world) {
  const G = GROUND, W = world.size;
  const report = { targets: 0, unreachable: 0, fords: 0, removed: 0, passes: 0, left: 0 };
  const targets = [
    ...world.sites.map((s) => ({ x: s.x, z: s.z, r: 2 })),
    ...world.pylons.map((p) => ({ x: p.x, z: p.z, r: 2 })),
    ...world.containers.map((c) => ({ x: c.x, z: c.z, r: 1.2 })),
    ...[...(world.relicCaches || []), ...(world.shrines || []), ...(world.loreSpots || [])].map((c) => ({ x: c.x, z: c.z, r: 1.2 })),
  ];
  report.targets = targets.length;
  const sx = Math.floor(world.center.x + DAY.startOffset[0]), sz = Math.floor(world.center.z + DAY.startOffset[1]);
  for (let pass = 0; pass <= 5; pass++) {
    const { blocked, owners } = blockGrid(world);
    const reached = floodTiles(W, blocked, sx, sz);
    const bad = targets.filter((t) => !nearReached(W, reached, t));
    if (pass === 0) report.unreachable = bad.length;
    report.passes = pass;
    report.left = bad.length;
    if (!bad.length || pass === 5) return report;
    // Cheapest repair path from the start to each unreachable target.
    const cost = (i) => (blocked[i] === 2 ? G.fixDeep : blocked[i] === 1 ? G.fixObject : 1);
    const { dist, from } = dijkstraTiles(W, cost, sx, sz);
    const kill = new Set();
    for (const t of bad) {
      let best = -1;
      forTilesNear(W, t, (i) => { if (dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i; });
      for (let i = best; i >= 0 && !reached[i]; i = from[i]) {
        if (blocked[i] === 2) {
          const x = i % W, z = (i - x) / W;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (x + dx < 0 || z + dz < 0 || x + dx >= W || z + dz >= W) continue;
            const j = (z + dz) * W + x + dx;
            if (world.deep[j]) { world.deep[j] = 0; world.ford[j] = 1; report.fords++; }
          }
        } else if (blocked[i] === 1) for (const o of owners.get(i) || []) if (!o.pylon) kill.add(o);
      }
    }
    if (kill.size) {
      world.objects = world.objects.filter((o) => !kill.has(o));
      report.removed += kill.size;
    }
  }
  return report;
}

/** Tiles blocked for walking (1 object footprint within reachPad, 2 deep water) and the objects on each. */
export function blockGrid(world) {
  const G = GROUND, W = world.size;
  const blocked = new Uint8Array(W * W);
  const owners = new Map();
  const solids = [
    ...world.objects,
    ...world.pylons.map((p) => ({ kind: 'prop', type: 'pylon', x: p.x, z: p.z, pylon: true })),
  ];   // (containers are targets, not walls: small, and opened from any side)
  for (const o of solids) {
    const f = footprint(o);
    if (!f) continue;
    const pad = f.rr + G.reachPad;
    for (let tz = Math.floor(f.z0 - pad); tz <= Math.floor(f.z1 + pad); tz++) for (let tx = Math.floor(f.x0 - pad); tx <= Math.floor(f.x1 + pad); tx++) {
      if (tx < 0 || tz < 0 || tx >= W || tz >= W || !inFootprint(f, tx + 0.5, tz + 0.5, G.reachPad)) continue;
      const i = tz * W + tx;
      blocked[i] = 1;
      if (!owners.has(i)) owners.set(i, []);
      owners.get(i).push(o);
    }
  }
  for (let i = 0; i < W * W; i++) if (world.deep[i]) blocked[i] = 2;
  return { blocked, owners };
}

function forTilesNear(W, t, fn) {
  for (let tz = Math.floor(t.z - t.r); tz <= Math.floor(t.z + t.r); tz++) for (let tx = Math.floor(t.x - t.r); tx <= Math.floor(t.x + t.r); tx++) {
    if (tx < 0 || tz < 0 || tx >= W || tz >= W || Math.hypot(tx + 0.5 - t.x, tz + 0.5 - t.z) > t.r) continue;
    fn(tz * W + tx);
  }
}

function nearReached(W, reached, t) {
  let ok = false;
  forTilesNear(W, t, (i) => { if (reached[i]) ok = true; });
  return ok;
}

/** 8-way flood fill over unblocked tiles (diagonals only past two open sides, like a body). */
export function floodTiles(W, blocked, sx, sz) {
  const reached = new Uint8Array(W * W);
  const q = new Int32Array(W * W);
  let h = 0, t = 0;
  if (blocked[sz * W + sx]) return reached;
  reached[sz * W + sx] = 1;
  q[t++] = sz * W + sx;
  while (h < t) {
    const i = q[h++];
    const x = i % W, z = (i - x) / W;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= W - 1 || nz >= W - 1) continue;
      const n = nz * W + nx;
      if (reached[n] || blocked[n]) continue;
      if (dx && dz && (blocked[z * W + nx] || blocked[nz * W + x])) continue;
      reached[n] = 1;
      q[t++] = n;
    }
  }
  return reached;
}

/** Dijkstra over per-tile entry costs (4-way, so a repair path never squeezes between two blockers). */
function dijkstraTiles(W, cost, sx, sz) {
  const N = W * W;
  const dist = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const heap = new MinHeap();
  const s = sz * W + sx;
  dist[s] = 0;
  heap.push(s, 0);
  while (heap.size) {
    const i = heap.pop();
    const x = i % W, z = (i - x) / W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= W - 1 || nz >= W - 1) continue;
      const n = nz * W + nx;
      const d = dist[i] + cost(n);
      if (d < dist[n]) { dist[n] = d; from[n] = i; heap.push(n, d); }
    }
  }
  return { dist, from };
}

/**
 * The guided run's goal site + trail-side crates (see generateWorld). Sets world.guided = { site, route } (route:
 * [x, z] tile centres from the Relay to the site) and adds containers { …, guided: true, yield } with ids g0…
 */
function guidedRoute(world, sites, districtKeys, occupied, rng) {
  const W = world.size, V = W + 1, L = world.level, B = world.brush;
  const R = GUIDE.routeCrates;
  const gi = districtKeys.indexOf(GUIDE.district);
  const cx = world.center.x, cz = world.center.z;
  const [g0, g1] = GUIDE.objectiveDist;
  const dOf = (s) => Math.hypot(s.x - cx, s.z - cz);
  // In range first (major before minor, nearest the middle of the range), else the closest one out of range.
  const cand = sites.filter((s) => s.region === gi && !s.lost && (s.type === 'major' || s.type === 'minor'));
  if (gi < 0 || !cand.length) return;
  const off = (s) => Math.max(0, g0 - dOf(s), dOf(s) - g1);
  cand.sort((a, b) => off(a) - off(b) || (a.type === 'major' ? 0 : 1) - (b.type === 'major' ? 0 : 1) || Math.abs(dOf(a) - (g0 + g1) / 2) - Math.abs(dOf(b) - (g0 + g1) / 2));
  const site = cand[0];
  // Cheapest walk from the Relay to the site, strongly preferring trail tiles (deep water is out).
  const lvMin = (x, z) => Math.min(L[z * V + x], L[z * V + x + 1], L[(z + 1) * V + x], L[(z + 1) * V + x + 1]);
  const cost = (i) => (world.deep[i] ? 1e6 : world.trail[i] ? 1 : B[i] >= BRUSH.thicket ? 9 : 4);
  const { from } = dijkstraTiles(W, cost, Math.floor(cx), Math.floor(cz));
  const route = [];
  for (let i = Math.floor(site.z) * W + Math.floor(site.x); i >= 0 && route.length < W * 4; i = from[i]) route.push(i);
  route.reverse();
  world.guided = { site: site.id, route: route.map((i) => [(i % W) + 0.5, Math.floor(i / W) + 0.5]) };
  if (route.length < 8) return;
  let side = rng.chance(0.5) ? 1 : -1;
  // Crates every R.every tiles of walking from R.first on (the route is 4-connected: one tile per step), up to
  // R.max, none in the last R.endGap tiles (the site has its own). Each sits on the first free tile off the
  // trail's edge, on alternating sides.
  for (let k = 0; k < R.max; k++) {
    const want = R.first + k * R.every;
    if (want > route.length - 1 - R.endGap) break;
    let spot = null, ax = 0, az = 0;
    for (const shift of [0, 2, -2, 4, -4, 6]) {
      const at = Math.min(route.length - 3, Math.max(2, want + shift));
      ax = route[at] % W; az = Math.floor(route[at] / W);
      const bx = route[at + 2] % W, bz = Math.floor(route[at + 2] / W);
      const dl = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / dl, nz = (bx - ax) / dl;   // perpendicular to the route here
      for (const sd of [side, -side]) {
        for (let d = R.side[0]; d <= R.side[1] && !spot; d += 0.5) {
          const tx = Math.floor(ax + 0.5 + nx * d * sd), tz = Math.floor(az + 0.5 + nz * d * sd);
          if (tx < 2 || tz < 2 || tx >= W - 2 || tz >= W - 2) continue;
          const i = tz * W + tx;
          if (world.trail[i]) continue;   // still on the trail: step further out
          if (occupied[i] || world.deep[i] || world.site[i] >= 0 || lvMin(tx, tz) <= LEVEL.mud) break;
          spot = { tx, tz, i };
        }
        if (spot) break;
      }
      if (spot) break;
    }
    side = -side;
    if (!spot) continue;
    // A cleared nook: no brush on the crate's tile or between it and the trail.
    const n = Math.ceil(Math.hypot(spot.tx - ax, spot.tz - az) * 2);
    for (let s = 0; s <= n; s++) {
      const x = Math.floor(ax + 0.5 + ((spot.tx - ax) * s) / n), z = Math.floor(az + 0.5 + ((spot.tz - az) * s) / n);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const j = (z + dz) * W + x + dx;
        if (Math.abs(dx) + Math.abs(dz) <= 1 && !world.trail[j]) B[j] = BRUSH.none;
      }
    }
    occupied[spot.i] = 1;
    world.containers.push({ id: `g${k}`, type: R.types[k] || 'crate', x: spot.tx + 0.5, z: spot.tz + 0.5, site: -1, region: world.region[spot.i], guided: true, yield: R.yield });
  }
}

/** The run's world (generation takes ~150 ms and never changes within a run, so it is cached on the game). */
export function worldForRun(game, run, districtKeys) {
  const guided = !!run.guided;
  if (game._jungle?.seed !== run.seed || game._jungle.guided !== guided) game._jungle = { seed: run.seed, guided, data: generateWorld(run.seed, districtKeys, { guided }) };
  return game._jungle.data;
}

/** Compass word for a direction on the map (screen up = north). */
export function compass(dx, dz) {
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return names[((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8];
}

/** Remove brush in a disc (used for site centres and objective props). */
export function clearDisc(world, x, z, r) {
  const W = world.size;
  for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
    if (tx < 0 || tz < 0 || tx >= W || tz >= W) continue;
    if (Math.hypot(tx + 0.5 - x, tz + 0.5 - z) <= r + 0.3) world.brush[tz * W + tx] = 0;
  }
}

/** Two-pass chamfer distance transform (in tiles) over a W×W field: 0 at sources, large elsewhere. */
function chamfer(d, W) {
  const D = 1.414;
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (z > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + D); if (x < W - 1) v = Math.min(v, d[i - W + 1] + D); }
    d[i] = v;
  }
  for (let z = W - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
    const i = z * W + x;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
    if (z < W - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + D); if (x > 0) v = Math.min(v, d[i + W - 1] + D); }
    d[i] = v;
  }
}

/** Lower vertices until every 8-neighbour pair differs by ≤ 1 level. */
function smoothLevels(L, V) {
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let z = 0; z < V; z++) {
      for (let x = 0; x < V; x++) {
        const i = z * V + x;
        let lo = 99;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= V || zz >= V) continue;
          lo = Math.min(lo, L[zz * V + xx]);
        }
        if (L[i] > lo + 1) { L[i] = lo + 1; changed = true; }
      }
    }
    if (!changed) break;
  }
}

/** A* over a W×W cost grid (8-way). Returns [[x, z], …] tile centres or null. */
function astar(W, cost, sx, sz, tx, tz) {
  sx = Math.max(0, Math.min(W - 1, sx)); sz = Math.max(0, Math.min(W - 1, sz));
  tx = Math.max(0, Math.min(W - 1, tx)); tz = Math.max(0, Math.min(W - 1, tz));
  const N = W * W;
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  const start = sz * W + sx, goal = tz * W + tx;
  g[start] = 0;
  heap.push(start, 0);
  const h = (i) => Math.hypot((i % W) - tx, Math.floor(i / W) - tz);
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const x = cur % W, z = (cur - x) / W;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
      const n = nz * W + nx;
      if (closed[n]) continue;
      const ng = g[cur] + cost[n] * (dx && dz ? 1.414 : 1);
      if (ng < g[n]) { g[n] = ng; from[n] = cur; heap.push(n, ng + h(n) * 1.05); }
    }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const out = [];
  for (let i = goal; i >= 0; i = from[i]) { out.push([(i % W) + 0.5, Math.floor(i / W) + 0.5]); if (i === start) break; }
  return out.reverse();
}

/** Moving-average smoothing of a tile path, resampled every half tile. */
function smooth(path, k) {
  const pts = path.map((_, i) => {
    let sx = 0, sz = 0, n = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(path.length - 1, i + k); j++) { sx += path[j][0]; sz += path[j][1]; n++; }
    return [sx / n, sz / n];
  });
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 0.5));
    for (let s = 0; s < n; s++) out.push([ax + (bx - ax) * s / n, az + (bz - az) * s / n]);
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
