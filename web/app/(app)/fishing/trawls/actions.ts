'use server'

// Trawls — server actions. The rules and the claim-first collect run in
// lib/core/voyages; these check the session and hand the core the Supabase
// store. Types + reward math live in ./constants ('use server' strips
// non-async exports).
//
// NO revalidatePath in deployTrawl, deliberately. It used to revalidate /crew
// and /expeditions, and bought nothing on either: both are per-user and
// auth-gated, so neither is ever in the full route cache and both refetch on
// navigation regardless. What it DID do was cost the player: a Server Action
// that revalidates makes the Next router refetch the RSC payload for the route
// they are ON, the heaviest page in the game, right after the optimistic update.

import { getCurrentUser } from '@/lib/userData'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TrawlState, CollectTrawlResult } from './constants'
import { trawlData } from '@/lib/data/voyageData'
import * as core from '@/lib/core/voyages'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function getTrawlState(): Promise<TrawlState | { error: string }> {
  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }
  return core.getTrawlState(trawlData(createAdminClient()), user.id)
}

/** Deploy one crew to trawl a zone for 1h. Hard-locks the crew (no recall). */
export async function deployTrawl(zone: string, crewId: number): Promise<TrawlState | { error: string }> {
  const uid = await me()
  return uid ? core.deployTrawl(trawlData(createAdminClient()), uid, zone, crewId) : { error: 'Not authenticated' }
}

/** Collect a finished trawl: grant fishing XP + doubloons, free the slot. */
export async function collectTrawl(zone: string): Promise<CollectTrawlResult | { error: string }> {
  const uid = await me()
  return uid ? core.collectTrawl(trawlData(createAdminClient()), uid, zone) : { error: 'Not authenticated' }
}
