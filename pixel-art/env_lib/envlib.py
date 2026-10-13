"""Shared helpers for the Verdant Relay environment art (group: env).

- `C`        : Endesga-32 colours by name (the only palette allowed, see STYLE.md).
- `Tile`     : a wrap-around pixel grid for seamless tiles (every op wraps modulo w/h).
- previews   : tiled 4x4 sheets, night tint, labelled contact sheets, room mock-ups.
"""
import random
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
_local = ROOT / ".claude/skills/pixel-art-studio/scripts"
sys.path.insert(0, str(_local if _local.exists() else Path.home() / ".claude/skills/pixel-art-studio/scripts"))
from pixelstudio import Sprite, PALETTES, hex2rgba  # noqa: E402

SPRITES = ROOT / "public" / "sprites"
ART = ROOT / "pixel-art"

C = dict(
    ink="#181425", sl0="#262b44", sl1="#3a4466", sl2="#5a6988", sl3="#8b9bb4", sl4="#c0cbdc", white="#ffffff",
    g0="#193c3e", g1="#265c42", g2="#3e8948", g3="#63c74d",
    br0="#3e2731", br1="#733e39", br2="#b86f50", br3="#c28569", br4="#e4a672", skin="#e8b796", cream="#ead4aa",
    org="#d77643", rust="#be4a2f", orange="#f77622", amber="#feae34", yellow="#fee761",
    red0="#a22633", red="#e43b44", hot="#ff0044",
    bl0="#124e89", bl1="#0099db", cyan="#2ce8f5",
    pu0="#68386c", pu1="#b55088", pink="#f6757a",
)
E32 = PALETTES["endesga32"]
E32_RGB = {hex2rgba(c)[:3] for c in E32}


def rgb(c):
    return hex2rgba(c)[:3]


# --------------------------------------------------------------------------- tiles
class Tile:
    """Seamless tile canvas. Coordinates wrap, so anything drawn across an edge
    continues on the opposite side: seams are impossible by construction."""

    def __init__(self, base, w=32, h=32, seed=0):
        self.w, self.h = w, h
        self.g = [[base] * w for _ in range(h)]
        self.rng = random.Random(seed)

    # -- basics
    def get(self, x, y):
        return self.g[y % self.h][x % self.w]

    def _ok(self, x, y, only, avoid):
        cur = self.get(x, y)
        if only is not None:
            if isinstance(only, (list, tuple, set)):
                if cur not in only:
                    return False
            elif cur != only:
                return False
        if avoid is not None:
            if isinstance(avoid, (list, tuple, set)):
                if cur in avoid:
                    return False
            elif cur == avoid:
                return False
        return True

    def px(self, x, y, c, only=None, avoid=None):
        if self._ok(x, y, only, avoid):
            self.g[y % self.h][x % self.w] = c

    def rect(self, x0, y0, x1, y1, c, only=None, avoid=None):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c, only, avoid)

    def hline(self, x0, x1, y, c, **k):
        for x in range(x0, x1 + 1):
            self.px(x, y, c, **k)

    def vline(self, x, y0, y1, c, **k):
        for y in range(y0, y1 + 1):
            self.px(x, y, c, **k)

    def line(self, x0, y0, x1, y1, c, **k):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, c, **k)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def path(self, pts, c, **k):
        for a, b in zip(pts, pts[1:]):
            self.line(a[0], a[1], b[0], b[1], c, **k)

    def blob(self, cx, cy, rx, ry, c, rough=0.25, only=None, avoid=None):
        """Irregular filled ellipse (moss patch, puddle). Edge jitter from the tile rng."""
        for y in range(-ry - 1, ry + 2):
            for x in range(-rx - 1, rx + 2):
                d = (x / max(rx, 0.5)) ** 2 + (y / max(ry, 0.5)) ** 2
                if d <= 1.0 + self.rng.uniform(-rough, rough) * (1 if d > 0.45 else 0):
                    self.px(cx + x, cy + y, c, only, avoid)

    def speckle(self, c, density, only=None, avoid=None, box=None):
        x0, y0, x1, y1 = box or (0, 0, self.w - 1, self.h - 1)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if self.rng.random() < density:
                    self.px(x, y, c, only, avoid)

    def scatter(self, n, fn):
        """Call fn(x, y) at n jittered-grid positions: even coverage, no clumps, no grid."""
        k = max(1, round(n ** 0.5))
        cw, ch = self.w / k, self.h / k
        cells = [(i, j) for j in range(k) for i in range(k)]
        self.rng.shuffle(cells)
        for i, j in cells[:n]:
            fn(int(i * cw + self.rng.uniform(0, cw)), int(j * ch + self.rng.uniform(0, ch)))

    def field(self, cells=(4, 8), weights=(0.65, 0.35)):
        """Periodic smooth value noise in [0,1] (wraps at the tile size): organic masks
        for puddles, moss and dirt that never form a repeated round blob."""
        import math
        out = [[0.0] * self.w for _ in range(self.h)]
        for n, wgt in zip(cells, weights):
            grid = [[self.rng.random() for _ in range(n)] for _ in range(n)]
            for y in range(self.h):
                for x in range(self.w):
                    fx, fy = x * n / self.w, y * n / self.h
                    x0, y0 = int(fx), int(fy)
                    tx, ty = fx - x0, fy - y0
                    tx = tx * tx * (3 - 2 * tx)
                    ty = ty * ty * (3 - 2 * ty)
                    a = grid[y0 % n][x0 % n]
                    b = grid[y0 % n][(x0 + 1) % n]
                    c = grid[(y0 + 1) % n][x0 % n]
                    d = grid[(y0 + 1) % n][(x0 + 1) % n]
                    out[y][x] += wgt * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty)
        lo = min(min(r) for r in out)
        hi = max(max(r) for r in out)
        return [[(v - lo) / (hi - lo + 1e-9) for v in r] for r in out]

    def mask_paint(self, field, lo, hi, c, only=None, avoid=None):
        for y in range(self.h):
            for x in range(self.w):
                if lo <= field[y][x] <= hi:
                    self.px(x, y, c, only, avoid)

    def neighbours(self, x, y, c):
        return sum(self.get(x + dx, y + dy) == c for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))

    def despeckle(self, keep=(), min_n=1):
        """Remove lone pixels (no same-colour 4-neighbour) unless their colour is in keep."""
        out = [row[:] for row in self.g]
        for y in range(self.h):
            for x in range(self.w):
                c = self.g[y][x]
                if c in keep:
                    continue
                if self.neighbours(x, y, c) < min_n:
                    # adopt the most common neighbour colour
                    nb = [self.get(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                    out[y][x] = max(set(nb), key=nb.count)
        self.g = out

    def image(self):
        im = Image.new("RGBA", (self.w, self.h))
        p = im.load()
        for y in range(self.h):
            for x in range(self.w):
                p[x, y] = rgb(self.g[y][x]) + (255,)
        return im


# --------------------------------------------------------------------------- image utils
def up(im, s):
    return im.resize((im.width * s, im.height * s), Image.NEAREST)


def tiled(im, nx=4, ny=4):
    out = Image.new("RGBA", (im.width * nx, im.height * ny))
    for j in range(ny):
        for i in range(nx):
            out.paste(im, (i * im.width, j * im.height))
    return out


def night(im, k=(0.42, 0.52, 0.95)):
    """Approximate the game's bluish night grade (multiply)."""
    im = im.convert("RGBA")
    p = im.load()
    out = Image.new("RGBA", im.size)
    q = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            q[x, y] = (int(r * k[0]), int(g * k[1]), int(b * k[2]), a)
    return out


def check_palette(im, name=""):
    bad = set()
    semi = 0
    for px in im.getdata():
        if 0 < px[3] < 255:
            semi += 1
        if px[3] and px[:3] not in E32_RGB:
            bad.add(px[:3])
    if bad or semi:
        print(f"  !! {name}: off-palette {len(bad)} {list(bad)[:4]}  semi-alpha {semi}")
    return not bad and not semi


def label_sheet(items, path, scale=4, cols=6, bg=(46, 50, 64), pad=10, cell=None):
    """items: list of (label, PIL image). Lays them on a grid with labels underneath."""
    ims = [(l, up(i, scale)) for l, i in items]
    cw = cell[0] if cell else max(i.width for _, i in ims)
    ch = cell[1] if cell else max(i.height for _, i in ims)
    rows = (len(ims) + cols - 1) // cols
    W = cols * (cw + pad) + pad
    H = rows * (ch + pad + 14) + pad
    out = Image.new("RGBA", (W, H), bg + (255,))
    d = ImageDraw.Draw(out)
    for n, (l, i) in enumerate(ims):
        cx, cy = n % cols, n // cols
        x = pad + cx * (cw + pad)
        y = pad + cy * (ch + pad + 14)
        out.alpha_composite(i, (x + (cw - i.width) // 2, y + ch - i.height))
        d.text((x, y + ch + 2), l, fill=(230, 230, 230))
    out.save(path)
    return out


def load_room_templates():
    src = (ROOT / "src/data/rooms.js").read_text(encoding="utf8")
    out = []
    for m in re.finditer(r"type: '(\w+)', rows: \[(.*?)\]", src, re.S):
        rows = re.findall(r"'([^']*)'", m.group(2))
        out.append((m.group(1), rows))
    return out


# --------------------------------------------------------------------------- sprite canvas
class Pix:
    """Plain pixel canvas for billboards (None = transparent). Small, explicit, no AA."""

    def __init__(self, w, h, seed=0):
        self.w, self.h = w, h
        self.g = [[None] * w for _ in range(h)]
        self.rng = random.Random(seed)

    def inside(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def get(self, x, y):
        return self.g[y][x] if self.inside(x, y) else None

    def _ok(self, x, y, only, avoid):
        cur = self.get(x, y)
        if only == "opaque":
            if cur is None:
                return False
        elif only == "empty":
            if cur is not None:
                return False
        elif only is not None:
            if isinstance(only, (list, tuple, set)):
                if cur not in only:
                    return False
            elif cur != only:
                return False
        if avoid is not None:
            if isinstance(avoid, (list, tuple, set)):
                if cur in avoid:
                    return False
            elif cur == avoid:
                return False
        return True

    def px(self, x, y, c, only=None, avoid=None):
        x, y = int(round(x)), int(round(y))
        if self.inside(x, y) and self._ok(x, y, only, avoid):
            self.g[y][x] = c

    def pts(self, pts, c, **k):
        for x, y in pts:
            self.px(x, y, c, **k)

    def rect(self, x0, y0, x1, y1, c, **k):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c, **k)

    def hline(self, x0, x1, y, c, **k):
        for x in range(min(x0, x1), max(x0, x1) + 1):
            self.px(x, y, c, **k)

    def vline(self, x, y0, y1, c, **k):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            self.px(x, y, c, **k)

    @staticmethod
    def line_pts(x0, y0, x1, y1):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        out = []
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            out.append((x0, y0))
            if x0 == x1 and y0 == y1:
                return out
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def line(self, x0, y0, x1, y1, c, **k):
        self.pts(self.line_pts(x0, y0, x1, y1), c, **k)

    def path(self, ptsl, c, **k):
        for a, b in zip(ptsl, ptsl[1:]):
            self.line(a[0], a[1], b[0], b[1], c, **k)

    @staticmethod
    def ellipse_pts(cx, cy, rx, ry):
        out = []
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((x - cx) / max(rx, 0.5)) ** 2 + ((y - cy) / max(ry, 0.5)) ** 2 <= 1.0:
                    out.append((x, y))
        return out

    def ellipse(self, cx, cy, rx, ry, c, **k):
        self.pts(self.ellipse_pts(cx, cy, rx, ry), c, **k)

    @staticmethod
    def poly_pts(points):
        from PIL import Image as _I, ImageDraw as _D
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        x0, y0 = int(min(xs)) - 1, int(min(ys)) - 1
        w, h = int(max(xs)) - x0 + 3, int(max(ys)) - y0 + 3
        m = _I.new("1", (w, h), 0)
        _D.Draw(m).polygon([(x - x0, y - y0) for x, y in points], fill=1, outline=1)
        return [(x + x0, y + y0) for y in range(h) for x in range(w) if m.getpixel((x, y))]

    def poly(self, points, c, **k):
        self.pts(self.poly_pts(points), c, **k)

    def thick(self, ptsl, width, c, **k):
        """Polyline with a square brush of `width` (for trunks, fronds, vines)."""
        for a, b in zip(ptsl, ptsl[1:]):
            for x, y in self.line_pts(a[0], a[1], b[0], b[1]):
                for dy in range(width):
                    for dx in range(width):
                        self.px(x + dx - width // 2, y + dy - width // 2, c, **k)

    def opaque(self):
        return [(x, y) for y in range(self.h) for x in range(self.w) if self.g[y][x] is not None]

    def outline(self, c=C["ink"], diagonals=False):
        nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if diagonals:
            nb += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
        todo = [(x, y) for y in range(self.h) for x in range(self.w)
                if self.g[y][x] is None and any(self.get(x + dx, y + dy) not in (None,) for dx, dy in nb)]
        for x, y in todo:
            self.g[y][x] = c

    def despeckle_alpha(self):
        """Delete lone opaque pixels with no 4-neighbour (orphans to transparency)."""
        kill = [(x, y) for x, y in self.opaque()
                if all(self.get(x + dx, y + dy) is None for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for x, y in kill:
            self.g[y][x] = None

    def copy(self):
        p = Pix(self.w, self.h)
        p.g = [r[:] for r in self.g]
        p.rng = self.rng
        return p

    def image(self):
        im = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        p = im.load()
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] is not None:
                    p[x, y] = rgb(self.g[y][x]) + (255,)
        return im


def strip(frames):
    ims = [f.image() if isinstance(f, Pix) else f for f in frames]
    out = Image.new("RGBA", (sum(i.width for i in ims), ims[0].height), (0, 0, 0, 0))
    x = 0
    for i in ims:
        out.paste(i, (x, 0))
        x += i.width
    return out


def bottom_touch(im, frames=1):
    """Check that each frame's opaque pixels reach the bottom row (STYLE.md anchoring)."""
    fw = im.width // frames
    ok = True
    for f in range(frames):
        row = [im.getpixel((x, im.height - 1))[3] for x in range(f * fw, (f + 1) * fw)]
        if not any(row):
            ok = False
    return ok


def deliver(key, frames, prev_dir, bgs=None, scale=6):
    """Save the 1x master strip to public/sprites and previews (on floor tiles + night)."""
    im = strip(frames) if isinstance(frames, list) else frames
    n = len(frames) if isinstance(frames, list) else 1
    im.save(SPRITES / f"{key}.png")
    check_palette(im, key)
    if not bottom_touch(im, n):
        print(f"  !! {key}: does not touch the bottom row")
    prev_dir.mkdir(parents=True, exist_ok=True)
    up(im, scale).save(prev_dir / f"{key}_x{scale}.png")
    # on-floor previews: day + night, on a few floors
    bgs = bgs or ["floor_overgrown_market", "floor_canopy_greenhouse", "floor_defense", "floor_data_center"]
    fw = im.width // n
    cols = []
    for b in bgs:
        p = SPRITES / f"{b}.png"
        if not p.exists():
            continue
        tile = Image.open(p).convert("RGBA")
        tw = (fw + 32 + 31) // 32 + 1
        th = (im.height + 16 + 31) // 32 + 1
        bg = tiled(tile, tw, th)
        for fr in range(n):
            c = bg.copy()
            c.alpha_composite(im.crop((fr * fw, 0, (fr + 1) * fw, im.height)),
                              ((bg.width - fw) // 2, bg.height - im.height - 8))
            cols.append(c)
            cols.append(night(c))
    if cols:
        W = sum(c.width for c in cols) + 4 * len(cols)
        H = max(c.height for c in cols)
        sheet = Image.new("RGBA", (W, H), (20, 18, 30, 255))
        x = 0
        for c in cols:
            sheet.alpha_composite(c, (x, H - c.height))
            x += c.width + 4
        up(sheet, 3).save(prev_dir / f"{key}_onfloor.png")
    return im


# --------------------------------------------------------------------------- foliage
LEAF_DABS = [
    [(0, 0), (1, 0), (1, -1)],
    [(0, 0), (1, 0), (2, -1)],
    [(0, 0), (0, 1), (1, 1)],
    [(0, 0), (1, 1), (1, 0)],
    [(0, 0), (-1, 1), (0, 1)],
    [(0, 0), (1, 0), (2, 0), (1, -1)],
]


def foliage(p, cx, cy, rx, ry, ramp, jag=0.45, dabs=1.0, light=(-0.75, -0.65), shade_bias=0.0, only=None):
    """Lit leaf mass. ramp = 4 colours dark->light. Directional bands (lit top-left, not a
    pillow), broken up by leaf-shaped dabs, rim jagged with leaf tips."""
    import math
    rng = p.rng
    pts = Pix.ellipse_pts(cx, cy, rx, ry)
    # leaf tips sticking out of the rim
    n = int(2 * math.pi * max(rx, ry) * jag)
    for i in range(n):
        a = rng.uniform(0, 2 * math.pi)
        ex, ey = cx + math.cos(a) * (rx + 0.5), cy + math.sin(a) * (ry + 0.5)
        pts.append((round(ex), round(ey)))
        if rng.random() < 0.4:
            pts.append((round(ex + math.cos(a)), round(ey + math.sin(a))))
    lx, ly = light
    ln = math.hypot(lx, ly)
    lx, ly = lx / ln, ly / ln
    col = {}
    for x, y in pts:
        nx, ny = (x - cx) / max(rx, 1), (y - cy) / max(ry, 1)
        l = nx * lx + ny * ly + rng.uniform(-0.22, 0.22) - shade_bias
        idx = 3 if l > 0.62 else 2 if l > 0.05 else 1 if l > -0.55 else 0
        col[(x, y)] = idx
    for (x, y), idx in col.items():
        p.px(x, y, ramp[idx], only=only)
    # leaf dabs: lighter dabs on the lit half, darker dabs on the shadow half
    k = int(len(col) * 0.06 * dabs)
    keys = list(col.keys())
    for _ in range(k):
        x, y = rng.choice(keys)
        idx = col[(x, y)]
        d = rng.choice(LEAF_DABS)
        lit = (x - cx) * lx + (y - cy) * ly > 0
        j = min(3, idx + 1) if lit else max(0, idx - 1)
        for dx, dy in d:
            if (x + dx, y + dy) in col:
                p.px(x + dx, y + dy, ramp[j], only=only)
    return col


def vine(p, x, y, length, ramp, rng=None, sway=1, leaves=0.35):
    """Hanging vine: 1px stem drifting sideways, small leaves alternating sides."""
    rng = rng or p.rng
    pts = []
    for i in range(length):
        if rng.random() < 0.25:
            x += rng.choice([-sway, sway])
        pts.append((x, y + i))
    for i, (vx, vy) in enumerate(pts):
        p.px(vx, vy, ramp[1])
        if rng.random() < leaves:
            s = -1 if i % 2 else 1
            p.px(vx + s, vy, ramp[2] if s < 0 else ramp[1])
            p.px(vx + s, vy - 1, ramp[2] if s < 0 else ramp[0])
    return pts


def chunk(p, top, depth, ramp, crack=True):
    """Solid block at 3/4 view: polygon top face extruded `depth` px downward.
    ramp = [shadow, side, top, rim-light]. Lit rim on the top-left edges of the top face."""
    tp = set(Pix.poly_pts(top))
    side = set()
    for x, y in tp:
        for d in range(1, depth + 1):
            if (x, y + d) not in tp:
                side.add((x, y + d))
    cx = sum(x for x, _ in tp) / max(1, len(tp))
    for x, y in side:
        p.px(x, y, ramp[0] if x > cx + 1 else ramp[1])
    for x, y in side:  # bottom edge of the side face in shadow
        if (x, y + 1) not in side and (x, y + 1) not in tp:
            p.px(x, y, ramp[0])
    for x, y in tp:
        p.px(x, y, ramp[2])
    for x, y in tp:
        if (x - 1, y) not in tp or (x, y - 1) not in tp:
            if x <= cx + 2:
                p.px(x, y, ramp[3])
    if crack and len(tp) > 20:
        x, y = p.rng.choice(sorted(tp))
        for _ in range(4):
            if (x, y) in tp:
                p.px(x, y, ramp[1])
            x += p.rng.choice([0, 1])
            y += 1
    return tp, side
