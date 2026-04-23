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
    supabase.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    getPackStats(),
    getPackHistory(),
  ])

  const packsAvailable = profile?.packs_available ?? 0
  const doubloons = profile?.doubloons ?? 0

  return (
    <>
      <Nav packsAvailable={packsAvailable} />
      <main className="min-h-screen px-6 py-4 sm:py-14 flex flex-col items-center">
        <div className="hidden sm:contents">
          <p className="sg-eyebrow text-center mb-3">Booster Packs</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-12"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            Go Fishing.
          </h1>
        </div>
        <PackOpener packsAvailable={packsAvailable} doubloons={doubloons} />
        {stats && <PackStatsToggle stats={stats} history={history} />}
        <div className="mt-16 flex flex-col items-center gap-3">
          <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.75rem' }}>
            Need more doubloons?{' '}
            <a href="/tavern" className="text-[#f0c040] hover:text-[#f5d060] transition-colors">
              Earn them in the Tavern →
            </a>
          </p>
          <a href="/guide" className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors">
            How It Works →
          </a>
        </div>
      </main>
    </>
  )
}
