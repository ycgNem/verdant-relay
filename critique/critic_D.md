# Verdant Relay: Art Direction and Game-Feel Critique (Critic D)

**Session:** 2026-10-13. I used the built-in browser pane on the frozen build at `http://localhost:5191`. Most checks ran at 1280×720, with spot checks at 800×450.

**Method.** I visited every screen and every debug entry point. For pixel inspection I rendered the WebGL canvas and copied regions into an overlay canvas, magnified 4–10× with `image-rendering: pixelated`, then screenshotted that overlay. The "mag" screenshots are real render pixels, not browser scaling.

When the pane was hidden, `requestAnimationFrame` stopped firing. To keep timing deterministic I froze `scene.update` and stepped `scene._upd(1/60)` by hand (`scene.update(1/30)` in defense).

Screenshots are in `.playwright-mcp/round2-visual/D_*.{jpg,png}` (53 files). Filenames are cited inline as `[D_xx]`.

**Overall verdict.** The sprite art itself is strong and on-contract: Endesga palette, dark outlines, readable silhouettes, good material detail. Perceived quality is lost in the presentation layer:

- **Texel density is never 1:1 except on the player's row.** Three causes: a perspective camera, a non-integer upscale, and a defense camera that shrinks sprites to about 63%.
- **Smooth, non-pixel surfaces sit next to the crisp sprites:** the canopy, the title-screen ground and ruins, the lighting gradients, and the UI font.
- **The VFX are small and thin** for a 480×270 game.

Fixing those three things would raise the look more than any new sprite would.

---

## 1. Bugs and visual defects (with repro)

| # | Defect | Repro | Shot |
|---|---|---|---|
| B1 | **Texel density varies by about 65% from the top of the screen to the bottom in Explore.** The camera is a `PerspectiveCamera` (fov 38). Projected px per tile at render res: 24.7 (top), 27.7, **31.6 (player row)**, 36.7, 41.1 (bottom). Sprites near the top are shrunk (texel rows and columns dropped). Sprites near the bottom are enlarged with uneven 1–2 px "mixels". A sprite walking vertically visibly crawls as pixels pop. | `?debug=explore&district=overgrown_market&night=3`. Project `(p.x..p.x+1, 0, p.z+dz)` for dz ∈ {-6…5}. | D_17, D_50 |
| B2 | **Floor texture rows are dropped.** Depth foreshortening gives 27 px per 32-texel tile, so brick courses come out at uneven heights (some rows 1 px thinner). The 1/32-tile camera snap in `ExploreScene._placeCamera` fixes X but can't fix Z under a 55° pitch. | Same scene. Mag any floor area. | D_16, D_25 |
| B3 | **Defense renders every sprite at about 0.63× texel scale.** At 960×540 the fitted camera gives **20.3 px per tile**, so 32 ppu sprites lose about 37% of their texel columns (nearest-neighbour shrinking, no mipmaps). Arc Spire turns into grey stripes, Thorn Nest into a fuzzy blob, and the Colossus is about 60 px tall. Detail drawn into the sprites is literally not displayed. | `?debug=defense&night=1&…`. Project two points one tile apart. | D_39, D_41, D_44 |
| B4 | **Non-integer final upscale.** 480×270 goes to 1280×720 at 2.667×, and to 800×450 at 1.667×. Night 960×540 goes to 1280 at 1.333×. Every texel becomes 2 or 3 screen px (1 or 2 at night), so outlines and dithering look irregular. The Settings "Sharp 640×360" option is the only integer mode at 1280×720, but "Chunky" is labelled "the intended look". | Settings screen. `canvas` is 480×270 CSS-scaled to 1280. | D_03 |
| B5 | **Elite and scaled sprites have mixels.** The elite Razorback uses `scale` 1.3, and trees use 0.9–1.14 (`ExploreScene.js:170`). This gives mixed 1 px and 2 px texels inside one sprite. | Flooded Transit night 3, elite Razorback (Clear the Blockage). | D_28 |
| B6 | **The enemy HP bar is drawn across the sprite body.** The elite Razorback's bar sits over its back, not above it. The bar height seems to ignore `scale`. | Same as B5. | D_28 |
| B7 | **Right-hand HUD column hides threats.** The minimap plus objective panel covers about 26% of the width and 55% of the height in the top-right corner. The elite Razorback's charge started and ended under the Objective panel, and its telegraph lane ran under it. Enemies at top-left also hide behind the HP/Carried panels and the timer. | Flooded Transit: teleport to (40.5, 5.5) and step until `windup`. Data Center: teleport to (8.5, 18.5). | D_26, D_27, D_34 |
| B8 | **The tutorial hint covers the most important Summary content.** The skill-point hint sits over the "Loot banked" header and the Scrap line, while the skill cards it refers to are at the bottom. | `?debug=summary`, wait about 2 s. | D_12 |
| B9 | **The Briefing hint overlaps district card 2 and the Loadout panel** (about 25 px). | `?debug=briefing&night=1`, then click card 1. | D_08 |
| B10 | **Floating "LEVEL 3" texts collide** ("LEVEL 3LEVEL 3") when adjacent towers are upgraded, and damage numbers merge into lane tags ("North ▸ 18 more12"). There is no stacking or offset. | Defense: build adjacent towers and upgrade them back to back. | D_38, D_42, D_45 |
| B11 | **Lane tags and the boss entry are clipped at the left edge.** "South ▸ 9 more" starts at x=0. The Colossus spawns at x≈-0.3, under the lane tag and at the screen edge. Its charge-windup path is mostly off-screen, and only a short red stub is visible. | `?debug=defense&night=6`. Start the wave and step until `boss.state==='chargeWind'`. | D_43, D_47 |
| B12 | **Boss hint copy says the root telegraph is a "green circle".** On screen it reads tan or olive, because the Mortar's amber landing telegraph (`Tower.js:236`, `#feae34`) stacks on the boss's green root circle (`DefenseEnemy.js:383`). Friendly mortar telegraphs use the same filled-disc language as enemy threats. | Night 6 with a Mortar covering the South lane. | D_44 |
| B13 | **"The Colossus is about to CHARGE along the red path!" toast with no visible path.** By the time the toast is read (it is time-based), the path has faded. Combined with B11, the warning has no visual anchor. | Night 6. | D_45 |
| B14 | **Loot can spawn inside a solid wall tile and renders on top of the wall block.** Seen with `scrap@4.25,29.85`, where `world.solidAt` is true. | Overgrown Market night 3: `debug.killAll()`, then inspect `scene.pickups`. | D_51 |
| B15 | **The Tab map is left-aligned and not centred.** The 530×310 canvas is drawn at 847×495 (1.6×, non-integer, so wall lines are uneven), with about 400 px of empty panel on the right. The minimap is also 1.5× (212×124 drawn at 319×188). | Explore, press Tab. | D_22 |
| B16 | **Enemies stack on the same spot and on top of the player.** Two crawlers occupy one sprite, and crawlers or skitters draw over the player's legs and torso so he disappears. There is no separation steering and no occluded-player silhouette. | Any melee pack. | D_18, D_30, D_34 |
| B17 | **Results screens are inconsistent in debug.** Victory shows "Nights survived 1/6" next to "holds through all 6 nights" and **"Victory #0"**. Defeat shows "Research earned +8" but "Total Research 0" under "banked permanently". These are debug-state artefacts, but the template should guard against a zero ordinal and show the real banked total. | `?debug=results&victory=1`; also lose a debug defense. | D_13, D_53 |
| B18 | **The UI is unreadable at 800×450.** Fonts drop to 6.7–8.3 px (`df-new` "NEW" 6.7 px, "INT" labels 7.1 px, `df-phase`, `df-lbl`, `hotkey` 8.3 px). | Resize to 800×450, any defense screen. | D_49 |

---

## 2. Art-in-context issues (per sprite and tile)

**Characters and enemies**
- **player:** Excellent sprite (hood, goggles, scarf, backpack antenna). Problems:
  - The green hood blends into the Greenhouse floor and the orange scarf into the Residential planks [D_30, D_32].
  - It is only readable on grey or blue floors. Consider a 1 px lighter rim on the top-left or a subtle team-colour ground ring.
  - The muzzle flash is not visible at game scale. Code uses 3 particles of 0.07 tile for 0.12 s (`Player.js` fire()).
- **crawler:** Good silhouette. Its red-brown and green body is camouflaged on the Greenhouse floor and on the night defense grass [D_31, D_39]. Darken the floor or raise the crawler's value; the red eyes are too small to carry it.
- **skitter:** Reads well because magenta is unique. Note it is the same hue family as the spores and the Spitter.
- **scav:** Reads well on blue. Its red bolt is the clearest projectile in the game [D_27].
- **razorback:** Nice. The elite version suffers from B5 and B6.
- **spitter:** Strong pink. Good.
- **colossus:** The boss reads as "a slightly bigger brown thing". At 0.63× in defense it is only about 2× crawler height, and its brown bark sits on dark-green grass at night. The red heart-core is the only accent. Give it a stronger rim light or emissive core glow, a ground shadow sized to the sprite, and camera framing on spawn.
- **survivor:** Good (hard hat and light stick read clearly).

**Towers (defense)**
- All towers lose detail to B3. At the size they actually display, the 6 types are hard to tell apart at a glance, except Arc Spire (stacked rings) and Mortar (green pod).
- The **rank chevrons are as large as the tower head**. They are drawn with canvas `stroke()`, so they are anti-aliased with semi-transparent edge pixels, which breaks the STYLE.md no-AA rule (`DefenseScene.js` `levelBadge`). They are the loudest thing on the board [D_41].
- **tower_base** pads are visually bigger than the towers standing on them. Pads read more strongly than towers.
- **relay_core:** At 0.63× the antenna mast and machinery read as noise. The crystal reads blue rather than glowing cyan. The cyan point light on the plaza is a smooth gradient over pixel textures (fine, but not pixel-styled).

**Environment and tiles**
- **Canopy outside the map** (`TileWorld.paintCanopy`): a smooth, low-frequency, pillow-shaded gradient with off-palette shades (`shade(base,k)` is continuous). It is the least pixel-art surface in the game, and near map edges it fills half the screen [D_21, D_50]. Rebuild it as a 32 px palette tile (clumped leaves with 3 to 4 ramp steps) or replace it with tree sprites.
- **wall_* side faces:** One tile variant is repeated on every face (`texFromCanvases` uses `list[0]`), so the orange-speck and moss pattern repeats every 32 px along long walls [D_21]. Add per-instance UV variants or at least offset UV by instance id.
- **overgrown_market:** Reads as a grey stone dungeon maze, not a market. There are no stalls, awnings, crates of produce, signage or cloth [D_15, D_17]. The repeated carved-square motif on wall tops makes the tiling obvious.
- **flooded_transit:** Water is a blue tint over floor tiles, and the tile grid shows through. Edges are rectangular, with no foam, ripple or shoreline. It reads as "blue carpet", and the whole district is one blue value range [D_24, D_25].
- **canopy_greenhouse:** Lush and attractive, but no glass, frames or planters, so it reads as a forest. Same-hue enemies vanish (above).
- **collapsed_residential:** The plank floor is saturated orange with high-contrast seams. It is busy, and the player and enemies sit in the same hue band [D_32]. Grey square `floor_alt` patches with hard edges look pasted on.
- **data_center:** The best-looking district. The server-rack walls and pale tile have a clear identity [D_33]. The **alarm** laser is a 1 px red line with no glow, easy to miss [D_35].
- **tree_3:** Every instance carries the same orange plaque, and with 20+ in Greenhouse and the defense border the repetition is very visible [D_29, D_47]. Make the plaque a separate optional overlay, or vary it.
- **lamp_post:** Good sprite, but it casts no light pool, which is a missed opportunity in a game about light at night.
- **pick_scrap:** Grey gear on grey floor with no glow, outline pulse or bob, so it is low contrast [D_51]. The other pick_* sprites are better because they are coloured.
- **Shadows** (`Assets.getShadowTexture`): a 16-texel ellipse stretched to about 0.8–2.8 tiles. That is a different texel size from everything else, and under trees it reads as big soft blobs.

**Title, menu and results backdrop** (`MenuBackdrop.js`)
- The ground is painted at **4 texels per tile** (8× coarser than the sprites). The ruins are **untextured flat-shaded `BoxGeometry` primitives** (stone, moss, lintel). These are the only real primitive models left in the product, and they are the first thing a player sees. The orbiting camera often puts a giant flat green or brown box in the foreground [D_02, D_14].

**Placeholder audit.** `Object.keys(vr.game.assets.manifest)` has 85 keys. Every key in `src/data/visuals.js` and every `makeVisual()` call site resolves to a manifest sprite. A runtime traversal of all 5 districts and defense nights 1, 4 and 6 found **0 `kind:'model'` visuals**. The following remain primitive or procedural:
- Menu ruins (boxes) and the 4 tex/tile ground.
- Canopy gradient.
- Explore projectiles: box bullets, an icosahedron glob, ring-geometry cutter sweep.
- The extraction column (open cylinder) and an octahedron marker (`ExploreScene.js:383/402`).
- Defense projectiles (box or sphere, `Projectiles.js:53`).
- Snare Vine root tendrils: 7 Lambert `ConeGeometry` spikes (`DefenseScene.makeVines`).
- The burrower mound sphere (dead code now that `burrowed` exists).
- Fx particles (unlit cubes) and the arc-lightning `THREE.Line` (always 1 px).
- Resource icons are Unicode glyphs (⚙ ▣ ❦ ✉ ◈), not the `pick_*` sprites.
- The Scattergun, Wider Choice and Cosmetic unlocks use text glyphs as icons [D_04].

---

## 3. Juice and feel gaps (concrete suggestions)

1. **Muzzle flash.** Add a 2-frame sprite flash (8×8, yellow and white, additive) at the barrel for 50 ms, plus a 1-frame player `attack` pose. That pose exists but blends into `idle` between shots. File: `Player.js` fire(), `Fx`.
2. **Bullets.** Bullets are a flat 2×8 px yellow bar. Add a 2–3 px trailing streak (previous-frame positions) and a 1-frame white head. File: `ExploreShots.js` bullet def.
3. **Hit-stop.** There is none. Freeze 40–60 ms on melee (Pulse Cutter) hits, elite hits and kills: scale `dt` by 0 in `ExploreScene.update` for N frames. This is the single biggest feel upgrade available.
4. **Deaths.**
   - Today the sprite vanishes instantly into a cube burst and a thin ring (`ExploreEnemy.die`).
   - Add a 2–3 frame white-flash and squash, then pop.
   - Leave a 4–6 s flat corpse or splat decal (tinted per enemy, fading).
   - Add a 2 px knockback on the killing shot.
   - Defense needs the same in `DefenseScene._kill`.
5. **Damage numbers.**
   - They are DOM Consolas text (`Fx.text`), so smooth vector type sits over pixel art.
   - Render them in a bitmap pixel font, pop them up (scale 1.4 to 1), colour crits, and stack or offset them so they never overlap (fixes B10).
6. **Telegraphs.**
   - Fills sit at 0.35–0.45 opacity with no edge pulse. Add a bright 1 px pulsing rim and a final white flash at the moment of commitment.
   - Make friendly mortar landing markers a different language: dashed amber ring, no fill.
7. **Arc lightning.** The `THREE.Line` is always 1 px. Replace it with jagged billboard quads 2–3 px wide, plus a cyan impact spark and a short point-light flash. File: `Tower.js`, `Fx.line`.
8. **Pickups.** Add a vertical bob (±1 px, snapped), a 1-frame white glint every about 1.5 s (the anim exists but is subtle), a fly-to-HUD arc on collect, and a counter tick or pulse on the Carried panel.
9. **Core hit.** The flat red tint of the whole sprite is OK. Add debris sparks off the plinth, a brief chromatic flicker of the crystal, and a ring shockwave on the plaza floor.
10. **Boss moments.**
    - On spawn: a 1 s camera pan or zoom toward the lane entry, then return.
    - Root and charge: a ground-crack decal and dust.
    - Death: a multi-burst (it partly exists) plus a white screen flash, a half-second slow-motion, and seeds or leaves falling.
    - Today the "THE RELAY HOLDS" banner is a plain strip [D_46].
11. **Lights.** Lamp posts and the extraction beacon should cast real point lights in Explore (day could use a warm, low intensity). This sells the "real lighting" pillar.
12. **Victory and defeat screens.** These are plain panels over an orbiting diorama that the panel itself hides [D_13, D_14]. Shrink the panel to one side, let the "fallen" swarm or the dawn scene breathe, and add a sprite tableau (player plus defeated Colossus) and a stat count-up.

---

## 4. UI/UX polish issues

- **Typography.** Every UI element, including the title logo, uses system Consolas. The only exception is Arial on the range sliders. Anti-aliased vector type over chunky pixel art is the biggest "prototype" tell. Adopt one bitmap pixel font at integer sizes (8/16 px multiples of the render scale) for HUD, numbers and the logo. Keep a crisp sans only for long body text if needed.
- **Icon scaling.** Sprite icons are scaled to arbitrary sizes:
  - The briefing wave icons are 24 CSS px for 32 px sprites (0.75×, dropped texels).
  - Codex scales range from 0.48× (Colossus) to 3.33× (Seedling) in the same list.
  - The night 6 wave preview shows the Colossus at the same size as a crawler. Seed Carrier and Ruin Guard are nearly invisible on the navy panel [D_11].
  - Render icons at integer multiples (1×/2×) on a lighter chip background and give the boss a larger chip.
- **Resource glyphs.** ⚙ ▣ ❦ ✉ ◈ come from the system font. Use the `pick_*` sprites (12×12 at 2×) so the HUD and the world share iconography.
- **Briefing cards** have no visual identity. Add a district thumbnail strip using that district's floor and wall tiles plus a key sprite. The empty lower third of each card is free space for it [D_07].
- **Pause menu.** "Abandon expedition" (red) is the first and loudest button. Put Resume first and primary, and move destructive actions right or behind a confirm [D_23].
- **Toasts stack** at bottom right over the play area during defense. Three "New: …" toasts plus a hint covered about 30% of the lower map [D_40]. Queue them, and move first-time enemy intros into the wave-preview panel.
- **Defense side panel overflow.** The night 6 wave list scrolls and cuts the Boss tip mid-sentence [D_42]. The build list cuts off card 4 [D_37].
- **Records tab.** "How Research Data is earned" occupies the left half with a dead right half, and omits Decrypted Intel (+4/Intel) [D_05].
- **Hold prompt** stays fully bright while paused [D_23].
- **Explore HUD weight.** Four bordered panels (HP, Carried, minimap, Objective) plus the timer and banner frame a small playfield. Consider auto-collapsing the Objective panel to one line after 5 s, and putting the minimap at 70% opacity when an enemy is beneath it.
- **Tab map:** centre it, use integer scale, and draw the legend as icon chips (B15).

---

## 5. Top 12 polish items (by impact on perceived quality)

1. **Fix the camera so 1 tile is exactly 32 px (or 16 or 64) on screen in both modes.** Use an orthographic camera (or a much narrower FOV) with pixel-snapped sprite positions in Explore. Re-fit Defense to an integer px-per-tile instead of 20.3. This restores every pixel the artists drew (B1–B3).
2. **Integer upscale only.** Choose the internal res from the window (for example 427×240 or 640×360 at 1280, letterboxed) so each texel is a whole number of screen pixels (B4).
3. **Pixel font for all UI and the logo,** at integer sizes. Fix the 6–8 px text at small windows (B18).
4. **Replace the remaining smooth and primitive surfaces:** the canopy gradient, the MenuBackdrop box ruins and 4 tex/tile ground, the cylinder extraction column, the cone vines, and the 1 px Line lightning (§2 audit).
5. **Hit-stop plus real death beats** (flash, squash, corpse decal) in both modes (§3.3–3.4).
6. **Bigger, brighter shot VFX:** muzzle-flash sprite, bullet trails, arc bolts 2–3 px wide, impact sparks (§3.1, 3.2, 3.7).
7. **De-clutter the Explore HUD so it never hides enemies.** Smaller or collapsible objective panel, minimap fade under threats, off-screen threat arrows at the screen edge (B7).
8. **Value contrast pass between enemies and floors per district:**
   - Darken or desaturate the Greenhouse floor and the night grass under crawlers.
   - Tone down the Residential plank saturation.
   - Add a 1 px light rim to enemies at night (B16, §2).
9. **Boss presentation:** spawn framing (no edge clipping, B11), stronger silhouette and glow, a visible charge path when the toast fires (B13), and a separate visual language for friendly versus enemy telegraphs (B12).
10. **District set dressing:** market stalls and awnings, water with edge foam and ripples, greenhouse glass frames and planters, wall-face UV variants, and less `tree_3` plaque repetition.
11. **Integer-scaled sprite icons on chips everywhere** (briefing, codex, wave preview, build list), plus sprite resource icons replacing Unicode glyphs.
12. **Layout fixes:**
    - Hint placement that never covers its own subject (B8, B9).
    - Toast queueing in defense.
    - A centred integer-scale Tab map (B15).
    - Pause button order.
    - Floating-text stacking (B10).
    - Results screens that show the diorama and a celebratory tableau.
