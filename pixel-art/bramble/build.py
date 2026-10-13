"""Verdant Relay - bramble (32x32): a hostile tangle of thorny cane, dark red thorns.
It's an obstacle you cut with the Pulse Cutter, so it must read as 'sharp, don't touch'.
Run: python pixel-art/bramble/build.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "env_lib"))
from envlib import C, Pix, deliver  # noqa: E402

CANE = [C["ink"], C["br0"], C["br1"], C["rust"]]   # shadow, stem, lit stem, glint
THORN = [C["red0"], C["red"]]


def arc(cx, cy, r, a0, a1, squash=0.75, n=40):
    out = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        out.append((cx + math.cos(a) * r, cy + math.sin(a) * r * squash))
    return out


def cane(p, pts, back=False):
    """Cane: lit top px (rust), body (dark red-brown), shadow underneath; hooked thorns."""
    seen = []
    for a, b in zip(pts, pts[1:]):
        for x, y in Pix.line_pts(a[0], a[1], b[0], b[1]):
            if (x, y) not in seen:
                seen.append((x, y))
    S = set(seen)
    for x, y in seen:
        p.px(x, y + 1, CANE[0])
    for x, y in seen:
        p.px(x, y, CANE[1] if back else CANE[2])
        if not back and (x, y - 1) not in S:
            p.px(x, y - 1, CANE[3] if (x + y) % 3 else CANE[2])
    step = 7 if back else 5
    for i in range(3, len(seen) - 1, step):
        x, y = seen[i]
        up = (i // step) % 2 == 0
        dx = 1 if (seen[i + 1][0] - seen[i - 1][0]) >= 0 else -1
        if back:
            p.px(x, y - 1, THORN[0])
            continue
        if up:
            p.px(x, y - 2, THORN[0])
            p.px(x + dx, y - 3, THORN[1])
        else:
            p.px(x, y + 2, THORN[0])
            p.px(x - dx, y + 3, THORN[1])
    return seen


def bramble():
    p = Pix(32, 32, seed=501)
    # dense dark core of the tangle (canes behind canes)
    mass = Pix.ellipse_pts(16, 20, 13, 9)
    for x, y in mass:
        p.px(x, y, C["ink"] if (x * 3 + y * 5) % 7 < 3 else C["br0"])
    for c in (arc(12, 22, 10, 190, 350), arc(21, 23, 9, 200, 345), arc(16, 19, 12, 195, 335),
              arc(16, 27, 12, 200, 340)):
        cane(p, c, back=True)
    for c in (arc(10, 26, 8, 185, 330), arc(22, 26, 8, 210, 355), arc(16, 23, 11, 190, 300),
              arc(19, 21, 9, 235, 350), arc(16, 31, 13, 205, 335)):
        cane(p, c)
    # big hooked thorns standing out of the silhouette (the 'don't touch' read)
    import math as _m
    for i in range(14):
        a = _m.radians(180 + i * (180 / 13) + p.rng.uniform(-5, 5))
        x = 16 + _m.cos(a) * 13.5
        y = 20 + _m.sin(a) * 9.5
        ox, oy = _m.cos(a), _m.sin(a)
        p.px(x, y, THORN[0])
        p.px(x + ox, y + oy, THORN[0])
        p.px(x + ox * 2 + (1 if ox > 0 else -1) * 0.6, y + oy * 2, THORN[1])
    for x, y in ((3, 24), (2, 27), (29, 24), (30, 27)):
        p.px(x, y, THORN[0])
        p.px(x + (-1 if x < 16 else 1), y - 1, THORN[1])
    # a few dark, ragged leaves
    for x, y in ((7, 16), (23, 14), (13, 12), (26, 21)):
        p.px(x, y, C["g1"])
        p.px(x + 1, y, C["g0"])
        p.px(x, y + 1, C["g0"])
    # blood-red berries
    for x, y in ((11, 15), (21, 18)):
        p.px(x, y, C["hot"])
        p.px(x + 1, y, C["red0"])
    p.hline(5, 27, 30, CANE[0])
    p.hline(7, 25, 31, CANE[0])
    p.despeckle_alpha()
    p.outline(C["ink"])
    return p


def main():
    deliver("bramble", [bramble()], HERE / "preview", scale=8)
    print("bramble done")


if __name__ == "__main__":
    main()
