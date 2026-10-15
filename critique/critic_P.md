# Critic P: Build-anywhere night defense, played for balance

**Session:** 2026-10-15. Frozen build `.playwright-mcp/frozen_s9/`, served at `http://frozen.test/` by request interception in
my own headless Chrome (GPU). The driver, helpers and every screenshot are in `.playwright-mcp/criticP/`. Most play was
at 1280×720, with UI passes at 1024×600 and 1920×1080.

## How it was played

**Real inputs for everything a player does:**
- Build-card clicks and hotkeys 1–6, ghost hover, click and Shift+click to build.
- Arrow-key cursor with Enter, Tab, right-click and Esc.
- Tower clicks, then Upgrade, branch half-buttons, U, Toughest and Repair.
- Disrupt (wheel-scrolling the preview to reach it), Space / Start anyway, and the 3× button.
- Q (Vine Snare): hotkey, mouse to the densest enemy group, click.
- Lull builds, N (call next push), Emergency Patch, salvage keys 1–3, Enter through the banners.
- The real briefing → summary flow: area pick by key, skill pick by key 1–3, Enter past the Workbench.

**Compressed days only:**
- The briefing pick, then the jungle loads.
- The day's haul is set from a profile: loot Scrap/C/B/I, whether the quest got done, sometimes a beacon.
- The jungle's own `_finish('extracted')` then runs the real `applyExpedition` and summary.

**Profiles:**
- **typ:** the sim's "typical", 70–100 loot Scrap, 1 C/B/I, quest 80% (≈ +20 bonus Scrap).
- **mid:** ≈ the real median from critics J2/N plus foraging: 40–60 Scrap, quest 60%.
- **newc:** the sim's newcomer: 35–55 Scrap, quest 45%.

**Placement planning:**
- "Thoughtful": I rank free tiles by the same path coverage the ghost's tag shows.
- I then hover the top two to read the tag, and build the best.
- "Casual": click the card, then click one of the nearest free tiles to the Relay, without reading the tag.

## 0. The short version

The build UI is good: clear, quick, readable. Free placement creates real but shallow decisions, and beacons don't
matter. The difficulty problem has moved:

- **A thoughtful player with sim-typical income wins with about 66 HP left.** Nights 1–3 cost 0–9 and are dead time; N5 is the one hard night.
- **Everyone below that income falls on night 4.** That includes:
  - a thoughtful placer on a median income;
  - a casual placer on either income.

Night skill moves results less than Scrap a day does. The forecast is honest: 20 of 26 nights landed in its band, and
all 4 falls were flagged "Too weak" before Start.

| Score | /10 | Why |
|---|---|---|
| Build UI clarity | **7** | The ghost, reasons, coverage tag, Shift+click, keys and toasts all work. Two problems at 720p: Intel buttons hidden below the fold, and "Call next push" cut off in lulls. "Covers no path" builds are allowed silently. |
| Placement depth | **5** | Near-base vs good spots decides nights (fell vs −75). But many tiles are near-best, the tag solves it, and beacons add ±1 HP. |
| Difficulty-appropriateness | **5** | Strong players: N1–3 still free, N5 bites, comfortable win. Median and casual players: a hard wall at N4. |
| Fairness | **6** | Losses are explained (leak feed, "Too weak", named leakers). But the wall is set by day income more than by what you do at night. |
| Forecast honesty | **8** | Calls 77% of nights in band and flags every fall. It under-calls a few casual nights. |

---

## 1. Six campaigns (Relay HP lost per night)

Forecast band in brackets (`lo..hi`, from the prep after building). "raw" means before the Emergency Patch's +15.

| Run | Map, profile, play | N1 | N2 | N3 | N4 | N5 | N6 | Result |
|---|---|---|---|---|---|---|---|---|
| **A** | Twin, typ, thoughtful (manual) | 0 [0..3] | 0 [3..14] | −9 [2..11] | −26 [11..34] | −51 raw [20..53] | −27 [8..27] | **Won, 66 HP, Colossus killed** |
| **F** | Ford, typ, thoughtful (manual) | 0 [0..3] | −9 [1..10] | 0 [6..21] | −20 [17..48] | −58 raw [33..84] | −26 [17..48] | **Won, 67 HP, Colossus killed** |
| **E** | Crossing, typ + Mortar/Pulse/3 Protocols, scripted turret-heavy | 0 | −15 [6..21] | 0 [5..20] | −22 [14..41] | fell from 88 [Too weak 44..111] | — | **Fell N5** |
| **C** | Ford, *mid* income, thoughtful (scripted) | 0 [0..3] | −22 [12..35] | −16 [17..46] | fell from 77 [Too weak 32..81] | — | — | **Fell N4** |
| **D** | Twin, typ (same days as A), casual near-base | −13 [5..20] | −26 [6..23] | −82 [Too weak 35..88] | fell from 47 [Too weak 35..90] | — | — | **Fell N4** |
| **B** | Crossing, newc, casual near-base (card clicks) | −15 [2..11] | −12 [5..20] | −39 [17..46] | fell from 69 [Too weak 30..79] | — | — | **Fell N4** |

Evidence:
- **A:** `b03_n1_prep` → `b35_n6_end`; boss mid-fight `b34_n6_w2_4`; results `b36_results`.
- **F:** `g*`.
- **E:** `f*`.
- **C:** `d*`.
- **D:** `e*`.
- **B:** `c*`.

What the table says:

1. **For a thoughtful, well-fed player (A, F) this is no longer a cakewalk, but the first half still is.**
   - N1–N3 cost 0/0/−9 and 0/−9/0. You build 3–4 towers on night 1 and never feel pressure until night 4.
   - N5 ("Swarm night" / "Guards and tunnels", 49–54 enemies) is the real exam.
   - Both runs needed the Emergency Patch plus repairs on N5. Both ended at 66–67 HP.
   - The sim's "typical −23/−38/−75 on N4–N6" is harsher than what a careful human gets: I took −20…−26 / −51…−58 / −26…−27.
   - N6 is easier than N5 when the Snare is saved for the Colossus: 3–4 casts hit the boss in both runs (`b34_n6_w2_4`).
2. **Income, not night play, is the gate.**
   - Run C placed as carefully as F (same scorer: junction tiles, a mix, upgrades, Disrupt) on about 60–75 Scrap a day. It fell on N4 with 77 HP, with 8 towers and 3 Scrap left (`d4_n4_built`).
   - Critic J2's real players banked ~17–40 a day; with foraging, ~35–55. That is run C's income or less.
   - So the median player who plays the night well now meets a wall on N4. Before Stage 9 they already fell N4 (J2); now they fall harder and earlier in the night.
3. **Placement matters, which is good.**
   - On the same days as A, a casual near-base build (D) fell on N4, where A took −26.
   - D took −82 on N3 because near-base tiles run out fast.
   - The 4th–6th "nearest" tiles cover 0–3 path tiles (`e3_n3_built`: two towers tucked up in the canopy covering nothing).
4. **Monocultures are punished, also good.** E spammed Scrap Turrets with 7 Circuits and 4 Biofiber unspent and fell on N5: Burrowers −36, Crawlers −30. The forecast had said "South ○○○ Burrowers".

### Forecast honesty

| | Count |
|---|---|
| Nights where the result fell in the forecast band | **20 / 26** |
| Better than the band | 4: A N2 0 vs 3..14 · C N3 −16 vs 17..46 · E N3 0 vs 5..20 · F N3 0 vs 6..21 |
| Worse than the band | 2: B N1 −15 vs 2..11 · D N2 −26 vs 6..23 |
| Falls flagged "Too weak" before Start | **4 / 4** (each needed "Start anyway") |
| "Too weak" nights that were survived | A N5 before spending (−65 → Risky −36 after 3 upgrades + Disrupt); F N5 at Too weak 33..84, survived at −58 raw |

- **Misses are one-directional by player type.** The forecast is pessimistic for thoughtful N2–N3 builds and slightly optimistic for casual early nights.
  - Casual: near-base towers cover the late path, where Crawlers arrive bunched.
  - Thoughtful: Vine Snare on 4+ crowds isn't counted.
- Neither miss changed a decision. Good work.

---

## 2. Is free placement degenerate?

No. But it is shallower than it looks.

**Same night, same towers** (N3 Ford, debug: 330 Scrap, 8 level-1 towers, no skills, Vine Snare; seed 777, variant A;
`z1…z5_built`):

| Layout | Beacons | Relay left |
|---|---|---|
| Chokepoint: best "both paths" tiles at the merge | 4 on | 21 |
| Path mouths: most tiles inside the beacon light | 4 on | 25 |
| Near the Relay (nearest free tiles) | 4 on | **fell** |
| Chokepoint | **off** | 22 |
| Most total coverage (spread along both paths) | off | **34** |

At N4 and N5, the same 420 Scrap of level-1 towers loses whatever the layout (`x*`, `y*`). Upgrades and skills carry
the late nights.

**How many tiles are near-best** (turret range 4.5, two paths of ~65 tiles):

| Map | Best turret tile covers | Tiles within 80% of best | Mortar (range 7): best / median tile |
|---|---|---|---|
| Twin | 21 (13,9) | 39 | 46 / 21.5 |
| Crossing | 26 (15,8) | 24 | 41 / 21.5 |
| Ford | 28 (13,9) | 14 | 49 / 21.5 |

- No single tile wins. The paths converge in front of the Relay on every map, so "build where the tag's number is biggest" is the whole skill.
- With the one-tile gap, the 4–6 best spots fill on night 1–2 and the rest are interchangeable.
- The Ford merge is the strongest chokepoint: 28 tiles, and it really is where both of my Ford runs stacked 6 towers (`g4_n4_built`). It isn't broken: hpMult ×1.18 there already pays for it.
- **Beacons don't matter.** +15% on the first 5 tiles of a path changed the result by 1 HP (21 vs 22).
  - The lit stretch is at the far west edge, away from the good tiles.
  - The tower that sits there (25 left) does no better than one at the merge.
  - The preview spends a line on it every night (`b05_n1_built`, `b20_n4_prep`), and the cyan pools are pretty, but there is no decision in it.

---

## 3. Build UI

### Works well

- **Pick a type → green/red snapped ghost, range ring, path dots and the tag.**
  - Tags read like "Covers North 10 · South 10" (`b04_ghost_turret`).
  - Reasons read Path, Hides path, Rocks, Tree, Relay, Lamp (`u01_close`, `u02_path`, `u04_rock`).
  - Hovering the top 2–3 tiles and comparing numbers took me about 3 s per tower.
- **Click to build.** The new tower is selected with Upgrade and Sell right there (`u05_after_click`). Building then upgrading is two clicks or a click and U.
- **Shift+click keeps the type.**
- **A click on a blocked tile gives a red toast with the long reason** ("Enemies walk here: towers go beside the paths.").
- **Right-click and Esc put the type away.** Esc with nothing picked opens Settings, which is expected.
- **Keyboard:** the number picks a type, and the arrows move the cursor from wherever the mouse last was.
  - The camera follows at ×2 (`v09_720_zoom2_keys`).
  - Enter builds or refuses silently: no toast on keyboard refusals, only the red tag.
- **Upgrading via Field Tuning, free upgrades and branch half-buttons** all worked with the mouse (Piercer/Lance picks).
- **1920×1080 at ×2 shows the whole field** (`v04_1080_prep`).
- **1024×600 fits** (`v02_1024_ghost`).

### Problems (by how much they cost a player)

1. **Intel buttons are invisible at 1280×720 in prep.**
   - The Read and Disrupt buttons sit inside the wave-preview scroller, below "▾ more", and the build bar covers the rest.
   - Meanwhile a ~110 px blank band sits between "▾ more" and BUILD (`b27_disrupt`).
   - In run A I clicked "Disrupt" on N3 and N4 and nothing happened: the Intel stayed, and the wave was 10% bigger than it needed to be.
   - It takes 8 wheel steps inside the preview to bring it up (`b28_preview_scrolled`). On F's N6 my helper overshot and gave up.
   - A player who never scrolls that box never sees Disrupt.
2. **In a 720p lull, "Call next push" is cut off.**
   - The foot ends at y = 727 in a 720 px window (`v05_720_lull`).
   - The leak feed shows only its header ("−38 tonight", no rows), and the next push's South list is clipped.
   - This is critic K2 §0.1 again.
3. **You can build a tower that covers no path, silently.**
   - Casual runs built 4 of 13 towers on tiles covering 0–1 path tiles: 19,2 / 21,2 "Covers no path", 21,11 "Covers 1 tiles", 22,11.
   - Those tiles are behind the plaza and up under the canopy (`e3_n3_built`: the Snare Vine at the top is half hidden by the tree).
   - The tag says it in white like any other number. It should be amber and ask, or be blocked.
   - Also "Covers 1 tiles" should read "Covers 1 tile".
4. **Free-tile corners are invisible on grass at ×1** (`u01z_corners`).
   - The dark-green 1-px ticks vanish on the jungle floor, and tall-grass tufts on free tiles sit on top of them.
   - At ×2 they read (`v09`).
5. **Old pad slabs are still painted on the ground.**
   - Twin around tiles (6,12) and (10,12) (`b03_n1_prep`, the two square stones); Ford left of the merge (`d02z_spire`).
   - They look like build pads but mean nothing now.
6. **Visual overlaps.**
   - Lamp posts draw through turrets beside the plaza (`c02z_lamp`).
   - The palm on the tile above the Ford merge looks like it grows out of the Arc Spire (`d02z_spire`).
   - Neighbouring turrets two tiles apart touch at the barrels in the central cluster (`b20_n4_prep`). They're readable, but it's a dense knot.
   - A red ghost on a "Hides path" tile next to a tower draws over that tower (`u01_close`).
7. **At 1024×600:**
   - The build-bar title truncates ("Arc Spi…").
   - "keys 1–4" wraps onto two lines.
   - The zoom − / + buttons don't show (`v02_1024_ghost`).

---

## 4. Prioritised fixes

### 1. Break the N4 income wall

Three of four sub-typical runs fell on N4 at 47–77 HP; typical-income thoughtful runs took only −20/−26 there.

- **`src/data/waves.js` `HEALTH_MULT`:** N4 **9.2 → 8.5**, N5 10.8 → 10.4.
- **`src/data/config.js` `relay.stipend`:** [0,10,15,20,25,30] → **[0,10,20,30,35,35]**.
  - A flat +10 on N3–N5 is ~+15–20% of a median day but only ~+8% of a typical one, so it narrows the gap without making the top easier.
- **Acceptance (sim + one real run):**
  - the "mid" profile (40–60 Scrap, quest 60%, thoughtful placement) reaches N5 with ≥ 30 HP;
  - typical thoughtful N4 costs −15 to −25;
  - newcomers still fall by N4–N5.

### 2. Make nights 1–3 a decision for strong players without punishing weak ones: a player-chosen dare

Every curve change so far moves both groups together.

- **Add a "Provoke" button in prep** (`DEFENSE.provoke` in `waves.js`): +25% enemies tonight for +30 Scrap and +50% kill bounties.
  - Shown from N2, once a night, mirroring Sabotage.
- **Show it in the forecast** so the band moves. A thoughtful player at "Looks strong" takes it every early night; a newcomer never sees a reason to.
- This is the honest answer to "cakewalk": the user's own play, on 0/0/−9 nights, gets a lever. Pure HEALTH_MULT raises have already pushed the median off a cliff.

### 3. Make beacons count

Today they are worth ±1 HP.

- **`defenseMap.js` `BEACON_LIGHT`:** `bonus` 0.15 → **0.35**, `tiles` 5 → **7**.
- **Make burrowers surface in the light**, so it can be shot like a Flare. That makes a beacon trip the day's counter to Tunnels / "Guards and tunnels" (N4/N5's burrowers cost 24–36 HP in A, C, E, F).
- Then the lit mouth becomes a real alternative to the merge for one or two towers.

### 4. Fix the 720p panel

- **Prep:** move Read and Disrupt out of the preview scroller into one compact row just above BUILD, and let the scroller fill the blank band.
- **Lull:** cap the next-push list to two rows plus "more", so the foot (Repair, Call next push) always fits in 720 px. Fail the layout audit if any `.df-side` button's bottom is past `innerHeight`.

### 5. Guard pointless placements

- **When a non-support tower would cover fewer than 3 path tiles:** show the tag in amber, and require Shift+click (or a second click on the same tile) to build there. Toast: "Barely sees a path".
- **Fix the plural:** "Covers 1 tile".
- This also helps the newcomer (B/D) more than any number change: half their late towers were wasted.

### 6. Make the forecast's leaker line name the counter

- "South ○○○ Burrowers — bullets can't hit them: Arc Spire / Snare / Mortar".
- Run E fell on N5 holding 7 Circuits (2 Arc Spires' worth) after being told only "Burrowers".

### 7. Visual clean-up

- Brighten the free-tile ticks at ×1 (white at 60%, or 2-px ticks) and draw them above grass tufts.
- Remove the old pad slabs from the Twin and Ford ground art.
- Block (or cull foliage in front of) towers in the top row under tree canopies.
- Nudge the lamp sprites' depth so they don't cut turrets.

### 8. Boss night

Fair as is: killed 2/2 in thoughtful runs at −26/−27, with the Snare saved for the charge. Leave the Colossus at ×6
until fix 1 lands; the median player never sees it today.

---

## 5. Raw notes

- Night length at 3×: N1 14–17 s real, N3 42–66 s, N5–N6 51–56 s. Calling pushes early (N) works and pays.
- The Emergency Patch button shows during pushes and in lulls; it's useful on N5.
- The salvage offer after a −9 night was still "A clean night: pick a reward" (3 options; the threshold is 10 lost). That's fine.
- Debug-night caveat: debug runs have no skills. With no skills, 420 Scrap of level-1 towers can't hold N4–N5 on any layout, so balance probes past N3 must use campaign-carried builds (as above).
- Scripts:
  - `lib.js` (real-input helpers), `day.js` / `sum.js` (the day → summary flow).
  - `smart.js` / `newc.js` (thoughtful vs casual placement), `thprep.js` / `lull.js` (prep/lull spend).
  - `disr.js`, `exp.js` (layout experiment).
  - `loadall.sh` loads them into `driver.mjs` (port 7612). The driver is stopped.
