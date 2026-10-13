"""Verdant Relay - wall_block (32x48): generic ruined concrete wall chunk at 3/4 view.
Jagged broken top (lit top face), cast-concrete front face with formwork seams, a blown-out
hole showing brick, rebar sticking out, moss on top, ivy down the face.
Run: python pixel-art/wall_block/build.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import C, Pix, vine, deliver  # noqa: E402

LEAF = [C["g0"], C["g1"], C["g2"], C["g3"]]


def wall():
    p = Pix(32, 48, seed=1001)
    # broken top profile (y of the top-face front edge per column)
    # sharp broken peaks, a deep V notch, a snapped-off right end stepping down: no smooth
    # arch, so it reads as a shattered wall and not a headstone
    prof = [16, 14, 13, 13, 10, 9, 9, 10, 14, 15, 11, 8, 7, 7, 8, 12, 17, 18, 15, 14,
            14, 19, 22, 21, 20, 23, 25, 25, 27, 28, 28, 28]
    # broken top surface: thickness seen from above varies column to column (chunky
    # plateaus between the breaks, thin on the slopes)
    dep = [5, 5, 6, 6, 5, 6, 6, 5, 4, 4, 5, 5, 5, 5, 5, 4, 3, 3, 4, 5,
           5, 4, 3, 4, 4, 3, 4, 4, 3, 3, 3, 3]
    for x in range(1, 31):
        top = prof[x]
        depth = dep[x]
        # top face (lit)
        for y in range(top - depth, top):
            p.px(x, y, C["sl3"])
        p.px(x, top - depth, C["sl2"])            # far edge of the top face
        p.px(x, top - 1, C["sl4"] if x < 22 else C["sl3"])  # lit front lip of the break
        # front face
        for y in range(top, 47):
            p.px(x, y, C["sl2"])
        p.px(x, top, C["sl1"])             # shadow line under the lip
    # right end face in shadow
    for y in range(prof[30], 47):
        p.px(30, y, C["sl1"])
    for y in range(prof[29] + 1, 47):
        p.px(29, y, C["sl1"] if y % 4 else C["sl2"])
    # shading: lower part of the face darker (ground bounce/grime)
    for x in range(1, 31):
        for y in range(43, 47):
            if p.get(x, y) == C["sl2"]:
                p.px(x, y, C["sl1"])
    for x in range(2, 29, 3):
        p.px(x, 42, C["sl1"])
    p.hline(1, 30, 46, C["sl0"])
    # formwork seams + tie holes
    for y in (24, 35):
        p.hline(1, 28, y, C["sl1"], only=C["sl2"])
    for x, y in ((6, 29), (16, 29), (24, 29), (6, 40), (16, 40)):
        p.px(x, y, C["sl0"])
    # blown-out hole showing brick infill
    hole = Pix.ellipse_pts(10, 29, 5, 4)
    for x, y in hole:
        p.px(x, y, C["br0"], only=(C["sl2"], C["sl3"]))
    for x, y in hole:
        if p.get(x, y) == C["br0"] and y % 2 == 0 and (x + (y // 2) * 2) % 4 != 0:
            p.px(x, y, C["br1"])
    for x, y in hole:  # rim: lit lower-right edge, shadowed top-left inside
        if p.get(x, y) == C["br0"] or p.get(x, y) == C["br1"]:
            if p.get(x - 1, y) in (C["sl2"], C["sl3"]) or p.get(x, y - 1) in (C["sl2"], C["sl3"]):
                p.px(x, y, C["ink"])
    # cracks
    p.path([(16, 20), (17, 23), (16, 27), (18, 31), (17, 34)], C["sl0"])
    p.path([(21, 24), (22, 27)], C["sl0"])
    p.path([(4, 33), (7, 36), (6, 39)], C["sl0"])
    # rebar sticking up out of the break
    for x0, y0, x1, y1 in ((12, 4, 11, 1), (17, 15, 19, 10), (24, 17, 26, 12)):
        p.line(x0, y0, x1, y1, C["br1"])
        p.px(x1, y1, C["rust"])
    p.line(12, 30, 15, 29, C["rust"])
    # rust weeping from the rebar
    for y in range(26, 33):
        if y % 2:
            p.px(22, y, C["br1"], only=C["sl2"])
    # moss on the top face + ivy down the front
    for x in range(2, 24):
        if p.rng.random() < 0.55:
            y = prof[x] - p.rng.randint(1, 4)
            p.px(x, y, LEAF[2] if p.rng.random() < 0.6 else LEAF[1])
    for x in range(3, 9):
        p.px(x, prof[x] - 2, LEAF[3] if x % 2 else LEAF[2])
    # chipped front lip: dark bites along the broken edge
    for x in (3, 9, 14, 18, 23):
        p.px(x, prof[x], C["sl0"])
        p.px(x, prof[x] - 1, C["sl1"])
    vine(p, 4, 10, 26, LEAF, leaves=0.6)
    vine(p, 26, 17, 14, LEAF, leaves=0.6)
    # weeds at the foot
    for x in (3, 9, 18, 27):
        p.px(x, 46, LEAF[2])
        p.px(x + 1, 45, LEAF[3])
    p.outline(C["ink"])
    return p


def main():
    deliver("wall_block", [wall()], HERE / "preview", scale=8)
    print("wall_block done")


if __name__ == "__main__":
    main()
