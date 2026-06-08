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

import { netTraitStats } from './crewEffects'
import { applyLevelBonuses } from './crewLevel'

export interface DeployedCrew {
  id: number
  slot: number // 0 = captain, 1+ = crew
  rarity: number // == fish group; used for same-zone synergy
  power: number
  dodge: number
  fortune: number
  effects: string[]
  /** Crew XP. Drives level-derived stat bonuses (folded into the per-crew base
   *  before effects). Required — all loaders (`loadDeployedParty` + the client
   *  picker mappings) populate it from `user_crew.xp`. */
  xp: number
  /** Species slug (lower-cased). Drives crew-class resolution via
   *  `classForSlug()` for the raid Special chooser. Required — all
   *  loaders (`loadDeployedParty` + every client picker mapping) populate
   *  it from `cards.slug`. Empty string is acceptable for older callers
   *  that don't have it; the class lookup returns null in that case. */
  slug: string
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

/** Turn a deployed party into effect-adjusted per-crew stats + weighted totals.
 *  Simplified 2026-06-08: traits are stat-only now (each crew has one trait
 *  encoded as a {power,dodge,fortune} triple), so the old aura/conditional/
 *  raid/voyage passes are gone. raid + voyage mods stay on the return type
 *  for API stability but they're always zero. Nav-level bonuses are applied
 *  by the caller (raids add them, voyages don't), exactly as today. */
export function resolveDeployedCrew(party: DeployedCrew[]): ResolvedParty {
  // raid + voyage mods used to aggregate from aura/conditional/raid/voyage
  // effects across the party. Those don't exist any more — zeros are correct
  // and the consumers handle a no-op modifier transparently.
  const raid: RaidMods = { damagePct: 0, damageTakenPct: 0, critPct: 0, firstStrike: false }
  const voyage: VoyageMods = { scorePct: 0, doubloonPct: 0, xpPct: 0 }

  const perCrew: ResolvedCrew[] = party.map((c) => {
    // Level bonus folds into the base first, then the crew's stat-only trait
    // adds onto the level-adjusted floor.
    const leveled = c.xp > 0
      ? applyLevelBonuses({ power: c.power, dodge: c.dodge, fortune: c.fortune }, c.xp)
      : { power: c.power, dodge: c.dodge, fortune: c.fortune }
    const t = netTraitStats(c.effects)
    return {
      id: c.id,
      slot: c.slot,
      power:   clampStat(leveled.power   + t.power),
      dodge:   clampStat(leveled.dodge   + t.dodge),
      fortune: clampStat(leveled.fortune + t.fortune),
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

function clampStat(v: number): number {
  return Math.max(1, Math.round(v))
}
