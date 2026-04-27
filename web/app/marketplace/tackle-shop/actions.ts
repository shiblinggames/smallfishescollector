'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBait } from '@/lib/bait'
import { RODS } from '@/lib/rods'
import { REELS } from '@/lib/reels'
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
  if (qty <= 0) return { error: 'Invalid quantity' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const totalCost = bait.shopCost * qty
  if (profile.doubloons < totalCost) return { error: `Need ${totalCost.toLocaleString()} ⟡` }

  const newDoubloons = profile.doubloons - totalCost

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
    admin.from('profiles')
      .update({ doubloons: newDoubloons })
      .eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -totalCost,
      reason: `Bought ${qty}× ${bait.name}`,
    }),
  ])

  return { doubloons: newDoubloons, newQty }
}

export async function buyRod(): Promise<{ rodTier: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('rod_tier, doubloons')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const currentTier = profile.rod_tier ?? 0
  const nextTier = currentTier + 1

  if (nextTier >= RODS.length) return { error: 'Already at max tier' }

  const cost = RODS[nextTier].cost
  if (profile.doubloons < cost) return { error: 'Not enough doubloons' }

  const newDoubloons = profile.doubloons - cost

  await Promise.all([
    admin.from('profiles').update({ rod_tier: nextTier, doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -cost,
      reason: `Bought ${RODS[nextTier].name}`,
    }),
  ])

  revalidatePath('/marketplace/tackle-shop')
  return { rodTier: nextTier, doubloons: newDoubloons }
}

export async function buyReel(): Promise<{ reelTier: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('reel_tier, doubloons')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const currentTier = profile.reel_tier ?? 0
  const nextTier = currentTier + 1

  if (nextTier >= REELS.length) return { error: 'Already at max tier' }

  const cost = REELS[nextTier].cost
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
