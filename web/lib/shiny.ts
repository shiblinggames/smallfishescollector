// Shiny fish system — Pokémon-style ultra-rare variants.
//
// Drop is gated on TWO conditions:
//   1. The catch was a Perfect (gold-zone landing — ties shiny hunting
//      to the existing skill loop instead of a pure casting grind).
//   2. A 1/SHINY_ODDS roll lands.
//
// Skipped on Ancient Deep catches — those have their own ceremonial
// treatment and shouldn't dilute. Skipped on Finn catches too (different
// flow). Sell value is exactly 10× the species' normal sell_value.
//
// Persistence lives in `shiny_catches` (one row per shiny, never
// merged) so each shiny carries its own size + caught_at metadata for
// the future trophy display.

/** Odds denominator. A perfect catch rolls 1-in-N for shiny.
 *  Tuned generous vs traditional Pokémon (1/8192) because perfect-only
 *  gating already makes the effective rate much sparser. */
export const SHINY_ODDS = 1000

/** Sell value multiplier on shiny variants. */
export const SHINY_SELL_MULT = 10

/** The gold-shimmer CSS filter applied to a shiny fish image anywhere
 *  it renders (result card, hold list, Logbook grid, modal). Uses
 *  hue-rotate + saturate + brightness to push any sprite toward warm
 *  gold, plus two drop-shadows for the rim-light glow. Combine with
 *  the `shiny-fish-shimmer` keyframe in globals.css for the sweeping
 *  highlight, if added separately. */
export const SHINY_FISH_FILTER =
  'hue-rotate(40deg) saturate(1.6) brightness(1.15) ' +
  'drop-shadow(0 0 10px rgba(255,215,80,0.85)) ' +
  'drop-shadow(0 0 24px rgba(255,200,60,0.5))'

/** Theme palette used for shiny chrome (result card border, banners,
 *  Logbook badge). Gold + warm amber. */
export const SHINY_THEME = {
  primary:  '#fbcc4a',
  primaryRgb: '251,204,74',
  secondary: '#f0a020',
  secondaryRgb: '240,160,32',
  text:     '#fff5d0',
  glow:     'rgba(251,204,74,0.55)',
} as const

/** Habitats that opt OUT of shiny rolls. Ancient Deep already has its
 *  own one-off trophy treatment; rolling shiny over the top would
 *  muddy that moment. */
const SHINY_BLOCKED_HABITATS = new Set(['ancient_deep'])

/** Server-side roll. Returns true when both gates pass (perfect + RNG).
 *  Habitat-gated so Ancient Deep catches never roll shiny. */
export function rollShiny(opts: {
  isPerfect: boolean
  habitat: string
}): boolean {
  if (!opts.isPerfect) return false
  if (SHINY_BLOCKED_HABITATS.has(opts.habitat)) return false
  return Math.floor(Math.random() * SHINY_ODDS) === 0
}

/** Sell value with the shiny multiplier applied. Pure helper. */
export function shinySellValue(baseSellValue: number): number {
  return Math.round(baseSellValue * SHINY_SELL_MULT)
}
