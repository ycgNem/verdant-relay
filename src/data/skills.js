// Run skills: earned with skill points from expedition objectives, lost at the end of the run.
// `req` is a prerequisite skill; `needsUnlock` hides a skill until that permanent unlock is owned
// (e.g. Watchtower Network only matters with the Pulse Beacon blueprint). Effects are read by id wherever they apply (Run.hasSkill);
// numeric fields (scrap, scrapMult) are the tuning those effects read.

export const SKILLS = {
  // Scavenger
  pack_rat_1: { branch: 'Scavenger', name: 'Pack Rat I', desc: 'Loot magnet radius +50%.' },
  pack_rat_2: { branch: 'Scavenger', name: 'Pack Rat II', desc: 'Containers yield 10% more Scrap.', req: 'pack_rat_1' },
  safe_hands: { branch: 'Scavenger', name: 'Safe Hands', desc: 'Ignore the first hazard hit each expedition.' },
  field_medic: { branch: 'Scavenger', name: 'Field Medic', desc: 'Start each expedition carrying a med kit.' },
  quick_extraction: { branch: 'Scavenger', name: 'Quick Extraction', desc: 'Extraction and objectives are 25% faster to interact with.' },
  lush_finds: { branch: 'Scavenger', name: 'Lush Finds', desc: 'Higher chance of Biofiber in containers.' },
  // Engineer
  efficient_assembly: { branch: 'Engineer', name: 'Efficient Assembly', desc: 'Towers cost 10% less Scrap.' },
  circuit_recovery: { branch: 'Engineer', name: 'Circuit Recovery', desc: '25% chance to refund 1 Circuit when building a Circuit tower.' },
  long_sightlines: { branch: 'Engineer', name: 'Long Sightlines', desc: 'Towers gain 10% range.' },
  field_tuning: { branch: 'Engineer', name: 'Field Tuning', desc: 'The first tower upgrade each night costs 40% less Scrap.', scrapMult: 0.6 },
  overclock: { branch: 'Engineer', name: 'Overclock', desc: 'Towers attack 8% faster.', req: 'long_sightlines' },
  emergency_patch: { branch: 'Engineer', name: 'Emergency Patch', desc: 'Once per night, repair 15 Relay health for free.' },
  // Warden
  reinforced_core: { branch: 'Warden', name: 'Reinforced Core', desc: 'Relay max health +25.' },
  prepared_defenses: { branch: 'Warden', name: 'Prepared Defenses', desc: 'Gain 10 Scrap at the start of each night.', scrap: 10 },
  watchtower_network: { branch: 'Warden', name: 'Watchtower Network', desc: 'Pulse Beacon bonuses are 50% stronger.', needsUnlock: 'pulse_beacon' },
  last_stand: { branch: 'Warden', name: 'Last Stand', desc: 'Towers deal 20% more damage while the Relay is below 30% health.', req: 'reinforced_core' },
  rapid_response: { branch: 'Warden', name: 'Rapid Response', desc: 'Enemies are slowed 30% for the first 8 seconds of each wave.' },
  living_barricade: { branch: 'Warden', name: 'Living Barricade', desc: 'Snare Vines gain 20% range.' },
};
export const SKILL_KEYS = Object.keys(SKILLS);
