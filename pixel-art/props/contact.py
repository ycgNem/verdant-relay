"""Contact sheet for the props group: every frame of every key at 4x, labelled, on a busy
floor, with a 32px (1 tile) scale bar. Also writes pixel-art/manifest.props.json.
Run: python pixel-art/props/contact.py
"""
import json
from common import ROOT, SPRITES, _floor
from PIL import Image, ImageDraw, ImageFont

KEYS = {
    # key: (frame_w, frames, anims, extra)
    "crate": (24, 1, None, {}),
    "chest": (28, 1, None, {}),
    "cache": (28, 1, None, {}),
    "opened": (24, 1, None, {}),
    "intel_terminal": (24, 2, {"idle": [0, 1]}, {"fps": 2}),
    "fuse": (12, 2, {"idle": [0, 1]}, {"fps": 4, "shadow": 0.18}),
    "power_box": (28, 2, {"off": [0], "on": [1]}, {}),
    "terminal": (32, 4, {"off": [0, 1], "on": [2, 3]}, {"fps": 3}),
    "pump": (28, 3, {"off": [0], "on": [1, 2]}, {}),
    "cell_cache": (32, 2, {"off": [0], "on": [1]}, {}),
    "nest": (40, 2, {"idle": [0, 1]}, {"fps": 2}),
    "data_log": (14, 2, {"idle": [0, 1]}, {"fps": 3, "shadow": 0.18}),
    "locked_cache": (32, 2, {"off": [0], "on": [1]}, {}),
    "workbench": (40, 1, None, {}),
    "surge_box": (28, 4, {"off": [0, 1], "on": [2, 3]}, {"fps": 8, "animFps": {"off": 3}}),
    "pick_scrap": (12, 2, {"idle": [0, 0, 0, 0, 1]}, {"fps": 6, "shadow": 0.18}),
    "pick_circuits": (12, 2, {"idle": [0, 0, 0, 0, 1]}, {"fps": 6, "shadow": 0.18}),
    "pick_biofiber": (12, 2, {"idle": [0, 0, 0, 0, 1]}, {"fps": 6, "shadow": 0.18}),
    "pick_intel": (12, 2, {"idle": [0, 0, 0, 0, 1]}, {"fps": 6, "shadow": 0.18}),
    "pick_med": (12, 2, {"idle": [0, 0, 0, 0, 1]}, {"fps": 6, "shadow": 0.18}),
}


def manifest():
    out = {}
    for key, (fw, n, anims, extra) in KEYS.items():
        im = Image.open(SPRITES / f"{key}.png")
        assert im.width == fw * n, (key, im.width, fw, n)
        e = {"file": f"{key}.png", "ppu": 32, "frames": n, "fps": extra.get("fps", 6)}
        if anims:
            e["anims"] = anims
        if "animFps" in extra:
            e["animFps"] = extra["animFps"]
        if "shadow" in extra:
            e["shadow"] = extra["shadow"]
        out[key] = e
    (ROOT / "pixel-art" / "manifest.props.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf8")
    print("manifest.props.json:", len(out), "entries")


def sheet(scale=4):
    font = ImageFont.load_default()
    cells = []
    for key, (fw, n, _, _) in KEYS.items():
        im = Image.open(SPRITES / f"{key}.png").convert("RGBA")
        cells.append((key, im, fw, n))
    pad, lab = 8, 14
    maxw = 640
    rows, row, x = [], [], 0
    for c in cells:
        w = (c[1].width + 4 * (c[3] - 1) + 8) * scale
        if x + w > maxw * scale // 2 * 2 and row:
            rows.append(row)
            row, x = [], 0
        row.append(c)
        x += w + pad
    rows.append(row)
    rowh = [max(c[1].height for c in r) * scale + 8 * scale + lab for r in rows]
    W = maxw * scale // 2 * 2 + pad * 2
    H = sum(rowh) + pad * (len(rows) + 1) + 30
    out = Image.new("RGB", (W, H), (36, 34, 44))
    d = ImageDraw.Draw(out)
    d.text((pad, 6), "props group  |  4x  |  bar = 32px (1 tile)", fill=(230, 230, 230), font=font)
    d.rectangle([W - pad - 32 * scale, 10, W - pad, 14], fill=(254, 174, 52))
    y = 30
    for r, rh in zip(rows, rowh):
        x = pad
        for key, im, fw, n in r:
            gw = fw * n + 4 * (n - 1) + 8
            gh = im.height + 8
            bg = _floor(gw, gh, seed=5).convert("RGBA")
            for i in range(n):
                fr = im.crop((i * fw, 0, (i + 1) * fw, im.height))
                bg.alpha_composite(fr, (4 + i * (fw + 4), 4))
            big = bg.resize((gw * scale, gh * scale), Image.NEAREST)
            out.paste(big.convert("RGB"), (x, y + lab))
            d.text((x, y + 1), f"{key} {fw}x{im.height} x{n}", fill=(240, 240, 240), font=font)
            x += gw * scale + pad
        y += rh + pad
    p = ROOT / "pixel-art" / "contact_props.png"
    out.save(p)
    print("contact ->", p, out.size)


if __name__ == "__main__":
    manifest()
    sheet()
