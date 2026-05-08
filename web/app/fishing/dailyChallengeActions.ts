'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveDailyChallenges, getTodayUTC, type DailyChallengeState } from '@/lib/dailyChallenges'

export async function getDailyChallenge(): Promise<DailyChallengeState | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const date = getTodayUTC()
  const admin = createAdminClient()
  const challenges = await getEffectiveDailyChallenges(date, admin)

  const { data: row } = await admin
    .from('daily_challenge_progress')
    .select('p1, p2, p3, claimed_1, claimed_2, claimed_3')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  return {
    date,
    challenges,
    progress: [row?.p1 ?? 0, row?.p2 ?? 0, row?.p3 ?? 0],
    claimed: [row?.claimed_1 ?? false, row?.claimed_2 ?? false, row?.claimed_3 ?? false],
  }
}

export async function claimDailyReward(
  index: 0 | 1 | 2,
): Promise<{ doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const date = getTodayUTC()
  const admin = createAdminClient()
  const challenges = await getEffectiveDailyChallenges(date, admin)
  const challenge = challenges[index]

  const { data: row } = await admin
    .from('daily_challenge_progress')
    .select('p1, p2, p3, claimed_1, claimed_2, claimed_3')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  const progress = [row?.p1 ?? 0, row?.p2 ?? 0, row?.p3 ?? 0]
  const claimed = [row?.claimed_1 ?? false, row?.claimed_2 ?? false, row?.claimed_3 ?? false]

  if (progress[index] < challenge.target) return { error: 'Challenge not complete' }
  if (claimed[index]) return { error: 'Already claimed' }

  const claimKey = `claimed_${index + 1}` as 'claimed_1' | 'claimed_2' | 'claimed_3'

  const { data: profile } = await admin
    .from('profiles').select('doubloons').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }

  const newDoubloons = (profile.doubloons ?? 0) + challenge.reward

  await Promise.all([
    admin.from('daily_challenge_progress')
      .upsert({ user_id: user.id, date, [claimKey]: true }, { onConflict: 'user_id,date' }),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: challenge.reward,
      reason: `Daily challenge (${challenge.label})`,
    }),
  ])

  return { doubloons: newDoubloons }
}
