"""Verdant Relay - rubble (concrete chunks + rebar) and rubble_2 (brick/slab pile with a pipe),
32x24, base on bottom row.  Run: python pixel-art/rubble/build.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import C, Pix, chunk, deliver  # noqa: E402

CONC = [C["sl1"], C["sl2"], C["sl3"], C["sl4"]]
CONC_D = [C["sl0"], C["sl1"], C["sl2"], C["sl3"]]
BRICK = [C["br0"], C["br0"], C["br1"], C["br2"]]


def rebar(p, pts):
    p.path(pts, C["br1"])
    for x, y in pts[1:]:
        p.px(x, y, C["rust"])
    x, y = pts[-1]
    p.px(x, y - 1, C["org"])


def rubble():
    p = Pix(32, 24, seed=601)
    # back chunk (in shade), big tilted slab, small front chunks
    chunk(p, [(17, 7), (27, 9), (29, 14), (19, 15)], 4, CONC_D)
    rebar(p, [(22, 10), (24, 4), (25, 2)])
    rebar(p, [(26, 11), (29, 6)])
    chunk(p, [(3, 11), (15, 8), (20, 13), (8, 17)], 5, CONC)
    rebar(p, [(9, 12), (6, 6), (5, 3)])
    chunk(p, [(18, 16), (24, 15), (26, 18), (20, 20)], 3, CONC)
    chunk(p, [(4, 18), (8, 17), (9, 20), (5, 21)], 2, CONC_D)
    chunk(p, [(26, 19), (29, 19), (30, 21), (27, 22)], 1, CONC_D)
    # cracks & exposed aggregate on the big slab, moss in a joint
    p.path([(10, 10), (12, 12), (12, 14)], C["sl1"])
    for x, y in ((6, 13), (14, 11), (11, 15)):
        p.px(x, y, C["sl1"])
    for x, y in ((15, 15), (16, 15), (16, 16)):
        p.px(x, y, C["g1"])
    p.px(15, 14, C["g2"])
    # dust/grit at the base
    p.hline(3, 30, 23, C["sl1"], only="empty")
    for x in (2, 12, 17, 31):
        p.px(x, 23, C["sl2"])
    p.outline(C["ink"])
    return p


def rubble_2():
    p = Pix(32, 24, seed=602)
    # broken brick heap: individual bricks stacked back-to-front, bottom-to-top
    BR = [C["br0"], C["br0"], C["br1"], C["br2"]]
    BRR = [C["br0"], C["br0"], C["red0"], C["rust"]]
    bricks = [(2, 17, 0), (7, 17, 1), (12, 17, 0), (4, 14, 0), (9, 14, 2), (14, 15, 0),
              (6, 11, 1), (11, 12, 0), (8, 9, 0)]
    for x, y, kind in bricks:
        ramp = BRR if kind == 1 else BR
        w = 5 if kind != 2 else 4
        chunk(p, [(x, y), (x + w, y), (x + w, y + 1), (x, y + 1)], 2, ramp, crack=False)
    for x, y in ((5, 13), (13, 11), (10, 16)):
        p.px(x, y, C["sl3"])
    # rusty pipe lying across
    p.thick([(13, 9), (29, 14)], 3, C["sl1"])
    p.line(13, 8, 29, 13, C["sl3"])
    p.line(13, 10, 29, 15, C["sl0"])
    p.ellipse(13, 10, 1.4, 2, C["ink"])
    p.px(12, 9, C["sl2"])
    for x, y in ((19, 11), (20, 11), (24, 13), (25, 12)):
        p.px(x, y, C["rust"])
    # a concrete slab propped up on the right
    chunk(p, [(18, 15), (27, 15), (30, 19), (21, 20)], 3, CONC)
    # loose bricks in front
    for (x, y) in ((4, 20), (12, 20)):
        chunk(p, [(x, y), (x + 4, y), (x + 4, y + 1), (x, y + 1)], 2, BRICK, crack=False)
    # weed tuft growing out of the heap
    for (x, y), c in (((7, 12), C["g2"]), ((8, 11), C["g3"]), ((9, 12), C["g1"]), ((6, 11), C["g2"])):
        p.px(x, y, c)
    p.hline(2, 30, 23, C["br0"], only="empty")
    p.outline(C["ink"])
    return p


def main():
    prev = HERE / "preview"
    deliver("rubble", [rubble()], prev, scale=8)
    deliver("rubble_2", [rubble_2()], prev, scale=8)
    print("rubble done")


if __name__ == "__main__":
    main()
