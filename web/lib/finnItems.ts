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

export interface FinnMilestone {
  level: number
  desc: string
  /** Fishing side (The Primeval Eye). */
  rarityBonus?: number
  waitMult?: number
  fishingXpMult?: number
  /** Raid side (The Primeval Maw). */
  bossDamageMult?: number
  critDamageMult?: number
  critUpgradeChance?: number
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
      { level: 1, rarityBonus: 0.10, waitMult: 1.30, desc: 'Bites take 30% longer, and roll 10% rarer.' },
      { level: 2, rarityBonus: 0.16, waitMult: 1.25, desc: 'Rarity to 16%, and the wait eases to 25%.' },
      { level: 3, rarityBonus: 0.24, waitMult: 1.18, fishingXpMult: 1.06, desc: 'Rarity to 24%, wait to 18%, and +6% fishing XP.' },
      { level: 4, rarityBonus: 0.31, waitMult: 1.12, fishingXpMult: 1.11, desc: 'Rarity to 31%, wait to 12%, and +11% fishing XP.' },
      { level: 5, rarityBonus: 0.38, waitMult: 1.06, fishingXpMult: 1.15, desc: 'Rarity to 38%, wait to 6%, and +15% fishing XP.' },
      { level: 6, rarityBonus: 0.45, waitMult: 1.00, fishingXpMult: 1.20, desc: 'Rarity to 45%, the wait is GONE, and +20% fishing XP.' },
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
      { level: 1, bossDamageMult: 1.06, desc: '+6% damage on boss rounds.' },
      { level: 2, bossDamageMult: 1.09, critDamageMult: 1.05, desc: '+9% boss damage, +5% critical damage.' },
      { level: 3, bossDamageMult: 1.12, critDamageMult: 1.10, desc: '+12% boss damage, +10% critical damage.' },
      { level: 4, bossDamageMult: 1.16, critDamageMult: 1.15, desc: '+16% boss damage, +15% critical damage.' },
      { level: 5, bossDamageMult: 1.20, critDamageMult: 1.20, critUpgradeChance: 0.08, desc: '+20% boss damage, +20% critical damage, 8% of hits come up critical.' },
      { level: 6, bossDamageMult: 1.24, critDamageMult: 1.25, critUpgradeChance: 0.15, desc: '+24% boss damage, +25% critical damage, 15% of hits come up critical.' },
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

/** Fishing-side effects, or identity when the reel is not seated. */
export function anglersPatienceEffects(seated: boolean, xp: number): {
  rarityBonus: number; waitMult: number; fishingXpMult: number
} {
  if (!seated) return { rarityBonus: 0, waitMult: 1, fishingXpMult: 1 }
  const m = finnItemMilestone('anglers_patience', xp)
  return {
    rarityBonus: m.rarityBonus ?? 0,
    waitMult: m.waitMult ?? 1,
    fishingXpMult: m.fishingXpMult ?? 1,
  }
}

/** The jaw's milestone expressed in the RAID ITEM effect vocabulary, so combat
 *  consumes it through exactly the same path as every other item rather than a
 *  parallel one. Called by getActiveEffects when it sees a charge tag; the level
 *  comes off the id, so this stays a pure table lookup. */
export function borrowedJawRaidEffects(level: number): RaidEffect[] {
  const m = FINN_ITEMS.borrowed_jaw.milestones[Math.min(Math.max(level, 1), FINN_ITEM_MAX_LEVEL) - 1]
  const out: RaidEffect[] = []
  if (m.bossDamageMult) out.push({ type: 'boss_damage_mult', value: m.bossDamageMult })
  if (m.critDamageMult) out.push({ type: 'crit_damage_mult', value: m.critDamageMult })
  if (m.critUpgradeChance) out.push({ type: 'crit_upgrade_chance', value: m.critUpgradeChance })
  return out
}

/** Raid-side effects, or identity when the jaw is not mounted. */
export function borrowedJawEffects(mounted: boolean, xp: number): {
  bossDamageMult: number; critDamageMult: number; critUpgradeChance: number
} {
  if (!mounted) return { bossDamageMult: 1, critDamageMult: 1, critUpgradeChance: 0 }
  const m = finnItemMilestone('borrowed_jaw', xp)
  return {
    bossDamageMult: m.bossDamageMult ?? 1,
    critDamageMult: m.critDamageMult ?? 1,
    critUpgradeChance: m.critUpgradeChance ?? 0,
  }
}
