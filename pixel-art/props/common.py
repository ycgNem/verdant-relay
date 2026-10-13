"""Shared helpers for the props group (interactables + pickups).

Every build script in pixel-art/props/ imports this. It wires up pixelstudio, names the
Endesga-32 colours used by the props, and handles export: 1x master strip to
public/sprites/<key>.png, a review sheet (checker / busy floor / night tint) and a GIF.
"""
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_local = ROOT / ".claude/skills/pixel-art-studio/scripts"
sys.path.insert(0, str(_local if _local.exists() else Path.home() / ".claude/skills/pixel-art-studio/scripts"))
from pixelstudio import Sprite, PALETTES  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

HERE = Path(__file__).resolve().parent
SPRITES = ROOT / "public" / "sprites"
REVIEW = HERE / "review"

# --- Endesga-32, named -------------------------------------------------------------
OUT = "#181425"          # outer outline / deepest shadow
# greys / steel (cool)
INK = "#262b44"
STEEL0 = "#3a4466"
STEEL1 = "#5a6988"
STEEL2 = "#8b9bb4"
STEEL3 = "#c0cbdc"
WHITE = "#ffffff"
# wood / browns
UMBER = "#3e2731"
WOOD0 = "#733e39"
WOOD1 = "#b86f50"
WOOD2 = "#c28569"
WOOD3 = "#e4a672"
BONE = "#ead4aa"
SKIN = "#e8b796"
# rust / reds / oranges
RUST0 = "#be4a2f"
RUST1 = "#d77643"
ORANGE = "#f77622"
AMBER = "#feae34"
YELLOW = "#fee761"
CRIMSON = "#a22633"
RED = "#e43b44"
HOTRED = "#ff0044"
# greens
TEAL = "#193c3e"
MOSS0 = "#265c42"
MOSS1 = "#3e8948"
MOSS2 = "#63c74d"
# blues
NAVY = "#124e89"
BLUE = "#0099db"
CYAN = "#2ce8f5"
# purples
PLUM = "#68386c"
MAUVE = "#b55088"
PINK = "#f6757a"


def new(w, h):
    return Sprite(w, h, palette="endesga32")


def frames(s, n, draw, durations=None):
    """Draw n frames: draw(s, i) for i in 0..n-1 on blank frames, then outline each."""
    for i in range(n):
        if i > 0:
            s.add_frame(copy=False)
        s.frame(i + 1)
        draw(s, i)
        s.outline(OUT, where="outside")
        if durations:
            s.frames[i].duration = durations[i]
    return s


# --- drawing helpers -----------------------------------------------------------------
def h(s, x0, x1, y, c, only=None):
    s.line(x0, y, x1, y, c, only=only)


def v(s, x, y0, y1, c, only=None):
    s.line(x, y0, x, y1, c, only=only)


def pts(s, c, coords, only=None):
    for x, y in coords:
        s.px(x, y, c, only=only)


def rivet(s, x, y, lit=STEEL3, dark=INK):
    s.px(x, y, lit)
    s.px(x + 1, y + 1, dark)


def bitmap(s, x, y, rows, cmap):
    """Stamp a small char-map. rows = list of strings; cmap maps char -> colour; '.' = skip."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in cmap and cmap[ch] is not None:
                s.px(x + i, y + j, cmap[ch])
            elif ch == "_":
                s.px(x + i, y + j, None)


def moss(s, x0, y0, x1, y1, seed, density=0.35, only="opaque"):
    """Two-tone moss speckle clipped to existing pixels."""
    s.noise(x0, y0, x1, y1, MOSS1, density=density, seed=seed, only=only)
    s.noise(x0, y0, x1, y1, MOSS2, density=density * 0.45, seed=seed + 7, only=MOSS1)


# --- export & review -----------------------------------------------------------------
def _floor(w, h, seed=3):
    """Busy mid-grey/green floor at 1x for readability checks."""
    rnd = random.Random(seed)
    im = Image.new("RGB", (w, h), (90, 105, 136))
    p = im.load()
    base = [(90, 105, 136), (58, 68, 102), (139, 155, 180), (62, 137, 72), (38, 92, 66)]
    for y in range(h):
        for x in range(w):
            # cracked tile pattern + moss blotches
            c = base[0] if ((x // 8 + y // 8) % 2) else (82, 96, 124)
            if x % 8 == 0 or y % 8 == 0:
                c = base[1]
            r = rnd.random()
            if r < 0.10:
                c = base[2]
            elif r < 0.18:
                c = base[1]
            if ((x - 14) ** 2 + (y - 10) ** 2) < 60 or ((x - 40) ** 2 + (y - 30) ** 2) < 90:
                c = base[3] if rnd.random() < 0.6 else base[4]
            p[x, y] = c
    return im


def _night(im):
    im = im.convert("RGB")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            px[x, y] = (int(r * 0.62), int(g * 0.71), int(b * 0.91))   # game night spriteTint #9fb4e8
    return im


def strip_of(s):
    n = s.n_frames
    st = Image.new("RGBA", (s.w * n, s.h), (0, 0, 0, 0))
    for i in range(n):
        st.alpha_composite(s.composite(i + 1), (i * s.w, 0))
    return st


def check(s, key):
    st = strip_of(s)
    pal = {tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in PALETTES["endesga32"]}
    bad_a = sum(1 for p in st.getdata() if 0 < p[3] < 255)
    bad_c = {p[:3] for p in st.getdata() if p[3] and p[:3] not in pal}
    # base on bottom row (each frame)
    base_ok = all(any(st.getpixel((i * s.w + x, s.h - 1))[3] for x in range(s.w)) for i in range(s.n_frames))
    cols = {p[:3] for p in st.getdata() if p[3]}
    print(f"[{key}] {s.w}x{s.h} x{s.n_frames}  colours={len(cols)}  semi={bad_a}  offpal={len(bad_c)}  base_bottom={base_ok}")
    assert bad_a == 0 and not bad_c and base_ok, key
    return st


def export(s, key, scale=8):
    st = check(s, key)
    SPRITES.mkdir(parents=True, exist_ok=True)
    st.save(SPRITES / f"{key}.png")
    REVIEW.mkdir(parents=True, exist_ok=True)
    n = s.n_frames
    # review sheet: row 1 checker, row 2 busy floor, row 3 same floor with night tint
    pad, m = 6, 6
    cw, chh = (s.w + 2 * m) * scale, (s.h + 2 * m) * scale
    W = n * (cw + pad) + pad
    H = 3 * (chh + pad) + pad + 14
    sheet = Image.new("RGB", (W, H), (40, 40, 48))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 2), f"{key}  {s.w}x{s.h}  frames {n}", fill=(230, 230, 230), font=ImageFont.load_default())
    for i in range(n):
        fr = s.composite(i + 1)
        x = pad + i * (cw + pad)
        chk = Sprite._checker_bg(cw, chh).convert("RGBA")
        chk.alpha_composite(fr.resize((s.w * scale, s.h * scale), Image.NEAREST), (m * scale, m * scale))
        sheet.paste(chk.convert("RGB"), (x, 14 + pad))
        fl = _floor(s.w + 2 * m, s.h + 2 * m, seed=3).convert("RGBA")
        fl.alpha_composite(fr, (m, m))
        fl = fl.convert("RGB").resize((cw, chh), Image.NEAREST)
        sheet.paste(fl, (x, 14 + pad * 2 + chh))
        sheet.paste(_night(fl), (x, 14 + pad * 3 + chh * 2))
    sheet.save(REVIEW / f"{key}.png")
    if n > 1:
        s.save_gif(str(REVIEW / f"{key}.gif"), scale=6, bg="#5a6988")
    return st
