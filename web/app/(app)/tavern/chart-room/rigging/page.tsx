import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/userData'
import { getRiggingState } from './actions'
import RiggingGame from './RiggingGame'

export default async function RiggingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

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
