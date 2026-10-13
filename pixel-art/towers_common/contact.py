"""Contact sheet for the towers group + manifest fragment.

python pixel-art/towers_common/contact.py
  -> pixel-art/contact_towers.png  (night-tinted, labelled, 3x)
  -> pixel-art/manifest.towers.json (merged from each dir's manifest_part.json)
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tw import SPRITES, night, ground, up, label_font  # noqa

ART = Path(__file__).resolve().parents[1]
TYPES = ["scrap_turret", "thorn_nest", "arc_spire", "snare_vine", "mortar_pod", "pulse_beacon"]
S = 3


def frames_of(key, man):
    st = Image.open(SPRITES / f"{key}.png").convert("RGBA")
    n = man[key].get("frames", 1)
    fw = st.width // n
    return [st.crop((i * fw, 0, i * fw + fw, st.height)) for i in range(n)]


def main():
    man = {}
    for d in TYPES + ["relay_core", "tower_base", "beacon"]:
        man.update(json.loads((ART / d / "manifest_part.json").read_text()))
    (ART / "manifest.towers.json").write_text(json.dumps(man, indent=2) + "\n")

    pad = Image.open(SPRITES / "tower_base.png").convert("RGBA")
    # the decal lies on the floor: foreshorten it like the ~55 deg camera does
    pad_f = pad.resize((32, 26), Image.NEAREST)
    font = label_font()
    cell_w, cell_h = 32 * 3 + 16, 60 + 6
    W = 120 + cell_w * 3 * S
    H = 40 + len(TYPES) * (cell_h * S + 20) + 140 * S + 20
    sheet = Image.new("RGBA", (W, H), (22, 24, 34, 255))
    g = ground(W // S + 1, H // S + 1, seed=9)
    floor = SPRITES / "floor_defense.png"
    if floor.exists():
        ft = Image.open(floor).convert("RGBA").crop((0, 0, 32, 32))
        g = Image.new("RGBA", (W // S + 32, H // S + 32))
        for yy in range(0, g.height, 32):
            for xx in range(0, g.width, 32):
                g.paste(ft, (xx, yy))
        g = night(g)
    sheet.paste(up(g, S).crop((0, 0, W, H)), (0, 0))
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), "Verdant Relay - towers group (night tint, %dx). Each cell: idle frames + attack/pulse frame on a pad" % S,
           fill=(230, 230, 240), font=font)
    y = 40
    for t in TYPES:
        d.text((10, y + 20), t, fill=(240, 240, 250), font=font)
        for lv in (1, 2, 3):
            key = t if lv == 1 else f"{t}_{lv}"
            fr = frames_of(key, man)
            anims = man[key].get("anims", {})
            pick = [anims["idle"][0]]
            if "attack" in anims:
                pick.append(anims["attack"][0])
            else:
                pick.append(anims["idle"][2])
            x = 120 + (lv - 1) * cell_w * S
            d.text((x, y), f"L{lv}", fill=(200, 200, 210), font=font)
            for j, fi in enumerate(pick):
                cell = Image.new("RGBA", (34, 60), (0, 0, 0, 0))
                cell.alpha_composite(night(pad_f), (1, 30))
                spr = night(fr[fi])
                cell.alpha_composite(spr, (1, 0))
                sheet.alpha_composite(up(cell, S), (x + j * 36 * S, y + 14))
        y += cell_h * S + 20
    # core, pad, beacon
    d.text((10, y), "relay_core (4f pulse)  |  tower_base  |  beacon (on/off)", fill=(240, 240, 250), font=font)
    y += 18
    core = frames_of("relay_core", man)
    for i, f in enumerate(core):
        sheet.alpha_composite(up(night(f), 2), (10 + i * 100 * 2, y))
    x = 10 + 4 * 200 + 10
    sheet.alpha_composite(up(night(pad), S), (x, y + 10))
    b = frames_of("beacon", man)
    for i, f in enumerate(b):
        sheet.alpha_composite(up(night(f), S), (x + 110 + i * 80, y))
    out = ART / "contact_towers.png"
    sheet.convert("RGB").save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
