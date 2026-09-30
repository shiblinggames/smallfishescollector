// ── THE PARLOR'S SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The Captain's Board, Spin the Capstan, the Pirate King and the Parlor's rank
// as one object. On the web each call is the server action; on Steam the same
// interface runs lib/core/parlor against the local save and the shipped
// question bank. The signatures ARE the actions' (typeof), so the two cannot
// drift.

import { claimParlorRank, markParlorGuideSeen } from '@/app/(app)/tavern/trivia/actions'
import { getCaptainsBoardState, playCaptainsCard, answerCaptainsTile } from '@/app/(app)/tavern/trivia/board/actions'
import { getCapstanState, spinCapstan, callConsonant, buyVowel, solveCapstan } from '@/app/(app)/tavern/trivia/capstan/actions'
import { getPirateKingState, startKingRung, answerKingRung, spendKingFiftyFifty, walkKingAway } from '@/app/(app)/tavern/trivia/king/actions'

export interface ParlorApi {
  // ── The rank ──
  claimParlorRank: typeof claimParlorRank
  markParlorGuideSeen: typeof markParlorGuideSeen
  // ── The Captain's Board ──
  getCaptainsBoardState: typeof getCaptainsBoardState
  playCaptainsCard: typeof playCaptainsCard
  answerCaptainsTile: typeof answerCaptainsTile
  // ── Spin the Capstan ──
  getCapstanState: typeof getCapstanState
  spinCapstan: typeof spinCapstan
  callConsonant: typeof callConsonant
  buyVowel: typeof buyVowel
  solveCapstan: typeof solveCapstan
  // ── The Pirate King ──
  getPirateKingState: typeof getPirateKingState
  startKingRung: typeof startKingRung
  answerKingRung: typeof answerKingRung
  spendKingFiftyFifty: typeof spendKingFiftyFifty
  walkKingAway: typeof walkKingAway
}

/** The web implementation: each call is the server action. */
export const webParlorApi: ParlorApi = {
  claimParlorRank, markParlorGuideSeen,
  getCaptainsBoardState, playCaptainsCard, answerCaptainsTile,
  getCapstanState, spinCapstan, callConsonant, buyVowel, solveCapstan,
  getPirateKingState, startKingRung, answerKingRung, spendKingFiftyFifty, walkKingAway,
}
