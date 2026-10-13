"""Scrap Turret L1-L3 (32x48). Salvaged gun turret facing RIGHT.
L1: single barrel, rust-orange patchwork housing on a pedestal.
L2: twin barrels + ammo box with a brass belt feeding the housing.
L3: heavy steel armour, twin heavy barrels with muzzle brakes, glowing amber core.
Frames: idle 2 (sensor blink / core pulse), attack 2 (recoil + muzzle flash, smoke + casing).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "towers_common"))
from tw import *  # noqa
from parts import footing, hbarrel, muzzle_flash, smoke  # noqa

W, H = 32, 48

LV = {
    1: dict(x0=7, x1=20, top=21, th=5, bot=32, barrels=[27], bx1=28, ped=(33, 39, 5)),
    2: dict(x0=6, x1=21, top=18, th=5, bot=32, barrels=[23, 27], bx1=29, ped=(33, 39, 5)),
    3: dict(x0=4, x1=21, top=12, th=6, bot=32, barrels=[19, 25], bx1=29, ped=(33, 39, 6)),
}


def pedestal(c, lv):
    y0, y1, rx = LV[lv]["ped"]
    c.drum(16, y0, y1, rx, 2, STEEL, top=STEEL[2])
    # flange ring with bolts
    c.hline(16 - rx, 16 + rx - 1, y1 - 1, STEEL[1])
    for x in range(16 - rx + 1, 16 + rx - 1, 2):
        c.px(x, y1 - 1, STEEL[3])
    # hazard band
    for x in range(16 - rx, 16 + rx):
        if (x // 2) % 2 == 0:
            c.px(x, y0 + 3, "#feae34" if x < 16 else "#f77622")
        else:
            c.px(x, y0 + 3, INK)
    # rust streak running down
    c.pts([(16 + rx - 3, y0 + 4), (16 + rx - 3, y0 + 5)], RUST[1])


def housing(c, lv, dx=0, glow=0):
    p = LV[lv]
    x0, x1, top, th, bot = p["x0"] + dx, p["x1"] + dx, p["top"], p["th"], p["bot"]
    F = RUST
    ys = top + th                     # first row of the side face
    # --- top face (lit) with rounded back corners
    c.rect(x0, top + 1, x1, ys - 1, F[3])
    c.hline(x0 + 1, x1, top, F[3])
    c.hline(x0 + 1, x1 - 4, top, F[4])          # lit back edge
    c.vline(x0, top + 1, ys - 2, F[4])          # lit left edge
    c.px(x0 + 1, top + 1, F[4])
    # --- side face
    c.rect(x0, ys, x1, bot, F[2])
    c.hline(x0, x1 - 3, ys, F[3])               # bevel catching light
    c.vline(x0, ys, bot - 1, F[3])
    c.rect(x0 + 1, bot - 1, x1, bot, F[1])      # shadow under the belly
    c.px(x0, bot, F[1])
    # --- front glacis plate (faces right -> shade), chamfered corner
    for y in range(top, bot + 1):
        if y < ys:
            g0 = x1 - 3 + (y - top) * 3 // max(1, th)   # sloping on the top face
        else:
            g0 = x1 - 2
        c.hline(g0, x1, y, F[1])
        c.px(g0, y, F[2] if y < ys else F[2])
    for i in range(3):
        for x in range(x1 - 2 + i, x1 + 1):
            c.erase(x, top + i)
    c.px(x1 - 3, top, F[3])
    # --- plate seam + rivets on the side
    sx = x0 + (6 if lv < 3 else 8)
    c.vline(sx, ys + 1, bot - 2, F[1])
    for y in range(ys + 2, bot - 1, 3):
        c.px(sx - 1, y, F[4])
        c.px(sx + 1, y, F[4])
    # --- welded steel patch plate
    px0, py0 = x0 + 2, bot - 6
    c.rect(px0, py0, px0 + 3, py0 + 3, STEEL[2])
    c.hline(px0, px0 + 3, py0, STEEL[3])
    c.vline(px0 + 3, py0 + 1, py0 + 3, STEEL[1])
    c.px(px0, py0, STEEL[4])
    c.hline(px0, px0 + 3, py0 + 4, F[1])            # weld bead shadow
    # --- rust streaks / chipped paint
    c.pts([(sx + 1, ys + 3), (sx + 1, ys + 4), (sx + 1, ys + 5)], F[1])
    c.pts([(x1 - 4, bot - 4), (x1 - 4, bot - 3)], F[1])
    c.pts([(x0 + 4, ys), (x0 + 10, ys), (x1 - 4, top + 1)], STEEL[3])
    # --- hatch + vent on top
    hx = x0 + 2
    c.rect(hx, top + 1, hx + 3, top + 3, F[2])
    c.hline(hx, hx + 3, top + 1, F[1])
    c.px(hx + 3, top + 3, F[1])
    c.px(hx + 1, top + 2, F[4])
    vx = sx + 2
    for x in range(vx, min(vx + 5, x1 - 4), 2):
        c.vline(x, top + 2, ys - 2, F[1])
    # --- sensor eye (blinks)
    ex, ey = x1 - 5, ys + 2
    c.hline(ex - 1, ex + 1, ey, OUT)
    c.hline(ex - 1, ex + 1, ey + 1, F[1])
    c.px(ex, ey, "#ff0044" if glow % 2 == 0 else "#a22633")
    c.px(ex + 1, ey, "#e43b44" if glow % 2 == 0 else "#3e2731")
    return x0, x1, top, th, bot


def armour(c, lv, dx=0, glow=0):
    """L3 extras: bolted steel skirt + shoulder, glowing amber core, sensor mast."""
    p = LV[lv]
    x0, x1, top, th, bot = p["x0"] + dx, p["x1"] + dx, p["top"], p["th"], p["bot"]
    ys = top + th
    # heavy steel skirt over the lower side
    c.rect(x0 - 1, bot - 4, x1 - 2, bot + 1, STEEL[1])
    c.hline(x0 - 1, x1 - 3, bot - 4, STEEL[3])
    c.hline(x0, x1 - 3, bot - 3, STEEL[2])
    c.vline(x0 - 1, bot - 4, bot, STEEL[2])
    c.hline(x0 - 1, x1 - 2, bot + 1, STEEL[0])
    for x in range(x0 + 1, x1 - 2, 3):
        c.px(x, bot - 2, STEEL[4])
        c.px(x, bot - 1, STEEL[0])
    c.pts([(x0 + 6, bot - 3), (x0 + 6, bot - 2), (x0 + 13, bot - 3)], RUST[1])
    # armour cheek plate across the top face back
    c.rect(x0 + 1, top + 1, x0 + 7, ys - 1, STEEL[2])
    c.hline(x0 + 1, x0 + 7, top + 1, STEEL[4])
    c.vline(x0 + 1, top + 1, ys - 1, STEEL[3])
    c.hline(x0 + 1, x0 + 7, ys - 1, STEEL[1])
    c.px(x0 + 3, top + 3, STEEL[4]); c.px(x0 + 6, top + 3, STEEL[4])
    # amber core window: round grille glowing in the side
    cx, cy = x0 + 4, ys + 6
    hot = glow % 2 == 0
    c.circle(cx, cy, 3, STEEL[1])
    c.circle(cx, cy, 2, AMBER[1] if hot else AMBER[0])
    c.circle(cx, cy, 1, AMBER[3] if hot else AMBER[1])
    c.px(cx, cy, WHITE if hot else AMBER[2])
    c.vline(cx - 1, cy - 2, cy + 2, OUT)
    c.vline(cx + 1, cy - 2, cy + 2, OUT)
    c.pts([(cx - 2, cy - 3), (cx - 3, cy - 2), (cx - 1, cy - 3)], STEEL[3])
    c.pts([(cx + 3, cy + 1), (cx + 2, cy + 3), (cx + 3, cy + 2)], STEEL[0])
    # sensor mast (rangefinder) at the back
    mx = x0 + 4
    c.vline(mx, top - 6, top, STEEL[3])
    c.vline(mx + 1, top - 6, top, STEEL[1])
    c.rect(mx - 2, top - 9, mx + 3, top - 7, STEEL[2])
    c.hline(mx - 2, mx + 3, top - 9, STEEL[3])
    c.hline(mx - 2, mx + 3, top - 7, STEEL[1])
    c.px(mx + 3, top - 8, "#2ce8f5" if hot else "#0099db")
    c.px(mx - 2, top - 8, STEEL[3])


def ammo(c, glow=0):
    """L2/L3 ammo can beside the pedestal + brass belt feeding the housing."""
    bx0, bx1, by0, by1 = 2, 8, 30, 38
    c.rect(bx0, by0, bx1, by1, "#3e8948")                 # olive drab can
    c.hline(bx0, bx1, by0, "#63c74d")
    c.hline(bx0, bx1, by0 + 1, "#3e8948")
    c.vline(bx1, by0 + 1, by1, "#265c42")
    c.hline(bx0, bx1, by1, "#265c42")
    c.vline(bx0, by0, by1 - 1, "#63c74d")
    c.rect(bx0 + 2, by0 + 3, bx0 + 4, by0 + 4, "#ead4aa")  # stencil label
    c.px(bx0 + 3, by0 + 4, "#265c42")
    c.pts([(bx0 + 1, by0 + 6), (bx1 - 1, by0 + 6)], "#193c3e")
    c.px(bx0 + 5, by1 - 1, RUST[1])
    # belt: links alternate brass/dark, rising from the can lid to the housing side
    path = [(4, 29), (4, 28), (5, 27), (6, 27), (7, 26), (8, 26)]
    for i, (x, y) in enumerate(path):
        k = (i + glow) % 2
        c.px(x, y, BRASS[2] if k == 0 else BRASS[1])
        c.px(x, y - 1, BRASS[3] if k == 0 else BRASS[2])


def frame(lv, mode, k):
    """mode idle/attack, k = frame index within the anim."""
    c = Canvas(W, H)
    footing(c, seed=lv * 3, moss=True)
    pedestal(c, lv)
    if lv >= 2:
        ammo(c, glow=(1 if (mode == "attack" and k == 0) else 0))
    recoil = 0
    hdx = 0
    if mode == "attack":
        recoil = -2 if k == 0 else -1
        hdx = -1 if k == 0 else 0
    p = LV[lv]
    # barrels behind the housing front: draw before so housing overlaps the root
    for by in p["barrels"]:
        bx0 = p["x1"] - 4 + hdx
        thick = 3 if lv < 3 else 4
        hbarrel(c, bx0, p["bx1"] + recoil, by, thick=thick, brake=(lv == 3))
    housing(c, lv, dx=hdx, glow=k if mode == "idle" else 0)
    # mantlet: steel collar where the barrels leave the glacis
    bys = p["barrels"]
    thick = 3 if lv < 3 else 4
    mx = p["x1"] + hdx
    my0, my1 = bys[0] - 1 - (lv == 3), bys[-1] + thick + (lv == 3)
    mw = 2 if lv < 3 else 3
    c.rect(mx - 1, my0, mx + mw - 1, my1, STEEL[1])
    c.vline(mx - 1, my0, my1 - 1, STEEL[3])
    c.hline(mx - 1, mx + mw - 2, my0, STEEL[4] if lv == 3 else STEEL[3])
    c.vline(mx + mw - 1, my0 + 1, my1, STEEL[0])
    if lv == 3:
        c.vline(mx, my0 + 1, my1 - 1, STEEL[2])
        c.px(mx, my0 + 2, STEEL[4]); c.px(mx, my1 - 2, STEEL[4])
    if lv == 3:
        g = k if mode == "idle" else (0 if k == 0 else 1)
        armour(c, lv, dx=hdx, glow=g)
    c.outline()
    if mode == "attack":
        for by in p["barrels"]:
            th = 3 if lv < 3 else 4
            tip = p["bx1"] + recoil
            if k == 0:
                muzzle_flash(c, tip + 2, by + th // 2, size=2 if lv == 3 else 1)
            else:
                smoke(c, tip + 1, by - 2, big=(lv == 3))
        if k == 1:
            # ejected casing
            c.fx()
            hx = p["x0"] + 6
            c.px(hx, p["top"] - 2, BRASS[3]); c.px(hx + 1, p["top"] - 2, BRASS[2])
            c.body()
    return c.image()


def build():
    entries = {}
    for lv in (1, 2, 3):
        key = "scrap_turret" if lv == 1 else f"scrap_turret_{lv}"
        frames = [frame(lv, "idle", 0), frame(lv, "idle", 1), frame(lv, "attack", 0), frame(lv, "attack", 1)]
        entries[key] = export(key, frames, HERE, {"idle": [0, 1], "attack": [2, 3]},
                              extra={"animFps": {"idle": 2, "attack": 10}})
    (HERE / "manifest_part.json").write_text(json.dumps(entries, indent=2))


if __name__ == "__main__":
    build()
