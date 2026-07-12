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
 *  six in play (0-5) read apart by shape AND color AND art — fully
 *  colorblind-safe and instant even at thumbnail size. `clip` is a CSS
 *  clip-path; '' = the default rounded square. emoji is a fallback only. */
// `glint` overrides the cut-gem sparkle's position for shapes whose top-left
// corner is empty (pointed-top silhouettes), so the highlight sits ON the gem.
// `nudge` shifts the fish art down by N% of its height to center it in the
// visible part of the silhouette. Both default to the top-left glint / no nudge.
export const MATCH_TOKENS: { img: string; emoji: string; color: string; clip: string; glint?: { left: string; top: string }; nudge?: number }[] = [
  { img: '/fish/clownfish.png',     emoji: '🐠', color: '#ff7e1c', clip: 'circle(49% at 50% 50%)' },                                              // orange · circle
  { img: '/fish/blue-tang.png',     emoji: '🐟', color: '#2aa4ff', clip: 'polygon(50% 1%, 99% 50%, 50% 99%, 1% 50%)', glint: { left: '40%', top: '25%' } },  // blue · diamond
  { img: '/fish/pufferfish.png',    emoji: '🐡', color: '#ffd028', clip: '' },                                                                    // yellow · rounded square
  { img: '/fish/lionfish.png',      emoji: '🦂', color: '#ff4631', clip: 'polygon(50% 1%, 94% 26%, 94% 74%, 50% 99%, 6% 74%, 6% 26%)' },          // red · hexagon
  { img: '/fish/seahorse.png',      emoji: '🐠', color: '#0fd886', clip: 'polygon(50% 4%, 97% 95%, 3% 95%)', glint: { left: '42%', top: '40%' }, nudge: 15 }, // green · triangle (seahorse — narrow fish fits the point)
  { img: '/fish/dumbo-octopus.png', emoji: '🐙', color: '#bb55ff', clip: 'polygon(30% 2%, 70% 2%, 98% 30%, 98% 70%, 70% 98%, 30% 98%, 2% 70%, 2% 30%)' }, // violet · octagon
  { img: '/fish/mahi-mahi.png',     emoji: '🌊', color: '#ff4f85', clip: 'polygon(50% 1%, 99% 39%, 80% 98%, 20% 98%, 1% 39%)', glint: { left: '40%', top: '28%' } }, // pink · pentagon (spare)
  { img: '/fish/manta-ray.png',     emoji: '🧭', color: '#29e0d2', clip: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', glint: { left: '42%', top: '30%' } }, // teal · star (spare)
]

/** Lighten (amt > 0, toward white) or darken (amt < 0, toward black) a #rrggbb
 *  hex by |amt| ∈ [0,1]. Returns rgb() — no CSS color-mix dependency so it
 *  renders on every device. */
export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  const t = amt >= 0 ? 255 : 0, a = Math.abs(amt)
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c + (t - c) * a)))
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

/** Faceted-gem surface for a token color. Layers, top→bottom: a sharp specular
 *  glint, a glossy diagonal sheen, translucent light/dark conic WEDGES that read
 *  as cut facets radiating from the table, and a rounded body that sinks to a
 *  deep bottom-right — so a token reads as a faceted 3-D gem, not a flat chip.
 *  Used by the board tiles + the door-card preview. */
export function gemSurface(color: string): string {
  const lite = shade(color, 0.52)
  const lit2 = shade(color, 0.72)
  const deep = shade(color, -0.46)
  const deeper = shade(color, -0.66)
  return [
    // sharp specular glint (top-left)
    'radial-gradient(16% 14% at 30% 20%, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)',
    // glossy top cap — a soft candy-gloss reflection across the upper third
    'radial-gradient(75% 42% at 50% 4%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.13) 38%, rgba(255,255,255,0) 70%)',
    // cut facets — translucent light/dark wedges fanning from the table
    'conic-gradient(from 214deg at 50% 42%, rgba(255,255,255,0.14) 0deg, rgba(0,0,0,0.20) 52deg, rgba(255,255,255,0.18) 112deg, rgba(0,0,0,0.15) 176deg, rgba(255,255,255,0.07) 240deg, rgba(0,0,0,0.22) 304deg, rgba(255,255,255,0.14) 360deg)',
    // rounded body: bright lit top sinking to a deep bottom-right for volume
    `radial-gradient(132% 132% at 36% 22%, ${lit2} 0%, ${lite} 17%, ${color} 45%, ${deep} 80%, ${deeper} 100%)`,
  ].join(', ')
}

/** Faux-bevel filter — a bright rim offset up-left + a dark depth/grounding
 *  shadow down-right. drop-shadow follows the clip-path silhouette, so this
 *  gives every gem a lit edge + thickness + a shadow on the board (the thing
 *  that makes Bejeweled/Candy-Crush gems read as 3-D, not flat stickers). */
export const GEM_BEVEL = 'drop-shadow(-0.5px -1px 0.6px rgba(255,255,255,0.6)) drop-shadow(1px 2px 2.5px rgba(0,0,0,0.62))'

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
