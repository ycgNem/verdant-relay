"""Helper: crop frames from the strip and scale for review. usage: python view.py out.png scale f1 f2 ..."""
import sys
from PIL import Image
im = Image.open('../../public/sprites/colossus.png')
out, sc = sys.argv[1], int(sys.argv[2])
fs = [int(a) for a in sys.argv[3:]]
w = 96
sheet = Image.new('RGBA', (len(fs) * (w + 4) * sc, 112 * sc), (40, 44, 52, 255))
for k, f in enumerate(fs):
    sheet.alpha_composite(im.crop((f * w, 0, f * w + w, 112)).resize((w * sc, 112 * sc), Image.NEAREST), (k * (w + 4) * sc, 0))
sheet.save(out)
