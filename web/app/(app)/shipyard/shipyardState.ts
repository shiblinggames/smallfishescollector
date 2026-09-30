'use server'

// ── EVERYTHING THE SHIPYARD NEEDS, IN ONE READ ──────────────────────────────
//
// Opened two ways (the page at /shipyard, and a sheet over the chart when you
// moor at its island), both wanting the same thirty-odd facts, so the gathering
// lives in lib/core/harbour and both call it.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/userData'
import { harbourData } from '@/lib/data/harbourData'
import { shipyardState as stateCore, type ShipyardState } from '@/lib/core/harbour'

export type { ShipyardState } from '@/lib/core/harbour'

export async function shipyardState(): Promise<ShipyardState | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in.' }
  return stateCore(harbourData(createAdminClient()), user.id)
}
