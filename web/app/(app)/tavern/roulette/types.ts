// Shared types for the roulette server actions + client. Lives here
// rather than in actions.ts so 'use server' doesn't silently strip them
// at build (sync helpers + interfaces vanish in 'use server' files; the
// local tsc doesn't catch it).

import type { Bet } from '@/lib/roulette'

export interface RecentSpin {
  id: number
  winningNumber: number
  net: number
  totalWagered: number
  createdAt: string
}

export interface RouletteState {
  chips: number
  doubloons: number
  sessionBuyIns: number
  dailyWagered: number
  dailyRemaining: number
  recentSpins: RecentSpin[]
}

export interface BuyInResult {
  newDoubloons: number
  newChips: number
  dailyWagered: number
  dailyRemaining: number
  sessionBuyIns: number
}

export interface CashOutResult {
  newDoubloons: number
  cashedOut: number
  sessionBuyIns: number
}

export interface PerBetResult {
  bet: Bet
  payout: number
  won: boolean
}

export interface SpinResult {
  winningNumber: number
  totalWagered: number
  totalPayout: number
  net: number
  chipsBefore: number
  chipsAfter: number
  perBet: PerBetResult[]
  doubloons: number
}
