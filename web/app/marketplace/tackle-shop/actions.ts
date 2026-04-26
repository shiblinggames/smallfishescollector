'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBait } from '@/lib/bait'

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
