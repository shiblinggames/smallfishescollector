// ──────────────────────────────────────────────────────────────────────────
// The Davy Jones Gauntlet — Chapter 2.5 push-your-luck roguelike.
// ──────────────────────────────────────────────────────────────────────────
// One run per day. Each round throws a progressively harder enemy drawn from
// Raids 1-4 (their art / patterns / signature abilities, but HP + damage
// OVERRIDDEN onto a single gauntlet curve so the difficulty ramps cleanly
// instead of inheriting wildly different base stats). Bosses, elite affixes,
// and Tides all fire on WEIGHTED RANDOMNESS WITH GUARDRAILS (not a fixed
// cadence) so every run has its own rhythm.
//
// No per-kill payout: doubloons + XP accumulate into a POT that is only
// banked if the player CASHES OUT. Die and the whole pot is lost. The pot
// scales hard with depth so a deep run out-pays even a challenge clear (the
// thing worth logging in for), while bailing shallow pays less than the safe
// grind — that knife-edge is the whole mode.
//
// Combat is client-driven (same trust model as every raid). The server
// recomputes the pot ceiling from the reported depth and clamps to it, then
// rolls the cash-out chest server-side so multipliers + item odds can't be
// forged. The real limiter is the once-a-day gate.

import {
  CORSAIRS_RECKONING, CAPTAIN_KRUST, THE_CARTOGRAPHER, THE_TOLLMASTER,
  type BroadsideEnemy,
} from './bossRaids'
import { AFFIXES, ELITE_HP_MULT, ELITE_DMG_MULT, rollAffix, type AffixDef } from './raidAffixes'
import { type TideEffect } from './tides'

// ── Economy ────────────────────────────────────────────────────────────────
// Per-round pot contribution = POT_BASE + POT_GROWTH * depth (⟡ AND XP, the
// two mirror). A boss round multiplies that by BOSS_POT_MULT. Tuned against a
// Tollmaster CHALLENGE clear (~1,980 ⟡): a shallow bail (depth ~5) lands
// ~1,300 (below the safe grind, on purpose); depth 8 ~1.7×, depth 12 ~3.6×,
// depth 16 ~6×, depth 20 ~9×. The cash-out chest multiplier rides on top.
export const POT_BASE = 80
export const POT_GROWTH = 50
export const BOSS_POT_MULT = 3

// Cooldown between Gauntlet runs (replaces the old once-a-day gate). Measured
// from when a run STARTS (consume-on-start), so a quit-retry can't dodge it.
// Tune here to make the Gauntlet more or less farmable.
export const GAUNTLET_COOLDOWN_HOURS = 4
export const GAUNTLET_COOLDOWN_MS = GAUNTLET_COOLDOWN_HOURS * 60 * 60 * 1000

/** ⟡ (== XP) a single cleared round at this depth adds to the pot. */
export function roundContribution(depth: number, isBoss: boolean): number {
  const base = POT_BASE + POT_GROWTH * depth
  return Math.round(base * (isBoss ? BOSS_POT_MULT : 1))
}

/** Server-side ceiling for a reported depth: the pot the player would have
 *  if EVERY round had been a boss. Used to reject forged cash-out values
 *  while still trusting the client's real (lower) pot. */
export function maxPotForDepth(depth: number): number {
  let total = 0
  for (let d = 1; d <= depth; d++) total += roundContribution(d, true)
  return total
}

/** Hard sanity cap on reported depth (no legit run reaches this; it just
 *  bounds an obviously-forged value). */
export const MAX_GAUNTLET_DEPTH = 60

// ── Enemy scaling curve ──────────────────────────────────────────────────────
// Source enemies keep their pattern / speed / crit / art / signature ability;
// only HP + damage are replaced with this curve so depth-1 and depth-1-boss
// always feel right regardless of which raid the enemy came from.
// Steeper than the old curve so deep hits actually threaten a maxed hull. The
// real escalation, though, is the Curses (below) — raw stats alone can't both
// stay fair to a fresh build AND threaten an endgame one, so depth pressure
// comes mostly from stacking rules, not bigger bars.
function mobHp(depth: number)    { return Math.round(22 + depth * 10) }
function mobMinDmg(depth: number){ return Math.round(3 + depth * 0.9) }
function mobMaxDmg(depth: number){ return Math.round(6 + depth * 1.7) }
const BOSS_HP_MULT  = 3.3
const BOSS_DMG_MULT = 1.5

// ── Roll guardrails ──────────────────────────────────────────────────────────
const FIRST_BOSS_EARLIEST = 4    // no boss before this depth
const BOSS_CHANCE_BASE    = 0.08 // at FIRST_BOSS_EARLIEST
const BOSS_CHANCE_GROWTH  = 0.05 // per depth past earliest
const BOSS_CHANCE_CAP     = 0.55
const BOSS_PITY           = 6    // force a boss after this many bossless rounds (past earliest)

const ELITE_CHANCE_BASE   = 0.06
const ELITE_CHANCE_GROWTH = 0.05 // per depth
const ELITE_CHANCE_CAP    = 0.6

const TIDE_CHANCE         = 0.34 // between-round chance
const TIDE_PITY           = 4    // force a tide after this many tideless rounds
const TIDE_HEAL_HP_PCT    = 0.4  // "low HP" threshold that biases the draw toward recovery

/** Crew abilities + repair reset every this-many cleared rounds (the one
 *  predictable resource the player plans around). */
export const GAUNTLET_COOLDOWN_ROUNDS = 3

// ── Enemy pools ──────────────────────────────────────────────────────────────
// Every non-boss enemy across the four raids (variety of pattern + signature
// ability), and every boss. Built once at module load.
const RAID_CONFIGS = [CORSAIRS_RECKONING, CAPTAIN_KRUST, THE_CARTOGRAPHER, THE_TOLLMASTER]

const MOB_POOL: BroadsideEnemy[] = RAID_CONFIGS.flatMap(c =>
  Object.entries(c.enemies)
    .filter(([key]) => key !== c.bossId)
    .map(([, e]) => e),
)
const BOSS_POOL: BroadsideEnemy[] = RAID_CONFIGS.map(c => c.enemies[c.bossId])

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

/** Overlay the gauntlet curve onto a source enemy, preserving identity
 *  (pattern, art, signature ability, First-Cut startCharges, etc). */
function scaleToCurve(src: BroadsideEnemy, depth: number, isBoss: boolean): BroadsideEnemy {
  const hp  = isBoss ? Math.round(mobHp(depth) * BOSS_HP_MULT) : mobHp(depth)
  const min = Math.round(mobMinDmg(depth) * (isBoss ? BOSS_DMG_MULT : 1))
  const max = Math.round(mobMaxDmg(depth) * (isBoss ? BOSS_DMG_MULT : 1))
  return { ...src, hpBase: hp, minDmg: Math.max(1, min), maxDmg: Math.max(min + 1, max) }
}

export interface GauntletFight {
  enemy: BroadsideEnemy
  isBoss: boolean
  isElite: boolean
  affix?: AffixDef
  /** What this round adds to the pot when cleared. */
  potContribution: number
  /** Display label: depth + a tag for boss / elite. */
  depth: number
}

export interface GauntletRollState {
  /** Rounds cleared so far (the fight being generated is depth = cleared + 1). */
  cleared: number
  prevWasBoss: boolean
  roundsSinceBoss: number
}

/** Generate the next fight. Pure given Math.random; the caller threads the
 *  running guardrail state and updates it from the returned fight. */
export function generateFight(state: GauntletRollState): GauntletFight {
  const depth = state.cleared + 1

  // Boss decision — rising chance, never back-to-back, pity ceiling.
  let isBoss = false
  if (depth >= FIRST_BOSS_EARLIEST && !state.prevWasBoss) {
    if (state.roundsSinceBoss >= BOSS_PITY) {
      isBoss = true
    } else {
      const chance = Math.min(
        BOSS_CHANCE_CAP,
        BOSS_CHANCE_BASE + (depth - FIRST_BOSS_EARLIEST) * BOSS_CHANCE_GROWTH,
      )
      isBoss = Math.random() < chance
    }
  }

  if (isBoss) {
    const enemy = scaleToCurve(pick(BOSS_POOL), depth, true)
    return { enemy, isBoss: true, isElite: false, potContribution: roundContribution(depth, true), depth }
  }

  // Mob — independent elite roll, chance scaling with depth.
  let enemy = scaleToCurve(pick(MOB_POOL), depth, false)
  let isElite = false
  let affix: AffixDef | undefined
  const eliteChance = Math.min(ELITE_CHANCE_CAP, ELITE_CHANCE_BASE + depth * ELITE_CHANCE_GROWTH)
  if (Math.random() < eliteChance) {
    isElite = true
    affix = AFFIXES[rollAffix()]
    enemy = {
      ...enemy,
      hpBase: Math.round(enemy.hpBase * ELITE_HP_MULT),
      minDmg: Math.max(1, Math.round(enemy.minDmg * ELITE_DMG_MULT)),
      maxDmg: Math.max(2, Math.round(enemy.maxDmg * ELITE_DMG_MULT)),
    }
  }
  return { enemy, isBoss: false, isElite, affix, potContribution: roundContribution(depth, false), depth }
}

/** Advance the guardrail state after a fight is generated. */
export function advanceRollState(state: GauntletRollState, fight: GauntletFight): GauntletRollState {
  return {
    cleared: state.cleared + 1,
    prevWasBoss: fight.isBoss,
    roundsSinceBoss: fight.isBoss ? 0 : state.roundsSinceBoss + 1,
  }
}

// ── Tides between rounds ─────────────────────────────────────────────────────
export interface TideRollState {
  roundsSinceTide: number
}
/** Decide whether a Tide fires after THIS round clear (guardrails: pity floor
 *  so recovery is never starved too long). `lowHp` biases nothing here — the
 *  heal-weighting happens at draw time in the host. */
export function shouldFireTide(state: TideRollState): boolean {
  if (state.roundsSinceTide >= TIDE_PITY) return true
  return Math.random() < TIDE_CHANCE
}
export { TIDE_HEAL_HP_PCT }

// ── Cash-out chest ───────────────────────────────────────────────────────────
// Depth-tiered. The multiplier rides on the banked pot; the gem bonus is the
// flat chase. The chest also rolls the two Davy cannons (chestCannonDropChance,
// odds climbing up the ladder) — the named-item chase. Cosmetic drops are still
// a TODO.
export interface ChestTier {
  tier: number
  label: string
  minDepth: number
  /** Multiplier applied to the banked doubloons + XP pot. */
  potMult: number
  /** Flat gem bonus for opening at this tier. */
  gems: number
}
export const CHEST_TIERS: ChestTier[] = [
  { tier: 1, label: 'Waterlogged Chest', minDepth: 0,  potMult: 1.0,  gems: 0  },
  { tier: 2, label: 'Barnacled Strongbox', minDepth: 6,  potMult: 1.1,  gems: 10 },
  { tier: 3, label: 'Drowned Hoard',      minDepth: 10, potMult: 1.2,  gems: 25 },
  { tier: 4, label: "Leviathan's Cache",  minDepth: 14, potMult: 1.35, gems: 50 },
  { tier: 5, label: "Davy Jones' Locker", minDepth: 18, potMult: 1.5,  gems: 90 },
]
export function chestForDepth(depth: number): ChestTier {
  let chest = CHEST_TIERS[0]
  for (const c of CHEST_TIERS) if (depth >= c.minDepth) chest = c
  return chest
}

// Per-chest-tier drop chance for EACH of Davy's two chest cannons (rolled
// independently, only for cannons you don't already own). Super low at the
// shallow chests — possible only if you're very lucky — climbing steeply up the
// ladder so deep runs are the real way to chase them.
const CHEST_CANNON_ODDS: Record<number, number> = {
  1: 0.005, // Waterlogged Chest
  2: 0.015, // Barnacled Strongbox
  3: 0.03,  // Drowned Hoard
  4: 0.06,  // Leviathan's Cache
  5: 0.11,  // Davy Jones' Locker
}
export function chestCannonDropChance(chestTier: number): number {
  return CHEST_CANNON_ODDS[chestTier] ?? 0
}

// ── Curses — the Locker's Pressure ────────────────────────────────────────────
// The descent's escalating difficulty does NOT come from fatter HP bars; it
// comes from rules. At each CURSE_DEPTH the Locker imposes one new curse, drawn
// at random and PERMANENT for the run. They stack, so the deep is defined by
// what the sea has taken from you, not by enemy stats.
//
// Most curses are just a run-wide (allRemaining) TideEffect appended to the
// player's active-effects channel — the exact pipeline the Tides already use,
// so they apply + persist for free. The one exception is Crushing Depth, an
// attrition clock the host applies between fights (hpDrainPct).
export interface GauntletCurse {
  id: string
  name: string
  /** One-line dread, shown on the curse interstitial. */
  flavor: string
  /** Run-wide effects appended to the tide-effect channel when imposed. */
  effects?: TideEffect[]
  /** % of MAX HP the hull sheds at the start of every fight while active. */
  hpDrainPct?: number
}

export const GAUNTLET_CURSES: GauntletCurse[] = [
  {
    id: 'crushing_depth',
    name: 'Crushing Depth',
    flavor: 'The water itself leans on your hull. Every fight begins a little closer to the breaking point.',
    hpDrainPct: 0.08,
  },
  {
    id: 'bloodthirst',
    name: 'Bloodthirst',
    flavor: 'The drowned smell your wake. Every gun down here is aimed to kill, not to warn.',
    effects: [{ kind: 'incomingDmgMult', mult: 1.25, scope: 'allRemaining' }],
  },
  {
    id: 'maelstrom',
    name: 'Maelstrom',
    flavor: 'A black current drags every broadside harder onto your decks.',
    effects: [{ kind: 'incomingDmgMult', mult: 1.2, scope: 'allRemaining' }],
  },
  {
    id: 'becalmed',
    name: 'Becalmed',
    flavor: 'The wind died at this depth. Your ship answers the wheel a beat too slow.',
    effects: [{ kind: 'speedDelta', n: -3, scope: 'allRemaining' }],
  },
  {
    id: 'squall',
    name: 'Squall',
    flavor: 'Salt-spray fouls your powder. Your shots land softer than they should.',
    effects: [{ kind: 'damageMult', mult: 0.9 }],
  },
  {
    id: 'murk',
    name: 'Murk',
    flavor: 'The dark closes over your sights. The perfect shot is a narrower thing now.',
    effects: [{ kind: 'critZoneScale', mult: 0.85 }],
  },
]

// Depths at which the Locker imposes its next curse. One curse per milestone,
// drawn at random from those not yet active; runs deep enough to exhaust the
// list (depth 19+) simply keep every curse stacked.
export const CURSE_DEPTHS = [4, 7, 10, 13, 16, 19]

/** Pick the next curse to impose, given the ids already active. Returns null
 *  once every curse is in play. */
export function drawCurse(activeIds: string[]): GauntletCurse | null {
  const remaining = GAUNTLET_CURSES.filter(c => !activeIds.includes(c.id))
  if (remaining.length === 0) return null
  return remaining[Math.floor(Math.random() * remaining.length)]
}
