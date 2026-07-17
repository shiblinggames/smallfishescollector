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
    .select('unlocked_badges')
    .eq('id', userId)
    .single()
  if (!profile) return
  const current = (profile.unlocked_badges as string[] | null) ?? []
  if (current.includes(badgeId)) return
  await admin
    .from('profiles')
    .update({ unlocked_badges: [...current, badgeId] })
    .eq('id', userId)
}
