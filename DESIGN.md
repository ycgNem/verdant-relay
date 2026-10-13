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
4. **Prepare (night):** repair the Relay, build, upgrade and sell towers, read the wave preview.
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
| Preparation | Defense map, Relay HP, resources, tower list (cost and description), selected-tower upgrade/sell/target rule, Repair, wave preview, Start Wave |
| Defense HUD | Relay HP, wave progress, enemies left, resources, pause, 1×/2× speed, boss bar |
| Results | Victory or defeat, nights survived, kills, districts, peak resources, research earned, New Run / Title |

## 4. Exploration (day)

**Camera:** fixed-angle 3D top-down (about 55° pitch) that follows the player.

**Controls:** WASD move · mouse aim · LMB fire weapon · RMB Pulse Cutter · Space dodge · E interact (hold where needed) · Q use med kit · Tab map · Esc pause.

**Player:** 100 HP, about 5.6 tiles/s. Dodge lasts 0.25 s with i-frames and a 2 s cooldown. Short i-frames after being hit.
- **Scrap Carbine:** medium range, moderate damage, slow-ish fire rate, infinite ammo.
- **Pulse Cutter:** short arc melee that also cuts bramble barriers. Brief cooldown.

**Map:** connected rooms on a grid, stamped from hand-authored 12×9 templates (`src/data/rooms.js`).
There is a start room, 3–5 exploration rooms, an objective room, an extraction room and 1–2 optional rooms,
with at least one loop so there are two routes. Every template gets a guaranteed plus-shaped corridor, so
doors always connect and nothing important can be walled off.
Room types: street, shop, residential, greenhouse, transit platform, utility, courtyard, flooded, security.

**Timer and extraction:**
- 180 s timer. It adds pressure but doesn't fail you outright.
- Extraction unlocks when the objective is done. It's marked on the map, and you hold E for 2 s in the zone. You may keep exploring after that.
- When time runs out, a warning plays, then an emergency beacon appears at the start room and reinforcements keep spawning.
- **Death:** you lose everything carried this expedition and return to the Relay at low HP. Towers, banked resources and research are kept. The run continues.

**Loot (carried until extraction):**

| Resource | Used for |
|---|---|
| Scrap | Building, repairs, common upgrades |
| Circuits | Electronic towers and upgrades |
| Biofiber | Organic towers, traps, healing |
| Intel | Research, wave previews, permanent progress |

Each resource has its own colour **and** icon. Container yields:

| Container | Yield |
|---|---|
| Crate | 8–15 Scrap |
| Tool chest | 15–25 Scrap, chance of a Circuit or Biofiber |
| Rare cache | 20–30 Scrap + 1–3 components |
| Intel terminal | 1–3 Intel |

Med kits heal 25. You can carry at most 2. Enemies drop occasional small loot.

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
| Clear the Blockage | Kill an elite Razorback | +25 Scrap |

**Optional objectives:** destroy a nest (wave 15% smaller), rescue an engineer (free +25 repair),
a data log (Intel and research), a locked cache. Some grant a bonus skill point, capped at 2 points per expedition.

**Events** (optional; risk and reward shown before you commit): Abandoned Workshop, Power Surge
(towers +15% damage tonight, enemies respond), Infested Cache.

**Districts** (`src/data/districts.js`). Each has its own look, loot bias and enemy mix, plus one night threat:

| District | Bonus | Tonight's threat |
|---|---|---|
| Overgrown Market | Scrap ×1.5, ambushes | Extra Crawler group |
| Flooded Transit Station | Circuits ×2, ranged enemies | Burrowers join |
| Canopy Greenhouse | Biofiber ×2, spore hazards | Enemies 15% faster |
| Collapsed Residential | Med kits, many caches | Extra Skitter pack |
| Municipal Data Center (night 2+) | Intel ×2, Circuits ×1.5, alarms | A Razorback joins |

## 5. Defense (night)

**Map** (`src/data/defenseMap.js`): 30×17 tiles. The Relay sits on the right, and two waypoint lanes come in from the left.
There are 16 fixed build pads beside the lanes. Towers can never block a route.

**Prep phase:** build, select, upgrade, sell (70% of total Scrap spent, rounded down), set targeting
(first / closest / strongest), repair (20 Scrap → +20 HP, never above max), read the wave preview, then Start Wave.

**Wave phase:** no building, upgrades or repairs. You can pause or play at 1×/2×. Leftover resources carry over.

**Towers** (`src/data/towers.js`; every tower has 3 levels):

| Tower | Cost | Role | Level 2 | Level 3 |
|---|---|---|---|---|
| Scrap Turret | 45 S | Single target | +40% fire rate | Every 5th shot ×3 |
| Thorn Nest | 35 S, 1 B | Short, rapid | Slow on hit | Slow splashes |
| Arc Spire | 35 S, 2 C | Chain lightning | +1 chain | Chains slow |
| Snare Vine | 30 S, 1 B | Area slow | Stronger slow | Root non-bosses (per-target cooldown) |
| Mortar Pod 🔒 | 60 S, 1 B | Long-range splash | Bigger blast | Burning sap |
| Pulse Beacon 🔒 | 50 S, 2 C | Buffs nearby towers | Stronger buff | Bonus-attack chance |

🔒 = unlocked with research. Range shows while placing or when selected.

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
| Canopy Colossus | Boss | Loops approach → rooted (telegraph, spawns Crawlers) → charge (wind-up, then fast); has a big HP bar |

**Waves** (`src/data/waves.js`):
- N1: Crawlers + Skitters. N2: first Razorback. N3: Spitters. N4: Burrowers + Seed Carriers.
- N5: Ruin Guards. N6: Colossus + support.
- Enemy HP grows 10% per night, and the authored counts grow about 20–25% per night.
- The wave preview lists types, counts, the district threat and active boons.

## 6. Progression

**Run skills** (`src/data/skills.js`): earned from objectives. Each pick offers 3 options (4 with an unlock) and can be saved for later.
- **Scavenger:** Pack Rat I/II, Safe Hands, Field Medic, Quick Extraction, Lush Finds
- **Engineer:** Efficient Assembly, Circuit Recovery, Long Sightlines, Field Tuning, Overclock, Emergency Patch
- **Warden:** Reinforced Core, Prepared Defenses, Watchtower Network, Last Stand, Rapid Response, Living Barricade

**Research Data (permanent).** It's banked the moment it's earned, so it survives a quit or a loss:

| Source | Research |
|---|---|
| Expedition extracted | +5 |
| Objective | +3 |
| Optional objective | +3 |
| Night survived | +10 |
| First visit to a district | +10 |
| Boss damage | up to +30 |
| Victory | +50 |

**Unlocks** (`src/data/unlocks.js`): Mortar Pod, Pulse Beacon, Scattergun start weapon, +20 starting Scrap,
starting med kit, a 4th skill option, and a cosmetic for the first win. They add options, never raw power.

## 7. Saving

localStorage with a versioned schema (`src/core/Save.js`):
- **meta:** research, unlocks, discovered districts, best run, lifetime stats, settings
- **run:** a snapshot saved at briefing and prep, which powers Continue

Invalid or outdated saves are discarded, never half-loaded.

## 8. Accessibility and UX

- Every cost is shown before you buy, and an unaffordable build explains why.
- Resources use colour **and** icon/label, never colour alone.
- Pause in both modes, 1×/2× speed in defense, and a toggle to turn off screen shake.
- Objectives always appear on the HUD and map, so nothing important is hidden.
