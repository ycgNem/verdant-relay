"""Seed Carrier (night swarm-bearer) - 48x40 x6: idle 0-1, walk 2-5. Side view facing right, feet on the bottom row.

A hunched six-legged husk-beetle hauling a split seed pod on its back: the husk is plated olive-brown bark, the
split along its top shows glowing amber seeds (they burst out as Seedlings when it dies), amber veins glow through
the husk's cracks. Low chitin head with mandibles and amber eyes, thin jointed legs.
V2 look: 6-tone hue-shifted ramps, plate texture, selective outline.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from crlib import *  # noqa: F401,F403

W, H = 48, 40


def draw(frame):
    walk = frame >= 2
    ph = (frame - 2) / 4.0 if walk else 0.0
    bob = 1 if (walk and frame in (3, 5)) else 0
    breathe = 0.5 if (not walk and frame == 1) else 0.0
    r = Rig(W, H)
    oy = -bob

    def leg(hip, knee, foot, base, wid=1.9, seed=0):
        r.limb([hip, knee], wid + 0.5, wid, CHITIN, base=base, gain=1.6, grime=0.1, seed=seed)
        r.limb([knee, foot], wid, 1.0, CHITIN, base=base - 0.3, gain=1.4, grime=0.05, seed=seed + 1)

    def gait(i, far):
        if not walk:
            return 0.0, 0.0
        p = ph + (0.5 if (i % 2 == 1) != far else 0.0)
        a = 2 * math.pi * p
        return 2.6 * math.cos(a), max(0.0, 2.0 * math.sin(a))

    hips = [(15, 25), (23, 27), (31, 26)]
    knees = [(8, 26), (21, 31), (38, 27)]
    feet = [(4, 39), (17, 39), (42, 39)]
    for i in range(3):                       # far legs: darker, shifted back
        dx, lift = gait(i, True)
        (hx, hy), (kx, ky), (fx, fy) = hips[i], knees[i], feet[i]
        leg((hx + 2, hy - 2 + oy), (kx + 3 + dx * 0.5, ky - 2 + oy - lift * 0.5), (fx + 4 + dx, fy - 1 - lift), 0.9, wid=1.6, seed=10 + i)

    # ---- the seed pod: plated husk with glowing veins in the cracks
    cx, cy = 19.0, 17.0 + oy
    plates = lambda x, y, dx, dy: cells(x, y - oy, 4.6, 11, crack=0.75)
    pod = r.ell(cx, cy, 15.5 + breathe, 11.5 + breathe, HUSK, base=1.8, gain=2.5, grime=0.25, seed=3, tex=plates, spec=0.93)
    # the split along the top: the far lip, a row of seeds, the near lip overlapping their lower halves
    glow_b = 2.7 if frame % 2 == 0 else 2.3
    r.pixels([(x, y, 1.0) for x in range(7, 31) for y in range(int(cy - 11), int(cy - 6))
              if ((x + 0.5 - 19) / 12.0) ** 2 + ((y + 0.5 - (cy - 8.0)) / 3.2) ** 2 <= 1], MOSSY, 1.0, glow=False)
    for k, sx in enumerate((9.5, 14.5, 25.0, 19.8, 29.0)):          # drawn so neighbours overlap: dark rims between seeds
        sy = cy - 8.6 + (1.0 if k in (0, 4) else 0.0) - (1.0 if k == 3 else 0.0)
        rr = 2.6 if k in (1, 2, 3) else 2.2
        r.ell(sx, sy, rr, rr * 0.92, SEEDO, base=glow_b + (0.5 if (k + frame) % 3 == 0 else 0), gain=2.2, grime=0.0, spec=0.8,
              glow=False, ao=True)
        r.pixels([(int(sx), int(sy - rr * 0.1)), (int(sx), int(sy + rr * 0.5))], SEEDO, 1.2, glow=False)   # seed seam
    lip = Shape(W, H).add([(6.0, cy - 7.0), (12.0, cy - 7.8), (19.0, cy - 7.2), (26.0, cy - 7.8), (32.0, cy - 6.0),
                           (31.0, cy - 3.6), (19.0, cy - 4.4), (7.0, cy - 4.2)]).mask()
    r.pixels([(x, y, 3.6 - 0.12 * (x - 6) * 0.2 - (1.2 if (x, y + 1) not in lip else 0)) for (x, y) in lip], HUSK, 3.0, glow=False)
    # amber veins glowing through a few cracks on the flank
    veins = [(9, int(cy + 1)), (10, int(cy + 2)), (11, int(cy + 2)), (21, int(cy + 4)), (22, int(cy + 5)), (23, int(cy + 5)),
             (27, int(cy)), (28, int(cy + 1))]
    r.pixels([(x, y, 3.0 if (x + frame) % 3 else 3.8) for (x, y) in veins], SEEDO, 3.0)
    for (bx, by, ex, ey) in ((5.0, cy - 2.0, 2.0, cy - 5.0), (4.5, cy + 3.0, 1.5, cy + 2.0), (8.0, cy - 6.0, 6.0, cy - 9.5)):
        r.limb([(bx, by), (ex, ey)], 2.0, 0.8, HUSK, base=3.0, gain=1.4, grime=0.0)
    # moss on the shoulder of the pod
    r.pixels([(5, int(cy - 3), 3.4), (6, int(cy - 4), 4.2), (7, int(cy - 5), 3.4), (4, int(cy - 1), 2.6), (5, int(cy - 2), 3.6),
              (13, int(cy + 8), 2.8), (14, int(cy + 9), 3.4), (15, int(cy + 9), 2.6)], MOSSY, 3.0, glow=False)

    # ---- thorax + low head
    r.ell(32.5, 22.0 + oy, 7.0, 6.2, CHITIN, base=2.2, gain=2.3, grime=0.2, seed=7, tex=lambda x, y, a, b: cells(x, y, 3.5, 4, 0.6, 0.3))
    r.ell(40.0, 25.0 + oy, 5.4, 4.6, CHITIN, base=2.6, gain=2.3, grime=0.15, seed=8, spec=0.88)
    # brow ridge
    r.pixels([(37, int(21 + oy), 3.8), (38, int(21 + oy), 4.4), (39, int(21 + oy), 4.4), (40, int(21 + oy), 3.8)], CHITIN, 4.0, glow=False)
    # mandibles (bone)
    r.limb([(43.0, 27.5 + oy), (46.5, 29.0 + oy), (45.5, 31.5 + oy)], 1.8, 1.0, HUSK, base=4.2, gain=1.2, grime=0.0)
    r.limb([(41.0, 28.5 + oy), (43.0, 31.5 + oy)], 1.5, 1.0, HUSK, base=3.4, gain=1.0, grime=0.0)
    # eyes (emissive amber)
    r.pixels([(42, int(23 + oy), 4.0), (43, int(23 + oy), 5.0), (40, int(24 + oy), 3.0)], AMBERG, 4.0)
    # ---- near legs
    for i in range(3):
        dx, lift = gait(i, False)
        (hx, hy), (kx, ky), (fx, fy) = hips[i], knees[i], feet[i]
        leg((hx, hy + oy), (kx + dx * 0.5, ky + oy - lift * 0.5), (fx + dx, fy - lift), 2.4, seed=20 + i)
    return r.render()


if __name__ == "__main__":
    fr = [draw(f) for f in range(6)]
    im = strip(fr)
    save_sprite("seed_carrier", im)
    print("seed_carrier", im.size, len(set(c for f in fr for c in f.colors())), "colours")
    sheet([("seed_carrier", im, W)], SCRATCH / "cr_seed_carrier.png", scale=4)
