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
import {
  CORSAIRS_RECKONING_CHALLENGE, CAPTAIN_KRUST_CHALLENGE,
  THE_CARTOGRAPHER_CHALLENGE, THE_TOLLMASTER_CHALLENGE,
} from './raidChallenge'
import { AFFIXES, ALL_AFFIX_IDS, ELITE_HP_MULT, ELITE_DMG_MULT, rollAffix, rollSecondAffix, mergeAffixes, type AffixDef } from './raidAffixes'
import { type TideEffect } from './tides'
import { NO_TERM_EFFECTS, type TermEffects, PRESSURE_SKIN_ID, pressureSkinDropChance } from './gauntletTerms'

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
 *  POT_FLATTEN_DEPTH so deep runs stop scaling quadratically). */
export function roundContribution(depth: number, isBoss: boolean): number {
  const base = POT_BASE + POT_GROWTH * Math.min(depth, POT_FLATTEN_DEPTH)
  return Math.round(base * (isBoss ? BOSS_POT_MULT : 1))
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
export function gauntletXpForDepth(depth: number): number {
  let total = 0
  for (let d = 1; d <= Math.max(0, Math.floor(depth)); d++) {
    total += XP_BASE + XP_GROWTH * Math.min(d, XP_FLATTEN_DEPTH)
  }
  return Math.round(total * XP_BOSS_FACTOR)
}

// CREW XP from a Gauntlet cash-out at `depth`, on a MUCH smaller scale than the
// player's Nav XP. Crew leveling is tuned against RAIDS (~910 XP/raid, ~278
// raids to max a crew — see lib/crewLevel), but the Gauntlet used to mirror its
// big Nav XP to crew, maxing them in a couple of dives. Now a run is worth
// roughly depth/6 raids of crew XP (depth 30 ≈ 4,500 ≈ 5 raids; ~42 depth-40
// dives to max one crew). Granted per-assigned-crew, cash-out only.
const CREW_XP_PER_DEPTH = 150
export function gauntletCrewXp(depth: number): number {
  return Math.round(Math.max(0, Math.floor(depth)) * CREW_XP_PER_DEPTH)
}

/** Server-side ceiling for a reported depth: the pot the player would have
 *  if EVERY round had been a boss. Used to reject forged cash-out values
 *  while still trusting the client's real (lower) pot. */
export function maxPotForDepth(depth: number): number {
  let total = 0
  for (let d = 1; d <= depth; d++) total += roundContribution(d, true)
  return total
}

/** Fathoms — the Gauntlet's own meta-currency — earned for reaching a given
 *  depth on a run. Banked whether you cash out OR sink, so it rewards how deep
 *  you got, not whether you played it safe. One Fathom per depth cleared. Spent
 *  on permanent Locker Upgrades + the Auto Catcher. */
export function fathomsForDepth(depth: number): number {
  return Math.max(0, Math.floor(depth))
}

/** Honest floor estimate of the pot a run reaching `depth` banks: every
 *  cleared round at its non-boss contribution. Real runs land higher (bosses
 *  multiply), so this reads as a conservative "about" for the intro preview. */
export function estimatePotForDepth(depth: number): number {
  let total = 0
  for (let d = 1; d <= depth; d++) total += roundContribution(d, false)
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
// RaidCombat (enemyArtFilter prop).
export const DROWNED_FILTER = 'grayscale(0.45) brightness(0.82) drop-shadow(0 0 11px rgba(110,220,210,0.6))'

// Two-phase boss revives are an ENDGAME escalation — early/mid Gauntlet bosses
// stay single-phase; only past this depth do they bring their phase 2.
const PHASE2_BOSS_MIN_DEPTH = 20

/** Overlay the gauntlet curve onto a source enemy, preserving identity
 *  (pattern, art, signature ability, First-Cut startCharges, etc) but
 *  reframing it as a drowned Locker creature. */
function scaleToCurve(src: BroadsideEnemy, depth: number, isBoss: boolean): BroadsideEnemy {
  const hp  = isBoss ? Math.round(mobHp(depth) * BOSS_HP_MULT) : mobHp(depth)
  const min = Math.round(mobMinDmg(depth) * (isBoss ? BOSS_DMG_MULT : 1))
  const max = Math.round(mobMaxDmg(depth) * (isBoss ? BOSS_DMG_MULT : 1))
  // Gunnery accuracy climbs with depth so dodge stays a real read as a
  // high-nav endgame captain keeps descending (the fixed per-raid accuracy on
  // the source enemy would fall behind). Gauntlet players are already post-
  // Chapter-2, so this opens near the late-raid band (~24) and ramps. Bosses
  // shoot a touch straighter. See BroadsideEnemy.accuracy for the dodge math.
  const accuracy = Math.round(18 + depth * 1.4) + (isBoss ? 3 : 0)
  const out: BroadsideEnemy = { ...src, name: drownedName(src.name), hpBase: hp, minDmg: Math.max(1, min), maxDmg: Math.max(min + 1, max), accuracy }
  // Phase-2 revives only past PHASE2_BOSS_MIN_DEPTH — strip the inherited
  // challenge phase2 on shallower boss rounds so they stay single-phase.
  if (isBoss && depth <= PHASE2_BOSS_MIN_DEPTH) out.phase2 = undefined
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
  return { shots: 0, volleys: 0, crits: 0, dmgDealt: 0, highestHit: 0, dmgTaken: 0, dmgHealed: 0, dmgAbsorbed: 0, dodgesWon: 0, dodgesLost: 0 }
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
  /** Calm Before already waved off the first curse milestone */
  calmBeforeUsed: boolean
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
 *  running guardrail state and updates it from the returned fight.
 *  `skipOffset` (Veteran's Start) raises the COMBAT depth — enemy scaling, boss
 *  / elite odds, and the displayed depth — while the pot stays keyed to the
 *  REWARD depth (ships actually sunk), so the head start is no reward shortcut. */
export function generateFight(state: GauntletRollState, skipOffset = 0, terms: TermEffects = NO_TERM_EFFECTS): GauntletFight {
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

  if (isBoss) {
    // Davy's Court (a signed Term): the captains he sends are his best.
    const base = scaleToCurve(pick(BOSS_POOL), depth, true)
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
    return { enemy, isBoss: true, isElite: false, affix: bossAffix, potContribution: paying ? roundContribution(rewardDepth, true) : 0, depth }
  }

  // Mob — independent elite roll, chance scaling with depth. Press-Ganged (a
  // signed Term) multiplies it; Marked Hulls pairs affixes from depth 1 and can
  // stack a third; Ironbacked bumps the elite's hull + guns on top of the usual
  // elite treatment.
  let enemy = scaleToCurve(pick(MOB_POOL), depth, false)
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
  return { enemy, isBoss: false, isElite, affix, potContribution: paying ? roundContribution(rewardDepth, false) : 0, depth }
}

/** Advance the guardrail state after a fight is generated. */
export function advanceRollState(state: GauntletRollState, fight: GauntletFight): GauntletRollState {
  return {
    cleared: state.cleared + 1,
    prevWasBoss: fight.isBoss,
    roundsSinceBoss: fight.isBoss ? 0 : state.roundsSinceBoss + 1,
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
export const BLOOD_CANNON_ITEM_ID = 'davys_blood_cannon'
export const BLOOD_CANNON_CHEST_TIER = 3

export interface ChestOdd {
  id: string
  name: string
  kind: 'item' | 'skin'
  /** 0-1. Already accounts for tier gates and for what the player owns. */
  chance: number
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
}): ChestOdd[] {
  const { depth, hardcore, pressure, ownedItems, ownedSkins, davyForge } = opts
  const payDepth = Math.min(depth, GAUNTLET_REWARD_DEPTH_CAP)
  const tier = chestForDepth(payDepth).tier
  const cannon = chestCannonDropChance(payDepth)
  const skin = chestSkinDropChance(payDepth)
  const out: ChestOdd[] = []

  // The two Davy cannons roll INDEPENDENTLY, and stop once you have forged the Grand.
  if (!ownedItems.includes(davyForge.result)) {
    for (const id of davyForge.components) {
      if (!ownedItems.includes(id)) out.push({ id, name: CHEST_DROP_NAMES[id] ?? id, kind: 'item', chance: cannon })
    }
  }
  // Hardcore: the Blood Cannon. Gone once forged into either of its fusions.
  const bloodForged = ['bloodletter', 'reavers_cannon'].some(id => ownedItems.includes(id))
  if (hardcore && tier >= BLOOD_CANNON_CHEST_TIER && !ownedItems.includes(BLOOD_CANNON_ITEM_ID) && !bloodForged) {
    out.push({ id: BLOOD_CANNON_ITEM_ID, name: "Davy's Blood Cannon", kind: 'item', chance: cannon })
  }
  if (tier >= GOLD_HULL_CHEST_TIER && !ownedSkins.includes(GOLD_HULL_SKIN_ID)) {
    out.push({ id: GOLD_HULL_SKIN_ID, name: 'Golden Gauntlet Hull', kind: 'skin', chance: skin })
  }
  if (hardcore && tier >= BLOOD_HULL_CHEST_TIER && !ownedSkins.includes(BLOOD_HULL_SKIN_ID)) {
    out.push({ id: BLOOD_HULL_SKIN_ID, name: 'Bad Blood Hull', kind: 'skin', chance: skin })
  }
  if (hardcore && !ownedSkins.includes(PRESSURE_SKIN_ID)) {
    const c = pressureSkinDropChance(pressure, payDepth)
    if (c > 0) out.push({ id: PRESSURE_SKIN_ID, name: 'Pitch Black Hull', kind: 'skin', chance: c })
  }
  return out
}

const CHEST_DROP_NAMES: Record<string, string> = {
  davys_heavy_cannon: "Davy's Heavy Cannon",
  davys_hand_cannon:  "Davy's Hand Cannon",
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
    id: 'crushing_depth',
    name: 'Crushing Depth',
    flavor: 'The water itself leans on your hull. Every fight begins a little closer to the breaking point.',
    tiers: [
      { desc: 'Lose 8% max HP before every fight', detail: 'At the start of every fight from now on, your ship loses 8% of its maximum HP. It can never land the killing blow itself (you stop at 1 HP), but it steadily wears you down.', hpDrainPct: 0.08 },
      { desc: 'Lose 13% max HP before every fight', detail: 'The pressure deepens. Your ship now sheds 13% of its maximum HP at the start of every fight (still never below 1).', hpDrainPct: 0.13 },
    ],
  },
  {
    id: 'bloodthirst',
    name: 'Bloodthirst',
    flavor: 'The drowned smell your wake. Every gun down here is aimed to kill, not to warn.',
    tiers: [
      { desc: 'Enemies deal 20% more damage', detail: 'Every hit an enemy lands on you deals 20% more damage for the rest of the run.', effects: [{ kind: 'incomingDmgMult', mult: 1.20, scope: 'allRemaining' }] },
      { desc: 'Enemies deal 30% more damage', detail: 'The frenzy spreads. Every enemy hit now lands for 30% more damage.', effects: [{ kind: 'incomingDmgMult', mult: 1.30, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'the_warding',
    name: 'The Warding',
    flavor: 'A cold light sheathes every hull down here. You have to break the barrier before you can break the ship.',
    tiers: [
      { desc: 'Enemies carry a 20% barrier', detail: 'Every enemy starts each fight behind a barrier worth 20% of its hull. Your shots chew through the barrier before its health takes a scratch (burn bleeds through, and the Railgun pierces it). It reforms fresh each fight.', effects: [{ kind: 'enemyShield', pctMax: 0.20 }] },
      { desc: 'Enemies carry a 32% barrier', detail: 'The warding thickens. Every enemy now hides behind a barrier worth 32% of its hull each fight.', effects: [{ kind: 'enemyShield', pctMax: 0.32 }] },
    ],
  },
  {
    id: 'becalmed',
    name: 'Becalmed',
    flavor: 'The wind died at this depth. Your ship answers the wheel a beat too slow.',
    tiers: [
      { desc: '-3 ship speed', detail: 'Your ship is 3 slower. Speed decides who fires first each turn and how fast your aim bar sweeps, so you will act after the enemy more often and have less time to line up a shot.', effects: [{ kind: 'speedDelta', n: -3, scope: 'allRemaining' }] },
      { desc: '-5 ship speed', detail: 'The calm thickens. Your ship is 5 slower now, ceding the first shot far more often.', effects: [{ kind: 'speedDelta', n: -5, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'murk',
    name: 'Murk',
    flavor: 'The dark closes over your sights. The perfect shot is a narrower thing now.',
    tiers: [
      { desc: 'Your crit zone is 15% smaller', detail: 'The gold "perfect shot" band on your aim bar shrinks by 15%, so landing a critical hit is harder.', effects: [{ kind: 'critZoneScale', mult: 0.85 }] },
      { desc: 'Your crit zone is 32% smaller', detail: 'The dark all but closes the window. The gold "perfect shot" band shrinks by 32%.', effects: [{ kind: 'critZoneScale', mult: 0.68 }] },
    ],
  },
  // ── Aim-game disruptors — the deep messes with how you SHOOT, not just stats. ─
  {
    id: 'sounding_fog',
    name: 'Sounding Fog',
    flavor: 'The water goes blind at this depth. You fire at shapes in the murk.',
    tiers: [
      { desc: 'Fog rolls over your aim bar', detail: 'A bank of fog drifts back and forth across your aim bar, hiding the gold crit band as it passes. Lock your shots by rhythm, not by sight.', effects: [{ kind: 'aimFog', density: 0.55 }] },
      { desc: 'Thick fog smothers your aim bar', detail: 'The fog rolls in heavy, hiding the gold band for longer and leaving only narrow slivers of clear sight.', effects: [{ kind: 'aimFog', density: 0.69 }] },
    ],
  },
  {
    id: 'shrouded_hull',
    name: 'Shrouded Hull',
    flavor: 'The enemy hull swims in and out of the murk. You never quite know how close it is to going under.',
    tiers: [
      { desc: '25% chance the enemy’s health is hidden', detail: 'Each fight, a 25% chance the enemy’s HP bar is fogged over. You fight blind on how close it is to sinking, judging by the numbers you land instead.', effects: [{ kind: 'hideEnemyHp', chance: 0.25 }] },
      { desc: '50% chance the enemy’s health is hidden', detail: 'The murk thickens: a 50% chance each fight that the enemy’s HP is hidden entirely.', effects: [{ kind: 'hideEnemyHp', chance: 0.50 }] },
    ],
  },
  {
    id: 'shuttered_ports',
    name: 'Shuttered Ports',
    flavor: 'Their gun ports stay shut till the muzzles run out. No counting the shots they hold.',
    tiers: [
      { desc: '25% chance the enemy’s loaded shots are hidden', detail: 'Each fight, a 25% chance you can’t see the enemy’s cannonball count. No telling when the next broadside comes.', effects: [{ kind: 'hideEnemyCharges', chance: 0.25 }] },
      { desc: '50% chance the enemy’s loaded shots are hidden', detail: 'A 50% chance each fight the enemy’s loaded shots are hidden from you entirely.', effects: [{ kind: 'hideEnemyCharges', chance: 0.50 }] },
    ],
  },
  {
    id: 'racing_tide',
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
    id: 'roiling_sea',
    name: 'Roiling Sea',
    flavor: 'The sea heaves under you. Nothing you aim at stays where you left it.',
    tiers: [
      { desc: 'The target band lurches', detail: 'The gold target band slides across your aim bar much faster and wilder, so where the perfect shot sits is a moving guess every turn.', effects: [{ kind: 'zoneSpeedMult', mult: 1.9 }] },
      { desc: 'The target band thrashes', detail: 'The sea goes violent. The gold band careens across the bar, almost never where it was a beat ago.', effects: [{ kind: 'zoneSpeedMult', mult: 2.6 }] },
    ],
  },
  {
    id: 'inkfall',
    name: 'Inkfall',
    flavor: 'Something vast empties its ink into the water, and the world goes black in lurches.',
    tiers: [
      { desc: 'Your aim bar blacks out in fits', detail: 'A dark veil falls over your aim bar in short, random fits, swallowing the needle and the gold band for a beat at a time. Lock by rhythm when the dark takes it.', effects: [{ kind: 'aimBlackout', intensity: 0.55 }] },
      { desc: 'Your aim bar drowns in dark', detail: 'The ink comes harder and blacker, blotting out the whole aim bar in fits. You will fire half-blind.', effects: [{ kind: 'aimBlackout', intensity: 0.78 }] },
    ],
  },
  // ── Stat / economy curses — the deep hits your numbers, not just your aim. ───
  {
    id: 'waterlogged_powder',
    name: 'Waterlogged Powder',
    flavor: 'Seawater finds the magazine. Your guns cough where they used to roar.',
    tiers: [
      { desc: 'Your shots deal 15% less damage', detail: 'Damp powder and weak charges. Every shot you fire deals 15% less damage for the rest of the run.', effects: [{ kind: 'damageMult', mult: 0.85 }] },
      { desc: 'Your shots deal 28% less damage', detail: 'The whole magazine is soaked through. Every shot you fire now deals 28% less damage.', effects: [{ kind: 'damageMult', mult: 0.72 }] },
    ],
  },
  {
    id: 'all_or_nothing',
    name: 'All or Nothing',
    flavor: 'The deep has no patience for a near miss. Land it true or do not bother.',
    tiers: [
      { desc: 'Non-crit shots deal 18% less', detail: 'Anything short of a gold critical hits soft. Your hit and graze shots deal 18% less damage; only perfect crits land at full force.', effects: [{ kind: 'noncritDmgMult', mult: 0.82 }] },
      { desc: 'Non-crit shots deal 32% less', detail: 'The margin for error vanishes. Non-crit shots now deal 32% less damage; only a gold crit truly bites.', effects: [{ kind: 'noncritDmgMult', mult: 0.68 }] },
    ],
  },
  {
    id: 'leaden_hands',
    name: 'Leaden Hands',
    flavor: 'Numb fingers, slow heave. The wheel comes around a moment too late.',
    tiers: [
      { desc: 'Your dodges fail more often', detail: 'The cold sinks into the crew. Your ship is 15% less likely to weave aside from an enemy shot for the rest of the run.', effects: [{ kind: 'dodgeBonus', chance: -0.15, scope: 'allRemaining' }] },
      { desc: 'Your dodges fail far more often', detail: 'The crew goes leaden to the bone. Your ship is 28% less likely to weave aside from an enemy shot.', effects: [{ kind: 'dodgeBonus', chance: -0.28, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'sharpshooters',
    name: 'Sharpshooters',
    flavor: 'They have done this longer than you have been alive, and they know exactly where to aim.',
    tiers: [
      { desc: 'Enemies crit you 10% more often', detail: 'The drowned gunners find the gaps in your hull. Every enemy is 10% more likely to land a critical hit on you for the rest of the run.', effects: [{ kind: 'incomingCritReduction', chance: -0.10 }] },
      { desc: 'Enemies crit you 20% more often', detail: 'They have your range cold. Every enemy is 20% more likely to land a critical hit on you.', effects: [{ kind: 'incomingCritReduction', chance: -0.20 }] },
    ],
  },
  {
    id: 'barnacled_hull',
    name: 'Barnacled Hull',
    flavor: 'Crusted iron and dead coral. These ships have been sinking for a hundred years and still will not go under.',
    tiers: [
      { desc: 'Enemies are 15% tougher', detail: 'The deep grows thick over every hull down here. Enemies have 15% more HP for the rest of the run, so every fight drags on longer.', effects: [{ kind: 'enemyHpScale', mult: 1.15, scope: 'allRemaining' }] },
      { desc: 'Enemies are 25% tougher', detail: 'The crust grows inches thick. Enemies have 25% more HP for the rest of the run.', effects: [{ kind: 'enemyHpScale', mult: 1.25, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'loaded_guns',
    name: 'Loaded Guns',
    flavor: 'No warning shot, no parley. The drowned were aiming before you ever drew alongside.',
    tiers: [
      { desc: 'Enemies open every fight already loaded', detail: 'Every enemy from now on starts each fight with a cannonball already chambered, so the ones that lead with their guns can fire on you from the opening bell.', effects: [{ kind: 'enemyStartChargesDelta', n: 1, scope: 'allRemaining' }] },
      { desc: 'Enemies open every fight loaded for a volley', detail: 'Every enemy now starts each fight with two cannonballs chambered, ready to open with their heaviest shot.', effects: [{ kind: 'enemyStartChargesDelta', n: 2, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'false_colours',
    name: 'False Colors',
    flavor: 'The drowned fly colors that are not their own. Half the targets out there are lies.',
    tiers: [
      { desc: 'A false target sometimes drifts your aim bar', detail: 'On some of your shots (not all), a decoy target band drifts across your aim bar alongside the real gold one. Lock onto the decoy and your shot is a dud: you take chip damage and your turn ends without firing. Pick the real band out of the lie.', effects: [{ kind: 'aimDecoys', n: 1 }] },
      { desc: 'Two false targets sometimes drift your aim bar', detail: 'The deception thickens. Now two decoy bands can drift your aim bar at once, so threading a clean shot to the real target gets harder. Locking either decoy still duds your shot and ends your turn.', effects: [{ kind: 'aimDecoys', n: 2 }] },
    ],
  },
  {
    id: 'drowned_whispers',
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
    id: 'dead_hands',
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
    id: 'the_crush',
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
export function drawCurse(curseTiers: Record<string, number>, depth: number, startsAtWorst = false): CurseOffer | null {
  // The Crush never enters the normal pool — it's the fallback pressure once
  // every named curse is spent (and only in the deep band).
  const eligible = GAUNTLET_CURSES
    .filter(c => c.id !== 'the_crush')
    .map(c => ({ c, next: (curseTiers[c.id] ?? 0) + 1 }))
    .filter(x => x.next <= x.c.tiers.length && (x.next === 1 || depth >= CURSE_TIER2_DEPTH))
  if (eligible.length > 0) {
    const drawn = eligible[Math.floor(Math.random() * eligible.length)]
    const c = drawn.c
    // Loose Tongue II (a signed Term): a fresh curse lands straight at its
    // nastier tier instead of building up to it.
    const next = startsAtWorst ? Math.min(c.tiers.length, Math.max(drawn.next, 2)) : drawn.next
    const t = c.tiers[next - 1]
    return { id: c.id, name: c.name, flavor: c.flavor, tier: next, desc: t.desc, detail: t.detail, effects: t.effects, hpDrainPct: t.hpDrainPct, silenceCrew: t.silenceCrew, isUpgrade: next > 1 }
  }
  // Pool spent: past the bend the Locker turns to raw pressure — The Crush,
  // one more fathom per curse milestone, effectively forever.
  if (depth > DEEP_BEND_START) {
    const crush = GAUNTLET_CURSES.find(c => c.id === 'the_crush')
    const next = (curseTiers['the_crush'] ?? 0) + 1
    if (crush && next <= crush.tiers.length) {
      const t = crush.tiers[next - 1]
      return { id: crush.id, name: crush.name, flavor: crush.flavor, tier: next, desc: t.desc, detail: t.detail, effects: t.effects, hpDrainPct: t.hpDrainPct, silenceCrew: t.silenceCrew, isUpgrade: next > 1 }
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
  /** Omit for Common. */
  rarity?: BoonRarity
  /** Tier 1 → 2 → 3, strongest last. The highest tier you hold is the ONE that
   *  applies — a higher tier replaces the lower, it doesn't stack on top.
   *  Legendaries run fewer, bigger tiers. */
  tiers: GauntletBoonTier[]
}

/** A boon's rarity, defaulting to Common. */
export function boonRarity(fam: GauntletBoon): BoonRarity { return fam.rarity ?? 'common' }

export const GAUNTLET_BOONS: GauntletBoon[] = [
  { id: 'broadside_mastery', name: 'Broadside Mastery', flavor: 'Your gunners find their rhythm. Everything you fire bites harder.', rarity: 'rare', tiers: [
    { desc: '+10% all damage', detail: 'Every shot deals 10% more damage — both the single-shot Fire action and the Volley. It covers every shot you take, where the focused boons only buff one action for a bigger number.', effect: { kind: 'damageMult', mult: 1.10 } },
    { desc: '+22% all damage', detail: 'Every shot deals 22% more damage — both the single-shot Fire action and the Volley.', effect: { kind: 'damageMult', mult: 1.22 } },
    { desc: '+36% all damage', detail: 'Every shot deals 36% more damage — both the single-shot Fire action and the Volley.', effect: { kind: 'damageMult', mult: 1.36 } },
  ] },
  { id: 'powder_and_shot', name: 'Powder & Shot', flavor: 'Dry powder, packed tight. Your single shots punch through.', tiers: [
    { desc: '+14% Fire damage', detail: 'The single-shot Fire action deals 14% more damage. Your Volley (the 3-charge double shot) is unaffected.', effect: { kind: 'fireDmgMult', mult: 1.14 } },
    { desc: '+30% Fire damage', detail: 'The single-shot Fire action deals 30% more damage. Your Volley (the 3-charge double shot) is unaffected.', effect: { kind: 'fireDmgMult', mult: 1.30 } },
    { desc: '+48% Fire damage', detail: 'The single-shot Fire action deals 48% more damage. Your Volley (the 3-charge double shot) is unaffected.', effect: { kind: 'fireDmgMult', mult: 1.48 } },
  ] },
  { id: 'grapeshot', name: 'Grapeshot', flavor: 'A scatter of iron off the rails. Your volleys shred.', tiers: [
    { desc: '+14% Volley damage', detail: 'Your Volley (the 3-charge double shot) deals 14% more damage. Single Fire shots are unaffected.', effect: { kind: 'volleyDmgMult', mult: 1.14 } },
    { desc: '+30% Volley damage', detail: 'Your Volley (the 3-charge double shot) deals 30% more damage. Single Fire shots are unaffected.', effect: { kind: 'volleyDmgMult', mult: 1.30 } },
    { desc: '+48% Volley damage', detail: 'Your Volley (the 3-charge double shot) deals 48% more damage. Single Fire shots are unaffected.', effect: { kind: 'volleyDmgMult', mult: 1.48 } },
  ] },
  { id: 'dead_eye', name: 'Dead-Eye', flavor: 'You learn exactly where a hull wants to break.', tiers: [
    { desc: '8% chance a normal hit becomes a crit', detail: 'When you land a normal hit (the green zone on your aim bar), there’s an 8% chance it upgrades into a critical hit anyway — so you can crit even when you miss the gold band. Grazes don’t count.', effect: { kind: 'critChanceBonus', chance: 0.08 } },
    { desc: '16% chance a normal hit becomes a crit', detail: 'When you land a normal hit (the green zone), there’s a 16% chance it upgrades into a critical hit anyway. Grazes don’t count.', effect: { kind: 'critChanceBonus', chance: 0.16 } },
    { desc: '26% chance a normal hit becomes a crit', detail: 'When you land a normal hit (the green zone), there’s a 26% chance it upgrades into a critical hit anyway. Grazes don’t count.', effect: { kind: 'critChanceBonus', chance: 0.26 } },
  ] },
  { id: 'wide_sights', name: 'Wide Sights', flavor: 'The perfect shot stops being luck.', tiers: [
    { desc: 'Gold crit band 12% wider', detail: 'The gold "perfect shot" band on your aim bar is 12% wider, so landing a critical hit is easier.', effect: { kind: 'critZoneScale', mult: 1.12 } },
    { desc: 'Gold crit band 26% wider', detail: 'The gold "perfect shot" band on your aim bar is 26% wider.', effect: { kind: 'critZoneScale', mult: 1.26 } },
    { desc: 'Gold crit band 42% wider', detail: 'The gold "perfect shot" band on your aim bar is 42% wider.', effect: { kind: 'critZoneScale', mult: 1.42 } },
  ] },
  { id: 'ironhide', name: 'Ironhide', flavor: 'Plates doubled along the waterline.', rarity: 'rare', tiers: [
    { desc: 'Take 12% less damage', detail: 'Every hit an enemy lands on you deals 12% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.88, scope: 'allRemaining' } },
    { desc: 'Take 22% less damage', detail: 'Every hit an enemy lands on you deals 22% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.78, scope: 'allRemaining' } },
    { desc: 'Take 34% less damage', detail: 'Every hit an enemy lands on you deals 34% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.66, scope: 'allRemaining' } },
  ] },
  { id: 'press_the_powder', name: 'Press the Powder', flavor: 'Your crew loads like the deep is at their heels.', tiers: [
    { desc: '10% chance a Reload loads 2 cannonballs', detail: 'Each time you Reload, there’s a 10% chance a second cannonball is loaded for free on top of the usual one.', effect: { kind: 'reloadProc', chance: 0.10, bonusCharges: 1 } },
    { desc: '22% chance a Reload loads 2 cannonballs', detail: 'Each time you Reload, there’s a 22% chance a second cannonball is loaded for free.', effect: { kind: 'reloadProc', chance: 0.22, bonusCharges: 1 } },
    { desc: '36% chance a Reload loads 2 cannonballs', detail: 'Each time you Reload, there’s a 36% chance a second cannonball is loaded for free.', effect: { kind: 'reloadProc', chance: 0.36, bonusCharges: 1 } },
  ] },
  { id: 'following_sea', name: 'Following Sea', flavor: 'The current finally runs with you.', rarity: 'rare', tiers: [
    { desc: '+2 ship speed', detail: 'Your ship is 2 faster: you act first more often and slip more enemy shots when you dodge.', effect: { kind: 'speedDelta', n: 2, scope: 'allRemaining' } },
    { desc: '+4 ship speed', detail: 'Your ship is 4 faster: you act first more often and slip more enemy shots when you dodge.', effect: { kind: 'speedDelta', n: 4, scope: 'allRemaining' } },
    { desc: '+7 ship speed', detail: 'Your ship is 7 faster: you act first far more often and slip far more enemy shots when you dodge.', effect: { kind: 'speedDelta', n: 7, scope: 'allRemaining' } },
  ] },
  { id: 'bilge_pump', name: 'Bilge Pump', flavor: 'Patch the seams in the lull before the next gun.', tiers: [
    { desc: 'Heal 5% max HP each fight', detail: 'At the start of every fight, your ship repairs 5% of its maximum HP. Scales with your hull, so it keeps mattering as you go deeper.', effect: { kind: 'startOfFightHealPct', pctMax: 0.05 } },
    { desc: 'Heal 9% max HP each fight', detail: 'At the start of every fight, your ship repairs 9% of its maximum HP.', effect: { kind: 'startOfFightHealPct', pctMax: 0.09 } },
    { desc: 'Heal 14% max HP each fight', detail: 'At the start of every fight, your ship repairs 14% of its maximum HP.', effect: { kind: 'startOfFightHealPct', pctMax: 0.14 } },
  ] },
  { id: 'ghostward', name: 'Ghostward', flavor: 'Salt and cold iron at the rails. The drowned aim wide.', tiers: [
    { desc: 'Enemies crit 12% less', detail: 'Enemies are 12% less likely to land a critical hit on you.', effect: { kind: 'incomingCritReduction', chance: 0.12 } },
    { desc: 'Enemies crit 24% less', detail: 'Enemies are 24% less likely to land a critical hit on you.', effect: { kind: 'incomingCritReduction', chance: 0.24 } },
    { desc: 'Enemies crit 40% less', detail: 'Enemies are 40% less likely to land a critical hit on you.', effect: { kind: 'incomingCritReduction', chance: 0.40 } },
  ] },
  // ── RARE ───────────────────────────────────────────────────────────────────
  { id: 'cold_fury', name: 'Cold Fury', flavor: 'When the shot lands true, it lands like the deep itself.', rarity: 'rare', tiers: [
    { desc: '+17% critical damage', detail: 'Your critical hits deal 17% more damage. Stacks with Wide Sights / Dead-Eye landing more crits in the first place.', effect: { kind: 'critDmgMult', mult: 1.17 } },
    { desc: '+35% critical damage', detail: 'Your critical hits deal 35% more damage.', effect: { kind: 'critDmgMult', mult: 1.35 } },
    { desc: '+52% critical damage', detail: 'Your critical hits deal 52% more damage.', effect: { kind: 'critDmgMult', mult: 1.52 } },
  ] },
  { id: 'giant_killer', name: 'Giant-Killer', flavor: 'The bigger the hull, the more of it to hit.', rarity: 'rare', tiers: [
    { desc: '+17% boss damage', detail: 'Deal 17% more damage to boss-depth ships. Regular enemies are unaffected.', effect: { kind: 'bossDamageMult', mult: 1.17 } },
    { desc: '+33% boss damage', detail: 'Deal 33% more damage to boss-depth ships. Regular enemies are unaffected.', effect: { kind: 'bossDamageMult', mult: 1.33 } },
    { desc: '+48% boss damage', detail: 'Deal 48% more damage to boss-depth ships. Regular enemies are unaffected.', effect: { kind: 'bossDamageMult', mult: 1.48 } },
  ] },
  { id: 'spiteful_wake', name: 'Spiteful Wake', flavor: 'Strike the hull and the hull strikes back — and slip its shot and the sea flings your spite anyway.', rarity: 'rare', tiers: [
    { desc: 'Enemies take back 12% of hits on you (10% if you dodge)', detail: 'Whenever an enemy hits you, it takes 12% of that damage right back. And when you DODGE a shot, the enemy still takes 10% of the damage it WOULD have dealt — so you punish them whether the hit lands or not.', effect: { kind: 'retaliatePct', pct: 0.12, dodgePct: 0.10 } },
    { desc: 'Enemies take back 22% of hits on you (14% if you dodge)', detail: 'Enemies take back 22% of any hit they land on you, and 14% of any shot you dodge.', effect: { kind: 'retaliatePct', pct: 0.22, dodgePct: 0.14 } },
    { desc: 'Enemies take back 32% of hits on you (18% if you dodge)', detail: 'Enemies take back 32% of any hit they land on you, and 18% of any shot you dodge.', effect: { kind: 'retaliatePct', pct: 0.32, dodgePct: 0.18 } },
  ] },
  { id: 'wounded_fury', name: 'Wounded Fury', flavor: 'The closer to sinking, the harder your guns bite.', rarity: 'rare', tiers: [
    { desc: 'Up to +17% damage as HP drops', detail: 'Your shots hit harder the lower your HP, scaling with missing health. At full HP nothing; right at the brink, +17%.', effect: { kind: 'lowHpDamage', maxBonus: 0.17 } },
    { desc: 'Up to +35% damage as HP drops', detail: 'Your shots hit harder the lower your HP, scaling with missing health. At full HP nothing; right at the brink, +35%.', effect: { kind: 'lowHpDamage', maxBonus: 0.35 } },
    { desc: 'Up to +52% damage as HP drops', detail: 'Your shots hit harder the lower your HP, scaling with missing health. At full HP nothing; right at the brink, +52%.', effect: { kind: 'lowHpDamage', maxBonus: 0.52 } },
  ] },
  // ── Momentum — damage that FEEDS on the run: kills stacked, depth dared,
  //    and clean crits chained. Each rewards a different way of pushing.
  { id: 'rising_tide', name: 'Rising Tide', flavor: 'Every hull you send down feeds the swell behind you.', rarity: 'rare', tiers: [
    { desc: '+3% damage per enemy sunk (max +24%)', detail: 'Every enemy you sink this run permanently raises your damage by 3%, up to +24%. Counts every hull you have already sunk, and bosses count too. It never resets — the deeper you fight, the harder you hit.', effect: { kind: 'killStackDamage', perKill: 0.03, maxBonus: 0.24 } },
    { desc: '+4% damage per enemy sunk (max +36%)', detail: 'Every enemy you sink this run permanently raises your damage by 4%, up to +36%. Counts hulls already sunk and bosses. Never resets.', effect: { kind: 'killStackDamage', perKill: 0.04, maxBonus: 0.36 } },
    { desc: '+5% damage per enemy sunk (max +45%)', detail: 'Every enemy you sink this run permanently raises your damage by 5%, up to +45%. Counts hulls already sunk and bosses. Never resets.', effect: { kind: 'killStackDamage', perKill: 0.05, maxBonus: 0.45 } },
  ] },
  { id: 'abyssal_bounty', name: 'Abyssal Bounty', flavor: 'The pressure of the deep loads every gun.', rarity: 'rare', tiers: [
    { desc: '+1.2% damage per depth (max +18%)', detail: 'Your damage rises with how deep you are — 1.2% for every depth you have reached, up to +18%. It scales live as you descend, and is full value the moment you take it.', effect: { kind: 'depthScaleDamage', perDepth: 0.012, maxBonus: 0.18 } },
    { desc: '+1.8% damage per depth (max +28%)', detail: 'Your damage rises with how deep you are — 1.8% for every depth reached, up to +28%. Scales live as you descend.', effect: { kind: 'depthScaleDamage', perDepth: 0.018, maxBonus: 0.28 } },
    { desc: '+2.4% damage per depth (max +38%)', detail: 'Your damage rises with how deep you are — 2.4% for every depth reached, up to +38%. Scales live as you descend.', effect: { kind: 'depthScaleDamage', perDepth: 0.024, maxBonus: 0.38 } },
  ] },
  { id: 'cannonade', name: 'Cannonade', flavor: 'Land them clean and the guns never cool.', rarity: 'rare', tiers: [
    { desc: '+6% damage per crit in a row (up to +30%)', detail: 'Every critical hit you land in a row adds +6% damage, stacking up to +30%. Landing any shot that is NOT a crit resets the streak to zero, and the streak starts fresh each fight.', effect: { kind: 'critStreakDamage', perStack: 0.06, maxStacks: 5 } },
    { desc: '+8% damage per crit in a row (up to +40%)', detail: 'Every critical hit in a row adds +8% damage, stacking up to +40%. Any non-crit shot resets the streak; it starts fresh each fight.', effect: { kind: 'critStreakDamage', perStack: 0.08, maxStacks: 5 } },
    { desc: '+10% damage per crit in a row (up to +60%)', detail: 'Every critical hit in a row adds +10% damage, stacking up to +60%. Any non-crit shot resets the streak; it starts fresh each fight.', effect: { kind: 'critStreakDamage', perStack: 0.10, maxStacks: 6 } },
  ] },
  { id: 'counter_battery', name: 'Counter-Battery', flavor: 'Answer their broadside with yours — and let the sea swallow theirs.', rarity: 'rare', tiers: [
    { desc: '20% to cancel their shot when you both fire', detail: 'When you Fire, Volley or Mega on the same turn the enemy fires or volleys AND your shot lands, you have a 20% chance to smash their shot out of the air — their attack is fully negated while yours still hits. A whiffed aim does not count.', effect: { kind: 'counterFireChance', chance: 0.20 } },
    { desc: '32% to cancel their shot when you both fire', detail: 'When you Fire, Volley or Mega on the same turn the enemy fires or volleys and your shot lands, you have a 32% chance to negate their attack while yours still hits.', effect: { kind: 'counterFireChance', chance: 0.32 } },
    { desc: '45% to cancel their shot when you both fire', detail: 'When you Fire, Volley or Mega on the same turn the enemy fires or volleys and your shot lands, you have a 45% chance to negate their attack while yours still hits.', effect: { kind: 'counterFireChance', chance: 0.45 } },
  ] },
  // ── Elemental builds — lean a run into ICE (control + shatter) or FIRE
  //    (stacking DoT). Each grants its proc chance ON ITS OWN, so you can take
  //    it without the matching cannonball; with the cannonball the chances stack
  //    but RaidCombat caps the total at 20% so a specialist gets DEADLIER procs,
  //    not infinitely more frequent ones. Higher tiers add signature levers.
  { id: 'permafrost', name: 'Permafrost', flavor: 'The cold off your guns finds the seams in their hull and holds it fast.', rarity: 'rare', tiers: [
    { desc: '10% chance to freeze; frozen ships take +20%', detail: 'Each hit you land has a 10% chance to FREEZE the enemy — it loses its next turn — and you deal 20% more damage to a frozen ship. (Stacks with the Frozen Cannonball item, up to 20% total freeze chance.)', effect: { kind: 'iceAffinity', freezeChance: 0.10, frozenDmgMult: 1.20 } },
    { desc: '15% chance to freeze; frozen ships take +32%', detail: 'Freeze chance rises to 15% and frozen ships take 32% more damage. NEW — Brittle: a critical hit on a frozen ship shatters the ice for DOUBLE the frozen bonus.', effect: { kind: 'iceAffinity', freezeChance: 0.15, frozenDmgMult: 1.32, brittle: true } },
    { desc: '20% chance to freeze for 2 turns; frozen ships take +42%', detail: 'Freeze chance rises to 20%, frozen ships take 42% more, and Brittle stays. NEW — Deep Freeze: your freezes now last TWO skipped turns instead of one.', effect: { kind: 'iceAffinity', freezeChance: 0.20, frozenDmgMult: 1.42, brittle: true, deepFreeze: true } },
  ] },
  { id: 'wildfire', name: 'Wildfire', flavor: 'You set the sea alight and let it do the work the guns started.', rarity: 'rare', tiers: [
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
  { id: 'deep_hull', name: 'Deep Hull', flavor: 'The pressure of the deep packs your timbers tighter the further you fall.', rarity: 'rare', tiers: [
    { desc: '+0.8% max HP per depth (max +14%)', detail: 'Your maximum HP grows with how deep you are — 0.8% for every depth reached, up to +14%. It scales live as you descend, and each increase is healed to you.', effect: { kind: 'maxHpPerDepth', perDepth: 0.008, max: 0.14 } },
    { desc: '+1.6% max HP per depth (max +30%)', detail: 'Your maximum HP grows 1.6% for every depth reached, up to +30%. Scales live as you descend; each increase heals you by that much.', effect: { kind: 'maxHpPerDepth', perDepth: 0.016, max: 0.30 } },
    { desc: '+2.4% max HP per depth (max +48%)', detail: 'Your maximum HP grows 2.4% for every depth reached, up to +48%. Scales live as you descend; each increase heals you by that much.', effect: { kind: 'maxHpPerDepth', perDepth: 0.024, max: 0.48 } },
  ] },
  { id: 'salvage_hull', name: 'Salvage Hull', flavor: 'Every wreck you leave, your crew strips for plating.', rarity: 'rare', tiers: [
    { desc: '+0.6% max HP per hull sunk (max +12%)', detail: 'Every enemy you sink this run permanently raises your maximum HP by 0.6%, up to +12%. Bosses count, it never resets, and each gain is healed to you.', effect: { kind: 'maxHpPerKill', perKill: 0.006, max: 0.12 } },
    { desc: '+1.2% max HP per hull sunk (max +26%)', detail: 'Every hull sunk raises your maximum HP by 1.2%, up to +26%. Never resets; each gain heals you by that much.', effect: { kind: 'maxHpPerKill', perKill: 0.012, max: 0.26 } },
    { desc: '+1.8% max HP per hull sunk (max +42%)', detail: 'Every hull sunk raises your maximum HP by 1.8%, up to +42%. Never resets; each gain heals you by that much.', effect: { kind: 'maxHpPerKill', perKill: 0.018, max: 0.42 } },
  ] },
  { id: 'reinforced_hull', name: 'Reinforced Hull', flavor: 'Double plate along the keel. More ship to sink.', rarity: 'rare', tiers: [
    { desc: '+8% max HP', detail: 'Your maximum HP is 8% higher for the rest of the run. It also makes every heal and shield that scales off your max HP bigger.', effect: { kind: 'maxHpMult', mult: 1.08 } },
    { desc: '+20% max HP', detail: 'Your maximum HP is 20% higher for the rest of the run.', effect: { kind: 'maxHpMult', mult: 1.20 } },
    { desc: '+36% max HP', detail: 'Your maximum HP is 36% higher for the rest of the run.', effect: { kind: 'maxHpMult', mult: 1.36 } },
  ] },
  // ── LEGENDARY (rare; bigger, one-of-a-kind effects, fewer tiers) ────────────
  { id: 'executioner', name: 'Executioner', flavor: "Below a certain mark, a hull is already gone — it just doesn't know it yet.", rarity: 'legendary', tiers: [
    { desc: 'Sink enemies below 5% HP', detail: 'The instant any hit drops an enemy to 5% of its health or lower, it is sunk outright — no need to chip out the last sliver.', effect: { kind: 'executeThreshold', pct: 0.05 } },
    { desc: 'Sink enemies below 8% HP', detail: 'The instant any hit drops an enemy to 8% of its health or lower, it is sunk outright.', effect: { kind: 'executeThreshold', pct: 0.08 } },
  ] },
  { id: 'leviathans_hunger', name: "Leviathan's Hunger", flavor: 'Every wound you open, the deep drinks — and feeds it back to your hull.', rarity: 'legendary', tiers: [
    { desc: 'Heal 10% of the damage you deal', detail: 'Whenever you damage an enemy, your ship heals for 10% of that damage — the harder you hit, the more you heal. (A single hit can heal at most 20% of your max HP.)', effect: { kind: 'lifestealPct', pct: 0.10 } },
    { desc: 'Heal 15% of the damage you deal', detail: 'Whenever you damage an enemy, your ship heals for 15% of that damage. (A single hit can heal at most 20% of your max HP.)', effect: { kind: 'lifestealPct', pct: 0.15 } },
  ] },
  { id: 'powder_hoard', name: 'Powder Hoard', flavor: "Whatever your crew doesn't spend, they keep racked for the next hull.", rarity: 'legendary', tiers: [
    { desc: 'Carry up to 2 cannonballs over', detail: 'Cannonballs you leave unfired when a fight ends carry into the next one, up to 2 of them.', effect: { kind: 'chargeCarryover', cap: 2 } },
    { desc: 'Carry all cannonballs over', detail: 'Every cannonball you leave unfired when a fight ends carries into the next one, up to your full magazine.', effect: { kind: 'chargeCarryover', cap: 99 } },
  ] },
  { id: 'stormward', name: 'Stormward', flavor: 'A ward of cold iron reforms before every gun. It eats the first blows so your hull never feels them.', rarity: 'legendary', tiers: [
    { desc: 'Shield 10% of max HP each fight', detail: 'Start every fight with a shield worth 10% of your max HP. It soaks incoming damage before your hull takes any, and reforms fresh each fight.', effect: { kind: 'fightShield', pctMax: 0.10 } },
    { desc: 'Shield 18% of max HP each fight', detail: 'Start every fight with a shield worth 18% of your max HP. It soaks incoming damage before your hull takes any, and reforms fresh each fight.', effect: { kind: 'fightShield', pctMax: 0.18 } },
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
export function drawBoons(n: number, owned: Record<string, number> = {}, luckMult = 1, commonSkew = 0): BoonOffer[] {
  const avail = GAUNTLET_BOONS
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
}

export const CONFLUENCES: Confluence[] = [
  {
    id: 'thermal_shock',
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
    id: 'untouchable',
    name: 'Untouchable',
    requires: [{ boonId: 'following_sea' }, { boonId: 'ghostward' }],
    flavor: 'You are never where the shot lands, and the wind hands you back your powder.',
    detail: 'Your dodges succeed more often, and every enemy shot you successfully slip loads free cannonball(s) into your magazine — dodging becomes offense, not just survival.',
    levels: [
      { desc: 'Dodges succeed +8% more; slipping a shot loads 1 free cannonball', effects: [{ kind: 'dodgeRefund', charges: 1 }, { kind: 'dodgeBonus', chance: 0.08, scope: 'allRemaining' }] },
      { desc: 'Dodges succeed +16% more; slipping a shot loads 1 free cannonball', effects: [{ kind: 'dodgeRefund', charges: 1 }, { kind: 'dodgeBonus', chance: 0.16, scope: 'allRemaining' }] },
      { desc: 'Dodges succeed +24% more; slipping a shot loads 2 free cannonballs', effects: [{ kind: 'dodgeRefund', charges: 2 }, { kind: 'dodgeBonus', chance: 0.24, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'iron_tempest',
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
export function eligibleConfluences(owned: Record<string, number>, taken: string[] = []): Confluence[] {
  const t = new Set(taken)
  return CONFLUENCES.filter(c => !t.has(c.id) && confluenceLevel(c, owned) >= 1)
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
export function drawConfluenceOffer(owned: Record<string, number>, taken: string[] = [], offered: Set<string> = new Set(), offerMult = 1): ConfluenceOffer | null {
  // No Communion (a signed Term): offerMult 0 switches synergies off entirely —
  // you can hold both halves and never be offered the confluence.
  if (offerMult <= 0) return null
  const pool = eligibleConfluences(owned, taken)
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
export function bandForDepth(depth: number): DepthBand {
  let band = DEPTH_BANDS[0]
  for (const b of DEPTH_BANDS) if (depth >= b.minDepth) band = b
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
