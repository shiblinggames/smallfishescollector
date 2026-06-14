import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMinefieldState } from './actions'
import Minefield from './MinefieldGame'

// /charting is now The Minefield (ship-themed weekly minesweeper).
// Replaced Chart the Course 2026-06-14; the chart_* tables are dormant.
export default async function MinefieldPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await getMinefieldState()

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
          background: 'linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.78) 50%,rgba(0,0,0,0.92) 100%)',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <main className="min-h-screen pb-24 sm:pb-0">
          <div className="px-4 max-w-lg mx-auto" style={{ paddingTop: '1.25rem' }}>
            {'error' in state ? (
              <div style={{ textAlign: 'center', paddingTop: '5rem' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#c8bfa6', marginBottom: '0.5rem' }}>
                  No Minefield This Week
                </p>
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#9a9078' }}>
                  {state.error}
                </p>
              </div>
            ) : (
              <Minefield initial={state} />
            )}
          </div>
        </main>
      </div>
    </>
  )
}
