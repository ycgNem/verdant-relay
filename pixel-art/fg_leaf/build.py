"""Verdant Relay - foreground leaf frame (critic H #5): five near-black silhouettes that frame the jungle view.

fg_leaf_1  monstera   144x128  stem enters at the bottom-left corner, blade reaches up-right
fg_leaf_2  palm frond 160x96   rachis enters at the top-left corner, arcs right and droops
fg_leaf_3  banana     112x160  rises from the bottom edge, torn into strips, tip bends right
fg_leaf_4  fern frond 128x112  rises from the bottom-right corner, arches up-left, tip curls
fg_leaf_5  vine        48x160  hangs from the top edge: two strands with small heart leaves

Palette: D0 #050a06 (shadow half / veins), D1 #0a160c (body), D2 #0f2013 (midrib sheen),
rim R1 #16301c / R2 #20402a on the edges that face the top-left light. Hard alpha.
Run: python pixel-art/fg_leaf/build.py
"""
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
from v3lib import (Grid, Shape, Path2, interp, stroke_poly, ellipse_poly, clean_mask, edge_normal,  # noqa: E402
                   is_edge, lit, save_sprite, report, board, up, SCRATCH)
from PIL import Image  # noqa: E402

D0, D1, D2, R1, R2 = "#050a06", "#0a160c", "#0f2013", "#16301c", "#20402a"


def shade(g, M, litm, rim1=0.28, rim2=0.78, inner=0.6):
    """Body: lit half D1, rest D0. Rim on top-left-facing edges; strong rims get a D2 texel inside."""
    for x, y in M:
        g.px(x, y, D1 if (x, y) in litm else D0)


def rim(g, M, rim1=0.28, rim2=0.80, inner=0.62, holes_soft=None):
    edges = [p for p in M if is_edge(M, *p)]
    marks = []
    for x, y in edges:
        n = edge_normal(M, x, y, 2)
        k = lit(n)
        soft = holes_soft and (x, y) in holes_soft
        if k > rim2 and not soft:
            marks.append((x, y, R2, n))
        elif k > rim1:
            marks.append((x, y, R1, n))
    for x, y, c, n in marks:
        g.px(x, y, c)
    # strong rims: one texel of sheen just inside
    for x, y, c, n in marks:
        if c == R2:
            ix, iy = int(round(x - n[0])), int(round(y - n[1]))
            if (ix, iy) in M and g.get(ix, iy) in (D0, D1):
                g.px(ix, iy, D2)


def lone_fix(g, M):
    """Rim texels with no rim neighbour read as specks: demote R2 singles to R1, R1 singles to the body."""
    for _ in range(2):
        for x, y in list(M):
            c = g.get(x, y)
            if c in (R1, R2):
                nb = [g.get(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1))]
                if not any(n in (R1, R2) for n in nb):
                    g.px(x, y, R1 if c == R2 else D1)
                elif c == R2 and R2 not in nb:
                    g.px(x, y, R1)


# =========================================================================== 1 monstera
def monstera():
    W, H = 144, 128
    # broad, heart-shaped blade: nearly as wide as long, midrib arcing from the sinus up-right
    mid = Path2([(46, 84), (68, 64), (100, 34), (134, 30)])
    Wd = 53.0
    prof = [(0.0, 0.68), (0.08, 0.9), (0.2, 1.0), (0.32, 1.0), (0.46, 0.92), (0.6, 0.78),
            (0.73, 0.58), (0.84, 0.36), (0.93, 0.15), (1.0, 0.0)]
    side_k = {+1: 1.0, -1: 0.9}

    def hw(u, s):
        return Wd * interp(prof, u) * side_k[s]

    def half_outline(s):
        """Sinus -> basal lobe -> margin -> tip for side s (+1 down-right, -1 up-left)."""
        pts = []
        lobe = [(-0.0, 0.06), (-0.05, 0.12), (-0.11, 0.28), (-0.135, 0.45), (-0.12, 0.6), (-0.07, 0.67), (0.0, 0.66)]
        for u, f in lobe:
            pts.append(mid.local(u, s * f * Wd * side_k[s]))
        for i in range(1, 81):
            u = i / 80
            pts.append(mid.local(u, s * hw(u, s)))
        return pts

    R = half_outline(+1)
    Lh = half_outline(-1)
    blade = Shape(W, H)
    blade.add(R + Lh[::-1])
    # petiole: from below the bottom-left corner into the sinus
    pet = Path2([(-6, 136), (10, 118), (28, 100), (46, 84)])
    blade.add(stroke_poly([pet.at(i / 30) for i in range(31)], 7.0, 4.2))

    # pinnate cuts from the margin (gaps open toward the margin, curve toward the tip) + fenestrations
    rnd = random.Random(7)
    # (u, gap width at the margin, depth as a share of the half-width left uncut)
    cuts = {+1: [(0.1, 4.2, 0.5), (0.215, 6.2, 0.36), (0.315, 4.6, 0.4), (0.44, 6.8, 0.33), (0.545, 5.0, 0.38),
                 (0.66, 6.0, 0.36), (0.775, 4.2, 0.46)],
            -1: [(0.065, 3.8, 0.55), (0.17, 5.6, 0.4), (0.3, 6.6, 0.34), (0.405, 4.4, 0.42), (0.52, 6.4, 0.35),
                 (0.64, 5.2, 0.4), (0.76, 4.0, 0.5)]}
    holes = []
    for s, us in cuts.items():
        for j, (u, gap, depth) in enumerate(us):
            # cut centreline bends like a lateral vein (outward and toward the tip)
            pts = []
            for i in range(9):
                f = i / 8
                uu = u + 0.12 * f ** 1.3
                pts.append(mid.local(uu, s * hw(uu, s) * (depth + (1.35 - depth) * f)))
            blade.cut(stroke_poly(pts, 1.3, gap))
            blade.cut(ellipse_poly(pts[0][0], pts[0][1], 0.8, 0.8))
            # a slot-shaped fenestration in some segments, in a row near the midrib
            if j < len(us) - 1 and 0.12 < u < 0.66 and (j + (s > 0)) % 3 != 2:
                uh = (u + us[j + 1][0]) / 2 + 0.02
                c = mid.local(uh, s * hw(uh, s) * 0.2)
                tx, ty = mid.tan(uh)
                ang = math.atan2(ty, tx) + s * 1.05
                holes.append((c, ang, 4.0 + 1.2 * ((j + (s > 0)) % 2), 1.6))
    for c, ang, a, b in holes:
        blade.cut(ellipse_poly(c[0], c[1], a, b, ang))
    M = clean_mask(blade.mask(), W, H)

    # lit half = the up-left side of the midrib (v < 0)
    half = Shape(W, H)
    half.add(Lh + [mid.local(1 - i / 40, 0) for i in range(41)])
    litm = half.mask() & M
    g = Grid(W, H)
    shade(g, M, litm)
    # lateral veins: one per segment, from the midrib toward the segment tip
    for s, us in cuts.items():
        for j, (u, _, _) in enumerate(us[:-1]):
            uv = (u + us[j + 1][0]) / 2 - 0.01
            pts = []
            for i in range(7):
                f = i / 6
                uu = uv + 0.1 * f ** 1.3
                pts.append(mid.local(uu, s * hw(uu, s) * (0.06 + 0.8 * f)))
            g.polyline(pts, D0 if s < 0 else D1, only={D1, D0})
    # midrib (raised, catches a little light) and petiole sheen
    for i in range(0, 95):
        u = i / 100
        p = mid.local(u, -0.6)
        g.px(p[0], p[1], D2, only={D0, D1})
    for i in range(0, 31):
        p = pet.at(i / 30)
        n = pet.nrm(i / 30)
        g.px(p[0] - n[0] * 1.2, p[1] - n[1] * 1.2, D2, only={D0, D1})
    rim(g, M)
    lone_fix(g, M)
    return g


# =========================================================================== 2 palm frond
def palm():
    W, H = 160, 96
    rach = Path2([(-6, 24), (46, 4), (106, 16), (156, 86)])
    S = Shape(W, H)
    S.add(stroke_poly([rach.at(i / 60) for i in range(61)], 3.8, 1.3))
    leaflets = []
    rnd = random.Random(29)
    u = 0.03
    k = 0
    while u < 0.975:
        for s in (+1, -1):
            if rnd.random() < 0.08 and 0.2 < u < 0.9:
                continue                      # a missing leaflet now and then breaks the comb
            uu = u + (0.013 if s < 0 else 0) + rnd.uniform(-0.004, 0.004)
            p = rach.at(uu)
            t = rach.tan(uu)
            n = rach.nrm(uu)
            env = math.sin(math.pi * min(1.0, 0.08 + uu * 0.95)) ** 0.65
            if s > 0:   # near side: long, fanning out and down
                ln = (8 + 40 * env) * (0.84 + rnd.uniform(-0.1, 0.16))
                lean = 0.42 + 0.25 * uu + rnd.uniform(-0.15, 0.15)
                sag = 0.2 + rnd.uniform(-0.08, 0.1)
                wbase = 3.7
            else:       # far side: foreshortened, rising then arching over
                ln = (5 + 22 * env) * (0.84 + rnd.uniform(-0.1, 0.16))
                lean = 1.0 + rnd.uniform(-0.2, 0.2)
                sag = 0.55 + rnd.uniform(-0.12, 0.12)
                wbase = 3.6
            if rnd.random() < 0.06:
                sag += 0.6                    # a broken leaflet hanging lower
            dx = n[0] * s + t[0] * lean
            dy = n[1] * s + t[1] * lean
            d = math.hypot(dx, dy)
            dx, dy = dx / d, dy / d
            pts = []
            x, y = p
            vx, vy = dx, dy
            for i in range(14):
                pts.append((x, y))
                vy += sag * 0.11              # gravity bends the leaflet progressively downward
                m = math.hypot(vx, vy)
                vx, vy = vx / m, vy / m
                x += vx * ln / 13
                y += vy * ln / 13
            wbase = (wbase if 0.1 < uu < 0.88 else wbase * 0.75) + rnd.uniform(-0.3, 0.4)
            # linear leaflet: full width for most of its length, then a quick taper to the tip
            poly = stroke_poly(pts, lambda f, wb=wbase: 0.6 + (wb - 0.6) * min(1.0, (1 - f) / 0.45) ** 0.8)
            leaflets.append((s, pts, poly))
            S.add(poly)
        u += 0.036 + 0.008 * abs(math.sin(k * 1.3)) + rnd.uniform(-0.002, 0.004)
        k += 1
    M = clean_mask(S.mask(), W, H)
    # lit side: far-side leaflets (s < 0, facing up) take D1, near-side ones D0 except a lit stripe
    up_side = Shape(W, H)
    for s, pts, poly in leaflets:
        if s < 0:
            up_side.add(poly)
    litm = up_side.mask() & M
    g = Grid(W, H)
    shade(g, M, litm)
    # near-side leaflets: a D1 stripe along the upper edge keeps neighbours apart
    for s, pts, poly in leaflets:
        if s > 0:
            g.polyline([(round(x - 0.6), round(y - 0.9)) for x, y in pts[1:9]], D1, only={D0})
    for i in range(61):
        p = rach.at(i / 60)
        g.px(p[0], p[1] - 1, D2, only={D0, D1})
    rim(g, M, rim1=0.35, rim2=0.85)
    lone_fix(g, M)
    return g


# =========================================================================== 3 banana leaf
def banana():
    W, H = 112, 160
    # a big paddle rising from the bottom edge, arching left, the blunt tip bending back over to the right
    mid = Path2([(74, 166), (66, 106), (26, 58), (62, 12)])
    prof = [(0.0, 0.0), (0.09, 0.05), (0.15, 0.42), (0.22, 0.86), (0.36, 1.0), (0.62, 1.0), (0.82, 0.92),
            (0.93, 0.74), (0.98, 0.42), (1.0, 0.0)]
    Wd = 27.0
    side_k = {-1: 1.0, +1: 0.86}

    def hw(u, s):
        return Wd * interp(prof, u) * side_k[s]

    rnd = random.Random(35)
    S = Shape(W, H)
    left = [mid.local(i / 90, -hw(i / 90, -1)) for i in range(91)]
    right = [mid.local(i / 90, hw(i / 90, +1)) for i in range(91)]
    S.add(left + right[::-1])
    # petiole: thick at the base
    S.add(stroke_poly([mid.at(i / 40 * 0.2) for i in range(41)], 8.0, 3.6))
    # tears along the transverse veins: from the margin almost to the midrib, gaps opening outward
    tears = {-1: [(0.27, 3.0, 0.12), (0.36, 2.0, 0.4), (0.47, 4.2, 0.08), (0.54, 1.8, 0.5), (0.64, 3.4, 0.1),
                  (0.75, 2.6, 0.22), (0.86, 3.6, 0.15)],
             +1: [(0.3, 2.4, 0.25), (0.42, 3.8, 0.1), (0.57, 2.2, 0.3), (0.66, 4.0, 0.06), (0.8, 2.8, 0.18)]}
    for s, lst in tears.items():
        for u, gap, depth in lst:
            pts = []
            for i in range(7):
                f = i / 6
                uu = u + 0.05 * f
                pts.append(mid.local(uu, s * (2.0 + (hw(uu, s) * 1.25 - 2.0) * (depth + (1 - depth) * f))))
            S.cut(stroke_poly(pts, 0.9, gap))
    # ragged margin: small nicks
    for s in (-1, +1):
        for i in range(9):
            u = 0.25 + i * 0.08 + rnd.uniform(-0.02, 0.02)
            S.cut_ellipse(*mid.local(u, s * (hw(u, s) + 0.6)), 1.6, 1.1, rnd.uniform(0, 3))
    M = clean_mask(S.mask(), W, H)
    half = Shape(W, H)
    half.add(left + [mid.local(1 - i / 60, 0) for i in range(61)])
    litm = half.mask() & M
    g = Grid(W, H)
    shade(g, M, litm)
    # fine transverse veins on the lit half
    for i in range(16):
        u = 0.23 + i * 0.046
        a = mid.local(u, -1.5)
        b = mid.local(u + 0.045, -hw(u + 0.045, -1) * 0.9)
        g.line(a[0], a[1], b[0], b[1], D0, only={D1})
    # midrib: a 2-texel ridge, sheen on its lit side
    for i in range(0, 97):
        u = i / 100
        g.px(*mid.local(u, -0.8), D2, only={D0, D1})
        if u < 0.5:
            g.px(*mid.local(u, 0.6), D1, only={D0})
    rim(g, M)
    lone_fix(g, M)
    return g


# =========================================================================== 4 fern frond
def fern():
    W, H = 128, 112
    # rachis rises from the bottom-right corner, arches up-left; the tip curls under like a young frond
    rach = Path2([(136, 120), (104, 84), (66, 30), (20, 22)])
    tipc = Path2([(20, 22), (10, 21), (5, 31), (12, 35)])
    S = Shape(W, H)
    S.add(stroke_poly([rach.at(i / 60) for i in range(61)], 3.2, 1.6))
    S.add(stroke_poly([tipc.at(i / 20) for i in range(21)], 1.7, 1.2))
    rnd = random.Random(44)
    pinnae = []
    u = 0.06
    k = 0
    while u < 0.96:
        for s in (-1, +1):
            uu = u + (0.016 if s > 0 else 0)
            if uu > 0.97:
                continue
            p = rach.at(uu)
            t = rach.tan(uu)
            n = rach.nrm(uu)
            env = math.sin(math.pi * min(1, 0.08 + uu * 0.95)) ** 0.75
            ln = (5 + 25 * env) * (0.93 + rnd.uniform(-0.07, 0.08)) * (0.9 if s > 0 else 1.0)
            dx = n[0] * s + t[0] * 0.5
            dy = n[1] * s + t[1] * 0.5
            d = math.hypot(dx, dy)
            dx, dy = dx / d, dy / d
            pts = []
            x, y = p
            vx, vy = dx, dy
            for i in range(13):
                pts.append((x, y))
                # pinnae sweep toward the frond tip and sag a touch
                vx += t[0] * 0.05
                vy += t[1] * 0.05 + 0.03
                m = math.hypot(vx, vy)
                vx, vy = vx / m, vy / m
                x += vx * ln / 12
                y += vy * ln / 12
            # lobed pinna: a pinnule bump every ~2.5 px on both margins
            L = []
            Rr = []
            for i, q in enumerate(pts):
                f = i / 12
                base_w = 5.6 * (1 - f) ** 0.75 + 0.4
                lob = 1.0 + 0.32 * math.cos(i * math.pi * 0.95)
                w = base_w * lob / 2
                a = pts[max(i - 1, 0)]
                b = pts[min(i + 1, 12)]
                ex, ey = b[0] - a[0], b[1] - a[1]
                e = math.hypot(ex, ey) or 1
                nx, ny = -ey / e, ex / e
                L.append((q[0] + nx * w, q[1] + ny * w))
                Rr.append((q[0] - nx * w, q[1] - ny * w))
            poly = L + Rr[::-1]
            pinnae.append((s, pts, poly))
            S.add(poly)
        u += 0.04 + 0.008 * (1 - u)
        k += 1
    M = clean_mask(S.mask(), W, H)
    upper = Shape(W, H)
    # pinnae on the up-left side of the rachis catch the light
    for s, pts, poly in pinnae:
        mx, my = pts[6]
        if (mx - pts[0][0]) * -1 + (my - pts[0][1]) * -1 > 0:
            upper.add(poly)
    litm = upper.mask() & M
    g = Grid(W, H)
    shade(g, M, litm)
    # pinna midribs in the opposite tone separate overlapping pinnae
    for s, pts, poly in pinnae:
        g.polyline([(round(x), round(y)) for x, y in pts[1:9]], D0 if (round(pts[3][0]), round(pts[3][1])) in litm else D1,
                   only={D0, D1})
    for i in range(61):
        p = rach.at(i / 60)
        g.px(p[0], p[1] - 1, D2, only={D0, D1})
    rim(g, M, rim1=0.32, rim2=0.84)
    lone_fix(g, M)
    return g


# =========================================================================== 5 hanging vine
def vine():
    W, H = 48, 160
    S = Shape(W, H)
    strands = [   # (path, stem width top, bottom, leaf spacing)
        (Path2([(13, -4), (4, 44), (28, 86), (15, 154)]), 2.4, 1.2, 0.084),
        (Path2([(33, -4), (44, 34), (20, 70), (31, 114)]), 2.2, 1.1, 0.1),
        (Path2([(24, -4), (26, 10), (36, 22), (40, 40)]), 1.6, 1.0, 0.22),
    ]
    HEART = [(0.0, 0.34), (0.07, 0.86), (0.2, 1.0), (0.42, 0.94), (0.66, 0.66), (0.86, 0.3), (1.0, 0.0)]
    leaves = []
    rnd = random.Random(55)
    for si, (st, w0, w1, step) in enumerate(strands):
        S.add(stroke_poly([st.at(i / 80) for i in range(81)], w0, w1))
        u = 0.07 + 0.04 * si
        k = si
        while u < 0.985:
            p = st.at(u)
            n = st.nrm(u)
            s = 1 if k % 2 else -1
            size = (12.5 + 2.5 * math.sin(u * 5.0 + si * 1.7)) * (1.0 - 0.32 * u) + rnd.uniform(-0.8, 0.8)
            # leaves hang: mostly down, a little outward from the stem
            ax = n[0] * s * 0.75 + rnd.uniform(-0.1, 0.1)
            ay = abs(n[1]) * 0.2 + 1.0
            d = math.hypot(ax, ay)
            ax, ay = ax / d, ay / d
            base = (p[0] + ax * 1.8, p[1] + ay * 1.8)
            tip = (base[0] + ax * size + s * 0.8, base[1] + ay * size)
            Lp = Path2([base, (base[0] + ax * size * 0.35, base[1] + ay * size * 0.35),
                        (tip[0] - ax * size * 0.35 - s * 0.6, tip[1] - ay * size * 0.35), tip])
            hwid = size * 0.5
            l = [Lp.local(i / 16, -hwid * interp(HEART, i / 16)) for i in range(17)]
            r = [Lp.local(i / 16, hwid * interp(HEART, i / 16)) for i in range(17)]
            poly = l + r[::-1]
            S.add(poly)
            S.cut(ellipse_poly(*Lp.local(0.0, 0), 0.9, 0.9))     # the notch between the basal lobes
            S.add(stroke_poly([p, base], 1.1, 1.0))              # petiole
            leaves.append((poly, Lp, hwid))
            u += step + 0.018 * math.sin(k * 2.3)
            k += 1
    # a tendril curl at the end of the long strand
    cx, cy = 15, 150
    curl = [(cx + 3.2 * math.cos(a) * (1 - a / 14), cy + 3.2 * math.sin(a) * (1 - a / 14)) for a in [i * 0.4 for i in range(26)]]
    S.add(stroke_poly(curl, 1.1, 1.0))
    M = clean_mask(S.mask(), W, H)
    # lit = the up-left half of each leaf
    half = Shape(W, H)
    for poly, Lp, hwid in leaves:
        n = Lp.nrm(0.5)
        side = 1 if lit(n) > 0 else -1   # the half whose normal faces the light
        hl = [Lp.local(i / 16, side * hwid * interp(HEART, i / 16)) for i in range(17)]
        half.add(hl + [Lp.local(1 - i / 16, 0) for i in range(17)])
    litm = half.mask() & M
    g = Grid(W, H)
    shade(g, M, litm)
    rim(g, M, rim1=0.3, rim2=0.82)
    lone_fix(g, M)
    return g


def _paste_clip(dst, im, x, y):
    """alpha_composite that clips at every canvas edge."""
    cx, cy = max(0, -x), max(0, -y)
    ex, ey = min(im.width, dst.width - x), min(im.height, dst.height - y)
    if ex > cx and ey > cy:
        dst.alpha_composite(im.crop((cx, cy, ex, ey)), (x + cx, y + cy))


PIECES = [("fg_leaf_1", monstera), ("fg_leaf_2", palm), ("fg_leaf_3", banana), ("fg_leaf_4", fern), ("fg_leaf_5", vine)]

if __name__ == "__main__":
    only = sys.argv[1:] or None
    items = []
    for key, fn in PIECES:
        if only and key not in only:
            continue
        g = fn()
        im = g.image()
        save_sprite(key, im)
        report(key, [g])
        items.append((key, im))
    board(items, 3, bg=(52, 84, 64), cols=3).save(SCRATCH / "fg_leaf_3x.png")
    # lifted view: values x5 so the internal structure (halves, veins, rim) can be judged
    lifted = [(k, im.point(lambda v: min(255, v * 5)) if True else im) for k, im in items]
    lifted = [(k, Image.merge("RGBA", (*im.convert("RGBA").split()[:3], items[i][1].getchannel("A")))) for i, (k, im) in enumerate(lifted)]
    board(lifted, 3, bg=(200, 196, 180), cols=3).save(SCRATCH / "fg_leaf_lifted.png")
    # in context: placed at the screen edges of a real 640x360 day frame, shown x2
    if not only:
        bg = Image.open(SCRATCH / "bg_jungle_1x.png").convert("RGBA")
        ims = dict(items)
        place = {"fg_leaf_1": (-14, 360 - 128 + 14), "fg_leaf_2": (-10, -8), "fg_leaf_5": (430, -6),
                 "fg_leaf_4": (640 - 128 + 10, 360 - 112 + 12), "fg_leaf_3": (560, -40)}
        for k, (x, y) in place.items():
            _paste_clip(bg, ims[k], x, y)
        up(bg, 2).save(SCRATCH / "fg_leaf_context.png")

