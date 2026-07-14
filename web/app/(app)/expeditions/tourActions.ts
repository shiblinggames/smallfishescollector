'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function markExpeditionsTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_expeditions_tour: true }).eq('id', user.id)
}

/** Latch Captain's Orders shut. Fired once, the first time every order is complete.
 *  Without it the checklist would come BACK for a veteran who benches their raid crew
 *  to run voyages for a day — a beginner's card served to someone with eight raids
 *  behind them. The launch guard already catches an empty deck when it matters. */
export async function markCaptainsOrdersDone(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ captains_orders_done: true }).eq('id', user.id)
}
