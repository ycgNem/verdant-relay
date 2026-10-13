"""beacon (24x72): emergency extraction beacon pole. Concrete block base with hazard stripes,
a steel pipe pole with clamp bands, junction box and cables, topped by a caged lamp with a
flashing cyan light and a whip antenna.
Frames: idle 2 (light on / off)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "towers_common"))
from tw import *  # noqa

W, H = 24, 72
CX = 12


def frame(on):
    c = Canvas(W, H)
    # ---- concrete base block (3/4 box)
    x0, x1 = 3, 20
    c.box(x0, x1, 59, 4, 70, "#8b9bb4", "#5a6988", lit="#8b9bb4", dark="#3a4466", edge="#c0cbdc")
    c.hline(x0 + 1, x1 - 1, 59, "#c0cbdc")
    # hazard stripes band on the front
    for x in range(x0 + 1, x1):
        for y in (65, 66):
            c.px(x, y, "#feae34" if ((x + y) // 2) % 2 == 0 else "#262b44")
    c.hline(x0, x1, 70, "#3a4466")
    # cracks, chips, moss
    c.pts([(x0 + 3, 64), (x0 + 4, 63), (x1 - 4, 68), (x1 - 3, 69)], "#262b44")
    c.pts([(x0, 69), (x0 + 1, 70), (x0, 68), (x0 + 2, 70), (x1, 69)], "#3e8948")
    c.pts([(x0, 67), (x0 + 1, 69)], "#63c74d")
    c.pts([(x0 + 6, 60), (x1 - 3, 61)], "#5a6988")
    # anchor bolts on top
    for bx in (x0 + 2, x1 - 2):
        c.px(bx, 61, "#c0cbdc")
        c.px(bx, 62, "#3a4466")
    # ---- pole: 4px steel pipe
    top = 16
    c.cyl(CX - 2, CX + 1, top, 61, STEEL)
    # base flange
    c.drum(CX, 60, 61, 4, 1, STEEL, top=STEEL[3])
    # clamp bands
    for y in (24, 40, 52):
        c.hline(CX - 3, CX + 2, y, STEEL[1])
        c.hline(CX - 3, CX + 2, y - 1, STEEL[3])
        c.px(CX - 3, y - 1, STEEL[4])
    # hazard paint section on the pole
    for y in range(44, 50):
        for x in range(CX - 2, CX + 2):
            if ((y // 2) % 2) == 0:
                c.px(x, y, "#feae34" if x < CX else "#f77622")
    # junction box clamped on the pole
    c.box(CX + 2, CX + 7, 30, 2, 37, STEEL[3], STEEL[2], lit=STEEL[3], dark=STEEL[0], edge=STEEL[4])
    c.px(CX + 4, 34, "#63c74d" if on else "#265c42")     # status led
    c.px(CX + 5, 34, "#e43b44" if not on else "#a22633")
    c.hline(CX + 3, CX + 6, 36, STEEL[1])
    # cables: one spiralling down the pole into the base, one draping from the box
    for i, y in enumerate(range(38, 59, 1)):
        x = CX - 3 + ((y // 3) % 2) * 0
        if (y // 4) % 2 == 0:
            c.px(CX - 3, y, INK)
        else:
            c.px(CX + 2, y, INK)
    cab = [(CX + 6, 38), (CX + 7, 39), (CX + 7, 40), (CX + 8, 41)] + [(CX + 8, y) for y in range(42, 52)] +           [(CX + 7, 52), (CX + 7, 53), (CX + 6, 54), (CX + 6, 55), (CX + 6, 56), (CX + 6, 57), (CX + 6, 58)]
    c.pts(cab, INK)
    c.pts([(CX + 8, 44), (CX + 8, 49)], STEEL[1])
    # rust streaks
    c.pts([(CX, 25), (CX, 26), (CX, 27), (CX + 1, 41), (CX + 1, 42)], RUST[1])
    # ---- lamp head
    hy = 6
    # cap
    c.rect(CX - 5, hy - 1, CX + 4, hy + 1, STEEL[2])
    c.hline(CX - 4, CX + 3, hy - 2, STEEL[3])
    c.hline(CX - 4, CX + 1, hy - 2, STEEL[4])
    c.hline(CX - 5, CX + 4, hy + 1, STEEL[1])
    c.px(CX + 4, hy, STEEL[0])
    # lens (cyan glass) behind cage bars
    ly0, ly1 = hy + 2, hy + 8
    if on:
        c.rect(CX - 4, ly0, CX + 3, ly1, CYAN[2])
        c.rect(CX - 3, ly0 + 1, CX + 1, ly1 - 2, WHITE)
        c.vline(CX + 3, ly0, ly1, CYAN[1])
        c.hline(CX - 4, CX + 3, ly1, CYAN[1])
    else:
        c.rect(CX - 4, ly0, CX + 3, ly1, CYAN[0])
        c.rect(CX - 3, ly0 + 1, CX, ly1 - 2, CYAN[1])
        c.px(CX - 3, ly0 + 1, CYAN[2])
    # cage bars
    for x in (CX - 4, CX - 1, CX + 2):
        c.vline(x, ly0, ly1, STEEL[1] if on else STEEL[0])
    c.hline(CX - 4, CX + 3, ly0 + 3, STEEL[1] if on else STEEL[0])
    # base collar of the lamp
    c.rect(CX - 4, ly1 + 1, CX + 3, ly1 + 2, STEEL[2])
    c.hline(CX - 4, CX + 2, ly1 + 1, STEEL[3])
    c.hline(CX - 3, CX + 2, ly1 + 3, STEEL[1])
    c.rect(CX - 2, ly1 + 3, CX + 1, top, STEEL[2])
    c.vline(CX - 2, ly1 + 3, top, STEEL[3])
    # whip antenna with red tip
    c.vline(CX + 3, 0 + 1, hy - 2, STEEL[3])
    c.outline()
    c.fx()
    c.px(CX + 3, 0, "#ff0044" if on else "#a22633")
    if on:
        # light rays (cross-shaped flare) on the fx layer, beyond the outline
        y = ly0 + 3
        c.pts([(CX - 6, y), (CX - 7, y), (CX - 8, y), (CX + 5, y), (CX + 6, y), (CX + 7, y)], CYAN[2])
        c.pts([(CX - 9, y), (CX - 10, y), (CX + 8, y), (CX + 9, y)], CYAN[1])
        c.pts([(CX - 6, y - 1), (CX + 5, y - 1), (CX - 6, y + 1), (CX + 5, y + 1)], WHITE)
        c.pts([(CX - 6, ly0 - 1), (CX - 7, ly0 - 2), (CX + 5, ly0 - 1), (CX + 6, ly0 - 2),
               (CX - 6, ly1 + 1), (CX - 7, ly1 + 2), (CX + 5, ly1 + 1), (CX + 6, ly1 + 2)], CYAN[1])
    c.body()
    return c.image()


def build():
    frames = [frame(True), frame(False)]
    entry = export("beacon", frames, HERE, {"idle": [0, 1]}, extra={"animFps": {"idle": 3}})
    (HERE / "manifest_part.json").write_text(json.dumps({"beacon": entry}, indent=2))


if __name__ == "__main__":
    build()
