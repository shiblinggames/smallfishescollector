'use server'

// THE PORTAL'S LADDER, server-enforced. The client shows prices and
// components; lib/core/sea decides (the stone is a cache chest already opened
// in the band the rung reaches). The action checks the session and hands the
// core the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import { buyPortalTier as buyCore } from '@/lib/core/sea'

export async function buyPortalTier(): Promise<{ ok: true; tier: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return buyCore(seaData(createAdminClient()), user.id)
}
