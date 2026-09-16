'use server'

// ── THE HONEYPOT ────────────────────────────────────────────────────────────
//
// A server action the real client never calls. It is imported by a client
// component so its action id is in the manifest like every other action, and
// it sits behind a custom DOM event nothing in the game dispatches. So the only
// way to reach it is to be reading the bundle or replaying requests: a script,
// or a person with the dev tools open trying things. Either way it is worth a
// flag, and unlike every other anomaly signal this one has NO honest trigger,
// which is what makes it severity five.
//
// It pays nothing, refuses politely, and never blocks. Detection is a record;
// the freeze switch on the admin page is the decision.

import { headers } from 'next/headers'
import { getCurrentUser } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'
import { flagAnomaly } from '@/lib/anomaly'

export async function claimFoundersChest(): Promise<{ error: string }> {
  const user = await getCurrentUser()
  if (user) {
    const h = await headers()
    await flagAnomaly(createAdminClient(), user.id, 'honeypot:claimFoundersChest', 5, {
      ua: h.get('user-agent') ?? null,
      referer: h.get('referer') ?? null,
    })
  }
  return { error: 'Nothing here.' }
}
