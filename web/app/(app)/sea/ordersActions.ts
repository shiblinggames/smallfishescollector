'use server'

// ── WHAT THE CAPTAIN'S ORDERS CHECKLIST NEEDS TO KNOW ───────────────────────
//
// Eight numbers about a captain, and whether the card has already latched shut.
// Read when the campaign panel OPENS rather than threaded down from the page:
// every one of them moves while you sail — you sign a hand on, you seat a
// party, you slot an item — and a card telling you to recruit your first crew
// twenty minutes after you did is worse than no card.
//
// The card itself is /expeditions' own (see CaptainsOrders): same orders, same
// order, same latch. Only the numbers are gathered here, because the hub gathers
// them from a page load the sea does not do.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { aggregateShipClasses } from '@/lib/shipClasses'

export type CaptainsOrdersState = {
  crewOwned: number
  raidCrew: number
  voyageCrew: number
  crewSlots: number
  equippedItems: number
  ownedItems: number
  raidsCleared: number
  voyagesRun: number
  /** profiles.captains_orders_done — latched, so a veteran never sees it. */
  done: boolean
}

export async function captainsOrders(): Promise<CaptainsOrdersState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const admin = createAdminClient()
  const [{ data: prof }, { data: crew }, { count: raids }, { count: voyages }] = await Promise.all([
    admin.from('profiles')
      .select('ship_tier, ship_classes, has_sixth_berth, equipped_raid_items, raid_items, captains_orders_done')
      .eq('id', user.id).single(),
    admin.from('user_crew').select('raid_slot, voyage_slot').eq('user_id', user.id).is('died_at', null),
    admin.from('raid_completions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('daily_voyages').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])
  if (!prof) return { error: 'No profile.' }

  const ship = EXPEDITION_SHIP_STATS[(prof.ship_tier as number | null) ?? 0]
  const classSlots = aggregateShipClasses((prof.ship_classes as Record<string, string> | null) ?? {}).crewSlots
  const rows = crew ?? []

  return {
    crewOwned: rows.length,
    raidCrew: rows.filter(c => c.raid_slot != null).length,
    voyageCrew: rows.filter(c => c.voyage_slot != null).length,
    crewSlots: (ship?.crewSlots ?? 1) + classSlots + (prof.has_sixth_berth === true ? 1 : 0),
    equippedItems: ((prof.equipped_raid_items as string[] | null) ?? []).length,
    ownedItems: ((prof.raid_items as string[] | null) ?? []).length,
    raidsCleared: raids ?? 0,
    voyagesRun: voyages ?? 0,
    done: prof.captains_orders_done === true,
  }
}
