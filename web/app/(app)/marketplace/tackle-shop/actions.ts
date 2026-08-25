'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stampBadges } from '@/lib/badgeGrant'
import { getBait } from '@/lib/bait'
import { RODS, isCaptainRod } from '@/lib/rods'
import { REELS } from '@/lib/reels'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { fishingGearLevelReq } from '@/lib/gearGating'
import { provenCaughtSpecies } from '@/lib/collection'
import { isPremiumActive } from '@/lib/premium'
import { revalidatePath } from 'next/cache'

export async function buyBait(
  baitType: string,
  qty: number,
): Promise<{ doubloons: number; newQty: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const bait = getBait(baitType)
  if (!bait || bait.shopCost <= 0) return { error: 'Not for sale' }
  if (!Number.isInteger(qty) || qty <= 0) return { error: 'Invalid quantity' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const totalCost = bait.shopCost * qty
  if (profile.doubloons < totalCost) return { error: `Need ${totalCost.toLocaleString()} ⟡` }

  // Atomic debit first (relative, balance-guarded) so parallel buys of two
  // different bait types can't both settle against one balance.
  const { data: newDoubloons } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: totalCost })
  if (newDoubloons == null) return { error: `Need ${totalCost.toLocaleString()} ⟡` }

  const { data: existing } = await admin
    .from('bait_inventory')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('bait_type', baitType)
    .single()

  const newQty = (existing?.quantity ?? 0) + qty

  await Promise.all([
    existing
      ? admin.from('bait_inventory')
          .update({ quantity: newQty })
          .eq('user_id', user.id)
          .eq('bait_type', baitType)
      : admin.from('bait_inventory')
          .insert({ user_id: user.id, bait_type: baitType, quantity: qty }),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -totalCost,
      reason: `Bought ${qty}× ${bait.name}`,
    }),
  ])

  return { doubloons: newDoubloons, newQty }
}

export async function purchaseRod(
  rodTier: number,
): Promise<{ doubloons: number; ownedRods: number[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const rod = RODS.find(r => r.tier === rodTier)
  if (!rod) return { error: 'Invalid rod' }
  if (rod.cost === 0 || rod.earnedOnly) return { error: 'This rod cannot be purchased' }
  // NOT SOLD ASHORE. Enforced here as well as hidden from the list, because a
  // hidden row is a UI decision and this is a rule.
  if (rod.traderOnly) return { error: 'No chandler ashore carries that. You will have to find one who does.' }

  const admin = createAdminClient()

  const [{ data: profile }, { data: alreadyOwned }] = await Promise.all([
    admin.from('profiles').select('doubloons, fishing_xp, is_premium, premium_expires_at').eq('id', user.id).single(),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id).eq('rod_tier', rodTier).maybeSingle(),
  ])

  if (!profile) return { error: 'Profile not found' }
  if (alreadyOwned) return { error: 'Already owned' }
  if (isCaptainRod(rod) && !isPremiumActive(profile)) return { error: `The ${rod.name} is a Captain's rod — become a Captain to wield it.` }
  const levelReq = fishingGearLevelReq(rod)
  if (getLevelFromXP(profile.fishing_xp ?? 0) < levelReq) return { error: `Reach Fishing Lv ${levelReq} to buy the ${rod.name}` }
  if (profile.doubloons < rod.cost) return { error: `Need ${rod.cost.toLocaleString()} ⟡` }

  // Atomic debit FIRST — a relative decrement guarded on the live balance, so
  // two concurrent buys of different rods can't both read the same balance and
  // pay for only one (the old full-value overwrite lost one deduction).
  const { data: newDoubloons } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: rod.cost })
  if (newDoubloons == null) return { error: `Need ${rod.cost.toLocaleString()} ⟡` }

  await Promise.all([
    admin.from('rod_inventory').insert({ user_id: user.id, rod_tier: rodTier }),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -rod.cost,
      reason: `Bought ${rod.name}`,
    }),
  ])

  const { data: rows } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id)
  const ownedRods = (rows ?? []).map(r => r.rod_tier)

  revalidatePath('/marketplace/tackle-shop')
  return { doubloons: newDoubloons, ownedRods }
}

// Quick-sell rate for owned rods. Matches the 65% fish quick-sell lane
// — same casual-recovery mental model across the game ("you get 65% of
// what you paid back, immediately"). See [[feedback_market_two_lanes]]
// for why we never go full price-of-purchase on player-initiated sells.
const ROD_SELL_RATE = 0.65

export async function sellRod(
  rodTier: number,
): Promise<{ doubloons: number; ownedRods: number[]; refund: number; rodTier: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const rod = RODS.find(r => r.tier === rodTier)
  if (!rod) return { error: 'Invalid rod' }
  // Free starter + event/completionist rods cost zero doubloons to
  // obtain, so there's nothing to refund — block the sale rather than
  // let them be deleted for 0.
  if (rod.cost === 0 || rod.earnedOnly) return { error: 'This rod cannot be sold' }

  const admin = createAdminClient()

  const [{ data: profile }, { data: owned }] = await Promise.all([
    admin.from('profiles').select('doubloons, rod_tier').eq('id', user.id).single(),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id).eq('rod_tier', rodTier).maybeSingle(),
  ])

  if (!profile) return { error: 'Profile not found' }
  if (!owned)   return { error: "You don't own this rod" }

  // Selling the EQUIPPED rod is allowed — we auto-equip the Bamboo
  // (tier 0, free starter) so the player is never left without a rod.
  // Players were tripping over the previous 'unequip first' gate; with
  // a guaranteed fallback the equipped-rod case has no recovery hole.
  const wasEquipped = profile.rod_tier === rodTier
  const newRodTier  = wasEquipped ? 0 : (profile.rod_tier as number)

  const refund = Math.floor(rod.cost * ROD_SELL_RATE)
  const newDoubloons = (profile.doubloons as number) + refund

  const profileUpdate: { doubloons: number; rod_tier?: number } = { doubloons: newDoubloons }
  if (wasEquipped) profileUpdate.rod_tier = 0

  await Promise.all([
    admin.from('rod_inventory').delete().eq('user_id', user.id).eq('rod_tier', rodTier),
    admin.from('profiles').update(profileUpdate).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: refund,
      reason: `Sold ${rod.name}`,
    }),
  ])

  const { data: rows } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id)
  const ownedRods = (rows ?? []).map(r => r.rod_tier)

  revalidatePath('/marketplace/tackle-shop')
  return { doubloons: newDoubloons, ownedRods, refund, rodTier: newRodTier }
}

export async function claimCompletionistRod(): Promise<{ ownedRods: number[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const COMPLETIONIST_TIER = 14
  const admin = createAdminClient()

  const [{ data: profile }, { data: alreadyOwned }, { data: collRows }, { data: speciesRows }] = await Promise.all([
    admin.from('profiles').select('fishing_xp, ancient_catches, lifetime_species, prestige_levels').eq('id', user.id).single(),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id).eq('rod_tier', COMPLETIONIST_TIER).maybeSingle(),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
    admin.from('fish_species').select('id, habitat'),
  ])

  if (!profile) return { error: 'Profile not found' }
  if (alreadyOwned) return { error: 'Already owned' }

  const level = getLevelFromXP(profile.fishing_xp ?? 0)
  if (level < 100) return { error: `Need level 100 (you're level ${level})` }
  // Prestige-proof completion (see lib/collection): the lifetime set + live
  // collection + Ancient trophies, plus every non-ancient species if all four
  // zones are prestiged. Ancient Deep is never wiped, so it stays required.
  const allSpecies = (speciesRows ?? []) as { id: number; habitat: string }[]
  const caught = provenCaughtSpecies(allSpecies, {
    lifetime: profile.lifetime_species as number[] | null,
    liveIds: (collRows ?? []).map(r => r.fish_id),
    ancientCatches: profile.ancient_catches as number[] | null,
    prestige: profile.prestige_levels as Record<string, number> | null,
  })
  const missing = allSpecies.filter(s => !caught.has(s.id)).length
  if (missing > 0) return { error: `Catch all ${allSpecies.length} species first` }

  await admin.from('rod_inventory').insert({ user_id: user.id, rod_tier: COMPLETIONIST_TIER })

  // The Completionist badge — hook-granted at the moment of claim (not derivable
  // from profile columns; rod ownership lives in rod_inventory).
  const { data: badgeRow } = await admin.from('profiles').select('unlocked_badges, badge_unlocked_at').eq('id', user.id).single()
  const badges = (badgeRow?.unlocked_badges as string[] | null) ?? []
  if (!badges.includes('completionist_rod')) {
    await admin.from('profiles').update({ unlocked_badges: [...badges, 'completionist_rod'], badge_unlocked_at: stampBadges((badgeRow as { badge_unlocked_at?: unknown } | null)?.badge_unlocked_at, ['completionist_rod']) }).eq('id', user.id)
  }

  const { data: rows } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id)
  const ownedRods = (rows ?? []).map(r => r.rod_tier)

  revalidatePath('/marketplace/tackle-shop')
  return { ownedRods }
}

export async function equipRod(
  rodTier: number,
): Promise<{ rodTier: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const rod = RODS[rodTier]
  if (!rod) return { error: 'Invalid rod' }

  const admin = createAdminClient()

  // Tier 0 (Bamboo Rod) is the free starter rod — always equippable
  if (rodTier !== 0) {
    const { data: owned } = await admin
      .from('rod_inventory')
      .select('rod_tier')
      .eq('user_id', user.id)
      .eq('rod_tier', rodTier)
      .maybeSingle()

    if (!owned) return { error: 'Rod not owned' }
  }

  await admin.from('profiles').update({ rod_tier: rodTier }).eq('id', user.id)

  revalidatePath('/marketplace/tackle-shop')
  return { rodTier }
}

export async function buyReel(): Promise<{ reelTier: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('reel_tier, doubloons, fishing_xp')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const currentTier = profile.reel_tier ?? 0
  const nextTier = currentTier + 1

  if (nextTier >= REELS.length) return { error: 'Already at max tier' }

  const cost = REELS[nextTier].cost
  const reelReq = fishingGearLevelReq(REELS[nextTier])
  if (getLevelFromXP(profile.fishing_xp ?? 0) < reelReq) return { error: `Reach Fishing Lv ${reelReq} to buy the ${REELS[nextTier].name}` }
  if (profile.doubloons < cost) return { error: 'Not enough doubloons' }

  const newDoubloons = profile.doubloons - cost

  await Promise.all([
    admin.from('profiles').update({ reel_tier: nextTier, doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -cost,
      reason: `Bought ${REELS[nextTier].name}`,
    }),
  ])

  revalidatePath('/marketplace/tackle-shop')
  return { reelTier: nextTier, doubloons: newDoubloons }
}
