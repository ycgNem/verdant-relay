"""burrower - mole-drill creature (32x28). idle 2, walk 4, burrowed 2.
Velvet-brown mole body with rusty salvage plates bolted to its back, a spinning
steel drill snout, big pale digging claws. `burrowed` = a travelling dirt mound with
only the drill tip spinning out of it and clods flying."""
import math
import os
from pathlib import Path
HERE = Path(__file__).resolve().parent
os.chdir(HERE)
from kit import *  # noqa: E402,F403
from pixelstudio import hex2rgba  # noqa: E402

W, H = 32, 28
s = new_sprite(W, H)
G = 26                                   # ground row (outline lands on 27)

# 5-step fur ramp (plain bark + a skin highlight): more of the body lands on tan/khaki so the
# #9fb4e8 night multiply doesn't crush it to mud; plum stays only in the deepest shadow
FUR = [E["plum"], E["brown"], E["tan"], E["khaki"], E["skin"]]
CLAW = [E["khaki"], E["peach"], E["cream"]]
DRILL = [E["ink"], E["steel"], E["slate"], E["grey"], E["silver"], E["white"]]
SOIL = [E["plum"], E["brown"], E["tan"], E["khaki"], E["peach"]]
PLATE = [E["plum"], E["brown"], E["rust"], E["clay"]]


def drill(bx, by, ax, ay, length, half, phase):
    """Cone from base centre (bx,by) along unit axis (ax,ay). Spiral grooves scroll with phase."""
    px_, py_ = -ay, ax                    # perpendicular (points 'up-left' for a right-pointing drill)
    x0, x1 = int(min(bx, bx + ax * length) - half - 1), int(max(bx, bx + ax * length) + half + 1)
    y0, y1 = int(min(by, by + ay * length) - half - 1), int(max(by, by + ay * length) + half + 1)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            qx, qy = x + 0.5 - bx, y + 0.5 - by
            u = qx * ax + qy * ay
            v = qx * px_ + qy * py_      # v>0 = left side of the axis
            if u < 0 or u > length:
                continue
            r = half * (1 - u / length) + 0.35
            if abs(v) > r:
                continue
            # light side = the side facing up/left
            lit = (-px_ * 0.0 + -py_) * v   # >0 when the pixel is on the upper side
            k = v / r if r > 0 else 0
            sv = -k if py_ > 0 else k
            if sv > 0.45:
                c = 4
            elif sv > 0.0:
                c = 3
            elif sv > -0.5:
                c = 2
            else:
                c = 1
            # spiral grooves
            if (u * 0.9 + v * 0.9 + phase) % 3.0 < 0.95:
                c = max(0, c - 2)
            s.px(x, y, DRILL[c])
    # bright specular glint near the tip on the lit edge
    tx, ty = bx + ax * (length * 0.55), by + ay * (length * 0.55)
    gx, gy = tx + px_ * half * 0.35 * (1 if py_ < 0 else -1), ty + py_ * half * 0.35 * (1 if py_ < 0 else -1)
    s.px(int(gx), int(gy), DRILL[5])


def collar(x, y0, y1):
    """Amber-banded drive collar at the drill base."""
    vl(s, x, y0, y1, E["clay"])
    vl(s, x + 1, y0, y1, E["rust"])
    s.px(x, y0 + 1, E["amber"])
    s.px(x, y0 + 2, E["amber"])
    s.px(x + 1, y1, E["brown"])
    s.px(x + 1, y1 - 1, E["brown"])


def mole(bob, phase, step):
    """Walking/idle body. step: 0 stand, 1..4 walk phases."""
    b = bob
    # hind leg (far) + front claw (far) first, darker
    hind = {0: (7, 0), 1: (5, 0), 2: (7, -1), 3: (9, 0), 4: (7, -1)}[step]
    front = {0: (20, 0), 1: (22, -1), 2: (20, 0), 3: (18, 0), 4: (20, 0)}[step]
    # far hind foot
    s.rect(hind[0] + 3, G - 2, hind[0] + 5, G, FUR[0])
    # body
    lit_ellipse(s, 12.5, 15.5 + b, 10.2, 6.8, FUR, bias=-0.05)
    # fur tufts on the belly line (texture) - short darker strokes
    # velvet fur: a few short strokes in the next-darker tone (follow the body curve)
    for (x, y) in ((6, 15), (7, 16), (10, 17), (11, 18), (5, 19), (14, 16)):
        c = s.get(x, y + b)
        if c is not None:
            darker = {hex2rgba(FUR[k])[:3]: FUR[k - 1] for k in range(1, len(FUR))}
            s.px(x, y + b, darker.get(c[:3], c))
    # tail nub
    pxs(s, [(2, 17 + b), (3, 17 + b), (2, 18 + b)], FUR[1])
    s.px(2, 17 + b, FUR[2])
    # rusty salvage plates on the back, overlapping like shingles
    plates = [(4, 10, 9, 13), (8, 8, 14, 11), (13, 9, 18, 12)]
    for i, (x0, y0, x1, y1) in enumerate(plates):
        y0 += b
        y1 += b
        s.rect(x0, y0 + 1, x1, y1, PLATE[2])
        hl(s, x0 + 1, x1 - 1, y0, PLATE[2])
        hl(s, x0 + 1, x1 - 1, y0 + 1, PLATE[3])            # lit top edge
        hl(s, x0, x1, y1, PLATE[0])                        # shadow lip under the plate
        vl(s, x1, y0 + 1, y1, PLATE[1])
        s.px(x0 + 1, y0 + 2, E["silver"] if i != 1 else E["grey"])     # rivets
        s.px(x1 - 1, y0 + 2, E["grey"])
        if i == 1:
            s.px(x0 + 3, y1 - 1, E["brown"])               # rust pit
            s.px(x0 + 4, y1 - 1, PLATE[1])
    # head: rounded snout block in front of the body
    lit_ellipse(s, 19.0, 15.5 + b, 3.8, 4.4, FUR, bias=0.0)
    # tiny glowing eye + brow ridge
    s.px(19, 13 + b, E["hot"])
    s.px(20, 13 + b, E["red"])
    s.px(19, 12 + b, FUR[0])
    s.px(20, 12 + b, FUR[0])
    # whisker bristles
    s.px(21, 19 + b, FUR[3])
    s.px(20, 20 + b, FUR[2])
    # drill collar + drill
    collar(21, 11 + b, 19 + b)
    drill(23, 15.5 + b, 1, 0, 7.4, 4.3, phase)
    # front digging arm + big pale claws (near side, separated by a selout edge)
    fx, lift = front
    ty = G + lift

    def arm():
        lit_limb(s, 17, 18 + b, fx, ty - 2, 2.4, 1.9, FUR[1:], bias=0.0)
    part(s, arm, edge=FUR[0], edge_sides=("down", "right"))
    # talons: two big hooked claws + one on the ground, gaps between them
    for (row, x0, n) in ((ty - 3, fx + 1, 3), (ty - 1, fx + 1, 3), (ty, fx - 1, 2)):
        hl(s, x0, x0 + n - 1, row, CLAW[1])
        s.px(x0, row, CLAW[2])
        s.px(x0 + n, row + 1 if row < G else row, CLAW[0])
    # near hind leg
    hx, hl_ = hind
    part(s, lambda: lit_limb(s, 8, 19 + b, hx, G - 1 + hl_, 2.6, 1.4, FUR[1:], bias=0.0),
         edge=FUR[0], edge_sides=("down", "right"))
    pxs(s, [(hx, G + hl_), (hx + 1, G + hl_), (hx + 2, G + hl_)], CLAW[0])


def mound(phase, lump, spray):
    """Travelling dirt mound with the drill tip spinning out of its front-top."""
    # base: wide low hump
    pts = []
    for y in range(12, G + 1):
        for x in range(2, 30):
            nx = (x + 0.5 - 15.5 - lump * 0.5) / 13.5
            ny = (y + 0.5 - (G + 1)) / (11.5 - abs(nx) * 2)
            if nx * nx + ny * ny <= 1.0:
                pts.append((x, y))
    lit_mask(s, pts, 14.0, G - 3, 13.5, 11, SOIL, bias=-0.08)
    ptset = set(pts)
    # crumbly clods texture: little 2px lumps, dark under-shadow
    import random
    rnd = random.Random(11 + lump)
    for _ in range(26):
        x, y = rnd.randint(4, 27), rnd.randint(15, G - 1)
        if (x, y) in ptset and (x + 1, y + 1) in ptset:
            c = s.get(x, y)[:3]
            light = c in ((194, 133, 105), (232, 183, 150))
            s.px(x, y, SOIL[4] if light else SOIL[3])
            s.px(x + 1, y + 1, SOIL[1] if light else SOIL[0])
    # embedded pebbles + a buried bolt
    for (x, y, c) in [(8, 22, E["slate"]), (9, 22, E["grey"]), (21, 23, E["steel"]), (22, 23, E["slate"]),
                      (13, 19, E["grey"])]:
        if (x, y) in ptset:
            s.px(x, y, c)
    # ripped grass tufts riding on the mound (it pushed up turf)
    for (x, y) in [(6, 18), (24, 17)]:
        pxs(s, [(x, y), (x + 1, y - 1), (x + 2, y)], E["green"])
        s.px(x + 1, y, E["forest"])
        s.px(x + 1, y - 1, E["lime"])
    # broken earth crater at the front-top where the drill pokes out
    cx = 20 + lump
    s.ellipse(cx - 3, 13, cx + 3, 17, E["plum"])
    hl(s, cx - 2, cx + 2, 13, SOIL[3])
    # drill tip poking out, angled up-forward
    a = math.radians(-58)
    drill(cx + 0.5, 15.5, math.cos(a), math.sin(a), 8.0, 3.0, phase)
    # flying clods (solid, no alpha) - alternate arcs per frame
    clods = [[(26, 7), (27, 12), (14, 10), (11, 14)], [(23, 4), (12, 12), (28, 9), (16, 7)]][spray]
    for (x, y) in clods:
        s.px(x, y, SOIL[2])
        s.px(x + 1, y, SOIL[1])
        if (x + y) % 2:
            s.px(x, y + 1, SOIL[1])


def frame(i, ms, **kw):
    new_frame(s, i)
    if kw.get("mound"):
        mound(kw["phase"], kw["lump"], kw["spray"])
    else:
        mole(kw["bob"], kw["phase"], kw["step"])
    finish(s)
    s.frames[i - 1].duration = ms


frame(1, 220, bob=0, phase=0.0, step=0)
frame(2, 220, bob=1, phase=1.5, step=0)
frame(3, 110, bob=0, phase=0.0, step=1)
frame(4, 110, bob=-1, phase=1.0, step=2)
frame(5, 110, bob=0, phase=2.0, step=3)
frame(6, 110, bob=-1, phase=0.5, step=4)
frame(7, 100, mound=True, phase=0.0, lump=0, spray=0)
frame(8, 100, mound=True, phase=1.5, lump=1, spray=1)

s.stats()
check(s, "burrower")
export(s, "burrower", {"idle": [0, 1], "walk": [2, 3, 4, 5], "burrowed": [6, 7]}, fps=8,
       anim_fps={"idle": 5, "walk": 9, "burrowed": 10}, scale=8, here=HERE)
