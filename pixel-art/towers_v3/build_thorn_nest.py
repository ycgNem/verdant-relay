"""Thorn Nest (purple sap) - 48x64 x4 (idle 0-1, attack 2-3), anchor [24, 58].

A woven twig basket on a gnarled stump, bristling with pale bone thorns, a pool of glistening purple sap inside.
L1  basket + thorns + sap pool
L2  + a bigger basket, more thorns, purple sap glands on the weave
L3  + raised on a thicker trunk, a glowing sap core, a crown of long thorns
3a  Briar: bramble vines sprawl out wide around it with purple blossoms (the slow splashes)
3b  Hornet: a tall conical hive of needle spines with glowing openings (fast, hard thorns)
attack: thorns bristle outward and the sap flares; idle: the sap's highlight shifts.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tlib import *  # noqa: F401,F403

BONE = ["#2a2018", "#4a3a2a", "#7a6650", "#a8927a", "#cdbda2", "#ece0c8"]


def stump(g, seed, top=47, rx=9.0, wide=False):
    """A gnarled stump with roots clawing into the ground (front bottom on row 63)."""
    # roots
    roots = [[(CX - 4, 56), (CX - 10, 60), (CX - 16, 62)], [(CX + 4, 56), (CX + 11, 60), (CX + 17, 63)],
             [(CX - 1, 58), (CX - 4, 62), (CX - 6, 63)], [(CX + 2, 58), (CX + 5, 62)]]
    if wide:
        roots += [[(CX - 6, 54), (CX - 15, 57), (CX - 21, 60)], [(CX + 6, 54), (CX + 16, 56), (CX + 22, 59)]]
    for rt in roots:
        tube(g, rt, 3.6, 1.4, WOOD, grime=0.3, seed=seed)
    cyl(g, CX, top, 59, rx, WOOD, grime=0.5, seed=seed, base_tone=1.5, capramp=WOOD)
    # bark furrows
    for x in (int(CX - rx * 0.5), int(CX + 1), int(CX + rx * 0.6)):
        for y in range(top + 3, 58):
            if (y + x) % 5 and g.get(x, y) is not None:
                g.px(x, y, WOOD[1])
    moss(g, [(int(CX - rx + 1), top + 2), (int(CX - rx + 2), 58), (int(CX + rx - 2), 57)], seed)


def thorn(g, x, y, ang, L, w=3.0, tip=PURP[2], bend=0.35):
    """A curved claw thorn: tapered stroke bending upward (toward -y) along its length, lit on the light side."""
    pts = []
    a = ang
    px_, py_ = x, y
    n = max(3, int(L))
    for i in range(n + 1):
        pts.append((px_, py_))
        # bend toward 'up' a little each step
        ux, uy = math.cos(a), math.sin(a)
        cross = ux * -1 - uy * 0
        a += bend / n * (1 if math.cos(a) < 0 else -1) if abs(math.sin(a) + 1) > 0.2 else 0
        px_ += math.cos(a) * L / n
        py_ += math.sin(a) * L / n
    poly = stroke_poly(pts, lambda f: 0.5 + (w - 0.5) * (1 - f) ** 1.2)
    m = Shape(g.w, g.h).add(poly).mask()
    for (qx, qy) in m:
        best = min(range(len(pts)), key=lambda i: (pts[i][0] - qx - 0.5) ** 2 + (pts[i][1] - qy - 0.5) ** 2)
        t = best / (len(pts) - 1)
        i0, i1 = max(0, best - 1), min(len(pts) - 1, best + 1)
        tx, ty = pts[i1][0] - pts[i0][0], pts[i1][1] - pts[i0][1]
        tl = math.hypot(tx, ty) or 1
        nx, ny = -ty / tl, tx / tl
        side = (qx + 0.5 - pts[best][0]) * nx + (qy + 0.5 - pts[best][1]) * ny
        lit = side * (nx * L3[0] + ny * L3[1]) > -0.2
        if t > 0.78:
            c = tip
        elif t > 0.6:
            c = BONE[3] if lit else BONE[1]
        else:
            c = BONE[4] if lit else BONE[2]
        g.px(qx, qy, c)
    return m


def basket(g, seed, cx, top, bot, rx, ramp=WOOD):
    """Woven twig bowl: rim ellipse at `top`, rounded bottom at `bot`; criss-cross weave, lit top-left."""
    ry_rim = rx * 0.36
    out = set()
    for y in range(int(top - ry_rim), bot + 1):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            # bowl profile: full width at the rim, narrowing toward the bottom
            t = (y - top) / max(1, bot - top)
            w = rx * math.sqrt(max(0.0, 1 - max(0.0, t) ** 2.2)) if t > 0 else rx * math.sqrt(max(0.0, 1 - ((y + 0.5 - top) / ry_rim) ** 2))
            if abs(x + 0.5 - cx) > w:
                continue
            s = (x + 0.5 - cx) / rx
            u, v = (x + y) % 6, (x - y + 60) % 6
            weave = (u < 3) != (v < 3)
            edge = u in (0, 3) or v in (0, 3)
            ti = 2.3 - 1.3 * s - 0.9 * max(0.0, t) + (0.7 if weave else -0.3) - (0.9 if edge else 0)
            put(g, x, y, ramp, ti, 0.3, seed, out)
    # rim: a thick lip
    for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
        for y in range(int(top - ry_rim) - 1, int(top + ry_rim) + 2):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - top) / ry_rim
            d = dx * dx + dy * dy
            if 0.62 < d <= 1.08:
                ti = 4.6 if (dy < 0 and dx < 0.3) else 3.4 if dy < 0 else 3.8
                if dy > 0:
                    ti = 4.2 - dx
                put(g, x, y, ramp, ti, 0.25, seed + 1, out)
                out.add((x, y))
    return out


def sap_pool(g, cx, cy, rx, ry, frame, glow=False):
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            d = dx * dx + dy * dy
            if d <= 1:
                ti = 2 + (1 if dy > 0.1 else 0) + (1 if glow else 0)
                g.px(x, y, PURP[min(5, ti)])
    hx = int(cx - rx * 0.4) + (frame % 2)
    g.px(hx, int(cy - ry * 0.3), PURP[5])
    g.px(hx + 1, int(cy - ry * 0.3), PURP[4])


def drips(g, xs, y0, frame):
    for i, x in enumerate(xs):
        L = 2 + (i * 7 + frame) % 4
        for k in range(L):
            if g.get(x, y0 + k) is not None:
                g.px(x, y0 + k, PURP[3] if k < L - 1 else PURP[4])


def draw(level, branch, frame):
    g = Grid(FW, FH)
    atk = frame >= 2
    ext = 2 if frame == 2 else (1 if frame == 3 else 0)        # thorns bristle on attack
    seed = 23 + level * 5 + (0 if branch is None else ord(branch))
    raised = level >= 3
    stump(g, seed, top=50 if raised else 49, rx=8.5 if raised else 8.0, wide=branch == "a")
    if raised:
        cyl(g, CX, 38, 50, 5.5, WOOD, grime=0.5, seed=seed + 1, base_tone=1.6)
    btop = 26 if raised else (32 if level == 2 else 35)
    bbot = btop + (14 if level >= 2 else 12)
    rx = 13.5 if level >= 2 else 12.0
    if branch == "b":
        # Hornet: a tall conical hive of needle spines instead of an open bowl
        hive_top = 6
        poly = [(CX, hive_top), (CX + 12, bbot - 2), (CX + 9, bbot + 2), (CX - 9, bbot + 2), (CX - 12, bbot - 2)]
        hm = Shape(FW, FH).add(poly).mask()
        for (x, y) in hm:
            band = ((y - hive_top) // 3) % 2
            s = (x + 0.5 - CX) / 12
            put(g, x, y, WOOD, 2.8 - 1.5 * s + (0.6 if band else -0.4) - 0.6 * (y - hive_top) / (bbot - hive_top), 0.3, seed)
        # glowing openings
        for i, (x, y) in enumerate(((CX - 3, 18), (CX + 3, 24), (CX - 5, 30), (CX + 5, 33), (CX, 12))):
            c = PURP[5] if (atk and i % 2 == frame % 2) else PURP[4] if i % 2 == frame % 2 else PURP[3]
            g.px(x, y, c)
            g.px(x + 1, y, PURP[3])
            g.px(x, y + 1, PURP[2])
            g.px(x + 1, y + 1, PURP[1])
        # needle spines
        for i in range(14):
            a = -math.pi / 2 + (i - 6.5) * 0.2
            L = 8 + (i * 5) % 6 + ext * 2
            sx = CX + (i - 6.5) * 1.6
            sy = hive_top + 6 + abs(i - 6.5) * 2.4
            thorn(g, sx, sy, a, L, w=2.0, tip=RED[3] if atk else PURP[3])
        for i in range(6):
            side = -1 if i % 2 else 1
            thorn(g, CX + side * (10 - i), bbot - 4 - i * 3, math.pi / 2 + side * (1.6 - 0.1 * i) - math.pi / 2 + (0 if side > 0 else math.pi),
                  6 + ext, w=2.2, tip=PURP[3])
        drips(g, [CX - 6, CX + 2, CX + 7], bbot + 1, frame)
        return finish(g)
    # back thorns (behind the basket)
    backs = [(-0.9, 7), (-0.35, 9), (0.25, 8), (0.8, 7)] if level == 1 else             [(-1.05, 8), (-0.6, 10), (-0.25, 7), (0.15, 11), (0.55, 9), (0.95, 8)]
    for i, (da, L) in enumerate(backs):
        L = L + ext + (3 if raised else 0)
        thorn(g, CX + da * rx * 0.75, btop - 1, -math.pi / 2 + da * 0.9, L, tip=PURP[2] if not atk else PURP[4])
    basket(g, seed, CX, btop, bbot, rx)
    sap_pool(g, CX, btop - 0.5, rx * 0.66, rx * 0.22, frame, glow=atk or raised)
    if raised:
        sphere(g, CX + 0.5, btop - 2.0, 3.6, PURP, seed=seed, base=2.8 + (0.8 if atk else 0))
    # front thorns poking out of the weave (radiating sideways and down)
    fronts = [(-1, 0.2, 7), (1, 0.3, 8), (-1, 0.75, 5)]
    if level >= 2:
        fronts += [(1, 0.8, 6), (-1, 0.45, 8), (0, 0.6, 4)]
    for side, t, L in fronts:
        y = btop + (bbot - btop) * t
        wdt = rx * math.sqrt(max(0.05, 1 - t ** 2.2))
        if side == 0:
            thorn(g, CX + 1, bbot - 2, math.pi / 2 - 0.2, L + ext, tip=PURP[3])
            continue
        a = (0.15 + t * 0.6) * (1 if side > 0 else -1)
        ang = a if side > 0 else math.pi - abs(a) * -1 - 2 * abs(a)
        ang = (0.0 + t * 0.6) if side > 0 else (math.pi - t * 0.6)
        thorn(g, CX + side * (wdt - 1.5), y, ang, L + ext, tip=PURP[3] if not atk else PURP[4])
    if level >= 2:
        # sap glands on the weave
        for (x, y) in ((CX - 7, btop + 6), (CX + 6, btop + 9), (CX - 2, btop + 11)):
            sphere(g, x, y, 1.8, PURP, base=2.6 + (0.8 if atk else 0))
    drips(g, [CX - 8, CX - 3, CX + 4, CX + 9], btop + 2, frame)
    if branch == "a":
        # Briar: bramble vines sprawl wide over the ground and around the stump, purple blossoms
        for side in (-1, 1):
            vine = [(CX + side * 6, 52), (CX + side * 13, 49), (CX + side * 19, 53), (CX + side * 22, 47)]
            tube(g, vine, 2.0, 1.4, ["#1a0f14", "#2e1a22", "#4a2a30", "#6a3e3e", "#8a5a4e", "#a87a62"], grime=0.1, seed=seed)
            for k, (x, y) in enumerate(vine[1:]):
                thorn(g, x, y, -math.pi / 2 + side * 0.6, 3, w=1.4, tip=BONE[3])
                thorn(g, x, y, math.pi / 2 - side * 0.3, 2, w=1.2, tip=BONE[3])
            for (x, y) in ((CX + side * 13, 47), (CX + side * 21, 45)):
                for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
                    g.px(x + dx, y + dy, PURP[4] if atk else PURP[3])
                g.px(x, y, AMBER[4])
        # vines climbing the basket
        tube(g, [(CX - 10, 50), (CX - 13, btop + 8), (CX - 9, btop + 2)], 1.6, 1.2,
             ["#1a0f14", "#2e1a22", "#4a2a30", "#6a3e3e", "#8a5a4e", "#a87a62"], grime=0.1)
    return finish(g)


VARIANTS = [("thorn_nest", 1, None), ("thorn_nest_2", 2, None), ("thorn_nest_3", 3, None),
            ("thorn_nest_3a", 3, "a"), ("thorn_nest_3b", 3, "b")]

if __name__ == "__main__":
    rows = []
    for key, lv, br in VARIANTS:
        fr = [draw(lv, br, f) for f in range(4)]
        rows.append((key, save_tower(key, fr)))
        print(key, len(set(c for f in fr for c in f.colors())), "colours")
    from preview import sheet
    sheet(rows, SCRATCH / "tw_thorn_nest.png")
