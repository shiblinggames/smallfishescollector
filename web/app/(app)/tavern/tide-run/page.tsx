import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import TideRunGame from './TideRunGame'
import { getTopTideRunHolder } from './actions'

export default async function TideRunPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [{ data: profile }, topHolder] = await Promise.all([
    admin
      .from('profiles')
      .select('tide_run_best_distance, has_seen_tide_run_tour')
      .eq('id', user.id)
      .single(),
    // Top hiscore holder — surfaced on the wreck screen so the
    // player always sees the target to beat. Fetched on mount; new
    // PBs by other players land on next page load.
    getTopTideRunHolder(),
  ])

  const initialBestDistance = (profile?.tide_run_best_distance as number | null) ?? 0
  const hasSeenTour = !!profile?.has_seen_tide_run_tour

  return (
    <>
      <main className="max-w-md mx-auto px-3 pt-3 pb-6 relative" style={{ zIndex: 1 }}>
        <TideRunGame
          initialBestDistance={initialBestDistance}
          hasSeenTour={hasSeenTour}
          topHolder={topHolder}
        />
      </main>
    </>
  )
}
