"""seedling - tiny sprout critter (16x16) that bursts out of a Seed Carrier.
idle 2, walk 4. A glowing amber seed body on two root-legs with a two-leaf sprout."""
import os
from pathlib import Path
HERE = Path(__file__).resolve().parent
os.chdir(HERE)
from kit import *  # noqa: E402,F403

W, H = 16, 16
s = new_sprite(W, H)

SEED = [E["brown"], E["rust"], E["clay"], E["amber"], E["yellow"]]
LEAF = [E["forest"], E["green"], E["lime"]]

# seed body rows (relative): (x_from, x_to) around centre column 7, 7 rows tall
ROWS = [(5, 9), (4, 10), (3, 11), (3, 11), (3, 11), (4, 10), (5, 9)]


def seed_body(top, squash=0):
    rows = list(ROWS)
    if squash:                       # 1px squash: drop a middle row, widen bottom
        rows = rows[:3] + rows[4:]
        rows[-1] = (4, 10)
    pts = [(x, top + i) for i, (a, b) in enumerate(rows) for x in range(a, b + 1)]
    cy = top + len(rows) / 2
    lit_mask(s, pts, 7.0, cy, 4.8, len(rows) / 2 + 0.4, SEED, bias=0.0)
    bot = top + len(rows) - 1
    # husk seam: a darker groove from the crown curving to the back
    pxs(s, [(4, top + 4), (5, top + 5)], E["rust"])     # husk ridge on the back
    # face (facing right)
    ey = top + 3
    s.px(7, ey, E["out"])
    s.px(9, ey, E["out"])
    s.px(7, ey - 1, E["yellow"])     # lit brow
    s.px(8, ey + 2, E["brown"])      # tiny mouth
    return bot


def legs(bot, phase):
    """Root legs from the hips (x5 far, x9 near) to the ground row 14.
    phase: 0 stand, 1 contact A, 2 passing, 3 contact B."""
    feet = {0: (5, 9), 1: (4, 11), 2: (6, 8), 3: (7, 9)}[phase]
    hips = (5, 9)
    g = 14
    for hx, fx, c in ((hips[0], feet[0], E["plum"]), (hips[1], feet[1], E["brown"])):
        s.line(hx, bot + 1, fx, g, c)
        s.px(hx, bot + 1, E["tan"] if c == E["brown"] else E["brown"])
    # toes point forward (right)
    s.px(feet[1] + 1, g, E["brown"])
    s.px(feet[0] + 1, g, E["plum"])
    if phase == 3:                    # far leg reaching forward, near leg pushing back
        s.line(hips[0], bot + 1, 7, g, E["plum"])


def sprout(top, sway):
    """stem from the crown, two leaves; sway -1/0/+1 tips the leaves."""
    x = 7
    sx = x + (1 if sway > 0 else 0)
    s.px(sx, top - 1, LEAF[1])
    ly = top - 2
    # left leaf (back, darker) - 3x2 droplet
    lb = sx - 1 + min(0, sway)
    pxs(s, [(lb, ly), (lb - 1, ly), (lb - 2, ly - 1 + (1 if sway < 0 else 0)), (lb - 1, ly - 1)], LEAF[1])
    s.px(lb - 1, ly, LEAF[0])
    # right leaf (front, lit)
    rb = sx + 1 + max(0, sway)
    pxs(s, [(rb, ly), (rb + 1, ly - 1), (rb + 2, ly - 1 - (1 if sway > 0 else 0)), (rb + 1, ly)], LEAF[2])
    s.px(rb + 1, ly, LEAF[1])
    s.px(sx, ly, LEAF[1])


def frame(i, body_top, squash, leg_phase, sway, ms):
    new_frame(s, i)
    bot = seed_body(body_top, squash)
    legs(bot, leg_phase)
    sprout(body_top, sway)
    finish(s)
    s.frames[i - 1].duration = ms


# feet end on row 14 so the outline lands on the bottom row 15
# idle: breathe (squash) + leaves bob
frame(1, 6, 0, 0, 0, 300)
frame(2, 7, 1, 0, -1, 300)
# walk: contact (low), passing (high), contact, passing - sprout lags one frame
frame(3, 6, 0, 1, 1, 110)
frame(4, 5, 0, 2, 0, 110)
frame(5, 6, 0, 3, -1, 110)
frame(6, 5, 0, 2, 0, 110)

s.stats()
check(s, "seedling")
export(s, "seedling", {"idle": [0, 1], "walk": [2, 3, 4, 5]}, fps=8,
       anim_fps={"idle": 4, "walk": 10}, scale=10, here=HERE)
