import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMatchState } from './actions'
import TreasureMatchGame from './TreasureMatchGame'

// /charting is Treasure Match (weekly Match-3). Replaced The Minefield
// 2026-06-15 (minesweeper had too high a learning curve); the
// minefield_* tables are dormant.
export default async function TreasureMatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await getMatchState()

  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/expedition-background.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.78) 50%,rgba(0,0,0,0.92) 100%)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <main className="min-h-screen pb-24 sm:pb-0">
          <div className="page-col" style={{ paddingTop: '1.25rem' }}>
            {'error' in state ? (
              <div style={{ textAlign: 'center', paddingTop: '5rem' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#c8bfa6', marginBottom: '0.5rem' }}>No Board This Week</p>
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#9a9078' }}>{state.error}</p>
              </div>
            ) : (
              <TreasureMatchGame initial={state} />
            )}
          </div>
        </main>
      </div>
    </>
  )
}
