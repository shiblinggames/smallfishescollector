'use server'

// THE CREW HALL'S BUNKS — server actions. The rules run in lib/core/crew (and
// the settlement in lib/crewBunkSettle); these check the session and hand the
// core the Supabase store.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { crewData } from '@/lib/data/crewData'
import * as core from '@/lib/core/crew'
import type { CrewActionResult } from './actions'

export type BunkClaimResult = import('@/lib/core/crew').BunkClaimResult

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Put a hand in a bunk; `hours` counts on the Leviathan bunk only. */
export async function bunkCrew(crewId: number, slot: number, hours?: number): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.bunkCrew(crewData(createAdminClient()), uid, crewId, slot, hours) : { error: 'Not signed in' }
}

/** Answer a Leviathan offer: keep what the hand carries, or take the new roll. */
export async function resolveTraitOffer(crewId: number, accept: boolean): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.resolveTraitOffer(crewData(createAdminClient()), uid, crewId, accept) : { error: 'Not signed in' }
}

/** Collect ONE finished stint (nothing happens while it is still running). */
export async function collectBunk(crewId: number): Promise<BunkClaimResult> {
  const uid = await me()
  return uid ? core.collectBunk(crewData(createAdminClient()), uid, crewId) : { error: 'Not signed in' }
}

/** Drills buy XP PER HOUR. */
export async function buyDrill(): Promise<CrewActionResult> {
  return buyUpgrade('drill')
}

/** Stores buy HOW MANY HOURS a bunk keeps earning before it fills. */
export async function buyStores(): Promise<CrewActionResult> {
  return buyUpgrade('stores')
}

async function buyUpgrade(kind: 'drill' | 'stores'): Promise<CrewActionResult> {
  const uid = await me()
  if (!uid) return { error: 'Not signed in' }
  const r = await core.buyHallUpgrade(crewData(createAdminClient()), uid, kind)
  // The chart draws the hall's building and counts its berths from the page's
  // copy of these tiers; it hears a purchase here or not until a reload.
  if ('state' in r) revalidatePath('/sea')
  return r
}
