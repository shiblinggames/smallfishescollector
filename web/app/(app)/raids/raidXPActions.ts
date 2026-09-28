'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RenownAlloc } from '@/lib/renown'
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'
import { getRaidConfigById } from '@/lib/raidRegistry'
import { raidKillReward } from '@/lib/raidRules'
import { raidData } from '@/lib/data/raidData'
import { flagAnomaly } from '@/lib/anomaly'
import { claimRaidRound } from '@/lib/runToken'
import { eyeCharge } from '@/lib/finnItems'
import { grant } from '@/lib/wallet'

const NOTHING = { newExpeditionXP: 0, newDoubloonTotal: 0, crewXP: [] as CrewXPGrant[] }

/**
 * Pay one raid kill. THE SERVER NAMES THE PRICE.
 *
 * This used to take xp and doubloons from the request and clamp them to a
 * whole raid's kill total times one and a half, and a call with no token paid
 * too. A forged call was worth a raid in one request, as often as it liked.
 *
 * Now the client says only WHICH round fell (0-based; the round equal to the
 * sequence length is the boss). The reward is read from the token's own raid
 * config, the same killRewards line the client shows, and the boss round adds
 * the full-clear bonus exactly as the client did. Each round of a run pays
 * once (run_tokens.paid_rounds), so a run pays what its mobs are worth and not
 * a coin more. No token, no pay.
 */
export async function awardRaidKill(
  round: number,
  token?: string | null,
): Promise<{ newExpeditionXP: number; newDoubloonTotal: number; crewXP: CrewXPGrant[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NOTHING

  const admin = createAdminClient()
  const r = Number(round)
  if (!token || !Number.isInteger(r) || r < 0) {
    await flagAnomaly(admin, user.id, 'run_token:awardRaidKill_missing', 2, { round, hasToken: !!token })
    return NOTHING
  }

  // Resolve the round against the token's raid BEFORE marking it paid, so a
  // round past the end of the raid is refused without burning anything.
  const db = raidData(admin)
  const raidId = ((await db.runTokenMeta(user.id, 'raid', token)) as { raidId?: string } | null)?.raidId
  const config = raidId ? getRaidConfigById(raidId) : undefined
  if (!config || r > config.sequence.length) {
    await flagAnomaly(admin, user.id, 'run_token:awardRaidKill_badRound', 3, { round: r, raidId: raidId ?? null })
    return NOTHING
  }

  // One pay per round per run. A replay, a concurrent twin or a spent token
  // gets nothing.
  if (!(await claimRaidRound(admin, user.id, token, r))) {
    await flagAnomaly(admin, user.id, 'run_token:awardRaidKill_reject', 2, { token, round: r })
    return NOTHING
  }

  const profile = await db.profile(user.id, 'expedition_xp, ship_classes, nav_renown_alloc, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')

  // What the round pays is lib/raidRules raidKillReward: the config's own
  // killRewards line (plus the full-clear bonus on the boss), gold scaled by
  // ship classes and Nav Renown (Plunder), crew XP by Renown (Command). The
  // round was bounds-checked above, so a reward always comes back.
  const pay = raidKillReward(config, r, profile?.ship_classes as Record<string, string> | null, profile?.nav_renown_alloc as RenownAlloc | null)!
  const xp = pay.xp
  const scaledDoubloons = pay.doubloons
  const crewXP_amount = pay.crewXp

  const newExpeditionXP  = (profile?.expedition_xp ?? 0) + xp
  // Raid kills are Navigation XP, so they charge The Primeval Eye. Gate lives
  // in lib/finnItems so every nav source applies the same three conditions.
  const reelCharge = eyeCharge(profile as Parameters<typeof eyeCharge>[0], xp)

  // Crew earn the per-kill XP the player just earned, nudged by nav Renown
  // (Command) only — ship classes still don't grow crew faster. Every alive,
  // assigned crew gets bumped via a single atomic RPC; level-up deltas come
  // back so the end-of-encounter overlay can flash crew level-ups.
  // Gold and Nav XP move in place; a stale read here must not write back over
  // a purchase that landed meanwhile.
  const [newDoubloonTotal, , crewXP] = await Promise.all([
    grant(admin, user.id, 'doubloons', scaledDoubloons),
    Promise.all([
      xp > 0 ? db.bumpStat(user.id, 'expedition_xp', xp) : null,
      reelCharge !== null ? db.updateProfile(user.id, { anglers_patience_xp: reelCharge }) : null,
    ]),
    grantXPToAssignedCrew(admin, user.id, crewXP_amount),
  ])

  return { newExpeditionXP, newDoubloonTotal, crewXP }
}
