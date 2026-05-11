import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { createAdminClient } from '@/lib/supabase/admin'
import TideRunGame from './TideRunGame'

export default async function TideRunPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('packs_available, doubloons, gems, tide_run_committed_date')
    .eq('id', user.id)
    .single()

  const todayUTC = new Date().toISOString().slice(0, 10)
  const committedToday = profile?.tide_run_committed_date === todayUTC

  return (
    <>
      <Nav
        packsAvailable={profile?.packs_available ?? 0}
        doubloons={profile?.doubloons ?? 0}
        gems={profile?.gems ?? 0}
      />
      <main className="max-w-md mx-auto px-3 pt-3 pb-6 relative" style={{ zIndex: 1 }}>
        <TideRunGame initialCommittedToday={committedToday} />
      </main>
    </>
  )
}
