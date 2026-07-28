'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// First-visit Chart Room guide dismissal (see components/LobbyGuide).
export async function markChartingGuideSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_charting_guide: true }).eq('id', user.id)
}
