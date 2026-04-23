import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import CrownAndAnchor from './CrownAndAnchor'
import { getDailyWagered } from './actions'

export default async function TavernPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, dailyWagered] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    getDailyWagered(),
  ])

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0">
        <div className="px-6 pt-8 pb-5 text-center">
          <h1
            className="font-cinzel font-700 text-[#f0ede8] leading-[0.92] tracking-[-0.01em]"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
          >
            Tavern.
          </h1>
          <p className="font-karla font-300 text-[#8a8880] text-sm mt-3">
            Games of chance — earn doubloons, spend doubloons.
          </p>
        </div>

        <div className="px-6 py-6">
          <div className="max-w-sm mx-auto">
            <p className="sg-eyebrow mb-6 text-center">Crown &amp; Anchor</p>
            <CrownAndAnchor
              doubloons={profile?.doubloons ?? 0}
              dailyWagered={dailyWagered}
            />
          </div>
        </div>
      </main>
    </>
  )
}
