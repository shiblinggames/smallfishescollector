'use server'

// The daily voyage. The rules and the one-shot guards run in lib/core/voyages;
// these check the session and hand the core the Supabase store. The one
// web-only step is here: the Captain's Log, written by the AI after the
// response is sent.

import { getCurrentUser } from '@/lib/userData'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { VoyageRoute } from '@/lib/voyageEvents'
import { generateAndSaveVoyageLog } from '@/lib/captains-log'
import { voyageData } from '@/lib/data/voyageData'
import * as core from '@/lib/core/voyages'

export type DailyVoyage = import('@/lib/core/voyages').DailyVoyage

const db = () => voyageData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function getDailyVoyageState(): Promise<{
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
} | { error: string }> {
  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' }
  return core.getDailyVoyageState(db(), user.id)
}

/** user_crew ids currently out on a trawl (locked from voyages). */
export async function getTrawlingCrewIds(): Promise<number[]> {
  const uid = await me()
  return uid ? core.getTrawlingCrewIds(db(), uid) : []
}

export async function sendDailyVoyage(route: VoyageRoute = 'open'): Promise<
  { ok: true; voyage: DailyVoyage } | { error: string }
> {
  const uid = await me()
  return uid ? core.sendDailyVoyage(db(), uid, route) : { error: 'Unauthorized' }
}

export async function revealVoyageResults(voyageId: number): Promise<core.VoyageReveal> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const { result, log } = await core.revealVoyageResults(db(), uid, voyageId)
  // Schedule captain's log generation after the response is sent.
  if (log) after(() => generateAndSaveVoyageLog(log))
  return result
}

export async function fetchVoyageCaptainsLog(voyageId: number): Promise<{ log: string | null } | { error: string }> {
  const uid = await me()
  return uid ? core.fetchVoyageCaptainsLog(db(), uid, voyageId) : { error: 'Unauthorized' }
}
