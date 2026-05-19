import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import RaidsSection from './RaidsSection'
import ShipHero from './ShipHero'
import DailyVoyagePanel from './DailyVoyagePanel'
import ExpeditionsTour from './ExpeditionsTour'
import { getCollectionForCrew } from './actions'
import { getDailyVoyageState } from './voyageActions'
import { getRaidMapView } from './raidMapActions'

export default async function ExpeditionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, collection, dailyVoyageState, { data: voyageHistoryRows }, raidMap] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, ship_tier, gems, saved_crew, ship_name, expedition_xp, equipped_ship_skin, ship_skins, raid_items, equipped_raid_items, equipped_repair_kit, owned_repair_kits, has_completed_practice_raid, has_seen_expeditions_tour, raid_repair_owed')
      .eq('id', user.id)
      .single(),
    getCollectionForCrew(),
    getDailyVoyageState(),
    admin.from('daily_voyages')
      .select('id, route, total_doubloons, total_gems, crew_lost, created_at, captains_log')
      .eq('user_id', user.id)
      .eq('status', 'revealed')
      .order('created_at', { ascending: false })
      .limit(8),
    getRaidMapView(),
  ])

  const shipTier = profile?.ship_tier ?? 0
  const doubloons = profile?.doubloons ?? 0
  const savedCrewVariantIds: number[] = (profile?.saved_crew as number[] | null) ?? []
  const shipStats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]

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

      <ExpeditionsTour hasSeen={profile?.has_seen_expeditions_tour ?? false} />
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
            equippedRepairKit={(profile?.equipped_repair_kit as string | null) ?? 'basic_repair_kit'}
            raidRepairOwed={profile?.raid_repair_owed ?? 0}
            doubloons={doubloons}
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
              voyages={(voyageHistoryRows ?? []) as import('./VoyageHistory').VoyageHistoryEntry[]}
            />
          </div>

          {/* ── Raids — collapsible node-map progression ── */}
          <RaidsSection views={raidMap.views} doubloons={raidMap.doubloons} repairOwed={profile?.raid_repair_owed ?? 0} ownedRaidItems={(profile?.raid_items as string[] | null) ?? []} />

          <div className="pb-16" />
        </div>
      </main>
      </div>
    </>
  )
}
