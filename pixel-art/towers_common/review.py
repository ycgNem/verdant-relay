"""Stack the three level previews of a tower type: python review.py scrap_turret [scale]"""
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tw import SPRITES, checker, night, ground, on_bg, up  # noqa

key = sys.argv[1]
scale = int(sys.argv[2]) if len(sys.argv) > 2 else 5
keys = [key, key + "_2", key + "_3"] if len(sys.argv) < 4 else sys.argv[3:]
rows = []
for k in keys:
    p = SPRITES / f"{k}.png"
    if not p.exists():
        continue
    st = Image.open(p).convert("RGBA")
    rows.append(st)
fh = rows[0].height
W = max(r.width for r in rows)
pad = 3
out = Image.new("RGBA", ((W * 2) * scale + pad * 3, (fh * scale + pad) * len(rows) + pad), (50, 50, 60, 255))
for i, st in enumerate(rows):
    a = on_bg(st, checker(st.width, st.height, 4))
    b = on_bg(night(st), ground(st.width, st.height))
    out.paste(up(a, scale), (pad, pad + i * (fh * scale + pad)))
    out.paste(up(b, scale), (pad * 2 + W * scale, pad + i * (fh * scale + pad)))
dst = Path(__file__).resolve().parents[1] / key / f"review_{key}.png"
out.save(dst)
print(dst)
