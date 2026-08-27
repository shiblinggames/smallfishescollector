'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { nextShip, MIN_SHIP_TIER } from '@/lib/ships'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { navLevelReqForShip } from '@/lib/gearGating'
import { revalidatePath } from 'next/cache'

export async function buyShip(): Promise<{ shipTier: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, doubloons, expedition_xp')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  // FLOORED AT THE SLOOP. The Rowboat and Dinghy came off the ladder and most
  // captains were still stored at tier 0, so without this the first purchase
  // would sell them a rung that no longer exists.
  const currentTier = Math.max(MIN_SHIP_TIER, profile.ship_tier ?? MIN_SHIP_TIER)
  const nextTier = currentTier + 1

  // AGAINST THE TOP TIER, never SHIPS.length. Those agreed until the ladder
  // lost its bottom two rungs; length is 5 now and the top tier is 6, so the
  // old test told a Brigantine captain they were finished and refused to sell
  // them the two hulls above.
  const next = nextShip(currentTier)
  if (!next) return { error: 'Already at max tier' }

  const cost = next.cost
  const navLevel = navLevelFromXP(profile.expedition_xp ?? 0)
  const navReq = navLevelReqForShip(cost)
  if (navLevel < navReq) return { error: `Reach Nav Lv ${navReq} to buy the ${next.name}` }
  if (profile.doubloons < cost) return { error: 'Not enough doubloons' }

  const newDoubloons = profile.doubloons - cost

  await Promise.all([
    admin.from('profiles').update({ ship_tier: nextTier, doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -cost,
      reason: `Bought ${next.name}`,
    }),
  ])

  revalidatePath('/marketplace/shipyard')
  return { shipTier: nextTier, doubloons: newDoubloons }
}

export async function renameShip(name: string): Promise<{ ok: true } | { error: string }> {
  const trimmed = name.trim().slice(0, 32)
  if (!trimmed) return { error: 'Name cannot be empty' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  await admin.from('profiles').update({ ship_name: trimmed }).eq('id', user.id)

  revalidatePath('/marketplace/shipyard')
  return { ok: true }
}
