import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default async function TavernPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('packs_available, doubloons, fotd_streak')
    .eq('id', user.id)
    .single()

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <div className="px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-12 max-w-4xl mx-auto">
          <GameCard
            href="/tavern/fish-of-the-day"
            eyebrow="Daily Puzzle"
            name="Fish of the Day"
            description="Identify the mystery fish of the day using progressive clues."
            rules={[
              'Four clues, four guesses — one fish',
              'Each wrong guess reveals the next clue',
              '100 ⟡ for 1st guess · 75 · 50 · 25 ⟡',
              'New fish every day',
            ]}
            icon={<FishIcon />}
            streak={profile?.fotd_streak ?? 0}
          />
          <GameCard
            href="/tavern/crown-and-anchor"
            eyebrow="Dice Game"
            name="Crown & Anchor"
            description="Roll three dice and match your symbol to win doubloons."
            rules={[
              'Pick a symbol and place your wager',
              '1 match → 1× · 2 matches → 2× · 3 → 3×',
              '500 ⟡ daily wagering limit',
            ]}
            icon={<AnchorIcon />}
          />
          <GameCard
            href="/tavern/dead-mans-draw"
            eyebrow="Card Game"
            name="Dead Man's Draw"
            description="Push your luck. Draw cards and bank before you bust."
            rules={[
              'Draw cards one at a time — duplicate species = bust',
              'Power fish trigger special effects',
              'First to 30 points wins',
              'First game free daily · 20 ⟡ after',
            ]}
            icon={<SkullIcon />}
          />
        </div>

        <div className="px-6 pb-16 text-center">
          <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.75rem' }}>
            Need more packs?{' '}
            <a
              href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game"
              target="_blank" rel="noopener noreferrer"
              className="text-[#f0c040] hover:text-[#f5d060] transition-colors"
            >
              Get the game at the Shibling Shop →
            </a>
          </p>
        </div>
      </main>
    </>
  )
}

function GameCard({ href, eyebrow, name, description, rules, icon, streak }: {
  href: string
  eyebrow: string
  name: string
  description: string
  rules: string[]
  icon: React.ReactNode
  streak?: number
}) {
  return (
    <Link href={href} style={{
      display: 'block',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '1.25rem',
      textDecoration: 'none',
    }}>
      <div className="flex items-start gap-4">
        <div style={{
          width: 48, height: 48,
          background: 'rgba(240,192,64,0.08)',
          border: '1px solid rgba(240,192,64,0.18)',
          borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          color: '#f0c040',
        }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="sg-eyebrow mb-0.5" style={{ color: '#9a9488' }}>{eyebrow}</p>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{name}</p>
          <p className="font-karla text-[#8a8880] mt-1" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>{description}</p>
          {streak != null && streak > 0 && (
            <p className="font-karla font-600 mt-1.5" style={{ fontSize: '0.72rem', color: '#f0c040' }}>
              {streak} day streak
            </p>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 6 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '1rem 0 0.75rem' }} />
      <ul className="flex flex-col gap-1.5">
        {rules.map((rule, i) => (
          <li key={i} className="flex items-start gap-2">
            <span style={{ color: '#4a4845', fontSize: '0.65rem', lineHeight: '1.6rem' }}>—</span>
            <span className="font-karla text-[#6a6764]" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>{rule}</span>
          </li>
        ))}
      </ul>
    </Link>
  )
}

function FishIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-4 6-6 10-6s8 2 10 6c-2 4-6 6-10 6S4 16 2 12z"/>
      <circle cx="16" cy="10" r="1.2" fill="currentColor" stroke="none"/>
      <path d="M2 12c-2-2-2-4 0-4"/>
    </svg>
  )
}

function AnchorIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v10M8 17c0 0 1 2 4 2s4-2 4-2M7 11h10"/>
      <path d="M7 17c-2-1-3-3-3-5h3M17 17c2-1 3-3 3-5h-3"/>
    </svg>
  )
}

function SkullIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 22h6M12 22v-4"/>
      <path d="M5 12a7 7 0 0 1 14 0c0 3-1.5 5-3.5 6H8.5C6.5 17 5 15 5 12z"/>
      <circle cx="9.5" cy="11.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="14.5" cy="11.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )
}
