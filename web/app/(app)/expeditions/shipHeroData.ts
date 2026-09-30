'use server'

/**
 * ── THE SHIP SCREEN'S DATA, ONCE ─────────────────────────────────────────
 *
 * The ship screen appears on its routes and over the CHART (the Gunwharf's
 * "Manage her" and the Forge island open it where you are moored), and the
 * chart is a client component, so the fetch lives here as one action both
 * callers read. The shaping lives in lib/core/harbour (shipHeroProps); the
 * pieces come from the per-request caches the hub page shares with this screen
 * (./hubData), so the roster is not fetched twice.
 *
 * EVERY EXPORT IN A 'use server' MODULE MUST BE ASYNC, so the props TYPE is
 * derived on the client with `Awaited<ReturnType<...>>`.
 *
 * It reads the CALLER'S OWN profile and takes no arguments, so there is nothing
 * here to point at somebody else's ship.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfile } from '@/lib/userData'
import { harbourData } from '@/lib/data/harbourData'
import { shipHeroProps } from '@/lib/core/harbour'
import {
  cachedCrewRoster, cachedTrawlingCrewIds, cachedReadyBunkCount, cachedBunkLockedCrewIds,
  cachedChapter3Cleared, cachedBlockadeCleared, cachedThroneCleared,
} from './hubData'

export async function getShipHeroProps() {
  const [profile, roster, trawlingCrewIds, bunkLockedCrewIds, readyBunks, chapter3Cleared, blockadeCleared, throneCleared] = await Promise.all([
    getCurrentProfile(),
    cachedCrewRoster(),
    cachedTrawlingCrewIds(),
    cachedBunkLockedCrewIds(),
    cachedReadyBunkCount(),
    cachedChapter3Cleared(),
    cachedBlockadeCleared(),
    cachedThroneCleared(),
  ])
  return shipHeroProps(harbourData(createAdminClient()), {
    profile: (profile as Record<string, unknown> | null) ?? null,
    roster, trawlingCrewIds, bunkLockedCrewIds, readyBunks, chapter3Cleared, blockadeCleared, throneCleared,
  })
}
