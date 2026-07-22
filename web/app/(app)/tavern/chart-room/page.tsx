import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { getHoldState } from './hold/actions'
import { getMatchState } from '@/app/(app)/charting/actions'
import { MATCH_MAX_POINTS } from '@/app/(app)/charting/constants'
import { getMinefieldState } from '@/app/(app)/charting/minefieldActions'
import { MINEFIELD_POINTS } from '@/app/(app)/charting/minefieldConstants'
import { getRiggingState } from './rigging/actions'
import { RIGGING_POINTS } from './rigging/constants'
import ChartRoomLobby from './ChartRoomLobby'
import ChartRoomBackdrop from './ChartRoomBackdrop'

export default async function ChartRoomPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [profile, hold, mtch, mine, rig, topRows] = await Promise.all([
    getCurrentProfile(), getHoldState(), getMatchState(), getMinefieldState(), getRiggingState(),
    admin.from('profiles').select('username, puzzle_points').eq('is_admin', false).gt('puzzle_points', 0).order('puzzle_points', { ascending: false }).limit(3),
  ])

  const topCharters = ((topRows.data ?? []) as { username: string | null; puzzle_points: number | null }[])
    .map(r => ({ username: r.username ?? 'Captain', points: Number(r.puzzle_points ?? 0) }))

  const holdSolved = 'error' in hold ? 0 : hold.puzzles.filter(p => p.solved).length
  const holdDoubloonsToday = 'error' in hold ? 0 : hold.doubloonsAwarded

  const matchStatus: 'active' | 'cleared' = 'error' in mtch ? 'active' : mtch.status
  // The card shows the max attainable (5); the run tiers the actual award.
  const matchReward = MATCH_MAX_POINTS

  const minefieldStatus: 'active' | 'cleared' = 'error' in mine ? 'active' : mine.status
  const minefieldReward = MINEFIELD_POINTS

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
              holdSolved={holdSolved}
              holdDoubloonsToday={holdDoubloonsToday}
              matchStatus={matchStatus}
              matchReward={matchReward}
              minefieldStatus={minefieldStatus}
              minefieldReward={minefieldReward}
              riggingStatus={riggingStatus}
              riggingReward={riggingReward}
              puzzlePoints={puzzlePoints}
              chartingClaimed={(profile?.charting_landmarks_claimed as number[] | null) ?? []}
              topCharters={topCharters}
              isMember={isPremiumActive(profile)}
            />
          </div>
        </main>
      </div>
    </>
  )
}
