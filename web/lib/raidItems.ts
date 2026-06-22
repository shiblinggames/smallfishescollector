export type RaidEffectType =
  | 'boss_damage_mult'      // value = damage multiplier on boss rounds
  | 'lethal_save'           // value = uses per raid run (raids only, not skirmishes)
  | 'speed_roll_nav_pct'    // value = fraction of Navigation added to the turn-order roll
  | 'incoming_damage_mult'  // value = multiplier on incoming enemy damage (e.g. 0.85 = -15%)
  | 'crit_damage_mult'      // value = multiplier on crit shots only (e.g. 1.15 = +15%)
  | 'noncrit_damage_mult'   // value = multiplier on hit + graze shots (e.g. 0.85 = -15%)
  | 'max_hp_mult'           // value = multiplier on player's max HP at raid start (e.g. 1.15 = +15%)
  | 'parry_chance'          // value = 0-1 chance, on a SUCCESSFUL dodge, to reflect a slice of the dodged shot
  | 'parry_reflect_pct'     // value = 0-1 fraction of the dodged shot's damage roll reflected back when parry triggers
  | 'burn_chance'           // value = 0-1 chance, each player hit, to set the enemy ablaze (DoT, see RaidCombat BURN_*)
  | 'freeze_chance'         // value = 0-1 chance, each player hit, to freeze the enemy (it loses a turn)
  | 'start_charge_chance'   // value = 0-1 chance to open each raid fight with 1 cannonball already loaded (the player-side "First Cut")
  | 'nonboss_damage_mult'   // value = damage multiplier vs NON-boss enemies (mobs / elites). Mirror of boss_damage_mult.
  | 'ramp_damage_per_turn'  // value = extra damage fraction PER TURN elapsed this fight (resets each enemy). turn 1 = +0, turn 2 = +value, …

export interface RaidEffect {
  type: RaidEffectType
  value: number
}

export interface RaidItemDef {
  id: string
  name: string
  description: string
  image: string | null
  emoji: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  effects: RaidEffect[]
  source: string
}

export const RAID_ITEMS: RaidItemDef[] = [
  // Two tiers of the same chase item. The normal raid drops the
  // weaker version (more common), the challenge raid drops both at
  // higher rates with the legendary Prime variant as the chase.
  {
    id: 'corsair_cannon',
    name: 'Corsair Cannon',
    description: '+10% damage to raid bosses.',
    image: '/corsaircannon-v2.png',
    emoji: '💣',
    rarity: 'epic',
    effects: [{ type: 'boss_damage_mult', value: 1.10 }],
    source: "Barnacle Pete's Raid",
  },
  {
    id: 'corsair_prime_cannon',
    name: "Corsair's Prime Cannon",
    description: '+20% damage to raid bosses. The captain-grade version of the Corsair Cannon.',
    image: '/corsairsprimecannon.png',
    emoji: '💣',
    rarity: 'legendary',
    effects: [{ type: 'boss_damage_mult', value: 1.20 }],
    source: "Barnacle Pete's Raid",
  },
  {
    id: 'quartermasters_anchor',
    name: "Quartermaster's Anchor",
    description: 'Once per raid, a killing blow leaves you at 1 HP instead of sinking. Raids only, never skirmishes.',
    image: '/quartermastersanchor.png',
    emoji: '⚓',
    rarity: 'epic',
    effects: [{ type: 'lethal_save', value: 1 }],
    source: "Quartermaster's Cache",
  },
  {
    id: 'navigators_compass',
    name: "Navigator's Compass",
    // Reads as "a fifth" now after the 0.25 → 0.20 nerf (2026-05-29).
    // Combined with the d20 → d30 speed roll, the build still earns
    // first strike a clear majority of the time but late-game
    // determinism is meaningfully flatter than before.
    description: 'Adds a fifth of your Savvy to your turn-order roll, so you strike first more often.',
    image: '/navigatorscompass.png',
    emoji: '🧭',
    rarity: 'epic',
    effects: [{ type: 'speed_roll_nav_pct', value: 0.20 }],
    source: "Quartermaster's Cache",
  },
  // Same two-tier treatment as the Corsair Cannon. Krust's Carapace
  // is the standard plate; Captain's Carapace is the full-grade
  // version of his own armour, dropped only at the higher rate from
  // his Consignment (with Prime rates in challenge mode).
  {
    id: 'krusts_carapace',
    name: "Krust's Carapace",
    description: 'Cuts incoming enemy fire by 10%.',
    image: '/captainshull.png',
    emoji: '🛡️',
    rarity: 'epic',
    effects: [{ type: 'incoming_damage_mult', value: 0.90 }],
    source: "Krust's Consignment",
  },
  {
    id: 'captains_carapace',
    name: "Captain's Carapace",
    description: "Cuts incoming enemy fire by 15%. The plated hide Krust himself hid behind for years.",
    image: '/captainscarapace.png',
    emoji: '🛡️',
    rarity: 'legendary',
    effects: [{ type: 'incoming_damage_mult', value: 0.85 }],
    source: "Krust's Consignment",
  },
  {
    id: 'gunners_sight',
    name: "Gunner's Sight",
    description: '+15% crit damage, but normal shots hit for 15% less. A trade for the steady-handed.',
    image: '/gunnerssight.png',
    emoji: '🎯',
    rarity: 'epic',
    effects: [
      { type: 'crit_damage_mult',    value: 1.15 },
      { type: 'noncrit_damage_mult', value: 0.85 },
    ],
    source: 'Driftwood Cache',
  },
  {
    id: 'reinforced_hull',
    name: 'Reinforced Hull',
    description: '+15% max HP at the start of every raid. Heavier strakes, slower to sink.',
    image: '/reinforcedhull.png',
    emoji: '🛠️',
    rarity: 'epic',
    effects: [{ type: 'max_hp_mult', value: 1.15 }],
    source: 'Driftwood Cache',
  },
  // The Cartographer's signature drop — same two-tier shape as the
  // Corsair Cannon + Krust's Carapace pairs. Cartographer's Astrolabe
  // is the standard, dropped from his normal raid. Mastercraft Astrolabe
  // is the master-grade version at higher numbers, dropped only at
  // the chase rate (and bumped by the challenge variant). Both grant
  // a player-side mirror of the boss's Riposte: on a successful dodge,
  // a chance to reflect a slice of the would-be hit back at him.
  // The Sunken Cache pair (Gullet, Chapter II). Two themed cannonballs, each a
  // 15% on-hit status proc. Burn = damage-over-time scaled to the hit; Freeze =
  // skip the enemy's turn. Effects resolved in RaidCombat (BURN_* consts +
  // burn_chance/freeze_chance handling).
  {
    id: 'incendiary_cannonball',
    name: 'Incendiary Cannonball',
    description: 'Each hit has a 15% chance to set the enemy ablaze, burning them for 2 turns (damage scaled to the hit that lit them).',
    image: '/incendiarycannonball.png',
    emoji: '🔥',
    rarity: 'epic',
    effects: [{ type: 'burn_chance', value: 0.15 }],
    source: 'The Sunken Cache',
  },
  {
    id: 'frozen_cannonball',
    name: 'Frozen Cannonball',
    description: 'Each hit has a 15% chance to freeze the enemy solid, making them lose their next turn.',
    image: '/frozencannonball.png',
    emoji: '❄️',
    rarity: 'epic',
    effects: [{ type: 'freeze_chance', value: 0.15 }],
    source: 'The Sunken Cache',
  },
  // Tollmaster Spet's signature drop (The Tollmaster's Cut, Chapter II). The
  // player-side mirror of his crew's "First Cut" trait: start every raid fight
  // with cannonballs already chambered, so YOU take the first shot. Two-tier
  // like the other boss drops (epic standard + legendary "prime" from challenge).
  {
    id: 'spets_primer',
    name: "Spet's Primer",
    description: '50% chance to start each raid fight with a cannonball already loaded, so you can fire on the opening bell.',
    image: '/spetsprimer.png',
    emoji: '🧨',
    rarity: 'epic',
    effects: [{ type: 'start_charge_chance', value: 0.5 }],
    source: "The Tollmaster's Cut",
  },
  {
    id: 'tollmasters_primer',
    name: "Tollmaster's Primer",
    description: 'Always start each raid fight with a cannonball already loaded. The Tollmaster never waits to take his cut.',
    image: '/tollmastersprimer.png',
    emoji: '🧨',
    rarity: 'legendary',
    effects: [{ type: 'start_charge_chance', value: 1.0 }],
    source: "The Tollmaster's Cut",
  },
  {
    id: 'cartographers_astrolabe',
    name: "Cartographer's Astrolabe",
    description: 'On a successful dodge, 30% chance to deflect half the incoming shot back at the attacker.',
    image: '/cartographersastrolabe.png',
    emoji: '🧭',
    rarity: 'epic',
    effects: [
      { type: 'parry_chance',      value: 0.30 },
      { type: 'parry_reflect_pct', value: 0.50 },
    ],
    source: "The Cartographer's Survey",
  },
  {
    id: 'captains_astrolabe',
    name: 'Mastercraft Astrolabe',
    description: "On a successful dodge, 50% chance to deflect 75% of the incoming shot back at the attacker. The Cartographer's own brass instrument, machined to a finer tolerance than any other in his cabin.",
    image: '/mastercraftastrolabe.png',
    emoji: '🧭',
    rarity: 'legendary',
    effects: [
      { type: 'parry_chance',      value: 0.50 },
      { type: 'parry_reflect_pct', value: 0.75 },
    ],
    source: "The Cartographer's Survey",
  },
  // ── Davy Jones Gauntlet chest cannons ──────────────────────────────────────
  // Two rare chest-only drops + the forged combination. Odds climb up the
  // chest ladder (see lib/gauntlet chestCannonDropChance). Collect BOTH and the
  // forge (in the Manage Ship loadout drawer) sacrifices them for the Grand
  // Cannon — recipe in DAVY_FORGE below. Art is a cannon placeholder for now.
  {
    id: 'davys_heavy_cannon',
    name: "Davy's Heavy Cannon",
    description: 'Your damage climbs +5% every turn of a fight (resets when the next enemy draws alongside). Long fights end ugly for them.',
    image: '/davysheavycannon.png',
    emoji: '💣',
    rarity: 'legendary',
    effects: [{ type: 'ramp_damage_per_turn', value: 0.05 }],
    source: 'The Davy Jones Gauntlet',
  },
  {
    id: 'davys_hand_cannon',
    name: "Davy's Hand Cannon",
    description: '+20% damage to non-boss enemies. Tears through a crew before the captain ever shows his colours.',
    image: '/davyshandcannon.png',
    emoji: '💥',
    rarity: 'legendary',
    effects: [{ type: 'nonboss_damage_mult', value: 1.20 }],
    source: 'The Davy Jones Gauntlet',
  },
  {
    id: 'davys_grand_cannon',
    name: "Davy's Grand Cannon",
    description: 'Both Davy cannons forged into one: damage climbs +5% each turn of a fight AND +20% damage to non-boss enemies.',
    image: '/davysgrandcannon.png',
    emoji: '☠️',
    rarity: 'legendary',
    effects: [
      { type: 'ramp_damage_per_turn', value: 0.05 },
      { type: 'nonboss_damage_mult',  value: 1.20 },
    ],
    source: "Forged from Davy's Heavy + Hand Cannon",
  },
]

// ── Forge recipes ─────────────────────────────────────────────────────────────
// Own EVERY component → can forge the result, which sacrifices the components.
// Generic so any future item can be made forgeable: just add a recipe here (and
// the result + component items above). The Manage Ship forge UI maps over this
// list and the forgeRaidItem server action validates against it.
export interface ForgeRecipe {
  /** Item ids consumed by the forge (all required). */
  components: string[]
  /** Item id produced. */
  result: string
}

export const FORGE_RECIPES: ForgeRecipe[] = [
  { components: ['davys_heavy_cannon', 'davys_hand_cannon'], result: 'davys_grand_cannon' },
]

export function getForgeRecipe(resultId: string): ForgeRecipe | undefined {
  return FORGE_RECIPES.find(r => r.result === resultId)
}

/** The Davy recipe — its components double as the Gauntlet chest drop pool. */
export const DAVY_FORGE = FORGE_RECIPES[0]

export function getRaidItem(id: string): RaidItemDef | undefined {
  return RAID_ITEMS.find(i => i.id === id)
}

export function getActiveEffects(equippedItemIds: string[]): RaidEffect[] {
  return equippedItemIds.flatMap(id => getRaidItem(id)?.effects ?? [])
}
