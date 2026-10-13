"""Render a random dual-grid terrain preview from public/terrain: python preview_terrain.py out.png [paving]"""
import json, math, random, sys
from pathlib import Path
from PIL import Image
T = Path(__file__).resolve().parents[2] / "public" / "terrain"
man = json.loads((T / "manifest.json").read_text())
use_paving = len(sys.argv) > 2
names = ["water", "mud", "paving" if use_paving else "dirt", "floor", "moss"]
lut = {}
for s, e in man["sets"].items():
    sheet = Image.open(T / e["png"]).convert("RGBA")
    meta = json.loads((T / e["meta"]).read_text())
    for t in meta["tileset_data"]["tiles"]:
        c = t["corners"]; b = t["bounding_box"]
        key = (e["lower"], e["upper"], c["NW"], c["NE"], c["SW"], c["SE"])
        lut[key] = sheet.crop((b["x"], b["y"], b["x"] + 32, b["y"] + 32))
W, H = 24, 16
random.seed(3)
ph = [random.random() * 6 for _ in range(4)]
v = [[max(0, min(4, round(2.2 + 1.6 * math.sin(x * .35 + ph[0]) * math.cos(y * .4 + ph[1]) + .9 * math.sin(x * .9 + y * .7 + ph[2])))) for x in range(W + 1)] for y in range(H + 1)]
for _ in range(6):  # enforce neighbour diff <= 1
    for y in range(H + 1):
        for x in range(W + 1):
            for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
                X, Y = x + dx, y + dy
                if 0 <= X <= W and 0 <= Y <= H and abs(v[y][x] - v[Y][X]) > 1:
                    v[Y][X] = v[y][x] + (1 if v[Y][X] > v[y][x] else -1)
img = Image.new("RGBA", (W * 32, H * 32))
for y in range(H):
    for x in range(W):
        cs = [v[y][x], v[y][x + 1], v[y + 1][x], v[y + 1][x + 1]]
        lo = min(cs); lo = min(lo, 3)
        lower, upper = names[lo], names[lo + 1]
        key = (lower, upper) + tuple("upper" if c > lo else "lower" for c in cs)
        tile = lut.get(key)
        if tile is None and lo > 0:  # all-equal at top level: use previous set's all-upper
            key = (names[lo - 1], names[lo]) + ("upper",) * 4
            tile = lut.get(key)
        if tile is not None:
            img.paste(tile, (x * 32, y * 32))
img.resize((img.width * 2, img.height * 2), Image.NEAREST).save(sys.argv[1])
