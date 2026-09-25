// ── BOUNTY EVENTS, SERVER-ONLY ──────────────────────────────────────────────
//
// Plain module, NOT 'use server'. This used to be an exported function in
// expeditions/bountyActions.ts, and every export of a 'use server' file is an
// HTTP endpoint: anyone could POST a bounty_events row for any user id and any
// value, and damage and depth bounties pay gems off those rows. Only server code
// that already knows who is asking may call it now.

import { createAdminClient } from '@/lib/supabase/admin'

/** Called by the gauntlet when a run ends (and by raid / gauntlet hits for the
 *  damage bounties). The only thing bounties needed that the game was not
 *  already writing down. Fire and forget: a lost event costs a bounty tick,
 *  never a run. */
export async function logBountyEvent(userId: string, kind: string, value: number): Promise<void> {
  try {
    await createAdminClient().from('bounty_events').insert({ user_id: userId, kind, value })
  } catch { /* a bounty tick is never worth failing a run over */ }
}
