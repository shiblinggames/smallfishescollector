'use server'

// ── WHAT THE LOADOUT SHEET CAN CHANGE, OUT ON THE WATER ─────────────────────
//
// The sea's loadout draws the Shipyard's preview and swaps the same things.
// Fetched when the sheet opens, not with the chart; equip only, never a till
// in the middle of the ocean. The read lives in lib/core/seaSheets.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import { loadoutGear as gearCore, type LoadoutGear } from '@/lib/core/seaSheets'

export type { LoadoutGear } from '@/lib/core/seaSheets'

/** Everything the loadout's pickers offer. Read-only. */
export async function loadoutGear(): Promise<LoadoutGear | null> {
  // getSession, not getUser: the caller's own rows.
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  const uid = session?.user?.id
  if (!uid) return null
  return gearCore(seaData(createAdminClient()), uid)
}
