import { Suspense, cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import RaidsSection from './RaidsSection'
import ShipHero from './ShipHero'
import DailyVoyagePanel from './DailyVoyagePanel'
import ExpeditionsTour from './ExpeditionsTour'
import { getCrewRoster } from '@/app/dev/crew/actions'
import { getDailyVoyageState } from './voyageActions'
import { getRaidMapView } from './raidMapActions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { SkeletonBox } from '@/components/Skeleton'
import type { VoyageHistoryEntry } from './VoyageHistory'

// Streaming pattern: the page paints its shell + Nav as soon as the profile
// fetch returns (one fast query), then each heavy section streams in
// independently via its own Suspense boundary. Shared dependencies (profile,
// crew roster) are wrapped in React.cache so each section fetches what it
// needs without duplicate Supabase calls — the first section to ask resolves
// the query, the rest reuse the same in-flight promise. This means slow
// sections (e.g. raid map) no longer block fast sections (e.g. ship hero).

const cachedCrewRoster = cache(() => getCrewRoster())
const cachedDailyVoyageState = cache(() => getDailyVoyageState())
const cachedRaidMap = cache(() => getRaidMapView())

const cachedVoyageHistory = cache(async (): Promise<VoyageHistoryEntry[]> => {
  const user = await getCurrentUser()
  if (!user) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('daily_voyages')
    .select('id, route, total_doubloons, total_gems, crew_lost, created_at, captains_log')
    .eq('user_id', user.id)
    .eq('status', 'revealed')
    .order('created_at', { ascending: false })
    .limit(8)
  return (data ?? []) as unknown as VoyageHistoryEntry[]
})

// ── Heavy sections — each one fetches its own data, in parallel, and streams
//    in when ready. Shared loaders are deduped by React.cache.

async function ShipHeroSection() {
  const [profile, roster] = await Promise.all([
    getCurrentProfile(),
    cachedCrewRoster(),
  ])
  const shipTier = profile?.ship_tier ?? 0
  const shipStats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  return (
    <ShipHero
      shipStats={shipStats}
      shipName={(profile?.ship_name as string | null) ?? null}
      expeditionXP={profile?.expedition_xp ?? 0}
      equippedShipSkin={(profile?.equipped_ship_skin as string | null) ?? null}
      shipSkins={(profile?.ship_skins as string[] | null) ?? []}
      roster={roster}
      ownedRaidItems={(profile?.raid_items as string[] | null) ?? []}
      equippedRaidItems={(profile?.equipped_raid_items as string[] | null) ?? []}
      equippedRepairKit={(profile?.equipped_repair_kit as string | null) ?? 'basic_repair_kit'}
      raidRepairOwed={profile?.raid_repair_owed ?? 0}
      doubloons={profile?.doubloons ?? 0}
    />
  )
}

async function DailyVoyageSection() {
  const [profile, roster, dailyVoyageState, voyages] = await Promise.all([
    getCurrentProfile(),
    cachedCrewRoster(),
    cachedDailyVoyageState(),
    cachedVoyageHistory(),
  ])
  return (
    <DailyVoyagePanel
      roster={roster}
      shipTier={profile?.ship_tier ?? 0}
      todayVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.todayVoyage}
      readyVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.readyVoyage}
      expeditionXP={profile?.expedition_xp ?? 0}
      voyages={voyages}
    />
  )
}

async function RaidsMapSection() {
  const [profile, raidMap] = await Promise.all([
    getCurrentProfile(),
    cachedRaidMap(),
  ])
  return (
    <RaidsSection
      views={raidMap.views}
      doubloons={raidMap.doubloons}
      repairOwed={profile?.raid_repair_owed ?? 0}
      ownedRaidItems={(profile?.raid_items as string[] | null) ?? []}
    />
  )
}

export default async function ExpeditionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  // Profile is needed by the shell (Nav + tour), so the page awaits it.
  // Every section re-asks for it via the cached loader — they all share this
  // one fetch.
  const profile = await getCurrentProfile()

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
        <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />

        <ExpeditionsTour hasSeen={profile?.has_seen_expeditions_tour ?? false} />
        <main className="min-h-screen pb-24 sm:pb-0">

          <div className="px-5 max-w-lg mx-auto expeditions-content" style={{ paddingTop: '1rem' }}>

            {/* Ship Hero — streams when profile + crew roster arrive */}
            <Suspense fallback={<SkeletonBox height={210} radius={16} style={{ marginBottom: 14 }} />}>
              <ShipHeroSection />
            </Suspense>

            {/* Voyages — label paints immediately; panel streams in */}
            <div style={{ marginBottom: '1rem' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Voyages</p>
              <Suspense fallback={<SkeletonBox height={140} radius={14} />}>
                <DailyVoyageSection />
              </Suspense>
            </div>

            {/* Raids — the slowest section. With streaming, it no longer blocks
                ShipHero or the voyage panel. */}
            <Suspense fallback={<SkeletonBox height={86} radius={12} />}>
              <RaidsMapSection />
            </Suspense>

            <div className="pb-16" />
          </div>
        </main>
      </div>
    </>
  )
}
