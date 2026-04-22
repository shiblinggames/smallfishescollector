import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import PackOpener from './PackOpener'
import PackStatsToggle from './PackStatsToggle'
import PackInfo from './PackInfo'
import { getPackStats, getPackHistory } from './stats'

export default async function PacksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, stats, history] = await Promise.all([
    supabase.from('profiles').select('packs_available').eq('id', user.id).single(),
    getPackStats(),
    getPackHistory(),
  ])

  const packsAvailable = profile?.packs_available ?? 0

  return (
    <>
      <Nav packsAvailable={packsAvailable} />
      <main className="min-h-screen px-6 py-14 flex flex-col items-center">
        <p className="sg-eyebrow text-center mb-3">Booster Packs</p>
        <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-12"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
          Go Fishing.
        </h1>
        <PackOpener packsAvailable={packsAvailable} />
        {stats && <PackStatsToggle stats={stats} history={history} />}
        <PackInfo />
      </main>
    </>
  )
}
