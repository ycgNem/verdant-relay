"""Build the player's 'roll3' anim folder (no generation cost): a real tuck -> tumble -> recover dodge roll.

PixelLab v3 would not rotate the body (custom 'somersault' prompts came out as an upright crouch), so the tumble
frames are the crouch poses (template 'crouching', and the roll2 east test for the east row) turned in exact
90 degree steps (pixel-exact transposes, no resampling), each one set down on the standing feet line.
Side rows (se e ne) spin clockwise in the screen plane (head forward and down). The s / n rows roll about the
screen x axis, so the 180 degree frame is the OPPOSITE facing turned upside down (a south roll shows the back
upside down mid-tumble, a north roll shows the face).
"""
import shutil
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
NEW = HERE / "raw" / "player_new" / "zip" / "Idle" / "animations"
OUT = HERE / "raw" / "player" / "zip" / "Idle" / "animations" / "roll3"
CW90, R180, CW270 = Image.Transpose.ROTATE_270, Image.Transpose.ROTATE_180, Image.Transpose.ROTATE_90


def frames(anim, d):
    out = []
    for p in sorted((NEW / anim / d).glob("*.png")):
        im = Image.open(p).convert("RGBA")
        im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        out.append(im)
    return out


def feet(im):
    return im.getbbox()[3]


def centre_x(im):
    a = im.getchannel("A"); bb = im.getbbox(); low = bb[3] - 1
    xs = [x for y in range(max(0, low - 2), low + 1) for x in range(im.width) if a.getpixel((x, y))]
    return (min(xs) + max(xs)) / 2


def place(img, size, ground, cx, op=None, dy=0):
    """Optionally transpose, then put the sprite on a size canvas with its bottom on `ground` and bbox centre at cx."""
    if op is not None:
        img = img.transpose(op)
    bb = img.getbbox(); spr = img.crop(bb)
    c = Image.new("RGBA", size, (0, 0, 0, 0))
    c.paste(spr, (round(cx - spr.width / 2), ground - spr.height + dy))
    return c


def build(d, C, back=None):
    """C = crouch frames of this facing, back = crouch frames of the opposite facing (s/n rows)."""
    size = C[0].size; ground = feet(C[0]); cx = centre_x(C[0])
    keep = lambda im: place(im, size, ground, cx)
    tuck, ball = C[3], C[4]
    if back is None:   # side view: spin clockwise
        seq = [keep(tuck), place(ball, size, ground, cx, CW90), place(ball, size, ground, cx, R180),
               place(ball, size, ground, cx, CW270), keep(ball), keep(C[2]), keep(C[1])]
    else:
        # two inverted frames so the flip reads as a tumble, not a one-frame glitch; the second one is
        # nudged 2 texels along the roll (down the screen for s, up for n)
        step = 2 if d == "south" else -2
        seq = [keep(tuck), keep(ball), place(back[4], size, ground, cx, R180),
               place(back[4], size, ground, cx, R180, step), keep(ball), keep(C[2]), keep(C[1])]
    (OUT / d).mkdir(parents=True)
    for i, f in enumerate(seq):
        f.save(OUT / d / f"frame_{i:03d}.png")


if OUT.exists():
    shutil.rmtree(OUT)
S, N = frames("crouch", "south"), frames("crouch", "north")
R = frames("roll2", "east")            # 7 frames: 0 stand .. 4 deepest crouch
E = [R[0], R[1], R[2], R[3], R[4]]
build("south", S, back=N)
build("north", N, back=S)
build("south-east", frames("crouch", "south-east"))
build("east", E)
build("north-east", frames("crouch", "north-east"))
print("roll3 ready")
