'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOOKS } from '@/lib/hooks'
import { revalidatePath } from 'next/cache'

export async function buyHook(): Promise<{ hookTier: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('hook_tier, doubloons')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const currentTier = profile.hook_tier ?? 0
  const nextTier = currentTier + 1

  if (nextTier >= HOOKS.length) return { error: 'Already at max tier' }

  const cost = HOOKS[nextTier].cost
  if (profile.doubloons < cost) return { error: 'Not enough doubloons' }

  const newDoubloons = profile.doubloons - cost

  await Promise.all([
    admin.from('profiles').update({ hook_tier: nextTier, doubloons: newDoubloons }).eq('id', user.id),
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
