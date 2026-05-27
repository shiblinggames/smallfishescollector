export type RaidEffectType =
  | 'boss_damage_mult'      // value = damage multiplier on boss rounds
  | 'lethal_save'           // value = uses per raid run (raids only, not skirmishes)
  | 'speed_roll_nav_pct'    // value = fraction of Navigation added to the turn-order roll
  | 'incoming_damage_mult'  // value = multiplier on incoming enemy damage (e.g. 0.85 = -15%)
  | 'crit_damage_mult'      // value = multiplier on crit shots only (e.g. 1.15 = +15%)
  | 'noncrit_damage_mult'   // value = multiplier on hit + graze shots (e.g. 0.85 = -15%)
  | 'max_hp_mult'           // value = multiplier on player's max HP at raid start (e.g. 1.15 = +15%)

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
    description: 'Adds a quarter of your Navigation to your turn-order roll, so you strike first far more often.',
    image: '/navigatorscompass.png',
    emoji: '🧭',
    rarity: 'epic',
    effects: [{ type: 'speed_roll_nav_pct', value: 0.25 }],
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
]

export function getRaidItem(id: string): RaidItemDef | undefined {
  return RAID_ITEMS.find(i => i.id === id)
}

export function getActiveEffects(equippedItemIds: string[]): RaidEffect[] {
  return equippedItemIds.flatMap(id => getRaidItem(id)?.effects ?? [])
}
