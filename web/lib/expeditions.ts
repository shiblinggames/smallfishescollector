import { SHIPS } from './ships'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShipStats {
  name: string
  image: string
  durability: number
  speed: number
  crewSlots: number
  minDamage: number
}

export interface CrewCard {
  collectionId: number
  cardId: number
  variantId: number
  name: string
  slug: string
  filename: string
  rarity: string
  power: number
  dodge: number
  fortune: number
  /** Optional species name for trait-flavor lookup when `name` is a nickname. */
  traitName?: string
}

export interface TotalCrewStats {
  count: number
  power: number
  dodge: number
  fortune: number
}

export interface RunBuff {
  source: string
  effect: 'power' | 'dodge' | 'fortune' | 'durability'
  value: number
}

// ── Ship stats ────────────────────────────────────────────────────────────────

// name and image come from ships.ts — combat-specific stats defined here only.
// Used by raids and daily voyages (for displayed crew score, captain bonuses).
//
// HP curve steepens at the high end (tuned 2026-05-26): each mid-to-late
// upgrade should buy a felt-bigger survivability bump than its predecessor,
// so the 22k→80k→200k cost climb feels rewarded. Step gains: +7, +8, +10,
// +15, +25, +40. Galleon (+42% HP vs Brigantine) and Man-o-War (+47% HP vs
// Galleon) are the headline endgame jumps. Early game (Rowboat → Schooner)
// is unchanged.
const EXPEDITION_COMBAT_STATS: Record<number, Omit<ShipStats, 'name' | 'image'>> = {
  // crewSlots bumped +1 across the board (2026-06-08) now that voyage and
  // raid have independent parties — without this, a tier-0 player had only
  // 1 slot per track (1 voyage, 1 raid) and couldn't field a real party on
  // either. New floor of 2 means every ship can deploy at least a captain
  // + one crewmate per track, scaling up smoothly to a 6-slot endgame Man-
  // o-War. Roster capacity (lib/crewCapacity) is unchanged.
  0: { durability:  20, speed: 2,  crewSlots: 2, minDamage: 1  },
  1: { durability:  27, speed: 3,  crewSlots: 2, minDamage: 2  },
  2: { durability:  35, speed: 4,  crewSlots: 3, minDamage: 3  },
  3: { durability:  45, speed: 5,  crewSlots: 3, minDamage: 4  },
  4: { durability:  60, speed: 6,  crewSlots: 4, minDamage: 6  },
  5: { durability:  85, speed: 8,  crewSlots: 5, minDamage: 8  },
  6: { durability: 125, speed: 11, crewSlots: 6, minDamage: 11 },
}

export const EXPEDITION_SHIP_STATS: Record<number, ShipStats> = Object.fromEntries(
  SHIPS.map(s => [s.tier, { name: s.name, image: s.imageUrl ?? '', ...EXPEDITION_COMBAT_STATS[s.tier] }])
)

// ── Raid item slot cap by ship tier ──────────────────────────────────────────
// How many raid items the captain can equip at once. Scales with the ship —
// bigger hulls have the deck space + the crew to keep more kit ready in a
// fight. Hand-tuned curve mirrors crew slots but caps lower so an endgame
// loadout can't stack every Epic + Legendary effect at once:
//   tier 0/1 Rowboat / Dinghy →   1
//   tier 2/3 Sloop / Schooner →   2
//   tier 4   Brigantine        →   3   (the previous global default)
//   tier 5/6 Galleon / Man-o-War → 4
const RAID_ITEM_SLOTS: Record<number, number> = {
  0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 4, 6: 4,
}

export function raidItemSlotsForTier(tier: number): number {
  return RAID_ITEM_SLOTS[Math.max(0, Math.min(tier, 6))] ?? 3
}

// ── Raid sink penalty ─────────────────────────────────────────────────────────
// If your ship sinks in a real raid you owe a repair fee before you can raid
// again. Scales by ship tier (a bigger boat costs more to patch up). Moderate
// scale: roughly one good raid's take at mid tiers, recoverable.
const RAID_REPAIR_COST: Record<number, number> = {
  0: 50,
  1: 90,
  2: 150,
  3: 240,
  4: 350,
  5: 500,
  6: 700,
}

export function raidRepairCost(shipTier: number): number {
  return RAID_REPAIR_COST[shipTier] ?? RAID_REPAIR_COST[0]
}

// ── Crew variant stat boosts ──────────────────────────────────────────────────

const MYTHIC_VARIANTS = new Set(['Kraken', 'Davy Jones', 'Golden Age', 'Wanted', 'Maelstrom', 'GOD'])

export function applyVariantBoosts(
  base: { power: number; dodge: number; fortune: number },
  variantName: string,
  mythic: { power: number; dodge: number; fortune: number },
): { power: number; dodge: number; fortune: number } {
  if (MYTHIC_VARIANTS.has(variantName)) return { ...mythic }

  const result = { ...base }
  type S = 'power' | 'dodge' | 'fortune'
  const [primary, secondary, tertiary] = (['power', 'dodge', 'fortune'] as S[])
    .sort((a, b) => base[b] - base[a])

  switch (variantName) {
    case 'Gold':
      result[primary] += 4
      break
    case 'Pearl':
      result[primary] += 4
      result[secondary] += 3
      break
    case 'Holographic':
      result[secondary] += 4
      result[tertiary] += 3
      break
    case 'Ghost':
      result.power += 5; result.dodge += 4; result.fortune += 3
      break
    case 'Shadow':
      result.power += 4; result.dodge += 4; result.fortune += 4
      break
    case 'Prismatic':
      result.power += 3; result.dodge += 4; result.fortune += 5
      break
  }

  return result
}

export function computeTotalCrewStats(crew: CrewCard[]): TotalCrewStats {
  return crew.reduce(
    (totals, card, i) => {
      const mult = i === 0 ? 1.0 : 0.8
      return {
        count:   totals.count   + 1,
        power:   totals.power   + Math.round(card.power   * mult),
        dodge:   totals.dodge   + Math.round(card.dodge   * mult),
        fortune: totals.fortune + Math.round(card.fortune * mult),
      }
    },
    { count: 0, power: 0, dodge: 0, fortune: 0 },
  )
}

// ── Voyage Score ──────────────────────────────────────────────────────────────
// A 0–100 readiness rating that mirrors how the voyage engine actually resolves
// events: each event type is decided by a SINGLE stat roll — encounter = power/55
// (capped 0.80), discovery = fortune/45, danger = dodge/28. Averaging the three
// rates gives the expected success rate across event types. Because each rate
// caps at its own threshold, only a strong, well-rounded crew nears 100; a crew
// that dumps one stat fails that event type, exactly as the engine plays out.
// (Routes weight these event types differently — coastal leans fortune, triangle
// leans power+dodge — so this is a generic readiness gauge, not per-route.)

export function computeVoyageScore(power: number, dodge: number, fortune: number): number {
  const powerRate   = Math.min(power   / 55, 0.80)
  const fortuneRate = Math.min(fortune / 45, 1)
  const dodgeRate   = Math.min(dodge   / 28, 1)
  // Normalise by the max achievable sum (0.80 + 1 + 1 = 2.8), not 3, so a crew
  // that maxes every event type reads exactly 100. (Power's 0.80 cap otherwise
  // pins the ceiling at 93 — the "/100" framing would never be reachable.)
  return Math.min(100, Math.round(((powerRate + fortuneRate + dodgeRate) / 2.8) * 100))
}

// ── Combat Rating ─────────────────────────────────────────────────────────────
// Predicts raid combat power. Anchored in the raid damage formula
// (powerMax = shipMin + power/4, with crew-aware hit floor) plus dodge-boosted
// effective HP. Input values should already include nav-level bonuses.

export interface CombatRating {
  /** Raw average damage per shot (after crit). Kept for the breakdown's
   *  fine-print line so math-curious players see the underlying number. */
  offense: number
  /** Raw effective HP (HP × dodge boost × bulwark + fortune sustain). Same
   *  story — surfaced as fine print in the breakdown. */
  defense: number
  /** 0–100 sub-score: Offense vs OFFENSE_BENCHMARK. */
  offenseScore: number
  /** 0–100 sub-score: Defense vs DEFENSE_BENCHMARK. */
  defenseScore: number
  /** 0–100 overall Raid Score on the shared nautical ladder (see RANK_TITLES).
   *  Average of the two sub-scores — both axes matter equally in a raid. */
  score: number
}

// ── Shared rank ladder ───────────────────────────────────────────────────────
// One vocabulary for both scores: Voyage Score (0–100) and Raid Score (0–100).
// Reuses the seven nautical titles that used to live on nav level — there's
// only one set of titles in the game so players don't juggle two ladders.

export const RANK_TITLES: { min: number; title: string }[] = [
  { min: 90, title: 'Legendary Seafarer' },
  { min: 75, title: 'Admiral'            },
  { min: 60, title: 'Commodore'          },
  { min: 45, title: 'Sea Captain'        },
  { min: 30, title: 'Navigator'          },
  { min: 15, title: 'First Mate'         },
  { min: 0,  title: 'Deckhand'           },
]

export function getRankTitle(score: number): string {
  return RANK_TITLES.find(t => score >= t.min)?.title ?? 'Deckhand'
}

// Per-axis benchmarks for a no-compromises endgame loadout (tier-6 ship + Nav
// 100 + 5 maxed Legendaries + Bulwark + Keen Cutlass):
//
//   avgHit ≈ 31 × 1.30 crit = 40           → OFFENSE_BENCHMARK
//   shipHP 190 × 1.5 dodge × 1.25 bulwark
//     + 65/4 fortune sustain ≈ 372         → DEFENSE_BENCHMARK
//
// Each axis is shown as a 0-100 sub-score in the breakdown so Offense and
// Defense are directly comparable — different stats but same scale — and the
// overall Raid Score is just the average of the two. Revisit only when new
// CONTENT raises a ceiling: new ship tier, new rarity above Legendary, Nav
// cap > 100, or new high-pct crew effects. Boss difficulty doesn't change
// this — the score is your setup's strength, not the fight in front of you.
export const OFFENSE_BENCHMARK = 40
export const DEFENSE_BENCHMARK = 370

// Net raid combat modifiers from crew effects (Stage 2b). Aggregated by
// resolveDeployedCrew; passed into the damage profile + rating + live combat.
export interface RaidMods {
  damagePct: number
  damageTakenPct: number
  critPct: number
  firstStrike: boolean
}

export interface RaidDamageProfile { hitMin: number; powerMax: number; critMax: number }

/** Single source of truth for raid shot damage from crew power + ship min
 *  damage. `damagePct` is the net crew raid-damage modifier (Berserker /
 *  War Drummer minus Landlocked). Combat rolls, the rating and the ledger all
 *  call this so they never drift. */
export function raidDamageProfile(totalPower: number, shipMinDamage: number, damagePct = 0): RaidDamageProfile {
  const base     = shipMinDamage + 2 + Math.floor(totalPower / 4)
  const powerMax = Math.max(shipMinDamage, Math.round(base * (1 + damagePct / 100)))
  const hitMin   = Math.max(shipMinDamage, Math.floor(powerMax * 0.4))
  const critMax  = Math.round(powerMax * 1.5)
  return { hitMin, powerMax, critMax }
}

export function computeCombatRating(
  totalPower: number,
  totalDodge: number,
  totalFortune: number,
  shipDurability: number,
  shipMinDamage: number,
  raidMods?: Partial<RaidMods>,
): CombatRating {
  const { hitMin, powerMax } = raidDamageProfile(totalPower, shipMinDamage, raidMods?.damagePct ?? 0)
  const avgHit   = (hitMin + powerMax) / 2
  // Offense = Power (shot damage) + crew crit effects (Keen Cutlass). Raid crit
  // itself is the skill aim-bar, not a stat, so Fortune is NOT credited as crit.
  const critRate = (raidMods?.critPct ?? 0) / 100
  const offense  = Math.round(avgHit * (1 + critRate))

  // Dodge is the real secondary: in live combat it buys turn order, action speed
  // and dodge success — modelled as effective HP (scaled to reachable totals so
  // it matters mid-game). Fortune is utility in raids (repair-kit heals + loot),
  // so it folds in as a small sustain nudge, not raw combat power.
  const dodgeBoost = Math.min(totalDodge / 120, 0.5)
  const takenMult  = Math.max(0.1, 1 - (raidMods?.damageTakenPct ?? 0) / 100)
  const defense    = Math.round(shipDurability * (1 + dodgeBoost) * takenMult) + Math.round(totalFortune * 0.25)

  const offenseScore = Math.min(100, Math.round((offense / OFFENSE_BENCHMARK) * 100))
  const defenseScore = Math.min(100, Math.round((defense / DEFENSE_BENCHMARK) * 100))
  return {
    offense,
    defense,
    offenseScore,
    defenseScore,
    // Average of the two — both axes matter equally in a raid. Living through
    // a boss without dealing damage just stalls; one-shotting yourself dead
    // doesn't clear the fight either.
    score: Math.round((offenseScore + defenseScore) / 2),
  }
}

// ── Rarity colors (used by crew picker / loadout views) ───────────────────────

export const RARITY_COLORS: Record<string, string> = {
  common:    '#8a8784',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#f0c040',
  mythic:    '#ff6b35',
}
