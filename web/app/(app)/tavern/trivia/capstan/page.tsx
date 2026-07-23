import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { isPremiumActive } from '@/lib/premium'
import { getCapstanState } from './actions'
import CapstanGame from './CapstanGame'

export default async function CapstanPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Spin the Capstan is a Captain-only game. Non-members get bounced back to the
  // Parlor (whose Capstan card shows the lock + upsell).
  const profile = await getCurrentProfile()
  if (!isPremiumActive(profile)) redirect('/tavern/trivia')

  const state = await getCapstanState()

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        {'error' in state ? (
          <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: '3rem', textAlign: 'center' }}>
            <p className="font-karla" style={{ fontSize: '0.85rem', color: '#6a6764' }}>{state.error}</p>
          </div>
        ) : (
          <CapstanGame initial={state} parlorPoints={(profile?.parlor_points as number | null) ?? 0} />
        )}
      </div>
    </main>
  )
}
