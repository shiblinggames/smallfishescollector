import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSlotsDailyWagered, getSlotStats, getSlotsJackpot } from '../actions'
import SlotMachine from '../SlotMachine'

export default async function SlotsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, dailyWagered, stats, jackpot] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    getSlotsDailyWagered(),
    getSlotStats(),
    getSlotsJackpot(),
  ])

  return (
    <>
      <main className="min-h-screen px-4 sm:px-8 py-8">
        <div className="max-w-sm sm:max-w-3xl mx-auto">
          <SlotMachine
            doubloons={profile?.doubloons ?? 0}
            dailyWagered={dailyWagered}
            initialStats={stats}
            initialJackpot={jackpot}
          />
        </div>
      </main>
    </>
  )
}
