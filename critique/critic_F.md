# Verdant Relay: Critic F (open-jungle playtest)

**Session:** 2026-10-13. Frozen build at `http://localhost:5191`, own Playwright tab. Most of the session ran at 1280×720, with one check at 1920×1080. Screenshots and the helper bot are in `.playwright-mcp/roundF/` (`F01`–`F57`).

**How it was played**

- **Real run** from the title (New Run → briefing → jungle → summary → prep → wave), for **2 full days and 2 nights**.
- **Debug runs:**
  - `?debug=explore` in Overgrown Market N2, Data Center N4, Canopy Greenhouse N4 and Flooded Transit N3.
  - `?debug=defense&night=4`.
- **Inputs:**
  - Menus, prep, waves and short fights were played with real Playwright keys and mouse: WASD holds, aiming, LMB, RMB hold, E hold, Q, Tab and Esc.
  - Long treks used my in-page bot (`roundF/bot.js`). It does Dijkstra pathing (cutting brush costs extra), drives `game.input` like real key and mouse events, aims at the next brush tile and slashes it, and spams slashes at anything within 2.6 tiles.
  - The bot never managed to roll in time, so its damage taken is roughly what an "aggressive button-masher" would take.
- **Console:** 0 errors and 0 warnings all session.
- **Art:** the player and some enemies are v1 placeholders. Noted, not scored.

---

## Run log (real run)

| Day | District / objective | Objective done at | Day ended | Banked | HP | Night |
|---|---|---|---|---|---|---|
| 1 | Collapsed Residential, "west ~50 m" / Salvage a Power Cell (60 m away) | t≈50 s (bot reached the site in ~25 s) | Looted 11 containers, activated pylon p3, stayed through dusk, extracted at the pylon at t≈405 s | **+168 S, 6 C, 4 B**, 36 kills | 100 → 32 at full dark; med kit → 52 | N1: 5 towers, Relay 100 → **100** |
| 2 | Canopy Greenhouse / Salvage a Power Cell | Dropped at pylon p3, **objective 20 m away**, done at t≈30 s | Looted 9 containers, walked to the Relay (34 m), extracted at t≈215 s | **+85 S, 2 C, 0 B** in a "Biofiber ×2" district | 77 → 67 | N2: +turret, +snare, Relay 100 → **100** |

**Persistence across the day boundary all worked:**
- cut tiles: 72 after regrowth;
- 12 opened containers stayed opened;
- pylon p3 stayed online and was used as the day-2 drop-off;
- 889 explored map tiles were kept.

---

## 1. Visual direction: does it still look like a 2017 mobile game?

**Mostly no, in the jungle. This is a big step up.**

What works:
- The terrain baker really does hide the grid. Dirt, mud, moss and water bleed into each other with dithered, organic edges (`F03`, `F06`).
- Trails read as worn paths, not tile strips.
- The foliage is dense and layered: palms, monstera, heliconia, bamboo, banyan roots, fallen trunks, bones, snails, mushrooms (`F04`, `F23`, `F25`).
- Light shafts, drifting canopy shadow and the foreground leaf frame add depth. The screenshot at `F25` (a light shaft over the trail) is genuinely handsome.
- Ruin sites (`F07`, `F17`, `F37`) are rich: stairs, crates, greenhouse frames, consoles.
- The title and Results backdrops are good. The Colossus on the Results screen (`F55`) is the best-looking thing in the game.

What still looks cheap or inconsistent:
- **Combat VFX are the weakest art in the game.**
  - The slash and chop arcs are flat, semi-transparent grey/white pie wedges (`F05`, `F16_d1_1`, `F49`). They read as a debug hitbox, not a machete.
  - The Razorback telegraph is a flat red translucent rectangle (`F47_rz2`), and the Spitter telegraph is a flat pink bar (`F50_spit2`). That is MOBA UI on top of a hand-pixelled world.
- **The pylon glow is a blocky checkerboard square** around the pylon base (`F36`, `F21`). It looks like a broken shader.
- **Ruin floors still show the grid.** Every stone tile carries the same star/diamond motif, so ruin sites and the Relay clearing read as a tiled grid (`F02`, `F07`, `F42`). That is the one place the "no grid" goal fails.
- **Black corpse decals look like holes in the ground** (`F16_d1_3`): solid #000 blobs with no shading.
- **Opened containers all become the same empty wooden crate.**
  - This includes Intel Terminals and rare caches (`F10`).
  - The power-cell cache keeps its glowing screen after you crack it (`F17`).
- **The night map is restyled but still TD-mobile.**
  - Grey metal build pads with yellow corner brackets, orange chevrons on right-angle snake lanes, and a light-blue square under the Relay (`F30`).
  - Towers and enemies are still about 16–24 px.
  - Better than v1, but it's the screen that most still says "2017 mobile".
- **Menus and summary panels are unchanged v1 slabs**: readable but plain next to the jungle.
- **Non-integer pixel scale at 1280×720.**
  - The view canvas is 480×270 stretched to 1280×720 (×2.67), so pixel widths alternate between 2 and 3 px.
  - At 1920×1080 it is an exact ×4.
  - This breaks the "pixel-exact" contract in CLAUDE.md at a very common window size.

## 2. Claustrophobia and atmosphere

**Dense and claustrophobic: achieved, maybe over-achieved.** At about 15 tiles across, with cards standing over you and leaves at the screen edges, it really feels like pushing through jungle. Dusk works: the light closes in, a red "DUSK" replaces the clock, and packs arrive (`F27`).

**Readability is now the main problem.**

- **The player disappears in brush.** In `F23`, `F24`, `F40` and especially `F52` (bramble test) the player is a few green and orange pixels under foliage.
  - The see-through window is a dithered dissolve whose blocky outline you can see.
  - It thins the cards but doesn't give the player a silhouette.
  - At 1920×1080 in thicket (`F57`) I could not find the player at all.
- **Enemies in brush are invisible until they hit you.**
  - On the N2 debug trek the bot lost 87 HP getting to the first site, and most of the hits came from things I never saw in screenshots.
  - The red ground ring helps on open floor only.
- **The right-hand HUD hides the fight.**
  - The minimap (320 px) plus the objective panel cover about 26% of the screen width at 1280×720.
  - A Spitter spawned **5 tiles east** was completely hidden under the objective panel. Only its pink telegraph line poked out (`F50_spit2`).
  - A charging Razorback was half under it (`F47_rz2`).
- **Brush types are not distinguishable.** Fern, thicket and bramble all read as "green". I only learned a tile was a bramble from the toast "Thorny bramble: a heavy chop clears it" (`F52`).
- **The Relay, the most important landmark, sits under the timer.** When you stand 3–4 m south of it, the sprite is behind the HUD timer (`F02`, `F42`, `F47`).

## 3. Melee

**Numbers match DESIGN:**
- A bramble took exactly 3 slashes (about 1.3 s), and a single chop cleared one.
- Slashes cost 6–14 stamina; three slashes plus a chop took me from 100 to 53.
- Damage numbers show (13, 24).

**Feel is weak:**
- No hit-stop, no screen shake on hits, and very little knockback.
- Swings are flat grey wedges.
- Kills mostly read as a small black splat.
- The lunge on every swing is felt more as a nuisance than as weight:
  - holding E on the power box while swinging at a Crawler dragged me about 4 tiles off the interactable and cancelled the hold;
  - chained slashes walk you into Razorback charge lines.

**Enemies:**
- **Razorback.** The wind-up is very clear (big red lane). After the charge it ends 4+ tiles away, so the slash combo whiffs. My first three slashes landed once (99 → 86). It's a chase-then-chop pattern, which is fine but needs better feedback.
  - Standing still near one for about 45 s cost **80 HP** (100 → 20, then death).
- **Spitter.** It lobs every ~2.5 s for 9 damage, with no miss when you stand still. The telegraph is good, but you can't see the shooter if it's under the HUD.
- **Feral guards** at the power-cell cache burst out on arrival and die in 2–3 slashes. The "guarded" objective is not a threat on N1–N2.
- **Hunters at dusk:** 3–4 packs while waiting about 70 s. Danger rises in a nice, gradual slope (46 → 32 HP).

**Cutting undergrowth:** it's satisfying in isolation (debris burst, a hint toast), but **it rarely matters.**
- Trails connect the Relay to every site, so on a 52 m cross-country hop the bot cut only 11 tiles.
- Day 1 at the objective site: 34 cut tiles, all incidental.
- Hidden brush caches (+4 S, a tool chest in a thicket) are the only reward for leaving trails, and they're invisible.

**Fairness:** the deaths and big HP losses came from hits I couldn't see coming (occlusion), not from telegraphs I failed to read. That's the wrong kind of unfair.

## 4. Open-world loop

**Good:**
- Objective distance and direction, and the nearest return point with distance, are always visible.
- The minimap reveals as you go.
- Pylons reveal the area around them and become drop-off and return points ("Pylon online", `F21`).
- The death modal is clear ("Objective progress still counts", 30% salvage on N1–2).
- The per-day persistence all works (see the run log).
- The briefing "Where" line (compass + distance, and "pylon online" for the district's own pylon) is useful.

**Problems:**
- **Day length vs. content.**
  - The objective took 30–55 s on both real days.
  - Day 2's pylon drop-off (`F36`: "The drone dropped you at your pylon — closest to today's objective") put me **20 m** from an objective the briefing called "south of the Relay, ~60 m".
  - Pylons turn later days into a short walk. The other 250–300 s is optional looting, which is too generous (see section 6).
  - Consider dropping at the pylon *nearest the Relay-side of the district*, or placing objectives deeper than the pylon.
- **Big map (Tab):**
  - Tiny: 2 px per tile in a 384 px black square, with no zoom or pan (`F19`).
  - It doesn't pause (`dayT` kept counting).
  - Relay and active pylon use the same cyan.
  - The legend marker squares are hard to tell from container markers.
- **Minimap markers:** "You" is a white square and containers are cream squares of the same size. In clustered sites (`F17c`, `F37`) you can't tell where you are.
- **Interaction:**
  - The pylon prompt only appears within about 1 tile of its base, even though the pylon is 3 tiles tall on screen. At 1.7 tiles away I got nothing.
  - The nearest-object-wins priority made a crate beat the pylon once.
  - The Relay radius (3.2) is fine.
- **Wildlife density:**
  - N2 Market: 8 at start, **38 alive** after the trek.
  - N1 Residential: 23.
  - The far south-west was busier (feral packs). Near-Relay and cleared sites went quiet: about 70 s with nothing within 12 tiles.
  - Density by distance works; the N2 debug count felt high for a night-2 jungle.
- **Dusk:** hunters arrive and scale, but full dark at t≈400 s doesn't feel *dark*; the shrinking light is subtle.

## 5. Bugs and issues (with repro steps)

**Major**

1. **The player is hidden under foliage.** Repro: `?debug=explore&district=canopy_greenhouse&night=4`, then `vr.game.scene.debug.teleport(78.5,51.5)` (next to a bramble). The player is about 6 visible pixels (`F52`). At 1920×1080, `teleport(60,40)` shows no visible player (`F57`).
2. **The right HUD column hides enemies 4–6 tiles east.** Repro: same URL, then `s.spawnEnemy('spitter', p.x+5, p.z-1)`. The Spitter fires at you from under the objective panel (`F50_spit2`).
3. **Dead content.**
   - The `safe_hands` skill ("Ignore the first hazard hit") has **zero references** outside `skills.js`, and the jungle has no hazards. It is offered on the summary skill pick (`F29`).
   - Canopy Greenhouse's briefing promises "spore hazards" and "spore patches". `CONFIG …spore/extraSpores` exists, but `JungleScene` never spawns any, and I saw none.

**Minor**

4. **Click-through, still present (also reported by critic E).**
   - Repro: survive night 1, then click the "NIGHT 1 SURVIVED · click to continue" banner at about (500, 400).
   - The next briefing loads with district card 2 already selected ("Heading to Overgrown Market"). On night 1, nothing was preselected.
5. **"OBJECTIVE COMPLETE" banner runs under the minimap** at 1280×720 (`F09`, `F17`). The objective line "✓ Objective complete — return to claim it" is struck through, so the instruction you still need to follow looks like it's done.
6. **Off-screen arrows overlap the district label and timer**: the cyan Relay arrow sits on top of "Canopy Greenhouse" (`F40`, `F41_sp3`). The Relay sprite also overlaps the timer.
7. **Pixel-font glyphs.**
   - "~50 m" renders as "-50 m" in the briefing (`F14`).
   - The "58" in the death summary renders as "5θ"-like (`F12`).
   - The clock's "4" is hard to read (`F17`, "4:44").
8. **The big map doesn't pause the day.** That may be intentional, but it's undocumented, and the map is too small to read quickly.
9. **Slash lunge cancels holds.** If you swing while holding E, the lunge moves you out of the interact radius. The progress keeps, but it's confusing.
10. **Invisible trunk snag:** a 0.3-radius trunk collider at (101.9, 128.9), hidden behind cards, stopped straight-line movement.
11. **Space didn't start the wave** after key-building 7 towers and pressing Esc (`?debug=defense`); clicking the button worked. Not isolated.

**Verified OK:**
- Results screen layout (fixed since critic E, `F55`).
- Death modal and summary.
- Pause menu.
- Med kit (Q).
- Persistence.
- Debug runs not touching the real save.

## 6. Balance first impressions

- **The expedition economy is far over budget.**
  - Day 1 banked **168 S + 6 C + 4 B**. DESIGN's simulated budget is ~70 S per expedition.
  - The N2 debug Market site alone held a terminal, 2 tool chests and a rare cache (58 S in 4 holds).
  - Rare caches came in clusters: 4 within 15 tiles of pylon p3.
  - Day 2 was lower (85 S) because I extracted early.
- **Nights 1–2 cost 0 Relay HP** with modest builds. That's the same "free early nights" problem critic E reported, now fed by an even richer day.
- **Day danger is real and front-loaded by occlusion:**
  - N2 debug trek: 100 → 13 HP, then death while looting.
  - Real N1: 100 → 32 by full dark.
  - With visible threats this would be a good difficulty. Right now it's damage from nowhere.
- **Debug N4** (7 level-1 towers mid-map, no skills): the Relay fell at 94% of the wave, as the design notes predict.

---

## Top 15 fixes (most impactful first)

1. **Occlusion readability.** Draw the player and every enemy as a solid silhouette or outline when foliage covers them, and widen the see-through window into a soft circle with no visible dither box. Without this, "dense" turns into "unfair".
2. **Get the HUD off the combat space.** Shrink or collapse the minimap (or make it a corner circle about 120 px), move the objective lines into a slim top or bottom strip, and keep about 6 tiles of clear view on every side of the player.
3. **Machete juice.** Pixel-art smear sprites per swing (three distinct arcs plus a heavy chop), 40–60 ms hit-stop, a small camera kick, enemy hit-flash with knockback, and leaf and bark debris when cutting. Replace the grey wedges.
4. **Restyle the telegraphs in-world.** Razorback: dust and ground-crack streaks along the lane. Spitter: an arcing sap glob with a ground target circle. Drop the flat rectangles and bars.
5. **Rebalance loot** to about 70–100 S per day: fewer rare caches per site, and scale yields by distance from the Relay or pylon. Re-test night 1–2 Relay damage after that.
6. **Make cutting matter.** Have trails meander or dead-end, put objectives and caches off-trail, and make the cross-country cut a real shortcut. Make brush types visually distinct: thorny red-brown brambles, dense dark thickets, low pale ferns.
7. **Pylon drop-off vs. objective distance.** Don't drop the player 20 m from the objective. Keep a minimum trek, or drop at the Relay-side pylon.
8. **Big map:** zoom to the explored area, pan, and pause (or slow) while open. Use distinct colors for Relay and pylons, and make the player an arrow rather than a square.
9. **Remove or rework dead content:** Safe Hands (no hazards), and the greenhouse "spore patches". Either implement spore clouds as cuttable or avoidable hazards (a good fit for the jungle) or change the text.
10. **Interaction:** pylon radius of about 2 tiles; priority Pylon/Relay > objective > containers when they overlap; no lunge while E is held or within 0.3 s of releasing it.
11. **HUD collisions:** keep the banner clear of the minimap, keep off-screen arrows clear of the timer and label, and nudge the camera or timer so the Relay isn't hidden. Don't strike through the "return to claim it" line.
12. **Fix the click-through** from the "Night survived" banner into the briefing district cards.
13. **Make ruin floors less grid-like:** vary the stone tiles (cracks, missing slabs, moss patches that cross tile borders, rubble), and make the Relay clearing irregular.
14. **Container and decal polish:** a per-type opened sprite (dark terminal, open chest, gutted cache), and corpse decals shaded instead of pure black. Replace the checkerboard pylon glow with a soft radial or beam.
15. **Pixel-exact scaling and font:**
    - Choose the internal resolution so the CSS scale is an integer: for example, at 1280×720 use 427×240 ×3 with a letterbox, or 640×360 ×2.
    - Fix the "~" and "8" glyphs.
    - Enlarge night-map towers and enemies, and replace the yellow-bracket metal pads with in-world stone or wood plinths.

## Scores (1–10)

| Axis | Score | Why |
|---|---|---|
| **Visuals** | **7** | The jungle terrain and foliage are lush and convincingly non-grid. The light shafts, ruins and title/Results backdrops are strong. Points lost to flat VFX wedges and rectangles, the checkerboard pylon glow, gridded ruin floors, black decals, mobile-style night pads, and the ×2.67 scale at 720p. |
| **Atmosphere** | **8** | Claustrophobic, layered, moody; dusk closes in. It already delivers "dense and cramped". |
| **Melee feel** | **5** | Mechanically sound (combo, chop, roll, stamina all work to spec), but there's no hit-stop, shake or knockback, the arcs are placeholder, and the lunge fights you. |
| **Open-world loop** | **6** | Persistence, pylons, return points, death salvage and the briefing "Where" all work. But objectives are a short walk (especially from pylons), cutting is optional, the loot is too rich, and the big map is weak. |
| **Clarity** | **4** | You can't see the player in brush, enemies hide under foliage and under the HUD, brush types are unreadable, and the Relay hides under the timer. |
| **Polish** | **6** | No console errors, persistence is solid, and the Results layout is fixed. Points lost to dead content, HUD overlaps, the click-through, glyph issues and the uniform crate sprites. |
