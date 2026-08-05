// Voyage timing — the ONE source of truth for how long a crew voyage takes, so
// the server (voyageActions: stamps duration_ms when a voyage is sent + gates the
// return) and the client (DailyVoyagePanel: shows the estimate + the countdown)
// can never drift apart. They used to each carry their own copy; halving the base
// only landed on the server, so the panel kept showing the old time.

import type { VoyageRoute } from './voyageRoutes'

/** PER-ROUTE base length, before Nav / expedition-level reductions.
 *
 *  Every route used to take the same three hours. That made every route below
 *  the deepest one you could sail into dead content the moment the next
 *  unlocked: Shroud pays ten times what Coastal does, so if they both take the
 *  same time there is never a reason to pick the shallow one. Length is what
 *  makes the shallow routes a real choice again, the same way it works for
 *  trawls, where a deep zone's bigger haul arrives on a longer clock.
 *
 *  The per-hour rate still climbs with depth (roughly 780/hr on Coastal against
 *  1,330/hr on Shroud at full reduction) and that is deliberate: unlike a
 *  trawl, a deep voyage can cost you a crew member permanently, so the risk
 *  should pay a premium. What the ladder removes is the cliff, not the incline. */
export const ROUTE_VOYAGE_MS: Record<VoyageRoute, number> = {
  coastal:   45 * 60 * 1000,   // 45m — a quick run you can fit around anything
  open:      90 * 60 * 1000,   // 1h 30m
  deep:     150 * 60 * 1000,   // 2h 30m
  triangle: 210 * 60 * 1000,   // 3h 30m
  shroud:   270 * 60 * 1000,   // 4h 30m — the long haul, and the richest
}

/** Fallback for legacy rows written before per-route lengths, and for any
 *  caller with no route to hand. Matches the old flat base. */
export const BASE_VOYAGE_MS = 3 * 60 * 60 * 1000

/** The most a fully-invested captain can shave off a route, as a FRACTION.
 *
 *  Proportional, not a flat number of minutes. The old reductions subtracted up
 *  to 90 minutes each for expedition level and crew Nav, which was fine against
 *  a flat three-hour base but would erase a 45-minute Coastal run outright. A
 *  percentage scales with whichever route was picked. */
const MAX_LEVEL_CUT = 0.20
const MAX_NAV_CUT   = 0.20

/** Effective voyage length for a route, cut by expedition level + total crew
 *  Nav, never below 60% of that route's base. (Swift Sails /
 *  gauntletVoyageSpeedMult is applied on top by the caller, since it lives in
 *  the upgrades layer.) */
export function computeVoyageDurationMs(
  expeditionLevel: number,
  totalNav: number,
  /** Omit only where no route is chosen yet; falls back to the legacy flat
   *  base, which is longer than three of the five routes, so an estimate shown
   *  without a route errs slow rather than promising a trip that is faster
   *  than it will be. */
  route?: VoyageRoute,
): number {
  const base = route ? ROUTE_VOYAGE_MS[route] : BASE_VOYAGE_MS
  const levelCut = MAX_LEVEL_CUT * Math.pow(Math.min(1, expeditionLevel / 100), 2)
  const navCut   = MAX_NAV_CUT   * Math.pow(Math.min(1, totalNav / 75), 2)
  return Math.round(base * (1 - Math.min(MAX_LEVEL_CUT + MAX_NAV_CUT, levelCut + navCut)))
}

/** Pretty length, e.g. "45m" or "2h 30m". */
export function fmtVoyageDuration(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  return m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`
}
