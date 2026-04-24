'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function claimWelcomePack(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('has_seen_welcome, packs_available')
    .eq('id', user.id)
    .single()

  if (!profile || profile.has_seen_welcome) return { ok: false }

  await admin.from('profiles').update({
    has_seen_welcome: true,
    packs_available: (profile.packs_available ?? 0) + 1,
  }).eq('id', user.id)

  return { ok: true }
}
