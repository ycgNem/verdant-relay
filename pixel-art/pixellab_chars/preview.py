"""Tile PNGs side by side at N x nearest on a dark green bg. usage: preview.py out.png scale img1 img2 ..."""
import sys
from PIL import Image
out, s, paths = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(p).convert("RGBA") for p in paths]
W = sum(i.width for i in ims) + 2 * len(ims); H = max(i.height for i in ims)
c = Image.new("RGBA", (W, H), (24, 44, 30, 255)); x = 0
for i in ims:
    c.alpha_composite(i, (x, 0)); x += i.width + 2
c.resize((W * s, H * s), Image.NEAREST).save(out)
