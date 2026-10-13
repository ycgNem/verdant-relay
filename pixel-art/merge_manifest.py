"""Merge pixel-art/manifest.<group>.json fragments into public/sprites/manifest.json.

Run from anywhere:  python pixel-art/merge_manifest.py
Entries whose PNG is missing from public/sprites/ are skipped (with a warning).
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / "public" / "sprites" / "manifest.json"
sprites = root / "public" / "sprites"
merged = {}
for frag in sorted((root / "pixel-art").glob("manifest.*.json")):
    data = json.loads(frag.read_text(encoding="utf8"))
    for key, entry in data.items():
        if not (sprites / entry["file"]).exists():
            print(f"skip {key}: {entry['file']} missing")
            continue
        if key in merged:
            print(f"warning: {key} defined twice (latest from {frag.name})")
        merged[key] = entry
out.write_text(json.dumps(dict(sorted(merged.items())), indent=2) + "\n", encoding="utf8")
print(f"{len(merged)} sprites -> {out}")
