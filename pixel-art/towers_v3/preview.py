"""Review sheets for the V3 towers: each variant's 4 frames x4 on a plinth-coloured ground, plus the idle frame
at 1x and x2 next to a V2 enemy for scale, and a night-tinted copy (the scene's sprite tint #a9b6e6)."""
from PIL import Image, ImageDraw, ImageFont

from tlib import FW, FH, SPRITES

font = ImageFont.load_default()
TINT = (0xa9 / 255, 0xb6 / 255, 0xe6 / 255)


def night(im):
    r, g, b, a = im.split()
    r = r.point(lambda v: int(v * TINT[0]))
    g = g.point(lambda v: int(v * TINT[1]))
    b = b.point(lambda v: int(v * TINT[2]))
    return Image.merge("RGBA", (r, g, b, a))


def sheet(rows, path, scale=4):
    pad = 8
    ref = Image.open(SPRITES / "v2_crawler.png").convert("RGBA").crop((0, 0, 64, 64))
    cw = FW * scale * 4 + pad * 5 + FW * 2 + 64 + FW * 2 * 2 + pad * 3
    ch = FH * scale + pad * 2 + 12
    out = Image.new("RGBA", (cw, ch * len(rows)), (24, 24, 30, 255))
    d = ImageDraw.Draw(out)
    for r, (key, im) in enumerate(rows):
        y = r * ch + pad + 12
        d.text((pad, r * ch + 2), key, fill=(230, 226, 200, 255), font=font)
        x = pad
        for f in range(4):
            cell = Image.new("RGBA", (FW, FH), (52, 58, 50, 255))
            cell.alpha_composite(im.crop((f * FW, 0, (f + 1) * FW, FH)))
            out.alpha_composite(cell.resize((FW * scale, FH * scale), Image.NEAREST), (x, y))
            x += FW * scale + pad
        # 1x with a crawler for scale, then x2 day and x2 night-tinted
        ground = Image.new("RGBA", (FW + 64, FH), (40, 44, 38, 255))
        ground.alpha_composite(im.crop((0, 0, FW, FH)), (0, 0))
        ground.alpha_composite(ref, (FW, 0))
        out.alpha_composite(ground, (x, y))
        x += FW + 64 + pad
        for fn in (lambda i: i, night):
            cell = Image.new("RGBA", (FW, FH), (30, 36, 44, 255))
            cell.alpha_composite(fn(im.crop((0, 0, FW, FH))))
            out.alpha_composite(cell.resize((FW * 2, FH * 2), Image.NEAREST), (x, y))
            x += FW * 2 + pad
    out.save(path)
