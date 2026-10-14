"""Contact sheet: the 24 relic icons (x4, grouped by rarity, then x1) and the 3 Relay Protocol icons.
Run: python pixel-art/ui_relics/contact.py  ->  pixel-art/contact_v3relics.png
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "public" / "sprites"
GROUPS = [
    ("common", ["whetstone", "tapir_boots", "lantern_moth", "bramble_gloves", "spore_sac", "featherfoot", "medic_satchel",
                "cracked_lens", "old_battery", "seed_bank", "rusted_bell"]),
    ("rare", ["compass", "hunters_fang", "ironwood_grip", "drone_tag", "second_wind", "pylon_coil", "root_heart", "capacitor",
              "signal_booster"]),
    ("cursed", ["hungry_idol", "blood_moss", "glass_machete", "storm_totem"]),
]
PROTO = ["icon_protocol_snare", "icon_protocol_arc", "icon_protocol_flare"]
font = ImageFont.load_default()
S, pad, cell = 4, 10, 24 * 4
cols = 11
W = pad + cols * (cell + pad)
out = Image.new("RGBA", (W, 900), (24, 20, 37, 255))
d = ImageDraw.Draw(out)
y = 6
for name, ids in GROUPS:
    d.text((pad, y), f"{name} ({len(ids)})", fill=(234, 212, 170, 255), font=font)
    y += 14
    for i, rid in enumerate(ids):
        im = Image.open(SPR / f"relic_{rid}.png").convert("RGBA")
        x = pad + i * (cell + pad)
        out.alpha_composite(im.resize((cell, cell), Image.NEAREST), (x, y))
        d.text((x, y + cell + 2), rid[:16], fill=(192, 203, 220, 255), font=font)
    y += cell + 18
d.text((pad, y), "x1 (as the game shows them at the smallest UI scale)", fill=(234, 212, 170, 255), font=font)
y += 14
x = pad
for name, ids in GROUPS:
    for rid in ids:
        out.alpha_composite(Image.open(SPR / f"relic_{rid}.png").convert("RGBA"), (x, y))
        x += 28
y += 34
d.text((pad, y), "Relay Protocol ability icons (x4, x2, x1)", fill=(234, 212, 170, 255), font=font)
y += 14
for i, k in enumerate(PROTO):
    im = Image.open(SPR / f"{k}.png").convert("RGBA")
    x = pad + i * (cell + 48 + 24 + pad * 3)
    out.alpha_composite(im.resize((cell, cell), Image.NEAREST), (x, y))
    out.alpha_composite(im.resize((48, 48), Image.NEAREST), (x + cell + pad, y + cell - 48))
    out.alpha_composite(im, (x + cell + 48 + pad * 2, y + cell - 24))
    d.text((x, y + cell + 2), k, fill=(192, 203, 220, 255), font=font)
y += cell + 20
out = out.crop((0, 0, W, y))
dst = ROOT / "pixel-art" / "contact_v3relics.png"
out.save(dst)
print(dst, out.size)
