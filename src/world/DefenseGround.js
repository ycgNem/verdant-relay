// The night map's ground and jungle, built with the same renderer as the day jungle so both halves of
// the game look alike: a square "world" around the defense field (TerrainBaker blends its terrain,
// FloraAtlas cards draw the plants and trees) — worn dirt trails where the lanes run (ruts, mud puddles,
// stones, like the day's trails), a paved plaza under the Relay, open jungle floor on the field, an optional
// stream crossed on plank bridges (map.stream, laneBridges), and a wall of jungle all around.
//
// Lanes stay clear (critic K §4.1): no card (tree, ruin, plant) may cover a lane — every card is tested
// texel by texel against the screen area an enemy on a lane tile (or the Relay) can occupy, and dropped when
// an opaque texel of it would draw IN FRONT of that area. The old map hid a third of the south lane (and the
// boss's charge) behind trees.
//
// Build anywhere (Stage 9): every field tile is a place a tower may stand. Each kept card records the field
// tiles whose tower it would draw in front of (`c.tiles`): a tree or rock blocks those tiles (blockAt → 'tree' /
// 'rock'), plants are cleared when a tower is built there (setTowers rebuilds the card mesh without them).
//
// Defense tile (x, y) maps to world tile (x − X0, y − Z0); the meshes sit in a group offset by (X0, Z0),
// so everything lines up with DefenseScene's coordinates.

import * as THREE from 'three';
import { DEFENSE_VIEW } from '../data/defenseMap.js';
import { LEVEL, BRUSH, BRIDGE_LOOK } from '../data/jungle.js';
import { makeNoise, hash2 } from './noise.js';
import { TerrainBaker, drawBridge } from './TerrainBaker.js';
import { FloraAtlas } from './FloraAtlas.js';
import { makeCardMaterial, chunkCards, cardMesh } from './JungleWorld.js';

const S = 64;               // world tiles per side (4 × 4 bake chunks of 16)
const X0 = -20, Z0 = -24;   // defense coords of world tile (0, 0): the 23 × 15 field sits near the middle
export const GROUND = { size: S, x0: X0, z0: Z0 };

// Screen area (in tiles, relative to the thing's ground point) that must never be covered by a card:
// an enemy walking a lane tile (the tallest is the Colossus, ~3.5 tiles; its feet jitter ±0.25),
// a tower on its pad (48 × 64 art later: 2 tiles tall), the Relay sprite.
const KEEP = {
  enemy: { x0: -0.35, x1: 1.35, up: 2.6, down: 0.15 },
  pad: { x0: -0.35, x1: 1.35, up: 2.4, down: 1.35 },
  tower: { x0: -0.3, x1: 1.3, up: 2.1, down: 0.5 },    // a tower on its tile (48 × 64 art, its foot at the tile centre; a low rock may hide the footing)
};

/**
 * @param map   a DEFENSE_MAPS entry
 * @param opts  { seed, laneTiles: Set("x,y") incl. the off-field trail, pads: [{x, z}] (legacy pad centres, kept
 *              clear), towers: [{x, y}] (built towers: plants over them are cleared), tint }
 * Returns { group, world, stats, patch, update, dispose, blockAt(x, y) → 'tree' | 'rock' | 'water' | null,
 *           setTowers([{x, y}]) }.
 */
export function buildDefenseGround(game, map, { seed, laneTiles, pads = [], towers = [], tint }) {
  const W = map.width, H = map.height, V = S + 1;
  const n = makeNoise(seed ^ 0x2468);
  const isLane = (x, y) => laneTiles.has(`${x},${y}`);
  const pl = map.plaza;
  const inPlaza = (x, y) => x >= pl.x0 && x <= pl.x1 && y >= pl.y0 && y <= pl.y1;
  const inField = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  // Distance (tiles, Chebyshev) from each world tile to the nearest lane tile, capped at 4.
  const laneDist = new Uint8Array(S * S).fill(9);
  for (const k of laneTiles) {
    const [lx, ly] = k.split(',').map(Number);
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const tx = lx + dx - X0, tz = ly + dz - Z0;
      if (tx < 0 || tz < 0 || tx >= S || tz >= S) continue;
      const i = tz * S + tx;
      laneDist[i] = Math.min(laneDist[i], Math.max(Math.abs(dx), Math.abs(dz)));
    }
  }
  const nearLane = (x, y) => { const tx = x - X0, tz = y - Z0; return tx < 0 || tz < 0 || tx >= S || tz >= S ? 9 : laneDist[tz * S + tx]; };
  const padNear = (x, y, r) => pads.some((p) => Math.abs(p.x - (x + 0.5)) < r && Math.abs(p.z - (y + 0.5)) < r + 0.3);

  const world = {
    seed, size: S, center: { x: S / 2, z: S / 2 },
    level: new Uint8Array(V * V), pave: new Uint8Array(V * V), brush: new Uint8Array(S * S),
    deep: new Uint8Array(S * S), ford: new Uint8Array(S * S),
    objects: [],
    blendAmp: 0.5,
  };

  // ---- the stream (map.stream, defense coords): distance from a world vertex to its polyline.
  const streamD = (vx, vz) => {
    const P = map.stream;
    if (!P) return 99;
    const x = vx + X0, y = vz + Z0;
    let best = 99;
    for (let i = 1; i < P.length; i++) {
      const [ax, ay] = P[i - 1], [bx, by] = P[i];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    }
    return best + (n.value(vx * 0.4, vz * 0.4) - 0.5) * 0.5;
  };

  // ---- vertex levels: a vertex takes the "highest priority" surface of the tiles that touch it.
  for (let vz = 0; vz <= S; vz++) {
    for (let vx = 0; vx <= S; vx++) {
      const x = vx + X0, y = vz + Z0;
      const touch = [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]];
      const outside = touch.every(([tx, ty]) => !inField(tx, ty));
      let lv = outside && n.fbm(vx * 0.12, vz * 0.12, 3) > 0.6 ? LEVEL.floor : LEVEL.moss;
      if (!outside && n.fbm(vx * 0.2 + 9, vz * 0.2, 2) > 0.66) lv = LEVEL.floor;   // leaf-floor patches on the field
      if (touch.filter(([tx, ty]) => isLane(tx, ty)).length >= 2) lv = LEVEL.dirt;
      else if (touch.some(([tx, ty]) => isLane(tx, ty))) lv = Math.min(lv, LEVEL.floor);
      if (touch.some(([tx, ty]) => inPlaza(tx, ty) && !isLane(tx, ty))) { lv = LEVEL.dirt; world.pave[vz * V + vx] = 1; }
      const sd = streamD(vx, vz);
      if (sd < 0.75) lv = LEVEL.water;
      else if (sd < 1.6) lv = Math.min(lv, LEVEL.mud);
      world.level[vz * V + vx] = lv;
    }
  }
  // Neighbouring vertices may differ by at most one level (the Wang sets join consecutive levels): lower
  // anything that sits too high above a neighbour (only matters around the stream).
  for (let pass = 0; pass < 4; pass++) {
    for (let vz = 0; vz <= S; vz++) for (let vx = 0; vx <= S; vx++) {
      const i = vz * V + vx;
      let m = 9;
      if (vx > 0) m = Math.min(m, world.level[i - 1]);
      if (vx < S) m = Math.min(m, world.level[i + 1]);
      if (vz > 0) m = Math.min(m, world.level[i - V]);
      if (vz < S) m = Math.min(m, world.level[i + V]);
      if (world.level[i] > m + 1) world.level[i] = m + 1;
    }
  }
  // Bridges (Stage 9, like the day jungle's): each run of lane tiles over the stream gets a plank bridge along the
  // lane, BRIDGE_LOOK.lane tiles wider than the lane on each side (drawn after wearLanes, below).
  const bridges = laneBridges(world, laneTiles);

  // ---- undergrowth: a wall of jungle outside the field, a few plants on it.
  for (let tz = 0; tz < S; tz++) {
    for (let tx = 0; tx < S; tx++) {
      const x = tx + X0, y = tz + Z0, i = tz * S + tx;
      const ld = nearLane(x, y);
      if (ld === 0 || inPlaza(x, y)) continue;
      const corner = [world.level[tz * V + tx], world.level[tz * V + tx + 1], world.level[(tz + 1) * V + tx], world.level[(tz + 1) * V + tx + 1]];
      if (corner.some((l) => l <= LEVEL.mud)) { if (hash2(tx, tz, 61) < 0.25 && corner.every((l) => l >= LEVEL.mud)) world.brush[i] = BRUSH.fern; continue; }
      if (inField(x, y)) {
        // Open floor with a few plants, never right beside a lane or a pad.
        if (ld < 2 || padNear(x, y, 1.6)) continue;
        const r = hash2(tx, tz, 7);
        world.brush[i] = r < 0.07 ? BRUSH.fern : r < 0.1 && ld >= 3 ? BRUSH.thicket : 0;
        continue;
      }
      // Outside: the trail keeps a clear verge (ferns only), then the wall.
      if (ld === 1) { world.brush[i] = hash2(tx, tz, 3) < 0.45 ? BRUSH.fern : 0; continue; }
      const edge = Math.min(x < 0 ? -x : x >= W ? x - W + 1 : 99, y < 0 ? -y : y >= H ? y - H + 1 : 99);
      if (edge <= 1) { world.brush[i] = hash2(tx, tz, 4) < 0.6 ? BRUSH.fern : 0; continue; }
      world.brush[i] = ld === 2 && hash2(tx, tz, 5) < 0.6 ? BRUSH.fern : n.fbm(tx * 0.2, tz * 0.2, 2) > 0.62 ? BRUSH.bramble : BRUSH.thicket;
    }
  }
  for (const [x, y] of map.bushes || []) {
    const tx = x - X0, tz = y - Z0;
    if (!isLane(x, y) && tx >= 0 && tz >= 0 && tx < S && tz < S) world.brush[tz * S + tx] = BRUSH.fern;
  }

  // ---- trees and rocks (the card filter below drops any that would cover a lane, a pad or the Relay)
  const types = ['kapok', 'fig', 'palm', 'dead'];
  let oid = 0;
  const tree = (x, z) => world.objects.push({ id: `d${oid++}`, kind: 'tree', type: types[Math.floor(hash2(Math.floor(x * 7), Math.floor(z * 7), 9) * types.length)], x: Math.round((x - X0) * 32) / 32, z: Math.round((z - Z0) * 32) / 32, big: false, flip: hash2(Math.floor(x), Math.floor(z), 1) < 0.5 });
  for (const [x, y] of map.trees || []) tree(x + 0.5, y + 0.5);
  for (const [x, y] of map.rubble || []) {
    if (isLane(x, y)) continue;
    world.objects.push({ id: `d${oid++}`, kind: 'rock', type: hash2(x, y, 2) < 0.6 ? 'boulder' : 'log', x: x + 0.5 - X0, z: y + 0.5 - Z0, flip: hash2(x, y, 3) < 0.5 });
  }
  for (let k = 0; k < 420; k++) {
    const x = X0 + 0.5 + hash2(k, 1, 77) * (S - 1), z = Z0 + 0.5 + hash2(k, 2, 77) * (S - 1);
    if (x > -0.8 && x < W + 0.3 && z > -0.6 && z < H + 0.4) continue;    // outside the field only
    if (nearLane(Math.floor(x), Math.floor(z)) <= 1) continue;          // never on a trail
    if (world.objects.some((o) => Math.hypot(o.x + X0 - x, o.z + Z0 - z) < 2.2)) continue;
    tree(x, z);
  }

  // ---- ground texture (4 × 4 baked chunks)
  const baker = new TerrainBaker(world, game.assets, game.assets.terrainArt || null);
  // No square slab / brick decals on the night field: since build anywhere they read as the old build pads (critic P).
  for (const k of Object.keys(baker.decals || {})) baker.decals[k] = baker.decals[k].filter((d) => !/slab|bricks/.test(d.name));
  const C = S / 16;
  const big = document.createElement('canvas');
  big.width = big.height = S * 32;
  const g = big.getContext('2d', { willReadFrequently: true });
  for (let cz = 0; cz < C; cz++) for (let cx = 0; cx < C; cx++) g.drawImage(baker.bake(cx, cz), cx * 512, cz * 512);
  wearLanes(g, game.assets, baker, map, laneTiles, seed);
  if (bridges.length) {
    const img = g.getImageData(0, 0, big.width, big.height);
    for (const b of bridges) drawBridge(img.data, big.width, 0, 0, b, seed, () => 1);
    g.putImageData(img, 0, 0);
    world.bridges = bridges;
  }
  // The field reads as the playable area: the margin is a touch darker (a 2-step dithered edge).
  {
    const fx0 = -X0 * 32, fz0 = -Z0 * 32, fx1 = (W - X0) * 32, fz1 = (H - Z0) * 32;
    const img = g.getImageData(0, 0, big.width, big.height);
    const D = img.data;
    const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let py = 0; py < big.height; py++) {
      for (let px = 0; px < big.width; px++) {
        const dx = Math.max(fx0 - px, px - fx1 + 1, 0), dz = Math.max(fz0 - py, py - fz1 + 1, 0);
        const d = Math.max(dx, dz);
        if (d <= 0) continue;
        const t = Math.min(1, d / 48);   // fades in over 1.5 tiles
        const k = t * 2 + B4[(py & 3) * 4 + (px & 3)] / 16 > 1 ? 0.72 : 0.86;
        const o = (py * big.width + px) * 4;
        D[o] *= k; D[o + 1] *= k; D[o + 2] *= k;
      }
    }
    g.putImageData(img, 0, 0);
  }
  // Plaza hazard border (amber/dark stripes) around the Relay.
  {
    const x0 = (pl.x0 - X0) * 32, y0 = (pl.y0 - Z0) * 32, x1 = (pl.x1 + 1 - X0) * 32, y1 = (pl.y1 + 1 - Z0) * 32;
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const e = Math.min(px - x0, x1 - 1 - px, py - y0, y1 - 1 - py);
      if (e >= 3 || isLane(Math.floor(px / 32) + X0, Math.floor(py / 32) + Z0)) continue;
      g.fillStyle = ((px + py) >> 2) % 2 ? '#a88a3a' : '#2a2633';
      g.fillRect(px, py, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(big);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geom = new THREE.PlaneGeometry(S, S);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const ground = new THREE.Mesh(geom, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(S / 2, 0, S / 2);
  ground.userData.noSnap = true;

  // ---- cards, minus any that would cover a lane, a pad or the Relay
  const atlas = new FloraAtlas(game.assets);
  const cmat = makeCardMaterial(atlas.texture);
  cmat.uniforms.uTint.value.set(tint);
  cmat.uniforms.uPlayerZ.value = 1e9;   // no see-through window at night
  const all = chunkCards(world, atlas, null, 0, 0, S, S);
  const keep = keepZones(map, laneTiles, pads);
  const cards = all.filter((c) => !coversKeep(c, atlas, keep));
  // Build anywhere: which field tiles each card would hide a tower on; trees and rocks block those tiles.
  const tileKeep = towerZones(map);
  const block = new Map();   // tile index → 'tree' | 'rock' | 'water'
  for (const c of cards) {
    c.tiles = coveredTiles(c, atlas, tileKeep);
    if (c.kind === 2 || c.kind === 3) for (const t of c.tiles) if (!block.has(t)) block.set(t, c.kind === 2 ? 'tree' : 'rock');
  }
  for (const [x, y] of map.trees || []) if (inField(x, y)) block.set(y * W + x, 'tree');
  for (const [x, y] of map.rubble || []) if (inField(x, y)) block.set(y * W + x, 'rock');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = x - X0, tz = y - Z0;
    const c = [world.level[tz * V + tx], world.level[tz * V + tx + 1], world.level[(tz + 1) * V + tx], world.level[(tz + 1) * V + tx + 1]];
    if (c.some((l) => l === LEVEL.water)) block.set(y * W + x, 'water');
  }
  let cardsMesh = null;
  const group = new THREE.Group();
  group.position.set(X0, 0, Z0);
  group.add(ground);
  // The card mesh minus every card that would hide a built tower (rebuilt when towers change).
  let towerKey = null;
  const setTowers = (list) => {
    const on = new Set(list.map((t) => t.y * W + t.x));
    const key = [...on].sort((a, b) => a - b).join(',');
    if (key === towerKey) return;
    towerKey = key;
    if (cardsMesh) { group.remove(cardsMesh); cardsMesh.geometry.dispose(); }
    cardsMesh = cardMesh(on.size ? cards.filter((c) => !c.tiles.some((t) => on.has(t))) : cards, atlas, cmat);
    group.add(cardsMesh);
  };
  setTowers(towers);
  return {
    group, world,
    stats: { cards: all.length, dropped: all.length - cards.length },
    blockAt: (x, y) => (inField(x, y) ? block.get(y * W + x) || null : null),
    setTowers,
    // The baked ground under a rectangle of defense-space texels (32 per tile) as RGBA bytes, or null off the canvas
    // (Fx.decal stains splats into it, critic H2 §7).
    patch(tx, tz, w, h) {
      const x = tx - X0 * 32, y = tz - Z0 * 32;
      if (x < 0 || y < 0 || x + w > big.width || y + h > big.height) return null;
      return g.getImageData(x, y, w, h).data;
    },
    update(dt) { cmat.uniforms.uTime.value += dt; },
    dispose() {
      group.removeFromParent();
      tex.dispose(); geom.dispose(); mat.dispose();
      cardsMesh?.geometry.dispose(); cmat.dispose(); atlas.texture.dispose();
    },
  };
}

// ------------------------------------------------------------------ bridges over the stream

/**
 * Plank bridges where lanes cross water (Stage 9): every 4-connected group of lane tiles with water at a corner is
 * one deck (world tiles, TerrainBaker's bridge format) along the lane, BRIDGE_LOOK.lane tiles wider than the lane on
 * both sides. Marks the deck tiles in world.ford.
 */
function laneBridges(world, laneTiles) {
  const V = S + 1, L = world.level, wet = new Set();
  for (const k of laneTiles) {
    const [lx, ly] = k.split(',').map(Number);
    const tx = lx - X0, tz = ly - Z0;
    if (tx < 0 || tz < 0 || tx >= S || tz >= S) continue;
    if (Math.min(L[tz * V + tx], L[tz * V + tx + 1], L[(tz + 1) * V + tx], L[(tz + 1) * V + tx + 1]) === LEVEL.water) wet.add(k);
  }
  const out = [], seen = new Set(), over = BRIDGE_LOOK.lane;
  for (const k of wet) {
    if (seen.has(k)) continue;
    const comp = [], st = [k];
    seen.add(k);
    while (st.length) {
      const q = st.pop();
      comp.push(q.split(',').map(Number));
      const [x, y] = comp[comp.length - 1];
      for (const n of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) if (wet.has(n) && !seen.has(n)) { seen.add(n); st.push(n); }
    }
    const xs = comp.map((c) => c[0]), ys = comp.map((c) => c[1]);
    const x0 = Math.min(...xs) - X0, x1 = Math.max(...xs) + 1 - X0, z0 = Math.min(...ys) - Z0, z1 = Math.max(...ys) + 1 - Z0;
    let ew = x1 - x0 > z1 - z0;
    if (x1 - x0 === z1 - z0) ew = laneTiles.has(`${x0 + X0 - 1},${z0 + Z0}`) || laneTiles.has(`${x1 + X0},${z0 + Z0}`);
    out.push(ew ? { id: `nb${out.length}`, axis: 'ew', x0, x1, z0: z0 - over, z1: z1 + over } : { id: `nb${out.length}`, axis: 'ns', x0: x0 - over, x1: x1 + over, z0, z1 });
    for (const [x, y] of comp) world.ford[(y - Z0) * S + x - X0] = 1;
  }
  return out;
}

// ------------------------------------------------------------------ keeping lanes clear

/** Protected screen areas, bucketed per screen tile: { grid: Map("sx,sy" → [{x0,x1,y0,y1,z}]) } (defense coords). */
function keepZones(map, laneTiles, pads) {
  const zones = [];
  for (const k of laneTiles) {
    const [lx, ly] = k.split(',').map(Number);
    if (lx < -2 || ly < -3 || lx > map.width + 1 || ly > map.height + 1) continue;   // the far off-field trail can hide
    const E = KEEP.enemy;
    zones.push({ x0: lx + E.x0, x1: lx + E.x1, y0: ly + 0.5 - E.up, y1: ly + 0.5 + E.down, z: ly + 0.5 });
  }
  for (const p of pads) {
    const P = KEEP.pad;
    zones.push({ x0: p.x - 0.5 + P.x0, x1: p.x - 0.5 + P.x1, y0: p.z - P.up, y1: p.z - 0.5 + P.down, z: p.z - 0.5 });
  }
  const c = map.core;
  zones.push({ x0: c.x - 2.2, x1: c.x + 2.2, y0: c.y - 4.8, y1: c.y + 0.4, z: c.y - 0.6 });
  const pl = map.plaza;
  zones.push({ x0: pl.x0, x1: pl.x1 + 1, y0: pl.y0 - 1, y1: pl.y1 + 1, z: pl.y0 });
  const grid = new Map();
  for (const zn of zones) {
    for (let sy = Math.floor(zn.y0); sy <= Math.floor(zn.y1); sy++) for (let sx = Math.floor(zn.x0); sx <= Math.floor(zn.x1); sx++) {
      const key = `${sx},${sy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(zn);
    }
  }
  return { grid };
}

/** A protected area per field tile (a tower standing there), bucketed like keepZones; zone.id = tile index. */
function towerZones(map) {
  const grid = new Map();
  const T = KEEP.tower;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const zn = { id: y * map.width + x, x0: x + T.x0, x1: x + T.x1, y0: y + 0.5 - T.up, y1: y + T.down, z: y };
    for (let sy = Math.floor(zn.y0); sy <= Math.floor(zn.y1); sy++) for (let sx = Math.floor(zn.x0); sx <= Math.floor(zn.x1); sx++) {
      const key = `${sx},${sy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(zn);
    }
  }
  return { grid };
}

/** The ids of every zone of `keep` that card `c` draws an opaque texel in front of (see coversKeep). */
function coveredTiles(c, atlas, keep) {
  const e = c.e;
  if (!e.ay) return [];
  const cx = c.x + X0, cz = c.z + Z0;
  const left = cx - e.ax / 32;
  const bx0 = Math.floor(left - 0.1), bx1 = Math.floor(left + e.w / 32 + 0.1), by0 = Math.floor(cz - e.ay / 32), by1 = Math.floor(cz);
  let any = false;
  for (let sy = by0; sy <= by1 && !any; sy++) for (let sx = bx0; sx <= bx1 && !any; sx++) {
    const list = keep.grid.get(`${sx},${sy}`);
    if (list && list.some((zn) => zn.z < cz - 0.02)) any = true;
  }
  if (!any) return [];
  const out = new Set();
  const mask = alphaMask(atlas, e);
  for (let ty = 0; ty < e.ay; ty += 2) {
    const sy = cz - (e.ay - ty) / 32;
    for (let tx = 0; tx < e.w; tx += 2) {
      const mx = c.flip ? e.w - 1 - tx : tx;
      if (!mask[ty * e.w + mx]) continue;
      const sx = left + tx / 32;
      const list = keep.grid.get(`${Math.floor(sx)},${Math.floor(sy)}`);
      if (!list) continue;
      for (const zn of list) {
        if (zn.z >= cz - 0.02 || out.has(zn.id)) continue;
        if (sx >= zn.x0 && sx <= zn.x1 && sy >= zn.y0 && sy <= zn.y1) out.add(zn.id);
      }
    }
  }
  return [...out];
}

const alphaCache = new WeakMap();
/** Opaque mask of an atlas entry (1 byte per texel). */
function alphaMask(atlas, e) {
  let m = alphaCache.get(e);
  if (m) return m;
  const img = atlas.g.getImageData(e.x, e.y, e.w, e.h).data;
  m = new Uint8Array(e.w * e.h);
  for (let i = 0; i < m.length; i++) m[i] = img[i * 4 + 3] > 127 ? 1 : 0;
  alphaCache.set(e, m);
  return m;
}

/**
 * Would card `c` (world-tile coords: c.x, c.z; atlas entry c.e) draw an opaque texel in front of a protected
 * area? Upright texel (tx, ty) lands on screen at (left + tx/32, z − (ay − ty)/32) in ground tiles, and is in
 * front of anything standing further north (smaller z). Sway (≤ 2 px) is covered by a 2-texel margin.
 */
function coversKeep(c, atlas, keep) {
  const e = c.e;
  if (!e.ay) return false;
  const cx = c.x + X0, cz = c.z + Z0;   // defense coords
  const left = cx - e.ax / 32;
  // Quick reject: no protected area under the card's box.
  const bx0 = Math.floor(left - 0.1), bx1 = Math.floor(left + e.w / 32 + 0.1), by0 = Math.floor(cz - e.ay / 32), by1 = Math.floor(cz);
  let any = false;
  for (let sy = by0; sy <= by1 && !any; sy++) for (let sx = bx0; sx <= bx1 && !any; sx++) {
    const list = keep.grid.get(`${sx},${sy}`);
    if (list && list.some((zn) => zn.z < cz - 0.02)) any = true;
  }
  if (!any) return false;
  const mask = alphaMask(atlas, e);
  const m = 2 / 32;
  for (let ty = 0; ty < e.ay; ty += 2) {
    const sy = cz - (e.ay - ty) / 32;
    for (let tx = 0; tx < e.w; tx += 2) {
      const mx = c.flip ? e.w - 1 - tx : tx;
      if (!mask[ty * e.w + mx]) continue;
      const sx = left + tx / 32;
      const list = keep.grid.get(`${Math.floor(sx)},${Math.floor(sy)}`);
      if (!list) continue;
      for (const zn of list) {
        if (zn.z >= cz - 0.02) continue;   // the card stands behind it
        if (sx >= zn.x0 - m && sx <= zn.x1 + m && sy >= zn.y0 - m && sy <= zn.y1 + m) return true;
      }
    }
  }
  return false;
}

// ------------------------------------------------------------------ worn trails

/**
 * Wear on the lanes, drawn into the baked ground (1 texel = 1 pixel at 32 px per tile): two broken wheel
 * ruts (a dark groove with a lit lip on its north/west side), mud puddles, stones and footprints — only on
 * dirt texels, so the blended trail edge stays organic (DEFENSE_VIEW.wear).
 */
function wearLanes(g, assets, baker, map, laneTiles, seed) {
  const Wr = DEFENSE_VIEW.wear;
  const P = S * 32;
  const img = g.getImageData(0, 0, P, P);
  const D = img.data;
  const isDirt = (px, py) => px >= 0 && py >= 0 && px < P && py < P && baker._levelAt(px, py) === LEVEL.dirt;
  const shade = (px, py, k) => { const o = (py * P + px) * 4; D[o] *= k; D[o + 1] *= k; D[o + 2] *= k; };
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const done = new Uint8Array(P * P);   // centre band: each texel brightened once (corners overlap)
  for (const ln of map.lanes) {
    // The whole trail, including its off-field run (laneTiles has it; here: the segments + the lead-in).
    const pts = [[ln.points[0][0] - 12 * Math.sign(ln.points[1][0] - ln.points[0][0] || 0), ln.points[0][1] - 12 * Math.sign(ln.points[1][1] - ln.points[0][1] || 0)], ...ln.points];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const horiz = ay === by;
      const len = Math.abs(bx - ax) + Math.abs(by - ay);
      const sx = Math.sign(bx - ax), sy = Math.sign(by - ay);
      for (let s = 0; s <= len * 32; s++) {
        // Centre-line texel (world texels: defense coords − origin).
        const cx = Math.round((ax + 0.5 - X0) * 32 + sx * s), cy = Math.round((ay + 0.5 - Z0) * 32 + sy * s);
        // Trodden centre band: a touch lighter, its edge a 4×4 Bayer step (no blur).
        for (let o = -Wr.band - 2; o <= Wr.band + 2; o++) {
          const px = horiz ? cx : cx + o, py = horiz ? cy + o : cy;
          if (px < 0 || py < 0 || px >= P || py >= P || done[py * P + px] || !isDirt(px, py)) continue;
          const edge = (Math.abs(o) - Wr.band + 2) / 4;   // < 0 inside, 0..1 across the edge
          if (edge > 0 && B4[(py & 3) * 4 + (px & 3)] / 16 < edge) continue;
          done[py * P + px] = 1;
          // Compacted: the dark mottling is lifted toward one even, lighter tone (the trail reads at night).
          const q = (py * P + px) * 4, L = D[q] * 0.3 + D[q + 1] * 0.59 + D[q + 2] * 0.11;
          shade(px, py, Math.max(Wr.bandLight, Math.min(Wr.bandMax, Wr.bandTarget / Math.max(L, 1))));
        }
        // Two broken, wobbly wheel ruts: a 2-texel groove, darkest inside, with a lit lip toward the light.
        for (const side of [-1, 1]) {
          const run = Math.floor((s + hash2(i, side, seed + 40) * 40) / 14);
          if (hash2(run, side + 3 + i * 7, seed + 41) < Wr.rutGap) continue;
          const wob = Math.round(Math.sin((s + i * 37 + side * 11) / 13) * 1.2);
          const off = side * Wr.rutOffset + wob;
          const px = horiz ? cx : cx + off, py = horiz ? cy + off : cy;
          if (!isDirt(px, py)) continue;
          shade(px, py, 0.58);
          const qx = horiz ? px : px + side, qy = horiz ? py + side : py;
          if (isDirt(qx, qy)) shade(qx, qy, 0.78);
          const lx = horiz ? px : px - 1, ly = horiz ? py - 1 : py;
          if (side < 0 && isDirt(lx, ly)) shade(lx, ly, 1.2);
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  // Puddles, stones and footprints (sprite decals) at seeded spots along the trails.
  // First frame of each decal sprite (some are 2-frame strips).
  const pick = (re) => Object.keys(assets.manifest || {}).filter((k) => re.test(k)).map((k) => {
    const info = assets.spriteInfo(k);
    const img = info?.tex?.image;
    if (!img) return null;
    const def = info.def || assets.manifest[k];
    return { img, w: def.fw || Math.floor(img.width / (def.frames || 1)), h: def.fh || img.height };
  }).filter(Boolean);
  // (dec_puddle_mud is an opaque square and dec_footprints a dark blob: both read as tiles/stones on the trail.)
  const puddles = pick(/^dec_tin_puddle$/), stones = pick(/^dec_(pebbles|pebbles_mossy)$/), prints = [];
  for (const k of laneTiles) {
    const [lx, ly] = k.split(',').map(Number);
    const r = hash2(lx, ly, seed + 47);
    const list = r < Wr.puddles ? puddles : r < Wr.puddles + Wr.stones ? stones : r < Wr.puddles + Wr.stones + 0.08 ? prints : null;
    if (!list?.length) continue;
    const d = list[Math.floor(hash2(lx, ly, seed + 48) * list.length)];
    const px = Math.round((lx - X0) * 32 + 16 + (hash2(lx, ly, seed + 49) - 0.5) * 10 - d.w / 2);
    const py = Math.round((ly - Z0) * 32 + 16 + (hash2(lx, ly, seed + 50) - 0.5) * 8 - d.h / 2);
    if (!isDirt(px + (d.w >> 1), py + (d.h >> 1))) continue;
    g.drawImage(d.img, 0, 0, d.w, d.h, px, py, d.w, d.h);
  }
}

/**
 * A wet sheen over a set of lane tiles (visible rewards: a flooded / slowed path). The band follows the trail
 * through its corners (each tile: a 24-texel core, joined to its lane neighbours) and MULTIPLIES the ground by
 * `color` (a cool, darker tint: no checker pattern over the trail), its edge a 2-texel Bayer step, with a
 * few darker ripple dashes. Hard alpha (alphaTest), flat decal (pxSnap), keeps PostFx's light code (dst alpha).
 * `alpha` = how far the tint goes toward `color` (0..1). Returns a mesh in defense coordinates.
 */
export function laneTint(tiles, color, alpha = 0.35, seed = 1) {
  if (!tiles.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of tiles) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = (x1 - x0 + 1) * 32, h = (y1 - y0 + 1) * 32;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const D = img.data;
  const set = new Set(tiles.map(([x, y]) => `${x},${y}`));
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const white = new THREE.Color(1, 1, 1);
  const tint = white.clone().lerp(new THREE.Color(color), alpha);
  const dark = white.clone().lerp(new THREE.Color(color), Math.min(1, alpha * 1.7));
  const put = (X, Y, c) => { const o = (Y * w + X) * 4; D[o] = c.r * 255; D[o + 1] = c.g * 255; D[o + 2] = c.b * 255; D[o + 3] = 255; };
  const C0 = 4, C1 = 28;   // the band's core inside a tile
  for (const [tx, ty] of tiles) {
    const L = set.has(`${tx - 1},${ty}`), R = set.has(`${tx + 1},${ty}`), U = set.has(`${tx},${ty - 1}`), Dn = set.has(`${tx},${ty + 1}`);
    for (let py = 0; py < 32; py++) for (let px = 0; px < 32; px++) {
      const inX = px >= C0 && px < C1, inY = py >= C0 && py < C1;
      const armX = inY && ((px < C0 && L) || (px >= C1 && R)), armY = inX && ((py < C0 && U) || (py >= C1 && Dn));
      if (!(inX && inY) && !armX && !armY) continue;
      // distance (texels) to the band's open edge, for a 2-texel dithered rim
      let edge = 9;
      if (inX && inY) {
        if (!L) edge = Math.min(edge, px - C0);
        if (!R) edge = Math.min(edge, C1 - 1 - px);
        if (!U) edge = Math.min(edge, py - C0);
        if (!Dn) edge = Math.min(edge, C1 - 1 - py);
      } else if (armX) edge = Math.min(py - C0, C1 - 1 - py);
      else edge = Math.min(px - C0, C1 - 1 - px);
      if (edge < 2 && B4[(py & 3) * 4 + (px & 3)] / 16 >= (edge + 1) / 3) continue;
      put((tx - x0) * 32 + px, (ty - y0) * 32 + py, tint);
    }
    // ripple dashes (darker), along the trail's direction
    const horiz = L || R || !(U || Dn);
    for (let k = 0; k < 2; k++) {
      const a = 6 + Math.floor(hash2(tx, ty, seed + k) * 16), b = 8 + Math.floor(hash2(tx, ty, seed + 9 + k) * 14);
      for (let d = 0; d < 5; d++) put((tx - x0) * 32 + (horiz ? a + d : b), (ty - y0) * 32 + (horiz ? b : a + d), dark);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
  // ground × tint (colour only; the destination alpha, PostFx's light code, is kept)
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.ZeroFactor;
  mat.blendDst = THREE.SrcColorFactor;
  mat.blendEquationAlpha = THREE.AddEquation;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w / 32, h / 32), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x0 + w / 64, 0.012, y0 + h / 64);
  m.renderOrder = -3;   // ground layer: under plinths, marks and the enemies walking the trail
  m.userData.pxSnap = true;
  m.userData.dispose = () => { m.geometry.dispose(); mat.dispose(); tex.dispose(); };
  return m;
}

// ------------------------------------------------------------------ build-pad plinths

/**
 * An in-world tower plinth for a night-map build pad (critic F #14/#15, replaces the metal pad with
 * hazard brackets): a weathered stone block, or a timber platform (`wood`), drawn texel by texel at 32 px
 * per tile — top face, lit north/west bevels, a shaded front face showing its height, moss and cracks.
 * Returns a flat Lambert mesh (lit by the night lights like the ground) centred on the tile, its front
 * face hanging south of it. `seed` varies the wear and (critic G #12) the shape: top size, face height
 * and chipped corners (DEFENSE_VIEW.plinth), so a row of pads doesn't read as a grid of identical squares.
 * `grow` (texels) widens it for bigger tower art (DefenseScene sizes it from the widest tower sprite).
 */
export function makePlinth(seed, wood = false, grow = 0, assets = null) {
  const art = assets && plinthArt(seed, wood, assets);
  if (art) return art;
  const r = (i) => hash2(seed * 13 + i, i * 7, 911);
  const PS = DEFENSE_VIEW.plinth || { w: [30, 30], top: [26, 26], face: [7, 7], chips: [0, 0] };
  const span = (a, i) => a[0] + Math.floor(r(i) * (a[1] - a[0] + 1));
  const bw = span(PS.w, 1) + grow, tb = span(PS.top, 2) + Math.round(grow * 0.6), PLINTH_FACE = span(PS.face, 3);
  const PLINTH_W = bw + 4, PLINTH_H = tb + PLINTH_FACE + 3;
  const c = document.createElement('canvas');
  c.width = PLINTH_W; c.height = PLINTH_H;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const x0 = 2, x1 = x0 + bw - 1, y0 = 1, y1 = y0 + tb - 1;   // top face (inclusive)
  const top = wood ? ['#3a2618', '#4a3220', '#5a3e28', '#6b4b30'] : ['#3f4442', '#4c524e', '#5a615b', '#687068'];
  const face = wood ? ['#22160e', '#2c1d12', '#382517'] : ['#262a29', '#2f3432', '#3a3f3c'];
  const moss = ['#24401f', '#2f5228', '#3e6631'];
  // Front face (the block's height, shaded), with vertical joints.
  for (let y = y1 + 1; y <= y1 + PLINTH_FACE; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = y === y1 + PLINTH_FACE ? 0 : (x - x0) % (wood ? 7 : 9) === 0 ? 0 : y === y1 + 1 ? 2 : 1;
      px(x, y, face[k]);
    }
  }
  // Top face: stone slabs (2 × 2 blocks with offset joints) or planks, with value noise for wear.
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const n = hash2(x + seed * 31, y, 77);
      let k = n < 0.18 ? 0 : n < 0.62 ? 1 : n < 0.93 ? 2 : 3;
      if (wood) {
        if ((y - y0) % 6 === 5) k = 0;                                    // gaps between planks
        else if ((x + ((y - y0) / 6 | 0) * 11) % 16 === 0) k = 0;          // plank ends
      } else {
        const half = tb >> 1, row = (y - y0) < half ? 0 : 1;
        if (y - y0 === half || (x - x0 + row * 7 + seed) % 14 === 0) k = 0;   // slab joints
      }
      if (y === y0 || x === x0) k = Math.min(3, k + 2);                     // lit north / west bevel
      if (y === y1 || x === x1) k = Math.max(0, k - 1);
      px(x, y, top[k]);
    }
  }
  // Cracks (stone) or nail heads (wood).
  if (wood) {
    for (let p = 0; p < 10; p++) px(x0 + 2 + Math.floor(r(p) * (x1 - x0 - 3)), y0 + 2 + 6 * Math.floor(r(p + 20) * 4), '#8a7a5a');
  } else {
    for (let k = 0; k < 2; k++) {
      let x = x0 + 4 + Math.floor(r(k + 40) * (x1 - x0 - 8)), y = y0 + 2 + Math.floor(r(k + 50) * 8);
      for (let s = 0; s < 6 + Math.floor(r(k + 60) * 8) && y < y1; s++) {
        px(x, y, '#1c1f1e');
        const q = r(k * 31 + s + 70);
        if (q < 0.5) y++; else x += q < 0.75 ? 1 : -1;
      }
    }
  }
  // Moss creeping over the edges (more at the bottom-left, the damp side).
  for (let k = 0; k < 26; k++) {
    const side = r(k + 100);
    const x = side < 0.5 ? x0 + Math.floor(r(k + 110) * 4) : x0 + Math.floor(r(k + 120) * (x1 - x0));
    const y = side < 0.5 ? y0 + Math.floor(r(k + 130) * (y1 - y0 + PLINTH_FACE)) : y1 - Math.floor(r(k + 140) * 3) + Math.floor(r(k + 150) * 4);
    px(x, y, moss[Math.floor(r(k + 160) * 3)]);
  }
  // Chipped corners: small stepped bites out of the top-face corners and the face's bottom corners.
  const nChips = span(PS.chips, 4);
  for (let k = 0; k < nChips; k++) {
    const corner = Math.floor(r(k + 200) * 4), size = 2 + Math.floor(r(k + 210) * 3);
    const right = corner & 1, bottom = corner >> 1;
    const cx = right ? x1 : x0, cy = bottom ? y1 + PLINTH_FACE : y0;
    for (let i = 0; i < size; i++) for (let j = 0; j < size - i; j++) {
      g.clearRect(cx + (right ? -i : i), cy + (bottom ? -j : j), 1, 1);
    }
  }
  // Dark 1-texel outline around the block (pixel-art separation from the ground).
  const d = g.getImageData(0, 0, PLINTH_W, PLINTH_H);
  const solid = (x, y) => x >= 0 && y >= 0 && x < PLINTH_W && y < PLINTH_H && d.data[(y * PLINTH_W + x) * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < PLINTH_H; y++) for (let x = 0; x < PLINTH_W; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
  }
  for (const [x, y] of edge) px(x, y, '#121414');
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(PLINTH_W / 32, PLINTH_H / 32), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -2;   // before the tower's shadow (−1) and sprite (0): towers don't write depth at night
  m.userData.pxSnap = true;
  // Centre the top face on the tile: the texture's top-face centre is (y0 + y1) / 2 texels from its top.
  m.userData.zOffset = (PLINTH_H / 2 - (y0 + y1 + 1) / 2) / 32;
  m.userData.topW = bw / 32;
  m.userData.topH = tb / 32;
  m.userData.faceZ = (y1 + 1 + PLINTH_FACE / 2 - (y0 + y1 + 1) / 2) / 32;   // front face's middle, from the pad centre
  m.userData.dispose = () => { m.geometry.dispose(); mat.dispose(); tex.dispose(); };
  return m;
}

/**
 * The hand-made plinth (critic H2 §11): DEFENSE_VIEW.plinthArt — the wood key on wood pads, else one of its keys
 * picked by the pad seed. Same mesh contract as the drawn one (flat, 1 texel = 1 px, zOffset / xOffset centre the
 * manifest's "top" box [x0, y0, x1, y1] (texels, inclusive) on the pad; topW / topH; faceZ = the front face's middle).
 * Null when the art isn't loaded.
 */
function plinthArt(seed, wood, assets) {
  const PA = DEFENSE_VIEW.plinthArt;
  if (!PA) return null;
  let key = wood ? PA.wood : null;
  if (!key) {
    const ws = PA.weights || PA.keys.map(() => 1);
    const sum = ws.reduce((a, b) => a + b, 0);
    let q = hash2(seed * 13 + 5, 17, 433) * sum;
    key = PA.keys.find((_, i) => (q -= ws[i]) < 0) || PA.keys[0];
  }
  const info = assets.spriteInfo?.(key);
  const img = info?.tex?.image;
  if (!img || !info.def?.top) return null;
  const W = img.width, H = img.height;
  const [x0, y0, x1, y1] = info.def.top;
  const tex = info.tex.clone();
  tex.needsUpdate = true;
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W / 32, H / 32), mat);
  m.rotation.x = -Math.PI / 2;
  // Mirror half the stone / rubble pads (seeded) so neighbours differ; timber keeps its lit side.
  if (key !== PA.wood && hash2(seed, 29, 71) < 0.5) m.scale.x = -1;
  m.renderOrder = -2;
  m.userData.pxSnap = true;
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  m.userData.zOffset = (H / 2 - cy) / 32;
  m.userData.xOffset = (m.scale.x < 0 ? cx - W / 2 : W / 2 - cx) / 32;
  m.userData.topW = (x1 - x0 + 1) / 32;
  m.userData.topH = (y1 - y0 + 1) / 32;
  m.userData.faceZ = ((y1 + 1 + H) / 2 - cy) / 32;
  m.userData.art = key;
  m.userData.dispose = () => { m.geometry.dispose(); mat.dispose(); tex.dispose(); };
  return m;
}
