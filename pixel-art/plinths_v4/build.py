"""Night-board build plinths, three irregular variants (critic H2 #11), and rank badges for their front faces.

Flat ground decals in the same format DefenseGround.makePlinth draws (a top face seen from above, then the block's
front face below it), but hand-shaped: worn, chipped edges, <= 38 px (1.2 tiles) wide, cut from the paving look.
  plinth_stone    38x35  two worn paving slabs, cracked, moss in the joints, a chipped front face
  plinth_timber   38x35  a deck of five weathered planks (ragged ends, nail heads) on a log beam
  plinth_rubble   38x35  a flattened heap of broken concrete and rebar, moss
Each manifest entry carries "top": [x0, y0, x1, y1], the top face's box in texels: centre it on the pad (like
makePlinth's zOffset); the tower stands on it. The face is the rows below y1.

  rank_badge_2   13x5   a riveted plate with two amber chevrons (level 2), to sit on the plinth's front face
  rank_badge_3   19x5   three chevrons (level 3)
Run: python pixel-art/plinths_v4/build.py
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "creatures_v3"))
from crlib import Grid, Shape, h2, save_sprite, SCRATCH, cells  # noqa: E402
from tlib import vnoise  # noqa: E402

W, H = 38, 35
STONE = ["#1c1f1e", "#262a29", "#2f3432", "#3a3f3c", "#4c524e", "#5a615b", "#687068", "#7a8278"]
WOODP = ["#1a120c", "#2a1c12", "#3a2618", "#4a3220", "#5a3e28", "#6b4b30", "#7e5c3c"]
MOSSP = ["#1c2e18", "#24401f", "#2f5228", "#3e6631"]
INK = "#121414"


def tone(r, t):
    return r[max(0, min(len(r) - 1, int(round(t))))]


def outline(g, ink=INK):
    m = g.mask()
    for (x, y) in list(m):
        for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in m and 0 <= q[0] < g.w and 0 <= q[1] < g.h:
                g.px(q[0], q[1], ink)


def wobble(pts, seed, amt=0.9):
    return [(x + (h2(i, 1, seed) - 0.5) * 2 * amt, y + (h2(i, 2, seed) - 0.5) * 2 * amt) for i, (x, y) in enumerate(pts)]


def block(top_poly, face_rows, seed):
    """Masks: the top face polygon and the front face below its lower edge (face_rows tall, ragged bottom)."""
    top = Shape(W, H).add(top_poly).mask()
    face = set()
    for x in range(W):
        col = [y for (xx, y) in top if xx == x]
        if not col:
            continue
        yb = max(col)
        depth = face_rows - (1 if h2(x, 3, seed) < 0.18 else 0)
        for y in range(yb + 1, yb + 1 + depth):
            face.add((x, y))
    return top, face


def moss_spots(g, pts, seed, n=10):
    pts = sorted(pts)
    for k in range(n):
        x, y = pts[int(h2(k, 4, seed) * (len(pts) - 1))]
        for (dx, dy) in ((0, 0), (1, 0), (0, 1)):
            if g.get(x + dx, y + dy) is not None and h2(x + dx, y + dy, seed) < 0.7:
                g.px(x + dx, y + dy, MOSSP[1 + (dx + dy + k) % 3])


def plinth_stone():
    g = Grid(W, H)
    top_poly = wobble([(3, 2), (12, 1), (24, 1.5), (34, 2), (36, 6), (36.5, 16), (35, 26), (24, 27), (12, 27.5), (2, 26), (1.5, 15), (2, 6)], 3)
    top, face = block(top_poly, 6, 3)
    for (x, y) in face:
        t = 2.4 - (y - min(yy for (xx, yy) in face if xx == x)) * 0.3 + (vnoise(x, y, 2.5, 5) - 0.5)
        if x % 9 == 4:
            t -= 1.2                                                     # vertical joints
        g.px(x, y, tone(STONE, t))
    for (x, y) in top:
        # two slab rows, offset joints; worn wear noise
        row = 0 if y < 14 else 1
        joint = y in (14,) or (x + row * 9) % 18 == 0
        t = 4.2 + (vnoise(x, y, 3.0, 7) - 0.5) * 1.6 + (0.5 if h2(x, y, 8) < 0.1 else 0)
        if joint:
            t = 2.2
        g.px(x, y, tone(STONE, t))
    for (x, y) in top:                                                    # lit north/west bevel, shadowed south/east lip
        if (x, y - 1) not in top or (x - 1, y) not in top:
            g.px(x, y, tone(STONE, 6.4 - (0.6 if h2(x, y, 2) < 0.3 else 0)))
        elif (x, y + 1) not in top or (x + 1, y) not in top:
            g.px(x, y, STONE[3])
    # cracks
    for (x0, y0, steps, s) in ((10, 4, 9, 11), (27, 17, 8, 12)):
        x, y = x0, y0
        for k in range(steps):
            if (x, y) in top:
                g.px(x, y, STONE[1])
            q = h2(k, s, 3)
            if q < 0.5:
                y += 1
            else:
                x += 1 if q < 0.78 else -1
    moss_spots(g, [p for p in top if p[1] in (13, 14, 15) or p[0] < 6], 4, 12)
    moss_spots(g, [p for p in face if p[0] < 12], 5, 6)
    outline(g)
    top_box = (min(x for x, y in top), min(y for x, y in top), max(x for x, y in top), max(y for x, y in top))
    return g, top_box


def plinth_timber():
    g = Grid(W, H)
    top = set()
    # five planks across, ragged ends
    for i in range(5):
        y0 = 2 + i * 5
        xl = 2 + int(h2(i, 1, 21) * 3)
        xr = 35 - int(h2(i, 2, 21) * 3)
        for y in range(y0, y0 + 5):
            for x in range(xl, xr + 1):
                top.add((x, y))
                t = 4.0 + (vnoise(x, y * 3, 4.0, 22 + i) - 0.5) * 1.8
                if y == y0 + 4:
                    t = 1.0                                               # gap between planks
                elif y == y0:
                    t += 0.9
                if (x * 7 + y * 3 + i) % 23 == 0:
                    t -= 1.2                                              # grain knot
                g.px(x, y, tone(WOODP, t))
            if y < y0 + 4:
                g.px(xl, y, WOODP[5])
                g.px(xr, y, WOODP[2])
        for x in (xl + 2, xr - 2):                                        # nail heads
            g.px(x, y0 + 2, "#8a7a5a")
    face = set()
    for x in range(2, 36):
        for y in range(27, 33):
            face.add((x, y))
            t = 2.6 - abs(y - 29.5) * 0.5 + (vnoise(x * 2, y, 3.0, 30) - 0.5)
            if x in (3, 34) or (x % 11 == 6 and y > 28):
                t -= 1.0
            g.px(x, y, tone(WOODP, t))
    for (x, y) in ((2, 29), (35, 29), (2, 30), (35, 30)):                 # the log ends
        g.px(x, y, WOODP[5])
    moss_spots(g, [p for p in face if p[0] < 14], 31, 8)
    moss_spots(g, [p for p in top if p[0] < 8], 32, 5)
    outline(g)
    return g, (2, 2, 35, 26)


def plinth_rubble():
    g = Grid(W, H)
    top_poly = wobble([(5, 3), (15, 1), (27, 2), (34, 5), (36, 13), (35, 23), (28, 27), (16, 28), (6, 26), (2, 18), (2, 9)], 41, 2.2)
    top, face = block(top_poly, 6, 41)
    CONC = ["#1e1e1c", "#2c2c28", "#3c3b36", "#4e4c45", "#625f56", "#78746a", "#8e897c"]
    for (x, y) in face:
        t = 2.4 + cells(x, y, 3.0, 43, 0.6, 0.8) * 0.8 - (y - 27) * 0.15
        g.px(x, y, tone(CONC, t))
    for (x, y) in top:
        c = cells(x, y, 5.5, 44, 1.0, 1.3)
        t = 4.0 + c + (vnoise(x, y, 2.0, 45) - 0.5) * 0.6 - (0.0 if c < -1 else 0.04 * (x + y - 20))
        g.px(x, y, tone(CONC, t))
    for (x, y) in top:
        if (x, y - 1) not in top or (x - 1, y) not in top:
            g.px(x, y, CONC[6])
    # rebar sticking out + a chunk of red brick
    for (x, y) in ((33, 9), (34, 8), (35, 7), (4, 21), (3, 22)):
        g.px(x, y, "#7a462b" if (x + y) % 2 else "#9a623c")
    for (x, y) in ((24, 30), (25, 30), (24, 31), (25, 31), (26, 31)):
        g.px(x, y, "#8a3a2a" if y == 30 else "#6a2a20")
    moss_spots(g, list(top), 46, 14)
    moss_spots(g, [p for p in face if p[0] < 20], 47, 7)
    outline(g)
    top_box = (min(x for x, y in top), min(y for x, y in top), max(x for x, y in top), max(y for x, y in top))
    return g, top_box


def rank_badge(n):
    w = 6 * n + 1
    g = Grid(w, 5)
    for y in range(5):
        for x in range(w):
            c = "#4a4a42" if y == 0 else "#2e2e2a" if y < 4 else "#161614"
            if x in (0, w - 1):
                c = "#161614"
            g.px(x, y, c)
    chev = ["..#..", ".###.", "##.##"]
    for k in range(n):
        ox = 1 + k * 6
        for r_, row in enumerate(chev):
            for c_, ch in enumerate(row):
                if ch == "#":
                    g.px(ox + c_, 1 + r_, "#fee761" if r_ == 0 else "#feae34")
    return g


def main():
    entries = {}
    from PIL import Image
    ims = []
    for key, fn in (("plinth_stone", plinth_stone), ("plinth_timber", plinth_timber), ("plinth_rubble", plinth_rubble)):
        g, top = fn()
        im = g.image()
        save_sprite(key, im)
        entries[key] = {"file": f"{key}.png", "ppu": 32, "flat": True, "shadow": 0, "top": list(top)}
        ims.append(im)
        print(key, im.size, "top", top)
    for n in (2, 3):
        g = rank_badge(n)
        key = f"rank_badge_{n}"
        im = g.image()
        save_sprite(key, im)
        entries[key] = {"file": f"{key}.png", "ppu": 32, "shadow": 0}
        ims.append(im)
    (HERE / "manifest_entries.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf8")
    # review at x6 with a tower standing on each
    tw = Image.open(SCRATCH.parent.parent / "public" / "sprites" / "scrap_turret_2.png").convert("RGBA").crop((0, 0, 48, 64))
    out = Image.new("RGBA", (3 * 64 + 40, 90), (60, 50, 40, 255))
    for i, im in enumerate(ims[:3]):
        x0 = 10 + i * 74
        out.alpha_composite(im, (x0 + 5, 40))
        cx = x0 + 5 + W // 2
        out.alpha_composite(tw, (cx - 24, 40 + 14 - 64))
        b = ims[3 + (i % 2)]
        out.alpha_composite(b, (cx - b.width // 2, 40 + 28))
    out.resize((out.width * 4, out.height * 4), Image.NEAREST).save(SCRATCH / "plinths_v4.png")


if __name__ == "__main__":
    main()
