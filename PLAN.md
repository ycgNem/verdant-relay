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
- [x] Art: hand-made leaf frame, ripple/splash, spore pod/puffs, wordmark logo, unlock icons, panel frame; PixelLab
      (last 10 of the 300 cap) Relay, pylon, four district hero ruins, area-boss sprites. The PixelLab cap is now fully
      used (300/300): new art is hand-made. The Pack Lord has no sprite of its own (the Feral Chief ×2)

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
      1.9 s / 28, three variants per night + the Long Night generator, HEALTH_MULT 1.25 / 3.5 / 4.7 / 7.4 / 7.3 / 9.2
      with fewer, tougher enemies from night 2, the **Relay zap** (`RELAY_ZAP`: the crystal bolts the nearest enemy within
      3 tiles, or a planted Spitter, every 0.7 s; counted in readiness; said once in prep) and a per-map hpMult (Twin
      0.95, Crossing 1.07, Ford 1.18), two pads per map moved to see both trails, stipend +10…30, salvage pick
      (3 / 2 / 1 options by Relay lost), 1× / 2× / 3×, truthful per-path readiness (`DefenseForecast`, calibrated on the
      sim), weak-start confirm needs its button or Shift+Space, no Space-pause for 0.6 s after a push starts. Balance:
      full-run sim of the real scene (`.playwright-mcp/nightmech`, DESIGN §5 table): newcomer 0/36 (86% get through N3,
      falls N4), typical 78–86% wins, 0 / −8 / −11 / −33 / −46 / −47, falls N5–N6, strong 36/36.
      Not done: typical's N5–N6 losses run ~10 over the aim at a ~80% win rate (no N4 falls)
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
- [x] Boss fights redesigned (critic I2): move PATTERNS per phase (windup pose → telegraph → release, recovery gaps),
      an OPENING after each big move (×1.5 damage, gold bar), anti-hug rings past the chop's reach + a ranged move (no
      safe stand-off), honest Thorn Mother clouds (ring = cloud size, drawn cloud edges, directional spore damage, a
      tick no longer shields you), minions loot-free / no kill-heals / capped, lairs cleared of props within 6 tiles,
      600 × elite HP. Measured with the I2 bot (`.playwright-mcp/objectives/boss2/`)
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
- [x] Presentation polish (critic H2): one text lane (`TEXT_LANE`: banners one at a time by priority, toasts queued one
      at a time under the top-left panel and held during banners, night hints docked in the side panel, one DEFLECT
      word); one engaged area boss (lairs ≥ aggro + leash + 6 apart, Pack Lord tether 9, quiet "left" toasts, intro
      banner before the bar, kill banner then rewards); trails visible (brush/tree x-ray over trails, trailShade 0.12,
      dirt ×1.44: median 37–52 → 62–82, unoccluded 11–80% → 70–100% at seed 4242); fog after dark × night light
      (median 67 → 34, hue 209), heat warmer + shimmer; per-creature splats stained into the ground (0 of 7 darker than
      the ground under them, was 5 of 8); day rings only on threats; boss `_p2` sheets + aura, emissive boss keys, Pack
      Lord ×2 + gold ring + 4-tile clearing; twig X decal gone. Batch-4 art wired: Bloater / Thorn Stalker sheets,
      Protocol FX (dashed aim, vine snare, flare pool + ember, spore ring), plinth variants + front-face rank plates,
      health bars only on focus / big enemies, `icon_craft_<id>` on the Workbench, 9-slice `ui_panel_frame` on every
      `.panel`, titles ≤ 0.04 em, relic HUD icons at world texel scale, Codex object silhouettes.
      Not done: Data Center deep canopy keeps one trail median at ~50; the heat shimmer only shows in motion
- [x] Fresh critic round on the result: `critique/critic_H2` (art), `I2` (combat), `J2` (design), `K2` (tower defense).
      Round 1 → round 2 scores: art env 6.5 → 7.5, night map 4.5 → 7, cohesion 5.5 → 6.5; combat depth 4 → 6, enemy
      AI 4 → 6, traversal 5 → 7, responsiveness 7 → 8; design decisions 4 → 6, meta 3 → 6, variety 3 → 5.5, content
      volume 3 → 5.5 (~50% of a $10–15 roguelite, was 15–20%); TD depth 4 → 6, agency 2 → 5, boss 4 → 6.5. Their bugs
      and quick wins were fixed in a final pass (presentation polish, boss redesign, combat fixes, final fixes)
- [x] Final fixes (critic J2 + K2 quick wins, no new systems): `pickMapKey` unsigned (maps ⅓ each, was Twin 67%);
      bosses wake only when you step into the lair (6.5 tiles of its ☠) or hit it / its pack, lair props moved 10–12.5
      tiles out, the Pack Lord and its pack hold the lair, goal sites near lairs picked last; the haul / escort reward
      stands once the drone has it; speed-only dangers get no path line / ⚠; the glasshouse cistern is used up only when
      it heals; salvage 3 picks clean / 2 otherwise, no Relay patch at full health; renames (Pulse Totem, Beacon Coil,
      Tunnel Sight, intel drive, trapped mechanic), Heavy Spine line from data, Efficient Assembly toast. Economy: every
      goal +20 Scrap, the skill point only from the goal (bonus tasks pay loot + Research), dawn health ≥ 75,
      build-aware relic offers (`relicDead`), one med-kit shop (the Workbench's leaves with Field Dressing), the wave-cut
      line on the preview. Night: 720p side panel (one-row Protocols, leak feed folded in lulls, no docked hints after
      prep at 16:9, body min height: 4 cards + Call next push at 1280×720 / 1366×768 / 1080p), the lull shows the next
      push, call-early 1 Scrap/s, Vine Snare +25% damage taken, Arc Discharge 20 Scrap / 25 × healthMult, Flare 15 Scrap,
      Colossus slam 8, Relay zap range ring, readiness "strong" only ≤ −2 + the weakest path's top leaker, two-tone
      Relay digits + a closed "9" glyph; HEALTH_MULT N4 7.4 → 6.8 (DESIGN §5 table)

### Stage 8: Legibility and foraging (2026-10-14)
- [x] Foraging and stump fix (critic N, `critique/critic_N.md`): the sawn-stump pop-in on cut brush is gone (leaf
      litter only) and the random-scatter stumps are fallen logs now (same main-stream draws: every seed keeps its
      containers, sites, lairs and pylons). New, from their own `forage` stream (`FORAGE` in `src/data/jungle.js`, live
      in `src/entities/Forage.js`): **wild fruit** (~6 bushes per area, ×1.5 in the Greenhouse, beside trails: hold E
      0.8 s for +15 health, kept at full health, back every morning), **shelf fungus** on 26 old stumps at trail edges
      (logs dropped as hosts: the card floated over foliage; none near spore pods; a machete hit → Biofiber × the area's multiplier, the host stays solid, plant
      stamina; regrows by morning), **glints in the brush** (gold sparkles in ~0.3% of thickets / 1.2% of brambles, new
      each day; any cutter spills 2–7 Scrap × finds × distance, via `world.onCut`). Decoys toned down: fern mushroom
      clumps 8% → 3%, district cog / bolt / berry decals halved. Art: `prop_fruit_bush(_bare)`, `prop_stump_fungus` /
      `prop_stump_bare`, `prop_fungus_log_overlay`. Debug: `debug.forage()`, `debug.gotoForage(kind, n)`
- [x] Foraging round 2 (critic N2, `critique/critic_N2.md`): fungus stumps keep 10 tiles from boss lairs (a harvest
      woke the Brood Hive); no fruit / fungus / bloom under a tree canopy (`FORAGE.canopy`); whole-number fruit heals
      and prompt ("+1 health" at 99 HP), an info line with no hold at full health; glints pay 3–5 / 6–9 Scrap (min 3),
      none in the dark map-edge band, an 18-px gold star + white twinkle, `sfx glint_twinkle` on screen, `coins` on
      reveal, and a Feral cutting one far away no longer spends your first-glint line; the map remembers fruit, fungus
      and blooms you have seen (`run.world.forage`, grey once used today). New: **dusk blooms** (3 per jungle in far
      site clearings, own `forage`/`bloom` stream; open and glow with 70 s of daylight left; hold E 1 s → +1 Intel and
      +5 Research). Art: `prop_dusk_bloom_closed` / `_open` / `_spent`, `fol_log` repainted without fungus
- [x] Legibility pass (critic M, `critique/critic_M.md`): the HUD's text grid game-wide (design size N ≥ 12, never
      below 16 px: body 24 px at 1080p, 16 px at 720p, no 8-px text left; sub-heads N 19); the night side panel 200 →
      236 units (`DEFENSE_VIEW.view.x1` 714) with the hint dock, tags and tower names wrapping instead of clipping,
      bars as tall as their labels; `vr-glyphs.ttf` grows 4-wide digits, `% / +` and 42 pixel UI symbols and punctuation (no Consolas
      / Segoe fallbacks); damage numbers pop in font-grid steps (`JUICE.text.popSteps`) at whole-pixel positions; the
      stage centred on whole device pixels (a 945-px window had it on a half pixel); one-font-pixel ink outline
      (`--ol`) on text over the world; Silkscreen headlines at regular weight; contrast fixes (bar labels, hotkey chips
      on green, disabled 0.7, locked research, the danger box, zero chips); the summary hint lives in its step and
      sits beside the cards; night prep's zap line on night 1 only, readiness in two short lines; map place names
      above their markers; balanced wrapping. A "Large text" setting was tried (×1.5) and left out: the night panel,
      summary and briefing cards overflow at 1280×720 and 1920×945
- [x] Legibility round 2 (critic M2, `critique/critic_M2.md`; shots `.playwright-mcp/legib2/`): night prep lists each
      path as icon chips (icon + ×N, name / role / NEW in the tooltip, NEW an amber corner dot) **before** a one-line
      danger, the coach hint docks under the paths, no subtitle, the night-1 zap line in the body, trades on one row,
      "Your defense" hidden while picking / placing a tower, build cards' line in the tooltip, a visible "▾ more" cue
      (every enemy type on both paths visible at 1920×945 / 1280×720 / 1024×600, nights 1, 4, 6); workbench cards'
      prose in the tooltip (no scroller at 1024); headings a step above body (N 19: card names, `.scr h3`, path heads,
      boss name, results values, research branch / node names); research nodes name-on-top (no mid-word breaks),
      branch lines wrap; summary Intel / Research as "You got" chips (no cut line); "Details ▾" / footer labels
      nowrap; HUD label column auto; the GOAL strip shows the step + count. **Whole pixels:** every layout
      `calc(var(--u) * N)` in `src/ui/*.css` is `round(…, 1px)` (913 values), equal grids use `round(down)` tracks,
      centred banners / tags / the GOAL strip are pinned (`pinWhole`), centred panels nudged (`snapBox`), centred
      one-line labels snapped (`snapLine`): fractional-x text runs at 1920×945 briefing 66/69 → 0, night prep 70/71 →
      0, summary 71/73 → 6, results 38/38 → 4, title 14/15 → 0, explore 25/26 → 1, workbench 87/93 → 0. Big-map names
      placed greedily (above / below / right / left, never on another name or any marker kind, drawn over markers).
      `vr-glyphs.ttf` +34 symbols (the skill / unlock / recipe / tower icons, § ½, 🔒 via a format-12 cmap): CDP finds
      only Tiny5 / Silkscreen / VR Glyphs on the skill picker and the Codex; `npm run check:glyphs`
      (`tools/check_glyphs.py`) fails on any UI-string character neither font draws. `--ol` on the boss bar, the
      briefing head / footer and the other 1-px panel shadows. **Large text still left out** (prototyped as a one-step
      `--ts` on every font size at 1920×945): the summary card (335 / 175 px) and its bars' labels clip, the workbench
      (624 / 547) and Collection research (766 / 678) scroll, briefing card rows overprint, the night panel's second
      path drops below the fold and the trade row overflows. Needs: a two-column summary, workbench tabs, one research
      branch per tab, label-above-value briefing rows, a wider night panel at Large
- [x] QA 8 fixes (`critique/qa_stage8.md`): the night body scroller ends on a whole block / line above a full-width
      "▾ more" bar (`_fitBody`), Intel + trades moved from the pinned footer into the body under paths / danger /
      rewards / zap line, path chips mid-wave too, the danger one line in waves and lulls, a selected tower's Upgrade
      / Sell pinned in the footer (its hint docks at the end of the details), Disrupt "→ −10% enemies" wraps inside its
      button, creature icons never below 1× (a 1× portrait crop when much bigger than the slot), the big-map legend
      rebuilt on open (dusk bloom the same day), one-colour Relay bar label with `--ol`, no "best run" on debug defeats,
      no break in "right-click"

### Next (deferred from the round-2 critics — start here)
Economy and pacing
- [ ] A median-player economy: real players banked ~17–40 Scrap a day in critic runs vs the sim's 85; re-tune the
      sim's "typical" profile against real-input runs, then the curve (critic J2 §11 A1–A2)
- [ ] An act break at night 3: a Brood Mother mini-boss → relic pick of 3 + a skill point (J2 A3)
- [ ] Re-centre difficulty on the night: a competent run is decided before dusk by skills/research/area (K2 #4:
      health +6% per night skill, threatScale 0.85 from N4)
Night
- [ ] Forward pads worth a tower (beacon lamp or longer sightlines) (K2 #6); the Relay zap trimmed 13 → 10 with "Relay
      coil" ranks as a Scrap sink (K2 #7)
- [ ] Off-view arrows with counts when zoomed so ×2 at 720p is playable (K2 #11); a second board shape (3 lanes, or
      the Relay not on the right) (J2 A6)
- [ ] Build the three hidden research towers (Sap Cannon, Lure Totem, Bramble Wall) — art + mechanics — or hide tier 3
Content and coherence
- [ ] Six build-defining rare relics; build-aware shrine offers (J2 A7)
- [ ] Late-run / Long Night days: respawning shrines and lairs (J2 A8); crew from escorted engineers (J2 A9)
- [ ] Cut/merge for simplicity (J2 §11 B): Workbench as a night-prep tab, one wave-size cut per night, cut the survivor
      bonus task (the escort goal covers it), Tune-up salvage option
Art
- [ ] Bosses: more animation (per-move silhouettes), the Pack Lord as its own larger sprite (it is the Feral Chief ×2)
- [ ] Workbench/Codex/briefing postcards of each district's hero ruin (critic H2 §5); the Flooded platform hero ruin
      reads as a broken wall
- [ ] Listen pass on the synthesized audio by ear (levels were set by measurement only)
- [ ] Dusk bloom (critic N rank 4: a rare plant that opens at sunset for +1 Intel): closed / open-with-glowing-core sprite

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
