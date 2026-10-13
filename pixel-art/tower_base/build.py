"""tower_base (32x32, flat decal): the build pad. Top-down concrete slab with bevelled edges,
hazard-striped corners, anchor bolts, a mounting ring in the middle, cracks and moss.
Drawn lying on the floor (top of the image = far edge)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "towers_common"))
from tw import *  # noqa

W = H = 32


def build_pad():
    c = Canvas(W, H)
    x0, y0, x1, y1 = 1, 1, 30, 30
    # slab with chamfered corners
    c.rect(x0, y0, x1, y1, "#8b9bb4")
    for (x, y) in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        c.erase(x, y)
    # bevel: lit top/left, shaded bottom/right
    c.hline(x0 + 1, x1 - 1, y0, "#c0cbdc")
    c.vline(x0, y0 + 1, y1 - 1, "#c0cbdc")
    c.hline(x0 + 1, x1 - 1, y1, "#3a4466")
    c.vline(x1, y0 + 1, y1 - 1, "#3a4466")
    c.hline(x0 + 1, x1 - 1, y1 - 1, "#5a6988")
    c.vline(x1 - 1, y0 + 1, y1 - 1, "#5a6988")
    # surface wear: a few lighter/darker clusters (not noise)
    for (x, y) in ((6, 9), (7, 9), (7, 10), (22, 6), (23, 6), (12, 24), (13, 24), (25, 20)):
        c.px(x, y, "#c0cbdc")
    for (x, y) in ((19, 11), (20, 11), (9, 18), (10, 19), (24, 24), (25, 24)):
        c.px(x, y, "#5a6988")
    # hazard-stripe corners (L-shaped, diagonal stripes)
    def hazard(cx, cy, sx, sy):
        for i in range(7):
            for j in range(7):
                if i > 2 and j > 2:
                    continue
                x, y = cx + sx * i, cy + sy * j
                k = (i + j) // 2 % 2
                c.px(x, y, "#feae34" if k == 0 else "#262b44")
        # worn paint: a few chips back to concrete
    hazard(2, 2, 1, 1)
    hazard(29, 2, -1, 1)
    hazard(2, 29, 1, -1)
    hazard(29, 29, -1, -1)
    for (x, y) in ((5, 2), (2, 6), (27, 3), (29, 6), (3, 28), (26, 29)):
        c.px(x, y, "#8b9bb4")
    c.pts([(3, 2), (2, 3)], "#fee761")
    # mounting ring: recessed annular groove (top-left wall in shadow, bottom-right wall lit)
    import math
    for x in range(4, 29):
        for y in range(4, 29):
            d = math.hypot(x - 15.5, y - 15.5)
            if 7.6 <= d < 9.4:
                tl = (x - 15.5) + (y - 15.5) < 0
                outer = d >= 8.5
                if outer:
                    c.px(x, y, "#3a4466" if tl else "#5a6988")
                else:
                    c.px(x, y, "#5a6988" if tl else "#c0cbdc")
    # anchor bolts on the ring
    for (x, y) in ((16, 8), (24, 16), (16, 24), (8, 16)):  # on the groove
        c.rect(x - 1, y - 1, x, y, "#3a4466")
        c.px(x - 1, y - 1, "#c0cbdc")
        c.px(x, y, "#262b44")
    # cracks
    for pts in ([(4, 13), (5, 14), (5, 15), (6, 16), (6, 17)],
                [(20, 26), (21, 27), (21, 28), (22, 29)],
                [(26, 9), (25, 10), (25, 11)]):
        c.pts(pts, "#262b44")
    c.pts([(4, 12), (5, 13)], "#3a4466")
    # moss in the cracks and along the shaded edge
    c.pts([(6, 18), (7, 18), (5, 17), (22, 28), (23, 29), (24, 29), (29, 14), (29, 15), (28, 15)], "#3e8948")
    c.pts([(7, 17), (23, 28), (28, 14)], "#63c74d")
    c.pts([(29, 16), (24, 30)], "#265c42")
    c.outline()
    return c.image()


def build():
    im = build_pad()
    entry = export("tower_base", [im], HERE, {}, extra={"flat": True, "shadow": 0})
    entry.pop("anims", None)
    entry.pop("fps", None)
    (HERE / "manifest_part.json").write_text(json.dumps({"tower_base": entry}, indent=2))


if __name__ == "__main__":
    build()
