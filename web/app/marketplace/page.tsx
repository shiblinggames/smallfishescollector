import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'

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
        <div className="px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-12 max-w-4xl mx-auto">
          <ShopCard
            href="/marketplace/tackle-shop"
            eyebrow="Upgrades"
            name="Tackle Shop"
            description="Upgrade your hook to fish in deeper waters and improve your odds on rare pulls."
            items={[
              'Better hooks unlock deeper zones',
              'Improve your chances at rarer variants',
              'Buy with doubloons earned daily',
            ]}
            icon={<HookIcon />}
          />
          <ShopCard
            href="/marketplace/redeem"
            eyebrow="Pack Codes"
            name="Redeem a Code"
            description="Got a code from a physical pack or promo? Enter it here for free packs."
            items={[
              'Codes included with physical packs',
              'Promo and event codes',
            ]}
            icon={<CodeIcon />}
          />
          <ShopCard
            href="https://shiblingshop.com/products/small-fishes-premium-membership"
            eyebrow="Support Us"
            name="Small Fishes Membership"
            description={
              isPremium
                ? "You're already a member — thanks for supporting our studio!"
                : "Support our 3-person studio and get daily perks to grow your collection."
            }
            items={
              isPremium
                ? ['Daily pack active', '100 ⟡ daily bonus active', 'Member badge on your profile']
                : ['1 free pack every day', '100 ⟡ daily (vs. 50 free)', 'Member badge on your profile']
            }
            icon={<StarIcon />}
            badge={isPremium ? 'Member' : undefined}
            external
          />
        </div>
      </main>
    </>
  )
}

function ShopCard({
  href, eyebrow, name, description, items, icon, badge, external,
}: {
  href: string
  eyebrow: string
  name: string
  description: string
  items: string[]
  icon: React.ReactNode
  badge?: string
  external?: boolean
}) {
  const cardStyle: React.CSSProperties = {
    display: 'block',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '1.25rem',
    textDecoration: 'none',
  }

  const inner = (
    <>
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
          <div className="flex items-center gap-2">
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{name}</p>
            {badge && (
              <span className="font-karla font-700 uppercase tracking-[0.12em] text-[#f0c040] shrink-0" style={{ fontSize: '0.5rem' }}>{badge}</span>
            )}
          </div>
          <p className="font-karla text-[#8a8880] mt-1" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>{description}</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 6 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '1rem 0 0.75rem' }} />
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span style={{ color: '#4a4845', fontSize: '0.65rem', lineHeight: '1.6rem' }}>—</span>
            <span className="font-karla text-[#6a6764]" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>{item}</span>
          </li>
        ))}
      </ul>
    </>
  )

  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={cardStyle}>{inner}</a>
  }
  return <Link href={href} style={cardStyle}>{inner}</Link>
}

function HookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v9"/>
      <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
      <circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <path d="M7 9l3 3-3 3M13 15h4"/>
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
}
