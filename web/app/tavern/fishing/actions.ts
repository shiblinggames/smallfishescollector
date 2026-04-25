'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEPTHS } from './depths'
import { getHook } from '@/lib/hooks'
import { checkAchievements } from '@/lib/checkAchievements'

function today() {
  return new Date().toISOString().split('T')[0]
}

export async function castLine(
  result: 'perfect' | 'catch' | 'miss' | 'penalty',
  depthId: number,
): Promise<{ earned: number; castsUsed: number; newAchievements: string[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const date  = today()

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, fishing_date, fishing_casts, fishing_abyss_streak, hook_tier')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const maxCasts  = getHook(profile.hook_tier ?? 0).maxCasts
  const isToday   = profile.fishing_date === date
  const castsUsed = isToday ? (profile.fishing_casts ?? 0) : 0

  if (castsUsed >= maxCasts) {
    return { error: 'No casts remaining today. Come back tomorrow.' }
  }

  const depth  = DEPTHS[Math.max(0, Math.min(3, Math.round(depthId)))]
  const earned =
    result === 'perfect' ? depth.perfectEarns :
    result === 'catch'   ? depth.catchEarns   : 0

  const castsToConsume = result === 'penalty' ? Math.min(2, maxCasts - castsUsed) : 1
  const newCastsUsed   = castsUsed + castsToConsume

  const isAbyssPerfect = result === 'perfect' && depthId === 3
  const newAbyssStreak = isAbyssPerfect ? (profile.fishing_abyss_streak ?? 0) + 1 : 0

  const profileUpdate: Record<string, unknown> = {
    fishing_date:         date,
    fishing_casts:        newCastsUsed,
    fishing_abyss_streak: newAbyssStreak,
  }
  if (earned > 0) profileUpdate.doubloons = (profile.doubloons ?? 0) + earned

  const updateProfile = admin.from('profiles').update(profileUpdate).eq('id', user.id)
  if (earned > 0) {
    await Promise.all([
      updateProfile,
      admin.from('doubloon_transactions').insert({
        user_id: user.id,
        amount:  earned,
        reason:  'Fishing',
      }),
    ])
  } else {
    await updateProfile
  }

  const newAchievements = await checkAchievements(user.id, {
    type:        'fishing',
    result,
    depthId,
    abyssStreak: newAbyssStreak,
  })

  return { earned, castsUsed: newCastsUsed, newAchievements }
}
