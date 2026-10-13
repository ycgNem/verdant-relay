"""Verdant Relay - lamp_post (16x72, idle 2 frames: amber flicker).
Old cast-iron street lamp, rusting, ivy climbing the pole, still sputtering amber light.
Run: python pixel-art/lamp_post/build.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import C, Pix, deliver  # noqa: E402

IRON = [C["ink"], C["sl0"], C["sl1"], C["sl2"]]
LEAF = [C["g0"], C["g1"], C["g2"], C["g3"]]


def lamp(bright):
    p = Pix(16, 72, seed=801)
    # plinth: cracked concrete footing
    p.rect(3, 66, 12, 70, C["sl2"])
    p.hline(3, 12, 66, C["sl3"])
    p.vline(3, 66, 70, C["sl3"])
    p.vline(12, 67, 70, C["sl1"])
    p.hline(4, 12, 70, C["sl1"])
    p.px(9, 68, C["sl1"])
    p.px(10, 69, C["sl1"])
    # cast-iron base flare
    p.rect(5, 60, 10, 65, IRON[2])
    p.rect(4, 64, 11, 65, IRON[2])
    p.vline(5, 60, 65, IRON[3])
    p.vline(10, 60, 65, IRON[1])
    p.hline(4, 11, 63, IRON[1])
    # pole (2px + highlight)
    for y in range(12, 60):
        p.px(7, y, IRON[3] if y % 9 else IRON[2])
        p.px(8, y, IRON[1])
    # collar rings
    for y in (30, 46):
        p.hline(6, 9, y, IRON[2])
        p.px(6, y, IRON[3])
    # rust streaks
    for y in range(40, 58, 3):
        p.px(8, y, C["br1"])
    p.px(7, 52, C["rust"])
    p.px(10, 62, C["rust"])
    p.px(9, 61, C["br1"])
    # lamp head: hood + glass + finial
    p.px(7, 1, IRON[2])
    p.px(8, 1, IRON[1])
    p.hline(6, 9, 2, IRON[2])
    p.hline(4, 11, 3, IRON[2])
    p.hline(3, 12, 4, IRON[1])
    p.hline(5, 10, 3, IRON[3])
    p.hline(2, 13, 5, IRON[1])
    p.px(2, 5, IRON[2])
    glass = [C["yellow"], C["amber"], C["orange"]] if bright else [C["amber"], C["orange"], C["br1"]]
    for y in range(6, 10):
        w = 4 - (y - 6) // 2
        p.hline(8 - w, 7 + w, y, glass[1])
    p.hline(6, 9, 6, glass[0])
    p.hline(6, 8, 7, glass[0])
    p.px(10, 8, glass[2])
    p.px(9, 9, glass[2])
    p.vline(4, 6, 7, IRON[1])                    # glass frame struts
    p.vline(11, 6, 7, IRON[1])
    p.hline(6, 9, 10, IRON[1])                   # bottom cap
    p.hline(7, 8, 11, IRON[2])
    if bright:
        p.px(3, 9, C["yellow"])                  # stray glow sparks
        p.px(12, 10, C["amber"])
    # ivy climbing the pole from the base
    for y in range(36, 66):
        side = 6 if (y // 3) % 2 else 9
        if y % 3 != 1:
            p.px(side, y, LEAF[1])
        if y % 4 == 0:
            p.px(side + (-1 if side == 6 else 1), y - 1, LEAF[2] if side == 6 else LEAF[1])
    for x, y in ((5, 38), (10, 44), (4, 52), (11, 57), (5, 59)):
        p.px(x, y, LEAF[2])
        p.px(x, y + 1, LEAF[1])
    p.px(5, 37, LEAF[3])
    p.px(4, 51, LEAF[3])
    # weeds round the plinth
    for x in (2, 13):
        p.px(x, 69, LEAF[2])
        p.px(x, 70, LEAF[1])
    p.outline(C["ink"])
    return p


def main():
    deliver("lamp_post", [lamp(True), lamp(False)], HERE / "preview", scale=6)
    print("lamp done")


if __name__ == "__main__":
    main()
