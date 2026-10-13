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
THORN = [C["red0"], C["red"], C["hot"]]   # base, shaft, tip - bright tips survive the night tint


def bez(p0, p1, p2, n=40):
    out = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        out.append((x, y))
    return out


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
            p.px(x, y - 1, CANE[3] if (x + y) % 3 == 0 else CANE[2])
    step = 7 if back else 5
    for i in range(3, len(seen) - 1, step):
        x, y = seen[i]
        up = (i // step) % 2 == 0
        dx = 1 if (seen[i + 1][0] - seen[i - 1][0]) >= 0 else -1
        if back:
            p.px(x, y - 1, THORN[1] if (i // step) % 2 else THORN[0])
            continue
        if up:
            p.px(x, y - 2, THORN[0])
            p.px(x + dx, y - 3, THORN[1])
            p.px(x + dx, y - 4, THORN[2])
        else:
            p.px(x, y + 2, THORN[1])
            p.px(x - dx, y + 3, THORN[2])
    return seen


def bramble():
    p = Pix(32, 32, seed=501)
    # dense dark core of the tangle (canes behind canes)
    mass = Pix.ellipse_pts(16, 26, 11, 4)
    for x, y in mass:
        p.px(x, y, C["ink"] if (x * 3 + y * 5) % 7 < 3 else C["br0"])
    for c in (bez((10, 30), (12, 6), (27, 12)), bez((22, 30), (20, 8), (4, 14)),
              bez((16, 30), (30, 26), (26, 6))):
        cane(p, c, back=True)
    # four front canes: arching whips with clear gaps between them, hooked at the ends
    for c in (bez((5, 30), (4, 2), (24, 9)), bez((27, 30), (29, 4), (9, 14)),
              bez((13, 30), (16, 12), (29, 18)), bez((19, 30), (14, 14), (2, 20))):
        cane(p, c)
    # a few dark, ragged leaves
    for x, y in ((7, 18), (22, 11), (14, 15), (26, 23)):
        p.px(x, y, C["g1"])
        p.px(x + 1, y, C["g0"])
        p.px(x, y + 1, C["g0"])
    # blood-red berries
    for x, y in ((11, 22), (21, 21)):
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
