# Verdant Relay: Critic I (combat, movement and game feel in the day jungle)

**Session:** 2026-10-13, frozen build at `http://localhost:5191`, my own headless Chrome at 1280×720 (640×360 view ×2, ~200–240 fps).
Screenshots, logs and scripts are in `.playwright-mcp/roundI/` (`I01`–`I44`, `log_*.txt`, `*.mjs`).

**How it was played (all with real Playwright keyboard and mouse input)**

- `t1_basics.mjs` / `t11_slashlat.mjs`: input latency, acceleration, turning, roll, combo and chop timing, measured per frame by an in-page `requestAnimationFrame` recorder keyed to the real `keydown`/`mousedown` events.
- `fighter.mjs`: a real-input fighter with three profiles:
  - **skilled:** reads telegraphs only after a 0.22 s human reaction delay (0.35 s on night 6), walks or rolls out, chops staggered targets, manages stamina;
  - **masher:** walks in and clicks, never rolls;
  - **kite:** walks in circles and never attacks.
- `arena.mjs`: **60+ fights** on nights 1, 2, 5 and 6, open ground and ferns, solo and mixed packs, the elite Razorback, Spitters.
- `t5_scen.mjs`:
  - an ambush right after cutting;
  - fern fights;
  - a 50 s dusk at night 1 and night 4;
  - the real *Clear the Blockage* elite on nights 3 and 5;
  - a spore-pod fight.
- `t9_trek.mjs`: **8 real day treks** (nights 1–6, all five areas) along a cheapest path, cutting brush with real clicks and right-mouse chops and fighting with the fighter.
- `t4/t6/t7/t8/t12/t14`: AI observation (standing still vs kiting), pathing and stuck tests, a spawn audit over whole worlds, combo connect and HP breakpoints, trunk sliding, and what waiting enemies do.
- **Console:** 0 errors, 0 warnings.
- **Instrumentation:** in-page probes only (hurt log, state reads). No repo files were touched.

---

## 0. Headline

The machete feels good in the hand:
- the first frame responds;
- the blade connects in 83 ms;
- hit-stop, a white flash, a smear, debris, numbers and knockback all fire;
- the roll now *reads* as a roll.

The fights around it are shallow:

- **Walking beats every melee enemy.** Melee lunges lock their landing point at the *start* of the wind-up and never lead their target, and everything is slower than you (5.6 t/s vs ≤ 4.2). A night-5 pack of 7 dealt **69 HP in 12 s** to a player standing still and **6 HP** to one who just walked in circles, never attacking or rolling (`log_obs5.txt`).
- **Mashing is almost safe.** A masher who never dodges took **0 damage in all 7 night-1 fights** and 0–50 HP per night-5 fight. A skilled player loses about 0–13 HP per fight, even on night 6.
- **The friction is somewhere else:**
  - stamina exhaustion (40–75% of every longer fight);
  - cutting brush at a crawl;
  - enemies stacking on top of you, so you can't see yourself;
  - Ferals frozen inside thickets.

---

## 1. Critic G's combat and feel items: did they land?

| G item | Verdict | Evidence |
|---|---|---|
| #4 Roll doesn't read as a roll | **Fixed** | A real tumble with backpack-over-head frames and a dust puff (`I01_roll_strip.png`). |
| #3 Day burst damage (60 HP in 6 s) | **Fixed, and overshot** | Attack tokens plus the 1 s after-hit pause: night 2, Feral + 2 Crawlers vs a still player = 58 HP / 12 s (DESIGN says ~30 per 6 s, which matches). Moving cuts that to 9 HP. |
| #5 Razorback lane too faint | **Fixed** | A bold banded rectangle with chevrons, drawn as wide as the hit (`I35_lane_full.png`). The best telegraph in the game. |
| #6 Stacked-enemy clarity / Skitter mush | **Not fixed** | Two Skitters merge into one white flash blob with overlapping "13"s, HP bars, and the player's cyan dither printed over the Skitter in front (`I33_skitters_grid.png`). |
| "Razorback stands on the player" (G bug 8) | **Not fixed, and now general** | Four Ferals stand *inside* the player's sprite (`I44_circling.png`), Ferals stand on the corpse (`I36_death_b.png`), and the elite does too (`I1e5m_grid.png`, frame 6). |
| Chop crescent too lemon | **Fixed** | Gold with a dithered orange tail (`I41_freeze_grid.png`). |
| Spitters in thicket never fire | **Fixed** | `lobOverBrush`. Spitters hit from inside brush (`log_trek_g3m.txt`: 40 Spitter damage). |

---

## 2. Responsiveness (measured, 1 frame ≈ 4 ms at the test rate)

| Action | Result | Verdict |
|---|---|---|
| `keydown` D → first motion | +5.9 ms (2 frames); 1 px of motion at 34 ms; full speed at **113 ms** | Good start. |
| Release → stop | 123 ms, **0.34-tile slide** | Slightly floaty. |
| 180° turn (D → A) | velocity < 0 after 115 ms, full reverse at **232 ms** | **Sluggish for dodging.** Hades and HLD reverse in 1–3 frames. |
| Click → swing pose | same frame (2–3 ms) | Excellent. |
| Click → blade connects (smear + hit) | 83 ms of sim time (`t11`) | Good (Hades ≈ 50–80 ms). |
| Light swing | 0.30 s (finisher 0.44 s); move speed ×0.3 while swinging; roll-cancel from hit + 0.05 s | Fair commitment. |
| 6 mashed clicks at 90 ms | 3 swings (one buffered input) | Correct: no input soup. |
| Space → roll | same frame; **340 ms, 3.04 tiles**, i-frames 280 ms | Good shape. |
| 7 Space presses, 380 ms apart | **only 3 rolls** | **Roll inputs are silently eaten** during the roll and the 0.12 s cooldown. There's no buffer and no feedback. |
| Hold right mouse → chop | charge 0.42 s; press → free = **969 ms** | Heavy but honest. A tap gives a light slash (nice). |

**Verdict:**
- The attack side is crisp.
- Movement has two soft spots:
  - the 232 ms turnaround (`CONFIG.player.accel` = 48 is used for both acceleration and reversing);
  - the unbuffered roll, which is the one input that *must* never be lost in an action game.

---

## 3. Movement, collision and cutting

- **Speeds:**
  - Ferns: 2.26 t/s, measured (×0.5 as designed).
  - A roll in ferns covers 2.0 tiles instead of 3.0 (`t3`).
  - Deep water reads as a darker channel with a pale lip (`I20_trek_grid.png`), and my path-follower recognised it once taught to.
- **Trunks stop you dead.** Walking straight at a trunk from 1.6 tiles (`t12_slide.mjs`):

  | Obstacle | Lateral offset from the trunk's centre | Result |
  |---|---|---|
  | Kapok, Fig, boulder | 0, 0.1, 0.2 and 0.35 tiles | **Dead stop, no sideways drift** |
  | Palm | 0 tiles | Dead stop |
  | Palm | 0.1 tiles | Passes, with a 225 ms penalty |

  Rounded boxes help only at the very corners. In a jungle that is about one trunk per 2.6 tiles, this is constant friction. Zelda and Hades both nudge you around corners.
- **Cutting is a crawl, and it costs your combat stamina.** Mashing LMB while holding a direction into a thicket and bramble wall (`t3`, first run):
  - **1.87 tiles/s**: 76 swings and 59 tiles cut in 12 s;
  - stamina hit 0 and stayed in the *exhausted* state for **6.2 of 12 s**.

  The causes:
  1. Every swing slows you to ×0.3, even when it only hits plants (`Player.js:193`).
  2. Every swing costs 9–14 stamina, even on plants (`startSwing → _spend`).
  3. Exhausted regen is ×0.6 until 35%.

  The debris, the "cut" noise and the 1-pixel whiff kick are pleasant. The *verb* is tedious: you stop, flail, wait for stamina, step, flail.
- **Cutting is loud, and stamina is shared.** After 6 s of cutting I was exhausted (stamina 0, 34 tiles cut). A Feral + 2 Crawlers then arrived, and wildlife drawn by the noise joined in. The fight lasted 30 s with **15 s spent exhausted** (`log_amb3s.txt`). That tension *could* be good, but at the moment it mostly reads as "my sword is tired from gardening".

---

## 4. The kit: combo, chop, roll, stamina

**Combo (13 / 13 / 24)**
- It connects reliably. The knockback (about 1 tile per light hit) is matched by your lunge, so all 3 hits land on a Feral or Razorback at distance 1.0–1.7 (`t8`).
- It outranges every melee enemy:
  - swing reach 1.5 + enemy radius ≈ 1.8–1.9 tiles;
  - Crawler reach 1.3, Feral 1.7, Skitter 1.1.

  Lone enemies walk into the blade before they can wind up. Every one-on-one duel on night 2 ended in **1.1–1.6 s with 0 damage taken**, and on night 1 even the masher came out of all 7 fights unhurt (`log_n1_*.txt`).

**Heavy chop (40, 165°, stagger 0.9 s)**
- It beats the combo on every axis:
  - damage per stamina: 1.82 vs 1.56;
  - it staggers;
  - its arc is wider.
- On non-elites the 0.9 s stagger nearly chains into the next chop: 0.92 s cycle against 0.9 s of stun. A Feral got **1 wind-up** in 2 chops (`t8`).
- Elites shrug it off (×0.35), which is correct: the elite got 6 wind-ups in 8 chops.

**Roll**
- Its i-frames barely matter. In the skilled profile's fights, i-frame "saves" were 0–1 per fight. Rolls worked as fast *walk-outs*, because walking out of a telegraph already works.
- `Player.hurt` calls `scene.onPerfectDodge?.()`, but **nothing implements it** (grep: only the call site). A dodge is never rewarded.

**Stamina: a chore**
- Share of fight time spent *exhausted* (swings ×1.35 slower, damage ×0.7, regen ×0.6, rolls need ≥ 11 stamina):

  | Scenario | Time exhausted |
  |---|---|
  | Night 4 trek | 47 of 74 s |
  | Night 6, 2 Razorbacks + 2 Ferals | 33 of 45 s |
  | Night 6, 7-pack | 15.5 of 19 s |
  | Masher vs the night 5 elite | 16 of 27.7 s (died) |

- Stamina gates attack, defence *and* gardening, and the penalty state lasts at least ~2 s. So the most common feeling is *waiting*, not managing a resource.
- Souls games make stamina a choice. Here it's a timeout.

**Healing**
- Q heals 25 instantly, with no animation and a 0.6 s cooldown, usable mid-swing or mid-roll. There's no risk, so there's no decision: you just press Q when low.

**Death**
- There's no death animation: the `hurt` frame is held (`Player.js:378`).
- The slow-mo plays at 0.35 while Ferals stand *inside* your body (`I36_death_a/b.png`). It's an anticlimax next to the good kill beats you give enemies.

---

## 5. Enemy AI and variety

**Variety**
- 3 of the 5 creatures run the same code path: Crawler, Skitter and Feral are all `attack: 'melee'` (wind-up, then a lunge to a locked ring), with different numbers.
- DESIGN's "spear thrust" Feral is the same lunge as the Crawler.
- Only two enemies ask for a different answer:
  - **Razorback:** a lane you sidestep, and charging into a tree stuns it for 0.9 s, which is a real bait-and-punish;
  - **Spitter:** keep moving.
- Fights never ask for a different *tactic*. "Click, step aside" handles everything except the elite for mashers.

**Telegraphs are honest but trivial to beat by moving**
- The landing ring is fixed when the wind-up *starts* (`_startWindup`: `lungeTarget` computed once). It ignores the player's velocity. The lunge then travels to that spot even if knocked back.
- Moving at 5.6 t/s takes you out of a 0.8-tile ring in about 0.15 s.

| Kite test (walk in circles, no attacks, no rolls) | Standing still | Kiting |
|---|---|---|
| Night 2: Feral + 2 Crawlers | 58 HP / 12 s | **9 HP** |
| Night 5: 3 Ferals + 2 Crawlers + 2 Skitters | 69 HP | **6 HP** |
| Night 5: 2 Razorbacks + 2 Crawlers | 96 HP | **32 HP** |

**Stacking**
- With no input at all, four night-3 Ferals ended up at **0.65–0.84 tiles** from the player's centre, inside the sprite (`I44_circling.png`, `t14`).
- Why:
  - `_circle()` only runs when *all tokens are taken* (`ExploreEnemy.js:256`);
  - an enemy on cooldown or waiting out the 0.2 s grant gap walks straight in with `_pathTo`;
  - `CROWD.playerGap` = 0.95 × the summed radii lets it stand 0.65 tiles away.
- In the night-5 observation, 3–4 creatures were within 1.3 tiles at once (`log_obs5.txt`).

**Orbiting packs feel passive**
- Of a night-5 pack of 7, an average of **4.7 were "waiting"** at any moment (`log_obs5.txt`).
- Within 2.1 tiles, waiting enemies *back away* from you (`_circle`: `radial = -1`) at ×0.55 speed, so you chase slow, retreating targets.
- Nobody flanks. Circling is random left/right.

**Ferals are statues in the brush (bug)**
- `_chunkPop` places spawns with `blockedAt(tx, tz, true)`, which ignores brush, but Ferals can't move through it.
- Whole-world audit (`t7_spawncheck.mjs`):

  | World | Ferals spawned in solid thicket/bramble | Fully boxed in |
  |---|---|---|
  | Residential, night 3 | 65 / 137 (47%) | 14 |
  | Market, night 2 | 35 / 94 | 16 |
  | Data Center, night 5 | 70 / 161 | 26 |

- Pathing:
  - Ferals outside a brush pocket stood 3.6–8.7 tiles away for 8 s with **0 wind-ups** (`I09_pocket_feral.png`: two red silhouettes frozen in the thicket).
  - In treks, the fighter met **unreachable alerted Ferals 10 times** (night 1 Flooded: 6 × 25 s stalemates; night 6: 4×; `log_trek_f1m.txt`, `log_trek_d6s.txt`).
  - Behind a ruin wall, Ferals pathed round on one seed and froze at 4.3 tiles on another (`log` of `t6`).

**Elite Razorback**
- The one fight that punishes mashing:
  - night 5: the masher took 50 HP;
  - night 5 real objective: masher **died** (90 Razorback damage, exhausted 16 s);
  - night 6: 78 HP;
  - skilled player: 0 HP every time.
- It's the same charge with ×1.35 wind-up and more HP. With 1:1 sprites, it reads as "a pink Razorback with an amber ring" (`I1e5m_grid.png`, frame 3). It isn't a boss beat.

**Dusk hunters**
- They aren't a threat:
  - night 1: skilled player 0 HP lost in 50 s, 7 kills;
  - night 4: 0 HP, 9 kills (`log_dusk*.txt`).
- Sight stays readable at 72% dusk (`I1d4s_grid.png`).
- "The jungle hunts you" plays as a trickle of Skitters to farm.

---

## 6. Feedback and juice

**Good**
- Melee hit-stop scaled by step: 45 / 45 / 60 ms; chop 80 ms; kill 70–100 ms; gap rule against stutter.
- A full-sprite white flash and an impact spark on the struck side.
- Knockback with a hit stun.
- A 2–5-pixel camera kick along the blow.
- Leaf, stem and thorn debris per brush type, and a ground crack on a chop.
- A gold chop crescent.
- Merged damage numbers.
- The "!" bang plus the red-eye glint.
- A strong kill beat: squash, pop, a slide along the hit and a decal.

**Problems**
1. **Silhouette mush in melee range.** Occlusion silhouettes draw wherever *any* card is in front, including the player.
   - An enemy right behind you prints its red dither *over your body* (`I31_crawler_windup_grid.png`, `I41_freeze_grid.png` frame 1).
   - Your cyan dither prints over a Skitter in front of you (`I33_skitters_grid.png`).
   - In the place where melee happens, you can't tell which pixels are you.
2. **The wind-up body tell is weak.** It's ±1 px of jitter plus a 0.14 s glint. The telegraph ring often sits *under the player's own sprite* (a Feral lunge target is your position), so it's covered (`I30_feral_windup_grid.png`).
3. **Red everywhere.** The always-on hostile ring (`JUICE.hostileRing #ff2e2e`) is the same hue and shape as the dithered wind-up ring, so the telegraph doesn't pop.
4. **Audio (inferred from `Sfx.js`):**
   - the only per-enemy wind-up sounds are a 1.7 kHz `glint` at vol 0.05 and the Razorback `snort`;
   - enemy hits layer a chiptune square blip (`hit`) over noise foley (`flesh`);
   - there are no aggro barks.

   In a jungle where things come out of the brush, ears should warn before eyes do.
5. **No death animation** (§4).

---

## 7. Fairness

**Good**
- Telegraphs match their hit areas: the lunge ring, the lane width (`hitW`) and the lob ring.
- Spore pods telegraph for 0.7 s.
- **0 of about 70 logged hits came from an off-screen enemy.**
- I never "died to something I couldn't see".

**The unfairness that remains is readability**
- stacking, and silhouettes over the player (§5, §6);
- the Skitter's 0.35 s wind-up, which is under a human's reaction plus a roll's startup (only 6 damage, so tolerable).

**Breakpoints are sloppy**
- Light slash = 13.

| Night | Skitter HP | Crawler HP |
|---|---|---|
| 1 | 14 | 26 |
| 2 | 15 | 28 |
| 3 | 16 | 30 |

- A slash leaves Skitters on nights 1–3 at **1–3 HP**, so the weakest enemy always needs 2 hits.
- The night-2 Crawler survives two slashes on 2 HP (`t8`).
- A finisher-only kill at a 2 HP margin feels like a whiff, not a plan.

---

## 8. Difficulty snapshot (real input)

| Fights | Masher (never rolls) | Skilled (0.22 s reaction) |
|---|---|---|
| Night 1, 7 scenarios incl. Razorback + 2 Crawlers, Spitter + 2 Ferals | **0 HP in all 7** | 0 HP |
| Night 5, 9 scenarios incl. elite + 2 Crawlers, a 6-pack | 0–50 HP each (elite 50) | 13 HP total |
| Night 6, 4 packs (7-pack, 2 Razorbacks + 2 Ferals, 2 Spitters + 4, elite + 2) | 26 / 57 / 21 / 78 | 11 / 0 / 13 / 0 (0.35 s reaction) |
| Real treks to the goal (50–73 m) | night 5: −57 HP in 27 s; night 3 Greenhouse: **died** at 48 s (Razorback 48, Spitter globs 40, Feral 12) | night 2: −10 HP; night 4: −46 HP in 74 s, 17 kills |

**Reading:**
- A masher survives about two fights before needing a med kit.
- Anyone who keeps moving is close to untouchable.
- There's almost no skill *ceiling*: nothing rewards the timing of the roll, and no enemy punishes walking.

---

## 9. New combat content that would add depth (exact numbers)

**A. Deflect (parry and riposte), on the existing right mouse button**
- The first **0.14 s** of a chop charge is a deflect window against attacks from the front 180°.
- **Melee lunge:** no damage, a 0.09 s hit-stop, a white ring and a "clang". The attacker is stunned **1.0 s** (elite 0.4 s). Your next light slash within 1.0 s does ×2.5 (13 → 33) and always staggers. You get +15 stamina back.
- **Spitter glob:** batted back at the Spitter for 25 damage.
- **Razorback charge:** you sidestep 0.6 tiles, and the boar takes 15 damage and a 0.8 s stun.
- Missing costs nothing beyond committing to a charge. A 0.5 s lockout stops tap-spam.
- This finally makes reading the wind-up *pay*.

**B. Environmental kills**
- **Spore clouds hurt creatures too:**
  - 6 damage per 0.6 s;
  - "choking": ×0.6 speed, no new wind-ups;
  - Ferals, Crawlers and Razorbacks walking within 1.3 tiles set pods off;
  - a heavy chop on a pod launches it 3.5 tiles along your aim, where it bursts after 0.5 s.
- **Wall splat:** a creature knocked back at ≥ 4 t/s into a trunk, rock or ruin takes +10 damage and a 0.5 s stun. Into a bramble it takes +14 damage, a 0.6 s stun, and the bramble is nicked. (Today a finisher knocks a Crawler about 2 tiles, so this would fire often.)
- **A Razorback charge** through a pod pops it.
- The Greenhouse becomes a playground instead of a tax.

**C. Feral spear throw (fixes the stalemate and adds a second Feral move)**
- When a Feral has line of sight but no walkable path for 1.2 s, or you're more than 4 tiles away inside brush, it throws a spear.
- It reuses the existing `ranged` line telegraph: 0.9 s wind-up, 0.3-tile-wide line, 11 t/s, 14 damage (night 3, scaled by `enemyDamage`), range 7, cooldown 3.5 s.
- Up close it keeps the lunge, but adds a **2-thrust** variant: a second lunge 0.35 s after the first, at 60% damage.

**D. Thorn Stalker (new creature, night 3+)**
- 40 HP, found only in fern-heavy chunks.
- It travels *under* ferns (only rustle particles and a soft "chk-chk" show), then surfaces under you with a 0.7 s ring telegraph (radius 1.0).
- It erupts for 16 damage plus a 0.6 s root (a roll breaks the root). It's exposed for 1.5 s afterwards.
- It teaches "listen, and stay out of the ferns", which ties fights to the brush you cut.

**E. Ranged secondary: machete throw (F)**
- 0.25 s wind-up.
- It flies 6 tiles at 16 t/s, does 18 piercing damage, cuts thicket (not bramble) along its line, and returns over 0.4 s (9 damage on the return).
- While the machete is out, left mouse is a shove: 4 damage, knockback 6.
- Costs 25 stamina, 3 s cooldown.
- It answers Spitters in thickets, sets up wall splats, and makes cutting expressive.

**F. Status effects**
- **Sap puddles** (the existing 2.5 s glob decal): ×0.6 speed, and rolling out costs +10 stamina.
- **Bramble Crawler bites:** Bleed, 2 damage/s for 3 s, cleared by a roll.

---

## Scores (1–10, against Hades, Hyper Light Drifter, Death's Door, Tunic, Enter the Gungeon)

| Axis | Score | Why |
|---|---|---|
| **Responsiveness** | **7** | 1-frame start, 83 ms blade, honest buffering on swings. Held back by the 232 ms turnaround, the 0.34-tile stop slide and roll presses being dropped. |
| **Combat depth** | **4** | Walking defeats every melee attack. The chop dominates the combo. The roll's i-frames rarely matter (no perfect-dodge reward). There's no parry, no ranged option and no environment. Stamina turns long fights into waiting. |
| **Enemy AI / variety** | **4** | 3 of 5 enemies are the same lunge. Packs orbit passively and then stack *inside* you. 37–47% of Ferals spawn frozen in thickets, plus no-path stalemates. The Razorback is the one creature with personality. |
| **Feedback / juice** | **7** | Hit-stop, flash, smear, debris, kill pops and the lane are all strong. Lost points for silhouettes painted over the player, the weak wind-up body tell, red-on-red rings, no death animation, and thin enemy audio. |
| **Fairness** | **7** | Telegraphs match hits, 0 off-screen hits, pods telegraphed. Dinged by melee-range readability and the 1–3 HP breakpoints. |
| **Traversal / cutting** | **5** | Ferns, fords and deep water read well. But you stop dead on trunks at offsets up to 0.35 tiles, and cutting crawls at 1.9 t/s while draining combat stamina (50% exhausted). |

---

## TOP 12 (ranked by impact on how the game feels)

1. **Make melee threaten a moving player** (`ExploreEnemy._startWindup` / the `windup` state).
   - Melee lunges should track for the first **60%** of the wind-up and lock at 60%, aiming at `player.pos + player.vel × 0.2 s`.
   - Lunge reach: Feral 2.3 → **2.8**, Crawler 2.0 → **2.4**.
   - Keep the ring honest: redraw it while tracking, freeze it at the lock.
   - Target: kiting vs the night-5 7-pack ≥ 35 HP / 12 s (now 6). Standing still stays about 70. The roll, not walking, becomes the answer.
2. **Stop the stacking** (`ExploreEnemy` chase, `CROWD`).
   - Run `_circle()` whenever `cd > 0.3` or no token is held, not only when every token is taken.
   - Change `CROWD.playerGap` 0.95 → **1.45**.
   - After a lunge, `_recover` hops back 0.7 tiles over 0.2 s.
   - Waiting enemies take positions on your flanks and back (an angle 120–210° off your aim) instead of backing away.
   - Target: at most 1 creature within 1.3 tiles at a time (now 3–4; `I44_circling.png`).
3. **Never paint silhouettes over the player** (`src/core/Assets.js` silhouette material).
   - Enemy silhouettes stencil-test against `CARD_MASK_REF`, so they skip the player's masked texels.
   - The player's own x-ray over creature sprites becomes outline-only, with a 0% fill.
   - Fixes `I31`, `I33` and `I41` frame 1.
4. **Stamina and cutting rework** (`Player.startSwing`, `STAMINA`).
   - A swing that hits no creature, nest or pod costs **2** stamina (finisher 3) and leaves you at ×0.75 speed instead of ×0.3.
   - Holding left mouse while moving auto-cuts every 0.28 s ("hack-through").
   - `exhaustedRegen` 0.6 → **1.0**, `delay` 0.5 → 0.35, roll 22 → 20.
   - Targets: ≤ 20% of fight time exhausted (now 40–75%); thicket cutting ≥ 3.2 t/s (now 1.87).
5. **Ferals: no spawns in brush, and a no-path fallback.**
   - In `_chunkPop` `spot()`, use `blockedAt(tx, tz, false)` and require 3 free neighbours for creatures without `brush: 'through' | 'crash'` (target 0% boxed; now 10–16%).
   - If `flowDir` gives no progress for 1.5 s: spear throw (§9C), or hack one brush tile every 0.8 s toward you.
6. **NEW: Deflect / riposte** on the first 0.14 s of right mouse (§9A).
7. **Roll and turn feel.**
   - Buffer Space for 0.15 s: during the last 0.15 s of a roll, during `rollCd`, and during the pre-hit part of a chop.
   - When the input opposes your velocity (dot < 0), accelerate at **110 t/s²** (a 180° turn in ~100 ms).
   - Implement `onPerfectDodge`: an i-frame save within the roll's first 0.15 s refunds 15 stamina, gives 0.2 s of slow-mo at ×0.4 and a cyan rim flash. Once per roll.
8. **NEW: Environmental kills**: spore clouds hurt and choke creatures, chop-launched pods, wall splats into trunks and brambles (§9B).
9. **NEW: Enemy behaviours**: Feral spear throw and double thrust (§9C), Thorn Stalker ambusher (§9D), Skitters that flank from your back arc with a 0.15 s "chitter" cue before their 0.35 s wind-up.
10. **Corner nudge** (`JungleWorld.moveBody`).
    - When you're blocked by a footprint and the input is within 35° of the surface normal, steer sideways toward the nearer edge if it's within **0.45 tiles** (up to 0.6 × speed).
    - The same with a 12-pixel tolerance on brush tile corners.
    - Kapok, Fig and boulder head-ons currently stop dead (`t12`).
11. **NEW: Machete throw (F) and status effects** (§9E–F): a ranged answer to Spitters in brush, sap-puddle slow, Crawler bleed.
12. **Breakpoints, the elite and the death beat.**
    - Breakpoints: Skitter base HP 16 → **13** (one slash on nights 1–3, two from night 4); Crawler 30 → **26** (two slashes through night 3).
    - The elite gets its own larger native sprite (PixelLab at about 1.5× size, plates and tusks; no scaling) and a second move: a double charge with a 0.5 s re-aim, plus a 1.6-tile stomp ring.
    - The player gets a 5-frame collapse, 0.5 s of ×0.25 slow-mo, and nearby creatures step back 1.5 tiles.
    - Audio: per-type wind-up sounds; raise `glint` to vol 0.12; replace the square `hit` blip with noise foley.
    - Dim the always-on hostile ring to dark red at 60%, so the wind-up ring pops.

---

## Verdict

Verdant Relay's machete has the bones of good game feel:
- instant response;
- a crisp 83 ms blade;
- layered hit feedback;
- a great Razorback lane;
- telegraphs that never lie.

The combat built on it is a solved puzzle. Walking beats every lunge, the chop out-trades the combo, packs orbit and then pile into your sprite, a third of the Ferals are stuck statues in the brush, and stamina makes long fights and all cutting a waiting game.

Fix the stacking and the silhouettes so melee range is readable. Make lunges track so the roll matters. Rebuild stamina so cutting is a flowing verb. Then add one or two real decisions: deflect, environmental kills, a Feral that throws. With those, this jumps from a 4–5 to a 7 on depth. Right now the jungle looks dangerous, and the numbers say it isn't.
