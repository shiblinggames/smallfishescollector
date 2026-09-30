'use server'

// Lay the Rigging: server-authoritative. The board is solvable by
// construction; the full solve is validated in lib/core/chartRoom before any
// points are banked. Each action checks the session and hands the core the
// Supabase store.

import { getCurrentUser } from '@/lib/userData'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chartData } from '@/lib/data/chartData'
import * as core from '@/lib/core/chartRoom'
import type { RiggingState, SubmitRiggingResult } from './constants'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function getRiggingState(): Promise<RiggingState | { error: string }> {
  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }
  return core.getRiggingState(chartData(createAdminClient()), user.id)
}

/** Persist in-flight ropes so the player can resume (debounced client). */
export async function saveRiggingPaths(paths: Record<number, number[]>): Promise<{ ok: true } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.saveRiggingPaths(chartData(createAdminClient()), uid, paths)
}

export async function submitRigging(paths: Record<number, number[]>): Promise<SubmitRiggingResult | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.submitRigging(chartData(createAdminClient()), uid, paths)
}
