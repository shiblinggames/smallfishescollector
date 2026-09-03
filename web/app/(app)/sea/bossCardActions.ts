'use server'

// ── WHAT THE BOSS CARD NEEDS, FOR A CAPTAIN WHO SAILED UP TO ONE ────────────
//
// The card that opens before a fight — the boss, the drops, the records, and
// the choice between a normal run and the challenge — is `BossFightModal`, and
// it already exists on /expeditions. The sea does not get its own copy of it;
// it gets the same component and therefore needs the same inputs.
//
// `getRaidMapView` is where nearly all of it comes from, and using it rather
// than assembling a smaller payload by hand is the point: it is what the node
// map itself reads, so the card at sea cannot drift from the card on the page.
// Everything else on this list is a column on the profile.

import { getCurrentUser } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRaidMapView, type RaidRecords } from '@/app/(app)/expeditions/raidMapActions'
import { getRaidPlayerStats } from '@/app/(app)/raids/actions'
import { ownedSpecialIds } from '@/lib/specialItems'
import type { RaidNodeView } from '@/lib/raidMap'

export type BossCardState = {
  views: RaidNodeView[]
  raidRecords: Record<string, RaidRecords>
  ownedRaidItems: string[]
  ownedShipSkins: string[]
  ownedSpecialItems: string[]
  totalFortune: number
  repairOwed: number
  clearedNodeIds: string[]
}

export async function bossCardState(): Promise<BossCardState | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in.' }

  const admin = createAdminClient()
  const [map, stats, profileRes] = await Promise.all([
    getRaidMapView(),
    getRaidPlayerStats(user.id),
    admin.from('profiles')
      .select('raid_items, ship_skins, raid_repair_owed, special_items')
      .eq('id', user.id)
      .single(),
  ])
  const profile = profileRes.data as Record<string, unknown> | null

  return {
    views: map.views,
    raidRecords: map.raidRecords,
    ownedRaidItems: (profile?.raid_items as string[] | null) ?? [],
    ownedShipSkins: (profile?.ship_skins as string[] | null) ?? [],
    ownedSpecialItems: ownedSpecialIds(profile),
    totalFortune: stats.totalFortune,
    repairOwed: (profile?.raid_repair_owed as number | null) ?? 0,
    // The card masks a boss it has no business naming yet, and it decides that
    // from what you have cleared rather than from the node's own status.
    clearedNodeIds: map.views.filter(v => v.status === 'cleared').map(v => v.node.id),
  }
}
