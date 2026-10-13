"""Verdant Relay - flat floor decals.
spores (32x32, idle 2): spore-hazard patch seen from above - mycelium threads, puffball caps,
                       drifting spores; frame 2 the caps swell and the spores drift.
alarm  (32x8,  idle 2): red security laser across the floor between two emitters; flickers.
Run: python pixel-art/spores/build.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import C, Pix, deliver  # noqa: E402

CAP = [C["pu0"], C["pu1"], C["pink"], C["skin"]]


def spores(frame):
    p = Pix(32, 32, seed=901)
    # mycelium threads radiating from the centre
    rng = p.rng
    for i in range(11):
        a = i * (2 * math.pi / 11) + rng.uniform(-0.2, 0.2)
        x, y = 16.0, 16.0
        L = rng.randint(11, 15)
        for k in range(L):
            a += rng.uniform(-0.35, 0.35)
            x += math.cos(a)
            y += math.sin(a)
            p.px(x, y, C["pu0"])
            if k > 5 and rng.random() < 0.18:
                p.px(x + math.cos(a + 1.4), y + math.sin(a + 1.4), C["pu0"])
    # stained core
    for x, y in Pix.ellipse_pts(16, 16, 7, 6):
        if rng.random() < 0.85:
            p.px(x, y, C["pu0"])
    # puffball caps (top-down discs, lit top-left)
    caps = [(12, 13, 3), (20, 14, 3), (15, 20, 3), (8, 20, 2), (22, 21, 2), (18, 8, 2)]
    for i, (cx, cy, r) in enumerate(caps):
        r = r + (1 if frame == 1 and i % 2 == 0 else 0)
        rr = r + 0.45
        for x, y in Pix.ellipse_pts(cx, cy, rr + 1, rr + 1):
            p.px(x, y, C["ink"])                          # rim / contact shadow
        for x, y in Pix.ellipse_pts(cx, cy, rr, rr):
            p.px(x, y, CAP[1])
        # shaded lower-right crescent, lit upper-left
        for x, y in Pix.ellipse_pts(cx, cy, rr, rr):
            if (x - cx) + (y - cy) > r * 0.9:
                p.px(x, y, CAP[0])
        for x, y in Pix.ellipse_pts(cx - r * 0.35, cy - r * 0.35, max(0.6, r * 0.5), max(0.6, r * 0.5)):
            p.px(x, y, CAP[2])
        p.px(cx - r * 0.5, cy - r * 0.6, CAP[3])
        p.px(cx, cy, C["ink"] if r >= 3 else CAP[1])     # spore vent
    # drifting spores
    motes = [(6, 8), (26, 6), (27, 25), (5, 26), (11, 4), (29, 16), (3, 14), (22, 29)]
    for i, (x, y) in enumerate(motes):
        if (i + frame) % 2 == 0:
            p.px(x, y, C["pink"])
        else:
            p.px(x + 1, y - 1, C["yellow"] if i % 3 == 0 else C["pink"])
    return p


def alarm(frame):
    p = Pix(32, 8, seed=902)
    # beam (between the emitters)
    outer = C["red"] if frame == 0 else C["hot"]
    core = C["hot"] if frame == 0 else C["pink"]
    p.hline(4, 27, 3, outer)
    p.hline(4, 27, 4, core)
    for x in range(5, 27):
        if (x + frame * 3) % 7 == 0:
            p.px(x, 4, C["pink"] if frame == 0 else C["white"])
    # emitters: small rusty boxes with lenses facing each other
    for x0, lens_x in ((0, 3), (28, 28)):
        p.rect(x0 + 1, 1, x0 + 3 if x0 == 0 else x0 + 2, 6, C["sl1"])
        p.hline(x0 + 1, x0 + 2, 1, C["sl2"])
        p.vline(x0 + 1, 1, 6, C["sl2"])
        p.px(x0 + 2, 6, C["sl0"])
        p.px(lens_x, 3, C["hot"])
        p.px(lens_x, 4, C["red"] if frame == 0 else C["hot"])
        p.px(x0 + 2, 2, C["red0"] if frame == 0 else C["red"])  # status LED
    p.rect(29, 1, 30, 6, C["sl1"], only="opaque")
    p.outline(C["ink"])
    return p


def main():
    prev = HERE / "preview"
    deliver("spores", [spores(0), spores(1)], prev, scale=8)
    deliver("alarm", [alarm(0), alarm(1)], prev, scale=8)
    print("decals done")


if __name__ == "__main__":
    main()
