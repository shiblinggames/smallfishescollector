// The "earned on" stamps for badges, with no database in it: shared by the web's
// badge grants (lib/badgeGrant) and the offline core.

import { clockNow } from './clock'

/** Add "earned now" stamps for newly granted badges, preserving every stamp
 *  already there -- including the NULLs that mean "before the log was kept".
 *
 *  Shared on purpose: badges are written from three places (this,
 *  reconcileBadges, and the locked-down unlockBadge action), and a stamp some
 *  paths forget is worse than no stamp at all -- the dates would be silently
 *  incomplete rather than visibly absent. */
export function stampBadges(existing: unknown, newlyEarned: string[]): Record<string, string | null> {
  const map: Record<string, string | null> =
    existing && typeof existing === 'object' ? { ...(existing as Record<string, string | null>) } : {}
  const now = new Date(clockNow()).toISOString()
  for (const id of newlyEarned) {
    // Never overwrite. The FIRST time you earned it is the answer, and a
    // re-grant must not quietly re-date a trophy.
    if (!(id in map)) map[id] = now
  }
  return map
}
