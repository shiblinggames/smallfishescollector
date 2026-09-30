'use server'

// A member's daily gems. No screen calls this today; it is kept guarded rather
// than left as a balance write from a stale read. The rule lives in
// lib/core/progress.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { progressData } from '@/lib/data/progressData'
import { claimDailyPack as claimCore } from '@/lib/core/progress'

export async function claimDailyPack(): Promise<{ claimed: boolean; gems?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }
  return claimCore(progressData(createAdminClient()), user.id)
}
