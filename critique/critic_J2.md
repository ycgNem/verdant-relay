# Verdant Relay: Critic J2 (round 2): game design, content depth, progression, replayability

**Session:** 2026-10-14. I played the frozen snapshot `.playwright-mcp/frozen_r2b/`, served by request interception to my own headless Chrome at 1280×720. I started from a clean profile and kept one browser context for the whole session, so the save carried between runs.

- **Console:** 0 errors, 0 page errors.
- **Files:** everything is in `.playwright-mcp/roundJ2/`:
  - screenshots `J2_*.png`;
  - `driver.mjs`, `night.js`, `goE.js`, `fightGoal.js` and `lootday.js`;
  - `sim.mjs` (area, goal and skill offers over 2,000 seeds) and `mapsim.mjs` (map pick over 100,000 seeds).

**How it was played**

- **Two real runs from the title** with no debug. Run 1 was the guided first run. Run 2 had the Mortar unlocked.
- **Inputs:**
  - Treks were driven by critic J's in-page bot (`botJ.js`, copied, with a guard added in `path()`). It is an aggressive, average fighter: it never deflects and dodges badly.
  - Every shrine pick, E-hold, skill card, Workbench craft, build, upgrade, Protocol cast, weak-start confirm and salvage pick was real keyboard or mouse input.
  - Waves ran at 3×. The night script casts Vine Snare (Q + click) on the lead enemy.
- **Debug, only for:**
  - nights 5 and 6 and the victory;
  - Long Night night 9;
  - an Overgrowth 6 briefing;
  - a Security Warden kill with god mode;
  - an event prompt;
  - the Crossing and Ford maps;
  - one loot-only comparison day.
- **Code read:** all of `src/data/*.js`, plus `Run.js` and the goal, relic, boss and summary paths that consume them.

---

## 0. Headline

Round 1's roadmap was built almost completely, and it shows:
- Relics, shrines, area bosses, 10 goal types, events, weather and lore exist.
- 22 skills with keystones, a Workbench, three Protocols, pushes and lulls.
- L3 branches, 18 wave variants, a 21-node research tree, Overgrowth, Long Night and a Daily.

**On paper this is now ~50% of a $10–15 roguelite, up from 15–20%.** The day finally matters to the night (danger lane, beacons, relics, killing a boss to remove a danger), and the night has verbs.

But the systems were built side by side and do not yet add up to a game an average player can finish:

1. **The economy starves the median player.** In 8 real days I banked a mean of **17 Scrap**, and **4 of the 8 days ended in death**. Both runs went into N3 under-built and **fell on night 4 at 70% of the wave**. The sim's "typical" player banks 85 a day; my runs are the sim's *newcomer* (0/36 wins).
2. **The new goals pay in kind, not Scrap, and often pull you away from loot.** A loot-only day with the same bot banked **74 Scrap** plus a skill point (from a bonus task), 2–4× a goal day.
3. **Systems collide:**
   - every relic strongbox sits inside a boss's aggro radius from day 3;
   - the Pack Lord wakes on top of a goal;
   - "carry the core home" fails *at* home;
   - a speed danger "comes down the North path";
   - the map pick is broken, so 2 runs in 3 play Twin Paths.
4. **Overlaps everywhere:** five med-kit sources at two prices, three "+15% range" sources, four "−X% enemies" boons under one hidden cap, two different things called "data log", two called "beacon", two called "uplink".

---

## 1. Run log (real runs)

| Day | Area, goal | What happened | Banked | Night |
|---|---|---|---|---|
| R1 D1 (guided) | Market, *power cell* | Goal at t=113 s. Home at t=143 s with full HP (`J2_06`, `J2_08`) | **38 S** | 2 towers. **−0** (`J2_12`) |
| R1 D2 | Flooded, *escort* (new) | Shrine 20 m from the Relay (Rusted Bell). Data-log bonus. Engineer found. Strongbox (Ironwood Grip). Died at t=121 s to Spitter sap, 12 hits × 8 (`J2_27`, `J2_28`) | 20 S salvaged. **Both relics lost** | 4 towers. **−18** (`J2_33`) |
| R1 D3 | Market, *uplink* (new), fog | Uplink done at t=85 s (60 → 44 HP). Mast shrine (Capacitor). No containers at the uplink (`J2_37`) | **17 S, 1 C** | "Too weak". **−42** (`J2_43`, `J2_44`) |
| R1 D4 | Residential, *kill Razorback* | **The Pack Lord engaged at the goal**, 20 tiles from its lair. 62 → 0 HP by t=50 s (`J2_47`, `J2_49`) | 0 | 48 S → one upgrade. **Fell at 70%** (`J2_52`) |
| R2 D1 | Residential, *kill Razorback* | Shrine 20 m out (Rusted Bell again). Its glasshouse heal was wasted at full HP. Elite killed (100 → 41 HP) (`J2_60`, `J2_62`) | **27 S + 25 bonus**, 1 C, 2 B | 3 towers. **−0** (`J2_69`) |
| R2 D2 | Greenhouse, *haul core* (new), rain | Mast shrine (Old Battery). Carried the core 69 m (66 → 31 HP). **Delivered at the Relay, then killed there by Crawlers before the 2 s hold.** "Reward lost" and the relic lost (`J2_77`) | 6 S salvaged | **−5** (`J2_79`) |
| R2 D3 | Market, *fix power box* | Mast shrine (Compass). Opened the strongbox at the lost major → **woke the Brood Hive** (`J2_85`). Fled at 14 HP to a beacon | 6 S, 1 B, 2 relics. **No goal, no skill point** | 57 S. "Too weak". **−77** (`J2_89`) |
| R2 D4 | Data Center, *track Alpha* (new), heat | The first track is **70 m out**; the Alpha waits **23 m from the Relay**. Died at t=57 s on the way out (`J2_93`, `J2_94`) | 0 | Overcharger fitted. **Fell at 70%** (`J2_98`) |

**Run totals at N4**

| | Run 1 | Run 2 |
|---|---|---|
| Scrap from days | **75** | **64** (+25 goal bonus) |
| Skills | 3 | 2 |
| Relics owned at night | 1 | 3 |
| Relics lost to deaths | 2 | 1 |
| Research | 84 | 67 |

**Debug nights**
- **N5:** 8 towers, 4 at L2 (~430 S), 4 skills. **Fell at 67%** to 17 Crawlers (`J2_A2`).
- **N6:** 9 towers at L2–L3 (~950 S). Won on **86/125**; the Colossus died in 50 s at 3× (`J2_A4`, `J2_A5`).

---

## 2. Content inventory (round 1 → round 2)

| System | Round 1 | Round 2 (verified) | Genre reference |
|---|---|---|---|
| Night maps | 1 | 3 (Twin, Crossing, Ford), all the same frame: Relay right, 2 lanes from the west (`J2_B5`, `J2_B6`). **Twin is played 67% of the time (bug, §8)** | Thronefall ~10 |
| Waves | 6 fixed | 18 authored variants + a Long Night generator | ✓ |
| Night verbs | 1 button | 3 Protocols (2 behind 250 RD), lulls, call-early, L3 branches, mod sockets | Thronefall: hero in the fight |
| Day goals | 5 + 3 dead events | 10 goals + 3 live events + 4 bonus tasks | ✓ |
| Bosses | 1 | 1 night boss + 5 area bosses | Hades 4 + minibosses |
| Day creatures | 5 | 8 + elites/Alpha (Stalker d3, Bloater d4, Chief d5) | ✓ |
| Build pieces | 18 % skills | 22 skills (4 keystones), 24 relics, 4 mods, 3 blade upgrades, 12 L3 branches | StS ~75 cards + 170 relics |
| World texture | none | Named places, 20 lore logs, 5 shrines, ~4–5 strongboxes, weather ×3 | Don't Starve set pieces |
| Meta | 7 unlocks / 535 RD | 21 nodes / 2,020 RD (+3 hidden towers), Overgrowth 1–10, Long Night, Daily, Codex 24 + 20 | Dome Keeper |

**Estimate: ~50% of a $10–15 roguelite.** That's a big jump. What's still thin:
- **Night:** one board shape with two lanes; the tree's three new towers are hidden.
- **Biome:** one.
- **Meta:** mostly "more choice" nodes. Only 5 of the 20 buyable nodes add a verb: Mortar, Beacon, Arc, Flare, Parang.

---

## 3. Core loop: day → night

**What works:**
- **Danger lane:** the area's danger enters from the lane facing it ("Comes down the South path, the side nearest…", `J2_31`).
- **Beacons:** online beacons open forward pads (pad 14 flagged forward in R2).
- **Relics:** carried-then-banked relics put real weight on getting home (`J2_28`: "Relics lost (2)").
- **Bosses:** a boss kill deletes an area's danger for the run (`J2_A9`, `J2_B1`). That's the best new long-term decision in the game.
- **Readiness:** the forecast was right on every night:

| Night | Predicted | Actual |
|---|---|---|
| N2 | −5 to −20 | −18 |
| N3 (R1) | −18 to −49 | −42 |
| N3 (R2) | −31 to −80 | −77 |
| N4 (both runs) | "may fall" | fell |

**What doesn't: the Scrap pipe.**

| Day type (same bot) | Banked Scrap |
|---|---|
| Guided / elite goal days | 38, 27 (+25) |
| New-goal days (uplink, haul, escort, track) | 17, 6, 20, 0 |
| Loot-only day (debug Market N2, ignored the goal) | **74**, +1 C +1 B +2 I, and still a skill point via the data-log bonus |

- **The new goals send you to places with nothing to loot:**
  - the uplink is a beacon with no containers;
  - the escort and the core cost speed or HP;
  - the Alpha trail is a 70 m trek out and back.
- **Their rewards are mostly boons:** 2 free upgrades, −15% enemies, +10% damage. A thin build can't even use 2 free upgrades.
- **The skill point doesn't need the goal:** a bonus task grants it when the goal isn't done (`OPTIONAL.*.skillPoint`). So for Scrap the optimal day is "ignore the goal, loot, grab the nearest bonus".
- **Deaths:** dawn health is floored at 60, and nothing heals in between. Field Kit and Field Dressing are research unlocks; the Workbench med kit costs 15 S + 1 B, a third of a tower. So days 2–4 start at 60–66 HP, and the bot died on 4 of 8 days.
  - *Caveat:* the bot never deflects, and critic I2's skilled bots take far less. But a 50% death rate for an average player on days 2–4 is a pacing red flag, not just a skill check.

**Night time share.** Real seconds at 3×:

| N1 | N2 | N3 | N4 | N6 |
|---|---|---|---|---|
| 22–30 | 27–37 | 46–67 | 30 (fell) | 50 |

A cycle is ~2–4 minutes of jungle and ~1–2 minutes of menus, against ~1 minute of night. The "hold the line" half is still the shorter half.

---

## 4. Decisions

### Which area: now real

- **What a card weighs:**
  - Finds apply to everything you loot that day.
  - The danger arrives on the lane facing the area.
  - A **☠ boss** you can kill to remove that danger for the rest of the run.
  - Weather on top (`J2_34`, `J2_45`).
- Offer repeats are fixed: one area offered on 4+ of 6 nights in **4.2%** of 2,000 seeds (74% in round 1).
- **But goals repeat:** **58% of runs repeat a goal within 6 days** (10 goals, the deal avoids only the last two nights).
- **And Finds beats Goal:** see §3. "+30% Scrap" is the best line on any card for a struggling player.

### Stay or leave: good, with leaks

- Carried relics plus salvage ≤ carried give the hold-E-home moment real tension. In R2 D3 I fled a boss at 14 HP to bank two relics, and that was a genuine choice.
- **Leaks:**
  - **The haul goal.** The drone "takes the core" at the Relay, but its reward still needs the 2 s hold, so dying *at the Relay* forfeits it (`J2_77`: "✓ Carry a generator core home … Lost: the goal's reward needs you to get home"). That's contradictory.
  - **The glasshouse.** Its once-a-run heal is consumed at full HP (`JungleRelics.js:212`). Both glasshouses I met were 20 m from the Relay on day 1–2 at full health, so the heal is wasted by construction (`J2_20`, `J2_60`).

### Boss or not: strong, but entangled

- **The reward is excellent:** a rare relic, a skill point, +30–35 RD and the danger removed (`J2_B1`).
- **The entanglement:**
  - Lairs prefer the *lost major* site (`JungleGen.lairCandidates`), and every lost major holds the relic strongbox.
  - `BOSS.clearProps.to = [6.5, 9]` moves the strongbox to 6.5–9 tiles from the lair, **inside `aggro` 9**.
  - So from day 3, **every strongbox wakes a boss** (`J2_85`: opening "Seed Bank" started the Brood Hive). Nothing on the map says so.
- **The Pack Lord** (tether 9 + aggro 9) engaged at a goal site 20 tiles from its lair (`J2_47`). Goal sites only exclude the lair site itself (`JungleScene.js:351`).
- So "Optional" on the card isn't true from the player's side.

### Shrine pick: fine

- Pick 1 of 2, or leave both for later, is clean and quick (`J2_20`, `J2_38`).
- **But the offers ignore your build:**
  - Bramble Gloves can be offered to a Parang owner;
  - Tapir-hide Boots to a Brush Dancer owner;
  - Overcharged Capacitor / Signal Booster when you own only Vine Snare (R1 took Capacitor with 1 Protocol).

### Post-night salvage: inverted

- Clean nights get 3 options, bad nights 1. The pool doesn't filter dead options:
  - **"Relay patch +20" at 100/100** (`J2_69`);
  - after −42 (Relay 40/100) the *only* option was **Tune-up +15% range** (`J2_44`).
- The night you most need a choice gives you none, and the night you need nothing offers a dud.

---

## 5. Do builds emerge?

**Partly.** The skill rework does what it promised:
- In the sim, 6 picks give **1.0 keystones** and **83%** of skills in one branch.
- In play the cards lean to your branch: all three R1 N3 cards were Engineer, with **Chain Reaction ★** (`J2_40`).

**But:**
- **Too few points when you're losing.** One point a trip, and dying or fleeing before the goal gives none. I had **3 and 2 skills by N4**. Struggling runs get thinner, winning runs get boss points: rich get richer.
- **Relics are mostly flat stats with no synergies between them.**
  - Day relics (13 of 24) mostly buff machete feel: Whetstone, Glass Machete, Ironwood, Hunter's Fang, Featherfoot.
  - Night relics are small percentages.
  - Only Pylon Coil (beacons → tower speed) and Seed Bank (Thorn/Snare) push a direction.
  - Deaths ate 3 of my 7 relics.
- **Mods** are four stat sticks in one socket. The Workbench appeared after **6 of 7** non-guided summaries; I crafted once.
- **No item says "build around me":** nothing in the order of StS's Dead Branch or Hades' duo boons. The keystones come closest.

---

## 6. Reasons to explore

**Much better:**
- named places with arrival banners;
- 20 lore logs in story order (decent writing, `J2_23`);
- shrines, strongboxes and caches;
- the radio mast reveal;
- lairs marked ☠;
- weather.

The jungle now has "what's over there?" moments.

**Problems:**
1. Shrines cluster near home. In both worlds the nearest shrine was **20 m** from the Relay, a free day-1 relic.
2. Strongboxes become boss chests from day 3 (§4).
3. **Lore pacing is slow:** 3 of 20 logs in 2 runs, so the story needs ~12 runs.
4. The relic Codex filled fast: **11/24 seen after 2 runs**.

---

## 7. Arc and pacing

- **Nights 1–2:** still free for a sensible build: −0, −0, −18, −5.
- **Night 3:** where the damage lands (−42, −77). Wave HP is ~660 / 2200 / 7000 / 11000 / 16300 / 12700 + 4590: **×3.3 then ×3.2**, then ×1.5.
- **Night 4:** where both real runs ended (Relay at 40 after N3, Seed Carriers and Skitters).
- **So the round-1 cliff moved one night later.** It didn't become a curve.
- **The stipend helps, but not where it matters.** It is +10 / 15 / 20 on N2–N4, against a −42 to −77 N3.
- **No act break.** The N3 mini-boss and its relic pick (M6) wasn't built. Area bosses from day 3 are *optional* and risky, so the run has no forced midpoint power spike.
- **Days do escalate now:**
  - day 3 brings the Stalker and the bosses;
  - day 4 the Bloater;
  - day 5 the Chief.
- **The escalation is in damage, not in health support.** Every day starts at ~60 HP from day 2 on.
- **The end state needs a lot of Scrap:**
  - A debug N5 with ~430 S of towers fell.
  - N6 with ~950 S won comfortably.
  - An average run reaches N4 having earned ~200–220 S in total.

---

## 8. Do two runs feel different?

**Days, yes:**

| | Run 1 | Run 2 |
|---|---|---|
| Goals | Escort, uplink, Razorback | Razorback, core, power box, Alpha |
| Weather | Fog | Rain, heat |
| Relics | Capacitor | Bell, Compass, Seed Bank |
| Skill branch | Engineer | Warden |

**Nights, no:**
- Both runs played **Twin Paths** and both fell on N4 at 70% to Seed Carriers and Skitters (`J2_52`, `J2_98`).
- The map pick is broken:

```js
// src/data/defenseMap.js:143
return MAP_KEYS[(h ^ (h >>> 16)) % MAP_KEYS.length];   // signed → negative index → undefined
```

- Over 100,000 seeds: **twin 33.3%, undefined 33.4%, crossing 16.7%, ford 16.6%**. `undefined` falls back to Twin, so **Twin is 67%** (`mapsim.mjs`). Run 2's `run.mapKey` was literally `undefined` (seed 1061110388).
- Twin is also the easiest map (`hpMult` 0.95).

---

## 9. Meta and the four currencies

**Research**
- 84 and 67 RD per losing run.
- The tree is 2,020 RD: about 25 losses, or ~10–12 runs with wins at ~300.
- That's long enough now, but:
  - 15 of the 20 buyable nodes are QoL or "more choice";
  - tier 3 of Blueprints is three **hidden, unbuilt towers**;
  - Overgrowth, Long Night and the scarf all need a **first win**, which my two runs suggest is far off for an average player.
- After a loss the Results screen points to the right buy ("Mortar Pod kills them cleanly", `J2_53`). Good.

| Currency | Round 2 role | Verdict |
|---|---|---|
| Scrap | Towers, upgrades, repair, crafts, Arc casts, the 35 S → component trade | The only real constraint, and too scarce for the median player |
| Circuits | Arc / Beacon, upgrades, Lens, Grip, Spine, Plating, Arc Discharge | **Meaningful now**: real competition between sinks |
| Biofiber | Nest / Snare / Mortar, Coating, Serrated Edge, med kit | **Meaningful**. Seed Bank rewrites it, which is good |
| Intel | Read, Disrupt, Flare (1), Uplink mod (2), Overcharger (1+1C) | **Better, still marginal.** 0–2 a day. I held 1 Intel for 4 nights in R1, and Flare needs 250 RD of research first |

---

## 10. Coherence: overlaps, collisions, contradictions

| # | Problem | Evidence | Fix |
|---|---|---|---|
| C1 | **Five med-kit sources at two prices**: Field Kit, Field Dressing (15 S at the briefing), Workbench (15 S + **1 B**), Field Medic (+1/trip), Medic's Satchel | `unlocks.js`, `crafting.js` | Keep one shop (the briefing, 15 S) and Field Medic. Cut the Workbench med kit |
| C2 | **Three "+15% range"**: Calibration (+10%), Focusing Lens, Tune-up salvage. **Four attack speeds**: Calibration, Overcharger, Pylon Coil, power-cell boon (+ Pulse Beacon) | data | Cut Tune-up. Give the Lens a verb (e.g. the tower sees Flares) |
| C3 | **Four "fewer enemies" sources under a hidden −20% cap**: Download (−10), Uplink (−15), Nest (−15), Disrupt (−10). Disrupt greys out once capped | `Run.waveCutCapped` | Make each a different effect (one wave group removed, a lane delayed) |
| C4 | **Free upgrades from four places**: power box (1), escort (2), salvage (1), Field Tuning (−40%) | data | Fold Field Tuning into salvage, or vice versa |
| C5 | **"Data log" means two things**: the bonus task "Recover a district data log" (Intel, skill point) and lore "Data log 1/20", found 2 tiles apart | `J2_22`, `J2_23` | Rename the bonus to "Intel drive" |
| C6 | **"Beacon" means two things**: jungle pylons and the Pulse Beacon tower. "Watchtower Network: beacons ×1.5" vs "Pylon Coil: per beacon you switched on" | `skills.js`, `relics.js` | Rename the tower ("Pulse Totem") |
| C7 | **"Uplink" means two things** (the goal and the tower mod). **"Engineer" means four** (the escort goal, the survivor bonus task, the lore author, the skill branch) | data | Rename the mod "Tunnel Sight". Drop the survivor bonus task (the escort goal replaces it) |
| C8 | **Stale strings**: the toast "Circuit Recovery: +1 Circuit refunded" (skill renamed; `DefenseScene.js:1796`); Heavy Spine "40 → 50", but the chop is 36 (`crafting.js`, DESIGN §4 says 40) | `J2_11`, `J2_30` | Update the strings and the docs |
| C9 | **A speed danger "comes down the North path"**: Greenhouse's +15% speed is global but gets a lane line and a ⚠ tag | `J2_78`, `DefenseScene.js:1615` | Only print "via" for threats with an `extraGroup` |
| C10 | **Carry the core home → reward lost at home** | `J2_77` | Bank `bankScrap` / `bankRes` when the drone takes the core |
| C11 | **Strongbox = boss chest** (§4); **Pack Lord at a goal** | `J2_85`, `J2_47` | `clearProps.to` → [11, 14]; exclude goal, event and bonus sites within `aggro + tether + 3` of a live lair; or label lost-major strongboxes "☠ guarded" |
| C12 | **Redundant traversal picks**: Bramble Gloves vs Parang vs Cleaver; Tapir Boots vs Brush Dancer | data | Exclude owned-equivalents from `drawRelic` |
| C13 | **Dead V1 config** still in `CONFIG.expedition`: grid/rooms, `rangedCap` "Rival Scavengers", `brambleDoors` "Pulse Cutter", `time: 180`, emergency beacon | `config.js:62–131` | Delete (dev clarity) |
| C14 | **Key overload**: day Q = med kit, E = interact, W = move; night Q / W / E = Protocols | design | Night Protocols on 1 / 2 / 3, or bind them to the same keys as the day's |
| C15 | **Two tips stacked at once** (deflect + spore pod), against DESIGN "never two at once" | R1 D2 HUD text | Queue them |

**Screens per cycle:**

- Summary + skill → Workbench → prep → (weak confirm) → pushes / lulls → banner + salvage → briefing (+ Details).
- In the jungle: shrine modals, lore cards, place banners, boss banners and tips.

That's **6–7 stops between two jungle days**: heavier than StS's map → fight → reward → map, for less agency per stop.

---

## 11. Updated roadmap

### A. Still missing for "complete" (priority order)

1. **A median-player economy (M).**
   - Every PRIMARY pays **+20 S** on completion on top of its boon (`objectives.js`, `bankScrap`).
   - The end point of uplink, escort, haul and track gets a guaranteed cache: 13–19 S + 1 component.
   - The **skill point needs the goal**; bonus tasks pay Research or Intel instead (`OPTIONAL.*.skillPoint = false`).
   - `dawnHpFloor` 60 → 75, `nightlyHeal` 25 → 40.
   - **Target:** a median bot banks ≥ 60 S on goal days; the sim's newcomer reaches N5 in ≥ 30% of runs.
2. **A smoothed N3–N4 (S).**
   - `HEALTH_MULT` [1.25, 3.5, 4.7, 7.4, 7.3, 9.2] → **[1.4, 3.2, 4.2, 6.4, 7.3, 9.2]**, and stipend → **[0, 10, 25, 35, 30, 30]**.
   - Re-run `nightmech/campaign.mjs`. **Target:** typical N3 −10 to −20, N4 −20 to −30.
3. **An act break at N3 (M).** The Brood Mother mini-boss (600 HP, spawns Skitters at 50%) closes N3. Killing it offers a **relic pick of 3** and +1 skill point. Two non-winning runs lost their spine at exactly this point.
4. **Bosses separated from strongboxes and goals (S)** (C11). Show "☠ guarded" on the strongbox's map marker.
5. **The three hidden towers (L), or remove the nodes.** Sap Cannon, Lure Totem and Bramble Wall would give the night new *verbs* and fill tier 3 of the tree.
6. **A second board shape (M).** A 3-lane map, or a map where the Relay is not on the right, so the "lanes face the jungle" promise is spatial and not just a label. Fix `pickMapKey` first (S).
7. **Build-defining relics (M).** Six "build around me" rares, for example:
   - Beacon Lattice: towers on forward pads +40% damage;
   - Thorn Covenant: every Thorn/Snare level counts double for Grove Warden;
   - Blood Price: the Relay zap heals the player at night.
   Plus offers that know your build (C12).
8. **Late-run and Long Night days (M).** After day 6 the jungle has no shrines, boxes or bosses left. Respawn 2 shrines and a "Feral warlord" lair per 3 nights.
9. **Crew (round-1 N1, not built).** Escorted engineers join the Relay (Medic / Mechanic / Gunner). It's the natural payoff for the escort goal.

### B. Cut or merge (simplicity to the public's eye)

- **Workbench → a tab in night prep.** It's one fewer screen. Machete upgrades move into the Machete skill branch as level-2 effects.
- **Med kits:** the briefing shop plus Field Medic only (C1).
- **Salvage pick:** always 2 options, 3 on a clean night. No dead options (no patch at full HP); patch and parts weighted up after a bad night.
- **Tune-up:** cut (C2).
- **Wave cuts:** one source per night at most (C3).
- **Survivor bonus task:** cut; the escort goal covers it (C7).
- **Renames:** "Intel drive", "Pulse Totem", "Tunnel Sight" (C5–C7).
- **Optional Lantern Moth cut:** a dusk-only relic for a game whose best play is home before sunset.
- **Don't add** a fifth run currency or another prompt layer until 1–3 land.

---

## 12. Round-1 item → verdict

| Round-1 item | Verdict | Note |
|---|---|---|
| 1. Pacing pass (HEALTH_MULT, N3 trim, stipend, N1–2 bite) | **Partly** | Stipend in. N1–2 still −0 / −5 / −18. The cliff moved to N3 → N4: 2/2 runs fell N4 |
| 2. Relay Protocols (night agency) | **Fixed** | 3 Protocols, lulls, call-early. Arc and Flare cost 250 RD, so early runs get only Vine Snare |
| 3. Relics (reason to explore) | **Fixed** | 24 relics, carried then banked. New issues: boss-guarded strongboxes, build-blind offers |
| 4. Night maps from the jungle + wave variants | **Partly** | 3 maps, 18 variants, danger lane, forward pads. **`pickMapKey` bug → Twin 67%**; one board frame |
| 5. Death rules | **Fixed** | Salvage ≤ carried, dawn 60, reward needs home, home confirm. New contradiction: the haul goal (C10) |
| 6. Events + 5 goal types | **Fixed** (built) / **regressed** (value) | New goals pay little Scrap; looting beats them |
| 7. Area bosses + day creatures | **Fixed** | Excellent rewards. Entangled with strongboxes and goals (C11) |
| 8. Skill rework | **Fixed** | Keystones work. 1 point a trip starves losing runs (2–3 skills by N4) |
| 9. Meta (tree, new towers, OG, endless) | **Partly** | Tree, OG 1–10, Long Night, Daily: yes. New towers hidden; modes gated on a first win |
| 10. Camp crafting | **Fixed** (built) | Overlapping sinks; one extra screen; crafted once in 7 visits |
| 11. Honest area cards | **Fixed** | Finds apply to the whole day; V1 text gone. New: the speed danger's "lane" line (C9) |
| 12. Lore + named landmarks / crew | **Partly** | Lore and names landed well; crew not built |
| Dead V1 content | **Partly** | Events live. V1 config still in `config.js` |
| Briefing "Finds" honesty | **Fixed** | — |
| Beacon-home-with-nothing confirm | **Fixed** | — |
| Intel sink | **Partly** | Sinks exist; income is too low to matter |
| N3 mini-boss act break (M6) | **Not** | — |
| Weather (N2) / Daily (N5) | **Fixed** | — |

---

## 13. Scores (round 1 → round 2)

| Axis | R1 | R2 | Why |
|---|---|---|---|
| **Core loop** | 6 | **6.5** | Day → night is finally linked (lanes, beacons, relics, bosses) and the night has verbs. But the Scrap pipe starves average players, deaths are common on days 2–4 at 60 HP, and nights are the short half |
| **Decisions** | 4 | **6** | Area, boss, stay/leave, shrine, keystone and branch choices are real. Weakened by dominated options (loot > goal), inverted salvage and boss/strongbox entanglement |
| **Progression / meta** | 3 | **6** | 2,020 RD tree, Overgrowth 1–10, Long Night, Daily, Codex. Mostly "more choice" nodes; the 3 towers are missing; modes need a first win that looks far off |
| **Variety / replayability** | 3 | **5.5** | Days differ run to run (goals, relics, weather, bosses). Nights don't (Twin 67% by bug, same frame, same N4 death). Goals repeat in 58% of runs |
| **Content volume** | 3 | **5.5** | ~50% of a $10–15 roguelite. One biome, one board shape, a thin tower roster |
| **Pacing** | 4 | **5** | Steady day escalation and a killable N6 boss. The cliff moved to N3 → N4; N1–2 still free; no act break; menu time ≈ night time |
| **Coherence** (new) | — | **4** | 15 overlap, naming or contradiction issues (§10); integration bugs where parallel systems meet (lairs × strongboxes × goals, map pick, haul reward, danger text) |

---

## 14. Top 12 (ranked by impact)

1. **Median-player economy** (§11 A1): goal +20 S, endpoint caches, skill point only from the goal, dawn floor 75 / heal 40. *Both real runs starved and fell on N4.*
2. **Fix `pickMapKey`** (`defenseMap.js:143`, add `>>> 0`). *One character turns 3 maps from 67/17/17 into 33/33/33.*
3. **Smooth N3–N4** (`HEALTH_MULT` [1.4, 3.2, 4.2, 6.4, 7.3, 9.2], stipend [0, 10, 25, 35, 30, 30]). Validate with `campaign.mjs`.
4. **Separate bosses from strongboxes and goals** (`BOSS.clearProps.to` [11, 14]; goal exclusion radius `aggro + tether + 3` in `JungleScene._sitesIn`, line 351).
5. **Bank the haul reward on delivery**; consume the glasshouse heal only when it heals (`JungleGoals` carry, `JungleRelics.js:212`).
6. **Salvage pick:** min 2 options, no dead options, weighted toward repair after a bad night (`Run.salvageOptions`, `SALVAGE.tiers`).
7. **N3 act break:** a Brood Mother mini-boss → relic pick of 3 + 1 skill point.
8. **Coherence renames and stale strings** (C5–C9): data log, beacon, uplink, engineer, Circuit Recovery, Heavy Spine 36 → 45, the speed-danger lane line.
9. **Merge overlaps** (C1–C4): one med-kit shop, cut Tune-up, one wave-cut per night, Workbench into prep.
10. **Build-aware relic offers + 6 build-defining rares** (`drawRelic` exclusions; `relics.js`).
11. **Build the three hidden towers** (or hide the empty tier 3); then a second board shape.
12. **Late-run content:** respawning shrines and lairs for Long Night days; crew from escorts; lore at 2 per run, not 1.5.

---

## Verdict

Round 2 delivered nearly the whole round-1 roadmap, and Verdant Relay now *has* the parts of a complete roguelite:
- relics worth carrying home;
- bosses whose death reshapes the run;
- a night you play;
- a meta with legs;
- a jungle with places and a past.

The best new decision is "kill the Data Center's Warden and that danger never comes again". It's exactly the kind of long-term choice the game lacked.

What it isn't yet is *one* game:
- **Systems collide:** strongboxes sit in boss lairs, a roaming boss guards a goal, the core is "home" but not home, a speed buff walks down a lane.
- **They duplicate each other:** five med-kit sources, three range buffs, four wave cuts under one cap.
- **The economy was tuned for a sim player who earns 85 Scrap a day.** The average player banks ~20 and dies every other day, so both of my runs ended on night 4 at 70% of the wave.

Fix the economy, the map-pick bug and the N3 → N4 step. Untangle the bosses and do one coherence pass. That makes this a solid **7** in design. Without that, the content is there but most players will never see nights 5–6, Overgrowth or the Long Night.
