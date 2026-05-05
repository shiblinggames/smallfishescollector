import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default async function MarketplacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: marketState }] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, is_premium, premium_expires_at, gems').eq('id', user.id).single(),
    admin.from('market_state').select('mood').eq('id', 1).single(),
  ])

  const isPremium =
    !!profile?.is_premium &&
    !!profile?.premium_expires_at &&
    new Date(profile.premium_expires_at) > new Date()

  const moodColor = marketState?.mood === 'kraken' ? '#ef4444' : marketState?.mood === 'storm' ? '#f59e0b' : '#4ade80'
  const moodLabel = marketState?.mood === 'kraken' ? 'Kraken Surge' : marketState?.mood === 'storm' ? 'Storm Warning' : 'Calm Market'

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <main className="min-h-screen">
        <div className="px-4 pb-16 max-w-lg mx-auto flex flex-col gap-8 pt-6" style={{ position: 'relative', zIndex: 1 }}>

          {/* ── Market ── */}
          <section>
            <Label>Market</Label>
            <Link href="/tavern/market" style={{ textDecoration: 'none', display: 'block' }}>
              <DestCard
                accent="#38bdf8"
                art={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/Blue_Marlin.png`}
                artStyle={{ height: 145, right: -10 }}
                eyebrow={<>
                  <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    background: moodColor, boxShadow: `0 0 6px ${moodColor}`,
                    marginRight: 5, verticalAlign: 'middle', marginBottom: 1,
                  }} />
                  Live · {moodLabel}
                </>}
                title="Fish Market"
                description="Trade your catch at live market prices. Up to 2.5× base value."
                tags={['Hourly pricing', 'Up to 2.5× value', 'Full Moon bonus']}
                extra={
                  <svg aria-hidden viewBox="0 0 300 60" preserveAspectRatio="none"
                    style={{ position: 'absolute', bottom: 0, right: 0, width: '55%', height: '100%', opacity: 0.06 }}>
                    <polyline points="0,50 30,38 60,42 90,20 120,30 150,14 180,22 210,8 240,18 270,5 300,12"
                      fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinejoin="round" />
                  </svg>
                }
              />
            </Link>
          </section>

          {/* ── Upgrades ── */}
          <section>
            <Label>Upgrades</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

              <Link href="/marketplace/tackle-shop" style={{ textDecoration: 'none', display: 'block' }}>
                <DestCard
                  accent="#22d3ee"
                  art="/legendaryrod.png"
                  artStyle={{ height: 160, right: -10 }}
                  eyebrow="Hooks · Rods · Reels · Bait"
                  title="Tackle Shop"
                  description="Every piece of gear changes how you fish. Rods have unique abilities, reels slow the needle, hooks widen your catch zone."
                  tags={['Widen catch zone', 'Slow the needle', 'Rod abilities']}
                />
              </Link>

              <Link href="/marketplace/shipyard" style={{ textDecoration: 'none', display: 'block' }}>
                <DestCard
                  accent="#fb923c"
                  art="/models/man-o-war.png"
                  artStyle={{ height: 150, right: -12 }}
                  eyebrow="Ship · Hold · Crew"
                  title="Shipyard"
                  description="A bigger ship means a bigger haul. Upgrade your vessel for more hold capacity, crew slots, and expedition power."
                  tags={['Bigger fish hold', 'More crew slots', 'Combat power']}
                />
              </Link>

            </div>
          </section>

          {/* ── Shop ── */}
          <section>
            <Label>Shop</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

              <a href="https://shiblingshop.com/products/small-fishes-premium-membership" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                <DestCard
                  accent="#f0c040"
                  art="/goldenlure.png"
                  artStyle={{ height: 130, right: 8 }}
                  eyebrow={isPremium ? 'Active membership' : 'Support us'}
                  title={isPremium ? "You're a Member" : 'Membership'}
                  description={isPremium ? "Thanks for your support. Your daily perks are active." : "Support the game and get daily perks — a free pack, bonus doubloons, and no market fees."}
                  tags={isPremium
                    ? ['Daily pack active', '100 ⟡ daily', 'No market fees']
                    : ['1 free pack/day', '100 ⟡ daily bonus', 'No market fees']}
                  badge={isPremium ? 'Member' : undefined}
                />
              </a>

              <a href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                <DestCard
                  accent="#a78bfa"
                  art="/physicalboardgame.png"
                  artStyle={{ height: 140, right: -8 }}
                  eyebrow="Physical board game"
                  title="Seas the Booty"
                  description="A strategy card game for 2–6 players featuring the same art. Every purchase includes 20 digital packs."
                  tags={['2–6 players', '$29.99', '20 digital packs']}
                />
              </a>

            </div>
          </section>

          {/* Redeem */}
          <div className="text-center" style={{ marginTop: -8 }}>
            <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.75rem' }}>
              Have a pack code?{' '}
              <Link href="/marketplace/redeem" className="text-[#a09d98] hover:text-[#c0bfba] transition-colors">
                Redeem it here →
              </Link>
            </p>
          </div>

        </div>
      </main>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.16em]"
      style={{ fontSize: '0.6rem', color: '#4a4845', marginBottom: '0.65rem', paddingLeft: 2 }}>
      {children}
    </p>
  )
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span className="font-karla font-600" style={{
      fontSize: '0.58rem', color: color + 'cc',
      background: color + '14', border: `1px solid ${color}28`,
      padding: '0.15rem 0.5rem', borderRadius: '2rem', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function DestCard({
  accent, art, artStyle, eyebrow, title, description, tags, badge, extra,
}: {
  accent: string
  art: string | null
  artStyle?: React.CSSProperties
  eyebrow: React.ReactNode
  title: string
  description: string
  tags: string[]
  badge?: string
  extra?: React.ReactNode
}) {
  const bg = `rgba(6,12,20,0.92)`
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: bg,
      border: `1px solid ${accent}30`,
      borderTop: `1px solid ${accent}55`,
      borderRadius: 20,
      padding: '1.3rem 1.4rem 1.25rem',
      transition: 'border-color 0.15s',
    }}>
      {/* Radial glow behind art */}
      {art && (
        <div style={{
          position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)',
          width: 200, height: 200, borderRadius: '50%',
          background: `radial-gradient(ellipse, ${accent}18 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Art image */}
      {art && (
        <img
          src={art}
          alt=""
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            objectFit: 'contain',
            filter: `drop-shadow(0 4px 20px ${accent}55)`,
            opacity: 0.92,
            pointerEvents: 'none',
            ...artStyle,
          }}
        />
      )}

      {/* Gradient fade so text stays readable over art */}
      {art && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to right, ${bg} 45%, ${bg}cc 62%, transparent 82%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Extra decorative layer (e.g. sparkline) */}
      {extra}

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: art ? '64%' : '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.4rem' }}>
          <p className="font-karla font-600 uppercase tracking-[0.12em]"
            style={{ fontSize: '0.54rem', color: accent + 'aa', lineHeight: 1 }}>
            {eyebrow}
          </p>
          {badge && (
            <span className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{ fontSize: '0.48rem', color: '#f0c040', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.28)', padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
              {badge}
            </span>
          )}
        </div>

        <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1.15, marginBottom: '0.45rem' }}>
          {title}
        </p>

        <p className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#7a7875', lineHeight: 1.55, marginBottom: '0.7rem' }}>
          {description}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {tags.map(t => <Tag key={t} label={t} color={accent} />)}
        </div>
      </div>
    </div>
  )
}
