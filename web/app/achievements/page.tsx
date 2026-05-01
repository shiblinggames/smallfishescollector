import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { ACHIEVEMENTS, type AchievementCategory } from '@/lib/achievements'
import AchievementsClient from './AchievementsClient'

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  packs:      'Packs',
  collection: 'Collection',
  fotd:       'Fish of the Day',
  fishing:    'Fishing',
  expedition: 'Expedition',
  tavern:     'Tavern',
  bonus:      'Daily Bonus',
  doubloons:  'Doubloons',
  membership: 'Membership',
}

const CATEGORY_ORDER: AchievementCategory[] = ['packs', 'collection', 'fotd', 'fishing', 'expedition', 'tavern', 'bonus', 'doubloons', 'membership']

export default async function AchievementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: unlockedRows }] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    admin.from('user_achievements').select('achievement_key').eq('user_id', user.id),
    admin.from('profiles').update({ last_viewed_achievements_at: new Date().toISOString() }).eq('id', user.id),
  ])

  const unlocked = new Set((unlockedRows ?? []).map((r: any) => r.achievement_key as string))
  const total = ACHIEVEMENTS.length
  const count = unlocked.size

  const byCategory = CATEGORY_ORDER.map(cat => ({
    cat,
    label: CATEGORY_LABELS[cat],
    achievements: ACHIEVEMENTS.filter(a => a.category === cat),
  }))

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <div style={{ background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid rgba(251,191,36,0.2)', padding: '0.55rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>🚧</span>
        <div>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#fbbf24' }}>Under Construction</p>
          <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: 'rgba(251,191,36,0.6)', lineHeight: 1.4, marginTop: 2 }}>Achievements are coming soon. Some may not unlock correctly yet.</p>
        </div>
      </div>
      <main className="min-h-screen pt-8">
        <div className="px-6 max-w-2xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Progress</p>
            <div className="flex items-end justify-between mb-3">
              <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>Achievements</h1>
              <p className="font-karla font-600 text-[#f0c040]" style={{ fontSize: '0.85rem' }}>
                {count} <span className="text-[#4a4845]">/ {total}</span>
              </p>
            </div>
            {/* Progress bar */}
            <div style={{ height: 4, background: 'rgba(255,255,255,0.11)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.round((count / total) * 100)}%`,
                background: 'linear-gradient(90deg, #f0c040, #ffd966)',
                borderRadius: 2,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>

          {/* Categories */}
          <AchievementsClient
            byCategory={byCategory}
            unlocked={[...unlocked]}
          />

        </div>
      </main>
    </>
  )
}
