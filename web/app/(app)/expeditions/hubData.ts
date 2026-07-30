import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/userData'
import { getCrewRoster } from '@/app/(app)/crew/actions'

// Shared per-request loaders for the expeditions hub AND the standalone
// Ship / Items / Forge routes.
//
// These used to live in page.tsx, which was fine while the ship screen was a
// section of that page. Now that Items and Forge are their own routes, both
// page.tsx and ShipHeroSection need the same loaders, so they live here rather
// than being duplicated: two copies of a React cache() would each hold their
// own in-flight promise and the hub would fetch the crew roster twice.

export const cachedCrewRoster = cache(() => getCrewRoster())

/** Crew currently out on a trawl — excluded from the ship loadout crew picker
 *  (they're reserved at sea; the server would reject the assignment anyway). */
export const cachedTrawlingCrewIds = cache(async (): Promise<number[]> => {
  const user = await getCurrentUser()
  if (!user) return []
  const admin = createAdminClient()
  const { data } = await admin.from('trawls').select('crew_id').eq('user_id', user.id)
  return ((data ?? []) as { crew_id: number }[]).map(r => r.crew_id)
})

/** The three ship-screen reveal gates (Ch3 Quartermaster → ultimate build; Raid 7
 *  Blockade → Sixth Berth; Raid 8 Throne → Expanded Armory) all ask "has this user
 *  cleared raid X". One `.in()` query answers all three; the boolean helpers below
 *  read from this shared (per-request cached) set instead of each hitting the DB. */
export const cachedShipRevealClears = cache(async (): Promise<Set<string>> => {
  const user = await getCurrentUser()
  if (!user) return new Set()
  const admin = createAdminClient()
  const { data } = await admin.from('raid_completions')
    .select('raid_id').eq('user_id', user.id)
    .in('raid_id', ['the_quartermaster', 'the_blockade', 'the_throne'])
  return new Set(((data ?? []) as { raid_id: string }[]).map(r => r.raid_id))
})

export const cachedChapter3Cleared = cache(async (): Promise<boolean> => (await cachedShipRevealClears()).has('the_quartermaster'))
export const cachedBlockadeCleared = cache(async (): Promise<boolean> => (await cachedShipRevealClears()).has('the_blockade'))
export const cachedThroneCleared   = cache(async (): Promise<boolean> => (await cachedShipRevealClears()).has('the_throne'))
