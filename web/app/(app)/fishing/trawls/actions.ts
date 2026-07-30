'use server'

// Trawls — server actions (authoritative). Send ONE crew to passively fish a
// zone for a 1h hard-locked cycle; collect for fishing XP (Savvy) + doubloons
// (Fortune). A crew "at sea" (uncollected trawl row) is reserved — it's filtered
// out of voyage/raid parties by loadDeployedParty. Types + reward math live in
// ./constants ('use server' strips non-async exports).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getLevelFromXP as fishingLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { applyLevelBonuses, crewLevelFromXP } from '@/lib/crewLevel'
import { netTraitStats } from '@/lib/crewEffects'
import { crewDisplayName } from '@/lib/crewGen'
import {
  TRAWL_ZONES, TRAWL_ZONE_BY_KEY, trawlDurationMs,
  unlockedTrawlSlots, nextTrawlSlot, rollTrawlHaul, expectedTrawlHaul,
  type TrawlZoneKey, type TrawlState, type TrawlCrewView, type ActiveTrawlView, type CollectTrawlResult,
} from './constants'
import { mawCharge } from '@/lib/finnItems'

type Admin = ReturnType<typeof createAdminClient>

/* eslint-disable @typescript-eslint/no-explicit-any */
interface CrewRow {
  id: number
  power: number
  dodge: number
  fortune: number
  xp: number | null
  effects: string[] | null
  nickname: string | null
  cards: { name?: string | null; filename?: string | null; slug?: string | null } | null
}

const CREW_COLS = 'id, power, dodge, fortune, xp, effects, nickname, raid_slot, cards(name, filename, slug)'

function crewView(row: CrewRow): TrawlCrewView {
  const xp = row.xp ?? 0
  const base = { power: row.power, dodge: row.dodge, fortune: row.fortune }
  const leveled = xp > 0 ? applyLevelBonuses(base, xp) : base
  const t = netTraitStats((row.effects ?? []) as string[])
  return {
    id: row.id,
    name: (row.nickname as string | null) ?? crewDisplayName(row.cards?.slug ?? '', row.cards?.name ?? 'Crew'),
    filename: (row.cards?.filename ?? '') as string,
    savvy: Math.max(1, Math.round(leveled.dodge + t.dodge)),
    fortune: Math.max(1, Math.round(leveled.fortune + t.fortune)),
    level: crewLevelFromXP(xp),
    inRaidParty: (row as { raid_slot?: number | null }).raid_slot != null,
  }
}

const isZone = (z: string): z is TrawlZoneKey => z in TRAWL_ZONE_BY_KEY

// Build the full client state from the player's profile + roster + active trawls.
async function buildTrawlState(admin: Admin, userId: string): Promise<TrawlState> {
  const [{ data: profile }, { data: trawlRows }, { data: crewRows }, { data: pendingVoyage }, { data: ch3Row }] = await Promise.all([
    admin.from('profiles').select('fishing_xp, expedition_xp, has_ancient_deep_access, equipped_raid_items, borrowed_jaw_xp, finn_spoil_free, finn_spoil_paid').eq('id', userId).single(),
    admin.from('trawls').select('zone, crew_id, ends_at').eq('user_id', userId),
    admin.from('user_crew').select(CREW_COLS).eq('user_id', userId).is('died_at', null),
    // Crew on a pending voyage are also unavailable — exclude from the picker.
    admin.from('daily_voyages').select('crew_variant_ids').eq('user_id', userId).eq('status', 'pending').maybeSingle(),
    // Ancient Deep trawls carry the same Chapter 3 gate as fishing it directly.
    admin.from('raid_completions').select('id').eq('user_id', userId).eq('raid_id', 'the_quartermaster').limit(1).maybeSingle(),
  ])
  const ancientDeepUnlocked = (profile as { has_ancient_deep_access?: boolean } | null)?.has_ancient_deep_access === true || !!ch3Row
  const onVoyage = new Set<number>(((pendingVoyage as { crew_variant_ids?: number[] } | null)?.crew_variant_ids ?? []))

  const fishingLevel = fishingLevelFromXP((profile?.fishing_xp as number | null) ?? 0)
  const navLevel = navLevelFromXP((profile?.expedition_xp as number | null) ?? 0)
  const unlockedSlots = unlockedTrawlSlots(fishingLevel, navLevel)

  const crewById = new Map<number, CrewRow>(((crewRows ?? []) as any[]).map(r => [r.id, r as CrewRow]))
  const trawls = (trawlRows ?? []) as { zone: TrawlZoneKey; crew_id: number; ends_at: string }[]
  const atSea = new Set(trawls.map(t => t.crew_id))
  const now = Date.now()

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

  const freeCrew: TrawlCrewView[] = ((crewRows ?? []) as any[])
    .filter(r => !atSea.has(r.id) && !onVoyage.has(r.id))
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const [{ data: profile }, { data: trawlRows }, { data: crewRow }, { data: pendingVoyage }] = await Promise.all([
    admin.from('profiles').select('fishing_xp, expedition_xp, has_ancient_deep_access').eq('id', user.id).single(),
    admin.from('trawls').select('zone, crew_id').eq('user_id', user.id),
    admin.from('user_crew').select('id, died_at').eq('id', crewId).eq('user_id', user.id).maybeSingle(),
    admin.from('daily_voyages').select('id').eq('user_id', user.id).eq('status', 'pending').contains('crew_variant_ids', [crewId]).maybeSingle(),
  ])

  const fishingLevel = fishingLevelFromXP((profile?.fishing_xp as number | null) ?? 0)
  const navLevel = navLevelFromXP((profile?.expedition_xp as number | null) ?? 0)
  const z = TRAWL_ZONE_BY_KEY[zone]
  if (fishingLevel < z.minLevel) return { error: `Reach Fishing Level ${z.minLevel} to trawl the ${z.label}` }
  // Ancient Deep carries the campaign gate too (Chapter 3 / the Quartermaster),
  // or the grandfather flag — otherwise trawls would be a passive XP hole around it.
  if (zone === 'ancient_deep' && (profile as { has_ancient_deep_access?: boolean } | null)?.has_ancient_deep_access !== true) {
    const { data: ch3 } = await admin.from('raid_completions')
      .select('id').eq('user_id', user.id).eq('raid_id', 'the_quartermaster').limit(1).maybeSingle()
    if (!ch3) return { error: 'Clear Chapter 3 (defeat the Quartermaster) to trawl the Ancient Deep.' }
  }

  const active = (trawlRows ?? []) as { zone: string; crew_id: number }[]
  if (active.length >= unlockedTrawlSlots(fishingLevel, navLevel)) return { error: 'No free trawl slot' }
  if (active.some(t => t.zone === zone)) return { error: `You're already trawling the ${z.label}` }
  if (active.some(t => t.crew_id === crewId)) return { error: 'That crew is already at sea' }
  if (!crewRow || (crewRow as any).died_at) return { error: 'Crew not available' }
  if (pendingVoyage) return { error: 'That crew is away on a voyage' }

  const { error } = await admin.from('trawls').insert({
    user_id: user.id, zone, crew_id: crewId,
    ends_at: new Date(Date.now() + trawlDurationMs(zone)).toISOString(),
  })
  if (error) return { error: 'Could not send the trawl' }

  // Free their standing voyage/raid slot so they aren't stranded in a party
  // spot while at sea (and don't linger in the bench). The slot reopens for
  // someone else; the trawl row is what reserves them now.
  await admin.from('user_crew').update({ voyage_slot: null, raid_slot: null }).eq('id', crewId).eq('user_id', user.id)
  revalidatePath('/crew')
  revalidatePath('/expeditions')

  return buildTrawlState(admin, user.id)
}

/** Collect a finished trawl: grant fishing XP + doubloons, free the slot. */
export async function collectTrawl(zone: string): Promise<CollectTrawlResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isZone(zone)) return { error: 'Unknown zone' }

  const admin = createAdminClient()
  const { data: trawl } = await admin
    .from('trawls').select('id, crew_id, ends_at').eq('user_id', user.id).eq('zone', zone).maybeSingle()
  if (!trawl) return { error: 'No trawl to collect there' }
  if (new Date((trawl as any).ends_at).getTime() > Date.now()) return { error: 'Your crew has not returned yet' }

  const [{ data: crewRow }, { data: profile }, { data: pool }] = await Promise.all([
    admin.from('user_crew').select(CREW_COLS).eq('id', (trawl as any).crew_id).maybeSingle(),
    admin.from('profiles').select('fishing_xp, doubloons, unlocked_character_colors').eq('id', user.id).single(),
    admin.from('fish_species').select('name').eq('habitat', zone).limit(40),
  ])

  const crew = crewRow ? crewView(crewRow as CrewRow) : { name: 'Your crew', savvy: 5, fortune: 5 } as TrawlCrewView
  const haul = rollTrawlHaul(zone, crew.savvy, crew.fortune)

  const oldXP = (profile?.fishing_xp as number | null) ?? 0
  const newFishingXP = oldXP + haul.xp
  const newDoubloons = ((profile?.doubloons as number | null) ?? 0) + haul.doubloons

  // Sample a few species names for the haul reveal.
  const names = ((pool ?? []) as { name: string }[]).map(r => r.name)
  const fish: string[] = []
  for (let i = 0; i < 3 && names.length > 0; i++) {
    fish.push(names.splice(Math.floor(Math.random() * names.length), 1)[0])
  }

  // A trawl can cross a fishing-level color threshold (Forest @ 50, Ice @ 75),
  // but we DON'T grant it here — the color shows unlocked live via the earned
  // union, and the fishing screen's skin-unlock watcher grants + announces it
  // on the next visit (so a trawl crossing gets the same toast a catch does).
  // A trawl is still fishing XP, so it charges The Primeval Maw like a catch.
  const jawCharge = mawCharge(profile as Parameters<typeof mawCharge>[0], haul.xp)
  const profileUpdate: Record<string, unknown> = {
    fishing_xp: newFishingXP, doubloons: newDoubloons,
    ...(jawCharge !== null ? { borrowed_jaw_xp: jawCharge } : {}),
  }

  const z = TRAWL_ZONE_BY_KEY[zone]
  await Promise.all([
    admin.from('profiles').update(profileUpdate).eq('id', user.id),
    admin.from('trawls').delete().eq('id', (trawl as any).id),
    ...(haul.doubloons > 0
      ? [admin.from('doubloon_transactions').insert({ user_id: user.id, amount: haul.doubloons, reason: `Crew trawl: ${z.label}` })]
      : []),
  ])

  // Lifetime trawl counter — powers First Haul / Steady Nets / Deep Trawler.
  void admin.rpc('bump_profile_stat', { uid: user.id, col: 'trawls_collected', n: 1 }).then(() => {}, () => {})

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
