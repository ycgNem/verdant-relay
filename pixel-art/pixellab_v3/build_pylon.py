"""prop_relay_pylon: the extraction beacon. PixelLab map object f1ba1598 (raw/pylon.png, 48x96) keeps its stone
plinth and junction box (recoloured onto the V2 ramps); the mast above them is redrawn by hand so it reads as a
landmark: a tapered three-leg lattice, a dish, guy cables, a beacon cage on top.

Frames: 0 = off (dead: dark glass, dull dish, dim red standby LED); 1-4 = on (cyan beacon pulse, lit dish rim,
green LED, a hard-edged halo that breathes).

    python pixel-art/pixellab_v3/build_pylon.py
"""
import json
import math

from PIL import Image

from v3tools import HERE, SCRATCH, SPRITES, Canvas, check_alpha, gridzoom, hx, load, lum, mixc, preview, strip

OUT = "#0e0b0b"
STONE = ["#161b18", "#212823", "#2d352e", "#3c443a", "#4c5348", "#5f6456", "#757867"]
MOSS = ["#1c2b18", "#2a4020", "#3a5626", "#4d6e2c", "#648a34", "#80a63e"]
RUST = ["#21130f", "#3a1f16", "#56301c", "#744324", "#93592e", "#b2723c"]
STEEL = ["#1a1414", "#2e2422", "#46383a", "#625050", "#806c66", "#a08c80"]   # rusted lattice steel
CYAN = ["#0b3e4a", "#0f6a7a", "#1596a6", "#2cc6d2", "#4ff0f2", "#a8fff8", "#e8fffc"]
DEADGLASS = ["#141c1e", "#1f2b2e", "#2c3a3d", "#3c4a4c"]

PLINTH_TOP = 66           # raw rows from here down are kept (plinth + junction box)
MX = 25                   # mast centre column
BASE_Y, TOP_Y = 77, 16    # mast foot (on the plinth) and top (under the beacon cage)


def recolour_base(c):
    stone_src = ["1d131f", "271d2b", "2f1824", "1d0d1a", "191926", "0f0d20", "372f3b", "4b4d3e", "4f4352",
                 "564049", "645560", "776975"]
    stone_src = sorted(stone_src, key=lambda k: lum(hx(k)))
    moss_src = sorted(["151c12", "2d2c1c", "313f1f", "384d23", "565d36", "59752f", "6e8a3d", "a1b493"],
                      key=lambda k: lum(hx(k)))
    rust_src = sorted(["291416", "39232f", "4d2a33", "53323c", "633d47", "6d413e", "815048", "9f8f97"],
                      key=lambda k: lum(hx(k)))

    def ramp_for(src, ramp, lo=0):
        return {k: ramp[lo + round(i / max(1, len(src) - 1) * (len(ramp) - 1 - lo))] for i, k in enumerate(src)}

    smap, mmap, rmap = ramp_for(stone_src, STONE), ramp_for(moss_src, MOSS, 1), ramp_for(rust_src, RUST)
    for y in range(c.h):
        for x in range(c.w):
            p = c.get(x, y)
            if not p[3]:
                continue
            k = "%02x%02x%02x" % p[:3]
            if y < PLINTH_TOP:
                c.set(x, y, None)
                continue
            in_box = 13 <= x <= 23 and y <= 83
            if k in mmap:
                c.set(x, y, mmap[k])
            elif in_box and k in rmap:
                c.set(x, y, rmap[k])
            elif k in smap:
                c.set(x, y, smap[k])
            elif k in rmap:
                c.set(x, y, STONE[2] if lum(hx(k)) < 60 else STONE[4])
            else:
                c.set(x, y, STONE[3])
    # the raw mast foot (x 20-30, rows 66-78) is now stone-coloured lattice bits: clear what sits above the
    # plinth top surface so the hand-drawn mast foot replaces it
    for y in range(PLINTH_TOP, 76):
        for x in range(23, 32):
            c.set(x, y, None)


def half_w(y):
    t = (y - TOP_Y) / (BASE_Y - TOP_Y)
    return 1.5 + t * 4.0          # 1.5 at the top → 5.5 at the foot


def draw_mast(c):
    # back leg (centre, dark), then left (lit) and right (shade) legs, cross bracing between them
    for y in range(TOP_Y, BASE_Y + 1):
        hw = half_w(y)
        xl, xr = round(MX - hw), round(MX + hw)
        c.set(MX, y, STEEL[1])
        # bracing: X pattern in 6-row bays, drawn as the diagonal positions at this row
        bay = (y - TOP_Y) % 6
        span = xr - xl
        if span > 2:
            d1 = xl + round(bay / 5 * span)
            d2 = xr - round(bay / 5 * span)
            c.set(d1, y, STEEL[2])
            c.set(d2, y, STEEL[1])
        if (y - TOP_Y) % 6 == 0:
            for x in range(xl, xr + 1):
                c.set(x, y, STEEL[3] if x < MX else STEEL[2])
        c.set(xl - 1, y, OUT)
        c.set(xl, y, STEEL[5] if y % 4 else STEEL[4])     # lit leg (top-left light)
        c.set(xr, y, STEEL[2])
        c.set(xr + 1, y, OUT)
    # rust blooms + vines on the lower legs
    for (x, y, col) in [(22, 60, RUST[3]), (22, 61, RUST[2]), (28, 52, RUST[3]), (21, 70, RUST[4]), (29, 72, RUST[2])]:
        c.set(x, y, col)
    for y in range(54, BASE_Y):
        x = round(MX - half_w(y)) + (1 if (y // 3) % 2 else 0)
        c.set(x, y, MOSS[3] if y % 3 else MOSS[2])
        if y % 4 == 0:
            c.set(x - 1, y, MOSS[4])
    for y in range(64, BASE_Y):
        x = round(MX + half_w(y))
        if y % 2:
            c.set(x, y, MOSS[2])
    # service platform / collar at 1/3 height
    for x in range(MX - 5, MX + 6):
        c.set(x, 35, STEEL[4] if x < MX else STEEL[2])
        c.set(x, 36, STEEL[1])
    c.set(MX - 6, 35, OUT)
    c.set(MX + 6, 35, OUT)
    for x in range(MX - 6, MX + 7):
        c.set(x, 37, OUT) if c.get(x, 37)[3] == 0 else None


def guy_cables(c):
    # from the collar out to anchor pegs at the plinth's left/right corners
    for (x0, y0, x1, y1) in [(MX - 5, 36, 11, 82), (MX + 5, 36, 38, 80), (MX - 2, 22, 13, 80)]:
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n + 1):
            t = i / n
            x, y = round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t)
            if not c.get(x, y)[3] or c.get(x, y)[:3] in (hx(s)[:3] for s in STONE + MOSS):
                c.set(x, y, "#2b2522" if i % 5 else "#5a4e46")
        c.set(x1, y1, STEEL[4])
        c.set(x1, y1 + 1, OUT)


DISH = (10, 19)   # top-left of the dish box (11 x 10), mounted on the mast's left


def draw_dish(c, lit):
    ox, oy = DISH
    cx, cy, rx, ry = ox + 5, oy + 4.5, 5.5, 4.6
    for y in range(oy - 1, oy + 11):
        for x in range(ox - 1, ox + 12):
            d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
            if d < 1:
                # we look into a bowl facing up-left: its upper-left inner wall is in shade, the lower-right
                # inner wall catches the top-left light; the outer rim is lit on the top-left
                u = ((x + 0.5 - cx) / rx + (y + 0.5 - cy) / ry) * 0.5          # -1 (top-left) .. 1
                t = max(0.0, min(1.0, 0.5 + u * 0.9))
                col = mixc("#262c2b", "#c4c2ae", t ** 1.3)
                if d > 0.6:
                    col = "#d6d3bd" if u < -0.1 else ("#7c7c70" if u < 0.35 else "#50524b")
                    if lit and u < 0.35 and (x + y) % 2 == 0:
                        col = CYAN[4] if u < -0.1 else CYAN[2]
                elif d > 0.42 and u < -0.15:
                    col = "#1c2120"          # lip shadow inside the rim
                c.set(x, y, col)
            elif d < 1.35 and not c.get(x, y)[3]:
                c.set(x, y, OUT)
    # feed arm + horn
    c.line(ox + 5, oy + 4, ox + 9, oy + 1, STEEL[1])
    c.set(ox + 9, oy + 1, CYAN[5] if lit else "#3a3632")
    c.set(ox + 10, oy + 1, OUT)
    # mount arm to the mast
    c.line(ox + 10, oy + 6, MX - 2, oy + 8, STEEL[3])
    c.line(ox + 10, oy + 7, MX - 2, oy + 9, OUT)


def draw_beacon(c, level):
    """Beacon cage on the mast top. level: None = off, 0..3 = on pulse."""
    # cap + cage posts
    for x in range(MX - 3, MX + 4):
        c.set(x, 4, OUT)
        c.set(x, 5, STEEL[3] if x < MX + 1 else STEEL[2])
    c.set(MX - 4, 5, OUT)
    c.set(MX + 4, 5, OUT)
    c.set(MX, 3, OUT)
    c.set(MX, 2, STEEL[4])
    c.set(MX, 1, OUT)
    for y in range(6, 14):
        c.set(MX - 3, y, STEEL[4] if y % 3 else OUT)
        c.set(MX + 3, y, STEEL[2] if y % 3 else OUT)
        c.set(MX - 4, y, OUT)
        c.set(MX + 4, y, OUT)
    for x in range(MX - 4, MX + 5):
        c.set(x, 14, OUT)
        c.set(x, 15, STEEL[2] if x > MX else STEEL[3])
    c.set(MX - 5, 15, OUT)
    c.set(MX + 5, 15, OUT)
    # glass lamp (3 wide x 8 tall) between the posts
    for y in range(6, 14):
        for x in range(MX - 2, MX + 3):
            if level is None:
                col = DEADGLASS[2] if x == MX - 1 else (DEADGLASS[1] if x <= MX else DEADGLASS[0])
                if (x, y) in ((MX - 1, 7), (MX - 1, 8)):
                    col = DEADGLASS[3]
            else:
                core = abs(x - MX) <= 0 and 7 <= y <= 12
                base = 3 + level
                i = base + (2 if core else (0 if abs(x - MX) == 1 else -1))
                col = CYAN[max(1, min(6, i))]
            c.set(x, y, col)


def halo(c, level):
    """Hard-edged light around the lamp: a ring of sparse texels + 4 short rays; grows with the pulse."""
    if level is None:
        return
    cx, cy = MX, 10
    r = 6 + level
    for a in range(0, 360, 15):
        x = round(cx + math.cos(math.radians(a)) * r)
        y = round(cy + math.sin(math.radians(a)) * r * 0.9)
        if not c.get(x, y)[3] and (a // 15 + level) % 2 == 0:
            c.set(x, y, CYAN[3] if level < 2 else CYAN[4])
    ray = 2 + level
    for dx, dy in ((-1, 0), (1, 0), (0, -1)):
        for i in range(5, 5 + ray):
            x, y = cx + dx * i, cy + dy * i
            if not c.get(x, y)[3]:
                c.set(x, y, CYAN[5] if i < 7 else CYAN[3])


def leds(c, on, k):
    # junction box status LED (raw box at x 14-22, y 68-82)
    if on:
        c.set(16, 72, "#7cff6a" if k % 2 == 0 else "#3fc048")
        c.set(17, 72, "#3fc048")
    else:
        c.set(16, 72, "#6a1c1c")


def build():
    base = Canvas(load("pylon.png"))
    recolour_base(base)
    draw_mast(base)
    guy_cables(base)
    frames = []
    for k, level in enumerate([None, 0, 1, 2, 1]):
        c = Canvas(base.im.copy())
        draw_dish(c, level is not None and level >= 1)
        draw_beacon(c, level)
        halo(c, level)
        leds(c, level is not None, k)
        frames.append(beam(c, level))
    return frames


PAD = 18   # headroom above the mast for the beacon beam


def beam(c, level):
    """Pad the frame on top and, when on, shoot a thin cyan beam straight up off the cap: the landmark tell
    from across the screen (critic H: the pylon must read from afar). Solid near the lamp, broken further up."""
    im = Image.new("RGBA", (c.w, c.h + PAD), (0, 0, 0, 0))
    im.paste(c.im, (0, PAD))
    f = Canvas(im)
    if level is None:
        return f
    top = PAD + 1                     # the cap's spike
    ln = 9 + level * 4
    for i in range(1, ln + 1):
        y = top - i
        if y < 0:
            break
        solid = i <= 4 + level
        if solid or (i + level) % 3 != 0:
            f.set(MX, y, CYAN[6] if i <= 2 else (CYAN[5] if solid else CYAN[3]))
        if i <= 2 + level:
            f.set(MX - 1, y, CYAN[3])
            f.set(MX + 1, y, CYAN[3])
    return f


def export(frames):
    bb = None
    for f in frames:
        b = f.im.getbbox()
        bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    x0, y0 = bb[0] - 1, max(0, bb[1] - 1)
    fw, fh = bb[2] - bb[0] + 2, bb[3] - y0 + 1
    out = []
    for f in frames:
        im = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        im.paste(f.im.crop((x0, y0, x0 + fw, y0 + fh)), (0, 0))
        check_alpha(im)
        out.append(im)
    strip(out).save(SPRITES / "prop_relay_pylon_v3.png")
    anchor = [MX - x0, 88 + PAD - y0]
    return fw, fh, anchor, out


if __name__ == "__main__":
    frames = build()
    fw, fh, anchor, out = export(frames)
    print("prop_relay_pylon_v3", fw, fh, anchor)
    (HERE / "entries" / "prop_relay_pylon.json").write_text(json.dumps({"prop_relay_pylon": {
        "file": "prop_relay_pylon_v3.png", "ppu": 32, "frames": 5, "fw": fw, "fh": fh, "anchor": anchor, "fps": 8,
        "anims": {"idle": [0], "off": [0], "on": [1, 2, 3, 4]}, "animFps": {"on": 6}}}, indent=1))
    preview(out, SCRATCH / "pylon_frames.png", 4, anchor=anchor)
    gridzoom(out[3], SCRATCH / "pylon_zoom.png", None, 9, 4)
