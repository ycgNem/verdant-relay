"""Night Protocol + spore FX as pixel art (critic H2 #8 / #12): hard alpha, ordered dither, no smooth-alpha fills.

  fx_vine_snare   24x24 x3, upright, anchor [12, 22]: roots burst out of a cracked ring under a rooted enemy
                  (0 burst, 1 grab - tendrils up and hooking in, 2 hold - coiled tight; loop 1-2 or hold 2).
                  Drawn a hair in front of the enemy so the coils wrap its feet.
  fx_flare_pool   192x192 x3, flat ground decal (radius 3 tiles at ppu 32): a stepped light pool - three hard bands
                  of Bayer-dithered amber light (dense core, sparser rings) and a dashed rim; frames flicker the band
                  edges and shift the dither phase.
  fx_flare_ember  12x18 x3, upright, anchor [6, 17]: the flare canister burning on the ground, sparks and smoke.
  fx_spore_ring   128x128 x2, flat ground decal (the spore cloud's radius 1.9 tiles ~ 61 px): the burst as a ring of
                  spore puffs blowing outward, the inside a sparse speckle (replaces the lime disc).

Run: python pixel-art/fx_v4/build.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "creatures_v3"))
from crlib import Rig, Grid, MOSSY, DIRT, AMBERG, h2, strip, save_sprite, SCRATCH  # noqa: E402
from PIL import Image  # noqa: E402

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
THORN = ["#3a3226", "#6a5e4a", "#a89a7c", "#d8ccae", "#efe6cc", "#fff8e8"]
VINEG = ["#0c1a0e", "#183218", "#264c22", "#3a6a2c", "#558c3a", "#7cae4e"]


# ------------------------------------------------------------------ vine snare
def curl_path(bx, by, side, ht, hook, n=9):
    """A root rising from (bx, by), leaning out then hooking back over the middle; `hook` 0..1 how far it curls."""
    pts = []
    a = -math.pi / 2 + side * 0.25
    x, y = bx, by
    step = ht / n
    for i in range(n + 1):
        pts.append((x, y))
        f = i / n
        a += -side * hook * (0.05 + 0.5 * f * f)
        x += math.cos(a) * step
        y += math.sin(a) * step
    return pts


def vine_snare(frame):
    W = H = 24
    r = Rig(W, H)
    gy = 20.5
    ring = [(x, y) for y in range(H) for x in range(W) if 0.55 < ((x + 0.5 - 12) / 10.0) ** 2 + ((y + 0.5 - gy) / 3.4) ** 2 <= 1.0]
    r.pixels([(x, y, 0.6 + (0.8 if h2(x, y, 3) < 0.3 else 0)) for (x, y) in ring if y + 0.5 < gy], DIRT, 1.0, glow=False, ao=False)
    #           base x off, base y off, side, height per frame, hook per frame
    roots = [(-8.0, -1.0, -1, (5, 14, 12), (0.1, 0.9, 1.5)),
             (-3.5, -2.6, -1, (6, 18, 15), (0.0, 0.6, 1.2)),
             (3.5, -2.6, 1, (5, 17, 14), (0.0, 0.7, 1.3)),
             (8.5, -1.0, 1, (4, 13, 11), (0.1, 1.0, 1.6)),
             (-5.5, 2.0, -1, (3, 8, 9), (0.0, 1.2, 2.0)),
             (6.0, 2.2, 1, (3, 7, 9), (0.0, 1.2, 2.0))]
    for i, (ox, oy, side, hts, hooks) in enumerate(roots):
        bx, by = 12 + ox, gy + oy
        ht, hook = hts[frame], hooks[frame]
        pts = curl_path(bx, by, side, ht, hook)
        front = oy > 0
        r.limb(pts, 2.4 if not front else 2.6, 1.0, VINEG, base=2.2 + (0.6 if front else 0), gain=1.6, grime=0.05, seed=i)
        if frame:
            for k in (3, 6):                                      # small barbs on the outer side
                px_, py_ = pts[k]
                r.pixels([(int(px_ + side * 1.5), int(py_), 2.4)], THORN, 2.4, glow=False, ao=False)
    r.pixels([(x, y, 1.6 + (1.2 if (x, y - 1) not in ring else 0)) for (x, y) in ring if y + 0.5 >= gy], DIRT, 2.0, glow=False, ao=False)
    if frame == 0:
        r.pixels([(3, 13, 3.0), (4, 12, 2.0), (19, 11, 3.0), (20, 12, 2.0), (12, 9, 3.4), (8, 15, 2.6), (16, 14, 2.6)], DIRT, 3.0, glow=False)
    return r.render()


# ------------------------------------------------------------------ flare pool
def flare_pool(frame):
    S = 192
    g = Grid(S, S)
    c = S / 2 - 0.5
    jit = (frame - 1) * 2.5
    bands = [(38 + jit, 9, "#fff2c0", "#ffd070"), (64 + jit * 0.6, 5, "#ffd070", "#feae34"), (88, 2, "#feae34", "#f77622")]
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - c, y - c)
            if d > 92:
                continue
            th = BAYER[(y + frame) % 4][(x + frame * 2) % 4]
            for (rr, density, c1, c2) in bands:
                if d <= rr:
                    if th < density:
                        g.px(x, y, c1 if th < density // 3 else c2)
                    break
            else:
                pass
            if 89.5 <= d <= 91.0 and int(math.degrees(math.atan2(y - c, x - c)) + frame * 4) % 10 < 6:
                g.px(x, y, "#feae34")                                          # dashed rim
    return g


def flare_ember(frame):
    W, H = 12, 18
    r = Rig(W, H)
    # the canister stuck in the ground at an angle
    r.limb([(4.0, 16.5), (7.0, 9.5)], 2.6, 2.4, ["#3a0808", "#6a1010", "#a82020", "#e04434", "#ff8070", "#ffd0c8"], base=2.4, gain=1.6,
           grime=0.0)
    r.pixels([(4, 14, 4.0), (5, 13, 4.0)], ["#2a1c08", "#4a3410", "#6e5018", "#957024", "#bf9a3c", "#e6c870"], 4.0, glow=False)
    # the flame: white core, amber body, flickering tongue
    tongue = [(7, 8), (8, 7), (7, 6), (8, 5) if frame != 1 else (6, 5), (8, 4) if frame == 2 else (7, 4)]
    for i, (x, y) in enumerate(tongue):
        r.pixels([(x, y, 5.0 if i < 2 else 4.0), (x - 1, y, 3.0), (x + 1, y, 3.0 if i < 3 else 2.0)], AMBERG, 4.0)
    r.pixels([(7, 9, 5.0), (6, 8, 4.0)], AMBERG, 5.0)
    # sparks + a wisp of smoke
    sparks = [[(10, 6), (3, 5)], [(10, 3), (4, 7), (9, 9)], [(2, 4), (11, 5)]][frame]
    r.pixels([(x, y, 4.0) for (x, y) in sparks], AMBERG, 4.0)
    smoke = [[(8, 1), (9, 0)], [(7, 1), (8, 0), (9, 1)], [(9, 2), (8, 1)]][frame]
    r.pixels([(x, y, 3.0) for (x, y) in smoke], ["#3a3c38", "#55574f", "#73746a", "#929284", "#b2b0a0", "#d0cebc"], 3.0, glow=False, ao=False)
    return r.render()


# ------------------------------------------------------------------ spore puff ring
PUFF = ["#56702c", "#7f9a3c", "#a8bc4c", "#c9d65a", "#e6f0a0", "#f6fad8"]


def spore_ring(frame):
    S = 128
    c = S / 2 - 0.5
    r = Rig(S, S)
    R0, n, pr = (30.0, 12, 8.0) if frame == 0 else (48.0, 16, 6.0)
    # sparse speckle inside the ring (the cloud settling)
    sp = []
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - c, y - c)
            if d < R0 - pr * 0.6:
                th = BAYER[y % 4][x % 4]
                if th < (3 if frame == 0 else 1) and h2(x, y, 9 + frame) < 0.7:
                    sp.append((x, y, 3.0 if th == 0 else 1.6))
    r.pixels(sp, PUFF, 3.0, glow=False, ao=False)
    for k in range(n):
        a = k / n * 2 * math.pi + (0.13 if frame else 0.0)
        rr = R0 + (h2(k, 1, 5 + frame) - 0.5) * 6
        x, y = c + math.cos(a) * rr, c + math.sin(a) * rr
        size = pr * (0.8 + 0.4 * h2(k, 2, 7 + frame))
        r.ell(x, y, size, size * 0.9, PUFF, base=2.8 - (0.6 if frame else 0), gain=2.0, grime=0.15, seed=k, spec=0.9)
        if frame == 1 and k % 2 == 0:                          # trailing wisps
            tx, ty = c + math.cos(a) * (rr - size * 1.6), c + math.sin(a) * (rr - size * 1.6)
            r.ell(tx, ty, size * 0.5, size * 0.45, PUFF, base=2.2, gain=1.6, grime=0.0, seed=k + 50)
    return r.render(ao=False)


def main():
    for key, fn, n in (("fx_vine_snare", vine_snare, 3), ("fx_flare_pool", flare_pool, 3), ("fx_flare_ember", flare_ember, 3),
                       ("fx_spore_ring", spore_ring, 2)):
        fr = [fn(i) for i in range(n)]
        im = strip(fr)
        save_sprite(key, im)
        print(key, im.size)
    # review
    out = Image.new("RGBA", (1100, 560), (30, 36, 34, 255))
    vs = Image.open(SCRATCH.parent.parent / "public" / "sprites" / "fx_vine_snare.png").convert("RGBA")
    out.alpha_composite(vs.resize((vs.width * 5, vs.height * 5), Image.NEAREST), (10, 10))
    fe = Image.open(SCRATCH.parent.parent / "public" / "sprites" / "fx_flare_ember.png").convert("RGBA")
    out.alpha_composite(fe.resize((fe.width * 5, fe.height * 5), Image.NEAREST), (420, 10))
    fp = Image.open(SCRATCH.parent.parent / "public" / "sprites" / "fx_flare_pool.png").convert("RGBA")
    out.alpha_composite(fp.crop((0, 0, 192, 192)), (10, 140))
    out.alpha_composite(fp.crop((192, 0, 384, 192)), (210, 140))
    sr = Image.open(SCRATCH.parent.parent / "public" / "sprites" / "fx_spore_ring.png").convert("RGBA")
    out.alpha_composite(sr.resize((sr.width * 2, sr.height * 2), Image.NEAREST), (420, 140))
    out.save(SCRATCH / "fx_v4.png")


if __name__ == "__main__":
    main()
