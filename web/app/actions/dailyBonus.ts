'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { kingWeekStr } from '@/app/(app)/tavern/trivia/constants'
import { reelCrate } from '@/app/(app)/fishing/actions'

// Daily Bonus — three claims. Gems + bait reset daily; the crate is weekly.
// Members get more of each: 150 vs 50 gems, chum vs worms, a gold crate vs a
// wooden one.
const DAILY_GEMS = 50
const MEMBER_DAILY_GEMS = 150
const DAILY_BAIT_QTY = 20

export async function claimDailyBonus(): Promise<{ claimed: boolean; gems?: number; amount?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles').select('gems, last_daily_claim, is_premium, premium_expires_at').eq('id', user.id).single()
  if (!profile || profile.last_daily_claim === today) return { claimed: false }

  const isPremium = isPremiumActive(profile)
  const bonus = isPremium ? MEMBER_DAILY_GEMS : DAILY_GEMS
  const newGems = (profile.gems ?? 0) + bonus

  await Promise.all([
    admin.from('profiles').update({ gems: newGems, last_daily_claim: today }).eq('id', user.id),
    admin.from('gem_transactions').insert({
      user_id: user.id,
      amount: bonus,
      reason: isPremium ? 'Daily bonus (Member)' : 'Daily bonus',
    }),
  ])

  return { claimed: true, gems: newGems, amount: bonus }
}

/** Daily bait — 20 chum for members, 20 worms for everyone else. */
export async function claimDailyBait(): Promise<{ claimed: boolean; baitType?: string; quantity?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles').select('last_worm_claim, is_premium, premium_expires_at').eq('id', user.id).single()
  if (!profile || profile.last_worm_claim === today) return { claimed: false }

  const baitType = isPremiumActive(profile) ? 'chum' : 'worm'
  const { data: existing } = await admin
    .from('bait_inventory').select('quantity').eq('user_id', user.id).eq('bait_type', baitType).maybeSingle()
  const newQty = (existing?.quantity ?? 0) + DAILY_BAIT_QTY

  await Promise.all([
    admin.from('profiles').update({ last_worm_claim: today }).eq('id', user.id),
    existing
      ? admin.from('bait_inventory').update({ quantity: newQty }).eq('user_id', user.id).eq('bait_type', baitType)
      : admin.from('bait_inventory').insert({ user_id: user.id, bait_type: baitType, quantity: newQty }),
  ])

  return { claimed: true, baitType, quantity: DAILY_BAIT_QTY }
}

/** Weekly free crate — gold for members, wooden for everyone else. Opens with
 *  the full fishing-crate loot table for its tier (doubloons / bait / cosmetic /
 *  pet) via the shared reelCrate roller. One per Monday-week. */
export async function claimWeeklyCrate(): Promise<
  | { claimed: false }
  | { claimed: true; tier: 'wooden' | 'gold'; loot: Awaited<ReturnType<typeof reelCrate>> }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { claimed: false }

  const admin = createAdminClient()
  const week = kingWeekStr()

  const { data: profile } = await admin
    .from('profiles').select('last_crate_claim_week, is_premium, premium_expires_at').eq('id', user.id).single()
  if (!profile || profile.last_crate_claim_week === week) return { claimed: false }

  // Stamp the gate FIRST so a fast double-tap can't open two crates.
  await admin.from('profiles').update({ last_crate_claim_week: week }).eq('id', user.id)

  const tier: 'wooden' | 'gold' = isPremiumActive(profile) ? 'gold' : 'wooden'
  const loot = await reelCrate('', tier)

  return { claimed: true, tier, loot }
}
