"""Collect the v3 entries (pixellab_v3/entries/*.json, written by the build scripts) into
pixel-art/manifest.v3env.json, then run `python pixel-art/merge_manifest.py`.

relay_core and prop_relay_pylon are redefined here on purpose: manifest.v3env.json sorts after the towers / v2env
fragments, so these entries win (merge_manifest prints a 'defined twice' warning for them).
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
out = {}
for f in sorted((HERE / "entries").glob("*.json")):
    out.update(json.loads(f.read_text()))
(HERE.parent / "manifest.v3env.json").write_text(json.dumps(dict(sorted(out.items())), indent=2) + "\n")
print(len(out), "entries ->", HERE.parent / "manifest.v3env.json")
