'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { settlePendingSales } from '@/lib/pendingSales'
import { grant } from '@/lib/wallet'
import { marketSale, marketPriceEach } from '@/lib/sellRules'
import { sellData } from '@/lib/data/sellData'

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

  const db = sellData(admin)
  const [data, profile] = await Promise.all([
    db.pendingSales(user.id),
    db.profile(user.id, 'doubloons'),
  ])

  const pending: PendingSale[] = data.map(r => ({
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

  const db = sellData(admin)
  const [inventory, multiplierMap, profile] = await Promise.all([
    db.pricedHold(user.id),
    db.marketMultipliers(),
    db.profile(user.id, 'doubloons, is_premium, premium_expires_at'),
  ])

  if (!profile) return { error: 'Profile not found' }
  if (inventory.length === 0) return { error: 'The hold is empty' }

  // NO CUT: the non-Captain fee went on 2026-09-16 for everybody. The price
  // itself is lib/sellRules marketSale.

  // Empty each stack only if it still holds what was read, and pay only for
  // the stacks that emptied. Two sells fired together cannot both be paid for
  // the same fish: the second one's update matches nothing.
  const cleared = await Promise.all(inventory.map(async item =>
    (await db.emptyStack(user.id, item.fish_id, item.quantity)) ? item : null))

  const { earned: totalEarned, fishSold: totalFishSold } = marketSale(
    cleared.filter((x): x is NonNullable<typeof x> => !!x).map(item => ({
      sellValue: item.sell_value,
      multiplier: multiplierMap.get(item.fish_id) ?? 1.0,
      quantity: item.quantity,
    })))
  if (totalEarned <= 0) return { error: 'The hold is empty' }

  const [newDoubloons] = await Promise.all([
    grant(admin, user.id, 'doubloons', totalEarned),
    db.ledger(user.id, totalEarned, `Sold ${totalFishSold} fish (market)`),
    db.bumpStat(user.id, 'fish_sold_doubloons', totalEarned),
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

  const db = sellData(admin)
  const [held, sellValue, profile, multiplier] = await Promise.all([
    db.stackQty(user.id, fishId),
    db.speciesValue(fishId),
    db.profile(user.id, 'doubloons, is_premium, premium_expires_at'),
    db.marketMultiplier(fishId),
  ])

  if (held == null || sellValue == null || !profile) return { error: 'Data not found' }
  if (held < quantity) return { error: 'Not enough fish' }

  // NO CUT. See the note on the other sell path.
  const earned = marketPriceEach(sellValue, multiplier ?? 1.0) * quantity

  // Take the fish first, and only if the stack still holds what was read. A
  // twin request that got there first leaves this update matching nothing.
  if (!(await db.takeStack(user.id, fishId, held - quantity, held))) return { error: 'Not enough fish' }

  const [newDoubloons] = await Promise.all([
    grant(admin, user.id, 'doubloons', earned),
    db.ledger(user.id, earned, 'Sold fish (market)'),
    db.bumpStat(user.id, 'fish_sold_doubloons', earned),
  ])

  return { earned, doubloons: newDoubloons }
}

// Shiny sell/mount flow lives in app/(app)/fishing/actions.ts — the
// decision is forced at the catch result moment, not in the market.
// See sellGoldenTrophy + mountGoldenTrophy there.
