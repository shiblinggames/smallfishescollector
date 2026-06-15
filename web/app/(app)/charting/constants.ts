// Treasure Match — shared constants + types for the weekly Match-3 in
// The Chart Room (replaced The Minefield 2026-06-15). Plain module (NOT
// 'use server') so sync helpers + types survive the build.
//
// Swap adjacent treasures to line up 3+; matches clear, everything drops,
// cascades chain. Hit the target score within the move limit to win. One
// seeded board a week; first clear banks charting points (no doubloons).

export const MATCH_COLS = 7
export const MATCH_ROWS = 7
export const MATCH_TYPES = 6

/** Win condition: reach MATCH_TARGET points within MATCH_MOVES moves. */
export const MATCH_TARGET = 2000
export const MATCH_MOVES = 25

/** Charting points banked on the first clear of the week. */
export const MATCH_POINTS = 5

/** Token art by type index (must be >= MATCH_TYPES). Emoji on a colored
 *  tile — instantly readable, ship-themed. */
export const MATCH_TOKENS: { emoji: string; color: string }[] = [
  { emoji: '🪙', color: '#ffc62e' }, // doubloon — bright gold
  { emoji: '⚓', color: '#2e9bf0' }, // anchor — vivid blue
  { emoji: '🐚', color: '#ff6fb4' }, // shell — hot pink
  { emoji: '🐟', color: '#1ed988' }, // fish — bright green
  { emoji: '💎', color: '#9d5cff' }, // gem — electric violet
  { emoji: '💀', color: '#34dcd6' }, // skull — bright cyan
  { emoji: '🦑', color: '#ff5c8a' }, // squid (spare)
  { emoji: '🧭', color: '#f0a93a' }, // compass (spare)
]

/** Monday (UTC) of the current week — the weekly key. */
export function matchWeekStr(now = new Date()): string {
  const diff = (now.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
  return monday.toISOString().split('T')[0]
}

export interface MatchState {
  week: string
  seed: number
  cols: number
  rows: number
  types: number
  target: number
  moves: number
  status: 'active' | 'cleared'
  bestScore: number
  pointsAwarded: number
  reward: number
  puzzlePoints: number
  denCap: number
}

export interface SubmitMatchResult {
  cleared: boolean
  pointsWon: number
  newPuzzlePoints: number | null
  capBefore: number
  capAfter: number
}
