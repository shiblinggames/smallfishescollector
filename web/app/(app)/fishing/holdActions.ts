'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FISH_HOLD_TIERS, getFishHold } from '@/lib/fishHold'

export async function upgradeFishHold(): Promise<
  { ok: true; newTier: number; doubloons: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, fish_hold_tier')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const currentTier = profile.fish_hold_tier ?? 0
  const maxTier = FISH_HOLD_TIERS.length - 1
  if (currentTier >= maxTier) return { error: 'Fish hold is already at max tier' }

  const next = getFishHold(currentTier + 1)
  if ((profile.doubloons ?? 0) < next.cost) return { error: 'Not enough doubloons' }

  const newDoubloons = (profile.doubloons ?? 0) - next.cost
  const newTier = currentTier + 1

  await Promise.all([
    admin.from('profiles').update({ fish_hold_tier: newTier, doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: -next.cost, reason: `Upgraded fish hold to ${next.name}` }),
  ])

  return { ok: true, newTier, doubloons: newDoubloons }
}

/**
 * WHAT IS ACTUALLY IN THE HOLD.
 *
 * Only the quantities. The names, the artwork and the sell values are already
 * on the client — every screen that shows fish has the species table — so
 * sending them again would be paying twice for something already in memory.
 *
 * The VALUE is deliberately not computed here either. What a hold is worth
 * depends on who is buying: a salter at sea pays a fraction, a quick-sell lane
 * pays another, the market ashore pays full. A single number returned from the
 * server would have to pick one of those and would then be wrong everywhere
 * else, so the client shows the market value and names the rates beside it.
 */
export async function holdContents(): Promise<
  { ok: true; rows: { fishId: number; qty: number }[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('fish_inventory')
    .select('fish_id, quantity')
    .eq('user_id', user.id)

  const rows = ((data ?? []) as { fish_id: number; quantity: number }[])
    .filter(r => r.quantity > 0)
    .map(r => ({ fishId: r.fish_id, qty: r.quantity }))
  return { ok: true, rows }
}
