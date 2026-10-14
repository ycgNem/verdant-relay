"""Pulse Beacon (amber ring) - 48x64 x4 (idle 0-3: a pulse climbs the rings, then the lamp flashes), anchor [24, 58].

A salvaged radio mast: a tapered lattice pylon on an iron mount, glowing amber induction rings around it,
a brass lamp on top. It has no attack - the idle loop is the pulse that boosts nearby towers.
L1  short lattice mast, one ring, lamp
L2  + taller, two rings, a generator box at the foot
L3  + three rings, a crown of emitter prongs round the lamp
3a  Overdrive: red-hot rings, dark radiator fins up the mast, sparks (bonus attacks)
3b  Spotter: a radar dish on top and a cyan targeting lens on the mast (more damage and range)
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tlib import *  # noqa: F401,F403

HOT = ["#3a0a04", "#7a1a06", "#c8360c", "#ff6a1c", "#ffb040", "#fff0b0"]


def mast(g, top, seed, base_y=55, wb=6.0, wt=1.6):
    """Tapered lattice pylon: two rails, cross-bracing, a lit left rail and darker right rail."""
    def half(y):
        t = (base_y - y) / max(1, base_y - top)
        return wb + (wt - wb) * t
    # cross bracing first (behind the rails)
    y = base_y - 1
    k = 0
    while y > top + 3:
        h = 5 if y > top + 14 else 4
        y2 = y - h
        a, b = half(y), half(y2)
        if k % 2 == 0:
            g.line(CX - a + 1, y, CX + b - 1, y2, IRON[2])
        else:
            g.line(CX + a - 1, y, CX - b + 1, y2, IRON[2])
        for x in range(int(CX - b), int(CX + b) + 1):
            g.px(x, y2, IRON[3] if x < CX else IRON[2])
        y = y2
        k += 1
    # rails
    tube(g, [(CX - wb, base_y), (CX - wt, top)], 2.2, 1.6, IRON, grime=0.2, seed=seed)
    tube(g, [(CX + wb, base_y), (CX + wt, top)], 2.2, 1.6, IRON, grime=0.2, seed=seed + 1)
    return half


def ring(g, cy, rx, glow, lvl, front, seed, ry=None):
    """A glowing induction ring round the mast (a fat torus seen from above): the glowing top band, a brass
    under-face. Drawn in two passes: back half (front=False) before the mast, front half after.
    lvl 2 = idle (dim amber), 4 = the pulse is in this ring."""
    ry = ry or max(2.4, rx * 0.36)
    for y in range(int(cy - ry) - 2, int(cy + ry) + 4):
        for x in range(int(CX - rx) - 2, int(CX + rx) + 3):
            dx, dy = (x + 0.5 - CX) / rx, (y + 0.5 - cy) / ry
            d2 = dx * dx + dy * dy
            dyl = (y - 1.5 - cy) / ry                     # the band's under-face, 2 rows below
            d2l = dx * dx + dyl * dyl
            on_top = 0.42 <= d2 <= 1.0
            on_side = (not on_top) and 0.42 <= d2l <= 1.0 and dy > 0.1
            if not (on_top or on_side):
                continue
            is_front = dy > 0.0 or (on_side and dy > -0.3)
            if is_front != front:
                continue
            if on_side:
                put(g, x, y, BRASS, 2.2 - 1.0 * dx, 0.1, seed)
            else:
                t = lvl + (1 if (dx < -0.1 and dy < 0.2 and d2 > 0.6) else 0) - (1 if dy < -0.3 else 0)
                if d2 > 0.9 and dy > 0.3:
                    t = lvl - 1                                # the band's front lip
                g.px(x, y, glow[max(1, min(5, t))])


def halo(g, cy, rx, c, seed):
    """A dotted expanding pulse ring (the boost wave) - only where nothing is drawn yet."""
    ry = rx * 0.32
    n = int(rx * 3)
    for i in range(n):
        if i % 2:
            continue
        a = i / n * 2 * math.pi
        x, y = int(round(CX + math.cos(a) * rx)), int(round(cy + math.sin(a) * ry))
        if g.get(x, y) is None:
            g.px(x, y, c)


def draw(level, branch, frame):
    g = Grid(FW, FH)
    seed = 91 + level * 13 + (0 if branch is None else ord(branch))
    big = level >= 3
    over, spot = branch == "a", branch == "b"
    glow = HOT if over else AMBER
    base_mount(g, seed, rx=12.0)
    top = 26 if level == 1 else (18 if level == 2 else 13)
    if spot:
        top = 17
    n_r = level
    ys = {1: [44], 2: [46, 32], 3: [48, 37, 26]}[n_r]
    if spot:
        ys = [48, 37, 27]
    # which ring is lit this frame: the pulse climbs ring by ring, frame 3 = the lamp flashes
    lit_i = frame if frame < n_r else None
    if n_r == 1:
        lit_i = 0 if frame in (1, 2) else None
    # generator box (L2+), behind-left
    if level >= 2:
        box(g, 8, 15, 48, 56, 2, TEAL, grime=0.35, seed=seed + 3)
        g.px(10, 52, glow[4] if frame % 2 == 0 else glow[2])
        g.px(12, 52, glow[3])
        tube(g, [(15, 53), (19, 52)], 1.4, 1.4, RUST, seed=seed)
    half = None

    def rx_at(y):
        t = (55 - y) / max(1, 55 - top)
        return 6.0 + (1.6 - 6.0) * t
    # back halves of the rings
    for i, y in enumerate(ys):
        lvl = 4 if i == lit_i else 2
        ring(g, y, rx_at(y) + 4.5, glow, lvl, False, seed + i)
    half = mast(g, top, seed)
    if over:
        # radiator fins up the mast (dark plates sticking out to both sides)
        for y in range(top + 6, 52, 4):
            w = rx_at(y) + 3
            for x in range(int(CX - w), int(CX + w) + 1):
                if abs(x + 0.5 - CX) > rx_at(y) - 0.5:
                    g.px(x, y, IRON[1] if x > CX else IRON[3])
                    g.px(x, y + 1, IRON[0])
    # front halves
    for i, y in enumerate(ys):
        lvl = 4 if i == lit_i else 2
        ring(g, y, rx_at(y) + 4.5, glow, lvl, True, seed + i)
        if i == lit_i:
            halo(g, y, rx_at(y) + 8.0, glow[3], seed)
    # lamp on top
    if spot:
        # radar dish facing right-up on a pivot, feed horn; cyan targeting lens on the mast
        sphere(g, CX, top - 1, 2.0, IRON, base=2.2)
        dx0, dy0 = CX + 1, top - 7
        ang = math.radians(-35)
        ca, sa = math.cos(ang), math.sin(ang)
        for y in range(dy0 - 9, dy0 + 9):
            for x in range(dx0 - 9, dx0 + 10):
                px_, py_ = x + 0.5 - dx0, y + 0.5 - dy0
                u = px_ * ca + py_ * sa            # along the dish's face
                v = -px_ * sa + py_ * ca           # through the dish (toward where it points: -v)
                d2 = (u / 7.5) ** 2 + (v / 3.4) ** 2
                if d2 > 1:
                    continue
                inner = (u / 6.0) ** 2 + ((v + 0.9) / 2.2) ** 2 <= 1
                if inner:
                    ti = 4.4 - 0.5 * (u / 6.0) + 0.4 * (v / 2.2)
                else:
                    ti = 2.4 - 0.9 * (u / 7.5) if v < 0 else 1.6 - 0.6 * (u / 7.5)
                put(g, x, y, CERA, ti, 0.12, seed)
        # feed horn on a strut out of the dish's centre
        fx, fy = dx0 + sa * 5.5, dy0 - ca * 5.5
        tube(g, [(dx0, dy0), (fx, fy)], 1.2, 1.0, IRON, seed=seed)
        g.px(int(fx), int(fy), CYAN[4] if frame % 2 == 0 else CYAN[3])
        g.px(int(fx) + 1, int(fy), CYAN[3])
        # sweep: the dish's beam tick
        if frame == 3:
            for k in range(3):
                g.px(int(fx) + 3 + k * 2, int(fy) - 2 - k * 2, CYAN[4] if k == 0 else CYAN[3])
        # targeting lens
        ly = 41
        box(g, CX + 3, CX + 8, ly - 2, ly + 2, 1, IRON, grime=0.2, seed=seed + 7)
        g.px(CX + 8, ly, CYAN[5] if frame in (0, 2) else CYAN[4])
        g.px(CX + 7, ly, CYAN[3])
        g.px(CX + 8, ly + 1, CYAN[2])
    else:
        lamp_on = frame == 3
        if big:
            # crown of emitter prongs
            for side in (-1, 0, 1):
                tube(g, [(CX + side * 1.5, top + 1), (CX + side * 5, top - 5 - (2 if side == 0 else 0))], 1.6, 1.0, BRASS, seed=seed)
                g.px(int(CX + side * 5), int(top - 6 - (2 if side == 0 else 0)), glow[5] if lamp_on else glow[3])
        cyl(g, CX, top - 1, top + 2, 2.6, BRASS, grime=0.1, seed=seed, ry=1.2)
        sphere(g, CX, top - 3, 2.8 if level == 1 else 3.2, glow, base=3.0 if lamp_on else 2.0)
        if lamp_on:
            for (dx, dy) in ((-6, -3), (6, -3), (0, -9), (-4, -7), (4, -7)):
                g.px(CX + dx, top - 3 + dy, glow[4] if abs(dx) > 5 or dy < -8 else glow[3])
    if over:
        # sparks jumping off the hot rings
        for k, (x, y) in enumerate(((CX - 11, ys[0] - 3), (CX + 10, ys[1] - 2), (CX - 8, ys[2] - 4), (CX + 9, ys[2] + 2))):
            if (k + frame) % 2 == 0:
                g.px(x, y, HOT[5])
                g.px(x + (1 if k % 2 else -1), y - 1, HOT[3])
    return finish(g)


VARIANTS = [("pulse_beacon", 1, None), ("pulse_beacon_2", 2, None), ("pulse_beacon_3", 3, None),
            ("pulse_beacon_3a", 3, "a"), ("pulse_beacon_3b", 3, "b")]

if __name__ == "__main__":
    rows = []
    for key, lv, br in VARIANTS:
        fr = [draw(lv, br, f) for f in range(4)]
        rows.append((key, save_tower(key, fr)))
        print(key, len(set(c for f in fr for c in f.colors())), "colours")
    from preview import sheet
    sheet(rows, SCRATCH / "tw_pulse_beacon.png")
