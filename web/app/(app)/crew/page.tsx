import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getCrewState } from './actions'
import CrewClient from './CrewClient'

// Live Crew Management page — used to be admin-only when this was a test
// bench for the crew overhaul, but it's the canonical player-facing crew
// surface now. Linked from the expedition hub's Manage Crew button and
// from the per-track 'Assign →' affordances on the Campaign / Voyages
// cards, both of which were 404-ing for non-admin players until the gate
// came off.
export const dynamic = 'force-dynamic'

export default async function CrewManagementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await getCrewState()
  if (!state) notFound()

  const { data: prof } = await supabase.from('profiles').select('has_seen_crew_guide').eq('id', user.id).single()

  return <CrewClient initial={state} hasSeenGuide={(prof?.has_seen_crew_guide as boolean | null) ?? false} />
}
