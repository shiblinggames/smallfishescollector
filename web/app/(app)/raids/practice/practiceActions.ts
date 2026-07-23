'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'

// The practice skirmish is a fixed tutorial: its enemies grant at most 45 XP /
// 35 gold per kill. Clamp each call to a hair above that so this endpoint — which
// never server-checks the "one-shot" flag its comment relies on, and so is
// infinitely replayable — can only ever hand out tutorial-scale scraps.
const PRACTICE_GRANT_MAX = 100

export async function awardPracticeKill(
  xpIn: number,
  doubloonsIn: number,
): Promise<{ newExpeditionXP: number; newDoubloonTotal: number; crewXP: CrewXPGrant[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newExpeditionXP: 0, newDoubloonTotal: 0, crewXP: [] }

  const xp        = Math.max(0, Math.min(Math.floor(Number(xpIn)        || 0), PRACTICE_GRANT_MAX))
  const doubloons = Math.max(0, Math.min(Math.floor(Number(doubloonsIn) || 0), PRACTICE_GRANT_MAX))

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('expedition_xp, doubloons')
    .eq('id', user.id)
    .single()

  const newExpeditionXP  = (profile?.expedition_xp ?? 0) + xp
  const newDoubloonTotal = (profile?.doubloons ?? 0) + doubloons

  const [, crewXP] = await Promise.all([
    admin.from('profiles').update({
      expedition_xp: newExpeditionXP,
      doubloons: newDoubloonTotal,
      has_seen_raid_tutorial: true,
      has_completed_practice_raid: true,
    }).eq('id', user.id),
    // Practice raid mirrors the player rule — crew earn the same XP per kill.
    // Tiny per-kill grant (PRACTICE_XP=25) and one-shot anyway (has_completed
    // flag gates re-entry) so it's not abusable.
    grantXPToAssignedCrew(admin, user.id, xp),
  ])

  return { newExpeditionXP, newDoubloonTotal, crewXP }
}
