'use server'

// Treasure Match: server actions. The board is seeded and deterministic (one
// shared puzzle a week), and lib/core/chartRoom REPLAYS the submitted swaps to
// derive the score itself; the client's score is never taken on trust. Each
// action checks the session and hands the core the Supabase store.

import { getCurrentUser } from '@/lib/userData'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chartData } from '@/lib/data/chartData'
import * as core from '@/lib/core/chartRoom'
import type { MatchState, SubmitMatchResult } from './constants'

export async function getMatchState(): Promise<MatchState | { error: string }> {
  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }
  return core.getMatchState(chartData(createAdminClient()), user.id)
}

/** Replay the run from its swaps and bank any new tier. */
export async function submitMatch(moves: [number, number][]): Promise<SubmitMatchResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  return core.submitMatch(chartData(createAdminClient()), user.id, moves)
}
