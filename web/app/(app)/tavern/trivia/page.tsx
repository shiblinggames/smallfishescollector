import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import TriviaLobby, { type KingChip } from './TriviaLobby'
import { type PirateKingStatus } from './constants'

export default async function TriviaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const admin = createAdminClient()
  const [profile, { data: attempt }, { data: kingAttempt }] = await Promise.all([
    getCurrentProfile(),
    admin.from('trivia_board_attempts')
      .select('category, answers, doubloons_awarded')
      .eq('user_id', user.id).eq('date', today)
      .single(),
    admin.from('trivia_ladder_attempts')
      .select('rung, status, gems_awarded')
      .eq('user_id', user.id).eq('date', today)
      .single(),
  ])

  const answeredToday = attempt ? Object.keys((attempt.answers as object) ?? {}).length : 0
  const king: KingChip | null = kingAttempt
    ? {
        status: kingAttempt.status as PirateKingStatus,
        rung: kingAttempt.rung as number,
        gemsAwarded: kingAttempt.gems_awarded as number,
      }
    : null

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <TriviaLobby
          gems={profile?.gems ?? 0}
          boardLocked={!!attempt?.category}
          answeredToday={answeredToday}
          doubloonsToday={attempt?.doubloons_awarded ?? 0}
          king={king}
        />
      </div>
    </main>
  )
}
