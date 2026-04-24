import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { ZONES, ZONE_ORDER, type Expedition } from '@/lib/expeditions'
import ZoneCard from './ZoneCard'

export default async function ExpeditionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: profile }, { data: expeditionRows }] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, ship_tier')
      .eq('id', user.id)
      .single(),
    admin.from('expeditions')
      .select('*')
      .eq('user_id', user.id)
      .eq('expedition_date', today),
  ])

  const shipTier = profile?.ship_tier ?? 0
  const doubloons = profile?.doubloons ?? 0
  const todayExpeditions = (expeditionRows ?? []) as Expedition[]

  // Check if user owns Catfish or Doby Mick (for Davy Jones gate)
  const { data: specialCrew } = await admin
    .from('user_collection')
    .select('card_variants(cards(slug))')
    .eq('user_id', user.id)

  type SpecialRow = { card_variants: { cards: { slug: string } } | null }
  const ownedSlugs = new Set(
    (specialCrew as unknown as SpecialRow[]).flatMap(row =>
      row.card_variants?.cards?.slug ? [row.card_variants.cards.slug] : []
    )
  )
  const hasSpecialCrew = ownedSlugs.has('Catfish') || ownedSlugs.has('Doby_Mick')

  const activeExpedition = todayExpeditions.find(e => e.status === 'active') ?? null
  const dailyUsed = todayExpeditions.some(e => e.status === 'completed' || e.status === 'failed')

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={doubloons} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <div className="px-6 max-w-4xl mx-auto">

          {/* Header */}
          <div className="mb-6">
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem', marginBottom: '0.3rem' }}>
              Expeditions
            </h1>
            <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.78rem' }}>
              Send your ship into dangerous waters. One expedition per day — choose wisely.
            </p>
          </div>

          {/* Resume banner */}
          {activeExpedition && (
            <div
              style={{
                background: 'rgba(240,192,64,0.08)',
                border: '1px solid rgba(240,192,64,0.2)',
                borderRadius: 12,
                padding: '0.875rem 1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#f0c040', marginBottom: 2 }}>
                    Expedition in Progress
                  </p>
                  <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.88rem' }}>
                    {ZONES[activeExpedition.zone].name}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.68rem', color: '#a0a09a', marginTop: 1 }}>
                    Node {activeExpedition.current_node + 1} of {ZONES[activeExpedition.zone].length - 1}
                  </p>
                </div>
                <Link
                  href={`/expeditions/voyage?id=${activeExpedition.id}`}
                  className="font-karla font-700 uppercase tracking-[0.1em]"
                  style={{
                    fontSize: '0.62rem',
                    color: '#f0c040',
                    background: 'rgba(240,192,64,0.12)',
                    border: '1px solid rgba(240,192,64,0.25)',
                    borderRadius: 8,
                    padding: '0.4rem 0.75rem',
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  Resume →
                </Link>
              </div>
            </div>
          )}

          {/* Zone grid */}
          <div className="grid grid-cols-2 gap-3 pb-12">
            {ZONE_ORDER.map(zoneKey => {
              const expedition = todayExpeditions.find(e => e.zone === zoneKey) ?? null
              return (
                <ZoneCard
                  key={zoneKey}
                  zoneKey={zoneKey}
                  config={ZONES[zoneKey]}
                  expedition={expedition}
                  shipTier={shipTier}
                  hasSpecialCrew={hasSpecialCrew}
                  doubloons={doubloons}
                  dailyUsed={dailyUsed}
                />
              )
            })}
          </div>

        </div>
      </main>
    </>
  )
}
