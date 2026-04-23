'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Personality } from './gameTypes'

const ENTRY_FEE = 20
const PAYOUTS: Record<Personality, number> = {
  cautious: 35,
  balanced: 40,
  greedy:   50,
}

export async function payEntryFee(): Promise<{ newDoubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  if (profile.doubloons < ENTRY_FEE) return { error: `Not enough doubloons — you need ${ENTRY_FEE} ⟡ to enter.` }

  const newDoubloons = profile.doubloons - ENTRY_FEE
  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: -ENTRY_FEE,
      reason: "Dead Man's Draw: entry fee",
    }),
  ])
  return { newDoubloons }
}

export async function collectWinnings(personality: Personality): Promise<{ newDoubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const payout = PAYOUTS[personality]
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }

  const newDoubloons = profile.doubloons + payout
  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: payout,
      reason: `Dead Man's Draw: victory vs ${personality}`,
    }),
  ])
  return { newDoubloons }
}
