# Verdant Relay: Critic R, a balance pass across whole runs (Stage 9 frozen build)

**Session:** 2026-10-15. Build: `.playwright-mcp/frozen_s9`, served by request interception to headless Chrome at 1280×720.

**Files:** everything is in `.playwright-mcp/criticR/`:
- the controller: `ctl.mjs` (day), `night.mjs` (prep and wave), `run.mjs` (a whole run), `perc.js` (read-only page probes), `profiles.mjs`, `driver.mjs` (port 7614);
- per-run logs and JSON: `T2/T3/T4/T5/C1/C2.log` and `.json`;
- screenshots: `<tag>_d<N>_summary.png`, `<tag>_n<N>_prep.png`, `<tag>_n<N>_end.png`, `exp_*.png`.

**Verdict in one line:** the two Stage 9 changes stack into a **death spiral**. From day 3 the days stop paying: the typical player fails or flees the quest, so it gets no +20, no skill point and 10–30 Scrap. Night 5 then executes the verdict. **No typical run reached night 6. Four of four fell, on N5, N5, N5 and N4.** The careless runs fell on N3 both times. Nights 1–3 are still a cakewalk for the typical player (0 to −24), so the run has a flat first half and a cliff at N5. The boss night was never reached by real play; I measured it separately (§5).

---

## 1. How it was played

**Six complete runs**, each from a fresh browser context with empty localStorage. Each began with a real **New Run** from the title, so every run got the guided first day. No debug URL was used in a played run.

**Inputs were real Playwright keyboard and mouse events throughout:**
- the area pick (1/2, Enter);
- WASD movement along a tile path;
- hack-through by holding LMB, and the RMB chop;
- Space rolls, the F throw at Spitters, Q med kits, E holds (crates, quest steps, pylons, extraction), and clicking modal buttons;
- skill cards (1–3) and Enter through the summary;
- at night:
  - the number key to pick a tower, then a mouse click on the tile;
  - clicking a tower, then U to upgrade or a click on a `.df-branch` button for level 3;
  - R to repair, Space or Shift+Space to start, F to 3×, Q plus a click to cast Vine Snare, N to call the next push;
  - 1–3 for salvage, Enter to continue.

**What the page was used for:** reading only (positions, telegraphs, prompts, which tiles are free and what each tile's coverage tag would say). Nothing was killed, healed, given or teleported.

**The bot-pilots:**

| Profile | Day | Night |
|---|---|---|
| **Typical** (T2–T5) | Rolls at a human reaction time: 250 ms ±80 ms jitter after a wind-up starts, rolling when the hit is ≤0.32 s out or it has committed. Ignores 30% of telegraphs (looking elsewhere). Punishes open creatures, chops staggered ones, uses a med kit under 45 HP when safe, eats fruit, and goes home under 30 HP with no kit. Does the quest, takes crates, bonus tasks and events on the way, switches on pylons, and loots until about t=255 s. | Repairs under 70%. Builds the best-coverage tile, weighted toward the less-covered path, mixing Turret, Arc, Nest and Snare. Upgrades level 1 → 2 first, then level 3 branch A. Spends in lulls, calls pushes early, casts Vine Snare on the lead clump. |
| **Careless** (C1, C2) | Mashes LMB at whatever is near and never rolls. Rushes the quest and goes home, opening only crates within 3.5 tiles. | C1: one or two towers a night near the Relay, no upgrades, no repairs, no Protocols. C2: the same, but spends every Scrap on new towers. |

**Caveats on the typical pilot, so the numbers are read correctly:**
- It never deflects.
- It handles spore pods badly: it walks into them on the path, then backs out.
- On two quest-day 2s, the old code stood under a Spitter it couldn't reach (T4) or kept backing out of spore-nest clouds (T3). Those two days were fixed for T5 (throw at Spitters, give up after 8 s, face-tank nest clouds), and they are flagged in the table.
- Its tower placement is decent but not expert.

So treat "typical" as a competent-but-human player. It is not the sim's typical: it never used the Workbench or Intel Sabotage.

**Measurement only (§5):** six debug-defense nights (`?debug=defense&night=N&scrap=…`) built by the same night pilot, to find what nights 5 and 6 demand. These are labelled and are never mixed into the run tables.

---

## 2. Per-day / per-night results

### Typical runs

Banked = what reached the base that day, including the goal's +20. "Fled" means it went home at under 30 HP with the quest not done.

| Run | Day / night | Area, quest | Result | HP (start → min → end) | Damage taken, main sources | Banked | Night: towers (levels) → Relay |
|---|---|---|---|---|---|---|---|
| T2 | D1 | Market, power cell (guided) | ✓ home t=90 s | 100 → 89 → 89 | 9 | 71 S, 1 C, 1 B | N1: 3 → **−0** |
| | D2 | Data Center, power box | ✓ home t=145 | 100 → 75 → 90 | 25 (Feral) | 73 S, 1 C, 2 I | N2: 5 (2,2,1,2,1) → **−9** |
| | D3 | Market, kill the Razorback | ✗ **fled** at t=70 | 100 → 20 → 20 | 68 (Crawlers 39, Feral 29) | 10 S | N3: 6 → **−24** |
| | D4 | Residential, Alpha | ✗ **died** at t=193 | 75 → 0 | 233 (Feral 82, Razorback 54, spores 50, Stalker 17); 8 Q presses, 41 rolls | 0 (52 S lost) | N4: 6 → **−42** (min 17; two lull repairs) |
| | D5 | Flooded, pumps | ✗ **fled** at t=213 | 75 → 11 | 101 (Spitter 33, Feral 34, spores 20) | 18 S, 1 C, 1 B | N5: 7 (six at L2) → **fell** (80 → 15 after push 1) |
| T3 | D1 | Market (guided), plus intel drive | ✓ t=223 | 100 → 95 | 5 | **166 S**, 1 C, 1 B, 4 I | N1: 4 → −0 |
| | D2 ⚑ | Flooded, spore nests | ✗ ran out of daylight (bot stuck at the nests) | 100 → 54 | 61 | 15 S | N2: 5 → −0 |
| | D3 | Residential, pumps, plus 2 bonus tasks | ✓ t=164 | 79 → 51 → 66 | 88 (spores 35, Feral 45) | 67 S, 2 C, 3 B, 2 I | N3: 6 (one L3) → −0 (Reinforced Core, 125 max) |
| | D4 | Market, Alpha (+ Power Surge event) | ✗ **fled** at t=206 | 91 → 7 | 162 (Feral 148) | 27 S, 1 C, 3 B | N4: 7 (two L3) → −16 |
| | D5 | Greenhouse, route data | ✗ **died** at t=110 | 75 → 0 | 75 (spores 35, Spitter 33, Bloater 11) | 0 | N5: 8 (two L3) → **fell** (109 → 54 → 2 → 0) |
| T4 | D1 | Market (guided) | ✓ t=177 | 100 → 75 | 40 (spores) | 80 S, 2 B, 5 I | N1: 3 → −0 |
| | D2 ⚑ | Greenhouse, power box | ✗ ran out of daylight (Spitter pin) | 100 → 19 | 122 (Spitter 72) | 24 S | N2: 4 → −18 |
| | D3 | Flooded, pumps | ✗ **fled** at t=117 | 75 → 25 | 95 (spores) | 10 S | N3: 4 → −16 (min 54) |
| | D4 | Residential, escort | ✗ **fled** at t=64 | 75 → 6 | 69 (spores 40, Feral 18, Bloater 11) | 10 S | N4: 5 → **fell** (81 → 0) |
| T5 | D1 | Market (guided) | ✓ t=160 | 100 → 80 | 14 | **179 S**, 3 C, 2 B | N1: 3 → −0 (125 max) |
| | D2 | Data Center, Razorback | ✓, then home at t=153 at 17 HP | 100 → 17 | 83 (Spitter 45, Feral 38) | 72 S, 1 C, 2 I | N2: 5 → −0 |
| | D3 | Greenhouse, uplink | ✓ t=76 | 75 → 75 → 85 | 5 | 29 S | N3: 6 → −11 |
| | D4 | Market, spore nests | ✗ **fled** at t=86 | 100 → 28 | 72 (spores 50) | 12 S | N4: 7 → −34 |
| | D5 | Flooded, Alpha | ✗ **fled** at t=81 | 75 → 19 | 57 (Crawlers 42) | 10 S, 1 C | N5: 8 → **fell** (100 → 73 → 0) |

⚑ = a pilot failure (fixed in T5). Leave these days out and the D2 average rises from 46 to 72; the picture after day 2 does not change.

**Skills and relics:**
- T2: Emergency Patch, Efficient Assembly. 2 skills by N5.
- T3: Field Tuning, Reinforced Core. 2 skills.
- T4: Rapid Response. 1 skill.
- T5: Reinforced Core, Rapid Response, Efficient Assembly. 3 skills.
- Relics brought home: none. The Alpha was never killed after day 2.

### Careless runs

| Run | Day / night | Quest | Result | HP | Damage taken | Banked | Night |
|---|---|---|---|---|---|---|---|
| C1 | D1 | power cell | ✓ t=70 | 100 | 0 | 41 S | N1: 1 turret → **−31** |
| | D2 | pumps | ✓, then **died** at t=92 ("hit 8 times mid-swing") | 100 → 0 | 100 (Feral 87, spear 13) | 20 S (salvage) | N2: 2 turrets → **−58** (69 → 11) |
| | D3 | spore nests | ✗ **died** at t=313 | 75 → 0 | 75 | 8 S (salvage) | N3: 3 turrets → **fell** (31 → 0) |
| C2 | D1 | power cell | ✓ t=74 | 100 | 0 | 57 S | N1: 2 turrets → −30 |
| | D2 | uplink | ✓ t=78 | 100 → 50 | 50 (Feral 36) | 32 S, 2 C | N2: 3 turrets → −14 |
| | D3 | spore nests | ✓, then **died** at t=133 | 75 → 0 | 119 (spores 84) | 9 S | N3: 4 L1 towers → **fell** (96 → 55 → 5 → 0) |

### Rolled up

| | D1 | D2 | D3 | D4 | D5 |
|---|---|---|---|---|---|
| Typical: Scrap banked, mean | **124** | 46 (72 without ⚑) | 29 | **12** | **9** |
| Typical: quests done | 4/4 | 2/4 | 2/4 | **0/4** | **0/3** |
| Typical: fled or died | 0 | 0 (2 ⚑) | 2 | 4 | 3 |

| | N1 | N2 | N3 | N4 | N5 | N6 |
|---|---|---|---|---|---|---|
| Typical: Relay lost | 0, 0, 0, 0 | −9, 0, −18, 0 | −24, 0, −16, −11 | −42, −16, fell, −34 | **fell ×3** | never reached |
| Careless: Relay lost | −31, −30 | −58, −14 | fell, fell | — | — | — |

**Where the damage on days came from** (typical runs, all days together):
- Feral Scavenger: 444 (lunge, then thrust2);
- spores: 438 (pods, the nest quest's own puff, Bloaters);
- Spitter globs: 201;
- Bramble Crawler: 152;
- Razorback: 54;
- Thorn Stalker: 17.

Careless deaths were nearly all Ferals, plus spores on the nest quest.

---

## 3. Judgement

### Does the day economy fund the harder nights?

**No.** The gap in the deferred notes is now worse, in both directions at once:

- **Night demand went up.** Enemy health rose ×1.2 (N1) to ×1.56 (N6), and the Colossus went ×4.5 → ×6. That curve was tuned against the sim's typical, which banks ~85 S a day plus 1 C and 1 B.
- **Day supply for days 3–5 went down.** The real-input typical banks 124 / 46 / 29 / 12 / 9.
  - Day 1 is inflated by the guided Market day: a crate-lined trail at ×1.3 Scrap.
  - After it the typical averages **24 S a day**. That is the same range critic J2 measured (17–40) before Stage 9 made days harder.
  - Components are worse still: **0–3 Circuits and 0–3 Biofiber by N5**, so level 3 towers barely happen.
- **The money in hand at N5 prep:**
  - **Real typical:** 41–73 S and 0–2 components, with 7–8 towers already built for roughly 450–600 S of total investment.
  - **What N5 actually needs:** about 1,400 S plus 16 C and 16 B of build to hold at −21 (§5).

### Is there a death spiral?

**Yes, and it is the spine of every run.** A hurt day starts tomorrow at 75 HP with no med kit (Field Kit is locked on a first profile). So:
1. The 75-HP start means fleeing at ~20 HP with 10 S.
2. Fleeing means the quest fails.
3. A failed quest means no +20, no reward boon and **no skill point**.
4. Losing those means a weaker night.

Typical runs reached N5 with **1–3 skills**; the sim's typical takes 4 picks. A careless player is dead even earlier: the masher dies on day 2 or 3 (the salvage keeps 8–20 S), and the thin night build bleeds the Relay until N3.

### Where is the run decided?

**On days 3–5, by whether you can finish a quest on 75 HP.** The night only reads the verdict out:
- every fall was flagged before Start ("Too weak · Expect −52 or worse: may fall");
- at that point the player has 0–70 Scrap and nothing to do about it.

Placement mattered little: even 1,000 S of measured build loses N5 (§5).

### Difficulty curve

- **Nights 1–3 are flat and easy:** 0 to −24, readiness "Looks strong" or "Risky".
- **Night 4 bites:** −16 to −42, or a fall.
- **Night 5 is a cliff:**
  - It brings 45 enemies against N4's 26, and its health multiplier is ×10.8 against ×9.2.
  - Its push 1 alone took 27–65 Relay HP.
  - Variant A's total wave health goes 13,700 → 24,100 (+76%), while the typical's day income heads toward zero.
- **Days have the mirror-image shape:** a lavish day 1, a fair day 2, then days 3–5 where `extraEnemies` 0.5 → 1.5 plus Stage 9's damage, poise and counters add up to "go home at 20 HP".

### Is the boss night fair?

**It is readable but harsh, and no real run got to it.**
- With the measured builds the Colossus never died before its siege ran out.
- Its 7–8 slams (8 each) cost a **fixed 56–64 Relay HP whatever the build.** Builds of 1,400 S and 1,800 S both paid it.
- So night 6 is effectively "start with 65+ Relay and leak nothing else". With the real economy that is unreachable.

### Too easy, fair, or too hard?

| | Days 1–2 | Days 3–5 | Nights 1–3 | Nights 4–6 | The run |
|---|---|---|---|---|---|
| **Typical** | Fair, a bit easy | **Too hard** | **Too easy** | **Too hard**: a wall at N5 | **Too hard: 0/4 wins** |
| **Careless** | Hard: dies day 2–3 (fair, and readable) | — | Too hard with 1–2 towers (−30 on N1) | — | Over on N3: about right for "careless" |

### Is losing ever unfair or unreadable?

It is readable: the death modal names the move ("hit 8 times mid-swing… roll"), the readiness forecast flags every fall, and the leak lines are clear. Two things feel unfair:
- **N5's defeat is locked in a day earlier,** with no lever left at prep.
- **The nest quest's puff spawns its cloud on the nest itself** (`GOALS.purge` puff → `cloudAt(n.x, n.z)`). Popping a nest means standing in spores, so the "quest" is a damage tax. Spores were the biggest damage source after Ferals: C2 took 84 from spores and died on it.

---

## 4. Scores (out of 10)

| | Score | Why |
|---|---|---|
| Overall difficulty fit | **4** | The user asked for "not a cakewalk", and N1–N3 still are one. The fix landed as a wall at N5 plus brutal days 3–5. Nobody wins. |
| Fairness | **6** | Every loss is telegraphed and explained. But the N5 loss is decided by the day before, with no counterplay, and the nest quest punishes doing it. |
| Day ↔ night economy balance | **3** | Night demand is tuned to a sim player banking 85 S + 1 C + 1 B a day. Real typical banks ~24 S a day after the guided day, and 0–3 components by N5. |
| Run pacing | **4** | A flat first half (nights won at −0 with 3 towers), then a cliff. Losing a quest costs its skill point, so a hard day compounds. |

---

## 5. Measurement nights (debug defense, Crossing map, variant A, no skills, the same night pilot)

| Night | Build budget given | Build that resulted | Readiness | Relay |
|---|---|---|---|---|
| N4 | 500 S, 4 C, 4 B | 7 towers, five at L2 | Too weak | **−44** (min 26) |
| N5 | 600 S, 4 C, 4 B | 9 towers, five at L2 (components ran out) | Too weak | **fell** in push 2 |
| N5 | 1,000 S, 4 C, 4 B | 10 towers, six at L2, 326 S unspendable | Too weak | **fell** |
| N5 | 1,000 S, 12 C, 12 B | 10 towers, five at L3 | Too weak | **−56** |
| N5 | 1,400 S, 16 C, 16 B | 11 towers, eight at L3 | Risky | −21 |
| N6 | 1,000 S, 12 C, 12 B | 11 towers | Too weak | **fell**: 6 slams (−48) plus leaks |
| N6 | 1,400 S, 16 C, 16 B | 12 towers, five at L3 | Too weak | held at **7**: 8 slams (−64), Colossus not killed |
| N6 | 1,800 S, 20 C, 20 B | 11 towers, seven at L3 | Too weak | −59: 7 slams (−56), Colossus killed |

What these show:
- **Components bind before Scrap does.** A realistic 4 C / 4 B leaves hundreds of Scrap that can't buy power.
- **N5 needs about 2× what a real typical run has.**
- **The Colossus slam is a near-fixed tax of ~60 HP.**

---

## 6. Prioritised re-tune list

Target: the real-input typical wins about 60–70% (not the sim's 70% at 85 S a day), losing N1 0–10, N2 5–15, N3 10–25, N4 15–30, N5 20–35 and N6 25–45. The careless player reaches N4.

1. **Flatten the N5 cliff and lift N1–N3: `src/data/waves.js` `HEALTH_MULT`.**
   - `[1.5, 4.3, 6.0, 9.2, 10.8, 14.4]` → **`[1.6, 4.8, 6.8, 8.6, 8.8, 11.5]`**.
   - Also cut N5's counts about 20%: the "Ruin Guard march" pushes, 45 → ~36 enemies, by trimming the Crawler and Skitter groups.
   - Re-run the build9 campaign sim with typical's income set to **55 S + 0.6 C + 0.6 B a day after day 1** (the measured real rate, rounded up for a better-than-bot human), and tune to the target above.
2. **Make the boss night winnable without a 65-HP buffer: `BOSS_HP.hpMult` and `DEFENSE.longNight.bossHp`, plus the Colossus slam in `src/data/enemies.js`.**
   - Colossus ×6.0 → **×5.0** (6,120 → 5,100 HP).
   - Slam 8 → **6**, or 8 slams → **6**. Either way the siege tax drops from ~64 to ~36–48.
   - Keep the N6 escort. Re-check that a ~1,000 S build holds N6 at −30 to −45.
3. **Days 3–5 must stay winnable on 75 HP: `CONFIG.expedition.byNight` in `src/data/config.js`.**
   - `extraEnemies` `[-0.4, -0.1, 0.5, 0.85, 1.2, 1.5]` → **`[-0.4, -0.1, 0.25, 0.45, 0.65, 0.8]`**.
   - `enemyDamage` `[0.7, 0.85, 1.0, 1.05, 1.1, 1.15]` → **`[0.7, 0.85, 0.92, 0.95, 1.0, 1.0]`**.
   - Keep `enemyHp` and the Stage 9 poise rules: the skill is in the rules, not the volume.
   - Ferals did 444 of the typical's damage: in `src/data/enemies.js`, Feral `thrust2.fromNight` 2 → **3** and `chance` 0.4 → **0.3**.
4. **Break the death spiral: `src/data/config.js`.**
   - `dawnHpFloor` 75 → **90**.
   - A failed quest you extract from still earns its skill point from night 3, or add a free point at dawn of nights 3 and 5. At the moment skills are 1–3 by N5 against the sim's 4.
   - `deathSalvage` `[0.35, 0.3, 0.1, 0, 0, 0]` → **`[0.35, 0.3, 0.25, 0.2, 0.2, 0.2]`**.
   - `deathScrapFloor` `[20, 20, 12, 0, 0, 0]` → **`[20, 20, 15, 15, 15, 10]`**.
5. **Give the night a floor that doesn't depend on the day: `CONFIG.relay.stipend`.**
   - `[0, 10, 15, 20, 25, 30]` → **`[0, 15, 25, 40, 55, 70]`**: +110 S by N6, landing exactly where the real economy is short.
   - Plus 1 Circuit and 1 Biofiber in the stipend from night 3. Components, not Scrap, are what block level 3 (§5).
6. **The nest quest: `GOALS.purge` in `src/data/objectives.js` and `JungleGoals._updateBloom`.** Spawn the puff cloud **at the player's position when the ring was cast** (dodgeable), not on the nest. Or use `puffEvery` 6 → 9 with `puffRange` 3 → 2.2. Today popping a nest means standing in its spores.
7. **Spores as a day-damage source: `SPORES` in `src/data/jungle.js`.** `trigger` 1.3 → **1.0** and the Greenhouse's `perRegion` 28 → **18**. Spores (438) were as big a damage source as every Feral together. Part of that is my pilot's poor pod handling, so re-measure before cutting further.
8. **Day 1 is lavish, and that is fine:** keep the guided Market. But the briefing could warn on night 2 or 3 that "days get harder from day 3: a quest finished is worth +20 and a skill", so the cliff isn't a surprise.

**Expected effect:**
- Items 1–2 alone turn the 4 typical runs into "N5 at −40 to −60, N6 a coin flip".
- Items 3–5 restore 30–50 S a day and a third or fourth skill, which puts N5 and N6 inside the target.
- The careless player (N3 falls at −96 with 4 L1 turrets) reaches N4 on the stipend and health changes, which is the right place for a masher who builds little.

## 7. Top 5 re-tunes

1. **`HEALTH_MULT`** `[1.5, 4.3, 6.0, 9.2, 10.8, 14.4]` → `[1.6, 4.8, 6.8, 8.6, 8.8, 11.5]`, and N5's waves trimmed 45 → ~36 enemies. This lifts the flat N1–N3 and removes the N5 wall.
2. **Colossus** ×6 → ×5, with siege slam 8 → 6 (or 6 slams). The boss night currently costs ~60 Relay HP that no build prevents.
3. **Day pressure on days 3–6:** `extraEnemies` → `[…, 0.25, 0.45, 0.65, 0.8]`, `enemyDamage` → `[…, 0.92, 0.95, 1.0, 1.0]`, and Feral `thrust2` from night 3 at 30%. Today typical finishes 0 of 7 quests on days 4–5.
4. **Spiral breakers:** `dawnHpFloor` 75 → 90, a skill point for an extracted failed quest from night 3, and death salvage of 20–25% with a 15 S floor on nights 3–6.
5. **Stipend** `[0, 15, 25, 40, 55, 70]` plus 1 C and 1 B from night 3. Components are the real night bottleneck.
