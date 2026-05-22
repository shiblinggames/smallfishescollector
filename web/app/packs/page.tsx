import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import CrewClient from '@/app/dev/crew/CrewClient'
import { getCrewState } from '@/app/dev/crew/actions'

// The Crew Hall — recruit board + roster. Replaces the old pack opener; the
// recruit/reroll loop is the gem sink that used to be packs.
export const dynamic = 'force-dynamic'

export default async function CrewHallPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()

  const state = await getCrewState()
  if (!state) redirect('/login')

  return (
    <>
      <Nav doubloons={profile?.doubloons ?? 0} gems={state.gems} />
      <CrewClient initial={state} />
    </>
  )
}
