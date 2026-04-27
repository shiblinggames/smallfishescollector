import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import PackOpener from './PackOpener'
import PackStatsToggle from './PackStatsToggle'
import { getPackStats, getPackHistory } from './stats'

export default async function PacksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, stats, history] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    getPackStats(),
    getPackHistory(),
  ])

  const packsAvailable = profile?.packs_available ?? 0
  const doubloons = profile?.doubloons ?? 0
  const gems = profile?.gems ?? 0

  return (
    <>
      <Nav packsAvailable={packsAvailable} doubloons={doubloons} gems={gems} />
      <main className="min-h-screen px-6 py-4 sm:py-0 flex flex-col items-center sm:justify-center">
        <PackOpener packsAvailable={packsAvailable} gems={gems} />
        {stats && <PackStatsToggle stats={stats} history={history} />}
      </main>
    </>
  )
}
