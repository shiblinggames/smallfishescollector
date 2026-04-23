import type { CardVariant, DrawnCard, BorderStyle, ArtEffect, Zone } from './types'
import { RARITY_TIERS, VARIANT_RARITY } from './variants'
import { getHook } from './hooks'
import type { HookDef } from './hooks'

// God pack eligible = Epic and above. Derives automatically from RARITY_TIERS.
const GOD_PACK_RARITY_NAMES = new Set(['Epic', 'Legendary', 'Mythic'])
const GOD_PACK_ELIGIBLE = new Set(
  RARITY_TIERS
    .filter(t => GOD_PACK_RARITY_NAMES.has(t.name))
    .flatMap(t => [...t.variants])
)

const GOD_PACK_WEIGHTS: Record<string, number> = {
  'Pearl':       20,
  'Holographic': 20,
  'Ghost':       18,
  'Shadow':      16,
  'Prismatic':   12,
  'Kraken':       3,
  'Davy Jones':   3,
  'Golden Age':   3,
  'Wanted':       3,
  'Maelstrom':    3,
}

function weightedPick(variants: CardVariant[]): CardVariant {
  const total = variants.reduce((sum, v) => sum + v.drop_weight, 0)
  let r = Math.random() * total
  for (const v of variants) {
    r -= v.drop_weight
    if (r <= 0) return v
  }
  return variants[variants.length - 1]
}

function pickZone(w: HookDef['weights']): Zone {
  const r = Math.random()
  if (r < w.abyss) return 'abyss'
  if (r < w.abyss + w.deep) return 'deep'
  if (r < w.abyss + w.deep + w.openWaters) return 'open_waters'
  return 'shallows'
}

function zonePool(variants: CardVariant[], zone: Zone): CardVariant[] {
  return variants.filter(v => v.cards!.zone === zone)
}

export function drawGodPack(variants: CardVariant[]): DrawnCard[] {
  const godPool = variants
    .filter(v => GOD_PACK_ELIGIBLE.has(v.variant_name))
    .map(v => ({ ...v, drop_weight: GOD_PACK_WEIGHTS[v.variant_name] ?? v.drop_weight }))
  const drawn: DrawnCard[] = []
  for (let i = 0; i < 5; i++) {
    const picked = weightedPick(godPool)
    const original = variants.find(v => v.id === picked.id)!
    drawn.push(toDrawn(original))
  }
  return drawn
}

export function drawPack(variants: CardVariant[], forceLegendary = false, hookTier = 0): DrawnCard[] {
  const hook = getHook(hookTier)
  const drawn: DrawnCard[] = []

  for (let i = 0; i < 5; i++) {
    const zone = pickZone(hook.weights)
    const pool = zonePool(variants, zone)
    drawn.push(toDrawn(weightedPick(pool.length > 0 ? pool : variants)))
  }

  // Guarantee at least 1 card with drop_weight ≤ 12 (Gold or rarer)
  if (drawn.every(d => d.dropWeight > 12)) {
    const rarePool = variants.filter(v => v.drop_weight <= 12)
    if (rarePool.length > 0) drawn[3] = toDrawn(weightedPick(rarePool))
  }

  // Tide: guarantee a Legendary or better after 20 packs
  if (forceLegendary && drawn.every(d => !['Legendary', 'Mythic'].includes(VARIANT_RARITY[d.variantName] ?? ''))) {
    const legendaryPool = variants.filter(v => ['Legendary', 'Mythic'].includes(VARIANT_RARITY[v.variant_name] ?? ''))
    if (legendaryPool.length > 0) drawn[3] = toDrawn(weightedPick(legendaryPool))
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
