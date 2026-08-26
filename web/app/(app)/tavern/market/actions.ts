'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPremiumActive } from '@/lib/premium'

const PENDING_SALE_DELAY_MS = 60 * 60 * 1000 // 1 hour

// Settles all matured pending sales for a user. Returns total newly credited.
// Safe to call from any profile-reading path (server components, server actions).
export async function settlePendingSales(
  userId: string,
  admin?: SupabaseClient,
): Promise<number> {
  const db = admin ?? createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: matured } = await db
    .from('pending_sales')
    .select('id, amount')
    .eq('user_id', userId)
    .lte('settles_at', nowIso)

  if (!matured || matured.length === 0) return 0

  const totalCredit = matured.reduce((s, r) => s + (r.amount ?? 0), 0)
  if (totalCredit <= 0) return 0

  const { data: profile } = await db
    .from('profiles')
    .select('doubloons')
    .eq('id', userId)
    .single()
  const newDoubloons = (profile?.doubloons ?? 0) + totalCredit

  await Promise.all([
    db.from('profiles').update({ doubloons: newDoubloons }).eq('id', userId),
    db.from('pending_sales').delete().in('id', matured.map(r => r.id)),
    db.from('doubloon_transactions').insert({
      user_id: userId,
      amount: totalCredit,
      reason: `Pending sale${matured.length === 1 ? '' : 's'} settled`,
    }),
    db.rpc('bump_profile_stat', { uid: userId, col: 'fish_sold_doubloons', n: totalCredit }),
  ])

  return totalCredit
}

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

  // The Captain's 3% is a membership perk and stays. It was never the thing
  // that made this lane slow, and it is the same fee the per-species market
  // charges — selling one at a time to dodge it would be thirty taps for
  // nothing.
  const fee = isPremiumActive(profile) ? 1.0 : 0.97

  let totalEarned = 0
  let totalFishSold = 0
  for (const item of inventory) {
    const sellValue = item.fish_species?.sell_value ?? 0
    const multiplier = multiplierMap.get(item.fish_id) ?? 1.0
    totalEarned += Math.floor(sellValue * multiplier * fee) * item.quantity
    totalFishSold += item.quantity
  }
  if (totalEarned <= 0) return { error: 'The hold is empty' }

  // Re-read the balance AFTER the settle above rather than trusting the one
  // fetched alongside the inventory: a pending row maturing in between would
  // otherwise be overwritten by this write.
  const { data: fresh } = await admin
    .from('profiles').select('doubloons').eq('id', user.id).single()
  const newDoubloons = Number(fresh?.doubloons ?? profile.doubloons ?? 0) + totalEarned

  await Promise.all([
    ...inventory.map(item =>
      admin.from('fish_inventory')
        .update({ quantity: 0 })
        .eq('user_id', user.id)
        .eq('fish_id', item.fish_id)
    ),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
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
  if (quantity <= 0) return { error: 'Invalid quantity' }

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

  const isPremium = isPremiumActive(profile)
  const fee = isPremium ? 1.0 : 0.97
  const multiplier = market?.multiplier ?? 1.0
  const priceEach = Math.floor(fish.sell_value * Number(multiplier) * fee)
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
    admin.rpc('bump_profile_stat', { uid: user.id, col: 'fish_sold_doubloons', n: earned }),
  ])

  return { earned, doubloons: newDoubloons }
}

// Shiny sell/mount flow lives in app/(app)/fishing/actions.ts — the
// decision is forced at the catch result moment, not in the market.
// See sellGoldenTrophy + mountGoldenTrophy there.
