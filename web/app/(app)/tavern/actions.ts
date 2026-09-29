'use server'

// Fish Slots. The roll, the pay table and the community pot run in
// lib/core/casino; these check the session and hand the core the Supabase
// store.
//
// Crown & Anchor was retired 2026-06-06 — replaced by Blackjack
// (app/(app)/tavern/blackjack/actions.ts). The dice_rolls table stays
// in the DB as historical record but no code writes to it anymore.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { casinoData } from '@/lib/data/casinoData'
import * as core from '@/lib/core/casino'

export type SlotSpinResult = import('@/lib/core/casino').SlotSpinResult
export type SlotsJackpotState = import('@/lib/core/casino').SlotsJackpotState
export type SlotStats = import('@/lib/core/casino').SlotStats

export async function getSlotsJackpot(): Promise<SlotsJackpotState> {
  // Read through the request's own client, as it always was.
  return core.getSlotsJackpot(casinoData(await createClient()))
}

export async function getSlotStats(): Promise<SlotStats> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return core.NO_SLOT_STATS
  return core.getSlotStats(casinoData(createAdminClient()), user.id)
}

export async function spinSlots(wager: number): Promise<SlotSpinResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const r = await core.spinSlots(casinoData(createAdminClient()), user.id, wager)
  if (!('error' in r)) revalidatePath('/tavern/slots')
  return r
}
