'use server'

// The World Chart: server actions. Reveal state derives from lifetime
// puzzle_points; the one-time gem CLAIM per landmark is judged in
// lib/core/chartRoom. Each action checks the session and hands the core the
// Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chartData } from '@/lib/data/chartData'
import * as core from '@/lib/core/chartRoom'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function getWorldChartState(): Promise<{ points: number; claimed: number[] }> {
  const uid = await me()
  if (!uid) return { points: 0, claimed: [] }
  return core.getWorldChartState(chartData(createAdminClient()), uid)
}

/** Collect a discovered landmark's gems, once. */
export async function claimLandmark(landmarkId: number): Promise<
  { ok: true; gems: number; awarded: number; bonus: number; completed: boolean; claimed: number[] } | { error: string }
> {
  const uid = await me()
  if (!uid) return { error: 'Not signed in' }
  return core.claimLandmark(chartData(createAdminClient()), uid, landmarkId)
}
