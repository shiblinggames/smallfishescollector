// Resolve a deployed crew party into effect-adjusted stat totals.
//
// This is the single seam Phase 2 cuts at: the voyage + raid systems call this
// instead of summing raw card stats. It folds in every stat-affecting effect:
//   - passive flat + percent (the crew's own traits)
//   - team auras (Quartermaster/Helmsman/Mascot/Albatross apply to everyone)
//   - conditional/synergy (Lone Wolf, Pack Hunter, Prima Donna) evaluated
//     against the actual party + each crew's ship slot.
// It ALSO pre-aggregates the context modifiers (raid damage/crit/survive/first
// strike, voyage score/doubloons/xp) so Stage 2b can consume them without
// re-walking the effect list.
//
// Captain (slot 0) contributes at 1.0x, other crew at 0.8x — same as the old
// system, so balance is preserved.

import { resolveEffects } from './crewEffects'

export interface DeployedCrew {
  id: number
  slot: number // 0 = captain, 1+ = crew
  rarity: number // == fish group; used for same-zone synergy
  power: number
  dodge: number
  fortune: number
  effects: string[]
}

export interface ResolvedCrew {
  id: number
  slot: number
  power: number
  dodge: number
  fortune: number
}

export interface RaidMods {
  damagePct: number
  damageTakenPct: number
  critPct: number
  firstStrike: boolean
}
export interface VoyageMods {
  scorePct: number
  doubloonPct: number
  xpPct: number
}

export interface ResolvedParty {
  perCrew: ResolvedCrew[]
  /** Captain/crew-weighted totals, effects applied. */
  totals: { power: number; dodge: number; fortune: number }
  /** Aggregated context modifiers for Stage 2b (raid combat / voyage rewards). */
  raid: RaidMods
  voyage: VoyageMods
}

const CAPTAIN_MULT = 1
const CREW_MULT = 0.8

function slotMult(slot: number): number {
  return slot === 0 ? CAPTAIN_MULT : CREW_MULT
}

/** Turn a deployed party into effect-adjusted per-crew stats + weighted totals,
 *  plus the aggregated raid/voyage modifiers. Nav-level bonuses are applied by
 *  the caller (raids add them, voyages don't), exactly as today. */
export function resolveDeployedCrew(party: DeployedCrew[]): ResolvedParty {
  const n = party.length

  const raid: RaidMods = { damagePct: 0, damageTakenPct: 0, critPct: 0, firstStrike: false }
  const voyage: VoyageMods = { scorePct: 0, doubloonPct: 0, xpPct: 0 }

  // ── Pass 1: team auras (apply to every crew member, incl. the bearer) ──────
  const auraFlat = { power: 0, dodge: 0, fortune: 0 }
  const auraPct = { power: 0, dodge: 0, fortune: 0 }
  for (const c of party) {
    for (const e of resolveEffects(c.effects)) {
      if (e.scope !== 'aura') continue
      if (e.flat) { auraFlat.power += e.flat.power ?? 0; auraFlat.dodge += e.flat.dodge ?? 0; auraFlat.fortune += e.flat.fortune ?? 0 }
      if (e.pct) { auraPct.power += e.pct.power ?? 0; auraPct.dodge += e.pct.dodge ?? 0; auraPct.fortune += e.pct.fortune ?? 0 }
      if (e.raid) addRaid(raid, e.raid)       // e.g. War Drummer (team raid damage)
      if (e.voyage) addVoyage(voyage, e.voyage) // e.g. Shanty Singer (team voyage score)
    }
  }

  // ── Pass 2: per-crew flat/pct (own passive + auras + conditional grants) ───
  const perCrew: ResolvedCrew[] = party.map((c, i) => {
    const flat = { power: auraFlat.power, dodge: auraFlat.dodge, fortune: auraFlat.fortune }
    const pct = { power: auraPct.power, dodge: auraPct.dodge, fortune: auraPct.fortune }

    for (const e of resolveEffects(c.effects)) {
      if (e.scope === 'always') {
        if (e.flat) addStat(flat, e.flat)
        if (e.pct) addStat(pct, e.pct)
      } else if (e.scope === 'conditional') {
        if (conditionHolds(e.cond, i, c, party, n)) {
          // same-zone synergy scales by the number of matching allies
          const mult = e.cond === 'same_zone_ally' ? sameZoneAllies(i, c, party) : 1
          if (e.flat) addStat(flat, e.flat, mult)
          if (e.pct) addStat(pct, e.pct, mult)
          if (e.voyage) addVoyage(voyage, e.voyage) // e.g. Flagship (captain only)
          if (e.raid) addRaid(raid, e.raid)
        }
      } else if (e.scope === 'raid' && e.raid) {
        addRaid(raid, e.raid)
      } else if (e.scope === 'voyage' && e.voyage) {
        addVoyage(voyage, e.voyage)
      }
    }

    return {
      id: c.id,
      slot: c.slot,
      power: clampStat((c.power + flat.power) * (1 + pct.power / 100)),
      dodge: clampStat((c.dodge + flat.dodge) * (1 + pct.dodge / 100)),
      fortune: clampStat((c.fortune + flat.fortune) * (1 + pct.fortune / 100)),
    }
  })

  const totals = perCrew.reduce(
    (s, c) => ({
      power: s.power + Math.round(c.power * slotMult(c.slot)),
      dodge: s.dodge + Math.round(c.dodge * slotMult(c.slot)),
      fortune: s.fortune + Math.round(c.fortune * slotMult(c.slot)),
    }),
    { power: 0, dodge: 0, fortune: 0 },
  )

  return { perCrew, totals, raid, voyage }
}

// ── helpers ────────────────────────────────────────────────────────────────

type StatBag = { power: number; dodge: number; fortune: number }

function addStat(into: StatBag, from: Partial<StatBag>, mult = 1) {
  into.power += (from.power ?? 0) * mult
  into.dodge += (from.dodge ?? 0) * mult
  into.fortune += (from.fortune ?? 0) * mult
}

function addRaid(into: RaidMods, from: { damagePct?: number; damageTakenPct?: number; critPct?: number; firstStrike?: boolean }) {
  into.damagePct += from.damagePct ?? 0
  into.damageTakenPct += from.damageTakenPct ?? 0
  into.critPct += from.critPct ?? 0
  if (from.firstStrike) into.firstStrike = true
}

function addVoyage(into: VoyageMods, from: { scorePct?: number; doubloonPct?: number; xpPct?: number }) {
  into.scorePct += from.scorePct ?? 0
  into.doubloonPct += from.doubloonPct ?? 0
  into.xpPct += from.xpPct ?? 0
}

function clampStat(v: number): number {
  return Math.max(1, Math.round(v))
}

function sameZoneAllies(i: number, c: DeployedCrew, party: DeployedCrew[]): number {
  return party.filter((o, j) => j !== i && o.rarity === c.rarity).length
}

function conditionHolds(
  cond: string | undefined,
  i: number,
  c: DeployedCrew,
  party: DeployedCrew[],
  n: number,
): boolean {
  switch (cond) {
    case 'small_crew': return n <= 2
    case 'captain': return i === 0
    case 'not_captain': return i !== 0
    case 'same_zone_ally': return sameZoneAllies(i, c, party) > 0
    default: return false
  }
}
