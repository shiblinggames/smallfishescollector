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
  /** Multiplier on doubloons from selling fish. Both lanes, same as Renown. */
  sellMult?: number
  /** Bite wait multiplier. Under 1 is FASTER. */
  waitMult?: number
  fishingXpMult?: number
  /** Multiplier on golden (shiny) odds, on top of the Max Prestige boost. */
  goldenOddsMult?: number
  /** Multiplier on the 2% base crate encounter chance. */
  crateChanceMult?: number
  /** Tier 6: a PERFECT catch never consumes bait. Absolute, not a chance. */
  perfectBaitSave?: boolean
  /** ── Raid side (The Primeval Maw) ── */
  bossDamageMult?: number
  /** Per-action damage lanes. Each rides only its own action. */
  fireDamageMult?: number
  volleyDamageMult?: number
  megaDamageMult?: number
  /** Rolled SEPARATELY from Spet's primers so it stacks on top of them. */
  extraStartChargeChance?: number
  /** On a CRITICAL, the shot costs no cannonballs. Fire, volley and mega alike. */
  critChargeRefundChance?: number
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
      { level: 1, unlock: 'It knows what a thing is worth. +15% doubloons on every fish you sell.', sellMult: 1.15 },
      { level: 2, unlock: 'It reads what it finds. +12% fishing XP.', sellMult: 1.15, fishingXpMult: 1.12 },
      { level: 3, unlock: 'It sees them coming. Bites arrive 10% sooner.', sellMult: 1.15, fishingXpMult: 1.12, waitMult: 0.90 },
      { level: 4, unlock: 'It sees the bottom too. Double crate odds.', sellMult: 1.15, fishingXpMult: 1.12, waitMult: 0.90, crateChanceMult: 2 },
      { level: 5, unlock: 'It catches the shine. Golden odds x1.8.', sellMult: 1.15, fishingXpMult: 1.12, waitMult: 0.90, crateChanceMult: 2, goldenOddsMult: 1.8 },
      { level: 6, unlock: 'It never wastes a thing. A perfect catch NEVER consumes bait.', sellMult: 1.15, fishingXpMult: 1.12, waitMult: 0.90, crateChanceMult: 2, goldenOddsMult: 1.8, perfectBaitSave: true },
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
      { level: 2, unlock: 'It steadies your aim. +10% damage on a single shot.', bossDamageMult: 1.13, fireDamageMult: 1.10 },
      { level: 3, unlock: 'It puts its weight behind the big one. +10% ultimate damage.', bossDamageMult: 1.16, fireDamageMult: 1.10, megaDamageMult: 1.10 },
      { level: 4, unlock: 'It opens both jaws. +10% volley damage.', bossDamageMult: 1.19, fireDamageMult: 1.10, megaDamageMult: 1.10, volleyDamageMult: 1.10 },
      { level: 5, unlock: 'It never sleeps. A 50% chance to open every fight with one more chambered, on top of any primer you run.', bossDamageMult: 1.22, fireDamageMult: 1.10, megaDamageMult: 1.10, volleyDamageMult: 1.10, extraStartChargeChance: 0.50 },
      { level: 6, unlock: 'It bites for free. A critical has a 50% chance to cost NO cannonballs, whether you fired, volleyed or opened up.', bossDamageMult: 1.25, fireDamageMult: 1.10, megaDamageMult: 1.10, volleyDamageMult: 1.10, extraStartChargeChance: 0.50, critChargeRefundChance: 0.50 },
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
  sellMult: number
  waitMult: number
  fishingXpMult: number
  goldenOddsMult: number
  crateChanceMult: number
  perfectBaitSave: boolean
}

/** Fishing-side effects, or identity when the eye is not seated. */
export function anglersPatienceEffects(seated: boolean, xp: number): EyeEffects {
  const idle: EyeEffects = { sellMult: 1, waitMult: 1, fishingXpMult: 1, goldenOddsMult: 1, crateChanceMult: 1, perfectBaitSave: false }
  if (!seated) return idle
  const m = finnItemMilestone('anglers_patience', xp)
  return {
    sellMult: m.sellMult ?? 1,
    waitMult: m.waitMult ?? 1,
    fishingXpMult: m.fishingXpMult ?? 1,
    goldenOddsMult: m.goldenOddsMult ?? 1,
    crateChanceMult: m.crateChanceMult ?? 1,
    perfectBaitSave: m.perfectBaitSave === true,
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
  if (m.fireDamageMult) out.push({ type: 'fire_damage_mult', value: m.fireDamageMult })
  if (m.volleyDamageMult) out.push({ type: 'volley_damage_mult', value: m.volleyDamageMult })
  if (m.megaDamageMult) out.push({ type: 'mega_damage_mult', value: m.megaDamageMult })
  if (m.extraStartChargeChance) out.push({ type: 'extra_start_charge_chance', value: m.extraStartChargeChance })
  if (m.critChargeRefundChance) out.push({ type: 'crit_charge_refund_chance', value: m.critChargeRefundChance })
  return out
}

/** Raid-side effects as plain numbers, or identity when the maw is not mounted.
 *  Combat does NOT read this (it goes through borrowedJawRaidEffects and the
 *  normal item pipeline); this is for anything that wants the values directly. */
export function borrowedJawEffects(mounted: boolean, xp: number) {
  const idle = { bossDamageMult: 1, fireDamageMult: 1, volleyDamageMult: 1, megaDamageMult: 1, extraStartChargeChance: 0, critChargeRefundChance: 0 }
  if (!mounted) return idle
  const m = finnItemMilestone('borrowed_jaw', xp)
  return {
    bossDamageMult: m.bossDamageMult ?? 1,
    fireDamageMult: m.fireDamageMult ?? 1,
    volleyDamageMult: m.volleyDamageMult ?? 1,
    megaDamageMult: m.megaDamageMult ?? 1,
    extraStartChargeChance: m.extraStartChargeChance ?? 0,
    critChargeRefundChance: m.critChargeRefundChance ?? 0,
  }
}

/** THE EYE off a profile row. Five different fishing paths need it now (the
 *  cast, the grant, and all three sell lanes), and every one has to apply the
 *  same three conditions: owned, seated, and its SLOT actually unlocked at the
 *  spoils node. Kept here so a new caller cannot forget one of them. */
export function eyeFromProfile(p: {
  equipped_special_2?: string | null
  has_anglers_patience?: boolean | null
  anglers_patience_xp?: number | null
  finn_spoil_free?: string | null
  finn_spoil_paid?: string | null
} | null): EyeEffects {
  const seated = p?.equipped_special_2 === 'anglers_patience'
    && p?.has_anglers_patience === true
    && (p?.finn_spoil_free === 'fishing' || p?.finn_spoil_paid === 'fishing')
  return anglersPatienceEffects(seated, Number(p?.anglers_patience_xp ?? 0))
}
