"""Room / night-map mock-ups: tiles from public/sprites + env props stamped on top.
Not a game render (billboards are drawn flat, anchored bottom-centre) - it's for judging
floor readability, district identity and prop contrast.  Run: python pixel-art/tiles/mock.py
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import ROOT, SPRITES, up, night, load_room_templates  # noqa: E402

DISTRICT_ROOMS = {
    "overgrown_market": ["street", "shop", "courtyard"],
    "flooded_transit": ["platform", "flooded", "utility"],
    "canopy_greenhouse": ["greenhouse", "courtyard"],
    "collapsed_residential": ["residential", "street"],
    "data_center": ["security", "utility"],
}


def load(key, frame=0):
    p = SPRITES / f"{key}.png"
    if not p.exists():
        return None
    im = Image.open(p).convert("RGBA")
    man = json.loads((SPRITES / "manifest.json").read_text()) if (SPRITES / "manifest.json").exists() else {}
    frames = man.get(key, {}).get("frames")
    if frames is None:
        frames = {"lamp_post": 2, "spores": 2, "alarm": 2, "water": 2}.get(key, 1)
    fw = im.width // frames
    return im.crop((frame * fw, 0, (frame + 1) * fw, im.height))


def stamp(canvas, im, cx, base_y):
    if im is None:
        return
    canvas.alpha_composite(im, (cx - im.width // 2, base_y - im.height))


def room(district, rows, seed=0):
    H, W = len(rows), len(rows[0])
    pad = 3  # rows of headroom for tall billboards
    out = Image.new("RGBA", (W * 32, (H + pad) * 32), (20, 18, 30, 255))
    tiles = {c: load(k) for c, k in ((".", f"floor_{district}"), (",", f"floor_alt_{district}"),
                                       ("#", f"wall_{district}"), ("w", "water"))}
    oy = pad * 32
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            t = tiles.get(ch) or tiles["."]
            out.alpha_composite(t, (x * 32, oy + y * 32))
    n = 0
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            cx, by = x * 32 + 16, oy + y * 32 + 32
            if ch == "x":
                stamp(out, load("spores"), cx, by)
            elif ch == "=":
                stamp(out, load("alarm"), cx, by - 12)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            cx, by = x * 32 + 16, oy + y * 32 + 28
            n += 1
            key = {"T": ["tree", "tree_2", "tree_3"][n % 3], "b": ["bush", "bush_2"][n % 2],
                   "r": ["rubble", "rubble_2"][n % 2], "k": "car_wreck", "l": "lamp_post",
                   "V": "bramble"}.get(ch)
            if key:
                stamp(out, load(key), cx, by)
    return out


def defense_map():
    src = (ROOT / "src/data/defenseMap.js").read_text(encoding="utf8")
    W = int(re.search(r"width: (\d+)", src).group(1))
    H = int(re.search(r"height: (\d+)", src).group(1))
    lanes = [json.loads("[" + m + "]") for m in re.findall(r"points: \[(.*?)\] \}", src)]
    lane_cells = set()
    for pts in lanes:
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for x in range(min(x0, x1), max(x0, x1) + 1):
                for y in range(min(y0, y1), max(y0, y1) + 1):
                    lane_cells.add((x, y))
    def pairs(name):
        i = src.index("[", src.index(name + ":"))
        depth, j = 0, i
        while True:
            depth += {"[": 1, "]": -1}.get(src[j], 0)
            j += 1
            if depth == 0:
                break
        blk = src[i:j]
        return [(int(a), int(b)) for a, b in re.findall(r"\[(-?\d+), (-?\d+)\]", blk)]
    trees, rubble = pairs("trees"), pairs("rubble")
    out = Image.new("RGBA", (W * 32, (H + 2) * 32), (20, 18, 30, 255))
    fl, alt, lane = load("floor_defense"), load("floor_alt_defense"), load("lane_defense")
    oy = 64
    import random
    r = random.Random(4)
    for y in range(H):
        for x in range(W):
            t = lane if (x, y) in lane_cells else (alt if r.random() < 0.2 else fl)
            out.alpha_composite(t, (x * 32, oy + y * 32))
    items = [(y, x, "tree" if i % 3 == 0 else ("tree_2" if i % 3 == 1 else "tree_3")) for i, (x, y) in enumerate(trees)]
    items += [(y, x, "rubble" if i % 2 else "rubble_2") for i, (x, y) in enumerate(rubble)]
    for y, x, k in sorted(items):
        stamp(out, load(k), x * 32 + 16, oy + y * 32 + 30)
    return out


def main():
    prev = HERE / "preview"
    prev.mkdir(exist_ok=True)
    temps = load_room_templates()
    for d, types in DISTRICT_ROOMS.items():
        ims = []
        for tp in types[:2]:
            rows = next(r for t, r in temps if t == tp)
            ims.append(room(d, rows))
        w = sum(i.width for i in ims) + 8
        sheet = Image.new("RGBA", (w, ims[0].height), (20, 18, 30, 255))
        x = 0
        for i in ims:
            sheet.alpha_composite(i, (x, 0))
            x += i.width + 8
        up(sheet, 2).save(prev / f"room_{d}.png")
        up(night(sheet), 2).save(prev / f"room_{d}_night.png")
    dm = defense_map()
    up(dm, 2).save(prev / "defense_map.png")
    up(night(dm), 2).save(prev / "defense_map_night.png")
    print("mockups written")


if __name__ == "__main__":
    main()
