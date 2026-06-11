import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSlotStats, getSlotsJackpot } from '../actions'
import { getCasinoState } from '../casino/actions'
import SlotMachine from '../SlotMachine'

export default async function SlotsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Shared casino wallet (chips + session buy-ins + slots' own session
  // net + daily buy-in headroom) replaces the old per-game doubloon
  // wagering — getCasinoState covers everything the machine needs.
  const [wallet, stats, jackpot] = await Promise.all([
    getCasinoState(),
    getSlotStats(),
    getSlotsJackpot(),
  ])

  return (
    <>
      <main className="min-h-screen px-4 sm:px-8 py-8">
        <div className="max-w-sm sm:max-w-3xl mx-auto">
          <SlotMachine
            chips={wallet.chips}
            doubloons={wallet.doubloons}
            sessionBuyIns={wallet.sessionBuyIns}
            sessionNet={wallet.sessionNets.slots}
            dailyRemaining={wallet.dailyRemaining}
            initialStats={stats}
            initialJackpot={jackpot}
          />
        </div>
      </main>
    </>
  )
}
