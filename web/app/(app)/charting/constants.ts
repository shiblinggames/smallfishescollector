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

/** Chance a refilled cell drops in as a Compass wildcard.
 *
 *  SHARED, not client-local, and that is load-bearing. The board RNG is a
 *  single stateful stream: collapseAndRefill draws from it on every refill, so
 *  the server can only replay a run if it consumes the stream in exactly the
 *  same order with exactly the same odds. A copy of this number drifting by a
 *  hundredth would desync every replay after the first refill. */
export const WILD_DROP_CHANCE = 0.01

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

/** Token art by type index (must be >= MATCH_TYPES). Each token is a single
 *  pre-rendered gem PNG with a crew-fish motif encased inside, cut to its own
 *  silhouette (circle/diamond/square/hexagon/triangle/octagon/pentagon/star) so
 *  the set reads apart by shape AND color AND art — colorblind-safe and instant
 *  at thumbnail size. Shading, facets, and bevel are baked into the pixels, so a
 *  tile is one <img> (no runtime gradients or stacked drop-shadow filters, which
 *  is what made the board lag). `emoji` is a fallback only; `color` still drives
 *  the particle bursts, select/commit glows, and the wild orb. */
export const MATCH_TOKENS: { img: string; emoji: string; color: string }[] = [
  { img: '/match/clownfish.png',     emoji: '🐠', color: '#ff7e1c' }, // orange · circle
  { img: '/match/blue-tang.png',     emoji: '🐟', color: '#2aa4ff' }, // blue · diamond
  { img: '/match/pufferfish.png',    emoji: '🐡', color: '#ffd028' }, // yellow · rounded square
  { img: '/match/lionfish.png',      emoji: '🦂', color: '#ff4631' }, // red · hexagon
  { img: '/match/seahorse.png',      emoji: '🐠', color: '#0fd886' }, // green · triangle
  { img: '/match/dumbo-octopus.png', emoji: '🐙', color: '#bb55ff' }, // violet · octagon
  { img: '/match/mahi-mahi.png',     emoji: '🌊', color: '#ff4f85' }, // pink · pentagon
  { img: '/match/manta-ray.png',     emoji: '🧭', color: '#29e0d2' }, // teal · star (compass/wild silhouette)
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
}

export interface SubmitMatchResult {
  bestScore: number
  tier: number            // points the best score now earns (0-5)
  pointsWon: number       // charting points added to the profile this call (the delta)
  maxed: boolean          // tier === MATCH_MAX_POINTS
  newPuzzlePoints: number | null
}
