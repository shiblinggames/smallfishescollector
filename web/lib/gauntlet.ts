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
import { AFFIXES, ELITE_HP_MULT, ELITE_DMG_MULT, rollAffix, type AffixDef } from './raidAffixes'
import { type TideEffect } from './tides'

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
// Launch is ADMIN-ONLY: flip HARDCORE_LIVE to open it to everyone (mirrors the
// Chapter 3 rollout). Until then non-admins see a "Coming Soon" tease. The
// server enforces this in startGauntletRun, so the action can't be forced.
export const HARDCORE_LIVE = false
// Player-facing unlock once HARDCORE_LIVE: needs the Gauntlet unlocked AND a
// normal-Gauntlet depth floor, so newcomers can't blind-permakill their crew.
export const HC_UNLOCK_DEPTH = 5
// Hardcore is limited to ONE run per day (the normal Gauntlet has no cooldown).
// Keyed off gauntlet_hc_last_run_at; admins bypass for testing.
export const HARDCORE_COOLDOWN_MS = 24 * 60 * 60 * 1000
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
/** Blood Gems earned on a Hardcore cash-out at `depth`. `rand` ∈ [0,1) — pass
 *  Math.random() at the callsite so the amount is a live server roll (~0.5–0.7
 *  per depth). */
export function bloodGemsForDepth(depth: number, rand: number): number {
  const per = BLOOD_GEM_MIN_PER_DEPTH + (BLOOD_GEM_MAX_PER_DEPTH - BLOOD_GEM_MIN_PER_DEPTH) * rand
  return Math.max(0, Math.round(Math.max(0, depth) * per))
}
/** Skin gamble: this many Blood Gems → one random UNOWNED non-legendary skin. */
export const BLOOD_SKIN_GAMBLE_COST = 150
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
// permanently grants a Drowned Fleet ship skin (see lib/shipSkins). Mirrors
// GAUNTLET_DEPTH_UNLOCKS but grants a skin id. Placeholder art until real PNGs.
export interface HardcoreUnlock {
  depth: number
  skinId: string
  name: string
}
export const HARDCORE_UNLOCKS: HardcoreUnlock[] = [
  { depth: 8,  skinId: 'drowned_hull',   name: 'Drowned Hull' },
  { depth: 15, skinId: 'wraith_hull',    name: 'Wraith Hull' },
  { depth: 25, skinId: 'leviathans_maw_hull', name: "Leviathan's Maw Hull" },
]

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
const BOSS_HP_MULT  = 2.8
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
export function generateFight(state: GauntletRollState, skipOffset = 0): GauntletFight {
  const rewardDepth = state.cleared + 1
  const depth = rewardDepth + skipOffset

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
    return { enemy, isBoss: true, isElite: false, potContribution: roundContribution(rewardDepth, true), depth }
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
  return { enemy, isBoss: false, isElite, affix, potContribution: roundContribution(rewardDepth, false), depth }
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
export function chestForDepth(depth: number): ChestTier {
  let chest = CHEST_TIERS[0]
  for (const c of CHEST_TIERS) if (depth >= c.minDepth) chest = c
  return chest
}

// Per-chest-tier drop chance for EACH of Davy's two chest cannons (rolled
// independently, only for cannons you don't already own). Super low at the
// shallow chests — possible only if you're very lucky — climbing up the ladder
// so deep runs are the real way to chase them.
// 2026-07-02: pulled the top tiers DOWN. Deep (depth 18+ / tier-5) dives became
// routine once the shrine + confluences shipped, so 11%/cannon collected both
// (→ the Grand Cannon) in ~14 dives (~2 weeks daily). Now ~5% at tier 5 → ~30
// deep dives to collect both, a real capstone chase again. Was 0.5/1.5/3/6/11%.
const CHEST_CANNON_ODDS: Record<number, number> = {
  1: 0.005, // Waterlogged Chest
  2: 0.01,  // Barnacled Strongbox
  3: 0.02,  // Drowned Hoard
  4: 0.03,  // Leviathan's Cache
  5: 0.05,  // Davy Jones' Locker
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
    id: 'racing_tide',
    name: 'Racing Tide',
    flavor: 'A fast current rips down the deck. The wheel will not hold still.',
    tiers: [
      { desc: 'Your aim needle sweeps faster', detail: 'Your aiming needle whips back and forth far quicker for the rest of the run, so the window to lock a clean shot is much tighter.', effects: [{ kind: 'aimSpeedMult', mult: 1.6 }] },
      { desc: 'Your aim needle tears across the bar', detail: 'The current rips harder. Your needle blurs back and forth, leaving a razor-thin window to lock anything clean.', effects: [{ kind: 'aimSpeedMult', mult: 2.2 }] },
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
    name: 'False Colours',
    flavor: 'The drowned fly colours that are not their own. Half the targets out there are lies.',
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
export function isCurseDepth(depth: number): boolean {
  const last = CURSE_DEPTHS[CURSE_DEPTHS.length - 1]
  return CURSE_DEPTHS.includes(depth) || (depth > last && (depth - last) % CURSE_INTERVAL === 0)
}

/** Pick the next curse the Locker imposes. Eligible = a fresh tier-1 curse you
 *  don't have, OR (from CURSE_TIER2_DEPTH on) a tier-2 deepening of one you do.
 *  Uniform random among eligible; null if none remain. */
export function drawCurse(curseTiers: Record<string, number>, depth: number): CurseOffer | null {
  const eligible = GAUNTLET_CURSES
    .map(c => ({ c, next: (curseTiers[c.id] ?? 0) + 1 }))
    .filter(x => x.next <= x.c.tiers.length && (x.next === 1 || depth >= CURSE_TIER2_DEPTH))
  if (eligible.length === 0) return null
  const { c, next } = eligible[Math.floor(Math.random() * eligible.length)]
  const t = c.tiers[next - 1]
  return { id: c.id, name: c.name, flavor: c.flavor, tier: next, desc: t.desc, detail: t.detail, effects: t.effects, hpDrainPct: t.hpDrainPct, silenceCrew: t.silenceCrew, isUpgrade: next > 1 }
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

/** Roman tier marker for curse chips ('' for tier 1, 'II' for tier 2). */
export function curseTierLabel(tier: number): string { return tier >= 2 ? 'II' : '' }

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

/** Per-rarity draft WEIGHT (relative odds of being offered) + display colour +
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
    { desc: '+12% all damage', detail: 'Every shot deals 12% more damage — both the single-shot Fire action and the Volley.', effect: { kind: 'damageMult', mult: 1.12 } },
    { desc: '+26% all damage', detail: 'Every shot deals 26% more damage — both the single-shot Fire action and the Volley.', effect: { kind: 'damageMult', mult: 1.26 } },
    { desc: '+42% all damage', detail: 'Every shot deals 42% more damage — both the single-shot Fire action and the Volley.', effect: { kind: 'damageMult', mult: 1.42 } },
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
    { desc: '+8% crit on clean hits', detail: 'Each clean hit (a green-zone landing, not the gold band) has an extra 8% chance to upgrade into a critical — your way to crit even when you miss the gold. Grazes and shots that already crit are unaffected.', effect: { kind: 'critChanceBonus', chance: 0.08 } },
    { desc: '+16% crit on clean hits', detail: 'Each clean hit (a green-zone landing, not the gold band) has an extra 16% chance to upgrade into a critical — your way to crit even when you miss the gold. Grazes and shots that already crit are unaffected.', effect: { kind: 'critChanceBonus', chance: 0.16 } },
    { desc: '+26% crit on clean hits', detail: 'Each clean hit (a green-zone landing, not the gold band) has an extra 26% chance to upgrade into a critical — your way to crit even when you miss the gold. Grazes and shots that already crit are unaffected.', effect: { kind: 'critChanceBonus', chance: 0.26 } },
  ] },
  { id: 'wide_sights', name: 'Wide Sights', flavor: 'The perfect shot stops being luck.', tiers: [
    { desc: 'Bigger crit zone', detail: 'The gold "perfect shot" band on your aim bar is 12% wider, so landing a crit is easier.', effect: { kind: 'critZoneScale', mult: 1.12 } },
    { desc: 'Much bigger crit zone', detail: 'The gold "perfect shot" band on your aim bar is 26% wider.', effect: { kind: 'critZoneScale', mult: 1.26 } },
    { desc: 'Huge crit zone', detail: 'The gold "perfect shot" band on your aim bar is 42% wider.', effect: { kind: 'critZoneScale', mult: 1.42 } },
  ] },
  { id: 'ironhide', name: 'Ironhide', flavor: 'Plates doubled along the waterline.', rarity: 'rare', tiers: [
    { desc: 'Take 12% less damage', detail: 'Every hit an enemy lands on you deals 12% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.88, scope: 'allRemaining' } },
    { desc: 'Take 22% less damage', detail: 'Every hit an enemy lands on you deals 22% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.78, scope: 'allRemaining' } },
    { desc: 'Take 34% less damage', detail: 'Every hit an enemy lands on you deals 34% less damage for the rest of the run.', effect: { kind: 'incomingDmgMult', mult: 0.66, scope: 'allRemaining' } },
  ] },
  { id: 'press_the_powder', name: 'Press the Powder', flavor: 'Your crew loads like the deep is at their heels.', tiers: [
    { desc: 'Reloads can load extra', detail: 'Each reload has a 10% chance to chamber an extra cannonball on top.', effect: { kind: 'reloadProc', chance: 0.10, bonusCharges: 1 } },
    { desc: 'Reloads often load extra', detail: 'Each reload has a 22% chance to chamber an extra cannonball on top.', effect: { kind: 'reloadProc', chance: 0.22, bonusCharges: 1 } },
    { desc: 'Reloads frequently load extra', detail: 'Each reload has a 36% chance to chamber an extra cannonball on top.', effect: { kind: 'reloadProc', chance: 0.36, bonusCharges: 1 } },
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
  { id: 'spiteful_wake', name: 'Spiteful Wake', flavor: 'Strike the hull and the hull strikes back. The sea keeps its debts.', rarity: 'rare', tiers: [
    { desc: 'Reflect 8% of damage taken', detail: 'When an enemy lands a hit on you, it takes 8% of that damage straight back into its own hull.', effect: { kind: 'retaliatePct', pct: 0.08 } },
    { desc: 'Reflect 16% of damage taken', detail: 'When an enemy lands a hit on you, it takes 16% of that damage straight back into its own hull.', effect: { kind: 'retaliatePct', pct: 0.16 } },
    { desc: 'Reflect 25% of damage taken', detail: 'When an enemy lands a hit on you, it takes 25% of that damage straight back into its own hull.', effect: { kind: 'retaliatePct', pct: 0.25 } },
  ] },
  { id: 'wounded_fury', name: 'Wounded Fury', flavor: 'The closer to sinking, the harder your guns bite.', rarity: 'rare', tiers: [
    { desc: 'Up to +17% damage as HP drops', detail: 'Your shots hit harder the lower your HP, scaling with missing health. At full HP nothing; right at the brink, +17%.', effect: { kind: 'lowHpDamage', maxBonus: 0.17 } },
    { desc: 'Up to +35% damage as HP drops', detail: 'Your shots hit harder the lower your HP, scaling with missing health. At full HP nothing; right at the brink, +35%.', effect: { kind: 'lowHpDamage', maxBonus: 0.35 } },
    { desc: 'Up to +52% damage as HP drops', detail: 'Your shots hit harder the lower your HP, scaling with missing health. At full HP nothing; right at the brink, +52%.', effect: { kind: 'lowHpDamage', maxBonus: 0.52 } },
  ] },
  // ── Elemental builds — lean a run into ICE (control + shatter) or FIRE
  //    (stacking DoT). Each grants its proc chance ON ITS OWN, so you can take
  //    it without the matching cannonball; with the cannonball the chances stack
  //    but RaidCombat caps the total at 20% so a specialist gets DEADLIER procs,
  //    not infinitely more frequent ones. Higher tiers add signature levers.
  { id: 'permafrost', name: 'Permafrost', flavor: 'The cold off your guns finds the seams in their hull and holds it fast.', rarity: 'rare', tiers: [
    { desc: '10% freeze, +20% vs frozen', detail: 'Each hit has a 10% chance to freeze the enemy (it loses its next turn), and you deal 20% more damage to a frozen hull. Stacks with the Frozen Cannonball, capped at 20% total freeze.', effect: { kind: 'iceAffinity', freezeChance: 0.10, frozenDmgMult: 1.20 } },
    { desc: '15% freeze, +32% vs frozen, Brittle', detail: 'Freeze chance 15%, +32% damage to frozen hulls. BRITTLE: a critical hit on a frozen enemy shatters it for DOUBLE the frozen bonus.', effect: { kind: 'iceAffinity', freezeChance: 0.15, frozenDmgMult: 1.32, brittle: true } },
    { desc: '20% freeze (2 turns), +42% vs frozen, Brittle', detail: 'Freeze chance 20% and +42% damage to frozen hulls, with Brittle. DEEP FREEZE: your freezes now last TWO skipped turns instead of one.', effect: { kind: 'iceAffinity', freezeChance: 0.20, frozenDmgMult: 1.42, brittle: true, deepFreeze: true } },
  ] },
  { id: 'wildfire', name: 'Wildfire', flavor: 'You set the sea alight and let it do the work the guns started.', rarity: 'rare', tiers: [
    { desc: '10% burn, 3 turns, ticks 13% of hit', detail: 'Each hit has a 10% chance to set the enemy ablaze. Your burns last 3 turns (one longer than normal) and each tick deals 13% of the hit that lit it (up from the base 10%). Stacks with the Incendiary Cannonball, capped at 20% total burn chance.', effect: { kind: 'fireAffinity', burnChance: 0.10, burnTurnsBonus: 1, burnTickMult: 1.3 } },
    { desc: '15% burn, ticks 16%, Reignite', detail: 'Burn chance 15%, ticks deal 16% of the hit. REIGNITE: hitting an already-burning enemy refreshes the burn back to full duration, so you can keep the fire going as long as you keep landing shots.', effect: { kind: 'fireAffinity', burnChance: 0.15, burnTurnsBonus: 1, burnTickMult: 1.6, reignite: true } },
    { desc: '20% burn, 4 turns, ticks 20% (max), Reignite + Backdraft', detail: 'Burn chance 20%, burns last 4 turns and each tick deals 20% of the hit (the burn ceiling), with Reignite. BACKDRAFT: while a hull burns, the flames keep flaring — each burn tick has a chance to erupt for a bonus burst, so the longer you keep it cooking (with Reignite) the more it goes off.', effect: { kind: 'fireAffinity', burnChance: 0.20, burnTurnsBonus: 2, burnTickMult: 2.0, reignite: true, backdraft: true } },
  ] },
  // ── LEGENDARY (rare; bigger, one-of-a-kind effects, fewer tiers) ────────────
  { id: 'executioner', name: 'Executioner', flavor: "Below a certain mark, a hull is already gone — it just doesn't know it yet.", rarity: 'legendary', tiers: [
    { desc: 'Sink enemies below 5% HP', detail: 'The instant any hit drops an enemy to 5% of its health or lower, it is sunk outright — no need to chip out the last sliver.', effect: { kind: 'executeThreshold', pct: 0.05 } },
    { desc: 'Sink enemies below 8% HP', detail: 'The instant any hit drops an enemy to 8% of its health or lower, it is sunk outright.', effect: { kind: 'executeThreshold', pct: 0.08 } },
  ] },
  { id: 'leviathans_hunger', name: "Leviathan's Hunger", flavor: 'Every wound you open, the deep drinks — and feeds it back to your hull.', rarity: 'legendary', tiers: [
    { desc: 'Heal 10% of damage dealt', detail: 'Whenever you damage an enemy, your ship repairs 10% of that damage. Sustain that climbs with how hard you hit.', effect: { kind: 'lifestealPct', pct: 0.10 } },
    { desc: 'Heal 15% of damage dealt', detail: 'Whenever you damage an enemy, your ship repairs 15% of that damage.', effect: { kind: 'lifestealPct', pct: 0.15 } },
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

// Depths at which the player drafts a boon — offset from CURSE_DEPTHS so the
// descent alternates gift and toll. PAST the fixed schedule the cadence
// CONTINUES every BOON_INTERVAL depths (isBoonDepth); drawBoons returns [] once
// every family is maxed, and the caller falls through to the breather.
export const BOON_DEPTHS = [2, 5, 8, 11, 14, 17, 20, 23]
const BOON_INTERVAL = 3

/** Is `depth` a boon draft? Fixed early schedule, then every BOON_INTERVAL
 *  depths forever after, so deep runs keep drafting (until the pool is maxed). */
export function isBoonDepth(depth: number): boolean {
  const last = BOON_DEPTHS[BOON_DEPTHS.length - 1]
  return BOON_DEPTHS.includes(depth) || (depth > last && (depth - last) % BOON_INTERVAL === 0)
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
export function drawBoons(n: number, owned: Record<string, number> = {}, luckMult = 1): BoonOffer[] {
  const avail = GAUNTLET_BOONS
    .map(fam => ({ fam, next: (owned[fam.id] ?? 0) + 1 }))
    .filter(x => x.next <= x.fam.tiers.length)
  // Diviner's Charm (luckMult > 1) scales up the draft weight of the non-Common
  // rarities, so Rare/Legendary boons surface more often without changing which
  // families exist. luckMult = 1 leaves the base odds untouched.
  const weightFor = (fam: GauntletBoon) => {
    const r = boonRarity(fam)
    return BOON_RARITY_META[r].weight * (r === 'common' ? 1 : luckMult)
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
  /** Effects + summary per confluence level (1..3), index = level - 1. */
  levels: ConfluenceLevel[]
}

export const CONFLUENCES: Confluence[] = [
  {
    id: 'thermal_shock',
    name: 'Thermal Shock',
    requires: [{ boonId: 'permafrost' }, { boonId: 'wildfire' }],
    flavor: 'Ice in the seams, fire on the deck. The hull cracks where the two meet.',
    levels: [
      { desc: 'Frozen + burning hulls shatter for +50%', effects: [{ kind: 'thermalShock', burstMult: 0.50 }] },
      { desc: 'Frozen + burning hulls shatter for +70%', effects: [{ kind: 'thermalShock', burstMult: 0.70 }] },
      { desc: 'Frozen + burning hulls shatter for +95%', effects: [{ kind: 'thermalShock', burstMult: 0.95 }] },
    ],
  },
  {
    id: 'coup_de_grace',
    name: 'Coup de Grâce',
    requires: [{ boonId: 'executioner' }, { boonId: 'cold_fury' }],
    flavor: 'You know the killing mark, and when the shot rings true you find it every time.',
    levels: [
      { desc: 'A crit on a hull below 12% HP sinks it', effects: [{ kind: 'critDmgMult', mult: 1.12 }, { kind: 'critExecute', pct: 0.12 }] },
      { desc: 'A crit on a hull below 16% HP sinks it', effects: [{ kind: 'critDmgMult', mult: 1.18 }, { kind: 'critExecute', pct: 0.16 }] },
      { desc: 'A crit on a hull below 20% HP sinks it', effects: [{ kind: 'critDmgMult', mult: 1.25 }, { kind: 'critExecute', pct: 0.20 }] },
    ],
  },
  {
    id: 'hull_render',
    name: 'Hull Render',
    requires: [{ boonId: 'broadside_mastery' }, { boonId: 'grapeshot' }],
    flavor: 'Every gun on the rail, again and again, until the seams give. The deep loves a drummer.',
    levels: [
      { desc: 'Each Volley this fight hits +12% harder than the last', effects: [{ kind: 'volleyDmgMult', mult: 1.12 }, { kind: 'volleyRamp', perVolley: 0.12 }] },
      { desc: 'Each Volley this fight hits +15% harder than the last', effects: [{ kind: 'volleyDmgMult', mult: 1.18 }, { kind: 'volleyRamp', perVolley: 0.15 }] },
      { desc: 'Each Volley this fight hits +18% harder than the last', effects: [{ kind: 'volleyDmgMult', mult: 1.25 }, { kind: 'volleyRamp', perVolley: 0.18 }] },
    ],
  },
  {
    id: 'reapers_tithe',
    name: "Reaper's Tithe",
    requires: [{ boonId: 'executioner' }, { boonId: 'leviathans_hunger' }],
    flavor: 'Every hull you send down, the deep tithes back to you. Death feeds the killer.',
    levels: [
      { desc: 'Sinking a hull heals you 12% of its max HP', effects: [{ kind: 'executeHeal', pctMaxHp: 0.12 }] },
      { desc: 'Sinking a hull heals you 16% of its max HP', effects: [{ kind: 'executeHeal', pctMaxHp: 0.16 }] },
      { desc: 'Sinking a hull heals you 22% of its max HP', effects: [{ kind: 'executeHeal', pctMaxHp: 0.22 }] },
    ],
  },
  {
    id: 'feed_the_fire',
    name: 'Feed the Fire',
    requires: [{ boonId: 'wildfire' }, { boonId: 'leviathans_hunger' }],
    flavor: 'The flames you set drink from the enemy and pour it into your hull.',
    levels: [
      { desc: 'Burn ticks heal you 50% of the tick', effects: [{ kind: 'burnTickHeal', pctTick: 0.50 }] },
      { desc: 'Burn ticks heal you 75% of the tick', effects: [{ kind: 'burnTickHeal', pctTick: 0.75 }] },
      { desc: 'Burn ticks heal you for the full tick', effects: [{ kind: 'burnTickHeal', pctTick: 1.00 }] },
    ],
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    requires: [{ boonId: 'following_sea' }, { boonId: 'ghostward' }],
    flavor: 'You are never where the shot lands, and the wind hands you back your powder.',
    levels: [
      { desc: 'A successful dodge refunds a cannonball', effects: [{ kind: 'dodgeRefund', charges: 1 }] },
      { desc: 'A dodge refunds a cannonball; +8% dodge', effects: [{ kind: 'dodgeRefund', charges: 1 }, { kind: 'dodgeBonus', chance: 0.08, scope: 'allRemaining' }] },
      { desc: 'A dodge refunds a cannonball; +16% dodge', effects: [{ kind: 'dodgeRefund', charges: 1 }, { kind: 'dodgeBonus', chance: 0.16, scope: 'allRemaining' }] },
    ],
  },
  {
    id: 'iron_tempest',
    name: 'Iron Tempest',
    requires: [{ boonId: 'spiteful_wake' }, { boonId: 'ironhide' }],
    flavor: 'Plate over plate, and every blow that breaks on it is flung back twofold.',
    levels: [
      { desc: 'Your reflected damage hits 1.5× harder', effects: [{ kind: 'retaliateBoost', mult: 1.5 }] },
      { desc: 'Your reflected damage hits 1.9× harder', effects: [{ kind: 'retaliateBoost', mult: 1.9 }] },
      { desc: 'Your reflected damage hits 2.4× harder', effects: [{ kind: 'retaliateBoost', mult: 2.4 }] },
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

/** Confluences the player currently has online (both halves held). */
export function activeConfluences(owned: Record<string, number>): Confluence[] {
  return CONFLUENCES.filter(c => confluenceLevel(c, owned) >= 1)
}

/** The player-facing summary for a confluence at a given level (defaults to its
 *  base/level-1 line, e.g. for the codex when not yet held). */
export function confluenceDescAt(c: Confluence, level: number): string {
  const i = Math.max(1, Math.min(level || 1, c.levels.length)) - 1
  return c.levels[i].desc
}

/** Flattened TideEffects from every active confluence at its CURRENT level —
 *  appended to the boon effects fed into combat. */
export function confluenceEffects(owned: Record<string, number>): TideEffect[] {
  return CONFLUENCES.flatMap(c => {
    const lvl = confluenceLevel(c, owned)
    return lvl >= 1 ? c.levels[lvl - 1].effects : []
  })
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
