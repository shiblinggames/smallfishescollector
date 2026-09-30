// WHAT THE NAV SHOWS ABOUT THE CAPTAIN (split out 2026-09-30).
//
// The avatar's look, the purse, the badges waiting to be claimed and the
// voyages at sea. On the web these are read straight from the browser client
// (RLS scopes them; getSession() needs no auth round trip), because the Nav
// re-reads on every route change and a server action there would be a request
// per click. The desktop build swaps this module for one that reads the save
// (desktop/src/shims/navState.ts), the same way it swaps the database client.

import { createClient } from '@/lib/supabase/client'

export type NavProfile = {
  character_color: string | null
  equipped_hat: string | null
  avatar_bg_color: string | null
  avatar_border_color: string | null
  is_admin: boolean | null
  doubloons: number | null
  gems: number | null
  unlocked_badges: string[] | null
  claimed_badge_rewards: string[] | null
}

export type NavState = {
  profile: NavProfile | null
  /** Voyages still out: when each left and how long it takes. */
  pendingVoyages: { created_at: string; duration_ms: number | null }[]
}

/** The captain's Nav state, or null when nobody is signed in. */
export async function readNavState(): Promise<NavState | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null
  const [{ data: profile }, { data: voyages }] = await Promise.all([
    supabase.from('profiles').select('character_color, equipped_hat, avatar_bg_color, avatar_border_color, is_admin, doubloons, gems, unlocked_badges, claimed_badge_rewards').eq('id', user.id).single(),
    supabase.from('daily_voyages').select('created_at, duration_ms').eq('user_id', user.id).eq('status', 'pending'),
  ])
  return {
    profile: (profile as NavProfile | null) ?? null,
    pendingVoyages: (voyages ?? []) as NavState['pendingVoyages'],
  }
}
