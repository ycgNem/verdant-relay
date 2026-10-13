"""python zoom.py key [frame] [scale] -> pixel-art/<dir>/zoom_<key>.png (frame on checker + night)"""
import sys
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tw import SPRITES, checker, night, ground, on_bg, up
key = sys.argv[1]; fi = int(sys.argv[2]) if len(sys.argv) > 2 else 0
sc = int(sys.argv[3]) if len(sys.argv) > 3 else 12
d = sys.argv[4] if len(sys.argv) > 4 else key.rsplit('_', 1)[0] if key[-2:] in ('_2', '_3') else key
st = Image.open(SPRITES / f"{key}.png").convert("RGBA")
import json
man = json.loads((Path(__file__).resolve().parents[1] / d / "manifest_part.json").read_text()) if (Path(__file__).resolve().parents[1] / d / "manifest_part.json").exists() else {}
n = man.get(key, {}).get("frames", 1)
fw = st.width // n
f = st.crop((fi * fw, 0, fi * fw + fw, st.height))
out = Image.new("RGBA", (fw * sc * 2 + 6, st.height * sc), (50, 50, 60, 255))
out.paste(up(on_bg(f, checker(fw, st.height, 2)), sc), (0, 0))
out.paste(up(on_bg(night(f), ground(fw, st.height)), sc), (fw * sc + 6, 0))
p = Path(__file__).resolve().parents[1] / d / f"zoom_{key}_{fi}.png"
out.save(p); print(p)
