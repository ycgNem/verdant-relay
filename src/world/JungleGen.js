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
//     sites           [{ id, type, region, x, z, r, ruins }]   points of interest
//     containers      [{ id, type, x, z, site, hidden }]        world loot (opened ones persist in the run)
//     pylons          [{ id, x, z, region }]                    extraction relays (activated ones persist)
//
// Generation order: regions → water (rivers, ponds) → sites → trails between them → base ground →
// level smoothing (banks) → undergrowth → trees → site dressing (ruins, paving) → containers.
// Everything is deterministic for (seed, districtKeys).

import { makeRng, subSeed } from '../core/rng.js';
import { makeNoise, hash2 } from './noise.js';
import { JUNGLE, LEVEL, BRUSH, REGION_LOOK } from '../data/jungle.js';

const TAU = Math.PI * 2;

export function generateWorld(seed, districtKeys) {
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
  for (let r = 0; r < J.rivers; r++) {
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

  // ---------------------------------------------------------------- trails (A* between sites, wiggly cost)
  const nodes = [{ x: cx, z: cz }, ...sites];
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
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    cost[z * W + x] = 1 + nC.fbm(x * 0.09, z * 0.09, 3) * J.trailWobble * 2 + (isWaterTile(x, z) ? 9 : 0);
  }
  const trailVerts = new Float32Array(V * V).fill(99);   // distance to the nearest trail centreline
  const trailHalf = new Float32Array(V * V);
  for (const [a, b] of edges) {
    const path = astar(W, cost, Math.floor(nodes[a].x), Math.floor(nodes[a].z), Math.floor(nodes[b].x), Math.floor(nodes[b].z));
    if (!path) continue;
    const half = J.trailWidth[0] + rng.next() * (J.trailWidth[1] - J.trailWidth[0]);
    // Smooth the tile path into a polyline, then rasterise its width onto the vertices.
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
  }

  // ---------------------------------------------------------------- base ground levels
  const L = world.level;
  for (let z = 0; z <= W; z++) {
    for (let x = 0; x <= W; x++) {
      const i = z * V + x;
      let lv = nA.fbm(x * 0.06 + 7, z * 0.06 - 3, 4) > 0.5 ? LEVEL.moss : LEVEL.floor;
      // Patchy bare soil in the floor.
      if (lv === LEVEL.floor && nC.fbm(x * 0.11 - 20, z * 0.11, 3) > 0.66) lv = LEVEL.dirt;
      const dc = Math.hypot(x - cx, z - cz);
      if (dc < J.relayClearing) lv = dc < J.relayClearing - 3 ? LEVEL.dirt : Math.min(lv, LEVEL.floor);
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

  // ---------------------------------------------------------------- undergrowth
  const B = world.brush;
  for (let z = 0; z < W; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const tx = x + 0.5, tz = z + 0.5;
      if (tileLevelMin(x, z) <= LEVEL.mud && tileLevelAvg(x, z) < 1) continue;   // water / deep mud: open
      if (Math.hypot(tx - cx, tz - cz) < J.relayClearing) continue;
      if (world.site[i] >= 0) {
        // Sites are mostly clear: a few ferns.
        if (hash2(x, z, 11) < 0.12) B[i] = BRUSH.fern;
        continue;
      }
      const look = REGION_LOOK[regionKey(world.region[i])] || {};
      const dens = nA.fbm(x * 0.13 - 50, z * 0.13 + 22, 4) + (look.brushBias || 0) + (hash2(x, z, 3) - 0.5) * 0.08;
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
      // The trunk's own tile has no brush.
      B[i] = BRUSH.none;
    }
  }

  // ---------------------------------------------------------------- site dressing: ruins + props
  for (const s of sites) {
    const look = REGION_LOOK[regionKey(s.region)] || REGION_LOOK.overgrown_market;
    if (s.type === 'major' || s.type === 'minor' || s.type === 'landmark') {
      const n = s.type === 'major' ? rng.int(4, 6) : s.type === 'minor' ? rng.int(2, 3) : 1;
      for (let k = 0; k < n; k++) {
        const a = rng.next() * TAU;
        const d = s.type === 'landmark' ? 0 : s.r * (0.55 + rng.next() * 0.35);
        const x = Math.round((s.x + Math.cos(a) * d) * 32) / 32, z = Math.round((s.z + Math.sin(a) * d) * 32) / 32;
        const type = s.type === 'landmark' ? rng.pick(['statue', 'mast', 'greenhouse']) : rng.pick(look.ruins).replace('ruin_', '');
        if (objects.some((o) => o.kind === 'ruin' && Math.hypot(o.x - x, o.z - z) < 3)) continue;
        objects.push({ id: `o${oid++}`, kind: 'ruin', type, x, z, r: 0, flip: rng.chance(0.5), site: s.idx });
        markCircle(x, z, 1.5);
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
    const type = rng.pick(['boulder', 'boulder', 'log', 'stump']);
    objects.push({ id: `o${oid++}`, kind: 'rock', type, x: Math.round(x * 32) / 32, z: Math.round(z * 32) / 32, r: type === 'log' ? 0.5 : 0.45, flip: rng.chance(0.5) });
    markCircle(x, z, 0.8);
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
        } else {
          objects.push({ id: `o${oid++}`, kind: 'rock', type: r < 0.75 ? 'boulder' : 'log', x: px, z: pz, r: 0.45, flip: rng.chance(0.5) });
          markCircle(px, pz, 0.7);
        }
        break;
      }
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
    const n = rng.int(a, b);
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
      B[i] = BRUSH.none;   // a little hollow in the brush
      occupied[i] = 1;
      world.containers.push({ id: `c${cid++}`, type: rng.weighted(J.hiddenWeights), x: tx + 0.5, z: tz + 0.5, site: -1, region: world.region[i], hidden: true });
      break;
    }
  }
  world.occupied = occupied;

  // Make sure the Relay clearing and every site/pylon are clear of brush at their centres.
  for (const s of sites) clearDisc(world, s.x, s.z, s.type === 'pylon' ? 1.6 : 1.2);
  return world;
}

/** The run's world (generation takes ~150 ms and never changes within a run, so it is cached on the game). */
export function worldForRun(game, run, districtKeys) {
  if (game._jungle?.seed !== run.seed) game._jungle = { seed: run.seed, data: generateWorld(run.seed, districtKeys) };
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
