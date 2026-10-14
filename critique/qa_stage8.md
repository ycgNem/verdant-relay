# QA: Stage 8 release check (legibility + foraging)

Date 2026-10-14. Build: frozen snapshot `.playwright-mcp/frozen_r5/` (built 16:57, nothing in `src/` or `public/sprites/`
is newer). Driver `.playwright-mcp/roundQA8/driver.mjs` (headless Chrome, `http://frozen.test/`). Screenshots are in
`.playwright-mcp/roundQA8/` (names below; `z_*.png` are 3–6× zoomed crops). Viewports: 1280×720 and 1920×945.
Every screen was scanned for `NaN / undefined / null / [object / Infinity` in `document.body.innerText` and in every
`[title]` tooltip, for broken `<img>`, and for text boxes escaping their button/card/panel (`S.ovf`).

**Verdict: PASS for release (no P0).** No console errors, warnings or page errors in the whole session (the capture
was checked with a probe `console.warn`). Every debug state, the real save flow, Continue and foraging work. Two P1
legibility bugs on the night side panel are worth fixing before the push because Stage 8 is the legibility pass (the
first is a one-line CSS fix).

## Results

| # | Item | 1280×720 | 1920×945 | Notes |
|---|---|---|---|---|
| 1a | `?debug=briefing`: pick, Details, Head out | PASS | PASS | |
| 1b | `?debug=explore` Greenhouse n1, Flooded Transit n3, Data Center n5 | PASS | PASS (n3) | walk, slash, HUD, weather banners |
| 1c | explore `&mode=long`, `&mode=daily`, `&og=3` | PASS | n/a | mode/og applied (`run.mode`, `run.overgrowth`) |
| 1d | `?debug=defense&night=1/4/6`: build, upgrade (U), sell (S, S confirm), start wave, 30 s at 3×, `win()` | PASS | PASS | rewards pick → briefing works; see P1-1, P1-2 |
| 1e | `?debug=summary`: pick skill, Workbench, make Focusing Lens + Med kit, Prepare | PASS | PASS | resources/items/meds correct; tooltips are native `title`s, no bad values |
| 1f | `?debug=results&victory=1` and defeat; defense `debug.lose()` → results | PASS | PASS | P2-5 (debug only) |
| 2a | Fresh profile: title → New Run → briefing → Head out → guided day 1/7…6/7 | PASS | — | walk, cut, crate (+5 Scrap), Tab map, goal (guarded cache) done |
| 2b | Eat fruit when hurt (70 → 85), hit fungus stump (+1 Biofiber, host `done`) | PASS | — | via `debug.gotoForage` |
| 2c | Hold E at the Relay → summary (60 + 6 carried + 20 goal bonus = 86 Scrap) → skill → night prep | PASS | — | P2-1 on this screen |
| 2d | Build, start wave, 3×, night 1 finishes naturally (Relay 60/100) → reward → night 2 briefing | PASS | — | |
| 2e | Reload at briefing → "Continue · Night 2 of 6 · Briefing" → same resources, Relay, health, towers, skills | PASS | — | |
| 2f | Reload mid-day → "Continue · Night 2 of 6 · Day trip (counts as abandoned)" → "TRIP ABANDONED" summary | PASS | — | carried Biofiber dropped, base 71 Scrap unchanged, dawn health 75, +10 Research (first visit) |
| 2g | Extra: reload at night prep (stipend not doubled: 81 → 81) and mid-wave ("Wave (restarts)", Relay as at wave start) | PASS | — | |
| 2h | Debug runs never touched the real save (debug defeat in the same profile; save still night 2, best 1/6) | PASS | — | |
| 3a | `debug.forage()` counts (9 jungles: fruit 32–33, fungus 26, blooms 3, glints 32–44) | PASS | — | min fungus→lair distance 11.2 / 15.5 / 17.7 tiles (seeds 11, 222, 3333; rule ≥ 10) |
| 3b | Fruit: "+15 health", "+1 health" at 99 HP, info line at full health ("it will keep until you are hurt") | PASS | — | |
| 3c | Fungus: machete hit → Biofiber × area (Greenhouse ×2 = +2), host stays | PASS | — | |
| 3d | Dusk bloom: closed line by day; `debug.timeLeft(60)` → opens, toast, "Pick the dusk bloom (+1 Intel)" → +1 Intel, spent sprite; +5 Research at summary (also after going down, by design) | PASS | — | |
| 3e | Glint: heavy chop on the glint tile → +5 Scrap | PASS | — | |
| 3f | Big map (Tab): fruit / fungus / bloom dots, used = grey, day paused, labels not overlapping (also after `reveal()`) | PASS | PASS | P2-3 (legend) |
| 3g | Settings (title + jungle pause, tabs 1–3, Esc back), Collection (tabs 1–4, Esc) | PASS | PASS | |
| 3h | Pause menus (jungle, night lull) and the death modal (`debug.die()`) → summary "YOU WENT DOWN" | PASS | PASS | salvage/loss lines consistent with carried |
| 4a | No NaN / undefined / null / [object in any screen text or tooltip | PASS | PASS | 28 screens per viewport + the real flow |
| 4b | No missing sprites / magenta boxes / broken images | PASS | PASS | |
| 4c | No text overflowing panels | **FAIL** | **FAIL** | P1-1, P1-2, P2-1 |
| — | `npm run check:glyphs` (`tools/check_glyphs.py`) | PASS | | 90 glyphs, 84 files |

## Console errors

None. 0 `console.error`, 0 `console.warning`, 0 page errors across both viewports, all debug states, the real flow and
the three reloads.

## Bugs

### P0 (blocks release)
None.

### P1
**P1-1. Night prep: the Intel "Disrupt" button's label overflows the button (and the side panel at 1920×945).**
Repro: `?debug=defense&night=1&intel=4` (or any real night with Intel, e.g. after a dusk bloom). At 1280×720
"→ 10% fewer enemies" sticks out 6 px on both sides of the button; at 1920×945 by 22 px: its arrow lands inside the
Read button ("+4 Research→ 10% fewer…") and the last letter runs past the panel edge.
Cause: `.df-arrow { white-space: nowrap }` inside `.btn.df-half { flex: 1; min-width: 0 }`
(`src/ui/defense.css:143-146`; button built at `src/scenes/DefenseScene.js:1804`). Shorter text ("→ −10% enemies") or
allowing the arrow line to wrap fixes it.
Shots: `z_intel.png`, `wb_prepare.png`, `sw1280_def_prep_n6.png`, `sw1920_def_prep_n4.png`, `sw1920_def_prep_n6.png`.

**P1-2. Night side panel at 1920×945 (and 1280×720 with a coach hint) cuts text mid-line under the "▾ more" cue.**
The 640×316 view at 945 px leaves less height and the scroller clips boxes through a text line instead of between
lines:
- prep, night 4: the danger box shows half of "Extra Crawlers attack tonight:" and the top half of "South path"
  (`sw1920_def_prep_n4.png`);
- lull, night 4: "DANGER TONIGHT" and "GOT THROUGH" cut to their headings (`sw1920_def_pause_n4.png`);
- night 6, tower selected with the Colossus coach hint up: Upgrade / Sell are below the fold and the "Fit Focusing
  Lens" button shows as a 3-px strip (`sw1920_def_tower_n6.png`; U / S hotkeys still work);
- 1280×720, night 1 with Intel: the "You found Intel…" coach hint shows a sliver of its third line under "▾ more"
  (`wb_prepare.png`, `z_intel.png`).
Where: the side scroller and `_sideMore` / `.df-morecue` (`src/scenes/DefenseScene.js:1407-1442`,
`src/ui/defense.css:453-456`). Suggest snapping the scroller's visible height to whole boxes / lines, or putting
the danger line above the path chips when space is short.

### P2
**P2-1. Real night 1 prep at 1280×720: the REWARDS box and the night-1 zap line are below the fold.** Only a 2-px
green edge of the rewards box shows above "▾ more" (`real_prep.png`); PLAN M2 says the zap line is in the body on night
1. Same at nights 4 / 6 with Intel: the danger line is entirely below the fold (`sw1280_def_prep_n4.png`).

**P2-2. Some enemy icons in the night path chips are tiny and not whole-pixel scaled.** At 1280×720: Razorback
21×14 px (½×), Ruin Guard 14×19 (⅓×), Canopy Colossus 25×33 (¼×), next to a 46×44 Crawler; the briefing's Feral is a
speck too. The Razorback case is the one `src/core/Assets.js:433` says was fixed (critic H §2): with `r = 0.47` it falls
under the `creature && r >= 0.5` floor (`Assets.js:435`); Ruin Guard / Colossus look like they are not treated as
creatures at all (whole frame, no crop: `CREATURE_KEYS`, `Assets.js:38`, vs the visual key passed by
`DefenseScene._iconFor`, `DefenseScene.js:1249`). Shots: `z_chips.png`, `sw1280_def_prep_n6.png`, `brief_details.png`.

**P2-3. The big-map legend never gains "Dusk bloom (seen)" during the day you first meet a bloom.** The legend is built
once with the HUD (`src/scenes/JungleScene.js:1885`), so after seeing and picking bloom `b0` the map draws its (grey)
dot with no legend entry until the next day. Repro: explore, `debug.gotoForage('bloom',0)`, `timeLeft(60)`, pick it,
Tab (`fo_bigmap.png`, `fo_bigmap_zoom.png`).

**P2-4. Two-tone bar labels split a digit at the fill edge.** Night top bar at Relay 32/100 reads "=2 / 100" (the "3"
is half dark ink, half white; `z_relaybar.png`, `d1_after_reward.png`). Cosmetic.

**P2-5. (debug only) A debug defeat says "★ Best run so far: 2 nights"** though debug runs are not recorded (the debug
victory says "Debug run: not counted toward records"). `src/scenes/ResultsScene.js:103` lacks `!r.debug`
(`lose_flow2.png`). Also debug-only: after `scene.debug.win()` mid-wave the side panel keeps "22 to go / 29%" and the
still-coming lists.

**P2-6. Pause menu control line hyphen-breaks "right-/click"** (`pause_menu.png`). Cosmetic.

## Not bugs / observations
- Night prep "Start Wave" with a weak defense needs Shift+Space ("Start anyway") by design; plain Space does nothing.
- "Enemies are tougher every night (+546% / +986% health tonight)" is `HEALTH_MULT` × the map's `hpMult` as designed;
  the big percentages may read oddly to players.
- Guided day step 6/7 ("Open the crate here"): a 2 s E-hold half a tile south of the cache-side crate did not open it
  (prompt went to the spent goal cache?). Not reproduced deliberately; worth a look if critics mention it.
- Death keeps dusk-bloom Research (by design in `Run.applyExpedition`), while the bloom's Intel is lost with the pack.
