'use server'

// ── WHAT KIP NEEDS TO KNOW BEFORE HE OPENS HIS MOUTH ────────────────────────
//
// One question: is this captain already on the register.
//
// It matters more than it looks. He exists to tell you what a Captain gets, and
// there is no worse thing to say to somebody who has already paid for it. A
// pitch aimed at a paying player is the game admitting it has not read its own
// records, and it is the kind of thing that makes a purchase feel unrecorded.
//
// This file used to park the boat beside him on the way to Tide Run, because
// that run was a different route and the chart unmounted to reach it. Tide Run
// is a separate product now and nothing here leaves the water: the membership
// card is mounted in the app shell and opens over the chart where you are.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'

/**
 * Is the caller a Captain?
 *
 * Reads the caller's own row and nothing else, and answers a boolean rather
 * than handing back the membership columns: the only thing the card on the
 * water does with this is choose which of two speeches to give.
 *
 * Never throws. If the read fails he gives the pitch, which is the harmless
 * side of the mistake — the till behind the button checks properly and refuses
 * a second sale ("already a Captain") on its own.
 */
export async function smugglerStanding(): Promise<{ isCaptain: boolean }> {
  const supabase = await createClient()
  // getSession, not getUser: this reads two columns of the caller's own row and
  // the session names them. See the note in lib/supabase.
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return { isCaptain: false }

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('is_premium, premium_expires_at')
    .eq('id', uid)
    .maybeSingle()

  // THE SHARED TEST, not `is_premium` on its own: a lapsed membership is a flag
  // that is still true with a date behind it. See lib/premium.
  return { isCaptain: isPremiumActive(data) }
}
