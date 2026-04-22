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
  'Storm':       'Mythic',
}

export function rarityFromVariant(variantName: string, dropWeight: number): string {
  return VARIANT_RARITY[variantName] ?? rarityFromWeight(dropWeight)
}

export const RARITY_COLOR: Record<string, string> = {
  Common:    '#8a8880',
  Uncommon:  '#9ca3af',
  Rare:      '#f0c040',
  Epic:      '#a78bfa',
  Legendary: '#f0c040', // uses gradient separately
  Mythic:    '#00cc99', // overridden per-edition in components
}

export const IS_LEGENDARY_RARITY = (rarity: string) => rarity === 'Legendary'
export const IS_MYTHIC_RARITY    = (rarity: string) => rarity === 'Mythic'
