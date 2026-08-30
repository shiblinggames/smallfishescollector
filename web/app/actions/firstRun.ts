'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function markSetupSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_setup: true }).eq('id', user.id)
}

export async function claimWelcomePack(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('has_seen_welcome, gems')
    .eq('id', user.id)
    .single()

  if (!profile || profile.has_seen_welcome) return { ok: false }

  // Welcome gift: 100 gems (the retired starter pack, paid in the new currency).
  await admin.from('profiles').update({
    has_seen_welcome: true,
    gems: (profile.gems ?? 0) + 100,
  }).eq('id', user.id)

  return { ok: true }
}
