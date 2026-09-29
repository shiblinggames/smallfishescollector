// ── THE RAID LOADOUT, READ SERVER-SIDE ──────────────────────────────────────
//
// Plain module, NOT 'use server'. getRaidPlayerStats(userId) used to be an
// export of raids/actions.ts, which made it a public endpoint that returned any
// captain's full loadout for any user id it was handed. Pages and server
// actions that already know who is asking call it from here instead.

// The loader and its types live in lib/raidLoadout (store-agnostic, so the
// offline build can use it); this wraps it with the Supabase store.
import { createAdminClient } from '@/lib/supabase/admin'
import { crewData } from './data/crewData'
import { getRaidPlayerStatsVia, type RaidPlayerStats } from './raidLoadout'
export type { RaidPlayerStats, RaidCrewMember } from './raidLoadout'
export { getRaidPlayerStatsVia } from './raidLoadout'

export async function getRaidPlayerStats(userId: string): Promise<RaidPlayerStats> {
  return getRaidPlayerStatsVia(crewData(createAdminClient()), userId)
}

