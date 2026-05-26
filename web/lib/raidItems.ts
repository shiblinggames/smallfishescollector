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
  {
    id: 'corsair_cannon',
    name: 'Corsair Cannon',
    description: '+25% damage to raid bosses.',
    image: '/corsaircannon.png',
    emoji: '💣',
    rarity: 'rare',
    effects: [{ type: 'boss_damage_mult', value: 1.25 }],
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
  {
    id: 'krusts_carapace',
    name: "Krust's Carapace",
    description: 'Cuts all incoming enemy fire by 15%. The same plated hide Krust hid behind for years.',
    image: '/captainshull.png',
    emoji: '🛡️',
    rarity: 'epic',
    effects: [{ type: 'incoming_damage_mult', value: 0.85 }],
    source: "Krust's Consignment",
  },
  {
    id: 'gunners_sight',
    name: "Gunner's Sight",
    description: '+15% crit damage, but normal shots hit for 15% less. A trade for the steady-handed.',
    image: null,
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
    image: null,
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
