import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import TideRunGame from './TideRunGame'
import { getTopTideRunHolder, getPlayerTideRunRank } from './actions'

export default async function TideRunPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [{ data: profile }, topHolder, initialRank] = await Promise.all([
    admin
      .from('profiles')
      .select('tide_run_best_distance, has_seen_tide_run_tour')
      .eq('id', user.id)
      .single(),
    // Top hiscore holder — surfaced on the wreck screen so the
    // player always sees the target to beat. Fetched on mount; new
    // PBs by other players land on next page load.
    getTopTideRunHolder(),
    // Player's own rank + gap to the rank above. Re-fetched on the
    // client after every wreck so PB-driven rank shifts land live.
    getPlayerTideRunRank(),
  ])

  // numeric(10,1) — PostgREST often returns numeric as a string. Coerce
  // so the client always receives a real number.
  const initialBestDistance = Number(profile?.tide_run_best_distance ?? 0)
  const hasSeenTour = !!profile?.has_seen_tide_run_tour

  return (
    <>
      {/* NO column and no padding. Tide Run is a full-bleed canvas: the sea it
          draws IS the page background, so a max-w-md gutter on either side and
          12px of breathing room above turned the whole game into a widget
          sitting on a screenshot of a tavern. The game owns its own clearance
          for the nav and the tab bar (see the height calc in TideRunGame). */}
      <main className="relative" style={{ zIndex: 1 }}>
        <TideRunGame
          initialBestDistance={initialBestDistance}
          hasSeenTour={hasSeenTour}
          topHolder={topHolder}
          initialRank={initialRank}
        />
      </main>
    </>
  )
}
