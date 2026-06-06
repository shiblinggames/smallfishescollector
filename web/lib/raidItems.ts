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
    description: 'Adds a fifth of your Navigation to your turn-order roll, so you strike first more often.',
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
]

export function getRaidItem(id: string): RaidItemDef | undefined {
  return RAID_ITEMS.find(i => i.id === id)
}

export function getActiveEffects(equippedItemIds: string[]): RaidEffect[] {
  return equippedItemIds.flatMap(id => getRaidItem(id)?.effects ?? [])
}
