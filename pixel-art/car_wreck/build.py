"""Verdant Relay - car_wreck (64x40): rusted-out sedan at 3/4 view, front to the left,
paint faded to grey-blue, rust eating through, windows smashed, sunk on flat tyres,
vines pouring over the hood and a fern growing out of a hole in the roof.
Run: python pixel-art/car_wreck/build.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import C, Pix, foliage, vine, deliver  # noqa: E402

LEAF = [C["g0"], C["g1"], C["g2"], C["g3"]]
PAINT_SIDE, PAINT_TOP, PAINT_HI, PAINT_SH = C["sl2"], C["sl3"], C["sl4"], C["sl1"]
RUST = [C["br0"], C["br1"], C["rust"], C["org"]]


def rust_patch(p, cx, cy, rx, ry, on):
    pts = Pix.ellipse_pts(cx, cy, rx, ry)
    for x, y in pts:
        if p.get(x, y) in on and p.rng.random() < 0.9:
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            p.px(x, y, RUST[2] if d > 0.55 else RUST[1])
    for x, y in pts:
        if p.get(x, y) == RUST[1] and p.rng.random() < 0.15:
            p.px(x, y, RUST[0])
        elif p.get(x, y) == RUST[2] and p.rng.random() < 0.15:
            p.px(x, y, RUST[3])


def car():
    p = Pix(64, 40, seed=701)
    # ground contact shadow (car sits low on flat tyres)
    p.rect(4, 35, 60, 38, C["ink"])
    # --- side face of the body
    side = [(3, 26), (5, 24), (61, 24), (62, 26), (62, 34), (3, 34)]
    p.poly(side, PAINT_SIDE)
    p.hline(4, 61, 24, PAINT_HI)                 # beltline crease catches light
    p.hline(3, 62, 33, PAINT_SH)
    p.hline(3, 62, 34, C["sl0"])
    # wheel arches + sunk tyres
    for wx in (14, 51):
        for x, y in Pix.ellipse_pts(wx, 34, 6, 5):
            if y <= 34:
                p.px(x, y, C["ink"])
        for x, y in Pix.ellipse_pts(wx, 35, 4.5, 3.5):
            p.px(x, y, C["sl0"])
        p.ellipse(wx, 35, 2, 1.5, C["sl1"])
        p.px(wx - 1, 34, C["sl2"])
        p.hline(wx - 5, wx + 5, 37, C["ink"])
    # door seams, handle, sill
    for x in (24, 36):
        p.vline(x, 25, 32, PAINT_SH)
    p.hline(27, 29, 26, C["sl1"])
    p.hline(39, 41, 26, C["sl1"])
    # bumpers + lights
    p.rect(2, 29, 4, 32, C["sl1"])
    p.px(2, 29, C["sl3"])
    p.rect(3, 26, 5, 27, C["br4"])              # dead headlight
    p.px(3, 26, C["cream"])
    p.rect(61, 26, 62, 28, C["red0"])            # cracked tail light
    p.px(61, 26, C["red"])
    # --- top faces: hood, trunk, roof
    p.poly([(5, 18), (19, 17), (19, 23), (3, 23), (3, 20)], PAINT_TOP)       # hood
    p.poly([(49, 17), (60, 18), (62, 21), (62, 23), (49, 23)], PAINT_TOP)    # trunk lid
    p.poly([(23, 9), (45, 9), (45, 16), (23, 16)], PAINT_TOP)                # roof
    p.hline(23, 45, 9, PAINT_HI)
    p.vline(23, 9, 16, PAINT_HI)
    p.hline(5, 19, 17, PAINT_HI)
    p.hline(4, 18, 21, PAINT_SIDE)                                           # hood crease
    # windshield / rear glass / side windows (smashed: dark with glints and shards)
    p.poly([(19, 17), (23, 9), (23, 16), (19, 23)], C["sl0"])
    p.poly([(45, 9), (49, 17), (49, 23), (45, 16)], C["sl0"])
    p.poly([(23, 17), (45, 17), (48, 23), (20, 23)], C["ink"])
    for x, y in ((21, 15), (22, 13), (46, 12), (25, 18), (26, 18), (40, 19), (44, 21)):
        p.px(x, y, C["sl4"])
    p.line(25, 19, 27, 22, C["sl1"])             # broken glass edge
    p.line(41, 18, 43, 20, C["sl1"])
    p.vline(34, 17, 23, PAINT_SIDE)              # B-pillar
    p.line(20, 23, 23, 17, PAINT_SIDE)           # A-pillar
    p.line(45, 17, 48, 23, PAINT_SH)             # C-pillar
    # body outline accents between faces
    p.hline(3, 19, 24, PAINT_SH, only=PAINT_TOP)
    # --- rust eating through
    paintable = (PAINT_SIDE, PAINT_TOP, PAINT_HI, PAINT_SH)
    for cx, cy, rx, ry in ((10, 30, 6, 3), (30, 32, 9, 2), (56, 28, 5, 4), (44, 30, 4, 2),
                           (13, 20, 4, 2), (55, 20, 4, 2), (36, 13, 5, 3)):
        rust_patch(p, cx, cy, rx, ry, paintable)
    # hole rusted through the roof, fern growing out of it
    p.ellipse(31, 12, 3, 2, C["ink"])
    p.px(28, 12, RUST[2])
    p.px(34, 11, RUST[2])
    p.hline(29, 33, 14, RUST[1])
    for ang, (ex, ey) in enumerate(((24, 5), (28, 2), (32, 1), (36, 3), (39, 7), (26, 9))):
        p.line(31, 12, ex, ey, LEAF[2] if ex < 33 else LEAF[1])
        p.px(ex, ey, LEAF[3] if ex < 33 else LEAF[2])
    for x, y in ((27, 6), (29, 5), (34, 5), (36, 7), (30, 4)):
        p.px(x, y, LEAF[1])
    # vines pouring over the hood and down the front wheel arch
    foliage(p, 9, 19, 6, 3, LEAF, jag=0.5)
    foliage(p, 57, 18, 4, 2, LEAF, jag=0.5)
    for x, y, n in ((5, 20, 12), (9, 22, 10), (13, 21, 7), (56, 20, 9), (60, 20, 11), (47, 15, 9)):
        vine(p, x, y, n, LEAF, leaves=0.5)
    # moss on the roof edge and sill
    for x in range(36, 45):
        if p.rng.random() < 0.6:
            p.px(x, 10, LEAF[2])
    for x in range(20, 46):
        if p.rng.random() < 0.35:
            p.px(x, 33, LEAF[1])
    # weeds at the ground line
    for x in (6, 22, 33, 44, 59):
        p.px(x, 36, LEAF[2])
        p.px(x + 1, 35, LEAF[3])
        p.px(x - 1, 35, LEAF[1])
    p.outline(C["ink"])
    return p


def main():
    deliver("car_wreck", [car()], HERE / "preview", scale=6)
    print("car done")


if __name__ == "__main__":
    main()
