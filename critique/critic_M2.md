# Critic M2: text legibility, round 2

**Session:** 2026-10-14. Frozen build `.playwright-mcp/frozen_r4/` (HEAD 66c03fe) in my own headless Chrome
(devicePixelRatio 1). Every screenshot named below is in `.playwright-mcp/roundM2/`. `z_*` files are
nearest-neighbour zooms.

**Method**
- `audit_fn.js`: size histogram and clipping.
- A scroller audit: every `overflow: auto` box whose content is taller than the box.
- CDP `CSS.getPlatformFontsForNode` on every text node.
- `Range.getClientRects()` on every text run, to find sub-pixel x positions.
- A WCAG contrast walk.
- Two in-page CSSOM prototypes: Large text ×1.34 (`L_*`) and rounded layout units (`S_*`).

**Sizes tested:** 1920×945 (the user's maximised 1080p browser), 1280×720 and 1024×600.

## Verdict

**Overall legibility: 7.0 / 10** (round 1: 4.5).

The type-scale fix landed cleanly:
- At 1920×945 body text is 24 px everywhere. At 720p-class windows it is 16 px.
- No 8-px text is left. The histogram never goes below 16.
- The "88" damage numbers read as two eights.
- "WORKBENCH" starts with a W.
- The jungle HUD and the toasts are crisp.

What keeps this from an 8–9:

1. **The night sidebar is now a peephole.** The text grew but the panel's fixed blocks did not shrink.
   - The enemy list is the most important thing on the night screen, and it now sits in a scroller that shows
     **17–33 %** of its content.
   - At 1024×600 on night 1, **neither lane's enemy list is visible at all**. In round 1 it was the biggest block in
     the panel.
2. **Hierarchy collapsed.** Section and card titles were set at N = 12–13, so at 1080p they render at the same
   24 px as body text. Examples: workbench card names, the "Tower mods / Machete / Supplies" heads, "Tonight's
   attack" on the briefing, lane heads, research node names. On the workbench, **92 of 93 text nodes are 24 px**.
3. **Nearly all text is drawn on sub-pixel x positions.**
   - `--u` = 1.744 px makes every padding, margin and border fractional.
   - Measured: 62 of 69 text runs on the briefing, 55 of 57 on night prep, and 13 of 15 on the title.
   - Glyph stems get half-intensity edge columns (`z_snap_compare.png`, `z_sunset.png`).
   - A mechanical `round(…, 1px)` fixes most of it (prototype measured below).
4. **New collisions from the bigger text.**
   - Big-map place names overprint each other and are overprinted by markers.
   - At 1024 the workbench hides its second row of Make buttons in a scroller.
   - At 1024 research node names break mid-word ("Salvag/e", "Disch/arge").
   - At 1024 the summary card cuts its last line.

## Scores by screen

The scores are 1920×945 / 1280×720 / 1024×600. "R1" is round 1.

| Screen | R1 | Now | What changed / what's left |
|---|---|---|---|
| Title | 7 / 7 / 5 | **8 / 8 / 7.5** | Good. Only the sub-pixel softness remains (P1-3) |
| Briefing | 5 / 6 / 3 | **8 / 8 / 7** | One size per card now. "Click a card or press 1 / 2" and "Pick an area first" sit on bare art with a 1–2 device-px drop shadow. "Details ▾" wraps at 1024. "Tonight's attack" is the same size as body |
| Jungle HUD | 7 / 7 / 6.5 | **8.5 / 8 / 7.5** | Clock, area name and outlines are excellent (`z_ex_clock.png`). At 1024 "Stamina" runs into its bar (`z_ex_hud1024.png`). The GOAL strip repeats the goal and ellipsises at 1024 |
| Prompt / GOAL strip / coach / toasts | 8 / 7.5 / 7 | **8.5 / 8 / 8** | Crisp (`z_toast.png`) |
| Foraging text (new) | n/a | **7.5** | Fungus hint and glint toast are good. The fruit prompt contradicts itself at full health (P1-7) |
| Night prep sidebar | 3.5 / 4 / 2 | **5 / 4.5 / 3** | Text is big and wraps, but the enemy list is hidden (P0-1). Enemy portraits overdraw names at 1280 |
| Mid-wave floats / boss bar / banners | 4 / 4 / 4 | **7.5 / 7 / 7** | Floats sit on whole pixels, with no scale blur. The boss name keeps a 1-px shadow and is body size. The day banners still sit on a half pixel |
| Summary | 5 / 6 / 4 | **8 / 8 / 6.5** | Good at 1080p. At 1024 the "+8 Research" line is cut. ◎ and ⚔ skill icons are vector glyphs |
| Workbench | 4 / 5.5 / 4 | **7 / 7.5 / 4.5** | W fixed, stale hint gone. Hierarchy is flat. At 1024 the second row's costs and Make buttons are hidden |
| Collection | 5 / 5.5 / 4.5 | **6.5 / 6.5 / 4** | Locked-node contrast fixed. Nodes are cramped (2–3-line names). At 1024: mid-word breaks and truncated branch subtitles. The Codex has 11 vector skill glyphs |
| Settings / Pause | 7 / 7 / 6 | **8 / 8 / 7.5** | The pause controls are one run-on paragraph ("hold right-/click") |
| Big map (Tab) | 6 / 6 / 5.5 | **5.5 / 5.5 / 5** | Worse: bigger labels now collide with each other and with markers (P1-4) |
| Death modal | 6 / 6 / 5 | **8 / 8 / 7.5** | Fixed |
| Results | 6 / 6.5 / 5 | **7 / 7.5 / 6** | Widows remain. Stat values are body size at 1024. Headline shadow is on a fractional offset |

## What is now good (keep it)

- **Type floor.** No text below 16 px. Body is 24 px at 1080p everywhere.
- **Clipping is gone in fixed-height boxes.** The round-1 clips are all fixed: hint dock, `.df-tag`, tower names,
  bar labels. The only clipping `overflow: hidden` boxes left are the three in P1-1.
- **Glyphs.**
  - Digits are 4 wide, and `% / +` are drawn on the grid (`z_brief_top.png`, `z_float1920.png`).
  - CDP shows only Tiny5, Silkscreen, VR Glyphs and VR Clock on the briefing, night, explore, results, title,
    workbench and collection Research/Records tabs.
  - No Consolas anywhere.
- **No Silkscreen Bold** is rendered anywhere (checked on every screen and on the boss).
- **Outlines.** Bar labels, toasts and HUD world text use the one-font-pixel `--ol` outline.
- **Floats.** Damage floats sit on integer `matrix(1,0,0,1,x,y)` positions with no scale (verified on 11 floats at
  three sizes).
- **Stage position.** The stage is centred on whole device pixels.
- **Contrast.** WCAG walk: nothing under 4.5:1 except `--danger` red text at 4.3:1 ("Need 55 more Research",
  "Bramble Crawlers" in the readiness line) and the 0.7-opacity disabled hotkeys (3.8:1, which is intended).

---

## P0

### P0-1. Night prep: the enemy list is hidden in a scroller

**Evidence (`.df-body.scroll`: content height vs visible height):**

| Window | Night 1 | Night 4 |
|---|---|---|
| 1920×945 | 629 / 220 | 1025 / 341 |
| 1280×720 | 462 / 218 | 757 / 292 |
| 1024×600 | **416 / 108** | 676 / 207 |

- Night 4 at 1920 (`B_def_n4_1920x945.png` = `A_defense4_1920x945.png`): only "North path" is visible, and its
  fourth enemy (Spitter) fades out. **South path (the danger lane) is entirely below the fold.**
- Night 1 at 1024 (`B_def_n1_1024x600.png`): **no lane list at all**, only the danger box and a 2-px sliver. Round 1
  showed both lanes at this size (`roundM/A_defense_1024x600.png`).
- Mid-wave it is the same (`BN_def_1920.png`: South's 4th row fades).
- The build menu shows 2.5 of 6 towers at 1024 (`BM_1024.png`). Its one-line descriptions are ellipsised
  ("Shoots one enemy at a tim…").
- The only "more below" cue is the 22-unit mask fade (defense.css:184). At 108 px it is invisible.

**Cause:** the fixed blocks outside `.df-body` grew with the text. These are the hint dock, Trades, the zap line,
"Your defense", the two readiness lines and Start Wave. Together they take 60–75 % of the column.

**Change (in this order):**

1. **Show lanes as icon chips, not rows.** The briefing already does this well (`A_briefing_1920x945.png`, right
   panel).
   - DefenseScene.js:1697 builds `div.df-erow` = icon + name + NEW + ×N.
   - In prep, render instead `span.df-echip` = icon + `×N`, with the name and NEW in the `title` tooltip and NEW as
     a 1-font-px amber corner dot.
   - CSS: `.df-lane { flex-direction: row; flex-wrap: wrap; gap: calc(var(--u)*3) }` and
     `.df-echip { display:inline-flex; align-items:center; gap:calc(var(--u)*2); padding:calc(var(--u)*2) calc(var(--u)*4); background:rgba(24,20,37,.6); border:1px solid #3a4466 }`.
   - Size: 236 units holds 3 chips per row, so five enemy types are two rows. A lane goes from ~190 units to ~60.
   - Keep the row form only in the "Still coming" mid-wave view, where counts change.
2. **Lanes first, threat second** (DefenseScene `_renderPreview`, ~line 1634). Collapse the threat box to one line
   ("⚠ Market swarm: extra Crawlers, South path") once the night-1 hint is dismissed. Keep the full text in its
   tooltip.
3. **Hide "Your defense" while building** (`_renderBuild` / `_renderPlacing`). It is not actionable while you pick a
   tower. In the build menu, drop the one-line tower description (defense.css `.df-ename`'s sibling) and keep it in
   the tooltip. Then six cards fit.
4. **Make the cue visible.** When `.df-more` is set, pin a `div.df-morecue` "▾ more" (`--muted`, 12 N) at the bottom
   edge of `.df-body` in addition to the mask.
5. **Fix the portraits at 1280** (`z_lane1280.png`). Enemy portraits are 1× creatures (46×44 px) in a 26-px-wide
   `.df-icoslot` (defense.css:199). They paint over the names and the lane border. Use `.df-icoslot { width: auto;
   min-width: calc(var(--u)*20); }`, or clip with `overflow: hidden`. Chips (step 1) make this moot.

**Pass condition:** night 4 at 1920×945 and night 1 at 1024×600 show every enemy type on both lanes with no
scrolling.

### P0-2. Workbench at 1024×600: the second row's costs and Make buttons are hidden

**Evidence:** `X_workbench_1024x600.png`.
- `.wb-panel` has scrollHeight 464 vs clientHeight 386.
- Serrated Edge, Balanced Grip, Heavy Spine, Med kit and Reinforced Plating lose their cost line and Make button.
- The text is cut mid-line ("damage a second for 3", "Carrying 0 of 2").
- The footer wraps "Relay (your / base)" and "◂ / Back".

**Change:** every card says the same thing twice. Compare "+15% range" with "The tower reaches 15% further".
- Keep the coloured stat line (`.wb-num`) and the "Fits:" line.
- Move the prose sentence into the card's `title` tooltip at all sizes, or below 1280 wide with a container query
  on `.wb-panel`.
- That saves 2–3 lines per card, fixes 1024, and pays for the larger card names in P1-2.
- Footer: `.wb-foot .hp-label { white-space: nowrap }` (or shorten to "Relay"), and
  `.btn { white-space: nowrap }` for Back.

---

## P1

### P1-1. Clipping and wrapping at 1024×600

**Collection research nodes break words** (`X_collection_1024x600.png`):
- Examples: "Salvag/e Logic", "Disch/arge", "Stockpi/le", "Enginee/r Kit", "Archivi/st", "Verdan/t Scarf". "Win a
  r(un)" is clipped.
- Cause: meta.css:68 `.rt-node .rt-name { overflow-wrap: anywhere }` plus a 3-column grid of ~90-px nodes.
- Change:
  - meta.css:68 → `overflow-wrap: normal; word-break: normal; hyphens: manual;`.
  - meta.css:61–67: move the icon below the name so the name gets the full card width:
    `grid-template-columns: auto 1fr; grid-template-areas: "name name" "icon cost";`, with `.rt-name { grid-area:
    name }`, `.rt-node > .vicon { grid-area: icon; grid-row: auto }`, `.rt-node > :last-child { grid-area: cost }`.
  - Unbreakable words still fit: "Discharge" is 9 Tiny5 glyphs, about 85 px at 16 px.
- The same layout also fixes the cramped 2–3-line names at 1920 (`X_collection_1920x945.png`).

**Branch subtitles are truncated:**
- "Towers and night abiliti…", "What you carry into the j…", "More choices before and be…". The audit reports
  `.small.muted` scrollWidth 174/171, 202/179 and 264/203.
- Allow wrapping (`white-space: normal`) on the subtitle inside `.rt-branch`. Below 1100 px, put it on its own line
  under the branch name.

**Summary card cuts "+8 Research (kept forever…)"** at 1024 (`A_summary_1024x600.png`; `.sum-card` 207/179).
- Merge the INTEL row into "YOU GOT" as a chip ("+1 Intel: spend it in night prep"), or drop the
  `max-height`/`overflow` on `.sum-card` (screens.css:400).
- At 1920 the same card overflows by 5 px (317/312); the last line touches the border.

**Briefing "Details ▾"** wraps the ▾ onto a second line at 1024 (`A_briefing_1024x600.png`). Add
`.dc-more { white-space: nowrap }`.

**Jungle HUD "Stamina"** runs into the stamina bar at 1024 (`z_ex_hud1024.png`).
- jungle.css:23 `.j-row .x-lbl { width: calc(var(--u)*46) }` → `width: auto; min-width: calc(var(--u)*46);`.
- Better: make `.j-tl` a 2-column grid with a `max-content` label column, so Health and Stamina stay aligned.

**GOAL strip** (`A_explore_1920x945.png`, `X_bigmap_1920x945.png`, `j-step` sw418/cw354 at 1024).
- It reads "Switch on the two water pumps: switch on both pumps (0/2)". The goal is said twice, and the ellipsis
  eats the count.
- Show only the step plus count ("Switch on both pumps (0/2)") when a step exists. The goal name is already the
  label's tooltip and is on the map.

### P1-2. Restore a size step between headings and body

At 1080p everything from N = 12 to N = 16 renders at 24 px, so these headings are body size:

| Heading | Rule | Now N |
|---|---|---|
| Workbench card names (`b.wb-name`) | workbench.css:23 | 12.5 |
| Section heads (`.scr h3`: "Tower mods", "Machete", "Supplies", briefing "Tonight's attack", settings sections) | screens.css:6 | 13 |
| Night lane heads (`.df-lanehead`) | defense.css:95 | 12 |
| Night sub-heads (`.df-body h3`) | defense.css:45 | 12 |
| Boss name (`.df-bossname`) | defense.css:115 | 13 |
| Results stat values (`.results-panel .stat-val`); renders 16 px = body at 1024 | screens.css:337 | 18 |

Evidence: `X_workbench_1920x945.png` (92 of 93 text nodes at 24 px) and `R_results_1024.png` ("1/6" and "0" are
the same size as their labels).

**Change:** set all six to N = **19**. That gives 32 px at 1080p and 24 px at 720p/1024. After P0-2 the workbench
has room for it. Keep the colour-only emphasis for inline labels (GOAL / FINDS / DANGER).

### P1-3. Sub-pixel text: round the layout unit

**Measured:** `Range.getClientRects()` x positions that are not whole pixels, at 1920×945.

| Screen | Fractional x runs |
|---|---|
| Briefing | 62 / 69 |
| Night prep | 55 / 57 |
| Summary | 62 / 73 |
| Results | 31 / 38 |
| Title | 13 / 15 |
| Explore | 23 / 24 |

Raw pixels confirm it:
- "Relay (your base)" at x 959.59: the stem edges are (91,99,120) half-coverage columns next to (139,155,180).
- "Focusing Lens": (117,119,135) / (244,244,245) fringes.

Vertical positions are snapped by Chrome, so only horizontal edges soften. Zoom comparison: `z_snap_compare.png`
(top: now; bottom: rounded).

**Change.** For every non-font-size, non-shadow, non-transform declaration in `src/ui/*.css`, wrap
`calc(var(--u) * N)` in `round(…, 1px)`:

```
python - <<'EOF'
import re,glob
pat=re.compile(r'calc\(var\(--u\) \* (-?[0-9.]+)\)')
for f in glob.glob('src/ui/*.css'):
    out=[]
    for decl in re.split(r'(;)', open(f,encoding='utf-8').read()):
        k=decl.split(':')[0]
        if re.search(r'font-size|shadow|transform|--bf|--hud-f|border-image|translate', k) or 'round(calc(var(--u)' in decl:
            out.append(decl)
        else:
            out.append(pat.sub(lambda m: f'round({m.group(0)}, 1px)', decl))
    open(f,'w',encoding='utf-8').write(''.join(out))
EOF
```

**Prototype result** (CSSOM, same rewrite; `S_*` screenshots):

| Screen | 1920×945 | 1280×720 |
|---|---|---|
| Title | 13 → **0** | 12 → **0** |
| Night prep | 55 → **4** | 52 → **4** |
| Briefing | 62 → 22 | 61 → 28 |
| Summary | 62 → 15 | 53 → 31 |
| Results | 31 → 10 | 36 → 19 |

**The rest:**
- `1fr` grid columns. Briefing `.dc-line` (screens.css:230) puts values at x 237.59. Wrap the first column in
  `round(…, 1px)`.
- Centred content on odd leftovers: the bar labels (`.bar .barlbl` `place-items: center`) and the zoom and pause
  buttons. Acceptable, or give the bars an even inner width.

**Positioned centring (worse, since the whole block moves):**
- explore.css:85 `.x-banner { transform: translate(-50%,-50%) }`.
  - Measured `matrix(…, -276, -42.8984)`.
  - "SUNSET" stems render `+######+` (half columns both sides, `z_sunset.png`).
  - Fix in `JungleScene._banner` (JungleScene.js:1570): after appending, set
    `b.style.left = Math.round((stageW - b.offsetWidth)/2) + 'px'` and the same for `top`. Use `transform: none`,
    as Fx.js:1511 already does for floats.
- The same pattern appears in:
  - defense.css:208 (`.df-ready`).
  - DefenseScene.js:2871 (the tower/enemy hover tag).
  - JungleScene.js:1925 (world marks).
  - JungleScene.js:795 (fly icons).
  - In each, replace `translate(-50%, -100%)` with `-Math.round(offsetWidth/2)` px, cached at creation.

**Caveat:** measured in headless Chrome (Skia, sub-pixel glyph positioning). Before shipping, confirm on the user's
headed Chrome by zooming a real screenshot of the title menu. The rounding is harmless either way.

### P1-4. Big map: labels collide with each other and with markers

**Evidence:** `M_map_1920x945.png`, `z_maplbl.png`, `z_maplbl2.png`.
- "The Weeping Engineer" is printed on top of "…Flats".
- "Kiosk Ro…" runs into "The Glasshouse".
- A camp ▲ sits inside "Broadcast▲Spire", and a relic ✦ sits on "Terminus H✦ll".
- "Flats" runs past the map edge.

The label-lift fix only avoids *its own* marker. JungleMap.js:325 also draws labels *before* markers, so other
markers paint over them.

**Change:** in `JungleMap._labels` (JungleMap.js:335):
1. Build the marker rects first (pass them in from `_markers`), then place labels greedily: current goal and
   nearest first.
2. Try, in order: above the anchor; below; left-aligned to the right of it; right-aligned to the left of it.
3. Accept the first rect (text width + 2k padding) that overlaps no placed label and no marker rect.
4. Clamp px to `[k, w - width - k]`.
5. If no slot is free, skip the label at this zoom. It reappears when zoomed in or on hover.
6. Draw labels after markers (swap lines 325–326) once they never overlap.

### P1-5. Remaining non-pixel glyphs (CDP)

**Rendered fallbacks:**
- Summary skill picker: ◎ (Cambria Math) and ⚔ (Segoe UI Symbol), e.g. "◎ Calibration" (`z_sum_skill.png`, smooth
  circles).
- Collection Codex tab:
  - Segoe UI Symbol: ⏱ ♛ ⚔ ➶ ✦ ⚒ ⛨ ⚑ ❄.
  - Cambria Math: ◣ ◎.

**Change:**
- Add the 12 skill icons to `GLYPHS` in `tools/make_glyph_font.py` and to the `unicode-range` in style.css:33:
  ➶ ❄ ✦ ⛨ ⚔ ⚒ ⚑ ♛ ◣ ◎ ⏱ §.
  - Code points: U+27B6, U+2744, U+2726, U+26E8, U+2694, U+2692, U+2691, U+265B, U+25E3, U+25CE, U+23F1, U+00A7.
- These are latent: data glyphs outside the range that today are hidden behind sprites, but fall back the moment a
  sprite is missing:
  - unlocks.js: ⁘ ↻ ⇄ ⊚ ⌖ ◍ ◫ ♁ ♣ ✎ ✹ ⟲
  - crafting.js: ⌁ ✂ ⟳
  - towers.js: ◉ ⦿ §
  - config.js: ▣ ✉
  - CollectionScene.js: ▦
  - CollectionScene.js and DefenseScene.js: 🔒
  - skills.js: ½
- Add a check to `make_glyph_font.py`, or a 10-line node script, that greps `src/data/*.js` for code points > U+7E
  outside the range and fails the build.

### P1-6. 1-device-px shadows still on text over the world

`--ol` was not applied in these places.

**Over the world (P1):**

| Rule | Text | Shadow now |
|---|---|---|
| defense.css:113 `.df-boss` | boss name, "Advancing" (`z_boss.png`) | `1px 1px 0 #000, -1px 1px 0 #000` |
| screens.css:210 `.choose-head` | "Where to today? / Click a card or press 1 / 2" (`z_brief_where1024.png`) | `2px 2px 0` |
| screens.css:248 `.briefing-screen .scr-foot > .small` | "Pick an area first (1 / 2)" | `1px 1px 0 #000` |
| explore.css:66 | the pulsing ▲ mark | blur shadow |

Change: `text-shadow: var(--ol)` on each. Give `.choose-head .small` the colour `--text` instead of `--muted`
(muted on sunlit dirt is the weakest text on the screen).

**On panels (P2, same change):** explore.css:11, jungle.css:168, objectives.css:18, relics.css:53, screens.css:48,
223 and 235, workbench.css:33.

**Fractional shadow offsets** blur the shadow edge at 1080p (`calc(var(--u) * 3)` = 5.23 px; `z_victory.png`):
- `.res-headline` (screens.css:318–319, 345)
- `.x-banner` (explore.css:86)
- `.df-bannertitle` (defense.css:135)
- `.title-logo` (style.css:226)
- screens.css:72
- `.df-ready` (defense.css:208)

Use `0.125em` multiples instead (font sizes are multiples of 8, so 0.25em is a whole number of pixels), or
`round(calc(var(--u)*3), 1px)`.

### P1-7. Foraging prompts (new text)

**Checked at all three sizes** with `gotoForage` (`F_*` screenshots):
- **Fungus hint** "Hit the fungus with your machete for Biofiber": a key-less prompt, clear, 24 px at 1080p
  (`F_fungus_1920x945.png`). Good.
- **Glint first-time toast** "Something shiny was hidden in the brush: watch for the glint": green, 2 lines, crisp
  (`F_glint_1024x600.png`). Good.
- **"You are not hurt: the fruit will keep. Come back when you are."**: amber toast, crisp (`z_toast.png`). Good.

**Problem:** at full health the fruit prompt says **"[E] Hold: Eat the wild fruit (you are not hurt) 0.8s"**
(`F_fruit_1920x945.png`, `F_fruit_1024x600.png`). It invites a hold whose only result is the toast.

**Change** in Forage.js:50–51: at full health, make the interactable key-less (`noKey: true`, `hold: 0`) with the
verb "Wild fruit: +25 health when you are hurt". Use the normal held "Eat the wild fruit (+25 health)" otherwise.
`noKey`, like the fungus hint, needs to be a function, or set it per frame.

*Minor:* the "4" float over a cut glint is muted grey with no "+" or icon (`z_glintfloat.png`). Use the loot form
"+4 ⚙ Scrap" (JungleScene.js:780) for glint scrap.

---

## P2

- **P2-1. Widows remain on Results.** "nights." and "kit)." each sit alone on a line (`A_results_1920x945.png`).
  These lines are `div.res-sub` / notes, not `p`, so style.css:113 `text-wrap: balance` misses them. Add
  `#ui { text-wrap: pretty; }` once (it covers every block), and keep `balance` on headings.
- **P2-2. Night tower panel** (`W_1920_3.png`).
  - "First in / line" wraps inside a button. Use `white-space: nowrap`, or "First".
  - The three upgrade cards (Q/W/E) are icon + cost only. Add a 1-word label ("Rate", "Range", "Mod").
  - The level pips touch "Level 1 of 3" (`■□□Level`). Add a `gap`.
- **P2-3. Overlapping damage floats.** A "7" lands on top of "71" (`z_float1920.png`). Give defense floats the same
  `key/value` merge the jungle uses (JungleScene.js:607), or a deterministic ±1-font-px x stagger per target.
- **P2-4. Zoom vs speed.** "− ×2 +" (zoom) sits beside "1× 2× 3×" (speed) in the night top bar. Two different "2×"
  appear next to each other. Show a magnifier glyph instead of "×".
- **P2-5. Pause controls.** Replace the run-on paragraph with a 2-column key/action list (`M_pause_1920x945.png`).
- **P2-6. `--danger` text at 4.3:1** on the panel ("Need 55 more Research", "Bramble Crawlers" in the readiness line).
  Use `#ff5a62` for text (4.9:1) and keep `#e43b44` for fills.
- **P2-7. Skill header baseline.** "1 skill point to spend" sits 3 px below "Pick 1 of 3" (`z_sum_skill.png`). Use
  `align-items: baseline` on its row.

---

## Large text: can it fit?

I prototyped Large in-page as N × 1.34, exactly one 8-px step everywhere: body 24 → 32 at 1080p, 16 → 24 at 720p.
183 rules were rewritten; screenshots are `L_*`.

**Fits as it is** (`L_explore_1920x945.png`, `L_results_*`):
- Jungle HUD, prompts, toasts, coach, GOAL strip.
- Results, death modal, pause, settings.
- Two exceptions in the HUD: "Stamina" collides (P1-1 fixes it) and "Overgrown Market" wraps to 2 lines (allow it).

**Overflows, with the layout change that would fix each:**

| Screen | Measured overflow | Layout change |
|---|---|---|
| Night sidebar | list 168 / 965 px visible | P0-1 chips + collapsed threat: the list then needs ~250 px at Large |
| Briefing cards | 548 / 540, coach overlaps the cards (`L_briefing_1920x945.png`) | Put GOAL / FINDS / DANGER labels *above* their values (drop the 64-unit label column, `.dc-line` screens.css:230). Drop "(get home to claim it)". Make the coach a flow element below the cards, not an overlay |
| Summary card | 154 / 514 | Two columns: "You got / Goal / Reward" and "Danger / Skill / Intel". Research as a footer chip |
| Workbench | 536 / 887 | P0-2 (prose to tooltip), plus tabs for Tower mods / Machete / Supplies (1-2-3 keys like Collection) |
| Collection | 677 / 819 | P1-1 node layout. One branch per tab below 1600 px wide |

**Recommendation:**
- Ship "Text size: Normal / Large" after P0-1, P0-2 and P1-1.
- Offer Large only when the window is ≥ 1600×860. At 1280×720 Large makes body 24 px on a 2× world, which is
  bigger than the HUD grid wants.
- If you want something now: a "Large HUD text" toggle (jungle HUD, toasts, prompts, floats, modals) fits today
  with no layout work.

## How to verify (round 3)

Run the same driver with `audit_fn.js` plus the scroller audit (`overflow: auto`, `scrollHeight > clientHeight + 2`)
at 1920×945, 1280×720 and 1024×600.

**Pass conditions:**
- Night prep: every enemy type on both lanes visible without scrolling, nights 1 and 4, all three sizes.
- Workbench and collection at 1024: no scroller, no mid-word breaks.
- At 1920×945, at least 5 % of text nodes larger than body on the workbench, collection and night screens.
- Sub-pixel x runs ≤ 10 % per screen.
- CDP: no Segoe UI Symbol or Cambria Math on the summary skill picker or the Codex.
- Big map: no label rect intersects another label or a marker rect.
