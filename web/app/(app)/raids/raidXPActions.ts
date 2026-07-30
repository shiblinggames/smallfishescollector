'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { navRenownEffects, type RenownAlloc } from '@/lib/renown'
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'
import { maxLegitKillGrant } from '@/lib/raidRegistry'
import { flagAnomaly } from '@/lib/anomaly'
import { countRaidKill } from '@/lib/runToken'
import { eyeCharge } from '@/lib/finnItems'

export async function awardRaidKill(
  xpIn: number,
  doubloonsIn: number,
  token?: string,
): Promise<{ newExpeditionXP: number; newDoubloonTotal: number; crewXP: CrewXPGrant[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newExpeditionXP: 0, newDoubloonTotal: 0, crewXP: [] }

  // Combat is client-side, so xp/doubloons arrive as hostile input. Clamp each to
  // the most a single honest kill-grant can be worth (boss kill + full-clear
  // bonus, headroom included) — a forged 750k call becomes one kill's worth. This
  // is what stopped the crew-XP inflation exploit.
  const cap = maxLegitKillGrant()
  const rawXp     = Math.max(0, Math.floor(Number(xpIn)        || 0))
  const rawGold   = Math.max(0, Math.floor(Number(doubloonsIn) || 0))
  const xp        = Math.min(rawXp,   cap.xp)
  const doubloons = Math.min(rawGold, cap.gold)

  const admin = createAdminClient()

  // A legit client never exceeds the legit ceiling, so a clamp = near-certain
  // forgery. Flag it for admin review (advisory only, doesn't change the outcome).
  if (rawXp > cap.xp || rawGold > cap.gold) {
    await flagAnomaly(admin, user.id, 'cap_trip:awardRaidKill', 3, { rawXp, rawGold, capXp: cap.xp, capGold: cap.gold })
  }

  // Run-token bound: the kill must fit its run's mob count (baked into the token
  // at raid start). A rejected kill = the call was replayed past the run's real
  // kills → grant nothing. No token (a raid started before this shipped, or the
  // client not yet wired) falls through tolerantly — silently, since this fires
  // per-kill and would otherwise flood the panel; the once-per-clear miss on
  // recordRaidClear is where we watch adoption.
  if (token && !(await countRaidKill(admin, user.id, token))) {
    await flagAnomaly(admin, user.id, 'run_token:awardRaidKill_reject', 2, { token, rawXp, rawGold })
    return { newExpeditionXP: 0, newDoubloonTotal: 0, crewXP: [] }
  }
  const { data: profile } = await admin
    .from('profiles')
    .select('expedition_xp, doubloons, ship_classes, nav_renown_alloc, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
    .eq('id', user.id)
    .single()

  // Ship-class doubloon multiplier (Helmsman + future picks). Applied
  // server-side so the client can't inflate it. XP isn't class-modified
  // (gunner doesn't earn more XP per fight, they just hit harder);
  // only the gold scales. Nav Renown (Plunder) stacks a tiny bit more gold,
  // and (Command) a tiny bit more crew XP — both identity when unallocated.
  const classPicks = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const navRenown = navRenownEffects(profile?.nav_renown_alloc as RenownAlloc | null)
  const doubloonMult = aggregateShipClasses(classPicks).doubloonMult * navRenown.doubloonMult
  const scaledDoubloons = Math.round(doubloons * doubloonMult)
  const crewXP_amount = Math.round(xp * navRenown.crewXpMult)

  const newExpeditionXP  = (profile?.expedition_xp ?? 0) + xp
  // Raid kills are Navigation XP, so they charge The Primeval Eye. Gate lives
  // in lib/finnItems so every nav source applies the same three conditions.
  const reelCharge = eyeCharge(profile as Parameters<typeof eyeCharge>[0], xp)
  const newDoubloonTotal = (profile?.doubloons ?? 0) + scaledDoubloons

  // Crew earn the per-kill XP the player just earned, nudged by nav Renown
  // (Command) only — ship classes still don't grow crew faster. Every alive,
  // assigned crew gets bumped via a single atomic RPC; level-up deltas come
  // back so the end-of-encounter overlay can flash crew level-ups.
  const [, crewXP] = await Promise.all([
    admin.from('profiles').update({
      expedition_xp: newExpeditionXP,
      ...(reelCharge !== null ? { anglers_patience_xp: reelCharge } : {}),
      doubloons: newDoubloonTotal,
    }).eq('id', user.id),
    grantXPToAssignedCrew(admin, user.id, crewXP_amount),
  ])

  return { newExpeditionXP, newDoubloonTotal, crewXP }
}
