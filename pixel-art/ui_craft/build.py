"""Workbench recipe icons (critic H2 #9: no more font glyphs): 24x24, same family as pixel-art/ui_icons
(Endesga-32 ramps, light from the top-left, 1-px UI ink outline #181425).

icon_craft_<id> for the 9 recipes in src/data/crafting.js:
  med_kit focusing_lens thorn_coating uplink overcharger serrated_edge balanced_grip heavy_spine reinforced_plating
Tower mods carry their colour from TOWER_MODS (lens cyan, coating green, uplink amber, overcharger yellow).
Run: python pixel-art/ui_craft/build.py [key ...]
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
sys.path.insert(0, str(HERE.parent / "ui_icons"))
from v3lib import Grid, stroke_poly, save_sprite, board, SCRATCH  # noqa: E402
from build import INK, STEEL, WOOD, GREEN, CYAN, AMBER, PAPER, RED, PURPLE, BLUE, poly, disc, ring, box, shade, finish  # noqa: E402

GOLD = ["#733e39", "#be4a2f", "#f77622", "#feae34", "#fee761"]
YEL = ["#be4a2f", "#f77622", "#feae34", "#fee761", "#ffffff"]


def med_kit():
    g = Grid(24, 24)
    for (x, y) in ((8, 6), (8, 5), (9, 4), (10, 4), (11, 4), (12, 4), (13, 4), (14, 4), (15, 5), (15, 6)):
        g.px(x, y, STEEL[2])                                   # handle
    for x in range(9, 15):
        g.px(x, 5, STEEL[3]) if x in (9, 14) else None
    tin = poly([(3.0, 7.0), (21.0, 7.0), (21.0, 19.0), (19.5, 20.5), (4.5, 20.5), (3.0, 19.0)])
    shade(g, tin, ["#8b9bb4", "#c0cbdc", "#ead4aa", "#ffffff"], base=2, lit=3, dark=1)
    for x in range(4, 21):                                     # lid seam
        g.px(x, 10, "#8b9bb4")
    g.px(12, 9, STEEL[2])                                      # latch
    for (x, y) in box(10, 12, 13, 19) | box(7, 14, 16, 17):    # red cross
        g.px(x, y, RED[1])
    for (x, y) in ((10, 12), (11, 12), (7, 14), (7, 15)):
        g.px(x, y, RED[2])
    for (x, y) in ((13, 19), (16, 17), (12, 19)):
        g.px(x, y, RED[0])
    g.px(5, 8, "#ffffff")
    return finish(g)


def focusing_lens():
    g = Grid(24, 24)
    # clamp bracket behind
    clamp = poly([(3.0, 15.0), (9.0, 15.0), (9.0, 21.0), (3.0, 21.0)])
    shade(g, clamp, STEEL, base=1, lit=2, dark=0)
    for p in ((5, 17), (5, 19)):
        g.px(*p, STEEL[3])
    # lens barrel (side) + a big cyan front face
    barrel = poly([(5.0, 8.0), (14.0, 5.0), (17.0, 14.0), (8.0, 17.0)])
    shade(g, barrel, STEEL, base=2, lit=3, dark=1)
    for i in range(4):
        g.px(8 + i * 2, 15 - i, STEEL[1])
    face = {(x, y) for y in range(24) for x in range(24) if ((x + 0.5 - 16.0) / 5.6) ** 2 + ((y + 0.5 - 9.5) / 6.6) ** 2 <= 1}
    for (x, y) in face:
        g.px(x, y, STEEL[3])
    glass = {(x, y) for y in range(24) for x in range(24) if ((x + 0.5 - 16.2) / 4.0) ** 2 + ((y + 0.5 - 9.5) / 5.0) ** 2 <= 1}
    for (x, y) in glass:
        g.px(x, y, CYAN[1] if (x - 16) + (y - 9) > 1 else CYAN[2])
    for (x, y) in ((14, 7), (15, 6), (14, 8)):
        g.px(x, y, "#ffffff")
    for (x, y) in ((17, 11), (18, 10)):
        g.px(x, y, CYAN[0])
    for (x, y) in ((21, 3), (22, 2), (20, 2), (21, 1)):        # focus sparkle
        g.px(x, y, CYAN[2] if (x, y) != (21, 2) else "#ffffff")
    return finish(g)


def thorn_coating():
    g = Grid(24, 24)
    jar = poly([(6.0, 9.0), (18.0, 9.0), (19.0, 11.0), (19.0, 20.0), (17.5, 21.5), (6.5, 21.5), (5.0, 20.0), (5.0, 11.0)])
    shade(g, jar, ["#193c3e", "#265c42", "#3e8948", "#63c74d", "#99e550"], base=2, lit=3, dark=1)
    for (x, y) in jar:                                         # sap level, bubbles
        if y < 12:
            g.px(x, y, "#265c42")
    for (x, y) in ((8, 14), (13, 17), (15, 13), (10, 19)):
        g.px(x, y, "#99e550")
    for x in range(6, 18):                                     # glass glint column
        pass
    for y in range(12, 20):
        g.px(7, y, "#99e550") if y % 3 else None
    lid = box(7, 6, 16, 8)
    shade(g, lid, WOOD, base=2, lit=3, dark=1)
    # thorns stuck through the lid and the drip down the side
    for (bx, by, tx, ty) in ((9.0, 7.0, 6.0, 1.5), (12.5, 6.5, 13.0, 0.8), (15.0, 7.0, 19.0, 2.0)):
        m = poly([(bx - 1.0, by), (tx, ty), (bx + 1.0, by)])
        for p in m:
            g.px(*p, PAPER[2])
        g.px(int(tx), int(ty) + 1, PURPLE[2])
    for (x, y) in ((18, 12), (19, 13), (19, 14), (20, 15)):
        g.px(x, y, "#63c74d")
    g.px(20, 16, "#99e550")
    return finish(g)


def uplink():
    g = Grid(24, 24)
    # dirt mound with a burrowed shape, waves going down into it
    mound = {(x, y) for y in range(24) for x in range(24) if ((x + 0.5 - 12) / 10.5) ** 2 + ((y + 0.5 - 22.5) / 5.0) ** 2 <= 1 and y <= 21}
    shade(g, mound, ["#3e2731", "#733e39", "#b86f50", "#e4a672"], base=1, lit=2, dark=0)
    for (x, y) in ((9, 20), (10, 19), (14, 20), (15, 19), (12, 18)):
        g.px(x, y, "#3e2731")
    # the module: a little circuit board with an antenna
    pcb = poly([(4.0, 3.0), (13.0, 3.0), (13.0, 9.0), (4.0, 9.0)])
    shade(g, pcb, ["#193c3e", "#265c42", "#3e8948", "#63c74d"], base=1, lit=2, dark=0)
    for (x, y) in ((6, 5), (7, 5), (9, 7), (10, 7), (11, 5)):
        g.px(x, y, AMBER[3])
    for (x, y) in ((6, 7), (8, 5), (12, 7)):
        g.px(x, y, STEEL[3])
    for y in range(1, 4):
        g.px(14, y + 1, STEEL[3])
    g.px(14, 1, AMBER[4])
    # amber waves arcing down into the ground
    for r_, c in ((3.5, AMBER[4]), (6.0, AMBER[3]), (8.5, AMBER[2])):
        for k in range(-3, 4):
            a = math.radians(90 + k * 14)
            x, y = int(round(12 + r_ * math.cos(a) * 1.2)), int(round(9.5 + r_ * math.sin(a)))
            if g.get(x, y) is None or g.get(x, y) in ("#733e39", "#b86f50", "#e4a672", "#3e2731"):
                g.px(x, y, c)
    return finish(g)


def overcharger():
    g = Grid(24, 24)
    cell = poly([(5.0, 6.0), (16.0, 6.0), (16.0, 20.0), (5.0, 20.0)])
    shade(g, cell, STEEL, base=1, lit=2, dark=0)
    for y in range(8, 19, 2):                                  # coil windings
        for x in range(6, 16):
            g.px(x, y, GOLD[2] if x < 13 else GOLD[1])
    cap = box(8, 3, 13, 5)
    shade(g, cap, STEEL, base=3, lit=4, dark=2)
    # the yellow bolt crossing it
    bolt = poly([(15.0, 1.5), (9.5, 11.5), (13.0, 11.5), (8.0, 22.5), (18.5, 9.5), (14.5, 9.5), (19.0, 1.5)])
    for p in bolt:
        g.px(*p, YEL[3])
    for (x, y) in bolt:
        if (x - 1, y) not in bolt:
            g.px(x, y, YEL[4])
        elif (x + 1, y) not in bolt:
            g.px(x, y, YEL[2])
    # speed ticks
    for (x, y) in ((20, 13), (21, 13), (20, 16), (21, 16), (22, 16), (19, 19), (20, 19)):
        g.px(x, y, YEL[3])
    return finish(g)


def serrated_edge():
    g = Grid(24, 24)
    # a machete blade lying diagonally, a deep saw-tooth lower edge, a drop of blood off the teeth
    hm = poly(stroke_poly([(1.5, 21.0), (5.0, 17.5)], 3.0))
    shade(g, hm, WOOD, base=2, lit=3, dark=1)
    blade = poly([(4.0, 15.0), (18.0, 3.0), (21.5, 2.0), (22.5, 5.0), (20.0, 9.0), (8.0, 19.0), (5.5, 18.0)])
    shade(g, blade, STEEL, base=3, lit=4, dark=2)
    # cut triangular teeth into the lower-right edge: walk along it, notch every 3 texels
    edge = [(8.0 + t * 12.0, 19.0 - t * 10.0) for t in [i / 30 for i in range(31)]]
    for i, (ex, ey) in enumerate(edge):
        if i % 5 < 2:
            for k in range(3):
                g.px(int(ex - k * 0.7), int(ey - k * 0.7), None)
    for (x, y) in list(blade):
        if g.get(x, y) is not None and g.get(x + 1, y + 1) is None and g.get(x + 1, y) is None:
            g.px(x, y, STEEL[1])
    for i in range(8):                                         # spine highlight
        g.px(6 + i * 2, 14 - int(i * 1.5), STEEL[5])
    for (x, y) in ((13, 17), (13, 18), (12, 19), (13, 19), (13, 20)):
        g.px(x, y, RED[1] if y < 20 else RED[0])
    g.px(12, 18, RED[2])
    return finish(g)


def balanced_grip():
    g = Grid(24, 24)
    # a wrapped grip balanced on a small fulcrum, a pivot arc over it
    fulcrum = poly([(12.0, 15.0), (16.0, 21.0), (8.0, 21.0)])
    shade(g, fulcrum, STEEL, base=2, lit=3, dark=1)
    grip = poly(stroke_poly([(2.5, 13.0), (17.0, 13.0)], 4.6, cap=True))
    shade(g, grip, WOOD, base=1, lit=2, dark=0)
    for x in range(4, 17, 3):                                  # wraps
        for y in range(11, 16):
            if (x, y) in grip:
                g.px(x, y, PAPER[0] if y < 13 else WOOD[0])
    pom = disc(2.5, 13.0, 2.4)
    shade(g, pom, STEEL, base=2, lit=4, dark=1)
    tang = poly([(17.0, 11.5), (22.0, 12.0), (22.0, 14.0), (17.0, 14.5)])
    shade(g, tang, STEEL, base=3, lit=4, dark=2)
    for k in range(-4, 5):                                     # balance arc
        a = math.radians(-90 + k * 15)
        x, y = int(round(12 + 8.0 * math.cos(a))), int(round(12.5 + 6.5 * math.sin(a)))
        if g.get(x, y) is None:
            g.px(x, y, AMBER[3] if abs(k) < 4 else AMBER[2])
    g.px(4, 6, AMBER[3])
    g.px(20, 6, AMBER[3])
    return finish(g)


def heavy_spine():
    g = Grid(24, 24)
    blade = poly([(3.0, 15.0), (19.0, 5.0), (22.0, 6.0), (21.0, 9.5), (8.0, 19.5), (4.5, 19.0)])
    shade(g, blade, STEEL, base=3, lit=4, dark=2)
    spine = poly(stroke_poly([(2.5, 14.0), (19.5, 3.5)], 3.2))   # the thick dark spine bar
    shade(g, spine, STEEL, base=1, lit=2, dark=0)
    for i in range(0, 16, 4):                                  # rivets
        g.px(4 + i, 13 - int(i * 0.62), STEEL[3])
    for i in range(6):                                         # edge bevel
        g.px(7 + i * 2, 17 - int(i * 1.4), STEEL[5])
    # impact mark under the edge (the chop lands harder)
    for (x, y) in ((13, 18), (14, 19), (12, 20), (16, 19), (17, 18), (15, 21)):
        g.px(x, y, AMBER[3])
    g.px(14, 20, AMBER[4])
    return finish(g)


def reinforced_plating():
    g = Grid(24, 24)
    plate = poly([(4.0, 3.0), (20.0, 3.0), (21.0, 5.0), (21.0, 13.0), (12.0, 21.5), (3.0, 13.0), (3.0, 5.0)])
    shade(g, plate, STEEL, base=2, lit=3, dark=1)
    inner = poly([(6.5, 5.5), (17.5, 5.5), (18.5, 7.0), (18.5, 12.5), (12.0, 18.5), (5.5, 12.5), (5.5, 7.0)])
    for (x, y) in inner:
        g.px(x, y, STEEL[1] if (x + y) % 9 else STEEL[2])
    for (x, y) in ((5, 5), (19, 5), (5, 12), (19, 12), (12, 19)):    # rivets
        g.px(x, y, STEEL[4])
        g.px(x + 1, y + 1, STEEL[0])
    # the Relay crystal emblem with a + (max health)
    crys = poly([(12.0, 6.5), (15.0, 10.5), (12.0, 15.5), (9.0, 10.5)])
    for p in crys:
        g.px(*p, CYAN[1])
    for (x, y) in crys:
        if x <= 11 and y <= 11:
            g.px(x, y, CYAN[2])
    g.px(11, 8, "#ffffff")
    for (x, y) in ((19, 16), (20, 16), (21, 16), (20, 15), (20, 17)):
        g.px(x, y, "#63c74d")
    return finish(g)


ICONS = {
    "icon_craft_med_kit": med_kit, "icon_craft_focusing_lens": focusing_lens, "icon_craft_thorn_coating": thorn_coating,
    "icon_craft_uplink": uplink, "icon_craft_overcharger": overcharger, "icon_craft_serrated_edge": serrated_edge,
    "icon_craft_balanced_grip": balanced_grip, "icon_craft_heavy_spine": heavy_spine,
    "icon_craft_reinforced_plating": reinforced_plating,
}

if __name__ == "__main__":
    only = sys.argv[1:] or None
    items = []
    for k, fn in ICONS.items():
        if only and k not in only:
            continue
        g = fn()
        im = g.image()
        save_sprite(k, im)
        items.append((k.replace("icon_craft_", ""), im))
    board(items, 6, bg=(38, 34, 56), cols=5).save(SCRATCH / "craft_x6.png")
    board(items, 2, bg=(38, 34, 56), cols=9).save(SCRATCH / "craft_x2.png")
    print(len(items), "icons")
