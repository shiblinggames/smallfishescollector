'use server'

// The Parlor's rank rewards are CLAIMED, not auto-paid. Points accumulate as you
// play the Board and the King; each rank your points have reached then waits in the
// lobby to be collected for its gems — one satisfying, one-tap deposit at a time
// (charting-style). `parlor_rank_gems_awarded` holds the running total of gems
// already claimed and is the server-side double-claim guard. Types + the pure
// claim math live in ./constants ('use server' files drop non-async exports).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { grant } from '@/lib/wallet'
import { nextClaimableParlorRank } from './constants'

export type ClaimParlorResult =
  | {
      ok: true
      title: string
      color: string
      gemsWon: number
      newGems: number
      newAwarded: number
      /** True when another reached-but-unclaimed rank is still waiting. */
      moreClaimable: boolean
    }
  | { error: string }

/** Collect the next unclaimed rank the player has reached. Pays exactly ONE rank's
 *  gems (the lowest reached-but-unpaid), advancing the awarded total to that rank's
 *  boundary so it can never pay twice — even if the Board and King both crossed it. */
export async function claimParlorRank(): Promise<ClaimParlorResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('parlor_points, parlor_rank_gems_awarded, gems')
    .eq('id', user.id).single()

  const points = (profile?.parlor_points as number | null) ?? 0
  const claimed = (profile?.parlor_rank_gems_awarded as number | null) ?? 0

  const next = nextClaimableParlorRank(points, claimed)
  if (!next) return { error: 'No rank to claim yet.' }

  const gemsWon = next.rank.gems
  const newAwarded = next.cumGems
  // Advance the claimed total FIRST, and only from the value we read. Two taps
  // fired together both reach here; only the one whose update comes back with
  // a row is paid.
  const claimQ = admin.from('profiles')
    .update({ parlor_rank_gems_awarded: newAwarded })
    .eq('id', user.id)
  const { data: moved } = await (profile?.parlor_rank_gems_awarded == null
    ? claimQ.is('parlor_rank_gems_awarded', null)
    : claimQ.eq('parlor_rank_gems_awarded', claimed)
  ).select('id')
  if (!moved || moved.length === 0) return { error: 'That rank was already collected.' }

  const newGems = await grant(admin, user.id, 'gems', gemsWon)
  await admin.from('gem_transactions').insert({ user_id: user.id, amount: gemsWon, reason: `The Parlor: ${next.rank.title}` })

  // Point-based Parlor badges (reconcile also covers these; grant now for the
  // immediate unlock the moment the matching rank is collected).
  if (points >= 85) grantBadgeDirect(user.id, 'parlor_cardsharp').catch(() => {})
  if (points >= 520) grantBadgeDirect(user.id, 'parlor_kingpin').catch(() => {})
  if (points >= 1000) grantBadgeDirect(user.id, 'parlor_legend').catch(() => {})

  const more = nextClaimableParlorRank(points, newAwarded)
  return {
    ok: true,
    title: next.rank.title,
    color: next.rank.color,
    gemsWon,
    newGems,
    newAwarded,
    moreClaimable: !!more,
  }
}

// First-visit Parlor guide dismissal (see components/LobbyGuide).
export async function markParlorGuideSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_parlor_guide: true }).eq('id', user.id)
}
