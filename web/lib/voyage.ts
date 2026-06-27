// Voyage timing — the ONE source of truth for how long a crew voyage takes, so
// the server (voyageActions: stamps duration_ms when a voyage is sent + gates the
// return) and the client (DailyVoyagePanel: shows the estimate + the countdown)
// can never drift apart. They used to each carry their own copy; halving the base
// only landed on the server, so the panel kept showing the old time.

/** Baseline voyage length before Nav / expedition-level reductions. Halved from
 *  6h to 3h (2026-06). Change it HERE and both surfaces follow. */
export const BASE_VOYAGE_MS = 3 * 60 * 60 * 1000

/** Effective voyage length: the base, cut by expedition level + total Nav, never
 *  shorter than half the base. (Swift Sails / gauntletVoyageSpeedMult is applied
 *  on top by the caller, since it lives in the upgrades layer.) */
export function computeVoyageDurationMs(expeditionLevel: number, totalNav: number): number {
  const levelReductionMs = 90 * Math.pow(expeditionLevel / 100, 2) * 60 * 1000
  const navReductionMs = Math.min(90 * 60 * 1000, 90 * Math.pow(totalNav / 75, 2) * 60 * 1000)
  return Math.max(BASE_VOYAGE_MS * 0.5, BASE_VOYAGE_MS - levelReductionMs - navReductionMs)
}
