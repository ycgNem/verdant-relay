"""pad.py in.png out.png W H  -> centre horizontally, bottom-align (1px margin) on a WxH transparent canvas; alpha threshold 128."""
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA"); W, H = int(sys.argv[3]), int(sys.argv[4])
a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0); im.putalpha(a)
bb = im.getbbox(); im = im.crop(bb)
c = Image.new("RGBA", (W, H), (0, 0, 0, 0)); c.paste(im, ((W - im.width) // 2, H - 2 - im.height)); c.save(sys.argv[2])
print(bb, im.size)
