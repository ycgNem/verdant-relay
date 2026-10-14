"""Contact sheet for the forage props -> pixel-art/contact_forage.png
Row 1 at 4x, row 2 at 1x (readability), each next to fol_stump / fol_log / dec_berries on jungle-green ground.
Then fol_log before (orig/) and after the fungus repaint, and the dusk bloom (closed / open / spent) at 4x by day and on
a dusk-tinted ground where only the EMISSIVE texels (build.glow_mask, the shader's test) keep their colour.
Run: python pixel-art/forage/contact.py
"""
from pathlib import Path

import sys

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import BLOOM_GLOW, glow_mask  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "public" / "sprites"
GROUND = (44, 64, 40, 255)
GROUND2 = (38, 56, 35, 255)

KEYS = ["fol_stump", "prop_stump_bare", "prop_stump_fungus", "fol_log", "LOG+OVERLAY",
        "dec_berries", "prop_fruit_bush", "prop_fruit_bush_bare", "fol_fern", "prop_fungus_log_overlay"]
BLOOMS = ["fol_fern", "prop_dusk_bloom_closed", "prop_dusk_bloom_open", "prop_dusk_bloom_spent", "prop_fruit_bush",
          "fol_bush_flowering"]
DUSK = (0.42, 0.34, 0.58)        # a rough dusk veil: everything darkened toward violet except emissive texels
GLOW_KEYS = {"prop_dusk_bloom_open": BLOOM_GLOW}


def load(k):
    if k == "LOG_ORIG":
        return Image.open(Path(__file__).resolve().parent / "orig" / "fol_log.png").convert("RGBA")
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


def dusk(im, key):
    """Darken toward the dusk veil, but keep the texels the EMISSIVE pass would light."""
    keep = glow_mask(im, GLOW_KEYS[key]) if key in GLOW_KEYS else set()
    out = im.copy()
    px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and (x, y) not in keep:
                px[x, y] = (int(r * DUSK[0]), int(g * DUSK[1]), int(b * DUSK[2]), a)
    return out


def row(scale, gap, keys=KEYS, night=False):
    ims = [load(k) for k in keys]
    if night:
        ims = [dusk(i, k) for i, k in zip(ims, keys)]
    h = max(i.height for i in ims)
    w = sum(i.width for i in ims) + gap * (len(ims) + 1)
    g = ground(w, h + 2 * gap)
    if night:
        g = dusk(g, "")
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
    logs = row(4, 6, ["LOG_ORIG", "fol_log"])
    day = row(4, 6, BLOOMS)
    night = row(4, 6, BLOOMS, night=True)
    night1 = row(2, 6, BLOOMS, night=True)
    parts = [a, b, scene, logs, day, night, night1]
    W = max(p.width for p in parts)
    out = Image.new("RGBA", (W, sum(p.height for p in parts) + 8 * len(parts)), (20, 24, 20, 255))
    y = 0
    for p in parts:
        out.alpha_composite(p, (0, y))
        y += p.height + 8
    out.save(ROOT / "pixel-art" / "contact_forage.png")
    print(out.size)


if __name__ == "__main__":
    main()
