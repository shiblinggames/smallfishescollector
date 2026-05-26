import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CrownAndAnchor from '../CrownAndAnchor'
import { getDailyWagered } from '../actions'

export default async function CrownAndAnchorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, dailyWagered] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    getDailyWagered(),
  ])

  return (
    <>
      <main className="min-h-screen pb-24 sm:pb-0">
          <div className="px-6 pt-8 pb-5 text-center">
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>
              Crown &amp; Anchor
            </h1>
          </div>

          <div className="px-6 pb-12">
            <CrownAndAnchor
              doubloons={profile?.doubloons ?? 0}
              dailyWagered={dailyWagered}
            />
          </div>
      </main>
    </>
  )
}
