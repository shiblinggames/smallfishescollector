import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isPremiumActive } from '@/lib/premium'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import MarketCard from './MarketCard'
import TackleShopCard from './TackleShopCard'
import ShipyardCard from './ShipyardCard'
import MembershipCard from './MembershipCard'
import BoardGameCard from './BoardGameCard'

export default async function MarketplacePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Request-scoped cached loader (lib/userData.ts) like every other tab —
  // this page used to hand-roll its own auth + profile queries, the last
  // holdout from before the loader existed. Only the premium flag is read.
  const profile = await getCurrentProfile()
  const isPremium = isPremiumActive(profile)

  const marlinUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/Blue_Marlin.png`

  return (
    <main className="min-h-screen">
      <div className="px-4 pb-16 max-w-lg mx-auto flex flex-col gap-7 pt-6" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Storefront title ── */}
        <header style={{ textAlign: 'center', marginBottom: -4 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.85rem', color: '#f4ecd8', letterSpacing: '0.04em', lineHeight: 1, textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 0 22px rgba(240,192,64,0.22)' }}>
            The Market
          </p>
          <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: '#9a948a', marginTop: 7, letterSpacing: '0.02em' }}>
            Sell your haul, outfit your rig, and grow your fleet.
          </p>
        </header>

        {/* ── Market ── */}
        <section>
          <SectionLabel>Market</SectionLabel>
          <MarketCard marlinUrl={marlinUrl} />
        </section>

        {/* ── Upgrades ── */}
        <section>
          <SectionLabel>Upgrades</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <TackleShopCard />
            <ShipyardCard />
          </div>
        </section>

        {/* ── Shop ── */}
        <section>
          <SectionLabel>Shop</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <MembershipCard isPremium={isPremium} />
            <BoardGameCard />
          </div>
        </section>

        {/* Redeem — promoted from a tiny text link to a proper slim card so it
            reads as a real destination, matching the shop chrome. */}
        <RedeemCard />

      </div>
    </main>
  )
}

// ── Section heading — gold tick + spaced caps (matches the Shipyard's
//    SectionLabel so the hub and shop interiors share one heading voice). ──
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingLeft: 2 }}>
      <span aria-hidden style={{ width: 3, height: 13, borderRadius: 2, flexShrink: 0, background: 'linear-gradient(180deg, #f0c040 0%, rgba(240,192,64,0.15) 100%)' }} />
      <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.72rem', color: '#d8d4cd' }}>
        {children}
      </p>
    </div>
  )
}

function RedeemCard() {
  return (
    <Link href="/marketplace/redeem" style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(20,16,9,0.92) 0%, rgba(10,8,5,0.94) 100%)',
        border: '1px solid rgba(196,169,106,0.32)',
        borderTop: '1px solid rgba(196,169,106,0.5)',
        borderRadius: 14, padding: '0.85rem 1rem',
        boxShadow: '0 3px 10px rgba(0,0,0,0.35)',
      }}>
        <span aria-hidden style={{
          flexShrink: 0, width: 34, height: 34, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.3)',
        }}>
          {/* ticket / redeem glyph */}
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
            <path d="M13 7v10" strokeDasharray="2 2" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.2 }}>Redeem a Code</p>
          <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#8a8784', marginTop: 2 }}>Got a pack or gift code? Claim it here.</p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a7568" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
    </Link>
  )
}
