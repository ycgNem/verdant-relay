"""Seedling (Seed Carrier spawn) - 20x20 x6: idle 0-1, walk 2-5. Facing right, feet on row 19.

A sprouted seed on root-legs: a glossy amber-brown seed body with a dark seam, two leaves on top, a slit of a face
with one glowing eye, scurrying on two rootlet legs. V2 look: 6-tone hue-shifted ramps, selective outline.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from crlib import *  # noqa: F401,F403

W, H = 20, 20
SEEDB = ["#1e0e0a", "#3c1c10", "#62341a", "#8a5226", "#b07436", "#d8a25a"]
ROOTL = ["#1a1010", "#2e1c16", "#4a2e20", "#6a442c", "#8c5e3a", "#ae7c4e"]


def draw(frame):
    walk = frame >= 2
    ph = (frame - 2) / 4.0 if walk else 0.0
    bob = (1 if frame in (2, 4) else 0) if walk else 0
    oy = -bob
    r = Rig(W, H)
    sway = (1.0 if frame % 2 else -0.5)

    def legpos(far):
        if not walk:
            return 0.0, 0.0
        a = 2 * math.pi * (ph + (0.5 if far else 0.0))
        return 1.8 * math.cos(a), max(0.0, 1.4 * math.sin(a))
    dx, lift = legpos(True)
    r.limb([(8.5, 15.0 + oy), (7.5 + dx, 19.0 - lift)], 2.0, 1.4, ROOTL, base=1.6, gain=1.2, grime=0.0)
    # leaves (behind the seed's top)
    r.limb([(10.0, 7.0 + oy), (7.5 + sway * 0.5, 3.5 + oy), (4.5 + sway, 2.5 + oy)], 2.6, 1.0, LEAF, base=3.2, gain=1.6, grime=0.0)
    r.limb([(10.5, 7.0 + oy), (12.5 + sway * 0.5, 3.0 + oy), (15.0 + sway, 1.5 + oy)], 2.6, 1.0, LEAF, base=2.6, gain=1.6, grime=0.0)
    r.limb([(10.2, 8.0 + oy), (10.2, 5.0 + oy)], 1.6, 1.4, LEAF, base=2.4, gain=1.0, grime=0.0)
    # the seed body: an egg, pointed at the top, a dark seam curving down its side
    seam = lambda x, y, a, b: (-1.4 if abs(a - 0.25 * b - 0.1) < 0.12 and b > -0.6 else 0.0)
    r.ell(10.0, 12.3 + oy, 5.4, 5.4, SEEDB, base=2.0, gain=2.5, grime=0.15, seed=3, spec=0.9, tex=seam)
    r.pixels([(10, int(6.5 + oy), 3.0), (9, int(7.0 + oy), 3.6)], SEEDB, 3.0, glow=False)        # the seed's tip
    r.pixels([(7, int(13 + oy), 3.2), (8, int(14 + oy), 3.8), (8, int(15 + oy), 3.2)], SEEDO, 3.4)  # a glowing crack
    # face: a slit mouth and one glowing eye
    r.pixels([(13, int(11 + oy), 4.0), (14, int(11 + oy), 5.0)], AMBERG, 4.6)
    r.pixels([(12, int(14 + oy), 0.0), (13, int(14 + oy), 0.0), (14, int(14 + oy), 0.0), (15, int(13 + oy), 0.0)], SEEDB, 0.0, glow=False)
    dx, lift = legpos(False)
    r.limb([(11.0, 16.0 + oy), (12.0 + dx, 19.0 - lift)], 2.2, 1.4, ROOTL, base=2.8, gain=1.2, grime=0.0)
    return r.render()


if __name__ == "__main__":
    fr = [draw(f) for f in range(6)]
    im = strip(fr)
    save_sprite("seedling", im)
    print("seedling", im.size, len(set(c for f in fr for c in f.colors())), "colours")
    sheet([("seedling", im, W)], SCRATCH / "cr_seedling.png", scale=6)
