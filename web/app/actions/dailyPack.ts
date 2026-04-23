'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function claimDailyPack(): Promise<{ claimed: boolean; packsAvailable?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles')
    .select('packs_available, last_pack_claim, is_premium, premium_expires_at')
    .eq('id', user.id)
    .single()

  if (!profile) return { claimed: false }

  const isPremium = !!profile.is_premium &&
    !!profile.premium_expires_at &&
    new Date(profile.premium_expires_at) > new Date()

  if (!isPremium) return { claimed: false }
  if (profile.last_pack_claim === today) return { claimed: false }

  const newPacks = (profile.packs_available ?? 0) + 1

  await admin.from('profiles').update({ packs_available: newPacks, last_pack_claim: today }).eq('id', user.id)

  return { claimed: true, packsAvailable: newPacks }
}
