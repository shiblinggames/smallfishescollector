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
// Tiles are crew art (the fish sprites). Each gets a strong, distinct hue so
// matches read instantly even at thumbnail size; emoji is a fallback only.
export const MATCH_TOKENS: { img: string; emoji: string; color: string }[] = [
  { img: '/fish/clownfish.png', emoji: '🐠', color: '#ff8a2e' }, // orange
  { img: '/fish/blue-tang.png', emoji: '🐟', color: '#2e9bf0' }, // blue
  { img: '/fish/pufferfish.png', emoji: '🐡', color: '#f0cb3e' }, // yellow
  { img: '/fish/lionfish.png', emoji: '🦂', color: '#ec5138' }, // red
  { img: '/fish/mahi-mahi.png', emoji: '🐠', color: '#28d484' }, // green
  { img: '/fish/dumbo-octopus.png', emoji: '🐙', color: '#b06fe0' }, // violet
  { img: '/fish/seahorse.png', emoji: '🌊', color: '#ff5c8a' }, // pink (spare)
  { img: '/fish/manta-ray.png', emoji: '🧭', color: '#5ad0d0' }, // teal (spare)
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
