'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const RAID_KILL_XP: Record<string, number> = {
  brute:   20,
  sniper:  30,
  corsair: 45,
  pete:    180,
}

export async function awardRaidKillXP(xp: number): Promise<{ newExpeditionXP: number }> {
  if (xp <= 0) return { newExpeditionXP: 0 }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newExpeditionXP: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('expedition_xp')
    .eq('id', user.id)
    .single()

  const newExpeditionXP = (profile?.expedition_xp ?? 0) + xp
  await admin.from('profiles').update({ expedition_xp: newExpeditionXP }).eq('id', user.id)
  return { newExpeditionXP }
}
