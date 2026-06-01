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

/** Heavy gold filter — makes any fish sprite look like SOLID GOLD,
 *  not just gold-tinted. Recipe:
 *    grayscale(1)   strips the sprite's original colors
 *    sepia(1)       pushes the result to a warm tone
 *    saturate(7)    cranks that warm tone to a strong, opaque gold
 *    hue-rotate     dials the hue to true 24k gold (vs orange-brown)
 *    brightness     bumps highlights so the metal reads as polished
 *    contrast       deepens the shadows so it doesn't look flat
 *    single drop-shadow at 14px lays a tight rim-light. The wider
 *    36px shadow used to be here, but combined with the high-
 *    saturation filter amplifying the sprite's edge alpha it cast
 *    a square-ish halo around the IMG element bounds — players
 *    saw a visible rectangle. The radial halo div behind the fish
 *    provides the wider warm light; this filter just gives the
 *    sprite its own rim glow.
 *  Pure CSS — works on every existing fish sprite without per-species
 *  art. Pair with the SHINY_THEME palette + result-card chrome for the
 *  full "wow" moment. */
export const SHINY_FISH_FILTER =
  'grayscale(1) sepia(1) saturate(7) hue-rotate(-15deg) ' +
  'brightness(1.25) contrast(1.05) ' +
  'drop-shadow(0 0 12px rgba(251,191,36,0.85))'

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

// ── Shiny moment copy ────────────────────────────────────────────────
// Pool of evocative lines shown in place of the fun_fact on a shiny
// result card. Tone: captain's-log entry, rare-find weight. {fish}
// placeholder gets replaced with the species name (e.g. "Pickerel")
// so the copy reads personal. Kept generic enough to read right for
// any species — shallows minnow up to deep-water predator.
//
// Add more here over time; pickShinyMessage just picks at random.
export const SHINY_MESSAGES: readonly string[] = [
  "A golden {fish}. The kind of catch sailors carve into the hull.",
  "{fish} of gold under your hand. Captain, this is one in a thousand.",
  "Sailors tell tales of gold-scaled ones. Tonight you've held one.",
  "A gilded {fish} — the sea's own coin. Mount it, or part with it for a king's haul.",
  "Gold-scaled and impossible. Even the old captains only saw one of these.",
  "A {fish} drawn up in solid gold. The dockside won't believe you without proof.",
  "Worth more than a hold of common haul, and rarer than the stories about it.",
  "The crew has gone quiet. None of them have ever seen a golden one before.",
  "A golden {fish}. Every captain hopes for this once in a career.",
  "The deep turned a {fish} to gold tonight, and gave it to you.",
] as const

/** Picks a random shiny message and substitutes the species name. */
export function pickShinyMessage(fishName: string): string {
  const tpl = SHINY_MESSAGES[Math.floor(Math.random() * SHINY_MESSAGES.length)]
  return tpl.replace(/\{fish\}/g, fishName)
}
