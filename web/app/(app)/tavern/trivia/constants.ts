// Trivia Night — shared constants + types for the trivia hub games.
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

/** Gem payout per tier (index = tier - 1). A swept board banks 160 ◆,
 *  in the same neighborhood as the old Fish of the Day's 100 ◆ pool
 *  but asking twelve answers instead of one lucky guess. */
export const TRIVIA_TIER_VALUES = [5, 10, 25] as const

export const TRIVIA_TIERS = [1, 2, 3] as const

export function triviaTileKey(category: TriviaCategoryKey, tier: number): string {
  return `${category}-${tier}`
}

/** One tile as the client sees it. correct_index + explanation only
 *  ride along once the tile has been answered — the unanswered board
 *  payload never contains answers. */
export interface BoardTileClient {
  key: string
  category: TriviaCategoryKey
  tier: 1 | 2 | 3
  value: number
  question: string
  options: string[]
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
  gemsAwarded: number
}

export interface AnswerTileResult {
  correct: boolean
  correctIndex: number
  explanation: string
  gemsWon: number
  totalAwarded: number
}
