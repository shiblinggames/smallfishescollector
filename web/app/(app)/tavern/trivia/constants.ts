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

/** Doubloon payout per tier (index = tier - 1). The board is weekly
 *  (fresh Monday) and the player plays ONE card a day, picking from the
 *  12 on the board (4 topics × 3 tiers) — up to 7 over the week. The
 *  richer the tier, the harder the clue. */
export const TRIVIA_TIER_VALUES = [50, 100, 200] as const

export const TRIVIA_TIERS = [1, 2, 3] as const

export function triviaTileKey(category: TriviaCategoryKey, tier: number): string {
  return `${category}-${tier}`
}

/** One tile as the client sees it. question/options only ride along
 *  once the card is committed (you commit to a card before its question
 *  is revealed, so you can't read all 12 and cherry-pick the easy one)
 *  or already answered; correct_index + explanation only once answered. */
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
  /** Committed on a past day but never answered — forfeited, can't be
   *  played again (anti-cheat: no revealing tonight, answering tomorrow). */
  spent?: boolean
}

export interface CaptainsBoardState {
  /** Week-start Monday this board belongs to. */
  date: string
  tiles: BoardTileClient[]
  /** Picks allowed per day — 1 for everyone, 2 for members. */
  picksAllowed: number
  /** Picks used today (committed or answered). */
  picksToday: number
  /** True once the day's picks are spent — the board locks until tomorrow. */
  playedToday: boolean
  /** The card committed today but not yet answered — the resume target so
   *  a refresh reopens the same question. null when nothing is pending. */
  committedKey: string | null
  doubloonsAwarded: number
}

export interface AnswerTileResult {
  correct: boolean
  correctIndex: number
  explanation: string
  doubloonsWon: number
  totalAwarded: number
  /** Wallet total after the payout, null when nothing was won — the
   *  client forwards it to the Nav's doubloons-changed listener. */
  newDoubloons: number | null
}

// ── Pirate King ─────────────────────────────────────────────────────
// Millionaire-style ladder: ten rungs, prizes climb, answer wrong and
// you fall to the last safe haven. One run a WEEK (fresh ladder each
// Monday), one 50/50 lifeline. Pays doubloons like the board.

/** Monday (UTC) of the current week — the key the weekly ladder and
 *  attempts are stored under. */
export function kingWeekStr(now = new Date()): string {
  const diff = (now.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
  return monday.toISOString().split('T')[0]
}

/** Prize per rung (index = rung - 1). A crowned run banks 1000 ⟡. */
export const PIRATE_KING_PRIZES = [20, 40, 60, 100, 160, 240, 360, 520, 720, 1000] as const

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
  /** Week-start Monday this run belongs to. */
  date: string
  status: PirateKingStatus
  /** Questions answered correctly so far (0-10). While active, the
   *  current question is rung + 1. */
  rung: number
  doubloonsAwarded: number
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
  doubloonsAwarded: number
  /** Wallet total after a terminal payout, null when nothing paid —
   *  the client forwards it to the Nav's doubloons-changed listener. */
  newDoubloons: number | null
  /** Next question if the run continues, already stripped. */
  next: KingQuestionClient | null
}
