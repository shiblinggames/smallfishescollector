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

export const MATCH_MOVES = 25

/** Tiered charting-point payout by best score in MATCH_MOVES moves. Calibrated
 *  against simulated play: a casual single run lands ~1000-2000; a dedicated
 *  retry player reaches ~2600-3000; ~3600 needs real cascade skill + grinding.
 *  So 1/5 is a gimme on finishing, and 5/5 is genuinely hard. Unlimited retries
 *  (same board, fresh moves) let players climb the ladder across the week. */
export const MATCH_TIERS: { score: number; points: number }[] = [
  { score: 1200, points: 1 },
  { score: 1700, points: 2 },
  { score: 2300, points: 3 },
  { score: 2900, points: 4 },
  { score: 3600, points: 5 },
]

/** Max points (5) + the top-tier score, reused as the progress-bar ceiling
 *  and the instant-win threshold. MATCH_TARGET name kept for generate.ts. */
export const MATCH_MAX_POINTS = MATCH_TIERS[MATCH_TIERS.length - 1].points
export const MATCH_TARGET = MATCH_TIERS[MATCH_TIERS.length - 1].score

/** Charting points earned for a given best score (0 if below tier 1). */
export function pointsForScore(score: number): number {
  let p = 0
  for (const t of MATCH_TIERS) if (score >= t.score) p = t.points
  return p
}

/** The next tier above `score`, or null once maxed. */
export function nextMatchTier(score: number): { score: number; points: number } | null {
  for (const t of MATCH_TIERS) if (score < t.score) return t
  return null
}

/** Token art by type index (must be >= MATCH_TYPES). Each token is a crew fish
 *  sprite on a colored gem, and EACH GETS ITS OWN SILHOUETTE (`clip`) so the
 *  six in play (0-5) read apart by shape AND colour AND art — fully
 *  colourblind-safe and instant even at thumbnail size. `clip` is a CSS
 *  clip-path; '' = the default rounded square. emoji is a fallback only. */
export const MATCH_TOKENS: { img: string; emoji: string; color: string; clip: string }[] = [
  { img: '/fish/clownfish.png',     emoji: '🐠', color: '#ff8a2e', clip: 'circle(49% at 50% 50%)' },                                              // orange · circle
  { img: '/fish/blue-tang.png',     emoji: '🐟', color: '#2e9bf0', clip: 'polygon(50% 1%, 99% 50%, 50% 99%, 1% 50%)' },                           // blue · diamond
  { img: '/fish/pufferfish.png',    emoji: '🐡', color: '#f0cb3e', clip: '' },                                                                    // yellow · rounded square
  { img: '/fish/lionfish.png',      emoji: '🦂', color: '#ec5138', clip: 'polygon(50% 1%, 94% 26%, 94% 74%, 50% 99%, 6% 74%, 6% 26%)' },          // red · hexagon
  { img: '/fish/mahi-mahi.png',     emoji: '🐠', color: '#28d484', clip: 'polygon(50% 4%, 97% 95%, 3% 95%)' },                                    // green · triangle
  { img: '/fish/dumbo-octopus.png', emoji: '🐙', color: '#b06fe0', clip: 'polygon(30% 2%, 70% 2%, 98% 30%, 98% 70%, 70% 98%, 30% 98%, 2% 70%, 2% 30%)' }, // violet · octagon
  { img: '/fish/seahorse.png',      emoji: '🌊', color: '#ff5c8a', clip: 'polygon(50% 1%, 99% 39%, 80% 98%, 20% 98%, 1% 39%)' },                  // pink · pentagon (spare)
  { img: '/fish/manta-ray.png',     emoji: '🧭', color: '#5ad0d0', clip: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }, // teal · star (spare)
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
  target: number      // top-tier (5/5) score — progress ceiling + instant win
  moves: number
  status: 'active' | 'cleared'  // cleared = maxed at 5/5
  bestScore: number
  pointsAwarded: number          // charting points already banked this week (0-5)
  puzzlePoints: number
  denCap: number
}

export interface SubmitMatchResult {
  bestScore: number
  tier: number            // points the best score now earns (0-5)
  pointsWon: number       // charting points added to the profile this call (the delta)
  maxed: boolean          // tier === MATCH_MAX_POINTS
  newPuzzlePoints: number | null
  capBefore: number
  capAfter: number
}
