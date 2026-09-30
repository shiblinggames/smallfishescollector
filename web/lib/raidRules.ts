// ── THE RAID REWARD RULES, WITH NO DATABASE IN THEM (Steam prep, Phase B, 2026-09-28) ──
//
// Raid combat runs on the client (RaidCombat) and its maths were already pure
// (lib/expeditions raidDamageProfile, lib/raidLoot rollCrate, the configs in
// lib/bossRaids). What still lived inline in the server actions is what a raid
// PAYS and what the map's gates decide: a kill's reward, the crate (uniques,
// the currency row, the coin ceiling), a clear's records, the dice node's
// throw, and the damage-check shot. Moved verbatim: no odds and no payout
// changed. The actions keep who is asking, the run token (one pay per round,
// one clear, one crate), the reachability check and the writes.
// scripts/check-raid-rules.mts holds the rules.

import { aggregateShipClasses } from '@/lib/shipClasses'
import { navRenownEffects, type RenownAlloc } from '@/lib/renown'
import { raidCompletionBonusXp, type BossRaidConfig } from '@/lib/bossRaids'
import { rollRaidCurrency, ITEM_GRANTS, MAX_CRATE_BASE_DOUBLOONS } from '@/lib/raidRegistry'
import { rollCrate, isChallengeRaid } from '@/lib/raidLoot'
import { raidDamageProfile, fortuneLootMult } from '@/lib/expeditions'
import { getActiveEffects } from '@/lib/raidItems'
import type { RaidNode, RaidDice, RaidDiceOption } from '@/lib/raidMap'
import type { RaidPlayerStats } from '@/lib/raidPlayerStats'
import { rngNext } from '@/lib/rng'

// ── A kill ──────────────────────────────────────────────────────────────────

/**
 * WHAT ONE ROUND OF A RAID PAYS. The client names only which round fell
 * (0-based; the round equal to the sequence length is the boss); the reward is
 * the config's own killRewards line, and the boss adds the full-clear bonus.
 * Ship classes and Nav Renown (Plunder) scale the gold; Renown (Command) the
 * crew XP. Nav XP is not class-modified. Null for a round past the boss.
 */
export function raidKillReward(config: BossRaidConfig, round: number, shipClasses: Record<string, string> | null, navRenownAlloc: RenownAlloc | null): { isBoss: boolean; xp: number; doubloons: number; crewXp: number } | null {
  if (!Number.isInteger(round) || round < 0 || round > config.sequence.length) return null
  const isBoss = round === config.sequence.length
  const enemyId = isBoss ? config.bossId : config.sequence[round]
  const reward = config.killRewards[enemyId]
  const xp = (reward?.xp ?? 0) + (isBoss ? raidCompletionBonusXp(config) : 0)
  const navRenown = navRenownEffects(navRenownAlloc)
  const doubloonMult = aggregateShipClasses(shipClasses ?? {}).doubloonMult * navRenown.doubloonMult
  return { isBoss, xp, doubloons: Math.round((reward?.gold ?? 0) * doubloonMult), crewXp: Math.round(xp * navRenown.crewXpMult) }
}

// ── The crate ───────────────────────────────────────────────────────────────

export type RaidCrate = {
  itemIds: string[]
  currencyId: string | null
  currencyGems: number
  /** The coin roll, class-scaled; 0 when the currency row paid gems instead. */
  crateDoubloons: number
  /** Coin and gems carried by the unique items themselves. */
  itemDoubloons: number
  itemGems: number
  claimedBase: number
  /** The client claimed more than any honest crate can hold. */
  capTripped: boolean
}

/**
 * ONE CRATE. The uniques are rolled from the raid's own table with the same
 * inputs the combat sheet's preview uses: GEAR rolls at its own fixed rate
 * whatever you already hold (duplicates are allowed, Kong 2026-09-30), while
 * an owned UNLOCK (a ship skin, a special item) still drops out, since a
 * second copy of an unlock is nothing; crew
 * Fortune lifts item odds (capped 2x), Kingpin's Cut lifts legendaries. The
 * coin arrives from the client (tides add to it where the server cannot see)
 * and is clamped to MAX_CRATE_BASE_DOUBLOONS, then class-scaled. The currency
 * row is drawn here, and a gem row pays gems INSTEAD of the coin, not on top.
 * Rolled in a fixed order: the uniques, then the currency row.
 */
export function rollRaidCrate(i: {
  raidId: string
  config: BossRaidConfig
  stats: Pick<RaidPlayerStats, 'shipSkins' | 'ownedSpecialItems' | 'legendaryLootMult' | 'totalFortune'>
  baseDoubloons: number
  shipClasses: Record<string, string> | null
}): RaidCrate {
  const owned = new Set<string>([...i.stats.shipSkins, ...i.stats.ownedSpecialItems])
  const crate = rollCrate(i.config.loot, owned, i.config.uniqueShare, i.stats.legendaryLootMult, fortuneLootMult(i.stats.totalFortune), isChallengeRaid(i.raidId))
  const itemIds = crate.itemIdxs.map(k => i.config.loot[k].id)

  const claimedBase = Number.isFinite(i.baseDoubloons) ? Math.floor(i.baseDoubloons) : 0
  const safeBase = Math.max(0, Math.min(claimedBase, MAX_CRATE_BASE_DOUBLOONS))
  const scaledBase = Math.round(safeBase * aggregateShipClasses(i.shipClasses ?? {}).doubloonMult)

  const currencyId = rollRaidCurrency(i.raidId)
  const currencyGems = (currencyId ? ITEM_GRANTS[currencyId]?.gems : 0) ?? 0
  let itemDoubloons = 0, itemGems = 0
  for (const id of itemIds) {
    const g = ITEM_GRANTS[id]
    if (g?.doubloons) itemDoubloons += g.doubloons
    if (g?.gems) itemGems += g.gems
  }
  return {
    itemIds, currencyId, currencyGems,
    crateDoubloons: currencyGems > 0 ? 0 : scaledBase,
    itemDoubloons, itemGems, claimedBase,
    capTripped: claimedBase > MAX_CRATE_BASE_DOUBLOONS,
  }
}

// ── A clear ─────────────────────────────────────────────────────────────────

/** No honest fight is shorter. A faster clear is a forged time reaching for
 *  the record. */
export const MIN_PLAUSIBLE_CLEAR_MS = 20_000

/** The victory screen's records, from the bests read BEFORE this clear. An
 *  admin's clear never takes the global record. */
export function clearTimes(ms: number, prevMyBest: number | null, prevGlobal: { ms: number; username: string } | null, me: { username: string; isAdmin: boolean }) {
  const takesGlobal = !me.isAdmin && (prevGlobal == null || ms < prevGlobal.ms)
  return {
    yourBestMs: prevMyBest == null ? ms : Math.min(prevMyBest, ms),
    isPersonalBest: prevMyBest == null || ms < prevMyBest,
    globalBestMs: takesGlobal ? ms : prevGlobal?.ms ?? null,
    globalBestUsername: takesGlobal ? me.username : prevGlobal?.username ?? '',
    isGlobalBest: takesGlobal,
  }
}

// ── The map's gates ─────────────────────────────────────────────────────────

/** Why a one-time map node cannot be taken, or null. */
export function mapNodeRefusal(node: RaidNode, p: { isAdmin: boolean; cleared: Set<string>; navLevel: number }, alreadyMsg: string): string | null {
  if (node.adminOnly && !p.isAdmin) return 'Locked'
  if (p.cleared.has(node.id)) return alreadyMsg
  if (node.requiresNode && !p.cleared.has(node.requiresNode)) return 'Locked'
  if (node.requiresNavLevel && p.navLevel < node.requiresNavLevel) return 'Locked'
  return null
}

/**
 * THE DICE NODE: a d20 plus a Navigation bonus (one per `bonusPerLevels`
 * levels, capped) against the option's DC. A miss can take coin, clamped so
 * the purse never goes below zero; the delta is the coin that actually moves.
 */
export function throwDice(dice: RaidDice, option: RaidDiceOption, navLevel: number, doubloons: number) {
  const bonus = Math.min(dice.maxBonus, Math.floor(navLevel / dice.bonusPerLevels))
  const roll = 1 + Math.floor(rngNext() * 20)
  const total = roll + bonus
  const success = total >= option.dc
  const outcome = success ? option.win : option.miss
  const newDoubloons = Math.max(0, doubloons + (outcome.doubloons ?? 0))
  return { roll, bonus, total, success, doubloonsDelta: newDoubloons - doubloons, navXpDelta: outcome.navXp ?? 0 }
}

type ShotStats = Pick<RaidPlayerStats, 'totalPower' | 'shipMinDamage' | 'raidMods' | 'classDamageMult' | 'equippedRaidItems'>

/** The damage check's numbers: the straight-hit range from ship and crew
 *  power, and the class and gear non-crit multiplier. */
function shotBasis(stats: ShotStats) {
  const p = raidDamageProfile(stats.totalPower, stats.shipMinDamage, stats.raidMods.damagePct)
  const noncritMult = getActiveEffects(stats.equippedRaidItems).filter(e => e.type === 'noncrit_damage_mult').reduce((a, e) => a * e.value, 1)
  return { rangeMin: p.hitMin, rangeMax: p.powerMax, mult: stats.classDamageMult * noncritMult }
}

/** The odds shown on the node before the shot: how much of the hit range
 *  clears the threshold once multiplied, as a whole percent. Counted with the
 *  SAME rounding the shot uses (round(roll x mult) >= threshold); it used to
 *  need roll >= ceil(threshold / mult), which understated the odds by a few
 *  points (coffers_fork showed 29% and passed about 32%). Fixed 2026-09-28. */
export function dpsPreview(stats: ShotStats, threshold: number) {
  const { rangeMin, rangeMax, mult } = shotBasis(stats)
  const total = rangeMax - rangeMin + 1
  let passing = 0
  for (let roll = rangeMin; roll <= rangeMax; roll++) if (Math.round(roll * mult) >= threshold) passing++
  const passChance = total > 0 ? Math.max(0, Math.min(100, Math.round((passing / total) * 100))) : 0
  return { rangeMin, rangeMax, mult, passChance }
}

/** THE SHOT: always a straight (non-critical) hit, uniform in the range, then
 *  multiplied. No aiming; the range is the player's stats, the roll the luck.
 *  Mirrors RaidCombat.rollShotDamage's hit branch. */
export function dpsShot(stats: ShotStats, threshold: number) {
  const { rangeMin, rangeMax, mult } = shotBasis(stats)
  const base = Math.floor(rngNext() * (rangeMax - rangeMin + 1)) + rangeMin
  const damage = Math.round(base * mult)
  return { damage, passed: damage >= threshold, breakdown: { roll: base, rangeMin, rangeMax, mult } }
}
