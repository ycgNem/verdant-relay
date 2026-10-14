"""Mortar Pod (green pod) - 48x64 x4 (idle 0-1, attack 2-3 fire + recoil), anchor [24, 58].

A bio-mortar: a swollen, ribbed seed pod bound in iron bands, tilted up-right in an iron cradle on a turntable.
Its mouth glows with the next seed shell.
L1  one pod barrel, two bands, a glowing seed in the mouth
L2  + more bands, a reinforced breech, a net of spare seed sacks hung on the cradle
L3  + armour straps, a muzzle brake ring, glowing green core vents along the pod, braced cradle
3a  Napalm: the pod is charred and cracked with burning orange veins; fire drips from a glowing mouth
3b  Cluster: three short pods bundled in a rack, each with its own seed (scatters bomblets)
attack: frame 2 recoil (pod slides back down its axis), a seed shell leaving and a muzzle puff; frame 3 the
smoke rises as the pod returns.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tlib import *  # noqa: F401,F403

PODB = ["#0f1a10", "#1a2b19", "#283f24", "#37552f", "#4b6c3a", "#68874c"]
CHAR = ["#140c08", "#24160e", "#382418", "#4e3622", "#6a4c30", "#8a6a44"]
SMOKE = ["#3a3c38", "#55574f", "#73746a", "#929284", "#b2b0a0", "#d0cebc"]


def pod(g, A, B, wfun, ramp, seed, bands=(), ribs=(-0.45, 0.2), grime=0.3, mask=None, band_ramp=IRON):
    """A tapered barrel/pod along A->B (screen), width profile wfun(t); rounded breech at A; shaded as a
    cylinder across its width with ribs along it and iron bands around it at the given t values."""
    ax, ay = A
    L = math.dist(A, B)
    ux, uy = (B[0] - ax) / L, (B[1] - ay) / L
    nx, ny = -uy, ux
    out = set()
    wmax = max(wfun(i / 20) for i in range(21))
    x0, x1 = int(min(ax, B[0]) - wmax), int(max(ax, B[0]) + wmax) + 1
    y0, y1 = int(min(ay, B[1]) - wmax), int(max(ay, B[1]) + wmax) + 1
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px_, py_ = x + 0.5 - ax, y + 0.5 - ay
            along = px_ * ux + py_ * uy
            off = px_ * nx + py_ * ny
            t = along / L
            if t > 1:
                continue
            if t < 0:
                hw = wfun(0) / 2
                if along * along + off * off > hw * hw:
                    continue
                s = off / hw
                tt = 0.0
            else:
                hw = wfun(t) / 2
                if abs(off) > hw:
                    continue
                s = off / hw
                tt = t
            nz = math.sqrt(max(0.0, 1 - s * s))
            d = L3[0] * nx * s + L3[1] * ny * s + L3[2] * nz
            if t < 0:
                d += 0.15 * (along / max(1, hw)) * 0     # breech dome: same shading
            band = any(abs(tt - tb) * L < 1.05 for tb in bands)
            if band:
                edge = any(-1.05 < (tt - tb) * L < -0.1 for tb in bands)
                put(g, x, y, band_ramp, 2.6 + d * 2.2 + (0.9 if edge else -0.3), 0.15, seed + 9, out)
                continue
            ti = 2.3 + d * 2.6
            if any(abs(s - k) < 0.14 for k in ribs):
                ti -= 1.1
            elif any(abs(s - k - 0.18) < 0.1 for k in ribs):
                ti += 0.5
            put(g, x, y, ramp, ti, grime, seed, out)
    if mask is not None:
        mask |= out
    return out, (ux, uy), (nx, ny)


def mouth(g, B, u, n, w, frame, atk, glow=POD, lip=IRON, brake=False, seed=0):
    """The open muzzle seen from above: an iron lip ellipse around a dark bore with the glowing seed in it."""
    bx, by = B
    a, b = w / 2 + 0.3, max(1.8, w * 0.3)
    if brake:
        a += 1.2
        b += 0.5
    for y in range(int(by - a) - 2, int(by + a) + 3):
        for x in range(int(bx - a) - 2, int(bx + a) + 3):
            px_, py_ = x + 0.5 - bx, y + 0.5 - by
            pn, pu = px_ * n[0] + py_ * n[1], px_ * u[0] + py_ * u[1]
            d2 = (pn / a) ** 2 + (pu / b) ** 2
            if d2 > 1:
                continue
            inner = (pn / (a - 1.2)) ** 2 + (pu / max(0.7, b - 1.0)) ** 2 if a > 1.6 else 2
            if inner <= 1:
                # bore: dark, the next seed glowing low in it; a flash fills it when firing
                core = (pn / max(0.8, (a - 1.2) * 0.62)) ** 2 + ((pu + 0.4) / max(0.6, (b - 1.0) * 0.75)) ** 2
                if atk and frame == 2:
                    c = glow[5] if inner < 0.45 else glow[4]
                elif core <= 1 and frame != 3:
                    c = glow[5] if (core < 0.3 and frame == 0) else glow[4] if core < 0.6 else glow[3]
                else:
                    c = "#0a120a" if pu > -0.2 else PODB[0]
                g.px(x, y, c)
            else:
                lit = (n[0] * L3[0] + n[1] * L3[1]) * (pn / a) + (u[0] * L3[0] + u[1] * L3[1]) * (pu / b)
                put(g, x, y, lip, 3.0 + lit * 1.8 + (0.6 if pu > 0 else 0), 0.1, seed)


def puff(g, cx, cy, r, seed, light=True):
    """Ragged smoke puff (opaque, stepped)."""
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            dx, dy = (x + 0.5 - cx) / r, (y + 0.5 - cy) / r
            d2 = dx * dx + dy * dy + (h2(x, y, seed) - 0.5) * 0.5
            if d2 <= 1:
                ti = 3.4 - 1.6 * (dx + dy) * 0.5 - (0.8 if d2 > 0.6 else 0)
                g.px(x, y, tone(SMOKE, ti + (0.6 if light else -0.6)))


def seed_shell(g, x, y, glow=POD):
    for (dx, dy, c) in ((0, 0, glow[4]), (1, 0, glow[3]), (0, 1, glow[3]), (1, 1, glow[2]), (0, -1, glow[5]), (-1, 0, glow[4])):
        g.px(x + dx, y + dy, c)


def draw(level, branch, frame):
    g = Grid(FW, FH)
    atk = frame >= 2
    rec = 2 if frame == 2 else (1 if frame == 3 else 0)
    seed = 71 + level * 11 + (0 if branch is None else ord(branch))
    big = level >= 3
    napalm, cluster = branch == "a", branch == "b"
    base_mount(g, seed, rx=12.5)
    # braced cradle legs (L3)
    if big:
        tube(g, [(13, 58), (18, 47)], 2.2, 1.8, IRON, grime=0.3, seed=seed)
        tube(g, [(35, 58), (30, 47)], 2.2, 1.8, IRON, grime=0.3, seed=seed + 1)
    # turntable
    cyl(g, CX, 50, 56, 7.5, IRON, grime=0.3, seed=seed, base_tone=2.0, ry=2.8)
    # cradle: a heavy iron saddle under the breech, rising to a trunnion
    box(g, CX - 7, CX + 6, 43, 50, 2, IRON, grime=0.35, seed=seed + 2)
    bolts(g, [(CX - 5, 46), (CX + 4, 46)])
    ramp = CHAR if napalm else PODB
    if cluster:
        # three short pods in a rack: back pair first, then the front one
        specs = [((CX - 6, 44), (CX - 3, 27), 0), ((CX + 5, 44), (CX + 9, 28), 1), ((CX - 1, 49), (CX + 2, 33), 2)]
        for (A, B, i) in specs:
            ux, uy = (B[0] - A[0]), (B[1] - A[1])
            l = math.hypot(ux, uy)
            off = rec * (1 if i == (frame % 3) else 0.5)
            A2 = (A[0] - ux / l * off, A[1] - uy / l * off)
            B2 = (B[0] - ux / l * off, B[1] - uy / l * off)
            wfc = lambda t: 6.5 + 3.5 * math.exp(-((t - 0.35) / 0.32) ** 2) + max(0.0, t - 0.86) * 14
            body, u, n = pod(g, A2, B2, wfc, ramp, seed + i, bands=(0.7, 0.92), grime=0.18, ribs=(-0.45, 0.35))
            mouth(g, B2, u, n, wfc(1.0), frame, atk, seed=seed)
        # rack strap across the bundle
        tube(g, [(CX - 10, 43), (CX + 1, 46), (CX + 12, 42)], 2.4, 2.4, IRON, grime=0.2, seed=seed + 5)
        bolts(g, [(CX + 1, 45), (CX - 8, 43), (CX + 9, 42)])
        A, B, u = (CX - 1, 49), (CX + 2, 33), None
        mx, my = CX + 5, 24
    else:
        A = (CX - 3, 48)
        B = (CX + 6, 29) if level == 1 else ((CX + 6, 27) if level == 2 else (CX + 7, 25))
        ux, uy = (B[0] - A[0]), (B[1] - A[1])
        l = math.hypot(ux, uy)
        A = (A[0] - ux / l * rec, A[1] - uy / l * rec)
        B = (B[0] - ux / l * rec, B[1] - uy / l * rec)
        wmax = 14.0 if level == 1 else (15.0 if level == 2 else 16.0)
        neck = 10.0 if level == 1 else (10.5 if level == 2 else 11.0)
        bands = (0.62, 0.9) if level == 1 else ((0.14, 0.62, 0.9) if level == 2 else (0.14, 0.62, 0.92))

        def wf(t, wmax=wmax, neck=neck):
            belly = (wmax - neck) * math.exp(-((t - 0.16) / 0.3) ** 2)
            flare = max(0.0, t - 0.88) * 16
            return neck + belly + flare
        # seed sacks hung on the cradle (L2+), behind the pod on the left
        if level >= 2:
            for (sx, sy, r) in ((CX - 11, 44, 3.6), (CX - 14, 49, 3.2), (CX - 8, 50, 3.0)):
                sphere(g, sx, sy, r, POD if not napalm else FIRE, base=1.6, seed=seed)
            for y in range(41, 53, 2):
                for x in range(CX - 18, CX - 4):
                    if g.get(x, y) in (POD + FIRE) and (x + y) % 3 == 0:
                        g.px(x, y, WOOD[1])
        body, u, n = pod(g, A, B, wf, ramp, seed, bands=bands, grime=0.18, ribs=(-0.5, 0.3))
        if not napalm:
            rust_patches(g, body, IRON, seed, amount=0.3)
        # armour straps (L3): two riveted iron straps along the pod's sides
        if big:
            for side in (-1, 1):
                pts = []
                for k in range(9):
                    t = 0.12 + 0.68 * k / 8
                    hw = wf(t) / 2 - 1.0
                    pts.append((A[0] + u[0] * l * t + n[0] * hw * side * 0.9, A[1] + u[1] * l * t + n[1] * hw * side * 0.9))
                tube(g, pts, 1.6, 1.6, IRON, grime=0.15, seed=seed + 3)
                bolts(g, [(int(pts[2][0]), int(pts[2][1])), (int(pts[6][0]), int(pts[6][1]))])
            # glowing core vents in the pod's lit flank
            for k, t in enumerate((0.3, 0.42, 0.62)):
                cxv = A[0] + u[0] * l * t - n[0] * 1.5
                cyv = A[1] + u[1] * l * t - n[1] * 1.5
                on = (k + frame) % 2 == 0 or atk
                gr = FIRE if napalm else POD
                g.px(int(cxv), int(cyv), gr[4] if on else gr[3])
                g.px(int(cxv + n[0] * 1.5), int(cyv + n[1] * 1.5), gr[3] if on else gr[2])
                g.px(int(cxv - n[0] * 1.5), int(cyv - n[1] * 1.5), gr[3])
        if napalm:
            # burning veins cracking across the charred pod
            for k in range(3):
                t0 = 0.18 + k * 0.17
                hw = wf(t0) / 2
                pts = []
                for j in range(5):
                    s = -0.75 + j * 0.3 + 0.15 * k
                    t = t0 + 0.05 * math.sin(j * 1.7 + k)
                    pts.append((A[0] + u[0] * l * t + n[0] * hw * s, A[1] + u[1] * l * t + n[1] * hw * s))
                for (p, q) in zip(pts, pts[1:]):
                    if all(g.get(int(z[0]), int(z[1])) is not None for z in (p, q)):
                        g.line(p[0], p[1], q[0], q[1], (FIRE[4] if atk else FIRE[3]) if (k + frame) % 2 else (FIRE[3] if atk else FIRE[2]))
        mouth(g, B, u, n, wf(1.0), frame, atk, glow=FIRE if napalm else POD, brake=big, seed=seed)
        mx, my = B[0] + 5, B[1] - 4
        # trunnion disc on the pod's near flank
        tx_, ty_ = A[0] + u[0] * l * 0.36 - n[0] * 0, A[1] + u[1] * l * 0.36
        sphere(g, tx_ - 5.5, ty_ + 2.5, 2.4, IRON, seed=seed, base=2.4)
        if napalm:
            # fire dripping from the mouth's lip
            for k, (dx, L) in enumerate(((-2, 3), (1, 4), (3, 2))):
                L = L + ((frame + k) % 2)
                for j in range(L):
                    x, y = int(B[0] + dx), int(B[1] + 3 + j)
                    if g.get(x, y) is None or j > 0:
                        g.px(x, y, FIRE[4] if j < L - 1 else FIRE[2])
    # the shot: shell leaving and a muzzle puff
    if frame == 2:
        puff(g, mx, my, 2.6, seed)
        seed_shell(g, int(mx + 1), int(my - 8), FIRE if napalm else POD)
        if cluster:
            seed_shell(g, int(mx + 1), int(my - 9), POD)
            seed_shell(g, int(mx + 7), int(my - 3), POD)
    elif frame == 3:
        puff(g, mx + 1, my - 4, 3.2, seed + 1, light=False)
        puff(g, mx + 3, my - 8, 2.2, seed + 2)
    elif napalm:
        # heat shimmer: a couple of embers rising
        g.px(int(B[0] + (frame * 2) - 1), int(B[1] - 6 - frame), FIRE[3])
    return finish(g)


VARIANTS = [("mortar_pod", 1, None), ("mortar_pod_2", 2, None), ("mortar_pod_3", 3, None),
            ("mortar_pod_3a", 3, "a"), ("mortar_pod_3b", 3, "b")]

if __name__ == "__main__":
    rows = []
    for key, lv, br in VARIANTS:
        fr = [draw(lv, br, f) for f in range(4)]
        rows.append((key, save_tower(key, fr)))
        print(key, len(set(c for f in fr for c in f.colors())), "colours")
    from preview import sheet
    sheet(rows, SCRATCH / "tw_mortar_pod.png")
