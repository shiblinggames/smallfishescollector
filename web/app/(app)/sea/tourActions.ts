'use server'

// LATCHES FOR THE SEA'S TEACHING.
//
// Profile columns, never localStorage: a tour that replays after a reinstall,
// or on the captain's other device, reads as a bug rather than as help. The
// rules live in lib/core/seaSheets; each action checks the session and hands
// the core the Supabase store.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import * as core from '@/lib/core/seaSheets'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => seaData(createAdminClient())

/**
 * THE CHART HAS TO BE TOLD THE STEP MOVED.
 *
 * /sea reads `sea_tour_step` on the server and hands it to the tour as its
 * resume point. The market advances that step and the captain comes back with
 * the browser's Back, which serves the CACHED payload of /sea carrying the step
 * as it was. The symptom is a tour that goes backwards, so every write to the
 * first voyage's tour invalidates the chart.
 */
function chartChanged() {
  revalidatePath('/sea')
}

/** Skip the lot (Kong, 2026-09-27): both walkthroughs latched shut at once. */
export async function skipTutorials(): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.skipTutorials(db(), uid)
  chartChanged()
}

/** Shut the arrival walkthrough for good. */
export async function markSeaTourSeen(): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markSeaTourSeen(db(), uid)
  chartChanged()
}

/** Where the first voyage has got to. Only ever forwards. */
export async function setSeaTourStep(step: number): Promise<void> {
  const uid = await me()
  if (!uid) return
  if (await core.setSeaTourStep(db(), uid, step)) chartChanged()
}

/** The step, straight from the database (the page's copy can be stale). */
export async function getSeaTourStep(): Promise<number> {
  const uid = await me()
  if (!uid) return 0
  return core.getSeaTourStep(db(), uid)
}

/** Remember that a port's first-landfall line has been shown. */
export async function markSeaHintSeen(portId: string): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markSeaHintSeen(db(), uid, portId)
}

/** The anchorage's tour. No revalidation: it never leaves the water. */
export async function markGateTourSeen(): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markGateTourSeen(db(), uid)
}

/** Only ever forwards, same as the first voyage's. */
export async function setGateTourStep(step: number): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.setGateTourStep(db(), uid, step)
}
