"""Copy the chosen raw PixelLab Wang sheets (untouched) + metadata into public/terrain and write manifest.json."""
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "public" / "terrain"
OUT.mkdir(exist_ok=True)
CHOSEN = {  # set: (raw basename, lower level, upper level)
    "water_mud":    ("water_mud_v2", "water", "mud"),
    "mud_dirt":     ("mud_dirt", "mud", "dirt"),
    "dirt_floor":   ("dirt_floor_v3", "dirt", "floor"),
    "floor_moss":   ("floor_moss_v2", "floor", "moss"),
    "paving_floor": ("paving_floor_v2", "paving", "floor"),
}
sets = {}
for name, (raw, lo, up) in CHOSEN.items():
    shutil.copyfile(HERE / "raw" / f"{raw}.png", OUT / f"{name}.png")
    shutil.copyfile(HERE / "raw" / f"{raw}.json", OUT / f"{name}.json")
    sets[name] = {"png": f"{name}.png", "meta": f"{name}.json", "lower": lo, "upper": up}
manifest = {"tileSize": 32, "levels": ["water", "mud", "dirt", "floor", "moss"], "sets": sets}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest, indent=1))
