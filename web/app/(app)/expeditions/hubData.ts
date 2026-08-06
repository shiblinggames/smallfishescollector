import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/userData'
import { getCrewRoster } from '@/app/(app)/crew/actions'
import { stintDone, storesCapHours } from '@/lib/crewBunks'

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

/**
 * How many hands have finished a stint in the Crew Hall and are waiting to be
 * collected. Drives the nudge on the hub's Crew column, so a finished stint is
 * visible without opening the crew page.
 *
 * Readiness is computed from the row's OWN cap_hours, not the player's current
 * Stores tier, for the same reason the payout is: a stint runs on the terms it
 * was struck on. `cap_hours` is null only on rows predating the column, which
 * fall back to the live tier.
 */
/** Crew whose bunk stint is STILL RUNNING. Hard-locked out of raid seats,
 *  voyage seats and trawls, so the ship picker has to know about them or it
 *  offers hands the server will refuse. */
export const cachedBunkLockedCrewIds = cache(async (): Promise<number[]> => {
  const user = await getCurrentUser()
  if (!user) return []
  const admin = createAdminClient()
  const [{ data: rows }, { data: prof }] = await Promise.all([
    admin.from('crew_hall_bunks').select('crew_id, since, cap_hours').eq('user_id', user.id),
    admin.from('profiles').select('crew_stores_level').eq('id', user.id).single(),
  ])
  const liveCap = storesCapHours((prof as { crew_stores_level?: number } | null)?.crew_stores_level ?? 1)
  const now = Date.now()
  return ((rows ?? []) as { crew_id: number; since: string; cap_hours: number | null }[])
    .filter(r => !stintDone(r.since, now, r.cap_hours ?? liveCap))
    .map(r => r.crew_id)
})

export const cachedReadyBunkCount = cache(async (): Promise<number> => {
  const user = await getCurrentUser()
  if (!user) return 0
  const admin = createAdminClient()
  const [{ data: rows }, { data: prof }] = await Promise.all([
    admin.from('crew_hall_bunks').select('since, cap_hours').eq('user_id', user.id),
    admin.from('profiles').select('crew_stores_level').eq('id', user.id).single(),
  ])
  const liveCap = storesCapHours((prof as { crew_stores_level?: number } | null)?.crew_stores_level ?? 1)
  const now = Date.now()
  return ((rows ?? []) as { since: string; cap_hours: number | null }[])
    .filter(r => stintDone(r.since, now, r.cap_hours ?? liveCap)).length
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
    .in('raid_id', ['the_quartermaster', 'the_blockade', 'the_throne', 'the_sunken_hand', 'captain_krust', 'tollmasters_cut'])
  return new Set(((data ?? []) as { raid_id: string }[]).map(r => r.raid_id))
})

export const cachedChapter3Cleared = cache(async (): Promise<boolean> => (await cachedShipRevealClears()).has('the_quartermaster'))
export const cachedBlockadeCleared = cache(async (): Promise<boolean> => (await cachedShipRevealClears()).has('the_blockade'))
export const cachedThroneCleared   = cache(async (): Promise<boolean> => (await cachedShipRevealClears()).has('the_throne'))
export const cachedFinaleCleared   = cache(async (): Promise<boolean> => (await cachedShipRevealClears()).has('the_sunken_hand'))
/** The bounty board opens at the END OF CHAPTER I, not the end of the campaign.
 *  Gating it on the finale meant two captains in the game could see it at all;
 *  Krust puts it in front of eight, and the rungs above are what the rest of
 *  the campaign is worth. */
export const cachedBountiesOpen    = cache(async (): Promise<boolean> => (await cachedShipRevealClears()).has('captain_krust'))
/** The clears the bounty rung is derived from. Same single query again. */
export const cachedBountyClears    = cache(async (): Promise<Set<string>> => cachedShipRevealClears())
