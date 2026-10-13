"""Loot containers: crate, chest, cache, opened.

3/4 top-down: top face (lit) above, front face below. Light from top-left.
Run: python pixel-art/props/build_containers.py
"""
from common import *  # noqa: F401,F403


# ------------------------------------------------------------------ crate 24x24
def draw_crate(s, _):
    # body x1..22, y1..22 ; top face y1..7 ; front y8..22
    s.rect(1, 1, 22, 7, WOOD3)
    # lid planks (run left-right), gaps at y3 and y6
    h(s, 1, 22, 3, WOOD1)
    h(s, 1, 22, 6, WOOD1)
    h(s, 2, 15, 1, BONE)                      # lit back edge
    h(s, 1, 22, 7, BONE)                      # front lip of the lid catches light
    h(s, 18, 22, 7, WOOD3)
    # lid end-battens (vertical) at both ends
    s.rect(1, 1, 3, 7, WOOD3)
    v(s, 1, 1, 7, BONE)
    s.rect(20, 1, 22, 7, WOOD2)
    v(s, 22, 1, 7, WOOD1)
    v(s, 4, 1, 7, WOOD1)                      # batten shadow onto planks
    # grain on lid planks
    pts(s, WOOD2, [(7, 2), (8, 2), (12, 4), (13, 4), (14, 4), (9, 5), (16, 2), (17, 2), (6, 4), (15, 5)])
    pts(s, BONE, [(6, 1), (7, 1), (10, 4), (11, 4)])
    # nails on battens
    pts(s, STEEL2, [(2, 2), (2, 5), (21, 2), (21, 5)])
    # stencil "this side up" chevron on lid
    pts(s, WOOD1, [(10, 2), (11, 1), (12, 2)])
    # ---- front face
    s.rect(1, 8, 22, 22, WOOD1)
    # vertical panel planks with gaps
    for gx in (8, 12, 16):
        v(s, gx, 11, 19, WOOD0)
    pts(s, WOOD2, [(5, 13), (5, 14), (6, 17), (10, 15), (10, 16), (14, 13), (18, 17), (18, 18)])
    # cast shadows under the top rail and right of the left stile
    h(s, 4, 19, 11, WOOD0)
    v(s, 4, 11, 19, WOOD0)
    # frame boards (raised, lighter)
    s.rect(1, 8, 22, 10, WOOD2)
    h(s, 1, 22, 8, WOOD3)
    s.rect(1, 20, 22, 22, WOOD2)
    h(s, 1, 22, 20, WOOD3)
    s.rect(1, 8, 3, 22, WOOD2)
    v(s, 1, 8, 22, WOOD3)
    s.rect(20, 8, 22, 22, WOOD1)
    v(s, 20, 9, 22, WOOD2)
    v(s, 22, 8, 22, WOOD0)
    h(s, 4, 22, 22, WOOD0)                    # underside in shadow
    h(s, 18, 22, 10, WOOD1)
    # diagonal brace bottom-left -> top-right (2px, lit top edge)
    for i in range(16):
        x, y = 4 + i, 19 - (i * 8) // 15
        s.px(x, y, WOOD2)
        s.px(x, y - 1, WOOD3)
        s.px(x, y + 1, WOOD0, only=WOOD1)
    # corner brackets
    for (x0, y0, fx, fy) in ((1, 8, 1, 1), (20, 8, -1, 1), (1, 20, 1, -1), (20, 20, -1, -1)):
        ax = x0 if fx == 1 else x0 + 2
        ay = y0 if fy == 1 else y0 + 2
        for k in range(3):
            s.px(ax + fx * k, ay, STEEL2)
            s.px(ax, ay + fy * k, STEEL2)
        s.px(ax, ay, STEEL3)
        s.px(ax + fx, ay + fy, STEEL1)
    pts(s, STEEL1, [(21, 9), (21, 21), (22, 10), (22, 20)])
    pts(s, STEEL3, [(2, 15), (21, 15)])       # nails
    # stencil on the top rail: three dashes (faded paint)
    pts(s, BONE, [(9, 9), (10, 9), (12, 9), (13, 9), (15, 9)])
    # wear: dent/chip on the top-right corner, dirt on the bottom rail
    s.px(22, 1, None)
    s.px(21, 1, WOOD1)
    pts(s, WOOD0, [(6, 21), (7, 21), (13, 21), (17, 22)])
    # moss creeping up the bottom-left and over the lid corner
    pts(s, MOSS1, [(1, 22), (2, 22), (3, 22), (4, 22), (5, 22), (1, 21), (2, 21), (1, 20), (6, 22), (2, 20), (1, 19), (3, 21)])
    pts(s, MOSS2, [(1, 20), (2, 21), (4, 22), (1, 18)])
    pts(s, MOSS0, [(5, 22), (3, 22), (7, 22)])
    pts(s, MOSS1, [(1, 1), (2, 1), (1, 2), (3, 1), (1, 3)])
    pts(s, MOSS2, [(2, 1), (1, 2)])


# ------------------------------------------------------------------ chest 28x22
def draw_chest(s, _):
    # lid: top face y1..6 + lid band y7..9 (full width x1..26)
    # body (inset 1px so the lid overhangs): drawers y11..19, base y20, x2..25
    s.rect(1, 1, 26, 6, RUST1)
    h(s, 2, 18, 1, WOOD3)                     # lit back edge
    h(s, 1, 26, 6, WOOD3)                     # front lip of the lid
    h(s, 21, 26, 6, RUST1)
    v(s, 1, 1, 6, WOOD3)
    v(s, 26, 1, 6, RUST0)
    # pressed ribs on the lid
    h(s, 3, 7, 3, RUST0)
    h(s, 20, 24, 3, RUST0)
    h(s, 3, 7, 4, WOOD3)
    h(s, 20, 24, 4, RUST1)
    # carry handle: steel bar on posts with shadow
    h(s, 9, 18, 2, STEEL3)
    h(s, 10, 17, 2, STEEL2)
    h(s, 9, 18, 3, INK)
    pts(s, STEEL1, [(9, 3), (18, 3)])
    pts(s, STEEL2, [(9, 4), (18, 4)])
    h(s, 10, 17, 4, RUST0)
    s.px(9, 2, WHITE)
    # ---- front: lid band
    s.rect(1, 7, 26, 9, RUST0)
    h(s, 1, 26, 7, RUST1)
    v(s, 1, 7, 9, RUST1)
    v(s, 26, 7, 9, WOOD0)
    v(s, 25, 8, 9, WOOD0)
    # ---- body / drawers (inset)
    s.rect(2, 10, 25, 19, RUST0)
    h(s, 2, 25, 10, UMBER)                    # overhang shadow under the lid
    h(s, 2, 25, 11, WOOD0)
    v(s, 2, 11, 19, RUST1)
    h(s, 3, 25, 12, RUST1)
    h(s, 2, 25, 15, WOOD0)                    # drawer seam
    h(s, 3, 25, 16, RUST1)
    v(s, 25, 11, 19, WOOD0)
    pts(s, WOOD0, [(24, 13), (24, 14), (24, 18), (24, 19), (23, 19)])
    # drawer pulls
    for y in (13, 18):
        h(s, 10, 17, y - 1, STEEL2)
        h(s, 11, 16, y, INK)
        pts(s, STEEL1, [(10, y), (17, y)])
        s.px(10, y - 1, STEEL3)
        s.px(11, y - 1, STEEL3)
    # paper label on the top drawer (faded, with scribble)
    s.rect(4, 13, 7, 14, BONE)
    pts(s, WOOD2, [(5, 14), (6, 13), (7, 14)])
    # base trim + feet
    h(s, 2, 25, 20, UMBER)
    pts(s, INK, [(2, 20), (3, 20), (4, 20), (23, 20), (24, 20), (25, 20)])
    pts(s, STEEL1, [(3, 20), (24, 20)])
    # chipped paint -> bare steel at corners and edges
    pts(s, STEEL2, [(1, 7), (2, 7), (1, 8), (25, 1), (26, 2), (2, 12), (22, 16)])
    pts(s, STEEL1, [(2, 8), (25, 2), (24, 1), (2, 13), (21, 16), (20, 19), (19, 19)])
    # rust bleeding from the latch and a lower seam
    pts(s, WOOD0, [(14, 12), (14, 13), (13, 13), (20, 17), (20, 18)])
    # amber latch plate over the seam, centred
    bitmap(s, 12, 6, [
        ".oo.",
        "oaAo",
        "oayo",
        "oaao",
        "o..o",
        ".oo.",
    ], {"o": ORANGE, "a": AMBER, "A": YELLOW, "y": UMBER})
    s.px(13, 7, WHITE)


# ------------------------------------------------------------------ cache 28x24
def draw_cache(s, _):
    # domed trunk: lid y1..10, seam y11, body y12..21, base y22
    rows = {1: (4, 23), 2: (2, 25), 3: (1, 26)}
    for y in range(1, 11):
        x0, x1 = rows.get(y, (1, 26))
        h(s, x0, x1, y, PLUM)
    # dome shading: lit crown, falloff to the front, darker right
    for y, (x0, x1) in ((1, (4, 21)), (2, (3, 20)), (3, (2, 18)), (4, (2, 16)), (5, (2, 10))):
        h(s, x0, x1, y, MAUVE)
    h(s, 5, 15, 1, PINK)
    h(s, 3, 9, 2, PINK)
    h(s, 1, 26, 9, PLUM)
    h(s, 1, 26, 10, UMBER)                    # lid lip shadow
    h(s, 1, 25, 8, MAUVE)                     # lid lip catches light
    v(s, 26, 3, 10, UMBER)
    pts(s, UMBER, [(25, 2), (24, 1), (23, 1)])
    # body
    s.rect(1, 11, 26, 21, PLUM)
    h(s, 1, 26, 11, INK)
    h(s, 1, 26, 12, MAUVE)
    v(s, 1, 12, 21, MAUVE)
    for x in (24, 25, 26):
        v(s, x, 13, 21, UMBER if x > 24 else PLUM)
    v(s, 25, 13, 21, PLUM)
    h(s, 1, 26, 21, UMBER)
    # steel bands wrapping lid + body
    for bx in (5, 21):
        for y in range(1, 22):
            if s.get(bx, y):
                s.px(bx, y, STEEL2)
                s.px(bx + 1, y, STEEL1)
        s.px(bx, 11, INK)
        s.px(bx + 1, 11, INK)
        for y in (3, 7, 14, 18):
            s.px(bx, y, STEEL3)
    pts(s, STEEL3, [(5, 2), (21, 2), (5, 1)])
    # corner caps
    for (x, y) in ((1, 12), (24, 12), (1, 19), (24, 19)):
        s.rect(x, y, x + 2, y + 2, STEEL1)
        s.px(x, y, STEEL3)
        s.px(x + 1, y + 1, STEEL2)
    h(s, 1, 26, 21, UMBER)
    # emblem on the lid: diamond stencil
    bitmap(s, 11, 3, [
        "..p..",
        ".p.p.",
        "p...p",
        ".p.p.",
    ], {"p": PINK})
    # glowing lock: steel hex plate across the seam with cyan core + halo on the paint
    bitmap(s, 10, 8, [
        "..bbbb..",
        ".bSSSSb.",
        "bSsCCsSb",
        "bSsCWsSb",
        "bSsCCsSb",
        "bSsCCsSb",
        ".bSssSb.",
        "..bbbb..",
    ], {"b": BLUE, "S": STEEL2, "s": STEEL0, "C": CYAN, "W": WHITE})
    # cyan seam glow leaking left/right of the lock
    pts(s, BLUE, [(8, 11), (9, 11), (18, 11), (19, 11)])
    pts(s, CYAN, [(9, 11), (18, 11)])
    # scuffs on the paint
    pts(s, STEEL1, [(3, 16), (4, 17), (19, 20), (14, 2)])
    pts(s, UMBER, [(9, 18), (16, 15), (17, 15)])
    # plinth/feet so the base sits on the bottom row
    h(s, 2, 25, 22, INK)
    pts(s, STEEL1, [(2, 22), (3, 22), (24, 22), (25, 22)])


# ------------------------------------------------------------------ opened 24x16
def draw_opened(s, _):
    # open crate: rims y1..8, front face y9..14
    s.rect(1, 1, 22, 8, WOOD2)
    # interior: back inner wall (y2..4) and dark floor (y5..7)
    s.rect(3, 2, 20, 4, WOOD0)
    h(s, 3, 20, 2, UMBER)                     # shadow of the back rim
    s.rect(3, 5, 20, 7, UMBER)
    h(s, 3, 20, 7, OUT)
    v(s, 3, 3, 7, OUT)
    v(s, 8, 3, 4, UMBER)
    v(s, 14, 3, 4, UMBER)
    pts(s, WOOD1, [(4, 3), (5, 3), (9, 3), (15, 4), (16, 4), (10, 4)])
    # left/right rims (wall thickness) and back rim
    h(s, 1, 22, 1, BONE)
    v(s, 1, 1, 8, BONE)
    v(s, 2, 1, 8, WOOD3)
    v(s, 21, 1, 8, WOOD2)
    v(s, 22, 1, 8, WOOD1)
    h(s, 1, 22, 8, BONE)                      # front rim top edge
    h(s, 19, 22, 8, WOOD3)
    # scattered packing straw + a lone bolt left behind
    pts(s, WOOD2, [(5, 6), (6, 6), (7, 5), (12, 6), (13, 6), (18, 5), (19, 6), (11, 7)])
    pts(s, WOOD3, [(6, 6), (12, 6), (19, 6)])
    pts(s, STEEL2, [(15, 6)])
    pts(s, STEEL0, [(16, 6)])
    # front face with rails
    s.rect(1, 9, 22, 14, WOOD1)
    h(s, 1, 22, 9, WOOD2)
    h(s, 1, 22, 13, WOOD2)
    h(s, 1, 22, 14, WOOD0)
    h(s, 4, 19, 10, WOOD0)
    for gx in (8, 14):
        v(s, gx, 10, 12, WOOD0)
    v(s, 1, 9, 14, WOOD3)
    v(s, 22, 9, 14, WOOD0)
    pts(s, STEEL2, [(1, 9), (2, 9), (22, 9), (21, 9), (1, 13), (22, 13)])
    pts(s, WOOD2, [(5, 11), (11, 11), (12, 11), (17, 12)])
    # pried-up front board: a bent nail sticking out of the rim
    pts(s, STEEL3, [(11, 7), (12, 7)])
    pts(s, STEEL1, [(12, 8)])
    # splintered break on the back-right rim
    s.px(20, 1, None)
    s.px(21, 1, None)
    s.px(22, 1, None)
    pts(s, WOOD3, [(19, 1), (21, 2)])
    pts(s, MOSS1, [(1, 14), (2, 14), (1, 13)])
    pts(s, MOSS2, [(1, 13)])


if __name__ == "__main__":
    import sys as _s
    only = set(_s.argv[1:])
    for key, (w, hh, fn) in {
        "crate": (24, 24, draw_crate),
        "chest": (28, 22, draw_chest),
        "cache": (28, 24, draw_cache),
        "opened": (24, 16, draw_opened),
    }.items():
        if only and key not in only:
            continue
        s = new(w, hh)
        frames(s, 1, fn)
        export(s, key)
