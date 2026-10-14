"""Derived creature sheets (critic H2 #5): the Thorn Stalker and the Bloater as real sprites, not runtime tints.

Both are made from the V2 Crawler sheet (public/sprites/v2_crawler.png: 6 x 20 frames of 64x53, rows = anim x dir
s/se/e/ne/n; idle 4, walk 6, windup 3, attack 4) and keep its exact layout, so the code only swaps the key.

  thorn_stalker  the body on a red-violet ramp; the back quills become bone-white thorns, every tip pushed one texel
                 further out (a taller crest)
  bloater        the body on a swollen bile-olive ramp, quills dulled; a spore sac BAKED onto its back in every frame
                 (behind the shoulders when it faces south, on top of the back otherwise) - no runtime overlay, so no
                 occlusion checker

Run: python pixel-art/derived_v4/build.py
"""
import colorsys
import math
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "creatures_v3"))
from crlib import Rig, SPRITES, SCRATCH, h2  # noqa: E402
from v3lib import check_alpha  # noqa: E402

FW, FH, COLS, ROWS = 64, 53, 6, 20
DIRS = ["s", "se", "e", "ne", "n"]


def hx(c):
    return (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 255)


def hsv(p):
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    return h * 360, s, v


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def classify(p):
    """Crawler texels: the yellow eyes, the red open mouth (fully saturated) and the white teeth/glints keep their
    colours; the saturated quill tips get their own ramp; everything else (fur, plates, quill shafts) is body."""
    h, s, v = hsv(p)
    if 35 <= h <= 70 and v > 0.6:
        return "eye"
    if s > 0.95 or s < 0.2 or v < 0.07:
        return None
    if s >= 0.7 and v >= 0.4 and (h >= 330 or h <= 12):
        return "tip"
    return "body"


def build_maps(src, ramps):
    cols = {}
    for y in range(src.height):
        for x in range(src.width):
            p = src.getpixel((x, y))
            if p[3]:
                c = classify(p)
                if c and c in ramps:
                    cols.setdefault(c, set()).add(p[:3])
    maps = {}
    for c, cs in cols.items():
        ramp = [hx(r) for r in ramps[c]]
        s = sorted(cs, key=lum)
        maps[c] = {col: ramp[min(len(ramp) - 1, int(i / max(1, len(s)) * len(ramp)))] for i, col in enumerate(s)}
    return maps


def recolour(src, maps):
    out = src.copy()
    for y in range(src.height):
        for x in range(src.width):
            p = src.getpixel((x, y))
            if p[3]:
                c = classify(p)
                if c in maps:
                    out.putpixel((x, y), maps[c][p[:3]])
    return out


# ------------------------------------------------------------------ thorn stalker
STALKER = {
    "body": ["#14060f", "#26091c", "#3c112e", "#561c44", "#72285a", "#903a70", "#b05888"],
    "tip": ["#a8927a", "#cdbda2", "#ece0c8"],
}


def thorn_stalker(src):
    out = recolour(src, build_maps(src, STALKER))
    tip = hx(STALKER["tip"][1])
    add = []
    for r in range(ROWS):
        for c in range(COLS):
            x0, y0 = c * FW, r * FH
            pts = [(x, y) for y in range(y0, y0 + FH) for x in range(x0, x0 + FW) if src.getpixel((x, y))[3]]
            if not pts:
                continue
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            for (x, y) in pts:
                if classify(src.getpixel((x, y))) != "tip":
                    continue
                dx, dy = x - cx, y - cy
                n = math.hypot(dx, dy) or 1
                for k in (1, 2):
                    nx, ny = int(round(x + k * dx / n)), int(round(y + k * dy / n))
                    if x0 <= nx < x0 + FW and y0 <= ny < y0 + FH - 2 and not src.getpixel((nx, ny))[3]:
                        add.append((nx, ny))
    for (x, y) in add:
        out.putpixel((x, y), tip)
    return out


# ------------------------------------------------------------------ bloater
BLOAT = {
    "body": ["#0c0e06", "#1a1e0e", "#2c3216", "#40481e", "#566028", "#6e7a32", "#8a963e"],
    "tip": ["#6a6228", "#8a8034", "#a89c44"],
}
SAC = ["#30380e", "#56661c", "#829a2c", "#aac448", "#cce07a", "#ecf6b8"]


def sac_layer(cx, cy, rx, ry, frame, seed):
    """The swollen spore sac (its own outlined layer, 64x53)."""
    r = Rig(FW, FH)
    spots = lambda x, y, a, b: (-1.3 if h2(x * 3 // 3, y, seed) < 0.1 and a * a + b * b < 0.7 else 0.0)
    r.ell(cx, cy, rx, ry, SAC, base=2.6, gain=2.3, grime=0.12, seed=seed, spec=0.9, tex=spots)
    # veins over the membrane
    r.pixels([(int(cx + rx * 0.3), int(cy - ry * 0.2 + k), 1.2) for k in range(3)] +
             [(int(cx - rx * 0.4 + k), int(cy + ry * 0.35), 1.4) for k in range(3)], SAC, 1.2, glow=False)
    # two little spore vents puffing
    for i, (vx, vy) in enumerate(((cx - rx * 0.35, cy - ry * 0.85), (cx + rx * 0.3, cy - ry * 0.75))):
        r.pixels([(int(vx), int(vy), 0.6), (int(vx) + 1, int(vy), 1.0)], SAC, 1.0, glow=False)
        if (frame + i) % 3 == 0:
            r.pixels([(int(vx), int(vy) - 2, 5.0), (int(vx) + 1, int(vy) - 3, 4.0)], SAC, 5.0, glow=True)
    return r.render().image()


def body_bbox(src, x0, y0):
    pts = [(x, y) for y in range(y0, y0 + FH) for x in range(x0, x0 + FW)
           if src.getpixel((x, y))[3] and classify(src.getpixel((x, y))) == "body"]
    if not pts:
        return None
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs) - x0, min(ys) - y0, max(xs) - x0, max(ys) - y0


def bloater(src):
    base = recolour(src, build_maps(src, BLOAT))
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    for r in range(ROWS):
        d = DIRS[r % 5]
        for c in range(COLS):
            x0, y0 = c * FW, r * FH
            frame = base.crop((x0, y0, x0 + FW, y0 + FH))
            bb = body_bbox(src, x0, y0)
            if bb is None:
                out.paste(frame, (x0, y0))
                continue
            bx0, by0, bx1, by1 = bb
            mid = (bx0 + bx1) / 2
            spec = {"s": (mid, by0 + 3, 9.0, 7.5, False), "se": (mid - 4, by0 + 4, 9.5, 7.5, False),
                    "e": (mid - 5, by0 + 5, 10.0, 8.0, True), "ne": (mid - 2, by0 + 5, 9.5, 8.0, True),
                    "n": (mid, by0 + 7, 9.5, 8.5, True)}[d]
            sx, sy, rx, ry, front = spec
            sac = sac_layer(sx, sy, rx, ry, c, 5 + r)
            cell = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
            if front:
                cell.alpha_composite(frame)
                cell.alpha_composite(sac)
            else:
                cell.alpha_composite(sac)
                cell.alpha_composite(frame)
            out.paste(cell, (x0, y0))
    return out


def hard(im):
    im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
    return im


def main():
    src = Image.open(SPRITES / "v2_crawler.png").convert("RGBA")
    assert src.size == (FW * COLS, FH * ROWS), src.size
    for key, fn in (("thorn_stalker", thorn_stalker), ("bloater", bloater)):
        im = hard(fn(src))
        check_alpha(im)
        im.save(SPRITES / f"{key}.png")
        print(key, im.size)
    # review: rows idle-s, walk-e, attack-ne of crawler / stalker / bloater
    ims = [src] + [Image.open(SPRITES / f"{k}.png").convert("RGBA") for k in ("thorn_stalker", "bloater")]
    rows = [0, 7, 9, 18]
    sheet = Image.new("RGBA", (FW * 4 * 3 + 20, FH * len(rows)), (52, 58, 50, 255))
    for i, im in enumerate(ims):
        for j, r in enumerate(rows):
            for c in range(4):
                sheet.alpha_composite(im.crop((c * FW, r * FH, (c + 1) * FW, (r + 1) * FH)), (i * (FW * 4 + 10) + c * FW, j * FH))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(SCRATCH / "derived_v4.png")


if __name__ == "__main__":
    main()
