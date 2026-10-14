"""Scrap Turret (amber) - 48x64 x4 (idle 0-1, attack 2-3), faces right, anchor [24, 58].

The salvaged gun: a faded-ochre oil drum lying on its side as the body, on a yoke and hydraulic post, bolted to
an iron mount plate. The barrel comes out of the drum's end cap; an amber-lensed sensor box rides on top.
L1  one barrel, an ammo box behind
L2  + a second barrel, a teal armour plate over the drum's front, a brass ammo belt
L3  + a bigger plated drum, an amber-glowing vent grille, an antenna, stabiliser struts
3a  Piercer: one long heavy rail barrel with a muzzle brake and a scope (the sniper)
3b  Repeater: a rotary cluster of barrels through a shroud, a round brass ammo drum (the minigun)
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tlib import *  # noqa: F401,F403

OCHRE = ["#1f1609", "#3a2a12", "#5a431c", "#7a5c28", "#9c7a3a", "#bfa05a"]


def muzzle(g, x, y, big=False, small=False):
    """Amber muzzle flash with a white-hot core."""
    if small:
        g.px(x + 1, y, AMBER[4])
        g.px(x + 2, y, AMBER[3])
        g.px(x + 1, y - 1, AMBER[2])
        return
    r = 4 if big else 3
    for k in range(1, r + 1):
        g.px(x + k, y, AMBER[5] if k == 1 else AMBER[4] if k < r else AMBER[3])
        if k < r:
            g.px(x + k - 1 + (1 if k > 1 else 0), y - k, AMBER[4] if k == 1 else AMBER[3])
            g.px(x + k - 1 + (1 if k > 1 else 0), y + k, AMBER[4] if k == 1 else AMBER[3])
    g.px(x, y, AMBER[5])


def hazard(g, x0, x1, y0, y1, only):
    """Faded hazard stripes painted on the drum (diagonal, 2 px)."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if g.get(x, y) in only and ((x + y) // 2) % 2 == 0:
                g.px(x, y, "#2a1f10")


def draw(level, branch, frame):
    g = Grid(FW, FH)
    atk = frame >= 2
    rec = 1 if frame == 2 else 0
    seed = 11 + level * 3 + (0 if branch is None else ord(branch))
    big = level >= 3
    base_mount(g, seed, rx=12.5)
    # stabiliser struts (L3)
    if big:
        tube(g, [(14, 57), (20, 44)], 2.2, 1.8, IRON, grime=0.3, seed=seed)
        tube(g, [(34, 57), (28, 44)], 2.2, 1.8, IRON, grime=0.3, seed=seed + 1)
    # hydraulic post: dark sleeve below, a lighter piston above, a collar between
    cyl(g, CX, 48, 57, 3.2, IRON, grime=0.25, seed=seed, base_tone=1.6)
    cyl(g, CX, 40, 48, 2.2, CERA, cap=False, grime=0.0, seed=seed, base_tone=2.6)
    cyl(g, CX, 48, 50, 4.0, IRON, grime=0.1, seed=seed + 2, base_tone=2.4)
    # cable from the mount up into the drum
    tube(g, [(32, 58), (35, 52), (33, 44), (30, 40)], 1.6, 1.6, RUST, grime=0.1, seed=seed)
    # yoke
    box(g, 17, 31, 37, 41, 2, IRON, grime=0.3, seed=seed + 3)
    # drum body
    r = 9.5 if big else 8.0
    cy = 28.5 if big else 30.0
    x0, x1 = (8, 34) if big else (10, 32)
    body = hcyl(g, x0, x1, cy, r, OCHRE, grime=0.45, seed=seed + 4, ribs=(x0 + 6, x0 + 16), cap_ramp=IRON)
    hazard(g, x0 + 1, x0 + 4, int(cy - r + 2), int(cy + r - 2), set(OCHRE))
    rust_patches(g, body, OCHRE, seed, amount=0.32)
    # ammo box behind (not on the Repeater, which has its drum)
    if branch != "b":
        box(g, 3, x0 + 1, int(cy) + 1, int(cy) + 9, 2, RUST, grime=0.4, seed=seed + 5)
        g.px(5, int(cy) + 5, OCHRE[4])
        g.px(6, int(cy) + 5, OCHRE[4])
    # armour (L2+): a teal plate over the drum's front half, bolted
    if level >= 2:
        ax0 = x1 - 11
        box(g, ax0, x1 - 2, int(cy - r) + 1, int(cy + r) - 1, 3, TEAL, grime=0.35, seed=seed + 6)
        bolts(g, [(ax0 + 1, int(cy - r) + 5), (x1 - 4, int(cy - r) + 5), (ax0 + 1, int(cy + r) - 3), (x1 - 4, int(cy + r) - 3)], TEAL)
    # vent grille glowing amber on top (L3)
    if big:
        gy = int(cy - r) + 2
        for x in range(x0 + 4, x0 + 12):
            g.px(x, gy, IRON[1])
            g.px(x, gy + 1, AMBER[3] if (x + frame) % 3 else AMBER[4])
            g.px(x, gy + 2, IRON[1])
        for y in range(int(cy - r) - 10, int(cy - r) + 1):
            g.px(x0 + 3, y, IRON[4] if y < int(cy - r) - 2 else IRON[2])
        g.px(x0 + 3, int(cy - r) - 11, AMBER[5] if frame % 2 == 0 else AMBER[2])
        g.px(x0 + 4, int(cy - r) - 4, IRON[2])
    # sensor box riding on top, amber lens facing forward
    sy = int(cy - r) - 4
    box(g, x0 + 11, x0 + 18, sy, sy + 5, 2, IRON, grime=0.2, seed=seed + 7)
    lens = AMBER[5] if frame != 1 else AMBER[3]
    g.px(x0 + 18, sy + 3, lens)
    g.px(x0 + 17, sy + 3, AMBER[3])
    g.px(x0 + 18, sy + 4, AMBER[2])
    # barrels out of the end cap
    bx = x1 - 1 - rec
    by = int(round(cy))
    if branch == "a":
        hcyl(g, bx, 46 - rec, by, 2.4, IRON, grime=0.15, seed=seed, cap_right=False, ribs=(bx + 5, bx + 9))
        box(g, 41 - rec, 45 - rec, by - 4, by + 3, 1, IRON, grime=0.1, seed=seed + 8)
        g.px(43 - rec, by - 1, IRON[0])
        g.px(43 - rec, by + 1, IRON[0])
        # scope on the sensor box
        hcyl(g, x0 + 9, x0 + 21, sy - 3, 1.8, IRON, grime=0.1, seed=seed, cap_ramp=AMBER)
        g.px(x0 + 21, sy - 3, AMBER[5])
        if atk:
            muzzle(g, 46 - rec, by, big=frame == 2, small=frame == 3)
            for x in (bx + 3, bx + 7, bx + 11):     # heat glow along the rail
                g.px(x, by + 1, AMBER[3])
    elif branch == "b":
        spin = frame % 2
        for i, dy in enumerate((-2.2, 0.0, 2.2)):
            hcyl(g, bx, 43 - rec, by + dy, 1.2, IRON if (i + spin) % 2 else RUST, grime=0.1, seed=seed + i,
                 cap_right=False, base_tone=2.8)
        hcyl(g, bx + 1, bx + 4, by, 3.8, IRON, grime=0.15, seed=seed + 9, base_tone=2.4)
        hcyl(g, 39 - rec, 41 - rec, by, 3.2, IRON, grime=0.1, seed=seed + 10, base_tone=2.6)
        sphere(g, 7.0, cy + 4.0, 6.0, BRASS, grime=0.25, seed=seed)
        for k in range(6):
            g.px(11 + k, int(cy) + 1 - (k // 2), BRASS[4] if k % 2 else BRASS[2])
        if atk:
            muzzle(g, 43 - rec, by - 2 if spin else by + 2, big=True)
            g.px(45, by + 4, AMBER[3])
            g.px(44, by - 5, AMBER[2])
    else:
        offs = (-3, 3) if level >= 2 else (0,)
        for dy in offs:
            hcyl(g, bx, 42 - rec, by + dy, 1.8, IRON, grime=0.15, seed=seed, cap_right=False, ribs=(40 - rec,))
            g.px(42 - rec, by + dy, IRON[0])
        if level >= 2:
            for k in range(7):
                g.px(5 + k, int(cy) + 1 - (k // 3), BRASS[4] if k % 2 else BRASS[2])
        if atk:
            for dy in offs:
                muzzle(g, 42 - rec, by + dy, small=frame == 3)
    return finish(g)


VARIANTS = [("scrap_turret", 1, None), ("scrap_turret_2", 2, None), ("scrap_turret_3", 3, None),
            ("scrap_turret_3a", 3, "a"), ("scrap_turret_3b", 3, "b")]

if __name__ == "__main__":
    rows = []
    for key, lv, br in VARIANTS:
        fr = [draw(lv, br, f) for f in range(4)]
        rows.append((key, save_tower(key, fr)))
        print(key, len(set(c for f in fr for c in f.colors())), "colours")
    from preview import sheet
    sheet(rows, SCRATCH / "tw_scrap_turret.png")
