"""Forage props: fruit bush (ripe / picked), stump with and without harvestable fungus, fungus overlay for logs.

  prop_fruit_bush        42x34  low teal-leaved jungle bush heavy with ripe orange fruit clusters
  prop_fruit_bush_bare   42x34  the same bush picked: stalk stubs, torn leaves, one small unripe green fruit
  prop_stump_bare        63x60  fol_stump repainted without its bracket fungus (bark + a pale break scar)
  prop_stump_fungus      63x60  fol_stump with larger, brighter bracket fungus + glint pixels (harvestable)
  prop_fungus_log_overlay 24x20 three bright brackets on a transparent card, laid over fol_log
  fol_log (repaint)      64x51  the pale bracket shelves baked into fol_log painted out (bark + moss), from orig/fol_log.png
  prop_dusk_bloom_closed 32x36  rare clearing flower by day: tight violet/indigo bud on a stalk among broad leaves
  prop_dusk_bloom_open   32x36  the same plant at dusk: pale lilac petals around a cyan core (EMISSIVE glow texels)
  prop_dusk_bloom_spent  32x36  after harvest: petals gone, the stalk drooping, a withered seed head

Every pixel is placed here (Pillow only); the stumps start from public/sprites/fol_stump.png.
Anchors: the bushes [21, 31] (base of the stems), the stumps [30, 49] (= fol_stump, so they swap in place),
the overlay [12, 19] (bottom centre), the dusk blooms [16, 33] (base of the stalk).
fol_log keeps its manifest entry (manifest.v2env.json, anchor [32, 36]); only its PNG is regenerated, always from the
untouched original copied once to pixel-art/forage/orig/fol_log.png, so canvas, anchor and alpha mask never change.
Run: python pixel-art/forage/build.py   (then python pixel-art/merge_manifest.py)
"""
import json
import math
import shutil
import random
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SPR = ROOT / "public" / "sprites"
OUT_PREV = HERE / "preview"
OUT_PREV.mkdir(exist_ok=True)


def hx(c):
    return (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 255)


INK = hx("#030302")      # the shared near-black outline of the fol_ sprites
GAP = hx("#010b0b")      # dark between leaves (fol_bush_round)

# leaf ramp, dark -> light (fol_bush_round teal family + the fern's yellow-green tips)
LEAF = [hx(c) for c in ("#022324", "#0b3c3c", "#0c433c", "#145348", "#205c4c", "#30704f", "#397e56", "#607648")]
SPEC = hx("#9aa49d")

# ripe fruit (dec_berries family pushed to #f77622 / #feae34)
FR_K = hx("#1e0904")     # fruit outline, warm near-black
FR_D = hx("#8a2c10")
FR_S = hx("#c8481a")
FR_M = hx("#f77622")
FR_L = hx("#feae34")
FR_H = hx("#ffe6a0")
STALK = hx("#3e352e")
STALK_L = hx("#5d483b")

# unripe fruit
UN_D = hx("#1b432b")
UN_M = hx("#45704a")
UN_L = hx("#8aa050")

# bracket fungus, brighter than the tan of fol_stump / fol_log but the same family
FU = {
    "k": hx("#1c0c05"),
    "R": hx("#c87a3a"),
    "g": hx("#502614"),
    "S": hx("#a8602e"),
    "M": hx("#e2964a"),
    "L": hx("#f7c47a"),
    "h": hx("#fff0c4"),
}

# bark (fol_stump side), dark -> light
BARK = [hx(c) for c in ("#12100d", "#1b1917", "#221f1c", "#282623", "#33312d")]
SCAR = [hx(c) for c in ("#080100", "#5d483b", "#84624c", "#94735c")]


def put(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height and c is not None:
        im.putpixel((x, y), c)


def get(im, x, y):
    if 0 <= x < im.width and 0 <= y < im.height:
        return im.getpixel((x, y))
    return (0, 0, 0, 0)


def outline_outside(im, color, diagonals=False):
    src = im.copy()
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if diagonals:
        nb += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
    for y in range(im.height):
        for x in range(im.width):
            if src.getpixel((x, y))[3]:
                continue
            if any(get(src, x + dx, y + dy)[3] for dx, dy in nb):
                im.putpixel((x, y), color)


def stamp(im, x0, y0, rows, pal):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in pal:
                put(im, x0 + i, y0 + j, pal[ch])


def check_alpha(im):
    bad = sum(1 for p in im.getdata() if 0 < p[3] < 255)
    assert bad == 0, f"{bad} semi-transparent texels"


# --------------------------------------------------------------------------------------------- fruit bush
BW, BH = 42, 34
BUSH_ANCHOR = (21, 31)


def leaf(im, bx, by, ang, length, width, tone):
    """An almond leaf from base (bx, by) pointing along ang (radians, screen space, y down).
    Drawn twice: a 1-px-fatter GAP shape first (the dark seam between leaves), then the leaf itself."""
    ux, uy = math.cos(ang), math.sin(ang)
    vx, vy = -uy, ux
    # light comes from the top-left: the side whose normal points up-left is lit
    lit_side = 1 if (vx * -0.7 + vy * -0.7) > 0 else -1
    pts = {}
    r = int(length + width + 2)
    for y in range(int(by) - r, int(by) + r + 1):
        for x in range(int(bx) - r, int(bx) + r + 1):
            dx, dy = x + 0.5 - bx, y + 0.5 - by
            u = dx * ux + dy * uy
            v = dx * vx + dy * vy
            if u < -0.6 or u > length + 0.6:
                continue
            t = max(0.0, min(1.0, u / length))
            half = width * 0.5 * math.sin(math.pi * (0.12 + 0.88 * t)) ** 0.7
            if abs(v) <= half + 0.85:
                pts[(x, y)] = (u, v, half, t)
    for (x, y), (u, v, half, t) in pts.items():
        if abs(v) > half:
            put(im, x, y, GAP)
    for (x, y), (u, v, half, t) in pts.items():
        if abs(v) > half:
            continue
        k = tone
        if v * lit_side > 0.4:
            k += 1
            if abs(v) > half - 1.0 and 0.25 < t < 0.9:
                k += 1                     # lit leaf edge
        elif v * lit_side < -0.6:
            k -= 1
        if t > 0.6:
            k += 1                         # tips catch light
        if abs(v) < 0.5 and 0.2 < t < 0.7:
            k -= 2                         # mid-rib
        k = max(0, min(len(LEAF) - 1, k))
        put(im, x, y, LEAF[k])
    # one specular glint on bright leaves, near the tip on the lit side
    if tone >= 3:
        gx = bx + ux * length * 0.68 + vx * lit_side * width * 0.2
        gy = by + uy * length * 0.68 + vy * lit_side * width * 0.2
        if (int(gx), int(gy)) in pts:
            put(im, int(gx), int(gy), SPEC)


def bush_leaves():
    """Hand-placed leaves, back to front. Each leaf is given by its TIP; it points away from the root (21, 29),
    so the leaves fan out of the base like the jungle shrubs (fol_bush_round)."""
    im = Image.new("RGBA", (BW, BH), (0, 0, 0, 0))
    rnd = random.Random(11)
    rx0, ry0 = 21.0, 29.0
    # a dark core so no holes show between leaves
    for y in range(BH):
        for x in range(BW):
            ex, ey = (x + 0.5 - 21) / 16.0, (y + 0.5 - 20) / 10.5
            if ex * ex + ey * ey <= 1.0:
                put(im, x, y, GAP if y < 22 else LEAF[0])

    def ring(n, frac, a0, a1, length, width, tone, jitter=0.12):
        for i in range(n):
            a = math.radians(a0 + (a1 - a0) * (i + 0.5) / n) + rnd.uniform(-jitter, jitter)
            tx = 21 + math.cos(a) * 19.5 * frac
            ty = 18.5 + math.sin(a) * 15.0 * frac
            d = math.hypot(tx - rx0, ty - ry0)
            ux, uy = (tx - rx0) / d, (ty - ry0) / d
            L = length + rnd.uniform(-0.7, 0.7)
            leaf(im, tx - ux * L, ty - uy * L, math.atan2(uy, ux), L, width, tone + rnd.choice((0, 0, -1)))

    ring(9, 1.04, 168, 372, 10.5, 6.2, 2)    # outer rim, darkest
    ring(7, 0.70, 180, 360, 9.5, 6.2, 3)
    ring(4, 0.36, 200, 340, 8.0, 5.8, 4)     # lit crown
    leaf(im, 21, 14, -1.57, 6.5, 5.0, 5)
    # front skirt: leaves drooping down and out over the base
    for bx, ang, tone in [(11, 2.6, 2), (18, 1.95, 3), (25, 1.25, 2), (31, 0.55, 3)]:
        leaf(im, bx, 22, ang + rnd.uniform(-0.08, 0.08), 9.0, 6.0, tone)
    outline_outside(im, INK)
    return im


# fruit: round 4x4 body (corners cut) inside a warm outline; light from the top-left
FRUIT = [
    ".KKKK.",
    "KHLMMK",
    "KLMMSK",
    "KMMSDK",
    ".KSDK.",
    "..KK..",
]
FRUIT_SMALL = [
    ".KKK.",
    "KHMMK",
    "KMMSK",
    ".KDK.",
    "..K..",
]
FRUIT_PAL = {"K": FR_K, "H": FR_H, "L": FR_L, "M": FR_M, "S": FR_S, "D": FR_D}

# clusters hang from a stalk; fruit listed back to front (top-left of each stamp)
CLUSTERS = [
    {"stalk": (12, 7), "fruit": [(9, 8, "s"), (12, 8, "b"), (9, 11, "b")]},
    {"stalk": (24, 3), "fruit": [(20, 4, "b"), (24, 4, "s"), (22, 7, "b")]},
    {"stalk": (33, 9), "fruit": [(30, 10, "b"), (34, 11, "s")]},
    {"stalk": (17, 15), "fruit": [(14, 16, "b"), (18, 16, "s"), (16, 19, "s")]},
    {"stalk": (28, 16), "fruit": [(25, 17, "s"), (28, 17, "b"), (26, 20, "b")]},
    {"stalk": (5, 18), "fruit": [(3, 19, "s"), (6, 20, "s")]},
    {"stalk": (37, 19), "fruit": [(35, 20, "s")]},
]


def build_bush(ripe=True):
    im = bush_leaves()
    if ripe:
        for cl in CLUSTERS:
            sx, sy = cl["stalk"]
            for fx, fy, sz in cl["fruit"]:
                stamp(im, fx, fy, FRUIT if sz == "b" else FRUIT_SMALL, FRUIT_PAL)
            if get(im, sx, sy - 1)[3]:
                put(im, sx, sy - 1, STALK)
    else:
        for n, cl in enumerate(CLUSTERS):
            sx, sy = cl["stalk"]
            fx, fy, _ = cl["fruit"][-1]
            # bare stalk stub where the cluster hung: a short twig ending in a dark broken nub
            d = 1 if n % 2 else -1
            put(im, sx, sy, STALK_L)
            put(im, sx, sy + 1, STALK)
            put(im, sx + d, sy + 2, STALK)
            put(im, sx + d, sy + 3, FR_K)
            # a torn leaf: a ragged dark notch and a bruised, yellowed texel beside it
            put(im, fx + 2, fy + 2, GAP)
            put(im, fx + 3, fy + 2, GAP)
            put(im, fx + 2, fy + 3, LEAF[1])
            put(im, fx + 1, fy + 1, hx("#4a5a34"))
        # one small unripe fruit left behind
        stamp(im, 27, 19, [".kkk.", "kLMMk", "kMMDk", ".kkk."],
              {"k": INK, "L": UN_L, "M": UN_M, "D": UN_D})
        put(im, 29, 18, STALK)
    check_alpha(im)
    return im


# --------------------------------------------------------------------------------------------- stumps
STUMP_ANCHOR = (30, 49)
FUNGUS_COLORS = {hx(c) for c in ("#d4a67b", "#94735c", "#bd8b63", "#edd19c", "#84624c", "#502614")}
FUNGUS_BOX = (33, 25, 50, 39)


def bark_at(x, y):
    """Procedural stump bark: vertical striations, darker toward the right (light from the top-left)."""
    rnd = random.Random(x * 7919 + 13)
    col = rnd.choice((0, 1, 1, 2, 2, 3))
    if (x + y // 3) % 5 == 0:
        col += 1
    if random.Random(x * 31 + y * 1013).random() < 0.18:
        col -= 1
    col -= (x - 38) // 6
    return BARK[max(0, min(4, col))]


def stump_strip_fungus():
    im = Image.open(SPR / "fol_stump.png").convert("RGBA")
    x0, y0, x1, y1 = FUNGUS_BOX
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = im.getpixel((x, y))
            if p[3] and p in FUNGUS_COLORS:
                im.putpixel((x, y), bark_at(x, y))
    return im


def build_stump_bare():
    im = stump_strip_fungus()
    # the pale scar where the bracket broke off: lit upper lip, exposed wood, dark torn underside
    stamp(im, 37, 30, [
        ".cccb.",
        "cbbbak",
        ".kkkk.",
    ], {"a": SCAR[1], "b": SCAR[2], "c": SCAR[3], "k": SCAR[0]})
    stamp(im, 41, 35, ["cb", "kk"], {"b": SCAR[2], "c": SCAR[3], "k": SCAR[0]})
    # a little moss creeping into the gap
    for x, y, c in [(44, 27, "#1b432b"), (45, 27, "#2b5438"), (44, 28, "#0b3531"), (36, 36, "#1b432b")]:
        put(im, x, y, hx(c))
    check_alpha(im)
    return im


# brackets seen from above-front: a straight edge grown into the bark at the top (darker), growth rings on the top
# face, a lit cream rim along the curved free edge, the underside and its dark shadow below
SHELF_BIG = [
    ".kRRRRRRRRRk.",
    "kLLMMMMMMMMRk",
    "kLMRRRRRRRMSk",
    ".kLMMMMMMMSk.",
    ".kLhLLLLLLLk.",
    "..kSSSSSSSk..",
    "...kgggggk...",
]
SHELF_MED = [
    ".kRRRRRRk.",
    "kLLMMMMMRk",
    "kLMRRRRMSk",
    ".kLhLLLLk.",
    "..kSSSSk..",
    "...kggk...",
]
SHELF_SMALL = [
    ".kRRRk.",
    "kLMMMRk",
    ".khLLk.",
    "..kSk..",
]


def build_stump_fungus():
    im = stump_strip_fungus()
    stamp(im, 39, 24, SHELF_MED, FU)
    stamp(im, 33, 28, SHELF_BIG, FU)
    stamp(im, 40, 34, SHELF_SMALL, FU)
    put(im, 36, 29, FU["h"])          # an extra glint on the big cap: "pick me"
    check_alpha(im)
    return im


def build_log_overlay():
    im = Image.new("RGBA", (24, 20), (0, 0, 0, 0))
    stamp(im, 11, 3, SHELF_MED, FU)
    stamp(im, 3, 8, SHELF_BIG, FU)
    stamp(im, 14, 14, SHELF_SMALL, FU)
    put(im, 6, 9, FU["h"])
    outline_outside(im, FU["k"])      # the attached edges need an edge on the transparent card
    check_alpha(im)
    return im


# --------------------------------------------------------------------------------------------- fol_log repaint
# critic N2 P2-7: logs are never fungus hosts, so the three pale brackets baked into fol_log promise a harvest that
# isn't there. Paint them out: the shelf texels (and the dark lens outline around them) take the bark along the grain,
# then a few moss texels creep in where the shelves were. The alpha mask is never touched.
ORIG = HERE / "orig"
LOG_SHELF_COLORS = {hx(c) for c in ("#edd19c", "#d4a67b", "#a9744d", "#804f34", "#502614", "#faf0cc", "#5d483b",
                                     "#94735c", "#84624c")}
LOG_INKS = {hx("#030302"), hx("#080100")}
LOG_BOXES = [(44, 24, 52, 29), (24, 30, 41, 37), (6, 22, 13, 25)]   # inclusive: right shelf, lower shelf, left cap
LOG_GRAIN = (3, -1)          # the log runs from lower-left to upper-right
MOSS = [hx(c) for c in ("#0b3531", "#1b432b", "#2b5438", "#346340", "#49693f")]


def log_original():
    src = ORIG / "fol_log.png"
    if not src.exists():                      # first run: keep the untouched export (it has the fungus)
        ORIG.mkdir(exist_ok=True)
        shutil.copy2(SPR / "fol_log.png", src)
    return Image.open(src).convert("RGBA")


def build_log():
    im = log_original()
    W, H = im.size
    opaque = lambda x, y: get(im, x, y)[3] > 0
    kill = set()
    for x0, y0, x1, y1 in LOG_BOXES:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if get(im, x, y) in LOG_SHELF_COLORS:
                    kill.add((x, y))
    # the shelf's dark lens outline: inks touching a shelf texel and buried in the log (not on its silhouette)
    rim = set()
    for (x, y) in kill:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q in kill or get(im, *q) not in LOG_INKS:
                continue
            if all(opaque(q[0] + a, q[1] + b) for a in (-1, 0, 1) for b in (-1, 0, 1)):
                rim.add(q)
    kill |= rim
    src = im.copy()

    def is_moss(c):
        return c[1] > c[0] + 10

    for (x, y) in sorted(kill):
        for k in (1, -1, 2, -2, 3, -3, 4, -4, 5, -5):
            q = (x + LOG_GRAIN[0] * k, y + LOG_GRAIN[1] * k)
            c = get(src, *q)
            if q in kill or not c[3] or is_moss(c) or c in LOG_SHELF_COLORS:
                continue
            put(im, x, y, c)
            break
        else:
            put(im, x, y, BARK[1])
    # moss creeping into the old shelf sites: low, ragged, dark (nothing a player reads as a cap)
    for x, y, i in [(45, 25, 1), (46, 25, 2), (47, 25, 1), (46, 26, 0), (49, 26, 1), (50, 26, 2), (50, 27, 1),
                    (29, 33, 1), (30, 33, 2), (31, 33, 3), (32, 33, 2), (30, 34, 0), (32, 34, 1), (33, 34, 0),
                    (36, 35, 1), (37, 35, 2), (37, 36, 0),
                    (8, 23, 2), (9, 23, 3), (10, 23, 2), (11, 23, 1), (9, 24, 0)]:
        if opaque(x, y):
            put(im, x, y, MOSS[i])
    assert all((src.getpixel((x, y))[3] > 0) == (im.getpixel((x, y))[3] > 0) for y in range(H) for x in range(W))
    check_alpha(im)
    return im


# --------------------------------------------------------------------------------------------- dusk bloom
BLOOM_W, BLOOM_H = 32, 36
BLOOM_ANCHOR = (16, 33)
STEM = [hx(c) for c in ("#0b3531", "#1b432b", "#2b5438", "#45704a")]
# closed bud: dull indigo/violet, every value well under the emissive floor
BUD = {"k": hx("#140c24"), "d": hx("#251a40"), "s": hx("#3b2a66"), "m": hx("#533d86"), "l": hx("#6d55a0"),
       "q": STEM[0], "Q": STEM[1], "G": STEM[2], "g": STEM[3]}
# open bloom. EMISSIVE glow texels (value >= 0.72, saturation >= 0.4) are only the core and the two lit petal tones:
#   core:   #7ef9ff (hot centre, 183 deg), #2ce8f5 (184 deg), #1ab4d6 (191 deg)
#   petals: #cc96ff (271 deg, the lit petal face), #9a6ef0 (260 deg, mid petal)
# shade #5b3fa6 (V 0.65) and the outline stay dark, so the glow draws the flower's shape, not a blob.
PET = {"k": hx("#1d1038"), "D": hx("#3a2470"), "S": hx("#5b3fa6"), "M": hx("#9a6ef0"), "L": hx("#cc96ff")}
CORE = {"o": hx("#0e3a52"), "c": hx("#1ab4d6"), "C": hx("#2ce8f5"), "H": hx("#7ef9ff")}
SPENT = {"k": hx("#140c0a"), "d": hx("#2e2018"), "m": hx("#4a3424"), "l": hx("#6b4c32"), "v": hx("#4a3a5c")}


def bloom_leaves(tone_shift=0, droop=0.0):
    """Broad leaves fanning out of the base (16, 32), back to front, tone_shift < 0 = tired / dimmer."""
    im = Image.new("RGBA", (BLOOM_W, BLOOM_H), (0, 0, 0, 0))
    leaves = [  # (base x, base y, angle deg, length, width, tone)
        (15, 30, 200 + droop, 13.0, 7.0, 2),    # long leaf out to the left
        (17, 30, -20 - droop, 12.5, 7.0, 2),    # out to the right
        (15, 29, 232 + droop * 0.5, 9.5, 6.4, 3),   # up-left
        (17, 29, -50 - droop * 0.5, 9.0, 6.2, 3),   # up-right
        (14, 32, 168 + droop, 8.0, 5.6, 3),     # front-left, drooping over the ground
        (18, 32, 14 - droop, 8.5, 5.6, 4),      # front-right, lit
    ]
    for bx, by, ang, L, Wd, tone in leaves:
        leaf(im, bx, by, math.radians(ang), L, Wd, max(0, tone + tone_shift))
    return im


def stalk(im, pts):
    """A 1-texel stalk through pts (list of (x, y)), lit on its left: a light texel left of every dark one."""
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n + 1):
            x = round(x0 + (x1 - x0) * i / n)
            y = round(y0 + (y1 - y0) * i / n)
            put(im, x, y, STEM[2])
            put(im, x + 1, y, STEM[1])
            if y > 24:                    # thicker at the base
                put(im, x - 1, y, STEM[3])


BUD_ROWS = [
    "....kk....",
    "...kmlk...",
    "..kmlmsk..",
    "..kmlmsk..",
    ".kmllmsdk.",
    ".kmlmmsdk.",
    ".kslmmsdk.",
    ".kGsmsdQk.",
    "kgGqsdqQQk",
    ".kgGqqGQk.",
    "..kkgGkk..",
]


def build_bloom_closed():
    im = bloom_leaves()
    stalk(im, [(16, 31), (16, 22), (15, 15), (15, 12)])
    stamp(im, 11, 2, BUD_ROWS, BUD)
    # one furled leaf on the stalk
    stamp(im, 17, 17, ["gk.", "Ggk", ".Qk"], {"g": STEM[3], "G": STEM[2], "Q": STEM[1], "k": INK})
    outline_outside(im, INK)
    check_alpha(im)
    return im


def petal(im, cx, cy, ang, length, width, lit):
    """One petal from the core outward along ang (deg); squashed vertically (seen from front-above)."""
    a = math.radians(ang)
    ux, uy = math.cos(a), math.sin(a) * 0.78
    nrm = math.hypot(ux, uy)
    ux, uy = ux / nrm, uy / nrm
    vx, vy = -uy, ux
    r = int(length + width + 2)
    for y in range(int(cy) - r, int(cy) + r + 1):
        for x in range(int(cx) - r, int(cx) + r + 1):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            u = dx * ux + dy * uy
            v = dx * vx + dy * vy
            if u < 0.3 or u > length + 0.3:
                continue
            t = u / length
            q = (t - 0.56) / 0.5                      # rounded spoon: narrow at the core, widest past the middle
            if abs(q) >= 1.0:
                continue
            half = width * 0.5 * math.sqrt(1.0 - q * q)
            if abs(v) > half:
                continue
            # light from the top-left: upper-left petals and the lit half of each petal are brightest
            k = 3 + lit
            if t > 0.4:
                k += 1
            if v * (1 if (vx * -0.7 + vy * -0.7) > 0 else -1) < -0.8:
                k -= 1
            if abs(v) < 0.6 and t < 0.55:
                k -= 1                       # a darker vein running into the core
            k = max(1, min(4, k))
            put(im, x, y, PET["DSML"[k - 1]])


def build_bloom_open():
    im = bloom_leaves()
    stalk(im, [(16, 31), (16, 22), (15, 15), (15, 11)])
    stamp(im, 17, 17, ["gk.", "Ggk", ".Qk"], {"g": STEM[3], "G": STEM[2], "Q": STEM[1], "k": INK})
    cx, cy = 15.5, 9.0
    head = Image.new("RGBA", im.size, (0, 0, 0, 0))
    # each petal on its own card with its own dark outline, composited back to front, so every petal is a
    # separate lobe: a back ring of short dim petals peeking between the five long front ones
    rings = [(ang, 6.4, 4.4, -2) for ang in (-54, 18, 90, 162, 234)]                 # back ring, in shadow
    rings += [(ang, 9.0, 6.6, 0 if ang in (-90, 198) else -1) for ang in (54, 126, -18, 198, -90)]
    for ang, L, Wd, lit in rings:
        card = Image.new("RGBA", im.size, (0, 0, 0, 0))
        petal(card, cx, cy, ang, L, Wd, lit)
        outline_outside(card, PET["k"])
        head.alpha_composite(card)
    # core: a cyan disc with a hot centre and stamen dots
    for y in range(4, 15):
        for x in range(10, 22):
            d = math.hypot((x + 0.5 - cx), (y + 0.5 - cy) / 0.85)
            if d <= 2.7:
                put(head, x, y, CORE["c"] if d > 1.9 else CORE["C"])
    for x, y in [(14, 8), (15, 8), (14, 9)]:
        put(head, x, y, CORE["H"])
    for x, y in [(17, 10), (16, 11)]:
        put(head, x, y, CORE["c"])
    im.alpha_composite(head)
    # pollen motes drifting off the bloom (glow at dusk too)
    for x, y in [(4, 3), (27, 6), (25, 1)]:
        put(im, x, y, CORE["C"])
    check_alpha(im)
    return im


def build_bloom_spent():
    im = bloom_leaves(tone_shift=-1, droop=8)
    # tired leaves: the outer leaf tips dry to olive-brown (brightness rank kept)
    dry = [hx(c) for c in ("#1e1a10", "#2e2a18", "#45402a", "#5c5434")]
    for y in range(BLOOM_H):
        for x in range(BLOOM_W):
            c = get(im, x, y)
            if c[3] and c not in (INK, GAP) and (x <= 5 or x >= 27 or (y >= 33 and (x <= 9 or x >= 23))):
                put(im, x, y, dry[min(3, sum(c[:3]) // 90)])
    # the stalk bends over and hangs: up, then arcing to the right and down
    stalk(im, [(16, 31), (16, 23), (17, 17), (19, 13), (22, 12), (24, 14)])
    # the withered seed head hangs from the hook, two limp petal shreds dangling under it
    stamp(im, 22, 14, [
        ".kkk.",
        "kmlmk",
        "kdmdk",
        "kvkvk",
        "kvkvk",
        ".k.vk",
        "....k",
    ], SPENT)
    # one fallen petal on the leaves, browned
    stamp(im, 6, 28, [".kk", "kvk", "kk."], {"v": SPENT["v"], "k": SPENT["k"]})
    outline_outside(im, INK)
    check_alpha(im)
    return im


def glow_mask(im, bands, minv=0.72, mins=0.4):
    """The texels src/core/Emissive.js lights for these hue bands (same sRGB test as the shader)."""
    out = set()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = [v / 255 for v in im.getpixel((x, y))]
            if a < 0.5:
                continue
            mx, mn = max(r, g, b), min(r, g, b)
            d = mx - mn
            if mx < minv or d < mins * mx:
                continue
            if mx == r:
                h = ((g - b) / d) % 6
            elif mx == g:
                h = (b - r) / d + 2
            else:
                h = (r - g) / d + 4
            h *= 60
            if any((lo <= h <= hi) if lo <= hi else (h >= lo or h <= hi) for lo, hi in bands):
                out.add((x, y))
    return out


BLOOM_GLOW = [[180, 195], [255, 275]]


# --------------------------------------------------------------------------------------------- export
def save(key, im, anchor):
    im.save(SPR / f"{key}.png")
    s = 8
    big = Image.new("RGBA", im.size, (52, 74, 48, 255))
    big.alpha_composite(im)
    big.resize((im.width * s, im.height * s), Image.NEAREST).save(OUT_PREV / f"{key}_x{s}.png")
    return {"file": f"{key}.png", "ppu": 32, "anchor": list(anchor)}


def main():
    manifest = {
        "prop_fruit_bush": save("prop_fruit_bush", build_bush(True), BUSH_ANCHOR),
        "prop_fruit_bush_bare": save("prop_fruit_bush_bare", build_bush(False), BUSH_ANCHOR),
        "prop_stump_bare": save("prop_stump_bare", build_stump_bare(), STUMP_ANCHOR),
        "prop_stump_fungus": save("prop_stump_fungus", build_stump_fungus(), STUMP_ANCHOR),
        "prop_fungus_log_overlay": save("prop_fungus_log_overlay", build_log_overlay(), (12, 19)),
        "prop_dusk_bloom_closed": save("prop_dusk_bloom_closed", build_bloom_closed(), BLOOM_ANCHOR),
        "prop_dusk_bloom_open": save("prop_dusk_bloom_open", build_bloom_open(), BLOOM_ANCHOR),
        "prop_dusk_bloom_spent": save("prop_dusk_bloom_spent", build_bloom_spent(), BLOOM_ANCHOR),
    }
    save("fol_log", build_log(), (32, 36))   # PNG only: its manifest entry stays in manifest.v2env.json
    glow = glow_mask(Image.open(SPR / "prop_dusk_bloom_open.png").convert("RGBA"), BLOOM_GLOW)
    print("prop_dusk_bloom_open glow texels:", len(glow), "bands", BLOOM_GLOW)
    (ROOT / "pixel-art" / "manifest.forage.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
    for k, e in manifest.items():
        print(k, Image.open(SPR / e["file"]).size, e["anchor"])


if __name__ == "__main__":
    main()
