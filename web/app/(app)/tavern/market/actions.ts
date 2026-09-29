'use server'

// The market's two sells, run in lib/core/selling. These check the session,
// settle anything still owed from the retired delayed lane (a web-only table,
// never written offline), and hand the core the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { settlePendingSales } from '@/lib/pendingSales'
import { sellData } from '@/lib/data/sellData'
import * as core from '@/lib/core/selling'

export type PendingSale = import('@/lib/core/selling').PendingSale

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
  return { ...(await core.pendingSales(sellData(admin), user.id)), justSettled }
}

/** Sell the whole hold at the market price, now (lib/core/selling). */
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
  return core.sellEntireHold(sellData(admin), user.id)
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
  return core.marketSellFish(sellData(admin), user.id, fishId, quantity)
}

// Shiny sell/mount flow lives in app/(app)/fishing/actions.ts — the
// decision is forced at the catch result moment, not in the market.
// See sellGoldenTrophy + mountGoldenTrophy there.
