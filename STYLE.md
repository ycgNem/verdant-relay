# Verdant Relay — Art style and sprite contract

All art is hand-built pixel art made with the **pixel-art-studio** skill (`pixel-art/<slug>/build.py` → PNG).
Sprites are camera-facing billboards in a 3D world viewed from a ~55° top-down camera, so everything is drawn in
**3/4 top-down view** (you see the top and the front of things).

## Look

- Grounded, weathered, believable: rusted sheet metal, cracked concrete, moss creeping over salvage, frayed cloth,
  scuffed paint, rivets, cables, leaves. Post-collapse transit city reclaimed by jungle. Not cartoony, not chibi.
- **Palette: Endesga-32** (`PALETTES["endesga32"]`) only. Build hue-shifted ramps from it (shadows cooler/purpler, lights warmer).
- **Light from the top-left.** Highlights on top/left faces, shadow on bottom/right.
- **Outline:** 1 px dark outline `#181425` on the outer silhouette (selout: inner lines use a darker shade of the local colour).
  The game floor is busy; a dark outer edge keeps sprites readable.
- **No anti-aliasing to transparent**, no semi-transparent pixels (alpha 0 or 255 only). No pillow shading, no banding.
- Glow/emissive details (eyes, screens, crystals, lamps) use the brightest palette colours: cyan `#2ce8f5`, amber `#feae34`,
  yellow `#fee761`, red `#e43b44`/`#ff0044`, green `#63c74d`. Sprites are tinted blue at night, so keep values bright enough.
- Detail density: aim for readable silhouettes first, then 2–3 levels of material detail (e.g. plate seams, bolts, stitching).

## Scale and anchoring

- **ppu 32**: 32 texels = 1 tile = 1 world unit. A human is ~1.15 tiles tall (≈ 36–40 px including head).
- Feet/base touch the **bottom row** of the frame (no padding below), horizontally centred.
- Characters and creatures **face RIGHT** (3/4 front-right). The game flips them for left.
- Animation strips are **horizontal**, equal-size frames, no padding between frames.

## Manifest

Each sprite is listed in `public/sprites/manifest.json`:
```json
"crawler": { "file": "crawler.png", "ppu": 32, "frames": 9, "fps": 8,
             "anims": { "idle": [0,1], "walk": [2,3,4,5], "windup": [6], "attack": [7,8] } }
```
Optional: `"flat": true` (ground decal, drawn lying on the floor), `"tile": true` (a 32×32 seamless floor/wall texture,
not a visual), `"shadow": r` (blob-shadow radius in tiles, 0 for none), `"animFps": {"walk": 10}`.
Art agents write fragments to `pixel-art/manifest.<group>.json`; `python pixel-art/merge_manifest.py` merges them.

## Sprite list (the contract code relies on)

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
