import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import TriviaLobby, { type KingChip } from './TriviaLobby'
import { kingWeekStr, type PirateKingStatus } from './constants'
import { isPremiumActive } from '@/lib/premium'

export default async function TriviaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const admin = createAdminClient()
  const [profile, { data: attempt }, { data: kingAttempt }] = await Promise.all([
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
  ])

  const boardAnswers = (attempt?.answers as Record<string, { day?: string; chosen?: number }> | null) ?? {}
  const picksAllowed = isPremiumActive(profile) ? 2 : 1
  const boardPicksToday = Object.values(boardAnswers).filter(a => a.day === today).length
  const boardPlayedToday = boardPicksToday >= picksAllowed
  const boardPlayedThisWeek = Object.values(boardAnswers).filter(a => a.chosen !== undefined).length
  const king: KingChip | null = kingAttempt
    ? {
        status: kingAttempt.status as PirateKingStatus,
        rung: kingAttempt.rung as number,
        doubloonsAwarded: kingAttempt.doubloons_awarded as number,
      }
    : null

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <TriviaLobby
          doubloons={profile?.doubloons ?? 0}
          boardPlayedToday={boardPlayedToday}
          boardPlayedThisWeek={boardPlayedThisWeek}
          doubloonsThisWeek={attempt?.doubloons_awarded ?? 0}
          king={king}
          parlorStreak={(profile?.parlor_streak as number | null) ?? 0}
          parlorBestStreak={(profile?.parlor_best_streak as number | null) ?? 0}
        />
      </div>
    </main>
  )
}
