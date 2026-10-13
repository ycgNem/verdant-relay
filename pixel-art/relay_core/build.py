"""relay_core (96x112): the heart of the defense. A transit-station power hub: stepped concrete
plinth with a station sign, a transformer with ceramic bushings, a rust-painted generator cabinet
with gauges, a lattice antenna mast with a dish and aviation light, heavy cables, and a big cyan
crystal held in a steel cradle.
Frames: idle 4 (glow pulse: dim, mid, bright, mid)."""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "towers_common"))
from tw import *  # noqa

W, H = 96, 112
CX = 48
CONC_TOP = ["#5a6988", "#8b9bb4", "#c0cbdc"]
CONC_FRONT = ["#262b44", "#3a4466", "#5a6988", "#8b9bb4"]
MOSS = ["#193c3e", "#265c42", "#3e8948", "#63c74d"]
CAB = ["#262b44", "#3a4466"]


# ------------------------------------------------------------------ plinth
def plinth(c, p):
    # lower step
    c.box(2, 93, 98, 4, 110, CONC_TOP[1], CONC_FRONT[2], lit=CONC_TOP[2], dark=CONC_FRONT[1], edge=CONC_FRONT[3])
    c.hline(3, 92, 98, CONC_TOP[2])
    c.hline(2, 93, 110, CONC_FRONT[1])
    c.hline(3, 92, 109, CONC_FRONT[1])
    # upper block
    c.box(7, 88, 74, 12, 99, CONC_TOP[1], CONC_FRONT[2], lit=CONC_TOP[2], dark=CONC_FRONT[1], edge=CONC_FRONT[3])
    c.hline(8, 87, 74, CONC_TOP[2])
    # top face: slab joints and wear
    for x in (27, 47, 68):
        c.line(x, 75, x - 2, 85, CONC_TOP[0])
    c.hline(8, 87, 80, CONC_TOP[0]) if False else None
    for (x, y, w) in ((12, 77, 3), (36, 83, 2), (58, 76, 3), (80, 84, 2), (20, 84, 2)):
        c.hline(x, x + w - 1, y, CONC_TOP[2])
    for (x, y, w) in ((15, 81, 2), (52, 85, 3), (74, 78, 2), (40, 77, 2)):
        c.hline(x, x + w - 1, y, CONC_TOP[0])
    # front face: vertical panel seams, rust streaks under bolts
    for x in (23, 43, 64, 80):
        c.vline(x, 88, 98, CONC_FRONT[1])
        c.vline(x + 1, 88, 98, CONC_FRONT[3])
        c.px(x - 2, 89, CONC_FRONT[3])
        c.px(x + 3, 89, CONC_FRONT[3])
        c.pts([(x - 2, 90), (x - 2, 91), (x - 2, 92)], "#733e39")
    # hazard stripe on the lower step's top edge
    for x in (list(range(3, 7)) + list(range(89, 93))):
        for y in (99, 100, 101):
            c.px(x, y, "#feae34" if ((x + y) // 2) % 2 == 0 else "#262b44")
    for x in range(8, 88):
        y = 99
        if ((x // 3) % 2) == 0:
            c.px(x, y, "#feae34")
        else:
            c.px(x, y, "#262b44")
    # lower step front: cracks + drain slots
    for x in range(10, 88, 13):
        c.rect(x, 104, x + 3, 105, CONC_FRONT[0])
        c.hline(x, x + 3, 106, CONC_FRONT[3])
    for pts in ([(30, 88), (31, 89), (31, 90), (32, 91), (32, 92), (33, 93)],
                [(70, 103), (71, 104), (71, 105), (72, 106)],
                [(14, 92), (15, 93), (15, 94)],
                [(86, 76), (85, 77), (85, 78), (84, 79)]):
        c.pts(pts, CONC_FRONT[0] if pts[0][1] > 86 else CONC_TOP[0])
    # chipped corner
    c.erase(93, 98); c.erase(92, 98)
    c.pts([(91, 98), (93, 99)], CONC_FRONT[1])


def sign(c, p):
    """Old transit station sign bolted on the plinth front."""
    x0, y0, x1, y1 = 48, 88, 62, 96
    c.rect(x0, y0, x1, y1, "#124e89")
    c.hline(x0, x1, y0, "#0099db")
    c.vline(x1, y0, y1, "#262b44")
    c.hline(x0, x1, y1, "#262b44")
    # roundel-free generic transit glyph: white ring with a bar, then 'text' dashes
    c.circle(x0 + 3, y0 + 4, 2, WHITE, fill=False)
    c.hline(x0 + 1, x0 + 5, y0 + 4, "#e43b44")
    for (xx, ww) in ((x0 + 7, 2), (x0 + 10, 3)):
        c.hline(xx, xx + ww - 1, y0 + 3, WHITE)
        c.hline(xx, xx + ww - 1, y0 + 5, "#c0cbdc")
    # yellow route stripe
    c.hline(x0 + 1, x1 - 1, y1 - 1, "#feae34")
    # bolts + rust streak
    c.pts([(x0, y0), (x1, y0)], "#c0cbdc")
    c.pts([(x1 - 1, y1 + 1), (x1 - 1, y1 + 2)], "#733e39")


def moss(c):
    # creeping moss along the plinth base, up the lit left side, over the step
    pts2 = [(2, 108), (3, 108), (4, 107), (5, 107), (2, 107), (2, 106), (3, 105), (2, 104), (6, 106),
            (7, 99), (7, 98), (8, 97), (7, 96), (8, 95), (7, 94), (9, 98),
            (60, 109), (61, 108), (62, 108), (63, 109), (90, 108), (91, 107), (92, 108),
            (20, 101), (21, 100), (22, 101), (40, 102), (41, 101), (42, 101), (43, 102)]
    c.pts(pts2, MOSS[2])
    c.pts([(3, 106), (2, 105), (8, 96), (21, 99), (41, 100), (61, 107), (91, 106)], MOSS[3])
    c.pts([(4, 108), (6, 107), (9, 97), (22, 102), (62, 109), (43, 101)], MOSS[1])
    # draping vines over the upper block's front edge
    for (x, ln) in ((16, 6), (17, 3), (58, 5), (77, 7), (78, 4), (85, 3)):
        for i in range(ln):
            c.px(x + (1 if i % 3 == 2 else 0), 87 + i, MOSS[2] if i % 2 else MOSS[1])
        c.px(x, 87 + ln, MOSS[3])
        c.px(x - 1, 87 + ln // 2, MOSS[3])
    # fern clumps on the lower step corners
    c.pattern(84, 95, ["..g..g.", ".lg.gl.", "gglglgg", ".ddgdd."], {"g": MOSS[2], "l": MOSS[3], "d": MOSS[1]})
    c.pattern(3, 94, [".g..g..", "lg.gl..", "glglgg.", ".dgdd.."], {"g": MOSS[2], "l": MOSS[3], "d": MOSS[1]})
    # moss patches on the top face
    c.pts([(9, 75), (10, 75), (11, 76), (8, 76), (86, 86), (85, 85), (87, 85)], MOSS[2])
    c.pts([(10, 76), (86, 85)], MOSS[3])
    # vine tendril climbing the plinth front
    vine = [(9, 99), (10, 97), (10, 95), (11, 93), (11, 91), (12, 89), (13, 88)]
    for x, y in vine:
        c.px(x, y, MOSS[2])
    c.pts([(11, 96), (12, 92), (9, 94)], MOSS[3])


# ------------------------------------------------------------------ machinery
def transformer(c, p):
    x0, x1, top = 9, 29, 54
    c.box(x0, x1, top, 5, 83, STEEL[3], STEEL[2], lit=STEEL[3], dark=STEEL[0], edge=STEEL[4])
    c.hline(x0 + 1, x1 - 1, top, STEEL[4])
    # cooling fins across the front
    for x in range(x0 + 2, x1 - 1, 2):
        c.vline(x, top + 12, 81, STEEL[1])
        c.vline(x + 1, top + 12, 81, STEEL[3])
    c.hline(x0, x1, top + 11, STEEL[1])
    c.hline(x0, x1, 82, STEEL[1])
    c.hline(x0, x1, 83, STEEL[0])
    # warning plate
    c.rect(x0 + 3, top + 6, x0 + 9, top + 9, "#feae34")
    c.hline(x0 + 3, x0 + 9, top + 6, "#fee761")
    c.pts([(x0 + 6, top + 6), (x0 + 5, top + 7), (x0 + 6, top + 7), (x0 + 7, top + 8), (x0 + 6, top + 9)], INK)
    # rating plate + rust
    c.rect(x1 - 7, top + 6, x1 - 3, top + 8, STEEL[4])
    c.hline(x1 - 6, x1 - 4, top + 7, STEEL[1])
    c.pts([(x1 - 2, top + 8), (x1 - 2, top + 9), (x1 - 2, top + 10), (x0 + 4, top + 10)], RUST[1])
    c.pts([(x0 + 12, top + 13), (x0 + 12, top + 14)], RUST[2])
    # ceramic bushings on top (stacked sheds)
    for bx in (x0 + 5, x0 + 14):
        for i, y in enumerate((top - 1, top - 4, top - 7)):
            c.ell(bx, y + 1, 3 - (i == 2), 1, "#8b9bb4")
            c.ell(bx, y, 3 - (i == 2), 1, "#c0cbdc")
            c.px(bx - 2, y, WHITE)
        c.vline(bx - 1, top - 10, top - 8, STEEL[2])
        c.px(bx - 1, top - 10, STEEL[4])


def cabinet(c, p, k):
    x0, x1, top = 66, 87, 58
    c.box(x0, x1, top, 4, 83, RUST[3], RUST[2], lit=RUST[3], dark=RUST[1], edge=RUST[4])
    c.hline(x0 + 1, x1 - 1, top, RUST[4])
    # peeling paint -> bare steel
    for (x, y, w) in ((x0 + 1, top + 18, 3), (x1 - 4, top + 6, 2), (x0 + 9, top + 22, 4)):
        c.hline(x, x + w - 1, y, STEEL[2])
        c.hline(x + 1, x + w - 2, y + 1, STEEL[1])
    # door seam + handle
    c.vline(x0 + 11, top + 5, 82, RUST[1])
    c.rect(x0 + 13, top + 12, x0 + 13, top + 15, STEEL[3])
    c.px(x0 + 13, top + 16, STEEL[1])
    # gauge dial
    gx, gy = x0 + 5, top + 9
    c.circle(gx, gy, 3, STEEL[1])
    c.circle(gx, gy, 2, "#ead4aa")
    c.px(gx - 1, gy - 2, WHITE)
    needle = [(gx, gy), (gx + 1, gy - 1)] if k in (0, 3) else [(gx, gy), (gx + 1, gy - 1), (gx + 2, gy - 2)]
    if k == 2:
        needle = [(gx, gy), (gx + 1, gy), (gx + 2, gy - 1)]
    c.pts(needle, "#e43b44")
    c.px(gx, gy, INK)
    # LED status row
    leds = ["#63c74d", "#feae34", "#63c74d", "#e43b44"]
    for i in range(4):
        on = (i <= k) if k < 3 else (i != 3)
        c.px(x0 + 14 + i * 2, top + 7, leds[i] if on else "#3e2731")
    # vent grille
    for y in range(top + 19, top + 24, 2):
        c.hline(x0 + 13, x1 - 2, y, RUST[0])
        c.hline(x0 + 13, x1 - 2, y + 1, RUST[3])
    # stencil number
    c.pts([(x0 + 2, top + 15), (x0 + 3, top + 15), (x0 + 3, top + 16), (x0 + 2, top + 17), (x0 + 3, top + 17),
           (x0 + 5, top + 15), (x0 + 5, top + 16), (x0 + 5, top + 17)], "#ead4aa")
    c.hline(x0, x1, 83, RUST[0])
    # exhaust pipe on the roof
    c.rect(x1 - 6, top - 6, x1 - 4, top, STEEL[2])
    c.vline(x1 - 6, top - 6, top, STEEL[3])
    c.hline(x1 - 7, x1 - 3, top - 7, STEEL[1])
    c.hline(x1 - 7, x1 - 4, top - 7, STEEL[3])


def mast(c, p, k):
    """Lattice antenna mast rising from behind the cabinet."""
    bot, top = 58, 4
    xl0, xr0 = 74, 84      # rails at the bottom
    xl1, xr1 = 78, 80      # at the top
    def rail_x(x0, x1, y):
        t = (bot - y) / (bot - top)
        return int(round(x0 + (x1 - x0) * t))
    for y in range(top, bot + 1):
        c.px(rail_x(xl0, xl1, y), y, STEEL[3])
        c.px(rail_x(xr0, xr1, y), y, STEEL[1])
    # zig-zag bracing
    ys = list(range(bot, top, -6))
    for i in range(len(ys) - 1):
        y0, y1 = ys[i], ys[i + 1]
        if i % 2 == 0:
            c.line(rail_x(xl0, xl1, y0), y0, rail_x(xr0, xr1, y1), y1, STEEL[2])
        else:
            c.line(rail_x(xr0, xr1, y0), y0, rail_x(xl0, xl1, y1), y1, STEEL[2])
        c.hline(rail_x(xl0, xl1, y1), rail_x(xr0, xr1, y1), y1, STEEL[2])
    # crossarm with hanging insulators
    ya = 14
    c.hline(70, 89, ya, STEEL[2])
    c.hline(70, 79, ya, STEEL[3])
    c.hline(70, 89, ya + 1, STEEL[1])
    for x in (71, 88):
        c.vline(x, ya + 2, ya + 4, "#c0cbdc")
        c.px(x, ya + 5, WHITE)
    # parabolic dish facing up-left, with feed arm and horn
    c.pattern(63, 24, [
        "....aaa....",
        "..aabbba...",
        ".abbbccca..",
        "abbcccccdd.",
        "abcccccdd..",
        "abccccdd...",
        ".acccdd....",
        "..dddd.....",
    ], {"a": STEEL[1], "b": STEEL[4], "c": STEEL[3], "d": STEEL[0]})
    c.line(70, 30, 76, 33, STEEL[2])       # mount to the mast
    c.line(67, 28, 64, 25, STEEL[2])       # feed arm
    c.px(63, 24, STEEL[4])
    # top spike + aviation light
    c.vline(79, 1, top, STEEL[3])


def cradle(c, p, k):
    """Round steel cradle on the plinth holding the crystal; clamp arms."""
    cy = 76
    c.drum(CX, cy - 4, cy, 15, 4, STEEL, top=STEEL[2])
    # top face of the cradle: recessed ring with glow
    c.ell(CX, cy - 4, 12, 3, STEEL[1])
    glow = [CYAN[0], CYAN[1], CYAN[2], CYAN[1]][k]
    c.ell(CX, cy - 4, 10, 2, glow)
    # bolts around the rim
    for (bx, by) in ((CX - 14, cy - 3), (CX - 8, cy), (CX + 7, cy), (CX + 13, cy - 3)):
        c.px(bx, by, STEEL[4])
        c.px(bx + 1, by + 1, STEEL[0])
    # hazard band on the drum
    for x in range(CX - 15, CX + 15):
        y = cy + 1 + (1 if abs(x - CX + 0.5) > 11 else 0) - (0)
        if ((x // 2) % 2) == 0:
            c.px(x, cy + 2, "#feae34" if x < CX + 6 else "#f77622")
        else:
            c.px(x, cy + 2, INK)


def crystal(c, p, k):
    """Big hexagonal cyan crystal. k = pulse frame (0 dim, 1 mid, 2 bright, 3 mid)."""
    C0, C1, C2, C3 = CYAN
    level = [0, 1, 2, 1][k]
    top = 19
    sh = 31                       # shoulder row
    sb = 63                       # bottom of the faces
    bot = 71
    xl, xr = 37, 59               # shoulders
    bl, br = 39, 57               # body tapers slightly to the base
    m0, m1 = 44, 52               # facet edges at the shoulder
    n0, n1 = 45, 51               # facet edges at the base
    left, centre, right = [(C2, C1, C0), (C2, C1, C0), (C2, C2, C1)][level]
    # silhouette in the centre colour
    c.poly([(CX, top), (xr, sh), (br, sb), (CX, bot), (bl, sb), (xl, sh)], centre)
    # left facet + left top facet (lit)
    c.poly([(xl, sh), (m0, sh + 1), (n0, sb + 2), (bl, sb)], left)
    c.poly([(CX, top), (m0, sh + 1), (xl, sh)], C3 if level == 2 else C2)
    # right facet + right top facet (shade)
    c.poly([(m1, sh + 1), (xr, sh), (br, sb), (n1, sb + 2)], right)
    c.poly([(CX, top), (xr, sh), (m1, sh + 1)], C1 if level < 2 else C2)
    # bottom facets (in the cradle's shadow)
    c.poly([(bl, sb), (n0, sb + 2), (CX, bot)], C1)
    c.poly([(n1, sb + 2), (br, sb), (CX, bot)], C0)
    # facet edges: lit ridge lines
    c.line(m0, sh + 1, n0, sb + 2, C3 if level else C2)
    c.line(m1, sh + 1, n1, sb + 2, C1 if level < 2 else C2)
    c.line(xl, sh, CX, top, WHITE)
    c.line(m0, sh + 1, CX, top, C3)
    c.line(xl, sh, m0, sh + 1, C3)
    c.line(m1, sh + 1, xr, sh, C2)
    # inner core glow in the centre facet: grows with the pulse
    core_h = [10, 16, 26, 16][k]
    cy0 = 47 - core_h // 2
    c.rect(CX - 3, cy0, CX + 1, cy0 + core_h, C2)
    c.rect(CX - 2, cy0 + 2, CX, cy0 + core_h - 2, C3 if level else C2)
    if level >= 1:
        c.rect(CX - 1, cy0 + 4, CX - 1, cy0 + core_h - 4, WHITE)
    # sparkle streaks on the lit facet
    c.line(xl + 2, sh + 3, xl + 3, sh + 12, C3)
    c.line(xl + 3, sh + 16, xl + 3, sh + 20, C3 if level else C2)
    c.px(xl + 4, sh + 24, C3)
    # inclusion cracks (darker fractures)
    c.pts([(m1 + 2, 40), (m1 + 3, 41), (m1 + 3, 42), (m1 + 4, 43), (m1 + 4, 44)], C0)
    c.pts([(m0 + 2, 55), (m0 + 3, 56), (m0 + 3, 57)], C1 if level < 2 else C0)
    # satellite crystals at the base
    for (bx, by, h, wdt) in ((33, 72, 11, 3), (62, 72, 9, 3), (41, 74, 6, 2), (56, 74, 5, 2)):
        c.poly([(bx, by - h), (bx + wdt, by - h + 3), (bx + wdt, by), (bx - wdt, by), (bx - wdt, by - h + 3)], C1)
        c.line(bx - wdt, by - h + 3, bx, by - h, C3 if level else C2)
        c.vline(bx - wdt, by - h + 3, by, C2)
        c.vline(bx + wdt, by - h + 3, by, C0)
        c.vline(bx - 1, by - h + 2, by - 1, C2 if level < 2 else C3)


def clamps(c, p, k):
    """Steel arms from the cradle rim gripping the crystal, with a clamp band."""
    for (x0, y0, x1, y1, lit) in ((35, 73, 38, 58, True), (61, 73, 58, 58, False)):
        c.line(x0, y0, x1, y1, STEEL[3] if lit else STEEL[1])
        c.line(x0 + 1, y0, x1 + 1, y1, STEEL[2] if lit else STEEL[0])
        c.rect(x1 - 1, y1 - 2, x1 + 1, y1, STEEL[2])
        c.px(x1 - 1, y1 - 2, STEEL[4])
    # clamp band around the crystal waist
    by = 58
    c.rect(37, by, 59, by + 2, STEEL[2])
    c.hline(37, 59, by, STEEL[3])
    c.hline(37, 46, by, STEEL[4])
    c.hline(37, 59, by + 2, STEEL[1])
    for x in (40, 48, 56):
        c.px(x, by + 1, STEEL[4])
        c.px(x + 1, by + 1, STEEL[0])
    # upper collar (thin band) catching cyan light
    c.hline(39, 57, 40, STEEL[1])
    c.hline(39, 46, 40, STEEL[3])
    c.px(38, 40, STEEL[2]); c.px(58, 40, STEEL[0])


def cables(c, p, k):
    """Heavy cables from the transformer bushings and the cabinet into the cradle,
    plus a bundle draping over the plinth edge."""
    def cable(pts, light=True):
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            c.line(x0, y0 + 1, x1, y1 + 1, INK)
            c.line(x0, y0, x1, y1, "#3a4466" if light else INK)
    # bushing -> cradle (sagging arcs)
    cable([(13, 44), (17, 47), (22, 52), (27, 60), (31, 68), (34, 72)])
    cable([(22, 44), (25, 46), (29, 50), (32, 56), (35, 64), (37, 71)])
    # cabinet -> cradle along the plinth top
    cable([(66, 80), (64, 81), (62, 80)], light=False)
    cable([(66, 76), (63, 77), (61, 76)], light=False)
    # bundle over the front edge into a conduit on the plinth face
    cable([(30, 83), (32, 86), (33, 88), (33, 93), (34, 96)], light=True)
    cable([(33, 83), (35, 86), (36, 89), (36, 93), (37, 96)], light=True)
    c.rect(31, 96, 38, 98, STEEL[2])
    c.hline(31, 38, 96, STEEL[3])
    c.hline(31, 38, 98, STEEL[0])
    # conduit lights running along the plinth top edge: chase with the pulse
    for i, x in enumerate(range(12, 86, 8)):
        on = (i % 4) == k
        if 30 <= x <= 66:
            continue
        c.px(x, 87, CYAN[2] if on else CYAN[0])


def frame(k):
    c = Canvas(W, H)
    p = None
    plinth(c, p)
    sign(c, p)
    mast(c, p, k)
    transformer(c, p)
    cabinet(c, p, k)
    cradle(c, p, k)
    crystal(c, p, k)
    clamps(c, p, k)
    cables(c, p, k)
    moss(c)
    # cyan rim light on surfaces facing the crystal (stronger at the peak)
    if k in (1, 2, 3):
        c.vline(29, 60, 66 if k != 2 else 70, CYAN[1] if k != 2 else CYAN[2])
        c.vline(66, 63, 67 if k != 2 else 72, CYAN[1] if k != 2 else CYAN[2])
    c.outline()
    # emissive fx
    c.fx()
    # aviation light blinks
    if k in (0, 1):
        c.pts([(79, 0), (78, 1), (80, 1)], "#ff0044")
        c.px(79, 1, WHITE)
    else:
        c.px(79, 0, "#a22633")
    if k == 2:
        # sparkles off the crystal tips at the pulse peak
        for (x, y) in ((CX, 18), (CX, 17), (CX - 1, 19), (CX + 1, 19), (CX - 2, 19), (CX + 2, 19),
                       (32, 40), (31, 40), (64, 46), (65, 46), (36, 30), (60, 28)):
            c.px(x, y, CYAN[2] if (x + y) % 2 else WHITE)
    elif k in (1, 3):
        c.pts([(CX, 19), (CX - 1, 20), (CX + 1, 20)], CYAN[2])
    c.body()
    return c.image()


def build():
    frames = [frame(k) for k in range(4)]
    entry = export("relay_core", frames, HERE, {"idle": [0, 1, 2, 3]}, scale=4, extra={"animFps": {"idle": 5}})
    (HERE / "manifest_part.json").write_text(json.dumps({"relay_core": entry}, indent=2))


if __name__ == "__main__":
    build()
