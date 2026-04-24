import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import MarketRedeemBar from './MarketRedeemBar'
import ShopCard from './ShopCard'

export default async function MarketplacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('packs_available, doubloons, is_premium, premium_expires_at')
    .eq('id', user.id)
    .single()

  const isPremium =
    !!profile?.is_premium &&
    !!profile?.premium_expires_at &&
    new Date(profile.premium_expires_at) > new Date()

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <div className="px-6 max-w-4xl mx-auto mb-6">
          <MarketRedeemBar />
        </div>

        <div className="px-6 pb-12 max-w-4xl mx-auto flex flex-col gap-6">

          {/* Upgrades */}
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.14em] text-[#6a6764] mb-3" style={{ fontSize: '0.65rem' }}>Upgrades</p>
            <div className="grid grid-cols-2 gap-3">
              <ShopCard
                href="/marketplace/tackle-shop"
                eyebrow="Tackle Shop"
                title="Tackle Shop"
                description="Upgrade your hook for better pulls."
                info={[
                  'Better hooks unlock deeper zones',
                  'Improve your chances at rarer variants',
                  'Buy with doubloons earned daily',
                ]}
                icon={<HookIcon />}
              />
              <ShopCard
                href="/marketplace/shipyard"
                eyebrow="Shipyard"
                title="Shipyard"
                description="Earn more doubloons from your daily bonus."
                info={[
                  'Bigger ships earn more doubloons daily',
                  'Up to +125 ⟡ per day at max tier',
                  'Buy with doubloons earned daily',
                ]}
                icon={<ShipIcon />}
              />
            </div>
          </div>

          {/* Shop */}
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.14em] text-[#6a6764] mb-3" style={{ fontSize: '0.65rem' }}>Shop</p>
            <div className="grid grid-cols-2 gap-3">
              <ShopCard
                href="https://shiblingshop.com/products/small-fishes-premium-membership"
                eyebrow="Support Us"
                title="Membership"
                description={isPremium ? "You're a Member — thanks!" : "Support us & get daily perks."}
                info={
                  isPremium
                    ? ['Daily pack active', '100 ⟡ daily bonus active', 'Member badge on your profile']
                    : ['1 free pack every day', '100 ⟡ daily (vs. 50 free)', 'Member badge on your profile']
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
