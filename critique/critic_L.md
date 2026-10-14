# Verdant Relay: Critic L (the first hour as a picky Steam/itch player, plus UX and audio)

**Session:** 2026-10-13. Frozen build at `http://localhost:5191`.

**Setup:**
- My own headless Chrome, driven by a persistent driver (`.playwright-mcp/roundL/driver.mjs`).
- A fresh browser profile with empty localStorage, starting at the title screen.
- 1280×720 by default. Checks at 1920×1080, 1366×768, 1024×600 and 800×1000.
- Screenshots: `.playwright-mcp/roundL/L01`–`L160`; `*z_*` files are zoom crops.

**Inputs:**
- **Real keyboard and mouse:**
  - every menu, the briefing, the summary, every build, upgrade and repair;
  - all wave controls;
  - the whole guided day 1 (WASD, slash clicks, E holds);
  - every E-hold, the med kit, Tab and Esc.
- **Long walks:** used an in-page pathing bot. It is critic G's `bot.js`, copied to `roundL/bot.js` with one change so it avoids deep water.
- **Fights during walks:** handed to a real-input fighter (`ctx.fight` in `roundL/trek.js`) that aims with the mouse, clicks LMB, and presses Space to roll on wind-ups.
- That fighter is an average-to-poor player: it never chops, and it doesn't push through ferns to reach a rooted Spitter. Read the day deaths with that in mind. The night results don't depend on it.

**Console:** 0 errors and 0 warnings over everything: two full runs, a reload, resizes, 3 browser contexts.

## Run log

| Run / day | Area, goal | Outcome | Banked | Night |
|---|---|---|---|---|
| R1 D1 (guided) | Market, *Salvage a power cell* (51 m) | Coach 1/5 → 5/5. Goal done at t≈204 s. Home at t≈240 s, 92 HP | **9 S**, 1 B, 2 I | 1 turret + 1 snare, "Risky". Relay **100 → 76** |
| R1 D2 | Data Center, *Fix the power box* (fuse, then box 40 m away) | Fuse done. **Died at t=114 s** to a Razorback + Feral + Crawler + Skitters, 23 m short of the box | 31 carried → **20 salvaged** | 2 towers, 26 S, "Too weak" → repaired. Relay **91 → 8** |
| R1 D3 | Greenhouse, *Download route data* (66 m, across a river) | Started at 60 HP. **Died at t=186 s** at the ford, 32 m short | **12 salvaged** | 2 towers, 16 S, 33 enemies. **Relay fell** (2/6, 29 kills, +66 Research) |
| R2 D1 | Residential, *Kill the Razorback* (57 m) | Razorback killed (3 × 18 damage taken). 5 containers looted. Home at 28 HP | 22 S + 25 bonus, 1 B, 1 I | 3 towers, "Looks strong". Relay **100 → 100** |
| R2 D2 | Flooded, *Salvage a power cell* (69 m) | 4 Feral hits of 10 each in 4.8 s, med kit used, beacon switched on, went home from it at 22 HP | 32 S, 1 B | 4 towers, "Looks strong". Relay **100 → 97** |
| R2 D3 | Market, *Salvage a power cell* | **Started at 47 HP. Died at t=19.6 s, 25 m from the Relay**, to two Spitters (8 globs of 9 damage) | **12 salvaged** | 5 level-1 towers, readiness **"Risky: the Relay may take some damage"**. Relay **97 → 0, fell** |

Both runs died on **night 3**, and so did the newcomer critic's run. Real time was about 20 minutes per run, so the first hour is three runs that all end at the same wall.

---

# Part 1: Steam review

> **👎 Not Recommended** · 1.1 hrs on record
>
> I wanted to love this, and for the first 15 minutes I did. The title screen is gorgeous: a slow drift over a pixel jungle
> with a glowing blue relay. The pitch is one line ("Scavenge by day. Hold the line by night.") and you're playing within
> ten seconds of clicking the link. It loaded in about a second. The first day holds your hand just enough: move, cut a
> plant, go to the goal, come home. The art is honestly top-tier. The big boar, the carnivorous spitting plant, the
> overgrown train car, the way the jungle goes see-through around you. And the first tower-defense night clicks
> instantly: dirt paths, stone pads, build, start.
>
> Then the game starts lying to me a little:
> - My first trip gave me **9 Scrap**. The game told me Scrap builds towers, then sent me into night 1 with two towers.
> - Day 2, I got jumped by a boar, a spear guy and two bugs at once and went down.
> - Day 3, I started at 60 health and died at a river crossing.
> - Night 3, my Relay died in under a minute.
>
> Fine, roguelite, run two. I bought the +20 Scrap unlock and played *well* this time: goals done, a beacon switched on,
> five towers, and the defense checker said "Looks strong" twice. The Relay sat at 97/100 going into night 3. Then:
> - I started day 3 at **47 health**, with no way to heal before heading out.
> - Two spitting plants 25 m from my base killed me in 20 seconds.
> - That night the checker said "**Risky: the Relay may take some damage**". I lost **all 97 HP**.
>
> Same wall, same night, twenty minutes later.
>
> Also: it's **silent** in the jungle. No birds, no insects, no footsteps, no rain. Just "pew" synth blips and a cheerful
> little major-key tune while I'm getting eaten in a "claustrophobic" rainforest. The machete swish is fine. The menu
> cursor makes the same sound as my dodge roll.
>
> What hooked me: the look, the day/night split, the "do I push for that last chest" tension, and the post-run nudge
> ("Your Research buys Field Kit…"). What made me quit: the night-3 cliff the game never warned me about, health that
> doesn't come back between days, and a soundscape that sounds like a 2014 game jam.
>
> I'll flip this to thumbs up if night 3 stops being a coin-flip and the jungle gets a soundtrack that sounds like a
> jungle. 6/10, follow-worthy.

---

# Part 2: UX audit

## 1. Were the last rounds' complaints fixed?

| Source | Complaint | Now | Evidence |
|---|---|---|---|
| G #7, newcomer | Night-banner click-through preselects a card | **Fixed.** I triple-clicked the banner and the briefing opened with nothing selected | `L48_brief2` |
| G #2 | Death spiral, need a salvage floor | **Fixed in data:** 20 / 20 / 12 floor (`L62_dead`: 22 lost, 20 salvaged). The night-3 cliff remains (§6) | |
| Newcomer #1 | Guided one-area day 1 | **Landed:** one pre-selected card, coach 1/5…5/5, gentle wildlife (2 Crawlers met) | `L05`, `L12_after` |
| Newcomer #3–5 | Jargon, zero currencies, Intel/Repair buttons | **Mostly fixed:** plain words, zero currencies hidden. Disrupt still shows (dashed) with 1 of 3 Intel | `L109_r2_prep` |
| Newcomer #6–7 | One objective sentence; "Head home" offered at spawn | **Fixed:** same sentence on card, banner, strip and summary. No home prompt at spawn | `L08`, `L34` |
| Newcomer #13 | Readiness check | **Landed but miscalibrated** (§6) | `L66_confirm`, `L134` |
| Newcomer #15 | Hints cover what they explain | **Fixed on the briefing** (`L151_brief_1080`). In prep, hints fire out of context (§4) | `L38_padsel` |

## 2. Onboarding: the guided day

**What works:**
- The coach line is short and numbered ("1/5 Move with W A S D").
- It advances on the real action, has timeouts so it never blocks, and points with a small direction arrow.
- One-off tips (enemy, out of stamina) replace the line for 5 s.
- Night-1 prep chains its hints in order of need: build → Intel → right panel → upgrade/sell.
- Nothing is patronising. This is the best first 5 minutes the game has had.

**Problems, by impact:**

1. **The guided day doesn't pay.**
   - It banked **9 Scrap** (`L34_summary`), against a design budget of 70–100 per day.
   - The coach sends you goal → home. The "open a crate" step pointed at a crate 13 m away that sat behind solid thicket with no trail (`L12_after`; brush map in session notes: `TTTT` all round). I couldn't reach it, and the step timed out after 40 s.
   - So the first night starts at 69 Scrap (one turret and one cheap tower), and the run is behind the balance curve from minute 4.
   - **Fix:**
     - In `_nearCrate` (JungleScene ~1885), only pick crates whose flow-field path length is ≤ 1.3 × the straight line and that sit within 2 tiles of a trail.
     - Place 3–4 trail-side crates on the guided route (`GUIDE.objectiveDist` site + `JungleGen` container pass).
     - Put an amber ◆ marker and a screen-edge arrow on the coached crate.
     - Target: the guided day banks **≥ 45 Scrap**.
2. **Half the verbs are never taught:**
   - the heavy chop (RMB);
   - the med kit (Q), which I only discovered from the pause-menu controls line;
   - the Tab map;
   - beacons, which I only learned about on day 2;
   - and the clock. "4:19" has no label or icon (`L104z_clock`), and nothing says what happens at 0:00.

   Roll is only taught inside the first-enemy tip, which shows for 5 s mid-fight. **Fix:** contextual one-off coach tips (`_coachTip`, guide.js):
   - the first wind-up within 4 m → "Space to roll *through* it";
   - the first bramble you bump → "hold RMB: heavy chop";
   - the first time HP is under 50% with a kit → "Q: med kit";
   - the first beacon within 10 m → "Beacons are a way home, hold E";
   - a sun-dial icon plus "Daylight" label on the clock, with a "sunset in 1:00" tip.
3. **The death modal has no keyboard.**
   - Enter, Space and Esc all do nothing on "You went down" (`L86_dead_esc`); only a mouse click on "Back to base" works.
   - Every other screen honours Enter.
   - **Fix:** in `ui.modal`, focus the primary button and bind Enter/Space/E to it (JungleScene ~1117).
4. **The summary repeats a tutorial line.** It ends every time with "+18 Research (kept forever: spend it on new gear in Collection, from the title screen)". That's fine once, nagging by day 3. **Fix:** show the parenthetical only while `meta.lifetime.runs === 0`.

## 3. Moment-to-moment clarity (jungle)

| Question | Verdict | Evidence / fix |
|---|---|---|
| **Where to go?** | **Good.** GOAL strip with distance and arrow, amber edge triangle, paused big map with legend | `L14_bigmap`, `L81_bigmap_river`. Gap: the goal arrow points straight across rivers. On R1D3 the goal was 38 m away across deep water, with the ford 10 m north and no cue (`L80_d3_obj`). **Fix:** when the straight line crosses deep water, draw the nearest ford as a pale ◇ on the minimap and add "cross at the stepping stones ↗" to the strip |
| **What's dangerous?** | **Better than G.** Hot-red silhouettes through foliage, Razorback lane with chevrons (`L60_box_fight2_1`) | The HUD fades when an enemy is under it, and that hid the minimap and clock right when two Spitters sat there (`L116z_mini`). Raise `hudFade.opacity` from 0.22 to 0.5 (config.js:240) |
| **What's cuttable?** | **Weak.** Fern / thicket / bramble read as one dark mass at 720p (`L12_after`) | Critic newcomer #11 is still open. **Fix:** a 1-texel hover outline on the brush tile under the cursor (amber = one slash, red-brown = chop), or a slight lift in value for thicket tops |
| **What am I carrying?** | **OK.** Icon + number top-left. Hidden while zero | Container hold prompts are clear ("Hold: Open Tool Chest 1.0s") |
| **How do I get home?** | **Good.** "Home N m" appears once relevant; cyan arrow; the beacon prompt says "(a way home)" | The beacon itself is a thin pole hidden under a canopy (`L122_pylon_on`). The banner said BEACON ON, but I couldn't see the object. Raise its glow disc above canopy cards |
| **How healthy am I?** | **Misleading.** At 28–38 HP the health bar turns **orange, the same colour as the stamina bar** right under it (`L104z_hud`, `L116_medkit`) | **Fix:** health goes green → yellow → red, never stamina orange (jungle.css `.x-hpbar`). Add a low-HP pulse at the screen edge below 30% |
| **"GOAL DONE" banner** | **Covers the player.** The banner and its 10 px subtitle sit at screen centre, right over the player (`L117_cache_open`, `L117z_sub`) | Move it to y ≈ 22% of the screen |

## 4. Menus

| Screen | Verdict | Problems → fixes |
|---|---|---|
| **Title** (`L01`, `L73`) | **8.** Strong art, hotkeys (N/K/O/C), Continue shows "Night 2 of 6 · Wave (restarts)", the records box only appears after a run, an affordable-unlock nudge | The arrow keycaps in "↑↓ choose" render as "+ +" in the pixel font (`L73z_keys`; same in the Collection footer). Draw them as sprite glyphs or write "Up/Down" |
| **Briefing** (`L48`, `L151`) | **7.** Three-line cards (Goal, Reward, Danger), Details on demand, pips with a ☠ final night, wave icons with tooltips | The right column "Tonight's attack" is about 70% empty at 1080p (`L151_brief_1080`). Put the per-path counts there, so the danger has numbers before you commit |
| **Summary** (`L34`, `L63`) | **7.** One card, ✓/✗ goal, skill pick with keys 1–3 and "Save point" (L) | The tutorial line repeats (§2). After a death it plays the `hurt` blip plus the cheerful day music |
| **Night prep** (`L42`, `L64`, `L109`) | **7.** Plain tower cards with pips, cost icons, "+5 Scrap: you own 1", repair only when damaged, readiness bar | 1. At 720p the build list doesn't fit: **Snare Vine (key 4) is below the fold** and Arc Spire's Range row is clipped (`L38_padsel`). Put the pips on one line, or cap the description at 1 line. 2. The "You found Intel…" hint fires while the build list is open (`L38_padsel`); queue hints until the panel is idle. 3. The "glowing squares" are grey slabs with a faint dashed edge (`L36z_pads`); pulse the empty pads at 0.5 Hz during the first prep |
| **Wave HUD** (`L45`, `L75`) | **7.** "N to go", per-path still-coming counts, pause and 1×/2× | **Space is overloaded.** On "Risky", Space starts the wave and a second Space *pauses* it (`L135_n3_mid`: I double-tapped and found the wave paused). On "Too weak", the first Space opens a confirm and the second starts. **Fix:** ignore Space-as-pause for 0.6 s after a wave starts, and make "Start anyway" need its button or Shift+Space |
| **Results** (`L90`, `L140`) | **8.** Count-up tiles, "★ Best run so far", "Your Research buys Field Kit… Get it in Collection ▸", Enter/K/Esc | Fine. Add one line on *why* you lost ("4 Razorbacks reached the Relay: 48 damage") to hand the player a goal for the next run |
| **Collection** (`L91`, `L92`, `L96`, `L97`) | **7.** Clear costs and "Need N more", a confirm modal with "6 left after", tabs 1/2/3 | Codex icons for the Crawler and Razorback are 9–12 px figures, unreadable (`L97z_icons`). Scale codex portraits up ×2 |
| **Settings** (`L142`) | **5.** SFX and Music sliders with %, shake, hints, reset hints, reset all with confirm, reachable from pause | No master volume, no mute key, no ambience/UI split, **no key rebinding**, no fullscreen toggle, no text-size or colour-blind option, no "pause when unfocused". "Picture size" is read-only text styled like a control |

## 5. Robustness and edge cases

| Test | Result |
|---|---|
| Load (fresh profile) | Load event at **1.18 s**, title interactive at **1.26 s**. 225 requests, **2.1 MB** transferred (JS 991 KB, `v2_player.png` 491 KB). Excellent |
| Console | **0 errors, 0 warnings** all session |
| Resize mid-wave 1280 → 1920×1080 → 1000×700 → back (`L68`, `L69`) | No break, HUD rescales. At 1080p the night map is **stretched ×1.5**, giving uneven pixel columns in dithers (`L68z_relay`). That breaks the pixel-exact rule at the most common monitor size |
| Resize in the jungle (1366, 1024×600, 800×1000) (`L154`–`L156`) | Integer scale holds. 1024×600 shows 16 tiles across instead of 20 (smaller field of view). Portrait at ×1 makes the UI text about 6 px, unreadable |
| Tab hidden (visibilitychange) in the jungle | **Pauses.** dayT frozen, pause menu shown (`L105_vis_pause`). Music suspends |
| Window blur (alt-tab to a second window, page still visible) | **Doesn't pause.** dayT went 98.8 → 100.3 in 1.5 s after a `blur`. Keys are cleared, so you stand still while enemies keep coming. **Fix:** pause on `blur` too (JungleScene ~157), and in defense auto-pause on hidden |
| Spam clicks | Triple-click on the night banner: no preselect ✓. Start Wave ×6 in 0.4 s: one start ✓. Double Space: pauses (see §4) |
| Esc everywhere | Settings, Collection, briefing, jungle, prep, wave, big map, confirm dialogs and Results all handle Esc ✓. **The death modal doesn't** ✗ |
| Quit mid-wave → Continue | Confirm says the wave restarts. Continue restored Relay 91 and both towers with a "Get ready… 2" beat (`L74_continue`) ✓ |
| Reload mid-day → Continue | Back to the briefing with the same choices; the day is lost (stated in the quit confirm) ✓. **Exploit:** quitting mid-day dodges death. At 13 HP you can quit and restart the day at your briefing HP with a fresh 300 s and no "went down" cost. **Fix:** a mid-day quit = "Abandon expedition" (same outcome as going down, with salvage) |
| New Run with a saved run | Confirm modal "Abandon saved run?" ✓ |

## 6. Difficulty and the "one more run" pull

**The hook in the first 5 minutes is real:**
- the pitch line;
- a goal 51 m away with a visible arrow;
- a crate, a fight, coming home, and a summary with a skill pick;
- night 1 a minute later.

The meta nudge on Results and the Title ("You can afford Field Kit") is the right idea, and 60 Research after run 1 bought a real unlock. **The pull dies on night 3**, for three measurable reasons:

1. **The night-3 cliff.**
   - Wave HP goes **1180 → 4080 (×3.46)** from N2 to N3, then only ×1.36 to N4 (`waves.js` header: `HEALTH_MULT = [1.0, 1.4, 2.3, …]`, 33–39 enemies, 4 Razorbacks, 5 Spitters).
   - The balance notes assume "~70–100 Scrap per expedition" and "6–7 defensive skills". A real first-hour player banks 9–47 per day and has 1–2 skills.
   - Both my runs fell on N3: one with Relay 8 → 0, the other **97 → 0 with 5 towers**.
   - **Fix:**
     - N3 `HEALTH_MULT` 2.3 → **1.8**, and trim N3 Crawler groups by about 25%. Target N3 total ≈ 2700 (×2.3 over N2).
     - Move the difference into N4 (HEALTH_MULT 2.05 → 2.3) so late nights are unchanged.
     - Re-run the balance sim with a **"newcomer" budget of 45 Scrap/day and 2 skills**. Acceptance: that profile ends N3 with ≥ 20 Relay HP using 4 level-1 towers.
2. **The readiness check under-rates tanks.**
   - "Risky: the Relay may take some damage" preceded a **97-HP loss** (`L133`/`L134` → `L139`).
   - `READINESS` compares total DPS × `waveSeconds[2]=50` against total HP. That ignores that Relay damage comes from tanks *leaking* (Razorback 12 each, Spitters lobbing).
   - **Fix (guide.js / `DefenseScene._readiness`):**
     - Add a leak term: if single-target DPS on a lane is less than the lane's tank HP divided by the tank's time in range, downgrade one step.
     - Recalibrate so 5 level-1 towers on N3 read **"Too weak"**.
     - Print a predicted range ("expect −40 to −100 Relay HP"), so the warning becomes a decision.
3. **Health between days is perverse.**
   - `nightlyHeal: 25` plus "you come back with 35 health" means dying leaves you healthier the next day than barely extracting:
     - R1, died: **60 HP** next day.
     - R2, extracted at 22: **47 HP** next day, then died in 20 s.
   - **Fix (config.js `expedition`):** dawn HP = max(hp + 25, **60**). Also offer a "Buy med kit: 15 Scrap" chip on the briefing when HP < 60.

**Smaller pull issues:**
- `FIRST_DAY.safeRadius` (26 m) only protects day 1. On day 3, two Spitters spawned within 25 m of the Relay (`L132_r2d3_obj`). Keep a 22 m safe ring every day.
- Results should name what killed the Relay (§4).

## 7. Audio, judged on paper (`Sfx.js`, `Music.js`, `data/music.js`)

**What exists:**
- 27 synthesized one-shots:
  - 16 oscillator blips (`shoot`, `hit`, `pickup`, `open`, `dodge`, `build`, `zap`, `boom`, `core`, `done`, `alarm`, `error`, …);
  - 11 band-passed noise sounds for melee (`slash`, `chop`, `cut`, `rustle`, `flesh`, `kill`, `crack`, `snort`, `spit`, `splat`, `glint`).
- 6 procedural music moods: title, day, night, boss, results, defeat. They crossfade (2.5 s in, 1.8 s out), suspend on hidden tabs, stop scheduling when muted, and share one AudioContext.
- Two separate sliders (SFX 60%, music 50%).

The melee noise set is the right approach (noise + thump reads as physical). The music system is tidy and cheap.

**Coverage per event:**

| Event | Sound | Verdict |
|---|---|---|
| Slash / chop / cut brush / hit / kill | slash, chop, cut, flesh, kill, crack | **Good.** Distinct |
| Roll | `dodge` (triangle blip 300 → 600 Hz) | **Wrong family.** It's a UI blip, and it's *also* the menu cursor sound (`screensKit.js:88`) |
| Swing with no stamina | `error` (140 Hz square buzz) | A UI error sound inside combat. Use a breathy "huff" noise |
| Player hurt | `hurt` | OK, but the same sound plays on the summary after a death |
| Enemy wind-up | `glint` (all), `snort` (Razorback) | Good tells. Feral, Spitter and Crawler need their own voices |
| Big creature death, Razorback crash, mortar, wave events | `boom` in **8 places** | Overloaded. An organic death shouldn't sound like a synth explosion |
| Success (goal, beacon, home, skill, head out, night won) | `done` in **9 places** | No hierarchy. Night survived needs a real 2–3 s sting |
| Thorn Nest, Snare Vine, Pulse Beacon firing | **none** | Missing. Only Turret (`shoot`), Arc (`zap`) and Mortar (`boom`) make noise |
| Hold-E progress, beacon activation, drone pickup/extraction | **none** (just `done` at the end) | Missing. A rising tick during holds is standard |
| Footsteps, wading, fern push-through | **none** (fern `rustle` only from creatures and the player at 0.06 vol) | Missing. This is the biggest gap in the jungle |
| **Jungle ambient bed** (insects, birds, frogs, wind, rain) | **none.** `Ambience.js` is visual only | Missing. The "dense, claustrophobic" pillar is carried by visuals alone |
| Low-HP heartbeat / Relay-critical alarm | **none** | Missing |
| Dusk / sunset | `alarm` + the **boss** mood | Reusing the N6 boss track at every sunset spoils the finale. It needs its own dusk mood |
| Combat in the jungle | No change (the `day` mood keeps playing: bright G major, 82 bpm, hats) | Needs a tension layer when an alerted enemy is within 8 tiles |
| UI hover / tab / slider | Slider preview ✓; no hover, no tab sound | Minor |

**Mix:**
- SFX go straight to `ctx.destination`: no bus, no compressor, no voice cap beyond a 30 ms same-name throttle. With 8+ towers and 40 enemies (N3+), `boom` and `hit` stack and can clip.
- No positional audio. `rustle` (the "creature in the brush" tell) is mono, so you can't hear *where* it is. Use a `StereoPanner` driven by screen-x.

**Fixes, in priority order:**
1. **An ambience bed:** two looping noise-synth layers per time of day (a band-passed insect drone with random bird chirps; night frogs and crickets), ducked in menus, on a third slider.
2. **Footsteps by surface** (dirt, stone, fern, water), alternating left and right, 0.04 volume.
3. **An SFX bus** with a DynamicsCompressor (threshold −18 dB, ratio 4) and StereoPanner per one-shot.
4. **De-overload the shared sounds:** split `boom` into `death_big`, `mortar`, `crash`; split `done` into `step`, `beacon`, `extract`, `night_won`.
5. **Fill the missing tower and E-hold sounds.**
6. **A dusk mood** and a jungle combat layer.

---

## Scores

| Axis | Score | Why |
|---|---|---|
| **First impression** | **8** | Loads in 1.3 s, beautiful art, a clear pitch, playing in about 10 s, 0 errors. Loses a point for silence and synth blips over gorgeous art |
| **Onboarding** | **6** | The guided day is well paced and plain-spoken. But it banks 9 Scrap, points at an unreachable crate, and never teaches chop, med kit, map, beacons or the clock |
| **Clarity** | **6** | Goal, home and danger silhouettes are now good. Cuttable brush, health-bar colour, river crossings, the beacon object and the banner over the player still aren't |
| **Menus / UI** | **7** | Consistent hotkeys, confirms, plain words, good Results nudge. The build list overflows at 720p, settings are thin, glyph and codex legibility issues |
| **Robustness** | **8** | 0 errors, solid save and Continue, resize-safe, pauses on hidden. Gaps: blur doesn't pause, the death modal has no keys, the Space double-press, the quit-to-dodge-death exploit |
| **Audio (on paper)** | **4** | The melee noise kit and tidy music system are right. No jungle ambience, no footsteps, overloaded success and explosion sounds, missing tower sounds, the boss track reused at sunset, no mix bus |
| **"One more run" pull** | **5** | A strong first 5 minutes and a working meta nudge. Then both runs (and the newcomer's) hit the same N3 wall, preceded by a "Risky" rating, so run 3 feels like a re-roll rather than a new attempt |

## Top 12 fixes (ranked by impact on how the first hour feels)

1. **Flatten the night-3 cliff:**
   - N3 `HEALTH_MULT` 2.3 → 1.8, N3 Crawler groups −25%, the difference moved into N4 (2.05 → 2.3).
   - Re-run the sim with a newcomer profile (45 Scrap/day, 2 skills). Target: N3 ends ≥ 20 Relay HP with 4 level-1 towers.
2. **Recalibrate readiness:**
   - Add a tank-leak term to `_readiness` (`READINESS` in guide.js), so 5 level-1 towers on N3 read "Too weak".
   - Show a predicted Relay-loss range on the Start button.
3. **The guided day must pay.**
   - The coach only picks trail-reachable crates (`_nearCrate` path ≤ 1.3 × straight line), marks them in-world and at the screen edge, and 3–4 crates line the guided route.
   - Target ≥ 45 Scrap banked on day 1.
4. **Jungle soundscape:** an ambient bed (day insects/birds, night frogs, rain), surface footsteps, positional `rustle`, and an SFX bus with a compressor (`Sfx.js`).
5. **Fix health between days:** dawn HP = max(hp + 25, 60) (`config.js expedition`), plus a "buy med kit" chip on the briefing when HP < 60. Keep a 22 m wildlife-free ring around the Relay every day.
6. **Teach the missing verbs in context:** roll (first wind-up), chop (first bramble), Q (HP < 50% with a kit), Tab (coach step 4), beacons (the first one within 10 m), and a labelled sun-dial clock.
7. **HUD legibility:**
   - Health bar green → yellow → red, never stamina orange.
   - Minimum text 12 CSS px at 720p (area name under the clock, bar numbers, banner subtitle).
   - The "GOAL DONE" banner moves off the player (y ≈ 22%).
   - `hudFade.opacity` goes from 0.22 to 0.5.
8. **Keyboard parity:**
   - Enter/Space/E on the death modal and every `ui.modal`.
   - Space can't pause within 0.6 s of a wave starting.
   - "Start anyway" only via its button or Shift+Space.
9. **SFX identity:** separate UI sounds from gameplay (menu move ≠ roll, no `error` buzz in combat). Split `boom` and `done`. Add Thorn Nest, Snare, Beacon, E-hold and extraction sounds, a night-won sting, and a dusk mood (stop reusing the boss track).
10. **Settings:** master volume, a mute key (M), an ambience slider, key rebinding for move/roll/interact/med/map, a fullscreen toggle, "pause when unfocused" (and pause on `blur` by default in the jungle).
11. **Night prep fit and focus:**
    - The build list fits at 720p (pips on one line; Snare Vine visible).
    - Hints queue until the panel is idle.
    - Empty pads pulse during the first prep.
    - Results names what broke the Relay.
12. **River and beacon wayfinding plus the quit exploit:**
    - Mark the nearest ford when the goal line crosses deep water.
    - Lift the beacon glow above the canopy.
    - A mid-day quit counts as "Abandon expedition" (death rules apply) instead of a free reset.

## Verdict

As a first impression this is now a genuinely good-looking, fast-loading, bug-free browser roguelite. The guided day and the plain-language pass fixed most of what the newcomer critic hated, and the first five minutes hook.

The first *hour* doesn't hold:
- The guided day pays 9 Scrap.
- Health carries over in a way that punishes surviving.
- Night 3 is a 3.5× HP spike that the readiness check calls "Risky" right before it erases a 97-HP Relay.
- All of it plays out in a near-silent jungle whose loudest sounds are UI blips.

Fix the N3 curve and the readiness check, make day 1 pay, and give the jungle a soundscape. Those four changes alone would turn this Steam review from 👎 to 👍.
