// ── VOYAGES AND TRAWLS, CORE (Steam prep, 2026-09-29) ──
//
// The daily voyage (send, reveal, the board), the crew trawls (the docks, send,
// collect) and the crew's roll call, with nothing of the web in them. Each
// takes the store (VoyageData, TrawlData, or both as SeaCrewData) and the
// captain's id. On the web the server actions (expeditions/voyageActions,
// fishing/trawls/actions, sea/voyageBoardActions, sea/crewHubActions) check the
// session and hand these the Supabase store; offline, the local save's.
//
// Moved verbatim out of those actions. The only edits: the session read became
// `uid`; the wallet grants and badges became store operations; the clock became
// clockNow. The web-only step stays in the action: writing the Captain's Log
// (an AI call, scheduled after the response). revealVoyageResults hands back
// what that log needs; offline, a voyage simply has no log.

import type { VoyageEvent, VoyageRoute } from '@/lib/voyageEvents'
import { planVoyage, voyagePayout, voyageBack, voyageCrewCap } from '@/lib/voyageRules'
import { BASE_VOYAGE_MS } from '@/lib/voyage'
import type { VoyageCrewMember, VoyageLogInput } from '@/lib/captains-log'
import { loadDeployedPartyVia } from '@/lib/crewData'
import { RARITY_NAMES, crewDisplayName, DAILY_RECRUITS, type CrewRarity } from '@/lib/crewGen'
import { grantXPToIdsVia, type CrewXPGrant } from '@/lib/crewXPGrant'
import { eyeCharge, mawCharge } from '@/lib/finnItems'
import { inCaptainsWater, CAPTAIN_WATER_SAYS, type CaptainWaterRow } from '@/lib/captainWater'
import { getLevelFromXP as fishingLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import {
  TRAWL_ZONES, TRAWL_ZONE_BY_KEY, trawlDurationMs,
  unlockedTrawlSlots, nextTrawlSlot, rollTrawlHaul, expectedTrawlHaul,
  type TrawlZoneKey, type TrawlState, type TrawlCrewView, type ActiveTrawlView, type CollectTrawlResult,
} from '@/app/(app)/fishing/trawls/constants'
import { storesCapHours, stintDone } from '@/lib/crewBunks'
import { crewCapacity } from '@/lib/crewCapacity'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { ROUTE_CONFIGS } from '@/lib/voyageRoutes'
import { trawlCrewView, trawlDeployRefusal, trawlBack, sampleHaulFish, type TrawlCrewRow } from '@/lib/trawlRules'
import { getCrewRoster, type CrewMember } from '@/lib/core/crew'
import type { VoyageHistoryEntry } from '@/app/(app)/expeditions/VoyageHistory'
import { clockNow } from '@/lib/clock'
import type { VoyageData, TrawlData, SeaCrewData } from '@/lib/data/voyageData'

/* eslint-disable @typescript-eslint/no-explicit-any */

const nowIso = () => new Date(clockNow()).toISOString()
function today(): string {
  return nowIso().split('T')[0]
}

export interface DailyVoyage {
  id: number
  voyage_date: string
  crew_variant_ids: number[]
  ship_tier: number
  route: VoyageRoute
  status: 'pending' | 'revealed'
  events: VoyageEvent[]
  total_doubloons: number
  total_gems: number
  crew_lost: number[]
  created_at: string
  captains_log: string | null
  log_generated_at: string | null
  duration_ms?: number | null
  xp_bonus_pct?: number | null
  tide_turner_drop?: boolean
  phantom_hook_drop?: boolean
  perfected_sigil_drop?: boolean
}

// ── The daily voyage ────────────────────────────────────────────────────────

export async function getDailyVoyageState(db: VoyageData, uid: string): Promise<{
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
}> {
  const rows = (await db.recentVoyages(uid, 10)) as DailyVoyage[]
  const now = clockNow()
  const pending = rows.filter(r => r.status === 'pending')

  const activeVoyage = pending.find(r => new Date(r.created_at).getTime() + ((r as DailyVoyage).duration_ms ?? BASE_VOYAGE_MS) > now) ?? null
  const readyVoyage  = pending.find(r => new Date(r.created_at).getTime() + ((r as DailyVoyage).duration_ms ?? BASE_VOYAGE_MS) <= now) ?? null

  return { todayVoyage: activeVoyage, readyVoyage }
}

/** user_crew ids currently out on a trawl — they're locked from voyages
 *  (loadDeployedParty drops them server-side), so the panel uses this to stop
 *  counting them and to explain why a slotted crew can't sail. */
export async function getTrawlingCrewIds(db: VoyageData, uid: string): Promise<number[]> {
  return db.trawling(uid)
}

export async function sendDailyVoyage(db: VoyageData, uid: string, route: VoyageRoute = 'open'): Promise<
  { ok: true; voyage: DailyVoyage } | { error: string }
> {
  try {
  // Block if a voyage is already pending (at sea or ready to reveal)
  if (await db.voyageOut(uid)) return { error: 'Your crew is already at sea' }

  // Block if a raid is in progress
  if (await db.raidInProgress(uid)) return { error: 'Finish your raid before sending a voyage' }

  // Load profile for ship tier and expedition level
  const profile = await db.profile(uid, 'ship_tier, expedition_xp, gauntlet_upgrades, ship_classes, has_sixth_berth')

  if (!profile) return { error: 'Profile not found' }

  const shipTier = profile.ship_tier ?? 0
  // Deployed party from the crew roster (voyage track). The Expanded Quarters
  // berth is ship-wide, so it counts on voyages too.
  const crewSlotCap = voyageCrewCap(shipTier, profile.ship_classes as Record<string, string> | null, (profile as { has_sixth_berth?: boolean }).has_sixth_berth === true)
  const party = await loadDeployedPartyVia(db, uid, crewSlotCap, 'voyage')
  // Route gates, crew minimum, the event roll, the doubloon bonus and the
  // duration are lib/voyageRules planVoyage.
  const plan = planVoyage({
    route, shipTier, party,
    expeditionXP: profile.expedition_xp ?? 0,
    gauntletUpgrades: (profile.gauntlet_upgrades as string[] | null) ?? [],
  })
  if ('error' in plan) return { error: plan.error }
  const crewIds = party.map(p => p.id)

  const launched = await db.launchVoyage(uid, {
      voyage_date: today(),
      crew_variant_ids: crewIds, // now holds user_crew ids
      ship_tier: shipTier,
      route,
      status: 'pending',
      events: plan.events,
      total_doubloons: plan.totalDoubloons,
      total_gems: plan.totalGems,
      crew_lost: plan.crewLost, // user_crew ids of any losses
      duration_ms: plan.durationMs,
      xp_bonus_pct: plan.xpBonusPct,
      tide_turner_drop: plan.tideTurnerDrop,
      phantom_hook_drop: plan.phantomHookDrop,
      perfected_sigil_drop: plan.perfectedSigilDrop,
  })

  // ONE SHIP AT SEA. The read above is only the friendly early answer: two sends
  // fired together both pass it, and the store refuses the second launch
  // ('taken'), which is the same answer as the read's.
  if ('taken' in launched) return { error: 'Your crew is already at sea' }
  if ('failed' in launched) return { error: 'Failed to send voyage' }
  return { ok: true, voyage: launched.voyage as DailyVoyage }
  } catch (e) {
    // Any unexpected throw (crew resolution, the voyage engine, a DB hiccup)
    // becomes a clean error instead of a rejected promise — otherwise the
    // client's transition can hang on "Sending…" with nothing surfaced.
    console.error('[sendDailyVoyage] threw:', e)
    return { error: 'Could not set sail. Something went wrong, please try again.' }
  }
}

export type VoyageReveal =
  | { ok: true; earnedDoubloons: number; newDoubloonTotal: number; earnedGems: number; newGemTotal: number; crewLost: number[]; earnedBait: { type: string; qty: number }[]; xpEarned: number; newExpeditionXP: number; oldExpeditionLevel: number; newExpeditionLevel: number; newTideTurner: boolean; newPhantomHook: boolean; newPerfectedSigil: boolean; unlockedSkinId?: string; crewXP: CrewXPGrant[] }
  | { error: string }

/** Pay a returned voyage out once. Also hands back what the Captain's Log
 *  needs (`log`), which only the web writes. */
export async function revealVoyageResults(db: VoyageData, uid: string, voyageId: number): Promise<{ result: VoyageReveal; log?: VoyageLogInput }> {
  const voyageRow = await db.voyage(uid, voyageId)

  if (!voyageRow) return { result: { error: 'Voyage not found' } }
  if (voyageRow.status === 'revealed') return { result: { error: 'Already revealed' } }
  if (!voyageBack(voyageRow.created_at as string, voyageRow.duration_ms as number | null)) return { result: { error: 'Your crew has not returned yet' } }

  const voyage = voyageRow as DailyVoyage

  // THE FLIP COMES FIRST. Two reveals fired together both read 'pending' above
  // and both paid the haul. Only the request whose conditional update actually
  // moves the row to 'revealed' goes on to pay; the other finds it gone.
  if (!(await db.markRevealed(uid, voyageId))) return { result: { error: 'Already revealed' } }

  const profile = await db.profile(uid, 'doubloons, gems, expedition_xp, has_tide_turner, has_phantom_hook, has_perfected_sigil, unlocked_character_colors, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')

  if (!profile) return { result: { error: 'Profile not found' } }

  // What the voyage pays (Nav XP and crew XP by route and outcome, bait, the
  // special items, survivors) is lib/voyageRules voyagePayout.
  const pay = voyagePayout({
    route: voyage.route,
    events: voyage.events as { outcome?: string; booty?: boolean; jackpot?: boolean; baitDrop?: string | null }[],
    xpBonusPct: voyage.xp_bonus_pct,
    crewIds: voyage.crew_variant_ids as number[],
    crewLost: voyage.crew_lost,
    tideTurnerDrop: voyage.tide_turner_drop,
    phantomHookDrop: voyage.phantom_hook_drop,
    perfectedSigilDrop: voyage.perfected_sigil_drop,
  }, {
    expeditionXP: profile.expedition_xp ?? 0,
    tideTurner: !!profile.has_tide_turner,
    phantomHook: !!profile.has_phantom_hook,
    perfectedSigil: !!profile.has_perfected_sigil,
  })
  const { xpEarned, crewXpEarned, earnedBait, newTideTurner, newPhantomHook, newPerfectedSigil, survivorIds } = pay
  const { from: oldExpeditionLevel, to: newExpeditionLevel, newXP: newExpeditionXP } = pay.levels

  // Lifetime Massive Booty count, for the badge. Fire and forget: a failed
  // counter must never cost the player the haul they just earned.
  if (pay.booty) {
    void db.bumpStat(uid, 'voyage_booty_hauls', 1).catch(() => {})
  }

  // Resolve crew names/rarities BEFORE any lost crew get deleted, for the log.
  const crewRows = await db.crewByIds(voyage.crew_variant_ids, 'id, rarity, nickname, cards(name, slug)', uid)
  const crewMeta: VoyageCrewMember[] = (voyage.crew_variant_ids).map(id => {
    const row = (crewRows as any[]).find(r => r.id === id)
    if (!row) return null
    return {
      variantId: id,
      name: (row.nickname as string | null) ?? crewDisplayName(row.cards?.slug ?? '', row.cards?.name ?? 'Crew'),
      rarity: RARITY_NAMES[(row.rarity as CrewRarity)] ?? 'Common',
    }
  }).filter((c): c is VoyageCrewMember => c !== null)

  // A voyage is Navigation XP, so it charges The Primeval Eye like a raid kill.
  const reelCharge = eyeCharge(profile as Parameters<typeof eyeCharge>[0], xpEarned)
  // Balances move in place (lib/wallet) and Nav XP through bump_profile_stat;
  // only flags and the Eye's charge are written as values.
  const profileUpdate: Record<string, unknown> = {
    ...(reelCharge !== null ? { anglers_patience_xp: reelCharge } : {}),
  }
  if (newTideTurner) profileUpdate.has_tide_turner = true
  if (newPhantomHook) profileUpdate.has_phantom_hook = true
  if (newPerfectedSigil) profileUpdate.has_perfected_sigil = true

  // Sky skin + Navigator badge: earned at navigation level 50. STATE-based, not
  // a level-crossing transition: nav XP also comes from raids + the Gauntlet, so
  // a transition guard here missed anyone who hit 50 outside voyages. The badge
  // self-heals via reconcileBadges; the color is granted here (+ self-healed at
  // equip — see updateCharacterColor).
  let unlockedSkinId: string | undefined
  if (newExpeditionLevel >= 50) {
    await db.grantBadge(uid, 'navigator')
    const currentUnlocked = (profile.unlocked_character_colors as string[] | null) ?? []
    if (!currentUnlocked.includes('sky') && await db.addToList(uid, 'unlocked_character_colors', 'sky')) {
      unlockedSkinId = 'sky'
    }
  }

  // This voyage was already flipped to 'revealed' above, so the count includes it.
  if ((await db.revealedCount(uid)) >= 100) await db.grantBadge(uid, 'fleet_admiral')

  // Lost crew earn nothing (grant_crew_xp_to_ids also gates on died_at IS NULL).
  const [newDoubloons, newGems, , , crewXP] = await Promise.all([
    db.grant(uid, 'doubloons', voyage.total_doubloons),
    db.grant(uid, 'gems', voyage.total_gems),
    Promise.all([
      Object.keys(profileUpdate).length > 0 ? db.updateProfile(uid, profileUpdate) : null,
      xpEarned > 0 ? db.bumpStat(uid, 'expedition_xp', xpEarned) : null,
    ]),
    // Soft-delete: lost crew get died_at + died_on_voyage_id stamped
    // instead of being deleted, so the Crew Hall Graveyard tab can
    // memorialize them with full portrait / name / rarity / traits.
    // Every live-roster read (recruit, voyage assign, raid loadout,
    // public profile) filters `WHERE died_at IS NULL` to keep fallen
    // crew out of active UI.
    db.markFallen(uid, voyage.crew_lost, voyageId, nowIso()),
    grantXPToIdsVia(db, uid, survivorIds, crewXpEarned),
    ...(voyage.total_doubloons > 0 ? [db.ledger(uid, voyage.total_doubloons, 'Daily crew voyage')] : []),
    ...earnedBait.map(({ type, qty }) => db.addBait(uid, type, qty)),
  ])

  // What the Captain's Log needs. Crew names were resolved above (before any
  // losses were stamped).
  const crewLostNames = crewMeta.filter(c => voyage.crew_lost.includes(c.variantId)).map(c => c.name)
  const log: VoyageLogInput = {
    voyageId: voyage.id,
    route: voyage.route,
    crew: crewMeta,
    events: voyage.events,
    totalDoubloons: voyage.total_doubloons,
    totalGems: voyage.total_gems,
    crewLostNames,
  }

  return {
    result: { ok: true, earnedDoubloons: voyage.total_doubloons, newDoubloonTotal: newDoubloons, earnedGems: voyage.total_gems, newGemTotal: newGems, crewLost: voyage.crew_lost, earnedBait, xpEarned, newExpeditionXP, oldExpeditionLevel, newExpeditionLevel, newTideTurner, newPhantomHook, newPerfectedSigil, unlockedSkinId, crewXP },
    log,
  }
}

export async function fetchVoyageCaptainsLog(db: VoyageData, uid: string, voyageId: number): Promise<{ log: string | null }> {
  return { log: await db.captainsLog(uid, voyageId) }
}

// ── THE VOYAGE BOARD, FETCHED FROM THE WATER ────────────────────────────────
//
// Everything DailyVoyagePanel needs, in one call, so the Charterhouse can open
// the real board over the chart instead of routing to /expeditions and asking
// the captain to find the card that opens it. LAZY: it runs when somebody moors
// at the island and not before (see sea/voyageBoardActions).

export type VoyageBoard = {
  roster: CrewMember[]
  shipTier: number
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
  expeditionXP: number
  voyages: VoyageHistoryEntry[]
  gauntletUpgrades: string[]
}

export async function voyageBoard(db: VoyageData, uid: string): Promise<VoyageBoard> {
  const [profile, state, roster, history] = await Promise.all([
    db.profile(uid, 'ship_tier, expedition_xp, gauntlet_upgrades, dons_gauntlet_upgrades'),
    getDailyVoyageState(db, uid),
    getCrewRoster(db, uid),
    db.revealedVoyages(uid, 8),
  ])

  return {
    roster,
    shipTier: (profile?.ship_tier as number | null) ?? 0,
    todayVoyage: state.todayVoyage,
    readyVoyage: state.readyVoyage,
    expeditionXP: (profile?.expedition_xp as number | null) ?? 0,
    voyages: history as unknown as VoyageHistoryEntry[],
    // BOTH LOCKERS. Safe Passage and Swift Sails can come from either
    // gauntlet, and the panel states them out loud — a board that quietly
    // disagreed with the hub about how long a voyage takes would be worse than
    // one that said nothing.
    gauntletUpgrades: [
      ...((profile?.gauntlet_upgrades as string[] | null) ?? []),
      ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? []),
    ],
  }
}

// ── TRAWLS ──────────────────────────────────────────────────────────────────
// Send ONE crew to passively fish a zone for a 1h hard-locked cycle; collect for
// fishing XP (Savvy) + doubloons (Fortune). A crew "at sea" (uncollected trawl
// row) is reserved — it's filtered out of voyage/raid parties by
// loadDeployedParty. Types + reward math live in fishing/trawls/constants.

type CrewRow = TrawlCrewRow

const CREW_COLS = 'id, power, dodge, fortune, xp, effects, nickname, raid_slot, cards(name, filename, slug)'

// A hand's trawling stats: lib/trawlRules trawlCrewView.
const crewView = trawlCrewView

const isZone = (z: string): z is TrawlZoneKey => z in TRAWL_ZONE_BY_KEY

/** The docks: every zone, what is out in it, and who is free to send. */
export async function getTrawlState(db: TrawlData, userId: string): Promise<TrawlState> {
  const [profile, trawlRows, crewRows, voyageCrew, ch3, bunkRows] = await Promise.all([
    db.profile(userId, 'fishing_xp, expedition_xp, has_ancient_deep_access, equipped_raid_items, borrowed_jaw_xp, finn_spoil_free, finn_spoil_paid, crew_stores_level, is_premium, premium_expires_at, is_admin'),
    db.trawlsOut(userId),
    db.livingCrew(userId, CREW_COLS),
    // Crew on a pending voyage are also unavailable — exclude from the picker.
    db.voyageAtSea(userId),
    // Ancient Deep trawls carry the same Chapter 3 gate as fishing it directly.
    db.hasCleared(userId, 'the_quartermaster'),
    // IN THIS BATCH, not after it: one small list, no extra serial round trip.
    db.bunks(userId),
  ])
  const ancientDeepUnlocked = (profile as { has_ancient_deep_access?: boolean } | null)?.has_ancient_deep_access === true || ch3
  const onVoyage = new Set<number>(voyageCrew ?? [])

  const fishingLevel = fishingLevelFromXP((profile?.fishing_xp as number | null) ?? 0)
  const navLevel = navLevelFromXP((profile?.expedition_xp as number | null) ?? 0)
  const unlockedSlots = unlockedTrawlSlots(fishingLevel, navLevel)

  const crewById = new Map<number, CrewRow>((crewRows as any[]).map(r => [r.id, r as CrewRow]))
  const trawls = trawlRows as { zone: TrawlZoneKey; crew_id: number; ends_at: string }[]
  const atSea = new Set(trawls.map(t => t.crew_id))
  const now = clockNow()

  const trawlByZone = new Map<TrawlZoneKey, ActiveTrawlView>()
  for (const t of trawls) {
    const row = crewById.get(t.crew_id)
    if (!row) continue
    const crew = crewView(row)
    const exp = expectedTrawlHaul(t.zone, crew.savvy, crew.fortune)
    trawlByZone.set(t.zone, {
      zone: t.zone,
      crew,
      endsAt: t.ends_at,
      ready: new Date(t.ends_at).getTime() <= now,
      expectedXp: exp.xp,
      expectedDoubloons: exp.doubloons,
    })
  }

  // A hand mid-stint in a Crew Hall bunk is committed for the whole stint, the
  // same as one already at sea. They were showing up here as free, and sending
  // one left them holding a bunk AND a trawl at once.
  const liveCap = storesCapHours((profile as { crew_stores_level?: number } | null)?.crew_stores_level ?? 1)
  const inBunk = new Set(bunkRows
    .filter(r => !stintDone(r.since, now, r.cap_hours ?? liveCap))
    .map(r => r.crew_id))

  const freeCrew: TrawlCrewView[] = (crewRows as any[])
    .filter(r => !atSea.has(r.id) && !onVoyage.has(r.id) && !inBunk.has(r.id))
    .map(r => crewView(r as CrewRow))
    .sort((a, b) => b.savvy + b.fortune - (a.savvy + a.fortune))

  return {
    fishingLevel,
    navLevel,
    unlockedSlots,
    nextSlot: nextTrawlSlot(fishingLevel, navLevel),
    zones: TRAWL_ZONES.map(z => ({
      key: z.key,
      label: z.label,
      minLevel: z.minLevel,
      unlocked: fishingLevel >= z.minLevel && (z.key !== 'ancient_deep' || ancientDeepUnlocked),
      trawl: trawlByZone.get(z.key) ?? null,
    })),
    freeCrew,
  }
}

/** Deploy one crew to trawl a zone for 1h. Hard-locks the crew (no recall). */
export async function deployTrawl(db: TrawlData, uid: string, zone: string, crewId: number): Promise<TrawlState | { error: string }> {
  if (!isZone(zone)) return { error: 'Unknown zone' }

  const [profile, trawlRows, crewRow, pendingVoyage, bunkRow] = await Promise.all([
    db.profile(uid, 'fishing_xp, expedition_xp, has_ancient_deep_access, crew_stores_level'),
    db.trawlsOut(uid),
    db.crew(uid, crewId, 'id, died_at', false),
    db.onVoyage(uid, crewId),
    // Just THIS crew's bunk, in the same batch.
    db.bunkOf(uid, crewId),
  ])

  const fishingLevel = fishingLevelFromXP((profile?.fishing_xp as number | null) ?? 0)
  const navLevel = navLevelFromXP((profile?.expedition_xp as number | null) ?? 0)
  // Ancient Deep carries the campaign gate too (Chapter 3 / the Quartermaster),
  // or the grandfather flag — otherwise trawls would be a passive XP hole around it.
  // Checked only once the level gate passes, as before.
  let ancientRefusal: string | null = null
  if (zone === 'ancient_deep' && fishingLevel >= TRAWL_ZONE_BY_KEY[zone].minLevel
      && (profile as { has_ancient_deep_access?: boolean } | null)?.has_ancient_deep_access !== true) {
    const ch3 = await db.hasCleared(uid, 'the_quartermaster')
    // Captain's water, same as the cast; the flag is the grandfather.
    ancientRefusal = !ch3 ? 'Clear Chapter 3 (defeat the Quartermaster) to trawl the Ancient Deep.'
      : !inCaptainsWater(profile as CaptainWaterRow | null) ? CAPTAIN_WATER_SAYS.ancient : null
  }

  // The level, slot, one-per-zone, one-per-hand, voyage and BUNK LOCK gates
  // (a hand mid-stint cannot be sent trawling and collect both; mirrors
  // assertCanReassign in lib/core/crew) are lib/trawlRules trawlDeployRefusal.
  const refusal = trawlDeployRefusal({
    zone, crewId, fishingLevel, navLevel, ancientRefusal,
    active: trawlRows,
    crewAlive: !!crewRow && !(crewRow as any).died_at,
    onVoyage: pendingVoyage,
    bunk: bunkRow as { since: string; cap_hours: number | null } | null,
    storesLevel: (profile as { crew_stores_level?: number } | null)?.crew_stores_level ?? 1,
  })
  if (refusal) return { error: refusal }

  if (!(await db.sendTrawl(uid, zone, crewId, new Date(clockNow() + trawlDurationMs(zone)).toISOString()))) {
    return { error: 'Could not send the trawl' }
  }

  // Free their standing voyage/raid slot so they aren't stranded in a party
  // spot while at sea (and don't linger in the bench). The slot reopens for
  // someone else; the trawl row is what reserves them now.
  await db.updateCrew(uid, crewId, { voyage_slot: null, raid_slot: null })

  return getTrawlState(db, uid)
}

/** Collect a finished trawl: grant fishing XP + doubloons, free the slot. */
export async function collectTrawl(db: TrawlData, uid: string, zone: string): Promise<CollectTrawlResult | { error: string }> {
  if (!isZone(zone)) return { error: 'Unknown zone' }

  const trawl = await db.trawlIn(uid, zone)
  if (!trawl) return { error: 'No trawl to collect there' }
  if (!trawlBack((trawl as any).ends_at)) return { error: 'Your crew has not returned yet' }

  // The delete IS the claim. Two collects fired together both read the row
  // above; only the one whose delete hands it back gets paid.
  if (!(await db.claimTrawl(trawl.id))) return { error: 'No trawl to collect there' }

  const [crewRows, profile, pool] = await Promise.all([
    db.crewByIds([trawl.crew_id], CREW_COLS),
    db.profile(uid, 'fishing_xp, doubloons, unlocked_character_colors'),
    db.speciesNamesIn(zone, 40),
  ])
  const crewRow = crewRows[0] ?? null

  const crew = crewRow ? crewView(crewRow as CrewRow) : { name: 'Your crew', savvy: 5, fortune: 5 } as TrawlCrewView
  const haul = rollTrawlHaul(zone, crew.savvy, crew.fortune)

  const oldXP = (profile?.fishing_xp as number | null) ?? 0
  const newFishingXP = oldXP + haul.xp

  // Sample a few species names for the haul reveal.
  const fish = sampleHaulFish(pool)

  // A trawl can cross a fishing-level color threshold (Forest @ 50, Ice @ 75),
  // but we DON'T grant it here — the color shows unlocked live via the earned
  // union, and the fishing screen's skin-unlock watcher grants + announces it
  // on the next visit (so a trawl crossing gets the same toast a catch does).
  // A trawl is still fishing XP, so it charges The Primeval Maw like a catch.
  const jawCharge = mawCharge(profile as Parameters<typeof mawCharge>[0], haul.xp)

  // Everything lands as an in-place add, so a sale or a catch finishing at the
  // same moment is not overwritten by the balance read above.
  const z = TRAWL_ZONE_BY_KEY[zone]
  const [newDoubloons] = await Promise.all([
    db.grant(uid, 'doubloons', haul.doubloons),
    Promise.all([
      db.bumpStat(uid, 'fishing_xp', haul.xp),
      ...(jawCharge !== null ? [db.bumpStat(uid, 'borrowed_jaw_xp', haul.xp)] : []),
      ...(haul.doubloons > 0 ? [db.ledger(uid, haul.doubloons, `Crew trawl: ${z.label}`)] : []),
    ]),
  ])

  // Lifetime trawl counter — powers First Haul / Steady Nets / Deep Trawler.
  void db.bumpStat(uid, 'trawls_collected', 1).catch(() => {})

  return {
    zone,
    xpGained: haul.xp,
    doubloonsGained: haul.doubloons,
    newFishingXP,
    oldFishingLevel: fishingLevelFromXP(oldXP),
    newFishingLevel: fishingLevelFromXP(newFishingXP),
    newDoubloons,
    fish,
    crewName: crew.name,
    bumper: haul.bumper,
    mult: haul.mult,
  }
}

// ── EVERYTHING YOUR CREW IS DOING, IN ONE READ ──────────────────────────────
//
// The crew is spread across four surfaces — the hall assigns them, the trawl
// docks send them fishing, the voyage board sails them, and the sea gate takes
// them into a raid — and there has never been one place that answers "where is
// everybody". This is a glance from the deck: who is on the roster and what
// they are busy with. It writes nothing, and the recruit count is deliberately
// not a board fill (see sea/crewHubActions).

/** One crew, as the deck needs to see them: who, what they look like, and what
 *  they are busy with. Nothing about stats — this is a roll call, and the hall
 *  is still where you go to compare anybody. */
export type HubCrew = {
  id: number
  name: string
  filename: string
  rarity: number
  level: number
  /**
   * WHAT THEY ARE DOING. `bunk` is training in the Crew Hall and `hall` is
   * nothing at all — they used to be the same word, which made "In the hall"
   * mean both "at work in the building" and "idle", the two states a captain
   * most needs to tell apart.
   */
  doing: 'trawl' | 'voyage' | 'raid' | 'bunk' | 'hall'
  /** Where, for the ones who are out. */
  where: string | null
  /** When they are back, ISO. Null for anyone not on a clock. */
  backAt: string | null
  /** Out, and the clock has run down. */
  ready: boolean
}

export type CrewHubState = {
  crew: HubCrew[]
  capacity: number
  hall: { tier: number; drill: number; stores: number }
  /** How many faces are waiting on the recruit board. */
  recruitsWaiting: number
  /**
   * FINISHED STINTS NOBODY HAS COLLECTED.
   *
   * A hand holds their bunk until the XP is CLAIMED, not merely until the timer
   * runs out, so a done-but-uncollected stint is a real errand with a real
   * address: the hall, ashore. This is the ONLY thing the Crew Hall island can
   * be waiting on — recruiting happens in the crew panel, which is a disc, not
   * a place you tie up at.
   */
  bunksReady: number
  /** The voyage that is out, or back and unread. */
  voyage: { route: string; ready: boolean } | null
}

export async function crewHub(db: SeaCrewData, uid: string): Promise<CrewHubState | { error: string }> {
  const [prof, roster, trawls, voyage, boardRows, bunkRows] = await Promise.all([
    db.profile(uid, 'expedition_xp, crew_hall_tier, crew_drill_level, crew_stores_level, last_free_recruit_date'),
    getCrewRoster(db, uid),
    getTrawlState(db, uid),
    getDailyVoyageState(db, uid),
    db.board(uid),
    // WHO IS TRAINING. The same table the hall's own tiles read, and the same
    // two columns: when the stint began and how long it runs. A roll call that
    // filed a hand in a bunk under "in the hall" was technically true and
    // useless — the hall is where they sleep AND where they work.
    db.bunks(uid),
  ])
  if (!prof) return { error: 'No profile.' }

  const p = prof as Record<string, unknown>
  const hall = {
    tier: Number(p.crew_hall_tier ?? 1),
    drill: Number(p.crew_drill_level ?? 1),
    stores: Number(p.crew_stores_level ?? 1),
  }

  // WHO IS ON A TRAWL, keyed by the crew's own id. The trawl state already
  // carries the whole crew row per zone, so this is a lookup rather than a
  // second query — and it means the panel can never say somebody is in the hall
  // while the docks say they are three hours out.
  const onTrawl = new Map<number, { zone: string; endsAt: string; ready: boolean }>()
  for (const z of trawls.zones) {
    const t = z.trawl
    if (t?.endsAt) onTrawl.set(t.crew.id, { zone: z.label, endsAt: t.endsAt, ready: t.ready })
  }

  const live = voyage.todayVoyage ?? voyage.readyVoyage ?? null
  const voyageReady = voyage.readyVoyage != null
  const atSea = new Set<number>(live?.crew_variant_ids ?? [])
  const routeName = live ? (ROUTE_CONFIGS[live.route]?.name ?? 'open water') : null

  // Bunked, with the stint's own terms so the row can carry a clock like a
  // trawl does. Keyed by crew id, same as the trawls.
  const onBunk = new Map<number, { endsAt: string; ready: boolean }>()
  for (const b of (bunkRows ?? []) as { crew_id: number; since: string; cap_hours: number }[]) {
    const cap = Number(b.cap_hours ?? 0)
    const endsAt = new Date(new Date(b.since).getTime() + cap * 3_600_000).toISOString()
    onBunk.set(Number(b.crew_id), { endsAt, ready: stintDone(b.since, clockNow(), cap) })
  }

  const bunksReady = [...onBunk.values()].filter(b => b.ready).length

  const crew: HubCrew[] = roster.map(c => {
    const t = onTrawl.get(c.id)
    const bunk = onBunk.get(c.id)
    // ORDER MATTERS AND IT IS NOT ARBITRARY. A trawl is where somebody
    // physically IS; a voyage slot and a raid slot are where they are BOOKED.
    // Somebody seated in the raid party and currently three hours out on a
    // trawl is, truthfully, out on the trawl, and that is what the deck needs
    // to be told.
    //
    // A BUNK RANKS WITH A TRAWL for the same reason: it is where they ARE, and
    // it holds them for the whole stint. It sits under the trawl only because
    // the two cannot both be true.
    const doing: HubCrew['doing'] = t ? 'trawl'
      : bunk ? 'bunk'
      : atSea.has(c.id) ? 'voyage'
      : c.raidSlot !== null ? 'raid'
      : c.voyageSlot !== null ? 'voyage'
      : 'hall'
    return {
      id: c.id,
      name: c.name,
      filename: c.filename,
      rarity: c.rarity,
      level: crewLevelFromXP(c.xp ?? 0),
      doing,
      where: t ? t.zone : doing === 'voyage' && atSea.has(c.id) ? routeName : null,
      backAt: t ? t.endsAt : bunk ? bunk.endsAt : null,
      ready: t ? t.ready : bunk ? bunk.ready : doing === 'voyage' && atSea.has(c.id) ? voyageReady : false,
    }
  })

  // WHAT IS WAITING TO BE RECRUITED. An unrolled day reports the size of the
  // board it would roll rather than the zero rows currently on it, because
  // "zero rows" and "nobody is available" are different facts and only one of
  // them is true.
  const rolledToday = String(p.last_free_recruit_date ?? '') === today()
  // THREE, WHOEVER YOU ARE. It was three for a Captain and two for everybody
  // else — see the note on DAILY_RECRUITS in lib/crewGen.
  const recruitsWaiting = rolledToday
    ? ((boardRows ?? []) as { recruited: boolean }[]).filter(r => !r.recruited).length
    : DAILY_RECRUITS

  return {
    crew,
    capacity: crewCapacity(navLevelFromXP(Number(p.expedition_xp ?? 0)), hall.tier),
    hall,
    recruitsWaiting,
    bunksReady,
    voyage: live && routeName ? { route: routeName, ready: voyageReady } : null,
  }
}
