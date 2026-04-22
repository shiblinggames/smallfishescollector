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

const GOD_PACK_ELIGIBLE = new Set([
  'Holographic', 'Ghost', 'Shadow', 'Prismatic',
  'Kraken', 'Davy Jones', 'Golden Age', 'Wanted', 'Storm',
])

// Custom weights per variant for god pack draws (independent of regular drop_weight)
const GOD_PACK_WEIGHTS: Record<string, number> = {
  'Holographic':    26,
  'Ghost':          23,
  'Shadow':         21,
  'Prismatic':      15,
  'Kraken':  3,
  'Davy Jones':      3,
  'Golden Age':      3,
  'Wanted':          3,
  'Storm':           3,
}

export function drawGodPack(variants: CardVariant[]): DrawnCard[] {
  const godPool = variants
    .filter((v) => GOD_PACK_ELIGIBLE.has(v.variant_name))
    .map((v) => ({ ...v, drop_weight: GOD_PACK_WEIGHTS[v.variant_name] ?? v.drop_weight }))
  const drawn: DrawnCard[] = []
  for (let i = 0; i < 5; i++) {
    // Restore original drop_weight so displayed % chance reflects the real odds
    const picked = weightedPick(godPool)
    const original = variants.find((v) => v.id === picked.id)!
    drawn.push(toDrawn(original))
  }
  return drawn
}

export function drawPack(variants: CardVariant[], forceLegendary = false): DrawnCard[] {
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

  // Tide: guarantee a Legendary or better (drop_weight < 1) after 20 packs
  if (forceLegendary && drawn.every((d) => d.dropWeight >= 1)) {
    const legendaryPool = variants.filter((v) => v.drop_weight < 1)
    if (legendaryPool.length > 0) {
      drawn[3] = toDrawn(weightedPick(legendaryPool))
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
