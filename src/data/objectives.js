// Primary objectives, optional objectives and district events.
//
// Each primary objective is a list of steps. A step places one or more marked props:
//   pickup   walk over it (or press E) to collect
//   activate hold E for `hold` seconds; `spawnDuring` enemies arrive while you hold
//            (capped per night by CONFIG.expedition.byNight.holdSpawns; `guards` by byNight.guards)
//   kill     destroy the marked enemy / prop
// Finishing every step completes the objective: +1 skill point, and the `boon` applies to tonight's
// defense (players see it as the "Reward").
//
// `name` is THE objective sentence: the briefing card, the start banner, the HUD strip and the summary
// all use it word for word. Step `label`s only show as sub-steps of multi-step objectives ("name: label").
// `boon.short` is the briefing card's one-line reward; `boon.text` the full sentence (summary, night prep).

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
};
export const PRIMARY_KEYS = Object.keys(PRIMARY);

// Optional objectives: always optional, always marked on the map once the room is seen.
// skillPoint: completing it grants a bonus skill point (max 2 per expedition).
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

// Events: optional risk/reward set pieces. The prompt shows reward and risk before you commit.
export const EVENTS = {
  workshop: {
    name: 'Abandoned Workshop', prop: 'workbench', hold: 6, spawnDuring: 2,
    prompt: 'Strip the workshop (6s, draws attention)', reward: { scrap: 40 },
  },
  power_surge: {
    name: 'Power Surge', prop: 'surge_box', hold: 3, spawnDuring: 3,
    prompt: 'Overload the grid (enemies come) — towers deal 15% more damage tonight',
    flag: { text: 'Power surge: towers deal 15% more damage tonight.', towerDamage: 1.15 },
  },
  infested_cache: {
    name: 'Infested Cache', prop: 'cell_cache', hold: 2, guards: 4,
    prompt: 'Crack the cache (guarded)', reward: { scrap: 30, circuits: 2, biofiber: 2 },
  },
};
export const EVENT_KEYS = Object.keys(EVENTS);
