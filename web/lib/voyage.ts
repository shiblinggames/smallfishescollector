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
 *  The per-hour rate still climbs with depth and that is deliberate: unlike a
 *  trawl, a deep voyage can cost you a crew member permanently, so the risk
 *  should pay a premium. What the ladder removes is the cliff, not the incline.
 *
 *  Lengthened roughly 2x at the base (2026-08-05), and about 3x in practice
 *  once the shorter reductions, the higher floor and the weaker Swift Sails are
 *  counted. Payouts were scaled by the same factor per route, so the per-hour
 *  economics are unchanged: these are fewer, bigger check-ins, not a nerf.
 *  Shroud is now deliberately an overnight. */
export const ROUTE_VOYAGE_MS: Record<VoyageRoute, number> = {
  coastal:   90 * 60 * 1000,   // 1h 30m — a run you can fit around an evening
  open:     180 * 60 * 1000,   // 3h
  deep:     270 * 60 * 1000,   // 4h 30m
  triangle: 390 * 60 * 1000,   // 6h 30m
  shroud:   540 * 60 * 1000,   // 9h — set it before bed, collect in the morning
}

/** Fallback for legacy rows written before per-route lengths, and for any
 *  caller with no route to hand. Matches the old flat base. */
export const BASE_VOYAGE_MS = 3 * 60 * 60 * 1000

/** The most a fully-invested captain can shave off a route, as a FRACTION.
 *
 *  Proportional, not a flat number of minutes. The reductions before this
 *  subtracted up to 90 minutes each for expedition level and crew Nav, which
 *  was fine against a flat three-hour base but would erase a short route
 *  outright. A percentage scales with whichever route was picked.
 *
 *  Cut from 20% each to 10% each (2026-08-05) as part of lengthening voyages.
 *  A fully invested captain could take 40% off before Swift Sails, which meant
 *  the route lengths on the tin were closer to a suggestion than a number. */
const MAX_LEVEL_CUT = 0.10
const MAX_NAV_CUT   = 0.10

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
  // Floor raised from 60% to 80% of base alongside the shorter cuts, so the
  // published route length stays close to what a voyage actually takes.
  return Math.round(base * Math.max(0.80, 1 - (levelCut + navCut)))
}

/** Pretty length, e.g. "45m" or "2h 30m". */
export function fmtVoyageDuration(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  return m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`
}
