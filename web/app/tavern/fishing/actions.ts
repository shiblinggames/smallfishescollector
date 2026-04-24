'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_CASTS } from './constants'

// Max per day = 20 casts × quality 20 × multiplier
// Tier 0 → ~40 ⟡/day max · Tier 6 → ~248 ⟡/day max
const HOOK_MULTIPLIERS = [0.1, 0.15, 0.2, 0.27, 0.36, 0.47, 0.62]

function today() {
  return new Date().toISOString().split('T')[0]
}

export async function castLine(quality: number): Promise<
  { earned: number; castsUsed: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Clamp quality to valid range
  const q = Math.max(1, Math.min(20, Math.round(quality)))

  const admin = createAdminClient()
  const date = today()

  const { data: profile } = await admin
    .from('profiles')
    .select('hook_tier, doubloons, fishing_date, fishing_casts')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const isToday = profile.fishing_date === date
  const castsUsed = isToday ? (profile.fishing_casts ?? 0) : 0

  if (castsUsed >= MAX_CASTS) {
    return { error: 'No casts remaining today. Come back tomorrow.' }
  }

  const hookTier = Math.min(profile.hook_tier ?? 0, HOOK_MULTIPLIERS.length - 1)
  const multiplier = HOOK_MULTIPLIERS[hookTier]
  const earned = Math.max(1, Math.floor(q * multiplier))

  const newCastsUsed = castsUsed + 1

  await Promise.all([
    admin.from('profiles').update({
      doubloons: (profile.doubloons ?? 0) + earned,
      fishing_date: date,
      fishing_casts: newCastsUsed,
    }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: earned,
      reason: 'Fishing',
    }),
  ])

  return { earned, castsUsed: newCastsUsed }
}
