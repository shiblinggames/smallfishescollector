'use server'

// The Parlor's rank rewards and guide. Each action checks the session and
// hands lib/core/parlor the Supabase store; the claim math lives in ./constants
// and the double-claim guard in the core.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triviaData } from '@/lib/data/triviaData'
import * as core from '@/lib/core/parlor'
import type { ClaimParlorResult } from '@/lib/core/parlor'

export type { ClaimParlorResult } from '@/lib/core/parlor'

/** Collect the next unclaimed rank the player has reached (one rank's gems). */
export async function claimParlorRank(): Promise<ClaimParlorResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  return core.claimParlorRank(triviaData(createAdminClient()), user.id)
}

// First-visit Parlor guide dismissal (see components/LobbyGuide).
export async function markParlorGuideSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await core.markParlorGuideSeen(triviaData(createAdminClient()), user.id)
}
