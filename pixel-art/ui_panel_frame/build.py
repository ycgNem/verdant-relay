"""Verdant Relay - 9-slice UI panel frame (critic H #11): ui_panel_frame, 24x24, slice 8 px on every side.

Border (4 px): outer ink ring, a 2-px slate metal band (lit top/left #5a6988, base #3a4466, shaded bottom/right
#262b44), a dark gap line, then the panel interior #181425 (the colour the CSS panels use) with a 1-px teal
inner rim. Rivets sit in the top-right, bottom-left and bottom-right corners; the top-left corner carries a
small vine curl with a leaf. Corners hold all the decoration so the edge slices (the middle 8 px of each side)
are uniform and stretch or repeat cleanly.
CSS: border-image: url(sprites/ui_panel_frame.png) 8 fill / calc(8px * S) / 0 stretch; image-rendering: pixelated;
(S = whole-number texel scale).
Run: python pixel-art/ui_panel_frame/build.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
from v3lib import Grid, save_sprite, up, zoomgrid, row, SCRATCH  # noqa: E402
from PIL import Image  # noqa: E402

INK = "#0b0a12"
M_LT, M_BS, M_DK = "#5a6988", "#3a4466", "#262b44"
M_HI = "#8b9bb4"
INTERIOR = "#181425"
TEAL = "#193c3e"
V0, V1, V2, V3 = "#193c3e", "#265c42", "#3e8948", "#63c74d"


LEG = {"K": INK, "l": M_LT, "b": M_BS, "d": M_DK, "h": M_HI, "i": INTERIOR, "t": TEAL,
       "1": V1, "2": V2, "3": V3, "4": "#99e550", "0": V0}

# the top-left 8x8 corner: a leaf lying over the frame corner and a tendril curling into the panel
TL = ["KKKKKKKK",
      "K34Klllll"[:8],
      "K4332bbb",
      "KK3221KK",
      "Klb22t1t",
      "KlbK1i1i",
      "KlbKt11i",
      "KlbKtiii"]
# a bolt head on each of the other three frame corners (2x2 on the metal band, lit top-left)
BOLT = {(0, 0): "h", (1, 0): "l", (0, 1): "l", (1, 1): "d"}


def build():
    S = 24
    g = Grid(S, S)
    for y in range(S):
        for x in range(S):
            d = min(x, y, S - 1 - x, S - 1 - y)
            if d == 0 or d == 3:
                c = INK
            elif d == 1:
                c = M_DK if (y == S - 2 or x == S - 2) else M_LT
            elif d == 2:
                c = M_DK if (y == S - 3 or x == S - 3) and d == 2 and False else M_BS
            else:
                c = TEAL if ((y == 4 and 4 <= x <= S - 5) or (x == 4 and 4 <= y <= S - 5)) else INTERIOR
            g.px(x, y, c)
    for y, r in enumerate(TL):
        for x, ch in enumerate(r):
            g.px(x, y, LEG[ch])
    for (cx, cy) in ((S - 3, 1), (1, S - 3), (S - 3, S - 3)):
        for (dx, dy), ch in BOLT.items():
            g.px(cx + dx, cy + dy, LEG[ch])
    return g


def nine_slice(im, w, h, k=8):
    """Stretch-preview the 9-slice at 1x to w x h (edges repeated, like border-image round/repeat)."""
    out = Image.new("RGBA", (w, h))
    S = im.width
    c = [(0, k), (k, S - k), (S - k, S)]
    tx = [(0, k), (k, w - k), (w - k, w)]
    ty = [(0, k), (k, h - k), (h - k, h)]
    for j in range(3):
        for i in range(3):
            src = im.crop((c[i][0], c[j][0], c[i][1], c[j][1]))
            dw, dh = tx[i][1] - tx[i][0], ty[j][1] - ty[j][0]
            for yy in range(0, dh, src.height):
                for xx in range(0, dw, src.width):
                    piece = src.crop((0, 0, min(src.width, dw - xx), min(src.height, dh - yy)))
                    out.paste(piece, (tx[i][0] + xx, ty[j][0] + yy))
    return out


if __name__ == "__main__":
    g = build()
    im = g.image()
    save_sprite("ui_panel_frame", im)
    print("ui_panel_frame", im.size, "colours", len(g.colors()))
    demo = nine_slice(im, 120, 56)
    bg = Image.new("RGBA", (140, 76), (30, 50, 40, 255))
    bg.alpha_composite(demo, (10, 10))
    row([zoomgrid(im, 14, bg=(30, 50, 40)), up(bg, 4)]).save(SCRATCH / "z_panel.png")
