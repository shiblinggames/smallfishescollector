import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { ZONES, ZONE_ORDER, EXPEDITION_SHIP_STATS, type Expedition } from '@/lib/expeditions'
import ShipInfoPanel from './ShipInfoPanel'
import ZoneCard from './ZoneCard'

export default async function ExpeditionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: profile }, { data: expeditionRows }] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, ship_tier, gems')
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
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={doubloons} gems={profile?.gems ?? 0} />
      <div style={{ background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid rgba(251,191,36,0.2)', padding: '0.55rem 1.5rem', textAlign: 'center' }}>
        <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#fbbf24' }}>
          🚧 Under Construction — This feature is still being worked on.
        </p>
      </div>
      <main className="min-h-screen pb-24 sm:pb-0">

        {/* Ambient background */}
        <div aria-hidden style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: '70%',
          background: 'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(30,60,120,0.18) 0%, transparent 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <div className="px-5 max-w-lg mx-auto" style={{ position: 'relative', zIndex: 1, paddingTop: '2rem' }}>

          {/* Header */}
          <div style={{ marginBottom: '1.75rem' }}>
            <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#4a6a8a', marginBottom: '0.4rem' }}>
              Daily Voyage
            </p>
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.7rem', lineHeight: 1.1, marginBottom: '0.5rem' }}>
              Expeditions
            </h1>
            <p className="font-karla" style={{ fontSize: '0.75rem', color: '#5a5855', lineHeight: 1.6 }}>
              One voyage per day. Choose your zone, load your crew, and set sail.
            </p>
          </div>

          {/* Resume banner */}
          {activeExpedition && (
            <Link
              href={`/expeditions/voyage?id=${activeExpedition.id}`}
              style={{ textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}
            >
              <div style={{
                background: 'linear-gradient(135deg, rgba(240,192,64,0.10) 0%, rgba(240,160,40,0.05) 100%)',
                border: '1px solid rgba(240,192,64,0.28)',
                borderRadius: 14,
                padding: '1rem 1.1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem',
                  }}>
                    {ZONES[activeExpedition.zone].icon}
                  </div>
                  <div>
                    <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: '#f0c040', marginBottom: 2 }}>
                      Voyage in Progress
                    </p>
                    <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.9rem' }}>
                      {ZONES[activeExpedition.zone].name}
                    </p>
                    <p className="font-karla" style={{ fontSize: '0.65rem', color: '#a0906a', marginTop: 1 }}>
                      Event {activeExpedition.current_node + 1} of {ZONES[activeExpedition.zone].length - 1}
                    </p>
                  </div>
                </div>
                <div style={{
                  flexShrink: 0,
                  background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)',
                  borderRadius: 8, padding: '0.45rem 0.8rem',
                  fontSize: '0.6rem', color: '#f0c040',
                }} className="font-karla font-700 uppercase tracking-[0.1em]">
                  Resume →
                </div>
              </div>
            </Link>
          )}

          {/* Ship panel */}
          <ShipInfoPanel ship={EXPEDITION_SHIP_STATS[shipTier]} shipTier={shipTier} />

          {/* Zone cards */}
          <div className="flex flex-col gap-3 pb-16">
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
