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
  dailyRemaining: number      // CASINO_DAILY_CAP - dailyBoughtIn
  sessionNets: CasinoSessionNets   // per-game win/loss since the session started
}

export interface CasinoBuyInResult {
  newDoubloons: number
  newChips: number
  dailyBoughtIn: number
  dailyRemaining: number
  sessionBuyIns: number
}

export interface CasinoCashOutResult {
  newDoubloons: number
  cashedOut: number
}
