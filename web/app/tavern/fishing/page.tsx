import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import FishingGame from './FishingGame'
import { MAX_CASTS } from './actions'

export default async function FishingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles')
    .select('packs_available, doubloons, hook_tier, fishing_date, fishing_casts')
    .eq('id', user.id)
    .single()

  const isToday = profile?.fishing_date === today
  const castsUsed = isToday ? (profile?.fishing_casts ?? 0) : 0

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <div className="px-6 max-w-sm mx-auto">

          <div className="mb-6">
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem', marginBottom: '0.3rem' }}>
              Drop a Line
            </h1>
            <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.78rem' }}>
              {MAX_CASTS} casts per day. Better hooks earn more per cast.
            </p>
          </div>

          <FishingGame
            initialCastsUsed={castsUsed}
            hookTier={profile?.hook_tier ?? 0}
          />

        </div>
      </main>
    </>
  )
}
