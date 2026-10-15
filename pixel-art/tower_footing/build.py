"""Night board: the footing under a built tower (Stage 9 "build anywhere", replaces the build-pad plinths).

A flat ground decal in the plinths' format (top face seen from above, a short front face below it), but low and
round: a ring of fitted field stones around a disc of tamped earth, so a tower reads as BUILT on cleared ground
rather than standing on a pre-placed platform. The front stones carry a 4-row face where the rank badge
(rank_badge_2 / _3, 13 / 19 x 5) sits.
  tower_footing   40x24   the "top" box (the earth disc + stones, seen from above) is centred on the tower's tile
Hard alpha, ppu 32, light from the top-left, hue-shifted ramps (shadows cool, lights warm), 1-px dark outline.
Run: python pixel-art/tower_footing/build.py   (then python pixel-art/merge_manifest.py)
"""
import json
import math
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SPRITES = ROOT / "public" / "sprites"

W, H = 40, 24
CX, CY, RX, RY = 19.5, 9.5, 18.6, 9.0     # top ellipse (the footing seen from above)
FACE = 4                                   # rows of front face under the lower rim

STONE = ["#1c1d22", "#2c2e34", "#42444a", "#5a5c5c", "#73746c", "#8e8e80", "#adab96"]
EARTH = ["#1a1210", "#2a1e18", "#3c2c22", "#4e3a2c", "#604834", "#72583e"]
MOSS = ["#1a2c1e", "#2b4527", "#416431"]
INK = "#0c0b0e"


def h2(x, y, s):
    n = (x * 374761393 + y * 668265263 + s * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def tone(r, t):
    return r[max(0, min(len(r) - 1, int(math.floor(t + 0.5))))]


def build():
    px = {}

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            px[(x, y)] = c

    # Stones: points around the rim, each a little rounded block; the gaps between them are earth.
    n = 13
    stones = []
    for i in range(n):
        a = (i + 0.5) / n * math.tau + (h2(i, 1, 5) - 0.5) * 0.18
        stones.append((a, 3.4 + h2(i, 2, 5) * 1.0))
    def stone_at(x, y):
        dx, dy = (x + 0.5 - CX) / RX, (y + 0.5 - CY) / RY
        r = math.hypot(dx, dy)
        if r > 1.0 or r < 0.70:
            return None
        a = math.atan2(dy, dx) % math.tau
        best = None
        for i, (sa, _) in enumerate(stones):
            d = abs((a - sa + math.pi) % math.tau - math.pi)
            if best is None or d < best[0]:
                best = (d, i)
        d, i = best
        half = math.pi / n
        # a joint between stones (dark), widest at the outer rim
        if d > half * 0.74:
            return ("joint", i, r)
        return ("stone", i, r, d / half)

    def rr_ok(x, y):
        dx, dy = (x + 0.5 - CX) / RX, (y + 0.5 - CY) / RY
        return math.hypot(dx, dy) > 0.76

    # top face
    for y in range(H):
        for x in range(W):
            dx, dy = (x + 0.5 - CX) / RX, (y + 0.5 - CY) / RY
            r = math.hypot(dx, dy)
            if r > 1.0:
                continue
            s = stone_at(x, y)
            if s is None:
                # tamped earth: darker toward the middle (where the tower stands), a few pebbles
                t = 3.3 - (1 - r) * 1.2 + (h2(x, y, 9) - 0.5) * 0.7
                if h2(x, y, 3) < 0.05:
                    t += 1.2
                put(x, y, tone(EARTH, t))
            elif s[0] == "joint":
                put(x, y, tone(STONE, 0.6) if rr_ok(x, y) else tone(EARTH, 1.2))
            else:
                _, i, rr, edge = s
                # lit from the top-left: the stone's own normal ~ outward on the rim + a bevel at its edges
                light = -(dx * 0.55 + dy * 0.85)
                t = 3.3 + (h2(i, 7, 5) - 0.5) * 1.2 + light * 1.6 + (h2(x, y, 11 + i) - 0.5) * 0.7 + (0.7 if rr > 0.92 and dy < 0 else 0)
                if edge > 0.62:
                    t -= 0.7
                if rr < 0.74:
                    t -= 0.8                                  # inner lip in shade
                put(x, y, tone(STONE, t))
    # front face: below the lower rim (the stones' height)
    for x in range(W):
        col = [y for (xx, y) in px if xx == x]
        if not col:
            continue
        yb = max(col)
        dx = (x + 0.5 - CX) / RX
        if abs(dx) > 0.97:
            continue
        face = FACE - (1 if abs(dx) > 0.85 else 0)
        s = stone_at(x, yb)
        joint = s is not None and s[0] == "joint"
        for k in range(1, face + 1):
            t = 2.5 - k * 0.4 + (h2(x, yb + k, 21) - 0.5) * 0.6
            if joint:
                t -= 1.3
            put(x, yb + k, tone(STONE, t))
    # moss in the joints and on the shady lower-left stones
    for k in range(18):
        x = int(h2(k, 1, 31) * W)
        y = int(h2(k, 2, 31) * H)
        if (x, y) in px and px[(x, y)] in STONE[:4] and h2(x, y, 33) < 0.8:
            put(x, y, MOSS[int(h2(k, 3, 31) * 3)])
    # outline
    mask = set(px)
    for (x, y) in list(mask):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in mask and 0 <= q[0] < W and 0 <= q[1] < H:
                px[q] = INK
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for (x, y), c in px.items():
        im.putpixel((x, y), tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    top = [int(CX - RX + 0.5), int(CY - RY + 0.5), int(CX + RX - 0.5), int(CY + RY - 0.5)]
    return im, top


def main():
    im, top = build()
    im.save(SPRITES / "tower_footing.png")
    entries = {"tower_footing": {"file": "tower_footing.png", "ppu": 32, "flat": True, "shadow": 0, "top": top}}
    (ROOT / "pixel-art" / "manifest.night9.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf8")
    # review sheet: x8 alone, and x4 with a tower + rank badge standing on it
    im.resize((W * 8, H * 8), Image.NEAREST).save(HERE / "tower_footing_x8.png")
    tw = Image.open(SPRITES / "scrap_turret_2.png").convert("RGBA").crop((0, 0, 48, 64))
    badge = Image.open(SPRITES / "rank_badge_2.png").convert("RGBA")
    sheet = Image.new("RGBA", (72, 84), (52, 70, 44, 255))
    ox, oy = 16, 56
    sheet.alpha_composite(im, (ox, oy))
    cx, cy = ox + (top[0] + top[2] + 1) // 2, oy + (top[1] + top[3] + 1) // 2
    sheet.alpha_composite(tw, (cx - 24, cy - 64 + 4))
    sheet.alpha_composite(badge, (cx - badge.width // 2, oy + top[3] + 1))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(HERE / "tower_footing_preview.png")
    print("tower_footing", im.size, "top", top)


if __name__ == "__main__":
    main()
