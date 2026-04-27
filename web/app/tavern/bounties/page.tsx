import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { getWeeklyBounties } from '@/app/packs/bountyActions'
import { daysUntilReset } from '@/lib/weekStart'
import BountyClaimClient from './BountyClaimClient'

export default async function BountiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('packs_available, doubloons, gems')
    .eq('id', user.id)
    .single()

  const bounties = await getWeeklyBounties()
  if (!bounties) redirect('/tavern')

  const days = daysUntilReset()

  return (
    <>
      <Nav
        packsAvailable={profile?.packs_available ?? 0}
        doubloons={profile?.doubloons ?? 0}
        gems={profile?.gems ?? 0}
      />
      <main className="min-h-screen px-6 pb-24 sm:pb-12 max-w-lg mx-auto">
        <div className="pt-8 pb-6">
          <Link
            href="/tavern"
            className="font-karla font-600 uppercase tracking-[0.1em] text-[#4a4845] hover:text-[#6a6764] transition-colors"
            style={{ fontSize: '0.6rem' }}
          >
            ← Tavern
          </Link>
          <h1 className="font-cinzel font-700 text-[#f0ede8] mt-3 leading-tight" style={{ fontSize: 'clamp(1.8rem, 5vw, 2.5rem)' }}>
            Weekly Bounties
          </h1>
          <p className="font-karla text-[#6a6764] mt-1" style={{ fontSize: '0.8rem' }}>
            Catch the target fish while fishing to earn rewards.
            Resets in {days} day{days !== 1 ? 's' : ''}.
          </p>
        </div>

        <BountyClaimClient bounties={bounties} doubloons={profile?.doubloons ?? 0} />

        <div className="mt-8 text-center">
          <Link
            href="/tavern/fishing"
            className="btn-ghost"
            style={{ fontSize: '0.8rem' }}
          >
            Go Fishing →
          </Link>
        </div>
      </main>
    </>
  )
}
