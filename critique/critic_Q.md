# Critic Q: fresh-eyes newcomer play-through of Stage 9 (quests, arrow, bridges, text, build-anywhere, balance)

Build: the frozen Stage 9 build (`.playwright-mcp/frozen_s9`) on a fresh profile, played with real keyboard and mouse
through Playwright, mostly at 1280×720, with day 3 and night 3 at 1920×1080 (`setViewportSize` on the same page, so the
save carried over). Shots and scripts are in `.playwright-mcp/criticQ/`. I read game state only to measure things and to
steer. Debug shortcuts were never used. Run: title → New Run → guided day 1 → night 1 → day 2 → night 2 → day 3 →
night 3 → day 4 → **the Relay fell on night 4 (3/6 nights)**.

**How I played (read this before the balance section).** A script drove the inputs like a quick-reflexed but tactically
naive newcomer. It walked a grid path toward the quest (so it "followed the arrow" and went around obstacles). It
slashed anything within 2.4 tiles. It rolled sideways on every red-flash commit, held E at targets, and pressed Q under
45% health. It never timed deflects, never kited, never threw the machete and never avoided camps. Twice on day 2 the
game kept running while I wrote notes (about 30–40 s each). Those gaps cost about 37 HP and finished off the first
death. The day 3 and day 4 deaths happened with no idle time.

## Scores

| Axis | Score | One line |
|---|---|---|
| Quest clarity | **8 / 10** | The card, tracker and QUEST COMPLETE now read as quests. Weak spots: E-prompt crowding at quest sites, tiny quest marks on the big map. |
| Wayfinding / arrow | **8 / 10** | You can't miss the edge arrow on dark canopy or bright paths, at 720p or 1080p. It sometimes slides to a misleading corner. |
| Bridges | **6.5 / 10** | The bridges look great and are unmistakable. But "cross at the bridge" showed on 2 of 3 river days when a land route existed. |
| Text legibility | **8.5 / 10** | The new body face is a clear win over Tiny5 and every shot is pixel-crisp. The night build hint is off-screen at 720p, and a 1080p panel clips. |
| Newcomer difficulty fairness | **4 / 10** | Day 1 did 0 damage. Days 2, 3 and 4 each ended with me going down. The economy collapsed and night 4 was lost. Deaths were readable but snowballed. |
| First-hour fun | **6 / 10** | The goals are clear and fights feel tense, but the curve from day 2 is punishing more than teaching. |

## Timeline (newcomer narration + measurements)

**Title → briefing (720p).** The title is clean. The briefing's quest block (◆ QUEST "Salvage a power cell", ★ reward,
"(get home to claim it)") plus the coach box ("Do the quest, open crates for Scrap, then come home…") answer "what do I
do" before I leave. Night 1 already says "Crawler column · 20 enemies" and "Extra Crawlers attack tonight". That's a
bit alarming for a tutorial night, but fine.

**Guided day 1.** The quest card opens over the top centre (B01_arrive_card). It has the title, the step box, the reward
and "Follow the amber arrow · J this card · Tab map", and is easy to read. Bottom right is a 100 px pixel arrow with a
"◆ 26 m" badge, plus a small pointer by the player. *I knew where to go within one second.* The quest was 26 m away and
**done 12 s after I started walking**. "Guards burst out of the undergrowth!" fired, but the guard never engaged: I held
E and opened the cache with it standing beside me (B1_00). I took 0 damage all day. Coach 6/7 said loot the 2 crates
here, the cyan Home arrow said go home, and the tracker said "Head home to claim the reward". That's three messages at
once, but they don't conflict much. Home with **84 s of daylight left**, banked 28 Scrap + 20 bonus. Too easy even for
a tutorial: I never had to roll.

**Summary → night 1.** The summary is clear. The night board's Build bar shows icons + prices, and hovering gives the
name and stats. **The coach hint "Pick a tower below, then click free ground beside a path" never appeared on screen**
(see fix 3). I worked it out from the card hover and the placement panel. Once a card is picked, the side panel explains
everything ("Click free ground to build: green corners mark it… Dots show the path it would cover"). The ghost's tag
("Path", "Rocks", "Tree", "Taken", "Covers North 10 · South 10") teaches the rules by hovering. That's good. "Hides path"
(D09) is cryptic: the tile looks like open ground between two path loops. My first two hover guesses were both "Path",
because the paths are wide and hard to tell from ground. Night 1: 2 turrets, **−15 Relay** (forecast "−3 to −14").

**Day 2, Flooded Transit, escort.** The card's two steps, "1/2" and "(his health 35/60)" in the tracker are excellent.
At 42 m the tracker added "↙ cross at the bridge 16 m" and a big plank bridge appeared on the left (G2_01). It's
gorgeous and obvious. **But the bridge was a detour to the wrong bank**: the goal was reachable by walking round the
lake's east end, and my pathing never used the bridge (deep-water dump in the notes, fix 2). At Platform 7, 5 Ferals +
Crawlers guarded the engineer: **−40 HP** getting there. Holding E at the engineer opened, in turn, a strongbox, a crate,
a data log (a big lore popup over the fight) and a tool chest before "Lead the engineer home" (fix 4). Escorting home
went fine and QUEST COMPLETE fired at the Relay (G4_step). The banner, ring, "Reward secured" and green tracker make it
an unmissable moment. Out looting with 45 HP, a Razorback (22) and Feral packs (14 each) wore me down to 18 HP. During
my second idle gap I went down 75 m from home: **lost 41 Scrap, the drone saved 20**. The death screen is excellent:
"Taken down by a Razorback's charge. Step or roll sideways out of a Razorback's lane", plus today's wounds by source.
Night 2: free upgrades shown as "Upgrade FREE · tonight's reward" (J02), which is very clear. **−20** (forecast −5 to −18).

**Day 3 at 1080p, Data Center, uplink.** The card is just as clear at 1080p (M01). The arrow sits right beside the
minimap, top right. Starting the uplink spawned a fight. The 45 s hold took 67 s because of hit penalties ("−3 s").
Used both med kits and finished at 67 HP. I looted to 60 Scrap. Heading home at 57 HP, **two Ferals killed me in 9 s**
(4 hits of 14–15, the second thrust after my roll, "Out of breath"). That was with no idle time. **Lost 48 Scrap plus
the quest's reward (15% fewer enemies)**, drone saved 12. The summary shows the reward struck through: "Lost: the
**goal's** reward needs you to get home" (old word, fix 9). Night 3: Reinforced Core, a Snare Vine and a free upgrade.
**−33** (forecast −19 to −52), Relay 57/125. The "Also tonight" list says "Enemies are tougher every night (**+470%**
health tonight)", which is a scary, meaningless number for a newcomer (+309% on night 2, +774% on night 4).

**Day 4, Residential, pumps (720p).** The targets were 84–88 m away across a river. The big map (R03) shows the two quest
◆ as **7 px dots in the black** next to much bigger red boss skulls (fix 6). The route crossed a vertical bridge with
two Bloaters and Ferals bunched on it (R4_08): **a bridge is a forced chokepoint, so it becomes a trap**. Then I hit a
bramble wall, and the arrow led straight into a Feral camp (Laurel Court, 6 Ferals). 75 → 11 HP in 45 s. Pressing Q in
the fight did nothing for **7 s** (fix 5). I went down after 1 of 2 pumps. **Day 4 salvage is 0**, so all carried loot
was lost and the quest failed.

**Night 4.** 48 Scrap, no Circuits or Biofiber (lost on deaths), so no upgrades were possible. I repaired once and got
"Too weak · Expect −37 or worse: may fall". Start Wave turned into "Start anyway". The Relay went 92 → 0. **Run over,
3/6.** The results screen explains what got through and gives a tip.

## Quests: verdict

- I knew the quest, why it matters (★ reward on the card, tracker, briefing, summary) and where to go at every moment.
  That's a big step up from critic L / newcomer.
- The card fits the banner lane and leaves on its own after 1.5 tiles. J re-opens it. It never fought the coach or toasts.
- The tracker stays readable. In fights `JUICE.hudFade` drops it to 50% with creatures behind it (R4_08), so in a melee
  at the bottom of the screen the step text goes faint.
- QUEST COMPLETE: you notice it every time, and the cyan "Head home" arrow follows. The "you must get home" catch is
  told up front ("get home to claim it") but still stings (see balance).
- When going home is advised (low HP), both the amber quest arrow and the cyan Home arrow show, side by side when the
  quest step *is* "go home" (G3_paused: two arrows, same target). Hide the amber one when its target is the Relay.

## Wayfinding / arrow

On dark canopy (G2_00, M2) and bright paths (B1, R4) the arrow reads instantly: white-ink outline, amber ↔ yellow flash,
"◆ N m" badge. Sizes are 100 px at 720p and 150 px at 1080p. The light column over the site is subtle (a pale
diagonal shaft) but helps once you're close. The ◆▼ over targets is clear.
Issue: the arrow slides along the edge to avoid HUD boxes. A target straight south ends up at the **bottom-left
corner pointing down** (G01, G2_00). It still points the right way, but it sits 300 px off the true bearing. The
player-orbit pointer helps here.

## Bridges

The plank bridges are excellent art and impossible to miss once on screen. Map legend: "plank strips: bridges (the only
way across)". The tracker chip + minimap "H" work. Deep (navy) vs shallow (teal, wadeable) water is distinct enough.
Two problems:
1. **False "cross at the bridge"**, measured on day 2 (both ways). `JungleScene._updateFord` fires when the straight
   line to the goal touches *any* deep tile, then picks the bridge with the shortest straight-line you→bridge→goal under
   2.5× the distance. It never checks that a land route exists or that the bridge joins your bank to the goal's. On day
   2 the line clipped one tile of a lake. The suggested bridge led *west across the lake*, away from the goal, which
   was on my bank.
2. **Bridges as chokepoints.** Packs path over them and Bloaters sit on them (R4_08). For a newcomer, the "only way
   across" is also the most dangerous tile in the area.

## Text legibility

- The new body face (VR Glyphs) vs Tiny5, same screen (z_font_compare.png): wider letters, real x-height, open counters.
  Clearly easier to read at 720p, and every zoom I took is whole-pixel crisp (720p and 1080p).
- **Night build hint not visible at 720p.** The dock (`.df-hintdock`) ended up inside the scrolling `.df-body`, below
  the fold: rect y = 528–636 and later y = 937 inside a body that shows y = 116–426. "Enemies walk the dirt paths…
  Pick a tower… click free ground beside a path" never showed (D01, D04). The 1080p prep had the same text in the DOM
  but not on screen either.
- Briefing "Tonight's attack" at 1080p clips the skill chips at the panel bottom ("Field Medic" cut, z_skills1080).
- The "4" glyph is drawn open-topped and reads close to "Ч" (z_digits). Minor; numbers matter in this game.
- QUEST COMPLETE's 0.35 s pop-in starts bigger than its panel. A shot mid-animation looks like a ghostly title spilling
  out (z_qc1080). It's transient, fine.

## Night build UI for a newcomer

Once you click a card it's self-explanatory: the placing panel, the snapped ghost, the reason/coverage tag and the range
circle. Before that, the newcomer has no visible instruction (the hidden hint) and no tower names on the cards (hover
only). Other friction:
- The same-type surcharge isn't explained. The card shows "57" in red with no "+12: you already own one".
- "Hides path" is jargon.
- The weak-readiness guard turns the button into "Start anyway" with a toast. Fine.

## Balance for a newcomer (the important part)

| Day | Damage taken | Outcome | Banked |
|---|---|---|---|
| 1 (guided) | 0 | quest in 12 s, home with 84 s left | 28 + 20 Scrap |
| 2 | ~170 total (≈ 40 just to reach the engineer) | quest ✓, went down 75 m out (idle gap helped) | 20 salvage + 20 |
| 3 | ~165 (2 kits, 4 fruit) | quest ✓, went down going home (no idle), **reward lost** | 12 salvage |
| 4 | 113+ | went down at 1/2 pumps, salvage 0 | 0 |

| Night | Forecast | Actual | Relay |
|---|---|---|---|
| 1 | −3…−14 | −15 | 85/100 |
| 2 | −5…−18 | −20 | 65/100 |
| 3 | −19…−52 | −33 | 57/125 |
| 4 | "−37 or worse" | fell | 0 |

Verdict:
- **Day 1 → day 2 is a cliff.** Day 1 never asks you to roll. Day 2 hands you a 5-Feral guard pack.
- **Days 2–4 kill a newcomer on the way home**, and a death costs the carried loot *and* a completed quest's reward. From
  night 4 the salvage is 0 (`deathSalvage [0.35, 0.3, 0.1, 0…]`, `deathScrapFloor [20, 20, 12, 0…]`).
- So the nights starve. Night 4 had 48 Scrap and no components, and the run ended on the night the PLAN predicted
  ("the newcomer falls on night 3–4").
- Every death *was* readable: the "what got you" screen names the move and the counter. But they weren't the user's
  ideal "one readable mistake". They were attrition from packs:
  - 3–6 Ferals at 14–17 a hit, a 40% second thrust from night 2, spears at range.
  - Up to 2 (3 from night 4) attack tokens, with `afterHit 0.5` follow-ups.
  - Stamina runs out after ~3 rolls.
- Was it my fault? Partly: no deflects, greedy looting at low HP, two idle gaps. A real newcomer makes exactly those
  mistakes, though. The game reads as *fair but too steep*: too hard on days 2–4, too easy on day 1.

## Prioritised fix list

1. **Smooth days 2–4 and stop deaths snowballing** (`src/data/config.js` `expedition.byNight`, `src/data/enemies.js`
   feral):
   - `enemyDamage` [0.7, 0.85, 1.0, …] → [0.7, 0.75, 0.85, 0.95, 1.05, 1.15].
   - Feral `thrust2.fromNight` 2 → 3; spear damage 15 → 12 before night 4.
   - `objectiveCap`/`guards` night 2 → 2 (Platform 7 had 5 Ferals); cap Ferals per camp at 2 on days 2–3.
   - `deathSalvage` → [0.35, 0.3, 0.25, 0.2, 0.15, 0.1] and `deathScrapFloor` → [20, 20, 15, 10, 5, 0], so one death
     doesn't zero a night.
   - Consider banking the quest's *night reward* on completion for nights ≤ 3 (like the escort's), keeping only the
     loot at risk. "QUEST COMPLETE · +15% fewer enemies" followed by losing it reads as a betrayal.
2. **Bridge chip only when a bridge is needed** (`JungleScene._updateFord`). Use the existing `_bfs` (or a coarse
   land flood) to test whether the goal is reachable without a deck. If it is, show nothing. If not, pick the bridge
   whose two ends sit in the player's and the goal's land components. Also nudge `JungleGen` to keep bridge decks clear
   of spawns/camps, or make an enemy on a deck walk off it, so bridges aren't a newcomer trap.
3. **Show the night build hint** (`DefenseScene` hint dock). Keep `.df-hintdock` outside `.df-body.scroll`, docked
   directly above the Build bar, and verify at 720p. Also name the tower on each build card (or under the icon).
4. **Quest interaction wins E.** At quest sites the quest's interactable should take the prompt priority over crates,
   logs and strongboxes within ~2 tiles (`promptTarget` selection in JungleScene). Data logs shouldn't pop their big
   text box while creatures are within 8 tiles.
5. **Med kit never fails silently** (`Player.useMed`: `if (this.state !== 'free') return;`). Buffer Q for ~0.5 s like
   the roll buffer and start healing the moment the swing ends, or toast "Finish your swing to heal". Measured: Q held
   for 7 s mid-fight before a heal.
6. **Big map quest marks** (BigMap/minimap): make the quest ◆ 2–3× its current 7 px with a pulse and step numbers.
   Shrink optional boss skulls below it. Today they dominate.
7. **Readiness forecast** (`READINESS` in `src/data/waves.js`). Actual was above the upper bound on nights 1 and 2 (−15
   vs −14, −20 vs −18). Raise the upper bound ~20% for nights 1–2.
8. **"+309% / +470% / +774% health tonight"** (`DefenseScene.js:2161`): say "Enemies are tougher each night (night 3:
   ×4.7 health)" or drop the number. Big percentages scare more than they inform.
9. **Wording:** `SummaryScene.js:184` "the goal's reward" → "the quest's reward" (Stage 9 said goal → quest everywhere).
10. **Arrow placement:** for targets within ±25° of straight down/up, anchor the edge arrow just beside the tracker
    (`QUEST` slide rules in `JungleQuest._edge`) instead of the far corner. Hide the amber quest arrow when its target is
    the Relay and the cyan Home arrow is up.
11. **Day 1 tension:** make the guided cache's guard actually engage (it stood by while I looted), so the roll tip gets
    used once before day 2.
12. **Small text:**
    - The briefing's "Tonight's attack" panel clips skills at 1080p: let it scroll or move skills into the header.
    - Close the "4" glyph's top in `vr-glyphs.ttf`.
    - "Hides path" → "Would hide the path".
    - Explain the same-type surcharge on the build-card tooltip.

## Files

Shots: `.playwright-mcp/criticQ/`:
- Day 1: `B01_arrive_card`, `B2_complete`, `B8_home_prompt`.
- Night prep: `D04_prep_hint`, `D07_ghost_valid`, `D09_hides_path`.
- Day 2: `G2_sheet`, `G4_step`, `H10_death`.
- Day 3: `M01_day3_arrive_1080`, `M2_sheet`, `M3_sheet`, `O01_summary_day3_1080`.
- Day 4 and night 4: `R03_bigmap`, `R4_sheet`, `S05b`, `T01_results`.
- Zooms: `z_font_compare`, `z_skills1080`, `z_digits`.

Driver and scripts: `driver.mjs`, `play.js`, `lootloop.js`, `wave.js`, `inj.js`.
