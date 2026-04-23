interface RarityTier {
  name: string
  color: string
  doubloons: number
  weightMin: number
  variants: readonly string[]
}

// Single source of truth for all rarity tiers.
// To add a new rarity: add one entry here. Everything else derives from it.
export const RARITY_TIERS: RarityTier[] = [
  { name: 'Common',    color: '#8a8880', doubloons: 2,   weightMin: 50,  variants: ['Standard'] },
  { name: 'Uncommon',  color: '#4ade80', doubloons: 5,   weightMin: 25,  variants: ['Silver'] },
  { name: 'Rare',      color: '#60a5fa', doubloons: 10,  weightMin: 12,  variants: ['Gold'] },
  { name: 'Epic',      color: '#a78bfa', doubloons: 25,  weightMin: 4,   variants: ['Pearl', 'Holographic'] },
  { name: 'Legendary', color: '#f0c040', doubloons: 75,  weightMin: 0.3, variants: ['Ghost', 'Shadow', 'Prismatic'] },
  { name: 'Mythic',    color: '#ff3838', doubloons: 250, weightMin: 0,   variants: ['Kraken', 'Davy Jones', 'Golden Age', 'Wanted', 'Maelstrom'] },
]

export const VARIANT_RARITY: Record<string, string> = Object.fromEntries(
  RARITY_TIERS.flatMap(t => t.variants.map(v => [v, t.name]))
)

export const RARITY_COLOR: Record<string, string> = Object.fromEntries(
  RARITY_TIERS.map(t => [t.name, t.color])
)

export const DOUBLOON_VALUE: Record<string, number> = Object.fromEntries(
  RARITY_TIERS.map(t => [t.name, t.doubloons])
)

export function rarityFromWeight(dropWeight: number): string {
  return RARITY_TIERS.find(t => dropWeight >= t.weightMin)?.name ?? 'Mythic'
}

export function rarityFromVariant(variantName: string, dropWeight: number): string {
  return VARIANT_RARITY[variantName] ?? rarityFromWeight(dropWeight)
}

export const IS_LEGENDARY_RARITY = (rarity: string) => rarity === 'Legendary'
export const IS_MYTHIC_RARITY    = (rarity: string) => rarity === 'Mythic'

export function doubloonValueFor(variantName: string, dropWeight: number): number {
  const rarity = rarityFromVariant(variantName, dropWeight)
  return DOUBLOON_VALUE[rarity] ?? 5
}
