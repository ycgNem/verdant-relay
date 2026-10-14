"""Shared helpers for the V3 hand-made art batch (critic H §7): leaf frame, water fx, spore pod/puffs,
logo, Collection icons, panel frame.

Everything is drawn at 1x on a hard grid. Organic shapes are built as float polygons, rasterised
4x supersampled and thresholded at 50% coverage (so curves step cleanly), then shaded per pixel by
hand-written rules (light from the top-left). Exports are alpha 0/255 only.

    from v3lib import Grid, Shape, bez, Path2, save_strip, contact, up, LIGHT
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SPRITES = ROOT / "public" / "sprites"
SCRATCH = ROOT / ".playwright-mcp" / "art1"
SCRATCH.mkdir(parents=True, exist_ok=True)

_local = ROOT / ".claude/skills/pixel-art-studio/scripts"
sys.path.insert(0, str(_local if _local.exists() else Path.home() / ".claude/skills/pixel-art-studio/scripts"))
from pixelstudio import hex2rgba, mix, ramp  # noqa: E402,F401

LIGHT = (-math.sqrt(0.5), -math.sqrt(0.5))   # direction TOWARD the light (top-left), y down
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
N8 = N4 + ((1, 1), (1, -1), (-1, 1), (-1, -1))


def rgb(c):
    return hex2rgba(c)[:3]


# --------------------------------------------------------------------------- geometry
def bez(p0, p1, p2, p3, t):
    a = (1 - t) ** 3
    b = 3 * (1 - t) ** 2 * t
    c = 3 * (1 - t) * t * t
    d = t ** 3
    return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])


class Path2:
    """A smooth centreline (cubic Bezier chain), arc-length parametrised: at(u) / tan(u) / nrm(u), u in [0,1].
    nrm = tangent rotated +90deg (y down): the right-hand side when walking along the path."""

    def __init__(self, ctrl, n=600):
        # ctrl: [p0, c1, c2, p1, c3, c4, p2, ...] (3k+1 points)
        pts = []
        segs = (len(ctrl) - 1) // 3
        for s in range(segs):
            P = ctrl[3 * s: 3 * s + 4]
            for i in range(n // segs + (1 if s == segs - 1 else 0)):
                pts.append(bez(*P, i / (n // segs)))
        self.pts = pts
        L = [0.0]
        for a, b in zip(pts, pts[1:]):
            L.append(L[-1] + math.dist(a, b))
        self.L = L
        self.length = L[-1]

    def _idx(self, u):
        s = max(0.0, min(1.0, u)) * self.length
        lo, hi = 0, len(self.L) - 1
        while lo < hi - 1:
            m = (lo + hi) // 2
            if self.L[m] <= s:
                lo = m
            else:
                hi = m
        seg = self.L[hi] - self.L[lo] or 1e-9
        return lo, hi, (s - self.L[lo]) / seg

    def at(self, u):
        if u < 0:   # extend straight back along the start tangent
            p, t = self.at(0), self.tan(0)
            return (p[0] + t[0] * u * self.length, p[1] + t[1] * u * self.length)
        if u > 1:
            p, t = self.at(1), self.tan(1)
            return (p[0] + t[0] * (u - 1) * self.length, p[1] + t[1] * (u - 1) * self.length)
        lo, hi, f = self._idx(u)
        a, b = self.pts[lo], self.pts[hi]
        return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)

    def tan(self, u):
        u = max(0.0, min(1.0, u))
        e = 1.5 / max(self.length, 1)
        a, b = self.at(max(0.0, u - e)), self.at(min(1.0, u + e))
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1e-9
        return (dx / d, dy / d)

    def nrm(self, u):
        t = self.tan(u)
        return (-t[1], t[0])

    def local(self, u, v):
        """Leaf-local (u along, v across in px) -> image point."""
        p, n = self.at(u), self.nrm(max(0.0, min(1.0, u)))
        return (p[0] + n[0] * v, p[1] + n[1] * v)


def interp(knots, x):
    """Catmull-Rom through (x, y) knots (x ascending), clamped."""
    xs = [k[0] for k in knots]
    if x <= xs[0]:
        return knots[0][1]
    if x >= xs[-1]:
        return knots[-1][1]
    i = max(j for j in range(len(xs) - 1) if xs[j] <= x)
    p0 = knots[max(i - 1, 0)][1]
    p1 = knots[i][1]
    p2 = knots[i + 1][1]
    p3 = knots[min(i + 2, len(knots) - 1)][1]
    t = (x - xs[i]) / (xs[i + 1] - xs[i])
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)


def stroke_poly(pts, w0, w1=None, cap=False):
    """Polygon for a tapered stroke along a polyline (widths in px; w0 may be a function of f in [0, 1])."""
    w1 = w0 if w1 is None else w1
    n = len(pts)
    left, right = [], []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1e-9
        nx, ny = -dy / d, dx / d
        f = i / max(n - 1, 1)
        w = (w0(f) if callable(w0) else w0 + (w1 - w0) * f) / 2
        left.append((p[0] + nx * w, p[1] + ny * w))
        right.append((p[0] - nx * w, p[1] - ny * w))
    return left + right[::-1]


def ellipse_poly(cx, cy, rx, ry, ang=0.0, n=28):
    ca, sa = math.cos(ang), math.sin(ang)
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        out.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return out


# --------------------------------------------------------------------------- shapes
class Shape:
    """Supersampled binary shape builder. add()/cut() float polygons, then .mask() -> set of (x, y)."""

    def __init__(self, w, h, ss=4):
        self.w, self.h, self.ss = w, h, ss
        self.im = Image.new("L", (w * ss, h * ss), 0)
        self.d = ImageDraw.Draw(self.im)

    def _p(self, pts):
        return [(x * self.ss, y * self.ss) for x, y in pts]

    def add(self, pts):
        self.d.polygon(self._p(pts), fill=255)
        return self

    def cut(self, pts):
        self.d.polygon(self._p(pts), fill=0)
        return self

    def add_ellipse(self, cx, cy, rx, ry, ang=0.0):
        return self.add(ellipse_poly(cx, cy, rx, ry, ang))

    def cut_ellipse(self, cx, cy, rx, ry, ang=0.0):
        return self.cut(ellipse_poly(cx, cy, rx, ry, ang))

    def mask(self, thresh=0.5):
        small = self.im.resize((self.w, self.h), Image.BOX)
        p = small.load()
        t = int(255 * thresh)
        return {(x, y) for y in range(self.h) for x in range(self.w) if p[x, y] > t}


def clean_mask(m, w, h, passes=2, keep_thin=True):
    """Fill 1-px notches (empty px with >= 3 filled 4-neighbours) and drop lone px (no 8-neighbours)."""
    m = set(m)
    for _ in range(passes):
        add = set()
        for y in range(h):
            for x in range(w):
                if (x, y) in m:
                    continue
                if sum((x + dx, y + dy) in m for dx, dy in N4) >= 3:
                    add.add((x, y))
        m |= add
        drop = {p for p in m if not any((p[0] + dx, p[1] + dy) in m for dx, dy in N8)}
        m -= drop
    return m


def edge_normal(m, x, y, r=2):
    """Outward normal at (x, y): mean offset toward the empty texels within radius r."""
    sx = sy = 0.0
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if (dx or dy) and dx * dx + dy * dy <= r * r + 1 and (x + dx, y + dy) not in m:
                d = math.hypot(dx, dy)
                sx += dx / d
                sy += dy / d
    d = math.hypot(sx, sy)
    return (sx / d, sy / d) if d else (0.0, 0.0)


def is_edge(m, x, y):
    return (x, y) in m and any((x + dx, y + dy) not in m for dx, dy in N4)


def edge_px(m):
    return [p for p in m if is_edge(m, *p)]


def lit(n, L=LIGHT):
    return n[0] * L[0] + n[1] * L[1]


# --------------------------------------------------------------------------- canvas
class Grid:
    """w x h colour grid (None = transparent)."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [[None] * w for _ in range(h)]

    def ok(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def get(self, x, y):
        return self.g[y][x] if self.ok(x, y) else None

    def px(self, x, y, c, only=None, avoid=None):
        x, y = int(round(x)), int(round(y))
        if not self.ok(x, y):
            return
        cur = self.g[y][x]
        if only is not None:
            if only == "opaque":
                if cur is None:
                    return
            elif only == "empty":
                if cur is not None:
                    return
            elif isinstance(only, (set, list, tuple)):
                if cur not in only:
                    return
            elif cur != only:
                return
        if avoid is not None:
            if isinstance(avoid, (set, list, tuple)):
                if cur in avoid:
                    return
            elif cur == avoid:
                return
        self.g[y][x] = c

    def fill(self, m, c, **k):
        for x, y in m:
            self.px(x, y, c, **k)

    def rect(self, x0, y0, x1, y1, c, **k):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c, **k)

    def line(self, x0, y0, x1, y1, c, **k):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
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

    def polyline(self, pts, c, **k):
        for a, b in zip(pts, pts[1:]):
            self.line(a[0], a[1], b[0], b[1], c, **k)

    def mask(self, colors=None):
        return {(x, y) for y in range(self.h) for x in range(self.w)
                if self.g[y][x] is not None and (colors is None or self.g[y][x] in colors)}

    def outline(self, c, diag=False, avoid_mask=None):
        """1-px outside outline in c around every opaque texel."""
        m = self.mask()
        nb = N8 if diag else N4
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] is None and any((x + dx, y + dy) in m for dx, dy in nb):
                    self.g[y][x] = c

    def copy(self):
        o = Grid(self.w, self.h)
        o.g = [r[:] for r in self.g]
        return o

    def paste(self, other, ox, oy):
        for y in range(other.h):
            for x in range(other.w):
                c = other.g[y][x]
                if c is not None:
                    self.px(x + ox, y + oy, c)

    def flip_x(self):
        o = Grid(self.w, self.h)
        o.g = [r[::-1] for r in self.g]
        return o

    def image(self):
        im = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        p = im.load()
        for y in range(self.h):
            for x in range(self.w):
                c = self.g[y][x]
                if c is not None:
                    p[x, y] = rgb(c) + (255,)
        return im

    def colors(self):
        return sorted({c for r in self.g for c in r if c is not None})

    def isolated(self):
        """Opaque texels with no same-colour 8-neighbour (for the craft check)."""
        out = []
        for y in range(self.h):
            for x in range(self.w):
                c = self.g[y][x]
                if c is not None and not any(self.get(x + dx, y + dy) == c for dx, dy in N8):
                    out.append((x, y, c))
        return out


# --------------------------------------------------------------------------- export / preview
def up(im, s):
    return im.resize((im.width * s, im.height * s), Image.NEAREST)


def strip(frames):
    w, h = frames[0].w, frames[0].h
    im = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        im.alpha_composite(f.image(), (i * w, 0))
    return im


def check_alpha(im):
    a = im.getchannel("A")
    bad = sum(1 for v in a.getdata() if v not in (0, 255))
    assert bad == 0, f"{bad} semi-transparent px"


def save_sprite(key, im):
    check_alpha(im)
    path = SPRITES / f"{key}.png"
    im.save(path)
    return path


def report(key, frames):
    cols = set()
    iso = 0
    for f in frames:
        cols |= set(f.colors())
        iso += len(f.isolated())
    print(f"{key}: {frames[0].w}x{frames[0].h} x{len(frames)}  colours={len(cols)}  isolated={iso}")


def board(items, scale, bg=(32, 46, 40), pad=8, cols=None, label=True):
    """items: [(name, PIL image)] -> labelled sheet at `scale` on a flat bg."""
    font = ImageFont.load_default()
    cols = cols or len(items)
    rows = (len(items) + cols - 1) // cols
    cw = max(i.width for _, i in items) * scale + pad * 2
    ch = max(i.height for _, i in items) * scale + pad * 2 + (12 if label else 0)
    sheet = Image.new("RGBA", (cw * cols, ch * rows), bg + (255,))
    d = ImageDraw.Draw(sheet)
    for k, (name, im) in enumerate(items):
        x, y = (k % cols) * cw + pad, (k // cols) * ch + pad
        sheet.alpha_composite(up(im, scale), (x, y))
        if label:
            d.text((x, y + im.height * scale + 2), name, fill=(220, 220, 200, 255), font=font)
    return sheet


def on_bg(im, bg_im):
    """Composite a sprite over a background image (tiled) of the same size or larger."""
    out = Image.new("RGBA", im.size)
    for y in range(0, im.height, bg_im.height):
        for x in range(0, im.width, bg_im.width):
            out.paste(bg_im, (x, y))
    out.alpha_composite(im)
    return out


def zoomgrid(im, s=16, bg=(3, 57, 46), grid=(0, 0, 0, 60)):
    """Big preview with a texel grid (for judging small effects pixel by pixel)."""
    base = Image.new("RGBA", im.size, bg + (255,) if len(bg) == 3 else bg)
    base.alpha_composite(im)
    big = up(base, s)
    d = ImageDraw.Draw(big, "RGBA")
    for x in range(0, big.width, s):
        d.line([(x, 0), (x, big.height)], fill=grid)
    for y in range(0, big.height, s):
        d.line([(0, y), (big.width, y)], fill=grid)
    return big


def row(ims, gap=8, bg=(20, 24, 22, 255)):
    w = sum(i.width for i in ims) + gap * (len(ims) + 1)
    h = max(i.height for i in ims) + gap * 2
    out = Image.new("RGBA", (w, h), bg)
    x = gap
    for i in ims:
        out.alpha_composite(i, (x, gap))
        x += i.width + gap
    return out
