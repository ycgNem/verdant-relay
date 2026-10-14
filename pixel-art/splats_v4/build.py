"""Death splat decals per creature family (critic H2 #7): flat ground sprites, 3 tones each, pulled ~55% toward the
jungle dirt so they sit IN the ground - no navy or black step (no texel darker than dark dirt).

  splat_sap_1/2      Crawler (sap brown-green)
  splat_blood_1/2    Feral / Razorback (dark red)
  splat_magenta_1/2  Skitter (magenta)
  splat_acid_1/2     Spitter (acid green)
All 24x16, flat (top-down on the ground), centred. Run: python pixel-art/splats_v4/build.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "creatures_v3"))
from crlib import Grid, h2, save_sprite, SCRATCH  # noqa: E402

W, H = 24, 16
FAMILIES = {
    "sap": ("#3e3c22", "#5a5a2e", "#7e7c40"),
    "blood": ("#4c2018", "#6c2c22", "#8e4030"),
    "magenta": ("#4c2438", "#6c324a", "#8e4a64"),
    "acid": ("#40481e", "#5c6c28", "#82963a"),
}


def splat(fam, v):
    dark, mid, light = FAMILIES[fam]
    g = Grid(W, H)
    seed = 7 + v * 13 + sum(map(ord, fam))
    ang = (h2(v, 1, seed) - 0.5) * 1.2                         # the splash streaks one way
    blobs = [(12.0, 8.0, 4.6, 3.4)]
    for k in range(5):
        a = ang + (h2(k, 2, seed) - 0.5) * 2.4
        d = 2.5 + h2(k, 3, seed) * 4.0
        blobs.append((12 + math.cos(a) * d * 1.3, 8 + math.sin(a) * d * 0.8, 1.6 + h2(k, 4, seed) * 2.2, 1.2 + h2(k, 5, seed) * 1.6))
    m = set()
    for (cx, cy, rx, ry) in blobs:
        for y in range(H):
            for x in range(W):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    m.add((x, y))
    for k in range(6):                                          # droplets flung along the streak
        a = ang + (h2(k, 6, seed) - 0.5) * 0.9
        d = 7.5 + h2(k, 7, seed) * 3.5
        x, y = int(12 + math.cos(a) * d * 1.3), int(8 + math.sin(a) * d * 0.7)
        if 0 <= x < W and 0 <= y < H:
            m.add((x, y))
            if k % 2 == 0 and x + 1 < W:
                m.add((x + 1, y))
    for (x, y) in m:
        edge = (x + 1, y) not in m or (x, y + 1) not in m
        g.px(x, y, dark if edge else mid)
    for (x, y) in m:                                            # wet glints on the upper-left of the big blobs
        if (x - 1, y) in m and (x, y - 1) in m and (x + 1, y) in m and (x, y + 1) in m and h2(x, y, seed + 9) < 0.18:
            g.px(x, y, light)
    g.px(10, 6, light) if (10, 6) in m else None
    return g


def main():
    from PIL import Image
    out = Image.new("RGBA", (8 * (W + 4), H + 4), (74, 62, 46, 255))
    i = 0
    for fam in FAMILIES:
        for v in (1, 2):
            g = splat(fam, v)
            im = g.image()
            save_sprite(f"splat_{fam}_{v}", im)
            out.alpha_composite(im, (2 + i * (W + 4), 2))
            i += 1
    out.resize((out.width * 5, out.height * 5), Image.NEAREST).save(SCRATCH / "splats_v4.png")
    print("8 splats")


if __name__ == "__main__":
    main()
