"""Verdant Relay - jungle trees growing through the ruins (64x80 billboards, base on bottom row).
tree   : broadleaf canopy tree splitting a concrete slab
tree_2 : leaning palm-ish tree out of a rubble heap
tree_3 : dead trunk strangled by vines, swallowed street sign
Run: python pixel-art/tree/build.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import C, Pix, foliage, vine, deliver  # noqa: E402

W, H = 64, 80
LEAF = [C["g0"], C["g1"], C["g2"], C["g3"]]
LEAF_BACK = [C["g0"], C["g0"], C["g1"], C["g2"]]
BARK = [C["br0"], C["br1"], C["br2"], C["br3"]]


# ------------------------------------------------------------------ shared ground pieces
def slab(p, cx, cy, rx, ry, depth=4):
    """Broken concrete slab seen at 3/4: lit top face, darker front face, jagged rim."""
    top = Pix.ellipse_pts(cx, cy, rx, ry)
    # front face: the top ellipse pushed down by `depth`
    for x, y in top:
        for d in range(1, depth + 1):
            if (x, y + d) not in top:
                p.px(x, y + d, C["sl1"] if d < depth else C["sl0"])
    for x, y in top:
        p.px(x, y, C["sl2"])
    # lit top-left rim, cracks, aggregate
    for x, y in top:
        if (x - 1, y) not in top or (x, y - 1) not in top:
            if x < cx + rx * 0.3:
                p.px(x, y, C["sl3"])
    for _ in range(int(len(top) * 0.06)):
        x, y = p.rng.choice(top)
        p.px(x, y, C["sl1"])
    # chunk broken out of the front-right edge
    bx = cx + rx - 5
    for x in range(bx, bx + 6):
        for y in range(cy + ry - 2, cy + ry + depth + 1):
            p.px(x, y, None)
    return top


def roots(p, x0, y0, targets, w=2):
    for tx, ty in targets:
        mx = (x0 + tx) / 2 + p.rng.randint(-2, 2)
        my = min(y0, ty) - 1
        pts = [(x0, y0), (mx, my), (tx, ty)]
        p.thick(pts, w, BARK[1])
        # lit upper edge of the root
        for a, b in zip(pts, pts[1:]):
            for x, y in Pix.line_pts(a[0], a[1] - 1, b[0], b[1] - 1):
                if p.get(x, y + 1) == BARK[1] and p.get(x, y) != BARK[1]:
                    pass
            for x, y in Pix.line_pts(a[0], a[1], b[0], b[1]):
                p.px(x, y - (w // 2), BARK[2])
                p.px(x, y + (w - 1 - w // 2), BARK[0])


def fern_tuft(p, x, y, n=5, size=5):
    for i in range(n):
        a = math.radians(-160 + i * (140 / max(1, n - 1)))
        ex, ey = x + math.cos(a) * size, y + math.sin(a) * size * 0.7
        p.line(x, y, ex, ey, LEAF[2] if math.cos(a) < 0.2 else LEAF[1])
        p.px(ex, ey, LEAF[3] if math.cos(a) < 0 else LEAF[2])


# ------------------------------------------------------------------ tree: broadleaf
def tree_broadleaf():
    p = Pix(W, H, seed=101)
    # ground: split concrete slab
    slab(p, 32, 72, 22, 5, depth=4)
    # trunk (behind the canopy), slight lean, buttress flare at the base
    left = [(27, 71), (25, 72), (28, 66), (29, 56), (29, 46), (30, 38)]
    right = [(36, 38), (36, 46), (36, 56), (37, 66), (40, 72), (37, 71)]
    p.poly(left + right, BARK[1])
    for y in range(36, 73):
        row = [x for x in range(W) if p.get(x, y) == BARK[1]]
        if not row:
            continue
        a, b = min(row), max(row)
        p.px(a, y, BARK[2])
        if b - a > 4:
            p.px(a + 1, y, BARK[2] if y % 5 else BARK[1])
        p.px(b, y, BARK[0])
        p.px(b - 1, y, BARK[0] if y % 3 else BARK[1])
    # bark grain
    for gx, y0, y1 in ((31, 44, 52), (33, 55, 63), (32, 64, 69), (34, 40, 47)):
        p.vline(gx, y0, y1, BARK[0], only=BARK[1])
    # moss on the lit side and a vine wrapping the trunk
    for y in range(48, 70, 1):
        if p.rng.random() < 0.55:
            x = min(x for x in range(W) if p.get(x, y) in BARK)
            p.px(x, y, LEAF[2] if p.rng.random() < 0.5 else LEAF[1])
    for i, y in enumerate(range(40, 70, 1)):
        x = 30 + int(3.5 + 3.5 * math.sin(y * 0.45))
        if p.get(x, y) in BARK:
            p.px(x, y, LEAF[1])
            if i % 4 == 0:
                p.px(x + 1, y - 1, LEAF[2])
    # roots gripping the slab
    roots(p, 27, 70, [(14, 73), (20, 76)])
    roots(p, 38, 70, [(48, 74), (52, 71)])
    # canopy: back layer (dark), then front masses lit from the top-left
    for cx, cy, rx, ry in ((14, 26, 12, 9), (50, 24, 12, 9), (32, 13, 14, 10)):
        foliage(p, cx, cy, rx, ry, LEAF_BACK, shade_bias=0.15)
    # a branch fork showing in a gap
    p.thick([(32, 40), (24, 31)], 2, BARK[1])
    p.thick([(34, 40), (42, 30)], 2, BARK[1])
    p.line(24, 31, 31, 39, BARK[2])
    for cx, cy, rx, ry in ((20, 31, 12, 8), (44, 31, 12, 8), (26, 18, 11, 9), (42, 16, 11, 8),
                           (33, 26, 10, 7)):
        foliage(p, cx, cy, rx, ry, LEAF)
    # hanging vines + aerial roots
    for x, y, n in ((11, 34, 14), (52, 33, 18), (17, 38, 8), (47, 37, 9)):
        vine(p, x, y, n, LEAF)
    p.vline(38, 38, 47, BARK[0])  # aerial root
    # undergrowth at the slab edges
    fern_tuft(p, 13, 73, 5, 5)
    fern_tuft(p, 52, 72, 4, 4)
    p.outline(C["ink"])
    return p


# ------------------------------------------------------------------ tree_2: palm
def frond(p, x0, y0, ang, length, droop, side_len=4, back=False):
    """One palm frond: a 2px midrib arcing out and drooping, with leaflets hanging off
    both sides (longer near the middle), lit on the upper side."""
    R = [C["ink"], C["g0"], C["g1"], C["g2"]] if back else LEAF
    pts = []
    x, y = float(x0), float(y0)
    a = math.radians(ang)
    dx, dy = math.cos(a), math.sin(a)
    for i in range(length):
        t = i / length
        x += dx
        y += dy + droop * t * 1.4
        pts.append((x, y))
    for i, (x, y) in enumerate(pts):
        t = i / length
        ll = int(round(side_len * math.sin(math.pi * min(1, t * 1.2)))) + 1
        # leaflets: hang down-and-out from the rib
        for k in range(1, ll + 1):
            p.px(x - dx * k * 0.5, y + k, R[1] if k > 1 else R[2])
            if not back and k <= ll - 1:
                p.px(x + dx * k * 0.3, y - k * 0.6 if dy < -0.3 else y + k * 0.3, R[2])
        p.px(x, y, R[3] if (i % 3 and not back) else R[2])
        if i < length * 0.6:
            p.px(x, y + 1, R[2])
    return pts


def tree_palm():
    p = Pix(W, H, seed=202)
    # rubble heap at the base
    for cx, cy, rx, ry, col in ((26, 74, 10, 4, C["sl2"]), (40, 75, 9, 3, C["sl2"]), (33, 72, 7, 3, C["sl3"])):
        p.ellipse(cx, cy, rx, ry, col)
    for x in range(14, 52):
        for y in range(73, 79):
            if p.get(x, y) is not None and p.get(x, y - 2) is None:
                pass
    # chunk shading: darker bottoms
    for x, y in p.opaque():
        if p.get(x, y + 1) is None and y > 70:
            p.px(x, y, C["sl1"])
    for x, y in [(20, 72), (21, 72), (35, 70), (44, 73), (45, 73), (29, 76)]:
        p.px(x, y, C["sl1"])
    p.line(16, 70, 22, 73, C["rust"])  # rebar
    p.px(15, 69, C["org"])
    # trunk: curved, ringed, leaning right then up
    spine = []
    for i in range(48):
        t = i / 47
        x = 30 + 10 * math.sin(t * 1.9) - 3 * t
        y = 74 - i * 1.05
        spine.append((x, y))
    for i, (x, y) in enumerate(spine):
        w = 6 if i < 10 else 5 if i < 30 else 4
        xi = int(round(x - w / 2))
        for k in range(w):
            c = BARK[2] if k == 0 else BARK[0] if k == w - 1 else BARK[1]
            if i % 4 == 0:
                c = BARK[0] if k > 0 else BARK[1]
            p.px(xi + k, round(y), c)
    tx, ty = spine[-1]
    # coconut-ish seed pods under the crown
    for dx, dy in ((-2, 2), (1, 3), (3, 1)):
        p.ellipse(tx + dx, ty + dy, 1.5, 1.5, C["br1"])
        p.px(tx + dx - 1, ty + dy - 1, C["br2"])
    # crown fronds (back ones first, darker)
    for ang, ln, dr in ((205, 18, 0.8), (325, 18, 0.8), (262, 13, 0.3), (285, 13, 0.3)):
        frond(p, tx, ty - 1, ang, ln, dr, back=True)
    for ang, ln, dr in ((160, 24, 1.1), (190, 22, 0.8), (225, 17, 0.5), (305, 17, 0.5),
                        (345, 22, 0.8), (18, 24, 1.1), (245, 13, 0.25), (275, 12, 0.2)):
        frond(p, tx, ty - 1, ang, ln, dr)
    # crown heart
    p.ellipse(tx, ty - 1, 3, 2, LEAF[1])
    p.px(tx - 1, ty - 2, LEAF[3])
    p.px(tx, ty - 2, LEAF[2])
    # fern at the foot + a vine on the trunk
    fern_tuft(p, 18, 72, 5, 5)
    fern_tuft(p, 46, 72, 5, 4)
    for i, (x, y) in enumerate(spine[2:30]):
        if i % 3 == 0:
            p.px(round(x) - 1 + (i % 2), round(y), LEAF[1])
    p.outline(C["ink"])
    return p


# ------------------------------------------------------------------ tree_3: dead, vine-wrapped
def tree_dead():
    p = Pix(W, H, seed=303)
    DEAD = [C["br0"], C["sl1"], C["sl2"], C["sl3"]]   # bleached grey dead wood
    # broken asphalt chunks at the base
    slab(p, 31, 73, 17, 4, depth=3)
    # trunk + limbs as thick polylines
    limbs = [
        ([(31, 74), (30, 62), (32, 50), (30, 40)], 7),
        ([(30, 42), (24, 32), (16, 26), (9, 24)], 3),
        ([(31, 44), (38, 34), (47, 28), (55, 18)], 3),
        ([(30, 40), (31, 28), (28, 16), (30, 6)], 3),
        ([(24, 32), (22, 22)], 2),
        ([(47, 28), (52, 31)], 2),
        ([(29, 20), (23, 12)], 2),
        ([(38, 34), (40, 22)], 2),
    ]
    for pts, w in limbs:
        p.thick(pts, w, DEAD[1])
    # light: left edges bleached
    for x, y in p.opaque():
        if p.get(x, y) == DEAD[1]:
            if p.get(x - 1, y) is None or p.get(x - 1, y) not in DEAD:
                p.px(x, y, DEAD[2])
            elif p.get(x + 1, y) is None:
                p.px(x, y, DEAD[0])
    for x, y in p.opaque():
        if p.get(x, y) == DEAD[2] and p.get(x, y - 1) is None and y < 60:
            p.px(x, y, DEAD[3])
    # cracks/knots in the trunk
    p.line(31, 70, 32, 60, DEAD[0])
    p.line(30, 56, 31, 50, DEAD[0])
    p.px(29, 53, C["ink"])
    p.px(29, 54, C["ink"])
    # swallowed street sign: post into the trunk, rusted plate sticking out left
    p.rect(17, 48, 26, 53, C["rust"])
    p.hline(17, 26, 48, C["org"])
    p.vline(17, 48, 53, C["org"])
    p.hline(18, 26, 53, C["br1"])
    p.rect(19, 50, 24, 51, C["cream"])
    p.px(21, 50, C["rust"])
    p.px(23, 51, C["rust"])
    p.hline(26, 28, 51, C["sl1"])
    # strangler vines spiralling up the trunk and limbs
    for i in range(36):
        y = 72 - i
        x = 31 + int(round(4 * math.sin(i * 0.35)))
        if p.get(x, y) is not None:
            p.px(x, y, LEAF[1])
            p.px(x + 1, y, LEAF[0])
            if i % 3 == 0:
                p.px(x - 1, y, LEAF[2])
    for pts, _ in limbs[1:3]:
        for a, b in zip(pts, pts[1:]):
            for j, (x, y) in enumerate(Pix.line_pts(*a, *b)):
                if j % 3 == 1:
                    p.px(x, y - 1, LEAF[1])
    # leafy clumps where the vines took over
    for cx, cy, rx, ry in ((11, 25, 6, 4), (53, 19, 6, 4), (30, 9, 6, 4), (40, 24, 5, 3), (22, 21, 4, 3)):
        foliage(p, cx, cy, rx, ry, LEAF, jag=0.6)
    # hanging vine curtains
    for x, y, n in ((9, 28, 16), (14, 29, 10), (52, 22, 20), (56, 22, 12), (40, 27, 11), (27, 12, 8)):
        vine(p, x, y, n, LEAF)
    # base: roots + ferns
    roots(p, 27, 72, [(17, 74)])
    roots(p, 35, 72, [(44, 75)])
    fern_tuft(p, 20, 73, 5, 5)
    fern_tuft(p, 43, 74, 4, 4)
    p.outline(C["ink"])
    return p


def main():
    prev = HERE / "preview"
    for key, fn in (("tree", tree_broadleaf), ("tree_2", tree_palm), ("tree_3", tree_dead)):
        deliver(key, [fn()], prev, scale=6)
    print("trees done")


if __name__ == "__main__":
    main()
