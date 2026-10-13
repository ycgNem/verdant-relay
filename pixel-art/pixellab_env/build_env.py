"""Build V2 environment sprites from raw PixelLab downloads.

python pixel-art/pixellab_env/build_env.py
- crops each raw image to its opaque bbox + 1 px, thresholds alpha at 128 (no resampling)
- writes public/sprites/<file>.png (never overwrites a file it did not create; see OWNED)
- writes pixel-art/manifest.v2env.json, pixel-art/pixellab_env/footprints.json, contact_<family>.png
"""
import json
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SPRITES = ROOT / "public" / "sprites"
RAW = HERE / "raw"
from spec import SPEC  # noqa: E402  (key -> dict, see spec.py)

OWNED_LIST = HERE / "owned_files.json"  # files this script created (safe to rewrite)
owned = set(json.loads(OWNED_LIST.read_text())) if OWNED_LIST.exists() else set()


def clean(im):
    im = im.convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    im.putalpha(a)
    # zero rgb of transparent texels
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 0)
    bb = im.getbbox()
    x0, y0, x1, y1 = bb
    out = Image.new("RGBA", (x1 - x0 + 2, y1 - y0 + 2), (0, 0, 0, 0))
    out.paste(im.crop(bb), (1, 1))
    return out


def auto_anchor(im, lift, xmode="mass"):
    """Base centre. x: horizontal centre of mass of all opaque texels ("mass") or of the bottom 4 opaque
    rows ("bottom", for trunks). y = bottom opaque row - lift."""
    a = im.getchannel("A")
    w, h = im.size
    rows = [y for y in range(h) if any(a.getpixel((x, y)) for x in range(w))]
    bottom = rows[-1]
    ys = range(bottom - 3, bottom + 1) if xmode == "bottom" else range(h)
    xs = [x for y in ys for x in range(w) if a.getpixel((x, y))]
    return [round(sum(xs) / len(xs)), bottom - lift]


manifest, footprints, families = {}, {}, {}
for key, s in SPEC.items():
    src = RAW / s["src"]
    im = clean(Image.open(src))
    if "box" in s:  # optional sub-crop in raw coords before cleaning
        im = clean(Image.open(src).crop(tuple(s["box"])))
    fname = s.get("file", key + ".png")
    dst = SPRITES / fname
    if dst.exists() and fname not in owned:
        raise SystemExit(f"refusing to overwrite {dst}")
    im.save(dst)
    owned.add(fname)
    e = {"file": fname, "ppu": 32}
    if s.get("flat"):
        e["flat"] = True
        e["shadow"] = 0
    else:
        if "anchor" in s:
            e["anchor"] = s["anchor"]
        else:
            lift = s.get("lift", 1)
            if isinstance(lift, float):
                lift = round(lift * im.height)
            e["anchor"] = auto_anchor(im, lift, s.get("xmode", "mass"))
    manifest[key] = e
    footprints[key] = {"footprint": s.get("fp")}
    if s.get("cut"):
        footprints[key]["cuttable"] = True
    if s.get("heavy"):
        footprints[key]["heavy"] = True
    families.setdefault(key.split("_")[0], []).append((key, im, e))
    print(f"{key:24s} {im.size[0]:3d}x{im.size[1]:<3d} anchor={e.get('anchor')}")

OWNED_LIST.write_text(json.dumps(sorted(owned), indent=1))
(ROOT / "pixel-art" / "manifest.v2env.json").write_text(json.dumps(manifest, indent=2) + "\n")
(HERE / "footprints.json").write_text(json.dumps(footprints, indent=2) + "\n")

for fam, items in families.items():
    cols = 8 if fam != "tree" else 4
    cw = max(im.width for _, im, _ in items) + 6
    ch = max(im.height for _, im, _ in items) + 6
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGBA", (cw * cols, ch * rows), (22, 44, 32, 255))
    for i, (k, im, e) in enumerate(items):
        ox, oy = (i % cols) * cw + 3, (i // cols) * ch + 3
        sheet.alpha_composite(im, (ox, oy))
        if "anchor" in e:  # mark anchor with a red texel
            ax, ay = e["anchor"]
            for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                sheet.putpixel((ox + ax + dx, oy + ay + dy), (255, 0, 0, 255))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(HERE / f"contact_{fam}.png")
