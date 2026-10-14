"""Verdant Relay - Collection / research-tree icons (critic H #11): 24x24, single frame, hand-placed.

Replaces the text glyphs the Collection used (unlock nodes, district rows, the lock badge). Light from the
top-left, 1-px ink outline (#181425, the UI ink), Endesga-32 ramps like the rest of the UI art.

icon_parang icon_wide_choice icon_scarf icon_arc icon_salvage icon_flare icon_map icon_swap icon_notes
icon_scout icon_reroll icon_archivist icon_sap_cannon icon_lure_totem icon_bramble_wall
icon_district_<overgrown_market|flooded_transit|canopy_greenhouse|collapsed_residential|data_center>
icon_lock (7x9, glyph-sized)
icon_protocol_<snare|arc|flare> (the Relay Protocol ability buttons)
Run: python pixel-art/ui_icons/build.py [key ...]
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
from v3lib import Grid, Shape, ellipse_poly, stroke_poly, save_sprite, board, up, SCRATCH  # noqa: E402
from PIL import Image  # noqa: E402

INK = "#181425"
# Endesga-32 ramps
STEEL = ["#262b44", "#3a4466", "#5a6988", "#8b9bb4", "#c0cbdc", "#ffffff"]
WOOD = ["#3e2731", "#733e39", "#b86f50", "#e4a672"]
GREEN = ["#193c3e", "#265c42", "#3e8948", "#63c74d", "#99e550"]
CYAN = ["#124e89", "#0099db", "#2ce8f5", "#ffffff"]
AMBER = ["#be4a2f", "#d77643", "#f77622", "#feae34", "#fee761"]
PAPER = ["#c28569", "#e4a672", "#ead4aa", "#ffffff"]
RED = ["#a22633", "#e43b44", "#f6757a"]
PURPLE = ["#3e2731", "#68386c", "#b55088", "#f6757a"]
BLUE = ["#124e89", "#0099db"]


# --------------------------------------------------------------------------- helpers
def poly(pts, w=24, h=24):
    return Shape(w, h).add(pts).mask()


def disc(cx, cy, r, w=24, h=24):
    return {(x, y) for y in range(h) for x in range(w) if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r}


def ring(cx, cy, r0, r1, w=24, h=24):
    return {(x, y) for y in range(h) for x in range(w) if r0 * r0 < (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r1 * r1}


def box(x0, y0, x1, y1):
    return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}


def shade(g, m, ramp, base=None, lit=None, dark=None, hi=None):
    """Fill mask m: base tone, top/left edge texels one step lighter, bottom/right edge one step darker."""
    n = len(ramp)
    b = base if base is not None else n // 2
    for p in m:
        g.px(*p, ramp[b])
    for (x, y) in m:
        up_, lf = (x, y - 1) not in m, (x - 1, y) not in m
        dn, rt = (x, y + 1) not in m, (x + 1, y) not in m
        if (up_ or lf) and not (dn or rt):
            g.px(x, y, ramp[min(n - 1, b + 1)] if lit is None else ramp[lit])
        elif (dn or rt) and not (up_ or lf):
            g.px(x, y, ramp[max(0, b - 1)] if dark is None else ramp[dark])
    if hi:
        for p in hi:
            g.px(*p, ramp[-1])


def finish(g, outline=True):
    if outline:
        g.outline(INK)
    return g


def arrowhead(g, tip, d, size, c, edge=None):
    """Filled triangular arrowhead pointing along unit vector d."""
    nx, ny = -d[1], d[0]
    base = (tip[0] - d[0] * size, tip[1] - d[1] * size)
    pts = [tip, (base[0] + nx * size * 0.9, base[1] + ny * size * 0.9), (base[0] - nx * size * 0.9, base[1] - ny * size * 0.9)]
    m = poly(pts)
    for p in m:
        g.px(*p, c)
    return m


# --------------------------------------------------------------------------- icons
def parang():
    g = Grid(24, 24)
    # handle: wood, from the bottom-left corner up to the guard
    hm = poly(stroke_poly([(2.5, 21.5), (8.0, 16.0)], 3.4))
    shade(g, hm, WOOD, base=2, lit=3, dark=1)
    for t in (0.3, 0.62):                      # cord wraps
        x, y = 2.5 + 5.5 * t, 21.5 - 5.5 * t
        g.px(int(x), int(y), WOOD[0])
        g.px(int(x) + 1, int(y) - 1, WOOD[1])
    g.px(2, 21, WOOD[1])                        # pommel
    # brass bolster
    bm = poly(stroke_poly([(7.4, 16.6), (9.6, 14.4)], 4.6))
    shade(g, bm, AMBER, base=3, lit=4, dark=1)
    # blade: straight spine (upper-left edge), deep belly swelling toward the tip (lower-right)
    blade = poly([(9.0, 13.4), (19.6, 2.8), (22.0, 1.8), (22.8, 4.0), (22.4, 8.6), (20.0, 13.2), (15.0, 17.4), (11.6, 18.0), (10.2, 16.0)])
    shade(g, blade, STEEL, base=3, lit=4, dark=2)
    # bevel: the cutting edge (lower-right) catches a bright line one texel inside; spine highlight
    for (x, y) in blade:
        if (x + 1, y + 1) not in blade and (x, y + 1) not in blade and (x - 1, y - 1) in blade:
            g.px(x - 1, y - 1, STEEL[4])
    for (x, y) in sorted(blade):
        if (x - 1, y) not in blade and (x, y - 1) not in blade and x + y < 30:
            g.px(x, y, STEEL[5])
    g.px(20, 4, STEEL[5])
    return finish(g)


def card(g, x0, yb, shear, band, w=8, h=13):
    """A sheared playing card (clean stair-step tilt, no rotation): ink edge, paper face, coloured top band.
    x0/yb = bottom-left texel; shear = how many texels the top row sits right (+) or left (-) of the bottom."""
    rows = {}
    for r in range(h):                      # r = 0 top row
        off = round(shear * (h - 1 - r) / (h - 1))
        rows[r] = x0 + off
    for r in range(h):
        y = yb - (h - 1 - r)
        xl = rows[r]
        for x in range(xl, xl + w):
            edge = x == xl or x == xl + w - 1 or r == 0 or r == h - 1
            if edge:
                c = INK
            elif r <= 3:
                c = band[1] if (r == 1 or x == xl + 1) else band[0]
            elif x == xl + w - 2 or r == h - 2:
                c = PAPER[1]
            else:
                c = PAPER[2]
            g.px(x, y, c)
    # pip in the middle of the face
    r = h // 2 + 1
    g.px(rows[r] + w // 2 - 1, yb - (h - 1 - r), band[0])
    g.px(rows[r] + w // 2, yb - (h - 1 - r), band[0])


def wide_choice():
    g = Grid(24, 24)
    bands = [(GREEN[2], GREEN[4]), (AMBER[3], AMBER[4]), (CYAN[1], CYAN[2]), (RED[1], RED[2])]
    for (x0, yb, sh), band in zip(((2, 22, -2), (6, 20, -1), (10, 20, 1), (14, 22, 2)), bands):
        card(g, x0, yb, sh, band, w=8, h=15)
    return g


def scarf():
    """The scavenger's hooded head (cyan goggles) wearing the green scarf, tails fluttering out to the right."""
    g = Grid(24, 24)
    G = ["#193c3e", "#265c42", "#3e8948", "#63c74d", "#99e550"]
    HOOD = ["#181425", "#262b44", "#3a4466", "#5a6988"]
    # shoulders
    sh = poly([(1.0, 23.5), (3.0, 18.5), (8.0, 16.5), (14.0, 16.5), (18.0, 19.0), (19.0, 23.5)])
    shade(g, sh, HOOD, base=1, lit=2, dark=0)
    # hooded head
    head = disc(10.0, 8.6, 6.4)
    shade(g, head, HOOD, base=2, lit=3, dark=1)
    face = {(x, y) for (x, y) in disc(10.6, 10.0, 4.2) if y >= 8}
    for p in face:
        g.px(*p, HOOD[0])
    # goggles: a cyan band with two lenses
    for x in range(5, 16):
        g.px(x, 8, CYAN[0])
    for cx in (8, 13):
        for p in box(cx - 1, 7, cx + 1, 9):
            g.px(*p, CYAN[1])
        g.px(cx - 1, 7, CYAN[3])
        g.px(cx, 7, CYAN[2])
    # the scarf: a thick wrap around the neck...
    wrap = {(x, y) for y in range(24) for x in range(24)
            if ((x + 0.5 - 10.5) / 7.6) ** 2 + ((y + 0.5 - 15.6) / 2.9) ** 2 <= 1}
    for (x, y) in wrap:
        g.px(x, y, G[3] if (x // 2) % 2 == 0 else G[2])       # knit ribbing
    for (x, y) in wrap:
        if (x, y - 1) not in wrap:
            g.px(x, y, G[4])
        elif (x, y + 1) not in wrap:
            g.px(x, y, G[1])
    # ...and two striped tails streaming out to the right from a knot
    t1 = poly([(15.0, 14.0), (19.0, 12.6), (23.6, 13.2), (23.6, 16.4), (19.4, 16.6), (16.0, 17.6)])
    t2 = poly([(15.0, 16.0), (18.6, 17.4), (22.6, 20.4), (21.0, 22.6), (17.4, 20.4), (14.4, 18.6)])
    shade(g, t2, G, base=2, lit=3, dark=1)
    shade(g, t1, G, base=3, lit=4, dark=2)
    for (x, y) in t1:
        if x in (19, 20):
            g.px(x, y, PAPER[2])                                # cream knit stripes
    for (x, y) in t2:
        if 18 <= x + (y - 17) * 0.3 < 19.6:
            g.px(x, y, PAPER[1])
    kn = disc(15.4, 15.6, 2.2)
    shade(g, kn, G, base=2, lit=4, dark=1)
    return finish(g)


def arc():
    g = Grid(24, 24)
    # impact burst on the ground
    burst = {(x, y) for (x, y) in disc(12.0, 19.5, 6.5) if ((x + 0.5 - 12) / 6.5) ** 2 + ((y + 0.5 - 19.5) / 2.6) ** 2 <= 1}
    for p in burst:
        g.px(*p, CYAN[0])
    for p in {(x, y) for (x, y) in burst if ((x + 0.5 - 12) / 4.2) ** 2 + ((y + 0.5 - 19.5) / 1.6) ** 2 <= 1}:
        g.px(*p, CYAN[1])
    # the bolt: a jagged zig-zag from the sky
    bolt = poly([(14.5, 0.5), (19.0, 0.5), (14.6, 7.6), (18.4, 7.6), (10.6, 19.8), (12.4, 11.6), (8.4, 11.6)])
    for p in bolt:
        g.px(*p, CYAN[2])
    for (x, y) in bolt:
        if (x - 1, y) not in bolt:
            g.px(x, y, CYAN[3])
        elif (x + 1, y) not in bolt:
            g.px(x, y, CYAN[1])
    # sparks
    for (x, y) in ((5, 16), (19, 15), (4, 20), (20, 21), (7, 13)):
        g.px(x, y, CYAN[3])
    return finish(g)


def salvage():
    g = Grid(24, 24)
    # gear (scrap) in the middle
    gear = disc(12, 12, 4.6)
    for k in range(8):
        a = k * math.pi / 4
        gear |= disc(12 + math.cos(a) * 5.2, 12 + math.sin(a) * 5.2, 1.3)
    gear -= disc(12, 12, 1.6)
    shade(g, gear, STEEL, base=3, lit=4, dark=2)
    g.px(11, 11, STEEL[1])
    # two curved arrows chasing each other around it (recycling)
    for a0, a1 in ((math.radians(200), math.radians(330)), (math.radians(20), math.radians(150))):
        pts = [(12 + math.cos(a0 + (a1 - a0) * i / 20) * 9.2, 12 + math.sin(a0 + (a1 - a0) * i / 20) * 9.2) for i in range(21)]
        am = poly(stroke_poly(pts, 2.6))
        shade(g, am, AMBER, base=3, lit=4, dark=2)
        tip = (12 + math.cos(a1 + 0.38) * 9.2, 12 + math.sin(a1 + 0.38) * 9.2)
        d = (-math.sin(a1), math.cos(a1))
        hm = arrowhead(g, tip, d, 3.2, AMBER[3])
        for (x, y) in hm:
            if (x - 1, y) not in hm or (x, y - 1) not in hm:
                g.px(x, y, AMBER[4])
    return finish(g)


def flare():
    g = Grid(24, 24)
    # stick: red casing with a white band, held diagonally
    st = poly(stroke_poly([(4.0, 20.0), (11.4, 12.6)], 3.6))
    shade(g, st, RED, base=1, lit=2, dark=0)
    for (x, y) in st:
        if 13.0 <= x + y <= 14.0 + 1:
            g.px(x, y, STEEL[4])
    # burst: 8-ray star of light around the flame
    cx, cy = 14.5, 9.5
    rays = set()
    for k in range(8):
        a = k * math.pi / 4 + 0.2
        L = 9.0 if k % 2 == 0 else 6.0
        rays |= poly(stroke_poly([(cx, cy), (cx + math.cos(a) * L, cy + math.sin(a) * L)], 2.2 if k % 2 == 0 else 1.6, 0.6))
    for p in rays:
        g.px(*p, AMBER[3])
    core = disc(cx, cy, 3.6)
    for p in core:
        g.px(*p, AMBER[4])
    for p in disc(cx - 0.6, cy - 0.6, 1.8):
        g.px(*p, "#ffffff")
    # redraw the stick tip over the burst so it reads as the source
    for p in poly(stroke_poly([(9.6, 14.4), (11.4, 12.6)], 3.6)):
        g.px(*p, RED[1])
    return finish(g)


def mapicon():
    g = Grid(24, 24)
    # tri-fold map: three panels, the middle one shaded (folded away from the light)
    panels = [
        poly([(2.0, 5.0), (8.6, 3.0), (8.6, 19.0), (2.0, 21.0)]),
        poly([(8.6, 3.0), (15.4, 5.0), (15.4, 21.0), (8.6, 19.0)]),
        poly([(15.4, 5.0), (22.0, 3.0), (22.0, 19.0), (15.4, 21.0)]),
    ]
    for i, m in enumerate(panels):
        for p in m:
            g.px(*p, PAPER[2] if i != 1 else PAPER[1])
    # land masses
    for p in (disc(6.0, 10.0, 3.0) | disc(11.0, 14.0, 3.2) | disc(18.5, 9.0, 2.6)):
        if any(p in m for m in panels):
            g.px(*p, GREEN[3] if g.get(*p) == PAPER[2] else GREEN[2])
    # river
    for (x, y) in ((16, 15), (17, 14), (18, 14), (19, 13), (20, 13), (14, 16), (15, 16)):
        g.px(x, y, BLUE[1])
    # dashed route to the pin
    route = [(4, 17), (5, 16), (7, 15), (9, 11), (10, 10), (12, 9), (14, 9), (15, 10)]
    for i, p in enumerate(route):
        if i % 2 == 0:
            g.px(*p, RED[0])
    # pin
    for p in disc(17.5, 7.5, 2.2):
        g.px(*p, RED[1])
    g.px(17, 7, RED[2])
    g.px(17, 10, RED[0])
    g.px(17, 11, RED[0])
    # fold creases
    for y in range(4, 20):
        g.px(8, y, PAPER[0], only={PAPER[2], GREEN[3], GREEN[2], PAPER[1]})
        g.px(15, y + 1, PAPER[0], only={PAPER[2], GREEN[3], GREEN[2], PAPER[1], BLUE[1]})
    return finish(g)


def swap():
    g = Grid(24, 24)
    # two area cards (district swatches), one behind the other
    a = box(2, 3, 11, 12)
    b = box(12, 11, 21, 20)
    shade(g, a, GREEN, base=2, lit=3, dark=1)
    shade(g, b, ["#0b2a4a", BLUE[0], BLUE[1], CYAN[2]], base=2, lit=3, dark=1)
    for (x, y) in ((4, 9), (5, 8), (6, 9), (7, 7), (8, 8), (9, 6)):
        g.px(x, y, GREEN[4])
    for (x, y) in ((14, 16), (15, 15), (16, 16), (17, 15), (18, 16), (19, 15)):
        g.px(x, y, CYAN[3])
    for p in (a | b):
        pass
    finish(g)
    # swap arrows: top one points right, bottom one points left (cyan)
    top = poly(stroke_poly([(13.0, 4.5), (19.0, 4.5), (19.0, 7.5)], 2.0))
    for p in top:
        g.px(*p, CYAN[2])
    arrowhead(g, (19.0, 10.6), (0, 1), 2.8, CYAN[2])
    bot = poly(stroke_poly([(11.0, 19.5), (5.0, 19.5), (5.0, 16.5)], 2.0))
    for p in bot:
        g.px(*p, CYAN[2])
    arrowhead(g, (5.0, 13.4), (0, -1), 2.8, CYAN[2])
    # ink around the arrows only where they sit on empty space
    arrows = {(x, y) for y in range(24) for x in range(24) if g.get(x, y) == CYAN[2]}
    for (x, y) in arrows:
        if (x, y - 1) not in arrows:
            g.px(x, y, CYAN[3])
    for (x, y) in arrows:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if g.get(x + dx, y + dy) is None:
                g.px(x + dx, y + dy, INK)
    return g


def notes():
    g = Grid(24, 24)
    # notebook: leather cover with a page block peeking out on the right, elastic band
    pages = box(5, 4, 19, 21)
    for p in pages:
        g.px(*p, PAPER[2])
    for y in range(5, 21, 2):
        g.px(19, y, PAPER[1])
    cover = box(3, 3, 17, 20)
    shade(g, cover, WOOD, base=1, lit=2, dark=0)
    for y in range(3, 21):
        g.px(5, y, WOOD[0])       # spine stitch line
    for x in range(3, 18):
        g.px(x, 15, AMBER[2])     # elastic band
    g.px(10, 8, WOOD[3])
    g.px(11, 8, WOOD[3])
    # pencil across the cover
    pen = poly(stroke_poly([(9.0, 21.5), (21.5, 9.0)], 3.2))
    shade(g, pen, AMBER, base=3, lit=4, dark=2)
    tip = poly([(19.8, 10.6), (22.8, 7.6), (23.0, 6.0), (21.4, 6.4), (18.4, 9.4)])
    for p in tip:
        g.px(*p, PAPER[1])
    g.px(22, 6, INK)
    for p in poly(stroke_poly([(8.4, 22.0), (10.4, 20.0)], 3.2)):
        g.px(*p, RED[2])
    return finish(g)


def scout():
    g = Grid(24, 24)
    # binoculars: two barrels joined by a hinge, cyan lenses facing us
    for cx in (7.0, 17.0):
        body = disc(cx, 13.0, 5.6)
        shade(g, body, STEEL, base=1, lit=2, dark=0)
        lens = disc(cx, 13.5, 3.6)
        for p in lens:
            g.px(*p, CYAN[0])
        for p in disc(cx - 0.4, 13.2, 2.4):
            g.px(*p, CYAN[1])
        g.px(int(cx) - 2, 11, CYAN[3])
        g.px(int(cx) - 1, 11, CYAN[2])
        g.px(int(cx) - 2, 12, CYAN[2])
    hinge = box(10, 8, 13, 12)
    shade(g, hinge, STEEL, base=2, lit=3, dark=1)
    for p in box(9, 5, 14, 7):
        g.px(*p, STEEL[1])
    for x in range(10, 14):
        g.px(x, 5, STEEL[3])
    return finish(g)


def reroll():
    g = Grid(24, 24)
    # a die in 3/4 view: top face lit, front face mid, side face shaded
    top = poly([(4.0, 8.0), (12.0, 4.0), (20.0, 8.0), (12.0, 12.0)])
    left = poly([(4.0, 8.0), (12.0, 12.0), (12.0, 21.0), (4.0, 17.0)])
    right = poly([(12.0, 12.0), (20.0, 8.0), (20.0, 17.0), (12.0, 21.0)])
    for p in top:
        g.px(*p, PAPER[3])
    for p in left:
        g.px(*p, PAPER[2])
    for p in right:
        g.px(*p, PAPER[1])
    for (x, y) in ((11, 7), (12, 7), (7, 12), (9, 15), (15, 11), (17, 13), (15, 15), (17, 17)):
        g.px(x, y, INK)
    for y in range(12, 21):
        g.px(12, y, PAPER[0])
    finish(g)
    # a green turn-arrow circling the top-right corner
    pts = [(12 + math.cos(a) * 9.6, 12 + math.sin(a) * 9.6) for a in [math.radians(-80 + i * 6) for i in range(15)]]
    am = poly(stroke_poly(pts, 2.2))
    for p in am:
        g.px(*p, GREEN[3])
    a1 = math.radians(-80 + 14 * 6)
    arrowhead(g, (12 + math.cos(a1 + 0.42) * 9.6, 12 + math.sin(a1 + 0.42) * 9.6), (-math.sin(a1), math.cos(a1)), 3.0, GREEN[3])
    arrows = {(x, y) for y in range(24) for x in range(24) if g.get(x, y) == GREEN[3]}
    for (x, y) in arrows:
        if (x - 1, y) not in arrows and (x, y - 1) not in arrows:
            g.px(x, y, GREEN[4])
    for (x, y) in arrows:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if g.get(x + dx, y + dy) is None:
                g.px(x + dx, y + dy, INK)
    return g


def archivist():
    """A stack of three data cartridges (isometric), each with a coloured label, the research diamond above."""
    g = Grid(24, 24)
    labels = [GREEN[3], CYAN[2], AMBER[3]]
    for i, y0 in enumerate((16, 12, 8)):            # bottom first
        top = poly([(2.0, y0 + 0.0), (11.0, y0 - 4.0), (21.0, y0 + 0.5), (12.0, y0 + 4.5)])
        left = poly([(2.0, y0 + 0.0), (12.0, y0 + 4.5), (12.0, y0 + 8.0), (2.0, y0 + 3.5)])
        right = poly([(12.0, y0 + 4.5), (21.0, y0 + 0.5), (21.0, y0 + 4.0), (12.0, y0 + 8.0)])
        for p in left:
            g.px(*p, STEEL[2])
        for p in right:
            g.px(*p, STEEL[1])
        for p in top:
            g.px(*p, STEEL[4] if i == 2 else STEEL[3])
        for (x, y) in top:                           # lit back edges of the top face
            if (x, y - 1) not in top and x < 12:
                g.px(x, y, STEEL[5] if i == 2 else STEEL[4])
        # label on the left face, LED on the right face
        for x in range(4, 10):
            yy = int(y0 + 2.4 + (x - 2) * 0.45)
            g.px(x, yy, labels[i])
            g.px(x, yy + 1, labels[i])
        g.px(18, int(y0 + 3.5), labels[i])
        # ink seam under each cartridge
        for x in range(2, 22):
            yb = max([y for (xx, y) in (left | right) if xx == x] or [-1])
            if yb >= 0:
                g.px(x, yb + 1, INK)
    finish(g)
    gem = poly([(17.5, 0.5), (22.0, 5.0), (17.5, 9.5), (13.0, 5.0)])
    for p in gem:
        g.px(*p, AMBER[3])
    for p in poly([(17.5, 2.5), (20.0, 5.0), (17.5, 7.5), (15.0, 5.0)]):
        g.px(*p, AMBER[4])
    g.px(16, 4, "#ffffff")
    for (x, y) in gem:
        if (x + 1, y) not in gem and (x, y + 1) not in gem:
            g.px(x, y, AMBER[1])
    for (x, y) in gem:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if g.get(x + dx, y + dy) is None or (x + dx, y + dy) not in gem and g.get(x + dx, y + dy) not in (AMBER[1], AMBER[3], AMBER[4], "#ffffff"):
                if (x + dx, y + dy) not in gem:
                    g.px(x + dx, y + dy, INK)
    return g


def sap_cannon():
    g = Grid(24, 24)
    # squat wooden base, metal barrel angled up-right, a glob of green sap in flight
    base = poly([(3.0, 21.0), (5.0, 15.0), (14.0, 15.0), (16.0, 21.0)])
    shade(g, base, WOOD, base=1, lit=2, dark=0)
    barrel = poly(stroke_poly([(8.0, 16.0), (15.0, 9.0)], 6.0))
    shade(g, barrel, STEEL, base=2, lit=3, dark=1)
    mouth = disc(15.2, 8.8, 3.2)
    for p in mouth:
        g.px(*p, STEEL[1])
    for p in disc(15.6, 8.4, 1.8):
        g.px(*p, GREEN[1])
    blob = disc(19.5, 4.5, 3.0)
    shade(g, blob, ["#265c42", "#3e8948", "#63c74d", "#99e550"], base=2, lit=3, dark=1)
    g.px(18, 3, "#ffffff")
    return finish(g)


def lure_totem():
    g = Grid(24, 24)
    pole = box(10, 6, 13, 21)
    shade(g, pole, WOOD, base=2, lit=3, dark=1)
    head = poly([(6.0, 5.0), (18.0, 5.0), (16.0, 12.0), (8.0, 12.0)])
    shade(g, head, WOOD, base=1, lit=2, dark=0)
    for (x, y) in ((9, 7), (14, 7)):          # carved eyes glowing amber
        g.px(x, y, AMBER[4])
        g.px(x + 1, y, AMBER[3])
    for x in range(10, 14):
        g.px(x, 10, WOOD[0])
    lamp = disc(12, 2.6, 2.4)
    for p in lamp:
        g.px(*p, AMBER[3])
    g.px(11, 1, "#ffffff")
    for x in (7, 16):                          # feathers
        for y in range(13, 17):
            g.px(x + (1 if x < 12 else -1) * (y - 13) // 2, y, RED[1])
    foot = box(7, 20, 16, 21)
    shade(g, foot, STEEL, base=1, lit=2, dark=0)
    return finish(g)


def bramble_wall():
    g = Grid(24, 24)
    # a woven bramble barrier with magenta thorns
    for k, (y0, y1) in enumerate(((18.0, 8.0), (8.0, 18.0), (13.0, 11.0))):
        pts = [(1.5 + i * 1.05, y0 + (y1 - y0) * (i / 20) + math.sin(i * 0.9 + k) * 1.4) for i in range(21)]
        m = poly(stroke_poly(pts, 2.6))
        shade(g, m, ["#3e2731", "#68386c", "#b55088", "#f6757a"], base=1, lit=2, dark=0)
    for (x, y, dx, dy) in ((4, 9, -1, -1), (9, 6, 0, -1), (15, 7, 1, -1), (20, 10, 1, -1), (6, 19, -1, 1), (13, 18, 0, 1),
                           (18, 19, 1, 1), (11, 12, 0, -1)):
        g.px(x + dx, y + dy, PURPLE[3])
        g.px(x + 2 * dx, y + 2 * dy, "#ffffff")
    return finish(g)


def beacon():
    """Relay pylon: a lattice mast on a concrete foot, a cyan beacon lamp on top sending signal arcs."""
    g = Grid(24, 24)
    foot = poly([(6.0, 23.0), (8.0, 19.5), (16.0, 19.5), (18.0, 23.0)])
    shade(g, foot, ["#3a4466", "#5a6988", "#8b9bb4", "#c0cbdc"], base=1, lit=2, dark=0)
    # tapering lattice mast: two rails + cross braces
    for y in range(8, 20):
        t = (y - 8) / 11
        xl = int(round(11 - 3.0 * t))
        xr = int(round(12 + 3.0 * t))
        g.px(xl, y, STEEL[3])
        g.px(xr, y, STEEL[1])
        if xr - xl > 1:
            xm = xl + 1 + (y % (xr - xl - 1 if xr - xl > 2 else 1))
            if xm < xr:
                g.px(xm, y, STEEL[2])
    # junction box
    for p in box(13, 14, 15, 16):
        g.px(*p, AMBER[2])
    g.px(13, 14, AMBER[4])
    # lamp housing + light
    for p in box(10, 6, 13, 7):
        g.px(*p, STEEL[2])
    lamp = disc(11.9, 4.0, 2.4)
    for p in lamp:
        g.px(*p, CYAN[2])
    g.px(11, 3, CYAN[3])
    g.px(11, 2, "#ffffff")
    finish(g)
    # signal arcs either side (outside the outline, no ink: they are light)
    for r, c in ((5.2, CYAN[2]), (8.0, CYAN[1])):
        for k in range(-5, 6):
            a = math.radians(k * 9)
            for sgn in (-1, 1):
                x = int(round(11.9 + sgn * r * math.cos(a)))
                y = int(round(4.0 + r * math.sin(a)))
                if 0 <= x < 24 and 0 <= y < 24 and g.get(x, y) is None:
                    g.px(x, y, c)
    return g


# ---- districts
def d_market():
    g = Grid(24, 24)
    # stall counter + posts + torn striped awning, vines creeping over
    for p in box(3, 9, 4, 21) | box(19, 9, 20, 21):
        g.px(*p, WOOD[1])
    counter = box(2, 15, 21, 20)
    shade(g, counter, WOOD, base=2, lit=3, dark=1)
    for x in range(4, 20, 3):
        g.px(x, 17, WOOD[1])
    for (x, y, c) in ((6, 14, RED[1]), (7, 14, RED[1]), (11, 14, AMBER[3]), (12, 14, AMBER[3]), (16, 14, GREEN[3]), (17, 14, GREEN[3])):
        g.px(x, y, c)                           # produce on the counter
        g.px(x, y - 1, c)
    aw = poly([(1.0, 4.0), (23.0, 4.0), (21.0, 10.0), (3.0, 10.0)])
    for (x, y) in aw:
        g.px(x, y, AMBER[3] if (x // 3) % 2 == 0 else PAPER[2])
    for x in range(3, 21):
        if x % 3 != 1:
            g.px(x, 10, AMBER[1] if (x // 3) % 2 == 0 else PAPER[1])
    for p in ((15, 9), (16, 10), (16, 9), (17, 10)):   # tear
        g.px(*p, None)
    for (x, y) in ((2, 5), (3, 6), (4, 7), (4, 8), (5, 9), (20, 6), (21, 7), (20, 8)):
        g.px(x, y, GREEN[2])
    g.px(3, 5, GREEN[3])
    g.px(21, 6, GREEN[3])
    return finish(g)


def d_flooded():
    g = Grid(24, 24)
    # a transit car front, half sunk
    car = poly([(4.0, 3.0), (20.0, 3.0), (21.0, 6.0), (21.0, 18.0), (3.0, 18.0), (3.0, 6.0)])
    shade(g, car, STEEL, base=2, lit=3, dark=1)
    win = box(6, 6, 17, 10)
    for p in win:
        g.px(*p, CYAN[0])
    for x in range(6, 18):
        g.px(x, 6, CYAN[1])
    g.px(7, 7, CYAN[2])
    for x in range(4, 21):
        g.px(x, 12, AMBER[3] if x not in (12,) else STEEL[1])   # livery stripe
    g.px(6, 14, AMBER[4])
    g.px(17, 14, AMBER[4])
    # water line
    water = box(0, 16, 23, 22)
    for (x, y) in water:
        g.px(x, y, BLUE[0] if y > 17 else BLUE[1])
    for x in range(1, 23, 4):
        g.px(x, 16, CYAN[2])
        g.px(x + 1, 16, CYAN[2])
    for x in range(3, 21, 5):
        g.px(x, 19, BLUE[1])
    return finish(g)


def d_greenhouse():
    g = Grid(24, 24)
    # iron-framed glass arch with a big leaf plant inside
    arch = {(x, y) for y in range(24) for x in range(24) if ((x + 0.5 - 12) / 10.0) ** 2 + ((y + 0.5 - 13) / 10.0) ** 2 <= 1 and y <= 20}
    for p in arch:
        g.px(*p, "#2a6a6a")
    for (x, y) in arch:
        if (x + y) % 7 == 0 and y < 12:
            g.px(x, y, "#7fd4c8")
    plant = disc(12, 15, 4.5) | poly([(12.0, 9.0), (16.0, 12.0), (12.0, 15.0)]) | poly([(12.0, 10.0), (7.0, 12.0), (11.0, 15.0)])
    shade(g, plant, GREEN, base=3, lit=4, dark=2)
    for y in range(15, 21):
        g.px(12, y, WOOD[1])
    for (x, y) in arch:                        # iron ribs
        if (x, y - 1) not in arch or (x - 1, y) not in arch or (x + 1, y) not in arch:
            g.px(x, y, STEEL[1])
    for y in range(4, 21):
        g.px(12, y, STEEL[1], only={"#2a6a6a", "#7fd4c8"})
    for x in range(3, 22):
        g.px(x, 12, STEEL[1], only={"#2a6a6a", "#7fd4c8"})
    base_ = box(1, 20, 22, 21)
    shade(g, base_, STEEL, base=2, lit=3, dark=1)
    return finish(g)


def d_residential():
    g = Grid(24, 24)
    # apartment block with a collapsed top corner, windows, a balcony
    bld = poly([(3.0, 6.0), (11.0, 3.0), (14.0, 7.0), (17.0, 5.0), (21.0, 9.0), (21.0, 22.0), (3.0, 22.0)])
    shade(g, bld, ["#3e2731", "#733e39", "#b86f50", "#c28569"], base=2, lit=3, dark=1)
    for (x0, y0) in ((5, 9), (10, 9), (15, 11), (5, 14), (10, 14), (15, 15), (5, 18), (15, 19)):
        for p in box(x0, y0, x0 + 2, y0 + 2):
            g.px(*p, "#262b44")
        g.px(x0, y0, AMBER[3] if (x0 + y0) % 3 == 0 else "#3a4466")
    for p in box(9, 19, 13, 21):              # door
        g.px(*p, WOOD[0])
    for x in range(9, 15):                      # balcony rail
        g.px(x, 13, STEEL[3])
    for (x, y) in ((4, 7), (5, 7), (19, 10), (20, 11), (21, 12)):
        g.px(x, y, GREEN[3])
    return finish(g)


def d_datacenter():
    g = Grid(24, 24)
    # two server racks with blinking LEDs, cables pooling at the foot
    for x0 in (3, 13):
        rack = box(x0, 3, x0 + 8, 21)
        shade(g, rack, STEEL, base=1, lit=2, dark=0)
        for i, y in enumerate(range(5, 20, 3)):
            for x in range(x0 + 1, x0 + 8):
                g.px(x, y, STEEL[0])
                g.px(x, y + 1, STEEL[2] if x < x0 + 6 else STEEL[1])
            g.px(x0 + 6, y + 1, ("#63c74d", "#2ce8f5", "#feae34", "#63c74d", "#e43b44")[(i + x0) % 5])
    for (x, y) in ((8, 22), (9, 22), (10, 21), (11, 22), (12, 22), (13, 21)):
        g.px(x, y, "#124e89")
    return finish(g)


def lock():
    """7x9 padlock sized like a text glyph (badges): shown at the font's texel scale next to the label."""
    rows = ["..KKK..",
            ".KsshK.",
            ".Ks.SK.",
            "KKKKKKK",
            "KAAAadK",
            "KAakadK",
            "KaakadK",
            "KdddddK",
            "KKKKKKK"]
    leg = {"K": INK, "s": STEEL[4], "h": STEEL[5], "S": STEEL[3], "A": AMBER[4], "a": AMBER[3], "d": AMBER[1], "k": INK}
    g = Grid(7, 9)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != ".":
                g.px(x, y, leg[ch])
    return g


# ---- Relay Protocols (the night ability buttons): each shows its area of effect as a ring on the ground
def protocol_snare():
    """Vine Snare: a ring of thorny vine on the ground, three roots whipping up out of it and hooking inward."""
    g = Grid(24, 24)
    cx, cy, rx, ry = 12.0, 17.0, 9.6, 4.2
    ring_m = {(x, y) for y in range(24) for x in range(24)
              if 0.5 < ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0}
    back = {(x, y) for (x, y) in ring_m if y + 0.5 < cy}
    for (x, y) in back:
        g.px(x, y, GREEN[1])
    # three roots rising from the back of the ring, tapering, hooking inward (gaps between them)
    for pts in ([(5.5, 15.0), (4.5, 10.0), (5.5, 6.5), (8.0, 5.0), (9.0, 6.5)],
                [(18.5, 15.0), (19.5, 10.0), (18.5, 6.5), (16.0, 5.0), (15.0, 6.5)],
                [(12.0, 13.5), (12.0, 8.0), (12.5, 4.0), (11.5, 2.0)]):
        m = poly(stroke_poly(pts, 2.6, 1.0))
        shade(g, m, GREEN, base=2, lit=3, dark=1)
    for (x, y) in ring_m - back:                           # front of the ring: lit top, dark underside
        below = (x, y + 1) in ring_m
        above = (x, y - 1) in ring_m
        g.px(x, y, GREEN[3] if not above else GREEN[2] if below else GREEN[1])
    for (x, y) in ((3, 19), (8, 21), (15, 21), (20, 19), (22, 16), (2, 16)):   # thorns on the ring
        g.px(x, y + 1 if y < 21 else y, PAPER[2])
    for (x, y) in ((9, 7), (15, 7), (11, 1)):            # pink buds at the tips
        g.px(x, y, PURPLE[3])
        g.px(x, y + 1 if y < 2 else y - 1, PURPLE[2])
    g.px(5, 11, PAPER[2])                                 # barbs
    g.px(19, 11, PAPER[2])
    return finish(g)


def _dash_ellipse(g, cx, cy, rx, ry, c, on=3, off=2):
    n = int((rx + ry) * 3.4)
    for i in range(n):
        if i % (on + off) >= on:
            continue
        a = i / n * 2 * math.pi
        x, y = int(round(cx + math.cos(a) * rx - 0.5)), int(round(cy + math.sin(a) * ry - 0.5))
        if 0 <= x < 24 and 0 <= y < 24 and g.get(x, y) is None:
            g.px(x, y, c)


def protocol_arc():
    """Arc Discharge: a bolt striking the middle of a targeting ring on the ground."""
    g = Grid(24, 24)
    _dash_ellipse(g, 12.0, 18.0, 10.0, 4.2, CYAN[1])
    for (x, y) in ((2, 18), (3, 18), (21, 18), (20, 18), (12, 13), (12, 22)):   # reticle ticks
        g.px(x, y, CYAN[2])
    bolt = [(16.5, 0.5), (11.5, 7.0), (14.5, 8.0), (10.0, 14.0), (12.5, 14.5), (11.5, 17.5)]
    m = poly(stroke_poly(bolt, 3.4, 2.2))
    for q in m:
        g.px(*q, CYAN[2])
    for a_, b_ in zip(bolt[:-1], bolt[1:-1] + [(11.5, 16.0)]):
        g.line(a_[0], a_[1], b_[0], b_[1], CYAN[3])
    for (x, y) in ((8, 9), (7, 10), (6, 10)):            # a small side fork
        g.px(x, y, CYAN[2])
    for (x, y) in ((10, 17), (11, 17), (12, 17), (11, 16)):   # impact flash + rays
        g.px(x, y, CYAN[3])
    for (x, y) in ((8, 16), (14, 16), (7, 18), (15, 18), (9, 19), (13, 19)):
        g.px(x, y, CYAN[2])
    return finish(g)


def protocol_flare():
    """Flare: a parachute flare hanging over the field, lighting a ring of ground below it."""
    g = Grid(24, 24)
    _dash_ellipse(g, 12.0, 18.5, 10.0, 4.0, AMBER[3])
    for (x, y) in ((8, 18), (15, 17), (12, 20), (6, 17), (17, 19)):   # glints on the lit ground
        g.px(x, y, AMBER[2])
    # light falling from the flare to the ring's edge
    for a_, b_ in (((10.0, 13.0), (5.0, 17.0)), ((14.0, 13.0), (19.0, 17.0))):
        for t in range(0, 6, 2):
            x = a_[0] + (b_[0] - a_[0]) * t / 6
            y = a_[1] + (b_[1] - a_[1]) * t / 6
            g.px(x, y, AMBER[2])
    # parachute: a three-panel dome, shroud lines to the flare
    dome = {(x, y) for y in range(24) for x in range(24)
            if ((x + 0.5 - 12) / 6.4) ** 2 + ((y + 0.5 - 5.0) / 4.0) ** 2 <= 1 and y + 0.5 <= 5.0}
    for (x, y) in dome:
        g.px(x, y, PAPER[2] if (x - 6) // 4 % 2 == 0 else PAPER[1])
        if (x, y - 1) not in dome:
            g.px(x, y, PAPER[3] if x < 13 else PAPER[2])
    for x in range(6, 19):
        if (x, 4) in dome:
            g.px(x, 4, PAPER[0])
    for a_, b_ in (((6.5, 5.0), (11.0, 9.5)), ((17.5, 5.0), (13.0, 9.5)), ((12.0, 5.0), (12.0, 8.5))):
        g.line(a_[0], a_[1], b_[0], b_[1], STEEL[3])
    # the burning flare: white core, amber halo, cross glint
    for q in disc(12.0, 11.5, 2.9):
        g.px(*q, AMBER[3])
    for q in disc(12.0, 11.5, 2.0):
        g.px(*q, AMBER[4])
    for q in disc(11.7, 11.2, 1.1):
        g.px(*q, "#ffffff")
    for k in (3, 4, 5):
        for (x, y) in ((12 - k, 11), (12 + k - 1, 11)):
            g.px(x, y, AMBER[4] if k == 3 else AMBER[3])
    for (x, y) in ((9, 9), (14, 9), (9, 14), (14, 14)):
        g.px(x, y, AMBER[3])
    return finish(g)


ICONS = {
    "icon_parang": parang, "icon_wide_choice": wide_choice, "icon_scarf": scarf, "icon_arc": arc,
    "icon_salvage": salvage, "icon_flare": flare, "icon_map": mapicon, "icon_swap": swap, "icon_notes": notes,
    "icon_scout": scout, "icon_reroll": reroll, "icon_archivist": archivist, "icon_sap_cannon": sap_cannon,
    "icon_lure_totem": lure_totem, "icon_bramble_wall": bramble_wall, "icon_beacon": beacon,
    "icon_district_overgrown_market": d_market, "icon_district_flooded_transit": d_flooded,
    "icon_district_canopy_greenhouse": d_greenhouse, "icon_district_collapsed_residential": d_residential,
    "icon_district_data_center": d_datacenter, "icon_lock": lock,
    "icon_protocol_snare": protocol_snare, "icon_protocol_arc": protocol_arc, "icon_protocol_flare": protocol_flare,
}

if __name__ == "__main__":
    only = sys.argv[1:] or None
    items = []
    for k, fn in ICONS.items():
        if only and k not in only:
            continue
        g = fn()
        im = g.image()
        save_sprite(k, im)
        iso = g.isolated()
        print(f"{k}: {g.w}x{g.h} colours={len(g.colors())} isolated={len(iso)}")
        items.append((k.replace("icon_", "").replace("district_", "d_"), im))
    board(items, 6, bg=(38, 34, 56), cols=7).save(SCRATCH / "icons_x6.png")
    board(items, 2, bg=(38, 34, 56), cols=11).save(SCRATCH / "icons_x2.png")
