"""Assemble PixelLab character exports into Verdant Relay sprite sheets (STYLE.md "Directional sheets").

    python -P -E pixel-art/pixellab_chars/build_sheets.py [key ...]

Reads raw frames from pixel-art/pixellab_chars/raw/<key>/ (character ZIP extracted to raw/<key>/zip, or
animate_image frames in raw/<key>/<anim>/NN.png for strip keys), writes public/sprites/v2_<key>.png,
pixel-art/pixellab_chars/contact_<key>.png and the entries of pixel-art/manifest.v2chars.json.

Rules: alpha thresholded at 128, never resampled; every generated canvas is centred on one shared canvas
(PixelLab grows animation canvases symmetrically around the character), then the whole sheet is cropped to
the union of all opaque pixels so feet stay on the same texel in every anim.
"""
import json
import sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SPRITES = ROOT / "public" / "sprites"
FRAG = ROOT / "pixel-art" / "manifest.v2chars.json"
DIRS = ["south", "south-east", "east", "north-east", "north"]
DIR_KEYS = ["s", "se", "e", "ne", "n"]
BG = (24, 44, 30, 255)

# name, source folder (under zip/Idle/animations), frame indices (None = all), fps, loop, hit
# "src" may be a dict {direction: folder} to mix groups per direction.
# Per-direction source overrides: the first crawler lunge turned to face the camera in the north row (re-rolled
# as attack_n); both feral stab rolls pointed the spear west in the south-east row, so SE borrows the east row.
CRAWLER_ATK = {"south": "attack", "south-east": "attack", "east": "attack", "north-east": "attack", "north": "attack_n"}
FERAL_ATK = {"south": "attack2", "south-east": "attack2:east", "east": "attack2", "north-east": "attack2", "north": "attack2"}

CHARS = {
    "player": {
        "anims": [
            {"name": "idle", "src": "idle", "fps": 6},
            {"name": "walk", "src": "walk2", "fps": 10},
            {"name": "slash", "src": "slash", "fps": 16, "loop": False, "hit": 4},
            {"name": "chop", "src": "chop", "fps": 13, "loop": False, "hit": 5},
            {"name": "roll", "src": "roll", "fps": 14, "loop": False},
            {"name": "hurt", "src": "hurt_mix", "fps": 10, "loop": False, "optional": True},
        ],
    },
    "crawler": {
        "quadruped": True,
        "anims": [
            {"name": "idle", "src": "idle", "fps": 6},
            {"name": "walk", "src": "walk", "fps": 10},
            {"name": "windup", "src": CRAWLER_ATK, "frames": [0, 1, 2], "fps": 6, "loop": False},
            {"name": "attack", "src": CRAWLER_ATK, "frames": [3, 4, 5, 6], "fps": 12, "loop": False, "hit": 1},
        ],
    },
    "razorback": {
        "quadruped": True,
        "anims": [
            # PixelLab group "windup" is the bear template "angry" (a slow head toss) - it reads as an idle;
            # the real wind-up is the custom "paw" anim (head down, scraping a hoof).
            {"name": "idle", "src": "windup", "fps": 6},
            {"name": "walk", "src": "walk", "fps": 9},
            {"name": "windup", "src": "paw", "fps": 9, "loop": False},
            {"name": "attack", "src": "attack", "fps": 12, "hit": 2},
        ],
    },
    "feral": {
        "anims": [
            {"name": "idle", "src": "idle", "fps": 5},
            {"name": "walk", "src": "walk", "fps": 9},
            {"name": "windup", "src": FERAL_ATK, "frames": [0, 1, 2], "fps": 7, "loop": False},
            {"name": "attack", "src": FERAL_ATK, "frames": [3, 4, 5, 6], "fps": 12, "loop": False, "hit": 1},
        ],
    },
}

# Strip keys (V1 format: one horizontal strip facing RIGHT). anims: name -> (raw folder, indices), fps.
STRIPS = {
    "skitter": {
        "anims": [
            ("idle", "idle", [0, 1, 2, 3, 4], 8),
            ("walk", "walk", [1, 2, 3, 4, 5, 6, 7, 8], 16),
            ("windup", "attack", [0, 2, 3], 10),
            ("attack", "attack", [4, 5, 6], 12),
        ],
    },
    "spitter": {
        "anims": [
            ("idle", "idle", [0, 1, 2, 3, 4, 3, 2, 1], 5),
            ("windup", "attack", [1, 2, 3, 4, 5], 6),
            ("attack", "attack", [6, 7, 8], 9),
        ],
    },
}


def load(p):
    im = Image.open(p).convert("RGBA")
    im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
    # zero the colour of fully transparent texels so the PNG stays clean
    clear = Image.new("RGBA", im.size, (0, 0, 0, 0))
    return Image.composite(im, clear, im.getchannel("A"))


def anchor_of(im):
    """Feet ground point: centre x of the lowest opaque rows, y = lowest opaque row + 1."""
    a = im.getchannel("A")
    w, h = im.size
    low = max(y for y in range(h) for x in range(w) if a.getpixel((x, y)))
    xs = [x for y in range(max(0, low - 2), low + 1) for x in range(w) if a.getpixel((x, y))]
    return [round((min(xs) + max(xs)) / 2), low + 1]


def lowest(im):
    bb = im.getbbox()
    return bb[3] if bb else None


def contact(sheet, fw, fh, out, scale=2):
    cols, rows = sheet.width // fw, sheet.height // fh
    c = Image.new("RGBA", (cols * (fw + 2), rows * (fh + 2)), BG)
    for r in range(rows):
        for k in range(cols):
            c.alpha_composite(sheet.crop((k * fw, r * fh, (k + 1) * fw, (r + 1) * fh)), (k * (fw + 2), r * (fh + 2)))
    c.resize((c.width * scale, c.height * scale), Image.NEAREST).save(out)


def build_char(key, cfg):
    base = HERE / "raw" / key / "zip" / "Idle" / "animations"
    rows = []  # (anim cfg, dir, [frames])
    anims_used = []
    for a in cfg["anims"]:
        srcs = a["src"] if isinstance(a["src"], dict) else {d: a["src"] for d in DIRS}
        def path(d):
            f, _, dd = srcs[d].partition(":")
            return base / f / (dd or d)
        if not all(path(d).is_dir() for d in DIRS):
            if a.get("optional"):
                print(f"  {key}.{a['name']}: missing, skipped")
                continue
            raise SystemExit(f"{key}.{a['name']}: missing directions in {srcs}")
        anims_used.append(a)
        for d in DIRS:
            files = sorted(path(d).glob("*.png"))
            idx = a.get("frames") or range(len(files))
            rows.append((a, d, [load(files[i]) for i in idx]))
    W = max(f.width for _, _, fr in rows for f in fr)
    H = max(f.height for _, _, fr in rows for f in fr)
    placed = []
    for a, d, fr in rows:
        out = []
        for f in fr:
            c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            c.paste(f, ((W - f.width) // 2, (H - f.height) // 2))
            out.append(c)
        placed.append((a, d, out))
    # union bbox over everything, 1 texel margin
    x0, y0, x1, y1 = W, H, 0, 0
    for _, _, fr in placed:
        for f in fr:
            bb = f.getbbox()
            if bb:
                x0, y0, x1, y1 = min(x0, bb[0]), min(y0, bb[1]), max(x1, bb[2]), max(y1, bb[3])
    x0, y0, x1, y1 = max(0, x0 - 1), max(0, y0 - 1), min(W, x1 + 1), min(H, y1 + 1)
    fw, fh = x1 - x0, y1 - y0
    ncols = max(len(fr) for _, _, fr in placed)
    sheet = Image.new("RGBA", (ncols * fw, len(placed) * fh), (0, 0, 0, 0))
    entry = {"file": f"v2_{key}.png", "ppu": 32, "fw": fw, "fh": fh, "anchor": None, "dirs": DIR_KEYS, "anims": {}}
    report = []
    for r, (a, d, fr) in enumerate(placed):
        for k, f in enumerate(fr):
            sheet.alpha_composite(f.crop((x0, y0, x1, y1)), (k * fw, r * fh))
        report.append(f"    row {r:2d} {a['name']:7s} {d:10s} frames {len(fr)}  feet(bottom) {lowest(fr[0].crop((x0, y0, x1, y1)))}")
    r = 0
    for a in anims_used:
        n = len(a["frames"]) if a.get("frames") else len(placed[r][2])
        e = {"row": r, "frames": n, "fps": a["fps"]}
        if a.get("loop") is False:
            e["loop"] = False
        if "hit" in a:
            e["hit"] = a["hit"]
        entry["anims"][a["name"]] = e
        r += len(DIRS)
    idle_s = sheet.crop((0, 0, fw, fh))
    entry["anchor"] = anchor_of(idle_s)
    if cfg.get("quadruped"):
        # A quadruped's lowest texel changes a lot with facing (front paws vs rear paws nearest the camera);
        # stand it on the mean of the five idle facings so no direction floats or sinks badly.
        bottoms = [lowest(sheet.crop((0, i * fh, fw, (i + 1) * fh))) for i in range(len(DIRS))]
        entry["anchor"][1] = round(sum(bottoms) / len(bottoms))
    sheet.save(SPRITES / f"v2_{key}.png")
    contact(sheet, fw, fh, HERE / f"contact_{key}.png")
    print(f"{key}: sheet {sheet.size}, fw {fw} fh {fh}, anchor {entry['anchor']}")
    print("\n".join(report))
    return entry


def build_strip(key, cfg):
    base = HERE / "raw" / key
    frames, anims, fps = [], {}, {}
    cache = {}
    for name, folder, idx, f in cfg["anims"]:
        lst = []
        for i in idx:
            p = base / folder / f"{i:02d}.png"
            if p not in cache:
                cache[p] = len(frames)
                frames.append(load(p))
            lst.append(cache[p])
        anims[name], fps[name] = lst, f
    W = max(f.width for f in frames); H = max(f.height for f in frames)
    placed = []
    for f in frames:
        c = Image.new("RGBA", (W, H), (0, 0, 0, 0)); c.paste(f, ((W - f.width) // 2, H - f.height)); placed.append(c)
    x0, y0, x1, y1 = W, H, 0, 0
    for f in placed:
        bb = f.getbbox()
        x0, y0, x1, y1 = min(x0, bb[0]), min(y0, bb[1]), max(x1, bb[2]), max(y1, bb[3])
    x0, y0, x1, y1 = max(0, x0 - 1), max(0, y0 - 1), min(W, x1 + 1), min(H, y1 + 1)
    fw, fh = x1 - x0, y1 - y0
    sheet = Image.new("RGBA", (fw * len(placed), fh), (0, 0, 0, 0))
    for k, f in enumerate(placed):
        sheet.alpha_composite(f.crop((x0, y0, x1, y1)), (k * fw, 0))
    sheet.save(SPRITES / f"v2_{key}.png")
    contact(sheet, fw, fh, HERE / f"contact_{key}.png", 3)
    anc = anchor_of(sheet.crop((0, 0, fw, fh)))
    entry = {"file": f"v2_{key}.png", "ppu": 32, "frames": len(placed), "fw": fw, "fh": fh, "anchor": anc,
             "fps": 8, "anims": anims, "animFps": fps}
    print(f"{key}: strip {sheet.size}, {len(placed)} frames of {fw}x{fh}, anchor {anc}")
    return entry


def main(keys):
    frag = json.loads(FRAG.read_text(encoding="utf8")) if FRAG.exists() else {}
    for k in keys or list(CHARS) + list(STRIPS):
        try:
            frag[k] = build_char(k, CHARS[k]) if k in CHARS else build_strip(k, STRIPS[k])
        except SystemExit as e:
            print("skip", e)
    FRAG.write_text(json.dumps(frag, indent=2) + "\n", encoding="utf8")
    print("wrote", FRAG)


if __name__ == "__main__":
    main(sys.argv[1:])
