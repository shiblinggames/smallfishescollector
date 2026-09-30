'use server'

// ── WHAT KIP NEEDS TO KNOW BEFORE HE OPENS HIS MOUTH ────────────────────────
//
// One question: is this captain already on the register. He exists to tell
// you what a Captain gets, and there is no worse thing to say to somebody who
// has already paid for it. The membership card is mounted in the app shell and
// opens over the chart where you are.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import { smugglerStanding as standingCore } from '@/lib/core/sea'

/** Is the caller a Captain? Never throws: if the read fails he gives the pitch,
 *  and the till behind the button refuses a second sale on its own. */
export async function smugglerStanding(): Promise<{ isCaptain: boolean }> {
  // getSession, not getUser: two columns of the caller's own row.
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  const uid = session?.user?.id
  if (!uid) return { isCaptain: false }
  try { return await standingCore(seaData(createAdminClient()), uid) } catch { return { isCaptain: false } }
}
