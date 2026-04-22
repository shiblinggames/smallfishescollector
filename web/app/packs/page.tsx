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

  const [{ data: profile }, { count: packHistoryCount }, stats, history] = await Promise.all([
    supabase.from('profiles').select('packs_available').eq('id', user.id).single(),
    supabase.from('pack_history').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    getPackStats(),
    getPackHistory(),
  ])

  if (packHistoryCount === 0 && packsAvailable > 0) redirect('/guide')

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
        <a href="/guide" className="mt-16 font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors">
          How It Works →
        </a>
      </main>
    </>
  )
}
