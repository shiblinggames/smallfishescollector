import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { EXPEDITION_SHIP_STATS, type Expedition } from '@/lib/expeditions'
import RaidCard from './RaidCard'
import ShipHero from './ShipHero'
import DailyVoyagePanel from './DailyVoyagePanel'
import ExpeditionsTour from './ExpeditionsTour'
import { getCollectionForCrew } from './actions'
import { getDailyVoyageState } from './voyageActions'
import { getLevelFromXP } from '@/lib/expeditionLevel'

export default async function ExpeditionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: expeditionRows }, collection, dailyVoyageState, { data: voyageHistoryRows }] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, ship_tier, gems, saved_crew, ship_name, expedition_xp, equipped_ship_skin, ship_skins, raid_items, equipped_raid_items, has_completed_practice_raid')
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
  const navLevel = getLevelFromXP(profile?.expedition_xp ?? 0)
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

      <ExpeditionsTour />
      <main className="min-h-screen pb-24 sm:pb-0">

        <div className="px-5 max-w-lg mx-auto expeditions-content" style={{ paddingTop: '1rem' }}>

          {/* Ship Hero */}
          <ShipHero
            shipStats={shipStats}
            shipName={profile?.ship_name as string | null ?? null}
            expeditionXP={profile?.expedition_xp ?? 0}
            equippedShipSkin={profile?.equipped_ship_skin as string | null ?? null}
            shipSkins={(profile?.ship_skins as string[] | null) ?? []}
            collection={collection}
            savedCrewVariantIds={savedCrewVariantIds}
            ownedRaidItems={(profile?.raid_items as string[] | null) ?? []}
            equippedRaidItems={(profile?.equipped_raid_items as string[] | null) ?? []}
          />

          {/* ── Runs ── */}
          <div style={{ marginBottom: '1rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Runs</p>
            <a
              href="/expeditions/tide-run"
              className="block"
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: 'rgba(8, 18, 32, 0.78)',
                border: '1px solid rgba(189,160,90,0.35)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                textDecoration: 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/boatrun.png" alt="" style={{ width: 72, height: 'auto', flexShrink: 0, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.0rem', color: '#f0ede8', marginBottom: 2 }}>Tide Run</p>
                <p className="font-karla font-300" style={{ fontSize: '0.74rem', color: 'rgba(240,237,232,0.7)', lineHeight: 1.4 }}>
                  Make off with the cargo and outrun the navy. One commit a day for <span style={{ color: '#bda05a' }}>⟡</span> + XP — practice runs are free.
                </p>
              </div>
              <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: '#bda05a', flexShrink: 0 }}>Play →</span>
            </a>
          </div>

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
              voyages={(voyageHistoryRows ?? []) as import('./VoyageHistory').VoyageHistoryEntry[]}
            />
          </div>

          {/* ── Raids ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Raids</p>
            <RaidCard navLevel={navLevel} hasCompletedPracticeRaid={!!(profile?.has_completed_practice_raid)} />
          </div>

          <div className="pb-16" />
        </div>
      </main>
      </div>
    </>
  )
}
