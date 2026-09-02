'use server'

// ── WHAT A CAMPAIGN NODE'S SHEET NEEDS TO KNOW, FROM THE WATER ──────────────
//
// The three nodes that are not just "read it" — the Bilge Eels' toll, the
// Quartermaster's Cache and the Captain's Choice — each need one fact about the
// captain before they can be drawn: what is in the purse, what has already been
// taken, and which classes are still on the ladder.
//
// FETCHED ON OPEN, not threaded through the chart as props. All three change
// as you play — you spend doubloons, you pick a class — and a prop read when
// the page loaded would draw a sheet about a captain who no longer exists. The
// crew hub takes the same line, for the same reason.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type NodeSheetState = {
  doubloons: number
  /** Chapter id → the ship class picked for it. */
  shipClasses: Record<string, string>
  /** Raid items already in the hold, so a Cache cannot offer you a second one
   *  of something you are already carrying without saying so. */
  ownedItems: string[]
}

export async function nodeSheet(): Promise<NodeSheetState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { data: prof } = await createAdminClient()
    .from('profiles')
    .select('doubloons, ship_classes, raid_items')
    .eq('id', user.id)
    .single()
  if (!prof) return { error: 'No profile.' }

  const p = prof as Record<string, unknown>
  return {
    doubloons: Number(p.doubloons ?? 0),
    shipClasses: (p.ship_classes as Record<string, string> | null) ?? {},
    ownedItems: (p.raid_items as string[] | null) ?? [],
  }
}
