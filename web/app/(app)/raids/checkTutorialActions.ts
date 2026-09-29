'use server'

// One-shot tutorial for the boss mechanic-check system (telegraphed move ->
// counter with a crew ability). Persisted server-side (tour convention: a
// has_seen_* profile column, never localStorage). lib/core/raids.

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

/** Has the player already seen it? True on any doubt, so a tour never traps anyone. */
export async function getCheckTutorialSeen(): Promise<boolean> {
  const uid = await me()
  return uid ? core.getCheckTutorialSeen(db(), uid) : true
}

/** Mark it seen so it never fires again. */
export async function markCheckTutorialSeen(): Promise<{ ok: boolean }> {
  const uid = await me()
  return uid ? core.markCheckTutorialSeen(db(), uid) : { ok: false }
}
