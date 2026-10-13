# Verdant Relay — Critic B: night defense, systems, balance, edge cases

Tested in the built-in browser pane at 1280×720 and 800×450. Waves were driven deterministically from JS
(`scene._step(1/30, true)` in a loop, with `enemyReachedCore` wrapped to log leaks), so every number below comes
from the real simulation code, not from estimates. Unless noted, runs used the debug district (Overgrown Market,
+6 Crawlers). Meta/run localStorage in the pane was reset to a clean state afterwards.

**Budget model ("realistic")**: Night 1 = 100 S / 3 C / 2 B (60 start + one modest expedition), then +75 S / +2 C / +2 B
per night, plus whatever kill bounty the defense earns (measured 18–72 S per night).

---

## 1. Bugs

### Major

**B1. Pulse Beacon can never buff more than one tower: the pads are too far apart.**
Beacon range is 2.6 (`src/data/towers.js:94`). Measured pad-to-pad distances: the only pair within 2.6 tiles is
pad 10 ↔ pad 11 (2.0). Every other pad has **no** neighbour in range, even with Long Sightlines (2.86). So a 60-Research
unlock that costs 50 S + 2 C buffs at most one tower, on one specific pad. The sim agrees: 3 turrets + a beacon lost 83 HP
on N3, against 78 for the same 3 turrets with no beacon. In practice it's a trap pick.
*Fix:* give the beacon range ≥ 4.5 (that reaches 2–3 pads at the core funnel: 7/8, 13/14/15, 3/4), or add pad clusters.

**B2. Quitting mid-wave cancels defeat (save-scum), and you can farm research.**
The run is only snapshotted at prep start (`DefenseScene.js:156`) and at the next briefing (`DefenseScene.js:1416`).
The pause menu even advertises it: "Continue resumes from the start of this night's preparation" (`DefenseScene.js:1172`).
- *Repro:* start N3, let the Relay drop to 10, Esc → Quit to Title → Continue. You're back in prep at full pre-wave HP with your resources restored. Defeat is optional in a roguelite.
- *Research farm:* boss-damage research is tracked in `run.bossResearchGiven` (`Run.js:366`), which is 0 in the N6 prep snapshot. Hit the Colossus to 5% HP, quit, continue, repeat: about +29 Research each time. Quitting during the 2.6 s "Night survived" banner gives the same farm for the +10 night award, because `nightSurvived` runs before the save.
- *Fix:* write a `phase:'wave'` marker at `startWave()`. If you Continue from that marker, either count the wave as lost or restore prep with the HP the Relay had when you quit. Snapshot right after `nightSurvived()` as well.

**B3. Intel is a dead resource.** It's collected (intel terminals are 17% of the container weight, and the Data Center
district sells itself on "Intel ×2"), and the Summary says "Intel feeds research and wave previews". No code ever reads `res.intel`:
`grep intel src` finds only the containers and the HUD. DESIGN §4 and §6 say it should feed research and wave previews.
*Fix:* convert Intel into Research at extraction (e.g. 2 Research per Intel), or gate the per-lane counts in the wave preview behind it.

**B4. Toasts cover the boss bar and the side-panel header (repro on N4 and N6).** `.toasts` is centred on the whole
960-wide stage at `top: 64u` (`src/ui/style.css:121`), while the boss bar sits at `top: 48u` (`defense.css:108`) and the side panel's
heading is at x 720–950. On N6 the "☠ The Canopy Colossus approaches on the South lane!" toast sits directly on top of the
boss bar and its phase label for 4 s. On N4 two to three "New: Burrower / Seed Carrier / Spitter" toasts stack on the side
panel's title and on the top-left hint. *Fix:* centre the toasts over the map rect (x 6–718) and start them below the boss bar (≈ 90u),
or queue them.

### Minor

- **B5. The top bar shows the next night during the victory banner.** `_endNight` calls `run.nightSurvived()` (which increments `run.night`) before
  `_refreshTop` (`DefenseScene.js:1378`, `:764`). Seen live: the banner says "NIGHT 2 SURVIVED" while the top bar says "NIGHT 3 / 6 · Night survived".
  The side panel also re-renders from the freshly emptied `run.tonight`.
- **B6. Mortar L3 burning sap doesn't count as a blast.** The zone uses `type: 'burn'` (`Tower.js:233`), so a Seed Carrier killed by the sap
  still bursts. The Seed Carrier note says "unless a blast (Mortar) kills it". Use `'blast'`, or reword the note.
- **B7. The "Wave 10% smaller" boon does nothing on small groups.** `Math.max(1, Math.round(count × 0.9))` (`DefenseScene.js:53`) leaves every group of 4 or fewer
  unchanged. Measured: N1 14 → 14 (0%), N2 −8%, N3 −9%, N4 −5%, N5 −7%, N6 −7%. Apply the multiplier to the total and remove enemies from the largest groups.
- **B8. Corrupt saves are half-loaded.** `loadRun` (`Save.js:62`) doesn't check tower types, levels, pads, `skills` or `relayHp`. *Repro:* set
  `towers:[{pad:3,type:'laser_cannon',level:1,...}]` in `verdant-relay/run`, then Title → Continue. Defense loads with a dead tower, and clicking it throws
  `Cannot read properties of undefined (reading 'icon')` inside `_renderSide`. After that the side panel stops updating. `upgradeCost` throws on it too.
  DESIGN §7 says invalid saves are "discarded, never half-loaded". A string `skills` also passes, and `includes` then does substring matching.
- **B9. Peak resources ignores Hidden Stockpile.** `Run.create` adds +20 Scrap after `stats.peak` was set from `CONFIG.startResources`
  (`Run.js:56,65`). Results shows "Peak 60 Scrap" for a run that started with 80.
- **B10. Debug URLs inflate lifetime stats.** `Run.create` increments `meta.lifetime.runs` (`Run.js:68`), and every `?debug=` load creates a run.
  `?debug=results&victory=1` also adds a victory and the scarf. Only matters for testers, but the Title "Runs" counter lies.
- **B11. The charge telegraph overstates a slowed charge.** Its length uses speed × chargeMult × charge without `slowMult`
  (`DefenseEnemy.js:400`), but the charge itself is multiplied by `slowMult` (≥ 0.5). A snared boss charges about half the red strip.
- **B12. Repair charges a full 20 Scrap for a partial heal.** At 95/100 you pay 20 S for +5 HP (`Run.js:261`). The button label correctly
  says "+5 HP", but there's no proration or warning. At full HP the label still reads "Repair +20 HP".
- **B13. The build-card stat line ignores skills.** `_statSummary(def)` (`DefenseScene.js:867`) shows base range, so Long Sightlines and
  Living Barricade aren't reflected until after you build. The hover range circle is correct.
- **B14. Grammar:** "Need 1 more Circuits" (`Run.js:136`). The noun isn't singularised.
- **B15. Prep actions aren't saved.** A refresh during prep loses every build and upgrade. That's consistent, because resources are restored too,
  but after 5 minutes of planning it's annoying. Consider re-saving the prep snapshot on every build, upgrade or sell.

Things I checked and found working: resources never went negative across ~60 simulated nights. Sell refunds match 70% of Scrap spent
(85 → 59). Free upgrade, Field Tuning, Efficient Assembly (45 → 41), Long Sightlines (4.5 → 4.95), Overclock (cd 0.648 with Long Sightlines and the +10% rate boon),
Living Barricade (snare 3.08 → 3.70 with both), Watchtower (+30%), Last Stand (10 → 12 below 30%) and Emergency Patch (once per night, usable mid-wave) all apply.
A Summary boon (`towerRate 1.1`) carries into defense and shows in Modifiers. Defeat at 0 goes to Results and clears the run save. Victory → New Run resets the run and keeps
unlocks. Unlock purchases persist across a refresh. Continue works from both prep and briefing, and a garbage run save hides Continue. A Settings resolution
switch mid-defense keeps the camera and UI fitted (sharp = 1280×720 internal). The 800×450 layout scales cleanly, with the smallest text about 9 px.
`exit()` doesn't leak: GPU geometries and textures and the listener count are flat across 6 defense ↔ title cycles. Homing shots hit reliably: 446 of 462 hit, and the 3% misses are
fizzles on targets that were already dead. No console errors.

---

## 2. Balance

### Measured relay HP lost per night

**Sensible mixed build** (turret, arc and thorn, upgrades, one repair, default targeting):

| Night | District threat | Build after shopping | HP lost | Bounty |
|---|---|---|---|---|
| 1 | Market (+6 Crawlers) | Turret@3, Arc@7 | 5 | 19 |
| 2 | Residential (+8 Skitters) | +Thorn@13, Turret→L2 | 0 | 38 |
| 3 | Flooded (+4 Burrowers) | +Arc@14, Arc7→L2, +Thorn@4 | 0 | 52 |
| 4 | Greenhouse (+15% speed) | Thorn4/13→L2, +Turret@11 | 28 (2 Razorbacks, 2 sap) | 54 |
| 5 | Data Center (+1 Razorback) | Arc14→L2, Arc7→L3, Turret3→L3, 1 repair | 15 (Ruin Guard) | 65 |
| 6 | Boss | +Snare@12, +Turret@10, Thorn13→L3, Turret11→L2 | **72 → DEFEAT** in 5 of 5 runs (Colossus leaks with 375–500 HP left) | |

N6 retried from the same snapshot:
- All towers on **Strongest**: the boss dies, but the north lane floods. Lost 4 of 4 runs.
- South-lane towers on **Strongest**, north-lane towers on **First**: **won 3 of 3**, ending on 33–45 HP. The boss dies with under 15 HP left, close to the Relay.
- Same split plus 2 repairs: 55–67 HP left.

**Lazy build** (a Scrap Turret on the next free pad nearest the core, every night, no upgrades, default targeting, 2 runs):
N1 −8/−10, N2 −30/−25, N3 0/−3, N4 0/−4, N5 −18/−20, **N6 0/0 (the boss dies)**. **Won both runs** with 38–44 HP left.

**Zero towers on N1** (Flooded Transit): survived on 12/100. Night 1 can be skipped entirely.

### Conclusions

1. **Spamming base turrets beats a thoughtful mixed build, and it beats the boss with no targeting changes.** This is the
   biggest balance problem. It comes from the cost curve:

   | Tower | Cumulative cost | DPS (single) | DPS per Scrap |
   |---|---|---|---|
   | Scrap Turret L1 | 45 S | 14.3 | **0.317** |
   | Scrap Turret L2 | 85 S | 20.0 | 0.235 |
   | Scrap Turret L3 | 145 S + 1 C | 33.6 | 0.232 |
   | Thorn Nest L1 | 35 S + 1 B | 16.7 | 0.476 (range 3) |
   | Thorn Nest L2 | 65 S + 2 B | 16.7 (+slow) | 0.256 |
   | Thorn Nest L3 | 110 S + 4 B | 20.8 | 0.189 |
   | Arc Spire L1 | 35 S + 2 C | 11.7 (25.5 on a group of 3) | 0.333 / 0.73 |
   | Arc Spire L2 | 70 S + 3 C | 13.3 (33.8 group) | 0.19 / 0.48 |
   | Arc Spire L3 | 120 S + 5 C | 15.0 (38.0 group) | 0.125 / 0.32 |
   | Mortar Pod L1 | 60 S + 1 B | 9.2 splash | 0.154 |
   | Mortar Pod L3 | 180 S + 4 B | 9.2 + 9/s burn | 0.051 |

   - Every upgrade is worse value than a new L1 turret until all 16 pads are full.
   - Turrets need no components, so a player who ignores Circuits and Biofiber loses nothing.
   - 16 pads is enough room to never upgrade.

   *Suggested numbers:* Turret L2 cost 40 → 30 and cooldown 0.5 → 0.45 (+59% DPS for +67% cost). Turret L3 60 S + 1 C → 50 S + 1 C.
   Raise the base turret to 50 S. Alternatively, add a soft cap: each extra tower of the same type costs +5 S.

2. **The Thorn Nest is under-ranged.** Four Thorn L3s (440 S) still **lost** N4 (−91, 22 leaks). Four Turret L3s (580 S) lost 0, and four Arc L1s
   (140 S + 8 C) lost only 34. With range 3.0 a Thorn only covers 3–8.5 tiles of lane on most pads. Its L2 adds **0 DPS**.
   *Suggested numbers:* range 3.0 → 3.5, L2 damage 4 → 5, L3 slow radius 1.2 → 1.6.

3. **The Arc Spire is the best tower per Scrap, but Circuits gate it.** At about 2 C per night, one Arc per night is the cap,
   and Arc upgrades cost 1 + 2 C more. That's healthy, as long as Circuit income stays low.

4. **The Snare Vine shows no measurable value at L1/L2.** Three turrets + Snare L1 lost 85 vs 78 without it (noise). Snare L3 (roots) helped: 54.
   A 40% slow for 1.6 s on a 1.5 s pulse inside a 2.8-tile radius covers about 2 s of a Crawler's walk.
   *Suggested numbers:* range 2.8 → 3.4, or slowTime 1.6 → 2.5 so the slow persists after enemies leave the circle.

5. **Mortar:** L1 is weak (four L1s lost N4), and L3 is strong (−1.5). Its N3 support value was the best I measured: 3 turrets + Mortar@14 → −14, 3 turrets + Arc@14 → −15.
   It's fine as an unlock. Its "strongest" default target is correct.

6. **Boss difficulty is a knife edge, and it inverts the intended skill curve.** The Colossus (1575 HP on N6) beats a good mixed build on
   default targeting every time, dies to any 15-turret spam, and dies to a mixed build only with per-lane targeting. The kill always
   lands with about 1% HP left, close to the Relay. That's dramatic, but there's no margin, and nothing in the game teaches lane-split targeting.
   The hint says "Slow it and focus fire", but the Snare barely slows it (`slowResist 0.5` plus `bossSlowMin 0.5`).
   *Suggested:* lower boss HP 1050 → 900 (1350 on N6), make its leak damage 60 → 40 so a leak doesn't end a 72-HP run outright, and show a
   prep hint on N6: "Set towers on the South lane to Strongest".

7. **The difficulty curve has a hole at N2 and a cliff at N6.** Total wave HP is N1 472, N2 1179 (2.5×), N3 2064, N4 2722, N5 3298, N6 4599.
   `waves.js` claims "+20–25% budget per night", but N1 → N2 is +86% count and +150% HP, and the lazy build took its biggest hit on N2. Meanwhile
   N3 was free (0 HP lost) for both builds.
   *Suggested:* N2 crawler groups 7/7 → 5/5. Add one Spitter to N3 or move the N3 Razorbacks 2 → 3.

8. **Relay HP is cheap compared with towers.** Repair is 1 Scrap per HP, while a Crawler leak costs 5 HP and is worth 1 Scrap of bounty. One turret (45 S) =
   45 HP of repairs. On N1 the cheapest "defense" is no towers plus 80 S of repairs the next morning. *Suggested:* repair 20 S → +12 HP, or
   escalate (+5 S per repair each night).

9. **Bounty is a large share of income** (18 → 72 S a night, roughly matching a whole expedition by N4). Combined with turret spam it
   snowballs: more turrets → more kills → more turrets. Consider 1 Scrap per 2 Crawlers, or a flat per-night bounty cap.

10. **Spitters:** 8 globs × 2 = 16 potential core damage each, and the `coreDamage: 4` field is never used because they always stop.
    They were never a problem with even 4–5 towers near the core funnel. That's fine.

---

## 3. Playability and clarity

- **Targeting names are confusing.** "First" means "Closest to the Relay" (`towers.js:106`), while "Closest" means nearest to the tower.
  Rename to **First (furthest along) / Nearest / Strongest**. Lane-split targeting decides the boss fight, so this matters.
- **The core funnel makes pads 3, 7, 13 and 14 the right answer every run.** Pad 3 covers 9.4 + 8.4 tiles of both lanes at range 4.5, and pad 7 covers 12.1 + 5.7.
  The far-left pads (0, 1, 6, 9) only touch one lane and are strictly worse. Fixed pads plus fixed lanes give one optimal layout.
  Consider seeded pad subsets per run (DESIGN pillar 3, "Every run varies").
- **The slow tint doesn't read at night.** Slowed enemies use `#7d9cff` on top of the night sprite tint `#9fb4e8`, so slowed and unslowed both look
  blue. A Seed Carrier that is slowed and one that isn't were hard to tell apart in a magnified capture. Use a distinct overlay (ice ring or snare tendrils)
  rather than a colour tint. Root vines and the Ruin Guard's shield do read well.
- **The wave preview hides the threat, boons and modifiers below the fold** (body scrollHeight 692 vs 410 visible). Those lines are what makes a
  night different, and the threat box is cut off mid-sentence in the default view. Move them above the per-lane lists or collapse the new-enemy notes.
- **Spitters, Burrowers and the Boss are well telegraphed:** pink line wind-up, dirt mounds and particles, green root circle, red charge strip and boss
  phase label. The red charge strip is short (about 3 tiles) and easy to miss while it sits behind the boss sprite.
- **Wave pacing:** waves run 46–70 s at 1×, and 2× is available, which is fine. There's nothing to do during a wave except change targeting.
  The Emergency Patch is the only mid-wave decision. A cheap wave-time action (e.g. a once-per-night "overcharge" on one tower) would add agency.
- **Onboarding:** the hints are good, but the first wave hint (top-left) sits over the north lane entrance where enemies first appear.
  A hint is a `ui-block`, so it also eats pad clicks underneath. Place wave-phase hints bottom-left.

## 4. Polish

- Role tags overflow their chips in the build list ("SHORT, RAPID", "CHAIN LIGHTN…").
- The Repair button keeps "+20 HP" text and a lit hotkey when the Relay is full. Only a tooltip explains why it's disabled.
- Dark "+"-shaped blotches appear in the field grass (they're in the ground texture: hiding the ground mesh removes them).
  They're probably the sparse `floor_alt_defense` slabs under night light. At night they read as holes or markers right next to pads 2, 3 and 10.
- Toasts are real-time `setTimeout`, so they keep counting while the game is paused. A "New: Seed Carrier" note fades unread if you pause to read it.
- Sell confirmation expires after 2.5 s (`DefenseScene.js:1119`). That's tight if you click Sell and then read the confirm text. 4 s would be safer.
- Burning sap (Mortar L3) and the snare puffs are lovely. The mortar landing telegraph is clear.

---

## 5. Top 10 fixes (by impact)

1. **Fix the beacon** (B1): range 2.6 → ~4.5, or add adjacent pads. Right now a paid unlock is effectively non-functional.
2. **Rebalance the turret cost curve** so mixed builds and upgrades beat L1 turret spam: Turret 45 → 50 S; L2 +40 → +30 S with cd 0.45; L3 60 → 50 S, or an escalating same-type cost.
3. **Close the save-scum and research farm** (B2): add a wave-start save marker, and snapshot after `nightSurvived`.
4. **Give Intel a use** (B3): Research at extraction, or wave-preview detail.
5. **Retune the boss** for margin and teachability: HP 1050 → 900, leak 60 → 40, an N6 prep hint about Strongest targeting on the boss lane, and rename the targeting rules.
6. **Move the toasts off the boss bar and side panel** (B4): centre them over the map and start them below the boss bar.
7. **Smooth the curve:** shrink N2 (crawler groups 7/7 → 5/5) and add pressure to N3. Make the "10% smaller" boon actually remove 10% (B7).
8. **Buff the Thorn and Snare** (range 3.0 → 3.5; Thorn L2 damage 4 → 5; Snare slowTime 1.6 → 2.5 or range 3.4), and make repairs cost more than 1 S per HP.
9. **Harden `loadRun`** (B8): validate tower type, level, pad, `skills` and `relayHp`, and discard on failure.
10. **Small correctness fixes:** top bar night during the banner (B5), burn counting as blast (B6), peak with Stockpile (B9), charge telegraph with slows (B11), and a readable slow indicator at night.
