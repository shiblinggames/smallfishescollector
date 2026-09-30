'use server'

// ── WHAT A CAMPAIGN NODE'S SHEET NEEDS TO KNOW, FROM THE WATER ──────────────
//
// Fetched on open, not threaded through the chart as props, and taken from the
// map's own read (lib/core/raidMap) so the two surfaces cannot disagree about
// whether you passed an inspection. The read lives in lib/core/seaSheets.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import { nodeSheet as sheetCore, type NodeSheetState } from '@/lib/core/seaSheets'

export type { NodeSheetState } from '@/lib/core/seaSheets'

export async function nodeSheet(): Promise<NodeSheetState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  return sheetCore(seaData(createAdminClient()), user.id)
}
