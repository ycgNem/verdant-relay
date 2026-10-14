"""District hero ruins (critic H fix 3): hand-finish of four PixelLab map objects.

    ruin_market_kiosks     2c085760  Overgrown Market: row of kiosks, torn faded awnings
    ruin_station_platform  3a8f9796  Flooded Transit: half-sunk platform, station sign, mud + puddles
    ruin_apartment_facade  89098025  Collapsed Residential: apartment front with balconies, broken corner
    ruin_server_hall       6f83e229  Data Center: server-rack hall, cooling fan, cable bundles, LED pixels

The raws came back clean and cosy; each is graded down onto the jungle's palette (desaturated, darker, moss) and
damaged by hand (tears, collapse, waterline, grime). No resampling: crops, pads, a mirror and per-texel edits only.

    python pixel-art/pixellab_v3/build_ruins.py
"""
import colorsys
import json
import math
import random

from PIL import Image

from v3tools import HERE, SCRATCH, SPRITES, Canvas, check_alpha, gridzoom, hx, load, lum, mixc, preview

OUT = "#0c0b0d"
MOSS = ["#1c2b18", "#2a4020", "#3a5626", "#4d6e2c", "#648a34", "#80a63e"]
INTERIOR = "#120d17"


# ------------------------------------------------------------------ shared helpers
def grade(c, sat=0.62, val=0.86, shadow_tint=("#1d3a36", 0.18), keep=lambda p: False):
    """Pull a raw onto the jungle palette: less saturation, lower value, teal-tinted shadows."""
    for y in range(c.h):
        for x in range(c.w):
            p = c.get(x, y)
            if not p[3] or keep(p):
                continue
            h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
            s *= sat
            v *= val
            r, g, b = colorsys.hsv_to_rgb(h, s, v)
            col = (round(r * 255), round(g * 255), round(b * 255))
            dark = 1 - min(1, lum(col) / 110)
            if dark > 0:
                col = mixc(col, shadow_tint[0], shadow_tint[1] * dark)[:3]
            c.set(x, y, col)


def is_green(p):
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    return 0.17 < h < 0.42 and s > 0.35 and v > 0.25


def remap_greens(c, box=None):
    """Raw lime foliage → the jungle's moss ramp (by luminance)."""
    x0, y0, x1, y1 = box or (0, 0, c.w, c.h)
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = c.get(x, y)
            if p[3] and is_green(p):
                i = min(5, max(0, int(lum(p) / 255 * 7.2)))
                c.set(x, y, MOSS[i])


def vine(c, x, y, ln, seed):
    rnd = random.Random(seed)
    for i in range(ln):
        yy = y + i
        xx = x + (1 if (i // 4) % 2 and rnd.random() < 0.6 else 0)
        c.set(xx, yy, MOSS[3] if i % 3 else MOSS[2])
        c.set(xx + 1, yy, MOSS[1])
        if rnd.random() < 0.42:
            side = -1 if rnd.random() < 0.55 else 1
            c.set(xx + (-1 if side < 0 else 2), yy, MOSS[5] if side < 0 else MOSS[4])
            if rnd.random() < 0.5:
                c.set(xx + (-2 if side < 0 else 3), yy - 1, MOSS[4] if side < 0 else MOSS[3])
    c.set(x, y + ln, MOSS[4])


def moss_clump(c, cx, cy, r, seed, only=None, dense=0.9):
    rnd = random.Random(seed)
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r - 2, cx + r + 3):
            d = math.hypot((x - cx) * 0.75, y - cy) / max(1, r)
            if d > 1 or not c.get(x, y)[3] or (only and not only(x, y)):
                continue
            if rnd.random() > dense * (1.15 - d * 0.6):
                continue
            lit = (cx - x) * 0.35 + (cy - y) * 0.6
            i = 2 + int((1 - d) * 2.2 + lit * 0.25 + rnd.random() * 0.8)
            c.set(x, y, MOSS[max(1, min(5, i))])


def crack(c, pts, col="#1a1a1c", light=None):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        c.line(x0, y0, x1, y1, col)
        if light:
            c.line(x0, y0 + 1, x1, y1 + 1, light)
            c.line(x0, y0, x1, y1, col)


def outline_new(c, before):
    """Give texels added since `before` (a copy) a 1-texel dark outline where they touch transparency."""
    add = []
    for y in range(c.h):
        for x in range(c.w):
            if c.get(x, y)[3] and not before.get(x, y)[3]:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if not c.get(x + dx, y + dy)[3]:
                        add.append((x + dx, y + dy))
    for x, y in add:
        c.set(x, y, OUT)


def export(c, name, anchor_raw, pad=1):
    bb = c.im.getbbox()
    x0, y0 = bb[0] - pad, bb[1] - pad
    w, h = bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    im.paste(c.im.crop((max(0, x0), max(0, y0), bb[2], bb[3])), (max(0, x0) - x0, max(0, y0) - y0))
    check_alpha(im)
    im.save(SPRITES / f"{name}.png")
    return im, [anchor_raw[0] - x0, anchor_raw[1] - y0]


# ------------------------------------------------------------------ Overgrown Market
def market():
    raw = load("ruin_market.png")
    # The raw touches the right edge (x 159): pad the canvas so tatters/vines have room.
    c = Canvas(Image.new("RGBA", (168, 100), (0, 0, 0, 0)))
    c.im.paste(raw, (2, 0))
    c = Canvas(c.im)
    remap_greens(c)
    fabric = {"f7e15b": "#b0923f", "edc55f": "#a0833a", "f0da8d": "#bba25e", "eba863": "#957136",
              "d08945": "#7f5a2e", "ae7b3a": "#664626", "f35c63": "#94403a", "df625f": "#843832",
              "951d41": "#55202a", "5d1638": "#38141f"}
    c.remap(fabric)
    keepset = {hx(m)[:3] for m in MOSS} | {hx(v)[:3] for v in fabric.values()}
    grade(c, sat=0.72, val=0.76, keep=lambda p: p[:3] in keepset)
    OX = 2
    rnd = random.Random(11)

    def awning_cols(x):
        return c.get(x, 40)

    # --- K1: a ragged rip in the awning with shreds hanging down
    before = c.copy()
    for x in range(14 + OX, 27 + OX):
        depth = 4 + int(3 * math.sin((x - 14) * 0.7)) + rnd.randint(0, 2)
        for y in range(48 - depth, 49):
            c.set(x, y, INTERIOR if y < 47 else None)
    for (x, ln) in [(15 + OX, 7), (18 + OX, 10), (22 + OX, 6), (25 + OX, 9)]:
        col = before.get(x, 40)
        dark = mixc(col[:3], "#20141c", 0.45)
        for y in range(41, 41 + ln):
            c.set(x, y, col if y < 41 + ln - 2 else dark)
            c.set(x + 1, y, dark)
        c.set(x, 41 + ln, OUT)
        c.set(x + 1, 41 + ln, OUT)
        c.set(x + 2, 41 + ln - 1, OUT)
    # --- K2: the right half of the awning tore loose and sags; a couple of holes
    snap = c.copy()
    for x in range(80 + OX, 101 + OX):
        drop = int((x - 80 - OX) * 0.28)
        if drop <= 0:
            continue
        for y in range(48, 31, -1):
            p = snap.get(x, y - drop)
            src_in = 33 <= y - drop <= 48
            if src_in:
                c.set(x, y, p if p[3] else None)
            elif y - drop < 33 and y >= 33:
                c.set(x, y, INTERIOR)
        for y in range(49, 49 + drop):
            p = snap.get(x, 48 - (y - 49) % 2)
            c.set(x, y, mixc(p[:3], "#20141c", 0.3) if p[3] else None)
        c.set(x, 49 + drop, OUT)
    for (hx_, hy_, r) in [(64 + OX, 38, 2), (72 + OX, 42, 1)]:
        for y in range(hy_ - r, hy_ + r + 1):
            for x in range(hx_ - r - 1, hx_ + r + 2):
                if abs(x - hx_) + abs(y - hy_) <= r + 1:
                    c.set(x, y, INTERIOR)
        c.set(hx_ - r - 1, hy_ - r, OUT)
    # --- K3: shredded scallop edge and long tatters
    before = c.copy()
    for x in range(108 + OX, 152 + OX):
        cut = rnd.choice((0, 1, 2, 3, 3))
        for y in range(48 - cut, 49):
            c.set(x, y, None if y > 46 else INTERIOR)
    for (x, ln) in [(111 + OX, 8), (117 + OX, 5), (124 + OX, 11), (133 + OX, 7), (141 + OX, 9), (148 + OX, 6)]:
        col = before.get(x, 41)
        dark = mixc(col[:3], "#20141c", 0.45)
        for y in range(44, 44 + ln):
            xx = x + (1 if y > 44 + ln // 2 and x % 2 else 0)
            c.set(xx, y, col if y < 44 + ln - 2 else dark)
            c.set(xx + 1, y, dark)
        c.set(x + (1 if x % 2 else 0), 44 + ln, OUT)
        c.set(x + 1 + (1 if x % 2 else 0), 44 + ln, OUT)
    # broken counter plank on K2, missing board on K1
    for x in range(66 + OX, 73 + OX):
        for y in range(61, 64):
            c.set(x, y, INTERIOR)
    c.line(66 + OX, 64, 72 + OX, 60, "#3a2418")
    # moss on the K3 wooden roof, vines off the awnings into the dark stalls
    for (cx, cy, r, s) in [(118 + OX, 25, 3, 1), (138 + OX, 27, 4, 2), (148 + OX, 26, 2, 3), (127 + OX, 29, 2, 4)]:
        moss_clump(c, cx, cy, r, s, only=lambda x, y: y < 32)
    for (x, y, ln, s) in [(9 + OX, 47, 12, 1), (36 + OX, 47, 9, 2), (59 + OX, 48, 14, 3), (90 + OX, 50, 7, 4),
                          (113 + OX, 48, 10, 5), (144 + OX, 48, 13, 6), (30 + OX, 46, 6, 7)]:
        vine(c, x, y, ln, s)
    # grime: rust streaks under the awning frames
    for x in range(c.w):
        if rnd.random() < 0.12:
            for y in range(52, 52 + rnd.randint(3, 9)):
                p = c.get(x, y)
                if p[3] and lum(p) > 40:
                    c.set(x, y, mixc(p[:3], "#2a1610", 0.35))
    im, anchor = export(c, "ruin_market_kiosks", (80 + OX, 74))
    return "ruin_market_kiosks", im, anchor


# ------------------------------------------------------------------ Flooded Transit
WATER = ["#0f1c1a", "#162a26", "#1e3832", "#284840", "#3a5e52", "#6a8a78"]


def flooded():
    raw = load("ruin_flooded.png")
    c = Canvas(raw)
    greens = {"566e4d", "98a860", "94a361", "9ea83c", "485e2d", "4f6548", "89985e", "657952", "77895a", "44593b",
              "394e2d", "283c20", "1b2d14", "0a160a", "102009", "0b1b05", "c8b75f"}
    swamp = ["#121a10", "#182416", "#20301c", "#2a3c22", "#354a29", "#425830", "#506638"]
    src = sorted(greens, key=lambda k: lum(hx(k)))
    gmap = {k: swamp[round(i / (len(src) - 1) * (len(swamp) - 1))] for i, k in enumerate(src)}
    concrete = {"a79189": "#77796a", "91817c": "#666a5e", "aea5a0": "#86887a", "5e5356": "#4a4e46",
                "675c5f": "#55594f", "412f35": "#33372f", "281f25": "#262a25", "1f181a": "#1c1f1b",
                "efcc85": "#a48c4c", "d3ac8f": "#8a7652", "c8b75f": "#8f8048",
                "a70c1e": "#2b4c6c", "980f1c": "#1f3a54", "d6d4d3": "#c4cbc4", "c1bdbc": "#9aa4a0",
                "9c6272": "#6a4a44", "7f4a35": "#5c3a2a", "74432e": "#52331f", "7d5063": "#553a40",
                "5f3525": "#452a1e", "4b2c1f": "#3a2218", "3c2519": "#2e1c14", "2b1e1b": "#221714"}
    bricks = {"9c6272", "7f4a35", "74432e", "7d5063", "5f3525", "4b2c1f", "3c2519", "2b1e1b"}
    brick_bot = {}
    for y in range(c.h):
        for x in range(c.w):
            p = c.get(x, y)
            if p[3] and "%02x%02x%02x" % p[:3] in bricks:
                brick_bot[x] = max(brick_bot.get(x, 0), y)
    c.remap(gmap)
    c.remap(concrete)
    keep = {hx(v)[:3] for v in list(gmap.values()) + list(concrete.values())}
    grade(c, sat=0.7, val=0.8, keep=lambda p: p[:3] in keep)
    plat = lambda p: p[3] and p[:3] not in {hx(v)[:3] for v in swamp}
    # collapsed lower-right end: the slab beyond the break dropped 3 texels and tilted
    snap = c.copy()
    BREAK = 112
    for x in range(BREAK, c.w):
        for y in range(c.h - 1, -1, -1):
            p = snap.get(x, y)
            if plat(p) and y < 76:
                c.set(x, y, None if not plat(snap.get(x, y - 3)) else snap.get(x, y - 3))
        for y in range(c.h - 1, 2, -1):
            p = snap.get(x, y - 3)
            if plat(p) and y - 3 < 76:
                c.set(x, y, p)
    for y in range(30, 80):
        x = BREAK + (y % 3 == 0)
        if c.get(x, y)[3] and plat(c.get(x, y)):
            c.set(x, y, OUT)
            c.set(x - 1, y, "#8f927f" if y < 62 else "#2a2d27")
    # waterline: the bottom rows of the platform's side are under murky water
    for x, bot in brick_bot.items():
        if x >= BREAK:
            bot += 3
        for k, y in enumerate(range(bot - 4, bot + 2)):
            if c.get(x, y)[3]:
                c.set(x, y, (WATER[5] if x % 4 else WATER[4]) if k == 0 else (WATER[3] if k < 2 else WATER[2]))
    # puddles in the mud around the base
    for (px_, py_, rx, ry, s) in [(30, 44, 10, 3, 1), (62, 64, 12, 3, 2), (96, 80, 10, 3, 3), (138, 74, 8, 3, 4),
                                  (48, 54, 6, 2, 5), (124, 82, 6, 2, 6)]:
        for y in range(py_ - ry, py_ + ry + 1):
            for x in range(px_ - rx, px_ + rx + 1):
                d = ((x - px_) / rx) ** 2 + ((y - py_) / ry) ** 2
                p = c.get(x, y)
                if d < 1 and p[3] and p[:3] in {hx(v)[:3] for v in swamp}:
                    edge = d > 0.6
                    c.set(x, y, WATER[1] if edge and y > py_ else (WATER[4] if edge and y < py_ else WATER[2]))
        c.set(px_ - rx // 2, py_, WATER[5])
        c.set(px_ - rx // 2 + 1, py_, WATER[5])
        c.set(px_ + 2, py_ + 1, WATER[4])
    # moss patches on the slab, a puddle on the sunk end
    plat_only = lambda x, y: plat(c.get(x, y))
    for (cx, cy, r, s_) in [(40, 22, 3, 1), (74, 40, 4, 2), (100, 52, 3, 3), (56, 30, 2, 4), (30, 26, 2, 5)]:
        moss_clump(c, cx, cy, r, s_, only=plat_only, dense=0.85)
    for (x0, y0, w) in [(118, 64, 9), (121, 66, 5)]:
        for x in range(x0, x0 + w):
            if plat(c.get(x, y0)):
                c.set(x, y0, WATER[3] if x > x0 + 1 else WATER[4])
    for (x, y, ln, s_) in [(26, 30, 6, 1), (60, 46, 7, 2), (88, 60, 5, 3)]:
        vine(c, x, y, ln, s_)
    im, anchor = export(c, "ruin_station_platform", (80, 62))
    return "ruin_station_platform", im, anchor


# ------------------------------------------------------------------ Collapsed Residential
def residential():
    from PIL import ImageOps
    c = Canvas(ImageOps.mirror(load("ruin_resi.png")))     # mirrored: the raw was lit from the top-right
    stucco_src = ["fafaf5", "e1dbd4", "d8d7cb", "d2cdc2", "c8c3b3", "c4b8ae", "b7ae9e", "b0a493", "a99b8d", "a39481",
                  "9d8d7f", "918177", "887368", "7b655a", "6e574a", "54494b"]
    stucco = ["#4a3c34", "#58483e", "#685548", "#786252", "#88705e", "#987e68", "#a88c74", "#b49a80"]
    src = sorted(stucco_src, key=lambda k: lum(hx(k)))
    smap = {k: stucco[round(i / (len(src) - 1) * (len(stucco) - 1))] for i, k in enumerate(src)}
    shade = {"24252e": "#1e2224", "272e38": "#22282c", "2e3c44": "#2a3234", "3e535b": "#34403e",
             "456073": "#3c4a4a", "596e70": "#4a5650", "1f1f27": "#1a1c1e"}
    rust = {"a0684d": "#8a5038", "8f5b40": "#784430", "81461c": "#6a3a1c", "614534": "#523a2c", "4b2e1f": "#3c2418"}
    c.remap(smap)
    c.remap(shade)
    c.remap(rust)
    remap_greens(c)
    STUCCO = [hx(v)[:3] for v in stucco]
    is_stucco = lambda x, y: c.get(x, y)[:3] in STUCCO and c.get(x, y)[3]
    rnd = random.Random(5)
    # stucco fallen off: exposed brick patches
    for (bx, by, bw, bh) in [(16, 70, 8, 7), (57, 112, 9, 6), (87, 72, 7, 7), (58, 64, 7, 5), (17, 112, 7, 8), (88, 104, 6, 5)]:
        for y in range(by, by + bh):
            for x in range(bx, bx + bw):
                d = ((x - bx - bw / 2) / (bw / 2)) ** 2 + ((y - by - bh / 2) / (bh / 2)) ** 2
                if d > 1 + (rnd.random() - 0.5) * 0.5 or not is_stucco(x, y):
                    continue
                mortar = y % 3 == 0 or (x + (y // 3) * 3) % 6 == 0
                c.set(x, y, "#3e2620" if mortar else ("#7a4230" if (x + y) % 5 else "#8a4c36"))
    # rain streaks under the window sills, a few cracks
    for (x, y) in [(36, 50), (40, 50), (52, 51), (76, 48), (84, 48), (38, 98), (50, 98), (80, 88), (74, 128), (86, 128)]:
        for yy in range(y, y + rnd.randint(6, 14)):
            if is_stucco(x, yy):
                p = c.get(x, yy)
                c.set(x, yy, mixc(p[:3], "#2a2420", 0.4))
    crack(c, [(28, 30), (31, 36), (30, 41), (33, 46)], "#2e2622")
    crack(c, [(66, 74), (69, 80), (68, 86), (72, 94)], "#2e2622")
    crack(c, [(56, 136), (58, 142), (62, 145)], "#2e2622")
    # the top-right corner has collapsed: a jagged break from the roof line down the side
    jag = [0, 3, 1, 5, 2, 6, 3, 1, 4, 7, 2, 5, 3, 6, 1, 4, 2, 5, 0, 3, 4, 2]
    def cut_y(x):
        k = (x - 54) // 3
        return 6 + int((x - 54) * 1.05) + jag[k % len(jag)] + (1 if x % 3 == 1 and jag[k % len(jag)] > 3 else 0)
    for x in range(54, c.w):
        cy = cut_y(x)
        for y in range(0, cy):
            c.set(x, y, None)
        # broken edge: lit rim on the face, dark core just under it
        if c.get(x, cy)[3]:
            c.set(x, cy, OUT)
            c.set(x, cy + 1, "#b49a80" if x < 92 else "#4a5650")
            if c.get(x, cy + 2)[3] and x < 92:
                c.set(x, cy + 2, "#5a4a40")
    # rebar sticking out of the break
    for (x, y, dx, dy, ln) in [(60, 12, -1, -1, 4), (68, 21, 0, -1, 5), (77, 30, 1, -1, 4), (86, 40, 0, -1, 5),
                               (95, 49, 1, -1, 3), (100, 55, 1, 0, 3)]:
        y0 = cut_y(x)
        for i in range(ln):
            c.set(x + dx * i, y0 - i if dy else y0 + 0, "#7a4026" if i % 2 else "#9a5634")
    for (x, y, ln, s_) in [(40, 54, 10, 11), (44, 96, 8, 12), (30, 22, 7, 13), (62, 60, 6, 14)]:
        vine(c, x, y, ln, s_)
    for (cx, cy, r, s_) in [(30, 18, 2, 1), (88, 120, 3, 2), (28, 146, 3, 3), (60, 100, 2, 4)]:
        moss_clump(c, cx, cy, r, s_, only=is_stucco)
    grade(c, sat=0.9, val=0.92, shadow_tint=("#1d3a36", 0.1))
    im, anchor = export(c, "ruin_apartment_facade", (60, 149))
    return "ruin_apartment_facade", im, anchor


# ------------------------------------------------------------------ Data Center
LED = {"g": "#5cff8a", "c": "#5ef0ff", "a": "#ffb84a", "r": "#ff4a3a"}


def datacenter():
    c = Canvas(load("ruin_dc.png"))
    tops = {"f1f6ec": "#7a8486", "d1d3c4": "#6a7476", "c2b4a5": "#5c6466", "9f9b8e": "#4e5658", "857f75": "#42494c",
            "c78c7c": "#6e4a3a", "ea9174": "#7e5038", "b66852": "#5e3424", "8a4b3c": "#4a2a1e"}
    floor = {"8fb3b0": "#566a66", "82a09e": "#4a5e5a", "788f91": "#42544f", "678283": "#3a4a46", "556d70": "#30403c",
             "65605a": "#3a3a34", "b66852": "#5a3426", "782818": "#3e1e14", "8a4b3c": "#4a2a1e", "c78c7c": "#6a4232",
             "ea9174": "#7a4a34", "d1d3c4": "#55625e", "f1f6ec": "#5e6e6a", "c2b4a5": "#4e5a56"}
    c.remap(tops, box=(0, 0, c.w, 50))
    c.remap(floor, box=(44, 48, 82, c.h))
    c.remap({"39af53": "#2a3a30"})                      # the raw's stray green dot becomes a dead LED
    floor_cols = {hx(v)[:3] for v in floor.values()}
    # Rack fronts (they face the camera under the lit tops): repainted as server cabinets, 4-texel units with
    # a status LED each; most LEDs are dead, a handful glow (the emissive accents the critic asked for).
    lit = {(0, 1): "g", (0, 4): "c", (1, 2): "g", (1, 6): "a", (2, 0): "g", (2, 3): "r", (3, 1): "c", (3, 5): "g",
           (2, 6): "g"}
    cabinets = [(30, 38), (39, 47), (79, 89), (90, 101)]
    for ci, (x0, x1) in enumerate(cabinets):
        for x in range(x0, x1 + 1):
            for y in range(49, 90):
                p = c.get(x, y)
                if not p[3] or p[:3] in floor_cols or lum(p) > 110:
                    continue
                if not c.get(x, y + 1)[3]:
                    c.set(x, y, OUT)
                    continue
                u, r = divmod(y - 49, 4)
                if x == x0:
                    col = "#3c4a50"
                elif x == x1:
                    col = "#0a0e12"
                elif r == 0:
                    col = "#0c1216"
                else:
                    col = "#1b242a" if u % 2 else "#1f2a31"
                    if r == 1 and x == x0 + 1:
                        col = "#2c383e"
                k = lit.get((ci, u)) or ("g" if (ci * 7 + u * 3) % 5 == 0 else ("c" if (ci * 5 + u * 11) % 9 == 0 else None))
                if r == 2 and x == x1 - 2:
                    col = LED[k] if k else "#173a2c"
                if r == 2 and x == x1 - 3 and k:
                    col = mixc(LED[k], "#0a1418", 0.6)
                if r == 2 and x == x0 + 2 and (ci + u) % 3 == 0:
                    col = "#2a4a3a"              # a dead drive-bay light on the left too
                c.set(x, y, col)
    # lit top-left rims on the rack tops so the banks read as blocks against the paving
    topcols = {hx(v)[:3] for v in tops.values()}
    snap = c.copy()
    for y in range(20, 50):
        for x in range(c.w):
            p = snap.get(x, y)
            if p[:3] in topcols and (snap.get(x, y - 1)[:3] not in topcols or snap.get(x - 1, y)[:3] not in topcols):
                c.set(x, y, "#9aa4a2" if snap.get(x, y - 1)[:3] not in topcols else "#808a8a")
    # wet floor: a few reflections of the LEDs in the puddles
    for (x, y, k) in [(52, 70, "g"), (74, 66, "c"), (60, 78, "g"), (70, 74, "a")]:
        if c.get(x, y)[:3] in floor_cols:
            c.set(x, y, mixc(LED[k], "#33423f", 0.45))
    # cooling unit fan on the back housing
    fx, fy, R = 66, 33, 6.5
    for y in range(22, 46):
        for x in range(56, 78):
            d = math.hypot(x + 0.5 - fx, y + 0.5 - fy)
            if d > R + 0.6:
                continue
            if d > R - 0.5:
                c.set(x, y, "#a08a72" if (x - fx) + (y - fy) < -2 else OUT)
            elif d < 1.6:
                c.set(x, y, "#9a8a76" if x <= fx and y <= fy else "#5a4c40")
            else:
                ang = math.atan2(y + 0.5 - fy, x + 0.5 - fx)
                blade = (ang * 4 / math.pi) % 2 < 0.55
                c.set(x, y, "#5e5248" if blade else ("#1c1614" if int(d) % 2 else "#2a2220"))
    # cables on the ground: give the tendrils a top highlight so they read as cables, not paint
    snap = c.copy()
    for y in range(56, c.h):
        for x in list(range(0, 32)) + list(range(100, c.w)):
            p = snap.get(x, y)
            if p[3] and lum(p) < 40 and not snap.get(x, y - 1)[3]:
                c.set(x, y, "#34404a")
    # moss on the rack tops, vines over the edges
    top_px = lambda x, y: y < 48 and c.get(x, y)[:3] in {hx(v)[:3] for v in tops.values()}
    for (cx, cy, r, s_) in [(34, 30, 3, 1), (92, 28, 3, 2), (100, 36, 2, 3), (44, 26, 2, 4)]:
        moss_clump(c, cx, cy, r, s_, only=top_px)
    for (x, y, ln, s_) in [(32, 44, 9, 1), (101, 42, 12, 2), (50, 26, 8, 3), (78, 26, 10, 4)]:
        vine(c, x, y, ln, s_)
    grade(c, sat=0.9, val=0.95, keep=lambda p: p[:3] in {hx(v)[:3] for v in LED.values()})
    im, anchor = export(c, "ruin_server_hall", (64, 84))
    return "ruin_server_hall", im, anchor


RUINS = [market, flooded, residential, datacenter]

if __name__ == "__main__":
    entries = {}
    shots = []
    for fn in RUINS:
        key, im, anchor = fn()
        entries[key] = {"file": f"{key}.png", "ppu": 32, "anchor": anchor}
        print(key, im.size, anchor)
        shots.append(im)
        gridzoom(im, SCRATCH / f"{key}_zoom.png", None, 6, 8)
    (HERE / "entries" / "ruins.json").write_text(json.dumps(entries, indent=1))
    preview(shots, SCRATCH / "ruins_sheet.png", 3, bg=(40, 52, 40, 255))
