"""Upscale an image with nearest-neighbour for viewing: python view.py in.png out.png [scale] [bg]"""
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
s = int(sys.argv[3]) if len(sys.argv) > 3 else 4
bg = Image.new('RGBA', im.size, (20, 40, 30, 255))
bg.alpha_composite(im)
bg.resize((im.width * s, im.height * s), Image.NEAREST).save(sys.argv[2])
