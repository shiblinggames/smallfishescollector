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
import ShipHero from './ShipHero'
import ExpeditionsTour from './ExpeditionsTour'
import HubCards from './HubCards'
import type { CampaignCardData, VoyageCardData, VoyageStatus } from './HubCards'
import { gauntletUnlocked } from '@/lib/gauntlet'
import { CREW_SKINS } from '@/lib/crewSkins'
import { getCrewRoster } from '@/app/(app)/crew/actions'
import { getDailyVoyageState } from './voyageActions'
import { getRaidMapView } from './raidMapActions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { settleUltimateBuild } from '@/lib/ultimateBuild'
import { SkeletonBox } from '@/components/Skeleton'
import type { VoyageHistoryEntry } from './VoyageHistory'
import { getShipBattles } from '@/app/(app)/social/shipBattleActions'
import { isPvpTester } from '@/lib/shipBattle/access'
import { getCrew } from '@/app/(app)/social/actions'

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

// Crew currently out on a trawl — excluded from the ship loadout crew picker
// (they're reserved at sea; the server would reject the assignment anyway).
const cachedTrawlingCrewIds = cache(async (): Promise<number[]> => {
  const user = await getCurrentUser()
  if (!user) return []
  const admin = createAdminClient()
  const { data } = await admin.from('trawls').select('crew_id').eq('user_id', user.id)
  return ((data ?? []) as { crew_id: number }[]).map(r => r.crew_id)
})

// Has the player cleared Chapter 3 (beaten the Quartermaster)? That reveal
// unlocks the ultimate-weapon build surface on the ship screen.
const cachedChapter3Cleared = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser()
  if (!user) return false
  const admin = createAdminClient()
  const { data } = await admin.from('raid_completions')
    .select('id').eq('user_id', user.id).eq('raid_id', 'the_quartermaster').limit(1).maybeSingle()
  return !!data
})

// Has the player beaten Raid 7 (the Blockade)? That clear reveals the Sixth
// Berth purchase on the ship screen.
const cachedBlockadeCleared = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser()
  if (!user) return false
  const admin = createAdminClient()
  const { data } = await admin.from('raid_completions')
    .select('id').eq('user_id', user.id).eq('raid_id', 'the_blockade').limit(1).maybeSingle()
  return !!data
})

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

async function ShipHeroSection() {
  const [profile, roster, trawlingCrewIds, chapter3Cleared, blockadeCleared] = await Promise.all([
    getCurrentProfile(),
    cachedCrewRoster(),
    cachedTrawlingCrewIds(),
    cachedChapter3Cleared(),
    cachedBlockadeCleared(),
  ])
  const shipTier = profile?.ship_tier ?? 0
  const baseShip = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  // The Sixth Berth widens the crew grid to six — fold it into the stats the
  // roster + every downstream slot display reads.
  const hasSixthBerth = profile?.has_sixth_berth === true
  const shipStats = hasSixthBerth ? { ...baseShip, crewSlots: baseShip.crewSlots + 1 } : baseShip
  // Promote a matured ultimate build into the active slot on load, so a weapon
  // that finished while the player was away shows as live (and fires).
  const { active: activeAugment, build: manowarBuild } = profile
    ? await settleUltimateBuild(createAdminClient(), profile.id as string,
        (profile.manowar_augment as string | null) ?? null, profile.manowar_augment_build ?? null)
    : { active: null, build: null }
  return (
    <ShipHero
      shipStats={shipStats}
      shipName={(profile?.ship_name as string | null) ?? null}
      expeditionXP={profile?.expedition_xp ?? 0}
      equippedShipSkin={(profile?.equipped_ship_skin as string | null) ?? null}
      shipSkins={(profile?.ship_skins as string[] | null) ?? []}
      roster={roster}
      trawlingCrewIds={trawlingCrewIds}
      ownedRaidItems={(profile?.raid_items as string[] | null) ?? []}
      equippedRaidItems={(profile?.equipped_raid_items as string[] | null) ?? []}
      equippedRepairKit={(profile?.equipped_repair_kit as string | null) ?? 'basic_repair_kit'}
      ownedRepairKits={(profile?.owned_repair_kits as string[] | null) ?? ['basic_repair_kit']}
      raidRepairOwed={profile?.raid_repair_owed ?? 0}
      doubloons={profile?.doubloons ?? 0}
      shipClasses={(profile?.ship_classes as Record<string, string> | null) ?? {}}
      gauntletUpgrades={(profile?.gauntlet_upgrades as string[] | null) ?? []}
      gauntletFathoms={(profile?.gauntlet_fathoms as number | null) ?? 0}
      forgeRecipesLearned={(profile?.forge_recipes_learned as string[] | null) ?? []}
      hasSeenForgeIntro={profile?.has_seen_forge_intro === true}
      manowarAugment={activeAugment}
      manowarBuild={manowarBuild}
      manowarSchematics={profile?.manowar_schematics === true}
      chapter3Cleared={chapter3Cleared}
      blockadeCleared={blockadeCleared}
      hasSixthBerth={hasSixthBerth}
      isAdmin={profile?.is_admin === true}
      navRenownAlloc={(profile?.nav_renown_alloc as Record<string, number> | null) ?? null}
      seenNavRenownIntro={profile?.seen_nav_renown_intro === true}
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

  // PvP + Gauntlets hub cards are locked as "Coming Soon" for the public. The
  // PvP door opens for admins AND the duel testers (isPvpTester); everyone else
  // sees it locked. Only fetch the PvP duel state when the door is open.
  const isAdmin = profile?.is_admin === true
  const canPvp = isAdmin || isPvpTester(profile?.username)
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
  const clearedViews = raidMap.views.filter(v => v.status === 'cleared')
  const cleared = clearedViews.length
  // Gauntlet door: admin-only until GAUNTLET_LIVE, then cleared-Chapter-2.
  const gauntletOpen = gauntletUnlocked({ isAdmin: profile?.is_admin, clearedNodes: clearedViews.map(v => v.node.id) })
  const equippedRaidItems = (profile?.equipped_raid_items as string[] | null) ?? []
  const ownedRaidItems = (profile?.raid_items as string[] | null) ?? []
  const campaign: CampaignCardData = {
    nextNodeId: next?.node.id ?? null,
    nextNodeName: next?.node.label ?? null,
    nextNodeImage: (next?.node.image ?? null) as string | null,
    nextNodeLocked: next?.status === 'locked',
    nextNodeLockReason: next?.status === 'locked' ? next.lockReason ?? null : null,
    nextNodeKind: next?.node.type ?? null,
    repairOwed: profile?.raid_repair_owed ?? 0,
    equippedItemsCount: equippedRaidItems.length,
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
  const prepStats = {
    hull:    rp.playerHPMax,
    hitMin:  dmg.hitMin,
    hitMax:  Math.round(dmg.powerMax * rp.classDamageMult),
    crit:    Math.round(dmg.critMax * rp.classDamageMult),
    dodge:   rp.totalDodge,
    fortune: rp.totalFortune,
    speed:   rp.shipSpeed,
  }

  return (
    <HubCards
      campaign={campaign}
      voyages={voyages}
      doubloons={profile?.doubloons ?? 0}
      ownedRaidItems={ownedRaidItems}
      equippedRaidItems={equippedRaidItems}
      raidItemSlots={raidItemSlotsForTier(shipTier) + slotBonus.itemSlots}
      roster={roster}
      shipCrewSlots={shipStats.crewSlots}
      prepStats={prepStats}
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
      canPvp={canPvp}
      gauntletOpen={gauntletOpen}
      gauntletUpgrades={(profile?.gauntlet_upgrades as string[] | null) ?? []}
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
  // The player's current boat sprite (skin-aware, same derivation as the raid
  // pages) — class-pick nodes show this instead of a generic glyph.
  const shipTier = (profile?.ship_tier as number | null) ?? 0
  const baseShip = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const playerShipImage = getShipSkin((profile?.equipped_ship_skin as string | null) ?? '')?.imageByTier?.[shipTier] ?? baseShip.image
  return (
    <RaidsSection
      views={raidMap.views}
      doubloons={raidMap.doubloons}
      navLevel={raidMap.navLevel}
      playerShipImage={playerShipImage}
      raidRecords={raidMap.raidRecords}
      repairOwed={profile?.raid_repair_owed ?? 0}
      ownedRaidItems={(profile?.raid_items as string[] | null) ?? []}
      equippedRaidItems={(profile?.equipped_raid_items as string[] | null) ?? []}
      shipClasses={raidMap.shipClasses}
      seenChapterUnlocks={raidMap.seenChapterUnlocks}
      seenUltimateUnlock={raidMap.seenUltimateUnlock}
      raidNodeChoices={raidMap.raidNodeChoices}
      musterParty={raidMap.musterParty}
      topRaidProgress={topRaidProgress}
      hasSixthBerth={profile?.has_sixth_berth === true}
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

            {/* PvP (Ship Duels) moved into the PvP hub card above — it's no
                longer a standalone section. Admin-only for now. */}

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
