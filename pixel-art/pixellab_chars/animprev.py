"""animprev.py <animdir> <out.png> [scale]: rows = s se e ne n, columns = frames."""
import sys, os
from PIL import Image
d, out = sys.argv[1], sys.argv[2]; s = int(sys.argv[3]) if len(sys.argv) > 3 else 3
dirs = ["south", "south-east", "east", "north-east", "north"]
rows = []
for dd in dirs:
    p = os.path.join(d, dd)
    fr = sorted(os.listdir(p)) if os.path.isdir(p) else []
    rows.append([Image.open(os.path.join(p, f)).convert("RGBA") for f in fr])
fw = max(i.width for r in rows for i in r); fh = max(i.height for r in rows for i in r)
n = max(len(r) for r in rows)
c = Image.new("RGBA", (n * (fw + 2), len(rows) * (fh + 2)), (24, 44, 30, 255))
for y, r in enumerate(rows):
    for x, im in enumerate(r): c.alpha_composite(im, (x * (fw + 2), y * (fh + 2)))
c.resize((c.width * s, c.height * s), Image.NEAREST).save(out); print(fw, fh, [len(r) for r in rows])
