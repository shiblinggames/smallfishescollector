import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { ACHIEVEMENTS, type AchievementCategory } from '@/lib/achievements'

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  packs:      'Packs',
  collection: 'Collection',
  fotd:       'Fish of the Day',
  tavern:     'Tavern',
  bonus:      'Daily Bonus',
  membership: 'Membership',
}

const CATEGORY_ORDER: AchievementCategory[] = ['packs', 'collection', 'fotd', 'tavern', 'bonus', 'membership']

const ICON_SVG: Record<string, React.ReactNode> = {
  pack: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
    </svg>
  ),
  fish: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 12c.94-3.46 4.94-6 10.5-6-3 3.46-3 8.54 0 12-5.56 0-9.56-2.54-10.5-6z"/>
      <path d="M18 6L2 12l16 6"/>
    </svg>
  ),
  star: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  anchor: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="22"/>
      <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    </svg>
  ),
  coin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v2m0 8v2m-3-7h6"/>
    </svg>
  ),
  crown: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 19l3-10 4.5 4.5L12 4l2.5 9.5L19 9l3 10H2z"/>
    </svg>
  ),
  scroll: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
    </svg>
  ),
  trophy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4V4h16v5h-2"/>
      <path d="M6 4v5a6 6 0 0 0 12 0V4"/>
      <line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>
    </svg>
  ),
}

export default async function AchievementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: unlockedRows }] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    admin.from('user_achievements').select('achievement_key').eq('user_id', user.id),
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
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-8">
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
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
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
          <div className="flex flex-col gap-8">
            {byCategory.map(({ cat, label, achievements }) => {
              const catUnlocked = achievements.filter(a => unlocked.has(a.key)).length
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764]" style={{ fontSize: '0.6rem' }}>
                      {label}
                    </p>
                    <p className="font-karla font-300 text-[#4a4845]" style={{ fontSize: '0.6rem' }}>
                      {catUnlocked} / {achievements.length}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {achievements.map(a => {
                      const done = unlocked.has(a.key)
                      return (
                        <div
                          key={a.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.875rem',
                            padding: '0.875rem 1rem',
                            background: done ? 'rgba(240,192,64,0.05)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${done ? 'rgba(240,192,64,0.18)' : 'rgba(255,255,255,0.05)'}`,
                            borderRadius: '12px',
                            opacity: done ? 1 : 0.45,
                          }}
                        >
                          <div style={{
                            width: 36, height: 36, flexShrink: 0,
                            background: done ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${done ? 'rgba(240,192,64,0.25)' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '9px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: done ? '#f0c040' : '#6a6764',
                          }}>
                            {ICON_SVG[a.icon]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: done ? '#f0ede8' : '#8a8880' }}>
                              {a.name}
                            </p>
                            <p className="font-karla font-300 text-[#6a6764] mt-0.5" style={{ fontSize: '0.72rem', lineHeight: 1.45 }}>
                              {a.description}
                            </p>
                          </div>
                          {done && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M20 6L9 17l-5-5"/>
                            </svg>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </main>
    </>
  )
}
