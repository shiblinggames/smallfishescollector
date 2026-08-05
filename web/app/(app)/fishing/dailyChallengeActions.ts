'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveDailyChallenges, getTodayUTC, DAILY_SWEEP_GEMS, type DailyChallengeState } from '@/lib/dailyChallenges'
import { getLevelFromXP } from '@/lib/fishingLevel'

// Get-or-create the snapshot of the player's fishing level for the day.
// The challenges they're served depend on which zones they have unlocked
// — snapshotting locks today's set so leveling up across a zone boundary
// (e.g. 14 → 15, unlocking Open Waters) doesn't swap a challenge out
// from under their in-progress count.
async function resolveSnapshotLevel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  date: string,
  currentLevel: number,
): Promise<number> {
  const { data: row } = await admin
    .from('daily_challenge_progress')
    .select('fishing_level_snapshot')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()
  if (row?.fishing_level_snapshot != null) return row.fishing_level_snapshot
  // First touch today (or legacy row with NULL snapshot) — pin the
  // current level so subsequent reads stay stable.
  await admin
    .from('daily_challenge_progress')
    .upsert(
      { user_id: userId, date, fishing_level_snapshot: currentLevel },
      { onConflict: 'user_id,date' },
    )
  return currentLevel
}

export async function getDailyChallenge(): Promise<DailyChallengeState | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const date = getTodayUTC()
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles').select('fishing_xp').eq('id', user.id).single()
  const currentLevel = getLevelFromXP(profile?.fishing_xp ?? 0)
  const snapLevel = await resolveSnapshotLevel(admin, user.id, date, currentLevel)
  const challenges = await getEffectiveDailyChallenges(date, admin, snapLevel)

  const { data: row } = await admin
    .from('daily_challenge_progress')
    .select('p1, p2, p3, claimed_1, claimed_2, claimed_3, claimed_bonus')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  return {
    date,
    challenges,
    progress: [row?.p1 ?? 0, row?.p2 ?? 0, row?.p3 ?? 0],
    claimed: [row?.claimed_1 ?? false, row?.claimed_2 ?? false, row?.claimed_3 ?? false],
    sweepClaimed: row?.claimed_bonus ?? false,
  }
}

export async function claimDailyReward(
  index: 0 | 1 | 2,
): Promise<{ doubloons: number; sweepGems: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const date = getTodayUTC()
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles').select('fishing_xp, doubloons').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const currentLevel = getLevelFromXP(profile.fishing_xp ?? 0)
  const snapLevel = await resolveSnapshotLevel(admin, user.id, date, currentLevel)
  const challenges = await getEffectiveDailyChallenges(date, admin, snapLevel)
  const challenge = challenges[index]

  const { data: row } = await admin
    .from('daily_challenge_progress')
    .select('p1, p2, p3, claimed_1, claimed_2, claimed_3, claimed_bonus')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  const progress = [row?.p1 ?? 0, row?.p2 ?? 0, row?.p3 ?? 0]
  const claimed = [row?.claimed_1 ?? false, row?.claimed_2 ?? false, row?.claimed_3 ?? false]

  if (progress[index] < challenge.target) return { error: 'Challenge not complete' }
  if (claimed[index]) return { error: 'Already claimed' }

  const claimKey = `claimed_${index + 1}` as 'claimed_1' | 'claimed_2' | 'claimed_3'

  // Atomic claim: flip this index's flag in one guarded update (matching
  // not-yet-true, i.e. false OR null). Only the winner of a concurrent
  // double-fire gets a row back, so the reward is granted exactly once — the
  // old read-check-then-write let two parallel calls both pass and pay twice.
  const { data: claimedRow } = await admin
    .from('daily_challenge_progress')
    .update({ [claimKey]: true })
    .eq('user_id', user.id)
    .eq('date', date)
    .not(claimKey, 'is', true)
    .select('user_id')
    .maybeSingle()
  if (!claimedRow) return { error: 'Already claimed' }

  const newDoubloons = (profile.doubloons ?? 0) + challenge.reward

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: challenge.reward,
      reason: `Daily challenge (${challenge.label})`,
    }),
  ])

  // ── The sweep bonus ───────────────────────────────────────────────────────
  // `claimed` was read BEFORE the flip above, so "the other two were already
  // in" plus "this one just landed" means all three are now claimed.
  //
  // Guarded exactly like the individual claim: flip claimed_bonus only where
  // it is not already true, and pay only if this call is the one that won. Two
  // tabs racing to claim the third challenge can both reach here.
  let sweepGems = 0
  const othersAlreadyIn = claimed.every((c, i) => i === index || c)
  if (othersAlreadyIn && !row?.claimed_bonus) {
    const { data: sweptRow } = await admin
      .from('daily_challenge_progress')
      .update({ claimed_bonus: true })
      .eq('user_id', user.id)
      .eq('date', date)
      .not('claimed_bonus', 'is', true)
      .select('user_id')
      .maybeSingle()
    if (sweptRow) {
      sweepGems = DAILY_SWEEP_GEMS
      // Atomic bumps rather than read-add-write: the gem balance is shared
      // with chest opens and casino payouts, so an absolute overwrite here
      // could stomp a concurrent grant.
      await admin.rpc('bump_profile_stat', { uid: user.id, col: 'gems', n: DAILY_SWEEP_GEMS })
      // Lifetime swept days, for the sweep badges. Fire and forget: a failed
      // counter must never cost the player the gems they just earned.
      void admin.rpc('bump_profile_stat', { uid: user.id, col: 'daily_challenge_sweeps', n: 1 })
        .then(() => {}, () => {})
    }
  }

  return { doubloons: newDoubloons, sweepGems }
}
