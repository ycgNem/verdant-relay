"""Snare Vine (pink bulb) - 48x64 x4 (idle 0-1 sway, attack 2-3 lash), anchor [24, 58].

A carnivorous vine grown in a rusted iron tub: a twisting stalk with broad leaves, a fleshy pink bulb on top,
creeping tendrils spilling over the rim onto the ground (they snare whatever walks past).
L1  tub, stalk, a closed bulb, two ground tendrils
L2  + a bigger bulb with glowing seams, more leaves, four tendrils
L3  + roots splitting the tub, a taller stalk, the bulb half-open with a glowing heart
3a  Root: massive gnarled roots bursting the tub and clawing the ground, pink nodules (roots enemies in place)
3b  Thorn Field: barbed vines coiled round the stalk and over the ground, a spiked bulb (damages everything)
attack: the ground tendrils lash outward and the bulb gapes open, glowing.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tlib import *  # noqa: F401,F403

VINE = ["#122016", "#1f3522", "#2f4f2c", "#456c36", "#628a44", "#8aaa5c"]
FLESH = ["#2a1020", "#4a1c34", "#6e2a4a", "#94405e", "#b65e78", "#d48a98"]
ROOT = ["#1a120c", "#2e2016", "#45301f", "#5e4429", "#7a5c38", "#98784e"]


def bez(p0, p1, p2, p3, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def curl(x, y, ang, L, k, n=14):
    """A tendril path that starts heading `ang` and curls (curvature grows toward the tip)."""
    pts = [(x, y)]
    a = ang
    for i in range(n):
        f = i / n
        a += k * (0.2 + 1.6 * f * f)
        x += math.cos(a) * L / n
        y += math.sin(a) * L / n
        pts.append((x, y))
    return pts


def tendril(g, pts, w0, w1, ramp=VINE, seed=0, barbs=False, atk=False):
    m = tube(g, pts, w0, w1, ramp, grime=0.15, seed=seed)
    if barbs:
        for i in range(3, len(pts) - 1, 4):
            (ax, ay), (bx, by) = pts[i - 1], pts[i + 1]
            tl = math.hypot(bx - ax, by - ay) or 1
            nx, ny = -(by - ay) / tl, (bx - ax) / tl
            sd = 1 if i % 2 else -1
            w = (w0 + (w1 - w0) * i / len(pts)) / 2 + 0.6
            px_, py_ = pts[i][0] + nx * sd * w, pts[i][1] + ny * sd * w
            g.px(int(px_), int(py_), ROOT[3])
            g.px(int(px_ + nx * sd + (bx - ax) / tl * 0.7), int(py_ + ny * sd + (by - ay) / tl * 0.7), RED[3] if atk else TOOTH[3])
    return m


def leaf(g, base, tip, w, bend=0.25, ramp=VINE, seed=0):
    """A broad leaf: midrib from base to tip (bent), lit half / shadow half, darker midrib."""
    (bx, by), (tx, ty) = base, tip
    L = math.hypot(tx - bx, ty - by) or 1
    ux, uy = (tx - bx) / L, (ty - by) / L
    nx, ny = -uy, ux
    n = 12
    mid = []
    for i in range(n + 1):
        t = i / n
        b = bend * L * math.sin(math.pi * t) * 0.5
        mid.append((bx + ux * L * t + nx * b, by + uy * L * t + ny * b))
    left, right = [], []
    for i, (mx, my) in enumerate(mid):
        t = i / n
        hw = w * (math.sin(math.pi * min(1, t * 1.15)) ** 0.7) / 2
        left.append((mx + nx * hw, my + ny * hw))
        right.append((mx - nx * hw, my - ny * hw))
    poly = left + right[::-1]
    m = Shape(g.w, g.h).add(poly).mask()
    lit_n = 1 if (nx * L3[0] + ny * L3[1]) > 0 else -1
    for (x, y) in m:
        best = min(range(len(mid)), key=lambda i: (mid[i][0] - x - 0.5) ** 2 + (mid[i][1] - y - 0.5) ** 2)
        off = (x + 0.5 - mid[best][0]) * nx + (y + 0.5 - mid[best][1]) * ny
        if abs(off) < 0.55 and 0 < best < n:
            ti = 1.4
        else:
            ti = 3.6 if off * lit_n > 0 else 2.2
            ti -= 0.6 * (best / n)
        put(g, x, y, ramp, ti, 0.15, seed)
    return m


TOOTH = ["#3a3226", "#6a5e4a", "#a89a7c", "#d8ccae", "#efe6cc", "#fff8e8"]


def head(g, cx, cy, rx, ry, gap, frame, seed, spiky=False, atk=False, veins=0):
    """The snare head: a fleshy pink trap pod split by a toothed mouth across its middle.
    gap 0 = shut (interlocking teeth on a dark seam); gap > 0 = the upper lobe lifts, the glowing throat shows."""
    out = set()
    breathe = 0.3 if frame == 1 else 0.0

    def lobe(yc, upper, shift):
        for y in range(int(yc - ry) - 2, int(yc + ry) + 2):
            dy = (y + 0.5 - yc) / ry
            if abs(dy) > 1 or (upper and dy > 0.02) or (not upper and dy < 0):
                continue
            w = (rx + breathe) * math.sqrt(1 - dy * dy) * (1 - 0.22 * max(0.0, -dy))
            for x in range(int(cx - rx) - 2, int(cx + rx) + 3):
                sx = (x + 0.5 - cx) / max(0.6, w)
                if abs(sx) > 1:
                    continue
                nz = math.sqrt(max(0.0, 1 - min(1.0, sx * sx * 0.85 + dy * dy * 0.7)))
                d = L3[0] * sx + L3[1] * dy + L3[2] * nz
                ti = 2.3 + d * 2.6
                if upper and abs(dy) < 0.16:
                    ti += 0.8                            # the lip catches light
                if not upper and dy < 0.14:
                    ti -= 1.0                            # lower lip under the shade of the upper one
                put(g, x, y - shift, FLESH, ti, 0.18, seed + (0 if upper else 3), out)

    lift = int(gap)
    # throat behind the lips (only when open)
    if lift:
        mrx, mry = rx - 0.8, lift / 2 + 1.2
        my = cy - lift / 2 + 0.3
        for y in range(int(my - mry) - 1, int(my + mry) + 2):
            for x in range(int(cx - mrx) - 1, int(cx + mrx) + 2):
                dx, dy = (x + 0.5 - cx) / mrx, (y + 0.5 - my) / mry
                d2 = dx * dx + dy * dy
                if d2 <= 1:
                    c = PINK[5] if d2 < 0.18 else PINK[4] if d2 < 0.5 else PINK[3] if dy > -0.3 else FLESH[1]
                    g.px(x, y, c)
                    out.add((x, y))
    lobe(cy, False, 0)
    lobe(cy, True, lift)
    # teeth on both lips
    for k, x in enumerate(range(int(cx - rx + 2), int(cx + rx - 1), 2)):
        edge = abs(x + 0.5 - cx) / rx
        L = 2 if edge < 0.6 else 1
        if lift:
            for j in range(L):
                g.px(x, int(cy) - j - 1 + (0 if j else 1), TOOTH[4 - j])              # lower jaw, up
                g.px(x + 1, int(cy - lift) + j, TOOTH[3 - j])                     # upper jaw, down
        else:
            g.px(x, int(cy), FLESH[0])
            g.px(x + 1, int(cy), FLESH[0])
            g.px(x + (k % 2), int(cy) + (1 if k % 2 else -1), TOOTH[4] if k % 2 == 0 else TOOTH[3])
    # veins on the upper lobe (glow on higher levels)
    for v in range(veins):
        vx = cx + (-0.45 if v == 0 else 0.4) * rx
        vc = PINK[3] if (atk or (frame + v) % 2 == 0) else PINK[2]
        for j in range(int(ry * 0.7)):
            x = int(round(vx + (0.4 if v else -0.4) * j * 0.5))
            y = int(cy - lift - 2 - j)
            if (x, y) in out:
                g.px(x, y, vc)
    # glossy highlight on the upper lobe
    g.px(int(cx - rx * 0.45), int(cy - lift - ry * 0.55), FLESH[5])
    g.px(int(cx - rx * 0.45) + 1, int(cy - lift - ry * 0.55), FLESH[4])
    if spiky:
        n = 6
        for i in range(n):
            a = -math.pi + (i + 0.5) * math.pi / n
            L = 3 + (i % 2) * 2 + (1 if atk else 0)
            sx, sy = cx + math.cos(a) * rx * 0.85, cy - lift + math.sin(a) * ry * 0.85
            for k in range(L):
                x, y = int(round(sx + math.cos(a) * k)), int(round(sy + math.sin(a) * k))
                if (x, y) in out and k < 2:
                    continue
                g.px(x, y, TOOTH[3] if k < L - 1 else (RED[3] if atk else TOOTH[2]))
    return out


def tub(g, seed, top=47, bot=62, r=10.5, cracked=False):
    """Rusted iron planter tub with two hoops, filled with dark soil."""
    ry = 3.6
    m = cyl(g, CX, top, bot, r, IRON, cap=False, ry=ry, grime=0.45, seed=seed, base_tone=1.5)
    rust_patches(g, m, IRON, seed, amount=0.3, scale=3.4, dst=RUST)
    for x in range(int(CX - r), int(CX + r) + 1):
        s = (x + 0.5 - CX) / r
        if abs(s) > 1:
            continue
        nz = math.sqrt(max(0.0, 1 - s * s))
        for off in (3, 9):
            y = int(round(bot - ry + ry * nz - off))
            ti = 2.6 + (L3[0] * s + L3[2] * nz) * 2.0
            g.px(x, y, tone(IRON, ti + 0.8))
            g.px(x, y + 1, tone(IRON, ti - 0.8))
    # rim and soil
    for y in range(int(top - ry) - 1, int(top + ry) + 2):
        for x in range(int(CX - r) - 1, int(CX + r) + 2):
            dx, dy = (x + 0.5 - CX) / r, (y + 0.5 - top) / ry
            d2 = dx * dx + dy * dy
            if d2 <= 1:
                if d2 > 0.66:
                    ti = 4.4 if dy > 0 else 2.8
                    put(g, x, y, IRON if h2(x, y, seed + 5) < 0.6 else RUST, ti - 0.6 * dx, 0.3, seed + 2)
                else:
                    c = ROOT[0] if h2(x, y, seed) < 0.6 else ROOT[1]
                    if dy < -0.2:
                        c = ROOT[0]
                    g.px(x, y, c)
    rust_streaks(g, [int(CX - 6), int(CX + 3), int(CX + 7)], int(top + ry + 1), 6, seed, ramp=RUST, only=set(IRON))
    if cracked:
        # a jagged split down the front, roots shoving through
        pts = [(CX - 3, top + 3), (CX - 1, top + 6), (CX - 3, top + 9), (CX - 1, top + 12), (CX - 2, bot)]
        for (a, b) in zip(pts, pts[1:]):
            g.line(a[0], a[1], b[0], b[1], RUST[0])
            g.line(a[0] + 1, a[1], b[0] + 1, b[1], ROOT[0])
    moss(g, [(int(CX - r + 1), bot - 2), (int(CX + r - 2), bot - 3), (int(CX - r + 3), top + 2)], seed)
    return m


def draw(level, branch, frame):
    g = Grid(FW, FH)
    atk = frame >= 2
    sway = 0 if frame % 2 == 0 else 1
    lash = 2 if frame == 2 else (1 if frame == 3 else 0)
    seed = 51 + level * 9 + (0 if branch is None else ord(branch))
    big = level >= 3
    root_br, thorn_br = branch == "a", branch == "b"
    barbed = thorn_br

    # ---- back tendrils (behind the tub)
    if level >= 2:
        for side in (-1, 1):
            p = curl(CX + side * 5, 46, -math.pi / 2 + side * 1.0, 11 + lash * 2, side * 0.32, n=12)
            tendril(g, p, 2.2, 1.0, seed=seed, barbs=barbed, atk=atk)

    # ---- massive roots behind (Root)
    if root_br:
        for side in (-1, 1):
            tendril(g, bez((CX + side * 5, 49), (CX + side * 13, 43), (CX + side * 19, 48), (CX + side * 21, 58)), 6.0, 2.6, ROOT, seed)

    tub(g, seed, cracked=big)

    # ---- stalk
    top_y = 30 if level == 1 else (25 if level == 2 else 21)
    if root_br:
        top_y = 24
    sw = sway
    stalk = bez((CX, 48), (CX - 5, 42), (CX + 5 + sw, top_y + 10), (CX + sw, top_y))
    tube(g, stalk, 4.6 if big else 4.0, 3.0, VINE, grime=0.2, seed=seed)
    if thorn_br:
        # barbed vines spiralling the stalk
        for ph in (0.0, math.pi):
            sp = []
            for i in range(17):
                t = i / 16
                bx, by = stalk[int(t * (len(stalk) - 1))]
                sp.append((bx + 3.2 * math.sin(t * 9 + ph), by))
            tendril(g, sp, 1.6, 1.2, ROOT, seed, barbs=True, atk=atk)

    # ---- leaves
    lv = [((CX - 1, 44), (CX - 13, 37 - sw), 6.0), ((CX + 2, 40), (CX + 13, 35 + sw), 5.5)]
    if level >= 2:
        lv += [((CX - 1, 36), (CX - 11, 29 + sw), 5.0)]
    if big and not root_br:
        lv += [((CX + 2, 33), (CX + 12, 27 - sw), 4.5)]
    for (b, t, w) in lv:
        leaf(g, b, t, w, bend=0.3 if t[0] < CX else -0.3, seed=seed)
        if thorn_br:
            g.px(int(t[0]), int(t[1]), RED[3] if atk else ROOT[4])

    # ---- the bulb
    rx, ry = (5.5, 6.0) if level == 1 else ((6.5, 6.5) if level == 2 else (7.5, 7.0))
    if root_br:
        rx, ry = 8.0, 7.5
    gap = (5 if frame == 2 else 3) if atk else (2 if (big and frame == 0) else (1 if big else 0))
    by = top_y - 2
    head(g, CX + sw, by, rx, ry, gap, frame, seed, spiky=thorn_br, atk=atk, veins=0 if level == 1 else 2)

    # ---- Root: gnarled roots bursting out the front and clawing the ground, glowing nodules
    if root_br:
        roots = [bez((CX - 2, 52), (CX - 8, 56), (CX - 14, 58), (CX - 21 - lash, 63)),
                 bez((CX + 2, 52), (CX + 9, 55), (CX + 15, 58), (CX + 22 + lash, 62)),
                 bez((CX - 1, 55), (CX - 3, 59), (CX - 6, 61), (CX - 9, 63)),
                 bez((CX + 1, 56), (CX + 4, 60), (CX + 8, 62), (CX + 12, 63))]
        for i, rt in enumerate(roots):
            tendril(g, rt, 4.6 if i < 2 else 3.0, 1.4, ROOT, seed + i)
        for i, (x, y) in enumerate(((CX - 12, 57), (CX + 13, 57), (CX - 5, 60), (CX + 7, 61), (CX - 19, 61))):
            on = atk or (i + frame) % 2 == 0
            g.px(x, y, PINK[4] if on else PINK[2])
            g.px(x + 1, y, PINK[3] if on else FLESH[2])
        # a root ring the bulb sits in
        for side in (-1, 1):
            tendril(g, bez((CX, top_y + 4), (CX + side * 6, top_y + 2), (CX + side * 9, top_y - 3), (CX + side * 8, top_y - 7)),
                    2.6, 1.2, ROOT, seed)
    else:
        # ---- ground tendrils spilling over the rim, curling on the ground; lashing out on attack
        n_front = 2 if level == 1 else 4
        specs = [(-1, 50, 13, 0.30), (1, 51, 14, -0.28), (-1, 55, 10, 0.4), (1, 56, 10, -0.42)][:n_front]
        for i, (side, y0, L, k) in enumerate(specs):
            a0 = math.pi / 2 + side * (-1.25 if i < 2 else -1.0)
            if lash:
                # whip outward along the ground in a wave, the tip flicking up
                ln = 9 + 5 * lash + (2 if i < 2 else -2)
                p = [(CX + side * (9 + j * ln / 12), y0 + 1 + (1.6 if i < 2 else 1.0) * math.sin(j * 0.9 + frame) - max(0, j - 9) * 0.9)
                     for j in range(13)]
            else:
                p = None
            p = p or curl(CX + side * 9, y0, a0, L, k + side * 0.05 * sway, n=14)
            tendril(g, p, 2.6, 1.0, seed=seed + i, barbs=barbed, atk=atk)

        if barbed:
            # a coil of barbed vine lying on the ground in front
            coil = [(CX - 16 + i * 2.0, 61.5 + 1.2 * math.sin(i * 1.3)) for i in range(17)]
            tendril(g, coil, 1.6, 1.6, ROOT, seed, barbs=True, atk=atk)
    # spores on attack
    if atk:
        for (x, y) in ((CX - 9, by - 6 - frame), (CX + 8, by - 9 + frame), (CX + 2, by - 12)):
            g.px(int(x), int(y), PINK[4] if frame == 2 else PINK[3])
    return finish(g)


VARIANTS = [("snare_vine", 1, None), ("snare_vine_2", 2, None), ("snare_vine_3", 3, None),
            ("snare_vine_3a", 3, "a"), ("snare_vine_3b", 3, "b")]

if __name__ == "__main__":
    rows = []
    for key, lv, br in VARIANTS:
        fr = [draw(lv, br, f) for f in range(4)]
        rows.append((key, save_tower(key, fr)))
        print(key, len(set(c for f in fr for c in f.colors())), "colours")
    from preview import sheet
    sheet(rows, SCRATCH / "tw_snare_vine.png")
