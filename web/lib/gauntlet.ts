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

// Cooldown between Gauntlet runs. Measured from when a run STARTS
// (consume-on-start), so a quit-retry can't dodge it. Tune here to make the
// Gauntlet more or less farmable.
export const GAUNTLET_COOLDOWN_HOURS = 1
export const GAUNTLET_COOLDOWN_MS = GAUNTLET_COOLDOWN_HOURS * 60 * 60 * 1000

// ── Launch gate ───────────────────────────────────────────────────────────────
// LIVE since 2026-06-22. Unlocked by clearing Chapter 2 (the chapter_2_class
// node — reachable: Cartographer + Tollmaster Spet are both shipped). The
// chapter-2-clear + depth notifications also gate on this.
export const GAUNTLET_LIVE = true
// The node whose clear means "Chapter 2 done" (RAID_CHAPTERS[1].lastNodeId).
export const GAUNTLET_UNLOCK_NODE = 'chapter_2_class'

/** Has this player unlocked the Gauntlet? Admins always; everyone else only
 *  once it's live AND they've cleared Chapter 2. */
export function gauntletUnlocked(opts: { isAdmin?: boolean | null; clearedNodes?: string[] | null }): boolean {
  if (opts.isAdmin) return true
  return GAUNTLET_LIVE && (opts.clearedNodes ?? []).includes(GAUNTLET_UNLOCK_NODE)
}

// ── Depth unlocks ─────────────────────────────────────────────────────────────
// Reaching these depths permanently unlocks something OUTSIDE a single run.
// One source of truth for the Unlocks panel + the milestone notifications.
export interface GauntletDepthUnlock {
  depth: number
  name: string
  /** Plain one-liner: what reaching this depth gets you. */
  blurb: string
  /** Where the unlocked thing is actually bought / used. */
  where: string
}
export const GAUNTLET_DEPTH_UNLOCKS: GauntletDepthUnlock[] = [
  { depth: 5,  name: 'Auto Catcher',        blurb: 'Auto-reels common & uncommon fish for you, no dial needed.', where: 'Buy it in the Fishing shop' },
  { depth: 10, name: 'Extra Cannonball Rack', blurb: 'Stockpile a 4th cannonball in every raid (volleys still cost 3).', where: 'Buy it in the Locker shop' },
]

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

/** Honest floor estimate of the pot a run reaching `depth` banks: every
 *  cleared round at its non-boss contribution. Real runs land higher (bosses
 *  multiply), so this reads as a conservative "about" for the intro preview. */
export function estimatePotForDepth(depth: number): number {
  let total = 0
  for (let d = 1; d <= depth; d++) total += roundContribution(d, false)
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
// The depth term (slope) is the ramp; the constant (intercept) is the opening
// floor. Raised the intercepts so depths 1-3 aren't pushovers — the slope is
// unchanged so the deep end ramps exactly as before.
function mobHp(depth: number)    { return Math.round(34 + depth * 10) }
function mobMinDmg(depth: number){ return Math.round(5 + depth * 0.9) }
function mobMaxDmg(depth: number){ return Math.round(9 + depth * 1.7) }
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
 *  predictable resource the player plans around). Slower = abilities matter
 *  more, you ration them across a longer stretch. */
export const GAUNTLET_COOLDOWN_ROUNDS = 5

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

// Every ship in the Locker is a drowned thing — reused raid enemies are
// renamed + (in combat) washed cold so the bestiary reads as the Locker's, not
// a campaign shuffle. The CSS filter is layered onto the enemy sprite by
// RaidCombat (enemyArtFilter prop).
export const DROWNED_FILTER = 'grayscale(0.45) brightness(0.82) drop-shadow(0 0 11px rgba(110,220,210,0.6))'

/** Overlay the gauntlet curve onto a source enemy, preserving identity
 *  (pattern, art, signature ability, First-Cut startCharges, etc) but
 *  reframing it as a drowned Locker creature. */
function scaleToCurve(src: BroadsideEnemy, depth: number, isBoss: boolean): BroadsideEnemy {
  const hp  = isBoss ? Math.round(mobHp(depth) * BOSS_HP_MULT) : mobHp(depth)
  const min = Math.round(mobMinDmg(depth) * (isBoss ? BOSS_DMG_MULT : 1))
  const max = Math.round(mobMaxDmg(depth) * (isBoss ? BOSS_DMG_MULT : 1))
  return { ...src, name: drownedName(src.name), hpBase: hp, minDmg: Math.max(1, min), maxDmg: Math.max(min + 1, max) }
}

/** Reframe an enemy as a drowned Locker creature. A leading "The" keeps its
 *  place ("The Cartographer" -> "The Drowned Cartographer"), everything else
 *  takes the prefix ("Barnacle Pete" -> "Drowned Barnacle Pete"). */
function drownedName(name: string): string {
  if (name.includes('Drowned')) return name
  if (name.startsWith('The ')) return `The Drowned ${name.slice(4)}`
  return `Drowned ${name}`
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
  /** Short, plain mechanical summary — the chip + interstitial headline. */
  desc: string
  /** Full plain-English explanation for the details popup (no jargon). */
  detail: string
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
    desc: 'Lose 8% max HP before every fight',
    detail: 'At the start of every fight from now on, your ship loses 8% of its maximum HP. It can never land the killing blow itself (you stop at 1 HP), but it steadily wears you down — this is what caps how deep you can really push.',
    flavor: 'The water itself leans on your hull. Every fight begins a little closer to the breaking point.',
    hpDrainPct: 0.08,
  },
  {
    id: 'bloodthirst',
    name: 'Bloodthirst',
    desc: 'Enemies deal 25% more damage',
    detail: 'Every hit an enemy lands on you deals 25% more damage for the rest of the run.',
    flavor: 'The drowned smell your wake. Every gun down here is aimed to kill, not to warn.',
    effects: [{ kind: 'incomingDmgMult', mult: 1.25, scope: 'allRemaining' }],
  },
  {
    id: 'becalmed',
    name: 'Becalmed',
    desc: '-3 ship speed',
    detail: 'Your ship is 3 slower. Speed decides who fires first each turn and how fast your aim bar sweeps, so you will act after the enemy more often and have less time to line up a shot.',
    flavor: 'The wind died at this depth. Your ship answers the wheel a beat too slow.',
    effects: [{ kind: 'speedDelta', n: -3, scope: 'allRemaining' }],
  },
  {
    id: 'murk',
    name: 'Murk',
    desc: 'Your crit zone is 15% smaller',
    detail: 'The gold "perfect shot" band on your aim bar shrinks by 15%, so landing a critical hit is harder.',
    flavor: 'The dark closes over your sights. The perfect shot is a narrower thing now.',
    effects: [{ kind: 'critZoneScale', mult: 0.85 }],
  },
  // ── Aim-game disruptors — the deep messes with how you SHOOT, not just your
  //    stats. These change the aim bar visually + by feel for the rest of the run.
  {
    id: 'sounding_fog',
    name: 'Sounding Fog',
    desc: 'Fog rolls over your aim bar',
    detail: 'A bank of fog drifts back and forth across your aim bar, hiding the gold crit band as it passes. Lock your shots by rhythm, not by sight.',
    flavor: 'The water goes blind at this depth. You fire at shapes in the murk.',
    effects: [{ kind: 'aimFog', density: 0.55 }],
  },
  {
    id: 'racing_tide',
    name: 'Racing Tide',
    desc: 'Your aim needle sweeps faster',
    detail: 'Your aiming needle whips back and forth far quicker for the rest of the run, so the window to lock a clean shot is much tighter.',
    flavor: 'A fast current rips down the deck. The wheel will not hold still.',
    effects: [{ kind: 'aimSpeedMult', mult: 1.6 }],
  },
  {
    id: 'roiling_sea',
    name: 'Roiling Sea',
    desc: 'The target band lurches',
    detail: 'The gold target band slides across your aim bar much faster and wilder, so where the perfect shot sits is a moving guess every turn.',
    flavor: 'The sea heaves under you. Nothing you aim at stays where you left it.',
    effects: [{ kind: 'zoneSpeedMult', mult: 2.2 }],
  },
  {
    id: 'riptide',
    name: 'Riptide',
    desc: 'Needle AND target both speed up',
    detail: 'Both your aiming needle and the gold target band move faster for the rest of the run. Less time to lock, and a moving mark to lock onto.',
    flavor: 'Two currents cross beneath the hull and tear the deck every way at once.',
    effects: [{ kind: 'aimSpeedMult', mult: 1.3 }, { kind: 'zoneSpeedMult', mult: 1.6 }],
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

// ── Boons — the descent's gifts ───────────────────────────────────────────────
// The flip side of Curses: at each BOON_DEPTH the player DRAFTS one of three
// powers, permanent for the run and STACKABLE (draft the same boon twice and it
// compounds). This is the build-craft / agency layer — every descent plays
// differently, and the boons are the player's answer to the curses (Ironhide
// vs Bloodthirst, Bilge Pump vs Crushing Depth, and so on).
//
// Each boon is a single run-wide TideEffect, so it rides the same active-effect
// pipeline the Tides + Curses use. `desc` is the player-facing summary chip.
export interface GauntletBoon {
  id: string
  name: string
  flavor: string
  /** Short, plain mechanical summary — the draft chip + breather chip. */
  desc: string
  /** Full plain-English explanation for the details popup (no jargon). */
  detail: string
  effect: TideEffect
}

export const GAUNTLET_BOONS: GauntletBoon[] = [
  { id: 'broadside_mastery', name: 'Broadside Mastery', flavor: 'Your gunners find their rhythm. Everything you fire bites harder.', desc: '+15% damage', detail: 'Every shot you fire — both aimed shots and volleys — deals 15% more damage.', effect: { kind: 'damageMult', mult: 1.15 } },
  { id: 'powder_and_shot',   name: 'Powder & Shot',     flavor: 'Dry powder, packed tight. Your aimed shots punch through.',       desc: '+20% aimed-shot damage', detail: 'Your single aimed shots (the Fire action) deal 20% more damage. Does not affect volleys.', effect: { kind: 'fireDmgMult', mult: 1.2 } },
  { id: 'grapeshot',         name: 'Grapeshot',          flavor: 'A scatter of iron off the rails. Your volleys shred.',            desc: '+20% volley damage', detail: 'Your volleys (the double-shot) deal 20% more damage. Does not affect single aimed shots.', effect: { kind: 'volleyDmgMult', mult: 1.2 } },
  { id: 'dead_eye',          name: 'Dead-Eye',           flavor: 'You learn exactly where a hull wants to break.',                  desc: '+8% crit chance', detail: 'Every shot has an extra 8% chance to land as a critical hit (extra damage).', effect: { kind: 'critChanceBonus', chance: 0.08 } },
  { id: 'wide_sights',       name: 'Wide Sights',        flavor: 'The perfect shot stops being luck.',                              desc: 'Bigger crit zone', detail: 'The gold "perfect shot" band on your aim bar is 12% wider, so landing a critical hit is easier.', effect: { kind: 'critZoneScale', mult: 1.12 } },
  { id: 'ironhide',          name: 'Ironhide',           flavor: 'Plates doubled along the waterline.',                             desc: 'Take 12% less damage', detail: 'Every hit an enemy lands on you deals 12% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.88, scope: 'allRemaining' } },
  { id: 'press_the_powder',  name: 'Press the Powder',   flavor: 'Your crew loads like the deep is at their heels.',                desc: 'Reloads can load extra', detail: 'Each time you reload, there is a 10% chance to chamber an extra cannonball on top.', effect: { kind: 'reloadProc', chance: 0.1, bonusCharges: 1 } },
  { id: 'following_sea',     name: 'Following Sea',      flavor: 'The current finally runs with you.',                             desc: '+2 ship speed', detail: 'Your ship is 2 faster. Speed decides who fires first each turn and how fast your aim bar sweeps, so you act first more often.', effect: { kind: 'speedDelta', n: 2, scope: 'allRemaining' } },
  { id: 'bilge_pump',        name: 'Bilge Pump',         flavor: 'Patch the seams in the lull before the next gun.',                desc: 'Heal 6 HP each fight', detail: 'At the start of every fight, your ship repairs 6 HP — a steady answer to the deep wearing you down.', effect: { kind: 'startOfFightHeal', n: 6 } },
  { id: 'ghostward',         name: 'Ghostward',          flavor: 'Salt and cold iron at the rails. The drowned aim wide.',          desc: 'Enemies crit 12% less', detail: 'Enemies are 12% less likely to land a critical hit on you.', effect: { kind: 'incomingCritReduction', chance: 0.12 } },
]

// Depths at which the player drafts a boon — offset from CURSE_DEPTHS so the
// descent alternates gift and toll.
export const BOON_DEPTHS = [2, 5, 8, 11, 14, 17, 20, 23]

/** Offer `n` distinct boons to draft (boons CAN repeat across drafts to stack,
 *  but a single draft never shows the same boon twice). */
export function drawBoons(n: number): GauntletBoon[] {
  const pool = [...GAUNTLET_BOONS]
  const out: GauntletBoon[] = []
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return out
}

// ── Depth bands + Davy's voice ────────────────────────────────────────────────
// The descent is a place, not a treadmill. Each band has its own name (shown on
// the plunge + the depth bar) and the deeper bands pair with the darker combat
// atmosphere already wired in atmosphereForDepth.
export interface DepthBand { name: string; minDepth: number }
export const DEPTH_BANDS: DepthBand[] = [
  { name: 'The Shallows of the Dead', minDepth: 1 },
  { name: 'The Crush',                minDepth: 6 },
  { name: "Davy's Court",             minDepth: 13 },
]
export function bandForDepth(depth: number): DepthBand {
  let band = DEPTH_BANDS[0]
  for (const b of DEPTH_BANDS) if (depth >= b.minDepth) band = b
  return band
}

// Davy Jones taunts the descent at set depths — his voice from the dark, so the
// mode that bears his name actually has him in it. Returns null on quiet depths.
const DAVY_TAUNTS: Record<number, string> = {
  3:  'Down you come. They all come down, in the end.',
  6:  'The Crush has you now. Feel it on your hull?',
  9:  'Still breathing? The deep is patient. So am I.',
  13: 'You stand in my court, captain. None leave it but as crew.',
  16: 'Deeper. Yes. Bring me all of it before you sink.',
  20: 'No light reaches here. Only me. Only the Locker.',
}
export function davyTaunt(depth: number): string | null {
  return DAVY_TAUNTS[depth] ?? null
}
