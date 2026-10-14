# Verdant Relay: Critic N2: foraging, second round (stumps, fruit, fungus, glints)

**Session:** 2026-10-14. I played the frozen build `.playwright-mcp/frozen_r4/` in my own headless Chrome at 1280×720, using the driver `.playwright-mcp/roundN2/driver.mjs` (port 7632). The console showed 0 errors and 0 page errors.

**Files:** screenshots and helper scripts are in `.playwright-mcp/roundN2/`. New scripts this round:
- `play.js`: a "normal player" day policy. It follows the coach or goal, opens crates it passes, and takes forage within a detour radius.
- `track.js`: an in-page tracker for what reached the screen and what was taken.
- `occl.js`: a with/without-sprite occlusion test.
- `fung.js`, `fruit.js`, `glint.js`, `cutglint.js`, `lair.js`, `podtest.js`, `geo.js`, `prox.js`.

**What I played:**

| Day | URL / route | Notes |
|---|---|---|
| Guided day | Title → New Run → Head out (Overgrown Market, power cell) | Coach route, goal, home: 104 s |
| Greenhouse | `?debug=explore&district=canopy_greenhouse&night=2&seed=4242` | Hands-on tests (real LMB/RMB/E/WASD), then a full policy day |
| Flooded | `…flooded_transit&night=3` | Daylight and dusk glints, real-input hack to a glint |
| Residential | `…collapsed_residential&night=3&seed=777` (rain) | Policy day, lair test, rain glint |
| Data Center | `…data_center&night=4` | Full 285 s policy day in god mode, to measure exposure over a whole day |

**Code read:** `Forage.js` (all of it), `JungleGen.placeForage` (`JungleGen.js:744–812`), `chunkCards` (`JungleWorld.js:822–857`), `meleeHit` and `_updateInteract` (`JungleScene.js:820–870`, `:1739–1785`), the `FORAGE` table (`jungle.js:263–297`), `Fx.flash`, the `Ambience` header, and the `audio.js` keys.

---

## 0. Verdict

**Day feel: 6 / 10** (round 1: 5/10).

The user's complaint is fixed:
- Every stump on screen now has a reason to exist.
- No stump pops in.
- No stump is walk-through.

All three features work and give the right feedback on the first try. But on a normal route they are **thin**:
- A 100-second day meets about 1 fruit bush, 1 fungus stump and 0–6 glints.
- A glint usually pays **1–3 Scrap**.
- Fruit only matters at the moments you're hurt, and then you can't find any.

Foraging now *exists*. It does not yet *change how you walk*.

---

## 1. Stumps: is the complaint fixed?

**Yes.** Measured on greenhouse seed 4242 (`world.objects` by type):
- **26 `rock:stump*` (all `fungus: true`), 0 plain stumps, 19–24 logs.**
- 0 `fol_cut_stump` cards: the cut branch in `chunkCards` (`JungleWorld.js:833–836`) now only drops leaf litter. Over 154–717 cut tiles per policy day I never saw a sawn stump appear.

The fungus stump itself:
- **Solid:** walking into it stopped me 0.52 tiles short of its anchor (`fung.js`: z 53.68 → 52.02).
- **One real LMB click on the fungus:** Biofiber +2 in the Greenhouse (×2), stamina −2 (plant price, not creature price), and a wet `splat`, a green/tan chip burst and a light hit-stop. The sprite swaps to `prop_stump_bare` (`C1_before.png` → `C1_after.png`).
- **The first-time hint** "Hit the fungus with your machete for Biofiber" shows inside 1.6 tiles with no E keycap (`B01_fungus0.png`). It's good.
- **At a glance:** in open light the orange shelf is clearly the "thing" on the stump. `H2_glint_day_0.png` (right edge) is the best example: a stump with orange fungus beside a trail, next to a fruit bush, readable from 8 tiles.
- **Spent state:** `prop_stump_bare` keeps dark-brown scars where the shelf was. It reads as "taken" up close (`Z_lookalikes.png`: stumps 1–3).

**Remaining problems:**

1. **The fungus floats when the stump stands under canopy** (`D_stump_pair.png` right, `D_c2_zoom.png`).
   - Under a fig's shade the stump body is crushed to near-black, while the light orange shelf stays bright. You see an orange shelf hanging in the dark next to aerial roots. Hiding the sprite proves the stump *is* drawn, just invisible (`D_c2_hidden_z.png`).
   - It's still harvestable, but the stump no longer reads, so "hit the stump" isn't learnable there. This shares a cause with P1-2 below (placement under trees).
2. **Some stumps are hidden outright.** From 4 tiles south, **≈4 of 26** stumps were invisible or nearly so (`G_occ_montage.png`, bottom row). The causes are a tree canopy in front (#11, #20) or a giant fern card (#9).
3. **Look-alikes that still lie** (`Z_lookalikes.png`):
   - **`fol_log`: 19–24 per jungle, each with three pale bracket fungi baked into the sprite.** Logs are deliberately not hosts (`logHosts: 0`), and the 140-scatter now turns every former stump into a log. So the "fungus that does nothing" moved from stumps to logs, at about the same count.
     - It's less loud than before: the fungi are pale tan, not orange, and logs sit off trails.
     - It's still the exact promise the user complained about. **P2-7.**
   - `fol_mushrooms` is down to 3% of fern tiles (`JungleWorld.js:841`). That's fine.
   - `dec_mushrooms_white` and `dec_berries` decals still appear (`H2_glint_day_0.png`: a white mushroom pair beside the player). They're small and flat, and nobody will mistake them for the fruit bush. OK as is.
   - The fruit bush (42×34, bright orange) is the most distinct sprite in the set. No look-alike competes with it (`fol_bush_flowering` is pale-dotted green).

---

## 2. Each feature

### 2a. Wild fruit (+15 health, hold E 0.8 s)

**Discoverability: good.**
- Bright orange on teal is the most saturated small object in the jungle (`H2_glint_day_0.png`, left; `B01_fungus0.png`, top).
- The prompt "Hold: Eat the wild fruit (+15 health)" teaches itself.

**Feedback: good.**
- The `med` chime, "+15 Health" in big green text, an orange/green burst, and the bush going bare (`E3_hold.png`).
- At full HP the toast is "You are not hurt: the fruit will keep. Come back when you are." It's throttled to one per 2.5 s and the bush is kept (`E2_hold.png`).

**Frequency (`track.js`: a bush counts as seen once it is on screen):**

| Day | Length | Fruit seen | Eaten | HP |
|---|---|---|---|---|
| Guided | 104 s | 1 | 0 (full HP) | 100 all day |
| Greenhouse n2 | 103 s (died) | 2 | 1 at 60 HP | 100 → 0 |
| Residential n3 | 116 s (died) | **0** | 0 | 100 → 0 over 25 hits |
| Data Center n4 (god) | 285 s | 9 | (would eat) | — |

**Geometry (4 worlds, `geo.js`):**
- The median container is **13–15 tiles** from its nearest bush (p25 6–9, p75 19–23).
- Only **42–48%** of trail tiles are within 8 tiles of a bush.
- Today's goal sat 5.3–12.5 tiles from the nearest bush.

**So the bush you need is usually out of sight when you need it.**

**The core design problem:** the fruit is worth something only after you get hurt, and getting hurt happens at sites (crates, goal guards, spore pods). Bushes aren't at sites, and nothing remembers where you saw one. Round 1 promised: *"bushes are landmarks you learn on a persistent map ('there's fruit by the river ford')"*. Without any memory aid, a new player cannot learn 33 landmarks spread over 37,000 tiles. → Rec. 2.

**Bugs:**
- **P2-3, near-full eat:** at 99.7/100 the bush is used up for "+0.29999999999999716 Health" (`E1_hold.png`).
  - Fractional HP is debug-only in practice: `hurt()` and bleed round. But the same code spends a whole bush at 98/100 for +2, while the prompt promised +15.
- **P2-4, full-HP prompt:** at full HP the prompt is still a *hold* with a filling amber ring, "Hold: Eat the wild fruit (you are not hurt)". You hold for 0.8 s to be told no (`E2_hold.png`).

**Exploits:** none found.
- Bushes are 12+ apart and ≥ 10 from lairs, and none were within `siteGap` of a goal prop on the days I checked (`busySkipped 0`).
- Only one bush (greenhouse, 2.2 tiles) sits near a crate. The crate wins the prompt (rank 2 < 3; the point-blank override needs 0.8 tiles plus a 0.6 lead). That's correct.

### 2b. Shelf fungus (Biofiber, hit with the machete)

**Discoverability: good** where the stump is lit.
- The no-key hint closes the loop on the first stump. Hitting things is already the verb.

**Feedback: good.** The wet splat, chips and hit-stop feel like breaking something off.

**Frequency:**

| Day | Fungus seen | Taken |
|---|---|---|
| Guided | 1 | 1 |
| Greenhouse | 1 | 1 |
| Residential | 0 | 0 |
| Data Center (285 s) | 6 | 5 |

**The reward is felt more than any other forage.**
- On the Data Center day, fungus gave **5 of the 7 Biofiber** carried home.
- On the guided day it was the **only** Biofiber.
- Biofiber is the scarce tower currency, so 1–2 a day changes a night (a Thorn Nest, a Snare Vine).

**Stamina:** −2 per harvest swing, as specced. `meleeHit` skips `forage` before `hits++` (`JungleScene.js:837`), and `ExploreShots` ignores it (`:176`, `:411`). Correct.

**Spore pods:** the nearest host-to-pod distances were 3.0–4.2 (`prox.js`, `sporeGap 3` honoured). With a pod 3.0 tiles away, I stood on the pod's side and heavy-chopped the stump. The pod stayed un-armed (`podtest.js`). No bug.

**Bug P1-1 (new): fungus stumps inside boss lairs.**
- The fruit has a `lairGap` of 10 (`JungleGen.js:804`); the stump loop (`:784`) has none.
- Measured distances from a lair:
  - Residential seed 777: 2 stumps, at **5.0** and 8.1 tiles;
  - Greenhouse seed 4242: 5 stumps at 7.2–9.2;
  - Data Center: 2, at 7.2 and 8.1.
- BOSS `aggro` is 6.5 and `clearProps.radius` is 10 (bosses.js:42, :57).
- **Repro:** I walked up to stump #13 (60.5, 172.5) to harvest it. The **Brood Hive woke** (`engaged: true`) and its title card came up (`O1_fungus_in_lair.png`).
- J2 §4 moved every crate out of lairs for exactly this reason. A "harmless" forage node that starts a boss fight is worse than a crate doing it.

### 2c. Glints in the brush (cut the plant → Scrap)

**Discoverability: weak.**
- The sparkle is a 7-texel gold star that lives **0.12 s every 1.6–2.6 s**, which is a ~6% duty cycle (`jungle.js:293–294`). It shows only within 8 tiles.
- In daylight it reads when you happen to be looking there (`H2_glint_zoom.png`: the left frame missed it, the right frame caught it). It draws over canopy correctly (depthTest off).
- **At dusk** it competes with fireflies: yellow-green 1–2 px blinks all over the screen (`H1_glint_0.png`, `H3_glint_dusk_1.png`). The star shape still wins on close inspection.
- **In rain** it's nearly gone: a faint cross among white rain streaks (`H4_glint_rain_0.png`, top-right of the player).
- **No sound.** That's correct for not using `glint` (the wind-up cue), but it means there's nothing to turn your head.

**Feedback on reveal: OK, but the payoff is undersold.**
- A gold burst, the generic `pickup` blip, then "+1 Scrap" (`I1_spill.png`).
- The first-reveal toast "Something shiny was hidden in the brush: watch for the glint" is a good line.

**Value: this is the real problem.**
- `scrap {thicket:[2,4], bramble:[4,7]}` × the area's Scrap × the distance multiplier (0.45–0.9). Live distribution on flooded n3:

  | Type | Amounts (count) |
  |---|---|
  | Thicket | 1 (4), 2 (11), 3 (16), 4 (5) |
  | Bramble | 2, 3, 5, 5 |

- **The mean is ~2.7 Scrap per glint, and 1 Scrap is common.** A crate on the same tile pays 4–9 × the same multipliers.
- Hacking into a thicket (noise, stamina, a detour) for "+1 Scrap" teaches the player to ignore glints.

**Frequency:**

| Day | Sparkles on screen | Distinct glints seen | Taken | Scrap |
|---|---|---|---|---|
| Guided | 0 | 0 | 0 | 0 |
| Greenhouse | 67 | 6 | 3 | +6 |
| Residential (rain) | 9 | 1 | 0 | 0 |
| Data Center, full day | 57 | 10 | 4 | **+11 of 240 carried (4.6%)** |

Round 1 forecast "+10–15 Scrap for the median player". Measured: **+0 to +11**, with +11 only on a full-length, perfect-pathing day.

**Wasted budget (P2-6):** 6/35, 11/54, 12/47 and 9/40 glints sat in the 8-tile map-edge band. The edge is reachable but dark-vignetted, and no route goes there (`R1_edge_glint.png`). That's **~20% of each day's glints spent where nobody looks.**

**Remote reveals (P2-5):** `world.onCut` fires for every cutter (`JungleWorld.js:450`), as intended. But `_onCut` also plays the reveal sfx and spends the **one-per-run "Something shiny…" toast** (`Forage.js:184–189`) when a Feral or Razorback 20 tiles away happens to cut a glint. The player gets a toast about nothing they saw, and never gets it for their own first find. The Scrap spilling there for the player to stumble on is fine and funny.

**Glints near trails:** the code skips any glint within 2 tiles of a trail or site tile (`Forage.js:157–162`), and none of the 25+ glints I inspected broke that.

---

## 3. Economy vs round 1 (carried home, comparable days)

| | Round 1 (frozen_r3) | Round 2 (frozen_r4) |
|---|---|---|
| Guided day | 192 s (human-paced bot): 33 Scrap, 0 Biofiber, 2 Intel, +20 goal; **−30 HP, no way back** | 104 s: 27 Scrap, 1 Circuit, **1 Biofiber (fungus)**, 2 Intel, +20 goal; 100 HP all day (1 bush seen, not needed) |
| Mid day, bot loot spree | flooded n2: 71 Scrap by t=98 | greenhouse n2: 71 Scrap + **6 Biofiber** (2 from fungus) by t=103; **+6 Scrap from 3 glints; +15 HP from 1 bush at 60 HP** (the bot still died to Spitters at t=103) |
| Full day (god) | not measured | data center n4: 240 Scrap (+11 glints), 7 Biofiber (**+5 fungus**), 11 Circuits, 4 Intel |
| HP in the field | med kits, cistern, relics | + fruit: **1 bush eaten in two hurt days** (0 seen on the residential day, while going 100 → 0) |

**Net effect:**
- **Biofiber +1–5 a day** is the real economic change, and a good one.
- **Scrap +0–11 a day** is below the forecast, and too small to feel.
- **HP:** fruit rescued nothing on the two days the bot needed it.

The bots die to Spitters regardless, so I don't claim a death-rate change either way.

---

## 4. What is still flat

1. **The walk.** About 40% of a day is still walking between dots. Forage sits in a band beside trails, but routes go site to site, and a hacking player cuts straight lines (154–717 tiles cut per policy day). Forage is placed where nobody is heading.
2. **Nothing asks you to stay.** Glints and fungus are the same at noon and at dusk. Round 1's rank-4 dusk bloom is still the only idea that ties forage to the day's clock.
3. **The fruit loop has no memory.** "Eat now or come back after the fight" only works if you can find the bush again.

---

## 5. Bugs, with exact fixes

### P1-1: fungus stumps can stand inside a boss lair (walking up to harvest one wakes the boss)

`src/world/JungleGen.js:784` (stump loop). `lairs` is only built at `:794`, after the stump loop.

```js
// move up, above the stump loop (before :780):
const lairs = (world.lairs || []).map((i) => world.sites[i]).filter(Boolean);
// :784
if (!farFromHosts(o.x, o.z) || !stumpOk(o) || nearSpore(o.x, o.z, F.sporeGap)
    || lairs.some((s) => Math.hypot(o.x - s.x, o.z - s.z) < F.lairGap)) continue;
```

Add `lairGap: 10` to `FORAGE.fungus` (`jungle.js:279`), the same as fruit and as `BOSS.clearProps.radius`, then delete the duplicate `const lairs` at `:794`.
- **Test:** `prox.js` on seeds 4242 and 777 plus the Data Center → `fungusNearLair` is empty.

### P1-2: fruit and fungus placed under tree canopies (invisible until you're on top of them)

**Measured** (`occl.js`, viewed from 4 tiles south, `G_occ_montage.png`): fruit #4 fully hidden and #6/#19/#26 mostly hidden; fungus #11/#20/#23 hidden and #9 behind a fern.
- That's about 4/30 bushes and 4/26 stumps (`F1_ripe.png`: a bush under a fig, not visible at all).

**Fix:** `placeForage` (`JungleGen.js:744`). Build once:
```js
const trees = world.objects.filter((o) => o.kind === 'tree');
const underCanopy = (x, z) => trees.some((t) => t.z > z && t.z - z <= FORAGE.canopy.depth && Math.abs(t.x - x) <= FORAGE.canopy.half);
```
- Reject a candidate when `underCanopy(px, pz)` in the fruit loop (`:803`) and when `underCanopy(o.x, o.z)` in the stump loop (`:784`).
- Data: `FORAGE.canopy = { half: 2.2, depth: 4.5 }`. Trees are ~150×150 px, so a canopy covers ~2.3 tiles each side and ~4.7 tiles north of the trunk.

This also fixes the floating fungus in deep shade (§1.1).

### P2-3: fruit spends the whole bush for a sliver, and the text shows raw floats

`src/entities/Forage.js:51, :60, :77`.
```js
// :60
const h = pl.dead ? 0 : Math.floor(Math.min(R.heal, pl.maxHp - pl.hp));
// :51 verb
verb: () => { const m = Math.floor(sc.player.maxHp - sc.player.hp); return m < 1 ? 'Wild fruit: it will keep until you are hurt' : `Eat the wild fruit (+${Math.min(R.heal, m)} health)`; },
// :77
sc.fx.text(pl.pos, `+${Math.round(h)} Health`, …)
```
The prompt then tells the truth ("+2 health"), and the player decides whether to waste the bush.

### P2-4: at full health the fruit prompt is a 0.8 s hold that ends in "no"

`Forage.js:update()`: the interactable's `hold` and `noKey` are read every frame (`JungleScene.js:2159–2162`, `:1765`), and `_addInteractable` keeps the object mutable (`:656`). Add:
```js
for (const b of this.fruit) if (!b.done) { const full = sc.player.hp >= sc.player.maxHp - 0.5; b.it.hold = full ? 0 : FORAGE.fruit.hold; b.it.noKey = full; }
```
With `hold: 0`, an E press calls `_eat` at once, which shows the throttled toast. No ring fills for nothing.

### P2-5: a Feral or Razorback cutting a glint far away spends the player's first-glint toast

`Forage.js:184–189`. Make the cue depend on the player's distance:
```js
const near = Math.hypot(tx + 0.5 - sc.player.pos.x, tz + 0.5 - sc.player.pos.z) <= G.show;
if (near) { this.game.sfx.playAt('pickup', tx + 0.5, tz + 0.5); sc.fx.burst(…); }
if (near && !this.seen.glint) { this.seen.glint = true; sc.toast(…); }
```
Keep the Scrap spill unconditional.

### P2-6: ~20% of each day's glints are in the dark map-edge band

`Forage.js:149`: change the loop bounds to `for (let tz = G.edge; tz < W - G.edge; tz++) for (let tx = G.edge; tx < W - G.edge; tx++)`, and add `edge: 8` to `FORAGE.glint`.
- If you want the per-day count to stay the same, raise `chance.thicket` from 0.003 to 0.0035.

### P2-7: `fol_log` still carries baked bracket fungus that can't be harvested (19–24 per jungle)

**Art:** repaint `public/sprites/fol_log.png` with the three pale shelves turned into moss tufts (greens from the log's own ramp), via a pixel-art-studio build script in `pixel-art/forage/` (same group). Re-run `merge_manifest.py`.
- No code change: logs stay inert, and now look it.
- Optional: keep the old art as `prop_log_fungus` in case log hosts come back.

---

## 6. Recommendations (at most 3, small, simple)

### Rec 1: Make a glint worth turning your head for (value, sound, size)

| Item | Now | Change to |
|---|---|---|
| `FORAGE.glint.scrap` | `{ thicket: [2,4], bramble: [4,7] }` | `{ thicket: [3,5], bramble: [6,9] }`, and add `minAmt: 3` (in `_rollGlints`: `Math.max(G.minAmt, Math.round(roll × scrap × returnYield))`). Mean ≈ 4 per thicket glint, ≈ 6 per bramble. A day of 4 takes ≈ +16. That lands round 1's +10–15 for a full day, and +4–8 for a short one |
| Sparkle | `size 7/32, life 0.12, every [1.6, 2.6]` | `size 9/32, life 0.2, every [1.2, 2.0]` (duty ≈ 12%, twice now); keep `#fee761` |
| Sound | none | New sfx in `src/data/audio.js` (not `glint`, not `windup`):<br>`glint_twinkle: { vol: 0.035, near: 6, gap: 0.3, send: 0.4, layers: [{ w: 'triangle', f: 2637, dur: 0.05, a: 0.005 }, { w: 'triangle', f: 3520, at: 0.045, dur: 0.09, a: 0.005, vol: 0.6 }] }`<br>In `Forage.update`, play `sfx.playAt('glint_twinkle', x, z)` with each sparkle within 6 tiles. A high, soft two-note tink, panned. It's the one thing that makes a player look over in rain and at dusk |
| Reveal sfx | `pickup` | `coins` (already exists, `audio.js:724`): it says "money" |

**Test:** flooded n3 and greenhouse n2 → median `amt` ≥ 3. Sparkles are audible within 6 tiles; standing beside a pod, the twinkle isn't confused with a wind-up (the wind-up stays the low `glint` layer stack).

### Rec 2: The map remembers forage you have seen

Round 1 said "no marker", but its own pitch for fruit was learning the bush by the ford. Measured, the hurt player never finds a bush.

**Rules:**
- Mark only what you have **seen**, never what you haven't.
- Positions are fixed per seed, so the memory persists for the run.

**Spec:**
- In `Forage.update`, once per 0.25 s, any fruit bush or fungus host on screen (|dx| ≤ 10, −5 ≤ dz ≤ 6.5, as `track.js` uses) adds its id to `run.world.forageSeen` (a Set, serialized as an array with the run).
- `JungleMap` / minimap draws seen forage:
  - **fruit:** a 3×3 px `#f77622` dot;
  - **fungus:** a 3×3 px `#e4a672` dot;
  - drawn at 40% alpha when it's used today (`done`).
- No dots for glints: they re-roll daily, so they stay pure discovery.
- One DESIGN line: "The map remembers wild fruit and fungus you've passed."

Cost: about 30 lines and no art. It turns "+15 health somewhere" into "+15 health 20 m north-west". This is the cheapest way to make the fruit loop real.

### Rec 3: Dusk blooms (round 1 rank 4: the forage that asks you to stay)

**Generation:** `placeForage`, `kind: 'bloom'`. **3 per jungle**, in clearings ≥ 30 tiles from the Relay and ≥ 10 from lairs, using the P1-2 canopy check.

**Live:**
- Closed and dull while `DAY.length − dayT > 70`.
- At ≤ 70 s it opens:
  - the visual swaps to `prop_dusk_bloom_open`, which is listed in `EMISSIVE` so the core glows through the dusk veil;
  - within 12 tiles, `sfx.playAt('place_found', …)` plays once.
- Hold E 1.0 s: **+1 Intel and +5 Research**. Use `sfx item_get` and the same text style as the fruit.
- A prompt before dusk: "A bloom, still closed. It opens at dusk" (`noKey`, hold 0).

**Art:** one 32×32 sprite in two states, built in `pixel-art/forage/`.

**Why:** it's the only reward tied to the clock, and it makes "stay out a little longer" a choice.
- With Rec 2, a seen bloom is remembered too (`#2ce8f5` dot).
- The intended reach is the experienced player: the median player can ignore it at no cost.

---

## 7. Screenshot index (`.playwright-mcp/roundN2/`)

| File | Shows |
|---|---|
| `B01_fungus0.png` | Fungus stump on a trail edge, the no-key hint |
| `C1_before.png` / `C1_after.png` | Real-click harvest (+2 Biofiber), the stump stays solid |
| `D_stump_pair.png`, `D_c2_zoom.png`, `D_c2_hidden_z.png` | Bare vs ripe; the fungus "floating" under canopy shade |
| `G_occ_montage.png` | Occlusion test (top: with sprite; bottom: without) for the worst fruit and fungus cases |
| `F1_ripe.png` | A fruit bush fully under a fig canopy |
| `E1_hold.png` | "+0.29999999999999716 Health" and the bush spent |
| `E2_hold.png` | Full-HP hold ring and toast |
| `E3_hold.png` | A proper +15 eat |
| `H2_glint_day_0.png` | The best "it works" frame: a fruit bush and a fungus stump readable beside a trail |
| `H2_glint_zoom.png` | Daylight sparkle, a missed frame vs a caught frame |
| `H1_glint_0.png`, `H3_glint_dusk_1.png`, `H3_glint_dusk_zoom.png` | Glint vs fireflies at dusk |
| `H4_glint_rain_0.png` | Glint in rain, nearly invisible |
| `I1_spill.png` | Real hack-through to a glint: "+1 Scrap" |
| `O1_fungus_in_lair.png` | Harvesting a fungus stump wakes the Brood Hive (P1-1) |
| `R1_edge_glint.png` | A glint in the map-edge band |
| `Z_lookalikes.png` | Forage sprites vs look-alikes (`fol_log` with baked fungus) |
| `K_01.png`, `K_02.png` | Guided day trek |
