import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import TriviaLobby from './TriviaLobby'

export default async function TriviaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const admin = createAdminClient()
  const [profile, { data: attempt }] = await Promise.all([
    getCurrentProfile(),
    admin.from('trivia_board_attempts')
      .select('answers, gems_awarded')
      .eq('user_id', user.id).eq('date', today)
      .single(),
  ])

  const answeredToday = attempt ? Object.keys((attempt.answers as object) ?? {}).length : 0

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <TriviaLobby
          gems={profile?.gems ?? 0}
          answeredToday={answeredToday}
          gemsToday={attempt?.gems_awarded ?? 0}
        />
      </div>
    </main>
  )
}
