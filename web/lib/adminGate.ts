// ── THE BENCHES ARE NOT FOR PLAYERS ─────────────────────────────────────────
//
// Plain module, NOT 'use server': that directive drops non-async exports, and
// this is only ever called from a Server Component's body anyway.
//
// A tuner, a spike, a prototype and an old tutorial were all routable by URL
// with nothing in front of them. Nothing links to any of them, which is how it
// went unnoticed: a page nobody can find is a page nobody checks. But a tester
// who guesses /demo gets a pack-opening prototype for an economy the game no
// longer has, and one who guesses /raids/turnbased gets a banner reading
// PREVIEW over a mechanic that shipped months ago. The first thing either
// teaches is that the game is not finished.
//
// The calibration pages under /sea already had the right shape, copied by hand
// into each of them. This is that shape, once, so the next bench cannot forget
// it.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

/**
 * Admins through, everybody else back to the chart. Call at the top of any
 * page that is a tool rather than a place: it never returns for a non-admin.
 */
export async function adminOnlyPage(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')
}
