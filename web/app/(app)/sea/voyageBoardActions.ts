'use server'

// ── THE VOYAGE BOARD, FETCHED FROM THE WATER ────────────────────────────────
//
// Everything DailyVoyagePanel needs, in one call, so the Charterhouse can open
// the real board over the chart instead of routing to /expeditions and asking
// the captain to find the card that opens it.
//
// LAZY, AND THAT IS THE WHOLE REASON THIS EXISTS. The obvious alternative is
// to fetch this in /sea/page.tsx and hand it to the map as props — five queries
// on every single chart load, for a panel most sessions never open. The chart
// is the app's front door and it already carries a note about a five-minute
// hang; it does not need a crew roster and eight voyage rows on the critical
// path. This runs when somebody moors at the island and not before.
//
// It reads the same sources the hub does rather than a second set of its own
// (lib/core/voyages voyageBoard): the profile, the voyage state, the roster,
// and the eight most recent revealed voyages, in parallel.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/userData'
import { voyageData } from '@/lib/data/voyageData'
import * as core from '@/lib/core/voyages'

export type VoyageBoard = import('@/lib/core/voyages').VoyageBoard

export async function voyageBoard(): Promise<VoyageBoard | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in.' }
  return core.voyageBoard(voyageData(createAdminClient()), user.id)
}
