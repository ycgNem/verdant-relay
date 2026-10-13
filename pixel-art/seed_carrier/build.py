"""seed_carrier - bulbous pod-walker carrying glowing amber seeds (36x36). idle 2, walk 4.
A swollen green seed pod split open along its back (glowing seed clusters inside),
a bark stem-cap 'head' at the front, a dried curl of stalk at the rear, four spindly
jointed bark legs."""
import os
from pathlib import Path
HERE = Path(__file__).resolve().parent
os.chdir(HERE)
from kit import *  # noqa: E402,F403

W, H = 36, 36
s = new_sprite(W, H)

POD = [E["abyss"], E["forest"], E["green"], E["lime"]]
LEGF = [E["out"], E["plum"], E["brown"]]          # far legs
LEGN = [E["plum"], E["brown"], E["tan"], E["khaki"]]  # near legs
GROUND = 34


def leg(hip, knee, foot, near):
    c = LEGN if near else LEGF
    # thigh 2px, shin 1-2px, tapering; light edge on top/left
    s.line(hip[0], hip[1], knee[0], knee[1], c[1])
    s.line(hip[0], hip[1] - 1, knee[0], knee[1] - 1, c[2] if near else c[1])
    s.line(knee[0], knee[1], foot[0], foot[1], c[1])
    if near:
        s.line(knee[0] - 1, knee[1] + 1, foot[0] - 1, foot[1] - 1, c[2])
        s.px(knee[0], knee[1] - 1, c[3])            # knee knuckle catches light
        s.px(foot[0] + 1, foot[1], c[0])            # little claw toe
    else:
        s.px(foot[0] + 1, foot[1], c[1])


def legs(phase, bob):
    """phase 0 stand | 1..4 walk. diagonal pairs: A = near-front + far-back."""
    # foot x offsets per phase for pair A / pair B, and lift
    table = {0: (0, 0, 0, 0), 1: (2, -2, 0, 0), 2: (0, 0, 2, 0), 3: (-2, 2, 0, 0), 4: (0, 0, 0, 2)}
    ax, bx, alift, blift = table[phase]
    hy = 20 + bob
    # far legs first (behind the pod): hips higher, darker
    leg((10, hy - 2), (5 + bx, hy + 4), (5 + bx, GROUND - blift), False)        # far back  (pair B... )
    leg((25, hy - 2), (30 + ax, hy + 3), (29 + ax, GROUND - alift), False)      # far front (pair A)
    return hy


def legs_near(phase, bob):
    table = {0: (0, 0, 0, 0), 1: (2, -2, 0, 0), 2: (0, 0, 2, 0), 3: (-2, 2, 0, 0), 4: (0, 0, 0, 2)}
    ax, bx, alift, blift = table[phase]
    hy = 21 + bob
    leg((13, hy), (8 + ax, hy + 5), (9 + ax, GROUND - alift), True)            # near back (pair A)
    leg((23, hy), (28 + bx, hy + 4), (26 + bx, GROUND - blift), True)          # near front (pair B)


def pod_shape(cy):
    """Teardrop gourd: fat rear bulb tapering toward the front stem."""
    pts = []
    for y in range(cy - 10, cy + 10):
        for x in range(4, 32):
            # radius varies along x: fat at x~15, narrow toward x~30
            t = (x - 4) / 27.0
            ry = 8.8 * (1 - (t - 0.38) ** 2 * 1.9) if t > 0.38 else 8.8 * (1 - (0.38 - t) ** 2 * 4.6)
            if ry <= 0:
                continue
            yc = cy + (t - 0.4) * 2.0          # front end droops a little
            if abs(y + 0.5 - yc) <= ry:
                pts.append((x, y))
    return pts


def pod(bob, glow):
    cy = 15 + bob
    pts = pod_shape(cy)
    lit_mask(s, pts, 16.5, cy, 13.0, 9.0, POD, bias=-0.05)
    ptset = set(pts)
    # two gourd grooves curving around the body (dark groove + lit lip just above)
    for dy, x0, x1 in ((2, 7, 27), (6, 9, 25)):
        for x in range(x0, x1):
            t = (x - 16.5) / 13.0
            y = int(round(cy + dy - 3.5 * t * t + (x - 16) * 0.07))
            if (x, y) in ptset and (x, y - 1) in ptset:
                s.px(x, y, POD[0])
                cur = s.get(x, y - 1)[:3]
                if cur == (62, 137, 72):
                    s.px(x, y - 1, POD[3] if x < 15 else POD[2])
    # gourd mottling: small 2px spots one shade off the local tone
    swap = {(99, 199, 77): POD[2], (62, 137, 72): POD[3], (38, 92, 66): POD[2], (25, 60, 62): POD[1]}
    for (x, y) in [(9, 3), (14, 5), (20, 4), (24, 1), (11, 7), (17, 8), (22, 7), (7, 0)]:
        for (ax, ay) in ((x, cy + y), (x + 1, cy + y)):
            c = s.get(ax, ay)
            if c is not None and c[:3] in swap and (ax, ay) in ptset:
                s.px(ax, ay, swap[c[:3]])
    # the split along the back: a dark slit holding a row of glowing seeds
    seeds = [(8, -6), (12, -8), (16, -9), (20, -8), (24, -6)]
    for k, (x, dy) in enumerate(seeds):
        y = cy + dy
        s.rect(x - 1, y, x + 4, y + 3, E["plum"])          # dark socket
        hl(s, x - 1, x + 4, y + 4, POD[0])
    for k, (x, dy) in enumerate(seeds):
        y = cy + dy
        hot = (k + glow) % 2 == 0
        # oval 4x3 seed, hot core, glowing from within
        pxs(s, [(x + 1, y), (x + 2, y)], E["amber"])
        pxs(s, [(x, y + 1), (x + 2, y + 1)], E["amber"])
        s.px(x + 1, y + 1, E["yellow"])
        s.px(x + 3, y + 1, E["orange"])
        pxs(s, [(x + 1, y + 2), (x + 2, y + 2)], E["orange"])
        if hot:
            s.px(x + 1, y, E["yellow"])
            s.px(x + 2, y + 1, E["yellow"])
            if k == 2:
                s.px(x + 1, y + 1, E["white"])
    # torn pod lips folding back on either side of the slit (lighter skin edge)
    for x in range(8, 28):
        t = (x - 17) / 10.5
        y = int(round(cy - 9.5 + 4.0 * t * t)) + 4
        if (x, y + 1) in ptset and s.get(x, y + 1)[:3] != (62, 39, 49):
            s.px(x, y + 1, POD[3] if x < 18 else POD[2])
    # rear dried stalk curl (silhouette break, top-left)
    rx, ry = 6, cy - 5
    pxs(s, [(rx, ry), (rx - 1, ry - 1), (rx - 1, ry - 2), (rx, ry - 3), (rx + 1, ry - 3), (rx + 2, ry - 2)], E["brown"])
    s.px(rx - 1, ry - 2, E["tan"])
    s.px(rx, ry - 3, E["khaki"])
    return cy


def head(bob, look):
    """Bark bud at the front tip of the pod with a glowing eye and a hooked beak."""
    cy = 18 + bob
    hx = 28
    pts = [(x, y) for y in range(cy - 3, cy + 3) for x in range(hx - 1, hx + 5)
           if ((x + 0.5 - hx - 1.5) / 3.3) ** 2 + ((y + 0.5 - cy) / 3.2) ** 2 <= 1]
    lit_mask(s, pts, hx + 1.5, cy, 3.3, 3.2, LEGN, bias=0.05)
    # bark scale seam
    pxs(s, [(hx - 1, cy - 1), (hx, cy), (hx, cy + 1)], E["plum"])
    # hooked beak
    s.px(hx + 4, cy + 1, E["brown"])
    s.px(hx + 5, cy + 2, E["brown"])
    s.px(hx + 4, cy + 2, E["plum"])
    s.px(hx + 4 + look, cy + 3, E["plum"])
    # eye
    s.px(hx + 2, cy - 1, E["amber"])
    s.px(hx + 3, cy - 1, E["yellow"])
    s.px(hx + 2, cy, E["orange"])


def frame(i, phase, bob, glow, look, ms):
    new_frame(s, i)
    legs(phase, bob)
    pod(bob, glow)
    head(bob, look)
    legs_near(phase, bob)
    finish(s)
    s.frames[i - 1].duration = ms


frame(1, 0, 0, 0, 0, 350)
frame(2, 0, 1, 1, 0, 350)
frame(3, 1, 0, 0, 0, 120)
frame(4, 2, -1, 1, 0, 120)
frame(5, 3, 0, 0, 0, 120)
frame(6, 4, -1, 1, 0, 120)

s.stats()
check(s, "seed_carrier")
export(s, "seed_carrier", {"idle": [0, 1], "walk": [2, 3, 4, 5]}, fps=8,
       anim_fps={"idle": 3, "walk": 8}, scale=8, here=HERE)
