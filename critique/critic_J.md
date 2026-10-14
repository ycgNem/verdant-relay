# Verdant Relay: Critic J (game design, content depth, progression, replayability)

**Session:** 2026-10-13. I played the frozen build at `http://localhost:5191` in my own headless Chrome at 1280×720, from a clean profile. Screenshots and scripts are in `.playwright-mcp/roundJ/` (`J01`–`J55`, `driver.mjs`, `botJ.js`, `sim.mjs`).

**How it was played**

- **Two real runs from the title.** Run 1 was the guided first run. Run 2 had the Mortar Pod unlocked.
- **Treks:** driven by critic G's in-page pathing bot. My copy is `botJ.js`; it now avoids deep water, which the old bot walked into and got stuck on (`J07_trek_5`).
- **Fights:** the bot's own melee. It's an aggressive, average player who dodges badly.
- **Night prep:** built through `DefenseScene._build`. Waves ran at 2×.
- **Later nights:** reached by debug URLs, because both real runs died on night 3:
  - `defense&night=4` and `night=6` (boss + victory);
  - `explore&night=5`, with `god` used only to watch dusk.
- **Code read:** all of `src/data/*.js`, plus the Run, Jungle, Defense, Summary and Save code paths that consume them.
- **Console:** 0 errors.

## Run log

| Run / day | Area, goal | Outcome of the day | Night |
|---|---|---|---|
| R1 D1 (guided) | Market, *Salvage a power cell* | Goal, 6 containers, a beacon switched on. **+54 S +2 C +1 B** (`J15`) | 3 towers. Relay **100 → 100** |
| R1 D2 | Data Center, *Kill the Razorback* | Elite killed, nest destroyed, then 3 crates. Home at **10 HP**. **+20 S +25 bonus** | 4 towers. **100 → 100** |
| R1 D3 | Flooded, *Download route data* | Goal done at t=57 s. Died at t=113 s looting: **+12 S salvaged** (`J34`, `J35`) | 4 towers (2 at L2), readiness said "Too weak". **Relay fell** at 96% of the wave (`J37`) |
| R2 D1 | Greenhouse, *Download route data* | Goal + data log. Spore clouds took me to 17 HP. **+54 S +3 B +2 I** | 3 towers. **125 → 125** |
| R2 D2 | Data Center, *two pumps* | Held E twice at a fresh beacon, which sent me home at t≈25 s with **nothing** (`J45b`) | 3 towers at L1. **125 → 65** |
| R2 D3 | Residential, *two pumps 52 m apart* | Nest destroyed. Died at t=42 s carrying 9 S, and the drone "saved" **12 S** (`J48`, `J49`) | **Relay fell** at 60% (`J50`) |
| Debug N4 | 5 towers (2 at L2), 75 S unspent | — | **Fell** (`J55`) |
| Debug N6 | 7 towers (5 at L2), Mortars, 219 S unspent | — | Won on **7/125**. The enraged Colossus nearly walked in (`J51`, `J52`) |

Both real runs ended on **night 3**, after nights 1–2 that cost the Relay **0 HP**.

---

## 0. Earlier complaints in my area: are they fixed?

| Source | Complaint | Now |
|---|---|---|
| G #2 | One day death decides the run | **Partly.** The salvage floor (20/20/12) and the N2 retune landed, and N2 is now trivial (100 → 100 with 4 towers). The cliff simply moved to N3: two of two runs died there. |
| Newcomer #24 / #13 | N3 is "a cliff, not a curve"; add a pre-wave warning | **The warning is fixed, the cliff is not.** The readiness line correctly said "Too weak" (`J36_n3_prep`), but at 0 Scrap it gives you nothing to act on. Wave HP goes 410 → 1180 → **4080** (×3.5 in one night). |
| F #9 / G | Dead content | **Still there.** `EVENTS` (Workshop, Power Surge, Infested Cache) are defined but never placed in the V2 jungle; only `SummaryScene` imports them. The ranged `scav` and the V1 district fields (`rooms`, `ambushChance`, `alarms`, `extraContainers`, `TOOL`) are unused. |

---

## 1. Content inventory against a $10–15 indie

| System | Verdant Relay now | Genre reference (shipping) |
|---|---|---|
| Night maps | **1** fixed 30×17 map, 2 lanes, 16 pads, identical every night of every run (`defenseMap.js`) | Thronefall ~10 maps; Kingdom procedural |
| Waves | **6 authored waves**, identical every run. Only the district threat adds a group | Thronefall per-map waves plus mutators |
| Bosses | **1** (Colossus, N6) | Hades 4; Dome Keeper 1 per world + elites |
| Towers | 6 (2 locked) × 3 levels, no branches | Thronefall ~15 buildings with branch upgrades |
| Night enemies | 8 + boss | — |
| Day creatures | 5 used (`scav` is unused), 1 elite variant, 1 hazard (spore pods) | Don't Starve dozens, plus seasons |
| Objectives | 5 primary, 4 bonus tasks; 3 events (all dead) | — |
| Run skills | 18, all passive percentages or flat numbers; 0 change your verbs | StS ~75 cards/char + 170 relics; Hades ~100 boons |
| Weapons | 2 (Machete, Parang) | Thronefall 3 + perks; VS (at $3) 30+ |
| Meta unlocks | **7** items, 535 Research, 1 cosmetic | Dome Keeper upgrade trees + 3 game modes |
| Modes after a win | **None.** No endless, no ascension/heat, no daily | Universal in the genre |
| Secrets / lore / unique finds | **None.** Landmarks are a ruin sprite + 0–1 crate | Don't Starve set pieces, StS events |

**Estimate: about 15–20% of the content a $10–15 roguelite ships with.** The engine, art and loop are commercial-grade. The content on top of them is a vertical slice.

---

## 2. Core loop: does the day feed the night?

**It does, but only through a resource pipe.** Scrap from the day is the whole night budget. Circuits and Biofiber gate tower types. The goal reward is one ±10–15% modifier. The district adds one danger group. All of that is clear and works.

What's missing is everything else:

1. **The night ignores the jungle.**
   - `DefenseScene` reads nothing of `run.world`: no beacons, no cut trails, no cleared nests, not even which direction you went.
   - The Relay sits in the middle of a 192×192 jungle that you shaped for an hour, yet the night happens on an unrelated fixed board.
   - Your beacons only shorten walks.
2. **You are a spectator at night.**
   - During a wave the only controls are speed, targeting and one Emergency Patch button.
   - The character you just spent five tense minutes playing with a machete sits the night out. Dome Keeper and Thronefall both put the hero *in* the defense, and that's exactly what makes their nights tense.
   - Here N1–N2 are 45–60 s of watching at 2× (`J17_n1_wave`), and N3 is watching yourself lose (`J36_n3_wave2`).
3. **Rewards are invisible.**
   - "Towers fire 10% faster" or "North path 15% slower" is never shown during the wave (no tint, no icon on the affected lane).
   - The player can't feel the day paying off.

---

## 3. Decisions: are the choices meaningful?

### Which area: shallow

- **Loot multipliers follow geography, not your choice.** `rollLoot` uses the container's *region* (`DISTRICTS[DISTRICT_KEYS[c.region]]`, `JungleScene._buildContainers`). Choosing Market doesn't give you "More Scrap"; walking into Market's sector does, whatever you picked. The briefing presents "FINDS" as part of the choice (`J19_details`), which it isn't.
- **The choice reduces to reward vs. danger, and both sides are close in size.**
  - Rewards: free upgrade (~30 S), −10% wave, +10% fire rate, lane slow, +25 S.
  - Dangers: +6 Crawlers, +4 Burrowers, +15% speed, +8 Skitters, +1 Razorback.
  - None of them has a consequence past tonight.
- **Repetition.** In a 2,000-seed simulation of `Run.districtChoices` (`sim.mjs`), **74% of runs offer one area on 4 or more of the 6 nights.** In my run 1, Market was offered on N1, N2 and N3. Run 2 offered Greenhouse "Download the route data" on N1 and again on N2 (`J44`).
- **V1 promises in the area text that don't exist in V2:**
  - Data Center: "Security lasers", "alarms", "Rival Scavengers".
  - Market: "ambushes in the aisles".
  - Flooded: "long sightlines, ranged threats". The ranged scav is remapped to the melee Feral.

### Stay or leave: driven by health, and death is too cheap

- Every good day I finished the goal by t=57–200 s of the 300 s, so time rarely forced me out. **Health** did: 10, 17 and 20 HP exits. That's fine as a design, but two rules undercut it.
- **"Your goal still counts" on death** (`J34`, `J35`): the skill point(s) and the night reward survive a death. Only carried loot is at stake.
- **Dying beats extracting at low health:**
  - Death sets HP to 35, and the night adds +25, so the next day starts at 60.
  - Extracting at 10 HP starts the next day at 35.
  - The salvage floor (20/20/12 S on N1–3) can be **more than you carried**: R2D3 carried 9 S and the drone "saved" 12 (`J48`).
  - So on N1–3, with little loot and low health, walking into a pack is strictly better than walking home. That's a degenerate incentive.

### Night build: solved after one run

- Both lanes converge on the Relay, so pads 7/8/13/14/15 cover both. DESIGN §5's own sims say a build "spread mid-map … usually falls".
- With one map and fixed waves, the optimal layout is the same every run. There's no spatial puzzle left after run 1.

### Skills: the picks are filler

- All 18 are passive percentages or flat numbers (`skills.js`; the effects are 15 `hasSkill` checks in `Run.towerStats`, `Player`, `JungleScene`).
- Offers I actually saw:
  - Safe Hands / Living Barricade / Emergency Patch (`J15`);
  - Living Barricade / Quick Extraction / Circuit Recovery;
  - Field Tuning / Prepared Defenses / Pack Rat I (`J27`).
- No pick changed how I play, and none touches the machete.
- With up to 2 points a trip, a 6-day run ends with **~10 of 18 skills**: more than half the pool. So there's no build identity, and runs converge.

### Intel: two buttons

Read (1 → +4 Research) or Disrupt (3 → −10% wave). After that, there's nothing to buy with it.

---

## 4. The 6-night arc and pacing

| Night | Wave HP | Change from the night before | My result |
|---|---|---|---|
| N1 | 410 | — | 100/100 (R1), 125/125 (R2) |
| N2 | 1180 | ×2.9 | 100/100 with 4 towers (R1); −60 after a zero-loot day (R2) |
| N3 | **4080** | **×3.5** | **Fell twice** |
| N4 | 5540 | ×1.36 | Fell with 5 towers (debug) |
| N5 | 6570 | ×1.19 | — |
| N6 | 6550 + Colossus | boss | Won on 7/125 with 7 towers (debug) |

- **The shape is flat, flat, cliff, then plateau.**
  - N1–2 carry no tension when played well.
  - N3 is where runs end.
  - N4–6 grow only ~20–35% a night, so a run that survives N3 coasts into the boss.
  - Escalation should be steady (about ×1.5–1.8 a night) and broken by *new* problems, not by raw HP.
- **Days escalate in numbers only.**
  - Day 5 has the same 5 creatures as day 1 (`byNight` HP ×1.2, damage ×1.05, more spawns).
  - There's no new day threat after day 1 and no day boss. Dusk hunters are the same creatures (`J54_dusk`).
- **There's no act structure:** one boss, at the end. Nothing marks "you made it to the midpoint", and nothing hands you a power spike there.
- **Length is fine.**
  - A won run is ~6 × (≤5 min day + ~1.5 min prep + 1–2 min wave) ≈ 45–55 min.
  - That's in line with StS and Hades.
  - The problem is how much *different* stuff happens in those 50 minutes.

---

## 5. Progression and meta

- **Research:** run 1 (lost on N3) earned 80 (`J38`). A win earns ~300 (DESIGN). The whole tree costs 535, so everything is bought in **2 wins or ~6 losses (~4–6 hours)**. After that the meta is over.
- **The 7 unlocks:**
  - 2 are real options (Mortar, Beacon).
  - 1 is a weapon side-grade.
  - 3 are small starting bonuses (+20 S, a med kit, a 4th skill option).
  - 1 is a cosmetic.
  - There's nothing to chase after your first win (`J52`: New Run / Collection / Title, with no new mode and no harder tier).
- **"Unlocks add options, never raw power"** is a good rule. But there are only 3 options to add.

## 6. Run-to-run variety

- The world generator varies layout, but the **structure** is identical every run:
  - 35 sites, 83–84 containers, 5 beacons, 48 spore pods (`info.js`, three worlds).
  - 1 map, 6 fixed waves, 1 boss, 5 objectives and 4 bonus tasks.
- With 6 days, at least one objective must repeat.
- **My two runs felt the same:** same night map, same waves, same N3 wall.
- **Lowest-cost fixes:** wave variant pools, map variants, and run modifiers (see the roadmap).

## 7. The open world: reasons to explore

- The jungle is beautiful and *physically* interesting: lost sites, brambles, fords.
- But the only reward for curiosity is a crate. You can open about 10 of the ~84 containers per day.
  - Hidden caches (34) are the same crates, just off-trail.
  - Landmarks are a statue, mast or greenhouse sprite with 0–1 container.
- **The revealed map shows no named places or points of interest** (`J53_bigmap_out`). There's nothing that makes you say "what's over there?".
- **No lore, no unique items, no NPCs you meet.** The survivor is a 2 s hold-E prop.
- A persistent, seeded open world is this game's unique selling point. Right now it's a big, pretty container field.

## 8. Economy: do the four currencies matter?

| Currency | Role | Verdict |
|---|---|---|
| Scrap | Everything: towers, upgrades, repairs | Matters. It's the only real lever. |
| Circuits | Arc / Beacon builds and L3 Turret; random drip (35% chest chance) | A gate, not a decision. I had 2 all run (R1) and could never build a second Arc. |
| Biofiber | Thorn / Snare / Mortar | Same. It ran out after 2 builds in both runs. |
| Intel | Read or Disrupt | Almost irrelevant. |
| Research (meta) | 7 unlocks | Runs out quickly (see §5). |

Three of the four run currencies have no *sink you choose*. Crafting, tower mods and night abilities would give them one (roadmap M1, M3, M9).

---

## 9. EXPANSION ROADMAP

Sizes: **S** ≈ 1–2 days, **M** ≈ 3–7 days, **L** ≈ 2+ weeks or new art. All numbers are starters for `src/data/`.

### A. Must-have for a complete game (in priority order)

#### M1. Night agency: "Relay Protocols" (M)

- **What:** 3 active abilities on the wave HUD, aimed by clicking a lane. Each costs **1 Intel or has a cooldown**. Start with 1; unlock the others via skills and research.
- **Why:** you're a spectator at night (§2.2). It also gives Intel a real sink (§8).
- **Abilities:**

| Ability | Effect | Cooldown | Notes |
|---|---|---|---|
| **Overcharge Pulse** | 1.6-tile radius, 40 + 20×night damage, 1 s stun | 25 s | Bosses take 50% |
| **Vine Wall** | Blocks one lane tile for 4 s | 40 s | Non-boss enemies; the boss is slowed 50% |
| **Flare** | 3-tile radius for 6 s: burrowers become targetable, towers +25% damage | 30 s | — |

- **Hooks:**
  - new `src/data/protocols.js`;
  - `DefenseScene._handleInput` (lane click in phase `wave`) → `damage(e, amt, 'energy')` / the existing `slowMult` paths;
  - buttons in `_renderFoot`;
  - skill `req` hooks in `skills.js`.
- **Readiness:** add the abilities to `_readiness()` as DPS-equivalent (Pulse ≈ 8 DPS).
- **The full version (L):** the scavenger walks the night map with the machete (Dome Keeper style). Ship the Protocols first.

#### M2. Night maps tied to the jungle, plus wave variants (M–L)

- **What:**
  - Three maps:
    - *Twin Paths* (the current one);
    - *Three Fords*: 3 lanes, 18 pads;
    - *Crossroads*: lanes merge at mid-map, so mid-map pads matter.
  - Picked by `run.rng('map')`.
  - Each lane is labelled by compass direction. **The chosen area's danger group enters from the lane facing that area** (`compass()` in JungleGen).
  - **Each online beacon adds a "forward pad" on the lane from its direction.** It's free to use that night and comes with a pre-built L1 Scrap Turret if the beacon is in tonight's area.
- **Why:**
  - placement is solved (§3);
  - day and night are spatially disconnected (§2.1);
  - beacons are worthless at night.
- **Hooks:**
  - `DEFENSE_MAP` → `DEFENSE_MAPS{}`, with `run.mapKey` validated in `Save.validRun` (pad count per map);
  - `DefenseScene._buildPads` / `_laneTiles`;
  - `WAVES[n]` groups use `lane % lanes.length`.
- **Wave variants (S):** give each night 3 authored variants (`WAVES[n] = [A, B, C]`, picked by `run.rng('wave')`), e.g. N4 A = Burrower-heavy, B = Seed-Carrier-heavy, C = double Razorback.

#### M3. Relics found in the jungle: the reason to explore (M)

- **What:**
  - 24 relics in `src/data/relics.js` (common / rare / cursed). A typical run holds 5–7.
  - Sources:
    - every lost major site guarantees 1 (behind its bramble ring);
    - each landmark is a **shrine** (pick 1 of 2);
    - hidden caches have a 12% chance;
    - area bosses (M5) drop a rare.
  - Relics are *carried loot*: lose them on death, bank them by extracting. That puts real weight back on the stay-or-leave choice.
- **Why:** curiosity is unrewarded (§7), skills don't make builds (§3), and the world has no persistent loot that changes play.

| Relic | Effect | Relic | Effect |
|---|---|---|---|
| Whetstone Charm | Machete +20% damage | Pylon Coil | Towers +4% attack speed per online beacon (max 5) |
| Tapir-hide Boots | Ferns ×0.75 instead of ×0.5 | Cracked Lens | Each tower's first shot each wave ×3 |
| Lantern Moth | Dusk light +3 tiles; hunters every +4 s | Root Heart | Relay +1 HP / 4 s during waves |
| Scavenger's Compass | Hidden caches within 20 tiles on the minimap | Old Battery | +1 Circuit every night |
| Bramble Gloves | Slashes clear brambles | Seed Bank | Thorn Nests and Snares cost 0 Biofiber |
| Spore Sac | Popped pods hurt enemies (8 / tick) | Rusted Bell | Towers +25% vs Razorbacks and Ruin Guards |
| *Hungry Idol* (cursed) | +40% container Scrap; +4 Crawlers every night | *Blood Moss* (cursed) | Heal 2 HP per day kill; Relay max −15 |

- **Hooks:**
  - `Run.relics[]` (+ `Save.validRun`);
  - multipliers in `Run.towerStats`, `rollLoot`, `Player`, `JungleWorld.speedAt`;
  - "Found" row in `SummaryScene`;
  - Codex "Relics 9/24" in `CollectionScene` (meta discovery list = a collection goal).

#### M4. Wire up events and add five objective types (M; each type S–M)

- **What:**
  - Place 1 `EVENTS` set piece per day from N2 at a camp or minor site. Add `_setupEvents()`, a clone of `_setupOptionals`.
  - Add five new `PRIMARY` objectives:

| Objective | How it plays | Reward |
|---|---|---|
| **Escort** | The engineer has 60 HP and follows at 4.2 t/s; 50% of attackers target them | A free L2 tower tonight |
| **Hold the uplink** | 45 s at an unlit beacon; 3 waves of 3/4/5 creatures | Area lane −15% enemies; the beacon comes online |
| **Track the Alpha** | 3 clue signs (claw marks, prints), each 20–30 m from the last, then an elite | A rare relic |
| **Haul the core** | Carry a generator core home: ×0.75 speed, no roll; drop it (E) to fight | +30 S +2 C, or a permanent extra pad |
| **Purge the bloom** | Pop 3 spore nests within 60 s | Enemies −10% speed tonight |

- **Why:** 5 objectives repeat within one run; the events are dead content (§0).
- **Hooks:** new step types (`escort`, `carry`, `defend`, `track`) in `JungleScene._setupObjective` / `_stepDone`; props go through the existing `_addInteractable`.

#### M5. Days that escalate: night-gated creatures and area bosses (L, because of art)

- **What, part 1: new day creatures.**

| From day | Creature | Stats and behaviour |
|---|---|---|
| 3 | **Stalker** | 70 HP, 18 damage. Invisible in brush until 6 tiles away; follows you between sites |
| 4 | **Bloater** | 50 HP. Walks to you and bursts into a 2.5-tile spore cloud; a chop at range pops it safely |
| 5 | **Feral Chief** | Buffs camp ferals +20% speed |

- **What, part 2: one area boss per district.** Each appears from day 3 as a ☠ marker at its lost major site.
- **Boss rules:**
  - HP 450 × `eliteHp`, 2 phases.
  - Killing one drops a rare relic and +30 RD, and **removes that area's night danger for the rest of the run.** That finally makes "which area" a long-term choice.
- **The five bosses:**
  - **Thorn Mother** (Greenhouse): spore barrages.
  - **Drowned Engine** (Flooded): a rail-car golem that charges along the river.
  - **Pack Lord** (Residential): feral chief + 4 ferals.
  - **Security Warden** (Data Center): sweeping lasers, which makes the "lasers" text true.
  - **Market Brood** (Market): splits into Crawlers.
- **Why:** day escalation is numeric only (§4); area choice has no lasting consequence (§3).
- **Hooks:** `EXPLORE_ENEMIES` + `CONFIG.expedition.elite`; a `minNight` per creature in `POP`/`_chunkPop`; `run.world.bosses[]`; `Run.chooseDistrict` skips the threat for a cleared area.

#### M6. Pacing pass and a midpoint act (S–M)

- **Wave HP:**

| | N1 | N2 | N3 | N4 | N5 | N6 |
|---|---|---|---|---|---|---|
| Wave HP target | ~600 | ~1100 | ~2000 | ~3200 | ~4800 | ~5200 + boss |
| `HEALTH_MULT` | 1.15 | 1.45 | 1.8 | 2.0 | 2.3 | 2.5 |

  - N3: Crawler groups 9+9 → 7+7, Razorbacks 4 → 3.
- **N1–2 should cost a careless build 10–30 Relay HP**, so the early game teaches. Add 2 Skitters to N1 group 5 and 1 Razorback to N2.
- **Relay stipend:** +10/15/20/25/30 Scrap at prep on N2–6 (`CONFIG.relay.stipend`). Income then follows the curve, and one bad day costs ~25%, not the run.
- **N3 mini-boss "Brood Mother"** (600 HP; spawns 4 Skitters at 50%). Beating it offers a **relic choice of 3**. That gives the run an act break and a power spike exactly where runs now die.

#### M7. Skill rework: verbs, not percentages (M)

- **What:** grow 18 → 32. Merge the fillers (Pack Rat I+II; Living Barricade into the Snare L2).
- **Add a Machete branch:**
  - **Riposte:** a roll through an attack makes the next slash ×2.
  - **Second Wind:** day kills heal 3 HP.
  - **Brush Dancer:** no fern slowdown while rolling.
  - **Cleaver:** the chop clears a 3-tile cone.
- **Add one keystone per branch.** Keystones are offered only once you have 2 skills in that branch:
  - **Chain Reaction** (Engineer): Arcs +2 chains, −20% damage.
  - **Grove Warden** (Warden): Snares deal 6 DPS and roots last 1.2 s.
  - **Salvage King** (Scavenger): tower kills pay 2× bounty, containers −15% Scrap.
- **Cap and weighting:**
  - Cap skill points at 1 per trip + 1 per area boss.
  - Weight `skillOptions` toward branches you already own (60%).
  - This gives builds an identity.
- **Hooks:** `skills.js`, `Run.skillOptions`, `Run.towerStats`, `Player`.

#### M8. Meta that lasts: a research tree, Overgrowth levels, endless (M)

- **Research tree:** ~24 nodes in 3 branches (Blueprints / Field Gear / Relay), costing 40–200 each, ~2,400 RD in total (≈ 10–12 runs). Include:
  - 3 new towers:
    - **Lure Totem:** decoy; enemies stop 3 s.
    - **Sap Cannon:** burn DoT; strong vs Seed Carriers.
    - **Bramble Wall:** a pad that makes enemies detour 4 tiles.
  - a 2nd and 3rd Protocol;
  - starting kits.
- **Overgrowth 1–10** (unlocked by the first win): each level stacks one modifier, and the Research gain is +10% per level. The ten levels:
  1. wave HP +10%;
  2. elites in every camp;
  3. 240 s daylight;
  4. Relay 80 HP;
  5. skill offers show 2;
  6. a second danger every night;
  7. Colossus third phase at 25%;
  8. no salvage;
  9. hunters from t=200 s;
  10. N3 and N6 bosses both enraged.
- **"Long Night" endless:** N7+ with HP ×1.2 per night and a boss every 3rd night. Track the best night.
- **Hooks:** `unlocks.js` → `RESEARCH_TREE`; a new `CollectionScene` tab; `meta.overgrowth`; `CONFIG.nights`; `HEALTH_MULT` extension.

#### M9. Camp layer at the Relay: crafting between Summary and Prep (M)

- **What:** a Workbench panel with recipes.

| Recipe | Cost | Effect |
|---|---|---|
| Med kit | 15 S + 1 B | Heals 25 |
| Sap Bomb (day throwable, key 2) | 10 S + 1 B | 30 damage, radius 1.5 |
| Focusing Lens (tower socket, 1 per tower) | 2 C | +15% range |
| Thorn Coating (tower socket) | 2 B | +25% damage vs slowed |
| Uplink (tower socket) | 2 I | Tower hits burrowed enemies |
| Serrated Edge (machete) | 20 S + 3 B | Bleed 3 DPS for 3 s |

- **Why:** Circuits, Biofiber and Intel have no chosen sink (§8), and the machete never improves within a run.
- **Hooks:** `src/data/crafting.js`; `Run.sockets` / `Run.consumables`; a panel in `SummaryScene` before "Prepare"; `Run.towerStats` reads the sockets.

### B. Nice to have

- **N1. Survivors become crew (M).**
  - A rescued engineer (and Escort targets) joins the Relay: up to 3 crew.
  - **Medic:** +15 HP to you each night.
  - **Mechanic:** −10% upgrade cost.
  - **Scout:** the objective's lost-site ring is pre-cut.
  - **Gunner:** mans a free L1 turret on pad 8.
  - Crew can die if the Relay drops below 30%.
- **N2. Weather and day modifiers (S–M).** From N2, a 35% chance per day of:
  - **Rain:** enemy detect −30%, ferns no longer rustle.
  - **Fog:** light radius −35%, containers +20%.
  - **Heat:** stamina regen −25%, spore pods ×1.5.
  - **Storm night:** lightning hits random lane tiles for 40.
  - Show it on the briefing card. Hooks: `DAY`/`ATMOS` multipliers + `tonight` fields.
- **N3. More blades and tools (M).**
  - **Spear:** 2.2 range, a single 22-damage thrust.
  - **Hatchet:** throwable on RMB.
  - **Grapnel:** crosses deep water at marked trees.
  - **Lantern:** +4 light at dusk.
  - Each starts as a relic or unlock.
- **N4. Lore and named places (S–M).**
  - 20 data logs telling how the Relay fell, each with a Codex entry.
  - Name every landmark on the big map ("The Drowned Platform"). Give each a one-time unique interaction: a radio mast maps 40 tiles, a statue shrine trades 30 S for a relic.
- **N5. Daily seed (S):** a fixed seed plus 2 Overgrowth modifiers and a local best.
- **N6. Act 2 biome (L+):** nights 7–12 in a second region after the Colossus.

### C. Clean-up in the current content (S, do first)

- **Death rules:**
  - Salvage = min(floor, carried) + share.
  - A death returns you at `max(35, hp)` HP before the night heal is removed, or simply make the night heal not apply after a death.
  - The night *reward* (boon) needs extraction; the skill point stays.
- **Beacon home without a goal or loot:** add the same `_homeOffered()` gate, or a confirm ("Head home with nothing?"). Today a second E-hold right after switching a beacon on ends the day at t≈25 s (`J45b`).
- **Delete or wire the dead content:** `EVENTS`, `scav` ranged, the district `rooms` / `ambushChance` / `alarms` / `extraContainers`, `TOOL`. Rewrite the area text to describe only what exists.
- **Briefing "FINDS":** either apply the chosen area's multiplier to *all* containers that day, or say "Finds there" and show the sector on the map.
- **Show active rewards on the night map:** a lane tint for `laneSlow`, a tower glint for `towerRate`.

---

## 10. Scores (1–10, where 7 is good commercial indie)

| Axis | Score | Why |
|---|---|---|
| **Core loop** | **6** | Clear, working day → Scrap → night pipe with real stakes on carried loot. But the night ignores the jungle and you only watch it. |
| **Decisions** | **4** | Route and lost-site choices are good. The area choice is reward-vs-danger arithmetic of similar sizes with a misleading "Finds" line. Placement is solved (one map). Skills are percentages. Dying can beat extracting. |
| **Progression / meta** | **3** | 7 unlocks, 535 RD, done in ~4–6 h. Nothing after the first win. In-run skills don't build an identity. |
| **Variety / replayability** | **3** | Seeded world, but one night map, six fixed waves, one boss, five repeating objectives and dead events. Two runs felt identical. |
| **Content volume** | **3** | About 15–20% of a $10–15 roguelite. |
| **Pacing** | **4** | Run length is fine. Nights go flat, flat, cliff (×3.5 HP on N3; 2 of 2 runs died there), then plateau. Days escalate in numbers only. No midpoint act. |

## 11. Top 12 (impact on how good the game feels)

1. **Pacing pass (M6):** the new `HEALTH_MULT`, N3 trims, the Relay stipend, and N1–2 that bite a little. This removes the N3 run-ender I hit twice.
2. **Night agency (M1, Relay Protocols):** turns 6 spectator waves into play and gives Intel a purpose.
3. **Relics in the jungle (M3):** the reason to explore, the build identity and the stay-or-leave stakes, in one system.
4. **Night maps from the jungle and wave variants (M2):** placement stops being solved; beacons and area direction matter at night.
5. **Death-rule clean-up (C):** salvage ≤ carried, no extra HP from dying, the boon needs extraction, and the beacon-home confirm.
6. **Events wired and 5 new objective types (M4):** stops the in-run repetition.
7. **Area bosses and night-gated day creatures (M5):** days escalate, and area choice gains lasting consequences.
8. **Skill rework (M7):** a machete branch, keystones, fewer and weightier picks.
9. **Meta (M8):** research tree, new towers, Overgrowth 1–10, Long Night endless.
10. **Camp crafting (M9):** sinks for Circuits, Biofiber and Intel; machete upgrades within a run.
11. **Honest area cards:** fix "Finds", remove V1 lasers/alarms/ambush text, and show active rewards on the night map.
12. **Lore and named landmarks (N4) and crew (N1):** the world gets places and people worth returning to.

## Verdict

The loop is right, the presentation is genuinely good, and the persistent jungle is a strong hook. Strategically, though, it's a demo.

Two runs from the title both died on night 3, after nights 1–2 that cost the Relay nothing. The night happens on one fixed board that ignores the jungle you shaped, and you can only watch it. Skills are passive percentages, the meta is spent in a few hours, and the open world rewards curiosity with crates. Three of the four run currencies have no sink you choose, and three designed events sit unused.

None of this needs new tech. Everything plugs into the data files and the existing `Run` / `JungleScene` / `DefenseScene` hooks. In this order, the game becomes a complete $10–15 roguelite:
1. a pacing pass;
2. Relay Protocols;
3. relics;
4. map variants tied to the jungle;
5. wired events and new objectives;
6. area bosses.

Then meta depth (Overgrowth, endless) gives it legs.
