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
  /** Gems won this answer when a weekly correct-answer milestone was crossed
   *  (0 if none), + the new gem total for the gems-changed dispatch. */
  gemsWon: number
  newGems: number | null
  /** Parlor streak after this answer (0 if wrong), the streak it BROKE (>0 only
   *  on a wrong answer that ended a run), and the all-time best. */
  currentStreak: number
  brokeStreak: number
  bestStreak: number
}

// ── Parlor mastery: streak → rank ────────────────────────────────────
// ONE streak across both games — any correct answer continues it, any wrong one
// breaks it. best_streak is the permanent record that sets your Parlor RANK, a
// title you climb and show off. Prestige, not currency (no economy impact).
export interface ParlorRank { at: number; title: string; color: string }
export const PARLOR_RANKS: ParlorRank[] = [
  { at: 0,  title: 'Greenhorn',     color: '#8a8478' },
  { at: 3,  title: 'Card Hand',     color: '#7fd49a' },
  { at: 6,  title: 'Sharp',         color: '#60a5fa' },
  { at: 10, title: 'Cardsharp',     color: '#a78bfa' },
  { at: 16, title: 'Parlor Master', color: '#f0c040' },
  { at: 25, title: 'Parlor Legend', color: '#ff6b35' },
]
/** Current rank + the next rung (null if maxed) for an all-time best streak. */
export function parlorRank(best: number): { rank: ParlorRank; next: ParlorRank | null } {
  let rank = PARLOR_RANKS[0]
  for (const r of PARLOR_RANKS) if (best >= r.at) rank = r
  return { rank, next: PARLOR_RANKS[PARLOR_RANKS.indexOf(rank) + 1] ?? null }
}
/** The host's in-character reaction to an answer. Pure (client-safe); leans on
 *  the streak (or the one just broken) so it never feels canned. */
export function parlorHostReaction(correct: boolean, streak: number, broke = 0): string {
  if (!correct) {
    if (broke >= 8) return `${broke} straight, gone in a heartbeat. The parlor giveth, the parlor taketh.`
    if (broke >= 4) return `There goes a fine run — back to nothing. Steady the hand.`
    return 'Cold water. Shake it off and pick again.'
  }
  if (streak >= 12) return "The whole room's holding its breath. Don't you dare blink."
  if (streak >= 8)  return `${streak} in a row — you're on a proper heater now.`
  if (streak >= 4)  return `${streak} straight. The house is starting to sweat.`
  const lines = ['Well read.', 'Sharp as a gaff hook.', 'The coin knows its master.', 'Clean as you like.']
  return lines[streak % lines.length]
}

// ── Parlor gem milestones (the premium draw) ─────────────────────────
// Doubloons are the base payout; GEMS are the aspirational reward you can only
// earn by playing WELL. Board: cumulative gem totals for cards answered correctly
// across the week (delta-paid via trivia_board_attempts.gems_awarded, so crossing
// a threshold pays only the difference). King: a crown banks a gem bonus on top of
// the 1000 ⟡ crown. All tunable here.
export const BOARD_GEM_MILESTONES: { correct: number; gems: number }[] = [
  { correct: 3, gems: 5 },
  { correct: 5, gems: 15 },
  { correct: 7, gems: 40 },
]
/** Cumulative gem total earned for answering `correct` cards right this week. */
export function boardGemTotalFor(correct: number): number {
  let total = 0
  for (const m of BOARD_GEM_MILESTONES) if (correct >= m.correct) total = m.gems
  return total
}
/** The next gem milestone a player is chasing (null once maxed) — drives the
 *  "next gem at N correct" hint in the board UI. */
export function nextBoardGemMilestone(correct: number): { correct: number; gems: number } | null {
  return BOARD_GEM_MILESTONES.find(m => correct < m.correct) ?? null
}
export const PIRATE_KING_CROWN_GEMS = 75

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
  /** Crown gem bonus (0 unless this answer crowned the run) + the new gem
   *  total for the gems-changed dispatch. */
  gemsWon: number
  newGems: number | null
  /** Parlor streak after this answer (0 if wrong), the streak it BROKE, and the
   *  all-time best — shared with the Captain's Board. */
  currentStreak: number
  brokeStreak: number
  bestStreak: number
  /** Next question if the run continues, already stripped. */
  next: KingQuestionClient | null
}
