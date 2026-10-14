"""Contact sheet for hand-made art batch 4 -> pixel-art/contact_v3batch4.png
Run: python pixel-art/batch4/contact.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "public" / "sprites"
M = json.loads((SPR / "manifest.json").read_text(encoding="utf8"))
font = ImageFont.load_default()
TINT = (0xa9 / 255, 0xb6 / 255, 0xe6 / 255)
BG = (52, 58, 50, 255)


def frames(key, row=0, n=None):
    e = M[key]
    im = Image.open(SPR / e["file"]).convert("RGBA")
    fw = e.get("fw") or im.width // e.get("frames", 1)
    fh = e.get("fh") or im.height
    n = n or (im.width // fw)
    return [im.crop((i * fw, row * fh, (i + 1) * fw, (row + 1) * fh)) for i in range(n)]


def night(im):
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r.point(lambda v: int(v * TINT[0])), g.point(lambda v: int(v * TINT[1])),
                                b.point(lambda v: int(v * TINT[2])), a))


def strip_of(ims, scale, gap=4, bg=BG, tint=False):
    h = max(i.height for i in ims)
    w = sum(i.width for i in ims) + gap * (len(ims) - 1)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = 0
    for i in ims:
        cell = Image.new("RGBA", i.size, bg)
        cell.alpha_composite(night(i) if tint else i)
        out.alpha_composite(cell, (x, h - i.height))
        x += i.width + gap
    return out.resize((w * scale, h * scale), Image.NEAREST)


rows = []
# 1. creatures
for k in ("seed_carrier", "ruin_guard", "burrower", "seedling"):
    rows.append((f"{k} (all frames x3 | idle x2 night beside the V2 crawler + razorback)",
                 [strip_of(frames(k), 3), strip_of([frames(k)[0], frames("crawler", 7)[0], frames("razorback", 7)[0]], 2, tint=True)]))
# 2. bosses
for k in ("boss_thorn_mother", "boss_brood_hive", "boss_warden", "boss_drowned_engine"):
    f, p2 = frames(k), frames(k + "_p2")
    rows.append((f"{k}: idle 0, attack 4, hurt 6, windup 8 9 | _p2: idle 0, attack 4, windup 9 (x2)",
                 [strip_of([f[0], f[4], f[6], f[8], f[9]], 2), strip_of([p2[0], p2[4], p2[9]], 2)]))
# 3. derived
rows.append(("crawler | thorn_stalker | bloater: idle s, walk e, attack ne (x2)",
             [strip_of([frames(k, r)[c] for r, c in ((0, 0), (7, 1), (18, 2))], 2) for k in ("crawler", "thorn_stalker", "bloater")]))
# 4. FX
rows.append(("fx_vine_snare x4 | fx_flare_ember x4 | fx_flare_pool x1 (frame 0, 1) | fx_spore_ring x1 (frames 0, 1)",
             [strip_of(frames("fx_vine_snare"), 4), strip_of(frames("fx_flare_ember"), 4),
              strip_of(frames("fx_flare_pool")[:2], 1, bg=(40, 34, 28, 255)), strip_of(frames("fx_spore_ring"), 1, bg=(74, 62, 46, 255))]))
# 5. craft icons
ks = [k for k in M if k.startswith("icon_craft_")]
rows.append(("icon_craft_* (x3 and x1)", [strip_of([frames(k)[0] for k in ks], 3, bg=(38, 34, 56, 255)),
                                         strip_of([frames(k)[0] for k in ks], 1, bg=(38, 34, 56, 255))]))
# 6. plinths + badges, 7. splats
rows.append(("plinth_stone / _timber / _rubble + rank_badge_2 / _3 (x3) | splats (x3)",
             [strip_of([frames(k)[0] for k in ("plinth_stone", "plinth_timber", "plinth_rubble", "rank_badge_2", "rank_badge_3")], 3, bg=(40, 34, 28, 255)),
              strip_of([frames(f"splat_{f}_{v}")[0] for f in ("sap", "blood", "magenta", "acid") for v in (1, 2)], 3, bg=(74, 62, 46, 255))]))

pad = 10
W = max(sum(p.width for p in parts) + pad * (len(parts) + 1) for _, parts in rows)
H = sum(max(p.height for p in parts) + 24 for _, parts in rows) + pad
out = Image.new("RGBA", (W, H), (22, 22, 28, 255))
d = ImageDraw.Draw(out)
y = pad
for title, parts in rows:
    d.text((pad, y), title, fill=(230, 226, 200, 255), font=font)
    y += 14
    x = pad
    for p in parts:
        out.alpha_composite(p, (x, y))
        x += p.width + pad
    y += max(p.height for p in parts) + 10
dst = ROOT / "pixel-art" / "contact_v3batch4.png"
out.save(dst)
print(dst, out.size)
