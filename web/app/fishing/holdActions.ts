'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FISH_HOLD_TIERS, getFishHold } from '@/lib/fishHold'

export async function upgradeFishHold(): Promise<
  { ok: true; newTier: number; doubloons: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, fish_hold_tier')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const currentTier = profile.fish_hold_tier ?? 0
  const maxTier = FISH_HOLD_TIERS.length - 1
  if (currentTier >= maxTier) return { error: 'Fish hold is already at max tier' }

  const next = getFishHold(currentTier + 1)
  if ((profile.doubloons ?? 0) < next.cost) return { error: 'Not enough doubloons' }

  const newDoubloons = (profile.doubloons ?? 0) - next.cost
  const newTier = currentTier + 1

  await Promise.all([
    admin.from('profiles').update({ fish_hold_tier: newTier, doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: -next.cost, reason: `Upgraded fish hold to ${next.name}` }),
  ])

  return { ok: true, newTier, doubloons: newDoubloons }
}
