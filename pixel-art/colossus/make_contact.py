"""Contact sheet for the "night" group -> pixel-art/contact_night.png
Every sprite/frame at 3x on a dark blue-green ground, labelled per anim, sharing one
baseline per row so relative scale is honest. Second copy of each row is night-tinted."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "public" / "sprites"
man = json.loads((ROOT / "pixel-art" / "manifest.night.json").read_text())
ORDER = ["survivor", "seedling", "seed_carrier", "burrower", "ruin_guard", "colossus"]
SC = 3
BG = (22, 40, 40, 255)
font = ImageFont.load_default()


def tint(im, t=(0.55, 0.68, 1.0)):
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r.point(lambda v: int(v * t[0])), g.point(lambda v: int(v * t[1])),
                                b.point(lambda v: int(v * t[2])), a))


rows = []
for key in ORDER:
    e = man[key]
    strip = Image.open(SPR / e["file"]).convert("RGBA")
    n = e["frames"]
    fw, fh = strip.width // n, strip.height
    labels = {}
    for name, idx in e["anims"].items():
        for j, f in enumerate(idx):
            labels[f] = "%s%d" % (name, j)
    gap = 4
    w = n * (fw + gap) * SC + 120
    h = (fh * SC + 16) * 2 + 10
    row = Image.new("RGBA", (w, h), BG)
    d = ImageDraw.Draw(row)
    d.text((4, 4), "%s %dx%d" % (key, fw, fh), fill=(230, 230, 230), font=font)
    for f in range(n):
        fr = strip.crop((f * fw, 0, f * fw + fw, fh)).resize((fw * SC, fh * SC), Image.NEAREST)
        x = 120 + f * (fw + gap) * SC
        d.text((x, 2), labels.get(f, str(f)), fill=(200, 220, 210), font=font)
        row.alpha_composite(fr, (x, 14))
        row.alpha_composite(tint(fr), (x, 14 + fh * SC + 18))
        # ground line
        d.line([(x - 2, 14 + fh * SC), (x + fw * SC + 2, 14 + fh * SC)], fill=(60, 90, 80))
    rows.append(row)

W = max(r.width for r in rows)
H = sum(r.height for r in rows) + 8 * len(rows)
sheet = Image.new("RGBA", (W, H), (14, 26, 28, 255))
y = 0
for r in rows:
    sheet.alpha_composite(r, (0, y))
    y += r.height + 8
out = ROOT / "pixel-art" / "contact_night.png"
sheet.convert("RGB").save(out)
print("contact ->", out, sheet.size)

# scale-comparison strip: all idle frame 0 side by side at 3x on one baseline
idles = []
for key in ORDER:
    e = man[key]
    strip = Image.open(SPR / e["file"]).convert("RGBA")
    fw = strip.width // e["frames"]
    idles.append(strip.crop((0, 0, fw, strip.height)))
Wc = sum(i.width for i in idles) + 8 * len(idles) + 8
Hc = max(i.height for i in idles) + 8
cmp_ = Image.new("RGBA", (Wc, Hc), BG)
x = 4
for i in idles:
    cmp_.alpha_composite(i, (x, Hc - 4 - i.height))
    x += i.width + 8
cmp_.resize((Wc * 3, Hc * 3), Image.NEAREST).convert("RGB").save(Path(__file__).parent / "scale_compare.png")
