import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import TriviaLobby from './TriviaLobby'
import { parlorLobbyProps } from '@/lib/core/lobbies'
import { kingWeekStr } from './constants'

export default async function TriviaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const admin = createAdminClient()
  const [profile, { data: attempt }, { data: kingAttempt }, { data: capstanAttempt }, { data: topParlorRows }] = await Promise.all([
    getCurrentProfile(),
    // Board is weekly now (keyed by the Monday week-start, like the ladder).
    admin.from('trivia_board_attempts')
      .select('answers, doubloons_awarded')
      .eq('user_id', user.id).eq('date', kingWeekStr())
      .single(),
    admin.from('trivia_ladder_attempts')
      .select('rung, status, doubloons_awarded')
      .eq('user_id', user.id).eq('date', kingWeekStr())
      .single(),
    admin.from('trivia_capstan_attempts')
      .select('runs')
      .eq('user_id', user.id).eq('date', kingWeekStr())
      .single(),
    // Top three Parlor-point banks for the lobby leaderboard.
    admin.from('profiles')
      .select('username, parlor_points')
      .eq('is_admin', false).gt('parlor_points', 0)
      .order('parlor_points', { ascending: false }).limit(3),
  ])

  const topParlor = ((topParlorRows ?? []) as { username: string | null; parlor_points: number | null }[])
    .map(r => ({ username: r.username ?? 'Captain', points: Number(r.parlor_points ?? 0) }))

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <TriviaLobby {...parlorLobbyProps({
          profile,
          board: attempt ?? null,
          king: kingAttempt ? { rung: kingAttempt.rung as number, status: kingAttempt.status as string, doubloons_awarded: kingAttempt.doubloons_awarded as number } : null,
          capstan: capstanAttempt ?? null,
          topParlor,
          today,
        })} />
      </div>
    </main>
  )
}
