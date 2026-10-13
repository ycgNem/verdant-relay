"""Bramble Crawler — thorny vine-beast on four root legs. 32x28, faces right, feet on bottom row.

Twisted green vine body, overlapping bark plates down the spine, dark-red thorns,
gnarled root legs with claw tips, a wooden jaw lined with thorn teeth, glowing red eyes.
Anims: idle 2, walk 4, windup 1 (coiled crouch), attack 2 (lunge + bite).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "player"))
from charkit import Canvas, export, limb_mask, shade_mask  # noqa: E402

W, H = 32, 28
GROUND = 26


def new():
    return Canvas(W, H)


HEAD = {
    # tapered wooden snout: bark brow over sunken glowing eyes, thorn teeth
    "closed": [
        ".nnaa......",
        "nabbbaa....",
        "abccbbbaa..",
        "aEEnaEnbaa.",
        "naabbaabbbn",
        ".naabbaabbn",
        "..CnCnCnCn.",
        "..naaaaan..",
        "...nnnn....",
    ],
    "open": [
        ".nnaa......",
        "nabbbaa....",
        "abccbbbaa..",
        "aEEnaEnbaa.",
        "naabbaabbbn",
        ".naabbaaabbn",
        "..CnCnCnCnC",
        "..RReeeeRR.",
        "..RReeeRR..",
        "..CnCnCnC..",
        "...naaaan..",
        "....nnnn...",
    ],
    "glare": [
        ".nnaa......",
        "nabbbaa....",
        "abccbbbaa..",
        "yEEnyEEbaa.",
        "naabbaabbbn",
        ".naabbaabbn",
        "..CnCnCnCn.",
        "..naaaaan..",
        "...nnnn....",
    ],
}

PLATE = [
    ".naan.",
    "nabcba",
    "nabbba",
    ".nnaa.",
]


def leg(c, hip, knee, foot, far=False):
    m = limb_mask([hip, knee, foot], [4, 3, 2])
    if far:
        shade_mask(c, m, "#", "n", "a")
    else:
        shade_mask(c, m, "n", "a", "b", edge="#")
        # vine wrapped round the upper leg
        c.px(knee[0], knee[1] - 2, "3", only="opaque")
        c.px(knee[0] - 1, knee[1] - 1, "2", only="opaque")
    fx, fy = foot
    # claw toes splayed on the ground
    toe = "n" if far else "a"
    c.seg(fx - 1, fy + 1, toe + toe + toe)
    c.px(fx + 2, fy + 1, "C" if not far else "a")


def body(c, bx, by, squash=0):
    x0, y0, x1, y1 = 4 + bx, 9 + by + squash, 19 + bx, 19 + by
    c.ellipse(x0, y0, x1, y1, "1")
    c.ellipse(x0, y0 - 1, x1 - 1, y1 - 1, "2", only="opaque")
    c.ellipse(x0 + 1, y0 - 1, x1 - 7, y1 - 5, "3", only="opaque")
    # twisted vine strands wrapping the body (cool shadow lines + lit ridges)
    for k in range(3):
        sx = x0 + 3 + k * 4
        c.line(sx, y1, sx + 3, y0 + 3, "1", only="opaque")
        c.line(sx - 1, y1 - 1, sx + 2, y0 + 3, "3", only="opaque")
    c.px(x0 + 3, y1 - 3, "4", only="opaque")
    c.px(x0 + 7, y1 - 4, "4", only="opaque")
    # belly shadow
    c.line(x0 + 3, y1, x1 - 3, y1, "1", only="opaque")
    # bark plates down the spine, overlapping back-to-front
    for k, (px_, py_) in enumerate([(5, 8), (9, 7), (12, 7), (15, 8)]):
        c.stamp(PLATE, px_ + bx, py_ + by + squash)
    # thorns jutting up and back from the plates
    for tx, ty, h in [(7, 8, 3), (11, 7, 4), (14, 7, 3), (17, 8, 2), (5, 11, 2)]:
        X, Y = tx + bx, ty + by + squash
        c.px(X, Y, "R")
        c.px(X, Y - 1, "R")
        if h >= 3:
            c.px(X - 1, Y - 2, "e")
        if h >= 4:
            c.px(X - 1, Y - 3, "R")
            c.px(X - 2, Y - 4, "e")
        if h == 2:
            c.px(X - 1, Y - 2, "e")


def tail(c, bx, by, phase=0):
    # whip of vine trailing from the rump, curling up
    pts = [
        [(4, 13), (2, 12), (1, 10), (2, 8), (3, 8)],
        [(4, 13), (2, 13), (1, 11), (1, 9), (2, 8)],
        [(4, 13), (2, 12), (2, 10), (3, 9), (4, 9)],
    ][phase]
    pts = [(max(1, x + bx), y + by) for x, y in pts]
    for (ax, ay), (bx2, by2) in zip(pts, pts[1:]):
        c.line(ax, ay, bx2, by2, "2")
    c.px(*pts[-1], "3")
    c.px(*pts[1], "3")


def creature(legs, bx=0, by=0, head="closed", hx=0, hy=0, tailp=0, squash=0):
    """legs: dict far_h, far_f, near_h, near_f -> (hip, knee, foot) in rest coords
    (hips move with the body)."""
    c = new()
    for k in ("far_h", "far_f"):
        leg(c, *legs[k], far=True)
    tail(c, bx, by, tailp)
    body(c, bx, by, squash)
    c.stamp(HEAD[head], 17 + bx + hx, 9 + by + hy + squash)
    for k in ("near_h", "near_f"):
        leg(c, *legs[k])
    return c


def L(hip, knee, foot, bx=0, by=0):
    return ((hip[0] + bx, hip[1] + by), knee, foot)


def rest_legs(bx=0, by=0):
    return {
        "far_h": L((8, 16), (6, 20), (6, 25), bx, by),
        "far_f": L((15, 16), (17, 20), (17, 25), bx, by),
        "near_h": L((9, 17), (8, 22), (9, 25), bx, by),
        "near_f": L((17, 17), (19, 21), (20, 25), bx, by),
    }


def frame_idle(i):
    c = creature(rest_legs(0, i), by=i, tailp=i, hy=0)
    return c.outline()


# walk: diagonal pairs (near-front + far-hind) then (far-front + near-hind)
STEP = {
    0: {"far_h": ((5, 21), (3, 25)), "near_f": ((21, 21), (23, 25)),
        "far_f": ((16, 20), (14, 25)), "near_h": ((10, 21), (11, 25))},
    1: {"far_h": ((6, 19), (6, 23)), "near_f": ((19, 20), (20, 25)),
        "far_f": ((17, 19), (17, 23)), "near_h": ((8, 22), (9, 25))},
    2: {"far_h": ((7, 21), (9, 25)), "near_f": ((18, 21), (17, 25)),
        "far_f": ((18, 20), (20, 25)), "near_h": ((7, 21), (6, 25))},
    3: {"far_h": ((6, 20), (6, 25)), "near_f": ((20, 19), (21, 23)),
        "far_f": ((17, 20), (17, 25)), "near_h": ((9, 20), (9, 23))},
}


def frame_walk(i):
    bob = [1, 0, 1, 0][i]
    base = rest_legs(0, bob)
    legs = {k: (base[k][0],) + STEP[i][k] for k in base}
    c = creature(legs, by=bob, tailp=[1, 2, 1, 0][i], hy=[0, 0, 1, 1][i] - bob + bob)
    return c.outline()


def frame_windup():
    # coiled: body pulled back and low, head down, eyes flaring
    bx, by = -2, 2
    legs = {
        "far_h": L((8, 16), (5, 21), (5, 25), bx, by),
        "far_f": L((15, 16), (18, 22), (19, 25), bx, by),
        "near_h": L((9, 17), (6, 22), (8, 25), bx, by),
        "near_f": L((17, 17), (20, 23), (22, 25), bx, by),
    }
    c = creature(legs, bx=bx, by=by, head="glare", hy=1, tailp=2, squash=1)
    return c.outline()


def frame_attack(i):
    if i == 0:
        # airborne lunge: stretched long, front legs reaching, jaw gaping
        bx, by = 3, -1
        legs = {
            "far_h": L((8, 16), (5, 20), (2, 23), bx, by),
            "far_f": L((15, 16), (21, 18), (25, 20), bx, by),
            "near_h": L((9, 17), (6, 22), (3, 25), bx, by),
            "near_f": L((17, 17), (23, 19), (26, 22), bx, by),
        }
        c = creature(legs, bx=bx, by=by, head="open", hx=-1, hy=-1, tailp=1)
    else:
        # landing bite: front claws planted, jaw snapping shut, body compressed
        bx, by = 2, 1
        legs = {
            "far_h": L((8, 16), (5, 20), (3, 25), bx, by),
            "far_f": L((15, 16), (20, 21), (22, 25), bx, by),
            "near_h": L((9, 17), (6, 22), (5, 25), bx, by),
            "near_f": L((17, 17), (22, 21), (24, 25), bx, by),
        }
        c = creature(legs, bx=bx, by=by, head="closed", hy=1, tailp=0, squash=1)
    c.outline()
    if i == 1:
        # bite snap streaks
        for x, y in [(30, 13), (30, 17), (29, 11)]:
            c.px(x, y, "w")
    return c


frames = ([frame_idle(i) for i in range(2)] + [frame_walk(i) for i in range(4)] +
          [frame_windup()] + [frame_attack(i) for i in range(2)])
anims = {"idle": [0, 1], "walk": [2, 3, 4, 5], "windup": [6], "attack": [7, 8]}
anim_fps = {"idle": 3, "walk": 10, "attack": 10}
export("crawler", frames, anims, anim_fps=anim_fps, here=HERE)
