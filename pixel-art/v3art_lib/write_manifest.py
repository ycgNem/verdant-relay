"""Write pixel-art/manifest.v3art.json (the V3 hand-made batch), then run merge_manifest.py yourself.

Run: python pixel-art/v3art_lib/write_manifest.py && python pixel-art/merge_manifest.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

M = {}
# foreground leaf frame (screen-space overlay, PostFx): "anchor" = the texel that sits on the screen edge/corner
for key, anchor in (("fg_leaf_1", [0, 127]), ("fg_leaf_2", [0, 0]), ("fg_leaf_3", [74, 159]),
                    ("fg_leaf_4", [127, 111]), ("fg_leaf_5", [24, 0])):
    M[key] = {"file": f"{key}.png", "ppu": 32, "shadow": 0, "anchor": anchor}
# water decals (flat, centred on the feet)
M["fx_ripple"] = {"file": "fx_ripple.png", "ppu": 32, "frames": 3, "fps": 6, "anims": {"idle": [0, 1, 2]},
                  "flat": True, "shadow": 0}
M["fx_splash"] = {"file": "fx_splash.png", "ppu": 32, "frames": 4, "fps": 12, "anims": {"idle": [0, 1, 2, 3]},
                  "flat": True, "shadow": 0}
# spore pod + gas puffs
M["spore_pod"] = {"file": "spore_pod.png", "ppu": 32, "frames": 4, "fps": 3, "anchor": [10, 19],
                  "anims": {"idle": [0, 1], "swell": [2, 3]}, "animFps": {"swell": 8}, "shadow": 0.3}
for i in (1, 2, 3):
    M[f"spore_puff_{i}"] = {"file": f"spore_puff_{i}.png", "ppu": 32, "shadow": 0, "anchor": [16, 12]}
# UI (DOM only; listed so iconEl / iconStyle can size them)
M["ui_logo"] = {"file": "ui_logo.png", "ppu": 32, "shadow": 0}
M["ui_panel_frame"] = {"file": "ui_panel_frame.png", "ppu": 32, "shadow": 0}
for key in ("icon_parang", "icon_wide_choice", "icon_scarf", "icon_arc", "icon_salvage", "icon_flare", "icon_map",
            "icon_swap", "icon_notes", "icon_scout", "icon_reroll", "icon_archivist", "icon_sap_cannon",
            "icon_lure_totem", "icon_bramble_wall", "icon_beacon", "icon_district_overgrown_market", "icon_district_flooded_transit",
            "icon_district_canopy_greenhouse", "icon_district_collapsed_residential", "icon_district_data_center",
            "icon_lock", "icon_protocol_snare", "icon_protocol_arc", "icon_protocol_flare"):
    M[key] = {"file": f"{key}.png", "ppu": 32, "shadow": 0}

out = ROOT / "pixel-art" / "manifest.v3art.json"
out.write_text(json.dumps(M, indent=2) + "\n", encoding="utf8")
print(f"{len(M)} keys -> {out}")
