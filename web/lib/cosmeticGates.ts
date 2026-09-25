// ── HOW AN EARNED COSMETIC IS EARNED ────────────────────────────────────────
//
// The standard set 2026-09-25 (Kong): every cosmetic has ONE route. The earned
// routes are a level step (Fishing or Navigation at 25 / 50 / 75 / 100) or a
// share of the achievement-point pool (25% / 50% / 75%). Boats are the most
// visible cosmetic and take the hardest steps, then skins, then borders.
// docs/systems/cosmetics-and-art.md has the whole table.
//
// ACHIEVEMENT GATES ARE A SHARE OF THE POOL, NOT A NUMBER. The old gates were
// absolute (350, 390, 420, 450) and every batch of new badges quietly made them
// easier; they had already drifted twice. The pool is summed from the badge
// registry here, so a gate moves with it and the hint always quotes today's
// number.
//
// Pure: imported by client pickers and server validation alike.

import { BADGES, badgePoints } from './badges'

export type CosmeticGate =
  | { kind: 'fishing'; level: number }
  | { kind: 'nav'; level: number }
  | { kind: 'ap'; share: number }

/** Every achievement point there is to earn. */
export const AP_POOL = BADGES.reduce((a, b) => a + badgePoints(b.id), 0)

/** The points a share of the pool comes to today. */
export function apNeeded(share: number): number {
  return Math.round(AP_POOL * share)
}

export type GateStats = { fishingLevel: number; navLevel: number; ap?: number | null }

/** Met, given the stats. An achievement gate with no score known is unmet: the
 *  caller has to go and fetch the score (it is derived and costs queries). */
export function gateMet(g: CosmeticGate, s: GateStats): boolean {
  if (g.kind === 'fishing') return s.fishingLevel >= g.level
  if (g.kind === 'nav') return s.navLevel >= g.level
  return s.ap != null && s.ap >= apNeeded(g.share)
}

/** What the locked swatch says. Plain and literal. */
export function gateHint(g: CosmeticGate): string {
  if (g.kind === 'fishing') return `Reach Fishing Level ${g.level}`
  if (g.kind === 'nav') return `Reach Navigation Level ${g.level}`
  return `Reach ${apNeeded(g.share).toLocaleString()} achievement points`
}

/** Short reason for the unlock banner: "Fishing Level 50". */
export function gateReason(g: CosmeticGate): string {
  if (g.kind === 'fishing') return `Fishing Level ${g.level}`
  if (g.kind === 'nav') return `Navigation Level ${g.level}`
  return `${apNeeded(g.share).toLocaleString()} achievement points`
}
