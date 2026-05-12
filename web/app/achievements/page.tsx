import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { BADGES } from '@/lib/badges'
import AchievementsClient from './AchievementsClient'

export default async function AchievementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('packs_available, doubloons, gems, unlocked_badges')
    .eq('id', user.id)
    .single()

  const unlocked: string[] = (profile?.unlocked_badges as string[]) ?? []

  // Mark this visit so the nav badge dismisses until a new achievement is earned.
  await admin
    .from('profiles')
    .update({ last_viewed_achievements_at: new Date().toISOString() })
    .eq('id', user.id)

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <main className="min-h-screen pt-8">
        <div className="px-6 max-w-2xl mx-auto pb-16">

          <div className="mb-8">
            <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Honors</p>
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>Badges</h1>
            <p className="font-karla" style={{ fontSize: '0.75rem', color: 'rgba(240,237,232,0.45)', marginTop: 4 }}>
              Earned through meaningful achievements.
            </p>
          </div>

          <AchievementsClient
            badges={BADGES}
            unlocked={unlocked}
          />

        </div>
      </main>
    </>
  )
}
