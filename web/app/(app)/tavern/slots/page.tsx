import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSlotStats, getSlotsJackpot } from '../actions'
import { getCasinoState } from '../casino/actions'
import SlotsView from '../SlotsView'

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

  return <SlotsView wallet={wallet} stats={stats} jackpot={jackpot} />
}
