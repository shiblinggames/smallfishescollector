import Nav from '@/components/Nav'
import Link from 'next/link'

const RARITIES = [
  { label: 'Common',    color: '#8a8880', chance: '~70%',   note: 'Standard variant' },
  { label: 'Uncommon',  color: '#4ade80', chance: '~25%',   note: 'Silver variant' },
  { label: 'Rare',      color: '#60a5fa', chance: '~12%',   note: 'Gold variant' },
  { label: 'Epic',      color: '#a78bfa', chance: '~4%',    note: 'Pearl or Holographic' },
  { label: 'Legendary', color: '#f0c040', chance: '~0.5%',  note: 'Ghost, Shadow, or Prismatic' },
  { label: 'Mythic',    color: '#ff3838', chance: '~0.2%',  note: 'Named variants — rarest of all' },
]

export default function GuidePage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-14 pb-24 sm:pb-14 flex flex-col items-center">
        <p className="sg-eyebrow text-center mb-3">Small Fishes Collector</p>
        <h1
          className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-4"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
        >
          How It Works.
        </h1>
        <p className="font-karla font-300 text-[#8a8880] text-center mb-10 max-w-sm" style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>
          Small Fishes is a digital collectible card game built around real fish. Open packs, build your collection, and earn doubloons playing daily games in the Tavern.
        </p>

        <Link href="/packs" className="btn-ghost mb-14">Play Now</Link>

        <div className="w-full max-w-2xl flex flex-col gap-5">

          {/* Packs */}
          <Section title="Opening Packs">
            <p>
              Each pack contains <Highlight>5 cards</Highlight> drawn from the full pool of fish and variants. Every pack is guaranteed at least one <span style={{ color: '#60a5fa' }}>Rare</span> or better — and after 20 packs without a Legendary, your next pack is guaranteed a <span style={{ color: '#f0c040' }}>Legendary</span> or better. The game keeps track, so you're never stuck in a dry spell forever.
            </p>
            <p>
              You can open packs using <Highlight>doubloons ⟡</Highlight> (1 pack for 200 ⟡, 10 for 1,500 ⟡), or earn them through purchases from the Shibling Shop. Premium members also receive a free pack every day.
            </p>
          </Section>

          {/* Rarity */}
          <div className="sg-card px-8 py-7">
            <p className="font-cinzel font-700 text-[#f0ede8] text-base mb-2">Rarity</p>
            <p className="font-karla font-300 text-[#8a8880] text-sm leading-relaxed mb-5">
              Every fish comes in multiple variants — from Common all the way up to Mythic. The rarer the variant, the harder it is to pull. Pulling something extraordinary can also unlock <Highlight>real-world rewards</Highlight> like discount codes and merch.
            </p>
            <div className="flex flex-col gap-3">
              {RARITIES.map(({ label, color, chance, note }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="font-karla font-600 text-xs uppercase tracking-[0.10em] w-20 flex-shrink-0" style={{ color }}>{label}</span>
                  <span className="font-karla font-300 text-[#8a8880] text-xs flex-1">{note}</span>
                  <span className="font-karla font-300 text-[#6a6764] text-xs tabular-nums">{chance}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Collection */}
          <Section title="Your Collection">
            <p>
              Every card you pull is saved to your <Highlight>personal collection</Highlight>. Browse all the fish across every rarity — cards you haven't discovered yet appear as mysteries, giving you something to hunt for.
            </p>
            <p>
              You can also set a <Highlight>showcase</Highlight> of up to 5 cards that appear on your public profile. By default it shows your 5 rarest pulls — but you can hand-pick whichever fish you're most proud of.
            </p>
          </Section>

          {/* Doubloons */}
          <Section title="Doubloons ⟡">
            <p>
              Doubloons are the in-game currency. Earn them daily through the Tavern, then spend them on packs or save up for ship and tackle upgrades in the Market.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Row label="Daily Bonus" value="50 ⟡ free (100 ⟡ for members)" />
              <Row label="Fish of the Day" value="Up to 100 ⟡ per day" />
              <Row label="Daily Quiz" value="50 ⟡ for a correct answer" />
              <Row label="Crown & Anchor" value="Wager up to 500 ⟡ daily" />
              <Row label="Streak Milestones" value="Bonus ⟡ at 3, 7, and 30-day streaks" />
            </div>
          </Section>

          {/* Tavern */}
          <Section title="The Tavern">
            <p>
              The Tavern is your daily hub. Come back every day to claim your bonuses and play the daily games — each one resets at midnight.
            </p>
            <div className="flex flex-col gap-4 pt-1">
              <TavernGame
                name="Daily Bonus"
                desc="Claim your daily doubloons. Members get double the base amount plus a free pack on top."
              />
              <TavernGame
                name="Fish of the Day"
                desc="Identify the mystery fish using up to 4 progressive clues. The fewer guesses you need, the more you earn — up to 100 ⟡ for a first-guess solve. Solve daily to build a streak."
              />
              <TavernGame
                name="Daily Quiz"
                desc="One fresh fish trivia question every day, generated by AI. Answer correctly for 50 ⟡."
              />
              <TavernGame
                name="Crown & Anchor"
                desc="A classic dice game. Pick a symbol, place your wager, and roll three dice. Match them to multiply your bet. 500 ⟡ daily wagering cap."
              />
              <TavernGame
                name="Dead Man's Draw"
                desc="A push-your-luck card game. Draw fish cards one at a time and bank your points before a duplicate species busts your hand. First game daily is free."
              />
            </div>
          </Section>

          {/* Upgrades */}
          <Section title="Upgrades">
            <p>
              The <Highlight>Market</Highlight> is where you spend doubloons to improve your odds and earn more over time.
            </p>
            <div className="flex flex-col gap-4 pt-1">
              <TavernGame
                name="Tackle Shop"
                desc="Upgrade your fishing hook to access deeper waters and improve your chances of pulling rarer variants. Higher-tier hooks shift the odds in your favour."
              />
              <TavernGame
                name="Shipyard"
                desc="Upgrade your ship to earn passive doubloons from your daily bonus. Bigger ships earn more — up to +125 ⟡ per day at the top tier."
              />
            </div>
          </Section>

          {/* Social */}
          <Section title="Social & Leaderboards">
            <p>
              Build your crew by searching for other players and adding them. Visit their profiles to see their collection, achievements, and showcase catches.
            </p>
            <p>
              The <Highlight>Leaderboard</Highlight> ranks players globally across four categories — Collection, Achievements, Packs Opened, and Streak. Usernames are auto-generated but you can change yours once.
            </p>
          </Section>

          {/* Membership */}
          <Section title="Membership">
            <p>
              Small Fishes is built by a small three-person studio. A membership is the best way to support us and keeps the game growing.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Row label="Daily Pack" value="1 free pack every day" />
              <Row label="Bonus Doubloons" value="100 ⟡ daily instead of 50 ⟡" />
              <Row label="Member Badge" value="Shown on your public profile" />
            </div>
            <div className="pt-3">
              <a
                href="https://shiblingshop.com/products/small-fishes-premium-membership"
                target="_blank"
                rel="noopener noreferrer"
                className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors"
              >
                Become a Member →
              </a>
            </div>
          </Section>

          {/* Getting packs */}
          <Section title="Getting More Packs">
            <p>
              Beyond earning them in the Tavern, packs come with every purchase from the <Highlight>Shibling Shop</Highlight> — especially the physical board game, which includes 20 digital packs. We also hand out redeem codes through giveaways, events, and our social channels.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <a href="/redeem" className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors">
                Redeem a Code →
              </a>
              <a
                href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game"
                target="_blank" rel="noopener noreferrer"
                className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors"
              >
                Buy the Board Game →
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
          </Section>

          <div className="flex justify-center pt-4">
            <Link href="/packs" className="btn-ghost">Play Now</Link>
          </div>

        </div>
      </main>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sg-card px-8 py-7">
      <p className="font-cinzel font-700 text-[#f0ede8] text-base mb-4">{title}</p>
      <div className="flex flex-col gap-3 text-sm font-karla font-300 text-[#8a8880] leading-relaxed">
        {children}
      </div>
    </div>
  )
}

function Highlight({ children }: { children: React.ReactNode }) {
  return <span className="text-[#f0ede8] font-400">{children}</span>
}

function TavernGame({ name, desc }: { name: string; desc: string }) {
  return (
    <div>
      <p className="font-karla font-600 text-[#f0ede8] text-xs uppercase tracking-[0.10em] mb-0.5">{name}</p>
      <p>{desc}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="font-karla font-400 text-[#8a8880] text-xs">{label}</span>
      <span className="font-karla font-400 text-[#f0ede8] text-xs text-right">{value}</span>
    </div>
  )
}
