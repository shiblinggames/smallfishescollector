'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAchievements } from '@/lib/checkAchievements'
import { isPremiumActive } from '@/lib/premium'

const DAILY_BONUS = 50
const PREMIUM_DAILY_BONUS = 100
const DAILY_WORMS = 20

export async function claimDailyBonus(): Promise<{ claimed: boolean; gems?: number; newAchievements?: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles').select('gems, last_daily_claim, is_premium, premium_expires_at').eq('id', user.id).single()

  if (!profile || profile.last_daily_claim === today) return { claimed: false }

  const isPremium = isPremiumActive(profile)

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

export async function claimDailyWorms(): Promise<{ claimed: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: profile }, { data: existingBait }] = await Promise.all([
    admin.from('profiles').select('last_worm_claim').eq('id', user.id).single(),
    admin.from('bait_inventory').select('quantity').eq('user_id', user.id).eq('bait_type', 'worm').maybeSingle(),
  ])

  if (!profile || profile.last_worm_claim === today) return { claimed: false }

  const newQty = (existingBait?.quantity ?? 0) + DAILY_WORMS

  await Promise.all([
    admin.from('profiles').update({ last_worm_claim: today }).eq('id', user.id),
    existingBait
      ? admin.from('bait_inventory').update({ quantity: newQty }).eq('user_id', user.id).eq('bait_type', 'worm')
      : admin.from('bait_inventory').insert({ user_id: user.id, bait_type: 'worm', quantity: newQty }),
  ])

  return { claimed: true }
}
