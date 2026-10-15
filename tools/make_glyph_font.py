# Builds src/ui/fonts/vr-glyphs.ttf: the UI body font, a pixel font on Tiny5's 8-unit grid and line box.
#   - Text (Stage 9, "make the text slightly easier to read"): all of printable ASCII. Tiny5 draws lowercase 3 px wide
#     and 4 tall with 1-px descenders (caps 5 tall), which at 16 px (×2 at 720p) is a 6 × 8-px "e". Here caps are 6
#     tall, the x-height 5, ascenders 6, descenders 2, and the common letters 4 wide on a 5-px advance (I has serifs,
#     so I / l / 1 / | all differ); word space 3. Text runs ~20% wider than Tiny5 at the same font-size; the line box
#     (ascent 7, descent 2) is Tiny5's, so line heights don't change. Tiny5 stays behind it as the fallback for
#     Latin-1 letters this font doesn't draw (none of the UI strings use one).
#   - Digits (critic M): 4 px wide on a 5-px advance, cap height ("1" is 3 wide), with "%", "/" and "+" to match.
#     (Tiny5's 3-wide digits blobbed: "88" read as two dominoes; "8" as a theta, the open "9" as "3": critic F #15, K2.)
#   - UI symbols (critic M, M2): arrows, triangles, diamonds, circles, stars, ticks, crosses, heart, zap, skull,
#     warning, gear, pause bar, leaf, umbrella, waves, sun, the dashes, minus, dots and times sign, and the skill /
#     unlock / recipe / tower icons. Without them the browser drew Consolas / Segoe UI Symbol: blurry vector glyphs at
#     the wrong weight and baseline. A character used in UI text that is not here falls back: add a bitmap below and
#     its code point to the unicode-range in src/ui/style.css (`npm run check:glyphs` catches both).
# style.css puts it first in the body stack (--font) with a unicode-range, then Tiny5; the label / display stacks
# keep Silkscreen first, so there only the symbols come from here.
#
# Metrics match Tiny5 (measured in the browser): 8-unit em (here 1 pixel = 100 units, unitsPerEm 800),
# ascent 7 px, descent 2 px. Cap height 6, x-height 5.
# Pure standard library (no fontTools): writes a minimal TrueType (glyf) font.
#
#   python tools/make_glyph_font.py

import struct, os

PX = 100
UPM = 800
ASC, DESC = 7 * PX, -2 * PX

# Glyph bitmaps: (advance, rows[, desc]). Rows from the top; the last row sits on the baseline, or with `desc` the last
# `desc` rows hang below it (g j p q y , ; | $). 6 rows = the cap height, 7 reaches the top of the ascent. '#' = ink;
# the advance includes the 1-px gap after the glyph.
# Symbols that sit at mid-height (dots, dashes) keep the full 5-row (x-height) frame so their height is explicit.
GLYPHS = {
    # ---- text: the whole of printable ASCII (Stage 9: Tiny5's 3 × 4 lowercase and 1-px descenders were too small to
    # read at 16 px). Caps 6 tall, x-height 5, ascenders 6 (i / j dots 7), descenders 2; letters mostly 4 wide on a
    # 5-px advance. Ink stays inside Tiny5's 9-unit line box (ascent 7, descent 2), so line heights don't move.
    'A': (5, ['.##.',
             '#..#',
             '#..#',
             '####',
             '#..#',
             '#..#']),
    'B': (5, ['###.',
             '#..#',
             '###.',
             '#..#',
             '#..#',
             '###.']),
    'C': (5, ['.##.',
             '#..#',
             '#...',
             '#...',
             '#..#',
             '.##.']),
    'D': (5, ['###.',
             '#..#',
             '#..#',
             '#..#',
             '#..#',
             '###.']),
    'E': (5, ['####',
             '#...',
             '###.',
             '#...',
             '#...',
             '####']),
    'F': (5, ['####',
             '#...',
             '###.',
             '#...',
             '#...',
             '#...']),
    'G': (5, ['.###',
             '#...',
             '#...',
             '#.##',
             '#..#',
             '.###']),
    'H': (5, ['#..#',
             '#..#',
             '####',
             '#..#',
             '#..#',
             '#..#']),
    'I': (4, ['###',
             '.#.',
             '.#.',
             '.#.',
             '.#.',
             '###']),
    'J': (5, ['...#',
             '...#',
             '...#',
             '...#',
             '#..#',
             '.##.']),
    'K': (5, ['#..#',
             '#.#.',
             '##..',
             '#.#.',
             '#..#',
             '#..#']),
    'L': (5, ['#...',
             '#...',
             '#...',
             '#...',
             '#...',
             '####']),
    'M': (6, ['#...#',
             '##.##',
             '#.#.#',
             '#...#',
             '#...#',
             '#...#']),
    'N': (5, ['#..#',
             '##.#',
             '#.##',
             '#..#',
             '#..#',
             '#..#']),
    'O': (6, ['.###.',   # 5 wide, so it never reads as the 4-wide "0"
              '#...#',
              '#...#',
              '#...#',
              '#...#',
              '.###.']),
    'P': (5, ['###.',
             '#..#',
             '#..#',
             '###.',
             '#...',
             '#...']),
    'Q': (6, ['.###.',
              '#...#',
              '#...#',
              '#...#',
              '#..#.',
              '.##.#']),
    'R': (5, ['###.',
             '#..#',
             '#..#',
             '###.',
             '#.#.',
             '#..#']),
    'S': (5, ['.###',
             '#...',
             '.##.',
             '...#',
             '...#',
             '###.']),
    'T': (4, ['###',
             '.#.',
             '.#.',
             '.#.',
             '.#.',
             '.#.']),
    'U': (5, ['#..#',
             '#..#',
             '#..#',
             '#..#',
             '#..#',
             '.##.']),
    'V': (4, ['#.#',
             '#.#',
             '#.#',
             '#.#',
             '.#.',
             '.#.']),
    'W': (6, ['#...#',
             '#...#',
             '#...#',
             '#.#.#',
             '##.##',
             '#...#']),
    'X': (4, ['#.#',
             '#.#',
             '.#.',
             '.#.',
             '#.#',
             '#.#']),
    'Y': (4, ['#.#',
             '#.#',
             '#.#',
             '.#.',
             '.#.',
             '.#.']),
    'Z': (5, ['####',
             '...#',
             '..#.',
             '.#..',
             '#...',
             '####']),
    'a': (5, ['.##.',
             '...#',
             '.###',
             '#..#',
             '.###']),
    'b': (5, ['#...',
             '###.',
             '#..#',
             '#..#',
             '#..#',
             '###.']),
    'c': (5, ['.###',
             '#...',
             '#...',
             '#...',
             '.###']),
    'd': (5, ['...#',
             '.###',
             '#..#',
             '#..#',
             '#..#',
             '.###']),
    'e': (5, ['.##.',
             '#..#',
             '####',
             '#...',
             '.###']),
    'f': (4, ['.##',
             '#..',
             '###',
             '#..',
             '#..',
             '#..']),
    'g': (5, ['.###',
             '#..#',
             '#..#',
             '#..#',
             '.###',
             '...#',
             '.##.'], 2),
    'h': (5, ['#...',
             '###.',
             '#..#',
             '#..#',
             '#..#',
             '#..#']),
    'i': (2, ['#',
             '.',
             '#',
             '#',
             '#',
             '#',
             '#']),
    'j': (3, ['.#',
             '..',
             '.#',
             '.#',
             '.#',
             '.#',
             '.#',
             '.#',
             '#.'], 2),
    'k': (5, ['#...',
             '#..#',
             '#.#.',
             '##..',
             '#.#.',
             '#..#']),
    'l': (2, ['#',
             '#',
             '#',
             '#',
             '#',
             '#']),
    'm': (6, ['####.',
             '#.#.#',
             '#.#.#',
             '#.#.#',
             '#.#.#']),
    'n': (5, ['###.',
             '#..#',
             '#..#',
             '#..#',
             '#..#']),
    'o': (5, ['.##.',
             '#..#',
             '#..#',
             '#..#',
             '.##.']),
    'p': (5, ['###.',
             '#..#',
             '#..#',
             '#..#',
             '###.',
             '#...',
             '#...'], 2),
    'q': (5, ['.###',
             '#..#',
             '#..#',
             '#..#',
             '.###',
             '...#',
             '...#'], 2),
    'r': (4, ['#.#',
             '##.',
             '#..',
             '#..',
             '#..']),
    's': (5, ['.###',
             '#...',
             '.##.',
             '...#',
             '###.']),
    't': (4, ['#..',
             '###',
             '#..',
             '#..',
             '#..',
             '.##']),
    'u': (5, ['#..#',
             '#..#',
             '#..#',
             '#..#',
             '.###']),
    'v': (4, ['#.#',
             '#.#',
             '#.#',
             '.#.',
             '.#.']),
    'w': (6, ['#...#',
             '#...#',
             '#.#.#',
             '#.#.#',
             '.#.#.']),
    'x': (5, ['#..#',
             '#..#',
             '.##.',
             '#..#',
             '#..#']),
    'y': (5, ['#..#',
             '#..#',
             '#..#',
             '#..#',
             '.###',
             '...#',
             '.##.'], 2),
    'z': (5, ['####',
             '...#',
             '.##.',
             '#...',
             '####']),
    # ---- digits: 4 wide on a 5-px advance (critic M: Tiny5's 3-wide "88" read as two dominoes), cap height
    '0': (5, ['.##.',
             '#..#',
             '#..#',
             '#..#',
             '#..#',
             '.##.']),
    '1': (5, ['..#.',
             '.##.',
             '..#.',
             '..#.',
             '..#.',
             '.###']),
    '2': (5, ['.##.',
             '#..#',
             '...#',
             '..#.',
             '.#..',
             '####']),
    '3': (5, ['###.',
             '...#',
             '.##.',
             '...#',
             '...#',
             '###.']),
    '4': (5, ['..#.',    # diagonal, closed top-left; the crossbar runs past the stem (critic Q: the open "4" read as "Ч")
              '.##.',
              '#.#.',
              '####',
              '..#.',
              '..#.']),
    '5': (5, ['####',
             '#...',
             '###.',
             '...#',
             '...#',
             '###.']),
    '6': (5, ['.##.',
             '#...',
             '###.',
             '#..#',
             '#..#',
             '.##.']),
    '7': (5, ['####',
             '...#',
             '..#.',
             '.#..',
             '.#..',
             '.#..']),
    '8': (5, ['.##.',
             '#..#',
             '.##.',
             '#..#',
             '#..#',
             '.##.']),
    '9': (5, ['.##.',
             '#..#',
             '#..#',
             '.###',
             '...#',
             '.##.']),
    '%': (6, ['##..#',
             '##.#.',
             '..#..',
             '..#..',
             '.#.##',
             '#..##']),
    '/': (5, ['...#',
             '...#',
             '..#.',
             '.#..',
             '#...',
             '#...']),
    '+': (4, ['...',
             '.#.',
             '###',
             '.#.',
             '...']),
    '~': (5, ['....',
             '.#.#',
             '#.#.',
             '....',
             '....']),
    # ---- ASCII punctuation (space 3: a clear word gap)
    ' ': (3, []),
    '!': (2, ['#',
             '#',
             '#',
             '#',
             '.',
             '#']),
    '"': (4, ['#.#',
             '#.#',
             '...',
             '...',
             '...',
             '...']),
    '#': (6, ['.#.#.',
             '#####',
             '.#.#.',
             '#####',
             '.#.#.']),
    '$': (5, ['..#.',
             '.###',
             '#.#.',
             '.##.',
             '..##',
             '###.',
             '..#.'], 1),
    '&': (5, ['.#..',
             '#.#.',
             '.#..',
             '#.##',
             '#..#',
             '.##.']),
    "'": (2, ['#',
             '#',
             '.',
             '.',
             '.',
             '.']),
    '(': (3, ['.#',
             '#.',
             '#.',
             '#.',
             '#.',
             '.#']),
    ')': (3, ['#.',
             '.#',
             '.#',
             '.#',
             '.#',
             '#.']),
    '*': (4, ['.#.',
             '###',
             '.#.',
             '#.#',
             '...',
             '...']),
    ',': (3, ['.#',
             '#.'], 1),
    '-': (4, ['...',
             '...',
             '###',
             '...',
             '...']),
    '.': (2, ['#']),
    ':': (2, ['#',
             '.',
             '.',
             '#']),
    ';': (3, ['.#',
             '..',
             '..',
             '.#',
             '#.'], 1),
    '<': (4, ['..#',
             '.#.',
             '#..',
             '.#.',
             '..#']),
    '=': (4, ['...',
             '###',
             '...',
             '###',
             '...']),
    '>': (4, ['#..',
             '.#.',
             '..#',
             '.#.',
             '#..']),
    '?': (5, ['.##.',
             '#..#',
             '...#',
             '..#.',
             '....',
             '..#.']),
    '@': (5, ['.##.',
             '#..#',
             '#.##',
             '#.##',
             '#...',
             '.###']),
    '[': (3, ['##',
             '#.',
             '#.',
             '#.',
             '#.',
             '##']),
    '\\': (4, ['#..',
              '#..',
              '.#.',
              '.#.',
              '..#',
              '..#']),
    ']': (3, ['##',
             '.#',
             '.#',
             '.#',
             '.#',
             '##']),
    '^': (4, ['.#.',
             '#.#',
             '...',
             '...',
             '...',
             '...']),
    '_': (4, ['###']),
    '`': (3, ['#.',
             '.#',
             '..',
             '..',
             '..',
             '..']),
    '{': (4, ['.##',
             '.#.',
             '#..',
             '.#.',
             '.#.',
             '.##']),
    '|': (2, ['#',
             '#',
             '#',
             '#',
             '#',
             '#',
             '#',
             '#'], 2),
    '}': (4, ['##.',
             '.#.',
             '..#',
             '.#.',
             '.#.',
             '##.']),
    '°': (4, ['.#.',
             '#.#',
             '.#.',
             '...',
             '...',
             '...']),
    # ---- punctuation Tiny5's web subset lacks (or draws off-grid)
    '·': (3, ['..',      # middle dot
                   '..',
                   '.#',
                   '..',
                   '..']),
    '•': (4, ['...',     # bullet
                   '.##',
                   '.##',
                   '...',
                   '...']),
    '×': (4, ['...',     # times
                   '#.#',
                   '.#.',
                   '#.#',
                   '...']),
    '−': (4, ['...',     # minus
                   '...',
                   '###',
                   '...',
                   '...']),
    '–': (5, ['....',    # en dash
                   '....',
                   '####',
                   '....',
                   '....']),
    '—': (7, ['......',  # em dash
                   '......',
                   '######',
                   '......',
                   '......']),
    '…': (6, ['.....',   # ellipsis
                   '.....',
                   '.....',
                   '.....',
                   '#.#.#']),
    # ---- arrows and pointers
    '→': (6, ['.....',   # right arrow
                   '...#.',
                   '#####',
                   '...#.',
                   '.....']),
    '▸': (4, ['#..',     # small right triangle
                   '##.',
                   '###',
                   '##.',
                   '#..']),
    '▶': (4, ['#..',     # right triangle
                   '##.',
                   '###',
                   '##.',
                   '#..']),
    '◂': (4, ['..#',     # small left triangle
                   '.##',
                   '###',
                   '.##',
                   '..#']),
    '◀': (4, ['..#',     # left triangle
                   '.##',
                   '###',
                   '.##',
                   '..#']),
    '▾': (6, ['.....',   # small down triangle
                   '#####',
                   '.###.',
                   '..#..',
                   '.....']),
    '▼': (6, ['.....',   # down triangle
                   '#####',
                   '.###.',
                   '..#..',
                   '.....']),
    '▴': (6, ['.....',   # small up triangle
                   '..#..',
                   '.###.',
                   '#####',
                   '.....']),
    '▲': (6, ['.....',   # up triangle
                   '..#..',
                   '.###.',
                   '#####',
                   '.....']),
    '➤': (6, ['#....',   # arrowhead
                   '###..',
                   '.####',
                   '###..',
                   '#....']),
    # ---- shapes
    '◆': (6, ['..#..',   # black diamond
                   '.###.',
                   '#####',
                   '.###.',
                   '..#..']),
    '◇': (6, ['..#..',   # white diamond
                   '.#.#.',
                   '#...#',
                   '.#.#.',
                   '..#..']),
    '◈': (6, ['..#..',   # diamond in diamond
                   '.#.#.',
                   '#.#.#',
                   '.#.#.',
                   '..#..']),
    '●': (6, ['.###.',   # black circle
                   '#####',
                   '#####',
                   '#####',
                   '.###.']),
    '○': (6, ['.###.',   # white circle
                   '#...#',
                   '#...#',
                   '#...#',
                   '.###.']),
    '■': (5, ['....',    # black square
                   '####',
                   '####',
                   '####',
                   '####']),
    '★': (6, ['..#..',   # black star
                   '..#..',
                   '#####',
                   '.###.',
                   '.#.#.']),
    '✶': (6, ['..#..',   # six-pointed star
                   '#.#.#',
                   '.###.',
                   '#.#.#',
                   '..#..']),
    # ---- marks
    '✓': (6, ['.....',   # check
                   '....#',
                   '...#.',
                   '#.#..',
                   '.#...']),
    '✔': (6, ['.....',   # heavy check
                   '....#',
                   '...#.',
                   '#.#..',
                   '.#...']),
    '✘': (6, ['#...#',   # heavy ballot x
                   '.#.#.',
                   '..#..',
                   '.#.#.',
                   '#...#']),
    '✗': (6, ['#...#',   # ballot x
                   '.#.#.',
                   '..#..',
                   '.#.#.',
                   '#...#']),
    '✚': (6, ['..#..',   # heavy cross
                   '..#..',
                   '#####',
                   '..#..',
                   '..#..']),
    '☐': (6, ['#####',   # ballot box
                   '#...#',
                   '#...#',
                   '#...#',
                   '#####']),
    # ---- icons
    '♥': (6, ['.#.#.',   # heart
                   '#####',
                   '#####',
                   '.###.',
                   '..#..']),
    'ϟ': (4, ['..#',     # koppa: the Relay's zap bolt
                   '.#.',
                   '###',
                   '.#.',
                   '#..']),
    '☠': (6, ['.###.',   # skull
                   '#.#.#',
                   '#####',
                   '.###.',
                   '.#.#.']),
    '⚠': (8, ['...#...', # warning: 7 rows (Tiny5's ascent), a solid triangle with the "!" cut out
                   '..###..',
                   '..#.#..',
                   '.##.##.',
                   '.#####.',
                   '###.###',
                   '#######']),
    '⚙': (6, ['.#.#.',   # gear
                   '#####',
                   '##.##',
                   '#####',
                   '.#.#.']),
    '❚': (3, ['##',      # heavy vertical bar (pause is two of them)
                   '##',
                   '##',
                   '##',
                   '##']),
    '❦': (6, ['...##',   # floral heart: a leaf
                   '.####',
                   '####.',
                   '.##..',
                   '#....']),
    '❧': (6, ['...##',   # rotated floral heart: a leaf
                   '.####',
                   '####.',
                   '.##..',
                   '#....']),
    '☂': (6, ['.###.',   # umbrella
                   '#####',
                   '..#..',
                   '..#..',
                   '.##..']),
    '≋': (6, ['.#..#',   # triple tilde (rain, fog): two waves
                   '#.##.',
                   '.....',
                   '.#..#',
                   '#.##.']),
    '☀': (6, ['#.#.#',   # sun
                   '.###.',
                   '#####',
                   '.###.',
                   '#.#.#']),
    # ---- skill / unlock / recipe / tower icons in src/data (critic M2 P1-5: they fell back to Segoe UI Symbol and
    # Cambria Math, smooth vector circles in the skill picker and the Codex). tools/check_glyphs.py keeps this list
    # complete: it fails when UI text uses a character neither Tiny5 nor this font draws.
    '§': (5, ['.###',    # section (7 rows: up into the ascent, like ⚠)
                   '#...',
                   '.##.',
                   '#..#',
                   '.##.',
                   '...#',
                   '###.']),
    '½': (6, ['#...#',   # one half
                   '#..#.',
                   '#.#..',
                   '.#.##',
                   '#...#',
                   '...#.',
                   '..###']),
    '⁘': (6, ['..#..',   # four dots
                   '.....',
                   '#...#',
                   '.....',
                   '..#..']),
    '↻': (6, ['.##.#',   # clockwise open circle arrow
                   '#..##',
                   '#.###',
                   '#...#',
                   '.###.']),
    '⟳': (6, ['.##.#',   # clockwise gapped circle arrow
                   '#..##',
                   '#.###',
                   '#...#',
                   '.###.']),
    '⟲': (6, ['#.##.',   # anticlockwise gapped circle arrow
                   '##..#',
                   '###.#',
                   '#...#',
                   '.###.']),
    '⇄': (6, ['...#.',   # right arrow over left arrow
                   '#####',
                   '.....',
                   '#####',
                   '.#...']),
    '⊚': (6, ['.###.',   # circled ring
                   '#...#',
                   '#.#.#',
                   '#...#',
                   '.###.']),
    '◎': (6, ['.###.',   # bullseye
                   '#...#',
                   '#.#.#',
                   '#...#',
                   '.###.']),
    '◉': (6, ['.###.',   # fisheye
                   '#...#',
                   '#.#.#',
                   '#...#',
                   '.###.']),
    '⦿': (6, ['.###.',   # circled bullet
                   '#...#',
                   '#.#.#',
                   '#...#',
                   '.###.']),
    '◍': (6, ['.###.',   # circle with vertical fill
                   '#.#.#',
                   '#.#.#',
                   '#.#.#',
                   '.###.']),
    '⌁': (5, ['...#',    # electric arrow (a bolt)
                   '..#.',
                   '####',
                   '.#..',
                   '#...']),
    '⌖': (6, ['..#..',   # position indicator (crosshair)
                   '.#.#.',
                   '##.##',
                   '.#.#.',
                   '..#..']),
    '⏱': (6, ['..#..',   # stopwatch
                   '.###.',
                   '#.#.#',
                   '#.###',
                   '.###.']),
    '▣': (6, ['#####',   # square with a square inside
                   '#...#',
                   '#.#.#',
                   '#...#',
                   '#####']),
    '▦': (6, ['#####',   # square with a grid
                   '#.#.#',
                   '#####',
                   '#.#.#',
                   '#####']),
    '◫': (6, ['#####',   # square, vertical bisector
                   '#.#.#',
                   '#.#.#',
                   '#.#.#',
                   '#####']),
    '◣': (6, ['#....',   # lower-left triangle
                   '##...',
                   '###..',
                   '####.',
                   '#####']),
    '♁': (6, ['.###.',   # earth: a globe on a cross
                   '#...#',
                   '.###.',
                   '..#..',
                   '.###.']),
    '♛': (6, ['#.#.#',   # crown
                   '#.#.#',
                   '#####',
                   '#####',
                   '.....']),
    '♣': (6, ['..#..',   # club
                   '.###.',
                   '#####',
                   '#.#.#',
                   '..#..']),
    '⚑': (6, ['####.',   # flag
                   '#.###',
                   '####.',
                   '#....',
                   '#....']),
    '⚒': (6, ['#####',   # hammer
                   '#####',
                   '..#..',
                   '..#..',
                   '..#..']),
    '⚔': (8, ['#.....#', # crossed swords (7 rows: up into the ascent)
                   '.#...#.',
                   '..#.#..',
                   '...#...',
                   '..#.#..',
                   '##...##',
                   '##...##']),
    '⛨': (6, ['#####',   # shield with a cross
                   '##.##',
                   '#...#',
                   '.#.#.',
                   '..#..']),
    '✂': (6, ['#...#',   # scissors
                   '.#.#.',
                   '..#..',
                   '##.##',
                   '##.##']),
    '✉': (6, ['#####',   # envelope
                   '##.##',
                   '#.#.#',
                   '#...#',
                   '#####']),
    '✎': (6, ['...##',   # pencil
                   '..###',
                   '.###.',
                   '###..',
                   '#....']),
    '✦': (8, ['...#...', # four-pointed star (7 rows, so it is not the ◆ diamond)
                   '...#...',
                   '..###..',
                   '#######',
                   '..###..',
                   '...#...',
                   '...#...']),
    '✹': (6, ['#.#.#',   # twelve-pointed star (a burst)
                   '.###.',
                   '#####',
                   '.###.',
                   '#.#.#']),
    '❄': (6, ['#.#.#',   # snowflake
                   '.###.',
                   '##.##',
                   '.###.',
                   '#.#.#']),
    '➶': (6, ['..###',   # arrow up and right (a thrown blade)
                   '...##',
                   '..#.#',
                   '.#...',
                   '#....']),
    '🔒': (6, ['.###.',  # lock (outside the BMP: cmap format 12)
                   '#...#',
                   '#####',
                   '##.##',
                   '##.##',
                   '#####']),
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


def rects(rows, desc=0):
    """Horizontal runs of ink → rectangles (x0, y0, x1, y1) in font units (y up, baseline 0)."""
    out = []
    n = len(rows)
    for r, row in enumerate(rows):
        y0 = (n - 1 - r - desc) * PX
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
        g = (4, []) if name == '.notdef' else glyphs[name]
        adv, rows, desc = g[0], g[1], (g[2] if len(g) > 2 else 0)
        d, bb, npts, ncnt = glyph_data(rects(rows, desc))
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
    cps = [ord(c) for c in glyphs]
    os2 += struct.pack('>HHH', 0x0040, min(cps), min(max(cps), 0xFFFF))   # fsSelection REGULAR, first/last char
    os2 += struct.pack('>hhhHH', ASC, DESC, 0, ASC, -DESC)    # typo asc/desc/gap, win asc/desc
    os2 += struct.pack('>II', 1, 0)                          # code page ranges (Latin 1)
    os2 += struct.pack('>hhHHH', 5 * PX, 6 * PX, 0, 0x20, 0)  # xHeight, capHeight, default/break char, maxContext
    # cmap format 4: one segment per code point + the 0xFFFF terminator.
    allcodes = sorted((ord(c), order.index(c)) for c in glyphs)
    codes = [cg for cg in allcodes if cg[0] < 0xFFFF]   # format 4 is BMP-only; format 12 (below) has them all
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
    if len(codes) == len(allcodes):
        cmap = struct.pack('>HHHHI', 0, 1, 3, 1, 12) + sub
    else:
        # Code points beyond the BMP (🔒): a (3, 10) format-12 subtable (one group per code point) beside format 4.
        sub12 = struct.pack('>HHIII', 12, 0, 16 + 12 * len(allcodes), 0, len(allcodes))
        sub12 += b''.join(struct.pack('>III', c, c, g) for c, g in allcodes)
        cmap = struct.pack('>HH', 0, 2) + struct.pack('>HHI', 3, 1, 4 + 16) + struct.pack('>HHI', 3, 10, 4 + 16 + len(sub)) + sub + sub12
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
