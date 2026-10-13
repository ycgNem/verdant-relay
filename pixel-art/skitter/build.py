"""Skitter - fast insectoid. 24x20, faces right, feet on bottom row.

Glossy domed magenta carapace with segment seams, dark head with one big glowing
yellow eye, pale hooked mandibles, thin jointed legs (crisp 1px with a dark underside,
drawn outside the outline so they stay spindly).
Anims: idle 2, walk 4, windup 1 (reared up), attack 2 (dart + snap).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "player"))
from charkit import Canvas, export  # noqa: E402

W, H = 24, 20


def new():
    return Canvas(W, H)


SHELL = [
    "....ppppp.........",
    "..ppPPkkPPp.......",
    ".pPkkwkkPPPp......",
    "pPkkkkPPPpPPp.ppp.",
    "pPkPPPPPpPPPPpPPPp",
    "pPPPPPPpPPPPpPwyyp",
    "ppPPPPPpPPPpPPyyFp",
    ".ppPPPpPPPppnpPPpn",
    "..ppppppppn.nppnn.",
    "....nnnnnn...nn...",
]
EYE_FLARE = {5: "pPPPPPPpPPPPpPwwyp", 6: "ppPPPPPpPPPpPPywyp"}
JAW = {
    "shut": [(18, 6, "C"), (18, 7, "C"), (17, 8, "C")],
    "open": [(18, 4, "C"), (19, 3, "C"), (18, 8, "C"), (19, 9, "C"), (18, 6, "R")],
}


def shell(c, bx, by, eye="shut", jaw="shut"):
    rows = list(SHELL)
    if eye == "flare":
        for k, r in EYE_FLARE.items():
            rows[k] = r
    c.stamp(rows, 2 + bx, 4 + by)
    for x, y, ch in JAW[jaw]:
        c.px(2 + bx + x, 4 + by + y, ch)
    # dorsal spines along the seam lines
    for x, y in ((7, 3), (11, 4)):
        c.px(x + bx, y + by, "p")
        c.px(x + bx - 1, y + by - 1, "n")


def leg(c, hip, knee, tip, far=False):
    """1px jointed leg; near legs get a dark underside line + lit knee."""
    pts = []
    for (x0, y0), (x1, y1) in ((hip, knee), (knee, tip)):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            pts.append((round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)))
    col = "n" if far else "p"
    for x, y in pts:
        c.px(x, y, col, only="empty")
    if not far:
        for x, y in pts:
            c.px(x, y + 1, "#", only="empty")
        c.px(knee[0], knee[1], "P")
    c.px(tip[0], tip[1], "n" if far else "#")


REST = {
    "near": [((6, 12), (2, 11), (1, 18)), ((11, 13), (8, 14), (7, 18)), ((16, 12), (21, 11), (21, 18))],
    "far": [((6, 11), (2, 8), (3, 16)), ((11, 12), (14, 13), (15, 16)), ((15, 10), (21, 7), (22, 16))],
}


def build(bx=0, by=0, tips=None, knees=None, eye="shut", jaw="shut"):
    c = new()
    shell(c, bx, by, eye, jaw)
    c.outline()
    for side in ("near", "far"):   # near first so it wins where they cross
        for k, (hip, knee, tip) in enumerate(REST[side]):
            if knees and (side, k) in knees:
                knee = knees[(side, k)]
            else:
                knee = (max(1, knee[0] + bx), knee[1] + by)
            if tips and (side, k) in tips:
                tip = tips[(side, k)]
            leg(c, (hip[0] + bx, hip[1] + by), knee, tip, far=(side == "far"))
    return c


def frame_idle(i):
    return build(by=i, jaw="shut" if i == 0 else "open")


# tripod gait: set A = near0, near2, far1 ; set B = far0, far2, near1
def frame_walk(i):
    bob = [0, 1, 0, 1][i]
    s = [2, 0, -2, 0][i]
    tips = {("near", 0): (1 + max(s, 0), 18), ("near", 2): (21 + min(s, 0), 18), ("far", 1): (15 + s, 16),
            ("far", 0): (3 + max(-s, 0), 16), ("far", 2): (22 - max(s, 0), 16), ("near", 1): (7 - s, 18)}
    if i == 1:
        for k in (("near", 0), ("near", 2), ("far", 1)):
            tips[k] = (tips[k][0], tips[k][1] - 1)
    if i == 3:
        for k in (("far", 0), ("far", 2), ("near", 1)):
            tips[k] = (tips[k][0], tips[k][1] - 1)
    return build(by=bob, tips=tips, jaw="shut" if i < 2 else "open")


def frame_windup():
    # reared back on the hind legs, front legs raised to strike, eye flaring
    tips = {("near", 2): (22, 5), ("far", 2): (21, 3), ("near", 1): (9, 18), ("far", 1): (13, 16)}
    knees = {("near", 2): (20, 8), ("far", 2): (19, 6)}
    return build(bx=-1, by=-1, tips=tips, knees=knees, eye="flare", jaw="open")


def frame_attack(i):
    if i == 0:
        # dart: low and forward, hind legs kicked out behind, front legs reaching
        tips = {("near", 0): (1, 18), ("far", 0): (1, 15), ("near", 1): (5, 18), ("far", 1): (9, 16),
                ("near", 2): (22, 15), ("far", 2): (22, 12)}
        knees = {("near", 0): (3, 15), ("far", 0): (3, 12)}
        return build(bx=1, by=2, tips=tips, knees=knees, eye="flare", jaw="open")
    tips = {("near", 2): (22, 18), ("far", 2): (22, 16)}
    c = build(bx=1, by=1, tips=tips, jaw="shut")
    c.px(22, 7, "w")
    c.px(22, 11, "w")
    return c


frames = ([frame_idle(i) for i in range(2)] + [frame_walk(i) for i in range(4)] +
          [frame_windup()] + [frame_attack(i) for i in range(2)])
anims = {"idle": [0, 1], "walk": [2, 3, 4, 5], "windup": [6], "attack": [7, 8]}
anim_fps = {"idle": 4, "walk": 14, "attack": 12}
export("skitter", frames, anims, anim_fps=anim_fps, here=HERE)
