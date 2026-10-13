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
    crateRange: 34,     // tiles: the "open a crate" step points at a crate this close, roughly on the way to the
    crateCone: 55,      //   objective (± this many degrees); else it is skipped (a tip comes when you pass one)
    crateWait: 40,      // s: … and passes on its own after this long
    tipTime: 5,         // s: a one-off tip (enemy, stamina) replaces the step line this long
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

// Night prep readiness check (DefenseScene): rough tower damage over the wave vs the wave's total health.
// ratio = Σ tower DPS (upgrades/boons applied, support/slow towers count `supportValue`) × waveSeconds(N)
//         ÷ Σ enemy HP (night health multiplier applied).
// Below `weak` the Start Wave button asks first; `ok` and above reads as ready.
// Calibrated against DESIGN.md §5's balance notes: N1 one turret ≈ 0.87 (risky: loses ~⅓ of the Relay), two ≈ 1.9
// (strong); N2 two towers ≈ 0.66 (weak: ends at ~15 HP), three ≈ 0.97 (risky), five ≈ 1.6 (strong); N3+ waves run
// longer (more time in range), so six level-1 towers read risky on N3 and weak on N4 (where turret spam falls).
export const READINESS = {
  weak: 0.85,
  ok: 1.5,
  // Seconds of useful fire a tower gets per wave, by night (waves get longer; a tower only covers part of a lane).
  waveSeconds: [32, 30, 50, 50, 52, 52],
  slowValue: 6,         // a slow tower counts as this much DPS (it keeps enemies in range longer)
  supportValue: 0.2,    // a support tower adds this share of the DPS of the others
};

// Tower strength pips in the build list (1–3 each). Hover a card for the exact numbers.
export const PIPS = { max: 3 };
