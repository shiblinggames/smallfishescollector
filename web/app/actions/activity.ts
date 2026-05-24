'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Stamps the current user's last_seen_at so the admin dashboard can count
// "active in the last 7 days". No-op when logged out. profiles has RLS with
// no policies, so the write goes through the service-role client scoped to the
// authenticated user's own id only.
export async function pingActivity(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()
  await admin.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)
}
