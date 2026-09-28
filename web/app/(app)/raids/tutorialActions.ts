'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { raidData } from '@/lib/data/raidData'

export async function markRaidTutorialSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await raidData(createAdminClient()).updateProfile(user.id, { has_seen_raid_tutorial: true })
}
