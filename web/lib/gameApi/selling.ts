// ── THE SELLING SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The market, the traders at sea, the blockade runner and the boat's place on
// the chart, as one object. On the web each call is the server action; on
// Steam the same interface runs lib/core/selling against the local save.
// The signatures ARE the actions' (typeof), so the two cannot drift.

import { getPendingSales, sellEntireHold, marketSellFish } from '@/app/(app)/tavern/market/actions'
import { dealtToday, strikeDeal, sellToResident, wagerForRunnerRod, runnerRodOwned, saveSeaPosition } from '@/app/(app)/sea/traderActions'

export type { PendingSale } from '@/app/(app)/tavern/market/actions'
export type { DealResult } from '@/app/(app)/sea/traderActions'

export interface SellingApi {
  // ── The market, ashore ──
  getPendingSales: typeof getPendingSales
  sellEntireHold: typeof sellEntireHold
  marketSellFish: typeof marketSellFish
  // ── At sea ──
  dealtToday: typeof dealtToday
  strikeDeal: typeof strikeDeal
  sellToResident: typeof sellToResident
  wagerForRunnerRod: typeof wagerForRunnerRod
  runnerRodOwned: typeof runnerRodOwned
  /** Where the boat is, and the fog it has cleared. */
  saveSeaPosition: typeof saveSeaPosition
}

/** The web implementation: each call is the server action. */
export const webSellingApi: SellingApi = {
  getPendingSales, sellEntireHold, marketSellFish,
  dealtToday, strikeDeal, sellToResident, wagerForRunnerRod, runnerRodOwned, saveSeaPosition,
}
