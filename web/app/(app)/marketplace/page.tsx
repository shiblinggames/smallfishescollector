import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isPremiumActive } from '@/lib/premium'
import MarketCard from './MarketCard'
import TackleShopCard from './TackleShopCard'
import ShipyardCard from './ShipyardCard'
import MembershipCard from './MembershipCard'
import BoardGameCard from './BoardGameCard'

export default async function MarketplacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Only the premium-status flag is needed in the page now — the
  // previous version also fetched market_state.mood for an eyebrow
  // mood indicator on the Fish Market card. Eyebrows are gone, so the
  // fetch and admin-client import are gone with them.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_premium, premium_expires_at')
    .eq('id', user.id)
    .single()

  const isPremium = isPremiumActive(profile)

  const marlinUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/Blue_Marlin.png`

  return (
    <main className="min-h-screen">
      <div className="px-4 pb-16 max-w-lg mx-auto flex flex-col gap-8 pt-6" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Market ── */}
        <section>
          <Label>Market</Label>
          <MarketCard marlinUrl={marlinUrl} />
        </section>

        {/* ── Upgrades ── */}
        <section>
          <Label>Upgrades</Label>
          <div className="grid grid-cols-2 gap-3">
            <TackleShopCard />
            <ShipyardCard />
          </div>
        </section>

        {/* ── Shop ── */}
        <section>
          <Label>Shop</Label>
          <div className="grid grid-cols-2 gap-3">
            <MembershipCard isPremium={isPremium} />
            <BoardGameCard />
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
  )
}

// ── Section heading (unchanged from the previous DestCard version) ──

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.14em]"
      style={{ fontSize: '0.72rem', color: '#8a8784', marginBottom: '0.75rem', paddingLeft: 2 }}>
      {children}
    </p>
  )
}
