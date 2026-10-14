// Lore (critic J N4): the jungle gets places and a past.
//
// PLACE_NAMES: every landmark and major site gets a name from its area's list (seeded per world in
// src/world/JungleGen.js `siteFeatures`, never the same name twice in one jungle). `{n}` becomes a small number.
// Names show on the big map once the place is mapped, and as a small banner the first time you walk in.
//
// LORE_LOGS: 20 short data logs, found at sites (the glowing `data_log` prop) — at most one per site, about
// three or four on a run. You always get the next one you haven't read (story order), so the story unfolds
// across runs; read logs are kept forever (meta.lore) and can be re-read in the Collection's Codex.
// LORE_SPOTS: how many sites hold one (chance per site type).

export const PLACE_NAMES = {
  overgrown_market: {
    major: ['Kiosk Row', 'The Covered Market', 'Awning Square', 'The Old Bazaar', "Stallholders' Arcade", 'Market Hall {n}'],
  },
  flooded_transit: {
    major: ['The Drowned Platform', 'Platform {n}', 'Terminus Hall', 'The Sunken Concourse', 'Rail Yard {n}'],
  },
  canopy_greenhouse: {
    major: ['The Glass Nursery', 'Palm House {n}', 'The Seedbank Dome', 'Canopy Lab {n}', 'The Propagation Halls'],
  },
  collapsed_residential: {
    major: ['Laurel Court', 'Tower Block {L}', 'The Leaning Flats', 'Juniper Terrace', 'Block {n} Courtyard'],
  },
  data_center: {
    major: ['Server Hall {n}', 'Cooling Plant {n}', 'The Archive Vault', 'Uplink Room {n}', 'The Cable Trench'],
  },
};

// Landmarks are named by what stands there (the ruin type), with the area's flavour in the subtitle.
export const LANDMARK_NAMES = {
  statue: ["The Founder's Head", 'The Stone Watcher', 'The Weeping Engineer', 'The Mossy Saint', 'The Old Mayor'],
  mast: ['Radio Mast K-{n}', 'The Broadcast Spire', 'Signal Mast {n}', 'The Weather Mast'],
  greenhouse: ['The Glasshouse', 'The Orchid House', 'The Glass Pavilion', 'The Fern House'],
};

// What each landmark offers (JungleScene: the shrine's prompt and its one-time extra; RELIC_SOURCES tuning).
export const LANDMARK_KINDS = {
  statue: { label: 'Shrine', verb: 'Kneel at the shrine', extra: null },
  mast: { label: 'Radio mast', verb: 'Power the radio mast', extra: 'Maps the land around it' },
  greenhouse: { label: 'Glasshouse', verb: 'Search the glasshouse', extra: 'Its rain cistern heals you' },
};

// Sites that hold a data log: chance per site type (a seeded roll per site; pylons and camps never).
export const LORE_SPOTS = { major: 0.6, minor: 0.35, landmark: 0.5, camp: 0, pylon: 0, hold: 0.6 };

/**
 * The logs, in story order. `who` signs it; `text` is 2–4 plain sentences. Voice: the Relay crew's own record —
 * dry, tired, practical.
 */
export const LORE_LOGS = [
  { id: 'l01', title: 'Day one', who: 'E. Oduya, Relay engineer',
    text: 'Day one of the Verdant Relay. Power for the east side and every radio in the city now runs through this old train station. The mayor cut a ribbon made of fern. Somebody thought that was funny.' },
  { id: 'l02', title: 'The Canopy Program', who: 'City bulletin',
    text: 'The Canopy Program seeds went out today: fast vines on every roof, to cool the streets and clean the air. They grow a metre a week. The botanists promise they stop at the roofline.' },
  { id: 'l03', title: 'Past the roofline', who: 'E. Oduya, Relay engineer',
    text: 'They did not stop at the roofline. Vines are in the train tunnels and under the market awnings. The crews cut back four tonnes of it yesterday, and it was back by morning.' },
  { id: 'l04', title: 'Stall 41', who: 'A market trader',
    text: 'Stall 41 is gone under the creepers. Something small and spiny lives in the crates now. We call them crawlers. They hate the light, so I leave the lamp on all night.' },
  { id: 'l05', title: 'Cooling Plant 2', who: 'Data center night shift',
    text: 'The server halls run hot, and the roots love the heat. A root split the main pipe at Cooling Plant 2 and the halls cooked. The backups went to the Relay. If the Relay goes dark, the city forgets everything it knew.' },
  { id: 'l06', title: 'Do not open the pods', who: 'Dr. A. Reyes, Canopy Program',
    text: 'The glasshouse samples are changing. The pods swell when someone walks close and burst into a fine dust. Breathing it makes you slow and stupid. Do not open the pods.' },
  { id: 'l07', title: 'Platform 9', who: 'Station announcer',
    text: 'The river has jumped its banks and taken the lower platforms. The trains are staying where they stopped. Spitters are nesting in the reeds by Platform 9. Please do not feed the spitters.' },
  { id: 'l08', title: 'Evacuation order', who: 'Emergency broadcast',
    text: 'Walk to the Relay. Drones will lift you out from the station roof. Take one bag. We are sorry about the pets.' },
  { id: 'l09', title: 'The last drones', who: 'E. Oduya, Relay engineer',
    text: 'Most people got out. The drones stopped coming in the third week: the canopy closed over the city and they could not find the roof. The Relay beacon is the only light they can still see from above.' },
  { id: 'l10', title: 'What comes at night', who: 'E. Oduya, Relay engineer',
    text: 'At night they come for the Relay: crawlers, skitters, the big tusked ones. Reyes thinks the hum of the core draws them, like moths to a lamp. We built turrets out of scrap and ate dinner on the roof.' },
  { id: 'l11', title: 'Laurel Court', who: 'A resident who stayed',
    text: 'We stayed in Laurel Court. The building leans now, but it is ours. Tomas goes out by day with a machete and comes back with tins. He says the trails move a little every night.' },
  { id: 'l12', title: 'The Ruiz family', who: 'Trade-meet notes',
    text: 'The Ruiz family stopped coming to the trade meet. When we saw them again they wore masks of bark and would not speak. They had been sleeping near the pods. They threw spears at us.' },
  { id: 'l13', title: 'The rule', who: 'Relay crew rulebook',
    text: 'Eleven of us still go out. We call ourselves the Relay crew. The rule is simple: bring back what the towers need, and be home before dark.' },
  { id: 'l14', title: 'Beacons', who: 'Relay crew notes',
    text: 'The old relay pylons still work if you give them a jolt. Switch one on and the drone can find you there. Oduya says every lit beacon is another star in our sky.' },
  { id: 'l15', title: 'Things people left', who: 'Relay crew notes',
    text: 'Out here you find things people left behind: charms, tools, odd little idols. Some of them help. Some of them want something back. Read the tag before you carry one home.' },
  { id: 'l16', title: 'Something big', who: 'E. Oduya, Relay engineer',
    text: 'Something big walks the deep jungle, and the trees close up behind it. At the end of a bad week it comes for the Relay itself. We held it off once. Once.' },
  { id: 'l17', title: 'Not an accident', who: 'Dr. A. Reyes, Canopy Program',
    text: 'The Canopy seed was never meant to stop. We were asked for a plant that could not be killed, and we made one. I am writing this down so someone knows it was not an accident.' },
  { id: 'l18', title: 'The glass lit up', who: 'E. Oduya, Relay engineer',
    text: 'Reyes walked into the glasshouse with a torch and a can of fuel. The glass glowed green for an hour. In the morning the vines were thicker than before.' },
  { id: 'l19', title: 'Keep it humming', who: 'E. Oduya, Relay engineer',
    text: 'My knees are done, so the new kid runs the trips now. Keep the core lit, kid. As long as it hums, someone up there can still find us.' },
  { id: 'l20', title: 'If you are reading this', who: 'Unsigned',
    text: 'If you are reading this, the Relay still stands. The city is gone, but the signal is not. Hold the line.' },
];

export const LORE_KEYS = LORE_LOGS.map((l) => l.id);
export const LORE_BY_ID = Object.fromEntries(LORE_LOGS.map((l) => [l.id, l]));
