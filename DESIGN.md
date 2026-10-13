# Verdant Relay — Design

**Scavenge by day. Hold the line by night.**

Single-player roguelite for desktop browsers, built with **Three.js + JavaScript (Vite)**. The world is 3D
but rendered at low internal resolution and scaled up with nearest-neighbour, so it reads as pixel art.
Characters, enemies, towers and props are **detailed pixel sprites** (camera-facing billboards in the 3D
world) that should feel as real and grounded as possible: weathered materials, believable gear, real
lighting. Until art exists, primitive placeholder models stand in (see `src/data/visuals.js`).

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

1. **Briefing:** see the night number, Relay health, resources and run upgrades. Pick one of two districts.
2. **Explore (day):** search a generated district, complete the objective, extract.
3. **Summary:** see what you banked. Spend any skill point (pick 1 of 3, or save it).
4. **Prepare (night):** repair the Relay, build, upgrade and sell towers, spend Intel, read the wave preview.
5. **Defend:** survive the wave. You don't control a character in this mode.
6. Repeat until you win Night 6 or the Relay falls.

**Kept within a run:** Relay HP, resources, towers and their levels, skills, unspent points,
district consequences, player HP. All of it resets when the run ends. Permanent unlocks and best-run records stay.

## 3. Screens

| Screen | Contents |
|---|---|
| Title | New Run, Continue (only if a valid save exists), Collection, Settings |
| Briefing | Night, two districts (name, environment, enemy type, reward bonus, tonight's threat), resources, Relay HP, skills, Begin Expedition |
| Exploration HUD | HP, timer, carried loot, objective, extraction status and direction, minimap (Tab for a big map), interact prompt |
| Summary | Loot recovered, intel, objective result, optional/event outcomes, skill pick, Continue |
| Preparation | Defense map, Relay HP, resources, tower list (cost and description), selected-tower upgrade/sell/target rule, Intel actions (Decrypt / Sabotage), Repair, wave preview, Start Wave |
| Defense HUD | Relay HP, wave progress, enemies left, resources, pause, 1×/2× speed, boss bar |
| Results | Victory or defeat, nights survived, kills, districts, peak resources, research earned, New Run / Title |

## 4. Exploration (day)

**Camera:** fixed-angle 3D top-down (about 55° pitch) that follows the player.

**Controls:** WASD move · mouse aim · LMB fire weapon · RMB Pulse Cutter · Space dodge · E interact (hold where needed) · Q use med kit · Tab map · Esc pause.

**Player:** 100 HP, about 5.6 tiles/s. Dodge lasts 0.25 s with i-frames and a 2 s cooldown. Short i-frames after being hit.
- **Scrap Carbine:** medium range, moderate damage, slow-ish fire rate, infinite ammo.
- **Pulse Cutter:** short arc melee that also cuts bramble barriers. Brief cooldown.

**Map:** connected rooms on a 6×3 grid, stamped from hand-authored 12×9 templates (`src/data/rooms.js`).
There is a start room, exploration rooms (4–6 on night 1, 5–7 on night 2, 6–9 from night 3), an objective room,
an extraction room (far from the start) and optional rooms (1–2 on night 1, then 2–3), with at least one loop so
there are two routes. A district is sized so a full clear does not comfortably fit the timer: a thorough player
loots ~75–85% and extracts around 130–170 s, so "one more room or extract now" is a real choice. Every template gets a guaranteed plus-shaped corridor, so
doors always connect and nothing important can be walled off.
Room types: street, shop, residential, greenhouse, transit platform, utility, courtyard, flooded, security.

**Timer and extraction:**
- 180 s timer. It adds pressure but doesn't fail you outright.
- Extraction unlocks when the objective is done. It's marked on the map, and you hold E for 2 s in the zone. You may keep exploring after that.
- When time runs out, a warning plays, then an emergency beacon appears at the start room and reinforcements keep spawning.
- **Death:** you lose everything carried this expedition (including carried med kits; the "You went down" dialog lists them) and return to the Relay at low HP. Towers, banked resources and research are kept. The run continues.
  On nights 1–2 a Relay drone salvages a share of what you carried (30% / 20%), so one early mistake doesn't end the run.

**Loot (carried until extraction):**

| Resource | Used for |
|---|---|
| Scrap | Building, repairs, common upgrades |
| Circuits | Electronic towers and upgrades |
| Biofiber | Organic towers, traps, healing |
| Intel | Spent in night prep: Decrypt (1 Intel → +4 Research Data) or Sabotage (3 Intel → tonight's wave 10% smaller, once per night) |

Each resource has its own colour **and** icon. A thorough, successful expedition in a neutral district banks
about 90–130 Scrap (rooms hold 1–2 containers; optional rooms 0–1; bigger districts with leaner containers).
Container Scrap is ×1.2 on night 1 and ×1.1 on night 2 (smaller maps). Container yields:

| Container | Yield | Hold E |
|---|---|---|
| Crate | 4–9 Scrap | 0.6 s |
| Tool chest | 9–14 Scrap, 35% chance of a Circuit or Biofiber | 1.0 s |
| Rare cache | 13–19 Scrap + 1–2 components | 1.5 s |
| Intel terminal | 1–2 Intel | 1.0 s |

Every hold shows its duration in the prompt ("Hold · Open Tool Chest 0.8s") with a progress ring around the E key.
Progress is kept if you let go (except extraction), and a hit that knocks you slightly out of reach doesn't cancel it.
Objective and event holds are set in `objectives.js` (e.g. the Route Data terminal 7 s, a locked cache 2 s).

Med kits heal 25. You can carry at most 2. Enemies drop occasional small loot. On nights 1–2 a med kit lies in the start room.

**Difficulty by night** (`CONFIG.expedition.byNight`): nights 1–2 have fewer and weaker enemies (HP ×0.85 / ×0.92,
damage ×0.75 / ×0.85), at most one ranged enemy per room, 2 guards on a guarded cache and 2–3 enemies summoned by a hold.
From night 3 rooms fill up, and nights 5–6 bring tougher (×1.2–1.3 HP), more numerous and more ranged enemies.
The objective room is capped (3–5 enemies including guards) and its doors are never choked with brambles.
Guards stand at least 2 tiles apart (from each other and the room's other enemies), and at most 1 (nights 1–2) or 2 of them are ranged.

**Enemies (day):** Crawler (melee lunge), Skitter (fast melee), Rival Scavenger (ranged, keeps distance),
Spitter (stationary ranged), Razorback (wind-up, then charge). Every big attack shows a wind-up and telegraph.
Enemies never spawn on top of the player.

**Primary objectives** (`src/data/objectives.js`). Each one, when done, grants +1 skill point and a boon for that night:

| Objective | Steps | Night boon |
|---|---|---|
| Restore the Relay Box | Find the fuse, then install it | 1 free tower upgrade |
| Recover Route Data | Hold E at a terminal while enemies arrive | Wave 10% smaller |
| Activate Pumps | Activate 2 pumps in separate rooms | North lane 15% slower |
| Salvage a Power Cell | Crack a guarded cache | Towers fire 10% faster |
| Clear the Blockage | Kill an elite Razorback (a duel: it stands in the open with 1–2 Crawlers/Skitters, longer charge telegraph, HP ×1.8–2.6 by night) | +25 Scrap |

**Optional objectives:** destroy a nest (wave 15% smaller), rescue an engineer (free +25 repair; +15 Scrap instead if the Relay is full),
a data log (Intel and research), a locked cache. Some grant a bonus skill point, capped at 2 points per expedition.

**Events** (optional; risk and reward shown before you commit): Abandoned Workshop, Power Surge
(towers +15% damage tonight, enemies respond), Infested Cache.

**Districts** (`src/data/districts.js`). Each has its own look, loot bias and enemy mix, plus one night threat:

| District | Bonus | Tonight's threat |
|---|---|---|
| Overgrown Market | Scrap ×1.3, ambushes | Extra Crawler group |
| Flooded Transit Station | Circuits ×2, ranged enemies | Burrowers join |
| Canopy Greenhouse | Biofiber ×2, spore hazards | Enemies 15% faster |
| Collapsed Residential | Med kits, many caches | Extra Skitter pack |
| Municipal Data Center (night 2+) | Intel ×2, Circuits ×1.5, alarms | A Razorback joins |

## 5. Defense (night)

**Map** (`src/data/defenseMap.js`): 30×17 tiles. The Relay sits on the right, and two waypoint lanes come in from the left.
There are 16 fixed build pads beside the lanes. Towers can never block a route.

**Prep phase:** build, select, upgrade, sell (70% of total Scrap spent, rounded down), set targeting
(**Lead** = furthest along its lane / **Nearest** to the tower / **Toughest** = most health left), repair
(25 Scrap → +15 HP; near max you pay only for the HP restored, rounded up), spend Intel (Decrypt: 1 Intel → +4 Research Data;
Sabotage: 3 Intel → tonight's wave 10% smaller, once per night), read the wave preview, then Start Wave.
All wave-size cuts (objective boons, nest, Sabotage) multiply together but never go below 80% of the wave (−20% at most);
the preview says "(capped at −20%)" when the cap applies, and Sabotage is greyed out once it does.
Kills pay small fractional bounties (½ Scrap for a Crawler or Skitter, 1½ for a Razorback, 2 for a Ruin Guard), paid as whole Scrap.
Each tower you already own of a type adds +5 Scrap to the next one of that type (shown on the build card), so
upgrading and mixing tower types beats spamming one tower. Every prep action re-saves the run.

**Wave phase:** no building, upgrades or repairs. You can pause or play at 1×/2× and change targeting. Leftover resources carry over.
The run is saved as the wave starts: quitting mid-wave and pressing Continue restarts that wave with the same towers
and the Relay HP it began with (the build can't be changed), after a 3-second "Get ready" beat. Surviving saves the next briefing at once; a defeat ends the run at once.

**Towers** (`src/data/towers.js`; every tower has 3 levels):

| Tower | Cost | Role | Level 2 | Level 3 |
|---|---|---|---|---|
| Scrap Turret | 45 S | Single target, range 4.5 | +30 S: +45% fire rate, +10% damage | +40 S 1 C: every 5th shot ×3, +10% damage |
| Thorn Nest | 35 S, 1 B | Short (3.5), rapid | +30 S 1 B: more damage, 30% slow on hit | +45 S 2 B: slow splashes, more damage |
| Arc Spire | 35 S, 2 C | Chain lightning, hits burrowed | +35 S 1 C: +1 chain, more damage | +50 S 2 C: chains slow, more damage |
| Snare Vine | 30 S, 1 B | Area slow 45% (lingers 2.6 s), range 3.3 | +30 S 1 B: 60% slow, range 3.7 | +45 S 2 B: root non-bosses (per-target cooldown) |
| Mortar Pod 🔒 | 60 S, 1 B | Long-range splash | Bigger blast | Burning sap (counts as a blast) |
| Pulse Beacon 🔒 | 50 S, 2 C | +20% attack speed to towers within 4.5 (2–5 pads) | Stronger buff | Bonus-attack chance |

🔒 = unlocked with research. Range shows while placing or when selected. Towers boosted by a beacon show an amber ring; level 2 and 3 towers show 2 or 3 rank chevrons above them.

**Relay Core:** 100 HP. It takes damage when enemies reach it. Show a hit cue, with screen shake that can be turned off in settings.

**Enemies** (`src/data/enemies.js`):

| Enemy | Role | Notes |
|---|---|---|
| Bramble Crawler | Basic | — |
| Skitter | Fast | Tests slows and rapid fire |
| Razorback | Tank | Slow, very high HP |
| Spitter | Ranged | Stops near the core and lobs sap after a visible wind-up |
| Burrower | Ambusher | Underground for part of its route; bullet towers can't target it there |
| Seed Carrier | Swarm | Bursts into seedlings unless killed by a blast |
| Ruin Guard | Elite | Shield halves kinetic damage |
| Canopy Colossus | Boss | 1020 HP (×2.5 on N6 = 2550; the Codex shows both). Loops approach → rooted (telegraph, spawns 2 Crawlers) → charge (wind-up, then fast); has a big HP bar. At 60% health it stops and roars (red ring, shake, toast "The Colossus is enraged!"; it takes only 30% damage while roaring), turns red, its bark hardens (15% less damage taken for the rest of the fight) and it loops faster: 4.5 s approach, faster and longer charges, and each root also spawns 3 Skitters. Reaching the Relay deals 15–40 damage, less the more it is hurt. Night 6 prep hints to set its lane's towers to Toughest |

**Waves** (`src/data/waves.js`):
- N1: Crawlers + Skitters. N2: first Razorback. N3: Spitters. N4: Burrowers + Seed Carriers.
- N5: Ruin Guards. N6: Colossus + a thinner support wave (28 enemies), so the night is a boss fight rather than a swarm.
- Enemy HP ×0.8 / 1.9 / 2.3 / 2.05 / 2.4 / 2.5 for N1–N6. Total wave HP is about 270 / 1750 / 4080 / 5540 / 6570 / 6550
  (N6 includes the boss). District threats (extra groups) are half size on night 1 and ¾ on night 2.
- Tuned by full-run simulation of the real defense code (balance round 4) with budgets that accumulate over the nights
  (~70 / 90 / 100 / 100 / 100 / 105 Scrap per expedition plus bounties, objective boons). A well-played run (towers funnelled
  around the Relay, six or seven defensive skills, Mortar and Beacon) loses ~0–15 Relay HP on N2, ~12–27 on N3, ~24–40 on N4,
  ~0–35 on N5 and ~19–35 on N6, where it fights the enraged Colossus for ~20–23 s and the boss gets ~96% of the way to the
  Relay (sometimes reaching it with a sliver of health). A typical run with three defensive skills plays out about the same;
  without unlocks the boss usually reaches the Relay but the night holds. A run without skills falls on N5; level-1 turret
  spam falls on N4; a build spread mid-map bleeds ~45–95 a night from N4 and usually falls on N6.
  On night 1 one turret costs ~25–30 HP, two towers ~5–20 and no towers ~60. Most Relay damage comes from tanks
  (Razorbacks, Ruin Guards) reaching the core.
- Wave-size boons (and Intel Sabotage) scale the whole wave and remove enemies from the largest groups, so −10% always removes some.
  Together they are capped at −20%.
- The wave preview lists the district threat and active boons first, then types and counts per lane.

## 6. Progression

**Run skills** (`src/data/skills.js`): earned from objectives. Each pick offers 3 options (4 with an unlock) and can be saved for later.
- **Scavenger:** Pack Rat I/II, Safe Hands, Field Medic, Quick Extraction, Lush Finds
- **Engineer:** Efficient Assembly, Circuit Recovery, Long Sightlines, Field Tuning, Overclock, Emergency Patch
- **Warden:** Reinforced Core, Prepared Defenses, Watchtower Network, Last Stand, Rapid Response, Living Barricade
- Economy skills were trimmed in balance round 4 (they decided whole nights): Prepared Defenses gives +10 Scrap a night,
  Field Tuning takes 40% off the first upgrade each night. Values live in `src/data/skills.js`.

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

**Unlocks** (`src/data/unlocks.js`): Mortar Pod (80), Pulse Beacon (110), Scattergun start weapon (90; buying it asks
whether to equip it), +20 starting Scrap (60), starting med kit (55), a 4th skill option (140), and a cosmetic for the first win.
The 535 Research total takes about 2–3 runs (a win earns ~300). They add options, never raw power.
Skills that need a locked tower (Watchtower Network → Pulse Beacon) are only offered once it is unlocked.

## 7. Saving

localStorage with a versioned schema (`src/core/Save.js`):
- **meta:** research, unlocks, discovered districts, best run, lifetime stats, settings
- **run:** a snapshot saved at briefing, after every prep action and at wave start, which powers Continue
  (Continue from a wave-start snapshot restarts that wave with the locked build). Research earned mid-wave
  (boss damage) is written into that snapshot at once, so quitting can't earn it twice.

Invalid or outdated saves are discarded, never half-loaded: unknown tower types, bad levels or pads, duplicate pads,
unknown skills, bad resources or Relay HP all discard the whole run save. Debug-URL runs don't count toward lifetime stats
and don't overwrite the real run save (add `&save=1` to test Continue).

## 8. Accessibility and UX

- Every cost is shown before you buy, and an unaffordable build explains why.
- Resources use colour **and** icon/label, never colour alone.
- Pause in both modes, 1×/2× speed in defense, and a toggle to turn off screen shake. Quitting from pause always asks to
  confirm (in night prep a click on the dimmed map just closes the pause menu), and toast messages stop fading while paused.
- Objectives always appear on the HUD and map, so nothing important is hidden.
- Pixel fonts are never synthesized bold (Tiny5 has one weight; a fake bold turns 8 into $ and 6 into €): emphasis in body
  text is brightness or colour, headings use Silkscreen's real bold.
- Clicks are ignored for 0.3 s after a screen change, so the click that dismissed one screen can't press a button on the next.
- On the night map each occupied pad's corner brackets take the tower's type colour, and hovering a tower shows its name
  and level. The briefing's wave row labels the boss and tags new enemy types (names on hover).
