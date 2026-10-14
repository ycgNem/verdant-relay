"""Write pixel-art/manifest.v3towers.json (V3 hand-made night towers, 48x64 frames), then merge.

Run: python pixel-art/towers_v3/write_manifest.py && python pixel-art/merge_manifest.py
This fragment sorts after manifest.towers.json, so its entries replace the V1 ones (same keys) - merge prints a
"defined twice" warning for each of those 18 keys; that is expected.
Every tower: 4-frame strip (192x64), idle [0,1] + attack [2,3] (pulse_beacon: a 4-frame idle pulse, no attack),
anchor = bottom centre (the default: feet on the bottom row, like V1). L3 branch art: <type>_3a / <type>_3b.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANIM_FPS = {  # same rates as the V1 towers (src/entities/Tower.js plays idle / attack)
    "scrap_turret": {"idle": 2, "attack": 10},
    "thorn_nest": {"idle": 3, "attack": 10},
    "arc_spire": {"idle": 6, "attack": 10},
    "snare_vine": {"idle": 2, "attack": 8},
    "mortar_pod": {"idle": 2, "attack": 8},
    "pulse_beacon": {"idle": 6},
}
M = {}
for t, fps in ANIM_FPS.items():
    anims = {"idle": [0, 1, 2, 3]} if t == "pulse_beacon" else {"idle": [0, 1], "attack": [2, 3]}
    for sfx in ("", "_2", "_3", "_3a", "_3b"):
        key = t + sfx
        M[key] = {"file": f"{key}.png", "ppu": 32, "frames": 4, "fps": 8, "anims": anims, "animFps": dict(fps)}

out = ROOT / "pixel-art" / "manifest.v3towers.json"
out.write_text(json.dumps(M, indent=2) + "\n", encoding="utf8")
print(f"{len(M)} keys -> {out}")
