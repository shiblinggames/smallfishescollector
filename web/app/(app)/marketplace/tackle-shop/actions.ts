'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stampBadges } from '@/lib/badgeGrant'
import { getBait } from '@/lib/bait'
import { RODS, isCaptainRod, ROD_SELL_RATE } from '@/lib/rods'
import { REELS } from '@/lib/reels'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { fishingGearLevelReq } from '@/lib/gearGating'
import { completionistProgress, completionistBlocker } from '@/lib/completionist'
import { isPremiumActive } from '@/lib/premium'
import { revalidatePath } from 'next/cache'
import { grant, spend } from '@/lib/wallet'

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

  // Added in place, so a cast spending this bait meanwhile is not undone.
  await admin.rpc('upsert_bait', { p_user_id: user.id, p_bait_type: baitType, p_qty: qty })
  const { data: existing } = await admin
    .from('bait_inventory')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('bait_type', baitType)
    .single()
  const newQty = existing?.quantity ?? qty

  await Promise.all([
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
  if (isCaptainRod(rod) && !isPremiumActive(profile)) return { error: `The ${rod.name} is a Captain's rod. Become a Captain to wield it.` }
  const levelReq = fishingGearLevelReq(rod)
  if (getLevelFromXP(profile.fishing_xp ?? 0) < levelReq) return { error: `Reach Fishing Lv ${levelReq} to buy the ${rod.name}` }
  if (profile.doubloons < rod.cost) return { error: `Need ${rod.cost.toLocaleString()} ⟡` }

  // Atomic debit FIRST — a relative decrement guarded on the live balance, so
  // two concurrent buys of different rods can't both read the same balance and
  // pay for only one (the old full-value overwrite lost one deduction).
  const { data: newDoubloons } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: rod.cost })
  if (newDoubloons == null) return { error: `Need ${rod.cost.toLocaleString()} ⟡` }

  // A concurrent twin can land the same rod first; the insert then fails on
  // the key, and this call's charge goes back rather than paying twice.
  const { error: rodErr } = await admin.from('rod_inventory').insert({ user_id: user.id, rod_tier: rodTier })
  if (rodErr) {
    await grant(admin, user.id, 'doubloons', rod.cost)
    return { error: 'Already owned' }
  }
  await admin.from('doubloon_transactions').insert({
    user_id: user.id,
    amount: -rod.cost,
    reason: `Bought ${rod.name}`,
  })

  const { data: rows } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id)
  const ownedRods = (rows ?? []).map(r => r.rod_tier)

  revalidatePath('/marketplace/tackle-shop')
  return { doubloons: newDoubloons, ownedRods }
}

// Quick-sell rate for owned rods. Matches the 65% fish quick-sell lane
// — same casual-recovery mental model across the game ("you get 65% of
// what you paid back, immediately"). See [[feedback_market_two_lanes]]
// for why we never go full price-of-purchase on player-initiated sells.

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

  // REMOVE THE ROD FIRST, and pay only if this call is the one that removed
  // it. Two sells fired together both pass the ownership read above; only one
  // delete hands the row back.
  const { data: removed } = await admin.from('rod_inventory')
    .delete().eq('user_id', user.id).eq('rod_tier', rodTier).select('rod_tier')
  if (!removed || removed.length === 0) return { error: "You don't own this rod" }

  const [newDoubloons] = await Promise.all([
    grant(admin, user.id, 'doubloons', refund),
    // Back to the Bamboo only if the sold rod is still the one in hand.
    wasEquipped
      ? admin.from('profiles').update({ rod_tier: 0 }).eq('id', user.id).eq('rod_tier', rodTier)
      : Promise.resolve(null),
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

  const [{ data: profile }, { data: alreadyOwned }, { data: collRows }, { data: speciesRows }, { data: rapportRows }, { data: isleRows }] = await Promise.all([
    admin.from('profiles').select('fishing_xp, ancient_catches, lifetime_species, prestige_levels').eq('id', user.id).single(),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id).eq('rod_tier', COMPLETIONIST_TIER).maybeSingle(),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
    admin.from('fish_species').select('id, habitat'),
    // THE OTHER TWO THIRDS OF THE FISHING HALF: the people and the map. See
    // lib/completionist, which is also what the shop draws its bars from — the
    // gate has been wrong twice by having the check and the display written out
    // separately, and this is the fix for that class of bug rather than for one
    // instance of it.
    admin.from('sea_rapport').select('folk_id, points').eq('user_id', user.id),
    admin.from('sea_discoveries').select('isle_id').eq('user_id', user.id),
  ])

  if (!profile) return { error: 'Profile not found' }
  if (alreadyOwned) return { error: 'Already owned' }

  const allSpecies = (speciesRows ?? []) as { id: number; habitat: string }[]
  const progress = completionistProgress({
    level: getLevelFromXP(profile.fishing_xp ?? 0),
    allSpecies,
    lifetime: profile.lifetime_species as number[] | null,
    liveIds: (collRows ?? []).map(r => r.fish_id),
    ancientCatches: profile.ancient_catches as number[] | null,
    prestige: profile.prestige_levels as Record<string, number> | null,
    rapport: rapportRows ?? [],
    isles: isleRows ?? [],
  })
  if (!progress.eligible) return { error: completionistBlocker(progress) ?? 'Not yet' }

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
  // Spend first, in place; the result is the guard. Then raise the tier only
  // from the value read above; a concurrent twin that got there first gets
  // its charge back.
  const newDoubloons = await spend(admin, user.id, 'doubloons', cost)
  if (newDoubloons === null) return { error: 'Not enough doubloons' }
  const raise = admin.from('profiles').update({ reel_tier: nextTier }).eq('id', user.id)
  const { data: raised } = await (profile.reel_tier == null
    ? raise.is('reel_tier', null)
    : raise.eq('reel_tier', currentTier)
  ).select('id')
  if (!raised || raised.length === 0) {
    await grant(admin, user.id, 'doubloons', cost)
    return { error: 'Your tackle just changed. Try again.' }
  }

  await Promise.all([
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -cost,
      reason: `Bought ${REELS[nextTier].name}`,
    }),
  ])

  revalidatePath('/marketplace/tackle-shop')
  return { reelTier: nextTier, doubloons: newDoubloons }
}
