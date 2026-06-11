import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCasinoState } from './actions'
import { getSlotsJackpot } from '../actions'
import CasinoLobby from './CasinoLobby'

export default async function CasinoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Parallel: shared wallet snapshot + live jackpot pot (rides on the
  // slots card) + is_admin (roulette card is admin-gated in the lobby
  // while it gets its prod tap-test).
  const [wallet, jackpot, { data: profile }] = await Promise.all([
    getCasinoState(),
    getSlotsJackpot(),
    supabase.from('profiles').select('is_admin').eq('id', user.id).single(),
  ])

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <CasinoLobby
          initial={wallet}
          jackpotPot={jackpot.pot}
          isAdmin={!!profile?.is_admin}
        />
      </div>
    </main>
  )
}
