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
  THE_COFFERS_FLEET, THE_QUARTERMASTER, THE_BLOCKADE, THE_THRONE,
  type BroadsideEnemy, type BossPhase, type BossMechanicCheck,
} from './bossRaids'
import {
  CORSAIRS_RECKONING_CHALLENGE, CAPTAIN_KRUST_CHALLENGE,
  THE_CARTOGRAPHER_CHALLENGE, THE_TOLLMASTER_CHALLENGE,
} from './raidChallenge'
import { AFFIXES, ALL_AFFIX_IDS, ELITE_HP_MULT, ELITE_DMG_MULT, rollAffix, rollSecondAffix, mergeAffixes, type AffixDef } from './raidAffixes'
import { type TideEffect } from './tides'
import { type ChosenMark } from './gauntletMarks'
import { NO_TERM_EFFECTS, type TermEffects, PRESSURE_SKIN_ID, pressureSkinDropChance } from './gauntletTerms'
import { CHEST_ODDS_CAP } from './gauntletOffer'

// ── Economy ────────────────────────────────────────────────────────────────
// Per-round pot contribution = POT_BASE + POT_GROWTH * min(depth, POT_FLATTEN).
// A boss round multiplies that by BOSS_POT_MULT. The cash-out chest multiplier
// rides on top. Tuned against a Tollmaster CHALLENGE clear (~1,980 ⟡): shallow
// bail (~depth 5) ~1,300; depth 12 ~3.6×; depth 20 ~9×.
//
// 2026-07-01 — the contribution FLATTENS past POT_FLATTEN_DEPTH (20). Cumulative
// pot was quadratic, so once shrine + confluences made depth 30-40 common,
// deep cash-outs paid 3-5× the tuned ceiling. Past depth 20 each round now adds
// a constant (the depth-20 value) instead of a growing amount — deeper still
// pays more, just not runaway-more. Shallow/mid (<= 20) is unchanged.
// Nav XP is DECOUPLED onto its own gentler curve (gauntletXpForDepth) because
// leveling was the sharper problem — a deep dive was 6-8 nav levels.
export const POT_BASE = 80
export const POT_GROWTH = 50
export const BOSS_POT_MULT = 3
const POT_FLATTEN_DEPTH = 20

// Cooldown between Gauntlet runs. Measured from when a run STARTS
// (consume-on-start), so a quit-retry can't dodge it. Tune here to make the
// Gauntlet more or less farmable.
// REMOVED FOR NOW (2026-06-23): 0 = no cooldown, runs are unlimited. Set back
// to 1 (or higher) to re-gate. The run-start stamp still fires, so the
// leaderboard time keeps working with the cooldown off.
export const GAUNTLET_COOLDOWN_HOURS = 0
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

// ── Don's Gauntlet (Gauntlet 2) ───────────────────────────────────────────────
// The endgame variant, led by the ghost of Don Finleone: Chapter 3+4 enemies,
// its own steeper curve + upgrade tree, shared Fathoms (2× rate). Built by
// PARAMETERIZING this gauntlet with a `variant` dial rather than forking it —
// 'davy' = the classic Ch1-2 gauntlet, 'don' = this one. Pools/curve/rewards/
// theme/boon-pool all key off the variant. See project_dons_gauntlet_plan.
export type GauntletVariant = 'davy' | 'don'

// Master switch (mirrors GAUNTLET_LIVE). LIVE since 2026-07-20 — open to any
// captain who has beaten Don Finleone (the_throne clear = all of Chapter 4).
export const DONS_GAUNTLET_LIVE = true
/** Has this player unlocked Don's Gauntlet? Admins always; everyone else only
 *  once it's live AND they've finished the campaign (beat Don Finleone = the
 *  `the_throne` raid clear), NOT a node clear like the classic gauntlet. */
export function donsGauntletUnlocked(opts: { isAdmin?: boolean | null; throneCleared?: boolean | null }): boolean {
  if (opts.isAdmin) return true
  return DONS_GAUNTLET_LIVE && !!opts.throneCleared
}

// Which gauntlet a boon / curse / confluence belongs to. OMITTED = both. So the
// recycled Davy pool is left untagged (draws in both), and G2-only entries are
// tagged 'don' (never surface in Davy). The draw fns filter by the run's variant.
export type GauntletTag = GauntletVariant | 'both'
export function inGauntletPool(tag: GauntletTag | undefined, variant: GauntletVariant): boolean {
  return !tag || tag === 'both' || tag === variant
}

// ── Hardcore mode ─────────────────────────────────────────────────────────────
// The Hardcore Gauntlet: the crew SQUAD you send in (your raid party) is lost
// FOR GOOD if you die or abandon, tracked on its own hiscore (the Drowned
// Ledger). Same depth-scaled enemies as normal — the stake IS the difficulty.
//
// LIVE to everyone (2026-07-08). Gated per-player by hardcoreUnlocked (Gauntlet
// unlocked + normal-Gauntlet depth >= HC_UNLOCK_DEPTH); the server enforces it
// in startGauntletRun, so the action can't be forced. Set false to pull it back.
export const HARDCORE_LIVE = true
// Player-facing unlock once HARDCORE_LIVE: needs the Gauntlet unlocked AND a
// normal-Gauntlet depth floor, so newcomers can't blind-permakill their crew.
export const HC_UNLOCK_DEPTH = 5
// Hardcore is capped at N runs per UTC day (the normal Gauntlet has no
// cooldown). Counted via gauntlet_hc_runs_today, reset when the UTC date rolls
// over (tracked against gauntlet_hc_last_run_at); admins bypass for testing.
export const HARDCORE_RUNS_PER_DAY = 3
// Hardcore pays EXACTLY like normal Gauntlet now (no 2× premium) — the only
// added benefit is Blood Gems (below). Kept as 1× constants so callsites read
// clearly and can be re-tuned in one place.
export const HC_FATHOMS_MULT = 1
export const HC_SURVIVOR_XP_MULT = 1

// ── Blood Gems ────────────────────────────────────────────────────────────────
// The Hardcore Gauntlet's premium currency. Dropped ONLY in the cash-out chest
// (survive + cash out; die = none). Spent in the Crew Hall on blood-charged
// rerolls + a random-skin gamble. Shown only in the Gauntlet + Recruit Hall.
export const BLOOD_GEM_MIN_PER_DEPTH = 0.5
export const BLOOD_GEM_MAX_PER_DEPTH = 0.7
// Deep-run ramp (2026-07-12): the per-depth rate CLIMBS with depth so a deep
// Hardcore run pays close to 1 Blood Gem per depth — shallow triple-dipping
// (3 runs/day) stays at the old ~0.5–0.7 rate, real dives get rewarded.
// Ramps linearly from BLOOD_GEM_RAMP_START to _END: at 60+ the roll band is
// ~0.95–1.0/depth (a depth-60 cash-out ≈ 57–60 gems vs the old ~30–42).
const BLOOD_GEM_RAMP_START = 20
const BLOOD_GEM_RAMP_END   = 60
const BLOOD_GEM_DEEP_MIN   = 0.95
const BLOOD_GEM_DEEP_MAX   = 1.0
/** Blood Gems earned on a Hardcore cash-out at `depth`. `rand` ∈ [0,1) — pass
 *  Math.random() at the callsite so the amount is a live server roll. */
export function bloodGemsForDepth(depth: number, rand: number): number {
  const t = Math.max(0, Math.min(1, (depth - BLOOD_GEM_RAMP_START) / (BLOOD_GEM_RAMP_END - BLOOD_GEM_RAMP_START)))
  const min = BLOOD_GEM_MIN_PER_DEPTH + (BLOOD_GEM_DEEP_MIN - BLOOD_GEM_MIN_PER_DEPTH) * t
  const max = BLOOD_GEM_MAX_PER_DEPTH + (BLOOD_GEM_DEEP_MAX - BLOOD_GEM_MAX_PER_DEPTH) * t
  const per = min + (max - min) * rand
  return Math.max(0, Math.round(Math.max(0, depth) * per))
}
/** Skin gamble: this many Blood Gems → one random UNOWNED non-legendary skin. */
export const BLOOD_SKIN_GAMBLE_COST = 250
/** Blood-charged reroll tiers. Attaching a tier to a gem reroll swaps the
 *  per-candidate C/R/E/L weights for the tier's (in place of GEM_WEIGHTS),
 *  boosting Epic + a light Legendary nudge. Weights sum to 100 = exact per-
 *  candidate %s. */
export interface BloodRerollTier { id: string; name: string; bloodCost: number; weights: [number, number, number, number] }
export const BLOOD_REROLL_TIERS: BloodRerollTier[] = [
  // Per-candidate C/R/E/L (sum 100). Tuned so the PER-REROLL (3 candidates)
  // odds land on the round targets: Bloodied ≈ 33% Epic / 1-in-30 Legendary,
  // Sanguine ≈ 50% Epic / 1-in-15 Legendary. (Base gem reroll ≈ 10% / 1-in-52.)
  { id: 'bloodied', name: 'Bloodied', bloodCost: 15, weights: [52.38, 34, 12.5,  1.12] },
  { id: 'sanguine', name: 'Sanguine', bloodCost: 40, weights: [43.10, 34, 20.63, 2.27] },
]
export function bloodRerollTier(id: string | null | undefined): BloodRerollTier | undefined {
  return id ? BLOOD_REROLL_TIERS.find(t => t.id === id) : undefined
}

/** Can this player actually START a hardcore run right now? Admins always (for
 *  pre-launch testing); everyone else only once HARDCORE_LIVE + the Gauntlet is
 *  unlocked + they've reached HC_UNLOCK_DEPTH in the normal Gauntlet. */
export function hardcoreUnlocked(opts: { isAdmin?: boolean | null; clearedNodes?: string[] | null; deepest?: number | null }): boolean {
  if (opts.isAdmin) return true
  if (!HARDCORE_LIVE) return false
  return gauntletUnlocked({ isAdmin: false, clearedNodes: opts.clearedNodes }) && (opts.deepest ?? 0) >= HC_UNLOCK_DEPTH
}

/** Can this player start a DON'S hardcore run? The Throne cleared, AND
 *  HC_UNLOCK_DEPTH reached in his NORMAL descent first.
 *
 *  The depth floor is deliberate and is not the same ask as Davy's. Clearing the
 *  campaign gets you through his door; it says nothing about whether you can
 *  handle the pool behind it, which fights with barriers, ultimates and
 *  afflictions the Davy pool never had. Five depths of his normal descent is a
 *  cheap, honest rehearsal, and it means nobody's first taste of the Ch3/Ch4
 *  enemies is a run where the crew does not come back. */
export function donsHardcoreUnlocked(opts: { isAdmin?: boolean | null; throneCleared?: boolean | null; donsDeepest?: number | null }): boolean {
  if (opts.isAdmin) return true
  if (!HARDCORE_LIVE) return false
  return donsGauntletUnlocked({ isAdmin: false, throneCleared: opts.throneCleared }) && (opts.donsDeepest ?? 0) >= HC_UNLOCK_DEPTH
}

/** The profile columns each descent keeps its hardcore state in. Don's runs are
 *  SEPARATE from Davy's end to end: its own deepest, its own daily budget of
 *  HARDCORE_RUNS_PER_DAY, its own Drowned Ledger. Two descents that scale
 *  differently, drop different chases and sign different terms have no business
 *  sharing a record.
 *
 *  gauntlet_hc_squad is deliberately NOT in here. Only one run is ever open at a
 *  time (gauntlet_run_open / gauntlet_run_variant are singular), so the squad
 *  currently at risk is singular too. */
export const HC_COLUMNS = {
  davy: {
    deepest: 'gauntlet_hc_deepest', deepestDied: 'gauntlet_hc_deepest_died',
    deepestRun: 'gauntlet_hc_deepest_run', lastRun: 'gauntlet_hc_last_run',
    lastRunAt: 'gauntlet_hc_last_run_at', runsToday: 'gauntlet_hc_runs_today',
    bestDepth: 'gauntlet_hc_best_depth', bestMs: 'gauntlet_hc_best_depth_ms',
    bestAt: 'gauntlet_hc_best_depth_at', bestPressure: 'gauntlet_hc_best_pressure',
    ledger: 'leaderboard_gauntlet_hardcore',
  },
  don: {
    deepest: 'dons_gauntlet_hc_deepest', deepestDied: 'dons_gauntlet_hc_deepest_died',
    deepestRun: 'dons_gauntlet_hc_deepest_run', lastRun: 'dons_gauntlet_hc_last_run',
    lastRunAt: 'dons_gauntlet_hc_last_run_at', runsToday: 'dons_gauntlet_hc_runs_today',
    bestDepth: 'dons_gauntlet_hc_best_depth', bestMs: 'dons_gauntlet_hc_best_depth_ms',
    bestAt: 'dons_gauntlet_hc_best_depth_at', bestPressure: 'dons_gauntlet_hc_best_pressure',
    ledger: 'leaderboard_dons_gauntlet_hardcore',
  },
} as const

export function hcCols(variant: GauntletVariant) {
  return HC_COLUMNS[variant === 'don' ? 'don' : 'davy']
}

// Hardcore-only cosmetic unlocks — reaching these HARDCORE depths (on cash-out)
// would permanently grant a Drowned Fleet ship skin. EMPTIED 2026-07-08: the
// hull skins aren't ready (placeholder art), so nothing is granted for now. The
// cash-out grant + reward-unlock plumbing already no-ops on an empty list.
// Repopulate (and re-add the defs in lib/shipSkins) when real art lands.
export interface HardcoreUnlock {
  depth: number
  skinId: string
  name: string
}
export const HARDCORE_UNLOCKS: HardcoreUnlock[] = []

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

/** ⟡ a single cleared round at this depth adds to the pot (flattens past
 *  POT_FLATTEN_DEPTH so deep runs stop scaling quadratically). Don's Gauntlet
 *  swells the pot ×DONS_POT_MULT — doubloons are DEMOTED to stakes there, so a
 *  bigger pot just makes the push-your-luck gamble sting more on a sink. */
export function roundContribution(depth: number, isBoss: boolean, variant: GauntletVariant = 'davy'): number {
  const base = POT_BASE + POT_GROWTH * Math.min(depth, POT_FLATTEN_DEPTH)
  return Math.round(base * (isBoss ? BOSS_POT_MULT : 1) * (variant === 'don' ? DONS_POT_MULT : 1))
}

// Nav XP earned by cashing out at `depth`, DECOUPLED from the doubloon pot and
// on a gentler curve (lower growth + flattens earlier at XP_FLATTEN_DEPTH) so a
// deep dive doesn't fast-level players. A typical-boss uplift (XP_BOSS_FACTOR)
// is baked in so it stays comparable to the old pot-derived XP at shallow depth.
// The cash-out chest multiplier rides on top of this (see cashOutGauntlet).
// Tuned 2026-07-02 against real pace data (~55-69 depth/hr) to a TARGET RATE of
// ~50-60k Nav XP/hr: deep dives (depth 35-45) land ~50-55k/hr, steady-state ~60k.
// GROWTH 40→25 pulled it down from ~72-82k/hr. Retune GROWTH to move the rate.
const XP_BASE = 80
const XP_GROWTH = 25
const XP_FLATTEN_DEPTH = 15
const XP_BOSS_FACTOR = 1.35
// Don's Gauntlet reward multipliers (variant 'don'). Fathoms is the headline
// draw (2×); Nav XP + crew XP are modest bumps. The pot swells 1.5× (doubloons
// = stakes, so a deeper sink stings more) and chests hand out 1.5× the gems
// (the genuinely-valuable chest reward). NOTE: chest potMult is left SHARED on
// purpose — it multiplies Nav XP too, and a richer potMult would double-dip
// past the intended 1.2× XP. Reward-depth cap stays shared at 70 (a harder mode
// earning more per depth is the point). Ship + tune live on kingkong.
export const DONS_FATHOM_MULT   = 2
export const DONS_XP_MULT       = 1.2
export const DONS_CREW_XP_MULT  = 1.25
export const DONS_POT_MULT      = 1.5
export const DONS_CHEST_GEM_MULT = 1.5
export function gauntletXpForDepth(depth: number, variant: GauntletVariant = 'davy'): number {
  let total = 0
  for (let d = 1; d <= Math.max(0, Math.floor(depth)); d++) {
    total += XP_BASE + XP_GROWTH * Math.min(d, XP_FLATTEN_DEPTH)
  }
  return Math.round(total * XP_BOSS_FACTOR * (variant === 'don' ? DONS_XP_MULT : 1))
}

// CREW XP from a Gauntlet cash-out at `depth`, on a MUCH smaller scale than the
// player's Nav XP. Crew leveling is tuned against RAIDS (~910 XP/raid, ~278
// raids to max a crew — see lib/crewLevel), but the Gauntlet used to mirror its
// big Nav XP to crew, maxing them in a couple of dives. Now a run is worth
// roughly depth/6 raids of crew XP (depth 30 ≈ 4,500 ≈ 5 raids; ~42 depth-40
// dives to max one crew). Granted per-assigned-crew, cash-out only.
const CREW_XP_PER_DEPTH = 150
export function gauntletCrewXp(depth: number, variant: GauntletVariant = 'davy'): number {
  return Math.round(Math.max(0, Math.floor(depth)) * CREW_XP_PER_DEPTH * (variant === 'don' ? DONS_CREW_XP_MULT : 1))
}

/** Server-side ceiling for a reported depth: the pot the player would have
 *  if EVERY round had been a boss. Used to reject forged cash-out values
 *  while still trusting the client's real (lower) pot. */
export function maxPotForDepth(depth: number, variant: GauntletVariant = 'davy'): number {
  let total = 0
  for (let d = 1; d <= depth; d++) total += roundContribution(d, true, variant)
  return total
}

/** Fathoms — the Gauntlet's own meta-currency — earned for reaching a given
 *  depth on a run. Banked whether you cash out OR sink, so it rewards how deep
 *  you got, not whether you played it safe. One Fathom per depth cleared. Spent
 *  on permanent Locker Upgrades + the Auto Catcher. */
export function fathomsForDepth(depth: number, variant: GauntletVariant = 'davy'): number {
  const base = Math.max(0, Math.floor(depth))
  return variant === 'don' ? base * DONS_FATHOM_MULT : base
}

/** Honest floor estimate of the pot a run reaching `depth` banks: every
 *  cleared round at its non-boss contribution. Real runs land higher (bosses
 *  multiply), so this reads as a conservative "about" for the intro preview. */
export function estimatePotForDepth(depth: number, variant: GauntletVariant = 'davy'): number {
  let total = 0
  for (let d = 1; d <= depth; d++) total += roundContribution(d, false, variant)
  return total
}

/** Hard sanity cap on reported depth — bounds an obviously-forged value.
 *  RAISED 60 → 100 (2026-07-11): the HP-scaling boons made 60+ legitimately
 *  reachable and the old cap silently clamped a real depth-70 cash-out to 60
 *  (record, pot, Fathoms, ledger — everything). Raise it again if real runs
 *  ever approach 100. */
export const MAX_GAUNTLET_DEPTH = 100

/** Economy ceiling: pot / Nav XP / crew XP / Blood Gems all pay as if the run
 *  ended here, no matter how much deeper it went. Depth PAST this still counts
 *  for the record, the leaderboard, the contest, and Fathoms — you dive past
 *  70 for glory, not doubloons. (Also the client-side pot gate: fights beyond
 *  this contribute 0 to the pot, so the HUD never shows money the cash-out
 *  won't pay.) */
export const GAUNTLET_REWARD_DEPTH_CAP = 70

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
// ── The Crush band (depth 60+) ───────────────────────────────────────────────
// Past DEEP_BEND_START the linear curve gently COMPOUNDS (2026-07-11): player
// power is multiplicative (boons draft every ~2.5 depths forever) while the
// base curve is linear, so past ~45 deep runs became victory laps — 60 fell
// same-day once the old depth cap lifted. A slight 1.03/depth bend puts a real
// wall back without touching the tuned 1-60 game: ×1.34 @ 70, ×1.81 @ 80,
// ×2.43 @ 90, ×3.26 @ 100. Rewards already cap at 70, so past there the bend
// only guards the record. Companion pressure: The Crush curse + always-paired
// elite affixes below.
export const DEEP_BEND_START = 60
const DEEP_BEND_RATE = 1.03
function deepBend(depth: number): number {
  return depth > DEEP_BEND_START ? Math.pow(DEEP_BEND_RATE, depth - DEEP_BEND_START) : 1
}
function mobHp(depth: number)    { return Math.round((34 + depth * 10) * deepBend(depth)) }
function mobMinDmg(depth: number){ return Math.round((5 + depth * 0.9) * deepBend(depth)) }
function mobMaxDmg(depth: number){ return Math.round((9 + depth * 1.7) * deepBend(depth)) }
const BOSS_HP_MULT  = 2.8
const BOSS_DMG_MULT = 1.5

// ── Roll guardrails ──────────────────────────────────────────────────────────
// Boss cadence. Every boss FULLY refreshes crew abilities (a breather), so
// bosses appearing too often actually made deep runs EASIER, not harder —
// thinned out here so refreshes are earned, not constant. Deep steady-state is
// now ~a boss every 4 rounds (was ~2.8) with a longer pity floor.
const FIRST_BOSS_EARLIEST = 4    // no boss before this depth
const BOSS_CHANCE_BASE    = 0.08 // at FIRST_BOSS_EARLIEST
const BOSS_CHANCE_GROWTH  = 0.035 // per depth past earliest
const BOSS_CHANCE_CAP     = 0.35
const BOSS_PITY           = 9    // force a boss after this many bossless rounds (past earliest)

const ELITE_CHANCE_BASE   = 0.06
const ELITE_CHANCE_GROWTH = 0.05 // per depth
const ELITE_CHANCE_CAP    = 0.6
const DUAL_AFFIX_MIN_DEPTH = 30  // from here, elites can roll a SECOND affix
const DUAL_AFFIX_CHANCE    = 0.3 // chance an elite past that depth carries two
// The Crush band: past DEEP_BEND_START every elite carries TWO affixes
// (guaranteed) and can roll a third.
const TRIPLE_AFFIX_CHANCE  = 0.25


// ── Enemy pools ──────────────────────────────────────────────────────────────
// Every non-boss enemy across the four raids (variety of pattern + signature
// ability), and every boss. Built once at module load.
const RAID_CONFIGS = [CORSAIRS_RECKONING, CAPTAIN_KRUST, THE_CARTOGRAPHER, THE_TOLLMASTER]

const MOB_POOL: BroadsideEnemy[] = RAID_CONFIGS.flatMap(c =>
  Object.entries(c.enemies)
    .filter(([key]) => key !== c.bossId)
    .map(([, e]) => e),
)
// Bosses are drawn from the CHALLENGE variants so their two-phase fights can
// carry into the Gauntlet — every challenge boss has a half-HP revive (Pete =
// aggression, Krust = plate, Cartographer = fog-and-parry, Spet = doubled
// cadence). The challenge HP/dmg buffs are harmless here: scaleToCurve
// overwrites HP + damage with the Gauntlet depth curve, so the ONLY thing the
// challenge config adds is the boss's phase2 — which scaleToCurve then GATES to
// deep runs only (stripped at/below PHASE2_BOSS_MIN_DEPTH).
const BOSS_CONFIGS = [
  CORSAIRS_RECKONING_CHALLENGE, CAPTAIN_KRUST_CHALLENGE,
  THE_CARTOGRAPHER_CHALLENGE, THE_TOLLMASTER_CHALLENGE,
]
const BOSS_POOL: BroadsideEnemy[] = BOSS_CONFIGS.map(c => c.enemies[c.bossId])

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// Every ship in the Locker is a drowned thing — reused raid enemies are
// renamed + (in combat) washed cold so the bestiary reads as the Locker's, not
// a campaign shuffle. The CSS filter is layered onto the enemy sprite by
// RaidCombat (enemyArtFilter prop). NOTE: this is desaturation/dim ONLY — no
// drop-shadow glow. An earlier teal drop-shadow traced the sprite's near-
// rectangular footprint and, against the dark abyss backdrop, read as a lit
// BOX around the boat rather than a glow on it. The cold wash carries the
// drowned look on its own.
export const DROWNED_FILTER = 'grayscale(0.5) brightness(0.8) contrast(1.05)'

// ── Don's Gauntlet (variant 'don') — Ch3+4 enemies, a steeper curve, a crimson
//    ghost-fleet reskin. generateFight/scaleToCurve pick these by variant. ──────
const RAID_CONFIGS_2 = [THE_COFFERS_FLEET, THE_QUARTERMASTER, THE_BLOCKADE, THE_THRONE]
// Mobs = every non-boss enemy across raids 5-8, MINUS the Closer (the_consigliere:
// a mini-boss, slice 2) and each raid's own boss.
const MOB_POOL_2: BroadsideEnemy[] = RAID_CONFIGS_2.flatMap(c =>
  Object.entries(c.enemies)
    .filter(([key]) => key !== c.bossId && key !== 'the_consigliere')
    .map(([, e]) => e),
)
// Random boss pool = Ruse / Quartermaster / Sal (the Ch3/4 base bosses, which
// already carry their own phases). Don Finleone is PULLED OUT → the rare apex
// event (slice 2), never a random boss.
const BOSS_POOL_2: BroadsideEnemy[] = [THE_COFFERS_FLEET, THE_QUARTERMASTER, THE_BLOCKADE].map(c => c.enemies[c.bossId])

// G2 curve: much higher baseline + steeper slope (an endgame captain one-shots
// Davy's mid mobs) + the Crush band starts earlier. Ship + tune live on kingkong.
const DEEP_BEND_START_2 = 48
function deepBend2(depth: number): number {
  return depth > DEEP_BEND_START_2 ? Math.pow(DEEP_BEND_RATE, depth - DEEP_BEND_START_2) : 1
}
// Early-depth damage grace (Don's Gauntlet) — 2026-07-28. Reaching the first Don
// Finleone rise at depth 20 was a touch too spiky: HP was already cut hard, so
// what ends early runs is incoming DAMAGE. Ease enemy damage in the 1-20 climb,
// fading to full EXACTLY at depth 20 — so the depth-20 Don himself (built at
// grace 1.0), the pot/kill pacing (HP untouched), and the deep record band all
// stay put; only the run up to the first landmark gets a bit more forgiving.
// 0.80 at depth 1 → 1.0 at depth 20 (linear).
const EARLY_GRACE_END_2 = 20
function earlyDmgGrace2(depth: number): number {
  if (depth >= EARLY_GRACE_END_2) return 1
  return 0.80 + 0.20 * ((depth - 1) / (EARLY_GRACE_END_2 - 1))
}
// Early-depth HP grace (Don's Gauntlet) — 2026-07-28. Even after the -47% HP cut
// the shallow end read as tanky: a depth-5 ELITE is base×1.5, so ~335 → 500+ HP
// (and its barrier affix is a % of that — the "90 shield"). Ease base HP across
// the 1-20 climb, fading to full EXACTLY at depth 20, so elites/bosses/barriers
// all shrink proportionally on the way to the first Don rise while the landmark
// itself (grace 1.0), pot/XP pacing (reward is depth-based, not HP), and the deep
// record band stay untouched. 0.70 at depth 1 → 1.0 at depth 20 (linear).
function earlyHpGrace2(depth: number): number {
  if (depth >= EARLY_GRACE_END_2) return 1
  return 0.70 + 0.30 * ((depth - 1) / (EARLY_GRACE_END_2 - 1))
}
// Early-depth aim-bar grace (Don's Gauntlet) — 2026-07-29. Ease the enemy's OWN
// aim disruption on the climb to the first Don rise: the Mist Veil fog
// (aimFogDensity) and the racing target band / needle (zone + aim speed) that
// the ghost fleet carries. Their signature aim kit still reads, it just doesn't
// blind you at the shallow end; fades to full by depth 20. Elite AFFIXES and
// Locker curses are separate sources and stay untouched. 0.70 at depth 1 → 1.0.
function earlyAimGrace2(depth: number): number {
  if (depth >= EARLY_GRACE_END_2) return 1
  return 0.70 + 0.30 * ((depth - 1) / (EARLY_GRACE_END_2 - 1))
}
// 2026-07-26 — EARLY-DEPTH HP NERF (v2, deeper). The old (350 + 30·d) intercept
// made the shallow end a slog: Ch3/4 enemies are tanky by nature, so depths 1-15
// dragged. Dropped the intercept hard (350 → 170) and raised the slope (30 → 33)
// so the cut concentrates on the 1-15 band while the deep record band (48+) only
// eases ~2%. Cumulative vs the original launch curve:
//   d1  380 → 203 (-47%)   d5  500 → 335 (-33%)   d10 650 → 500 (-23%)
//   d15 800 → 665 (-17%)   d20 950 → 830 (-13%)   d48 ~-2%
function mobHp2(depth: number)    { return Math.round((170 + depth * 33) * deepBend2(depth) * earlyHpGrace2(depth)) }
// Damage: retuned 2026-07-18 after playtest — Ch3/4 enemies already hit hard from
// depth 1, so the base is lower and the slope FLATTER than Davy's (they start
// strong, they don't need a steep ramp on top). HP curve unchanged.
function mobMinDmg2(depth: number){ return Math.round((16 + depth * 2) * deepBend2(depth) * earlyDmgGrace2(depth)) }
function mobMaxDmg2(depth: number){ return Math.round((24 + depth * 3.2) * deepBend2(depth) * earlyDmgGrace2(depth)) }

// The Don's ghost fleet — his drowned court + crews raised, washed a sickly,
// scary KRAKEN GREEN (vs Davy's cold grey DROWNED_FILTER) and renamed "Spectral
// X". Dark + toxic so the whole bestiary reads as his, not Davy's. Tunable.
export const GHOST_FILTER = 'brightness(0.66) contrast(1.12) sepia(0.85) saturate(2.4) hue-rotate(70deg)'
function ghostName(name: string): string {
  if (name.includes('Spectral')) return name
  if (name.startsWith('The ')) return `The Spectral ${name.slice(4)}`
  return `Spectral ${name}`
}

// G2 RANDOM bosses earn their revive phases by depth (base + N revives), mirroring
// how Davy gates phase2 but generalized to the Ch3/4 phases[] engine: shallow =
// base only, mid = one revive, deep = two. (The Don apex is separate + fuller.)
function donBossReviveCount(depth: number): number {
  return depth < 15 ? 0 : depth < 30 ? 1 : 2
}

// ── Don Finleone's rises — the placed milestone set-pieces (Don's Gauntlet) ────
// Don Finleone the BOSS (distinct from Don's Ghost, the donsgauntlet.png host who
// presides over the whole run) no longer rolls randomly. He rises at fixed
// milestone depths: a first meeting, escalating returns, and the throne at the
// bottom. Each is built on the depth curve so they climb in menace. These depths
// are the descent's landmarks — the rest of the dark is quieter for them.
export const DON_RISE_DEPTHS = [20, 42, 60, 85]
const APEX_HP_MULT = 3.6   // heavier than a normal boss (2.8)

/** Which rise this depth is (0-based), or -1 if it isn't a Don rise. */
export function donRiseIndex(depth: number): number {
  return DON_RISE_DEPTHS.indexOf(depth)
}

// Mark of the Don — the stacking trophy for putting him down. On each fall the
// player CHOOSES one of two Marks (offense/defense bundles); see lib/gauntletMarks
// for the categories, roll, and the TideEffect[] they emit into the run.

/** Victory copy when a Don rise is beaten — his voice bleeding out, climbing to a
 *  real fall at the throne. Mob-boss menace, sea-cold, no em-dashes. */
export function donFallCopy(depth: number): { eyebrow: string; title: string; line: string } {
  const i = donRiseIndex(depth)
  switch (i) {
    case 0: return {
      eyebrow: 'The Green Recoils',
      title: 'Don Finleone Falls',
      line: 'You are better than my Family ever knew, captain. But down here I always come back. Deeper, and hungrier.',
    }
    case 1: return {
      eyebrow: 'He Sinks Again',
      title: 'Don Finleone Falls',
      line: 'Twice now. The green has a long memory, and I have a longer one. This is not the last table we sit at.',
    }
    case 2: return {
      eyebrow: 'The Court Reels',
      title: 'Don Finleone Falls',
      line: 'Still standing. Fine. What my guns cannot do, the bottom will. Come down and let it finish you.',
    }
    default: return {
      eyebrow: 'The Throne Goes Dark',
      title: 'The Don Is Undone',
      line: 'So. The throne is yours to look at. Take your piece of me and get out of my green, while the green still lets you.',
    }
  }
}

/** Telegraph copy for a Don rise — his voice climbs from wary host to the throne.
 *  Mob-boss menace, sea-cold, no em-dashes. Falls back to the throne line past
 *  the last listed rise (defensive; rises only fire on DON_RISE_DEPTHS). */
export function donRiseCopy(depth: number): { eyebrow: string; title: string; sublabel: string; line: string } {
  const i = donRiseIndex(depth)
  const throne = {
    eyebrow: 'The Court Falls Silent',
    title: 'Don Finleone, The Throne',
    sublabel: `Depth ${depth} · The Throne`,
    line: 'This is the bottom, captain. My table, my terms, my Family all around you. You came all this way to be counted with them. Sit.',
  }
  switch (i) {
    case 0: return {
      eyebrow: 'The Green Goes Still',
      title: 'Don Finleone Rises',
      sublabel: `Depth ${depth} · The Don`,
      line: 'So you are the one rattling around my green. Bold, coming down to my table without an invitation. Let me get a look at you.',
    }
    case 1: return {
      eyebrow: 'He Comes Back Up',
      title: 'Don Finleone Rises',
      sublabel: `Depth ${depth} · The Don Returns`,
      line: 'You put the Don down once. Down here, captain, nobody stays down. And I have a long memory for a face.',
    }
    case 2: return {
      eyebrow: 'The Green Closes Its Fist',
      title: 'Don Finleone Rises',
      sublabel: `Depth ${depth} · The Reckoning`,
      line: 'Still coming? The green runs out of patience long before I do. This deep, the water works for the Family.',
    }
    default: return throne
  }
}

// Cap a check's self-damage consequence — the near-lethal ones assume a PLANNED
// raid crew; a fixed gauntlet party needs them survivable.
function softenCheckConsequence(check: BossMechanicCheck, maxPct: number): BossMechanicCheck {
  const c = check.consequence
  if (c && c.kind === 'damagePctMaxHp' && c.value > maxPct) {
    return { ...check, consequence: { ...c, value: maxPct } }
  }
  return check
}

/** Build a Don Finleone rise: THE_THRONE boss on the G2 curve at a heavier mult,
 *  with a phase count that CLIMBS by rise. First meeting = 3 phases (The Court
 *  opener + his first 2 revives), then +1 revive per rise, capping at his full
 *  6-phase throne fight (opener + all 5 revives) at the deepest marker. Phases are
 *  his real sequence in order (Maw → Blood in the Water → The Sounding → The
 *  Undertow → The Last Bite), so each rise shows more of the real fight than the
 *  last. Checks stay softened BOOKENDS: the opener + the finale (this fight's last
 *  phase); the phases between are spectacle, no forced answer. */
function buildDonApex(depth: number): BroadsideEnemy {
  const src = THE_THRONE.enemies.don_finleone
  const hp  = Math.round(mobHp2(depth) * APEX_HP_MULT)
  const min = Math.round(mobMinDmg2(depth) * BOSS_DMG_MULT)
  const max = Math.round(mobMaxDmg2(depth) * BOSS_DMG_MULT)
  const accuracy = Math.round(18 + depth * 1.4) + 3 + src.shipSpeed   // + hull: dodge contest is accuracy-only now
  const srcPhases = src.phases ?? []
  // rise 0 → 2 revives (3 phases total), +1 per rise, capped at all his revives.
  const idx = Math.max(0, donRiseIndex(depth))
  const reviveCount = Math.min(srcPhases.length, 2 + idx)
  const phases: BossPhase[] = srcPhases.slice(0, reviveCount).map((p, i, arr) => {
    const isFinale = i === arr.length - 1   // keep this fight's finale check (softened), strip the rest
    return { ...p, check: isFinale && p.check ? softenCheckConsequence(p.check, 0.5) : undefined }
  })
  return {
    ...src,
    name: 'Don Finleone',   // the rise keeps his name (recognizable — the telegraph is HIM)
    hpBase: hp, minDmg: Math.max(1, min), maxDmg: Math.max(min + 1, max), accuracy,
    openingCheck: src.openingCheck ? softenCheckConsequence(src.openingCheck, 0.45) : undefined,
    phases: phases.length ? phases : undefined,
    phase2: undefined,
  }
}

// ── The Closer — a recurring mini-boss (the don's right hand). Its own low roll,
//    tougher than a mob + a single revive, lighter than a full boss (no ability-
//    refresh breather). "The don's right hand blocks your descent." ──────────────
const CLOSER_MIN_DEPTH  = 12
const CLOSER_CHANCE     = 0.05
const MINI_BOSS_HP_MULT = 1.8
function buildCloser(depth: number): BroadsideEnemy {
  const src = THE_THRONE.enemies.the_consigliere
  const min = Math.round(mobMinDmg2(depth) * 1.25)
  const max = Math.round(mobMaxDmg2(depth) * 1.25)
  return {
    ...src,
    name: ghostName(src.name),   // "The Spectral Closer"
    hpBase: Math.round(mobHp2(depth) * MINI_BOSS_HP_MULT),
    minDmg: Math.max(1, min), maxDmg: Math.max(min + 1, max),
    accuracy: Math.round(18 + depth * 1.4) + 2 + src.shipSpeed,   // + hull: dodge contest is accuracy-only now
    // Keep his single false-defeat revive (check stripped — his phase2 has none anyway).
    phase2: src.phase2 ? { ...src.phase2, check: undefined } : undefined,
    phases: undefined,
    openingCheck: undefined,
  }
}

// Two-phase boss revives are an ENDGAME escalation — early/mid Gauntlet bosses
// stay single-phase; only past this depth do they bring their phase 2.
const PHASE2_BOSS_MIN_DEPTH = 20

/** Overlay the gauntlet curve onto a source enemy, preserving identity
 *  (pattern, art, signature ability, First-Cut startCharges, etc) but
 *  reframing it as a drowned Locker creature. */
function scaleToCurve(src: BroadsideEnemy, depth: number, isBoss: boolean, variant: GauntletVariant = 'davy'): BroadsideEnemy {
  const don = variant === 'don'
  const baseHp  = don ? mobHp2(depth)     : mobHp(depth)
  const baseMin = don ? mobMinDmg2(depth) : mobMinDmg(depth)
  const baseMax = don ? mobMaxDmg2(depth) : mobMaxDmg(depth)
  const hp  = isBoss ? Math.round(baseHp * BOSS_HP_MULT) : baseHp
  const min = Math.round(baseMin * (isBoss ? BOSS_DMG_MULT : 1))
  const max = Math.round(baseMax * (isBoss ? BOSS_DMG_MULT : 1))
  // Gunnery accuracy climbs with depth so dodge stays a real read as a
  // high-nav endgame captain keeps descending (the fixed per-raid accuracy on
  // the source enemy would fall behind). Gauntlet players are already post-
  // Chapter-2, so this opens near the late-raid band (~24) and ramps. Bosses
  // shoot a touch straighter. See BroadsideEnemy.accuracy for the dodge math.
  const accuracy = Math.round(18 + depth * 1.4) + (isBoss ? 3 : 0) + src.shipSpeed   // + hull: dodge contest is accuracy-only now
  const out: BroadsideEnemy = { ...src, name: (don ? ghostName : drownedName)(src.name), hpBase: hp, minDmg: Math.max(1, min), maxDmg: Math.max(min + 1, max), accuracy }
  // Early-depth aim-bar grace (Don's only): pull the enemy's own fog + fast-band
  // kit back a bit in the 1-20 climb (the speed mults attenuate their EXCESS over
  // 1, the fog density scales straight down). Fades to nothing by depth 20.
  if (don) {
    const ag = earlyAimGrace2(depth)
    if (ag < 1) {
      if (out.aimFogDensity) out.aimFogDensity = out.aimFogDensity * ag
      if (out.aimSpeedMult && out.aimSpeedMult > 1) out.aimSpeedMult = 1 + (out.aimSpeedMult - 1) * ag
      if (out.zoneSpeedMult && out.zoneSpeedMult > 1) out.zoneSpeedMult = 1 + (out.zoneSpeedMult - 1) * ag
    }
  }
  if (isBoss) {
    if (don) {
      // Random G2 bosses (Ruse/Quartermaster/Sal): KEEP their special/ultimate/
      // barrier kit + DEPTH-TRIMMED revive phases, but STRIP every check — a fixed
      // roguelike party can't plan the crew answers a check demands. (The Don apex
      // is built separately in buildDonApex and DOES keep its two bookend checks.)
      const revives = donBossReviveCount(depth)
      if (out.phases && out.phases.length) {
        out.phases = revives > 0 ? out.phases.slice(0, revives).map(p => ({ ...p, check: undefined })) : undefined
      }
      if (out.phase2) {
        out.phase2 = revives > 0 ? { ...out.phase2, check: undefined } : undefined
      }
      out.openingCheck = undefined
    } else if (depth <= PHASE2_BOSS_MIN_DEPTH) {
      // Phase-2 revives only past PHASE2_BOSS_MIN_DEPTH — strip the inherited
      // challenge phase2 on shallower Davy boss rounds so they stay single-phase.
      out.phase2 = undefined
    }
  }
  return out
}

/** Reframe an enemy as a drowned Locker creature. A leading "The" keeps its
 *  place ("The Cartographer" -> "The Drowned Cartographer"), everything else
 *  takes the prefix ("Barnacle Pete" -> "Drowned Barnacle Pete"). */
function drownedName(name: string): string {
  if (name.includes('Drowned')) return name
  if (name.startsWith('The ')) return `The Drowned ${name.slice(4)}`
  return `Drowned ${name}`
}

/** Fun run telemetry — accumulated across every fight of a dive and surfaced on
 *  the run summary + deepest-dive recap. Additive except `highestHit` (max). */
export interface GauntletRunStats {
  shots: number        // Fire / Volley / Mega actions loosed
  volleys: number      // of those, how many were Volleys
  megas: number        // of those, how many were Mega ultimates (for the "only-Mega" feat)
  crits: number        // shots that landed as a critical
  dmgDealt: number     // total damage put on enemy hulls
  highestHit: number   // biggest single blow
  dmgTaken: number     // total damage to your hull
  dmgHealed: number    // total HP restored (lifesteal + repairs + crew heals)
  dmgAbsorbed: number  // damage soaked by shields before it reached the hull
  dodgesWon: number    // enemy shots slipped
  dodgesLost: number   // dodges that failed (took the hit anyway)
}
export function emptyRunStats(): GauntletRunStats {
  return { shots: 0, volleys: 0, megas: 0, crits: 0, dmgDealt: 0, highestHit: 0, dmgTaken: 0, dmgHealed: 0, dmgAbsorbed: 0, dodgesWon: 0, dodgesLost: 0 }
}
/** Fold a delta into a running stats total in place (highestHit takes the max). */
export function addRunStats(s: GauntletRunStats, d: Partial<GauntletRunStats>): void {
  for (const k of Object.keys(d) as (keyof GauntletRunStats)[]) {
    const v = d[k]
    if (v == null) continue
    if (k === 'highestHit') s.highestHit = Math.max(s.highestHit, v)
    else s[k] += v
  }
}
/** Coerce an unknown/partial stats blob (old snapshots) into a full stats object. */
export function coerceRunStats(raw: unknown): GauntletRunStats {
  const s = emptyRunStats()
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(s) as (keyof GauntletRunStats)[]) {
      const v = (raw as Record<string, unknown>)[k]
      if (typeof v === 'number' && isFinite(v)) s[k] = v
    }
  }
  return s
}

/** Snapshot of one gauntlet run, kept for the player's DEEPEST dive so the home
 *  screen can recap the boons / curses they ran. Stored in
 *  profiles.gauntlet_deepest_run, written server-side on a new record. */
export interface GauntletRunSnapshot {
  depth: number
  /** boon family id -> tier */
  boons: Record<string, number>
  /** curse id -> tier */
  curses: Record<string, number>
  /** tides picked (LEGACY — the Gauntlet no longer runs Tides; kept optional so
   *  old stored snapshots still recap, and the server sanitiser still accepts it) */
  tides?: { title: string; choice: string }[]
  /** Fun run telemetry (optional — old snapshots predate it). */
  stats?: GauntletRunStats
  /** Don's jobs cleared this run + the bonus each paid (optional — old snapshots
   *  predate it). */
  contracts?: { name: string; reward: string }[]
  /** Fathoms spent at the Fence this run — the run-scoped Fence tab, subtracted
   *  from the earned-Fathoms grant at cash-out/death (optional for old saves). */
  fenceSpent?: number
  /** ISO timestamp, set server-side */
  at?: string
}

/** The resumable state of an in-progress run, checkpointed to
 *  profiles.gauntlet_run_state between fights so a mid-run crash can resume at
 *  the last cleared breather (worst case: redo the fight you were in). Only the
 *  state that affects rewards, difficulty, or player power — transient UI
 *  (banners, pending drafts) is rebuilt on resume. See [[gauntlet-crash-recovery-gap]]. */
export interface GauntletRunState {
  cleared: number
  prevWasBoss: boolean
  roundsSinceBoss: number
  hp: number
  pot: number
  bossesDefeated: number
  /** boon family id -> tier */
  boonTiers: Record<string, number>
  /** confluence ids the player has DRAFTED (opportunity-cost model — a
   *  confluence only applies once taken, then scales with its boon tiers).
   *  Optional so runs saved before the draft model resume cleanly. */
  confluencesTaken?: string[]
  /** convergence ids DRAFTED (Don's Gauntlet meta-tier — a synergy of two
   *  confluences). Optional so pre-convergence saves resume cleanly. */
  convergencesTaken?: string[]
  /** Fun run telemetry accumulated so far (optional — old saves predate it). */
  stats?: GauntletRunStats
  /** curse id -> tier */
  curseTiers: Record<string, number>
  /** crew ids whose ability is spent (Set serialised to array) */
  usedAbilityIds: number[]
  /** activatable item ids spent this run (War/Thunder Drum). Optional so runs
   *  saved before the item existed still resume (defaults to none). */
  usedRaidItemIds?: string[]
  /** crew ids silenced by Dead Hands */
  silencedCrewIds: number[]
  /** Powder Hoard cannonballs carried into the next fight */
  carriedCharges: number
  /** lethal-save charges left (Quartermaster's Anchor) */
  anchorSavesLeft: number
  /** biggest single blow landed this run (Biggest Hit board) */
  runMaxHit: number
  /** next combat depth a Drowned Shrine is due */
  nextShrine: number
  /** next combat depth a Black Market is due (Don's only; optional for old saves) */
  nextMerchant?: number
  /** Calm Before already waved off the first curse milestone */
  calmBeforeUsed: boolean
  /** Marks of the Don taken this run — the chosen stacking landmark bundles
   *  (Don's only). Optional so pre-Mark saves resume cleanly. */
  marks?: ChosenMark[]
  /** Run-wide max-hull multiplier from cleared hull-boost contracts (Don's only).
   *  Optional so pre-contract saves resume cleanly. */
  contractHullMult?: number
  /** Don's jobs cleared this run + the bonus each paid, for the profile + recap
   *  (Don's only; optional for old saves). */
  contractsWon?: { name: string; reward: string }[]
  /** Fathoms spent at the Fence so far this run (settled at cash-out; Don's only,
   *  optional for old saves). */
  fenceSpent?: number
}

export interface GauntletFight {
  enemy: BroadsideEnemy
  isBoss: boolean
  isElite: boolean
  /** A Don Finleone rise — a placed milestone set-piece (Don's Gauntlet, at
   *  DON_RISE_DEPTHS). Counts as a boss; the flag drives his rise telegraph. */
  isApex?: boolean
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
  /** Vestigial — Don's rises are now placed at fixed depths (DON_RISE_DEPTHS),
   *  not a once-per-run roll. Kept so persisted/resumed run states still parse. */
  apexDone?: boolean
}

/** Generate the next fight. Pure given Math.random; the caller threads the
 *  running guardrail state and updates it from the returned fight.
 *  `skipOffset` (Veteran's Start) raises the COMBAT depth — enemy scaling, boss
 *  / elite odds, and the displayed depth — while the pot stays keyed to the
 *  REWARD depth (ships actually sunk), so the head start is no reward shortcut. */
export function generateFight(state: GauntletRollState, skipOffset = 0, terms: TermEffects = NO_TERM_EFFECTS, variant: GauntletVariant = 'davy'): GauntletFight {
  const rewardDepth = state.cleared + 1
  const depth = rewardDepth + skipOffset

  // Boss decision — rising chance, never back-to-back, pity ceiling. Terms never
  // touch how OFTEN a boss appears (see Davy's Court: more bosses would have
  // partly paid the player back, since bosses feed 3x into the pot and refresh
  // every crew ability on the kill). Terms make the boss you meet meaner instead.
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

  // Past the reward cap the Locker's purse is dry — fights contribute nothing
  // to the pot (the HUD pot must never show money the cash-out won't pay).
  const paying = rewardDepth <= GAUNTLET_REWARD_DEPTH_CAP

  // Don Finleone's rises — placed at fixed milestone depths (Don's Gauntlet only),
  // NOT a random roll. Guaranteed at those depths (no prevWasBoss gate: a landmark
  // must land), and it takes priority over every other spawn. Not in the random
  // boss pool; counts as a boss (ability refresh + boss pot).
  if (variant === 'don' && DON_RISE_DEPTHS.includes(depth)) {
    return { enemy: buildDonApex(depth), isBoss: true, isApex: true, isElite: false, potContribution: paying ? roundContribution(rewardDepth, true, variant) : 0, depth }
  }

  // The Closer mini-boss — its own low roll (Don's Gauntlet). A tough named ship
  // with a single revive, but NOT a full boss (mob-tier pot, no ability refresh).
  if (variant === 'don' && !isBoss && depth >= CLOSER_MIN_DEPTH && !state.prevWasBoss && Math.random() < CLOSER_CHANCE) {
    return { enemy: buildCloser(depth), isBoss: false, isElite: false, potContribution: paying ? roundContribution(rewardDepth, false, variant) : 0, depth }
  }

  if (isBoss) {
    // Davy's Court (a signed Term): the captains he sends are his best.
    const base = scaleToCurve(pick(variant === 'don' ? BOSS_POOL_2 : BOSS_POOL), depth, true, variant)
    const enemy = (terms.bossHpMult !== 1 || terms.bossDmgMult !== 1)
      ? {
          ...base,
          hpBase: Math.round(base.hpBase * terms.bossHpMult),
          minDmg: Math.max(1, Math.round(base.minDmg * terms.bossDmgMult)),
          maxDmg: Math.max(2, Math.round(base.maxDmg * terms.bossDmgMult)),
        }
      : base
    // Crowned (a signed Term): bosses have never carried affixes. Now they can.
    let bossAffix: AffixDef | undefined
    if (terms.bossAffixCount > 0) {
      const firstId = rollAffix()
      bossAffix = AFFIXES[firstId]
      if (terms.bossAffixCount > 1) {
        bossAffix = mergeAffixes(bossAffix, AFFIXES[rollSecondAffix(firstId)])
      }
    }
    return { enemy, isBoss: true, isElite: false, affix: bossAffix, potContribution: paying ? roundContribution(rewardDepth, true, variant) : 0, depth }
  }

  // Mob — independent elite roll, chance scaling with depth. Press-Ganged (a
  // signed Term) multiplies it; Marked Hulls pairs affixes from depth 1 and can
  // stack a third; Ironbacked bumps the elite's hull + guns on top of the usual
  // elite treatment.
  let enemy = scaleToCurve(pick(variant === 'don' ? MOB_POOL_2 : MOB_POOL), depth, false, variant)
  let isElite = false
  let affix: AffixDef | undefined
  const eliteChance = Math.min(
    Math.min(0.95, ELITE_CHANCE_CAP * terms.eliteChanceMult),
    (ELITE_CHANCE_BASE + depth * ELITE_CHANCE_GROWTH) * terms.eliteChanceMult,
  )
  if (Math.random() < eliteChance) {
    isElite = true
    const firstId = rollAffix()
    affix = AFFIXES[firstId]
    // Pair the affix if the depth band says so OR a Term forces it from the start.
    const pairs = depth > DEEP_BEND_START
      || terms.affixPairFromStart
      || (depth >= DUAL_AFFIX_MIN_DEPTH && Math.random() < DUAL_AFFIX_CHANCE)
    if (pairs) {
      const secondId = rollSecondAffix(firstId)
      affix = mergeAffixes(affix, AFFIXES[secondId])
      // A third affix: the deep Crush band rolls for it, and Marked Hulls II
      // rolls for it at ANY depth. Take the better of the two chances.
      const tripleChance = Math.max(
        depth > DEEP_BEND_START ? TRIPLE_AFFIX_CHANCE : 0,
        terms.tripleAffixChance,
      )
      if (tripleChance > 0 && Math.random() < tripleChance) {
        const pool = ALL_AFFIX_IDS.filter(id => id !== firstId && id !== secondId)
        affix = mergeAffixes(affix, AFFIXES[pool[Math.floor(Math.random() * pool.length)]])
      }
    }
    enemy = {
      ...enemy,
      hpBase: Math.round(enemy.hpBase * ELITE_HP_MULT * terms.eliteHpMult),
      minDmg: Math.max(1, Math.round(enemy.minDmg * ELITE_DMG_MULT * terms.eliteDmgMult)),
      maxDmg: Math.max(2, Math.round(enemy.maxDmg * ELITE_DMG_MULT * terms.eliteDmgMult)),
    }
  }
  return { enemy, isBoss: false, isElite, affix, potContribution: paying ? roundContribution(rewardDepth, false, variant) : 0, depth }
}

/** Advance the guardrail state after a fight is generated. */
export function advanceRollState(state: GauntletRollState, fight: GauntletFight): GauntletRollState {
  return {
    cleared: state.cleared + 1,
    prevWasBoss: fight.isBoss,
    roundsSinceBoss: fight.isBoss ? 0 : state.roundsSinceBoss + 1,
    apexDone: state.apexDone || fight.isApex === true,
  }
}

// ── Reprieve ─────────────────────────────────────────────────────────────────
// A one-time relief card that can surface ALONGSIDE the boons in later rounds.
// Taking it forgoes the boon draft (give up upgrade potential for immediate
// relief), so it's the deliberate replacement for the old random heal-tide. The
// host (GauntletGame) reads `kind` to apply the effect, then drops to the
// breather. Pool intentionally tiny + high-value; tune the gate/odds below.
export interface Reprieve {
  id: string
  name: string
  flavor: string
  /** Short plain effect line shown on the card. */
  desc: string
  kind: 'heal' | 'crew' | 'charges' | 'cleanse'
  /** For 'heal': fraction of MAX HP restored. Ignored otherwise. */
  amount: number
}
export const REPRIEVES: Reprieve[] = [
  { id: 'patch_hull',       name: 'Patch the Hull',   flavor: 'A frantic hour at the pumps buys back the worst of the damage.', desc: 'Heal 75% of your max HP',       kind: 'heal',    amount: 0.75 },
  { id: 'beat_to_quarters', name: 'Beat to Quarters', flavor: 'The bosun pipes all hands. Every gun and trick comes up loaded.',  desc: 'Refresh every crew ability',    kind: 'crew',    amount: 0 },
  { id: 'load_the_guns',    name: 'Load the Guns',    flavor: 'You come in at full sail with the gun deck already run out.',      desc: 'Open your next fight fully chambered', kind: 'charges', amount: 0 },
  { id: 'shake_the_curse',  name: 'Shake the Curse',  flavor: 'You throw something dark over the side. The deep takes it back.', desc: 'Shed one of your active curses', kind: 'cleanse', amount: 0 },
]
/** Combat depth at/after which a Reprieve can appear on a boon screen. The first
 *  eligible boon draft is depth 8 (the boon screens are at 2/5/8/11/...). */
export const REPRIEVE_MIN_DEPTH = 6
/** Chance a Reprieve surfaces on an eligible boon screen. */
export const REPRIEVE_CHANCE = 0.55
/** Pick one Reprieve to offer. `curseCount` lets us drop the cleanse option when
 *  there's nothing to cleanse, so it's never a dead card. */
export function drawReprieve(ctx: { curseCount: number } = { curseCount: 0 }): Reprieve {
  const pool = REPRIEVES.filter(r => r.kind !== 'cleanse' || ctx.curseCount > 0)
  return pool[Math.floor(Math.random() * pool.length)]
}

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
// ── WHAT THE CHEST IS CALLED ─────────────────────────────────────────────────
// The tiers, depths, pot multipliers and gem bonuses are SHARED between the two
// descents, and should stay that way: the ladder is the same ladder. The NAMES
// are not, and were the last piece of Davy's still showing up on Don's screen —
// banking a deep Don's run opened something the game called "Davy Jones'
// Locker", in a descent Davy has nothing to do with. Same class of thing as
// Don's board once printing "Davy's Terms".
//
// Davy's ladder drowns: waterlogged, barnacled, drowned, then the Locker itself.
// Don's launders: what you skim, what you are kicked back, what gets washed,
// what gets written down, and finally the vault with his name on it.
const DONS_CHEST_LABELS: Record<number, string> = {
  1: 'Skimmed Purse',
  2: 'Kickback Crate',
  3: 'Laundered Hoard',
  4: 'The Ledger Vault',
  5: "Finleone's Vault",
}

/** The chest's name for this descent. Falls back to Davy's label, so a new tier
 *  added to CHEST_TIERS without a Don's name shows something rather than blank. */
export function chestLabelFor(chest: ChestTier, variant?: GauntletVariant): string {
  return variant === 'don' ? (DONS_CHEST_LABELS[chest.tier] ?? chest.label) : chest.label
}

/** Hardcore renames the coffer outright — one name for every tier, since on a
 *  permadeath run the tier matters far less than what you just survived. */
export function hardcoreChestLabel(variant?: GauntletVariant): string {
  return variant === 'don' ? 'The Bone Vault' : 'The Blood Coffer'
}

export function chestForDepth(depth: number, tierDrop = 0): ChestTier {
  let chest = CHEST_TIERS[0]
  for (const c of CHEST_TIERS) if (depth >= c.minDepth) chest = c
  // Generic downgrade hook (no live caller since the Empty Lockers term was cut).
  if (tierDrop > 0) {
    const idx = CHEST_TIERS.findIndex(c => c.tier === chest.tier)
    chest = CHEST_TIERS[Math.max(0, idx - tierDrop)]
  }
  return chest
}

// Chase-drop odds, smooth in CASH-OUT DEPTH (2026-07-11, was stepped per chest
// tier at 0.5–5%). One curve for every chase CANNON (Davy's Hand/Heavy + the
// hardcore Blood Cannon) and a rarer one for every chase SKIN (Golden Gauntlet
// Hull + Bad Blood Hull). Each item rolls independently, only while unowned.
// Both cap at 10% @ depth 50+: cannons 3% @ 20 (floor 1%), skins 2% @ 20
// (floor 0.5%). Shallow cash-outs stay lottery tickets; genuinely deep dives
// are the real chase.
export function chestCannonDropChance(depth: number): number {
  return Math.min(0.10, Math.max(0.01, 0.03 + (depth - 20) * (0.07 / 30)))
}
export function chestSkinDropChance(depth: number): number {
  return Math.min(0.10, Math.max(0.005, 0.02 + (depth - 20) * (0.08 / 30)))
}

// ── WHAT THE CHEST CAN ACTUALLY PAY YOU, RIGHT NOW ───────────────────────────
// Every chest drop is gated on the chest TIER (so on depth) and on not already
// owning the thing. Both of those the player cannot see, and the odds RAMP with
// depth — which makes them the single best argument for diving one more time, and
// they were invisible.
//
// These ids and tiers used to live privately inside the cash-out action. They live
// here now so the odds the breather SHOWS are produced by the same code that ROLLS
// them at the counter. Two copies of this would drift, and the day they drifted the
// game would be lying to a player about a decision that can end their run.
export const GOLD_HULL_SKIN_ID = 'golden_gauntlet_hull'
export const GOLD_HULL_CHEST_TIER = 5
export const BLOOD_HULL_SKIN_ID = 'bad_blood_hull'
export const BLOOD_HULL_CHEST_TIER = 4
// Don's Gauntlet own hull chases — the Davy hulls never drop in Don's runs, and
// these never drop in Davy's. Same chest tiers as their Davy counterparts.
export const GALAXY_HULL_SKIN_ID = 'galaxy_hull'
export const GALAXY_HULL_CHEST_TIER = 5   // deepest chest, mirrors the Golden Hull
export const GHOST_HULL_SKIN_ID = 'dons_ghost_hull'
export const GHOST_HULL_CHEST_TIER = 4    // NORMAL Don's drop, one chest tier below the Galaxy Hull
// The Ghost Hull is the RARER of the two Don's hulls — it rolls at half the
// normal skin chance (applied on top of the depth curve). Tunable in one place.
export const GHOST_HULL_DROP_MULT = 0.5
// Don's Gauntlet item chase — rolls from any chest like the Davy cannons, on the
// same odds curve. Never drop in Davy's; the Davy cannons never drop in Don's.
export const DONS_GAUNTLET_ITEM_IDS = ['opening_statement', 'made_man', 'the_shakedown']
export const BLOOD_CANNON_ITEM_ID = 'davys_blood_cannon'
export const BLOOD_CANNON_CHEST_TIER = 3
// Don's hardcore chase, the mirror of the Blood Cannon: same chest-tier gate,
// same curve, same "drops again once you forge it away" rule.
export const PALISADE_ITEM_ID = 'dons_palisade'
export const PALISADE_CHEST_TIER = 3

export interface ChestOdd {
  id: string
  name: string
  kind: 'item' | 'skin'
  /** 0-1. Already accounts for tier gates and for what the player owns. */
  chance: number
  /** The same chance WITHOUT crew Fortune, so a panel can show what the crew is
   *  adding rather than only the total. Equal to `chance` when Fortune is 1x. */
  chanceBeforeFortune: number
  /**
   * Set when this drop exists but the current depth has not reached its chest
   * tier: the depth it opens at, with `chance` 0.
   *
   * Davy's Gauntlet needed this. Once the Grand Cannon is forged its two
   * components stop dropping, correctly, and the only chase left is the Golden
   * Hull at tier 5 — so a shallow run had NOTHING to list and the whole panel
   * vanished, while Don's, whose items carry no tier gate, always showed one.
   * The honest fix is to name what is still coming rather than show a blank.
   */
  lockedUntilDepth?: number
}

/** Everything this player could still pull out of a chest banked at `depth`, and how
 *  likely each one is. Anything already owned (or forged away into a fusion, which is
 *  how the cash-out treats it) is left out entirely rather than shown at 0%. */
export function chestOdds(opts: {
  depth: number
  hardcore: boolean
  pressure: number
  ownedItems: string[]
  ownedSkins: string[]
  davyForge: { result: string; components: string[] }
  /** Which gauntlet — Don's drops its own hulls and no cannons; Davy's is the
   *  default table. Omitted = Davy's. */
  variant?: GauntletVariant
  /** Davy's Offer, when he has offered a heavier chest. Multiplies every drop
   *  chance below (capped), and the cash-out rolls against the very same number. */
  oddsMult?: number
  /** Crew Fortune's pull on drops, from fortuneLootMult (1x to 2x). Passed in
   *  rather than derived so this stays a pure function, and REQUIRED wherever
   *  the number is shown: the breather prints these odds and the cash-out rolls
   *  against them, so anything applied to one must be applied to the other or
   *  the panel is quietly lying. */
  fortuneMult?: number
}): ChestOdd[] {
  const { depth, hardcore, pressure, ownedItems, ownedSkins, davyForge } = opts
  const isDon = opts.variant === 'don'
  const payDepth = Math.min(depth, GAUNTLET_REWARD_DEPTH_CAP)
  const tier = chestForDepth(payDepth).tier
  const m = (c: number) => Math.min(CHEST_ODDS_CAP, c * (opts.oddsMult ?? 1) * (opts.fortuneMult ?? 1))
  /** Same maths, Fortune held at 1x. The cap is applied identically so the two
   *  numbers stay comparable even when the boosted one is clipped. */
  const m0 = (c: number) => Math.min(CHEST_ODDS_CAP, c * (opts.oddsMult ?? 1))
  const cannon = m(chestCannonDropChance(payDepth))
  const skin = m(chestSkinDropChance(payDepth))
  const cannon0 = m0(chestCannonDropChance(payDepth))
  const skin0 = m0(chestSkinDropChance(payDepth))
  const out: ChestOdd[] = []

  if (isDon) {
    // Don's Gauntlet: its own two items + two hulls, both NORMAL drops. No Davy loot.
    for (const id of DONS_GAUNTLET_ITEM_IDS) {
      if (!ownedItems.includes(id)) out.push({ id, name: CHEST_DROP_NAMES[id] ?? id, kind: 'item', chance: cannon, chanceBeforeFortune: cannon0 })
    }
    if (tier >= GALAXY_HULL_CHEST_TIER && !ownedSkins.includes(GALAXY_HULL_SKIN_ID)) {
      out.push({ id: GALAXY_HULL_SKIN_ID, name: 'Galaxy Hull', kind: 'skin', chance: skin, chanceBeforeFortune: skin0 })
    }
    if (tier >= GHOST_HULL_CHEST_TIER && !ownedSkins.includes(GHOST_HULL_SKIN_ID)) {
      out.push({ id: GHOST_HULL_SKIN_ID, name: "Don's Ghost Hull", kind: 'skin', chance: m(chestSkinDropChance(payDepth) * GHOST_HULL_DROP_MULT), chanceBeforeFortune: m0(chestSkinDropChance(payDepth) * GHOST_HULL_DROP_MULT) })
    }
    // Hardcore only: Don's Palisade, on the Blood Cannon's exact rule. Fusing it
    // into the Palisade Bulwark consumes it, so it becomes droppable again
    // rather than going extinct for the players who engaged with it most.
    if (hardcore && tier >= PALISADE_CHEST_TIER && !ownedItems.includes(PALISADE_ITEM_ID)) {
      out.push({ id: PALISADE_ITEM_ID, name: "Don's Palisade", kind: 'item', chance: cannon, chanceBeforeFortune: cannon0 })
    }
    return out
  }
  // The two Davy cannons roll INDEPENDENTLY, purely on whether you hold them.
  //
  // They used to stop the moment you owned the Grand Cannon, which sounds right
  // and was not: the forge is DESTRUCTIVE (see forgeRaidItem, which filters the
  // components out of raid_items), so forging leaves you owning neither
  // component AND unable to ever roll one again. They were extinct, and Davy's
  // chase table emptied out for exactly the players who had engaged with it
  // most. Owning the result is not a reason to stop dropping a component you no
  // longer have; forgeRaidItem's own `Already forged` guard is what stops a
  // second Grand being built.
  for (const id of davyForge.components) {
    if (!ownedItems.includes(id)) out.push({ id, name: CHEST_DROP_NAMES[id] ?? id, kind: 'item', chance: cannon, chanceBeforeFortune: cannon0 })
  }
  // Hardcore: the Blood Cannon, on the same rule. Fusing it into the Bloodletter
  // or the Reaver's Cannon consumes it too, so it becomes droppable again rather
  // than vanishing from the game.
  if (hardcore && tier >= BLOOD_CANNON_CHEST_TIER && !ownedItems.includes(BLOOD_CANNON_ITEM_ID)) {
    out.push({ id: BLOOD_CANNON_ITEM_ID, name: "Davy's Blood Cannon", kind: 'item', chance: cannon, chanceBeforeFortune: cannon0 })
  }
  if (!ownedSkins.includes(GOLD_HULL_SKIN_ID)) {
    const gate = CHEST_TIERS.find(c => c.tier === GOLD_HULL_CHEST_TIER)?.minDepth ?? 0
    out.push(tier >= GOLD_HULL_CHEST_TIER
      ? { id: GOLD_HULL_SKIN_ID, name: 'Golden Gauntlet Hull', kind: 'skin', chance: skin, chanceBeforeFortune: skin0 }
      : { id: GOLD_HULL_SKIN_ID, name: 'Golden Gauntlet Hull', kind: 'skin', chance: 0, chanceBeforeFortune: 0, lockedUntilDepth: gate })
  }
  if (hardcore && tier >= BLOOD_HULL_CHEST_TIER && !ownedSkins.includes(BLOOD_HULL_SKIN_ID)) {
    out.push({ id: BLOOD_HULL_SKIN_ID, name: 'Bad Blood Hull', kind: 'skin', chance: skin, chanceBeforeFortune: skin0 })
  }
  if (hardcore && !ownedSkins.includes(PRESSURE_SKIN_ID)) {
    const c = pressureSkinDropChance(pressure, payDepth)
    if (c > 0) out.push({ id: PRESSURE_SKIN_ID, name: 'Pitch Black Hull', kind: 'skin', chance: m(c), chanceBeforeFortune: m0(c) })
  }
  return out
}

const CHEST_DROP_NAMES: Record<string, string> = {
  davys_heavy_cannon: "Davy's Heavy Cannon",
  davys_hand_cannon:  "Davy's Hand Cannon",
  opening_statement:  'Vanguard Battery',
  made_man:           'Dampener Plate',
  the_shakedown:      'Carrion Sight',
}

// ── Per-drop odds curve, for the "how it drops" reference ─────────────────────
// The Haul guide shows each chase drop's RANGE and how its odds climb by depth.
// Those numbers must come from the SAME curves the cash-out rolls against (above),
// so this maps each drop to its curve (item = cannon curve, skin = skin curve),
// its chest-TIER gate (the depth it unlocks), and any per-drop rarity mult (the
// Ghost Hull's half-rate). Ownership/hardcore/offer are NOT applied here — this
// is the reference curve, not "your odds right now" (that's chestOdds).
const DROP_ODDS_META: Record<string, { kind: 'item' | 'skin'; tierGate: number; mult: number }> = {
  // Davy's chases
  davys_heavy_cannon:   { kind: 'item', tierGate: 1,                       mult: 1 },
  davys_hand_cannon:    { kind: 'item', tierGate: 1,                       mult: 1 },
  davys_blood_cannon:   { kind: 'item', tierGate: BLOOD_CANNON_CHEST_TIER, mult: 1 },
  golden_gauntlet_hull: { kind: 'skin', tierGate: GOLD_HULL_CHEST_TIER,    mult: 1 },
  bad_blood_hull:       { kind: 'skin', tierGate: BLOOD_HULL_CHEST_TIER,   mult: 1 },
  // Don's chases
  opening_statement:    { kind: 'item', tierGate: 1,                       mult: 1 },
  made_man:             { kind: 'item', tierGate: 1,                       mult: 1 },
  the_shakedown:        { kind: 'item', tierGate: 1,                       mult: 1 },
  dons_palisade:        { kind: 'item', tierGate: PALISADE_CHEST_TIER,    mult: 1 },
  galaxy_hull:          { kind: 'skin', tierGate: GALAXY_HULL_CHEST_TIER,  mult: 1 },
  dons_ghost_hull:      { kind: 'skin', tierGate: GHOST_HULL_CHEST_TIER,   mult: GHOST_HULL_DROP_MULT },
}

export interface DropOddsInfo {
  kind: 'item' | 'skin'
  /** The cash-out depth this drop first becomes possible (its chest-tier gate). */
  unlockDepth: number
  /** Drop chance (0-1) at a given cash-out depth — 0 below the gate. Includes
   *  crew Fortune when dropOddsInfo was given a multiplier. */
  chanceAt: (depth: number) => number
  /** The same curve with Fortune held at 1x, so a panel can show what the crew
   *  is adding rather than only the total. */
  baseChanceAt: (depth: number) => number
  /** Range across the whole descent: at the unlock/floor, and at the depth cap. */
  min: number
  max: number
}

/** The depth→odds reference curve for a chase drop (item or skin), or null if the
 *  id isn't a chase drop. Used by the Haul guide to show ranges + a depth table. */
/**
 * The depth-to-odds reference for one chase drop, for the Rewards guide.
 *
 * `fortuneMult` is crew Fortune (1x to 2x, from fortuneLootMult). It runs
 * through the SAME cap the cash-out applies, so the guide cannot promise odds
 * the payout will not honour. Default 1 leaves the base curve, which is what a
 * caller with no crew context should show.
 */
export function dropOddsInfo(id: string, fortuneMult = 1): DropOddsInfo | null {
  const meta = DROP_ODDS_META[id]
  if (!meta) return null
  const unlockDepth = CHEST_TIERS.find(c => c.tier === meta.tierGate)?.minDepth ?? 0
  const chanceAt = (depth: number): number => {
    const pd = Math.min(Math.max(0, depth), GAUNTLET_REWARD_DEPTH_CAP)
    if (chestForDepth(pd).tier < meta.tierGate) return 0
    const base = meta.kind === 'item' ? chestCannonDropChance(pd) : chestSkinDropChance(pd)
    return Math.min(CHEST_ODDS_CAP, base * meta.mult * fortuneMult)
  }
  /** The same curve with Fortune held at 1x, so the guide can show what the
   *  crew is adding rather than only the total. */
  const baseChanceAt = (depth: number): number => {
    const pd = Math.min(Math.max(0, depth), GAUNTLET_REWARD_DEPTH_CAP)
    if (chestForDepth(pd).tier < meta.tierGate) return 0
    const base = meta.kind === 'item' ? chestCannonDropChance(pd) : chestSkinDropChance(pd)
    return Math.min(CHEST_ODDS_CAP, base * meta.mult)
  }
  return {
    kind: meta.kind,
    unlockDepth,
    chanceAt,
    baseChanceAt,
    min: chanceAt(Math.max(1, unlockDepth)),
    max: chanceAt(GAUNTLET_REWARD_DEPTH_CAP),
  }
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
export interface GauntletCurseTier {
  /** Short, plain mechanical summary — the chip + interstitial headline. */
  desc: string
  /** Full plain-English explanation for the details popup (no jargon). */
  detail: string
  /** Run-wide effects applied while the curse is active at this tier. */
  effects?: TideEffect[]
  /** % of MAX HP the hull sheds at the start of every fight while active. */
  hpDrainPct?: number
  /** N crew whose special ability the deep silences for the rest of the run —
   *  they stop refreshing (once spent, stay spent). Host-side, not a TideEffect
   *  (it touches the used-ability set, not combat math). */
  silenceCrew?: number
}

export interface GauntletCurse {
  id: string
  name: string
  /** Icon art (magenta-keyed transparent PNG under /public/gauntlet/curses). */
  image?: string | null
  /** Which gauntlet draws it. Omitted = both (the recycled Davy pool). */
  gauntlet?: GauntletTag
  /** One-line dread, shown on the curse interstitial (shared across tiers). */
  flavor: string
  /** Tier ladder [tier1, tier2]. Tier 2 only DEEPENS a curse already taken at
   *  tier 1, and only from CURSE_TIER2_DEPTH on (mirrors how boons upgrade). */
  tiers: GauntletCurseTier[]
}

/** A resolved curse the Locker imposes this milestone — a specific tier of a
 *  family. `isUpgrade` = deepening one already on you (tier > 1). */
export interface CurseOffer {
  id: string
  name: string
  image?: string | null
  flavor: string
  tier: number
  desc: string
  detail: string
  effects?: TideEffect[]
  hpDrainPct?: number
  silenceCrew?: number
  isUpgrade: boolean
}

export const GAUNTLET_CURSES: GauntletCurse[] = [
  {
    id: 'crushing_depth', image: '/gauntlet/curses/crushing_depth.png',
    name: 'Crushing Depth',
    flavor: 'The water itself leans on your hull. Every fight begins a little closer to the breaking point.',
    tiers: [
      { desc: 'Lose 8% max HP before every fight', detail: 'At the start of every fight from now on, your ship loses 8% of its maximum HP. It can never land the killing blow itself (you stop at 1 HP), but it steadily wears you down.', hpDrainPct: 0.08 },
      { desc: 'Lose 13% max HP before every fight', detail: 'The pressure deepens. Your ship now sheds 13% of its maximum HP at the start of every fight (still never below 1).', hpDrainPct: 0.13 },
    ],
  },
  {
    id: 'bloodthirst', image: '/gauntlet/curses/bloodthirst.png',
    name: 'Bloodthirst',
    flavor: 'The drowned smell your wake. Every gun down here is aimed to kill, not to warn.',
    tiers: [
      { desc: 'Enemies deal 20% more damage', detail: 'Every hit an enemy lands on you deals 20% more damage for the rest of the run.', effects: [{ kind: 'incomingDmgMult', mult: 1.20, scope: 'allRemaining' }] },
      { desc: 'Enemies deal 30% more damage', detail: 'The frenzy spreads. Every enemy hit now lands for 30% more damage.', effects: [{ kind: 'incomingDmgMult', mult: 1.30, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'the_warding', image: '/gauntlet/curses/the_warding.png',
    name: 'The Warding',
    flavor: 'A cold light sheathes every hull down here. You have to break the barrier before you can break the ship.',
    tiers: [
      { desc: 'Enemies carry a 20% barrier', detail: 'Every enemy starts each fight behind a barrier worth 20% of its hull. Your shots chew through the barrier before its health takes a scratch (burn bleeds through, and the Railgun pierces it). It reforms fresh each fight.', effects: [{ kind: 'enemyShield', pctMax: 0.20 }] },
      { desc: 'Enemies carry a 32% barrier', detail: 'The warding thickens. Every enemy now hides behind a barrier worth 32% of its hull each fight.', effects: [{ kind: 'enemyShield', pctMax: 0.32 }] },
    ],
  },
  {
    id: 'becalmed', image: '/gauntlet/curses/becalmed.png',
    name: 'Becalmed',
    flavor: 'The wind died at this depth. Your ship answers the wheel a beat too slow.',
    tiers: [
      { desc: '-3 Initiative', detail: 'Your ship is 3 slower off the mark. Initiative decides who fires first, so you will act after the enemy more often and be harder-pressed to flee. (Your dodge and aim ride on Evasion, so they hold steady.)', effects: [{ kind: 'speedDelta', n: -3, scope: 'allRemaining' }] },
      { desc: '-5 Initiative', detail: 'The calm thickens. Your ship is 5 slower now, ceding the first shot far more often.', effects: [{ kind: 'speedDelta', n: -5, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'murk', image: '/gauntlet/curses/murk.png',
    name: 'Murk',
    flavor: 'The dark closes over your sights. The perfect shot is a narrower thing now.',
    tiers: [
      { desc: 'Your crit zone is 15% smaller', detail: 'The gold "perfect shot" band on your aim bar shrinks by 15%, so landing a critical hit is harder.', effects: [{ kind: 'critZoneScale', mult: 0.85 }] },
      { desc: 'Your crit zone is 32% smaller', detail: 'The dark all but closes the window. The gold "perfect shot" band shrinks by 32%.', effects: [{ kind: 'critZoneScale', mult: 0.68 }] },
    ],
  },
  // ── Aim-game disruptors — the deep messes with how you SHOOT, not just stats. ─
  {
    id: 'sounding_fog', image: '/gauntlet/curses/sounding_fog.png',
    name: 'Sounding Fog',
    flavor: 'The water goes blind at this depth. You fire at shapes in the murk.',
    tiers: [
      { desc: 'Fog rolls over your aim bar', detail: 'A bank of fog drifts back and forth across your aim bar, hiding the gold crit band as it passes. Lock your shots by rhythm, not by sight.', effects: [{ kind: 'aimFog', density: 0.55 }] },
      { desc: 'Thick fog smothers your aim bar', detail: 'The fog rolls in heavy, hiding the gold band for longer and leaving only narrow slivers of clear sight.', effects: [{ kind: 'aimFog', density: 0.69 }] },
    ],
  },
  {
    id: 'shrouded_hull', image: '/gauntlet/curses/shrouded_hull.png',
    name: 'Shrouded Hull',
    flavor: 'The enemy hull swims in and out of the murk. You never quite know how close it is to going under.',
    tiers: [
      { desc: '25% chance the enemy’s health is hidden', detail: 'Each fight, a 25% chance the enemy’s HP bar is fogged over. You fight blind on how close it is to sinking, judging by the numbers you land instead.', effects: [{ kind: 'hideEnemyHp', chance: 0.25 }] },
      { desc: '50% chance the enemy’s health is hidden', detail: 'The murk thickens: a 50% chance each fight that the enemy’s HP is hidden entirely.', effects: [{ kind: 'hideEnemyHp', chance: 0.50 }] },
    ],
  },
  {
    id: 'shuttered_ports', image: '/gauntlet/curses/shuttered_ports.png',
    name: 'Shuttered Ports',
    flavor: 'Their gun ports stay shut till the muzzles run out. No counting the shots they hold.',
    tiers: [
      { desc: '25% chance the enemy’s loaded shots are hidden', detail: 'Each fight, a 25% chance you can’t see the enemy’s cannonball count. No telling when the next broadside comes.', effects: [{ kind: 'hideEnemyCharges', chance: 0.25 }] },
      { desc: '50% chance the enemy’s loaded shots are hidden', detail: 'A 50% chance each fight the enemy’s loaded shots are hidden from you entirely.', effects: [{ kind: 'hideEnemyCharges', chance: 0.50 }] },
    ],
  },
  {
    id: 'racing_tide', image: '/gauntlet/curses/racing_tide.png',
    name: 'Racing Tide',
    flavor: 'A fast current rips down the deck. The wheel will not hold still.',
    tiers: [
      // Retuned 2026-07-12 (was 1.6 / 2.2). At 2.2x the needle crossed the crit
      // band in ~30ms — under two frames, below human tap precision — so crits
      // stopped being skill and became a coin flip. It also MULTIPLIES with the
      // Drowned Armory's heavy-shot boon (1.15), which pushed the ceiling to
      // 2.53x. These numbers keep it the "your aim goes to hell" curse while
      // leaving a crit window a player can actually hit.
      { desc: 'Your aim needle sweeps faster', detail: 'Your aiming needle whips back and forth quicker for the rest of the run, so the window to lock a clean shot is tighter.', effects: [{ kind: 'aimSpeedMult', mult: 1.35 }] },
      { desc: 'Your aim needle races across the bar', detail: 'The current rips harder. Your needle tears back and forth, and a clean lock takes real timing.', effects: [{ kind: 'aimSpeedMult', mult: 1.7 }] },
    ],
  },
  {
    id: 'roiling_sea', image: '/gauntlet/curses/roiling_sea.png',
    name: 'Roiling Sea',
    flavor: 'The sea heaves under you. Nothing you aim at stays where you left it.',
    tiers: [
      { desc: 'The target band lurches', detail: 'The gold target band slides across your aim bar much faster and wilder, so where the perfect shot sits is a moving guess every turn.', effects: [{ kind: 'zoneSpeedMult', mult: 1.9 }] },
      { desc: 'The target band thrashes', detail: 'The sea goes violent. The gold band careens across the bar, almost never where it was a beat ago.', effects: [{ kind: 'zoneSpeedMult', mult: 2.6 }] },
    ],
  },
  {
    id: 'inkfall', image: '/gauntlet/curses/inkfall.png',
    name: 'Inkfall',
    flavor: 'Something vast empties its ink into the water, and the world goes black in lurches.',
    tiers: [
      { desc: 'Your aim bar blacks out in fits', detail: 'A dark veil falls over your aim bar in short, random fits, swallowing the needle and the gold band for a beat at a time. Lock by rhythm when the dark takes it.', effects: [{ kind: 'aimBlackout', intensity: 0.55 }] },
      { desc: 'Your aim bar drowns in dark', detail: 'The ink comes harder and blacker, blotting out the whole aim bar in fits. You will fire half-blind.', effects: [{ kind: 'aimBlackout', intensity: 0.78 }] },
    ],
  },
  // ── Stat / economy curses — the deep hits your numbers, not just your aim. ───
  {
    id: 'waterlogged_powder', image: '/gauntlet/curses/waterlogged_powder.png',
    name: 'Waterlogged Powder',
    flavor: 'Seawater finds the magazine. Your guns cough where they used to roar.',
    tiers: [
      { desc: 'Your shots deal 15% less damage', detail: 'Damp powder and weak charges. Every shot you fire deals 15% less damage for the rest of the run.', effects: [{ kind: 'damageMult', mult: 0.85 }] },
      { desc: 'Your shots deal 28% less damage', detail: 'The whole magazine is soaked through. Every shot you fire now deals 28% less damage.', effects: [{ kind: 'damageMult', mult: 0.72 }] },
    ],
  },
  {
    id: 'all_or_nothing', image: '/gauntlet/curses/all_or_nothing.png',
    name: 'All or Nothing',
    flavor: 'The deep has no patience for a near miss. Land it true or do not bother.',
    tiers: [
      { desc: 'Non-crit shots deal 18% less', detail: 'Anything short of a gold critical hits soft. Your hit and graze shots deal 18% less damage; only perfect crits land at full force.', effects: [{ kind: 'noncritDmgMult', mult: 0.82 }] },
      { desc: 'Non-crit shots deal 32% less', detail: 'The margin for error vanishes. Non-crit shots now deal 32% less damage; only a gold crit truly bites.', effects: [{ kind: 'noncritDmgMult', mult: 0.68 }] },
    ],
  },
  {
    id: 'leaden_hands', image: '/gauntlet/curses/leaden_hands.png',
    name: 'Leaden Hands',
    flavor: 'Numb fingers, slow heave. The wheel comes around a moment too late.',
    tiers: [
      { desc: 'Your dodges fail more often', detail: 'The cold sinks into the crew. Your ship is 15% less likely to weave aside from an enemy shot for the rest of the run.', effects: [{ kind: 'dodgeBonus', chance: -0.15, scope: 'allRemaining' }] },
      { desc: 'Your dodges fail far more often', detail: 'The crew goes leaden to the bone. Your ship is 28% less likely to weave aside from an enemy shot.', effects: [{ kind: 'dodgeBonus', chance: -0.28, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'sharpshooters', image: '/gauntlet/curses/sharpshooters.png',
    name: 'Sharpshooters',
    flavor: 'They have done this longer than you have been alive, and they know exactly where to aim.',
    tiers: [
      { desc: 'Enemies crit you 10% more often', detail: 'The drowned gunners find the gaps in your hull. Every enemy is 10% more likely to land a critical hit on you for the rest of the run.', effects: [{ kind: 'incomingCritReduction', chance: -0.10 }] },
      { desc: 'Enemies crit you 20% more often', detail: 'They have your range cold. Every enemy is 20% more likely to land a critical hit on you.', effects: [{ kind: 'incomingCritReduction', chance: -0.20 }] },
    ],
  },
  {
    id: 'barnacled_hull', image: '/gauntlet/curses/barnacled_hull.png',
    name: 'Barnacled Hull',
    flavor: 'Crusted iron and dead coral. These ships have been sinking for a hundred years and still will not go under.',
    tiers: [
      { desc: 'Enemies are 15% tougher', detail: 'The deep grows thick over every hull down here. Enemies have 15% more HP for the rest of the run, so every fight drags on longer.', effects: [{ kind: 'enemyHpScale', mult: 1.15, scope: 'allRemaining' }] },
      { desc: 'Enemies are 25% tougher', detail: 'The crust grows inches thick. Enemies have 25% more HP for the rest of the run.', effects: [{ kind: 'enemyHpScale', mult: 1.25, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'loaded_guns', image: '/gauntlet/curses/loaded_guns.png',
    name: 'Loaded Guns',
    flavor: 'No warning shot, no parley. The drowned were aiming before you ever drew alongside.',
    tiers: [
      { desc: 'Enemies open every fight already loaded', detail: 'Every enemy from now on starts each fight with a cannonball already chambered, so the ones that lead with their guns can fire on you from the opening bell.', effects: [{ kind: 'enemyStartChargesDelta', n: 1, scope: 'allRemaining' }] },
      { desc: 'Enemies open every fight loaded for a volley', detail: 'Every enemy now starts each fight with two cannonballs chambered, ready to open with their heaviest shot.', effects: [{ kind: 'enemyStartChargesDelta', n: 2, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'false_colours', image: '/gauntlet/curses/false_colours.png',
    name: 'False Colors',
    flavor: 'The drowned fly colors that are not their own. Half the targets out there are lies.',
    tiers: [
      { desc: 'A false target sometimes drifts your aim bar', detail: 'On some of your shots (not all), a decoy target band drifts across your aim bar alongside the real gold one. Lock onto the decoy and your shot is a dud: you take chip damage and your turn ends without firing. Pick the real band out of the lie.', effects: [{ kind: 'aimDecoys', n: 1 }] },
      { desc: 'Two false targets sometimes drift your aim bar', detail: 'The deception thickens. Now two decoy bands can drift your aim bar at once, so threading a clean shot to the real target gets harder. Locking either decoy still duds your shot and ends your turn.', effects: [{ kind: 'aimDecoys', n: 2 }] },
    ],
  },
  {
    id: 'drowned_whispers', image: '/gauntlet/curses/drowned_whispers.png',
    name: 'Drowned Whispers',
    flavor: 'Voices well up from the deep with orders that are not yours, and a rattled crew obeys the wrong one.',
    // Tuned down 2026-07-04 (20/33 → 12/20): a scramble STEALS your turn (a
    // loaded Fire comes out a Dodge, a needed Dodge a Reload) and the curse
    // runs the whole descent, so the old rates read as relentless / "broken"
    // even though the roll is a clean once-per-turn check. Still a real threat.
    tiers: [
      { desc: '12% of your orders come out scrambled', detail: 'Each turn, a 12% chance the action you choose comes out as a DIFFERENT one — pick Fire and your crew might dodge, pick Dodge and they might reload, and so on. It only ever swaps to an action you could actually take. (Repair is never scrambled.)', effects: [{ kind: 'confuse', chance: 0.12 }] },
      { desc: '20% of your orders come out scrambled', detail: 'The whispers grow louder. Now a 20% chance each turn that your chosen action comes out as a different valid one.', effects: [{ kind: 'confuse', chance: 0.20 }] },
    ],
  },
  {
    id: 'dead_hands', image: '/gauntlet/curses/dead_hands.png',
    name: 'Dead Hands',
    flavor: 'The cold creeps up the rigging and into your crew. The ones it takes never lift a gun again.',
    tiers: [
      { desc: 'One crew can no longer refresh its ability', detail: "The deep silences one of your crew. Their special ability stops coming back between fights, so once it's spent it stays spent for the rest of the run. (If it was already spent, it's gone now.)", silenceCrew: 1 },
      { desc: 'Two crew can no longer refresh their abilities', detail: 'The cold spreads. A second crew falls silent too, so two of your special abilities no longer refresh for the rest of the run.', silenceCrew: 2 },
    ],
  },
  {
    // ── THE CRUSH — the deep's endless pressure (depth 60+ only) ─────────────
    // NOT part of the normal draw pool: drawCurse turns to it only once every
    // named curse is spent, past DEEP_BEND_START. Each stack is one more
    // "fathom" of pressure — the damage you take compounds +8% per stack — so
    // curse milestones never dry up no matter how deep the run goes. The tier
    // ladder is generated: 15 stacks covers the every-3-depths cadence from
    // ~61 well past depth 100.
    id: 'the_crush', image: '/gauntlet/curses/the_crush.png',
    name: 'The Crush',
    flavor: 'Past sixty fathoms there are no tricks left in the dark. There is only the weight.',
    tiers: Array.from({ length: 15 }, (_, i) => {
      const stacks = i + 1
      const pct = Math.round((Math.pow(1.08, stacks) - 1) * 100)
      return {
        desc: `Take ${pct}% more damage (${stacks} fathom${stacks === 1 ? '' : 's'} of pressure)`,
        detail: `The deep itself leans on your hull, and it never stops leaning. Every enemy hit now lands ${pct}% harder. Every few depths the Crush adds another fathom of pressure on top, and it compounds without end.`,
        effects: [{ kind: 'incomingDmgMult', mult: Math.pow(1.08, stacks), scope: 'allRemaining' }] as TideEffect[],
      }
    }),
  },

  // ── Don's Gauntlet curses (gauntlet: 'don' — never surface in Davy's) ────────
  {
    id: 'narrowed_sights', image: '/gauntlet/curses/narrowed_sights.png', name: 'Narrowed Sights', gauntlet: 'don',
    flavor: 'The green pinches your glass to a needle’s eye. The perfect shot all but vanishes.',
    tiers: [
      { desc: 'The gold crit band shrinks 30%', detail: 'The gold "perfect shot" band on your aim bar narrows by 30% for the rest of the run — crits are far harder to land because the target is simply smaller. Boons that widen the band still help.', effects: [{ kind: 'critZoneScale', mult: 0.70 }] as TideEffect[] },
      { desc: 'The gold crit band shrinks 45%', detail: 'The band pinches to a sliver — 45% narrower. Landing a critical takes near-perfect timing.', effects: [{ kind: 'critZoneScale', mult: 0.55 }] as TideEffect[] },
    ],
  },
  {
    id: 'the_mark', image: '/gauntlet/curses/the_mark.png', name: 'The Mark', gauntlet: 'don',
    flavor: 'The Don paints your hull before the bell. You start every fight already bleeding.',
    tiers: [
      { desc: 'Start every fight Feeble (+15% damage taken, 2 rounds)', detail: 'Every fight from now on opens with your ship already Feeble — you take 15% more damage from every hit for the first 2 rounds of each fight, until it wears off. Cleansing it (a Mender) clears it early.', effects: [{ kind: 'playerStartStatus', status: 'feeble', magnitude: 0.15, turns: 2 }] as TideEffect[] },
      { desc: 'Start every fight Feeble (+22% damage taken, 3 rounds)', detail: 'The brand cuts deeper: every fight opens with your ship Feeble for 3 rounds, taking 22% more damage from every hit until it wears off.', effects: [{ kind: 'playerStartStatus', status: 'feeble', magnitude: 0.22, turns: 3 }] as TideEffect[] },
    ],
  },
  {
    id: 'the_verdict', image: '/gauntlet/curses/the_verdict.png', name: 'The Verdict', gauntlet: 'don',
    flavor: 'The Don has already decided how this ends. His guns just carry out the sentence.',
    tiers: [
      { desc: 'Enemy ultimates hit +25% and charge faster', detail: 'Every enemy ultimate lands 25% harder, and their reloads have a good chance to load an extra charge — so the big blow comes sooner, and hurts more.', effects: [{ kind: 'enemyUltimateBoost', dmgMult: 1.25, chargeChance: 0.35 }] as TideEffect[] },
      { desc: 'Enemy ultimates hit +50% and charge much faster', detail: 'Enemy ultimates now land 50% harder and charge much faster.', effects: [{ kind: 'enemyUltimateBoost', dmgMult: 1.50, chargeChance: 0.60 }] as TideEffect[] },
    ],
  },
  {
    id: 'cutpurse_tide', image: '/gauntlet/curses/cutpurse_tide.png', name: 'Cutpurse Tide', gauntlet: 'don',
    flavor: 'The green picks your pockets. Every hull down here reaches for your powder.',
    tiers: [
      { desc: 'Enemies rip your cannonballs on a +15% chance', detail: 'Every enemy — not just the sharks — gains a 15% chance on a landed hit to tear a loaded cannonball clean off your rack. Reload gets it back, but you lose the tempo.', effects: [{ kind: 'enemyChargeSteal', bonus: 0.15 }] as TideEffect[] },
      { desc: 'Enemies rip your cannonballs on a +28% chance', detail: 'Every enemy now has a 28% chance on a hit to rip a loaded cannonball off your rack.', effects: [{ kind: 'enemyChargeSteal', bonus: 0.28 }] as TideEffect[] },
    ],
  },
  {
    id: 'thornmail', image: '/gauntlet/curses/thornmail.png', name: 'Thornmail', gauntlet: 'don',
    flavor: 'The ghost fleet armours in cold iron that turns a shot the way a reef turns a wave.',
    tiers: [
      { desc: 'Enemies parry 15% of your shots (dealing nothing)', detail: 'Every enemy has a 15% chance to PARRY a shot you fire — it turns the blow aside entirely and takes no damage. Your Mega ultimate can never be parried.', effects: [{ kind: 'enemyParry', chance: 0.15 }] as TideEffect[] },
      { desc: 'Enemies parry 25% of your shots', detail: 'Every enemy now has a 25% chance to parry a shot you fire, taking no damage.', effects: [{ kind: 'enemyParry', chance: 0.25 }] as TideEffect[] },
    ],
  },
  {
    id: 'the_tithe', image: '/gauntlet/curses/the_tithe.png', name: 'The Tithe', gauntlet: 'don',
    flavor: 'Every wound they open on you, the green feeds straight back into their hull. You pay the tithe in blood.',
    tiers: [
      { desc: 'Enemies heal 15% of the damage they deal you', detail: 'Every hit an enemy lands on you heals it for 15% of that damage (never above its own full hull). A long fight against a Tithed enemy is a war of attrition you are losing.', effects: [{ kind: 'enemyLifesteal', pct: 0.15 }] as TideEffect[] },
      { desc: 'Enemies heal 28% of the damage they deal you', detail: 'Every enemy hit now heals it for 28% of the damage it deals you.', effects: [{ kind: 'enemyLifesteal', pct: 0.28 }] as TideEffect[] },
    ],
  },
  {
    id: 'bloodscent', image: '/gauntlet/curses/bloodscent.png', name: 'Bloodscent', gauntlet: 'don',
    flavor: 'The green guides their gunners to your seams. Every hull down here shoots for the kill.',
    tiers: [
      { desc: 'Enemies crit you 15% more often', detail: 'Every enemy in the run gains a flat +15% chance to land a CRITICAL hit on you — the big, painful shots come far more often. Dodging still avoids them entirely.', effects: [{ kind: 'incomingCritReduction', chance: -0.15 }] as TideEffect[] },
      { desc: 'Enemies crit you 28% more often', detail: 'The scent thickens: enemies land criticals on you 28% more often. Bracing and dodging matter more than ever.', effects: [{ kind: 'incomingCritReduction', chance: -0.28 }] as TideEffect[] },
    ],
  },
  {
    id: 'flare_storm', image: '/gauntlet/curses/flare_storm.png', name: 'Flare Storm', gauntlet: 'don',
    flavor: 'The green lights the whole sky. When the keeper’s crews throw flares, they come like a squall.',
    tiers: [
      { desc: 'Flare barrages hit 30% harder and come a bit faster', detail: 'On any enemy that throws a Flare Barrage (the swat-the-flares, don’t-tap-the-red test), every flare you let through or feint you tap chips you for 30% more, and the fuses run a little tighter. Enemies with no flares are unaffected.', effects: [{ kind: 'flareStorm', fuseMult: 0.92, dmgMult: 1.30 }] as TideEffect[] },
      { desc: 'Flare barrages hit 55% harder and come faster', detail: 'The sky never darkens. Each flare mistake chips you for 55% more, and the fuses run tighter. Only enemies that throw flares are affected — but this deep, plenty do.', effects: [{ kind: 'flareStorm', fuseMult: 0.83, dmgMult: 1.55 }] as TideEffect[] },
    ],
  },
  {
    id: 'barrier_regrowth', image: '/gauntlet/curses/barrier_regrowth.png', name: 'Barrier Regrowth', gauntlet: 'don',
    flavor: 'Ghost-iron knits itself shut faster than you can peel it. Hit it all at once, or not at all.',
    tiers: [
      { desc: 'Enemies carry a 25% barrier that reknits 8% each round', detail: 'Every enemy starts each fight behind a barrier worth 25% of its hull, and at the top of every round the barrier reknits 8% of its full value before your shot lands. A slow chip never breaks through — you have to burst it open in one turn (burn bleeds through, the Railgun pierces it).', effects: [{ kind: 'enemyShield', pctMax: 0.25 }, { kind: 'barrierRegrow', pctMax: 0.08 }] as TideEffect[] },
      { desc: 'Enemies carry a 35% barrier that reknits 14% each round', detail: 'The warding is relentless — a 35% barrier that reknits 14% of its full value every round. Only a heavy burst opens the hull beneath.', effects: [{ kind: 'enemyShield', pctMax: 0.35 }, { kind: 'barrierRegrow', pctMax: 0.14 }] as TideEffect[] },
    ],
  },
]

// Depths at which the Locker imposes its next curse. One per milestone, drawn at
// random from the eligible pool (see drawCurse). PAST the fixed schedule the
// cadence CONTINUES every CURSE_INTERVAL depths (isCurseDepth) so deep runs keep
// stacking rules instead of going pure stat-curve — drawCurse self-limits by
// returning null once the pool is finally spent.
export const CURSE_DEPTHS = [4, 7, 10, 13, 16, 19]
const CURSE_INTERVAL = 3
// Tier-2 curses (deepenings of one you already carry) only become eligible from
// this depth on.
export const CURSE_TIER2_DEPTH = 13

/** Is `depth` a curse milestone? The fixed early schedule, then every
 *  CURSE_INTERVAL depths forever after, so the deep end never stops cursing. */
export function isCurseDepth(depth: number, frequencyMult = 1): boolean {
  const last = CURSE_DEPTHS[CURSE_DEPTHS.length - 1]
  const onSchedule = CURSE_DEPTHS.includes(depth) || (depth > last && (depth - last) % CURSE_INTERVAL === 0)
  if (onSchedule) return true
  // Loose Tongue (a signed Term): curse depths come more often. We tighten the
  // recurring interval rather than inventing a new schedule, so the early fixed
  // beats stay intact and the deep end simply curses you more.
  if (frequencyMult > 1 && depth > last) {
    const tightened = Math.max(2, Math.round(CURSE_INTERVAL / frequencyMult))
    return (depth - last) % tightened === 0
  }
  // Below the recurring band, squeeze an extra curse in between the fixed beats.
  if (frequencyMult > 1 && depth <= last && depth >= CURSE_DEPTHS[0]) {
    return CURSE_DEPTHS.some(d => depth === d - 1) && depth > CURSE_DEPTHS[0]
  }
  return false
}

/** Pick the next curse the Locker imposes. Eligible = a fresh tier-1 curse you
 *  don't have, OR (from CURSE_TIER2_DEPTH on) a tier-2 deepening of one you do.
 *  Uniform random among eligible; null if none remain. */
export function drawCurse(curseTiers: Record<string, number>, depth: number, startsAtWorst = false, variant: GauntletVariant = 'davy'): CurseOffer | null {
  // The Crush never enters the normal pool — it's the fallback pressure once
  // every named curse is spent (and only in the deep band).
  const eligible = GAUNTLET_CURSES
    .filter(c => c.id !== 'the_crush' && inGauntletPool(c.gauntlet, variant))
    .map(c => ({ c, next: (curseTiers[c.id] ?? 0) + 1 }))
    .filter(x => x.next <= x.c.tiers.length && (x.next === 1 || depth >= CURSE_TIER2_DEPTH))
  if (eligible.length > 0) {
    const drawn = eligible[Math.floor(Math.random() * eligible.length)]
    const c = drawn.c
    // Loose Tongue II (a signed Term): a fresh curse lands straight at its
    // nastier tier instead of building up to it.
    const next = startsAtWorst ? Math.min(c.tiers.length, Math.max(drawn.next, 2)) : drawn.next
    const t = c.tiers[next - 1]
    return { id: c.id, name: c.name, image: c.image ?? null, flavor: c.flavor, tier: next, desc: t.desc, detail: t.detail, effects: t.effects, hpDrainPct: t.hpDrainPct, silenceCrew: t.silenceCrew, isUpgrade: next > 1 }
  }
  // Pool spent: past the bend the Locker turns to raw pressure — The Crush,
  // one more fathom per curse milestone, effectively forever.
  if (depth > DEEP_BEND_START) {
    const crush = GAUNTLET_CURSES.find(c => c.id === 'the_crush')
    const next = (curseTiers['the_crush'] ?? 0) + 1
    if (crush && next <= crush.tiers.length) {
      const t = crush.tiers[next - 1]
      return { id: crush.id, name: crush.name, image: crush.image ?? null, flavor: crush.flavor, tier: next, desc: t.desc, detail: t.detail, effects: t.effects, hpDrainPct: t.hpDrainPct, silenceCrew: t.silenceCrew, isUpgrade: next > 1 }
    }
  }
  return null
}

/** Run-wide combat effects from every curse currently on the player, at its
 *  active tier. Fed into the combat effect pipeline (mirrors boonEffects). */
export function curseEffects(curseTiers: Record<string, number>): TideEffect[] {
  return Object.entries(curseTiers).flatMap(([id, tier]) =>
    GAUNTLET_CURSES.find(c => c.id === id)?.tiers[tier - 1]?.effects ?? [])
}

/** Total per-fight HP drain (Crushing Depth) from the active curse tiers. */
export function curseHpDrain(curseTiers: Record<string, number>): number {
  return Object.entries(curseTiers).reduce((a, [id, tier]) =>
    a + (GAUNTLET_CURSES.find(c => c.id === id)?.tiers[tier - 1]?.hpDrainPct ?? 0), 0)
}

/** How many crew the active curses silence (Dead Hands) — their abilities stop
 *  refreshing. The host keeps that many crew locked in the used-ability set. */
export function curseSilenceCount(curseTiers: Record<string, number>): number {
  return Object.entries(curseTiers).reduce((a, [id, tier]) =>
    a + (GAUNTLET_CURSES.find(c => c.id === id)?.tiers[tier - 1]?.silenceCrew ?? 0), 0)
}

/** Roman tier marker for curse chips ('' for tier 1, 'II'+ beyond — The Crush
 *  stacks past II, so the ladder runs as far as its 15 fathoms). */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']
export function curseTierLabel(tier: number): string {
  if (tier < 2) return ''
  return ROMAN[Math.min(tier, ROMAN.length - 1)]
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
export type BoonRarity = 'common' | 'rare' | 'legendary'

/** Per-rarity draft WEIGHT (relative odds of being offered) + display color +
 *  label. Stronger boons are rarer, so the draft visibly rewards a good roll. */
export const BOON_RARITY_META: Record<BoonRarity, { label: string; color: string; weight: number }> = {
  common:    { label: 'Common',    color: '#6ee7d6', weight: 1.0 },   // teal
  rare:      { label: 'Rare',      color: '#8b9cff', weight: 0.46 },  // indigo
  legendary: { label: 'Legendary', color: '#f5b94a', weight: 0.15 }, // gold
}

export interface GauntletBoonTier {
  /** Short, plain mechanical summary — the draft chip + breather chip. */
  desc: string
  /** Full plain-English explanation for the details popup (no jargon). */
  detail: string
  effect: TideEffect
}
export interface GauntletBoon {
  id: string
  name: string
  flavor: string
  /** Which gauntlet draws it. Omitted = both (the recycled Davy pool). */
  gauntlet?: GauntletTag
  /** Omit for Common. */
  rarity?: BoonRarity
  /** Tier 1 → 2 → 3, strongest last. The highest tier you hold is the ONE that
   *  applies — a higher tier replaces the lower, it doesn't stack on top.
   *  Legendaries run fewer, bigger tiers. */
  tiers: GauntletBoonTier[]
  /** Optional icon art (transparent PNG). When set, the codex token renders it;
   *  otherwise it falls back to the effect-category glyph. */
  image?: string | null
}

/** A boon's rarity, defaulting to Common. */
export function boonRarity(fam: GauntletBoon): BoonRarity { return fam.rarity ?? 'common' }

export const GAUNTLET_BOONS: GauntletBoon[] = [
  { id: 'broadside_mastery', image: '/gauntlet/boons/broadside_mastery.png', name: 'Broadside Mastery', flavor: 'Your gunners find their rhythm. Everything you fire bites harder.', rarity: 'rare', tiers: [
    { desc: '+10% all damage', detail: 'Every shot deals 10% more damage — both the single-shot Fire action and the Volley. It covers every shot you take, where the focused boons only buff one action for a bigger number.', effect: { kind: 'damageMult', mult: 1.10 } },
    { desc: '+22% all damage', detail: 'Every shot deals 22% more damage — both the single-shot Fire action and the Volley.', effect: { kind: 'damageMult', mult: 1.22 } },
    { desc: '+36% all damage', detail: 'Every shot deals 36% more damage — both the single-shot Fire action and the Volley.', effect: { kind: 'damageMult', mult: 1.36 } },
  ] },
  { id: 'powder_and_shot', image: '/gauntlet/boons/powder_and_shot.png', name: 'Powder & Shot', flavor: 'Dry powder, packed tight. Your single shots punch through.', tiers: [
    { desc: '+14% Fire damage', detail: 'The single-shot Fire action deals 14% more damage. Your Volley (the 3-charge double shot) is unaffected.', effect: { kind: 'fireDmgMult', mult: 1.14 } },
    { desc: '+30% Fire damage', detail: 'The single-shot Fire action deals 30% more damage. Your Volley (the 3-charge double shot) is unaffected.', effect: { kind: 'fireDmgMult', mult: 1.30 } },
    { desc: '+48% Fire damage', detail: 'The single-shot Fire action deals 48% more damage. Your Volley (the 3-charge double shot) is unaffected.', effect: { kind: 'fireDmgMult', mult: 1.48 } },
  ] },
  { id: 'grapeshot', image: '/gauntlet/boons/grapeshot.png', name: 'Grapeshot', flavor: 'A scatter of iron off the rails. Your volleys shred.', tiers: [
    { desc: '+14% Volley damage', detail: 'Your Volley (the 3-charge double shot) deals 14% more damage. Single Fire shots are unaffected.', effect: { kind: 'volleyDmgMult', mult: 1.14 } },
    { desc: '+30% Volley damage', detail: 'Your Volley (the 3-charge double shot) deals 30% more damage. Single Fire shots are unaffected.', effect: { kind: 'volleyDmgMult', mult: 1.30 } },
    { desc: '+48% Volley damage', detail: 'Your Volley (the 3-charge double shot) deals 48% more damage. Single Fire shots are unaffected.', effect: { kind: 'volleyDmgMult', mult: 1.48 } },
  ] },
  { id: 'dead_eye', image: '/gauntlet/boons/dead_eye.png', name: 'Dead-Eye', flavor: 'You learn exactly where a hull wants to break.', tiers: [
    { desc: '8% chance a normal hit becomes a crit', detail: 'When you land a normal hit (the green zone on your aim bar), there’s an 8% chance it upgrades into a critical hit anyway — so you can crit even when you miss the gold band. Grazes don’t count.', effect: { kind: 'critChanceBonus', chance: 0.08 } },
    { desc: '16% chance a normal hit becomes a crit', detail: 'When you land a normal hit (the green zone), there’s a 16% chance it upgrades into a critical hit anyway. Grazes don’t count.', effect: { kind: 'critChanceBonus', chance: 0.16 } },
    { desc: '26% chance a normal hit becomes a crit', detail: 'When you land a normal hit (the green zone), there’s a 26% chance it upgrades into a critical hit anyway. Grazes don’t count.', effect: { kind: 'critChanceBonus', chance: 0.26 } },
  ] },
  { id: 'wide_sights', image: '/gauntlet/boons/wide_sights.png', name: 'Wide Sights', flavor: 'The perfect shot stops being luck.', tiers: [
    { desc: 'Gold crit band 12% wider', detail: 'The gold "perfect shot" band on your aim bar is 12% wider, so landing a critical hit is easier.', effect: { kind: 'critZoneScale', mult: 1.12 } },
    { desc: 'Gold crit band 26% wider', detail: 'The gold "perfect shot" band on your aim bar is 26% wider.', effect: { kind: 'critZoneScale', mult: 1.26 } },
    { desc: 'Gold crit band 42% wider', detail: 'The gold "perfect shot" band on your aim bar is 42% wider.', effect: { kind: 'critZoneScale', mult: 1.42 } },
  ] },
  { id: 'ironhide', image: '/gauntlet/boons/ironhide.png', name: 'Ironhide', flavor: 'Plates doubled along the waterline.', rarity: 'rare', tiers: [
    { desc: 'Take 12% less damage', detail: 'Every hit an enemy lands on you deals 12% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.88, scope: 'allRemaining' } },
    { desc: 'Take 22% less damage', detail: 'Every hit an enemy lands on you deals 22% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.78, scope: 'allRemaining' } },
    { desc: 'Take 34% less damage', detail: 'Every hit an enemy lands on you deals 34% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.66, scope: 'allRemaining' } },
  ] },
  { id: 'press_the_powder', image: '/gauntlet/boons/press_the_powder.png', name: 'Press the Powder', flavor: 'Your crew loads like the deep is at their heels.', tiers: [
    { desc: '10% chance a Reload loads 2 cannonballs', detail: 'Each time you Reload, there’s a 10% chance a second cannonball is loaded for free on top of the usual one.', effect: { kind: 'reloadProc', chance: 0.10, bonusCharges: 1 } },
    { desc: '22% chance a Reload loads 2 cannonballs', detail: 'Each time you Reload, there’s a 22% chance a second cannonball is loaded for free.', effect: { kind: 'reloadProc', chance: 0.22, bonusCharges: 1 } },
    { desc: '36% chance a Reload loads 2 cannonballs', detail: 'Each time you Reload, there’s a 36% chance a second cannonball is loaded for free.', effect: { kind: 'reloadProc', chance: 0.36, bonusCharges: 1 } },
  ] },
  { id: 'following_sea', image: '/gauntlet/boons/following_sea.png', name: 'Following Sea', flavor: 'The current finally runs with you.', rarity: 'rare', tiers: [
    { desc: '+2 Initiative', detail: '+2 Initiative: you fire first more often and slip away faster when you flee. (Dodging and landing shots on a dodging enemy are both Evasion — your Navigation — not this.)', effect: { kind: 'speedDelta', n: 2, scope: 'allRemaining' } },
    { desc: '+4 Initiative', detail: '+4 Initiative: you fire first more often and slip away faster when you flee. (Dodging and landing shots on a dodging enemy are both Evasion — your Navigation — not this.)', effect: { kind: 'speedDelta', n: 4, scope: 'allRemaining' } },
    { desc: '+7 Initiative', detail: '+7 Initiative: you fire first far more often and slip away far faster when you flee. (Dodging and landing shots on a dodging enemy are both Evasion — your Navigation — not this.)', effect: { kind: 'speedDelta', n: 7, scope: 'allRemaining' } },
  ] },
  { id: 'bilge_pump', image: '/gauntlet/boons/bilge_pump.png', name: 'Bilge Pump', flavor: 'Patch the seams in the lull before the next gun.', tiers: [
    { desc: 'Heal 5% max HP each fight', detail: 'At the start of every fight, your ship repairs 5% of its maximum HP. Scales with your hull, so it keeps mattering as you go deeper.', effect: { kind: 'startOfFightHealPct', pctMax: 0.05 } },
    { desc: 'Heal 9% max HP each fight', detail: 'At the start of every fight, your ship repairs 9% of its maximum HP.', effect: { kind: 'startOfFightHealPct', pctMax: 0.09 } },
    { desc: 'Heal 14% max HP each fight', detail: 'At the start of every fight, your ship repairs 14% of its maximum HP.', effect: { kind: 'startOfFightHealPct', pctMax: 0.14 } },
  ] },
  { id: 'ghostward', image: '/gauntlet/boons/ghostward.png', name: 'Ghostward', flavor: 'Salt and cold iron at the rails. The drowned aim wide.', tiers: [
    { desc: 'Enemies crit 12% less', detail: 'Enemies are 12% less likely to land a critical hit on you.', effect: { kind: 'incomingCritReduction', chance: 0.12 } },
    { desc: 'Enemies crit 24% less', detail: 'Enemies are 24% less likely to land a critical hit on you.', effect: { kind: 'incomingCritReduction', chance: 0.24 } },
    { desc: 'Enemies crit 40% less', detail: 'Enemies are 40% less likely to land a critical hit on you.', effect: { kind: 'incomingCritReduction', chance: 0.40 } },
  ] },
  // ── RARE ───────────────────────────────────────────────────────────────────
  { id: 'cold_fury', image: '/gauntlet/boons/cold_fury.png', name: 'Cold Fury', flavor: 'When the shot lands true, it lands like the deep itself.', rarity: 'rare', tiers: [
    { desc: '+17% critical damage', detail: 'Your critical hits deal 17% more damage. Stacks with Wide Sights / Dead-Eye landing more crits in the first place.', effect: { kind: 'critDmgMult', mult: 1.17 } },
    { desc: '+35% critical damage', detail: 'Your critical hits deal 35% more damage.', effect: { kind: 'critDmgMult', mult: 1.35 } },
    { desc: '+52% critical damage', detail: 'Your critical hits deal 52% more damage.', effect: { kind: 'critDmgMult', mult: 1.52 } },
  ] },
  { id: 'giant_killer', image: '/gauntlet/boons/giant_killer.png', name: 'Giant-Killer', flavor: 'The bigger the hull, the more of it to hit.', rarity: 'rare', tiers: [
    { desc: '+17% boss damage', detail: 'Deal 17% more damage to boss-depth ships. Regular enemies are unaffected.', effect: { kind: 'bossDamageMult', mult: 1.17 } },
    { desc: '+33% boss damage', detail: 'Deal 33% more damage to boss-depth ships. Regular enemies are unaffected.', effect: { kind: 'bossDamageMult', mult: 1.33 } },
    { desc: '+48% boss damage', detail: 'Deal 48% more damage to boss-depth ships. Regular enemies are unaffected.', effect: { kind: 'bossDamageMult', mult: 1.48 } },
  ] },
  { id: 'spiteful_wake', image: '/gauntlet/boons/spiteful_wake.png', name: 'Spiteful Wake', flavor: 'Strike the hull and the hull strikes back — and slip its shot and the sea flings your spite anyway.', rarity: 'rare', tiers: [
    { desc: 'Enemies take back 18% of the hit they aim at you (12% if you dodge)', detail: "Whenever an enemy fires on you, it takes 18% of that shot's full damage right back — even if your armour or a shield soaks the blow. When you DODGE, the enemy still takes 12% of the damage it would have dealt. You punish them whether the hit lands or not.", effect: { kind: 'retaliatePct', pct: 0.18, dodgePct: 0.12 } },
    { desc: 'Enemies take back 30% of the hit they aim at you (15% if you dodge)', detail: "Enemies take back 30% of every shot's full damage (soaked or not), and 15% of any shot you dodge.", effect: { kind: 'retaliatePct', pct: 0.30, dodgePct: 0.15 } },
    { desc: 'Enemies take back 42% of the hit they aim at you (18% if you dodge)', detail: "Enemies take back 42% of every shot's full damage (soaked or not), and 18% of any shot you dodge.", effect: { kind: 'retaliatePct', pct: 0.42, dodgePct: 0.18 } },
  ] },
  { id: 'wounded_fury', image: '/gauntlet/boons/wounded_fury.png', name: 'Wounded Fury', flavor: 'The closer to sinking, the harder your guns bite.', rarity: 'rare', tiers: [
    { desc: 'Up to +17% damage as HP drops', detail: 'Your shots hit harder the lower your HP, scaling with missing health. At full HP nothing; right at the brink, +17%.', effect: { kind: 'lowHpDamage', maxBonus: 0.17 } },
    { desc: 'Up to +35% damage as HP drops', detail: 'Your shots hit harder the lower your HP, scaling with missing health. At full HP nothing; right at the brink, +35%.', effect: { kind: 'lowHpDamage', maxBonus: 0.35 } },
    { desc: 'Up to +52% damage as HP drops', detail: 'Your shots hit harder the lower your HP, scaling with missing health. At full HP nothing; right at the brink, +52%.', effect: { kind: 'lowHpDamage', maxBonus: 0.52 } },
  ] },
  // ── Momentum — damage that FEEDS on the run: kills stacked, depth dared,
  //    and clean crits chained. Each rewards a different way of pushing.
  { id: 'rising_tide', image: '/gauntlet/boons/rising_tide.png', name: 'Rising Tide', flavor: 'Every hull you send down feeds the swell behind you.', rarity: 'rare', tiers: [
    { desc: '+3% damage per enemy sunk (max +24%)', detail: 'Every enemy you sink this run permanently raises your damage by 3%, up to +24%. Counts every hull you have already sunk, and bosses count too. It never resets — the deeper you fight, the harder you hit.', effect: { kind: 'killStackDamage', perKill: 0.03, maxBonus: 0.24 } },
    { desc: '+4% damage per enemy sunk (max +36%)', detail: 'Every enemy you sink this run permanently raises your damage by 4%, up to +36%. Counts hulls already sunk and bosses. Never resets.', effect: { kind: 'killStackDamage', perKill: 0.04, maxBonus: 0.36 } },
    { desc: '+5% damage per enemy sunk (max +45%)', detail: 'Every enemy you sink this run permanently raises your damage by 5%, up to +45%. Counts hulls already sunk and bosses. Never resets.', effect: { kind: 'killStackDamage', perKill: 0.05, maxBonus: 0.45 } },
  ] },
  { id: 'abyssal_bounty', image: '/gauntlet/boons/abyssal_bounty.png', name: 'Abyssal Bounty', flavor: 'The pressure of the deep loads every gun.', rarity: 'rare', tiers: [
    { desc: '+1.2% damage per depth (max +18%)', detail: 'Your damage rises with how deep you are — 1.2% for every depth you have reached, up to +18%. It scales live as you descend, and is full value the moment you take it.', effect: { kind: 'depthScaleDamage', perDepth: 0.012, maxBonus: 0.18 } },
    { desc: '+1.8% damage per depth (max +28%)', detail: 'Your damage rises with how deep you are — 1.8% for every depth reached, up to +28%. Scales live as you descend.', effect: { kind: 'depthScaleDamage', perDepth: 0.018, maxBonus: 0.28 } },
    { desc: '+2.4% damage per depth (max +38%)', detail: 'Your damage rises with how deep you are — 2.4% for every depth reached, up to +38%. Scales live as you descend.', effect: { kind: 'depthScaleDamage', perDepth: 0.024, maxBonus: 0.38 } },
  ] },
  { id: 'cannonade', image: '/gauntlet/boons/cannonade.png', name: 'Cannonade', flavor: 'Land them clean and the guns never cool.', rarity: 'rare', tiers: [
    { desc: '+6% damage per crit in a row (up to +30%)', detail: 'Every critical hit you land in a row adds +6% damage, stacking up to +30%. Landing any shot that is NOT a crit resets the streak to zero, and the streak starts fresh each fight.', effect: { kind: 'critStreakDamage', perStack: 0.06, maxStacks: 5 } },
    { desc: '+8% damage per crit in a row (up to +40%)', detail: 'Every critical hit in a row adds +8% damage, stacking up to +40%. Any non-crit shot resets the streak; it starts fresh each fight.', effect: { kind: 'critStreakDamage', perStack: 0.08, maxStacks: 5 } },
    { desc: '+10% damage per crit in a row (up to +60%)', detail: 'Every critical hit in a row adds +10% damage, stacking up to +60%. Any non-crit shot resets the streak; it starts fresh each fight.', effect: { kind: 'critStreakDamage', perStack: 0.10, maxStacks: 6 } },
  ] },
  { id: 'counter_battery', image: '/gauntlet/boons/counter_battery.png', name: 'Counter-Battery', flavor: 'Answer their broadside with yours — and let the sea swallow theirs.', rarity: 'rare', tiers: [
    { desc: '20% to cancel the enemy’s shot when you both fire', detail: 'When you Fire, Volley or Mega on the same turn the enemy fires or volleys AND your shot lands, you have a 20% chance to smash their shot out of the air — their attack is fully negated while yours still hits. A whiffed aim does not count.', effect: { kind: 'counterFireChance', chance: 0.20 } },
    { desc: '32% to cancel the enemy’s shot when you both fire', detail: 'When you Fire, Volley or Mega on the same turn the enemy fires or volleys and your shot lands, you have a 32% chance to negate their attack while yours still hits.', effect: { kind: 'counterFireChance', chance: 0.32 } },
    { desc: '45% to cancel the enemy’s shot when you both fire', detail: 'When you Fire, Volley or Mega on the same turn the enemy fires or volleys and your shot lands, you have a 45% chance to negate their attack while yours still hits.', effect: { kind: 'counterFireChance', chance: 0.45 } },
  ] },
  // ── Elemental builds — lean a run into ICE (control + shatter) or FIRE
  //    (stacking DoT). Each grants its proc chance ON ITS OWN, so you can take
  //    it without the matching cannonball; with the cannonball the chances stack
  //    but RaidCombat caps the total at 20% so a specialist gets DEADLIER procs,
  //    not infinitely more frequent ones. Higher tiers add signature levers.
  { id: 'permafrost', image: '/gauntlet/boons/permafrost.png', name: 'Permafrost', flavor: 'The cold off your guns finds the seams in their hull and holds it fast.', rarity: 'rare', tiers: [
    { desc: '10% chance to freeze; frozen ships take +20% damage', detail: 'Each hit you land has a 10% chance to FREEZE the enemy — it loses its next turn — and you deal 20% more damage to a frozen ship. (Stacks with the Frozen Cannonball item, up to 20% total freeze chance.)', effect: { kind: 'iceAffinity', freezeChance: 0.10, frozenDmgMult: 1.20 } },
    { desc: '15% chance to freeze; frozen ships take +32% damage', detail: 'Freeze chance rises to 15% and frozen ships take 32% more damage. NEW — Brittle: a critical hit on a frozen ship shatters the ice for DOUBLE the frozen bonus.', effect: { kind: 'iceAffinity', freezeChance: 0.15, frozenDmgMult: 1.32, brittle: true } },
    { desc: '20% chance to freeze for 2 turns; frozen ships take +42% damage', detail: 'Freeze chance rises to 20%, frozen ships take 42% more, and Brittle stays. NEW — Deep Freeze: your freezes now last TWO skipped turns instead of one.', effect: { kind: 'iceAffinity', freezeChance: 0.20, frozenDmgMult: 1.42, brittle: true, deepFreeze: true } },
  ] },
  { id: 'wildfire', image: '/gauntlet/boons/wildfire.png', name: 'Wildfire', flavor: 'You set the sea alight and let it do the work the guns started.', rarity: 'rare', tiers: [
    { desc: '10% chance to set enemies on fire', detail: 'Each hit you land has a 10% chance to set the enemy ON FIRE — it takes damage at the start of each of its turns for 3 turns (each tick deals 13% of the hit that started the fire). Stacks with the Incendiary Cannonball item, up to 20% total burn chance.', effect: { kind: 'fireAffinity', burnChance: 0.10, burnTurnsBonus: 1, burnTickMult: 1.3 } },
    { desc: '15% chance to burn; hitting a burning ship rekindles it', detail: 'Burn chance rises to 15% and the fire ticks harder (16% of the hit). NEW — Reignite: hitting an already-burning ship resets the fire to full duration, so you can keep it burning as long as you keep landing shots.', effect: { kind: 'fireAffinity', burnChance: 0.15, burnTurnsBonus: 1, burnTickMult: 1.6, reignite: true } },
    { desc: '20% chance to burn for 4 turns; fires can flare for bonus bursts', detail: 'Burn chance rises to 20%, fires last 4 turns, ticks hit their ceiling (20% of the hit), and Reignite stays. NEW — Backdraft: each burn tick has a chance to flare up for a bonus burst of damage — the longer the fire cooks, the more it erupts.', effect: { kind: 'fireAffinity', burnChance: 0.20, burnTurnsBonus: 2, burnTickMult: 2.0, reignite: true, backdraft: true } },
  ] },
  // ── Defensive HP scaling — the answer to enemy damage climbing with depth
  //    while a flat HP pool falls behind (DR is already covered by Ironhide /
  //    Pressure Hull; this grows the POOL). Back-loaded tiers so a damage build
  //    can't splash one point for cheap insurance — the payoff needs commitment.
  //    Resolved by the Gauntlet HOST into the run's live max HP; each increase
  //    is healed to the player, so a deep-tank build gets a bigger bar AND
  //    passive sustain to survive the trades (which is what thorns needs).
  { id: 'deep_hull', image: '/gauntlet/boons/deep_hull.png', name: 'Deep Hull', flavor: 'The pressure of the deep packs your timbers tighter the further you fall.', rarity: 'rare', tiers: [
    { desc: '+0.8% max HP per depth (max +14%)', detail: 'Your maximum HP grows with how deep you are — 0.8% for every depth reached, up to +14%. It scales live as you descend, and each increase is healed to you.', effect: { kind: 'maxHpPerDepth', perDepth: 0.008, max: 0.14 } },
    { desc: '+1.6% max HP per depth (max +30%)', detail: 'Your maximum HP grows 1.6% for every depth reached, up to +30%. Scales live as you descend; each increase heals you by that much.', effect: { kind: 'maxHpPerDepth', perDepth: 0.016, max: 0.30 } },
    { desc: '+2.4% max HP per depth (max +48%)', detail: 'Your maximum HP grows 2.4% for every depth reached, up to +48%. Scales live as you descend; each increase heals you by that much.', effect: { kind: 'maxHpPerDepth', perDepth: 0.024, max: 0.48 } },
  ] },
  { id: 'salvage_hull', image: '/gauntlet/boons/salvage_hull.png', name: 'Salvage Hull', flavor: 'Every wreck you leave, your crew strips for plating.', rarity: 'rare', tiers: [
    { desc: '+0.6% max HP per hull sunk (max +12%)', detail: 'Every enemy you sink this run permanently raises your maximum HP by 0.6%, up to +12%. Bosses count, it never resets, and each gain is healed to you.', effect: { kind: 'maxHpPerKill', perKill: 0.006, max: 0.12 } },
    { desc: '+1.2% max HP per hull sunk (max +26%)', detail: 'Every hull sunk raises your maximum HP by 1.2%, up to +26%. Never resets; each gain heals you by that much.', effect: { kind: 'maxHpPerKill', perKill: 0.012, max: 0.26 } },
    { desc: '+1.8% max HP per hull sunk (max +42%)', detail: 'Every hull sunk raises your maximum HP by 1.8%, up to +42%. Never resets; each gain heals you by that much.', effect: { kind: 'maxHpPerKill', perKill: 0.018, max: 0.42 } },
  ] },
  { id: 'reinforced_hull', image: '/gauntlet/boons/reinforced_hull.png', name: 'Reinforced Hull', flavor: 'Double plate along the keel. More ship to sink.', rarity: 'rare', tiers: [
    { desc: '+8% max HP', detail: 'Your maximum HP is 8% higher for the rest of the run. It also makes every heal and shield that scales off your max HP bigger.', effect: { kind: 'maxHpMult', mult: 1.08 } },
    { desc: '+20% max HP', detail: 'Your maximum HP is 20% higher for the rest of the run.', effect: { kind: 'maxHpMult', mult: 1.20 } },
    { desc: '+36% max HP', detail: 'Your maximum HP is 36% higher for the rest of the run.', effect: { kind: 'maxHpMult', mult: 1.36 } },
  ] },
  // ── LEGENDARY (rare; bigger, one-of-a-kind effects, fewer tiers) ────────────
  { id: 'executioner', image: '/gauntlet/boons/executioner.png', name: 'Executioner', flavor: "Below a certain mark, a hull is already gone — it just doesn't know it yet.", rarity: 'legendary', tiers: [
    { desc: 'Sink enemies below 5% HP', detail: 'The instant any hit drops an enemy to 5% of its health or lower, it is sunk outright — no need to chip out the last sliver.', effect: { kind: 'executeThreshold', pct: 0.05 } },
    { desc: 'Sink enemies below 8% HP', detail: 'The instant any hit drops an enemy to 8% of its health or lower, it is sunk outright.', effect: { kind: 'executeThreshold', pct: 0.08 } },
  ] },
  { id: 'leviathans_hunger', image: '/gauntlet/boons/leviathans_hunger.png', name: "Leviathan's Hunger", flavor: 'Every wound you open, the deep drinks — and feeds it back to your hull.', rarity: 'legendary', tiers: [
    { desc: 'Heal 10% of the damage you deal, up to 20% of your hull a hit', detail: 'Whenever you damage an enemy, your ship heals for 10% of that damage — the harder you hit, the more you heal. One hit can return at most 20% of your maximum HP, which is always twice your lifesteal. Other lifesteal, like Davy’s Blood Cannon, adds to your percentage and lifts that cap with it.', effect: { kind: 'lifestealPct', pct: 0.10 } },
    { desc: 'Heal 20% of the damage you deal, up to 40% of your hull a hit', detail: 'Whenever you damage an enemy, your ship heals for 20% of that damage. One hit can return at most 40% of your maximum HP, which is always twice your lifesteal. Other lifesteal, like Davy’s Blood Cannon, adds to your percentage and lifts that cap with it.', effect: { kind: 'lifestealPct', pct: 0.20 } },
  ] },
  { id: 'powder_hoard', image: '/gauntlet/boons/powder_hoard.png', name: 'Powder Hoard', flavor: "Whatever your crew doesn't spend, they keep racked for the next hull.", rarity: 'legendary', tiers: [
    { desc: 'Carry up to 2 cannonballs to the next fight', detail: 'Cannonballs you leave unfired when a fight ends carry into the next one, up to 2 of them.', effect: { kind: 'chargeCarryover', cap: 2 } },
    { desc: 'Carry every unfired cannonball to the next fight', detail: 'Every cannonball you leave unfired when a fight ends carries into the next one, up to your full magazine.', effect: { kind: 'chargeCarryover', cap: 99 } },
  ] },
  { id: 'stormward', image: '/gauntlet/boons/stormward.png', name: 'Stormward', flavor: 'A ward of cold iron reforms before every gun. It eats the first blows so your hull never feels them.', rarity: 'legendary', tiers: [
    { desc: 'Shield 10% of max HP each fight', detail: 'Start every fight with a shield worth 10% of your max HP. It soaks incoming damage before your hull takes any, and reforms fresh each fight.', effect: { kind: 'fightShield', pctMax: 0.10 } },
    { desc: 'Shield 18% of max HP each fight', detail: 'Start every fight with a shield worth 18% of your max HP. It soaks incoming damage before your hull takes any, and reforms fresh each fight.', effect: { kind: 'fightShield', pctMax: 0.18 } },
  ] },
  // ── Don's Gauntlet boons (gauntlet: 'don' — the ghost fleet's on-hit hexes) ──
  { id: 'rattling_shot', image: '/gauntlet/boons/rattling_shot.png', name: 'Rattling Shot', gauntlet: 'don', flavor: 'Your iron rattles a hull loose, and it flinches at every blow after.', rarity: 'rare', tiers: [
    { desc: '35% on a hit to make the enemy Feeble (+15% damage taken, 2 rounds)', detail: 'Whenever you land a hit, there is a 35% chance the enemy turns Feeble — it takes 15% more damage from everything for the next 2 rounds. Reapplying refreshes it rather than stacking.', effect: { kind: 'statusOnHit', status: 'feeble', chance: 0.35, magnitude: 0.15, turns: 2 } },
    { desc: '45% on a hit to make the enemy Feeble (+20% damage taken, 2 rounds)', detail: 'Whenever you land a hit, there is a 45% chance the enemy turns Feeble — it takes 20% more damage from everything for the next 2 rounds.', effect: { kind: 'statusOnHit', status: 'feeble', chance: 0.45, magnitude: 0.20, turns: 2 } },
    { desc: '55% on a hit to make the enemy Feeble (+25% damage taken, 3 rounds)', detail: 'Whenever you land a hit, there is a 55% chance the enemy turns Feeble — it takes 25% more damage from everything for the next 3 rounds.', effect: { kind: 'statusOnHit', status: 'feeble', chance: 0.55, magnitude: 0.25, turns: 3 } },
  ] },
  { id: 'chainshot', image: '/gauntlet/boons/chainshot.png', name: 'Chainshot', gauntlet: 'don', flavor: 'Linked iron fouls their rigging. A snarled hull is a slow hull.', tiers: [
    { desc: '30% on a hit to Slow the enemy (2 rounds)', detail: 'Whenever you land a hit, there is a 30% chance the enemy is Slowed for 2 rounds — it acts later in the round, ceding you the opening more often.', effect: { kind: 'statusOnHit', status: 'slowed', chance: 0.30, magnitude: 2, turns: 2 } },
    { desc: '45% on a hit to Slow the enemy (2 rounds)', detail: 'Whenever you land a hit, there is a 45% chance the enemy is Slowed for 2 rounds — it acts later in the round, ceding you the opening more often.', effect: { kind: 'statusOnHit', status: 'slowed', chance: 0.45, magnitude: 2, turns: 2 } },
    { desc: '60% on a hit to heavily Slow the enemy (3 rounds)', detail: 'Whenever you land a hit, there is a 60% chance the enemy is heavily Slowed for 3 rounds — it acts later in the round, ceding you the opening far more often.', effect: { kind: 'statusOnHit', status: 'slowed', chance: 0.60, magnitude: 3, turns: 3 } },
  ] },
  { id: 'hexshot', image: '/gauntlet/boons/hexshot.png', name: 'Hexshot', gauntlet: 'don', flavor: 'A cursed round saps the fight out of whatever it strikes.', tiers: [
    { desc: '30% on a hit to Weaken the enemy (−15% damage dealt, 2 rounds)', detail: 'Whenever you land a hit, there is a 30% chance the enemy is Weakened — its own hits deal 15% less damage for the next 2 rounds.', effect: { kind: 'statusOnHit', status: 'weaken', chance: 0.30, magnitude: 0.15, turns: 2 } },
    { desc: '45% on a hit to Weaken the enemy (−22% damage dealt, 2 rounds)', detail: 'Whenever you land a hit, there is a 45% chance the enemy is Weakened — its own hits deal 22% less damage for the next 2 rounds.', effect: { kind: 'statusOnHit', status: 'weaken', chance: 0.45, magnitude: 0.22, turns: 2 } },
    { desc: '60% on a hit to Weaken the enemy (−30% damage dealt, 3 rounds)', detail: 'Whenever you land a hit, there is a 60% chance the enemy is Weakened — its own hits deal 30% less damage for the next 3 rounds.', effect: { kind: 'statusOnHit', status: 'weaken', chance: 0.60, magnitude: 0.30, turns: 3 } },
  ] },
  { id: 'armor_piercing', image: '/gauntlet/boons/armor_piercing.png', name: 'Armor-Piercing Shot', gauntlet: 'don', flavor: 'Ghost-iron finds the gap in any ward. Barriers are a suggestion.', rarity: 'rare', tiers: [
    { desc: 'Your shots ignore 35% of enemy barriers', detail: 'A slice of every shot you fire skips straight past an enemy barrier and hits the hull — 35% of the damage ignores the shield entirely. The hard counter to the Warding curse and the ghost fleet’s shielded hulls.', effect: { kind: 'shieldPierce', pct: 0.35 } },
    { desc: 'Your shots ignore 55% of enemy barriers', detail: '55% of every shot skips the barrier and hits the hull directly.', effect: { kind: 'shieldPierce', pct: 0.55 } },
    { desc: 'Your shots ignore 75% of enemy barriers', detail: '75% of every shot skips the barrier and hits the hull directly — barriers barely slow you.', effect: { kind: 'shieldPierce', pct: 0.75 } },
  ] },
  { id: 'press_gang', image: '/gauntlet/boons/press_gang.png', name: 'Press-Gang', gauntlet: 'don', flavor: 'What’s theirs is yours. Rip the shot right off their deck and load it yourself.', rarity: 'rare', tiers: [
    { desc: '20% on a hit to steal an enemy cannonball', detail: 'Whenever you land a hit, there’s a 20% chance you rip a loaded cannonball off the enemy and ram it into your own rack — you gain the shot, they lose it. Does nothing if your rack is already full or the enemy is empty.', effect: { kind: 'stealCharge', chance: 0.20 } },
    { desc: '30% on a hit to steal an enemy cannonball', detail: 'Whenever you land a hit, there’s a 30% chance you steal a loaded cannonball off the enemy into your own rack.', effect: { kind: 'stealCharge', chance: 0.30 } },
    { desc: '40% on a hit to steal an enemy cannonball', detail: 'Whenever you land a hit, there’s a 40% chance you steal a loaded cannonball off the enemy into your own rack.', effect: { kind: 'stealCharge', chance: 0.40 } },
  ] },
  { id: 'loaded_for_bear', image: '/gauntlet/boons/loaded_for_bear.png', name: 'Loaded for Bear', gauntlet: 'don', flavor: 'Every so often your gunners pack a shot that simply cannot miss the mark.', tiers: [
    { desc: 'Every 5th landed shot is a guaranteed crit', detail: 'Count your landed shots each fight — every 5th one is upgraded to a guaranteed critical hit. (A shot that whiffs on the count just doesn’t upgrade.)', effect: { kind: 'guaranteedCritEvery', n: 5 } },
    { desc: 'Every 4th landed shot is a guaranteed crit', detail: 'Every 4th landed shot each fight is upgraded to a guaranteed critical hit.', effect: { kind: 'guaranteedCritEvery', n: 4 } },
    { desc: 'Every 3rd landed shot is a guaranteed crit', detail: 'Every 3rd landed shot each fight is upgraded to a guaranteed critical hit.', effect: { kind: 'guaranteedCritEvery', n: 3 } },
  ] },
  { id: 'krakens_grip', image: '/gauntlet/boons/krakens_grip.png', name: "Kraken's Grip", gauntlet: 'don', flavor: 'A landed shot calls the deep up around their hull — and the deep does not let go.', rarity: 'legendary', tiers: [
    { desc: '18% on a hit to STUN the enemy (skips its next turn)', detail: 'Whenever you land a hit, there’s an 18% chance the deep seizes the enemy — it loses its next turn entirely, exactly like a freeze. Bosses are not immune.', effect: { kind: 'stunOnHit', chance: 0.18, turns: 1 } },
    { desc: '26% on a hit to STUN the enemy for 2 turns', detail: 'Whenever you land a hit, there’s a 26% chance the deep seizes the enemy and holds it for its next TWO turns.', effect: { kind: 'stunOnHit', chance: 0.26, turns: 2 } },
  ] },
  { id: 'cutlass_guard', image: '/gauntlet/boons/cutlass_guard.png', name: 'Cutlass Guard', gauntlet: 'don', flavor: 'Meet the blow, turn it, and answer before they’ve recovered.', rarity: 'rare', tiers: [
    { desc: '20% to parry a hit (take nothing) and lash back 40%', detail: 'Every enemy blow that would land has a 20% chance to be PARRIED — you take no damage, and 40% of the hit it aimed at you is flung straight back. A parry counts as an avoided hit.', effect: { kind: 'parryChance', chance: 0.20, reflectPct: 0.40 } },
    { desc: '30% to parry a hit and lash back 55%', detail: 'Enemy blows have a 30% chance to be parried; you take nothing and reflect 55% of the intended hit.', effect: { kind: 'parryChance', chance: 0.30, reflectPct: 0.55 } },
    { desc: '40% to parry a hit and lash back 70%', detail: 'Enemy blows have a 40% chance to be parried; you take nothing and reflect 70% of the intended hit.', effect: { kind: 'parryChance', chance: 0.40, reflectPct: 0.70 } },
  ] },
  { id: 'steady_sights', image: '/gauntlet/boons/steady_sights.png', name: 'Steady Sights', gauntlet: 'don', flavor: 'The green can fog every glass in the fleet but yours.', tiers: [
    { desc: 'Aim fog + blackout cut in half', detail: 'Any fog, mist, or blackout thrown over your aim bar (enemy Mist Veil, the ghost fleet, fog curses) is cut by 50% — your sight stays clearer than the fleet’s.', effect: { kind: 'aimClarity', reduce: 0.5 } },
    { desc: 'Aim fog + blackout cut 75%', detail: 'Aim fog, mist, and blackout are reduced by 75%.', effect: { kind: 'aimClarity', reduce: 0.75 } },
    { desc: 'Immune to aim fog, blackout AND decoys', detail: 'Nothing clouds your glass: aim fog, mist, and blackout are gone entirely, and false-target decoys never drift your bar.', effect: { kind: 'aimClarity', reduce: 1 } },
  ] },
  { id: 'dons_favor', image: '/gauntlet/boons/dons_favor.png', name: "The Don's Favor", gauntlet: 'don', flavor: 'The Don owes no one, but now and then the green smiles on you anyway. Never the same way twice.', rarity: 'legendary', tiers: [
    { desc: 'Open each fight with a random blessing (Enrage / Fortify / Mending)', detail: 'At the start of EVERY fight you roll one of three blessings for the whole fight: ENRAGED (+25% damage dealt), FORTIFIED (−25% damage taken), or MENDING (heal a slice of your hull each round). Which one is always a surprise.', effect: { kind: 'randomFightBuff', magnitude: 0.25 } },
    { desc: 'A STRONGER random blessing each fight', detail: 'Every fight opens with a stronger random blessing: ENRAGED (+40% damage), FORTIFIED (−40% damage taken), or MENDING (a bigger heal each round).', effect: { kind: 'randomFightBuff', magnitude: 0.40 } },
  ] },
  { id: 'second_calling', image: '/gauntlet/boons/second_calling.png', name: 'Second Calling', gauntlet: 'don', flavor: 'Some crews the deep just won’t let rest. Call them once, and the green calls them right back.', rarity: 'rare', tiers: [
    { desc: '15% chance a crew ability isn’t spent when used', detail: 'When you fire a crew ability, there’s a 15% chance it ISN’T spent — the effect still happens, but the crew keeps their station and the ability is ready again next turn (one ability per turn still holds).', effect: { kind: 'abilityRefundChance', chance: 0.15 } },
    { desc: '25% chance a crew ability isn’t spent when used', detail: 'When you fire a crew ability, there’s a 25% chance it isn’t spent and stays ready for next turn.', effect: { kind: 'abilityRefundChance', chance: 0.25 } },
    { desc: '35% chance a crew ability isn’t spent when used', detail: 'When you fire a crew ability, there’s a 35% chance it isn’t spent and stays ready for next turn.', effect: { kind: 'abilityRefundChance', chance: 0.35 } },
  ] },
  { id: 'blood_in_the_water', image: '/gauntlet/boons/blood_in_the_water.png', name: 'Blood in the Water', gauntlet: 'don', flavor: 'The deep hates a wasted kill. Strike harder than the hull can take, and it hands you back the difference.', rarity: 'rare', tiers: [
    { desc: 'Heal 20% of overkill damage on a kill', detail: 'When a shot sinks a hull, any damage that lands PAST its remaining HP is overkill (normally wasted). You heal 20% of that overkill back to your ship. A clean shot that drops it exactly to zero heals nothing — the reward is for hitting hard enough to spill over. Each hit’s heal is capped so a huge Mega can’t refill your whole bar at once.', effect: { kind: 'overkillHealPct', pct: 0.20 } },
    { desc: 'Heal 35% of overkill damage on a kill', detail: 'A kill spills over harder: you heal 35% of any overkill damage (the amount a killing blow lands past the hull’s remaining HP) back to your ship. Per-hit capped.', effect: { kind: 'overkillHealPct', pct: 0.35 } },
    { desc: 'Heal 50% of overkill damage on a kill', detail: 'Half of every killing blow’s overkill comes back as hull. Land a massive shot on a wounded enemy and you top yourself off on the way through. Per-hit capped so one shot can’t full-heal you.', effect: { kind: 'overkillHealPct', pct: 0.50 } },
  ] },
  { id: 'manowars_wrath', image: '/gauntlet/boons/manowars_wrath.png', name: "Man-o-War's Wrath", gauntlet: 'don', flavor: 'The big gun was already the last word. Now it argues.', rarity: 'legendary', tiers: [
    { desc: '+22% Mega damage', detail: 'Your Mega — the Man-o-War ultimate that spends a full 4-charge magazine — hits 22% harder. Affects the Mega ONLY: your Fire and Volley are unchanged. This does nothing unless your ship carries a Mega augment (the Man-o-War ultimate weapon), so only take it if you can fire one.', effect: { kind: 'megaDmgMult', mult: 1.22 } },
    { desc: '+38% Mega damage', detail: 'Your Mega ultimate hits 38% harder. Mega only — Fire and Volley unaffected. Requires a Mega augment to do anything.', effect: { kind: 'megaDmgMult', mult: 1.38 } },
    { desc: '+58% Mega damage', detail: 'Your Mega ultimate hits 58% harder — the single biggest shot in your arsenal, turned up. Mega only. Requires a Mega augment to do anything.', effect: { kind: 'megaDmgMult', mult: 1.58 } },
  ] },
]

// Boon drafts fall on a ~every-2.5-depths cadence (alternating +2 / +3), up
// from the old flat every-3. This offsets the opportunity cost of DRAFTING
// confluences (which used to auto-grant for free) — more picks means a
// committed build can afford a synergy AND keep deepening its boons. Curses
// stay every 3 (isCurseDepth), so this is a deliberate net power lift.
//
// Expressed as a period-5 pattern anchored at depth 2 (offsets 0 and 2 in each
// block of 5): depths 2, 4, 7, 9, 12, 14, 17, 19, 22, 24, 27, 29, … — forever,
// so deep runs keep drafting until the pool is maxed (drawBoons returns [] then
// and the caller falls through to the breather). Where a boon depth lands on a
// curse depth, BOTH happen: the run resolves the curse, then hands off to the
// boon draft (descend sets both; applyCurse routes to 'boon' when one is set).
export const BOON_DEPTHS = [2, 4, 7, 9, 12, 14, 17, 19, 22, 24]  // illustrative early list; isBoonDepth is the source of truth

/** Is `depth` a boon draft? A ~2.5-depth cadence via a period-5 pattern, so
 *  deep runs keep drafting (until the boon pool is maxed). */
export function isBoonDepth(depth: number, frequencyMult = 1): boolean {
  if (depth < 2) return false
  const m = (depth - 2) % 5
  const onSchedule = m === 0 || m === 2
  if (!onSchedule) return false
  // Scarce Powder II (a signed Term): drafts come LESS often. Drop the second
  // beat of each period so the cadence halves cleanly rather than randomly.
  if (frequencyMult < 1 && m === 2) return false
  return true
}

/** A single draft choice: a specific TIER of a boon family. The offered tier is
 *  one above whatever the player already holds in that family. */
export interface BoonOffer {
  id: string
  name: string
  flavor: string
  rarity: BoonRarity
  tier: number       // 1..3
  desc: string
  detail: string
  effect: TideEffect
  /** True when this offer upgrades a boon the player already owns (tier > 1). */
  upgrade: boolean
}

/** Offer up to `n` distinct boons to draft. For each family the offer is the
 *  NEXT tier the player can take (tier 1 if they hold none, else owned+1);
 *  families already at max tier are excluded. Picks are RARITY-WEIGHTED, so
 *  Legendary/Rare boons surface far less often than Commons. No infinite
 *  single-boon stacking. */
export function drawBoons(n: number, owned: Record<string, number> = {}, luckMult = 1, commonSkew = 0, variant: GauntletVariant = 'davy', banned: Iterable<string> = []): BoonOffer[] {
  // Blacklist (Don's Locker): families the player banished this run never surface
  // again. Also used for single-slot replacement (pass the other shown ids too).
  const ban = banned instanceof Set ? banned : new Set(banned)
  const avail = GAUNTLET_BOONS
    .filter(fam => inGauntletPool(fam.gauntlet, variant) && !ban.has(fam.id))
    .map(fam => ({ fam, next: (owned[fam.id] ?? 0) + 1 }))
    .filter(x => x.next <= x.fam.tiers.length)
  // Diviner's Charm (luckMult > 1) scales up the draft weight of the non-Common
  // rarities, so Rare/Legendary boons surface more often without changing which
  // families exist. luckMult = 1 leaves the base odds untouched.
  // Barren Tides (a signed Term, commonSkew > 0) does the reverse: it crushes
  // the Rare/Legendary weight so the draft skews to Commons.
  const weightFor = (fam: GauntletBoon) => {
    const r = boonRarity(fam)
    if (r === 'common') return BOON_RARITY_META[r].weight
    return BOON_RARITY_META[r].weight * luckMult * (1 - Math.max(0, Math.min(1, commonSkew)))
  }
  const out: BoonOffer[] = []
  for (let i = 0; i < n && avail.length > 0; i++) {
    const totalW = avail.reduce((a, x) => a + weightFor(x.fam), 0)
    let r = Math.random() * totalW
    let idx = 0
    for (; idx < avail.length - 1; idx++) {
      r -= weightFor(avail[idx].fam)
      if (r <= 0) break
    }
    const { fam, next } = avail.splice(idx, 1)[0]
    const t = fam.tiers[next - 1]
    out.push({ id: fam.id, name: fam.name, flavor: fam.flavor, rarity: boonRarity(fam), tier: next, desc: t.desc, detail: t.detail, effect: t.effect, upgrade: next > 1 })
  }
  return out
}

/** Blood Oath (Don's Locker): pick one boon to seed a run with at tier 1. Draws
 *  from the variant's Common/Rare pool only — never a free Legendary (too swingy
 *  a gift) and never a Mega-gated boon (dead without the augment). Returns a
 *  family id, or null if the pool is somehow empty. Kept deterministic-free (uses
 *  Math.random) since it only runs once at run start, host-side. */
export function pickBloodOathBoon(variant: GauntletVariant = 'davy'): string | null {
  const MEGA_GATED = new Set(['manowars_wrath'])
  const pool = GAUNTLET_BOONS.filter(fam =>
    inGauntletPool(fam.gauntlet, variant) && boonRarity(fam) !== 'legendary' && !MEGA_GATED.has(fam.id))
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)].id
}

/** Resolve the active TideEffect for each boon the player currently holds —
 *  the HIGHEST tier only, since a higher tier replaces the lower. Feeds the
 *  combat effect pipeline. */
export function boonEffects(owned: Record<string, number>): TideEffect[] {
  const out: TideEffect[] = []
  for (const fam of GAUNTLET_BOONS) {
    const tier = owned[fam.id]
    if (tier && tier >= 1) out.push(fam.tiers[Math.min(tier, fam.tiers.length) - 1].effect)
  }
  return out
}

/** Roman numeral for a boon tier (1→I, 2→II, 3→III). '' for 0/invalid. */
export function boonTierLabel(tier: number): string {
  return ['', 'I', 'II', 'III'][tier] ?? ''
}

/** The run's live max-HP MULTIPLIER from the HP-scaling boons (Reinforced /
 *  Deep / Salvage Hull), given the current depth + hulls sunk. Max HP is owned
 *  by the Gauntlet host, so it reads this off the active effect list and folds
 *  it onto the base ceiling. 1.0 when no HP boon is held. */
export function hpBoonMult(effects: TideEffect[], depth: number, kills: number): number {
  let mult = 1
  for (const e of effects) {
    if (e.kind === 'maxHpMult')            mult *= e.mult
    else if (e.kind === 'maxHpPerDepth')   mult *= 1 + Math.min(e.max, e.perDepth * Math.max(0, depth))
    else if (e.kind === 'maxHpPerKill')    mult *= 1 + Math.min(e.max, e.perKill * Math.max(0, kills))
  }
  return mult
}

// ── Confluences — boon SYNERGIES ──────────────────────────────────────────────
// Hold two specific boon families (each at/above a min tier) and a bonus effect
// unlocks for free, on top of the boons themselves. The reward for committing to
// a theme instead of grabbing the highest number — discovered, not drafted, and
// announced with a banner the moment the second piece lands. Their effects ride
// the same TideEffect pipeline as boons/curses (see confluenceEffects).
// A confluence unlocks the moment you hold BOTH required boons (at tier 1), and
// then SCALES: its level = the lower of the two boons' tiers (so deepening the
// pair deepens the synergy). Each level carries its own desc + effects, mirroring
// how boons tier. It's never drafted separately — you upgrade it by upgrading its
// two halves. The effects stack ON TOP of the boons (additive, not a replacement).
export interface ConfluenceLevel { desc: string; effects: TideEffect[] }
export interface Confluence {
  id: string
  name: string
  /** Which gauntlet draws it. Omitted = both (the recycled Davy pool). */
  gauntlet?: GauntletTag
  /** The two families that must BOTH be held (tier 1+ to unlock). */
  requires: { boonId: string }[]
  /** One-line flavor. */
  flavor: string
  /** Plain-English explanation of the MECHANIC (no numbers — the per-level
   *  `desc` carries those): what triggers it, what happens, any cap/reset.
   *  Surfaced in the detail popup + codex so the one-line desc isn't the only
   *  explanation a new player ever sees. */
  detail: string
  /** Effects + summary per confluence level (1..3), index = level - 1. */
  levels: ConfluenceLevel[]
  /** Optional crest art (transparent PNG). Falls back to the hex spark crest. */
  image?: string | null
}

export const CONFLUENCES: Confluence[] = [
  {
    id: 'thermal_shock',
    image: '/gauntlet/synergies/thermal_shock.png',
    name: 'Thermal Shock',
    requires: [{ boonId: 'permafrost' }, { boonId: 'wildfire' }],
    flavor: 'Ice in the seams, fire on the deck. The hull cracks where the two meet.',
    detail: 'When an enemy is frozen and on fire at the same time, your next hit shatters the ice — dealing bonus damage on top of the hit (a percentage of that hit). The shatter ends the freeze.',
    levels: [
      { desc: 'Frozen + burning hulls shatter for +50% bonus damage', effects: [{ kind: 'thermalShock', burstMult: 0.50 }] },
      { desc: 'Frozen + burning hulls shatter for +70% bonus damage', effects: [{ kind: 'thermalShock', burstMult: 0.70 }] },
      { desc: 'Frozen + burning hulls shatter for +95% bonus damage', effects: [{ kind: 'thermalShock', burstMult: 0.95 }] },
    ],
  },
  {
    id: 'coup_de_grace',
    image: '/gauntlet/synergies/coup_de_grace.png',
    name: 'Coup de Grâce',
    requires: [{ boonId: 'executioner' }, { boonId: 'cold_fury' }],
    flavor: 'You know the killing mark, and when the shot rings true you find it every time.',
    detail: 'Your critical hits deal extra damage, and any critical hit that leaves the enemy at low HP sinks it on the spot — a much wider finishing mark than Executioner alone.',
    levels: [
      { desc: '+12% crit damage; a crit sinks hulls below 12% HP', effects: [{ kind: 'critDmgMult', mult: 1.12 }, { kind: 'critExecute', pct: 0.12 }] },
      { desc: '+18% crit damage; a crit sinks hulls below 16% HP', effects: [{ kind: 'critDmgMult', mult: 1.18 }, { kind: 'critExecute', pct: 0.16 }] },
      { desc: '+25% crit damage; a crit sinks hulls below 20% HP', effects: [{ kind: 'critDmgMult', mult: 1.25 }, { kind: 'critExecute', pct: 0.20 }] },
    ],
  },
  {
    id: 'hull_render',
    image: '/gauntlet/synergies/hull_render.png',
    name: 'Hull Render',
    requires: [{ boonId: 'broadside_mastery' }, { boonId: 'grapeshot' }],
    flavor: 'Every gun on the rail, again and again, until the seams give. The deep loves a drummer.',
    detail: 'Your Volley (the 3-cannonball heavy shot) hits harder, and every Volley you land in a fight makes the next one hit harder still. The ramp resets when the fight ends.',
    levels: [
      { desc: '+12% Volley damage, and each Volley adds +12% more this fight', effects: [{ kind: 'volleyDmgMult', mult: 1.12 }, { kind: 'volleyRamp', perVolley: 0.12 }] },
      { desc: '+18% Volley damage, and each Volley adds +15% more this fight', effects: [{ kind: 'volleyDmgMult', mult: 1.18 }, { kind: 'volleyRamp', perVolley: 0.15 }] },
      { desc: '+25% Volley damage, and each Volley adds +18% more this fight', effects: [{ kind: 'volleyDmgMult', mult: 1.25 }, { kind: 'volleyRamp', perVolley: 0.18 }] },
    ],
  },
  {
    id: 'reapers_tithe',
    image: '/gauntlet/synergies/reapers_tithe.png',
    name: "Reaper's Tithe",
    requires: [{ boonId: 'executioner' }, { boonId: 'leviathans_hunger' }],
    flavor: 'Every hull you send down, the deep tithes back to you. Death feeds the killer.',
    detail: 'Every enemy you sink heals you for a slice of ITS max HP — bigger ships pay a bigger tithe. The heal is capped at 15% of your own max HP per kill, so deep-run giants can’t refill your whole bar.',
    levels: [
      { desc: 'Sinking a hull heals you 12% of its max HP (up to 15% of yours)', effects: [{ kind: 'executeHeal', pctMaxHp: 0.12 }] },
      { desc: 'Sinking a hull heals you 16% of its max HP (up to 15% of yours)', effects: [{ kind: 'executeHeal', pctMaxHp: 0.16 }] },
      { desc: 'Sinking a hull heals you 22% of its max HP (up to 15% of yours)', effects: [{ kind: 'executeHeal', pctMaxHp: 0.22 }] },
    ],
  },
  {
    id: 'feed_the_fire',
    image: '/gauntlet/synergies/feed_the_fire.png',
    name: 'Feed the Fire',
    requires: [{ boonId: 'wildfire' }, { boonId: 'leviathans_hunger' }],
    flavor: 'The flames you set drink from the enemy and pour it into your hull.',
    detail: 'While an enemy burns, every burn tick also heals you — a percentage of the damage that tick dealt. Capped at 20% of your max HP per tick. Keep the fire going and the fire keeps you afloat.',
    levels: [
      { desc: 'Burn damage also heals you 65% of each tick', effects: [{ kind: 'burnTickHeal', pctTick: 0.65 }] },
      { desc: 'Burn damage also heals you 95% of each tick', effects: [{ kind: 'burnTickHeal', pctTick: 0.95 }] },
      { desc: 'Burn damage also heals you 130% of each tick', effects: [{ kind: 'burnTickHeal', pctTick: 1.30 }] },
    ],
  },
  {
    id: 'untouchable', image: '/gauntlet/synergies/untouchable.png',   // legacy id; renamed Weather Gauge in the speed split so
                         // Following Sea's synergy pays off in Initiative, not dodge
    name: 'Weather Gauge',
    requires: [{ boonId: 'following_sea' }, { boonId: 'ghostward' }],
    flavor: 'Hold the wind and you hold the fight. You choose the moment, and the first broadside is yours.',
    detail: 'You seize the opening far more often, and when you take the first shot, there is a chance to loose a second broadside before the enemy can answer.',
    levels: [
      { desc: 'Take the opening +25%; opening shot 20% to strike twice', effects: [{ kind: 'firstStrikeChance', chance: 0.25 }, { kind: 'doubleStrikeOnFirst', chance: 0.20 }] },
      { desc: 'Take the opening +35%; opening shot 30% to strike twice', effects: [{ kind: 'firstStrikeChance', chance: 0.35 }, { kind: 'doubleStrikeOnFirst', chance: 0.30 }] },
      { desc: 'Take the opening +50%; opening shot 40% to strike twice', effects: [{ kind: 'firstStrikeChance', chance: 0.50 }, { kind: 'doubleStrikeOnFirst', chance: 0.40 }] },
    ],
  },
  {
    id: 'iron_tempest',
    image: '/gauntlet/synergies/iron_tempest.png',
    name: 'Iron Tempest',
    requires: [{ boonId: 'spiteful_wake' }, { boonId: 'ironhide' }],
    flavor: 'Plate over plate, and every blow that breaks on it is flung back twofold.',
    detail: 'Multiplies Spiteful Wake: the damage you throw back when an enemy hits you is boosted by this factor. With Ironhide shrinking what you take, you become a wall that bites.',
    levels: [
      { desc: 'Spiteful Wake’s thrown-back damage hits 1.8× harder', effects: [{ kind: 'retaliateBoost', mult: 1.8 }] },
      { desc: 'Spiteful Wake’s thrown-back damage hits 2.5× harder', effects: [{ kind: 'retaliateBoost', mult: 2.5 }] },
      { desc: 'Spiteful Wake’s thrown-back damage hits 3.2× harder', effects: [{ kind: 'retaliateBoost', mult: 3.2 }] },
    ],
  },
  {
    id: 'broadside_duel',
    image: '/gauntlet/synergies/broadside_duel.png',
    name: 'Broadside Duel',
    requires: [{ boonId: 'cannonade' }, { boonId: 'counter_battery' }],
    flavor: 'Trade broadsides and win the exchange every time — their shot in the water, and the guns already coming back to bear.',
    detail: 'Boosts Counter-Battery: your chance to knock an enemy shot out of the air goes up, and every shot you DO knock down feeds Cannonade’s crit streak (and can hand you back a cannonball). Winning the exchange keeps your rhythm even on a non-crit.',
    levels: [
      { desc: '+8% counter chance; a counter adds a Cannonade streak stack', effects: [{ kind: 'counterBonus', refund: 0, bonusStack: 1, chanceBonus: 0.08 }] },
      { desc: '+15% counter chance; a counter adds a stack and a free cannonball', effects: [{ kind: 'counterBonus', refund: 1, bonusStack: 1, chanceBonus: 0.15 }] },
      { desc: '+22% counter chance; a counter adds 2 stacks and a free cannonball', effects: [{ kind: 'counterBonus', refund: 1, bonusStack: 2, chanceBonus: 0.22 }] },
    ],
  },
  {
    id: 'return_to_sender',
    image: '/gauntlet/synergies/return_to_sender.png',
    name: 'Return to Sender',
    requires: [{ boonId: 'counter_battery' }, { boonId: 'spiteful_wake' }],
    flavor: "Their own shell, caught mid-air and flung right back down their throat.",
    detail: 'When Counter-Battery knocks an enemy shot out of the air, the shell is flung back at them — dealing a percentage of the damage it WOULD have done to you. You take nothing; they eat their own broadside.',
    levels: [
      { desc: 'A countered shot is flung back for 60% of its damage', effects: [{ kind: 'counterReflect', pct: 0.60 }] },
      { desc: 'A countered shot is flung back for 85% of its damage', effects: [{ kind: 'counterReflect', pct: 0.85 }] },
      { desc: 'A countered shot is flung back for 120% of its damage', effects: [{ kind: 'counterReflect', pct: 1.20 }] },
    ],
  },
  {
    id: 'feeding_frenzy',
    image: '/gauntlet/synergies/feeding_frenzy.png',
    name: 'Feeding Frenzy',
    requires: [{ boonId: 'rising_tide' }, { boonId: 'leviathans_hunger' }],
    flavor: 'The swell of the slain makes the deep drink deeper — every hull in your wake feeds the next wound.',
    detail: 'Every enemy you sink this run makes Leviathan’s Hunger drink deeper — the share of your damage that comes back as healing grows with each kill, up to the cap. It never resets during the run.',
    levels: [
      { desc: 'Healing from damage grows +1.5% per hull sunk (max +18%)', effects: [{ kind: 'lifestealKillScale', perKill: 0.015, max: 0.18 }] },
      { desc: 'Healing from damage grows +2% per hull sunk (max +24%)', effects: [{ kind: 'lifestealKillScale', perKill: 0.02, max: 0.24 }] },
      { desc: 'Healing from damage grows +2.5% per hull sunk (max +30%)', effects: [{ kind: 'lifestealKillScale', perKill: 0.025, max: 0.30 }] },
    ],
  },
  {
    id: 'bullseye',
    image: '/gauntlet/synergies/bullseye.png',
    name: 'Bullseye',
    requires: [{ boonId: 'dead_eye' }, { boonId: 'wide_sights' }],
    flavor: 'Wide sights and a killer’s eye. The gold band stops being luck and starts being a habit.',
    detail: 'Two ways to crit more, stacked: the gold crit band on your aim bar gets wider (easier to land a crit on purpose), AND normal hits get an extra chance to upgrade into crits anyway.',
    levels: [
      { desc: 'Gold band 10% wider; hits +10% more likely to become crits', effects: [{ kind: 'critChanceBonus', chance: 0.10 }, { kind: 'critZoneScale', mult: 1.10 }] },
      { desc: 'Gold band 16% wider; hits +16% more likely to become crits', effects: [{ kind: 'critChanceBonus', chance: 0.16 }, { kind: 'critZoneScale', mult: 1.16 }] },
      { desc: 'Gold band 24% wider; hits +24% more likely to become crits', effects: [{ kind: 'critChanceBonus', chance: 0.24 }, { kind: 'critZoneScale', mult: 1.24 }] },
    ],
  },
  {
    id: 'deep_wake',
    image: '/gauntlet/synergies/deep_wake.png',
    name: 'Deep Wake',
    requires: [{ boonId: 'rising_tide' }, { boonId: 'abyssal_bounty' }],
    flavor: 'The hulls in your wake and the weight of the deep pull in the same direction — down, and harder.',
    // Reinforces the two momentum boons rather than stacking a separate
    // multiplier: its per-kill/per-depth ADD into Rising Tide's and Abyssal
    // Bounty's own scaling (RaidCombat sums same-axis killStack / depthScale and
    // applies each axis once), lifting a shared cap. So your momentum climbs
    // steeper and further — but it can't compound into a runaway multiplier.
    detail: 'Feeds both momentum boons at once: Rising Tide gains more damage per hull you sink, Abyssal Bounty gains more per depth you reach, and both of their caps are raised. Your snowball rolls faster and further.',
    levels: [
      { desc: 'Rising Tide +1% more per kill, Abyssal Bounty +0.5% more per depth; caps +5%', effects: [{ kind: 'killStackDamage', perKill: 0.01, maxBonus: 0.05 }, { kind: 'depthScaleDamage', perDepth: 0.005, maxBonus: 0.05 }] },
      { desc: 'Rising Tide +1.5% more per kill, Abyssal Bounty +0.6% more per depth; caps +8%', effects: [{ kind: 'killStackDamage', perKill: 0.015, maxBonus: 0.08 }, { kind: 'depthScaleDamage', perDepth: 0.006, maxBonus: 0.08 }] },
      { desc: 'Rising Tide +2% more per kill, Abyssal Bounty +0.8% more per depth; caps +10%', effects: [{ kind: 'killStackDamage', perKill: 0.02, maxBonus: 0.10 }, { kind: 'depthScaleDamage', perDepth: 0.008, maxBonus: 0.10 }] },
    ],
  },
  {
    id: 'dreadnought',
    image: '/gauntlet/synergies/dreadnought.png',
    name: 'Dreadnought',
    requires: [{ boonId: 'giant_killer' }, { boonId: 'grapeshot' }],
    flavor: 'The bigger the hull, the more of it to scatter your iron across. Bring the whole broadside.',
    detail: 'Extra damage against BOSSES only, on top of your boons: everything you fire at a boss hits harder, and your Volleys hit harder still. Regular enemies are unaffected.',
    levels: [
      { desc: 'Bosses take +12% from everything, +18% more from Volleys', effects: [{ kind: 'bossDamageMult', mult: 1.12 }, { kind: 'bossVolleyDmgMult', mult: 1.18 }] },
      { desc: 'Bosses take +20% from everything, +30% more from Volleys', effects: [{ kind: 'bossDamageMult', mult: 1.20 }, { kind: 'bossVolleyDmgMult', mult: 1.30 }] },
      { desc: 'Bosses take +30% from everything, +45% more from Volleys', effects: [{ kind: 'bossDamageMult', mult: 1.30 }, { kind: 'bossVolleyDmgMult', mult: 1.45 }] },
    ],
  },
  {
    id: 'last_bastion',
    image: '/gauntlet/synergies/last_bastion.png',
    name: 'Last Bastion',
    requires: [{ boonId: 'stormward' }, { boonId: 'bilge_pump' }],
    flavor: 'A heavier ward, and hands quick on the seams. Nothing gets through that you can’t out-mend.',
    detail: 'You start every fight with a bigger shield (a percentage of your max HP that soaks damage before your hull does) AND heal a little extra at the start of each fight. Both stack on top of Stormward and Bilge Pump.',
    levels: [
      { desc: 'Start each fight with an extra 20%-of-max-HP shield and a +4% heal', effects: [{ kind: 'fightShield', pctMax: 0.20 }, { kind: 'startOfFightHealPct', pctMax: 0.04 }] },
      { desc: 'Start each fight with an extra 28%-of-max-HP shield and a +7% heal', effects: [{ kind: 'fightShield', pctMax: 0.28 }, { kind: 'startOfFightHealPct', pctMax: 0.07 }] },
      { desc: 'Start each fight with an extra 36%-of-max-HP shield and a +10% heal', effects: [{ kind: 'fightShield', pctMax: 0.36 }, { kind: 'startOfFightHealPct', pctMax: 0.10 }] },
    ],
  },
  {
    id: 'powder_keg',
    image: '/gauntlet/synergies/powder_keg.png',
    name: 'Powder Keg',
    requires: [{ boonId: 'press_the_powder' }, { boonId: 'powder_hoard' }],
    flavor: 'A crew that never stops loading and never wastes a shell. The magazine is always full and always spilling over.',
    detail: 'Ammo, everywhere: you start every fight with extra cannonballs already loaded, and each Reload has a chance to load bonus cannonball(s) on top of the usual one.',
    levels: [
      { desc: 'Start fights +1 loaded; Reloads load a bonus cannonball 15% of the time', effects: [{ kind: 'reloadProc', chance: 0.15, bonusCharges: 1 }, { kind: 'startCharges', n: 1, scope: 'allRemaining' }] },
      { desc: 'Start fights +2 loaded; Reloads load a bonus cannonball 25% of the time', effects: [{ kind: 'reloadProc', chance: 0.25, bonusCharges: 1 }, { kind: 'startCharges', n: 2, scope: 'allRemaining' }] },
      { desc: 'Start fights +2 loaded; Reloads load 2 bonus cannonballs 35% of the time', effects: [{ kind: 'reloadProc', chance: 0.35, bonusCharges: 2 }, { kind: 'startCharges', n: 2, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'pressure_hull',
    image: '/gauntlet/synergies/pressure_hull.png',
    name: 'Pressure Hull',
    requires: [{ boonId: 'abyssal_bounty' }, { boonId: 'ironhide' }],
    flavor: 'The same deep that loads your guns crushes down on theirs. The lower you go, the less they land.',
    detail: 'You take less damage the deeper you are — the reduction grows with every depth you reach, up to the cap. Stacks on top of Ironhide, so a deep run gets very hard to hurt.',
    levels: [
      { desc: 'Take less damage per depth reached (up to -12%)', effects: [{ kind: 'depthScaleMitigation', perDepth: 0.006, max: 0.12 }] },
      { desc: 'Take less damage per depth reached (up to -20%)', effects: [{ kind: 'depthScaleMitigation', perDepth: 0.009, max: 0.20 }] },
      { desc: 'Take less damage per depth reached (up to -28%)', effects: [{ kind: 'depthScaleMitigation', perDepth: 0.012, max: 0.28 }] },
    ],
  },
  {
    id: 'field_repairs',
    image: '/gauntlet/synergies/field_repairs.png',
    name: 'Field Repairs',
    requires: [{ boonId: 'reinforced_hull' }, { boonId: 'bilge_pump' }],
    flavor: 'A bigger hull and a crew who patch it like the deep is at their heels — and the seams hold water above the waterline.',
    detail: 'Your repair kits heal more, and healing can OVERFILL your HP bar — pushing you above max into a temporary buffer that soaks damage. The overfill lasts for the current fight only.',
    levels: [
      { desc: 'Repair kits heal +30%; heals can overfill you to 115% HP this fight', effects: [{ kind: 'repairHealMult', mult: 1.30 }, { kind: 'overhealPct', pct: 0.15 }] },
      { desc: 'Repair kits heal +45%; heals can overfill you to 125% HP this fight', effects: [{ kind: 'repairHealMult', mult: 1.45 }, { kind: 'overhealPct', pct: 0.25 }] },
      { desc: 'Repair kits heal +60%; heals can overfill you to 140% HP this fight', effects: [{ kind: 'repairHealMult', mult: 1.60 }, { kind: 'overhealPct', pct: 0.40 }] },
    ],
  },
  {
    id: 'engorge',
    image: '/gauntlet/synergies/engorge.png',
    name: 'Engorge',
    requires: [{ boonId: 'salvage_hull' }, { boonId: 'leviathans_hunger' }],
    flavor: 'The deep drinks through every wound you open, and your hull swells past its own lines with the surfeit.',
    detail: 'The healing from Leviathan’s Hunger can OVERFILL your HP bar — damage you deal at full health banks a temporary buffer above max that soaks hits. The overfill lasts for the current fight only.',
    levels: [
      { desc: 'Healing from damage can overfill you to 118% HP this fight', effects: [{ kind: 'overhealPct', pct: 0.18 }] },
      { desc: 'Healing from damage can overfill you to 130% HP this fight', effects: [{ kind: 'overhealPct', pct: 0.30 }] },
      { desc: 'Healing from damage can overfill you to 145% HP this fight', effects: [{ kind: 'overhealPct', pct: 0.45 }] },
    ],
  },
  {
    id: 'deep_fortress',
    image: '/gauntlet/synergies/deep_fortress.png',
    name: 'Deep Fortress',
    requires: [{ boonId: 'deep_hull' }, { boonId: 'ironhide' }],
    flavor: 'The deeper hull and the doubled plate become one thing: a fortress the drowned break themselves on.',
    // fightShield is % of MAX HP — and Deep Hull grows max HP — so the ward
    // gets bigger the deeper you fall, without any new plumbing.
    detail: 'You start every fight with a shield that soaks damage before your HP does. It’s a percentage of your max HP — and since Deep Hull GROWS your max HP as you descend, the shield grows with it.',
    levels: [
      { desc: 'Start each fight with a shield worth 8% of your max HP', effects: [{ kind: 'fightShield', pctMax: 0.08 }] },
      { desc: 'Start each fight with a shield worth 12% of your max HP', effects: [{ kind: 'fightShield', pctMax: 0.12 }] },
      { desc: 'Start each fight with a shield worth 16% of your max HP', effects: [{ kind: 'fightShield', pctMax: 0.16 }] },
    ],
  },

  // ── Don's Gauntlet confluences (gauntlet: 'don' — fuse the ghost-fleet boons;
  //    each needs a 'don'-only half, so they can never surface in Davy's) ───────
  {
    id: 'cripple', image: '/gauntlet/synergies/cripple.png', name: 'Cripple', gauntlet: 'don',
    requires: [{ boonId: 'rattling_shot' }, { boonId: 'chainshot' }],
    flavor: 'Feeble and snared at once. A hull that can neither hit nor run is just target practice.',
    detail: 'With both on-hit hexes running, your hits pile the control on — extra chances to Feeble AND Slow the enemy every shot — and you deal more damage while it flails.',
    levels: [
      { desc: 'Extra Feeble + Slow on hit; +10% damage', effects: [{ kind: 'statusOnHit', status: 'feeble', chance: 0.35, magnitude: 0.15, turns: 2 }, { kind: 'statusOnHit', status: 'slowed', chance: 0.35, magnitude: 2, turns: 2 }, { kind: 'damageMult', mult: 1.10 }] },
      { desc: 'Bigger Feeble + Slow on hit; +16% damage', effects: [{ kind: 'statusOnHit', status: 'feeble', chance: 0.45, magnitude: 0.20, turns: 3 }, { kind: 'statusOnHit', status: 'slowed', chance: 0.45, magnitude: 2, turns: 3 }, { kind: 'damageMult', mult: 1.16 }] },
      { desc: 'Heavy Feeble + Slow on hit; +24% damage', effects: [{ kind: 'statusOnHit', status: 'feeble', chance: 0.55, magnitude: 0.25, turns: 3 }, { kind: 'statusOnHit', status: 'slowed', chance: 0.55, magnitude: 3, turns: 3 }, { kind: 'damageMult', mult: 1.24 }] },
    ],
  },
  {
    id: 'sapping_fire', image: '/gauntlet/synergies/sapping_fire.png', name: 'Sapping Fire', gauntlet: 'don',
    requires: [{ boonId: 'rattling_shot' }, { boonId: 'wildfire' }],
    flavor: 'Fire in the timbers and the fight bled out of them. They burn, and they buckle.',
    detail: 'A burning hull is a broken one: your hits carry an extra Feeble, and everything you fire lands harder while the fire eats them.',
    levels: [
      { desc: 'Extra Feeble on hit; +10% damage', effects: [{ kind: 'statusOnHit', status: 'feeble', chance: 0.40, magnitude: 0.18, turns: 2 }, { kind: 'damageMult', mult: 1.10 }] },
      { desc: 'Bigger Feeble on hit; +16% damage', effects: [{ kind: 'statusOnHit', status: 'feeble', chance: 0.50, magnitude: 0.24, turns: 3 }, { kind: 'damageMult', mult: 1.16 }] },
      { desc: 'Heavy Feeble on hit; +24% damage', effects: [{ kind: 'statusOnHit', status: 'feeble', chance: 0.60, magnitude: 0.30, turns: 3 }, { kind: 'damageMult', mult: 1.24 }] },
    ],
  },
  {
    id: 'hobble', image: '/gauntlet/synergies/hobble.png', name: 'Hobble', gauntlet: 'don',
    requires: [{ boonId: 'chainshot' }, { boonId: 'following_sea' }],
    flavor: 'Snare their rigging, ride their wake. They lumber; you dance.',
    detail: 'A slowed hull can’t keep the pace: your hits Slow harder, and when you take the opening there is a chance to strike twice before they answer.',
    levels: [
      { desc: 'Extra Slow on hit; opening shot 15% to strike twice', effects: [{ kind: 'statusOnHit', status: 'slowed', chance: 0.40, magnitude: 2, turns: 2 }, { kind: 'doubleStrikeOnFirst', chance: 0.15 }] },
      { desc: 'Bigger Slow on hit; opening shot 22% to strike twice', effects: [{ kind: 'statusOnHit', status: 'slowed', chance: 0.50, magnitude: 3, turns: 3 }, { kind: 'doubleStrikeOnFirst', chance: 0.22 }] },
      { desc: 'Heavy Slow on hit; opening shot 30% to strike twice', effects: [{ kind: 'statusOnHit', status: 'slowed', chance: 0.60, magnitude: 3, turns: 3 }, { kind: 'doubleStrikeOnFirst', chance: 0.30 }] },
    ],
  },
  {
    id: 'coring_shot', image: '/gauntlet/synergies/coring_shot.png', name: 'Coring Shot', gauntlet: 'don',
    requires: [{ boonId: 'armor_piercing' }, { boonId: 'cold_fury' }],
    flavor: 'A cold, hard round that finds the core through any ward and cracks it wide.',
    detail: 'Barriers stop meaning anything: nearly all of your shot skips the shield straight to the hull, and your critical hits land far harder.',
    levels: [
      { desc: 'Shots ignore 85% of barriers; +18% crit damage', effects: [{ kind: 'shieldPierce', pct: 0.85 }, { kind: 'critDmgMult', mult: 1.18 }] },
      { desc: 'Shots ignore 92% of barriers; +26% crit damage', effects: [{ kind: 'shieldPierce', pct: 0.92 }, { kind: 'critDmgMult', mult: 1.26 }] },
      { desc: 'Shots ignore barriers entirely; +36% crit damage', effects: [{ kind: 'shieldPierce', pct: 1 }, { kind: 'critDmgMult', mult: 1.36 }] },
    ],
  },
  {
    id: 'clear_skies', image: '/gauntlet/synergies/clear_skies.png', name: 'Clear Skies', gauntlet: 'don',
    requires: [{ boonId: 'steady_sights' }, { boonId: 'wide_sights' }],
    flavor: 'No fog, no lie, and a target you could hit blindfolded. So you don’t miss.',
    detail: 'Your glass is spotless AND your gold band is huge: nothing clouds your aim, and the perfect-shot window widens so crits come easy.',
    levels: [
      { desc: 'Immune to aim fog/decoys; gold crit band +16% wider', effects: [{ kind: 'aimClarity', reduce: 1 }, { kind: 'critZoneScale', mult: 1.16 }] },
      { desc: 'Immune to aim fog/decoys; gold band +26% wider', effects: [{ kind: 'aimClarity', reduce: 1 }, { kind: 'critZoneScale', mult: 1.26 }] },
      { desc: 'Immune to aim fog/decoys; gold band +38% wider', effects: [{ kind: 'aimClarity', reduce: 1 }, { kind: 'critZoneScale', mult: 1.38 }] },
    ],
  },
  {
    id: 'riposte_wall', image: '/gauntlet/synergies/riposte_wall.png', name: 'Riposte Wall', gauntlet: 'don',
    requires: [{ boonId: 'cutlass_guard' }, { boonId: 'spiteful_wake' }],
    flavor: 'Turn the blow, and the sea turns it back twice as hard. Nothing that swings at you leaves whole.',
    detail: 'Parry AND thorns, reinforcing each other: you parry more often and reflect harder, and every hit you DO eat is flung back with more spite.',
    levels: [
      { desc: '35% parry / 65% reflect; thrown-back damage +1.6x', effects: [{ kind: 'parryChance', chance: 0.35, reflectPct: 0.65 }, { kind: 'retaliateBoost', mult: 1.6 }] },
      { desc: '45% parry / 80% reflect; thrown-back damage +2.2x', effects: [{ kind: 'parryChance', chance: 0.45, reflectPct: 0.80 }, { kind: 'retaliateBoost', mult: 2.2 }] },
      { desc: '55% parry / 100% reflect; thrown-back damage +3x', effects: [{ kind: 'parryChance', chance: 0.55, reflectPct: 1.0 }, { kind: 'retaliateBoost', mult: 3.0 }] },
    ],
  },
  {
    id: 'prize_crew', image: '/gauntlet/synergies/prize_crew.png', name: 'Prize Crew', gauntlet: 'don',
    requires: [{ boonId: 'press_gang' }, { boonId: 'powder_hoard' }],
    flavor: 'What you take, you keep, and what you keep carries over. Their magazine becomes yours.',
    detail: 'A theft engine: you steal enemy cannonballs far more often, and you open every fight already loaded on top of Powder Hoard’s carryover.',
    levels: [
      { desc: '+20% steal chance; start each fight +1 loaded', effects: [{ kind: 'stealCharge', chance: 0.20 }, { kind: 'startCharges', n: 1, scope: 'allRemaining' }] },
      { desc: '+35% steal chance; start each fight +2 loaded', effects: [{ kind: 'stealCharge', chance: 0.35 }, { kind: 'startCharges', n: 2, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'deep_terror', image: '/gauntlet/synergies/deep_terror.png', name: 'Deep Terror', gauntlet: 'don',
    requires: [{ boonId: 'krakens_grip' }, { boonId: 'permafrost' }],
    flavor: 'Frozen solid and seized by the deep. Some hulls never get another turn.',
    detail: 'Total lockdown: your hits stun far more often on top of Permafrost’s freezes, and a held hull takes extra damage while it can’t act.',
    levels: [
      { desc: '+15% stun chance on hit; +14% damage', effects: [{ kind: 'stunOnHit', chance: 0.15, turns: 1 }, { kind: 'damageMult', mult: 1.14 }] },
      { desc: '+22% stun chance (2 turns); +22% damage', effects: [{ kind: 'stunOnHit', chance: 0.22, turns: 2 }, { kind: 'damageMult', mult: 1.22 }] },
    ],
  },
  {
    id: 'loaded_dice', image: '/gauntlet/synergies/loaded_dice.png', name: 'Loaded Dice', gauntlet: 'don',
    requires: [{ boonId: 'dons_favor' }, { boonId: 'loaded_for_bear' }],
    flavor: 'The Don’s luck and a gun that can’t miss the mark. The house always wins now.',
    detail: 'Every fight opens with a STRONGER random blessing, and your guaranteed-crit rhythm speeds up to every other shot.',
    levels: [
      { desc: 'Stronger fight blessing; every 2nd shot is a guaranteed crit', effects: [{ kind: 'randomFightBuff', magnitude: 0.35 }, { kind: 'guaranteedCritEvery', n: 2 }] },
      { desc: 'Even stronger blessing; every 2nd shot crits', effects: [{ kind: 'randomFightBuff', magnitude: 0.50 }, { kind: 'guaranteedCritEvery', n: 2 }] },
    ],
  },
  {
    id: 'running_broadside', image: '/gauntlet/synergies/running_broadside.png', name: 'Running Broadside', gauntlet: 'don',
    requires: [{ boonId: 'grapeshot' }, { boonId: 'powder_hoard' }],
    flavor: 'Heavy shot and a deep rack. Your gunners learn to loose the big volley on a shorter count.',
    detail: 'Your Volley costs one fewer cannonball — 2 instead of 3 — so you can loose it more often. On top of that, every Volley still hits harder (Grapeshot carries over).',
    levels: [
      { desc: 'Volley costs 2 charges instead of 3; +10% Volley damage', effects: [{ kind: 'volleyCostReduction', n: 1 }, { kind: 'volleyDmgMult', mult: 1.10 }] },
      { desc: 'Volley costs 2; +20% Volley damage', effects: [{ kind: 'volleyCostReduction', n: 1 }, { kind: 'volleyDmgMult', mult: 1.20 }] },
      { desc: 'Volley costs 2; +32% Volley damage', effects: [{ kind: 'volleyCostReduction', n: 1 }, { kind: 'volleyDmgMult', mult: 1.32 }] },
    ],
  },
  {
    id: 'hair_trigger', image: '/gauntlet/synergies/hair_trigger.png', name: 'Hair Trigger', gauntlet: 'don',
    requires: [{ boonId: 'manowars_wrath' }, { boonId: 'press_the_powder' }],
    flavor: 'The big gun and a crew that never stops loading. The last word comes a beat sooner.',
    detail: 'Your Mega — the Man-o-War ultimate — costs one fewer cannonball, 3 instead of 4, so it comes online a full charge sooner. It also hits harder still (Man-o-War’s Wrath carries over). Does nothing without a Mega augment.',
    levels: [
      { desc: 'Mega costs 3 charges instead of 4; +15% Mega damage', effects: [{ kind: 'megaCostReduction', n: 1 }, { kind: 'megaDmgMult', mult: 1.15 }] },
      { desc: 'Mega costs 3; +26% Mega damage', effects: [{ kind: 'megaCostReduction', n: 1 }, { kind: 'megaDmgMult', mult: 1.26 }] },
      { desc: 'Mega costs 3; +40% Mega damage', effects: [{ kind: 'megaCostReduction', n: 1 }, { kind: 'megaDmgMult', mult: 1.40 }] },
    ],
  },
]

/** A confluence's current LEVEL (1..3), or 0 if you don't hold both halves. The
 *  level is the lower of the two boons' tiers, capped to the confluence's range. */
export function confluenceLevel(c: Confluence, owned: Record<string, number>): number {
  const tiers = c.requires.map(r => owned[r.boonId] ?? 0)
  if (tiers.some(t => t < 1)) return 0
  return Math.min(Math.min(...tiers), c.levels.length)
}

/** Confluences currently ONLINE — the player has DRAFTED them (taken) AND still
 *  holds both halves. Opportunity-cost model: holding both halves is not enough;
 *  the confluence must have been taken as a draft card. */
export function activeConfluences(owned: Record<string, number>, taken: string[] = []): Confluence[] {
  const t = new Set(taken)
  return CONFLUENCES.filter(c => t.has(c.id) && confluenceLevel(c, owned) >= 1)
}

/** Confluences you QUALIFY for (hold both halves at tier 1+) but have NOT yet
 *  drafted — the pool eligible to be offered as a draft card. */
export function eligibleConfluences(owned: Record<string, number>, taken: string[] = [], variant: GauntletVariant = 'davy'): Confluence[] {
  const t = new Set(taken)
  return CONFLUENCES.filter(c => inGauntletPool(c.gauntlet, variant) && !t.has(c.id) && confluenceLevel(c, owned) >= 1)
}

/** What a boon offer would DO to your synergies, read BEFORE you pick it.
 *
 *  Two cases, and they're the whole strategy layer:
 *    - 'unlocks' — you hold the other half, so taking this qualifies a synergy
 *      you haven't drafted yet. It doesn't hand it to you (the confluence still
 *      has to be drafted as its own card), but it makes it eligible, and the
 *      pity rule in drawConfluenceOffer then guarantees it gets offered.
 *    - 'deepens' — you've already drafted it and it's online. A confluence's
 *      level is the LOWER of its two halves, so upgrading the weaker half levels
 *      the synergy itself. Invisible until now, which meant nobody knew that
 *      re-taking a half could be worth more than a fresh boon.
 *
 *  Pure read; drives the draft-card chips so a pick is a plan, not a surprise. */
export interface ConfluenceHint {
  c: Confluence
  kind: 'unlocks' | 'deepens'
  /** The level the confluence would sit at after taking this boon. */
  level: number
}
export function confluenceHintsFor(
  offer: { id: string; tier: number },
  owned: Record<string, number>,
  taken: string[] = [],
): ConfluenceHint[] {
  const t = new Set(taken)
  const after = { ...owned, [offer.id]: Math.max(owned[offer.id] ?? 0, offer.tier) }
  const out: ConfluenceHint[] = []
  for (const c of CONFLUENCES) {
    if (!c.requires.some(r => r.boonId === offer.id)) continue
    const before = confluenceLevel(c, owned)
    const next   = confluenceLevel(c, after)
    if (next < 1) continue
    if (!t.has(c.id)) {
      if (before < 1) out.push({ c, kind: 'unlocks', level: next })
    } else if (next > before) {
      out.push({ c, kind: 'deepens', level: next })
    }
  }
  return out
}

/** The player-facing summary for a confluence at a given level (defaults to its
 *  base/level-1 line, e.g. for the codex when not yet held). */
export function confluenceDescAt(c: Confluence, level: number): string {
  const i = Math.max(1, Math.min(level || 1, c.levels.length)) - 1
  return c.levels[i].desc
}

/** A confluence offered as a draft card, in place of a boon (Hades-duo model). */
export interface ConfluenceOffer {
  kind: 'confluence'
  id: string
  name: string
  flavor: string
  /** The level it comes online at right now (min of the two boon tiers). */
  level: number
  desc: string
  /** Plain-English mechanic explainer (Confluence.detail) for the draft card. */
  detail: string
  /** The two boon family display names, for the card subtitle. */
  halves: [string, string]
  /** Set when this offer is a CONVERGENCE (meta-tier). The card is styled as a
   *  convergence and, on pick, routes to convergencesTaken. `halves` then hold
   *  the two confluence names it fuses. Omitted/false = ordinary confluence. */
  isConvergence?: boolean
}

/** Base chance a qualifying confluence is offered on a draft where one exists.
 *  Bumped from the original 0.55 so a growing eligible pool stays accessible. */
export const CONFLUENCE_OFFER_CHANCE = 0.7

/** Roll whether to slot a confluence into this draft. Returns one eligible
 *  (qualified-but-untaken) confluence, or null.
 *
 *  Pity/telegraph: `offered` is the set of confluence ids already SURFACED this
 *  run. A synergy you newly qualify for and have NEVER been offered is GUARANTEED
 *  to appear next draft (and is preferred when picking), so a build you commit to
 *  reliably shows up. Once it's been offered once (taken or not), it reverts to
 *  the base chance — this keeps a large pool from swamping every draft. */
export function drawConfluenceOffer(owned: Record<string, number>, taken: string[] = [], offered: Set<string> = new Set(), offerMult = 1, variant: GauntletVariant = 'davy'): ConfluenceOffer | null {
  // No Communion (a signed Term): offerMult 0 switches synergies off entirely —
  // you can hold both halves and never be offered the confluence.
  if (offerMult <= 0) return null
  const pool = eligibleConfluences(owned, taken, variant)
  if (pool.length === 0) return null
  const fresh = pool.filter(c => !offered.has(c.id))   // never-surfaced yet = pity priority
  // The pity (a never-surfaced synergy is guaranteed) still applies at full
  // offerMult; a reduced offerMult scales it back like any other draw.
  if (fresh.length > 0 && offerMult < 1 && Math.random() >= offerMult) return null
  if (fresh.length === 0 && Math.random() >= CONFLUENCE_OFFER_CHANCE * offerMult) return null
  const chooseFrom = fresh.length > 0 ? fresh : pool
  const c = chooseFrom[Math.floor(Math.random() * chooseFrom.length)]
  const level = confluenceLevel(c, owned)
  const halfName = (id: string) => GAUNTLET_BOONS.find(b => b.id === id)?.name ?? id
  return {
    kind: 'confluence',
    id: c.id, name: c.name, flavor: c.flavor,
    level, desc: confluenceDescAt(c, level), detail: c.detail,
    halves: [halfName(c.requires[0].boonId), halfName(c.requires[1].boonId)],
  }
}

/** Flattened TideEffects from every TAKEN, still-qualified confluence at its
 *  CURRENT level — appended to the boon effects fed into combat. */
export function confluenceEffects(owned: Record<string, number>, taken: string[] = []): TideEffect[] {
  const t = new Set(taken)
  return CONFLUENCES.flatMap(c => {
    if (!t.has(c.id)) return []
    const lvl = confluenceLevel(c, owned)
    return lvl >= 1 ? c.levels[lvl - 1].effects : []
  })
}

// ── Convergences — the meta-synergy tier (Don's Gauntlet) ──────────────────────
// A synergy of synergies. Hold TWO drafted confluences (each online) and a
// Convergence becomes eligible — drafted the same way a confluence is, as a card
// in place of a boon. It's the payoff for a run that commits hard enough to keep
// two whole synergies alive, and it scales with them: a Convergence's level is
// the LOWER of its two confluences' levels. Don's-Gauntlet-only (gauntlet:'don'),
// so Davy's flow never sees one. Effects ride the same TideEffect pipeline and
// use only multiply/sum kinds, so they stack cleanly ON TOP of the confluences
// they build from (never a 'max' kind that a strong confluence would swallow).
export interface ConvergenceLevel { desc: string; effects: TideEffect[] }
export interface Convergence {
  id: string
  name: string
  /** Which gauntlet draws it. Convergences are Don's-only. */
  gauntlet?: GauntletTag
  /** The two confluences that must BOTH be drafted + online to unlock. */
  requires: { confluenceId: string }[]
  flavor: string
  /** Plain-English mechanic explainer for the draft card + codex. */
  detail: string
  /** Effects + summary per level (1..3), index = level - 1. */
  levels: ConvergenceLevel[]
  /** Optional crest art (transparent PNG). Falls back to the hex spark crest. */
  image?: string | null
}

export const CONVERGENCES: Convergence[] = [
  {
    id: 'the_reckoning',
    image: '/gauntlet/synergies/the_reckoning.png',
    name: 'The Reckoning',
    gauntlet: 'don',
    requires: [{ confluenceId: 'coup_de_grace' }, { confluenceId: 'bullseye' }],
    flavor: 'A killer’s eye and a killer’s mark, married. Every clean shot is a verdict.',
    detail: 'Stacks on your two crit synergies: your critical hits deal even more damage, the gold "perfect shot" band widens further, and normal hits gain extra chance to crit. All on top of Coup de Grâce and Bullseye.',
    levels: [
      { desc: '+18% crit damage, gold band +12% wider, +10% crit chance', effects: [{ kind: 'critDmgMult', mult: 1.18 }, { kind: 'critZoneScale', mult: 1.12 }, { kind: 'critChanceBonus', chance: 0.10 }] },
      { desc: '+28% crit damage, gold band +20% wider, +15% crit chance', effects: [{ kind: 'critDmgMult', mult: 1.28 }, { kind: 'critZoneScale', mult: 1.20 }, { kind: 'critChanceBonus', chance: 0.15 }] },
      { desc: '+40% crit damage, gold band +30% wider, +22% crit chance', effects: [{ kind: 'critDmgMult', mult: 1.40 }, { kind: 'critZoneScale', mult: 1.30 }, { kind: 'critChanceBonus', chance: 0.22 }] },
    ],
  },
  {
    id: 'feast_of_the_deep',
    image: '/gauntlet/synergies/feast_of_the_deep.png',
    name: 'Feast of the Deep',
    gauntlet: 'don',
    requires: [{ confluenceId: 'reapers_tithe' }, { confluenceId: 'feeding_frenzy' }],
    flavor: 'Every hull you open, the deep drinks — and it has learned to drink faster than you can bleed.',
    detail: 'Builds on your two life-drain synergies: a flat share of ALL the damage you deal comes back as healing, and every shot lands harder. Stacks on top of Reaper’s Tithe and Feeding Frenzy.',
    levels: [
      { desc: 'Heal 8% of all damage dealt; +10% all damage', effects: [{ kind: 'lifestealPct', pct: 0.08 }, { kind: 'damageMult', mult: 1.10 }] },
      { desc: 'Heal 12% of all damage dealt; +16% all damage', effects: [{ kind: 'lifestealPct', pct: 0.12 }, { kind: 'damageMult', mult: 1.16 }] },
      { desc: 'Heal 16% of all damage dealt; +24% all damage', effects: [{ kind: 'lifestealPct', pct: 0.16 }, { kind: 'damageMult', mult: 1.24 }] },
    ],
  },
  {
    id: 'bulwark_of_the_abyss',
    image: '/gauntlet/synergies/bulwark_of_the_abyss.png',
    name: 'Bulwark of the Abyss',
    gauntlet: 'don',
    requires: [{ confluenceId: 'pressure_hull' }, { confluenceId: 'deep_fortress' }],
    flavor: 'The deep leans on their guns, not yours. What reaches your hull barely dents it.',
    detail: 'Builds on your two defensive synergies: every hit you take lands for less, and you patch a little hull at the start of every fight. Stacks on top of Pressure Hull and Deep Fortress.',
    levels: [
      { desc: 'Take -14% damage; heal 5% of max HP each fight start', effects: [{ kind: 'incomingDmgMult', mult: 0.86, scope: 'allRemaining' }, { kind: 'startOfFightHealPct', pctMax: 0.05 }] },
      { desc: 'Take -20% damage; heal 8% of max HP each fight start', effects: [{ kind: 'incomingDmgMult', mult: 0.80, scope: 'allRemaining' }, { kind: 'startOfFightHealPct', pctMax: 0.08 }] },
      { desc: 'Take -28% damage; heal 12% of max HP each fight start', effects: [{ kind: 'incomingDmgMult', mult: 0.72, scope: 'allRemaining' }, { kind: 'startOfFightHealPct', pctMax: 0.12 }] },
    ],
  },
  {
    id: 'perfect_storm',
    image: '/gauntlet/synergies/perfect_storm.png',
    name: 'Perfect Storm',
    gauntlet: 'don',
    requires: [{ confluenceId: 'untouchable' }, { confluenceId: 'iron_tempest' }],
    flavor: 'Never where the shot lands, and every blow that misses is flung back twice as hard.',
    detail: 'Builds on your dodge and retaliation synergies: you slip more shots, and the damage you throw back on a hit climbs higher. Stacks on top of Untouchable and Iron Tempest.',
    levels: [
      { desc: '+12% dodge; +15% thrown-back damage', effects: [{ kind: 'dodgeBonus', chance: 0.12, scope: 'allRemaining' }, { kind: 'retaliatePct', pct: 0.15 }] },
      { desc: '+18% dodge; +25% thrown-back damage', effects: [{ kind: 'dodgeBonus', chance: 0.18, scope: 'allRemaining' }, { kind: 'retaliatePct', pct: 0.25 }] },
      { desc: '+25% dodge; +40% thrown-back damage', effects: [{ kind: 'dodgeBonus', chance: 0.25, scope: 'allRemaining' }, { kind: 'retaliatePct', pct: 0.40 }] },
    ],
  },
  // ── Convergences fusing the NEW Don's confluences (fully his meta-tier) ───────
  {
    id: 'the_vise', image: '/gauntlet/synergies/the_vise.png', name: 'The Vise', gauntlet: 'don',
    requires: [{ confluenceId: 'cripple' }, { confluenceId: 'deep_terror' }],
    flavor: 'Feeble, snared, frozen, seized — and then broken. Nothing that meets the vise gets another turn.',
    detail: 'The control capstone: on top of Cripple and Deep Terror, your hits pile on even more Slow, and a locked-down hull simply takes far more damage and crits far more often.',
    levels: [
      { desc: 'Extra Slow on hit; +18% damage, +14% crit chance', effects: [{ kind: 'statusOnHit', status: 'slowed', chance: 0.4, magnitude: 3, turns: 3 }, { kind: 'damageMult', mult: 1.18 }, { kind: 'critChanceBonus', chance: 0.14 }] },
      { desc: 'Heavy Slow on hit; +28% damage, +20% crit chance', effects: [{ kind: 'statusOnHit', status: 'slowed', chance: 0.55, magnitude: 3, turns: 3 }, { kind: 'damageMult', mult: 1.28 }, { kind: 'critChanceBonus', chance: 0.20 }] },
    ],
  },
  {
    id: 'executioners_court', image: '/gauntlet/synergies/executioners_court.png', name: "Executioner's Court", gauntlet: 'don',
    requires: [{ confluenceId: 'coring_shot' }, { confluenceId: 'loaded_dice' }],
    flavor: 'Barriers cored, luck loaded, and every clean shot a death sentence read aloud.',
    detail: 'The crit capstone: on top of Coring Shot and Loaded Dice, your critical hits deal even more, land even more often, and the gold band widens further.',
    levels: [
      { desc: '+28% crit damage, +16% crit chance, gold band +22% wider', effects: [{ kind: 'critDmgMult', mult: 1.28 }, { kind: 'critChanceBonus', chance: 0.16 }, { kind: 'critZoneScale', mult: 1.22 }] },
      { desc: '+42% crit damage, +24% crit chance, gold band +34% wider', effects: [{ kind: 'critDmgMult', mult: 1.42 }, { kind: 'critChanceBonus', chance: 0.24 }, { kind: 'critZoneScale', mult: 1.34 }] },
    ],
  },
  {
    id: 'the_riptide', image: '/gauntlet/synergies/the_riptide.png', name: 'The Riptide', gauntlet: 'don',
    requires: [{ confluenceId: 'riposte_wall' }, { confluenceId: 'hobble' }],
    flavor: 'Never where the blow falls, and the sea drags back everything they throw. You are the undertow.',
    detail: 'The evasion capstone: on top of Riposte Wall and Hobble, you slip more shots, take less from the ones that land, and throw more spite back.',
    levels: [
      { desc: '+14% dodge, take −12%, +18% thrown-back damage', effects: [{ kind: 'dodgeBonus', chance: 0.14, scope: 'allRemaining' }, { kind: 'incomingDmgMult', mult: 0.88, scope: 'allRemaining' }, { kind: 'retaliatePct', pct: 0.18 }] },
      { desc: '+20% dodge, take −18%, +28% thrown-back damage', effects: [{ kind: 'dodgeBonus', chance: 0.20, scope: 'allRemaining' }, { kind: 'incomingDmgMult', mult: 0.82, scope: 'allRemaining' }, { kind: 'retaliatePct', pct: 0.28 }] },
      { desc: '+26% dodge, take −25%, +40% thrown-back damage', effects: [{ kind: 'dodgeBonus', chance: 0.26, scope: 'allRemaining' }, { kind: 'incomingDmgMult', mult: 0.75, scope: 'allRemaining' }, { kind: 'retaliatePct', pct: 0.40 }] },
    ],
  },
  {
    id: 'the_windfall', image: '/gauntlet/synergies/the_windfall.png', name: 'The Windfall', gauntlet: 'don',
    requires: [{ confluenceId: 'prize_crew' }, { confluenceId: 'clear_skies' }],
    flavor: 'A full magazine, a clear glass, and a gold band you could not miss if you tried.',
    detail: 'The tempo capstone: on top of Prize Crew and Clear Skies, you open every fight with more shots loaded, and the perfect-shot window widens so crits come easy.',
    levels: [
      { desc: 'Start each fight +1 loaded; gold band +18% wider, +12% crit chance', effects: [{ kind: 'startCharges', n: 1, scope: 'allRemaining' }, { kind: 'critZoneScale', mult: 1.18 }, { kind: 'critChanceBonus', chance: 0.12 }] },
      { desc: 'Start each fight +2 loaded; gold band +30% wider, +18% crit chance', effects: [{ kind: 'startCharges', n: 2, scope: 'allRemaining' }, { kind: 'critZoneScale', mult: 1.30 }, { kind: 'critChanceBonus', chance: 0.18 }] },
    ],
  },
]

/** A convergence's LEVEL (1..3), or 0 if not both confluences are drafted +
 *  online. The level is the LOWER of the two confluences' current levels. */
export function convergenceLevel(cv: Convergence, owned: Record<string, number>, taken: string[] = []): number {
  const t = new Set(taken)
  const levels = cv.requires.map(r => {
    if (!t.has(r.confluenceId)) return 0
    const c = CONFLUENCES.find(x => x.id === r.confluenceId)
    return c ? confluenceLevel(c, owned) : 0
  })
  if (levels.some(l => l < 1)) return 0
  return Math.min(Math.min(...levels), cv.levels.length)
}

/** Convergences ONLINE — drafted AND both confluences still qualify. */
export function activeConvergences(owned: Record<string, number>, taken: string[] = [], takenConv: string[] = []): Convergence[] {
  const tc = new Set(takenConv)
  return CONVERGENCES.filter(cv => tc.has(cv.id) && convergenceLevel(cv, owned, taken) >= 1)
}

/** Convergences you QUALIFY for (both confluences online) but have NOT drafted. */
export function eligibleConvergences(owned: Record<string, number>, taken: string[] = [], takenConv: string[] = [], variant: GauntletVariant = 'davy'): Convergence[] {
  const tc = new Set(takenConv)
  return CONVERGENCES.filter(cv => inGauntletPool(cv.gauntlet, variant) && !tc.has(cv.id) && convergenceLevel(cv, owned, taken) >= 1)
}

/** Player-facing summary for a convergence at a given level. */
export function convergenceDescAt(cv: Convergence, level: number): string {
  const i = Math.max(1, Math.min(level || 1, cv.levels.length)) - 1
  return cv.levels[i].desc
}

/** Base chance a qualifying convergence is offered on a draft (a bigger moment
 *  than a confluence — near-guaranteed once you've earned it). */
export const CONVERGENCE_OFFER_CHANCE = 0.85

/** Roll whether to slot a convergence into this draft. Reuses the confluence
 *  offer shape (isConvergence flag). A newly-qualified convergence never yet
 *  surfaced is GUARANTEED next draft (pity), matching the confluence rule. */
export function drawConvergenceOffer(owned: Record<string, number>, taken: string[] = [], takenConv: string[] = [], offered: Set<string> = new Set(), offerMult = 1, variant: GauntletVariant = 'davy'): ConfluenceOffer | null {
  if (offerMult <= 0) return null
  const pool = eligibleConvergences(owned, taken, takenConv, variant)
  if (pool.length === 0) return null
  const fresh = pool.filter(cv => !offered.has(cv.id))
  if (fresh.length > 0 && offerMult < 1 && Math.random() >= offerMult) return null
  if (fresh.length === 0 && Math.random() >= CONVERGENCE_OFFER_CHANCE * offerMult) return null
  const chooseFrom = fresh.length > 0 ? fresh : pool
  const cv = chooseFrom[Math.floor(Math.random() * chooseFrom.length)]
  const level = convergenceLevel(cv, owned, taken)
  const confName = (id: string) => CONFLUENCES.find(c => c.id === id)?.name ?? id
  return {
    kind: 'confluence',
    id: cv.id, name: cv.name, flavor: cv.flavor,
    level, desc: convergenceDescAt(cv, level), detail: cv.detail,
    halves: [confName(cv.requires[0].confluenceId), confName(cv.requires[1].confluenceId)],
    isConvergence: true,
  }
}

/** Flattened TideEffects from every TAKEN, still-qualified convergence at its
 *  current level — appended to the boon + confluence effects fed into combat. */
export function convergenceEffects(owned: Record<string, number>, taken: string[] = [], takenConv: string[] = []): TideEffect[] {
  const tc = new Set(takenConv)
  return CONVERGENCES.flatMap(cv => {
    if (!tc.has(cv.id)) return []
    const lvl = convergenceLevel(cv, owned, taken)
    return lvl >= 1 ? cv.levels[lvl - 1].effects : []
  })
}

// ── Depth bands + Davy's voice ────────────────────────────────────────────────
// The descent is a place, not a treadmill. Each band has its own name (shown on
// the plunge + the depth bar) and the deeper bands pair with the darker combat
// atmosphere already wired in atmosphereForDepth.
// `accent` tints the band's descent splash + the fight gloom, so sinking
// through the ladder LOOKS like travelling somewhere, not a counter ticking.
// Extended 2026-07-12: the ladder used to stop at 13 while real runs reach
// 60-80+, so players sat in "Davy's Court" for fifty straight depths. 'The
// Crush' band now sits at 60 to match the difficulty band of the same name
// (DEEP_BEND_START + the Crush curse).
export interface DepthBand { name: string; minDepth: number; accent: string }
export const DEPTH_BANDS: DepthBand[] = [
  { name: 'The Shallows of the Dead', minDepth: 1,  accent: '#5eead4' },
  { name: 'The Drowned Shelf',        minDepth: 6,  accent: '#4fb8a0' },
  { name: "Davy's Court",             minDepth: 13, accent: '#5da7d4' },
  { name: 'The Starless Reach',       minDepth: 22, accent: '#7090c0' },
  { name: 'The Silt Fields',          minDepth: 32, accent: '#a78bfa' },
  { name: "The Leviathan's Road",     minDepth: 42, accent: '#c084fc' },
  { name: 'The Black Meridian',       minDepth: 51, accent: '#8a6aa0' },
  { name: 'The Crush',                minDepth: 60, accent: '#e0555a' },
  { name: 'The Bottom of the World',  minDepth: 85, accent: '#f87171' },
]
// Don's Gauntlet ladder — the same descent, a KRAKEN-GREEN abyss instead of
// Davy's blue-to-red court. Deep-green place names (his territory + the kraken
// that keeps it), accents darkening from luminous weed-green to near-black bile.
export const DON_DEPTH_BANDS: DepthBand[] = [
  { name: 'The Green Shallows',    minDepth: 1,  accent: '#4fc98a' },
  { name: 'The Weedbound Shelf',   minDepth: 6,  accent: '#3fb87c' },
  { name: "The Kraken's Court",    minDepth: 13, accent: '#35a06a' },
  { name: 'The Ink Reach',         minDepth: 22, accent: '#2f9d7a' },
  { name: 'The Drowned Canopy',    minDepth: 32, accent: '#2b8f68' },
  { name: "The Leviathan's Coil",  minDepth: 42, accent: '#26855f' },
  { name: 'The Black Kelp',        minDepth: 51, accent: '#1f7d5a' },
  { name: 'The Crushing Deep',     minDepth: 60, accent: '#2f6b4a' },
  { name: 'The Maw of the World',  minDepth: 85, accent: '#164a34' },
]
export function bandForDepth(depth: number, variant: GauntletVariant = 'davy'): DepthBand {
  const bands = variant === 'don' ? DON_DEPTH_BANDS : DEPTH_BANDS
  let band = bands[0]
  for (const b of bands) if (depth >= b.minDepth) band = b
  return band
}

// Davy Jones taunts the descent at set depths — his voice from the dark, so the
// mode that bears his name actually has him in it. Returns null on quiet depths.
const DAVY_TAUNTS: Record<number, string> = {
  3:  'Down you come. They all come down, in the end.',
  6:  'Off the shelf now. The bottom is a long way from caring.',
  9:  'Still breathing? The deep is patient. So am I.',
  13: 'You stand in my court, captain. None leave it but as crew.',
  16: 'Deeper. Yes. Bring me all of it before you sink.',
  20: 'No light reaches here. Only me. Only the Locker.',
  // The deep taunts — the ladder used to go quiet at 20 while runs reach 80+.
  32: 'Everything that sinks ends up in my silt. You will too.',
  42: 'You sail a road paved with things bigger than your ship.',
  51: 'Past this line the charts are blank. The chartmakers never came home.',
  60: 'Here is where the sea stops asking. Feel the weight, captain.',
  70: 'Your pot means nothing to the water. Only to you. That is the joke.',
  85: 'The bottom of the world. Even I visit rarely.',
  100: 'A hundred fathoms. Sit a while. You have earned the dark.',
}
export function davyTaunt(depth: number): string | null {
  return DAVY_TAUNTS[depth] ?? null
}

// Don Finleone's voice from the green — the ghost of the Family's head, holding
// court in a kraken-haunted deep. Mob-boss menace, sea-cold, no em-dashes.
const DON_TAUNTS: Record<number, string> = {
  3:  'You came down to see me. They all do. It never ends well for them.',
  6:  'The green takes everyone in the end. You just came early.',
  9:  'Still afloat? The Family respects persistence. Right up until we stop.',
  13: 'My court now, captain. The kraken keeps the door, and it never opens out.',
  16: 'Deeper. Good. I like a captain who brings himself to the meeting.',
  20: 'No sun down here. No law. Just me, and the thing I feed.',
  32: 'Every debt sinks to the bottom eventually. Yours is past due.',
  42: 'Feel the coils? That is the house saying hello, captain.',
  51: 'Past this line the charts all lie. So did everyone who drew them.',
  60: 'The green closes its fist now. Nothing personal. It never is.',
  70: 'You counted your pot. The deep counted you. One of you came up short.',
  85: 'The belly of the world. Even I keep it a short visit.',
  100: 'A hundred fathoms in my green. Sit. Consider it a standing invitation.',
}
export function donTaunt(depth: number): string | null {
  return DON_TAUNTS[depth] ?? null
}

/** The descending voice for a run — Davy's from the grey, Don's from the green. */
export function gauntletTaunt(depth: number, variant: GauntletVariant = 'davy'): string | null {
  return variant === 'don' ? donTaunt(depth) : davyTaunt(depth)
}
