/** THE TWO SPOILS OF THE SUNKEN HAND.
 *
 *  Finn drops exactly two real items, and neither is a flat stat stick. Each is
 *  CHARGED BY THE OPPOSITE SKILL and levels up, unlocking milestone effects the
 *  way a crew ability does:
 *
 *    The Primeval Eye  a FISHING item, charged by NAVIGATION xp
 *    The Primeval Maw   a RAID item,    charged by FISHING xp
 *
 *  That crossing is the whole point, and it is the mechanical form of the
 *  story: he became what he is by making the two halves of your life feed each
 *  other. Wearing one is a standing commitment to go and play the other side.
 *
 *  Each only accrues while EQUIPPED, so they are a choice with a cost rather
 *  than something you park in a slot and forget.
 */

// Type-only, so this cannot form a runtime cycle with raidItems (which imports
// the effect resolver below).
import type { RaidEffect } from './raidItems'

/** Cumulative charge needed to REACH each level. Level 1 is free (the item
 *  arrives at 1). Sized against the skill curves either side: level 100 of a
 *  skill is ~2.47M xp, so a fully charged spoil is a long, deliberate haul
 *  rather than a weekend, and the early levels still land soon enough to feel
 *  like the thing is alive. */
export const FINN_ITEM_THRESHOLDS = [0, 60_000, 180_000, 400_000, 800_000, 1_400_000] as const
export const FINN_ITEM_MAX_LEVEL = FINN_ITEM_THRESHOLDS.length

export type FinnItemId = 'anglers_patience' | 'borrowed_jaw'

/** A rung on the ladder.
 *
 *  These STACK, in the Locked-In Rod's shape: every tier keeps everything the
 *  tiers below it gave you and adds one new power on top, so a maxed spoil is
 *  six effects running at once rather than one number that got bigger. The
 *  fields below are therefore TOTALS in force at that level, not deltas, which
 *  keeps the resolvers a plain table lookup with nothing to accumulate wrong.
 *  `unlock` is the one NEW thing this tier buys, and it is what the ladder in
 *  the charge panel actually shows. */
export interface FinnMilestone {
  level: number
  unlock: string
  /** ── Fishing side (The Primeval Eye) ── */
  /** Added to the rod's rarity bias. The through-line: it climbs every rung. */
  rarityBonus?: number
  /** Bite wait multiplier. Under 1 is FASTER. */
  waitMult?: number
  fishingXpMult?: number
  /** Multiplier on golden (shiny) odds, on top of the Max Prestige boost. */
  goldenOddsMult?: number
  /** Multiplier on the 2% base crate encounter chance. */
  crateChanceMult?: number
  /** Flat chance ADDED to the rod's double-catch roll. */
  doubleCatchChance?: number
  /** ── Raid side (The Primeval Maw) ── */
  bossDamageMult?: number
  nonBossDamageMult?: number
  critDamageMult?: number
  critUpgradeChance?: number
  lifestealPct?: number
  startChargeChance?: number
}

export interface FinnItemDef {
  id: FinnItemId
  name: string
  /** The skill whose xp charges it. Deliberately the opposite of where it is worn. */
  chargedBy: 'navigation' | 'fishing'
  wornIn: 'fishing' | 'raids'
  color: string
  flavor: string
  milestones: FinnMilestone[]
}

export const FINN_ITEMS: Record<FinnItemId, FinnItemDef> = {
  anglers_patience: {
    id: 'anglers_patience',
    name: 'The Primeval Eye',
    chargedBy: 'navigation',
    wornIn: 'fishing',
    color: '#6fd3c7',
    flavor: 'He watched that water for a lifetime until it gave up everything it was hiding. The waiting was never the price. It was the method.',
    milestones: [
      { level: 1, unlock: 'It looks deeper. Rare fish bias +0.30.', rarityBonus: 0.30 },
      { level: 2, unlock: 'It reads what it finds. +12% fishing XP.', rarityBonus: 0.45, fishingXpMult: 1.12 },
      { level: 3, unlock: 'It catches the shine. Golden odds x1.8.', rarityBonus: 0.60, fishingXpMult: 1.12, goldenOddsMult: 1.8 },
      { level: 4, unlock: 'It sees them coming. Bites arrive 12% sooner.', rarityBonus: 0.75, fishingXpMult: 1.12, goldenOddsMult: 1.8, waitMult: 0.88 },
      { level: 5, unlock: 'It sees the bottom too. Triple crate odds.', rarityBonus: 0.95, fishingXpMult: 1.12, goldenOddsMult: 1.8, waitMult: 0.88, crateChanceMult: 3 },
      { level: 6, unlock: 'It takes two at a time. A 25% chance any catch hauls double.', rarityBonus: 1.20, fishingXpMult: 1.12, goldenOddsMult: 1.8, waitMult: 0.88, crateChanceMult: 3, doubleCatchChance: 0.25 },
    ],
  },
  borrowed_jaw: {
    id: 'borrowed_jaw',
    name: 'The Primeval Maw',
    chargedBy: 'fishing',
    wornIn: 'raids',
    color: '#e0a44a',
    flavor: 'Torn out of the oldest mouth in the sea and bolted into iron that never earned it. It has forgiven neither of you.',
    milestones: [
      { level: 1, unlock: 'It knows what a boss is. +10% damage on boss rounds.', bossDamageMult: 1.10 },
      { level: 2, unlock: 'It bites where the plating ends. +15% critical damage.', bossDamageMult: 1.13, critDamageMult: 1.15 },
      { level: 3, unlock: 'It finds the gap itself. 10% of clean hits come up critical.', bossDamageMult: 1.16, critDamageMult: 1.15, critUpgradeChance: 0.10 },
      { level: 4, unlock: 'It feeds. 8% of the damage you deal comes back as hull.', bossDamageMult: 1.19, critDamageMult: 1.15, critUpgradeChance: 0.10, lifestealPct: 0.08 },
      { level: 5, unlock: 'It never sleeps. A 50% chance to open every fight already loaded.', bossDamageMult: 1.22, critDamageMult: 1.15, critUpgradeChance: 0.10, lifestealPct: 0.08, startChargeChance: 0.50 },
      { level: 6, unlock: 'Nothing swims above it. +20% damage to everything else too.', bossDamageMult: 1.25, nonBossDamageMult: 1.20, critDamageMult: 1.20, critUpgradeChance: 0.12, lifestealPct: 0.10, startChargeChance: 0.50 },
    ],
  },
}

/** Level from raw charge. Clamped to the table, so an over-charged item just
 *  sits at max rather than reading past the end of the milestones. */
export function finnItemLevel(xp: number): number {
  let lvl = 1
  for (let i = 1; i < FINN_ITEM_THRESHOLDS.length; i++) {
    if (xp >= FINN_ITEM_THRESHOLDS[i]) lvl = i + 1
  }
  return Math.min(lvl, FINN_ITEM_MAX_LEVEL)
}

/** Progress toward the NEXT level, for the charge bar. `next` is null at max. */
export function finnItemProgress(xp: number): { level: number; into: number; next: number | null; pct: number } {
  const level = finnItemLevel(xp)
  if (level >= FINN_ITEM_MAX_LEVEL) return { level, into: 0, next: null, pct: 1 }
  const floor = FINN_ITEM_THRESHOLDS[level - 1]
  const ceil = FINN_ITEM_THRESHOLDS[level]
  const span = Math.max(1, ceil - floor)
  const into = Math.max(0, xp - floor)
  return { level, into, next: ceil - floor, pct: Math.min(1, into / span) }
}

/** The milestone in force at this charge. Always defined: level 1 is free. */
export function finnItemMilestone(id: FinnItemId, xp: number): FinnMilestone {
  const def = FINN_ITEMS[id]
  const lvl = finnItemLevel(xp)
  return def.milestones[Math.min(lvl, def.milestones.length) - 1]
}

export interface EyeEffects {
  rarityBonus: number
  waitMult: number
  fishingXpMult: number
  goldenOddsMult: number
  crateChanceMult: number
  doubleCatchChance: number
}

/** Fishing-side effects, or identity when the eye is not seated. */
export function anglersPatienceEffects(seated: boolean, xp: number): EyeEffects {
  const idle: EyeEffects = { rarityBonus: 0, waitMult: 1, fishingXpMult: 1, goldenOddsMult: 1, crateChanceMult: 1, doubleCatchChance: 0 }
  if (!seated) return idle
  const m = finnItemMilestone('anglers_patience', xp)
  return {
    rarityBonus: m.rarityBonus ?? 0,
    waitMult: m.waitMult ?? 1,
    fishingXpMult: m.fishingXpMult ?? 1,
    goldenOddsMult: m.goldenOddsMult ?? 1,
    crateChanceMult: m.crateChanceMult ?? 1,
    doubleCatchChance: m.doubleCatchChance ?? 0,
  }
}

/** The jaw's milestone expressed in the RAID ITEM effect vocabulary, so combat
 *  consumes it through exactly the same path as every other item rather than a
 *  parallel one. Called by getActiveEffects when it sees a charge tag; the level
 *  comes off the id, so this stays a pure table lookup. */
export function borrowedJawRaidEffects(level: number): RaidEffect[] {
  const m = FINN_ITEMS.borrowed_jaw.milestones[Math.min(Math.max(level, 1), FINN_ITEM_MAX_LEVEL) - 1]
  const out: RaidEffect[] = []
  // ONE entry per type. Combat folds same-type effects together (multiplying the
  // mults, maxing the chances), so emitting a rung's value twice would silently
  // square it. The milestone rows hold totals precisely so this stays a copy.
  if (m.bossDamageMult) out.push({ type: 'boss_damage_mult', value: m.bossDamageMult })
  if (m.nonBossDamageMult) out.push({ type: 'nonboss_damage_mult', value: m.nonBossDamageMult })
  if (m.critDamageMult) out.push({ type: 'crit_damage_mult', value: m.critDamageMult })
  if (m.critUpgradeChance) out.push({ type: 'crit_upgrade_chance', value: m.critUpgradeChance })
  if (m.lifestealPct) out.push({ type: 'lifesteal_pct', value: m.lifestealPct })
  if (m.startChargeChance) out.push({ type: 'start_charge_chance', value: m.startChargeChance })
  return out
}

/** Raid-side effects as plain numbers, or identity when the maw is not mounted.
 *  Combat does NOT read this (it goes through borrowedJawRaidEffects and the
 *  normal item pipeline); this is for anything that wants the values directly. */
export function borrowedJawEffects(mounted: boolean, xp: number) {
  const idle = { bossDamageMult: 1, nonBossDamageMult: 1, critDamageMult: 1, critUpgradeChance: 0, lifestealPct: 0, startChargeChance: 0 }
  if (!mounted) return idle
  const m = finnItemMilestone('borrowed_jaw', xp)
  return {
    bossDamageMult: m.bossDamageMult ?? 1,
    nonBossDamageMult: m.nonBossDamageMult ?? 1,
    critDamageMult: m.critDamageMult ?? 1,
    critUpgradeChance: m.critUpgradeChance ?? 0,
    lifestealPct: m.lifestealPct ?? 0,
    startChargeChance: m.startChargeChance ?? 0,
  }
}
