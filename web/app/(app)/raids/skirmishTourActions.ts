'use server'

// The Reef Skirmish's guided intro: four cards from Doby and Kat over the
// first fight, once. Read on the skirmish's mount, marked when the guide
// opens. Persisted server-side (tour convention: a has_seen_* profile column,
// never localStorage, see [[feedback-tour-persistence]]). Its own column
// rather than has_seen_raid_tutorial, which the retired practice page set as
// a side effect of a kill, so some accounts carry it without ever having seen
// a tour.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Has the player already seen the skirmish tour? Defaults to true on any
 *  error so a hiccup never puts a tour over a fight twice. */
export async function getSkirmishTourSeen(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return true
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('has_seen_skirmish_tour')
    .eq('id', user.id)
    .single()
  if (error) return true
  return data?.has_seen_skirmish_tour === true
}

/** Mark it seen so it never opens again. Fire-and-forget from the client. */
export async function markSkirmishTourSeen(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const admin = createAdminClient()
  await admin.from('profiles').update({ has_seen_skirmish_tour: true }).eq('id', user.id)
  return { ok: true }
}
