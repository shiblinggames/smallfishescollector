// ── THE TRAWL RULES, WITH NO DATABASE IN THEM (Steam prep, Phase B, 2026-09-28) ──
//
// The haul itself (xp, doubloons, the bumper roll) was already pure in
// fishing/trawls/constants. This adds what the actions still decided inline:
// a hand's trawling stats, who may be sent where, when a trawl is home, and
// the species shown on the haul. Moved verbatim; nothing about a trawl
// changed. scripts/check-voyage-rules.mts holds these too.

import { applyLevelBonuses, crewLevelFromXP } from '@/lib/crewLevel'
import { netTraitStats } from '@/lib/crewEffects'
import { crewDisplayName } from '@/lib/crewGen'
import { storesCapHours, stintDone } from '@/lib/crewBunks'
import { TRAWL_ZONE_BY_KEY, unlockedTrawlSlots, type TrawlZoneKey, type TrawlCrewView } from '@/app/(app)/fishing/trawls/constants'
import { rngNext } from '@/lib/rng'
import { clockNow } from '@/lib/clock'

export interface TrawlCrewRow {
  id: number
  power: number
  dodge: number
  fortune: number
  xp: number | null
  effects: string[] | null
  nickname: string | null
  raid_slot?: number | null
  cards: { name?: string | null; filename?: string | null; slug?: string | null } | null
}

/** A hand as a trawler: Savvy is their levelled Navigation plus trait,
 *  Fortune likewise, each at least 1. */
export function trawlCrewView(row: TrawlCrewRow): TrawlCrewView {
  const xp = row.xp ?? 0
  const base = { power: row.power, dodge: row.dodge, fortune: row.fortune }
  const leveled = xp > 0 ? applyLevelBonuses(base, xp) : base
  const t = netTraitStats((row.effects ?? []) as string[])
  return {
    id: row.id,
    name: row.nickname ?? crewDisplayName(row.cards?.slug ?? '', row.cards?.name ?? 'Crew'),
    filename: (row.cards?.filename ?? '') as string,
    savvy: Math.max(1, Math.round(leveled.dodge + t.dodge)),
    fortune: Math.max(1, Math.round(leveled.fortune + t.fortune)),
    level: crewLevelFromXP(xp),
    inRaidParty: row.raid_slot != null,
  }
}

/**
 * WHY THIS HAND MAY NOT BE SENT, or null when they may. In order: the zone's
 * fishing level, the Ancient Deep's campaign gate (the caller works that out,
 * since it asks the database), a free slot, one trawl per zone, one trawl per
 * hand, a living hand, not away on a voyage, and not mid-stint in the Crew Hall
 * (a hand cannot serve a trawl and a stint at once).
 */
export function trawlDeployRefusal(i: {
  zone: TrawlZoneKey
  crewId: number
  fishingLevel: number
  navLevel: number
  ancientRefusal: string | null
  active: { zone: string; crew_id: number }[]
  crewAlive: boolean
  onVoyage: boolean
  bunk: { since: string; cap_hours: number | null } | null
  storesLevel: number
}): string | null {
  const z = TRAWL_ZONE_BY_KEY[i.zone]
  if (i.fishingLevel < z.minLevel) return `Reach Fishing Level ${z.minLevel} to trawl the ${z.label}`
  if (i.ancientRefusal) return i.ancientRefusal
  if (i.active.length >= unlockedTrawlSlots(i.fishingLevel, i.navLevel)) return 'No free trawl slot'
  if (i.active.some(t => t.zone === i.zone)) return `You're already trawling the ${z.label}`
  if (i.active.some(t => t.crew_id === i.crewId)) return 'That crew is already at sea'
  if (!i.crewAlive) return 'Crew not available'
  if (i.onVoyage) return 'That crew is away on a voyage'
  if (i.bunk && !stintDone(i.bunk.since, clockNow(), i.bunk.cap_hours ?? storesCapHours(i.storesLevel))) {
    return 'That crew is training in the hall. Their stint has to finish first.'
  }
  return null
}

/** Is a trawl ending at `endsAt` home? */
export const trawlBack = (endsAt: string) => new Date(endsAt).getTime() <= clockNow()

/** Up to three different species from the zone's water, for the haul reveal. */
export function sampleHaulFish(pool: readonly string[]): string[] {
  const names = [...pool]
  const fish: string[] = []
  for (let i = 0; i < 3 && names.length > 0; i++) {
    fish.push(names.splice(Math.floor(rngNext() * names.length), 1)[0])
  }
  return fish
}
