import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { getCrew } from './actions'

export default async function SocialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, crew] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    getCrew(),
  ])

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pt-8">
        <div className="px-6 max-w-sm mx-auto mb-6">
          <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Social</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>Your Crew</h1>
        </div>
        <SocialClient initialCrew={crew} />
      </main>
    </>
  )
}

// Imported after server component declaration to avoid circular issues
import SocialClient from './SocialClient'
