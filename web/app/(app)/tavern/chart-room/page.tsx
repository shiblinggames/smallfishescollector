import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { isPremiumActive } from '@/lib/premium'
import { getHoldState } from './hold/actions'
import { getMatchState } from '@/app/(app)/charting/actions'
import { MATCH_MAX_POINTS } from '@/app/(app)/charting/constants'
import { getRiggingState } from './rigging/actions'
import { RIGGING_POINTS } from './rigging/constants'
import ChartRoomLobby from './ChartRoomLobby'
import ChartRoomBackdrop from './ChartRoomBackdrop'

export default async function ChartRoomPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, hold, mtch, rig] = await Promise.all([getCurrentProfile(), getHoldState(), getMatchState(), getRiggingState()])

  const solvedToday = 'error' in hold ? false : hold.puzzles.some(p => p.solved)
  const holdStatus: 'open' | 'locked' | 'done' =
    'error' in hold ? 'open' : solvedToday ? 'done' : hold.lockedDifficulty ? 'locked' : 'open'
  const holdDoubloonsToday = 'error' in hold ? 0 : hold.doubloonsAwarded

  const matchStatus: 'active' | 'cleared' = 'error' in mtch ? 'active' : mtch.status
  // The card shows the max attainable (5); the run tiers the actual award.
  const matchReward = MATCH_MAX_POINTS

  const riggingStatus: 'active' | 'cleared' = 'error' in rig ? 'active' : rig.status
  const riggingReward = 'error' in rig ? RIGGING_POINTS : rig.reward

  const puzzlePoints = Number(profile?.puzzle_points ?? 0)

  return (
    <>
      <ChartRoomBackdrop />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <main className="min-h-screen pb-24 sm:pb-0">
          <div className="px-4 pt-6 pb-12">
            <ChartRoomLobby
              doubloons={profile?.doubloons ?? 0}
              holdStatus={holdStatus}
              holdDoubloonsToday={holdDoubloonsToday}
              matchStatus={matchStatus}
              matchReward={matchReward}
              riggingStatus={riggingStatus}
              riggingReward={riggingReward}
              puzzlePoints={puzzlePoints}
              isMember={isPremiumActive(profile)}
            />
          </div>
        </main>
      </div>
    </>
  )
}
