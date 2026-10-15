// Night waves (Stage 7 "night mechanics", critics K / J / L).
//
// A night is split into PUSHES (nights 1–2: 2, nights 3–6: 3). Between two pushes there is a LULL
// (DEFENSE.lull s, real time) in which you can build, upgrade, sell and repair; "Call next push" ends it
// early and pays DEFENSE.callEarly Scrap for the time skipped (calling while a push's last enemies are still
// walking in skips the whole lull). Each group:
//   { push: 0|1|2, at: seconds after its push starts, lane: index (taken % the map's lane count), type,
//     count, gap: seconds between spawns, hpMult?: replaces the night's health multiplier (the boss) }
// Every night has three authored VARIANTS (A/B/C), picked per run and night by run.rng('wave')
// (variantFor). Nights past 6 (the "Long Night" endless mode) come from waveFor's generator.
//
// Scaling: enemy health × healthMult(night) (HEALTH_MULT; past night 6 it grows ×1.2 a night), counts are
// authored. Fewer, tougher enemies from night 2 (a leak costs its own Relay damage however weak the defense,
// so a thin build's worst case stays bounded while a good one still feels the tanks), and the Relay's own zap
// (RELAY_ZAP, below) gives every defense the same flat backstop. Total wave HP (no district threat), variant A:
// N1 ≈ 840, N2 ≈ 3000, N3 ≈ 10300 (tank-heavy: Razorbacks), N4 ≈ 16300, N5 ≈ 24900 (Ruin Guards, 1 per group),
// N6 ≈ 23800 support + the 5100-HP Colossus (1020 × BOSS_HP 5), then × the map's hpMult (defenseMap.js:
// Twin Paths 0.95, Crossing 1.07, Ford 1.18).
// Relay damage per leak: Crawler 5, Skitter 3, Razorback 9, Spitter 4 (+ up to 8 × 2 sap), Burrower 6,
// Seed Carrier 6, Seedling 1, Ruin Guard 10. The Colossus never "leaks": it besieges the Relay from the plaza
// (6 per slam every 3 s, at most 7 slams) until it is killed.
//
// Balance (Stage 7 sim of the real DefenseScene, .playwright-mcp/nightmech/campaign.mjs, 36 full runs per
// profile over the three maps; table in DESIGN §5), mean Relay HP lost per night:
//   newcomer (≈45 Scrap/day, 2 picks, L1 only near the Relay)   N1 −7, N2 −23, N3 −58 (31/36 hold, ending ~34) · falls N3 5, N4 28, N5 3
//   typical  (≈85/day, ~3 night skills + a lens, wide L1, Snare)  29/36 wins (78–86% over repeats) · 0 / −8 / −11 / −33 / −46 / −47
//                                                                 · falls N5 5, N6 2 · boss killed 24/31 · maps 11 / 9 / 9 of 12
//   strong   (typical + 5 skills, 2 mods, branches, all Protocols) 36/36 wins · 0 / −5 / −2 / −11 / −11 / −8
// With the zap, typical's early nights bite (−8 / −11) while 86% of newcomers still get through night 3.
// Typical's nights 5–6 run ~10 over the 20–35 / 25–40 aim at a ~80% win rate: lower them and it wins ~90%.
// The brief's first curve [1.0, 1.4, 1.8, 2.1, 2.35, 2.5] left a typical run untouched (0 Relay HP lost on every night).
// Final fixes (critic J2 / K2: goal +20 Scrap, Protocol rework, slam 8, N4 7.4 → 6.8), 36 runs each:
//   newcomer 0/36 · −6 / −21 / −53 (34/36 hold) / −62 (11/34 hold) / −65 · falls N3 2, N4 23, N5 11
//   typical  33/36 · 0 / −4 / −6 / −19 / −27 / −59 · falls N6 3 · boss killed 27/33 · maps 12 / 10 / 11 of 12

// N4 7.4 → 6.8 (critic J2 final fixes: after the economy pass the newcomer still fell on N4 ×26/36 with the Relay at
// ~40 after N3; only N4 eased).
// Stage 9 (build anywhere; the user: "make it a little harder, rn its cakewalk"): free placement made the old curve
// easier (sim typical 36/36), so health ×1.2 (N1) … ×1.56 (N6), was [1.25, 3.5, 4.7, 6.8, 7.3, 9.2], and the
// Colossus ×4.5 → ×6 (.playwright-mcp/build9/sim, 36 runs per profile; DESIGN §5):
//   newcomer 0/36 · −13 / −32 / −70 (18/36 hold) / −58 · falls N3 17, N4 18, N5 1
//   typical  26/36 (72%; 25/36 in a second batch) · 0 / −7 / −9 / −23 / −38 / −75 · boss killed 10/32
//   strong   34/36 · 0 / −3 / −4 / −10 / −28 / −25
// Stage 9 round 2 (critics P / Q / R on real-input runs: nights 1–3 a cakewalk, a wall at N5, no real typical run won;
// real players bank ~45–65 Scrap a day, not the sim's 85). The sim's incomes now follow the critics (typical 55–65 a day
// after the guided day + ~0.7 C / B, median 35–55, newcomer 25–45; beacons switched on some days) and the night got:
// N5 45 → 36 enemies, Colossus ×6 → ×5 with 7 slams of 6, the stipend 15 / 25 / 35 / 45 / 55 + a Circuit and a Biofiber
// from N3, the Relay zap 13 → 16, beacons +35% on 7 tiles (Burrowers surface), and this curve (was [1.5, 4.3, 6.0, 9.2,
// 10.8, 14.4]). 36 runs per profile (DESIGN §5):
//   newcomer 0/36 · −8 / −26 / −60 / −64 · falls N3 6, N4 26, N5 4          (old tuning, same incomes: N3 13, N4 23)
//   median    5/36 · 0 / −14 / −24 / −41 / −59 / −63 · reaches N5 34/36       (old: 0/36)
//   typical  23/36 (64%) · 0 / −8 / −15 / −30 / −41 / −54 · boss killed 16/32  (old: 8/36)
//   strong   36/36 (takes Provoke whenever it reads strong) · 0 / −1 / −2 / −6 / −8 / −8
// Stage 9 round 3 (critics R2 / Q2: real typical players banked ~57 a day, upgraded to level 3 and won 5/5; skilled runs
// lost 0 Relay on 15 of 18 nights): +7 / +11 / +8 / +6 / +4% on nights 2–6 (was [1.6, 4.4, 6.2, 10.2, 11.9, 16.5]),
// Provoke ×1.5 enemies at ×1.15 health for 40 Scrap (+ a Double dare from N4). Sim profiles now play like the critics'
// (typical 50–65 a day, 5 picks, level 3 branch A; the newcomer repairs under 70%), 36 runs each (DESIGN §5):
//   newcomer 0/36 · −7 / −25 / −64 / −87 · falls N3 4, N4 18, N5 14       (before: N3 5, N4 16, N5 15)
//   median    7/36 · 0 / −16 / −28 / −53 / −79 / −72 · reaches N5 33/36   (before 11/36)
//   typical  24/36 (67%) · 0 / −10 / −19 / −33 / −56 / −67                (before 28/36, 78%)
//   strong   36/36 · 0 / −5 / −7 / −11 / −9 / −10; provoked nights −10 (were −1)
export const HEALTH_MULT = [1.6, 4.7, 6.9, 11.0, 12.6, 17.2];

/** Enemy health multiplier for a night (past night 6: ×1.2 per extra night, for the Long Night). */
export function healthMult(night) {
  const n = Math.max(1, night || 1);
  if (n <= HEALTH_MULT.length) return HEALTH_MULT[n - 1];
  return HEALTH_MULT[HEALTH_MULT.length - 1] * Math.pow(DEFENSE.longNight.hpGrowth, n - HEALTH_MULT.length);
}

// Defense-mode tuning that isn't per tower or per enemy.
export const DEFENSE = {
  // Extra groups (district threats) arrive mid-push: in push `extraPush` (or the last push when the night
  // has fewer), spread between these fractions of that push's length, alternating lanes. A map with a
  // lane facing the area (scene.dangerLane) sends them all down that lane.
  extraPush: 1,
  extraGroupFrom: 0.2,
  extraGroupTo: 0.7,
  // District-threat group sizes × this per night (an 8-Skitter pack is most of a night-1 wave otherwise).
  threatScale: [0.5, 0.6, 1, 1, 1, 1],
  rapidResponse: { mult: 0.7, time: 8 },   // skill: enemies 30% slower for the first 8 s of each push
  speeds: [1, 2, 3],                       // game speed options in the HUD (F cycles)
  maxSubstep: 1 / 30,                      // sim step cap at high speed (keeps projectiles accurate)
  bossSlowMin: 0.5,                        // slows never take a boss below this speed multiplier
  // Pushes and lulls (critic K #5). lull: seconds between pushes (real time, not sped up by 2×/3×).
  // callEarly: "Call next push" pays `scrap` per `every` s of lull skipped.
  lull: 12,
  // Space guards (critic L §4): a weak-readiness "Start anyway" stays armed `confirm` s and needs its button or
  // Shift+Space (a plain Space double-tap can't skip the warning); Space doesn't pause for `pauseGrace` s after a
  // wave or push starts (so start-then-pause can't happen on a double-tap).
  startGuard: { confirm: 8, pauseGrace: 0.6 },
  callEarly: { every: 1, scrap: 1 },   // (1 Scrap a second skipped, critic K2 #2)
  // Late-game Scrap sink (critic K §2.3): in prep (not lulls), trade `scrap` Scrap for 1 Circuit or 1 Biofiber,
  // at most `max` times a night from night `fromNight`, shown once you hold at least `showAt` Scrap.
  exchange: { scrap: 35, max: 2, showAt: 60, fromNight: 2, gives: ['circuits', 'biofiber'] },
  // Provoke (Stage 9 round 2, critic P #2): a dare for a defense that already looks strong. In prep from `fromNight`, once
  // a night and for good: `enemies` × tonight's wave size, `hp` × their health, `scrap` Scrap at once, kill bounties ×
  // `bounty`. Not on a night you Disrupted (and Disrupt is off once provoked). From `double.fromNight`, while it still
  // reads "Looks strong", the same button offers a Double dare: another `double.enemies` × for `double.give`. The button
  // shows only while the readiness check reads "Looks strong"; the forecast counts the bigger, tougher wave.
  // (Round 3, critic R2: at ×1.25 and no health bump 9 provoked skilled nights cost 0 Relay: free money.)
  provoke: { fromNight: 2, enemies: 1.5, hp: 1.15, scrap: 40, bounty: 1.5, double: { fromNight: 4, enemies: 1.3, give: { circuits: 1, biofiber: 1 } } },
  // Component swap in the trade row (critic R2: skilled runs ended with 7–11 Biofiber while Circuits blocked level 3):
  // `rate` of one component for 1 of the other, prep only, from `fromNight`, any number of times.
  swap: { rate: 2, fromNight: 2 },
  // The Long Night (endless mode, nights past 6): health ×hpGrowth a night, counts ×(1 + countGrowth ×
  // nights past 6), a Colossus every `bossEvery` nights (its health × bossHp × that night's growth).
  longNight: { hpGrowth: 1.2, countGrowth: 0.1, bossEvery: 3, bossHp: 5.0 },
  // End-of-night banner: with bannerWait it stays until a click / Enter / Space (accepted after bannerMinTime s);
  // without, it auto-advances after endBanner / defeatBanner seconds.
  bannerWait: true,
  bannerMinTime: 0.45,
  endBanner: 2.6,                          // seconds the "Night survived" banner shows (bannerWait off)
  defeatBanner: 2.8,
  emergencyPatchInWave: true,              // Emergency Patch skill usable mid-wave (repairs are not)
  damageNumbersMin: 6,                     // hits below this don't show a number (keeps rapid towers readable)
  maxFloatingText: 28,
  sellConfirm: 4,                          // seconds the "Confirm sell" button stays armed
  resumeReady: 3,                          // seconds of "get ready" before a wave restarted by Continue runs
  bossEntry: 6,                            // seconds the boss's lane entry pulses (tag + arrow) after it spawns, or until it walks on screen
  laneTagDrop: 0.78,                       // lane tags sit this many tiles below the lane centre (clear of enemy rings and the path)
};

// The Relay defends itself (Stage 7 balance pass 3): during pushes the crystal zaps the enemy closest to it
// within `range` tiles, every `cooldown` s, for `damage` × healthMult(night) energy damage (so it keeps the
// same weight every night); with nothing that close it returns fire at a planted Spitter (one lobbing sap at
// it from farther out; `spitters`). It never hits burrowed enemies. A flat defense like this matters a lot to a
// 2–4 tower build and little to a 9-tower one, which lets the early nights bite a good build without
// crushing a thin one. `hint` shows once in night prep (meta.hints.relay_zap).
export const RELAY_ZAP = {
  range: 3, cooldown: 0.7, damage: 16, damageType: 'energy', spitters: true,   // (13 → 16, Stage 9 round 2: thin builds hold night 3)
  color: '#2ce8f5', originY: 3.4,
  // Its reach on the board (critic K2): a dashed ring of `dashes` dashes while you hover the Relay, and for `ringShow`
  // s after its first bolt each night (DefenseScene._buildZapRing / _updateBoard).
  dashes: 28, ringShow: 2.5,
  hint: 'Your Relay zaps anything that gets close, and Spitters that spit at it.',
};

/** The zap's damage per hit on a night (DefenseScene._relayZap, DefenseForecast). */
export function relayZapDamage(night) { return RELAY_ZAP.damage * healthMult(night); }

// Post-night salvage pick (critic K §9): the "Night survived" banner offers a choice of rewards, more of
// them the less the Relay lost tonight. tiers: Relay HP lost ≤ `lost` → `picks` options.
// Option effects (Run.applySalvage): give (resources now), relayHp (repair now, capped), freeUpgrades
// (next night's prep), rangeMod (the tower that dealt the most damage tonight, for the rest of the run;
// a tower takes it once).
export const SALVAGE = {
  // Picks by Relay health lost tonight: 3 on a clean night, else 2 (critic J2 §4: a bad night got one dud).
  // badNight: × weights once more than tiers[0].lost was lost (repair and parts). No dead options: no Relay patch
  // while the Relay is full (Run.salvageOptions), no tune-up without a tower to tune.
  tiers: [{ lost: 10, picks: 3 }, { lost: Infinity, picks: 2 }],
  badNight: { patch: 3, parts: 1.5 },
  options: {
    parts: { name: 'Spare parts', line: '+1 Circuit and +1 Biofiber', give: { circuits: 1, biofiber: 1 }, weight: 3 },
    upgrade: { name: 'Free upgrade', line: 'Your first tower upgrade next night is free', freeUpgrades: 1, weight: 3 },
    tune: { name: 'Tune-up', line: '+15% range for tonight\'s best tower, for the rest of the run', rangeMod: 1.15, weight: 2 },
    patch: { name: 'Relay patch', line: '+20 Relay health now', relayHp: 20, weight: 3 },
    scrap: { name: 'Scrap haul', line: '+25 Scrap', give: { scrap: 25 }, weight: 3 },
  },
};

// Shorthand for authoring: g(push, at, lane, type, count, gap, extra).
const g = (push, at, lane, type, count, gap, extra = {}) => ({ push, at, lane, type, count, gap, ...extra });
const BOSS_HP = { hpMult: 5.0 };   // N6 Colossus: 1020 × 5 = 5100 (instead of the night's own multiplier); = DEFENSE.longNight.bossHp

// WAVE_VARIANTS[night − 1] = [A, B, C]: { key, name, groups }. Lane 0 = the first map lane (North on the
// default map), lane 1 the second; a 3-lane map takes them % 3.
export const WAVE_VARIANTS = [
  // ---- Night 1: Crawlers and Skitters, two pushes. Two towers by the Relay hold it (a newcomer loses ~5).
  [
    { key: 'A', name: 'Crawler column', groups: [
      g(0, 0, 0, 'crawler', 3, 1.8), g(0, 5, 1, 'crawler', 3, 1.8), g(0, 12, 0, 'skitter', 2, 1.2),
      g(1, 0, 1, 'crawler', 3, 1.6), g(1, 4, 0, 'crawler', 2, 1.6), g(1, 8, 1, 'skitter', 4, 0.6),
    ] },
    { key: 'B', name: 'Skitter scouts', groups: [
      g(0, 0, 1, 'crawler', 3, 1.8), g(0, 4, 0, 'skitter', 3, 0.8), g(0, 9, 0, 'crawler', 2, 1.8),
      g(1, 0, 0, 'crawler', 3, 1.6), g(1, 5, 1, 'skitter', 5, 0.55), g(1, 9, 1, 'crawler', 2, 1.5),
    ] },
    { key: 'C', name: 'Pincer', groups: [
      g(0, 0, 0, 'crawler', 3, 1.6), g(0, 0, 1, 'crawler', 3, 1.6), g(0, 8, 1, 'skitter', 2, 1.0),
      g(1, 0, 0, 'crawler', 3, 1.5), g(1, 2, 1, 'crawler', 2, 1.5), g(1, 7, 0, 'skitter', 4, 0.6),
    ] },
  ],
  // ---- Night 2: the first Razorbacks (one per variant: the tank is the test).
  [
    { key: 'A', name: 'First Razorbacks', groups: [
      g(0, 0, 0, 'crawler', 4, 1.3), g(0, 4, 1, 'skitter', 3, 0.7), g(0, 10, 1, 'crawler', 2, 1.3),
      g(1, 0, 0, 'razorback', 1, 6), g(1, 2, 1, 'crawler', 3, 1.2), g(1, 10, 0, 'skitter', 3, 0.65),
    ] },
    { key: 'B', name: 'Razorback escort', groups: [
      g(0, 0, 1, 'crawler', 4, 1.3), g(0, 3, 0, 'crawler', 3, 1.3), g(0, 9, 0, 'skitter', 2, 0.7),
      g(1, 0, 1, 'razorback', 1, 1), g(1, 3, 1, 'crawler', 3, 1.2), g(1, 6, 0, 'skitter', 3, 0.6), g(1, 10, 0, 'crawler', 2, 1.3),
    ] },
    { key: 'C', name: 'Fast pack', groups: [
      g(0, 0, 0, 'skitter', 4, 0.6), g(0, 2, 1, 'crawler', 3, 1.3), g(0, 8, 0, 'crawler', 2, 1.3),
      g(1, 0, 0, 'razorback', 1, 1), g(1, 4, 1, 'razorback', 1, 1), g(1, 8, 1, 'skitter', 4, 0.55), g(1, 9, 0, 'crawler', 2, 1.3),
    ] },
  ],
  // ---- Night 3: Spitters and Razorbacks; three pushes (the old 9 + 9 opening crush is split across them).
  [
    { key: 'A', name: 'Spitter line', groups: [
      g(0, 0, 0, 'crawler', 3, 1.0), g(0, 3, 1, 'crawler', 3, 1.0), g(0, 9, 1, 'skitter', 4, 0.5),
      g(1, 0, 0, 'crawler', 2, 1.0), g(1, 2, 1, 'crawler', 2, 1.0), g(1, 5, 0, 'spitter', 2, 2.5), g(1, 6, 1, 'razorback', 1, 1),
      g(2, 0, 0, 'razorback', 3, 4), g(2, 3, 1, 'spitter', 2, 2.5), g(2, 9, 0, 'spitter', 1, 1), g(2, 10, 1, 'skitter', 3, 0.5),
    ] },
    { key: 'B', name: 'Crawler tide', groups: [
      g(0, 0, 0, 'crawler', 4, 0.9), g(0, 2, 1, 'crawler', 4, 0.9), g(0, 10, 0, 'skitter', 2, 0.5),
      g(1, 0, 1, 'crawler', 4, 0.9), g(1, 2, 0, 'crawler', 4, 0.9), g(1, 6, 1, 'spitter', 2, 2.5), g(1, 8, 0, 'razorback', 1, 1),
      g(2, 0, 1, 'razorback', 1, 1), g(2, 2, 0, 'spitter', 1, 1), g(2, 4, 1, 'skitter', 2, 0.5), g(2, 6, 0, 'crawler', 1, 1.0),
    ] },
    { key: 'C', name: 'Armoured', groups: [
      g(0, 0, 0, 'crawler', 3, 1.0), g(0, 3, 1, 'crawler', 2, 1.0), g(0, 6, 1, 'razorback', 1, 1),
      g(1, 0, 0, 'razorback', 1, 1), g(1, 2, 1, 'skitter', 4, 0.5), g(1, 5, 0, 'spitter', 2, 2.5), g(1, 6, 1, 'crawler', 2, 1.0),
      g(2, 0, 1, 'razorback', 3, 5), g(2, 4, 0, 'spitter', 1, 1), g(2, 6, 0, 'crawler', 2, 1.0),
    ] },
  ],
  // ---- Night 4: Burrowers and Seed Carriers.
  [
    { key: 'A', name: 'Tunnels', groups: [
      g(0, 0, 0, 'crawler', 4, 0.85), g(0, 2, 1, 'burrower', 3, 1.5), g(0, 9, 1, 'skitter', 3, 0.45),
      g(1, 0, 0, 'razorback', 2, 4), g(1, 2, 1, 'seed_carrier', 2, 2.2), g(1, 5, 0, 'burrower', 2, 1.4), g(1, 8, 1, 'crawler', 4, 0.9),
      g(2, 0, 1, 'razorback', 1, 1), g(2, 2, 0, 'spitter', 2, 1.8), g(2, 6, 1, 'skitter', 3, 0.45),
    ] },
    { key: 'B', name: 'Seed swarm', groups: [
      g(0, 0, 1, 'crawler', 3, 0.85), g(0, 2, 0, 'seed_carrier', 2, 2.0), g(0, 8, 1, 'skitter', 2, 0.45),
      g(1, 0, 1, 'razorback', 2, 4), g(1, 2, 0, 'seed_carrier', 2, 2.0), g(1, 4, 1, 'burrower', 2, 1.4), g(1, 8, 0, 'crawler', 3, 0.9),
      g(2, 0, 0, 'razorback', 1, 1), g(2, 2, 1, 'seed_carrier', 2, 2.0), g(2, 4, 0, 'spitter', 2, 1.8), g(2, 7, 1, 'skitter', 2, 0.45),
    ] },
    { key: 'C', name: 'Razorback herd', groups: [
      g(0, 0, 0, 'crawler', 4, 0.85), g(0, 3, 1, 'razorback', 2, 4), g(0, 8, 1, 'skitter', 3, 0.45),
      g(1, 0, 0, 'razorback', 2, 4), g(1, 2, 1, 'burrower', 2, 1.5), g(1, 6, 0, 'seed_carrier', 2, 2.2), g(1, 8, 1, 'crawler', 4, 0.9),
      g(2, 0, 1, 'razorback', 1, 1), g(2, 2, 0, 'spitter', 2, 1.8), g(2, 5, 1, 'skitter', 3, 0.45),
    ] },
  ],
  // ---- Night 5: Ruin Guards (one per group: tanks decide this night, critic K). Stage 9 round 2 (critics P / R: a cliff,
  // 45 / 40 / 50 enemies after N4's ~26): the Crawler and Skitter groups trimmed to 36 / 34 / 38.
  [
    { key: 'A', name: 'Ruin Guard march', groups: [
      g(0, 0, 0, 'crawler', 6, 0.8), g(0, 2, 1, 'crawler', 6, 0.8), g(0, 8, 0, 'ruin_guard', 1, 4),
      g(1, 0, 1, 'burrower', 5, 1.1), g(1, 3, 1, 'seed_carrier', 4, 1.6), g(1, 6, 0, 'skitter', 6, 0.4), g(1, 8, 1, 'ruin_guard', 1, 1),
      g(2, 0, 0, 'ruin_guard', 1, 1), g(2, 2, 0, 'spitter', 3, 1.5), g(2, 4, 1, 'crawler', 3, 0.8),
    ] },
    { key: 'B', name: 'Guards and tunnels', groups: [
      g(0, 0, 1, 'crawler', 5, 0.8), g(0, 2, 0, 'burrower', 4, 1.1), g(0, 6, 1, 'ruin_guard', 1, 1),
      g(1, 0, 0, 'ruin_guard', 1, 1), g(1, 2, 1, 'burrower', 4, 1.1), g(1, 5, 0, 'crawler', 5, 0.8), g(1, 8, 1, 'skitter', 6, 0.4),
      g(2, 0, 1, 'razorback', 1, 1), g(2, 2, 0, 'ruin_guard', 1, 1), g(2, 4, 1, 'seed_carrier', 3, 1.6), g(2, 6, 0, 'spitter', 3, 1.5),
    ] },
    { key: 'C', name: 'Swarm night', groups: [
      g(0, 0, 0, 'crawler', 6, 0.7), g(0, 2, 1, 'crawler', 6, 0.7), g(0, 6, 0, 'skitter', 4, 0.4),
      g(1, 0, 1, 'ruin_guard', 1, 1), g(1, 2, 0, 'seed_carrier', 4, 1.5), g(1, 4, 1, 'burrower', 4, 1.1), g(1, 8, 0, 'crawler', 5, 0.7),
      g(2, 0, 0, 'ruin_guard', 1, 1), g(2, 2, 1, 'skitter', 4, 0.4), g(2, 4, 0, 'spitter', 3, 1.5),
    ] },
  ],
  // ---- Night 6: the Canopy Colossus in the last push, after two thin support pushes.
  [
    { key: 'A', name: 'The Colossus (south)', groups: [
      g(0, 0, 0, 'crawler', 5, 0.9), g(0, 2, 1, 'skitter', 4, 0.6), g(0, 6, 0, 'razorback', 1, 1), g(0, 8, 1, 'seed_carrier', 2, 2),
      g(1, 0, 0, 'burrower', 3, 1.2), g(1, 2, 1, 'ruin_guard', 1, 1), g(1, 5, 0, 'spitter', 2, 2), g(1, 6, 1, 'crawler', 3, 0.6),
      g(2, 0, 1, 'colossus', 1, 1, BOSS_HP), g(2, 2, 0, 'skitter', 3, 0.5), g(2, 12, 0, 'crawler', 3, 0.6), g(2, 22, 0, 'spitter', 1, 1),
    ] },
    { key: 'B', name: 'The Colossus (north)', groups: [
      g(0, 0, 1, 'crawler', 5, 0.9), g(0, 2, 0, 'skitter', 4, 0.6), g(0, 6, 1, 'razorback', 1, 1), g(0, 8, 0, 'seed_carrier', 2, 2),
      g(1, 0, 1, 'burrower', 3, 1.2), g(1, 2, 0, 'ruin_guard', 1, 1), g(1, 5, 1, 'spitter', 2, 2), g(1, 6, 0, 'crawler', 3, 0.6),
      g(2, 0, 0, 'colossus', 1, 1, BOSS_HP), g(2, 2, 1, 'skitter', 3, 0.5), g(2, 12, 1, 'crawler', 3, 0.6), g(2, 22, 1, 'spitter', 1, 1),
    ] },
    { key: 'C', name: 'The Colossus and its guard', groups: [
      g(0, 0, 0, 'crawler', 4, 0.9), g(0, 2, 1, 'crawler', 4, 0.9), g(0, 7, 0, 'seed_carrier', 2, 2),
      g(1, 0, 1, 'ruin_guard', 1, 1), g(1, 2, 0, 'burrower', 3, 1.2), g(1, 5, 1, 'skitter', 4, 0.5), g(1, 8, 0, 'spitter', 2, 2),
      g(2, 0, 1, 'colossus', 1, 1, BOSS_HP), g(2, 3, 0, 'ruin_guard', 1, 1), g(2, 12, 0, 'crawler', 3, 0.6),
    ] },
  ],
];

/** Back-compat view: variant A's groups per night (Codex "first seen on night N", older readers). */
export const WAVES = WAVE_VARIANTS.map((v) => v[0].groups);

/** How many variants a night has (nights past the authored ones reuse nights 4–6's three patterns). */
export function variantCount(night) {
  return (WAVE_VARIANTS[Math.max(1, night) - 1] || WAVE_VARIANTS[WAVE_VARIANTS.length - 1]).length;
}

/** Tonight's variant index for a run: seeded per run and night, so the briefing, prep and a Continue agree. */
export function variantFor(run) {
  if (Number.isInteger(run.waveVariant)) return run.waveVariant;   // forced (debug &variant=)
  return run.rng('wave').int(0, variantCount(run.night) - 1);
}

/**
 * The authored (or generated) wave for a night: { key, name, pushes, groups } with copied groups.
 * Nights 1–6 are the authored variants. Past night 6 (the Long Night) the generator reuses nights 4–6's
 * patterns in turn (night 7 → N4's, 8 → N5's, 9 → N6's, …) without their boss, grows the counts by
 * DEFENSE.longNight.countGrowth per night past 6, and adds a Colossus to the last push every bossEvery
 * nights (its health multiplier relative to the night's: bossHp at night 6 ×hpGrowth a night after).
 * Health itself scales through healthMult(night).
 */
export function waveFor(night, variant = 0) {
  const n = Math.max(1, night || 1);
  if (n <= WAVE_VARIANTS.length) {
    const vs = WAVE_VARIANTS[n - 1];
    const v = vs[((variant % vs.length) + vs.length) % vs.length];
    const groups = v.groups.map((x) => ({ ...x }));
    return { key: v.key, name: v.name, groups, pushes: 1 + Math.max(...groups.map((x) => x.push || 0)) };
  }
  const L = DEFENSE.longNight;
  const past = n - WAVE_VARIANTS.length;
  const base = WAVE_VARIANTS[3 + ((past - 1) % 3)];
  const v = base[((variant % base.length) + base.length) % base.length];
  const grow = 1 + L.countGrowth * past;
  const groups = v.groups.filter((x) => x.type !== 'colossus')
    .map((x) => ({ ...x, count: Math.max(1, Math.round(x.count * grow)) }));
  const pushes = 1 + Math.max(...groups.map((x) => x.push || 0));
  if (n % L.bossEvery === 0) {
    // Same health as a night-6 Colossus at this night's growth: hpMult is relative to the night's multiplier.
    const rel = L.bossHp / HEALTH_MULT[HEALTH_MULT.length - 1];
    groups.push({ push: pushes - 1, at: 0, lane: n % 2, type: 'colossus', count: 1, gap: 1, hpMult: rel * healthMult(n) });
  }
  return { key: v.key, name: `Long Night: ${v.name}`, groups, pushes };
}
