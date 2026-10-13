"""survivor - stranded engineer NPC (32x40). idle 2 = waving a yellow light stick.
Faces right, light from the top-left, Endesga-32, #181425 outer outline."""
import os
from pathlib import Path
HERE = Path(__file__).resolve().parent
os.chdir(HERE)
from kit import *  # noqa: E402,F403

W, H = 32, 40
s = new_sprite(W, H)

HAT = [E["clay"], E["orange"], E["amber"], E["yellow"]]
SKIN = [E["brown"], E["tan"], E["skin"], E["peach"]]
SHIRT = [E["plum"], E["wine"], E["rust"], E["clay"]]
OVR = [E["ink"], E["navy"], E["blue"]]
BOOT = [E["out"], E["plum"], E["brown"], E["tan"]]
BOX = [E["plum"], E["wine"], E["red"], E["pink"]]


def body(bob=0, box_swing=0):
    b = bob
    # ---------- far (back) arm hanging, holding a red toolbox ----------
    rect = s.rect
    rect(8, 17 + b, 10, 22 + b, SHIRT[1])          # sleeve, shadowed (behind body)
    vl(s, 8, 17 + b, 21 + b, SHIRT[2])
    rect(8, 23 + b, 10, 26 + b, SKIN[1])           # forearm
    vl(s, 8, 23 + b, 25 + b, SKIN[2])
    rect(8, 27 + b, 10, 28 + b, E["slate"])        # glove
    # toolbox
    bx = 4 + box_swing
    rect(bx + 1, 28 + b, bx + 7, 28 + b, E["steel"])   # handle
    rect(bx, 29 + b, bx + 8, 34 + b, BOX[2])
    rect(bx, 33 + b, bx + 8, 34 + b, BOX[1])
    hl(s, bx, bx + 8, 29 + b, BOX[3])
    vl(s, bx + 8, 30 + b, 34 + b, BOX[1])
    hl(s, bx, bx + 8, 31 + b, BOX[0])               # lid seam
    s.px(bx + 4, 31 + b, E["silver"])               # latch
    s.px(bx + 4, 32 + b, E["grey"])
    hl(s, bx + 1, bx + 2, 30 + b, E["peach"])       # specular
    # ---------- legs ----------
    rect(11, 27, 14, 34, OVR[0])                    # far leg (in shadow)
    vl(s, 11, 27, 33, OVR[1])
    rect(15, 27, 18, 34, OVR[1])                    # near leg
    vl(s, 15, 27, 34, OVR[2])
    vl(s, 18, 28, 34, OVR[0])
    s.px(16, 31, OVR[0])                            # knee patch seam
    rect(16, 30, 17, 32, OVR[1])
    hl(s, 16, 17, 30, OVR[2])
    # boots
    rect(10, 35, 14, 37, BOOT[1])
    hl(s, 10, 13, 35, BOOT[2])
    rect(15, 35, 20, 37, BOOT[2])
    hl(s, 15, 19, 35, BOOT[3])
    vl(s, 20, 36, 37, BOOT[1])
    hl(s, 10, 14, 38, BOOT[0])
    hl(s, 15, 20, 38, BOOT[0])
    s.px(19, 36, BOOT[3])                           # toe cap shine
    # ---------- torso ----------
    rect(10, 15 + b, 19, 26 + b, SHIRT[2])          # shirt
    rect(17, 18 + b, 19, 26 + b, SHIRT[1])          # shadow side (right)
    hl(s, 11, 17, 15 + b, SHIRT[3])                 # lit shoulders
    pxs(s, [(12, 18 + b), (12, 20 + b)], SHIRT[1])  # flannel check
    # overall bib + pants top
    rect(11, 18 + b, 18, 26 + b, OVR[1])
    rect(12, 19 + b, 15, 22 + b, OVR[2])            # lit bib panel
    rect(16, 19 + b, 18, 26 + b, OVR[0])
    vl(s, 11, 18 + b, 26 + b, OVR[2])
    rect(13, 20 + b, 15, 21 + b, OVR[1])            # bib pocket
    hl(s, 13, 15, 20 + b, OVR[0])
    s.px(14, 22 + b, E["silver"])                   # pen in pocket
    # straps
    vl(s, 12, 15 + b, 17 + b, OVR[2])
    vl(s, 17, 15 + b, 17 + b, OVR[1])
    s.px(12, 18 + b, E["amber"])                    # buttons
    s.px(17, 18 + b, E["clay"])
    # tool belt
    hl(s, 10, 19, 25 + b, BOOT[2])
    hl(s, 10, 19, 26 + b, BOOT[1])
    s.px(14, 25 + b, E["amber"])                    # buckle
    s.px(14, 26 + b, E["orange"])
    rect(18, 25 + b, 20, 28 + b, BOOT[2])           # pouch on hip
    hl(s, 18, 20, 25 + b, BOOT[3])
    vl(s, 20, 26 + b, 28 + b, BOOT[1])
    vl(s, 11, 26 + b, 29 + b, E["grey"])            # wrench hanging
    s.px(10, 29 + b, E["grey"])
    s.px(12, 29 + b, E["slate"])
    s.px(11, 30 + b, E["out"])
    # neck
    rect(14, 14 + b, 16, 15 + b, SKIN[1])


def head(dy=0):
    y = dy
    # hair / back of head
    s.rect(10, 9 + y, 12, 13 + y, E["brown"])
    s.px(10, 13 + y, E["plum"])
    # face
    s.rect(13, 9 + y, 19, 14 + y, SKIN[2])
    s.px(20, 11 + y, SKIN[2])                       # nose
    s.px(20, 12 + y, SKIN[1])
    hl(s, 13, 19, 9 + y, SKIN[1])                   # brim shadow on brow
    s.rect(13, 10 + y, 13, 12 + y, SKIN[1])         # ear
    s.px(13, 11 + y, SKIN[0])
    s.px(16, 11 + y, E["out"])                      # eyes
    s.px(19, 11 + y, E["out"])
    s.px(15, 10 + y, E["brown"])                    # brows
    s.px(18, 10 + y, E["brown"])
    hl(s, 15, 19, 14 + y, E["tan"])                 # stubble jaw
    pxs(s, [(16, 14 + y), (18, 14 + y)], E["brown"])
    s.px(18, 13 + y, SKIN[0])                       # mouth
    s.px(14, 13 + y, SKIN[1])                       # cheek / jaw shade
    s.px(17, 12 + y, SKIN[3])                       # cheek light
    # hard hat
    hl(s, 12, 17, 3 + y, HAT[2])
    hl(s, 11, 18, 4 + y, HAT[2])
    s.rect(10, 5 + y, 19, 7 + y, HAT[2])
    pxs(s, [(13, 3 + y), (14, 3 + y), (12, 4 + y), (13, 4 + y), (11, 5 + y), (12, 5 + y)], HAT[3])
    vl(s, 15, 4 + y, 7 + y, HAT[3])                 # centre ridge
    vl(s, 16, 4 + y, 7 + y, HAT[1])
    s.rect(17, 6 + y, 19, 7 + y, HAT[1])            # shadow side
    s.px(18, 5 + y, HAT[1])
    hl(s, 9, 21, 8 + y, HAT[1])                     # brim
    hl(s, 9, 14, 8 + y, HAT[2])
    s.px(21, 8 + y, HAT[0])
    s.px(19, 6 + y, E["white"])                     # headlamp
    s.px(19, 7 + y, E["cyan"])


def wave_arm(hand, tilt):
    """Raised front arm. hand=(x,y) of the glove, tilt=-1 (stick leans left) or +1."""
    hx, hy = hand
    sx, sy = 18, 16
    ex, ey = (sx + hx) // 2 + 2, (sy + hy) // 2 + 1        # elbow
    # upper arm (sleeve), 2px thick
    for ox in (0, 1):
        s.line(sx + ox, sy, ex + ox, ey, SHIRT[2])
    s.line(sx + 1, sy + 1, ex + 1, ey + 1, SHIRT[1])
    s.px(sx, sy, SHIRT[3])
    # forearm (skin)
    for ox in (0, 1):
        s.line(ex + ox, ey, hx + ox, hy + 1, SKIN[2])
    s.line(ex + 1, ey + 1, hx + 1, hy + 2, SKIN[1])
    # rolled cuff
    s.px(ex, ey, SHIRT[3])
    s.px(ex + 1, ey, SHIRT[2])
    # glove
    s.rect(hx - 1, hy - 1, hx + 1, hy + 1, E["slate"])
    s.px(hx - 1, hy - 1, E["grey"])
    # light stick: 2px wide, 8 long, leaning by `tilt` px per px of rise
    pts = []
    for k in range(1, 9):
        pts.append((hx + round(tilt * k), hy - 1 - k))
    for (x, y) in pts:
        s.px(x, y, E["amber"])
        s.px(x + 1, y, E["yellow"])
    for (x, y) in pts[-4:]:
        s.px(x + 1, y, E["white"])
    tx, ty = pts[-1]
    s.px(tx, ty, E["yellow"])
    s.px(hx, hy - 1, E["steel"])                    # stick grip cap
    s.px(hx + 1, hy - 1, E["slate"])
    return pts


def sparkle(pts, side):
    """Two solid glow motes trailing behind the stick tip (motion trail)."""
    tx, ty = pts[-1]
    for (dx, dy, c) in [(-3 * side, 2, E["yellow"]), (-4 * side, 4, E["amber"])]:
        x, y = tx + dx + (1 if side > 0 else 0), ty + dy
        if 2 <= x < W - 2 and 2 <= y < H - 1 and s.get(x, y) is None:
            s.px(x, y, c)


poses = [dict(hand=(25, 11), tilt=0.35, bob=0, box=0, head=0),
         dict(hand=(23, 11), tilt=-0.3, bob=0, box=1, head=0)]
for i, p in enumerate(poses):
    new_frame(s, i + 1)
    body(p["bob"], p["box"])
    pts = wave_arm(p["hand"], p["tilt"])
    head(p["head"])
    sparkle(pts, p["tilt"])
    finish(s)
    s.frames[i].duration = 250

s.stats()
check(s, "survivor")
export(s, "survivor", {"idle": [0, 1]}, fps=4, scale=8, here=HERE)
