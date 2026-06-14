import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getHoldState } from './actions'
import QuartermastersHold from './QuartermastersHold'

export default async function QuartermastersHoldPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, state] = await Promise.all([getCurrentProfile(), getHoldState()])

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
          <QuartermastersHold initial={state} doubloons={profile?.doubloons ?? 0} />
        )}
      </div>
    </main>
  )
}
