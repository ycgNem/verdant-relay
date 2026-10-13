# Verdant Relay: Playtest Critique (Critic A)

**Session:** 2026-10-13, about 40 min. Playwright Chromium at 1280×720. Started with a fresh save (localStorage cleared).

**How the game was driven:** a small in-page bot sent real `keydown`/`keyup` events on `window`, `mousemove` events for aiming, and `mousedown`/`mouseup` on `#stage`. It walked BFS paths over `world.walkable`, fired at the nearest enemy and dodged when an enemy was in `windup`. Menus and defense were driven with real Playwright clicks and key presses. Debug hooks were used only where noted: `info()`/`state()` for reading numbers, one `player.hp = 12` poke, and the `?debug=` URLs for the late-game checks.

**Warning about the data:** someone edited the source while I was playing (`towers.js`, `waves.js`, `config.js`, `enemies.js`, `Run.js`, `Save.js`, `DefenseScene.js` and others between 02:26 and 02:33). Vite HMR force-reloaded the page in the middle of an expedition twice. Once it left a white screen (`does not provide an export named 'patchRun'`). Earlier, `ExploreScene.js` returned HTTP 500 several times. From night 5 onward I played a frozen `vite build` snapshot (served from my scratchpad on port 5291, save copied over). As a result:

- Nights 1–4 ran on the pre-02:26 tuning and nights 5–6 ran on the post-02:28 tuning.
- Some numbers below differ from `DESIGN.md`. For example, repair now costs 25 Scrap for +15 HP, not 20 for +20.

## Run log (one real run, won)

| Night | District / objective | Expedition result (banked) | Kills | Towers before wave | Relay before → after |
|---|---|---|---|---|---|
| 1 | Flooded Transit / Salvage Power Cell | **Died** at 0:56 left with no med kits. Lost 22 Scrap | 11 | 1 (Arc Spire) | 100 → **37** |
| 2 | Canopy Greenhouse / Activate Pumps + nest | 110 S, 1 C, 10 B, 6 I | 9 | 4 | 62 → 82 (repair) → **70** |
| 3 | Overgrown Market / Recover Route Data + data log, timer ran out | 108 S, 3 C, 0 B, 5 I | 31 | 6 | 70 → 90 → **90** |
| 4 | Collapsed Residential / Salvage Cell + locked cache | 89 S, 4 C, 1 B, 3 I | 26 | 6 (two upgraded to L3) | 90 → **90** |
| 5 | Data Center / Clear the Blockage | **Died** to the elite Razorback room. Lost 91 S, 2 I | 25 | 7 | 90 → 105 → **105** |
| 6 | Flooded Transit / Restore Relay Box + engineer | 98 S, 2 C | 16 | 9 (L2 snare/turret) | 125 → **125**, boss killed before reaching the core |

Victory gave 229 Research total, enough to buy about 4 of the 6 unlocks immediately.

The shape of the run: night 1 nearly ended it, nights 3–6 cost the Relay **0 HP**, and the boss never touched the core.

---

## 1. Bugs

### Major

**B1. The "Best run" record is one night behind after any reload.**
- Repro: survive night N, then reload on the next briefing, or quit to title. The Title and Collection screens show `Best run N-1/6`.
- I saw "3/6 nights survived" while Continue offered "Night 5 of 6 · Briefing". The saved meta had `best.nights: 3` and the run had `stats.nightsSurvived: 4`.
- Cause: in `Run.nightSurvived()`, `award()` calls `saveMeta()` first and `meta.best.nights` is changed afterwards. Nothing saves meta again until the next research award. Fix: update `best` before `award()`, or call `saveMeta()` again.

**B2. Sabotage threw an error (in the 02:28 snapshot).**
- Clicking **Sabotage (2 INT, −10% wave)** in prep logged `TypeError: this._sabotage is not a function` (`DefenseScene` button onclick). Intel was not spent and nothing happened.
- The current source does define `_sabotage()` at `DefenseScene.js:1263`, so this was probably a half-finished edit. It is the only runtime exception I saw, so it needs a re-test.

**B3. Reloading during prep silently undoes prep actions.**
- On night 5 I repaired (90 → 105, Scrap 83 → 58), reloaded, and pressed Continue. Prep came back at Relay 90 and Scrap 83.
- So the snapshot is only taken on entering prep. Builds, upgrades and repairs made since then are lost. The flip side is a free "undo everything" exploit.
- Either save after every prep action or tell the player that prep changes aren't saved until the wave starts.

**B4. Dev server: hot reload wipes an expedition in progress (developer experience, but it hit me twice).**
- Any source save fully reloads the page, which throws away the current expedition. Twice it broke the app: a 500 on `ExploreScene.js`, and a white screen from a missing `patchRun` export.
- Not a shipping bug, but testers and critics will keep losing runs to it. Consider `server.hmr: false` for playtest sessions, or tell testers to use `vite preview`.

### Minor

- **B5.** A `?debug=defense…` URL silently deleted my real saved run: `verdant-relay/run` was gone afterwards. Dev-only, but a one-line warning, or not touching the run key, would avoid surprises.
- **B6.** Results for a debug run show "Kills 0", "Peak resources 60 Scrap" even though the run had 800, and "Districts visited 1 — Overgrown Market" even though no expedition happened. The stats don't reflect debug starts.
- **B7.** Reinforced Core (+25 max) raises only the maximum. Picked at 37/100, the Relay became 62/125. Players read "+25 Relay health" as healing. Either heal by the same amount or say "max" in the text.
- **B8.** The sell confirm window is 2.5 s with no visible countdown. Pressing **S** again slightly too late just re-arms the button, so it looks like the hotkey is broken. Show a shrinking bar on "Confirm sell".
- **B9.** The tower side panel overflows its box during a wave. "Refunds 70% of 63 Scrap spent (rounded down). Components aren't…" is cut off at the bottom edge and needs a scroll that isn't obvious.
- **B10.** On night 6 the "approaches on the South lane!" toast sits on top of the boss name and HP bar for its whole lifetime.
- **B11.** The tutorial hint box (bottom-left) covers the South lane entrance label and pads 9–10 during prep. That is exactly where the hint tells you to look.

---

## 2. Playability and game feel

### Exploration

**Controls are solid.** WASD plus mouse aim felt responsive. Dodge (Space, 2 s cooldown) and the Pulse Cutter (RMB) both behave as described, and the HUD shows their cooldowns. Hold-E interactions show a ring.

**Problem: hold times differ by object and the player has to discover them.**
- Crate: about 0.5 s
- Chest or cache: about 1.5–2 s. One 600 ms hold left a chest half-open; it paid out on the second hold.
- Locked cache: 3 s
- Terminal: about 20 s while enemies spawn

Put the hold time in the interact prompt, for example "Hold E · 2s".

**Combat pressure is front-loaded and mostly ranged.**
- The first expedition (Flooded Transit, Salvage a Power Cell) put 5 Spitters, 2 Crawlers and a Rival Scavenger on the objective cache. I went in at 100 HP with **0 med kits** and was dead about 50 s later.
- Spitter globs hit for 9 and Scav bolts for 10. With several ranged enemies firing from different angles, the dodge cooldown can't keep up.
- For a new player, the first objective room is the hardest fight of the early game.

**Elite room on Clear the Blockage (Data Center, night 5) is a death trap.**
- The elite Razorback has 356 HP, which is about 11 s of continuous Carbine fire. It sits in a dead-end room behind a bramble wall with **3 more Razorbacks and 2 Skitters**.
- Cutting the bramble lets the whole room charge through a 4-tile gap at once.
- I went from 80 HP to 0 in roughly 3 s while standing at the cut, with stun-locking charges and 25 damage per elite hit.
- Spread those Razorbacks out, or make the elite the only charger in its room.

**Death costs a lot.**
- You lose all carried loot and come back at 35 HP. Combined with one-tower nights, an early death can end the run.
- Night 1 after a death meant 60 starting Scrap, one tower, and the Relay dropping to 37/100.
- A first-time player who dies on expedition 1 is probably out by night 2. Consider keeping a share of the carried loot, for example 25%, on death during night 1–2, or making the night-1 wave softer.

**Timer: 180 s is tight but fair once you know the map.**
- When it ran out I got the warning and the beacon, and I still extracted at the normal zone.
- The overtime reinforcements were noticeable but not oppressive.

**Readability:**
- Enemies are readable against the floors (the Data Center tiles are light, but the dark sprites stand out).
- The orange off-screen objective chevron is helpful but small.
- The minimap is too small to plan routes with.
- Brambles that gate rooms show on the map but don't stand out as "cut me with RMB" until the first hint appears.

### Defense

**Prep UI is the strongest part of the game.**
- Range rings on hover, a clear upgrade preview ("Fire rate +55%, damage +10%"), a shortfall line ("Need 24 more Scrap"), a per-lane wave preview with icons, and a threat card.
- Hotkeys 1–5, U, S, R, T and Space all work.

**There is little to do during the wave.** Once it starts you can only change targeting. Watching 60–90 s at 2× with nothing to decide gets boring by night 4. A 3× speed or a "skip to result" option, once the wave is clearly won, would help.

**Level-2 and level-3 towers are hard to tell from level 1 at night zoom.** There is a "LEVEL 2" pop-up, but the model barely changes. A pip or glow per level would help.

### Onboarding

- One-time hints cover movement, the cutter, extraction, building, the wave preview and the boss. That's good.
- What isn't explained: that dying means losing everything **and** risking a weak night. Also that Circuits (1–4 per expedition) are the bottleneck for Arc Spires (2 C each, +1–2 C per upgrade).
- The Intel actions Decrypt and Sabotage aren't in `DESIGN.md` and have no hint.

---

## 3. Balance (observed numbers)

**Income per successful expedition:** 89–110 Scrap, 1–4 Circuits, 0–10 Biofiber, 3–6 Intel, 16–31 kills. That is about 105 Scrap in total.

**Tower economy:**

| Item | Cost |
|---|---|
| Base cost (after Efficient Assembly) | 27–41 Scrap |
| Level 2 upgrade | about 15–25 Scrap plus components |
| Level 3 upgrade | about 22–30 Scrap plus components |
| Fully upgraded Scrap Turret | about 85 Scrap |
| Fully upgraded Arc Spire | 77 Scrap and 5 Circuits |
| 800 Scrap in debug | 6 towers to level 3 |

**Relay HP lost per night:** 63, 12, 0, 0, 0, 0.
- The curve flattens completely after about 4–5 towers.
- Wave sizes grow from 14 to 46 enemies, but enemy HP only grows 10–50%. That doesn't keep pace with the towers a player can afford.
- Nights 3–6 had no tension at all. Waves were won with 70–105 Scrap left over.

**Boss:**
- **Real run, 7–9 mostly level-1/2 towers:** the Colossus (1350 HP) died at 63 s on 2× and never reached the core.
- **Debug run, 0 towers:** the Relay fell in 53 s.
- **Debug run, 6 level-3 towers on north/middle pads:** the Colossus reached the core for −60 and the night was won at 40/100.

So placement on the boss lane matters more than tower count. The pre-boss hint ("set Toughest on the South lane") is what makes the difference. The boss itself is a pushover if you follow it.

**Meta progression:**
- One victory gives about 229 Research. All unlocks cost about 375 in total (30–80 each).
- Everything will be unlocked within 2 runs. That's fast for a roguelite unless more unlocks are planned.

**Suggested tuning direction:**
- Soften night 1, for example cut the night-1 wave by 20–25%.
- Steepen nights 4–6: enemy HP at +20–25% per night instead of +10%, or more Ruin Guards and Burrowers.
- Slightly raise Circuit drops, so that Arc and Pulse builds are possible without a single Flooded Transit run.

---

## 4. Visual and audio polish

**What works:**
- The art direction reads well. The day sprites are crisp, the night palette with the cyan core glow is strong, and the title diorama is nice.

**Problems:**
- **Title screen:** after a reload the background diorama sometimes rendered with a strong red/magenta tint (the first frames after load). It looked like an unfinished fade.
- **Explore HUD:** the "Tab map" label is partly covered by the minimap frame. The Carried panel's zero-value chips are very low contrast.
- **Night map:** the empty build pads (pale squares) look like props, not obvious "build here" slots, until you hover them. A pulsing outline in prep would help.
- **Overlaps:** the boss bar plus toast (B10), the hint over the South lane (B11) and the side-panel overflow (B9) all appear on the most important screen of the game, the night-6 prep.
- **Results / Victory:** clean. The "You can afford Field Kit and 5 more" nudge is good.
- **Load time:** the built version showed "Loading…" for about 3.7 s on a fast machine. Acceptable, but no progress bar.
- **Audio:** not evaluated because Playwright runs headless.

---

## 5. Top 10 fixes, by impact

1. **Make the late defense harder.** Nights 3–6 cost 0 Relay HP. Raise late-night enemy HP and add elite density so the defense can be lost again.
2. **Soften the night-1 death spiral.** Options: start with 1 med kit, keep about 25% of carried loot on death for nights 1–2, or shrink the night-1 wave.
3. **Rework the Clear the Blockage elite room.** Don't stack 3 extra Razorbacks behind a single bramble choke with the elite.
4. **Fix B1** (best-run record not saved after a survived night).
5. **Fix and verify B2** (the Sabotage TypeError) and add a hint explaining Decrypt and Sabotage.
6. **Save after every prep action, or warn the player (B3).** Remove the reload-to-undo exploit.
7. **Show the hold time in interact prompts**, and make chests and caches finish in one hold.
8. **Fix the night-6 prep overlaps (B9–B11):** move the hint box away from the lanes, move the toast below the boss bar, and keep the side panel from clipping.
9. **Make tower levels visible on the model**, and highlight empty pads during prep.
10. **Steadier test environment:** disable HMR full reloads during playtests (B4). Stop debug URLs from deleting the real run save and from producing misleading results stats (B5/B6).
