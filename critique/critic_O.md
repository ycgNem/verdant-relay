# Verdant Relay: Critic O: Stage 9 skillful combat, played through a balancing lens

**Session:** 2026-10-14/15. Build: the frozen Stage 9 snapshot `.playwright-mcp/frozen_s9/`, served by request
interception at `http://frozen.test/` to my own headless Chrome at 1280×720.
- **Driver:** `.playwright-mcp/criticO/driver.mjs`. Port 7611 was held by another agent's driver (`polish/`), so mine ran on **7617**. It is stopped now.
- **Console:** 0 errors, 0 page errors.
- **Evidence:** everything is in `.playwright-mcp/criticO/`: screenshots `O*.png`, raw logs `bat_*.txt`, `days*.txt`, `sweep*.txt`, `boss_n3.txt`.

## How it was played

**Real inputs only.** All play used real keyboard and mouse events: WASD, mouse aim, left-click slashes, right-hold chops, Space rolls, Q med kits and E holds.

**What debug did.** Debug was used for setup only:
- choosing the night, district and seed;
- teleporting to an arena spot;
- spawning the pack;
- reading state to measure;
- giving med kits on debug days.

**The human model** (`olib.mjs: human()`). It reacts only to what is drawn on screen:
- the red flash;
- the ground rings and lanes;
- the panting "open" state;
- GUARD.

Each reaction comes **260 ± 40 ms** after the cue (330 and 400 ms in the reaction tests). Rolls go roughly sideways, ±25°. There are three profiles:

| Profile | How it plays |
|---|---|
| **careless** | Walks in, mashes left click about 7/s, never rolls, presses Q under 35 HP. |
| **skilled** | Attacks the nearest creature. Holds its swing while something near it is visibly winding up. Rolls ~260 ms after a red flash that covers it. Walks out of rings, lanes, lobs and spore clouds. Heals when nothing is close. |
| **careful** | Pure bait-and-punish: hovers about 2 tiles off, rolls on the flash, and only hits creatures that are open or stunned. |

**What was played:**
- **Guided night-1 day:** a real new run from the title screen, played twice (careless, careful).
- **Full debug days with wildlife on**, each going to the quest, holding the objective, taking 0–3 detours, then going home:
  - N2 Flooded Transit;
  - N3 Overgrown Market, Collapsed Residential and Data Center;
  - N5 Canopy Greenhouse and Collapsed Residential.
- **Clean-arena fights** against every creature alone and in packs at N1, N3 and N5.
- **Two area bosses** at N3: Pack Lord and Security Warden.
- **Timing sweeps:** the roll pressed at a fixed delay after the flash.

**Caveat.** My bots are tactically naive:
- no deflect, no throw;
- they don't disengage from a growing brawl;
- the first pass didn't dodge Spitter wind-up rings (fixed for the reruns).

A good human will do somewhat better than "skilled" in brawls. A new human will do worse at reading telegraphs.

---

## 0. Verdict

**The core is a real improvement.** The fight loop the user asked for now exists:
- "Red flash = committed, roll, punish the opening" works.
- The flash reads at 1280×720 in the open, in ferns and in the dark.
- Face-trading is clearly worse:
  - against a lone Feral, the careless player takes 17–19 HP per Feral at N3/N5;
  - the skilled player takes 0, in the same ~2.5 s.

**Balance has swung from cakewalk to lottery.** Difficulty is now set almost entirely by how many **Ferals** a district rolls, not by the night:
- **Crawler-heavy districts stay a cakewalk.** In the Overgrown Market at N3 the skilled human lost **0 HP all day**. Crawlers and Skitters still die to a mash before they can bite: 0 HP lost against a lone Crawler or Skitter at N1, N3 and N5.
- **Feral-heavy districts are attrition meat-grinders.** In Collapsed Residential and Data Center at N3, the *skilled* human died in **49 s, 67+58 s and 76 s**:
  - fights snowballed to **10–19 creatures**;
  - it took 14–27 kills before going down;
  - the hits were many small, mostly fair ones.

  That is exactly the "no skill the way someone dies" the user complained about. The cause has moved from face-trading to brawl size.

**Four specific problems:**
1. **The death screen often blames the wrong thing.** It names the last *tick*: "Taken down by bleeding. A roll stops bleeding." or "Taken down by spores.", when 70+ HP came from Feral lunges.
2. **The Feral's second thrust is the tightest attack in the game:** 0.33 s from its flash to contact, against ≥ 0.40 s for everything else. It is the #1 source of damage for careful players.
3. **Q is silently dropped mid-swing** (6/6). A skilled run died holding **2/2** med kits.
4. **Occluded creatures are drawn as red outlines**, the same red as the commit flash.

---

## 1. Scores

| Axis | Score | Why |
|---|---|---|
| Skill expression | **7/10** | Roll-on-flash plus punish beats mashing at equal speed. Gold ×1.5 crits are frequent in skilled play (5–14 per fight). The guard is rare but works. Rolling *early* (on the wind-up, before the flash) also escapes, so the flash isn't strictly needed. No reason to deflect over roll was tested. |
| Fairness | **5/10** | Brawl snowballs. Wrong death attribution. Second thrust at 0.33 s. Silent med-kit drops. Red occlusion outlines. Single-creature telegraphs themselves are fair (§2). |
| Difficulty-appropriateness | **4/10** | N1 is a good, gentle teacher. N2 is about right. At N3 a skilled player loses 0 HP in the Market but dies in under a minute in the Residential. At N5 a skilled player with 2 kits died in 1 of 2 days. |
| Readability of threats | **7/10** | A solid red silhouette plus "!" pops in every light and terrain I tried (`O10_commit_sheet_n5.png`, `O14_sheet.png`). Lanes and rings read. Docked for the red occlusion ghosts (`O6_occl_zoom.png`) and the Spitter ring hidden under your own feet (`O13_lob_0.png`). |
| Feel | **7/10** | Flash, gold numbers, PERFECT and the hop-back all land. Getting hit stopping the combo is legible. Docked for the dropped Q and the slow, passive feel of pure bait-and-punish (10–45 s per fight; Skitters dart out of reach forever). |

---

## 2. Skill: are the telegraphs reactable?

**Measured flash-to-contact time** (`m_commit.js`; game time; the player standing still):

| Creature | N1 (wind-ups ×1.2) | N3 / N5 |
|---|---|---|
| Feral lunge | 0.51 s | **0.44 s** |
| Crawler lunge | 0.46 s | **0.39 s** |
| Skitter lunge | 0.51 s | **0.45 s** |
| Razorback charge | 1.00 s | 0.84 s |
| **Feral second thrust** | — | **0.33 s** (its wind-up starts 0.16 s after the first lunge; flash 0.16 s in) |
| Elite Razorback charge2 / stomp | — | 0.42 / 0.48 s |

**Roll-delay sweep** (`sweep_n3.txt`, `sweep2_n3.txt`; N3; the roll pressed D ms after the flash; real Space key; the delay is measured in-game from the flash to the roll starting):

| Creature | Roll works up to | First failure |
|---|---|---|
| Feral | ≥ **408 ms** (sideways or away) | — |
| Skitter | ≥ **408 ms** | — |
| Crawler | **363 ms** | 396 ms |
| Second thrust (after rolling the first lunge sideways) | **317 ms** | — |

- **Verdict:** fair for a human at 250–330 ms, except that the Crawler is borderline at ~330 ms and the second thrust is near the limit.
- **Early rolls work too.** Rolling 100–250 ms into the wind-up, before the flash, escaped the Feral and Crawler every time (4/4): a 3-tile sideways roll from 1.7 tiles leaves the 2.8-tile reach. So "roll on the flash" is a nicety, not a requirement, and the skill floor is lower than DESIGN implies.
  - This is not necessarily bad: anticipating is skill.
  - But the punish then needs a walk back. The careful bot spent 8–45 s per fight because of it.

**The red flash on screen.** Every capture is at 1280×720:
- `O10_commit_sheet_n5.png` (open ground, rain);
- `O14_sheet.png` (in ferns; dark);
- `O12_thrust2_pair.png`.

The whole sprite turns solid #ff2e2e, with a red "!" above. It's unmistakable, even for a Crawler half-buried in ferns or a Skitter in near-dark. The blink (0.07 s) can catch it "off" in a still frame, but at speed it reads as a strobe.

**Problems:**
- **Occlusion ghosts.** Creatures under canopy are drawn as red outlines over dither (`O6_res_fight4_sheet.png`, zoom `O6_occl_zoom.png`: three Ferals under one trunk). In a 6–10-creature brawl, the red ghosts and real flashes mix.
- **Spitter.** The pink target ring sits under the player's sprite and is mostly hidden by your own body (`O13_lob_0.png`). The wind-up tracks you for 0.44 s, then flight takes 0.48–0.90 s. That's fair if you watch the Spitter, but the cue is in the worst place on screen.

---

## 3. Balance: arena fights (clean, wildlife off, from 100 HP, no kits)

HP lost per fight; fight time in brackets. Logs: `bat_n1b.txt`, `bat_n3.txt`, `bat_n5.txt`, `bat_skilled.txt`, `bat_n5c.txt`, `bat_guard.txt`.

| Pack | N1 careless / careful | N3 careless / skilled / careful | N5 careless / skilled / careful |
|---|---|---|---|
| Feral | 12 (2.6 s) / 0 (16 s) | 17 (2.1 s) / **0 (2.4 s)** / 0 (7.6 s) | 19 (2.8 s) / **0 (2.6 s)** / 0 (10 s) |
| Crawler | **0 (1.5 s)** / 0 | **0 (1.6 s)** / — / 0 | **0 (1.6 s)** / — / 0 |
| Skitter | **0 (1.3 s)** / 6 | **0 (1.6 s)** / — / 0 | **0 (1.5 s)** / — / never caught it (45 s) |
| Razorback | 18 / 0 (one roll, then a 3-slash punish kills it in 3.4 s) | 26 / — / 26 | 29 / 0 (in ferns) / 0 |
| Feral + 2 Crawlers | 12 / 25 | 0 / 14 / 19 | 0 / 0 / 30 |
| 2 Feral + 2 Skitter | 12 / 0 | 34 / 0 / 89 (timed out) | 81 / 0 / 30 |
| 7-pack (3 F, 2 C, 2 S) | 36 / 0 | 77 / 41 / 48 (timed out) | 88 / 38 / 21 |
| Chief + 2 Ferals | — | — | **76; another run DEAD in 7.9 s** / 32 / 38 |
| Elite Razorback + 2 Crawlers | — | — | **89; another run DEAD** / 0 / 65 |
| Bloater | — | — | 11 / 0 / 5 |
| Thorn Stalker | — | — | 18 / — / — |

**Readings:**
- **Face-trading loses.** Against Ferals and Razorbacks, careless pays one hit per creature (17–29), while skilled is free *and equally fast*. That's the user's request, delivered.
- **Crawlers and Skitters are still free kills for a masher on every night.** A face-traded combo (54) out-damages Crawler HP (34 × 0.85–1.3 = 29–44), and the combo lands in ~0.73 s, before the provoked counter-bite (0.7 s wind-up + 0.04). This is why crawler-heavy districts are a cakewalk.
- **Careless dies to packs from N5:** the Chief camp in 7.9 s, the elite Razorback in 12.6 s. At N3 a 7-pack takes 77 of 100.
- **Second thrusts are the skilled player's tax:** 14–32 HP in most Feral fights (logs: `Feral.thrust2`).
- **Pure bait-and-punish is slow and sometimes worse than mashing:** N3 2F+2S, 89 HP lost over 45 s against 34 for careless. Creatures holding a token circle at 2.4 tiles and often won't commit, and Skitters dart away after a miss. The good style is skilled (attack, but stop when a wind-up shows). That's fine, but it means "careful" new players will feel the game is slow and grindy.

**The Feral guard.**
- It appeared in 2 of 3 lone N5 mashes and in 1–2 fights per day in Feral districts: "GUARD", "BLOCKED", and a steel tint.
- It is never a loop: the 3.5 s cooldown, the 0.8 s duration, and the fact that a chop breaks it all hold.
- It is rarely seen because the provoked counter usually fires first. Fine as flavour; not a problem.

**Stunlocks.** None found.
- Closest gaps between landed hits: 0.60 s (a lunge, then its second thrust), and ~1.3–1.9 s between different attackers (Chief camp death: hits at 27.9, 28.5, 29.9, 30.8, 32.5, 33.1).
- There is always room to roll. Deaths in packs are sustained pressure, not lock.

**Razorback in brush.**
- In ferns the lane shows through the foliage (`O21_rb_strip.png`).
- One sideways roll beats it, and the 1.0 s opening plus ×1.5 punish kills a N1 Razorback in a single cycle (3.4 s).
- Generous, but satisfying.

---

## 4. Balance: full days (wildlife on, real treks)

Each day goes to the quest, holds it, takes N detours of ~24 tiles, then goes home. Logs: `days*.txt`, `days2_*.txt`, `day_dc3.txt`.

| Night / district (seed) | careless | skilled | careful (bait) |
|---|---|---|---|
| **N1 guided Market** (real new run, direct quest) | **−30** (two Crawler bites plus bleed) | — | **−13** |
| **N2 Flooded Transit** (7), 3 detours | **died** on detour 2 at a Feral camp: spear 13, lunge 28, glob 9 in 5.9 s | ended at **38** (−62; −43 of it Spitter globs across water) | died (Spitter chip; first-pass bot ignored wind-up rings) |
| **N3 Overgrown Market** (3) | died going home at ~6 min (−146 incl. 1 kit) | **−0 all day** (2.5 min, 20+ kills) | — |
| **N3 Collapsed Residential** (11) | **died in 41 s** (Ferals 101 + 2 kits dropped) | **died in 49 s**, and again in 125 s (26 kills) | survived at 53 (no kits) |
| **N3 Data Center** (4) | — | **died in 76 s**: fights of 10–15 creatures, 27 kills | — |
| **N5 Canopy Greenhouse** (5), 2 kits | died at ~2 min (finished by a Stalker) | survived at **51** (−49) | died at 88 s (no kits, first pass) |
| **N5 Collapsed Residential** (8), 2 kits | died in 28 s / 38 s | **died in 50 s, holding 2/2 kits** (the Q was dropped mid-swing) | — |

**Why the Feral districts kill everyone** (`m_pop.js`; creatures per 16×16 chunk in the day's home region, seed 11):

| District | N3 | N5 |
|---|---|---|
| Market | 3.40 (Crawler 2.23, Feral 0.69) | 4.17 (Feral 0.60) |
| Residential | 3.13 (**Feral 1.63**, Skitter 1.03) | 3.70 (Feral 1.64) |
| Data Center | 3.24 (**Feral 1.68**, Razorback 0.36) | 4.08 (Feral 1.72, Razorback 0.80) |
| Greenhouse | 3.35 (Feral 0.27; Crawler, Spitter, Skitter) | 4.77 |

- **Same density, different danger.** Total density is the same everywhere, but a Feral is worth about 5 Crawlers in danger.
- **Fights grow while you fight them.** You move while fighting, nearby wildlife within 7–9 tiles with line of sight joins, `alertNear` spreads alerts 6 tiles, and spawn rings 2 chunks out keep the supply up.
- **Logged growth:**
  - "within 12 tiles at fight start" was 6 creatures and grew to 19 (11 killed, 8 still alive) in 24 s;
  - 4 grew to 14 kills.

  See `O5_day_collapsed_residential_3_skilled_end.png` (7+ Ferals, a Razorback and Crawlers around the player at 0:36 into the day) and `O6_res_fight4_sheet.png`.
- **The deaths are attrition:** 5–7 individually fair hits across a 15–25 s brawl.

**Per-night answer to "how much HP does a careful vs careless player lose per day?"**

| Night | careless | careful / skilled |
|---|---|---|
| **N1** | −15 to −40 | −0 to −15 |
| **N2** | −50 to −100: dies on a long day if it walks into a camp | −40 to −60 (mostly Spitter chip) |
| **N3** | dies in Feral districts within 40 s–6 min | **0** (Market) to **dead in under 80 s** (Residential, Data Center) |
| **N5** | dies in 28 s – 2 min | −50 (Greenhouse) to dead in 50 s (Residential) |

**Is anything still a cakewalk?**
- N1 and N2 for anyone who rolls.
- N3+ crawler districts for anyone who rolls.

**Is anything unfair?**
- N3+ Feral districts for anyone without a disengage plan.
- The second thrust for slower reactors.

**Bosses at N3** (`boss_n3.txt`; real input, 280 ms reaction; the combat agent's boss bot run against the frozen build):

| Boss | skilled | masher |
|---|---|---|
| Pack Lord | killed in 66 s, −55 | **died in 10 s** |
| Security Warden | killed in 52 s, **−0** | **died in 22 s** |

Bosses are now a good skill check: the masher dies fast. The Warden still costs a telegraph reader nothing.

---

## 5. Death: is it clear why?

Captured death screens:

| Death | Headline | Tip | Real cause |
|---|---|---|---|
| **N5 Chief camp, careless** (`O30_death_chiefcamp_n5.png`) | "Taken down by a Feral Chief's second thrust." | "You were hit 17 times mid-swing. Stop swinging when something flashes red, and roll." | **Right and useful.** |
| **N5 Residential, careless** | "Taken down by **spores**." | the mid-swing tip | Wounds: Feral 68, Razorback 29, Bloater 22, spores 15. **Wrong headline**: a 5 HP tick took the blame for a Feral fight. |
| **N3 Data Center, skilled** | "Taken down by **bleeding**." | "**A roll stops bleeding.**" | Wounds: Feral lunge 73, Razorback 26, Crawler 13, Skitter 8. **Wrong and useless**: the killer was Ferals, plus 28 from second thrusts. |

**Smaller problems on the death screen:**
- The "Today's wounds" line merges the second thrust into "lunge" (`deathNote`: `w.how === 'thrust2' ? 'lunge'`), so the line contradicts a "second thrust" headline.
- Nothing tells a brawl death "you fought 14 creatures at once: break line of sight or head home". The attrition deaths have no lesson on screen.
- "You were hit N times mid-swing" counts all day, not this fight. That is fine in real play.

---

## 6. Feel

- **Hit feedback is strong:**
  - white flash, sparks, gold ×1.5 numbers on punishes;
  - "PERFECT" with a cyan rim on through-rolls (frequent: 4–11 per skilled fight);
  - "SPLAT!" now happens (1–4 per day, was 0 in I2).
- **Getting hit stopping the swing is readable**, and the game's own swing log is accurate: careless deaths show "hit N times mid-swing".
- **The med kit drops input silently.** `Player.useMed` returns when `state !== 'free'`, with no buffer, no toast and no sound. `m_med.js`: 6/6 Q presses 90 ms into a slash did nothing; the same press from a free stance healed. A panicking player mashes Q between slashes and nothing happens. The skilled N5 run died with its kits in its pocket (`O5_day_collapsed_residential_5_skilled_end.png`: "2/2"). The 0.7 s heal itself is fine: it's a readable "find a gap" decision, and a roll cancels it while keeping the kit.
- **Bait-and-punish against Skitters doesn't work:** they dart out after a miss, and the careful bot never caught one in 45 s. Not a bug, but Skitters reward only mashing or chop-flicks.

---

## 7. Prioritised fixes (with numbers)

**1. Stop brawl snowballs (the #1 fairness and difficulty problem).**
- **Cap the creatures engaged with you.** Add `CONFIG.expedition.attackers.engagedMax: [3, 4, 4, 5, 5, 6]` by night. Alerted creatures beyond the cap hold at 5–6 tiles: they circle, throw spears if they are Ferals, and join only when a slot frees.
- **Spread alerts less.** `alertNear` radius 6 → **4**.
- **Thin the Ferals.** Trim Feral weight in `collapsed_residential` / `data_center` (`DISTRICTS[...].enemies.scav`) by ~30%, so home-region Ferals go from ~1.65 to ~1.15 per chunk at N3.
- **Target:** a skilled N3 Residential day ends at −40…−70 HP, not dead in 50 s.

**2. Make the second thrust reactable.**
- **More time after the flash.** `EXPLORE_ENEMIES.feral.thrust2.track` 0.35 → **0.15**, taking flash-to-contact from 0.33 s to ~0.42 s, the same as the first lunge.
- **Ramp it in.** Make `thrust2.chance` ramp: 0.2 at N2, 0.3 at N3, 0.4 from N4 (today: 0.4 from N2).
- **Name it in the wounds.** In the wounds line, stop folding `thrust2` into "lunge".

**3. Crawlers must bite back (fixes the Market cakewalk).**
- **More HP.** `EXPLORE_ENEMIES.crawler.hp` 34 → **46**:
  - at N3/N5 a face-traded combo (54) no longer kills it (46 / 55), so the provoked counter lands;
  - a punished combo (81) still kills it;
  - N1/N2 (39/42) still die to a combo, so it still teaches.
- **More time to roll.** `crawler.track` 0.5 → **0.42**, taking flash-to-contact from 0.39 s to ~0.45 s, so a 330 ms reactor can roll it.
- **Optional Skitter change.** `skitter.hp` 16 → 20, so two slashes (26) still kill it but one punished slash (20) only just does.

**4. Make the death screen blame the killer.**
- In `Player.deathNote`, if the last entry is a DoT (`bleed`, spores), use the last *direct* blow from the previous 3 s for the headline and tip, or the biggest wound source if there was none.
- Add a brawl lesson: if ≥ 4 different creatures hurt you in the last 15 s, the tip becomes "You were fighting N creatures at once: back out of sight, fight at a choke, or head home."

**5. Buffer the med key.** A Q press during a swing, chop, throw or roll should start the heal as soon as the stance is free (within 0.4 s, like `ROLL.buffer`). If that's impossible, toast "Can't heal mid-swing" with the error sound. Never drop it silently.

**6. Lower priority:**
- **Occlusion silhouettes:** draw creatures behind canopy in a non-red colour (`#c0cbdc` pale steel, or the creature's own dark); reserve red for the commit flash.
- **Spitter ring:** draw the lob ring above the player's own sprite, or add a pink pointer at its edge while it tracks you. Optionally a minimum flight of 0.7 s.
- **Early rolls:** if the flash should be the cue, make a lunge whose target rolled away during the aim phase re-aim once on the commit (Feral only, `track` window). Otherwise update DESIGN to say anticipating works.
- **The Warden** still costs a telegraph reader 0 HP at N3: shorten one of its tells by ~0.1 s or add a mixed beam-and-minion phase.
- **Day 1:** keep it. It teaches well (−13 careful, −30 careless): no tanks, lone creatures, ×1.2 wind-ups.

---

## 8. Evidence index (`.playwright-mcp/criticO/`)

| What | Files |
|---|---|
| Commit flash | `O10_commit_<creature>_n{1,3,5}.png`, `O10_commit_sheet_n5.png`, `O14_commit_*.png`, `O14_sheet.png`, `O12_thrust2_pair.png` |
| Spitter ring | `O13_lob_0.png`, `O13_lob_1.png` |
| Brawl | `O6_res_fight4_sheet.png`, `O6_occl_zoom.png`, `O5_day_collapsed_residential_3_skilled_end.png` |
| Death | `O30_death_chiefcamp_n5.png`, `O5_day_*_modal.png`, `O5_day_collapsed_residential_5_skilled_end.png` (2/2 kits) |
| Guided day 1 | `O02_day1_start.png`, `O41_day1_at_relay.png`, `O42_day1_after_extract.png`, `O43_day1_careful_end.png` |
| Razorback | `O21_rb_strip.png` |
| Scripts | `olib.mjs` (human model, trek, playDay), `bat.tpl`, `day.tpl`, `m_commit.js`, `m_sweep.js`, `m_sweep2.js`, `m_t2.js`, `m_lob.js`, `m_med.js`, `m_pop.js`, `m_shots.js`, `obossbot.mjs` |
| Logs | `bat_*.txt`, `days*.txt`, `days2_*.txt`, `day_dc3.txt`, `sweep*_n3.txt`, `boss_n3.txt` |
