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
      <div style={{ background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid rgba(251,191,36,0.2)', padding: '0.55rem 1.5rem', textAlign: 'center' }}>
        <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#fbbf24' }}>
          🚧 Under Construction — This feature is still being worked on.
        </p>
      </div>
      <main className="min-h-screen px-6 py-8 flex flex-col items-center justify-center">
        <PackOpener packsAvailable={packsAvailable} gems={gems} />
        {stats && <PackStatsToggle stats={stats} history={history} />}
      </main>
    </>
  )
}
