'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOOKS } from '@/lib/hooks'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { fishingGearLevelReq } from '@/lib/gearGating'
import { revalidatePath } from 'next/cache'
import { grant, spend } from '@/lib/wallet'

export async function buyHook(): Promise<{ hookTier: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('hook_tier, doubloons, fishing_xp')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const currentTier = profile.hook_tier ?? 0
  const nextTier = currentTier + 1

  if (nextTier >= HOOKS.length) return { error: 'Already at max tier' }

  const cost = HOOKS[nextTier].cost
  const hookReq = fishingGearLevelReq(HOOKS[nextTier])
  if (getLevelFromXP(profile.fishing_xp ?? 0) < hookReq) return { error: `Reach Fishing Lv ${hookReq} to buy the ${HOOKS[nextTier].name}` }
  // Spend first, in place; the result is the guard. Then raise the tier only
  // from the value read above; a concurrent twin that got there first gets
  // its charge back.
  const newDoubloons = await spend(admin, user.id, 'doubloons', cost)
  if (newDoubloons === null) return { error: 'Not enough doubloons' }
  const raise = admin.from('profiles').update({ hook_tier: nextTier }).eq('id', user.id)
  const { data: raised } = await (profile.hook_tier == null
    ? raise.is('hook_tier', null)
    : raise.eq('hook_tier', currentTier)
  ).select('id')
  if (!raised || raised.length === 0) {
    await grant(admin, user.id, 'doubloons', cost)
    return { error: 'Your tackle just changed. Try again.' }
  }

  await Promise.all([
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -cost,
      reason: `Bought ${HOOKS[nextTier].name}`,
    }),
  ])

  revalidatePath('/hooks')
  revalidatePath('/packs')
  return { hookTier: nextTier, doubloons: newDoubloons }
}
