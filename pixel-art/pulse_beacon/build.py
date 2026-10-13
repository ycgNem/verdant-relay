"""Pulse Beacon L1-L3 (32x48). Support tower: a riveted steel antenna cone ringed by glowing
amber emitter rings, on a vented base. No attack -- idle 4 is the pulse.
L1: 1 ring.  L2: 2 rings, taller cone, side fins.  L3: 3 rings, emitter dish crown, brightest pulse.
Frames: idle 4 (rings brighten in sequence, a wave ripples out).
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
GLOW = [  # dim -> bright (back, front, highlight)
    ("#733e39", "#be4a2f", "#f77622"),
    ("#be4a2f", "#f77622", "#feae34"),
    ("#f77622", "#feae34", "#fee761"),
    ("#feae34", "#fee761", "#ffffff"),
]

LV = {
    1: dict(top=10, base=36, hw=7, rings=[26]),
    2: dict(top=7, base=36, hw=7, rings=[28, 19]),
    3: dict(top=5, base=36, hw=8, rings=[30, 22, 14]),
}


def cone_hw(lv, y):
    p = LV[lv]
    t = (y - p["top"]) / (p["base"] - p["top"])
    return 1 + (p["hw"] - 1) * t


def base_box(c, lv):
    x0, x1 = 7, 24
    c.box(x0, x1, 34, 3, 41, STEEL[2], STEEL[1], lit=STEEL[2], dark=STEEL[0], edge=STEEL[3])
    c.hline(x0 + 1, x1 - 1, 34, STEEL[3])
    # vents with amber glow behind
    for x in range(x0 + 2, x1 - 2, 3):
        c.rect(x, 38, x + 1, 39, OUT)
        c.px(x, 39, "#be4a2f")
    # rust + bolt corners
    c.pts([(x0 + 1, 37), (x1 - 1, 37)], STEEL[3])
    c.pts([(x1 - 3, 40), (x1 - 3, 41)], RUST[1])
    # cable snaking off to the side
    c.pts([(x1 + 1, 39), (x1 + 2, 40), (x1 + 3, 41), (x1 + 3, 42), (x1 + 4, 43)], INK)
    c.pts([(x1 + 1, 38), (x1 + 2, 39)], STEEL[2])


def cone(c, lv):
    p = LV[lv]
    for y in range(p["top"], p["base"] + 1):
        hw = cone_hw(lv, y)
        a, b = int(round(CX - hw)), int(round(CX + hw)) - 1
        w = b - a + 1
        for x in range(a, b + 1):
            c.px(x, y, shade_col(x - a, w, STEEL))
    # panel seams (horizontal) and rivets
    for y in range(p["top"] + 4, p["base"], 5):
        hw = cone_hw(lv, y)
        a, b = int(round(CX - hw)), int(round(CX + hw)) - 1
        c.hline(a, b, y, STEEL[1])
        c.hline(a, a + max(1, (b - a) // 3), y + 1, STEEL[4])
        if b - a > 6:
            c.px(a + 2, y - 2, STEEL[4])
            c.px(b - 2, y - 2, STEEL[1])
    # rust streak down the shade side
    yy = p["top"] + 8
    c.pts([(int(CX + cone_hw(lv, yy)) - 2, yy + i) for i in range(4)], RUST[1])
    # antenna spike + tip light
    c.vline(CX - 1, p["top"] - 5, p["top"], STEEL[3])
    c.vline(CX, p["top"] - 4, p["top"], STEEL[1])
    c.hline(CX - 3, CX + 1, p["top"] - 2, STEEL[2])
    c.px(CX - 3, p["top"] - 2, STEEL[3])


def ring(c, lv, y, level, part):
    """Amber emitter torus around the cone at row y. level 0..3 brightness. part back/front."""
    hw = cone_hw(lv, y)
    rx = int(round(hw)) + 3
    back, front, hi = GLOW[level]
    rows = ell_rows(CX, y, rx, 3)
    inner = {iy: (ia, ib) for ia, ib, iy in ell_rows(CX, y - 1, rx - 3, 1)}
    for a, b, yy in rows:
        if (part == "back") != (yy < y):
            continue
        for x in range(a, b + 1):
            if yy in inner and inner[yy][0] <= x <= inner[yy][1]:
                continue
            if part == "back":
                c.px(x, yy, back if yy < y - 1 else front)
            else:
                f = (x - a) / max(1, b - a)
                if yy == y:
                    col = hi if f < 0.6 else front
                elif yy == y + 1:
                    col = front if f < 0.75 else back
                else:
                    col = back
                c.px(x, yy, col)
    if part == "front":
        c.px(CX - rx, y, hi)
        c.px(CX + rx - 1, y + 1, back)


def fins(c, lv):
    """L2+: side radiator fins on the lower cone."""
    for d in (-1, 1):
        x = CX + d * 9 - (1 if d > 0 else 0)
        for i in range(3):
            c.vline(x + d * 0, 30 + i * 2 - 6, 30 + i * 2, STEEL[3] if d < 0 else STEEL[1])
        c.line(x, 24, x + d * 2, 26, STEEL[2])


def dish(c, level):
    """L3 crown: small emitter dish around the antenna."""
    y = LV[3]["top"] - 1
    c.ell(CX, y, 5, 1, STEEL[2])
    c.hline(CX - 4, CX - 1, y - 1, STEEL[4])
    c.hline(CX - 5, CX + 4, y + 1, STEEL[1])
    c.px(CX - 1, y, GLOW[level][2])


def frame(lv, k):
    c = Canvas(W, H)
    p = LV[lv]
    footing(c, seed=lv + 21, moss=True)
    base_box(c, lv)
    rings = p["rings"]
    # brightness: pulse climbs up the rings
    lv_of = []
    for i in range(len(rings)):
        ph = (k - i) % 4
        lv_of.append([1, 2, 3, 2][ph] if lv < 3 else [1, 3, 3, 2][ph])
    for i, y in enumerate(rings):
        ring(c, lv, y, lv_of[i] - (1 if lv == 1 and lv_of[i] == 3 else 0), "back")
    cone(c, lv)
    if lv >= 2:
        fins(c, lv)
    for i, y in enumerate(rings):
        ring(c, lv, y, lv_of[i] - (1 if lv == 1 and lv_of[i] == 3 else 0), "front")
    # glowing lens slit down the cone front, pulses with the top ring
    lt = p["top"] + 3
    lb = rings[-1] - 4 if len(rings) > 1 else rings[0] - 4
    g = GLOW[lv_of[-1]]
    c.vline(CX - 2, lt, lb, g[1])
    c.vline(CX - 1, lt, lb, g[0])
    c.px(CX - 2, lt, g[2])
    if lv == 3:
        dish(c, max(lv_of))
    c.outline()
    # emissive extras on the fx layer: tip light + pulse wave
    c.fx()
    tipc = GLOW[[1, 2, 3, 2][k]][2]
    c.px(CX - 1, p["top"] - 6, tipc)
    if k in (2, 3):
        # expanding wave arc around the lowest ring (thin amber ellipse fragments)
        y = rings[0]
        rx = int(round(cone_hw(lv, y))) + (6 if k == 2 else 9) + (lv - 1)
        rx = min(rx, 15)
        ry = 3 if k == 2 else 4
        col = "#feae34" if k == 2 else "#f77622"
        rows = ell_rows(CX, y, rx, ry)
        for i, (a, b, yy) in enumerate(rows):
            if yy < y - 1:
                continue
            nxt = rows[i + 1] if i + 1 < len(rows) else None
            xs = [a, b]
            if nxt:
                xs += list(range(a, nxt[0])) + list(range(nxt[1] + 1, b + 1))
            else:
                xs += list(range(a, b + 1))
            for x in set(xs):
                if 0 <= x < W and not c.get(x, yy):
                    c.px(x, yy, col)
    c.body()
    return c.image()


def build():
    entries = {}
    for lv in (1, 2, 3):
        key = "pulse_beacon" if lv == 1 else f"pulse_beacon_{lv}"
        frames = [frame(lv, k) for k in range(4)]
        entries[key] = export(key, frames, HERE, {"idle": [0, 1, 2, 3]}, extra={"animFps": {"idle": 6}})
    (HERE / "manifest_part.json").write_text(json.dumps(entries, indent=2))


if __name__ == "__main__":
    build()
