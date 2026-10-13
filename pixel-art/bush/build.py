"""Verdant Relay - bush (fern clump) and bush_2 (broadleaf shrub), 32x24, base on bottom row.
Run: python pixel-art/bush/build.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import C, Pix, foliage, deliver  # noqa: E402

LEAF = [C["g0"], C["g1"], C["g2"], C["g3"]]


def fern_frond(p, x0, y0, ang, length, droop, back=False):
    """Arching fern frond: rib rises then droops; pinnae every other px so it stays airy."""
    R = [C["g0"], C["g0"], C["g1"], C["g2"]] if back else LEAF
    a = math.radians(ang)
    dx, dy = math.cos(a), math.sin(a)
    x, y = float(x0), float(y0)
    lit_side = dx < 0.3
    prev = None
    for i in range(length):
        t = i / length
        x += dx
        y += dy + droop * t * t * 2.2
        ll = 3 if 0.2 < t < 0.7 else 2 if t < 0.9 else 1
        if i % 2 == 0 and i > 1:
            for k in range(1, ll + 1):
                p.px(x - k * 0.8 * (1 if dx >= 0 else -1) * 0.2 - k * 0.6, y + k * 0.5, R[1] if not lit_side else R[2])
                p.px(x + k * 0.6, y + k * 0.5, R[1])
        cur = (round(x), round(y))
        if prev and abs(cur[0] - prev[0]) + abs(cur[1] - prev[1]) > 1:
            p.line(prev[0], prev[1], cur[0], cur[1], R[2])
        p.px(x, y, R[3] if (lit_side and i % 3 == 0 and not back) else R[2])
        prev = cur


def fern():
    p = Pix(32, 24, seed=401)
    for ang, ln, dr in ((222, 15, 0.5), (318, 15, 0.5), (262, 17, 0.3)):
        fern_frond(p, 16, 22, ang, ln, dr, back=True)
    for ang, ln, dr in ((200, 14, 0.55), (236, 18, 0.4), (256, 19, 0.3), (282, 19, 0.3),
                        (304, 18, 0.4), (340, 14, 0.55)):
        fern_frond(p, 16, 22, ang, ln, dr)
    # curled fiddlehead
    for x, y in ((18, 13), (19, 12), (20, 12), (20, 13), (19, 14), (18, 15), (18, 16)):
        p.px(x, y, C["g3"])
    p.rect(13, 21, 19, 23, C["g0"])
    p.rect(14, 21, 17, 22, C["g1"])
    p.px(14, 21, C["g2"])
    p.outline(C["ink"])
    return p


def shrub():
    p = Pix(32, 24, seed=402)
    BACK = [C["g0"], C["g0"], C["g1"], C["g2"]]
    foliage(p, 10, 15, 7, 5, BACK, shade_bias=0.2)
    foliage(p, 22, 14, 7, 5, BACK, shade_bias=0.2)
    foliage(p, 16, 9, 7, 5, LEAF)
    foliage(p, 9, 17, 6, 4, LEAF, shade_bias=0.1)
    foliage(p, 23, 17, 6, 4, LEAF, shade_bias=0.25)
    # broad leaves breaking the rim
    for pts, c in (([(2, 15), (3, 14), (4, 14), (3, 15)], C["g2"]),
                   ([(28, 12), (29, 12), (29, 13), (30, 13)], C["g1"]),
                   ([(14, 3), (15, 3), (15, 2), (16, 2)], C["g3"])):
        p.pts(pts, c)
    # small amber blossoms (sit in the lit upper half)
    for x, y in ((13, 7), (20, 10), (8, 13)):
        p.px(x, y, C["amber"])
        p.px(x + 1, y, C["orange"])
        p.px(x, y + 1, C["orange"])
    # stems at the base touching the ground
    for x in (12, 16, 20):
        p.vline(x, 20, 22, C["br1"])
        p.px(x - 1, 22, C["br0"])
    p.hline(10, 22, 22, C["g0"], only="empty")
    p.outline(C["ink"])
    return p


def main():
    prev = HERE / "preview"
    deliver("bush", [fern()], prev, scale=8)
    deliver("bush_2", [shrub()], prev, scale=8)
    print("bushes done")


if __name__ == "__main__":
    main()
