# Verdant Relay: Critic R2, the balance pass after the Stage 9 fix wave

**Session:** 2026-10-15. Build: `.playwright-mcp/frozen_s9b` (HEAD `399aea1`; the bundle carries `HEALTH_MULT`
1.6/4.4/6.2/10.2/11.9/16.5 and `provoke {fromNight 2, enemies 1.25, scrap 30, bounty 1.5}`). It was served to headless
Chrome at 1280×720 by request interception at `http://frozen.test/`.

**Files** (all in `.playwright-mcp/criticR2/`):
- the harness, which is round 1's with additions: `ctl.mjs`, `night.mjs`, `run.mjs`, `perc.js`, `profiles.mjs`, `driver.mjs` (port 7621, now stopped);
- the per-run logs `T1–T5`, `S1–S3`, `C1–C3` (`.out`, `.log`, `.json`), plus `C2_crashed.*` (a harness crash on day 3, re-run as C2);
- `summary.txt`, the parsed per-day and per-night table (`sum.py`);
- 182 screenshots: `<tag>_d<N>_summary.png`, `<tag>_n<N>_prep.png`, `<tag>_n<N>_end.png`, `<tag>_results.png`.

## Verdict in one line

**The fix wave cured the death spiral and the N5 wall, but it overshot.** Every non-careless run won:
- typical 5/5;
- skilled 3/3, losing 0 Relay HP on 15 of 18 nights;
- typical lost a mean of only −1 / −7 / −4 / −15 / −26 / −33 on N1–N6.

Careless still falls on night 3 (3/3), and visibly by its own choices. Deaths are readable and no longer spiral. **The
game is now fair, but too easy for anyone who rolls and builds.** It is a cakewalk at night for a skilled player even
with Provoke taken on 9 nights. The danger has moved to the days, where it is real but costs little.

---

## 1. How it was played

**Eleven complete runs.** Each used a fresh browser context (empty localStorage) and a real **New Run** from the title,
with the guided first day. No debug URL was used in any played run.

**Inputs** were real Playwright keyboard and mouse events, exactly as in round 1:
- WASD, LMB hack and slash, RMB chop, Space roll, F throw, Q med kit, E holds;
- modal and skill clicks;
- at night: number key + click to build, U or a branch click to upgrade, R repair, Space start, F 3×, Q + click for Vine Snare, N next push;
- and, new this round, clicks on **Provoke**, **Disrupt** and the **Scrap→component Trade**.

The page was only **read**: positions, telegraphs, prompts and which tiles are free. Nothing was given, killed or healed.

| Profile | Runs | Day pilot | Night pilot |
|---|---|---|---|
| **Typical** | T1–T5 | Round 1's typical: rolls 250 ms (±80) after a wind-up, **ignores 30% of telegraphs**, punishes openings, chops staggered creatures, throws at Spitters, med kit under 45, flees under 30 HP with no kit, does the quest, crates, bonus tasks, events and beacons, loots to ~t=255 s | Best-coverage tiles, Turret/Arc/Nest/Snare mix, L2 first then L3 branch A, repairs under 70%, Vine Snare on the lead clump, spends in lulls. **Never Provokes** (logged when offered) |
| **Skilled** | S1–S3 | Rolls at 170 ms, **misses 4%**, the same punish/chop/throw, loots wider and longer (to ~t=270 s, 45-tile radius), med kit under 50 | Typical's build, plus **Provoke whenever offered**, **Disrupt** (3 Intel) from N3 (not in S3), and **trades spare Scrap for the scarcer component** then spends again |
| **Careless** | C1, C3 | Mashes LMB at what's near and **never rolls**. Rushes the quest and goes home, opening only crates within 3.5 tiles | 1–2 towers a night near the Relay, no repairs, no Protocols, upgrades only above 90 S |
| | C2 | The same day as C1 | Spends every Scrap on L1 towers |

**Caveats on the pilots, so the numbers are read correctly:**
- None of the pilots deflects.
- None of the pilots walks around spore pods: it paths straight through and backs out of swelling ones. So spore damage is over-counted for the explorers (§4).
- The typical often ends a day early: with nothing inside 22 tiles it drifts home, at t≈100–140 s on several day 1s.
- The night pilot doesn't press the free "Patch +15" from Emergency Patch.

None of these flatter the result: a human would do better on each.

---

## 2. Per-day / per-night results

**Columns:**
- **Banked** = what reached the base, including the quest's reward.
- **Q** = quest done, **x** = not done, **D** = went down.
- **HP** = start → minimum → end.
- **Night** = Relay start → end (loss), and the towers by level (L1/L2/L3).

### Typical (T1–T5)

| Run | Day | Quest | HP (start → min → end), main sources | Banked | Night (towers L1/L2/L3) |
|---|---|---|---|---|---|
| T1 | 1 | Q power cell | 100 → 75 → 94: spores 25, spear 11 | 140 S, 3 C | N1: 3 (1/2/0), **−0** |
| | 2 | Q pumps | 100 → 43 → 50: Feral 40, spores 20 | 43 S, 2 B | N2: 5, −0 (Provoke offered, not taken) |
| | 3 | Q haul core | 90 → 48: Feral 45 | 70 S, 3 C | N3: 7 (1/6/0), −4 |
| | 4 | x recover data, fled | 90 → **2**: spores 60, Crawler 40, Bloater 18 | 97 S, 1 C, 3 B | N4: 7 (0/4/3), −24 |
| | 5 | x Razorback, **died** t=70 | "Taken down by a Razorback's charge · hit 6 times mid-swing" | 15 S (salvage) | N5: 8 (0/4/4), "Too weak", **−52** (min 40) |
| | 6 | x spore nests, fled | 90 → 26: Feral 49, spores 30 | 19 S | N6: 9, −47 (6 slams −36). **WIN** |
| T2 | 1 | Q | 100 → 88 | 62 S | N1: 3 (L1), −0 |
| | 2 | Q pumps | 100 → 27: Razorback 42, spores 30, Feral 40 | 122 S, 2 C, 3 B | N2: 5, −0 |
| | 3 | Q Alpha, fled after | 90 → 28: Crawler 42 | 115 S | N3: 7, −0 |
| | 4 | Q escort | 90 → 29: Crawler 40, spores 30, Feral 29 | 60 S, 4 B | N4: 8 (1/2/5), −0 |
| | 5 | x Razorback, **died** t=129 | "Crawler's lunge"; wounds: spores 40, Razorback 40, Crawler 30 | 15 S | N5: 8 (0/0/**8**), −0 |
| | 6 | Q data | 90 → 13 | 57 S | N6: 10 (0/1/9), −0, Colossus killed before a single slam. **WIN** |
| T3 | 1 | Q | 100 → 65 (spores) | 103 S | N1: 3, −0 |
| | 2 | Q uplink | 100 → 100 | 36 S | N2: 4, −9 |
| | 3 | Q spore nests, fled after | 100 → 29: spores 70 | 57 S, 2 C | N3: 6, −8 |
| | 4 | x power cell, fled | 90 → **5**: spores 75, Stalker 15 | 39 S, 1 C, 2 B | N4: 7 (0/7/0), −36 |
| | 5 | Q Razorback, then **died** t=109 | "Bloater's burst"; wounds: Razorback 30, Crawler 30, Bloater 20, spores 20 | 15 S (reward lost) | N5: 8 (0/7/1), −20 |
| | 6 | Q haul core | 90 → 60 | 60 S, 2 C | N6: 9, **−67** (Colossus not killed: "held off"). **WIN** at 42 |
| T4 | 1 | Q | 100 → 71 | 86 S | N1: 3, −0 |
| | 2 | x uplink (pilot stalled at the ring, §6) | 100 → 59 | 3 S | N2: 4, −24 |
| | 3 | Q Razorback | 90 → 48: Feral 41 | **162 S**, 3 C, 3 B | N3: 6, −0 |
| | 4 | Q data | 90 → 53 | 80 S | N4: 7 (0/5/2), −2 |
| | 5 | x Alpha, **died** t=197 | "Taken down by spores"; spores 130, Spitter 50 (pilot sat in clouds) | 15 S | N5: 8 (0/5/3), −46 |
| | 6 | x spore nests, fled t=62 | 90 → 16: spores 40, Stalker 16 | 6 S | N6: 10, −25. **WIN** |
| T5 | 1 | Q | 100 → 80 | 59 S | N1: 3, −5 |
| | 2 | Q spore nests | 100 → 28: **spores 120** | 123 S, 5 C | N2: 5, −0 |
| | 3 | x Alpha, fled | 90 → 29: Feral 55, Crawler 30 | 36 S | N3: 6, −6 |
| | 4 | Q data | 90 → 52 | 79 S | N4: 8, −13 |
| | 5 | Q uplink | 90 → 24 → 49 | 67 S | N5: 8 (0/4/4), −14 |
| | 6 | Q pumps | 90 → 40 | 28 S | N6: 10, −24. **WIN** |

**Skills by night 6:** T1 5, T2 5, T3 6, T4 4, T5 6. In round 1 the typical had 1–3 by N5. The "failed quest still earns
its skill point from N3 if you get home" rule visibly fired: T1 on days 4 and 6, T3 on day 4, S1 on day 5.

### Skilled (S1–S3)

| Run | Days (banked S; quests) | Nights: Relay lost (Provoked?) | Build at N6 | Result |
|---|---|---|---|---|
| S1 | 158 · 108 · 154 · 75 · 33 · 8 (died D6, t=65); quests 4/6 | 0 · 0 · 0 **P** · 0 **P** · 0 **P** · −24 (4 slams) | 11 towers, all L3 | WIN at 101/125 |
| S2 (Crossing) | 171 · 83 · 130 · 137 · 125 · 7 (uplink stall D6); quests 5/6 | 0 · 0 **P** · 0 **P** · 0 **P** · 0 **P** · **0 P** (Colossus provoked, killed, no slam) | 13 towers, 12 at L3 | WIN at 100/100 |
| S3 (Crossing, no Disrupt) | **211** · 69 · 87 · 75 · 179 · 56; quests 5/6 | 0 · 0 **P** · 0 · −13 · 0 · −12 | 11 towers, 10 at L3; held 283 S at N5 prep, 10–11 Biofiber unspent | WIN at 88/100 |

So the skilled player provoked **9 nights and lost 0 Relay HP on all 9**, the boss included. It also used Disrupt with
Provoke on the same night (S1, S2), which cancels much of the dare (§5).

### Careless (C1–C3)

| Run | Day 1 | Day 2 | Day 3 | N1 | N2 | N3 |
|---|---|---|---|---|---|---|
| C1 | Q, 30 S, 0 dmg | **died** t=42 on the uplink pack: "fighting 4 creatures at once…" | **died** t=81: "hit 7 times mid-swing…" | 1 tower, −15 | 2 towers, "Too weak", −56 | 3 towers, **fell** (29 → 0) |
| C2 (Ford, spends all) | Q, 32 S | Q, 54 S, ended at 4 HP | **died** t=75: Razorback 61 | 2 L1, −20 | 4 L1, −28 | 5 L1, "Too weak", **fell** (52 → 0) |
| C3 (Crossing) | Q, 54 S | Q, then **died** t=92 (Razorback 63, "hit 5 times mid-swing") | **died** t=48: "Leave the pink ring…" (Spitter 81) | 1 tower, 69 S unspent, −18 | 2 towers, −35 | 3 towers, 48 S unspent, **fell** (67 → 0) |

The aborted first C2 (harness crash on day 3) had gone the same way: died on day 2, N2 −54, N3 opening with 33 Relay and 4 Scrap.

### Rolled up, and against round 1 (critic R, `frozen_s9`)

| | Round 1 typical (4 runs) | **Round 2 typical (5 runs)** | Round 2 skilled (3) | Round 1 careless (2) | **Round 2 careless (3)** |
|---|---|---|---|---|---|
| Result | **0/4** (fell N5, N5, N5, N4) | **5/5 wins** | 3/3 wins | fell N3, N3 | fell N3, N3, N3 |
| Scrap banked D1 / mean of D2–D6 | 124 / **24** | 90 / **57** | 180 / **88** | 49 / 17 | 39 / 24 |
| Quests done D2–D6 | 4 of 15 (D4–5: 0/7) | **16 of 25** | 11 of 15 | 3 of 4 | 2 of 6 |
| Went down on a day | 2 of 19 days (+7 fled) | 4 of 30 days, **all on day 5** | 1 of 18 | 3 of 6 | 5 of 9 |
| Skills by the last night | 1–3 | 4–6 | 5–6 | 1 | 1–2 |
| Relay lost N1 | 0 | 0 (one −5) | 0 | −30 | −15 to −20 |
| N2 | −7 | −7 (0 to −24) | 0 | −14 to −58 | −28 to −56 |
| N3 | −13 | **−4** (0 to −8) | 0 | fell | **fell** |
| N4 | −31 + 1 fall | **−15** (0 to −36) | −4 | — | — |
| N5 | fell ×3 | **−26** (0 to −52) | 0 | — | — |
| N6 | never reached | **−33** (0 to −67) | −12 | — | — |
| Lowest Relay over the run | 0 | 40, 125, 42, 54, 88 | 87–125 | 0 | 0 |

**Against the fix-wave bots' claims** (sim ~64%, 4/5 real runs, ~44 S a day, newcomers fall around N4), my independent
runs show:
- **income is a little higher:** 57 S a day for the typical after day 1;
- **wins are higher:** 5/5 typical;
- **the careless player falls one night earlier:** N3, not N4.

---

## 3. Judgement

### Too easy, fair or too hard?

| Profile | Days | Nights 1–3 | Nights 4–6 | The run |
|---|---|---|---|---|
| **Typical** | **Fair to hard.** 10 of 30 days end under 30 HP or fled, and 4 deaths, all on day 5. Every day is a real fight. | **Too easy:** −1 / −7 / −4. Readiness "Looks strong" or "Risky" on 15 of 15. | **Fair, leaning easy:** −15 / −26 / −33. One run lost nothing on any night. | **Too easy: 5/5 wins.** Only 2 of 5 runs ever dropped under 50 Relay. |
| **Skilled** | Fair. It still takes 10–158 damage a day, mostly spores, but finishes 11 of 15 quests after day 1 and banks 88 a day. | Cakewalk. | **Cakewalk, even provoked:** 0 on all 9 provoked nights; −4 / 0 / −12 mean on N4–N6. | **Too easy.** No pressure from night 1 to the Colossus. |
| **Careless** | **Hard, and correctly so.** Dies on day 2 or 3 in 5 of 9 days, to visible mistakes. | Bleeds −15 to −56 a night with 1–5 L1 towers and no repairs. Every fall was forecast "Too weak". | — | **Out on N3 (3/3).** About right for a player who never rolls, never repairs and leaves 48–69 Scrap unspent. |

### Is there still a death spiral or a wall?

**No spiral and no wall.** The spiral breakers work:
- **Dawn health is 90 every day,** so a bad day no longer starts the next one at 75.
- **Death salvage still pays:** a typical death on day 5 cost about 15–60 S and the day's reward, nothing more.
- **Skill points keep flowing:** 4–6 skills by N6, against 1–3 in round 1.

**The N5 cliff is gone.** The typical's mean loss climbs −15 → −26 → −33 across N4–N6, a gentle ramp.

**The new shape is the opposite problem: no night ever threatens a competent run.** The only rising pressure is on the
days, and a day loss doesn't threaten the run. The one "wall" left is **day 5**: 4 of 5 typical runs went down on day 5
and on no other day. Three of the four were on the elite-Razorback quest (`clear_blockage`). The deaths there are
attrition, 3–4 sources at ~20–30 each:
- T2: spores 40, Razorback 40, Crawler 30, Bloater 10;
- T3: Razorback 30, Crawler 30, Bloater 20, spores 20.

### Is the skilled player rewarded, and the careless one punished?

**Both, clearly, on the days.** Skilled banks 88 S a day against the typical's 57 and the careless player's 24. It
completes 73% of quests after day 1 against 64% and 33%, and goes down on 1 of 18 days against 4 of 30 and 5 of 9.

**At night the reward overshoots.** A skilled run has 10–13 towers, mostly L3, by N5. It holds every night at 0, so
there is nothing left to be skilful *at*. Provoke was supposed to be that lever: it adds 25% more enemies against a
build that kills everything 25% faster than it needs to.

### Are deaths readable?

**Yes, on all 10 day deaths and all 3 falls.**
- **The death note matched the wounds** each time:
  - "hit 6/7/5 times mid-swing… roll";
  - "fighting 4 creatures at once…";
  - "Leave the pink ring…";
  - "Step or roll sideways out of a Razorback's lane";
  - "Taken down by spores" when 130 of 190 damage was spores.
- **The forecast was honest, and on the safe side:**
  - every fall read "Too weak" before Start;
  - typical nights landed inside or below the predicted band, except T3 N6, which hit −67 against "−20 to −59";
  - "Risky −2 to −12" nights often came in at 0.
- **The day-5 deaths are readable but attrition-shaped.** That is what the user wants fewer of.

---

## 4. Where the damage comes from (days, all runs)

| Source | Typical (2,361 total) | Skilled (1,499) | Careless (566) |
|---|---|---|---|
| **Spores** (pods, nest puffs, clouds) | **897 (38%)** | **675 (45%)** | 15 (3%) |
| Bloater burst | 115 (5%) | 58 (4%) | 0 |
| Feral Scavenger (lunge, second thrust, spear) | 579 (25%) | 360 (24%) | 241 (43%) |
| Bramble Crawler | 419 (18%) | 195 (13%) | 66 (12%) |
| Razorback | 151 (6%) | 0 | 124 (22%) |
| Spitter | 83 | 85 | 75 |
| Skitter, Thorn Stalker, Feral Chief | 117 | 126 | 45 |

**What this shows:**
- **Spores + Bloater are the top day-damage source for anyone who explores (43–49%).** For the careless player, who rushes home, they are nothing.
- **Much of that is my pilot,** which paths straight through pods and only backs out of swelling ones. The worst cases were:
  - nest quests (T5 day 2: 120);
  - T4 day 5, where it sat in clouds while fighting.
- **Spores never decided a run, and they're telegraphed.** Per the user's note, I don't ask for a change.
- **The Feral is no longer the bully it was.** 444 in 4 runs (round 1) → 579 in 5 longer runs, and the careless player now dies to it mid-swing, as intended. The second thrust appeared on 7 days at 11–28 each, always after a rolled first thrust.
- **The brawl message fired once** (C1 on the uplink). No typical death was a 4+ brawl. The cap works.

---

## 5. Scores (out of 10)

| | Round 1 | **Round 2** | Why |
|---|---|---|---|
| Difficulty fit | 4 | **6** | No wall and no spiral. But the user asked for "not a cakewalk", and nights 1–3 still are one for everyone who builds. Nights 4–6 are one for a skilled player even with Provoke. 8/8 non-careless runs won. |
| Fairness | 6 | **8** | Every death and fall is explained and forecast. Dawn at 90 and the salvage stop one bad day snowballing. Docked for the day-5 attrition deaths, and for Provoke + Disrupt on the same night. |
| Economy | 3 | **7** | Days now fund nights: typical 57 S a day and 4–6 skills. Docked because it now over-funds a good player: S3 held 283 S at N5 prep and 10–11 Biofiber it couldn't use. Components are lopsided: Biofiber piles up while Circuits bind. |
| Pacing | 4 | **6** | A smooth night ramp of −0 → −33, but it starts at zero for three nights. The tension curve lives on the days, peaking on day 5, while the nights stay calm. The boss night is now winnable by everyone competent. |

---

## 6. Bugs and oddities

- **No page errors or console errors in 11 full runs** (about 66 days and 60 nights).
- **The uplink stalled twice** (T4 day 2, Flooded; S2 day 6, Data Center), each with the quest never finishing.
  - I re-ran Flooded N2 on a debug day (state read only): the uplink took **no hits** and finished normally.
  - In a second debug run my pilot stood at 8.6 m, just outside the 7 m ring, for 20 s.
  - S2 jittered at one spot for 4 minutes without starting it.
  - **I count both as pilot pathing, not a game bug.** One cheap safety net would still help a human: if the player stands just outside the ring for over 5 s, toast "Step inside the ring".
- **The night pilot never used the free "Patch +15"** (Emergency Patch). That is a pilot gap, not a bug; it is clearly shown in the panel.
- **Provoke and Disrupt stack on the same night.** That is legal, but it defeats the dare: Disrupt −10% then Provoke +25% nets +12.5% for +30 Scrap and +50% bounties.
- **Every death screen was accurate,** including the new "last direct blow in 3 s" rule.

---

## 7. Prioritised re-tunes (short)

The core balance is now about right in **shape**. What's left is a **level** problem at night and one day spike. Keep the
fix wave's day-side changes (dawn 90, salvage, skill point on a failed quest, brawl cap, Crawler 56) as they are.

1. **Make Provoke a real dare.** It is the skilled player's only lever, and today it is free money: 9 provoked nights, 0 Relay lost.
   - `DEFENSE.provoke` `{ enemies: 1.25, scrap: 30, bounty: 1.5 }` → **`{ enemies: 1.5, hp: 1.15, scrap: 40, bounty: 1.5 }`**, adding a ×1.15 enemy health while provoked.
   - Make **Provoke and Disrupt mutually exclusive** for the night.
   - From N4, allow a **second stack** while it still reads "Looks strong": a "Double dare" for another ×1.3 enemies and +1 Circuit +1 Biofiber.
   - Target: a provoked skilled night costs −10 to −25.
2. **Give nights 2–4 some bite for the typical without killing the careless sooner.**
   - `HEALTH_MULT` `[1.6, 4.4, 6.2, 10.2, 11.9, 16.5]` → **`[1.6, 4.7, 6.9, 11.0, 12.6, 17.2]`**: +7% / +11% / +8% / +6% / +4%.
   - Expected typical means: about −5 / −12 / −25 / −32 / −38.
   - The careless runs already fall on N3. With 1–4 L1 towers they'd lose ~5–10 more on N2 and still reach N3, so their outcome doesn't change.
   - Leave the Colossus at ×5. Two of eight runs killed it before a slam, and that comes from the build, not its HP.
3. **Day 5 spike, optional but cheap.** 4/5 typical runs went down on day 5, and 3 of them on the elite-Razorback quest, through attrition from adds.
   - `byNight` wildlife `[0.65, 0.8, 0.92, 0.95, 1.0, 1.05]` → **`[0.65, 0.8, 0.92, 0.95, 0.95, 1.0]`**,
   - **or** keep wildlife out within ~8 tiles of the `clear_blockage` lair while its Razorback lives (a duel, not a brawl).
   - Death costs little now, so this is about the user's "readable mistake, not attrition" goal, not about win rate.
4. **Component balance, quality of life.** Add a component swap to the Trade row (2 Biofiber → 1 Circuit). Skilled runs ended holding 7–11 Biofiber while Circuits blocked level 3s.
5. **No change to spores or Bloaters** (the user's call). They are 43–49% of an explorer's day damage in my runs, inflated by a pilot that doesn't route around pods. They are telegraphed and never decided a run.

**If only one thing changes, make it #1 + #2 together.** The typical then wins around 3 in 4 with a scare on N5–N6,
the skilled player has to choose its dares, and the careless player still goes out on N3 for reasons the forecast told
them.
