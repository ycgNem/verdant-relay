// Simplicity pass (Stage 6, critic "newcomer"): the guided first day, gentler day 1, plain words,
// what the UI hides until it matters, and the pre-wave readiness check. Read by Run.js (guided
// district/objective), BriefingScene, JungleScene (coach, first-day wildlife, return prompt),
// SummaryScene and DefenseScene (readiness, tower pips).

// The guided first run (the player's very first run: meta.lifetime.runs was 0 when it started).
// Night 1 offers one area with an easy objective, and the jungle HUD coaches one step at a time.
export const GUIDE = {
  district: 'overgrown_market',  // the only area offered on the guided night 1 (mostly Crawlers)
  objective: 'salvage_cell',     // one step, one small fight
  // Guided day: prefer an objective site this far from the Relay (m), on a trail (not a "lost" site).
  objectiveDist: [32, 60],
  coach: {
    moveDist: 3,        // tiles walked before "move" counts as learned
    cutWait: 22,        // s: the "cut through plants" step passes on its own after this long
    crateRange: 24,     // tiles: the "open a crate" step points at a crate this close, roughly on the way to the
    crateCone: 55,      //   objective (± this many degrees); else it is skipped (a tip comes when you pass one)
    crateWait: 45,      // s: … and passes on its own after this long
    // A coached crate must be easy to reach (critic L §2.1: one sat behind solid thicket): its walking path over
    // open ground (flow field, brush blocks) at most this × the straight line, and within this many tiles of a trail.
    cratePath: 1.3,
    crateTrail: 2,
    mapWait: 12,        // s: the "Tab: the map" step passes on its own after this long
    markRange: 14,      // tiles: the guided route's crates get an amber ◆ over them this close
    tipTime: 5,         // s: a one-off tip (enemy, stamina) replaces the step line this long
  },
  // Trail-side crates along the guided route (JungleGen guidedRoute, only in a guided run's world): on the walk
  // from the Relay to the guided goal site, the first `first` tiles in, then every `every` tiles, at most `max`,
  // none in the last `endGap` tiles; each on the first free tile off the trail's edge (`side`: tiles from the
  // route's centre line searched). Container types in order. Together with the goal site's own containers a
  // player who follows the coach banks ≥ 45 Scrap (critic L §2.1: the guided day used to bank 9).
  routeCrates: {
    first: 12, every: 15, max: 4, endGap: 10,
    types: ['crate', 'chest', 'crate', 'chest'],
    side: [1.5, 5],
    yield: 1,           // Scrap multiplier (instead of the distance rule, which gives ×0.45 this close to the Relay)
  },
};

// One-off tips that teach each verb when it first matters (critic L §2.2; JungleScene._tip / _checkTips). Each
// shows once per profile (meta.hints['tip_' + id]; "Show hints again" in Settings brings them back), one at a
// time in the coach line (top-left, clear of the fight), never two at once. {action} = the bound key.
export const TIPS = {
  time: 5,              // s a tip stays up
  gap: 1,               // s between two tips
  wait: 14,             // s a queued tip may wait for its turn before it is dropped (urgent ones: 1.5)
  roll: { range: 4, time: 3.5 },                  // the first wind-up within this many tiles (urgent)
  deflect: { fromNight: 2, afterRoll: 8, time: 4.5 },   // the first lunge at you from this night on; on the guided
                                                  //   day, the first one this many s after the roll tip
  bramble: { ahead: 0.8 },                        // the first bramble you walk into (tiles ahead of you)
  throw: { range: 8 },                            // the first Spitter / shooter this close you can't walk to
  med: { below: 0.5 },                            // the first time health is under this share with a kit
  beacon: { range: 10 },                          // the first dead beacon this close
  sunset: { lead: 60 },                           // s of daylight left
  text: {
    roll: '<b>Red flash = roll!</b> {roll} through it, then hit it while it\'s open',   // (Stage 9: committed attacks)
    deflect: 'Tap <b>right-click</b> just before it hits to <b>deflect</b>, then slash back',
    bramble: 'Thorny bramble: hold <b>right-click</b> for a heavy chop',
    throw: '{throw}: throw your machete. It flies through plants and comes back',
    med: 'Hurt? {med} uses a med kit (+{heal} health)',
    beacon: '<b>Beacons</b> are a way home, and at night they light the path facing them: hold {interact} to switch this one on',
    sunset: 'Sunset in 1:00. After dark the jungle hunts you: <b>head home</b>',
  },
};

// Run day 1 (every run): the first fight should be one weak creature, not a pack.
export const FIRST_DAY = {
  safeRadius: 26,       // m around the Relay with no wildlife (POP.safeRadius otherwise)
  pop: 0.45,            // wildlife per chunk × this (on top of POP.byNight[0])
  noRoam: ['razorback', 'spitter'],   // creature types that don't roam the jungle on day 1
  groupMax: 1,          // creatures roam alone
  campSize: [0, 1],     // feral camp size (often empty on day 1)
  guards: 1,            // objective guards (CONFIG.expedition.byNight.guards caps it otherwise)
  holdSpawns: 2,        // creatures that come while you hold E at an objective
};

// When the jungle offers "Head home": once you have something to lose or have been out a while —
// never at the drop-off point right away.
export const RETURN_PROMPT = {
  after: 75,            // s into the day
  lowHp: 0.3,           // or below this share of health
};

// The bottom strip's "home" distance shows only when going home is the next thing to do.
export const HOME_HINT = { lastSeconds: 60, lowHp: 0.3 };

// Plain words for the UI (code keys stay as they are: pylon, extract, boon…).
export const WORDS = {
  pylon: 'beacon',
  Pylon: 'Beacon',
  relay: 'Relay',
  stored: 'Stored at base',
};

// Night prep readiness check (DefenseScene._readiness → src/scenes/DefenseForecast.js, critic K §4.6 / L §6.2):
// a fast 1-D replay of tonight's pushes against the real tower stats and the stretch of path each tower
// covers, giving a predicted Relay loss per path. Shown as "North ●●● · South ○○○ · expect −a to −b".
//   sample / step / maxTime   lane sample spacing (tiles), replay step and cap (s) per push
//   efficiency                tower damage × this (the replay has no projectile travel, overkill or retargeting)
//   thornSlowShare            a thorn slow-on-hit counts as this share of a full slow where the Nest covers the path
//   bossPace                  the Colossus walks at this share of its speed on average (roots, wind-ups, roars)
//   burnShare / bombletShare  Napalm / Cluster extra damage counted per shell (share of its full value)
//   protocols                 each Relay Protocol this run has as a damage-equivalent (dps + perNight × night),
//                             × protocolUse (nobody casts perfectly), over the last protocolReach tiles of each lane
//   lossScale                 calibration of the predicted loss against the balance sim (Stage 7: the raw replay
//                             over-predicted ~1.55×, 0.65; Stage 9 with free placement and the harder curve: 0.54)
//   band                      the shown range: [loss × band[0] − 2, loss × band[1] + 3]
//   dots                      a path's leak share (Relay damage it lets through ÷ its threat) at or below these
//                             gives ●●● / ●●○ / ●○○ (above: ○○○; a path no tower reaches is always ○○○)
//   weakShare                 predicted loss ≥ this share of the Relay's current health → "Too weak: expect heavy
//                             damage" (Start asks). Stage 9 sim: at 0.5 every night that fell read weak, and ~85% of
//                             the nights that cost half the Relay or more
//   strongLoss / strongShare  predicted loss ≤ max(strongLoss, Relay max × strongShare), with every path ●●○ or
//                             better → "Looks strong"; anything else is "Risky"
// Calibration (Stage 7 sim, .playwright-mcp/nightmech): see DESIGN.md §5.
export const READINESS = {
  sample: 0.25, step: 0.1, maxTime: 240,
  efficiency: 0.8,
  thornSlowShare: 0.5,
  bossPace: 0.62,
  burnShare: 0.4, bombletShare: 0.4,
  protocols: {
    vine_snare: { dps: 7.5 },                  // (+25% damage taken while held, critic K2 #3)
    arc_discharge: { dps: 2, perNight: 3.5 },  // (25 × healthMult a cast: ~1.4× the old 40 + 20 × night)
    flare: { dps: 4 },
  },
  protocolUse: 0.6, protocolReach: 9,
  lossScale: 0.54,   // (Stage 9 build anywhere + harder nights: 0.65 × 0.83, 108 sim runs / 979 nights)
  band: [0.6, 1.5],   // (1.4 → 1.5, critic Q: a newcomer's nights 1–2 landed 1–2 above the band's top)
  dots: [0.05, 0.2, 0.5],
  weakShare: 0.5,    // (Stage 9: at 0.35 a typical build read weak on ~1 night in 3; 0.5 still flags every sim fall)
  strongLoss: 2, strongShare: 0,   // (critic K2 #8: never "strong" with a predicted loss worse than −2)
};

// Tower strength pips in the build list (1–3 each). Hover a card for the exact numbers.
export const PIPS = { max: 3 };
