"""Player — scavenger. 32x40, faces right (3/4 front-right, top-down 55deg), feet on bottom row.

Green hood, cyan goggles, orange scarf, patched brown jacket, slate cargo pants,
salvage backpack with antenna + cables, scrap carbine.
Anims: idle 2, walk 4, attack 2 (firing), dodge 2, hurt 1.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from charkit import Canvas, export, limb_mask, shade_mask  # noqa: E402

W, H = 32, 40


# ---------------------------------------------------------------------------
# Parts. Every part draws into a Canvas at an offset (ox, oy).
# ---------------------------------------------------------------------------

def antenna(c, ox, oy, sway=0):
    # whip antenna from the pack, red tip light. sway bends the upper half.
    c.px(5 + ox + sway, 2 + oy, "E")
    c.px(5 + ox + sway, 3 + oy, "e")
    for y in range(4, 7):
        c.px(5 + ox + sway, y + oy, "M")
    for y in range(7, 10):
        c.px(5 + ox, y + oy, "m")


def backpack(c, ox, oy):
    # salvage rig: lit metal box with vents and status lights, canvas bag strapped
    # underneath, red + cyan cables looping out of the side.
    rows = [
        "..jmJj...",   # y9  antenna mount
        ".jMLLMmj.",   # y10 lid, lit top-left
        "jMLLMMmJj",   # y11
        "jMMmmmmJj",   # y12
        "emjjjjmJj",   # y13 vent slots, red cable exits
        "emMMMMmJj",   # y14
        "ejjjjjmJj",   # y15 vent
        "eJmymomJj",   # y16 status lights
        ".eJJJJJjj",   # y17
        "oe123321j",   # y18 green canvas bag, buckled
        "o.13MM21j",   # y19
        ".o122221j",   # y20
        "..11111j.",   # y21
    ]
    c.stamp(rows, 1 + ox, 9 + oy)


def head(c, ox, oy, face="goggles"):
    # Deep fabric hood: floppy point trailing back, a stitched seam between the crown
    # and side panel, lit rim around the face opening, shadowed brow.
    rows = [
        "....333333....",   # y3
        "..3344444433..",   # y4
        ".344444444332.",   # y5
        ".344444333332.",   # y6
        "3444333444432.",   # y7 rolled rim, lit, arcs over the face
        "3443334JwoMoJ2",   # y8 goggles; far rim sliver at the right
        "3343324JoUjUJ2",   # y9
        "2333223aSSsbSs",   # y10 cheek, nose
        "2232213aSsbab2",   # y11 mouth
        ".122..........",   # y12 hood hem at the nape
    ]
    if face == "hurt":
        rows[5] = "3443334JjjMjJ2"
        rows[6] = "3343324JUjjUJ2"
        rows[8] = "2232213aSaaab2"
    c.stamp(rows, 8 + ox, 3 + oy)


def torso(c, ox, oy):
    rows = [
        # x9
        "22rFFFFfffr...",   # y12 scarf wraps neck
        "2rfFFffrffrr..",   # y13
        "1ccccbbnrffbb.",   # y14 shoulders lit, strap n, scarf knot
        "1cbbcbbnafrbaa",   # y15
        ".cbbbbbnarfbaa",   # y16 scarf front tail
        ".bmmMbbnabrbaa",   # y17 slate patch
        ".bmCmbbnabbaaa",   # y18 stitch
        ".ammmbanabbaan",   # y19
        ".abbbbaanbaaan",   # y20
        ".abbbbaanaaann",   # y21
        ".nnnnnnnnnnnn.",   # y22 belt
        ".aJMaFFaabbaa.",   # y23 pouch, buckle
        ".abbaaaabbaan.",   # y24 jacket hem
        "..aan...aan...",   # y25 hem tails
    ]
    c.stamp(rows, 9 + ox, 12 + oy)


def scarf_tail(c, ox, oy, phase=0):
    # long tail of the scarf trailing off the back (secondary motion)
    shapes = [
        [(9, 13, "rf"), (8, 14, "fr"), (8, 15, "fr"), (8, 16, "r")],
        [(9, 13, "rf"), (7, 14, "ffr"), (6, 15, "fr")],
        [(9, 13, "rf"), (6, 14, "Fffr"), (4, 15, "ffr")],
    ]
    for x, y, s in shapes[phase]:
        c.seg(x + ox, y + oy, s)


def near_arm_low(c, ox, oy):
    # near (right) arm: shoulder -> elbow, forearm angled to the grip. Selout line on
    # its left so it separates from the chest.
    rows = [
        "acbb",     # y14  x19 shoulder
        "abbba",    # y15
        "abbaa",    # y16
        "abbaa",    # y17
        "nbaan",    # y18 elbow
        ".nbaa",    # y19
        "..nan",    # y20 cuff
    ]
    c.stamp(rows, 19 + ox, 14 + oy)


def carbine(c, ox, oy):
    # scrap carbine pointing right: taped wooden stock, boxy receiver with a tiny
    # cyan scope, rusty patch, magazine, perforated barrel shroud, muzzle.
    rows = [
        "........jjjo.........",   # y19 scope
        "ab....jMLLMMj........",   # y20 receiver top lit
        "abbCCjMLMMMmmLLLLMj..",   # y21 shroud top highlight
        "nabCCjmmrdmmJmjmjmmjj",   # y22 rust, shroud holes
        ".naaajJJrJJjJjjjjjj..",   # y23 underside
        "......jj.jmj.........",   # y24 grip, magazine
        ".........jmj.........",   # y25
        ".........jj..........",   # y26
    ]
    c.stamp(rows, 9 + ox, 19 + oy)


def hand_on_grip(c, ox, oy):
    # near hand (fingerless glove) wrapped round the grip
    c.seg(19 + ox, 22 + oy, "nSb")
    c.seg(19 + ox, 23 + oy, "nsa")


def far_hand(c, ox, oy):
    # far (left) hand on the foregrip, peeking over the shroud
    c.seg(24 + ox, 21 + oy, "Ss")


# ---------------------------------------------------------------------------
# Legs (parametric) + boots (hand-drawn stamps)
# ---------------------------------------------------------------------------

BOOTS = {
    # relative to (ankle_x - 1, ankle_y + 1). Facing right.
    "flat": ["nab...", "nabbcb.", "naabbbb", "nnnnnnn"],
    "toe":  ["nab..", "nabb.", ".nabb", ".naabb", "..nnnn"],      # heel raised, trailing
    "heel": ["nab....", "nabbcbb", "naabbb.", "nnnn..."],          # leading, toe up
    "lift": ["nab...", "nabbcb.", "naabbbb", ".nnnnnn"],           # in the air
    "kick": ["nab..", "naab.", "naaab", ".nnnn"],                  # pushed-off back foot
}
FAR_BOOT = {"b": "a", "c": "b", "a": "n"}


def boot(c, kind, ax, ay, far=False):
    rows = BOOTS[kind]
    if far:
        rows = ["".join(FAR_BOOT.get(ch, ch) for ch in r) for r in rows]
    c.stamp(rows, ax - 1, ay + 1)


def leg(c, hip, knee, ankle, far=False, pocket=True):
    """Pants leg from hip to ankle. Near leg: slate with lit left edge + cargo pocket.
    Far leg: darker, narrower."""
    if far:
        m = limb_mask([hip, knee, ankle], [4, 3, 3])
        shade_mask(c, m, "j", "j", "J")
    else:
        m = limb_mask([hip, knee, ankle], [5, 4, 3])
        shade_mask(c, m, "j", "J", "m", edge="j")
        # knee highlight + cargo pocket on the thigh
        kx, ky = knee
        c.px(kx - 1, ky, "M", only="opaque")
        if pocket:
            px_ = (hip[0] + knee[0]) // 2
            py_ = (hip[1] + knee[1]) // 2 + 1
            c.seg(px_ - 1, py_, "mMm")
            c.seg(px_ - 1, py_ + 1, "JJj")
            c.seg(px_ - 1, py_ + 2, "mJj")


def legs(c, far, near):
    """far/near = (hip, knee, ankle, bootkind)."""
    leg(c, far[0], far[1], far[2], far=True)
    boot(c, far[3], far[2][0], far[2][1], far=True)
    leg(c, near[0], near[1], near[2])
    boot(c, near[3], near[2][0], near[2][1])


def stand_legs(c, b=0):
    legs(c, ((13, 25 + b), (12, 30), (12, 34), "flat"),
            ((18, 25 + b), (18, 30), (18, 34), "flat"))


# ---------------------------------------------------------------------------
# Frames
# ---------------------------------------------------------------------------

def upper(c, bob=0, tail=0, gun=(0, 0), sway=0, dx=0, head_d=(0, 0), face="goggles",
          arm="low"):
    antenna(c, dx, bob, sway)
    backpack(c, dx, bob)
    scarf_tail(c, dx, bob, tail)
    torso(c, dx, bob)
    head(c, dx + head_d[0], bob + head_d[1], face)
    gx, gy = gun
    carbine(c, dx + gx, bob + gy)
    near_arm_low(c, dx, bob)
    hand_on_grip(c, dx + gx, bob + gy)
    far_hand(c, dx + gx, bob + gy)


def new():
    return Canvas(W, H)


def frame_idle(i):
    c = new()
    stand_legs(c, i)
    # breathing: torso drops 1 on frame 2, gun settles with it
    upper(c, bob=i, tail=0)
    return c.outline()


WALK = [
    # bob, far leg, near leg, tail, sway, gun dy
    (1, ((13, 26), (12, 30), (10, 33), "toe"), ((18, 26), (20, 30), (21, 34), "heel"), 1, -1, 1),
    (0, ((13, 25), (14, 29), (14, 32), "lift"), ((18, 25), (18, 30), (17, 34), "flat"), 2, -1, 0),
    (1, ((13, 26), (15, 30), (16, 34), "heel"), ((18, 26), (17, 30), (15, 33), "toe"), 1, 0, 1),
    (0, ((13, 25), (12, 30), (12, 34), "flat"), ((18, 25), (19, 29), (19, 32), "lift"), 2, 0, 0),
]


def frame_walk(i):
    bob, far, near, tail, sway, gdy = WALK[i]
    c = new()
    legs(c, far, near)
    upper(c, bob=bob, tail=tail, sway=sway, gun=(0, gdy - bob))
    return c.outline()


def muzzle_flash(c, mx, y, big=True):
    """Star-burst muzzle flash. mx = the barrel's last pixel: it is swallowed by the white
    core (visible barrel 1px shorter) so the burst gets the full 5 columns to the frame
    edge. Bright white/yellow core, amber spikes forward, up, down and on both forward
    diagonals, orange tips; a dark rim keeps it readable on pale stone floors."""
    if big:
        pts = [  # core
               (0, 0, "w"), (1, 0, "w"), (0, -1, "y"), (1, -1, "y"), (0, 1, "y"), (1, 1, "y"),
               # forward spike
               (2, 0, "y"), (3, 0, "F"), (4, 0, "f"),
               # up / down spikes
               (0, -2, "F"), (0, -3, "f"), (0, 2, "F"), (0, 3, "f"),
               # forward diagonals
               (2, -2, "F"), (3, -3, "f"), (2, 2, "F"), (3, 3, "f"),
               # fill between the spikes so the burst has a round fireball body
               (2, -1, "F"), (2, 1, "F"), (1, -2, "f"), (1, 2, "f"),
               # small back-flare hugging the muzzle
               (-1, -1, "F"), (-1, 1, "F")]
        smoke = []
    else:
        # follow-through: the burst collapses to a warm ember with a smoke puff drifting up
        pts = [(0, 0, "y"), (1, 0, "F"), (0, -1, "F"), (1, -1, "y"), (0, 1, "f"), (1, 1, "f")]
        smoke = [(2, -2, "L"), (3, -2, "M"), (2, -3, "M"), (3, -3, "L"), (3, -4, "M"), (4, -4, "L")]
    c.px(mx, y, None)
    drawn = []
    for dx, dy, ch in pts + smoke:
        x, yy = mx + dx, y + dy
        if 0 <= x < c.w and 0 <= yy < c.h:
            c.px(x, yy, ch)
            drawn.append((x, yy))
    # rim only around the new pixels (the body is already outlined)
    for x, yy in drawn:
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + ox, yy + oy
            if 0 <= nx < c.w and 0 <= ny < c.h and c.get(nx, ny) is None:
                c.px(nx, ny, "#")


def frame_attack(i):
    c = new()
    stand_legs(c, 0)
    if i == 0:
        # recoil: gun kicks back 2px, shoulders rock back 1, flash at the muzzle
        upper(c, bob=0, tail=0, gun=(-2, -1), head_d=(-1, 0))
        c.outline()
        muzzle_flash(c, 27, 21)
        c.px(16, 17, "F")   # spent casing flying up
        c.px(15, 16, "y")
    else:
        upper(c, bob=0, tail=0, gun=(-1, -1))
        c.outline()
        muzzle_flash(c, 28, 21, big=False)
        c.px(13, 15, "F")
    return c


def frame_dodge(i):
    c = new()
    if i == 0:
        # crouched lunge: back leg pushes off, front leg bent, body low and forward
        legs(c, ((14, 29), (11, 33), (7, 35), "kick"), ((18, 29), (21, 31), (21, 34), "flat"))
        upper(c, bob=4, dx=2, tail=2, sway=-1, gun=(-1, 0), head_d=(1, 1))
        c.outline()
        for x, y, ch in [(3, 37, "M"), (4, 36, "L"), (2, 36, "M"), (5, 38, "M"), (1, 38, "L")]:
            c.px(x, y, ch)
    else:
        # deep slide: lowest point, legs wide, dust cloud kicked up behind
        legs(c, ((14, 31), (10, 34), (6, 36), "kick"), ((19, 31), (22, 33), (23, 34), "flat"))
        upper(c, bob=6, dx=3, tail=2, sway=-1, gun=(-2, 0), head_d=(1, 1))
        c.outline()
        for x, y, ch in [(1, 35, "M"), (2, 34, "L"), (3, 35, "L"), (2, 37, "M"), (1, 37, "M"),
                         (4, 33, "M"), (1, 33, "L")]:
            c.px(x, y, ch)
    return c


def frame_hurt():
    c = new()
    legs(c, ((13, 25), (12, 30), (11, 34), "flat"), ((18, 25), (17, 30), (15, 33), "toe"))
    upper(c, bob=0, dx=0, tail=0, gun=(-2, -2), head_d=(-2, -1), face="hurt")
    return c.outline()


frames = ([frame_idle(i) for i in range(2)] + [frame_walk(i) for i in range(4)] +
          [frame_attack(i) for i in range(2)] + [frame_dodge(i) for i in range(2)] + [frame_hurt()])
anims = {"idle": [0, 1], "walk": [2, 3, 4, 5], "attack": [6, 7], "dodge": [8, 9], "hurt": [10]}
anim_fps = {"idle": 3, "walk": 10, "attack": 12, "dodge": 10}
export("player", frames, anims, anim_fps=anim_fps, here=HERE)
