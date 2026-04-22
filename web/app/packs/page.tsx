import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import PackOpener from './PackOpener'
import PackStatsToggle from './PackStatsToggle'
import { getPackStats, getPackHistory } from './stats'

export default async function PacksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, stats, history] = await Promise.all([
    supabase.from('profiles').select('packs_available').eq('id', user.id).single(),
    getPackStats(),
    getPackHistory(),
  ])

  const packsAvailable = profile?.packs_available ?? 0

  const RARITIES = [
    { label: 'Common',    color: '#8a8880', chance: '~70%',   note: 'Standard variant' },
    { label: 'Uncommon',  color: '#4ade80', chance: '~25%',   note: 'Silver variant' },
    { label: 'Rare',      color: '#60a5fa', chance: '~12%',   note: 'Gold variant' },
    { label: 'Epic',      color: '#a78bfa', chance: '~4%',    note: 'Pearl or Holographic' },
    { label: 'Legendary', color: '#f0c040', chance: '~0.5%',  note: 'Ghost, Shadow, or Prismatic' },
    { label: 'Mythic',    color: '#ff3838', chance: '~0.1%',  note: 'Named variants — rarest of all' },
  ]

  return (
    <>
      <Nav packsAvailable={packsAvailable} />
      <main className="min-h-screen px-6 py-14 flex flex-col items-center">
        <p className="sg-eyebrow text-center mb-3">Booster Packs</p>
        <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-12"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
          Go Fishing.
        </h1>
        <PackOpener packsAvailable={packsAvailable} />
        {stats && <PackStatsToggle stats={stats} history={history} />}

        {/* Info section */}
        <div className="w-full max-w-2xl mt-20 flex flex-col gap-6">

          {/* What's in a pack */}
          <div className="sg-card px-8 py-7">
            <p className="sg-eyebrow mb-3">What's in a Pack</p>
            <p className="font-karla font-300 text-[#8a8880] text-sm leading-relaxed">
              Each pack contains <span className="text-[#f0ede8] font-400">5 cards</span> drawn from the full pool of fish and variants.
              Every pack is guaranteed to include at least one <span className="text-[#60a5fa] font-400">Rare</span> or better.
              After 20 packs without a Legendary, the tide turns — your next pack is guaranteed a{' '}
              <span className="text-[#f0c040] font-400">Legendary</span> or better.
            </p>
            <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-1.5 text-sm">
              <p className="font-karla font-300 text-[#8a8880]">
                <span className="text-[#4ade80] font-400">Tier 2 fish</span> — minimum <span className="text-[#4ade80]">Uncommon</span>. You won't pull a Common from deeper waters.
              </p>
              <p className="font-karla font-300 text-[#8a8880]">
                <span className="text-[#60a5fa] font-400">Tier 3 fish</span> — minimum <span className="text-[#60a5fa]">Rare</span>. The deep sea doesn't give up easy finds.
              </p>
              <p className="font-karla font-300 text-[#8a8880]">
                <span className="text-[#a78bfa] font-400">Catfish &amp; Doby Mick</span> — minimum <span className="text-[#a78bfa]">Epic</span>. These two only appear in special variants.
              </p>
            </div>
          </div>

          {/* Rarity guide */}
          <div className="sg-card px-8 py-7">
            <p className="sg-eyebrow mb-4">Rarity Guide</p>
            <div className="flex flex-col gap-3">
              {RARITIES.map(({ label, color, chance, note }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="font-karla font-600 text-xs uppercase tracking-[0.10em] w-20 flex-shrink-0" style={{ color }}>{label}</span>
                  <span className="font-karla font-300 text-[#8a8880] text-xs flex-1">{note}</span>
                  <span className="font-karla font-300 text-[#8a8880] text-xs tabular-nums">{chance}</span>
                </div>
              ))}
            </div>
            <p className="font-karla font-300 text-[#8a8880] text-xs mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)] leading-relaxed">
              Odds reflect the base pool. A <span className="text-[#fff8e8] font-400">God Pack</span> is an extremely rare event where all 5 cards are Epic or better.
            </p>
          </div>

          {/* How to get packs */}
          <div className="sg-card px-8 py-7">
            <p className="sg-eyebrow mb-3">How to Get Packs</p>
            <p className="font-karla font-300 text-[#8a8880] text-sm leading-relaxed">
              Packs are earned through <span className="text-[#f0ede8] font-400">redeem codes</span> — distributed at events, giveaways, and through the Small Fishes community.
              Keep an eye on our channels for drops.
            </p>
            <div className="mt-4">
              <a href="/redeem" className="inline-block font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors">
                Redeem a Code →
              </a>
            </div>
          </div>

        </div>
      </main>
    </>
  )
}
