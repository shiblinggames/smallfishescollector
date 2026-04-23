'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DAILY_BONUS = 50
const PREMIUM_DAILY_BONUS = 100

export async function claimDailyBonus(): Promise<{ claimed: boolean; doubloons?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, last_daily_claim, packs_available, is_premium, premium_expires_at')
    .eq('id', user.id)
    .single()

  if (!profile || profile.last_daily_claim === today) return { claimed: false }

  const isPremium = !!profile.is_premium &&
    !!profile.premium_expires_at &&
    new Date(profile.premium_expires_at) > new Date()

  const bonus = isPremium ? PREMIUM_DAILY_BONUS : DAILY_BONUS
  const newDoubloons = (profile.doubloons ?? 0) + bonus

  const updates: Record<string, unknown> = {
    doubloons: newDoubloons,
    last_daily_claim: today,
  }
  if (isPremium) {
    updates.packs_available = (profile.packs_available ?? 0) + 1
  }

  await Promise.all([
    admin.from('profiles').update(updates).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: bonus,
      reason: isPremium ? 'Daily login bonus (Premium)' : 'Daily login bonus',
    }),
  ])

  return { claimed: true, doubloons: newDoubloons }
}
