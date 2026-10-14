# Build check (critic M2 P1-5): every non-ASCII character that UI text can show must be drawn on the pixel grid,
# by Tiny5 itself or by src/ui/fonts/vr-glyphs.ttf (tools/make_glyph_font.py + the unicode-range in style.css).
# A character in neither falls back to a blurry system font (Segoe UI Symbol, Cambria Math) at the wrong size.
#
# Scans the string literals (not comments) of src/**/*.js and the `content:` strings of src/ui/*.css, plus checks
# that GLYPHS in make_glyph_font.py and the @font-face unicode-range agree. Exits 1 with a list on failure.
#
#   python tools/check_glyphs.py
import os, re, sys, glob, importlib.util

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
# Tiny5's own repertoire beyond ASCII that the game uses (Latin-1 letters; Tiny5 covers Latin-1 Supplement).
TINY5 = set(chr(c) for c in range(0xC0, 0x100)) | set('¡¿«»°±²³´µ¶¸¹º¼¾')
# Never rendered as UI text (keyboard names, regex classes, file-format bytes…) — see the notes beside each.
IGNORE = {' ', '​', '️'}   # nbsp (spacing), zero-width space, variation selector


def font_glyphs():
    spec = importlib.util.spec_from_file_location('mgf', os.path.join(ROOT, 'tools', 'make_glyph_font.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return set(m.GLYPHS)


def css_range():
    css = open(os.path.join(ROOT, 'src', 'ui', 'style.css'), encoding='utf-8').read()
    m = re.search(r"font-family: 'VR Glyphs';.*?unicode-range:([^;]+);", css, re.S)
    out = set()
    for part in m.group(1).split(','):
        part = part.strip()
        a, _, b = part[2:].partition('-')
        for c in range(int(a, 16), int(b or a, 16) + 1):
            out.add(chr(c))
    return out


def js_strings(src):
    """Yield the contents of string / template literals, skipping comments (a small JS lexer: good enough here)."""
    i, n = 0, len(src)
    prev = ''   # last significant char, to tell a regex literal from division
    while i < n:
        c = src[i]
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in '\'"`':
            j = i + 1; buf = []
            while j < n and src[j] != c:
                if src[j] == '\\': buf.append(src[j:j + 2]); j += 2; continue
                if c == '`' and src.startswith('${', j):   # skip the expression (its own strings are rare here)
                    depth = 1; j += 2
                    while j < n and depth:
                        depth += {'{': 1, '}': -1}.get(src[j], 0); j += 1
                    continue
                buf.append(src[j]); j += 1
            yield ''.join(buf); i = j + 1; prev = c; continue
        if c == '/' and prev and prev in '(,=:[!&|?{};':   # regex literal
            j = i + 1
            while j < n and src[j] != '/' and src[j] != '\n':
                j += 2 if src[j] == '\\' else 1
            i = j + 1; prev = '/'; continue
        if not c.isspace(): prev = c
        i += 1


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')   # (Windows consoles default to cp1252)
    except Exception:
        pass
    glyphs, rng = font_glyphs(), css_range()
    errors = []
    for ch in sorted(glyphs - rng):
        errors.append(f'U+{ord(ch):04X} {ch}  in GLYPHS but not in the style.css unicode-range')
    for ch in sorted(rng - glyphs):
        errors.append(f'U+{ord(ch):04X} {ch}  in the unicode-range but not in GLYPHS (would render as blank / tofu)')
    covered = glyphs | TINY5 | IGNORE
    missing = {}
    files = glob.glob(os.path.join(ROOT, 'src', '**', '*.js'), recursive=True)
    for f in files:
        for s in js_strings(open(f, encoding='utf-8').read()):
            for ch in s:
                if ord(ch) > 0x7E and ch not in covered:
                    missing.setdefault(ch, set()).add(os.path.relpath(f, ROOT).replace(os.sep, '/'))
    for f in glob.glob(os.path.join(ROOT, 'src', 'ui', '*.css')):
        for s in re.findall(r"content:\s*(['\"])(.*?)\1", open(f, encoding='utf-8').read()):
            for ch in s[1]:
                if ord(ch) > 0x7E and ch not in covered:
                    missing.setdefault(ch, set()).add(os.path.relpath(f, ROOT).replace(os.sep, '/'))
    for ch, fs in sorted(missing.items()):
        errors.append(f'U+{ord(ch):04X} {ch}  not in the pixel fonts: {", ".join(sorted(fs))}')
    if errors:
        print('check_glyphs: FAIL'); print('\n'.join('  ' + e for e in errors))
        sys.exit(1)
    print(f'check_glyphs: ok ({len(glyphs)} glyphs in vr-glyphs, {len(files)} js files scanned)')


if __name__ == '__main__':
    main()
