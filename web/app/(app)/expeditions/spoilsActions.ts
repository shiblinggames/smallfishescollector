'use server'

// THE SPOILS OF THE SUNKEN HAND: one side free for beating Finn, the other for
// SPOILS_PRICE, and the Primeval Eye's own slot (lib/core/raidMap).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { raidData } from '@/lib/data/raidData'
import * as core from '@/lib/core/raidMap'

export type SpoilSide = import('@/lib/core/raidMap').SpoilSide

const db = () => raidData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Take one side FREE. Only ever succeeds once. */
export async function chooseSpoil(side: unknown): Promise<{ ok: boolean; error?: string }> {
  const uid = await me()
  return uid ? core.chooseSpoil(db(), uid, side) : { ok: false, error: 'Not signed in.' }
}

/** Buy the OTHER side. */
export async function buySpoil(side: unknown): Promise<{ ok: boolean; error?: string; doubloons?: number }> {
  const uid = await me()
  return uid ? core.buySpoil(db(), uid, side) : { ok: false, error: 'Not signed in.' }
}

/** Seat (or clear) The Primeval Eye in the second fishing special slot. */
export async function equipSecondSpecial(itemId: unknown): Promise<{ ok: boolean; error?: string }> {
  const uid = await me()
  return uid ? core.equipSecondSpecial(db(), uid, itemId) : { ok: false, error: 'Not signed in.' }
}
