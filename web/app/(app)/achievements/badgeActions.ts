'use server'

// BADGES: derived from what the game already records, claimed for their
// rewards, worn, and the few raid feats the client may unlock mid-fight. Each
// action checks the session and hands lib/core/progress the Supabase store; the
// conditions are lib/badgeConditions, shared with the Achievement Points board.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { progressData } from '@/lib/data/progressData'
import * as core from '@/lib/core/progress'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => progressData(createAdminClient())

/** Grant every badge whose condition is met but not yet recorded. */
export async function reconcileBadges(): Promise<string[]> {
  const uid = await me()
  if (!uid) return []
  return core.reconcileBadges(db(), uid)
}

/** Claim one earned badge's reward, once. */
export async function claimBadgeReward(badgeId: string): Promise<{ newDoubloons: number; newGems: number; claimed: string[]; amount: number; gems: number } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.claimBadgeReward(db(), uid, badgeId)
}

/** Claim every earned-but-unclaimed badge reward at once. */
export async function claimAllBadgeRewards(): Promise<{ newDoubloons: number; newGems: number; claimed: string[]; totalGranted: number; totalGems: number; count: number } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.claimAllBadgeRewards(db(), uid)
}

export async function getUnlockedBadges(): Promise<string[]> {
  const uid = await me()
  if (!uid) return []
  return core.getUnlockedBadges(db(), uid)
}

/** Only the raid combat feats (CLIENT_GRANTABLE_BADGES) may be unlocked here. */
export async function unlockBadge(badgeId: string): Promise<{ ok: true } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.unlockBadge(db(), uid, badgeId)
}

export async function equipBadge(badgeId: string, slot: 0 | 1 | 2): Promise<{ equipped: string[] } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.equipBadge(db(), uid, badgeId, slot)
}

export async function unequipBadge(slot: 0 | 1 | 2): Promise<{ equipped: string[] } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.unequipBadge(db(), uid, slot)
}
