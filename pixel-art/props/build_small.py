"""Small props + pickups: fuse, data_log, nest, pick_scrap, pick_circuits, pick_biofiber,
pick_intel, pick_med.

Pickups are 12x12 icons colour-coded to the resource colours in src/data/config.js
(Scrap #c0cbdc, Circuits #2ce8f5, Biofiber #63c74d, Intel #feae34, med kit red/white).
Frame 2 adds a glint so loot twinkles on the floor.
Run: python pixel-art/props/build_small.py [keys...]
"""
from common import *  # noqa: F401,F403


def glint(s, x, y, arm=WHITE):
    """4-point sparkle centred at (x, y)."""
    s.px(x, y, WHITE)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        s.px(x + dx, y + dy, arm)


# ================================================================ fuse 12x16
def draw_fuse(s, f):
    hot = f == 1
    # top cap y1..3, glass y4..11, bottom cap y12..14 ; x3..8
    for (y0, y1) in ((1, 3), (12, 14)):
        s.rect(3, y0, 8, y1, STEEL2)
        v(s, 3, y0, y1, STEEL3)
        v(s, 4, y0, y1, STEEL3)
        v(s, 8, y0, y1, STEEL0)
        v(s, 7, y0, y1, STEEL1)
    h(s, 4, 7, 1, STEEL3)
    s.px(3, 1, None)
    s.px(8, 1, None)
    h(s, 3, 8, 3, STEEL1)                     # cap rims
    h(s, 3, 8, 12, STEEL1)
    h(s, 4, 7, 14, STEEL0)
    s.px(3, 14, STEEL1)
    s.px(8, 14, INK)
    # contact blades
    s.rect(5, 0 + 1, 6, 1, STEEL3)
    # glass body
    s.rect(3, 4, 8, 11, ORANGE)
    v(s, 3, 4, 11, AMBER)
    v(s, 8, 4, 11, RUST0)
    v(s, 7, 4, 11, ORANGE)
    s.rect(4, 4, 6, 11, AMBER)
    # filament zig-zag
    fil = YELLOW if not hot else WHITE
    pts(s, fil, [(5, 4), (5, 5), (6, 6), (5, 7), (5, 8), (6, 9), (5, 10), (5, 11)])
    if hot:
        pts(s, YELLOW, [(4, 5), (4, 6), (6, 7), (4, 9), (6, 10), (6, 5)])
        v(s, 7, 5, 10, AMBER)
    s.px(4, 4, WHITE)                         # glass glint
    s.px(4, 5, BONE if not hot else YELLOW)
    # glow motes (pulse)
    if hot:
        glint(s, 9, 3, arm=YELLOW)


# ================================================================ data_log 14x10
def draw_data_log(s, f):
    hot = f == 1
    # top face y1..4, front y5..8 ; x1..12
    s.rect(1, 1, 12, 4, STEEL0)
    h(s, 2, 11, 1, STEEL1)
    v(s, 1, 1, 4, STEEL1)
    h(s, 1, 12, 4, STEEL1)                    # front edge of the top catches light
    s.rect(1, 5, 12, 8, INK)
    h(s, 1, 12, 5, STEEL0)
    v(s, 12, 5, 8, OUT)
    # glowing data strip on top
    h(s, 3, 9, 2, BLUE if not hot else CYAN)
    h(s, 3, 9, 3, CYAN if not hot else WHITE)
    h(s, 4, 8, 3, CYAN) if not hot else h(s, 4, 6, 2, WHITE)
    # connector on the right end
    s.rect(10, 6, 12, 7, STEEL2)
    pts(s, STEEL3, [(10, 6), (12, 6)])
    pts(s, INK, [(11, 7)])
    # status led on the front
    s.px(3, 6, AMBER if not hot else YELLOW)
    s.px(4, 6, ORANGE if not hot else AMBER)
    pts(s, STEEL1, [(6, 7), (7, 7)])          # grip ridges
    if hot:
        glint(s, 2, 1)
    h(s, 1, 12, 8, OUT)


# ================================================================ nest 40x36
def bez(p0, p1, p2, n=40):
    out = []
    for i in range(n + 1):
        u = i / n
        x = (1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0]
        y = (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]
        q = (round(x), round(y))
        if not out or out[-1] != q:
            out.append(q)
    return out


def draw_nest(s, f):
    p = f  # 0 rest, 1 swell
    # roots fanning out along the ground
    for path in (bez((8, 31), (4, 32), (1, 34)), bez((31, 31), (35, 32), (38, 34)),
                 bez((12, 33), (8, 34), (5, 34)), bez((27, 33), (31, 34), (34, 34))):
        for (x, y) in path:
            s.px(x, y, WOOD0)
            s.px(x, y - 1, WOOD1, only="empty")
    # mound body (swells 1px on the pulse frame)
    s.ellipse(4 - p, 11 - p, 35 + p, 37, UMBER)
    s.ellipse(3 - p, 10 - p, 32 + p, 35, PLUM, only="opaque")    # crescent of shadow bottom-right
    for y in range(35, 36):
        h(s, 0, 39, y, None)
    s.ellipse(5, 12 - p, 25, 28, MAUVE, only="opaque")
    s.ellipse(8, 14 - p, 15, 19, PINK, only=MAUVE)
    s.ellipse(10, 15 - p, 13, 17, MAUVE, only=PINK)          # break the pink into a rim
    # shadowed underside following the curve
    for x in range(0, 40):
        col = [y for y in range(36) if s.get(x, y)]
        if col:
            yb = max(col)
            for k, c in ((0, OUT), (1, UMBER), (2, UMBER), (3, PLUM)):
                if yb - k >= 0 and s.get(x, yb - k):
                    s.px(x, yb - k, c)
    # veins
    for path in (bez((12, 30), (10, 24), (14, 19)), bez((30, 28), (32, 22), (27, 17))):
        for (x, y) in path:
            s.px(x, y, CRIMSON, only="opaque")
    # bark tendrils arching over the mound, thorned
    thorns = []
    for (a, c, b2) in (((6, 33), (10, 10 - p), (24, 14 - p)), ((33, 33), (31, 12 - p), (17, 13 - p)),
                       ((15, 34), (18, 22 - p), (35, 22))):
        path = bez(a, c, b2)
        for i, (x, y) in enumerate(path):
            s.px(x, y, WOOD0, only="opaque")
            s.px(x, y - 1, WOOD1, only="opaque")
            if i % 7 == 3:
                thorns.append((x, y - 2))
    for (x, y) in thorns:
        s.px(x, y, BONE, only="opaque")
    # glowing slit openings
    def hole(cx, cy, w):
        h(s, cx - w - 1, cx + w + 1, cy - 1, UMBER)
        h(s, cx - w - 1, cx + w + 1, cy, OUT)
        h(s, cx - w, cx + w, cy + 1, UMBER)
        if p == 0:
            h(s, cx - w + 1, cx + w - 1, cy, RED)
            s.px(cx, cy, HOTRED)
        else:
            h(s, cx - w, cx + w, cy, HOTRED)
            s.px(cx, cy, PINK)
            h(s, cx - w + 1, cx + w - 1, cy - 1, CRIMSON)
    hole(13, 25, 2)
    hole(26, 23, 2)
    hole(20, 30, 1)
    # egg pods on top (pulse: grow 1px and glow)
    for (cx, cy, r) in ((13, 12, 3), (22, 9, 4), (30, 14, 3)):
        r2 = r + p
        cy2 = cy - p
        s.circle(cx, cy2, r2, PLUM, fill=True)
        s.circle(cx - (1 if r2 > 2 else 0), cy2 - 1, r2 - 1, MAUVE, fill=True, only=PLUM)
        s.px(cx - 1, cy2 - r2 + 1, PINK)
        s.px(cx - 2, cy2 - r2 + 2, PINK) if r2 >= 4 else None
        s.px(cx + 1, cy2 + 1, CRIMSON if p == 0 else RED)
        s.px(cx, cy2 + 1, RED if p == 0 else HOTRED)
        if p == 1:
            s.px(cx - 1, cy2 - r2 + 1, WHITE)
    # thorns jutting from the silhouette
    for (x, y, dx, dy) in ((4, 20, -1, -1), (2, 27, -1, 0), (35, 19, 1, -1), (37, 27, 1, 0),
                           (8, 14, -1, -1), (35, 12, 1, -1)):
        s.px(x, y, WOOD1)
        s.px(x + dx, y + dy, BONE)
    # slime sheen
    pts(s, PINK, [(7, 20), (7, 21)])


# ================================================================ pickups 12x12
def draw_scrap(s, f):
    # 8-tooth cog, lit top-left, bore in the middle
    bitmap(s, 1, 1, [
        "....HH....",
        ".HH.HH.MM.",
        ".HHHHHMMM.",
        "..HHMMMMD.",
        "HHHMkkMMDD",
        "HHHMkSMDDD",
        "..HMMMMDD.",
        ".MMMMMDDD.",
        ".MM.DD.DD.",
        "....DD....",
    ], {"H": STEEL3, "M": STEEL2, "D": STEEL1, "k": INK, "S": STEEL1})
    pts(s, WHITE, [(3, 3)])
    pts(s, STEEL0, [(8, 9), (9, 8)])
    if f == 1:
        glint(s, 3, 3)


def draw_circuits(s, f):
    # chip: top face x2..9 y2..7, front y8..9 ; pins left/right + bottom
    s.rect(2, 2, 9, 7, NAVY)
    h(s, 2, 9, 2, BLUE)
    v(s, 2, 2, 7, BLUE)
    s.rect(2, 8, 9, 9, INK)
    h(s, 2, 9, 8, STEEL0)
    for y in (3, 5, 7):
        s.px(1, y, CYAN)
        s.px(10, y, BLUE)
    for x in (3, 5, 7, 9):
        s.px(x, 10, CYAN if x < 6 else BLUE)
    # die glyph on top
    s.rect(4, 4, 7, 6, CYAN)
    s.rect(5, 5, 6, 5, WHITE)
    pts(s, BLUE, [(7, 6), (7, 5)])
    pts(s, CYAN, [(3, 3)])
    if f == 1:
        glint(s, 4, 3)


def draw_biofiber(s, f):
    # a tied sheaf of plant fibre: stems gathered and bound with twine at the waist, three
    # strands fanning out above (left / centre / right) with gaps between them, cut stem
    # ends splayed below. Lit edges on the left of each strand (top-left light).
    rows = [
        "............",
        ".c....c...c.",
        ".cb..cb..cb.",
        "..cb.cb.cba.",
        "..cbacbacb..",
        "...cbcbab...",
        "..wttttTT...",
        "...cbcba....",
        "...cbcba....",
        "..cbcbaba...",
        "..c.b.a.a...",
        "............",
    ]
    bitmap(s, 0, 0, rows, {"a": MOSS0, "b": MOSS1, "c": MOSS2, "t": WOOD3, "T": WOOD1, "w": BONE})
    if f == 1:
        glint(s, 9, 2)


def draw_intel(s, f):
    # floppy data disk: x1..10 y1..10
    s.rect(1, 1, 10, 10, AMBER)
    h(s, 1, 10, 1, YELLOW)
    v(s, 1, 1, 10, YELLOW)
    v(s, 10, 2, 10, ORANGE)
    h(s, 2, 10, 10, RUST0)
    s.px(10, 1, None)                          # clipped write-protect corner
    s.px(9, 1, ORANGE)
    # metal shutter
    s.rect(3, 1, 7, 3, STEEL3)
    v(s, 7, 1, 3, STEEL1)
    h(s, 4, 6, 2, STEEL0)
    s.px(5, 2, INK)
    # label
    s.rect(3, 5, 8, 9, BONE)
    h(s, 3, 8, 5, WHITE)
    pts(s, WOOD2, [(4, 7), (5, 7), (6, 7), (4, 8), (5, 8)])
    v(s, 8, 6, 9, WOOD3)
    if f == 1:
        glint(s, 2, 3, arm=YELLOW)


def draw_med(s, f):
    # handle y1..2
    h(s, 4, 7, 1, STEEL2)
    pts(s, STEEL2, [(3, 2), (8, 2)])
    pts(s, STEEL3, [(4, 1)])
    # top face y3..4, front y5..10 ; x1..10
    s.rect(1, 3, 10, 4, WHITE)
    h(s, 1, 10, 4, STEEL3)
    s.rect(1, 5, 10, 10, STEEL3)
    v(s, 1, 5, 10, WHITE)
    v(s, 10, 3, 10, STEEL2)
    h(s, 1, 10, 10, STEEL2)
    h(s, 2, 9, 5, WHITE)
    # red cross
    s.rect(5, 5, 6, 9, RED)
    s.rect(3, 6, 8, 8, RED)
    pts(s, CRIMSON, [(6, 9), (8, 8), (6, 8)])
    pts(s, PINK, [(5, 5), (3, 6)])
    # latch strip at the lid seam
    h(s, 2, 9, 4, STEEL2)
    s.px(5, 4, CRIMSON)
    s.px(6, 4, CRIMSON)
    if f == 1:
        glint(s, 2, 3, arm=STEEL3)


SPECS = {
    "fuse": (12, 16, 2, draw_fuse, [260, 260]),
    "data_log": (14, 10, 2, draw_data_log, [300, 300]),
    "nest": (40, 36, 2, draw_nest, [420, 420]),
    "pick_scrap": (12, 12, 2, draw_scrap, [700, 160]),
    "pick_circuits": (12, 12, 2, draw_circuits, [700, 160]),
    "pick_biofiber": (12, 12, 2, draw_biofiber, [700, 160]),
    "pick_intel": (12, 12, 2, draw_intel, [700, 160]),
    "pick_med": (12, 12, 2, draw_med, [700, 160]),
}

if __name__ == "__main__":
    import sys as _s
    only = set(_s.argv[1:])
    for key, (w, hh, n, fn, durs) in SPECS.items():
        if only and key not in only:
            continue
        s = new(w, hh)
        frames(s, n, fn, durs)
        export(s, key, scale=8 if w > 16 else 12)
