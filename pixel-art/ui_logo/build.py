"""Verdant Relay - title wordmark (critic H §5 / #11): ui_logo, 320x96, single frame, DOM-only.

"VERDANT" in chunky chamfered moss-stone capitals (lit top-left, a 4-px extruded underside, dark outline),
a jungle vine spiralling around the word: in front of the letters on its rising strokes, behind them on its
falling strokes (visible only in the gaps), leaves sprouting from the front strokes, a tendril curl off the T.
"RELAY" below in weathered slate capitals; its A is the Relay's cyan crystal shard held by a steel clamp
(the clamp is the crossbar), rising above the other letters. A power cable runs in from the left and plugs
into the R. Everything sits inside a near-black outline so it reads over the jungle backdrop.
Run: python pixel-art/ui_logo/build.py
"""
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
from v3lib import Grid, Shape, Path2, stroke_poly, interp, save_sprite, up, SCRATCH, LIGHT  # noqa: E402
from PIL import Image  # noqa: E402

W, H = 320, 96
INK = "#050a06"

# moss-stone ramp (VERDANT)
G_EXT0, G_EXT1 = "#0b1f12", "#163d22"
G_DK, G_MD, G_BS, G_LT, G_HI = "#245c30", "#3e8948", "#63c74d", "#9be060", "#d4f58c"
# slate ramp (RELAY)
S_EXT0, S_EXT1 = "#121020", "#262b44"
S_DK, S_MD, S_BS, S_LT, S_HI = "#3a4466", "#5a6988", "#8b9bb4", "#c0cbdc", "#eef3f8"
# crystal
C_EXT, C_DK, C_MD, C_BS, C_LT, C_HI = "#0b3d52", "#0b6b9a", "#0099db", "#2ce8f5", "#a8f8ff", "#ffffff"
# vine
V_STEM0, V_STEM1 = "#12361f", "#2a6634"
L_DK, L_MD, L_LT, L_HI = "#1f5a2e", "#3e8948", "#63c74d", "#b4ea74"


# --------------------------------------------------------------------------- glyphs (predicates)
def cut(x, y, w, h, c, corners):
    """True if (x, y) falls in a 45deg chamfer of size c at one of the listed corners of a w x h box."""
    if "tl" in corners and x + y < c:
        return True
    if "tr" in corners and (w - 1 - x) + y < c:
        return True
    if "bl" in corners and x + (h - 1 - y) < c:
        return True
    if "br" in corners and (w - 1 - x) + (h - 1 - y) < c:
        return True
    return False


def glyph(ch, w, h, S):
    """Set of (x, y) for a chunky capital in a w x h box with stroke S."""
    A = S - 1                       # horizontal arms are a touch thinner than the stems
    out = set()
    for y in range(h):
        for x in range(w):
            ok = False
            if ch == "V":
                split = int(h * 0.38)
                if y < split:
                    ok = x < S or x >= w - S
                else:
                    t = (y - split) / (h - 1 - split)
                    off = round(t * (w / 2 - S / 2 - 0.5))
                    ok = off <= x < off + S + 1 or w - 1 - off - S - 1 < x <= w - 1 - off
                ok = ok and not cut(x, y, w, h, 3, "tl tr")
            elif ch == "E":
                ok = x < S or y < A or y >= h - A or (abs(y - (h - 1) / 2) < A / 2 and x < w - 5)
                ok = ok and not cut(x, y, w, h, 4, "tl bl") and not cut(x, y, w, h, 2, "tr br")
            elif ch == "R":
                bh = int(h * 0.58)
                bowl = y < bh and not cut(x, y, w, bh, 9, "tr br")
                counter = S <= x < w - S and A <= y < bh - A and not cut(x - S, y - A, w - 2 * S, bh - 2 * A, 3, "tr br")
                ok = x < S or (bowl and not counter)
                if y >= bh - 2:
                    t = (y - (bh - 2)) / (h - 1 - (bh - 2))
                    xl = round(w * 0.36 + t * (w - S - 1 - w * 0.36))
                    ok = ok or (xl <= x < xl + S + 1)
                ok = ok and not cut(x, y, w, h, 4, "tl bl") and not cut(x, y, w, h, 2, "br")
            elif ch == "D":
                outer = not cut(x, y, w, h, 12, "tr br") and not cut(x, y, w, h, 4, "tl bl")
                counter = S <= x < w - S and A <= y < h - A and not cut(x - S, y - A, w - 2 * S, h - 2 * A, 6, "tr br")
                ok = outer and not counter
            elif ch == "A":
                outer = not cut(x, y, w, h, 13, "tl tr") and not cut(x, y, w, h, 2, "bl br")
                cb = int(h * 0.55)
                counter = S <= x < w - S and A <= y < cb and not cut(x - S, y - A, w - 2 * S, cb - A, 6, "tl tr")
                legs = S <= x < w - S and y >= cb + A
                ok = outer and not counter and not legs
            elif ch == "N":
                d = (y / (h - 1)) * (w - S - 2)
                ok = x < S or x >= w - S or (d - 0.5 <= x - 1 < d + S + 0.5)
                ok = ok and not cut(x, y, w, h, 3, "tl tr bl br")
            elif ch == "T":
                ok = y < A or (w - S) // 2 <= x < (w - S) // 2 + S
                ok = ok and not cut(x, y, w, h, 3, "tl tr")
            elif ch == "L":
                ok = x < S or y >= h - A
                ok = ok and not cut(x, y, w, h, 3, "tl bl") and not cut(x, y, w, h, 2, "br tr")
            elif ch == "Y":
                mid = int(h * 0.5)
                if y < mid:
                    t = y / mid
                    off = round(t * (w / 2 - S / 2 - 0.5))
                    ok = off <= x < off + S + 1 or w - 1 - off - S - 1 < x <= w - 1 - off
                else:
                    ok = (w - S) // 2 <= x < (w - S) // 2 + S
                ok = ok and not cut(x, y, w, h, 3, "tl tr")
            if ok:
                out.add((x, y))
    return out


# --------------------------------------------------------------------------- shading
def edge(m, p, d):
    return (p[0] + d[0], p[1] + d[1]) not in m


def paint_slab(g, face, ext_depth, ramp, ext, top_y, bot_y):
    """Face with a vertical 3-band gradient + 1-px bevels; extruded underside `ext_depth` px deep."""
    dk, md, bs, lt, hi = ramp
    e0, e1 = ext
    extm = set()
    for (x, y) in face:
        for k in range(1, ext_depth + 1):
            q = (x + (1 if k >= 2 else 0), y + k)
            if q not in face:
                extm.add(q)
    for (x, y) in extm:
        g.px(x, y, e1 if (x, y - 1) in face or (x - 1, y - 1) in face else e0)
    span = max(1, bot_y - top_y)
    for (x, y) in face:
        t = (y - top_y) / span
        g.px(x, y, lt if t < 0.28 else bs if t < 0.7 else md)
    for p in face:
        t = (p[1] - top_y) / span
        if edge(face, p, (0, -1)):
            g.px(*p, hi)
        elif edge(face, p, (-1, 0)):
            g.px(*p, lt if t < 0.7 else bs)
        elif edge(face, p, (0, 1)):
            g.px(*p, dk)
        elif edge(face, p, (1, 0)):
            g.px(*p, md)
    return extm


def leaf(g, base, ax, ay, size, drawn):
    """A small lit leaf from `base` along (ax, ay)."""
    tip = (base[0] + ax * size, base[1] + ay * size + 1.0)
    Lp = Path2([base, (base[0] + ax * size * 0.3, base[1] + ay * size * 0.3),
                (tip[0] - ax * size * 0.3, tip[1] - ay * size * 0.3), tip])
    prof = [(0, 0.25), (0.28, 1.0), (0.62, 0.8), (1.0, 0.0)]
    hw = size * 0.38
    sh = Shape(W, H)
    sh.add([Lp.local(i / 12, -hw * interp(prof, i / 12)) for i in range(13)] +
           [Lp.local(i / 12, hw * interp(prof, i / 12)) for i in range(13)][::-1])
    lm = sh.mask()
    nrm = Lp.nrm(0.5)
    lside = 1 if (nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1]) > 0 else -1
    hl = Shape(W, H)
    hl.add([Lp.local(i / 12, lside * hw * interp(prof, i / 12)) for i in range(13)] + [Lp.local(1 - i / 12, 0) for i in range(13)])
    litm = hl.mask() & lm
    for q in lm:
        g.px(*q, L_LT if q in litm else L_MD)
    for (x, y) in lm:
        if (x - 1, y) not in lm and (x, y - 1) not in lm:
            g.px(x, y, L_HI)
        elif (x + 1, y) not in lm and (x, y + 1) not in lm:
            g.px(x, y, L_DK)
    for i in range(2, 10):   # midrib
        q = Lp.local(i / 12, 0)
        q = (int(q[0]), int(q[1]))
        g.px(*q, L_MD if q in litm else L_DK, only={L_LT, L_MD})
    drawn |= lm


# --------------------------------------------------------------------------- build
def build():
    g = Grid(W, H)
    occupied = set()   # every texel of a letter (face or extrusion): the vine's back strokes hide behind these

    # ---- VERDANT
    S, Hc, top = 9, 40, 6
    widths = {"V": 40, "E": 30, "R": 36, "D": 36, "A": 38, "N": 36, "T": 34}
    x = 7
    faces = []
    for ch in "VERDANT":
        w = widths[ch]
        faces.append({(x + px, top + py) for px, py in glyph(ch, w, Hc, S)})
        x += w + 4
    v_right = x - 4
    for m in faces:
        occupied |= m | paint_slab(g, m, 4, (G_DK, G_MD, G_BS, G_LT, G_HI), (G_EXT0, G_EXT1), top, top + Hc - 1)
    allface = set().union(*faces)
    # stone under the moss: a few darker flecks on the faces
    rnd = random.Random(5)
    for (x, y) in sorted(allface):
        c = g.get(x, y)
        if c in (G_BS, G_MD) and rnd.random() < 0.035 and all(g.get(x + dx, y + dy) in (G_BS, G_MD, G_LT) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            g.px(x, y, G_MD if c == G_BS else G_DK)
            if rnd.random() < 0.5:
                g.px(x + 1, y, G_MD if c == G_BS else G_DK, only={G_BS, G_MD})

    # ---- RELAY (right-aligned under VERDANT); the A is a crystal shard
    S2, H2, top2 = 6, 24, 62
    w2 = {"R": 24, "E": 20, "L": 19, "A": 26, "Y": 26}
    gap2 = 5
    total = sum(w2.values()) + gap2 * 4
    x = v_right - total - 2
    relay_x0 = x
    crystal_box = None
    for ch in "RELAY":
        w = w2[ch]
        if ch == "A":
            crystal_box = (x, w)
        else:
            m = {(x + px, top2 + py) for px, py in glyph(ch, w, H2, S2)}
            occupied |= m | paint_slab(g, m, 3, (S_DK, S_MD, S_BS, S_LT, S_HI), (S_EXT0, S_EXT1), top2, top2 + H2 - 1)
            for (px, py) in sorted(m):       # grime
                if (px * 7 + py * 13) % 53 == 0 and g.get(px, py) in (S_BS, S_MD):
                    g.px(px, py, S_MD if g.get(px, py) == S_BS else S_DK)
        x += w + gap2

    # ---- the crystal A: a faceted shard rising above the cap line; below the clamp it splits into two legs
    cx0, cw = crystal_box
    ctop, cbot = top2 - 11, top2 + H2 - 1
    mid = cx0 + cw / 2 - 0.5
    cy_ = top2 + 8                       # clamp (= crossbar) top row
    shard = set()
    for y in range(ctop, cbot + 1):
        t = (y - ctop) / (cbot - ctop)
        half = 0.6 + t * (cw / 2 - 0.6)
        for x in range(cx0, cx0 + cw):
            if abs(x - mid) <= half:
                shard.add((x, y))
    gap_top = cy_ + 6                    # the A's open bottom: a triangle from under the clamp to the baseline
    for y in range(gap_top, cbot + 1):
        nh = 0.5 + (y - gap_top) * 0.62
        for x in range(cx0, cx0 + cw):
            if abs(x - mid) <= nh:
                shard.discard((x, y))
    extc = set()
    for (x, y) in shard:
        for k in (1, 2, 3):
            q = (x + (1 if k >= 2 else 0), y + k)
            if q not in shard:
                extc.add(q)
    for p in extc:
        g.px(*p, C_EXT)
    for (x, y) in shard:
        t = (y - ctop) / (cbot - ctop)
        dx = x - mid
        if dx < -0.5:
            c = C_LT if -dx < 2.5 + t * 3.5 and t < 0.7 else C_BS
        elif dx <= 0.5:
            c = C_HI if t < 0.6 else C_LT
        else:
            c = C_MD if dx < 3 + t * 3 else C_DK
        if t > 0.84:
            c = {C_LT: C_BS, C_BS: C_MD, C_HI: C_BS}.get(c, c)
        g.px(x, y, c)
    for (x, y) in shard:
        if (x - 1, y) not in shard and (y - ctop) < (cbot - ctop) * 0.8:
            g.px(x, y, C_LT)                     # lit left edge
        elif (x + 1, y) not in shard and g.get(x, y) in (C_MD, C_BS):
            g.px(x, y, C_DK)                     # shadowed right edge
    g.px(int(mid) - 1, ctop + 7, C_HI)
    g.px(int(mid) - 2, ctop + 11, C_HI)
    occupied |= shard | extc
    clamp = {(x, y) for x in range(cx0 - 1, cx0 + cw + 1) for y in range(cy_, cy_ + 5)}
    for (x, y) in clamp:
        r = y - cy_
        g.px(x, y, S_HI if r == 0 else S_LT if r == 1 else S_BS if r < 4 else S_DK)
    for x in range(cx0 - 1, cx0 + cw + 1):
        g.px(x + 1, cy_ + 5, S_EXT1)
        g.px(x + 1, cy_ + 6, S_EXT0, only="empty")
    for bx in (cx0 + 1, cx0 + cw - 2):
        g.px(bx, cy_ + 2, S_EXT1)
        g.px(bx, cy_ + 1, S_HI)
    occupied |= clamp

    # ---- power cable from the left into the R of RELAY (with a plug and cable ties)
    py0 = top2 + 7
    cab = Path2([(24, 44), (26, py0 + 24), (100, py0 - 4), (relay_x0 - 7, py0 + 4)])
    cable = Shape(W, H)
    cable.add(stroke_poly([cab.at(i / 160) for i in range(161)], 4.4, 4.4))
    cm = cable.mask() - occupied
    for (x, y) in cm:
        if (x, y - 1) not in cm:
            c = S_BS
        elif (x, y - 2) not in cm:
            c = S_DK
        elif (x, y + 1) not in cm:
            c = S_EXT0
        else:
            c = S_EXT1
        g.px(x, y, c)
    for u in (0.24, 0.52, 0.76):
        q = cab.at(u)
        n = cab.nrm(u)
        for k in range(-3, 4):
            p = (int(round(q[0] + n[0] * k)), int(round(q[1] + n[1] * k)))
            if p in cm:
                g.px(*p, S_LT if k < 0 else S_MD)
    px0 = relay_x0 - 8
    for y in range(py0, py0 + 9):
        for x in range(px0, px0 + 7):
            r = y - py0
            g.px(x, y, S_HI if r == 0 else S_LT if r < 3 else S_BS if r < 7 else S_DK)
    for y in range(py0 + 2, py0 + 7):
        g.px(px0 + 7, y, S_EXT1)
    g.px(px0 + 2, py0 + 3, S_EXT0)
    g.px(px0 + 4, py0 + 3, S_EXT0)
    occupied |= {(x, y) for y in range(py0, py0 + 9) for x in range(px0, px0 + 8)}

    # ---- the vine: a helix around the word - in front on its rising strokes, behind on its falling ones
    xs = [5, 28, 64, 102, 140, 178, 216, 254, 286]
    ys = [50, 9, 49, 9, 49, 9, 49, 11, 34]
    ctrl = [(xs[0], ys[0])]
    for i in range(1, len(xs)):
        x0, y0, x1, y1 = xs[i - 1], ys[i - 1], xs[i], ys[i]
        ctrl += [(x0 + (x1 - x0) * 0.45, y0), (x1 - (x1 - x0) * 0.45, y1), (x1, y1)]
    ctrl += [(298, 52), (310, 30), (302, 10)]
    vine = Path2(ctrl, n=1600)
    N = 1400
    pts = [vine.at(i / N) for i in range(N + 1)]
    stem = Shape(W, H)
    stem.add(stroke_poly(pts, 3.6, 2.4))
    sm = stem.mask()
    rising = {}
    for i in range(N + 1):
        rising[(int(pts[i][0]), int(pts[i][1]))] = vine.tan(i / N)[1] < 0.12

    def is_front(p):
        for r in range(4):
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    q = (p[0] + dx, p[1] + dy)
                    if q in rising:
                        return rising[q]
        return True

    front = {p for p in sm if p not in occupied or is_front(p)}
    for (x, y) in front:
        g.px(x, y, V_STEM1 if ((x, y - 1) not in sm or (x - 1, y) not in sm) else V_STEM0)
    drawn = set(front)
    # leaves sprout from the front strokes, alternating sides
    rng = random.Random(9)
    for k in range(30):
        u = 0.025 + k * 0.032 + rng.uniform(-0.005, 0.005)
        if u > 0.97:
            break
        p = vine.at(u)
        if (int(p[0]), int(p[1])) not in front or ((int(p[0]), int(p[1])) in occupied and not is_front((int(p[0]), int(p[1])))):
            continue
        t = vine.tan(u)
        side = -1 if k % 2 else 1
        n = (-t[1] * side, t[0] * side)
        ax, ay = n[0] * 0.85 + t[0] * 0.5, n[1] * 0.85 + t[1] * 0.5
        d = math.hypot(ax, ay)
        leaf(g, (p[0] + ax / d, p[1] + ay / d), ax / d, ay / d, 9.0 + 2.4 * math.sin(k * 1.9), drawn)
    # the vine's root end: a leaf curling down-left
    leaf(g, (5.0, 50.5), -0.35, 0.94, 7.5, drawn)
    # tendril curl at the vine's end, off the top of the T
    tx, ty = 302, 10
    curl = [(tx - 4 + 4.0 * math.cos(a) * (1 - a / 16), ty - 3 + 3.4 * math.sin(a) * (1 - a / 16)) for a in [i * 0.35 for i in range(36)]]
    cs = Shape(W, H)
    cs.add(stroke_poly([(tx, ty)] + curl, 1.5, 1.0))
    for q in cs.mask():
        g.px(*q, V_STEM1)
        drawn.add(q)
    # a short vine hanging from under VERDANT's A toward the crystal, two leaves
    hang = Path2([(196, 49), (191, 56), (198, 62), (193, 70)])
    hs = Shape(W, H)
    hs.add(stroke_poly([hang.at(i / 40) for i in range(41)], 2.2, 1.3))
    hm = hs.mask()
    for q in hm:
        if q not in occupied:
            g.px(*q, V_STEM1 if (q[0] - 1, q[1]) not in hm else V_STEM0)
            drawn.add(q)
    leaf(g, (191.5, 56.5), -0.9, 0.45, 7.0, drawn)
    leaf(g, (197.5, 63.0), 0.9, 0.45, 6.5, drawn)

    # ink line between the vine (in front) and the letters it crosses, so it separates from the green faces
    for (x, y) in list(drawn):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in drawn and q in occupied:
                g.px(*q, INK)

    # ---- outline: 1 px of ink around everything, plus a second row underneath for weight
    g.outline(INK)
    m = g.mask()
    for (x, y) in list(m):
        if (x, y + 1) not in m and y + 1 < H:
            g.px(x, y + 1, INK)
    return g


if __name__ == "__main__":
    g = build()
    im = g.image()
    save_sprite("ui_logo", im)
    print("ui_logo", im.size, "colours", len(g.colors()))
    bg = Image.open(SCRATCH / "bg_jungle_1x.png").convert("RGBA").crop((0, 0, 360, 120))
    bg.alpha_composite(Image.new("RGBA", bg.size, (11, 10, 18, 200)))
    bg.alpha_composite(im, (20, 12))
    up(bg, 3).save(SCRATCH / "logo_ctx_x3.png")
    up(bg, 2).save(SCRATCH / "logo_ctx_x2.png")
    z = Image.new("RGBA", im.size, (40, 40, 48, 255))
    z.alpha_composite(im)
    up(z.crop((0, 0, 170, 96)), 6).save(SCRATCH / "logo_zoomL.png")
    up(z.crop((150, 0, 320, 96)), 6).save(SCRATCH / "logo_zoomR.png")
