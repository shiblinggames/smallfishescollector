'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DAILY_BONUS = 50

export async function claimDailyBonus(): Promise<{ claimed: boolean; doubloons?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, last_daily_claim')
    .eq('id', user.id)
    .single()

  if (!profile || profile.last_daily_claim === today) return { claimed: false }

  const newDoubloons = (profile.doubloons ?? 0) + DAILY_BONUS

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons, last_daily_claim: today }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: DAILY_BONUS,
      reason: 'Daily login bonus',
    }),
  ])

  return { claimed: true, doubloons: newDoubloons }
}
