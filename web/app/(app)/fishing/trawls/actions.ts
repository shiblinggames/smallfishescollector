'use server'

// Trawls — server actions (authoritative). Send ONE crew to passively fish a
// zone for a 1h hard-locked cycle; collect for fishing XP (Savvy) + doubloons
// (Fortune). A crew "at sea" (uncollected trawl row) is reserved — it's filtered
// out of voyage/raid parties by loadDeployedParty. Types + reward math live in
// ./constants ('use server' strips non-async exports).

import { getCurrentUser } from '@/lib/userData'
import { inCaptainsWater, CAPTAIN_WATER_SAYS, type CaptainWaterRow } from '@/lib/captainWater'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP as fishingLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import {
  TRAWL_ZONES, TRAWL_ZONE_BY_KEY, trawlDurationMs,
  unlockedTrawlSlots, nextTrawlSlot, rollTrawlHaul, expectedTrawlHaul,
  type TrawlZoneKey, type TrawlState, type TrawlCrewView, type ActiveTrawlView, type CollectTrawlResult,
} from './constants'
import { mawCharge } from '@/lib/finnItems'
import { storesCapHours, stintDone } from '@/lib/crewBunks'
import { grant } from '@/lib/wallet'
import { clockNow } from '@/lib/clock'
import { trawlData } from '@/lib/data/voyageData'
import { trawlCrewView, trawlDeployRefusal, trawlBack, sampleHaulFish, type TrawlCrewRow } from '@/lib/trawlRules'

type Admin = ReturnType<typeof createAdminClient>

/* eslint-disable @typescript-eslint/no-explicit-any */
type CrewRow = TrawlCrewRow

const CREW_COLS = 'id, power, dodge, fortune, xp, effects, nickname, raid_slot, cards(name, filename, slug)'

// A hand's trawling stats: lib/trawlRules trawlCrewView.
const crewView = trawlCrewView

const isZone = (z: string): z is TrawlZoneKey => z in TRAWL_ZONE_BY_KEY

// Build the full client state from the player's profile + roster + active trawls.
async function buildTrawlState(admin: Admin, userId: string): Promise<TrawlState> {
  const db = trawlData(admin)
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

export async function getTrawlState(): Promise<TrawlState | { error: string }> {

  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }
  return buildTrawlState(createAdminClient(), user.id)
}

/** Deploy one crew to trawl a zone for 1h. Hard-locks the crew (no recall). */
export async function deployTrawl(zone: string, crewId: number): Promise<TrawlState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isZone(zone)) return { error: 'Unknown zone' }

  const admin = createAdminClient()
  const db = trawlData(admin)
  const [profile, trawlRows, crewRow, pendingVoyage, bunkRow] = await Promise.all([
    db.profile(user.id, 'fishing_xp, expedition_xp, has_ancient_deep_access, crew_stores_level'),
    db.trawlsOut(user.id),
    db.crew(user.id, crewId, 'id, died_at', false),
    db.onVoyage(user.id, crewId),
    // Just THIS crew's bunk, in the same batch.
    db.bunkOf(user.id, crewId),
  ])

  const fishingLevel = fishingLevelFromXP((profile?.fishing_xp as number | null) ?? 0)
  const navLevel = navLevelFromXP((profile?.expedition_xp as number | null) ?? 0)
  // Ancient Deep carries the campaign gate too (Chapter 3 / the Quartermaster),
  // or the grandfather flag — otherwise trawls would be a passive XP hole around it.
  // Checked only once the level gate passes, as before.
  let ancientRefusal: string | null = null
  if (zone === 'ancient_deep' && fishingLevel >= TRAWL_ZONE_BY_KEY[zone].minLevel
      && (profile as { has_ancient_deep_access?: boolean } | null)?.has_ancient_deep_access !== true) {
    const ch3 = await db.hasCleared(user.id, 'the_quartermaster')
    // Captain's water, same as the cast; the flag is the grandfather.
    ancientRefusal = !ch3 ? 'Clear Chapter 3 (defeat the Quartermaster) to trawl the Ancient Deep.'
      : !inCaptainsWater(profile as CaptainWaterRow | null) ? CAPTAIN_WATER_SAYS.ancient : null
  }

  // The level, slot, one-per-zone, one-per-hand, voyage and BUNK LOCK gates
  // (a hand mid-stint cannot be sent trawling and collect both; mirrors
  // assertCanReassign in crew/actions.ts) are lib/trawlRules trawlDeployRefusal.
  const refusal = trawlDeployRefusal({
    zone, crewId, fishingLevel, navLevel, ancientRefusal,
    active: trawlRows,
    crewAlive: !!crewRow && !(crewRow as any).died_at,
    onVoyage: pendingVoyage,
    bunk: bunkRow as { since: string; cap_hours: number | null } | null,
    storesLevel: (profile as { crew_stores_level?: number } | null)?.crew_stores_level ?? 1,
  })
  if (refusal) return { error: refusal }

  if (!(await db.sendTrawl(user.id, zone, crewId, new Date(clockNow() + trawlDurationMs(zone)).toISOString()))) {
    return { error: 'Could not send the trawl' }
  }

  // Free their standing voyage/raid slot so they aren't stranded in a party
  // spot while at sea (and don't linger in the bench). The slot reopens for
  // someone else; the trawl row is what reserves them now.
  await db.updateCrew(user.id, crewId, { voyage_slot: null, raid_slot: null })

  // NO revalidatePath HERE, deliberately.
  //
  // It used to revalidate /crew and /expeditions, and bought nothing on either:
  // both are per-user and auth-gated (/crew is force-dynamic outright), so
  // neither is ever in the full route cache and both refetch on navigation
  // regardless. What it DID do was cost the player. A Server Action that
  // revalidates makes the Next router refetch the RSC payload for the route
  // they are ON — which for a trawl is /fishing, the heaviest page in the game
  // — so every send paid a full re-render of the fishing screen, landing right
  // after the optimistic update and undoing the point of it.
  return buildTrawlState(admin, user.id)
}

/** Collect a finished trawl: grant fishing XP + doubloons, free the slot. */
export async function collectTrawl(zone: string): Promise<CollectTrawlResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isZone(zone)) return { error: 'Unknown zone' }

  const admin = createAdminClient()
  const db = trawlData(admin)
  const trawl = await db.trawlIn(user.id, zone)
  if (!trawl) return { error: 'No trawl to collect there' }
  if (!trawlBack((trawl as any).ends_at)) return { error: 'Your crew has not returned yet' }

  // The delete IS the claim. Two collects fired together both read the row
  // above; only the one whose delete hands it back gets paid.
  if (!(await db.claimTrawl(trawl.id))) return { error: 'No trawl to collect there' }

  const [crewRows, profile, pool] = await Promise.all([
    db.crewByIds([trawl.crew_id], CREW_COLS),
    db.profile(user.id, 'fishing_xp, doubloons, unlocked_character_colors'),
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
    grant(admin, user.id, 'doubloons', haul.doubloons),
    Promise.all([
      db.bumpStat(user.id, 'fishing_xp', haul.xp),
      ...(jawCharge !== null ? [db.bumpStat(user.id, 'borrowed_jaw_xp', haul.xp)] : []),
      ...(haul.doubloons > 0 ? [db.ledger(user.id, haul.doubloons, `Crew trawl: ${z.label}`)] : []),
    ]),
  ])

  // Lifetime trawl counter — powers First Haul / Steady Nets / Deep Trawler.
  void db.bumpStat(user.id, 'trawls_collected', 1).catch(() => {})

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
