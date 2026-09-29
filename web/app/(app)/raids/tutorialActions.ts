'use server'

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

export async function markRaidTutorialSeen(): Promise<void> {
  const uid = await me()
  if (uid) await core.markRaidTutorialSeen(db(), uid)
}
