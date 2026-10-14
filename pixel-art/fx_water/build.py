"""Verdant Relay - water interaction decals (critic H #6). Flat ground decals, centred on the feet.

fx_ripple  24x8,  3 frames (loop)      rings spreading from a wading character's legs
fx_splash  16x16, 4 frames (one-shot)  entry splash: impact ring, crown of droplets, droplets falling back

Colours: the water ramp of public/terrain/water_mud.png (#011813 / #03392e) extended upward in the same
hue for the crests (#0e5a48, #2f8f76) plus one highlight (#a8e6d2). Light from the top-left: the crest
arc facing the light takes the highlight, the trough behind it the darkest water tone.
Run: python pixel-art/fx_water/build.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
from v3lib import Grid, save_sprite, report, board, strip, up, zoomgrid, row, SCRATCH  # noqa: E402
from PIL import Image  # noqa: E402

W0 = "#011813"   # trough (darkest water, from water_mud.png)
WB = "#03392e"   # water body (from water_mud.png) - preview background only
L1 = "#0e5a48"   # ring, fading
L2 = "#2f8f76"   # crest
HI = "#a8e6d2"   # highlight


def ring_pts(cx, cy, rx, ry, n=360):
    """1-px ellipse ring as an ordered, de-cornered pixel list with each pixel's angle."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        p = (int(math.floor(cx + rx * math.cos(a))), int(math.floor(cy + ry * math.sin(a))))
        if not pts or pts[-1][0] != p:
            pts.append((p, a))
    if pts[0][0] == pts[-1][0]:
        pts.pop()
    # drop L-corners: b is redundant when its neighbours a and c touch diagonally
    changed = True
    while changed:
        changed = False
        out = []
        m = len(pts)
        for i in range(m):
            a, b, c = pts[i - 1][0], pts[i][0], pts[(i + 1) % m][0]
            if abs(a[0] - c[0]) == 1 and abs(a[1] - c[1]) == 1 and b != a and b != c:
                changed = True
                pts[i] = (None, pts[i][1])
                break
        pts = [p for p in pts if p[0] is not None]
    return pts


def light_k(a):
    """How much the ring direction at angle a faces the top-left light (1 = straight at it)."""
    return -(math.cos(a) + math.sin(a)) / math.sqrt(2)


def draw_ring(g, cx, cy, rx, ry, base=L2, hi=HI, keep=None, trough=True, hi_k=0.72, front_glint=False):
    """keep(angle) -> bool lets a ring break up as it fades. front_glint: sky glints on the front-left arc too
    (a wading body hides the back arc, so the front half has to carry the read)."""
    pts = ring_pts(cx, cy, rx, ry)
    for (x, y), a in pts:
        if keep and not keep(a):
            continue
        k = light_k(a)
        deg = math.degrees(a) % 360
        glint = front_glint and hi and 100 <= deg <= 150 and (x % 3 != 2)
        g.px(x, y, hi if (hi and (k > hi_k or glint)) else base)
    if trough:
        for (x, y), a in pts:
            if keep and not keep(a):
                continue
            k = light_k(a)
            if k > 0.5:      # lit outer face -> shadow just inside the crest
                ix = x + (1 if math.cos(a) < -0.4 else 0)
                iy = y + (1 if math.sin(a) < -0.4 else 0)
                g.px(ix, iy, W0, only="empty")
            elif k < -0.6:   # unlit outer face -> shadow just outside
                ox = x + (1 if math.cos(a) > 0.4 else 0)
                oy = y + (1 if math.sin(a) > 0.4 else 0)
                g.px(ox, oy, W0, only="empty")


# --------------------------------------------------------------------------- ripple
def ripple(f):
    g = Grid(24, 8)
    cx, cy = 12.0, 4.0
    if f == 0:
        draw_ring(g, cx, cy, 10.6, 3.4, base=L1, hi=None, trough=False,
                  keep=lambda a: math.cos(a) ** 2 > 0.35 and (int(a * 6) % 3 != 1))
        draw_ring(g, cx, cy, 5.6, 1.9, front_glint=True)
    elif f == 1:
        draw_ring(g, cx, cy, 11.6, 3.7, base=L1, hi=None, trough=False,
                  keep=lambda a: math.cos(a) ** 2 > 0.75 and (int(a * 5) % 2 == 0))
        draw_ring(g, cx, cy, 7.8, 2.6, front_glint=True)
    else:
        draw_ring(g, cx, cy, 9.8, 3.15, base=L1, hi=L2, trough=False, keep=lambda a: (int(a * 7) % 4 != 3))
        draw_ring(g, cx, cy, 3.9, 1.35, trough=False, front_glint=True)
    return g


# --------------------------------------------------------------------------- splash
def drop(g, x, y, big=False):
    """A droplet: highlight on top-left, crest tone under it."""
    g.px(x, y, HI)
    if big:
        g.px(x + 1, y, L2)
        g.px(x, y + 1, L2)
        g.px(x + 1, y + 1, L1)
    else:
        g.px(x, y + 1, L2)


def spike(g, x0, y0, h, lean, front=False):
    """A thrown-up column of water: rises h px from (x0, y0), drifting outward by `lean` px per 3 px.
    Tip = highlight; body = crest tone; a front spike keeps a darker foot so it sits in front of the ring."""
    for k in range(h + 1):
        x = x0 + int(round(lean * k / 3))
        y = y0 - k
        if k == h:
            c = HI
        elif front and k == 0:
            c = L1
        else:
            c = L2
        g.px(x, y, c)


def splash(f):
    g = Grid(16, 16)
    cx, cy = 8.0, 11.0         # the entry point (droplets need the headroom above)
    if f == 0:
        # impact: the water bulges up in a low bright mound, the rim starts to lift
        draw_ring(g, cx, cy, 4.2, 1.5, trough=False)
        for x, h, ln in ((5, 2, -1), (7, 3, 0), (9, 3, 0), (11, 2, 1)):
            spike(g, x, 10, h, ln)
        g.px(8, 9, L2)
        g.px(8, 8, HI)
        for x in range(6, 11):
            g.px(x, 11, L2, only="empty")
        g.px(7, 12, L1, only="empty")
        g.px(8, 12, L1, only="empty")
        g.px(9, 12, L1, only="empty")
    elif f == 1:
        # crown: separate spikes leaning outward like a tulip, droplets flung off the tips
        draw_ring(g, cx, cy, 5.5, 2.0)
        for x, h, ln in ((3, 3, -2), (5, 5, -1), (8, 4, 0), (11, 5, 1), (13, 3, 2)):   # back rim
            spike(g, x, 9, h, ln)
        for x, h, ln in ((4, 2, -1), (7, 2, 0), (10, 3, 0), (12, 2, 1)):              # front rim
            spike(g, x, 12, h, ln, front=True)
        for (x, y) in ((2, 3), (13, 2), (8, 2), (6, 1), (10, 0)):
            g.px(x, y, HI)
            g.px(x, y + 1, L2)
    elif f == 2:
        # crown collapses into a wider broken ring; droplets at the top of their arc, spreading
        draw_ring(g, cx, cy, 6.6, 2.5, keep=lambda a: int(a * 6) % 4 != 2)
        for x, h, ln in ((4, 1, -1), (9, 2, 0), (12, 1, 1)):
            spike(g, x, 9, h, ln)
        for (x, y, big) in ((1, 4, True), (13, 3, True), (5, 2, False), (11, 1, False), (8, 4, False)):
            drop(g, x, y, big)
    else:
        # droplets fall back: tiny rings on the surface, the big ring fades and breaks
        draw_ring(g, cx, cy, 7.3, 2.9, base=L1, hi=L2, trough=False, keep=lambda a: int(a * 5) % 3 != 1)
        for (x, y) in ((0, 8), (14, 7), (3, 14), (12, 14)):
            g.px(x, y, L2)
            g.px(x + 1, y, L1)
        g.px(6, 7, HI)
        g.px(10, 6, L2)
    return g


if __name__ == "__main__":
    rip = [ripple(i) for i in range(3)]
    spl = [splash(i) for i in range(4)]
    save_sprite("fx_ripple", strip(rip))
    save_sprite("fx_splash", strip(spl))
    report("fx_ripple", rip)
    report("fx_splash", spl)
    # previews on the real water colour, x8, plus frames side by side
    def on_water(im, pad=4):
        bg = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), Image.new("RGB", (1, 1), WB).getpixel((0, 0)) + (255,))
        bg.alpha_composite(im, (pad, pad))
        return bg
    items = [(f"ripple{i}", on_water(f.image())) for i, f in enumerate(rip)] + [(f"splash{i}", on_water(f.image())) for i, f in enumerate(spl)]
    board(items, 8, bg=(20, 30, 28), cols=7).save(SCRATCH / "fx_water_x8.png")
    row([zoomgrid(f.image(), 14) for f in rip]).save(SCRATCH / "z_ripple.png")
    row([zoomgrid(f.image(), 14) for f in spl]).save(SCRATCH / "z_splash.png")
