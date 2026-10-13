"""Razorback - armored boar-beast. 48x36, faces right, hooves on bottom row.

Massive hunched shoulders, bristly dark-brown hide, rusted sheet-metal plates fused
into the hide (riveted, lit top edges, rust blooms), a bristle mane between plates,
small amber eye, flat snout, curved ivory tusks, cloven hooves.
Anims: idle 2, walk 4, windup 2 (pawing the ground, snorting), attack 2 (charging).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "player"))
from charkit import Canvas, export, limb_mask, shade_mask  # noqa: E402

W, H = 48, 36
GROUND = 34


def new():
    return Canvas(W, H)


def T(pts, dx, dy):
    return [(x + dx, y + dy) for x, y in pts]


BODY = [(7, 14), (9, 10), (13, 7), (19, 5), (25, 4), (31, 5), (35, 8), (37, 12), (37, 20),
        (34, 24), (27, 25), (18, 25), (11, 24), (8, 21)]
HEAD = [(32, 11), (36, 11), (40, 15), (44, 18), (45, 22), (42, 25), (37, 26), (33, 23)]
EAR = [(32, 10), (34, 6), (36, 11)]

PLATES = [
    # (polygon, rivets) - separate fused plates with hide showing in the seams
    ([(8, 12), (10, 9), (13, 8), (13, 15), (10, 17), (8, 16)], [(10, 11)]),                  # rump
    ([(15, 7), (20, 5), (22, 6), (22, 14), (19, 16), (15, 15)], [(17, 8), (20, 13)]),        # mid
    ([(24, 5), (29, 3), (34, 7), (35, 13), (30, 16), (24, 14)], [(26, 7), (32, 10), (28, 13)]),  # shoulder
    ([(33, 12), (36, 12), (39, 15), (37, 17), (34, 16)], [(36, 14)]),                        # brow
]
RUST = [(10, 14), (11, 15), (18, 11), (19, 12), (18, 12), (27, 10), (28, 10), (29, 11), (31, 13), (26, 12), (37, 16)]


def poly_mask(pts):
    from PIL import Image, ImageDraw
    m = Image.new("1", (W, H), 0)
    ImageDraw.Draw(m).polygon(pts, fill=1, outline=1)
    p = m.load()
    return {(x, y) for y in range(H) for x in range(W) if p[x, y]}


def plate(c, pts, rivets, dx, dy, glow=False):
    m = poly_mask(T(pts, dx, dy))
    for (x, y) in m:
        up = (x, y - 1) in m
        left = (x - 1, y) in m
        down = (x, y + 1) in m
        right = (x + 1, y) in m
        if not up:
            col = "L"
        elif not left:
            col = "M"
        elif not down or not right:
            col = "J"
        elif (x, y - 2) not in m:
            col = "M"
        else:
            col = "m"
        c.px(x, y, col)
    for (x, y) in RUST:
        if (x + dx, y + dy) in m and c.get(x + dx, y + dy) == c.col("m"):
            c.px(x + dx, y + dy, "r" if (x + y) % 2 else "d")
    for (x, y) in rivets:
        c.px(x + dx, y + dy, "j")
        c.px(x + dx - 1, y + dy - 1, "L", only="opaque")


def hide(c, dx, dy, head_dy=0):
    body = T(BODY, dx, dy)
    head = T(HEAD, dx, dy + head_dy)
    c.poly(body, "n")
    c.poly(head, "n")
    c.poly(T(body, -1, -1), "a", only="opaque")
    c.poly(T(head, -1, -1), "a", only="opaque")
    # bristly lit hair strokes on the flank and neck, cool shadow strokes low down
    for (x, y) in [(12, 18), (16, 19), (20, 18), (24, 18), (28, 19), (31, 17), (14, 21), (22, 21), (34, 16)]:
        c.px(x + dx, y + dy, "b", only="opaque")
        c.px(x + dx + 1, y + dy - 1, "b", only="opaque")
    for (x, y) in [(13, 23), (19, 24), (25, 23), (30, 23), (17, 22), (27, 21)]:
        c.px(x + dx, y + dy, "n", only="opaque")
        c.px(x + dx + 1, y + dy - 1, "n", only="opaque")
    # belly shadow
    c.line(12 + dx, 24 + dy, 33 + dx, 24 + dy, "n", only="opaque")
    # neck crease separating the head from the shoulders
    c.line(33 + dx, 13 + dy + head_dy, 34 + dx, 22 + dy + head_dy, "n", only="opaque")
    c.line(32 + dx, 14 + dy + head_dy, 33 + dx, 21 + dy + head_dy, "b", only="opaque")
    # jaw underside in shadow
    c.line(36 + dx, 25 + dy + head_dy, 41 + dx, 24 + dy + head_dy, "n", only="opaque")


def snout(c, dx, dy, snort=False):
    # ear, flat nose disk, nostrils, mouth line, eye
    ear = T(EAR, dx, dy)
    c.poly(ear, "a")
    c.line(ear[0][0] + 1, ear[0][1], ear[1][0], ear[1][1] + 1, "n")
    c.px(ear[1][0], ear[1][1], "b")
    c.seg(43 + dx, 18 + dy, "ba")
    c.seg(43 + dx, 19 + dy, "sb")
    c.seg(43 + dx, 20 + dy, "nb")
    c.seg(43 + dx, 21 + dy, "ab")
    c.line(36 + dx, 23 + dy, 41 + dx, 22 + dy, "n")
    # small fierce eye under the brow plate
    c.seg(38 + dx, 17 + dy, "#F")
    if snort:
        for x, y, ch in [(46, 19, "L"), (46, 21, "L"), (45, 20, "w")]:
            c.px(x + dx, y + dy, ch, only="empty")


def tusk(c, dx, dy):
    # thick ivory tusk sweeping up from the jaw corner past the snout, sharp tip
    for x, y, ch in [(38, 23, "c"), (39, 23, "C"), (40, 23, "C"), (41, 23, "C"), (42, 22, "C"),
                     (43, 22, "C"), (44, 21, "C"), (45, 20, "C"), (45, 19, "C"), (46, 18, "w"),
                     (39, 24, "b"), (40, 24, "c"), (41, 24, "c"), (42, 23, "c"), (43, 23, "c"),
                     (44, 22, "c"), (45, 21, "b"), (46, 19, "c")]:
        c.px(x + dx, y + dy, ch)


def mane(c, dx, dy):
    # bristles poking up between the plates and along the neck
    for x, y in [(13, 8), (19, 6), (20, 6), (33, 9), (34, 10), (9, 10)]:
        c.px(x + dx, y + dy, "n")
        c.px(x + dx - 1, y + dy - 1, "n")


def tail(c, dx, dy, flick=0):
    pts = [[(6, 15), (5, 17), (4, 19)], [(6, 15), (5, 16), (3, 16)]][flick]
    for x, y in pts:
        c.px(x + dx, y + dy, "n")
    x, y = pts[-1]
    c.px(x + dx - 1, y + dy + (1 if flick == 0 else 0), "a")


def leg(c, hip, knee, hoof, far=False):
    m = limb_mask([hip, knee, hoof], [6, 5, 4])
    if far:
        shade_mask(c, m, "#", "n", "n")
    else:
        shade_mask(c, m, "n", "a", "b", edge="#")
        c.px(knee[0] - 1, knee[1], "b", only="opaque")
    hx, hy = hoof
    c.seg(hx - 2, hy + 1, "jJjJ" if not far else "jjjj")
    c.seg(hx - 2, hy, "j" if not far else "#")


def beast(legs, dx=0, dy=0, head_dy=0, snort=False, flick=0):
    c = new()
    leg(c, *legs["far_h"], far=True)
    leg(c, *legs["far_f"], far=True)
    tail(c, dx, dy, flick)
    hide(c, dx, dy, head_dy)
    for pts, rv in PLATES[:3]:
        plate(c, pts, rv, dx, dy)
    plate(c, PLATES[3][0], PLATES[3][1], dx, dy + head_dy)
    mane(c, dx, dy)
    snout(c, dx, dy + head_dy, snort)
    leg(c, *legs["near_h"])
    leg(c, *legs["near_f"])
    tusk(c, dx, dy + head_dy)
    return c


def legset(dx, dy, fh, ff, nh, nf):
    """each = (knee, hoof); hips ride with the body."""
    hips = {"far_h": (12, 22), "far_f": (31, 22), "near_h": (15, 23), "near_f": (33, 23)}
    out = {}
    for k, (kn, hf) in zip(("far_h", "far_f", "near_h", "near_f"), (fh, ff, nh, nf)):
        hx, hy = hips[k]
        out[k] = ((hx + dx, hy + dy), kn, hf)
    return out


def rest(dy=0):
    return legset(0, dy, ((11, 29), (12, 33)), ((32, 29), (32, 33)), ((14, 30), (15, 33)), ((34, 30), (35, 33)))


def frame_idle(i):
    c = beast(rest(i), dy=i, head_dy=0, flick=i)
    return c.outline()


WALK = [
    # near_f + far_h forward on 0 ; far_f + near_h forward on 2
    (1, ((13, 29), (15, 33)), ((30, 29), (29, 33)), ((12, 30), (11, 33)), ((36, 29), (38, 33))),
    (0, ((11, 28), (12, 31)), ((32, 29), (32, 33)), ((14, 30), (15, 33)), ((35, 28), (35, 31))),
    (1, ((10, 29), (9, 33)), ((34, 28), (35, 33)), ((16, 29), (18, 33)), ((32, 30), (31, 33))),
    (0, ((11, 29), (12, 33)), ((33, 28), (33, 31)), ((14, 29), (15, 31)), ((34, 30), (35, 33))),
]


def frame_walk(i):
    bob, fh, ff, nh, nf = WALK[i]
    c = beast(legset(0, bob, fh, ff, nh, nf), dy=bob, head_dy=[0, 0, 1, 1][i] - bob + bob * 0, flick=i % 2)
    return c.outline()


def dust(c, pts):
    for x, y, ch in pts:
        c.px(x, y, ch, only="empty")


def frame_windup(i):
    # head lowered, weight back, near front hoof pawing: lifted (0) then scraping back (1)
    if i == 0:
        legs = legset(-1, 1, ((10, 29), (11, 33)), ((31, 29), (31, 33)), ((13, 30), (14, 33)),
                      ((36, 27), (37, 30)))
        c = beast(legs, dx=-1, dy=1, head_dy=2, snort=True)
        c.outline()
        dust(c, [(39, 33, "M"), (40, 32, "L"), (41, 33, "M")])
    else:
        legs = legset(-1, 1, ((10, 29), (11, 33)), ((31, 29), (31, 33)), ((13, 30), (14, 33)),
                      ((33, 30), (30, 33)))
        c = beast(legs, dx=-1, dy=1, head_dy=2, snort=False, flick=1)
        c.outline()
        dust(c, [(27, 33, "M"), (26, 32, "L"), (24, 33, "M"), (25, 31, "M"), (22, 32, "L"), (23, 30, "M")])
        for x, y, ch in [(45, 21, "L"), (46, 23, "M")]:
            c.px(x, y, ch, only="empty")
    return c


def frame_attack(i):
    if i == 0:
        # full gallop extension: front legs flung forward, hind legs driving back, head down
        legs = legset(0, 1, ((8, 28), (4, 31)), ((37, 28), (40, 31)), ((11, 29), (7, 33)),
                      ((39, 29), (42, 33)))
        c = beast(legs, dx=0, dy=1, head_dy=2, flick=1)
    else:
        # gathered: legs tucked under the body, body high, about to slam
        legs = legset(0, 0, ((16, 28), (19, 32)), ((29, 29), (27, 33)), ((18, 29), (21, 33)),
                      ((32, 29), (30, 32)))
        c = beast(legs, dx=0, dy=0, head_dy=2, flick=1)
    c.outline()
    # speed lines streaming behind
    for x0, y0, n in ([(1, 12, 3), (0, 18, 2), (2, 23, 3)] if i == 0 else [(1, 14, 2), (1, 21, 3)]):
        for k in range(n):
            c.px(x0 + k + 1, y0, "L", only="empty")
    dust(c, [(3, 33, "M"), (2, 32, "L"), (5, 34, "M")] if i == 0 else [(8, 33, "M"), (7, 32, "L")])
    return c


frames = ([frame_idle(i) for i in range(2)] + [frame_walk(i) for i in range(4)] +
          [frame_windup(i) for i in range(2)] + [frame_attack(i) for i in range(2)])
anims = {"idle": [0, 1], "walk": [2, 3, 4, 5], "windup": [6, 7], "attack": [8, 9]}
anim_fps = {"idle": 3, "walk": 8, "windup": 6, "attack": 12}
export("razorback", frames, anims, anim_fps=anim_fps, here=HERE)
