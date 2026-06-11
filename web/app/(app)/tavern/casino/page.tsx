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
  // slots card).
  const [wallet, jackpot] = await Promise.all([
    getCasinoState(),
    getSlotsJackpot(),
  ])

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <CasinoLobby
          initial={wallet}
          jackpotPot={jackpot.pot}
        />
      </div>
    </main>
  )
}
