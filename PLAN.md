# Verdant Relay — Build Plan

Read `DESIGN.md` for what the game is. This file covers how it's built and in what order.

## Tech

- **Three.js 0.186.1** (pinned) + **Vite 5**, plain JavaScript (ES modules). Run `npm run dev` (port 5190) or `Play.bat`.
- **Pixel look:** render at 480×270 (Settings option 640×360) with `renderer.setPixelRatio(1)`; the night map renders at a fixed
  1280×720 (`game.setInternalRes`). Scale the canvas up with CSS `image-rendering: pixelated`, letterboxed to the exact base aspect;
  Settings → "Pixel-perfect scaling" (`meta.settings.integerScale`) letterboxes to a whole-number multiple instead.
  Use `NearestFilter` on every texture and turn off mipmaps.
- **World units:** 1 unit = 1 tile, Y up, world X = tile x, world Z = tile y. Models face −Z.
  To face direction (dx, dz), set `rotation.y = atan2(-dx, -dz)`.
- **Camera:** a `PixelCamera` (`src/core/PixelView.js`): an `OrthographicCamera` pitched 55° (`CONFIG.pixel`) with **1 tile = 32 internal px**
  on the ground in both directions (480 px → 15 tiles across; the 30×17 night field is 960×544 px), so floor tiles and 32-ppu sprites draw 1:1.
  Sprites are drawn as upright cards (patched sprite shader): same 1:1 pixels on screen, but depth of a vertical card at their feet, so walls
  behind a sprite never cut it. The camera focus and every sprite/decal are snapped to the pixel grid each draw (no shimmer).
  Sprite scales are whole numbers only. Wall boxes show a fixed `wallFrontPx` (16) of their camera-facing side.
  It follows the player by day and is fixed over the whole map at night.
- **Lighting:** a hemisphere light plus one directional light with Lambert materials. Day is warm. Night is blue, with a cyan point light on the core.
- **Art:** detailed, realistic-feeling pixel sprites drawn as camera-facing billboards (`THREE.Sprite`, `center = (0.5, 0)` so the feet sit on the floor),
  each with a blob shadow underneath. To add one, drop a PNG in `public/sprites/` and list it in `public/sprites/manifest.json`:
  `{ "player": { "file": "player.png", "ppu": 32 } }`. Any key not listed falls back to the primitive model in `src/data/visuals.js`.
- **UI:** a DOM overlay (`#ui`) on top of the canvas, so text stays crisp. HUD and menus are plain HTML/CSS.

## Folder map

```
verdant-relay/
  DESIGN.md PLAN.md ARCH.md STYLE.md README.md   docs (game, build plan, engine API, art contract)
  Play.bat  package.json  vite.config.js  index.html
  .github/workflows/deploy.yml   builds and publishes to GitHub Pages on every push to main
  critique/                  playtest reports from the critic rounds (A–E)
  pixel-art/                 sprite build scripts (pixel-art-studio) + manifest fragments, merge_manifest.py
  public/sprites/            exported sprites + manifest.json (85 keys)
  src/
    main.js                  boot: loads sprites, registers scenes, debug URLs, starts at the title
    core/
      Game.js                renderer, internal res, letterbox/integer scaling, loop (dt clamp), deferred scene switching, shake/flash
      PixelView.js           PixelCamera (ortho, 55°, 32 px/tile), upright-card sprite shader, per-draw pixel snapping
      Assets.js              manifest sprites; makeVisual(key) → billboard / flat decal / placeholder; anims, facing, flashes, icons
      Fx.js                  particles, rings, bolts, telegraphs, corpses/splats, muzzle flashes, hit-stop, floating text
      Run.js                 run state: districts, resources, costs w/ skills, towers, boons, Intel, research, saves
      Save.js                versioned localStorage meta + run (strict validation)
      Music.js               procedural WebAudio music (title/day/night/boss/results/defeat)
      Sfx.js  Input.js  rng.js
    data/                    ALL tuning lives here
      config.js (player, expedition byNight, relay, intel, pixel, JUICE, ui) towers.js enemies.js waves.js
      districts.js objectives.js skills.js unlocks.js rooms.js defenseMap.js visuals.js music.js
    world/
      ExploreGen.js          seeded room grid → tile map, loops, roles, templates, loot/enemies/objectives, reachability check
      TileWorld.js           floor canvas texture from tiles, instanced walls, pixel canopy
      collide.js             circle-vs-tile movement (substeps), ray-cast, line of sight
    entities/
      Player.js              move, aim, carbine/scattergun, cutter, dodge, hurt/i-frames, meds
      ExploreEnemy.js        spawn/idle/chase/windup/attack/recover/stunned state machine, flow-field pathing
      ExploreShots.js        pooled bullets, bolts, sap globs, cutter sweep
      DefenseEnemy.js        waypoint follower, slow/root, burrow, spit, seed burst, Colossus phases + enrage
      Tower.js               stats from Run.towerStats, targeting (Lead/Nearest/Toughest), bullet/chain/mortar/snare/support
      Projectiles.js         pooled shots and mortar shells
    scenes/
      TitleScene SettingsScene CollectionScene BriefingScene ExploreScene SummaryScene DefenseScene ResultsScene
      MenuBackdrop.js        living pixel diorama behind the menus
    ui/
      ui.js screensKit.js hints.js Minimap.js     DOM helpers, menu kit, one-time hints, minimap/Tab map
      style.css screens.css explore.css defense.css
```

## Rules

- **Data-driven.** Towers, enemies, districts, objectives, waves, skills, unlocks and rooms are config in `src/data/`, not scattered conditionals.
- **Run state is the single source of truth** (`Run.js`). Scenes read and write it and never keep their own resource totals.
- **Carried ≠ banked.** Exploration loot lives on the expedition until extraction.
- Every scene has `enter(params)`, `update(dt)` and `exit()`. `exit()` disposes geometries, materials and textures, removes listeners, and clears timers.
- Clamp delta time to ≤ 1/20 s. All movement is speed × dt.
- Generation is seeded from `run.seed` via `subSeed(seed, night, districtKey)`, so a run can be reproduced.
- Comment the non-obvious generation and wave logic.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds with Vite and publishes `dist/` to GitHub Pages
(`vite.config.js` uses `base: './'`, so the game works from any sub-path). `npm run playtest` serves a frozen local build on port 5191.

## Stages

### Stage 1: Playable prototype
- [x] Game.js loop, pixel renderer, letterbox, scene switching
- [x] Title → New Run
- [x] One generated exploration map: player move/aim/shoot/dodge, Crawlers, crates → Scrap, one objective, extraction
- [x] Defense map with 2 lanes and pads; build Scrap Turrets; spawn a wave; Core takes damage
- [x] Win/lose results screen

**Done when** you can start a run, collect, extract, build a turret, start a wave and reach a result with no console errors.

### Stage 2: Core loop
- [x] All 4 resources, 4 starting towers, 3 enemy types
- [x] Prep screen (build/upgrade/sell/repair/preview), night progression, resources persist within the run
- [x] Meta save (research, best run)

### Stage 3: Roguelite content
- [x] District choice, all 5 districts, room-template generation with loops
- [x] Optional objectives and events, skill picks
- [x] All 6 towers, full enemy roster, Canopy Colossus
- [x] Research unlocks (Collection screen), run summaries, Continue

### Stage 4: Art and polish
- [x] Detailed sprites for every key in `visuals.js` via `public/sprites/manifest.json`
- [x] Hit flashes, particles, telegraphs, screen shake (toggleable) — plus hit-stop, death beats, tracers/muzzle flashes, pixel bolts (JUICE in `src/data/config.js`)
- [x] Sound effects and music
- [x] Tutorial prompts on first run, balance pass, edge cases (generation, saves)

## Acceptance checklist

- [x] The day/night loop is understandable without outside explanation
- [x] Exploration and defense feel mechanically separate
- [x] Loot is banked only on extraction; dying costs the carried loot but not the run
- [x] Towers can be built only in prep; enemies follow readable lanes; towers hit reliably
- [x] Slow, root, burrow, shield and wind-up states are all visible
- [x] All 6 nights progress; the boss is telegraphed and beatable
- [x] Win and loss end the run cleanly; a new run resets run data and keeps unlocks
- [x] Unlocks survive a browser refresh
- [x] No unexplained controls or hidden objectives
