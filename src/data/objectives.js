// Primary objectives, optional objectives and district events.
//
// Each primary objective is a list of steps. A step places one or more marked props:
//   pickup   walk over it (or press E) to collect
//   activate hold E for `hold` seconds; `spawnDuring` enemies arrive while you hold
//            (capped per night by CONFIG.expedition.byNight.holdSpawns; `guards` by byNight.guards)
//   kill     destroy the marked enemy / prop (`enemy: 'alpha'` = the area's biggest beast, GOALS.track)
// Stage 7 step types (critic J M4; run by src/scenes/JungleGoals.js, tuned in GOALS below):
//   escort   phase 'find': reach the stranded engineer and hold E · phase 'lead': he follows you; the goal is
//            done when he reaches the Relay or a beacon you switched on. Some creatures go for him; if he goes
//            down, the goal fails for the day.
//   defend   phase 'start': hold E at the uplink (today's area beacon if it is still off, else an uplink
//            terminal) · phase 'hold': stay near it for GOALS.uplink.time s while creature waves come; every hit
//            it takes costs it time. Done → that beacon comes on.
//   track    a clue (tracks, bones, claw marks): only the next one is marked; each lies GOALS.track.follow m from
//            the last. Then the Alpha (a `kill` step) waits a little further on.
//   carry    phase 'pickup': hold E at the generator core · phase 'deliver': carry it to the Relay or a beacon
//            (slower, no roll, no swings; E drops it so you can fight). The drone takes it there.
//   purge    pop GOALS.purge.count spore nests within GOALS.purge.time s of the first one (else they regrow).
// Finishing every step completes the objective: +1 skill point, and the `boon` applies to tonight's
// defense (players see it as the "Reward"). minNight: the goal is only dealt from that night on (Run.objectiveFor).
//
// `name` is THE objective sentence: the briefing card, the start banner, the HUD strip and the summary
// all use it word for word. Step `label`s only show as sub-steps of multi-step objectives ("name: label").
// `boon.short` is the briefing card's one-line reward; `boon.text` the full sentence (summary, night prep).
// Boon fields: freeUpgrades, freeRepair, towerRate, towerDamage, enemyCount, enemySpeed, laneSlow, bankScrap,
// bankRes {circuits, …} (Run.addBoon). `relic`: the goal also drops a relic of that rarity (scene.dropRelic).

export const PRIMARY = {
  restore_relay: {
    name: 'Fix the power box',
    steps: [
      { type: 'pickup', prop: 'fuse', label: 'find the fuse', room: 'side' },
      { type: 'activate', prop: 'power_box', hold: 1.5, label: 'fit it in the power box', room: 'objective' },
    ],
    boon: { short: 'One free tower upgrade tonight', text: 'Generator online: one free tower upgrade tonight.', freeUpgrades: 1 },
  },
  recover_data: {
    name: 'Download the route data',
    steps: [
      { type: 'activate', prop: 'terminal', hold: 7, spawnDuring: 4, label: 'hold E at the terminal (enemies come)', room: 'objective' },
    ],
    boon: { short: '10% fewer enemies tonight', text: 'Their routes are mapped: tonight\'s wave is 10% smaller.', enemyCount: 0.9 },
  },
  activate_pumps: {
    name: 'Switch on the two water pumps',
    steps: [
      { type: 'activate', prop: 'pump', hold: 1.5, count: 2, label: 'switch on both pumps', room: 'split' },
    ],
    boon: { short: 'North path flooded: enemies 15% slower there', text: 'Pumps flood the north path: enemies there are 15% slower tonight.', laneSlow: { lane: 0, mult: 0.85 } },
  },
  salvage_cell: {
    name: 'Salvage a power cell',
    steps: [
      { type: 'activate', prop: 'cell_cache', hold: 2.5, guards: 3, label: 'open the guarded cache (hold E)', room: 'objective' },
    ],
    boon: { short: 'Towers fire 10% faster tonight', text: 'Power cell installed: towers fire 10% faster tonight.', towerRate: 1.1 },
  },
  clear_blockage: {
    name: 'Kill the Razorback blocking the way',
    steps: [
      { type: 'kill', enemy: 'razorback', elite: true, label: 'kill the big Razorback', room: 'objective' },
    ],
    boon: { short: '+25 Scrap when you get home', text: 'Its hoard: +25 Scrap when you get home.', bankScrap: 25 },
  },
  // ---- Stage 7 (critic J M4): five new goals
  escort_engineer: {
    name: 'Bring the stranded engineer home',
    minNight: 2,
    steps: [
      { type: 'escort', phase: 'find', prop: 'engineer', hold: 1, label: 'find him (hold E)', room: 'objective' },
      { type: 'escort', phase: 'lead', label: 'lead him to the Relay or a beacon' },
    ],
    boon: { short: 'Two free tower upgrades tonight', text: 'The engineer joins the Relay crew: two free tower upgrades tonight.', freeUpgrades: 2 },
  },
  hold_uplink: {
    name: 'Hold the uplink until it comes online',
    minNight: 2,
    steps: [
      { type: 'defend', phase: 'start', prop: 'uplink', hold: 1, label: 'start it (hold E)', room: 'objective' },
      { type: 'defend', phase: 'hold', label: 'stay close while it boots' },
    ],
    boon: { short: '15% fewer enemies tonight', text: 'The uplink jams their calls: tonight\'s wave is 15% smaller.', enemyCount: 0.85 },
  },
  track_alpha: {
    name: 'Track down the Alpha and kill it',
    minNight: 2,
    steps: [
      { type: 'track', label: 'find its tracks', room: 'objective' },
      { type: 'track', label: 'follow the tracks' },
      { type: 'track', label: 'follow the tracks' },
      { type: 'kill', enemy: 'alpha', elite: true, label: 'kill the Alpha' },
    ],
    boon: { short: 'A rare relic, and towers 10% stronger tonight', text: 'The Alpha\'s trophy: towers deal 10% more damage tonight.', towerDamage: 1.1 },
    relic: 'R',
  },
  haul_core: {
    name: 'Carry a generator core home',
    minNight: 2,
    steps: [
      { type: 'carry', phase: 'pickup', prop: 'core', hold: 0.8, label: 'pick it up (hold E)', room: 'objective' },
      { type: 'carry', phase: 'deliver', label: 'carry it to the Relay or a beacon' },
    ],
    boon: { short: '+30 Scrap and 2 Circuits when you get home', text: 'The core, sold for parts: +30 Scrap and 2 Circuits.', bankScrap: 30, bankRes: { circuits: 2 } },
  },
  purge_bloom: {
    name: 'Pop all three spore nests within a minute',
    minNight: 2,
    steps: [
      { type: 'purge', label: 'pop the spore nests', room: 'objective' },
    ],
    boon: { short: 'Enemies 10% slower tonight', text: 'The bloom is gone: enemies move 10% slower tonight.', enemySpeed: 0.9 },
  },
};
export const PRIMARY_KEYS = Object.keys(PRIMARY);

// Tuning for the Stage 7 goal types (src/scenes/JungleGoals.js).
//   escort  hp / speed (tiles/s) of the engineer; he keeps `follow` tiles behind you along your trail (`crumb` =
//           breadcrumb spacing) and stops once he is `wait` tiles behind (and says so); `share` of the creatures
//           that come for you within `range` tiles of him go for him instead; `deliver` = how close to the Relay
//           (or a switched-on beacon) he must get; `outline` / `silhouette` = his look (green = friendly).
//   uplink  `time` s to boot while you stay within `radius` tiles (outside it the clock stops); `waves`: creature
//           packs at `at` s (spawned `spawnDist` tiles out); `share` of them go for the uplink, and each hit
//           costs it `hitCost` s; `types` weights the packs.
//   track   each clue `follow` m from the last; the Alpha waits `alphaDist` m past the last clue; you read a
//           clue by walking within `read` tiles; the Alpha is the area's biggest beast in `beasts` order, with
//           × `alphaHp` health on top of the elite multiplier. `decals` dress each clue.
//   carry   × `speed` while carrying; the drone takes it within `deliver` tiles of the Relay / a beacon;
//           `regrab` s hold to pick it back up; `sprite` = the core's look.
//   purge   `count` nests placed `spread` tiles from the site, `hp` each (× night enemy HP); a nest puffs a spore
//           cloud (ring telegraph `puffFuse` s) every `puffEvery` s while you are within `puffRange`; `time` s to
//           pop them all once the first one goes; `tint` = the nest's sickly spore colour.
export const GOALS = {
  escort: { hp: 60, speed: 4.2, radius: 0.3, follow: 1.8, crumb: 0.6, wait: 14, share: 0.5, range: 9, deliver: 5.6,
    sprite: 'npc_engineer', outline: '#141019', silhouette: '#63c74d', bar: '#63c74d', hurtIframes: 0.4 },
  uplink: {
    time: 45, radius: 7, hitCost: 3, share: 0.5, spawnDist: [11, 15],
    waves: [{ at: 0, n: 3 }, { at: 15, n: 4 }, { at: 30, n: 5 }],
    types: { crawler: 3, feral: 2, skitter: 2 },
    ring: '#2ce8f5',
  },
  track: {
    follow: [20, 30], alphaDist: [10, 16], read: 1.7, alphaHp: 1.5,
    beasts: ['razorback', 'feral', 'crawler'],
    decals: ['dec_footprints', 'dec_bones_skull', 'dec_twigs_crossed', 'dec_burrow'],
  },
  carry: { speed: 0.75, deliver: 3.2, regrab: 0.5, sprite: 'cell_cache' },
  purge: { count: 3, time: 60, hp: 30, spread: [4, 8], puffEvery: 6, puffRange: 3, puffFuse: 0.9, tint: '#d8f070' },
};

// Optional objectives: always optional, always marked on the map once the room is seen.
// skillPoint: completing it grants the trip's skill point if the goal hasn't (CONFIG.expedition.maxSkillPoints = 1 a trip).
export const OPTIONAL = {
  nest: {
    name: 'Destroy the enemy nest', prop: 'nest', type: 'kill', hp: 90, skillPoint: true,
    reward: {}, flag: { text: 'Nest destroyed: next wave 15% smaller.', enemyCount: 0.85 },
  },
  survivor: {
    name: 'Rescue the stranded engineer', prop: 'survivor', type: 'activate', hold: 2, skillPoint: true,
    reward: {}, flag: { text: 'Engineer rescued: free Relay repair (+25) tonight, or +15 Scrap if the Relay is full.', freeRepair: 25 },
  },
  data_log: {
    name: 'Recover a district data log', prop: 'data_log', type: 'pickup', skillPoint: true,
    reward: { intel: 2 }, research: 5,
  },
  locked_cache: {
    name: 'Open the locked cache', prop: 'locked_cache', type: 'activate', hold: 2,
    reward: { scrap: 20, circuits: 2, biofiber: 1 },
  },
};
export const OPTIONAL_KEYS = Object.keys(OPTIONAL);

// Events: optional risk/reward set pieces (JungleScene._setupEvents). One a day from EVENT_RULES.fromNight, at a
// camp or minor site in today's area (else nearby), announced and marked on the map once you come near. The prompt
// shows the reward and the risk before you commit. reward: loot spilled on the spot; flag: tonight's boon.
export const EVENTS = {
  workshop: {
    name: 'Abandoned Workshop', prop: 'workbench', hold: 6, spawnDuring: 2,
    prompt: 'Strip the workshop: 40 Scrap, but the noise draws creatures (6 s)', reward: { scrap: 40 },
  },
  power_surge: {
    name: 'Power Surge', prop: 'power_box', hold: 3, spawnDuring: 3,
    prompt: 'Overload the grid: towers deal 15% more damage tonight, but creatures come (3 s)',
    flag: { text: 'Power surge: towers deal 15% more damage tonight.', towerDamage: 1.15 },
  },
  infested_cache: {
    name: 'Infested Cache', prop: 'cache', hold: 2, guards: 4,
    prompt: 'Crack the cache: 30 Scrap, 2 Circuits, 2 Biofiber, but it is guarded', reward: { scrap: 30, circuits: 2, biofiber: 2 },
  },
};
export const EVENT_KEYS = Object.keys(EVENTS);
// fromNight: the first night with an event · sites: the site types one may stand at (today's area first) ·
// announce: tiles at which it is announced (its risk and reward) and marked on the map.
export const EVENT_RULES = { fromNight: 2, sites: ['camp', 'minor'], announce: 10 };
