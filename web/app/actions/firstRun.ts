'use server'

// THE FIRST RUN: the setup card seen, and the welcome gift (100 gems, once).
// Each action checks the session and hands lib/core/progress the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { progressData } from '@/lib/data/progressData'
import * as core from '@/lib/core/progress'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function markSetupSeen(): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markSetupSeen(progressData(createAdminClient()), uid)
}

/** The welcome gift, once: the flag flips first (guarded), then the gems. */
export async function claimWelcomePack(): Promise<{ ok: boolean }> {
  const uid = await me()
  if (!uid) return { ok: false }
  return core.claimWelcomePack(progressData(createAdminClient()), uid)
}
