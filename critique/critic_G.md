# Verdant Relay: Critic G (character art and fix-wave playtest)

**Session:** 2026-10-13. Frozen build at `http://localhost:5191`, in my own Playwright tab at 1280×720, with scale checks at 1366×768, 1600×900 and 1920×1080. Screenshots and helpers are in `.playwright-mcp/roundG/` (`G01`–`G87`, `Gz_*` zoom crops, `bot.js`, `fight*.js`).

**How it was played**

- **Two real runs from the title**, 4 days and 4 nights in total:
  - **Run 1:** Canopy Greenhouse, then Flooded Transit. Lost on night 2.
  - **Run 2:** Flooded Transit, then Overgrown Market. Survived night 2 on 24 Relay HP.
- **Debug runs:**
  - `explore` in Greenhouse N4, Market N3 and Flooded N2.
  - `defense&night=4`.
- **Inputs:**
  - Every fight close-up, chop, roll, walk cycle, E-hold, Tab map, menu and wave used real Playwright keyboard and mouse input. The fighter script (`fight*.js`) aims with the mouse, clicks LMB, holds RMB, and presses Space to roll on wind-ups.
  - Long treks used critic F's in-page pathing bot, which drives `game.input`.
  - Neither script is a good dodger, so damage taken is "aggressive average player" level.
- **Console:** 0 errors and 0 warnings all session.

---

## Run log

| Run / day | District, objective | Trek | Banked | HP | Night result |
|---|---|---|---|---|---|
| R1 D1 | Greenhouse, *Activate both pumps* (2 sites) | 56 m from the Relay | Carried 57 S, 6 B, 1 I, then **died at dusk** (skitter pack, t≈350 s): 30% salvage = **15 S** | 66 → 0 | N1: 2 towers, Relay **100 → 100** |
| R1 D2 | Flooded, *Defeat the Razorback nesting in the way* | 53 m | **Died at t≈33 s** (2 crawlers + feral, 60 → 0 in 6 s), carried nothing | 60 → 0 | N2: 2 towers, **Relay fell** (Results: 1/6, 35 kills) |
| R2 D1 | Flooded, *Salvage a Power Cell* (lost site, 73 m) | 73 m | **+61 S, 2 C, 2 B, 3 I**, extracted at a new pylon at t≈195 s | 100 → 39 | N1: 3 towers, Relay **100 → 100** |
| R2 D2 | Market, *Restore the Relay Box* (fuse, then box 44 m further) | **96 m** (dropped at the Relay although the Flooded pylon was online) | Died at t≈80 s in a feral and crawler ambush: 14 S lost, **3 S salvaged** | 64 → 0 | N2: 3 towers + Sabotage, Relay **100 → 24** |

---

## 1. Critic F's top 15: did they land?

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Occlusion readability | **Partly (enemies fixed, player not)** | Enemies under foliage now draw as a crisp orange outline with a checker fill, and you can read their shape and type (`G28`, `G45`, `G71`, `G46_spit_2`). The player is still the problem: inside the x-ray window the cards in front dissolve into a dither that mixes with the player's pixels, so the player reads as static (`G27`, `G73_spit3`, `G78_after`). I never saw the promised `#d8fdff` player outline. The lime-green cloak is also the same hue family as the ferns. |
| 2 | HUD off the combat space | **Fixed** | A round minimap of about 130 px, a compact top-left HP/ST panel, and a slim bottom objective strip. A Spitter spawned 5 tiles east is fully visible (`G75_s03`). |
| 3 | Machete juice | **Fixed** | Cyan pixel smears per swing, an enemy white-flash silhouette, damage numbers, knockback and leaf debris (`G53_y_1/2`). The chop is a big yellow crescent (`G78_bramble_chop2`). Hit-stop and kick are configured (`JUICE.melee`). |
| 4 | In-world telegraphs | **Mostly** | The Spitter is excellent: a magenta landing ring follows you, then a pink glob arcs in (`G75_s03`, `G75_s07`). The Razorback lane is now two thin dotted red lines plus dust (`G76_rz2`). It's in-world, but too faint over brush and leaf litter. |
| 5 | Loot to 70–100/day | **Fixed** | 61 S (R2D1, 10 containers plus objective). R1D1 had 57 S carried at t≈270 s. That's on budget, with no rare-cache clusters seen. |
| 6 | Make cutting matter | **Fixed** | The R2D1 power-cell site is a lost site. In Flooded N2 debug, objective 1 has **no path at all without cutting**, while objective 2's trail path equals its cut path. Brambles read red-brown and thickets dark blue-green (`G61`, `G78_bramble0`). |
| 7 | Pylon drop-off vs. objective | **Fixed** | Treks were 53–96 m. On R2D2 the Flooded pylon was online, but the drone used the Relay because the pylon wouldn't have saved enough. |
| 8 | Big map | **Fixed** | Shows "DAY PAUSED" (dayT is frozen), drag/WASD pan, wheel zoom, a player arrow, a cyan Relay square, triangles for pylons and a legend (`G12_bigmap_zoom`). One nit: a 1 px vertical seam line at x≈795. |
| 9 | Dead content | **Fixed** | Spore pods are in the Greenhouse; I took 7 × 5 damage from a cloud at t≈122 s. `safe_hands` is now used in `SporePods.js`. |
| 10 | Interaction | **Fixed** | The pylon prompt shows at 2.06 tiles. Priority and the no-lunge-while-E rule now exist (`noLungeAfterE`). |
| 11 | HUD collisions | **Mostly** | The "OBJECTIVE COMPLETE" banner is centred, and the return line is green rather than struck through (`G43_cracked`). Arrows sit at the screen edges. At drop-off the Relay sprite is cut off by the top edge and sits under the arrival toast (`G04`). |
| 12 | Click-through from "Night survived" | **Not fixed (intermittent)** | R2 N1: one click on the banner at (600, 400) opened the briefing with **card 2 preselected** ("Heading to Flooded Transit Station", `G58`). After N2 the same click selected nothing (`G68`). |
| 13 | Ruin floors less grid-like | **Partly** | There are now holes, moss and cracks that cross slab borders. The repeating star/diamond slab motif still reads as a grid in every ruin and in the Relay clearing (`G41`, `G75_s03`, `G04`). |
| 14 | Containers and decals | **Partly** | Opened variants now exist: an empty crate, a dark terminal, a gutted cell cache. The pylon glow is now a soft dithered cyan disc (`G49`), which is fixed. Corpse splats are dark navy with shading instead of #000. **New bug:** the opened chest has a flat, featureless black-teal rectangle where the lid or interior should be (`Gz_opened`). |
| 15 | Pixel-exact scaling, font, night map | **Mostly** | Integer scale everywhere: 426×240 ×3 at 720p, 480×270 ×4 at 1080p, ×3 letterboxed at 1366 and 1600. "~" is fixed (`G58`). The clock "4" is still an odd glyph (`Gz_clock`). Night plinths are now dark stone slabs, but they're still a grid of squares. Towers are still about 1 tile. |

**Score: 9 fixed or mostly fixed, 5 partly, 1 not.** That's a strong fix wave.

---

## 2. The new character art

**Readability at game scale: good on open ground, weak in brush.**

- The player is about 2.2 tiles tall on screen (roughly 150 px at ×3), with a strong silhouette: hood, goggles, a big rust backpack, a cloak and the machete (`G41`, `G44`). On paving and dirt you never lose them.
- In ferns and thicket the lime cloak blends into the green. The x-ray dither then breaks the sprite into noise (`G73_spit3`, `G78_after`).
- Enemies read at a glance and are distinct from each other:
  - **Feral Scavenger:** armoured, with a spear. Reads as a person.
  - **Razorback:** a large black boar with tusks and a saddle. Imposing, and the best of the set (`G76_rz6`).
  - **Spitter:** a fanged carnivorous plant with dripping sap. Instantly reads as "turret" (`G75_s03`).
  - **Skitter:** a small pink-purple insect. Fine.
  - **Bramble Crawler:** the weakest. It's a green hound with a saddle-bag, which doesn't say "bramble" (`G53_y_1`). Next to the plant-themed Spitter it looks like a different game's dog.

**Animation in motion:**

- **Walk:** reads well. Legs alternate, the cloak sways, and there's no foot-sliding at 5.6 t/s (`G81_walkstrip`).
- **Slash:** the frames show a wind-back and follow-through, with the cyan smear on top (`G82_slashroll`, frames 1–5).
- **Roll: doesn't read as a roll.** All 5 frames show the scavenger upright and facing the camera, sliding with the blade out (`G82_slashroll`, frames 6–10). There's no tuck and no squash. It looks like a sidestep.
- **Hurt:** reads mainly through the red screen flash. The sprite change is subtle.

**Direction changes:** all 8 facings are present and snap correctly with WASD (`G80_dirs`). Back views show the backpack. Diagonals are clean.

**Fit with the environment:** close. The palette (olive, rust, teal goggles) and the selective outline match the PixelLab foliage. Two things are off:

1. Scale. The player is taller than palms and shrubs and about twice a crate, so the scale reads chunky against the 1-tile props.
2. The night map. PixelLab enemies on that map sit at the same small scale as the v1 towers, which still look like a different art set.

---

## 3. Melee, clarity, loop and night defense

### Melee feel: 7/10 (F: 5)

Hits now *land*:
- the white silhouette flash;
- a knockback hop;
- a smear arc on every combo step;
- floating damage;
- leaf and bark debris on brush.

The heavy chop's yellow crescent plus a cleared bramble is satisfying (`G78`).

Still missing:
1. **Rolls don't look like rolls** (see above).
2. **Skitter swarms are mush.** Three or four small enemies stacked inside one white-flash blob plus smears, damage numbers and HP bars made the target unreadable (`G17_f_2`). The fighter script whiffed often against Skitters.
3. **The chop crescent is oversized and over-saturated.** A solid lemon-yellow banana roughly 3 tiles long (`G78_bramble_chop2`) clashes with the moody palette. Darken it and give it the same dithered tail the light smear has.

### Clarity: 6/10 (F: 4)

The biggest jump since F. Enemy silhouettes through brush plus the compact HUD fix most of the "damage from nowhere."

What's left:
- the player getting lost in brush (above);
- the faint Razorback lane;
- stacked enemies (above);
- Spitters that need line of sight. `lineOfSight` treats thicket as opaque, so a Spitter inside a thicket never fires (it stayed in `chase` for 4.5 s, `G73`). That contradicts DESIGN ("lobs sap over the brush"). It's harmless rather than unfair, but it is a design mismatch.

### Open-world loop: 7/10 (F: 6)

Better on most counts:
- Treks of 53–96 m.
- Lost sites that you *must* cut into.
- Multi-step objectives (the Market fuse is 44 m from the box).
- Loot on budget.
- Pylons as mid-day extracts (R2D1 extracted at a fresh pylon 41 m from the site, `G49`).
- The paused big map.

The loop now has real decisions.

**The new problem is the death spiral.** In both runs, a single day death on day 2 decided the run:
- After R1D1's dusk death (15 S salvaged) and R1D2's death (0), I entered N2 with 2 towers, and the Relay fell.
- R2D2's death (3 S salvaged) left 32 S and 3 towers. N2 took the Relay to **24/100**, even with Sabotage −10%.

Night 1 is still free (100 → 100 both times), but night 2 jumps to 27 enemies, including 2 Razorbacks at +90% HP. Day deaths come fast:
- R1D2: 60 → 0 HP in 6 s from 2 crawlers and a feral, right at the objective;
- R2D2: about 60 HP in 6 s from a feral pack.

So the swing from "fine" to "lost" is one bad minute.

### Night defense readability: 6/10

- Lanes, chevrons, per-lane incoming counts, threat and boon panels, and "North ▸ 4 more" edge tags are all clear (`G23_wave1b`, `G86_def4_wave`).
- Enemies are small and get lost in tower projectiles when 6–8 bunch up.
- Orange occlusion outlines appear on enemies queued under the left-edge foliage. That's useful, but undocumented.
- `debug=defense&night=4` with 8 towers: the wave was won with the Relay at **15/100**.

---

## 4. New bugs, regressions and console

**Console:** 0 errors and 0 warnings across the whole session.

1. **Night-survived click-through, still intermittent.**
   - Repro: run 2, survive N1, then click the banner at (600, 400).
   - The briefing opens with card 2 selected (`G58`).
2. **Opened chest renders a flat dark rectangle** over its interior (`G44_looted`, `Gz_opened`).
3. **Big map seam:** a 1 px vertical line splits the map panel at x≈795 (`G12_bigmap_zoom`).
4. **Spitter LOS vs. brush.**
   - A Spitter in thicket never attacks (`G73`): `ExploreEnemy` line 252 requires `this.los`, and brush blocks it.
   - Either lob over brush as designed, or update DESIGN.
5. **Field of view depends on window size.** The internal width is 426 at 720p, 480 at 1080p and 532 at 1600×900, so bigger windows see about 25% more jungle.
6. **The Relay is off-screen at drop-off.** You spawn 3 m south of it, with the sprite cropped by the top edge and the arrival toast on top (`G04`).
7. **`debug.killAll()` leaves most enemies alive.** About 15 idle ones remained (`G75` state dump). It's debug-only, but it confuses testing.
8. **Razorback stands on the player.** After a charge it chased to distance 0.0 and stayed overlapped, hiding the player sprite entirely (`G76_rz6`, `G77`).

**Verified OK:**
- the day pauses with the map open;
- Space starts the wave after keyboard-building and Esc (F#11 no longer reproduces);
- death modals and salvage maths;
- the summary skill pick and Save point;
- Sabotage;
- Results;
- integer scaling at all 4 sizes.

---

## 5. Top 12 next fixes (most impactful first)

1. **Player readability in brush.**
   - Draw the promised flat `#d8fdff` 1-texel outline around the player whenever any card overlaps them.
   - Stop the x-ray dither from blending into the player's own pixels: dither the foliage *around* the player, not over them.
   - Consider shifting the cloak away from fern green, toward olive-brown or the rust accent.
2. **Soften the death spiral.**
   - Scale the drone salvage with how far you got, or keep a floor of about 20 S. Alternatively, give a free emergency Relay patch or a free tower on the first night after a day death.
   - Re-tune N2: 27 enemies + 2 Razorbacks at +90% HP took 3 towers to 24 HP.
3. **Day burst damage.**
   - Cap simultaneous melee attackers. An attack token of 2 would mean a crawler + feral pack can't do 60 HP in 6 s.
   - Add a 0.4 s post-hit invulnerability so stacked hits can't chain.
4. **Rework the roll animation** into a real tuck-and-roll (4–6 frames, squash at the start and end, a dust puff), so i-frames read.
5. **Razorback lane:** thicker, brighter ground streaks that pulse toward the charge direction, readable over leaf litter and brush. Keep it in-world.
6. **Stacked-enemy clarity:** limit the white flash to the target that was hit; offset or merge damage numbers; drop HP bars on full-HP enemies.
7. **Fix the click-through for good:** ignore pointer input on the briefing for 300 ms after a scene change, or require pointerdown *and* pointerup on the card.
8. **Spitter vs. brush:** let it lob over brush as DESIGN says (use a no-brush LOS for the glob arc). Otherwise a rooted turret in a thicket is a free kill.
9. **Ruin floor motif:** break the star/diamond slab pattern. Rotate or flip slabs, add 3–4 slab variants, and make the Relay clearing's edge irregular.
10. **Container and HUD polish:** fix the opened-chest black rectangle, the big-map seam and the clock "4" glyph. Nudge the drop-off spawn or camera so the Relay is on screen and not under the toast.
11. **Bramble Crawler art:** make it a thorny, vine-wrapped crawler (PixelLab with the Spitter as style reference). Right now it's a hound with a saddle-bag that doesn't match its name or role.
12. **Night map:** scale towers and enemies up to about 1.5 tiles, and replace the square plinths with irregular stone or wood pads so the night stops looking like a TD grid.
    - Lock the field of view per window size (fixed internal 426×240 with letterbox), so a bigger monitor doesn't mean easier days.
    - Tone the chop crescent down from lemon yellow.

---

## 6. Scores (1–10)

| Axis | F | **G** | Why |
|---|---|---|---|
| **Visuals** | 7 | **8** | The PixelLab cast is a real upgrade: the Razorback, Spitter and Feral are excellent. Smears, the pylon disc and opened variants all landed. Points lost to the gridded ruin motif, the black chest rectangle, the off-theme Crawler, and the night map still looking like a TD grid. |
| **Atmosphere** | 8 | **8** | Still dense and moody. Dusk is darker with the red minimap ring, and spore clouds add texture. |
| **Melee feel** | 5 | **7** | Smears, flash, knockback, debris, numbers and a meaty chop. The roll animation, Skitter mush and oversized crescent hold it back. |
| **Open-world loop** | 6 | **7** | Real treks, lost sites that need cutting, multi-step objectives, loot on budget, a paused pannable map. The death spiral and burst damage make one mistake run-ending. |
| **Clarity** | 4 | **6** | Enemy silhouettes and the compact HUD fix most hidden threats. The player in brush, the faint Razorback lane and stacked enemies remain. |
| **Polish** | 6 | **7** | 0 console errors, integer scaling, the map pause, centred banners. The click-through survives, plus a few new art and HUD nits. |

---

## Verdict

This fix wave addressed nearly all of critic F's list: 9 of 15 items are fixed or mostly fixed, 5 partly, and 1 is not (the intermittent click-through). The PixelLab characters lift the game, and melee now has real feedback. Enemies hidden in brush are now visible, which removes F's "damage from nowhere."

What's left:
- **Player readability in brush** (ghosted by the dither, camouflaged cloak).
- **The difficulty swing:** one day death on day 2 sank one run and left the other on 24 Relay HP.
- **Burst damage from packs.**

**Top fixes:**
1. Player outline / no dither over the player.
2. Salvage floor + N2 retune.
3. Melee attack tokens + post-hit i-frames.
4. A real roll animation.
5. A stronger Razorback lane.
6. Then the polish tail: click-through, Spitter LOS, ruin motif, chest sprite, Crawler art, night-map scale.
