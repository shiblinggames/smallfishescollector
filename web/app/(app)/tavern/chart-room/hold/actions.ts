'use server'

// The Quartermaster's Hold: server-authoritative play. The week's solutions
// only ever live in the store; the client receives givens only, and every
// tally and submit is judged in lib/core/chartRoom. Each action checks the
// session and hands the core the Supabase store.

import { getCurrentUser } from '@/lib/userData'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chartData } from '@/lib/data/chartData'
import * as core from '@/lib/core/chartRoom'
import type { HoldDifficulty, HoldState, TallyHoldResult, SubmitHoldResult } from './constants'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function getHoldState(): Promise<HoldState | { error: string }> {
  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }
  return core.getHoldState(chartData(createAdminClient()), user.id)
}

/** Persist in-flight entries and pencil marks so the player can resume. */
export async function saveHoldProgress(
  difficulty: HoldDifficulty,
  entries: string,
  notes?: string,
): Promise<{ ok: true } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.saveHoldProgress(chartData(createAdminClient()), uid, difficulty, entries, notes)
}

/** Tally the manifest: flags wrong filled cells. Spends the clean bonus. */
export async function tallyHold(
  difficulty: HoldDifficulty,
  entries: string,
): Promise<TallyHoldResult | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.tallyHold(chartData(createAdminClient()), uid, difficulty, entries)
}

export async function submitHold(
  difficulty: HoldDifficulty,
  entries: string,
): Promise<SubmitHoldResult | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.submitHold(chartData(createAdminClient()), uid, difficulty, entries)
}
