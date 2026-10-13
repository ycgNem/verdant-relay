"""Mortar Pod L1-L3 (32x48). Organic seed-mortar: a ribbed green pod in a steel cradle with a
fat metal barrel angled up-right.
L1: pod + short barrel.  L2: bigger barrel with clamp bands, pouch of amber seed-shells (bigger blast).
L3: larger pod with glowing burning-sap cracks, heavy barrel with a hot glowing muzzle (burning sap).
Frames: idle 2 (pod breathes), attack 2 (recoil + flash, smoke).
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "towers_common"))
from tw import *  # noqa
from parts import footing, smoke  # noqa

W, H = 32, 48
CX = 15
POD = ["#193c3e", "#265c42", "#3e8948", "#63c74d"]
FIRE = ["#be4a2f", "#f77622", "#feae34", "#fee761"]

LV = {
    1: dict(cy=32, rx=9, ry=7, blen=8, bth=6, ang=-45),
    2: dict(cy=31, rx=10, ry=8, blen=9, bth=7, ang=-45),
    3: dict(cy=30, rx=11, ry=9, blen=10, bth=8, ang=-45),
}


def cradle(c, lv):
    """Steel ring + three stubby legs holding the pod above the footing."""
    p = LV[lv]
    y = p["cy"] + p["ry"] - 2
    for lx in (CX - p["rx"] + 2, CX + p["rx"] - 4):
        c.rect(lx, y, lx + 1, 42, STEEL[1])
        c.vline(lx, y, 42, STEEL[2])
        c.px(lx, 42, STEEL[0])
    c.rect(CX - 1, y + 2, CX, 43, STEEL[1])
    c.vline(CX - 1, y + 2, 43, STEEL[3])


def pod(c, lv, squash=0, swell=0, burn=False, hot=True):
    p = LV[lv]
    cy, rx, ry = p["cy"] + squash, p["rx"] + swell + (1 if squash else 0), p["ry"] - squash + swell
    # body: shifted-shape shading (dark full, mid offset, light offset more)
    c.ell(CX, cy, rx, ry, POD[1])
    c.ell(CX - 1, cy - 1, rx - 1, ry - 1, POD[2], only="opaque")
    c.ell(CX - 3, cy - 3, rx - 4, ry - 4, POD[3], only="opaque")
    # bottom-right core shadow
    for a, b, y in ell_rows(CX, cy, rx, ry):
        if y > cy + ry // 2:
            c.hline(max(a, CX - 2), b, y, POD[1])
    for a, b, y in ell_rows(CX, cy, rx, ry):
        if y >= cy + ry - 1:
            c.hline(a + 2, b, y, POD[0])
    # two soft husk seams + gourd speckles (lighter dots) -- not cactus ribs
    for off in (-4, 4):
        for y in range(cy - ry + 3, cy + ry - 2):
            t = (y - cy) / ry
            x = int(round(CX + off * math.sqrt(max(0, 1 - t * t)) - 0.5))
            cur = c.get(x, y)
            col = POD[2] if (cur and cur[:3] == hex_rgb(POD[3])) else POD[1]
            c.px(x, y, col)
    # small leafy bracts at the base, left and right
    by = cy + ry - 2
    c.pattern(CX - rx - 1, by - 2, [".l.", "lg.", ".gd"], {"l": "#63c74d", "g": "#3e8948", "d": "#265c42"})
    c.pattern(CX + rx - 2, by - 2, [".g.", ".gd", "gd."], {"g": "#3e8948", "d": "#265c42"})
    # top stem-scar and specular
    c.pts([(CX - 1, cy - ry), (CX, cy - ry), (CX - 1, cy - ry + 1)], "#733e39")
    c.pts([(CX - rx + 3, cy - 3), (CX - rx + 3, cy - 2), (CX - rx + 4, cy - 4)], "#ead4aa")
    # moss/lichen spots
    c.pts([(CX + 3, cy + 3), (CX + 4, cy + 3), (CX - 5, cy + 4)], "#3e8948")
    if burn:
        # burning-sap cracks glowing through the husk
        cols = FIRE if hot else [FIRE[0], FIRE[0], FIRE[1], FIRE[2]]
        crack = [(CX + 2, cy - 2), (CX + 3, cy - 1), (CX + 3, cy), (CX + 4, cy + 1), (CX + 4, cy + 2),
                 (CX + 5, cy + 3), (CX - 4, cy + 1), (CX - 3, cy + 2), (CX - 3, cy + 3), (CX - 2, cy + 4)]
        for i, (x, y) in enumerate(crack):
            c.px(x, y, cols[2] if i % 3 else cols[3])
        c.pts([(CX + 4, cy + 2), (CX - 3, cy + 3)], cols[1])
        # dripping sap
        c.pts([(CX + 5, cy + 4), (CX + 5, cy + 5)], cols[1])
        c.px(CX + 5, cy + 6, cols[2])


def barrel(c, lv, recoil=0, hot=False):
    """45-degree tube: a pixel is in the barrel if its axis coordinate s=(dx-dy) is in [0, 2L]
    and its cross coordinate v=(dx+dy) is in [0, th). Ends are cut square to the axis."""
    p = LV[lv]
    L, th = p["blen"], p["bth"]
    bx = CX + 1 - recoil
    by = p["cy"] - p["ry"] + 5 + recoil
    shade = {6: [3, 4, 3, 2, 1, 0], 7: [3, 4, 3, 2, 2, 1, 0], 8: [3, 4, 4, 3, 2, 2, 1, 0]}[th]
    bands = [int(L * 0.35) * 2, int(L * 0.7) * 2] if lv >= 2 else [int(L * 0.5) * 2]
    tip = None
    for y in range(by - L - th, by + th + 2):
        for x in range(bx - th, bx + L + th + 2):
            sx = (x - bx) - (y - by)
            v = (x - bx) + (y - by)
            if not (-1 <= v <= th) or not (0 <= sx <= 2 * L):
                continue
            ring = sx >= 2 * L - 3
            band = any(b0 <= sx <= b0 + 1 for b0 in bands)
            if v in (-1, th):
                if ring or band:
                    c.px(x, y, STEEL[3] if v == -1 else STEEL[0])
                continue
            if ring:
                col = STEEL[4] if v <= 1 else (STEEL[2] if v < th - 2 else STEEL[1])
                if sx >= 2 * L - 1 and 1 <= v <= th - 2:
                    col = (FIRE[3] if v == th // 2 else FIRE[1]) if hot else OUT
            elif band:
                col = (RUST[3] if v <= 1 else RUST[2] if v < th - 2 else RUST[1]) if lv < 3 else                       (STEEL[3] if v <= 1 else STEEL[1])
            else:
                col = STEEL[shade[v]]
            c.px(x, y, col)
    # muzzle centre (for flash/smoke)
    tipx = bx + L + th // 2
    tipy = by - L + th // 2 - 1
    return tipx + 1, tipy - 1


def strap(c, lv, squash=0):
    """Riveted steel band strapping the barrel collar to the pod."""
    p = LV[lv]
    cy, rx, ry = p["cy"] + squash, p["rx"], p["ry"]
    # collar ring around the barrel root
    bx, by = CX + 2, cy - ry + 4
    c.ell(bx + 1, by + 1, 4 if lv < 3 else 5, 2, STEEL[2])
    for a, b, y in ell_rows(bx + 1, by + 1, 4 if lv < 3 else 5, 2):
        if y <= by:
            c.hline(a, a + (b - a) // 2, y, STEEL[3])
        if y == by + 3:
            c.hline(a, b, y, STEEL[0])


def seed_pouch(c, lv):
    """L2+: canvas pouch of amber seed shells hanging on the pod's left."""
    p = LV[lv]
    x0, y0 = CX - p["rx"] - 2, p["cy"] - 1
    c.rect(x0, y0, x0 + 4, y0 + 5, "#b86f50")
    c.hline(x0, x0 + 4, y0, "#e4a672")
    c.vline(x0 + 4, y0 + 1, y0 + 5, "#733e39")
    c.hline(x0, x0 + 4, y0 + 5, "#733e39")
    # seeds peeking out
    c.pts([(x0 + 1, y0 - 1), (x0 + 3, y0 - 1)], "#feae34")
    c.pts([(x0 + 2, y0 - 1), (x0 + 1, y0 - 2)], "#fee761")
    c.px(x0 + 2, y0 + 2, "#3e2731")
    # strap
    c.line(x0 + 4, y0, x0 + 7, y0 - 3, "#733e39")


def frame(lv, mode, k):
    c = Canvas(W, H)
    footing(c, seed=lv + 13, moss=True)
    cradle(c, lv)
    recoil = 0
    squash = 0
    swell = 0
    if mode == "attack":
        recoil = 2 if k == 0 else 1
        squash = 1 if k == 0 else 0
    elif k == 1:
        swell = 0
    burn = lv == 3
    hot_idle = not (mode == "idle" and k == 1)
    pod(c, lv, squash=squash, swell=swell, burn=burn, hot=hot_idle)
    strap(c, lv, squash)
    tip = barrel(c, lv, recoil=recoil, hot=burn)
    if mode == "idle" and k == 1:
        # breathing: pod top bulges 1px (redraw a lighter crown)
        p = LV[lv]
        c.hline(CX - 4, CX + 1, p["cy"] - p["ry"] - 1, POD[2])
        c.hline(CX - 3, CX - 1, p["cy"] - p["ry"] - 1, POD[3])
    if lv >= 2:
        seed_pouch(c, lv)
    c.outline()
    if mode == "attack":
        tx, ty = int(round(tip[0])), int(round(tip[1]))
        if k == 0:
            c.fx()
            c.pattern(tx - 2, ty - 2, [".y.y.", "yawy.", ".wwa.", "yaw..", "....."],
                      {"y": "#feae34", "a": "#fee761", "w": WHITE})
            c.body()
        else:
            smoke(c, tx - 1, ty - 2, big=True)
            if lv == 3:
                c.fx()
                c.pts([(tx, ty + 2), (tx + 1, ty + 1)], FIRE[2])
                c.body()
    return c.image()


def build():
    entries = {}
    for lv in (1, 2, 3):
        key = "mortar_pod" if lv == 1 else f"mortar_pod_{lv}"
        frames = [frame(lv, "idle", 0), frame(lv, "idle", 1), frame(lv, "attack", 0), frame(lv, "attack", 1)]
        entries[key] = export(key, frames, HERE, {"idle": [0, 1], "attack": [2, 3]},
                              extra={"animFps": {"idle": 2, "attack": 8}})
    (HERE / "manifest_part.json").write_text(json.dumps(entries, indent=2))


if __name__ == "__main__":
    build()
