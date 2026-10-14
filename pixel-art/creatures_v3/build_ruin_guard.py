"""Ruin Guard (night elite) - 48x56 x8: idle 0-1, walk 2-5, attack 6-7 (shield bash). Facing right, feet on row 55.

An overgrown stone-and-iron sentinel: a hulking block torso of cracked masonry bound in rusted iron bands, moss and
a sprouting fern on its head and shoulders, one cyan visor slit. It carries a big hexagonal energy shield on its
near arm (cyan, emissive): the shield is why kinetic towers do half damage.
V2 look: 6-tone hue-shifted ramps, block texture, selective outline.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from crlib import *  # noqa: F401,F403

W, H = 48, 56
SHIELD = ["#06182a", "#0a3050", "#0c5a86", "#1690c0", "#4cd0f0", "#c8f8ff"]


def blocks(x, y, dx, dy):
    """Masonry: staggered courses of blocks with dark mortar lines."""
    row = y // 5
    off = 3 if row % 2 else 0
    t = 0.0
    if y % 5 == 0:
        t -= 1.4
    elif (x + off) % 7 == 0:
        t -= 1.2
    elif y % 5 == 1:
        t += 0.5
    return t + (h2(row, (x + off) // 7, 9) - 0.5) * 0.8


def draw(frame):
    walk = 2 <= frame <= 5
    atk = frame >= 6
    ph = (frame - 2) / 4.0 if walk else 0.0
    bob = (1 if frame in (3, 5) else 0) if walk else (1 if frame == 1 else 0)
    oy = bob
    push = (-2 if frame == 6 else 2) if atk else 0
    r = Rig(W, H)

    def stride(far):
        if not walk:
            return 0.0, 0.0
        a = 2 * math.pi * (ph + (0.5 if far else 0.0))
        return 3.0 * math.cos(a), max(0.0, 2.0 * math.sin(a))

    # far leg + far arm (behind the body)
    dx, lift = stride(True)
    r.limb([(17.0, 38.0 + oy), (15.0 + dx * 0.5, 46.0 + oy - lift * 0.5)], 7.0, 6.0, STONE, base=1.3, gain=1.6, grime=0.3, seed=1)
    r.plate([(10 + dx, 49 - lift), (19 + dx, 49 - lift), (20 + dx, 55 - lift), (9 + dx, 55 - lift)], STONE, base=1.4, gain=1.2, seed=2)
    r.limb([(12.0, 22.0 + oy), (9.0, 31.0 + oy), (10.0 + push * 0.2, 39.0 + oy)], 6.0, 5.0, STONE, base=1.3, gain=1.6, grime=0.3, seed=3)
    r.ell(10.0 + push * 0.2, 40.0 + oy, 3.6, 3.2, STONE, base=1.4, gain=1.8, grime=0.3, seed=4)
    # torso: a hulking block, broader at the shoulders
    torso = [(9.0, 17.0 + oy), (31.0, 15.0 + oy), (34.0, 22.0 + oy), (31.0, 41.0 + oy), (13.0, 42.0 + oy), (8.0, 28.0 + oy)]
    r.plate(torso, STONE, base=2.6, gain=1.4, grime=0.35, seed=5, bevel=2)
    # re-shade the torso with masonry courses + a rounded volume
    px, ramp, fl = r.parts[-1]
    for (x, y) in list(px):
        s = (x - 20.5) / 13.0
        px[(x, y)] = px[(x, y)] + blocks(x, y - oy, 0, 0) - 0.9 * s - 0.04 * (y - 15 - oy)
    # rusted iron bands across the torso
    for by in (24, 34):
        r.plate([(9.0, by - 1.0 + oy), (33.0, by - 2.0 + oy), (33.0, by + 1.0 + oy), (9.0, by + 2.0 + oy)], RUSTR, base=2.4, gain=1.2,
                grime=0.4, seed=6 + by, bevel=1)
        r.pixels([(12, by + oy), (20, by + oy), (28, by - 1 + oy)], RUSTR, 4.6, glow=False)
    # a glowing core crack in the chest (cyan, faint)
    r.pixels([(21, 29 + oy, 2.6), (22, 30 + oy, 3.4), (22, 31 + oy, 2.6), (23, 28 + oy, 2.2)], CYANG, 3.0)
    # head: a squat stone block with a cyan visor slit, sunk between the shoulders
    head = [(16.0, 7.0 + oy), (27.0, 6.0 + oy), (29.0, 9.0 + oy), (28.0, 17.0 + oy), (17.0, 18.0 + oy), (15.0, 10.0 + oy)]
    r.plate(head, STONE, base=2.9, gain=1.4, grime=0.3, seed=8, bevel=2)
    r.pixels([(x, 12 + oy, 4.0 if x < 28 else 5.0) for x in range(21, 29)] + [(x, 13 + oy, 2.6) for x in range(22, 28)], CYANG, 4.0)
    # moss + a fern sprouting from the head and shoulders
    r.pixels([(x, 6 + oy - (1 if x in (19, 20) else 0), 3.4 + (0.8 if x % 3 == 0 else 0)) for x in range(16, 26)] +
             [(x, 16 + oy - (x % 2), 3.2) for x in range(9, 15)] + [(x, 15 + oy, 3.0) for x in range(27, 31)], MOSSY, 3.0, glow=False)
    sway = 0.6 if frame % 2 else 0.0
    r.limb([(20.0, 6.0 + oy), (18.0 - sway, 2.0 + oy), (15.0 - sway, 1.0 + oy)], 1.6, 1.0, LEAF, base=3.4, gain=1.2, grime=0.0)
    r.limb([(21.0, 6.0 + oy), (23.0 + sway, 2.5 + oy), (26.0 + sway, 2.0 + oy)], 1.6, 1.0, LEAF, base=3.0, gain=1.2, grime=0.0)
    # near leg
    dx, lift = stride(False)
    r.limb([(24.0, 39.0 + oy), (25.0 + dx * 0.5, 47.0 + oy - lift * 0.5)], 7.5, 6.5, STONE, base=2.4, gain=1.8, grime=0.3, seed=11)
    r.plate([(19 + dx, 48 - lift), (30 + dx, 48 - lift), (31 + dx, 55 - lift), (18 + dx, 55 - lift)], STONE, base=2.6, gain=1.3, seed=12)
    r.plate([(19 + dx, 47 - lift), (30 + dx, 47 - lift), (30 + dx, 49 - lift), (19 + dx, 49 - lift)], RUSTR, base=2.4, gain=1.0, seed=13, bevel=1)
    # near arm (upper arm + forearm) reaching to the shield's grip
    r.ell(30.0, 20.0 + oy, 5.2, 4.6, STONE, base=2.8, gain=2.0, grime=0.3, seed=14, tex=lambda x, y, a, b: cells(x, y, 3.0, 2, 0.6, 0.3))
    r.limb([(31.0, 22.0 + oy), (33.0 + push * 0.5, 29.0 + oy)], 5.5, 5.0, STONE, base=2.6, gain=1.8, grime=0.3, seed=15)
    # the shield: an iron emitter rim round a glowing hex panel
    sx, sy = 37.5 + push, 29.0 + oy
    def kite(k):
        return [(sx - 6.0 * k, sy - 14.0 * k), (sx + 6.0 * k, sy - 14.0 * k), (sx + 8.0 * k, sy - 4.0 * k), (sx + 6.0 * k, sy + 9.0 * k),
                (sx, sy + 16.0 * k), (sx - 6.0 * k, sy + 9.0 * k), (sx - 8.0 * k, sy - 4.0 * k)]
    rim = Shape(W, H).add(kite(1.0)).mask()
    inner = Shape(W, H).add(kite(0.8)).mask()
    r.pixels([(x, y, 2.4 + (1.2 if (x < sx and y < sy) else -0.5) + (1.0 if h2(x, y, 4) < 0.12 else 0)) for (x, y) in rim - inner],
             STEELR, 2.4, glow=False)
    r.pixels([(x, y, 3.0) for (x, y) in rim - inner if h2(x, y, 6) < 0.2], RUSTR, 3.0, glow=False)
    flash = 1.0 if frame == 7 else (0.4 if frame == 6 else 0.0)
    # energy panel: bright toward its rim, deep in the middle, an inset ring, a few hex cells, a diagonal glare
    hexpx = []
    for (x, y) in inner:
        u, v = (x + 0.5 - sx) / 6.8, (y + 0.5 - sy) / 13.0
        d = max(abs(v), abs(u) * 0.9 + abs(v) * 0.35)
        t = 1.8 + 2.0 * d ** 2 + flash
        ring_ = (x - 1, y) not in inner or (x + 1, y) not in inner or (x, y - 1) not in inner or (x, y + 1) not in inner
        if ring_:
            t = 4.2 + flash
        # hex cell edges (pointy-top hexes ~5 px wide)
        q = (x + 0.5 - sx) / 2.6
        rr = (y + 0.5 - sy) / 3.0
        hx_ = abs((q + (0.5 if int(math.floor(rr)) % 2 else 0.0)) % 2.0 - 1.0)
        hy_ = (rr % 1.0)
        if (hy_ < 0.22 and hx_ > 0.25) or (hx_ > 0.88):
            t += 0.9
        if -0.9 < (u + v * 0.5) < -0.55 and v < 0.2:
            t += 1.2                                   # glare streak
        hexpx.append((x, y, t))
    r.pixels(hexpx, SHIELD, 3.0)
    # the fist on the grip (in front of the shield's left edge)
    r.ell(33.5 + push * 0.6, 31.0 + oy, 3.4, 3.2, STONE, base=2.8, gain=2.0, grime=0.2, seed=16)
    if frame == 7:
        # bash: a bright shock on the shield's leading edge
        r.pixels([(int(sx + 9), int(sy + k), 5.0 if abs(k) < 5 else 4.0) for k in range(-9, 10, 2)] +
                 [(int(sx + 10), int(sy + k), 4.0) for k in (-6, -2, 2, 6)], SHIELD, 4.0)
    return r.render()


if __name__ == "__main__":
    fr = [draw(f) for f in range(8)]
    im = strip(fr)
    save_sprite("ruin_guard", im)
    print("ruin_guard", im.size, len(set(c for f in fr for c in f.colors())), "colours")
    sheet([("ruin_guard", im, W)], SCRATCH / "cr_ruin_guard.png", scale=3)
