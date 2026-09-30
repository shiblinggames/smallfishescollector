'use server'

// THE FISH HOLD: its upgrade and what is in it. Each action checks the session
// and hands lib/core/harbour the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { harbourData } from '@/lib/data/harbourData'
import * as core from '@/lib/core/harbour'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function upgradeFishHold(): Promise<{ ok: true; newTier: number; doubloons: number } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.upgradeFishHold(harbourData(createAdminClient()), uid)
}

/** What is actually in the hold: the quantities only. */
export async function holdContents(): Promise<{ ok: true; rows: { fishId: number; qty: number }[] } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.holdContents(harbourData(createAdminClient()), uid)
}
