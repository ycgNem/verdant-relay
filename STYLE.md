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
