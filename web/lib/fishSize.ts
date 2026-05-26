// Per-catch size variance for the fishing minigame. Every catch rolls a
// length within the species's [length_min_in, length_max_in] range and is
// classified into one of five tiers. Size is a chase/collection layer:
// nothing here touches XP, doubloons, sell value, or the market. The
// reward lives entirely in the result-card chrome + the PB tracker.
//
// Tier distribution (target):
//   trophy   3%  — percentile 0.97 – 1.00
//   large   15%  — percentile 0.82 – 0.97
//   average 47%  — percentile 0.50 – 0.82
//   small   25%  — percentile 0.20 – 0.50
//   tiny    10%  — percentile 0.00 – 0.20

export type FishSizeTier = 'tiny' | 'small' | 'average' | 'large' | 'trophy'

export interface FishSizeRoll {
  /** Rolled length in inches, rounded to one decimal (server stores exact). */
  lengthIn: number
  /** Which band the roll landed in. */
  tier: FishSizeTier
  /** 0–1 position within the species range. Used by the UI range bar. */
  percentile: number
}

/** Pick a tier by raw probability, then sample a percentile uniformly within
 *  that tier's band. Mapping percentile → length is a straight linear
 *  interpolation between min and max so a `medium`-category snapper rolling
 *  trophy lands near 32 in and a `massive` Megalodon rolling trophy lands
 *  near 720 in — both feel like top-of-species without any per-species
 *  math beyond the range itself. */
export function rollFishSize(minIn: number, maxIn: number): FishSizeRoll {
  // Guard: invalid range falls back to a single inch so we never NaN out.
  if (!(maxIn > minIn)) {
    return { lengthIn: Math.max(1, minIn || 1), tier: 'average', percentile: 0.5 }
  }

  const r = Math.random()
  let tier: FishSizeTier
  let pLo: number
  let pHi: number
  if (r < 0.10)      { tier = 'tiny';    pLo = 0.00; pHi = 0.20 }
  else if (r < 0.35) { tier = 'small';   pLo = 0.20; pHi = 0.50 }
  else if (r < 0.82) { tier = 'average'; pLo = 0.50; pHi = 0.82 }
  else if (r < 0.97) { tier = 'large';   pLo = 0.82; pHi = 0.97 }
  else               { tier = 'trophy';  pLo = 0.97; pHi = 1.00 }

  const percentile = pLo + Math.random() * (pHi - pLo)
  const raw = minIn + percentile * (maxIn - minIn)
  const lengthIn = Math.round(raw * 10) / 10
  return { lengthIn, tier, percentile }
}

/** Format an inch measurement the way an angler would say it.
 *  Under 36 in: one decimal of inches ("9.4 in") so small-fish variance
 *  reads meaningfully. 36 in and up: integer feet + integer inches
 *  ("4' 10 in"), because nobody says "five foot three point four inch
 *  tarpon." Single source of truth for every readout (result card,
 *  Trophy Hall, leaderboards, PB banner). */
export function formatFishLength(inches: number): string {
  if (!isFinite(inches) || inches <= 0) return '—'
  if (inches < 36) return `${inches.toFixed(1)} in`
  const rounded = Math.round(inches)
  const ft = Math.floor(rounded / 12)
  const remIn = rounded - ft * 12
  return `${ft}' ${remIn} in`
}

/** Display label for a tier (Title Case). */
export const TIER_LABEL: Record<FishSizeTier, string> = {
  tiny:    'Tiny',
  small:   'Small',
  average: 'Average',
  large:   'Large',
  trophy:  'Trophy',
}

/** Accent color per tier — matches the result-card chrome. Average and
 *  below are neutral (the size readout still shows, just no pill). Large
 *  picks up a cool blue; Trophy gets the gold treatment the rest of the
 *  banner system already uses for big moments. */
export const TIER_COLOR: Record<FishSizeTier, string> = {
  tiny:    '#7a7060',
  small:   '#9a8870',
  average: '#bfa980',
  large:   '#60a5fa',
  trophy:  '#fbbf24',
}

/** Only Large + Trophy fire a pill on the result card. Tiny / Small /
 *  Average just show the inches + range bar so 99% of catches still feel
 *  measured but unrewarded — keeps Trophy meaningful. */
export function tierShowsPill(tier: FishSizeTier): boolean {
  return tier === 'large' || tier === 'trophy'
}
