'use server'

// The Reef Skirmish's guided intro: four cards from Doby and Kat over the first
// fight, once. Its own has_seen_* column (tour convention); lib/core/raids.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { raidData } from '@/lib/data/raidData'
import * as core from '@/lib/core/raids'

const db = () => raidData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Has the player already seen it? True on any doubt, so a tour never shows twice. */
export async function getSkirmishTourSeen(): Promise<boolean> {
  const uid = await me()
  return uid ? core.getSkirmishTourSeen(db(), uid) : true
}

/** Mark it seen so it never opens again. */
export async function markSkirmishTourSeen(): Promise<{ ok: boolean }> {
  const uid = await me()
  return uid ? core.markSkirmishTourSeen(db(), uid) : { ok: false }
}
