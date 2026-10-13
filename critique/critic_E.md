# Verdant Relay: Critic E (final-round playtest)

**Session:** 2026-10-13. I played the frozen build at `http://localhost:5191` in my own Playwright tab. Most of the session ran at 1280×720, with checks at 1920×1080 and 800×450. I cleared localStorage before starting. Screenshots are in `.playwright-mcp/round3/` (`E*` = run, `W*` = waves, `B*` = boss, `S*` = small or large window checks, `T*` = controlled boss tests). The helper scripts are in the same folder.

**How it was played**

- **Menus, prep and defense:** real Playwright clicks and key presses: N, C, K, 1–6, U, R, T, F, Space, Esc, Tab, and the mouse wheel.
- **Expeditions:** the first few seconds were played by hand. After that, the in-page bot from critic C (`round3/bot.js`) took over, sending real `keydown`, `keyup`, `mousemove` and `mousedown` events.
  - The bot uses BFS pathing, kites, cuts brambles, holds E, and does objectives, optionals and events.
  - The bot has perfect information about enemy wind-ups. To approximate a human, I made it skip a share of dodges at random: 0% skipped on N1–N3, 50% on N4, 40% on N6.
- **Debug hooks:** read-only state only, plus two `?debug=defense&night=6` boss tests. A debug run did **not** overwrite my real save: Continue still offered "Night 2 · Briefing" afterwards.
- **Environment:**
  - A stale tab 0 on `:5191` shared my origin, and another agent's tab was on `:5190`. I selected my own tab before every batch.
  - No console errors or warnings came from my tab all session (`browser_console_messages`, level warning, all = 0).

---

## Run log (real run, fresh save, **won 6/6**)

| N | District / objective (+ extras) | Expedition | Banked | Kills | Skill(s) taken | Prep (key actions) | Wave | Relay | Bounty | Unspent after wave |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Overgrown Market / Route Data (+locked cache) | Extracted with 2:09 left (51 s used), 100 HP, 0 damage | 49 S 2 C 1 B 5 I | 7 | Emergency Patch | Turret + Arc, Sabotage | ~13 | 100 → **100** | +7 | 36 S 2 C 2 B 2 I |
| 2 | Flooded Transit / Relay Box (+data log, Workshop event) | 49 s used, 100 HP | 102 S 2 C 2 B 2 I | 11 | Efficient Assembly, Long Sightlines | Free upgrade (Turret L2), Thorn, Snare, Turret #2, Thorn L2, Sabotage | 23 | 100 → **100** | +15 | 19 S 4 C 1 B 1 I |
| 3 | Data Center / Clear the Blockage (+cache, engineer, Power Surge) | 95 s used, 100 HP | 100 S 4 C 1 B **20 I** (+25 hoard, +15 engineer) | 24 | Overclock, Reinforced Core | Arc L2, Arc #2, Turret L2→L3, Sabotage, Decrypt ×6 | 31 | 125 → **125** | +23 | 41 S 4 C 2 B 12 I |
| 4 | Collapsed Residential / Clear the Blockage (+cache, Surge) | 58 s used, 80 HP (50% of dodges skipped) | 92 S 3 C 0 B 3 I (+25 hoard) | 18 | Prepared Defenses | Arc L2, Arc L3, Turret L3, Snare L2, Sabotage, Decrypt ×3 | 49 | 125 → **125** | +40 | 58 S 3 C 1 B 9 I |
| 5 | Data Center / Clear the Blockage | **Died in overtime.** After my mid-wave reload test the bot was gone, so the player stood idle all 3:00 plus 0:21 of overtime. This also tested timer run-out and death | 0 (lost 2 med kits) | 0 | none | Arc #3 on pad 12, Sabotage | 46 | 125 → **94** | +35 | 67 S 1 C 1 B 6 I |
| 6 | Flooded / Activate Pumps (+cache, Surge) | Started at 60 HP with 0 meds, 40% of dodges skipped. Extracted at 0:30, 50 HP, 150 s used (bot pathing stall) | 92 S 2 C 1 B 0 I | 25 | Field Tuning | Thorn L3 (½ price), Arc L2, Arc L3, Repair ×2 (94 → 124), Sabotage, Decrypt ×3, Toughest on the South towers | 38 + Colossus 2550 | 124 → **124** | ~+34 | — |

**Result:** victory, 338 kills, 291 Research earned. The only Relay damage in the whole run came on the night after a failed expedition, and the boss never reached the Relay.

**Boss timeline (N6, at 2× speed):**
- 0–23 s: untouched, because my towers were clustered near the core. It ran its approach → root → charge loop three times.
- From 23 s: it took steady damage.
- 38.6 s: enraged (roar, red ring, toast). Correct.
- ~43 s: dead. The enraged second act lasted about **5 real seconds (about 10 s of game time)**, and the Relay HP never moved.

**Controlled boss tests (`?debug=defense&night=6`):**
- **330 S, no skills, 6 towers (2 at L2):** Relay 100 → 0 in **9 seconds** (26–35 s). Support enemies overwhelmed it. The boss was still at 2252/2550 and never enraged.
- **470 S, 4 skills, 7 towers (Mortar + Beacon, several at L2):** Relay 100 → 0. The boss enraged at 1220 HP and was at 772 when the core fell. This was the only real "climax" I saw, and it was a loss.

---

## 1. Overall verdict

**Yes: this is a complete, readable game that a newcomer can learn without outside explanation.** The loop works end to end:

- briefing → expedition → summary and skill pick → prep → wave → results;
- Continue works from the briefing, from prep (after a reload) and mid-wave (the wave restarts);
- one-time tutorial hints cover every screen;
- the art is handsome.

What it is **not yet** is *tense*. In a competent run, nights 1–4 cost zero Relay HP, every expedition can be cleared in about a third of its timer, and the boss melts in a few seconds once it reaches a tower cluster. The danger only shows up after you fail or under-build. When it does show up, it arrives as a cliff rather than a slope.

| Axis | Score | Why |
|---|---|---|
| **Feel** | **7** | Movement, shooting, dodge and holds all respond well. Kills, hit flashes and damage numbers land. Defense at 2× is snappy, and the boss roar/enrage cue (red ring, toast, red tint) reads well. Lost points: towers are 16–24 px on the night map, so a build barely looks like it changes; expeditions rarely threaten you; the boss's second act is over almost before it starts. |
| **Clarity** | **7** | Strong onboarding: hints per screen, a wave preview with "NEW" tags and per-enemy notes, a boss tip with a lane name, costs everywhere, readable death and extraction modals, and a big map with a legend. Lost points: the bold pixel font makes some digits and letters ambiguous ('8' → '$', so "◈ 80" reads as "$0"); a few hints point at the wrong thing; the summary's Scrap arithmetic doesn't add up; the night's enemy row on the briefing is unlabeled icons. |
| **Balance** | **5** | The economy is generous: ~90–110 S per expedition in under a minute, Intel overflow, 15–40 S kill bounties. N1–N4 are free wins, and N4 "the hardest regular night" cost 0 HP. N6 has a knife edge: a 470 S / 4-skill build loses, while my ~650 S / 7-skill build lost 0 HP. Between those there is little middle ground. |
| **Polish** | **6** | No runtime errors, and saves are robust. But the **Results screen layout is broken at every window size**. Summary panels need inner scrollbars at 1280×720, there is a click-through bug on the "Night survived" banner, and there are several small overlaps (listed below). |

---

## 2. Bugs

No console errors or warnings were seen all session.

### Major

**E-M1. The Results screen's stat grid overflows the victory panel at every window size.**
- The "Kills" and "Research earned" tiles render outside the panel's right edge, floating semi-transparent over the backdrop art (the Relay sprite). They are hard to read.
- It happens on the run's payoff screen.
- **Repro:** win a run (or `?debug=results&victory=1`) at 1280×720, 1920×1080 or 800×450.
- **Evidence:** at 800×450, `.stat-tile` "Kills" is at x 434–501 while the panel ends at about x 380.
- **Shots:** `E53_results.png`, `E54_results_1080.png`, `E55_results_450.png`.

**E-M2. Bold text in the Tiny5 pixel font produces misleading glyphs, including prices.** All weights are bold unless noted.

| Glyph | Reads as | Examples | Where |
|---|---|---|---|
| '8' | '$' | "Unlock · ◈ **$0**" and "Cost: ◈ **$0** Research" (should be 80); Codex "HP 3$", "1$0"; Results "33$ kills"; "$ Circuits"; "×$" on the briefing | `E58_zoom_80.png`, `E61_unlock_mortar.png`, `E60_codex.png`, `E56_zoom_8glyph.png` |
| '6' | '€' | "Pad €", "€0 SCR" (Mortar cost), "North ▸ €", "1 / €" | `S12c_x.png`, `S13_prep_1080.png` |
| 'C' | 'O' (800×450) | "Scrap **O**arbine", "Infested **O**ache" | `S4b_x.png`, `S9_x.png` |
| "It" | "R" | "**R**s hoard: +25 Scrap" | `S9b_x.png` |
| '/' | 'f' (800×450, regular weight) | "100 f 100" on HP bars, "start f pause" | `S7_x.png`, `S15_x.png` |
| '%' | 'X' (800×450) | "15X faster" | `S9b_x.png` |

- **Likely cause:** Tiny5 ships only one weight, so `font-weight: bold` makes the browser fake a bold by smearing the strokes, which fills the counters of 8, 6 and C. Silkscreen has a real 700 weight. Use that for bold, or show emphasis with colour instead of weight.
- **Checked and fine:** 'F' vs 'A'. The F keycap, "Field Medic", "First visit" and "FINAL NIGHT" all render as F at all three sizes, so that earlier issue looks fixed.

### Minor

| # | Bug | Repro / evidence |
|---|---|---|
| E-m1 | **Enter on the title screen does nothing until you press an arrow key.** This is despite the hint "↑↓ choose · Enter select" and the first card being drawn highlighted. | Fresh load or reload, press Enter: nothing happens. Press ↓ and a focus ring appears on Continue/New Run, then Enter works (and with ↑ wrapping, I landed in Settings by surprise). `E31_title_arrow.png` |
| E-m2 | **Click-through from the "NIGHT N SURVIVED · click to continue" banner.** The same click also selects the district card under the cursor on the next briefing, so a district is chosen before the player has read the cards. | N3 → N4: clicked at (480, 350) and arrived with "Heading to Collapsed Residential Block". N4 → N5: clicked at (300, 350), card 1 pre-selected. Clicking at (911, 300), between the cards, did not select anything. |
| E-m3 | **The death modal omits lost med kits.** It says "You weren't carrying anything", but both carried med kits were lost (2/2 → 0/2, shown only on the summary). The modal title "You went down" is also in success green. | `E45_death_overtime.png`, `E46_summary_death.png` |
| E-m4 | **The summary's Scrap line excludes the Clear the Blockage hoard.** The "+25 hoard" appears only in "Tonight", so the totals don't add up. | N3: "+100 now 144" (19 + 100 ≠ 144). N4: "+92 now 158" (41 + 92 ≠ 158). `E_summary_n3.png`, `E_summary_n4.png` |
| E-m5 | **Summary panels clip at 1280×720.** With 3+ optionals or boons, the Expedition and Tonight panels grow inner scrollbars and the Research list is cut off. | N3 Data Center. `E_summary_n3.png` |
| E-m6 | **The first-summary hint covers the Expedition checklist.** It hides the "Open the locked cache" line; the cards it refers to are below. | `E06_summary_n1.png` |
| E-m7 | **The first prep hint points the wrong way.** It says "Costs are listed on the right", but the right panel shows the wave preview until you click a pad. | `E08_prep_n1.png` |
| E-m8 | **Briefing at 800×450: the label overruns the objective name** ("OBJECTIV**E**Salvage a Power Cell"). | `S3_zoom_card_450_x3.png` |
| E-m9 | **The tower side panel still truncates text.** "Refunds 70% of 60 Scrap spent (rounded…" is cut off even at 1920×1080. | `S13_prep_1080.png` |
| E-m10 | **The big map (Tab) header is overlapped** by the opening "District — Objective" banner during the first seconds. | `E64_tabmap.png` |
| E-m11 | **Mid-wave Continue drops you straight into the running wave** at 1× with no ready beat or pause. It is functionally correct: Relay HP and Scrap rewound to the wave start (Scrap 35 → 18), and the toast says the build was locked. | `E43_wave4_continue.png` |
| E-m12 | **Settings opened from the pause menu:** the pause panel ("Paused", "Resume", "Quit to Title") shows through the semi-transparent settings modal. | `E37_settings_from_pause.png` |
| E-m13 | **The wave footer contradicts the button above it.** "Building, upgrades and repairs are locked during the wave" sits under an enabled **Emergency Patch +15 (free)** button. The patch is usable mid-wave by design (`emergencyPatchInWave: true`). | Any wave with that skill. |
| E-m14 | **The Codex lists the Colossus at HP 1020** with "Relay dmg 40", but on N6 it has 2550 HP. A reader planning damage is misled by 2.5×. | `E60_codex.png` |
| E-m15 | **The Settings page doesn't suggest a resolution that fits the window.** Pixel-perfect scaling with the default "Chunky (intended look)" at 1280×720 shows a 960×540 game with heavy black borders, while "Sharp 640×360" fills the window exactly. Also, after toggling, the layout re-flows under the cursor, so my next click missed. | `E33_settings_pp_on.png`, `E34_settings_sharp.png` |

### Re-verified as fixed

| Item | Evidence |
|---|---|
| Best run | The title showed "2/6 nights survived" in N3 prep (correct). |
| Reinforced Core heals | 100 → 125/125. |
| Top bar on the survive banner | Shows the correct night ("NIGHT 3 / 6 · NIGHT SURVIVED"). |
| Toasts | Stay clear of the boss bar. |
| Prep Continue | Restores every build, upgrade and Intel spend. |
| Briefing Continue | Works. |
| Debug runs | Don't clobber the save. |
| Burrower / Spitter / Seed / Guard / boss notes | All appear in the preview with "NEW" tags. |
| Enrage at 50% | Roar → red tint → faster loop, with the "Skitters sprout" toast. |

---

## 3. Balance (with numbers)

### Expeditions are too short for their timer
- Full clears took **49–95 s of 180 s**. My bot extracted with every reachable container, optional and event done, and 1:25–2:09 left on N1–N4.
- The "stay or extract" decision (pillar 1) never came up. You can take everything every time.
- Income was ~90–110 S per expedition, matching the design target. Add 15–40 S in night kill bounties, and **Intel pours in**: 20 from one Data Center visit, which pays for Sabotage every night with Decrypt left over.

### Expedition danger is low
- With perfect dodges: **0 damage across three expeditions**, including a Clear the Blockage elite duel on N3.
- With 50% of dodges skipped (N4): 20 damage.
- My only death was an idle player standing through overtime. That also showed the overtime reinforcements work: about 13 spawned onto the start room and killed the player in about 20 s.
- HP carries over and is mostly a death-risk buffer, so the day phase rarely makes you sweat.

### Defense N1–N4 are free
| Night | Build | Relay HP lost |
|---|---|---|
| N1 | 2 towers | 0 |
| N2 | 5 towers | 0 |
| N3 | 6 towers (2 at L3) | 0 |
| N4 | 6 towers (3 at L3) — the night DESIGN calls "the hardest regular night" | 0 (the wave ended about 37 s in at 2×) |

The stacked player bonuses add up fast: skills, Power Surge, Sabotage + boon cuts, and repairs.

### N5 bit only after a failed expedition
- 0 loot that day. The one new Arc Spire cost 36 S, and the wave took 125 → 94 (−31): Ruin Guards plus Spitter sap at the core.
- That was the only "tense but fair" night I saw, and it took a failed expedition to get there.

### N6 is a cliff, not a climax
- My real build (~650 S invested over the run, 5 towers at L3, 7 skills) killed the Colossus with **0 HP lost**, about 5 real seconds after it enraged.
- The two controlled builds (330 S unskilled; 470 S + 4 skills + Mortar/Beacon) both **lost the Relay to the support wave**. In the first, the boss never even enraged.
- So the same encounter goes from "boss evaporates" to "core falls in 9 seconds" across roughly 200 S of investment.
- The boss itself is rarely the threat. The crawlers from its roots plus the Guards and Spitters are.

**Is the boss a climax? Not yet.** The presentation is there: name bar, phase labels, a roar, the final-night banner, "The Relay Holds". But when it is beaten, it is beaten in one short burst; when you lose, you lose to adds. The enraged phase needs time on screen. Possible approaches:
- enrage at 60% with brief damage resistance during the roar;
- a heal or shield during root;
- spawn the boss earlier so it meets towers mid-map;
- cap how much damage clustered towers can deal per second.

---

## 4. Remaining polish and clarity issues

- **Towers are tiny on the night map.**
  - About 16 px tall at 1280×720 and about 24 px at 1080p. The build-list icons are about 10 px.
  - Arc Spire vs Pulse Beacon vs Snare are hard to tell apart at a glance. Upgrades show only as chevrons.
  - Build pads and towers need about 1.5× scale, or a larger level badge.
- **The briefing's "Night N wave" row is bare icons with counts.**
  - On N6 the Colossus is one unlabeled "×1" among eight icons.
  - It also doesn't include the selected district's threat (the line "Plus the threat from the district you choose" admits this).
  - Name the units, or at least the boss and the new arrivals.
- **Spacing at 800×450.** Every text is at the 8 px floor, and the HUD panels crowd the play field. The objective panel and minimap take the top-right 25%. It is readable, but with the glyph issues above it is tiring.
- **The wave preview scroll position persists.** On a later prep, the THREAT block was scrolled out of view. Reset the scroll to the top on each new night.
- **Summary columns.** "Research Data" lines can push the totals out of view at 1280×720. Consider a two-column layout or a smaller line height.
- **Hint copy.** Fix the prep hint (see E-m7). The summary hint should anchor to the skill cards, not float over the checklist.
- **The final-night banner works well** (red "⚠ FINAL NIGHT…"), and so does the "Tomorrow night: the Canopy Colossus" teaser on N5. Keep those.

---

## 5. Top 10 fixes by impact

1. **Fix the Results screen grid overflow** (E-M1). It is the reward screen and it currently looks broken at every size.
2. **Stop using synthetic bold on Tiny5** (E-M2). Use Silkscreen 700 or colour for emphasis, so that 80 doesn't read as "$0", 6 as "€", C as "O", or "/" as "f". Then re-check 800×450.
3. **Make N1–N4 cost something.**
   - Raise N3/N4 wave HP or counts by about 15–25%.
   - Or trim the early economy: the per-night bounty, the +15 Prepared Defenses, and Intel at ×2.
   - Target 10–25 HP lost on N3–N4 for a decent build.
4. **Put the timer back in tension.** Shorten the expedition to about 120–140 s, or spread loot across more or larger rooms, so a full clear takes about 150 s. Optionally escalate spawns after 90 s.
5. **Give the Colossus a real second act.**
   - Make it vulnerable to the cluster later, or enrage at 60% with a short damage-resistance roar.
   - Make the enraged phase last at least 20 s of game time even against a strong build.
6. **Flatten the N6 cliff.** Make the boss night less about support swarms (fewer root-spawned Crawlers, or spawns weighted toward the boss's own lane), so a 450–500 S skilled build scrapes a win instead of collapsing in 9 s.
7. **Swallow the banner's dismiss click** so it doesn't select a briefing card (E-m2). Make **Enter** on the title activate the highlighted item (E-m1).
8. **Make the death and summary numbers honest.**
   - The death modal should say "Lost: 2 med kits".
   - The Scrap line should include the +25 hoard (or show it as its own row).
   - The Codex should show the N6 boss HP.
9. **Enlarge night-map towers and pads**, and label the briefing's wave icons, especially the boss.
10. **Small layout cleanups:**
    - summary panel overflow at 720p;
    - truncated side-panel text;
    - the OBJECTIVE label collision at 800×450;
    - the hint anchors (prep and summary);
    - pause bleeding through Settings;
    - the "repairs are locked" footer under the Patch button;
    - a "best fit" suggestion next to Pixel-perfect scaling.
