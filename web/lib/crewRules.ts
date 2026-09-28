// ── THE CREW RULES, WITH NO DATABASE IN THEM (Steam prep, Phase B, 2026-09-28) ──
//
// The recruit board's roll, the Blood Gem skin gamble, and what a Crew Hall
// stint pays (including the Leviathan bunk's trait offer), as plain functions
// over plain inputs. Moved out of crew/actions and lib/crewBunkSettle verbatim,
// so no odds and no payout changed. The actions keep who is asking, the
// claim-first locks and the writes; scripts/check-crew-rules.mts holds the
// rules to what the game promises.

import { groupForSlug, rollRarity, rollCrew, rollTrait, encodeTraitId, type CrewRarity } from '@/lib/crewGen'
import { isLegendaryLocked } from '@/lib/legendaryUnlocks'
import { CREW_SKINS, type CrewSkin } from '@/lib/crewSkins'
import { canBunk, isLeviathanSlot, stintDone, stintXP } from '@/lib/crewBunks'
import { netTraitStats, traitLabel } from '@/lib/crewEffects'
import { rngNext } from '@/lib/rng'

// ── The card catalogue ──────────────────────────────────────────────────────

export type CardRow = { id: number; name: string; filename: string; slug: string; power: number; dodge: number; fortune: number }
export type CardMeta = { name: string; filename: string; slug: string; power: number; dodge: number; fortune: number }

/** The catalogue as portrait pools by group (1 common .. 4 legendary) and a
 *  lookup for name, art and the species' stat profile. */
export function cardPools(cards: CardRow[]): { byGroup: Record<CrewRarity, number[]>; meta: Map<number, CardMeta> } {
  const byGroup: Record<CrewRarity, number[]> = { 1: [], 2: [], 3: [], 4: [] }
  const meta = new Map<number, CardMeta>()
  for (const c of cards) {
    meta.set(c.id, { name: c.name, filename: c.filename, slug: c.slug, power: c.power, dodge: c.dodge, fortune: c.fortune })
    const g = groupForSlug(c.slug)
    if (g) byGroup[g].push(c.id)
  }
  return { byGroup, meta }
}

// ── The recruit board ───────────────────────────────────────────────────────

export type RolledRecruit = { cardId: number; rarity: CrewRarity; power: number; dodge: number; fortune: number; effects: string[] }

/**
 * ROLL A RECRUIT BOARD of `size` faces at `weights` (FREE_WEIGHTS has no
 * Legendary at all; GEM_WEIGHTS and the blood tiers do).
 *
 * The CAMPAIGN GATE drops a legendary whose chapter is not cleared for this
 * captain (Catfish and Doby are never gated, so the group is never empty). An
 * empty rolled group falls back a rarity. `guaranteeLegendary` is the one-shot
 * gift: slot 0 is a Legendary, pinned to `legendarySlug` when that one is in
 * reach, else drawn from whichever are; the gate still decides what is.
 */
export function rollRecruitBoard(opts: {
  size: number
  weights: readonly [number, number, number, number]
  byGroup: Record<CrewRarity, number[]>
  meta: Map<number, CardMeta>
  legendaryUnlocks: readonly string[]
  guaranteeLegendary?: boolean
  legendarySlug?: string | null
}): RolledRecruit[] {
  const { size, weights, byGroup, meta, legendaryUnlocks, guaranteeLegendary = false, legendarySlug = null } = opts
  const group4 = byGroup[4].filter(id => !isLegendaryLocked(meta.get(id)?.slug ?? '', legendaryUnlocks))
  const poolFor = (r: CrewRarity) => (r === 4 ? group4 : byGroup[r])
  const out: RolledRecruit[] = []
  for (let slot = 0; slot < size; slot++) {
    let rarity = guaranteeLegendary && slot === 0 ? (4 as CrewRarity) : rollRarity(weights)
    // Fall back to a populated group if the rolled one is empty (defensive).
    while (poolFor(rarity).length === 0 && rarity > 1) rarity = (rarity - 1) as CrewRarity
    const pool = poolFor(rarity)
    if (pool.length === 0) continue
    const pinned = guaranteeLegendary && slot === 0 && rarity === 4 && legendarySlug
      ? pool.find(id => (meta.get(id)?.slug ?? '').toLowerCase() === legendarySlug.toLowerCase())
      : undefined
    const cardId = pinned ?? pool[Math.floor(rngNext() * pool.length)]
    const m = meta.get(cardId)
    const c = rollCrew(cardId, rarity, { power: m?.power ?? 1, dodge: m?.dodge ?? 1, fortune: m?.fortune ?? 1 })
    out.push({ cardId: c.cardId, rarity: c.rarity, power: c.power, dodge: c.dodge, fortune: c.fortune, effects: c.effects })
  }
  return out
}

// ── The Blood Gem skin gamble ───────────────────────────────────────────────

/** One skin the captain does not own, from the NON-legendary pool (Rare and
 *  Epic crews). Null once every one is owned: the gamble is dead then. */
export function pickBloodSkin(owned: readonly string[]): CrewSkin | null {
  const have = new Set(owned)
  const pool = CREW_SKINS.filter(s => groupForSlug(s.slug) !== 4 && !have.has(s.id))
  return pool.length ? pool[Math.floor(rngNext() * pool.length)] : null
}

// ── The Crew Hall's stints ──────────────────────────────────────────────────

export type BunkRow = {
  id: number
  crew_id: number
  since: string
  rate: number | null
  cap: number | null
  /** 0-5. Slot 5 is the Leviathan bunk. */
  slot: number | null
}

/** The terms this bunk actually runs on: what was agreed, or the live values
 *  for a row that predates the columns. One helper so display, locking and
 *  payout can never disagree about a given bunk. */
export function bunkTerms(row: BunkRow, liveRate: number, liveCap: number) {
  return { rate: row.rate ?? liveRate, cap: row.cap ?? liveCap }
}

/** The stints that have FINISHED by `nowMs`, each on its own terms. There is
 *  no partial payout and no early exit. */
export function finishedStints(rows: BunkRow[], rate: number, capHours: number, nowMs: number): BunkRow[] {
  return rows.filter(r => stintDone(r.since, nowMs, bunkTerms(r, rate, capHours).cap))
}

/** What each finished stint pays in XP. A hand at the level ceiling is freed
 *  and paid nothing, so they are left out here (and still freed by the caller). */
export function stintPayouts(claimed: BunkRow[], xpByCrew: Map<number, number>, rate: number, capHours: number): { id: number; xp: number }[] {
  return claimed
    .filter(r => canBunk(xpByCrew.get(r.crew_id) ?? 0))
    .map(r => { const t = bunkTerms(r, rate, capHours); return { id: r.crew_id, xp: stintXP(t.rate, t.cap) } })
}

export type TraitUpgrade = {
  crewId: number
  before: { power: number; dodge: number; fortune: number }
  after: { power: number; dodge: number; fortune: number }
  beforeLabel: string
  afterLabel: string
  /** Which stats actually moved, for the reveal to highlight. */
  gained: { power: boolean; dodge: boolean; fortune: boolean }
  /** An OFFER awaiting an answer rather than something already written. */
  pending?: boolean
}

/** A drawn trait of 0/0/0 encodes to null, which is indistinguishable from "no
 *  offer". Park this sentinel instead so an offer of nothing is still an offer
 *  the captain has to answer. */
export const NEUTRAL_OFFER = 's:0,0,0'

/** Is this bunk the Leviathan's (its stint ends in a trait offer)? */
export const leviathanBunk = (r: BunkRow) => isLeviathanSlot(r.slot)

/**
 * THE LEVIATHAN RE-CUT: roll a deep trait and OFFER it. The draw is flat, so a
 * roll can be worse than what the hand carries and the claim is a real choice.
 * Returns what to park on user_crew.pending_trait and the reveal, or null when
 * an offer is already open (two stints cannot stack; the older one stands).
 */
export function leviathanOffer(c: { id: number; rarity: number | null; effects: string[] | null; pending_trait: string | null }): { parked: string; upgrade: TraitUpgrade } | null {
  if (c.pending_trait) return null
  const before = netTraitStats(c.effects ?? [])
  const rolled = rollTrait((c.rarity ?? 1) as CrewRarity, true)
  const parked = encodeTraitId(rolled) ?? NEUTRAL_OFFER
  return {
    parked,
    upgrade: {
      crewId: c.id, before, after: rolled,
      gained: { power: rolled.power > before.power, dodge: rolled.dodge > before.dodge, fortune: rolled.fortune > before.fortune },
      beforeLabel: traitLabel(before) || 'No trait',
      afterLabel: traitLabel(rolled) || 'No trait',
      pending: true,
    },
  }
}
