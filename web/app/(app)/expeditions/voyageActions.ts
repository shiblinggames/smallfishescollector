'use server'

import { getCurrentUser } from '@/lib/userData'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import type { VoyageEvent, VoyageRoute } from '@/lib/voyageEvents'
import { planVoyage, voyagePayout, voyageBack, voyageCrewCap } from '@/lib/voyageRules'
import { BASE_VOYAGE_MS } from '@/lib/voyage'
import { generateAndSaveVoyageLog, type VoyageCrewMember } from '@/lib/captains-log'
import { loadDeployedParty } from '@/lib/crewData'
import { RARITY_NAMES, crewDisplayName, type CrewRarity } from '@/lib/crewGen'
import { grantXPToCrewIds, type CrewXPGrant } from '@/lib/crewXPGrant'
import { eyeCharge } from '@/lib/finnItems'
import { grant, arrayAdd } from '@/lib/wallet'

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

  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
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
  // Deployed party from the crew roster (voyage track). The Expanded Quarters
  // berth is ship-wide, so it counts on voyages too.
  const crewSlotCap = voyageCrewCap(shipTier, profile.ship_classes as Record<string, string> | null, (profile as { has_sixth_berth?: boolean }).has_sixth_berth === true)
  const party = await loadDeployedParty(admin, user.id, crewSlotCap, 'voyage')
  // Route gates, crew minimum, the event roll, the doubloon bonus and the
  // duration are lib/voyageRules planVoyage.
  const plan = planVoyage({
    route, shipTier, party,
    expeditionXP: profile.expedition_xp ?? 0,
    gauntletUpgrades: (profile.gauntlet_upgrades as string[] | null) ?? [],
  })
  if ('error' in plan) return { error: plan.error }
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
    .select('*')
    .single()

  // ONE SHIP AT SEA. The read above is only the friendly early answer: two sends
  // fired together both pass it. The partial unique index
  // daily_voyages_one_pending (migrate_exploit_fixes_raids.sql) refuses the
  // second insert, and that refusal is the same answer as the read's.
  if (error?.code === '23505') return { error: 'Your crew is already at sea' }
  if (error || !voyage) return { error: 'Failed to send voyage' }
  return { ok: true, voyage: voyage as DailyVoyage }
  } catch (e) {
    // Any unexpected throw (crew resolution, the voyage engine, a DB hiccup)
    // becomes a clean error instead of a rejected promise — otherwise the
    // client's transition can hang on "Sending…" with nothing surfaced.
    console.error('[sendDailyVoyage] threw:', e)
    return { error: 'Could not set sail. Something went wrong, please try again.' }
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
  if (!voyageBack(voyageRow.created_at as string, voyageRow.duration_ms as number | null)) return { error: 'Your crew has not returned yet' }

  const voyage = voyageRow as DailyVoyage

  // THE FLIP COMES FIRST. Two reveals fired together both read 'pending' above
  // and both paid the haul. Only the request whose conditional update actually
  // moves the row to 'revealed' goes on to pay; the other finds it gone.
  const { data: flipped } = await admin
    .from('daily_voyages')
    .update({ status: 'revealed' })
    .eq('id', voyageId)
    .eq('user_id', user.id)
    .neq('status', 'revealed')
    .select('id')
  if (!flipped || flipped.length === 0) return { error: 'Already revealed' }

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, gems, expedition_xp, has_tide_turner, has_phantom_hook, has_perfected_sigil, unlocked_character_colors, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

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
    void admin.rpc('bump_profile_stat', { uid: user.id, col: 'voyage_booty_hauls', n: 1 })
      .then(() => {}, () => {})
  }

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
    await grantBadgeDirect(user.id, 'navigator')
    const currentUnlocked = (profile.unlocked_character_colors as string[] | null) ?? []
    if (!currentUnlocked.includes('sky') && await arrayAdd(admin, user.id, 'unlocked_character_colors', 'sky')) {
      unlockedSkinId = 'sky'
    }
  }

  const { count: completedVoyages } = await admin
    .from('daily_voyages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'revealed')
  // This voyage was already flipped to 'revealed' above, so the count includes it.
  if ((completedVoyages ?? 0) >= 100) await grantBadgeDirect(user.id, 'fleet_admiral')

  // Lost crew earn nothing (grant_crew_xp_to_ids also gates on died_at IS NULL).
  const [newDoubloons, newGems, , , crewXP] = await Promise.all([
    grant(admin, user.id, 'doubloons', voyage.total_doubloons),
    grant(admin, user.id, 'gems', voyage.total_gems),
    Promise.all([
      Object.keys(profileUpdate).length > 0 ? admin.from('profiles').update(profileUpdate).eq('id', user.id) : null,
      xpEarned > 0 ? admin.rpc('bump_profile_stat', { uid: user.id, col: 'expedition_xp', n: xpEarned }) : null,
    ]),
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
