# Verdant Relay — Design

**Scavenge by day. Hold the line by night.**

Single-player roguelite for desktop browsers, built with **Three.js + JavaScript (Vite)**. The world is 3D
but rendered at low internal resolution and scaled up with nearest-neighbour, so it reads as pixel art.
Characters, enemies, towers and props are **detailed pixel sprites** (upright cards in the 3D world): PixelLab
art hand-finished (STYLE.md), weathered and grounded. The day is an open, dense, claustrophobic jungle explored
with a machete; the night is a tower defense around the Relay. Anything without art falls back to a placeholder.

You are a scavenger supplying **Verdant Relay**, a power-and-comms hub built into an overgrown transit
station. A run lasts up to 6 nights. Survive the Night 6 boss siege to win. If the Relay Core hits 0, the run ends.

---

## 1. Pillars

1. **Every expedition is a choice.** Stay for more loot, or extract safely.
2. **What you find shapes your defense.** Parts, intel and district outcomes change that night's build.
3. **Every run varies.** Districts, layouts, loot, events, waves and upgrade offers change.
4. **Defense stays readable.** Clear enemy roles, clear tower jobs, clear reasons a wave was won or lost.
5. **Failure still unlocks options.** Permanent progression adds variety, never auto-wins.

## 2. Run loop

1. **Briefing:** see the night number, Relay health, resources and run upgrades, and tonight's attack per path. Pick one
   of two areas (three with Scout Report; Second Look re-rolls the offer once a night).
2. **Explore (day):** cross the persistent jungle to the chosen district, do the objective, loot, return to the Relay or a pylon.
3. **Summary:** see what you banked. Spend any skill point (pick 1 of 3, or save it). Then the **Workbench**
   (when something can be made): turn spare parts into tower mods, machete upgrades, med kits (§6, skippable).
4. **Prepare (night):** repair the Relay, build, upgrade and sell towers, spend Intel, read the wave preview.
5. **Defend:** survive the wave. You don't control a character in this mode.
6. Repeat until you win Night 6 or the Relay falls.

**Kept within a run:** Relay HP, resources, towers and their levels, skills, unspent points, relics brought home,
district consequences, player HP. All of it resets when the run ends. Permanent unlocks and best-run records stay.

**Death rules (Stage 7, critic J §3 / L §6.3; `Run.salvageFor`, `Run.dawnHp`, `Run.applyExpedition`).** Going down,
abandoning the trip and quitting mid-day are the same outcome:
- **Salvage never beats carrying:** the drone saves `share × carried` of each resource (`deathSalvage` 35% / 30% / 10%
  on nights 1–3), and for Scrap at least the night's floor (20 / 20 / 12, once you're 15 s into the day) — but never
  more than you carried: `scrap = min(carried, max(floor, share × carried))`.
- **Dawn health:** you wake with `max(hp + 25, 60)` (`nightlyHeal`, `dawnHpFloor`) whether you got home or went down
  (going down drops you to 35 for the night). The summary's bar reads "Health at dawn".
- **The goal's reward needs you home:** a goal done before going down keeps its skill point, but its reward for tonight
  is lost (the summary shows "Reward lost").
- **Head home with nothing?** Going home with no loot, no goal and no bonus task asks first (Keep exploring / Head home):
  a second E-hold at a fresh beacon used to end the day at t≈25 s.
- **Quitting mid-day abandons the trip:** the quit confirm says so ("Abandon & quit"), the trip is settled at once and
  Continue opens its summary. Closing the tab mid-day does the same on the next Continue (the trip-start snapshot,
  phase `explore`, is settled as abandoned — "The game closed during the trip").

## 3. Screens

| Screen | Contents |
|---|---|
| Title | Only what is unlocked (§8): a first visit sees New Run, Collection, Settings. Continue (only with a valid save; says the mode and where: "Day trip (counts as abandoned)"), Daily Run (after the first run: today's two modifiers and today's best), Long Night and the Overgrowth row ◂ level ▸ (Left / Right; after the first win). With modes open the column goes compact (New Run + Long Night, Collection + Settings side by side). The records box (Research, best run, Overgrowth won, Long Night best, runs, research unlocks) only once there is a record, with the "You can afford N research unlocks" nudge under it |
| Briefing | Night N/6 (pips, the last one a ☠ boss night; Long Night: "+N" past six and a boss warning every 3rd night), the mode tag (Overgrowth N / Daily: modifier names, all of them on hover; Long Night), Relay (your base) and your health, med kits, resources stored at base (Scrap always, others once you have some), two (Scout Report: three) area cards: **Goal** (the objective sentence) with its **Reward** "(get home to claim it)", **Finds** ("Twice the Circuits in all you loot today": the area's loot multipliers apply to every container you open that day) and **Danger** tonight (green "None: you killed the …" once its boss is dead) and, from night 3, **Boss** (☠ its name, "Optional"); where / creatures behind **Details**. Today's weather, if any, sits under "Where to today?" (☂ Rain / ≋ Fog / ☀ Heat and what it does). "New areas" (R, Second Look) re-rolls the offer once a night. Side: **tonight's attack per path** (the wave the night will build: variant name, enemy count, pushes, split by path, with the picked area's danger added to the path facing it, "Includes: …"), Field Dressing's med-kit shop, towers and skills once there are any. Head out. The guided first night shows one pre-selected area |
| Exploration HUD | Top-left: Health (green → yellow → red; the screen edge pulses red under 30%), Stamina (flashes "tired" when empty), med kits (once carried), carried loot (Scrap always, other currencies as found) with carried relics' icons under it; under that panel the coach / tip line. Top-right: minimap ringed by the daylight left (Tab/M big map: deep water dark blue, crossings pale), the clock with a pixel sun (a moon after sunset) and its "Daylight" label, the area name (and today's weather). Bottom: the GOAL strip (the objective sentence, "name: sub-step" for multi-step ones) with distance/direction, "cross at the stepping stones" when deep water is in the way, "Home N m" only when going home is next (goal done, last minute of daylight, low health); the interact prompt above it. The top centre stays free (an area boss's bar) |
| Summary | One card: You got (or Saved / Lost), **Found** (relics brought home, each with what it does now; or the relics **Lost** out there), Goal ✓/✗ ("failed" when the engineer died), Reward(s) tonight (or "Reward lost" after going down), Bonus tasks and events, **Boss** (an area boss killed today and what it cleared), Danger tonight (green when its boss is dead) (both dangers with Restless Jungle), Health (after a bad day), skill points, Intel note (only with Intel), Research in one line; then the skill pick (only with points; "Re-roll cards" R with Fresh Ideas; icon + number on each card, ★ keystones gold-framed) and Continue ("Workbench ▶" when something can be made, else "Prepare for the night"). The **Workbench** step: recipe cards by group (tower mods, machete, supplies) with what you have vs need, Back (Esc) and Prepare for the night. The status strip shows "Health at dawn". Saved as phase `summary`, so a reload comes back here |
| Preparation | Defense map, Relay HP, resources (full words, zeros hidden), tower list (name, price, one plain line, Power/Speed/Range bars; exact numbers on hover; "+5 Scrap: you own N" when the price rises), selected tower (line, bars, its **Mod** socket when you have a mod — fit / swap / take out, targeting from night 2, upgrade, sell), Intel actions (Read / Disrupt, only with Intel), Repair (only when damaged), tonight's attack (danger, rewards, enemies per path, "also tonight", where each owned night relic says what it does tonight, a cursed one's price in red-violet), the readiness line (Your defense: weak / risky / strong) and Start Wave |
| Defense HUD | Relay HP, wave progress, "N to go" (alive + still coming, matching the per-path counts), resources, pause, 1×/2× speed, boss bar |
| Results | Victory or defeat (Long Night: "The Long Night ends", bright when night 6 was held), the mode tag (+Research bonus), **why the Relay fell** ("What got through: 4 Razorbacks (48 damage), …" from the night board's leak tally, plus one tip for the worst offender), nights survived, kills, areas visited, research earned (and the total), peak resources, the mode's record line (first win opens the modes; new Long Night best; today's Daily best; "Overgrowth N+1 is open"), a research nudge ("Your Research buys …"), then the same mode again (New Run / Long Night again / Daily again) / Collection / Title |

## 4. Exploration (day) — the open jungle

**One persistent jungle per run.** The world (`src/world/JungleGen.js`) is a 192 × 192-tile jungle generated from the run
seed, the same every day: the Relay sits in a clearing at its centre, the five districts are noisy sectors around it
(`src/data/jungle.js` REGION_LOOK). Rivers and swamp pools cut through it, old trails link the Relay to ruin sites,
feral camps, landmarks and one dead **relay pylon** per district. Trails meander in S-bends (~1.3–1.5× the straight
line) and a few dead-end in the brush. **Lost sites** (most major ruins, some minor ones and landmarks) have no trail at
all and sit behind a ring of thicket and bramble: you cut your way in. Everything else is thick, layered undergrowth,
densest away from trails and clearings, so cutting cross-country is a real shortcut.
What you change persists across the run (`run.world`): undergrowth you cut, supplies you open, pylons you activate,
the map you have explored. Each night ~18% of cut undergrowth grows back (never trails).

**Feel:** dense and claustrophobic. You see ~20 × 11 tiles (a fixed 640×360-pixel view at every window size); foliage cards stand higher than you, canopy shade
drifts over everything, foreground leaves close in at the screen edges, creatures rustle through the brush before
they break out. Terrain blends organically (no tile grid). Foliage in front of you turns see-through around you.

**Camera:** fixed-angle 3D top-down (55° pitch) that follows the player with a little look-ahead toward the mouse.

**Controls:** WASD move · mouse aim · **LMB** machete slash (3-hit combo; hold it while walking to hack through brush) ·
hold **RMB** charge a heavy chop, release to swing (the first instant of an RMB press **deflects**) · **Space** dodge roll
(i-frames, stamina) · **F** throw the machete · E interact (hold where needed) · Q med kit · Tab/M map · Esc pause.
Every key but Esc can be rebound (Settings → Controls, §8); the mouse buttons are fixed.

**Player:** 100 HP, ~5.6 tiles/s (shallow water ×0.55, mud ×0.82, ferns ×0.5; a roll in ferns ×0.6). Movement is snappy:
input against your motion turns you round at 110 t/s², kept 0.12 s after (a 180° to full speed in ~0.1 s, measured 85–100 ms), letting go stops you in ~0.25 tiles, and
walking head-on into a trunk / rock / ruin (or a brush corner) whose edge is within ~0.45 tiles of your centre steers you
round it (`CONFIG.player.turnAccel / stopAccel / nudge`; critic I).
**Stamina** 100, paid when the blade lands: a swing that meets a creature, nest or pod costs 9–14 (chop 22), one that
only meets plants or air costs 2 (finisher 3, chop 6) and keeps you at ×0.75 speed instead of ×0.3 — so cutting is a
flowing verb, not a stamina tax. Roll 20; regen 40/s after 0.35 s; empty = exhausted (slower, weaker swings, until 35%,
regen at full rate; spending while exhausted doesn't restart the regen delay, so it always ends; exhausted swings and
chops are ×1.35 slower and ×0.7 weaker). A Space press is buffered for 0.15 s (late in a roll, in its cooldown, before a chop lands).
- **Machete** (`WEAPONS.machete`): 13 / 13 / 28 damage combo (7 / 7 / 12 stamina), 120° arcs, range ~1.5; each swing
  lunges a step. The heavy **chop** (0.42 s charge) hits 36 in a 165° arc, staggers (interrupts wind-ups), knocks hard
  and clears brambles; it costs 30 stamina and holds regen 0.45 s. Critic I2: the combo is the damage option (paced
  ~31–35 DPS against a dummy), the chop the stagger / crowd / brush tool (chop spam ~26 DPS, was 37).
  **Hack-through:** holding LMB while you walk swings on its own every ~0.28 s, along where you walk (unless you aim within
  60° of it), alternating the two light swings — thickets fall at ≥ 3 tiles/s.
- **Deflect / riposte** (`DEFLECT`): for 0.14 s after an RMB press (at most one window per 0.5 s; a deflect re-arms it),
  an attack from your front half is turned away — white ring, clang spark, a 0.09 s hit-stop, +15 stamina, one word
  ("DEFLECT"). A lunge leaves the attacker reeling 1 s (elites 0.4 s) right where it is (no shove), and your next light
  slash within 1 s is a **riposte** (×2.5 damage, always staggers, +0.5 reach and a longer lunge; a riposte that hits
  nothing isn't spent); a Spitter's glob is batted back for 25; a Razorback's charge: you sidestep and it takes 15 and
  reels 0.8 s; a spear or bolt is knocked out of the air.
- **Perfect dodge** (once per roll): any attack your roll's i-frames absorb, or a near miss — an attack committing (a
  lunge, charge, stomp, Stalker eruption, glob or Bloater burst) within 0.2 s of you rolling out of its zone, whichever
  way you rolled. It refunds 15 stamina, slows time ×0.4 for 0.2 s and flashes a cyan rim. DODGED shows once per roll.
- **Machete throw** (F, `WEAPONS.*.throw`): 0.25 s wind-up, 25 stamina, 3 s cooldown. It flies 6 tiles at 16 t/s, does 18
  to everything it passes (piercing), cuts ferns and thickets on its line (a bramble, trunk, rock or ruin stops it), then
  flies back within 0.4 s (9 on the way back). While it's out LMB is a **shove** (4 damage, a big push, no cutting); F
  again calls it back (not in the first 0.35 s, so a double-tap doesn't waste it). It is still the machete: relic damage
  (Whetstone, Glass Machete, Hunter's Fang) and Serrated Edge apply. It answers Spitters behind thickets and sets up wall splats.
- **Parang** (unlock): slower, harder, cuts brambles with any swing.
- Every swing hits all enemies, nests and undergrowth tiles in its arc. **Cutting is loud**: wildlife nearby comes to look.
- **Status effects** (`STATUS`): a Spitter's sap puddle (2 s) slows you ×0.6 and a roll out of it costs +10 stamina; a
  Bramble Crawler's bite makes you bleed (2 HP/s for 3 s); a Thorn Stalker roots you (0.6 s). A roll stops bleeding and
  breaks a root.
- **Going down:** the hurt flinch, then you crumple (the roll's crouch, then its curled frame, dimmed) under ×0.25
  slow-mo for 0.5 s while nearby creatures back off the body 1.5 tiles.

**Undergrowth** (`BRUSH`): ferns (pushed through at half speed, they rustle; any swing clears them), thickets
(solid, one slash: the tall plants, agave included), brambles (solid, thorny: a chop or three slashes). Trails and
clearings stay open and fast. Skitters and Crawlers slip through undergrowth (ferns don't slow them), Razorbacks
bulldoze it, Feral Scavengers need paths and wade through ferns like you.

**A solid jungle** (Stage 6, `SOLID`/`GROUND` in `src/data/jungle.js`): everything that looks solid blocks you and the
creatures alike — tree trunks with their root flare, fallen logs, boulders, stumps, every ruin, crates and other
containers (opened ones too), objective props, pylons and the Relay. Each footprint follows the base of its art (a
rounded box), never the canopy, so you slide smoothly along it. Ground decals and leaf litter stay walkable. No
undergrowth grows on or right in front of a log, rock or ruin, so nothing solid hides in the ferns.
**Water:** shallow edges, ponds' rims and mud only slow you. Deep water (the dark channel with a pale drop-off line)
can't be crossed by anyone: rivers are crossed at **fords** — where a trail meets the river, plus ~3 more per river —
drawn as stepping stones in shallow water. Generation guarantees that every site, pylon and container can be walked
to from the Relay (brush counts as passable, since you can cut it); anything cut off gets a ford, or the trees in the
way are removed.

**A day:**
1. The Relay drone drops you at the Relay, or at an activated pylon if that still leaves a trek of ≥ 50 m to the
   objective (start → every step) and saves ≥ 12 m (`DAY.minTrek`, `DAY.pylonSaving`).
2. Today's objective is in the district you picked at the briefing, at real sites on the map (marked ◆ from the start):
   sites ≥ 45 m from the Relay first, lost sites before trail-side ones (`DAY.objectiveMinDist`).
3. Loot supplies (crates, chests, rare caches, intel terminals; ~34 hidden caches deep in the brush, ≥ 3 tiles off any
   trail), do optionals
   (nest, stranded engineer, data drive, locked cache — announced when you get near). Off the goal's path: **relics**
   (old strongboxes at lost sites, shrines at landmarks, the odd hidden cache), **data logs** and named places (see
   *Relics* and *Named places and data logs* below).
4. Activate pylons (hold E 2.5 s): they become return points for the rest of the run and map their surroundings.
5. **Return** to the Relay or any activated pylon (hold E 2 s) to bank what you carry ("Head home"). Allowed any time once offered (you carry loot, the goal is done, you are hurt, or 75 s in; never at the drop-off right away); the
   objective's skill point and boon only count if it was done.
- **Daylight** lasts 300 s. At **sunset** the light shrinks around you over 70 s of dusk and **hunters** come in
  packs (every 18 s → 9 s at full dark, +1 per pack from night 4). There is no hard fail: the jungle just gets worse.
- **Death:** carried loot (and carried med kits and relics — the drone never saves a relic) is lost, but on nights 1–3 a drone salvages 35% / 30% / 10% of it and
  at least 20 / 20 / 12 Scrap, never more than you carried (the floor applies once you are 15 s into the day, so
  abandoning at once earns nothing; `deathSalvage`, `deathScrapFloor`, `Run.salvageFor`). You return with 35 HP and
  wake with at least 60 (§2 Death rules). The goal keeps its skill point; its reward needed you home. Cut trails,
  pylons, towers, banked resources and research are kept. (Critic G: one early death used to decide whole runs.)
  The death modal and the abandon / quit confirms list what's lost, what the drone saves and tomorrow's health.

**Wildlife** (`POP`): rolled per 16 × 16 chunk per day, denser further from the Relay and in today's district,
scaled by night. It appears ≥ 15 tiles away (off screen), despawns far behind you, and stays dead for the day once killed.
Feral camps hold 2–4 Feral Scavengers. Walkers never spawn inside brush (an open tile with ≥ 3 open neighbours).
**Enemies** (`EXPLORE_ENEMIES`; critic I made walking stop being the answer to everything):
- **Melee lunges track you:** the landing ring follows where you're heading for the first 60% of the wind-up — it
  leads you by ~90% of the time from the lock to the lunge arriving (≈0.3–0.4 s at walking pace; a roll's burst isn't
  extrapolated), so walking past or circling a pack gets you intercepted — then locks: turn or roll *after* the lock.
  A creature also starts its wind-up when you'll be in reach by the end of it (running at one meets the lunge).
  Lunge reach: Feral 2.8, Crawler 2.4, Skitter 1.9 (they wind up from 1.7 / 1.5 / 1.5 tiles).
- **Bramble Crawler** (lunge; its bite bleeds), **Skitter** (fast; it takes a slot behind you and chitters for 0.15 s
  before its wind-up), **Feral Scavenger** (spear thrust; from night 2 it may thrust twice — a second, shorter lunge
  0.35 s later at 60% damage; if it can see you but can't reach you for 1.5 s, or you're > 4 tiles off in the brush, it
  **throws its spear** — a 0.9 s line telegraph that leads a walking target until 0.4 s before the throw, 14 damage,
  3.5 s cooldown, no attack token, one spear at a time — and if it can't see you it hacks a brush
  tile toward you every 0.8 s), Spitter (rooted, lobs sap over the brush: its sight ignores undergrowth, only walls,
  trees and ruins block it), Razorback (wind-up, charge, crashes through brush; its lane is drawn as wide as the hit and
  shows through foliage; the **elite** re-aims for 0.5 s and charges again, and stamps a 1.6-tile ring when you're close).
- **Thorn Stalker** (night 3+, in fern-heavy chunks, `POP.stalker`): travels *under* the brush — only rustling leaves
  and a soft chk-chk give it away — and surfaces under you (a 1-tile ring for 0.7 s) for 16 damage and a 0.6 s root
  (a roll breaks it), then stays out 1.5 s (the only time you can hit it) and burrows again. Stay out of the ferns, or
  listen. Its own sheet (`thorn_stalker`: a red-violet body with a bone-white thorn crest), not a re-tinted Crawler.
- **Bloater** (day 4+, `DAY_CREATURES.bloater`: a 30% chance per chunk × the area's weight, most in the Greenhouse; about
  1 in 10 creatures): a slow, dark sac-backed beast (`bloater`: its own sheet, a lime spore sac on its back; 50 HP,
  1.7 t/s) that walks at you, swells for 0.9 s (a spore ring) and
  bursts into a spore cloud (10 damage + the cloud); it bursts when killed too. Any heavy chop, at any health,
  **launches** it 3.5 tiles along the swing, where it bursts away from you. Back off from the swell, or chop it away.
- **Feral Chief** (day 5+, `DAY_CREATURES.chief`): leads every Feral camp (72 HP, gold-tinted Feral); Ferals within 8
  tiles of it move 20% faster. Kill it first.
- HP breakpoints: one light slash kills a Skitter on nights 1–3, two kill a Crawler through night 3.
Every big attack is telegraphed. A creature's dim red ground ring shows only while it is a threat (critic H2 §5.8,
`HUD.ringNear`): winding up or attacking, holding an attack slot, alerted and within 2.6 tiles of you, and always on
elites and area bosses; the rest keep only their blob shadow, so a calm herd doesn't paint the ground red. Kills leave
a splat in the creature's colour (sap for Crawlers / Burrowers / Seed Carriers, blood for Ferals / Razorbacks / Stalkers,
magenta for Skitters, acid for Spitters / Bloaters) stained into the ground under it: never darker than that ground.
Kills sometimes drop 1–3 Scrap (a top-up, not income).
**Attack tokens** (`CONFIG.expedition.attackers`): at most 2 melee/charge attackers wind up on you at once (3 from
night 5), no new wind-up starts for 1 s after a melee hit lands. Anything that can't attack yet (no token, or still on
cooldown) holds a slot ~2.4 tiles out on your flanks or back (120–180° off your aim; Skitters right behind you) instead
of walking in; after a lunge the attacker hops 0.7 tiles back; bodies keep 1.45× their radii from you (`CROWD`). With
the 0.6 s post-hit i-frames a pack can't chain hits: a Feral + 2 Crawlers on night 2 deals ~30 HP in 6 s to a player
standing still.
**Environmental kills:** a creature knocked back at ≥ 2.5 t/s into a trunk, rock or ruin (with 0.3 tiles of slack: a
knock that ends just short still slams it) takes +10 and reels 0.5 s; into a bramble +14 and 0.6 s, and nicks it; a
Razorback charging into a trunk, rock or ruin takes +12 and its stun (`SPLAT`). Bark chips, falling leaves, a dust ring,
a crack, a hit-stop and a shake sell it; a finisher or a chop into nearby cover splats about one fight in two. Spore clouds hurt creatures too (6 per 0.6 s) and choke them (×0.6 speed,
no new wind-ups); Ferals, Crawlers and Razorbacks set pods off, a charging Razorback pops them, and a heavy chop
launches a pod 3.5 tiles along your swing, where it bursts.

**Spore pods** (`SPORES`, `src/entities/SporePods.js`): the hazard, 28 in the Canopy Greenhouse and 5 in each other
district, beside trails and clearings; they regrow every day. Walk within ~1.3 tiles and a pod swells (0.7 s ring
telegraph), then bursts into a dithered cloud (radius 1.9, 5 s): 5 damage every 0.6 s and −30 stamina/s while you
stand in it. Any machete hit pops it at once (the heavy chop reaches about as far as the cloud — and launches it).
**Safe Hands** halves the damage and stops the drain.

**Loot** (carried until you return): base yields below, rolled per container with that district's multipliers and
a **distance multiplier**: Scrap ×0.45 within 12 m of the Relay or any pylon, rising to ×0.9 beyond 50 m
(`JUNGLE.lootDistance`); rare caches closer than 28 m become tool chests. Per site: major 2–4 containers, minor 1–2,
camp/landmark 0–1, +1 at lost sites. **Budget:** a normal day (objective + ~11 containers + ~20 kills) banks ~70–100
Scrap (offline estimate over 12 worlds: mean 80, p10 62, p90 101; the Market's ×1.3 sits at the top). Med kits heal 25;
carry at most 2.

| Container | Yield | Hold E |
|---|---|---|
| Crate | 4–9 Scrap | 0.6 s |
| Tool chest | 9–14 Scrap, 35% chance of a Circuit or Biofiber | 1.0 s |
| Rare cache | 13–19 Scrap + 1–2 components | 1.5 s |
| Intel terminal | 1–2 Intel | 1.0 s |

**Primary objectives** (`src/data/objectives.js`) keep their boons; steps are placed at sites of today's district
(a site used for an objective is never reused): Restore the Relay Box (fuse at a side site, power box at a ruin),
Recover Route Data (hold 7 s, enemies come), Activate Pumps (two sites), Salvage a Power Cell (guards burst out),
Clear the Blockage (an elite Razorback appears when you get near). **From day 2** five more join the deal (`minNight`;
run by `src/scenes/JungleGoals.js`, tuning in `GOALS`). Each has one plain sentence used word for word on the card, the
start banner, the GOAL strip and the summary, and a live note on the strip (his health, time left, nests popped):

| Goal (sentence) | How it plays | Reward tonight |
|---|---|---|
| Bring the stranded engineer home | Find him (hold E 1 s); he then follows your trail at 4.2 t/s, 1.8 tiles behind (14+ tiles back he stops and the strip says "go back for him"; wedged, he hops to your trail). 60 HP, green outline. Half of the melee/charge creatures that come within 9 tiles of him go for him instead of you. The drone takes him within 5.6 tiles of the Relay or a beacon you switched on. If he dies the goal **fails** (strip ✘, summary "failed", no reward; the day goes on) | Two free tower upgrades |
| Hold the uplink until it comes online | Start it (hold E 1 s): today's area beacon if it's still off (its own switch waits), else a terminal at a site. 45 s of booting that only counts while you stand within 7 m (a cyan ring, blinking when you're out); packs of 3 / 4 / 5 at 0 / 15 / 30 s from 11–15 tiles out, half of them go for the uplink and each hit costs it 3 s. Done: the beacon comes on too | 15% fewer enemies |
| Track down the Alpha and kill it | Three sets of tracks (footprints, bones, twigs; they glint within 12 tiles), each 20–30 m on from the last in roughly the same direction (best of 40 seeded tries); walking within 1.7 tiles reads one ("Claw marks on the bark: it went north-east"). The Alpha waits 10–16 m past the last: the area's biggest beast (Razorback / Feral / Crawler), elite × 1.5 HP | A rare relic (dropped by the Alpha) + towers 10% stronger |
| Carry a generator core home | Pick it up (hold E 0.8 s): ×0.75 speed, no rolling, no swinging; E sets it down in front of you (fight, then hold E 0.5 s to pick it back up). The drone takes it within 3.2 tiles of home | +30 Scrap and 2 Circuits on getting home |
| Pop all three spore nests within a minute | Three tinted nests (30 HP × the night's creature HP) 3–7 tiles round a site, in the open. The first pop starts a 60 s clock; too slow and they grow back. Each pops into a spore cloud and puffs one at you every 6 s while you're within 3 tiles (a ring first) | Enemies 10% slower |

The guided first day keeps `GUIDE.objective`. On an escort day there is no "Rescue the stranded engineer" bonus task.

**Events** (`EVENTS`, `EVENT_RULES`): from day 2 (never on the guided day), one a day at a camp or minor site in today's
area, picked by seed. Within 10 tiles a toast names it with its reward and its risk, then it's marked on the map (the
bonus-task colour); the hold prompt repeats both. **Abandoned Workshop**: hold 6 s for 40 Scrap; up to 2 creatures come
while you work. **Power Surge**: hold 3 s, towers deal 15% more damage tonight; up to 3 creatures come. **Infested
Cache**: guards (the night's guard cap, 2–4) burst out at 7 tiles; hold 2 s for 30 Scrap, 2 Circuits, 2 Biofiber. The
summary lists it under Bonus; a flag reward joins tonight's rewards.

**Area bosses** (`src/data/bosses.js`, `src/entities/AreaBoss.js`; critic J M5, redesigned after critic I2): from day 3
every area whose boss still lives has it in a lair at its lost major site (else its furthest lost site), brush cleared
round it, no crate, strongbox or data log within 6.5 tiles (they're moved 7–9.5 tiles out) and no wild spore pods, marked ☠ on the minimap
and big map and on the briefing card ("Boss: ☠ Thorn Mother · Optional"). Nothing roams in a lair, and no goal, bonus
task or event uses it. Lairs sit at least aggro + leash + 6 tiles apart, and **only one boss fights at a time**: while
one is engaged the others stay asleep, so the HP bar never switches mid-fight; the Pack Lord never follows you more than
9 tiles from its own site unless it's the one fighting (then it walks home quietly), and leaving a boss you never hurt
says nothing. Walk within 9 tiles and the fight starts with one clean beat: its name and line as a red banner (the
first time also "Kill it and the <area> sends no danger at night for the rest of the run"), the boss music, the camera leans 45% toward it,
and the big HP bar top centre (a mark at 50%) once the banner has gone. A kill is a KILLED banner first, its rewards one
line under it 1.2 s later. Phase 2 swaps the boss to its cracked, glowing `_p2` sheet with a drifting particle aura;
the Pack Lord is drawn ×2 with a gold ring in a 4-tile clearing. HP 600 × the night's elite multiplier (1260 on
day 3; the Pack Lord ×0.75). At 50% it roars (1.4 s, taking 30% damage), turns red and switches to phase 2. Walk 20+
tiles from the lair for 4 s (or go down) and it recovers to full. Every move has a ground telegraph and every hit can be
rolled through.

A boss fight is a **pattern**, not moves on timers: each phase loops a fixed move order with one or two "wild" slots,
each move announced by the boss's windup pose (its silhouette rears) and a ground telegraph, then a short recovery. The
big move of each boss ends in an **opening**: for ~2–2.6 s it is spent (it flashes yellow, the bar turns yellow and
reads e.g. "Overheated: hit it! (×1.5 damage)"), makes no moves and takes ×1.5 damage. No spot is safe: each
stationary boss has a ring round itself (3.4–3.7 tiles: past the machete's reach) and a move that reaches you at range.
Its minions (brood, drones, the pack) drop nothing and feed no kill-heals (Second Wind, Blood Moss), and are capped per
fight. Aim: a player who reads the telegraphs and rolls wins in ~45–90 s taking 20–60 damage on day 3–4; standing and
mashing loses to the Thorn Mother and the Warden.
- **Thorn Mother** (Canopy Greenhouse): whip → (thorns | whip) → whip → spore barrage → *Wilted*. Whips: a red lane
  (phase 2: 3 fanned) 5.4 tiles long, 0.7 s, 14 dmg, deflectable — a parried whip staggers her for 1.2 s (an opening).
  Thorns: a 3.5-tile ring round her. Barrage: she rears back, then lobs 3 / 4 pods: a spore-green ring the cloud's own
  size (1.9) for the cloud pod (one per barrage, at most 1 / 2 of her clouds at once, 3.5 s), red 1-tile rings for the
  rest. Phase 2 adds Crawler brood (2 at a time, 6 a fight). Spore clouds draw their edge, so you can see where it ends.
- **Brood Hive** (Overgrown Market): brood → eggs → (eggs | burst) → burst → *Split open*. Brood: 2 Crawlers (at most 3
  alive, 12 a fight); each live one shields it 15% (up to 60%; the bar turns grey, "Brood shield"). Burst: a 3.7-tile
  egg ring (phase 2 hatches 2 Skitters); after it the shell gapes open: no shield, ×1.5 damage. Eggs: 2 / 3 sacs lobbed
  at and round you (phase 2: they hatch Skitters).
- **Security Warden** (Municipal Data Center): mortar → (stomp | mortar) → stomp → laser → *Overheated*. Mortar: 2 / 3
  strike rings, the first where you're heading. Stomp: a 3.4-tile shockwave. Laser: a thin aim line for 0.85 s, then a
  150° sweep at 85°/s, 9.5 tiles, 16 dmg (phase 2: two opposite beams). Phase 2 also calls security drones
  (steel-tinted Skitters, 6 a fight).
- **Drowned Engine** (Flooded Transit Station): vents → blast → (vents | blast) → surge → *Venting*. Vents: 3 / 4 steam
  rings under and round you. Blast: a 3.6-tile steam ring. Surge: a 14-tile water lane, then a wave rolls down it
  (phase 2: two lanes).
- **Pack Lord** (Collapsed Residential Block): the mobile one, a deep-red Feral Chief with boss HP ×0.75, 2 Ferals,
  boss-readable lunges (1.0 s wind-up, ×0.85 damage, 35% double thrust; deflect them) and a war cry: it stands and howls
  (0.9 s, a 6-tile ring: Ferals inside move 30% faster for 5 s), then it is *Winded* for 1.8 s (×1.5 damage). Stay
  within 2.2 tiles and every 4 / 3.2 s it plants its feet and **rends** (0.9 s, a 2.7-tile ring, 15 dmg) — even mid
  wind-up or flinching, so it can't be stun-locked by mashing (a parried lunge still gives you your window). Phase 2:
  each cry calls 1 more Feral (3 a fight) and it rages at ×1.2 speed.

The kill: a rare relic (`scene.dropRelic`; else 30 Scrap, 2 Circuits, 2 Biofiber), +30 Research, a skill point on top
of the trip's, and that area's night danger is gone for the rest of the run (`run.bosses`; its card's Danger reads
"None: you killed the Thorn Mother", in green). The summary shows a Boss row. Bosses are optional: none stands between
you and a win.

**Weather** (`src/data/weather.js`, `src/world/Weather.js`; critic J N2): from day 2, 35% of days (seeded per run and
day; never the guided day) have one, shown on the briefing ("☂ Rain today: …") and as a tag under the area name on the
HUD, with a toast at the start:
- **Rain**: creatures see you at 70% of their range, your cutting draws them from 60% as far, nothing rustles (your
  ferns or theirs); 1-px slanted rain streaks, ground ripples, a cooler grade, the rain bed in the ambience.
- **Fog**: your light radius ×0.65 and a dithered veil that thickens from 30% to 105% of it (dimmer after dark);
  containers hold 20% more Scrap (`Run.lootMults`).
- **Heat**: stamina refills 25% slower and spore pods ×1.5 (extra ones grow beside the others); a warm haze and
  stronger light shafts.

**Districts** (`src/data/districts.js`) keep their bonus, enemy mix and night threat; the briefing shows where each
lies (compass direction and distance from the Relay, pylon status). **Honest cards (critic J item 11):** the area's
`loot` multipliers apply to every container looted that day, wherever it is (`Run.lootMults()`: the chosen area × the
run's Picked Over modifier), and the card says so ("+30% Scrap in all you loot today"). The V1 promises with nothing
behind them (rooms, ambush chance, alarms, extra containers, the Pulse Cutter `TOOL`) are gone. Offers avoid repeats:
an area offered last night weighs ×0.08, one offered earlier ×0.3, one visited ×0.8 (`AREA_OFFERS`); in a 2,000-run
sim one area turned up on 4+ of 6 nights in 2.75% of runs (74% before). Goals avoid the last two nights' goals.

### Relics (Stage 7, critic J §7 / M3)

A reason to leave the goal's path. **24 relics** (`src/data/relics.js`), each a small rule change for the rest of the
run: 11 common, 9 rare, 4 cursed (a strong upside with a real price, always written in red-violet).

**Where they are** (placed per world by `JungleGen.siteFeatures`, from their own seed streams so nothing else moves;
`RELIC_SOURCES`):
- **Old strongboxes**: every lost major site holds one behind its bramble ring (about 4 per jungle). Hold E 1.6 s and
  a relic pops out (common 60 / rare 28 / cursed 12).
- **Shrines**: every landmark is one (5 per jungle). Hold E 0.8 s, then **pick 1 of 2** (common 50 / rare 34 / cursed
  16; never one you have or carry). "Leave both" keeps the shrine for later. A **radio mast** also maps the land 40
  tiles around it; a **glasshouse**'s rain cistern heals 40 (once each per run).
- **Hidden caches** in the brush: 12% hold a relic as well.
- **Area bosses** drop a rare one (`scene.dropRelic(x, z, { rarity: 'R' })`).
A strongbox or shrine shows on the map (gold) once you've been within 9 tiles or mapped it; a relic on the ground is a
gold star. Expected haul: ~5–7 a run if you go looking (a lost site or landmark on most days, plus luck).

**Carried, then banked.** A relic you pick up is carried loot: its icon sits under your loot on the HUD (with its line
in the pause menu). Get home and it is yours for the rest of the run (the summary's **Found** row); go down or abandon
the trip and it's lost (the death modal and the abandon confirm say so, the summary shows it struck through under
**Lost**; the drone never saves a relic). Day effects work from the next trip on, night effects from that very night.
The guided first day has none of it (no strongboxes, shrines, logs or place banners).

| Relic | Rarity | Does |
|---|---|---|
| Whetstone Charm | C | Machete damage +20% |
| Tapir-hide Boots | C | Ferns slow you to ×0.75 instead of ×0.5 |
| Lantern Moth | C | After sunset your light reaches 3 tiles further; hunters come 4 s slower |
| Bramble Gloves | C | Light slashes clear brambles |
| Spore Sac | C | Spore clouds hurt creatures ×2, you ×0.5 |
| Featherfoot Anklet | C | Rolls cost 25% less stamina |
| Medic's Satchel | C | Carry 3 med kits; each heals +10 |
| Cracked Lens | C | Each tower's first hit in every push deals ×3 |
| Old Battery | C | +1 Circuit every night before the attack |
| Seed Bank | C | Thorn Nests and Snare Vines need no Biofiber |
| Rusted Bell | C | Towers +25% damage to Razorbacks and Ruin Guards |
| Scavenger's Compass | R | Hidden caches within 20 tiles show on the minimap |
| Hunter's Fang | R | A perfect dodge refills stamina and doubles your next hit |
| Ironwood Grip | R | The heavy chop charges 40% faster |
| Drone Tag | R | Going down, the drone saves 60% of carried loot (not relics) |
| Lifeline Idol | R | Once a day a killing hit leaves you at 1 HP, untouchable 1.5 s |
| Pylon Coil | R | Towers +4% attack speed per beacon switched on (max +20%) |
| Root Heart | R | The Relay heals 1 HP every 4 s during the attack |
| Overcharged Capacitor | R | Relay Protocols recharge 25% faster |
| Signal Booster | R | Relay Protocols cover a 40% wider circle |
| Hungry Idol | X | Containers +40% Scrap · *an extra pack of 4 Crawlers every night* |
| Blood Moss | X | Jungle kills heal you 2 · *Relay max health −15* |
| Glass Machete | X | Machete damage +50% · *you take 30% more damage* |
| Storm Totem | X | Towers +20% damage · *enemies move 10% faster at night* |

Every effect is read through one place, `Run.relicMod(field)` (fields and where each is read: the header of
`src/data/relics.js`). The briefing's attack-per-path and med-kit cap, the night prep's "Also tonight" and the summary
all show what owned relics change.

### Named places and data logs (Stage 7, critic J N4)

**Names** (`src/data/lore.js` `PLACE_NAMES` / `LANDMARK_NAMES`): every major site gets a name from its area's list
("Kiosk Row", "Platform 9", "Server Hall 2"), every landmark one from what stands there ("The Stone Watcher", "Radio Mast
K-7", "The Orchid House"); never the same name twice in a jungle. Names appear on the big map once the place is mapped,
and as a small banner ("Kiosk Row · Overgrown Market") the first time you walk in each run.

**Data logs** (`LORE_LOGS`): 20 short logs (2–4 plain sentences, the Relay crew's dry, tired voice) telling how the
Canopy Program's vines swallowed the city, why the Relay still stands and what comes at night. About 60% of major sites,
35% of minor ones and half the landmarks hold a glowing log (~10 spots a jungle; at most one per site). Hold E 0.6 s to
read the **next unread** log in story order (a card bottom-right); ~3–4 a run, so the story unfolds across runs. Read
logs are kept forever and re-readable in the Collection's Codex. A spot with nothing left to read goes dark.

## 5. Defense (night)

**Maps** (`src/data/defenseMap.js`, Stage 7 night board): a 23×15-tile field; the Relay sits on a paved plaza at the
right, and two waypoint trails come in from the jungle on the left. Each run plays one of three layouts, picked from the
run seed (`run.mapKey`; old saves use Twin Paths): **Twin Paths** (two winding trails that meet at the Relay),
**Crossing** (the trails cross mid-map, so towers in the middle cover both) and **Ford** (a stream runs down the map and
both trails cross it on stepping stones). 11–12 build pads sit beside the trails (stone plinths,
a few timber ones); towers can never block a route. The trails are labelled by compass (North / South path), and each
lane faces a direction in the jungle: **tonight's area danger enters from the lane facing the area you visited**
(⚠ on that lane's tag, "Comes down the South path (Flooded Transit lies south-west)" in the preview). **Every beacon you
switched on in the jungle opens a forward pad** out on the lane facing it (up to 2 per lane; cyan lamp; the build list
says "Forward pad · your north-west beacon"); a pad with a tower on it stays for the rest of the run.

**Board** (critic H §4, K §4–5): the night is drawn like the day — whole-number zoom, 32 px per tile, texel-exact. It opens
on the largest zoom that shows the whole field (×1 at 1280×720 / 1366×768, ×2 at 1080p and 1440p; ×2 when only ×1 would fit
on a big screen and ×2 still shows most of it). Mouse wheel or **+ / −** (and the zoom buttons in the top bar) step the
zoom; **right- or middle-drag** or the **arrow keys** pan (clamped to the field); **Home** re-frames. Built pads carry no
marker; empty pads glow only when they matter (hover, affordable while building, the first prep); a hostile ring shows only
under the enemy you point at and the selected tower's target, and during a push only those, the boss and the big ones
(Tank / Elite: Razorbacks, Ruin Guards) carry a health bar. Pads are hand-made stone, timber or rubble plinths (varied by
seed; timber on wood pads); a level 2 / 3 tower shows its rank as a 2- or 3-chevron plate on the plinth's front face.
Protocols are pixel art: the aim is a 1-px dashed ring in the protocol's colour, Vine Snare wraps each rooted enemy in
roots that burst up then hold, a Flare is a stepped amber light pool with the burning canister in the middle, Arc
Discharge is lightning bolts; no translucent discs. Moonlit blue with amber lamp pools at the plaza; enemy eyes
and the Relay crystal glow. Rewards show on the map: a slowed path looks wet, towers boosted by a reward glint.
**Leaks:** while enemies come, a "Got through" feed in the side panel lists each leak ("−15 Ruin Guard · South"); the
survived/fallen banner sums the night ("Got through: 9 Bramble Crawlers −45 · 3 Skitters −9"), and the run keeps the
tally (`run.lastNight`) for Results' "What got through".

**Prep phase:** build, select, upgrade, sell (70% of total Scrap spent, rounded down), set targeting
(**First in line** = furthest along its path / **Closest** to the tower / **Toughest** = most health left), repair
(25 Scrap → +15 HP; near max you pay only for the HP restored, rounded up), spend Intel (Decrypt: 1 Intel → +4 Research Data;
Sabotage: 3 Intel → tonight's wave 10% smaller, once per night), read the wave preview, then Start Wave.
All wave-size cuts (objective boons, nest, Sabotage) multiply together but never go below 80% of the wave (−20% at most);
the preview says "(capped at −20%)" when the cap applies, and Sabotage is greyed out once it does.
Kills pay small fractional bounties (½ Scrap for a Crawler or Skitter, 1½ for a Razorback, 2 for a Ruin Guard), paid as whole Scrap.
The Relay pays a **stipend** at the start of each prep: +10 / 15 / 20 / 25 / 30 Scrap on nights 2–6 (`CONFIG.relay.stipend`).
Each tower you already own of a type adds +6 Scrap to the next one of that type (shown on the build card).
**Scrap exchange** (prep only, from night 2, with the wave preview open and ≥ 60 Scrap): trade 35 Scrap for 1 Circuit or 1 Biofiber,
twice a night (`DEFENSE.exchange`). Every prep action re-saves the run.

**Readiness** (`src/scenes/DefenseForecast.js`, `READINESS` in `src/data/guide.js`): above Start Wave the panel shows
"Your defense ●●○ Risky" and one line per path: "North ●●● · South ○○○ · expect −20 to −45 Relay health". It is a fast
1-D replay of tonight's pushes (variant, district threat, Overgrowth) against the real tower stats, the stretch of path
each tower covers, slows (multiplicative), Spitters, Burrowers, seed bursts, the boss's roots and siege, and your Relay
Protocols as a damage-equivalent. Calibrated on the balance sim (raw prediction × 0.65 matches the sim's losses; a path no
tower reaches is always ○○○, so a one-path build never reads strong). **Too weak** = predicted loss ≥ 35% of the Relay's
health ("Too weak: expect heavy damage"; 5 level-1 towers on night 3 read weak); **Looks strong** = predicted loss ≤ 6 with
every path ●●○ or better; otherwise **Risky**. Starting a weak night asks first: the button becomes **Start anyway** for 8 s,
and only that button or **Shift+Space** starts it (a plain Space double-tap can't skip the warning).

**Pushes and lulls** (critic K #5): a night comes in **pushes**: 2 on nights 1–2, 3 on nights 3–6. Between two pushes is a
**lull** of 12 s (real time, not sped up): you can build, upgrade, sell and repair again, and the board says "Lull: push 2 of
3 comes in 9 s". **Call next push** (button or **N**) ends it early and pays +1 Scrap for every 2 s skipped; it also works
while a push's last enemies are still walking in (skipping the whole lull). Rapid Response's head start applies to each push.

**Wave phase:** no building, upgrades or repairs while a push runs. You can pause (Space, Esc or P; Space doesn't pause for
0.6 s after a push starts, so a double-tap can't start-then-pause), play at 1× / 2× / 3× (F) and change targeting.
Leftover resources carry over. The run is saved as the wave starts and at every lull: quitting and pressing Continue resumes
at the start of the night or the last lull reached, with the towers and Relay HP saved then (after a 3-second "Get ready"
beat). Surviving saves the next briefing at once; a defeat ends the run at once.

**Relay Protocols** (`src/data/protocols.js`, `src/scenes/DefenseProtocols.js`; critic K #1): three active abilities on the
night board, in a bar under the side panel, usable during pushes and lulls. Press the hotkey (or click the button), aim the
ring on the board, click to cast (right-click / Esc cancels). Each button shows its cost and a cooldown sweep.

| Protocol | Key | Cost | Cooldown | Effect |
|---|---|---|---|---|
| Vine Snare | Q | free | 28 s | Roots every non-boss enemy within 1.6 tiles for 2 s (after a 0.4 s telegraph). The Colossus is held 1 s and a charge wind-up is cancelled ("CHARGE STOPPED"). 2 charges from night 4. |
| Arc Discharge | W | 1 Circuit + 10 Scrap | 18 s | 40 + 20 × night energy damage to everything within 1.4 tiles (0.6 s telegraph). Research: Arc Discharge. |
| Flare | E | 1 Intel | 30 s | Lights a 3-tile circle for 6 s: burrowed enemies inside can be shot, and towers inside deal +25% damage. Research: Flare. |

Vine Snare is always available; Arc Discharge and Flare are research unlocks (`protocol_arc`, `protocol_flare`; debug runs
have all three).

**Post-night salvage** (`SALVAGE` in `src/data/waves.js`, critic K §9): the "Night survived" banner offers rewards to pick
from: 3 options if the Relay lost ≤ 10 tonight, 2 if ≤ 40, otherwise 1 (keys 1–3 or click). **Spare parts** (+1 Circuit,
+1 Biofiber), **Free upgrade** (the first upgrade next night is free), **Tune-up** (+15% range for the night's best tower,
for the rest of the run), **Relay patch** (+20 HP now), **Scrap haul** (+25 Scrap). The offer is seeded per run and night.

**Towers** (`src/data/towers.js`; three levels, level 3 is a choice of two branches: two half-buttons in the tower
panel, each with its name and one line; the tower's sprite becomes `<type>_3a` / `_3b` when one exists). Level 2 is the
good buy (≈ +70% damage per second for ≈ 0.9× the build cost); level 3 costs about 1.2× the build plus components.

| Tower | Cost | Role | Level 2 | Level 3: branch A | Level 3: branch B |
|---|---|---|---|---|---|
| Scrap Turret | 45 S | Single target, range 4.5 | +40 S: fire rate 0.7 → 0.5 s, 12 damage | **Piercer** +55 S 1 C: 24 damage, ignores shields, ×1.5 vs big enemies | **Repeater** +55 S 1 C: 9 damage every 0.22 s |
| Thorn Nest | 35 S, 1 B | Short (3.5), rapid | +32 S 1 B: 6.5 damage, 30% slow on hit | **Briar** +50 S 2 B: 40% slow that splashes (1.6 tiles) | **Hornet** +50 S 2 B: 8 damage every 0.18 s |
| Arc Spire | 35 S, 2 C | Chain lightning (11 damage, 60% per jump), hits burrowed | +34 S 1 C: 14 damage, +1 jump, 70% per jump | **Storm** +55 S 2 C: 5 jumps at 80% | **Lance** +55 S 2 C: one 55-damage bolt, 0.25 s stun |
| Snare Vine | 30 S, 1 B | Area slow 45% (lingers 2.6 s), range 3.3 | +28 S 1 B: 60% slow, range 3.7 | **Root** +50 S 2 B: roots 0.8 s (big enemies 0.5 s), every 4 s per enemy | **Thorn Field** +50 S 2 B: 12 damage per pulse to all in range |
| Mortar Pod 🔒 | 60 S, 1 B | Long-range splash (28 damage, every 1.9 s) | +52 S 1 B: 36 damage, bigger blast | **Napalm** +65 S 2 B: burning sap 12/s for 2.5 s | **Cluster** +65 S 2 B: 3 bomblets × 16 |
| Pulse Beacon 🔒 | 50 S, 2 C | +20% attack speed to towers within 4.5 | +44 S 1 C: +35% | **Overdrive** +60 S 2 C: +40%, 15% bonus-attack chance | **Spotter** +60 S 2 C: +15% damage, +10% range |

🔒 = unlocked with research. Range shows while placing or when selected. Towers boosted by a beacon show an amber ring; level
2 and 3 towers show 2 or 3 rank chevrons above them. Build-card pips tell the truth: Power / Slow / Boost / Speed / Range rows,
only the ones a tower has (the Mortar has Power 2, the Snare a Slow row).

**Relay Core:** 100 HP. It takes damage when enemies reach it. Show a hit cue, with screen shake that can be turned off in settings.
**The Relay zaps back** (`RELAY_ZAP` in `src/data/waves.js`): during pushes the crystal fires a cyan energy bolt every 0.7 s
at the enemy closest to it within 3 tiles, for 13 × that night's health multiplier (so it keeps the same weight every
night); with nothing that close it returns fire at a planted Spitter. It never hits burrowed enemies. Night prep says so
once ("Your Relay zaps anything that gets close, and Spitters that spit at it"), and the readiness forecast counts it. A
flat backstop like this is worth a lot to a 2–4 tower defense and little to a 9-tower one, which is what lets the early
nights bite a good build without killing a thin one.

**Enemies** (`src/data/enemies.js`):

| Enemy | Role | Notes |
|---|---|---|
| Bramble Crawler | Basic | — |
| Skitter | Fast | Tests slows and rapid fire |
| Razorback | Tank | Slow, very high HP; 9 Relay damage |
| Spitter | Ranged | Stops near the core and lobs sap after a visible wind-up |
| Burrower | Ambusher | Underground for part of its route; bullet towers can't target it there |
| Seed Carrier | Swarm | Bursts into seedlings unless killed by a blast (a blast hit tags it for 3 s, so a turret can finish it cleanly) |
| Ruin Guard | Elite | 190 HP, shield halves kinetic damage (a Piercer ignores it); 10 Relay damage |
| Canopy Colossus | Boss | 1020 HP (×4.5 on N6 = 4590; the Codex shows both). Its first walk is longer (14 s) so its first root happens in tower range. Loops approach → rooted (telegraph, a Crawler sprouts) → charge (wind-up, then fast; a Vine Snare cancels the wind-up); has a big HP bar. At 60% health it stops and roars (red ring, shake, toast "The Colossus is enraged!"; it takes only 30% damage while roaring), turns red and loops faster: 4.5 s approach, faster and longer charges, and each root also spawns 3 Skitters. It never "leaks": 2.5 tiles before the end of its lane it stops on the plaza and **besieges** the Relay ("SIEGE — slamming the Relay!"): a 0.8 s ring telegraph, then 5 damage, every 3 s, until it is killed; after 8 slams it collapses, spent (the night still holds, and Results says "The Relay held the Colossus off"). Night 6 prep says to set one or two towers deep on its path to Toughest and keep the rest on First in line |

**Waves** (`src/data/waves.js`, critic K / J M2 / M6):
- N1: Crawlers + Skitters. N2: the first Razorback (one per variant). N3: Spitters and Razorbacks (tank-heavy).
  N4: Burrowers + Seed Carriers. N5: Ruin Guards (one per group). N6: two thin support pushes, then the Colossus with an
  escort in the last push. From night 2 the waves are fewer, tougher enemies: a leak costs its own Relay damage however
  thin the defense, so a weak build's worst night stays bounded while a good one still has to handle the tanks.
- **Variants:** every night has three authored variants (A/B/C, e.g. N1 "Crawler column" / "Skitter scouts" / "Pincer",
  N6 "The Colossus (south)" / "(north)" / "and its guard"), picked per run and night from the run seed (`variantFor`), so the
  briefing, prep and a Continue agree. Lanes are taken modulo the map's lane count; the district threat enters from the
  lane facing tonight's area (the board's lane-facing helper).
- **Long Night** (nights past 6): `waveFor(night, variant)` reuses nights 4–6's patterns in turn without their boss, counts
  +10% per night past 6, health ×1.2 per night, and a Colossus in the last push every 3rd night (night 9, 12, …).
- Enemy health ×1.25 / 3.5 / 4.7 / 7.4 / 7.3 / 9.2 for N1–N6 (`HEALTH_MULT`; the boss uses its own ×4.5), × the map's
  `hpMult` (Twin Paths 0.95, Crossing 1.07, Ford 1.18: maps whose pads see both trails get tougher enemies, so the three
  layouts play alike). Total wave health (variant A, no threat, ×1 map): ~660 / 2200 / 7000 / 11000 / 16300 / 12700 + the
  4590-HP Colossus. District threats (extra groups, added to the second push) are half size on night 1 and 60% on night 2.
- **Balance** (Stage 7 sim: `.playwright-mcp/nightmech/campaign.mjs` drives the real DefenseScene through full runs:
  days give resources, skill picks from the real offers and crafted tower mods, prep builds through the scene's own
  build/upgrade code, the night steps the real `_step`, lulls spend and call the next push, Protocols are cast, salvage is
  picked; 36 runs per profile over the three maps). Profiles: **newcomer** ≈ 45 Scrap a day, 2 skill picks (often not
  night skills), level-1 towers only, built near the Relay, no Protocols; **typical** ≈ 85 Scrap + 1 Circuit + 1 Biofiber
  a day, 4 picks (≈ 3 Engineer / Warden), a Focusing Lens from night 3, a wide level-1 build over the paths with level 2
  only from spare Scrap, Vine Snare, calls pushes early; **strong** = typical's income + 5 Engineer / Warden skills, Lens +
  Thorn Coating, an upgrade/branch plan with Mortar and Beacon, all three Protocols and the Scrap exchange.

  | Profile | Wins | Falls | N1 | N2 | N3 | N4 | N5 | N6 | Boss killed |
  |---|---|---|---|---|---|---|---|---|---|
  | newcomer | 0/36 | N3 ×5, N4 ×28, N5 ×3 | −7 | −23 | −58 (31/36 hold, ending ~34) | −58 | −63 | — | — |
  | typical | 29/36 (78–86% over repeats) | N5 ×5, N6 ×2 | 0 | −8 | −11 | −33 | −46 | −47 | 24/31 |
  | strong | 36/36 | — | 0 | −5 | −2 | −11 | −11 | −8 | 36/36 |

  (Mean Relay HP lost per night among runs that reached it.) Typical wins 11 / 9 / 9 of 12 on Twin Paths / Crossing /
  Ford. The Relay's zap is what lets typical's nights 2–3 cost something (−8 / −11) while 86% of newcomers get through
  night 3. Typical's nights 5–6 run ~10 over a 20–35 / 25–40 aim at a ~80% win rate; easing them pushes the win rate
  toward 90% (this profile repairs between nights, so falls need big single nights). The readiness forecast tracks the
  sim: typical N4 / N5 / N6 predict −39 / −60 / −51, newcomer N3 −55; it over-predicts the strong build because it
  counts Protocols conservatively. **Tall vs wide** (night 4, 9 map/variant combos, before the zap pass): 11 towers with
  five at level 2 (639 Scrap) lose ~18, six level-3 towers (710 Scrap) ~14. Two pads per map moved to spots that see
  both trails (pad indices kept), so a wide build's 9th–11th towers aren't wasted. (With level 2 at 0.6× and a
  12-Scrap surcharge the gap was 25–35.)
- Wave-size boons (and Intel Sabotage) scale the whole wave and remove enemies from the largest groups, so −10% always removes some.
  Together they are capped at −20%.
- The wave preview lists the district threat and active boons first, then types and counts per lane.

## 6. Progression

**Run skills** (`src/data/skills.js`; Stage 7 rework, critic J §3 / M7: fewer, weightier picks that build an identity).
**Skill points:** one per trip (the goal, or a bonus task if the goal wasn't done; `CONFIG.expedition.maxSkillPoints` = 1)
and one per area boss killed, on top — so a run ends with ~6–8 skills (a 2,000-run offline sim of a player who leans
into what they own: 8 skills, ~1.4 keystones, 66% of them in one branch), not 10 of 18. Each pick offers 3 cards
(4 with Wider Choice, +2 on a run's first pick with Field Notes, −1 with Narrow Choice) and can be saved for later;
Fresh Ideas re-rolls the cards once a night. **Offers lean toward your build:** each card comes from a branch you
already own 60% of the time (`SKILL_OFFERS.ownedShare`), else from the others; within that, branches not on the table
yet come first, so the first pick of a run spans three branches. **Keystones:** each branch has one build-defining
★ keystone, offered only once you own 2 skills of that branch (then it shows up in ~2 of 3 hands). Every card shows an
icon, a short number line ("+3 health per kill") and one plain sentence; a keystone card is gold-framed and says
what opened it; a card shows "· N owned" for a branch you have.
- **Scavenger** (more from every trip): Pack Rat (+50% pickup reach, +10% container Scrap), Field Medic (+1 med kit
  every trip; spore clouds half damage, no stamina drain), Quick Hands (−25% E-hold time), Lush Finds (×2 Biofiber
  chance) · ★ **Salvage King** (night kills pay double Scrap; containers −15% Scrap).
- **Machete** (new verbs; numbers on `DEFLECT` / `WEAPONS`): Riposte Master (deflect window 0.14 → 0.20 s, riposte
  ×2.5 → ×3), Second Wind (+3 health per jungle kill), Brush Dancer (ferns don't slow you, walking or rolling; cutting
  plants costs half the stamina), Cleaver (the heavy chop clears every plant in a 3-tile cone, brambles too), Hunter
  (the thrown machete flies back twice as fast and hits for full damage on the way back) · ★ **Duelist** (a perfect
  dodge also sets up a riposte; every riposte that lands heals 4).
- **Engineer** (better towers): Efficient Assembly (towers −10% Scrap; a tower using Circuits has a 1-in-4 chance to
  give one back), Calibration (+10% range, +8% attack speed), Field Tuning (first upgrade each night −40% Scrap),
  Emergency Patch (+15 Relay health once a night, even mid-attack) · ★ **Chain Reaction** (Arc Spires jump to 2 more
  enemies, −20% damage per bolt).
- **Warden** (a tougher Relay, slower enemies): Reinforced Core (+25 Relay max), Prepared Defenses (+15 Scrap a night),
  Watchtower Network (Pulse Beacon bonuses ×1.5; needs the Beacon), Last Stand (below 35% Relay, towers +25% damage;
  builds on Reinforced Core), Rapid Response (−30% enemy speed for the first 8 s of each push) · ★ **Grove Warden**
  (Snare Vines +6 damage a pulse and root normal enemies 0.6 s, once every 4 s each; Root vines hold 50% longer).
- **Merged / removed** (old saves keep working: `SKILL_RENAMED` maps each old id when the run loads): Pack Rat I + II →
  Pack Rat, Safe Hands → Field Medic, Circuit Recovery → Efficient Assembly, Long Sightlines + Overclock → Calibration,
  Living Barricade → removed (Snare Vine's level 2 already adds range). A second old skill that merged into one you
  already have, or a removed one, comes back as an unspent skill point.
- Night prep's "Also tonight" lists the skills that act at night (`night: true`) as icon + name + number.

**Camp crafting: the Workbench** (`src/data/crafting.js`, `src/ui/workbench.js`; critic J §8 / M9: a sink you choose
for Circuits, Biofiber and Intel). After the trip summary, "Workbench ▶" opens a crafting step before night prep —
only when something can be made, never on the guided first night; "Prepare for the night" skips it in one click, Esc
goes back to the summary. Every card shows an icon, the number, one sentence, what it fits, what you already have
(to fit / fitted / on your machete / carrying 1 of 2) and its cost with shortfalls in red; a craft that costs Scrap
warns when it would leave less than the cheapest tower ("Leaves 10 Scrap (+15 at night prep): less than a tower (35)").
A line points at night prep's Scrap → component trade when you're short. Keys 1–9 make the matching card.

| Recipe | Cost | Effect |
|---|---|---|
| Focusing Lens (tower mod) | 2 Circuits | +15% range (any tower) |
| Thorn Coating (tower mod) | 2 Biofiber | +25% damage vs slowed, rooted or stunned enemies (not Snare / Beacon) |
| Uplink (tower mod) | 2 Intel | Can shoot burrowed enemies (Scrap Turret, Thorn Nest) |
| Overcharger (tower mod) | 1 Circuit + 1 Intel | +10% attack speed (not the Beacon) |
| Serrated Edge (machete) | 20 Scrap + 3 Biofiber | Melee hits make creatures bleed 3 a second for 3 s |
| Balanced Grip (machete) | 15 Scrap + 2 Circuits | Slashes and hack-through 10% faster |
| Heavy Spine (machete) | 25 Scrap + 1 Circuit | Heavy chop +25% damage (36 → 45) |
| Med kit | 15 Scrap + 1 Biofiber | +1 med kit (carry 2) |
| Reinforced Plating (Relay) | 30 Scrap + 1 Circuit | +10 Relay max health, repaired now; once per run |

- **Tower mods:** one socket per tower. Made mods wait on the bench (`run.items`); in night prep (or a lull) the
  selected tower's panel has a **Mod** row: "Fit Focusing Lens" (free), Swap, or Take out (back to the bench). The
  range ring shows the Lens at once. Selling a tower returns its mod to the bench. During a wave the row only shows
  what's fitted.
- **Machete upgrades** last the run, one of each; they stack with the Machete skills (`BLADE_STACK`).

**Research Data (permanent).** It's banked the moment it's earned, so it survives a quit or a loss:

| Source | Research |
|---|---|
| Expedition extracted | +5 |
| Objective | +3 |
| Optional objective | +3 |
| Night survived | +10 |
| First visit to a district | +10 |
| Boss damage | up to +30 |
| Decrypted Intel (night prep) | +4 per Intel |
| Victory | +50 |

Overgrowth adds +10% Research per level, the Daily +10% per modifier, Archivist another +10% (`Run.researchMult`).

**Research tree** (`src/data/unlocks.js` `RESEARCH_TREE`, Stage 7; critic J §5 / M8). 21 visible nodes in three
branches, costs 55–200, 2,020 Research in all (about 7–8 runs); a node may need others first (`req`, drawn as lines in
the Collection). Old unlock keys keep working (`UNLOCKS` / `UNLOCK_KEYS` are aliases):
- **Blueprints** (towers and night abilities): Mortar Pod 80 → Pulse Beacon 120; Salvage Logic 70 (sell refund 90%);
  Arc Discharge protocol 100 → Flare protocol 150. Three future towers are in the tree but hidden (`available: false`
  until a later stage builds them): Sap Cannon, Lure Totem, Bramble Wall.
- **Field Gear** (what you carry into the jungle): Field Kit 55 (start with a med kit) → Field Dressing 65 (buy med kits
  at the briefing, 15 Scrap) → Beacon Codes 140 (the first trip's area beacon starts switched on); Parang 90 (starting
  blade; buying asks whether to equip it); Survey Map 70 (the land about 40 m around the Relay starts mapped); Stockpile
  60 (+20 starting Scrap) → Engineer Kit 70 → Botanist Kit 75 → Spy Kit 85 (starting kits trading 15 Scrap for 2
  Circuits / 2 Biofiber / 3 Intel; one at a time, picked in the Collection loadout).
- **Relay** (more choices before and between trips): Second Look 80 (re-roll the area offer once a night) → Scout
  Report 150 (three areas) → Archivist 200 (+10% Research); Field Notes 90 (+2 cards on the first pick) → Fresh Ideas
  110 (re-roll skill cards once a night) → Wider Choice 160 (4 cards); the Verdant Scarf (reward for the first win).

They add options, never raw power. Skills that need a locked tower (Watchtower Network → Pulse Beacon) are only offered
once it is unlocked. The Collection's Research tab shows the three branches as a node graph (click to see a node, click
again or U to unlock; arrows move), the selected node's plain description and what it needs, and the loadout (starting
blade, starting kit).

**Relics are per run** (§4 *Relics*): they never carry over, so every run is built from what that jungle gives up. What
carries over is knowledge: the Collection's **Codex** tab lists **Relics · N/24** (every relic you have seen — picked up
or offered at a shrine — with its rarity and effect; unseen ones are dark silhouettes marked "???") and **Data logs ·
N/20** (every log read, re-readable in story order). Kept in `meta.relicsSeen` / `meta.lore`; debug runs don't add to
them unless `&save=1`.

**Overgrowth 1–10** (`src/data/modes.js` `OVERGROWTH`; opened by the first win). Picked on the title (◂ ▸ / Left Right);
level N plays the first N modifiers stacked: Thick Hides (night enemies +10% health), Picked Over (−15% container
Scrap), Brittle Relay (−20 Relay max), Narrow Choice (one skill card fewer), Restless Jungle (a second area's danger
joins every night), No Drone (no salvage), Swarming (+15% enemies), Lean Start (−25 starting Scrap), Hard Dawn (wake with
40 instead of 60), Deep Overgrowth (enemies +10% speed and health). Research +10% per level. Winning at a level opens
the next (`meta.overgrowth.best`); the briefing tag and Results show the level.

**The Long Night** (opened by the first win): an endless run. Holding night 6 counts as the win (victories, the scarf,
Overgrowth progress, victory Research; the banner says "The Relay holds"), then the nights go on with `waveFor(night)`:
enemy health ×1.2 per night past 6, +10% enemies per night, a stronger Colossus every 3rd night (9, 12, …;
`DEFENSE.longNight`). The run ends when the Relay falls; the record is nights held (`meta.longNight.best`, on the title
and Results). `CONFIG.nights` stays 6.

**The Daily run** (after the first run): the seed comes from the local date (`dailySeed`), plus two fixed modifiers
drawn from the Overgrowth list (`dailyMods`; Research +10% each). Everyone gets the same jungle, areas and goals that
day. One title entry shows today's modifiers and today's best; `meta.daily[date]` keeps a local best per day (30 days).

## 7. Saving

localStorage with a versioned schema (`src/core/Save.js`):
- **meta:** research, unlocks, discovered districts, best run, lifetime stats, settings, the starting kit, Overgrowth
  (`{ best, level }`), Long Night (`{ best }`), Daily bests (`{ date: { nights, victory, runs } }`), the Codex
  (`relicsSeen`, `lore`: known ids only). Missing fields in
  older saves get defaults (`metaModes`); the save version is unchanged.
- **run:** a snapshot with a phase (`briefing`, `explore` saved as the trip starts, `summary` after the trip, `prep`,
  `wave`), which powers Continue. Continue from `explore` settles the trip as abandoned (no free reset of a bad day) and
  opens its summary; from `summary` it reopens the summary; from a wave-start snapshot it restarts that wave with the
  locked build. Research earned mid-wave (boss damage) is written into that snapshot at once, so quitting can't earn it
  twice. New run fields (mode, Overgrowth level, modifiers, offers, goals, area count) are validated; missing ones mean
  a normal run. Relics: `run.relics` (owned, known unique ids) and `run.world.relics / lore / visited` (strongboxes
  opened, shrines used, log spots read, places named) — an older save without them starts with none.

Invalid or outdated saves are discarded, never half-loaded: unknown tower types, bad levels or pads, duplicate pads,
unknown skills, bad resources or Relay HP all discard the whole run save. Skills removed by the Stage 7 rework are not
unknown: they map to their replacement (or a refunded point) when the run loads, so those saves still Continue. The
Workbench fields (`items`, `blade`, `crafted`, a tower's `mod`) must name real recipes / mods; missing ones mean nothing
crafted. Debug-URL runs don't count toward lifetime stats
and don't overwrite the real run save (add `&save=1` to test Continue).

## 8. Accessibility and UX

- Every cost is shown before you buy, and an unaffordable build explains why.
- Resources use colour **and** icon/label, never colour alone.
- Sound settings: master, music, sound effects and ambience sliders and a mute toggle (also **F2** anywhere — M is the
  jungle map). Old saves get the new settings' defaults. The jungle also pauses when the window loses focus.
- Sound as information: every attack wind-up has a bright "shing" tell (plus the creature's own voice) that carries
  further than other sounds, and every boss, goal, Protocol and night verb has its own sound, so the ear alone tells you
  what just happened. Fog muffles the jungle, heat brings the cicadas out by day, rain quiets the birds.
- Pause in both modes, 1×/2× speed in defense, and a toggle to turn off screen shake. Quitting from pause always asks to
  confirm (in night prep a click on the dimmed map just closes the pause menu), and toast messages stop fading while paused.
- Objectives always appear on the HUD and map, so nothing important is hidden.
- Pixel fonts are never synthesized bold (Tiny5 has one weight; a fake bold turns 8 into $ and 6 into €): emphasis in body
  text is brightness or colour, headings use Silkscreen's real bold.
- Clicks are ignored for 0.3 s after a screen change, so the click that dismissed one screen can't press a button on the next.
  The "Night survived" / "Relay has fallen" banner waits for a click, Enter or Space (it no longer auto-advances under
  the player's click), and the briefing ignores pointer input for its first 0.7 s.
- On the night map each occupied pad's corner brackets take the tower's type colour, and hovering a tower shows its name
  and level. The briefing's wave row labels the boss and tags new enemy types (names on hover).
- **Simplicity pass (Stage 6, critic "newcomer").** Plain words in the UI (code keys unchanged): Boon → Reward,
  Threat → Danger tonight, Expedition / Extract → trip / Head home, Banked → Stored at base, District → area,
  Pylon → beacon, Objective → Goal, Optional → Bonus task, Lead → First in line, Nearest → Closest, lanes → paths,
  Decrypt / Sabotage → Read / Disrupt; no SCR/CIR/BIO/INT/ST/RD codes (costs are icon + number, names in the tooltip).
  One objective sentence (`PRIMARY[*].name`) is used word for word on the briefing card, the start banner, the GOAL
  strip and the summary. Things show up when they matter: zero currencies, Intel buttons, Repair (Relay full), skills,
  the weapon line, med kits (none carried), beacon legend entries (none met), targeting (night 1), Research (title,
  summary one-liner, results). Tuning for all of it lives in `src/data/guide.js`.
- **One colour language:** red = danger / enemies (hot-red silhouettes and ground rings, a red "!" over a creature
  winding up an attack), cyan = you / the Relay / home (calm mid-cyan player outline, dimmer than enemies), amber =
  the goal and loot (the ◆ arrow, the GOAL strip, crates), green = rewards.
- **The guided first run** (the player's very first run, `run.guided`): night 1 offers one area (`GUIDE.district`,
  pre-selected) with an easy objective (`GUIDE.objective`) at a trail-side site 32–60 m out (the closest trail-side one
  when the world has none in range); the jungle coaches one step at a time in the top-left line: move → cut through
  plants → open the crate on the way → the map (Tab) → the goal → open the crates at the goal site → head home, with
  passing tips (the first enemy, out of stamina, a crate you pass). "Head home" is offered only once you carry loot, the
  goal is done, you're hurt or 75 s have passed. Only a normal run can be the guided one (never a Daily). Every run's
  day 1 is gentler (`FIRST_DAY`): no wildlife within 26 m of the Relay, 45% of the wildlife, creatures alone, no roaming
  Razorbacks/Spitters, small or empty feral camps, one Crawler as the objective's guard. From night 2 the briefing
  offers the usual choice of two.
- **The guided day pays** (Stage 7, critic L §2.1: it banked 9 Scrap). The guided run's world lines the trail from the
  Relay to the guided goal site with up to 4 crates (crate, tool chest, crate, tool chest: 12 m in, then every 15 m,
  each in a cleared nook just off the trail, Scrap ×1 instead of the near-Relay ×0.45; `GUIDE.routeCrates`, JungleGen
  `guidedRoute`). The coached crate is one of them, or else one with a walking path over open ground ≤ 1.3 × the
  straight line within 2 tiles of a trail (`GUIDE.coach.cratePath / crateTrail`); it gets an amber ◆ over it and the
  screen-edge arrow (the goal's arrow steps aside meanwhile), and the route's crates show a ◆ when you're near. After the
  goal, a "loot the crates here" step points at the goal site's containers. Measured (fresh profile, 1280×720): **63
  Scrap + 3 Circuits + 1 Biofiber banked** at t = 142 s, against the ≥ 45 target.
- **Every verb taught when it first matters** (Stage 7, critic L §2.2; `TIPS` in guide.js, `JungleScene._tip`): one
  tip at a time in the coach line (top-left, never two at once, never over the fight; danger tips push a calm one back
  in the queue), each shown once per profile (`meta.hints.tip_*`, brought back by "Show hints again"), always naming
  the bound key. Roll: the first wind-up within 4 m ("Space: roll through the attack"). Deflect: the first lunge at you
  from day 2 (on the guided day, the first one 8 s after the roll tip). Heavy chop: the first bramble you walk into.
  Machete throw: the first Spitter / shooter within 8 m you can't walk up to. Med kit: the first time health is under
  50% with a kit. Beacons: the first dead beacon within 10 m ("Beacons are a way home: hold E"). Sunset: 1:00 of
  daylight left (after the first time it's a toast). The map is a step of the guided day; the clock has a sun icon and
  a "Daylight" label (a moon and "After dark: head home" after sunset).
- **One text lane** (critic H2 §5.1, `TEXT_LANE`): banners (place names, goal / sunset, boss intro and kill, back home)
  own the top centre, one at a time — a more important one cuts a lesser one, a waiting place name is dropped after 4 s.
  Toasts queue under the top-left panel, one on screen at a time (the next one hurries the current one off after 1.6 s,
  stale ones are dropped after 10 s) and wait while a banner is up. At most one coach / verb tip and one toast show at
  once (a calm tip waits for a hint to clear). Night prep's hints dock at the top of the side panel, never over the board.
  A deflected attack prints one word (DEFLECT), not DEFLECT + PARRIED.
- **HUD legibility** (critic L §3 / H §5): all HUD text sits on the world's texel grid — 12 design px = 16 px at 720p,
  24 px at 1080p, 32 px at 1440p, one font pixel per world texel, never under 12 CSS px (the clock is twice that); the
  HP number has a one-font-pixel dark outline; pixel icons in the HUD scale by whole texels (`--tx`). Health is green →
  yellow → red (`HUD.health`), never the stamina bar's orange. "GOAL DONE"-style banners sit at 22% of the height, off
  the player. A HUD panel with a creature behind it fades to 50% (`JUICE.hudFade`), so the clock stays readable.
  Creature icons (Codex, briefing, night panel) show the side view cropped to the creature, at 1× or 2×, never ½
  (`Assets.iconFrame` / `iconScale`).
- **Keyboard parity:** every dialog (`ui.modal`) has its primary button highlighted and takes Enter / Space / E (and
  the bound interact key), arrows / W S / Tab to move, Esc = cancel (the death dialog too, after 0.6 s so a key mashed
  in the fight can't skip it). A dialog keeps those keys to itself, so the Esc that closes it never reaches the game.
- **Settings** (three tabs, keys 1–3, so each fits 720p): Sound; Game (screen shake, full screen, picture size, hints,
  reset); Controls — rebind move, roll, interact, throw, med kit and map (click or Enter, then press the key; Esc
  cancels; a key already in use swaps; Esc / F2 / browser keys can't be bound; "Reset to default"). Bindings live in
  `meta.settings.keys` (only what differs from the defaults; validated on load) and apply in the jungle, where every
  tip, prompt and keycap shows them. No text-size option: the HUD text already sits on the texel grid, and a free size
  would break it.
- **Wayfinding:** when the straight line to the goal runs into deep water, the minimap and big map mark the crossing
  to use (a pale hollow ◇: the ford tile with the shortest walk you → ford → goal) and the GOAL strip adds "cross at
  the stepping stones N m" with its own arrow. The summary's "spend it in Collection" Research note shows once.
- **Readiness check:** night prep rates the defense (towers' damage over the wave vs the wave's total health,
  `READINESS`); a weak rating asks once before the wave starts ("Start anyway").
- Hints never cover what they explain: the briefing hint sits beside / under the cards (and closes when Details
  opens), the build hint sits next to an empty pad near the Relay.
