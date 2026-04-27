'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAchievements } from '@/lib/checkAchievements'

const DAILY_BONUS = 50
const PREMIUM_DAILY_BONUS = 100

export async function claimDailyBonus(): Promise<{ claimed: boolean; gems?: number; newAchievements?: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles')
    .select('gems, last_daily_claim, is_premium, premium_expires_at')
    .eq('id', user.id)
    .single()

  if (!profile || profile.last_daily_claim === today) return { claimed: false }

  const isPremium = !!profile.is_premium &&
    !!profile.premium_expires_at &&
    new Date(profile.premium_expires_at) > new Date()

  const bonus = isPremium ? PREMIUM_DAILY_BONUS : DAILY_BONUS
  const newGems = (profile.gems ?? 0) + bonus

  await Promise.all([
    admin.from('profiles').update({ gems: newGems, last_daily_claim: today }).eq('id', user.id),
    admin.from('gem_transactions').insert({
      user_id: user.id,
      amount: bonus,
      reason: isPremium ? 'Daily login bonus (Premium)' : 'Daily login bonus',
    }),
  ])

  const newAchievements = await checkAchievements(user.id, { type: 'bonus' })

  return { claimed: true, gems: newGems, newAchievements }
}
