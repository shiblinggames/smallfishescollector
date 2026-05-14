'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function markExpeditionsTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_expeditions_tour: true }).eq('id', user.id)
}
