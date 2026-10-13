"""Thorn Nest L1-L3 (32x48). Woven wooden basket nest bristling with thorns.
L1: brown wicker basket on stakes, dark-red bone-tipped thorns.
L2: purple sap pooled inside and dripping, purple-tipped thorns (slow on hit).
L3: bigger basket, more/longer thorns, glowing magenta seed core + glowing sap (slow splash).
Frames: idle 2 (thorns bristle, sap drips), attack 2 (thorns flare + volley).
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "towers_common"))
from tw import *  # noqa
from parts import mound, thorn, spike  # noqa

W, H = 32, 48
CX = 16

LV = {
    1: dict(rim=31, rx=9, ry=3, bot=39, brx=6,
            main=[(-152, 6, 3, -6), (-120, 9, 3, -3), (-93, 12, 3, 0), (-62, 9, 3, 3), (-30, 6, 3, 6)],
            small=[(-138, 5, 2, -4), (-76, 6, 2, 2)], side=1),
    2: dict(rim=30, rx=10, ry=3, bot=39, brx=7,
            main=[(-155, 7, 3, -7), (-125, 10, 3, -4), (-97, 13, 3, -1), (-72, 11, 3, 2), (-45, 9, 3, 5),
                  (-22, 6, 3, 7)],
            small=[(-140, 6, 2, -5), (-84, 8, 2, 1), (-58, 6, 2, 4)], side=2),
    3: dict(rim=27, rx=12, ry=4, bot=39, brx=8,
            main=[(-158, 9, 4, -9), (-132, 12, 4, -6), (-108, 15, 4, -3), (-86, 17, 4, 0), (-64, 14, 4, 3),
                  (-40, 11, 4, 6), (-18, 8, 3, 9)],
            small=[(-145, 7, 2, -7), (-120, 9, 2, -4), (-97, 11, 2, -1), (-75, 10, 2, 2), (-52, 8, 2, 5)],
            side=3),
}
THORN = ("#3e2731", "#733e39", "#b86f50")
BONE = ("#c28569", "#e8b796", "#ead4aa")


def basket(c, lv, squash=0):
    p = LV[lv]
    rim, rx, ry, bot, brx = p["rim"] + squash, p["rx"], p["ry"], p["bot"], p["brx"]
    for y in range(rim, bot + 3):
        t = (y - rim) / max(1, (bot + 2 - rim))
        hw = brx + (rx - brx) * math.cos(t * math.pi / 2) ** 0.6
        if y > bot:
            hw -= (y - bot) * 1.5
        a, b = int(round(CX - hw)), int(round(CX + hw)) - 1
        band = (y - rim) // 2
        rib_row = (y - rim) % 2
        for x in range(a, b + 1):
            rel = x - CX + 40
            f = (x - a) / max(1, b - a)
            lit = 1 if f < 0.28 else (0 if f < 0.68 else -1)
            if rel % 4 == 0:
                idx = 1 + (1 if lit > 0 else 0)
            elif (rel // 4 + band) % 2 == 0:       # strand passes over the rib
                idx = (3 if rib_row == 0 else 2) + lit
            else:                                  # strand passes under
                idx = (2 if rib_row == 0 else 1) + min(0, lit)
            c.px(x, y, WOOD[max(0, min(4, idx))])
    # twig ends sticking out of the weave
    c.pts([(CX - rx - 1, rim + 3), (CX - rx - 2, rim + 2)], WOOD[2])
    c.pts([(CX + rx, rim + 5), (CX + rx + 1, rim + 4)], WOOD[1])
    c.pts([(CX - brx - 1, bot), (CX - brx - 2, bot + 1)], WOOD[2])
    # interior (seen from above)
    c.ell(CX, rim, rx - 1, ry, "#3e2731")
    c.ell(CX, rim - 1, rx - 2, max(1, ry - 1), OUT)


def rim(c, lv, squash=0, part="back"):
    p = LV[lv]
    r, rx, ry = p["rim"] + squash, p["rx"], p["ry"]
    inner = {iy: (ia, ib) for ia, ib, iy in ell_rows(CX, r, rx - 2, ry - 1)}
    for a, b, y in ell_rows(CX, r, rx, ry):
        back = y < r
        if (part == "back") != back:
            continue
        for x in range(a, b + 1):
            if y in inner and inner[y][0] <= x <= inner[y][1]:
                continue
            twist = ((x + y) // 2) % 2
            if back:
                col = WOOD[3] if twist else WOOD[2]
                if x > CX + rx // 2:
                    col = WOOD[2] if twist else WOOD[1]
            else:
                col = WOOD[4] if twist else WOOD[3]
                if x > CX + rx // 3:
                    col = WOOD[3] if twist else WOOD[2]
            c.px(x, y, col)


def stakes(c, lv):
    p = LV[lv]
    for x in (CX - p["brx"] + 1, CX + p["brx"] - 3):
        c.rect(x, p["bot"] + 1, x + 1, 44, WOOD[1])
        c.vline(x, p["bot"] + 1, 44, WOOD[2])
        c.px(x, p["bot"] + 3, WOOD[0])
    # lashing twine
    c.hline(CX - p["brx"] + 1, CX - p["brx"] + 2, p["bot"] + 2, "#ead4aa")
    c.hline(CX + p["brx"] - 3, CX + p["brx"] - 2, p["bot"] + 2, "#e4a672")


def thorn_set(lv, phase=0, grow=0):
    """List of (bx, by, dx, dy, length) thorns rising out of the nest."""
    p = LV[lv]
    out = []
    n = p["n"]
    lo, hi = p["ln"]
    for i in range(n):
        t = i / (n - 1)
        ang = math.radians(-165 + 150 * t + (4 if (phase and i % 2) else 0) - (3 if (phase and not i % 2) else 0))
        bx = CX - 0.5 + (p["rx"] - 3) * (t * 2 - 1)
        by = p["rim"] + (1 if i % 2 else 0)
        L = lo + ((i * 7) % (hi - lo + 1))
        if abs(t - 0.5) < 0.2:
            L = hi
        out.append((bx, by, math.cos(ang), math.sin(ang) * 1.25, L + grow))
    return out


def frame(lv, mode, k):
    c = Canvas(W, H)
    p = LV[lv]
    sap = lv >= 2
    glow = lv == 3
    squash = 1 if (mode == "attack" and k == 1) else 0
    grow = 1 if (mode == "attack" and k == 0) else (-1 if mode == "attack" else 0)
    mound(c, seed=lv)
    stakes(c, lv)
    basket(c, lv, squash)
    rim_y = p["rim"] + squash
    # side thorns poking through the weave
    for j in range(p["side"]):
        y = rim_y + 2 + j * 3
        spike(c, CX - p["rx"] + 1 + j // 2, y, 190 + 12 * j, 4, 2, BONE, tip="#ead4aa", tip_n=1)
        spike(c, CX + p["rx"] - 1 - j // 2, y + 1, -12 + 10 * j, 4, 2, BONE, tip="#e8b796", tip_n=1)
    rim_part = rim
    rim_part(c, lv, squash, "back")
    # sap pool inside
    if sap:
        c.ell(CX, rim_y, p["rx"] - 3, max(1, p["ry"] - 1), SAP[1])
        c.hline(CX - p["rx"] + 4, CX - 1, rim_y - 1, SAP[2])
        if glow:
            c.hline(CX - 3, CX + 1, rim_y, SAP[3])
    # glowing seed core among the thorns (L3)
    hot = mode == "attack" and k == 0 or (mode == "idle" and k == 0)
    tip = "#e43b44" if not sap else (SAP[2] if not glow else SAP[3])
    tips = []
    sway = (1 if (mode == "idle" and k == 1) else 0)
    for (ang, L, w, ox) in p["small"]:
        tips.append(spike(c, CX - 0.5 + ox, rim_y, ang - 3 * sway, L + grow, w, THORN, tip=tip, tip_n=1,
                          upper=BONE, split=0.45))
    for i, (ang, L, w, ox) in enumerate(p["main"]):
        da = (3 if i % 2 else -3) * sway
        tips.append(spike(c, CX - 0.5 + ox, rim_y + (i % 2), ang + da, L + grow, w, THORN, tip=tip,
                          upper=BONE, split=0.35, tip_n=2 if lv < 3 else 3))
    if glow:
        c.circle(CX - 1, rim_y - 1, 3, SAP[2])
        c.circle(CX - 1, rim_y - 1, 2, SAP[3] if hot else SAP[2])
        c.circle(CX - 1, rim_y - 2, 1, SAP[3])
        c.pts([(CX - 2, rim_y - 3), (CX - 1, rim_y - 3), (CX - 2, rim_y - 2)], WHITE if hot else "#e8b796")
        c.pts([(CX + 1, rim_y + 1), (CX, rim_y + 2)], SAP[1])
    rim_part(c, lv, squash, "front")
    # sap drips over the rim (2px wide runs with a bright bead)
    if sap:
        dl = 1 if (mode == "idle" and k == 1) else 0
        for dxp, ln in ((-p["rx"] + 3, 3 + dl), (1, 5 + dl), (p["rx"] - 4, 2 + dl)):
            x = CX + dxp
            y0 = rim_y + p["ry"] - (1 if abs(dxp) > 3 else 0)
            c.rect(x, y0, x + 1, y0 + ln - 1, SAP[1])
            c.vline(x, y0, y0 + ln - 2, SAP[2])
            c.px(x, y0 + ln, SAP[2] if not glow else SAP[3])
            c.px(x + 1, y0 + ln - 1, SAP[1])
    c.outline()
    if glow:
        # emissive pips on the thorn tips survive the outline pass
        c.fx()
        for (tx, ty) in tips[::2]:
            c.px(int(round(tx)), int(round(ty)), SAP[3])
        c.body()
    if mode == "attack":
        c.fx()
        # thorn darts leaving the nest
        darts = [(23, rim_y - 9, 1, -0.5), (25, rim_y - 3, 1, 0.1), (19, rim_y - 13, 0.6, -1)]
        if lv == 1:
            darts = darts[:2]
        for i, (x, y, dx, dy) in enumerate(darts):
            off = 0 if k == 0 else 3
            x0, y0 = x + dx * off, y + dy * off
            for t in range(3):
                X, Y = int(round(x0 + dx * t)), int(round(y0 + dy * t))
                col = "#a22633" if t < 2 else ("#ead4aa" if not sap else SAP[3])
                if 0 <= X < W and 0 <= Y < H:
                    c.px(X, Y, col)
        c.body()
    return c.image()


def build():
    entries = {}
    for lv in (1, 2, 3):
        key = "thorn_nest" if lv == 1 else f"thorn_nest_{lv}"
        frames = [frame(lv, "idle", 0), frame(lv, "idle", 1), frame(lv, "attack", 0), frame(lv, "attack", 1)]
        entries[key] = export(key, frames, HERE, {"idle": [0, 1], "attack": [2, 3]},
                              extra={"animFps": {"idle": 3, "attack": 10}})
    (HERE / "manifest_part.json").write_text(json.dumps(entries, indent=2))


if __name__ == "__main__":
    build()
