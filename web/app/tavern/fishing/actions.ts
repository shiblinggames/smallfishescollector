'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_CASTS } from './constants'
import { getHook } from '@/lib/hooks'

function today() {
  return new Date().toISOString().split('T')[0]
}

// quality: perfect=20, catch=8, miss/penalty=0
const RESULT_QUALITY: Record<string, number> = {
  perfect: 20,
  catch: 8,
  miss: 0,
  penalty: 0,
}

export async function castLine(result: 'perfect' | 'catch' | 'miss' | 'penalty'): Promise<
  { earned: number; castsUsed: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const date = today()

  const { data: profile } = await admin
    .from('profiles')
    .select('hook_tier, doubloons, fishing_date, fishing_casts')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const isToday = profile.fishing_date === date
  const castsUsed = isToday ? (profile.fishing_casts ?? 0) : 0

  if (castsUsed >= MAX_CASTS) {
    return { error: 'No casts remaining today. Come back tomorrow.' }
  }

  const castsToConsume = result === 'penalty'
    ? Math.min(2, MAX_CASTS - castsUsed)
    : 1
  const newCastsUsed = castsUsed + castsToConsume

  const hookTier = profile.hook_tier ?? 0
  const multiplier = getHook(hookTier).multiplier
  const quality = RESULT_QUALITY[result] ?? 0
  const earned = quality > 0 ? Math.max(1, Math.floor(quality * multiplier)) : 0

  const profileUpdate: Record<string, unknown> = {
    fishing_date: date,
    fishing_casts: newCastsUsed,
  }
  if (earned > 0) profileUpdate.doubloons = (profile.doubloons ?? 0) + earned

  const updateProfile = admin.from('profiles').update(profileUpdate).eq('id', user.id)

  if (earned > 0) {
    await Promise.all([
      updateProfile,
      admin.from('doubloon_transactions').insert({
        user_id: user.id,
        amount: earned,
        reason: 'Fishing',
      }),
    ])
  } else {
    await updateProfile
  }

  return { earned, castsUsed: newCastsUsed }
}
