"""Build the player's 'hurt_mix' anim folder (no generation cost).

The taking-punch template came out off-model in the south, north-east and north rows (the body turns to
another facing, cyan blobs on the hands), so those rows are made from the idle pose knocked back 1-2 texels
(pure translation, no resampling); the south-east and east template rows are kept as generated.
"""
import shutil
from pathlib import Path
from PIL import Image

A = Path(__file__).resolve().parent / "raw" / "player" / "zip" / "Idle" / "animations"
OUT = A / "hurt_mix"
KEEP = ["south-east", "east"]
BACK = {"south": (0, -1), "north-east": (-1, 1), "north": (0, 1)}   # screen direction away from the facing
STEPS = [0, 1, 2, 2, 1, 0]
if OUT.exists():
    shutil.rmtree(OUT)
for d in KEEP:
    shutil.copytree(A / "hurt" / d, OUT / d)
for d, (bx, by) in BACK.items():
    src = Image.open(sorted((A / "idle" / d).glob("*.png"))[0]).convert("RGBA")
    (OUT / d).mkdir(parents=True)
    for i, s in enumerate(STEPS):
        c = Image.new("RGBA", src.size, (0, 0, 0, 0))
        c.paste(src, (bx * s, by * s))
        c.save(OUT / d / f"frame_{i:03d}.png")
print("hurt_mix ready")
