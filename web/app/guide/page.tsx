import Nav from '@/components/Nav'

const RARITIES = [
  { label: 'Common',    color: '#8a8880', chance: '~70%',   note: 'Standard variant' },
  { label: 'Uncommon',  color: '#4ade80', chance: '~25%',   note: 'Silver variant' },
  { label: 'Rare',      color: '#60a5fa', chance: '~12%',   note: 'Gold variant' },
  { label: 'Epic',      color: '#a78bfa', chance: '~4%',    note: 'Pearl or Holographic' },
  { label: 'Legendary', color: '#f0c040', chance: '~0.5%',  note: 'Ghost, Shadow, or Prismatic' },
  { label: 'Mythic',    color: '#ff3838', chance: '~0.1%',  note: 'Named variants — rarest of all' },
]

export default function GuidePage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-14 flex flex-col items-center">
        <p className="sg-eyebrow text-center mb-3">Small Fishes Collector</p>
        <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-12"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
          How It Works.
        </h1>

        <a href="/packs" className="btn-gold mb-12">Open Packs</a>

        <div className="w-full max-w-2xl flex flex-col gap-6">

          <div className="sg-card px-8 py-7">
            <p className="font-cinzel font-700 text-[#f0ede8] text-base mb-4">What's in a Pack</p>
            <div className="flex flex-col gap-3 text-sm font-karla font-300 text-[#8a8880] leading-relaxed">
              <p>
                Each pack contains <span className="text-[#f0ede8] font-400">5 cards</span> drawn from the full pool of fish and variants.
                Every pack is guaranteed to include at least one <span className="text-[#60a5fa] font-400">Rare</span> or better.
                After 20 packs without a Legendary, the tide turns — your next pack is guaranteed a{' '}
                <span className="text-[#f0c040] font-400">Legendary</span> or better.
              </p>
              <p>
                Pulling the rarest cards can unlock <span className="text-[#f0ede8] font-400">special real-world rewards</span> — including
                discount codes and merch. Keep an eye out when something extraordinary lands.
              </p>
            </div>
          </div>

          <div className="sg-card px-8 py-7">
            <p className="font-cinzel font-700 text-[#f0ede8] text-base mb-5">Rarity Guide</p>
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
          </div>

          <div className="sg-card px-8 py-7">
            <p className="font-cinzel font-700 text-[#f0ede8] text-base mb-4">How to Get Packs</p>
            <div className="flex flex-col gap-3 text-sm font-karla font-300 text-[#8a8880] leading-relaxed">
              <p>
                Purchase the <span className="text-[#f0ede8] font-400">Small Fishes board game</span> from our website and you'll receive a code to unlock packs — sent to you after purchase, not in the box.
              </p>
              <p>
                Additional packs are distributed through <span className="text-[#f0ede8] font-400">redeem codes</span> — handed out at events, giveaways, and through our community channels.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <a
                  href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game"
                  target="_blank" rel="noopener noreferrer"
                  className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors"
                >
                  Buy the Game →
                </a>
                <a href="/redeem" className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors">
                  Redeem a Code →
                </a>
                <a
                  href="https://www.instagram.com/shiblinggames/"
                  target="_blank" rel="noopener noreferrer"
                  className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors"
                >
                  Instagram →
                </a>
                <a
                  href="https://www.tiktok.com/@shiblinggames"
                  target="_blank" rel="noopener noreferrer"
                  className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors"
                >
                  TikTok →
                </a>
              </div>
            </div>
          </div>

          <div className="flex justify-center pt-2">
            <a href="/packs" className="btn-gold">
              Open Packs
            </a>
          </div>

        </div>
      </main>
    </>
  )
}
