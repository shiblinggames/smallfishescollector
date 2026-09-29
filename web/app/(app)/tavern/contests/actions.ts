'use server'

// THE CONTESTS' actions. Each hands lib/core/dailies the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dailyData } from '@/lib/data/dailyData'
import * as core from '@/lib/core/dailies'
import type { ContestView } from '@/lib/contests'

/** Clear the "new contest" pulse on the tavern tile once the player opens this
 *  page. Re-arm by resetting has_seen_contests when a new contest launches. */
export async function markContestsSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await core.markContestsSeen(dailyData(createAdminClient()), user.id)
}

/** Every contest's winner (from the contests table) and, for active
 *  board-backed contests, the live top-3 standings. Keyed by contest id.
 *  Public: the page renders it for anyone. */
export async function getContestsView(): Promise<Record<string, ContestView>> {
  return core.getContestsView(dailyData(createAdminClient()), '')
}
