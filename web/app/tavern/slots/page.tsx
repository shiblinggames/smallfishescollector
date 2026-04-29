import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { getSlotsDailyWagered } from '../actions'
import SlotMachine from '../SlotMachine'

export default async function SlotsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, dailyWagered] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    getSlotsDailyWagered(),
  ])

  return (
    <>
      <Nav
        packsAvailable={profile?.packs_available ?? 0}
        doubloons={profile?.doubloons ?? 0}
        gems={profile?.gems ?? 0}
      />
      <main className="min-h-screen px-4 py-8">
        <div className="max-w-sm mx-auto">
          <div className="text-center mb-8">
            <p className="sg-eyebrow text-[#9a9488] mb-1">Tavern</p>
            <h1 className="font-cinzel font-700 text-[#f0ede8] text-2xl">Fish Slots</h1>
            <p className="font-karla text-[#6a6764] text-sm mt-1">Match three to win big</p>
          </div>
          <SlotMachine
            doubloons={profile?.doubloons ?? 0}
            dailyWagered={dailyWagered}
          />
        </div>
      </main>
    </>
  )
}
