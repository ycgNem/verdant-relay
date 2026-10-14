# Verdant Relay: Critic H (art direction and visual quality)

**Session:** 2026-10-13, frozen build at `http://localhost:5191`. I drove my own headless Chrome through a persistent driver
(`.playwright-mcp/roundH/driver.mjs` + `c.sh`). I checked at **1280×720** (day ×2, internal 640×360) and **1920×1080**
(day ×3). Screenshots, zoom crops and contact sheets (`HS_*`) are in `.playwright-mcp/roundH/` (`H01`–`H54`).

**What I looked at:**
- **Screens:** title, Collection (all 3 tabs), Settings, the guided night-1 briefing, the night-3 briefing, the summary, Results (win/loss).
- **Jungle:** the guided day 1 (Market), plus debug explore in all 5 districts. I teleported to every district's major site and landmark, the Relay clearing, a ford, a pylon, spore pods and a feral camp.
- **Day cycle:** day, late day, sunset, full dark.
- **Combat:** fights driven with real mouse input. I also captured slash, chop, roll and death in slow motion: the page's rAF clock was scaled ×0.1–0.25 in-page only, nothing in the repo was touched.
- **Enemies:** a lineup of all 5 day enemies.
- **Night:** night 4 with 12 mixed towers through a wave, and night 6 through to the Colossus.

I judged everything from the PNGs. Where a number appears, it was measured on the PNG (luminance percentiles, hue, pixel run-lengths).

**Console:** 0 errors and 0 warnings.

---

## 0. Did earlier visual complaints land?

| Source | Item | Verdict | Evidence |
|---|---|---|---|
| G#1 | Player lost in brush, dither over the player | **Mostly.** Tall cards now stay off the player and the outline always reads. Low fern cards still checker the legs. | `H31z_pod` clean; `H25z_xray`: the lower 40% of the sprite is a fern/ground checker |
| G#4 | Roll doesn't read | **Fixed.** A real tumble (rotated crouch frames). Rotation breaks the selective outline on frames 5–7, but at ×2 it reads. | `H24_roll_strip`, `H24z_roll5` |
| G#5 | Razorback lane faint | **Fixed (over-corrected).** Now a hard red rectangle with orange chevrons. Unmissable, but it reads as an RTS UI decal stamped on the jungle. | `H34z_lane` |
| G#6 | Stacked-enemy mush | **Not fixed.** One hit still turns 2–3 bodies into a white blob, with "!" and numbers on top. | `H20z_blob` |
| G#9 | Ruin slab grid | **Mostly fixed.** Slabs are staggered, stained and cracked. | `H21_clear`, `H26z_lineup` |
| G#10 | Opened chest black rectangle | **Fixed.** The lid is hollow with a brown interior. | `H38z_side` |
| G#11 | Crawler = dog with a saddle-bag | **Fixed.** Now a bark-and-thorn quadruped. It reads as a spiny boar/hedgehog, but it is on-theme. | `H26z_lineup` |
| G#12 | Night map looks like a TD grid, towers tiny | **Partly.** Plinths are chipped and off-grid. Towers are still tiny, and I found the root cause (§4). | `H41z_towers` |
| G (tail) | Lemon chop crescent | **Not fixed.** Still a saturated lemon banana about 3 tiles long. | `H23_chopL_stripB` |
| G#15 | Field of view per window size | **Fixed.** Day is 640×360 at ×2 / ×3 everywhere. | run-lengths in §6 |
| Newcomer | Checkerboard patches look like artefacts | **Not fixed.** | `H45z_bottom`, `H45z_edge` |
| Newcomer | Red everywhere | **Partly.** There is now one colour language, but every enemy still carries a red ring plus a dark disc, and splats are saturated red/green/navy paint. | `H46z_boss`, `H27z_corpses` |

---

## 1. Environment (day jungle)

**What's genuinely good.** The individual PixelLab assets are excellent at close range: kapok and fig canopies, monstera, ferns, heliconia, root tangles (`H11z_shaft`). The dual-grid ground blends are seamless; I never saw a tile seam. The Relay clearing's paving now looks like worn concrete, not a board (`H21_clear`). Fords are readable as stepping stones (`H36_ford`). At 1080p (`H45_jungle_1080`), a still frame could pass for a Sea of Stars-adjacent screenshot.

**The problem is the composite, not the parts.**

1. **No value structure. Everything is mid-dark teal-green.**
   - Luminance across the play area (Residential landmark, `H11_resi_landmark`): 5/25/50/75/95th percentiles are **20 / 22 / 39 / 64 / 118** out of 255. Half the screen sits under 40.
   - On a typical trail (`H32_pod_open`), the walkable path averages **52**, the brush **43–57** and the canopy **47**. The path, the wall and the overhead are the same value; only texture tells them apart.
   - Eastward and Children of Morta separate ground plane, mid props and overhead by at least 25–30% value. This is why the newcomer "could rarely tell path from brush from wall."
   - Cause: `PostFx` multiplies canopy shade (`canopyShade: 0.42`) onto everything, ground included, and the shade texture covers trails as much as brush. `dayAmbient 0.92` then dims the whole frame.
2. **The five districts are one district.**
   - Mean hue at the five major sites spans only **155°–171°**, with saturation **0.20–0.27** (`HS` sheets `H11_sheet_major`, `H11_sheet_land`).
   - The per-district `tint` in `jungle.js` is ±4–6%, which is invisible after the grade.
   - Identity comes only from one ruin piece per site:
     - **Greenhouse:** iron frame and statue head. This is the only one that reads.
     - **Flooded:** train car.
     - **Market:** car wreck.
     - **Residential and Data Center:** walls, stairs and pillars. No houses, no server halls, no cables, no blinking LEDs.
   - "Municipal Data Center" looks exactly like "Overgrown Market" (`H11_dc_major` vs `H11_market_major`).
3. **Decal repetition.** In one Relay-clearing frame (`H21_clear`), the same crossed-twig decal appears **4×** and the same bone pile **3×**. The twigs are dark "X" marks on the ground that read like UI markers or caltrops.
4. **Foreground leaf frame = artefact.**
   - The leaves are procedural ellipses (`PostFx.leafTexture`). Their fade is a per-pixel Bayer threshold across a **straight horizontal band** (`ATMOS.leafFrame.y [16, 56]`), so a ruler-straight checker stripe crosses the bottom of the screen (`H45z_bottom`). Leaves also turn into translucent, checker-edged blobs over props (`H45z_edge`).
   - All screen-space dithers (canopy steps, light radius, vignette, `PostFx.js:70`, x-ray `JungleWorld.js:85`) use `gl_FragCoord`/screen px. The pattern therefore stays fixed to the screen while the world scrolls underneath (shower-door crawl on every shade edge).
5. **Dusk and night don't change the mood, only the brightness.**
   - Late-day vs sunset vs full dark, mean RGB at the Market major site: **58/83/69 → 49/73/66 → 32/60/62** (`HS_cycle`).
   - Sunset is a 12% dim with no warm shift at all. The big "SUNSET" banner is doing all the work.
   - Night is a flat blue multiply outside the light ellipse. **No emissives survive:** pixels with any channel above 200 drop from **10,996** (day) to **3,584** (night), and the glowing fungus, terminal screens and eyes all go dark with everything else (`H12z_dark`). Compare HLD and Children of Morta, where night is about the glows.
6. **No water interaction.** The player, ferals and crawlers stand on water at full height, boots on the surface, with no waterline, ripple or splash (`H36_ford`, `H20_pre`: a feral and a crawler "standing" mid-river). The water has no surface motion visible at game scale and no specular.
7. **Containers and props swallowed by foliage.**
   - A chest is 80% hidden behind an elephant-ear card (`H38z_side`).
   - Opening it from the south hides it completely behind the 2.2-tile player (`H38z_ab`).
   - The pylon, the extraction point the newcomer "never found", is a **3-texel-wide pole** with a cyan tip, and on/off are nearly identical (`H37z_on`). It's the weakest landmark in the game.
8. **Spore pods.** The pod is a ~10-texel magenta bulb buried in ferns (`H32z_pod`, I had to project its coordinates to find it). The cloud is a flat yellow-green checker slab with a hard edge (`H31z_cloud`), which reads as a render bug rather than gas.

## 2. Characters and animation

- **Cast quality:** good commercial level.
  - The Spitter is the best design: an instant read.
  - The Razorback and Skitter are distinct. The new Crawler is on-theme. The Feral reads as a person with a skull mask (`H26z_lineup`).
  - Scale is consistent within the day set: the player is ~2.2 tiles, Razorback ~2, Crawler and Skitter ~1.3.
- **Palette clash: the Feral wears the player's costume.** Olive-green hooded cloak and the same silhouette (`H26z_lineup`, `H29_pickups`). In a 3-body fight, the "which one is me" read rests entirely on the cyan outline.
- **Player outline strobes.**
  - `playerOutline.coverRadius 1 / coverAhead 2` means "any brush within 1–2 tiles", which in this jungle is almost always true. The outline is cyan in ~95% of my frames, even on open dirt (`H21_clear`), and flips to near-black at fords (`H36_ford`).
  - Either keep it constant or switch only when actually occluded.
- **Animation:**
  - Walk: 6 frames, clean, no slide (`H07_walkstrip`).
  - Slash: the anticipation is weak. Frames 1–4 barely change before the smear appears on 5–6 (`H22_slash_strip1`).
  - Chop: a good crouch-and-heave (`H23_chopL_stripB`).
  - Roll: reads now. It's a rotated sprite, so outlines go ragged mid-roll (`H24z_roll5`); acceptable at ×2, not at ×3.
  - Deaths: flash, squash, a 3-step fade and a splat (`H28_deathA/B`). Functional, but every creature dies the same way and leaves an identical flat splat.
- **Night creatures (V1) are a different art set.**
  - Burrower, Ruin Guard and Seed Carrier use flat 2–3-tone Endesga ramps with heavy dark outlines (`H46z_guard`, `H43z_seed`). Next to the PixelLab Razorback and Crawler on the same lane, the V1 ones look like placeholders.
  - The Colossus (V1, 96×112) holds up best.
- **Icons of creatures** (Codex, briefing, night panel) use the **south-facing** frame shrunk to ½ (`Assets.iconScale` returns 1/n when the frame is larger than the slot). The Razorback icon is a 10-px dark vertical smudge and the Crawler a brown blob (`H40z_enemyicons`, `H03_codex`).

## 3. Effects

| Effect | Verdict | Evidence |
|---|---|---|
| Slash smear | Good. Pale blade with a cyan dithered tail, on-palette. | `H20z_smear` |
| Chop crescent | Lemon `~#ffe640` banana, the most saturated object on screen, plus a peach "leaf chip" that hangs in the air for 4+ frames. | `H23_chopL_stripB` |
| Hit flash | Full-white silhouette lasting several frames. On stacked enemies it merges into one white blob covering neighbours and the "!" mark. | `H20z_blob` |
| Splats | Flat, saturated, single-tone paint: pure red on grey paving, lime green, navy. They persist and outshine living enemies. | `H27z_corpses` |
| Razorback lane | Readable, but a hard red rectangle with a dithered red fill is UI, not world. | `H34z_lane` |
| Spitter landing ring | Good: a magenta ring under you, distinct from the red danger rings. | `HS_tel` |
| Pickups | Lovely item sprites. The stepped glow disc sits ~6 texels below the item's own shadow, so it reads detached. | `H33z_pick` |
| Spore cloud | Flat checker slab (see §1.8). | `H31z_cloud` |
| Damage numbers | Readable and merged. Fine. | `H20z_smear` |

## 4. Night defense map

1. **The night is drawn at half the day's texel size, and at 1080p it isn't pixel-exact.**
   - `DEFENSE_VIEW.res = [1280, 720]` at 32 px/tile is fixed, whatever the window. At 720p that is **1 screen px per texel**, against **2** by day. At 1080p the 1280×720 canvas is stretched to 1920×1080: **×1.5**.
   - Run-length histogram on `H44_def_1080`: runs of **1 px ×316, 2 px ×315, 3 px ×57**, i.e. alternating mixels. The day at 1080p is a clean **3 px ×350** (`H45_jungle_1080`).
   - This one decision is why towers and enemies look tiny (G#12), and why the same Crawler you fought at 128 px tall by day is a 50 px figure at night (`H42z_north`).
   - It breaks the project's own "pixel-exact" rule.
2. **TD-board furniture.**
   - Every pad, built or empty, has a bright orange 4×4 square dot.
   - Every enemy has a 1-px red ring plus a dark purple disc. With 18 enemies on screen there are more red ellipses than creature pixels (`H46z_boss`, `H42z_south`).
   - The lanes are clean dark-brown ribbons with no worn edges, ruts or puddles, unlike the day's mud/dirt Wang blends.
3. **Towers are the V1 set at 32×48.** Blue-grey bodies with type-coloured outlines (`H41z_towers`, `H44z_tower`). They're tidy, but low-detail next to the PixelLab plinth props and trees, and at ×1 they're about 1 tile.
4. **The Relay is a V1 sprite in both modes.** Flat Endesga grey box, saturated cyan crystal, orange cabinet (`H06z_relay`, `H41z_relay`). Beside the PixelLab player it looks like a toy: simpler shading, fewer tones, no grime. It's the game's emblem: on the title, at day spawn, on the night map and in Results.
5. **Does night feel like the same game?**
   - Same flora kit, so roughly yes.
   - But the night map is a different, static place: the Relay sits at the right edge with two dirt lanes, not the paved clearing you walk out of every morning.
   - It's lit greener and brighter than the jungle at night (mean **30/43/39** vs **18/42/48**) and is drawn at half scale.
   - It feels like the board game in the box, not the same world after dark.

## 5. Menus and UI

- **Solid but generic.** Navy panels with 1-px borders, Tiny5/Silkscreen and amber hint boxes, consistent everywhere (`HS_menus`, `H50_summary_1080`, `H53_briefing_1080`). Hierarchy on the summary and briefing is now clear.
- **It still reads as a polished dev tool** because there is no authored art in the UI:
  - The **logo** is Silkscreen typed in flat green/cyan with a drop shadow (`H54z_logo`). No wordmark, no vine, no crystal.
  - **Placeholder glyph icons:** Parang `⁘` and Wider Choice `✦` (`H02z_cards`).
  - **District cards** are a coloured header bar plus text; no picture of the place (`H53_briefing_1080`).
  - **Wide-tracked display titles** ("B A C K   H O M E   S A F E", `H50z_title`) look spaced out rather than designed.
  - The guided briefing's "Tonight's attack" panel is ~70% empty (`H05_briefing_guided`).
- **Mixed pixel densities in the HUD.**
  - At 720p, "Health" is 16 px (2-px font pixels) and "100 / 100" and the district name are 8 px (1-px font pixels), in the same panel, over 2-px world texels (`H33z_hud`).
  - At 1080p, fonts sit on 2-px pixels over 3-px world texels (`H45z_hp`).
  - The white "100 / 100" on a saturated green bar is barely legible.
- **Good:** the minimap ring, the clock glyphs (the "4" fix landed, `H33z_mini`), the goal strip with the amber arrow (`H33z_goal`) and the resource icons (`H40z_res`) are clean and on-grid.

## 6. Pixel exactness and cohesion

- **Day:** exact. 640×360 at ×2 (720p) and ×3 (1080p); run-lengths are all multiples of 3 at 1080p. The title backdrop is exact too (`H54z_bg`).
- **Night: ×1.5 at 1080p** (§4.1). This is the biggest technical art bug in the build.
- **Light direction:** consistent top-left on V2 sprites. V1 sprites use the same rule but with flatter ramps.
- **Rotated roll frames** produce mixels on the outline (§2).
- **Cohesion summary:** three art generations share the screen:
  - PixelLab V2 (jungle, day creatures, props);
  - V1 Endesga (Relay, towers, night creatures, title-screen props);
  - procedural/shader art (leaf frame, spore cloud, splats, lane telegraph, shafts).

  The procedural layer is where most of the "it looks like a render artefact" reactions come from.

---

## 7. Art budget plan (~10 PixelLab generations left, the rest hand-made)

Spend PixelLab only where a large, detailed, shaded object is needed and a style reference exists. Hand-draw small, iconic and FX pieces. Make code carry everything else.

| Piece | Method | Size / frames / palette notes |
|---|---|---|
| Relay core redraw | PixelLab `create_map_object` ×1–2, style ref `ruin_train_car` + `player`, then hand-finish | 128×144, idle 4 frames (crystal pulse, hand-animated). Keep the cyan crystal as the brightest value; grime, moss and cable roots into the ground. |
| 4 district hero ruins | PixelLab ×4, style ref `ruin_train_car` | Market: kiosk row with torn awnings, 160×96. Flooded: half-sunk platform with a station sign, 160×96. Residential: collapsed apartment facade with balconies, 128×160. Data Center: server-rack hall / cooling unit with cable bundles and 2 LED pixels (emissive), 128×112. |
| Pylon redraw | PixelLab ×1 + hand edits | 48×96 relay mast with a dish, guy cables and a junction box. "On" state: hand-made 4-frame cyan beacon pulse + 2-frame dish light. |
| Foreground leaf frame | Hand-made | 5 silhouettes (monstera, palm frond, banana leaf, fern, vine), 96–160 px, 3-tone near-black ramp `#050a06 / #0a160c` + rim `#16301c`. Placed whole, no per-pixel fade. |
| Ripple / splash | Hand-made | Ripple 24×8, 3 frames; splash 16×16, 4 frames. 3 tones from the water ramp + 1 highlight. |
| Spore pod + cloud | Hand-made | Pod 20×20, 2 frames, magenta bulb with a pale rim. Cloud: 3 puff sprites 32×24, 3 tones (`#9fae3a / #c5c95a / #e9e48a`), drawn as 6–8 instanced puffs. |
| UI | Hand-made | Wordmark logo ~320×96 (vines through "VERDANT", the crystal as the A in "RELAY"). 3 icons 24×24 (parang, wider choice, scarf). 9-slice panel frame 24×24 with corner rivets/vines. |
| Tower L1 repaint (later) | Hand-made | 4 base towers at 48×64, 5–6-tone ramps, selective outline. L2/L3 as overlay parts, not redraws. |

---

## 8. Scores (1–10, harsh; 7 = good commercial indie)

| Axis | Score | Why |
|---|---|---|
| **Environment** | **6.5** | First-rate individual flora, seamless ground and a dense mood. Lost on value structure (median lum 39–45), five indistinguishable districts (hue 155–171°), leaf-frame and dither artefacts, no water interaction, a flat dusk and a dead night. |
| **Characters / animation** | **7** | A strong, distinct PixelLab cast, a clean walk, a readable roll and chop. Lost on the Feral sharing the player's costume, the rotated-roll mixels, generic deaths and flat V1 night creatures. |
| **Effects** | **6** | The slash smear, Spitter ring and pickup sprites are good. Lost on the lemon chop, the white flash blob, flat paint splats, the UI-rectangle lane and the checker spore cloud. |
| **Night map** | **4.5** | Half the day's texel size, ×1.5 mixels at 1080p, V1 towers and Relay, orange pad dots, a sea of red rings, and a different place lit differently. |
| **UI / menus** | **6** | Consistent, readable and on-grid. But no authored art: a typed logo, glyph icons, no district art, mixed pixel densities, shrunken south-facing enemy icons. |
| **Cohesion** | **5.5** | Three art generations (PixelLab, V1 Endesga, procedural) on one screen, and day/night at different scales. |

---

## 9. Top 12 fixes (ranked by visual uplift per unit of work)

1. **Night map at day texel size and integer scale** (code; `DefenseScene`, `DEFENSE_VIEW.res`).
   - Render the night through the same integer pipeline as the day: internal = window ÷ s, with s = 2 / 3 / 4, and ppu 32. Every texel is then s px, matching the day.
   - The 30×17 field won't fit a 20×11 view, so add a pannable camera: drag, WASD and edge pan; auto-frame the lane under attack; show the lane overview in the side panel.
   - If panning is rejected, the minimum is an integer divisor at 1080p (960×540 at ×2) so there are no ×1.5 mixels.
   - Target: run-lengths on a 1080p night screenshot are all multiples of 2 or 3.
2. **Value structure: light the paths, sink the walls** (code; `PostFx`, `TerrainBaker`, `JungleWorld._buildShade`).
   - Multiply the shade texture by ~0.4 on trail and clearing tiles, so the canopy doesn't darken walkable ground.
   - Raise dirt/paving levels +15–20% value in the baker.
   - Darken the base of upright brush cards 10–15% (a vertical gradient in the card shader).
   - Target: path median ≥ 70, brush 40–50, canopy ≤ 40 on `H32_pod_open`-type frames (currently 52 / 43–57 / 47).
3. **District identity** (art: 4 PixelLab gens; code: grade).
   - Add one hero ruin per non-Greenhouse district (§7) and place 1–2 per major site.
   - Per-region colour grade in `PostFx`, blended by region distance: raise `tint` to ±12–18%.
     - Market: warm amber.
     - Flooded: cold teal.
     - Greenhouse: lime.
     - Residential: rust/brick.
     - Data Center: cyan-violet.
   - Add a per-district decal subset (Data Center: cables, panels, LEDs; Residential: tiles, furniture scraps).
   - Target: mean-hue spread across the five major sites ≥ 50° (currently 16°).
4. **Dusk and night as moods, with emissives** (code).
   - Sunset: lerp `uTint` toward `#ffb070` (strength 0.25) and add longer, warmer shade over the first 40 s.
   - Night: moonlit blue as now.
   - Add an emissive flag (sprite alpha bit or a separate mask texture) for eyes, glow fungus, terminals, pylon tips and the Relay crystal, exempt from darkness and the vignette.
   - Spawn fireflies after sunset.
   - Target: bright-pixel count at full dark ≥ 50% of day (currently 33%), and a visible hue shift at sunset.
5. **Replace the procedural leaf frame and world-anchor the dithers** (art: 5 hand-made leaves; code).
   - Place whole authored leaves at the corners with parallax; drop the per-pixel band fade (no straight checker stripe).
   - In `PostFx` compute the canopy/light Bayer from world px (`floor(px + uFocus*uPpu)`) so the patterns move with the ground.
   - Make the vignette hard-stepped without dither.
6. **Water interaction** (art: ripple + splash, hand-made; code).
   - In shallow and ford tiles, clip character sprites 7–9 texels above the feet (shader discard below a waterline in sprite UV), draw the 24×8 ripple under them, and splash on entry.
   - Never place idle enemies on deep water.
7. **Effect palette pass** (code, `Fx.js`, `JUICE`).
   - Hit flash: 1 frame white, then 2 frames of a red-orange tint, only on the sprite that was hit.
   - Chop crescent: ramp `#f2c46d / #c9813b / #6b3d24` with the slash's dithered tail, ~40% shorter; kill the floating leaf chip after 2 frames.
   - Splats: 3-tone ramp, 50–60% desaturated toward the ground colour, fade over 30 s.
   - Razorback lane: drop the rectangle outline and use rounded ends with animated chevrons over a ground-dust dither.
8. **Relay and pylon redraw** (art: PixelLab ×2–3 plus hand animation, §7). These are the two objects the whole loop points at. Today the Relay looks like a toy and the pylon is a stick (`H06z_relay`, `H37z_on`).
9. **Night board clutter** (code).
   - Remove the orange pad dot on built pads. Empty pads glow only on hover or when affordable.
   - Show enemy rings only on the hovered or targeted enemy; others keep the shadow.
   - Give the lanes the day's mud/dirt Wang edge and ruts.
   - Re-light the night map toward the jungle-night grade (blue ambient plus amber lamp pools), so it feels like the same world after dark.
10. **Separate the Feral from the player and calm the outline** (code).
    - Palette-swap the Feral cloak at load (per-texel hue remap in `Assets`) to bone/rust (`#7a4a3a / #a08060`). No new art.
    - Make the player outline switch to cyan only when actually covered: stencil test, not "brush within 1–2 tiles".
11. **UI art pass** (art: logo, 3 icons, panel 9-slice; code).
    - Creature icons: use the `e` direction row, crop to the opaque bounding box, scale ×1/×2 only, never ½.
    - District cards: auto-render a 160×64 "postcard" of each district's hero site to an offscreen target at 1×.
    - Put HUD text on the world texel grid (16 px at 720p, 24 px at 1080p), and add a dark outline to the HP number.
12. **Spore pods, containers, decals** (art: pod + cloud, hand-made; code).
    - Swap in the new pod and puff cloud.
    - Keep foliage cards out of a 1-tile radius in front (south) of containers, so loot isn't hidden behind an elephant ear.
    - Cap any single decal at ≤ 1 per 8×8-tile window (the twig X and the bone pile).
    - Align the pickup glow disc under the item's shadow.

---

## Verdict

At the asset level, Verdant Relay already has commercial-grade pixel art. The PixelLab jungle and cast are lush, consistent in light and outline, and occasionally beautiful. What holds it back is art direction above the asset:

- **No value hierarchy:** path, wall and canopy all sit around 40–55 luminance.
- **Five districts that look like one.**
- **A procedural layer that reads as glitches:** the leaf frame, checker clouds, paint splats and the rectangle lane.
- **A day/night split:** night is drawn at half the texel size, non-integer at 1080p, with the V1 Relay and towers.

Fix the night scale and the ground lighting first; both are code-only and are the biggest visible wins. Then spend ~7 of the remaining PixelLab generations on the Relay, the pylon and four district hero ruins, and hand-draw the leaf frame, the water ripple, the spore cloud and a real logo. Done in that order, I'd expect Environment and Cohesion to reach 7.5–8.
