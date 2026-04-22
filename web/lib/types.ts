export type BorderStyle = 'standard' | 'silver' | 'gold' | 'pearl' | 'prismatic' | 'void' | 'kraken' | 'davy-jones' | 'golden-age' | 'storm' | 'wanted'
export type ArtEffect  = 'normal' | 'holographic' | 'rainbow' | 'ghost' | 'shadow' | 'kraken' | 'davy-jones' | 'golden-age' | 'storm' | 'wanted'

export interface Card {
  id: number
  name: string
  slug: string
  filename: string
  tier: 1 | 2 | 3
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
  tier: 1 | 2 | 3
  variantName: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  dropWeight: number
}
