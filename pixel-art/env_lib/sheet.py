"""Env group: write the manifest fragment and the labelled contact sheet.
Run after the build scripts:  python pixel-art/env_lib/sheet.py
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from envlib import ART, SPRITES, up, tiled, night  # noqa: E402

PROPS = {
    "tree": {}, "tree_2": {}, "tree_3": {},
    "bush": {}, "bush_2": {}, "bramble": {},
    "rubble": {}, "rubble_2": {}, "car_wreck": {}, "wall_block": {},
    "lamp_post": {"frames": 2, "fps": 6, "anims": {"idle": [0, 1]}},
    "spores": {"frames": 2, "fps": 3, "anims": {"idle": [0, 1]}, "flat": True, "shadow": 0},
    "alarm": {"frames": 2, "fps": 8, "anims": {"idle": [0, 1]}, "flat": True, "shadow": 0},
}
DISTRICTS = ["overgrown_market", "flooded_transit", "canopy_greenhouse", "collapsed_residential", "data_center"]
TILES = [f"{p}_{d}" for d in DISTRICTS for p in ("floor", "floor_alt", "wall")]
TILES += ["floor_defense", "floor_alt_defense", "lane_defense"]


def manifest():
    out = {}
    for k, extra in PROPS.items():
        e = {"file": f"{k}.png", "ppu": 32, "frames": extra.get("frames", 1), "fps": extra.get("fps", 1),
             "anims": extra.get("anims", {"idle": [0]})}
        for opt in ("flat", "shadow"):
            if opt in extra:
                e[opt] = extra[opt]
        out[k] = e
    for k in TILES:
        out[k] = {"file": f"{k}.png", "ppu": 32, "tile": True, "frames": 1}
    out["water"] = {"file": "water.png", "ppu": 32, "tile": True, "frames": 2, "fps": 2}
    (ART / "manifest.env.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf8")
    return out


def contact():
    S = 3
    pad, lab = 12, 16
    bg = (36, 34, 48, 255)
    rows = []
    # row 1+: props (frames side by side), on a neutral backdrop
    items = []
    for k, extra in PROPS.items():
        im = Image.open(SPRITES / f"{k}.png").convert("RGBA")
        items.append((k + (f" ({extra['frames']}f)" if extra.get("frames") else ""), im))
    # tiles: show each as 2x2 tiled so seams are visible
    titems = [(k, tiled(Image.open(SPRITES / f"{k}.png").convert("RGBA"), 2, 2)) for k in TILES]
    w = Image.open(SPRITES / "water.png").convert("RGBA")
    titems.append(("water (2f)", w))

    def grid(items, cols, scale):
        cw = max(i.width for _, i in items) * scale
        ch = max(i.height for _, i in items) * scale
        nrows = (len(items) + cols - 1) // cols
        g = Image.new("RGBA", (cols * (cw + pad) + pad, nrows * (ch + pad + lab) + pad), bg)
        d = ImageDraw.Draw(g)
        for n, (l, im) in enumerate(items):
            x = pad + (n % cols) * (cw + pad)
            y = pad + (n // cols) * (ch + pad + lab)
            u = up(im, scale)
            g.alpha_composite(u, (x + (cw - u.width) // 2, y + ch - u.height))
            d.text((x, y + ch + 3), l, fill=(235, 235, 235))
        return g

    top = grid(items[:7], 7, S)
    mid = grid(items[7:], 6, S)
    tl = grid(titems, 6, 2)
    W = max(top.width, mid.width, tl.width)
    sheet = Image.new("RGBA", (W, top.height + mid.height + tl.height + 30), bg)
    d = ImageDraw.Draw(sheet)
    d.text((pad, 4), "Verdant Relay - env group (props x3, tiles 2x2 at x2)", fill=(255, 231, 97))
    y = 16
    for g in (top, mid, tl):
        sheet.alpha_composite(g, (0, y))
        y += g.height
    sheet.save(ART / "contact_env.png")
    night(sheet).save(ART / "env_lib" / "contact_env_night.png")


if __name__ == "__main__":
    m = manifest()
    contact()
    print(len(m), "entries; contact sheet written")
