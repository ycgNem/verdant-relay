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
  `?debug=summary`, `?debug=briefing`, `?debug=results&victory=1`. Optional `&skills=a,b&points=2` (old skill ids map),
  `&mods=focusing_lens,uplink` (tower mods on the Workbench bench), `&blade=serrated_edge,heavy_spine` (machete upgrades). `window.vr.game` is the Game.
  Stage 7 days: `&objective=<PRIMARY key>` and `&event=<EVENTS key>` (today's goal / event in the jungle),
  `&weather=rain|fog|heat|none` (every day's weather, `run.weatherKey`), `&bosses=canopy_greenhouse,…` (area bosses already
  killed). The jungle's `debug` also has `goals()`, `bosses()` (lairs: area, x, z, hp, phase, engaged, dead), `boss(area?)`
  (stand 6 tiles from a lair), `event()`, `weather()`; `killAll()` spares area bosses.
  Run modes: `&mode=long|daily` (Long Night / Daily; a long run accepts `&night=` up to 99, e.g. `?debug=defense&night=6&mode=long`
  then win → night 7) and `&og=N` (Overgrowth level). The defense scene's `vr.game.scene.debug` has `win()`, `lose()`, `spawn(type, lane)`,
  `state()`, `callNext()`, `cast(protocol, x, z)`; `&variant=0|1|2` forces tonight's wave variant (A/B/C).
  Night board: `&map=twin|crossing|ford` (else picked from the seed), `&beacons=N` (pylons p0…p(N−1) count as switched on → forward pads).
  Relics: `&relics=whetstone,pylon_coil` (already brought home), with `debug=summary` `&found=a,b` (carried home on the
  debug trip). In the jungle `vr.game.scene.relicsCtl.debug` has `carry(id)`, `drop({ rarity })`, `goto('cache'|'shrine'|'lore', n)`, `info()`.

## Game (`src/core/Game.js`)

| Member | Purpose |
|---|---|
| `game.run` | current `Run` or null |
| `game.meta` / `game.saveMeta()` | permanent progress (`src/core/Save.js` schema) |
| `game.input` | `isDown(code)`, `wasPressed(code)`, `mouseHeld(b)`, `mouseClicked(b)`, `mouse.{x,y,ndcX,ndcY}` (codes are `KeyboardEvent.code`: `KeyW`, `Space`, `Tab`, `Escape`…). **Key bindings** (`src/data/controls.js`, Settings → Controls): `useBindings(() => meta.settings.keys)` (the jungle turns it on, `null` off) makes a physical key bound to an action read as that action's *default* code, so gameplay code keeps checking `'KeyW'`, `'Space'`, `'KeyE'`…; an unbound default key reads as nothing. `rawIsDown` / `rawWasPressed` = physical keys; `keyFor(action)` = the bound code. Module exports `keyLabel(code)` ("Space", "L-Shift", the layout's character via the Keyboard API) and `resolveKeys(stored)` |
| `game.sfx.play(name, opts)` / `playAt(name, x, z)` | synthesized one-shots (`src/core/Sfx.js`, sounds in `src/data/audio.js`); see **Audio** below |
| `game.assets` | sprite/visual factory (below) |
| `game.setResMult(m)` | render at the view size ×m (resets on scene switch) |
| `game.setInternalRes(w, h)` | render at a fixed internal size until the next scene switch (night: `NightCamera` sets floor(window / k), even, per zoom k) |
| `game.fit()` | size the stage: always a whole-number CSS scale (device px). Fixed field of view `CONFIG.ui.view` = 640×360 (20 × 11.25 tiles): ×2 at 1280×720, ×3 at 1920×1080, ×4 at 2560×1440; other windows take the scale filling the most of the window with each side inside `CONFIG.ui.viewBand` (1366×768 → 682×384 ×2, 1920×950 → 640×316 ×3, 1600×900 → 704×396 ×2 letterboxed; small windows `viewBand.small`: 1024×600 → 512×300 ×2). No resolution setting. A fixed `setInternalRes` is integer-scaled when that fills ≥ `CONFIG.ui.minIntegerFill`, else stretched |
| `game.u` | CSS px per UI unit (`--u`) = min(stage width / 960, height / 540) — the stage aspect varies a little, so use this, not `clientWidth / 960` |
| `game.width/height` | current internal resolution — changes with the window, so size per frame (PostFx) or rely on `_applyRes` re-sizing the scene's PixelCamera |
| `game.shake(amp, time)` | screen shake (respects the settings toggle) |
| `game.flash(color, opacity)` | full-screen flash |
| `game.mouseOnPlane(camera, y)` | mouse ray ∩ horizontal plane → Vector3 |
| `game.project(vec3, camera)` | world → stage CSS px `{x, y, visible}` |
| `game.time` | real seconds since boot |

## Audio (`src/core/Sfx.js`, `AmbientAudio.js`, `AudioDirector.js`, `Music.js`, `synth.js`)

Everything is synthesized on WebAudio at runtime (no sample files); tuning in `src/data/audio.js` (`MIX`, `SOUNDS`,
`AMBIENCE`, `AUDIO_DIRECTOR`) and `src/data/music.js`. One AudioContext (`game.sfx.ctx`), created on the first click/key.

- Mix: `bus.sfx` / `bus.ui` / `bus.music` (→ `musicDuck`) / `bus.ambience` → `master` (Master slider, mute) → glue
  compressor → limiter → speakers. `game.sfx.applySettings()` re-reads `meta.settings` (`master`, `volume` = sound effects,
  `music`, `ambience`, `muted`); `toggleMute()` is also on **F2** anywhere (M is the jungle map).
- `game.sfx.play(name, { vol, pan, rate, delay, more })` → a voice when it plays, `true` if the sound exists but was
  skipped (no audio yet, muted, throttled, voice cap), `null` for an unknown name — so `play(newName) || play(oldName)`
  falls back only on unknown names. Every play varies pitch/level a little (`pitch`, `vary`); `gap`, `max` per sound
  and `MIX.voices` overall keep fights from piling up (a `pri: 2` cue steals the oldest ordinary voice, and may go
  `MIX.priExtra` over only when every voice is a cue); `send` = reverb, `duck` = dip the music (stings).
- `game.sfx.playAt(name, x, z, opts)`: world sounds — pans by the point's screen x (the scene's camera) and, when the
  scene has a `player`, fades and dulls with distance from it (`MIX.positional`; a sound's own `near` keeps tells such
  as wind-ups full-volume further out). Use it for anything that happens
  somewhere in the world (creatures, towers, impacts); plain `play` for the player's own actions and UI.
- A sound is a list of synth layers (`synth.js`: osc / filtered white-pink-brown noise / 2-op FM, sweeps, vibrato,
  tremolo, chords via `notes`, repeats via `n`/`every`). Add a sound by adding an entry to `SOUNDS`; `windup_<enemy>`
  falls back to the generic `windup`. Every gameplay call names its own sound (area bosses: `boss_wake_<kind>`,
  their moves, `boss_phase2`, `boss_death_<kind>` → `boss_die`; goals; relics; Protocols `cast_<key>` + effect; night
  verbs) — check with `node .playwright-mcp/audio/check_names2.mjs`. UI sounds (`ui_*`, `open`, `error`, `tally`) use the `ui` bus; menu buttons
  get `ui_hover` automatically, `KeyNav` plays `ui_move` / `ui_back`, `sbtn` plays `ui_confirm`.
- `game.sfx.ambient` (`AmbientAudio`): beds — wind/leaf wash, day insects, dusk cicada swells, near-water babble,
  rain (`setRain(0..1)`, from `src/world/Weather.js`) — and creature calls (birds, a distant howler, cricket and
  frog "agents"). `setProfile(weights, level)` blends `AMBIENCE.profiles` (day, dusk, night, defense, menu);
  `setWeather(key)` applies `AMBIENCE.weather` (fog: a low-pass hush + quieter bed, heat: cicadas by day, rain: fewer birds).
- `game.sfx.director` (`AudioDirector`, ticked by `game.sfx.update(dt)` from the Game loop) reads the active scene, so
  gameplay code needs no audio hooks for: the ambience profile (jungle clock, paused / map duck, night prep vs wave,
  menus), the water level (scan around the player), footsteps by surface (on the walk anim's contact frames,
  alternating L/R: water, mud, dirt / trail, paving = stone, leaf litter, moss, + fern), the low-HP heartbeat, the
  stamina-out huff, the E-hold rising tick (+ a rising hum on beacons / the way home), the heavy-chop wind-up, the
  Relay-critical alarm (< 30%, throttled), `music.setCombat()` (an alerted creature within 8 tiles; off after 4 s;
  never over `lair` / `boss`, which have their own drums), today's weather, and three loops that follow live things:
  the thrown machete's whirr, the uplink's boot chatter (faster as it boots) and burning Flares' hiss (night).
- `game.music.play(mood)`: title, day, dusk (jungle after sunset), lair (jungle area bosses), night, boss (Colossus
  only), results, defeat;
  `setCombat(on)` crossfades a tension layer (toms, ostinato, shaker) over the current mood.
- Testing: `.playwright-mcp/audio/test_audio.cjs` renders every sound offline (peak < 1, not silent) and checks the
  live graph in title / jungle / defense; `test_phase2.cjs` fights every area boss, the creatures, the uplink and the
  Protocols and stress-tests the voice cap.

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
  when the scene sets `root.userData.alert` (JungleScene does, from `enemy.alerted`). `opts.silhouetteSkipsMask` (jungle
  creatures) stencil-tests against `CARD_MASK_REF`, so a creature's silhouette never prints over the player's body; the
  player's own silhouette is outline-only (`ATMOS.silhouette.playerFill` 0) — critic I #3.
- Sprite outline + card mask: `makeVisual(key, {outline: color})` (default for `player`; night towers use their type colour)
  draws a flat 1-texel outline around the sprite in-shader, and a hidden child writes stencil `CARD_MASK_REF` over the body +
  outline before the cards draw — the foliage/trunk/ruin card shader skips those pixels, so cards never cover that sprite
  (the x-ray dither only lands around it). `setOutline(root, color)`; the jungle switches the player's outline
  `ATMOS.playerOutline.open` ↔ `.cover` via `JungleWorld.coveredAt(x, z)` (samples the player's body box against the opaque
  atlas texels of the upright cards in front, with hysteresis). Renderer + PostFx target have stencil buffers for this.
- `game.assets.spentVariant(key, 'dark'|'open'|'gutted')` → a derived sprite key (glow off / hollowed top / dimmed); the
  hollow interior follows the sprite's top-face polygon from `OPENED_TOP` (jungle.js) when listed;
  `openedVariant(type, closedKey)` picks per `OPENED_LOOK`. (`game.assets.pylonGlow` is legacy; the jungle builds the
  activated-pylon look from `src/core/PixelGlow.js`: `lightPool(o)` — a flat stepped glow written as light for PostFx —
  and `beaconBeam(o)`, a stepped pulsing beam above the canopy, both tuned by `PYLON_GLOW`.)
- Emissives (`src/core/Emissive.js`): `makeVisual` adds a child sprite `'emissive'` to every sprite key listed in
  `EMISSIVE.keys` (hue bands, jungle.js) that re-draws only the texels in those bands with the PostFx emit code, so
  eyes, screens and crystals keep full brightness at night; `makeVisual(key, {emissive: false})` opts out.
- Palette swaps (`src/core/PaletteSwap.js`): `paletteSwap(assets)` runs once after load and remaps the hue bands of each
  `PALETTE_SWAP` key (feral cloak → bone/rust) by brightness rank onto a ramp, replacing the texture. DOM icons
  (`iconStyle`) still use the original PNG. It first makes the **derived sprites** in `DERIVED_SPRITES`
  (`src/data/bosses.js`): a new manifest key copied from `from` (all its 8-way anims) with the same kind of band remap —
  `npc_engineer` (the player, orange coat) and `feral_chief` (the Feral, deep red / gold).
- `root.userData.vis.height` — visual height in world units (for HP bars / labels).
- `game.assets.spriteInfo(key)` → `{tex, def}` for tiles; `game.assets.iconSpec(key, px)` → `{ css, w, h }` for a DOM icon
  (`iconStyle(key, px)` = its CSS). `iconFrame(k)`: the sheet part shown — creatures (`DEFENSE_ENEMIES` / `EXPLORE_ENEMIES`
  keys) use their side view (a directional sheet's 'e' idle row) cropped to the opaque bounding box; `iconScale` keeps
  creatures at ≥ 1× (½ only past twice the slot) and `screensKit.iconEl` grows its box to fit (critic H §2).

## The jungle (day) — `src/world/`

- **Solid jungle** (`src/world/Solid.js`, tables `SOLID` + `GROUND` in jungle.js): every collider is a rounded box
  `{x0, z0, x1, z1, rr}` (inner box grown by `rr`; a circle is a zero-size box) — `footprint(o, artKey)`, `boxDist`,
  `inFootprint(c, x, z, pad)`, `pushOut(p, r, c)`. Runtime picks the footprint by the sprite actually drawn
  (`SOLID.art[key]`, via `objectEntry(o, atlas)` in JungleWorld, shared with `chunkCards`); generation uses the per-type
  maximum (`SOLID.kind`). `addCollider({kind:'prop', type:'container'|'objective'|'nest'|'pylon'|'relay', x, z})` for scene
  props, or `{x, z, r}` for a plain circle. Deep water (`data.deep`) is a solid tile for everyone (`wetAt` for brush-slippers);
  `objGrid` (tile centre within `SOLID.tilePad` of a footprint) + deep feed `blockedAt` and so the flow fields.
  Debug: `vr.game.scene.debug.colliders(true)` outlines footprints (yellow), deep water (blue ×) and fords (cyan +);
  `debug.reach()` returns the generator's reachability report.
- `JungleGen.generateWorld(seed, districtKeys, { guided })` → plain data (`guided`: the guided run's world also gets
  `guided = { site, route }` — the guided goal site and the walk there — and up to 4 trail-side containers `{ guided: true,
  yield: 1 }` with ids `g0…`, `GUIDE.routeCrates`; `worldForRun` passes `run.guided` and keys its cache on it): `size` (192), `level` (vertex terrain levels, `LEVEL`),
  `pave`, `brush` (per tile, `BRUSH`), `region`, `trail`, `site`, `objects` (trees/ruins/rocks), `sites` (`lost`: no trail,
  ringed by thick brush), `containers` (`yield`: Scrap multiplier by distance from the Relay / nearest pylon), `spores`,
  `pylons`, `center`, `deep` / `ford` (per tile), `reach` (`ensureReachable(world)`: flood from the Relay over
  `blockGrid(world)`, repairs with fords / object removal; `floodTiles` is exported for tests). `worldForRun(game, run, keys)` caches it per run seed; `compass(dx, dz)`; `clearDisc(world, x, z, r)`.
  Relics & lore (`siteFeatures`, own seed streams `names` / `features` / `lore`): `site.name` (majors, landmarks;
  `src/data/lore.js`), `site.kind` (landmarks: statue / mast / greenhouse), `relicCaches` `[{id 'rc…', site, x, z}]`
  (lost majors), `shrines` `[{id 'sh…', site, kind, x, z}]` (landmarks), `loreSpots` `[{id 'lg…', site, x, z}]`; each
  spot is kept walkable and in `ensureReachable`'s targets.
- `JungleRelics(scene)` (`src/scenes/JungleRelics.js`, `scene.relicsCtl`): strongboxes, shrines (the pick-of-two modal),
  data-log spots, relics on the ground, the carried relics (`carried`, HUD strip in `hud.tl`), place banners. Hooks the
  scene calls: `onContainerOpened(it)` (hidden caches), `meleeMult()` / `landed()` / `cutPower`, `onKill(e)`,
  `relicSave(player)`, `relicPerfectDodge()`, `huntDelay`, `light(U)`, `markers()`, `labels()` (big-map names),
  `pauseLine()`, `lostLines()`, `update(dt)`, `dispose()`. Scene wrappers for entities: `scene.relicMod(field)`,
  `scene.dropRelic(x, z, { rarity })` (area bosses: `{ rarity: 'R' }`), `scene.relicSave(p)` (Player._die),
  `scene.relicPerfectDodge()`. What was used is in `run.world.relics` (`rc…` opened, `sh…` taken, `sh…+` the landmark
  extra), `lore` (log spots read) and `visited` (places announced).
- `src/ui/relics.js`: `relicIcon(game, id, size, {silhouette})` (the `relic_<id>` plaque art, else a pendant),
  `relicCard(game, id, {size, line})`, `relicTag(game, id, {lost})`, `relicTitle`, `rarityTag`, `relicKey(assets, id)`
  (the world's pendant texture, `relic__pendant_<C|R|X>`). Styles in `src/ui/relics.css`.
- `JungleMap.drawBig(canvas, view, markers, time, labels)`: `labels` `[{x, z, text}]` drawn in Tiny5 (whole-pixel
  scale); markers `relic` (gold star), `cache` (gold dot), `lore` (cyan dot).
- `SporePods(scene, world.spores)` (`src/entities/`): the spore-pod hazard — `update(dt)`, `hittables(out)` (a hit with
  src `'chop'` launches the pod instead of popping it), `cloudAt(x, z)` (a cloud with no pod: Bloaters, spore nests,
  the Thorn Mother), `dispose()`. Clouds also hurt / choke creatures (`enemy.chokeT`),
  and creatures with `podTrigger` set pods off.
- `JungleWorld(game, scene3d, data, cutMask)`: chunk streaming (`update(dt, focusX, focusZ)`, `warm(x, z)`), queries
  (`brushAt solidAt deepAt wetAt opaqueAt blockedAt(x, z, throughBrush) levelAt speedAt(x, z, brushFree) inFern shadeAt
  lineOfSight`), movement
  `moveBody(p, dx, dz, r, {throughBrush, onBrush, solid, hit, nudge})` (`solid(tx, tz)` replaces the tile test; `hit` gets
  `{obj}` / `{tx, tz}` of what stopped the body — wall splats; `nudge` = `CONFIG.player.nudge`, the player's corner
  nudge round trunks and brush corners), `blockedCircle`, `addCollider(obj)`, the machete
  `hitBrush(tx, tz, power)` (→ type cut, −1 nicked, 0 nothing), `setPlayer(px, py, z, x, vis)` for the see-through window
  (and the player's outline; `vis.userData.outlineOverride` forces a colour, e.g. the perfect-dodge rim),
  `shadeTex` (RG canopy density for PostFx: R full for upright cards, G with walkable trail / clearing tiles spared,
  `ATMOS.trailShade`), `gradeTex` (per-district colour grade, `REGION_LOOK[key].grade`, blurred across borders).
  `JungleWorld.regrow(data, cut, seed)` between days.
- `Wading(scene)` (`src/world/Wading.js`, `update(dt)` / `dispose()`): characters on wadeable water are clipped at a
  waterline (`WATER.line` texels, per-material clipping planes), lose their blob shadow, get a looping `fx_ripple`
  and an `fx_splash` on entry.
- `src/world/SporeLook.js`: the spore pod's look — `podVisual(assets)` (`spore_pod`, idle), `swellPod(vis)`, and
  `SporeCloud.make(scene, x, z)` → 6–8 instanced `spore_puff_*` sprites (`SPORE_LOOK`; null without the art, then
  SporePods falls back to its dithered disc). Gameplay stays in SporePods.
- Combat (critic I): `scene.meleeHit(x, z, angle, spec, power)` returns how many creatures / nests / pods it struck
  (`spec.noCut` skips undergrowth, `spec.shove` draws no blade arc). `Player`: `tryDeflect(attacker, kind, ax, az)`
  (enemy contact / shots / lob landings call it first; true = deflected), `bleed(t)`, `root(t)`, the thrown `blade`.
  `ExploreEnemy`: `hidden` (a Thorn Stalker under the brush: not hittable, no separation), `deflected(kind)`,
  `stun(t)`, `stepBack(x, z, dist)` (the death beat), `chokeT`, the move in progress `mv`. `scene.shots`
  (`ExploreShots`): `throwBlade({x, z, dir, spec, onCatch})` / `recallBlade(b)`, `sapAt(x, z, pad)` (sap puddles),
  enemy shots / lobs carry `owner` (deflects bat globs back). Leading: lunges and the Feral spear aim ahead of the
  player by `def.lead` / `spear.lead` × the time from the lock to impact (velocity capped at walking speed), and a
  melee wind-up also starts when the player *will be* in reach after it (`CONFIG.expedition.attackers.predict`).
  Exports `makeCardMaterial`, `chunkCards(world, atlas, cut, x0, z0, w, h)`, `cardMesh(cards, atlas, mat)` (the night map reuses them).
- `TerrainBaker(world, assets, terrainArt).bake(cx, cz)` → a 512 × 512 canvas for chunk (cx, cz). `world.blendAmp` tightens edges.
  Jungle dirt / paving are baked lighter (`TERRAIN_VALUE`). Decals come from deterministic per-chunk candidates
  (`_decalCands`, districts favour `REGION_LOOK[key].decals`); a decal yields to a same-key candidate of higher priority
  within `DECALS.spacing` tiles across chunk borders. Bright texels of emissive decals (`EMISSIVE.decals`, glow fungus)
  get canvas alpha `EMISSIVE.groundAlpha`; the ground material turns that into the PostFx emit code.
  Ruin paving is broken up in world space (missing slabs, moss, stains, cracks, rubble — `PAVING`).
- `FloraAtlas(assets)`: one atlas of every static world sprite, grouped in `FAMILIES` (regex on manifest keys); `pick(fam, a, b)`.
  Brush families are colour-graded in the atlas (`BRUSH_LOOK`): low pale ferns, dark tall thickets, red-brown brambles.
- The card shader's see-through window (`ATMOS.xray*`) is a round 8×8-Bayer fade around the player (no hard rim).
- Night-board ground, plinths and lane tint: see "The night board" below.
- Ruin paving with PixelLab art is sampled per slab (`PAVING.slab`): staggered rows, random flip/rotation, the star motif on only some slabs.
- Creatures keep apart from the player and each other (`CROWD`, `ExploreEnemy._separate`, skipped mid-attack); waiting
  ones hold flank / back slots (`ExploreEnemy._circle`, `attackers.flank` / `backArc`).
- `Ambience(scene3d, world).update(dt, cx, cz, dusk)`: pollen, falling leaves, fireflies (emissive, drawn over the
  foliage), light shafts.
- Persistent state: `run.world` (`run.worldState(size, cell)` decodes it, `run.storeWorld(state)` stores it; bitsets in base64).
- **Stage 7 days** (critic J M4 / M5 / N2): JungleScene creates, in order, `scene.weather = new Weather(scene)` (before
  the spore pods: `weather.pods(list)` adds Heat's), `scene.bosses = new AreaBosses(scene)`, `scene.goals = new
  Goals(scene)`, then `_setupObjective` → `_setupOptionals` → `_setupEvents` → `bosses.build()`; after `_buildHud`,
  `weather.apply()` + `weather.hud(hud)`. Per frame: `tickSpeedBuffs`, enemies, `goals.update` (before interaction),
  `bosses.update`, `weather.update`. `hittables()` adds `bosses.hittables` / `goals.hittables`; `_markers()` adds
  `bosses.markers` (type `boss`, a ☠ in `MAP_MARKERS`) and seen events; `_finish` adds `objectiveFailed`,
  `bossesKilled`, `weather` to the result. `JungleGen.generateWorld` sets `world.lairs[regionIdx]` (`bossLair(world,
  ri)`: lost major → furthest lost → major → furthest site; a post-pass, no RNG), and `_sitesIn` never hands out a lair.
  - `Goals(scene)` (`src/scenes/JungleGoals.js`; data `PRIMARY` / `GOALS` in objectives.js): step types `escort`
    (`phase` find / lead), `defend` (start / hold), `track` (+ the closing `kill`), `carry` (pickup / deliver), `purge`.
    `claims(step)` → `_setupObjective` hands it `setupStep(step, si, used)`; `update(dt)`, `hittables(out)` (nests),
    `onEnemyKilled(e)` (the Alpha's relic), `note()` (HTML after the GOAL strip's step), `carrying` (scene.blockFire;
    it sets `scene.moveMult` / `scene.noRoll`, which Player reads; Player calls `scene.onNoRoll()`), `failed` (sets
    `scene.objectiveFailed`), `dispose()`. Objective targets may have getter `x` / `z` (home from the engineer / the
    core) and an `onSpawn(e)` hook (`_updateObjectiveSpawns` calls it; the Alpha).
  - **Wards**: an enemy with `e.ward` (the engineer, the uplink: `{pos, vel, kb, aim, r, dead, dodging, hurt()}`) runs
    its whole AI with `scene.player` swapped for the ward (`_updateEnemies`), so it chases, telegraphs and hits that.
  - Events: `_setupEvents()` / `_completeEvent(it, def)`; interactable kind `'event'` (`DAY.interactRank.event`),
    `scene.events`, results in `eventsDone` (`{key, name, flag?}`). Announce at `EVENT_RULES.announce` (`_updateDiscovery`).
  - `AreaBosses(scene)` (`src/entities/AreaBoss.js`; data `BOSS` / `BOSSES` in bosses.js): `lairs[]` `{area, ri, site,
    def, boss, dead}` for `run.bossAlive(area)`, `lairSites()`, `inLair(x, z, pad)` (no wildlife there), `build()`,
    `update(dt)` (engage within `BOSS.aggro`, leash, HUD bar `.j-bossbar` in `hud.root`), `hittables(out)`,
    `markers(out)`, `focus()` (`_placeCamera` leans toward it, `BOSS.camPull`), `onEnemyKilled(e)` (`e.lordOf`),
    `onKilled(L)` (Run.clearBoss, `_grantSkillPoint({boss: true})`, `scene.dropRelic(x, z, {rarity: 'R'})`), `killed[]`.
    `StationaryBoss` (sprite strip idle 0–3 / attack 4–5 / hurt 6 / dead 7, collider, `hurt(dmg, dx, dz, src)`,
    `damageTaken()`, phase 2 + `onPhase2`, `ready(name, every)`, `later(t, fn)`, `ringAt`, `hitCircle`, `hitLane`,
    `lob`, `spawnMinion`) → `ThornMother`, `BroodHive`, `Warden`, `DrownedEngine`; `PackLordEnemy` (a `FeralChief` in
    `scene.enemies`) + `PackLordCtl`.
  - `src/entities/DayCreatures.js`: `makeEnemy(scene, key, x, z, opts)` (`scene.spawnEnemy` uses it: `bloater` →
    `Bloater`, `feral_chief` → `FeralChief`, else `ExploreEnemy`), `setSpeedBuff(e, kind, mult, until)` /
    `tickSpeedBuffs(enemies, now)` (`e.speedMult`, read by ExploreEnemy; clock = `scene.dayT`). `_chunkPop` adds
    Bloaters (`DAY_CREATURES.bloater`) and makes a camp's first Feral its Chief (`DAY_CREATURES.chief.fromNight`).
  - `Weather(scene)` (`src/world/Weather.js`; data `WEATHER` / `RAIN_LOOK` in weather.js): sets `scene.detectMult`
    (ExploreEnemy sight), `noiseMult` (cut-noise radius), `noRustle` (Player / ExploreEnemy), `staminaRegenMult`
    (Player); `pods(list)`, `apply()` (PostFx uniforms, `post.lightMult`, `ambience.shaftMult`,
    `sfx.ambient.setRain`), `hud(hud)` (`.j-weather` tag in `hud.tr`), `update(dt)` (ripples), `dispose()`.

## The night board — `src/data/defenseMap.js`, `src/world/DefenseGround.js`, `src/world/NightCamera.js`

- **Maps:** `DEFENSE_MAPS` = `{ twin, crossing, ford }` (`MAP_KEYS`); each has `width/height` (23×15 field), `lanes`
  (`{ name, short, bearing, points, forward }`: waypoint polyline from off-field left to the plaza; `bearing` = the compass
  direction the lane faces in the jungle; `forward` = up to 2 forward-pad slots), `pads` (fractional tile coords),
  `woodPads`, `core`, `coreRadius`, `plaza`, `lamps`, `stream` (ford), `trees/rubble/bushes`, `margin`, `hpMult` (enemy
  health × this on the map: `DefenseScene.hpMult` = night curve × run mods × map, so the layouts play alike). `DEFENSE_MAP` = twin
  (legacy alias). Helpers: `mapFor(runOrKey)` (unknown → twin), `pickMapKey(seed)` (Run.create → `run.mapKey`),
  `forwardSlots(map)` → `[{ lane, at, rank }]`, `padCount(map)` (pads + slots: Save validates `tower.pad < padCount`),
  `laneForAngle(map, angle)` (jungle angle → the lane whose bearing is closest).
- **Scene hooks** (`DefenseScene`): `this.map`, `laneForDistrict(key)` (the lane facing that area: region angle from
  `worldForRun` → `laneForAngle`; stored as `this.dangerLane`, read by `_waveOpts()` → `buildWave({ dangerLane })`),
  `_padSpots()` (map pads, then the forward slots opened by `run.world.pylons` on the lane facing each beacon; a slot with a
  tower stays; pad index = `map.pads.length + slot`), `_laneTiles(lane?)`. Waves pick a lane with `lane % lanes.length`.
  Leaks: `_noteLeak(src, dmg, count, lane)` feeds `nightStats`, the in-wave feed (`_leaks`, `DEFENSE_VIEW.leakRows`) and
  `run.lastNight = { night, leaks: { type: { count, damage } } }` (Run.finish → Results "What got through");
  `leakSummaryText(night)` is the banner line.
- **NightCamera(scene, fit, bounds):** integer zoom k (`ks` = the allowed steps, `kDefault`), internal res = floor(window / k)
  rounded to even through `game.setInternalRes`; the board viewport is `DEFENSE_VIEW.view` (UI units, panel on the right).
  Default k = the largest that fits `fit` (the field), or 2 when only 1 fits, the day scale is ≥ 3 and 2 shows ≥
  `zoom.prefer` of the field. Wheel (90 ms throttle, ignores `.ui-block`) and `+`/`−` step k keeping the point under the
  cursor; right/middle drag pans after `zoom.dragThreshold` px (a still right click is replayed to the scene's input);
  arrows pan, Home frames; clamped to `bounds`. `dayScale(vw, vh)` = the day's integer scale for a window.
- **DefenseGround:** `buildDefenseGround(game, map, { seed, laneTiles, pads, tint })` → `{ group, world, stats: { cards,
  dropped }, update, dispose }`: a stand-in jungle world (vertex levels from lane distance, the ford's stream → water/mud,
  4-pass ≤1-level relaxation, stepping-stone fords), TerrainBaker chunks into one 2048² canvas, `wearLanes` (lighter trodden
  centre band that flattens the dirt's mottling, two broken wobbly ruts, puddle/pebble decals — `DEFENSE_VIEW.wear`), a
  dithered darker margin, plaza hazard stripes; cards from `chunkCards` **minus any whose opaque texels cover a lane, a pad
  or the Relay** (`keepZones` + `coversKeep`, per-texel against the sprite's alpha). `GROUND` = `{ size, x0, z0 }`.
  `makePlinth(seed, wood, grow)` → texel-drawn plinth (`userData.topW/topH` for markers). `laneTint(tiles, color, alpha)`
  → a multiply-blended wet band along a lane (laneSlow reward).
- **Look:** `DEFENSE_VIEW.post` runs the jungle's PostFx at full dark (moon tint × ambient, navy lift, vignette; no canopy, no
  player light): enemy eyes and the Relay crystal (Emissive.js) and `lightPool`s (`DEFENSE_VIEW.glow`: lamps, Relay,
  forward pads; `emit` = how far lit pixels escape the moonlight) stay bright. `post.on: false` = the older lit-scene look.
  Units and the Relay don't write depth (painter's order), so occlusion silhouettes never fire on the board; flat
  things therefore sort by renderOrder: ground lights / wet band −3, plinths −2, shadows, rings, pad markers, range and
  chevrons −1, sprites 0. Units get the light code `post.unitLift` (`_lightCode(mat, share)`: alpha = 1 − share).
- **Tower muzzles:** `JUICE.towerMuzzle[type]` = `{ color, 1, 2, 3, '3a', '3b' }` → `[x, y]` (x on a 32-wide scale,
  y texels above the sprite bottom); `Tower.muzzle()` picks the level / branch (missing branch → level 3).
  Protocol buttons show `PROTOCOL_ICONS[id]` sprites (src/data/protocols.js), the glyph as fallback.

## Night rules — `src/scenes/DefenseScene.js`, `DefenseProtocols.js`, `DefenseForecast.js` (Stage 7 night mechanics)

- **Data:** `src/data/waves.js` — `HEALTH_MULT` / `healthMult(night)` (×`DEFENSE.longNight.hpGrowth` a night past 6),
  `WAVE_VARIANTS[night − 1] = [A, B, C]` (`{ key, name, groups }`, group `{ push, at, lane, type, count, gap, hpMult? }`),
  `WAVES` (variant A, back-compat), `variantCount(night)`, `variantFor(run)` (`run.waveVariant` override, else
  `run.rng('wave')`), `waveFor(night, variant)` → `{ key, name, pushes, groups }` (the Long Night generator past night 6),
  `DEFENSE` (lull, callEarly, startGuard, exchange, longNight, extra-group push/time window, speeds, banners…), `SALVAGE`.
  `src/data/protocols.js` — `PROTOCOLS`, `PROTOCOL_ORDER`, `PROTOCOL_ICONS`, `perNight(arr, night)`.
  `src/data/towers.js` — level 3 = `upgrades[1].branches.{a,b}` (`name, line, detail, cost, set`), `BRANCH_KEYS`,
  `branchOf(rec)` ('a' for old saves), `BIG_SIZE`. `READINESS` (src/data/guide.js) tunes the forecast.
- **`buildWave(run, { lanes, dangerLane })`** (exported; BriefingScene uses it for its preview) → `{ variant, name,
  groups, events, pushes, pushEvents[], total, perLane[], duration }`. Events `{ push, t, lane, type, hpMult? }` are
  sorted by push then time; the district threat's extra groups go in push `DEFENSE.extraPush` on `dangerLane`, lanes are
  taken `% lanes`, the wave-size cut (`run.waveCountMult()`) removes from the largest groups.
- **Phases:** `prep` → `wave` (push k spawning / fighting) ⇄ `lull` (between pushes) → `won` | `lost`. `canBuild` = prep or
  lull. `startWave(fromPush = 0)` (saves `'wave'` with `run.wavePush = 0`; `fromPush > 0` = Continue into the lull before
  that push), `_startPush(k)`, `_enterLull(save)` (saves `'wave'` with `run.wavePush = k + 1`), `callNextPush()` (+Scrap
  for the skipped lull, `_callBonus()`), `_pushSpawned()`. `_step(dt, fixed)` runs spawning, the lull countdown (real
  time), protocols, towers (only while a push runs) and the end-of-push / end-of-night checks. Space: `_tryStartWave(how)`
  ('button' | 'space' | 'shift'; a weak readiness arms "Start anyway" for `DEFENSE.startGuard.confirm` s and only the
  button / Shift+Space starts), no Space-pause for `startGuard.pauseGrace` s after `_startPush` (`spaceGuardT`).
- **Damage and kills:** `damage(e, amount, opts)` (opts `{ type, source, pierce, blast }`; Flare ×`flareMult(pos)`, blast
  tags `e.blastT` so a Seed Carrier killed within 3 s of a blast doesn't burst), `_kill(e)` (bounties, seed rule,
  `nightStats.bossKilled` / `run.stats.bossKilled`). Leaks: `enemyReachedCore(e)` → `_noteLeak(src, dmg)`.
  `nightStats = { leaks, leakHp, protocols, bossKilled, bossSpent, callEarly }` (the sim and Results read it).
- **Boss:** `DefenseEnemy` clamps the Colossus at `lane.total − siege.stopAt`, then state `'siege'`: a ring telegraph on
  the Relay and `scene.bossSlam(e, dmg)` every `siege.every` s; after `maxSlams` `scene.bossSpent(e)` (it collapses; the
  night is held, `finalResult.bossKilled = false` → Results "The Relay held the Colossus off"). `bossCue(kind)` prints the
  phase toasts. `e.protocolRoot(t)` (Vine Snare: roots non-bosses, holds the boss `bossRoot` s and returns 'cancel' when it
  stopped a charge wind-up), `e.applyStun(t)` (Lance), `e.interruptCharge()`. `canBeTargetedBy('bullet')` is true for a
  burrowed enemy inside a Flare (`scene.litAt(pos)`).
- **Towers:** `Tower` reads `scene.towerStats` (`_computeTowerStats`: run.towerStats + beacon buffs incl. Spotter's
  `buffDamage` / `buffRange`); Piercer `pierce` / `bigBonus`, Lance `stun`, Cluster `bomblets`, Napalm burn zones
  (`Projectiles.zone(…, { source })` credits damage), Snare `rootTime` / `bigRoot`, Thorn Field `damage`.
  Sprite `${type}_3${branch}` when loaded, else `${type}_3`.
- **`ProtocolDeck(scene)`** (`scene.protocols`): `keys` (= `run.protocolsFor(meta)`; debug runs get all), `def(k)`
  (`run.protocolDef` for relic changes), `maxCharges(k)`, `live()` (wave or lull), `blocked(k)` (reason or null),
  `aim(k)`, `cancelAim()`, `cast(k, { x, z })` (pays, telegraph, resolves after `telegraph` s), `litAt(pos)`,
  `flareMult(pos)`, `update(dt)`, `frame()` (aim ring, button cooldown sweep via `--cd`), `handleInput()` (Q/W/E, LMB
  cast, RMB/Esc cancel; returns true when it used the input), `panel()` (the `.df-protobar` buttons), `dispose()`.
- **`forecastNight(scene)`** → `{ level: 'weak'|'risky'|'strong', lost, lo, hi, lanes: [{ name, short, lost, dots }],
  ratio }` — a 1-D replay of tonight's wave per lane (samples `READINESS.sample` tiles, step `READINESS.step` s) against
  `scene.towers` (their stats, `rec.target` rule, path coverage), slows, spitters, burrowers, seed bursts, boss roots /
  siege and the run's protocols; `lost × lossScale`. `scene._readiness()` caches it per build / resources key.
- **Run additions:** `upgradeCost(t, branch)`, `upgradeBranches(t)` (the branch table at level 2, else null),
  `upgrade(t, branch)` (sets `t.branch`), `towerStats` merges the branch's `set` and `t.rangeMod`; `exchangeLeft()` /
  `exchange(kind)` (`DEFENSE.exchange`, prep only from night 2); `protocolsFor(meta)`; `salvageOptions(lost, night)`
  (seeded, `SALVAGE.tiers`) / `applySalvage(key, bestPad)`; fields `wavePush` (0–8), `salvage` (`{ freeUpgrades }` for
  the next prep), `tonight.exchanged`. Save validates `tower.branch` ('a'|'b'), `tower.rangeMod` (1–1.5), `wavePush`,
  `salvage` (backward compatible, no version bump).
- **Debug** (`vr.game.scene.debug`): `state()` (phase, push, lull, wave, protocols…), `callNext()`, `cast(k, x, z)`,
  `win()`, `lose()`, `spawn(type, lane)`; `&variant=0|1|2` forces a wave variant.
- **Balance sim** (`.playwright-mcp/nightmech/`, not shipped): `sim_page.js` injects `window.__sim` into a
  `?debug=defense` page — `campaign(profile, seed, { map, tweak })` plays a whole run through the real scene (renderer
  and the scene's own frame update off; `_step(1/30, true)`), `night(cfg)` one debug night with a fixed build,
  `tweak({...})` overrides data in the game's own module instances. `campaign.mjs N profiles workers tag` runs workers
  and prints the per-night table; `tallwide.mjs`, `onelane.mjs`, `calib.mjs` (forecast vs outcome), `ui.mjs` (real-input
  UI pass with screenshots).

## Screen-space lighting (`src/core/PostFx.js`)

A scene that sets `this.post = new PostFx(game)` is rendered into a half-float target and composited by one pass.
`post.setWorld(jungleWorld)` binds the canopy shade (`shadeTex`) and the district grade (`gradeTex`);
`post.timeOfDay(dayFrac, dusk)` drives golden hour, moonlit night, the lamp pool around `uPlayer` and darkness
(`ATMOS.cycle`). The pass also does drifting dapples, `uHurt` pulse, a hard-stepped undithered vignette and the
foreground leaf frame (`fg_leaf_1..5`, `ATMOS.leafFrame`, whole sprites with lagging parallax; procedural fallback).
**Light codes in the target's alpha** (`LIGHT_CODE`): ≥ 1.5 = upright card (full canopy shade), 1 = normal,
< 1 = emissive share (1 − a ignores darkness, shade and vignette). Opaque materials write 1; `emitBlending(mat)` marks a
material as emissive, `lightBlending(mat)` adds light. Dithers are Bayer and world-anchored (they move with the ground).
The default framebuffer ignores alpha, so scenes without PostFx are unaffected. Menus get it through `MenuBackdrop.post`.
Weather (Weather.js sets them; neutral by default): `uWTint` (RGB multiplier), `uFog` / `uFogCol` / `uFogR` (a veil
from `uFogR.x` to `.y` × the light radius, 5 Bayer steps, value-noise lumps, dimmer with `uDark`), `uRain` / `uRainK` /
`uRainP` / `uRainCol` (1-px streaks on world-pixel lanes, per-lane hashed periods); `post.lightMult` scales the light
radius in `timeOfDay`.

## Effects (`src/core/Fx.js`)

`new Fx(game, scene3d, camera)`: `burst(pos, {color, color2, count, speed, up, life, size, gravity})`, `ring(pos, {color, radius, life})`,
`line(a, b, {color, life, jag})`, `telegraph(pos, {radius | dir,length,width, color, time})` (returns `{cancel()}`),
`text(pos, str, {color, cls:'big'|'crit', life, key, value, html})` (pops in, stacks, merges per `key`), `update(dt)`, `dispose()`.
Juice (tuning in `JUICE`, `src/data/config.js`): `flash`, `muzzle`, `spark`, `light` (pooled point lights), `bolt` (2-px pixel
lightning), `decal` (dissolving splat), `corpse(visualRoot)` (death beat; Fx disposes the visual), `telegraph({style:'dashed'})`
for friendly markers, `hitStop(t)` / `slowMo(time, scale)` with `dt *= fx.step(realDt)` in the scene update.
`makeVisual(key, {ring})` adds the hostile ground ring; `resIcon(key)` / `resIconHtml(key)` (ui.js) draw pick_* sprite icons.
`hitFlash(root)`: `JUICE.hitFlash.white` frames of white, then `tint` frames of red-orange, on the hit sprite only.
Death splats (`decal` without `life`) are desaturated toward `JUICE.death.splatGround` and fade out in steps over
`decalFade` s. `chargeLane` draws a dust-dither capsule with rounded ends and moving chevrons.

## UI helpers (`src/ui/ui.js`)

`el('div.cls', attrs, ...children)`, `button(label, onClick, {disabled, reason, cls:'primary'|'danger'|'big', hotkey})`, `panel(cls, ...children)`,
`modal(ui, title, body, buttons, { cancel, keys, extraKeys, guard })` (keyboard built in: primary focused, Enter / Space / E
press it, arrows / W S / Tab move, Esc presses `cancel` — default the button with an "Esc" hotkey, else the safe one next
to a danger button, else a lone button; a capture listener keeps these keys from the game; `keys: false` when the caller
has its own KeyNav, like `screensKit.ask`; `guard` s of ignored keys after it opens),
`resChip(key, amount)`, `resRow(res)`, `costLine(cost, haveRes)` (marks shortfalls red), `bar(cls, color)` → `{node, set(frac, text)}`,
`toast(game.ui, text, 'good'|'bad'|'amber')` (game-time: `setToastsPaused(game.ui, true)` freezes them while paused), `fmtTime(s)`.
CSS sizes: `calc(var(--u) * N)` = N px on a 960×540 stage (scales with the window; JS: `game.u`). Shared classes in `src/ui/style.css`.

## Run (`src/core/Run.js`) — the single source of truth

Fields: `seed night phase relayHp relayMax playerHp meds weapon res{scrap,circuits,biofiber,intel} towers[] skills[] skillPoints items blade crafted relics[] district tonight lastExpedition stats`.

- Modes (Stage 7, `src/data/modes.js`): `Run.create(meta, { mode: 'normal'|'long'|'daily', overgrowth, date })`. Fields
  `mode overgrowth mods[] dailyDate kit offers[] goals[] areaCount sellRefund`. `isLongNight()`, `isDaily()`,
  `mod(field)` (product of the run's modifiers' field, 1 if none), `modSum(field)`, `hasMod(field)`, `researchMult(meta)`
  (Overgrowth / Daily / Archivist), `modeLabel()`, `isBossNight(night)` (6, and every 3rd night past 6 in the Long Night),
  `nightHpMult(night)` = `healthMult(night) × mod('hpMult')` (DefenseScene / buildWave read it). Exported helpers:
  `localDate()`, `dailySeed(date)`, `dailyMods(date)`, `dailyRecord(meta, date)`.
- Districts: `districtChoices()` (weighted against past offers / visits, `AREA_OFFERS`; `areaCount` cards),
  `canRerollAreas(meta)` / `rerollAreas(meta)` (Second Look), `objectiveFor(district)` (avoids recent goals; fixed once
  chosen; only goals whose `minNight` ≤ tonight), `chooseDistrict(key)` (logs the offer and goal, sets `objective`,
  `tonight.threat` / `threat2` (Restless Jungle, `secondThreat()`), extra groups, speed), `lootMults()` (today's
  container multipliers: the chosen area × Picked Over × Fog's `lootScrap`).
- Area bosses / weather (Stage 7): field `bosses[]` (areas whose boss is dead; Save.validRun checks it, default []),
  `bossCleared(area)`, `bossAlive(area, night)` (from `BOSS.fromNight`), `clearBoss(area)` (records it; if it is
  today's area, tonight's danger is lifted at once), `threatFor(area)` returns `clearedThreat(area, name)` (`cleared:
  true`, no extra group / speed) once its boss is dead. Field `weatherKey` (debug override, default null),
  `weatherFor(night)` (null before `WEATHER.fromNight` and on the guided day; seeded `subSeed(seed, night, 'weather')`),
  `weather(night)` → `{key, …def}` or null. `applyExpedition` awards `BOSS.reward.research` per `result.bossesKilled`.
  Boon fields `bankRes` (resources banked with the boon, only if you got home) and `enemySpeed` (× tonight).
- Resources: `canAfford(cost)`, `missing(cost)` → "Need 12 more Scrap", `spend(cost)`, `add(gain)`.
- Skills (Stage 7 rework, `src/data/skills.js`): `hasSkill(id)` (old ids read through `SKILL_RENAMED` / `skillId`, so
  `hasSkill('pack_rat_1')` sees Pack Rat), `setSkills(list)` (maps old ids, refunds a point per removed / duplicate one;
  `fromSave` and `&skills=` use it), `branchCount(branch)`, `skillOffered(k, meta)` (req, needsUnlock, keystone needs
  `SKILL_OFFERS.keystoneNeeds` of its branch), `skillCardCount(meta)`, `skillOptions(meta, salt)` (each card from an owned
  branch with chance `SKILL_OFFERS.ownedShare`, fresh branches first, keystones × `keystoneWeight`),
  `canRerollSkills(meta)` / `rerollSkills(meta)` (Fresh Ideas), `takeSkill(id)` (a skill's `relayMax` arrives repaired),
  `skillMult(field)` (product over owned skills), `bountyMult()` (Salvage King; DefenseScene._kill).
  Skill points: JungleScene `_grantSkillPoint(opts)` gives at most `CONFIG.expedition.maxSkillPoints` (1) a trip from the
  goal / bonus tasks; **`_grantSkillPoint({ boss: true })` (an area boss kill) always adds one on top**.
- Towers: `availableTowers(meta)`, `buildCost(type)` (includes `CONFIG.towerSurcharge` Scrap per same-type tower, `buildSurcharge(type)`), `towerCount(type)`, `build(type, padIndex)`, `upgradeCost(t, branch)` (null = max, `{}` = free), `upgradeBranches(t)`, `upgrade(t, branch)` (level 3 needs a branch; see Night rules),
  `sellValue(t)`, `sell(t)` (a fitted mod goes back to the bench), `towerStats(t, relayFrac)` → merged stats with
  upgrades / boons, then every owned skill's and the fitted mod's `tower` block through the exported
  `applyTowerMod(s, type, block, acc, relayFrac)` (filters `kinds` / `types` / `when.relayBelow`; `range` / `rate` /
  `damage` multipliers; `mult` / `add` / `min` per field; flags `slowedBonus` → DefenseScene.damage, `seesBurrowed` →
  Tower.pickTarget / bullet `canHit` via `canBeTargetedBy('any')`).
- Crafting (`src/data/crafting.js`; fields `items {mod: n}`, `blade [recipe]`, `crafted {recipe: n}`, tower `mod`):
  `craftBlocked(key)` (plain reason or null), `craft(key)`, `itemCount(mod)`, `addItem(mod, n)`, `modsOwned()`,
  `modFits(rec, mod)`, `fitMod(rec, mod)` (free; swaps the old one back), `unfitMod(rec)`, `bladeMods()` (skills' and
  machete upgrades' `blade` blocks stacked by `BLADE_STACK`), `prepScrapComing()` (stipend + Prepared Defenses not yet
  paid), `cheapestTowerScrap(meta)`. `relayMax` adds skills' and crafted recipes' `relayMax`.
- UI (`src/ui/workbench.js`): `workbenchView(game, {onCraft})` → `{node, refresh, craftIndex(i)}` (SummaryScene's
  `step = 'bench'`), `showBench(run)`, `modRow(scene, tower)` (DefenseScene `_renderTower`), `codexKit(game)` (Codex).
- Machete kit (`src/entities/BladeKit.js`): Player sets `this.kit = run.bladeMods()` and
  `this.weapon = kitWeapon(WEAPONS[k], kit, bleeds)` once per trip (combo / hack-through time × `comboTime`, chop damage ×
  `chopDamage`, `chop.cutRange` = Cleaver, throw `returnTime` / `returnDamage`, `onHit` on every melee spec);
  `Bleeds(scene, dps, time)` ticks Serrated Edge (`update(dt)` from Player.update). Hooks read `player.kit`:
  deflect window, riposte ×, fern-free speed / roll, plant-swing stamina, Duelist (`_perfectDodge`, riposte heal),
  `player.heal(n)`, `player.onKill(e)` (JungleScene.onEnemyKilled → Second Wind). JungleScene.meleeHit calls
  `spec.onHit?.(target)` per thing struck and cuts brush out to `spec.cutRange || spec.range`.
- Relay: `repairAmount()`, `repairCost()` (prorated), `repair()`, `beginPrep()` (one-time per-night bonuses; returns notes), `emergencyPatch()`.
- Intel (night prep): `decryptCost()`, `decrypt(game)` → Research; `sabotageCost()`, `sabotageBlocked()`, `sabotage()` → wave −10% once per night.
- Wave size: `waveCountMult()` = `tonight.enemyCount` floored at `CONFIG.waveSizeFloor` (0.8); `waveCutCapped()`.
- Expedition: `applyExpedition(result, game)` with
  `{ district, extracted, died, carried:{…}, objectiveDone, objectiveFailed, boon, optionals:[{key,name,flag?,research?}], events:[{key,name,flag?}], bossesKilled:[area], weather, skillPointsEarned, medsLeft, playerHp, kills, relics:[id] }`.
  Banks loot only if extracted (else the salvage, clamped to what was carried), awards research, applies the goal's boon
  into `tonight` only if extracted (else `summary.rewardLost`), sets `summary.dawnHp`, stores `lastExpedition`.
  Death rules: `salvageFor(carried, dayT)` (`min(carried, max(floor, share × carried))` for Scrap; nothing with No Drone),
  `dawnHp(hp)` (`max(hp + nightlyHeal, dawnHpFloor)`, Hard Dawn lowers the floor), `abandonTrip(game)` (Continue from
  an `explore` snapshot settles the trip as abandoned).
- Relics (`src/data/relics.js`; field `relics[]` = brought home): **`relicMod(field)` is the one place effects are read**
  (combined by `FX_MODE`; Player / SporePods go through `scene.relicMod`). `hasRelic(id)`, `maxMeds()` (CONFIG + Medic's
  Satchel; Player, briefing shop, crafting), `bankRelics(result, game, summary)` (from applyExpedition: home → pushed
  into `relics`, night effects applied at once, `summary.relicsFound`; else `summary.relicsLost`),
  `applyRelicsTonight(ids)` / `relicExtraGroups(ids)` (Hungry Idol's group, Storm Totem's `tonight.enemySpeed`; from
  `chooseDistrict` and on banking), `relicHitMult(tower, enemyType, pushIdx)` (DefenseScene.damage: Rusted Bell, Cracked
  Lens' first hit per push), `protocolDef(key)` (DefenseProtocols: cooldown / radius), `relicNightLines()` (night prep),
  `seeRelics(game, ids)` / `readLore(game, id)` (the Codex: `meta.relicsSeen` / `meta.lore`, skipped for debug runs
  unless `&save=1`). Also read in `lootMults`, `relayMax`, `buildCost` / `upgradeCost`, `towerStats`, `beginPrep`,
  `salvageFor`.
- Night end: `nightSurvived(game)` → `'next' | 'victory'` (a Long Night never returns `'victory'`: night 6 calls
  `recordVictory(game)` and the run goes on); `recordVictory(game)` (once per run: victories, best, scarf, Overgrowth best,
  victory Research); `finish(game, victory)` → results record `{ victory, won, mode, overgrowth, mods, dailyDate, ogBefore,
  longBefore, dailyBefore, nights, night, kills, districts, peak, research, leaks, debug }` (clears the run save; `leaks`
  is the night board's `run.lastNight.leaks` tally `{ type: { count, damage } }`, which Results turns into "What got through").
- Research: `award(game, amount, reason)`, `awardBossDamage(game, fraction)`.
- `rng(...parts)` — seeded stream for this night. `save('briefing'|'explore'|'summary'|'prep'|'wave')` snapshots for Continue
  ('explore' = settled as an abandoned trip, 'summary' = back to the summary, 'wave' = restart that wave with the locked build).
  `Save.patchRun(fn)` edits the saved snapshot in place (boss research given mid-wave). `Save.validRun(r)` is the full shape check.
- `tonight`: `{ threat, boons[], freeUpgrades, freeRepair, towerRate, towerDamage, enemyCount, enemySpeed, laneSlow, extraGroups[] }`.

## Research tree and meta (`src/data/unlocks.js`, `src/data/modes.js`, `src/core/Save.js`)

- `RESEARCH_TREE[key]` = `{ branch, tier, col, cost, req?, available?, icon, short, name, desc, …effect fields }`;
  `BRANCHES`; `UNLOCKS` is an alias and `UNLOCK_KEYS` lists the available nodes (old keys keep working).
  `owns(meta, k)`, `missingReqs(meta, k)`, `nodeStatus(meta, k)` → `'owned' | 'reward' | 'locked' | 'open' | 'short'`,
  `affordableNodes(meta)`, `nextGoal(meta)`, `ownedCount(meta)`, `KIT_KEYS`. Effects are read where they apply
  (`Run.create`: stockpile, field_kit, scattergun, kits, scout_report, salvage_logic; the briefing: field_dressing's
  `price`, beacon_codes, cartographer's `radius`; Run: second_look, field_notes, skill_reroll, wide_choice, archivist).
- `OVERGROWTH { max, researchPerLevel, order[], mods{ key: { name, text, …field } } }`; `DAILY { mods, researchPerMod,
  keepDays }`; `LONG_NIGHT { maxNight }`; `MODES`.
- meta adds `startKit`, `overgrowth { best, level }`, `longNight { best }`, `daily { date: { nights, victory, runs } }`
  (validated in `metaModes`, defaults when missing). `RUN_PHASES` lists the run snapshot phases.
- The Codex (`src/data/relics.js`, `src/data/lore.js`): meta `relicsSeen[]`, `lore[]` (`metaCodex` keeps known ids
  only); the run's `relics[]` and `world.relics / lore / visited` string lists are checked in `validRun` (missing = none).
  `RELICS[id] = { name, rarity: 'C'|'R'|'X', when: 'day'|'night'|'both', text, down?, fx }`, `RELIC_SOURCES` (holds,
  chances, rarity weights, magnet, map ranges), `drawRelic(rng, exclude, {rarity, weights})`, `relicLive(id, run)`;
  `PLACE_NAMES`, `LANDMARK_NAMES`, `LANDMARK_KINDS`, `LORE_SPOTS`, `LORE_LOGS` (story order), `LORE_BY_ID`.

## Conventions

- All tuning in `src/data/`. 1 unit = 1 tile, Y up, world X = tile x, world Z = tile y.
- Camera: `new PixelCamera({ dist, near, far })` from `src/core/PixelView.js` — orthographic, pitched `CONFIG.pixel.pitch` (55°),
  1 tile = 32 internal px on the ground. `cam.setSize(w, h)` (Game does it on resolution changes), `cam.setFocus(x, z)` (snapped to 1/32),
  `cam.placeAt(x, z, px, py)` (world point → internal pixel), `cam.toPixel(v)`. The shell calls `snapForRender`/`restoreSnap` around each
  draw to put sprites (`isSprite`) and flat decals (`userData.pxSnap`) on whole pixels; `userData.noSnap` opts out.
  Sprites are upright cards: a sprite `h` tiles tall on screen is `h × CARD_SCALE` (tan 55° ≈ 1.43) world units tall, which is what
  `vis.height` reports; a world height `y` shows as `y / CARD_SCALE` tiles on screen. Sprite scales must be whole numbers (makeVisual rounds).
  Day renders at a near-fixed field of view (640×360 = 20 × 11.25 tiles; 17.5–22 tiles across whatever the window, see `game.fit`); night renders at 1280×720 with the field at 32 px/tile
  (whole-number scale at 720p/1440p/2160p; at 1080p it is stretched ×1.5 — a pixel-exact night zoom would need a panning camera).
- Lighting: hemisphere + directional, Lambert materials. Day warm; night blue with a cyan point light at the core.

## Tutorial hints (`src/ui/hints.js`)

`showHint(game, id, html, {pos, time})` shows a one-time hint (stored in `meta.hints`, skipped when `meta.settings.hints` is off).
Use it for first-run guidance in each mode (controls, extraction, building, wave preview…). `opts.style` places it
explicitly (computed from what it explains, so it never covers it).

Simplicity pass (`src/data/guide.js`): `run.guided` (set by `startNewRun` on the player's first run, or `&guided=1` on a
debug URL) makes `run.isGuidedDay()` true on night 1 — `districtChoices()` returns `[GUIDE.district]` and
`objectiveFor()` returns `GUIDE.objective`. JungleScene then runs the coach (`_setupCoach` / `_updateCoach` /
`_coachTip`: one instruction at a time, top-left; steps carry an `id`: move, cut, crate, map, goal, loot, home) instead of
the jungle hints; `FIRST_DAY` softens every run's day 1 (`_chunkPop`, objective guards). `_homeOffered()` gates the
Relay's "Head home" prompt (`RETURN_PROMPT`). On the guided day `_sitesIn` prefers `data.guided.site`; `_guidedCrate()` /
`_nearCrate(range, onTheWay)` pick the coached crate (route crates first; else a reachable trail-side one:
`GUIDE.coach.cratePath / crateTrail`); `_coachCrate()` / `_coachMarks()` feed the in-world ◆ markers (`_placeMarks`,
pooled pixel-diamond canvases) and the crate's edge arrow (`hud.arrowCrate`).
**Verb tips** (`TIPS`, every run): `scene._tip(id, { urgent, cls, html, once, time })` queues a one-off tip for the
coach line (once per profile in `meta.hints['tip_' + id]`; returns true when it shows / is queued, so callers can skip
their plain toast); `_checkTips` holds the triggers (roll, deflect, bramble, throw, med), `_updateDiscovery` the beacon
one, `_updateDay` sunset; `_updateTips` shows one at a time (urgent first, a calm one re-queued). `_coachTip(html, cls)`
is a passing tip that isn't saved. Text: `TIPS.text`, `{action}` = the bound key (`scene._key(action)`).
**HUD structure** (`_buildHud`): `hud.tlcol` (top-left column: `hud.tl` panel — other systems append into it, e.g. the
relic strip — then `hud.coach`), `hud.tr` (minimap ring, `j-clock` = `hud.sun` + `hud.timer`, `hud.dayLbl`,
`hud.timerSub`; the weather tag appends here), `hud.strip` (goal, `hud.ford`, home), the prompt, edge arrows
(`arrowObj`, `arrowExt`, `arrowCrate`), `hud.lowhp`. The top centre is free for an area boss's bar. `--tx` on `hud.root` =
the world's texel size in CSS px (HUD pixel icons scale by it); `--hudfade` = `JUICE.hudFade.opacity`. River wayfinding:
`_updateFord(target)` sets `this._ford` (a `ford` marker on both maps, the strip's "cross at the stepping stones").
DefenseScene `_readiness()` (→ `READINESS`) drives the "Your defense" line and `_tryStartWave()`'s confirm.
`ui.shownResources(res)` / `resRow` hide zero currencies (Scrap always shows); `resChip(k, n, {short})` = icon + number.

## Per-mode CSS

Each mode keeps its own stylesheet next to its scene (`src/ui/explore.css`, `src/ui/defense.css`, `src/ui/screens.css`) imported by that scene,
so `style.css` stays the shared kit. `src/ui/meta.css` holds the Stage 7 run-systems screens (title modes and Overgrowth row,
briefing extras, the Collection research tree, the Results "why").
