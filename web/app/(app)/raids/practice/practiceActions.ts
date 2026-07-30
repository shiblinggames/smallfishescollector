'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'
import { flagAnomaly } from '@/lib/anomaly'

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

  const rawXp     = Math.max(0, Math.floor(Number(xpIn)        || 0))
  const rawGold   = Math.max(0, Math.floor(Number(doubloonsIn) || 0))
  const xp        = Math.min(rawXp,   PRACTICE_GRANT_MAX)
  const doubloons = Math.min(rawGold, PRACTICE_GRANT_MAX)

  const admin = createAdminClient()

  // Tutorial grants are tiny; anything over the cap is a forged call. Flag it.
  if (rawXp > PRACTICE_GRANT_MAX || rawGold > PRACTICE_GRANT_MAX) {
    await flagAnomaly(admin, user.id, 'cap_trip:awardPracticeKill', 3, { rawXp, rawGold, cap: PRACTICE_GRANT_MAX })
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('expedition_xp, doubloons')
    .eq('id', user.id)
    .single()

  // DELIBERATELY does not charge The Primeval Eye, unlike every other source of
  // Navigation XP (raid kills, voyages, the Gauntlet, puzzle nodes, fork routes).
  // The skirmish is a free sandbox with no repair risk and no cooldown, so
  // charging here would be a grindable loop that costs nothing to run.
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
