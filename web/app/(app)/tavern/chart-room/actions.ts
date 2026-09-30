'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chartData } from '@/lib/data/chartData'
import * as core from '@/lib/core/chartRoom'

// First-visit Chart Room guide dismissal (see components/LobbyGuide).
export async function markChartingGuideSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await core.markChartingGuideSeen(chartData(createAdminClient()), user.id)
}
