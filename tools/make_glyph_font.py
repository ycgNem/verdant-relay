# Builds src/ui/fonts/vr-glyphs.ttf: a tiny pixel font that overrides a few Tiny5 glyphs that read badly
# (critic F #15): "~" (Tiny5 draws a flat dash), "8" (a diagonal X-shape that reads as a theta), "4", and "9"
# (critic K2: its open top read as "3").
# style.css loads it with a unicode-range in front of Tiny5, so only these characters change.
#
# Metrics match Tiny5 (measured in the browser): 8-unit em (here 1 pixel = 100 units, unitsPerEm 800),
# ascent 7 px, descent 2 px, cap height 5 px, digits 3 px wide on a 4 px advance.
# Pure standard library (no fontTools): writes a minimal TrueType (glyf) font.
#
#   python tools/make_glyph_font.py

import struct, os

PX = 100
UPM = 800
ASC, DESC = 7 * PX, -2 * PX

# Glyph bitmaps: rows from the cap top (5 rows; row 4 sits on the baseline). '#' = ink.
GLYPHS = {
    '8': (4, ['###',
              '#.#',
              '###',
              '#.#',
              '###']),
    '4': (4, ['#.#',
              '#.#',
              '###',
              '..#',
              '..#']),
    # Tiny5's "9" (.#./#.#/.##/..#/##.) has an open top-left and reads as "3" at HUD size ("94" → "34" on the
    # Relay bar, critic K2 §4): a closed loop like the "8" above.
    '9': (4, ['###',
              '#.#',
              '###',
              '..#',
              '###']),
    '~': (5, ['....',
              '.#.#',
              '#.#.',
              '....',
              '....']),
}

# src/ui/fonts/vr-clock.ttf (critic G #10): the HUD clock is Silkscreen Bold, whose "4" is a filled block
# (.####/.####/.#####/...##/...##) that reads as a broken glyph. Same 8-unit em and baseline as Silkscreen,
# 2-texel stems like its bold "0" (.##.##), 7-unit advance with the 1-unit left bearing in the bitmap.
CLOCK_GLYPHS = {
    '4': (7, ['.##.##',
              '.##.##',
              '.#####',
              '....##',
              '....##']),
}


def rects(rows):
    """Horizontal runs of ink → rectangles (x0, y0, x1, y1) in font units (y up, baseline 0)."""
    out = []
    n = len(rows)
    for r, row in enumerate(rows):
        y0 = (n - 1 - r) * PX
        x = 0
        while x < len(row):
            if row[x] == '#':
                s = x
                while x < len(row) and row[x] == '#':
                    x += 1
                out.append((s * PX, y0, x * PX, y0 + PX))
            else:
                x += 1
    return out


def glyph_data(rs):
    if not rs:
        return b'', (0, 0, 0, 0), 0, 0
    pts, ends = [], []
    for (x0, y0, x1, y1) in rs:   # clockwise (TrueType outer contours)
        pts += [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
        ends.append(len(pts) - 1)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    d = struct.pack('>hhhhh', len(ends), *bbox)
    d += b''.join(struct.pack('>H', e) for e in ends)
    d += struct.pack('>H', 0)                    # no instructions
    d += bytes([0x01] * len(pts))                # on-curve, 16-bit deltas
    px = py = 0
    xd = yd = b''
    for (x, y) in pts:
        xd += struct.pack('>h', x - px); px = x
        yd += struct.pack('>h', y - py); py = y
    d += xd + yd
    while len(d) % 4:
        d += b'\0'
    return d, bbox, len(pts), len(ends)


def checksum(b):
    b = b + b'\0' * ((4 - len(b) % 4) % 4)
    return sum(struct.unpack('>%dI' % (len(b) // 4), b)) & 0xFFFFFFFF


def build(path, glyphs=GLYPHS, family='VR Glyphs'):
    order = ['.notdef'] + sorted(glyphs)          # glyph ids
    glyf, loca, hmtx = b'', [0], b''
    maxp_pts = maxp_cnt = 0
    gx0 = gy0 = 10 ** 6; gx1 = gy1 = -10 ** 6
    adv_max = 0
    for name in order:
        adv, rows = (4, []) if name == '.notdef' else glyphs[name]
        d, bb, npts, ncnt = glyph_data(rects(rows))
        glyf += d
        loca.append(len(glyf))
        hmtx += struct.pack('>Hh', adv * PX, bb[0])
        adv_max = max(adv_max, adv * PX)
        maxp_pts, maxp_cnt = max(maxp_pts, npts), max(maxp_cnt, ncnt)
        if d:
            gx0, gy0, gx1, gy1 = min(gx0, bb[0]), min(gy0, bb[1]), max(gx1, bb[2]), max(gy1, bb[3])
    n = len(order)

    head = struct.pack('>IIIIHHqqhhhhHHhhh', 0x00010000, 0x00010000, 0, 0x5F0F3CF5, 0x000B, UPM,
                       0, 0, gx0, gy0, gx1, gy1, 0, 8, 2, 1, 0)
    hhea = struct.pack('>IhhhHhhhhhhhhhhhH', 0x00010000, ASC, DESC, 0, adv_max, 0, 0, gx1, 1, 0, 0, 0, 0, 0, 0, 0, n)
    maxp = struct.pack('>IHHHHHHHHHHHHHH', 0x00010000, n, maxp_pts, maxp_cnt, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)
    os2 = struct.pack('>HhHHHhhhhhhhhhhh', 4, 400, 400, 5, 0, 300, 300, 0, 0, 300, 300, 0, 300, 50, 300, 0)
    os2 += bytes(10)                                         # panose
    os2 += struct.pack('>IIII', 1, 0, 0, 0)                  # unicode ranges (Basic Latin)
    os2 += b'VRLY'
    os2 += struct.pack('>HHH', 0x0040, 0x0034, 0x007E)        # fsSelection REGULAR, first/last char
    os2 += struct.pack('>hhhHH', ASC, DESC, 0, ASC, -DESC)    # typo asc/desc/gap, win asc/desc
    os2 += struct.pack('>II', 1, 0)                          # code page ranges (Latin 1)
    os2 += struct.pack('>hhHHH', 4 * PX, 5 * PX, 0, 0x20, 0)  # xHeight, capHeight, default/break char, maxContext
    # cmap format 4: one segment per code point + the 0xFFFF terminator.
    codes = sorted((ord(c), order.index(c)) for c in glyphs)
    segs = codes + [(0xFFFF, 0)]
    sc = len(segs)
    ends = b''.join(struct.pack('>H', c) for c, _ in segs)
    starts = b''.join(struct.pack('>H', c) for c, _ in segs)
    deltas = b''.join(struct.pack('>H', (g - c) & 0xFFFF) for c, g in segs[:-1]) + struct.pack('>H', 1)
    offs = bytes(2 * sc)
    sr = 2 * (2 ** (sc.bit_length() - 1))
    sub = struct.pack('>HHHHHHH', 4, 0, 0, sc * 2, sr, (sr // 2).bit_length() - 1, sc * 2 - sr)
    sub += ends + b'\0\0' + starts + deltas + offs
    sub = sub[:2] + struct.pack('>H', len(sub)) + sub[4:]
    cmap = struct.pack('>HHHHI', 0, 1, 3, 1, 12) + sub
    loca_b = b''.join(struct.pack('>I', o) for o in loca)
    ps = family.replace(' ', '')
    names = {1: family, 2: 'Regular', 3: f'{family} Regular 1.0', 4: f'{family} Regular', 5: 'Version 1.0', 6: f'{ps}-Regular'}
    strs, recs = b'', b''
    for nid, txt in names.items():
        e = txt.encode('utf-16-be')
        recs += struct.pack('>HHHHHH', 3, 1, 0x409, nid, len(e), len(strs))
        strs += e
    name = struct.pack('>HHH', 0, len(names), 6 + 12 * len(names)) + recs + strs
    post = struct.pack('>IIhhIIIII', 0x00030000, 0, -75, 50, 1, 0, 0, 0, 0)

    tables = {b'OS/2': os2, b'cmap': cmap, b'glyf': glyf, b'head': head, b'hhea': hhea,
              b'hmtx': hmtx, b'loca': loca_b, b'maxp': maxp, b'name': name, b'post': post}
    tags = sorted(tables)
    nt = len(tags)
    es = nt.bit_length() - 1
    out = struct.pack('>IHHHH', 0x00010000, nt, 16 * (2 ** es), es, nt * 16 - 16 * (2 ** es))
    off = 12 + 16 * nt
    body = b''
    for t in tags:
        d = tables[t]
        out += struct.pack('>4sIII', t, checksum(d), off + len(body), len(d))
        body += d + b'\0' * ((4 - len(d) % 4) % 4)
    font = bytearray(out + body)
    adj = (0xB1B0AFBA - checksum(bytes(font))) & 0xFFFFFFFF
    ho = off + sum(len(tables[t]) + (4 - len(tables[t]) % 4) % 4 for t in tags[:tags.index(b'head')])
    font[ho + 8:ho + 12] = struct.pack('>I', adj)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(bytes(font))
    print('wrote', path, len(font), 'bytes')


if __name__ == '__main__':
    fonts = os.path.join(os.path.dirname(__file__), '..', 'src', 'ui', 'fonts')
    build(os.path.join(fonts, 'vr-glyphs.ttf'))
    build(os.path.join(fonts, 'vr-clock.ttf'), CLOCK_GLYPHS, 'VR Clock')
