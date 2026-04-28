'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function liquidateAllFish(): Promise<
  { earned: number; doubloons: number; fishSold: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const [inventoryRes, marketRes, { data: profile }] = await Promise.all([
    admin.from('fish_inventory')
      .select('fish_id, quantity, fish_species(sell_value)')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    admin.from('fish_market').select('fish_id, multiplier'),
    admin.from('profiles').select('doubloons').eq('id', user.id).single(),
  ])

  if (!profile) return { error: 'Profile not found' }

  type InvRow = { fish_id: number; quantity: number; fish_species: { sell_value: number } | null }
  const inventory = (inventoryRes.data ?? []) as unknown as InvRow[]
  if (inventory.length === 0) return { error: 'Nothing to liquidate' }

  const multiplierMap = new Map<number, number>()
  for (const row of marketRes.data ?? []) {
    multiplierMap.set(row.fish_id, Number(row.multiplier))
  }

  let totalEarned = 0
  let totalFishSold = 0

  for (const item of inventory) {
    const sellValue = item.fish_species?.sell_value ?? 0
    const multiplier = multiplierMap.get(item.fish_id) ?? 1.0
    const priceEach = Math.floor(sellValue * multiplier * 0.90 * 0.97)
    totalEarned += priceEach * item.quantity
    totalFishSold += item.quantity
  }

  const newDoubloons = (profile.doubloons ?? 0) + totalEarned

  await Promise.all([
    ...inventory.map(item =>
      admin.from('fish_inventory')
        .update({ quantity: 0 })
        .eq('user_id', user.id)
        .eq('fish_id', item.fish_id)
    ),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: totalEarned,
      reason: `Liquidated ${totalFishSold} fish (market)`,
    }),
  ])

  return { earned: totalEarned, doubloons: newDoubloons, fishSold: totalFishSold }
}

export async function marketSellFish(
  fishId: number,
  quantity: number,
): Promise<{ earned: number; doubloons: number } | { error: string }> {
  if (quantity <= 0) return { error: 'Invalid quantity' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const [{ data: invRow }, { data: fish }, { data: profile }, { data: market }] = await Promise.all([
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id).eq('fish_id', fishId).single(),
    admin.from('fish_species').select('sell_value').eq('id', fishId).single(),
    admin.from('profiles').select('doubloons').eq('id', user.id).single(),
    admin.from('fish_market').select('multiplier').eq('fish_id', fishId).single(),
  ])

  if (!invRow || !fish || !profile) return { error: 'Data not found' }
  if (invRow.quantity < quantity) return { error: 'Not enough fish' }

  const multiplier = market?.multiplier ?? 1.0
  const priceEach = Math.floor(fish.sell_value * Number(multiplier) * 0.97)
  const earned = priceEach * quantity
  const newDoubloons = (profile.doubloons ?? 0) + earned

  await Promise.all([
    admin.from('fish_inventory')
      .update({ quantity: invRow.quantity - quantity })
      .eq('user_id', user.id).eq('fish_id', fishId),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: earned, reason: 'Sold fish (market)',
    }),
  ])

  return { earned, doubloons: newDoubloons }
}
