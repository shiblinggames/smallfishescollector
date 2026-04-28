import type { CardVariant, DrawnCard, BorderStyle, ArtEffect } from './types'

const GROUP1 = new Set(['bass','eel','flounder','goldfish','krill','minnow','piranha','pufferfish','red_snapper','salmon','sardine','tuna','angelfish','clownfish','koi'])
const GROUP2 = new Set(['anglerfish','beluga_whale','blobfish','blue_marlin','lionfish','nurse_shark','oarfish','sailfish','swordfish','hammerhead_shark','manta_ray','whale_shark'])
const GROUP3 = new Set(['goblin_shark','tiger_shark','blue_whale','giant_squid','great_white_shark','humpback_whale','orca'])
const GROUP4 = new Set(['catfish','doby_mick'])

const GROUPS: Set<string>[] = [GROUP1, GROUP2, GROUP3, GROUP4]
const MYTHIC_NAMED = ['Kraken', 'Davy Jones', 'Golden Age', 'Wanted', 'Maelstrom']

function rand() { return Math.random() }

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

function poolFor(variants: CardVariant[], group: Set<string>, variantName: string): CardVariant[] {
  return variants.filter(v => group.has(v.cards!.slug.toLowerCase()) && v.variant_name === variantName)
}

function pickGroup(weights: [number, number, number, number]): 0 | 1 | 2 | 3 {
  const r = rand() * 100
  let cumulative = 0
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i]
    if (r < cumulative) return i as 0 | 1 | 2 | 3
  }
  return 3
}

function pickMythicVariant(): string {
  return rand() < 0.9 ? pickRandom(MYTHIC_NAMED) : 'GOD'
}

function pickLegendaryVariant(): string {
  return pickRandom(['Ghost', 'Shadow', 'Prismatic'])
}

function pickEpicVariant(): string {
  return rand() < 0.5 ? 'Pearl' : 'Holographic'
}

function pickCard4Variant(groupIdx: number, forceLegendary = false): string {
  // Group 4 (Catfish, Doby Mick): Legendary 90%, Mythic 10%
  if (groupIdx === 3) {
    return rand() < 0.9 ? pickLegendaryVariant() : pickMythicVariant()
  }
  // Tide pity: skip Rare and Epic, roll only Legendary/Mythic
  if (forceLegendary) {
    return rand() < (2.5 / 3.0) ? pickLegendaryVariant() : pickMythicVariant()
  }
  const r = rand()
  if (r < 0.70)  return 'Gold'
  if (r < 0.97)  return pickEpicVariant()
  if (r < 0.995) return pickLegendaryVariant()
  return pickMythicVariant()
}

function drawCard123(variants: CardVariant[]): DrawnCard {
  const groupIdx = rand() < 0.7 ? 0 : 1
  const pool = poolFor(variants, GROUPS[groupIdx], 'Standard')
  return toDrawn(pickRandom(pool))
}

function drawCard4(variants: CardVariant[], forceLegendary = false): DrawnCard {
  const groupIdx = pickGroup([40, 35, 23, 2])
  const variantName = pickCard4Variant(groupIdx, forceLegendary)
  const pool = poolFor(variants, GROUPS[groupIdx], variantName)
  return toDrawn(pickRandom(pool))
}

export function drawPack(variants: CardVariant[], forceLegendary = false): DrawnCard[] {
  return [
    drawCard123(variants),
    drawCard123(variants),
    drawCard123(variants),
    drawCard4(variants, forceLegendary),
  ]
}

export function drawGodPack(variants: CardVariant[]): DrawnCard[] {
  return [drawCard4(variants), drawCard4(variants), drawCard4(variants), drawCard4(variants)]
}

function toDrawn(v: CardVariant): DrawnCard {
  const card = v.cards!
  return {
    variantId:   v.id,
    cardId:      card.id,
    name:        card.name,
    slug:        card.slug,
    filename:    card.filename,
    variantName: v.variant_name,
    borderStyle: v.border_style as BorderStyle,
    artEffect:   v.art_effect as ArtEffect,
    dropWeight:  v.drop_weight,
    strength:    (card as any).strength ?? 0,
    agility:     (card as any).agility  ?? 0,
    wit:         (card as any).wit      ?? 0,
    luck:        (card as any).luck     ?? 0,
  }
}
