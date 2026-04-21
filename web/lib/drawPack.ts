import type { CardVariant, DrawnCard, BorderStyle, ArtEffect } from './types'

function weightedPick(variants: CardVariant[]): CardVariant {
  const total = variants.reduce((sum, v) => sum + v.drop_weight, 0)
  let r = Math.random() * total
  for (const v of variants) {
    r -= v.drop_weight
    if (r <= 0) return v
  }
  return variants[variants.length - 1]
}

export function drawPack(variants: CardVariant[]): DrawnCard[] {
  const drawn: DrawnCard[] = []
  for (let i = 0; i < 5; i++) {
    drawn.push(toDrawn(weightedPick(variants)))
  }

  // Guarantee at least 1 card with drop_weight ≤ 12 (Gold or rarer)
  if (drawn.every((d) => d.dropWeight > 12)) {
    const rarePool = variants.filter((v) => v.drop_weight <= 12)
    if (rarePool.length > 0) {
      drawn[3] = toDrawn(weightedPick(rarePool))
    }
  }

  return drawn
}

function toDrawn(v: CardVariant): DrawnCard {
  const card = v.cards!
  return {
    variantId:   v.id,
    cardId:      card.id,
    name:        card.name,
    slug:        card.slug,
    filename:    card.filename,
    tier:        card.tier as 1 | 2 | 3,
    variantName: v.variant_name,
    borderStyle: v.border_style as BorderStyle,
    artEffect:   v.art_effect as ArtEffect,
    dropWeight:  v.drop_weight,
  }
}
