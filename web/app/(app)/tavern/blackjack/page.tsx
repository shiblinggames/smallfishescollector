import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Blackjack from '../Blackjack'
import { getDailyWagered, resumeHand } from './actions'
import { getFishArtPool } from '@/lib/blackjackFishArt'

export default async function BlackjackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Parallel: profile + daily wager + any resumed hand + fish art pool.
  // resumeHand returns null when the player has no active hand;
  // when set, the client jumps straight to the play phase.
  const [{ data: profile }, dailyWagered, resumed, fishArtPool] = await Promise.all([
    supabase.from('profiles').select('doubloons').eq('id', user.id).single(),
    getDailyWagered(),
    resumeHand(),
    getFishArtPool(),
  ])

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-6 pt-8 pb-5 text-center">
        <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>
          Blackjack
        </h1>
      </div>

      <div className="px-6 pb-12">
        <Blackjack
          doubloons={profile?.doubloons ?? 0}
          dailyWagered={dailyWagered}
          resumed={resumed}
          fishArtPool={fishArtPool}
        />
      </div>
    </main>
  )
}
