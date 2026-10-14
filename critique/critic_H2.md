# Verdant Relay: Critic H2 (art direction and visual quality, round 2)

**Session:** 2026-10-13. I played the frozen snapshot `.playwright-mcp/frozen_r2a`, served to my own headless Chrome by
request interception. The persistent driver is `.playwright-mcp/roundH2/driver.mjs` + `c.sh`. Every screenshot, zoom,
contact sheet and measuring script is in `.playwright-mcp/roundH2/` (files `A*`–`S*`).

**Resolutions checked:**
- **1280×720:** day, night and menus.
- **1920×1080:** HUD, menus and all 3 night maps.
- **2560×1440:** the night board with Protocol casts.

**What I covered:**
- The 5 districts at their major sites and on deep trails.
- The 4 hero ruins.
- A day cycle in 5 steps, at two places.
- Rain, fog and heat, each by day and at night.
- Fords and wading.
- Spore pods.
- The redrawn Relay (noon, late and night) and the pylon (off, on, night).
- All 5 area bosses, in phase 1, phase 2, dying and dead.
- A creature lineup including Thorn Stalker, Bloater and Feral Chief, plus the Stalker's ambush cycle.
- Slow-motion captures (`rAF` scaled in the page only): slash, chop, hit flash, deflect and riposte, machete throw.
- Splats and the Razorback lane.
- The night board:
  - all 3 layouts with 14 towers including L3a/L3b;
  - night 6 through to the Colossus;
  - the night creature roster;
  - Q, W and E Protocols;
  - the leak feed.
- Menus: title, briefing (normal and guided), summary, Workbench, research tree, Codex, Settings (Sound and Controls), results (win and loss).
- A real New Run → guided day 1 with keyboard input.

**Console:** 0 errors and 0 warnings over the whole session.

**How the numbers were made:** `meas.py` (luminance percentiles, per-category tile samples, circular hue, bright-pixel
counts) and `runs.py` (run-length and k×k block uniformity). I re-ran both on critic H's own round-1 PNGs, so every
before/after pair below uses the same method.

---

## 0. Round-1 measurements, re-measured

| Metric (round-1 target) | Round 1 | Round 2 | Evidence |
|---|---|---|---|
| Night board pixel-exact at 1080p (all runs multiples of k) | ×1.5 mixels: runs 1 px ×316, 2 px ×315, 3 px ×57 | **×2 exact**: 99.2% uniform 2×2 blocks, runs 2 px ×68,550 vs 1 px ×1,390 | `M02_ford_1080_prep_built`, `runs.py` |
| Night at 720p / 1440p | ×1 / not checked | ×1 at 720p by default (61,014 of 73,519 runs are 1 px); ×2 after a wheel zoom (98.7% 2×2). ×2 at 1440p (99.1%) | `M01_crossing_720_*`, `M06_720_zoom2`, `N01_1440_prep` |
| Day at 1080p | 3 px ×350 | 96.6% uniform 3×3 blocks | `O01_hud_1080` |
| Value: path median ≥ 70, brush 40–50, canopy ≤ 40 | path 52, brush 43–57, canopy 47 | **clearings 67–75** at all 5 majors. **Trails 45–57** in 10 trail frames over 2 seeds. Brush 32–52, canopy 28–48, floor 29–48 | `C0*_major`, `C1*_trail`, `R0*_trail` + `_smp.json` |
| District hue spread at majors (target ≥ 50°) | 11–16° (161–173°) | **85–93°**: Market 113, Flooded 176, Greenhouse 116, Residential 105, Data Center 191 | `C_sheet_major` |
| Sunset warm shift | none: hue 157 → 175, i.e. cooler | **yes**: midday hue 123 → late 94 → sunset 73 (R/B 0.98 → 1.69) → dusk 140 → dark 201 | `E_sheet_cycle`, `E0*_nohud` |
| Bright pixels at full dark vs day, full frame (round-1 method, includes HUD) (≥ 50%) | 10,996 → 3,584 (33%) | 13,701 → 10,201 (74%), but most of that is HUD | `E01_day`, `E05_dark` |
| Emissive-looking pixels at full dark (play area 800×490; max > 170, chroma > 90) | 140 | **946–1,284** (7–9×): fireflies, eyes, lamp pool, Relay crystal (0,255,250) | `E05_dark`, `P04_dark`, `L03z_crystal` |
| Night board vs jungle night grade | 30/43/39 vs 18/42/48 (different hue) | 33/55/64 (hue 197) vs 18/37/47 (hue 199): same hue, about 1.5× brighter | `M01_crossing_720_prep_built`, `E05_dark` |

**Verdict on the numbers:**
- The two code-only items from round 1 landed: the night scale and the time-of-day moods.
- District identity landed.
- The value fix only landed on open ground. Clearings now sit far above the brush, but the trails, the thing a player actually follows, are still in the 45–57 band.

---

## 1. Environment (day jungle)

**What genuinely improved**

1. **The Relay clearing and major sites now read at a glance.**
   - Paving medians are 67–75 against brush in the 30s–40s (`Q02_day1_arrive`, `C_sheet_major`).
   - Day 1's arrival frame is the best-composed frame in the game: lit plaza, Relay centre stage, dirt paths lighter than the walls of foliage.
2. **District grades work.**
   - Data Center is cool slate-blue, Flooded is teal, Greenhouse is lime, Market is warm. You can tell where you are from a thumbnail (`C_sheet_major`).
3. **Hero ruins** (`D_sheet`, `D01z`, `D03z`, `D04z`):
   - The Market kiosk row (striped awnings) and the Residential apartment facade (brick, balconies) are excellent and instantly name the district.
   - The server hall reads as two rack banks with fans, but its LED pixels are invisible at ×2.
   - The station platform is weak: a low diagonal slab with two lamp posts that reads as a broken wall (`D02`).
4. **Time of day is now a mood, not a dimmer** (`E_sheet_cycle`).
   - Late afternoon goes golden.
   - Dusk turns cool.
   - Full dark is moonlit lavender-blue paving, a warm lamp pool around the player, and fireflies.
   - The crystal stays at full cyan. The pylon throws a hard-stepped cyan pool you can see from 7 tiles in the dark (`I02_pylon_night_far`).
   - This is the HLD/Children of Morta "night is about the glows" read that round 1 asked for.
5. **The foreground leaf frame is authored.**
   - Banana, fern, monstera and vine silhouettes in near-black with a lit rim, no checker band (`Q02z_leafR`).
   - Minor: the banana leaf rises from the bottom edge 70% of the way across and covers ground just south-east of the player, where melee threats approach.
6. **Water.**
   - The player is clipped at the waterline with a pale ripple ellipse and reeds in front (`I01z_wade`). It finally looks like wading.

**What is still weak**

1. **Trails are not part of the value fix, and they are buried under card overhang.**
   - On deep trails the path median is 45–57, the same as round 1's 52 (`R0*_trail` stats).
   - Worse, the trail is often physically invisible. Upright fern, heliconia and tree cards standing on the tile row south of an east–west trail overhang it at the 55° pitch.
   - `C11_market_trail_nohud` and `C14_resi_trail_nohud` show the player standing on a trail tile with no path visible anywhere. `R03_trail_ov` marks the trail tiles: about half are under fern cards.
   - This is the newcomer's "can't tell path from brush" in its purest form. It is the remaining #1 environment problem.
2. **Three of five districts share one hue band.**
   - Market 113°, Greenhouse 116° and Residential 105° sit within 11° of each other (`C01`, `C03`, `C04`).
   - Residential "rust" reads as olive (saturation 0.22).
   - Off the major sites only Flooded (teal) and Data Center (blue) stand out.
3. **Fog at night is a grey wash, brighter than the night it replaces.**
   - Veil pixels are (66–72, 72–76, 71–77) against clear-night ground at (0–6, 19–32, 41–54).
   - Frame median: 66 in fog at night vs 31 in rain at night, saturation 0.09.
   - It kills the moonlight, the emissives and the lamp pool (`J01_fog_night`). STYLE.md promises "dimmer after dark".
   - By day the fog is a strong, legible veil (median 89, `J01_fog`) and reads fine.
4. **Rain and heat:**
   - Rain is good: 1-px leaning streaks, cool grade (`J01z_rain`).
   - Heat is nearly invisible: hue 136 vs 147 for rain on the same tile, and the haze is not readable at ×2 (`J01_heat`, `J01z_heat`). Only the HUD tag tells you.
5. **Decals:**
   - The crossed-twig "X" from round 1 still appears on paths and plazas and still reads as a map marker or caltrop (`Q02z_leafR` centre, `E_sheet_cycle` beside the hive).

## 2. Characters and animation

**Improved**

- **Feral and Feral Chief.**
  - The Feral is now brown and bone. It can't be confused with the player.
  - The Chief's red-to-gold cloak is a strong, readable elite (`G01z_c`).
- **Player outline.**
  - Dark on open ground, cyan only when covered (`G04z`, `I01z_wade`, `R03_trail_ov`). The strobe is gone.
- **Boss stills are commercial quality** (`S_bosses_raw`, `F_bosses_strip`).
  - The Drowned Engine (rusted boiler, lamp eye, steam) and the Brood Hive (a mound grown over a market stall) are the best new designs.
  - The Warden's red core reads from across the screen.
- **The Relay redraw** (`L_relay_strip`, `K07z_relay`).
  - Bunker, stairs, hazard band, moss and a copper-ringed crystal. It now belongs to the same art set as the player.

**Still weak or new**

1. **Bosses barely animate.**
   - Each strip is 4 near-identical idle frames, 2 attack frames that differ by a few pixels, a red-tinted "hurt" frame and a grey "dead" frame (`S_bosses_raw`, `S_brood_raw`).
   - There is no anticipation pose; the whole read is carried by ground rings.
   - Phase 2 is only a multiply tint `BOSS.tint2 #ffb0a0` (`F1_sheet` p2 frames): "Enraged" is announced in text, not shown.
   - Compare HLD or Children of Morta bosses, whose silhouettes change per move.
2. **The Thorn Mother is a giant Spitter.**
   - Same lime pitcher body, fanged maw and pink tongue as the Spitter (`G01z_b` vs `S_bosses_raw` row 1). On a Greenhouse day with Spitters around, the boss reads as "more of the same".
3. **The Pack Lord is not a boss visually.**
   - It is the Feral Chief sprite at the same 1× size as the player.
   - Its lair is brush, so in most of my fight frames it is a red x-ray dither silhouette (`F5_pack_sheet`, `F5z_p2`).
4. **The new creatures are tinted Crawlers.**
   - The Thorn Stalker (`#e0906c` tint) is a slightly darker maroon Crawler; side by side they are indistinguishable (`G04z` right).
   - The Bloater's lime body tint barely survives (`G04z` left).
5. **Bug: the Bloater's spore sac is always drawn as an occluded silhouette.**
   - The `spore_pod` sac on its back renders with the red x-ray checker even on open paving (`G01z_b`, `G02z_bloat`, `G04z`).
   - The Crawler body card in front of the sac counts as foliage occlusion.
6. **Boss sprites aren't emissive at night.**
   - The Brood Hive's fire mouth and egg lamps turn pale lavender under the moon (`E05z_hive`).
   - The Warden's eye, the Engine's lamp and the Thorn Mother's tongue need `EMISSIVE` bands like the creature eyes.
7. **V1 night creatures are still on the board.**
   - Seed Carrier, Ruin Guard, Burrower and Seedling are flat 3-tone Endesga sprites beside the PixelLab Razorback, Crawler and Spitter (`M07z_v1`).
   - The Colossus holds up.

## 3. Effects

| Effect | Verdict | Evidence |
|---|---|---|
| Slash smear | Good, unchanged: pale blade, cyan dither tail | `H06_strip` |
| Chop crescent | **Fixed.** A cream/white wide arc with a red charge ring on the ground; no lemon banana | `H09_sheet` |
| Hit flash | **Fixed.** A short flash, then a red-orange tint on the struck sprite only; neighbours untouched | `H02z_01`, `H08_strip` |
| Deflect | Readable: white star burst, ring, hit-stop, attacker flashes orange. But **"DEFLECT" and "PARRIED" print together**, stacked 1 tile apart | `H02z_01` |
| Riposte / machete throw | Throw is a small grey blade sprite, readable at ×2; riposte text fine | `H02_sheet`, `H03_strip` |
| Splats | **Not fixed.** Kills leave **near-black navy blots** (pixels (0,33,49), (9,37,53)) that read as holes or oil, plus a saturated crimson (87,15,38) and mustard blot. Unchanged after 10 s | `H04z_splats`, `H03_strip` |
| Razorback lane | **Fixed.** Dust-dither capsule, rounded ends, red dashed rim, moving amber chevrons | `H05z` |
| Spore pod + puffs | Pod sprite and puff sprites are good. **The burst frame is a flat lime disc with a hard rim** over the player, the same "render bug" read as round 1's slab, just shorter | `I05z_strip` left vs right |
| Stalker ambush | Good language: a red ring under you with dirt specks, then the eruption | `G03_strip` |
| Boss telegraphs | Consistent with the creature language: red rings and lanes, white steam rings, green spore rings, 1-px laser aim line | `F1_sheet`, `F4_drowned_sheet` |
| Night Protocols | **Programmer art.** Vine Snare = a translucent green disc, then a dashed green circle, no vines. Arc Discharge = dashed cyan rings, no visible bolt in 4 frames at 70 ms. Flare = a big smooth-alpha amber disc. They break STYLE's "hard alpha + Bayer dither" contract | `N_proto_strip`, `N_proto_strip2` |
| Relay hit at night | The whole Relay flashes flat red inside a red translucent ring; loud next to everything else | `N_proto_strip` frame 2 |

## 4. Night board

**Big step up**
- **Pixel-exact at whole zoom steps** (§0). The ×1.5 mixels are gone.
- **The same world after dark.** The jungle PostFx grade gives the same hue as the jungle night (197° vs 199°). Amber lamp pools sit on the plaza, the redrawn Relay sits at the head of a paved, hazard-striped plaza, and the trails are worn, with ruts and puddles (`M02_ford_1080_prep_built`, `M07_night_creatures_1080`).
- **The 48×64 towers are real art** (`M02z_tstrip`, `M01z_towers`).
  - Scrap Turret L1 box gun → L3b gatling with a teal drum; Arc Spire coil with an orb; Thorn Nest; Snare Vine.
  - Each has a type-coloured selective outline.
  - The L3 branches differ in silhouette, not just colour.
- **The furniture is quiet now.**
  - No orange pad dots.
  - One hostile ring.
  - The leak feed ("GOT THROUGH −15 tonight / −3 Skitter · North") is a clean, legible red card in the panel (`M07`).
- **All three layouts** (crossing, ford with river and lily pads, twin) are distinct, pleasant places.

**Still weak**
1. **Default texel size is still half the day's at 720p and 1440p** (×1 vs ×2, ×2 vs ×4). At 720p the board opens at 1 px per texel, so the same Razorback is a 1-texel-outline figure about 40 px long (`M01_crossing_720_wave`). Zoom ×2 exists but isn't the default.
2. **The plinths are the most "TD grid" thing left.** Identical dark-slate prisms, about 1.5 tiles wide, lighter top, flat front, no wear, larger than the tower bases (`M02z_tstrip`, `M04z_band`).
3. **Two amber chevron families on one board.** Lane-direction ">" chevrons and yellow "^^^" rank badges float about 1 tile above towers and land on the lane, so ranks read as lane markers (`M02z_lane`, `M02z_towers`).
4. **Stacked health bars on packs.** Seven green bars in a 2-tile cluster (`M05z_03`).
5. **Bug: the "DANGER TONIGHT" box clips its text in wave phase at 1080p.** "(Overgrown Market lies north-" is followed by a half-cut "west)." (`M07z_clip`). In prep the same text fits.
6. **Coach hints sit on the board.**
   - Night prep: "Enemies walk the dirt paths…" sits in the middle of the field over 3 towers (`M02`, `M06`).
   - Wave: "Relay Protocols…" covers the South lane label and the bottom-left lane (`M07`).

## 5. Menus, HUD and clutter

**Improved**
- **The wordmark logo is authored and good.** Vines threaded through VERDANT, a cable into RELAY, the crystal as the A (`K07z_logo2`). Biggest single UI upgrade.
- **Research tree nodes** have pixel icons (the Parang is a machete), and the three branches are laid out as a real tree (`K10z_tree`).
- **Relic plaques:** common slate, rare cyan, cursed violet.
- **HUD:**
  - "100 / 100" now has an ink outline and sits on the texel grid at 1080p (`O01z_hud`).
  - The weather tag ("☂ Rain") and clock block are clean (`O01z_right`).
- **Creature icons** in the night list are cropped side views at whole scales (`M06z_list`).

**Still weak or new**
1. **Text pile-ups are the worst visual problem in the new content.**
   - **Boss intro at the Warden** (`F3z_top`), 5 layers in one 120-px band:
     - the boss bar and name;
     - a faded objective toast;
     - a strongbox hint;
     - a spore-pod hint;
     - the "SECURITY WARDEN" banner (unreadable under the hints);
     - the place name "THE CABLE TRENCH".
   - **Every boss kill:** the "+1 skill point" and "+30 Research…" toasts print **on top of** the "X KILLED" banner (`F1z_deadb`, `F2z_deadtop`, `F3_warden_dead`). The player's biggest moment of the day is illegible.
2. **Bug: two bosses at once.**
   - In one seed, while fighting the Security Warden, the boss bar flipped to "PACK LORD".
   - The Pack Lord's intro text printed over the Warden's.
   - "You left the Pack Lord: it recovers" toasts appeared mid-fight (`F3_warden_p1_1`, `F3_warden_p2_2`, `F3z_p2`).
   - The mobile Pack Lord or lair spacing lets a second boss engage.
3. **Two engineers' styles side by side.**
   - The Workbench uses font glyphs as icons (⚡ Overcharger, ✂ Serrated Edge, ▼ Heavy Spine, ⟳ Balanced Grip; `K08z_head`), while the research tree beside it in the same flow has pixel icons.
   - `ui_panel_frame.png` (the 9-slice from round 1's plan) was drawn but is referenced nowhere in `src/`, so every panel is still a 1-px navy box.
4. **Wide-tracked display titles remain** on Summary ("BACK HOME SAFE"), Workbench, Victory and Defeat (`K_sheet1`, `K_sheet2`). Only the jungle banner was fixed.
5. **No pictures of places.** Briefing district cards are still a coloured header bar plus text (`K01_briefing_1080`), now that hero ruins exist to show.
6. **Codex relics:** unseen relics are flat black squares, not object silhouettes (`K11z_sil`). They tease nothing.
7. **Relic HUD strip icons are drawn at ×1** (1 screen px per icon texel at 1080p, vs 3 for the world; `O01z_hud`). This is mixed density again.
8. **Day enemies still each carry a red ring plus a dark disc** (`G01z_a`, `G01z_b`). The night got "one ring for the targeted enemy"; the day did not.

## 6. Cohesion

The three art generations from round 1 are now about one and a half:
- PixelLab V2/V3 covers the jungle, the cast, the Relay, the pylon, the ruins, the bosses and the towers.
- The procedural layer shrank: the leaf frame, the lane and the spore puffs are fixed.

What still breaks the set:
1. The V1 night creatures (Seed Carrier, Ruin Guard, Burrower, Seedling).
2. Translucent smooth-alpha Protocol discs.
3. Navy splats.
4. The spore burst disc.
5. Tint-only creature variants (Stalker, Bloater, Pack Lord).
6. Glyph icons on the Workbench.
7. Day vs night texel size at 720p and 1440p.

---

## 7. Round-1 item → verdict

| Round-1 item | Verdict | Evidence |
|---|---|---|
| #1 Night at day texel size and integer scale | **Partly**: integer and exact (99.2% 2×2 at 1080p); default texel still ½ the day's at 720p and 1440p | §0, `runs.py` |
| #2 Value structure (path ≥ 70, brush 40–50, canopy ≤ 40) | **Partly**: clearings 67–75 ✓, brush ✓, canopy ✓; trails 45–57 ✗ and hidden by card overhang | `R03_trail_ov`, `C11` |
| #3 District identity (hue spread ≥ 50°, hero ruins) | **Mostly**: 85–93°; 4 hero ruins (platform weak); Market/Greenhouse/Residential within 11° | `C_sheet_major`, `D_sheet` |
| #4 Golden hour, emissive night, fireflies | **Fixed** (bosses excepted) | `E_sheet_cycle`, `E05z_hive` |
| #5 Hand leaf frame, world-anchored dithers | **Fixed** (leaf frame); dither anchoring not re-verified in motion | `Q02z_leafR` |
| #6 Water interaction | **Fixed** | `I01z_wade` |
| #7 Effect palette (flash, chop, splats, lane) | **Partly**: flash, chop and lane ✓; splats now navy-black ✗ | `H09`, `H04z_splats` |
| #8 Relay and pylon redraw | **Fixed** | `L_relay_strip`, `I02z_strip` |
| #9 Night board clutter / relight | **Mostly**: dots and rings gone, same grade; plinths, chevrons and bar stacks remain | `M02`, `M05z_03` |
| #10 Feral palette, calm outline | **Fixed** | `G01z_c`, `G04z` |
| #11 UI art pass | **Partly**: logo, tree icons, HUD grid, HP outline ✓; panel frame unused, glyph icons, no postcards, wide titles ✗ | `K07z_logo2`, `K08z_head` |
| #12 Spore pods, containers, decals | **Partly**: pod and puffs ✓; burst disc and twig X remain | `I05z_strip` |
| G#6 Stacked-enemy white blob | **Fixed** (hit sprite only) | `H08_strip` |
| Newcomer: checker patches | **Fixed** (leaf band); spore burst disc is a new instance | `I05z_strip` |
| Newcomer: red everywhere | **Partly**: night quiet; day still ring + disc on every creature | `G01z_b` |
| Night creatures V1 | **Not fixed** | `M07z_v1` |
| Rotated-roll mixels | Not re-verified | n/a |

## 8. Scores (1–10, harsh; 7 = good commercial indie)

| Axis | Round 1 | Round 2 | Why |
|---|---|---|---|
| Environment | 6.5 | **7.5** | Lit clearings, real district grades, hero ruins, golden hour, moonlit night with glows, authored leaf frame, wading. Held back by trails still in the 45–57 band and buried under cards, three districts sharing one hue, and a grey fog night. |
| Characters / animation | 7 | **7** | The Feral/Chief swap and the Relay are wins; the boss stills are excellent. But the bosses barely animate, phase 2 is a tint, the Thorn Mother is a big Spitter, the Pack Lord is a normal Feral, the new creatures are tinted Crawlers (with a sac render bug), and the V1 night creatures remain. |
| Effects | 6 | **6.5** | Chop, hit flash and lane fixed; good Stalker and boss telegraphs. Navy splats, a flat spore-burst disc, translucent-circle Protocols and doubled DEFLECT/PARRIED text. |
| Night map | 4.5 | **7** | Exact pixels, the same world after dark, real 48×64 towers with distinct L3 branches, quiet furniture, a good leak feed. Half-scale default at 720p and 1440p, heavy plinths, chevron confusion, a clipped danger box, hints over the field. |
| UI / menus | 6 | **6.5** | A real logo, tree icons, a cleaner HUD. Toast/banner pile-ups at boss intro and kill, an unused panel frame, glyph icons, wide titles, no district art. |
| Cohesion | 5.5 | **6.5** | V1 Relay and towers replaced, night graded like the jungle. Residue: V1 night creatures, alpha-disc Protocols, tinted variants, glyph icons, texel mismatch. |

## 9. Top 12 fixes (ranked by visual uplift per unit of work)

1. **One text lane and a queue** (code: `src/ui/ui.js` toast, JungleScene banner, `AreaBoss` intro, `src/ui/hints.js`).
   - Banners own the top-centre band. Toasts queue under the HUD panel on the left and are held while a banner is up (up to 2.5 s).
   - At most 1 coach hint plus 1 toast on screen.
   - Boss kill: banner first, rewards 1.2 s later as a single line.
   - Night hints dock in the side panel, never over the field.
   - Target: no two text boxes overlap in any frame of `F*_sheet`.
2. **Make trails visible** (code: `JungleWorld` card placement, `ATMOS`, `TERRAIN_VALUE`).
   - Brush cards on the tile row directly south of a trail tile get the x-ray dither on texels that cover trail ground, or use their short variant (≤ 1 tile tall).
   - Set `trailShade 0.4 → 0.15`, lift dirt +15%.
   - Target: trail median ≥ 65 on `R0*_trail`-type frames, ≥ 80% of trail tiles unoccluded.
3. **Boss presence** (art plus code: `AreaBoss`, `EMISSIVE`).
   - Hand-made 2-frame anticipation pose per move (the strips have room).
   - A phase-2 overlay instead of a tint: cracks plus emissive veins/eye, and a steam/spore aura particle.
   - Boss keys in `EMISSIVE`: hive mouth and eggs, Warden core, Engine lamp.
   - Pack Lord: draw it at ×2 (it's the only scalable one) and clear lair brush in a 4-tile radius so it isn't an x-ray silhouette.
   - Thorn Mother: recolour away from the Spitter (violet/bone body, red maw).
4. **Single engaged boss** (code: `AreaBosses.update`, JungleGen `bossLair`).
   - Only the nearest lair can engage.
   - Lairs at least `aggro + leash + 6` (35) tiles apart; the Pack Lord leashes to its own site.
   - The bar never switches mid-fight.
5. **Fix tinted creatures** (code: `PaletteSwap`/`DERIVED_SPRITES`).
   - Bake the Bloater's sac into a derived sheet; this kills the red occlusion checker.
   - Make the Stalker a derived sprite with a bone-white thorn crest and a red-violet ramp, not a multiply tint.
   - Target: a newcomer names all three of Crawler, Stalker and Bloater from `G04z`.
6. **Fog after dark** (code: `Weather.js`/`PostFx` fog colour).
   - Multiply the veil by the night light (moon tint × nightAmbient) and keep emissives above it.
   - Target: fog-night median ≤ 35, hue 190–210, glows still visible.
7. **Splats** (data: `JUICE.death`).
   - Per-creature blood ramp (Feral dark red, Crawler sap brown-green, Skitter magenta, Spitter acid green), 55% toward ground, with no navy/black step.
   - Target: no splat pixel darker than the darkest ground pixel under it.
8. **Protocol FX as pixel art** (code: `DefenseProtocols`, `Fx`; small hand art).
   - Snare = 3-frame vine sprouts under each rooted enemy.
   - Arc = the existing pixel bolt chained between targets for 4 frames.
   - Flare = stepped `lightPool`.
   - Aim = 1-px dashed ring only. No smooth-alpha fills anywhere.
9. **UI art debt** (CSS plus small art).
   - Wire `ui_panel_frame` 9-slice into `.scr`, the panels and the side panel.
   - Draw 9 Workbench icons at 16×16.
   - Letter-spacing ≤ 0.04em on Summary, Workbench and Results titles.
   - Danger box: no max-height clip in wave phase.
   - Relic HUD icons at whole world-texel scale (×2 at 720p, ×3 at 1080p).
10. **Night defaults at day scale** (code: `NightCamera`).
    - Open at the zoom matching the day texel (×2 at 720p, ×3–4 at 1440p) with auto-pan to the active lane and the overview on Home.
    - Or at least ×2 at 720p. Coordinate with critic K on usability.
11. **Night board furniture** (art plus code).
    - Plinths: 3 irregular variants cut from the paving set, ≤ 1.2 tiles, worn edges.
    - Rank badges sit on the plinth's front face, not floating.
    - Collapse health bars to the hovered or targeted enemy plus the elites/boss during waves.
12. **V1 night creatures** (art: about 4 PixelLab gens or hand repaint).
    - Seed Carrier, Ruin Guard, Burrower, Seedling on 5–6-tone ramps with selective outline, using the Razorback as style ref.
    - Also: the spore-burst disc becomes a 2-frame dithered puff ring; drop `dec_twigs_crossed`; Codex silhouettes become the relic object, not the plaque; print only one of DEFLECT/PARRIED.

## Verdict

Round 2 is a real art-direction pass, not a patch:
- The night is now the same world after dark: pixel-exact, graded like the jungle, with real towers and the redrawn Relay.
- Golden hour and a glowing moonlit night give the day a shape.
- Districts finally have colours and landmarks.
- The logo, Relay and pylon look like a shipped game.

What holds it back now is mostly integration, not assets:
- Text piles up over the best moments.
- Two bosses can share a fight.
- Tint-only creatures and a sac render bug.
- A fog night that turns grey.
- The trails, the one surface a player follows all day, are still mid-value and half-buried under cards.

Fix the text lane, the trails and boss presence and this is a solid 7.5 across the board.
