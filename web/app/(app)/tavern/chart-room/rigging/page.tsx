import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { isPremiumActive } from '@/lib/premium'
import { getRiggingState } from './actions'
import RiggingGame from './RiggingGame'

export default async function RiggingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Lay the Rigging is a members-only puzzle. Non-members get bounced to the
  // membership page (the card in the Chart Room already shows the lock).
  const profile = await getCurrentProfile()
  if (!isPremiumActive(profile)) redirect('/marketplace')

  const state = await getRiggingState()

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        {'error' in state ? (
          <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: '3rem', textAlign: 'center' }}>
            <p className="font-karla" style={{ fontSize: '0.85rem', color: '#6a6764' }}>{state.error}</p>
          </div>
        ) : (
          <RiggingGame initial={state} />
        )}
      </div>
    </main>
  )
}
