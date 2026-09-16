'use client'

// ── LEAVING ON PURPOSE ──────────────────────────────────────────────────────
//
// Signing in on a new device now revokes every other session (see the auth
// callback), and a revoked device discovers it on its next token refresh and
// fires SIGNED_OUT. `SessionWatch` listens for that and sends the browser to
// the door with a line saying why.
//
// A captain who pressed Sign Out fires the same event, and telling them they
// were signed in somewhere else would be a lie. So a deliberate sign-out
// leaves a note first, in this tab only, and the watcher stands down for it.

import { createClient } from '@/lib/supabase/client'

export const SIGN_OUT_KEY = 'stb:leaving'

/** True if the SIGNED_OUT in this tab was asked for. Clears the note. */
export function tookLeave(): boolean {
  try {
    const yes = sessionStorage.getItem(SIGN_OUT_KEY) === '1'
    sessionStorage.removeItem(SIGN_OUT_KEY)
    return yes
  } catch { return false }
}

/** Sign out from a button. Marks it deliberate, then goes. */
export async function signOutHere(): Promise<void> {
  try { sessionStorage.setItem(SIGN_OUT_KEY, '1') } catch { /* private window */ }
  try {
    await createClient().auth.signOut()
  } catch {
    // The session is going either way: the cookies are cleared locally even
    // when the round trip fails, and the caller navigates to the door.
  }
}
