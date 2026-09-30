import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHoldState } from './hold/actions'
import { getMatchState } from '@/app/(app)/charting/actions'
import { getMinefieldState } from '@/app/(app)/charting/minefieldActions'
import { getRiggingState } from './rigging/actions'
import ChartRoomLobby from './ChartRoomLobby'
import { chartRoomLobbyProps } from '@/lib/core/lobbies'

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

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <ChartRoomLobby {...chartRoomLobbyProps({ profile, hold, match: mtch, minefield: mine, rigging: rig, topCharters })} />
      </div>
    </main>
  )
}
