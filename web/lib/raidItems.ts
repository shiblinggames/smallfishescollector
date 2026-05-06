export type RaidEffectType = 'boss_damage_mult'

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
    image: null,
    emoji: '💣',
    rarity: 'rare',
    effects: [{ type: 'boss_damage_mult', value: 1.25 }],
    source: "Barnacle Pete's Raid",
  },
]

export function getRaidItem(id: string): RaidItemDef | undefined {
  return RAID_ITEMS.find(i => i.id === id)
}

export function getActiveEffects(equippedItemIds: string[]): RaidEffect[] {
  return equippedItemIds.flatMap(id => getRaidItem(id)?.effects ?? [])
}
