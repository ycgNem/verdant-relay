"""Toolkit for the V3 night towers (48x64 frames, 3/4 top-down view, light from the top-left).

Matches the V2 PixelLab props: near-black 1-px outline, desaturated grimy materials (olive-grey iron, rust,
concrete, teal paint, wood) with blotchy weathering, moss on top edges and at the foot, and saturated colour
only on the glows (the tower's identity colour). Hard alpha everywhere.

Primitives draw into a v3lib.Grid; each takes a 6-tone ramp (dark -> light) and an optional grime amount.
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
from v3lib import Grid, Shape, Path2, stroke_poly, ellipse_poly, save_sprite, strip, up, SCRATCH, SPRITES  # noqa: E402,F401
from PIL import Image  # noqa: E402

FW, FH = 48, 64
CX = 24                 # base centre x
INK = "#040201"

IRON = ["#141613", "#262822", "#3b3d35", "#55574b", "#727160", "#97937a"]
RUST = ["#1e0f09", "#3a1f14", "#58301e", "#7a462b", "#9a623c", "#b88558"]
CONC = ["#1c1c19", "#2f2e2a", "#46443d", "#605d53", "#7d796b", "#a09a87"]
TEAL = ["#0a1a16", "#14332b", "#22503f", "#3a6e58", "#5f8f74", "#93b29b"]
MOSS = ["#18230f", "#2a3b17", "#3e5420", "#57702a", "#7a8f38", "#9aaa4a"]
WOOD = ["#1f120b", "#352015", "#4f321f", "#6d4a2c", "#8d683f", "#ad8b5c"]
CERA = ["#2c2c30", "#46464c", "#6a6a6e", "#929088", "#bdb8a8", "#e2dccb"]
BRASS = ["#2a1c08", "#4a3410", "#6e5018", "#957024", "#bf9a3c", "#e6c870"]
# identity colours (glows)
AMBER = ["#4a2208", "#8a4510", "#c8701c", "#f0a030", "#ffd070", "#fff2c0"]
PURP = ["#1e0a22", "#3c1444", "#5e2468", "#8a3a8e", "#b860b4", "#ecaae4"]
CYAN = ["#06202c", "#0a4058", "#0a7896", "#1ec0dc", "#80f0ff", "#e8ffff"]
PINK = ["#2e0c1c", "#5c1838", "#962c58", "#d84c84", "#ff8cb4", "#ffd4e4"]
POD = ["#0e2414", "#1a3e22", "#2a6030", "#448a40", "#74b454", "#b4dc84"]
FIRE = ["#4a0e04", "#8a1e08", "#d4400c", "#ff7a1c", "#ffc040", "#fff0a0"]
RED = ["#3a0808", "#6a1010", "#a82020", "#e04434", "#ff8070", "#ffd0c8"]

GLOWS = set(AMBER[2:] + PURP[3:] + CYAN[2:] + PINK[3:] + FIRE[2:] + [POD[4], POD[5]])

L3 = (-0.55, -0.45, 0.7)
_n = math.sqrt(sum(c * c for c in L3))
L3 = tuple(c / _n for c in L3)


# --------------------------------------------------------------------------- noise
def h2(x, y, s=0):
    n = (x * 374761393 + y * 668265263 + s * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, y, scale=3.0, s=0):
    fx, fy = x / scale, y / scale
    x0, y0 = math.floor(fx), math.floor(fy)
    tx, ty = fx - x0, fy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a, b = h2(x0, y0, s), h2(x0 + 1, y0, s)
    c, d = h2(x0, y0 + 1, s), h2(x0 + 1, y0 + 1, s)
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def tone(ramp, i):
    return ramp[max(0, min(len(ramp) - 1, int(i)))]


def put(g, x, y, ramp, i, grime=0.0, seed=0, mask=None):
    """Paint tone i of ramp at (x, y), weathered: blotchy noise nudges the tone one step down (grime) or up."""
    if grime:
        n = vnoise(x, y, 2.6, seed)
        sp = h2(x, y, seed + 7)
        if n > 1 - grime * 0.55:
            i -= 1
        elif n < grime * 0.25:
            i += 1
        if sp < grime * 0.08:
            i -= 1
    g.px(x, y, tone(ramp, i))
    if mask is not None:
        mask.add((x, y))


# --------------------------------------------------------------------------- primitives
def cyl(g, cx, top, bot, r, ramp, cap=True, ry=None, grime=0.25, seed=0, base_tone=2.6, mask=None, capramp=None):
    """Upright cylinder in 3/4 view: body from `top` (cap centre row) to `bot` (front-bottom row)."""
    ry = ry if ry is not None else max(1.0, r * 0.42)
    out = set()
    x0, x1 = int(math.floor(cx - r)), int(math.ceil(cx + r))
    for x in range(x0, x1 + 1):
        s = (x + 0.5 - cx) / r
        if abs(s) > 1:
            continue
        nz = math.sqrt(max(0.0, 1 - s * s))
        d = L3[0] * s + L3[2] * nz
        ti = base_tone + d * 2.4
        yb = bot - ry + ry * nz          # bottom arc
        ytop = top
        for y in range(int(round(ytop)), int(round(yb)) + 1):
            k = ti - 0.6 * max(0, (y - ytop) / max(1, yb - ytop) - 0.55)   # a little darker toward the foot
            put(g, x, y, ramp, k, grime, seed, out)
    if cap:
        cr = capramp or ramp
        for y in range(int(math.floor(top - ry)), int(math.ceil(top + ry)) + 1):
            for x in range(x0, x1 + 1):
                dx, dy = (x + 0.5 - cx) / r, (y + 0.5 - top) / ry
                if dx * dx + dy * dy <= 1:
                    ti = 4.2 - 0.9 * (dx + dy) * 0.7
                    if dx * dx + dy * dy > 0.62 and dy > 0:
                        ti = 4.8                      # lit front lip
                    if dx * dx + dy * dy > 0.62 and dy < -0.2:
                        ti = 3.0                      # back rim
                    put(g, x, y, cr, ti, grime * 0.6, seed + 3, out)
    if mask is not None:
        mask |= out
    return out


def box(g, x0, x1, ytop, ybot, depth, ramp, grime=0.3, seed=0, mask=None, front_tone=2.6):
    """3/4 box: a top face `depth` rows tall, then the front face down to ybot."""
    out = set()
    for y in range(ytop, ybot + 1):
        for x in range(x0, x1 + 1):
            if y < ytop + depth:
                ti = 4.2 if y > ytop else 4.6
                if x == x0:
                    ti = 4.8
                if x == x1:
                    ti = 3.6
            else:
                ti = front_tone - 1.0 * (y - ytop - depth) / max(1, ybot - ytop - depth)
                if y == ytop + depth:
                    ti = 4.8                          # lit lip of the front face
                if x == x0:
                    ti += 0.8
                if x == x1:
                    ti -= 1.0
            put(g, x, y, ramp, ti, grime, seed, out)
    if mask is not None:
        mask |= out
    return out


def sphere(g, cx, cy, r, ramp, grime=0.0, seed=0, mask=None, spec=True, base=2.2):
    out = set()
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            dx, dy = (x + 0.5 - cx) / r, (y + 0.5 - cy) / r
            d2 = dx * dx + dy * dy
            if d2 > 1:
                continue
            nz = math.sqrt(1 - d2)
            d = L3[0] * dx + L3[1] * dy + L3[2] * nz
            put(g, x, y, ramp, base + d * 2.9, grime, seed, out)
    if spec and r >= 2:
        g.px(int(cx - r * 0.42), int(cy - r * 0.45), ramp[-1])
    if mask is not None:
        mask |= out
    return out


def ellipse_fill(g, cx, cy, rx, ry, ramp, ti, grime=0.0, seed=0, mask=None):
    out = set()
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if dx * dx + dy * dy <= 1:
                put(g, x, y, ramp, ti(dx, dy) if callable(ti) else ti, grime, seed, out)
    if mask is not None:
        mask |= out
    return out


def polyfill(g, pts, ramp, ti, grime=0.0, seed=0, mask=None):
    m = Shape(g.w, g.h).add(pts).mask()
    for (x, y) in m:
        put(g, x, y, ramp, ti(x, y) if callable(ti) else ti, grime, seed)
    if mask is not None:
        mask |= m
    return m


def tube(g, pts, w0, w1, ramp, grime=0.2, seed=0, mask=None, lit_side=True):
    """A stroke (barrel, pipe, vine) shaded across its width: lit on the side facing the light."""
    poly = stroke_poly(pts, w0, w1)
    m = Shape(g.w, g.h).add(poly).mask()
    # shade by the distance across: use the local normal of the nearest centreline sample
    P = Path2([pts[0], pts[0], pts[-1], pts[-1]]) if len(pts) == 2 else None
    for (x, y) in m:
        best, bi = 1e9, 0
        for i, p in enumerate(pts):
            dd = (p[0] - x - 0.5) ** 2 + (p[1] - y - 0.5) ** 2
            if dd < best:
                best, bi = dd, i
        a = pts[max(0, bi - 1)]
        b = pts[min(len(pts) - 1, bi + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        tl = math.hypot(tx, ty) or 1
        nx, ny = -ty / tl, tx / tl
        if nx * L3[0] + ny * L3[1] < 0:
            nx, ny = -nx, -ny                      # normal pointing toward the light
        off = (x + 0.5 - pts[bi][0]) * nx + (y + 0.5 - pts[bi][1]) * ny
        half = (w0 + (w1 - w0) * bi / max(1, len(pts) - 1)) / 2
        s = off / max(0.6, half)                   # +1 lit edge, -1 shadow edge
        put(g, x, y, ramp, 2.6 + 1.7 * s, grime, seed)
    if mask is not None:
        mask |= m
    return m


# --------------------------------------------------------------------------- weathering
def rust_streaks(g, xs, y0, length, seed=0, ramp=RUST, only=None):
    for i, x in enumerate(xs):
        L = int(length * (0.6 + 0.8 * h2(x, y0, seed)))
        for k in range(L):
            if only is None or g.get(x, y0 + k) in only:
                g.px(x, y0 + k, ramp[2] if k < L - 1 else ramp[3])


def moss(g, pts, seed=0, dens=1.0):
    """Moss clumps (2-5 texel clusters) at the listed anchor points, lit on top."""
    for i, (x, y) in enumerate(pts):
        n = 2 + int(3 * h2(x, y, seed) * dens)
        for k in range(n):
            dx = int(round((h2(x + k, y, seed + 1) - 0.5) * 3))
            dy = int(round((h2(x, y + k, seed + 2) - 0.3) * 2))
            px, py = x + dx, y + dy
            if g.get(px, py) is None:
                continue
            g.px(px, py, MOSS[3] if dy <= 0 else MOSS[2])
            if g.get(px, py - 1) is not None and h2(px, py, seed + 4) < 0.5:
                g.px(px, py - 1, MOSS[4])


def bolts(g, pts, ramp=IRON):
    for (x, y) in pts:
        g.px(x, y, ramp[5])
        g.px(x + 1, y + 1, ramp[1])


def glow_px(g, pts, c):
    for p in pts:
        g.px(*p, c)


# --------------------------------------------------------------------------- bases
def base_concrete(g, seed=0, rx=17.0, top=52.5, h=6, ramp=CONC):
    """Squat octagonal footing: an elliptical top face, a 6-row front face, chips and moss. Front bottom = row 63."""
    ry = 5.0
    out = set()
    # front face (drawn first, the top face overlaps its upper edge)
    for x in range(int(CX - rx), int(CX + rx) + 1):
        s = (x + 0.5 - CX) / rx
        if abs(s) > 1:
            continue
        nz = math.sqrt(max(0, 1 - s * s))
        yb = top + ry * nz + h
        ti = 2.6 + (L3[0] * s + L3[2] * nz) * 1.9
        for y in range(int(top), int(round(yb)) + 1):
            put(g, x, y, ramp, ti - 0.8 * (y - top) / h, 0.35, seed, out)
    # bevel band + top face
    for y in range(int(top - ry - 1), int(top + ry) + 2):
        for x in range(int(CX - rx) - 1, int(CX + rx) + 2):
            dx, dy = (x + 0.5 - CX) / rx, (y + 0.5 - top) / ry
            d2 = dx * dx + dy * dy
            if d2 <= 1:
                ti = 4.3 - 0.8 * (dx + dy)
                if d2 > 0.7 and dy > 0.1:
                    ti = 5.0
                put(g, x, y, ramp, ti, 0.3, seed + 1, out)
    # seams / chips on the front face
    for k, x in enumerate((int(CX - rx * 0.55), int(CX), int(CX + rx * 0.55))):
        for y in range(int(top + ry * 0.9) + 1, int(top + ry + h) - 1):
            if g.get(x, y) is not None:
                g.px(x, y, ramp[1])
    moss(g, [(int(CX - rx + 2), int(top + 2)), (int(CX - rx + 4), int(top + ry + h - 1)), (int(CX + rx - 3), int(top + ry + h - 2)),
             (int(CX + 6), int(top - ry + 1))], seed)
    return out


def finish(g):
    g.outline(INK)
    return g


def save_tower(key, frames, scale_preview=True):
    im = strip(frames)
    save_sprite(key, im)
    return im


def hcyl(g, x0, x1, cy, r, ramp, grime=0.3, seed=0, mask=None, cap_right=True, base_tone=2.5, ribs=(), cap_ramp=None):
    """Horizontal cylinder (a drum or barrel lying along x) in 3/4 view; the right end cap shows as an ellipse."""
    out = set()
    capw = max(1.0, r * 0.45)
    for y in range(int(math.floor(cy - r)), int(math.ceil(cy + r)) + 1):
        s = (y + 0.5 - cy) / r
        if abs(s) > 1:
            continue
        nz = math.sqrt(max(0.0, 1 - s * s))
        d = L3[1] * s + L3[2] * nz
        ti = base_tone + d * 2.8
        if -0.66 < s < -0.36:
            ti += 1.0                                  # specular band along the lit upper side
        if s > 0.72:
            ti -= 0.6                                  # underside in shadow
        xr = x1 - capw + capw * nz if cap_right else x1
        for x in range(x0, int(round(xr)) + 1):
            k = ti + (0.5 if x == x0 else 0) - 0.5 * max(0.0, (x - x0) / max(1, x1 - x0) - 0.6)
            if x in ribs:
                k -= 1.3
            elif x + 1 in ribs:
                k += 0.9
            put(g, x, y, ramp, k, grime, seed, out)
    if cap_right:
        cr = cap_ramp or ramp
        for y in range(int(math.floor(cy - r)), int(math.ceil(cy + r)) + 1):
            for x in range(int(x1 - capw * 2) - 1, int(x1) + 2):
                dx, dy = (x + 0.5 - (x1 - capw)) / capw, (y + 0.5 - cy) / r
                if dx * dx + dy * dy <= 1 and dx > -0.2:
                    ti = 1.8 - 0.8 * dy + (0.6 if dx * dx + dy * dy > 0.6 and dx < 0.3 and dy < 0 else 0)
                    put(g, x, y, cr, ti, grime * 0.5, seed + 5, out)
    if mask is not None:
        mask |= out
    return out


def base_mount(g, seed=0, rx=13.5, top=55.5, h=4, ramp=IRON):
    """Low bolted iron mount plate (octagonal), front bottom on row 63; moss and rust at the foot."""
    ry = 4.2
    out = set()
    for x in range(int(CX - rx), int(CX + rx) + 1):
        s = (x + 0.5 - CX) / rx
        if abs(s) > 1:
            continue
        nz = math.sqrt(max(0, 1 - s * s))
        yb = top + ry * nz + h
        ti = 1.8 + (L3[0] * s + L3[2] * nz) * 1.5
        for y in range(int(top), int(round(yb)) + 1):
            put(g, x, y, ramp, ti - 0.8 * (y - top) / h, 0.3, seed, out)
    for y in range(int(top - ry - 1), int(top + ry) + 2):
        for x in range(int(CX - rx) - 1, int(CX + rx) + 2):
            dx, dy = (x + 0.5 - CX) / rx, (y + 0.5 - top) / ry
            d2 = dx * dx + dy * dy
            if d2 <= 1:
                ti = 3.0 - 0.7 * (dx + dy)
                if d2 > 0.72 and dy > 0.1:
                    ti = 4.2
                elif d2 > 0.72 and dy < -0.1:
                    ti = 2.0
                put(g, x, y, ramp, ti, 0.3, seed + 1, out)
    for (x, y) in ((int(CX - rx + 3), int(top)), (int(CX + rx - 4), int(top)), (int(CX - 5), int(top + ry - 1)), (int(CX + 4), int(top + ry - 1))):
        g.px(x, y, ramp[5])
        g.px(x + 1, y + 1, ramp[0])
    rust_streaks(g, [int(CX - rx + 5), int(CX + 2), int(CX + rx - 6)], int(top + ry), h, seed)
    moss(g, [(int(CX - rx + 1), int(top + ry + h - 1)), (int(CX + rx - 2), int(top + ry + h - 1)), (int(CX - rx + 4), int(top - 1))], seed)
    return out


def recolor(g, pts, src, dst, shift=0):
    """Re-paint texels of ramp `src` with the same tone index of ramp `dst` (rust patches, paint chips)."""
    idx = {c: i for i, c in enumerate(src)}
    for (x, y) in pts:
        c = g.get(x, y)
        if c in idx:
            g.px(x, y, tone(dst, idx[c] + shift))


def rust_patches(g, pts, src, seed=0, amount=0.3, scale=3.2, dst=RUST):
    """Blotchy rust where low-frequency noise is high (paint worn through), never on lit edges' brightest tone."""
    sel = [(x, y) for (x, y) in pts if vnoise(x, y, scale, seed + 31) > 1 - amount]
    recolor(g, sel, src, dst)
