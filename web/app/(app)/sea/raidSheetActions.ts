'use server'

// ── WHAT A FIGHT NEEDS TO KNOW ABOUT ITS CAPTAIN ────────────────────────────
//
// Every raid route gathers exactly this and hands it to RaidGame; the sheet on
// the chart needs the same, one loadout however you reached the fight. The read
// lives in lib/core/seaSheets.

import { getCurrentUser } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import { raidSheetState as sheetCore, type RaidSheetState } from '@/lib/core/seaSheets'

export type { RaidSheetState } from '@/lib/core/seaSheets'

export async function raidSheetState(): Promise<RaidSheetState | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in.' }
  return sheetCore(seaData(createAdminClient()), user.id)
}
