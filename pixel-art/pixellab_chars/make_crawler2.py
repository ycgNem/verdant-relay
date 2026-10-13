"""Hand-finish the Bramble Crawler v2 frames (no generation cost) -> raw/crawler2/zip/Idle/animations/<anim>_c/.

PixelLab's standard quadruped came out as a single dark-bark brown. Deterministic recolour per frame:
- thorn tips: exposed silhouette points (>= 5 of 8 neighbours empty) in the upper body become red,
  with the texel behind them dark red - the "red thorn tips" of the design;
- bramble stems: the lighter browns of the upper body (spine mane) shift to a dark blue-green vine ramp,
  so it reads as a creature made of bramble, while legs, head underside and outline stay bark.
The upper-body line is fixed per facing (from that facing's rotation image) so it never flickers between frames.
Idle = the rotation pose with a 1-texel breathing bob of the upper body (rows shifted, no resampling).
"""
import shutil
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
A = HERE / "raw" / "crawler2" / "zip" / "Idle" / "animations"
ROT = HERE / "raw" / "crawler2" / "rot"
DIRS = ["south", "south-east", "east", "north-east", "north"]
VINE = {(113, 67, 59): (86, 112, 52), (96, 61, 53): (66, 92, 46), (81, 48, 42): (50, 72, 40),
        (66, 38, 36): (38, 56, 36)}
RED, MRED, DRED = (226, 62, 42), (168, 44, 36), (112, 30, 30)
CANE = {(113, 67, 59): (138, 64, 62), (96, 61, 53): (116, 50, 52), (81, 48, 42): (94, 40, 44), (66, 38, 36): (72, 32, 38)}
UPPER = 0.52   # fraction of the standing height (from the top) treated as mane/back


def load(p):
    im = Image.open(p).convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0); im.putalpha(a)
    return Image.composite(im, Image.new("RGBA", im.size, (0, 0, 0, 0)), a)


def cut_line(d, size):
    r = load(ROT / f"{d}.png")
    bb = r.getbbox()
    # rotation images are 68x68 like the walk; larger attack canvases are centred, so offset the line
    off = (size[1] - r.height) // 2
    return off + bb[1] + round((bb[3] - bb[1]) * UPPER)


EYES = ((239, 210, 50), (255, 255, 10))
HEAD_R = 8     # texels around the eyes kept as bark (the head)


def recolour(im, cut, vine=None):
    vine = CANE if vine is None else vine
    px = im.load(); w, h = im.size
    out = im.copy(); o = out.load()
    op = lambda x, y: 0 <= x < w and 0 <= y < h and px[x, y][3]
    eyes = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] and px[x, y][:3] in EYES]
    head = lambda x, y: any((x - ex) ** 2 + (y - ey) ** 2 <= HEAD_R ** 2 for ex, ey in eyes)
    for y in range(min(cut, h)):
        for x in range(w):
            if not px[x, y][3]:
                continue
            c = px[x, y][:3]
            if c in vine and not head(x, y):
                o[x, y] = vine[c] + (255,)
    for y in range(min(cut, h)):
        for x in range(w):
            if not px[x, y][3] or px[x, y][:3] in ((239, 210, 50), (255, 255, 10)):
                continue
            empty = sum(not op(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy)
            if empty >= 5 and not head(x, y):
                o[x, y] = RED + (255,)
                # walk two texels back along the thorn (towards the body): mid red, then dark red
                cx, cy = x, y
                for col in (MRED, DRED):
                    best = None
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            if (dx or dy) and op(cx + dx, cy + dy) and o[cx + dx, cy + dy][:3] not in (RED, MRED):
                                n = sum(bool(op(cx + dx + ex, cy + dy + ey)) for ex in (-1, 0, 1) for ey in (-1, 0, 1))
                                if best is None or n > best[0]:
                                    best = (n, cx + dx, cy + dy)
                    if not best:
                        break
                    cx, cy = best[1], best[2]
                    if o[cx, cy][:3] != RED:
                        o[cx, cy] = col + (255,)
    return out


def bob(im, cut, dy=1):
    """Shift everything above `cut` down by dy texels (the row at the cut is overwritten)."""
    out = im.copy()
    top = im.crop((0, 0, im.width, cut))
    clear = Image.new("RGBA", (im.width, cut + dy), (0, 0, 0, 0))
    out.paste(clear, (0, 0))
    out.paste(top, (0, dy))
    # keep the legs below the cut untouched (paste above already only covered rows < cut + dy)
    out.paste(im.crop((0, cut + dy, im.width, im.height)), (0, cut + dy))
    return out


def run():
    for name in ["walk", "attack", "idle"]:
        p = A / f"{name}_c"
        if p.exists():
            shutil.rmtree(p)
    for d in DIRS:
        for name in ["walk", "attack"]:
            files = sorted((A / name / d).glob("*.png"))
            (A / f"{name}_c" / d).mkdir(parents=True)
            ims = [load(f) for f in files]
            dy = 0
            if name == "walk":
                # the walk template lifts the body 0-3 texels in some facings: set the lowest paw of the cycle
                # on the rotation's ground line so idle <-> walk never hops (pure translation)
                rot = load(ROT / f"{d}.png")
                dy = rot.getbbox()[3] - max(im.getbbox()[3] for im in ims)
            for i, im in enumerate(ims):
                if dy:
                    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); sh.paste(im, (0, dy)); im = sh
                recolour(im, cut_line(d, im.size)).save(A / f"{name}_c" / d / f"frame_{i:03d}.png")
        base = load(ROT / f"{d}.png")
        bb = base.getbbox()
        legs = bb[1] + round((bb[3] - bb[1]) * 0.62)   # bob only the body above the knees
        cut = cut_line(d, base.size)
        seq = [base, bob(base, legs), bob(base, legs), base]
        (A / "idle_c" / d).mkdir(parents=True)
        for i, f in enumerate(seq):
            recolour(f, cut).save(A / "idle_c" / d / f"frame_{i:03d}.png")
    print("crawler2 frames ready")


if __name__ == "__main__":
    run()
