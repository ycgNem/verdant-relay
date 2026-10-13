# Verdant Relay — Core API reference

How the engine pieces fit together. `DESIGN.md` says what the game is; `PLAN.md` the build order.

## Boot and scenes

- `src/main.js` loads sprites, creates `Game`, registers scenes: `title settings collection briefing explore summary defense results`.
- A scene is a class: `constructor(game)`, `enter(params)`, `update(dt)`, `exit()`.
  - 3D scenes set `this.three = new THREE.Scene()` and `this.camera`; the shell renders them every frame.
  - UI goes into `game.ui` (DOM overlay). It is cleared on every `game.go()`. Elements that should take mouse clicks need class `ui-block` (or be `button`s).
  - `exit()` must dispose geometries/materials/textures it created, remove window listeners and clear timers.
- `game.go(name, params)` switches scene. `dt` is clamped to 1/20 s.
- **Debug URLs** (for testing): `?debug=explore&district=flooded_transit&night=2` (the jungle; `vr.game.scene.debug` has teleport, god, reveal, timeLeft, extract…), `?debug=defense&night=4&scrap=400&circuits=10&biofiber=10`,
  `?debug=summary`, `?debug=briefing`, `?debug=results&victory=1`. Optional `&skills=a,b&points=2`. `window.vr.game` is the Game.

## Game (`src/core/Game.js`)

| Member | Purpose |
|---|---|
| `game.run` | current `Run` or null |
| `game.meta` / `game.saveMeta()` | permanent progress (`src/core/Save.js` schema) |
| `game.input` | `isDown(code)`, `wasPressed(code)`, `mouseHeld(b)`, `mouseClicked(b)`, `mouse.{x,y,ndcX,ndcY}` (codes are `KeyboardEvent.code`: `KeyW`, `Space`, `Tab`, `Escape`…) |
| `game.sfx.play(name)` | synthesized blips (`src/core/Sfx.js`: shoot cutter hit hurt pickup open dodge build sell zap boom core done alarm error) |
| `game.assets` | sprite/visual factory (below) |
| `game.setResMult(m)` | render at base×m (resets on scene switch) |
| `game.setInternalRes(w, h)` | render at a fixed internal size until the next scene switch (night: `DEFENSE_VIEW.res` = 1280×720) |
| `game.fit()` | size the stage: always a whole-number CSS scale (device px). Default: adaptive internal size nearest the base res (1280×720 chunky → 426×240 ×3, 1920×1080 → 480×270 ×4); `meta.settings.integerScale` = exact base res, bigger borders. A fixed `setInternalRes` is integer-scaled when that fills ≥ `CONFIG.ui.minIntegerFill`, else stretched |
| `game.width/height` | current internal resolution — changes with the window, so size per frame (PostFx) or rely on `_applyRes` re-sizing the scene's PixelCamera |
| `game.shake(amp, time)` | screen shake (respects the settings toggle) |
| `game.flash(color, opacity)` | full-screen flash |
| `game.mouseOnPlane(camera, y)` | mouse ray ∩ horizontal plane → Vector3 |
| `game.project(vec3, camera)` | world → stage CSS px `{x, y, visible}` |
| `game.time` | real seconds since boot |

## Visuals (`src/core/Assets.js`)

`game.assets.makeVisual(key, {shadow, scale})` → a `THREE.Group`. If `public/sprites/manifest.json` lists the key it is a
camera-facing billboard sprite (feet at y=0) or a flat ground decal (`flat: true`); otherwise the primitive placeholder from
`src/data/visuals.js`. Keys like `scrap_turret_3` fall back to `scrap_turret`.

Module functions (import from `../core/Assets.js`):
- `updateVisual(root, dt)` — call every frame for every visual (animation frames, flash decay).
- `setAnim(root, 'idle'|'walk'|'attack'|'windup'|'hurt'|'death'|…)` — missing names fall back to `idle`. `animDone(root)`, `hasAnim`, `animLength`, `animHitFrac`, `setAnimSpeed`.
- `setFacing(root, dx, dz, snap?)` — directional sheets pick one of 8 directions (west side mirrored), strip sprites flip left/right; placeholder models rotate.
- `flashVisual(root, color, time)` — hit flash. `setBaseColor(root, '#88aaff')` — persistent tint (slowed); `'#ffffff'` clears.
- `setOpacity(root, a)` — e.g. burrowed enemies. `setStatus(root, color)` — status light on placeholder props.
- `game.assets.disposeVisual(root)`; `game.assets.setTint(color)` — ambient tint for all sprites (night: bluish).
- Occlusion silhouettes: sprites of `player` and of anything made with `{ring}` get a child sprite drawn with depthFunc GREATER —
  a solid 1-texel outline + dithered fill in a flat colour wherever foliage/trees/ruins/props cover them (`ATMOS.silhouette`).
  `opts.silhouette` sets/overrides the colour (`false`/null = none); `setSilhouette(root, color|null)`; enemies switch dim → bright
  when the scene sets `root.userData.alert` (JungleScene does, from `enemy.alerted`).
- `game.assets.spentVariant(key, 'dark'|'open'|'gutted')` → a derived sprite key (glow off / hollowed top / dimmed);
  `openedVariant(type, closedKey)` picks per `OPENED_LOOK`. `game.assets.pylonGlow` → the activated-pylon light pool (`PYLON_GLOW`, `src/core/PixelGlow.js`).
- `root.userData.vis.height` — visual height in world units (for HP bars / labels).
- `game.assets.spriteInfo(key)` → `{tex, def}` for tiles; `game.assets.iconStyle(key, px)` → CSS string for DOM icons.

## The jungle (day) — `src/world/`

- `JungleGen.generateWorld(seed, districtKeys)` → plain data: `size` (192), `level` (vertex terrain levels, `LEVEL`),
  `pave`, `brush` (per tile, `BRUSH`), `region`, `trail`, `site`, `objects` (trees/ruins/rocks), `sites` (`lost`: no trail,
  ringed by thick brush), `containers` (`yield`: Scrap multiplier by distance from the Relay / nearest pylon), `spores`,
  `pylons`, `center`. `worldForRun(game, run, keys)` caches it per run seed; `compass(dx, dz)`; `clearDisc(world, x, z, r)`.
- `SporePods(scene, world.spores)` (`src/entities/`): the spore-pod hazard — `update(dt)`, `hittables(out)`, `dispose()`.
- `JungleWorld(game, scene3d, data, cutMask)`: chunk streaming (`update(dt, focusX, focusZ)`, `warm(x, z)`), queries
  (`brushAt solidAt opaqueAt blockedAt(x, z, throughBrush) levelAt speedAt shadeAt lineOfSight`), movement
  `moveBody(p, dx, dz, r, {throughBrush, onBrush})`, `blockedCircle`, `addCollider(obj)`, the machete
  `hitBrush(tx, tz, power)` (→ type cut, −1 nicked, 0 nothing), `setPlayer(px, py, z)` for the see-through window,
  `shadeTex` (canopy density for PostFx). `JungleWorld.regrow(data, cut, seed)` between days.
  Exports `makeCardMaterial`, `chunkCards(world, atlas, cut, x0, z0, w, h)`, `cardMesh(cards, atlas, mat)` (the night map reuses them).
- `TerrainBaker(world, assets, terrainArt).bake(cx, cz)` → a 512 × 512 canvas for chunk (cx, cz). `world.blendAmp` tightens edges.
  Ruin paving is broken up in world space (missing slabs, moss, stains, cracks, rubble — `PAVING`).
- `FloraAtlas(assets)`: one atlas of every static world sprite, grouped in `FAMILIES` (regex on manifest keys); `pick(fam, a, b)`.
  Brush families are colour-graded in the atlas (`BRUSH_LOOK`): low pale ferns, dark tall thickets, red-brown brambles.
- The card shader's see-through window (`ATMOS.xray*`) is a round 8×8-Bayer fade around the player (no hard rim).
- `DefenseGround.makePlinth(seed, wood)` → a texel-drawn stone / timber build-pad plinth (flat Lambert mesh, `userData.zOffset`).
- `Ambience(scene3d, world).update(dt, cx, cz, dusk)`: pollen, falling leaves, fireflies, light shafts.
- `DefenseGround.buildDefenseGround(game, seed, laneTiles, tint)` → `{ group, update(dt), dispose() }`.
- Persistent state: `run.world` (`run.worldState(size, cell)` decodes it, `run.storeWorld(state)` stores it; bitsets in base64).

## Screen-space lighting (`src/core/PostFx.js`)

A scene that sets `this.post = new PostFx(game)` is rendered into a target and composited by one pass: canopy shade
(`uniforms.tShade` = `JungleWorld.shadeTex`) with drifting dapples, darkness beyond `uLightR` around `uPlayer`,
`uDark` (0 day → 1 night), `uAmbient`, `uTint`, grade, stepped vignette, `uHurt` pulse, `uLeaves` (foreground leaf
frame). All steps are Bayer-dithered so light stays pixel art. Menus get it through `MenuBackdrop.post`.

## Effects (`src/core/Fx.js`)

`new Fx(game, scene3d, camera)`: `burst(pos, {color, color2, count, speed, up, life, size, gravity})`, `ring(pos, {color, radius, life})`,
`line(a, b, {color, life, jag})`, `telegraph(pos, {radius | dir,length,width, color, time})` (returns `{cancel()}`),
`text(pos, str, {color, cls:'big'|'crit', life, key, value, html})` (pops in, stacks, merges per `key`), `update(dt)`, `dispose()`.
Juice (tuning in `JUICE`, `src/data/config.js`): `flash`, `muzzle`, `spark`, `light` (pooled point lights), `bolt` (2-px pixel
lightning), `decal` (dissolving splat), `corpse(visualRoot)` (death beat; Fx disposes the visual), `telegraph({style:'dashed'})`
for friendly markers, `hitStop(t)` / `slowMo(time, scale)` with `dt *= fx.step(realDt)` in the scene update.
`makeVisual(key, {ring})` adds the hostile ground ring; `resIcon(key)` / `resIconHtml(key)` (ui.js) draw pick_* sprite icons.

## UI helpers (`src/ui/ui.js`)

`el('div.cls', attrs, ...children)`, `button(label, onClick, {disabled, reason, cls:'primary'|'danger'|'big', hotkey})`, `panel(cls, ...children)`,
`resChip(key, amount)`, `resRow(res)`, `costLine(cost, haveRes)` (marks shortfalls red), `bar(cls, color)` → `{node, set(frac, text)}`,
`toast(game.ui, text, 'good'|'bad'|'amber')` (game-time: `setToastsPaused(game.ui, true)` freezes them while paused), `modal(game.ui, title, body, buttons)`, `fmtTime(s)`.
CSS sizes: `calc(var(--u) * N)` = N px on a 960-wide stage (scales with the window). Shared classes in `src/ui/style.css`.

## Run (`src/core/Run.js`) — the single source of truth

Fields: `seed night phase relayHp relayMax playerHp meds weapon res{scrap,circuits,biofiber,intel} towers[] skills[] skillPoints district tonight lastExpedition stats`.

- Districts: `districtChoices()`, `objectiveFor(district)`, `chooseDistrict(key)` (sets `tonight.threat`, extra groups, speed).
- Resources: `canAfford(cost)`, `missing(cost)` → "Need 12 more Scrap", `spend(cost)`, `add(gain)`.
- Skills: `hasSkill(id)`, `skillOptions(meta, salt)`, `takeSkill(id)`.
- Towers: `availableTowers(meta)`, `buildCost(type)` (includes the +5 Scrap per same-type tower, `buildSurcharge(type)`), `towerCount(type)`, `build(type, padIndex)`, `upgradeCost(t)` (null = max, `{}` = free), `upgrade(t)`,
  `sellValue(t)`, `sell(t)`, `towerStats(t, relayFrac)` → merged stats with upgrades/skills/boons applied.
- Relay: `repairAmount()`, `repairCost()` (prorated), `repair()`, `beginPrep()` (one-time per-night bonuses; returns notes), `emergencyPatch()`.
- Intel (night prep): `decryptCost()`, `decrypt(game)` → Research; `sabotageCost()`, `sabotageBlocked()`, `sabotage()` → wave −10% once per night.
- Wave size: `waveCountMult()` = `tonight.enemyCount` floored at `CONFIG.waveSizeFloor` (0.8); `waveCutCapped()`.
- Expedition: `applyExpedition(result, game)` with
  `{ district, extracted, died, carried:{…}, objectiveDone, boon, optionals:[{key,name,flag?,research?}], events:[{key,flag?}], skillPointsEarned, medsLeft, playerHp, kills }`.
  Banks loot only if extracted, awards research, applies boons into `tonight`, stores `lastExpedition`.
- Night end: `nightSurvived(game)` → `'next' | 'victory'`; `finish(game, victory)` → results record (clears the run save).
- Research: `award(game, amount, reason)`, `awardBossDamage(game, fraction)`.
- `rng(...parts)` — seeded stream for this night. `save('briefing'|'prep'|'wave')` snapshots for Continue ('wave' = restart that wave with the locked build).
  `Save.patchRun(fn)` edits the saved snapshot in place (boss research given mid-wave). `Save.validRun(r)` is the full shape check.
- `tonight`: `{ threat, boons[], freeUpgrades, freeRepair, towerRate, towerDamage, enemyCount, enemySpeed, laneSlow, extraGroups[] }`.

## Conventions

- All tuning in `src/data/`. 1 unit = 1 tile, Y up, world X = tile x, world Z = tile y.
- Camera: `new PixelCamera({ dist, near, far })` from `src/core/PixelView.js` — orthographic, pitched `CONFIG.pixel.pitch` (55°),
  1 tile = 32 internal px on the ground. `cam.setSize(w, h)` (Game does it on resolution changes), `cam.setFocus(x, z)` (snapped to 1/32),
  `cam.placeAt(x, z, px, py)` (world point → internal pixel), `cam.toPixel(v)`. The shell calls `snapForRender`/`restoreSnap` around each
  draw to put sprites (`isSprite`) and flat decals (`userData.pxSnap`) on whole pixels; `userData.noSnap` opts out.
  Sprites are upright cards: a sprite `h` tiles tall on screen is `h × CARD_SCALE` (tan 55° ≈ 1.43) world units tall, which is what
  `vis.height` reports; a world height `y` shows as `y / CARD_SCALE` tiles on screen. Sprite scales must be whole numbers (makeVisual rounds).
  Day renders at the adaptive base res (~426–512 px wide, 13–16 tiles across); night renders at 1280×720 with the field at 32 px/tile
  (whole-number scale at 720p/1440p/2160p; at 1080p it is stretched ×1.5 — a pixel-exact night zoom would need a panning camera).
- Lighting: hemisphere + directional, Lambert materials. Day warm; night blue with a cyan point light at the core.

## Tutorial hints (`src/ui/hints.js`)

`showHint(game, id, html, {pos, time})` shows a one-time hint (stored in `meta.hints`, skipped when `meta.settings.hints` is off).
Use it for first-run guidance in each mode (controls, extraction, building, wave preview…).

## Per-mode CSS

Each mode keeps its own stylesheet next to its scene (`src/ui/explore.css`, `src/ui/defense.css`, `src/ui/screens.css`) imported by that scene,
so `style.css` stays the shared kit.
