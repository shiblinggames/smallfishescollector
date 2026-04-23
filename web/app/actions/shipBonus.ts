'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getShip } from '@/lib/ships'

export async function claimShipBonus(): Promise<{ claimed: boolean; doubloons?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, ship_tier, last_ship_claim')
    .eq('id', user.id)
    .single()

  if (!profile) return { claimed: false }
  if (profile.last_ship_claim === today) return { claimed: false }

  const ship = getShip(profile.ship_tier ?? 0)
  if (ship.dailyBonus === 0) return { claimed: false }

  const newDoubloons = (profile.doubloons ?? 0) + ship.dailyBonus

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons, last_ship_claim: today }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: ship.dailyBonus,
      reason: `Ship bonus (${ship.name})`,
    }),
  ])

  return { claimed: true, doubloons: newDoubloons }
}
