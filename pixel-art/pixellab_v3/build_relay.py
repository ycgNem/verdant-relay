"""relay_core: hand-finish of PixelLab map object eaf6c0c1 (raw/relay_core.png, 128x144).

The raw came back as a clean isometric block with a cream top. This script keeps its structure (no resampling)
and repaints it: weathered concrete ramps per face, cracks, moss, hanging vines, hazard band, grime streaks,
cables that root into the ground, a crystal light spill on the concrete and a 4-frame crystal pulse idle.

    python pixel-art/pixellab_v3/build_relay.py
"""
import math
import random

from v3tools import (HERE, SCRATCH, SPRITES, Canvas, check_alpha, crop_pad, gridzoom, hx, load, lum, mixc, preview,
                     strip)

BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

# ---------------------------------------------------------------- palettes (dark → light)
TOP = ["#4f5446", "#5f6352", "#6d705c", "#7b7d66", "#878770", "#94927a", "#a29e84"]   # lit top face
CRACK = ["#262b25", "#343a31"]
LEFTW = ["#1f2723", "#2c3530", "#3a443b", "#4a5246", "#5c6252", "#6f725e", "#86866e", "#9c997f"]   # SW face
RIGHTW = ["#111917", "#17201d", "#1d2824", "#24312c", "#2e3c35", "#3b4a41", "#4d5c50"]           # SE face (shade)
RUST = ["#24140f", "#3d2116", "#5a301b", "#7a4322", "#99582c", "#b8723a"]
MOSS = ["#1c2b18", "#2a4020", "#3a5626", "#4d6e2c", "#648a34", "#80a63e"]
CYAN = ["#0b3e4a", "#0f6a7a", "#1596a6", "#2cc6d2", "#4ff0f2", "#a8fff8", "#e8fffc"]
OUT = "#0b0d0c"
HAZ_Y, HAZ_K = "#d8ae3e", "#2a2820"
DOOR_BLUE = ["#1d3a40", "#28525a", "#356a70", "#4a8486"]

CREAM = {"fdf5d5", "f8f0d2", "f8f6f0"}
GREYS = ["333138", "474658", "4f4440", "5c5b6a", "6b6858", "767480", "918f9e", "a39589", "b0afb7", "dad9e4"]
NAVY = ["0b0a1d", "121118", "191a35", "1c1c40", "2c2d4e", "494e8b", "8782c3"]
BROWN_CRACK = {"6a462a", "955534", "7d3f23", "572814", "b87549", "cf9e6f", "26231e", "2e140f", "9e815f"}
GRASS = {"689123", "3c6010", "223e1a", "021814", "071b23", "ccd8a9"}
CYANS = {"35fcfa": 4, "dffdfb": 6, "6cfafd": 5, "10829a": 1, "0e9aa8": 2, "4bcdc5": 3}

# Regions (raw coords): the crystal cradle, the mast, the three doors.
CRADLE = (49, 52, 80, 78)
CRYSTAL = (50, 24, 72, 64)
MAST = (85, 10, 104, 64)
DOOR_L = (21, 79, 31, 103)       # blue door on the SW face
DOOR_M = (54, 94, 66, 120)       # rust door below the front corner
DOOR_R = (88, 86, 102, 116)      # dark door on the SE face


KEEP_BELOW = set()


def bottom_y(x):
    """Lowest texel row of the block at column x (iso foot line: stairs on the left, SE wall on the right)."""
    if x < 16 or x > 114:
        return -1
    if x <= 64:
        return min(122, round(106 + (x - 20) * 0.55)) if x >= 20 else 104
    return round(122 - (x - 64) * 0.48)


def inbox(x, y, b):
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def noise2(x, y, seed=0, scale=6.0):
    """Cheap smooth value noise in [0, 1]."""
    def h(i, j):
        n = (i * 374761393 + j * 668265263 + seed * 2246822519) & 0xFFFFFFFF
        n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
        return ((n ^ (n >> 16)) & 0xFFFF) / 65535
    fx, fy = x / scale, y / scale
    i, j = math.floor(fx), math.floor(fy)
    u, v = fx - i, fy - j
    u, v = u * u * (3 - 2 * u), v * v * (3 - 2 * v)
    a, b, c, d = h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def rank_map(cols, ramp, lo=0, hi=None):
    """Map source colours (sorted by luminance) proportionally onto ramp[lo:hi]."""
    hi = len(ramp) - 1 if hi is None else hi
    s = sorted(cols, key=lambda c: lum(hx(c)))
    out = {}
    for i, c in enumerate(s):
        t = i / max(1, len(s) - 1)
        out[c] = ramp[lo + round(t * (hi - lo))]
    return out


def base_pass(c):
    """Recolour the raw block onto the V2 palette. Returns the face classification grid."""
    W, H = c.w, c.h
    src = c.im.copy()
    sp = src.load()
    face = {}
    # Find the hull of the non-grass texels in the lower half to tell stray grass from the building.
    rows = {}
    for y in range(H):
        for x in range(W):
            p = sp[x, y]
            if p[3] and "%02x%02x%02x" % p[:3] not in GRASS:
                lo, hi = rows.get(y, (999, -1))
                rows[y] = (min(lo, x), max(hi, x))
    leftmap = rank_map(GREYS, LEFTW, 1, 7)
    navymap = rank_map(NAVY, RIGHTW, 0, 6)
    for y in range(H):
        for x in range(W):
            p = sp[x, y]
            if not p[3]:
                continue
            k = "%02x%02x%02x" % p[:3]
            if k in GRASS:
                lo, hi = rows.get(y, (999, -1))
                if lo < x < hi and y < 118:
                    c.set(x, y, RIGHTW[1] if x > 64 else LEFTW[1])     # hole under the grass → wall shade
                else:
                    c.set(x, y, None)
                continue
            if k in ("030203", "090606", "03040c"):
                c.set(x, y, OUT)
                continue
            if k in CYANS:
                if inbox(x, y, CRYSTAL):
                    c.set(x, y, CYAN[CYANS[k]])
                    face[(x, y)] = "cyan"
                elif k == "dffdfb" and y < 70:
                    c.set(x, y, TOP[6])
                    face[(x, y)] = "post"
                else:
                    c.set(x, y, CYAN[min(5, CYANS[k] + 1)])      # door indicator lamps
                    face[(x, y)] = "lamp"
                continue
            if k == "bd1641":
                c.set(x, y, "#c02a2a")
                continue
            if inbox(x, y, CRADLE) and k in BROWN_CRACK | {"230b24", "290b22"}:
                # cradle: rusted iron rings
                c.set(x, y, {"230b24": RUST[0], "290b22": RUST[1], "2e140f": RUST[0], "26231e": RUST[1],
                             "572814": RUST[1], "6a462a": RUST[2], "7d3f23": RUST[2], "955534": RUST[3],
                             "b87549": RUST[4], "cf9e6f": RUST[5], "9e815f": RUST[4]}.get(k, RUST[2]))
                face[(x, y)] = "cradle"
                continue
            if inbox(x, y, DOOR_L) and k in ("2a66a1", "245a91", "494e8b", "8782c3"):
                c.set(x, y, {"2a66a1": DOOR_BLUE[2], "245a91": DOOR_BLUE[1], "494e8b": DOOR_BLUE[1], "8782c3": DOOR_BLUE[3]}[k])
                face[(x, y)] = "door"
                continue
            if inbox(x, y, DOOR_M) and k in BROWN_CRACK:
                c.set(x, y, {"955534": RUST[3], "7d3f23": RUST[2], "b87549": RUST[4], "cf9e6f": RUST[5],
                             "572814": RUST[1], "6a462a": RUST[2]}.get(k, RUST[2]))
                face[(x, y)] = "door"
                continue
            if inbox(x, y, DOOR_R) and k in ("230b24", "290b22", "2e140f", "572814", "6a462a"):
                c.set(x, y, {"230b24": "#1e1512", "290b22": "#2a1d18", "2e140f": "#1e1512", "572814": RUST[1], "6a462a": RUST[2]}[k])
                face[(x, y)] = "door"
                continue
            if inbox(x, y, MAST) and y < 62:
                if k in GREYS:
                    c.set(x, y, {"b0afb7": "#a8a08c", "dad9e4": "#c4bca4", "918f9e": "#8c8474", "767480": "#6e685c",
                                 "5c5b6a": "#55504a", "474658": "#433e3a", "333138": "#332e2c"}.get(k, "#55504a"))
                elif k in NAVY:
                    c.set(x, y, {"1c1c40": "#241c1c", "191a35": "#201a1a", "2c2d4e": "#2e2424", "0b0a1d": "#141010"}.get(k, "#241c1c"))
                face[(x, y)] = "mast"
                continue
            if k in CREAM:
                face[(x, y)] = "top"
                continue
            if k in BROWN_CRACK:
                face[(x, y)] = "crack"
                continue
            if k in GREYS:
                c.set(x, y, leftmap[k])
                face[(x, y)] = "left"
                continue
            if k in NAVY:
                c.set(x, y, navymap[k])
                face[(x, y)] = "right"
                continue
            if k in ("230b24", "290b22"):
                c.set(x, y, RUST[0])
                continue
            if k in ("2a66a1", "245a91"):
                c.set(x, y, DOOR_BLUE[1])
                continue
    # Top face + stair treads: concrete flagstones. The cracks split the cream into slabs; each slab gets its
    # own base value, plus a little low-frequency staining (the cream carried no shading at all).
    slab = {}
    sid = 0
    for (x, y), f in face.items():
        if f != "top" or (x, y) in slab:
            continue
        stack = [(x, y)]
        slab[(x, y)] = sid
        while stack:
            px_, py_ = stack.pop()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (px_ + dx, py_ + dy)
                if face.get(q) == "top" and q not in slab:
                    slab[q] = sid
                    stack.append(q)
        sid += 1
    rs = random.Random(7)
    slab_base = [rs.choice((3, 3, 4, 4, 4, 5)) for _ in range(sid)]
    for (x, y), f in list(face.items()):
        if f != "top":
            continue
        stair = x < 58 and y > 76
        i = slab_base[slab[(x, y)]]
        n = noise2(x, y, 3, 5.0)
        if n < 0.28:
            i -= 1
        elif n > 0.8:
            i += 1
        if stair:
            i = 4 if (y + x // 2) % 6 < 2 else 3
        # lit lip: a top texel just above a wall → edge highlight (SW lip brightest, light from the top-left)
        below = [face.get((x, y + d)) for d in (1, 2)]
        if not stair and ("left" in below or "right" in below):
            i = 6 if "left" in below else 5
        c.set(x, y, TOP[max(1, min(6, i))])
    # Cut the stray ground scatter off below the block, close holes in the wall foot, dark contact edge.
    for x in range(W):
        bot = bottom_y(x)
        for y in range(H):
            if y > bot:
                if (x, y) not in KEEP_BELOW:
                    c.set(x, y, None)
                    face.pop((x, y), None)
            elif 18 <= x <= 111 and y > 96:
                p = c.get(x, y)
                if not p[3] or "%02x%02x%02x" % sp[x, y][:3] in GRASS:
                    c.set(x, y, RIGHTW[1] if x > 64 else LEFTW[1])
                    face[(x, y)] = "right" if x > 64 else "left"
        if 18 <= x <= 111 and c.get(x, bot)[3]:
            c.set(x, bot, OUT)
    for (x, y), f in list(face.items()):
        if f == "crack":
            c.set(x, y, CRACK[0] if noise2(x, y, 5, 3) < 0.55 else CRACK[1])
            # chipped lower edge of a crack catches light
            if face.get((x, y + 1)) == "top" and noise2(x, y, 11, 2) > 0.45:
                c.set(x, y + 1, TOP[6])
    return face


def moss_clump(c, face, cx, cy, r, seed, allowed=("top", "crack"), dense=0.75):
    rnd = random.Random(seed)
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r - 2, cx + r + 3):
            d = math.hypot((x - cx) * 0.75, y - cy) / max(1, r)
            if d > 1 or face.get((x, y)) not in allowed:
                continue
            if rnd.random() > dense * (1.15 - d * 0.6):
                continue
            # shade: top-left lit
            t = 1 - d
            lit = (cx - x) * 0.35 + (cy - y) * 0.6
            i = 2 + int(t * 2.2 + lit * 0.25 + rnd.random() * 0.8)
            c.set(x, y, MOSS[max(1, min(5, i))])
            face[(x, y)] = "moss"
    # dark rim below
    for y in range(cy - r, cy + r + 2):
        for x in range(cx - r - 2, cx + r + 3):
            if face.get((x, y)) == "moss" and face.get((x, y + 1)) in ("top", "crack"):
                c.set(x, y + 1, TOP[0])


def lip_y(face, x, which):
    """First wall texel row under the top face at column x (the lip), or None."""
    for y in range(40, 130):
        if face.get((x, y)) == which and (face.get((x, y - 1)) in ("top", "crack", "moss")
                                          or face.get((x, y - 2)) in ("top", "crack", "moss")):
            return y
    return None


def hazard_band(c, face):
    """Chipped yellow/black hazard band along the top of the SE face (follows the iso lip line)."""
    for x in range(67, 111):
        y0 = round(91 - (x - 64) * 0.478)          # front-right lip of the top face
        while face.get((x, y0)) != "right" and y0 < 110:
            y0 += 1
        for dy in range(1, 6):
            y = y0 + dy
            if face.get((x, y)) not in ("right", "moss"):
                continue
            if dy in (1, 5):
                c.set(x, y, RIGHTW[0])              # the band's frame
                continue
            if noise2(x, y, 21, 2.0) > 0.74:
                continue                            # chipped off
            stripe = ((x + 2 * y) // 3) % 2
            col = HAZ_Y if stripe else HAZ_K
            if stripe and dy == 4:
                col = "#8f7230"
            c.set(x, y, col)


def grime(c, face, seed=4):
    """Vertical rain/rust streaks under the lip on both walls."""
    rnd = random.Random(seed)
    for x in range(20, 112):
        if rnd.random() > 0.22:
            continue
        side = "right" if x > 64 else "left"
        y0 = lip_y(face, x, side)
        if y0 is None:
            continue
        ln = rnd.randint(4, 14)
        rust = rnd.random() < 0.35
        for y in range(y0 + (4 if side == "right" else 1), y0 + ln):
            if face.get((x, y)) != side:
                break
            if rnd.random() < 0.15:
                continue
            col = c.get(x, y)
            tgt = RUST[1] if rust else ("#0e1513" if side == "right" else LEFTW[1])
            c.set(x, y, mixc(col[:3], tgt, 0.55))


def vine(c, x, y, ln, seed, face=None):
    """Hanging vine strand with leaf nubs, from (x, y) down."""
    rnd = random.Random(seed)
    for i in range(ln):
        yy = y + i
        xx = x + (1 if (i // 5) % 2 and rnd.random() < 0.6 else 0)
        c.set(xx, yy, MOSS[3] if i % 3 else MOSS[2])
        c.set(xx + 1, yy, MOSS[1])
        if rnd.random() < 0.4:
            side = -1 if rnd.random() < 0.55 else 1
            c.set(xx + side * (1 if side < 0 else 2), yy, MOSS[5] if side < 0 else MOSS[4])
            if rnd.random() < 0.5:
                c.set(xx + side * (2 if side < 0 else 3), yy - 1, MOSS[4] if side < 0 else MOSS[3])
    c.set(x, y + ln, MOSS[4])


def cable(c, pts, thick=2):
    """Thick black cable along a polyline: dark body, a top-left highlight, a 1-texel shadow under it."""
    path = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n):
            t = i / n
            path.append((round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t)))
    path.append(pts[-1])
    body = set()
    for x, y in path:
        for dx in range(thick):
            for dy in range(thick):
                body.add((x + dx, y + dy))
    for x, y in body:
        for q in ((x, y + 1), (x + 1, y + 1)):
            if q not in body:
                c.set(*q, OUT)
    for x, y in body:
        c.set(x, y, "#181c1d")
    for x, y in path:
        c.set(x, y, "#40494a")
    return path


def root_end(c, x, y, seed):
    """Cable splitting into roots that dig into the ground."""
    rnd = random.Random(seed)
    for k in range(3):
        dx = (-1, 0, 1)[k]
        xx, yy = x, y
        for i in range(rnd.randint(3, 6)):
            xx += dx if rnd.random() < 0.6 else 0
            yy += 1 if rnd.random() < 0.5 else 0
            c.set(xx, yy, "#181c1d" if i < 2 else "#3a2a20")
            c.set(xx, yy + 1, OUT)
            if i >= 3:
                break


def dish(c, x, y):
    """Small dish antenna bolted to the mast's left side, facing up-left (light from the top-left)."""
    rim = [(1, 0), (2, 0), (3, 0), (0, 1), (4, 1), (0, 2), (5, 2), (0, 3), (5, 3), (1, 4), (5, 4), (2, 5), (3, 5), (4, 5)]
    for dx, dy in rim:
        c.set(x + dx, y + dy, OUT)
    inner = [(1, 1), (2, 1), (3, 1), (1, 2), (2, 2), (3, 2), (4, 2), (1, 3), (2, 3), (3, 3), (4, 3), (2, 4), (3, 4), (4, 4)]
    for dx, dy in inner:
        shade = "#b8b29c" if dx + dy <= 3 else ("#8c8674" if dx + dy <= 5 else "#5e5a4e")
        c.set(x + dx, y + dy, shade)
    c.set(x + 2, y + 2, "#3a3632")      # feed horn
    c.line(x + 5, y + 3, x + 7, y + 3, "#2a2624")   # arm to the mast


def tuft(c, x, y, seed):
    """Fern / grass tuft growing at the wall foot (draws upward from y)."""
    rnd = random.Random(seed)
    for k in range(rnd.randint(4, 6)):
        lx = x + rnd.randint(-3, 3)
        h = rnd.randint(3, 7)
        lean = rnd.choice((-1, 0, 1))
        for i in range(h):
            xx = lx + (lean if i > h // 2 else 0)
            col = MOSS[2 + min(3, i * 4 // h)] if lean <= 0 else MOSS[1 + min(3, i * 3 // h)]
            c.set(xx, y - i, col)
        c.set(lx + lean, y - h, MOSS[5] if lean < 0 else MOSS[4])
    for dx in range(-3, 4):
        c.set(x + dx, y + 1, MOSS[0])


def spill_mask(cx, cy, rx, ry):
    return lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2


def frame(base, face, k):
    """Crystal pulse frame k (0..3): 0 dim, 1 mid, 2 bright, 3 mid."""
    c = Canvas(base.im.copy())
    lvl = (0, 1, 2, 1)[k]
    # crystal ramp shift
    for (x, y), f in face.items():
        if f != "cyan":
            continue
        p = c.get(x, y)[:3]
        i = min(range(len(CYAN)), key=lambda j: sum((a - b) ** 2 for a, b in zip(hx(CYAN[j])[:3], p)))
        c.set(x, y, CYAN[min(6, i + lvl)] if i > 0 or lvl == 2 else CYAN[i])
    # inner core line (bright on frames 1-3)
    if lvl:
        for y in range(36, 58):
            x = 62 if y % 7 else 63
            if face.get((x, y)) == "cyan":
                c.set(x, y, CYAN[6] if lvl == 2 else CYAN[5])
    # light spill on the concrete around the cradle: two hard-edged bands (no checker), edge wobbled by noise
    for (x, y), f in face.items():
        if f not in ("top", "crack", "moss"):
            continue
        d = ((x - 64) / (19 + lvl * 3)) ** 2 + ((y - 67) / (9 + lvl * 1.5)) ** 2
        d += (noise2(x, y, 31, 2.0) - 0.5) * 0.35
        if d < 0.45:
            t = 0.42 + 0.08 * lvl
        elif d < 1:
            t = 0.2 + 0.06 * lvl
        else:
            continue
        col = c.get(x, y)[:3]
        c.set(x, y, mixc(col, "#6fd6cf", t))
    # energy motes drifting up off the crystal tip (one texel each, cycle with the pulse)
    for (mx, my, ph) in ((58, 30, 0), (68, 34, 2), (63, 24, 1), (55, 40, 3)):
        yy = my - ((k + ph) % 4) * 3
        c.set(mx + ((k + ph) % 2), yy, CYAN[5] if (k + ph) % 4 < 2 else CYAN[3])
    # the mast's red warning lamp blinks
    if k in (0, 1):
        c.set(93, 13, "#ff4a3a")
        c.set(94, 13, "#ff4a3a")
        c.set(93, 12, "#ffb0a0")
    return c


def build():
    c = Canvas(load("relay_core.png"))
    face = base_pass(c)
    # moss: clumps on the top face (edges + cracks) and stair treads
    for (cx, cy, r, s) in [(26, 68, 5, 1), (36, 63, 3, 2), (86, 79, 3, 3), (100, 70, 3, 4), (46, 82, 3, 5),
                          (74, 87, 3, 6), (60, 85, 2, 7), (94, 66, 2, 8), (40, 98, 2, 9), (31, 92, 2, 10),
                          (22, 73, 3, 11), (108, 70, 2, 12), (52, 104, 2, 13)]:
        moss_clump(c, face, cx, cy, r, s, dense=0.95)
    grime(c, face)
    hazard_band(c, face)
    for (x, y, ln, s) in [(24, 71, 14, 1), (71, 92, 9, 2), (83, 87, 16, 3), (100, 78, 11, 4), (107, 74, 7, 5)]:
        vine(c, x, y, ln, s)
    # cables: from the cradle over the lip, down the walls into the ground
    p1 = cable(c, [(52, 72), (40, 80), (36, 84), (36, 92)])
    p2 = cable(c, [(76, 74), (88, 80), (92, 82), (92, 86)])
    root_end(c, 36, 93, 1)
    # cables leaving the wall foot and burrowing into the ground like roots
    cable(c, [(105, 101), (110, 103), (114, 104)])
    root_end(c, 114, 105, 2)
    cable(c, [(76, 117), (79, 121), (83, 123)])
    root_end(c, 83, 124, 4)
    cable(c, [(21, 104), (16, 107), (13, 108)])
    root_end(c, 12, 109, 3)
    dish(c, 84, 27)
    for (x, y, s_) in [(18, 100, 1), (46, 118, 2), (66, 121, 3), (98, 108, 4), (110, 102, 5), (30, 113, 6),
                       (16, 107, 7), (80, 121, 8)]:
        tuft(c, x, y, s_)
    frames = [frame(c, face, k) for k in range(4)]
    return c, face, frames


def export(frames, name="relay_core_v3.png", foot=(64, 121)):
    """Crop all frames to their union bbox + 1, write the strip, return (fw, fh, anchor)."""
    from PIL import Image
    bb = None
    for f in frames:
        b = f.im.getbbox()
        bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    x0, y0 = bb[0] - 1, bb[1] - 1
    fw, fh = bb[2] - bb[0] + 2, bb[3] - bb[1] + 2
    out = []
    for f in frames:
        im = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        im.paste(f.im.crop((x0, y0, x0 + fw, y0 + fh)), (0, 0))
        check_alpha(im)
        out.append(im)
    strip(out).save(SPRITES / name)
    return fw, fh, [foot[0] - x0, foot[1] - y0], out


if __name__ == "__main__":
    c, face, frames = build()
    fw, fh, anchor, out = export(frames)
    print("relay_core_v3", fw, fh, anchor)
    import json
    (HERE / "entries" / "relay_core.json").write_text(json.dumps({"relay_core": {
        "file": "relay_core_v3.png", "ppu": 32, "frames": 4, "fw": fw, "fh": fh, "anchor": anchor, "fps": 8,
        "anims": {"idle": [0, 1, 2, 3]}, "animFps": {"idle": 5}}}, indent=1))
    preview(out, SCRATCH / "relay_final.png", 3, anchor=anchor)
    gridzoom(frames[2].im, SCRATCH / "relay_v1_zoom.png", (8, 8, 128, 132), 6)
    preview([f.im for f in frames], SCRATCH / "relay_v1_frames.png", 3)
    preview([frames[0].im, frames[2].im], SCRATCH / "relay_v1_x2.png", 2, bg=(58, 52, 38, 255))
