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
    turnAccel: 110,      // …when the input opposes your velocity (a 180° turn in ~0.1 s: dodging must be instant)
    turnHold: 0.12,      // …and for this long after, until you're up to speed the new way (critic I2 #12)
    stopAccel: 64,       // …when you let go (a ~0.25-tile stop instead of a slide)
    // Move-speed multipliers while acting: charging a chop · a swing at a creature · a swing that only meets
    // plants (cutting keeps you moving, critic I #4) · winding up a machete throw.
    actSlow: { charge: 0.42, swing: 0.3, plants: 0.75, throw: 0.5 },
    // Corner nudge (JungleWorld.moveBody, critic I #10): walking into a trunk / rock / ruin footprint (input within
    // `cone`° of its surface normal) whose edge is within `edge` tiles of your centre to one side steers you round it at up to
    // `speed` × your speed; brush tiles use `tileEdge` (12 texels).
    nudge: { cone: 35, edge: 0.45, tileEdge: 12 / 32, speed: 0.6 },
    // Going down (critic I #12): slow-mo (s, × speed) over the collapse; creatures within `radius` step `stepBack` tiles off.
    death: { slowMo: 0.5, scale: 0.25, stepBack: 1.5, radius: 3.5 },
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
    deathReturnHp: 35,       // player HP after a failed expedition (going down, abandoning, quitting mid-day)
    deathFloorAfter: 15,     // seconds into the day before the salvage Scrap floor applies (abandoning at once earns nothing)
    nightlyHeal: 25,         // player HP recovered each night…
    dawnHpFloor: 75,         // …and you wake with at least this much, whether you got home or went down (Run.dawnHp; 60 → 75, critic J2 #1)
    maxSkillPoints: 1,       // skill points one trip can earn (from its goal; bonus tasks pay loot instead, critic J2 #1); area bosses add one each on top (skills.js)
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
    // Critic I #2 (no stacking): anything still on cooldown (> circleCd s) or without a free token circles instead of
    //   walking in · flank: waiting creatures hold a slot this many degrees off the player's aim, either side (the
    //   flanks and back, not the front), backArc for Skitters (they come from behind, with a chitter cue) ·
    //   slotTurn: rad/s a slot follows the aim · hopBack: tiles a melee attacker hops away after its lunge.
    // No-path fallback (critic I #5): a walker that makes no progress toward you for `stuck` s throws (Ferals, if
    //   it can see you) or hacks one brush tile toward you every `hackEvery` s.
    // predict: a melee creature starts its wind-up when you're within reach *or* will be by the end of it (your
    //   walking velocity × wind-up × predict), so running past one gets met by the lunge (critic I #1, kiting).
    attackers: {
      max: [2, 2, 2, 2, 3, 3], gap: 0.2, afterHit: 1.0, release: 0.3, holdDist: 2.4, circleSpeed: 0.75, predict: 1.0,
      circleCd: 0.3, flank: [120, 180], backArc: [150, 180], slotTurn: 2.2, hopBack: 0.7,
      stuck: 1.5, hackEvery: 0.8,
    },
    camera: { dist: 12.4, lookAhead: 2.2, follow: 7 },   // pitch / scale: CONFIG.pixel
    light: { hemi: 2.4, sun: 2.0 },
  },

  // Repair: repairScrap buys repairAmount HP; a partial repair near max pays only for the HP restored
  // (rounded up), so Relay health is never cheaper than towers.
  // fullRepairScrap: an engineer's free repair on a full Relay is paid out as this much Scrap instead.
  // stipend: Scrap the Relay pays at the start of each night's prep (index = night − 1; the last entry
  // repeats), so income follows the difficulty curve and one bad day doesn't end the run (critic J M6).
  relay: { hp: 100, repairScrap: 25, repairAmount: 15, fullRepairScrap: 15, stipend: [0, 10, 15, 20, 25, 30] },
  sellRefund: 0.7,
  // Each tower of a type you already own makes the next one of that type cost this much more Scrap
  // (keeps one-tower spam from beating upgrades and mixed builds). Stage 7 sim: with level-2 upgrades now
  // efficient, 12 made wide builds 25–35 Relay HP worse than tall ones at equal spend; 6 evens them out.
  // Shown on the build cards.
  towerSurcharge: 6,
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
// stamina is the cost of a swing that meets a creature, nest or pod; one that only meets plants (or air) costs
// STAMINA.plantSwing / plantFinisher instead (critic I #4). hackEvery: holding LMB while you walk swings on its own
// this often ("hack-through"). throw (F, critic I §9E): wind-up, flight range / speed, piercing damage out and back,
// return time, stamina, cooldown, hit radius; it cuts thickets and ferns (not brambles) along its line.
// shove: what LMB does while the blade is out (no cutting). recallLock: F can't call the blade back this soon after
// the throw (a double-tap doesn't waste it).
// Critic I2 #6: the light combo is the damage option (cheaper, a harder finisher); the heavy chop is the stagger /
// crowd / brush tool — it costs more, holds stamina regen for STAMINA.chopDelay s, and is weak when exhausted.
export const WEAPONS = {
  machete: {
    name: 'Machete',
    combo: [
      { damage: 13, arc: 2.1, range: 1.5, time: 0.30, hitAt: 0.08, lunge: 2.4, knockback: 4.5, stamina: 7, cut: 1 },
      { damage: 13, arc: 2.1, range: 1.5, time: 0.30, hitAt: 0.08, lunge: 2.4, knockback: 4.5, stamina: 7, cut: 1 },
      { damage: 28, arc: 2.5, range: 1.65, time: 0.44, hitAt: 0.13, lunge: 4.5, knockback: 10, stamina: 12, cut: 1, stagger: 0.35 },
    ],
    comboWindow: 0.38,
    hackEvery: 0.28,
    chop: { charge: 0.42, damage: 36, arc: 2.9, range: 1.9, time: 0.55, hitAt: 0.15, lunge: 5, knockback: 14, stamina: 30, cut: 2, stagger: 0.9 },
    throw: { windup: 0.25, range: 6, speed: 16, damage: 18, returnTime: 0.4, returnDamage: 9, knockback: 3, stamina: 25, cooldown: 3, radius: 0.35, recallLock: 0.35 },
    shove: { damage: 4, arc: 2.2, range: 1.25, time: 0.26, hitAt: 0.07, lunge: 1.5, knockback: 6, stamina: 4, noCut: true },
  },
  parang: {
    name: 'Parang',
    combo: [
      { damage: 17, arc: 2.0, range: 1.6, time: 0.36, hitAt: 0.1, lunge: 2.2, knockback: 6, stamina: 9, cut: 2 },
      { damage: 17, arc: 2.0, range: 1.6, time: 0.36, hitAt: 0.1, lunge: 2.2, knockback: 6, stamina: 9, cut: 2 },
      { damage: 34, arc: 2.6, range: 1.75, time: 0.5, hitAt: 0.15, lunge: 4, knockback: 12, stamina: 14, cut: 2, stagger: 0.5 },
    ],
    comboWindow: 0.38,
    hackEvery: 0.32,
    chop: { charge: 0.5, damage: 46, arc: 3.0, range: 2.0, time: 0.62, hitAt: 0.17, lunge: 5, knockback: 16, stamina: 32, cut: 2, stagger: 1.1 },
    throw: { windup: 0.3, range: 5.5, speed: 14, damage: 22, returnTime: 0.45, returnDamage: 11, knockback: 4, stamina: 27, cooldown: 3.2, radius: 0.38, recallLock: 0.4 },
    shove: { damage: 5, arc: 2.2, range: 1.3, time: 0.28, hitAt: 0.08, lunge: 1.5, knockback: 7, stamina: 4, noCut: true },
  },
};
// Old saves name the start weapon 'carbine' / 'scattergun'.
export const WEAPON_ALIAS = { carbine: 'machete', scattergun: 'parang' };

// Stamina and the dodge roll (critic I #4: cutting and short fights shouldn't leave you waiting on an empty bar).
//   plantSwing / plantFinisher / plantChop: a swing that meets only plants or air · deflect / perfectDodge: refunds.
//   Empty = exhausted until `max` × 0.35, regen × exhaustedRegen; spending while exhausted doesn't restart `delay`.
//   Exhausted swings and chops take × exhaustedSwing.time and deal × exhaustedSwing.damage. chopDelay: a heavy chop
//   holds regen this long (critic I2 #6).
export const STAMINA = {
  max: 100, regen: 40, delay: 0.35, roll: 20, exhaustedRegen: 1.0, plantSwing: 2, plantFinisher: 3, plantChop: 6, deflect: 15, perfectDodge: 15,
  chopDelay: 0.45, exhaustedSwing: { time: 1.35, damage: 0.7 },
};
//   buffer: a Space press in the last `buffer` s of a roll, during its cooldown or before a chop lands waits and
//   rolls as soon as it can (critic I #7) · perfect dodge (stamina back, `slowMo` [s, × speed], a cyan rim `rim` s;
//   once per roll): any hit the roll's i-frames absorb, or a near miss — an attack committing within `near` s of
//   the roll starting, from inside its hit zone, even if the roll carried you out (critic I2 #8; `nearPad` tiles of
//   slack on the zone). dodgedText: the DODGED word shows at most once per roll.
export const ROLL = { time: 0.34, speed: 12, iframes: 0.28, cooldown: 0.12, buffer: 0.15, near: 0.2, nearPad: 0.25, slowMo: [0.2, 0.4], rim: 0.28, rimColor: '#2ce8f5' };

// Deflect / riposte (critic I §9A): the first `window` s after pressing RMB (charging a chop, or the light swing a
// tap gives) turns an attack from the front half away. A new window opens at most every `lockout` s (a deflect
// resets it), so tap-spam doesn't work. Melee: the attacker reels `stun` s (elites `eliteStun`) and your next light
// slash within `riposte.time` s does × `riposte.mult` and always staggers; it reaches `riposte.range` tiles further
// and lunges `riposte.lunge` harder, and a riposte that hits nothing isn't spent (critic I2 #7). The attacker is
// shoved `shove` tiles/s (0: it stays in reach). A Spitter glob is batted back for `glob` damage; a Razorback
// charge: you sidestep `sidestep` tiles and it takes `chargeDamage` and a `chargeStun` s stun.
export const DEFLECT = {
  window: 0.14, lockout: 0.5, hitStop: 0.09, stun: 1.0, eliteStun: 0.4, shove: 0,
  riposte: { time: 1.0, mult: 2.5, stagger: 0.5, range: 0.5, lunge: 1.5 },
  glob: 25, sidestep: 0.6, chargeDamage: 15, chargeStun: 0.8,
  ring: '#ffffff', spark: '#fee761', ringRadius: 1.2,
};

// Status effects on the player (critic I §9F). sap: standing in a Spitter's puddle slows you, and a roll that starts
// in one costs `rollCost` more stamina. bleed: a Bramble Crawler's bite (EXPLORE_ENEMIES.crawler.bleed s) takes `dps`
// HP a second in `tick` s steps; a roll stops it. root: the Thorn Stalker's grip (you can't walk; a roll breaks it).
export const STATUS = {
  sap: { slow: 0.6, rollCost: 10 },
  bleed: { dps: 2, tick: 0.5, color: '#e43b44' },
  root: { color: '#8c4026' },
};

// Wall splat (critic I §9B): a creature knocked back at ≥ `speed` tiles/s into a trunk / rock / ruin, or into a
// bramble (which it nicks), takes the extra damage and reels. Critic I2 #11: `reach` tiles of slack (a knock that
// ends just short of a trunk still slams it); a Razorback charging into a trunk / rock / ruin splats too (`charge`).
// impact: hit-stop s, shake, the cracked-bark ring radius.
export const SPLAT = {
  speed: 2.5, reach: 0.3,
  object: { damage: 10, stun: 0.5 }, bramble: { damage: 14, stun: 0.6 }, charge: { damage: 12 },
  impact: { hitStop: 0.08, shake: 5, ring: 0.9 },
};

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
    decalLife: 30,        // splat decal on the floor (critic H #7: a stain that fades over ~30 s)...
    decalFade: 24,        // ...dissolving texel by texel over its last decalFade seconds
    decalSize: 0.9,       // × enemy size
    decalShade: 0.92,     // splat colour = the enemy's dark burst colour × this (the splat shades its own core darker)
    splatDesat: 0.55,     // death splats pulled this far toward the ground colour (3-tone, not saturated paint)
    splatGround: '#3b3122',
    maxDecals: 28,
    // Per-creature splats (critic H2 §3: kills left navy-black blots from the burst's dark colour). `kind` per creature
    // key (day and night) → the artist's flat decals splat_<kind>_1|2 (24 × 16, already ~55% toward the dirt, no
    // texel darker than dark dirt; ×2 for creatures of size ≥ `bigFrom`), else a procedural 3-tone splat in `color`
    // (the same mid tone; its ramp is clamped at `minLum` so it never goes darker than the ground).
    splat: {
      kind: {
        feral: 'blood', feral_chief: 'blood', scav: 'blood', razorback: 'blood', stalker: 'blood', ruin_guard: 'blood',
        crawler: 'sap', burrower: 'sap', seedling: 'sap', seed_carrier: 'sap', colossus: 'sap',
        skitter: 'magenta', spitter: 'acid', bloater: 'acid',
      },
      color: { blood: '#6c2c22', sap: '#5a5a2e', magenta: '#6c324a', acid: '#5c6c28' },
      bigFrom: 1, minLum: 0.16,
      // Art splats are stained into the ground under them (Fx.decal, when the scene gives Fx its baked ground):
      // each texel pulled `toGround` toward the ground texel beneath, then lifted so none is darker than the darkest
      // ground texel under the splat (critic H2 §7 target). Without a ground (or as fallback) the art is used as drawn.
      toGround: 0.3,
    },
  },
  // Hit flash (Fx.hitFlash, critic H #7): `white` frames of flat white, then `tint` frames of the sprite pushed
  // `mix` of the way toward `color` (red-orange), only on the sprite hit; edge texels stay `ink`.
  hitFlash: { white: 1, tint: 2, color: '#ff6a3d', mix: 0.45, ink: '#181425' },
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
  // glowZ: the ground glow disc's offset (tiles, - = north) so it sits centred under the item's base (critic H #12).
  pickup: { sparkleEvery: 1.3, bobPx: 1, flyTime: 0.45, glowZ: -3 / 32 },
  hostileRing: { color: '#ff2e2e', opacity: 1 },   // simplicity pass: hot red = danger (brighter than anything friendly)
  // In the jungle the always-on ring under a creature is a dim dark red (~60%), so the hot-red wind-up telegraphs pop (critic I #12).
  hostileRingJungle: '#9a1d22',
  // The thrown machete's pale motion streak (tiles long, behind the spinning blade) so it reads in flight.
  bladeTrail: { length: 0.75, color: '#c0cbdc', width: 2 / 32 },
  // Simplicity pass: a red "!" pops over a jungle creature as it winds up an attack (JungleScene._updateLight).
  attackBang: { color: '#ff2e2e', life: 0.55 },
  hudFade: { opacity: 0.5, pad: 14 },    // HUD panels fade while a threat is behind them (pad: stage units; critic L: 0.22 hid the clock)
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
  // Where each tower's drawn muzzle / emitter is, per art (48 × 64 sprites, facing right), so shots, flashes and
  // bolts start where the art draws its own flash: [x, y] with x on a 32-wide scale (16 = the sprite's centre;
  // 48-px art: 16 + (column − 24)) and y = texels above the sprite's bottom. Keys: level 1 / 2 / 3 and the
  // level-3 branches 3a / 3b (a missing one uses level 3); `color` = the flash colour.
  towerMuzzle: {
    scrap_turret: { color: '#fee761', 1: [34, 34], 2: [34, 34], 3: [34, 36], '3a': [38, 36], '3b': [35, 36] },
    thorn_nest: { color: '#99e550', 1: [16, 29], 2: [16, 32], 3: [16, 38] },
    arc_spire: { color: '#2ce8f5', 1: [16, 39], 2: [16, 47], 3: [16, 48], '3a': [16, 57], '3b': [16, 44] },      // the orb
    snare_vine: { color: '#b55088', 1: [16, 36], 2: [16, 41], 3: [16, 45], '3a': [16, 42] },
    mortar_pod: { color: '#feae34', 1: [22, 35], 2: [22, 37], 3: [23, 39], '3b': [18, 31] },                    // 3b: front tube
    pulse_beacon: { color: '#fee761', 1: [16, 41], 2: [16, 49], 3: [16, 54] },                                  // the lamp
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
  circuits: { label: 'Circuits', short: 'CIR', color: '#2ce8f5', glyph: '▣', icon: 'pick_circuits', desc: 'The bottleneck for electronic towers: Arc Spires and Pulse Totems cost 2, upgrades 1–2.' },
  biofiber: { label: 'Biofiber', short: 'BIO', color: '#63c74d', glyph: '❦', icon: 'pick_biofiber', desc: 'Organic towers and traps: Thorn Nests, Snare Vines, Mortar Pods.' },
  intel: { label: 'Intel', short: 'INT', color: '#feae34', glyph: '✉', icon: 'pick_intel', desc: 'Spend it in night prep: Decrypt for Research Data, or Sabotage the wave.' },
};
export const RESOURCE_KEYS = ['scrap', 'circuits', 'biofiber', 'intel'];
