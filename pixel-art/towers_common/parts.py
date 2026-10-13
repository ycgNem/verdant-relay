"""Reusable tower parts (foundations, rivets, barrels...)."""
from tw import *  # noqa: F401,F403


def footing(c, cx=16, ytop=42, ybot=43, rx=10, ry=3, seed=1, moss=True, stripes=False):
    """Cracked concrete footing drum at the bottom of a 32x48 tower frame (bottom row 46)."""
    c.drum(cx, ytop, ybot, rx, ry, ["#3a4466", "#3a4466", "#5a6988", "#8b9bb4", "#8b9bb4"],
           top="#8b9bb4")
    # top cap: lighter lit back rim, speckle
    rows = ell_rows(cx, ytop, rx, ry)
    for a, b, y in rows:
        if y < ytop:
            c.hline(a, a + (b - a) * 2 // 3, y, "#c0cbdc")
    c.ell(cx, ytop, rx - 1, ry - 1, "#8b9bb4")
    # a couple of chips and a crack on the slab top (clusters, not noise)
    c.pts([(cx - 6, ytop - 1), (cx - 5, ytop - 1), (cx + 4, ytop + 1)], "#c0cbdc")
    c.pts([(cx + 5, ytop - 1), (cx + 6, ytop), (cx + 7, ytop)], "#5a6988")
    # front lip: top edge of the side face catches light
    for a, b, y in rows:
        if y == ytop + ry:
            c.hline(a + 1, b - 1, y + 1, "#5a6988")
    # crack on side face
    c.pts([(cx - rx + 4, ybot - 1), (cx - rx + 5, ybot), (cx - rx + 5, ybot + 1), (cx - rx + 6, ybot + 2)], "#262b44")
    c.pts([(cx + rx - 5, ybot), (cx + rx - 6, ybot + 1)], "#262b44")
    if stripes:
        # hazard band on the side face
        y0 = ybot - 1
        for x in range(cx - rx + 1, cx + rx - 1):
            for y in range(y0, y0 + 2):
                if ((x + y) // 2) % 2 == 0:
                    c.px(x, y, "#feae34" if x < cx + rx // 2 else "#f77622")
                else:
                    c.px(x, y, "#262b44")
    if moss:
        mx = cx - rx
        # moss creeping up from the ground on the lit left side
        c.pts([(mx, ybot + 1), (mx + 1, ybot + 1), (mx + 1, ybot + 2), (mx + 2, ybot + 2), (mx + 2, ybot + 3),
               (mx + 3, ybot + 3), (mx + 4, ybot + 3), (mx, ybot), (mx + 1, ybot)], "#3e8948")
        c.pts([(mx, ybot - 1), (mx + 1, ybot), (mx + 3, ybot + 2)], "#63c74d")
        c.pts([(cx + rx - 3, ybot + 2), (cx + rx - 4, ybot + 3), (cx + rx - 2, ybot + 1)], "#265c42")


def rivet(c, x, y, lit="#c0cbdc", dark=None):
    c.px(x, y, lit)
    if dark:
        c.px(x + 1, y + 1, dark)


def hbarrel(c, x0, x1, y, ramp=STEEL, thick=3, muzzle=True, brake=False):
    """Horizontal barrel pointing right, top row at y."""
    if thick == 3:
        cols = [ramp[3], ramp[2], ramp[1]]
    elif thick == 2:
        cols = [ramp[3], ramp[1]]
    else:
        cols = [ramp[4], ramp[3], ramp[2], ramp[1]]
    for i, col in enumerate(cols):
        c.hline(x0, x1, y + i, col)
    # specular streak near the breech
    c.hline(x0 + 1, x0 + max(1, (x1 - x0) // 2), y, ramp[4])
    if muzzle:
        c.vline(x1, y - 1, y + thick, ramp[2])
        c.px(x1, y - 1, ramp[3])
        c.px(x1, y + thick, ramp[0])
        c.px(x1 + 0, y + thick // 2, ramp[1])
    if brake:
        c.vline(x1 - 2, y - 1, y + thick, ramp[3])
        c.px(x1 - 2, y + thick, ramp[1])
        c.vline(x1 - 1, y, y + thick - 1, ramp[0])


def muzzle_flash(c, x, y, size=1):
    """fx layer: star flash centred at (x,y) — extends right."""
    c.fx()
    if size >= 2:
        c.pattern(x - 1, y - 3, [
            "..y..",
            "..ya.",
            ".yawy",
            "yawwwy",
            ".yawy",
            "..ya.",
            "..y..",
        ], {"y": "#feae34", "a": "#fee761", "w": WHITE})
    else:
        c.pattern(x - 1, y - 2, [
            ".y..",
            "yawy",
            ".wwa",
            "yawy",
            ".y..",
        ], {"y": "#feae34", "a": "#fee761", "w": WHITE})
    c.body()


def smoke(c, x, y, big=False):
    c.fx()
    if big:
        c.pattern(x, y, [".gg.", "glgg", "gggd", ".dd."], {"g": "#8b9bb4", "l": "#c0cbdc", "d": "#5a6988"})
    else:
        c.pattern(x, y, [".g.", "gld", ".d."], {"g": "#8b9bb4", "l": "#c0cbdc", "d": "#5a6988"})
    c.body()


def mound(c, cx=16, cy=43, rx=11, ry=3, seed=2, stones=True):
    """Earth-and-root mound footprint for organic towers (bottom row 46)."""
    c.ell(cx, cy, rx, ry, "#3e2731")
    c.ell(cx - 1, cy - 1, rx - 1, ry - 1, "#733e39")
    # lit top-left soil
    for a, b, y in ell_rows(cx - 1, cy - 1, rx - 1, ry - 1):
        if y <= cy - 2:
            c.hline(a + 1, a + (b - a) // 2, y, "#b86f50")
    # moss tufts across the top
    c.pts([(cx - rx + 2, cy - 1), (cx - rx + 3, cy - 1), (cx - rx + 3, cy - 2), (cx - 3, cy - 3),
           (cx - 2, cy - 3), (cx + 4, cy - 2), (cx + 5, cy - 2), (cx + rx - 3, cy)], "#3e8948")
    c.pts([(cx - rx + 2, cy - 2), (cx - 2, cy - 4), (cx + 5, cy - 3)], "#63c74d")
    if stones:
        # three stones with lit tops
        for sx, sy, w in ((cx - rx + 1, cy + 0, 3), (cx + rx - 5, cy - 1, 4), (cx + 1, cy + 2, 3)):
            c.rect(sx, sy, sx + w - 1, sy + 1, "#5a6988")
            c.hline(sx, sx + w - 2, sy, "#8b9bb4")
            c.px(sx + w - 1, sy + 1, "#3a4466")


def thorn(c, x, y, dx, dy, length, ramp=("#3e2731", "#a22633", "#e43b44"), tip="#ead4aa", wide=True):
    """Tapered thorn from base (x,y) in direction (dx,dy). Lit side (left/up) gets the light shade."""
    import math as _m
    n = _m.hypot(dx, dy) or 1
    ux, uy = dx / n, dy / n
    # perpendicular toward the light (up-left)
    px_, py_ = -uy, ux
    if px_ + py_ > 0:
        px_, py_ = -px_, -py_
    for t in range(length):
        X = int(round(x + ux * t))
        Y = int(round(y + uy * t))
        last = t == length - 1
        c.px(X, Y, tip if last else ramp[1])
        if wide and t < length // 2:
            c.px(int(round(X + px_)), int(round(Y + py_)), ramp[2])
            c.px(int(round(X - px_)), int(round(Y - py_)), ramp[0])
    return c


def spike(c, bx, by, ang_deg, L, w=3, ramp=("#3e2731", "#a22633", "#e43b44"), tip="#ead4aa", tip_n=2,
          upper=None, split=0.4):
    """Triangular thorn: base centred at (bx,by), width w, pointing at ang_deg (0=right, -90=up).
    Light side (toward up-left) uses ramp[2], shadow side ramp[0], body ramp[1]."""
    import math as _m
    a = _m.radians(ang_deg)
    ux, uy = _m.cos(a), _m.sin(a)
    px_, py_ = -uy, ux
    # make p point toward the light (up-left): dot with (-1,-1) positive
    if (-px_ - py_) < 0:
        px_, py_ = -px_, -py_
    hw = w / 2.0
    tipx, tipy = bx + ux * L, by + uy * L
    pts = [(bx + px_ * hw, by + py_ * hw), (tipx, tipy), (bx - px_ * hw, by - py_ * hw)]
    c.poly([(round(x), round(y)) for x, y in pts], ramp[1])
    # lit edge
    c.line(round(bx + px_ * hw), round(by + py_ * hw), round(tipx), round(tipy), ramp[2])
    # shadow edge (only along the base half)
    mx, my = bx - px_ * hw + ux * L * 0.5, by - py_ * hw + uy * L * 0.5
    c.line(round(bx - px_ * hw), round(by - py_ * hw), round(mx), round(my), ramp[0])
    if upper:
        # recolour the outer part of the spike (e.g. bone-coloured thorn with a dark root)
        for i, col in enumerate(ramp):
            pass
        sx0, sy0 = bx + ux * L * split, by + uy * L * split
        sub = [(sx0 + px_ * hw * (1 - split), sy0 + py_ * hw * (1 - split)), (tipx, tipy),
               (sx0 - px_ * hw * (1 - split), sy0 - py_ * hw * (1 - split))]
        sub = [(round(x), round(y)) for x, y in sub]
        for old, new in zip(ramp, upper):
            pass
        c.poly(sub, upper[1], only="opaque")
        c.line(sub[0][0], sub[0][1], sub[1][0], sub[1][1], upper[2])
        c.line(sub[2][0], sub[2][1], round(sx0 - px_ * hw * 0.2 + ux * 2), round(sy0 - py_ * hw * 0.2 + uy * 2), upper[0])
    for t in range(tip_n):
        c.px(round(tipx - ux * t), round(tipy - uy * t), tip)
    return round(tipx), round(tipy)
