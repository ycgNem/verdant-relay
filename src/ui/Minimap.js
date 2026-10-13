// Exploration minimap (HUD, top-right) and the Tab big map. Both draw the same thing at different
// pixel sizes onto a <canvas> that CSS scales up with nearest-neighbour:
//   - rooms you have entered are drawn in full (floor, walls, water, brambles, hazards)
//   - rooms next to an explored room, and the objective room, show as dim "unexplored" blocks
//   - markers: objective (amber ◆), optional (violet ●), event (yellow !), extraction (cyan ■, grey
//     while locked), emergency beacon, med kits and unopened containers in explored rooms, the player.
// The objective room is always marked, so the goal is never hidden.

import { TILE, FLAG, CELL_W, CELL_H } from '../world/ExploreGen.js';

const COL = {
  floor: '#4a5878', alt: '#3e6b4f', wall: '#c0cbdc', block: '#262b44', water: '#124e89',
  bramble: '#be4a2f', spore: '#b55088', alarm: '#ff0044', fog: '#262b44', fogEdge: '#3a4466',
};

// Tile colours that need explaining on the big map's legend (district: only shown where it exists).
export const TILE_LEGEND = [
  { color: COL.bramble, label: 'Brambles (cut with RMB)' },
  { color: COL.spore, label: 'Spores (hurt)' },
  { color: COL.alarm, label: 'Alarm laser', district: 'alarms' },
];

export const MARKER_STYLE = {
  objective: { color: '#feae34', label: 'Objective' },
  optional: { color: '#c47bff', label: 'Optional' },
  event: { color: '#fee761', label: 'Event (risk / reward)' },
  extract: { color: '#2ce8f5', label: 'Extraction' },
  extract_locked: { color: '#8b9bb4', label: 'Extraction (locked)' },
  beacon: { color: '#2ce8f5', label: 'Emergency beacon' },
  med: { color: '#e43b44', label: 'Med kit' },
  container: { color: '#e4a672', label: 'Container' },
  done: { color: '#63c74d', label: 'Done' },
};

export class Minimap {
  constructor(map, world) {
    this.map = map;
    this.world = world;
    this.layers = {};      // ppt -> offscreen canvas of the full map
    this.dirty = true;
  }

  /** Mark the static layer for redraw (a bramble was cut, an alarm went off). */
  invalidate() { this.dirty = true; }

  _layer(ppt) {
    if (this.dirty) { this.layers = {}; this.dirty = false; }
    if (this.layers[ppt]) return this.layers[ppt];
    const { w, h } = this.map;
    const c = document.createElement('canvas');
    c.width = w * ppt; c.height = h * ppt;
    const g = c.getContext('2d');
    const world = this.world;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = world.tileAt(x, y);
        const f = world.flagAt(x, y);
        let col = null;
        if (t === TILE.VOID) continue;
        if (t === TILE.WALL) col = COL.wall;
        else if (t === TILE.BLOCK) col = COL.block;
        else if (t === TILE.WATER) col = COL.water;
        else if (f & FLAG.BRAMBLE) col = COL.bramble;
        else if (f & FLAG.SPORE) col = COL.spore;
        else if (f & FLAG.ALARM) col = COL.alarm;
        else col = t === TILE.ALT ? COL.alt : COL.floor;
        g.fillStyle = col;
        g.fillRect(x * ppt, y * ppt, ppt, ppt);
      }
    }
    this.layers[ppt] = c;
    return c;
  }

  /**
   * Draw onto `canvas` at `ppt` pixels per tile.
   * state: { revealed: Uint8Array, markers: [{x, z, type, room, always}], player: {x, z, ax, az}, time }
   */
  draw(canvas, ppt, state) {
    const { w, h, rooms } = this.map;
    if (canvas.width !== w * ppt || canvas.height !== h * ppt) { canvas.width = w * ppt; canvas.height = h * ppt; }
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const layer = this._layer(ppt);
    const shown = new Set();
    for (const r of rooms) {
      if (state.revealed[r.id]) shown.add(r.id);
    }
    // Unexplored silhouettes: neighbours of explored rooms + the objective room.
    for (const r of rooms) {
      if (shown.has(r.id)) continue;
      const near = r.neighbors.some((n) => shown.has(n)) || r.id === this.map.objectiveRoom || state.knownRooms?.has(r.id);
      if (!near) continue;
      g.fillStyle = COL.fog;
      g.fillRect((r.x0) * ppt, (r.y0) * ppt, 12 * ppt, 9 * ppt);
      g.strokeStyle = COL.fogEdge;
      g.lineWidth = Math.max(1, ppt / 4);
      g.strokeRect((r.x0 - 0.5) * ppt, (r.y0 - 0.5) * ppt, 13 * ppt, 10 * ppt);
      if (ppt >= 6) {
        g.fillStyle = '#5a6988';
        g.font = `bold ${ppt * 2}px monospace`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('?', (r.x0 + 6) * ppt, (r.y0 + 4.5) * ppt);
      }
    }
    for (const id of shown) {
      const r = rooms[id];
      // Room interior plus its surrounding wall ring (doors show as gaps).
      const sx = (r.x0 - 1) * ppt, sy = (r.y0 - 1) * ppt, sw = (CELL_W + 1) * ppt, sh = (CELL_H + 1) * ppt;
      g.drawImage(layer, sx, sy, sw, sh, sx, sy, sw, sh);
    }

    // Markers
    const t = state.time || 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    for (const m of state.markers) {
      if (!m.always && !(m.room >= 0 && shown.has(m.room))) continue;
      const x = m.x * ppt, y = m.z * ppt;
      const st = MARKER_STYLE[m.type] || MARKER_STYLE.objective;
      const s = Math.max(2, ppt * (m.big ? 1.4 : 1));
      g.fillStyle = st.color;
      g.strokeStyle = '#181425';
      g.lineWidth = Math.max(1, ppt / 4);
      switch (m.type) {
        case 'objective': case 'done': diamond(g, x, y, s * (m.type === 'objective' ? 1 + pulse * 0.25 : 0.8)); break;
        case 'optional': circle(g, x, y, s * 0.8); break;
        case 'event': tri(g, x, y, s); break;
        case 'extract': case 'beacon': square(g, x, y, s * (1 + pulse * 0.3)); break;
        case 'extract_locked': square(g, x, y, s * 0.9); break;
        case 'med': g.fillRect(x - s * 0.5, y - s * 0.15, s, s * 0.3); g.fillRect(x - s * 0.15, y - s * 0.5, s * 0.3, s); break;
        case 'container': g.fillRect(x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.6); break;
        default: circle(g, x, y, s * 0.6);
      }
    }

    // Player: a white dot with an aim tick.
    const p = state.player;
    if (p) {
      const x = p.x * ppt, y = p.z * ppt, s = Math.max(2, ppt);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#181425';
      g.lineWidth = Math.max(1, ppt / 4);
      circle(g, x, y, s * 0.75);
      g.strokeStyle = '#ffffff';
      g.lineWidth = Math.max(1, ppt / 3);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + p.ax * s * 2, y + p.az * s * 2);
      g.stroke();
    }
  }
}

function diamond(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath();
  g.fill(); g.stroke();
}
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
function square(g, x, y, s) { g.fillRect(x - s, y - s, s * 2, s * 2); g.strokeRect(x - s, y - s, s * 2, s * 2); }
function tri(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y + s * 0.8); g.lineTo(x - s, y + s * 0.8); g.closePath();
  g.fill(); g.stroke();
}
