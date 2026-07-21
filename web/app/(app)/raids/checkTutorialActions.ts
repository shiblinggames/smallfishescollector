'use server'

// One-shot tutorial for the boss mechanic-check system (telegraphed move ->
// counter with a crew ability). Read on a boss fight's mount, marked the first
// time a check the player faces. Persisted server-side (tour convention: a
// has_seen_* profile column, never localStorage — see [[feedback-tour-persistence]]).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Has the player already seen the mechanic-check tutorial? Defaults to true on
 *  any error so a hiccup never blocks the fight with a stuck modal. */
export async function getCheckTutorialSeen(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return true
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('has_seen_check_tutorial')
    .eq('id', user.id)
    .single()
  if (error) return true
  return data?.has_seen_check_tutorial === true
}

/** Mark the tutorial seen so it never fires again. Fire-and-forget from the client. */
export async function markCheckTutorialSeen(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const admin = createAdminClient()
  await admin.from('profiles').update({ has_seen_check_tutorial: true }).eq('id', user.id)
  return { ok: true }
}
