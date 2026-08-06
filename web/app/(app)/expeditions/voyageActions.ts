'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { classSlotBonuses } from '@/lib/shipClasses'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { generateVoyageEvents, type VoyageEvent, type VoyageRoute } from '@/lib/voyageEvents'
import { ROUTE_CONFIGS, COMING_SOON_ROUTES } from '@/lib/voyageRoutes'
import { generateAndSaveVoyageLog, type VoyageCrewMember } from '@/lib/captains-log'
import type { CrewCard } from '@/lib/expeditions'
import { ROUTE_PAYOUTS, OUTCOME_MULT } from '@/lib/voyageRoll'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { loadDeployedParty } from '@/lib/crewData'
import { resolveDeployedCrew, slotMult} from '@/lib/crewResolve'
import { RARITY_NAMES, crewDisplayName, type CrewRarity } from '@/lib/crewGen'
import { grantXPToCrewIds, type CrewXPGrant } from '@/lib/crewXPGrant'
import { hasSafeVoyages, gauntletVoyageSpeedMult } from '@/lib/gauntletUpgrades'
import { BASE_VOYAGE_MS, computeVoyageDurationMs } from '@/lib/voyage'
import { eyeCharge } from '@/lib/finnItems'

function today(): string {
  return new Date().toISOString().split('T')[0]
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

export async function getDailyVoyageState(): Promise<{
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
} | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('daily_voyages')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const rows = (data ?? []) as DailyVoyage[]
  const now = Date.now()
  const pending = rows.filter(r => r.status === 'pending')

  const activeVoyage = pending.find(r => new Date(r.created_at).getTime() + ((r as DailyVoyage).duration_ms ?? BASE_VOYAGE_MS) > now) ?? null
  const readyVoyage  = pending.find(r => new Date(r.created_at).getTime() + ((r as DailyVoyage).duration_ms ?? BASE_VOYAGE_MS) <= now) ?? null

  return { todayVoyage: activeVoyage, readyVoyage }
}

// CREW_TRAITS (flavor) only has common/rare/legendary tiers; map crew group to one.
function traitTier(group: number): string {
  return group <= 1 ? 'Common' : group === 2 ? 'Rare' : 'Legendary'
}

/** user_crew ids currently out on a trawl — they're locked from voyages
 *  (loadDeployedParty drops them server-side), so the panel uses this to stop
 *  counting them and to explain why a slotted crew can't sail. */
export async function getTrawlingCrewIds(): Promise<number[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const admin = createAdminClient()
  const { data } = await admin.from('trawls').select('crew_id').eq('user_id', user.id)
  return ((data ?? []) as { crew_id: number }[]).map(r => r.crew_id)
}

export async function sendDailyVoyage(route: VoyageRoute = 'open'): Promise<
  { ok: true; voyage: DailyVoyage } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  try {
  // Block if a voyage is already pending (at sea or ready to reveal)
  const { data: existing } = await admin
    .from('daily_voyages')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return { error: 'Your crew is already at sea' }

  // Block if a raid is in progress
  const { data: activeRaid } = await admin
    .from('expeditions')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (activeRaid) return { error: 'Finish your raid before sending a voyage' }

  // Load profile for ship tier and expedition level
  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, expedition_xp, gauntlet_upgrades, ship_classes, has_sixth_berth')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const shipTier = profile.ship_tier ?? 0
  // Per-route ship gate. Coastal (rowboat OK) carries no crew-loss risk;
  // the deeper routes do, and need at least a Sloop. See lib/voyageRoutes.
  const routeCfg = ROUTE_CONFIGS[route]
  if (!routeCfg) return { error: 'Unknown route' }
  if (COMING_SOON_ROUTES.has(route)) {
    return { error: 'This route isn\'t ready to sail yet — coming soon.' }
  }
  if (shipTier < routeCfg.minShipTier) {
    return { error: 'Requires a Sloop or better for this route' }
  }
  const shipStats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]

  // Deployed party from the new crew roster (voyage track), resolved with
  // effects. Voyage and raid each have an independent slot column now.
  // Expanded Quarters (Ch4 augment) berths one more — ship-wide, so it counts
  // on voyages too.
  const berthSlots = (profile as { has_sixth_berth?: boolean }).has_sixth_berth === true ? 1 : 0
  const crewSlotCap = shipStats.crewSlots + classSlotBonuses(profile.ship_classes as Record<string, string> | null).crewSlots + berthSlots
  const party = await loadDeployedParty(admin, user.id, crewSlotCap, 'voyage')
  // The Inner Sea (coastal) is the safe intro route — any boat can sail it with
  // a single crew member aboard. Deeper routes still need a party of two.
  const minCrew = route === 'coastal' ? 1 : 2
  if (party.length < minCrew) {
    return { error: minCrew === 1 ? 'You need at least one crew member aboard' : 'A voyage requires at least two crew members' }
  }
  const resolved = resolveDeployedCrew(party)

  // Voyage crew effects: scorePct lifts the whole crew's effective stats (so
  // rolls + payouts improve), doubloonPct/xpPct scale the rewards.
  const scoreMult = 1 + resolved.voyage.scorePct / 100

  // Build the engine's crew array (captain first), with effect-adjusted stats.
  // variantId carries the user_crew id so crew loss tracks the right instance.
  const crew: CrewCard[] = resolved.perCrew.map(pc => {
    const row = party.find(p => p.id === pc.id)!
    return {
      collectionId: pc.id,
      cardId: pc.id,
      variantId: pc.id,
      name: row.name,            // nickname (drives narratives)
      slug: '',
      filename: row.filename,
      rarity: traitTier(row.rarity),
      traitName: row.catalogName, // species name (drives CREW_TRAITS flavor)
      power: Math.round(pc.power * scoreMult),
      dodge: Math.round(pc.dodge * scoreMult),
      fortune: Math.round(pc.fortune * scoreMult),
    }
  })

  // Davy Jones Gauntlet Locker Upgrades that touch voyages.
  const gauntletUpgrades = (profile.gauntlet_upgrades as string[] | null) ?? []
  const safeVoyages = hasSafeVoyages(gauntletUpgrades)  // Safe Passage — no crew loss
  const result = generateVoyageEvents(crew, shipTier, route, safeVoyages)
  const totalDoubloons = Math.round(result.totalDoubloons * (1 + resolved.voyage.doubloonPct / 100))

  const expeditionLevel = getLevelFromXP(profile.expedition_xp ?? 0)
  // slotMult, not an inline 0.8: this is the same captain weighting raids use,
  // and a copy here would silently diverge the moment it is retuned.
  const totalNav = crew.reduce((s, c, i) => s + Math.round(c.dodge * slotMult(i)), 0)
  // Swift Sails (Locker Upgrade) shortens the wait.
  const duration_ms = Math.round(computeVoyageDurationMs(expeditionLevel, totalNav, route) * gauntletVoyageSpeedMult(gauntletUpgrades))
  const crewIds = party.map(p => p.id)

  const { data: voyage, error } = await admin
    .from('daily_voyages')
    .insert({
      user_id: user.id,
      voyage_date: today(),
      crew_variant_ids: crewIds, // now holds user_crew ids
      ship_tier: shipTier,
      route,
      status: 'pending',
      events: result.events,
      total_doubloons: totalDoubloons,
      total_gems: result.totalGems,
      crew_lost: result.crewLost, // user_crew ids of any losses
      duration_ms,
      xp_bonus_pct: resolved.voyage.xpPct,
      tide_turner_drop: result.tideTurnerDrop,
      phantom_hook_drop: result.phantomHookDrop,
      perfected_sigil_drop: result.perfectedSigilDrop,
    })
    .select('*')
    .single()

  if (error || !voyage) return { error: 'Failed to send voyage' }
  return { ok: true, voyage: voyage as DailyVoyage }
  } catch (e) {
    // Any unexpected throw (crew resolution, the voyage engine, a DB hiccup)
    // becomes a clean error instead of a rejected promise — otherwise the
    // client's transition can hang on "Sending…" with nothing surfaced.
    console.error('[sendDailyVoyage] threw:', e)
    return { error: 'Could not set sail — something went wrong. Please try again.' }
  }
}

export async function revealVoyageResults(voyageId: number): Promise<
  { ok: true; earnedDoubloons: number; newDoubloonTotal: number; earnedGems: number; newGemTotal: number; crewLost: number[]; earnedBait: { type: string; qty: number }[]; xpEarned: number; newExpeditionXP: number; oldExpeditionLevel: number; newExpeditionLevel: number; newTideTurner: boolean; newPhantomHook: boolean; newPerfectedSigil: boolean; unlockedSkinId?: string; crewXP: CrewXPGrant[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const { data: voyageRow } = await admin
    .from('daily_voyages')
    .select('*')
    .eq('id', voyageId)
    .eq('user_id', user.id)
    .single()

  if (!voyageRow) return { error: 'Voyage not found' }
  if (voyageRow.status === 'revealed') return { error: 'Already revealed' }
  const sentAt = new Date(voyageRow.created_at as string).getTime()
  const voyageDurationMs = (voyageRow.duration_ms as number | null) ?? BASE_VOYAGE_MS
  if (Date.now() < sentAt + voyageDurationMs) return { error: 'Your crew has not returned yet' }

  const voyage = voyageRow as DailyVoyage

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, gems, expedition_xp, has_tide_turner, has_phantom_hook, has_perfected_sigil, unlocked_character_colors, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const newDoubloons = (profile.doubloons ?? 0) + voyage.total_doubloons
  const newGems = (profile.gems ?? 0) + voyage.total_gems

  // Nav XP comes from the ROUTE and how the voyage went, not from summing an
  // event list. The old voyageXP() added up six events' worth; with one event
  // it would have quietly paid about a sixth. ROUTE_PAYOUTS carries the intended
  // per-voyage figure directly, and the single event's outcome scales it.
  const voyageEvent = (voyage.events as { outcome?: string; booty?: boolean; jackpot?: boolean }[])?.[0]

  // Lifetime Massive Booty count, for the badge. Fire and forget: a failed
  // counter must never cost the player the haul they just earned.
  if (voyageEvent?.booty || voyageEvent?.jackpot) {
    void admin.rpc('bump_profile_stat', { uid: user.id, col: 'voyage_booty_hauls', n: 1 })
      .then(() => {}, () => {})
  }
  const outcomeMult = voyageEvent?.outcome === 'success' ? OUTCOME_MULT.triumph
                    : voyageEvent?.outcome === 'failure' ? OUTCOME_MULT.setback
                    : OUTCOME_MULT.success
  const baseXp = Math.round(
    (ROUTE_PAYOUTS[voyage.route as VoyageRoute]?.xp ?? 650) * outcomeMult,
  )
  const xpEarned = Math.round(baseXp * (1 + ((voyage.xp_bonus_pct as number | null) ?? 0) / 100))
  const oldExpeditionXP = profile.expedition_xp ?? 0
  const newExpeditionXP = oldExpeditionXP + xpEarned
  const oldExpeditionLevel = getLevelFromXP(oldExpeditionXP)
  const newExpeditionLevel = getLevelFromXP(newExpeditionXP)

  // Resolve crew names/rarities BEFORE any lost crew get deleted, for the log.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: crewRows } = await admin
    .from('user_crew')
    .select('id, rarity, nickname, cards(name, slug)')
    .eq('user_id', user.id)
    .in('id', voyage.crew_variant_ids)
  const crewMeta: VoyageCrewMember[] = (voyage.crew_variant_ids).map(id => {
    const row = ((crewRows ?? []) as any[]).find(r => r.id === id)
    if (!row) return null
    return {
      variantId: id,
      name: (row.nickname as string | null) ?? crewDisplayName(row.cards?.slug ?? '', row.cards?.name ?? 'Crew'),
      rarity: RARITY_NAMES[(row.rarity as CrewRarity)] ?? 'Common',
    }
  }).filter((c): c is VoyageCrewMember => c !== null)

  // Collect bait drops
  const baitDropMap = new Map<string, number>()
  for (const e of voyage.events as { baitDrop?: string | null }[]) {
    if (e.baitDrop) baitDropMap.set(e.baitDrop, (baitDropMap.get(e.baitDrop) ?? 0) + 1)
  }
  const earnedBait = Array.from(baitDropMap.entries()).map(([type, qty]) => ({ type, qty }))

  const newTideTurner = !!(voyage.tide_turner_drop && !profile.has_tide_turner)
  const newPhantomHook = !!(voyage.phantom_hook_drop && !profile.has_phantom_hook)
  const newPerfectedSigil = !!(voyage.perfected_sigil_drop && !profile.has_perfected_sigil)
  // A voyage is Navigation XP, so it charges The Primeval Eye like a raid kill.
  const reelCharge = eyeCharge(profile as Parameters<typeof eyeCharge>[0], xpEarned)
  const profileUpdate: Record<string, unknown> = {
    doubloons: newDoubloons, gems: newGems, expedition_xp: newExpeditionXP,
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
    await grantBadgeDirect(user.id, 'navigator')
    const currentUnlocked = (profile.unlocked_character_colors as string[] | null) ?? []
    if (!currentUnlocked.includes('sky')) {
      profileUpdate.unlocked_character_colors = [...currentUnlocked, 'sky']
      unlockedSkinId = 'sky'
    }
  }

  const { count: completedVoyages } = await admin
    .from('daily_voyages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'revealed')
  if ((completedVoyages ?? 0) + 1 >= 100) await grantBadgeDirect(user.id, 'fleet_admiral')

  // Crew XP is a per-route figure (ROUTE_PAYOUTS.crewXp), tuned so the RATE is
  // flat at roughly 200 an hour whatever route was sailed. It cannot be a share
  // of Nav XP: Nav per hour climbs sixfold from Coastal to Shroud, so any fixed
  // percentage makes deep routes the best place to train hands, and the Crew
  // Hall is meant to be that place.
  //
  // Still scales with the outcome, as it always has: a voyage that went well
  // teaches more than one that did not. Lost crew earn nothing (the soft-delete
  // that follows skips them anyway, since grant_crew_xp_to_ids gates on
  // died_at IS NULL, belt and braces).
  const crewXpEarned = Math.round(
    (ROUTE_PAYOUTS[voyage.route as VoyageRoute]?.crewXp ?? 450) * outcomeMult,
  )
  const survivorIds = (voyage.crew_variant_ids as number[]).filter(id => !voyage.crew_lost.includes(id))

  const [, , , crewXP] = await Promise.all([
    admin.from('profiles').update(profileUpdate).eq('id', user.id),
    admin.from('daily_voyages').update({ status: 'revealed' }).eq('id', voyageId),
    // Soft-delete: lost crew get died_at + died_on_voyage_id stamped
    // instead of being deleted, so the Crew Hall Graveyard tab can
    // memorialize them with full portrait / name / rarity / traits.
    // Every live-roster read (recruit, voyage assign, raid loadout,
    // public profile) filters `WHERE died_at IS NULL` to keep fallen
    // crew out of active UI.
    voyage.crew_lost.length > 0
      ? admin.from('user_crew')
          .update({ died_at: new Date().toISOString(), died_on_voyage_id: voyageId, voyage_slot: null, raid_slot: null })
          .eq('user_id', user.id)
          .in('id', voyage.crew_lost)
      : Promise.resolve(null),
    grantXPToCrewIds(admin, user.id, survivorIds, crewXpEarned),
    ...(voyage.total_doubloons > 0
      ? [admin.from('doubloon_transactions').insert({ user_id: user.id, amount: voyage.total_doubloons, reason: 'Daily crew voyage' })]
      : []),
    ...earnedBait.map(({ type, qty }) =>
      admin.rpc('upsert_bait', { p_user_id: user.id, p_bait_type: type, p_qty: qty })
    ),
  ])

  // Schedule captain's log generation after response is sent. Crew names were
  // resolved above (before any losses were deleted).
  const voyageForLog = voyage
  const crewForLog = crewMeta
  after(async () => {
    const crewLostNames = crewForLog
      .filter(c => voyageForLog.crew_lost.includes(c.variantId))
      .map(c => c.name)

    await generateAndSaveVoyageLog({
      voyageId: voyageForLog.id,
      route: voyageForLog.route,
      crew: crewForLog,
      events: voyageForLog.events,
      totalDoubloons: voyageForLog.total_doubloons,
      totalGems: voyageForLog.total_gems,
      crewLostNames,
    })
  })

  return { ok: true, earnedDoubloons: voyage.total_doubloons, newDoubloonTotal: newDoubloons, earnedGems: voyage.total_gems, newGemTotal: newGems, crewLost: voyage.crew_lost, earnedBait, xpEarned, newExpeditionXP, oldExpeditionLevel, newExpeditionLevel, newTideTurner, newPhantomHook, newPerfectedSigil, unlockedSkinId, crewXP }
}

export async function fetchVoyageCaptainsLog(voyageId: number): Promise<{ log: string | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('daily_voyages')
    .select('captains_log')
    .eq('id', voyageId)
    .eq('user_id', user.id)
    .single()

  return { log: (data?.captains_log as string | null) ?? null }
}
