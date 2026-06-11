import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Blackjack from '../Blackjack'
import { getDailyWagered, resumeHand } from './actions'
import { getFishArtPool } from '@/lib/blackjackFishArt'

export default async function BlackjackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Parallel: profile (doubloons + shared casino chips + blackjack's
  // own session net) + today's shared buy-in total + any resumed hand
  // + fish art pool. resumeHand returns null when the player has no
  // active hand; chips > 0 puts them on the wager screen; chips == 0
  // puts them on the buy-in screen.
  const [{ data: profile }, dailyWagered, resumed, fishArtPool] = await Promise.all([
    supabase.from('profiles').select('doubloons, casino_chips, casino_session_buy_ins, blackjack_session_net').eq('id', user.id).single(),
    getDailyWagered(),
    resumeHand(),
    getFishArtPool(),
  ])

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-6 pt-6 pb-12">
        <Blackjack
          doubloons={profile?.doubloons ?? 0}
          chips={profile?.casino_chips ?? 0}
          sessionBuyIns={profile?.casino_session_buy_ins ?? 0}
          sessionNet={profile?.blackjack_session_net ?? 0}
          dailyWagered={dailyWagered}
          resumed={resumed}
          fishArtPool={fishArtPool}
        />
      </div>
    </main>
  )
}
