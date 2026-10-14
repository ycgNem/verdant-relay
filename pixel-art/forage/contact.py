"""Contact sheet for the forage props -> pixel-art/contact_forage.png
Row 1 at 4x, row 2 at 1x (readability), each next to fol_stump / fol_log / dec_berries on jungle-green ground.
Run: python pixel-art/forage/contact.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "public" / "sprites"
GROUND = (44, 64, 40, 255)
GROUND2 = (38, 56, 35, 255)

KEYS = ["fol_stump", "prop_stump_bare", "prop_stump_fungus", "fol_log", "LOG+OVERLAY",
        "dec_berries", "prop_fruit_bush", "prop_fruit_bush_bare", "fol_fern", "prop_fungus_log_overlay"]


def load(k):
    if k == "LOG+OVERLAY":
        log = Image.open(SPR / "fol_log.png").convert("RGBA")
        ov = Image.open(SPR / "prop_fungus_log_overlay.png").convert("RGBA")
        log.alpha_composite(ov, (20, 18))
        return log
    return Image.open(SPR / f"{k}.png").convert("RGBA")


def ground(w, h):
    g = Image.new("RGBA", (w, h), GROUND)
    px = g.load()
    for y in range(h):
        for x in range(w):
            if ((x * 7 + y * 13) ^ (x * y)) % 11 == 0:
                px[x, y] = GROUND2
    return g


def row(scale, gap):
    ims = [load(k) for k in KEYS]
    h = max(i.height for i in ims)
    w = sum(i.width for i in ims) + gap * (len(ims) + 1)
    g = ground(w, h + 2 * gap)
    x = gap
    for i in ims:
        g.alpha_composite(i, (x, gap + h - i.height))
        x += i.width + gap
    return g.resize((g.width * scale, g.height * scale), Image.NEAREST)


def main():
    a = row(4, 6)
    b = row(1, 6)
    # 1x scene: bushes beside a trail strip among ferns, at 3x for the viewer (still whole-number)
    scene = ground(250, 80)
    d = ImageDraw.Draw(scene)
    d.rectangle((0, 50, 250, 62), fill=(92, 74, 52, 255))
    for k, x, y in [("fol_fern", 0, 2), ("prop_fruit_bush", 60, 18), ("fol_fern", 96, 0), ("prop_fruit_bush_bare", 150, 18),
                    ("dec_berries", 112, 50), ("prop_stump_fungus", 175, -6)]:
        scene.alpha_composite(load(k), (x, y))
    scene = scene.resize((scene.width * 3, scene.height * 3), Image.NEAREST)
    W = max(a.width, b.width, scene.width)
    out = Image.new("RGBA", (W, a.height + b.height + scene.height + 16), (20, 24, 20, 255))
    out.alpha_composite(a, (0, 0))
    out.alpha_composite(b, (0, a.height + 8))
    out.alpha_composite(scene, (0, a.height + b.height + 16))
    out.save(ROOT / "pixel-art" / "contact_forage.png")
    print(out.size)


if __name__ == "__main__":
    main()
