"""Verdant Relay - relic icons: 24x24, single frame, hand-placed, same family as pixel-art/ui_icons.

Each relic sits on a small plaque whose frame tells its rarity at a glance:
  common  neutral slate frame on a slate backing
  rare    cyan frame with gold corner studs on a dark-teal backing
  cursed  red-violet frame with red thorn notches on a dark-plum backing
The object is drawn with the UI ink outline (#181425) over the plaque. Light from the top-left, Endesga-32 ramps.

relic_<id> for the 24 ids in the relic spec (whetstone ... storm_totem).
Run: python pixel-art/ui_relics/build.py [key ...]   (also writes pixel-art/manifest.v3relics.json)
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
sys.path.insert(0, str(HERE.parent / "ui_icons"))
from v3lib import Grid, stroke_poly, save_sprite, board, SCRATCH  # noqa: E402
from build import INK, STEEL, WOOD, GREEN, CYAN, AMBER, PAPER, RED, PURPLE, BLUE, poly, disc, ring, box, shade  # noqa: E402

RUST = ["#3e2731", "#733e39", "#be4a2f", "#d77643", "#e4a672"]
COPPER = ["#3e2731", "#733e39", "#b86f50", "#d77643", "#e8b796"]
JADE = ["#193c3e", "#265c42", "#3e8948", "#63c74d", "#99e550"]
GOLD = ["#733e39", "#be4a2f", "#f77622", "#feae34", "#fee761"]
BLOOD = ["#3e2731", "#a22633", "#e43b44", "#f6757a"]

FRAMES = {
    # backing, border lit, border dark, accent
    "C": ("#262b44", "#5a6988", "#3a4466", None),
    "R": ("#193c3e", "#2ce8f5", "#0099db", "#feae34"),
    "X": ("#3e2731", "#b55088", "#68386c", "#e43b44"),
}


def plaque(rarity):
    back, lit, dark, acc = FRAMES[rarity]
    g = Grid(24, 24)
    cut = {(0, 0), (1, 0), (0, 1), (23, 0), (22, 0), (23, 1), (0, 23), (1, 23), (0, 22), (23, 23), (22, 23), (23, 22)}
    inside = {(x, y) for y in range(24) for x in range(24) if (x, y) not in cut}
    for (x, y) in inside:
        border = x == 0 or y == 0 or x == 23 or y == 23 or (x, y) in {(1, 1), (22, 1), (1, 22), (22, 22)}
        if border:
            c = lit if (x + y < 23 and (y <= 1 or x <= 1)) or (y == 0 or x == 0) else dark
            if y == 23 or x == 23 or (x, y) in {(22, 22), (22, 1), (1, 22)}:
                c = dark
            if (y == 0 and x > 12) or (x == 0 and y > 12):
                c = lit if rarity != "C" else dark
            g.px(x, y, c)
        else:
            g.px(x, y, back)
    if rarity == "R":
        for (x, y) in ((1, 1), (22, 1), (1, 22), (22, 22), (2, 1), (1, 2), (21, 1), (22, 2), (1, 21), (2, 22), (22, 21), (21, 22)):
            g.px(x, y, acc if (x, y) in {(1, 1), (22, 1), (1, 22), (22, 22)} else "#f77622")
    if rarity == "X":
        for (x, y) in ((1, 1), (22, 1), (1, 22), (22, 22), (11, 0), (12, 0), (11, 23), (12, 23), (0, 11), (0, 12), (23, 11), (23, 12)):
            g.px(x, y, acc)
    return g


def framed(obj, rarity):
    """Composite the outlined object over the rarity plaque."""
    obj.outline(INK)
    g = plaque(rarity)
    g.paste(obj, 0, 0)
    return g


# =========================================================================== common
def whetstone():
    g = Grid(24, 24)
    # cord through a hole at the top end, looping up and over
    cord = [(16, 7), (17, 5), (16, 3), (14, 2), (12, 3), (11, 5), (11, 7)]
    for a, b in zip(cord, cord[1:]):
        g.line(a[0], a[1], b[0], b[1], WOOD[2])
    for (x, y) in ((17, 4), (13, 2), (11, 6)):
        g.px(x, y, WOOD[1])
    # a worn oval-ended bar of stone, slightly dished on its honed face
    stone = poly(stroke_poly([(6.5, 18.0), (16.5, 8.0)], lambda f: 5.2 + 0.8 * math.sin(math.pi * f), cap=True))
    shade(g, stone, STEEL, base=2, lit=3, dark=1)
    for (x, y) in stone:                                   # speckled grit
        if (x * 7 + y * 13) % 11 == 0:
            g.px(x, y, STEEL[1])
        elif (x * 5 + y * 3) % 13 == 0:
            g.px(x, y, STEEL[3])
    for i in range(8):                                     # the honed face catching the light
        g.px(7 + i, 15 - i, STEEL[4] if i % 3 else STEEL[5])
    g.px(16, 8, INK)                                       # the hole
    g.px(15, 9, STEEL[1])
    return framed(g, "C")


def tapir_boots():
    g = Grid(24, 24)

    def boot(ox, oy, ramp_shift):
        sh = box(5 + ox, 3 + oy, 11 + ox, 15 + oy)
        foot = poly([(5.0 + ox, 13.0 + oy), (15.5 + ox, 13.5 + oy), (18.0 + ox, 15.5 + oy), (18.0 + ox, 18.0 + oy), (5.0 + ox, 18.0 + oy)])
        m = sh | foot
        r = WOOD if ramp_shift == 0 else [WOOD[0], WOOD[0], WOOD[1], WOOD[2]]
        shade(g, m, r, base=2, lit=3, dark=1)
        for x in range(5 + ox, 12 + ox):
            g.px(x, 3 + oy, r[1])
            g.px(x, 4 + oy, r[3] if x < 9 + ox else r[2])
        for x in range(5 + ox, 19 + ox):
            if (x, 18 + oy) in m:
                g.px(x, 18 + oy, WOOD[0])
            if (x, 17 + oy) in m and ramp_shift == 0:
                g.px(x, 17 + oy, INK if x in (11 + ox,) else WOOD[0] if x < 9 + ox else WOOD[1])
        return m
    boot(4, -1, 1)                                       # the far boot, darker
    m = boot(0, 2, 0)
    for y in (8, 10, 12, 14):                            # laces up the front of the near boot
        g.px(10, y, PAPER[2])
        g.px(11, y + 1, PAPER[1])
    for (x, y) in ((6, 10), (7, 13), (14, 17)):          # scuffs
        g.px(x, y, WOOD[1])
    g.px(16, 16, WOOD[3])
    return framed(g, "C")


def lantern_moth():
    g = Grid(24, 24)
    for (x, y) in ((4, 3), (19, 5), (3, 16), (20, 18), (17, 2)):    # light motes
        g.px(x, y, AMBER[4] if (x + y) % 2 else AMBER[3])
    wings = set()
    for s in (-1, 1):
        up_ = poly([(12.0, 9.0), (12 + s * 3.0, 4.0), (12 + s * 9.0, 4.0), (12 + s * 10.0, 7.0), (12 + s * 8.0, 12.0), (12.0, 12.5)])
        lo = poly([(12.0, 12.0), (12 + s * 7.0, 13.0), (12 + s * 7.5, 16.5), (12 + s * 4.0, 19.0), (12.0, 16.0)])
        wings |= up_ | lo
        shade(g, up_, AMBER, base=3, lit=4, dark=2)
        shade(g, lo, AMBER, base=2, lit=3, dark=1)
        ex = 12 + s * 6
        g.px(ex, 7, WOOD[0])                              # eye spots
        g.px(ex + (1 if s > 0 else -1) * 0, 8, WOOD[1])
        g.px(ex + s, 7, AMBER[4])
        g.px(12 + s * 5, 15, WOOD[1])
    for (x, y) in wings:
        if (x + y) % 5 == 0 and g.get(x, y) == AMBER[3]:
            g.px(x, y, AMBER[4])
    body = box(11, 7, 12, 17)
    for (x, y) in body:
        g.px(x, y, WOOD[0] if (y % 2) else WOOD[1])
    g.px(11, 7, WOOD[2])
    for (x, y) in ((10, 6), (9, 5), (8, 4), (13, 6), (14, 5), (15, 4)):     # feathery antennae
        g.px(x, y, WOOD[1])
    g.px(8, 3, AMBER[4])
    g.px(15, 3, AMBER[4])
    return framed(g, "C")


def bramble_gloves():
    g = Grid(24, 24)
    palm = poly([(6.0, 10.0), (17.0, 10.0), (17.0, 17.0), (15.0, 19.0), (7.0, 19.0), (6.0, 17.0)])
    fingers = set()
    for i, (x0, top) in enumerate(((6, 5), (9, 3), (12, 3), (15, 5))):
        fingers |= box(x0, top, x0 + 1, 11)
    thumb = poly(stroke_poly([(7.0, 15.0), (3.5, 10.5)], 2.6, cap=True))
    m = palm | fingers | thumb
    shade(g, m, WOOD, base=2, lit=3, dark=1)
    for i, (x0, top) in enumerate(((6, 5), (9, 3), (12, 3), (15, 5))):
        g.px(x0 + 1, top, WOOD[3])
        g.px(x0, top + 5, WOOD[1])                        # knuckle creases
        g.px(x0 + 1, top + 5, WOOD[1])
    cuff = box(6, 19, 17, 21)
    shade(g, cuff, ["#265c42", "#265c42", "#3e8948", "#63c74d"], base=2, lit=3, dark=1)
    for x in range(6, 18, 2):
        g.px(x, 20, "#193c3e")
    for (x, y) in ((8, 12), (9, 13), (10, 14), (13, 11), (14, 12), (15, 13), (11, 16), (12, 17)):   # bloody scratches
        g.px(x, y, RED[0])
    # a thorn stuck in the middle finger
    for (x, y, c) in ((14, 6, PURPLE[1]), (15, 5, PURPLE[1]), (16, 4, PURPLE[2]), (17, 3, PAPER[2])):
        g.px(x, y, c)
    g.px(13, 7, RED[1])
    return framed(g, "C")


def spore_sac():
    g = Grid(24, 24)
    MEM = ["#265c42", "#3e8948", "#7bc35a", "#b5dc84", "#e8f4c8"]
    # a lumpy, swollen membrane sac on a fleshy stalk
    for (x, y) in ((11, 4), (11, 5), (12, 6), (12, 3), (13, 2)):
        g.px(x, y, MEM[1] if y > 3 else MEM[2])
    sac = disc(11.5, 13.5, 5.4) | disc(8.0, 16.0, 3.6) | disc(15.0, 16.5, 3.8) | disc(11.5, 8.5, 3.0)
    shade(g, sac, MEM, base=2, lit=3, dark=1)
    for (x, y) in sac:                                     # pale translucent belly
        if (x - 10) ** 2 + (y - 12) ** 2 < 7:
            g.px(x, y, MEM[3])
    g.px(9, 10, MEM[4])
    g.px(10, 9, MEM[4])
    for (x, y) in ((13, 13), (14, 14), (9, 17), (10, 18), (15, 18), (16, 17), (12, 16)):   # spores crowding inside
        g.px(x, y, "#265c42")
    g.px(13, 12, MEM[3])
    for y in range(9, 19, 2):                              # veins
        g.px(15 + (y // 3) % 2, y, MEM[1])
    for (cx, cy, r, c) in ((17.5, 6.0, 1.5, "#c0cbdc"), (19.5, 3.5, 1.0, "#ead4aa"), (6.0, 6.0, 1.0, "#c0cbdc")):   # puffs
        for q in disc(cx, cy, r):
            g.px(*q, c)
    g.px(17, 5, PAPER[3])
    return framed(g, "C")


def featherfoot():
    g = Grid(24, 24)
    # the feather hanging from the anklet (drawn first, the cord crosses its quill)
    quill = [(14.0, 9.0), (15.5, 13.0), (17.0, 17.0), (18.0, 21.0)]
    vane = poly([(14.5, 11.0), (18.5, 13.5), (20.0, 18.5), (18.5, 21.0), (16.5, 18.0), (14.0, 14.0)])
    shade(g, vane, ["#3a4466", "#8b9bb4", "#c0cbdc", "#ffffff"], base=2, lit=3, dark=1)
    for (x, y) in vane:
        if y >= 18:
            g.px(x, y, "#124e89" if y >= 20 else "#0099db")
    for a, b in zip(quill, quill[1:]):
        g.line(a[0], a[1], b[0], b[1], PAPER[1])
    for (x, y) in ((18, 15), (19, 16)):                    # a split in the vane
        g.px(x, y, None)
    # anklet: a braided cord ring with beads
    ring_m = {(x, y) for y in range(24) for x in range(24)
              if 0.55 < ((x + 0.5 - 11) / 8.0) ** 2 + ((y + 0.5 - 8) / 3.6) ** 2 <= 1.0}
    for (x, y) in ring_m:
        g.px(x, y, WOOD[2] if (x + y) % 2 else WOOD[1])
        if y < 7:
            g.px(x, y, WOOD[3] if (x + y) % 2 else WOOD[2])
    for i, (x, y) in enumerate(((4, 9), (7, 11), (11, 12), (15, 11), (18, 8))):
        c = (CYAN[2], AMBER[3], RED[1], AMBER[3], CYAN[2])[i]
        g.px(x, y, c)
        g.px(x + 1, y, c)
        g.px(x, y - 1, PAPER[3])
    return framed(g, "C")


def medic_satchel():
    g = Grid(24, 24)
    OLIVE = ["#193c3e", "#265c42", "#3e8948", "#63c74d"]
    for (x, y) in ((5, 9), (5, 8), (6, 6), (7, 5), (8, 4), (9, 3), (10, 3), (11, 3), (12, 3), (13, 3), (14, 4), (15, 5), (16, 6), (17, 7), (18, 9)):
        g.px(x, y, WOOD[1])                                # strap
        g.px(x, y - 1 if y > 3 else y, WOOD[2])
    bag = poly([(4.0, 9.0), (20.0, 9.0), (20.0, 19.0), (18.0, 21.0), (6.0, 21.0), (4.0, 19.0)])
    shade(g, bag, OLIVE, base=1, lit=2, dark=0)
    flap = poly([(4.0, 9.0), (20.0, 9.0), (20.0, 14.0), (17.0, 16.0), (7.0, 16.0), (4.0, 14.0)])
    shade(g, flap, OLIVE, base=2, lit=3, dark=1)
    for x in range(7, 17):
        g.px(x, 16, OLIVE[0])
    # white disc with a red cross
    for p in disc(12.0, 12.0, 3.6):
        g.px(*p, PAPER[2])
    for (x, y) in box(11, 10, 12, 14) | box(10, 11, 14, 12):
        g.px(x, y, RED[1])
    g.px(11, 10, RED[2])
    g.px(10, 11, RED[2])
    g.px(12, 17, AMBER[3])                                 # buckle
    g.px(12, 18, AMBER[1])
    return framed(g, "C")


def cracked_lens():
    g = Grid(24, 24)
    loop = ring(12.0, 4.0, 1.0, 2.3)
    for p in loop:
        g.px(*p, GOLD[2])
    rim = ring(12.0, 13.0, 5.6, 8.4)
    shade(g, rim, GOLD, base=3, lit=4, dark=1)
    for (x, y) in rim:
        if (x + y) % 6 == 0:
            g.px(x, y, GOLD[2])
    glass = disc(12.0, 13.0, 5.6)
    for (x, y) in glass:
        g.px(x, y, CYAN[0] if (x - 12) + (y - 13) > 1 else BLUE[1])
    for (x, y) in ((9, 10), (10, 9), (11, 9), (9, 11)):     # glare
        g.px(x, y, CYAN[2])
    g.px(9, 10, "#ffffff")
    crack = [(8, 16), (10, 14), (11, 15), (13, 12), (14, 13), (16, 10)]
    for a, b in zip(crack, crack[1:]):
        g.line(a[0], a[1], b[0], b[1], "#ffffff")
    g.px(11, 16, "#c0cbdc")
    g.px(14, 11, "#c0cbdc")
    for p in ((15, 17), (16, 16), (16, 17)):               # a chipped-out shard
        g.px(*p, None)
    return framed(g, "C")


def old_battery():
    g = Grid(24, 24)
    body = poly([(7.0, 6.0), (17.0, 6.0), (17.0, 20.0), (15.0, 21.0), (9.0, 21.0), (7.0, 20.0)])
    shade(g, body, STEEL, base=1, lit=2, dark=0)
    for (x, y) in body:                                    # amber label band with a + mark
        if 10 <= y <= 15:
            g.px(x, y, AMBER[3] if x not in (7, 16) else (AMBER[4] if x == 7 else AMBER[1]))
    for (x, y) in ((11, 12), (12, 11), (12, 12), (13, 12), (12, 13)):
        g.px(x, y, WOOD[0])
    cap = poly([(7.0, 5.0), (17.0, 5.0), (17.0, 7.0), (7.0, 7.0)])
    shade(g, cap, STEEL, base=3, lit=4, dark=2)
    for p in box(11, 3, 12, 4):
        g.px(*p, STEEL[4])
    g.px(11, 3, STEEL[5])
    # corrosion crust round the terminal, rust streaks down the can
    for (x, y, c) in ((9, 4, "#c0cbdc"), (10, 4, "#99e550"), (13, 4, "#c0cbdc"), (14, 4, "#63c74d"), (15, 4, "#c0cbdc"),
                      (8, 5, "#99e550"), (14, 6, "#c0cbdc"), (9, 7, "#63c74d")):
        g.px(x, y, c)
    for (x, y0, L) in ((9, 16, 3), (14, 16, 4), (10, 8, 2)):
        for k in range(L):
            g.px(x, y0 + k, WOOD[1])
    g.px(15, 13, WOOD[1])
    return framed(g, "C")


def seed_bank():
    g = Grid(24, 24)
    BURLAP = ["#733e39", "#c28569", "#e4a672", "#ead4aa"]
    sack = disc(11.5, 15.0, 6.2) | poly([(7.0, 11.0), (9.5, 8.0), (13.5, 8.0), (16.0, 11.0)])
    shade(g, sack, BURLAP, base=2, lit=3, dark=1)
    frill = poly([(8.0, 4.5), (15.5, 4.5), (14.0, 8.0), (9.5, 8.0)])
    shade(g, frill, BURLAP, base=1, lit=2, dark=0)
    for x in range(8, 16, 2):
        g.px(x, 5, BURLAP[2])
    for x in range(9, 15):                                 # tie
        g.px(x, 8, GREEN[1])
    g.px(15, 9, GREEN[1])
    g.px(16, 10, GREEN[2])
    for (x, y) in sack:                                    # weave texture
        if (x * 3 + y * 5) % 7 == 0 and g.get(x, y) == BURLAP[2]:
            g.px(x, y, BURLAP[1])
    for (x, y, c) in ((17, 19, WOOD[2]), (18, 20, AMBER[2]), (19, 19, WOOD[2]), (16, 21, AMBER[3]), (20, 21, WOOD[1])):  # spilled seeds
        g.px(x, y, c)
        g.px(x, y - 1, PAPER[2]) if c == AMBER[3] else None
    for (x, y) in ((12, 4), (12, 3), (13, 2)):             # sprout out of the mouth
        g.px(x, y, GREEN[3])
    g.px(11, 2, GREEN[4])
    g.px(14, 2, GREEN[3])
    return framed(g, "C")


def rusted_bell():
    g = Grid(24, 24)
    for p in ring(12.0, 4.0, 1.0, 2.4):
        g.px(*p, STEEL[2])
    g.px(11, 2, STEEL[3])
    bell = poly([(9.0, 6.0), (15.0, 6.0), (16.5, 9.0), (17.0, 14.0), (19.5, 17.5), (4.5, 17.5), (7.0, 14.0), (7.5, 9.0)])
    shade(g, bell, RUST, base=2, lit=3, dark=1)
    for x in range(5, 20):                                 # the lip band
        if (x, 16) in bell:
            g.px(x, 16, RUST[3] if x < 9 else RUST[1])
        if (x, 17) in bell:
            g.px(x, 17, RUST[1])
    for (x, y) in ((9, 9), (9, 10), (10, 8)):              # sheen
        g.px(x, y, RUST[4])
    for (x, y, c) in ((13, 10, WOOD[1]), (14, 12, "#3e8948"), (11, 13, WOOD[1]), (15, 9, "#3e8948"), (8, 14, WOOD[1]), (12, 11, RUST[1])):
        g.px(x, y, c)                                      # rust pits, verdigris
    for p in disc(12.0, 19.3, 1.6):                        # clapper
        g.px(*p, STEEL[2])
    g.px(11, 19, STEEL[4])
    return framed(g, "C")


# =========================================================================== rare
def compass():
    g = Grid(24, 24)
    for p in ring(12.0, 3.0, 0.8, 2.2):
        g.px(*p, GOLD[3])
    case = ring(12.0, 13.0, 6.4, 8.6)
    shade(g, case, GOLD, base=3, lit=4, dark=1)
    face = disc(12.0, 13.0, 6.4)
    for p in face:
        g.px(*p, PAPER[2])
    for (x, y) in face:
        if (x - 12) + (y - 13) > 3:
            g.px(x, y, PAPER[1])
    for (x, y) in ((12, 7), (12, 18), (6, 13), (17, 13)):  # N E S W ticks
        g.px(x, y, WOOD[1])
    # needle: red north, steel south
    for (x, y) in ((12, 8), (12, 9), (11, 10), (12, 10), (13, 10), (11, 11), (12, 11), (13, 11)):
        g.px(x, y, RED[1] if x <= 12 else RED[0])
    for (x, y) in ((11, 14), (12, 14), (13, 14), (11, 15), (12, 15), (13, 15), (12, 16), (12, 17)):
        g.px(x, y, STEEL[2] if x >= 12 else STEEL[3])
    for p in box(11, 12, 13, 13):
        g.px(*p, GOLD[3])
    g.px(12, 12, GOLD[4])
    g.px(9, 9, "#ffffff")                                  # glass glare
    g.px(8, 10, "#ffffff")
    return framed(g, "R")


def hunters_fang():
    g = Grid(24, 24)
    for (x, y) in ((3, 4), (4, 5), (5, 5), (6, 6), (7, 6), (8, 7), (15, 7), (16, 6), (17, 6), (18, 5), (19, 5), (20, 4)):
        g.px(x, y, WOOD[1])                                # the leather thong
        g.px(x, y - 1, WOOD[2])
    fang = poly([(9.0, 6.0), (15.0, 6.0), (15.5, 10.0), (14.5, 14.5), (12.5, 18.5), (10.0, 21.0), (11.0, 16.5), (10.5, 11.5)])
    shade(g, fang, PAPER, base=2, lit=3, dark=1)
    for (x, y) in fang:
        if y >= 19:
            g.px(x, y, PAPER[1])
    for (x, y) in ((11, 9), (11, 10), (11, 11), (11, 12)):
        g.px(x, y, "#ffffff")
    for x in range(9, 16):                                 # wrapped root
        for y in (6, 7, 8):
            if (x, y) in fang:
                g.px(x, y, WOOD[1] if (x + y) % 2 else WOOD[2])
    g.px(10, 21, RED[0])
    g.px(14, 12, PAPER[0])
    return framed(g, "R")


def ironwood_grip():
    g = Grid(24, 24)
    IRONWOOD = ["#3e2731", "#733e39", "#b86f50", "#e4a672"]
    tang = poly(stroke_poly([(15.5, 8.5), (19.5, 4.5)], 2.6, cap=False))
    shade(g, tang, STEEL, base=2, lit=4, dark=1)
    grip = poly(stroke_poly([(5.5, 18.5), (16.0, 8.0)], 5.4, cap=True))
    shade(g, grip, IRONWOOD, base=1, lit=2, dark=0)
    for i in range(0, 12, 3):                              # leather wraps across the grip
        for k in range(-3, 4):
            x, y = 6.5 + i + k * 0.7, 17.5 - i + k * 0.7
            x, y = int(round(x + 0.6)), int(round(y))
            if (x, y) in grip:
                g.px(x, y, PAPER[0] if k < 1 else WOOD[1])
    for k in range(5):                                     # grain highlight
        g.px(8 + k * 2, 14 - k * 2, IRONWOOD[3]) if (8 + k * 2, 14 - k * 2) in grip else None
    for p in box(15, 7, 17, 9):                            # ferrule
        g.px(*p, STEEL[3])
    g.px(15, 7, STEEL[4])
    pom = disc(5.0, 19.0, 2.4)
    shade(g, pom, STEEL, base=2, lit=4, dark=1)
    return framed(g, "R")


def drone_tag():
    g = Grid(24, 24)
    for (x, y) in ((4, 4), (5, 3), (6, 3), (7, 3), (8, 4), (9, 5), (10, 6), (11, 7)):    # ball chain
        g.px(x, y, STEEL[4] if (x + y) % 2 else STEEL[2])
    for (x, y) in ((3, 5), (3, 6), (4, 7)):
        g.px(x, y, STEEL[2] if y % 2 else STEEL[4])
    # rounded tag with a notch, slightly tilted
    tag = poly([(8.0, 9.0), (10.0, 7.0), (15.0, 8.0), (17.0, 10.0), (16.0, 19.0), (14.0, 21.0), (9.0, 20.0), (7.0, 18.0),
                (7.5, 14.5), (6.5, 13.5), (7.7, 12.5)])
    shade(g, tag, CYAN, base=1, lit=2, dark=0)
    g.px(11, 9, INK)                                       # hole
    for y, (x0, x1) in ((12, (9, 14)), (14, (9, 13)), (16, (9, 14)), (18, (10, 12))):   # stamped lines
        for x in range(x0, x1 + 1):
            if (x, y) in tag:
                g.px(x, y, BLUE[0])
    for (x, y) in ((9, 10), (9, 11)):
        g.px(x, y, "#ffffff")
    # antenna with a blinking tip
    for (x, y) in ((16, 9), (17, 8), (18, 7), (19, 6), (19, 5)):
        g.px(x, y, STEEL[3])
    g.px(19, 4, "#ffffff")
    g.px(20, 4, CYAN[2])
    g.px(19, 3, CYAN[2])
    return framed(g, "R")


def second_wind():
    g = Grid(24, 24)
    # a squat jade idol on a pedestal: a fan headdress, gem eyes, an open mouth breathing out a curl of wind
    ped = box(6, 19, 17, 21)
    shade(g, ped, STEEL, base=1, lit=2, dark=0)
    body = poly([(9.0, 12.0), (15.0, 12.0), (17.5, 19.0), (6.5, 19.0)])
    shade(g, body, JADE, base=2, lit=3, dark=1)
    for (tx, ty) in ((7.0, 2.5), (12.0, 1.5), (17.0, 2.5)):           # a fan headdress of three carved spikes
        spike = poly([(tx - 2.0, 7.0), (tx, ty), (tx + 2.0, 7.0)])
        shade(g, spike, JADE, base=3, lit=4, dark=2)
    head = disc(12.0, 8.8, 4.8)
    shade(g, head, JADE, base=3, lit=4, dark=2)
    for (x, y) in ((6, 8), (6, 9), (17, 8), (17, 9)):                   # ear plugs
        g.px(x, y, JADE[1])
    for ex in (9, 13):                                     # inset eyes with gem glints
        for q in box(ex, 7, ex + 1, 8):
            g.px(*q, JADE[0])
        g.px(ex, 7, CYAN[2])
    for q in box(11, 10, 12, 11):                          # open mouth
        g.px(*q, INK)
    for (x, y) in ((9, 14), (10, 15), (11, 15), (12, 15), (13, 15), (14, 14)):   # folded arms
        g.px(x, y, JADE[1])
    g.px(12, 17, JADE[1])
    # the breath: a curl of wind out of the mouth to the right
    curl = [(13, 11), (16, 12), (19, 11), (20, 9), (19, 7), (17, 8)]
    for a, b in zip(curl, curl[1:]):
        g.line(a[0], a[1], b[0], b[1], "#ffffff")
    for (x, y) in ((17, 13), (20, 13), (21, 12)):
        g.px(x, y, CYAN[2])
    return framed(g, "R")


def pylon_coil():
    g = Grid(24, 24)
    base_ = box(6, 19, 17, 21)
    shade(g, base_, STEEL, base=1, lit=2, dark=0)
    rod = box(11, 6, 12, 19)
    for (x, y) in rod:
        g.px(x, y, STEEL[3] if x == 11 else STEEL[2])
    for i, cy in enumerate((8.0, 11.0, 14.0, 17.0)):
        loop = {(x, y) for y in range(24) for x in range(24) if 0.3 < ((x + 0.5 - 11.8) / 6.0) ** 2 + ((y + 0.5 - cy) / 1.9) ** 2 <= 1.0}
        for (x, y) in loop:
            front = y + 0.5 > cy
            if not front and (x, y) in rod:
                continue
            t = 3 if (x < 11 and front) else 2 if front else 1
            g.px(x, y, COPPER[t])
        g.px(7, int(cy) + 1, COPPER[4])
    # spark crackling off the top
    for (x, y, c) in ((12, 5, CYAN[2]), (13, 4, "#ffffff"), (12, 3, CYAN[2]), (14, 2, CYAN[2]), (15, 3, CYAN[1]),
                      (10, 4, CYAN[1]), (9, 3, CYAN[2]), (8, 2, CYAN[1])):
        g.px(x, y, c)
    g.px(11, 5, "#ffffff")
    return framed(g, "R")


def root_heart():
    g = Grid(24, 24)
    # roots trailing out below (behind the heart)
    for r in ([(10, 17), (8, 20), (5, 21)], [(12, 18), (12, 21)], [(14, 17), (17, 20), (19, 21)]):
        for a, b in zip(r, r[1:]):
            g.line(a[0], a[1], b[0], b[1], WOOD[2])
    heart = disc(8.8, 9.6, 4.4) | disc(15.2, 9.6, 4.4) | poly([(4.6, 10.5), (19.4, 10.5), (12.0, 19.0)])
    shade(g, heart, BLOOD, base=2, lit=3, dark=1)
    g.px(7, 7, "#ffffff")
    g.px(8, 7, BLOOD[3])
    g.px(7, 8, BLOOD[3])
    # two thick roots binding it, wrapping round
    for r in ([(4, 9), (7, 11), (10, 10), (13, 13), (16, 12), (20, 14)], [(6, 15), (9, 14), (12, 16), (15, 15), (18, 17)]):
        for a, b in zip(r, r[1:]):
            g.line(a[0], a[1], b[0], b[1], WOOD[1])
            g.line(a[0], a[1] - 1, b[0], b[1] - 1, WOOD[2])
    g.px(20, 13, GREEN[3])                                 # leaf buds
    g.px(4, 8, GREEN[3])
    g.px(19, 15, GREEN[2])
    for (x, y) in ((2, 11), (2, 12), (21, 8), (21, 9)):      # beat marks
        g.px(x, y, BLOOD[3])
    return framed(g, "R")


def capacitor():
    g = Grid(24, 24)
    for (x, y) in ((9, 19), (9, 20), (9, 21), (14, 19), (14, 20), (15, 21)):   # legs
        g.px(x, y, STEEL[3])
    can = poly([(6.5, 6.0), (17.5, 6.0), (17.5, 18.0), (16.0, 19.5), (8.0, 19.5), (6.5, 18.0)])
    shade(g, can, BLUE + [CYAN[2]], base=0, lit=1, dark=0)
    for y in range(7, 19):                                 # glowing stripe
        g.px(14, y, CYAN[2] if y % 4 else "#ffffff")
        g.px(15, y, CYAN[1])
        if y % 4 == 0:
            g.px(14, y, CYAN[1])
    for y in (9, 13, 17):
        g.px(15, y, "#ffffff")
    for y in range(7, 18):
        g.px(8, y, CYAN[1])
    top = poly([(6.5, 4.0), (17.5, 4.0), (17.5, 6.5), (6.5, 6.5)])
    shade(g, top, STEEL, base=3, lit=4, dark=2)
    for p in ((11, 5), (12, 5), (12, 4), (12, 6)):          # vent cross
        g.px(*p, STEEL[1])
    for (x, y, c) in ((4, 9, CYAN[2]), (3, 8, "#ffffff"), (20, 12, CYAN[2]), (21, 11, CYAN[1]), (19, 3, CYAN[2]), (20, 2, "#ffffff")):
        g.px(x, y, c)                                      # charge sparks
    return framed(g, "R")


def signal_booster():
    g = Grid(24, 24)
    for (x, y) in ((5, 21), (6, 20), (7, 19), (9, 19), (10, 20), (11, 21), (8, 18), (8, 17)):   # tripod
        g.px(x, y, STEEL[2])
    g.px(8, 16, STEEL[3])
    # dish facing up-right: dark back rim, bright concave face, feed horn on struts
    a = math.radians(-40)
    for y in range(24):
        for x in range(24):
            u = (x + 0.5 - 9.5) * math.cos(a) + (y + 0.5 - 12.0) * math.sin(a)
            v = -(x + 0.5 - 9.5) * math.sin(a) + (y + 0.5 - 12.0) * math.cos(a)
            if (u / 6.8) ** 2 + (v / 4.6) ** 2 <= 1:
                d = (u / 5.6) ** 2 + ((v + 0.6) / 3.6) ** 2
                if d <= 1:
                    c = STEEL[5] if (u < -1 and d > 0.5) else STEEL[4] if d > 0.3 else STEEL[3]
                else:
                    c = STEEL[1] if v > 0 else STEEL[2]
                g.px(x, y, c)
    for (x, y) in ((11, 11), (12, 10), (13, 9)):           # feed arm + horn
        g.px(x, y, STEEL[1])
    g.px(14, 8, CYAN[2])
    g.px(14, 7, "#ffffff")
    for r, c in ((3.6, CYAN[2]), (6.2, CYAN[1]), (8.8, CYAN[0])):     # waves
        for k in range(-4, 5):
            ang = math.radians(-45 + k * 11)
            x, y = int(round(14.5 + r * math.cos(ang))), int(round(7.5 + r * math.sin(ang)))
            if 1 <= x <= 22 and 1 <= y <= 22 and g.get(x, y) is None:
                g.px(x, y, c)
    return framed(g, "R")


# =========================================================================== cursed

def hungry_idol():
    g = Grid(24, 24)
    neck = box(9, 19, 14, 21)
    shade(g, neck, GOLD, base=1, lit=2, dark=0)
    head = disc(11.5, 11.5, 7.8)
    shade(g, head, GOLD, base=3, lit=4, dark=2)
    for (x, y) in head:                                    # carved brow ridge
        if y == 8 and 6 <= x <= 17:
            g.px(x, y, GOLD[1] if x in (11, 12) else GOLD[2])
    for ex in (8, 14):                                     # sockets with red glints
        for p in box(ex, 9, ex + 1, 10):
            g.px(*p, INK)
        g.px(ex + 1 if ex < 11 else ex, 9, RED[1])
    # the grin: a wide dark mouth full of teeth
    mouth = poly([(5.5, 13.0), (18.5, 13.0), (16.0, 17.0), (8.0, 17.0)])
    for p in mouth:
        g.px(*p, INK)
    for x in range(6, 18):
        if (x, 13) in mouth:
            g.px(x, 13, PAPER[3] if x % 2 else PAPER[2])
        if (x, 16) in mouth and x % 2 == 0:
            g.px(x, 16, PAPER[2])
    g.px(11, 15, RED[0])                                   # a tongue
    g.px(12, 15, RED[1])
    for (x, y) in ((7, 5), (8, 4), (16, 4), (15, 5)):        # little horns
        g.px(x, y, GOLD[1])
    g.px(8, 6, "#ffffff")
    g.px(16, 18, GOLD[1])
    return framed(g, "X")


def blood_moss():
    g = Grid(24, 24)
    clump = set()
    for (cx, cy, r) in ((7.0, 15.0, 4.2), (12.0, 12.5, 5.0), (17.0, 14.5, 4.4), (10.0, 17.0, 4.0), (15.0, 17.5, 3.8)):
        clump |= disc(cx, cy, r)
    clump = {(x, y) for (x, y) in clump if y <= 19}
    shade(g, clump, BLOOD, base=1, lit=2, dark=0)
    for (x, y) in clump:                                   # tufts and specks
        if (x * 7 + y * 3) % 9 == 0:
            g.px(x, y, BLOOD[3] if y < 14 else BLOOD[2])
        elif (x * 5 + y * 11) % 13 == 0:
            g.px(x, y, BLOOD[0])
    for (x, y) in ((10, 8), (11, 7), (13, 8), (14, 7), (6, 11), (18, 10)):   # spore stalks
        g.px(x, y, BLOOD[2])
        g.px(x, y - 1, BLOOD[3])
    for (x, y0, L) in ((8, 20, 2), (13, 20, 3), (17, 19, 2)):    # drips
        for k in range(L):
            g.px(x, y0 + k, BLOOD[1])
        g.px(x, y0 + L, BLOOD[2])
    return framed(g, "X")


def glass_machete():
    g = Grid(24, 24)
    GLASS = ["#3a4466", "#8b9bb4", "#c0cbdc", "#ffffff"]
    hm = poly(stroke_poly([(3.0, 21.0), (8.0, 16.0)], 3.4))
    shade(g, hm, ["#3e2731", "#3e2731", "#68386c", "#b55088"], base=2, lit=3, dark=1)
    for t in (0.3, 0.65):                                  # red cord wraps
        x, y = 3.0 + 5.0 * t, 21.0 - 5.0 * t
        g.px(int(x), int(y), RED[1])
        g.px(int(x) + 1, int(y) - 1, RED[0])
    guard = poly(stroke_poly([(6.5, 15.0), (9.5, 18.0)], 2.0))
    for p in guard:
        g.px(*p, STEEL[1])
    blade = poly([(8.5, 14.0), (19.0, 3.5), (21.5, 2.5), (21.0, 6.5), (18.5, 11.0), (14.0, 15.5), (11.0, 17.0), (9.8, 16.2)])
    shade(g, blade, GLASS, base=2, lit=3, dark=1)
    for (x, y) in blade:                                   # cyan glassy core + a diagonal glare band
        if g.get(x, y) == GLASS[2] and (x + y) % 2 == 0 and 21 < x + y < 26:
            g.px(x, y, "#2ce8f5")
    for i in range(6):
        g.px(11 + i, 14 - i, "#ffffff")
        g.px(12 + i, 14 - i, CYAN[2])
    crack = [(13, 13), (15, 13), (16, 11), (18, 10)]
    for a, b in zip(crack, crack[1:]):
        g.line(a[0], a[1], b[0], b[1], GLASS[0])
    g.px(20, 4, "#ffffff")
    for (x, y) in ((19, 13), (21, 9)):                     # shards falling off
        g.px(x, y, "#c0cbdc")
    return framed(g, "X")


def storm_totem():
    g = Grid(24, 24)
    TOTEM = ["#3e2731", "#733e39", "#b86f50", "#e4a672"]
    pole = box(8, 4, 15, 21)
    shade(g, pole, TOTEM, base=1, lit=2, dark=0)
    wings = poly([(4.0, 6.0), (8.0, 5.0), (8.0, 9.0)]) | poly([(19.0, 6.0), (15.0, 5.0), (15.0, 9.0)])
    shade(g, wings, TOTEM, base=2, lit=3, dark=1)
    for y in (9, 15):                                      # carved bands
        for x in range(8, 16):
            g.px(x, y, TOTEM[0])
    for (x, y) in ((10, 6), (13, 6)):                      # top face: eyes + beak
        g.px(x, y, PAPER[3])
        g.px(x, y + 1, INK)
    g.px(11, 8, AMBER[3])
    g.px(12, 8, AMBER[2])
    # lightning carved down the middle segment, glowing
    bolt = [(13, 10), (10, 12), (13, 12), (10, 14)]
    for a, b in zip(bolt, bolt[1:]):
        g.line(a[0], a[1], b[0], b[1], AMBER[4])
    g.px(13, 10, "#ffffff")
    for (x, y) in ((10, 17), (13, 17), (11, 19), (12, 19)):  # lower face
        g.px(x, y, TOTEM[0])
    for (x, y, c) in ((3, 3, CYAN[2]), (4, 2, "#ffffff"), (19, 2, CYAN[2]), (20, 3, CYAN[1]), (5, 11, CYAN[1]), (18, 12, CYAN[2])):
        g.px(x, y, c)                                      # storm sparks
    return framed(g, "X")


RELICS = {
    "whetstone": whetstone, "tapir_boots": tapir_boots, "lantern_moth": lantern_moth, "bramble_gloves": bramble_gloves,
    "spore_sac": spore_sac, "featherfoot": featherfoot, "medic_satchel": medic_satchel, "cracked_lens": cracked_lens,
    "old_battery": old_battery, "seed_bank": seed_bank, "rusted_bell": rusted_bell,
    "compass": compass, "hunters_fang": hunters_fang, "ironwood_grip": ironwood_grip, "drone_tag": drone_tag,
    "second_wind": second_wind, "pylon_coil": pylon_coil, "root_heart": root_heart, "capacitor": capacitor,
    "signal_booster": signal_booster,
    "hungry_idol": hungry_idol, "blood_moss": blood_moss, "glass_machete": glass_machete, "storm_totem": storm_totem,
}

if __name__ == "__main__":
    only = sys.argv[1:] or None
    items = []
    for rid, fn in RELICS.items():
        k = f"relic_{rid}"
        if only and k not in only:
            continue
        g = fn()
        im = g.image()
        save_sprite(k, im)
        print(f"{k}: {g.w}x{g.h} colours={len(g.colors())}")
        items.append((rid, im))
    board(items, 6, bg=(24, 20, 37), cols=6).save(SCRATCH / "relics_x6.png")
    board(items, 1, bg=(24, 20, 37), cols=12).save(SCRATCH / "relics_x1.png")
    frag = {f"relic_{rid}": {"file": f"relic_{rid}.png", "ppu": 32, "shadow": 0} for rid in RELICS}
    out = HERE.parent / "manifest.v3relics.json"
    out.write_text(json.dumps(frag, indent=2) + "\n", encoding="utf8")
    print(f"{len(frag)} keys -> {out}")
