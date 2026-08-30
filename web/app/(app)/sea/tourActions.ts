'use server'

// LATCHES FOR THE SEA'S TEACHING.
//
// Profile columns, never localStorage — the house rule, and the reason is that
// a tour which replays after a reinstall, or on the captain's other device,
// reads as a bug rather than as help.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * THE CHART HAS TO BE TOLD THE STEP MOVED.
 *
 * /sea reads `sea_tour_step` on the server and hands it to the tour as its
 * resume point. The market advances that step and the captain comes back with
 * the browser's Back — which serves the CACHED payload of /sea, carrying the
 * step as it was when they first loaded it.
 *
 * The symptom is a tour that goes backwards: sell the catch, sail out, and be
 * asked to head south to the Shallows and fish again, because the page still
 * believes they are on beat one. Every write here invalidates the chart for the
 * same reason the fishing actions already do.
 */
function chartChanged() {
  revalidatePath('/sea')
}

/** Shut the arrival walkthrough for good. */
export async function markSeaTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient()
    .from('profiles').update({ has_seen_sea_tour: true }).eq('id', user.id)
  chartChanged()
}

/**
 * WHERE THE FIRST VOYAGE HAS GOT TO.
 *
 * The tour leaves the chart: it walks a new captain to the Mainland, ashore,
 * and into the Market to sell their first fish. That is a different route, so
 * the component driving it unmounts halfway through and a step held in state
 * would drop them at the door they were sent through.
 *
 * Only ever forwards. Two surfaces write this — the chart and the market — and
 * a stale render on either could otherwise walk the tour backwards into a beat
 * the captain has already done.
 */
export async function setSeaTourStep(step: number): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const n = Math.max(0, Math.min(99, Math.floor(step)))
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles').select('sea_tour_step').eq('id', user.id).single()
  if ((data?.sea_tour_step ?? 0) >= n) return
  await admin.from('profiles').update({ sea_tour_step: n }).eq('id', user.id)
  chartChanged()
}

/**
 * THE STEP, STRAIGHT FROM THE DATABASE.
 *
 * Belt and braces for the resume point. The page's copy of it can be stale —
 * a cached payload on a Back navigation is exactly how the tour was caught
 * walking backwards — and this is the value that cannot be. Asked for ONCE on
 * mount and only while a voyage is actually running, so a captain who has
 * finished the tour never pays for it.
 */
export async function getSeaTourStep(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { data } = await createAdminClient()
    .from('profiles').select('sea_tour_step').eq('id', user.id).single()
  return Number(data?.sea_tour_step ?? 0)
}

/**
 * Remember that a port's first-landfall line has been shown.
 *
 * Read-then-append rather than a set union, because Postgres arrays have no
 * upsert-a-member and the cost of losing a race here is that one captain sees
 * one hint twice. Guarding that with a transaction would be more machinery than
 * the failure deserves.
 */
export async function markSeaHintSeen(portId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const id = (portId ?? '').trim()
  if (!id) return

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles').select('sea_hints_seen').eq('id', user.id).single()
  const seen = ((data?.sea_hints_seen as string[] | null) ?? [])
  if (seen.includes(id)) return
  await admin.from('profiles')
    .update({ sea_hints_seen: [...seen, id] }).eq('id', user.id)
}
