import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getHoldState } from './hold/actions'
import ChartRoomLobby from './ChartRoomLobby'

export default async function ChartRoomPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, hold] = await Promise.all([getCurrentProfile(), getHoldState()])

  const holdSolvedCount = 'error' in hold ? 0 : hold.puzzles.filter(p => p.solved).length
  const holdDoubloonsToday = 'error' in hold ? 0 : hold.doubloonsAwarded

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <ChartRoomLobby
          doubloons={profile?.doubloons ?? 0}
          holdSolvedCount={holdSolvedCount}
          holdDoubloonsToday={holdDoubloonsToday}
        />
      </div>
    </main>
  )
}
