import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { ZONES, ZONE_ORDER, EXPEDITION_SHIP_STATS, type Expedition } from '@/lib/expeditions'
import ZoneCard from './ZoneCard'
import CrewRoster from './CrewRoster'
import DailyVoyagePanel from './DailyVoyagePanel'
import VoyageHistory from './VoyageHistory'
import { getCollectionForCrew } from './actions'
import { getDailyVoyageState } from './voyageActions'

export default async function ExpeditionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: expeditionRows }, collection, dailyVoyageState, { data: voyageHistoryRows }] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, ship_tier, gems, saved_crew, ship_name, expedition_xp')
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
    admin.from('daily_voyages')
      .select('id, route, total_doubloons, total_gems, crew_lost, created_at, captains_log')
      .eq('user_id', user.id)
      .eq('status', 'revealed')
      .order('created_at', { ascending: false })
      .limit(8),
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

      <main className="min-h-screen pb-24 sm:pb-0">

        <div className="px-5 max-w-lg mx-auto expeditions-content" style={{ paddingTop: '1rem' }}>

          {/* Crew roster */}
          <CrewRoster
            shipStats={shipStats}
            shipTier={shipTier}
            collection={collection}
            savedCrewVariantIds={savedCrewVariantIds}
            shipName={profile?.ship_name ?? null}
            expeditionXP={profile?.expedition_xp ?? 0}
          />

          {/* ── Voyage card ── */}
          <div style={{ marginBottom: '1rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Voyages</p>
            <DailyVoyagePanel
              savedCrewVariantIds={savedCrewVariantIds}
              collection={collection}
              shipTier={shipTier}
              todayVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.todayVoyage}
              readyVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.readyVoyage}
              expeditionXP={profile?.expedition_xp ?? 0}
              raidActive={hasActiveRaid}
            />
            <VoyageHistory voyages={(voyageHistoryRows ?? []) as import('./VoyageHistory').VoyageHistoryEntry[]} />
          </div>

          {/* ── Raids card ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Raids</p>
            <div style={{
              background: 'linear-gradient(135deg, rgba(20,14,6,0.80) 0%, rgba(14,10,4,0.88) 100%)',
              border: '1px solid rgba(240,192,64,0.10)',
              borderRadius: 16, padding: '1.1rem 1rem',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
            }}>
              <span style={{ fontSize: '1.2rem' }}>🔒</span>
              <div>
                <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#7a6848' }}>Coming soon</p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#4a3a28', lineHeight: 1.5, marginTop: 2 }}>
                  Raids are still being built. Check back soon.
                </p>
              </div>
            </div>
          </div>

          <div className="pb-16" />
        </div>
      </main>
      </div>
    </>
  )
}
