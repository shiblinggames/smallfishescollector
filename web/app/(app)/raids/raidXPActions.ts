'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function awardRaidKill(
  xp: number,
  doubloons: number,
): Promise<{ newExpeditionXP: number; newDoubloonTotal: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newExpeditionXP: 0, newDoubloonTotal: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('expedition_xp, doubloons')
    .eq('id', user.id)
    .single()

  const newExpeditionXP  = (profile?.expedition_xp ?? 0) + xp
  const newDoubloonTotal = (profile?.doubloons ?? 0) + doubloons

  await admin.from('profiles').update({
    expedition_xp: newExpeditionXP,
    doubloons: newDoubloonTotal,
  }).eq('id', user.id)

  return { newExpeditionXP, newDoubloonTotal }
}
