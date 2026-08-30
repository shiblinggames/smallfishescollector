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
// It reads the same sources the hub does rather than a second set of its own:
// the profile, `getDailyVoyageState`, `getCrewRoster`, and the eight most
// recent revealed voyages. React's `cache` dedup does not apply across a
// server action, so the queries are simply run in parallel here.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getCrewRoster, type CrewMember } from '@/app/(app)/crew/actions'
import { getDailyVoyageState, type DailyVoyage } from '@/app/(app)/expeditions/voyageActions'
import type { VoyageHistoryEntry } from '@/app/(app)/expeditions/VoyageHistory'

export type VoyageBoard = {
  roster: CrewMember[]
  shipTier: number
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
  expeditionXP: number
  voyages: VoyageHistoryEntry[]
  gauntletUpgrades: string[]
}

export async function voyageBoard(): Promise<VoyageBoard | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in.' }
  const admin = createAdminClient()

  const [profile, state, roster, history] = await Promise.all([
    getCurrentProfile(),
    getDailyVoyageState(),
    getCrewRoster(),
    admin
      .from('daily_voyages')
      .select('id, route, total_doubloons, total_gems, crew_lost, created_at, captains_log, events, tide_turner_drop, phantom_hook_drop')
      .eq('user_id', user.id)
      .eq('status', 'revealed')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  return {
    roster,
    shipTier: (profile?.ship_tier as number | null) ?? 0,
    todayVoyage: 'error' in state ? null : state.todayVoyage,
    readyVoyage: 'error' in state ? null : state.readyVoyage,
    expeditionXP: (profile?.expedition_xp as number | null) ?? 0,
    voyages: (history.data ?? []) as unknown as VoyageHistoryEntry[],
    // BOTH LOCKERS. Safe Passage and Swift Sails can come from either
    // gauntlet, and the panel states them out loud — a board that quietly
    // disagreed with the hub about how long a voyage takes would be worse than
    // one that said nothing.
    gauntletUpgrades: [
      ...((profile?.gauntlet_upgrades as string[] | null) ?? []),
      ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? []),
    ],
  }
}
