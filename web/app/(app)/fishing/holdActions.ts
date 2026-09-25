'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FISH_HOLD_TIERS, getFishHold } from '@/lib/fishHold'
import { grant, spend } from '@/lib/wallet'

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
  const newTier = currentTier + 1

  // Spend first, in place; the result is the guard. Then raise the tier only
  // from the value read above, so two taps cannot buy two tiers for one step
  // or skip a price. The one that loses gets its charge back.
  const newDoubloons = await spend(admin, user.id, 'doubloons', next.cost)
  if (newDoubloons === null) return { error: 'Not enough doubloons' }
  const raise = admin.from('profiles').update({ fish_hold_tier: newTier }).eq('id', user.id)
  const { data: raised } = await (profile.fish_hold_tier == null
    ? raise.is('fish_hold_tier', null)
    : raise.eq('fish_hold_tier', currentTier)
  ).select('id')
  if (!raised || raised.length === 0) {
    await grant(admin, user.id, 'doubloons', next.cost)
    return { error: 'Your hold just changed. Try again.' }
  }

  await Promise.all([
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
