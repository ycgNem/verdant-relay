// Jungle maps: a base image of the whole world (1 px per tile) painted once from the generated data,
// hidden under fog until explored (run.world.explored, revealed around the player and by pylons),
// plus live markers. Two views: the round HUD minimap (a window around the player) and the big map
// (Tab: zoom + pan over the explored area). Everything is drawn on whole device pixels: the map image
// is scaled by an integer, and marker shapes are rasterised pixel by pixel (no anti-aliased paths).

import { LEVEL, BRUSH, JUNGLE } from '../data/jungle.js';
import { MAP_VIEW } from '../data/hud.js';

/** Marker styles. `shape`: hub (Relay), tri (pylon), diamond, dot, arrow (player). */
export const MAP_MARKERS = {
  relay: { color: '#2ce8f5', core: '#ffffff', shape: 'hub', size: 1.6, label: 'Relay (home)' },
  pylon_on: { color: '#63c74d', core: '#d8ffcf', shape: 'tri', size: 1.25, label: 'Beacon (a way home)' },
  pylon_off: { color: '#7a8399', shape: 'tri', size: 1.1, label: 'Beacon (switch it on)' },
  objective: { color: '#feae34', shape: 'diamond', size: 1.4, label: 'Goal' },
  optional: { color: '#c47bff', shape: 'diamond', size: 1.1, label: 'Bonus task' },
  container: { color: '#ead4aa', shape: 'dot', size: 0.6, label: 'Supplies' },
  player: { color: '#ffffff', shape: 'arrow', size: 1.7, label: 'You' },
  // Wayfinding (critic L §3): the crossing to use when the straight line to the goal runs into deep water.
  ford: { color: '#c8e4f0', shape: 'diamond', size: 1.25, hollow: true, label: 'Crossing (stepping stones)' },
  // Area boss lair (src/entities/AreaBoss.js): a pixel skull, from day 3 until it is killed.
  boss: { color: '#ff4a4a', core: '#ffe0d0', shape: 'skull', size: 1.6, label: 'Area boss' },
  // Relics & lore (src/scenes/JungleRelics.js): strongboxes, shrines and relics on the ground (a four-point star);
  // hidden caches the Scavenger's Compass finds; data logs you have walked past.
  relic: { color: '#fee761', core: '#ffffff', shape: 'star', size: 1.5, label: 'Relic (strongbox / shrine)' },
  cache: { color: '#fee761', shape: 'dot', size: 0.75, label: 'Hidden cache (compass)' },
  lore: { color: '#2ce8f5', shape: 'dot', size: 0.7, label: 'Data log' },
  // Foraging (src/entities/Forage.js, critic N2): what you have seen stays on the map; grey once used today.
  forage_fruit: { color: '#f77622', shape: 'dot', size: 0.8, label: 'Wild fruit (seen)' },
  forage_fungus: { color: '#e4a672', shape: 'dot', size: 0.75, label: 'Fungus stump (seen)' },
  forage_bloom: { color: '#9d8cff', core: '#2ce8f5', shape: 'dot', size: 1.05, label: 'Dusk bloom (seen)' },
};
// Draw order: small first, the player last.
const ORDER = ['forage_fungus', 'forage_fruit', 'forage_bloom', 'container', 'cache', 'lore', 'pylon_off', 'optional', 'relic', 'boss', 'ford', 'pylon_on', 'relay', 'objective', 'player'];
// The skull marker (shape 'skull'): 5 × 5 cells, 1 = bone, 2 = eye / tooth gap (left dark).
const SKULL = ['01110', '11111', '12121', '11111', '01010'];
// Markers that stick to the minimap rim when they are outside it.
const RIM = new Set(['objective', 'relay', 'pylon_on', 'ford']);
const INK = '#0b0a12';
const OUTSIDE = '#050409';   // big map: beyond the world's edge

const LEVEL_COL = ['#1c4a4a', '#3b2c1f', '#6b5136', '#25301c', '#2c4a25'];

// ---------------------------------------------------------------- pixel shapes

/** Polygon (array of [x, y]) for a marker shape of size s centred on 0,0; `a` = heading (rad). */
function shapePoly(shape, s, a = 0) {
  const r = s / 2;
  if (shape === 'diamond') return [[0, -r - 0.5], [r + 0.5, 0], [0, r + 0.5], [-r - 0.5, 0]];
  if (shape === 'tri') return [[0, -r - 0.5], [r + 0.5, r], [-r - 0.5, r]];
  if (shape === 'star') {   // a four-point star (relics)
    const o = r + 0.5, i = Math.max(1, r * 0.38);
    return [[0, -o], [i, -i], [o, 0], [i, i], [0, o], [-i, i], [-o, 0], [-i, -i]];
  }
  if (shape === 'arrow') {
    const c = Math.cos(a), si = Math.sin(a);
    const pts = [[r + 1, 0], [-r, r * 0.85], [-r * 0.35, 0], [-r, -r * 0.85]];
    return pts.map(([x, y]) => [x * c - y * si, x * si + y * c]);
  }
  // hub / dot: a square
  return [[-r, -r], [r, -r], [r, r], [-r, r]];
}

function inPoly(pts, x, y) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/** Fill a polygon on whole pixels (pixel centres inside), offset to (cx, cy). */
function fillPoly(g, pts, cx, cy, color) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  g.fillStyle = color;
  for (let py = Math.floor(cy + y0); py <= Math.ceil(cy + y1); py++) {
    let run = -1;
    for (let px = Math.floor(cx + x0); px <= Math.ceil(cx + x1) + 1; px++) {
      const on = px <= Math.ceil(cx + x1) && inPoly(pts, px + 0.5 - cx, py + 0.5 - cy);
      if (on && run < 0) run = px;
      else if (!on && run >= 0) { g.fillRect(run, py, px - run, 1); run = -1; }
    }
  }
}

/**
 * Draw one marker at device pixel (px, py). `unit` = base marker size in device px.
 * Exported so the legend can show the exact same icons.
 */
export function drawMarker(g, type, px, py, unit, opts = {}) {
  const st = MAP_MARKERS[type];
  if (!st) return;
  const s = Math.max(2, Math.round(unit * st.size * (opts.scale || 1)));
  const cx = Math.round(px), cy = Math.round(py);
  if (st.shape === 'skull') {
    // Whole-pixel cells: an ink border one cell wide, then the bone.
    const k = Math.max(1, Math.round(s / 5)), x0 = cx - Math.floor((5 * k) / 2), y0 = cy - Math.floor((5 * k) / 2);
    g.fillStyle = INK;
    g.fillRect(x0 - k, y0 - k, 7 * k, 7 * k - k);
    SKULL.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '0') return;
      g.fillStyle = c === '1' ? (opts.dim ? '#4a5266' : st.color) : INK;
      g.fillRect(x0 + x * k, y0 + y * k, k, k);
    }));
    return;
  }
  const poly = shapePoly(st.shape, s, opts.a || 0);
  const o = Math.max(1, Math.round(unit / 5));   // outline thickness
  // Dark outline: the shape stamped at the 8 neighbouring offsets.
  for (let dy = -o; dy <= o; dy += o) for (let dx = -o; dx <= o; dx += o) if (dx || dy) fillPoly(g, poly, cx + dx, cy + dy, INK);
  fillPoly(g, poly, cx, cy, opts.dim ? '#4a5266' : st.color);
  // Hollow (◇): the inside punched back out in ink, a ring one outline thick.
  if (st.hollow && s > 3 * o + 1) fillPoly(g, shapePoly(st.shape, s - 3 * o, opts.a || 0), cx, cy, INK);
  if (st.core && !opts.dim) {
    const c = Math.max(1, Math.round(s / 3));
    g.fillStyle = st.core;
    if (st.shape === 'tri') g.fillRect(cx - Math.floor(c / 2), cy, c, c);
    else g.fillRect(cx - Math.floor(c / 2), cy - Math.floor(c / 2), c, c);
  }
}

/** Path2D of a pixel-stepped disc (union of row spans) for clipping. */
function pixelDisc(cx, cy, r) {
  const p = new Path2D();
  for (let y = -r; y < r; y++) {
    const yy = y + 0.5;
    const hw = Math.floor(Math.sqrt(Math.max(0, r * r - yy * yy)));
    if (hw > 0) p.rect(cx - hw, cy + y, hw * 2, 1);
  }
  return p;
}

// ---------------------------------------------------------------- the map

export class JungleMap {
  constructor(data, explored) {
    this.data = data;
    this.W = data.size;
    this.explored = explored;
    this.cell = JUNGLE.explore.cell;
    this.EC = Math.ceil(this.W / this.cell);
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.W;
    this._paintBase();
    this.fog = document.createElement('canvas');
    this.fog.width = this.fog.height = this.W;
    this._fogDirty = true;
    this._disc = null;
  }

  _paintBase() {
    const W = this.W, V = W + 1, d = this.data;
    const g = this.base.getContext('2d');
    const img = g.createImageData(W, W);
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const cols = LEVEL_COL.map(hex);
    const thick = hex('#132514'), bram = hex('#3a1a1e'), trail = hex('#8a6c48'), pave = hex('#6a6e66'), tree = hex('#0e1c10');
    const deep = hex('#0f2a52'), ford = hex('#b8c4b0'), ford2 = hex('#8fa39a');
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const lv = d.level[z * V + x];
      let c = cols[lv];
      if (lv === LEVEL.dirt) c = d.pave[z * V + x] ? pave : cols[2];
      const b = d.brush[i];
      if (b === BRUSH.thicket) c = thick; else if (b === BRUSH.bramble) c = bram;
      if (d.trail[i]) c = trail;
      // Deep water (impassable) reads dark blue; fords (the shallow crossings) as a pale stony strip.
      if (d.deep?.[i]) c = deep;
      if (d.ford?.[i]) c = ((x + z) & 1) ? ford : ford2;
      const o = i * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    for (const o of d.objects) {
      const tx = Math.floor(o.x), tz = Math.floor(o.z);
      if (o.kind === 'ruin') {
        for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = tx + dx, zz = tz + dz;
          if (xx < 0 || zz < 0 || xx >= W || zz >= W) continue;
          const k = (zz * W + xx) * 4;
          img.data[k] = 150; img.data[k + 1] = 150; img.data[k + 2] = 140;
        }
      } else if (o.kind === 'tree' && tx >= 0 && tz >= 0 && tx < W && tz < W) {
        const k = (tz * W + tx) * 4;
        img.data[k] = tree[0]; img.data[k + 1] = tree[1]; img.data[k + 2] = tree[2];
      }
    }
    g.putImageData(img, 0, 0);
  }

  /** Mark explored cells within r tiles of (x, z). Returns true if anything new was revealed. */
  reveal(x, z, r) {
    const c = this.cell, EC = this.EC;
    let any = false;
    for (let cz = Math.floor((z - r) / c); cz <= Math.floor((z + r) / c); cz++) {
      for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
        if (cx < 0 || cz < 0 || cx >= EC || cz >= EC) continue;
        if (Math.hypot((cx + 0.5) * c - x, (cz + 0.5) * c - z) > r) continue;
        const i = cz * EC + cx;
        if (!this.explored[i]) { this.explored[i] = 1; any = true; }
      }
    }
    if (any) { this._fogDirty = true; this._bounds = null; }
    return any;
  }

  isExplored(x, z) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    return cx >= 0 && cz >= 0 && cx < this.EC && cz < this.EC && !!this.explored[cz * this.EC + cx];
  }

  /** Bounding box of the explored area in tiles {x0, z0, x1, z1} (null if nothing is explored). */
  exploredBounds() {
    if (this._bounds !== undefined && this._bounds !== null) return this._bounds;
    const c = this.cell, EC = this.EC;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let cz = 0; cz < EC; cz++) for (let cx = 0; cx < EC; cx++) {
      if (!this.explored[cz * EC + cx]) continue;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cz < z0) z0 = cz; if (cz > z1) z1 = cz;
    }
    this._bounds = x0 === Infinity ? null : { x0: x0 * c, z0: z0 * c, x1: (x1 + 1) * c, z1: (z1 + 1) * c };
    return this._bounds;
  }

  _composite() {
    if (!this._fogDirty) return;
    this._fogDirty = false;
    const g = this.fog.getContext('2d');
    g.clearRect(0, 0, this.W, this.W);
    g.drawImage(this.base, 0, 0);
    const c = this.cell, EC = this.EC;
    g.fillStyle = INK;
    for (let cz = 0; cz < EC; cz++) for (let cx = 0; cx < EC; cx++) if (!this.explored[cz * EC + cx]) g.fillRect(cx * c, cz * c, c, c);
  }

  _markers(g, markers, toPx, unit, time, rim) {
    const sorted = markers.slice().sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
    for (const m of sorted) {
      if (!MAP_MARKERS[m.type]) continue;
      if (m.pulse && Math.sin(time * 6) < 0) continue;
      let [px, py] = toPx(m.x, m.z);
      let edge = false;
      if (rim && rim.box) {
        // Big map: return points and the objective stick to the canvas edge when panned away.
        const [x0, y0, x1, y1] = rim.box;
        if (px < x0 || py < y0 || px > x1 || py > y1) {
          if (!RIM.has(m.type)) continue;
          px = Math.max(x0, Math.min(x1, px)); py = Math.max(y0, Math.min(y1, py));
          edge = true;
        }
      } else if (rim) {
        const dx = px - rim.cx, dy = py - rim.cy, d = Math.hypot(dx, dy);
        if (d > rim.r) {
          if (!RIM.has(m.type)) continue;
          px = rim.cx + (dx / d) * rim.r; py = rim.cy + (dy / d) * rim.r;
          edge = true;
        }
      }
      drawMarker(g, m.type, px, py, unit, { a: m.a, scale: edge ? 0.8 : 1, dim: m.dim });
    }
  }

  /**
   * Round HUD minimap centred on (x, z). The canvas is square (device px); the disc fills it.
   * markers = [{ x, z, type, a?, pulse? }].
   */
  drawMini(canvas, x, z, markers, time = 0) {
    this._composite();
    const w = canvas.width;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, w);
    const r = Math.floor(w / 2);
    if (!this._disc || this._discR !== r) { this._disc = pixelDisc(r, r, r); this._discR = r; }
    const ppt = Math.max(1, Math.round(w / MAP_VIEW.miniSpan));
    const ox = Math.round(r - x * ppt), oz = Math.round(r - z * ppt);
    g.save();
    g.clip(this._disc);
    g.fillStyle = INK;
    g.fillRect(0, 0, w, w);
    g.drawImage(this.fog, ox, oz, this.W * ppt, this.W * ppt);
    g.restore();
    const unit = Math.max(3, Math.round(w / 24));
    this._markers(g, markers, (mx, mz) => [ox + mx * ppt, oz + mz * ppt], unit, time, { cx: r, cy: r, r: r - unit });
  }

  /** The big-map view that frames the explored area (plus `extra` points) in a w×h canvas. */
  fitView(w, h, extra = []) {
    const b = this.exploredBounds() || { x0: this.W / 2 - 10, z0: this.W / 2 - 10, x1: this.W / 2 + 10, z1: this.W / 2 + 10 };
    let { x0, z0, x1, z1 } = b;
    for (const p of extra) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const pad = MAP_VIEW.bigFitPad;
    x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
    const ppt = this.clampZoom(Math.floor(Math.min(w / (x1 - x0), h / (z1 - z0))), w, h);
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ppt };
  }

  clampZoom(ppt, w, h) {
    const min = Math.max(1, Math.floor(Math.min(w, h) / this.W));
    return Math.max(min, Math.min(MAP_VIEW.bigZoomMax, Math.round(ppt)));
  }

  /** Keep the view centre on the map. */
  clampView(v) {
    v.cx = Math.max(0, Math.min(this.W, v.cx));
    v.cz = Math.max(0, Math.min(this.W, v.cz));
    return v;
  }

  /**
   * Big map: view = { cx, cz, ppt } (tile centre, whole device px per tile). `labels` = [{ x, z, text }]: place
   * names (JungleRelics.labels), drawn in the pixel font at a whole multiple of 8 device px with a 1-step outline.
   */
  drawBig(canvas, view, markers, time = 0, labels = null) {
    this._composite();
    const w = canvas.width, h = canvas.height;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    // Beyond the jungle is a shade darker than unexplored jungle, so the world's edge reads as a tone
    // change (critic G #10: a 1 px frame line here looked like a seam splitting the panel).
    g.fillStyle = OUTSIDE;
    g.fillRect(0, 0, w, h);
    const ppt = view.ppt;
    const ox = Math.round(w / 2 - view.cx * ppt), oz = Math.round(h / 2 - view.cz * ppt);
    g.drawImage(this.fog, ox, oz, this.W * ppt, this.W * ppt);
    const unit = Math.max(4, Math.min(9, Math.round(ppt * 1.4)), Math.round(Math.min(w, h) / 90));
    const e = unit * 1.5;
    this._markers(g, markers, (mx, mz) => [ox + mx * ppt, oz + mz * ppt], unit, time, { box: [e, e, w - e, h - e] });
    // Place names after the markers (critic M2 P1-4): placed so they never cover another name or any marker.
    if (labels?.length) {
      const toPx = (mx, mz) => [ox + mx * ppt, oz + mz * ppt];
      this._labels(g, labels, toPx, w, h, Math.ceil(e), markerRects(markers, toPx, unit, [e, e, w - e, h - e]));
    }
  }

  /**
   * Place names over the map (over the markers, never on one): pale text, a one-font-pixel dark outline, whole
   * device pixels. Critic M: on the UI text grid (N 12 on the 360-unit-high canvas, at least 2 font pixels),
   * left-aligned at a rounded x (centred canvas text on an odd width lands on a half pixel).
   * Critic M2 P1-4: greedy placement. Labels go in order (`L.first` — e.g. the current goal — then nearest the view
   * centre); each tries above its anchor, below it, to its right, to its left, clamped inside the canvas, and takes
   * the first rect (text + one font pixel all round) that overlaps no placed label and no marker rect (`avoid`:
   * [x0, y0, x1, y1] for every marker drawn, markerRects). No free slot: the name waits for a closer zoom.
   */
  _labels(g, labels, toPx, w, h, lift = 0, avoid = []) {
    const k = Math.max(2, Math.round(h / 240));
    const fs = 8 * k;
    g.font = `${fs}px 'VR Glyphs', Tiny5, monospace`;
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    const placed = [];
    const hit = (r) => avoid.some((a) => r[0] < a[2] && r[2] > a[0] && r[1] < a[3] && r[3] > a[1])
      || placed.some((a) => r[0] < a[2] && r[2] > a[0] && r[1] < a[3] && r[3] > a[1]);
    const items = labels.map((L) => { const [ax, ay] = toPx(L.x, L.z); return { L, ax, ay, d: (L.first ? -1e9 : 0) + Math.hypot(ax - w / 2, ay - h / 2) }; })
      .filter((it) => it.ax > -w * 0.5 && it.ax < w * 1.5 && it.ay > -fs && it.ay < h + fs * 2)
      .sort((a, b) => a.d - b.d);
    for (const { L, ax, ay } of items) {
      const tw = Math.ceil(g.measureText(L.text).width);
      const slots = [
        [ax - tw / 2, ay - lift - k],               // above (baseline = text bottom)
        [ax - tw / 2, ay + lift + k + fs],          // below
        [ax + lift + k, ay + fs / 2],               // right of it
        [ax - lift - k - tw, ay + fs / 2],          // left of it
      ];
      let spot = null;
      for (const [sx, sy] of slots) {
        const px = Math.round(Math.max(k, Math.min(w - tw - k, sx))), py = Math.round(sy);
        if (py - fs < k || py > h - k) continue;
        const r = [px - k, py - fs - k, px + tw + k, py + k];
        if (!hit(r)) { spot = [px, py, r]; break; }
      }
      if (!spot) continue;
      const [px, py, r] = spot;
      placed.push(r);
      g.fillStyle = INK;
      for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k], [k, k], [-k, k], [k, -k], [-k, -k]]) g.fillText(L.text, px + dx, py + dy);
      g.fillStyle = '#ead4aa';
      g.fillText(L.text, px, py);
    }
    this._labelRects = { placed, avoid };   // (for the layout audit: no placed rect may meet another or a marker)
  }

  /** A small legend icon canvas for marker `type` (CSS size `css` px). */
  static legendIcon(type, css, dpr = window.devicePixelRatio || 1) {
    const c = document.createElement('canvas');
    const n = Math.max(8, Math.round(css * dpr));
    c.width = c.height = n;
    c.className = 'x-legicon';
    const g = c.getContext('2d');
    drawMarker(g, type, n / 2, n / 2, Math.round(n / 2.4), { a: -Math.PI / 2 });
    return c;
  }
}

/**
 * Screen rects [x0, y0, x1, y1] (device px, outline included) of every marker the big map draws — any type in
 * MAP_MARKERS, so new marker kinds are avoided by the place names too (critic M2 P1-4). Markers outside `box` are
 * skipped, except the rim kinds, which stick to its edge (as in _markers).
 */
function markerRects(markers, toPx, unit, box) {
  const out = [];
  const [x0, y0, x1, y1] = box;
  for (const m of markers || []) {
    const st = MAP_MARKERS[m.type];
    if (!st) continue;
    let [px, py] = toPx(m.x, m.z);
    let scale = 1;
    if (px < x0 || py < y0 || px > x1 || py > y1) {
      if (!RIM.has(m.type)) continue;
      px = Math.max(x0, Math.min(x1, px)); py = Math.max(y0, Math.min(y1, py));
      scale = 0.8;
    }
    const s = Math.max(2, Math.round(unit * st.size * scale));
    const half = Math.ceil(s / 2 + 1) + Math.max(1, Math.round(unit / 5));
    out.push([Math.round(px) - half, Math.round(py) - half, Math.round(px) + half, Math.round(py) + half]);
  }
  return out;
}
