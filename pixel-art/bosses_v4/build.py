"""Area-boss presence pass (critic H2 #3): anticipation poses, a phase-2 variant, and the Thorn Mother recolour.

Source: the PixelLab agent's exported strips, snapshotted in pixel-art/bosses_v4/src/ (8 frames: idle 0-3, attack
4-5, hurt 6, dead 7). Everything here is done by moving, repainting and adding texels by hand-written rules -
nothing is resampled.

Output (public/sprites/), every strip 10 frames, frames padded by PAD_T rows on top and PAD_X columns per side so
wind-ups and wisps have room (the anchor moves by the same amount):
  boss_<x>      idle 0-3, attack 4-5, hurt 6, dead 7, windup 8-9 (the new 2-frame anticipation pose)
  boss_<x>_p2   the same 10 frames with the phase-2 overlay: glowing cracks/veins, a hotter eye, wisps
  <x> = thorn_mother | brood_hive | warden | drowned_engine
Thorn Mother: recoloured away from the Spitter - violet body with bone nodules, dark leaves, a red maw, brown roots.

Run: python pixel-art/bosses_v4/build.py   (then python pixel-art/merge_manifest.py)
"""
import colorsys
import json
import math
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
from v3lib import SCRATCH, SPRITES, check_alpha  # noqa: E402

PAD_T, PAD_X = 8, 4
SRC = {  # key: (fw, fh, anchor)
    "boss_thorn_mother": (90, 95, (45, 87)),
    "boss_brood_hive": (96, 82, (50, 73)),
    "boss_warden": (76, 96, (38, 88)),
    "boss_drowned_engine": (94, 90, (47, 87)),
}
ANIMFPS = {"idle": 5, "attack": 7, "hurt": 8, "dead": 1, "windup": 6}


def h2(x, y, s=0):
    n = (x * 374761393 + y * 668265263 + s * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def hx(c):
    return (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 255)


def hsv(p):
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    return h * 360, s, v


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def frames_of(key):
    fw, fh, _ = SRC[key]
    im = Image.open(HERE / "src" / f"{key}.png").convert("RGBA")
    return [im.crop((i * fw, 0, (i + 1) * fw, fh)) for i in range(im.width // fw)]


def pad(f):
    out = Image.new("RGBA", (f.width + 2 * PAD_X, f.height + PAD_T), (0, 0, 0, 0))
    out.paste(f, (PAD_X, PAD_T))
    return out


def opaque(im, x, y):
    return 0 <= x < im.width and 0 <= y < im.height and im.getpixel((x, y))[3] > 0


def put(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height:
        im.putpixel((int(x), int(y)), c if isinstance(c, tuple) else hx(c))


def outline_new(im, before, ink=(10, 6, 16, 255)):
    """Outline texels that became opaque since `before` (new parts) where they touch transparency."""
    add = []
    for y in range(im.height):
        for x in range(im.width):
            if im.getpixel((x, y))[3] or not any(opaque(im, x + dx, y + dy) and not opaque(before, x + dx, y + dy)
                                                 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                continue
            add.append((x, y))
    for (x, y) in add:
        im.putpixel((x, y), ink)


def shift_region(im, sel, dx, dy, fill=None):
    """Move the texels where sel(x, y) is true by (dx, dy) (cut + paste on top). fill(x, y) -> colour for the hole."""
    src = im.copy()
    moved = {}
    for y in range(im.height):
        for x in range(im.width):
            p = src.getpixel((x, y))
            if p[3] and sel(x, y):
                moved[(x + dx, y + dy)] = p
                im.putpixel((x, y), fill(x, y) if fill else (0, 0, 0, 0))
    for (x, y), p in moved.items():
        if 0 <= x < im.width and 0 <= y < im.height:
            im.putpixel((x, y), p)
    return im


def stretch_rows(im, y_cut, n, x0=0, x1=None):
    """Open the image at row y_cut: everything above moves up n rows, the gap repeats row y_cut (columns x0..x1)."""
    x1 = im.width if x1 is None else x1
    src = im.copy()
    for x in range(x0, x1):
        for y in range(0, im.height):
            if y < y_cut - n:
                p = src.getpixel((x, y + n))
            elif y < y_cut:
                p = src.getpixel((x, y_cut))
            else:
                continue
            im.putpixel((x, y), p)
    return im


# ------------------------------------------------------------------ recolour
def remap(frames, classify, ramps):
    """classify(x, y, p) -> class name or None (keep). Each class: its source colours ranked by luminance onto its ramp."""
    seen = {}
    for f in frames:
        for y in range(f.height):
            for x in range(f.width):
                p = f.getpixel((x, y))
                if not p[3]:
                    continue
                c = classify(x, y, p)
                if c:
                    seen.setdefault(c, set()).add(p[:3])
    maps = {}
    for c, cols in seen.items():
        ramp = [hx(r) for r in ramps[c]]
        s = sorted(cols, key=lum)
        maps[c] = {col: ramp[min(len(ramp) - 1, int(i / max(1, len(s)) * len(ramp)))] for i, col in enumerate(s)}
    out = []
    for f in frames:
        g = f.copy()
        for y in range(f.height):
            for x in range(f.width):
                p = f.getpixel((x, y))
                if not p[3]:
                    continue
                c = classify(x, y, p)
                if c:
                    g.putpixel((x, y), maps[c][p[:3]])
        out.append(g)
    return out


TM_RAMPS = {
    "body": ["#1c0c24", "#2f1640", "#48225c", "#663278", "#874a92", "#a868a6", "#c890b8"],
    "leaf": ["#0e1a10", "#1a2e18", "#2a4422", "#3c5c2c", "#527636", "#6c9044"],
    "bone": ["#4a3a2a", "#7a6650", "#a8927a", "#cdbda2", "#ece0c8"],
    "maw": ["#3a0610", "#6a0c18", "#9a1622", "#c8282c", "#e8584a", "#f8907a"],
    "berry": ["#2a0610", "#560c1c", "#86162a", "#b42634", "#d84a4a"],
    "root": ["#160e0c", "#2a1c16", "#443022", "#604632", "#806248", "#a08462"],
    "throat": ["#12040a", "#240610", "#3a0a16"],
}


def tm_classify(x, y, p):
    """Thorn Mother regions in un-padded source coordinates."""
    h, s, v = hsv(p)
    in_body = ((x + 0.5 - 47) / 25.0) ** 2 + ((y + 0.5 - 41) / 31.0) ** 2 <= 1
    in_maw = ((x + 0.5 - 43) / 17.5) ** 2 + ((y + 0.5 - 50) / 19.0) ** 2 <= 1
    if s > 0.2 and 40 <= h <= 125 and v > 0.12:
        return "body" if (in_body and y >= 19) else "leaf"
    if s > 0.25 and (h >= 280 or h <= 15) and v > 0.12:
        if y >= 68 and not in_maw:
            return "root"
        if in_maw:
            return "maw"
        return "bone" if in_body else "berry"
    if v < 0.12 and in_maw and 32 <= y <= 66 and 28 <= x <= 60:
        return "throat"
    return None


# ------------------------------------------------------------------ anticipation poses
def thorn_mother_windup(f, k):
    """The maw opens wide: the head lifts at the throat line, the gap is more maw; the throat glows red (k = 1, 2)."""
    g = f.copy()
    y_cut = PAD_T + 45
    n = 2 if k == 1 else 5
    stretch_rows(g, y_cut, n, PAD_X + 14, PAD_X + 78)
    # throat glow: the dark maw interior warms to red, hottest at the back
    cx, cy = PAD_X + 43, PAD_T + 50 - n / 2
    for y in range(int(cy - 18), int(cy + 14)):
        for x in range(int(cx - 15), int(cx + 15)):
            p = g.getpixel((x, y))
            if p[3] and lum(p) < 40:
                d = ((x - cx) / 13.0) ** 2 + ((y - cy) / 10.0) ** 2
                if d < 1:
                    c = "#8a1020" if d < 0.25 * k else "#5a0a18" if d < 0.55 else "#3a0610"
                    put(g, x, y, c)
    # drool strings off the lower teeth
    for (x, L) in ((cx - 8, 3 + k), (cx + 6, 2 + k)):
        for j in range(L):
            if not opaque(g, int(x), int(cy + 9 + j)) or j > 0:
                put(g, x, cy + 9 + j, "#c8282c" if j < L - 1 else "#e8584a")
    return g


def brood_hive_windup(f, k):
    """The mound swells (rises 2 / 4 rows above its waist), egg lamps and veins flare, spores puff from its crown."""
    g = f.copy()
    n = 2 if k == 1 else 4
    stretch_rows(g, PAD_T + 34, n, PAD_X + 30, PAD_X + 92)
    for y in range(g.height):
        for x in range(g.width):
            p = g.getpixel((x, y))
            if not p[3]:
                continue
            h, s, v = hsv(p)
            if s > 0.45 and 20 <= h <= 55 and v > 0.55:                 # egg lamps / fire: hotter
                put(g, x, y, "#fff2c0" if v > 0.85 or k == 2 else "#ffd070")
            elif s > 0.5 and (h >= 340 or h <= 10) and v > 0.3 and k == 2:  # red veins flare
                put(g, x, y, "#e04434")
    for i, (x, y) in enumerate(((PAD_X + 52, PAD_T + 4 - n), (PAD_X + 60, PAD_T + 2 - n), (PAD_X + 46, PAD_T + 1 - n), (PAD_X + 66, PAD_T + 6 - n))):
        if i < 2 + k:
            for (dx, dy, c) in ((0, 0, "#c9d65a"), (1, 0, "#7f9a3c"), (0, -1, "#e6f0a0"), (-1, 0, "#7f9a3c"), (0, 1, "#56702c")):
                put(g, x + dx, y + dy - k, c)
    return g


def warden_windup(f, k):
    """The right arm cannon comes up to aim (the forearm lifts and swings out), its muzzle and the core charge red."""
    g = f.copy()
    before = g.copy()
    lift, out = (6, 0) if k == 1 else (11, 1)
    sel = lambda x, y: x >= PAD_X + 57 and PAD_T + 35 <= y <= PAD_T + 62
    shift_region(g, sel, out, -lift)
    # charge glow at the muzzle (the forearm's tip), bigger on k == 2
    mx, my = PAD_X + 64 + out, PAD_T + 57 - lift
    r = 1.6 if k == 1 else 2.6
    for y in range(int(my - r) - 1, int(my + r) + 2):
        for x in range(int(mx - r) - 1, int(mx + r) + 2):
            d = (x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2
            if d <= r * r:
                put(g, x, y, "#fff0e0" if d < (r * 0.45) ** 2 else "#ff5040" if d < (r * 0.8) ** 2 else "#c01828")
    if k == 2:
        for (dx, dy) in ((-4, -1), (4, 1), (-2, 4), (3, -4)):
            put(g, mx + dx, my + dy, "#ff5040")
    # the chest core brightens
    for y in range(g.height):
        for x in range(g.width):
            p = g.getpixel((x, y))
            h, s, v = hsv(p)
            if p[3] and s > 0.6 and (h >= 345 or h <= 12) and v > 0.5 and y < PAD_T + 40:
                put(g, x, y, "#ff6a50" if v > 0.75 else "#e83a30")
    outline_new(g, before)
    return g


def engine_windup(f, k):
    """Pressure builds: steam jets out of the valves (taller on k == 2), the furnace eye goes white-hot, it shudders."""
    g = f.copy()
    if k == 2:
        shift_region(g, lambda x, y: y < PAD_T + 70, 1, 0)
    for y in range(g.height):
        for x in range(g.width):
            p = g.getpixel((x, y))
            h, s, v = hsv(p)
            if p[3] and s > 0.4 and 20 <= h <= 50 and v > 0.7:
                put(g, x, y, "#fff2c0" if (v > 0.85 or k == 2) else "#ffd070")
    sh = 1 if k == 2 else 0
    for vi, (vx, vy) in enumerate(((PAD_X + 36 + sh, PAD_T + 17), (PAD_X + 49 + sh, PAD_T + 19), (PAD_X + 63 + sh, PAD_T + 19))):
        n = 2 if k == 1 else 4
        for j in range(n):
            r = 1.3 + j * 0.7
            puff(g, vx + (j % 2) * (1 if vi % 2 else -1), vy - 2 - j * 3.2, r)
    return g


def puff(g, cx, cy, r):
    """A steam puff: an opaque round blob, lit on its top-left (white -> grey)."""
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            dx, dy = (x + 0.5 - cx) / r, (y + 0.5 - cy) / r
            d = dx * dx + dy * dy
            if d <= 1:
                put(g, x, y, "#f4f8f8" if (dx + dy < -0.4) else "#c4d0d4" if d < 0.7 or dx + dy < 0.5 else "#8a989e")


# ------------------------------------------------------------------ phase 2
def align(f, ref, mask_fn):
    """Best (dx, dy) in [-2, 2] so f's mask matches ref's."""
    ra = {(x, y) for y in range(0, ref.height, 2) for x in range(0, ref.width, 2) if mask_fn(ref, x, y)}
    best, bo = -1, (0, 0)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            n = sum(1 for (x, y) in ra if mask_fn(f, x + dx, y + dy))
            if n > best:
                best, bo = n, (dx, dy)
    return bo


def crack_paths(seed, starts, steps=10, spread=0.6):
    """Random-walk crack polylines from start points (x, y, angle)."""
    paths = []
    for i, (x, y, a) in enumerate(starts):
        pts = [(x, y)]
        for j in range(steps):
            a += (h2(i, j, seed) - 0.5) * spread * 2
            x += math.cos(a) * 1.0
            y += math.sin(a) * 1.0
            pts.append((x, y))
            if h2(j, i, seed + 3) < 0.12:                                  # a short branch
                b = a + (0.9 if h2(i, j, seed + 5) < 0.5 else -0.9)
                bx, by = x, y
                br = []
                for _ in range(3):
                    bx += math.cos(b)
                    by += math.sin(b)
                    br.append((bx, by))
                paths.append([(x, y)] + br)
        paths.append(pts)
    return paths


def phase2(f, i, ref, cfg):
    """Cracks with a glowing core, a heat-tinted outline, a hotter eye/core, and wisps round the silhouette."""
    g = f.copy()
    dead = i == 7
    dx, dy = align(f, ref, cfg["mask"]) if i != 7 else (0, 0)
    hot, mid, dark = cfg["glow"]
    rim = cfg.get("rim", dark)
    if not dead:
        # the outline picks up the heat (dark texels on the silhouette edge)
        src = g.copy()
        for y in range(g.height):
            for x in range(g.width):
                p = src.getpixel((x, y))
                if p[3] and lum(p) < 30 and any(not opaque(src, x + ox, y + oy) for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    put(g, x, y, rim)
    for path in cfg["paths"]:
        for (x, y) in path:
            X, Y = int(round(x)) + dx, int(round(y)) + dy
            if not cfg["mask"](f, X, Y):
                continue
            put(g, X, Y, dark if dead else (hot if h2(X, Y, i) < 0.6 else mid))
            if dead:
                continue
            if cfg["mask"](f, X - 1, Y) and h2(X, Y, 5) < 0.5:
                put(g, X - 1, Y, mid)
            if cfg["mask"](f, X + 1, Y + 1):
                put(g, X + 1, Y + 1, dark)
    if not dead:
        cfg["eye"](g, i)
        wisp = cfg["wisp"]
        for k in range(cfg.get("wisps", 6)):
            wx = int(PAD_X + h2(k, 1, 77) * (g.width - 2 * PAD_X))
            wy = int(PAD_T + 4 + h2(k, 2, 77) * 18)
            wy -= (i * 2 + k * 3) % 9
            if wy < 0 or opaque(g, wx, wy):
                continue
            put(g, wx, wy, wisp[0])
            if not opaque(g, wx + 1, wy):
                put(g, wx + 1, wy, wisp[1])
            if not opaque(g, wx, wy - 1) and (k + i) % 2:
                put(g, wx, wy - 1, wisp[1])
    return g


def recolor_eye(cond, colours):
    def f(g, i):
        for y in range(g.height):
            for x in range(g.width):
                p = g.getpixel((x, y))
                if p[3] and cond(x, y, p):
                    v = hsv(p)[2]
                    put(g, x, y, colours[0] if v > 0.8 else colours[1] if v > 0.55 else colours[2])
    return f


def body_mask(fn):
    return lambda im, x, y: opaque(im, x, y) and fn(im.getpixel((x, y)), x, y)


def nonglow(p, x, y):
    h, s, v = hsv(p)
    return v > 0.16 and not (s > 0.45 and v > 0.6)


CFG = {
    "boss_thorn_mother": dict(
        glow=("#ff5a3c", "#d0202c", "#2a0610"),
        mask=body_mask(lambda p, x, y: nonglow(p, x, y) and 250 <= hsv(p)[0] <= 320 and hsv(p)[1] > 0.2),
        paths=crack_paths(11, [(PAD_X + 30, PAD_T + 22, 2.2), (PAD_X + 62, PAD_T + 24, 1.0), (PAD_X + 26, PAD_T + 60, 2.0),
                               (PAD_X + 66, PAD_T + 58, 1.2), (PAD_X + 47, PAD_T + 18, 1.6), (PAD_X + 25, PAD_T + 40, 1.8),
                               (PAD_X + 68, PAD_T + 40, 1.3), (PAD_X + 55, PAD_T + 66, 0.4)], steps=14),
        rim="#5a0a18",
        eye=recolor_eye(lambda x, y, p: hsv(p)[1] > 0.4 and (hsv(p)[0] >= 340 or hsv(p)[0] <= 15) and hsv(p)[2] > 0.5 and
                        ((x - PAD_X - 43) / 17.5) ** 2 + ((y - PAD_T - 50) / 19.0) ** 2 <= 1, ("#ffb090", "#ff5a3c", "#c8282c")),
        wisp=("#b42634", "#6a0c18"), wisps=7),
    "boss_brood_hive": dict(
        glow=("#ffd070", "#f07a1c", "#1e0a12"),
        mask=body_mask(lambda p, x, y: nonglow(p, x, y) and x > PAD_X + 30 and y < PAD_T + 70),
        paths=crack_paths(21, [(PAD_X + 50, PAD_T + 10, 1.8), (PAD_X + 70, PAD_T + 18, 1.3), (PAD_X + 40, PAD_T + 30, 2.4),
                               (PAD_X + 80, PAD_T + 40, 1.6), (PAD_X + 60, PAD_T + 30, 1.5), (PAD_X + 58, PAD_T + 6, 1.2),
                               (PAD_X + 74, PAD_T + 52, 2.0)], steps=15),
        rim="#5a2a08",
        eye=recolor_eye(lambda x, y, p: hsv(p)[1] > 0.45 and 20 <= hsv(p)[0] <= 55 and hsv(p)[2] > 0.55, ("#fff2c0", "#ffd070", "#f0a030")),
        wisp=("#c9d65a", "#7f9a3c"), wisps=8),
    "boss_warden": dict(
        glow=("#ff6a50", "#e02828", "#14141c"),
        mask=body_mask(lambda p, x, y: nonglow(p, x, y) and y < PAD_T + 84),
        paths=crack_paths(31, [(PAD_X + 22, PAD_T + 20, 1.6), (PAD_X + 56, PAD_T + 22, 1.4), (PAD_X + 30, PAD_T + 50, 1.7),
                               (PAD_X + 48, PAD_T + 56, 1.4), (PAD_X + 16, PAD_T + 40, 1.5), (PAD_X + 62, PAD_T + 40, 1.6),
                               (PAD_X + 36, PAD_T + 38, 1.2), (PAD_X + 44, PAD_T + 70, 1.6)], steps=13),
        eye=recolor_eye(lambda x, y, p: hsv(p)[1] > 0.55 and (hsv(p)[0] >= 345 or hsv(p)[0] <= 12) and hsv(p)[2] > 0.45 and y < PAD_T + 45,
                        ("#ffb090", "#ff4a36", "#d01c20")),
        rim="#4a0c10",
        wisp=("#ff6a50", "#8a1414"), wisps=5),
    "boss_drowned_engine": dict(
        glow=("#ffd070", "#ff7a1c", "#1a0c06"),
        mask=body_mask(lambda p, x, y: nonglow(p, x, y) and y < PAD_T + 70 and x > PAD_X + 30),
        paths=crack_paths(41, [(PAD_X + 40, PAD_T + 28, 0.4), (PAD_X + 60, PAD_T + 30, 1.4), (PAD_X + 70, PAD_T + 50, 2.6),
                               (PAD_X + 50, PAD_T + 56, 0.2), (PAD_X + 78, PAD_T + 36, 1.9), (PAD_X + 56, PAD_T + 44, 0.8),
                               (PAD_X + 84, PAD_T + 48, 2.2)], steps=14),
        rim="#5a2a08",
        eye=recolor_eye(lambda x, y, p: hsv(p)[1] > 0.4 and 20 <= hsv(p)[0] <= 50 and hsv(p)[2] > 0.65, ("#fff2c0", "#ffd070", "#ff7a1c")),
        wisp=("#e8f0f4", "#94a4ac"), wisps=8),
}

WINDUP = {"boss_thorn_mother": thorn_mother_windup, "boss_brood_hive": brood_hive_windup,
          "boss_warden": warden_windup, "boss_drowned_engine": engine_windup}


def strip_of(frames):
    w, h = frames[0].size
    out = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * w, 0))
    return out


def hard(im):
    a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    im.putalpha(a)
    return im


def main():
    manifest = {}
    sheets = []
    for key, (fw, fh, (ax, ay)) in SRC.items():
        src = frames_of(key)[:8]
        if key == "boss_thorn_mother":
            src = remap(src, tm_classify, TM_RAMPS)
            hurt = src[0].copy()                     # the hurt frame: frame 0 flashed red (the source hurt tint remaps badly)
            for y in range(hurt.height):
                for x in range(hurt.width):
                    q = hurt.getpixel((x, y))
                    if q[3]:
                        hurt.putpixel((x, y), (min(255, int(q[0] * 0.6 + 255 * 0.4)), int(q[1] * 0.6 + 80 * 0.4),
                                               int(q[2] * 0.6 + 70 * 0.4), 255))
            src[6] = hurt
        fr = [pad(f) for f in src]
        w1 = WINDUP[key](fr[0], 1)
        w2 = WINDUP[key](fr[0], 2)
        p1 = fr + [w1, w2]
        p2 = [phase2(f, i, p1[0], CFG[key]) for i, f in enumerate(p1)]
        for name, frames in ((key, p1), (key + "_p2", p2)):
            im = hard(strip_of(frames))
            check_alpha(im)
            im.save(SPRITES / f"{name}.png")
            manifest[name] = {"file": f"{name}.png", "ppu": 32, "frames": 10, "fw": fw + 2 * PAD_X, "fh": fh + PAD_T,
                              "anchor": [ax + PAD_X, ay + PAD_T], "fps": 8,
                              "anims": {"idle": [0, 1, 2, 3], "attack": [4, 5], "hurt": [6], "dead": [7], "windup": [8, 9]},
                              "animFps": dict(ANIMFPS)}
            sheets.append((name, im, fw + 2 * PAD_X))
            print(name, im.size)
    (HERE / "manifest_entries.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
    # review sheet
    S = 2
    W = max(im.width for _, im, _ in sheets) * S
    H = sum(im.height * S + 16 for _, im, _ in sheets)
    out = Image.new("RGBA", (W, H), (24, 24, 30, 255))
    y = 0
    for name, im, fw in sheets:
        cell = Image.new("RGBA", im.size, (52, 58, 50, 255))
        cell.alpha_composite(im)
        out.alpha_composite(cell.resize((im.width * S, im.height * S), Image.NEAREST), (0, y + 12))
        y += im.height * S + 16
    out.save(SCRATCH / "bosses_v4.png")


if __name__ == "__main__":
    main()
