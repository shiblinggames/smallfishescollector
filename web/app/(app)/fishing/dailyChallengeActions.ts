'use server'

// THE DAILY CHALLENGES' actions. Each checks the session and hands
// lib/core/dailies the Supabase store; the snapshot, the claim guards and the
// Master crate live there, so the desktop build runs the same code.

import { getCurrentUser } from '@/lib/userData'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dailyData } from '@/lib/data/dailyData'
import * as core from '@/lib/core/dailies'
import type { DailyChallengeState } from '@/lib/dailyChallenges'
import type { CrateTier, CrateLoot } from '@/lib/crateLoot'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => dailyData(createAdminClient())

export async function getDailyChallenge(): Promise<DailyChallengeState | null> {
  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
  if (!user) return null
  return core.getDailyChallenge(db(), user.id)
}

export async function claimDailyReward(
  index: 0 | 1 | 2 | 3,
): Promise<
  | { doubloons: number; crate?: { tier: CrateTier; loot: CrateLoot } }
  | { error: string }
> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.claimDailyReward(db(), uid, index)
}

export async function claimDailySweep(): Promise<{ gems: number; awarded: number } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.claimDailySweep(db(), uid)
}
