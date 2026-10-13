"""Snare Vine L1-L3 (32x48). A rusted half-barrel planter of curling green tendrils
holding up a pink bulb.
L1: 3 tendrils, closed bud.  L2: 5 tendrils, bigger spotted bulb, more leaves (stronger slow).
L3: thick roots spilling over the planter into the ground, bulb opening on a glowing core (root).
Frames: idle 2 (sway), attack 2 (lash: tendrils whip outward, bulb puffs).
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "towers_common"))
from tw import *  # noqa
from parts import footing  # noqa

W, H = 32, 48
CX = 16
PINK = ["#68386c", "#b55088", "#f6757a", "#e8b796"]
ROOT = ["#3e2731", "#733e39", "#b86f50"]

LV = {
    1: dict(bulb=(16, 15, 4), stem_top=19),
    2: dict(bulb=(16, 12, 5), stem_top=17),
    3: dict(bulb=(16, 10, 6), stem_top=16),
}


def planter(c, lv):
    top, bot, rx = 34, 41, 9
    ramp = ["#262b44", "#3a4466", "#5a6988", "#8b9bb4", "#c0cbdc"]
    c.drum(CX, top, bot, rx, 2, ramp, top="#3e2731")
    # soil inside the rim + lit back rim of the barrel
    c.ell(CX, top, rx - 1, 1, "#3e2731")
    c.hline(CX - rx + 2, CX + rx - 3, top - 1, "#733e39")
    for a, b, y in ell_rows(CX, top, rx, 2):
        if y == top - 2:
            c.hline(a, b, y, ramp[3])
        if y == top + 2:
            c.hline(a, b, y, ramp[2])
    # hoops
    for hy in (top + 4, bot):
        c.hline(CX - rx, CX + rx - 1, hy, ramp[1])
        c.hline(CX - rx, CX - rx + 3, hy, ramp[3])
    # rust patches and streaks
    c.pattern(CX + 1, top + 5, [".rrr.", "rrRrr", ".r.r.", ".d..."], {"r": RUST[2], "R": RUST[3], "d": RUST[1]})
    c.pts([(CX - 5, top + 3), (CX - 5, top + 5), (CX - 6, top + 6)], RUST[1])
    # painted stencil stripe (faded teal)
    c.hline(CX - rx + 2, CX - 3, top + 6, "#193c3e")
    # moss spilling over the rim
    c.pts([(CX - rx, top), (CX - rx, top + 1), (CX - rx + 1, top + 2), (CX - rx, top + 3),
           (CX + rx - 2, top + 1), (CX + rx - 1, top + 2)], LEAF[2])
    c.pts([(CX - rx + 1, top), (CX - rx + 1, top + 1)], LEAF[3])


def vine(c, pts, thick=2):
    """Thick tendril along a polyline; shadow on the right, light on the left."""
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        if thick >= 2:
            c.line(x0 + 1, y0, x1 + 1, y1, LEAF[1])
        if thick >= 3:
            c.line(x0 + 2, y0, x1 + 2, y1, LEAF[0])
            c.line(x0 - 1, y0, x1 - 1, y1, LEAF[2])
        c.line(x0, y0, x1, y1, LEAF[2])
    for i, (x, y) in enumerate(pts[:-1]):
        if i % 2 == 0:
            c.px(x - (1 if thick >= 3 else 0), y, LEAF[3])


def curl(c, x, y, d):
    """Little spiral at a tendril tip. d=+1 curls right, -1 curls left."""
    pts = [(0, 0), (d, -1), (2 * d, -1), (3 * d, 0), (3 * d, 1), (2 * d, 2), (d, 1)]
    for i, (dx, dy) in enumerate(pts):
        c.px(x + dx, y + dy, LEAF[3] if i < 3 else LEAF[2])


def leaf(c, x, y, d, big=False):
    """Small leaf hanging off a vine; d = direction (+1 right)."""
    if big:
        c.pattern(x if d > 0 else x - 3, y - 1, ["..ll", ".lgg", "lggd", ".dd."] if d > 0 else
                  ["ll..", "ggl.", "dggl", ".dd."], {"l": LEAF[3], "g": LEAF[2], "d": LEAF[1]})
    else:
        c.pattern(x if d > 0 else x - 2, y - 1, [".l.", "lgd"] if d > 0 else [".l.", "dgl"],
                  {"l": LEAF[3], "g": LEAF[2], "d": LEAF[1]})


def tendrils(lv, sway=0, lash=0):
    """Returns list of (points, thick, curl_dir) for side tendrils."""
    s, L = sway, lash
    t = [
        ([(12, 34), (10, 30), (8 - L, 27 - L), (7 - 2 * L, 23 - L), (8 - 3 * L + s, 20 - L)], 2, 1),
        ([(20, 34), (22, 30), (24 + L, 27 - L), (25 + 2 * L, 24 - L), (24 + 3 * L + s, 21 - L)], 2, -1),
        ([(14, 34), (13, 31), (11 - L, 29), (9 - 2 * L, 30 + L), (6 - 3 * L, 31 + L)], 2, -1),
    ]
    if lv >= 2:
        t += [
            ([(18, 34), (19, 31), (22 + L, 30), (25 + 2 * L, 31 + L), (27 + 2 * L, 30 + L)], 2, -1),
            ([(11, 34), (8, 32), (5 - L, 30 - L), (4 - 2 * L + s, 26 - L), (5 - 2 * L + s, 23 - L)], 2, 1),
        ]
    if lv >= 3:
        t += [
            ([(21, 34), (25, 32), (27 + L, 28), (28 + L + s, 24 - L), (27 + L + s, 21 - L)], 2, -1),
        ]
    return t


def bulb(c, lv, puff=0, bob=0, glow_hot=True):
    bx, by, r = LV[lv]["bulb"]
    by += bob
    r += puff
    # sepals (green) under the bulb
    c.ell(bx, by + r - 1, r - 1, 2, LEAF[1])
    c.hline(bx - r + 2, bx - 1, by + r - 2, LEAF[2])
    if lv < 3:
        # closed bud: teardrop
        c.ell(bx, by, r, r, PINK[1])
        c.ell(bx - 1, by - 1, r - 1, r - 1, PINK[2])
        for a, b, y in ell_rows(bx, by, r, r):
            if y > by + r // 2:
                c.hline(a + 1, b, y, PINK[1])
        c.pts([(bx - 1, by - r), (bx - 1, by - r - 1), (bx, by - r - 2)], PINK[1])  # tip
        c.px(bx, by - r - 1, PINK[2])
        # petal seams
        c.line(bx, by - r + 1, bx + 1, by + r - 2, PINK[1])
        c.line(bx - 3, by - r + 3, bx - 3, by + r - 3, PINK[1])
        # highlight
        c.pts([(bx - 3, by - 2), (bx - 3, by - 1), (bx - 2, by - 3)], PINK[3])
        if lv == 2:
            for sx, sy in ((bx + 2, by - 1), (bx - 1, by + 1), (bx + 1, by + 3), (bx - 4, by + 2)):
                c.px(sx, sy, PINK[0])
            c.pts([(bx + 3, by + 1), (bx + 2, by - 3)], PINK[3])
    else:
        # open bulb: 4 petals splayed around a glowing core
        c.ell(bx, by + 1, r, r - 1, PINK[1])
        # petals
        for (dx, dy) in ((-r, -1), (r - 3, -1), (-2, -r), (-3, 2)):
            c.ell(bx + dx + 1, by + dy + 1, 3, 2, PINK[2])
        c.ell(bx - r + 1, by - 1, 2, 1, PINK[3])
        c.ell(bx - 1, by - r + 2, 2, 1, PINK[3])
        c.pts([(bx + r - 1, by + 1), (bx + r - 2, by + 2), (bx + 1, by + r - 1)], PINK[0])
        # glowing core
        core = ["#63c74d", "#fee761", WHITE] if glow_hot else ["#3e8948", "#63c74d", "#fee761"]
        c.circle(bx - 1, by, 2, core[0])
        c.circle(bx - 1, by, 1, core[1])
        c.px(bx - 1, by, core[2])
        c.px(bx - 2, by - 1, core[2])
        # stamens
        c.pts([(bx - 4, by - 3), (bx + 2, by - 3), (bx - 1, by - 4)], "#fee761")


def roots(c):
    """L3: thick gnarled roots spilling over the barrel and gripping the ground."""
    paths = ([(10, 33), (7, 35), (6, 38), (5, 41), (3, 43), (1, 45)],
             [(22, 33), (25, 35), (26, 38), (27, 41), (29, 43), (30, 45)],
             [(13, 35), (12, 38), (12, 41), (10, 44), (8, 46)],
             [(19, 35), (20, 39), (21, 42), (23, 46)])
    for pts in paths:
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            c.line(x0 + 1, y0, x1 + 1, y1, ROOT[0])
            c.line(x0, y0, x1, y1, ROOT[1])
            c.line(x0 - 1, y0, x1 - 1, y1, ROOT[2])
        # knots
        x, y = pts[2]
        c.px(x - 1, y, ROOT[2]); c.px(x + 1, y + 1, ROOT[0])
    # rootlets on the ground
    c.pts([(2, 46), (3, 46), (28, 46), (29, 46), (31, 46)], ROOT[1])
    # moss on the roots
    c.pts([(6, 37), (7, 36), (26, 37), (12, 40), (20, 41)], LEAF[2])
    c.pts([(6, 36), (25, 36), (11, 40)], LEAF[3])


def frame(lv, mode, k):
    c = Canvas(W, H)
    footing(c, seed=lv + 9, moss=True)
    sway = 1 if (mode == "idle" and k == 1) else 0
    lash = 0
    if mode == "attack":
        lash = 2 if k == 0 else 1
    bob = sway
    # central stalk(s) up to the bulb
    bx, by, r = LV[lv]["bulb"]
    stalk = [(CX, 34), (CX - 1, 30), (CX + 1, 26), (CX, LV[lv]["stem_top"] + bob)]
    vine(c, stalk, thick=3 if lv >= 2 else 2)
    if lv >= 2:
        vine(c, [(CX + 2, 34), (CX + 3, 30), (CX + 2, 27), (CX + 1, 23)], thick=2)
    for pts, th, d in tendrils(lv, sway, lash):
        vine(c, pts, th)
        tx, ty = pts[-1]
        curl(c, tx, ty, d)
    # leaves along the stalk
    leaf(c, CX - 2, 29, -1, big=lv >= 2)
    leaf(c, CX + 2, 25, 1, big=lv >= 2)
    if lv >= 2:
        leaf(c, 9, 31, -1)
        leaf(c, 23, 29, 1)
    planter(c, lv)
    if lv >= 3:
        roots(c)
    bulb(c, lv, puff=1 if (mode == "attack" and k == 0) else 0, bob=bob,
         glow_hot=not (mode == "idle" and k == 1))
    c.outline()
    if mode == "attack" and k == 0:
        # spore puff from the bulb
        c.fx()
        bx, by, r = LV[lv]["bulb"]
        for (dx, dy) in ((-r - 3, -2), (r + 2, -3), (-1, -r - 4), (r + 3, 2), (-r - 2, 3)):
            c.px(bx + dx, by + dy, PINK[2])
        c.body()
    return c.image()


def build():
    entries = {}
    for lv in (1, 2, 3):
        key = "snare_vine" if lv == 1 else f"snare_vine_{lv}"
        frames = [frame(lv, "idle", 0), frame(lv, "idle", 1), frame(lv, "attack", 0), frame(lv, "attack", 1)]
        entries[key] = export(key, frames, HERE, {"idle": [0, 1], "attack": [2, 3]},
                              extra={"animFps": {"idle": 2, "attack": 8}})
    (HERE / "manifest_part.json").write_text(json.dumps(entries, indent=2))


if __name__ == "__main__":
    build()
