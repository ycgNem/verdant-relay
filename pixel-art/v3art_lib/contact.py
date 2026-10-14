"""Contact sheet for the V3 hand-made batch -> pixel-art/contact_v3art.png (+ a copy in .playwright-mcp/art1/).

Shows every key at 1x and enlarged, plus in-context mock-ups: the leaf frame around a real 640x360 day frame,
the spore pod among ferns, the ripple/splash under a wading player (sprite clipped 8 texels above the feet,
as critic H #6 proposes), the puffs instanced into a cloud, the logo over the title backdrop.
Run: python pixel-art/v3art_lib/contact.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SP = ROOT / "public" / "sprites"
SCR = ROOT / ".playwright-mcp" / "art1"
font = ImageFont.load_default()


def img(k):
    return Image.open(SP / f"{k}.png").convert("RGBA")


def up(im, s):
    return im.resize((im.width * s, im.height * s), Image.NEAREST)


def frames(k, n):
    im = img(k)
    w = im.width // n
    return [im.crop((i * w, 0, (i + 1) * w, im.height)) for i in range(n)]


def label(d, xy, t):
    d.text(xy, t, fill=(230, 226, 200, 255), font=font)


W = 1400
sheet = Image.new("RGBA", (W, 2330), (24, 22, 32, 255))
d = ImageDraw.Draw(sheet)
y = 10
label(d, (10, y), "Verdant Relay - V3 hand-made art batch (critic H): leaf frame, water fx, spore pod/puffs, logo, icons, panel")
y += 20

# 1) leaf frame in context (x2) + the five pieces lifted (values x5) at 1x
ctx = Image.open(SCR / "fg_leaf_context.png").convert("RGBA")
sheet.alpha_composite(ctx.resize((960, 540), Image.NEAREST) if ctx.width != 960 else ctx, (10, y))
label(d, (980, y), "fg_leaf_1..5 in context (x1.5 of 640x360)")
x = 980
yy = y + 16
for i in range(1, 6):
    im = img(f"fg_leaf_{i}")
    r, g, b, a = im.split()
    lift = Image.merge("RGBA", [c.point(lambda v: min(255, v * 5)) for c in (r, g, b)] + [a])
    bg = Image.new("RGBA", im.size, (200, 196, 180, 255))
    bg.alpha_composite(lift)
    if x + im.width > W - 10:
        x = 980
        yy += 170
    sheet.alpha_composite(bg, (x, yy))
    label(d, (x, yy + im.height + 1), f"fg_leaf_{i} {im.width}x{im.height} (lifted x5)")
    x += im.width + 10
y += 560

# 2) water: frames x6 on water + a wading player mock-up x3
WATER = (3, 57, 46, 255)
label(d, (10, y), "fx_ripple 24x8 x3 (loop 6 fps)  /  fx_splash 16x16 x4 (one-shot 12 fps)  - x6 on water_mud water")
y += 14
x = 10
for f in frames("fx_ripple", 3):
    bg = Image.new("RGBA", (f.width + 4, f.height + 4), WATER)
    bg.alpha_composite(f, (2, 2))
    sheet.alpha_composite(up(bg, 6), (x, y))
    x += (f.width + 4) * 6 + 8
for f in frames("fx_splash", 4):
    bg = Image.new("RGBA", (f.width + 4, f.height + 4), WATER)
    bg.alpha_composite(f, (2, 2))
    sheet.alpha_composite(up(bg, 6), (x, y))
    x += (f.width + 4) * 6 + 8
y += 130
ford = Image.open(SCR / "bg_ford_1x.png").convert("RGBA").crop((360, 170, 520, 250))
pl = img("v2_player").crop((0, 0, 64, 64))
for k in range(64):
    for j in range(47, 64):
        pl.putpixel((k, j), (0, 0, 0, 0))
mock = ford.copy()
rip = frames("fx_ripple", 3)[1]
mock.alpha_composite(rip, (40 - 12, 60 - 4 - 7))   # ring centred on the waterline (7 texels above the feet)
mock.alpha_composite(pl, (40 - 32, 60 - 54))
spl = frames("fx_splash", 4)[1]
mock.alpha_composite(spl, (110 - 8, 58 - 9))
sheet.alpha_composite(up(mock, 3), (10, y))
label(d, (500, y), "mock-up x3: wading player (clipped 8 texels above the feet)")
label(d, (500, y + 14), "ripple centred on the waterline; fx_splash frame 1 at right")
y += 250

# 3) spore pod + puffs
label(d, (10, y), "spore_pod 20x20: idle 0-1, swell 2-3 (anchor [10,19])  /  spore_puff_1..3 32x24  /  pod among ferns x3  /  cloud of 7 puffs x3")
y += 14
x = 10
for f in frames("spore_pod", 4):
    bg = Image.new("RGBA", f.size, (40, 70, 48, 255))
    bg.alpha_composite(f)
    sheet.alpha_composite(up(bg, 5), (x, y))
    x += f.width * 5 + 6
for i in (1, 2, 3):
    p = img(f"spore_puff_{i}")
    bg = Image.new("RGBA", p.size, (40, 70, 48, 255))
    bg.alpha_composite(p)
    sheet.alpha_composite(up(bg, 4), (x, y))
    x += p.width * 4 + 6
y += 104
jungle = Image.open(SCR / "bg_jungle_1x.png").convert("RGBA").crop((380, 200, 540, 280))
pf = frames("spore_pod", 4)
jungle.alpha_composite(pf[0], (40, 30))
jungle.alpha_composite(pf[3], (100, 40))
sheet.alpha_composite(up(jungle, 3), (10, y))
cloud = Image.new("RGBA", (120, 70), (38, 62, 44, 255))
puffs = [img(f"spore_puff_{i}") for i in (1, 2, 3)]
for k, (px, py) in zip([0, 1, 2, 0, 1, 2, 1], [(6, 26), (36, 30), (66, 22), (24, 10), (52, 8), (80, 32), (44, 36)]):
    cloud.alpha_composite(puffs[k], (px, py))
sheet.alpha_composite(up(cloud, 3), (510, y))
y += 250

# 4) logo over the title backdrop x2 and 1x
logo = img("ui_logo")
bd = Image.open(SCR / "bg_jungle_1x.png").convert("RGBA").crop((0, 0, 340, 110))
bd.alpha_composite(Image.new("RGBA", bd.size, (11, 10, 18, 200)))
bd.alpha_composite(logo, (10, 7))
sheet.alpha_composite(up(bd, 2), (10, y))
label(d, (700, y), "ui_logo 320x96 (DOM, shown at the world texel scale: x2 at 720p, x3 at 1080p)")
sheet.alpha_composite(logo, (700, y + 20))
y += 230

# 5) icons x3 + 1x, panel frame x4 + a 9-slice stretch
keys = json.loads((ROOT / "pixel-art" / "manifest.v3art.json").read_text())
icons = [k for k in keys if k.startswith("icon_")]
label(d, (10, y), f"{len(icons)} icons (24x24, icon_lock 7x9) x3 on the panel colour, and 1x")
y += 14
x = 10
for k in icons:
    im = img(k)
    bg = Image.new("RGBA", (26, 26), (38, 43, 68, 255))
    bg.alpha_composite(im, ((26 - im.width) // 2, (26 - im.height) // 2))
    if x + 78 > W - 10:
        x = 10
        y += 100
    sheet.alpha_composite(up(bg, 3), (x, y))
    sheet.alpha_composite(im, (x, y + 80))
    label(d, (x + 28, y + 80), k.replace("icon_", "").replace("district_", "d_")[:16])
    x += 108
y += 112
pf_ = img("ui_panel_frame")
sheet.alpha_composite(up(pf_, 4), (10, y))
import sys
sys.path.insert(0, str(ROOT / "pixel-art" / "ui_panel_frame"))
from build import nine_slice  # noqa: E402
st = nine_slice(pf_, 160, 64)
sheet.alpha_composite(up(st, 3), (130, y))
label(d, (620, y), "ui_panel_frame 24x24, 9-slice at 8 px (x4), stretched to 160x64 (x3)")

out = ROOT / "pixel-art" / "contact_v3art.png"
sheet.crop((0, 0, W, y + 200)).save(out)
sheet.crop((0, 0, W, y + 200)).save(SCR / "contact_v3art.png")
print(out)
