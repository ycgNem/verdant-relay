# Verdant Relay — Art style and sprite contract

Two generations of art live side by side:

- **V2 jungle art (current direction, exploration + terrain):** made with **PixelLab** (AI pixel generation) and hand-finished
  with the pixel-art-studio skill. Budget for this project: **300 PixelLab generations total** (tally every job's cost line).
- **V1 night-mode sprites** (towers, night-only enemies, the Relay Core, UI icons): hand-made with pixel-art-studio,
  Endesga-32. They stay until replaced; their contract is at the bottom of this file.

## V2 look

- A **dense, humid, claustrophobic jungle** swallowing a dead transit city. Every square of ground has something on it.
  Layers, from bottom to top: blended ground → ground decals (leaf litter, roots, puddles, stones, moss) → undergrowth
  (ferns, shrubs, thickets the machete cuts) → trunks, ruins and props → hanging vines → canopy overhead (dappled shadow).
- Rich, moody, saturated-but-dark palette: deep teal/green shadows, warm sun-dapple highlights, wet browns. Glow accents
  (amber, cyan, toxic green, red eyes) are the brightest values on screen.
- **Ground blends**: terrain is never a visible grid. Transitions come from PixelLab Wang tilesets drawn on a dual grid,
  then broken up with decals and low-frequency colour variation (`src/world/TerrainBaker.js`).
- PixelLab settings for consistency: `view: "high top-down"` for terrain and ground decals, `"low top-down"` for characters,
  `outline: "selective outline"`, `shading: "detailed shading"` (or medium), `detail: "high detail"`. Once a good asset
  exists, pass it as a style reference to later jobs of the same family.
- **Light from the top-left.** No semi-transparent pixels: every exported PNG is alpha 0 or 255 (threshold at 128).
- Sprites are drawn **1:1 at ppu 32** (32 texels = 1 tile). Never resample a PixelLab image; pad or crop only.
- **Pixel-exact on screen**: the canvas is always shown at a whole-number scale (Game picks the internal size per window
  around a fixed 640×360 view = 20 × 11.25 tiles: ×2 at 720p, ×3 at 1080p, ×4 at 1440p, letterboxed).
  Every screen-space effect is hard alpha + ordered (Bayer) dither: x-ray window, occlusion silhouettes, glows, splats.
- **Readability over density** (critic F): a creature covered by foliage draws as a flat-colour 1-texel outline + dither
  checker (player a calm cyan `#4fb8c8`, enemies hot red `#e04434` → `#ff2e2e` once alerted: enemies out-shine the player). Brush types read by height and colour:
  ferns (walk through) are the low plants graded pale yellow-green, thickets (one slash) the tall ones graded dark
  blue-green, brambles (heavy chop) red-brown (`BRUSH_LOOK`, applied in the flora atlas — the PNGs stay untouched).
- **The player always reads** (critic G): cards never cover the player's own texels (stencil card mask), and the player
  has a 1-texel outline — near-black on open ground, cyan `#5fc8d8` only while a card actually covers its body (the body
  box is sampled against the opaque texels of the cards in front, with hysteresis: `ATMOS.playerOutline.body/hits`).
  Night towers get the same outline in their type colour.
- UI font: Tiny5, with "~" and "8" overridden by `src/ui/fonts/vr-glyphs.ttf`, and the HUD clock's Silkscreen Bold "4"
  by `src/ui/fonts/vr-clock.ttf` (both built by `tools/make_glyph_font.py` on the 8-unit grid; edit the bitmaps there and re-run).
- **Jungle HUD on the texel grid** (critic H §5): HUD text is one font pixel per world texel (12 design px: 16 px at
  720p, 24 px at 1080p; the clock 2 font pixels per texel), never mixed densities in one panel; HUD pixel icons (the
  daylight sun / moon `ui_daylight.png`, 2 × 12×12, `pixel-art/ui_daylight/build.py`; the in-world ◆ crate marker)
  scale by whole world texels (`--tx`). Health is green → yellow → red, never the stamina bar's orange. Creature icons
  in the menus are the side view cropped to the creature, at whole scales only (never ½).

### Light, value and colour (critic H)

- **Value structure**: paths are the brightest band, brush the middle, canopy the darkest. The canopy shade map spares
  walkable trail/clearing tiles (`ATMOS.trailShade`), dirt and paving are baked lighter (`TERRAIN_VALUE`), and upright
  brush darkens toward its base (`ATMOS.brushBase`, luminance-weighted so lit leaf tips keep their sparkle).
- **District identity**: each region has a colour grade (`REGION_LOOK[key].grade`, ±12–18 %: Market amber, Flooded teal,
  Greenhouse lime, Residential rust, Data Center cyan-violet) baked into a blurred world texture, so grades cross-fade at
  borders, plus a favoured decal subset (`REGION_LOOK[key].decals`).
- **Time of day**: late afternoon warms toward golden hour (`ATMOS.cycle.gold` `#ffb070`, long warm shade); night is moonlit
  blue (moon floor + navy lift), with a warm lamp pool around the player. **Emissives ignore darkness and the vignette**:
  creature eyes, terminals, caches, pylon tips, the Relay crystal, glow fungus and fireflies (`EMISSIVE` hue bands per
  sprite key; ground decals marked by the baker). Nothing ever goes pure black.
- **Dithers are world-anchored** (they slide with the ground, never swim on the screen). The vignette is hard-stepped,
  undithered. The screen frame is whole foreground leaf sprites (`fg_leaf_1..5`, `ATMOS.leafFrame`) with a few pixels of
  lagging parallax and whole-texel sway — never a per-pixel band or a mirrored copy.
- **Effects**: a hit is 1 frame white + 2 frames red-orange tint on the hit sprite only (`JUICE.hitFlash`). Death splats are
  3-tone, desaturated ~55 % toward the ground (`JUICE.death.splatGround`) and fade out in whole steps over ~30 s. The
  Razorback charge lane is a dust-dither capsule with rounded ends and moving chevrons — no hard rectangle.
- **Palette swaps at load** (`PALETTE_SWAP`): the feral's olive cloak is remapped by brightness rank to bone/rust
  (`#7a4a3a` / `#a08060`) so it never reads as the player.
- **Props and water**: no foliage card stands within a tile in front of a container, pylon or spore pod (`GROUND.propFront`);
  the same decal never repeats within `DECALS.spacing` tiles. An activated pylon throws a stepped light pool and a beam
  above the canopy (`PYLON_GLOW`). Characters in shallow water are clipped at a waterline `WATER.line` texels above the
  feet with a looping `fx_ripple` under them and an `fx_splash` on entry. Spore pods use `spore_pod` (idle / swell) and
  burst into 6–8 instanced `spore_puff_*` sprites (`SPORE_LOOK`).
- **The night board** (`DEFENSE_VIEW`, critic H §4, K §4.3): the same world after dark, at the day's pixel rules — whole
  zoom steps, 32 px per tile, every texel k × k screen pixels (checked: 99.9 % uniform 2 × 2 blocks at 1080p). The jungle's
  PostFx grades it at full dark (`DEFENSE_VIEW.post`: moon tint, navy lift, light vignette) over a near-neutral lit scene,
  so creature eyes and the Relay crystal glow and the light pools (amber lamps on the plaza, the Relay's cyan pool, a small
  cyan lamp at each forward pad) are stepped `lightPool`s that keep the ground under them out of the moonlight. Trails are
  worn, not painted: a lighter trodden centre band (dithered rim) that evens the dirt's mottling, two broken wobbly
  wheel ruts with a lit lip, a few puddles and pebbles (no square or blob decals on the trail). No foliage card covers a
  lane, a pad or the Relay (tested per texel). Board furniture stays quiet: no marker on built pads, empty pads light up only
  when they matter, a single hostile ring (hovered / targeted enemy), rank chevrons instead of plinth pips. Rewards read
  in-world: a slowed path is a cool multiply-tinted wet band with darker ripple dashes; boosted towers glint.
  Draw layers (sprites write no depth at night, so order is everything): ground lights and the wet band −3, plinths −2,
  ground marks −1 (blob shadows, hostile rings, pad markers, range circle, lane chevrons), sprites 0, badges 40, bars 50.
  Tower art (48 × 64) keeps its lamps, orbs, blooms and fire lit at night (`EMISSIVE.keys` via `towerGlow`; the turret's
  band stops at 40.6° so its ochre drum stays dark).

## V2 file formats (what the engine reads)

### Terrain (`public/terrain/`)

Ground is a stack of **levels**, each vertex of the tile grid holds one level, and neighbouring vertices differ by at most 1,
so every 32×32 cell needs exactly one tile from the tileset joining two consecutive levels:

| Level | Name | Look |
|---|---|---|
| 0 | `water` | murky green jungle river / swamp water |
| 1 | `mud` | dark wet mud bank, roots |
| 2 | `dirt` | packed brown dirt trail, pebbles (the paths) — or `paving` in ruins |
| 3 | `floor` | dark jungle floor: fallen leaves, twigs, soil |
| 4 | `moss` | lush mossy ground cover, tiny leafy plants |

Sets: `water_mud`, `mud_dirt`, `dirt_floor`, `floor_moss`, `paving_floor` (paving replaces dirt at level 2 in ruin areas).
Each set is saved as `public/terrain/<set>.png` (the PixelLab sheet, untouched) and `public/terrain/<set>.json`
(the raw PixelLab metadata: per-tile `bounding_box` and `corners` NW/NE/SW/SE = lower/upper). `public/terrain/manifest.json`:
```json
{ "tileSize": 32,
  "levels": ["water", "mud", "dirt", "floor", "moss"],
  "sets": { "water_mud": { "png": "water_mud.png", "meta": "water_mud.json", "lower": "water", "upper": "mud" }, ... } }
```

### Sprites (`public/sprites/manifest.json`)

Static and strip-animated sprites keep the V1 format (`file ppu frames anims fps animFps flat shadow anchorY`).
New optional fields:
- `"anchor": [x, y]` — texel in the frame that sits on the ground point (feet / base centre). Default: bottom centre.
- `"fw"`, `"fh"` — frame size, when the sheet is a grid rather than one horizontal strip.

**Directional sheets** (8-way characters and creatures): a grid of `fw × fh` frames. Rows are `anim × direction`, columns are frames.
```json
"player": { "file": "player.png", "ppu": 32, "fw": 64, "fh": 64, "anchor": [32, 54],
  "dirs": ["s", "se", "e", "ne", "n"],
  "anims": { "idle":  { "row": 0,  "frames": 4, "fps": 6 },
             "walk":  { "row": 5,  "frames": 6, "fps": 10 },
             "slash": { "row": 10, "frames": 6, "fps": 16, "hit": 3 } } }
```
- An anim's direction `i` (index in `dirs`) is on row `row + i`. Rows are padded with transparent frames to the widest anim.
- West-side directions (`sw w nw`) are **mirrored** from `se e ne` when not listed.
- `hit` (optional) = the frame on which the attack connects; `loop: false` for one-shots (attacks, roll, hurt, death).
- Every frame of a key shares one canvas size and one anchor: pad smaller animation canvases **centred on the feet**.

## V2 asset list

### Terrain (agent: env)
The five Wang sets above, 32 px tiles, chained through base tile IDs so shared terrains match exactly.

### Characters (agent: chars) — directional sheets, dirs `s se e ne n`
| Key | Canvas | Anims | Notes |
|---|---|---|---|
| player | ~64 | idle, walk, slash (3-hit combo can reuse one swing + mirrored variant), chop (heavy overhead), roll, hurt | Jungle scavenger: green hooded poncho, cyan goggles, orange scarf, backpack with cable coils, **machete** in the right hand |
| feral | ~64 | idle, walk, windup, attack | Feral scavenger: ragged camo, bone mask, crude spear or machete |
| crawler | ~64 | idle, walk, windup, attack | Bramble Crawler: thorny vine-beast, bark plates, red eyes (quadruped) |
| razorback | ~80 | idle, walk, windup, attack (charge) | Armoured boar-beast, rusted plates fused to hide, ivory tusks (quadruped) |
| skitter | ~40 | idle, walk, attack | Fast magenta insectoid with a yellow eye (may be a single-direction strip that flips) |
| spitter | ~48 | idle, windup, attack | Rooted carnivorous bulb plant with a fanged maw (single direction is fine) |

### Environment (agent: env) — `ppu 32`, anchor at the base
- `fol_*` undergrowth (≈64 px): ferns, broadleaf shrubs, monstera/elephant-ear, heliconia, tall grass, bamboo, palm sapling,
  thicket, vine tangle, thorn bramble, mushrooms, mossy boulder, rotten log, stump, cut-stump/debris.
- `dec_*` ground decals (≈32 px, `"flat": true`, `"shadow": 0`): leaf patches, twigs, pebbles, flowers, roots, puddles, lily pads, reeds, fungus, bones, cut-leaf debris.
- `tree_*` trees (≈128–160 px): giant kapok with buttress roots, strangler fig, tall palm, vine-wrapped dead tree, banyan, tree fern.
- `ruin_*` ruins (≈128 px): broken concrete wall, vine pillar, rusted train carriage, greenhouse iron frame, statue head, car wreck, toppled mast, stairs.
- `prop_*` interactables (≈48 px): crate, tool chest, rare cache, intel terminal, opened crate, fuse, power box, data terminal,
  pump, power-cell cache, nest, data log, locked cache, workbench, relay pylon, campfire, supply drop, med kit; pickups `pick_*`.

### V3 batch (critic H §7; PixelLab `create_map_object` ×10, hand-finished) — `pixel-art/pixellab_v3/`
Build scripts there regenerate every PNG from `raw/` (log + costs: `LOG.md`); fragment `pixel-art/manifest.v3env.json`.
- `relay_core` (109×118, idle 4: crystal pulse + motes + mast lamp) replaces the V1 Relay everywhere (day clearing,
  night map, title, results). Concrete bunker, hazard band, moss, cables rooting into the ground; the crystal is the
  brightest value. Collider: `SOLID.kind.prop_relay` (unchanged).
- `prop_relay_pylon` (32×113): frame 0 / anim `off` = dead mast (dark glass, dull dish, red standby LED);
  anim `on` (frames 1–4) = cyan lamp pulse, lit dish rim, hard-edged halo and a beam straight up (the landmark tell).
  `JungleScene._pylonGlow` switches the anim.
- District hero ruins (`REGION_LOOK.hero`, 1–2 per MAJOR site, north side of the clearing): `ruin_market_kiosks`
  (kiosk row, torn faded awnings), `ruin_station_platform` (half-sunk platform, blue station sign, waterline + puddles),
  `ruin_apartment_facade` (collapsed facade, balconies, exposed brick + rebar), `ruin_server_hall` (rack banks with
  LED pixels, cooling fan, cable bundles). Atlas families `ruin_kiosk / ruin_platform / ruin_facade / ruin_server`.
- Area bosses (static, they don't walk): `boss_thorn_mother`, `boss_brood_hive`, `boss_warden`, `boss_drowned_engine`.
  One strip each: `idle` 0–3, `attack` 4–5, `hurt` 6 (warm tint), `dead` 7 (dimmed, slumped). Wired in Stage 7
  (`src/entities/AreaBoss.js`): attack plays once per move, hurt flashes 0.14 s after a blow, dead holds; phase 2 tints
  the sprite `BOSS.tint2` (warm red). Their moves use the shared telegraph language: red rings / lanes for hits
  (`fx.ringTele`, `fx.telegraph`, `fx.chargeLane`), spore-green rings for spore clouds, steam-white rings for vents, the
  Warden's laser a 1-px blinking aim line, then a 0.45-tile red beam with a pale core.

### Stage 7 days: derived sprites, goal props, weather (`src/data/bosses.js`, `objectives.js`, `weather.js`)
- **Derived sprites** (no new art; `DERIVED_SPRITES`, made by `PaletteSwap` at load): `npc_engineer` = the player's
  8-way sheet with the coat hue band remapped by brightness rank onto an orange ramp (`#3b1f0e … #ffc36a`), drawn with
  a green silhouette (friendly) when covered; `feral_chief` = the Feral's sheet with its cloak on a deep red → gold ramp
  (the Pack Lord adds the elite ring). Whole-texel remaps only: same pixels, same anims, new palette.
- Goal props reuse world art at 1×: the uplink = today's beacon (else `terminal`) with a 2-px cyan ground ring (7 tiles;
  it blinks when you're outside; an x-ray copy shows faintly through foliage); tracks = `dec_footprints` /
  `dec_bones_skull` / `dec_twigs_crossed` / `dec_burrow` with an amber glint every 0.7 s; the generator core =
  `cell_cache` (carried over the head); spore nests = `prop_nest` tinted `#d8f070`; the Bloater = a Crawler body tinted
  `#d0dc68` with a `spore_pod` sac ×2 on its back.
- **Weather** looks are all in the PostFx pass, pixel-exact: Rain = 1-px streaks on world-pixel lanes every 6 px, 7 px
  long, leaning 1 px left per 3 down, 42% toward pale blue-grey (lit by the scene's light, so they dim at dusk), plus
  thin ground ripple rings (`#a8c4dc`) and a cool grade `[0.8, 0.86, 0.96]`. Fog = a grey-green veil in 5 world-anchored
  Bayer steps, thickening from 30% to 105% of the light radius, lumpy with slow value noise, dimmer after dark. Heat = a
  warm grade `[1.08, 1.0, 0.85]`, a thin ochre haze far out and ×1.5 light shafts. HUD tag colours: rain `#a8c4dc`,
  fog `#c4d0cc`, heat `#ffc36a`.
- HUD: the area boss bar (top centre, 300 × 8 units, red fill over an amber "lag", a pale tick at 50%, grey while the
  Brood Hive is shielded; name 16 units, note 12), the ☠ boss marker on the maps (a 5 × 5 skull with ink eyes, red `#ff4a4a`).

## V1 look (night-mode sprites)

- Grounded, weathered, believable: rusted sheet metal, cracked concrete, moss creeping over salvage. Not cartoony, not chibi.
- **Palette: Endesga-32** only, hue-shifted ramps. Light from the top-left. 1 px dark outline `#181425`, selout inside.
- No anti-aliasing to transparent, no semi-transparent pixels. Glow details use cyan `#2ce8f5`, amber `#feae34`, yellow `#fee761`, red, green.
- ppu 32, feet on the bottom row, characters face RIGHT (the game flips them), horizontal animation strips.

## V1 sprite list (still used by night mode and as fallbacks)

Anim names the code uses: `idle walk attack windup hurt` for creatures; `on off` for objective props; extra names are listed per sprite.
Missing anims fall back to `idle` (or frame 0).

### Characters & exploration enemies (group: chars)
| Key | Frame | Anims | Notes |
|---|---|---|---|
| player | 32×40 | idle 2, walk 4, attack 2 (firing, muzzle flash), dodge 2, hurt 1 | Scavenger: green hood, cyan goggles, orange scarf, patched jacket, backpack with cables, scrap carbine |
| crawler | 32×28 | idle 2, walk 4, windup 1, attack 2 | Bramble Crawler: thorny vine-beast on four legs, bark plates, red eyes |
| skitter | 24×20 | idle 2, walk 4, windup 1, attack 2 | Fast insectoid, magenta/purple carapace, yellow eye |
| scav | 32×40 | idle 2, walk 4, windup 1 (aiming), attack 2 (firing) | Rival scavenger: red bandana, dark coat, long rifle |
| spitter | 32×36 | idle 2, windup 2 (swelling), attack 2 (spitting) | Rooted bulb plant with a fanged maw, pink/purple, red glow |
| razorback | 48×36 | idle 2, walk 4, windup 2 (pawing), attack 2 (charging) | Armored boar-beast, rusty plates fused to hide, ivory tusks |

### Defense-only enemies, boss, NPC (group: night)
| Key | Frame | Anims | Notes |
|---|---|---|---|
| burrower | 32×28 | idle 2, walk 4, burrowed 2 | Mole-drill creature; `burrowed` = moving dirt mound with a drill tip poking out |
| seed_carrier | 36×36 | idle 2, walk 4 | Bulbous pod-walker carrying glowing amber seeds |
| seedling | 16×16 | idle 2, walk 4 | Tiny sprout critter |
| ruin_guard | 40×48 | idle 2, walk 4, attack 2 | Overgrown stone-and-metal sentinel holding a blue energy shield |
| colossus | 96×112 | idle 2, walk 4, windup 2, rooted 2, charge 4 | Canopy Colossus: walking tree-titan, bark armour, glowing red heart-core in the chest |
| survivor | 32×40 | idle 2 (waving) | Stranded engineer, blue overalls, hard hat, waving a yellow light stick |

### Defense structures (group: towers)
| Key | Frame | Anims | Notes |
|---|---|---|---|
| relay_core | 96×112 | idle 4 (glow pulse) | Transit-station power hub: concrete plinth, machinery, antenna mast, cyan crystal core |
| tower_base | 32×32 | — , `flat: true` | Build pad decal: concrete slab, hazard corners. Also used as the empty-pad marker |
| scrap_turret, _2, _3 | 32×48 | idle 1–2, attack 2 | Salvaged gun turret; L2 adds a second barrel/ammo belt, L3 heavy armour + glowing amber core |
| thorn_nest, _2, _3 | 32×48 | idle 2, attack 2 | Woven wooden basket nest bristling with thorns; L2 purple sap, L3 larger, glowing |
| arc_spire, _2, _3 | 32×48 | idle 2 (crackle), attack 2 | Coil tower with insulator rings and a cyan orb; L2/L3 more rings, bigger orb |
| snare_vine, _2, _3 | 32×48 | idle 2 (sway), attack 2 (lash) | Planter of tendrils with a pink bulb; L3 thick roots |
| mortar_pod, _2, _3 | 32×48 | idle 1–2, attack 2 (recoil) | Organic seed-mortar: green pod body with a metal barrel |
| pulse_beacon, _2, _3 | 32×48 | idle 4 (pulse) | Antenna cone with an amber ring emitter |
| beacon | 24×72 | idle 2 | Emergency extraction beacon pole with a flashing cyan light |

### Environment (group: env)
| Key | Frame | Anims | Notes |
|---|---|---|---|
| tree, tree_2, tree_3 | 64×80 | — | Jungle trees growing through ruins (variants: broadleaf, palm-ish, dead/vine-wrapped) |
| bush, bush_2 | 32×24 | — | Ferns / leafy shrubs |
| bramble | 32×32 | — | Thorny bramble barrier (cut with the Pulse Cutter); dark red thorns |
| rubble, rubble_2 | 32×24 | — | Concrete chunks, rebar |
| car_wreck | 64×40 | — | Rusted car overgrown with vines |
| lamp_post | 16×72 | idle 2 (flicker) | Old street lamp, amber light |
| spores | 32×32 | idle 2, `flat: true` | Spore hazard patch on the floor (pink/purple puffs) |
| alarm | 32×8 | idle 2, `flat: true` | Red security laser beam across the floor |
| wall_block | 32×48 | — | Generic ruined wall chunk (used where a wall block needs a billboard) — optional |

### Tiles (group: env) — 32×32, `"tile": true`, seamless
`floor_overgrown_market floor_alt_overgrown_market wall_overgrown_market`, same for `flooded_transit canopy_greenhouse
collapsed_residential data_center`, plus `water` (2 frames, wavy), `floor_defense floor_alt_defense lane_defense`.
`floor_*` is the main ground, `floor_alt_*` the moss/tile variant, `wall_*` the top texture of wall blocks.

### Interactables & pickups (group: props)
| Key | Frame | Anims | Notes |
|---|---|---|---|
| crate | 24×24 | — | Wooden supply crate |
| chest | 28×22 | — | Metal tool chest, amber latch |
| cache | 28×24 | — | Rare purple cache with a glowing lock |
| intel_terminal | 24×36 | idle 2 | Old terminal with amber screen |
| opened | 24×16 | — | Opened/emptied container |
| fuse | 12×16 | idle 2 | Glowing amber fuse |
| power_box | 28×40 | off 1, on 1 | Electrical box; red light → green |
| terminal | 32×40 | off 2, on 2 | Data terminal; red screen → green |
| pump | 28×36 | off 1, on 2 | Water pump, valve wheel; light red → green |
| cell_cache | 32×32 | off 1, on 1 | Armoured power-cell cache with a cyan cell |
| nest | 40×36 | idle 2 | Pulsing organic enemy nest |
| data_log | 14×10 | idle 2 | Small glowing data drive |
| locked_cache | 32×26 | off 1, on 1 | Locked purple cache (on = opened) |
| workbench | 40×32 | — | Abandoned workbench with tools |
| surge_box | 28×44 | off 2, on 2 | High-voltage junction box |
| pick_scrap pick_circuits pick_biofiber pick_intel pick_med | 12×12 | idle 2 (glint) | Loot pickups: scrap gear, circuit chip, fiber bundle, intel disk, med kit |

### Relics (Stage 7; `src/ui/relics.js`, `src/data/relics.js`)
- **UI icons** `relic_<id>` (24 of them, 24×24, one frame; `pixel-art/manifest.v3relics.json`, contact sheet
  `pixel-art/contact_v3relics.png`): the object on a plaque whose frame shows the rarity — common slate, rare cyan with
  gold studs, cursed red-violet. Drawn at whole-number scales (`iconEl`, ≈35 UI units = ×2 at 720p / ×3 at 1080p in
  cards; the HUD strip uses smaller whole steps). Rarity text colours match the plaques: common `#c0cbdc`, rare
  `#62e0f2`, cursed `#e05a9a` (a cursed relic's price line is `#ff6fb0`). Unseen relics in the Codex are the icon as a
  flat dark silhouette.
- **In the world** a relic is a small 12×12 generated pendant (`relic__pendant_C|R|X`, a gem on a cord: common bone,
  rare gold — the loot colour, cursed red-violet; dark warm outline), not the plaque — the plaque reads as UI. It bobs, glints and sits in a
  gold light pool (`lightPool`). A shrine shows the same pendant hovering over its glow; a strongbox is the
  `locked_cache` prop (its `gutted` spent variant once opened) with a gold glow until then; data-log spots reuse
  `data_log`. Map: strongbox / shrine gold dot, relic on the ground gold star, data log cyan dot; place names in Tiny5
  `#ead4aa` with an ink outline at whole-pixel scale.
