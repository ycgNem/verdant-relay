# Critic K2 (round 2): the night tower defense

**Session:** 2026-10-14. Frozen snapshot `.playwright-mcp/frozen_r2b/` in my own headless Chrome (GPU), mostly at
1280×720, with UI passes at 1920×1080 and 1366×768. Scripts, plans, `*.out.json` results, screenshots and logs are in
`.playwright-mcp/roundK2/` (`night2.mjs` plays one night per plan in `plans/`; `campaign2.mjs` plays a whole run).

**How it was played**
- **Real input for everything a player does:** pads, build cards (wheel-scrolling the panel), Upgrade, branches,
  targeting, Sell, Repair, Trade, Disrupt, Start, speed buttons, zoom, pan, Q/W/E/N/F/P/Space, salvage, banners.
  Protocols were cast with the hotkey, a mouse move to the enemy cluster, then a click.
- **Read-only instrumentation** (`enemyReachedCore`, `spitAtCore`, `bossSlam`, `_kill`, `protocols.cast`). Sweeps
  ran at ×2–4 sim speed; feel passes at 1×, 2× and 3×.
- **100 scripted debug nights** plus UI probes: tall/wide 19, placement 12, Mortar 4, boss 20, Protocols 20, maps 6,
  readiness 9, "what decides N4" 10.
- **Two full real runs from the title,** `KR2a` (research unlocks) and `KR2b` (fresh profile). Days were compressed
  as in round 1 (loot 70–105 Scrap + 1 C/B/I, objective done, extract); briefing, skill pick, Workbench, prep, pushes,
  lulls, salvage, banners and Results were the real flow.
- **Seeds:** debug nights without `&seed=` roll a new jungle and danger path (±15 HP between repeats). The Protocol and
  night-4 sets use fixed seeds.
- **Console:** 0 errors at night. `KR2b`'s boot logged a WebGL `context lost` plus 88 `object does not belong to this
  context` warnings at the title (4 GPU browsers at once, probably environmental).

---

## 0. The short version

The night is no longer a 90-second loading screen. Most of my round-1 Top 12 landed, and they work:

- **Upgrades are a real buy:** at equal spend, tall 34 ≈ mid 36 > wide 24.5 Relay HP.
- **Placement decides nights:** the same 10 towers end on 53 or 0 depending on where they stand.
- **The Mortar and the Seed Carrier rule work.**
- **Tanks have answers.**
- **The Colossus died in 22 of 22 nights.** A Vine Snare saved for its charge is worth ~+12 Relay.
- **The leak feed, banner and Results say what got through.**
- **The forecast is honest on average:** 80 of 90 nights land in its band. One losing night-1 build was called "strong".
- Both real runs were won: Relay lost 0/0/0/5/30/9 with research, and 0/9/0/0/49/14 without.

What holds it back now:

1. **At 720p the side panel breaks in lulls,** exactly when the new systems need it:
   - the build list shrinks to 113 px, or 17 px with a coach hint docked, and then I could not build at all;
   - with Repair and the leak feed showing, "Call next push" ends off-screen (footer at y = 785 in a 720 px window).
2. **The Protocols pay in the wrong places.** On a fixed N5 board, Q + W + E added +18 Relay (36.5 vs 18.5 left).
   - Almost all of that came from W + E burning 4 spare Circuits.
   - Vine Snare on crowds is worth ≈ 0 (+2.5 and −6.5). On the Colossus's charge it is the best play in the fight.
   - W per cast doesn't scale: 120 damage on night 4, under half a Crawler.
3. **Lulls are a key press:** 3 of 20 lulls in two real runs had a purchase; "Call next push" pays +5–6 Scrap.
4. **The night's own play moves outcomes less than the day's choices.** Nights 1–4 cost 0–9 in both real runs.
   Replaying a real night-4 build on one seed, 4 day-picked night skills cut the loss from 21 to 7.5; Snare on crowds
   added 6.5. The tension sits on one night (N5) and rides on skill picks and the area card.
5. **Small truthfulness bugs:**
   - a global speed threat is shown as "Comes down the North path ⚠";
   - "94" on the Relay bar reads as "34" at 720p;
   - a "Relay patch" salvage is offered at full health;
   - stale coach hints squat in the panel.

---

## 1. Round-1 experiments, re-run

### 1.1 Tall vs wide at equal spend (night 4, Twin Paths, variants A/B/C × 2, Protocols off)

| Build (Scrap spent) | Towers | Relay left, 6 runs | Mean |
|---|---|---|---|
| **Wide**: 12 × L1 (550) | 12 | 17 · 11 · 32 · 28 · 39 · 20 | **24.5** |
| **Tall**: Piercer + Repeater + Hornet L3, Arc L2, Snare L2 (530) | 5 | 14 · 18 · 35 · 42 · 50 · 45 | **34.0** |
| **Mid**: 6 × L2 + 2 × L1 (553) | 8 | 17 · 34 · 48 · 38 · 45 · 34 | **36.0** |

Round 1: wide 74/60 vs tall lost/2. **Now the order is reversed, and the spread is ~11 HP, inside my ±10 target plus
noise. Fixed.**
- The +6 surcharge and the ≈0.9× L2 make upgrades pay.
- The branches are real choices: Piercer vs Repeater (`U08_branches.png`).
- Wide is now slightly behind, because towers 9–12 land on pads that see only 8–11 tiles of path (`cover_out.txt`).

### 1.2 Placement: the same 10 towers, four placements (night 5, 605 Scrap, 3 variants)

| Placement | Pads | Relay left (A / B / C) | Mean |
|---|---|---|---|
| **Center**: both-trail pads, Snare L2 beside the Relay | 3, 2, 4, 11, 9, … | **100** / 17 / 43 | **53** |
| **Cover**: best path coverage | 4, 2, 11, 0, 7, … | 55 / 10 / fell | 22 |
| **Relay funnel** | 9, 11, 4, 8, 5, … | fell / 5 / 13 | 6 |
| **Forward**: 4 beacon pads + far pads | 12–15, 0, 6, … | fell / fell / 1 | 0 |

**Placement now decides the night** (round 1: an 8–24 HP band, "solved"). Two problems remain:

1. **The winning idea is invisible.** A slowing Snare inside the Relay zap's 3-tile radius won `PL_center_v0` with 0
   leaks (58 zap hits). Nothing tells you the zap exists beyond one prep line, or that slowing feeds it.
2. **Forward pads are a trap.** They see 5–11 tiles of one trail; central pads see 15–27 of two (`cover_out.txt`). They
   sit as far from the zap as possible. Every forward-heavy layout fell or ended on 1.

### 1.3 Tanks

Round 1: every Ruin Guard leaked in 8 of 8 night-5/6 builds.

- **Real runs:** 0 Ruin Guards leaked in either run with a Piercer L3 and Arcs.
- **No-skill debug builds:** 1–3 of 3 still leak (−10…−30).
- **Razorbacks:** a fresh-profile night 2 still pays 9 for its single Razorback. That is the night's test, and fine.

**Fixed.**

### 1.4 Mortar vs Seed Carriers (night 4 "Seed swarm", 2 Mortars at L2 vs 2 Turrets at L2, 2 runs each)

| | Damage per tower | Seed Carriers that burst | Relay left |
|---|---|---|---|
| With Mortars | Mortar 1 912–2 376, **the top dealers** (Turret L2: 984–1 232) | **2 of 5, 2 of 4** | 31 / 35 |
| Without Mortars | — | 5 of 5, 5 of 5 | 26 / 16 |

**Fixed.**
- At least 50% of carriers in Mortar range die clean (round 1: 0%).
- The Mortar build ends +12 HP ahead.
- Its pips (Power 2, Range 3) now tell the truth.
- Without the Mortar research (`KR2b`) there is no blast answer at all: N5 lost 18 to Seed Carriers.

### 1.5 The boss (night 6 "Colossus" A and C, one 780-Scrap build)

| Plan | Relay left | Slams (5 each) | Kill time |
|---|---|---|---|
| All First in line ×4 | 51 · 37 · 47 · 47 (45.5) | 3–4 | 161–171 s |
| Boss tip: 2 deep towers on Toughest ×4 | 38 · 58 · 42 · 62 (50.0) | 3 | 160–173 s |
| Everything on Toughest ×3 | 40 · 26 · 57 (41.0) | 3 | 157–164 s |
| Protocols on crowds (Q/W/E) ×4 | 52 · 46 · 33 · 44 (43.8) | 3–4 | 164–174 s |
| **Vine Snare saved for its charge ×4** | **73 · 52 · 51 · 53 (57.3)** | **1–2** | 171–189 s |

The Colossus died in all 19 of these runs, in the 1080p run, and in both real runs. In the real runs it died *before*
reaching the plaza (0 slams).

**The fight now has a shape:** it walks into range → roots while Crawlers sprout → telegraphs a red charge path
(`BX_1080_boss_chargeWind_108.png`) → roars at 60% (`…_roar_147.png`) → besieges with a slam ring (`…_siege_169.png`:
772 HP left, dead 6 s later) → dies with a correct Results line.

**Counterplay is real:**
- Both Snares in the 1080p run cancelled the charge: wind-up → walk within 0.7 s in the samples.
- Saving Q for the boss is worth +12 over First and +14 over spending it on crowds.
- The tip now helps a little (+4.5); Toughest-everywhere is the worst (−4.5).

**What's weak:** the boss cannot threaten the run.
- It deals 5 per slam, at most 8 slams = 40, and in practice 0–20.
- The escort does the rest of the night's 27–74 loss.
- The Relay zap never reaches it at the plaza: it stands 3.2–3.7 tiles away against a 3.0 range (`zapboss.mjs`).

**Fix (`enemies.js` `colossus.siege`, `waves.js` N6):**
- Slam 5 → 8.
- At 50% HP a slam also stuns the two nearest towers for 2 s.
- Move one escort Ruin Guard into its enraged root spawns.
- **Target:** the Colossus itself deals 15–30 to a typical build and reaches the plaza in most real runs.

### 1.6 Readiness vs actual (90 nights with a forecast; `calib.mjs`)

**80 of 90 actual losses land inside the shown band; 3 are under-predicted, 7 over-predicted.**
- By level: "strong" (n 7) lost 0–15, "risky" (n 11) 0–49, "weak" (n 72) 27–100. Weak builds average 66 predicted
  vs 69 actual, so the point estimate is honest on average.
- The per-path dots point at the problem: `KR2a` N5 read "South ●○○ · −20 to −55" and lost −30, all of it South
  Burrowers.
- A spread of 9 newcomer-to-rich builds (`RW_*`, N1–N6, 1 turret up to 11 towers with L3 branches): 6 in band.

**Remaining problems:**

1. **It called a losing night-1 build "strong".** Scrap Turret + Arc Spire (`RW_n1_two`) read **−0 to −7** and lost
   15: three Crawlers got through with 3–8 of 45 HP left. That is the first forecast a new player sees.
2. **The band is ×0.6–×1.4, too wide to plan with.** "Expect −33 to −84" is a coin-flip between "fine" and "the run
   is over".
3. **It is too pessimistic on good boards.** All 7 misses on that side are strong layouts: `PL_center_v0` −32 → 0,
   `KR2a`/`KR2b` N4 −13…−18 → 0–5, `RW_n3_typ` −33 → 11. But the real run's hardest night slipped past the top:
   `KR2b` N5 read −17 to −48 and lost 49.
4. **It never says why.** It reports South ●○○, not "South: Burrowers (bullets can't hit them)". An all-North night-2
   build read South ○○○ −35 correctly, then lost 54 there (`RW_n2_north`).

**Fix (`DefenseForecast.js`, `READINESS`):**
- "Strong" only when `lost` ≤ 2 and every path has 3 dots (`strongLoss` 6 → 2, `strongShare` 0.06 → 0.02, line 234).
- `band` [0.6, 1.4] → [0.7, 1.3]. Keep `lossScale` 0.65: the mean is right.
- Track `L.lostBy[type]` and print the top leaker per path.

---

## 2. Two full runs through the real flow

| Run | N1 | N2 | N3 | N4 | N5 | N6 | Result |
|---|---|---|---|---|---|---|---|
| Round-1 real run | 100 | 100 | 38 | 117/125 | 21/125 | 12/125 | Victory; the boss leaked |
| **KR2a** (research, 6 Engineer/Warden picks, Q/W/E) | −0 | −0 | −0 | −5 | −30 (90/125) | −9 (81/125) | **Victory**, Colossus killed with 0 slams |
| **KR2b** (fresh profile, Vine Snare only) | −0 | −9 | −0 | −0 | **−49** (51/100) | −14 (52/100) | **Victory**, Colossus killed with 0 slams |

**The N3 cliff is gone, and so is the tension of nights 1–4.**
- Both runs had exactly one hard night: N5, from Burrowers or Seed Carriers down the danger path.
- Neither run ever needed the 12-second lull.

**Per night in the real runs:** 3–6 builds or upgrades in prep, 2–10 Protocol casts (mostly Q), 1 salvage pick and
1–2 presses of N, so **6–18 meaningful clicks**. Lull purchases: 3 of 20 lulls. Nights last 47–214 s of game time
(16–71 s real at 3×).

**What decides night 4?** I replayed `KR2b`'s N4 build twice per row on one seed (`SW_*`). The build: 9 towers,
Piercer L3, 627 Scrap, "Seed swarm".

| Change | Relay lost | vs base |
|---|---|---|
| Base: no night skills, the seed's area card | 19 · 23 | — |
| + 4 night skills (Calibration, Efficient Assembly, Field Tuning, Rapid Response) | 10 · 5 | **−13.5** |
| Area card Canopy Greenhouse instead | 14 · 17 | −5.5 |
| + Vine Snare cast on crowds (7 casts a night) | 26 · 29 | **+6.5** |
| All three | 9 · 1 | −16 |

Four skill cards picked during the day are worth 13 Relay on this night. Snare played on crowds is worth nothing.

- My 18 no-skill night-4 builds (530–553 Scrap, "Market swarm" danger) lost 50–89.
- The real runs, with 3–4 night skills, an easy area card and Sabotage, lost 0–5.

The day's choices outweigh the night's play. Rogue Tower and Thronefall keep the defense itself as the main skill test.

**Fix (`waves.js`, `Run.nightHpMult`):**
- Add +6% enemy health per night skill owned, capped at +24%, so night skills stop trivialising nights 3–4.
- Trim district extra groups from N4 (`threatScale` [0.5, 0.6, 1, 0.85, 0.85, 0.85]) so the area card swings less.
- **Target:** an engaged no-research run loses 10–25 on N3–N4 and 25–45 on N5–N6.

---

## 3. The new systems, judged

### 3.1 Relay Protocols

**Measured value** (`PS_*`): the same night-5 board on 2 seeds × variants A/C, cast by hotkey and click at 2×.

| Protocols | Relay left (A·777, A·4242, C·777, C·4242) | Mean |
|---|---|---|
| None | 30 · 34 · 10 · fell | 18.5 |
| Vine Snare on crowds (6–7 casts) | 30 · 41 · 13 · fell | 21 |
| Q + W + E (7 Q, 4 W, 1 E) | **48 · 52 · 21 · 25** | **36.5** |

On night 6 the same Q/W/E policy scored 43.8 vs 45.5 with none (§1.5): Q spent on crowds forfeits the charge cancel.

**Vine Snare (Q) pays only on the boss.**
- It is free, roots for 2 s and recharges in 28 s, with 2 charges from N4.
- On crowds it is worth +2.5 here and −6.5 on night 4 (`SW_*`). Seven 2-s roots on 3–5 enemies is a few percent of a
  150-s night.
- It cancels the boss charge. That save-or-spend decision is the best moment in the mode (+12, §1.5).
- Aiming is clear: a green ring follows the mouse, and right-click cancels (`U16_aim.png`).

**Arc Discharge (W) and Flare (E) work, but only as a Circuit sink.**
- W + E added **+15.5 Relay** and turned a fall into 25 left, for 4 spare Circuits, 40 Scrap and 1 Intel (≈ +4 Relay
  per Circuit). On a real run's N3–N4 the Circuits go into Arc Spires, so W sits unused (`KR2b` never had one spare).
- Per cast W doesn't scale: `40 + 20 × night` vs enemy health ×4.7–9.2. On night 4 it did 120 to a 268-HP Crawler
  (`U19_arccast.png`), while the free Relay zap deals 95 every 0.7 s. E spends the Intel you want for Read or Disrupt.

**Fix (`protocols.js`, `DefenseProtocols._resolve`):**
- **Snare:** rooted enemies take +25% damage while rooted, and the radius goes 1.6 → 2.0.
  - **Target:** Q on crowds is worth ≥ +6 on N5.
- **Arc Discharge:** costs 20 Scrap instead of a Circuit, and deals `25 × healthMult(night)` (N4 185, N6 230).
  - This gives lull and bounty Scrap a use (§3.2).
- **Flare:** costs 15 Scrap instead of Intel.
- Update `READINESS.protocols`.

### 3.2 Pushes, lulls and "Call next push"

**Pushes killed the 25-second walk-in:** lanes start at x = −1, and 2–3 shorter rises replace one.
- Still, **35% of push time has at most 2 enemies alive** (`pacing.mjs`, 18 night-4 runs; round 1 ≈ 60%).
- Push 3 is often 40–70% tail: one Razorback walking in.

**The lull is empty.**
- Towers bought before push 1 fight all three pushes, so you spend everything in prep.
- Bounties earn 8–36 Scrap a night (median 17 over 55 nights), so 3–12 a push. "Call next push" adds +5–6. That is
  less than the cheapest tower (30).
- A lull is therefore "wait 12 s or press N" (3 of 20 lulls used).
- Kingdom Rush's early call works because the bonus is meaningful *and* the next wave is previewed.

**Fix:**
- Show the next push's per-path makeup only in the lull ("Push 3: 2 Razorbacks · South").
- Pay `callEarly` at 1 Scrap per second skipped.
- Kills drop a 3–5 Scrap crate on the path that you collect with a click during the lull.
- Cap each push's last group at 6 s after the previous one (`waves.js` `at`).

### 3.3 Maps, forward pads, the danger lane

- **The three layouts are distinct and readable at ×1** (`L_twin_1280`, `L_crossing_1280`, `L_ford_1280`).
  - Crossing's mid pads see both trails for 19–24 tiles; Ford's pad 4 sees 27.
  - The best pads differ per map, so placement re-opens per run.
- **Map results** (`MP_*`, `PL_cover_*`; one night-5 build of 10 towers on each map's best pads, variants A/B/C):
  Twin 55 / 10 / fell; Crossing 34 / 14 / 6; Ford fell / 11 / 48. The maps are balanced (mean 18–22 left; `hpMult`
  works), but the variant moves the result by up to 55 and the map by ~4. Crossing never fell: its mid pads cover both
  trails. Readiness put all 6 in band.
- **Within a run the map is fixed and towers are permanent** (70% of the Scrap back, none of the components). So
  placement is solved on nights 1–2, and the nightly danger lane only says where tonight's extra group walks.
- **Forward pads never paid** (§1.2). Give them a reason to exist: a "beacon lamp" (enemies passing take +15% damage
  for 4 s), or slots on chokes that see ≥ 12 tiles.
- **A truthfulness bug.** Canopy Greenhouse's threat is a *global* speed modifier (`districts.js:42`), yet the panel
  says "Comes down the North path" and North gets ⚠ (`KR2a_49_prep_n4.png`). Show the lane and ⚠ only when
  `tonight.extraGroups.length` (`_renderPreview`, lane-tag `danger`).

### 3.4 Stipend, Trade, salvage, the Relay zap

**Stipend and Trade** give late Scrap a sink. Only `KR2a` N6 stranded Scrap (80).

**Salvage** works (3 / 2 / 1 options), but the pick is a formality.
- Spare parts (+1 C + 1 B ≈ 70 Scrap at the exchange) beats Scrap haul (+25) and Relay patch (+20 HP ≈ 33 Scrap)
  every time.
- "Relay patch" was offered after three nights at 100/100 (`KR2a` N1–N3).
- **Fix (`Run.salvageOptions`):** no `patch` at full HP; Scrap haul → +40.

**The Relay zap is a strong, hidden rubber band.**
- It deals 13 × `healthMult` every 0.7 s within 3 tiles: 171 DPS on N6.
- On a struggling N4 board it dealt **20–36% of all damage** (2 300–3 460, from `zapHits`), more than any single tower.
- On the real runs' sound boards it fired 0–11 times a night.
- So it rescues thin or misplaced builds, and "Snare next to the Relay" is a secret best layout.
- **Fix (`RELAY_ZAP`):** draw its 3-tile ring in prep; list "Relay zap: 2 980 damage" in the night summary; trim damage
  13 → 10; sell 3 "Relay coil" ranks (40 / 60 / 80 Scrap, +2 damage and +0.3 range each) as the late Scrap sink.

---

## 4. Readability, 720p vs 1080p

**1920×1080 (×2, 960×540 internal, pixel-exact) is excellent.**
- The whole 23×15 field fits, and every enemy reads: Ruin Guard shields, Razorbacks, Spitters, the Colossus phases
  (`BX_1080_*`).
- Lanes are clear of scenery, with no enemy-on-enemy x-ray (`Z_south_lane.png`). Round-1 §4.1, 4.2 and 4.4 are fixed.

**1280×720 defaults to ×1.**
- That is right: ×2 shows half the field (`Za2_zoomin.png`, `Za6_wave_zoomed.png`).
- At ×1, towers are 32×48 px and enemies 20–40 px. Readable, but small, and towers are still dwarfed by 2.5-tile
  Razorbacks (critic G #12, my round-1 #12).
- Zoom and pan all work (+/−, wheel, right-drag, arrows, Home; pad clicks at ×2).
- **Panning isn't needed at ×1, and is annoying at ×2:** nothing warns you that the other path just filled up. Add an
  edge arrow with a count ("◀ 4").

**The Relay number misreads.** At 720p "94" and "90" read as "34" and "30" (`Z_relaybar.png`, `Z_relay90b.png`): grey
anti-aliased white digits on cyan, at a non-native size. It is round-1's "97% → 37%" bug, now on the most important
number in the mode.
- **Fix (`.df-relaybar`):** dark #0b1a2e digits, no shadow, at the font's native size.

**Cold start:** on the board's first frames a mottled red wash covers the plaza for under a second (`RB_1_0.png`, 3 of 3
cold debug starts). It was never seen in the real flow.

---

## 5. UI fit at 720p

Fixed since round 1:
- The 3 speed buttons are on screen (x = 1143–1259).
- Upgrade and Sell are half buttons; the L3 branches are two half buttons with name, line and cost.
- Styled tooltips.
- The weak-start guard: Space only warns; the button or Shift+Space starts.
- No Space-pause in the first 0.6 s (`guard.mjs`).
- Tower mods fit in the panel (Focusing Lens 4.5 → 5.2 range, `M1_towerpanel_mods.png`).

**Broken:** the panel stacks the head, a docked hint, the body, the leak feed, the protocol bar (187 px: three stacked
60-px buttons) and the footer.

| State at 1280×720 | Build list (body) | Result |
|---|---|---|
| Prep, no hint | 272 px | 4 of 6 cards; Mortar and Beacon need scrolling |
| Prep, coach hint docked | 158 px | 2.7 cards (`U03_buildlist.png`) |
| Lull, no hint | **113 px** | 1.5 cards (`LLa2_lull_buildlist.png`) |
| Lull, hint docked | **17 px** | **Build failed:** 8 wheel ticks, the card never came into view (`LLb2`) |
| Lull, hint + Repair + leak feed | footer at 615–785 | **"Call next push" off-screen** (`U20_lull.png`) |

At 1366×768 the hinted lull leaves 163 px (works, cramped).

Also:
- **Card names are cut to 4–5 letters** once you own one of each type: "Thorn…", "Arc S…", "Snar…", "Mort…",
  "Pulse Be…". The "+6" surcharge chip eats the name (`F1_beacon_hover.png`).
- **The Pulse Beacon preview** shows only its own range. It doesn't ring the towers it would buff (round-1 suggestion,
  not done).
- **Hints sit in the dock for 11 s regardless of phase.** "Click a glowing square" stays after you've built.
  "You found Intel" rides into push 1 (`U15_wave3s.png`).
- **"→ 10% fewer enemies"** spills out of the Disrupt button (`Z_side_720.png`).
- **The pause modal** lists "Space start / pause", but Space does not resume from it.

**Fix (`DefenseProtocols.panel`, `defense.css`, `DefenseScene._renderSide` / `_updateHints`):**
1. Protocols become one row of three square buttons (icon, key, cost, cooldown sweep), ~44 UI units.
2. In lulls the leak feed collapses to its header.
3. No docked hints after prep below 800 px. Drop a hint when its `when()` turns false.
4. **Target:** ≥ 4 cards visible and Call next push on screen in every lull state at 1280×720.

---

## 6. Round-1 items → verdict

| Round-1 item | Verdict |
|---|---|
| 1. An active verb (Relay Protocols) | **Partly.** Q + W + E is worth +18 on N5, but Q only pays on the boss and W/E only as a spare-Circuit sink |
| 2. Upgrades a good buy, L3 branches | **Fixed** (tall 34 / mid 36 / wide 24.5) |
| 3. Killable boss, fair finale, true Results text | **Fixed** (22/22 kills, siege, conditional text). New: the boss can't threaten |
| 4. Answers to tanks | **Fixed** |
| 5. Pushes, lulls, early call | **Partly.** Pushes yes; lulls unused (3/20); +5–6 Scrap |
| 6. Lanes clear of scenery, no enemy x-ray | **Fixed** |
| 7. Truthful readiness and pips | **Fixed / partly.** 80/90 in band; one losing N1 build read "strong"; band too wide; no "why" |
| 8. Show why you lost HP | **Fixed** (feed, banner, Results "What got through" + advice) |
| 9. Seed Carrier and Mortar | **Fixed** |
| 10. UI at 720p | **Partly / regressed.** Every listed bit was fixed, but the lull panel overflows and Call goes off-screen |
| 11. Map variants | **Fixed** (3 layouts). Forward pads are a trap |
| 12. Tower scale, pixel-exact 1080p, salvage | **Partly.** 1080p exact, salvage present; towers still small |
| No N3 cliff (`HEALTH_MULT`) | **Fixed.** The swing moved to N5 and to pre-night factors |
| 97% → 37% font bug | **Not fixed** (now "94" → "34" on the Relay HP) |
| Late game has nothing to buy | **Partly** (Trade + stipend) |
| Boss tip costs HP | **Fixed** (tip +4.5; Snare-on-charge +12) |

---

## 7. Scores (1–10)

| Axis | Round 1 | Round 2 | Why |
|---|---|---|---|
| Strategic depth | 4 | **6** | Upgrades, branches, the Mortar and placement now matter (53 vs 0 Relay for the same towers). But the map is fixed per run, forward pads never pay, lulls carry no decisions, and the day outweighs the night |
| Readability | 5 | **6** | 1080p is pixel-exact and gorgeous; clear lanes, the leak feed, per-path dots. 720p ×1 is small, "94" reads "34", the threat lane lies, towers are tiny vs enemies |
| Tower / enemy design | 5 | **6.5** | Mortar, Piercer and Snare roles are real; tanks have counters. The zap is the hidden best tower; forward pads are dead weight |
| Player agency | 2 | **5** | 6–12 casts a night are worth +18 on N5, and saving Snare for the charge is a real decision. But Q on crowds ≈ 0, W needs spare Circuits, the lull is a key press, and 4 day skill cards outweigh all of it (−13.5 on N4) |
| Pacing / tension | 4 | **5** | Three shorter pushes and 3×, but a third of tails remain. Nights 1–4 cost 0–9 in real runs; one hard night (N5) |
| Boss | 4 | **6.5** | Killable, telegraphed, an enrage beat and a siege, with counterplay on Q. It can't threaten (0–20 HP) and died before the plaza in both real runs |
| UI (new axis) | — | **5** | Prep fits; lulls at 720p are broken; hints eat the panel |

---

## 8. Top 12 fixes (most impactful first)

1. **Fix the 720p side panel in lulls and pushes** (§5).
   - Single-row protocol bar; collapsed leak feed; no docked hints after prep.
   - **Target:** 4 cards and Call next push visible in every lull at 1280×720.
2. **Give lulls a reason:** the next push's makeup shown only in lulls; kill crates; call-early at 1 Scrap/s (§3.2).
   - **Target:** a lull purchase in ≥ half the lulls of a real run.
3. **Make every Protocol pay on its own:** Snare roots add +25% damage taken (radius 2.0); Arc Discharge for 20 Scrap,
   `25 × healthMult`; Flare for 15 Scrap (§3.1). **Target:** Q on crowds ≥ +6 on N5; W castable on N3–N4 runs.
4. **Re-centre difficulty on the night:** health +6% per night skill (cap +24%); `threatScale` 0.85 from N4 (§2).
   - **Target:** an engaged run loses 10–25 on N3–N4.
5. **Make the Colossus dangerous:** slam 8, a tower stun at 50%, Ruin Guards in its enraged roots (§1.5).
   - **Target:** 15–30 from the boss itself, and the plaza reached in most real runs.
6. **Forward pads worth a tower:** a beacon lamp (+15% damage taken), or slots seeing ≥ 12 tiles (§3.3).
7. **Show and trim the Relay zap:** a prep ring, damage in the night summary, 13 → 10, "Relay coil" ranks as the Scrap
   sink (§3.4).
8. **Readiness:** no "strong" above −2 (`strongLoss` 2), band [0.7, 1.3], the top leaker named per path (§1.6).
9. **Truthfulness:** no lane or ⚠ for threats without an extra group; no "Relay patch" at full HP; dark, native-size
   Relay digits.
10. **Tower art 48×64 on 1.5-tile plinths** (critic G #12, round-1 #12).
11. **Off-view arrows with counts** when zoomed in, so ×2 at 720p is playable (§4).
12. **Small UI:** the "→ 10% fewer enemies" overflow; Space should resume from the pause modal; the cold-start red
    wash on the plaza; the WebGL context-loss warnings at boot.

---

## Verdict

This is the round where the night became a tower defense.
- Upgrades, placement, the Mortar, the tanks and the boss all respond to what you do. I can point at builds that win
  or lose by 50 HP for reasons the game shows you.
- The Colossus is a real finale with a telegraphed counter.

It isn't Kingdom Rush yet, for three reasons:
1. **The 720p panel breaks in exactly the moments the new systems create** (lulls).
2. **Q on crowds and every lull are mostly decoration.** W/E pay only when Circuits are spare.
3. **A competent run is decided before dusk,** by skills, research and the area card.

Fix the panel, give the lull and the Protocols a Scrap economy, and pull the tension back into the night. Then this half of the pillar
holds.
