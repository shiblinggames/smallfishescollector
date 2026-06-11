// Shared types for the roulette server actions + client. Lives here
// rather than in actions.ts so 'use server' doesn't silently strip them
// at build (sync helpers + interfaces vanish in 'use server' files; the
// local tsc doesn't catch it).
//
// Buy-in / cash-out moved to the shared casino wallet (../casino) —
// their result types live in ../casino/types now.

import type { Bet } from '@/lib/roulette'

export interface RecentSpin {
  id: number
  winningNumber: number
  net: number
  totalWagered: number
  createdAt: string
}

export interface RouletteState {
  chips: number             // shared casino purse
  doubloons: number
  sessionBuyIns: number     // shared casino session buy-ins
  sessionNet: number        // roulette's own win/loss this session
  dailyBoughtIn: number     // today's shared casino buy-ins
  dailyRemaining: number
  recentSpins: RecentSpin[]
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
  sessionNet: number        // roulette session net post-spin
  sessionBuyIns: number     // shared session buy-ins post-spin (0 after a bust-out reset)
}
