'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SHIPS } from '@/lib/ships'
import { revalidatePath } from 'next/cache'

export async function buyShip(): Promise<{ shipTier: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, doubloons')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const currentTier = profile.ship_tier ?? 0
  const nextTier = currentTier + 1

  if (nextTier >= SHIPS.length) return { error: 'Already at max tier' }

  const cost = SHIPS[nextTier].cost
  if (profile.doubloons < cost) return { error: 'Not enough doubloons' }

  const newDoubloons = profile.doubloons - cost

  await Promise.all([
    admin.from('profiles').update({ ship_tier: nextTier, doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -cost,
      reason: `Bought ${SHIPS[nextTier].name}`,
    }),
  ])

  revalidatePath('/marketplace/shipyard')
  return { shipTier: nextTier, doubloons: newDoubloons }
}
