"""Arc Spire (cyan) - 48x64 x4 (idle 0-1 crackle, attack 2-3 discharge), anchor [24, 58].

A salvaged Tesla coil: iron mount, a copper-wound column through stacked ceramic insulators, a cyan orb on top.
L1  3 insulators, small orb in a copper cradle
L2  + taller (5 insulators), copper horn prongs either side with spark tips, bigger orb
L3  + a steel toroid ring under a large orb, braced legs
3a  Storm: a crown of three orbs on prongs, arcs leaping between them (chains to many)
3b  Lance: a tall focusing needle through two lens rings above the orb, a white-hot tip (one big bolt)
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tlib import *  # noqa: F401,F403

COPPER = ["#2a120a", "#4e2412", "#7a3c1c", "#a85a2c", "#cf8048", "#f0b07a"]


def bolt(g, a, b, seed, c=CYAN[4], core=CYAN[5], jag=2.0):
    """Jagged lightning from a to b (1 px), white core segments."""
    rnd = random.Random(seed)
    n = max(3, int(math.dist(a, b) / 3))
    pts = [a]
    for i in range(1, n):
        t = i / n
        x = a[0] + (b[0] - a[0]) * t + rnd.uniform(-jag, jag)
        y = a[1] + (b[1] - a[1]) * t + rnd.uniform(-jag, jag)
        pts.append((x, y))
    pts.append(b)
    for i, (p, q) in enumerate(zip(pts, pts[1:])):
        g.line(p[0], p[1], q[0], q[1], core if i % 2 == 0 else c)


def insulator(g, cx, y, r, seed):
    """One porcelain disc: a thin flat cylinder - bright top lip, dark underside, so stacked discs separate."""
    ry = max(1.2, r * 0.32)
    for x in range(int(cx - r) - 1, int(cx + r) + 2):
        for yy in range(int(y - ry) - 1, int(y + ry) + 3):
            dx = (x + 0.5 - cx) / r
            if abs(dx) > 1:
                continue
            top_d = dx * dx + ((yy + 0.5 - y) / ry) ** 2
            bot_d = dx * dx + ((yy + 0.5 - (y + 1.5)) / ry) ** 2
            if top_d <= 1:
                ti = 4.6 - 1.3 * dx if top_d > 0.55 and yy + 0.5 > y else 3.6 - 1.0 * dx
                put(g, x, yy, CERA, ti, 0.1, seed)
            elif bot_d <= 1:
                put(g, x, yy, CERA, 2.0 - 1.0 * dx, 0.1, seed)


def draw(level, branch, frame):
    g = Grid(FW, FH)
    atk = frame >= 2
    seed = 37 + level * 7 + (0 if branch is None else ord(branch))
    base_mount(g, seed, rx=12.5)
    tall = level >= 2
    big = level >= 3
    if big:
        for side in (-1, 1):
            tube(g, [(CX + side * 11, 58), (CX + side * 5, 40)], 2.4, 1.8, IRON, grime=0.3, seed=seed + side)
    col_top = (24 if branch == 'b' else 20) if big else (20 if tall else 28)
    # copper-wound column
    cyl(g, CX, col_top, 56, 3.2, COPPER, grime=0.15, seed=seed, base_tone=2.4)
    for y in range(col_top + 1, 55, 2):
        for x in range(CX - 3, CX + 4):
            if g.get(x, y) in COPPER:
                g.px(x, y, COPPER[1] if x > CX + 1 else COPPER[2])
    # insulator stack
    n_ins = 3 if level == 1 else 5
    for i in range(n_ins):
        y = 51 - i * (5 if tall else 6)
        insulator(g, CX, y, 5.8 - i * 0.4, seed + i)
    # top: orb (and what holds it)
    oy = col_top - (4 if big else 3)
    orb_r = 3.4 if level == 1 else (4.2 if level == 2 else 5.0)
    glow = 3.2 if atk else (2.6 if frame == 0 else 2.2)
    if branch == "a":
        # Storm: three orbs on copper prongs
        heads = [(CX - 9, oy - 2), (CX + 9, oy - 2), (CX, oy - 9)]
        for (hx, hy) in heads:
            tube(g, [(CX, col_top + 1), (hx, hy + 3)], 2.0, 1.6, COPPER, grime=0.1, seed=seed)
        cyl(g, CX, col_top, col_top + 3, 6.5, IRON, grime=0.15, seed=seed, ry=2.4)
        for i, (hx, hy) in enumerate(heads):
            sphere(g, hx, hy, 3.0, CYAN, base=glow + (0.4 if (i + frame) % 3 == 0 else 0))
        if atk:
            bolt(g, heads[0], heads[2], seed + frame)
            bolt(g, heads[1], heads[2], seed + frame + 9)
            bolt(g, heads[1], (CX + 19, oy + 6), seed + frame + 3, jag=2.4)
        else:
            bolt(g, (heads[0][0] + 2, heads[0][1] - 2), (heads[2][0] - 2, heads[2][1] + 1), seed + frame, c=CYAN[3], core=CYAN[4], jag=1.2) if frame == 0 else None
    elif branch == "b":
        # Lance: orb in a collar, a tall focusing needle through two lens rings
        cyl(g, CX, col_top, col_top + 3, 5.5, IRON, grime=0.15, seed=seed, ry=2.0)
        sphere(g, CX, oy, orb_r, CYAN, base=glow)
        ny0 = oy - orb_r - 1
        for y in range(2, int(ny0) + 1):
            t = (y - 2) / max(1, ny0 - 2)
            w = 0.6 + 1.6 * t
            for x in range(int(CX - w), int(CX + w) + 1):
                g.px(x, y, CERA[4] if x <= CX - 1 + (0 if t < 0.5 else 0) else CERA[2])
        for ry_ in (int(oy - orb_r - 6), int(oy - orb_r - 13)):
            cyl(g, CX, ry_, ry_ + 1, 4.2 if ry_ > 10 else 3.2, COPPER, grime=0.05, seed=seed, ry=1.4)
            g.px(CX - 3, ry_, CYAN[4] if atk else CYAN[3])
        g.px(CX, 1, CYAN[5] if atk else CYAN[4])
        g.px(CX, 2, CYAN[4])
        if atk:
            for k in range(1, 4):
                g.px(CX + k, 1 - (k // 3), CYAN[4] if k < 3 else CYAN[3])
                g.px(CX - k, 1, CYAN[3])
            g.px(CX, 0, CYAN[5])
    else:
        if big:
            # toroid top-load
            for y in range(int(oy + 1), int(oy + 7)):
                for x in range(CX - 11, CX + 12):
                    dx, dy = (x + 0.5 - CX) / 10.5, (y + 0.5 - (oy + 4)) / 2.6
                    d = dx * dx + dy * dy
                    if d <= 1:
                        inner = ((x + 0.5 - CX) / 5.0) ** 2 + ((y + 0.5 - (oy + 3.4)) / 1.2) ** 2 <= 1
                        if inner:
                            continue
                        ti = 2.8 - 1.6 * dx - 1.4 * dy
                        put(g, x, y, IRON, ti, 0.15, seed)
        else:
            # copper cradle
            for side in (-1, 1):
                tube(g, [(CX + side * 1, col_top + 1), (CX + side * (orb_r + 1), oy + 1), (CX + side * (orb_r - 0.5), oy - 2)],
                     1.6, 1.4, COPPER, grime=0.05, seed=seed)
        if tall and not big:
            for side in (-1, 1):
                tube(g, [(CX + side * 3, col_top + 8), (CX + side * 9, col_top + 4), (CX + side * 10, col_top - 2)], 2.0, 1.2, COPPER, seed=seed)
                g.px(CX + side * 10, col_top - 3, CYAN[4] if (frame + (side > 0)) % 2 else CYAN[3])
        sphere(g, CX, oy, orb_r, CYAN, base=glow)
        if atk:
            bolt(g, (CX + orb_r - 1, oy - 1), (CX + 17, oy - 7 + frame * 3), seed + frame, jag=2.6)
            bolt(g, (CX - orb_r + 1, oy - 1), (CX - 16, oy - 2 - frame * 2), seed + frame + 5, jag=2.6)
            if big:
                bolt(g, (CX + 2, oy - orb_r), (CX + 8, 1), seed + frame + 11)
        elif frame == 0:
            g.px(CX + int(orb_r) + 1, oy - 2, CYAN[4])
            g.px(CX + int(orb_r) + 2, oy - 3, CYAN[3])
    # cable to a little capacitor box at the foot
    box(g, 30, 36, 50, 56, 2, TEAL, grime=0.3, seed=seed + 4)
    g.px(32, 53, CYAN[3] if frame % 2 == 0 or atk else CYAN[2])
    tube(g, [(30, 53), (27, 51)], 1.4, 1.4, RUST, seed=seed)
    return finish(g)


VARIANTS = [("arc_spire", 1, None), ("arc_spire_2", 2, None), ("arc_spire_3", 3, None),
            ("arc_spire_3a", 3, "a"), ("arc_spire_3b", 3, "b")]

if __name__ == "__main__":
    rows = []
    for key, lv, br in VARIANTS:
        fr = [draw(lv, br, f) for f in range(4)]
        rows.append((key, save_tower(key, fr)))
        print(key, len(set(c for f in fr for c in f.colors())), "colours")
    from preview import sheet
    sheet(rows, SCRATCH / "tw_arc_spire.png")
