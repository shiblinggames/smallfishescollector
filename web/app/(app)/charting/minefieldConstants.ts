// The Minefield — shared constants + types for the weekly ship-themed
// minesweeper in The Chart Room. Plain module (NOT 'use server') so sync
// helpers + types survive the build. Kept separate from Treasure Match's
// constants.ts so the two weekly puzzles don't tangle.
//
// Sweep a harbor of drifting sea mines: reveal open water, read the
// numbers (mines bordering a tile), flag the mines, clear every safe
// tile. Hit a mine and she's lost — but the week's board resets and you
// try again (unlimited retries). First clear of the week banks puzzle
// points toward the World Chart. No doubloons.

export const MINEFIELD_COLS = 9
export const MINEFIELD_ROWS = 12
export const MINEFIELD_MINES = 18

/** Puzzle points banked on the first clear of the week. The Minefield is the
 *  OPTIONAL second weekly puzzle (Treasure Match is the approachable default),
 *  so it pays a smaller bonus than Match's 5 — a nice-to-have, not a way to
 *  double weekly income. Feeds the Den tiers. */
export const MINEFIELD_POINTS = 3

/** Monday (UTC) of the current week — the key the weekly board +
 *  attempts are stored under (mirrors the Pirate King ladder). */
export function minefieldWeekStr(now = new Date()): string {
  const diff = (now.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
  return monday.toISOString().split('T')[0]
}

/** A revealed tile as the client sees it — its adjacent-mine count.
 *  adj 0 renders as open water. */
export interface RevealedTile {
  i: number
  adj: number
}

export interface MinefieldState {
  week: string
  cols: number
  rows: number
  mineCount: number
  revealed: RevealedTile[]
  flagged: number[]
  status: 'active' | 'cleared'
  busts: number
  /** Points already banked for this week's board (0 until cleared). */
  pointsAwarded: number
  /** The reward for a first clear. */
  reward: number
  /** Lifetime puzzle points (for the readout). */
  puzzlePoints: number
}

export interface RevealResult {
  busted: boolean
  cleared: boolean
  /** The FULL revealed set after this action — the client replaces its
   *  state with this (small board, simplest + race-proof). On a bust it's
   *  just the opening region; mines are NEVER sent (busting to peek then
   *  retrying would be cheating). */
  revealed: RevealedTile[]
  status: 'active' | 'cleared'
  busts: number
  pointsWon: number
  newPuzzlePoints: number | null
}
