# Critic M: text legibility

**Session:** 2026-10-14. Frozen build `.playwright-mcp/frozen_r3/` in my own headless Chrome (devicePixelRatio 1).
Every screenshot named below is in `.playwright-mcp/roundM/`. `A_*` are baseline audits, `E_*` / `J_*` are in-page CSS
experiments, and `z_*` are nearest-neighbour zooms. Measurements come from `getComputedStyle` walks over `#ui`
(every visible text node: size, family, colour, clipping), CDP `CSS.getPlatformFontsForNode` (which font actually
drew each glyph), and the font files' own `glyf`/`hhea` tables, parsed in memory.

**The resolution that matters most.** The user's monitors are 1920×1080 at 100 % scaling. In a maximised browser the
viewport is about 1920×945. That gives `--u` = 1.744 and a world texel of 3 px (k = 3). I tested 1920×945 alongside
1280×720, 1366×768, 1920×1080, 1024×600 and 1280×600. 1280×600 is a 720p laptop with browser chrome.

## Verdict

**Overall legibility: 4.5 / 10.** Tiny5 is not the main problem. The problem is the type scale. The menus are set
in design sizes N = 8–11, and the 8-px rounding turns those into 16 px on a 1080p screen. The world is drawn at 3×,
so the menus get two font pixels per world texel. The jungle HUD already uses the STYLE.md rule (one font pixel per
texel, N = 12 → 24 px), so it reads well. Every other screen is a size class smaller than the HUD.

Small windows are worse. At 1024×600 and 1280×600 anything with N ≤ 10–11 falls to the 1× floor: 8 px, a 5-px cap
height, a 4-px x-height and 1-px strokes. That is 81 declarations.

| Screen | 1920×945 (user) | 1280×720 | 1024×600 | Worst offender |
|---|---|---|---|---|
| Title | 7 | 7 | 5 | `.msub` subtitles muted and smallest; 8 px at 1024 |
| Briefing | 5 | 6 | 3 | Within one card the **Reward line is 16 px next to 24 px lines** (1080p), and 8 px at 1024 (`z_brief1024.png`) |
| Jungle HUD | 7 | 7 | 6.5 | Area name under the clock: `#a9b6cc` on foliage/dirt, 2.2:1, 1-device-px outline (`z_ex_clock.png`) |
| Interact prompt / GOAL strip / coach | 8 | 7.5 | 7 | Fine: panels and the HUD grid |
| Night prep sidebar | 3.5 | 4 | 2 | 16 px on 1080p, 8-px tags, hint **clipped mid-sentence** at 720p, ellipsised tower names |
| Night combat floats | 4 | 4 | 4 | "88" renders as two dominoes; non-integer `scale()` pop blurs it (`z_float1.png`) |
| Summary | 5 | 6 | 4 | Row labels tiny and muted; Silkscreen **Bold** headline fills its counters |
| Workbench | 4 | 5.5 | 4 | 16-px descriptions on 1080p, "♥ORKBENCH" (bold W), summary hint left over the cards |
| Collection | 5 | 5.5 | 4.5 | Locked nodes at `opacity: .55` (3.9:1 at 16 px) |
| Settings / Pause | 7 | 7 | 6 | OK |
| Big map (Tab) | 6 | 6 | 5.5 | Markers paint over place names ("Uplink Roo◆ 6"); legend 16 px |
| Death modal | 6 | 6 | 5 | The consequence line is the smallest text in the modal |
| Results | 6 | 6.5 | 5 | Stat labels 8 px at 1024; widowed last words |

## Global plan (do these in order)

1. **Make the jungle's text-grid rule game-wide.** No design size below **N = 12**, and no text below **2 font
   pixels (16 device px)** at any window size. Keep Tiny5 and keep `CONFIG.ui.fontGrid = 8`. Body text then lands on
   16 px at 720p-class windows, 24 px at 1080p, and 32 px at 1440p (one font pixel per world texel). This is a
   mechanical edit to 81 declarations.
2. **Fix what that overflows.** The prototype in-page is `J_*_min12_*.png`. Briefing, Summary, Workbench, Collection
   and Jungle fit as they are. Five spots clip: night sidebar width, docked hint, `.df-tag`, `.df-ename`, and bar
   heights.
3. **Make every glyph a pixel glyph.** Extend `vr-glyphs.ttf` to cover 4-px-wide digits plus the ~20 symbols that
   now fall back to Consolas or Segoe UI Symbol. Never use Silkscreen **Bold** above 24 px.
4. **Outline in font pixels, not device pixels.** Any text over the world gets an 8-direction outline of
   `0.125em` (exactly one font pixel) in `--ink`. Today it is `1px` (⅓ of a font pixel at 1080p).
5. **Contrast floor 4.5:1 for anything you must read.** That covers bar numbers, hotkey chips on primary buttons,
   locked or disabled text, and the muted text on red danger boxes.

## The core problem in numbers

Every font size is `max(--fq, round(u·N − 0.01px, --fq))` with an 8-px quantum. This table shows what each design
size N becomes at each window size; red flags are 8 px and the inconsistent 16-next-to-24 jumps.

| N | 1024×600 | 1280×600* | 1280×720 | 1366×768 | **1920×945*** | 1920×1080 | 2560×1440 |
|---|---|---|---|---|---|---|---|
| 8–9 | **8** | **8** | **8** | 8/16 | 16 | 16 | 24 |
| 10 (26 decls) | **8** | **8** | 16 | 16 | **16** | **16** | 24 |
| 11 (32 decls, incl. `.small`) | **8** | 16 | 16 | 16 | **16** | 24 | 32 |
| 12 (jungle `--hud-f`) | 16 | 16 | 16 | 16 | **24** | 24 | 32 |
| 14 | 16 | 16 | 16 | 16 | 24 | 24 | 40 |
| 16 | 16 | 16 | 24 | 24 | 24 | 32 | 40 |
| 18 | 16 | 16 | 24 | 24 | 32 | 32 | 48 |
| 26 | 24 | 32 | 32 | 40 | 48 | 48 | 72 |

\* = a browser window, not fullscreen.

- **Two neighbouring sizes split between 16 and 24 px.** N = 10/11 vs N = 12 land on 16 px vs 24 px at 1080p. That
  is why one briefing card mixes 16-px and 24-px lines (`E_briefing_base_1920x945.png`). The *Reward* (the payoff)
  and the *GOAL/FINDS/DANGER* labels end up smallest.
- **Tiny5's real metrics** (from `glyf`): 8 px per em, cap height 5, x-height 4, descender 1, digits 3 px wide on a
  4-px advance. At 1× that is the floor of legibility; at 2× it is fine on a laptop and small on a 1080p desktop.

### Text that renders at 8 px (1×)

- **At 1280×720 (main):** `.df-new` "NEW" (defense.css:99, N = 8), and `.df-tag` "⚠ Danger tonight" /
  "Also tonight" (defense.css:397 compact override, N = 9). Screenshots: `A_defense_1280x720.png`,
  `z_def1280_side.png`. Also N = 8/9 everywhere they appear: `.df-act .btn .hotkey` (defense.css:363), the
  protocol hotkeys (defense.css:417), `.rl-k` (relics.css:37), `.wave-new` (screens.css:367), `.df-hk` (defense.css:62),
  `.df-role` (defense.css:73), `.x-res .lbl` (explore.css:27), `.rl-rar` (relics.css:10), `.j-place-s` (relics.css:58).
- **At 1024×600 / 1280×600 (laptop windows):** add every N = 9.5 / 10 / 10.5 (/ 11 at 1024) declaration.
  - Defense: 41 strings, including the hint, the threat text, every note, the readiness line, the relay bar number
    and the Space chip (`A_defense_1024x600.png`, `z_def1024_side.png`).
  - Briefing: 33 strings (`A_briefing_1024x600.png`).
  - Summary: 25 strings. Title: 10.
- **The full list of the 81 sub-12 declarations,** by N:
  - N = 8: defense.css 99, 363, 417; relics.css 37; screens.css 367.
  - N = 9: defense.css 62, 73, 397; explore.css 27; relics.css 10, 58.
  - N = 9.5: defense.css 259; meta.css 70; workbench.css 40.
  - N = 10: defense.css 17, 18, 70, 72, 82, 104, 144, 215, 254, 310, 388; explore.css 78; jungle.css 149;
    meta.css 30, 36, 71, 105; relics.css 30; screens.css 31, 230, 261, 366, 390, 404; style.css 141, 166.
  - N = 10.5: defense.css 142, 221; explore.css 80; meta.css 19, 65; screens.css 83, 226; workbench.css 46.
  - N = 11: style.css 107 (`.small`); defense.css 22, 48, 69, 89, 91, 116, 121, 203, 243, 294, 317, 340, 347, 380;
    explore.css 19; meta.css 11, 22; relics.css 24, 25, 65; screens.css 151, 196, 224, 238, 374, 396;
    workbench.css 17, 29, 37.
  - N = 11.5: screens.css 86, 263, 266.

## Prioritised fixes

### P0: size and clipping

**P0-1. Minimum design size 12, minimum rendered size 2 font pixels.**
- *Wrong:* see the tables above. The user sees most menu text at 16 px on a 1080p monitor while the HUD is 24 px.
  Laptop windows see 8 px.
- *Evidence:*
  - `E_briefing_base_1920x945.png` vs `J_briefing_min12_1920x945.png`.
  - `F04_workbench.png` vs `J_workbench_min12_1920x945.png`.
  - `A_briefing_1024x600.png` vs `J_briefing_min12_1024x600.png`.
- *Change*, in every `src/ui/*.css`:
  - In `round(calc(var(--u) * N - 0.01px)`, every N < 12 becomes 12.
  - `max(var(--fq),` becomes `max(calc(var(--fq) * 2),`.
  - Script:
    ```
    python - <<'EOF'
    import re,glob
    for f in glob.glob('src/ui/*.css'):
        s=open(f,encoding='utf-8').read()
        s=re.sub(r'var\(--u\) \* ([0-9.]+) - 0\.01px', lambda m: f"var(--u) * {max(12,float(m.group(1))):g} - 0.01px", s)
        s=s.replace('max(var(--fq),','max(calc(var(--fq) * 2),')
        open(f,'w',encoding='utf-8').write(s)
    EOF
    ```
  - Update the style.css "Pixel-font grid" comment to say "at least 2×, N ≥ 12".
  - Add to STYLE.md: "all UI text follows the HUD text grid (N ≥ 12: one font pixel per world texel)".
- *Hierarchy after the change.* N = 12 is body everywhere. Sub-heads need **N ≥ 19** to stay one step above body at
  both 720p and 1080p: 24 / 32 px. N = 13–17 renders the same as body at 1080p, so either raise those sub-heads (`.panel h3` 14,
  `.df-head h2` 16, `.dc-name` 15, `.skill-name` 14, `.mlabel` 17, `.btn.big` 17) to 19, or accept colour-only
  emphasis.
- *Measured result.* The in-page prototype applied the change to all 183 font-size values in each of 6 screens × 3
  resolutions (`exp3.json`, `J_*`). Nothing overflowed on Briefing, Summary, Workbench, Collection or Jungle at
  1080p or 720p. The clipping that remains is in P0-2.

**P0-2. Fix the five containers that clip text.** Three of them clip today, before any size change.
- **Docked hint is cut mid-sentence at 1280×720.**
  - *Evidence:* `A_defense_1280x720.png` ("…Click a glowing / square beside a path to build" with the last line
    sliced) and `C02_def_click.png`. Measured: `.df-hintdock` scrollHeight 105 vs clientHeight 64.
  - *Change:* defense.css:419 `.df-side .df-hintdock { flex: 0 1 auto; min-height: 0; overflow: hidden; }` →
    `{ flex: none; }`. Let `.df-body` (already the scroller) give up the height instead.
- **Night sidebar is too narrow for 24-px text.**
  - *Evidence:* `E_defense_boost_1920x945.png` / `J_defense_min12_1920x945.png`:
    - "DANGER TONIG" is cut off.
    - The threat text is clipped.
    - The enemy list collapses into 168 px of scroller.
  - *Change:* defense.css:38 `.df-side { width: calc(var(--u) * 200) }` → `calc(var(--u) * 236)`, and shift
    whatever anchors to its left edge to match. Also cut the panel's text (P1-6).
- **Tower names are ellipsised:** "Thorn N…", "Snare Vi…" at 1080p (`H02_build_menu.png`).
  - *Change:* defense.css:98 `.df-ename { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` → allow
    two lines (`white-space: normal; display: -webkit-box; -webkit-line-clamp: 2;`), or drop the one-line description
    under the name in the card and keep it in the tooltip.
- **`.df-tag.bad`** (defense.css:104/397) clips at 20/20. Remove `overflow`/`nowrap` there, or let it wrap.
- **Bar labels are taller than their bars:** text 17–25 px in a bar 13–22 px tall (`.bar`, `.hp-bar`, `.x-hpbar`,
  `.df-relaybar`).
  - *Change:* style.css:161 `.bar { height: calc(var(--u) * 14) }` → `height: max(calc(var(--u) * 14), calc(1lh + 4px))`.
    Use `max(calc(var(--u)*14), calc(2px + 1.25em))` if `lh` is a concern; set it on the bar with the label's
    font-size. Do the same for explore.css:18 `.x-hpbar` and the defense relay bar (defense.css:22/425).

**P0-3. Damage numbers: "88" reads as two dominoes, and the pop scales blur them.**
- *Evidence:* `C10_float_1.png` → `z_float1.png`.
  - The `vr-glyphs` "8" is 3×5 with 1-px counters (`###/#.#/###/#.#/###`). Under the dark outline those counters
    read as dots inside solid blocks.
  - `Fx.js:1508` writes `translate(-50%,-50%) scale(1.43)`. Non-integer scale on a pixel font re-samples every glyph
    pixel, and `-50%` of an odd width puts it on a half pixel.
- *Change:*
  - (a) Redraw the digits 4 px wide (P1-1).
  - (b) In `Fx.js` around line 1508, quantise the pop: `sc` ∈ {1, 1.5, 2} only. 1.5 × 16 px = 24 px stays on the
    grid. Replace `translate(-50%,-50%)` with a JS offset `-Math.round(w/2), -Math.round(h/2)`, using the measured
    `offsetWidth/Height` cached at spawn.
  - (c) Change the `.float` outline (style.css:185) from `1px …` to the one-font-pixel outline in P1-3.

### P1: glyphs, contrast, outlines

**P1-1. Extend `tools/make_glyph_font.py` / `vr-glyphs.ttf`: a full 4-wide digit set and pixel symbols.**
- *Digits now:* 3 px wide on a 4-px advance. 8/0/B/6/9 blob together at every size (`fontspec_a.png`, row 1:
  "0123456789 88"). "%" reads as "Z" with dots ("10%" → "10Z", `z_bold.png`), and "/" is a broken stair
  ("100 / 100", `z_sum_bars.png`).
- *Digit change:* draw 0–9 as 4×5 on a **5-unit advance** (1 = 3 wide, centred), plus `%`, `/`, `+`:
  ```
  0 .##. #..# #..# #..# .##.     5 #### #... ###. ...# ###.
  1 .#.  ##.  .#.  .#.  ###      6 .##. #... ###. #..# .##.
  2 .##. #..# ..#. .#.. ####     7 #### ...# ..#. .#.. .#..
  3 ###. ...# .##. ...# ###.     8 .##. #..# .##. #..# .##.
  4 #..# #..# #### ...# ...#     9 .##. #..# .### ...# .##.
  % #..# ...# ..#. .#.. #..#     / ...# ..#. ..#. .#.. #...
  ```
  - Extend `unicode-range` in style.css:28 to `U+0025, U+002F, U+0030-0039, U+007E` plus the symbols below.
  - Digits grow 25 % wider. Check `.x-time` (it uses VR Clock, unaffected), the `df-wavestat` numbers and
    `.stat-val`.
- *Symbols:* CDP shows these glyphs are drawn by **Consolas** or **Segoe UI Symbol** (blurry vector glyphs at the
  wrong weight and baseline, and different again on Mac/Linux):
  - **Consolas:** `▾ ▲ ▼ ▸ ♥ → ϟ ○ – ·`
  - **Segoe UI Symbol:** `☠ ▶ ⚠ ❚ ✓ ⚙ ❧ ➤`
  - Evidence: `z_sym1.png` (⚠ next to pixel text), `z_sym3.png` (✓), `z_sym2.png`.
  - Draw each as a 5×5 bitmap in the same script on a 6-unit advance, and add them to the `unicode-range`.
  - Tiny5's *full* TTF has ◆▸◂▲▾→○, but the Google Fonts CSS serves only its latin subset, so they never load.
    Your own bitmaps are the simpler fix.

**P1-2. Never use Silkscreen Bold at headline size.**
- *Evidence:* `z_wbhead.png`. In "WORKBENCH" the W is a filled heart and the O/B/R are solid blocks; the M in
  "BACK HOME SAFE" fills the same way (`z_sum_head.png`). Same failure as the clock "4" fixed in critic G.
- *Change:* `font-weight: 400` on:
  - `.headline` (screens.css:276)
  - `.res-headline` (screens.css:316)
  - `.df-bannertitle` (defense.css:134)
  - `.x-banner-t` (explore.css:89)
  - `.logo-big` (screens.css:67) and `.title-logo.logo-big` (style.css:229)
  - `.df-tag` (defense.css:104)
  - `.df-new` (defense.css:99)

  Keep bold only on `.x-time`, which is patched. If a headline must look heavier, use the existing 3-unit ink drop
  shadow rather than the weight.

**P1-3. One-font-pixel outlines for any text over the world.**
- *Wrong:* `text-shadow: 1px 1px 0 #000` is ⅓ of a font pixel at 1080p. It reads as a smudge, not a pixel-art
  outline. The area name under the clock is `#a9b6cc` on dirt at 2.2:1 and on foliage at 4.9:1 (`z_ex_clock.png`).
- *Change:* add to style.css:
  ```css
  .ol { --o: 0.125em; text-shadow: var(--o) 0 0 var(--ink), calc(-1*var(--o)) 0 0 var(--ink), 0 var(--o) 0 var(--ink),
        0 calc(-1*var(--o)) 0 var(--ink), var(--o) var(--o) 0 var(--ink), calc(-1*var(--o)) var(--o) 0 var(--ink),
        var(--o) calc(-1*var(--o)) 0 var(--ink), calc(-1*var(--o)) calc(-1*var(--o)) 0 var(--ink); }
  ```
  0.125em is exactly one font pixel because sizes are multiples of 8. `em` is fine for shadows; the "no em" rule is
  only about font-size. Apply this shadow, or the class, to:
  - `.float` (style.css:185)
  - `.j-daylbl` and `.j-district` (jungle.css:69/75), and give `.j-district` colour `--text` (#ead4aa) instead of
    `#a9b6cc`
  - `.j-tr` (jungle.css:41)
  - `.j-strip` (jungle.css:84)
  - `.x-ptext` (explore.css:48)
  - `.toast` (style.css:169)
  - `.tagline` (style.css:207)
  - `.bar .barlbl` (style.css:166)

  This is the same rule `.j-tl .x-hpbar .barlbl` (jungle.css:26) already uses.

**P1-4. Contrast fixes (WCAG, measured).**
- **`.bar .barlbl`**, style.css:166: white on cyan fill is **1.5:1**, white on green fill 2.1:1 (the shadow only
  partly rescues it). Use the P1-3 outline, or `color: var(--ink)` with no shadow on bright fills (ink on cyan is
  12:1).
- **`.btn .hotkey`**, style.css:140–143: on `.btn.primary` the chip is muted `#8b9bb4` on green at **1.85:1** (the
  "Space" and "Enter" chips, `A_defense_1280x720.png`). Add
  `.btn.primary .hotkey { color: var(--text); border-color: var(--text); background: rgba(24,20,37,.35); }`.
- **`.rt-node.locked { opacity: 0.55 }`**, meta.css:76: locked research names are 3.9:1 at 16 px
  (`F02_collection.png`). Use `opacity: 1; color: var(--muted)` plus the dashed border and lock icon.
  `.btn.disabled { opacity: .45 }` (style.css:138) makes "Head out" 2.1:1. Use 0.7.
- **`.df-threat`:** `--danger` on the red box is 3.7:1 for a Silkscreen caps label. Use `#ff7a80` on that box.
- **`.x-res.zero { opacity: .72 }` + muted** (explore.css:28): the HUD "0" Scrap is near-invisible
  (`z_ex_hud.png`). Use opacity 1 with the muted colour.

**P1-5. Stale and overlapping hints.**
- The summary's "Pick a card ▼ (keys 1–3)…" hint survives into the **Workbench** and covers the Balanced Grip / Heavy
  Spine / Med kit descriptions (`F04_workbench.png`).
- On the summary it covers the skill-picker title (`E_summary_base_1920x945.png`).
- *Change:* clear `showHint` nodes on scene/screen change, and on the summary anchor the hint above the cards, not
  over them.

**P1-6. Night sidebar density.** Seven stacked text blocks share a 200-unit column: hint, threat, enemy list,
trades, zap line, defense rating, readiness line. The readiness line is a run-on (`North ○○○ · South ○○○ Bramble
Crawlers · expect −62 or worse: the Relay may fall`).
- Cut the zap line after night 1. Show it in the Relay tooltip instead.
- Split the readiness line into two short lines ("Weakest: South — Bramble Crawlers" / "Expect −62 Relay").
- Collapse the threat block to one line plus a tooltip once the hint is dismissed.

### P2: polish

- **P2-1. Letter-spacing in font pixels.** `round(Xem, var(--fpx))` gives 1 px at 16 px, which is half a font
  pixel, so glyph gaps alternate 2 px / 3 px (Silkscreen labels: `.dc-k`, `.sum-k`, `.skill-branch` 2 px,
  `.df-phase`, `.df-lbl`, `.headline` 2 px). Use `letter-spacing: 0.125em` (one font pixel) for caps labels, and 0
  elsewhere.
- **P2-2. Fewer all-caps tracked labels.** `GOAL / FINDS / DANGER`, `YOU GOT / REWARD / INTEL`, `PREPARATION`,
  `TONIGHT` and `DANGER TONIGHT` are Silkscreen caps in muted colours, and every one is smaller than its value. At
  N = 12 they read; better still, use sentence-case Tiny5 in the label colour (`.dc-k`, `.sum-k`, `.df-tag`,
  `.df-phase`).
- **P2-3. Map labels vs markers.** JungleMap.js:330–344 draws names under the markers, so "Uplink Roo◆ 6" and
  "The ◆lass Nursery" collide (`z_maplbl.png`). Lift the label baseline by the marker's half-size + k (`py - e - k`).
  Also round `px - measureText(text).width/2` yourself and use `textAlign = 'left'`; centred canvas text on an odd
  width lands on a half pixel.
- **P2-4. "Text size" setting.** Normal / Large. Large multiplies N by 1.5 via a `--ts` variable in the formula:
  `calc(var(--u) * N * var(--ts, 1) - 0.01px)`, set in `Game.fit` from settings. At 1080p body goes 24 → 32. Ship
  only after P0-2/P1-6, because the night sidebar overflows at ×1.4 (`E_defense_large_1920x945.png`).
- **P2-5. Death modal hierarchy.** "You start tomorrow with 75 health…" is the smallest line (`G06_death.png`). Make
  it body size, and the flavour line `.small`.
- **P2-6. Widows** on Results ("nights.", "kit)." alone on a line, `E_results_base_1920x945.png`): add
  `text-wrap: balance` to `.screen p`, `.modal p` and `.panel p`.

## Font choice: keep Tiny5

I measured the candidates' TrueType outlines: pixel unit = the GCD of the glyph coordinates. I also rendered them
on the game's colours (`fontspec_a.png`, `fontspec_b.png`, `z_fontcmp.png`) and checked which glyphs Google actually
serves (CDP).

| Font (Google) | Pixel grid | Cap / x-height / desc (px) | Width vs Tiny5 | Verdict |
|---|---|---|---|---|
| **Tiny5** (now) | 8 px em, exact | 5 / 4 / 1 | 1.00 | Keep. Fix digits and symbols via vr-glyphs |
| Silkscreen | 8 px em, exact | 5, caps only | 1.55 | Labels and headlines only, regular weight |
| Micro 5 | 11 px em | 5 / 4 / 1 | 1.03 | Same detail as Tiny5, odd grid. No gain |
| Bytesized | 8 px em | 3 / 2 | 1.11 | Smaller. No |
| Press Start 2P | 8 px em | 8(7) / 6 | **2.2** | Excellent digits, but 2.2× wider: no layout survives |
| Jersey 10 | 18.667 px em (fractional) | 10 / 8 / 2 | 0.98 at 1× | 1-px strokes beside 2–3× texels breaks STYLE.md's one-density rule; fractional em is fragile |
| Jersey 15 | 27 px em | 15 / 11 / 4 | — | Lovely, but 1-px strokes at 3× and no 720p size |
| Pixelify Sans, VT323, DotGothic16, Handjet, Workbench, Sixtyfour, Bitcount | no integer grid (outline coordinates not on a pixel lattice) | — | — | Anti-aliased at every size. No |

None of them covers the game's symbols through Google Fonts (◆☠★⚙☂≋☀▸◂✓✘▲▾ϟ♥⚠→○ are all missing), so P1-1 is
needed whichever font you choose.

**Recommendation:** stay on Tiny5 at `CONFIG.ui.fontGrid = 8`. Leave `index.html` alone; the Google link is
unchanged. Get the legibility from size (P0-1), the 4-wide digits and pixel symbols (P1-1), outlines (P1-3) and
contrast (P1-4). A font with a ~7-px cap (m5x7-class, self-hosted) would only help if you later want *more detail at
the same size* on 720p. That needs its own grid value and its own licence check, and it is not needed to fix what
the user is seeing.

## How to verify

- Re-run the audit at 1920×945, 1280×720 and 1024×600 on briefing, defense, summary, workbench, collection and
  explore. `.playwright-mcp/roundM/` has the frozen-build driver.
- Pass conditions:
  - The `#ui` text-size histogram has **no 8**.
  - At 1920×945 body text is **24**.
  - No element with `overflow: hidden` has `scrollHeight > clientHeight + 2`, except intentional scrollers.
- Zoom checks:
  - The "88" damage number reads as two eights.
  - "⚠ / ✓ / ▸ / ☠" are drawn with pixel edges.
  - "WORKBENCH" starts with a W.
