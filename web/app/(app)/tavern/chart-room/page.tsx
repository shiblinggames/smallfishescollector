import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getHoldState } from './hold/actions'
import { getMinefieldState } from '@/app/(app)/charting/actions'
import { MINEFIELD_POINTS } from '@/app/(app)/charting/constants'
import ChartRoomLobby from './ChartRoomLobby'

export default async function ChartRoomPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, hold, mine] = await Promise.all([getCurrentProfile(), getHoldState(), getMinefieldState()])

  const solvedToday = 'error' in hold ? false : hold.puzzles.some(p => p.solved)
  const holdStatus: 'open' | 'locked' | 'done' =
    'error' in hold ? 'open' : solvedToday ? 'done' : hold.lockedDifficulty ? 'locked' : 'open'
  const holdDoubloonsToday = 'error' in hold ? 0 : hold.doubloonsAwarded

  const minefieldStatus: 'active' | 'cleared' = 'error' in mine ? 'active' : mine.status
  const minefieldReward = 'error' in mine ? MINEFIELD_POINTS : mine.reward

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <ChartRoomLobby
          doubloons={profile?.doubloons ?? 0}
          holdStatus={holdStatus}
          holdDoubloonsToday={holdDoubloonsToday}
          minefieldStatus={minefieldStatus}
          minefieldReward={minefieldReward}
        />
      </div>
    </main>
  )
}
