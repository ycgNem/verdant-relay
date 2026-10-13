"""Shared helpers for the "night" sprite group (burrower, seed_carrier, seedling,
ruin_guard, colossus, survivor). An identical copy lives in each of those folders so
every build.py is self-contained:  from kit import *

Everything is drawn with pixelstudio's Sprite on one layer per frame, snapped to the
Endesga-32 palette; finish() adds the #181425 outer outline; export() writes the 1x
horizontal strip to public/sprites/<key>.png plus previews / GIF / night tests.
"""
import sys
from pathlib import Path

_local = Path(__file__).resolve().parents[2] / ".claude/skills/pixel-art-studio/scripts"
sys.path.insert(0, str(_local if _local.exists() else Path.home() / ".claude/skills/pixel-art-studio/scripts"))
from pixelstudio import Sprite, PALETTES, ramp, mix  # noqa: E402,F401
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PAL = PALETTES["endesga32"]

# ---- Endesga-32 by name -------------------------------------------------------
E = dict(
    rust="#be4a2f", clay="#d77643", cream="#ead4aa", skin="#e4a672", tan="#b86f50",
    brown="#733e39", plum="#3e2731", wine="#a22633", red="#e43b44", orange="#f77622",
    amber="#feae34", yellow="#fee761", lime="#63c74d", green="#3e8948", forest="#265c42",
    abyss="#193c3e", navy="#124e89", blue="#0099db", cyan="#2ce8f5", white="#ffffff",
    silver="#c0cbdc", grey="#8b9bb4", slate="#5a6988", steel="#3a4466", ink="#262b44",
    out="#181425", hot="#ff0044", purple="#68386c", magenta="#b55088", pink="#f6757a",
    peach="#e8b796", khaki="#c28569",
)
OUT = E["out"]

# shared material ramps (dark -> light), all Endesga
BARK = [E["plum"], E["brown"], E["tan"], E["khaki"]]
MOSS = [E["abyss"], E["forest"], E["green"], E["lime"]]
STONE = [E["ink"], E["steel"], E["slate"], E["grey"], E["silver"]]
STEEL = [E["ink"], E["steel"], E["slate"], E["grey"], E["silver"], E["white"]]
RUST = [E["plum"], E["brown"], E["rust"], E["clay"]]
DIRT = [E["plum"], E["brown"], E["tan"], E["khaki"], E["peach"]]
EMBER = [E["wine"], E["red"], E["hot"], E["orange"], E["amber"], E["yellow"]]
GLOW_A = [E["orange"], E["amber"], E["yellow"]]
ENERGY = [E["navy"], E["blue"], E["cyan"], E["white"]]


def new_sprite(w, h):
    return Sprite(w, h, palette="endesga32")


def new_frame(s, i):
    """Select frame i (1-based), creating blank frames as needed."""
    while s.n_frames < i:
        s.add_frame(copy=False)
    s.frame(i)
    s.layer("main")
    return s


# ---- drawing helpers --------------------------------------------------------------

def hl(s, x0, x1, y, c, only=None):
    s.line(x0, y, x1, y, c, only=only)


def vl(s, x, y0, y1, c, only=None):
    s.line(x, y0, x, y1, c, only=only)


def pxs(s, pts, c, only=None):
    for x, y in pts:
        s.px(x, y, c, only=only)


def shaded_ellipse(s, x0, y0, x1, y1, rmp, steps=None, only=None, hot=True):
    """Shifted-shape cel shading for a convex blob lit from the top-left.
    rmp: dark->light list. Draws darkest silhouette, then restacks lighter shades
    shifted up-left and shrunk, clipped to the blob."""
    w, h = x1 - x0, y1 - y0
    s.ellipse(x0, y0, x1, y1, rmp[0], only=only)
    n = len(rmp)
    for k in range(1, n):
        t = k / (n - 1)
        sx = round(w * 0.10 * t + 1)
        sy = round(h * 0.12 * t + 1)
        shrink_x = round(w * 0.22 * t)
        shrink_y = round(h * 0.24 * t)
        if not hot and k == n - 1:
            break
        s.ellipse(x0 - sx + 1, y0 - sy + 1, x1 - sx - shrink_x, y1 - sy - shrink_y, rmp[k], only="opaque")


def poly_shade(s, pts, base, light=None, dark=None, only=None):
    s.polygon(pts, base, only=only)


def mask_of(s):
    """Set of opaque (x,y) in current cel."""
    im = s._img()
    p = im.load()
    return {(x, y) for y in range(s.h) for x in range(s.w) if p[x, y][3] > 0}


def rim_light(s, color, region=None, dx=-1, dy=-1, only=None):
    """Paint `color` on opaque px whose (dx,dy) neighbour is transparent - lit edges."""
    im = s._img()
    p = im.load()
    todo = []
    for y in range(s.h):
        for x in range(s.w):
            if p[x, y][3] == 0:
                continue
            if region and not (region[0] <= x <= region[2] and region[1] <= y <= region[3]):
                continue
            if only is not None and not s._only_ok(im, x, y, only):
                continue
            nx, ny = x + dx, y + dy
            if not (0 <= nx < s.w and 0 <= ny < s.h) or p[nx, ny][3] == 0:
                todo.append((x, y))
    c = s._c(color)
    for x, y in todo:
        p[x, y] = c


def part(s, fn, edge=None, edge_sides=("down", "right", "left", "up")):
    """Draw fn() on a scratch cel, give it an inner selout line (`edge`) on the chosen
    sides, then stamp it onto the main cel of the current frame. Use for limbs/plates
    that overlap the body so they separate cleanly."""
    from PIL import Image as _I
    fr = s.frames[s._f]
    s.layer("_part")
    fr.cels["_part"] = s._blank()
    fn()
    if edge is not None:
        im = s._img()
        p = im.load()
        c = s._c(edge)
        dirs = {"down": (0, 1), "up": (0, -1), "left": (-1, 0), "right": (1, 0)}
        todo = []
        for y in range(s.h):
            for x in range(s.w):
                if p[x, y][3] == 0:
                    continue
                for side in edge_sides:
                    dx, dy = dirs[side]
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < s.w and 0 <= ny < s.h) or p[nx, ny][3] == 0:
                        todo.append((x, y))
                        break
        for x, y in todo:
            p[x, y] = c
    fr.cels["main"] = _I.alpha_composite(fr.cels["main"], fr.cels["_part"])
    fr.cels["_part"] = s._blank()
    s.layer("main")


def finish(s, outline=OUT):
    """Outer 1px outline for the current frame (cel must keep a 1px margin)."""
    s.outline(outline, where="outside")


def clean_orphans(s, keep=()):
    """Remove fully isolated single px (4-neighbour) except listed colours."""
    im = s._img()
    p = im.load()
    kill = []
    keepc = {s._c(k)[:3] for k in keep}
    for y in range(s.h):
        for x in range(s.w):
            if p[x, y][3] == 0 or p[x, y][:3] in keepc:
                continue
            if not any(0 <= x + dx < s.w and 0 <= y + dy < s.h and p[x + dx, y + dy][3] > 0
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                kill.append((x, y))
    for x, y in kill:
        p[x, y] = (0, 0, 0, 0)


# ---- directional (top-left) light shading -------------------------------------------
import math as _m
_L = (-0.55, -0.62, 0.56)
_ln = _m.sqrt(sum(v * v for v in _L))
LIGHT = tuple(v / _ln for v in _L)


def _band(d, n, lo=-0.25, hi=0.95, bias=0.0):
    t = (d - lo) / (hi - lo) + bias
    return max(0, min(n - 1, int(t * n)))


def lit_ellipse(s, cx, cy, rx, ry, rmp, only=None, bias=0.0, clip=None, lo=-0.25, hi=0.95):
    """Ellipsoid lit from the top-left: per-pixel normal -> ramp band (hard cel bands)."""
    n = len(rmp)
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            r2 = nx * nx + ny * ny
            if r2 > 1.0:
                continue
            if clip and not clip(x, y):
                continue
            nz = _m.sqrt(max(0.0, 1 - r2))
            d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
            s.px(x, y, rmp[_band(d, n, lo, hi, bias)], only=only)


def lit_mask(s, pts, cx, cy, rx, ry, rmp, only=None, bias=0.0, lo=-0.25, hi=0.95):
    """Shade an arbitrary pixel set as if it were the ellipsoid (cx,cy,rx,ry)."""
    n = len(rmp)
    for (x, y) in pts:
        nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
        r2 = min(1.0, nx * nx + ny * ny)
        nz = _m.sqrt(max(0.0, 1 - r2))
        d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
        s.px(x, y, rmp[_band(d, n, lo, hi, bias)], only=only)


def lit_limb(s, x0, y0, x1, y1, r0, r1, rmp, only=None, bias=0.0, cap=True):
    """Tapered cylinder from (x0,y0) radius r0 to (x1,y1) radius r1, lit top-left."""
    n = len(rmp)
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy or 1e-6
    ln = _m.sqrt(L2)
    px_, py_ = -dy / ln, dx / ln          # perpendicular
    xs = range(int(min(x0, x1) - max(r0, r1)) - 1, int(max(x0, x1) + max(r0, r1)) + 2)
    ys = range(int(min(y0, y1) - max(r0, r1)) - 1, int(max(y0, y1) + max(r0, r1)) + 2)
    for y in ys:
        for x in xs:
            qx, qy = x + 0.5 - x0, y + 0.5 - y0
            t = (qx * dx + qy * dy) / L2
            if cap:
                tc = max(0.0, min(1.0, t))
            else:
                if t < 0 or t > 1:
                    continue
                tc = t
            r = r0 + (r1 - r0) * tc
            cxp, cyp = x0 + dx * tc, y0 + dy * tc
            ox, oy = x + 0.5 - cxp, y + 0.5 - cyp
            dist = _m.sqrt(ox * ox + oy * oy)
            if dist > r or r <= 0:
                continue
            # normal: across-axis component + bulge
            k = dist / r
            if dist > 1e-6:
                nx, ny = ox / dist * k, oy / dist * k
            else:
                nx = ny = 0.0
            nz = _m.sqrt(max(0.0, 1 - k * k))
            d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
            s.px(x, y, rmp[_band(d, n, bias=bias)], only=only)


# ---- export ---------------------------------------------------------------------

def _grass_tile(w, h, seed=3):
    import random
    rnd = random.Random(seed)
    im = Image.new("RGBA", (w, h), Image.new("RGB", (1, 1), "#193c3e").getpixel((0, 0)) + (255,))
    p = im.load()
    cols = [(38, 92, 66, 255), (25, 60, 62, 255), (62, 137, 72, 255), (38, 43, 68, 255)]
    for y in range(h):
        for x in range(w):
            r = rnd.random()
            if r < 0.30:
                p[x, y] = cols[0]
            elif r < 0.36:
                p[x, y] = cols[2]
            elif r < 0.42:
                p[x, y] = cols[3]
    return im


def _tint(im, t=(0.55, 0.68, 1.0)):
    r, g, b, a = im.split()
    r = r.point(lambda v: int(v * t[0]))
    g = g.point(lambda v: int(v * t[1]))
    b = b.point(lambda v: int(v * t[2]))
    return Image.merge("RGBA", (r, g, b, a))


def _label(im, text, xy, fill=(235, 235, 235)):
    ImageDraw.Draw(im).text(xy, text, fill=fill, font=ImageFont.load_default())


def check(s, key):
    """Contract checks: palette, alpha, feet on bottom row, no edge clipping."""
    pal = {tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in PAL}
    problems = []
    for i in range(1, s.n_frames + 1):
        im = s.composite(i)
        p = im.load()
        for y in range(s.h):
            for x in range(s.w):
                r, g, b, a = p[x, y]
                if 0 < a < 255:
                    problems.append("f%d semi alpha at %d,%d" % (i, x, y))
                elif a == 255 and (r, g, b) not in pal:
                    problems.append("f%d off-palette %s at %d,%d" % (i, (r, g, b), x, y))
        bb = im.getbbox()
        if bb is None:
            problems.append("f%d empty" % i)
            continue
        if bb[3] != s.h:
            problems.append("f%d bottom row empty (bbox %s)" % (i, bb))
        if bb[1] == 0 or bb[0] == 0 or bb[2] == s.w:
            problems.append("f%d touches top/left/right edge (bbox %s)" % (i, bb))
    print("[%s] checks: %s" % (key, "OK" if not problems else "\n  " + "\n  ".join(problems[:20])))
    return problems


def export(s, key, anims, fps=8, anim_fps=None, scale=6, here=None, ms=None):
    """Write strip + previews. anims = {name: [frame indices 0-based]}."""
    here = Path(here) if here else Path.cwd()
    n = s.n_frames
    strip = Image.new("RGBA", (s.w * n, s.h), (0, 0, 0, 0))
    for i in range(n):
        strip.alpha_composite(s.composite(i + 1), (i * s.w, 0))
    out = ROOT / "public" / "sprites" / ("%s.png" % key)
    out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out)
    assert strip.width == s.w * n
    print("strip -> %s (%dx%d, %d frames)" % (out, strip.width, strip.height, n))

    # preview: frames labelled by anim, on checker + on night grass
    s.preview(str(here / "preview.png"), scale=scale, cols=n if n <= 8 else 7)

    # night test: each anim's frames on grass, plain and tinted, at 1x and 3x
    names = []
    for name, idx in anims.items():
        for j, f in enumerate(idx):
            names.append(("%s%d" % (name, j), f))
    pad = 6
    cw, ch = s.w + pad * 2, s.h + pad * 2
    row = Image.new("RGBA", (cw * len(names), ch), (0, 0, 0, 255))
    grass = _grass_tile(row.width, row.height)
    row.alpha_composite(grass)
    for k, (_, f) in enumerate(names):
        row.alpha_composite(s.composite(f + 1), (k * cw + pad, pad))
    tint = _tint(row)
    sc = 3
    rw, rh = row.width, row.height
    big = Image.new("RGBA", (max(rw * sc, 200), 14 + rh * sc + 14 + rh * sc + 14 + rh * 2 + 4), (12, 14, 22, 255))
    big.alpha_composite(row.resize((rw * sc, rh * sc), Image.NEAREST), (0, 14))
    y = 14 + rh * sc
    _label(big, "night tint 3x", (2, y + 1))
    big.alpha_composite(tint.resize((rw * sc, rh * sc), Image.NEAREST), (0, y + 14))
    y += 14 + rh * sc
    _label(big, "night tint 1x / 2x", (2, y + 1))
    big.alpha_composite(tint, (0, y + 14))
    t2 = tint.resize((rw * 2, rh * 2), Image.NEAREST)
    if rw + 8 < big.width:
        big.alpha_composite(t2.crop((0, 0, min(t2.width, big.width - rw - 8), t2.height)), (rw + 8, y + 14))
    for k, (nm, _) in enumerate(names):
        _label(big, nm, (k * cw * sc + 2, 1))
    big.convert("RGB").save(here / "night_test.png")

    # gif: every anim looped 3x on night grass, scaled
    frames, durs = [], []
    gw, gh = s.w + 8, s.h + 8
    g = _grass_tile(gw, gh, seed=7)
    for name, idx in anims.items():
        fms = (ms or {}).get(name) or int(1000 / ((anim_fps or {}).get(name, fps)))
        for _ in range(3 if len(idx) > 1 else 4):
            for f in idx:
                base = g.copy()
                base.alpha_composite(s.composite(f + 1), (4, 4))
                frames.append(base.resize((gw * 4, gh * 4), Image.NEAREST).convert("RGB"))
                durs.append(fms)
    frames[0].save(here / "anim.gif", save_all=True, append_images=frames[1:], duration=durs, loop=0)
    print("gif -> %s" % (here / "anim.gif"))

    # silhouettes at 1x and 4x
    sil = Image.new("RGB", (strip.width, strip.height), (232, 228, 218))
    a = strip.split()[3]
    sil.paste((34, 36, 46), mask=a)
    sil.resize((sil.width * 4, sil.height * 4), Image.NEAREST).save(here / "silhouette.png")
    return strip
