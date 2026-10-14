# Verdant Relay — Build Plan

Read `DESIGN.md` for what the game is. This file covers how it's built and in what order.

## Tech

- **Three.js 0.186.1** (pinned) + **Vite 5**, plain JavaScript (ES modules). Run `npm run dev` (port 5190) or `Play.bat`.
- **Pixel look:** the day renders a fixed 640×360 view (`CONFIG.ui.view`, 20 × 11.25 tiles) with `renderer.setPixelRatio(1)`, shown at a
  whole-number scale (×2 at 720p, ×3 at 1080p, ×4 at 1440p; odd windows bend the size a little within `CONFIG.ui.viewBand`, rest letterboxed);
  the night map renders at a fixed 1280×720 (`game.setInternalRes`). CSS `image-rendering: pixelated`. No resolution setting.
  Use `NearestFilter` on every texture and turn off mipmaps.
- **World units:** 1 unit = 1 tile, Y up, world X = tile x, world Z = tile y. Models face −Z.
  To face direction (dx, dz), set `rotation.y = atan2(-dx, -dz)`.
- **Camera:** a `PixelCamera` (`src/core/PixelView.js`): an `OrthographicCamera` pitched 55° (`CONFIG.pixel`) with **1 tile = 32 internal px**
  on the ground in both directions (640 px → 20 tiles across; the 30×17 night field is 960×544 px), so floor tiles and 32-ppu sprites draw 1:1.
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
  public/sprites/            exported sprites + manifest.json (V1 hand-made + V2 PixelLab)
  public/terrain/            PixelLab Wang terrain sets + metadata (base tiles feed TerrainBaker)
  src/
    main.js                  boot: loads sprites, registers scenes, debug URLs, starts at the title
    core/
      Game.js                renderer, internal res, letterbox/integer scaling, loop (dt clamp), deferred scene switching, shake/flash
      PostFx.js              screen-space canopy light, dusk darkness, grading, foreground leaves
      PixelView.js           PixelCamera (ortho, 55°, 32 px/tile), upright-card sprite shader, per-draw pixel snapping
      Assets.js              manifest sprites; makeVisual(key) → billboard / flat decal / placeholder; anims, facing, flashes, icons
      Fx.js                  particles, rings, bolts, telegraphs, corpses/splats, muzzle flashes, hit-stop, floating text
      Run.js                 run state: districts, resources, costs w/ skills, towers, boons, Intel, research, saves
      Save.js                versioned localStorage meta + run (strict validation)
      Music.js               procedural WebAudio music (title/day/dusk/night/boss/results/defeat) + jungle combat layer
      Sfx.js                 audio engine: mix buses → compressor → limiter, synthesized one-shots, play / playAt (positional)
      AmbientAudio.js        jungle beds (wind, insects, cicadas, water, rain) + bird / cricket / frog calls
      AudioDirector.js       reads the scene: ambience profile, footsteps, heartbeat, E-hold ticks, combat music, alarms
      synth.js  Input.js  rng.js
    data/                    ALL tuning lives here
      config.js (player, expedition byNight, relay, intel, pixel, JUICE, ui) towers.js enemies.js waves.js
      jungle.js (world gen, DAY, POP, ATMOS, REGION_LOOK) districts.js objectives.js skills.js crafting.js unlocks.js defenseMap.js visuals.js music.js audio.js
      guide.js (guided day, verb TIPS, readiness) hud.js (maps, HUD) controls.js (key bindings)
    world/
      JungleGen.js           the persistent 192×192 jungle: regions, rivers, sites, trails, undergrowth, trees, loot, pylons
      JungleWorld.js         chunk streaming, upright-card foliage, collision, cutting, canopy shade
      TerrainBaker.js        per-pixel blended ground (no tile grid), edge shading, AO, litter
      FloraAtlas.js          atlas of foliage/tree/ruin sprites by family (+ procedural placeholders)
      Ambience.js            pollen, leaves, fireflies, light shafts
      DefenseGround.js       the night map drawn with the same terrain/foliage
      noise.js               seeded value noise, hashes
      collide.js             ray-cast helpers (telegraph lengths)
    entities/
      Player.js              machete: 3-hit combo, charged chop, dodge roll, stamina, hurt/i-frames, meds
      BladeKit.js            the run's machete kit (skills + Workbench upgrades): derived weapon spec, Serrated Edge bleed
      ExploreEnemy.js        spawn/idle/chase/windup/attack/recover/stunned state machine, flow-field pathing, brush slip/crash
      ExploreShots.js        pooled bullets, bolts, sap globs, cutter sweep
      DefenseEnemy.js        waypoint follower, slow/root, burrow, spit, seed burst, Colossus phases + enrage
      Tower.js               stats from Run.towerStats, targeting (Lead/Nearest/Toughest), bullet/chain/mortar/snare/support
      Projectiles.js         pooled shots and mortar shells
    scenes/
      TitleScene SettingsScene CollectionScene BriefingScene JungleScene SummaryScene DefenseScene ResultsScene
      MenuBackdrop.js        a slow drift over the jungle around the Relay behind the menus
    ui/
      ui.js screensKit.js hints.js JungleMap.js   DOM helpers, menu kit, one-time hints, jungle minimap/Tab map (fog of war)
      workbench.js           camp crafting UI: the Workbench step, night prep's mod socket row, Codex skills / recipes
      style.css screens.css explore.css jungle.css defense.css
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

### Stage 5: V2 — open-world jungle (direction change, 2026-10-13)
- [x] Persistent seeded jungle per run, chunk streaming, blended terrain (no grid), card foliage, see-through window
- [x] Machete melee (combo, chop, roll, stamina), cutting undergrowth, persistent trails
- [x] Open-world day: objectives at sites, pylons as return/drop points, supplies, wildlife per chunk, dusk hunters
- [x] Screen-space lighting, ambience, foreground leaves; menus and night map use the jungle renderer
- [x] PixelLab environment art (terrain, undergrowth, trees, ruins, props, decals)
- [x] PixelLab character art (player 8-way with slash/chop/roll, creatures)
- [x] Critic playtest + fixes on the new loop; balance pass (day length, wildlife, economy) — critics F and G

### Stage 6: Grounded jungle and public-ready (2026-10-13)
Feedback: "I don't like how I can run over everything in the jungle", wants more field of view and a game that is
simpler to the public's eye.
- [x] Solid jungle: everything that looks solid blocks you (trunks, logs, boulders, stumps, ruins, props, tall plants);
      undergrowth must be cut or pushed through slowly; deep water only at fords; enemies obey the same rules
- [x] Wider view: a fixed 640 × 360 world view (×2 at 720p, ×3 at 1080p, ×4 at 1440p), streaming/lighting retuned
- [x] Simplicity pass: guided first day, plain-language UI, decluttered HUD/menus/night prep, one colour language
      (tuning in `src/data/guide.js`; DESIGN.md §8)
- [x] Newcomer playtest (fresh-eyes critic) + fixes

### Stage 7: Harsh-critic overhaul and expansion (2026-10-13)
Five critics (`critique/critic_H` art, `I` combat, `J` design/content, `K` tower defense, `L` first hour/UX/audio) agreed:
gorgeous assets, shallow game. The night-3 cliff ends runs, the night is spectating, the boss can't be killed, upgrades
are a trap, walking beats every enemy, the jungle is silent, districts look alike, and there is ~15–20% of a $10–15
roguelite's content. Work is split into agent-owned streams (each keeps DESIGN/ARCH/STYLE in sync).

Wave A — feel, look, sound
- [x] Audio: jungle ambience bed, footsteps by surface, mix buses + compressor, positional world sounds, split overloaded
      sounds, missing tower/hold/extract sounds, dusk mood + combat layer, master/ambience volume + mute (critic L §7)
- [x] Combat: tracking lunges, no stacking, silhouettes never over the player, stamina/cutting rework, Feral spawn fix,
      **deflect/riposte**, roll buffer + perfect-dodge reward, **environmental kills**, **Feral spear throw**,
      **Thorn Stalker**, **machete throw (F)**, status effects, corner nudge, breakpoints, elite second move (critic I)
- [x] Jungle visuals: value hierarchy (lit paths), per-district grades, golden-hour dusk + emissive night, world-anchored
      dithers, hand-drawn leaf frame, water waterline/ripples, effect palette, Feral palette swap, prop clearance (critic H)
- [ ] Art: hand-made leaf frame, ripple/splash, spore pod/puffs, wordmark logo, unlock icons, panel frame; PixelLab
      (last 10 of the 300 cap) Relay, pylon, four district hero ruins, area-boss sprites

Wave B — the night becomes a game (critic K + J M1/M2)
- [x] Night board: integer-scale pixel-exact night with zoom/pan camera, lanes clear of scenery, no enemy-on-enemy x-ray,
      decluttered board, **map variants** (lanes face the jungle; the area's danger enters from its side; online beacons
      add forward pads), 720p UI fit, leak feed + breakdown, truthful per-lane readiness, visible rewards.
      Done: `NightCamera` (whole zooms, wheel / + − / right-middle drag / arrows / Home), 23×15 field that fits ×1 at
      720p and ×2 at 1080p/1440p, `DEFENSE_MAPS` twin / crossing / ford (`run.mapKey` from the seed), `laneForDistrict`
      danger lane, beacon forward pads, per-texel card filter on lanes/pads, painter's-order units (no silhouettes),
      jungle PostFx night grade with emissive eyes/crystal and lamp light pools, worn trails, quiet pads/rings, wet-lane
      and glint rewards, compact build list + Upgrade/Sell row + styled tooltips, leak feed / banner line /
      `run.lastNight`. Readiness content is the mechanics stream's (laid out here)
- [x] Night mechanics: **Relay Protocols** (active abilities during waves), **mid-night pushes** with build lulls and
      call-early, **L3 branches** + upgrade economics, tank counters, **killable boss siege**, Seed Carrier/Mortar fix,
      **wave variants**, smoothed HEALTH_MULT (no N3 cliff), Relay stipend, post-night salvage pick, 3× speed.
      Done: `src/data/protocols.js` + `DefenseProtocols` (Q Vine Snare free 28 s, 2 charges from N4, cancels the boss's
      charge; W Arc Discharge 1 C + 10 S; E Flare 1 Intel; research unlocks), 2–3 pushes a night with 12 s lulls,
      Call next push (N, +1 Scrap / 2 s), two L3 branches per tower (`rec.branch`, `_3a/_3b` sprites), L2 ≈ +70% DPS
      for ≈ 0.9× cost, surcharge 6, Scrap→component exchange (prep, from N2), Piercer / Root big / RG 190 HP, the
      Colossus besieges the plaza (5 per slam / 3 s, 8 slams) and is killable, Seed Carrier blast tag 3 s, Mortar
      1.9 s / 28, three variants per night + the Long Night generator, HEALTH_MULT 1.0 / 2.4 / 3.3 / 6.0 / 6.2 / 7.0
      with fewer, tougher enemies from night 2 and a per-map hpMult (Twin 0.86, Crossing 1.07, Ford 1.18), two pads per
      map moved to see both trails, stipend +10…30, salvage pick (3 / 2 / 1 options by Relay lost), 1× / 2× / 3×,
      truthful per-path readiness (`DefenseForecast`, calibrated on the sim), weak-start confirm needs its button or
      Shift+Space, no Space-pause for 0.6 s after a push starts. Balance: full-run sim of the real scene
      (`.playwright-mcp/nightmech`, DESIGN §5 table): newcomer 0/36 (N3 holds 78%, falls N4), typical 75–81% wins with
      falls on N5–N6 and 0 / −3 / −3 / −37 / −42 / −51, strong 36/36; tall vs wide within ~4 HP on N4.
      Not done: typical's nights 2–3 stay light (−3 each; more would kill newcomers on N3), and its N4–N6 losses run
      ~5–10 above the 15–30 / 25–40 targets at a 75–81% win rate
- [x] Run systems: death rules (salvage ≤ carried, dawn HP, reward needs extraction, home confirm, mid-day quit =
      abandon), honest area cards, **research tree** (21 nodes in 3 branches + 3 hidden future towers), **Overgrowth
      1–10**, **Long Night** endless, daily seed, clean title, Results "what got through". (Camp crafting landed with
      the skill rework below, the Workbench.) Not done: the hidden tower nodes (Sap Cannon, Lure Totem, Bramble
      Wall) wait for a stage that builds the towers

Wave C — the jungle gets content (critic J M3–M5, M7, N2, N4; critic L UX)
- [x] **Relics** (24; lost sites, landmark shrines, hidden caches, bosses; carried until home), Codex: `src/data/relics.js`
      (11 common / 9 rare / 4 cursed, every effect read through `Run.relicMod`), strongboxes at lost majors (~4 a
      jungle), a pick-of-two shrine at every landmark (5), 12% of hidden caches, `scene.dropRelic` for area bosses;
      carried on the HUD, banked on getting home, lost on going down; summary Found / Lost, night prep lines, Codex
      Relics N/24 with silhouettes (`meta.relicsSeen`). Icons `relic_<id>` (pixel-art `manifest.v3relics.json`)
- [x] **Events wired** + 5 new goal types (Escort, Hold the uplink, Track the Alpha, Haul, Purge the bloom): one event a
      day from day 2 (Abandoned Workshop / Power Surge / Infested Cache) at a camp or minor site, announced with its
      reward and risk at 10 tiles, then marked; goals from day 2 (`minNight`), run by `src/scenes/JungleGoals.js`
      (`GOALS` tuning): a 60-HP engineer who follows your trail (half the nearby attackers go for him; he can die →
      goal failed), a 45 s uplink you stay within 7 m of (3 waves; hits cost it 3 s; turns on the area's beacon), a
      3-clue trail 20–30 m a leg to an Alpha (×1.5 elite HP, rare relic), a carried core (×0.75 speed, no roll or
      swing, E drops it), 3 spore nests within 60 s (they puff, regrow if you're slow). Rewards: 2 free upgrades /
      15% fewer enemies / relic + towers +10% / +30 Scrap +2 Circuits / enemies 10% slower
- [x] **Area bosses** (one per area from day 3; a kill removes that area's danger for the run), later-day creatures:
      `src/data/bosses.js`, `src/entities/AreaBoss.js`. Thorn Mother (vine whips, spore barrage, crawler brood), Brood
      Hive (crawler shield, burst ring, skitter eggs), Security Warden (sweeping laser, stomp, drones), Drowned Engine
      (steam vents, surge wave lanes, blast), Pack Lord (a Feral Chief with 4 Ferals and a war cry). 450 × elite HP,
      phase 2 at 50%, leash reset, HUD bar, ☠ on map + briefing card; kill = rare relic, +30 Research, a skill point,
      that area's night danger gone (`run.bosses`). Bloater from day 4 (swells and bursts into spores; a chop
      launches it), Feral Chief leading camps from day 5 (Ferals +20% speed near it)
- [x] Named landmarks + lore logs: every major site and landmark named (`src/data/lore.js`; big map once mapped, a
      banner on first entry), landmark extras (radio mast maps 40 tiles, glasshouse heals 40), 20 data logs read in
      story order (~10 spots a jungle, ~3–4 a run), kept in `meta.lore` and re-readable in the Codex
- [x] **Weather / day modifiers**: from day 2, 35% of days (`src/data/weather.js`, `src/world/Weather.js`): Rain
      (sight −30%, cutting noise −40%, no rustle; 1-px rain streaks + ripples, rain bed), Fog (light −35%, containers
      +20% Scrap; dithered veil), Heat (stamina refill −25%, ×1.5 spore pods; warm haze). Briefing line + HUD tag
- [x] Skill rework (machete branch, keystones, weighted offers) + **camp crafting**: 22 skills in 4 branches (Scavenger,
      **Machete**: Riposte Master / Second Wind / Brush Dancer / Cleaver / Hunter, Engineer, Warden), one ★ keystone each
      (Salvage King, Duelist, Chain Reaction, Grove Warden) after 2 of its branch, offers 60% toward owned branches,
      1 point a trip + 1 per area boss (~6–8 skills a run), old ids mapped (Pack Rat I+II, Long Sightlines + Overclock, …;
      removed → refunded point). The **Workbench** step after the summary (`src/data/crafting.js`): 4 tower mods (one
      socket per tower, fitted in night prep), 3 machete upgrades, med kit, Relay plating; Codex sections (critic J §3,
      §8, M7, M9)
- [x] UX: teach every verb in context, HUD legibility, keyboard parity, settings (rebinding, fullscreen), river/beacon
      wayfinding, a guided day that pays. Verb tips once per profile (`TIPS` in `src/data/guide.js`: roll, deflect,
      bramble chop, throw, med kit, beacon, sunset; never stacked); guided day routes 4 trail-side crates
      (`GUIDE.routeCrates`, JungleGen `guidedRoute`) + a reachable coached crate (◆ + edge arrow), measured 63 Scrap
      banked; HUD on the texel grid (16 px @720p, 24 px @1080p), HP green/yellow/red + low-HP pulse, daylight clock
      (`ui_daylight` sun/moon), hudFade 0.5; every `ui.modal` keyboard-driven (focus, arrows, Enter/Space/E, Esc);
      Settings tabs (Sound / Game / Controls): key rebinding (`src/data/controls.js`, `meta.settings.keys`,
      `Input.useBindings`), fullscreen; ford ◇ on the maps + "cross at the stepping stones"; creature icons use the
      cropped side frame
- [ ] Fresh critic round on the result

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
