"""Arc Spire L1-L3 (32x48). Tall coil tower: copper-wound mast, white ceramic insulator
rings, cyan plasma orb in a steel claw cradle on a transformer box.
L1: 2 rings, small orb.  L2: 3 rings, bigger orb, side prongs.  L3: 4 rings, big orb, crown of claws,
capacitor pods and floating arcs.
Frames: idle 2 (crackle), attack 2 (discharge flash, arcs flying out).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "towers_common"))
from tw import *  # noqa
from parts import footing  # noqa

W, H = 32, 48
CX = 16
CER = ["#3a4466", "#5a6988", "#8b9bb4", "#c0cbdc", "#ffffff"]   # glazed ceramic

LV = {
    1: dict(orb=(12, 3), rings=[21, 28], box=(10, 21, 34), rod=2),
    2: dict(orb=(10, 4), rings=[18, 24, 30], box=(9, 22, 34), rod=2),
    3: dict(orb=(8, 5), rings=[17, 22, 27, 32], box=(8, 23, 35), rod=3),
}


def transformer(c, lv):
    x0, x1, top = LV[lv]["box"]
    bot = 41
    c.box(x0, x1, top, 3, bot, STEEL[3], STEEL[2], lit=STEEL[3], dark=STEEL[1], edge=STEEL[4])
    c.hline(x0 + 1, x1 - 1, top, STEEL[4])
    # cooling fins on the front face
    for x in range(x0 + 2, x1 - 1, 2):
        c.vline(x, top + 5, bot - 2, STEEL[1])
    # yellow high-voltage plate with a bolt glyph
    px0 = x1 - 6
    c.rect(px0, top + 4, px0 + 4, top + 7, "#feae34")
    c.hline(px0, px0 + 4, top + 4, "#fee761")
    c.pts([(px0 + 2, top + 5), (px0 + 1, top + 6), (px0 + 3, top + 6), (px0 + 2, top + 7)], INK)
    c.hline(x0, x1, bot, STEEL[0])
    # rust streak + cable to the ground
    c.pts([(x0 + 3, top + 5), (x0 + 3, top + 6), (x0 + 3, top + 7)], RUST[2])
    c.pts([(x0 - 1, bot - 3), (x0 - 2, bot - 2), (x0 - 2, bot - 1), (x0 - 3, bot), (x0 - 4, bot + 1)], INK)
    c.pts([(x0 - 1, bot - 4), (x0 - 2, bot - 3)], STEEL[2])
    if lv == 3:
        # capacitor pods either side
        for sx in (x0 - 3, x1 + 1):
            c.drum(sx + 1, top + 1, top + 6, 2, 1, COPPER[:4], top=COPPER[3])
            c.px(sx, top, "#2ce8f5")


def coil(c, lv, y0, y1):
    """Copper-wound mast from y0 (top) to y1."""
    r = LV[lv]["rod"]
    x0, x1 = CX - r, CX + r - 1 + 1
    for y in range(y0, y1 + 1):
        wind = (y % 2 == 0)
        for x in range(x0, x1 + 1):
            f = (x - x0) / max(1, x1 - x0)
            if wind:
                col = COPPER[4] if f < 0.3 else (COPPER[3] if f < 0.65 else COPPER[1])
            else:
                col = COPPER[2] if f < 0.3 else (COPPER[1] if f < 0.65 else COPPER[0])
            c.px(x, y, col)


def insulator(c, y, rx):
    """Thin flared ceramic shed: 1-row glazed rim band under a 3-row top face."""
    rows = ell_rows(CX, y + 1, rx, 1)
    x0 = min(r[0] for r in rows)
    x1 = max(r[1] for r in rows)
    for a, b, yy in rows:
        if yy >= y + 1:
            for x in range(a, b + 1):
                f = (x - x0) / max(1, x1 - x0)
                c.px(x, yy, CER[2] if f < 0.3 else (CER[1] if f < 0.75 else CER[0]))
    c.ell(CX, y, rx, 1, CER[3])
    for a, b, yy in ell_rows(CX, y, rx, 1):
        if yy < y:
            c.hline(a, a + (b - a) // 2, yy, CER[4])
        if yy == y:
            c.px(b, yy, CER[2])
    c.hline(CX - 1, CX, y, CER[2])          # mast passes through


def orb(c, lv, hot=False, phase=0):
    oy, r = LV[lv]["orb"]
    cx = CX - 0.5
    # outer blue rim, inner cyan, white core (offset to the light)
    c.circle(CX, oy, r, CYAN[1])
    c.circle(CX - 1 if r > 3 else CX, oy, r - 1, CYAN[2])
    c.pts([(CX - 2, oy - 1), (CX - 1, oy - 2), (CX - 2, oy - 2), (CX - 1, oy - 1)], WHITE)
    if r >= 4:
        c.pts([(CX - 3, oy - 1), (CX - 2, oy - 3), (CX, oy - 2)], WHITE)
    # shading crescent bottom-right
    for x in range(CX - r, CX + r + 1):
        for y in range(oy - r, oy + r + 1):
            d = (x - CX) ** 2 + (y - oy) ** 2
            if d <= r * r and (x - CX) + (y - oy) >= r * 0.9 and d >= (r - 1.2) ** 2:
                c.px(x, y, CYAN[0])
    if hot:
        c.circle(CX - 1, oy - 1, max(1, r - 2), WHITE)
        c.circle(CX, oy, r, CYAN[2])
        c.circle(CX - 1, oy - 1, r - 1, WHITE)
    # specular glint
    c.px(CX - r + 1, oy - r + 2, WHITE)


def cradle(c, lv):
    """Steel claws holding the orb."""
    oy, r = LV[lv]["orb"]
    base = oy + r + 1
    # collar
    c.rect(CX - 3, base, CX + 2, base + 1, STEEL[2])
    c.hline(CX - 3, CX + 1, base, STEEL[3])
    c.px(CX + 2, base + 1, STEEL[0])
    # claws curving up around the orb (front ones; drawn over the orb edge)
    claws = [(-r - 1, 1), (r, -1)]
    for dx, s in claws:
        x = CX + dx
        c.line(x + s, base, x, oy + 1, STEEL[3] if s > 0 else STEEL[1])
        c.px(x, oy, STEEL[3] if s > 0 else STEEL[1])
        c.px(x + (1 if s > 0 else -1) * 0, oy - 1, STEEL[4] if s > 0 else STEEL[2])
    if lv >= 2:
        # side prongs: horizontal bars with ball tips
        y = base + 2
        c.hline(CX - r - 4, CX + r + 3, y, STEEL[2])
        c.hline(CX - r - 4, CX - 1, y, STEEL[3])
        for x in (CX - r - 5, CX + r + 4):
            c.rect(x, y - 1, x + 1, y, STEEL[2])
            c.px(x, y - 1, STEEL[4])
    if lv == 3:
        # crown claws above the orb
        for dx in (-3, 0, 3):
            x = CX + dx - (1 if dx == 0 else 0)
            yt = oy - r - (2 if dx == 0 else 1)
            c.vline(x, yt, oy - r + 1, STEEL[3] if dx <= 0 else STEEL[1])
            c.px(x, yt, STEEL[4])


def arcs(c, lv, k, attack=False):
    """fx: zig-zag arcs. idle: little crackles hugging the orb. attack: long bolts outward."""
    oy, r = LV[lv]["orb"]
    c.fx()
    if not attack:
        sets = [
            [[(CX - r - 1, oy - 2), (CX - r - 2, oy - 3), (CX - r - 2, oy - 4), (CX - r - 3, oy - 5)],
             [(CX + r + 1, oy + 1), (CX + r + 2, oy), (CX + r + 2, oy - 1), (CX + r + 3, oy - 1)]],
            [[(CX - r - 1, oy + 1), (CX - r - 2, oy + 1), (CX - r - 3, oy + 2)],
             [(CX + r, oy - 3), (CX + r + 1, oy - 4), (CX + r + 1, oy - 5), (CX + r + 2, oy - 6)],
             [(CX - 1, oy - r - 1), (CX - 2, oy - r - 2)]],
        ]
        for i, bolt in enumerate(sets[k]):
            for j, (x, y) in enumerate(bolt):
                c.px(x, y, WHITE if j == 0 else CYAN[2])
        if lv == 3:
            # floating arc ring between the two capacitor pods / rings
            yy = LV[lv]["rings"][1] - 2
            pts = [(CX - 7, yy + (1 if (x + k) % 3 else 0)) for x in range(0)]
            zig = [(CX - 9 + i, yy - ((i + k) % 3 == 0)) for i in range(0, 5)]
            for x, y in zig:
                c.px(x, y, CYAN[2])
    else:
        far = 0 if k == 0 else 2
        bolts = [
            [(1, 0), (2, -1), (3, -1), (4, -2), (5, -2), (6, -3), (7, -3), (8, -4)],
            [(1, 0), (2, 1), (3, 1), (4, 2), (5, 2), (6, 2), (7, 3), (8, 4)],
            [(0, -1), (-1, -2), (-1, -3), (-2, -4), (-2, -5), (-3, -6)],
            [(-1, 0), (-2, -1), (-3, 0), (-4, -1), (-5, -1), (-6, -2), (-7, -2)],
        ]
        n = 2 if lv == 1 else (3 if lv == 2 else 4)
        for bi, b in enumerate(bolts[:n]):
            sx = CX + (r if b[-1][0] > 0 else -r - 1) if bi != 2 else CX
            sy = oy if bi != 2 else oy - r
            for j, (dx, dy) in enumerate(b):
                if k == 1 and j < 3:
                    continue
                x, y = sx + dx + (far if dx > 0 else -far if dx < 0 else 0), sy + dy
                if 0 <= x < W and 0 <= y < H:
                    c.px(x, y, WHITE if (k == 0 and j < len(b) - 2) else CYAN[2])
                    if k == 0 and j % 3 == 1 and 0 <= y + 1 < H:
                        c.px(x, y + 1, CYAN[1])
    c.body()


def frame(lv, mode, k):
    c = Canvas(W, H)
    p = LV[lv]
    footing(c, seed=lv + 5, moss=True)
    transformer(c, lv)
    oy, r = p["orb"]
    coil(c, lv, oy + r + 1, p["box"][2] + 1)
    # insulators get smaller toward the top
    rings = p["rings"]
    for i, y in enumerate(sorted(rings, reverse=True)):
        insulator(c, y, (8 - i) if lv == 3 else (7 - i))
    hot = mode == "attack" and k == 0
    orb(c, lv, hot=hot, phase=k)
    cradle(c, lv)
    c.outline()
    if lv >= 2 and mode == "idle":
        # glow on the orb survives outline; small cyan pips on the side-prong balls
        pass
    arcs(c, lv, k, attack=(mode == "attack"))
    return c.image()


def build():
    entries = {}
    for lv in (1, 2, 3):
        key = "arc_spire" if lv == 1 else f"arc_spire_{lv}"
        frames = [frame(lv, "idle", 0), frame(lv, "idle", 1), frame(lv, "attack", 0), frame(lv, "attack", 1)]
        entries[key] = export(key, frames, HERE, {"idle": [0, 1], "attack": [2, 3]},
                              extra={"animFps": {"idle": 6, "attack": 10}})
    (HERE / "manifest_part.json").write_text(json.dumps(entries, indent=2))


if __name__ == "__main__":
    build()
