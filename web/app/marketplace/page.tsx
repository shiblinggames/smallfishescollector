import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import ShopCard from './ShopCard'
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

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <main className="min-h-screen">
        <div className="px-6 pb-12 max-w-4xl mx-auto flex flex-col gap-6 pt-6" style={{ position: 'relative', zIndex: 1 }}>

          {/* Fish Market */}
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#d0cdc8] mb-3" style={{ fontSize: '0.72rem' }}>Market</p>
            <Link href="/tavern/market" style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                position: 'relative', overflow: 'hidden',
                background: 'rgba(8,8,6,0.82)',
                border: '1px solid rgba(56,189,248,0.30)',
                borderRadius: 16, padding: '1.25rem 1.25rem 1.1rem',
              }}>
                {/* Decorative sparkline bg */}
                <svg aria-hidden viewBox="0 0 300 60" preserveAspectRatio="none"
                  style={{ position: 'absolute', bottom: 0, right: 0, width: '55%', height: '70%', opacity: 0.07 }}>
                  <polyline points="0,50 30,38 60,42 90,20 120,30 150,14 180,22 210,8 240,18 270,5 300,12"
                    fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinejoin="round" />
                </svg>

                <div className="flex items-start justify-between gap-4">
                  <div style={{ flex: 1 }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: marketState?.mood === 'kraken' ? '#ef4444' : marketState?.mood === 'storm' ? '#f59e0b' : '#4ade80',
                        boxShadow: `0 0 6px ${marketState?.mood === 'kraken' ? '#ef4444' : marketState?.mood === 'storm' ? '#f59e0b' : '#4ade80'}`,
                      }} />
                      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.58rem', color: '#6a9aaa' }}>
                        Live · {marketState?.mood === 'kraken' ? 'Kraken Surge' : marketState?.mood === 'storm' ? 'Storm Warning' : 'Calm Market'}
                      </p>
                    </div>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#ffffff', lineHeight: 1.15, marginBottom: '0.4rem' }}>
                      Fish Market
                    </p>
                    <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#a0a09a', lineHeight: 1.5 }}>
                      Trade your catch at hourly market prices.<br />Up to 2.5× base value.
                    </p>
                  </div>
                  <div style={{
                    flexShrink: 0, alignSelf: 'center',
                    width: 40, height: 40, borderRadius: 12,
                    background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#38bdf8',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                      <polyline points="16 7 22 7 22 13"/>
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* Upgrades */}
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#d0cdc8] mb-3" style={{ fontSize: '0.72rem' }}>Upgrades</p>
            <div className="grid grid-cols-2 gap-3">
              <ShopCard
                href="/marketplace/tackle-shop"
                eyebrow="Hooks · Rods · Bait"
                title="Tackle Shop"
                description="Upgrade your fishing gear to catch more and catch better."
                info={[
                  'Hooks widen your catch zone',
                  'Rods each have a unique special ability',
                  'Reels slow the dial needle for easier timing',
                  'Bait affects bite speed and catch window',
                  'Line reduces snag zones — earned free',
                ]}
                icon={<HookIcon />}
                accentColor="#22d3ee"
              />
              <ShopCard
                href="/marketplace/shipyard"
                eyebrow="Ship · Hold · Crew"
                title="Shipyard"
                description="Upgrade your ship for bigger hauls and stronger expeditions."
                info={[
                  'Larger fish hold for longer sessions',
                  'More crew slots for expedition loadouts',
                  'Higher base damage in combat',
                ]}
                icon={<ShipIcon />}
                accentColor="#fb923c"
              />
            </div>
          </div>

          {/* Shop */}
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#d0cdc8] mb-3" style={{ fontSize: '0.72rem' }}>Shop</p>
            <div className="grid grid-cols-2 gap-3">
              <ShopCard
                href="https://shiblingshop.com/products/small-fishes-premium-membership"
                eyebrow="Support Us"
                title="Membership"
                description={isPremium ? "You're a Member — thanks!" : "Support us & get daily perks."}
                info={
                  isPremium
                    ? ['Daily pack active', '100 ⟡ daily bonus active', 'No market fees', 'Member badge active']
                    : ['1 free pack every day', '100 ⟡ daily (vs. 50 free)', 'No market transaction fees', 'Member badge on profile']
                }
                icon={<StarIcon />}
                badge={isPremium ? 'Member' : undefined}
                external
              />
              <ShopCard
                href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game"
                eyebrow="Board Game"
                title="Seas the Booty"
                description="Each purchase includes 20 digital packs."
                info={[
                  'Strategy card game for 2–6 players',
                  'Features the same great art',
                  '$29.99',
                ]}
                icon={<BoxIcon />}
                external
              />
            </div>
          </div>

        </div>

        <div className="px-6 pb-16 text-center" style={{ position: 'relative', zIndex: 1 }}>
          <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.75rem' }}>
            Have a pack code?{' '}
            <Link href="/marketplace/redeem" className="text-[#a09d98] hover:text-[#c0bfba] transition-colors">
              Redeem it here →
            </Link>
          </p>
        </div>
      </main>
    </>
  )
}

function ShipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 17 C4 21 20 21 22 17"/>
      <path d="M3 17 L5 12 L19 12 L21 17"/>
      <line x1="11" y1="12" x2="11" y2="4"/>
      <path d="M11 4 L18 9 L11 12"/>
      <line x1="7" y1="12" x2="7" y2="7"/>
      <path d="M7 7 L11 9 L7 11"/>
    </svg>
  )
}

function HookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v9"/>
      <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
      <circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
    </svg>
  )
}
