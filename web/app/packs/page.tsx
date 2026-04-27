import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import PackOpener from './PackOpener'
import PackStatsToggle from './PackStatsToggle'
import WeeklyBounties from './WeeklyBounties'
import { getPackStats, getPackHistory } from './stats'
import { getWeeklyBounties } from './bountyActions'

export default async function PacksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, stats, history, bounties] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    getPackStats(),
    getPackHistory(),
    getWeeklyBounties(),
  ])

  const packsAvailable = profile?.packs_available ?? 0
  const doubloons = profile?.doubloons ?? 0

  return (
    <>
      <Nav packsAvailable={packsAvailable} doubloons={doubloons} />
      <main className="min-h-screen px-6 py-4 sm:py-0 flex flex-col items-center sm:justify-center">
        <PackOpener packsAvailable={packsAvailable} doubloons={doubloons} />
        {bounties && <WeeklyBounties initialData={bounties} />}
        {stats && <PackStatsToggle stats={stats} history={history} />}
      </main>
    </>
  )
}
