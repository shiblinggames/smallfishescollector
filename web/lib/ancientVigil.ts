// THE LONG VIGIL — the six Ancient Deep giants, mastered.
//
// The endgame problem this solves: the ancients are caught once and then the
// mechanic is spent. All six are catch_difficulty 5 with FIXED lengths
// (length_min === length_max), so there is no size roll, no personal best,
// nothing to be better at — a second catch is identical to the first, which is
// why re-catching them was never worth doing.
//
// So the Vigil gives them their own axis. Each giant carries a RANK, 1 to 5.
// Rank 1 is the original catch — the one that gated the finale — so a captain
// who clears One Last Ride starts at six ranks already earned rather than at
// zero. To climb, you RELEASE a mounted giant back into the deep and land it
// again, and only a PERFECT final phase counts.
//
// THIS DOES NOT INVENT A FIGHT. Every giant already has its own multi-phase
// boss reel in FishingGame's BOSS_CONFIG — precision, drift, accelerate, gyre,
// surge, shrink — written so "no two giants fight alike". A Vigil rank SCALES
// that existing fight rather than layering a second difficulty system over it:
// more phases, and a perfect window that closes harder and a needle that
// quickens more with each one.
//
// Megalodon already proves the shape. It runs 4 phases of perfect-only, opening
// on a deliberately WIDE perfect (perfectShrinkStart: -18) that tightens 6° a
// phase. The Vigil hands that same curve to every giant and steepens it: at
// rank 5 a Plesiosaurus is a five-phase drift fight whose landing window is
// closing under you, and Megalodon is six phases of the same.
//
// WHY THE PERFECT WINDOW IS THE MEASURE. `perfectZoneBonus` is pinned to 0 on
// every rod by explicit design — "the skill floor the whole fishing game is
// measured against" — so NO GEAR widens it. The boss phases move it; a rod
// never can. That is what makes this ladder unbuyable by construction rather
// than merely balanced to be.

/** The six giants, by fish_species.id. Megalodon is last on purpose: it never
 *  surfaces until the other five are on the wall (enforced in castLine). */
export const ANCIENT_IDS = [144, 145, 146, 147, 148, 143] as const

export const VIGIL_MAX_RANK = 5
/** Every giant at rank 5. The capstone: the ancient pet. */
export const VIGIL_MAX_TOTAL = ANCIENT_IDS.length * VIGIL_MAX_RANK   // 30
/** What a captain holds the moment they clear the finale — all six mounted at
 *  rank 1. The floor of the ladder, not zero. */
export const VIGIL_START_TOTAL = ANCIENT_IDS.length                  // 6

export type VigilEntry = { rank: number; released: boolean }
export type VigilState = Record<string, VigilEntry>

/** How a Vigil rank steepens a giant's EXISTING boss fight. Merged over its
 *  BOSS_CONFIG row — never replacing the mechanic, which is that giant's
 *  identity. */
export interface VigilScale {
  /** Added to BossConfig.phases. More stages to hold your nerve through. */
  extraPhases: number
  /** Added to the phase-1 perfect window's shrink (positive = tighter from the
   *  first phase). Bosses with their own opening curve keep theirs and take
   *  this on top. */
  perfectShrinkStart: number
  /** Degrees the perfect window closes per phase. Megalodon ships with 6; every
   *  other giant gets this from the Vigil, so the window closes on all of them. */
  perfectShrinkStep: number
  /** Needle speed multiplier compounded per phase. */
  speedStepMult: number
  /** Added to the zone's blackout chance. Megalodon's noBlackout still wins. */
  blackoutBonus: number
}

/** Keyed by the rank you are ATTEMPTING, 2 through 5. Rank 1 was the original
 *  catch at the fight's shipped difficulty, so it has no row — the ladder is
 *  four rungs, not five. */
const VIGIL_SCALE: Record<number, VigilScale> = {
  2: { extraPhases: 0, perfectShrinkStart: 0, perfectShrinkStep: 1.5, speedStepMult: 1.06, blackoutBonus: 0.00 },
  3: { extraPhases: 1, perfectShrinkStart: 0, perfectShrinkStep: 2.0, speedStepMult: 1.09, blackoutBonus: 0.03 },
  4: { extraPhases: 1, perfectShrinkStart: 1, perfectShrinkStep: 2.5, speedStepMult: 1.12, blackoutBonus: 0.05 },
  5: { extraPhases: 2, perfectShrinkStart: 2, perfectShrinkStep: 3.0, speedStepMult: 1.15, blackoutBonus: 0.08 },
}

/** The scaling for an attempt. Null at rank 1 (the fight as shipped). */
export function vigilScale(attemptingRank: number): VigilScale | null {
  return VIGIL_SCALE[attemptingRank] ?? null
}

/** How each giant fights, in words, for the release sheet. DISPLAY COPY ONLY —
 *  the mechanic itself lives in FishingGame's BOSS_CONFIG and is the single
 *  source of truth; this just names it so a captain knows what they are
 *  signing up for before they give up a mount. */
export const VIGIL_FIGHT_TELL: Record<number, string> = {
  143: 'Perfect or nothing, every phase. No dark to fight, just your own hands.',
  144: 'The ring circles you the whole way down.',
  145: 'The armoured ram. Every phase comes faster than the last.',
  146: 'It coils, and the ring rocks like a swell.',
  147: 'It bears down: the ring drifts and the needle quickens together.',
  148: 'The breathing jaw. The window closes and opens as you watch.',
}

/** What changes at the rank you are about to attempt, in plain words. Built
 *  from the DIFF against the rank below so it can never go stale. */
export function vigilChanges(attemptingRank: number): string[] {
  const next = vigilScale(attemptingRank)
  if (!next) return []
  const prev = vigilScale(attemptingRank - 1)
  const out: string[] = []
  const extra = next.extraPhases - (prev?.extraPhases ?? 0)
  if (extra > 0) out.push(extra === 1 ? 'One more phase to hold.' : `${extra} more phases to hold.`)
  if (!prev) out.push('The landing window now closes with every phase.')
  else if (next.perfectShrinkStep > prev.perfectShrinkStep) out.push('The window closes faster.')
  if (next.perfectShrinkStart > (prev?.perfectShrinkStart ?? 0)) out.push('It starts tighter than before.')
  if (!prev || next.speedStepMult > prev.speedStepMult) out.push('The needle quickens harder each phase.')
  if (next.blackoutBonus > (prev?.blackoutBonus ?? 0)) out.push('The light fails more often.')
  return out
}

// ── State helpers ───────────────────────────────────────────────────────────

export function readVigil(raw: unknown): VigilState {
  if (!raw || typeof raw !== 'object') return {}
  const out: VigilState = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const e = v as { rank?: unknown; released?: unknown }
    const rank = Math.max(1, Math.min(VIGIL_MAX_RANK, Math.floor(Number(e.rank ?? 1)) || 1))
    out[k] = { rank, released: e.released === true }
  }
  return out
}

/** The Vigil a captain holds. Ranks are seeded from ancient_catches so the six
 *  they already landed count as rank 1 without a backfill — a giant on the
 *  wall with no vigil row IS rank 1, mounted. */
export function vigilFor(raw: unknown, ancientCatches: number[] | null | undefined): VigilState {
  const stored = readVigil(raw)
  const out: VigilState = { ...stored }
  for (const id of ancientCatches ?? []) {
    if (!out[String(id)]) out[String(id)] = { rank: 1, released: false }
  }
  return out
}

export function vigilEntry(state: VigilState, fishId: number): VigilEntry | null {
  return state[String(fishId)] ?? null
}

/** Sum of ranks — 6 with all six mounted at rank 1, 30 at the capstone.
 *  Mirrors the SQL vigil_total() used by the leaderboard. */
export function vigilTotal(state: VigilState): number {
  return Object.values(state).reduce((s, e) => s + Math.max(0, Math.min(VIGIL_MAX_RANK, e.rank)), 0)
}

/** Every giant at rank 5 — the ancient pet is owed. */
export function vigilComplete(state: VigilState): boolean {
  return ANCIENT_IDS.every(id => (state[String(id)]?.rank ?? 0) >= VIGIL_MAX_RANK)
}

/** Currently out in the water rather than on the wall. castLine's pool filter
 *  reads this: a giant is catchable if it was never caught OR is released. */
export function isReleased(state: VigilState, fishId: number): boolean {
  return state[String(fishId)]?.released === true
}

/** Roman numeral for the rank chrome. Only ever 1-5 here. */
export function vigilNumeral(rank: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(5, rank))] ?? ''
}

/** The frame a rank wears in the Giants room and the release ceremony. The
 *  giant's own art is the hero at every rank; this is what changes around it,
 *  so five distinct looks cost no new art.
 *
 *  Gold is deliberately TRANSLUCENT (house rule: no solid gold fills), and
 *  rank 5 lands on the established ancient crimson so the top of this ladder
 *  matches the rarity it belongs to. */
export const VIGIL_FRAME: Record<number, { label: string; accent: string; glow: string }> = {
  1: { label: 'Rope and driftwood', accent: '#5eead4', glow: 'rgba(94,234,212,0.22)' },
  2: { label: 'Iron banding',       accent: '#94a3b8', glow: 'rgba(148,163,184,0.24)' },
  3: { label: 'Verdigris brass',    accent: '#2dd4bf', glow: 'rgba(45,212,191,0.26)' },
  4: { label: 'Gilded',             accent: '#f0c040', glow: 'rgba(240,192,64,0.24)' },
  5: { label: 'Older than the fish', accent: '#e0455a', glow: 'rgba(224,69,90,0.30)' },
}
