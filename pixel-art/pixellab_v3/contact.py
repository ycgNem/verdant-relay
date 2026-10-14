"""Contact sheet: each PixelLab raw next to its finished sprite (frame strips shown in full), 2x, labelled."""
import json
from PIL import Image, ImageDraw
from v3tools import HERE, RAW, SPRITES, SCRATCH

man = json.loads((HERE.parent / "manifest.v3env.json").read_text())
pairs = [("relay_core.png", "relay_core"), ("pylon.png", "prop_relay_pylon"), ("ruin_market.png", "ruin_market_kiosks"),
         ("ruin_flooded.png", "ruin_station_platform"), ("ruin_resi.png", "ruin_apartment_facade"),
         ("ruin_dc.png", "ruin_server_hall"), ("boss_thorn_mother.png", "boss_thorn_mother"),
         ("boss_brood_hive.png", "boss_brood_hive"), ("boss_warden.png", "boss_warden"),
         ("boss_drowned_engine.png", "boss_drowned_engine")]
rows = []
for raw, key in pairs:
    r = Image.open(RAW / raw).convert("RGBA")
    e = man[key]
    s = Image.open(SPRITES / e["file"]).convert("RGBA")
    rows.append((key, r, s, e))
S, G = 2, 10
W = max(r.width + s.width for _, r, s, _ in rows) * S + G * 4
H = sum(max(r.height, s.height) * S + 18 + G for _, r, s, _ in rows) + G
sheet = Image.new("RGBA", (W, H), (30, 40, 34, 255))
d = ImageDraw.Draw(sheet)
y = G
for key, r, s, e in rows:
    d.text((G, y), f"{key}  {e.get('fw', s.width)}x{e.get('fh', s.height)}  frames {e.get('frames', 1)}  anchor {e['anchor']}  anims {list((e.get('anims') or {}).keys())}", fill=(230, 230, 210, 255))
    y += 16
    bg = Image.new("RGBA", (r.width * S, r.height * S), (48, 60, 52, 255))
    sheet.alpha_composite(bg, (G, y))
    sheet.alpha_composite(r.resize((r.width * S, r.height * S), Image.NEAREST), (G, y))
    x = G * 3 + r.width * S
    bg = Image.new("RGBA", (s.width * S, s.height * S), (48, 60, 52, 255))
    sheet.alpha_composite(bg, (x, y))
    sheet.alpha_composite(s.resize((s.width * S, s.height * S), Image.NEAREST), (x, y))
    fw = e.get("fw", s.width)
    ax, ay = e["anchor"]
    for f in range(e.get("frames", 1)):
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            sheet.putpixel((x + (f * fw + ax) * S + dx, y + ay * S + dy), (255, 40, 40, 255))
    y += max(r.height, s.height) * S + G + 2
sheet.save(HERE / "contact_v3.png")
sheet.save(SCRATCH / "contact_v3.png")
print(sheet.size)
