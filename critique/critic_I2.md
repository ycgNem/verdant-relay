# Verdant Relay: Critic I2 (round 2): combat, movement and game feel in the day jungle

**Session:** 2026-10-13/14, frozen snapshot `.playwright-mcp/frozen_r2a/` served by request interception to my own headless
Chrome (1280×720, 640×360 view ×2, 230–240 fps). Console: 0 errors, 0 page errors in every run.
Everything is in `.playwright-mcp/roundI2/`: screenshots `I2_*.png`, logs `battery_*.txt`, `bossbatch.txt`, `kits.txt`, scripts `*.mjs`.

**How it was played.** All input was real Playwright keyboard and mouse input. In-page probes only read state, apart from two test fixtures:
- **Clean arenas:** for the controlled arena fights I set `NOWILD=1`, which turns off chunk wildlife, and passed `&bosses=` so the Pack Lord wasn't roaming. The first battery was contaminated by the Pack Lord; I threw those N5 numbers out.
- **Dummy target:** the Security Warden with its AI switched off, used for DPS only.

| Harness | What it does |
|---|---|
| `t1_basics` | Latency, acceleration, turnaround, roll chain, chop timing, recorded per frame against the real `keydown`/`mousedown` events. |
| `t4_observe` | A stander vs a kiter, 12 s against a pack. |
| `arena` + `fighter` | Critic I's three profiles plus a `kiter` (walks out of telegraphs, never rolls): **48 clean fights**. |
| `deflect` | RMB tap swept in 50 ms steps after the wind-up starts, against 4 creatures. |
| `pdodge` | Roll timing × direction sweep. |
| `lunge_timing` | Contact delay after the wind-up ends. |
| `parrybot` | Taps RMB at "ring closes − 20 ms" with N(0, 40 ms) timing error. |
| `features` / `features2` / `podlaunch` | Bleed, sap, spear, double thrust, Skitter flank, Stalker, Bloater, Chief, elite, throw, splat, pod launch. |
| `bossbot` | Reads every ground telegraph after a 250 ms reaction, walks or rolls out, culls minions, slashes, uses meds. Plus a masher profile and a STANDOFF variant. **27 boss fights from full HP, no injected damage.** |
| `dps` | 20 s against the passive dummy, for each attack pattern and kit. |
| `t9_trek` | Three real day treks, with environmental-kill counters. |
| Others | `t3_traverse` (cutting), `t12_slide` (corner nudge), `t7_spawncheck`, `lairclutter`, and screenshot strips. |

**Caveat on the skilled bots.** They are mechanically strong (perfect reads of every telegraph after 0.22–0.25 s) but tactically naive: they never use the throw, the chop (except in STANDOFF), cutting in fights, or deflect. Humans will take more hits than they do in packs and may do better against Spitters.

---

## 0. Headline

Round 1's core complaint ("walking beats everything, the jungle looks dangerous but isn't") is **fixed**:
- **Kiting costs HP:** kiting a night-5 pack now costs 37–48 HP in 12 s (was 6).
- **No stacking:** creatures hold flank slots instead of standing inside you.
- **Ferals are free:** none are boxed into brush any more.
- **Cutting flows:** 3.2–4.7 tiles/s, about 0 s exhausted (was 1.9 t/s, 50% exhausted).
- **Rolls register:** roll presses are buffered (6 rolls from 7 presses, was 3).

**The deflect is the best thing added.** The 140 ms window is honest. The cue is consistent: contact comes a median 33–62 ms after the ring closes. It changes tempo: a parry player clears an N5 7-pack in 5–7 s, against 14 s for a roller. It is *the* answer to the Pack Lord: rolling bot 0/3, parry bot 2/2.

**The five area bosses are the weak point.**
- **Turrets:** four are stationary turrets running independent cooldown timers.
- **Difficulty is a lottery:**
  - Warden: 3/3 kills, 0–28 damage taken.
  - Thorn Mother: 0/7. Its barrage ring is 1.0 tiles, but the spore cloud it drops is 1.9.
  - Brood Hive: 1/3, after 69–74 minion kills that drop loot.
- **Cheese:** Warden and Engine have stand-off spots their anti-hug moves can't reach.

Underneath, the heavy chop is still the dominant sustained attack: 36.9 DPS and never exhausted, against 27–33 for the combo.

---

## 1. Responsiveness (measured; 1 frame ≈ 4.2 ms)

| Action | Round 1 | Round 2 | Verdict |
|---|---|---|---|
| D down → first motion / full speed | +5.9 ms / 113 ms | +7.6 ms (2 f) / **115 ms** | Same, good. |
| Release → stop | 123 ms, 0.34-tile slide | **91 ms, 0.26 tiles** | Fixed (DESIGN target 0.25). |
| 180° (D → A) | vx<0 115 ms, full 232 ms | vx<0 **49 ms**, full **162 ms** | Better, but DESIGN's "~0.1 s" is false: once vx crosses 0 the code drops back to `accel` 48 (`Player.js:266`). |
| Click → swing pose / blade arc on screen | 1 frame / ~83 ms | 1 frame / ~105 ms | Fine (Hades-class). |
| 6 clicks at 90 ms | 3 swings | 3 swings | Correct buffering. |
| 7 Space at 380 ms | **3 rolls** | **6 rolls** (stamina min 6) | Fixed: `ROLL.buffer` works. |
| Roll | 340 ms, 3.04 t | 337 ms, 3.04 t | Same. |
| RMB hold → chop free | 969 ms | 962 ms | Same. |
| **Deflect window** (new) | none | **≈140 ms** (succeeds 2–140 ms before contact on Crawler, Skitter, Feral, Razorback; fails at 144–157) | Fair; see §3. |

---

## 2. Difficulty re-measured (clean arenas, real input)

**Stander vs kiter** (`t4_observe`, 12 s, no attacks):

| Pack | Round 1 still / kite | Round 2 still / kite |
|---|---|---|
| N5: 3 Feral + 2 Crawler + 2 Skitter | 69 / **6** | 49–78 / **37–48** |
| N2: Feral + 2 Crawler | 58 / 9 | 73 / 30 |
| N5: 2 Razorback + 2 Crawler | 96 / 32 | 100 (dead at 12.7 s) / 27 |

- **Lunges intercept walkers.** They lead the walker; walking at a waiting Feral starts its wind-up 0.35 s later (`t14`).
- **Razorbacks still never hit a kiter.** Their charge aims at your current position, not your lead. That's fine: the lane is a sidestep test.

**Arena HP lost per fight, N5** (Feral+2C · 7-pack · 2 RB+2C · elite RB+2C · 2 Spitter+2 F · Chief+3 F):

| Profile | HP lost per fight | Time exhausted |
|---|---|---|
| Skilled (0.22 s reads, rolls) | **0 · 0 · 0 · 0 · 0 · 0** | 0–3.5 s of 5–17 s |
| Kiter (walks out, attacks, never rolls) | 13 · 46 · 2 · 17 · 30 · 38 (avg 24) | 0–3.2 s |
| Masher (never dodges) | 13 · 56 · 65 · 50 · 0 · 41 (avg **38**; round 1: 0–50) | 0–4.7 s |
| Parry bot (40 ms SD timing error) | 7-pack in **5.3–6.9 s**, 6–14 HP, 2–3 deflects | — |

- **Night 2:**
  - masher: 23 · 21 · 34 · 55 · 10 · 30;
  - skilled: 0 everywhere except one 10.
  - **Lone night-2 creatures still die in 1.1–1.8 s before attacking, even to the masher** (`battery_r2.txt`). The combo out-ranges the 1.5–1.7-tile wind-up trigger.
- **Mashing is now punished, and a careful roller is untouchable in packs of ≤7.** The danger moved to the treks:
  - an N5 Residential feral camp (7 Ferals + Chief, spears, spores) killed the skilled bot at 80 s;
  - it spent **51 of 80 s exhausted** after 29 rolls in one 25 s fight (`t9_trek`, `I2_60_camp_grid.png`).
- **Stacking:**
  - max creatures within 1.3 tiles = 2 standing still (round 1: 3–4); up to 4 while kiting;
  - four Ferals hold flank slots about 1.5 tiles out; none inside the sprite (`I2_40_circling.png`, compare round 1 `I44`).
- **Exhaustion:**
  - fixed for short fights (≤25%);
  - **not** for long ones: Pack Lord N5 26 of 63 s (41%), mashing a dummy 9.1 of 20.5 s (44%), the camp trek 64%. Rolls at 20 stamina are the drain.

---

## 3. The new verbs

**Deflect / riposte: good; the best addition**
- **Window** (`deflect.mjs`, 2 reps per 50 ms step):

  | Target | Success when RMB is pressed this long before contact |
  |---|---|
  | Feral | 7–107 ms |
  | Crawler | 2–140 ms |
  | Skitter | 19–126 ms |
  | Razorback charge | 2–129 ms |

  A 0.5 s lockout punishes early taps.
- **Consistent cue.** Contact lands 21–92 ms after the ring closes against a still player (median 46–62), and 4–184 ms against a walking one (median 33–37) (`lunge_timing`). Players can learn "press as the ring closes".
- **Readable.** A white ring and star, a 0.09 s hit-stop, a screen flash, "DEFLECT", the attacker reels 1 s (`I2_12_deflect_text_grid.png`).
- **Rewarding:**
  - a tap's own release-slash becomes the riposte (33 damage);
  - parry tempo halves fight time;
  - against the Pack Lord a 40 ms-error parry bot deflected **14/19 and 15/20** and won both fights (62 s, −54 HP; with Riposte Master + Duelist −12 HP).
- **Problems:**
  1. The deflect shoves the attacker away (`ExploreEnemy.deflected`: kb 5 ≈ 0.55 tiles). A riposte clicked about 0.4 s later **whiffs, and the whiff spends it** (`Player.startSwing` zeroes `riposteT` regardless). 3 of 16 sweep deflects and 1–2 of 7 fight deflects whiffed.
  2. Breakpoints:
     - riposte 33 against an N2 Feral at 39 HP leaves **6 HP** (`I2_10_deflect_grid.png`: "stunned, 6");
     - riposte + slash = 46 against an N5 Feral at 50 HP leaves **4**.
  3. "DEFLECT" and "PARRIED" print on top of each other.

**Perfect dodge: implemented, but it only rewards rolling *into* the attack**
- Sweep, Feral N2, 400–650 ms, 12 tries per direction:

  | Roll direction | Perfect dodges |
  |---|---|
  | Toward / neutral | 8/12 (a ~150 ms band) |
  | Sideways | **2/12** (one 50 ms slot) |
  | Away | **0/12** |

- `Player.hurt` only grants it if a hit *lands on you* within 0.15 s of the roll starting. A roll out of the ring never gets touched, so it's never perfect.
- The roll tip does say "roll **through**", but every ring telegraph teaches "get out". The cyan rim + slow-mo is good when it fires (`I2_11_perfect_grid.png`).

**Machete throw (F): works**
- 18 out, 27 out and back; pierces a line of 3 Crawlers.
- Clears a 6-tile fern/thicket line (`122222 → 000000`).
- Shove and recall work (`I2_20_throw_grid.png`, `I2_21_throw_cut.png`).
- **Pressing F twice recalls the blade instantly and still spends the 3 s cooldown.** My first DPS script lost every throw this way: 0 DPS.
- Throw DPS: 4.9 (Hunter 6.6). A utility, which is right.

**Environmental kills: half-landed**

| Mechanic | Result |
|---|---|
| Chop-launched pods | 3.5 tiles, 4/4 (`podlaunch`) ✓ |
| Spore clouds on creatures | 27 hits and 4 kills in one N5 trek ✓ |
| Wall splats | Chop into a trunk 2/2, light combo **0/2**, and **0 in 3 treks and 48 arena fights** |

Splats need ≥ 4 t/s of knockback into a footprint (`SPLAT.speed`), so in practice they never happen.

**Status effects: work**
- **Bleed:** 3 s from a Crawler bite; a roll clears it.
- **Sap:** ×0.57 speed (0.70 vs 1.22 tiles in 0.25 s).
- **Root:** the Stalker's, 0.6 s; a roll breaks it.
- Bleed bypasses `hurt()`, so it has no source or direction: fine, but it's invisible in the death breakdown.

---

## 4. Enemy AI and the new creatures

**Feral**
- **Spear:** the first move when you stand in ferns 5.5 tiles away. A 0.9 s orange line, 14 damage (`I2_22_spear_0.png`).
- **Double thrust:** 1 of 7 lunges on N4 (data: 40%).
- **Spawns:** **0 of 136 / 81 / 149 Ferals spawn in solid brush** (round 1: 47%). No Feral stalemates in 3 treks.
- **Verdict:** three moves now; a real creature.

**Skitter flank**
- Wind-up angles off your aim: 161 70 59 177 147 14 166 143 32 106 179 86 15 171. That's **7/14 from behind** (≥140°), the rest random.
- With a 0.15 s chitter and 6 damage, this is fair harassment.

**Thorn Stalker**
- Stand still in ferns and it erupts every ~3.4 s: 4 × 16 damage + root in 12 s. The mechanic works.
- **Its 1-tile ring is drawn on the ground and covered by the fern cards it lives in** (`I2_23_stalker_zoom.png`: a faint brown-red arc at your feet). Only the Razorback lane has foliage x-ray.
- Its exposed body reads as a brown occlusion smear. It's a re-tinted Crawler with no art of its own.

**Bloater**
- **"A heavy chop launches it" is false at full HP.** It has 55 HP on N4; the chop does 40 and doesn't kill, and `Bloater.die()` only launches on the killing blow. It then swells and bursts on you: 10 + 6 cloud ticks = 40 damage (`I2_24_bloater_chop.png`).
- Slash-killing it in melee always puts you in its 1.9-tile cloud (4 ticks).
- There is no tip anywhere.

**Feral Chief**
- 86 HP on N5, ×1.2 Feral speed in its aura. Works; it's a palette swap.

**Elite Razorback**
- Stomp → charge → re-aimed charge2 all fire, and the lane re-telegraphs (`I2_50_elite_grid.png`). Still the 1:1 Razorback with a pink tint and amber ring.
- Skilled 0 HP, masher 50–55.

---

## 5. The five area bosses (fought for real, from full HP)

HP 945 on day 3 (1,080 on day 5). Presentation is decent:
- name banner + intro line;
- top bar with a 50% notch and "Enraged" / "Brood shield" notes;
- 45% camera lean, a phase-2 roar with tint and shake;
- slow-mo kill banner and a relic drop (`I2_B3wdS_99_end.png`).

Art: the Thorn Mother, Brood Hive and Warden are proper boss sprites. The Engine is small. **The Pack Lord is a red Feral at 1:1** (`I2_B5plS_02.png`).

| Boss | Skilled bot: result, length, damage taken | Masher | Telegraph clarity | Fairness / notes |
|---|---|---|---|---|
| **Thorn Mother** (Greenhouse) | **0/7 kills.** 6 tries on day 3, all died at 36–64 s with the boss on 202–802. Day 5: died at 50 s. Damage mostly *spores* (30–100) | Died in 15 s (boss −360) | Whip lanes excellent (`I2_B1tm_04.png`) | **The barrage ring is r 1.0 but its cloud is r 1.9** (`AreaBoss.barrage` vs `SPORES.radius`). Stepping out of the ring leaves you in the cloud, and its edge isn't drawn: puffs only reach 0.66 R (`I2_B1tm_04_zoom.png`). Phase 2: 2 clouds every 3.6 s with a 5 s life cover the 18 tiles² you can hit from. |
| **Brood Hive** (Market) | N3 1/2 (won at 113 s with 11 HP left; lost at 96 s). N5 died 126 s. **69–74 minion kills per fight** | Died 23–40 s | Burst ring and egg rings clear | An endless crawler/skitter stream (spawn every 6/4 s + eggs + hatch). Each minion rolls normal drops (+3 Scrap pops, med kits: `I2_B2bhS_06.png`) and Second Wind / Blood Moss heals: a farm. |
| **Security Warden** (Data Center) | **3/3 kills, 48–52 s, 0–28 damage.** Chop from 2.7 tiles: **39 s**. N5 died 108 s after wildlife joined | Died 27 s | Laser warn line + striped beam: excellent (`I2_B3wdS_05.png`) | Easiest. At 2.6–2.9 tiles the chop (reach 2.9) hits but the stomp (trigger 2.4) never fires. Rolling through the beam spams "DODGED" ×4 (`I2_B3wdS_02.png`). |
| **Drowned Engine** (Flooded) | **4/4 kills, 47–82 s, 20–77 damage** (N5 55 s) | Died 13 s | Vent rings pale but fine; surge lane is the good Razorback lane | Slashes at 2.72 tiles hit (reach 2.85) and the blast (trigger 2.6) never fires. "SHIELDED" prints during its roar although it has no shield (`I2_B4deS_06.png`). |
| **Pack Lord** (Residential) | Rolling bot **0/3** (died 51–63 s). **Parry bot 2/2** (62 s, 12–54 HP) | Died 19 s | Lunge rings + war-cry ring | The only boss that tests a verb (deflect). Visually it's a scrum of 1:1 Ferals stacked on the player (`I2_B5plS_02.png`). |

**Cross-cutting problems**
1. **Turrets on timers.** Four of five never move, and each move is an independent `ready(name, every)` cooldown with ±15% jitter: no patterns, combos or punish windows. Phase 2 = shorter timers and more lanes. Compare Hades' Megaera or Death's Door's Guardian: movement, sequences, and an opening after the big move.
2. **Difficulty is a lottery.** Warden 100% vs Thorn Mother 0% for the same reward (relic + Research + skill point + area cleared).
3. **Arenas are cluttered.** Each lair has 3–12 solid colliders within 3.5 tiles of the boss: crates, chests, terminals, lore stones, and **the relic strongbox at 0.7–3.4 tiles** (`lairclutter.mjs`, 3 seeds). You snag on crates while dodging rings. The relics, loot and boss streams all claimed the same lost-major site.
4. **Serrated Edge does nothing to the 4 stationary bosses.** `Bleeds.add` needs `e.def`, and the hittable proxy has none. On the Pack Lord, bleed skips the phase-2 check (`Bleeds._tick` sets `hp` directly).

---

## 6. Kit and dominant strategies

**DPS against the passive dummy** (N3, real input, 20 s):

| Pattern | DPS | Exhausted |
|---|---|---|
| **Chop spam** (hold RMB 450 ms) | **36.9** | **0 s** |
| Mash LMB | 33.3 | 9.1 s |
| Mix (chop + combo) | 31.7 | 0 s |
| Paced combo | 27.0 | 0 s |
| Throw (proper 3 s pacing) | 4.9 (Hunter 6.6) | 0 s |
| Glass Machete + Whetstone | chop **66.4** / mash 59.6 | — |
| Serrated Edge + Heavy Spine | chop 46.3 / mash 33.3 (bleed +0 on bosses) | — |

- **The chop dominates.** Round 1's "the chop dominates the combo" is unchanged.
  - The chop costs 22 stamina per ~0.96 s cycle, and 0.6 s of 40/s regen refills it, so it never exhausts.
  - It staggers, has a 165° arc and 1.9 reach, and gives the stand-off cheese above.
- **Glass Machete + Whetstone** (×1.8, +30% damage taken) is a pure upgrade for mashers: N5 7-pack 17 HP in 4.3 s, against 34 HP in 8.7 s. Fights end before the downside matters.
- **Cleaver** doesn't speed travel: chop-cutting 1.9 t/s with or without it. Only the cleared cone grows (65 vs 51 tiles).
- **Riposte Master + Duelist** turn the Pack Lord from a 54 HP win into a 12 HP win for a parry player. Useless to everyone else.
- **Integration slips:**
  - the thrown machete ignores Whetstone and Glass (`ExploreShots._bladeHits` uses `spec.damage`);
  - the Lifeline Idol's save prints **"SECOND WIND"**, the name of a different Machete skill (`JungleRelics.relicSave`).
- **Side note on spore ticks.** A cloud tick grants 0.6 s of hurt i-frames, the same as the 0.6 s tick interval (`SporePods`, `CONFIG.player.hurtIframes`). Standing in a cloud makes you near-immune to bigger hits for 8.3 DPS.

---

## 7. Traversal and cutting

**Cutting a dense ray** (`t3`, 12 s):

| Method | First 10 tiles | Sustained | Exhausted |
|---|---|---|---|
| Hold LMB while walking (hack-through) | 4.2–4.7 t/s | 3.8–4.7 t/s with no brambles | 0 |
| Click | — | 3.24 t/s | 0.9 s |

- Round 1: 1.87 t/s, 6.2 s exhausted. **Fixed.**
- **Brambles stall hack-through** to 1.2–1.3 t/s: light swings need 3 hits, and the auto-swing doesn't switch to a chop.

**Corner nudge** (`t12`, W into a trunk from 1.6 tiles at a lateral offset):

| Trunk | Width | Result |
|---|---|---|
| Palm | 0.60 | Passes at every offset (+380 ms) |
| Dead tree | 1.14 | Stuck at 0 and 0.1; passes from 0.2 |
| Fig | 1.49 | Stuck at 0–0.2; passes at 0.35 |

Round 1: every wide trunk dead-stopped at 0–0.35. **Partly fixed**: wide trunks still stop you dead head-on.

**Ferns:** fern drag and fern roll are unchanged; deep water and fords still read well.

---

## 8. Feedback and juice

**Good**
- Deflect clang/ring/hit-stop, the PERFECT cyan rim + slow-mo, a "SPLAT!", the RIPOSTE! beat.
- A death collapse with creatures stepping back (`I2_51_death_grid.png`).
- The dim always-on ring makes wind-up rings pop.
- Telegraphs that track then lock.
- Boss kill banner + relic.

**Bad**
1. **Spore clouds are puff sprites with no edge.** The damage radius is ~25% bigger than the art, and their damage has no source (`pl.hurt(dmg, 0, 0)`).
2. **"DODGED" stacks ×4** while rolling through the Warden beam: `hitLane` calls `hurt` every frame of the roll.
3. **DEFLECT and PARRIED overlap.**
4. **Boss damage numbers draw over the player** when you stand north of the boss.
5. **I-frame flicker at 0.35 opacity inside a yellow cloud makes the player vanish** (`I2_60_camp_grid.png`, bottom-left).
6. **Feral crowds become piles of red occlusion ghosts** (top-right of the same grid).
7. **The Stalker ring is hidden by ferns.**

---

## Round-1 item → verdict

| Round-1 TOP 12 item | Verdict | Evidence |
|---|---|---|
| 1. Melee threatens a moving player | **Fixed** | Kite N5 7-pack 37–48 HP / 12 s (was 6; target ≥ 35). |
| 2. Stop the stacking | **Fixed** (kiting can still bunch 4) | Max 2 within 1.3 t standing; flank slots (`I2_40`). |
| 3. No silhouettes over the player | **Fixed** | No red dither on the player in any capture; enemy-on-enemy ghosts remain. |
| 4. Stamina and cutting rework | **Fixed (cutting), partly (long fights)** | 3.2–4.7 t/s, ≤ 0.9 s exhausted. But the Pack Lord fight is 41% exhausted and the camp trek 64%. |
| 5. Feral brush spawns + no-path fallback | **Fixed** | 0/366 in brush; spear and hack-through fallback. |
| 6. Deflect / riposte | **Fixed, landed well** | 140 ms window, consistent cue, 74% success at 40 ms error; riposte whiffs and breakpoints left. |
| 7. Roll buffer, turn, perfect dodge | **Partly** | Buffer ✓ (6/7). Turn 162 ms (not ~100). Perfect dodge only when rolling into the hit (side 2/12, away 0/12). |
| 8. Environmental kills | **Partly** | Pod launch ✓, clouds choke and kill ✓; splats 0 in natural play, combo never splats. |
| 9. Spear, double thrust, Stalker, Skitter flank | **Mostly fixed** | All fire. The Stalker's telegraph is hidden in ferns; the Stalker is a re-tint. |
| 10. Corner nudge | **Partly** | Palm ✓, dead tree from 0.2, fig only at 0.35. |
| 11. Throw + status effects | **Fixed** | Pierce, line-cut, shove, recall; bleed, sap and root ✓. A double-tap of F wastes the throw. |
| 12. Breakpoints, elite, death beat | **Partly** | N1–3 slash breakpoints ✓, death beat ✓, elite second move ✓. **No native elite sprite**; riposte breakpoints leave 4–6 HP. |
| (G) Ferals frozen in thickets | **Fixed** | 0 boxed; no stalemates in treks. |
| (I §5) Chop dominates the combo | **Not fixed** | Chop 36.9 DPS, never exhausted, vs combo 27–33. |

## Scores (1–10; 7 = good commercial indie, 9 = genre-leading)

| Axis | Round 1 | Round 2 | Why |
|---|---|---|---|
| **Responsiveness** | 7 | **8** | Buffered rolls, 91 ms stop, 162 ms reversal, 1-frame swing, a fair 140 ms deflect. Not 9: the reversal is still twice Hades', and the chop is 0.96 s. |
| **Combat depth** | 4 | **6** | Kiting no longer works. Deflect gives a real aggressive option (tempo ×2, the Pack Lord answer). Throw, pods and clouds are tools. But the chop is still dominant DPS, perfect dodge is obscure, splats never happen, and a careful roller is untouchable in packs. |
| **Enemy AI / variety** | 4 | **6** | Ferals have 3 moves; Skitters flank; Stalker, Bloater and Chief are real problems; flank slots; no stalemates. But the new creatures are re-tints, the Bloater's answer is broken, and the elite is still a tinted Razorback. |
| **Bosses** (new) | — | **4** | Good presentation, and Warden, Engine and Pack Lord are readable. But they're turrets on timers, the difficulty is a lottery (Warden 3/3, Thorn Mother 0/7), the Thorn Mother's telegraph lies, the Brood Hive is a farm, two have stand-off cheese, and arenas are cluttered. |
| **Feedback / juice** | 7 | **7** | Deflect, perfect dodge, death and splat beats added; offset by cloud edges, DODGED spam, text overlap, the vanishing player in clouds, and red ghost piles. |
| **Fairness** | 7 | **6** | Creature telegraphs are honest and tracking is shown. But the Thorn Mother's ring/cloud mismatch, the Stalker ring under ferns, invisible cloud edges and sourceless spore damage are new "what hit me?" moments. |
| **Traversal / cutting** | 5 | **7** | Hack-through flows at 4+ t/s with no exhaustion, the throw clears lines, the nudge helps. But brambles stall the auto-swing and wide trunks still stop you dead head-on. |

## TOP 12 fixes (ranked by impact on a real player)

1. **Thorn Mother: make the telegraph tell the truth.** `AreaBoss.ThornMother.barrage`:
   - draw the cloud-pods' `ringTele` at `SPORES.radius` (1.9) in the spore colours, so they're distinct from the 1.0 damage-only pods; or make boss clouds `radius 1.2`;
   - cap live boss clouds at 1 in phase 1 and 2 in phase 2, with a 3.5 s life for boss clouds;
   - target: the bot wins ≥ 50% at day 3 (now 0/6), and the Warden and Thorn Mother within ±25% of each other.
2. **Give clouds an edge and a source.**
   - `SporeLook`: keep a 1-px dithered ground ring at the true damage radius under the puffs, and/or set the damage radius to `0.8 R`, matching the outer puffs.
   - Call `pl.hurt(dmg, dx, dz, 'Spores')`.
   - Raise the i-frame flicker minimum opacity from 0.35 to 0.6.
3. **Bosses need a fight, not timers.**
   - Sequence each boss's moves: a fixed pattern per phase + one random slot.
   - Give each big move a 1.2–1.5 s punish window: Warden overheat after a sweep (×1.5 damage taken), Engine boiler vent after a surge, Thorn Mother wilts after a barrage.
   - Kill the stand-offs: Warden `stomp.range` 2.4 → 3.1, Engine `blast.range` 2.6 → 3.2.
   - Give the Pack Lord a native ~1.5× PixelLab sprite.
   - Target kill time 60–120 s with every boss in the same win band.
4. **Brood Hive minions are not loot.**
   - Flag `spawnMinion` / egg hatches `{ minion: true }`: no `enemyDrop`, no Second Wind or Blood Moss heal.
   - Cap total spawns at ~18 per fight, or spawn only while the shield < max.
   - Target ≤ 25 kills per fight (now 69–74).
5. **Clear the lairs.** When a site becomes a lair (`AreaBosses.build`), move its containers, lore stones, terminals and the relic strongbox out of the 5.5-tile arena (now 3–12 solids within 3.5 tiles), or make the strongbox the boss's drop.
6. **End chop dominance.** Chop stamina 22 → 30 (or a 0.6 s regen delay after a chop), or light combo stamina 9/9/14 → 7/7/12 and finisher 24 → 28. Target over 20 s: paced combo ≥ chop DPS; chop about 0.85× the combo but staggering.
7. **The riposte must land.**
   - `ExploreEnemy.deflected` melee kb 5 → 0, or pull the attacker to 1.0 tile.
   - The riposte swing gets +0.5 range and +1.5 lunge.
   - Don't zero `riposteT` on a swing that hits nothing.
   - Riposte ×2.5 → ×3: 39 kills an N2 Feral, and riposte + slash (52) kills an N5 Feral.
8. **Perfect dodge for sidesteps too.** Count a perfect dodge when an attack commits (lunge contact, ring or lane commit) within 0.2 s after a roll started *from inside its hit zone*, even if the roll carried you out. Target: side-roll perfect window ≥ 120 ms (now ~50).
9. **Stalker readability.**
   - X-ray its ring through foliage, as `Fx.chargeLane` does, or draw it with `depthTest: false`.
   - Double the heave particles; make the `windup_stalker` cue louder.
   - Give it its own silhouette, not a re-tinted Crawler.
10. **Bloater:**
    - any chop hit launches it, at any HP (`Bloater.hit`: `src === 'chop'` → launch), or drop its HP from 50 to 36;
    - add a one-time tip: "Bloater: chop it away or throw from range".
11. **Make splats happen.**
    - `SPLAT.speed` 4 → 3, and let a finisher's knockback qualify;
    - a Razorback charging into a trunk takes the splat bonus and stun;
    - target ≥ 1 splat per 3 fights in tree cover (now 0 in 3 treks).
12. **Small integration fixes:**
    - keep `turnAccel` for 0.12 s after a reversal (180° ≤ 110 ms, now 162);
    - set the Warden beam's `hitT` on a dodged hit too, so DODGED doesn't spam;
    - place PARRIED on the enemy, not over DEFLECT;
    - throw: F within 0.25 s of a throw doesn't recall;
    - thrown blade uses `meleeMult`;
    - Serrated Edge bleeds bosses (or the card says it doesn't);
    - rename the Lifeline Idol's "SECOND WIND" text;
    - no "SHIELDED" label during the roar;
    - hack-through switches to a chop on brambles.

## Verdict

Round 2 fixed the fundamentals I attacked in round 1:
- lunges intercept walkers;
- creatures hold flanks instead of standing in you;
- Ferals are free;
- cutting flows;
- rolls are buffered.

The deflect is honestly good: a fair 140 ms window on a consistent cue, a riposte that halves fight time, and one boss (the Pack Lord) that it truly answers.

Day combat is now a 6, not a 4. The weak spot moved to the new headline content. Four of the five area bosses are stationary turrets running cooldown timers in cluttered arenas, and their difficulty ranges from a 40-second Warden to a Thorn Mother whose 1.0-tile telegraph hides a 1.9-tile cloud and has not been beaten once in seven tries. Under everything, holding RMB is still the best attack in the game.

Fix the Thorn Mother's truthfulness and the lairs, give the bosses patterns and punish windows, and rebalance the chop. Then this jungle fights like a good indie.
