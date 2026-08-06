import { Suspense, cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { EXPEDITION_SHIP_STATS, raidItemSlotsForTier, raidDamageProfile } from '@/lib/expeditions'
import { getRaidPlayerStats } from '@/app/(app)/raids/actions'
import { classSlotBonuses } from '@/lib/shipClasses'
import { getShipSkin } from '@/lib/shipSkins'
import { resolveDeployedCrew, type DeployedCrew } from '@/lib/crewResolve'
import { getXPProgress, navLevelBonuses } from '@/lib/expeditionLevel'
import RaidsSection from './RaidsSection'
import CampaignMapOverlay from './CampaignMapOverlay'
import ShipHero from './ShipHero'
import ExpeditionsTour from './ExpeditionsTour'
import HubCards from './HubCards'
import ShipHeroSection from './ShipHeroSection'
import { cachedCrewRoster, cachedTrawlingCrewIds, cachedChapter3Cleared, cachedBlockadeCleared, cachedThroneCleared } from './hubData'
import type { CampaignCardData, VoyageCardData, VoyageStatus } from './HubCards'
import { pickShowcaseBoss } from '@/lib/raidMap'
import { gauntletUnlocked, donsGauntletUnlocked } from '@/lib/gauntlet'
import { CREW_SKINS } from '@/lib/crewSkins'
import { getCrewRoster } from '@/app/(app)/crew/actions'
import { getDailyVoyageState } from './voyageActions'
import { getRaidMapView } from './raidMapActions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { settleUltimateBuild } from '@/lib/ultimateBuild'
import { parseAbyssalConversion } from '@/lib/abyssalAccelerator'
import { SkeletonBox } from '@/components/Skeleton'
import type { VoyageHistoryEntry } from './VoyageHistory'
import { getShipBattles } from '@/app/(app)/social/shipBattleActions'
import { getCrew } from '@/app/(app)/social/actions'

// Streaming pattern: the page paints its shell + Nav as soon as the profile
// fetch returns (one fast query), then each heavy section streams in
// independently via its own Suspense boundary. Shared dependencies (profile,
// crew roster) are wrapped in React.cache so each section fetches what it
// needs without duplicate Supabase calls — the first section to ask resolves
// the query, the rest reuse the same in-flight promise. This means slow
// sections (e.g. raid map) no longer block fast sections (e.g. ship hero).

const cachedDailyVoyageState = cache(() => getDailyVoyageState())
const cachedRaidMap = cache(() => getRaidMapView())

// Crew currently out on a trawl — excluded from the ship loadout crew picker
// (they're reserved at sea; the server would reject the assignment anyway).

// The three ship-screen reveal gates (Ch3 Quartermaster → ultimate build; Raid 7
// Blockade → Sixth Berth; Raid 8 Throne → Expanded Armory) all ask "has this user
// cleared raid X". One `.in()` query answers all three; the boolean helpers below
// read from this shared (per-request cached) set instead of each hitting the DB.

/** How many raids the captain has actually finished. Drives Captain's Orders, which
 *  cannot know "have you ever won a fight" from the roster alone. */
const cachedRaidsCleared = cache(async (): Promise<number> => {
  const user = await getCurrentUser()
  if (!user) return 0
  const admin = createAdminClient()
  const { count } = await admin.from('raid_completions')
    .select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  return count ?? 0
})

const cachedVoyageHistory = cache(async (): Promise<VoyageHistoryEntry[]> => {
  const user = await getCurrentUser()
  if (!user) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('daily_voyages')
    .select('id, route, total_doubloons, total_gems, crew_lost, created_at, captains_log, events, tide_turner_drop, phantom_hook_drop')
    .eq('user_id', user.id)
    .eq('status', 'revealed')
    .order('created_at', { ascending: false })
    .limit(8)
  return (data ?? []) as unknown as VoyageHistoryEntry[]
})

// ── Heavy sections — each one fetches its own data, in parallel, and streams
//    in when ready. Shared loaders are deduped by React.cache.


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
  // Ranked in SQL (raid_progress_board) instead of pulling every profile + every
  // raid_completion and scoring in JS. Rows come back score-desc; the first one
  // with a username is the fleet leader.
  const { data } = await admin.rpc('raid_progress_board')
  const top = ((data ?? []) as Array<{ username: string | null; score: number }>).find(r => r.username)
  return top ? { username: top.username as string, score: top.score } : null
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
      progress: null,
    }
  }
  if (todayVoyage) {
    const started  = new Date(todayVoyage.created_at).getTime()
    const duration = Math.max(1, todayVoyage.duration_ms ?? 0)
    const elapsed  = Math.max(0, Date.now() - started)
    const ms       = Math.max(0, duration - elapsed)
    const totalMin = Math.ceil(ms / 60000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    const eta = h > 0 ? `${h}h ${m}m` : `${m}m`
    return {
      status: 'sailing' as VoyageStatus,
      statusLabel: `Sailing · ${eta} left`,
      routeName: ROUTE_LABELS[todayVoyage.route] ?? todayVoyage.route,
      progress: Math.min(1, elapsed / duration),
    }
  }
  return { status: 'idle', statusLabel: 'Ready to set sail', routeName: null, progress: null }
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

  // Broadsides (PvP) is PARKED — "Coming Soon" to EVERYONE now (2026-07-23),
  // admins + duel testers included. Flip back to `isAdmin || isPvpTester(...)`
  // when the feature returns. The mutating duel actions are blocked server-side
  // too (shipBattleActions.PVP_ENABLED), so this is a UI + API lock, not just a hide.
  const canPvp = false
  const pvp = canPvp
    ? await (async () => {
        const [{ battles, wins, losses }, friends] = await Promise.all([getShipBattles(), getCrew()])
        return { battles, wins, losses, friends }
      })()
    : null

  const shipTier = profile?.ship_tier ?? 0
  // Fold the Ch4 augments into the displayed hull caps: Expanded Quarters
  // berths one more crew (shipStats.crewSlots feeds every downstream display
  // + the voyage panel), Expanded Armory adds a raid-item mount below.
  const slotBonus = classSlotBonuses(profile?.ship_classes as Record<string, string> | null)
  const berthCrew = profile?.has_sixth_berth === true ? 1 : 0
  const baseShipStats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const extraCrew = slotBonus.crewSlots + berthCrew
  const shipStats = extraCrew > 0
    ? { ...baseShipStats, crewSlots: baseShipStats.crewSlots + extraCrew }
    : baseShipStats
  // Next main-chain node: first non-cleared, non-sideBranch view.
  const next = raidMap.views.find(v => v.status !== 'cleared' && !v.node.sideBranch) ?? null
  // The first available, un-cleared Challenge (a harder rerun of a beaten boss). Its
  // label carries the "Challenge: " prefix; strip it, the card says "A Challenge".
  const challengeView = raidMap.views.find(v =>
    v.status === 'available' &&
    (v.node.id.endsWith('_challenge') || v.node.route === '/raids/challenge'))
  const challengeName = challengeView ? (challengeView.node.label ?? '').replace(/^Challenge:\s*/, '') : null
  const clearedViews = raidMap.views.filter(v => v.status === 'cleared')
  const cleared = clearedViews.length
  // Gauntlet door: admin-only until GAUNTLET_LIVE, then cleared-Chapter-2.
  const gauntletOpen = gauntletUnlocked({ isAdmin: profile?.is_admin, clearedNodes: clearedViews.map(v => v.node.id) })
  // Don's Gauntlet door: admin-only until DONS_GAUNTLET_LIVE, then beating the
  // Don (the_throne). Lets admins reach it from the hub picker, not just the URL.
  const donsGauntletOpen = donsGauntletUnlocked({ isAdmin: profile?.is_admin, throneCleared: clearedViews.some(v => v.node.id === 'the_throne') })
  // A saved run is waiting to be picked back up — mirrors getGauntletDailyState's
  // resumeState gate (paused = unlimited, or a crash resume still in the bank).
  // A saved run is variant-specific — gauntlet_run_variant says whether the open
  // run belongs to Davy's or Don's. Surface Resume on the RIGHT card. (The old
  // single flag lit Davy's card even for a Don run — the "reversed resume" bug.)
  const gauntletRunOpen = profile?.gauntlet_run_open === true
  const gauntletRunVariant = profile?.gauntlet_run_variant as string | null
  const gauntletResumable = gauntletRunOpen                                  // hub tile: any open run
  const davyResumable = gauntletRunOpen && gauntletRunVariant !== 'don'
  const donsResumable = gauntletRunOpen && gauntletRunVariant === 'don'
    && !!profile?.gauntlet_run_state
    && (profile?.gauntlet_run_paused === true || ((profile?.gauntlet_resumes_used as number | null) ?? 0) < 1)
  const equippedRaidItems = (profile?.equipped_raid_items as string[] | null) ?? []
  const ownedRaidItems = (profile?.raid_items as string[] | null) ?? []
  const showcaseBoss = pickShowcaseBoss(raidMap.views)
  const campaign: CampaignCardData = {
    nextNodeId: next?.node.id ?? null,
    nextNodeName: next?.node.label ?? null,
    nextNodeImage: (next?.node.image ?? null) as string | null,
    nextNodeLocked: next?.status === 'locked',
    nextNodeLockReason: next?.status === 'locked' ? next.lockReason ?? null : null,
    nextNodeKind: next?.node.type ?? null,
    repairOwed: profile?.raid_repair_owed ?? 0,
    equippedItemsCount: equippedRaidItems.length,
    // Picked HERE, on the server, so the roll is part of the payload rather
    // than something the client decides after hydration and mismatches on.
    bossName: showcaseBoss.name,
    bossPortrait: showcaseBoss.portrait,
    bossBackdrop: showcaseBoss.backdrop,
  }
  const voyages = describeVoyage(
    'error' in dailyVoyageState ? null : (dailyVoyageState.todayVoyage as { route: string; created_at: string; duration_ms: number | null } | null),
    'error' in dailyVoyageState ? null : (dailyVoyageState.readyVoyage as { route: string } | null),
  )


  // Live voyage + raid scores derived from each track's INDEPENDENT roster.
  // Voyage and raid have separate assignment slots now (voyage_slot /
  // raid_slot, mutually exclusive); the previews compute one score per
  // track from the right party. Nav-level bonuses apply to raid (the
  // captain bonus) but not voyage scores, per current convention.
  // The numbers the RAID actually fights with: hull after items, classes and Renown;
  // the real damage profile; the real dodge and fortune. Not a 0-100 score benchmarked
  // against a constant, which is what Raid Score / Offense / Defense were.
  const rp = await getRaidPlayerStats(profile!.id as string)
  const dmg = raidDamageProfile(rp.totalPower, rp.shipMinDamage, rp.raidMods?.damagePct ?? 0)
  const raidsCleared = await cachedRaidsCleared()

  // ── OPPORTUNITY STRIP INPUTS ────────────────────────────────────────────────
  // Cheap to derive from data already fetched — no extra round-trips. All read off
  // the shared getCurrentProfile() select('*').
  const todayUTC = new Date().toISOString().slice(0, 10)
  const freeRecruitAvailable = (profile?.last_free_recruit_date as string | null) !== todayUTC
  const gems = (profile?.gems as number | null) ?? 0
  // Affordable AND not-already-owned: never nudge a whale who owns every skin.
  const ownedSkinIds = new Set((profile?.owned_crew_skins as string[] | null) ?? [])
  const cheapestUnownedSkin = CREW_SKINS
    .filter(sk => !ownedSkinIds.has(sk.id))
    .reduce((min, sk) => Math.min(min, sk.gemCost), Infinity)
  const canAffordNewSkin = gems >= cheapestUnownedSkin

  return (
    <HubCards
      campaign={campaign}
      voyages={voyages}
      ownedRaidItems={ownedRaidItems}
      equippedRaidItems={equippedRaidItems}
      raidItemSlots={raidItemSlotsForTier(shipTier) + slotBonus.itemSlots + (profile?.has_armory_expansion === true ? 1 : 0)}
      roster={roster}
      shipCrewSlots={shipStats.crewSlots}
      // Full DailyVoyagePanel-needed props — voyage panel was promoted
      // into the Voyages hub modal so it's no longer rendered inline.
      shipTier={shipTier}
      todayVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.todayVoyage}
      readyVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.readyVoyage}
      expeditionXP={profile?.expedition_xp ?? 0}
      voyageHistory={voyageHistory}
      raidsCleared={raidsCleared}
      captainsOrdersDone={profile?.captains_orders_done === true}
      gems={gems}
      freeRecruitAvailable={freeRecruitAvailable}
      canAffordNewSkin={canAffordNewSkin}
      challengeName={challengeName}
      canPvp={canPvp}
      gauntletOpen={gauntletOpen}
      donsGauntletOpen={donsGauntletOpen}
      gauntletResumable={gauntletResumable}
      davyResumable={davyResumable}
      donsResumable={donsResumable}
      gauntletUpgrades={[
        ...((profile?.gauntlet_upgrades as string[] | null) ?? []),
        ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? []),
      ]}
      pvp={pvp}
    />
  )
}

async function RaidsMapSection() {
  const [profile, raidMap, topRaidProgress] = await Promise.all([
    getCurrentProfile(),
    cachedRaidMap(),
    fetchTopRaidProgress(),
  ])
  // Crew Fortune, so the drop chances printed on boss cards are the ones those
  // bosses actually roll against. getRaidPlayerStats is the same loader the
  // fight itself uses, and it is request-cached, so this is not a second trip.
  const raidStats = await getRaidPlayerStats(profile!.id as string)
  // The player's current boat sprite (skin-aware, same derivation as the raid
  // pages) — class-pick nodes show this instead of a generic glyph.
  const shipTier = (profile?.ship_tier as number | null) ?? 0
  const baseShip = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const playerShipImage = getShipSkin((profile?.equipped_ship_skin as string | null) ?? '')?.imageByTier?.[shipTier] ?? baseShip.image
  return (
    <RaidsSection
      views={raidMap.views}
      doubloons={raidMap.doubloons}
      spoilFree={raidMap.spoilFree}
      spoilPaid={raidMap.spoilPaid}
      navLevel={raidMap.navLevel}
      playerShipImage={playerShipImage}
      raidRecords={raidMap.raidRecords}
      repairOwed={profile?.raid_repair_owed ?? 0}
      ownedRaidItems={(profile?.raid_items as string[] | null) ?? []}
      ownedShipSkins={(profile?.ship_skins as string[] | null) ?? []}
      equippedRaidItems={(profile?.equipped_raid_items as string[] | null) ?? []}
      shipClasses={raidMap.shipClasses}
      seenChapterUnlocks={raidMap.seenChapterUnlocks}
      seenUltimateUnlock={raidMap.seenUltimateUnlock}
      raidNodeChoices={raidMap.raidNodeChoices}
      musterParty={raidMap.musterParty}
      topRaidProgress={topRaidProgress}
      hasSixthBerth={profile?.has_sixth_berth === true}
      hasArmoryExpansion={profile?.has_armory_expansion === true}
      totalFortune={raidStats.totalFortune}
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
          src="/expedition-epic-bg.jpg"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
        />
        {/* Lighter at the top so the epic seascape shows behind the floating
            Ship Hero, darkening toward the middle where the opaque hub tiles sit. */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.72) 46%, rgba(0,0,0,0.92) 100%)',
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

            {/* PvP (Ship Duels) moved into the PvP hub card above — it's no
                longer a standalone section. Admin-only for now. */}

            {/* DailyVoyagePanel moved into the Voyages hub-card modal —
                no longer rendered as a standalone section. Tapping the
                Voyages card opens it in-modal with the full panel
                (route pick, crew slots, ship-out, claim). */}

            {/* Story map — no longer an always-on section at the bottom. It
                surfaces as a full-screen overlay when the Campaign hub card is
                tapped (CampaignMapOverlay listens for
                'expedition:open-campaign-map'). The server still renders the map
                here so its data is ready the instant the overlay opens; the
                overlay mounts the map subtree only while it's open. */}
            <CampaignMapOverlay>
              <Suspense fallback={<SkeletonBox height={86} radius={12} />}>
                <RaidsMapSection />
              </Suspense>
            </CampaignMapOverlay>

            <div className="pb-16" />
          </div>
        </main>
      </div>
    </>
  )
}
