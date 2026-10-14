"""Write pixel-art/manifest.v3batch4.json (hand-made art batch 4), then run merge_manifest.py.

Also updates the four base boss entries in pixel-art/manifest.v3env.json (the PixelLab agent's fragment, which sorts
after this one and owns those keys): the strips are now 10 frames with a top/side pad (windup 8-9), see
pixel-art/bosses_v4/build.py. Re-running pixellab_v3/build_bosses.py or make_manifest.py would undo that.

Run: python pixel-art/batch4/write_manifest.py && python pixel-art/merge_manifest.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PA = ROOT / "pixel-art"
M = {}

# 1. V1 night creatures repainted (same keys, same frame layout and anims; bigger frames; feet on the bottom row)
M["seed_carrier"] = {"file": "seed_carrier.png", "ppu": 32, "frames": 6, "fps": 8,
                     "anims": {"idle": [0, 1], "walk": [2, 3, 4, 5]}, "animFps": {"idle": 3, "walk": 8}}
M["ruin_guard"] = {"file": "ruin_guard.png", "ppu": 32, "frames": 8, "fps": 8,
                   "anims": {"idle": [0, 1], "walk": [2, 3, 4, 5], "attack": [6, 7]}, "animFps": {"idle": 3, "walk": 7, "attack": 6}}
M["burrower"] = {"file": "burrower.png", "ppu": 32, "frames": 8, "fps": 8,
                 "anims": {"idle": [0, 1], "walk": [2, 3, 4, 5], "burrowed": [6, 7]}, "animFps": {"idle": 5, "walk": 9, "burrowed": 10}}
M["seedling"] = {"file": "seedling.png", "ppu": 32, "frames": 6, "fps": 8,
                 "anims": {"idle": [0, 1], "walk": [2, 3, 4, 5]}, "animFps": {"idle": 4, "walk": 10}}

# 2. bosses: phase-2 variants (the base keys live in manifest.v3env.json, patched below)
boss = json.loads((PA / "bosses_v4" / "manifest_entries.json").read_text(encoding="utf8"))
for k, e in boss.items():
    if k.endswith("_p2"):
        M[k] = e

# 3. derived creature sheets: the crawler's layout exactly
crawler = json.loads((PA / "manifest.v2chars.json").read_text(encoding="utf8")).get("crawler")
if crawler is None:
    crawler = json.loads((ROOT / "public" / "sprites" / "manifest.json").read_text(encoding="utf8"))["crawler"]
for k in ("thorn_stalker", "bloater"):
    M[k] = {**crawler, "file": f"{k}.png"}

# 4. night protocol + spore FX
M["fx_vine_snare"] = {"file": "fx_vine_snare.png", "ppu": 32, "frames": 3, "fps": 10, "anchor": [12, 22], "shadow": 0,
                      "anims": {"idle": [0, 1, 2], "burst": [0, 1], "hold": [1, 2]}, "animFps": {"hold": 3}}
M["fx_flare_pool"] = {"file": "fx_flare_pool.png", "ppu": 32, "frames": 3, "fps": 6, "flat": True, "shadow": 0,
                      "anims": {"idle": [0, 1, 2, 1]}}
M["fx_flare_ember"] = {"file": "fx_flare_ember.png", "ppu": 32, "frames": 3, "fps": 10, "anchor": [6, 17], "shadow": 0,
                       "anims": {"idle": [0, 1, 2]}}
M["fx_spore_ring"] = {"file": "fx_spore_ring.png", "ppu": 32, "frames": 2, "fps": 6, "flat": True, "shadow": 0,
                      "anims": {"idle": [0, 1]}}

# 5. Workbench icons (DOM)
for rid in ("med_kit", "focusing_lens", "thorn_coating", "uplink", "overcharger", "serrated_edge", "balanced_grip",
            "heavy_spine", "reinforced_plating"):
    M[f"icon_craft_{rid}"] = {"file": f"icon_craft_{rid}.png", "ppu": 32, "shadow": 0}

# 6. plinths + rank badges
M.update(json.loads((PA / "plinths_v4" / "manifest_entries.json").read_text(encoding="utf8")))

# 7. splats (flat ground decals)
for fam in ("sap", "blood", "magenta", "acid"):
    for v in (1, 2):
        M[f"splat_{fam}_{v}"] = {"file": f"splat_{fam}_{v}.png", "ppu": 32, "flat": True, "shadow": 0}

out = PA / "manifest.v3batch4.json"
out.write_text(json.dumps(M, indent=2) + "\n", encoding="utf8")
print(f"{len(M)} keys -> {out}")

# patch the base boss entries in the PixelLab fragment (it sorts after this one)
envp = PA / "manifest.v3env.json"
env = json.loads(envp.read_text(encoding="utf8"))
n = 0
for k, e in boss.items():
    if not k.endswith("_p2") and k in env:
        env[k] = e
        n += 1
envp.write_text(json.dumps(env, indent=2) + "\n", encoding="utf8")
print(f"patched {n} boss entries in {envp.name}")
