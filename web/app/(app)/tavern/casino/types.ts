// Shared types for the casino wallet (one chip purse across Blackjack /
// Roulette / Slots). Lives outside actions.ts so 'use server' doesn't
// silently strip the interfaces at build.

export interface CasinoSessionNets {
  blackjack: number
  roulette: number
  slots: number
}

export interface CasinoWallet {
  chips: number               // shared purse (profiles.casino_chips)
  doubloons: number           // off-table currency
  sessionBuyIns: number       // doubloons committed since the session started
  dailyBoughtIn: number       // today's buy-ins (casino_buy_ins sum)
  dailyCap: number            // effective daily cap = denDailyCap(puzzle_points)
  dailyRemaining: number      // dailyCap - dailyBoughtIn
  sessionNets: CasinoSessionNets   // per-game win/loss since the session started
  isMember: boolean           // Captain? non-members are flat-capped → upsell
}

export interface CasinoBuyInResult {
  newDoubloons: number
  newChips: number
  dailyBoughtIn: number
  dailyCap: number
  dailyRemaining: number
  sessionBuyIns: number
}

export interface CasinoCashOutResult {
  newDoubloons: number
  cashedOut: number
}

/** One row of the lobby's High Rollers strip — top combined lifetime
 *  net across all three Den games (leaderboard_den view). */
export interface DenTopEarner {
  userId: string
  username: string
  score: number
  characterColor: string | null
  equippedHat: string | null
  avatarBg: string | null
  avatarBorder: string | null
}
