export type BorderStyle = 'standard' | 'silver' | 'gold' | 'pearl' | 'prismatic' | 'void' | 'kraken' | 'davy-jones' | 'golden-age' | 'storm' | 'wanted' | 'god'
export type ArtEffect  = 'normal' | 'holographic' | 'rainbow' | 'ghost' | 'shadow' | 'pearl' | 'kraken' | 'davy-jones' | 'golden-age' | 'storm' | 'wanted' | 'divine'

export type Zone = 'shallows' | 'open_waters' | 'deep' | 'abyss'

export interface CardStats {
  power: number
  dodge: number
  fortune: number
}

export interface Card {
  id: number
  name: string
  slug: string
  filename: string
  zone: Zone
  power: number
  dodge: number
  fortune: number
  mythic_power: number
  mythic_dodge: number
  mythic_fortune: number
}

export interface CardVariant {
  id: number
  card_id: number
  variant_name: string
  border_style: BorderStyle
  art_effect: ArtEffect
  drop_weight: number
  cards?: Card
}

export interface UserCollectionRow {
  id: number
  card_variant_id: number
  obtained_at: string
  card_variants: CardVariant & { cards: Card }
}

export interface DrawnCard {
  variantId: number
  cardId: number
  name: string
  slug: string
  filename: string
  variantName: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  dropWeight: number
  power: number
  dodge: number
  fortune: number
  mythic_power: number
  mythic_dodge: number
  mythic_fortune: number
}
