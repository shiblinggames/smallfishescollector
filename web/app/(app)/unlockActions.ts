'use server'

// ── WHAT THE UNLOCK BANNER ASKS ─────────────────────────────────────────────
//
// "Has this captain EARNED a cosmetic I have not told them about?" The rule
// lives in lib/core/progress (checkUnlocks); this checks the session and hands
// it the Supabase store. The banner reaches it through the /api/unlocks route,
// not as a server action, so it never queues behind a press.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { progressData } from '@/lib/data/progressData'
import { checkUnlocks as checkCore, type UnlockNews } from '@/lib/core/progress'

export type { UnlockNews } from '@/lib/core/progress'

export async function checkUnlocks(): Promise<UnlockNews[]> {
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  const user = session?.user
  if (!user) return []
  return checkCore(progressData(createAdminClient()), user.id)
}
