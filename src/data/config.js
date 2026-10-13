// Global tuning numbers. Everything here is a starting value for playtesting.
// World units: 1 unit = 1 tile.

export const CONFIG = {
  saveVersion: 1,
  nights: 6,

  // Pixel-perfect 3D view (src/core/PixelView.js): an orthographic camera pitched `pitch`° with
  // 1 tile = `ppu` internal px on the ground (floor tiles and sprites both draw 1:1). Wall blocks
  // show `wallFrontPx` / `blockFrontPx` rows of their camera-facing side (their world height is
  // derived from that), kept low so sprites standing behind a wall only lose their feet.
  pixel: { pitch: 55, ppu: 32, wallFrontPx: 16, blockFrontPx: 12 },

  // DOM UI. fontGrid: the em size (device px) the pixel fonts Tiny5 / Silkscreen are drawn on —
  // UI font sizes snap to whole multiples of it (Game.fit → --fq).
  // sceneClickGuard: seconds after a scene switch during which mouse clicks on the new UI are swallowed
  // (a click that dismissed the last screen must not land on a button of the next one).
  // minIntegerFill: a scene's fixed internal size (night map 1280×720) is shown at a whole-number scale
  // only if that fills at least this share of the window's area; otherwise it is stretched (Game._layout).
  // view: the world view in internal px (20 × 11.25 tiles at 32 px/tile), shown at a whole-number scale
  // (×2 at 1280×720, ×3 at 1920×1080, ×4 at 2560×1440) with the rest letterboxed (Game._layout).
  // viewBand: [min, max] share of `view` each side may take on other windows — the scale that fills
  // the most of the window within it wins. The height may shrink more (browser toolbars eat ~10%).
  // small: if that leaves only ×1 covering under `cover` of the window, ×2 may show down to w × h of the view.
  ui: {
    fontGrid: 8, sceneClickGuard: 0.3, minIntegerFill: 0.9,
    view: [640, 360],
    viewBand: { w: [0.87, 1.1], h: [0.8, 1.1], small: { cover: 0.6, w: 0.7, h: 0.7 } },
  },

  player: {
    hp: 100,
    speed: 5.6,          // tiles/sec (~180 px/s at 32 px tiles)
    accel: 48,           // tiles/sec² toward the input direction (snappy, slight weight)
    radius: 0.32,
    dodgeCooldown: 2.0,
    dodgeDuration: 0.25,
    dodgeSpeed: 15,
    hurtIframes: 0.6,
    hurtKnockback: 5,    // tiles/sec impulse when hit
    pickupRadius: 2.2,   // loot magnet radius
    pickupSpeed: 11,     // magnet pull speed (tiles/sec)
    maxMeds: 2,
    medHeal: 25,
    medCooldown: 0.6,
    aimAssist: 0.1,      // radians: shots snap to an enemy this close to the aim line
    shotHeight: 0.55,    // world height of bullets / aim plane
  },

  expedition: {
    time: 180,
    emergencyWarning: 8,     // seconds between time-out and the emergency beacon appearing
    lateSpawnEvery: 14,      // after time-out, reinforcements arrive this often
    lateSpawnCount: [2, 3],  // enemies per late reinforcement group (+1 from night 4)
    extractHold: 2.0,
    extractRadius: 1.8,
    interactRadius: 1.4,
    deathReturnHp: 35,       // player HP after a failed expedition
    deathFloorAfter: 15,     // seconds into the day before the salvage Scrap floor applies (abandoning at once earns nothing)
    nightlyHeal: 25,         // player HP recovered each night
    maxSkillPoints: 2,       // skill points one expedition can earn (primary + bonus optionals)
    quickExtraction: 0.75,   // hold-time multiplier with the Quick Extraction skill
    packRatMagnet: 1.5,      // magnet radius multiplier with Pack Rat I
    packRatScrap: 1.1,       // container Scrap multiplier with Pack Rat II
    lushBiofiber: 2,         // Biofiber weight multiplier in containers with Lush Finds (+ crates may hold one)

    // ---- generation
    grid: [6, 3],            // room cells (cols × rows); unused cells become solid canopy
    // Room counts by night live in byNight.exploreRooms / byNight.optionalRooms (a district is sized so a
    // thorough clear doesn't comfortably fit the 180 s timer: stay or extract is a real choice).
    exploreRooms: [6, 8],    // fallback when byNight has no entry
    optionalRooms: [2, 3],
    extraLoopChance: 0.4,    // chance of a second loop beyond the guaranteed one
    eventChance: 0.7,        // chance an event (workshop / surge / infested cache) appears
    brambleDoors: [1, 2],    // doors choked with brambles (cut them with the Pulse Cutter)
    // Tuned so a thorough, successful expedition banks ~90–130 Scrap in a neutral district (balance round 4:
    // bigger districts with leaner containers, so looting ~75–85% of a district lands in that range).
    containersPerRoom: { start: [0, 1], explore: [1, 2], objective: [0, 1], extract: [0, 1], optional: [0, 1] },
    containerWeights: { crate: 52, chest: 25, cache: 8, intel_terminal: 15 },
    // hold: seconds of "hold E" to open (shown in the prompt). Containers are short; objective and
    // event holds live in src/data/objectives.js.
    containers: {
      crate: { scrap: [4, 9], hold: 0.6 },
      chest: { scrap: [9, 14], componentChance: 0.35, hold: 1.0 },
      cache: { scrap: [13, 19], components: [1, 2], hold: 1.5 },
      intel_terminal: { intel: [1, 2], hold: 1.0 },
    },
    holdGrace: 0.8,            // once a hold has started it survives drifting this far past the interact radius (knockback)
    containerMedChance: 0.08,  // × district med multiplier
    medKits: 1,                // loose med kits per map (× district med multiplier)
    enemiesPerRoom: { start: [0, 0], explore: [1, 2], objective: [1, 2], extract: [0, 1], optional: [1, 2] },
    // Expedition difficulty by night (index = night - 1; the last entry repeats). Night 1–2 are a
    // gentle on-ramp: fewer, weaker enemies and lightly guarded objectives; nights 4–6 stay tense.
    byNight: {
      enemyHp:      [0.85, 0.92, 1.0, 1.1, 1.2, 1.3],   // exploration enemy HP multiplier
      enemyDamage:  [0.75, 0.85, 1.0, 1.0, 1.05, 1.1], // exploration enemy damage multiplier
      extraEnemies: [-0.4, -0.1, 0.5, 0.85, 1.2, 1.5],  // extra enemies per room (fractional = chance; negative removes)
      rangedCap:    [1, 1, 2, 2, 3, 3],                 // Spitters + Rival Scavengers per room
      chargerCap:   [1, 1, 1, 1, 2, 2],                 // Razorbacks per room (the elite room has none besides the elite)
      objectiveCap: [3, 3, 4, 4, 5, 5],                 // enemies in the objective room, guards included
      guards:       [2, 2, 3, 3, 3, 4],                 // max guards on guarded caches (objective + infested cache)
      guardRanged:  [1, 1, 2, 2, 2, 2],                 // of those guards, at most this many ranged (Spitters / Scavengers)
      holdSpawns:   [2, 3, 3, 4, 4, 5],                 // max enemies summoned during an objective / event hold
      eliteHp:      [1.8, 2.0, 2.1, 2.2, 2.4, 2.6],     // elite HP multiplier (× the night's enemyHp)
      eliteSupport: [1, 1, 1, 2, 2, 2],                 // light enemies (Crawlers / Skitters) beside the elite
      deathSalvage: [0.35, 0.3, 0.1, 0, 0, 0],          // share of carried loot the drone recovers when you go down…
      deathScrapFloor: [20, 20, 12, 0, 0, 0],           // …but always at least this much Scrap (one early death shouldn't decide a run)
      exploreRooms: [[4, 6], [5, 7], [6, 9]],           // [min, max] exploration rooms (nights 1–2 smaller)
      optionalRooms: [[1, 2], [2, 3], [2, 3]],          // [min, max] optional rooms
      containerScrap: [1.2, 1.1, 1, 1, 1, 1],           // container Scrap multiplier (smaller early maps pay a bit more)
    },
    guardSpacing: 2,           // guards (and other enemies in the objective room) stand at least this many tiles apart
    startMedNights: 2,         // a med kit lies in the start room on nights up to this one
    spawnMinDist: 9,           // generated enemies are at least this far (tiles) from the start
    reinforceMinDist: 7,       // runtime spawns: at least this far from the player
    reinforceMaxDist: 14,
    spawnInTime: 0.7,          // seconds a reinforcement spends emerging (harmless, telegraphed)
    enemyDrop: { scrap: [1, 3], componentChance: 0.15, medChance: 0.04 },   // jungle kills: a small top-up, not income
    ambushCount: [2, 3],       // districts with ambushChance: enemies that burst out of a container
    alarmSpawn: 3,             // reinforcements when a security laser is tripped
    // Spore pods (the jungle hazard) are tuned in SPORES, src/data/jungle.js.
    // Elite objective enemy (Clear the Blockage). HP multiplier comes from byNight.eliteHp.
    // windupMult: longer, clearer charge telegraphs; supportTypes: the only enemies allowed beside it.
    // scale: gameplay size (radius, knockback resistance); the sprite itself stays 1:1 (no mixels) and
    // reads as elite through the tint and a pulsing ground ring (ringColor).
    elite: { scale: 1.3, ringColor: '#feae34', damageMult: 1.2, windupMult: 1.35, tint: '#ffb3a0', supportTypes: { crawler: 2, skitter: 1 } },
    nest: { spawnEvery: 7, maxAlive: 3, radius: 9, types: { crawler: 2, skitter: 1 } },
    holdSpawnMinDist: 6,       // enemies summoned by a hold (terminal, workshop…) appear at least this far
    // Attack tokens (critic G: small packs took 60 HP in ~6 s). Melee / charge attackers need a token to wind up:
    //   max: tokens per night (index = night - 1, last repeats) · gap: seconds between two token grants
    //   afterHit: no new token for this long after a melee hit lands on the player (breathing room; spacing
    //   attacks alone would only stop the post-hit i-frames from soaking simultaneous hits)
    //   release: seconds a token stays taken after the attacker's recovery · holdDist / circleSpeed: enemies
    //   waiting for a token circle the player at about this distance (tiles) and speed (× their own).
    attackers: { max: [2, 2, 2, 2, 3, 3], gap: 0.2, afterHit: 1.0, release: 0.3, holdDist: 2.4, circleSpeed: 0.55 },
    camera: { dist: 12.4, lookAhead: 2.2, follow: 7 },   // pitch / scale: CONFIG.pixel
    light: { hemi: 2.4, sun: 2.0 },
  },

  // Repair: repairScrap buys repairAmount HP; a partial repair near max pays only for the HP restored
  // (rounded up), so Relay health is never cheaper than towers.
  // fullRepairScrap: an engineer's free repair on a full Relay is paid out as this much Scrap instead.
  relay: { hp: 100, repairScrap: 25, repairAmount: 15, fullRepairScrap: 15 },
  sellRefund: 0.7,
  // Each tower of a type you already own makes the next one of that type cost this much more Scrap
  // (keeps one-tower spam from beating upgrades and mixed builds). Shown on the build cards.
  towerSurcharge: 5,
  // Intel is spent during night prep: Decrypt turns it into Research Data; Sabotage shrinks
  // tonight's wave (once per night).
  intel: { decryptCost: 1, decryptResearch: 4, sabotageCost: 3, sabotageWave: 0.9 },
  // All wave-size cuts (objective boons, nest, Sabotage) multiply together but never take the wave
  // below this fraction of its size (−20% at most), so stacking them can't empty a night.
  waveSizeFloor: 0.8,
  startResources: { scrap: 60, circuits: 2, biofiber: 1, intel: 0 },

  research: {
    expedition: 5, objective: 3, optional: 3, night: 10, newDistrict: 10, victory: 50, bossMax: 30,
  },
};

// Blades (exploration is melee now). A swing is a short arc in front of the aim direction that hits
// every enemy and every undergrowth tile inside it once. combo = the 3-hit chain (LMB); chop = the
// charged heavy swing (hold RMB). Times in seconds, ranges in tiles, arcs in radians (total width).
//   hitAt: when in the swing the blade connects · lunge: forward step (tiles/s impulse)
//   cut: undergrowth power (1 clears ferns/thickets, 2 also clears brambles) · stagger: seconds enemies reel
export const WEAPONS = {
  machete: {
    name: 'Machete',
    combo: [
      { damage: 13, arc: 2.1, range: 1.5, time: 0.30, hitAt: 0.08, lunge: 2.4, knockback: 4.5, stamina: 9, cut: 1 },
      { damage: 13, arc: 2.1, range: 1.5, time: 0.30, hitAt: 0.08, lunge: 2.4, knockback: 4.5, stamina: 9, cut: 1 },
      { damage: 24, arc: 2.5, range: 1.65, time: 0.44, hitAt: 0.13, lunge: 4.5, knockback: 9, stamina: 14, cut: 1, stagger: 0.35 },
    ],
    comboWindow: 0.38,
    chop: { charge: 0.42, damage: 40, arc: 2.9, range: 1.9, time: 0.5, hitAt: 0.15, lunge: 5, knockback: 13, stamina: 22, cut: 2, stagger: 0.9 },
  },
  parang: {
    name: 'Parang',
    combo: [
      { damage: 17, arc: 2.0, range: 1.6, time: 0.36, hitAt: 0.1, lunge: 2.2, knockback: 6, stamina: 11, cut: 2 },
      { damage: 17, arc: 2.0, range: 1.6, time: 0.36, hitAt: 0.1, lunge: 2.2, knockback: 6, stamina: 11, cut: 2 },
      { damage: 30, arc: 2.6, range: 1.75, time: 0.5, hitAt: 0.15, lunge: 4, knockback: 11, stamina: 16, cut: 2, stagger: 0.5 },
    ],
    comboWindow: 0.38,
    chop: { charge: 0.5, damage: 50, arc: 3.0, range: 2.0, time: 0.56, hitAt: 0.17, lunge: 5, knockback: 15, stamina: 24, cut: 2, stagger: 1.1 },
  },
};
// Old saves name the start weapon 'carbine' / 'scattergun'.
export const WEAPON_ALIAS = { carbine: 'machete', scattergun: 'parang' };

// Stamina and the dodge roll.
export const STAMINA = { max: 100, regen: 40, delay: 0.5, roll: 22, exhaustedRegen: 0.6 };
export const ROLL = { time: 0.34, speed: 12, iframes: 0.28, cooldown: 0.12 };

// Pulse Cutter (v1, unused by the machete player; kept for the defense codex text).
export const TOOL = { name: 'Pulse Cutter', damage: 22, radius: 1.8, arc: 1.7, cooldown: 0.6, knockback: 7 };

// Game feel ("juice"): hit-stop, death beats, shot VFX, floating numbers, readability helpers.
// Times in seconds, sizes in tiles (1 tile = 32 texels, so 1/32 = one sprite pixel).
export const JUICE = {
  // Hit-stop: the simulation freezes for this long (real time). The longest pending one wins.
  hitStop: {
    kill: 0.035,          // an ordinary exploration kill
    eliteKill: 0.11,      // elite / objective enemy down
    cutterHit: 0.045,     // Pulse Cutter connects (melee weight)
    heavyHit: 0.03,       // a single hit of at least heavyDamage
    heavyDamage: 20,
    playerHurt: 0.06,
    coreHit: 0.04,        // defense: an enemy reaches the Relay (scaled down for chip damage)
    bossDeath: 0.14,
    gap: 0.12,            // after a stop ends, new stops inside this window are halved (no stutter chains)
  },
  slowmo: { bossDeath: { time: 0.6, scale: 0.3 } },
  death: {
    flash: 0.07,          // white flash on the killing blow
    squash: 0.16,         // squash-and-pop duration
    fade: 0.32,           // corpse fade after the squash
    knock: 0.12,          // tiles the corpse slides along the killing hit
    decalLife: 5,         // splat decal on the floor (fades over its last second)
    decalSize: 0.9,       // × enemy size
    decalShade: 0.92,     // splat colour = the enemy's dark burst colour × this (the splat shades its own core darker)
    maxDecals: 28,
  },
  muzzle: { size: 0.42, life: 0.05, light: 2.2, lightDist: 3.2, lightLife: 0.06 },
  // y: world height shots are drawn at (the gun barrels on the upright sprite cards; aim uses shotHeight)
  tracer: { bullet: 0.62, pellet: 0.42, bolt: 0.7, width: 2 / 32, headSize: 3 / 32, y: 0.85 },
  spark: { size: 0.32, life: 0.06, count: 5 },
  bolt: { width: 2 / 32, core: 1 / 32, segments: 7, light: 2.6, lightDist: 3.5 },
  text: {
    pop: 0.12,            // seconds of the 1.45 → 1 pop-in
    popScale: 1.45,
    critScale: 1.8,
    mergeWindow: 0.5,    // repeated damage on one target within this merges into one number
    stackPx: 13,          // vertical step (stage units) when numbers would overlap
  },
  pickup: { sparkleEvery: 1.3, bobPx: 1, flyTime: 0.45 },
  hostileRing: { color: '#ff2e2e', opacity: 1 },   // simplicity pass: hot red = danger (brighter than anything friendly)
  // Simplicity pass: a red "!" pops over a jungle creature as it winds up an attack (JungleScene._updateLight).
  attackBang: { color: '#ff2e2e', life: 0.55 },
  hudFade: { opacity: 0.22, pad: 14 },   // HUD panels fade while a threat is behind them (pad: stage units)
  // Explore: red arrows at the screen edge pointing at enemies winding up an attack off-screen
  // (max arrows, inset from the edge in stage units, how far off-screen an enemy still counts in tiles).
  threatArrows: { max: 4, inset: 20, range: 12 },
  // Explore: small point lights on lamp posts (warm) and the emergency beacon (cyan). A fixed pool is
  // created on enter (the shader's light count never changes, so no recompiles); each frame the lamps
  // nearest the camera get a light. y: light height in world units; flicker: intensity wobble.
  propLights: {
    max: 6,
    lamp: { color: '#ffd8a0', intensity: 8, distance: 3.4, y: 1.6, flicker: 0.12 },   // pale warm: a deep orange barely shows on blue floors
    beacon: { color: '#2ce8f5', intensity: 8, distance: 4.4, y: 1.8, pulse: 0.35 },
  },
  separation: { pad: 0.12, player: 0.16 },  // extra spacing between enemies / from the player (tiles)
  extraction: { scroll: 0.9, width: 1.6, height: 3.4 },
  // Where each tower's drawn muzzle / emitter is in its 32×48 sprite (texels from the left, from the
  // bottom, facing right), so shots, flashes and bolts start where the art draws its own flash.
  towerMuzzle: {
    scrap_turret: [30, 13, '#fee761'], thorn_nest: [17, 30, '#99e550'], arc_spire: [16, 37, '#2ce8f5'],
    mortar_pod: [25, 25, '#feae34'], snare_vine: [16, 20, '#b55088'], pulse_beacon: [16, 30, '#fee761'],
  },
  // Defense feedback
  defense: {
    critShake: 1.5,
    coreShock: 2.6,          // radius of the shockwave ring on the plaza when the Relay is hit
    bossDeathFlash: 0.45,
  },
  // Jungle machete feel (Player / JungleScene.meleeHit / Fx.smear). Index = combo step (0, 1, 2 finisher).
  //   stop: hit-stop on connect (s, real time; the kill stop replaces it when the blow kills)
  //   kick: camera kick along the swing (tiles; 1/32 = one pixel) · shake: screen shake amp (stage px)
  //   smearFrames: seconds per smear frame (the pixel arc has 3–4 frames) · smearY: blade height of the arc
  //   whiteFlash: enemy white silhouette flash (s) · knockback: × the weapon's knockback · hitStun: seconds an enemy
  //   can't steer after a hit (so the knockback reads) · noLungeAfterE: no swing lunge while E is held or this
  //   long after releasing it (s)
  melee: {
    stop: [0.045, 0.045, 0.06], chopStop: 0.08, killStop: 0.07, chopKillStop: 0.1,
    kick: [2 / 32, 2 / 32, 3 / 32], chopKick: 5 / 32, whiffKick: 1 / 32,
    shake: [1.2, 1.2, 2], chopShake: 3.5,
    smearFrames: [0.035, 0.035, 0.04], chopSmearFrames: 0.045, smearY: 0.5, smearScale: 0.9,
    whiteFlash: 0.08, knockback: 1.35, hitStun: 0.14,
    noLungeAfterE: 0.3,
  },
  // In-world telegraphs (ExploreEnemy / Fx). glint: eye-glint star on a wind-up (s) · ring: dithered
  // landing ring frames · lob: the Spitter's arcing sap glob (radius of the splash, flight time clamp,
  // apex height per tile of distance, puddle decal life).
  tele: {
    glint: 0.14, ringFrames: 6,
    lob: { radius: 0.62, minFlight: 0.5, maxFlight: 0.95, apex: 0.28, apexMin: 0.8, puddle: 2.5 },
    laneDust: 0.35,          // dust puffs per second per tile of a Razorback's charge lane while it winds up
    // Razorback lane (Fx.chargeLane): grows over this share of the wind-up, then chevrons sweep toward the charge
    // pulseRate times a second (×3 by the commit) while the edges glow up to +pulseGlow; dust = scuffed band density;
    // xray = flat colours [band, chevrons] drawn where foliage covers the lane; hole = [rx, ry] internal px ellipse
    // around the player (centred holeY world units up) where the x-ray is never drawn.
    lane: { grow: 0.35, pulseRate: 2.2, pulseGlow: 0.45, chevronGap: 16, pulseLength: 48, dust: 0.34, xray: ['#a22633', '#ffb070'], hole: [22, 40], holeY: 0.85 },
  },
};

/** Per-night tuning value from CONFIG.expedition.byNight (the last entry repeats). */
export function nightTune(key, night) {
  const t = CONFIG.expedition.byNight[key];
  return t[Math.max(0, Math.min(t.length - 1, (night || 1) - 1))];
}

export const RESOURCES = {
  scrap: { label: 'Scrap', short: 'SCR', color: '#c0cbdc', glyph: '⚙', icon: 'pick_scrap', desc: 'Builds towers, pays for repairs and most upgrades.' },
  circuits: { label: 'Circuits', short: 'CIR', color: '#2ce8f5', glyph: '▣', icon: 'pick_circuits', desc: 'The bottleneck for electronic towers: Arc Spires and Pulse Beacons cost 2, upgrades 1–2.' },
  biofiber: { label: 'Biofiber', short: 'BIO', color: '#63c74d', glyph: '❦', icon: 'pick_biofiber', desc: 'Organic towers and traps: Thorn Nests, Snare Vines, Mortar Pods.' },
  intel: { label: 'Intel', short: 'INT', color: '#feae34', glyph: '✉', icon: 'pick_intel', desc: 'Spend it in night prep: Decrypt for Research Data, or Sabotage the wave.' },
};
export const RESOURCE_KEYS = ['scrap', 'circuits', 'biofiber', 'intel'];
