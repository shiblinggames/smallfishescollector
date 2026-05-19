import { SHIPS } from './ships'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShipStats {
  name: string
  image: string
  durability: number
  speed: number
  armor: number
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
}

export interface TotalCrewStats {
  count: number
  power: number
  dodge: number
  fortune: number
}

export interface RunBuff {
  source: string
  effect: 'power' | 'dodge' | 'fortune' | 'armor' | 'durability'
  value: number
}

// ── Ship stats ────────────────────────────────────────────────────────────────

// name and image come from ships.ts — combat-specific stats defined here only.
// Used by raids and daily voyages (for displayed crew score, captain bonuses).
const EXPEDITION_COMBAT_STATS: Record<number, Omit<ShipStats, 'name' | 'image'>> = {
  0: { durability: 20, speed: 2,  armor: 1, crewSlots: 1, minDamage: 1  },
  1: { durability: 27, speed: 3,  armor: 1, crewSlots: 1, minDamage: 2  },
  2: { durability: 35, speed: 4,  armor: 2, crewSlots: 2, minDamage: 3  },
  3: { durability: 45, speed: 5,  armor: 3, crewSlots: 2, minDamage: 4  },
  4: { durability: 55, speed: 6,  armor: 4, crewSlots: 3, minDamage: 6  },
  5: { durability: 70, speed: 8,  armor: 5, crewSlots: 4, minDamage: 8  },
  6: { durability: 90, speed: 11, armor: 8, crewSlots: 5, minDamage: 11 },
}

export const EXPEDITION_SHIP_STATS: Record<number, ShipStats> = Object.fromEntries(
  SHIPS.map(s => [s.tier, { name: s.name, image: s.imageUrl ?? '', ...EXPEDITION_COMBAT_STATS[s.tier] }])
)

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
// Predicts daily-voyage success rate. Anchored in the actual thresholds used
// by voyageEvents.ts (rollPower: power/55 capped 0.80; rollFortune: 45;
// rollDodge: 28). Returns a 0–100 number that reads as "% safe on hard
// events" — a 100 crew passes every roll reliably.

export function computeVoyageScore(power: number, dodge: number, fortune: number): number {
  const powerRate   = Math.min(power   / 55, 0.80)
  const fortuneRate = Math.min(fortune / 45, 1)
  const dodgeRate   = Math.min(dodge   / 28, 1)
  return Math.round(((powerRate + fortuneRate + dodgeRate) / 3) * 100)
}

// ── Combat Rating ─────────────────────────────────────────────────────────────
// Predicts raid combat power. Anchored in the raid damage formula
// (powerMax = shipMin + power/4, with crew-aware hit floor) plus dodge-boosted
// effective HP. Input values should already include nav-level bonuses.

export interface CombatRating {
  offense: number
  defense: number
  total: number
}

export function computeCombatRating(
  totalPower: number,
  totalDodge: number,
  totalFortune: number,
  shipDurability: number,
  shipMinDamage: number,
): CombatRating {
  const powerMax = shipMinDamage + 2 + Math.floor(totalPower / 4)
  const hitMin   = Math.max(shipMinDamage, Math.floor(powerMax * 0.4))
  const avgHit   = (hitMin + powerMax) / 2
  // Fortune doesn't affect raid crit (skill-based aim bar handles that), but
  // keeping it in the rating gives players a reason to balance the stat.
  const critRate = Math.min(totalFortune / 2, 50) / 100
  const offense  = Math.round(avgHit * (1 + critRate))

  const dodgeBoost = Math.min(totalDodge / 200, 0.5)
  const defense    = Math.round(shipDurability * (1 + dodgeBoost))

  return {
    offense,
    defense,
    total: offense + Math.round(defense * 0.5),
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
