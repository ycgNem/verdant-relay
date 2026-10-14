# Verdant Relay: Critic N: the day as scavenging (stumps, foraging, moment-to-moment)

**Session:** 2026-10-14. I played the frozen build `.playwright-mcp/frozen_r3/` in my own headless Chrome at 1280×720, using the persistent driver `.playwright-mcp/roundN/driver.mjs`. The console showed 0 errors and 0 page errors.

**Files:** screenshots `N*.png` and the helper scripts (`hx_src.js`, `go.js`, `lootrun.js`, `beeline.js`, `pop.js`, `solid.js`, `walkstump.js`) are all in `.playwright-mcp/roundN/`.

**What I played:**
- The **real guided day** from the title screen (New Run → Head out), Overgrown Market, power cell. The run took 192 s and banked 33 Scrap + 2 Intel + the +20 goal Scrap (`N12`, `N13_trek_*`, `N20_summary`).
- `?debug=explore&district=canopy_greenhouse&night=2`, used for the stump forensics (`N01`–`N08`).
- `flooded_transit&night=2` (bloom goal), with a bot loot spree and a real-input hack-through (`N21`–`N25`).
- `data_center&night=4` (escort) and `collapsed_residential&night=3` (rain, pumps), used for decal and exposure counts (`N26`, `N27`).

**How it was played:**
- Real keyboard and mouse for all cutting, chopping and walking tests: WASD with LMB held for hack-through, RMB for chop, E to hold.
- Critic F's pathing bot for treks and fights.
- Debug only for teleports, god mode, and completing one goal I wasn't auditing.

**Code read:**
- `JungleGen.js` (placement)
- `JungleWorld.js` (`chunkCards`, colliders, `hitBrush`, `regrow`)
- `FloraAtlas.js`
- `JungleScene.js` (interactables, `spawnPickup`, `meleeHit`)
- `SporePods.js`
- `JungleRelics.js` (the cistern)
- `jungle.js`, `config.js`, `audio.js`, `towers.js`, `crafting.js`

---

## 1. Verdict on the day's moment-to-moment feel: **5 / 10**

The jungle *looks* like a place you scavenge, but you can only scavenge **boxes**.

### What the player does minute to minute (guided day, real input, 192 s)

| t (s) | What I did | Share |
|---|---|---|
| 0–34 | Walk the trail toward the ◆ (nothing to do, nothing to pick up) | 18% |
| 34–129 | Walk to dots, hold E 0.6–1.0 s on 4 crates/chests (30 Scrap). Took 30 damage from something I never saw coming | 49% |
| 129–169 | Walk, hold E 2.5 s on the goal cache, fight 2 guards, hold E on 2 more crates | 21% |
| 169–192 | Walk home, hold E 2 s | 12% |

The same pattern held on the flooded day: 11 containers in ~66 s of day-time, at a "walk → hold E → walk" cadence of about 6 s per box (`lootrun.js` log). **About 40% of a day is walking with nothing to do, and the rest is ten identical E-holds.**

### What's weird, flat or reads wrong (harshly)

1. **Every organic thing in the jungle is wallpaper.** These all look like forage, and none of them can be touched:
   - bracket fungi on the stumps and logs (`fol_stump`, `fol_log`);
   - big brown mushroom clumps (`fol_mushrooms`, on 8% of fern tiles, `JungleWorld.js:838`);
   - berries, seed pods, cogs and bolts (`dec_berries`, `dec_seed_pod(s)`, `dec_cog`, `dec_bolts`: 1,641 decal candidates in one jungle);
   - glowing fungi.

   The only living thing that reacts to you is the spore pod, and it hurts you. **The jungle is all cost** (it slows you, hides enemies, gasses you) **and no yield.**
2. **The machete's best verb pays nothing.**
   - Hack-through is good: 48 tiles in 4.5 s (`hack.js`), and 157 tiles on one flooded day.
   - But a cut tile gives only a shortcut, a stamina tick and noise that draws creatures. Critic I's line still stands: *"my sword is tired from gardening"*.
   - **Cutting should sometimes find something.** At the moment the only thing it "finds" is a stump that isn't really there (§2).
3. **Scavenging is connect-the-dots.** Containers sit at sites and show as dots on the minimap once explored (`JungleScene.js:2051`). There is no searching, reading the land or "is that something?" moment.
   - The one discovery system, the ~34 hidden caches in the brush, works out to **~3–4 seen per day**.
   - The day explores only ~6% of the map in 70 s (about 15% over a whole day: `exploredShare 0.057` on the residential day).
4. **Your health only drains.** In-field healing is:
   - 2 med kits;
   - one glasshouse cistern per run;
   - Blood Moss / Second Wind if you own them.

   Critic J2's median player died on 4 of 8 days. On my guided day I lost 30 HP looting four crates and had no way to get any back short of spending a med kit.
5. **Stamina isn't a forage axis.** It regenerates at 40/s after 0.35 s (`Player.js:148`, DESIGN §4). Any "refill your stamina" plant would be worth ~2.5 s. **Rule out stamina rewards entirely.**
6. **The economy gap is on the day's side.** The sim's typical player banks ~85 Scrap. Critic bots with perfect knowledge bank 61–74 (my flooded spree: 71 by t=98). Real players bank 17–40.

   The gap is *finding* things, and the only things to find are boxes on a map. A forage layer that pays **where real players already walk and cut** is the cheapest way to lift the median without touching the sim's top end.

---

## 2. Stumps: diagnosis

There are **two different stumps**, and they behave in opposite ways. The user's complaint ("they just don't do anything and randomly spawn around the map") is mostly about stump B, and partly about A.

### A. Generated "old stumps": solid, inert, sprinkled at random

**Where:** `JungleGen.js:513–524`. 140 tries scatter `rng.pick(['boulder', 'boulder', 'log', 'stump'])` anywhere in the jungle that isn't trail, site, occupied or mud. Most tries fail the `occupied` test, so you get about **10–13 stumps, 10–16 logs and 22–27 boulders per jungle** (measured: greenhouse seed 10/16/22, residential seed 13/10/27).

**Look:** `fol_stump`, 63×60, a dark mossy stump with **orange bracket fungi** on its side (`N_sprites.png`, first sprite; in-game `N01_genstump.png`, above the player). The fungus says "harvest me".

**Solid:** yes. Its footprint is `SOLID.art.fol_stump [0,-0.35,0,-0.35,0.55]` (`jungle.js:439`). Walking north into it stops me at z = 92.71, 0.52 short of its anchor (`solid.js`).

**Interactable:** no.
- 3 slashes and a full heavy chop into it do nothing (`N08_chop_genstump.png`). There's no sound, no chip, no stamina beyond a whiff, and no loot.
- It isn't in `hittables()` (`JungleScene.js:803–810`) or in `interactables`.

**Exposure:** a whole jungle holds ~10 of them, randomly deep in the brush. After a day I had *seen* 2 (`seen: {stump: 2}`). They're too rare to matter and too random to mean anything: they never mark a clearing, a logging edge or a fallen tree.

### B. Cut-stump pop-ins: a sawn tree stump appears when you slash a bush, and you walk through it

**Where:** `JungleWorld.js:831–835` (`chunkCards`):
```js
if (r < 0.06 && base >= BRUSH.thicket) cards.push({ e: A.pick('cutstump', ...) ... })
```
On **6% of every cut thicket or bramble tile**, the chunk rebuild draws `fol_cut_stump`. It's a **63×48 freshly sawn tree stump with growth rings and sawdust** (`N_sprites.png`, second sprite), as wide as two tiles. Family: `FloraAtlas.js:24`.

**Pop-in:** it's instant.
- One left-click on a leafy thicket (tile 100,106) turns the plant into a pale sawn stump in the same frame as the leaf burst (`N06_07_pop_pair.png`: before, then after).
- On the guided day, the bot's **first 3 cut tiles produced one** right beside the coach's crate step (`N13_trek_5.png`).

**Not solid:** cards from `chunkCards` aren't colliders. Colliders come only from `world.objects` and pylons (`JungleWorld.js:288–290`).
- I walked west straight through one: x 105.89 → 104.81 with no stop (`walkstump.js`, `N04_cutstump_close.png` → `N05_walked_through_cutstump.png`).
- The *dark* stump blocks you and the *pale* stump doesn't. **The game teaches two opposite rules for the same noun.**

**It reads as the most important object on screen.**
- The pale ring top is the brightest, highest-contrast thing in the brush, brighter than a crate. See `N03_after_cut.png` (left), `N25_bee_2.png` (top left) and `N13_trek_5.png`.
- New players will walk up to it and press E.

**"Randomly spawn around the map":**
- It appears on any cut tile, so it also turns up where **you never cut**:
  - Ferals hack brush toward you (`ExploreEnemy.js:598`, `:1006`);
  - Razorbacks bulldoze it (`JungleScene.js:920`, `crashBrush`);
  - the thrown machete cuts its whole line (`ExploreShots.js:449/455`).
- Cuts persist across the run (`run.world.cut`), and each night 18% regrow (`JungleWorld.js:453–459`). So stumps pile up along your old routes, and some silently vanish overnight when their tile regrows.
- Rate: the flooded day made **11 pop-in stumps from 157 cut tiles** (`cutStumps` counter in `hx_src.js`). That's ~10–15 a day for a hacker, and ~50+ across a run.
- **It makes no physical sense.** A machete swipe through a monstera or heliconia leaves a tree stump with saw marks.

### Recommended fix (one pick)

1. **Delete the cut-stump pop-in.** In `chunkCards`, drop the `r < 0.06` branch so that `r < 0.5` → leaf debris only (`dec_cut_leaves`, already there).
   - The change is purely visual and is safe for saves: nothing persists the cards.
   - `fol_cut_stump` stays in the atlas, unused.
2. **Make the generated stumps mean something: "fungus stumps" are forage nodes.**
   - The shelf fungus on an old stump (and on fallen logs) comes off with a machete hit and drops **Biofiber**. The stump stays: solid, bare, harmless.
   - Place them deliberately: at the edges of trails and clearings (the old logging margins), not in random deep brush.
   - Full spec in §4C.

   **Why this over the other options:**
   - Hitting things is what the player already does all day, and the stump art already *shows* the fungus. So the promise the sprite makes finally comes true, and nothing new needs teaching.
   - Biofiber is the right currency: it is scarce, feeds Thorn Nests, Snare Vines, Mortar Pods, med kits and Thorn Coating (`towers.js:66/106/127`, `crafting.js`), and is organic.
   - **Rejected alternatives:**
     - "Chop splits the stump for loot" needs a destroyed-stump state, a chunk rebuild and a new rule (stumps are breakable, logs aren't).
     - "A stump hides a small cache" overlaps the hidden caches and adds a second hold-E box.

---

## 3. Foraging features, ranked

Every feature below uses existing verbs (walk over, hold E, hit with the machete), existing resources, existing pickups (`spawnPickup`) and existing feedback. None adds a HUD element.

### Rank 1: **Wild fruit** (eat on the spot: +15 health)

**What the player does:** a low bush heavy with orange fruit stands beside trails and clearings. Walk up and the prompt reads "Hold E: Eat the wild fruit (+15 health)". Hold 0.8 s: you get the heal, the fruit is gone and the bush is bare until tomorrow.
- At full health it isn't used up. The prompt and toast say "You're not hurt: come back when you are". This is the glasshouse cistern's rule (`JungleRelics.js:181–236`), which players already know.

**Why it's interesting:**
- *Decision:* eat now, or remember the bush and come back after the fight.
- *Risk:* a 0.8 s hold with creatures around.
- *Discovery:* bushes are landmarks you learn on a persistent map ("there's fruit by the river ford").
- It gives the day **the one resource loop it lacks: health in the field.**

**Numbers:**

| What | Value |
|---|---|
| Bushes per jungle | 30, about 6 per district |
| Greenhouse | ×1.5 (thematic) |
| Placement | ≤ 3 tiles from a trail or clearing, ≥ 18 tiles from the Relay, ≥ 12 tiles apart |
| Seen per day | ~4–5 on a typical route (a day explores ~15% of the map, mostly along trails) |
| Heal | 15 each (a med kit is 25). Days offer ~60 HP of fruit, but only on your route |
| Regrowth | Every bush is full again each morning; nothing to save |

**Ties to the economy and the night:**
- Going down costs 65–90% of what you carry. With J2's median at 17 Scrap a day and half of days ending in death, **each death avoided is worth ~15–25 Scrap banked**. That's a bigger lift for the median than any loot buff, and it's worth nothing to an expert at full HP, so the sim's top end doesn't move.
- Health also carries into dawn (`Run.dawnHp` = max(hp + 25, 75)).

**It is not a med-kit source:** fruit can't be carried. J2 counted five med-kit sources at two prices already.

**Code touched:**
- `JungleGen.js`: a new `world.forage` list on its own RNG stream.
- A new `src/entities/Forage.js` modeled on `SporePods.js`.
- `JungleScene._addInteractable`.
- `Player.heal(n)` (`Player.js:530`).
- `src/data/jungle.js` (new `FORAGE` table).

**Art:** one 32×32-ish sprite in two states, `prop_fruit_bush` (ripe) and `prop_fruit_bush_bare`. The palette can follow `dec_berries`.

**Risks:**
- A bush right outside a lair or an uplink trivializes the fight. Keep bushes ≥ 10 tiles from lairs and from today's goal and event sites.
- Players may stand and wait at full HP. That's harmless, and the prompt says so.

### Rank 2: **Glints in the brush** (cutting finds Scrap)

**What the player does:**
- While you walk, a soft pale-gold sparkle blinks now and then *inside* the undergrowth, within ~8 tiles (the Alpha's tracks already use this idiom: `JungleGoals.js:491–503`).
- Cut that plant and **2–4 Scrap** spill out as normal pickups that magnet to you.
- Brambles glint more often and pay more: **4–7 Scrap**. But they need a heavy chop or three slashes, and they bite.

**Why it's interesting:**
- It turns the core verb (cutting) into **search**. It gives the hack-through route a target ("detour 3 tiles for that glint?").
- It adds noise and risk: cutting is loud and draws wildlife.
- It is pure *discovery* and needs no new UI.

**Numbers** (measured jungle: 17,436 thicket and 785 bramble tiles; a full day's explored area holds ~1,800 thicket and ~150 bramble):

| What | Value |
|---|---|
| Chance per uncut tile | thicket 0.3%, bramble 1.2% (rolled fresh each day) |
| Per jungle per day | ~52 thicket + ~9 bramble glints |
| Seen per day | ~7 |
| Taken per day | ~4–5 for a normal player |
| Exclusions | None within 12 tiles of the Relay or a pylon; none within 2 tiles of a container, trail or site |
| Yield | thicket 2–4 / bramble 4–7, × `Run.lootMults().scrap` × the existing distance multiplier (`JUNGLE.lootDistance`, 0.45 → 0.9) |
| Net per day | **+10–15 Scrap** for the median player, ~+20 for a dedicated hacker (capped by how much you're willing to cut) |

**Ties to the economy and the night:** this directly targets the A1 gap (17–40 vs 85). The extra Scrap comes from the actions median players already take: walking and cutting near where they are.

**Code touched:**
- `JungleScene.meleeHit` (`:849–857`, the `b > 0` branch). Also `ExploreShots` (machete throw, `:455`) and `crashBrush` (`:920`): if a Razorback crashes through a glint, the Scrap flies out. That's funny and rewarding.
- `spawnPickup` (`:699`).
- A small sparkle updater in `Forage.js`.

**Art:** none. Use `fx.flash` with a gold colour and the existing `pick_scrap` pickups.

**Risks:**
- **Don't use the `glint` sfx.** It is literally the enemy wind-up cue (`audio.js:286–287`: `glint` and `windup` share layers). Use `pickup`.
- The sparkle has to draw over the foliage cards (depthTest off, like the `onTop` smear), or it's invisible exactly where it lives.
- The sparkle has to be gold, not the white loot sparkle, so it doesn't read as dropped loot.

### Rank 3: **Fungus stumps and logs** (Biofiber; this is the stump fix)

**What the player does:** shelf fungus grows on old stumps and fallen logs at trail and clearing edges. Hit it with the machete (any swing, slash or chop): the fungus breaks off with a wet chunk and a sap burst, and **1 Biofiber** pops out. The stump or log stays solid and bare until tomorrow.

**Why it's interesting:**
- It makes the most common "looks harvestable" prop actually harvestable.
- It turns Biofiber from a rare chest roll (35% component chance on a chest) into something you can *go and get*. That's a real routing choice on days when you want a Thorn Nest.

**Numbers:**

| What | Value |
|---|---|
| Fungus hosts per jungle | 28: 16 new "old stumps" placed near open ground + the 12 nearest-to-trail existing logs |
| Seen per day | ~3–4 |
| Yield | 1 Biofiber, × the district's Biofiber multiplier (Greenhouse ×2 → 2) |
| Per day | ~2–3 Biofiber |
| Regrowth | Each morning |

**Ties to the night:**
- One extra Biofiber a day buys a Thorn Nest, a Snare Vine or a Mortar Pod (1 each), or an L2 upgrade (1–2). The median player currently stalls on Biofiber after the starting 1.
- It also synergises with Seed Bank (the relic makes it pointless, which is fine: the relic is the late-run reward).

**Code:** `JungleGen.js:513–524` (scatter), a new placement next to the spores (`:638–650`), `Forage.js` `hittables()` (the spore pattern: `SporePods.js:99–105`).

**Art:** one edit, a **bare stump**, `fol_stump` with the bracket fungus painted out. It must *not* be named `fol_stump*`: the atlas family regex `/^fol_stump/` would mix it into the random stump picks. Call it `prop_stump_bare`, or replace `fol_stump.png` itself and draw the fungus as an overlay (see §4C). The fungus overlay can reuse `dec_fungus_shelf` (30×32) as an upright card.

### Rank 4: **Dusk blooms** (rare plants that open at sunset: +1 Intel)

**What the player does:**
- Two or three per jungle, in clearings away from the Relay. By day the plant is closed and dull.
- Once dusk starts (the last 70 s), it opens and glows (the `EMISSIVE` system already does this for decals).
- Hold E 1 s for **1 Intel and +5 Research**.

**Why it's interesting:** it's the only reward that *asks* you to stay out into the hunter phase, so pillar 1 ("stay for more, or extract safely") gets a reason. It also uses the dusk lighting, which is the game's best-looking moment.

**Code:**
- a `dusk` flag in `Forage.js`, read from the scene's daylight clock;
- `EMISSIVE.decals`-style glow keys;
- a `run.meta` Research hook like the bonus tasks.

**Art:** one sprite in two states (closed / open with a glowing core).

**Why it's 4th:** it serves the expert more than the median player (whom it lures into the dangerous phase). It's worth doing after 1–3 land.

### Evaluated and rejected

- **Stamina refills** (moss, fruit): regen is 40/s, so the reward is worth ~2 s. Reject.
- **Forage satchel → med kits at home:** a new carried resource, a new HUD line and a sixth med-kit source (J2 C1). Reject: it breaks "simple to the public's eye".
- **Beehive / hornet nest:** in practice a spore pod with a heal on it. The jungle already has that hazard, at 5–28 per district. Reject.
- **A wildlife trail you follow:** that's the Track-the-Alpha goal (footprints, claw marks). Reject: it would blur a goal.
- **Pickup-able ground decals** (cogs, bolts, berries baked into the terrain): decals are baked into the terrain texture (`TerrainBaker._scatter`), often under brush, and can't be removed per item. Instead, lower the weights of `dec_cog`, `dec_bolts` and `dec_berries` (Data Center ×4/×3.5, Market ×2) once glints and fruit exist, so the inert look-alikes stop competing with the real thing.
- **Also lower `mushroom` from 8% to 3% of fern tiles** (`JungleWorld.js:838`). Those big fungus clumps are not the fungus you harvest. Once the harvestable fungus exists, the decoy shouldn't be on every twelfth fern.

---

## 4. Implementation spec: the stump fix + the top 2 features

All tuning goes in **`src/data/jungle.js` → a new `FORAGE` table**. Placement belongs to generation (it's deterministic from the seed). The live behavior goes in one new entity file, **`src/entities/Forage.js`**, constructed beside `SporePods` (`JungleScene.js:159`).

### 4.0 Data table (`src/data/jungle.js`)

```js
// Foraging (critic N): things the jungle gives back. Generation: JungleGen (world.forage, own RNG stream
// 'forage' so nothing else in the world moves). Live: src/entities/Forage.js. All of it regrows every morning.
export const FORAGE = {
  fruit: {
    perRegion: 6, perRegionMult: { canopy_greenhouse: 1.5 },
    nearOpen: 3,            // within this many tiles of a trail or clearing
    minRelay: 18, spacing: 12, lairGap: 10, siteGap: 4,
    hold: 0.8, heal: 15, radius: 1.3,
  },
  fungus: {
    newStumps: 16,          // extra old stumps placed near open ground (the 'forage' RNG stream)
    logHosts: 12,           // + the nearest-to-trail generated logs
    nearOpen: 3, minRelay: 14, spacing: 8,
    yield: 1,               // Biofiber, × Run.lootMults().biofiber, rounded, min 1
  },
  glint: {
    chance: { thicket: 0.003, bramble: 0.012 },   // per uncut tile, rolled per day
    scrap: { thicket: [2, 4], bramble: [4, 7] },   // × Run.lootMults().scrap × JUNGLE.lootDistance mult
    minReturn: 12,          // none within this of the Relay or a pylon
    clear: 2,               // none within this of a container, trail tile or site centre
    show: 8, every: [1.6, 2.6],   // sparkle range (tiles) and interval (s, random in range)
    color: '#fee761',
  },
};
```

### 4.1 Stump fix

1. **Remove the cut-stump card.** In `JungleWorld.js:834–835`, delete the first branch:
   ```js
   if (r < 0.5) cards.push({ e: A.pick('debris', tx, tz, 1), ... });
   ```
   The `cutstump` family, its alias and `fol_cut_stump.png` can stay (unused) or be dropped from `FloraAtlas.FAMILIES`.
   - No save impact.
   - Enemy cuts, Razorback crashes and machete throws stop making stumps for free.
2. **Stop the random stump scatter** without moving the world.
   - In `JungleGen.js:519`, keep the `rng.pick` call (the main stream must consume the same numbers, so every existing seed keeps its trees, crates and lairs).
   - Map the result: `const type = picked === 'stump' ? 'log' : picked;`. A fallen log deep in the brush reads as natural; a lone stump doesn't.
   - `r` stays 0.5 for log.
3. **Place the fungus stumps** (§4C) from the new `forage` stream, before the reachability check, so `GROUND.reachPad` still guarantees every site can be reached.
   - Mark them `{ kind: 'rock', type: 'stump', fungus: true }` so they get the existing `rock_stump` collider (`jungle.js:462`) and the existing art path (`objectEntry`).
   - Pick the 12 log hosts the same way: generated logs sorted by distance to the nearest trail tile, set `fungus: true`.
4. **Reading it as solid stays consistent:** after this, every stump on screen is solid.

### 4.2 Wild fruit (rank 1)

**Generation** (`JungleGen.js`, after the spore block around `:650`):
- Use `const frng = makeRng(subSeed(seed, 'forage'))`.
- Per district region, `round(perRegion × mult)` bushes, on tiles that are:
  - open (no brush), not mud or water;
  - ≤ `nearOpen` from a trail or clearing;
  - ≥ `minRelay` from the centre, ≥ `spacing` from each other;
  - ≥ `lairGap` from `world.lairs`.
- Push `world.forage.push({ id: 'f' + n, kind: 'fruit', x, z, region })`.
- Add them to the prop clearance list at `:699` (not hidden: `PF.low`), so no thicket card hides them.

**Live** (`Forage.js`):
- Visual: `this.scene._visual('prop_fruit_bush', x, z)`. Not solid: you step into its leaves like ferns.
- Interactable, via `scene._addInteractable`:
  ```js
  { kind: 'forage', x, z, radius: FORAGE.fruit.radius, hold: FORAGE.fruit.hold, keepProgress: false,
    verb: () => `Eat the wild fruit (+${heal} health)`, onComplete: (it) => this._eat(it) }
  ```
- `_eat`:
  - Run `const n = player.heal(heal)`.
  - If `n > 0`: `it.done = true`, swap the visual to `prop_fruit_bush_bare`, `sfx 'med'`, `fx.text` "+15 Health" (green, like med kits), and a little burst of orange (`#f77622`) and leaf green.
  - If `n === 0`: leave `it.done = false`, `toast('You are not hurt: the fruit will keep. Come back when you are.', 'amber', 2.5)` and `sfx 'ui_back'`.
- **Excluded:**
  - none within `siteGap` of today's goal, bonus or event props (skip at scene build: `JungleScene` knows its sites);
  - none on the guided day? **Keep them on the guided day.** The prompt teaches itself, and the guided player is the one who needs the heal. No coach step.
- **Map:** no marker. These are landmarks you remember, not dots to collect. This is a deliberate exception to the dot economy and keeps the map clean.
- **Persistence:** none. Bushes are rebuilt full every day, and today's eaten set lives in `Forage` only. A mid-day reload abandons the trip (DESIGN §2), so there's nothing to exploit.

**Text** (plain words, exact):
- prompt: "Hold E: Eat the wild fruit (+15 health)";
- full HP: "You are not hurt: the fruit will keep. Come back when you are."
- DESIGN §4 line: "**Wild fruit** grows by the trails: hold E to eat it (+15 health). It's back every morning."

### 4.3 Glints in the brush (rank 2)

**Generation, per day** (in `Forage.js` at scene start, not in `JungleGen`, because it is per day):
- `const day = run.night` (or `run.world.day`).
- For each tile `i` with `world.brushAt(tx, tz) ∈ {thicket, bramble}` (this already excludes cut tiles), roll `hash2(tx, tz, (seed ^ day * 0x9e37) & 0x7fffffff) < chance[type]`.
- Skip a tile if any of these hold:
  - it's within `minReturn` of the Relay or an activated pylon;
  - it's within `clear` of a container, a trail tile or a site centre;
  - it's a hidden-cache tile.
- Store `this.glints = new Map(i → { tx, tz, type, amt })`, with `amt` rolled from the same hash × `run.lootMults().scrap` × the distance multiplier (the same function `JungleGen.js:662` uses; factor it out into `src/world/` so both share it).
- Cost: one pass over 36,864 tiles, < 2 ms.

**Sparkle:**
- In `Forage.update(dt)`, for glints within `show` tiles of the player: on a per-glint timer in `every`, call `fx.flash({ x: tx + 0.3 + rand·0.4, y: 0.35, z: tz + 0.5 }, { color, size: 7/32, life: 0.12, onTop: true })`.
- `onTop` (draw over foliage: depthTest off) is a small `Fx.flash` option. Copy what `fx.smear`'s `onTop` does.

**Reveal hook:** `JungleWorld.hitBrush` is the single choke point every cutter goes through: player swing, throw, Feral hack, Razorback crash.
- Add an optional callback there: `this.onCut?.(tx, tz, b)` after `this.cut[i] = 1`.
- `Forage` sets `world.onCut`. On a glint tile it:
  1. calls `scene.spawnPickup('scrap', amt, tx + 0.5, tz + 0.5, { vx, vz, delay: 0.3 })`, split into 1–2 pieces like `_spill`;
  2. plays `sfx 'pickup'` (**not** `'glint'`, which is the wind-up cue);
  3. emits a gold `fx.burst`;
  4. deletes the glint.
- The first time each run, show `toast('Something shiny was hidden in the brush: watch for the glint', 'good', 3)` (one line, then never again; use `this.warned`).

**Persistence:** none. The cut tile persists as it always has, and tomorrow's glints are re-rolled on uncut tiles only.

**DESIGN §4 line:** "**Glints in the brush:** a gold sparkle in the undergrowth is old salvage. Cut the plant and it spills Scrap (more in brambles). New ones each day."

### 4.4 Fungus stumps and logs (the stump fix's payoff)

**Generation:** see §4.1 steps 2–3.

**Live** (`Forage.js`):
- For each `world.objects` entry with `fungus: true`, draw a fungus overlay card: `scene._visual('dec_fungus_shelf', o.x + side, o.z - 0.05)`. Its offset puts it on the art's right flank (stump) or top (log). Tune it with `debug.forage()` screenshots.
- **Art:** `fol_stump.png` repainted without its baked-in bracket fungus, so harvested stumps look bare. Otherwise use the separate `prop_stump_bare` route; the key must not match `/^fol_stump/`. `fol_log` stays as it is: its fungi are small enough to read as moss.
- `hittables(out)`:
  ```js
  out.push({ x: o.x, z: o.z - 0.2, radius: 0.5, dead: false, forage: true, hit: () => this._harvest(o) })
  ```
- `_harvest(o)`:
  - Remove the overlay.
  - `scene.spawnPickup('biofiber', max(1, round(yield × lootMults.biofiber)), …)`.
  - `sfx 'splat'` (wet) followed by the pickup's own `pick_biofiber`.
  - `fx.burst` in `#63c74d` / `#e4a672` chips.
  - `hitStop` of the slash's normal size.
- **Stamina:** forage hittables count as "plants" in `Player` stamina accounting. `meleeHit` returns `hits`, and Player charges creature stamina for any hit. Exclude `t.forage` from `hits` so a harvest costs the plant price (2), not 9–14.

**Persistence:** none. Fungus regrows every morning.

**First time:** an inline prompt when within 1.6 tiles of an unharvested host, with no E: "Hit the fungus with your machete for Biofiber". Use the existing interact-prompt slot via an interactable with `hold: 0` and `walkOver: false`, `enabled` only until the first harvest of the run.

**DESIGN §4 line:** "**Old stumps and logs** grow shelf fungus: hit it with the machete for Biofiber. It grows back by morning."

### 4.5 Feedback and sfx (all keys exist in `src/data/audio.js`)

| Event | sfx | Fx |
|---|---|---|
| Eat fruit | `med` | `fx.text` "+15 Health" (green), an orange and green leaf burst |
| Fruit at full HP | `ui_back` | toast (amber) |
| Glint sparkle | (none: visual only) | gold `fx.flash` over the foliage |
| Glint revealed | `pickup`, then `pick_scrap` on collect | gold burst, Scrap pickups |
| Fungus harvested | `splat`, then `pick_biofiber` on collect | green and tan chip burst, a light hit-stop |

### 4.6 Debug and tests

Add `vr.game.scene.debug.forage()` → `{ fruit: [{x, z, done}], fungus: [{x, z, done}], glints: [{tx, tz, type, amt}] }` and `debug.gotoForage(kind, n)` (teleports 1.5 tiles south of it).

| # | Test (URL) | Expect |
|---|---|---|
| 1 | `?debug=explore&seed=4242&district=canopy_greenhouse&night=2`. Hack 48 tiles east from an open tile with real LMB + D (`.playwright-mcp/roundN/hack.js`) | 0 cards with `e.key === 'fol_cut_stump'` across all chunks (count `world.chunks` card keys); leaf debris on ~45% of cut tiles |
| 2 | Same URL: `world.w.objects.filter(o => o.type === 'stump')` | every stump has `fungus: true` and lies ≤ 3 tiles from a trail or clearing; no stump from the 140-scatter (those are logs now) |
| 3 | Same seed, before and after the change: compare `world.w.containers`, `sites`, `lairs`, `pylons` and the non-stump `objects` | identical (the main RNG stream is untouched; only stump → log and the added fungus stumps differ) |
| 4 | `gotoForage('fungus', 0)`, one LMB click at it | +1 Biofiber pickup (2 in the Greenhouse), the overlay gone, the stump still solid (walk-into test as in `solid.js`), stamina −2 not −9 |
| 5 | `gotoForage('fruit', 0)` at 100 HP, hold E 0.8 s | toast "You are not hurt…", the bush still ripe. Then `player.hp = 60`, hold E | hp 75, bush bare, `sfx med` |
| 6 | `debug.forage().glints.length` on Greenhouse night 2, then `&night=3` with the same seed | ~55–65 each, with different tile sets on the two nights; none within 12 tiles of the Relay |
| 7 | `gotoForage('glint', 0)`, one slash at the tile (two more slashes or one chop for a bramble) | Scrap pickups spill and magnet in; `sfx pickup`; the glint list shrinks by 1 |
| 8 | A Razorback charge through a glint tile (`debug` spawn, or wait on a Residential night 3 day) | the Scrap spills where it crashed |
| 9 | The guided day from the title (New Run) | fruit bushes appear and work; the coach's 7 steps are unchanged; no new toasts before the first glint |
| 10 | Economy check (J2 A1): 3 real-input bot days per area | carried Scrap at home +10–15 vs the same seeds before; Biofiber +2–3 a day; deaths on bot days ≤ before |

### 4.7 Docs to update when it lands

- DESIGN §4: the three lines above. Delete "stumps" from the random-scatter wording, and the budget line ("~70–100 Scrap", +~12 from glints).
- ARCH "The jungle (day)": `world.forage`, `Forage.js`, `world.onCut`, `debug.forage`.
- PLAN: tick a "Foraging (critic N)" stage. Add the art asks to the Art list:
  - `prop_fruit_bush` / `_bare`;
  - `fol_stump` without the fungus;
  - later, the dusk bloom.

---

## 5. Smaller notes found on the way

- **The `glint` sfx is the enemy wind-up sound** (`audio.js:286–287`). Anything that wants a "loot glint" sound must not use it, or players will roll away from Scrap.
- `fol_mushrooms` on 8% of fern tiles (`JungleWorld.js:838`): with fungus as a real forage, cut it to ~3% so the decoy isn't everywhere (`N13_trek_5.png`, top-left: four clumps on one screen).
- The guided day lost 30 HP during the bot-driven crate step with no attacker in the 6-second screenshots. A spore pod (`N13_trek_5.png` shows two magenta bulbs that are probably pods) or a brush ambush is the likely cause. I didn't isolate it: this is bot pathing, so treat it as a lead, not a finding.
- Healthy: the hack-through itself is excellent (≥ 3 tiles/s, readable debris, a real shortcut). Every feature here gives it a target instead of changing it.
