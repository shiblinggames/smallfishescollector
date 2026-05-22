import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { getCrewState } from './actions'
import CrewClient from './CrewClient'

// Admin-only test bench for the Darkest-Dungeon-style crew overhaul (Phase 1).
// Isolated from the live packs/collection system. Gated on profiles.is_admin.
export const dynamic = 'force-dynamic'

export default async function DevCrewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!prof?.is_admin) notFound()

  const state = await getCrewState()
  if (!state) notFound()

  return <CrewClient initial={state} />
}
