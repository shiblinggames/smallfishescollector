// ── THE DEN'S SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The shared chip purse, Fish Slots, Fish Roulette and Blackjack as one object.
// On the web each call is the server action; on Steam the same interface runs
// lib/core/casino against the local save. The signatures ARE the actions'
// (typeof), so the two cannot drift.

import { getSlotsJackpot, getSlotStats, spinSlots } from '@/app/(app)/tavern/actions'
import { getCasinoState, buyInCasino, cashOutCasino, markDenGuideSeen } from '@/app/(app)/tavern/casino/actions'
import { getRouletteState, placeBetsAndSpin } from '@/app/(app)/tavern/roulette/actions'
import {
  getDailyWagered, dealBlackjack, acceptInsurance, declineInsurance, hit, stand, doubleDown, split, resumeHand,
} from '@/app/(app)/tavern/blackjack/actions'

export interface CasinoApi {
  // ── The purse ──
  getCasinoState: typeof getCasinoState
  buyInCasino: typeof buyInCasino
  cashOutCasino: typeof cashOutCasino
  markDenGuideSeen: typeof markDenGuideSeen
  // ── Fish Slots ──
  getSlotsJackpot: typeof getSlotsJackpot
  getSlotStats: typeof getSlotStats
  spinSlots: typeof spinSlots
  // ── Fish Roulette ──
  getRouletteState: typeof getRouletteState
  placeBetsAndSpin: typeof placeBetsAndSpin
  // ── Blackjack ──
  getDailyWagered: typeof getDailyWagered
  dealBlackjack: typeof dealBlackjack
  acceptInsurance: typeof acceptInsurance
  declineInsurance: typeof declineInsurance
  hit: typeof hit
  stand: typeof stand
  doubleDown: typeof doubleDown
  split: typeof split
  resumeHand: typeof resumeHand
}

/** The web implementation: each call is the server action. */
export const webCasinoApi: CasinoApi = {
  getCasinoState, buyInCasino, cashOutCasino, markDenGuideSeen,
  getSlotsJackpot, getSlotStats, spinSlots,
  getRouletteState, placeBetsAndSpin,
  getDailyWagered, dealBlackjack, acceptInsurance, declineInsurance, hit, stand, doubleDown, split, resumeHand,
}
