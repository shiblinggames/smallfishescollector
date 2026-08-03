// RAID CRATE ROLLING.
//
// Modelled on RuneScape's drop tables, and split out of RaidGame.tsx so the
// maths is testable on its own rather than only observable through a slot reel.
//
// THE OLD MODEL: one weighted bag holding both currency and items, one draw per
// crate. Two problems came out of that shape and neither was tunable away.
//
//   DILUTION. Adding an item to a raid either stole share from the items
//   already there or inflated the table's total item rate. With eight challenge
//   tables and a growing item set, every new item silently retuned old ones.
//
//   NO REAL RATE. An item's chance was its weight over a total that changed
//   whenever anything else moved, so no drop had a number you could state,
//   publish, or multiply. Crew Fortune ran straight into this: doubling the item
//   rows' weights moved Corsair's from 28/100 to 56/128, a 1.56x, because you
//   cannot double a share by doubling one side of a ratio.
//
// THE NEW MODEL, per crate:
//
//   CURRENCY  one weighted draw among the currency rows, which ALWAYS fires.
//             RuneScape's "always table": every kill pays something.
//   ITEMS     each unique you do not already own rolls INDEPENDENTLY at its own
//             chance, like a tertiary drop. Zero, one, or several can land.
//
// Rates are unchanged at rest. Each unique's independent chance defaults to the
// exact share it had in the old bag, so expected items per crate is identical;
// what changes is that the rolls no longer compete, so a rate is now a real
// number a multiplier can act on.

import type { RaidLootItem } from './bossRaids'
import { isUniqueLoot } from './bossRaids'

/**
 * Rarity to a 1-5 "chest tier", driving how hard the open-burst detonates and
 * which drop is treated as the headline of a multi-item crate.
 *
 * ANCIENT was missing from the copy of this that lived in RaidLootStage, so it
 * fell through to the `?? 1` default: the rarest tier in the game produced the
 * quietest possible reveal. Lives here now, next to the roll, so the burst and
 * the headline pick read the same table.
 */
export const LOOT_RARITY_TIER: Record<string, number> = {
  common: 1, uncommon: 2, rare: 3, cosmetic: 3, epic: 4, legendary: 5, ancient: 5,
}

/**
 * BASE DROP RATES BY RARITY, per crate, before Fortune.
 *
 * The headline tuning knob. Rates used to fall out of each table's weights,
 * which meant they drifted with the size of the table: epics ran 8.3% to 20%
 * and legendaries 4.1% to 5.0% across the campaign, with no decision behind
 * the spread. These are the decision.
 *
 * Only epic and legendary are set. Cosmetic hulls and the two ancients keep
 * their weight-derived rates, which carry a deliberate spread (2.0% for the
 * Tundra and Volcanic hulls against 8.7% for the Chartmaker) that a flat rule
 * would erase.
 */
export const BASE_RARITY_CHANCE: Partial<Record<RaidLootItem['rarity'], number>> = {
  epic: 0.10,
  legendary: 0.05,
}

/** The same ladder on challenge tables: double, because the fight is. */
export const CHALLENGE_RARITY_CHANCE: Partial<Record<RaidLootItem['rarity'], number>> = {
  epic: 0.20,
  legendary: 0.10,
}

/** Challenge variants are identified by their id suffix, the same convention
 *  the badge conditions use. */
export function isChallengeRaid(raidId: string | undefined): boolean {
  return !!raidId && raidId.endsWith('_challenge')
}

/** Never let a unique become a certainty, however much Fortune is stacked. */
export const MAX_ITEM_CHANCE = 0.95

export type CrateRoll = {
  /** Index of the currency row that pays out. Always present. -1 only for the
   *  degenerate case of a table with no currency rows at all. */
  currencyIdx: number
  /** Indices of every unique that dropped. Usually empty, sometimes one, and
   *  occasionally more than one, which the old single-draw model could not
   *  express at all. */
  itemIdxs: number[]
}

/**
 * The independent per-crate chance of one unique, before Fortune.
 *
 * Explicit `chance` on the row wins, so a specific drop can be hand-set to a
 * number you can print. Otherwise it is DERIVED from the table's weights, which
 * reproduces the old bag exactly and is why nothing rebalances on the way in.
 *
 * `uniqueShare` tables are different in kind: they declare a total item rate for
 * the crate rather than per-item weights, and they exist to stop that total
 * decaying as a set is completed. Split it evenly as s/n across the n items
 * still missing, which holds EXPECTED ITEMS at exactly s however many are left,
 * matching how every weight-derived table above is preserved.
 *
 * Splitting it as 1-(1-s)^(1/n) instead would hold P(at least one) at s, which
 * sounds like the truer reading of the field, but it quietly raises the Ghost's
 * item throughput 31% because several can now land at once. Preserving
 * throughput is the conservative choice and keeps this table consistent with
 * the other seventeen.
 *
 * Either way the completion wall the field was added to fix stays fixed, and
 * more so: as the set empties n falls, so the LAST item you need rises to the
 * full share rather than decaying toward nothing.
 */
function baseChance(
  l: RaidLootItem,
  totalWeight: number,
  uniqueShare: number | undefined,
  missingCount: number,
  challenge: boolean,
): number {
  // 1. An explicit rate on the row always wins, so one item can be tuned
  //    without touching the rule or anything else in its table.
  if (l.chance != null) return l.chance
  // 2. The rarity rule. This is what makes an epic an epic across every raid
  //    rather than a function of how many rows happen to share its table.
  const byRarity = (challenge ? CHALLENGE_RARITY_CHANCE : BASE_RARITY_CHANCE)[l.rarity]
  if (byRarity != null) return byRarity
  // 3. uniqueShare, for tables that declare a total item rate instead of
  //    per-item ones. Now only reaches rarities the rule does not cover.
  if (uniqueShare != null && uniqueShare > 0 && missingCount > 0) {
    return Math.min(1, uniqueShare) / missingCount
  }
  // 4. Weight-derived, which is what every rate was before the rule existed.
  return totalWeight > 0 ? l.weight / totalWeight : 0
}

/**
 * Roll one crate.
 *
 * `excludedIds` are uniques the player already owns; they are skipped entirely,
 * so a crate never pays a duplicate.
 *
 * `legendaryMult` is Kingpin's Cut (Don's account perk) and lifts legendary and
 * ancient rows only. `fortuneMult` is crew Fortune and lifts every unique. Both
 * act on the item CHANCES directly now rather than on weights in a shared bag,
 * which is what makes "Fortune doubles your drop odds" literally true.
 */
export function rollCrate(
  loot: RaidLootItem[],
  excludedIds: Set<string> = new Set(),
  uniqueShare?: number,
  legendaryMult = 1,
  fortuneMult = 1,
  challenge = false,
  rng: () => number = Math.random,
): CrateRoll {
  const totalWeight = loot.reduce((s, l) => s + l.weight, 0)

  const currency: { idx: number; weight: number }[] = []
  const uniques: { idx: number; row: RaidLootItem }[] = []
  loot.forEach((l, idx) => {
    if (isUniqueLoot(l)) { if (!excludedIds.has(l.id)) uniques.push({ idx, row: l }) }
    else currency.push({ idx, weight: l.weight })
  })

  // ── The always table ──
  let currencyIdx = -1
  if (currency.length > 0) {
    const total = currency.reduce((s, c) => s + c.weight, 0)
    let r = rng() * total
    currencyIdx = currency[currency.length - 1].idx
    for (const c of currency) { r -= c.weight; if (r <= 0) { currencyIdx = c.idx; break } }
  }

  // ── The tertiary rolls ──
  const itemIdxs: number[] = []
  for (const u of uniques) {
    const isLegendary = u.row.rarity === 'legendary' || u.row.rarity === 'ancient'
    const p = Math.min(
      MAX_ITEM_CHANCE,
      baseChance(u.row, totalWeight, uniqueShare, uniques.length, challenge)
        * (isLegendary ? legendaryMult : 1)
        * fortuneMult,
    )
    if (rng() < p) itemIdxs.push(u.idx)
  }

  return { currencyIdx, itemIdxs }
}

/**
 * The stated drop chance of every unique in a table, for display and for tests.
 * Reads the same path the roll does, so a number shown to a player cannot drift
 * from the number rolled against.
 */
export type CrateItemChance = {
  id: string
  label: string
  image: string | null
  rarity: RaidLootItem['rarity']
  /** The real chance, everything applied. */
  chance: number
  /** The same chance with Fortune held at 1x, so a panel can show what the crew
   *  is adding instead of only the total. Equal to `chance` when Fortune is 1x. */
  chanceBeforeFortune: number
}

export function crateItemChances(
  loot: RaidLootItem[],
  excludedIds: Set<string> = new Set(),
  uniqueShare?: number,
  legendaryMult = 1,
  fortuneMult = 1,
  challenge = false,
): CrateItemChance[] {
  const totalWeight = loot.reduce((s, l) => s + l.weight, 0)
  const missing = loot.filter(l => isUniqueLoot(l) && !excludedIds.has(l.id))
  return missing.map(l => {
    const raw = baseChance(l, totalWeight, uniqueShare, missing.length, challenge)
      * (l.rarity === 'legendary' || l.rarity === 'ancient' ? legendaryMult : 1)
    return {
      id: l.id,
      label: l.label,
      image: l.image,
      rarity: l.rarity,
      chance: Math.min(MAX_ITEM_CHANCE, raw * fortuneMult),
      chanceBeforeFortune: Math.min(MAX_ITEM_CHANCE, raw),
    }
  })
}
