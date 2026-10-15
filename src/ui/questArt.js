// Pixel art for the quest HUD (Stage 9: the quest arrow, its icon, the on-screen chevron), drawn texel by texel at
// run time so they sit on the world's texel grid at any angle: a shape is rasterised onto a small grid (a texel is
// filled when its centre is inside), then given a 1-texel ink outline and a bevel lit from the top-left (STYLE.md:
// Endesga-32, light from the top-left, 1 px #181425 outline). Shown at whole-texel scales (`--tx`, image-rendering:
// pixelated), so the edge arrow can point 16 ways without a single blurred pixel. Canvases are cached.

const INK = '#181425';
// Fill ramps: [shadow, body, light, sparkle].
export const QUEST_RAMPS = {
  amber: ['#f77622', '#feae34', '#fee761', '#ffffff'],
  bright: ['#feae34', '#fee761', '#ffffff', '#ffffff'],
  cyan: ['#0099db', '#2ce8f5', '#c0f6ff', '#ffffff'],
  cyanBright: ['#2ce8f5', '#c0f6ff', '#ffffff', '#ffffff'],
};

const cache = new Map();

/**
 * Rasterise `inside(x, y)` (texel-centre coordinates relative to the canvas centre, y down) onto an n × n grid with
 * an ink outline and a top-left bevel in `ramp`. Returns a canvas (cached by `key`).
 */
function raster(key, n, inside, ramp, glow = 0) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const h = (n - 1) / 2;
  const fill = new Uint8Array(n * n);   // 1 = body, 2 = ink outline
  const m = 1 + glow;
  for (let y = m; y < n - m; y++) for (let x = m; x < n - m; x++) if (inside(x - h, y - h)) fill[y * n + x] = 1;
  const at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? 0 : fill[y * n + x]);
  const near = (x, y, v, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if ((dx || dy) && at(x + dx, y + dy) === v) return true; return false; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!at(x, y) && near(x, y, 1, 1)) fill[y * n + x] = 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let col = null;
    const v = at(x, y);
    if (v === 1) {
      // Lit from the top-left: an edge facing up/left is light, one facing down/right is shadow.
      const b = (xx, yy) => at(xx, yy) === 1;
      const lit = !b(x - 1, y) || !b(x, y - 1), dark = !b(x + 1, y) || !b(x, y + 1);
      col = lit && !dark ? ramp[2] : dark && !lit ? ramp[0] : ramp[1];
    } else if (v === 2) col = INK;
    else if (glow && near(x, y, 2, 1)) col = ramp[2];                                     // a glow: a light ring…
    else if (glow > 1 && near(x, y, 2, 2)) col = (x + y) % 2 === 0 ? ramp[1] : null;   // …and a dithered one
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  cache.set(key, c);
  return c;
}

function inPoly(poly, x, y) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/**
 * The quest arrow: a chunky dart (➤) pointing along screen angle `dir` × 2π / `dirs` (0 = right, y down), `n` texels
 * square with its outline. `ramp` = a QUEST_RAMPS key.
 */
export function arrowCanvas(dir, dirs, n, ramp = 'amber', glow = 0) {
  const r = (n - 3) / 2 - glow;   // inside the outline (and the glow)
  if (n < 17) {
    // Small ones (the tracker's, the pointer by the player): 8 directions, a 90-degree arrowhead with a stub, drawn
    // straight or on the diagonal and turned by quarter turns (rotated polygons were mush at 11 texels).
    const d8 = ((Math.round((dir * 8) / dirs) % 8) + 8) % 8, q = d8 >> 1;
    const base = d8 % 2 === 0
      ? (x, y) => (Math.abs(y) <= r - x + 0.2 && x >= -r * 0.15) || (Math.abs(y) <= r * 0.3 && x >= -r - 0.2)        // ➤ right
      : (x, y) => (x <= r + 0.2 && y <= r + 0.2 && x + y >= r * 0.5) || (Math.abs(x - y) <= r * 0.45 && x + y >= -r * 1.5);   // ↘
    // A quarter turn clockwise (y down) per q: the point (x, y) of the turned shape is (y, -x) of the one before.
    const rot = (x, y, k) => (k === 0 ? base(x, y) : rot(y, -x, k - 1));
    return raster(`arrow8:${d8}:${n}:${ramp}`, n, (x, y) => rot(x, y, q), QUEST_RAMPS[ramp]);
  }
  const a = (dir * Math.PI * 2) / dirs;
  const ca = Math.cos(a), sa = Math.sin(a);
  // In the arrow's own frame (pointing +x): a big head and a short shaft (a bare arrowhead read as a blob at the
  // diagonals: its wings were as long as its tip).
  const poly = [[r + 0.4, 0], [-0.05 * r, r * 0.86], [-0.05 * r, r * 0.34], [-r - 0.2, r * 0.34], [-r - 0.2, -r * 0.34], [-0.05 * r, -r * 0.34], [-0.05 * r, -r * 0.86]];
  return raster(`arrow:${dir}/${dirs}:${n}:${ramp}:${glow}`, n, (x, y) => inPoly(poly, x * ca + y * sa, -x * sa + y * ca), QUEST_RAMPS[ramp], glow);
}

/** The quest icon: a bevelled ◆ (the map's goal marker), `n` texels with its outline. */
export function diamondCanvas(n = 11, ramp = 'amber') {
  const r = (n - 2) / 2;
  const c = raster(`diamond:${n}:${ramp}`, n, (x, y) => Math.abs(x) + Math.abs(y) <= r - 0.4, QUEST_RAMPS[ramp]);
  if (!c._spark) {
    // A one-texel sparkle in the lit half.
    c._spark = true;
    const g = c.getContext('2d');
    const h = Math.floor(n / 2);
    g.fillStyle = QUEST_RAMPS[ramp][3];
    g.fillRect(h - 1, h - 1, 1, 1);
  }
  return c;
}

/** A downward chevron (▼) under the on-screen quest marker: `w` texels wide. */
export function chevronCanvas(w = 11, ramp = 'amber') {
  const key = `chev:${w}:${ramp}`;
  if (cache.has(key)) return cache.get(key);
  const r = (w - 3) / 2;
  // A wide, short triangle pointing down, drawn into a square grid, then cropped to the rows it uses.
  const poly = [[-r - 0.3, -r * 0.5], [r + 0.3, -r * 0.5], [0, r * 0.62]];
  const sq = raster(`${key}:sq`, w, (x, y) => inPoly(poly, x, y), QUEST_RAMPS[ramp]);
  const px = sq.getContext('2d').getImageData(0, 0, w, w).data;
  let y0 = w, y1 = -1;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const c = document.createElement('canvas');
  c.width = w; c.height = Math.max(1, y1 - y0 + 1);
  c.getContext('2d').drawImage(sq, 0, y0, w, c.height, 0, 0, w, c.height);
  cache.set(key, c);
  return c;
}

/** A copy of a cached canvas (DOM nodes can't share one canvas). */
export function cloneCanvas(src, cls = '') {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  if (cls) c.className = cls;
  return c;
}
