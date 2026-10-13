"""findoff.py big.png small.png -> offset where small best matches inside big (opaque-pixel diff)."""
import sys
from PIL import Image, ImageChops
b = Image.open(sys.argv[1]).convert("RGBA"); s = Image.open(sys.argv[2]).convert("RGBA")
best = None
for oy in range(b.height - s.height + 1):
    for ox in range(b.width - s.width + 1):
        c = b.crop((ox, oy, ox + s.width, oy + s.height))
        d = sum(ImageChops.difference(c, s).convert("L").getdata())
        if best is None or d < best[0]: best = (d, ox, oy)
print(sys.argv[1], b.size, s.size, "best offset", best[1:], "centred would be", ((b.width - s.width) // 2, (b.height - s.height) // 2), "diff", best[0])
