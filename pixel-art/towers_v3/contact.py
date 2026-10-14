"""Contact sheet for the V3 towers: every type x (L1, L2, L3, 3a, 3b), idle frame 0 + attack frame 2 at x2 on the
day ground, then the same idle frames night-tinted (#a9b6e6) standing on a plinth at x2 - the defense-board read.
Run: python pixel-art/towers_v3/contact.py  ->  pixel-art/contact_v3towers.png
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "public" / "sprites"
TYPES = ["scrap_turret", "thorn_nest", "arc_spire", "snare_vine", "mortar_pod", "pulse_beacon"]
SFX = ["", "_2", "_3", "_3a", "_3b"]
LABEL = {"": "L1", "_2": "L2", "_3": "L3", "_3a": "3a", "_3b": "3b"}
TINT = (0xa9 / 255, 0xb6 / 255, 0xe6 / 255)
font = ImageFont.load_default()


def frame(key, f):
    im = Image.open(SPR / f"{key}.png").convert("RGBA")
    return im.crop((f * 48, 0, f * 48 + 48, 64))


def night(im):
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r.point(lambda v: int(v * TINT[0])), g.point(lambda v: int(v * TINT[1])),
                                b.point(lambda v: int(v * TINT[2])), a))


def plinth(w=46, top=34, face=7):
    """Approximate DefenseGround plinth (stone top + front face) for context."""
    im = Image.new("RGBA", (w + 4, top + face + 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((2, 1, w + 1, top), fill=(0x4c, 0x52, 0x4e, 255))
    d.line((2, 1, w + 1, 1), fill=(0x68, 0x70, 0x68, 255))
    d.line((2, 1, 2, top), fill=(0x68, 0x70, 0x68, 255))
    d.line((2, top // 2 + 1, w + 1, top // 2 + 1), fill=(0x3f, 0x44, 0x42, 255))
    d.rectangle((2, top + 1, w + 1, top + face), fill=(0x2f, 0x34, 0x32, 255))
    d.line((2, top + face, w + 1, top + face), fill=(0x26, 0x2a, 0x29, 255))
    return im


S = 2
CW, CH = 48 * S, 64 * S
pad = 6
cols = len(SFX) * 2
W = 90 + cols * (CW + pad) + pad
H1 = len(TYPES) * (CH + 18)
H2 = 18 + len(TYPES) * (CH + 30)
out = Image.new("RGBA", (W, H1 + H2 + 30), (22, 24, 28, 255))
d = ImageDraw.Draw(out)
y = 4
for t in TYPES:
    d.text((6, y + CH // 2), t, fill=(230, 226, 200, 255), font=font)
    x = 90
    for s in SFX:
        for f in (0, 2):
            cell = Image.new("RGBA", (48, 64), (52, 58, 50, 255))
            cell.alpha_composite(frame(t + s, f))
            out.alpha_composite(cell.resize((CW, CH), Image.NEAREST), (x, y + 12))
            d.text((x + 2, y), f"{LABEL[s]} {'idle' if f == 0 else ('atk' if t != 'pulse_beacon' else 'f2')}",
                   fill=(200, 196, 170, 255), font=font)
            x += CW + pad
    y += CH + 18
d.text((6, y + 6), "night tint on a plinth (x2), bottom row = pad centre", fill=(230, 226, 200, 255), font=font)
y += 24
pl = plinth()
for t in TYPES:
    x = 90
    d.text((6, y + CH // 2), t, fill=(230, 226, 200, 255), font=font)
    for s in SFX:
        cell = Image.new("RGBA", (64, 74), (24, 30, 40, 255))
        # plinth centred under the pad centre (= the sprite's bottom-centre)
        cell.alpha_composite(pl, (32 - pl.width // 2, 64 - (pl.height - 7) // 2 - 2))
        cell.alpha_composite(night(frame(t + s, 0)), (8, 0))
        out.alpha_composite(cell.resize((64 * S, 74 * S), Image.NEAREST), (x, y))
        x += 64 * S + pad
    y += CH + 30
out = out.crop((0, 0, W, y + 4))
dst = ROOT / "pixel-art" / "contact_v3towers.png"
out.save(dst)
print(dst, out.size)
