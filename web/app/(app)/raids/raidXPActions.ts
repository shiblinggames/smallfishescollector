'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'

export async function awardRaidKill(
  xp: number,
  doubloons: number,
): Promise<{ newExpeditionXP: number; newDoubloonTotal: number; crewXP: CrewXPGrant[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newExpeditionXP: 0, newDoubloonTotal: 0, crewXP: [] }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('expedition_xp, doubloons, ship_classes')
    .eq('id', user.id)
    .single()

  // Ship-class doubloon multiplier (Helmsman + future picks). Applied
  // server-side so the client can't inflate it. XP isn't class-modified
  // (gunner doesn't earn more XP per fight, they just hit harder);
  // only the gold scales.
  const classPicks = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const doubloonMult = aggregateShipClasses(classPicks).doubloonMult
  const scaledDoubloons = Math.round(doubloons * doubloonMult)

  const newExpeditionXP  = (profile?.expedition_xp ?? 0) + xp
  const newDoubloonTotal = (profile?.doubloons ?? 0) + scaledDoubloons

  // Crew earn the SAME per-kill XP the player just earned (no nav multiplier —
  // gunner-buffed captains don't grow crew faster). Every alive, assigned
  // crew gets bumped via a single atomic RPC; level-up deltas come back so
  // the end-of-encounter overlay can flash crew level-ups.
  const [, crewXP] = await Promise.all([
    admin.from('profiles').update({
      expedition_xp: newExpeditionXP,
      doubloons: newDoubloonTotal,
    }).eq('id', user.id),
    grantXPToAssignedCrew(admin, user.id, xp),
  ])

  return { newExpeditionXP, newDoubloonTotal, crewXP }
}
