"""Scav — rival scavenger. 32x40, faces right, feet on bottom row.

Red bandana tied over the head (tails trailing), stubbled scowling face, dark plum
duster with popped collar, brass-studded bandolier, black boots, long scoped rifle.
Anims: idle 2, walk 4, windup 1 (aiming, red scope glint), attack 2 (firing).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "player"))
from charkit import Canvas, export, limb_mask, shade_mask  # noqa: E402

W, H = 32, 40


def new():
    return Canvas(W, H)


# ---------------------------------------------------------------------------
# Head
# ---------------------------------------------------------------------------

def head(c, ox, oy, tail=0, aim=False):
    rows = [
        "......RReeR.....",   # y4  bandana crown
        "....ReeekkeR....",   # y5  lit top-left
        "...ReeekkeeeR...",   # y6
        "..ReeeeeeeeeeR..",   # y7
        ".RReeeeeRRRRRRR.",   # y8  band edge over the brow
        "...nnabSS#Ss#s..",   # y9  eyes under a heavy brow
        "...nnabSSSsbsSs.",   # y10 nose
        "....nabsSSsbab..",   # y11 mouth
        ".....nabsssaab..",   # y12 stubbled jaw
        "......naabaa....",   # y13 chin / neck
    ]
    if aim:
        # squinting down the scope: near eye shut, brow pulled down
        rows[5] = "...nnabSaaSs#s.."
    c.stamp(rows, 7 + ox, 4 + oy)
    # knot + tails at the back of the head (secondary motion)
    tails = [
        [(7, 8, "Re"), (6, 9, "eR"), (6, 10, "R"), (7, 10, "e"), (6, 11, "R")],
        [(7, 8, "Re"), (5, 9, "eeR"), (4, 10, "eR"), (6, 10, "e")],
        [(7, 8, "Re"), (4, 9, "keeR"), (2, 10, "eeR"), (5, 10, "R")],
    ][tail]
    for x, y, s in tails:
        c.seg(x + ox, y + oy, s)


# ---------------------------------------------------------------------------
# Torso: duster coat, collar, bandolier
# ---------------------------------------------------------------------------

def torso(c, ox, oy):
    rows = [
        # x9
        ".pp#aabba#pp...",    # y13 popped collar around the neck
        "pppnnMMnnFnpp..",    # y14 shoulders lit, shirt, bandolier starts
        "ppnnnmMnFaannpn",    # y15
        "pnnnnmmFannnnnn",    # y16
        "pnnnnmFannnnnjn",    # y17
        "pnnnnFannmnnnjn",    # y18
        "nnnnFanjmmnnnj.",    # y19
        "nnnaannjmmnnnj.",    # y20
        "naaaaaaaaaaaaj.",    # y21 belt
        "nnnnFnnjMjnnnj.",    # y22 holster / buckle
    ]
    c.stamp(rows, 9 + ox, 13 + oy)


def coat_skirt(c, ox, oy, flare=0):
    """Duster below the belt: back panel flares out behind with the walk."""
    b = 23 + oy
    hem = 31 + oy
    back = [(9 + ox, b), (16 + ox, b), (15 + ox, hem), (7 + ox - flare, hem), (8 + ox - flare // 2, b + 4)]
    c.poly(back, "n")
    # lit fold on the back panel, shadow crease
    c.line(9 + ox, b, 8 + ox - flare, hem - 1, "p")
    c.line(12 + ox, b + 1, 11 + ox - flare // 2, hem, "j")
    front = [(16 + ox, b), (21 + ox, b), (22 + ox, hem - 1), (17 + ox, hem)]
    c.poly(front, "n")
    c.line(16 + ox, b, 17 + ox, hem, "j")       # front opening
    c.line(17 + ox, b, 18 + ox, hem - 1, "p")   # lit lapel edge
    c.line(21 + ox, b, 22 + ox, hem - 1, "j")


# ---------------------------------------------------------------------------
# Legs (dark trousers, black boots)
# ---------------------------------------------------------------------------

BOOTS = {
    "flat": ["#Jj...", "#JjjMj.", "#jjjjjj", "#######"],
    "toe":  ["#Jj..", "#Jjj.", ".#Jjj", ".#jjjj", "..####"],
    "heel": ["#Jj....", "#JjjMjj", "#jjjjj.", "####..."],
    "lift": ["#Jj...", "#JjjMj.", "#jjjjjj", ".######"],
}


def leg(c, hip, knee, ankle, far=False):
    if far:
        m = limb_mask([hip, knee, ankle], [4, 3, 3])
        shade_mask(c, m, "#", "j", "j")
    else:
        m = limb_mask([hip, knee, ankle], [4, 4, 3])
        shade_mask(c, m, "j", "j", "J", edge="#")
        c.px(knee[0] - 1, knee[1], "m", only="opaque")


def legs(c, far, near):
    leg(c, *far[:3], far=True)
    rows = BOOTS[far[3]]
    rows = [r.replace("M", "J").replace("J", "j") for r in rows]
    c.stamp(rows, far[2][0] - 1, far[2][1] + 1)
    leg(c, *near[:3])
    c.stamp(BOOTS[near[3]], near[2][0] - 1, near[2][1] + 1)


# ---------------------------------------------------------------------------
# Rifle — long scoped bolt rifle, drawn along a straight line from butt to muzzle
# ---------------------------------------------------------------------------

def rifle(c, x0, y0, x1, y1, scope_col="J"):
    n = max(abs(x1 - x0), abs(y1 - y0))
    pts = [(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)) for i in range(n + 1)]
    L = len(pts)
    for i, (x, y) in enumerate(pts):
        t = i / (L - 1)
        if t < 0.30:          # wooden stock, 3 tall, lit top
            c.px(x, y - 1, ("c" if i % 3 == 1 else "b") if i > 0 else "a")
            c.px(x, y, "a" if t > 0.08 else "n")
            c.px(x, y + 1, "n")
            if t < 0.12:
                c.px(x, y + 2, "n")
        elif t < 0.50:        # receiver
            c.px(x, y - 1, "M")
            c.px(x, y, "J")
            c.px(x, y + 1, "j")
        elif t < 0.68:        # wooden forend over the barrel
            c.px(x, y - 1, "b")
            c.px(x, y, "a")
            c.px(x, y + 1, "n")
        else:                 # bare barrel
            c.px(x, y - 1, "L" if i % 4 else "M")
            c.px(x, y, "j")
    # scope on the receiver
    i0, i1 = int(L * 0.31), int(L * 0.50)
    for i in range(i0, i1):
        x, y = pts[i]
        c.px(x, y - 2, "J" if i > i0 else "j")
        if i not in (i0, i1 - 1):
            c.px(x, y - 3, "j")
    xs, ys = pts[i1 - 1]
    c.px(xs + 1, ys - 2, scope_col)       # front lens
    # bolt handle + magazine
    xb, yb = pts[int(L * 0.40)]
    c.px(xb, yb + 2, "M")
    xm, ym = pts[int(L * 0.44)]
    c.px(xm, ym + 2, "j")
    c.px(xm + 1, ym + 2, "j")
    return pts


# ---------------------------------------------------------------------------
# Arms
# ---------------------------------------------------------------------------

def arm(c, pts, widths, hand):
    m = limb_mask(pts, widths)
    shade_mask(c, m, "n", "p", "p", edge="#")
    hx, hy = hand
    c.seg(hx - 1, hy, "a")   # leather cuff
    c.seg(hx, hy, "sS")
    c.seg(hx, hy + 1, "bs")


# ---------------------------------------------------------------------------
# Poses
# ---------------------------------------------------------------------------

def stand_legs(c):
    legs(c, ((13, 26), (12, 31), (12, 34), "flat"), ((18, 26), (18, 31), (18, 34), "flat"))


def body(c, bob=0, tail=0, flare=0, legs_fn=None, pose="carry", head_dx=0, recoil=0):
    """pose: carry (rifle low across the body, muzzle down-right) | aim | fire."""
    # far arm behind the body first
    if pose == "carry":
        arm(c, [(11, 15 + bob), (11, 19 + bob), (14, 22 + bob)], [3, 3, 3], (14, 22 + bob))
    if legs_fn:
        legs_fn(c)
    coat_skirt(c, 0, bob, flare)
    torso(c, 0, bob)
    head(c, head_dx, bob, tail, aim=pose != "carry")
    if pose == "carry":
        rifle(c, 13, 20 + bob, 29, 29 + bob, scope_col="e")
        arm(c, [(19, 14 + bob), (20, 18 + bob), (19, 22 + bob)], [4, 3, 3], (18, 22 + bob))
    else:
        r = -recoil
        # far arm reaches across the chest to the forend (under the rifle)
        arm(c, [(15, 18), (19, 20), (23 + r, 18)], [3, 3, 3], (23 + r, 17))
        rifle(c, 10 + r, 16, 27 + r, 16, scope_col="E")
        # near arm: shoulder down to the grip, elbow tucked
        arm(c, [(19, 14), (19, 16), (18 + r, 17)], [4, 4, 3], (17 + r, 17))


def frame_idle(i):
    c = new()
    body(c, bob=i, tail=0, legs_fn=stand_legs)
    return c.outline()


WALK = [
    (1, ((13, 27), (12, 31), (10, 33), "toe"), ((18, 27), (20, 31), (21, 34), "heel"), 1, 1),
    (0, ((13, 26), (14, 30), (14, 32), "lift"), ((18, 26), (18, 31), (17, 34), "flat"), 2, 2),
    (1, ((13, 27), (15, 31), (16, 34), "heel"), ((18, 27), (17, 31), (15, 33), "toe"), 1, 1),
    (0, ((13, 26), (12, 31), (12, 34), "flat"), ((18, 26), (19, 30), (19, 32), "lift"), 2, 2),
]


def frame_walk(i):
    bob, far, near, tail, flare = WALK[i]
    c = new()
    body(c, bob=bob, tail=tail, flare=flare, legs_fn=lambda cc: legs(cc, far, near))
    return c.outline()


def frame_windup():
    c = new()
    body(c, pose="aim", legs_fn=stand_legs, head_dx=1)
    c.outline()
    # scope glint telegraph: bright red lens + sparkle
    for x, y, ch in [(23, 13, "E"), (23, 12, "e"), (22, 13, "e"), (24, 13, "e"), (23, 14, "e")]:
        c.px(x, y, ch)
    return c


def flash(c, x, y, big=True):
    if big:
        pts = [(x, y - 1, "F"), (x, y, "w"), (x, y + 1, "F"),
               (x + 1, y - 2, "F"), (x + 1, y - 1, "y"), (x + 1, y, "w"), (x + 1, y + 1, "y"), (x + 1, y + 2, "F"),
               (x + 2, y - 1, "F"), (x + 2, y, "y"), (x + 2, y + 1, "F"), (x + 3, y, "F"),
               (x + 2, y - 3, "F"), (x + 2, y + 3, "F")]
    else:
        pts = [(x, y - 1, "M"), (x + 1, y - 2, "L"), (x + 1, y - 1, "M"), (x + 2, y - 3, "M")]
    for px_, py_, ch in pts:
        c.px(px_, py_, ch)


def frame_attack(i):
    c = new()
    body(c, pose="fire", legs_fn=stand_legs, head_dx=i, recoil=1 - i)
    c.outline()
    if i == 0:
        flash(c, 27, 17)
        c.px(18, 13, "F")   # ejected brass
    else:
        flash(c, 28, 17, big=False)
        c.px(16, 11, "F")
    return c


frames = ([frame_idle(i) for i in range(2)] + [frame_walk(i) for i in range(4)] +
          [frame_windup()] + [frame_attack(i) for i in range(2)])
anims = {"idle": [0, 1], "walk": [2, 3, 4, 5], "windup": [6], "attack": [7, 8]}
anim_fps = {"idle": 3, "walk": 9, "attack": 10}
export("scav", frames, anims, anim_fps=anim_fps, here=HERE)
