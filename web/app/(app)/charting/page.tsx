import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getChartState } from './chartActions'
import ChartBoard from './ChartBoard'

export default async function ChartingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [{ data: profile }, state] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, gems, ship_tier').eq('id', user.id).single(),
    getChartState(),
  ])

  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/expedition-background.jpg"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0.75) 50%,rgba(0,0,0,0.92) 100%)',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <main className="min-h-screen pb-24 sm:pb-0">
          <div className="px-5 max-w-lg mx-auto" style={{ paddingTop: '1rem' }}>
            {'error' in state ? (
              <div style={{ textAlign: 'center', paddingTop: '5rem' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#4a4028', marginBottom: '0.5rem' }}>
                  No Active Contest
                </p>
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#3a3028' }}>
                  Check back soon for the next voyage.
                </p>
              </div>
            ) : (
              <ChartBoard
                contest={state.contest}
                progress={state.progress}
                initialGuesses={state.guesses}
                initialMovesAvailable={state.movesAvailable}
                nextGrantDate={state.nextGrantDate}
                pathLength={state.pathLength}
                startTile={state.startTile}
                finishers={state.finishers}
                shipTier={profile?.ship_tier ?? 0}
                completionPosition={state.completionPosition}
              />
            )}
          </div>
        </main>
      </div>
    </>
  )
}
