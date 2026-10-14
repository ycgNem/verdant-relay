"""Verdant Relay - spore pod and spore cloud puffs (critic H #12, §1.8).

spore_pod    20x20, 4 frames: idle 0-1 (slow breathing), swell 2-3 (about to burst: bigger, pores glowing)
             anchor bottom centre [10, 19]. Magenta gourd-bulb with a pale rim and a dark plum outline so it
             pops out of the ferns; a puckered vent on top, two dark leaves at its foot.
spore_puff_1..3  32x24 each, single frame: cauliflower puffs of spore gas, 3 tones #9fae3a / #c5c95a / #e9e48a,
             lit from the top-left; the outer band is a hard-alpha Bayer dither (no semi-transparent texels).
Run: python pixel-art/spore_pod/build.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
from v3lib import Grid, save_sprite, report, board, strip, zoomgrid, row, up, SCRATCH  # noqa: E402
from PIL import Image  # noqa: E402

O = "#1e0a1c"     # outline (near-black plum)
M0 = "#5c1648"    # magenta shadow
M1 = "#9c2470"
M2 = "#d4398f"
M3 = "#f27ab8"
RIM = "#ffd0e6"   # pale rim light
V1 = "#c5c95a"    # spore glow (same tones as the cloud)
V2 = "#e9e48a"
G0 = "#10281a"    # foot leaves
G1 = "#1f5232"
G2 = "#2f7a44"

BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


# =========================================================================== pod
def pod(frame):
    """frame 0/1 idle (breath), 2/3 swelling."""
    g = Grid(20, 20)
    swell = {0: 0.0, 1: 0.3, 2: 1.0, 3: 1.7}[frame]
    rx = 5.7 + swell * 0.9
    ry = 5.6 + swell * 0.6 + (0.35 if frame == 1 else 0)
    cx = 10.0
    cy = 15.0 - ry                  # the bulb sits on its neck at y ~ 15
    # --- foot leaves: two small blades fanning out from the base (drawn first, the bulb overlaps them)
    for side in (-1, 1):
        blade = [(10 + side * k, 18 - (k * k) // 14) for k in range(1, 8)]
        for i, (x, y) in enumerate(blade):
            g.px(x, y, G1)
            g.px(x, y - 1, G2 if i > 0 and i < 6 else G1)
            if i < 4:
                g.px(x, y + 1, G0)
    # --- neck
    for y in range(14, 19):
        g.px(9, y, M1)
        g.px(10, y, M1 if y < 16 else M0)
        g.px(11, y, M0)
    # --- bulb: onion/teardrop - round below, narrowing toward the vent on top; sphere-lit, 4 tones
    L = (-0.55, -0.72, 0.42)
    Ln = math.sqrt(sum(c * c for c in L))
    L = tuple(c / Ln for c in L)
    inside = set()
    for y in range(20):
        for x in range(20):
            ny = (y + 0.5 - cy) / ry
            k = 1.0 - 0.32 * max(0.0, -ny) ** 1.6       # narrower toward the top
            nx = (x + 0.5 - cx) / (rx * k)
            d2 = nx * nx + ny * ny
            if d2 > 1.0:
                continue
            inside.add((x, y))
            nz = math.sqrt(max(0.0, 1 - d2))
            dif = nx * L[0] + ny * L[1] + nz * L[2]
            c = M0 if dif < 0.08 else M1 if dif < 0.45 else M2 if dif < 0.8 else M3
            g.px(x, y, c)
    # a single rib (meridian) on the shadow side gives the bulb a gourd form
    for y in range(20):
        ny = (y + 0.5 - cy) / ry
        if -0.55 < ny < 0.85:
            k = 1.0 - 0.32 * max(0.0, -ny) ** 1.6
            x = int(math.floor(cx + 0.5 * rx * k * math.sqrt(max(0, 1 - ny * ny))))
            if (x, y) in inside:
                g.px(x, y, M0 if g.get(x, y) in (M1, M0) else M1)
    # pale rim on the lit edge (top-left facing texels of the silhouette)
    for (x, y) in inside:
        if any(p not in inside for p in ((x - 1, y), (x, y - 1))):
            ny = (y + 0.5 - cy) / ry
            nx = (x + 0.5 - cx) / rx
            if -(nx + ny) > 0.5:
                g.px(x, y, RIM)
    # vent: a puckered mouth on top (dark, lips lit), glowing when swelling
    vy = min(y for x, y in inside)
    g.px(10, vy, O)
    g.px(10, vy - 1, None)
    g.px(9, vy, M3)
    g.px(11, vy, M1)
    if frame >= 2:
        g.px(10, vy, V2)
        g.px(10, vy - 1, V1)
    # pores: pale freckles on idle, glowing yellow-green when swelling
    pores = [(-0.45, 0.05), (0.2, 0.3), (0.5, -0.15), (-0.2, 0.62), (0.45, 0.62), (-0.05, -0.3)]
    for i, (px_, py_) in enumerate(pores):
        x = int(math.floor(cx + px_ * rx))
        y = int(math.floor(cy + py_ * ry))
        if (x, y) not in inside or g.get(x, y) == RIM:
            continue
        if frame >= 2:
            if i < 5:
                g.px(x, y, V2 if (i + frame) % 2 == 0 else V1)
        elif i < 3:
            g.px(x, y, M3 if g.get(x, y) in (M1, M0) else RIM)
    # escaping spores above the vent while swelling
    if frame == 3:
        g.px(9, vy - 3, V2)
        g.px(12, vy - 2, V1)
    elif frame == 2:
        g.px(11, vy - 2, V1)
    g.outline(O)
    return g


# =========================================================================== puffs
PUFF = ["#9fae3a", "#c5c95a", "#e9e48a"]


def puff(lobes, seed=0):
    """lobes: [(cx, cy, r)]. Cloud shading: a global top->bottom gradient plus a lit cap on the upper-left of
    every bump (the higher bumps own their texels, so each one shows its own rim of light). The outer band of
    the union dithers to transparent with a 4x4 Bayer (hard alpha), heavier on the shadow side and the bottom."""
    W, H = 32, 24
    g = Grid(W, H)
    order = sorted(range(len(lobes)), key=lambda i: -lobes[i][1])     # bottom bumps first, top bumps last
    owner = {}
    for i in order:
        cx, cy, r = lobes[i]
        for y in range(H):
            for x in range(W):
                if math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r:
                    owner[(x, y)] = i
    M = set(owner)
    top = min(y for x, y in M)
    bot = max(y for x, y in M)
    for (x, y), i in owner.items():
        cx, cy, r = lobes[i]
        nx = (x + 0.5 - cx) / r
        ny = (y + 0.5 - cy) / r
        local = -(0.62 * nx + 0.78 * ny)                 # -1 .. 1, +1 = facing the light
        t = (y - top) / max(1, bot - top)                 # 0 top .. 1 bottom
        v = 0.55 * local - 0.75 * t + 0.42
        c = PUFF[2] if v > 0.42 else PUFF[1] if v > -0.02 else PUFF[0]
        g.px(x, y, c)
    # edge dither: within 2 px of the outside, keep a texel only if its depth beats the Bayer threshold
    for (x, y) in list(M):
        dmin = 9.0
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                if (x + dx, y + dy) not in M:
                    dmin = min(dmin, math.hypot(dx, dy))
        if dmin > 2.0:
            continue
        cx, cy, r = lobes[owner[(x, y)]]
        shade_side = max(0.0, ((x + 0.5 - cx) + (y + 0.5 - cy)) / (r * 1.41))
        t = (y - top) / max(1, bot - top)
        keep = (dmin - 0.5) / 1.5 - 0.35 * shade_side - 0.25 * t
        if keep * 16 < BAYER4[(y + seed) % 4][(x + seed * 2) % 4]:
            g.px(x, y, None)
    return g


PUFFS = {
    "spore_puff_1": [(8, 16, 4.6), (15, 15, 6.4), (23, 16, 5.0), (12, 10, 5.0), (20, 9, 5.6), (27, 13, 3.4)],
    "spore_puff_2": [(9, 15, 5.4), (18, 16, 5.6), (25, 15, 4.4), (15, 9, 5.8), (23, 10, 4.2), (6, 11, 3.2)],
    "spore_puff_3": [(10, 16, 5.0), (19, 15, 6.0), (26, 17, 3.6), (14, 10, 4.6), (21, 8, 4.4), (8, 12, 3.4), (26, 12, 3.2)],
}


if __name__ == "__main__":
    pods = [pod(i) for i in range(4)]
    save_sprite("spore_pod", strip(pods))
    report("spore_pod", pods)
    puffs = []
    for i, (k, lobes) in enumerate(PUFFS.items()):
        p = puff(lobes, seed=i)
        save_sprite(k, p.image())
        report(k, [p])
        puffs.append((k, p))
    row([zoomgrid(p.image(), 12, bg=(40, 70, 48)) for p in pods]).save(SCRATCH / "z_spore_pod.png")
    row([zoomgrid(p.image(), 10, bg=(40, 70, 48)) for k, p in puffs]).save(SCRATCH / "z_spore_puff.png")
    # a cloud as the game would draw it: 7 instanced puffs overlapping, at 1x and x3
    cl = Image.new("RGBA", (96, 56), (38, 62, 44, 255))
    for k, (x, y) in zip([0, 1, 2, 0, 1, 2, 1], [(4, 22), (30, 26), (58, 20), (20, 8), (44, 6), (66, 30), (36, 30)]):
        cl.alpha_composite(puffs[k][1].image(), (x, y))
    up(cl, 4).save(SCRATCH / "z_spore_cloud.png")
