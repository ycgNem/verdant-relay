"""Spitter - rooted bulb plant. 32x36, faces right, base on bottom row.

Gnarled root ball with spread leaves, a thick ribbed stalk, and a fleshy pink/purple
bulb head with veins, a crown of thorns, and a fanged maw that glows red inside.
Anims: idle 2 (sway, glow pulse), windup 2 (swelling, veins light up), attack 2 (spit).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "player"))
from charkit import Canvas, export, limb_mask, shade_mask  # noqa: E402

W, H = 32, 36


def new():
    return Canvas(W, H)


ROOTS = [
    # y26.. ; x origin 3. Leaves fan out, roots claw into the ground.
    "..........32.......334.......",
    "...334...3221.....3443.......",
    "..34432..3221....34432..3....",
    ".3443221.3211...344321.343...",
    "3443221..1211..3443221.3432..",
    "4432211.nab11.3443211.34321..",
    "3321...nabbaan32211...3321...",
    ".....nnabbbaaaan........1....",
    "...nnaanbbaabnaann...........",
    ".naan.nab.nabn..naan.........",
]


def roots(c):
    c.stamp(ROOTS, 3, 26)
    # root tips gripping the ground
    for x, y, s in [(2, 35, "nn"), (21, 35, "nan"), (10, 35, "n"), (15, 35, "n")]:
        c.seg(x, y, s)


def stalk(c, top_x, top_y):
    pts = [(14, 33), (13, 29), (top_x - 1, top_y + 4), (top_x, top_y)]
    m = limb_mask(pts, [5, 5, 4, 4])
    shade_mask(c, m, "1", "2", "3", edge="1")
    # ribs across the stalk
    for (x, y) in sorted(m):
        if y % 3 == 0 and (x + 1, y) in m and (x - 1, y) in m:
            c.px(x, y, "1")


def bulb(c, cx, cy, rx, ry, mouth=1, glow=0, veins_lit=False):
    x0, y0, x1, y1 = cx - rx, cy - ry, cx + rx, cy + ry
    # sepals cupping the bottom of the bulb
    c.poly([(cx - rx + 1, cy + 2), (cx - 3, cy + ry + 3), (cx + 2, cy + ry + 2), (cx + rx - 2, cy + 3)], "2")
    c.poly([(cx - rx + 2, cy + 3), (cx - 3, cy + ry + 2), (cx - 1, cy + ry)], "3")
    # flesh
    c.ellipse(x0, y0, x1, y1, "p")
    c.ellipse(x0, y0 - 1, x1 - 1, y1 - 2, "P", only="opaque")
    c.ellipse(x0 + 2, y0, x1 - 8, y1 - 8, "k", only="opaque")
    # mottled spots like a pitcher plant
    for (sx, sy) in [(-4, -1), (-6, 1), (-3, 3), (-5, 4), (-1, 4), (1, -4), (-2, -5)]:
        c.px(cx + sx, cy + sy, "p", only="opaque")
    c.px(x0 + 4, y0 + 2, "S", only="opaque")
    c.px(x0 + 5, y0 + 2, "S", only="opaque")
    # veins
    vein = "E" if veins_lit else "p"
    for (ax, ay, bx, by) in [(cx - 2, cy - 1, cx - 6, cy - 5), (cx - 2, cy + 1, cx - 7, cy + 3),
                             (cx - 1, cy - 2, cx - 1, cy - 6), (cx - 4, cy - 3, cx - 7, cy - 2)]:
        c.line(ax, ay, bx, by, vein, only="opaque")
    # crown of thorns along the top
    for k, (tx, ty) in enumerate([(cx - 5, y0 + 1), (cx - 2, y0), (cx + 1, y0), (cx + 4, y0 + 1)]):
        c.px(tx, ty - 1, "p")
        c.px(tx - (1 if k < 2 else 0), ty - 2, "n")
    # maw: wedge cut into the right side, hinge near the centre
    hx, hy = cx + 1, cy + 1
    ex = x1 + 2
    a = mouth
    c.poly([(hx, hy), (ex, hy - a - 1), (ex, hy + a + 1)], "n")
    if a >= 2:
        c.poly([(hx + 1, hy), (ex - 2, hy - a + 1), (ex - 2, hy + a - 1)], "R")
        glowc = ["e", "E", "k"][min(glow, 2)]
        c.px(hx + 2, hy, glowc)
        c.px(hx + 3, hy, glowc)
        c.px(hx + 3, hy - 1, "e")
        c.px(hx + 3, hy + 1, "e")
    else:
        c.line(hx + 1, hy, ex - 1, hy, "R" if glow == 0 else "e")
    # lips (lit upper lip) + fangs
    c.line(hx, hy - 1, ex + 1, hy - a - 2, "P")
    c.line(hx + 1, hy - 2, ex + 1, hy - a - 3, "k")
    c.line(hx, hy + 1, ex + 1, hy + a + 2, "p")
    c.line(hx + 1, hy + 2, ex, hy + a + 3, "P")
    for k in range(hx + 2, ex + 1, 2):
        t = (k - hx) / (ex - hx)
        uy = round(hy - (a + 1) * t)
        ly = round(hy + (a + 1) * t)
        c.px(k, uy, "C")
        if a >= 2:
            c.px(k, uy + 1, "C")
        c.px(k + 1 if a < 2 else k, ly if a >= 2 else ly, "C")
        if a >= 2:
            c.px(k, ly - 1, "C")


def glob(c, x, y, big=True):
    if big:
        c.seg(x, y - 1, ".kE.")
        c.seg(x, y, "kEEe")
        c.seg(x, y + 1, ".eeR")
        c.px(x - 1, y + 1, "e")
    else:
        c.seg(x, y, "kE")
        c.seg(x, y + 1, "eR")


def plant(sway=0, swell=0, mouth=1, glow=0, veins=False, recoil=0):
    c = new()
    roots(c)
    cx, cy = 15 + sway - recoil, 13 - swell // 2
    stalk(c, cx - 1, cy + 6)
    bulb(c, cx, cy, 8 + swell, 7 + swell, mouth, glow, veins)
    return c


def frame_idle(i):
    c = plant(sway=i, mouth=1 + i, glow=i)
    return c.outline()


def frame_windup(i):
    # swelling: bulb inflates, maw clamps shut, veins light up with the charge
    c = plant(sway=-1, swell=1 + i, mouth=0, glow=1 + i, veins=i == 1, recoil=0)
    return c.outline()


def frame_attack(i):
    if i == 0:
        c = plant(sway=1, mouth=4, glow=2, recoil=-1)
        c.outline()
        glob(c, 27, 14)
        for x, y in [(26, 11), (27, 17), (29, 12)]:
            c.px(x, y, "k")
    else:
        c = plant(sway=0, mouth=3, glow=1)
        c.outline()
        glob(c, 29, 13, big=False)
        c.px(25, 19, "e")   # drool
        c.px(25, 20, "R")
    return c


frames = [frame_idle(i) for i in range(2)] + [frame_windup(i) for i in range(2)] + [frame_attack(i) for i in range(2)]
anims = {"idle": [0, 1], "windup": [2, 3], "attack": [4, 5]}
anim_fps = {"idle": 3, "windup": 5, "attack": 8}
export("spitter", frames, anims, anim_fps=anim_fps, here=HERE)
