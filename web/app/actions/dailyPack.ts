'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'

const DAILY_MEMBER_GEMS = 100

export async function claimDailyPack(): Promise<{ claimed: boolean; gems?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles')
    .select('gems, last_pack_claim, is_premium, premium_expires_at')
    .eq('id', user.id)
    .single()

  if (!profile) return { claimed: false }

  if (!isPremiumActive(profile)) return { claimed: false }
  if (profile.last_pack_claim === today) return { claimed: false }

  const newGems = (profile.gems ?? 0) + DAILY_MEMBER_GEMS

  await admin.from('profiles').update({ gems: newGems, last_pack_claim: today }).eq('id', user.id)

  return { claimed: true, gems: newGems }
}
