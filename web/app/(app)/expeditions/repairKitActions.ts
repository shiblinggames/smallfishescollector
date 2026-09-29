'use server'

// Repair-kit upgrade ladder — doubloon-bought, Nav-gated, bought in tier order;
// a kit bought is added and auto-equipped (lib/core/raids buyRepairKit).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { raidData } from '@/lib/data/raidData'
import * as core from '@/lib/core/raids'

const db = () => raidData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function buyRepairKit(): Promise<core.KitResult | { error: string }> {
  const uid = await me()
  return uid ? core.buyRepairKit(db(), uid) : { error: 'Unauthorized' }
}
