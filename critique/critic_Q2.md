# Critic Q2: newcomer play-through of the Stage 9 fix wave (frozen `frozen_s9b`)

Build: `.playwright-mcp/frozen_s9b`, served at `http://frozen.test/` by request interception. Driver
`.playwright-mcp/criticQ2/driver.mjs` ran on port 7622 and is now stopped. Fresh profile, 1280×720 for play. Resolution
checks at 1024×600 and 1920×1080 used `setViewportSize` on the same page, so the save carried over.

- **Main run: real inputs only.** title → New Run → briefing → day 1 → summary → night 1 … day 5 → **the Relay fell on
  night 5 (4/6 nights)**.
- **Console:** 0 errors, 0 warnings, 0 page errors over the whole session.
- **Debug, used only after the run, and labelled as such:** one N4 Collapsed Residential day. It was for the 1024×600
  and 1080p day HUD, a careful escort, and a death screen.

**How I played.** Bot `criticQ2/play.js` plays a newcomer:
- **Reacting to flashes:** it rolls sideways **~300 ms (±60) after a red flash** within 4 tiles. It **ignores 25% of
  flashes** and keeps mashing through them. Measured over the run: 14 missed, 37 reacted.
- **Fighting:** it mashes anything within 2.4 tiles. It never deflects, never throws, and doesn't dodge spear lanes or
  spore rings.
- **Moving and looting:** it follows the arrow on a grid path, hacking thickets and heavy-chopping brambles. It presses Q
  under 45 HP and loots greedily after the quest.
- **Pausing:** every script ends by pausing, so no HP was lost to idle time. The bot got stuck on terrain twice (bot
  pathing). Both times the day was paused or no damage was taken.

## Verdict

The fix wave worked on almost every round-1 complaint. The day game is now **fair, readable and slightly easy**:
- 5 days played and **0 deaths**, with 27% of flashes ignored.
- Lowest HP was 34, outside one debug test.
- Damage came from readable things: Crawler bites, spear lanes, spore puffs and bleed. There was no brawl snowball.

The run was lost **at night, by slow Relay attrition**: 125 → 107 → 90 → 71 → 19 → fell on N5. The newcomer economy
can't keep up from N4. Two "too weak" warnings came when there was nothing left to buy.

The one day that went badly was a **quest failure, not a death**. On day 4 (N4 escort), the engineer died **17 s after
pickup**: a Razorback and a Feral were idling 7–12 m from him.

## Scores

| Axis | Score | One line |
|---|---|---|
| Quest clarity | **8.5** | The card, tracker, QUEST COMPLETE and failure all read well, and the quest now wins E. The escort fails with no warning. "GOAL FAILED" is still in one toast. |
| Wayfinding / arrow | **8.5** | One cyan arrow going home. A due-north arrow sits under the card, not in a corner. The arrow still points straight at the goal, not via the bridge. |
| Bridges | **8.5** | The chip appeared only on the 2 days where the goal is unreachable without a deck (checked by flood fill). It was absent on day 2. |
| Text legibility | **8** | The "4" is fixed and every shot is crisp. New clipping at 1024×600 (quest card top, briefing coach). The Start Wave button is clipped at 720p on busy nights. |
| Combat skill / feel | **8** | PERFECT, FANG ×2 and SPLAT fire constantly. Crawlers bite back (10 + bleed). The death note names the second thrust. Occlusion silhouettes are pale. |
| Newcomer difficulty fairness | **6.5** | Days are fair to easy. Nights decide the run through attrition the newcomer can't buy back. The escort at N4 is a coin-flip on where you press E. |
| Night build UI | **8** | The hint is on screen, the cards have names, and the ghost and coverage tags are good. Stale coach tips sit inside the placing panel. The Start button is clipped at 720p. |
| First-hour fun | **7** | The days are fun and flowing. Nights 4–5 feel like waiting to lose: "Too weak", 4 Scrap, nothing to click. |

## Run log (newcomer narration + numbers)

| Day | District / quest | HP lost (sources) | Result | Banked |
|---|---|---|---|---|
| 1 (guided) | Market · power cell | −10 (the guard Crawler **bit me while I held E**, + bleed) | quest in 9 s; home at 2:21 left | 36 + 20 |
| 2 | Residential · 3 spore nests | ≈ −70 (spear 12, Feral lunge 11/14, Skitters 6+6, **spore puffs 5×5 while popping nests**) | quest ✓, found + used 2 kits, home at 59 HP | 24 + 20 |
| 3 | Greenhouse · kill Razorback | ≈ −85 (Crawlers 10 + bleed, spores, spears 14–15) | the Razorback died to 2 PERFECT rolls with 0 damage to me; home at 46 | 75 + 45, 2 relics |
| 4 (fog) | Data Center · escort | ≈ −40 | **engineer killed in 17 s** (60 → 36 → 12 → 2 → 0) by a Razorback charge lane and a Feral; quest failed | 32 |
| 5 (heat) | Market · 2 pumps | ≈ −60 (Crawler packs, Ferals, a Stalker) | quest ✓, home at 50 | 21 + 20 |

| Night | Forecast | Actual | Relay after | Notes |
|---|---|---|---|---|
| 1 | −3…−15 | **−18** | 107/125 | 2 turrets. Above the upper bound again (3rd critic in a row). |
| 2 | −5…−21 | −17 | 90 (+20 patch → 110) | Snare + Spire + a free turret L2. Tip: "Skitters are fast: a Snare Vine…" (good). |
| 3 | −16…−48 | −39 | 71 (+20 → 91) | 4 Razorbacks −36. 7 towers. |
| 4 | "Too weak", −33…−92 | **−87** | **19** (+20 → 39) | 71 Scrap spent on 1 Spire + 1 repair. Burrowers/Razorbacks. "Start anyway". |
| 5 | "Too weak", "−51 or worse" | **fell** in push 2 | 0 | 99 Scrap → Repeater, Nest, repair. **6 Burrowers −36.** Run over: 4/6. |

The results screen is good. It names the Burrowers and says "Arc Spires and Snare Vines reach them underground". I had 3
Spires and 3 Snares, but on the wrong paths: nothing in prep told me where the Burrowers would surface.

## Round-1 issues re-checked

**Critic Q (newcomer)**

| # | Issue | Status |
|---|---|---|
| 1 | Day 2–4 cliff, death snowball | **Fixed.** 0 deaths in 5 days. Damage per day was 10 → 70 → 85 → 40 → 60, a smooth climb. |
| 2 | False "cross at the bridge" | **Fixed.** Day 2: no chip, and the land route worked. Days 4 and 5: chip shown, and a flood fill without decks can't reach the goal. |
| 3 | Night build hint off-screen; no names on cards | **Fixed.** "Enemies walk the dirt paths… Pick a tower…" sits above the Build bar (`D00_prep`), and the names show under the icons. |
| 4 | Quest loses E to crates | **Fixed.** The cache with a tool chest and a crate next to it still showed "Hold: Open the cache, take the power cell" (`B1_01`). |
| 5 | Q dropped mid-swing | **Fixed.** Q spammed mid-fight healed once, never lost a kit, and never ignored the press. |
| 6 | Tiny quest marks on the big map | **Fixed.** Big amber ◆ marks (`G01_bigmap`). |
| 7 | Forecast below actual on N1–2 | **Partly.** N2–N4 were inside the band. N1 is still over (−18 vs −15). |
| 8 | "+470% health" | **Fixed.** "about 3× / 4× / 6× / 7× night 1's health". |
| 9 | Old word "goal" | **Not fixed.** The escort failure fires "QUEST FAILED" and also "**GOAL FAILED** · He didn't make it. The **goal** can't be finished today". |
| 10 | Arrow in the corner; two arrows going home | **Fixed.** A due-north target puts the arrow just under the card (`Q00`). Going home shows only the cyan arrow (`B4_02`). |
| 11 | Day 1 guard never engages | **Fixed.** It bit for 8 while I opened the cache. |
| 12 | 1080 briefing skills clip; the "4" glyph; "Hides path" | **Fixed.** Skills fit with a "▾ more below" cue (`K01`). The 4 is closed (`z_four_*`). The tag now reads "Path". |

**Critic O (combat)**

| # | Issue | Status |
|---|---|---|
| 1 | Brawl snowball | **Fixed in practice.** I never saw more than 3–4 engaged. The worst burst was 3 Crawlers + bleed, −34 over 4 s on day 5. |
| 2 | Second thrust folded into "lunge" | **Fixed.** The wounds line reads "Feral Scavenger's second thrust 26" (`DE6_death`). I didn't re-measure reaction time. |
| 3 | Crawlers die before biting | **Fixed.** At N3–N5 Crawlers had 56–62 HP and bit for 10 + bleed. They were my main damage source. |
| 4 | Death note blames a DoT | **Fixed.** "Taken down by a Feral Scavenger's lunge" plus the mid-swing tip. |
| 5 | Med kit silent drop | **Fixed** (see Q5 above). |
| 6 | Red occlusion silhouettes | **Fixed.** A Feral behind canopy shows pale steel (`G1_03`). |

## New bugs and regressions

1. **1024×600: the quest card's top is cut off.** The header "◆ QUEST · Collapsed Residential Block" is above the
   viewport (`DB00_1024_day`). The card is too tall for 600 px and is anchored from the top.
2. **1024×600 briefing: the coach box covers "Tonight's attack".** The north enemy row is hidden under it (`A02`). After
   a resize to 1080p, the coach box stays at its old pixel position, over the quest card (`A03`). The resize case is
   minor.
3. **720p night panel: Start Wave is clipped at the bottom** when the Read / Disrupt / Trade rows and the counter tip are
   all present (`I00_prep2`, `I07`, `N03`). "South path 8" is also cut in half by the scroll area's edge.
4. **Stale coach tips inside the placing panel.** While placing a turret, the orange tip box said "Click a tower to
   upgrade it (U) or sell it (S)" (`D04_ghost3`). Another time it said "The right panel lists tonight's enemies… (click
   empty ground to bring it back)" (`D01`). Neither applies while placing.
5. **Pause menu:** the "Relics working for you" chips overlap the Resume button's top edge (`Q01_bridgechip`).
6. **Wrong prompt after a failed quest:** "Hold: Head home early (quest not done)" shows after the quest has already
   failed (`JungleScene.js:282`).
7. **"Too weak" with nothing to buy.** Nights 4 and 5 warned "Too weak · may fall" and turned the button into "Start
   anyway" while I had 4 Scrap. The warning has no action the player can take. When the player can't afford anything,
   say so ("Nothing left to build: start when ready") instead of asking for a confirm.
8. **The arrow doesn't route via the bridge.** The edge arrow points straight at the goal (north) while the chip says
   "↖ cross at the bridge 47 m". It works because the chip exists, but the big arrow, the thing the user asked for, sends
   you to the riverbank first.

## Balance for a newcomer

**Days: fair, a touch easy.**
- With ~300 ms reactions and 1 in 4 flashes ignored, no day came close to killing me in the real run.
- The relic **Hunter's Fang** (day 3) turned every PERFECT roll into a FANG ×2 hit. From then on the Ferals and the
  Razorback melted.
- The debug N4 Residential day without med kits was different: 70 s near the engineer took me to **11 HP** (Ferals
  13–16 a hit, a second thrust, a Stalker ambush). So the Feral districts still bite when you have no kits. Field Medic
  and the Workbench med kit carried my real run.
- Every hit was readable. Most of my unexplained chip was **spear lanes (12–15)**, which my bot doesn't dodge (they have
  a 0.9 s lane). A human will learn them.
- **Spore nests** cost ~25 HP at melee range. Each pop puffs on you. It is readable ("back off, or chop it from range"),
  but the quest asks you to pop three within a minute, so you eat all three.

**Escort at N4: unfair as presented.**
- The engineer has a **flat 60 HP** (`GOALS.escort.hp`), while hits on him scale with the night: −24 a hit at N4.
- `share: 0.5` of nearby creatures go for him, and a Razorback lane through him is close to a one-shot.
- I pressed E with a Razorback idling 7 m away. That is a newcomer mistake, but the game never said "clear the area
  first".
- In the debug repeat I fought for 70 s first (to 11 HP), then picked him up, and he walked home untouched. The skill is
  there; the game just doesn't teach it.

**Nights: the real difficulty, and they read as attrition.**
- Each night took 17–39 before N4, and only +20 patches came back.
- Repair costs 25 Scrap for 15 HP, and towers compete for the same Scrap.
- By N4 the newcomer arrives with ~70 Scrap and a 91/125 Relay, and the board says "Too weak".
- The Burrowers on N5 were shown in the briefing ("NEW"), but the prep counter tip only named the weakest path's
  Crawlers. Nothing told me "Burrowers on South: your South path has no Spire".
- The run ended where the PLAN says a newcomer ends (N4–5), so it isn't *wrong*. But it ends with no decision left to
  make, so it doesn't feel like it was the player's fault.

## Prioritised fix list

1. **Escort scaling and teaching** (`src/data/objectives.js` `GOALS.escort`, `src/scenes/JungleGoals.js`):
   - `hp` 60 → `60 + 15 × (night − 1)`, or cap damage to him at the N1 hit value.
   - Razorback charge lanes deal ×0.5 to him.
   - When E is held at the engineer with hostiles within ~10 tiles, the prompt says "Creatures nearby: clear them first"
     (still allowed).
2. **Night attrition the newcomer can act on** (`src/data/waves.js`, `DefenseScene`):
   - Make repair cheaper (25 → 15 Scrap for +15), or heal the Relay +10% at dawn.
   - The readiness counter tip should prefer an **uncovered special** over the weakest-path swarm, e.g. "Burrowers on
     South: only Spires/Snares reach them" when no arc covers that path.
   - When the player can't afford any build, repair or trade, skip the "Start anyway" confirm and say why.
3. **720p / 1024×600 layout**:
   - Night side panel: pin the Start Wave footer outside the scrolling `.df-body`. Check at 1280×720 with Intel, trades
     and a counter tip all present.
   - Quest card: cap its height and anchor it from the screen top with a margin. Check at 1024×600.
   - Briefing coach: keep it clear of the "Tonight's attack" column, and re-anchor it on resize.
4. **Stale coach tips while placing**: suppress or replace coach tips in the placing panel. Show "Click free ground beside
   a path… Esc cancels", not the upgrade/sell or enemy-list tips.
5. **Arrow via the bridge**: when the bridge chip is active, point the big edge arrow at the bridge until you're on the
   goal's bank (the `_updateFord` result is already there).
6. **Wording**:
   - The escort failure toast: "GOAL FAILED… The goal can't be finished" → "quest".
   - `JungleScene.js:282`: when the quest has failed, say "Head home (quest failed)".
7. **Forecast N1** (`READINESS`): raise the N1 upper bound ~25%. Actual was −18 vs −15 this time and −15 vs −14 in round
   1.
8. **Small items:**
   - Pause menu: give the relics row a margin above Resume.
   - Briefing cards at 1024×600 clip the boss line ("Optional. Kill it…" cut off, `K02`).
   - Shift+Space when the guard isn't armed only re-arms it. Let a deliberate Shift+Space start straight away.
9. **Leave day difficulty alone for now.** It now matches "harder but fair" for a newcomer. If anything, watch Hunter's
   Fang (rare; it doubles the payoff of every PERFECT roll).

## Not checked

- The Provoke dare (my defense never looked strong enough for it to appear).
- The amber "barely sees a path" warning (I never hovered such a spot).
- The data-log popup mid-fight.
- The Spitter ring.
- Reaction-time sweeps (critic O's domain).

## Files (`.playwright-mcp/criticQ2/`)

- **Briefing:** `A01_after_new`, `A02_brief_1024`, `A03_brief_1080`, `K00`/`K01`/`K02` (night 3 briefing at
  720/1080/1024).
- **Day 1:** `B00_day1_arrive`, `B1_01` (quest wins E), `B4_02` (one cyan arrow), `C00_after_home`.
- **Nights:**
  - Night 1: `D00_prep` (hint visible), `D01`/`D04` (stale tips while placing), `E1_end`.
  - Night 2: `I00_prep2` (Start clipped).
  - Nights 3–5: `N03_prep3_built`, `S03_startanyway`, `T1_end`, `Y1_end`, `Z00_results`.
- **Days 2–4:** `G01_bigmap`, `G1_03` (pale silhouette), `G2_01` (nests), `Q00_day4_arrive`, `Q01_bridgechip`,
  `Q2_00`/`Q2_01` (escort killed).
- **Debug:** `DB00_1024_day` (card clipped), `DB02_1080_day`, `DE6_death`.
- **Zooms:** `z_four_brief`, `z_four_top`.
- **Scripts:** `driver.mjs`, `play.js` (newcomer reaction model, brush-aware path), `inj.js`, `lootloop.js`, `place.js`,
  `wave.js`.
