'use server'

// GOING ASHORE AT A DISCOVERABLE ISLE.
//
// One isle pays one captain once, ever: insert first, grant second, and the
// unique index is the guard. What an isle is worth lives in lib/seaIsles and
// the rule in lib/core/sea; each action checks the session and hands the core
// the Supabase store.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import * as core from '@/lib/core/sea'
import type { AshoreResult } from '@/lib/core/sea'

export type { AshoreResult } from '@/lib/core/sea'

/** Every isle this captain has already been ashore at. */
export async function getDiscoveries(): Promise<string[]> {
  // getSession, not getUser: a read of the caller's own rows on a hot page load.
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  if (!session?.user) return []
  return core.getDiscoveries(seaData(createAdminClient()), session.user.id)
}

/** Go ashore: claims the isle and returns what was on it. */
export async function goAshore(isleId: string): Promise<AshoreResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  return core.goAshore(seaData(createAdminClient()), user.id, isleId)
}
