// Exploration map generator. Pure data: returns a tile grid plus a list of "things" (decor,
// containers, enemies, objective props…) that ExploreScene turns into entities.
//
// Layout
//   The district is a grid of room cells (CONFIG.expedition.grid, e.g. 4×3). Each cell holds one
//   12×9 room interior (src/data/rooms.js) surrounded by 1-tile walls that neighbouring cells share:
//
//       x: 0 [1 … 12] 13 [14 … 25] 26 …        (wall columns at multiples of CELL_W = 13)
//       y: 0 [1 …  9] 10 [11 … 19] 20 …        (wall rows at multiples of CELL_H = 10)
//
//   Not every cell is used: rooms are grown from a random start cell (randomised Prim), which gives a
//   spanning tree of doors; then at least one extra door between two already-connected neighbours is
//   added, which closes a loop so there are always two routes somewhere on the map. Unused cells
//   become solid "canopy" (VOID).
//
// Rooms
//   Each room stamps a template of its district's room types, randomly mirrored. Then a plus-shaped
//   corridor (row 4 + columns 5–6) and the tiles in front of each door are carved clear, so every door
//   reaches the room centre no matter how dense the template is. Solid props are never placed on
//   those "keep clear" tiles, so they can't wall anything off either.
//
// Roles
//   start → farthest pair of rooms (graph distance) becomes start + objective room; extraction is far
//   from the start; optional rooms prefer dead ends; everything else is an exploration room.
//
// Validation
//   A flood fill from the start (brambles count as passable: the Pulse Cutter clears them) checks every
//   thing is reachable. Unreachable loot/enemies are dropped; if an objective prop or the extraction
//   is unreachable the whole attempt is regenerated from the next sub-seed.

import { ROOM_TEMPLATES, ROOM_W, ROOM_H } from '../data/rooms.js';
import { CONFIG } from '../data/config.js';
import { DISTRICTS } from '../data/districts.js';
import { PRIMARY, OPTIONAL, OPTIONAL_KEYS, EVENTS, EVENT_KEYS } from '../data/objectives.js';
import { EXPLORE_ENEMIES } from '../data/enemies.js';

export const TILE = { FLOOR: 0, ALT: 1, WALL: 2, BLOCK: 3, WATER: 4, VOID: 5 };
export const FLAG = { SOLID: 1, OPAQUE: 2, BRAMBLE: 4, SPORE: 8, ALARM: 16 };
export const CELL_W = ROOM_W + 1;
export const CELL_H = ROOM_H + 1;
const CORRIDOR_ROW = 4;

// Template glyph → decor. solid blocks movement; opaque also blocks shots and sight.
const DECOR = {
  T: { keys: ['tree', 'tree_2', 'tree_3'], solid: true, opaque: true },
  k: { keys: ['car_wreck'], solid: true, opaque: true },
  l: { keys: ['lamp_post'], solid: true, opaque: false },
  r: { keys: ['rubble', 'rubble_2'], solid: true, opaque: false },
  b: { keys: ['bush', 'bush_2'], solid: false, opaque: false },
};

/** Per-night expedition tuning: CONFIG.expedition.byNight[key] for `night` (the last entry repeats). */
export function nightTune(key, night) {
  const t = CONFIG.expedition.byNight[key];
  return t[Math.max(0, Math.min(t.length - 1, (night || 1) - 1))];
}

/** Enemy role for the per-room caps: 'ranged' (Spitter, Scav), 'charger' (Razorback) or 'melee'. */
export function enemyRole(key) {
  const a = EXPLORE_ENEMIES[key]?.attack;
  return a === 'ranged' ? 'ranged' : a === 'charge' ? 'charger' : 'melee';
}

// Solid props (you interact from beside them); everything else is walk-over.
const SOLID_PROPS = new Set(['crate', 'chest', 'cache', 'intel_terminal', 'power_box', 'terminal', 'pump', 'cell_cache',
  'nest', 'survivor', 'locked_cache', 'workbench', 'surge_box']);

/**
 * Generate a map. ctx: { run, district, objective }.
 * Returns the map object (see bottom of buildMap for its fields).
 */
export function generateExpedition(ctx) {
  let fallback = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const rng = ctx.run.rng('explore', ctx.district, attempt);
    const map = buildMap(rng, ctx);
    if (!map) continue;
    map.attempt = attempt;
    if (validate(map)) return map;
    fallback = fallback || map;
  }
  // Practically unreachable: every attempt failed validation. Use the first map anyway; validate()
  // has already dropped whatever was unreachable, and the scene copes with missing optional things.
  console.warn('ExploreGen: no fully valid map, using fallback');
  return fallback;
}

// ------------------------------------------------------------------ room graph

function layoutGraph(rng, gw, gh, N) {
  const idx = (cx, cy) => cx + cy * gw;
  const nbrs = (c) => {
    const cx = c % gw, cy = Math.floor(c / gw), out = [];
    if (cx > 0) out.push(c - 1);
    if (cx < gw - 1) out.push(c + 1);
    if (cy > 0) out.push(c - gw);
    if (cy < gh - 1) out.push(c + gw);
    return out;
  };
  const region = new Set([idx(rng.int(0, gw - 1), rng.int(0, gh - 1))]);
  const edges = [];
  // Randomised Prim: each new cell joins through exactly one door → a spanning tree.
  while (region.size < N) {
    const frontier = [];
    for (const c of region) for (const n of nbrs(c)) if (!region.has(n) && !frontier.includes(n)) frontier.push(n);
    if (!frontier.length) return null;
    const f = rng.pick(frontier);
    edges.push([rng.pick(nbrs(f).filter((n) => region.has(n))), f]);
    region.add(f);
  }
  // Loops: any extra door between two neighbouring rooms closes a cycle in the tree.
  const has = (a, b) => edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  const cands = [];
  for (const a of region) for (const b of nbrs(a)) if (b > a && region.has(b) && !has(a, b)) cands.push([a, b]);
  if (!cands.length) return null;
  const extra = rng.shuffle(cands);
  edges.push(extra[0]);
  if (extra.length > 1 && rng.chance(CONFIG.expedition.extraLoopChance)) edges.push(extra[1]);
  return { cells: [...region], edges, nbrs };
}

function graphDistances(cells, edges) {
  const adj = new Map(cells.map((c) => [c, []]));
  for (const [a, b] of edges) { adj.get(a).push(b); adj.get(b).push(a); }
  const dist = new Map();
  for (const s of cells) {
    const d = new Map([[s, 0]]);
    const q = [s];
    while (q.length) {
      const c = q.shift();
      for (const n of adj.get(c)) if (!d.has(n)) { d.set(n, d.get(c) + 1); q.push(n); }
    }
    dist.set(s, d);
  }
  return { adj, dist };
}

// ------------------------------------------------------------------ map building

function buildMap(rng, ctx) {
  const X = CONFIG.expedition;
  const district = DISTRICTS[ctx.district];
  const night = ctx.run.night;
  const [gw, gh] = X.grid;
  const er = X.byNight.exploreRooms ? nightTune('exploreRooms', night) : X.exploreRooms;
  const or = X.byNight.optionalRooms ? nightTune('optionalRooms', night) : X.optionalRooms;
  const E = rng.int(er[0], er[1]);
  const O = rng.int(or[0], or[1]);
  const N = Math.min(gw * gh, 3 + E + O);
  const graph = layoutGraph(rng, gw, gh, N);
  if (!graph) return null;
  const { adj, dist } = graphDistances(graph.cells, graph.edges);

  // ---- roles
  let best = -1, pairs = [];
  for (const a of graph.cells) for (const b of graph.cells) {
    if (a >= b) continue;
    const d = dist.get(a).get(b);
    if (d > best) { best = d; pairs = [[a, b]]; } else if (d === best) pairs.push([a, b]);
  }
  const pair = rng.pick(pairs);
  const [startCell, objCell] = rng.chance(0.5) ? pair : [pair[1], pair[0]];
  const role = new Map([[startCell, 'start'], [objCell, 'objective']]);
  const free = () => graph.cells.filter((c) => !role.has(c));
  // Extraction: far from the start (you walk out through the district), not the objective room.
  const ds = dist.get(startCell), dobj = dist.get(objCell);
  let ex = free().map((c) => ({ c, s: ds.get(c) + dobj.get(c) * 0.35 + rng.next() * 0.8 }));
  ex.sort((p, q) => q.s - p.s);
  role.set(ex[0].c, 'extract');
  // Optional rooms prefer dead ends (a detour you choose to take).
  const opt = free().map((c) => ({ c, s: (adj.get(c).length === 1 ? 1.5 : 0) + ds.get(c) * 0.4 + rng.next() }));
  opt.sort((p, q) => q.s - p.s);
  for (let i = 0; i < Math.min(O, opt.length - 1); i++) role.set(opt[i].c, 'optional');
  for (const c of free()) role.set(c, 'explore');
  if (graph.cells.filter((c) => role.get(c) === 'explore').length < 2) return null;

  // ---- grid
  const w = gw * CELL_W + 1, h = gh * CELL_H + 1;
  const tiles = new Uint8Array(w * h).fill(TILE.WALL);
  const flags = new Uint8Array(w * h);
  const occ = new Uint8Array(w * h);       // a thing / spot already uses this tile
  const keep = new Uint8Array(w * h);      // keep-clear tiles (corridor, door approaches, start/extract centre)
  const I = (x, y) => x + y * w;
  const things = [];

  const rooms = graph.cells.map((c, id) => {
    const cx = c % gw, cy = Math.floor(c / gw);
    return {
      id, cell: c, cx, cy, x0: 1 + cx * CELL_W, y0: 1 + cy * CELL_H, role: role.get(c),
      doors: { n: false, s: false, e: false, w: false }, neighbors: [], dist: ds.get(c),
      spots: { c: [], e: [], o: [] }, type: null,
    };
  });
  const roomOfCell = new Map(rooms.map((r) => [r.cell, r]));
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    if (roomOfCell.has(cx + cy * gw)) continue;
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) tiles[I(1 + cx * CELL_W + x, 1 + cy * CELL_H + y)] = TILE.VOID;
  }

  // ---- doors (3 tiles tall in vertical walls, 4 wide in horizontal walls)
  const doors = [];
  for (const [a, b] of graph.edges) {
    let ra = roomOfCell.get(a), rb = roomOfCell.get(b);
    ra.neighbors.push(rb.id); rb.neighbors.push(ra.id);
    const door = { a: ra.id, b: rb.id, tiles: [], dir: '' };
    if (ra.cy === rb.cy) {
      if (ra.cx > rb.cx) [ra, rb] = [rb, ra];
      ra.doors.e = rb.doors.w = true;
      door.dir = 'v';
      const x = ra.x0 + ROOM_W;
      for (let y = ra.y0 + 3; y <= ra.y0 + 5; y++) door.tiles.push([x, y]);
    } else {
      if (ra.cy > rb.cy) [ra, rb] = [rb, ra];
      ra.doors.s = rb.doors.n = true;
      door.dir = 'h';
      const y = ra.y0 + ROOM_H;
      for (let x = ra.x0 + 4; x <= ra.x0 + 7; x++) door.tiles.push([x, y]);
    }
    for (const [x, y] of door.tiles) tiles[I(x, y)] = TILE.FLOOR;
    doors.push(door);
  }

  const isCorridor = (lx, ly) => ly === CORRIDOR_ROW || lx === 5 || lx === 6;
  const isDoorApproach = (r, lx, ly) => (r.doors.w && lx <= 1 && ly >= 3 && ly <= 5)
    || (r.doors.e && lx >= ROOM_W - 2 && ly >= 3 && ly <= 5)
    || (r.doors.n && ly <= 1 && lx >= 4 && lx <= 7)
    || (r.doors.s && ly >= ROOM_H - 2 && lx >= 4 && lx <= 7);
  const isCentre = (r, lx, ly) => {
    const rad = r.role === 'start' ? 2.2 : r.role === 'extract' ? 2.6 : 0;
    return rad > 0 && Math.hypot(lx + 0.5 - 6, ly + 0.5 - 4.5) <= rad;
  };

  // ---- stamp templates (no alarm lasers in an elite's room: the duel shouldn't summon help)
  const eliteObjective = PRIMARY[ctx.objective].steps.some((st) => st.type === 'kill' && st.elite);
  const pendingDecor = [];
  for (const r of rooms) {
    r.type = rng.pick(district.rooms);
    const options = ROOM_TEMPLATES.filter((t) => t.type === r.type);
    const tpl = rng.pick(options.length ? options : ROOM_TEMPLATES);
    const fx = rng.chance(0.5), fy = rng.chance(0.5);
    r.template = ROOM_TEMPLATES.indexOf(tpl);
    for (let ly = 0; ly < ROOM_H; ly++) {
      for (let lx = 0; lx < ROOM_W; lx++) {
        const ch = tpl.rows[fy ? ROOM_H - 1 - ly : ly][fx ? ROOM_W - 1 - lx : lx];
        const x = r.x0 + lx, y = r.y0 + ly, i = I(x, y);
        const clear = isCorridor(lx, ly) || isDoorApproach(r, lx, ly) || isCentre(r, lx, ly);
        if (clear) keep[i] = 1;
        let t = TILE.FLOOR;
        if (ch === ',' || ch === 'x' || ch === 'b') t = TILE.ALT;
        else if (ch === '#') t = TILE.BLOCK;
        else if (ch === 'w') t = TILE.WATER;
        // The corridor / door approaches always stay open floor.
        if (clear && (t === TILE.BLOCK || t === TILE.WATER)) t = TILE.FLOOR;
        tiles[i] = t;
        if (DECOR[ch]) {
          if (!clear || !DECOR[ch].solid) pendingDecor.push({ r, lx, ly, ch, clear });
        } else if (ch === 'V' && !clear) {
          pendingDecor.push({ r, lx, ly, ch });
        } else if (ch === 'x' && !clear && r.role !== 'start') {
          flags[i] |= FLAG.SPORE;
          things.push({ kind: 'spore', tx: x, ty: y, room: r.id });
        } else if (ch === '=' && district.alarms && !clear && r.role !== 'start' && r.role !== 'extract' && !(r.role === 'objective' && eliteObjective)) {
          flags[i] |= FLAG.ALARM;
          things.push({ kind: 'alarm', tx: x, ty: y, room: r.id });
          occ[i] = 1;
        } else if (ch === 'c' || ch === 'e' || ch === 'o') {
          r.spots[ch].push([lx, ly]);
        }
      }
    }
  }

  // Static solidity from tiles.
  for (let i = 0; i < w * h; i++) {
    const t = tiles[i];
    if (t === TILE.WALL || t === TILE.BLOCK || t === TILE.VOID) flags[i] |= FLAG.SOLID | FLAG.OPAQUE;
    else if (t === TILE.WATER) flags[i] |= FLAG.SOLID;
  }
  // Wall tiles with no room floor around them are hidden inside the canopy (no wall box needed).
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (tiles[I(x, y)] !== TILE.WALL) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const t = tiles[I(nx, ny)];
      if (t !== TILE.WALL && t !== TILE.VOID) { near = true; break; }
    }
    if (!near) tiles[I(x, y)] = TILE.VOID;
  }

  const walkableTile = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const t = tiles[I(x, y)];
    return (t === TILE.FLOOR || t === TILE.ALT) && !(flags[I(x, y)] & FLAG.SOLID);
  };

  // ---- decor (after doors, so a car wreck knows whether its second tile is free)
  for (const d of pendingDecor) {
    const x = d.r.x0 + d.lx, y = d.r.y0 + d.ly, i = I(x, y);
    if (d.ch === 'V') {
      flags[i] |= FLAG.SOLID | FLAG.OPAQUE | FLAG.BRAMBLE;
      occ[i] = 1;
      things.push({ kind: 'bramble', tx: x, ty: y, room: d.r.id });
      continue;
    }
    const def = DECOR[d.ch];
    if (d.clear && d.ch === 'b' && isDoorApproach(d.r, d.lx, d.ly)) continue;
    let key = rng.pick(def.keys), wide = false;
    if (d.ch === 'k') {
      // A car wreck is two tiles wide; if the second tile isn't free it shrinks to a rubble pile.
      const j = I(x + 1, y);
      if (d.lx + 1 < ROOM_W && !keep[j] && !occ[j] && walkableTile(x + 1, y)) wide = true;
      else key = rng.pick(DECOR.r.keys);
    }
    occ[i] = 1;
    if (def.solid) flags[i] |= FLAG.SOLID | (def.opaque ? FLAG.OPAQUE : 0);
    if (wide) { occ[I(x + 1, y)] = 1; flags[I(x + 1, y)] |= FLAG.SOLID | FLAG.OPAQUE; }
    things.push({ kind: 'decor', key, tx: x, ty: y, room: d.r.id, solid: def.solid, wide, flip: rng.chance(0.5) });
  }

  // ---- placement helpers
  const validFor = (r, x, y, solid) => {
    const i = I(x, y);
    if (x < r.x0 || y < r.y0 || x >= r.x0 + ROOM_W || y >= r.y0 + ROOM_H) return false;
    if (!walkableTile(x, y) || occ[i] || (flags[i] & (FLAG.SPORE | FLAG.ALARM | FLAG.BRAMBLE))) return false;
    if (solid) {
      if (keep[i]) return false;
      // Keep at least two open sides so a prop never seals a pocket by itself.
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (walkableTile(x + dx, y + dy) && !occ[I(x + dx, y + dy)]) open++;
      if (open < 2) return false;
    }
    return true;
  };
  // Nearest valid tile to a local spot (ring search), or null.
  const nearValid = (r, lx, ly, solid, maxR = 4) => {
    for (let rad = 0; rad <= maxR; rad++) {
      const ring = [];
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = r.x0 + lx + dx, y = r.y0 + ly + dy;
        if (validFor(r, x, y, solid)) ring.push([x, y]);
      }
      if (ring.length) return rng.pick(ring);
    }
    return null;
  };
  const randomValid = (r, solid, test) => {
    for (let k = 0; k < 80; k++) {
      const x = r.x0 + rng.int(0, ROOM_W - 1), y = r.y0 + rng.int(0, ROOM_H - 1);
      if (validFor(r, x, y, solid) && (!test || test(x, y))) return [x, y];
    }
    return null;
  };
  // Take a spot of the given glyph (relocated off the corridor if needed), else a random tile.
  const takeSpot = (r, glyph, solid, test) => {
    const list = r.spots[glyph];
    while (list.length) {
      const [lx, ly] = list.splice(rng.int(0, list.length - 1), 1)[0];
      const p = nearValid(r, lx, ly, solid);
      if (p && (!test || test(p[0], p[1]))) return p;
    }
    return randomValid(r, solid, test);
  };
  const put = (thing, p) => {
    const [x, y] = p;
    occ[I(x, y)] = 1;
    if (thing.solid) flags[I(x, y)] |= FLAG.SOLID;
    thing.tx = x; thing.ty = y;
    things.push(thing);
    return thing;
  };
  const byRole = (rl) => rooms.filter((r) => r.role === rl);
  const objRoom = byRole('objective')[0];
  const startRoom = byRole('start')[0];
  const extractRoom = byRole('extract')[0];
  const explore = byRole('explore');
  const used = new Set();   // exploration rooms that already hold a set piece
  const farFromObj = () => {
    const pool = explore.filter((r) => !used.has(r.id));
    if (!pool.length) return null;
    const dO = dist.get(objRoom.cell);
    const m = Math.max(...pool.map((r) => dO.get(r.cell)));
    return rng.pick(pool.filter((r) => dO.get(r.cell) === m));
  };

  // ---- enemy caps: per room, at most rangedCap Spitters/Scavs and chargerCap Razorbacks; the
  // objective room holds at most objectiveCap enemies (guards included). The elite's room only
  // gets a little light support, so Clear the Blockage is a fair duel.
  const tally = new Map();
  const countOf = (r) => {
    if (!tally.has(r.id)) tally.set(r.id, { total: 0, ranged: 0, charger: 0, melee: 0 });
    return tally.get(r.id);
  };
  const eliteRoom = (r) => r.role === 'objective' && eliteObjective;
  const roomCap = (r, role) => {
    if (role === 'ranged') return eliteRoom(r) ? 0 : nightTune('rangedCap', night);
    if (role === 'charger') return eliteRoom(r) ? 0 : nightTune('chargerCap', night);
    return Infinity;
  };
  const pickEnemyFor = (r, weights) => {
    const c = countOf(r);
    const w = {};
    for (const [k, v] of Object.entries(weights)) {
      if (!EXPLORE_ENEMIES[k]) continue;
      const role = enemyRole(k);
      if (c[role] >= roomCap(r, role)) continue;
      w[k] = v;
    }
    if (!Object.keys(w).length) return null;
    return rng.weighted(w);
  };
  const countEnemy = (r, key) => { const c = countOf(r); c.total++; c[enemyRole(key)]++; };
  const guardSpots = [];   // guard tiles: other enemies in the objective room keep their distance

  // ---- primary objective
  const objective = PRIMARY[ctx.objective];
  objective.steps.forEach((step, si) => {
    const count = step.count || 1;
    for (let n = 0; n < count; n++) {
      let r = objRoom;
      if (step.room === 'side' || (step.room === 'split' && n > 0)) {
        r = farFromObj() || objRoom;
        used.add(r.id);
      }
      if (step.type === 'kill') {
        // The elite stands in the open middle of its room (room to dodge its charges).
        const open = (x, y) => Math.hypot(x + 0.5 - (r.x0 + 6), y + 0.5 - (r.y0 + 4.5)) <= 3.2;
        const p = takeSpot(r, 'o', false, open) || randomValid(r, false, open) || takeSpot(r, 'e', false);
        if (!p) return;
        const elite = put({ kind: 'enemy', key: step.enemy, elite: !!step.elite, objective: true, step: si, room: r.id, solid: false }, p);
        if (step.elite) placeSupport(r, elite, nightTune('eliteSupport', night));
        continue;
      }
      const solid = SOLID_PROPS.has(step.prop);
      const p = takeSpot(r, 'o', solid);
      if (!p) return;
      const t = put({ kind: 'primary', key: step.prop, step: si, index: n, room: r.id, solid }, p);
      if (step.guards) placeGuards(r, t, Math.min(step.guards, nightTune('guards', night)));
    }
  });

  // Guards ring the prop, spread out (at least X.guardSpacing tiles apart, so they never stack into
  // one firing squad), within the room's night caps: objectiveCap in total and at most
  // byNight.guardRanged ranged guards (Spitters / Rival Scavengers).
  function placeGuards(r, prop, n) {
    const spacing = X.guardSpacing || 2;
    const placed = [];
    const spread = (x, y) => placed.every((q) => Math.hypot(x - q[0], y - q[1]) >= spacing);
    if (r.role === 'objective') n = Math.min(n, nightTune('objectiveCap', night) - countOf(r).total);
    let ranged = 0;
    for (let g = 0; g < n; g++) {
      let weights = district.enemies;
      if (ranged >= nightTune('guardRanged', night)) {
        weights = Object.fromEntries(Object.entries(weights).filter(([k]) => enemyRole(k) !== 'ranged'));
      }
      const key = pickEnemyFor(r, weights);
      if (!key) break;
      const ring = (x, y) => {
        const d = Math.hypot(x - prop.tx, y - prop.ty);
        return d >= 1.5 && d <= 3.6 && spread(x, y);
      };
      const p = randomValid(r, false, ring)
        || randomValid(r, false, (x, y) => Math.hypot(x - prop.tx, y - prop.ty) <= 5 && spread(x, y))
        || randomValid(r, false, spread);
      if (!p) break;   // no room left to spread out: fewer guards rather than a pile-up
      put({ kind: 'enemy', key, guard: true, room: r.id, solid: false }, p);
      countEnemy(r, key);
      placed.push(p);
      guardSpots.push(p);
      if (enemyRole(key) === 'ranged') ranged++;
    }
  }

  // Light support beside the elite, spread away from it so the fight doesn't start as a pile-up.
  function placeSupport(r, elite, n) {
    for (let g = 0; g < n; g++) {
      const key = rng.weighted(X.elite.supportTypes);
      const far = (x, y) => Math.hypot(x - elite.tx, y - elite.ty) >= 3.5;
      const p = takeSpot(r, 'e', false, far) || randomValid(r, false, far);
      if (p) { put({ kind: 'enemy', key, room: r.id, solid: false }, p); countEnemy(r, key); }
    }
  }

  // ---- optional objectives (one per optional room, distinct)
  const optKeys = rng.shuffle(OPTIONAL_KEYS);
  byRole('optional').forEach((r, k) => {
    const key = optKeys[k % optKeys.length];
    const def = OPTIONAL[key];
    const solid = SOLID_PROPS.has(def.prop);
    const p = takeSpot(r, 'o', solid);
    if (p) put({ kind: 'optional', key, prop: def.prop, room: r.id, solid }, p);
  });

  // ---- event (risk/reward set piece in an exploration room without another set piece)
  if (rng.chance(X.eventChance)) {
    const pool = explore.filter((r) => !used.has(r.id));
    if (pool.length) {
      const r = rng.pick(pool);
      const key = rng.pick(EVENT_KEYS);
      const def = EVENTS[key];
      const p = takeSpot(r, 'o', SOLID_PROPS.has(def.prop));
      if (p) { put({ kind: 'event', key, prop: def.prop, room: r.id, solid: SOLID_PROPS.has(def.prop) }, p); used.add(r.id); }
    }
  }

  // ---- containers (loot is pre-rolled here so a seed reproduces the same expedition)
  const containerRooms = [];
  for (const r of rooms) {
    const [lo, hi] = X.containersPerRoom[r.role] || [0, 1];
    for (let n = rng.int(lo, hi); n > 0; n--) containerRooms.push(r);
  }
  for (let n = district.extraContainers || 0; n > 0; n--) containerRooms.push(rng.pick(explore));
  for (const r of containerRooms) {
    const key = rng.weighted(X.containerWeights);
    const p = takeSpot(r, 'c', true);
    if (!p) continue;
    const thing = put({ kind: 'container', key, room: r.id, solid: true, loot: rollLoot(rng, key, district, ctx.run) }, p);
    const amb = district.ambushChance || 0;
    if (amb && r.role !== 'start' && rng.chance(key === 'crate' || key === 'intel_terminal' ? amb * 0.4 : amb)) thing.ambush = true;
  }

  // ---- early nights: a med kit waits in the start room (a safety net for the first expeditions)
  if (night <= X.startMedNights) {
    const p = randomValid(startRoom, false, (x, y) => {
      const d = Math.hypot(x + 0.5 - (startRoom.x0 + 6), y + 0.5 - (startRoom.y0 + 4.5));
      return d >= 1.5 && d <= 3.5;
    }) || randomValid(startRoom, false);
    if (p) put({ kind: 'med', room: startRoom.id, solid: false, startKit: true }, p);
  }

  // ---- loose med kits
  const meds = stochasticRound(rng, X.medKits * district.loot.med);
  const medRooms = rooms.filter((r) => r.role === 'explore' || r.role === 'optional');
  for (let n = 0; n < meds; n++) {
    const r = rng.pick(medRooms);
    const p = randomValid(r, false);
    if (p) put({ kind: 'med', room: r.id, solid: false }, p);
  }

  // ---- enemies (never near the start)
  const sx = startRoom.x0 + 6, sz = startRoom.y0 + 4.5;
  const farFromStart = (x, y) => Math.hypot(x + 0.5 - sx, y + 0.5 - sz) >= X.spawnMinDist;
  for (const r of rooms) {
    const [lo, hi] = X.enemiesPerRoom[r.role] || [0, 0];
    if (hi <= 0) continue;
    let count = Math.max(0, rng.int(lo, hi) + stochasticRound(rng, nightTune('extraEnemies', night)));
    if (r.role === 'extract') count = Math.min(count, 1 + Math.floor(night / 3));
    if (r.role === 'objective') {
      // The elite's room already has its support; other objective rooms share a cap with the guards.
      count = eliteRoom(r) ? 0 : Math.min(count, nightTune('objectiveCap', night) - countOf(r).total);
    }
    const apart = (x, y) => farFromStart(x, y)
      && guardSpots.every((q) => Math.hypot(x - q[0], y - q[1]) >= (X.guardSpacing || 2));
    for (let n = 0; n < count; n++) {
      const key = pickEnemyFor(r, district.enemies);
      if (!key) break;
      const p = takeSpot(r, 'e', false, r.role === 'objective' ? apart : farFromStart);
      if (p) { put({ kind: 'enemy', key, room: r.id, solid: false }, p); countEnemy(r, key); }
    }
  }

  // ---- district hazards: extra spore patches
  const sporePatches = X.extraSpores[ctx.district] || 0;
  const hazardRooms = rooms.filter((r) => r.role === 'explore' || r.role === 'optional' || r.role === 'objective');
  for (let n = 0; n < sporePatches; n++) {
    const r = rng.pick(hazardRooms);
    const c = randomValid(r, true);
    if (!c) continue;
    const size = rng.int(2, 4);
    const patch = [c];
    for (let k = 0; k < 12 && patch.length < size; k++) {
      const [bx, by] = rng.pick(patch);
      const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const x = bx + dx, y = by + dy;
      if (validFor(r, x, y, true) && !patch.some(([px, py]) => px === x && py === y)) patch.push([x, y]);
    }
    for (const [x, y] of patch) {
      flags[I(x, y)] |= FLAG.SPORE;
      occ[I(x, y)] = 1;
      if (tiles[I(x, y)] === TILE.FLOOR) tiles[I(x, y)] = TILE.ALT;
      things.push({ kind: 'spore', tx: x, ty: y, room: r.id });
    }
  }

  // ---- bramble-choked doors: never the start room's doors (the first steps are free) and never the
  // objective room's (no choke point into the hardest fight, and always a way to back out of it).
  const noBramble = (rl) => rl === 'start' || rl === 'objective';
  const brambleDoors = rng.shuffle(doors.filter((d) => !noBramble(rooms[d.a].role) && !noBramble(rooms[d.b].role)))
    .slice(0, rng.int(X.brambleDoors[0], X.brambleDoors[1]));
  for (const d of brambleDoors) {
    d.bramble = true;
    for (const [x, y] of d.tiles) {
      flags[I(x, y)] |= FLAG.SOLID | FLAG.OPAQUE | FLAG.BRAMBLE;
      things.push({ kind: 'bramble', tx: x, ty: y, room: -1 });
    }
  }

  // ---- greenery sprinkles on alt floor (walkable bushes) for density
  for (const r of rooms) {
    for (let k = 0; k < 4; k++) {
      const p = randomValid(r, false, (x, y) => tiles[I(x, y)] === TILE.ALT && !keep[I(x, y)]);
      if (p && rng.chance(0.6)) put({ kind: 'decor', key: rng.pick(DECOR.b.keys), room: r.id, solid: false, flip: rng.chance(0.5) }, p);
    }
  }

  for (const t of things) { t.x = t.tx + (t.wide ? 1 : 0.5); t.z = t.ty + 0.5; }

  return {
    w, h, gw, gh, tiles, flags, rooms, doors, things,
    district: ctx.district, objective: ctx.objective,
    start: { x: sx, z: sz, room: startRoom.id },
    extract: { x: extractRoom.x0 + 6, z: extractRoom.y0 + 4.5, room: extractRoom.id },
    objectiveRoom: objRoom.id,
    loops: graph.edges.length - (rooms.length - 1),
  };
}

// ------------------------------------------------------------------ loot

/**
 * Placement validation for runtime loot: a point that sits in a solid tile (a container against a
 * wall spilling into it, a drop from an enemy pinned to a wall) is moved to the nearest walkable tile,
 * keeping the sub-tile offset toward the original point so pickups don't line up on tile centres.
 * `world` needs solidAt(tx, ty). Returns { x, z } (the input point when it is already open).
 */
export function nearestOpen(world, x, z, maxR = 3, margin = 0.2) {
  const tx = Math.floor(x), ty = Math.floor(z);
  if (!world.solidAt(tx, ty)) return { x, z };
  let best = null, bd = Infinity;
  for (let r = 1; r <= maxR && !best; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || world.solidAt(tx + dx, ty + dy)) continue;
        const cx = tx + dx + 0.5, cz = ty + dy + 0.5;
        const d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < bd) { bd = d; best = { x: cx, z: cz }; }
      }
    }
  }
  if (!best) return { x, z };
  // Nudge from the tile centre toward the original point, staying `margin` inside the open tile.
  const lim = 0.5 - margin;
  return { x: best.x + Math.max(-lim, Math.min(lim, x - best.x)), z: best.z + Math.max(-lim, Math.min(lim, z - best.z)) };
}

export function stochasticRound(rng, v) {
  const f = Math.floor(v);
  return f + (rng.next() < v - f ? 1 : 0);
}

/** Pre-roll a container's contents with district multipliers and scavenger skills applied. */
function rollLoot(rng, key, district, run) {
  const X = CONFIG.expedition;
  const def = X.containers[key];
  const m = district.loot;
  const lush = run.hasSkill('lush_finds');
  const scrapMult = m.scrap * (run.hasSkill('pack_rat_2') ? X.packRatScrap : 1) * (X.byNight.containerScrap ? nightTune('containerScrap', run.night) : 1);
  const loot = { scrap: 0, circuits: 0, biofiber: 0, intel: 0, med: 0 };
  const component = () => rng.weighted({ circuits: m.circuits, biofiber: m.biofiber * (lush ? X.lushBiofiber : 1) });
  if (def.scrap) loot.scrap = Math.round(rng.int(def.scrap[0], def.scrap[1]) * scrapMult);
  if (def.intel) loot.intel = stochasticRound(rng, rng.int(def.intel[0], def.intel[1]) * m.intel);
  let comps = 0;
  if (def.componentChance && rng.chance(def.componentChance)) comps = 1;
  if (def.components) comps = rng.int(def.components[0], def.components[1]);
  for (let n = 0; n < comps; n++) {
    const c = component();
    loot[c] += stochasticRound(rng, m[c]);
  }
  if (key === 'crate' && lush && rng.chance(0.2)) loot.biofiber += 1;
  if (rng.chance(X.containerMedChance * m.med)) loot.med = 1;
  return loot;
}

// ------------------------------------------------------------------ validation

/**
 * Flood fill from the start. Drops unreachable non-critical things; returns false if an objective
 * prop, an optional/event prop or the extraction can't be reached (the caller regenerates).
 */
function validate(map) {
  const { w, h, tiles, flags } = map;
  const I = (x, y) => x + y * w;
  const passable = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const t = tiles[I(x, y)];
    if (t !== TILE.FLOOR && t !== TILE.ALT) return false;
    const f = flags[I(x, y)];
    return !(f & FLAG.SOLID) || !!(f & FLAG.BRAMBLE);
  };
  const reach = new Uint8Array(w * h);
  const sx = Math.floor(map.start.x), sz = Math.floor(map.start.z);
  if (!passable(sx, sz)) return false;
  const q = [[sx, sz]];
  reach[I(sx, sz)] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (passable(nx, ny) && !reach[I(nx, ny)]) { reach[I(nx, ny)] = 1; q.push([nx, ny]); }
    }
  }
  const ok = (t) => {
    if (!t.solid) return !!reach[I(t.tx, t.ty)];
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[I(t.tx + dx, t.ty + dy)]);
  };
  if (!reach[I(Math.floor(map.extract.x), Math.floor(map.extract.z))]) return false;
  for (const r of map.rooms) if (!reach[I(r.x0 + 6, r.y0 + 4)]) return false;
  // The objective must be fully placed (every step's props exist).
  const obj = PRIMARY[map.objective];
  for (let si = 0; si < obj.steps.length; si++) {
    const s = obj.steps[si];
    const n = map.things.filter((t) => t.step === si && (t.kind === 'primary' || (t.kind === 'enemy' && t.objective))).length;
    if (n < (s.count || 1)) return false;
  }
  const keepThings = [];
  for (const t of map.things) {
    if (t.kind === 'decor' || t.kind === 'spore' || t.kind === 'alarm' || t.kind === 'bramble') { keepThings.push(t); continue; }
    if (ok(t)) { keepThings.push(t); continue; }
    if (t.kind === 'primary' || (t.kind === 'enemy' && t.objective) || t.kind === 'optional') return false;
    // Unreachable loot / enemy / event: drop it and free its tile.
    if (t.solid) flags[I(t.tx, t.ty)] &= ~FLAG.SOLID;
  }
  map.things = keepThings;
  return true;
}
