import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { ZONES, ZONE_ORDER, EXPEDITION_SHIP_STATS, type Expedition } from '@/lib/expeditions'
import ZoneCard from './ZoneCard'
import CrewRoster from './CrewRoster'
import DailyVoyagePanel from './DailyVoyagePanel'
import { getCollectionForCrew } from './actions'
import { getDailyVoyageState } from './voyageActions'

export default async function ExpeditionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: expeditionRows }, collection, dailyVoyageState] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, ship_tier, gems, saved_crew')
      .eq('id', user.id)
      .single(),
    admin.from('expeditions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'completed', 'failed'])
      .order('started_at', { ascending: false })
      .limit(20),
    getCollectionForCrew(),
    getDailyVoyageState(),
  ])

  const shipTier = profile?.ship_tier ?? 0
  const doubloons = profile?.doubloons ?? 0
  const recentExpeditions = (expeditionRows ?? []) as Expedition[]
  const savedCrewVariantIds: number[] = (profile?.saved_crew as number[] | null) ?? []
  const shipStats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]

  const activeExpedition = recentExpeditions.find(e => e.status === 'active') ?? null
  const hasPendingVoyage = !('error' in dailyVoyageState) && dailyVoyageState.todayVoyage !== null
  const hasActiveRaid = !!activeExpedition

  return (
    <>
      {/* Background image — sits above the black body but below all page content */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/expedition-background.jpg"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 50%, rgba(0,0,0,0.92) 100%)',
        }} />
      </div>

      {/* All content — stacking context above the background */}
      <div style={{ position: 'relative', zIndex: 1 }}>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={doubloons} gems={profile?.gems ?? 0} />
      <div style={{ background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid rgba(251,191,36,0.2)', padding: '0.55rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#fbbf24' }}>Under Construction</p>
          <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: 'rgba(251,191,36,0.6)', lineHeight: 1.4, marginTop: 2 }}>Expeditions are coming soon. You can explore the page but progress may reset.</p>
        </div>
      </div>
      <main className="min-h-screen pb-24 sm:pb-0">

        <div className="px-5 max-w-lg mx-auto sm:[zoom:1.4]" style={{ paddingTop: '1rem' }}>

          {/* Crew roster */}
          <CrewRoster
            shipStats={shipStats}
            shipTier={shipTier}
            collection={collection}
            savedCrewVariantIds={savedCrewVariantIds}
          />

          {/* ── Voyage card ── */}
          <div style={{ marginBottom: '1rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Voyage</p>
            <DailyVoyagePanel
              savedCrewVariantIds={savedCrewVariantIds}
              collection={collection}
              shipTier={shipTier}
              todayVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.todayVoyage}
              readyVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.readyVoyage}
              raidActive={hasActiveRaid}
            />
          </div>

          {/* ── Raids card ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Raids</p>
            <div style={{
              background: 'linear-gradient(135deg, rgba(20,14,6,0.80) 0%, rgba(14,10,4,0.88) 100%)',
              border: '1px solid rgba(240,192,64,0.14)',
              borderRadius: 16, padding: '0.85rem',
              display: 'flex', flexDirection: 'column', gap: '0.65rem',
            }}>

              {/* Resume banner */}
              {activeExpedition && (
                <Link
                  href={`/expeditions/voyage?id=${activeExpedition.id}`}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(240,192,64,0.10) 0%, rgba(240,160,40,0.05) 100%)',
                    border: '1px solid rgba(240,192,64,0.28)',
                    borderRadius: 12,
                    padding: '0.85rem 1rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div>
                        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: '#f0c040', marginBottom: 2 }}>
                          In Progress
                        </p>
                        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.88rem' }}>
                          {ZONES[activeExpedition.zone].name}
                        </p>
                        <p className="font-karla" style={{ fontSize: '0.62rem', color: '#a0906a', marginTop: 1 }}>
                          Node {activeExpedition.current_node + 1} of {ZONES[activeExpedition.zone].nodes.length}
                        </p>
                      </div>
                    </div>
                    <div style={{
                      flexShrink: 0,
                      background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)',
                      borderRadius: 8, padding: '0.4rem 0.75rem',
                      fontSize: '0.6rem', color: '#f0c040',
                    }} className="font-karla font-700 uppercase tracking-[0.1em]">
                      Resume →
                    </div>
                  </div>
                </Link>
              )}

              {/* Zone cards */}
              {ZONE_ORDER.map(zoneKey => {
                const expedition = recentExpeditions.find(e => e.zone === zoneKey && e.status === 'active') ?? null
                return (
                  <ZoneCard
                    key={zoneKey}
                    zoneKey={zoneKey}
                    config={ZONES[zoneKey]}
                    expedition={expedition}
                    shipTier={shipTier}
                    doubloons={doubloons}
                    voyageLocked={hasPendingVoyage}
                  />
                )
              })}

            </div>
          </div>

          <div className="pb-16" />
        </div>
      </main>
      </div>
    </>
  )
}
