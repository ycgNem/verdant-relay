# Critic K: The night tower defense (TD specialist pass)

**Session:** 2026-10-13. Frozen build at `http://localhost:5191`, in my own headless Chrome (GPU), mostly at 1280×720 with
UI and scale passes at 1920×1080 and 1366×768. Screenshots, scripts and logs are in `.playwright-mcp/roundK/`
(`K01`–`K71`, `KR_*` for the real run, `Kz_*` for zoomed crops). The helpers are `k.mjs`, `night.mjs` (one night per JSON
plan), `campaign.mjs` (a real run) and `cover.mjs` (pad coverage maths).

**How it was played**

- **Input:** every build, upgrade, sell, target, Start, speed and pause action used real mouse clicks on pads and panel
  cards, including scrolling the side panel with the wheel.
- **Instrumentation (read-only):** I wrapped `enemyReachedCore`, `spitAtCore` and `_kill` to log every Relay hit with its
  source, plus how many HP the enemy had left.
- **Debug nights:** 45 nights in total, covering N1 to N6, poor / typical / rich budgets and 12 strategies.
  - Budgets followed DESIGN §5: cumulative ≈130 / 220 / 320 / 420 / 520 / 625 Scrap, with ~1–2 components per day.
  - I unlocked Mortar and Beacon by seeding `meta.unlocks` in my own profile. Debug does not grant them.
  - I added skills with `&skills=` where noted.
  - Balance sweeps ran at sim speed ×2–3; feel passes ran at 1× and 2× with the speed buttons.
- **One real run from the title:** New Run → briefing → jungle → summary skill pick → night prep → wave, for all 6 nights.
  - Days were compressed with the jungle debug: carried loot was set to the DESIGN budget (70/90/100/100/100/105 Scrap,
    +1 Circuit, +1 Biofiber and +1 Intel), then I completed the objective and extracted.
  - Everything at night was the real flow: threats, boons, skills, repairs, Intel, banners and results.
  - **Result: victory. Relay HP after each night: 100, 100, 38, 117/125, 21/125, 12/125.**
- **Console:** 0 errors and 0 warnings across all sessions.

---

## 0. The short version

The night looks good and reads its *intent* well: dirt lanes, per-path counts, NEW tags, danger and reward boxes, and a
readable Colossus enrage. **As a tower defense, though, it is shallow and mostly passive.** These are the core problems:

1. **You make 1–3 purchases per night, then watch a 70–100 s wave** in which your only verb is the targeting dropdown.
2. **Wide level-1 spam beats upgrading.** At equal spend: 9 × L1 = **74 / 60 HP**; 3 × L3 = **lost / 2 HP**.
3. **Two enemy types are guaranteed leaks.** Ruin Guards and Razorbacks reach the Relay in nearly every build, so nights
   are a tank DPS check.
4. **The boss cannot be killed.** Even a 14-tower all-pads build lets it reach the Relay with about 550 HP. The game's own
   "Boss tip" (set its lane to Toughest) **costs ~40 Relay HP**.
5. **The UI misinforms.**
   - The readiness meter ignores coverage and slows ("Looks strong" → −52 HP).
   - The pips call the Mortar the strongest tower; it is the weakest.
   - The 2× button is off-screen at 1280×720.

---

## 1. Night log (selected; full JSON in `roundK/*.log`)

| Night / file | Budget, build | Readiness shown | Result (Relay HP left), where the damage came from |
|---|---|---|---|
| N1 `K10` | 60 S, 1 turret beside the Relay | Risky | **47**: killed 4 of 17; crawlers leaked with 8–38 HP left |
| N1 `K11` | 125 S, turret + Arc | Strong | 86 |
| N2 `K21` | 110 S after a bad day, 2 towers (L2 turret) | Risky | 60 (Razorback leaked with 129 of 252 HP) |
| N2 `K22` | 220 S, 5 towers at the Relay | Strong | **100**: zero leaks |
| N2 `K23` | 220 S, same 5 towers, **north lane only** | **Strong** | **48**: the whole south lane walked in |
| N3 `K32` / `K33` / `K34` | 320 S, 5 towers, funnel / both-lane pads / + 2 skills | Risky | 22 / 26 / 33. **66 of 78 HP was lost in the t = 31–40 s crawler crush** |
| N3 `K30` / `K31` | 320 S, 4 towers / 5 L1 turrets | Risky | **Lost / lost** |
| N4 `K40` / `K42` | 420 S typical at the Relay / spread mid-map | Risky | 22 / **33** (spread beat funnel) |
| N4 `K41` | 420 S, 6 turrets | Risky | Lost |
| N4 `K43` | 420 S with Mortar + Beacon | Weak | Lost (Mortar L2: 884 damage all night) |
| N4 `K44` / `K44r2` | 420 S **tall**: 3 × L3 + snare | Risky | **Lost / 2** (5 Razorbacks leaked: −60) |
| N4 `K45` / `K45r2` | 420 S **wide**: 9 × L1 + snare | Risky | **74 / 60** |
| N5 `K50` | 520 S typical, no skills | Risky | Lost (4 Ruin Guards leaked with 235–369 of 552 HP) |
| N5 `K51`–`K54` | Same towers, 4 placements, 3 skills | Risky ×4 | 18 / 24 / 8 / lost. **All 4 Ruin Guards leaked every time (−60)** |
| N5 `K57` / `K58` | 3 L2 Snares + Arcs / Thorns instead of Snares | Risky (0.92) / Risky (1.25) | **53 / 7**. The meter rates the better build lower |
| N6 `K63` / `K63r2` | 625 S + 3 skills, targeting First | Risky | 45 / 46 (boss leaked with ~1000 HP: −29/−30) |
| N6 `K64` / `K64r2` | Same, **following the Boss tip (Toughest)** | Risky | **4 / 9** |
| N6 `K62` | 950 S rich + unlocks + 9 towers | **Strong** | **Lost**: the boss arrived with 28 of 2550 HP and finished the Relay |
| N6 `K65` | 900 S, 14 towers on every pad + 3 skills | Strong | 46. **Boss still arrived with ~550 HP** |
| Real run `KR_*` | DESIGN budgets, 6 skills picked by the run | Risky N3–N6 | 100, 100, 38, 117/125, 21/125, 12/125. Victory; the boss leaked (−22) |

---

## 2. Strategic depth

### 2.1 Upgrades are a trap; wide L1 spam is the dominant strategy

**Static DPS per Scrap** (`src/data/towers.js`):

| Tower | DPS per Scrap |
|---|---|
| Scrap Turret L1 / L2 / L3 | 0.32 / 0.31 / 0.30 (L3 also costs a Circuit) |
| Arc Spire L1 | 0.33 single target, **0.73** on a group of 3 |
| Arc Spire L3 | 0.14 single, 0.36 group |
| Thorn Nest L1 | 0.48 (range 3.5) |
| Mortar L1 | **0.15** |
| Mortar L3 | **0.10** |

What this means:

- An upgrade is never more efficient than a new tower.
- A new tower also adds **coverage**, which upgrades never do: a second pad, often the second lane.
- The same-type surcharge (+5 Scrap, `CONFIG.towerSurcharge`) is too small to matter.

**Measured** as damage dealt per Scrap spent:

| Tower | Damage per Scrap | Source |
|---|---|---|
| Arc L1 | 28–41 | `K43`, `K65` |
| Turret L3 | 15–18 | |
| Mortar L2 | 8 | `K43` |
| Mortar L3 | **3–4** | `K61`, `K62` |

The tall-vs-wide pair `K44`/`K45` (same 420 Scrap, run twice) is decisive: **3 × L3 lost or ended on 2 HP; 9 × L1 ended
on 74 and 60 HP.**

L2/L3 add +10% damage, a 5th-shot crit or one more chain. Kingdom Rush and BTD6 make upgrades the identity moment;
here they are a worse purchase with a chevron on top.

**Fix (data, `src/data/towers.js`; surcharge in `src/data/config.js`):**

1. Make upgrades the efficient buy. L2 should be ≈ +70% DPS for ~0.6× the base cost:
   - Turret L2: damage 13, cooldown 0.42.
   - Arc L2: damage 20, chains 3.
   - Thorn L2: damage 6.5.
2. Raise `towerSurcharge` from 5 to **12**, so the 4th Arc costs 71.
3. Make L3 a branch (expansion C in the Top 12).

**Target:** at equal spend, tall and wide end within ±10 HP of each other on N4.

### 2.2 Placement: one solved answer on one static map

The map has 2 lanes and 16 pads, and it is the same on every night of every run. `cover.mjs` measures the path length
each pad sees.

**The obvious "defend the Relay" pads are the worst ones:**

- Pad 15 and pad 8, next to the core, see only **8.4 / 12.7 tiles** of path at range 4.5 (lanes are 40–41 tiles long).
- Pads 3, 4 and 13 see **both lanes** (18 / 14.6 / 14.1 tiles). Pad 12 sees 16.5 tiles of the south lane.

Once you know this, placement is solved. Placing the same six towers four ways (`K51`–`K54`) gave a narrow band:
8–24 HP, or a loss when one pad moved to the far-north pad 6. A one-tile shift matters less than "did you buy Arcs".

DESIGN's claim that "a build spread mid-map bleeds ~45–95 a night from N4" did not reproduce: spread mid-map ended on
33 HP vs 22 HP for the funnel (`K42` vs `K40`). The real constraint is never pads (16 pads, and I rarely used more
than 9). It is components.

**Fix:**

1. Vary the map: expansion D (layouts per district).
2. Give the near-Relay pads a role: a "Relay pad" bonus of +1 range within 3 tiles of the core, or a third approach that
   only they see.

### 2.3 The late game has nothing to buy

In the real run I entered N5 with **219 Scrap, 1 Circuit, 1 Biofiber** and N6 with **189 Scrap, 0 C, 0 B**
(`KR_35_prep_n5`, `KR_42_prep_n6`).

Every interesting purchase needs components:
- Arc: 2 Circuits.
- Turret L3: 1 Circuit.
- Thorn, Snare and Mortar: Biofiber.

So the only things left to buy were L1 Scrap Turrets at +5 each, and repairs. Rogue Tower and Thronefall always give
surplus currency a meaningful sink.

**Fix:**

1. Add a Scrap-only option to every upgrade path: "Reinforce: +8% damage, 25 Scrap, repeatable 3×".
2. Or a Scrap→component exchange at the Relay (35 Scrap → 1 Circuit, max 2 per night). Hook: `Run.js`, plus a button in
   `DefenseScene._renderFoot`.
3. The active abilities in expansion A double as the late-game Scrap/Circuit sink.

### 2.4 Decisions per night

A typical night is **one tower plus one upgrade, then Start**. With roughly 100 Scrap per day, prep takes 20 seconds and
the wave takes 35–50 s at 2× with nothing to decide. That ratio is the core problem of this mode (§8).

---

## 3. Tower and enemy design

### Towers

**Scrap Turret.** A fine baseline. Its L3 "every 5th shot ×3" is invisible in play: the crit is an orange number among
dozens.

**Thorn Nest.** Its job reads ("fast enemies"), but its range of 3.5 makes it pad-picky. It is fine.

**Arc Spire.** **The dominant pick.**
- Best DPS per Scrap.
- Hits burrowed enemies.
- Energy damage, so the Ruin Guard shield does not apply.
- Only its Circuit cost limits it; nothing in its design does.

Fix: base damage 14 → 11, and make the chain falloff harsher at L1 (0.7 → 0.6). Keep L2/L3 strong, so that an Arc is an
investment rather than a spam unit.

**Snare Vine.** **Secretly the second-best tower,** and the UI says it is the worst.
- Its card shows Power 0, Speed 1, Range 1 (`pips` in `towers.js`).
- Readiness counts it as 6 DPS.
- But 3 Snares + Arcs ended on 53 HP vs 7 HP with Thorns in their place (`K57` vs `K58`).

Fix: give it its own pip row ("Slow ●●○") instead of Power/Speed. In `READINESS` (`src/data/guide.js`), make a snare
multiply the DPS of towers covering the same tiles by 1/(slowMult), not add 6.

**Mortar Pod.** **A trap.**
- 9.2 DPS per target for 60 Scrap + 1 Biofiber; 3–4 damage per Scrap at L3.
- Its card shows **Power ●●●, Range ●●●**, the strongest-looking tower.
- **Its one job, destroying seeds, never happened in my tests.**
  - `K43`: 5 Seed Carriers killed → 15 seedlings spawned.
  - `K62`: 3 → 9.
  - That is 0 blast kills: another tower always lands the last hit.

Fix:
1. **Tag on hit.** A Seed Carrier hit by blast damage in the last 3 s does not burst (set `e.blastT` in
   `DefenseScene.damage`, and check it in `_kill` instead of `killedBy`).
2. Mortar cooldown 2.6 → **1.9**, damage 24 → **28**.
3. Pips Power 2, Speed 1, Range 3.

**Pulse Beacon.** It is only worth building on pad 3 (5 neighbours) or pad 13 (4 neighbours). On pad 4 in `K43` it
buffed two towers. That is a real placement puzzle, which is good. It needs an in-prep preview: when placing it, ring
the pads it would buff (`_showRange` already exists).

### Enemies

**Ruin Guard (N5) is a guaranteed −15 each.**
- In 8 of 8 N5/N6 builds, every Ruin Guard leaked (235–418 HP left of 552 / 575).
- The only kinetic counter is Arcs, and Arcs are Circuit-gated.
- So N5 is decided by "4 × 15 = 60 HP" regardless of what else you built.

**Razorbacks do the same on N2–N4.** They arrive with 32–265 of 252–414 HP and deal 12 each. Five of them leaked in
`K44` (−60).

This is a DPS-check design: the trash barely matters, and tanks decide the night.

**Fix:**
1. Give tanks a counter you can build:
   - The Turret L3 "Piercer" branch, which ignores resist and deals +50% to size ≥ 1.0.
   - The Snare L3 root working on tanks for 0.5 s.
2. Lower Ruin Guard HP 230 → 190 and keep kinetic resist 0.5.
3. Lower `coreDamage` from 15/12 to **10/9**, and move that threat into *ranged* pressure (Spitters), which the player
   can answer by placement.

**Seed Carrier:** mechanically broken (above).

**Spitter:** good. It plants 5.5 tiles out, shows a visible wind-up line, and lobs 8 × 2 damage, which punishes
uncovered approaches. It gave 6–30 Relay damage per night.

**Burrower:** good and readable. Dirt mounds show where it is (`K71_1x_12`), and it creates a real "need Arc or Snare"
pressure.

**Skitter:** a fine filler.

---

## 4. Readability: can you see why you lose HP?

**1. The south lane runs under the canopy.**
- About a third of it (tiles x 13–20 at y 14, plus x 0–5 at y 13) is drawn *behind* the foreground trees at
  `defenseMap.trees` [9,16], [14,16], [17,16], [6,16], [3,16] and the border trees.
- Enemies there show as red dithered x-ray blobs (`Kz_south_occluded`, `K70_1x_24`).
- **The Colossus fights its decisive charge there** (`Kz_boss_under_tree`): the boss reads as a red mosaic behind a trunk.

Fix: in a TD, no billboard may ever overlap a lane tile.
- Delete or move those trees.
- Cap `borderTrees` height on the south margin.
- Add a check in `DefenseGround` that rejects any tree whose card covers a lane tile (height × 0.7 rule).

**2. Enemies x-ray each other.** Razorbacks walking abreast trigger the occlusion silhouette on each other: a red dither
slab over half the pack (`Kz_north_stack`). Occlusion silhouettes should only fire for scenery, never enemy-on-enemy or
tower-on-enemy.

**3. Towers are about 1 tile; enemies are 1.5–2.5 tiles** (`Kz_scale_n4`).
- Tower art is 32×48 frames (`public/sprites/scrap_turret.png` 128×48).
- The PixelLab Razorback is about 80 px long, and a Spitter is taller than an L3 turret.
- The "LEVEL 2" pop text is bigger than the tower.
- **Critic G #12 is not fixed.**
- There are also two level indicators: the chevrons and the amber pips on the plinth.

Fix: 48×64 tower art (1.5 × 2 tiles) on a 1.5-tile plinth, and drop the plinth pips (keep the chevrons). The pads are
≥ 2 tiles apart except 10/11 and 13/14; move 11 and 14 by one tile.

**4. 1080p is not pixel-exact.** At 1920×1080 the night is shown at 1.5× stretch: `Game._layout` takes the stretch path
because 1280×720 ×1 fills only 44% < `minIntegerFill`. Texel widths alternate between 1 and 2 px on outlines
(`Kz_1080_pixels`). This contradicts the CLAUDE.md rule.

Fix: at k = 2 windows, render 960×540 internal. Trim the field to 26 tiles by cutting the 4 walk-in tiles on the left
(lane starts at x = −1), and narrow the side panel from 232 to 180 UI units. Otherwise accept the stretch only below
1080p.

**5. Nothing tells you what hit the Relay.**
- Leaks just vanish into a red flash and a "−12".
- The end banner says only "Relay 21 / 125".
- During the wave, half the side panel is empty (`K40_n4_typ_w045`).

Fix: a **leak feed** in that empty panel ("−15 Ruin Guard · South"), and a breakdown on the survived banner ("Leaked:
4 Ruin Guards −60, 2 Burrowers −12, Spitter sap −20"). The data is already in `enemyReachedCore` and `spitAtCore`.

**6. The readiness meter is wrong in both directions.** `_readiness()` sums DPS × seconds vs wave HP. It ignores lane
coverage and undervalues slows.

| File | Meter said | Actual result |
|---|---|---|
| `K23` (one lane undefended) | Looks strong | −52 HP |
| `K30` | Risky | **Lost** |
| `K22` | Strong | Flawless |
| `K62` | Strong | **Lost** |
| `K57` (best N5 build) | Lower ratio than `K58` | `K57` ended 46 HP higher |

From N3 on, almost every build reads "Risky: the Relay may take some damage", whether it ends on 53 HP or loses.

Fix:
1. Compute readiness **per lane** using each tower's covered path length (`cover.mjs` logic) × DPS ÷ that lane's HP.
2. Add tank checks: "can kill a Ruin Guard before the Relay?"
3. Count slows multiplicatively (above).
4. Calibrate the thresholds against a batch of these sims, and show "North: strong · South: none" in `_renderFoot`.

**7. Minor: the pixel font turns "97%" into "37%"** on the orange wave bar (`Kz_prog`). Use a dark outline or the larger
font there.

---

## 5. The UI under real mouse use

**1. The 2× button is off-screen** at 1280×720 and 1366×768 whenever all four currencies show during a wave.
- Measured `.df-ctrl` 2× at x = 1298–1338 in a 1280 px viewport, and 1342–1385 at 1366 (`K06_topbar_1280`,
  `Kz_run_topbars`: N1, N2 and N5 rows).
- F still works, but the button doesn't.

Fix: drop the "WAVE" label and shorten the resource chips in-wave (icon + number), or move speed/pause into the side
panel header.

**2. The build hint eats pad clicks.** After building on pad 14, the "click a glowing square" hint is repositioned
(`_padHintSpot`) on top of pad 7. My click on pad 7 hit `div.hint.ui-block` and only dismissed the hint
(pointer trace in `repro7b.mjs`, `K05_repro7`). A newcomer clicks twice and wonders why.

Fix: give hints `pointer-events: none` except their close ×, or position the hint so its rect excludes every pad's
screen box.

**3. The build list shows 2.5 of 4 cards at 720p, and 2.5 of 6 with unlocks** (`K03`, `K71_buildlist`). Snare (the 4th)
and Mortar/Beacon need scrolling.

Fix: a compact 2-column card (icon, name, cost, pips) that fits 6 cards in about 420 px, with the line on hover. Or show
the build list as a radial menu at the pad, as in Kingdom Rush: the pad is where your eyes are.

**4. The single-tower panel overflows at 720p.** "Sell" sits under the fold, and arming sell scrolls the header text
half-off (`K71_sellarmed`, `K70_towerpanel_L2`).

Fix: put Upgrade and Sell side by side as half buttons.

**5. Exact numbers live only in native `title` tooltips.** They take about 1 s to appear and are unstyled. Show them in
an in-game tooltip, or on the card on Shift.

**Good:**
- Range preview on card hover.
- The tower name tag on hover.
- The sell confirm with a timer bar.
- The weak-defense "Start anyway" double press.
- Esc deselects first.
- Number-key builds on a selected pad.

---

## 6. Pacing and tension within a night

Every night is a single wave with the same shape (samples in `*_samples.json`):

1. **Walk-in: about 25–30 s of nothing.** Crawlers take 27 s to walk a 40-tile lane, and a Relay-funnel build doesn't fire
   for the first ~15 s.
2. **The crush: 8–10 s.** On N3, 18 crawlers arrive 9 + 9 at 1.0 s gaps. **66 of the 78 HP lost on N3 fell between
   t = 31 and 40 s.**
3. **The tail: 20–35 s** of 1–5 tanks walking (N3 t = 56–91, N4 t = 73–93).

So roughly 60% of each wave is watching with nothing at stake. With 2× as the maximum speed, that is 25–30 real seconds
per night of waiting.

The **difficulty curve is lumpy**:

| Step | What happens | Evidence |
|---|---|---|
| N2 → N3 | Cliff | Same 5 towers: 100 → 22–33; HP ×1.4 → ×2.3 and 19 → 33 enemies |
| N3 → N4 | Easier | Health multiplier dips to ×2.05; the real run lost 0 on N4 |
| N5 | Tank tax | The Ruin Guards |

**Fix:**
1. Smooth `HEALTH_MULT` to **[1.0, 1.4, 1.8, 2.1, 2.35, 2.5]**.
2. Spread N3's opening crawlers over 2 groups per lane (5 at t 0, 4 at t 10).
3. Add a **3× speed** (`DEFENSE.speeds = [1, 2, 3]`).
4. Add **mid-night pushes** with build lulls (expansion B), which turn the dead walk-in and the tail into decisions.

---

## 7. The boss (Night 6)

**Good:**
- The Colossus art (a bark golem with a red heart).
- The ☠ lane-entry tag.
- The boss bar with phase text ("Winding up a charge!", "ENRAGED — roaring!").
- The enrage beat, which reads clearly: a red double ring, an orange tint and shake (`K60_n6_typ_boss_roar_76`).

**Bad:**

**1. The first ~40 s happen out of reach and out of sight.**
- It enters on the south lane behind the bottom-left canopy (`Kz_boss_entry`).
- Its first root and charge (t = 16–22) happen at 12–16% of its lane, where no pad reaches and the "red path" telegraph is
  hidden under trees (`K60_n6_typ_boss_charge_21`).
- In `K60` it had all 2550 HP at 46% of its route.

**2. It is effectively unkillable.** It reached the Relay in **every** N6 I played:

| Build | Boss HP on arrival | Relay damage |
|---|---|---|
| Typical (`K60`) | 1006 | −25 |
| Typical + skills (`K63`) | ~1000 | −29 / −30 |
| Rich (`K62`) | 28 | −15, which ended the run |
| 14 towers on every pad (`K65`) | ~550 | −20 |
| Real run | — | −22 |

DESIGN intends this ("gets ~96% of the way"), but it makes the climax a fixed 15–30 HP tax with no kill moment. The
boss-death juice (slow-mo, flash, multi-burst) is practically unreachable.

The Results screen still says **"The Canopy Colossus is down"** after it walked into the Relay (`KR_45_results`).

**3. The Boss tip is a trap.** Setting the boss lane to Toughest (hint `def_boss_target` and the preview line) pulls every
tower off the support wave. Relay left: **45 / 46 with First vs 4 / 9 with Toughest** (`K63` vs `K64`, run twice).

**4. There is no counterplay to its telegraphs.** "It roots and spawns Crawlers" and "it charges along the red path" are
announced, but you can do nothing about either. The telegraph is pure information.

**Fix (`enemies.js` colossus, `DefenseEnemy._bossUpdate`, `DefenseScene`):**
1. **Make it a siege, not a leak.** At `lane.total − 2.5` it stops on the plaza and slams the Relay for 5 every 3 s until
   killed (max 8 slams). Every Relay-side tower then gets a 10–25 s window, and the night always ends with a kill.
2. Lower the N6 boss HP to 1020 × **2.2** (= 2244), with enrage `damageTaken` 0.85 → **1.0**. Target: a typical build kills
   it on the plaza in ~10 s; a strong build kills it at 70–85% of its lane.
3. Delay its spawn from `at: 8` to **`at: 14`**, so its first root happens on-field near pads 9/10/11.
4. Rewrite the tip: "Set *one or two* towers deep on the south path to Toughest; keep the rest on First in line."
5. Let the Vine Snare ability (expansion A) **cancel the charge wind-up**: the telegraph becomes a skill check.
6. Make the Results text conditional: "The Colossus is down" only if it was killed; otherwise "The Relay held the
   Colossus off."

---

## 8. Player agency during the wave

During a wave you can change targeting, pause, switch 1×/2×, and use Emergency Patch (if picked). That is all.

| Game | What the player does during a wave |
|---|---|
| **Kingdom Rush** | A movable hero, two cooldown spells (reinforcements and rain of fire), building between waves, and "call early" |
| **BTD6** | Abilities on towers and heroes |
| **Thronefall / Dome Keeper** | You fight with your own character during the night |
| **This game** | Nothing |

Verdant Relay already has a playable scavenger with a machete, and at night the scavenger disappears. For a game whose
pillar is "scavenge by day, hold by night", the night needs at least one verb. That verb should also spend the Scrap and
Circuits that pile up late (§2.3). Expansions A and B below are the concrete proposals.

---

## 9. How nights feed back into the run

What carries over:
- **Relay HP.** Repair costs 25 Scrap per 15 HP. After N5 (21/125) the real run spent 75 Scrap, three-quarters of a day's
  haul, to get back to 66.
- **Bounties:** +13–39 Scrap per night.
- **Research:** +10 per night.

What doesn't exist:
- No reward for a clean night.
- No choice after a night.
- No effect on the next day.

The night is a pure gate, so a flawless night and a 1-HP night play out the same afterwards.

**Fix:** a post-night **salvage pick (1 of 3)** on the survived banner, scaled by Relay HP lost:
- ≤ 10 lost → 3 good options.
- ≤ 40 lost → 2 options.
- Otherwise → 1 option.

Example options: +1 Circuit + 1 Biofiber; a free L2 upgrade; "Tower mod: +15% range for one tower"; +20 Relay HP. Plug
into `DefenseScene._endNight` → `run.nightSurvived`, with the choice stored in `run.tonight` for the next prep.

---

## 10. Past complaints, rechecked

| Complaint | Status |
|---|---|
| Critic G #12, towers ~1 tile and night like a TD grid | **Partly.** The plinths are varied and off-grid, which is good. Towers are still 32×48 and dwarfed by PixelLab enemies |
| Newcomer #13, a readiness check before Start | **Present but miscalibrated** (§4.6) |
| Newcomer: no Decrypt/Sabotage/Repair before they're usable | **Fixed** (hidden until relevant, `KR_35_prep_n5`) |
| Newcomer: SCR/CIR codes | **Fixed** (icons and words) |
| Newcomer: stat soup | **Fixed** (pips), but the pips mislead (§3) |
| Night-survived click-through (G #12) | **Fixed.** The banner waits for a click. In 5 banner → briefing transitions, a click at (640, 400) never preselected a card (`KR_09_briefing_n2`: "Pick an area first") |

---

## 11. Scores (1–10)

| Axis | Score | Why |
|---|---|---|
| **Strategic depth** | **4** | 1–3 purchases a night. Wide L1 dominates and upgrades are a trap. One solved placement on one static map. Late Scrap has no sink |
| **Readability** | **5** | Good preview, lane tags and boss bar. Tiny towers, a lane under the canopy, enemy-on-enemy x-ray mush, no leak report, a wrong readiness meter, and 2× off-screen at 720p |
| **Tower / enemy design** | **5** | Six clear roles on paper. Arc dominant, Mortar a trap whose seed mechanic never fires, Snare hidden-strong, Ruin Guard/Razorback guaranteed leaks. Burrower and Spitter are good |
| **Player agency** | **2** | Only targeting during a 70–100 s wave |
| **Pacing / tension** | **4** | One wave a night: a 25 s walk-in, a 10 s crush, a 25 s tail, 2× max. Lumpy curve (N3 cliff, N4 dip, N5 tank tax) |
| **Boss** | **4** | Great art and a great enrage beat. Hidden and out of range for its first act, unkillable, the tip hurts, no counterplay, and the victory text lies |

---

## 12. Top 12 fixes (most impactful first)

### 1. An active verb during waves (expansion A: Relay Protocols)

Add two cooldown abilities on hotkeys Q and W, with buttons in the empty in-wave side panel.

**Vine Snare (Q):**
- Free. Click a lane point.
- 0.4 s green telegraph ring (r 1.6), then roots non-boss enemies for **2.0 s**.
- The Colossus is rooted for **1.0 s**, and if it is in `chargeWind`, the charge is **cancelled** (back to `approach`).
- Cooldown **28 s**; 1 charge on N1–3, 2 charges from N4.

**Arc Discharge (W):**
- Costs **1 Circuit + 10 Scrap**.
- 0.6 s telegraph, then **40 + 20 × night** energy damage in radius 1.4.
- Cooldown **18 s**.

**Plug points:**
- New `DEFENSE.abilities` in `src/data/waves.js`.
- `DefenseScene._handleInput`: KeyQ/KeyW, aim with `game.mouseOnPlane(this.camera)`.
- Cooldowns ticked in `_step`.
- Effects reuse `fx.telegraph`, `e.applyRoot`, `scene.damage`.
- New `DefenseEnemy.interruptCharge()`.

**Target:** 6–10 meaningful clicks per night.

### 2. Make upgrades the good buy, and L3 a choice (expansion C)

Apply the L2 numbers from §2.1 and raise the surcharge 5 → 12. Then turn `upgrades[1]` into `branches: [a, b]`:

| Tower | Branch A | Branch B |
|---|---|---|
| **Turret** | "Piercer": damage 22, cooldown 0.6, ignores resist, +50% vs size ≥ 1 | "Repeater": damage 9, cooldown 0.22 |
| **Arc** | "Storm": 5 chains, falloff 0.8 | "Lance": 55 damage single target, 0.25 s stun (non-boss) |
| **Thorn** | "Briar": 40% slow, splash 1.6 | "Hornet": damage 9, cooldown 0.16 |
| **Snare** | Root (current) | "Thorn Field": 10 DPS in range |
| **Mortar** | Napalm (current) | "Cluster": 3 × 14 bomblets in 2 tiles |

Plug points:
- `Run.upgrade(rec, branch)`.
- `rec.branch` added to `Save.validTower`.
- Two buttons in `_renderTower`.
- Sprite key `${type}_3${a|b}`, falling back to `_3`.

**Target:** tall and wide within ±10 HP at equal spend (`K44`/`K45` rerun).

### 3. A boss that can be killed, and a fair finale

Apply the §7 fixes:
- Plaza siege at `lane.total − 2.5`: 5 damage per 3 s slam.
- N6 multiplier ×2.2; enrage `damageTaken` 1.0.
- Spawn at t 14.
- Rewritten tip.
- Charge cancel via Vine Snare.
- Conditional victory text.

**Target:** a typical build kills it in 8 of 10 runs and loses 10–25 HP to it.

### 4. Answers to tanks

- Turret "Piercer" (item 2).
- Snare L3 root applies to size ≥ 1 for 0.5 s.
- Ruin Guard HP 230 → **190**.
- `coreDamage` Ruin Guard 15 → **10**, Razorback 12 → **9**.

**Target:** in `K51`–`K54`, 1–2 of 4 Ruin Guards leak, not 4 of 4.

### 5. Mid-night pushes, with build lulls and early call (expansion B)

- Add `push: 0|1|2` to the groups in `WAVES`: N1–2 get 2 pushes, N3–6 get 3.
- Between pushes, a **12 s lull** in a new phase `'lull'`, where `_build`, `_upgrade` and `_repair` are allowed (their
  `phase !== 'prep'` guards accept `'lull'`). Bounties can then be spent the same night.
- A **"Call next push"** button pays **+1 Scrap per 2 s skipped** (Kingdom Rush).
- Plug: `buildWave` returns push boundaries; `_step` enters `'lull'` when a push is spawned out and cleared.
- This also removes the 25 s walk-in and the tail (§6).

### 6. Clear the lanes of scenery, and stop enemy-on-enemy x-ray

- Remove or move `defenseMap.trees` [3,16], [6,16], [9,16], [14,16], [17,16] and the south border trees.
- Add a `DefenseGround` assertion that no billboard's card (height × 0.7) covers a lane tile.
- Disable occlusion silhouettes when the occluder is an enemy or a tower.
- Evidence: `Kz_south_occluded`, `Kz_boss_under_tree`, `Kz_north_stack`.

### 7. A truthful readiness meter and stat display

- Readiness per lane: coverage-weighted DPS (`cover.mjs` method), slows multiplicative, plus a tank check.
- Calibrate thresholds against these runs.
- Show "North ●●● · South ○○○".
- Pips: Mortar Power 2; Snare gets a "Slow" pip row.
- Evidence: `K23` read strong and lost 52; `K62` read strong and lost; `K57` ended above `K58` despite the lower rating.

### 8. Show why you lost HP

- A live leak feed in the empty in-wave side panel.
- A leak breakdown on the survived/fallen banner.
- A source label on Spitter sap.
- Use `enemyReachedCore` / `spitAtCore` (`DefenseScene` ~L1441 / L1458).

### 9. Fix the Seed Carrier and Mortar

- Blast-tag on hit (3 s window) instead of last-hit `killedBy`.
- Mortar cooldown 2.6 → **1.9**, damage 24 → **28**.
- **Target:** at least 50% of carriers in Mortar range die without seedlings. It is 0% today.

### 10. UI bugs and fit at 720p

- 2× button off-screen (`K06_topbar_1280`).
- Hint eats pad clicks (`repro7b.mjs`).
- Build list: compact 2-column cards, or a radial pad menu, so all 6 fit.
- Upgrade and Sell side by side.
- An in-game stat tooltip instead of `title`.
- Add **3× speed**.

### 11. Map variants per district (expansion D)

Change `DEFENSE_MAP` to `DEFENSE_MAPS[key]`, choose the layout per run seed or from the first district visited, and
store `run.mapKey` (Save validates pads per map). Three layouts:

| Layout | Change |
|---|---|
| **"Crossing"** (Market) | The lanes cross at tile (13, 9). 14 pads; one pad covers both lanes for 20+ tiles |
| **"Ford"** (Flooded) | The north lane is shallow water (×0.85 speed) and merges into the south lane at x = 20 for the last 6 tiles: one big choke, Mortar heaven |
| **"Three Paths"** (Residential) | From N4 a short third lane enters from the top at x = 22 and carries only the district threat. 18 pads |

**Target:** placement is re-solved each run, which delivers the "every run varies" pillar at night.

### 12. Tower scale and pixel-exactness, plus post-night rewards

- Tower art 48×64 on 1.5-tile plinths; drop the plinth level pips.
- Pixel-exact at 1080p: 960×540 ×2 with a trimmed 26-tile field.
- Post-night salvage pick (1 of 3, scaled by HP lost, §9), so night performance feeds the run.

---

## Verdict

The night is a competent, good-looking **lane-watching** mode wrapped in an excellent preview UI. As a tower defense, it
does not yet hold up next to Kingdom Rush or Thronefall.

- **Decisions:** you make two purchases and press Start.
- **The math** rewards spamming level-1 Arcs and punishes upgrades.
- **The enemies:** two types are unconditional Relay taxes.
- **The boss** is a 2550-HP walk-on you cannot kill, whose own tip makes you lose more.

The fixes are mostly data and three new systems:

1. **An active verb** (Vine Snare / Arc Discharge).
2. **Mid-night lulls** with early-call.
3. **L3 branches.**
4. Plus a killable boss siege, truthful readiness and leak reports, and clearing trees off the lanes.

Do those, and the night becomes the "hold the line" half the pillar promises, instead of a 90-second loading screen
between jungle days.
