'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'
import { flagAnomaly } from '@/lib/anomaly'
import { issueRunToken, consumeRunToken } from '@/lib/runToken'
import { PRACTICE_KILL_REWARDS } from '@/lib/practiceRewards'
import { grant } from '@/lib/wallet'

// The practice skirmish is the OLD tutorial, admin-only at the page (see
// practice/page.tsx). Its reward endpoint was not: it took xp and gold from the
// request, clamped to 100 each, and any captain could call it forever.
//
// Now a fight mints a one-shot token naming its enemy, the kill consumes it,
// and the reward is that enemy's line in PRACTICE_KILL_REWARDS. Both ends are
// admin-only, matching the page they serve.

async function adminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  return me?.is_admin === true ? { user, admin } : null
}

/** Mint the token for one practice fight against `enemyId`. */
export async function startPracticeRun(enemyId: string): Promise<{ token: string | null }> {
  if (!PRACTICE_KILL_REWARDS[enemyId]) return { token: null }
  const ctx = await adminUser()
  if (!ctx) return { token: null }
  const token = await issueRunToken(ctx.admin, ctx.user.id, 'practice', { enemyId })
  return { token }
}

export async function awardPracticeKill(
  token: string | null | undefined,
): Promise<{ newExpeditionXP: number; newDoubloonTotal: number; crewXP: CrewXPGrant[] }> {
  const nothing = { newExpeditionXP: 0, newDoubloonTotal: 0, crewXP: [] as CrewXPGrant[] }
  const ctx = await adminUser()
  if (!ctx) return nothing
  const { user, admin } = ctx

  // One kill per token. A replay or a concurrent twin finds it spent.
  const spent = await consumeRunToken(admin, user.id, 'practice', token)
  const reward = PRACTICE_KILL_REWARDS[(spent?.meta as { enemyId?: string } | null)?.enemyId ?? '']
  if (!spent || !reward) {
    await flagAnomaly(admin, user.id, 'run_token:awardPracticeKill_reject', 2, { hasToken: !!token })
    return nothing
  }
  const xp = reward.xp
  const doubloons = reward.gold

  const { data: profile } = await admin
    .from('profiles')
    .select('expedition_xp')
    .eq('id', user.id)
    .single()

  // DELIBERATELY does not charge The Primeval Eye, unlike every other source of
  // Navigation XP (raid kills, voyages, the Gauntlet, puzzle nodes, fork routes).
  // The skirmish is a free sandbox with no repair risk and no cooldown, so
  // charging here would be a grindable loop that costs nothing to run.
  const newExpeditionXP = (profile?.expedition_xp ?? 0) + xp

  const [newDoubloonTotal, , crewXP] = await Promise.all([
    grant(admin, user.id, 'doubloons', doubloons),
    Promise.all([
      admin.rpc('bump_profile_stat', { uid: user.id, col: 'expedition_xp', n: xp }),
      admin.from('profiles').update({
        has_seen_raid_tutorial: true,
        has_completed_practice_raid: true,
      }).eq('id', user.id),
    ]),
    // Practice raid mirrors the player rule: crew earn the same XP per kill.
    grantXPToAssignedCrew(admin, user.id, xp),
  ])

  return { newExpeditionXP, newDoubloonTotal, crewXP }
}
