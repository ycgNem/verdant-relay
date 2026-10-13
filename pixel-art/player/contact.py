"""Contact sheet for the 'chars' group -> pixel-art/contact_chars.png (4x, dark green bg, labelled).
Row 1 of each sprite: all frames in strip order; anim names under the frames.
A final row shows one idle frame of every sprite side by side at the same scale (scale check)."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SP = ROOT / "public" / "sprites"
man = json.loads((ROOT / "pixel-art" / "manifest.chars.json").read_text(encoding="utf8"))
KEYS = ["player", "scav", "crawler", "skitter", "spitter", "razorback"]
S = 4
BG = (25, 60, 62)
font = ImageFont.load_default()

rows = []
for k in KEYS:
    e = man[k]
    im = Image.open(SP / e["file"]).convert("RGBA")
    n = e["frames"]
    fw = im.width // n
    rows.append((k, e, im, n, fw))

W = max(n * (fw * S + 6) for _, _, _, n, fw in rows) + 20
lineup_h = max(im.height for _, _, im, _, _ in rows) * S + 30
H = sum(im.height * S + 40 for _, _, im, _, _ in rows) + lineup_h + 20
sheet = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sheet)
y = 10
for k, e, im, n, fw in rows:
    d.text((10, y), "%s  %dx%d  %d frames" % (k, fw, im.height, n), fill=(234, 212, 170), font=font)
    y += 14
    names = {}
    for a, idx in e["anims"].items():
        for i in idx:
            names[i] = a
    for i in range(n):
        fr = im.crop((i * fw, 0, (i + 1) * fw, im.height)).resize((fw * S, im.height * S), Image.NEAREST)
        x = 10 + i * (fw * S + 6)
        sheet.paste(fr, (x, y), fr)
        d.text((x, y + im.height * S + 2), "%d %s" % (i, names.get(i, "")), fill=(139, 155, 180), font=font)
    y += im.height * S + 26
d.text((10, y), "scale line-up (idle frame 0, shared ground line)", fill=(234, 212, 170), font=font)
y += 14
base = y + max(im.height for _, _, im, _, _ in rows) * S
x = 10
for k, e, im, n, fw in rows:
    fr = im.crop((0, 0, fw, im.height)).resize((fw * S, im.height * S), Image.NEAREST)
    sheet.paste(fr, (x, base - im.height * S), fr)
    x += fw * S + 8
d.line([(10, base), (x, base)], fill=(62, 137, 72))
out = ROOT / "pixel-art" / "contact_chars.png"
sheet.save(out)
print("contact ->", out, sheet.size)
