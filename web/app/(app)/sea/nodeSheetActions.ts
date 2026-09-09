'use server'

// ── WHAT A CAMPAIGN NODE'S SHEET NEEDS TO KNOW, FROM THE WATER ──────────────
//
// Every stop out here that is not simply "read it" needs some fact about the
// captain before it can be drawn: what is in the purse, what has already been
// taken, which classes are still on the ladder, who would actually sail, and
// which side of Finn's spoils is already claimed.
//
// FETCHED ON OPEN, not threaded through the chart as props. All of it changes
// as you play — you spend doubloons, you pick a class, you swap a hand out of
// the party — and a prop read when the page loaded would draw a sheet about a
// captain who no longer exists. The crew hub takes the same line, for the same
// reason.
//
// ── IT IS THE MAP'S OWN READ ────────────────────────────────────────────────
//
// This used to be a three-column select of its own, which was right while the
// water could only finish three kinds of node. It cannot be right now: the
// muster is a ROSTER GATE whose pass/fail the server re-runs, the berth and the
// armory are purchases gated on what you already own, and the event picker has
// to know which card you chose when you come back to look. Every one of those
// answers already exists in `getRaidMapView`, which is what /expeditions loads,
// and a second query with its own column list is exactly how the two surfaces
// start disagreeing about whether you passed an inspection.

import { getRaidMapView } from '@/app/(app)/expeditions/raidMapActions'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { MusterCrew } from '@/lib/crewMuster'

export type NodeSheetState = {
  doubloons: number
  /** Chapter id → the ship class picked for it. */
  shipClasses: Record<string, string>
  /** Raid items already in the hold, so a Cache cannot offer you a second one
   *  of something you are already carrying without saying so. */
  ownedItems: string[]
  /** Nav level, which sets the odds on a bones throw. */
  navLevel: number
  /** The raid party as the don's clerk counts it. Drives the muster. */
  musterParty: MusterCrew[]
  /** Which node the captain chose what at — an event revisit shows it back. */
  choices: Record<string, string>
  /** Finn's two spoils: the one taken free and the one bought. */
  spoilFree: string | null
  spoilPaid: string | null
  /** Refits already owned, so their nodes offer the terms rather than the sale. */
  hasSixthBerth: boolean
  hasArmoryExpansion: boolean
}

export async function nodeSheet(): Promise<NodeSheetState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const [view, { data: prof }] = await Promise.all([
    getRaidMapView(),
    createAdminClient()
      .from('profiles')
      .select('raid_items, has_sixth_berth, has_armory_expansion')
      .eq('id', user.id)
      .single(),
  ])
  if (!prof) return { error: 'No profile.' }

  return {
    doubloons: view.doubloons,
    shipClasses: view.shipClasses,
    ownedItems: (prof.raid_items as string[] | null) ?? [],
    navLevel: view.navLevel,
    musterParty: view.musterParty,
    choices: view.raidNodeChoices,
    spoilFree: view.spoilFree,
    spoilPaid: view.spoilPaid,
    hasSixthBerth: prof.has_sixth_berth === true,
    hasArmoryExpansion: prof.has_armory_expansion === true,
  }
}
