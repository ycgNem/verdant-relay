// Relics (critic J M3 / §7: a reason to explore). 24 found things that change how a run plays.
//
// Where they come from (RELIC_SOURCES; placed by src/world/JungleGen.js `siteFeatures`, run by JungleScene):
//   - every LOST major site holds an old strongbox behind its bramble ring (hold E: a relic pops out);
//   - every landmark is a SHRINE: pick 1 of 2 (a radio mast also maps the land around it, a glasshouse heals you);
//   - a hidden cache in the brush has a `hiddenChance` to hold one;
//   - an area boss drops a rare one (JungleScene.dropRelic(x, z, { rarity: 'R' })).
// A relic you pick up is CARRIED loot: it shows on the HUD, goes home with you (Run.applyExpedition banks it into
// run.relics) and is lost if you go down. Once home it works for the rest of the run (day effects from the next
// trip on, night effects from that very night).
//
// Rarity: C common, R rare, X cursed (a strong upside with a real downside, `down`, always shown in red-violet).
// Effects live in `fx` and are read in ONE place: Run.relicMod(field) (relicMod below), which combines every owned
// relic's value of that field by FX_MODE. Where each field is read:
//   meleeDamage        JungleScene.meleeHit (every machete swing / chop / shove)
//   damageTaken        Player.hurt
//   fernDrag           Player movement → JungleWorld.speedAt(…, fernDrag): fern slow = 1 − (1 − GROUND.fern) × fernDrag
//   rollCost / chopCharge   Player.startRoll / the heavy chop's charge time
//   maxMeds / medHeal  Player (carry cap, Q heal), JungleScene pickups, the briefing's med-kit shop
//   duskLight / huntDelay   JungleScene (light radius after sunset, hunter pack interval)
//   brambleSlash       JungleScene.meleeHit (a light slash cuts brambles like a chop)
//   sporeFoe / sporeSelf    SporePods (cloud damage to creatures / to you)
//   cacheRadar         JungleScene markers (hidden caches within N tiles on the minimap)
//   fangDodge          JungleScene.relicPerfectDodge (Player._perfectDodge calls it)
//   secondWind         JungleScene.relicSave (Player._die calls it)
//   killHeal           JungleScene.onEnemyKilled
//   droneShare         Run.salvageFor (the drone's share when you go down)
//   containerScrap     Run.lootMults
//   relayMax           Run.relayMax
//   prepCircuits       Run.beginPrep
//   noBiofiber         Run.buildCost / upgradeCost (tower types)
//   towerDamage / beaconRate / beaconRateMax   Run.towerStats
//   enemySpeed / nightGroup   Run.chooseDistrict + on banking (tonight.enemySpeed / extraGroups)
//   firstShot / vsType DefenseScene.damage via Run.relicHitMult
//   relayRegen         DefenseScene._step (during pushes)
//   protocolCooldown / protocolRadius   DefenseProtocols via Run.protocolDef
// Icons: 24×24 plaque sprites `relic_<id>` (pixel-art/manifest.v3relics.json) in the UI; a relic lying in the jungle is
// a small generic pendant in its rarity colour, and the UI falls back to it for any id without art (src/ui/relics.js).

// Colours match the icon plaques (pixel-art relic_<id>: common slate, rare cyan with gold studs, cursed red-violet).
export const RARITY = {
  C: { name: 'Common', color: '#c0cbdc', dark: '#3a4466', glyph: '◆' },
  R: { name: 'Rare', color: '#62e0f2', dark: '#124e89', glyph: '★' },
  X: { name: 'Cursed', color: '#e05a9a', dark: '#4a1630', glyph: '✶' },
};

// How each effect field combines across owned relics (Run.relicMod). Unknown fields read as undefined.
export const FX_MODE = {
  meleeDamage: 'mult', damageTaken: 'mult', fernDrag: 'mult', rollCost: 'mult', chopCharge: 'mult',
  sporeFoe: 'mult', sporeSelf: 'mult', firstShot: 'mult', towerDamage: 'mult', enemySpeed: 'mult',
  protocolCooldown: 'mult', protocolRadius: 'mult', containerScrap: 'mult',
  maxMeds: 'add', medHeal: 'add', duskLight: 'add', huntDelay: 'add', prepCircuits: 'add', relayMax: 'add',
  relayRegen: 'add', killHeal: 'add', cacheRadar: 'max', droneShare: 'max', beaconRate: 'add', beaconRateMax: 'add',
  brambleSlash: 'flag', fangDodge: 'flag', secondWind: 'flag',
  noBiofiber: 'list', vsType: 'map',
};

/**
 * The 24 relics. `text` = what it does (plain words); `down` = a cursed relic's price; `when` = where it matters
 * ('day' jungle, 'night' the defense, 'both'); `fx` = effect fields (see the header).
 */
export const RELICS = {
  whetstone: { name: 'Whetstone Charm', rarity: 'C', when: 'day', text: 'Machete damage +20%.', fx: { meleeDamage: 1.2 } },
  tapir_boots: { name: 'Tapir-hide Boots', rarity: 'C', when: 'day', text: 'Ferns barely slow you (×0.75 speed instead of ×0.5).', fx: { fernDrag: 0.5 } },
  lantern_moth: { name: 'Lantern Moth', rarity: 'C', when: 'day', text: 'After sunset your light reaches 3 tiles further, and hunters come 4 s slower.', fx: { duskLight: 3, huntDelay: 4 } },
  bramble_gloves: { name: 'Bramble Gloves', rarity: 'C', when: 'day', text: 'Light slashes clear thorny brambles (no heavy chop needed).', fx: { brambleSlash: true } },
  spore_sac: { name: 'Spore Sac', rarity: 'C', when: 'day', text: 'Spore clouds hurt creatures twice as much, and you half as much.', fx: { sporeFoe: 2, sporeSelf: 0.5 } },
  featherfoot: { name: 'Featherfoot Anklet', rarity: 'C', when: 'day', text: 'Dodge rolls cost 25% less stamina.', fx: { rollCost: 0.75 } },
  medic_satchel: { name: "Medic's Satchel", rarity: 'C', when: 'day', text: 'Carry 3 med kits instead of 2, and each heals 10 more.', fx: { maxMeds: 1, medHeal: 10 } },
  cracked_lens: { name: 'Cracked Lens', rarity: 'C', when: 'night', text: "Each tower's first hit in every push deals triple damage.", fx: { firstShot: 3 } },
  old_battery: { name: 'Old Battery', rarity: 'C', when: 'night', text: '+1 Circuit every night before the attack.', fx: { prepCircuits: 1 } },
  seed_bank: { name: 'Seed Bank', rarity: 'C', when: 'night', text: 'Thorn Nests and Snare Vines need no Biofiber (to build or upgrade).', fx: { noBiofiber: ['thorn_nest', 'snare_vine'] } },
  rusted_bell: { name: 'Rusted Bell', rarity: 'C', when: 'night', text: 'Towers deal 25% more damage to Razorbacks and Ruin Guards.', fx: { vsType: { razorback: 1.25, ruin_guard: 1.25 } } },
  compass: { name: "Scavenger's Compass", rarity: 'R', when: 'day', text: 'Hidden caches within 20 tiles show on your minimap.', fx: { cacheRadar: 20 } },
  hunters_fang: { name: "Hunter's Fang", rarity: 'R', when: 'day', text: 'A perfect dodge refills your stamina, and your next hit deals double damage.', fx: { fangDodge: true } },
  ironwood_grip: { name: 'Ironwood Grip', rarity: 'R', when: 'day', text: 'The heavy chop charges 40% faster.', fx: { chopCharge: 0.6 } },
  drone_tag: { name: 'Drone Tag', rarity: 'R', when: 'day', text: 'If you go down, the drone saves 60% of the loot you carry (relics are still lost).', fx: { droneShare: 0.6 } },
  second_wind: { name: 'Lifeline Idol', rarity: 'R', when: 'day', text: 'Once a day, a hit that would take you down leaves you at 1 health instead, untouchable for 1.5 s.', fx: { secondWind: true } },
  pylon_coil: { name: 'Beacon Coil', rarity: 'R', when: 'night', text: 'Towers attack 4% faster for every beacon you have switched on (up to +20%).', fx: { beaconRate: 0.04, beaconRateMax: 0.2 } },
  root_heart: { name: 'Root Heart', rarity: 'R', when: 'night', text: 'The Relay heals 1 health every 4 s during the attack.', fx: { relayRegen: 0.25 } },
  capacitor: { name: 'Overcharged Capacitor', rarity: 'R', when: 'night', text: 'Relay Protocols recharge 25% faster.', fx: { protocolCooldown: 0.75 } },
  signal_booster: { name: 'Signal Booster', rarity: 'R', when: 'night', text: 'Relay Protocols cover a 40% wider circle.', fx: { protocolRadius: 1.4 } },
  hungry_idol: { name: 'Hungry Idol', rarity: 'X', when: 'both', text: 'Containers give 40% more Scrap.', down: 'An extra pack of Crawlers joins every night\'s attack.', fx: { containerScrap: 1.4, nightGroup: { type: 'crawler', count: 4 } } },
  blood_moss: { name: 'Blood Moss', rarity: 'X', when: 'both', text: 'Every creature you kill in the jungle heals you 2.', down: 'The Relay\'s maximum health drops by 15.', fx: { killHeal: 2, relayMax: -15 } },
  glass_machete: { name: 'Glass Machete', rarity: 'X', when: 'day', text: 'Machete damage +50%.', down: 'You take 30% more damage.', fx: { meleeDamage: 1.5, damageTaken: 1.3 } },
  storm_totem: { name: 'Storm Totem', rarity: 'X', when: 'night', text: 'Towers deal 20% more damage.', down: 'Enemies move 10% faster at night.', fx: { towerDamage: 1.2, enemySpeed: 1.1 } },
};

export const RELIC_KEYS = Object.keys(RELICS);

// Sources and pick-up tuning (DESIGN.md "Relics").
export const RELIC_SOURCES = {
  cacheHold: 1.6,             // hold E at a lost site's strongbox
  shrineHold: 0.8,            // hold E at a landmark (then the pick of two)
  hiddenChance: 0.12,         // a hidden cache in the brush also holds a relic
  weights: { C: 60, R: 28, X: 12 },        // strongbox / hidden-cache draw, by rarity
  shrineWeights: { C: 50, R: 34, X: 16 },  // each of a shrine's two offers (never the same relic twice)
  bossRarity: 'R',            // area bosses drop one of this rarity (JungleScene.dropRelic)
  // Landmark extras (one time per landmark per run): a radio mast maps `mastReveal` tiles around it, a glasshouse's
  // rain cistern heals `glasshouseHeal`.
  mastReveal: 40,
  glasshouseHeal: 40,
  // The relic on the ground: walk over it (magnet radius in tiles, after `delay` s).
  magnet: 1.8,
  delay: 0.5,
  // Map / HUD.
  seenRange: 9,               // a strongbox / shrine shows on the map once you have been this close (or mapped it)
  placeRange: 1.15,           // × a named site's radius: entering it shows its name (once per run)
};

/** Combine field `field` over the relic ids in `ids` (FX_MODE). Defaults: mult 1, add/max 0, flag false, list [], map {}. */
export function relicMod(ids, field) {
  const mode = FX_MODE[field];
  let v = mode === 'mult' ? 1 : mode === 'flag' ? false : mode === 'list' ? [] : mode === 'map' ? {} : 0;
  for (const id of ids || []) {
    const x = RELICS[id]?.fx?.[field];
    if (x == null) continue;
    if (mode === 'mult') v *= x;
    else if (mode === 'add') v += x;
    else if (mode === 'max') v = Math.max(v, x);
    else if (mode === 'flag') v = v || !!x;
    else if (mode === 'list') v = [...new Set([...v, ...x])];
    else if (mode === 'map') { v = { ...v }; for (const [k, m] of Object.entries(x)) v[k] = (v[k] || 1) * m; }
  }
  return v;
}

/**
 * Draw a relic of `rarity` (or by `weights` when none is given) from those not in `exclude`, with `rng`
 * (src/core/rng.js). Falls back to any rarity when that pool is empty; null when every relic is taken.
 */
export function drawRelic(rng, exclude = [], opts = {}) {
  const free = RELIC_KEYS.filter((k) => !exclude.includes(k));
  if (!free.length) return null;
  let rarity = opts.rarity;
  if (!rarity) {
    const w = {};
    for (const [r, n] of Object.entries(opts.weights || RELIC_SOURCES.weights)) if (free.some((k) => RELICS[k].rarity === r)) w[r] = n;
    rarity = Object.keys(w).length ? rng.weighted(w) : null;
  }
  const pool = free.filter((k) => RELICS[k].rarity === rarity);
  return rng.pick(pool.length ? pool : free);
}

/**
 * A relic that would do nothing for this run's build (critic J2 C12): Bramble Gloves with a Parang (its light
 * slashes already cut brambles) or Cleaver, Tapir-hide Boots with Brush Dancer (ferns don't slow you), Seed Bank
 * with neither Thorn Nest nor Snare Vine researched. Shrines, strongboxes and drops skip these while others are left
 * (JungleRelics._exclude).
 */
export function relicDead(id, run, meta) {
  const has = (s) => !!run?.hasSkill?.(s);
  if (id === 'bramble_gloves') return run?.weapon === 'parang' || has('cleaver');
  if (id === 'tapir_boots') return has('brush_dancer');
  if (id === 'seed_bank') return !!(meta && run?.isTowerUnlocked) && !['thorn_nest', 'snare_vine'].some((k) => run.isTowerUnlocked(k, meta));
  return false;
}

/**
 * A live line for a relic where the run state changes its value (night prep, summary), e.g.
 * "Pylon Coil: towers +12% attack speed (3 beacons on)". Falls back to the relic's own text.
 */
export function relicLive(id, run) {
  const R = RELICS[id];
  if (!R) return '';
  if (id === 'pylon_coil') {
    const n = run?.world?.pylons?.length || 0;
    const pct = Math.round(Math.min(R.fx.beaconRateMax, R.fx.beaconRate * n) * 100);
    return n ? `Towers +${pct}% attack speed (${n} beacon${n === 1 ? '' : 's'} on)` : 'Towers +4% attack speed per beacon you switch on (none yet)';
  }
  if (id === 'old_battery') return '+1 Circuit before every attack';
  if (id === 'blood_moss') return `Relay max health −${-R.fx.relayMax}; jungle kills heal you ${R.fx.killHeal}`;
  return R.text.replace(/\.$/, '');
}
