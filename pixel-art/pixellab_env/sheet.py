"""python sheet.py out.png scale cols img1 img2 ... -> preview sheet on dark green"""
import sys
from PIL import Image
out, s, cols = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
ims = [Image.open(p).convert('RGBA') for p in sys.argv[4:]]
cw = max(i.width for i in ims) + 4; ch = max(i.height for i in ims) + 4
rows = (len(ims) + cols - 1) // cols
W = Image.new('RGBA', (cw * cols, ch * rows), (22, 44, 32, 255))
for k, im in enumerate(ims):
    W.alpha_composite(im, ((k % cols) * cw + 2, (k // cols) * ch + 2))
W.resize((W.width * s, W.height * s), Image.NEAREST).save(out)
