import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { getRaidPlayerStats } from '../actions'
import { CORSAIRS_RECKONING } from '@/lib/bossRaids'
import TurnBasedRaidPreview from './TurnBasedRaidPreview'

export default async function TurnBasedRaidPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const stats = await getRaidPlayerStats(user.id)

  return (
    <>
      <Nav packsAvailable={0} doubloons={0} gems={0} />
      <main className="min-h-screen pt-6">
        <div className="px-4 pb-12 max-w-md mx-auto">
          <Link href="/raids" className="font-karla text-[#6a6764] text-xs uppercase tracking-[0.12em] hover:text-[#a0a09a] transition-colors">
            ← Back to raids
          </Link>
          <div className="text-center mt-3 mb-4">
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.58rem', color: '#fbbf24' }}>PREVIEW</p>
            <h1 className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8' }}>Turn-Based Combat</h1>
            <p className="font-karla font-300 mt-1" style={{ fontSize: '0.7rem', color: '#a0a09a' }}>
              Test the new mechanic. Win/loss here doesn&apos;t affect your real stats.
            </p>
          </div>

          <TurnBasedRaidPreview
            config={CORSAIRS_RECKONING}
            stats={stats}
          />
        </div>
      </main>
    </>
  )
}
