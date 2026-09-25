'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { settlePendingSales } from '@/lib/pendingSales'
import { grant } from '@/lib/wallet'

export type PendingSale = {
  id: string
  amount: number
  fishCount: number
  reason: string
  settlesAt: string
}

export async function getPendingSales(): Promise<{
  pending: PendingSale[]
  justSettled: number
  doubloons: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { pending: [], justSettled: 0, doubloons: 0 }

  const admin = createAdminClient()
  const justSettled = await settlePendingSales(user.id, admin)

  const [{ data }, { data: profile }] = await Promise.all([
    admin
      .from('pending_sales')
      .select('id, amount, fish_count, reason, settles_at')
      .eq('user_id', user.id)
      .order('settles_at', { ascending: true }),
    admin.from('profiles').select('doubloons').eq('id', user.id).single(),
  ])

  const pending: PendingSale[] = (data ?? []).map(r => ({
    id: r.id as string,
    amount: r.amount as number,
    fishCount: r.fish_count as number,
    reason: r.reason as string,
    settlesAt: r.settles_at as string,
  }))

  return { pending, justSettled, doubloons: (profile?.doubloons as number | null) ?? 0 }
}

/**
 * SELL THE WHOLE HOLD, HERE, NOW, AT THE MARKET PRICE.
 *
 * This used to be "liquidate": 90% of market, minus the fee, paid an hour
 * later. The hour was standing in for a cost — the market lane was supposed to
 * be the one you had to work for, and holding the money back was the only way
 * to charge for it on a screen you could open from anywhere.
 *
 * The ocean hub charges that cost properly now. The market is a building on an
 * island; getting to it means sailing home with a full hold, which is a real
 * trip with real time in it and a decision about whether it is worth making
 * yet. Once you have made it, taking another hour off the player is charging
 * twice for the same thing.
 *
 * So the wait is gone and so is the 10% haircut: the whole hold sells for
 * exactly what the per-species market pays, because it IS the per-species
 * market, in one tap instead of thirty.
 *
 * The three lanes still ladder cleanly, and they ladder on DISTANCE now rather
 * than on time:
 *   65-75%  quick sell   — from anywhere, without moving
 *   78-86%  a zone buyer — where you are fishing, if you sail to them
 *   100%    the market   — ashore, which is the whole way home
 *
 * `settlePendingSales` stays and still runs: there are pending rows in the wild
 * with an hour on them and they have to be honoured. Nothing new is written to
 * that table.
 */
export async function sellEntireHold(): Promise<
  { earned: number; fishSold: number; doubloons: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  // Drain anything still owed from the old delayed lane before reading the
  // balance, so the number handed back is the one the player will see.
  await settlePendingSales(user.id, admin)

  const [inventoryRes, marketRes, { data: profile }] = await Promise.all([
    admin.from('fish_inventory')
      .select('fish_id, quantity, fish_species(sell_value)')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    admin.from('fish_market').select('fish_id, multiplier'),
    admin.from('profiles').select('doubloons, is_premium, premium_expires_at').eq('id', user.id).single(),
  ])

  if (!profile) return { error: 'Profile not found' }

  type InvRow = { fish_id: number; quantity: number; fish_species: { sell_value: number } | null }
  const inventory = (inventoryRes.data ?? []) as unknown as InvRow[]
  if (inventory.length === 0) return { error: 'The hold is empty' }

  const multiplierMap = new Map<number, number>()
  for (const row of marketRes.data ?? []) {
    multiplierMap.set(row.fish_id, Number(row.multiplier))
  }

  // NO CUT. There was a three percent fee for non-Captains here, and it went
  // on 2026-09-16 for everybody: it was confusing on the receipt, and a perk
  // that touches a rate is the wrong kind of perk. See lib/captainWater.
  const fee = 1.0

  // Empty each stack only if it still holds what was read, and pay only for
  // the stacks that emptied. Two sells fired together cannot both be paid for
  // the same fish: the second one's update matches nothing.
  const cleared = await Promise.all(inventory.map(async item => {
    const { data } = await admin.from('fish_inventory')
      .update({ quantity: 0 })
      .eq('user_id', user.id)
      .eq('fish_id', item.fish_id)
      .eq('quantity', item.quantity)
      .select('fish_id')
    return data && data.length > 0 ? item : null
  }))

  let totalEarned = 0
  let totalFishSold = 0
  for (const item of cleared) {
    if (!item) continue
    const sellValue = item.fish_species?.sell_value ?? 0
    const multiplier = multiplierMap.get(item.fish_id) ?? 1.0
    totalEarned += Math.floor(sellValue * multiplier * fee) * item.quantity
    totalFishSold += item.quantity
  }
  if (totalEarned <= 0) return { error: 'The hold is empty' }

  const [newDoubloons] = await Promise.all([
    grant(admin, user.id, 'doubloons', totalEarned),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: totalEarned,
      reason: `Sold ${totalFishSold} fish (market)`,
    }),
    admin.rpc('bump_profile_stat', { uid: user.id, col: 'fish_sold_doubloons', n: totalEarned }),
  ])

  return { earned: totalEarned, fishSold: totalFishSold, doubloons: newDoubloons }
}

export async function marketSellFish(
  fishId: number,
  quantity: number,
): Promise<{ earned: number; doubloons: number } | { error: string }> {
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: 'Invalid quantity' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  await settlePendingSales(user.id, admin)

  const [{ data: invRow }, { data: fish }, { data: profile }, { data: market }] = await Promise.all([
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id).eq('fish_id', fishId).single(),
    admin.from('fish_species').select('sell_value').eq('id', fishId).single(),
    admin.from('profiles').select('doubloons, is_premium, premium_expires_at').eq('id', user.id).single(),
    admin.from('fish_market').select('multiplier').eq('fish_id', fishId).single(),
  ])

  if (!invRow || !fish || !profile) return { error: 'Data not found' }
  if (invRow.quantity < quantity) return { error: 'Not enough fish' }

  // NO CUT. See the note on the other sell path.
  const fee = 1.0
  const multiplier = market?.multiplier ?? 1.0
  const priceEach = Math.floor(fish.sell_value * Number(multiplier) * fee)
  const earned = priceEach * quantity

  // Take the fish first, and only if the stack still holds what was read. A
  // twin request that got there first leaves this update matching nothing.
  const { data: taken } = await admin.from('fish_inventory')
    .update({ quantity: invRow.quantity - quantity })
    .eq('user_id', user.id).eq('fish_id', fishId).eq('quantity', invRow.quantity)
    .select('fish_id')
  if (!taken || taken.length === 0) return { error: 'Not enough fish' }

  const [newDoubloons] = await Promise.all([
    grant(admin, user.id, 'doubloons', earned),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: earned, reason: 'Sold fish (market)',
    }),
    admin.rpc('bump_profile_stat', { uid: user.id, col: 'fish_sold_doubloons', n: earned }),
  ])

  return { earned, doubloons: newDoubloons }
}

// Shiny sell/mount flow lives in app/(app)/fishing/actions.ts — the
// decision is forced at the catch result moment, not in the market.
// See sellGoldenTrophy + mountGoldenTrophy there.
