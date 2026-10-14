"""Creature toolkit for the V3 night-creature repaint (V2 PixelLab look, drawn by hand in code).

A creature is a list of parts drawn back to front (ellipsoids, tapered limbs, bevelled plates). Each part is shaded
from its own surface normal with the light from the top-left onto a 6-tone hue-shifted ramp, then broken up with
blotchy tone noise. After all parts are down:
  - ambient occlusion: texels of a part right next to a part drawn in front of it drop a tone (overlaps read),
  - selective outline: 1-px outline outside the silhouette - the darkest step of the touching part's ramp on the lit
    (top / left) side, near-black ink on the shadow side.
Hard alpha, ppu 32, side view facing RIGHT (the game flips them).
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3art_lib"))
sys.path.insert(0, str(HERE.parent / "towers_v3"))
from v3lib import Grid, Shape, stroke_poly, save_sprite, strip, SCRATCH, SPRITES  # noqa: E402,F401
from tlib import h2, vnoise  # noqa: E402

INK = "#0c080a"
L = (-0.55, -0.5, 0.67)
_n = math.sqrt(sum(c * c for c in L))
L = tuple(c / _n for c in L)

# ---- hue-shifted 6-tone ramps (dark -> light): shadows lean cool/violet, lights lean warm
HUSK = ["#1a1216", "#33231f", "#523726", "#76542f", "#9b7a3f", "#c3a35c"]
CHITIN = ["#140c12", "#26171e", "#3d2830", "#5a3f3e", "#7c5c50", "#a08068"]
MOSSY = ["#0e1814", "#1a2c1e", "#2b4527", "#416431", "#5f853d", "#87a64e"]
STONE = ["#15161c", "#262830", "#3c3e44", "#585a5a", "#7a7b74", "#a3a294"]
RUSTR = ["#1c0e0e", "#3a1a14", "#5e2c1a", "#874622", "#ad6630", "#cf9050"]
HIDE = ["#1e1018", "#3c2028", "#643a3a", "#8f5c4e", "#b88166", "#dcae8c"]
STEELR = ["#101418", "#22282e", "#3a434a", "#5a666a", "#83908e", "#b8c2b8"]
SEEDO = ["#2a0e08", "#58200c", "#8e4212", "#c87420", "#f0a838", "#ffd878"]
LEAF = ["#0c1a10", "#173018", "#25491f", "#386a28", "#56903a", "#86b856"]
AMBERG = ["#4a2208", "#8a4510", "#c8701c", "#f0a030", "#ffd070", "#fff2c0"]
CYANG = ["#06202c", "#0a4058", "#0a7896", "#1ec0dc", "#80f0ff", "#e8ffff"]
DIRT = ["#140e0c", "#2a1e18", "#45322a", "#64493a", "#856650", "#a68668"]


def tone(ramp, t):
    return ramp[max(0, min(len(ramp) - 1, int(math.floor(t + 0.5))))]


class Rig:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.parts = []          # (pixels {(x,y): tone}, ramp, flags)

    # ---------------------------------------------------------------- parts
    def _grime(self, x, y, t, grime, seed):
        if grime:
            n = vnoise(x, y, 2.4, seed)
            if n > 1 - grime * 0.5:
                t -= 1.0
            elif n < grime * 0.22:
                t += 0.8
            if h2(x, y, seed + 7) < grime * 0.07:
                t -= 1.0
        return t

    def ell(self, cx, cy, rx, ry, ramp, base=2.5, gain=2.3, grime=0.3, seed=0, spec=None, clip=None, flat=0.0, tex=None,
            glow=False, ao=True):
        """Ellipsoid. `flat` squashes the normal toward the viewer (flatter shading); `clip(x, y)` -> bool keeps texels;
        `tex(x, y, nx, ny)` -> tone delta; `spec` = d threshold above which the top tone shows."""
        px = {}
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                d2 = dx * dx + dy * dy
                if d2 > 1 or (clip and not clip(x, y)):
                    continue
                nz = math.sqrt(1 - d2) + flat
                nl = math.sqrt(dx * dx + dy * dy + nz * nz)
                d = (L[0] * dx + L[1] * dy + L[2] * nz) / nl
                t = base + gain * d
                if tex:
                    t += tex(x, y, dx, dy)
                t = self._grime(x, y, t, grime, seed)
                if spec is not None and d > spec:
                    t = len(ramp) - 1
                px[(x, y)] = t
        self.parts.append((px, ramp, {"glow": glow, "ao": ao}))
        return px

    def limb(self, pts, w0, w1, ramp, base=2.4, gain=2.0, grime=0.2, seed=0, ao=True, glow=False):
        """Tapered limb / tube along pts, shaded across its width (cylinder)."""
        poly = stroke_poly(pts, w0, w1, cap=True)
        m = Shape(self.w, self.h).add(poly).mask()
        px = {}
        n = len(pts)
        for (x, y) in m:
            best, bi = 1e9, 0
            for i, p in enumerate(pts):
                dd = (p[0] - x - 0.5) ** 2 + (p[1] - y - 0.5) ** 2
                if dd < best:
                    best, bi = dd, i
            a = pts[max(0, bi - 1)]
            b = pts[min(n - 1, bi + 1)]
            tx, ty = b[0] - a[0], b[1] - a[1]
            tl = math.hypot(tx, ty) or 1
            nx, ny = -ty / tl, tx / tl
            off = (x + 0.5 - pts[bi][0]) * nx + (y + 0.5 - pts[bi][1]) * ny
            half = max(0.6, (w0 + (w1 - w0) * bi / max(1, n - 1)) / 2)
            s = max(-1.0, min(1.0, off / half))
            nz = math.sqrt(max(0.0, 1 - s * s))
            d = L[0] * nx * s + L[1] * ny * s + L[2] * nz
            t = self._grime(x, y, base + gain * d, grime, seed)
            px[(x, y)] = t
        self.parts.append((px, ramp, {"glow": glow, "ao": ao}))
        return px

    def plate(self, pts, ramp, base=2.6, gain=1.6, grime=0.3, seed=0, bevel=1.5, normal=(0.0, -0.3), ao=True, glow=False):
        """A flat plate (polygon) facing `normal` (x, y tilt), with a lit bevel on its top-left edges and a dark one
        on its bottom-right edges `bevel` texels wide."""
        m = Shape(self.w, self.h).add(pts).mask()
        px = {}
        nx, ny = normal
        nz = math.sqrt(max(0.05, 1 - nx * nx - ny * ny))
        d0 = L[0] * nx + L[1] * ny + L[2] * nz
        for (x, y) in m:
            t = base + gain * (d0 - 0.5)
            ul = sum(1 for k in range(1, int(bevel) + 1) if (x - k, y) not in m or (x, y - k) not in m)
            dr = sum(1 for k in range(1, int(bevel) + 1) if (x + k, y) not in m or (x, y + k) not in m)
            if ul and not dr:
                t += 1.0
            elif dr and not ul:
                t -= 1.0
            px[(x, y)] = self._grime(x, y, t, grime, seed)
        self.parts.append((px, ramp, {"glow": glow, "ao": ao}))
        return px

    def pixels(self, pts, ramp, t, glow=True, ao=False):
        """Hand-placed texels (eyes, glints, cracks): pts = [(x, y)] or [(x, y, tone)]."""
        px = {}
        for p in pts:
            px[(int(p[0]), int(p[1]))] = p[2] if len(p) > 2 else t
        self.parts.append((px, ramp, {"glow": glow, "ao": ao}))
        return px

    # ---------------------------------------------------------------- render
    def render(self, outline=True, ao=True):
        owner = {}
        tones = {}
        for i, (px, ramp, fl) in enumerate(self.parts):
            for p, t in px.items():
                if 0 <= p[0] < self.w and 0 <= p[1] < self.h:
                    owner[p] = i
                    tones[p] = t
        if ao:
            adj = {}
            for p, i in owner.items():
                if not self.parts[i][2]["ao"]:
                    continue
                x, y = p
                for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    j = owner.get(q)
                    if j is not None and j > i and not self.parts[j][2]["glow"]:
                        adj[p] = 1
                        break
            for p in adj:
                tones[p] -= 1.2
        g = Grid(self.w, self.h)
        for p, i in owner.items():
            ramp = self.parts[i][1]
            g.px(p[0], p[1], tone(ramp, tones[p]))
        if outline:
            out = {}
            for y in range(self.h):
                for x in range(self.w):
                    if (x, y) in owner:
                        continue
                    lit_nb = None
                    dark_nb = False
                    for (dx, dy) in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                        q = (x + dx, y + dy)
                        if q in owner:
                            if dx > 0 or dy > 0:              # the shape is to the right / below: we're on its lit side
                                lit_nb = owner[q]
                            else:
                                dark_nb = True
                    if lit_nb is not None and not dark_nb:
                        out[(x, y)] = self.parts[lit_nb][1][0] if not self.parts[lit_nb][2]["glow"] else INK
                    elif lit_nb is not None or dark_nb:
                        out[(x, y)] = INK
            for (x, y), c in out.items():
                g.px(x, y, c)
        return g


def frames_strip(frames):
    return strip(frames)


def sheet(rows, path, scale=4, bg=(52, 58, 50, 255), ref="v2_crawler.png", ref_crop=(0, 7 * 53, 64, 8 * 53)):
    """Review sheet: every frame x`scale`, then frame 0 at 1x beside a V2 crawler frame for scale."""
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.load_default()
    refim = Image.open(SPRITES / ref).convert("RGBA").crop(ref_crop)
    pad = 8
    W = max(im.width * scale + im.height * 0 + 200 for _, im, _ in rows)
    W = max(W, 800)
    H = sum(im.height * scale + pad * 2 + 12 for _, im, _ in rows)
    out = Image.new("RGBA", (W + 200, H), (24, 24, 30, 255))
    d = ImageDraw.Draw(out)
    y = 0
    for key, im, fw in rows:
        d.text((pad, y + 2), key, fill=(230, 226, 200, 255), font=font)
        cell = Image.new("RGBA", im.size, bg)
        cell.alpha_composite(im)
        big = cell.resize((im.width * scale, im.height * scale), Image.NEAREST)
        out.alpha_composite(big, (pad, y + 14))
        for k in range(1, im.width // fw):
            d.line((pad + k * fw * scale, y + 14, pad + k * fw * scale, y + 14 + im.height * scale), fill=(24, 24, 30, 255))
        x = pad + big.width + pad
        g = Image.new("RGBA", (fw + refim.width + 4, max(im.height, refim.height)), (40, 44, 38, 255))
        g.alpha_composite(im.crop((0, 0, fw, im.height)), (0, g.height - im.height))
        g.alpha_composite(refim, (fw + 4, g.height - refim.height))
        out.alpha_composite(g.resize((g.width * 2, g.height * 2), Image.NEAREST), (x, y + 14))
        y += im.height * scale + pad * 2 + 12
    out.save(path)


def cells(x, y, size=5.0, seed=0, crack=0.9, var=0.45):
    """Cellular plate texture (bark / shell plates): a tone delta per plate, dark cracks between plates."""
    gx, gy = x / size, y / size
    ix, iy = math.floor(gx), math.floor(gy)
    best = [(9e9, 0), (9e9, 0)]
    for j in range(-1, 2):
        for i in range(-1, 2):
            cx_, cy_ = ix + i, iy + j
            fx = cx_ + 0.15 + 0.7 * h2(cx_, cy_, seed)
            fy = cy_ + 0.15 + 0.7 * h2(cx_, cy_, seed + 1)
            d = (gx - fx) ** 2 + (gy - fy) ** 2
            idd = cx_ * 7919 + cy_
            if d < best[0][0]:
                best = [(d, idd), best[0]]
            elif d < best[1][0]:
                best[1] = (d, idd)
    d1, d2 = math.sqrt(best[0][0]), math.sqrt(best[1][0])
    if (d2 - d1) * size < crack:
        return -1.6
    return (h2(best[0][1], 3, seed + 2) - 0.5) * 2 * var + (0.5 if (d2 - d1) * size < crack + 1.0 and (x + y) % 2 == 0 else 0)
