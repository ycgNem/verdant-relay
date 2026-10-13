"""Shared drawing kit for the 'chars' group (player, crawler, skitter, scav, spitter, razorback).

Pixels are placed by hand as short ASCII segments: seg(x, y, "abc") writes the letters
left-to-right starting at (x, y); '.' skips (leaves what is underneath), ' ' also skips,
'_' erases. Letters map to Endesga-32 colours through a legend. All build scripts are
deterministic. pixelstudio (the pixel-art-studio skill) is used for preview/GIF/stats.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

_local = Path(__file__).resolve().parents[2] / ".claude/skills/pixel-art-studio/scripts"
sys.path.insert(0, str(_local if _local.exists() else Path.home() / ".claude/skills/pixel-art-studio/scripts"))
from pixelstudio import Sprite, PALETTES  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SPRITES = ROOT / "public" / "sprites"
E32 = PALETTES["endesga32"]
E32SET = {c.lower() for c in E32}
OUTLINE = "#181425"

# Base legend shared by every sprite in the group (sprites may extend / override).
# Endesga-32 named, grouped as ramps (dark -> light).
BASE = {
    "#": "#181425",  # outline / deepest
    # greens
    "1": "#193c3e", "2": "#265c42", "3": "#3e8948", "4": "#63c74d",
    # skin / browns
    "n": "#3e2731", "a": "#733e39", "b": "#b86f50", "c": "#e4a672", "C": "#ead4aa",
    "s": "#c28569", "S": "#e8b796",
    # reds / oranges
    "r": "#be4a2f", "d": "#d77643", "R": "#a22633", "e": "#e43b44", "E": "#ff0044",
    "f": "#f77622", "F": "#feae34", "y": "#fee761",
    # blues / greys
    "j": "#262b44", "J": "#3a4466", "m": "#5a6988", "M": "#8b9bb4", "L": "#c0cbdc", "w": "#ffffff",
    "u": "#124e89", "U": "#0099db", "o": "#2ce8f5",
    # purples / pinks
    "p": "#68386c", "P": "#b55088", "k": "#f6757a",
}


class Canvas:
    def __init__(self, w, h, legend=None):
        self.w, self.h = w, h
        self.g = [[None] * w for _ in range(h)]
        self.legend = dict(BASE)
        if legend:
            self.legend.update(legend)

    def copy(self):
        c = Canvas(self.w, self.h)
        c.legend = dict(self.legend)
        c.g = [row[:] for row in self.g]
        return c

    # -- primitives -------------------------------------------------------
    def col(self, ch):
        if ch is None:
            return None
        if isinstance(ch, str) and ch.startswith("#") and len(ch) == 7:
            return ch.lower()
        return self.legend[ch].lower()

    def px(self, x, y, ch, only=None):
        if 0 <= x < self.w and 0 <= y < self.h:
            if only is not None:
                cur = self.g[y][x]
                if only == "opaque":
                    if cur is None:
                        return
                elif only == "empty":
                    if cur is not None:
                        return
                elif cur != self.col(only):
                    return
            self.g[y][x] = self.col(ch)

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.g[y][x]
        return None

    def seg(self, x, y, s, flip=False):
        """Write a row of letters. flip=True writes right-to-left (mirror)."""
        for i, ch in enumerate(s):
            xx = x - i if flip else x + i
            if ch in ". ":
                continue
            if ch == "_":
                if 0 <= xx < self.w and 0 <= y < self.h:
                    self.g[y][xx] = None
                continue
            self.px(xx, y, ch)

    def stamp(self, rows, x, y, flip=False):
        """Stamp a list of strings with top-left at (x, y). flip mirrors around the stamp's width."""
        wmax = max(len(r) for r in rows)
        for j, r in enumerate(rows):
            if flip:
                self.seg(x + wmax - 1, y + j, r, flip=True)
            else:
                self.seg(x, y + j, r)

    def rect(self, x0, y0, x1, y1, ch, only=None):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            for x in range(min(x0, x1), max(x0, x1) + 1):
                self.px(x, y, ch, only)

    def line(self, x0, y0, x1, y1, ch, only=None):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, ch, only)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def poly(self, pts, ch, only=None):
        m = Image.new("1", (self.w, self.h), 0)
        ImageDraw.Draw(m).polygon(pts, fill=1, outline=1)
        p = m.load()
        for y in range(self.h):
            for x in range(self.w):
                if p[x, y]:
                    self.px(x, y, ch, only)

    def ellipse(self, x0, y0, x1, y1, ch, only=None):
        m = Image.new("1", (self.w, self.h), 0)
        ImageDraw.Draw(m).ellipse([x0, y0, x1, y1], fill=1, outline=1)
        p = m.load()
        for y in range(self.h):
            for x in range(self.w):
                if p[x, y]:
                    self.px(x, y, ch, only)

    def replace(self, a, b):
        ca, cb = self.col(a), self.col(b)
        for row in self.g:
            for i, v in enumerate(row):
                if v == ca:
                    row[i] = cb

    def shifted(self, dx, dy):
        c = Canvas(self.w, self.h)
        c.legend = dict(self.legend)
        for y in range(self.h):
            for x in range(self.w):
                v = self.g[y][x]
                if v is not None and 0 <= x + dx < self.w and 0 <= y + dy < self.h:
                    c.g[y + dy][x + dx] = v
        return c

    def over(self, other):
        """Draw other canvas on top of self (in place)."""
        for y in range(self.h):
            for x in range(self.w):
                v = other.g[y][x]
                if v is not None:
                    self.g[y][x] = v
        return self

    # -- finishing ----------------------------------------------------------
    def outline(self, color=OUTLINE, diagonals=False):
        """1px outer outline around the whole silhouette."""
        add = []
        nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if diagonals:
            nb += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] is None:
                    for dx, dy in nb:
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < self.w and 0 <= yy < self.h and self.g[yy][xx] is not None:
                            add.append((x, y))
                            break
        for x, y in add:
            self.g[y][x] = color
        return self

    def image(self):
        im = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        p = im.load()
        for y in range(self.h):
            for x in range(self.w):
                v = self.g[y][x]
                if v is not None:
                    p[x, y] = tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
        return im


# ---------------------------------------------------------------------------
# Parametric limbs
# ---------------------------------------------------------------------------

def limb_mask(pts, widths):
    """Thick polyline as a pixel set. pts: [(x,y),...], widths: one per point.
    Spans are horizontal for steep segments, vertical for shallow ones."""
    mask = set()
    for (p0, p1, w0, w1) in zip(pts, pts[1:], widths, widths[1:]):
        (x0, y0), (x1, y1) = p0, p1
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        steep = abs(y1 - y0) >= abs(x1 - x0)
        for i in range(n + 1):
            t = i / n
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * t
            w = int(round(w0 + (w1 - w0) * t))
            if steep:
                xs = int(round(x - (w - 1) / 2.0))
                for k in range(w):
                    mask.add((xs + k, int(round(y))))
            else:
                ys = int(round(y - (w - 1) / 2.0))
                for k in range(w):
                    mask.add((int(round(x)), ys + k))
    return mask


def shade_mask(c, mask, dark, base, light, edge=None, top=None):
    """Cylinder shading lit from the left/top-left: left edge light, right edge dark.
    edge: optional selout colour for the right edge (darker than dark band).
    top: optional colour for pixels with nothing above (top-lit caps)."""
    for (x, y) in mask:
        left = (x - 1, y) in mask
        right = (x + 1, y) in mask
        up = (x, y - 1) in mask
        if not right and edge is not None and left:
            col = edge
        elif not left:
            col = light
        elif not right:
            col = dark
        else:
            col = base
        if top is not None and not up and left:
            col = top
        c.px(x, y, col)


# ---------------------------------------------------------------------------
# Test backgrounds
# ---------------------------------------------------------------------------

def floor_bg(w, h, seed=3):
    """Busy mid-green/grey overgrown-concrete floor, like the game's ground."""
    import random
    rnd = random.Random(seed)
    im = Image.new("RGB", (w, h), (90, 105, 136))
    d = ImageDraw.Draw(im)
    cols = [(90, 105, 136), (62, 137, 72), (58, 68, 102), (139, 155, 180), (38, 92, 66), (99, 199, 77)]
    t = 8
    for y in range(0, h, t):
        for x in range(0, w, t):
            c = rnd.choice([cols[0], cols[0], cols[1], cols[1], cols[4], cols[2]])
            d.rectangle([x, y, x + t - 1, y + t - 1], fill=c)
    for _ in range(w * h // 40):
        x, y = rnd.randrange(w), rnd.randrange(h)
        im.putpixel((x, y), rnd.choice(cols))
    return im


def tint_night(im):
    px = im.load()
    out = im.copy()
    po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            v = px[x, y]
            r, g, b = v[0], v[1], v[2]
            po[x, y] = (int(r * 0.45), int(g * 0.55), int(min(255, b * 0.85 + 30))) + ((v[3],) if len(v) == 4 else ())
    return out


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def validate(key, frames, fw, fh):
    problems = []
    for i, fr in enumerate(frames):
        assert fr.w == fw and fr.h == fh, "frame size mismatch"
        bottom = any(fr.g[fh - 1][x] is not None for x in range(fw))
        if not bottom:
            problems.append("frame %d: nothing on bottom row" % i)
        for y in range(fh):
            for x in range(fw):
                v = fr.g[y][x]
                if v is not None and v not in E32SET:
                    problems.append("frame %d: off-palette %s at %d,%d" % (i, v, x, y))
        # edge touching (other than bottom) -> possible clipping
        ol = OUTLINE.lower()
        for x in range(fw):
            if fr.g[0][x] not in (None, ol):
                problems.append("frame %d: content on top row" % i)
                break
        for y in range(fh):
            if fr.g[y][0] not in (None, ol) or fr.g[y][fw - 1] not in (None, ol):
                problems.append("frame %d: content on side edge at y=%d" % (i, y))
                break
    for p in problems[:30]:
        print("  !!", p)
    return problems


def export(key, frames, anims, durations=None, fps=8, anim_fps=None, scale=8, here=None):
    """frames: list of finished Canvas (outlined). anims: name -> [indices]."""
    here = Path(here) if here else Path(__file__).resolve().parent.parent / key
    fw, fh = frames[0].w, frames[0].h
    validate(key, frames, fw, fh)
    strip = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        strip.alpha_composite(fr.image(), (i * fw, 0))
    SPRITES.mkdir(parents=True, exist_ok=True)
    strip.save(SPRITES / ("%s.png" % key))
    # alpha check
    assert all(a in (0, 255) for a in strip.getchannel("A").getdata()), "semi alpha!"

    # pixelstudio sprite for preview / gif / stats
    s = Sprite(fw, fh, palette=E32)
    for i, fr in enumerate(frames):
        if i > 0:
            s.add_frame(copy=False)
        s.frame(i + 1)
        s.layer("main")
        s._img().paste(fr.image(), (0, 0))
        s.frames[i].duration = (durations[i] if durations else int(1000 / fps))
    # tags in anim order
    for name, idx in anims.items():
        s.tag(name, idx[0] + 1, idx[-1] + 1)
    s.preview(str(here / "preview.png"), scale=scale, cols=min(len(frames), 8))
    s.frame(1)
    s.save_silhouette(str(here / "silhouette.png"), scale=4)
    s.stats()

    # labelled anim GIF (all anims in sequence, each looped 3x) on floor bg
    gif_frames, gif_durs = [], []
    for name, idx in anims.items():
        afps = (anim_fps or {}).get(name, fps)
        reps = 3 if len(idx) > 1 else 4
        for _ in range(reps):
            for i in idx:
                gif_frames.append(i)
                gif_durs.append(int(1000 / afps))
    gs = 6
    imgs = []
    bg = floor_bg(fw * gs // 2, fh * gs // 2).resize((fw * gs, fh * gs), Image.NEAREST)
    for i in gif_frames:
        base = bg.convert("RGBA").copy()
        base.alpha_composite(frames[i].image().resize((fw * gs, fh * gs), Image.NEAREST))
        imgs.append(base.convert("RGB").quantize(colors=255, dither=Image.Dither.NONE))
    imgs[0].save(here / "anim.gif", save_all=True, append_images=imgs[1:], duration=gif_durs, loop=0)

    # floor / night test: every frame at 4x on busy floor, then bluish night tint, plus 1x row
    ts = 4
    W = fw * ts * len(frames)
    floor = floor_bg(W // 2 + 1, fh * ts // 2 + 1).resize((W + 2, fh * ts + 2), Image.NEAREST).crop((0, 0, W, fh * ts))
    day = floor.convert("RGBA")
    for i, fr in enumerate(frames):
        day.alpha_composite(fr.image().resize((fw * ts, fh * ts), Image.NEAREST), (i * fw * ts, 0))
    night = tint_night(day)
    one = floor_bg(fw * len(frames), fh, seed=9).convert("RGBA")
    one.alpha_composite(strip)
    one = one.resize((one.width * 2, one.height * 2), Image.NEAREST)
    sheet = Image.new("RGB", (W, fh * ts * 2 + one.height + 4), (24, 20, 37))
    sheet.paste(day.convert("RGB"), (0, 0))
    sheet.paste(night.convert("RGB"), (0, fh * ts))
    sheet.paste(one.convert("RGB"), (0, fh * ts * 2 + 4))
    sheet.save(here / "floortest.png")
    print("%s: %d frames %dx%d -> %s" % (key, len(frames), fw, fh, SPRITES / ("%s.png" % key)))
    return strip
