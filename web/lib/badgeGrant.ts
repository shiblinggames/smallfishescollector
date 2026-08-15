import { createAdminClient } from '@/lib/supabase/admin'
import { BADGE_MAP } from '@/lib/badges'

// Trusted, server-only badge grant. The CALLER is responsible for having
// established the earn condition (it's invoked at the moment a server action
// verifies the milestone). It is a plain lib function — NOT a 'use server'
// export — so it is never reachable over HTTP; only server code can call it.
//
// This exists so the exported `unlockBadge` server action can be locked down to
// the handful of raid combat-feat badges the CLIENT legitimately earns, while
// every other badge (the high-value ones — zone_legend, deep_pockets,
// fleet_admiral, master_angler, prestige, gauntlet, tavern…) is granted ONLY
// through this trusted path and can't be forged by a crafted API call.
export async function grantBadgeDirect(userId: string, badgeId: string): Promise<void> {
  if (!userId || !BADGE_MAP[badgeId]) return
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('unlocked_badges, badge_unlocked_at')
    .eq('id', userId)
    .single()
  if (!profile) return
  const current = (profile.unlocked_badges as string[] | null) ?? []
  if (current.includes(badgeId)) return
  await admin
    .from('profiles')
    .update({
      unlocked_badges: [...current, badgeId],
      badge_unlocked_at: stampBadges((profile as { badge_unlocked_at?: unknown }).badge_unlocked_at, [badgeId]),
    })
    .eq('id', userId)
}

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
  const now = new Date().toISOString()
  for (const id of newlyEarned) {
    // Never overwrite. The FIRST time you earned it is the answer, and a
    // re-grant must not quietly re-date a trophy.
    if (!(id in map)) map[id] = now
  }
  return map
}
