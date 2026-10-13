"""Objective / interactable machines: intel_terminal, power_box, terminal, pump, surge_box,
cell_cache, locked_cache, workbench.

Objective props show a status lamp that is RED in `off` and GREEN in `on`, plus a second,
shape-level change (fuse installed, cell raised, lid open, arcs, water...) so the state
reads without relying on hue alone.
Run: python pixel-art/props/build_objectives.py [keys...]
"""
from common import *  # noqa: F401,F403


def lamp(s, x, y, on, dim=False):
    """4x4 dome status lamp, top-left of the dome at (x, y)."""
    if on:
        rim, core, hot = MOSS1, MOSS2, WHITE
    else:
        rim, core, hot = CRIMSON, RED, PINK
    if dim:
        rim, core, hot = (MOSS0, MOSS1, MOSS2) if on else (UMBER, CRIMSON, RED)
    bitmap(s, x, y, [
        ".rr.",
        "rhcr",
        "rccr",
        "kkkk",
    ], {"r": rim, "c": core, "h": hot, "k": INK})


def glow_ring(s, x0, y0, x1, y1, c, only):
    """Paint c onto `only`-coloured pixels on the border of a box (light spill on a surface)."""
    for x in range(x0, x1 + 1):
        s.px(x, y0, c, only=only)
        s.px(x, y1, c, only=only)
    for y in range(y0, y1 + 1):
        s.px(x0, y, c, only=only)
        s.px(x1, y, c, only=only)


# ================================================================ intel_terminal 24x36
def draw_intel_terminal(s, f):
    # CRT case (yellowed plastic) x2..21 y1..17
    s.rect(2, 2, 21, 17, WOOD2)
    s.rect(3, 1, 20, 3, BONE)                 # top face of the case
    h(s, 3, 20, 3, WOOD3)
    h(s, 4, 14, 1, WHITE)
    v(s, 2, 2, 17, WOOD3)
    v(s, 21, 2, 17, WOOD1)
    v(s, 20, 4, 17, WOOD1)
    h(s, 2, 21, 17, WOOD0)
    # bezel + screen x5..18 y5..15 (rounded corners)
    s.rect(4, 5, 19, 16, WOOD1)
    h(s, 4, 19, 5, WOOD0)
    v(s, 4, 5, 16, WOOD0)
    s.rect(5, 6, 18, 15, WOOD0)
    pts(s, WOOD1, [(5, 6), (18, 6), (5, 15), (18, 15)])
    # amber text (two frames: lines shift, cursor blinks)
    lines = [(7, 7, 14), (7, 9, 11), (7, 11, 16), (7, 13, 10)] if f == 0 else \
            [(7, 7, 11), (7, 9, 16), (7, 11, 10), (7, 13, 13)]
    for x0, y, x1 in lines:
        h(s, x0, x1, y, AMBER)
    pts(s, ORANGE, [(13, 9), (9, 11), (15, 7)] if f == 0 else [(10, 7), (12, 11), (14, 9)])
    if f == 0:
        s.rect(12, 13, 13, 14, YELLOW)        # cursor block
    else:
        h(s, 14, 15, 13, ORANGE)
    h(s, 6, 17, 6, RUST0)                     # glass curvature, darker top
    pts(s, BONE, [(6, 7), (6, 8)])            # glass glint
    s.px(7, 6, WHITE)
    # power led + vents on the case
    s.px(18, 16, AMBER if f == 0 else ORANGE)
    pts(s, WOOD0, [(6, 2), (8, 2), (10, 2)])
    # ---- keyboard ledge y18..21 (lit top face, amber spill)
    s.rect(1, 18, 22, 21, STEEL2)
    h(s, 1, 22, 18, STEEL3)
    h(s, 1, 22, 21, STEEL0)
    v(s, 22, 18, 21, STEEL1)
    for y in (19, 20):
        for x in range(3, 20, 2):
            s.px(x + (y % 2), y, STEEL1)
    pts(s, WOOD3, [(8, 19), (10, 19), (12, 19), (14, 19)])   # screen glow on the keys
    # ---- pedestal cabinet x4..19 y22..33
    s.rect(4, 22, 19, 33, STEEL1)
    v(s, 4, 22, 33, STEEL2)
    v(s, 18, 22, 33, STEEL0)
    v(s, 19, 22, 33, INK)
    h(s, 4, 19, 22, INK)                      # shadow under the ledge
    for y in (25, 27, 29):
        h(s, 7, 15, y, STEEL0)
        h(s, 7, 15, y + 1, STEEL2)
    # base foot
    s.rect(2, 33, 21, 34, STEEL0)
    h(s, 2, 21, 33, STEEL1)
    h(s, 3, 20, 34, INK)
    # cable from the case down the right side
    v(s, 21, 12, 17, INK)
    pts(s, INK, [(21, 22), (20, 23), (20, 24), (20, 25), (20, 26)])
    pts(s, STEEL0, [(21, 21)])
    # rust & moss creeping up the pedestal
    pts(s, RUST0, [(17, 31), (16, 32), (17, 32), (6, 23)])
    moss(s, 4, 26, 8, 34, seed=11, density=0.45)
    pts(s, MOSS1, [(2, 34), (3, 34), (4, 34), (5, 33), (2, 33)])
    pts(s, MOSS2, [(3, 33), (4, 31)])
    pts(s, MOSS1, [(19, 1), (20, 1), (20, 2)])  # leaf litter on top
    s.px(19, 1, MOSS2)


# ================================================================ power_box 28x40
def draw_power_box(s, f):
    on = f == 1
    # concrete footing y35..38
    s.rect(1, 35, 26, 38, STEEL2)
    h(s, 1, 26, 35, STEEL3)
    h(s, 1, 26, 37, STEEL1)
    h(s, 1, 26, 38, STEEL0)
    pts(s, STEEL1, [(6, 36), (7, 36), (19, 36), (23, 36)])
    # cabinet top face y5..8, front y9..34 (x2..25)
    s.rect(2, 5, 25, 8, STEEL2)
    h(s, 3, 24, 5, STEEL3)
    v(s, 2, 5, 8, STEEL3)
    h(s, 2, 25, 8, STEEL3)                    # front lip
    s.rect(2, 9, 25, 34, STEEL1)
    v(s, 2, 9, 34, STEEL2)
    v(s, 25, 9, 34, STEEL0)
    v(s, 24, 10, 34, STEEL0, only=STEEL1)
    # door x4..17 y11..30
    s.rect(4, 11, 17, 30, STEEL1)
    h(s, 4, 17, 11, STEEL0)                   # recess shadow top
    v(s, 4, 11, 30, STEEL0)
    h(s, 5, 17, 30, STEEL2)
    v(s, 17, 12, 30, STEEL2)
    # vent slats on the door
    for y in (13, 15):
        h(s, 7, 14, y, INK)
        h(s, 7, 14, y + 1, STEEL2)
    # lightning stencil
    bitmap(s, 9, 18, [
        "..YY",
        ".YY.",
        "YYYY",
        "..Y.",
        ".Y..",
    ], {"Y": YELLOW})
    # hinges + handle
    pts(s, STEEL3, [(5, 13), (5, 27)])
    pts(s, INK, [(5, 14), (5, 28)])
    v(s, 15, 19, 23, STEEL3)
    v(s, 16, 20, 23, INK)
    # fuse socket panel x19..23 y11..24
    s.rect(19, 11, 23, 24, STEEL0)
    h(s, 19, 23, 11, INK)
    s.rect(20, 13, 22, 22, OUT)
    pts(s, STEEL2, [(20, 12), (22, 12), (20, 23), (22, 23)])   # clip contacts
    h(s, 19, 23, 24, STEEL2)
    if on:
        # amber fuse seated in the socket, glow spilling onto the panel
        s.rect(20, 13, 22, 22, ORANGE)
        s.rect(21, 14, 21, 21, YELLOW)
        h(s, 20, 22, 13, STEEL2)
        h(s, 20, 22, 22, STEEL2)
        s.px(21, 15, WHITE)
        pts(s, RUST0, [(19, 14), (19, 17), (19, 20), (23, 15), (23, 18), (23, 21)])
    else:
        pts(s, STEEL0, [(21, 16), (21, 19)])   # empty, dark
    # hazard band y31..33 (yellow/ink diagonals)
    for x in range(2, 26):
        for y in range(31, 34):
            s.px(x, y, YELLOW if ((x + y) // 2) % 2 == 0 else INK)
    h(s, 2, 25, 31, AMBER, only=YELLOW)
    h(s, 2, 25, 34, OUT)
    # status lamp on the top face + cage
    s.rect(11, 1, 16, 1, STEEL2)
    bitmap(s, 11, 1, [
        "kkkkkk",
        "krhcrk",
        "kcccck",
        "krccrk",
        "kkkkkk",
    ], {"k": STEEL0, "r": (MOSS1 if on else CRIMSON), "c": (MOSS2 if on else RED),
        "h": (WHITE if on else PINK)})
    h(s, 11, 16, 1, STEEL2)
    pts(s, STEEL2, [(11, 2), (11, 3)])
    # cable out of the side into the ground
    pts(s, INK, [(26, 26), (26, 27), (26, 28), (26, 29), (26, 30), (26, 31), (26, 32), (26, 33), (26, 34)])
    pts(s, STEEL0, [(25, 26)])
    # rust and grime
    pts(s, RUST0, [(3, 27), (3, 28), (3, 29), (3, 30), (21, 26), (21, 27), (21, 28), (20, 29), (21, 29),
                   (22, 29), (8, 10), (9, 10)])
    pts(s, WOOD0, [(3, 30), (21, 30), (22, 30)])
    pts(s, RUST1, [(20, 28)])
    # warning plate on the lid
    s.rect(4, 6, 7, 7, BONE)
    s.px(5, 6, CRIMSON)
    s.px(6, 7, CRIMSON)
    # moss at the footing
    moss(s, 1, 33, 9, 38, seed=21, density=0.4)
    pts(s, MOSS1, [(1, 35), (1, 36), (2, 35), (25, 37), (26, 37), (26, 36)])
    pts(s, MOSS2, [(2, 34), (1, 35), (26, 36)])


# ================================================================ terminal 32x40
def draw_terminal(s, f):
    on = f >= 2
    blink = f % 2
    # antenna mast x26 y1..8
    v(s, 26, 1, 8, STEEL2)
    v(s, 27, 2, 8, STEEL0)
    h(s, 24, 28, 3, STEEL1)
    h(s, 25, 27, 5, STEEL1)
    s.px(26, 1, (MOSS2 if on else RED) if not blink else (MOSS1 if on else CRIMSON))
    # hood x2..29 y7..24 : top face y7..9
    s.rect(3, 7, 28, 9, STEEL2)
    h(s, 3, 28, 7, STEEL3)
    h(s, 2, 29, 9, STEEL3)
    s.rect(2, 10, 29, 24, STEEL1)
    v(s, 2, 9, 24, STEEL2)
    v(s, 29, 9, 24, STEEL0)
    v(s, 28, 10, 24, STEEL0, only=STEEL1)
    # screen bezel x4..27 y11..23, glass x5..26 y12..22
    s.rect(4, 11, 27, 23, INK)
    h(s, 4, 27, 23, STEEL2)
    v(s, 27, 11, 23, STEEL2)
    bg, mid, lit, hot = (MOSS0, MOSS1, MOSS2, WHITE) if on else (CRIMSON, RED, PINK, WHITE)
    s.rect(5, 12, 26, 22, bg)
    h(s, 5, 26, 12, TEAL if on else UMBER)    # top of glass shaded
    if not on:
        # header bar + warning triangle + error lines
        h(s, 6, 14, 14, mid)
        h(s, 6, 11, 16, mid)
        h(s, 6, 13, 18, mid)
        h(s, 6, 9, 20, mid)
        tri = lit if blink == 0 else mid
        bitmap(s, 17, 13, [
            "...t...",
            "..ttt..",
            "..tkt..",
            ".ttktt.",
            ".ttktt.",
            "ttttttt",
            "tttkttt",
            "ttttttt",
        ], {"t": tri, "k": bg})
        if blink == 0:
            pts(s, hot, [(20, 13)])
    else:
        # download: arrow icon + progress bar + text
        h(s, 6, 15, 14, mid)
        h(s, 6, 12, 16, mid)
        ay = 12 + blink
        bitmap(s, 19, ay, [
            "..l..",
            "..l..",
            "..l..",
            "lllll",
            ".lll.",
            "..l..",
        ], {"l": lit})
        pts(s, mid, [(19, 18), (23, 18)])
        h(s, 20, 22, 18, mid)
        s.rect(6, 19, 24, 21, mid)
        s.rect(7, 20, 23, 20, bg)
        fill = 13 if blink == 0 else 19
        h(s, 7, 7 + fill, 20, lit)
        s.px(7 + fill, 20, hot)
    pts(s, STEEL2 if not on else STEEL3, [(6, 13)])   # glass glint
    s.px(7, 13, WHITE)
    # status lamp on the hood top face
    lamp(s, 5, 6, on, dim=bool(blink) and not on)
    # ---- keyboard desk y25..29 (lit top face, wider)
    s.rect(1, 25, 30, 29, STEEL2)
    h(s, 1, 30, 25, STEEL3)
    h(s, 1, 30, 29, STEEL0)
    v(s, 30, 25, 29, STEEL1)
    h(s, 2, 29, 24, INK)                      # shadow under the hood
    for y in (26, 27, 28):
        for x in range(4, 27, 2):
            s.px(x + (y % 2), y, STEEL1)
    pts(s, (MOSS2 if on else RED), [(26, 27)])
    pts(s, (MOSS1 if on else CRIMSON), [(26, 26), (27, 27)])
    pts(s, lit, [(10, 26), (12, 26), (14, 26), (16, 26)])   # screen light on the keys
    # ---- lower cabinet x3..28 y30..37
    s.rect(3, 30, 28, 37, STEEL1)
    h(s, 3, 28, 30, INK)
    v(s, 3, 31, 37, STEEL2)
    v(s, 28, 30, 37, STEEL0)
    v(s, 27, 31, 37, STEEL0, only=STEEL1)
    for y in (32, 34):
        h(s, 6, 13, y, INK)
        h(s, 6, 13, y + 1, STEEL2)
    # blinking LED strip on the cabinet
    leds = [(17, 32), (19, 32), (21, 32), (23, 32)]
    for i, (x, y) in enumerate(leds):
        if on:
            c = MOSS2 if (i + blink) % 2 == 0 else MOSS0
        else:
            c = RED if (i == 0 and blink == 0) else CRIMSON
        s.px(x, y, c)
    s.rect(17, 34, 24, 35, STEEL0)
    h(s, 17, 24, 35, STEEL2)
    # feet + cable bundle
    h(s, 3, 28, 38, INK)
    pts(s, STEEL0, [(4, 38), (27, 38)])
    pts(s, OUT, [(1, 33), (1, 34), (2, 34), (1, 35), (1, 36), (1, 37), (1, 38), (2, 38)])
    pts(s, NAVY, [(2, 35), (2, 36), (2, 37)])
    # wear + moss
    pts(s, RUST0, [(28, 33), (28, 34), (27, 36), (4, 36), (25, 11)])
    pts(s, WOOD0, [(28, 35), (5, 37)])
    moss(s, 3, 34, 10, 38, seed=33, density=0.35)
    pts(s, MOSS1, [(3, 7), (4, 7), (3, 8)])
    s.px(4, 7, MOSS2)


# ================================================================ pump 28x36
def draw_pump(s, f):
    on = f >= 1
    ph = f % 2 if on else 0
    # concrete plinth: top face y29..30, front y31..34
    s.rect(1, 29, 26, 34, STEEL1)
    s.rect(1, 29, 26, 30, STEEL2)
    h(s, 1, 26, 29, STEEL3)
    h(s, 1, 26, 34, STEEL0)
    v(s, 26, 29, 34, STEEL0)
    pts(s, STEEL0, [(5, 32), (6, 33), (17, 32), (18, 32)])
    pts(s, STEEL2, [(9, 32), (21, 33)])
    # intake pipe down the left into the plinth
    s.rect(2, 17, 4, 29, WOOD1)
    v(s, 2, 17, 29, WOOD3)
    v(s, 4, 17, 29, WOOD0)
    s.rect(2, 16, 6, 18, WOOD1)
    h(s, 2, 6, 16, WOOD3)
    h(s, 3, 6, 18, WOOD0)
    pts(s, STEEL2, [(2, 22), (3, 22), (4, 22)])
    # cylinder body x6..19 y8..28
    s.rect(6, 9, 19, 28, STEEL1)
    v(s, 7, 9, 28, STEEL2)
    v(s, 8, 9, 28, STEEL3)
    v(s, 9, 9, 28, STEEL2)
    v(s, 17, 9, 28, STEEL0)
    v(s, 18, 9, 28, STEEL0)
    v(s, 19, 9, 28, INK)
    v(s, 6, 9, 28, STEEL1)
    # dome cap y4..8
    h(s, 9, 16, 4, STEEL2)
    h(s, 8, 17, 5, STEEL2)
    h(s, 7, 18, 6, STEEL1)
    h(s, 6, 19, 7, STEEL1)
    h(s, 6, 19, 8, INK)
    pts(s, STEEL3, [(10, 4), (11, 4), (9, 5), (10, 5), (8, 6), (9, 6), (8, 7)])
    pts(s, STEEL0, [(16, 5), (17, 6), (18, 7), (17, 7)])
    # rivet bands
    for y in (12, 25):
        h(s, 6, 19, y, STEEL0)
        for x in (7, 10, 13, 16):
            s.px(x, y, STEEL3 if x < 12 else STEEL2)
    # lamp on top
    lamp(s, 11, 1, on, dim=False)
    # gauge (dial) x7..11 y13..17
    bitmap(s, 7, 13, [
        ".kkk.",
        "kBBBk",
        "kBBBk",
        "kBBBk",
        ".kkk.",
    ], {"k": INK, "B": BONE})
    if on:
        pts(s, CRIMSON, [(9, 15), (10, 14)] if ph == 0 else [(9, 15), (10, 15)])
    else:
        pts(s, CRIMSON, [(9, 15), (8, 16)])
    # valve wheel centred (14, 19), r=4
    cx, cy = 13, 20
    for (x, y) in [(cx - 1, cy - 4), (cx, cy - 4), (cx + 1, cy - 4), (cx - 3, cy - 3), (cx - 2, cy - 3),
                   (cx + 2, cy - 3), (cx + 3, cy - 3), (cx - 4, cy - 2), (cx - 4, cy - 1), (cx - 4, cy),
                   (cx - 4, cy + 1), (cx - 4, cy + 2), (cx + 4, cy - 2), (cx + 4, cy - 1), (cx + 4, cy),
                   (cx + 4, cy + 1), (cx + 4, cy + 2), (cx - 3, cy + 3), (cx - 2, cy + 3), (cx + 2, cy + 3),
                   (cx + 3, cy + 3), (cx - 1, cy + 4), (cx, cy + 4), (cx + 1, cy + 4)]:
        lit_side = (x - cx) + (y - cy) < 0
        s.px(x, y, RUST1 if lit_side else RUST0)
    pts(s, WOOD3, [(cx - 1, cy - 4), (cx - 3, cy - 3), (cx - 4, cy - 2)])
    pts(s, WOOD0, [(cx + 3, cy + 3), (cx + 1, cy + 4), (cx + 4, cy + 2)])
    if ph == 0:
        spokes = [(cx, cy - 3), (cx, cy - 2), (cx, cy - 1), (cx, cy + 1), (cx, cy + 2), (cx, cy + 3),
                  (cx - 3, cy), (cx - 2, cy), (cx - 1, cy), (cx + 1, cy), (cx + 2, cy), (cx + 3, cy)]
    else:
        spokes = [(cx - 2, cy - 2), (cx - 1, cy - 1), (cx + 1, cy + 1), (cx + 2, cy + 2),
                  (cx + 2, cy - 2), (cx + 1, cy - 1), (cx - 1, cy + 1), (cx - 2, cy + 2),
                  (cx - 3, cy - 3), (cx + 3, cy + 3)]
    pts(s, RUST0, spokes)
    s.px(cx, cy, STEEL3)
    s.px(cx + 1, cy + 1, INK) if ph == 0 else None
    # outlet pipe to the right with a down-spout x20..25
    s.rect(19, 15, 24, 18, WOOD1)
    h(s, 19, 24, 15, WOOD3)
    h(s, 19, 24, 18, WOOD0)
    s.rect(22, 15, 25, 22, WOOD1)
    v(s, 22, 16, 22, WOOD2)
    v(s, 25, 15, 22, WOOD0)
    h(s, 22, 25, 15, WOOD3)
    h(s, 21, 26, 21, STEEL2)                  # flange
    h(s, 21, 26, 22, STEEL0)
    pts(s, STEEL3, [(21, 21)])
    pts(s, STEEL2, [(19, 14), (19, 19)])
    if on:
        # water pouring from the spout onto the plinth, with splash
        if ph == 0:
            col = [(23, 23), (24, 23), (23, 24), (24, 24), (23, 25), (24, 25), (23, 26), (24, 26),
                   (23, 27), (24, 27), (23, 28), (24, 28)]
            pts(s, BLUE, col)
            pts(s, CYAN, [(23, 23), (23, 25), (24, 27)])
            pts(s, WHITE, [(23, 24)])
            pts(s, CYAN, [(21, 28), (26, 28), (22, 27)])
        else:
            col = [(23, 23), (24, 23), (23, 24), (24, 24), (23, 25), (24, 25), (23, 26), (24, 26),
                   (23, 27), (24, 27), (23, 28), (24, 28)]
            pts(s, BLUE, col)
            pts(s, CYAN, [(24, 24), (23, 26), (23, 28)])
            pts(s, WHITE, [(24, 26)])
            pts(s, CYAN, [(20, 27), (26, 27), (21, 28)])
        # puddle on the plinth top
        h(s, 18, 26, 29, BLUE)
        h(s, 19, 25, 30, NAVY)
        pts(s, CYAN, [(20, 29), (22, 29) if ph == 0 else (25, 29), (24, 30) if ph == 0 else (21, 30)])
    else:
        pts(s, NAVY, [(23, 23)])
        pts(s, STEEL1, [(23, 29), (24, 29)])  # dry stain
    # rust streaks + moss
    pts(s, RUST0, [(14, 9), (14, 10), (14, 11), (11, 26), (11, 27), (16, 22), (16, 23)])
    pts(s, WOOD0, [(14, 11), (11, 27)])
    moss(s, 1, 27, 9, 34, seed=41, density=0.4)
    pts(s, MOSS1, [(1, 29), (1, 30), (1, 31), (2, 29)])
    pts(s, MOSS2, [(1, 30)])


# ================================================================ surge_box 28x44
INSUL_X = (5, 13, 21)


def insulator(s, cx, top, base):
    """Ceramic insulator stack centred on cx: steel terminal cap, 3 skirts, steel flange."""
    # neck (behind the skirts)
    v(s, cx, top + 2, base, WOOD3)
    v(s, cx + 1, top + 2, base, WOOD2)
    # skirts every 3 rows: wide lit top, shaded underside
    for y in range(top + 3, base - 1, 3):
        h(s, cx - 1, cx + 2, y - 1, WOOD3)
        h(s, cx - 2, cx + 3, y, BONE)
        h(s, cx - 2, cx + 3, y + 1, WOOD1)
        h(s, cx - 1, cx + 2, y + 1, WOOD2)
        s.px(cx - 1, y - 1, BONE)
        s.px(cx - 2, y, WHITE)
        s.px(cx + 3, y, WOOD2)
    # terminal cap
    s.rect(cx, top, cx + 1, top + 2, STEEL2)
    s.px(cx, top, STEEL3)
    s.px(cx + 1, top + 2, STEEL0)
    # flange on the box lid
    h(s, cx - 1, cx + 2, base + 1, STEEL1)
    h(s, cx - 1, cx + 2, base, STEEL3)


def draw_surge_box(s, f):
    on = f >= 2
    ph = f % 2
    # concrete plinth y39..42
    s.rect(1, 39, 26, 42, STEEL2)
    h(s, 1, 26, 39, STEEL3)
    h(s, 1, 26, 41, STEEL1)
    h(s, 1, 26, 42, STEEL0)
    # box: top face y14..17, front y18..38 (x2..25)
    s.rect(2, 14, 25, 17, STEEL2)
    h(s, 3, 24, 14, STEEL3)
    v(s, 2, 14, 17, STEEL3)
    h(s, 2, 25, 17, STEEL3)
    v(s, 25, 14, 17, STEEL1)
    s.rect(2, 18, 25, 38, STEEL1)
    v(s, 2, 18, 38, STEEL2)
    v(s, 25, 18, 38, STEEL0)
    v(s, 24, 19, 38, STEEL0, only=STEEL1)
    # hazard stripe bands top and bottom of the front
    for (y0, y1) in ((19, 20), (35, 37)):
        for x in range(2, 26):
            for y in range(y0, y1 + 1):
                s.px(x, y, YELLOW if ((x - y) // 2) % 2 == 0 else INK)
    h(s, 2, 25, 21, STEEL0)
    h(s, 2, 25, 38, OUT)
    # warning sign: yellow triangle + lightning bolt, x5..15 y23..32
    bitmap(s, 5, 23, [
        ".....A.....",
        "....AYA....",
        "....YYY....",
        "...YYYkY...",
        "...YYkYY...",
        "..YYkkkYY..",
        "..YYYkYYY..",
        ".YYYkYYYYY.",
        ".YYYYYYYYY.",
        "AAAAAAAAAAA",
    ], {"A": AMBER, "Y": YELLOW, "k": OUT})
    # vent grille + bolts
    for y in (24, 26, 28, 30):
        h(s, 18, 22, y, INK)
        h(s, 18, 22, y + 1, STEEL2)
    pts(s, STEEL3, [(3, 22), (3, 33), (23, 33)])
    pts(s, INK, [(4, 23), (4, 34), (24, 34)])
    # status lamp on the front, right of the sign
    lamp(s, 18, 32, on, dim=bool(ph) and not on)
    # insulators on the lid
    for cx in INSUL_X:
        insulator(s, cx, 2, 14)
    # feed cable from the left terminal, sagging out to the left edge
    pts(s, INK, [(4, 3), (3, 4), (2, 5), (2, 6), (1, 7), (1, 8), (1, 9), (1, 10), (1, 11), (1, 12), (1, 13)])
    if on:
        # arcs jumping terminal to terminal
        if ph == 0:
            arc = [(7, 2), (8, 1), (9, 2), (10, 3), (11, 2), (12, 2),
                   (15, 3), (16, 2), (17, 1), (18, 2), (19, 1), (20, 2)]
            core = [(9, 2), (17, 1)]
            sparks = [(10, 1), (23, 1), (3, 1)]
        else:
            arc = [(7, 3), (8, 2), (9, 1), (10, 1), (11, 2), (12, 3),
                   (15, 2), (16, 3), (17, 2), (18, 1), (19, 2), (20, 3)]
            core = [(10, 1), (18, 1)]
            sparks = [(14, 1), (24, 3), (4, 1)]
        pts(s, CYAN, arc)
        pts(s, WHITE, core)
        pts(s, BLUE, sparks)
        for cx in INSUL_X:
            s.px(cx, 2, WHITE)
            s.px(cx + 1, 2, CYAN)
            s.px(cx + 1, 3, BLUE)
        pts(s, WHITE, [(10, 28)])          # sign flares
    # wear & moss
    pts(s, RUST0, [(3, 28), (3, 29), (3, 30), (23, 22), (22, 22)])
    pts(s, WOOD0, [(3, 31)])
    moss(s, 1, 37, 10, 42, seed=51, density=0.4)
    pts(s, MOSS1, [(1, 39), (1, 40), (2, 39), (26, 41), (25, 41)])
    pts(s, MOSS2, [(1, 39)])


# ================================================================ cell_cache 32x32
def draw_cell_cache(s, f):
    on = f == 1
    # armoured box: top face y10..17, front y18..30 (x1..30)
    s.rect(2, 10, 29, 17, STEEL2)
    h(s, 3, 28, 10, STEEL3)
    v(s, 2, 10, 17, STEEL3)
    h(s, 2, 29, 17, STEEL3)
    v(s, 29, 10, 17, STEEL1)
    s.rect(1, 18, 30, 30, STEEL1)
    v(s, 1, 18, 30, STEEL2)
    v(s, 30, 18, 30, STEEL0)
    v(s, 29, 19, 30, STEEL0)
    h(s, 1, 30, 30, INK)
    # front: hazard chevrons band y19..21
    for x in range(2, 29):
        for y in range(19, 22):
            s.px(x, y, YELLOW if ((x + y) // 2) % 2 == 0 else INK)
    h(s, 2, 28, 22, STEEL0)
    # bolted armour plates on the front
    for (x0, x1) in ((3, 12), (19, 28)):
        s.rect(x0, 23, x1, 29, STEEL1)
        h(s, x0, x1, 23, STEEL2)
        v(s, x0, 23, 29, STEEL2)
        h(s, x0, x1, 29, STEEL0)
        v(s, x1, 23, 29, STEEL0)
        for (bx, by) in ((x0 + 1, 24), (x1 - 1, 24), (x0 + 1, 28), (x1 - 1, 28)):
            s.px(bx, by, STEEL3)
    # side carry handles
    pts(s, STEEL3, [(0 + 1, 20), (0 + 1, 21)])
    # central lamp + cell icon stencil
    s.rect(14, 23, 17, 29, STEEL0)
    lamp(s, 14, 24, on)
    pts(s, CYAN if on else BLUE, [(15, 28), (16, 28)])
    if not on:
        # closed sliding plates on top with a slit window showing the dim cell
        v(s, 15, 11, 16, STEEL0)
        v(s, 16, 11, 16, STEEL3)
        for (bx, by) in ((4, 12), (4, 15), (27, 12), (27, 15), (13, 12), (18, 12)):
            s.px(bx, by, STEEL3)
            s.px(bx + 1, by + 1, STEEL0)
        s.rect(7, 13, 11, 14, INK)            # viewing slit
        h(s, 8, 10, 13, NAVY)
        h(s, 8, 10, 14, BLUE)
        # clamps locking the lid
        for cx in (6, 24):
            s.rect(cx, 16, cx + 2, 18, STEEL0)
            h(s, cx, cx + 2, 16, STEEL3)
            s.px(cx + 1, 17, INK)
    else:
        # plates slid apart to the sides (stacked), dark well with the raised glowing cell
        s.rect(3, 11, 7, 16, STEEL3)
        s.rect(24, 11, 28, 16, STEEL2)
        v(s, 7, 11, 16, STEEL1)
        v(s, 28, 11, 16, STEEL1)
        h(s, 3, 7, 16, STEEL1)
        h(s, 24, 28, 16, STEEL1)
        s.rect(8, 11, 23, 16, OUT)
        h(s, 8, 23, 16, INK)
        h(s, 9, 22, 11, NAVY)                 # glow on the well rim
        pts(s, BLUE, [(8, 12), (23, 12), (8, 13), (23, 13)])
        # cell cylinder x12..19 y2..14
        s.rect(12, 5, 19, 13, BLUE)
        s.rect(13, 5, 18, 13, CYAN)
        v(s, 14, 5, 13, WHITE)
        v(s, 18, 5, 13, BLUE)
        for y in (7, 11):
            h(s, 12, 19, y, NAVY)
            h(s, 13, 18, y, BLUE)
        s.px(14, 7, CYAN)
        s.px(14, 11, CYAN)
        # caps
        s.rect(12, 2, 19, 4, STEEL2)
        h(s, 13, 18, 2, STEEL3)
        h(s, 12, 19, 4, STEEL0)
        s.rect(14, 1, 17, 1, STEEL1)
        s.px(14, 1, STEEL3)
        s.rect(12, 14, 19, 15, STEEL1)
        h(s, 12, 19, 14, STEEL2)
        pts(s, CYAN, [(10, 4), (21, 6), (9, 9), (22, 3)])  # spark motes
        # clamps open (swung outward)
        for cx in (4, 27):
            s.rect(cx, 17, cx + 1, 19, STEEL0)
            s.px(cx, 17, STEEL3)
    # dents / scorch / moss
    pts(s, STEEL0, [(9, 26), (10, 27), (22, 25)])
    pts(s, RUST0, [(3, 29), (28, 27), (28, 28), (20, 29)])
    moss(s, 1, 27, 6, 30, seed=61, density=0.45)
    pts(s, MOSS1, [(1, 29), (2, 30), (1, 30), (3, 30)])
    pts(s, MOSS2, [(1, 28)])


# ================================================================ locked_cache 32x26
def chain(s, a, b):
    (x0, y0), (x1, y1) = a, b
    n = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(n + 1):
        x = x0 + round((x1 - x0) * i / n)
        y = y0 + round((y1 - y0) * i / n)
        s.px(x, y, STEEL3 if i % 2 == 0 else STEEL1)
        if i % 2 == 0:
            s.px(x, y + 1, INK)


def draw_locked_cache(s, f):
    on = f == 1
    # front body y13..23 (x1..30), base y24
    s.rect(1, 13, 30, 23, PLUM)
    v(s, 1, 13, 23, MAUVE)
    v(s, 30, 13, 23, UMBER)
    v(s, 29, 14, 23, UMBER, only=PLUM)
    h(s, 1, 30, 23, UMBER)
    h(s, 2, 29, 24, INK)
    pts(s, STEEL1, [(2, 24), (3, 24), (28, 24), (29, 24)])
    # vertical plank ribs on the body
    for x in (8, 16, 23):
        v(s, x, 15, 22, UMBER)
        v(s, x + 1, 15, 22, MAUVE, only=PLUM)
    if not on:
        # closed lid: top face y3..9, lid band y10..12
        s.rect(2, 3, 29, 9, MAUVE)
        h(s, 3, 18, 3, PINK)
        v(s, 2, 3, 6, PINK)
        v(s, 29, 3, 9, PLUM)
        v(s, 28, 4, 9, PLUM)
        h(s, 2, 29, 6, PLUM)                  # lid plank seams
        h(s, 2, 29, 7, MAUVE)
        pts(s, PLUM, [(6, 4), (7, 4), (8, 4), (20, 5), (21, 5), (12, 8), (13, 8), (14, 8), (24, 8)])
        h(s, 2, 29, 9, PINK)
        h(s, 22, 29, 9, MAUVE)
        s.rect(1, 10, 30, 12, PLUM)
        h(s, 1, 30, 10, MAUVE)
        h(s, 1, 30, 13, INK)                  # seam
        v(s, 30, 10, 12, UMBER)
        # steel corners
        for (x, y) in ((1, 10), (28, 10), (1, 21), (28, 21)):
            s.rect(x, y, x + 2, y + 2, STEEL1)
            s.px(x, y, STEEL3)
            s.px(x + 1, y + 1, STEEL2)
        pts(s, STEEL2, [(2, 3), (3, 3), (2, 4), (28, 3), (29, 3), (29, 4)])
        # chains crossing to the padlock
        chain(s, (3, 11), (14, 16))
        chain(s, (28, 11), (17, 16))
        chain(s, (3, 20), (13, 18))
        chain(s, (28, 20), (18, 18))
        # padlock: shackle + body with red keypad
        bitmap(s, 13, 13, [
            ".kssk.",
            ".s..s.",
            "SSSSSS",
            "SrrRRS",
            "SRrRRS",
            "SSssSS",
            ".kkkk.",
        ], {"s": STEEL2, "k": STEEL0, "S": STEEL1, "r": RED, "R": CRIMSON})
        s.px(14, 16, PINK)
        h(s, 13, 18, 15, STEEL3)
    else:
        # lid swung open: underside y1..7, interior y8..12, front rim y13
        s.rect(2, 1, 29, 7, PLUM)
        h(s, 2, 29, 1, MAUVE)
        v(s, 2, 1, 7, MAUVE)
        v(s, 29, 1, 7, UMBER)
        h(s, 3, 28, 4, UMBER)                 # inner bracing
        h(s, 3, 28, 7, UMBER)
        pts(s, STEEL2, [(3, 2), (28, 2), (3, 6), (28, 6)])
        # interior with glowing loot
        s.rect(1, 8, 30, 12, OUT)
        v(s, 1, 8, 12, MAUVE)
        v(s, 30, 8, 12, PLUM)
        h(s, 2, 29, 8, INK)
        # loot: circuit chip (cyan), data disk (amber), fibre (green), gear (grey)
        bitmap(s, 5, 9, ["CC.", "CbC", ".CC"], {"C": CYAN, "b": BLUE})
        bitmap(s, 11, 9, ["AAy", "AYA", "AAA"], {"A": AMBER, "Y": YELLOW, "y": ORANGE})
        bitmap(s, 17, 9, [".g.G", "gGg.", ".gG."], {"g": MOSS1, "G": MOSS2})
        bitmap(s, 23, 9, [".s.", "sSs", ".s."], {"s": STEEL2, "S": STEEL3})
        pts(s, WHITE, [(6, 9), (12, 10)])
        pts(s, NAVY, [(4, 11), (9, 11)])
        # front rim
        h(s, 1, 30, 13, PINK)
        h(s, 1, 30, 14, MAUVE)
        for (x, y) in ((1, 21), (28, 21)):
            s.rect(x, y, x + 2, y + 2, STEEL1)
            s.px(x, y, STEEL3)
            s.px(x + 1, y + 1, STEEL2)
        # chains slack, hanging down the front
        chain(s, (3, 14), (3, 22))
        chain(s, (28, 14), (28, 22))
        # padlock hanging open, green
        bitmap(s, 14, 15, [
            "s...",
            "s..s",
            "SSSS",
            "SggS",
            "SGgS",
            "kkkk",
        ], {"s": STEEL2, "S": STEEL1, "g": MOSS2, "G": MOSS1, "k": STEEL0})
        s.px(15, 18, WHITE)
    # scuffs
    pts(s, UMBER, [(5, 17), (6, 17), (20, 20), (12, 21)])
    pts(s, STEEL1, [(10, 22), (26, 16)])


# ================================================================ workbench 40x32
def draw_workbench(s, _):
    # pegboard back x5..34 y1..11
    s.rect(5, 1, 34, 11, WOOD1)
    h(s, 5, 34, 1, WOOD2)
    v(s, 5, 1, 11, WOOD2)
    v(s, 34, 1, 11, WOOD0)
    for y in range(3, 11, 2):
        for x in range(7, 33, 2):
            s.px(x, y, WOOD0)
    # hanging tools: wrench
    pts(s, STEEL3, [(8, 2), (10, 2), (8, 3), (9, 3), (10, 3), (9, 4), (9, 5), (9, 6), (9, 7), (9, 8)])
    pts(s, STEEL2, [(10, 4), (10, 5), (10, 6), (10, 7), (10, 8), (8, 9), (9, 9), (10, 9)])
    pts(s, STEEL1, [(11, 9), (11, 8)])
    # hammer
    pts(s, STEEL2, [(13, 3), (14, 3), (15, 3), (16, 3), (13, 4), (14, 4), (15, 4), (16, 4)])
    pts(s, STEEL3, [(13, 3), (14, 3), (15, 3)])
    pts(s, WOOD3, [(14, 5), (14, 6), (14, 7), (14, 8), (14, 9)])
    pts(s, WOOD0, [(15, 5), (15, 6), (15, 7), (15, 8), (15, 9)])
    # hand saw
    for i in range(10):
        s.px(19 + i, 3 + i // 3, STEEL3)
        s.px(19 + i, 4 + i // 3, STEEL2)
        if i % 2 == 0:
            s.px(19 + i, 5 + i // 3, STEEL1)
    s.rect(28, 5, 30, 8, RUST0)
    pts(s, RUST1, [(28, 5), (29, 5)])
    pts(s, WOOD1, [(29, 7)])
    # coil of cable
    pts(s, INK, [(31, 3), (32, 3), (33, 4), (33, 5), (33, 6), (32, 7), (31, 7), (30, 6), (30, 5), (30, 4)])
    pts(s, NAVY, [(31, 4), (32, 6)])
    # vine creeping over the pegboard
    pts(s, MOSS1, [(31, 1), (32, 1), (33, 1), (34, 1), (34, 2), (34, 3), (33, 2), (34, 5), (34, 6), (33, 8),
                   (34, 7), (30, 1), (29, 1), (5, 9), (5, 10), (6, 10)])
    pts(s, MOSS2, [(32, 1), (34, 2), (33, 2), (34, 6), (29, 1), (5, 10)])
    pts(s, MOSS0, [(34, 4), (34, 8)])
    # tabletop: top face y12..18, x1..38
    s.rect(1, 12, 38, 18, WOOD3)
    h(s, 1, 38, 12, WOOD2)                    # shadow line from the pegboard
    h(s, 2, 30, 13, BONE)
    h(s, 1, 38, 15, WOOD2)                    # plank seam
    h(s, 1, 38, 18, BONE)                     # front edge catches light
    v(s, 38, 12, 18, WOOD2)
    pts(s, WOOD2, [(8, 14), (9, 14), (22, 17), (23, 17), (24, 17), (30, 14), (31, 14), (14, 16)])
    pts(s, WOOD1, [(18, 16), (19, 16), (19, 17), (18, 17), (17, 17)])   # oil stain
    # vice clamped on the left end
    s.rect(2, 10, 7, 14, STEEL1)
    h(s, 2, 7, 10, STEEL3)
    v(s, 2, 10, 14, STEEL2)
    s.rect(3, 11, 6, 12, STEEL2)
    h(s, 2, 7, 14, INK)
    v(s, 4, 15, 19, STEEL3)                   # screw handle
    pts(s, STEEL1, [(5, 15), (5, 16), (5, 17)])
    pts(s, STEEL3, [(3, 19), (4, 19), (5, 19)])
    # gear (scrap) and bolts on the table
    bitmap(s, 24, 13, [".g.g.", "ggGgg", ".GkG.", "ggggg", ".g.g."], {"g": STEEL2, "G": STEEL3, "k": INK})
    pts(s, STEEL3, [(12, 17), (14, 13), (33, 16)])
    pts(s, STEEL1, [(13, 17), (15, 13), (34, 16)])
    # oil can
    s.rect(31, 12, 34, 14, RUST0)
    h(s, 31, 34, 12, RUST1)
    pts(s, WOOD0, [(34, 13), (34, 14)])
    pts(s, STEEL2, [(32, 11), (33, 10)])
    pts(s, WOOD0, [(31, 15), (32, 15), (33, 15), (34, 15)])
    # rag
    pts(s, MOSS0, [(16, 13), (17, 13), (18, 13), (17, 14), (16, 14)])
    # table front apron y19..21 with drawer
    s.rect(1, 19, 38, 21, WOOD1)
    h(s, 1, 38, 21, WOOD0)
    v(s, 1, 19, 21, WOOD2)
    s.rect(15, 19, 24, 21, WOOD0)
    h(s, 16, 23, 19, WOOD1)
    h(s, 18, 21, 20, STEEL2)
    # legs y22..30
    for (x0, lit) in ((2, True), (35, False)):
        s.rect(x0, 22, x0 + 2, 30, WOOD1)
        v(s, x0, 22, 30, WOOD2 if lit else WOOD1)
        v(s, x0 + 2, 22, 30, WOOD0)
        h(s, x0, x0 + 2, 22, WOOD0)
    # lower shelf y26..27 with a bucket and a box
    s.rect(5, 26, 34, 27, WOOD1)
    h(s, 5, 34, 26, WOOD2)
    h(s, 5, 34, 27, WOOD0)
    s.rect(8, 22, 13, 25, STEEL1)             # bucket
    h(s, 8, 13, 22, STEEL3)
    h(s, 9, 12, 23, INK)
    v(s, 8, 23, 25, STEEL2)
    v(s, 13, 23, 25, STEEL0)
    s.rect(24, 23, 30, 25, WOOD2)             # small crate on the shelf
    h(s, 24, 30, 23, WOOD3)
    v(s, 27, 24, 25, WOOD0)
    v(s, 30, 23, 25, WOOD0)
    # under-shelf: nothing (floor shows through); feet
    h(s, 2, 4, 30, UMBER)
    h(s, 35, 37, 30, UMBER)
    # moss climbing the left leg, rust on the vice
    pts(s, MOSS1, [(2, 30), (3, 30), (2, 29), (2, 28), (3, 28), (2, 26), (4, 30), (1, 30)])
    pts(s, MOSS2, [(2, 28), (3, 30), (2, 25)])
    pts(s, MOSS1, [(36, 30), (37, 30)])
    pts(s, RUST0, [(6, 13), (3, 14)])


SPECS = {
    "intel_terminal": (24, 36, 2, draw_intel_terminal, [500, 500]),
    "power_box": (28, 40, 2, draw_power_box, None),
    "terminal": (32, 40, 4, draw_terminal, None),
    "pump": (28, 36, 3, draw_pump, None),
    "surge_box": (28, 44, 4, draw_surge_box, None),
    "cell_cache": (32, 32, 2, draw_cell_cache, None),
    "locked_cache": (32, 26, 2, draw_locked_cache, None),
    "workbench": (40, 32, 1, draw_workbench, None),
}

if __name__ == "__main__":
    import sys as _s
    only = set(_s.argv[1:])
    for key, (w, hh, n, fn, durs) in SPECS.items():
        if only and key not in only:
            continue
        s = new(w, hh)
        frames(s, n, fn, durs or [160] * n)
        export(s, key)
