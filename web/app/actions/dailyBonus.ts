'use server'

// THE DAILY HAUL's actions: the day's gems and bait, the week's crate, and the
// disc's state. Each checks the session and hands lib/core/dailies the
// Supabase store; the stamp-first guards live there.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dailyData } from '@/lib/data/dailyData'
import * as core from '@/lib/core/dailies'
import type { CrateLoot } from '@/lib/crateLoot'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => dailyData(createAdminClient())

export async function claimDailyBonus(): Promise<{ claimed: boolean; gems?: number; amount?: number }> {
  const uid = await me()
  if (!uid) return { claimed: false }
  return core.claimDailyBonus(db(), uid)
}

/** Daily bait: 20 chum for members, 20 worms for everyone else. */
export async function claimDailyBait(): Promise<{ claimed: boolean; baitType?: string; quantity?: number }> {
  const uid = await me()
  if (!uid) return { claimed: false }
  return core.claimDailyBait(db(), uid)
}

/** Weekly free crate: gold for members, wooden for everyone else. */
export async function claimWeeklyCrate(): Promise<
  | { claimed: false }
  | { claimed: true; tier: 'wooden' | 'gold'; loot: CrateLoot }
> {
  const uid = await me()
  if (!uid) return { claimed: false }
  return core.claimWeeklyCrate(db(), uid)
}

/** WHAT IS STILL WAITING, for the disc on the sea. */
export async function bonusState(): Promise<{
  isPremium: boolean
  gemsClaimed: boolean
  baitClaimed: boolean
  crateClaimed: boolean
} | null> {
  // getSession, not getUser: a read of the caller's own row, and the session is
  // enough to name them. See the note in lib/supabase.
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  const uid = session?.user?.id
  if (!uid) return null
  return core.bonusState(db(), uid)
}
