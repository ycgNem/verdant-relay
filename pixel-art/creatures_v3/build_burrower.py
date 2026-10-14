"""Burrower (night ambusher) - 40x32 x8: idle 0-1, walk 2-5, burrowed 6-7. Facing right, feet on row 31.

A naked-mole beast with a salvaged steel drill grafted over its snout: wrinkled pink-tan hide, a back of overlapping
rusted plates, huge bone digging claws, tiny red eyes. The drill's spiral grooves turn every frame.
burrowed: a travelling dirt mound, the drill tip breaking the surface at the front, clods flying.
V2 look: 6-tone hue-shifted ramps, plate texture, selective outline.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from crlib import *  # noqa: F401,F403

W, H = 40, 32
BONE = ["#2a2018", "#4a3a2a", "#7a6650", "#a8927a", "#cdbda2", "#ece0c8"]


def drill(r, bx, by, tip_x, tip_y, half, spin, seed=0):
    """A steel drill cone from its base (bx, by +- half) to the tip, spiral grooves offset by `spin`."""
    poly = [(bx, by - half), (tip_x, tip_y), (bx, by + half)]
    m = Shape(W, H).add(poly).mask()
    px = []
    L_ = tip_x - bx
    for (x, y) in m:
        t = (x + 0.5 - bx) / max(1, L_)
        w = max(0.5, half * (1 - t))
        s = (y + 0.5 - (by + (tip_y - by) * t)) / w            # -1 top .. 1 bottom
        nz = math.sqrt(max(0.0, 1 - s * s))
        d = L[1] * s + L[2] * nz
        tt = 2.6 + 2.4 * d
        if ((x + 0.5 - bx) * 0.9 + s * 3.0 + spin) % 3.0 < 1.0:
            tt -= 1.6                                          # spiral groove
        px.append((x, y, tt))
    r.pixels(px, STEELR, 3.0, glow=False, ao=True)
    # collar where the drill is bolted on
    r.plate([(bx - 1.0, by - half - 0.6), (bx + 0.8, by - half - 0.6), (bx + 0.8, by + half + 0.6), (bx - 1.0, by + half + 0.6)],
            STEELR, base=2.0, gain=1.2, grime=0.3, seed=seed, bevel=1)
    r.pixels([(int(bx), int(by - half + 1)), (int(bx), int(by + half - 1))], RUSTR, 4.0, glow=False)


def draw(frame):
    r = Rig(W, H)
    if frame >= 6:
        # ---- burrowed: a dirt mound sliding along, drill tip out front, clods thrown up
        k = frame - 6
        r.ell(18.0, 32.0, 15.5, 11.0, DIRT, base=2.0, gain=2.6, grime=0.45, seed=31 + k,
              clip=lambda x, y: y <= 31, tex=lambda x, y, a, b: cells(x, y, 2.4, 7 + k, 0.5, 0.6))
        # the scutes' ridge breaking through the soil along the top of the mound
        for i, (px_, py_) in enumerate(((11.0, 23.5), (17.5, 22.0), (24.0, 23.0))):
            r.ell(px_, py_ + (0.5 if (i + k) % 2 else 0), 3.0, 2.2, RUSTR, base=2.2, gain=2.0, grime=0.3, seed=40 + i,
                  clip=lambda x, y, c=py_: y <= c + 0.5)
        drill(r, 32.0, 26.0 - k * 0.5, 39.0, 24.5 - k * 0.5, 3.4, spin=k * 1.5, seed=5)
        clods = [((8, 18), (30, 15), (34, 18)), ((6, 15), (29, 12), (36, 16))][k]
        r.pixels([(x, y, 3.0) for (x, y) in clods] + [(x + 1, y, 2.0) for (x, y) in clods] + [(x, y + 1, 1.6) for (x, y) in clods],
                 DIRT, 2.6, glow=False)
        r.pixels([(4, 30, 2.6), (5, 29, 3.2), (36, 30, 2.4), (37, 29, 3.0)], DIRT, 3.0, glow=False)
        return r.render()

    walk = 2 <= frame <= 5
    ph = (frame - 2) / 4.0 if walk else 0.0
    bob = (1 if frame in (3, 5) else 0) if walk else 0
    oy = -bob
    breathe = 0.4 if frame == 1 else 0.0

    def step(far):
        if not walk:
            return 0.0, 0.0
        a = 2 * math.pi * (ph + (0.5 if far else 0.0))
        return 2.5 * math.cos(a), max(0.0, 1.6 * math.sin(a))

    # far legs
    dx, lift = step(True)
    r.limb([(8.5, 24.0 + oy), (7.5 + dx, 30.5 - lift)], 3.6, 3.0, HIDE, base=1.2, gain=1.4, grime=0.1, seed=1)
    r.limb([(24.0, 25.0 + oy), (27.0 + dx, 30.5 - lift)], 3.6, 3.0, HIDE, base=1.2, gain=1.4, grime=0.1, seed=2)
    # tail stub
    r.limb([(4.0, 21.0 + oy), (1.5, 23.0 + oy), (1.0, 25.0 + oy)], 2.4, 1.2, HIDE, base=2.2, gain=1.4, grime=0.1, seed=3)
    # body: wrinkled hide
    wrinkle = lambda x, y, a, b: (-1.0 if (x * 2 + y) % 6 == 0 and b > -0.2 else 0.0)
    r.ell(15.5, 20.0 + oy, 12.5 + breathe, 8.6 + breathe, HIDE, base=2.4, gain=2.3, grime=0.25, seed=4, tex=wrinkle)
    # back plates: three overlapping rusted scutes, rear to front
    for i, (px_, py_) in enumerate(((7.5, 16.0), (14.0, 13.5), (21.0, 14.5))):
        ridge = lambda x, y, a, b: (0.9 if b < -0.55 else 0.0) + (-1.0 if b > 0.25 else 0.0) + (-0.8 if (x + i) % 4 == 0 and b > -0.3 else 0.0)
        r.ell(px_, py_ + oy, 6.0, 4.8, RUSTR, base=1.9, gain=2.2, grime=0.3, seed=10 + i,
              clip=lambda x, y, c=py_: y <= c + oy + 2.5, tex=ridge)
    # head + drill
    r.ell(27.0, 21.0 + oy, 5.8, 5.4, HIDE, base=2.6, gain=2.3, grime=0.2, seed=6, tex=wrinkle)
    drill(r, 30.5, 21.0 + oy, 39.5, 21.5 + oy, 4.8, spin=frame * 1.0, seed=7)
    r.pixels([(28, int(18 + oy), 4.0), (27, int(18 + oy), 3.0)], ["#3a0808", "#6a1010", "#a82020", "#e04434", "#ff8070", "#ffd0c8"], 4.0)
    # near legs: a huge digging fore-claw and a short hind leg
    dx, lift = step(False)
    r.limb([(10.5, 24.0 + oy), (9.0 + dx, 30.5 - lift)], 4.2, 3.4, HIDE, base=2.4, gain=1.6, grime=0.15, seed=8)
    r.limb([(23.5, 24.0 + oy), (26.0 + dx * 0.8, 28.0 - lift * 0.5)], 4.6, 4.0, HIDE, base=2.6, gain=1.6, grime=0.15, seed=9)
    cx0, cy0 = 26.5 + dx * 0.8, 29.0 - lift * 0.5
    for j in range(3):                                          # bone claws
        r.limb([(cx0 + j * 1.2, cy0), (cx0 + 1.5 + j * 1.4, cy0 + 2.4)], 1.4, 0.9, BONE, base=4.0 - j * 0.4, gain=1.0, grime=0.0)
    r.pixels([(int(9.0 + dx) + j, int(31 - lift), 3.6) for j in (-1, 1)], BONE, 3.6, glow=False)
    return r.render()


if __name__ == "__main__":
    fr = [draw(f) for f in range(8)]
    im = strip(fr)
    save_sprite("burrower", im)
    print("burrower", im.size, len(set(c for f in fr for c in f.colors())), "colours")
    sheet([("burrower", im, W)], SCRATCH / "cr_burrower.png", scale=4)
