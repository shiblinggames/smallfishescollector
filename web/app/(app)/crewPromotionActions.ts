'use server'

// WHO HAS BEEN PROMOTED: a crew's Special stepping up at Lv 10 / 25 / 40 / 75 /
// 100, celebrated once each. The rule runs in lib/core/crew checkPromotions;
// this checks the session.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { crewData } from '@/lib/data/crewData'
import { verifiedSession } from '@/lib/verifiedSession'
import * as core from '@/lib/core/crew'

export type Promotion = import('@/lib/core/crew').Promotion

export async function checkPromotions(): Promise<Promotion[]> {
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  if (!session) return []
  return core.checkPromotions(crewData(createAdminClient()), session.user.id)
}
