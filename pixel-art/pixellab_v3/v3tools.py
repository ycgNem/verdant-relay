"""Shared helpers for the PixelLab v3 batch (relay core, pylon, district hero ruins, area bosses).

Pixel rules: never resample PixelLab output (crop / pad only), alpha is 0 or 255, ppu 32, light from the top-left.
"""
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RAW = HERE / "raw"
SPRITES = ROOT / "public" / "sprites"
SCRATCH = ROOT / ".playwright-mcp" / "art2"
SCRATCH.mkdir(parents=True, exist_ok=True)


def hx(c):
    if isinstance(c, tuple):
        return c if len(c) == 4 else c + (255,)
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)


def load(name):
    im = Image.open(RAW / name).convert("RGBA")
    return harden(im)


def harden(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            px[x, y] = (p[0], p[1], p[2], 255) if p[3] >= 128 else (0, 0, 0, 0)
    return im


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def mixc(a, b, t):
    a, b = hx(a), hx(b)
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)


def crop_pad(im, pad=1):
    bb = im.getbbox()
    out = Image.new("RGBA", (bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad), (0, 0, 0, 0))
    out.paste(im.crop(bb), (pad, pad))
    return out, (bb[0] - pad, bb[1] - pad)


def gridzoom(im, path, box=None, scale=8, step=8, bg=(52, 70, 58, 255)):
    """Zoomed view with a coordinate grid every `step` texels (labels = absolute coords)."""
    if box is None:
        box = (0, 0, im.width, im.height)
    c = im.crop(box)
    b = Image.new("RGBA", c.size, bg)
    b.alpha_composite(c)
    z = b.resize((c.width * scale, c.height * scale), Image.NEAREST)
    d = ImageDraw.Draw(z)
    for gx in range(box[0] - box[0] % step, box[2], step):
        if gx < box[0]:
            continue
        X = (gx - box[0]) * scale
        d.line([(X, 0), (X, z.height)], fill=(255, 0, 255, 110) if gx % 32 else (255, 255, 0, 160))
        d.text((X + 2, 2), str(gx), fill=(255, 255, 255, 255))
    for gy in range(box[1] - box[1] % step, box[3], step):
        if gy < box[1]:
            continue
        Y = (gy - box[1]) * scale
        d.line([(0, Y), (z.width, Y)], fill=(255, 0, 255, 110) if gy % 32 else (255, 255, 0, 160))
        d.text((2, Y + 2), str(gy), fill=(255, 255, 255, 255))
    z.save(path)


def strip(frames):
    w = sum(f.width for f in frames)
    out = Image.new("RGBA", (w, frames[0].height), (0, 0, 0, 0))
    x = 0
    for f in frames:
        out.paste(f, (x, 0))
        x += f.width
    return out


def check_alpha(im):
    bad = sum(1 for p in im.getdata() if 0 < p[3] < 255)
    assert bad == 0, f"{bad} semi-transparent texels"


def preview(frames, path, scale=4, bg=(34, 52, 40, 255), anchor=None):
    w = sum(f.width + 4 for f in frames) + 4
    h = max(f.height for f in frames) + 8
    s = Image.new("RGBA", (w, h), bg)
    x = 4
    for f in frames:
        s.alpha_composite(f, (x, 4))
        if anchor:
            s.putpixel((x + anchor[0], 4 + anchor[1]), (255, 0, 0, 255))
        x += f.width + 4
    s.resize((w * scale, h * scale), Image.NEAREST).save(path)


class Canvas:
    """Thin pixel-editing wrapper over a PIL RGBA image."""

    def __init__(self, im):
        self.im = im
        self.px = im.load()
        self.w, self.h = im.size

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[x, y]
        return (0, 0, 0, 0)

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = (0, 0, 0, 0) if c is None else hx(c)

    def opaque(self, x, y):
        return self.get(x, y)[3] == 255

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.set(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def pts(self, pts, c):
        for x, y in pts:
            self.set(x, y, c)

    def remap(self, mapping, box=None, cond=None):
        """mapping: {hex_or_rgb: hex}; box limits the area; cond(x, y) optional filter."""
        m = {hx(k)[:3]: hx(v) for k, v in mapping.items()}
        x0, y0, x1, y1 = box or (0, 0, self.w, self.h)
        for y in range(y0, y1):
            for x in range(x0, x1):
                p = self.px[x, y]
                if p[3] and p[:3] in m and (cond is None or cond(x, y)):
                    self.px[x, y] = m[p[:3]]

    def copy(self):
        return Canvas(self.im.copy())
