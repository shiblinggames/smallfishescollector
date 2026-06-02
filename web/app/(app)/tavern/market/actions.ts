'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPremiumActive } from '@/lib/premium'
import { SHINY_SELL_MULT } from '@/lib/shiny'

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

export async function liquidateAllFish(): Promise<
  { earned: number; pendingId: string; settlesAt: string; fishSold: number; doubloons: number } | { error: string }
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
    admin.from('profiles').select('doubloons, is_premium, premium_expires_at').eq('id', user.id).single(),
  ])

  if (!profile) return { error: 'Profile not found' }

  type InvRow = { fish_id: number; quantity: number; fish_species: { sell_value: number } | null }
  const inventory = (inventoryRes.data ?? []) as unknown as InvRow[]
  if (inventory.length === 0) return { error: 'Nothing to liquidate' }

  const multiplierMap = new Map<number, number>()
  for (const row of marketRes.data ?? []) {
    multiplierMap.set(row.fish_id, Number(row.multiplier))
  }

  const isPremium = isPremiumActive(profile)
  const fee = isPremium ? 1.0 : 0.97

  let totalEarned = 0
  let totalFishSold = 0

  for (const item of inventory) {
    const sellValue = item.fish_species?.sell_value ?? 0
    const multiplier = multiplierMap.get(item.fish_id) ?? 1.0
    const priceEach = Math.floor(sellValue * multiplier * 0.90 * fee)
    totalEarned += priceEach * item.quantity
    totalFishSold += item.quantity
  }

  if (totalEarned <= 0) return { error: 'Nothing to liquidate' }

  const settlesAt = new Date(Date.now() + PENDING_SALE_DELAY_MS).toISOString()

  const [, , pendingRes] = await Promise.all([
    ...inventory.map(item =>
      admin.from('fish_inventory')
        .update({ quantity: 0 })
        .eq('user_id', user.id)
        .eq('fish_id', item.fish_id)
    ),
    Promise.resolve(null),
    admin.from('pending_sales').insert({
      user_id: user.id,
      amount: totalEarned,
      fish_count: totalFishSold,
      reason: `Liquidated ${totalFishSold} fish`,
      settles_at: settlesAt,
    }).select('id').single(),
  ])

  const pendingId = (pendingRes?.data?.id as string | undefined) ?? ''

  return {
    earned: totalEarned,
    pendingId,
    settlesAt,
    fishSold: totalFishSold,
    doubloons: profile.doubloons ?? 0,
  }
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
  ])

  return { earned, doubloons: newDoubloons }
}

// ── Trophy Hold (shiny variants) ────────────────────────────────────
// Shinies live in their own table (shiny_catches) as per-instance
// trophies — never merged into fish_inventory, so each retains its
// size + caught_at metadata. The Trophy Hold lane reads from there
// and sells one shiny at a time at exactly SHINY_SELL_MULT × the
// species' base sell_value. Market multipliers don't apply (a shiny
// is a fixed-rarity catch, not a market commodity) and there's no
// non-premium fee or delayed settlement — selling a trophy is
// rare + intentional, no "convenience tax" warranted.

export type TrophyHoldItem = {
  id: number
  fishId: number
  name: string
  habitat: string
  sizeIn: number | null
  caughtAt: string
  baseSellValue: number
  sellPrice: number
}

export async function getTrophyHold(): Promise<{
  items: TrophyHoldItem[]
  doubloons: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { items: [], doubloons: 0 }

  const admin = createAdminClient()
  const [{ data: rows }, { data: profile }] = await Promise.all([
    admin
      .from('shiny_catches')
      .select('id, fish_id, size_in, caught_at, fish_species(name, habitat, sell_value)')
      .eq('user_id', user.id)
      .eq('status', 'hold')
      .order('caught_at', { ascending: false }),
    admin.from('profiles').select('doubloons').eq('id', user.id).single(),
  ])

  type Row = {
    id: number
    fish_id: number
    size_in: number | null
    caught_at: string
    fish_species: { name: string; habitat: string; sell_value: number } | null
  }
  const items: TrophyHoldItem[] = ((rows ?? []) as unknown as Row[])
    .filter(r => r.fish_species)
    .map(r => {
      const base = r.fish_species!.sell_value ?? 0
      return {
        id: r.id,
        fishId: r.fish_id,
        name: r.fish_species!.name,
        habitat: r.fish_species!.habitat,
        sizeIn: r.size_in,
        caughtAt: r.caught_at,
        baseSellValue: base,
        sellPrice: base * SHINY_SELL_MULT,
      }
    })

  return { items, doubloons: (profile?.doubloons as number | null) ?? 0 }
}

export async function sellShinyTrophy(
  shinyId: number,
): Promise<{ earned: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const { data: row } = await admin
    .from('shiny_catches')
    .select('id, status, fish_id, fish_species(name, sell_value)')
    .eq('id', shinyId)
    .eq('user_id', user.id)
    .single()

  type Row = {
    id: number
    status: string
    fish_id: number
    fish_species: { name: string; sell_value: number } | null
  }
  const trophy = row as unknown as Row | null

  if (!trophy) return { error: 'Trophy not found' }
  if (trophy.status !== 'hold') return { error: 'Trophy not on hold' }
  if (!trophy.fish_species) return { error: 'Species not found' }

  const earned = (trophy.fish_species.sell_value ?? 0) * SHINY_SELL_MULT
  if (earned <= 0) return { error: 'Trophy has no value' }

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()
  const newDoubloons = (profile?.doubloons ?? 0) + earned

  await Promise.all([
    admin.from('shiny_catches')
      .update({ status: 'sold', sold_at: new Date().toISOString(), sold_for: earned })
      .eq('id', shinyId),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: earned,
      reason: `Sold golden ${trophy.fish_species.name}`,
    }),
  ])

  return { earned, doubloons: newDoubloons }
}
