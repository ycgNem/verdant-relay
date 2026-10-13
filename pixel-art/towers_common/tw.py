"""Shared drawing + export helpers for the Verdant Relay "towers" art group.

Every build script in pixel-art/<tower>/build.py does:
    sys.path.insert(0, <this dir>); from tw import *
Draw with a Canvas (a pixelstudio Sprite snapped to Endesga-32, with a 'body' layer that
gets the dark #181425 outer outline and an 'fx' layer drawn on top without outline).
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path.home() / ".claude/skills/pixel-art-studio/scripts"))
from pixelstudio import Sprite, PALETTES  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SPRITES = ROOT / "public" / "sprites"
PAL = PALETTES["endesga32"]
PAL_RGB = {tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in PAL}

# ---------------------------------------------------------------- palette names
OUT = "#181425"     # outer outline / deepest shadow
INK = "#262b44"     # near-black blue
WHITE = "#ffffff"
# steel (cool) dark -> light
STEEL = ["#262b44", "#3a4466", "#5a6988", "#8b9bb4", "#c0cbdc"]
# rust / painted orange metal
RUST = ["#3e2731", "#733e39", "#be4a2f", "#d77643", "#e4a672"]
# wood (woven basket, planks)
WOOD = ["#3e2731", "#733e39", "#b86f50", "#c28569", "#e4a672"]
# foliage
LEAF = ["#193c3e", "#265c42", "#3e8948", "#63c74d"]
# purple sap / pink flesh
SAP = ["#3e2731", "#68386c", "#b55088", "#f6757a"]
# glows
CYAN = ["#124e89", "#0099db", "#2ce8f5", "#ffffff"]
AMBER = ["#be4a2f", "#f77622", "#feae34", "#fee761", "#ffffff"]
REDS = ["#3e2731", "#a22633", "#e43b44", "#ff0044"]
CREAM = ["#b86f50", "#e4a672", "#ead4aa", "#ffffff"]
# concrete (slightly warmer than steel: speckled with skin tones)
CONC = ["#3a4466", "#5a6988", "#8b9bb4", "#c0cbdc"]
BRASS = ["#733e39", "#be4a2f", "#feae34", "#fee761"]
COPPER = ["#3e2731", "#733e39", "#b86f50", "#d77643", "#e4a672"]

FPS = 8


# ---------------------------------------------------------------- canvas
class Canvas:
    """Thin wrapper: body layer (outlined) + fx layer (not outlined)."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.s = Sprite(w, h, palette="endesga32")
        self.s.layer("body")
        self.s.layer("fx")
        self.s.use(layer="body")

    # layer switching
    def body(self):
        self.s.use(layer="body"); return self

    def fx(self):
        self.s.use(layer="fx"); return self

    # primitives (delegate)
    def px(self, x, y, c, only=None):
        self.s.px(x, y, c, only=only); return self

    def line(self, x0, y0, x1, y1, c, only=None):
        self.s.line(x0, y0, x1, y1, c, only=only); return self

    def rect(self, x0, y0, x1, y1, c, only=None):
        self.s.rect(x0, y0, x1, y1, c, only=only); return self

    def circle(self, cx, cy, r, c, fill=True, only=None):
        self.s.circle(cx, cy, r, c, fill=fill, only=only); return self

    def poly(self, pts, c, only=None):
        self.s.polygon(pts, c, only=only); return self

    def get(self, x, y):
        return self.s.get(x, y)

    def erase(self, x, y):
        self.s.px(x, y, None); return self

    def hline(self, x0, x1, y, c, only=None):
        return self.line(x0, y, x1, y, c, only)

    def vline(self, x, y0, y1, c, only=None):
        return self.line(x, y0, x, y1, c, only)

    def pts(self, pts, c, only=None):
        for x, y in pts:
            self.px(x, y, c, only)
        return self

    def pattern(self, x0, y0, rows, cmap, only=None):
        """Stamp a little ASCII pattern. cmap maps chars to colours; ' ' / '.' skipped."""
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in (" ", "."):
                    continue
                c = cmap[ch]
                self.px(x0 + i, y0 + j, c, only)
        return self

    # ------------- shapes
    def ell(self, cx, cy, rx, ry, c, only=None):
        """Filled ellipse spanning x in [cx-rx, cx+rx-1], y in [cy-ry, cy+ry]."""
        for x0, x1, y in ell_rows(cx, cy, rx, ry):
            self.hline(x0, x1, y, c, only)
        return self

    def ell_outline(self, cx, cy, rx, ry, c_front, c_back=None, only=None):
        rows = ell_rows(cx, cy, rx, ry)
        for i, (x0, x1, y) in enumerate(rows):
            col = c_back if (c_back is not None and y < cy) else c_front
            prev = rows[i - 1] if i > 0 else None
            nxt = rows[i + 1] if i + 1 < len(rows) else None
            if y == cy - ry or y == cy + ry:
                self.hline(x0, x1, y, col, only)
                continue
            # edge pixels plus fill gaps where the next/prev row steps
            for (ax0, ax1) in [(x0, x1)]:
                left = [ax0]
                right = [ax1]
                for nb in (prev, nxt):
                    if nb is None:
                        continue
                    if nb[0] > ax0:
                        left = list(range(ax0, nb[0]))
                    if nb[1] < ax1:
                        right = list(range(nb[1] + 1, ax1 + 1))
                for x in set(left + right):
                    self.px(x, y, col, only)
        return self

    def cyl(self, x0, x1, y0, y1, ramp, only=None):
        """Vertical cylinder body (rectangle) shaded by column, light from the left."""
        w = x1 - x0 + 1
        for x in range(x0, x1 + 1):
            c = shade_col(x - x0, w, ramp)
            self.vline(x, y0, y1, c, only)
        return self

    def ell_shaded(self, cx, cy, rx, ry, ramp, only=None):
        """Ellipse filled with column shading (for the body part of a 3/4 cylinder)."""
        rows = ell_rows(cx, cy, rx, ry)
        x0 = min(r[0] for r in rows)
        x1 = max(r[1] for r in rows)
        w = x1 - x0 + 1
        for a, b, y in rows:
            for x in range(a, b + 1):
                self.px(x, y, shade_col(x - x0, w, ramp), only)
        return self

    def drum(self, cx, ytop, ybot, rx, ry, ramp, top=None, rim=None, only=None):
        """3/4-view cylinder: top ellipse centred at ytop, bottom ellipse at ybot.
        ramp: side colours dark->light. top: colour of the cap (default lightest-1)."""
        rows_b = ell_rows(cx, ybot, rx, ry)
        x0 = min(r[0] for r in rows_b)
        x1 = max(r[1] for r in rows_b)
        w = x1 - x0 + 1
        # side body = bottom ellipse + rect between centres
        for a, b, y in rows_b:
            if y >= ybot:
                for x in range(a, b + 1):
                    self.px(x, y, shade_col(x - x0, w, ramp), only)
        for y in range(ytop, ybot):
            for x in range(x0, x1 + 1):
                self.px(x, y, shade_col(x - x0, w, ramp), only)
        tc = top if top is not None else ramp[-2]
        self.ell(cx, ytop, rx, ry, tc, only)
        if rim:
            # lit back rim (top-left) of the cap
            for a, b, y in ell_rows(cx, ytop, rx, ry):
                if y <= ytop:
                    self.px(a, y, rim, only)
                if y == ytop - ry:
                    self.hline(a, a + (b - a) // 2, y, rim, only)
        return self

    def box(self, x0, x1, ytop, top_h, ybot, top, front, lit=None, dark=None, edge=None):
        """3/4 box: top face (rows ytop..ytop+top_h-1) then front face down to ybot."""
        self.rect(x0, ytop, x1, ytop + top_h - 1, top)
        self.rect(x0, ytop + top_h, x1, ybot, front)
        if edge:
            self.hline(x0, x1, ytop + top_h, edge)
        if lit:
            self.vline(x0, ytop, ybot, lit)
        if dark:
            self.vline(x1, ytop + top_h, ybot, dark)
        return self

    def noise(self, x0, y0, x1, y1, c, density=0.1, seed=0, only=None):
        self.s.noise(x0, y0, x1, y1, c, density=density, seed=seed, only=only); return self

    def dither(self, x0, y0, x1, y1, c1, c2, mix=0.5, pattern="checker", only=None):
        self.s.dither(x0, y0, x1, y1, c1, c2, mix=mix, pattern=pattern, only=only); return self

    def shift(self, dx, dy):
        self.s.shift(dx, dy); return self

    # ------------- finishing
    def outline(self):
        self.body()
        self.s.outline(OUT, where="outside")
        return self

    def image(self):
        """Final RGBA image: outlined body + fx. Alpha hardened to 0/255."""
        im = self.s.composite(1)
        px = im.load()
        for y in range(self.h):
            for x in range(self.w):
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
        return im


def ell_rows(cx, cy, rx, ry):
    """Rows (x0, x1, y) of a pixel ellipse; x spans [cx-rx, cx+rx-1] at the widest row."""
    rows = []
    for dy in range(-ry, ry + 1):
        t = dy / (ry + 0.5)
        hw = rx * math.sqrt(max(0.0, 1 - t * t))
        a = int(round(cx - hw))
        b = int(round(cx + hw)) - 1
        if b < a:
            a = b = int(cx) - 1 if cx == int(cx) else int(cx)
        rows.append((a, b, cy + dy))
    return rows


def shade_col(i, w, ramp):
    """Colour for column i of a w-wide cylinder lit from the left. ramp dark->light (3..6)."""
    n = len(ramp)
    if w <= 1:
        return ramp[-2]
    if w == 2:
        return [ramp[-2], ramp[1]][i]
    if w == 3:
        return [ramp[-2], ramp[-3] if n > 3 else ramp[1], ramp[1] if n > 3 else ramp[0]][i]
    f = i / (w - 1)
    # bands: rim, light, spec, light, mid, shade, core-dark
    if n >= 5:
        bands = [(0.07, ramp[2]), (0.20, ramp[3]), (0.30, ramp[4]), (0.42, ramp[3]),
                 (0.66, ramp[2]), (0.88, ramp[1]), (1.01, ramp[0])]
    elif n == 4:
        bands = [(0.07, ramp[2]), (0.32, ramp[3]), (0.55, ramp[2]), (0.85, ramp[1]), (1.01, ramp[0])]
    else:
        bands = [(0.35, ramp[2]), (0.75, ramp[1]), (1.01, ramp[0])]
    for lim, c in bands:
        if f < lim:
            return c
    return ramp[0]


# ---------------------------------------------------------------- image utils
def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


NIGHT_TINT = (0.55, 0.66, 1.0)


def night(im, tint=NIGHT_TINT):
    out = im.copy()
    p = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = p[x, y]
            if a:
                p[x, y] = (int(r * tint[0]), int(g * tint[1]), int(b * tint[2]), a)
    return out


def ground(w, h, seed=3):
    """Dark mossy-concrete ground for readability tests (already night-ish)."""
    import random
    rnd = random.Random(seed)
    im = Image.new("RGBA", (w, h), (34, 40, 46, 255))
    p = im.load()
    for y in range(h):
        for x in range(w):
            v = rnd.random()
            if v < 0.08:
                p[x, y] = (44, 54, 52, 255)
            elif v < 0.13:
                p[x, y] = (26, 30, 38, 255)
    return im


def up(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def strip(frames):
    w, h = frames[0].size
    out = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * w, 0))
    return out


def on_bg(im, bg):
    base = bg.copy() if isinstance(bg, Image.Image) else Image.new("RGBA", im.size, hex_rgb(bg) + (255,))
    base = base.crop((0, 0, im.width, im.height)) if base.size != im.size else base
    base.alpha_composite(im)
    return base


def checker(w, h, sq=4):
    im = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(im)
    for y in range(0, h, sq):
        for x in range(0, w, sq):
            c = (200, 200, 200, 255) if (x // sq + y // sq) % 2 else (230, 230, 230, 255)
            d.rectangle([x, y, x + sq - 1, y + sq - 1], fill=c)
    return im


def check(frames, key):
    """Validate contract: alpha 0/255, Endesga-32 only, report colours/isolated pixels."""
    cols = set()
    problems = []
    for fi, im in enumerate(frames):
        p = im.load()
        iso = []
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = p[x, y]
                if a not in (0, 255):
                    problems.append("semi alpha f%d (%d,%d)" % (fi, x, y))
                if a:
                    cols.add((r, g, b))
                    if (r, g, b) not in PAL_RGB:
                        problems.append("off-palette f%d (%d,%d) %s" % (fi, x, y, (r, g, b)))
                    if not any(0 <= x + dx < im.width and 0 <= y + dy < im.height and p[x + dx, y + dy][3]
                               for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        iso.append((x, y))
        if iso:
            print("  %s f%d isolated px: %s" % (key, fi, iso[:10]))
        # base touches the bottom row?
        if not any(p[x, im.height - 1][3] for x in range(im.width)):
            problems.append("f%d: nothing on the bottom row" % fi)
    print("  %s: %d frames %dx%d, %d colours%s" % (key, len(frames), frames[0].width, frames[0].height,
                                                     len(cols), "" if not problems else " PROBLEMS: %s" % problems[:5]))
    return not problems


def export(key, frames, art_dir, anims, fps=FPS, scale=6, extra=None):
    """Write public/sprites/<key>.png (1x strip) + previews + GIFs into art_dir."""
    art_dir = Path(art_dir)
    art_dir.mkdir(parents=True, exist_ok=True)
    check(frames, key)
    st = strip(frames)
    SPRITES.mkdir(parents=True, exist_ok=True)
    st.save(SPRITES / f"{key}.png")
    # preview: checker row + night row
    w, h = frames[0].size
    pad = 2
    n = len(frames)
    sheet = Image.new("RGBA", ((w * scale + pad) * n + pad, (h * scale + pad) * 2 + pad), (60, 60, 70, 255))
    g = ground(w, h)
    for i, f in enumerate(frames):
        a = on_bg(f, checker(w, h, 4))
        b = on_bg(night(f), g)
        sheet.paste(up(a, scale), (pad + i * (w * scale + pad), pad))
        sheet.paste(up(b, scale), (pad + i * (w * scale + pad), pad * 2 + h * scale))
    sheet.save(art_dir / f"{key}_preview.png")
    # 1x-ish readability view: frames at 2x on night ground
    small = Image.new("RGBA", (w * n * 2 + 8 * n, h * 2 + 8), (20, 22, 30, 255))
    for i, f in enumerate(frames):
        small.paste(up(on_bg(night(f), g), 2), (4 + i * (w * 2 + 8), 4))
    small.save(art_dir / f"{key}_small.png")
    # GIFs per anim on dark ground
    for name, idx in anims.items():
        imgs = [up(on_bg(frames[i], g), 4).convert("RGB") for i in idx]
        if len(imgs) == 1:
            continue
        reps = imgs * 3
        reps[0].save(art_dir / f"{key}_{name}.gif", save_all=True, append_images=reps[1:],
                     duration=int(1000 / fps), loop=0)
    entry = {"file": f"{key}.png", "ppu": 32, "frames": n, "fps": fps, "anims": anims}
    if extra:
        entry.update(extra)
    return entry


def label_font():
    try:
        return ImageFont.truetype("arial.ttf", 14)
    except Exception:
        return ImageFont.load_default()
