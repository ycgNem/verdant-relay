"""Area bosses (static map objects; they don't walk): hand-finish + hand animation of four PixelLab map objects.

    boss_thorn_mother    ebec1a4a  rooted carnivorous plant-mother (the Spitter's big sister)
    boss_brood_hive      350b0d63  organic hive mound grown over a market stall, births Crawlers
    boss_warden          d5d2f030  overgrown municipal security sentinel, sweeping red scanner eye
    boss_drowned_engine  99e6b72e  rusted flooded pump engine, furnace eye, steam vents

Every strip: idle 0-3, attack 4-5, hurt 6, dead 7 (one horizontal strip, all frames share size + anchor).
Animation is done by moving / recolouring parts of the one PixelLab image (never resampled).

    python pixel-art/pixellab_v3/build_bosses.py
"""
import colorsys
import json
import math
import random

from PIL import Image

from v3tools import HERE, SCRATCH, SPRITES, Canvas, check_alpha, gridzoom, hx, load, lum, mixc, preview, strip

OUT = "#0a0610"
ANIMS = {"idle": [0, 1, 2, 3], "attack": [4, 5], "hurt": [6], "dead": [7]}


# ------------------------------------------------------------------ helpers
def key(p):
    return "%02x%02x%02x" % p[:3]


def lum_map(src, ramp):
    s = sorted(src, key=lambda k: lum(hx(k)))
    return {k: ramp[round(i / max(1, len(s) - 1) * (len(ramp) - 1))] for i, k in enumerate(s)}


def split(c, fn):
    """Split canvas into named layers: fn(x, y, p) -> layer name (or None to drop)."""
    out = {}
    for y in range(c.h):
        for x in range(c.w):
            p = c.get(x, y)
            if not p[3]:
                continue
            n = fn(x, y, p)
            if n is None:
                continue
            if n not in out:
                out[n] = Image.new("RGBA", (c.w, c.h), (0, 0, 0, 0))
            out[n].putpixel((x, y), p)
    return out


def compose(size, parts):
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    for layer, dx, dy in parts:
        if layer is None:
            continue
        im.alpha_composite(layer, (0, 0)) if (dx, dy) == (0, 0) else im.alpha_composite(_shift(layer, dx, dy))
    return Canvas(im)


def _shift(layer, dx, dy):
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.paste(layer, (dx, dy), layer)
    return out


def ramp_shift(c, ramp, k, cond=None):
    rk = [hx(r)[:3] for r in ramp]
    for y in range(c.h):
        for x in range(c.w):
            p = c.get(x, y)
            if p[3] and p[:3] in rk and (cond is None or cond(x, y)):
                i = rk.index(p[:3])
                c.set(x, y, ramp[max(0, min(len(ramp) - 1, i + k))])


def grade_px(c, fn, cond=None):
    for y in range(c.h):
        for x in range(c.w):
            p = c.get(x, y)
            if p[3] and (cond is None or cond(x, y, p)):
                c.set(x, y, fn(p))


def dim(p, val=0.62, sat=0.35, tint="#1a1c22", t=0.25):
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    r, g, b = colorsys.hsv_to_rgb(h, s * sat, v * val)
    return mixc((round(r * 255), round(g * 255), round(b * 255)), tint, t)


def hurt_tint(p):
    """One-frame hurt pose: warmed toward red-orange, lifted (the game also flashes it)."""
    return mixc(p[:3], "#ff6a4a", 0.32 if lum(p) > 20 else 0.12)


def outline_gaps(c):
    """Re-close the dark outline where moved parts left an opaque texel touching transparency."""
    add = []
    for y in range(c.h):
        for x in range(c.w):
            p = c.get(x, y)
            if p[3] and lum(p) > 45:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if not c.get(x + dx, y + dy)[3]:
                        add.append((x + dx, y + dy))
    for q in add:
        c.set(*q, OUT)


def blob(c, cx, cy, r, ramp, outline=OUT, seed=0):
    """Small shaded glob (spit / slime / steam puff), light from the top-left."""
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d <= r:
                u = ((x - cx) + (y - cy)) / (2 * r)
                i = round((0.5 - u) * (len(ramp) - 1))
                c.set(x, y, ramp[max(0, min(len(ramp) - 1, i))])
            elif d <= r + 1 and outline and not c.get(x, y)[3]:
                c.set(x, y, outline)


def export(name, frames, anchor_raw, extra=None):
    bb = None
    for f in frames:
        b = f.im.getbbox()
        bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    x0, y0 = bb[0] - 1, bb[1] - 1
    fw, fh = bb[2] - bb[0] + 2, bb[3] - bb[1] + 2
    out = []
    for f in frames:
        im = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        src = f.im.crop((max(0, x0), max(0, y0), min(f.w, x0 + fw), min(f.h, y0 + fh)))
        im.paste(src, (max(0, x0) - x0, max(0, y0) - y0))
        check_alpha(im)
        out.append(im)
    strip(out).save(SPRITES / f"{name}.png")
    anchor = [anchor_raw[0] - x0, anchor_raw[1] - y0]
    entry = {"file": f"{name}.png", "ppu": 32, "frames": len(out), "fw": fw, "fh": fh, "anchor": anchor,
             "fps": 8, "anims": ANIMS, "animFps": {"idle": 5, "attack": 7, "hurt": 8, "dead": 1}}
    if extra:
        entry.update(extra)
    return entry, out


# ------------------------------------------------------------------ Thorn Mother
OLIVE = ["#0f1808", "#1a260c", "#283612", "#384a16", "#4c5e1a", "#627420", "#7a8c26", "#94a62c", "#b0c23a",
         "#cfd86a"]
PURP = ["#22081f", "#33102f", "#481840", "#5e2250", "#783262", "#94487a"]
MAG = ["#3a0a22", "#5a1032", "#801a46", "#a82a5a", "#c84a76", "#e07898", "#f2b0c0"]
ACID = ["#2a4a10", "#4a7a18", "#7aae22", "#a8dc3a", "#d8f878"]


def thorn_mother():
    c = Canvas(load("boss_thorn_mother.png"))
    greens = ["4d7839", "6b9b46", "b6e356", "2f561c", "4a7236", "19380e", "234814", "16300e", "304c27", "7bac4b",
              "649144", "9ccb4e", "54823a", "3b6727", "395e29", "d4f679", "365529", "e3fb97", "13240f", "0a1610"]
    purples = ["853087", "45054a", "3e0644", "560a55", "6b186b", "99489a", "cd7ec5", "756274"]
    mags = ["a41063", "ec2c85", "cf1a75", "8b0e57", "4e0426", "620337", "f1adca", "f38ab8", "f2ccdc"]
    c.remap(lum_map(greens, OLIVE))
    c.remap(lum_map(purples, PURP))
    c.remap(lum_map(mags, MAG))
    c.remap({"190423": OUT, "0a0517": OUT, "060911": OUT, "0a0a17": OUT,
             "ecc393": "#e6d6a0", "dca97e": "#cdb27e", "bc8065": "#9a7a52", "fcfaf7": "#f8f4dc"})
    olive = {hx(o)[:3] for o in OLIVE}
    # thorns along the body's flanks (pointing out), dark stem + pale tip
    rows = list(range(14, 70, 5))
    for y in rows:
        xs = [x for x in range(20, 78) if c.get(x, y)[:3] in olive]
        if not xs:
            continue
        for x, d in ((min(xs), -1), (max(xs), 1)):
            if 22 < x < 76:
                # a hooked thorn: two-texel base, curving up to a pale tip
                pts = [(1, 0, "#4a3818"), (1, -1, "#2e2010"), (2, 0, "#6a5228"), (3, -1, "#a88a52"), (4, -2, "#e8d6a4")]
                for dx, dy, col in pts:
                    c.set(x + d * dx, y + dy, col)
                for dx, dy in ((1, 1), (2, 1), (3, 0), (4, -1), (5, -2), (4, -3), (3, -2), (2, -1), (2, -2)):
                    if not c.get(x + d * dx, y + dy)[3]:
                        c.set(x + d * dx, y + dy, OUT)
    # layers: roots (bottom, static), buds (sway), body (breathes)
    BUDS = [(4, 14, 24, 34), (4, 44, 22, 64), (76, 30, 94, 50)]

    def which(x, y, p):
        if y >= 70 or (y >= 64 and p[:3] in {hx(q)[:3] for q in PURP}):
            return "roots"
        for i, (a, b, cc, d) in enumerate(BUDS):
            if a <= x <= cc and b <= y <= d:
                return f"bud{i}"
        return "body"

    L = split(c, which)
    size = (c.w, c.h)

    def frame(body_dy=0, bud_dx=0, bud_dy=0, maw=0, spit=None, glow=0):
        parts = [(L["roots"], 0, 0), (L["body"], 0, body_dy)]
        for i in range(3):
            sx = -bud_dx if i < 2 else bud_dx
            parts.append((L[f"bud{i}"], sx, bud_dy + (body_dy if i == 2 else 0)))
        f = compose(size, parts)
        if glow:
            ramp_shift(f, MAG, glow, cond=lambda x, y: 34 <= x <= 62 and 40 + body_dy <= y <= 64 + body_dy)
        if maw:  # the lower jaw drops: darken a row under the fangs to open the throat
            for x in range(34, 62):
                y = 58 + body_dy
                if f.get(x, y)[:3] in {hx(m)[:3] for m in MAG}:
                    f.set(x, y, MAG[0])
        if spit:
            blob(f, spit[0], spit[1], spit[2], ACID[::-1])
            f.set(spit[0] - 2, spit[1] - 3, "#f4ffc0")
            f.set(spit[0] - 3, spit[1] - 2, "#f4ffc0")
            for (dx, dy, r) in ((-10, 4, 1.6), (9, 6, 1.6), (-6, 11, 1.2), (5, 12, 1.2), (12, -2, 1.0)):
                blob(f, spit[0] + dx, spit[1] + dy, r, ACID[::-1][1:])
        outline_gaps(f)
        return f

    frames = [frame(), frame(body_dy=1, bud_dx=1), frame(body_dy=2, bud_dx=1, bud_dy=1, glow=1), frame(body_dy=1)]
    # drool drip falling over the idle cycle
    for k, f in enumerate(frames):
        y0 = 66 + k * 2
        for y in range(y0, y0 + 2):
            if not f.get(45, y)[3] or f.get(45, y)[:3] in {hx(q)[:3] for q in PURP}:
                f.set(45, y, ACID[3] if y == y0 else ACID[2])
    frames.append(frame(body_dy=-2, bud_dx=-1, bud_dy=-1, glow=2, maw=1))            # rear up, throat glows
    frames.append(frame(body_dy=1, bud_dx=1, glow=1, spit=(50, 60, 6)))            # spit a glob of acid
    hurt = frame(body_dy=1)
    grade_px(hurt, hurt_tint)
    frames.append(hurt)
    dead = frame(body_dy=4, bud_dy=4)
    grade_px(dead, lambda p: dim(p, 0.58, 0.4, "#2a1c10", 0.3))
    frames.append(dead)
    return export("boss_thorn_mother", frames, (48, 86))


# ------------------------------------------------------------------ Brood Hive
FLESH = ["#120812", "#1e0e1c", "#2a1426", "#381c30", "#46243a", "#562e44", "#68384e", "#7c4656", "#92565e",
         "#a8686a"]
AMB = ["#4a1a08", "#7a300c", "#b25616", "#e08428", "#ffb448", "#ffe08a", "#fff6d0"]
WOOD = ["#24150e", "#362014", "#4a2c1c", "#5e3a26", "#744a30", "#8a5c3c"]
HIVE_HOLE = (54, 52, 72, 70)


def brood_hive():
    c = Canvas(load("boss_brood_hive.png"))
    hole = lambda x, y: HIVE_HOLE[0] <= x <= HIVE_HOLE[2] and HIVE_HOLE[1] <= y <= HIVE_HOLE[3]
    rock = ["16071f", "15071b", "5e445f", "2d1e38", "533c59", "44304c", "664a64", "3e2c47", "382742", "210321",
            "4c3652", "7e5e6e", "34243d", "1c0c24", "6e5169", "8e6f7e", "251730", "211129", "997a88", "83657a",
            "a78796", "74586f", "1b0b1c", "d59da4"]
    wood = ["523536", "9b5a53", "834f4a", "af685f", "644140", "cb766a", "f28374"]
    glow = ["9e4a04", "c76916", "f7a24b", "f7cea4", "f5f0eb", "5f2a0b"]
    fire = {"f6542f": AMB[3], "711327": AMB[1], "4a0521": AMB[0], "400421": "#2a0a10", "310522": "#2a0a10",
            "f5f0eb": AMB[6], "f7a24b": AMB[5], "f7cea4": AMB[6], "f28374": AMB[4], "cb766a": AMB[3]}
    grass = ["698862", "597354", "4d6348", "3b4c37", "303d2c"]
    c.remap(fire, cond=hole)
    c.remap(lum_map(rock, FLESH), cond=lambda x, y: not hole(x, y))
    c.remap(lum_map(wood, WOOD), cond=lambda x, y: not hole(x, y))
    c.remap(lum_map(glow, AMB[1:]), cond=lambda x, y: not hole(x, y))
    c.remap(lum_map(grass, ["#141e10", "#1c2a16", "#26381c", "#304626", "#3c5430"]))
    flesh = {hx(f)[:3] for f in FLESH}
    # veins across the mound + amber slime drips under the eye-holes
    rnd = random.Random(3)
    for (pts) in [[(34, 10), (38, 16), (37, 22), (42, 28), (41, 34)], [(66, 8), (62, 14), (64, 22), (60, 30)],
                  [(50, 36), (54, 42), (52, 48)], [(76, 26), (72, 32), (74, 40)], [(28, 30), (32, 36), (30, 44)]]:
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(abs(x1 - x0), abs(y1 - y0))
            for i in range(n + 1):
                x, y = round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)
                if c.get(x, y)[:3] in flesh:
                    c.set(x, y, "#7a1a2a")
                    if c.get(x + 1, y)[:3] in flesh:
                        c.set(x + 1, y, "#4a1020")
    for (x, y, ln) in [(37, 24, 3), (53, 31, 2), (63, 45, 3)]:
        for i in range(ln):
            if c.get(x, y + i)[3]:
                c.set(x, y + i, AMB[1] if i < ln - 1 else AMB[3])

    def which(x, y, p):
        if 22 <= x <= 92 and y < 30:
            return "dome"
        return "base"

    L = split(c, which)
    size = (c.w, c.h)
    amb_cond = lambda x, y: True

    def frame(dome_dy=0, pulse=0, eyes=False, flare=0, spray=False):
        f = compose(size, [(L["base"], 0, 0)] + ([(L["dome"], 0, 0)] if dome_dy < 0 else []) + [(L["dome"], 0, dome_dy)])
        if pulse:
            ramp_shift(f, AMB, pulse)
        if eyes:
            f.set(60, 60, "#ff3a2a")
            f.set(65, 60, "#ff3a2a")
            f.set(60, 61, "#7a0a10")
            f.set(65, 61, "#7a0a10")
        if flare:
            cx, cy = 63, 62
            for a in range(0, 360, 20):
                r = 10 + flare
                x, y = round(cx + math.cos(math.radians(a)) * r), round(cy + math.sin(math.radians(a)) * r * 0.7)
                if not f.get(x, y)[3] or f.get(x, y)[:3] in flesh:
                    f.set(x, y, AMB[4] if a % 40 else AMB[5])
        if spray:
            for (x, y, r, ramp) in [(50, 70, 2.2, AMB[2:]), (74, 72, 2.0, AMB[2:]), (63, 76, 1.6, AMB[3:]),
                                    (44, 64, 1.4, FLESH[4:]), (82, 66, 1.4, FLESH[4:]), (58, 78, 1.2, AMB[3:])]:
                blob(f, x, y, r, ramp[::-1])
        outline_gaps(f)
        return f

    frames = [frame(), frame(dome_dy=1, pulse=1), frame(dome_dy=1, pulse=2, eyes=True), frame(pulse=1, eyes=True)]
    frames.append(frame(dome_dy=-1, pulse=2, flare=1, eyes=True))
    frames.append(frame(dome_dy=1, pulse=2, flare=3, spray=True))
    hurt = frame(pulse=1)
    grade_px(hurt, hurt_tint)
    frames.append(hurt)
    dead = frame(dome_dy=2)
    amb = {hx(a)[:3] for a in AMB}
    grade_px(dead, lambda p: dim(p, 0.4, 0.2, "#1a1414", 0.3) if p[:3] in amb else dim(p, 0.62, 0.45, "#1a1418", 0.25))
    frames.append(dead)
    return export("boss_brood_hive", frames, (50, 72))


# ------------------------------------------------------------------ Security Warden
RED = ["#24040a", "#4e0a12", "#80101a", "#b8181e", "#ec3424", "#ff7454", "#ffc8ae", "#fff2e6"]
MOSSB = ["#1c2b18", "#2a4020", "#3a5626", "#4d6e2c", "#648a34", "#80a63e"]
EYE_C, EYE_R = (37.5, 22.5), 7.2


def warden():
    c = Canvas(load("boss_warden.png"))
    in_eye = lambda x, y: math.hypot(x + 0.5 - EYE_C[0], y + 0.5 - EYE_C[1]) <= EYE_R
    c.remap(lum_map(["f60404", "761223", "a50b16", "fee6d0", "fd8588"], RED[2:7]), cond=in_eye)
    c.remap(lum_map(["405703", "5b7f03", "98ce0a", "76a402"], MOSSB[1:]))
    c.remap({"c18610": "#9a7a2a", "daa314": "#b08a34", "eac91d": "#c4a046", "704103": "#5a3a14"})
    c.remap(lum_map(["674849", "997974", "805f5c"], ["#3a3a32", "#55544a", "#6e6c5e"]), cond=lambda x, y: y >= 79)
    c.remap({"d8c4c5": "#8a8a7a"}, cond=lambda x, y: y >= 79)
    steel = {hx(k)[:3] for k in ("315366", "5c849b", "466c81", "b5cee6", "253548", "81a6bd", "1f2536")}
    rnd = random.Random(9)
    # overgrowth: moss mats on the shoulders and thighs, vines hanging off the arms, rust streaks
    for (cx, cy, r) in [(20, 16, 3), (58, 15, 3), (29, 58, 2), (51, 56, 2), (40, 46, 2), (62, 44, 2)]:
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r - 1, cx + r + 2):
                d = math.hypot((x - cx) * 0.8, y - cy) / r
                if d <= 1 and c.get(x, y)[:3] in steel and rnd.random() < 0.9 - d * 0.3:
                    lit = (cx - x) * 0.3 + (cy - y) * 0.5
                    c.set(x, y, MOSSB[max(1, min(5, 2 + int((1 - d) * 2 + lit * 0.3 + rnd.random())))])
    for (x, y, ln) in [(16, 30, 10), (63, 30, 13), (24, 20, 6), (56, 22, 7)]:
        for i in range(ln):
            c.set(x + (1 if (i // 3) % 2 else 0), y + i, MOSSB[3] if i % 3 else MOSSB[2])
            if i % 4 == 1:
                c.set(x - 1, y + i, MOSSB[5])
        c.set(x, y + ln, MOSSB[4])
    for x in range(14, 68):
        if rnd.random() < 0.14:
            y0 = rnd.randint(14, 60)
            for y in range(y0, y0 + rnd.randint(3, 7)):
                p = c.get(x, y)
                if p[:3] in steel:
                    c.set(x, y, mixc(p[:3], "#5a3020", 0.45))
    L = split(c, lambda x, y, p: "upper" if y < 50 else "legs")
    size = (c.w, c.h)

    def eye_paint(f, dy, sweep=None, boost=0, dead=False):
        cx, cy = EYE_C[0], EYE_C[1] + dy
        for y in range(int(cy - EYE_R - 1), int(cy + EYE_R + 2)):
            for x in range(int(cx - EYE_R - 1), int(cx + EYE_R + 2)):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if d > EYE_R - 0.6:
                    continue
                # glass dome shading: lit top-left, deep at the rim
                u = ((x + 0.5 - cx) + (y + 0.5 - cy)) / (2 * EYE_R)
                i = round(4.2 - d / EYE_R * 2.2 - u * 1.6) + boost
                if dead:
                    col = ["#141014", "#1e181c", "#2a2226", "#3a3034", "#4a3e42"][max(0, min(4, i - 1))]
                else:
                    col = RED[max(1, min(6, i))]
                    if sweep is not None and abs(x + 0.5 - (cx + sweep)) < 1.1:
                        col = RED[min(7, 6 + boost)]
                f.set(x, y, col)
        if not dead:  # specular highlight
            f.set(int(cx - 3), int(cy - 3), RED[7])
            f.set(int(cx - 2), int(cy - 3), RED[6])
            f.set(int(cx - 3), int(cy - 2), RED[6])

    def frame(dy=0, sweep=None, boost=0, star=0, dead=False, ring=False):
        f = compose(size, [(L["legs"], 0, 0)] + ([(L["upper"], 0, 0)] if dy < 0 else []) + [(L["upper"], 0, dy)])
        eye_paint(f, dy, sweep, boost, dead)
        cx, cy = EYE_C[0], EYE_C[1] + dy
        if ring:
            for a in range(0, 360, 18):
                x, y = round(cx + math.cos(math.radians(a)) * 11), round(cy + math.sin(math.radians(a)) * 10)
                if (a // 18) % 2 == 0:
                    f.set(x, y, RED[4])
        if star:
            for a in range(0, 360, 45):
                ln = star + (4 if a % 90 == 0 else 0)
                for r in range(8, 8 + ln):
                    x, y = round(cx + math.cos(math.radians(a)) * r), round(cy + math.sin(math.radians(a)) * r)
                    col = RED[7] if r < 10 else (RED[5] if r < 8 + ln * 0.6 else RED[3])
                    f.set(x, y, col)
                    if a % 90 == 0:   # the four main rays are 2 texels thick
                        f.set(x + (1 if a in (90, 270) else 0), y + (1 if a in (0, 180) else 0), RED[4])
        outline_gaps(f)
        return f

    frames = [frame(sweep=-4), frame(sweep=-1), frame(dy=1, sweep=3), frame(dy=1, sweep=0)]
    frames.append(frame(dy=-1, boost=1, ring=True))
    frames.append(frame(boost=2, star=6))
    hurt = frame()
    grade_px(hurt, hurt_tint)
    frames.append(hurt)
    dead = frame(dy=3, dead=True)
    grade_px(dead, lambda p: dim(p, 0.62, 0.5, "#141820", 0.25))
    frames.append(dead)
    return export("boss_warden", frames, (40, 87))


# ------------------------------------------------------------------ Drowned Engine
IRON = ["#160c0e", "#241412", "#341c16", "#48281c", "#5c3624", "#70442c", "#845434", "#98663e"]
FURN = ["#4a1406", "#8a2a0e", "#c84a14", "#f07a24", "#ffb040", "#ffe57a", "#fffbd0"]
WATER = ["#0e1a18", "#142622", "#1c342e", "#264438", "#335646", "#567a66", "#8aa892"]
STEAM = ["#5a6466", "#7e888a", "#a6aeae", "#cdd2d0", "#eef0ec"]


def drowned_engine():
    c = Canvas(load("boss_drowned_engine.png"))
    lowdisc = lambda x, y: y >= 61
    c.remap({"58855c": WATER[2], "85ad56": WATER[3], "dde2b2": WATER[5], "669352": WATER[1], "446f53": WATER[1],
             "b19559": WATER[4]}, cond=lowdisc)
    c.remap(lum_map(["85ad56", "52833c", "44753b", "aac266", "669352", "446f53"], MOSSB[1:]))
    rust = ["d6835a", "e08656", "b7694c", "c57552", "a75f4b", "925348", "844a46", "774245", "703d42", "63363e",
            "522b36", "472434", "3f1f30", "391d33", "381b2e", "32192e", "25122b", "e2b49a"]
    c.remap(lum_map(rust, IRON))
    c.remap(lum_map(["ef5e27", "f8c310", "f8d30e", "fffe6a"], FURN[2:6]))
    c.remap({"295048": "#24443c", "224541": "#1c3832"})
    # the raw's steam puff above the chimney is replaced by animated puffs
    for y in range(0, 12):
        for x in range(56, 80):
            p = c.get(x, y)
            if p[3] and key(p) in ("f1e8dd", "a0a8ab", "c0c1be", "78888c"):
                c.set(x, y, None)
    c.remap({"f1e8dd": "#b8b0a0", "c0c1be": "#9a9488", "a0a8ab": "#787468", "78888c": "#5a5650"})
    iron = {hx(i)[:3] for i in IRON}
    rnd = random.Random(4)
    # barnacle crust + hanging algae on the lower boiler
    for _ in range(40):
        x, y = rnd.randint(18, 80), rnd.randint(44, 60)
        if c.get(x, y)[:3] in iron and c.get(x + 1, y)[:3] in iron:
            c.set(x, y, "#bab096")
            c.set(x + 1, y, "#7a7462")
    for x in range(22, 80, 5):
        col = [y for y in range(40, 62) if c.get(x, y)[:3] in iron]
        if col and rnd.random() < 0.7:
            y0 = max(col)
            for i in range(rnd.randint(2, 5)):
                c.set(x, y0 - 2 + i, MOSSB[2] if i % 2 else MOSSB[3])
    OY = 10                                   # headroom on top of the canvas for the steam
    big = Image.new("RGBA", (c.w, c.h + OY), (0, 0, 0, 0))
    big.paste(c.im, (0, OY))
    c = Canvas(big)
    furnace = lambda x, y: 24 <= x <= 40 and 26 + OY <= y <= 46 + OY
    wset = {hx(w)[:3] for w in WATER}
    L = split(c, lambda x, y, p: "water" if y >= 62 + OY and p[:3] in wset else "engine")
    size = (c.w, c.h)

    def puff(f, x, y, r):
        blob(f, x, y, r, STEAM[::-1], outline=None)

    def frame(k=0, pulse=0, steam=True, burst=0, dead=False, dy=0):
        f = compose(size, [(L["water"], 0, 0)] + ([(L["engine"], 0, 0)] if dy < 0 else []) + [(L["engine"], 0, dy)])
        if pulse:
            ramp_shift(f, FURN, pulse, cond=furnace)
        if dead:
            ramp_shift(f, FURN, -3, cond=furnace)
        # ripples on the puddle around the feet, alternating rows
        for (cx, cy, rx) in [(20, 70, 6), (46, 72, 7), (74, 70, 6)]:
            for x in range(cx - rx, cx + rx + 1):
                y = cy + OY + (k % 2) - (1 if abs(x - cx) > rx - 3 else 0)
                if f.get(x, y)[:3] in wset and (x + k) % 3:
                    f.set(x, y, WATER[5])
        if steam and not dead:   # puffs rising off the chimney top (x 66, y 9 in raw coords)
            for i in range(3):
                t = (k + i * 1.4) % 4
                puff(f, 67 + (1 if i % 2 else -1) * round(t * 0.6), OY + 7 - t * 3.2, 1.5 + t * 0.6)
        if burst:
            for (x, y, r) in [(33, 8, 3.0), (48, 9, 3.4), (66, 5, 4.0), (40, 2, 2.6), (58, 1, 3.0)][:2 + burst]:
                puff(f, x, OY + y - burst * 2, r + burst * 0.4)
            if burst > 1:
                for (x, y) in [(20, 34), (22, 40), (18, 30), (43, 30), (45, 38)]:
                    f.set(x, y + OY, FURN[5])
                    f.set(x, y + OY + 1, FURN[3])
        outline_gaps(f)
        return f

    frames = [frame(k=0, pulse=0), frame(k=1, pulse=1), frame(k=2, pulse=2), frame(k=3, pulse=1)]
    frames.append(frame(k=0, pulse=2, burst=1, dy=-1))
    frames.append(frame(k=1, pulse=3, burst=3))
    hurt = frame(k=0, pulse=1)
    grade_px(hurt, hurt_tint, cond=lambda x, y, p: p[:3] not in wset)
    frames.append(hurt)
    dead = frame(steam=False, dead=True, dy=1)
    grade_px(dead, lambda p: dim(p, 0.7, 0.5, "#141818", 0.2))
    frames.append(dead)
    return export("boss_drowned_engine", frames, (48, 76 + OY))


BOSSES = [thorn_mother, brood_hive, warden, drowned_engine]

if __name__ == "__main__":
    entries = {}
    for fn in BOSSES:
        entry, out = fn()
        name = entry["file"][:-4]
        entries[name] = entry
        print(name, entry["fw"], entry["fh"], entry["anchor"], len(out), "frames")
        preview(out, SCRATCH / f"{name}_frames.png", 3, anchor=entry["anchor"])
    prev = HERE / "entries" / "bosses.json"
    old = json.loads(prev.read_text()) if prev.exists() else {}
    old.update(entries)
    prev.write_text(json.dumps(old, indent=1))
