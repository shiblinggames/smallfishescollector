// ── WHAT A FISH SELLS FOR, WITH NO DATABASE IN IT (Steam prep, Phase B, 2026-09-28) ──
//
// The two sell lanes (see docs/systems/fish-economy.md), as plain arithmetic:
//
//   THE MARKET, ashore: every species at its catalogue value times today's
//   market multiplier, floored PER FISH, then times the count. No cut
//   (the non-Captain fee went 2026-09-16).
//
//   A BUYER AT SEA (a zone's resident, or a wandering salter): the whole hold
//   at the buyer's rate off the catalogue value, floored ONCE over the lot.
//
// Moved out of tavern/market/actions and sea/traderActions verbatim, so no
// price changed. The actions keep who is asking, the claim-first locks and the
// writes; scripts/check-sell-rules.mts holds the arithmetic.

import { rngNext } from '@/lib/rng'

/** The market's non-Captain fee: gone for everybody, kept as a named 1. */
export const MARKET_FEE = 1.0

/** One fish of this species, at the market today. */
export function marketPriceEach(sellValue: number, multiplier: number): number {
  return Math.floor(sellValue * multiplier * MARKET_FEE)
}

/** A set of stacks sold at the market: floored per fish, then counted. */
export function marketSale(stacks: { sellValue: number; multiplier: number; quantity: number }[]): { earned: number; fishSold: number } {
  let earned = 0, fishSold = 0
  for (const s of stacks) {
    earned += marketPriceEach(s.sellValue, s.multiplier) * s.quantity
    fishSold += s.quantity
  }
  return { earned, fishSold }
}

/** A hold sold to a buyer at sea: the whole lot at `rate`, floored once. */
export function holdAtRate(stacks: { sellValue: number; quantity: number }[], rate: number): number {
  let total = 0
  for (const s of stacks) total += s.sellValue * s.quantity * rate
  return Math.floor(total)
}

/** The blockade runner's cut: one roll against his odds, rolled here only. */
export function runnerCutWon(odds: number): boolean {
  return rngNext() < odds
}
