import { SHIPS, MIN_SHIP_TIER, MAX_SHIP_TIER } from './ships'

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
// Galleon) are the headline endgame jumps. The early game is unchanged; it
// just starts at the Sloop now.
//
// minDamage curve steepened to match (tuned 2026-06-20): it feeds the raid
// damage base (shipMin + 2 + power/4) AND floors hitMin, but at endgame crew
// power it was a rounding error — Man-o-War out-damaged a Brigantine by only
// ~9%, so hulls had no firepower identity. The high tiers now accelerate
// (steps +1/+2/+3/+5/+6) so the 200k hull reads as real guns (~29% over a
// Brigantine at 120 crew power) without inflating the early raids, where the
// low tiers barely move. Crew power is still the dominant scaler.
//
// STARTS AT TIER 2. The Rowboat and Dinghy came off the ladder (see lib/ships)
// and the Sloop drops to ONE crew seat — as the free starting hull it should
// hand out a bench, not a party. That also fixes something the old curve did
// badly: every rung now moves the crew count, where before four hulls carried a
// captain from 1 seat to 2 and two of them changed nothing but hit points.
const EXPEDITION_COMBAT_STATS: Record<number, Omit<ShipStats, 'name' | 'image'>> = {
  2: { durability:  35, speed: 4,  crewSlots: 1, minDamage: 4  },
  3: { durability:  45, speed: 5,  crewSlots: 2, minDamage: 6  },
  4: { durability:  60, speed: 6,  crewSlots: 3, minDamage: 9  },
  5: { durability:  85, speed: 8,  crewSlots: 4, minDamage: 14 },
  6: { durability: 125, speed: 11, crewSlots: 5, minDamage: 20 },
}

export const EXPEDITION_SHIP_STATS: Record<number, ShipStats> = Object.fromEntries(
  SHIPS.map(s => [s.tier, { name: s.name, image: s.imageUrl ?? '', ...EXPEDITION_COMBAT_STATS[s.tier] }])
)

// ── LEGACY TIERS 0 AND 1 STILL ANSWER ────────────────────────────────────────
// The Rowboat and the Dinghy are gone, but `profiles.ship_tier` is a stored
// number and 0 was its default for the whole of the game's life. A migration
// lifts every captain to the Sloop; this covers the row that migration has not
// reached yet, the profile created from an older default, and the fifteen-odd
// call sites that read `EXPEDITION_SHIP_STATS[tier]` or fall back to `[0]`.
//
// Aliases rather than a clamp at each of those sites, because a clamp is
// something a future call site can forget to do. Reading a tier that no longer
// exists should quietly mean "the bottom of the ladder", and this is the one
// place that decides what the bottom is.
EXPEDITION_SHIP_STATS[0] = EXPEDITION_SHIP_STATS[MIN_SHIP_TIER]
EXPEDITION_SHIP_STATS[1] = EXPEDITION_SHIP_STATS[MIN_SHIP_TIER]

// ── Raid item slot cap by ship tier ──────────────────────────────────────────
// How many raid items the captain can equip at once. Scales with the ship —
// bigger hulls have the deck space + the crew to keep more kit ready in a
// fight. Hand-tuned curve mirrors crew slots but caps lower so an endgame
// loadout can't stack every Epic + Legendary effect at once:
//   tier 2   Sloop             →   1
//   tier 3   Schooner           →   2
//   tier 4   Brigantine         →   3   (the previous global default)
//   tier 5/6 Galleon / Man-o-War → 4
//
// The Sloop mounts ONE. It is the free hull now, and a starting captain with
// two effects running every fight has been handed the interesting half of the
// system before earning any of it.
const RAID_ITEM_SLOTS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 4,
}

export function raidItemSlotsForTier(tier: number): number {
  return RAID_ITEM_SLOTS[Math.max(MIN_SHIP_TIER, Math.min(tier, MAX_SHIP_TIER))] ?? 1
}

// ── Raid sink penalty ─────────────────────────────────────────────────────────
// If your ship sinks in a real raid you owe a repair fee before you can raid
// again. Scales by ship tier (a bigger boat costs more to patch up). Moderate
// scale: roughly one good raid's take at mid tiers, recoverable.
const RAID_REPAIR_COST: Record<number, number> = {
  2: 150,
  3: 240,
  4: 350,
  5: 500,
  6: 700,
}

export function raidRepairCost(shipTier: number): number {
  // Clamped rather than defaulted. A legacy tier of 0 or 1 is a Sloop now, and
  // falling through to the cheapest entry would have quietly charged the
  // hardest-to-reach captains the least.
  return RAID_REPAIR_COST[Math.max(MIN_SHIP_TIER, Math.min(shipTier, MAX_SHIP_TIER))]
    ?? RAID_REPAIR_COST[MIN_SHIP_TIER]
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

/**
 * FORTUNE'S PULL ON ITEM DROPS. Caps at 2x.
 *
 * Fortune used to do nothing at all for drops, in either mode, while the raid
 * stat panel told players it meant "better odds at rare loot". It scaled the
 * doubloon payout and nothing else. This is the number that makes the promise
 * true, and it is deliberately a HARD 2x rather than the uncapped 1 + f/75 the
 * doubloon multiplier uses: coin inflating is survivable, chase-item odds
 * running away is not.
 *
 * 150 is set from live parties, not picked round. Across 20 deployed raid
 * parties the median is 15 fortune, p75 is 47, p90 is 113 and the best today is
 * 136; six Lv100 Legendaries with +4 Fortune traits reach 204. So a casual
 * party gets ~1.1x and barely notices, a deliberate fortune build lands near
 * 1.9x, and the full 2x is a real target that nobody has hit yet.
 */
export const FORTUNE_LOOT_FULL = 150

/**
 * Fortune's pull on crate DOUBLOONS. Uncapped, unlike the loot curve: more coin
 * is harmless, a chase item becoming common is not. Lived inline in RaidGame,
 * which is the wrong home for a number the loot stage also prints.
 */
export function fortuneDoubloonMult(totalFortune: number): number {
  return 1 + Math.max(0, totalFortune) / 75
}

export function fortuneLootMult(totalFortune: number): number {
  return 1 + Math.min(1, Math.max(0, totalFortune) / FORTUNE_LOOT_FULL)
}

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
  /** Repair-kit heal multiplier (Seasoned Timbers Gauntlet upgrade). Optional;
   *  treated as 1 when absent. Not a crew effect — injected in getRaidPlayerStats. */
  repairHealMult?: number
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

  // Dodge (Navigation) is the real secondary: in live combat it's your Evasion —
  // dodging incoming fire and steadier aim (turn order is Initiative now, a
  // separate stat) — modelled as effective HP (scaled to reachable totals so
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
