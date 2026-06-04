import { Suspense, cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { EXPEDITION_SHIP_STATS, raidItemSlotsForTier } from '@/lib/expeditions'
import RaidsSection from './RaidsSection'
import ShipHero from './ShipHero'
import ExpeditionsTour from './ExpeditionsTour'
import HubCards from './HubCards'
import type { CampaignCardData, VoyageCardData, VoyageStatus } from './HubCards'
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
      shipClasses={(profile?.ship_classes as Record<string, string> | null) ?? {}}
    />
  )
}

// DailyVoyageSection removed — the panel now lives inside the Voyages
// hub-card modal in HubCards.tsx. ExpeditionHub fetches the data once
// and passes it straight through.

// Fleet-wide #1 on the Raid Progress board. Same scoring as the
// leaderboard fetchers (cleared[] + distinct raid_completions.raid_id +
// has_completed_practice_raid), same tiebreaker (earliest last raid
// completion wins ties). Lightweight version that only returns the top
// row + a count — the Raids header surfaces it as "Leader: X · N" so
// the section opens with a social proof hook.
async function fetchTopRaidProgress(): Promise<{ username: string; score: number } | null> {
  const admin = createAdminClient()
  const [{ data: profiles }, { data: completions }] = await Promise.all([
    admin.from('profiles')
      .select('id, username, raid_node_progress, has_completed_practice_raid')
      .eq('is_admin', false),
    admin.from('raid_completions').select('user_id, raid_id, completed_at'),
  ])
  if (!profiles || profiles.length === 0) return null
  const lastByUser = new Map<string, string>()
  const raidsByUser = new Map<string, Set<string>>()
  for (const c of (completions ?? []) as Array<{ user_id: string; raid_id: string; completed_at: string }>) {
    const prev = lastByUser.get(c.user_id)
    if (!prev || c.completed_at > prev) lastByUser.set(c.user_id, c.completed_at)
    const set = raidsByUser.get(c.user_id) ?? new Set<string>()
    set.add(c.raid_id)
    raidsByUser.set(c.user_id, set)
  }
  type Row = { username: string; score: number; lastAt: string | null }
  const rows: Row[] = []
  for (const p of profiles as Array<{ id: string; username: string | null; raid_node_progress: { cleared?: string[] } | null; has_completed_practice_raid: boolean | null }>) {
    const clearedCount = Array.isArray(p.raid_node_progress?.cleared) ? p.raid_node_progress!.cleared!.length : 0
    const bossCount = raidsByUser.get(p.id)?.size ?? 0
    const skirmish = p.has_completed_practice_raid ? 1 : 0
    const score = clearedCount + bossCount + skirmish
    if (score > 0 && p.username) rows.push({ username: p.username, score, lastAt: lastByUser.get(p.id) ?? null })
  }
  if (rows.length === 0) return null
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? -1 : a.lastAt > b.lastAt ? 1 : 0
    if (a.lastAt) return -1
    if (b.lastAt) return 1
    return 0
  })
  return { username: rows[0].username, score: rows[0].score }
}

// ROUTE_LABELS — short display name for a daily voyage route slug.
// Kept here so the hub card can show "Coastal Run" instead of "coastal"
// without dragging in voyage internals.
const ROUTE_LABELS: Record<string, string> = {
  coastal: 'Coastal Run',
  open:    'Open Waters',
  deep:    'Deep Run',
}

function describeVoyage(
  todayVoyage: { route: string; created_at: string; duration_ms: number | null } | null,
  readyVoyage: { route: string } | null,
): VoyageCardData {
  if (readyVoyage) {
    return {
      status: 'returned',
      statusLabel: 'Claim reward',
      routeName: ROUTE_LABELS[readyVoyage.route] ?? readyVoyage.route,
    }
  }
  if (todayVoyage) {
    const ms = Math.max(0, (new Date(todayVoyage.created_at).getTime() + (todayVoyage.duration_ms ?? 0)) - Date.now())
    const totalMin = Math.ceil(ms / 60000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    const eta = h > 0 ? `${h}h ${m}m` : `${m}m`
    return {
      status: 'sailing' as VoyageStatus,
      statusLabel: `Sailing · ${eta} left`,
      routeName: ROUTE_LABELS[todayVoyage.route] ?? todayVoyage.route,
    }
  }
  return { status: 'idle', statusLabel: 'Ready to set sail', routeName: null }
}

// Hub card data is small — campaign next-node summary + voyage state.
// Server component so we can derive from cached fetchers without
// adding more round-trips. The hub modals now embed the prep flow
// (repair, items, crew) inline, so we also pipe through the player's
// owned items, equipped items, roster, and ship slot counts.
async function ExpeditionHub() {
  const [profile, raidMap, dailyVoyageState, roster, voyageHistory] = await Promise.all([
    getCurrentProfile(),
    cachedRaidMap(),
    cachedDailyVoyageState(),
    cachedCrewRoster(),
    cachedVoyageHistory(),
  ])

  const shipTier = profile?.ship_tier ?? 0
  const shipStats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  // Next main-chain node: first non-cleared, non-sideBranch view.
  const next = raidMap.views.find(v => v.status !== 'cleared' && !v.node.sideBranch) ?? null
  const cleared = raidMap.views.filter(v => v.status === 'cleared').length
  const equippedRaidItems = (profile?.equipped_raid_items as string[] | null) ?? []
  const ownedRaidItems = (profile?.raid_items as string[] | null) ?? []
  const campaign: CampaignCardData = {
    nextNodeId: next?.node.id ?? null,
    nextNodeName: next?.node.label ?? null,
    nextNodeImage: (next?.node.image ?? null) as string | null,
    nextNodeLocked: next?.status === 'locked',
    clearedCount: cleared,
    totalNodes: raidMap.views.length,
    repairOwed: profile?.raid_repair_owed ?? 0,
    equippedItemsCount: equippedRaidItems.length,
  }
  const voyages = describeVoyage(
    'error' in dailyVoyageState ? null : (dailyVoyageState.todayVoyage as { route: string; created_at: string; duration_ms: number | null } | null),
    'error' in dailyVoyageState ? null : (dailyVoyageState.readyVoyage as { route: string } | null),
  )

  const assignedCount = roster.filter(c => c.assignedSlot != null).length

  return (
    <HubCards
      campaign={campaign}
      voyages={voyages}
      doubloons={profile?.doubloons ?? 0}
      ownedRaidItems={ownedRaidItems}
      equippedRaidItems={equippedRaidItems}
      raidItemSlots={raidItemSlotsForTier(shipTier)}
      roster={roster}
      shipCrewSlots={shipStats.crewSlots}
      assignedCrewCount={assignedCount}
      // Full DailyVoyagePanel-needed props — voyage panel was promoted
      // into the Voyages hub modal so it's no longer rendered inline.
      shipTier={shipTier}
      todayVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.todayVoyage}
      readyVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.readyVoyage}
      expeditionXP={profile?.expedition_xp ?? 0}
      voyageHistory={voyageHistory}
    />
  )
}

async function RaidsMapSection() {
  const [profile, raidMap, topRaidProgress] = await Promise.all([
    getCurrentProfile(),
    cachedRaidMap(),
    fetchTopRaidProgress(),
  ])
  return (
    <RaidsSection
      views={raidMap.views}
      doubloons={raidMap.doubloons}
      raidRecords={raidMap.raidRecords}
      repairOwed={profile?.raid_repair_owed ?? 0}
      ownedRaidItems={(profile?.raid_items as string[] | null) ?? []}
      shipClasses={raidMap.shipClasses}
      seenChapterUnlocks={raidMap.seenChapterUnlocks}
      raidNodeChoices={raidMap.raidNodeChoices}
      topRaidProgress={topRaidProgress}
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
        <ExpeditionsTour hasSeen={profile?.has_seen_expeditions_tour ?? false} />
        <main className="min-h-screen pb-24 sm:pb-0">

          <div className="px-5 max-w-lg mx-auto expeditions-content" style={{ paddingTop: '1rem' }}>

            {/* Ship Hero — streams when profile + crew roster arrive */}
            <Suspense fallback={<SkeletonBox height={210} radius={16} style={{ marginBottom: 14 }} />}>
              <ShipHeroSection />
            </Suspense>

            {/* Hub cards — Campaign + Voyages side-by-side. Each opens a
                ready-check modal that scrolls into the inline section
                below for the heavy UI. Replaces the old plain section
                labels ("Voyages" / "Raids"). */}
            <Suspense fallback={<SkeletonBox height={150} radius={18} style={{ marginBottom: '1.2rem' }} />}>
              <ExpeditionHub />
            </Suspense>

            {/* DailyVoyagePanel moved into the Voyages hub-card modal —
                no longer rendered as a standalone section. Tapping the
                Voyages card opens it in-modal with the full panel
                (route pick, crew slots, ship-out, claim). */}

            {/* Story map (RaidsSection) — id="chapter-map" lives on its own
                wrapper inside RaidsSection. Section label was renamed
                "Raids" → "Story" inline. */}
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
