'use server'

// ── ONE SURVIVOR OF THE FISHING SCREEN'S FINN CODE ──────────────────────────
//
// The old encounter machinery (the wagers that took the verdict and the payout
// from the client) is retired (2026-09-17); he stands on the chart now and
// sea/finnActions owns every part of that. `markFinnRevealSeen` is the one
// thing still called, from sea/FishingHere at the moment an Ancient trophy
// lands and the mask comes off. The rule lives in lib/core/sea.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import { markFinnRevealSeen as markCore } from '@/lib/core/sea'

/** Marks the climax reveal as seen, so the reveal beat never fires twice. */
export async function markFinnRevealSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await markCore(seaData(createAdminClient()), user.id)
}
