export function rarityFromWeight(dropWeight: number): string {
  if (dropWeight >= 50) return 'Common'
  if (dropWeight >= 25) return 'Uncommon'
  if (dropWeight >= 12) return 'Rare'
  if (dropWeight >= 4)  return 'Epic'
  if (dropWeight >= 0.3) return 'Legendary'
  return 'Mythic'
}

export const VARIANT_RARITY: Record<string, string> = {
  'Standard':    'Common',
  'Silver':      'Uncommon',
  'Gold':        'Rare',
  'Pearl':       'Epic',
  'Holographic': 'Epic',
  'Ghost':       'Legendary',
  'Shadow':      'Legendary',
  'Prismatic':   'Legendary',
  'Kraken':      'Mythic',
  'Davy Jones':  'Mythic',
  'Golden Age':  'Mythic',
  'Wanted':      'Mythic',
  'Maelstrom':       'Mythic',
}

export function rarityFromVariant(variantName: string, dropWeight: number): string {
  return VARIANT_RARITY[variantName] ?? rarityFromWeight(dropWeight)
}

export const RARITY_COLOR: Record<string, string> = {
  Common:    '#8a8880',
  Uncommon:  '#4ade80',
  Rare:      '#60a5fa',
  Epic:      '#a78bfa',
  Legendary: '#f0c040',
  Mythic:    '#ff3838',
}

export const IS_LEGENDARY_RARITY = (rarity: string) => rarity === 'Legendary'
export const IS_MYTHIC_RARITY    = (rarity: string) => rarity === 'Mythic'

export const DOUBLOON_VALUE: Record<string, number> = {
  Common:    2,
  Uncommon:  5,
  Rare:      10,
  Epic:      25,
  Legendary: 75,
  Mythic:    250,
}

export function doubloonValueFor(variantName: string, dropWeight: number): number {
  const rarity = rarityFromVariant(variantName, dropWeight)
  return DOUBLOON_VALUE[rarity] ?? 5
}
