"""ruin_guard - overgrown stone-and-metal sentinel with a blue energy shield (40x48).
idle 2, walk 4, attack 2 (shield bash). Masonry body, rusted iron bands and rivets,
moss and a fern on the head, cyan visor slit, big hex-lattice energy shield in front."""
import os
from pathlib import Path
HERE = Path(__file__).resolve().parent
os.chdir(HERE)
from kit import *  # noqa: E402,F403

W, H = 40, 48


def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
s = new_sprite(W, H)
G = 46


def block(x0, y0, x1, y1, crack=None, dark=False):
    """A masonry block lit from the top-left."""
    base, top, side, edge, hi = (STONE[1], STONE[2], STONE[0], STONE[0], STONE[3]) if dark else \
        (STONE[2], STONE[3], STONE[1], STONE[0], STONE[4])
    s.rect(x0, y0, x1, y1, base)
    hl(s, x0, x1 - 1, y0, top)
    vl(s, x0, y0, y1 - 1, top)
    vl(s, x1, y0 + 1, y1, side)
    hl(s, x0 + 1, x1, y1, edge)
    if x1 - x0 >= 4 and not dark:
        hl(s, x0, x0 + max(1, (x1 - x0) // 3), y0, hi)   # bright chip of the lit corner
    if crack:
        s.line(crack[0], crack[1], crack[2], crack[3], edge)
    # weathering pits (deterministic)
    for k in range((x1 - x0) * (y1 - y0) // 14):
        px_ = x0 + 1 + (k * 7 + y0 * 3 + x0) % max(1, x1 - x0 - 1)
        py_ = y0 + 1 + (k * 5 + x0) % max(1, y1 - y0 - 1)
        if s.get(px_, py_) and s.get(px_, py_)[:3] == hex2rgb(base):
            s.px(px_, py_, side)


def band(x0, x1, y, rivets=True):
    """Rusted iron strap."""
    hl(s, x0, x1, y, RUST[3])
    hl(s, x0, x1, y + 1, RUST[2])
    hl(s, x0, x1, y + 2, RUST[0])
    if rivets:
        for x in range(x0 + 1, x1, 4):
            s.px(x, y + 1, E["khaki"])


def moss(pts_rows):
    """pts_rows: list of (x0, x1, y) spans of moss; top px lit."""
    for (x0, x1, y) in pts_rows:
        hl(s, x0, x1, y, MOSS[2])
    for (x0, x1, y) in pts_rows[:1]:
        for x in range(x0, x1 + 1, 2):
            s.px(x, y, MOSS[3])
    # shadow underneath
    for (x0, x1, y) in pts_rows[-1:]:
        for x in range(x0 + 1, x1, 3):
            s.px(x, y + 1, MOSS[1])


def legs(step, b):
    # (back foot dx, back lift, front foot dx, front lift)
    back_dx, back_l, front_dx, front_l = {0: (0, 0, 0, 0), 1: (-2, 0, 2, 0), 2: (0, 1, 0, 0),
                                          3: (2, 0, -2, 0), 4: (0, 0, 0, 1), 5: (-1, 0, 3, 0)}[step]
    # back leg (darker, behind)
    x = 9 + back_dx
    block(x, 35 + b, x + 5, G - 3 - back_l, dark=True)
    block(x - 1, G - 3 - back_l, x + 6, G - back_l, dark=True)      # foot slab
    # front leg
    x = 16 + front_dx
    block(x, 35 + b, x + 5, 40 - front_l)
    s.rect(x, 39 - front_l, x + 5, 40 - front_l, RUST[2])            # iron knee cap
    hl(s, x, x + 4, 39 - front_l, RUST[3])
    s.px(x + 2, 39 - front_l, E["khaki"])
    block(x, 41 - front_l, x + 5, G - 3 - front_l)
    block(x - 1, G - 2 - front_l, x + 7, G - front_l)
    s.px(x + 7, G - front_l - 1, RUST[2])                             # iron toe cap
    s.px(x + 6, G - front_l - 2, RUST[3])


def back_arm(b, swing):
    y = b
    # hanging arm, darker (far side)
    block(4 + swing, 20 + y, 8 + swing, 28 + y, dark=True)
    block(3 + swing, 29 + y, 9 + swing, 35 + y, dark=True)            # fist
    hl(s, 4 + swing, 8 + swing, 31 + y, STONE[0])                     # knuckle seam
    hl(s, 4 + swing, 8 + swing, 33 + y, STONE[0])
    band(4 + swing, 8 + swing, 24 + y)                                # iron bracer


def torso(b, lean):
    y, x = b, lean
    # pelvis
    block(8 + x, 31 + y, 22 + x, 35 + y, dark=True)
    band(8 + x, 22 + x, 31 + y)
    # chest: three courses of blocks, staggered
    block(6 + x, 23 + y, 13 + x, 30 + y, crack=(9 + x, 24 + y, 11 + x, 28 + y))
    block(14 + x, 23 + y, 23 + x, 30 + y)
    block(5 + x, 17 + y, 15 + x, 22 + y)
    block(16 + x, 17 + y, 24 + x, 22 + y, crack=(20 + x, 18 + y, 19 + x, 21 + y))
    # iron chest strap (diagonal) with rivets
    s.line(7 + x, 18 + y, 21 + x, 30 + y, RUST[2])
    s.line(8 + x, 18 + y, 22 + x, 30 + y, RUST[3])
    s.line(7 + x, 19 + y, 20 + x, 30 + y, RUST[0])
    for k in (2, 7, 12):
        s.px(8 + x + k, 18 + y + k - (k // 6), E["khaki"])
    # back shoulder pauldron (big stone block) with moss cap
    block(2 + x, 14 + y, 9 + x, 20 + y, crack=(4 + x, 16 + y, 6 + x, 19 + y))
    moss([(2 + x, 9 + x, 13 + y), (2 + x, 4 + x, 14 + y)])
    pxs(s, [(2 + x, 15 + y), (2 + x, 16 + y), (3 + x, 17 + y), (2 + x, 18 + y)], MOSS[1])   # moss drip
    # vine hanging from the shoulder over the chest
    for k, yy in enumerate(range(15 + y, 27 + y)):
        vx = 9 + x + (1 if (k // 3) % 2 else 0)
        s.px(vx, yy, MOSS[2] if k % 4 else MOSS[3])
    pxs(s, [(10 + x, 19 + y), (8 + x, 23 + y), (11 + x, 25 + y)], MOSS[1])     # leaves
    pxs(s, [(11 + x, 19 + y), (12 + x, 25 + y)], MOSS[3])
    # front shoulder
    block(17 + x, 13 + y, 25 + x, 18 + y)
    moss([(17 + x, 24 + x, 12 + y)])


def head(b, look, eye_hot):
    y = b
    block(12, 7 + y, 20, 14 + y)
    s.rect(15, 10 + y, 21, 11 + y, E["out"])           # visor slit recess
    hl(s, 16, 20, 10 + y, E["cyan"] if eye_hot else E["blue"])
    s.px(19 + look, 10 + y, E["white"])
    hl(s, 16, 20, 11 + y, E["navy"])
    # brow plate (iron)
    hl(s, 13, 20, 9 + y, RUST[2])
    hl(s, 14, 19, 8 + y, RUST[3])
    # moss cap + fern sprout
    moss([(12, 19, 6 + y)])
    pxs(s, [(14, 5 + y), (13, 4 + y), (12, 3 + y), (15, 4 + y), (16, 3 + y), (17, 3 + y)], MOSS[2])
    pxs(s, [(12, 3 + y), (17, 3 + y)], MOSS[3])
    s.px(14, 4 + y, MOSS[1])


def shield(dx, dy, flare, shimmer):
    """Tall convex hex-lattice energy shield held in front, emitter on the gauntlet."""
    x0, y0, x1, y1 = 26 + dx, 12 + dy, 35 + dx, 41 + dy
    # front arm reaching to the emitter grip (behind the pane)
    block(22 + dx // 2, 19 + dy, 27 + dx, 24 + dy)
    pts = []
    for y in range(y0, y1 + 1):
        t = (y - y0) / (y1 - y0)
        inset = 0
        if t < 0.08 or t > 0.92:
            inset = 2
        elif t < 0.16 or t > 0.84:
            inset = 1
        bulge = 1 if 0.3 < t < 0.7 else 0                # convex face bows toward the viewer
        for x in range(x0 + inset, x1 - inset + 1 + bulge):
            pts.append((x, y))
    pset = set(pts)
    for (x, y) in pts:
        # field fill: navy at the shadowed right/bottom, blue toward the lit upper-left
        d = (x - x0) / (x1 - x0) * 0.6 + (y - y0) / (y1 - y0) * 0.6
        s.px(x, y, E["blue"] if d < 0.55 else E["navy"])
    # hexagonal force lattice: Voronoi edges of an offset hex-centre grid (scrolls with shimmer)
    import math
    cells = []
    for r in range(-2, 9):
        for c in range(-2, 4):
            cells.append((x0 + c * 5 + (2.5 if r % 2 else 0), y0 + r * 4.3 - shimmer * 0.0 + (shimmer % 2) * 0.0))
    for (x, y) in pts:
        yy = y + shimmer * 1.0
        ds = sorted(math.hypot(x + 0.5 - cx, yy + 0.5 - cy) for cx, cy in cells)
        if ds[1] - ds[0] < 0.75:
            lit = (x - x0) * 0.6 + (y - y0) * 0.35 < 10
            s.px(x, y, E["cyan"] if (lit or flare) else E["blue"])
        elif flare and ds[0] < 1.2:
            s.px(x, y, E["cyan"])
    # bright rim: lit top-left edge white/cyan, shadow edge blue
    for (x, y) in pts:
        edge_l = (x - 1, y) not in pset
        edge_t = (x, y - 1) not in pset
        edge_r = (x + 1, y) not in pset
        edge_b = (x, y + 1) not in pset
        if edge_l or edge_t:
            s.px(x, y, E["white"] if (y - y0) < 14 or flare else E["cyan"])
        elif edge_r or edge_b:
            s.px(x, y, E["cyan"] if flare else E["blue"])
    # glare streak across the upper-left
    for k in range(4):
        s.px(x0 + 2 + k, y0 + 6 - k, E["white"])
    # emitter: iron frame clamp at the middle-left with an amber status light
    ey = (y0 + y1) // 2
    s.rect(x0 - 1, ey - 3, x0 + 1, ey + 3, RUST[2])
    vl(s, x0 - 1, ey - 3, ey + 3, RUST[3])
    vl(s, x0 + 1, ey - 2, ey + 3, RUST[0])
    s.px(x0, ey, E["amber"])
    if flare:
        # impact burst arcs in front of the pane
        for (x, y) in [(x1 + 2, y0 + 8), (x1 + 3, y0 + 10), (x1 + 3, y0 + 14), (x1 + 3, y0 + 18),
                       (x1 + 2, y0 + 20), (x1 + 2, y0 + 12), (x1 + 2, y0 + 16)]:
            if x <= W - 3:
                s.px(x, y, E["cyan"] if y % 4 else E["white"])


def frame(i, ms, step=0, b=0, swing=0, lean=0, sdx=0, sdy=0, flare=False, shimmer=0, eye=True):
    new_frame(s, i)
    back_arm(b, swing)
    legs(step, b)
    torso(b, lean)
    head(b + (1 if lean < 0 else 0), lean, eye)
    shield(sdx, sdy + b, flare, shimmer)
    finish(s)
    s.frames[i - 1].duration = ms


frame(1, 400, shimmer=0)
frame(2, 400, b=1, shimmer=3, eye=False)
frame(3, 140, step=1, b=0, swing=1, shimmer=0)
frame(4, 140, step=2, b=-1, swing=0, shimmer=1)
frame(5, 140, step=3, b=0, swing=-1, shimmer=2)
frame(6, 140, step=4, b=-1, swing=0, shimmer=3)
frame(7, 220, step=0, b=1, swing=0, lean=0, sdx=-2, flare=False, shimmer=1)   # anticipation
frame(8, 260, step=5, b=0, swing=-1, lean=1, sdx=1, flare=True, shimmer=4)     # bash

s.stats()
check(s, "ruin_guard")
export(s, "ruin_guard", {"idle": [0, 1], "walk": [2, 3, 4, 5], "attack": [6, 7]}, fps=8,
       anim_fps={"idle": 3, "walk": 7, "attack": 6}, scale=6, here=HERE)
