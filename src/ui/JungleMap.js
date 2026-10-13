// Jungle maps: a base image of the whole world (1 px per tile) painted once from the generated data,
// hidden under fog until explored (run.world.explored, revealed around the player and by pylons),
// plus live markers. Two views: the HUD minimap (a window around the player) and the big map (Tab).

import { LEVEL, BRUSH, JUNGLE } from '../data/jungle.js';

export const MAP_MARKERS = {
  relay: { color: '#2ce8f5', label: 'Relay (return)' },
  pylon_on: { color: '#2ce8f5', label: 'Pylon (return)' },
  pylon_off: { color: '#5a6988', label: 'Pylon (inactive)' },
  objective: { color: '#feae34', label: 'Objective' },
  optional: { color: '#c47bff', label: 'Optional' },
  container: { color: '#ead4aa', label: 'Supplies' },
  player: { color: '#ffffff', label: 'You' },
};

const LEVEL_COL = ['#1c4a4a', '#3b2c1f', '#6b5136', '#25301c', '#2c4a25'];

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
  }

  _paintBase() {
    const W = this.W, V = W + 1, d = this.data;
    const g = this.base.getContext('2d');
    const img = g.createImageData(W, W);
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const cols = LEVEL_COL.map(hex);
    const thick = hex('#132514'), bram = hex('#3a1a1e'), trail = hex('#8a6c48'), pave = hex('#6a6e66'), tree = hex('#0e1c10');
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const lv = d.level[z * V + x];
      let c = cols[lv];
      if (lv === LEVEL.dirt) c = d.pave[z * V + x] ? pave : cols[2];
      const b = d.brush[i];
      if (b === BRUSH.thicket) c = thick; else if (b === BRUSH.bramble) c = bram;
      if (d.trail[i]) c = trail;
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
    if (any) this._fogDirty = true;
    return any;
  }

  isExplored(x, z) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    return cx >= 0 && cz >= 0 && cx < this.EC && cz < this.EC && !!this.explored[cz * this.EC + cx];
  }

  _composite() {
    if (!this._fogDirty) return;
    this._fogDirty = false;
    const g = this.fog.getContext('2d');
    g.clearRect(0, 0, this.W, this.W);
    g.drawImage(this.base, 0, 0);
    const c = this.cell, EC = this.EC;
    g.fillStyle = '#0b0a12';
    for (let cz = 0; cz < EC; cz++) for (let cx = 0; cx < EC; cx++) if (!this.explored[cz * EC + cx]) g.fillRect(cx * c, cz * c, c, c);
  }

  /**
   * Draw a view into `canvas` (device px): centre (x, z) in tiles, `span` tiles across, markers =
   * [{ x, z, type, pulse? }]. full = draw the whole map instead of a window.
   */
  draw(canvas, x, z, span, markers, full = false, time = 0) {
    this._composite();
    const w = canvas.width, h = canvas.height;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b0a12';
    g.fillRect(0, 0, w, h);
    const ppt = full ? Math.min(w, h) / this.W : w / span;
    const ox = full ? (w - this.W * ppt) / 2 : w / 2 - x * ppt;
    const oz = full ? (h - this.W * ppt) / 2 : h / 2 - z * ppt;
    g.drawImage(this.fog, ox, oz, this.W * ppt, this.W * ppt);
    const dot = Math.max(3, Math.round(ppt * (full ? 2.5 : 2)));
    for (const m of markers) {
      const st = MAP_MARKERS[m.type];
      if (!st) continue;
      let px = ox + m.x * ppt, py = oz + m.z * ppt;
      let edge = false;
      if (!full) {
        // Off-window objective markers stick to the minimap edge.
        const pad = dot;
        if (px < pad || py < pad || px > w - pad || py > h - pad) {
          if (m.type !== 'objective' && m.type !== 'relay' && m.type !== 'pylon_on') continue;
          px = Math.max(pad, Math.min(w - pad, px)); py = Math.max(pad, Math.min(h - pad, py));
          edge = true;
        }
      }
      const s = m.type === 'player' ? dot + 1 : edge ? dot - 1 : dot;
      if (m.pulse && Math.sin(time * 6) < 0) continue;
      g.fillStyle = '#0b0a12';
      g.fillRect(Math.round(px - s / 2) - 1, Math.round(py - s / 2) - 1, s + 2, s + 2);
      g.fillStyle = st.color;
      if (m.type === 'objective' || m.type === 'optional') {
        // Diamond.
        for (let k = 0; k < s; k++) {
          const half = Math.round((k < s / 2 ? k : s - 1 - k));
          g.fillRect(Math.round(px) - half, Math.round(py - s / 2) + k, half * 2 + 1, 1);
        }
      } else g.fillRect(Math.round(px - s / 2), Math.round(py - s / 2), s, s);
    }
  }
}
