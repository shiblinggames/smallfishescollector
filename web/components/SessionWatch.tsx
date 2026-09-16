'use client'

// ── ONE DEVICE AT A TIME, AND THE OTHER ONE IS TOLD ─────────────────────────
//
// Signing in revokes every other session for the account (see
// app/auth/callback/route.ts). The revoked device's client library finds out on
// its next token refresh, which it attempts on its own ticker and whenever the
// tab becomes visible, so picking the old device back up is itself the thing
// that triggers it. The library clears the session and fires SIGNED_OUT.
//
// Without this, that device would sit on a page it can no longer load data for,
// which reads as the game being broken rather than as having been signed out.
// This takes it to the door with a line saying why.
//
// A HARD NAVIGATION, not a router push: everything held in memory on this page
// belongs to a session that no longer exists, and the door should open on a
// clean document rather than on a chart still holding somebody's boat.
//
// Mounted in the (app) shell, which is every screen behind a login. The door
// itself is outside that group, so this never runs there and cannot loop.

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { tookLeave } from '@/lib/signOut'

export default function SessionWatch() {
  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event !== 'SIGNED_OUT') return
      // Asked for, by the Sign Out button. It does its own navigating.
      if (tookLeave()) return
      window.location.assign('/login?ended=elsewhere')
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return null
}
