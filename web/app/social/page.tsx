import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import SocialClient from './SocialClient'
import { getCrew } from './actions'

export default async function SocialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, crew] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems, username').eq('id', user.id).single(),
    getCrew(),
  ])

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <main className="min-h-screen pt-8">
        <div className="px-6 max-w-xl mx-auto mb-6 flex items-end justify-between">
          <div>
            <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Social</p>
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>Your Crew</h1>
          </div>
          {profile?.username && (
            <Link
              href={`/u/${profile.username}`}
              className="font-karla font-600"
              style={{ fontSize: '0.68rem', color: '#6a6764', textDecoration: 'none', marginBottom: 4 }}
            >
              View your profile →
            </Link>
          )}
        </div>
        <SocialClient
          initialCrew={crew}
          username={profile?.username ?? ''}
        />
      </main>
    </>
  )
}
