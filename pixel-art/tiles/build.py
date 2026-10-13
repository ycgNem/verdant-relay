"""Verdant Relay - env tiles. 32x32 seamless floor / alt / wall textures per district,
water (2-frame strip), night-map floor + lane.  Run: python pixel-art/tiles/build.py

Every tile is drawn on a wrap-around canvas (envlib.Tile), so seams cannot exist; the work
is in keeping texture even (no single feature that grids) and values low-contrast for floors.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import C, Tile, SPRITES, up, tiled, night, check_palette, label_sheet  # noqa: E402

TILES = {}


def reg(key):
    def deco(fn):
        TILES[key] = fn
        return fn
    return deco


# ---------------------------------------------------------------- shared bits
def partition(rng, total, lo, hi):
    """Split `total` into chunk widths in [lo, hi]."""
    while True:
        out, s = [], 0
        while s < total:
            w = rng.randint(lo, hi)
            out.append(w)
            s += w
        if s == total:
            return out


LEAVES = [
    [(0, 1), (1, 0), (1, 1), (2, 0)],
    [(0, 0), (1, 0), (1, 1), (2, 1)],
    [(0, 0), (0, 1), (1, 1), (1, 2)],
    [(1, 0), (0, 1), (1, 1), (0, 2)],
    [(0, 1), (1, 0), (1, 1), (2, 0), (2, 1), (3, 0)],
    [(0, 0), (1, 0), (1, 1), (2, 1), (3, 1)],
]


def leaf(t, x, y, lit, shade, shape=None, only=None):
    pts = shape or t.rng.choice(LEAVES)
    s = set(pts)
    for dx, dy in pts:
        t.px(x + dx, y + dy, lit, only=only)
    if shade:
        for dx, dy in pts:
            if (dx + 1, dy + 1) not in s:
                t.px(x + dx + 1, y + dy + 1, shade, only=only)


def tuft(t, x, y, hi, mid, shade):
    """Small grass tuft seen from above at 55 deg: 2-3 blades and a shadow foot."""
    t.px(x, y, hi)
    t.px(x - 1, y + 1, mid)
    t.px(x + 1, y + 1, hi if t.rng.random() < 0.5 else mid)
    t.px(x, y + 1, mid)
    if shade:
        t.px(x, y + 2, shade)
        t.px(x + 1, y + 2, shade)


def crack(t, x, y, length, c, only=None, drift=None):
    dx = t.rng.choice([-1, 1])
    for _ in range(length):
        t.px(x, y, c, only=only)
        r = t.rng.random()
        if r < 0.45:
            x += dx
        elif r < 0.9:
            y += 1
        else:
            x += dx
            y += 1



def coverage(t, seed, edge=0.35):
    """Patch mask for alt tiles: organic noise, heavier in the middle, lighter (not zero)
    at the border so alt cells blend into the floor and still join up when clustered."""
    import random
    f = Tile(0, seed=seed).field((4, 8), (0.6, 0.4))
    m = [[False] * 32 for _ in range(32)]
    for y in range(32):
        for x in range(32):
            r = max(abs(x - 15.5), abs(y - 15.5)) / 16.0
            v = 0.6 * f[y][x] + 0.4 * (1.0 - r * r) + (edge - 0.35)
            m[y][x] = v > 0.5
    return m


def rim(m):
    """Floor-side pixels touching the patch mask (where a lip/shadow goes)."""
    out = []
    for y in range(32):
        for x in range(32):
            if not m[y][x] and any(m[(y + dy) % 32][(x + dx) % 32] for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1))):
                out.append((x, y))
    return out


# ================================================================ OVERGROWN MARKET
# look floor #5a6988 (slate pavers) / alt #3e8948 (moss) / wall #3a4466
@reg("floor_overgrown_market")
def market_floor():
    t = Tile(C["sl2"], seed=11)
    heights = [8, 7, 9, 8]
    y = 0
    for ri, h in enumerate(heights):
        widths = partition(t.rng, 32, 7, 11)
        x = t.rng.randint(0, 31)
        for w in widths:
            # grout: top edge + left edge of every paver (worn: a few gaps)
            for i in range(w):
                if t.rng.random() > 0.06:
                    t.px(x + i, y, C["sl1"])
            for j in range(h):
                if t.rng.random() > 0.06:
                    t.px(x, y + j, C["sl1"])
            # paver face grit
            for j in range(1, h):
                for i in range(1, w):
                    if t.rng.random() < 0.05:
                        t.px(x + i, y + j, C["sl1"])
            # lit top-left lip on some pavers (light from the top-left)
            if t.rng.random() < 0.55:
                n = t.rng.randint(2, max(2, w - 4))
                for i in range(1, 1 + n):
                    t.px(x + i, y + 1, C["sl3"])
                if t.rng.random() < 0.5:
                    t.px(x + 1, y + 2, C["sl3"])
            # crack on a few pavers
            if t.rng.random() < 0.22:
                crack(t, x + t.rng.randint(2, w - 2), y + 1, t.rng.randint(3, h), C["sl1"])
            x += w
        y += h
    # moss creeping out of the grout at a few joints
    for _ in range(5):
        cx, cy = t.rng.randint(0, 31), t.rng.randint(0, 31)
        for k in range(t.rng.randint(4, 8)):
            px, py = cx + t.rng.randint(-3, 3), cy + t.rng.randint(-2, 2)
            if t.get(px, py) == C["sl1"]:
                t.px(px, py, C["g1"])
        t.px(cx, cy, C["g1"])
        t.px(cx + 1, cy, C["g1"])
        t.px(cx, cy - 1, C["g2"])
    return t


@reg("floor_alt_overgrown_market")
def market_alt():
    """Moss mat swallowing the same pavers as floor_ - edges match the floor, so single
    alt cells read as organic moss patches rather than green squares."""
    t = market_floor()
    t.rng.seed(12)
    m = coverage(t, 12, edge=0.3)
    for y in range(32):
        for x in range(32):
            if m[y][x]:
                t.px(x, y, C["g2"])
    for x, y in rim(m):                       # moss edge: shadowed lip on the floor side
        if t.rng.random() < 0.6:
            t.px(x, y, C["g1"], only=(C["sl2"], C["sl3"]))
    t.scatter(9, lambda x, y: t.blob(x, y, t.rng.randint(1, 2), 1, C["g1"], rough=0.5, only=C["g2"]))
    def tf(x, y):
        if m[y % 32][x % 32]:
            tuft(t, x, y, C["g3"], C["g2"], C["g1"])
    t.scatter(14, tf)
    t.speckle(C["g3"], 0.02, only=C["g2"])
    for _ in range(2):
        t.px(t.rng.randint(0, 31), t.rng.randint(0, 31), C["yellow"], only=C["g2"])
    return t


@reg("wall_overgrown_market")
def market_wall():
    t = Tile(C["sl1"], seed=13)
    # broken concrete top: shadowed hollows, aggregate, cracks
    t.scatter(9, lambda x, y: t.blob(x, y, t.rng.randint(1, 3), t.rng.randint(1, 2), C["sl0"], rough=0.5))
    t.speckle(C["sl2"], 0.07, only=C["sl1"])
    t.speckle(C["sl0"], 0.06, only=C["sl1"])
    t.speckle(C["ink"], 0.05, only=C["sl0"])
    # slab joints
    t.hline(9, 25, 13, C["sl0"])
    t.hline(10, 25, 14, C["sl2"], only=C["sl1"])
    t.vline(9, 0, 12, C["sl0"])
    t.vline(25, 15, 31, C["sl0"])
    t.vline(10, 0, 12, C["sl2"], only=C["sl1"])
    t.vline(26, 15, 31, C["sl2"], only=C["sl1"])
    for _ in range(4):
        crack(t, t.rng.randint(0, 31), t.rng.randint(0, 31), t.rng.randint(6, 11), C["ink"])
    # rusty rebar stubs poking up
    for x, y in ((4, 6), (18, 22), (29, 4)):
        t.px(x, y, C["rust"])
        t.px(x + 1, y, C["br1"])
        t.px(x, y + 1, C["br1"])
        t.px(x - 1, y - 1, C["org"])
    # moss colonising the top
    for _ in range(3):
        cx, cy = t.rng.randint(0, 31), t.rng.randint(0, 31)
        t.blob(cx, cy, t.rng.randint(2, 4), t.rng.randint(1, 3), C["g1"], rough=0.5)
        t.px(cx - 1, cy - 1, C["g2"])
        t.px(cx, cy - 1, C["g2"])
    return t


# ================================================================ FLOODED TRANSIT
# look floor #3a4466 (platform tiles) / alt #124e89 (standing water) / wall #262b44
def transit_tiles(t, wet_grout=True):
    for y in range(32):
        for x in range(32):
            if x % 8 == 0 or y % 8 == 0:
                t.px(x, y, C["sl0"])
    for ty in range(4):
        for tx in range(4):
            x0, y0 = tx * 8, ty * 8
            r = t.rng.random()
            if r < 0.55:   # glazed tile catching the light at its top-left
                t.px(x0 + 1, y0 + 1, C["sl2"])
                t.px(x0 + 2, y0 + 1, C["sl2"])
                if t.rng.random() < 0.6:
                    t.px(x0 + 1, y0 + 2, C["sl2"])
                if t.rng.random() < 0.4:
                    t.px(x0 + 3, y0 + 1, C["sl2"])
            elif r < 0.68:  # cracked tile
                crack(t, x0 + t.rng.randint(2, 6), y0 + 1, 7, C["sl0"])
            elif r < 0.76:  # grimy tile
                t.speckle(C["sl0"], 0.18, box=(x0 + 1, y0 + 1, x0 + 7, y0 + 7))
    if wet_grout:
        # seep water along some grout runs
        for _ in range(3):
            if t.rng.random() < 0.5:
                y = t.rng.randrange(0, 32, 8)
                x = t.rng.randint(0, 31)
                t.hline(x, x + t.rng.randint(4, 9), y, C["bl0"], only=C["sl0"])
            else:
                x = t.rng.randrange(0, 32, 8)
                y = t.rng.randint(0, 31)
                t.vline(x, y, y + t.rng.randint(4, 9), C["bl0"], only=C["sl0"])


@reg("floor_flooded_transit")
def transit_floor():
    t = Tile(C["sl1"], seed=21)
    transit_tiles(t)
    # rust bloom from old fittings
    for x, y in ((12, 19),):
        t.px(x, y, C["br0"])
        t.px(x + 1, y, C["br0"])
        t.px(x, y + 1, C["br0"])
    # algae creeping in a couple of grout joints
    for x, y in ((8, 8), (24, 24), (16, 0)):
        t.px(x, y, C["g0"])
        t.px(x + 1, y, C["g0"])
        t.px(x, y + 1, C["g0"])
        t.px(x - 1, y, C["g1"])
    return t


@reg("floor_alt_flooded_transit")
def transit_alt():
    """Standing floodwater pooled on the platform tiles (same tiles as floor_), the grid
    showing through, ripples and sky glints on top."""
    t = transit_floor()
    t.rng.seed(22)
    m = coverage(t, 22, edge=0.62)
    for y in range(32):
        for x in range(32):
            if m[y][x]:
                t.px(x, y, C["g0"] if t.get(x, y) in (C["sl0"], C["bl0"]) else C["bl0"])
    for x, y in rim(m):                       # wet dark margin
        if t.rng.random() < 0.5:
            t.px(x, y, C["sl0"])
    def ripple(x, y):
        n = t.rng.randint(2, 4)
        for i in range(n):
            t.px(x + i, y, C["bl1"], only=(C["bl0"], C["g0"]))
        if t.rng.random() < 0.35:
            t.px(x + 1, y, C["cyan"], only=C["bl1"])
    t.scatter(10, ripple)
    leaf(t, 14, 9, C["g2"], C["g0"], only=(C["bl0"], C["g0"]))
    return t


@reg("wall_flooded_transit")
def transit_wall():
    t = Tile(C["sl0"], seed=24)
    # precast slab top, seams staggered per band
    bands = [(0, 10), (11, 21), (22, 31)]
    for bi, (y0, y1) in enumerate(bands):
        t.hline(0, 31, y0, C["ink"])
        t.hline(0, 31, y0 + 1, C["sl1"])
        for x in ((5, 21), (13, 29), (9, 25))[bi]:
            t.vline(x, y0, y1, C["ink"])
            t.vline(x + 1, y0 + 1, y1, C["sl1"])
    t.speckle(C["sl1"], 0.06, only=C["sl0"])
    t.speckle(C["ink"], 0.05, only=C["sl0"])
    # algae & water stains running down
    for x in (3, 17, 27):
        y = t.rng.randint(0, 31)
        for k in range(t.rng.randint(4, 8)):
            t.px(x + (k // 3) % 2, y + k, C["g0"], avoid=C["ink"])
    for _ in range(3):
        cx, cy = t.rng.randint(0, 31), t.rng.randint(0, 31)
        t.blob(cx, cy, 2, 1, C["bl0"], rough=0.4, only=(C["sl0"], C["sl1"]))
    # bolts at slab corners
    for x, y in ((7, 3), (23, 14), (15, 25), (31, 25), (2, 14)):
        t.px(x, y, C["sl2"])
        t.px(x + 1, y + 1, C["ink"])
    return t


# ================================================================ CANOPY GREENHOUSE
# look floor #265c42 (leaf litter) / alt #3e8948 (lush moss + blooms) / wall #193c3e (hedge)
@reg("floor_canopy_greenhouse")
def green_floor():
    t = Tile(C["g1"], seed=31)
    for _ in range(6):
        t.blob(t.rng.randint(0, 31), t.rng.randint(0, 31), t.rng.randint(2, 4), t.rng.randint(1, 3),
               C["g0"], rough=0.5)
    t.speckle(C["g0"], 0.05, only=C["g1"])
    t.scatter(16, lambda x, y: leaf(t, x, y, C["g2"], C["g0"]))
    t.scatter(2, lambda x, y: leaf(t, x, y, C["br1"], C["g0"]))
    # a few lit leaf tips
    t.speckle(C["g3"], 0.03, only=C["g2"])
    return t


@reg("floor_alt_canopy_greenhouse")
def green_alt():
    """Lush clover/moss bed with pollen blooms over the leaf-litter floor."""
    t = green_floor()
    t.rng.seed(32)
    m = coverage(t, 32, edge=0.38)
    for y in range(32):
        for x in range(32):
            if m[y][x]:
                t.px(x, y, C["g2"])
    for x, y in rim(m):
        if t.rng.random() < 0.5:
            t.px(x, y, C["g0"], only=C["g1"])
    t.scatter(8, lambda x, y: t.blob(x, y, t.rng.randint(1, 2), 1, C["g1"], rough=0.5, only=C["g2"]))
    t.scatter(16, lambda x, y: leaf(t, x, y, C["g3"], C["g1"], only=(C["g2"], C["g1"])))
    def bloom(x, y):
        if not m[y % 32][x % 32]:
            return
        t.px(x, y, C["pink"])
        t.px(x + 1, y, C["pu1"])
        t.px(x, y + 1, C["pu1"])
        t.px(x + 1, y + 1, C["g1"])
    t.scatter(4, bloom)
    return t


@reg("wall_canopy_greenhouse")
def green_wall():
    t = Tile(C["g0"], seed=33)
    t.speckle(C["ink"], 0.12)
    # rusted greenhouse frame bar under the growth (one run, mostly hidden)
    t.vline(13, 0, 31, C["br0"])
    t.vline(14, 0, 31, C["br0"])
    t.vline(12, 0, 31, C["ink"])
    for y in range(0, 32, 5):
        t.px(13, y, C["br1"])
    # broken glass glints caught in the frame
    for x, y in ((9, 3), (26, 20), (14, 27)):
        t.px(x, y, C["sl4"])
        t.px(x + 1, y, C["sl3"])
        t.px(x, y + 1, C["sl3"])
    # dense leaf clumps (lit top-left), drawn over the frame
    def clump(cx, cy):
        r = t.rng.randint(2, 3)
        t.blob(cx, cy, r, r - 1, C["g1"], rough=0.3)
        t.blob(cx - 1, cy - 1, r - 1, max(1, r - 2), C["g2"], rough=0.3, only=C["g1"])
        t.px(cx - r + 1, cy - 1, C["g3"])
        t.px(cx + r - 1, cy + r - 1, C["g0"])
    t.scatter(16, clump)
    t.scatter(9, lambda x, y: leaf(t, x, y, C["g1"], C["ink"]))
    return t


# ================================================================ COLLAPSED RESIDENTIAL
# look floor #733e39 (floorboards) / alt #5a6988 (kitchen tile) / wall #3e2731 (brick)
@reg("floor_collapsed_residential")
def resi_floor():
    t = Tile(C["br1"], seed=41)
    heights = [6, 5, 5, 6, 5, 5]
    y = 0
    for h in heights:
        t.hline(0, 31, y, C["br0"])
        joints = sorted(t.rng.sample(range(32), 2))
        for jx in joints:
            t.vline(jx, y, y + h - 1, C["br0"])
            t.px(jx + 1, y + 2, C["br0"] if t.rng.random() < 0.5 else C["sl1"])  # nail
            t.px(jx - 1, y + h - 2, C["sl1"])
        # grain + lit board edge
        for _ in range(2):
            gx = t.rng.randint(0, 31)
            gy = y + t.rng.randint(2, h - 1)
            t.hline(gx, gx + t.rng.randint(3, 6), gy, C["br0"], only=C["br1"])
        lx = t.rng.randint(0, 31)
        t.hline(lx, lx + t.rng.randint(5, 12), y + 1, C["br2"], only=C["br1"])
        y += h
    # scuffed/worn spots (broken up so they never read as one blob)
    t.speckle(C["br2"], 0.03, only=C["br1"])
    # plaster dust and a splinter gap
    t.speckle(C["sl2"], 0.015, only=C["br1"])
    t.hline(4, 7, 23, C["ink"])
    t.px(5, 24, C["ink"])
    return t


@reg("floor_alt_collapsed_residential")
def resi_alt():
    """Faded kitchen tile laid over the floorboards, broken away at the edges."""
    t = resi_floor()
    t.rng.seed(42)
    m = coverage(t, 42, edge=0.5)
    for ty in range(4):
        for tx in range(4):
            x0, y0 = tx * 8, ty * 8
            if not m[(y0 + 4) % 32][(x0 + 4) % 32]:
                continue
            dark = (tx + ty) % 2 == 0
            for yy in range(y0, y0 + 8):
                for xx in range(x0, x0 + 8):
                    if xx == x0 or yy == y0:
                        c = C["sl1"]
                    elif dark and (xx + yy) % 2 == 0:
                        c = C["sl1"]
                    else:
                        c = C["sl2"]
                    t.px(xx, yy, c)
            if not dark:
                t.px(x0 + 1, y0 + 1, C["sl3"])
                t.px(x0 + 2, y0 + 1, C["sl3"])
            # chipped corner where the neighbour tile is gone
            if not m[(y0 + 12) % 32][(x0 + 4) % 32] and t.rng.random() < 0.7:
                t.rect(x0 + 5, y0 + 6, x0 + 7, y0 + 7, C["br1"])
                t.px(x0 + 5, y0 + 6, C["br0"])
            # grout line on the far side where the next tile is missing
            if not m[(y0 + 4) % 32][(x0 + 12) % 32]:
                t.vline(x0 + 8, y0, y0 + 7, C["sl1"])
            if not m[(y0 + 12) % 32][(x0 + 4) % 32]:
                t.hline(x0, x0 + 8, y0 + 8, C["br0"])
    crack(t, 10, 1, 9, C["sl1"], only=(C["sl2"],))
    crack(t, 27, 17, 8, C["sl1"], only=(C["sl2"],))
    t.speckle(C["sl1"], 0.04, only=C["sl2"])
    return t


@reg("wall_collapsed_residential")
def resi_wall():
    t = Tile(C["br0"], seed=43)
    # brick courses (top of a broken brick wall): 4px courses, staggered bricks
    for row in range(8):
        y0 = row * 4
        x = t.rng.randint(0, 31)
        for w in partition(t.rng, 32, 5, 8):
            if t.rng.random() < 0.2:       # brick knocked out: dark hole
                t.rect(x + 1, y0 + 1, x + w - 1, y0 + 3, C["ink"])
            else:
                col = C["red0"] if t.rng.random() < 0.1 else C["br1"]
                t.rect(x + 1, y0 + 1, x + w - 1, y0 + 3, col)
                if t.rng.random() < 0.6:
                    n = t.rng.randint(1, max(1, w - 3))
                    t.hline(x + 1, x + n, y0 + 1, C["br2"] if col == C["br1"] else C["br1"])
                t.px(x + w - 1, y0 + 3, C["br0"])
            x += w
    # plaster chunks still stuck on
    for _ in range(3):
        cx, cy = t.rng.randint(0, 31), t.rng.randint(0, 31)
        t.blob(cx, cy, 2, 1, C["sl2"], rough=0.4)
        t.px(cx - 1, cy - 1, C["sl3"])
    # broken lath / wood splinter
    t.line(3, 27, 7, 25, C["br2"])
    t.line(4, 28, 8, 26, C["br0"])
    return t


# ================================================================ DATA CENTER
# look floor #8b9bb4 (raised floor) / alt #3a4466 (grating) / wall #262b44 (server racks)
@reg("floor_data_center")
def data_floor():
    t = Tile(C["sl3"], seed=51)
    for py in range(2):
        for pxn in range(2):
            x0, y0 = pxn * 16, py * 16
            t.hline(x0, x0 + 15, y0, C["sl2"])
            t.vline(x0, y0, y0 + 15, C["sl2"])
            t.hline(x0 + 1, x0 + 12, y0 + 1, C["sl4"])
            t.vline(x0 + 1, y0 + 2, y0 + 9, C["sl4"])
            for bx, by in ((2, 2), (14, 2), (2, 14), (14, 14)):
                t.px(x0 + bx, y0 + by, C["sl2"])
            if (pxn + py) % 2 == 1:
                # perforated airflow panel
                for yy in range(4, 13, 3):
                    for xx in range(4, 13, 3):
                        t.px(x0 + xx, y0 + yy, C["sl2"])
    # scuffs, grime and moss in a seam corner
    t.speckle(C["sl2"], 0.03, only=C["sl3"])
    t.line(20, 5, 26, 7, C["sl2"], only=C["sl3"])
    for x, y in ((0, 0), (16, 16)):
        t.px(x, y, C["g1"])
        t.px(x + 1, y, C["g2"])
        t.px(x, y + 1, C["g1"])
        t.px(x - 1, y, C["g1"])
        t.px(x, y - 1, C["g2"])
    return t


@reg("floor_alt_data_center")
def data_alt():
    t = Tile(C["sl1"], seed=52)
    # steel grating: slots in rows, rails every 16px
    for y in range(32):
        for x in range(32):
            if y % 3 == 1 and x % 16 not in (0, 1, 15):
                t.px(x, y, C["ink"])
    for x in (0, 16):
        t.vline(x, 0, 31, C["sl2"])
        t.vline(x + 1, 0, 31, C["sl1"])
        t.vline(x - 1, 0, 31, C["sl0"])
    # what lies below: a cable bundle glimpsed through the slots
    cable = {5: C["bl0"], 6: C["bl0"], 8: C["g1"], 9: C["g1"],
             22: C["sl0"], 23: C["sl0"], 25: C["bl0"]}
    for y in range(32):
        for x in range(32):
            if t.get(x, y) == C["ink"] and x in cable and (y < 20 if x < 16 else y > 8):
                t.px(x, y, cable[x])
    # lit bar tops between slots
    for y in range(32):
        for x in range(32):
            if y % 3 == 2 and t.get(x, y) == C["sl1"] and t.rng.random() < 0.25:
                t.px(x, y, C["sl2"])
    for x, y in ((12, 6), (27, 20)):
        t.px(x, y, C["br1"])
        t.px(x + 1, y, C["br1"])
    return t


@reg("wall_data_center")
def data_wall():
    t = Tile(C["sl0"], seed=53)
    for rx in (0, 16):
        t.vline(rx, 0, 31, C["ink"])          # gap between racks
        t.vline(rx + 1, 0, 31, C["sl1"])      # lit frame edge
        t.vline(rx + 15, 0, 31, C["ink"])
        for y in range(0, 32):
            if y % 4 == 2:
                t.hline(rx + 3, rx + 12, y, C["ink"])      # vent slots
        # rack unit divisions
        t.hline(rx + 1, rx + 14, 0, C["sl1"])
        t.hline(rx + 1, rx + 14, 16, C["sl1"])
    # status LEDs
    for x, y, c in ((4, 4, C["cyan"]), (6, 4, C["g3"]), (20, 12, C["cyan"]), (22, 12, C["red"]),
                    (5, 20, C["g3"]), (21, 28, C["cyan"])):
        t.px(x, y, c)
    # vine creeping over one rack
    for k in range(10):
        t.px(26 + (k % 3 == 0), 8 + k * 2 % 32, C["g1"])
    t.px(27, 9, C["g2"])
    t.px(26, 15, C["g2"])
    return t


# ================================================================ WATER (2 frames)
def water_frame(phase):
    t = Tile(C["bl0"], seed=61)
    # deeper water: sparse dark flecks
    t.speckle(C["sl1"], 0.03)
    # same ripple set, drifted per frame for a gentle 2-frame swell
    import random
    r = random.Random(62)
    pts = []
    k = 4
    for j in range(k):
        for i in range(k):
            pts.append((int(i * 8 + r.uniform(0, 6)), int(j * 8 + r.uniform(0, 6)), r.randint(3, 5)))
    for x, y, n in pts:
        x += phase * 2
        y += phase * (1 if (x // 8) % 2 else 0)
        for i in range(n):
            t.px(x + i, y, C["bl1"])
        t.px(x + 1, y - 1 if n > 3 else y, C["bl1"])
        t.px(x + n - 1 + phase, y + 1, C["bl0"])
        if (x + y + phase) % 3 == 0:
            t.px(x + 1, y, C["cyan"])
    return t


# ================================================================ NIGHT MAP
@reg("floor_defense")
def def_floor():
    t = Tile(C["g1"], seed=71)
    # meadow grass: many small lighter clumps (no single big shape to grid)
    t.scatter(16, lambda x, y: t.blob(x, y, t.rng.randint(1, 3), t.rng.randint(1, 2), C["g2"], rough=0.6))
    t.speckle(C["g0"], 0.06, only=C["g1"])
    t.speckle(C["g1"], 0.12, only=C["g2"])
    t.scatter(14, lambda x, y: tuft(t, x, y, C["g3"], C["g2"], C["g0"]))
    return t


@reg("floor_alt_defense")
def def_alt():
    """Cracked old plaza slab surfacing through the meadow (edges = floor_defense)."""
    t = def_floor()
    t.rng.seed(72)
    m = coverage(t, 72, edge=0.28)
    for y in range(32):
        for x in range(32):
            if m[y][x]:
                t.px(x, y, C["sl1"])
    for x, y in rim(m):
        t.px(x, y, C["g0"], only=(C["g1"], C["g2"]))
    t.hline(0, 31, 13, C["sl0"], only=C["sl1"])
    t.hline(0, 31, 14, C["sl2"], only=C["sl1"])
    t.vline(17, 0, 12, C["sl0"], only=C["sl1"])
    t.vline(18, 0, 12, C["sl2"], only=C["sl1"])
    crack(t, 8, 16, 9, C["sl0"], only=C["sl1"])
    t.speckle(C["sl2"], 0.05, only=C["sl1"])
    t.speckle(C["g1"], 0.18, only=C["sl1"])
    t.speckle(C["g2"], 0.05, only=C["sl1"])
    def tf(x, y):
        if m[y % 32][x % 32]:
            t.px(x, y, C["g2"])
            t.px(x + 1, y, C["g1"])
    t.scatter(6, tf)
    return t


@reg("lane_defense")
def def_lane():
    t = Tile(C["sl3"], seed=73)
    # worn asphalt: aggregate + dirt ruts, cracks with weeds
    t.speckle(C["sl2"], 0.22)
    t.speckle(C["sl4"], 0.04, only=C["sl3"])
    # packed dirt where the asphalt has worn through (small, muted)
    for _ in range(4):
        t.blob(t.rng.randint(0, 31), t.rng.randint(0, 31), t.rng.randint(1, 3), t.rng.randint(1, 2),
               C["br3"], rough=0.6)
    t.speckle(C["sl2"], 0.3, only=C["br3"])
    t.speckle(C["br2"], 0.2, only=C["br3"])
    for _ in range(3):
        crack(t, t.rng.randint(0, 31), t.rng.randint(0, 31), t.rng.randint(8, 13), C["sl1"])
    for _ in range(3):
        x, y = t.rng.randint(0, 31), t.rng.randint(0, 31)
        t.px(x, y, C["g2"])
        t.px(x + 1, y, C["g1"])
    return t


# ================================================================ build
def main():
    out_prev = HERE / "preview"
    out_prev.mkdir(exist_ok=True)
    ims = {}
    for key, fn in TILES.items():
        im = fn().image()
        ims[key] = im
        check_palette(im, key)
        im.save(SPRITES / f"{key}.png")
    w0, w1 = water_frame(0).image(), water_frame(1).image()
    from PIL import Image
    strip = Image.new("RGBA", (64, 32))
    strip.paste(w0, (0, 0))
    strip.paste(w1, (32, 0))
    strip.save(SPRITES / "water.png")
    check_palette(strip, "water")
    ims["water"] = w0
    ims["water_f2"] = w1

    # per-tile 4x4 tiled previews
    items = []
    for key, im in ims.items():
        tt = tiled(im, 4, 4)
        up(tt, 4).save(out_prev / f"{key}_4x4.png")
        items.append((key, tt))
    label_sheet(items, out_prev / "all_tiles_4x4.png", scale=2, cols=6)
    label_sheet([(k, night(i)) for k, i in items], out_prev / "all_tiles_4x4_night.png", scale=2, cols=6)
    print("tiles:", len(ims))


if __name__ == "__main__":
    main()
