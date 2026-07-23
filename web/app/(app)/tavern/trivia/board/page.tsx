import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getCaptainsBoardState } from './actions'
import CaptainsBoard from './CaptainsBoard'

export default async function CaptainsBoardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, state] = await Promise.all([getCurrentProfile(), getCaptainsBoardState()])

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        {'error' in state ? (
          <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: '3rem', textAlign: 'center' }}>
            <p className="font-karla" style={{ fontSize: '0.85rem', color: '#6a6764' }}>
              {state.error}
            </p>
          </div>
        ) : (
          <CaptainsBoard initial={state} parlorPoints={(profile?.parlor_points as number | null) ?? 0} />
        )}
      </div>
    </main>
  )
}
