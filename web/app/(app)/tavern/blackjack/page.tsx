import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Blackjack from '../Blackjack'
import { getDailyWagered, resumeHand } from './actions'
import { getFishArtPool } from '@/lib/blackjackFishArt'

export default async function BlackjackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Parallel: profile (doubloons + chips) + daily wager + any resumed
  // hand + fish art pool. resumeHand returns null when the player has
  // no active hand; chips > 0 puts them on the wager screen; chips ==
  // 0 puts them on the buy-in screen.
  const [{ data: profile }, dailyWagered, resumed, fishArtPool] = await Promise.all([
    supabase.from('profiles').select('doubloons, blackjack_chips').eq('id', user.id).single(),
    getDailyWagered(),
    resumeHand(),
    getFishArtPool(),
  ])

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-6 pt-6 pb-12">
        <Blackjack
          doubloons={profile?.doubloons ?? 0}
          chips={profile?.blackjack_chips ?? 0}
          dailyWagered={dailyWagered}
          resumed={resumed}
          fishArtPool={fishArtPool}
        />
      </div>
    </main>
  )
}
