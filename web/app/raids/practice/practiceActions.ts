'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function markPracticeRaidTutorialSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_raid_tutorial: true }).eq('id', user.id)
}

// XP is awarded at kill time via awardRaidKillXP — this just banks doubloons + marks completion
export async function claimPracticeWin(
  doubloons: number,
): Promise<{ newDoubloonTotal: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newDoubloonTotal: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()

  const newDoubloonTotal = (profile?.doubloons ?? 0) + doubloons

  await admin.from('profiles').update({
    doubloons: newDoubloonTotal,
    has_completed_practice_raid: true,
  }).eq('id', user.id)

  return { newDoubloonTotal }
}
