# Verdant Relay: Critic C (round 2 playtest)

**Session:** 2026-10-13. I played the frozen build at `http://localhost:5191` in Playwright Chromium at 1280×720, plus one pass at 800×450. localStorage was cleared first. Screenshots are in `.playwright-mcp/round2/`.

**How it was played**

- **Expeditions:** an in-page bot sent real input. It used `keydown`/`keyup` on `window`, `mousemove` for aim, and `mousedown`/`mouseup` on `#stage` for LMB fire and RMB cutting. It pathed with BFS, fought, kited melee enemies, dodged with Space on enemy wind-ups and incoming shots, used med kits below 45 HP, cut brambles and lasers, held E on containers and objectives, and extracted.
- **Menus and prep:** real Playwright clicks and key presses, including 1–6, U, S, T, Space, Esc, C, N, K and L.
- **Debug hooks:** used only where noted:
  - `scene.debug.info()` and scene fields, to read state.
  - `debug.timeLeft(3)` once, to skip to the timer running out.
  - `debug.die()` once, for the salvage test, because my walk-into-enemies script got stuck on a wall.
  - `debug.setSpeed(4)` in the controlled defense experiments only. The real-run waves were played at the HUD's 2×.
  - `?debug=defense` URLs, for the controlled balance tests.
- **Environment note:** partway through the session, another agent opened a second tab in the same browser, on `:5190`. It has its own origin, so its localStorage was separate. I made sure my tab was in front before every action. The explore scene pauses itself when its tab is hidden, so a few seconds of that session may have been paused. No console errors came from `:5191`. The only errors in the log were round-1 leftovers from `:5291`.

---

## Run log (real run, fresh save, won 6/6)

| N | District / objective (+ optionals) | Expedition | Banked | Exp. kills | Prep: towers before wave | Left after prep | Wave | Relay | Bounty |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Collapsed Residential / Power Cell (+data log) | Extracted with 2:15 left, 0 damage | 39 S, 7 I | 7 | 3 (Arc, Thorn, Turret) | 9 S 0 C 0 B 5 I (Sabotaged) | 17 | 100 → **100** | +17 |
| 2 | Flooded Transit / Pumps (+nest, +data log) | Extracted with ~2:10 left, 91 HP | 59 S 1 C 1 B 3 I | 10 | 4 (Arc → L2) | 20 S 0 C 1 B 6 I | 20 | 125 → **125** (Reinforced Core) | +27 |
| 3 | Overgrown Market / Power Cell (+data log) | Extracted, 100 HP. Carried 67 S, banked 100 (×1.5) | 100 S 3 C 1 B 2 I | 19 | 6 | 39 S 1 C 0 B 6 I | 35 | 125 → **125** | +48 |
| 4 | Overgrown Market / Route Data (+nest, +locked cache) | Extracted with 1:29 left, 84 HP | **254 S** 5 C 2 B 3 I | 34 | 8 (two L3) | 80 S 0 C 1 B 7 I | 32 (three wave cuts stacked) | 125 → **125** | +51 |
| 5 | Data Center / Power Cell | **Died** with 2:01 left. Lost 92 S and 1 C. Engineer rescue still counted | 0 | 19 | 10 | 18 S 0 C 1 B 5 I | 44 | 125 → **125** (also reload-tested mid-wave) | ~+70 |
| 6 | Canopy Greenhouse / Clear the Blockage (+data log) | Extracted, 54 HP, +25 hoard | 103 S 2 C 5 B 7 I (+25 S) | 18 | 11 | 37 S 0 C 2 B 0 I (decrypted 10 Intel) | 39 + Colossus 1900 HP | 125 → **125**. Boss dead at ~37 s on 2×, never reached the core | +68 |

**Result:** victory with **0 Relay HP lost across all six nights**. The run earned 314 Research, and all six purchasable unlocks cost 295 in total. Average expedition income was 92 Scrap, which matches the design's "~90 S" assumption. Kill bounties added another ~280 Scrap.

---

## 1. Verification table: round-1 top 10s

### Critic A

| # | Round-1 issue | Status | Evidence |
|---|---|---|---|
| A1 | Late defense too easy (N3–6 cost 0 HP) | **Partially fixed** | The base curve now bites in controlled tests: N4 with 300 S of towers → 25/100, N6 with an under-upgraded build → defeat, N6 with L1 turret spam → defeat. In a real run, the stacked player-side bonuses (§3) bring it back to 0 HP lost on every night. |
| A2 | Night-1 death spiral | **Fixed** | On N1, death salvaged 30% (30 S → 9, 2 C → 1). There is a start-room med kit on N1–2, the N1 expedition is gentle (0 damage taken), and the death modal explains what is lost and what is kept. |
| A3 | Clear the Blockage elite room | **Fixed** | The N6 Greenhouse elite was a duel with light support. Bot went in at 54 HP / 0 meds and extracted at 54 after picking up and using med kits. The new spike is the **Data Center guarded cell** (see bugs). |
| A4 | Best run one night behind | **Fixed** | `meta.best.nights` was 1 right after N1. The title showed "3/6" while Continue said "Night 4". |
| A5 | Sabotage TypeError, no Intel hint | **Fixed** | Sabotage worked on all six nights (19 → 17 enemies on N1). The Intel hint appears on the first prep. Decrypt gives +4 RD per Intel (184 → 224 for 10 Intel). |
| A6 | Reload in prep undoes actions | **Fixed** | Reloaded N1 prep after building 3 towers and Sabotaging; Continue restored all of it. Later an accidental Quit on N4 prep also resumed exactly. |
| A7 | Hold time in prompts, one-hold containers | **Fixed** (behaviour) | Containers opened in one continuous hold every time (0.4 / 0.8 / 1.2 / 1.0 s). I didn't screenshot the prompt text itself. |
| A8 | N6 overlaps (hint / toast / side panel) | **Mostly fixed** | Toasts now queue at the bottom-right of the map (max 2) and never cover the boss bar (`boss_2.png`, `boss_4.png`). Hints sit at the map's bottom-left, clear of the lanes. The side panel still clips: "Confirm sell" is cut at the bottom edge (`25_sell_confirm.png`). |
| A9 | Tower levels invisible, pads look like props | **Fixed** | L2/L3 towers have gold chevrons and empty pads have glowing orange corners (`21_prep_n4_built.png`). |
| A10 | Test environment (HMR, debug URLs clobber save, wrong stats) | **Fixed** | Frozen build. A `?debug=defense` visit with a real N2 run saved left `verdant-relay/run` untouched (same 738 bytes, Continue "Night 2 · Briefing"). Debug runs didn't add to `lifetime.runs`. |

### Critic B

| # | Round-1 issue | Status | Evidence |
|---|---|---|---|
| B1 | Pulse Beacon range 2.6, buffs at most one tower | **Fixed** | Range is 4.5. Pad-pair distances give 1–5 neighbours per pad (pads 3, 4 and 13 reach 4–5). The panel shows "Buffing 1 tower" and buffed towers get an amber ring. Several neighbours sit at exactly 4.50 tiles, so check the comparison is `<=` with an epsilon. |
| B2 | Mid-wave quit cancels defeat / research farm | **Fixed** | Reloaded 20 s into the N5 wave. The title said "Night 5 of 6 · Wave (restarts)". Continue restarted the wave with the snapshot's 125 HP, 18 S and kill count, plus a clear "the wave restarts — your build was locked" toast. |
| B3 | Intel is a dead resource | **Fixed** | Decrypt and Sabotage both work. Sabotage is now *too* good; see §3. |
| B4 | Toasts over the boss bar / side panel | **Fixed** | See A8. |
| B5 | Boss retune, targeting names | **Fixed** | Labels are now Lead / Nearest / Toughest, with one-line explanations. An N6 prep hint says to set South-lane towers to Toughest. The boss has 1900 HP on N6 and shows a clear phase label ("Rooting — Crawlers incoming", "Winding up a charge!", "CHARGING"), a green root circle and a red charge strip. Controlled mixed build on default Lead targeting: won at 79/100. |
| B6 | Turret spam beats mixed builds | **Fixed** | The +5 S same-type surcharge is shown on the card ("1 built: +5 Scrap"). N6, 9× L1 turrets (585 S): **lost**. N6 mixed and upgraded (625 S): **won at 79**. |
| B7 | Curve hole at N2, "10% smaller" does nothing on small groups | **Fixed** | N1 19 → 17 with Sabotage, N4 36 → 32. Weak builds now hurt on N1 (no towers −73/−79, one turret −56) and N2 (one turret + beacon −74). |
| B8 | Thorn / Snare weak, repair 1 S per HP | **Fixed** | Thorn range 3.5. Snare 45% slow lingering 2.6 s, range 3.3 (4.4 with skills). Repair is 25 S → +15 HP, prorated: the last +3 HP cost 5 S. Repairing 48 HP cost 80 S. |
| B9 | `loadRun` half-loads corrupt saves | **Not re-tested** | `Save.validRun()` exists and is used by `loadRun`. I didn't inject a corrupt save. |
| B10 | Small fixes (banner night, burn = blast, Stockpile peak, slowed charge telegraph, slow tint) | **Fixed in code, partly unverified** | Burn zones keep the blast type (`Tower.js:254`). The charge telegraph includes `slowMult` (`DefenseEnemy.js:405`). Victory peak showed 356 S. I didn't check the banner night (the banner is short) or the night slow-tint readability. |

---

## 2. New bugs

### Major

**M1. Skill picks offer Watchtower Network while the Pulse Beacon is locked.**
- Repro: fresh save, finish any N1 objective. The summary offers "Warden · Watchtower Network: Pulse Beacon bonuses are 50% stronger."
- It came up 4 times in my locked run (N1, N3 twice, N5).
- Cause: `Run.skillOptions()` (`Run.js:167`) filters only by `req` (prerequisite skill), never by unlocks.
- Fix: add `unlock: 'pulse_beacon'` to `watchtower_network` in `skills.js` and filter on `meta.unlocks`. A wasted skill point is a real loss when you only get one or two per night.

**M2. Difficulty spike: the Data Center guarded power cell on N5.**
- What happened: bot arrived at 100 HP with 2 med kits and lost 100 HP plus both kits (150 effective HP) in about 14 s.
- Damage log: 21 (Razorback charge), then a stream of 6–11 HP hits from **four Rival Scavengers standing on almost the same spot**, (4.0, 5.0), (4.0, 5.8), (6.9, 2.9) and (7.5, 3.2), still there after the death (`22_n5_death.png`).
- `rangedCap` is 3 per room and `objectiveCap` is 5, so either alarm reinforcements are added on top, or the cap isn't applied to the cell's guards.
- Separation exists (`ExploreScene.js:792`), but idle or guarding enemies still overlap.
- Every other expedition in the run cost 0–46 HP, so this is a cliff, not a curve.
- Fix: count alarm and hold spawns against `objectiveCap`, cap guards that are ranged at 2, and apply separation to idle guards.

**M3. Pause → "Quit to Title" in defense has no confirmation, and Esc opens it from prep.**
- Repro: N4 prep, with nothing selected. Press Esc to "deselect", then click a pad near the map centre-right. The click lands on the pause modal's first button, **Quit to Title**, which quits at once.
- That happened to me. Prep is saved now, so nothing was lost, but it's jarring.
- The explore scene has an "Abandon expedition?" confirm. Defense should match (`DefenseScene.js` `togglePause`), or Esc should only deselect in prep when a selection exists.

### Minor

- **m1. Engineer's "free Relay repair (+25)" is wasted when the Relay is full.** On N5 at 125/125 the boon was listed and silently lost. It's applied automatically at prep start (on run 2 at 27 HP it went to 52, which works). Bank it for a later night, or show "(Relay full: converted to +X Scrap)".
- **m2. Med kits are lost on death, including the Field Kit kit.** After the N1 test death the run had 0/2 meds, and from N3 there are no start-room kits. The run then entered N3 at 60 HP with no kits. Consider letting the drone salvage med kits on N1–2, or keeping one.
- **m3. Disabled Upgrade buttons are unreadable.** The cost is grey-on-grey ("Upgrade ⚙ 30 SCR ▣ 2 CIR" is barely visible, `15_upgrade.png`). The red shortfall line below helps, but the cost itself should stay legible.
- **m4. Side panel clipping** (B9 remnant). "Confirm sell" sits half below the scroll edge at 1280×720, and the wave preview's per-lane lists need scrolling on N6 once the Emergency Patch button appears.
- **m5. The build-card role chip "SINGLE TARGET" is truncated** at 800×450.
- **m6. Lane labels ("North ▸ 20 more") sit on top of enemies** as they spawn at the lane mouth (`23_wave_continue.png`).
- **m7. Toasts still use real-time `setTimeout`** (`ui.js:144`), so "New: Seed Carrier" notes keep fading while the game is paused (seen in the code, not in play).
- **m8. Buying the Scattergun silently makes it the starting weapon** (`CollectionScene.js:202`). My next run started with it without my choosing it. Ask, or leave the Carbine selected.
- **m9. Skill picks often came from a single branch** (N1: three Warden, then three Engineer). It may be shuffle luck, but showing one option per branch when possible would make picks more interesting.
- **m10. Lots of empty space on briefing cards.** About 40% of each district card is blank at 1280×720 while the threat text is small (`03_briefing_pick.png`).

No console errors or exceptions came from the 5191 build in about 2 hours of play.

---

## 3. Balance

### Controlled defense tests

Debug URL, Overgrown Market threat (+Crawler group), no skills or boons, 4× sim:

| Test | Build | Relay |
|---|---|---|
| N1, no towers | none | 100 → 21 (Flooded/Burrowers variant in run 2: → 27) |
| N1, one turret (pad 14) | 45 S | 100 → 44 |
| N2, one turret + Pulse Beacon (run 2) | 95 S | 100 → 26 |
| N4, 300 S mixed (Arc L2, Turret L2, Turret, Thorn, Snare, Arc) | 300 S | 100 → **25**. 4 Razorback leaks = 48 |
| N6, 405 S mixed, under-upgraded (245 S left unspent) | 405 S | **Defeat**. Boss still at 785/1900 |
| N6, 625 S mixed, upgraded, everything on Lead | 625 S | **Won at 79** |
| N6, 9× L1 Scrap Turret (585 S) | 585 S | **Defeat** |

**Conclusion: the base curve is now tense but fair.** Weak builds hurt on N1–2, N4 punishes under-investment, N6 punishes spam and leaving Scrap unspent, and a sensible upgraded build wins with a margin. That's a big improvement on round 1.

### Why the real run was still trivial (0 HP lost on all six nights)

Player-side multipliers stack on top of a curve that was tuned without them:

1. **Wave-size cuts stack multiplicatively, and Sabotage is free money.** On N4 I had Route Data −10%, Nest −15% and Sabotage −10%: 36 → 32 shown, about −31% from the base wave. Intel income was 0–7 per expedition (average ~4), so the 2-Intel Sabotage was affordable **every night** with Intel left to Decrypt. **Dominant strategy: always Sabotage, and chase nest and Route Data boons.**
2. **Kill bounties scale with the wave:** +17 / 27 / 48 / 51 / ~70 / 68 Scrap per night, about 280 total. By N4 a night's bounty equals an average expedition's income. More towers mean more kills, which means more towers.
3. **Overgrown Market + Pack Rat I/II gave 254 Scrap in one N4 expedition**, almost 3× the design's ~90. ×1.5 applies to everything, and the Market has many containers and ambush caches.
4. **Run skills:** Prepared Defenses (+15 S per night, 90 S over the run), Reinforced Core (+25 HP that was never needed), Rapid Response (−30% speed for 8 s at the start of each wave) and Long Sightlines.
5. **Placement:** pads 7, 8, 13, 14 and 15 around the core funnel cover both lanes. With 8–11 towers there, nothing leaks. The fixed map still has one right answer (B's round-1 point stands).

### Economy

- Circuits are the real bottleneck, which is good. Flooded Transit's "Circuits ×2" still gave only +1 on N2. The best night was +5 (Market N4).
- Scrap is abundant from N3 on. I ended prep with 37–80 S left over on most nights, even after buying everything useful.
- Repair at 1.67 S per HP is now well priced.

### Boss

- **Telegraphed:** yes. The phase label, toast and hint all explain it; the green root ring and red charge strip are readable (`boss_2.png`, `boss_4.png`).
- **Beatable:** yes, and fairly. A 625 S Lead-only build wins, and an under-built N6 loses.
- **Problem:** in a real run the Colossus melts. 11 towers with the South lane on Toughest killed 1900 HP in about 37 s at 2× before its second charge, and it never touched the core. A climax that ends before its second attack isn't dramatic. Options:
  - a 50% HP shield or enrage phase;
  - scaling boss HP with tower count or value;
  - letting its root phase spawn Ruin Guards instead of Crawlers.

### Expedition curve

- N1–N4 took 0–16 damage per expedition for a competent player, extracting with 1:30–2:15 left. The 180 s timer only mattered when I forced it.
- N5 Data Center was a sudden wall (M2). N6 Greenhouse elite was fine.
- The curve needs to be smoother: a little more pressure from N3, much less at the N5 objective.

### Meta progression

One victory (314 RD) bought **all 6 unlocks (295 RD)**. The meta layer is finished after one run.

---

## 4. Feel and clarity

**What works well now**

- **Controls:** responsive. The dodge cooldown is visible on the HUD chip.
- **Onboarding:** much better. Hints come one at a time, in order: controls → objective → med kit → cutter → build → select → Intel → preview → start → wave → boss. They're dismissable and stay off the lanes.
- **Death screen:** clear about lost versus salvaged.
- **Overtime:** reads well. A red `+0:09` counter, "Time's up! … beacon in 8s", "Emergency beacon is up at the start room", and reinforcements every ~14 s (`30_beacon.png`).
- **Prep:** still the strongest screen.
  - Cost lines with exact shortfalls ("Need 16 more Scrap", "Need 1 more Circuit", now singular).
  - The surcharge shown on the card.
  - Prorated repair labels ("Repair +3 HP ⚙ 5").
  - "Repair (Relay full)".
  - A sell confirm with a shrinking bar and a 4 s window.
  - Upgrade previews ("Attack speed bonus 20% → 35%").
  - Threat and boons shown at the top of the wave preview.
- **Continue:** works from briefing, prep and mid-wave, with honest labels ("Night 5 of 6 · Wave (restarts)", "Night 4 of 6 · Night prep").
- **Settings:** shake, volume and resolution persist across a reload (`{"shake":false,"volume":0.4,"resolution":"sharp"}`). Canvas went 480×270 → 640×360 on the title, and night renders at 1280×720.
- **800×450:** everything fits, with no overflowing elements. The smallest text is 7.8 px, which is small but readable.

**What's still confusing or flat**

- **Nothing to do during a wave** except change targeting or press Emergency Patch. At 2×, waves last 23–40 s, which is fine, but there's no decision.
- **The explore loop flattens once you know it:** go to the objective, open everything within ~45 tiles, extract early. The timer, events and risk/reward of "stay longer" rarely matter because extraction is safe and fast.
- **The pause modal sits in the middle of the night map** and eats pad clicks (M3).
- **Pad numbering:** the side panel says "Pad 14", but internally it's pad 13. That's fine for players, confusing in bug reports.
- **Audio:** not evaluated (headless).

---

## 5. Top 10 remaining fixes, by impact

1. **Cap the stacking of wave-size cuts.**
   - Sum the boons, Sabotage and nest cuts additively and floor the total at −20%. Or make Sabotage escalate (2 → 3 → 4 Intel per use per run), or make it remove one specific group type instead of 10%.
   - Where: `CONFIG.intel.sabotageWave`, `Run.sabotage()`, and `buildWave` in `DefenseScene.js`.
   - This is the main reason a real run takes 0 damage.
2. **Reduce kill bounties from N3 on.**
   - Halve `bounty` on Crawlers and Skitters (1 → 0.5, accumulated), or cap bounty at about 30 S per night.
   - Where: `src/data/enemies.js`.
3. **Tone down the Overgrown Market.**
   - Scrap ×1.5 → ×1.25, and have Pack Rat II apply to crates only. 254 S in one expedition breaks the economy.
   - Where: `src/data/districts.js`.
4. **Fix the N5 Data Center guarded-cell spike (M2).**
   - Count alarm and hold reinforcements toward `objectiveCap`.
   - Cap ranged guards at 2.
   - Separate idle guards so four Scavengers can't share a tile.
   - Where: `ExploreGen.js` and `CONFIG.expedition.byNight.guards` / `rangedCap`.
5. **Filter skill options by unlocks (M1).**
   - Add `unlock: 'pulse_beacon'` to Watchtower Network and check `meta.unlocks` in `Run.skillOptions()`.
6. **Add a confirm to defense Quit to Title, and stop Esc in prep from opening pause when nothing is selected (M3).**
   - Where: `DefenseScene.togglePause`.
7. **Give the boss a second act.**
   - At 50% HP: a short shield (halves kinetic, like the Ruin Guard) or an enrage with faster charges.
   - Or spawn 2 Ruin Guards during the root phase on N6.
   - Where: `enemies.js` colossus and `DefenseEnemy.js`.
8. **Make meta progression last more than one run.**
   - Roughly double the unlock costs (total ~600) or add a second tier of unlocks.
   - Where: `src/data/unlocks.js`.
9. **Smaller fairness fixes:**
   - Bank or convert an unused engineer free repair (m1).
   - Have the drone salvage med kits on N1–2 (m2).
   - Leave the Carbine selected after buying the Scattergun (m8).
10. **UI polish on the prep side panel:**
    - Keep disabled upgrade costs legible (m3).
    - Stop the panel clipping "Confirm sell" and the lane lists (m4).
    - Stop role-chip truncation at small sizes (m5).
    - Pause toasts with the game (m7).
    - Move lane labels off the spawn mouth (m6).
