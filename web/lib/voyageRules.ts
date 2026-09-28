// ── THE VOYAGE RULES, WITH NO DATABASE IN THEM (Steam prep, Phase B, 2026-09-28) ──
//
// What a voyage sails with and what it pays when it comes home, as plain
// functions over plain inputs. The event roll itself (one event, one loot
// roll, one flat crew-loss check) was already pure in lib/voyageEvents; this
// adds the plan around it (route gates, the crew and their effect-lifted
// stats, the doubloon bonus, the duration) and the payout (Navigation XP and
// crew XP by route and outcome, bait, the three special items, survivors).
// Moved out of expeditions/voyageActions verbatim: nothing about a voyage
// changed. The actions keep who is asking, the one-at-sea lock, the reveal
// flip and the writes. scripts/check-voyage-rules.mts holds the rules.

import { EXPEDITION_SHIP_STATS, type CrewCard } from '@/lib/expeditions'
import { classSlotBonuses } from '@/lib/shipClasses'
import { generateVoyageEvents, type VoyageEvent, type VoyageRoute } from '@/lib/voyageEvents'
import { ROUTE_CONFIGS, COMING_SOON_ROUTES } from '@/lib/voyageRoutes'
import { ROUTE_PAYOUTS, OUTCOME_MULT } from '@/lib/voyageRoll'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { resolveDeployedCrew, slotMult } from '@/lib/crewResolve'
import type { DeployedCrewRow } from '@/lib/crewData'
import { hasSafeVoyages, gauntletVoyageSpeedMult } from '@/lib/gauntletUpgrades'
import { BASE_VOYAGE_MS, computeVoyageDurationMs } from '@/lib/voyage'
import { clockNow } from '@/lib/clock'

/** How many hands may sail on this hull: its berths, class picks and the
 *  Expanded Quarters berth (ship-wide, so it counts on voyages too). */
export function voyageCrewCap(shipTier: number, shipClasses: Record<string, string> | null, hasSixthBerth: boolean): number {
  const ship = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  return ship.crewSlots + classSlotBonuses(shipClasses).crewSlots + (hasSixthBerth ? 1 : 0)
}

/** CREW_TRAITS (flavor) only has common/rare/legendary tiers; map crew group to one. */
function traitTier(group: number): string {
  return group <= 1 ? 'Common' : group === 2 ? 'Rare' : 'Legendary'
}

export type VoyagePlan = {
  crew: CrewCard[]
  events: VoyageEvent[]
  totalDoubloons: number
  totalGems: number
  crewLost: number[]
  durationMs: number
  xpBonusPct: number
  tideTurnerDrop: boolean
  phantomHookDrop: boolean
  perfectedSigilDrop: boolean
}

/**
 * EVERYTHING A VOYAGE IS, decided at the moment it sails. The route gate
 * (Coastal is open to every hull and carries no crew-loss risk; the deeper
 * routes need a Sloop), the crew minimum (one on Coastal, two elsewhere), the
 * crew's effect-lifted stats (captain first), the event roll, the doubloon
 * bonus, and the duration from level and the crew's Navigation (Swift Sails
 * shortens it; Safe Passage removes the loss).
 */
export function planVoyage(i: {
  route: VoyageRoute
  shipTier: number
  party: DeployedCrewRow[]
  expeditionXP: number
  gauntletUpgrades: string[]
}): VoyagePlan | { error: string } {
  const routeCfg = ROUTE_CONFIGS[i.route]
  if (!routeCfg) return { error: 'Unknown route' }
  if (COMING_SOON_ROUTES.has(i.route)) return { error: 'This route isn\'t ready to sail yet. Coming soon.' }
  if (i.shipTier < routeCfg.minShipTier) return { error: 'Requires a Sloop or better for this route' }
  const minCrew = i.route === 'coastal' ? 1 : 2
  if (i.party.length < minCrew) {
    return { error: minCrew === 1 ? 'You need at least one crew member aboard' : 'A voyage requires at least two crew members' }
  }
  const resolved = resolveDeployedCrew(i.party)
  // Voyage crew effects: scorePct lifts the whole crew's effective stats (so
  // rolls + payouts improve), doubloonPct/xpPct scale the rewards.
  const scoreMult = 1 + resolved.voyage.scorePct / 100
  // Captain first. variantId carries the user_crew id so crew loss tracks the
  // right instance.
  const crew: CrewCard[] = resolved.perCrew.map(pc => {
    const row = i.party.find(p => p.id === pc.id)!
    return {
      collectionId: pc.id, cardId: pc.id, variantId: pc.id,
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
  const result = generateVoyageEvents(crew, i.shipTier, i.route, hasSafeVoyages(i.gauntletUpgrades))
  // slotMult, not an inline 0.8: the same captain weighting raids use.
  const totalNav = crew.reduce((s, c, k) => s + Math.round(c.dodge * slotMult(k)), 0)
  return {
    crew,
    events: result.events,
    totalDoubloons: Math.round(result.totalDoubloons * (1 + resolved.voyage.doubloonPct / 100)),
    totalGems: result.totalGems,
    crewLost: result.crewLost,
    durationMs: Math.round(computeVoyageDurationMs(getLevelFromXP(i.expeditionXP), totalNav, i.route) * gauntletVoyageSpeedMult(i.gauntletUpgrades)),
    xpBonusPct: resolved.voyage.xpPct,
    tideTurnerDrop: result.tideTurnerDrop,
    phantomHookDrop: result.phantomHookDrop,
    perfectedSigilDrop: result.perfectedSigilDrop,
  }
}

/** Has a voyage sent at `createdAt` come home? */
export function voyageBack(createdAt: string, durationMs: number | null | undefined): boolean {
  return clockNow() >= new Date(createdAt).getTime() + (durationMs ?? BASE_VOYAGE_MS)
}

export type VoyagePayout = {
  xpEarned: number
  crewXpEarned: number
  levels: { from: number; to: number; newXP: number }
  earnedBait: { type: string; qty: number }[]
  newTideTurner: boolean
  newPhantomHook: boolean
  newPerfectedSigil: boolean
  survivorIds: number[]
  booty: boolean
}

/**
 * WHAT A VOYAGE PAYS WHEN IT COMES HOME. Navigation XP and crew XP are the
 * ROUTE's own figures (ROUTE_PAYOUTS), scaled by how the one event went; crew
 * XP is tuned flat at about 200 an hour whatever the route, so the Crew Hall
 * stays the place to train hands. The three special items land only if not
 * already owned. Lost crew earn nothing. The doubloons and gems were fixed at
 * sailing and are paid as they stand.
 */
export function voyagePayout(v: {
  route: VoyageRoute
  events: { outcome?: string; booty?: boolean; jackpot?: boolean; baitDrop?: string | null }[]
  xpBonusPct: number | null | undefined
  crewIds: number[]
  crewLost: number[]
  tideTurnerDrop?: boolean
  phantomHookDrop?: boolean
  perfectedSigilDrop?: boolean
}, owned: { expeditionXP: number; tideTurner: boolean; phantomHook: boolean; perfectedSigil: boolean }): VoyagePayout {
  const ev = v.events?.[0]
  const outcomeMult = ev?.outcome === 'success' ? OUTCOME_MULT.triumph
                    : ev?.outcome === 'failure' ? OUTCOME_MULT.setback
                    : OUTCOME_MULT.success
  const baseXp = Math.round((ROUTE_PAYOUTS[v.route]?.xp ?? 650) * outcomeMult)
  const xpEarned = Math.round(baseXp * (1 + (v.xpBonusPct ?? 0) / 100))
  const newXP = owned.expeditionXP + xpEarned
  const baitDropMap = new Map<string, number>()
  for (const e of v.events ?? []) if (e.baitDrop) baitDropMap.set(e.baitDrop, (baitDropMap.get(e.baitDrop) ?? 0) + 1)
  return {
    xpEarned,
    crewXpEarned: Math.round((ROUTE_PAYOUTS[v.route]?.crewXp ?? 450) * outcomeMult),
    levels: { from: getLevelFromXP(owned.expeditionXP), to: getLevelFromXP(newXP), newXP },
    earnedBait: Array.from(baitDropMap.entries()).map(([type, qty]) => ({ type, qty })),
    newTideTurner: !!(v.tideTurnerDrop && !owned.tideTurner),
    newPhantomHook: !!(v.phantomHookDrop && !owned.phantomHook),
    newPerfectedSigil: !!(v.perfectedSigilDrop && !owned.perfectedSigil),
    survivorIds: v.crewIds.filter(id => !v.crewLost.includes(id)),
    booty: !!(ev?.booty || ev?.jackpot),
  }
}
