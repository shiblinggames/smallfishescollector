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
  { emoji: '🪙', color: '#caa133' }, // doubloon
  { emoji: '⚓', color: '#3f7fb0' }, // anchor
  { emoji: '🐚', color: '#c87fa8' }, // shell
  { emoji: '🐟', color: '#3fae78' }, // fish
  { emoji: '💎', color: '#7f63c0' }, // gem
  { emoji: '💀', color: '#9a948a' }, // skull
  { emoji: '🦑', color: '#b05f7f' }, // squid (spare)
  { emoji: '🧭', color: '#b08840' }, // compass (spare)
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
