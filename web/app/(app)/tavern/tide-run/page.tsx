import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import TideRunGame from './TideRunGame'

export default async function TideRunPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('packs_available, doubloons, gems, tide_run_committed_date, tide_run_best_distance, has_seen_tide_run_tour')
    .eq('id', user.id)
    .single()

  const todayUTC = new Date().toISOString().slice(0, 10)
  const committedToday = profile?.tide_run_committed_date === todayUTC
  const initialBestDistance = (profile?.tide_run_best_distance as number | null) ?? 0
  const hasSeenTour = !!profile?.has_seen_tide_run_tour

  return (
    <>
      <main className="max-w-md mx-auto px-3 pt-3 pb-6 relative" style={{ zIndex: 1 }}>
        <TideRunGame
          initialCommittedToday={committedToday}
          initialBestDistance={initialBestDistance}
          hasSeenTour={hasSeenTour}
        />
      </main>
    </>
  )
}
