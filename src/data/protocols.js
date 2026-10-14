// Relay Protocols (critic K #1 / critic J M1): active abilities the player fires during a night — in a push
// or a lull between pushes. Each is aimed by clicking the map (a telegraph ring follows the mouse), from its
// button in the side panel or its hotkey. DefenseScene runs them (_protocolInput / _castProtocol /
// _updateProtocols); Run.protocolsFor(meta) says which ones this run has.
//
//   cost       resources paid per cast ({} = free)
//   cooldown   seconds before the next cast (with `charges`: before one charge comes back)
//   charges    casts that can be stored, per night (index = night − 1, the last entry repeats)
//   radius     tiles; telegraph: seconds between the click and the effect (shown as a filling ring)
//   unlock     meta.unlocks key that enables it (null = every run has it). Debug runs (?debug=…) get all
//              of them until the research tree sells these unlocks.
//
// Vine Snare   roots non-boss enemies in the circle for `root` s; the Colossus for `bossRoot` s, and a
//              Colossus winding up its charge has the charge cancelled (back to walking).
// Arc Discharge `damage[0] + damage[1] × night` energy damage to everything in the circle (Ruin Guard
//              shields don't apply).
// Flare        for `time` s: burrowed enemies inside can be shot by every tower, and towers inside deal
//              `damageMult` × damage.
export const PROTOCOLS = {
  vine_snare: {
    name: 'Vine Snare', hotkey: 'Q', code: 'KeyQ', color: '#63c74d', glyph: '§',
    line: 'Roots enemies in a circle for 2 s. Cancels the Colossus charge.',
    cost: {}, cooldown: 28, charges: [1, 1, 1, 2, 2, 2], radius: 1.6, telegraph: 0.4,
    root: 2.0, bossRoot: 1.0, cancelCharge: true, unlock: null,
  },
  arc_discharge: {
    name: 'Arc Discharge', hotkey: 'W', code: 'KeyW', color: '#2ce8f5', glyph: 'ϟ',
    line: 'A lightning strike that hits everything in a circle.',
    cost: { circuits: 1, scrap: 10 }, cooldown: 18, charges: [1], radius: 1.4, telegraph: 0.6,
    damage: [40, 20], damageType: 'energy', unlock: 'protocol_arc',
  },
  flare: {
    name: 'Flare', hotkey: 'E', code: 'KeyE', color: '#feae34', glyph: '✹',
    line: 'Lights an area for 6 s: tunnelling enemies can be shot, towers inside hit 25% harder.',
    cost: { intel: 1 }, cooldown: 30, charges: [1], radius: 3, telegraph: 0.25,
    time: 6, damageMult: 1.25, unlock: 'protocol_flare',
  },
};
export const PROTOCOL_ORDER = ['vine_snare', 'arc_discharge', 'flare'];
// Button icons (24 × 24 sprites; the glyph is the fallback when a sprite is missing).
export const PROTOCOL_ICONS = { vine_snare: 'icon_protocol_snare', arc_discharge: 'icon_protocol_arc', flare: 'icon_protocol_flare' };

/** Value for this night from a per-night array (the last entry repeats). */
export function perNight(arr, night) {
  if (!Array.isArray(arr)) return arr;
  return arr[Math.max(0, Math.min(arr.length - 1, (night || 1) - 1))];
}
