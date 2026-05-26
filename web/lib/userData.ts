// Centralised, request-scoped user/profile loader. Wraps the Supabase fetches in
// React's `cache()` so any server component in the same render that calls
// `getCurrentProfile()` gets ONE shared round trip instead of each one issuing
// its own. Today most tab pages fetch profile exactly once, so the dedup wins
// arrive when the same render has multiple consumers (e.g. once Nav moves into
// the root layout, both Nav and the page will share this single fetch).
//
// The loader returns the FULL profile row (`select('*')`) so downstream pages
// can destructure whichever columns they need without spawning new queries with
// drifting column lists — the historical cause of "every page selects a slightly
// different subset of profile" cruft. Prefer this loader over ad-hoc inline
// `from('profiles').select(...)` for the current user. Page-specific JOINs and
// related-table queries (inventory, raid_completions, etc.) stay in the page.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** The signed-in auth user for the current request, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/** The full profile row for the current user, or null. Cached per request.
 *  Selects `*` on purpose so downstream callers can use any column without
 *  triggering a new query. */
export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return data
})
