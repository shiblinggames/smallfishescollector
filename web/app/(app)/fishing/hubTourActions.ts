'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Latch the Fishing hub walkthrough shut. Mirrors markExpeditionsTourSeen:
 *  a profile column, never localStorage, so it follows the player across
 *  devices and a reinstall does not replay it. */
export async function markFishingHubTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_fishing_hub_tour: true }).eq('id', user.id)
}
