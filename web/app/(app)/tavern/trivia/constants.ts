// The Parlor — shared constants + types for the trivia hub games.
// Plain module (NOT 'use server') so sync helpers and types survive
// the build; server actions import from here.

export const TRIVIA_CATEGORIES = [
  { key: 'FISH', label: 'Fish Facts', color: '#60a5fa' },
  { key: 'DEEP', label: 'The Deep', color: '#a78bfa' },
  { key: 'LORE', label: 'Salt & Legend', color: '#f0c040' },
  { key: 'CATCH', label: 'The Catch', color: '#34d399' },
] as const

export type TriviaCategoryKey = (typeof TRIVIA_CATEGORIES)[number]['key']

export const TRIVIA_CATEGORY_KEYS = TRIVIA_CATEGORIES.map(c => c.key) as TriviaCategoryKey[]

export function categoryMeta(key: TriviaCategoryKey) {
  return TRIVIA_CATEGORIES.find(c => c.key === key)!
}

/** Doubloon payout per tier (index = tier - 1). The player locks in
 *  ONE category column a day and climbs its three clues in order, so
 *  a swept column banks 300 ⟡. */
export const TRIVIA_TIER_VALUES = [50, 100, 150] as const

export const TRIVIA_TIERS = [1, 2, 3] as const

export function triviaTileKey(category: TriviaCategoryKey, tier: number): string {
  return `${category}-${tier}`
}

/** One tile as the client sees it. question/options only ride along
 *  for the LOCKED column (pre-lock you could otherwise read all four
 *  columns' questions before choosing); correct_index + explanation
 *  only once the tile has been answered. */
export interface BoardTileClient {
  key: string
  category: TriviaCategoryKey
  tier: 1 | 2 | 3
  value: number
  question: string | null
  options: string[] | null
  answered: null | {
    chosen: number
    correct: boolean
    correctIndex: number
    explanation: string
  }
}

export interface CaptainsBoardState {
  date: string
  tiles: BoardTileClient[]
  /** The column the player committed to today, null before locking. */
  lockedCategory: TriviaCategoryKey | null
  doubloonsAwarded: number
}

export interface AnswerTileResult {
  correct: boolean
  correctIndex: number
  explanation: string
  doubloonsWon: number
  totalAwarded: number
}

// ── Pirate King ─────────────────────────────────────────────────────
// Millionaire-style ladder: ten rungs, prizes climb, answer wrong and
// you fall to the last safe haven. One run a day, one 50/50 lifeline.

/** Prize per rung (index = rung - 1). A crowned run banks 250 ◆. */
export const PIRATE_KING_PRIZES = [5, 10, 15, 25, 40, 60, 90, 130, 180, 250] as const

export const PIRATE_KING_RUNGS = PIRATE_KING_PRIZES.length

/** Rungs whose prize is safe once passed: bust above a haven and you
 *  keep its prize instead of losing the lot. */
export const PIRATE_KING_HAVENS = [4, 7] as const

/** What a bust pays at a given rung (rung = questions answered
 *  correctly so far): the highest haven prize at or below it. */
export function kingHavenValue(rung: number): number {
  let safe = 0
  for (const h of PIRATE_KING_HAVENS) {
    if (rung >= h) safe = PIRATE_KING_PRIZES[h - 1]
  }
  return safe
}

export type PirateKingStatus = 'active' | 'walked' | 'busted' | 'crowned'

/** The current question as the client sees it — never the answer.
 *  removed = option indexes struck by the 50/50 lifeline. */
export interface KingQuestionClient {
  question: string
  options: string[]
  removed: number[]
}

export interface PirateKingState {
  date: string
  status: PirateKingStatus
  /** Questions answered correctly so far (0-10). While active, the
   *  current question is rung + 1. */
  rung: number
  gemsAwarded: number
  fiftyUsed: boolean
  /** Present only while status is 'active'. */
  current: KingQuestionClient | null
}

export interface AnswerKingResult {
  correct: boolean
  correctIndex: number
  explanation: string
  status: PirateKingStatus
  rung: number
  gemsAwarded: number
  /** Next question if the run continues, already stripped. */
  next: KingQuestionClient | null
}
