"""Verdant Relay - the jungle HUD's daylight icon (critic L §3: the clock had no label or icon).

ui_daylight.png: 2 frames of 12x12, hand-placed. Frame 0 = the sun (daylight left), frame 1 = a crescent moon
(after sunset). 1-px ink outline (#181425, the UI ink), Endesga-32 colours, light from the top-left, hard alpha.
Drawn in the DOM at the world's texel scale (JungleScene: --tx), like the pick_* icons.
Run: python pixel-art/ui_daylight/build.py
"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parents[2] / "public" / "sprites" / "ui_daylight.png"

PAL = {
    ".": None,
    "k": (0x18, 0x14, 0x25),   # ink outline
    "y": (0xfe, 0xe7, 0x61),   # sun light
    "a": (0xfe, 0xae, 0x34),   # sun mid
    "o": (0xf7, 0x76, 0x22),   # sun shade
    "w": (0xff, 0xff, 0xff),   # glint
    "p": (0xc0, 0xcb, 0xdc),   # moon light
    "s": (0x8b, 0x9b, 0xb4),   # moon shade
}

SUN = [
    ".k..kaak..k.",
    "kak.kaak.kak",
    ".kakkkkkkak.",
    "..kkyyyykk..",
    "kkkywyyyakkk",
    "aakyyyyaokoo",
    "aakyyyaookoo",
    "kkkyyaoookkk",
    "..kkaoookk..",
    ".kakkkkkkok.",
    "kak.kook.kok",
    ".k..kook..k.",
]

MOON = [
    "....kkkk....",
    "..kkppsk....",
    ".kppsk......",
    ".kpsk.......",
    "kppk........",
    "kpsk........",
    "kpsk........",
    "kpssk.....k.",
    ".kpssk...ksk",
    ".kspsskkkssk",
    "..kksssssk..",
    "....kkkkk...",
]


def frame(rows):
    im = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        assert len(row) == 12, (y, row)
        for x, c in enumerate(row):
            col = PAL[c]
            if col:
                im.putpixel((x, y), col + (255,))
    return im


def main():
    sheet = Image.new("RGBA", (24, 12), (0, 0, 0, 0))
    sheet.paste(frame(SUN), (0, 0))
    sheet.paste(frame(MOON), (12, 0))
    sheet.save(OUT)
    big = sheet.resize((24 * 10, 12 * 10), Image.NEAREST)
    big.save(Path(__file__).resolve().parent / "preview_x10.png")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
