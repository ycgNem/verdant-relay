"""colossus - the Canopy Colossus, final boss (96x112).
idle 2, walk 4, windup 2, rooted 2, charge 4  (14 frames).

A hunched, gorilla-postured tree-titan: trunk legs ending in splayed root feet, long
branch arms with claw-twig fingers, a barrel torso armoured in layered bark plates,
a leafy canopy crown on its back, moss and hanging vines, and a caged, glowing red
heart-core in the chest that flares when it winds up. Built from a parametric
skeleton so every pose is a function call."""
import math
import os
import random
from pathlib import Path
HERE = Path(__file__).resolve().parent
os.chdir(HERE)
from kit import *  # noqa: E402,F403

W, H = 96, 112
G = 110                                    # ground row (outline lands on 111)
s = new_sprite(W, H)

BARKF = [E["out"], E["plum"], E["plum"], E["brown"], E["tan"]]           # far-side bark (in shadow)
BARKN = [E["plum"], E["brown"], E["tan"], E["khaki"]]          # near-side bark
PLATE = [E["out"], E["plum"], E["brown"], E["tan"], E["khaki"]]
LEAF = [E["abyss"], E["forest"], E["green"], E["lime"]]
LEAF_FAR = [E["out"], E["abyss"], E["forest"], E["green"]]
CORE = [E["wine"], E["red"], E["hot"], E["orange"], E["amber"], E["yellow"]]

DARKER = {}
for rmp in (BARKN, PLATE, LEAF, BARKF):
    for a, b in zip(rmp[1:], rmp[:-1]):
        DARKER.setdefault(a, b)


def rgbhex(c):
    return "#%02x%02x%02x" % c[:3]


def darken_at(x, y):
    c = s.get(x, y)
    if c is None:
        return
    h = rgbhex(c)
    if h in DARKER:
        s.px(x, y, DARKER[h])


def grain(x0, y0, x1, y1, seed, axis=(0, 1), spacing=3.0, only=None):
    """Longitudinal bark grooves on whatever is drawn in the current scratch cel."""
    ax, ay = axis
    n = math.hypot(ax, ay) or 1
    ax, ay = ax / n, ay / n
    im = s._img()
    p = im.load()
    for y in range(max(0, y0), min(H, y1 + 1)):
        for x in range(max(0, x0), min(W, x1 + 1)):
            if p[x, y][3] == 0:
                continue
            along = x * ax + y * ay
            across = -x * ay + y * ax
            w = across + 1.2 * math.sin(along * 0.33 + seed) + 0.6 * math.sin(along * 0.9 + seed * 2)
            if (w % spacing) < 0.9:
                darken_at(x, y)


def limb(a, b, r0, r1, rmp, seed, bias=0.0, edge=None, grain_on=True, sides=("down", "right", "left")):
    def draw():
        lit_limb(s, a[0], a[1], b[0], b[1], r0, r1, rmp, bias=bias)
        if grain_on:
            grain(int(min(a[0], b[0]) - r0 - 2), int(min(a[1], b[1]) - r0 - 2),
                  int(max(a[0], b[0]) + r0 + 2), int(max(a[1], b[1]) + r0 + 2), seed,
                  axis=(b[0] - a[0], b[1] - a[1]))
    part(s, draw, edge=edge if edge else rmp[0], edge_sides=sides)


def plate(pts, rmp=PLATE, bias=-0.15, moss_top=False, seed=0):
    """A layered bark armour plate: shaded polygon with grain, lit upper lip, dark
    selout on the other sides and a cast shadow on whatever lies below it."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    rx, ry = (max(xs) - min(xs)) / 2 + 1, (max(ys) - min(ys)) / 2 + 1
    holder = {}

    def draw():
        s.polygon(pts, rmp[1])
        m = sorted(mask_of(s))
        holder["m"] = m
        lit_mask(s, m, cx - rx * 0.2, cy - ry * 0.3, rx * 1.2, ry * 1.5, rmp[1:], bias=bias)
        grain(min(xs) - 1, min(ys) - 1, max(xs) + 1, max(ys) + 1, seed, axis=(1, 0.25), spacing=3.0)
        mset = set(m)
        for (x, y) in m:
            if (x, y - 1) not in mset:
                s.px(x, y, rmp[-1] if x < cx else rmp[-2])
        if moss_top:
            rnd = random.Random(seed)
            for (x, y) in m:
                if (x, y - 1) not in mset and rnd.random() < 0.85:
                    s.px(x, y, LEAF[2] if rnd.random() < 0.6 else LEAF[3])
                    if (x, y + 1) in mset and rnd.random() < 0.6:
                        s.px(x, y + 1, LEAF[1])
                        if (x, y + 2) in mset and rnd.random() < 0.3:
                            s.px(x, y + 2, LEAF[1])
    part(s, draw, edge=rmp[0], edge_sides=("down", "right", "left"))
    mset = set(holder["m"])
    for (x, y) in holder["m"]:
        if (x, y + 1) not in mset and s.get(x, y + 1) is not None:
            s.px(x, y + 1, E["out"] if (x + y) % 3 else E["plum"])


def moss_patch(x, y, w, seed):
    """Lumpy moss mat laid over existing pixels (only where something is drawn)."""
    rnd = random.Random(seed)
    for i in range(w):
        h = 1 + (1 if 0 < i < w - 1 else 0) + (1 if rnd.random() < 0.3 and 1 < i < w - 2 else 0)
        for j in range(h):
            xx, yy = x + i, y + j - (1 if j == 0 and rnd.random() < 0.25 else 0)
            if s.get(xx, yy) is not None:
                s.px(xx, yy, LEAF[3] if j == 0 and i < w * 0.6 else LEAF[2] if j == 0 else LEAF[1])
        if rnd.random() < 0.3 and s.get(x + i, y + h) is not None:
            s.px(x + i, y + h, LEAF[1])          # drip


def leaf_cluster(cx, cy, r, rmp, seed, bias=0.0):
    rnd = random.Random(seed)
    ph = rnd.random() * 6.28
    n = len(rmp)
    pts = []
    for y in range(int(cy - r - 2), int(cy + r + 3)):
        for x in range(int(cx - r - 2), int(cx + r + 3)):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            ang = math.atan2(dy, dx)
            rr = r + 1.3 * math.sin(ang * 6 + ph) + 0.6 * math.sin(ang * 11 + ph * 2)
            if dx * dx + (dy * 1.15) ** 2 <= rr * rr:
                pts.append((x, y))
    lit_mask(s, pts, cx, cy, r + 1, r + 1, rmp, bias=bias)
    # leaf texture: little lit leaf tips & dark gaps, clustered (2px)
    pset = set(pts)
    for _ in range(int(r * r * 0.18)):
        x, y = rnd.choice(pts)
        c = s.get(x, y)
        if c is None:
            continue
        if (x - cx) + (y - cy) < 0:
            s.px(x, y, rmp[min(n - 1, 3)])
            if (x + 1, y) in pset:
                s.px(x + 1, y, rmp[2])
        else:
            s.px(x, y, rmp[0])
            if (x, y + 1) in pset:
                s.px(x, y + 1, rmp[1])


def vine(x, y, length, sway, seed, leaf=True):
    rnd = random.Random(seed)
    px_ = x
    for k in range(length):
        t = k / max(1, length - 1)
        xx = int(round(x + sway * t * t * 1.0 + math.sin(k * 0.5 + seed) * 0.6))
        yy = y + k
        if yy >= G - 1:
            break
        s.px(xx, yy, LEAF[1] if k % 5 else LEAF[2])
        if leaf and k % 4 == 2 and k > 1:
            side = 1 if (k // 4) % 2 else -1
            s.px(xx + side, yy, LEAF[2])
            s.px(xx + side, yy - 1, LEAF[3] if side < 0 else LEAF[2])
        px_ = xx
    s.px(px_, y + length - 1 if y + length - 1 < G - 1 else G - 2, LEAF[3])


def root_foot(fx, fy, flip=1, spread=0, rmp=BARKN, seed=0):
    """Splayed root foot resting on the ground row G."""
    def draw():
        lit_ellipse(s, fx, fy - 3, 7.5, 4.5, rmp, bias=0.05)
        # root toes fanning along the ground
        toes = [(9 + spread, 0), (5 + spread // 2, 1), (-7 - spread, 0), (-3, 1)]
        for k, (dx, dy) in enumerate(toes):
            ex = fx + dx * flip
            limb_pts(fx + (2 if dx > 0 else -2) * flip, fy - 2, ex, G - dy, 2.2, 0.8, rmp)
    part(s, draw, edge=rmp[0], edge_sides=("down", "right"))


def limb_pts(x0, y0, x1, y1, r0, r1, rmp):
    lit_limb(s, x0, y0, x1, y1, r0, r1, rmp)


def roots_spread(x, amount, seed, direction=0):
    """Rooted pose: thick roots plunging into the ground and spreading along it."""
    rnd = random.Random(seed)
    def draw():
        for k in range(6):
            side = -1 if k % 2 else 1
            L = 5 + amount * 5 + rnd.randint(0, 4) + k
            ex = max(3, min(W - 4, x + side * L))
            midx = x + side * L * 0.45
            limb_pts(x, G - 6, midx, G - 2 - (k % 3 == 0), 2.6, 1.6, BARKN)
            limb_pts(midx, G - 2, ex, G - (k % 2), 1.6, 0.6, BARKN)
    part(s, draw, edge=BARKN[0], edge_sides=("down", "right"))
    # heaved soil clods and cracks around the plunge point
    for dx in range(-10 - amount * 4, 11 + amount * 4, 3):
        xx = x + dx + (seed % 2)
        if 2 <= xx < W - 3:
            s.px(xx, G, E["brown"])
            s.px(xx + 1, G - 1, E["tan"] if dx < 0 else E["brown"])
            s.px(xx + 1, G, E["plum"])


def heart_core(cx, cy, glow):
    """Caged glowing heart in a chest cavity. glow 0 (dim) .. 2 (flaring)."""
    # warm light spilling onto the surrounding bark: solid inner ring, broken outer ring
    for y in range(cy - 14, cy + 15):
        for x in range(cx - 13, cx + 14):
            d = math.hypot(x - cx, (y - cy) * 0.82)
            c = s.get(x, y)
            if c is None:
                continue
            h = rgbhex(c)
            if h not in (E["tan"], E["khaki"], E["brown"], E["peach"]):
                continue
            if d <= 9.6 + glow * 0.5:
                s.px(x, y, E["clay"] if h in (E["tan"], E["khaki"], E["peach"]) else E["rust"])
            elif d <= 11.5 + glow and (x + y) % 2 == 0:
                s.px(x, y, E["rust"] if h != E["brown"] else E["wine"])
    # cavity
    s.ellipse(cx - 7, cy - 9, cx + 7, cy + 9, E["out"])
    s.ellipse(cx - 6, cy - 8, cx + 6, cy + 8, E["wine"])
    # glowing orb
    r = 5 + (1 if glow >= 2 else 0)
    s.circle(cx, cy, r + 1, CORE[1], fill=True)
    s.circle(cx, cy, r, CORE[2], fill=True)
    s.circle(cx - 1, cy - 1, r - 2, CORE[3], fill=True)
    s.circle(cx - 1, cy - 1, max(1, r - 3), CORE[4], fill=True)
    s.px(cx - 2, cy - 2, CORE[5])
    s.px(cx - 1, cy - 2, CORE[5])
    if glow >= 1:
        s.px(cx - 2, cy - 1, CORE[5])
    if glow >= 2:
        s.px(cx - 2, cy - 3, E["white"])
        s.px(cx - 3, cy - 2, CORE[5])
    # two thin wooden ribs caging the core
    for ox in (-3, 3):
        for dy in range(-8, 9):
            bow = int(round((1 - (dy / 8.5) ** 2) * (1 if ox > 0 else -1)))
            if abs(dy) > 6:
                bow = 0
            x = cx + ox + bow
            s.px(x, cy + dy, BARKN[2] if dy < 0 else BARKN[1])
        s.px(cx + ox, cy - 8, BARKN[3])
        s.px(cx + ox, cy - 7, BARKN[3])


def red_veins(cx, cy, glow, seed):
    """Glowing cracks radiating from the core through the bark."""
    rnd = random.Random(seed)
    for k in range(6):
        ang = -2.6 + k * 0.95 + rnd.random() * 0.3
        x, y = float(cx), float(cy)
        L = 10 + rnd.randint(0, 6) + glow * 3
        for i in range(L):
            x += math.cos(ang) + rnd.uniform(-0.45, 0.45)
            y += math.sin(ang) + rnd.uniform(-0.45, 0.45)
            if i < 10:
                continue
            xi, yi = int(x), int(y)
            if s.get(xi, yi) is not None:
                s.px(xi, yi, E["red"] if (i < L - 4 or glow >= 2) else E["wine"])
                if glow >= 2 and i < 12:
                    s.px(xi, yi, E["hot"])


def head(hx, hy, jaw, eye_glow, tilt=0):
    """Bark skull-mask: heavy brow, glowing eyes in deep sockets, root-tooth maw,
    two antler branches sweeping back."""
    # antlers (behind)
    def antlers():
        limb_pts(hx - 3, hy - 6, hx - 10, hy - 17, 2.0, 1.0, BARKF)
        limb_pts(hx - 8, hy - 13, hx - 6, hy - 20, 1.2, 0.6, BARKF)
        limb_pts(hx + 1, hy - 7, hx - 2, hy - 18, 1.8, 0.8, BARKN)
        limb_pts(hx - 1, hy - 14, hx + 3, hy - 20, 1.2, 0.6, BARKN)
    part(s, antlers, edge=BARKN[0], edge_sides=("down", "right"))

    def skull():
        lit_ellipse(s, hx, hy, 10.0, 9.0, BARKN, bias=-0.05)
        # jaw/muzzle jutting forward-down
        lit_ellipse(s, hx + 5, hy + 6 + jaw, 7.0, 4.5 + jaw * 0.3, BARKN, bias=-0.12)
        grain(hx - 10, hy - 9, hx + 11, hy + 12, 3.1, axis=(0.3, 1), spacing=3.5)
    part(s, skull, edge=BARKN[0], edge_sides=("down", "right"))
    # brow ridge (heavy, lit top)
    s.line(hx - 2, hy - 3 + tilt, hx + 8, hy - 2 + tilt, BARKN[3])
    s.line(hx - 2, hy - 2 + tilt, hx + 8, hy - 1 + tilt, BARKN[1])
    # eye sockets + glowing eyes
    # deep socket band under the brow, then slanted angry eye slits (inner end low)
    for x in range(hx - 1, hx + 10):
        s.px(x, hy - 1 + tilt, E["out"])
        s.px(x, hy + tilt, E["plum"] if x in (hx + 4, hx + 5) else E["out"])
    for k, (ex, slope) in enumerate(((hx + 1, 1), (hx + 6, -1))):
        # 3px slit, the end nearer the nose one row lower
        for i in range(3):
            yy = hy + tilt + (1 if (slope > 0 and i == 2) or (slope < 0 and i == 0) else 0) - 1
            s.px(ex + i, yy + 1, E["hot"] if i == 1 or eye_glow >= 2 else E["red"])
        s.px(ex + 1, hy + tilt, E["amber"] if eye_glow >= 2 else E["hot"])
    s.px(hx + 4, hy + 2 + tilt, BARKN[0])                    # nose cleft
    s.px(hx + 5, hy + 2 + tilt, BARKN[0])
    # maw
    my = hy + 5 + tilt
    s.rect(hx + 3, my + 1, hx + 11, my + 1 + jaw, E["out"])
    if jaw:
        s.rect(hx + 4, my + 2, hx + 10, my + jaw, E["wine"])
        s.px(hx + 5, my + 2, E["red"])
    for tx in (hx + 4, hx + 6, hx + 8, hx + 10):                     # root teeth
        s.px(tx, my + 1, E["cream"])
        if jaw >= 2:
            s.px(tx - 1, my + 1 + jaw, E["khaki"])
    # moss cap on the crown of the head
    for x in range(hx - 6, hx + 5):
        yy = hy - 7 + int(abs(x - hx + 1) * 0.35)
        if s.get(x, yy) is not None:
            s.px(x, yy, LEAF[2] if x % 3 else LEAF[3])


def claws(hx, hy, spread, rmp=BARKN, down=True):
    """Twig-claw fingers fanning down from the hand."""
    for k in range(4):
        ang = math.radians(60 + k * 20 - spread * 8) if down else math.radians(-150 + k * 32)
        L = 8 + (k % 2) * 3
        ex, ey = hx + math.cos(ang) * L, hy + math.sin(ang) * L
        ey = min(ey, G)
        limb_pts(hx, hy, ex, ey, 2.0, 0.5, rmp)


def arm(sh, el, ha, near, seed, spread=0, plunge=False, up=False):
    rmp = BARKN if near else BARKF
    limb(sh, el, 7.5 if near else 6.5, 6.0 if near else 5.0, rmp, seed, bias=0.0 if near else -0.1)
    limb(el, ha, 6.0 if near else 5.0, 4.5 if near else 4.0, rmp, seed + 1, bias=0.0 if near else -0.1)

    def hand():
        lit_ellipse(s, ha[0], ha[1], 4.5, 4.0, rmp, bias=0.0)
        if plunge:
            for k in range(3):
                limb_pts(ha[0] - 2 + k * 2, ha[1] + 2, ha[0] - 4 + k * 4, G, 1.5, 0.6, rmp)
        elif up:
            claws(ha[0], ha[1] - 2, spread, rmp, down=False)
        else:
            claws(ha[0], ha[1] + 2, spread, rmp)
    part(s, hand, edge=rmp[0], edge_sides=("down", "right"))
    if near:
        # bark bracer plates on the forearm
        mx, my = (el[0] + ha[0]) / 2, (el[1] + ha[1]) / 2
        dx, dy = ha[0] - el[0], ha[1] - el[1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        p = [(mx - nx * 6 - dx * 0.25, my - ny * 6 - dy * 0.25), (mx + nx * 6 - dx * 0.25, my + ny * 6 - dy * 0.25),
             (mx + nx * 5 + dx * 0.1, my + ny * 5 + dy * 0.1), (mx - nx * 5 + dx * 0.1, my - ny * 5 + dy * 0.1)]
        plate([(int(a), int(b)) for a, b in p], seed=seed + 7)


def leg(hip, knee, foot, near, seed, spread=0, flip=1):
    rmp = BARKN if near else BARKF
    limb(hip, knee, 9.0 if near else 8.0, 7.0 if near else 6.5, rmp, seed, bias=0.0 if near else -0.1)
    limb(knee, (foot[0], foot[1] - 4), 7.0 if near else 6.0, 6.0 if near else 5.5, rmp, seed + 1,
         bias=0.0 if near else -0.1)
    root_foot(foot[0], foot[1], flip=flip, spread=spread, rmp=rmp, seed=seed)
    if near:
        # knee plate
        kx, ky = knee
        plate([(kx - 6, ky - 4), (kx + 5, ky - 6), (kx + 7, ky + 2), (kx - 4, ky + 4)], seed=seed + 3, moss_top=True)


def torso(cx, cy, seed):
    """Barrel torso + hunched shoulder mass + layered bark plating."""
    def body():
        lit_ellipse(s, cx, cy, 19.5, 23.0, BARKN, bias=-0.14)
        lit_ellipse(s, cx - 2, cy - 15, 22.0, 12.5, BARKN, bias=-0.06)       # hunched upper back
        grain(cx - 24, cy - 30, cx + 22, cy + 24, seed, axis=(0.15, 1), spacing=3.2)
    part(s, body, edge=BARKN[0], edge_sides=("down", "right"))
    # waist / hip girdle
    plate([(cx - 15, cy + 16), (cx + 14, cy + 15), (cx + 12, cy + 23), (cx - 13, cy + 24)], seed=seed + 11)
    # layered chest plates either side of the core (shingled, top to bottom)
    plate([(cx - 17, cy - 6), (cx - 4, cy - 9), (cx - 3, cy + 1), (cx - 16, cy + 4)], seed=seed + 12)
    plate([(cx - 16, cy + 3), (cx - 3, cy + 1), (cx - 2, cy + 10), (cx - 14, cy + 12)], seed=seed + 13)
    plate([(cx + 13, cy - 7), (cx + 18, cy - 3), (cx + 16, cy + 9), (cx + 11, cy + 10)], seed=seed + 14)
    # back shoulder (far) pauldron, mossy
    plate([(cx - 24, cy - 22), (cx - 8, cy - 28), (cx - 5, cy - 17), (cx - 21, cy - 11)], rmp=[E["out"], E["plum"], E["brown"], E["tan"], E["khaki"]],
          moss_top=True, seed=seed + 15)


def near_pauldron(cx, cy, seed):
    """Big layered shoulder armour over the near shoulder (two overlapping plates)."""
    plate([(cx + 2, cy - 27), (cx + 18, cy - 24), (cx + 20, cy - 13), (cx + 4, cy - 15)], moss_top=True, seed=seed)
    plate([(cx + 5, cy - 18), (cx + 21, cy - 15), (cx + 21, cy - 6), (cx + 7, cy - 8)], seed=seed + 1)


def crown(cx, cy, lag, seed, back=True):
    """Leafy canopy on the upper back. back=True draws the rear (darker) clusters."""
    lx, ly = lag
    if back:
        for k, (dx, dy, r) in enumerate([(-22, -26, 8), (-10, -34, 9), (4, -34, 8), (-30, -16, 7), (14, -27, 7)]):
            leaf_cluster(cx + dx + lx, cy + dy + ly, r, LEAF_FAR, seed + k, bias=-0.05)
        # branches growing out of the back into the canopy
        def branches():
            limb_pts(cx - 10, cy - 20, cx - 20 + lx, cy - 36 + ly, 1.8, 0.9, BARKF)
            limb_pts(cx - 3, cy - 24, cx + 1 + lx, cy - 41 + ly, 1.6, 0.8, BARKF)
            limb_pts(cx - 16, cy - 18, cx - 30 + lx, cy - 26 + ly, 1.6, 0.8, BARKF)
            limb_pts(cx - 1 + lx * 0.5, cy - 33 + ly * 0.5, cx + 9 + lx, cy - 41 + ly, 1.2, 0.6, BARKN)
        part(s, branches, edge=BARKN[0], edge_sides=("down", "right"))
    else:
        for k, (dx, dy, r) in enumerate([(-16, -30, 7), (-3, -38, 6), (-26, -22, 6), (8, -32, 5), (-3, -27, 5)]):
            leaf_cluster(cx + dx + lx, cy + dy + ly, r, LEAF, seed + 20 + k, bias=0.0)


# ------------------------------------------------------------------------------
# Poses
# ------------------------------------------------------------------------------

def pose(**kw):
    p = dict(
        ub=(0, 0),                 # upper body offset
        head=(0, 0), jaw=0, eye=1, tilt=0,
        b_hip=(36, 78), b_knee=(31, 93), b_foot=(32, 109),
        f_hip=(52, 80), f_knee=(57, 94), f_foot=(58, 109),
        b_el=(19, 64), b_hand=(17, 86),
        f_el=(70, 64), f_hand=(76, 86),
        spread=0, core=1, roots=0, lag=(0, 0), vsway=0, shake=0, plunge=False, up=False, dust=0,
    )
    p.update(kw)
    return p


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def draw(p):
    ux, uy = p["ub"]
    cx, cy = 45 + ux, 57 + uy
    lag = p["lag"]
    # 1. rear canopy + branches
    crown(cx, cy, lag, seed=40, back=True)
    # 2. far arm, far leg
    sh_b = (cx - 17, cy - 15)
    arm(sh_b, p["b_el"], p["b_hand"], near=False, seed=5, spread=p["spread"], plunge=p["plunge"], up=p["up"])
    leg(add(p["b_hip"], (ux // 2, uy // 2)), p["b_knee"], p["b_foot"], near=False, seed=9, flip=-1)
    # 3. torso
    torso(cx, cy, seed=21)
    # 4. heart core + glowing veins
    heart_core(cx + 3, cy - 1, p["core"])
    red_veins(cx + 3, cy - 1, p["core"], seed=77)
    # 5. near leg
    leg(add(p["f_hip"], (ux // 2, uy // 2)), p["f_knee"], p["f_foot"], near=True, seed=13, flip=1,
        spread=p["roots"])
    # 6. head (forward, low between the shoulders)
    hx, hy = cx + 22 + p["head"][0], cy - 18 + p["head"][1]
    if not p["up"]:
        head(hx, hy, p["jaw"], p["eye"], p["tilt"])
    # 7. near pauldron + front canopy
    crown(cx, cy, lag, seed=40, back=False)
    # vines hanging from the crown and the shoulders
    vs = p["vsway"]
    vine(cx - 26 + lag[0], cy - 16 + lag[1], 26, vs, 1)
    vine(cx - 12 + lag[0], cy - 26 + lag[1], 20, vs, 2)
    vine(cx + 15, cy - 9, 15, vs, 3)
    # moss creeping over the body
    moss_patch(cx - 6, cy + 14, 9, 51)                           # girdle
    moss_patch(p["f_knee"][0] - 3, p["f_knee"][1] + 6, 6, 52)    # shin
    moss_patch(cx - 14, cy - 2, 5, 53)                           # chest plate
    # 8. near arm
    sh_f = (cx + 14, cy - 13)
    arm(sh_f, p["f_el"], p["f_hand"], near=True, seed=17, spread=p["spread"], plunge=p["plunge"], up=p["up"])
    near_pauldron(cx, cy, seed=31)
    if p["up"]:
        head(hx, hy, p["jaw"], p["eye"], p["tilt"])       # roaring head thrust in front of the raised arm
    vine(p["f_el"][0] - 2, p["f_el"][1] + 2, 12, vs, 4)
    # 9. roots in the rooted pose
    if p["roots"]:
        roots_spread(p["f_foot"][0], p["roots"], seed=5)
        roots_spread(p["b_foot"][0], p["roots"], seed=6, direction=0.3)
        if p["plunge"]:
            roots_spread(p["f_hand"][0], p["roots"] - 1, seed=7)
    if p["dust"]:
        # kicked-up dust clods behind the trailing foot (solid pixels, no alpha)
        rnd = random.Random(p["dust"] * 13)
        bx = min(p["b_foot"][0], p["f_foot"][0]) - 4
        for k in range(7):
            x = bx - rnd.randint(0, 10)
            y = G - rnd.randint(0, 7) - (k % 3)
            if 3 <= x and s.get(x, y) is None:
                s.px(x, y, E["khaki"] if k % 2 else E["tan"])
                s.px(x + 1, y, E["tan"])
                s.px(x, y + 1, E["brown"])
    if p["shake"]:
        s.shift(p["shake"], 0)


POSES = [
    # idle (breathe: chest rises, core pulses, crown settles a frame later)
    ("idle", 450, pose(core=1)),
    ("idle", 450, pose(ub=(0, 1), head=(0, 1), core=2, lag=(0, 1), b_hand=(17, 87), f_hand=(76, 87), vsway=1)),
    # walk: heavy lumbering stride, contact - pass - contact - pass
    ("walk", 170, pose(ub=(1, 1), b_knee=(27, 94), b_foot=(25, 109), f_knee=(62, 93), f_foot=(66, 109),
                       b_el=(23, 64), b_hand=(25, 85), f_el=(66, 65), f_hand=(68, 88), lag=(-1, 0), vsway=-2)),
    ("walk", 170, pose(ub=(2, -1), head=(1, -1), b_knee=(33, 92), b_foot=(36, 107), f_knee=(58, 93), f_foot=(57, 109),
                       b_el=(20, 63), b_hand=(18, 84), f_el=(71, 62), f_hand=(77, 84), lag=(-2, 1), vsway=-1)),
    ("walk", 170, pose(ub=(1, 1), b_knee=(36, 93), b_foot=(41, 109), f_knee=(52, 94), f_foot=(49, 109),
                       b_el=(16, 65), b_hand=(12, 87), f_el=(73, 63), f_hand=(81, 86), lag=(-1, 0), vsway=2)),
    ("walk", 170, pose(ub=(0, -1), head=(1, -1), b_knee=(31, 92), b_foot=(31, 109), f_knee=(58, 92), f_foot=(61, 107),
                       b_el=(19, 63), b_hand=(19, 84), f_el=(69, 62), f_hand=(73, 85), lag=(0, 1), vsway=1)),
    # windup: crouch, arms hauled up and back, roaring, core flares
    ("windup", 260, pose(ub=(-2, 4), head=(-1, -2), jaw=2, eye=2, tilt=-1, core=2,
                         b_knee=(28, 96), f_knee=(60, 97), b_el=(14, 48), b_hand=(13, 30),
                         f_el=(74, 50), f_hand=(80, 32), spread=-1, up=True, lag=(2, 2), vsway=3)),
    ("windup", 260, pose(ub=(-3, 6), head=(-1, -1), jaw=3, eye=2, tilt=-1, core=2,
                         b_knee=(27, 98), f_knee=(60, 99), b_el=(13, 49), b_hand=(12, 28),
                         f_el=(75, 50), f_hand=(82, 30), spread=-1, up=True, lag=(3, 3), vsway=4, shake=1)),
    # rooted: wide stance, knuckles plunged into the soil, roots spreading, core pulsing
    ("rooted", 300, pose(ub=(1, 7), head=(1, 3), jaw=1, eye=2, core=2, roots=1, plunge=True,
                         b_knee=(27, 97), b_foot=(25, 109), f_knee=(63, 98), f_foot=(66, 109),
                         b_el=(17, 74), b_hand=(15, 100), f_el=(72, 76), f_hand=(78, 100), lag=(0, 2), vsway=0)),
    ("rooted", 300, pose(ub=(1, 8), head=(1, 4), jaw=1, eye=1, core=1, roots=2, plunge=True,
                         b_knee=(27, 98), b_foot=(25, 109), f_knee=(63, 99), f_foot=(66, 109),
                         b_el=(17, 75), b_hand=(15, 100), f_el=(72, 77), f_hand=(78, 100), lag=(0, 3), vsway=1)),
    # charge: knuckle-gallop, head down and thrust forward, core streaking, dust kicked up
    ("charge", 90, pose(ub=(6, 7), head=(5, 8), jaw=2, eye=2, tilt=1, core=2, dust=1,
                        b_knee=(24, 96), b_foot=(15, 109), f_knee=(56, 95), f_foot=(52, 109),
                        b_el=(16, 74), b_hand=(10, 90), f_el=(78, 76), f_hand=(87, 98), lag=(-4, 2), vsway=-4)),
    ("charge", 90, pose(ub=(6, 4), head=(5, 6), jaw=2, eye=2, tilt=1, core=2, dust=2,
                        b_knee=(32, 94), b_foot=(30, 106), f_knee=(60, 93), f_foot=(62, 109),
                        b_el=(26, 74), b_hand=(30, 96), f_el=(74, 76), f_hand=(76, 100), lag=(-5, 0), vsway=-3)),
    ("charge", 90, pose(ub=(6, 7), head=(5, 8), jaw=3, eye=2, tilt=1, core=2, dust=1,
                        b_knee=(40, 96), b_foot=(44, 109), f_knee=(66, 94), f_foot=(70, 109),
                        b_el=(30, 76), b_hand=(38, 98), f_el=(68, 78), f_hand=(66, 100), lag=(-4, 2), vsway=-4)),
    ("charge", 90, pose(ub=(7, 3), head=(5, 5), jaw=2, eye=2, tilt=1, core=2, dust=2,
                        b_knee=(28, 93), b_foot=(22, 105), f_knee=(66, 92), f_foot=(72, 105),
                        b_el=(20, 70), b_hand=(18, 88), f_el=(80, 70), f_hand=(88, 86), lag=(-5, 0), vsway=-3)),
]

anims = {}
for i, (name, ms, p) in enumerate(POSES):
    new_frame(s, i + 1)
    draw(p)
    finish(s)
    s.frames[i].duration = ms
    anims.setdefault(name, []).append(i)
    print("frame", i + 1, name)

s.stats()
check(s, "colossus")
export(s, "colossus", anims, fps=8, anim_fps={"idle": 3, "walk": 6, "windup": 5, "rooted": 4, "charge": 11},
       scale=4, here=HERE)
