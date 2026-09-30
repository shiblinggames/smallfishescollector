// ── THE GAUNTLETS, CORE (Steam prep, 2026-09-29) ──
//
// Davy Jones' Gauntlet and the Don's, with nothing of the web in them: the
// daily gate, the run's checkpoints, pause and resume, Davy's Offer, the cash-
// out and the death, the Locker upgrades, the Shrine's coin, the Fence, the
// tribute, the leaderboard node. Each takes the store (GauntletData) and the
// captain's id. On the web the server actions (raids/gauntlet/actions) check
// the session and hand these the Supabase store; offline, the local save's.
//
// Combat is client-driven (same trust model as every raid). The server:
//   - consumes the daily attempt on START (so a quit-retry can't reroll a
//     bad opener), keyed by a date string on the profile;
//   - on CASH OUT, clamps the reported pot to the depth ceiling, applies the
//     depth-tiered chest multiplier, and banks doubloons / XP / gems;
//   - on DEATH, closes the run and banks nothing.
// The once-a-day gate is the real limiter, so we trust the client's reported
// depth/pot up to the computed ceiling.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; the wallet, badges, anomaly flags and bounty events became store
// operations; the loadout reader takes the store; the clock became clockNow.
// Two fixes rode along (2026-09-29): a hardcore cash-out's faster same-depth
// time and its best-Pressure check both read Davy's hardcore columns on a
// Don's run; they now read the run's own (hcCols).

import { inCaptainsWater, type CaptainWaterRow } from '@/lib/captainWater'
import { GAUNTLET_DAMAGE_MIN } from '@/lib/bounties'
import type { RenownAlloc } from '@/lib/renown'
import { grantXPToSeatedVia, type CrewXPGrant } from '@/lib/crewXPGrant'
import { termPressure, pressureFeats, resolveTerms, getTerm, type SignedTerms } from '@/lib/gauntletTerms'
import { chestLabelFor, MAX_GAUNTLET_DEPTH, GAUNTLET_DEPTH_UNLOCKS, CONFLUENCES, hardcoreUnlocked, donsHardcoreUnlocked, donsGauntletUnlocked, hcCols, HARDCORE_LIVE, HARDCORE_RUNS_PER_DAY, coerceRunStats, chestOdds, type DepthSplit, type GauntletRunSnapshot, type GauntletRunState, type GauntletVariant } from '@/lib/gauntlet'
import { getGauntletUpgrade, isUpgradeComingSoon, isToggleableUpgrade, activeGauntletUpgrades, DONS_DAILY_TRIBUTE_ID, DONS_DAILY_TRIBUTE_AMOUNT } from '@/lib/gauntletUpgrades'
import { DAVY_FORGE } from '@/lib/raidItems'
import { rollOffer, EMPTY_OFFER_STATE, type OfferState, type DavyOffer } from '@/lib/gauntletOffer'
import { GAUNTLET_DEEPEST_CONTEST_ENDS_AT } from '@/lib/contests'
import { getBait } from '@/lib/bait'
import { merchantPrice } from '@/lib/gauntletMerchant'
import { eyeCharge } from '@/lib/finnItems'
import { getRaidPlayerStatsVia } from '@/lib/raidLoadout'
import { raidDamageProfile } from '@/lib/expeditions'
import { clockNow } from '@/lib/clock'
import { tickActiveMs, settleDepths, runFathoms, cashOutHaul, recordClaim, donFeats, gauntletCooldown, shrineWon } from '@/lib/gauntletRules'
import type { GauntletData } from '@/lib/data/gauntletData'
import { distinctIds } from '@/lib/listCounts'

/* eslint-disable @typescript-eslint/no-explicit-any */

const nowIso = () => new Date(clockNow()).toISOString()
const utcDay = (d: Date) => d.toISOString().slice(0, 10)

/** Record a single gauntlet hit; persists the all-time biggest via greatest()
 *  (bump_gauntlet_hit). Fired per new run-best from GauntletGame (win OR loss),
 *  so the Biggest Hit board reflects the largest blow ever landed in a descent. */
export async function recordGauntletHit(db: GauntletData, uid: string, dmg: number): Promise<void> {
  if (!Number.isFinite(dmg) || dmg <= 0) return
  const raw = Math.floor(dmg)

  // ── HELD AGAINST THE LOADOUT, LIKE recordRaidHit ─────────────────────────
  // This fed a gem-paying damage bounty with no ceiling at all. A hit only
  // happens inside an open descent, so one reported outside a run is refused.
  // The ceiling is the loadout's own crit (the same profile recordRaidHit
  // uses) times seven, then widened by the depth reached, because boons stack
  // with every depth: an honest depth-98 run has landed 8x its captain's raid
  // best. At depth 100 the ceiling is 77x the base crit, far above any real
  // hit on record, while a forged number from a fresh run is still bounded.
  const prof = await db.profile(uid, 'gauntlet_max_hit, gauntlet_run_open, gauntlet_run_state')
  if (prof?.gauntlet_run_open !== true) {
    await db.flagAnomaly(uid, 'no_run:recordGauntletHit', 2, { hit: raw })
    return
  }
  const depth = Math.max(0, Math.floor(Number((prof.gauntlet_run_state as GauntletRunState | null)?.cleared ?? 0)))
  const stats = await getRaidPlayerStatsVia(db, uid)
  const { critMax } = raidDamageProfile(stats.totalPower, stats.shipMinDamage, stats.raidMods?.damagePct ?? 0)
  let ceil = critMax * (stats.classDamageMult || 1)
  if (stats.manowarAugment) ceil *= stats.manowarAugment.megaMult
  const clampCeiling = Math.max(500, Math.ceil(ceil)) * 7 * (1 + depth / 10)
  if (raw > clampCeiling) {
    await db.flagAnomaly(uid, 'cap_trip:recordGauntletHit', 3, { hit: raw, clampCeiling, depth })
  }
  const h = Math.floor(Math.min(raw, clampCeiling))

  await db.recordHit(uid, h)
  // The Gauntlet has its own damage ladder, on its own scale: raid hits top out
  // around 760 and a deep descent reaches thousands, so one shared number would
  // be a wall in one place and a formality in the other.
  if (h >= GAUNTLET_DAMAGE_MIN) void db.logBountyEvent(uid, 'gauntlet_hit', h)
  // Also track the lifetime biggest hit on the profile (for the One Shot badge).
  // Conditional on the stored best still being lower, so two hits racing
  // cannot write the smaller one last.
  if (h > ((prof?.gauntlet_max_hit as number | null) ?? 0)) {
    await db.raiseMaxHit(uid, h)
  }
}

/** Sanitize a client-supplied deepest-run snapshot before storing it. It's
 *  display-only and scoped to the player's own profile, so the only real concern
 *  is bounding the size; we stamp the depth + server time ourselves. */
function sanitizeRunSnapshot(snap: unknown, depth: number): GauntletRunSnapshot | null {
  if (!snap || typeof snap !== 'object') return null
  const s = snap as Record<string, unknown>
  const boons  = s.boons  && typeof s.boons  === 'object' ? (s.boons  as Record<string, number>) : {}
  const curses = s.curses && typeof s.curses === 'object' ? (s.curses as Record<string, number>) : {}
  const tides = Array.isArray(s.tides)
    ? (s.tides as unknown[]).slice(0, 40).flatMap(t => {
        if (!t || typeof t !== 'object') return []
        const o = t as Record<string, unknown>
        return typeof o.title === 'string' && typeof o.choice === 'string'
          ? [{ title: o.title.slice(0, 80), choice: o.choice.slice(0, 80) }]
          : []
      })
    : []
  return { depth, boons, curses, tides, stats: coerceRunStats(s.stats), at: nowIso() }
}

// ── Locker Upgrades — permanent perks, depth-gated + bought with Fathoms ───────

export type GauntletUpgradeState = { deepest: number; fathoms: number; owned: string[]; ownedAll: string[]; off: string[]; hasAutoCatcher: boolean; hasAutoCaster: boolean; tributeReady: boolean }
export const NO_UPGRADE_STATE: GauntletUpgradeState = { deepest: 0, fathoms: 0, owned: [], ownedAll: [], off: [], hasAutoCatcher: false, hasAutoCaster: false, tributeReady: false }

/** State for the Locker Upgrades panel: the player's deepest run, Fathoms purse,
 *  and which upgrades they've already claimed. */
export async function getGauntletUpgradeState(db: GauntletData, uid: string, variant: GauntletVariant = 'davy'): Promise<GauntletUpgradeState> {
  const isDon = variant === 'don'
  // Fathoms are the ONE shared purse; the deepest gate + owned/off sets are
  // per-variant (Don's has its own bespoke tree in dons_gauntlet_upgrades).
  const data = await db.profile(uid, 'gauntlet_deepest, dons_gauntlet_deepest, gauntlet_fathoms, gauntlet_upgrades, gauntlet_upgrades_off, dons_gauntlet_upgrades, dons_gauntlet_upgrades_off, has_auto_catcher, has_auto_caster, dons_stipend_claimed_at')
  const davyOwned = (data?.gauntlet_upgrades as string[] | null) ?? []
  const donOwned = (data?.dons_gauntlet_upgrades as string[] | null) ?? []
  const ownedAll = [...davyOwned, ...donOwned]
  return {
    deepest: ((isDon ? data?.dons_gauntlet_deepest : data?.gauntlet_deepest) as number | null) ?? 0,
    fathoms: (data?.gauntlet_fathoms as number | null) ?? 0,
    owned: isDon ? donOwned : davyOwned,
    // Union across BOTH Lockers — for cross-Locker prereqs (a Don's upgrade that
    // requires a Davy's one) the Card checks ownership here.
    ownedAll,
    off: ((isDon ? data?.dons_gauntlet_upgrades_off : data?.gauntlet_upgrades_off) as string[] | null) ?? [],
    hasAutoCatcher: data?.has_auto_catcher === true,
    hasAutoCaster: data?.has_auto_caster === true,
    // The Don's Tribute — owned AND not yet collected on this UTC day.
    tributeReady: ownedAll.includes(DONS_DAILY_TRIBUTE_ID) && !stipendClaimedToday(data?.dons_stipend_claimed_at as string | null),
  }
}

/** True if the daily tribute was already claimed on the current UTC day. */
function stipendClaimedToday(claimedAt: string | null | undefined): boolean {
  if (!claimedAt) return false
  return utcDay(new Date(claimedAt)) === utcDay(new Date(clockNow()))
}

/** Claim The Don's Tribute — a free 10 Fathoms, once per UTC day, for owners of
 *  the dg_daily_tribute Locker perk. Server-authoritative: validates ownership
 *  and the once-a-day gate, then credits the shared Fathoms purse. */
export async function claimDailyTribute(db: GauntletData, uid: string): Promise<{ ok: true; fathoms: number } | { error: string }> {
  const profile = await db.profile(uid, 'gauntlet_upgrades, dons_gauntlet_upgrades, dons_stipend_claimed_at')
  if (!profile) return { error: 'Profile not found.' }
  const ownedAll = [
    ...((profile.gauntlet_upgrades as string[] | null) ?? []),
    ...((profile.dons_gauntlet_upgrades as string[] | null) ?? []),
  ]
  if (!ownedAll.includes(DONS_DAILY_TRIBUTE_ID)) return { error: 'You haven’t earned the Don’s Tribute.' }
  if (stipendClaimedToday(profile.dons_stipend_claimed_at as string | null)) return { error: 'You’ve already collected today’s tribute. Back tomorrow.' }

  // STAMP FIRST, conditionally: only a stamp that is still from before today's
  // UTC midnight can move. Two taps together both passed the read above; only
  // one of them moves the stamp, and only that one is paid.
  const now = new Date(clockNow())
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  if (!(await db.claimTribute(uid, now.toISOString(), midnight))) return { error: 'You’ve already collected today’s tribute. Back tomorrow.' }
  const fathoms = await db.grant(uid, 'gauntlet_fathoms', DONS_DAILY_TRIBUTE_AMOUNT)
  return { ok: true, fathoms }
}

/** Switch an owned Run Upgrade on or off. Only gauntlet-scope upgrades toggle
 *  (Permanent Upgrades permanents are always on); an id you don't own is rejected.
 *  The off-set is server-authoritative so a disabled upgrade truly contributes
 *  nothing — run behavior AND cash-out multipliers both read it. Returns the
 *  fresh off-set. */
export async function setGauntletUpgradeActive(db: GauntletData, uid: string, id: string, active: boolean, variant: GauntletVariant = 'davy'): Promise<
  { ok: true; off: string[] } | { error: string }
> {
  if (!isToggleableUpgrade(id)) return { error: 'That upgrade can’t be switched off.' }

  const isDon = variant === 'don'
  const ownedCol = isDon ? 'dons_gauntlet_upgrades' : 'gauntlet_upgrades'
  const offCol = isDon ? 'dons_gauntlet_upgrades_off' : 'gauntlet_upgrades_off'

  const profile = await db.profile(uid, `${ownedCol}, ${offCol}`)
  if (!profile) return { error: 'Profile not found.' }

  const owned = ((profile as Record<string, unknown>)[ownedCol] as string[] | null) ?? []
  if (!owned.includes(id)) return { error: 'You don’t own that upgrade.' }

  const off = ((profile as Record<string, unknown>)[offCol] as string[] | null) ?? []
  const nextOff = active ? off.filter(x => x !== id) : (off.includes(id) ? off : [...off, id])
  // Keep the set clean: never store ids the player no longer owns / can't toggle.
  const cleanOff = nextOff.filter(x => owned.includes(x) && isToggleableUpgrade(x))
  await db.updateProfile(uid, { [offCol]: cleanOff })
  return { ok: true, off: cleanOff }
}

/** Claim a Locker Upgrade. Server-validates the depth gate, the Fathoms cost,
 *  and no-double-claim, then deducts Fathoms + records the id. */
export async function claimGauntletUpgrade(db: GauntletData, uid: string, id: string, variant: GauntletVariant = 'davy'): Promise<
  { ok: true; fathoms: number; owned: string[] } | { error: string }
> {
  const upgrade = getGauntletUpgrade(id)
  if (!upgrade) return { error: 'Unknown upgrade.' }
  if (isUpgradeComingSoon(id)) return { error: 'Coming soon.' }
  // An upgrade can only be bought in its OWN Locker (Don's tree is separate).
  if ((upgrade.gauntlet ?? 'davy') !== variant) return { error: 'Wrong Locker for that upgrade.' }

  const isDon = variant === 'don'
  const depthCol = isDon ? 'dons_gauntlet_deepest' : 'gauntlet_deepest'
  const ownedCol = isDon ? 'dons_gauntlet_upgrades' : 'gauntlet_upgrades'
  const otherOwnedCol = isDon ? 'gauntlet_upgrades' : 'dons_gauntlet_upgrades'

  const profile = await db.profile(uid, `${depthCol}, gauntlet_fathoms, ${ownedCol}, ${otherOwnedCol}`)
  if (!profile) return { error: 'Profile not found.' }

  const owned = ((profile as Record<string, unknown>)[ownedCol] as string[] | null) ?? []
  if (owned.includes(id)) return { error: 'Already unlocked.' }
  // Prereq (checked across BOTH Lockers, so a Don's upgrade can build on a
  // Davy's one like Relentless Catcher → Tireless Catcher).
  if (upgrade.requires) {
    const otherOwned = ((profile as Record<string, unknown>)[otherOwnedCol] as string[] | null) ?? []
    if (!owned.includes(upgrade.requires) && !otherOwned.includes(upgrade.requires)) {
      const req = getGauntletUpgrade(upgrade.requires)
      return { error: `Unlock ${req?.name ?? 'its prerequisite'} first.` }
    }
  }
  const deepest = ((profile as Record<string, unknown>)[depthCol] as number | null) ?? 0
  if (deepest < upgrade.depthRequired) return { error: `Reach depth ${upgrade.depthRequired} in the Gauntlet first.` }
  // The spend IS the guard: taken in place, or not at all.
  const newFathoms = await db.spend(uid, 'gauntlet_fathoms', upgrade.cost)
  if (newFathoms == null) return { error: 'Not enough Fathoms.' }
  // Added once. A concurrent twin that bought it first gets its Fathoms back.
  if (!(await db.addToList(uid, ownedCol, id))) {
    await db.grant(uid, 'gauntlet_fathoms', upgrade.cost)
    return { error: 'Already unlocked.' }
  }
  return { ok: true, fathoms: newFathoms, owned: [...owned, id] }
}

// The Drowned Shrine's "Davy's Coin" — a double-or-nothing wager of the player's
// banked Fathoms. Server-authoritative because Fathoms are persistent meta-
// currency that buys permanent upgrades: the stake is clamped to the balance +
// a hard cap, and the 50/50 is ROLLED HERE (a client can't force a win). EV is
// neutral, so even spamming it nets ~0 — the gate is just there to keep it sane.
const SHRINE_WAGER_CAP = 10
export async function wagerGauntletFathoms(db: GauntletData, uid: string, stake: number): Promise<
  { ok: true; won: boolean; stake: number; fathoms: number } | { error: string }
> {
  const profile = await db.profile(uid, 'gauntlet_fathoms, gauntlet_run_open')
  if (!profile) return { error: 'Profile not found.' }
  if (!profile.gauntlet_run_open) return { error: 'No run in progress.' }

  const balance = (profile.gauntlet_fathoms as number | null) ?? 0
  const staked = Math.min(Math.max(1, Math.floor(stake || 0)), SHRINE_WAGER_CAP, balance)
  if (staked < 1) return { error: 'No Fathoms to wager.' }

  const won = shrineWon()
  // In place. A loss is a spend, and a spend that cannot be covered (the purse
  // moved since the read) is refused rather than floored at zero.
  const newFathoms = won
    ? await db.grant(uid, 'gauntlet_fathoms', staked)
    : await db.spend(uid, 'gauntlet_fathoms', staked)
  if (newFathoms == null) return { error: 'No Fathoms to wager.' }
  return { ok: true, won, stake: staked, fathoms: newFathoms }
}

// The Black Market (Don's Gauntlet mid-run shop): spend FATHOMS on one item.
// The Fence spends RUN-EARNED Fathoms, not the banked purse: the price is a tab
// tracked client-side against this dive's earnings (fathomsForDepth of the depth
// cleared so far) and settled against the earned-Fathoms grant at cash-out/death
// (see cashOutGauntlet / resolveGauntletDeath). So this call no longer touches
// gauntlet_fathoms — it only validates a run is open + the item is real (the
// item's EFFECT is applied client-side in run state). Price is still looked up
// from the canonical catalog, never trusted from the client.
export async function buyMerchantItem(db: GauntletData, uid: string, itemId: string): Promise<
  { ok: true } | { error: string }
> {
  if (merchantPrice(itemId) == null) return { error: 'Unknown item.' }

  const profile = await db.profile(uid, 'gauntlet_run_open')
  if (!profile) return { error: 'Profile not found.' }
  if (!profile.gauntlet_run_open) return { error: 'No run in progress.' }

  return { ok: true }
}

// Record confluences the player has discovered (first unlocked), so the Synergies
// codex reveals them permanently. Fire-and-forget from the client on a first-ever
// unlock. Ids are validated against the real catalog so junk can't be written.
const VALID_CONFLUENCE_IDS = new Set(CONFLUENCES.map(c => c.id))
export async function markConfluencesSeen(db: GauntletData, uid: string, ids: string[]): Promise<{ ok: boolean }> {
  const valid = (ids ?? []).filter(id => VALID_CONFLUENCE_IDS.has(id))
  if (valid.length === 0) return { ok: true }

  const profile = await db.profile(uid, 'gauntlet_confluences_seen')
  const seen = (profile?.gauntlet_confluences_seen as string[] | null) ?? []
  const next = Array.from(new Set([...seen, ...valid]))
  if (next.length !== seen.length) {
    await db.updateProfile(uid, { gauntlet_confluences_seen: next })
  }
  return { ok: true }
}

export type GauntletLeaderboard = {
  top: { name: string; depth: number } | null
  mine: number
  /** #1 on the hardcore-only Drowned Ledger + this player's hardcore best.
   *  Each descent has its OWN ledger, so this is whichever one you are looking at. */
  hardcoreTop: { name: string; depth: number } | null
  hardcoreMine: number
}

/** The single deepest run across all captains + this player's own deepest.
 *  Surfaced on the gauntlet map node. `uid` is null for a visitor. */
export async function getGauntletLeaderboard(db: GauntletData, uid: string | null, variant: GauntletVariant = 'davy'): Promise<GauntletLeaderboard> {
  const isDon = variant === 'don'

  // #1 deepest CASHED-OUT descent (the leaderboard views exclude deaths +
  // admins), same depth → FIRST-TO-DEPTH → fastest ordering as the board
  // (leaderboard/actions fetchGauntlet — keep in sync). One query per ledger.
  const [top, hcTop] = await Promise.all([
    db.ledgerTop(isDon ? 'leaderboard_dons_gauntlet' : 'leaderboard_gauntlet'),
    db.ledgerTop(hcCols(variant).ledger),
  ])

  let mine = 0
  let hardcoreMine = 0
  if (uid) {
    const me = await db.profile(uid, 'gauntlet_deepest, gauntlet_hc_deepest, dons_gauntlet_deepest, dons_gauntlet_hc_deepest')
    mine = ((isDon ? me?.dons_gauntlet_deepest : me?.gauntlet_deepest) as number | null) ?? 0
    hardcoreMine = (me?.[hcCols(variant).deepest] as number | null) ?? 0
  }

  const asTop = (row: { username?: string | null; score?: number | string } | null) =>
    row ? { name: (row.username as string | null) ?? 'A captain', depth: Number(row.score) } : null
  return {
    top: asTop(top),
    mine,
    hardcoreTop: asTop(hcTop),
    hardcoreMine,
  }
}

/** Has this captain actually put Don Finleone down?
 *
 *  raid_node_progress.cleared is NOT the answer on its own. A raid clear is
 *  recorded in raid_completions (see buildClearedSet, which unions the two), and
 *  a player can hold the completion without the node ever landing in the jsonb.
 *  shortbus_vip is exactly that: the Throne beaten, nine depths into Don's
 *  Gauntlet, and no 'the_throne' in raid_node_progress.
 *
 *  The Don's Gauntlet PAGE has always gated on raid_completions, so gating
 *  hardcore on the jsonb meant the two disagreed: the descent let you in and its
 *  hardcore said you had never met the man. One source, the same one. */
async function throneCleared(db: GauntletData, userId: string): Promise<boolean> {
  return db.hasCleared(userId, 'the_throne')
}

export type GauntletDailyState = { available: boolean; deepest: number; fathoms: number; nextAt: string | null; deepestRun: GauntletRunSnapshot | null; hcDeepestRun: GauntletRunSnapshot | null; lastRun: GauntletRunSnapshot | null; hcLastRun: GauntletRunSnapshot | null; resumeState: GauntletRunState | null; resumePaused: boolean; hardcoreUnlocked: boolean; hardcoreCaptainLocked: boolean; hardcoreLive: boolean; hcDeepest: number; hcRunsLeft: number; runHardcore: boolean; runTerms: SignedTerms | null }
export const NO_DAILY_STATE: GauntletDailyState = { available: false, deepest: 0, fathoms: 0, nextAt: null, deepestRun: null, hcDeepestRun: null, lastRun: null, hcLastRun: null, resumeState: null, resumePaused: false, hardcoreUnlocked: false, hardcoreCaptainLocked: false, hardcoreLive: HARDCORE_LIVE, hcDeepest: 0, hcRunsLeft: 0, runHardcore: false, runTerms: null }

/** Whether the player can start a run now (cooldown elapsed) + their lifetime
 *  deepest + when the next run unlocks (ISO, null when available now). */
export async function getGauntletDailyState(db: GauntletData, uid: string, variant: GauntletVariant = 'davy'): Promise<GauntletDailyState> {
  const isDon = variant === 'don'
  const profile = await db.profile(uid, 'is_premium, premium_expires_at, gauntlet_last_run_at, gauntlet_deepest, gauntlet_fathoms, gauntlet_deepest_run, gauntlet_hc_deepest_run, gauntlet_last_run, gauntlet_hc_last_run, dons_gauntlet_last_run, is_admin, gauntlet_run_open, gauntlet_run_state, gauntlet_resumes_used, gauntlet_run_paused, gauntlet_hc_deepest, gauntlet_run_hardcore, gauntlet_hc_last_run_at, gauntlet_hc_runs_today, raid_node_progress, gauntlet_run_terms, gauntlet_run_variant, dons_gauntlet_deepest, dons_gauntlet_deepest_run, dons_gauntlet_hc_deepest, dons_gauntlet_hc_deepest_run, dons_gauntlet_hc_last_run, dons_gauntlet_hc_last_run_at, dons_gauntlet_hc_runs_today')
  // "One run at a time": a resume only belongs to THIS gauntlet if the open run's
  // variant matches (a paused Davy run must not surface on the Don's screen).
  const openVariant = ((profile?.gauntlet_run_variant as GauntletVariant | null) ?? 'davy')

  // Admins can run it as often as they like (testing the curve).
  const isAdmin = profile?.is_admin === true
  const { available, nextMs } = gauntletCooldown(profile?.gauntlet_last_run_at as string | null, isAdmin)

  // A run left open with a saved checkpoint can be picked back up. Two flavours:
  //   • PAUSED (deliberate — player hit "Pause & step away"): unlimited resumes,
  //     doesn't spend the crash budget. For taking breaks.
  //   • CRASH (disconnect): one forced resume per run (server-owned counter).
  // resumePaused tells the client which resume screen to show.
  const runState = (profile?.gauntlet_run_state as GauntletRunState | null) ?? null
  const resumesUsed = (profile?.gauntlet_resumes_used as number | null) ?? 0
  const runPaused = profile?.gauntlet_run_paused === true
  // ── A RUN OPEN WITH NO CHECKPOINT IS NOT A RUN ────────────────────────────
  //
  // startGauntletRun raises the flag with a null state, and the first
  // checkpoint lands on the first turn. Close the tab in between and the flag
  // is left up over nothing: the client never reconstructs a run, so nothing
  // can resume it, and nothing in the UI can end it — yet it still locks the
  // crew's berths (the crew's clearParty reads the flag alone). By construction
  // that run is unrecoverable, so the next look at the lobby lowers the flag.
  // A paused run always has a state, so this can never touch one.
  if (profile?.gauntlet_run_open === true && !runState) {
    await db.updateProfile(uid, { gauntlet_run_open: false, gauntlet_run_paused: false })
  }
  const canResume = profile?.gauntlet_run_open === true && openVariant === variant && !!runState && (runPaused || resumesUsed < 1)
  const resumeState = canResume ? runState : null
  const resumePaused = canResume && runPaused

  const deepest = (isDon ? (profile?.dons_gauntlet_deepest as number | null) : (profile?.gauntlet_deepest as number | null)) ?? 0
  const clearedNodes = (profile?.raid_node_progress as { cleared?: string[] } | null)?.cleared ?? []
  // Hardcore runs remaining in the current UTC day (resets when the date rolls;
  // admins bypass the cap, so they always read full). Mirrors startGauntletRun.
  // Each descent counts its OWN daily budget: three Davy runs and three Don's,
  // not three shared between them. The columns are picked by variant, so the two
  // counters can never see each other.
  const HC = hcCols(variant)
  const hcLastAt = profile?.[HC.lastRunAt] ? new Date(profile[HC.lastRunAt] as string) : null
  const hcSameUtcDay = !!hcLastAt && utcDay(hcLastAt) === utcDay(new Date(clockNow()))
  const hcUsedToday = hcSameUtcDay ? Number(profile?.[HC.runsToday] ?? 0) : 0
  const hcRunsLeft = isAdmin ? HARDCORE_RUNS_PER_DAY : Math.max(0, HARDCORE_RUNS_PER_DAY - hcUsedToday)
  const donsDeepest = (profile?.dons_gauntlet_deepest as number | null) ?? 0
  const throne = isDon ? await throneCleared(db, uid) : false
  // CAPTAIN'S WATER. See lib/captainWater; hcDeep is this descent's own
  // hardcore record, which is what grandfathers it.
  const captain = inCaptainsWater(profile as CaptainWaterRow | null)
  const hcDeep = (profile?.[HC.deepest] as number | null) ?? 0
  return {
    available,
    deepest,
    fathoms: (profile?.gauntlet_fathoms as number | null) ?? 0,   // shared purse
    nextAt: available ? null : new Date(nextMs).toISOString(),
    deepestRun: (isDon ? (profile?.dons_gauntlet_deepest_run as GauntletRunSnapshot | null) : (profile?.gauntlet_deepest_run as GauntletRunSnapshot | null)) ?? null,
    hcDeepestRun: (profile?.[HC.deepestRun] as GauntletRunSnapshot | null) ?? null,
    lastRun: (isDon ? (profile?.dons_gauntlet_last_run as GauntletRunSnapshot | null) : (profile?.gauntlet_last_run as GauntletRunSnapshot | null)) ?? null,
    hcLastRun: (profile?.[HC.lastRun] as GauntletRunSnapshot | null) ?? null,
    resumeState,
    resumePaused,
    // Each descent gates its own hardcore. Don's asks for the Throne plus depth
    // in HIS water: reaching depth 10 of Davy's says nothing about surviving the
    // Ch3/Ch4 pool.
    hardcoreUnlocked: isDon
      ? donsHardcoreUnlocked({ isAdmin, throneCleared: throne, donsDeepest, captain, donsHcDeepest: hcDeep })
      : hardcoreUnlocked({ isAdmin, clearedNodes, deepest, captain, hcDeepest: hcDeep }),
    // CAPTAIN'S WATER, AND ONLY THAT. True when every other gate on hardcore
    // is met and the door is the one thing shut, so the lobby can say which
    // lock it is rather than "reach depth five" to somebody at depth twenty.
    hardcoreCaptainLocked: !captain && (isDon
      ? donsHardcoreUnlocked({ isAdmin, throneCleared: throne, donsDeepest, captain: true })
      : hardcoreUnlocked({ isAdmin, clearedNodes, deepest, captain: true }))
      && !(isDon
        ? donsHardcoreUnlocked({ isAdmin, throneCleared: throne, donsDeepest, captain, donsHcDeepest: hcDeep })
        : hardcoreUnlocked({ isAdmin, clearedNodes, deepest, captain, hcDeepest: hcDeep })),
    hardcoreLive: HARDCORE_LIVE,
    hcDeepest: (profile?.[HC.deepest] as number | null) ?? 0,
    // Hardcore runs left today (of HARDCORE_RUNS_PER_DAY) for the mode-choice card.
    hcRunsLeft,
    // Is the currently OPEN (resumable) run a hardcore one? Lets a resumed run
    // keep its hardcore end-beats + abandon warning. Only if it's THIS variant's run.
    runHardcore: openVariant === variant && profile?.gauntlet_run_hardcore === true,
    // Terms signed for the currently OPEN run — a resume must restore them, or
    // the rest of the dive would silently play on easy.
    runTerms: openVariant === variant ? ((profile?.gauntlet_run_terms as SignedTerms | null) ?? null) : null,
  }
}

/** Checkpoint an in-progress run's resumable state between fights. Fire-and-
 *  forget from the client at each breather; only writes while a run is open. */
export async function checkpointGauntletRun(db: GauntletData, uid: string, state: GauntletRunState): Promise<{ ok: boolean; split?: DepthSplit }> {
  const profile = await db.profile(uid, 'gauntlet_run_open, gauntlet_run_active_ms, gauntlet_run_tick_at, gauntlet_run_variant, gauntlet_run_hardcore')
  if (profile?.gauntlet_run_open !== true) return { ok: false }

  const clock = tickActiveMs((profile as any).gauntlet_run_active_ms, (profile as any).gauntlet_run_tick_at)
  await db.updateProfile(uid, { gauntlet_run_state: state, ...clock })

  // PER-DEPTH SPLIT. A breather opens exactly once per depth, right after that
  // depth fell, so the clock we just wrote IS the time to reach it — no separate
  // measurement, and the depth comes off the state the server just persisted
  // rather than anything the client named.
  //
  // Failure here is deliberately silent: a personal best is vanity, and losing
  // one must never cost a player their checkpoint (which is already written).
  const depth = Math.floor(state?.cleared ?? 0)
  if (depth < 1 || depth > MAX_GAUNTLET_DEPTH) return { ok: true }
  const ms = clock.gauntlet_run_active_ms

  const rec = await db.recordDepthBest(uid,
    ((profile as any).gauntlet_run_variant as GauntletVariant | null) ?? 'davy',
    (profile as any).gauntlet_run_hardcore === true, depth, ms)
  if (!rec) return { ok: true }
  return { ok: true, split: { depth, ms, prevMs: rec.prevMs, isRecord: rec.isRecord } }
}

/** DELIBERATE pause — the player hit "Pause & step away" at a breather. Saves the
 *  checkpoint and flags the run as paused so it resumes UNLIMITED times (no crash
 *  budget spent). For taking breaks mid-run without cashing out. */
export async function pauseGauntletRun(db: GauntletData, uid: string, state: GauntletRunState): Promise<{ ok: boolean }> {
  const profile = await db.profile(uid, 'gauntlet_run_open, gauntlet_run_active_ms, gauntlet_run_tick_at')
  if (profile?.gauntlet_run_open !== true) return { ok: false }

  // Stops the clock. A deliberate break is exactly the time this must not count.
  await db.updateProfile(uid, {
    gauntlet_run_state: state, gauntlet_run_paused: true,
    ...tickActiveMs((profile as any).gauntlet_run_active_ms, (profile as any).gauntlet_run_tick_at, { stop: true }),
  })
  return { ok: true }
}

/** Pick a run back up. A PAUSED run (deliberate) resumes without limit and doesn't
 *  touch the crash budget. A CRASHED run spends its single server-owned resume.
 *  Refuses if there's no open run, no checkpoint, or a crash resume is spent. */
export async function resumeGauntletRun(db: GauntletData, uid: string): Promise<{ ok: false } | { ok: true; state: GauntletRunState; offer: DavyOffer | null }> {
  // gauntlet_run_offer rides along: a live Davy's Offer lives in its OWN column
  // (not the run-state checkpoint), so a resume that only restored the state
  // dropped it — the offer vanished on any leave-and-resume. Hand it back.
  const profile = await db.profile(uid, 'gauntlet_run_open, gauntlet_run_state, gauntlet_resumes_used, gauntlet_run_paused, gauntlet_run_offer')

  const state = (profile?.gauntlet_run_state as GauntletRunState | null) ?? null
  if (profile?.gauntlet_run_open !== true || !state) return { ok: false }

  const offer = ((profile?.gauntlet_run_offer as OfferState | null) ?? EMPTY_OFFER_STATE).live

  if (profile?.gauntlet_run_paused === true) {
    // Deliberate pause: unlimited, no crash budget spent. Clear the flag — the run
    // is live again (a later disconnect from here is a normal crash resume).
    // Picking it back up restarts the clock. The time away is simply not in it.
    await db.updateProfile(uid, { gauntlet_run_paused: false, gauntlet_run_tick_at: nowIso() })
    return { ok: true, state, offer }
  }

  // Crash resume: one per run, server-owned counter (ignores any client value).
  const used = (profile?.gauntlet_resumes_used as number | null) ?? 0
  if (used >= 1) return { ok: false }
  await db.updateProfile(uid, { gauntlet_resumes_used: used + 1, gauntlet_run_tick_at: nowIso() })
  return { ok: true, state, offer }
}

export type GauntletStart = { started: boolean; reason?: 'cooldown' | 'locked' | 'no_squad' | 'other_run'; deepest: number; nextAt?: string }

/** Consume the run attempt (start the cooldown) and open a run. Starting (not
 *  finishing) spends it, so a quit-retry can't reroll a bad opener.
 *
 *  Hardcore: the crew you send in (your living raid party) is snapshotted into
 *  gauntlet_hc_squad and PERMANENTLY dies on death/abandon. Gated server-side —
 *  admin-only until HARDCORE_LIVE, then unlock + a living squad. */
export async function startGauntletRun(db: GauntletData, uid: string, hardcore = false, terms?: SignedTerms, variant: GauntletVariant = 'davy'): Promise<GauntletStart> {
  const profile = await db.profile(uid, 'gauntlet_last_run_at, gauntlet_deepest, is_admin, raid_node_progress, gauntlet_hc_last_run_at, gauntlet_hc_runs_today, gauntlet_run_open, gauntlet_run_variant, dons_gauntlet_deepest, dons_gauntlet_hc_last_run_at, dons_gauntlet_hc_runs_today, is_premium, premium_expires_at, gauntlet_hc_deepest, dons_gauntlet_hc_deepest')

  const isDon = variant === 'don'
  const HC = hcCols(variant)
  const deepest = ((isDon ? (profile?.dons_gauntlet_deepest as number | null) : (profile?.gauntlet_deepest as number | null)) ?? 0)
  const isAdmin = profile?.is_admin === true
  // ── CAPTAIN'S WATER, ON THE SERVER ──────────────────────────────────────
  // The page redirects a locked captain away from Don's; this is the check
  // that holds when the page is not how the request arrived.
  const captain = inCaptainsWater(profile as CaptainWaterRow | null)
  if (isDon && !donsGauntletUnlocked({ isAdmin, throneCleared: await throneCleared(db, uid), captain, donsDeepest: deepest })) {
    return { started: false, reason: 'locked', deepest }
  }
  // One run at a time: block starting THIS gauntlet while a DIFFERENT gauntlet's
  // run is still open (its checkpoint + records would otherwise get stomped).
  const openVariant = ((profile?.gauntlet_run_variant as GauntletVariant | null) ?? 'davy')
  if (profile?.gauntlet_run_open === true && openVariant !== variant) {
    return { started: false, reason: 'other_run', deepest }
  }
  // Admins bypass the cooldown so they can run it repeatedly to test.
  const { available, nextMs } = gauntletCooldown(profile?.gauntlet_last_run_at as string | null, isAdmin)
  if (!available) {
    return { started: false, reason: 'cooldown', deepest, nextAt: new Date(nextMs).toISOString() }
  }

  // ── Hardcore: gate + snapshot the squad at risk ──────────────────────────
  // Davy's Terms — HARDCORE ONLY, and sanitized here so a tampered client can't
  // invent terms/tiers (the Blood Gem multiplier is derived from this column
  // server-side at cash-out, never from anything the client reports).
  let signedTerms: SignedTerms | null = null
  if (hardcore && terms) {
    const clean: SignedTerms = {}
    for (const [id, tier] of Object.entries(terms)) {
      const term = getTerm(id)
      if (!term) continue
      const t = Math.floor(Number(tier) || 0)
      if (t >= 1) clean[id] = Math.min(t, term.tiers.length)
    }
    if (Object.keys(clean).length > 0) signedTerms = clean
  }

  let hcFields: Record<string, unknown> = { gauntlet_run_hardcore: false, gauntlet_hc_squad: null, gauntlet_run_terms: null }
  let hcRunsToday = 0
  if (hardcore) {
    const clearedNodes = (profile?.raid_node_progress as { cleared?: string[] } | null)?.cleared ?? []
    // Server-enforced gate — admin-only until HARDCORE_LIVE (so the action can't
    // be forced from the client), then unlock + that descent's own depth floor.
    const gateOk = isDon
      ? donsHardcoreUnlocked({ isAdmin, throneCleared: await throneCleared(db, uid), donsDeepest: (profile?.dons_gauntlet_deepest as number | null) ?? 0, captain, donsHcDeepest: (profile?.dons_gauntlet_hc_deepest as number | null) ?? 0 })
      : hardcoreUnlocked({ isAdmin, clearedNodes, deepest, captain, hcDeepest: (profile?.gauntlet_hc_deepest as number | null) ?? 0 })
    if (!gateOk) {
      return { started: false, reason: 'locked', deepest }
    }
    // Hardcore is capped at HARDCORE_RUNS_PER_DAY per UTC day (admins bypass so
    // they can test). The count resets when the UTC date of the last run differs
    // from today's; when capped, the run reopens at the next UTC midnight.
    // THREE PER DESCENT, not three shared: Davy's budget and the Don's are
    // counted in different columns, so spending your Davy runs leaves his three
    // untouched.
    const now = new Date(clockNow())
    const hcLastAt = profile?.[HC.lastRunAt] ? new Date(profile[HC.lastRunAt] as string) : null
    const sameUtcDay = !!hcLastAt && utcDay(hcLastAt) === utcDay(now)
    const runsToday = sameUtcDay ? Number(profile?.[HC.runsToday] ?? 0) : 0
    if (!isAdmin && runsToday >= HARDCORE_RUNS_PER_DAY) {
      const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      return { started: false, reason: 'cooldown', deepest, nextAt: nextMidnight.toISOString() }
    }
    hcRunsToday = runsToday + 1
    // The squad = the living raid party. Snapshot their ids; these are the crew
    // that drown on death/abandon (resolveGauntletDeath reads gauntlet_hc_squad).
    const squad = (await db.party(uid, 'raid')).map(r => r.id as number)
    if (squad.length === 0) return { started: false, reason: 'no_squad', deepest }
    // The squad column stays SHARED on purpose: only one run is ever open, so
    // only one squad is ever at risk. The date and the counter are per-descent.
    hcFields = { gauntlet_run_hardcore: true, gauntlet_hc_squad: squad, [HC.lastRunAt]: nowIso(), [HC.runsToday]: hcRunsToday, gauntlet_run_terms: signedTerms }
  }

  // A fresh run zeroes the clock and starts it. Everything else here already
  // resets per run; the timer joins them rather than carrying over.
  await db.updateProfile(uid, { gauntlet_last_run_at: nowIso(), gauntlet_run_open: true, gauntlet_run_variant: variant, gauntlet_run_state: null, gauntlet_resumes_used: 0, gauntlet_run_paused: false, gauntlet_run_offer: null, gauntlet_run_active_ms: 0, gauntlet_run_tick_at: nowIso(), ...hcFields })

  return { started: true, deepest }
}

// ── DAVY'S OFFER ─────────────────────────────────────────────────────────────
// Called once when a breather opens (right after the run checkpoints, so the depth
// below is the one WE stored, not one the client can name). The server decides
// whether an offer happens, what kind it is and what tier — the client is only ever
// TOLD. All it supplies is its hull fraction, and lying about that can at worst earn
// an offer while wounded, which the bounded payout below makes worthless.
export async function rollDavyOffer(db: GauntletData, uid: string, hpPct: number): Promise<{ offer: DavyOffer | null }> {
  const profile = await db.profile(uid, 'gauntlet_run_open, gauntlet_run_state, gauntlet_run_offer, gauntlet_run_hardcore, gauntlet_run_terms, gauntlet_run_variant, raid_items, ship_skins')

  if (!profile || profile.gauntlet_run_open !== true) return { offer: null }

  const variant = ((profile.gauntlet_run_variant as GauntletVariant | null) ?? 'davy')
  const state = (profile.gauntlet_run_state as GauntletRunState | null) ?? null
  const depth = Math.max(0, Math.floor(state?.cleared ?? 0))
  const hc = profile.gauntlet_run_hardcore === true
  const terms = profile.gauntlet_run_terms as SignedTerms | null
  const prev = (profile.gauntlet_run_offer as OfferState | null) ?? EMPTY_OFFER_STATE

  // NO SECOND THOUGHTS bars banking until a boss is down. Davy dangling a bargain
  // the captain physically cannot accept would be a cruel little bug, so he keeps
  // his mouth shut at a breather where the door is bolted.
  if (resolveTerms(terms).cashOutOnlyAfterBoss && state?.prevWasBoss !== true) {
    return { offer: null }
  }

  // A heavier chest is only a bargain if the chest can still pay this captain
  // anything. Offering it to someone who owns every chase item would be a lie.
  const chestWorthOffering = chestOdds({
    depth,
    hardcore: hc,
    pressure: hc ? termPressure(terms) : 0,
    ownedItems: distinctIds((profile.raid_items as string[] | null) ?? []),
    ownedSkins: (profile.ship_skins as string[] | null) ?? [],
    davyForge: DAVY_FORGE,
    variant,
    // A locked row (chance 0, still depth-gated) is not something a heavier
    // chest can pay, so it must not make an offer look worthwhile.
  }).some(o => o.chance > 0)

  const next = rollOffer({
    prev,
    depth,
    hpPct: Math.max(0, Math.min(1, hpPct)),
    hardcore: hc,
    chestWorthOffering,
  })

  await db.updateProfile(uid, { gauntlet_run_offer: next })
  return { offer: next.live }
}

export type GauntletCashOut =
  | { ok: false }
  | {
      ok: true
      depth: number
      chest: { tier: number; label: string; potMult: number }
      bankedDoubloons: number
      bankedXp: number
      gems: number
      newDoubloons: number
      newGems: number
      newExpeditionXP: number
      deepest: number
      crewXP: CrewXPGrant[]
      /** Fathoms banked this run (= depth reached) + new total. */
      earnedFathoms: number
      newFathoms: number
      /** Blood Gems from the chest (Hardcore cash-out only; 0 on normal) + new total. */
      earnedBloodGems: number
      /** Davy's Terms: the Pressure this run carried, and the Blood Gem
       *  multiplier it actually earned at the depth reached (1 when unsigned or
       *  too shallow to qualify). Drives the cash-out payoff beat. */
      runPressure: number
      gemMult: number
      newBloodGems: number
      /** Davy cannons that dropped this cash-out (chest chase items). */
      droppedItems: string[]
      /** Golden Gauntlet Hull skin id if it dropped this cash-out, else null. */
      droppedSkinId: string | null
      /** Bad Blood Hull (Hardcore-only Man-o-War skin) id if it dropped, else null. */
      droppedHcSkinId: string | null
      /** The Pitch Black Hull, if this heavy run rolled it. */
      droppedPressureSkinId: string | null
      /** Depth-milestone unlocks crossed by this CASH-OUT (surfaced on the
       *  reward screen — the Gauntlet no longer mails these). */
      unlockedThisRun: { name: string; blurb: string; where: string }[]
      /** Was this a Hardcore run? Drives the "your crew sailed home" cash-out beat. */
      hardcore: boolean
      /** Davy's Offer, if this captain shook on it. Null if he never offered or they
       *  told him no. Drives the cash-out beat that names what the deal paid. */
      offerTaken: DavyOffer | null
    }

/** Cash out an open run at the reached depth, banking the (clamped) pot ×
 *  chest multiplier + the chest's gem bonus. Closes the run. */
export async function cashOutGauntlet(db: GauntletData, uid: string, rewardDepth: number, combatDepth: number, pot: number, runSnapshot?: GauntletRunSnapshot, takeOffer = false): Promise<GauntletCashOut> {
  const profile = await db.profile(uid, 'gauntlet_run_active_ms, gauntlet_run_tick_at, gauntlet_run_open, gauntlet_run_variant, gauntlet_deepest, gauntlet_last_run_at, gauntlet_best_depth, gauntlet_best_depth_ms, gauntlet_contest_depth, gauntlet_fathoms, gauntlet_fathoms_earned, gauntlet_runs_completed, gauntlet_upgrades, gauntlet_upgrades_off, dons_gauntlet_deepest, dons_gauntlet_best_depth, dons_gauntlet_best_depth_ms, dons_gauntlet_deepest_run, dons_gauntlet_upgrades, dons_gauntlet_upgrades_off, expedition_xp, doubloons, gems, ship_classes, nav_renown_alloc, raid_items, ship_skins, gauntlet_run_hardcore, gauntlet_hc_deepest, gauntlet_hc_best_depth, gauntlet_hc_best_depth_ms, dons_gauntlet_hc_deepest, dons_gauntlet_hc_best_depth, dons_gauntlet_hc_best_depth_ms, dons_gauntlet_hc_best_pressure, blood_gems, blood_gems_earned, gauntlet_run_terms, gauntlet_hc_best_pressure, gauntlet_run_offer, gauntlet_run_state, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')

  if (!profile || profile.gauntlet_run_open !== true) return { ok: false }

  // DAVY'S TERMS: NO SECOND THOUGHTS. A captain who signed it may only bank at
  // the breather after a boss. rollDavyOffer and the dock already honour it;
  // this is the check that holds when the request did not come from the dock.
  // Read off the checkpoint the server stored (the breather checkpoints before
  // its dock is shown), and refused WITHOUT closing the run.
  if (resolveTerms((profile.gauntlet_run_terms as SignedTerms | null) ?? null).cashOutOnlyAfterBoss
      && (profile.gauntlet_run_state as GauntletRunState | null)?.prevWasBoss !== true) {
    await db.flagAnomaly(uid, 'terms:cashOutBeforeBoss', 2, {})
    return { ok: false }
  }

  // Which gauntlet is this open run? Don's writes its OWN records (separate
  // leaderboard) + reads its own Locker; the Fathoms purse + lifetime counters
  // stay shared.
  const variant = ((profile.gauntlet_run_variant as GauntletVariant | null) ?? 'davy')
  const isDon = variant === 'don'

  // Hardcore cash-out (you sailed your squad back from the Locker): a Fathoms
  // premium + survivor crew-XP bonus, and it advances ONLY the Drowned Ledger
  // (its own hiscore + cosmetic unlocks), never the normal Gauntlet record.
  const hc = profile.gauntlet_run_hardcore === true

  // Two depths (Veteran's Start decouples them): rewardDepth = ships actually
  // sunk (drives chest + pot, so the head start is no loot shortcut); combatDepth
  // = how deep you reached (drives Fathoms + deepest record + contest, so the
  // skip DOES count toward depth). Equal for everyone without Veteran's Start.
  //
  // ── AND THE CLOCK HAS TO AGREE ──────────────────────────────────────────
  // Read, not written: the finish stops the clock further down, and this only
  // asks how long the run has actually been open for. See MIN_MS_PER_DEPTH.
  const clockMs = tickActiveMs(profile.gauntlet_run_active_ms, profile.gauntlet_run_tick_at, { stop: true }).gauntlet_run_active_ms
  const { rd, cd } = settleDepths(rewardDepth, combatDepth, clockMs,
    ((isDon ? profile.dons_gauntlet_upgrades : profile.gauntlet_upgrades) as string[] | null) ?? [])
  // BOUNTIES. How deep a single run got is a moment, not a total:
  // profiles.gauntlet_deepest is a lifetime high-water mark, so a captain who
  // has already seen 15 could never complete "reach depth 10 today" from it.
  // One row per finished run is the only honest way to answer that. Logged
  // below, once the close has gone through, so a doubled request logs once.
  if (rd <= 0) {
    // Nothing cleared — just close the run (once).
    if (await db.closeRun(uid, { gauntlet_run_open: false })) void db.logBountyEvent(uid, hc ? 'gauntlet_hc_depth' : 'gauntlet_depth', cd)
    return { ok: false }
  }

  // WHAT THE CASH-OUT PAYS (the chest, the chase drops in their fixed order,
  // Blood Gems, doubloons, Nav XP, gems, Fathoms, crew XP) is lib/gauntletRules
  // cashOutHaul. Everything it reads is server-side: the Locker, Davy's Offer as
  // WE stored it, the terms WE stored at run start, and the crew's Fortune from
  // the same loader the gauntlet page shows.
  const HC = hcCols(isDon ? 'don' : 'davy')
  const runTerms = (profile.gauntlet_run_terms as SignedTerms | null) ?? null
  const prevDeepest = ((isDon ? profile.dons_gauntlet_deepest : profile.gauntlet_deepest) as number | null) ?? 0
  const prevHcDeepest = (profile[HC.deepest] as number | null) ?? 0
  const haul = cashOutHaul({
    variant, hc, rd, cd, pot,
    owned: ((isDon ? profile.dons_gauntlet_upgrades : profile.gauntlet_upgrades) as string[] | null) ?? [],
    off: ((isDon ? profile.dons_gauntlet_upgrades_off : profile.gauntlet_upgrades_off) as string[] | null) ?? [],
    accountUpgrades: [
      ...((profile.gauntlet_upgrades as string[] | null) ?? []),
      ...((profile.dons_gauntlet_upgrades as string[] | null) ?? []),
    ],
    offerState: (profile.gauntlet_run_offer as OfferState | null) ?? null,
    takeOffer,
    terms: runTerms,
    ownedItems: distinctIds((profile.raid_items as string[] | null) ?? []),
    ownedSkins: (profile.ship_skins as string[] | null) ?? [],
    totalFortune: (await getRaidPlayerStatsVia(db, uid)).totalFortune,
    shipClasses: (profile.ship_classes as Record<string, string> | null) ?? {},
    navRenownAlloc: profile.nav_renown_alloc as RenownAlloc | null,
    prevHcDeepest,
    prevDeepest,
    fenceSpent: runSnapshot?.fenceSpent ?? 0,
  })
  const { payDepth, chest, offerTaken, droppedItems, droppedSkinId, droppedHcSkinId, droppedPressureSkinId,
    hcDeepest, hcUnlocks, grantSkins, runPressure, gemMult, earnedBloodGems,
    bankedDoubloons, bankedXp, gems, earnedFathoms, deepest } = haul
  const newExpeditionXP = (profile.expedition_xp ?? 0) + bankedXp
  // A cash-out is Navigation XP, so it charges The Primeval Eye too.
  const reelCharge = eyeCharge(profile as Parameters<typeof eyeCharge>[0], bankedXp)

  // Wall-clock run time (server-computed from the run-start stamp) for the
  // leaderboard tiebreaker — can't be faked client-side.
  const lastRunAt   = profile.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const runMs       = lastRunAt > 0 ? Math.max(0, clockNow() - lastRunAt) : null

  // Record fields diverge by mode. HARDCORE advances ONLY the Drowned Ledger
  // (gauntlet_hc_deepest + its own best-depth board) and clears the run flag +
  // squad (crew survived). NORMAL advances the normal deepest/best/contest/recap.
  let recordFields: Record<string, unknown>
  if (hc) {
    const prevHcBestDep = (profile[HC.bestDepth] as number | null) ?? 0
    const prevHcBestMs  = (profile[HC.bestMs] as number | null) ?? null
    // First-to-depth wins board ties, so `_at` is the CLAIM time: stamped only
    // when the depth strictly increases. A faster re-run at the SAME depth
    // still improves the shown run time but keeps the original claim.
    const hcClaim       = recordClaim(cd, runMs, prevHcBestDep, prevHcBestMs)
    const hcNewDepth    = hcClaim === 'deeper'
    const hcFasterSame  = hcClaim === 'faster'
    recordFields = {
      [HC.deepest]: hcDeepest,
      gauntlet_run_hardcore: false,
      gauntlet_hc_squad: null,
      ...(hcNewDepth
        ? { [HC.bestDepth]: cd, [HC.bestMs]: runMs, [HC.bestAt]: nowIso() }
        // This run's OWN hardcore time (it wrote Davy's column on a Don's run).
        : hcFasterSame ? { [HC.bestMs]: runMs } : {}),
      ...(cd > prevHcDeepest ? { [HC.deepestRun]: sanitizeRunSnapshot(runSnapshot, cd) } : {}),
      ...(runSnapshot ? { [HC.lastRun]: sanitizeRunSnapshot(runSnapshot, cd) } : {}),   // most recent cash-out, always
    }
  } else if (isDon) {
    // Don's Gauntlet — its OWN records / leaderboard (never touches Davy's, and
    // no Deepest-Descent contest, which is Davy-specific).
    const prevBestDep = (profile.dons_gauntlet_best_depth as number | null) ?? 0
    const prevBestMs  = (profile.dons_gauntlet_best_depth_ms as number | null) ?? null
    const claim       = recordClaim(cd, runMs, prevBestDep, prevBestMs)
    const newDepth    = claim === 'deeper'
    const fasterSame  = claim === 'faster'
    recordFields = {
      dons_gauntlet_deepest: deepest,
      ...(newDepth
        ? { dons_gauntlet_best_depth: cd, dons_gauntlet_best_depth_ms: runMs, dons_gauntlet_best_depth_at: nowIso() }
        : fasterSame ? { dons_gauntlet_best_depth_ms: runMs } : {}),
      ...(cd > prevDeepest ? { dons_gauntlet_deepest_run: sanitizeRunSnapshot(runSnapshot, cd) } : {}),
      ...(runSnapshot ? { dons_gauntlet_last_run: sanitizeRunSnapshot(runSnapshot, cd) } : {}),   // most recent cash-out, always
    }
  } else {
    const prevBestDep = (profile.gauntlet_best_depth as number | null) ?? 0
    const prevBestMs  = (profile.gauntlet_best_depth_ms as number | null) ?? null
    // First-to-depth wins board ties — `_at` is the CLAIM time, stamped only on
    // a strictly deeper cash-out. Faster same-depth re-runs update the run time
    // shown on the board without moving the claim.
    const claim       = recordClaim(cd, runMs, prevBestDep, prevBestMs)
    const newDepth    = claim === 'deeper'
    const fasterSame  = claim === 'faster'
    const contestActive  = clockNow() < Date.parse(GAUNTLET_DEEPEST_CONTEST_ENDS_AT)
    const prevContestDep = (profile.gauntlet_contest_depth as number | null) ?? 0
    recordFields = {
      gauntlet_deepest: deepest,
      ...(newDepth
        ? { gauntlet_best_depth: cd, gauntlet_best_depth_ms: runMs, gauntlet_best_depth_at: nowIso() }
        : fasterSame ? { gauntlet_best_depth_ms: runMs } : {}),
      ...(contestActive && cd > prevContestDep ? { gauntlet_contest_depth: cd, gauntlet_contest_depth_at: nowIso() } : {}),
      ...(cd > prevDeepest ? { gauntlet_deepest_run: sanitizeRunSnapshot(runSnapshot, cd) } : {}),
      ...(runSnapshot ? { gauntlet_last_run: sanitizeRunSnapshot(runSnapshot, cd) } : {}),   // most recent cash-out, always
    }
  }

  // The run is over, so fold in the final stretch and stop the clock. Computed
  // once and used by both the profile write and the run row.
  const runClock = tickActiveMs(
    (profile as any).gauntlet_run_active_ms, (profile as any).gauntlet_run_tick_at, { stop: true })

  // ── CLOSE FIRST, PAY ONLY IF THIS CALL CLOSED IT ─────────────────────────
  // Two cash-outs fired together both read an open run above and both paid.
  // The close is conditional on the run still being open; the request that
  // loses that race gets { ok: false } and pays nothing. Balances, Nav XP and
  // the lifetime counters then move IN PLACE (lib/wallet, bump_profile_stat),
  // and owned things are added once (arrayAdd), so nothing written here can
  // undo a purchase or a forge that landed while the run was being settled.
  const closed = await db.closeRun(uid, {
      ...(reelCharge !== null ? { anglers_patience_xp: reelCharge } : {}),
      gauntlet_run_open: false,
      gauntlet_run_state: null,
      gauntlet_resumes_used: 0,
      gauntlet_run_paused: false,
      gauntlet_run_terms: null,
      gauntlet_run_offer: null,
      // The Pressure behind the deepest hardcore cash-out — a depth 45 at 18
      // Pressure is a very different run to a clean 45, and the Ledger should
      // eventually be able to say so. (Against this descent's own hardcore
      // best; it read Davy's on a Don's run.)
      ...(hc && cd >= ((profile[HC.bestDepth] as number | null) ?? 0)
        ? { [HC.bestPressure]: runPressure } : {}),
      // Fold in the last stretch and stop the clock. The run row below reads the
      // same figure, so the log and the profile cannot disagree.
      ...runClock,
      ...recordFields,
    })
  if (!closed) return { ok: false }

  // BOUNTIES. How deep a single run got is a moment, not a total, so one row
  // per finished run; logged here, after the close, so a run logs once.
  void db.logBountyEvent(uid, hc ? 'gauntlet_hc_depth' : 'gauntlet_depth', cd)

  const bump = (col: string, n: number) => (n > 0 ? db.bumpStat(uid, col, n) : null)
  const [newDoubloons, newGems, newFathoms, newBloodGems, , , crewXP] = await Promise.all([
    db.grant(uid, 'doubloons', bankedDoubloons),
    db.grant(uid, 'gems', gems),
    db.grant(uid, 'gauntlet_fathoms', earnedFathoms),
    db.grant(uid, 'blood_gems', earnedBloodGems),
    Promise.all([
      bump('expedition_xp', bankedXp),
      // Lifetime Blood Gems earned (never decremented on spend) — backs the
      // Blood-Rich / Bloodhoard badges. Adds 0 on a normal (non-hc) cash-out.
      bump('blood_gems_earned', earnedBloodGems),
      // Lifetime counters for the achievement badges (a cash-out ends a run).
      bump('gauntlet_runs_completed', 1),
      bump('gauntlet_fathoms_earned', earnedFathoms),
      // Copies are allowed (Kong, 2026-09-30): each drop is one more.
      ...droppedItems.map(id => db.give(uid, 'raid_item', id)),
      ...grantSkins.map(id => db.addToList(uid, 'ship_skins', id)),
    ]),
    db.ledger(uid, bankedDoubloons, `${hc ? 'Hardcore ' : ''}${isDon ? "Don's" : 'Davy Jones'} Gauntlet: depth ${cd}`),
    // Crew XP is DECOUPLED from the player's Nav XP onto a raid-calibrated scale.
    // Hardcore survivors earn a bonus for bringing the squad home alive.
    grantXPToSeatedVia(db, uid, haul.crewXp),
    // LAST in the array on purpose: crewXP is destructured positionally above,
    // so anything inserted mid-list silently hands it the wrong result.
    db.logRun(uid, { variant, hardcore: hc, depth: cd, duration_ms: runClock.gauntlet_run_active_ms, outcome: 'cashed' }),
  ])

  // Davy's Terms feats. Awaited (never fire-and-forget) so the write lands before
  // we return: BadgeWatcher refetches off the doubloons-changed this cash-out
  // fires, and a racing grant would miss its own celebration.
  if (hc && runPressure > 0) {
    for (const id of pressureFeats(runTerms, payDepth)) {
      try { await db.grantBadge(uid, id) } catch { /* best-effort, never fail a cash-out */ }
    }
  }

  // Don's Gauntlet challenge feats — checked from the run's OWN snapshot at
  // cash-out (curses carried, damage taken, and how the shots were loosed), so
  // they can't be spoofed by a later run. One True Shot is derivable (max-hit
  // stat) and lives in badgeConditions instead.
  if (isDon) {
    for (const id of donFeats(runSnapshot, cd)) {
      try { await db.grantBadge(uid, id) } catch { /* best-effort */ }
    }
  }

  // Depth-milestone unlocks crossed by SURVIVING to this depth (cash-out only).
  // Hardcore surfaces its Drowned Fleet cosmetic unlocks here; normal surfaces
  // the standard depth unlocks. Same reward-screen shape for both.
  const unlockedThisRun = hc
    ? hcUnlocks.map(u => ({ name: u.name, blurb: 'A Drowned Fleet hull skin, worn only by hardcore captains.', where: 'Equip it on your ship' }))
    : GAUNTLET_DEPTH_UNLOCKS
        .filter(u => prevDeepest < u.depth && u.depth <= deepest)
        .map(u => ({ name: u.name, blurb: u.blurb, where: u.where }))

  return {
    ok: true,
    depth: cd,
    // The NAME is per-descent (Don's launders, Davy's drowns); the tier and
    // pot multiplier behind it are shared.
    chest: { tier: chest.tier, label: chestLabelFor(chest, variant), potMult: chest.potMult },
    bankedDoubloons,
    bankedXp,
    gems,
    newDoubloons,
    newGems,
    newExpeditionXP,
    deepest,
    crewXP,
    earnedFathoms,
    newFathoms,
    earnedBloodGems,
    runPressure,
    gemMult: Math.round(gemMult * 100) / 100,
    newBloodGems,
    droppedItems,
    droppedSkinId,
    droppedHcSkinId,
    droppedPressureSkinId,
    unlockedThisRun,
    hardcore: hc,
    offerTaken,
  }
}

export type GauntletDeath = { ok: boolean; deepest: number; earnedFathoms: number; newFathoms: number; hardcore: boolean; fallenCount: number }

/** Close an open run after a wipe. Banks no doubloons. Pays Fathoms for the
 *  ships you sank (the meta-currency rewards the dive itself), but a death does
 *  NOT touch your deepest record, the run recap, the leaderboard, the contest,
 *  or any depth-gated unlock — those advance only when you SURVIVE and cash out
 *  the depth (see cashOutGauntlet). Dying deep is not a shortcut to anything. */
export async function resolveGauntletDeath(db: GauntletData, uid: string, rewardDepth: number, combatDepth: number = rewardDepth, runSnapshot?: GauntletRunSnapshot): Promise<GauntletDeath> {
  const profile = await db.profile(uid, 'gauntlet_run_active_ms, gauntlet_run_tick_at, gauntlet_run_open, gauntlet_run_variant, gauntlet_deepest, gauntlet_fathoms, gauntlet_fathoms_earned, gauntlet_runs_completed, gauntlet_deepest_died, gauntlet_upgrades, gauntlet_upgrades_off, dons_gauntlet_deepest, dons_gauntlet_deepest_died, dons_gauntlet_upgrades, dons_gauntlet_upgrades_off, gauntlet_run_hardcore, gauntlet_hc_squad, gauntlet_hc_deepest_died, dons_gauntlet_hc_deepest_died')

  const isDon = ((profile?.gauntlet_run_variant as GauntletVariant | null) ?? 'davy') === 'don'
  const prevDeepest = ((isDon ? profile?.dons_gauntlet_deepest : profile?.gauntlet_deepest) as number | null) ?? 0
  if (!profile || profile.gauntlet_run_open !== true) {
    return { ok: false, deepest: prevDeepest, earnedFathoms: 0, newFathoms: (profile?.gauntlet_fathoms as number | null) ?? 0, hardcore: false, fallenCount: 0 }
  }

  // Fathoms bank on ships SUNK (rewardDepth) — earned win or lose, since they
  // reward descending, not surviving (Lucky Locker boosts the payout). Veteran's
  // Start's head start is excluded here, same as on cash-out.
  // Held against the run clock exactly as cashOutGauntlet is (MIN_MS_PER_DEPTH):
  // a death reported at depth 90 one second into a run pays for the depth the
  // clock allows, not the one it names.
  const clockMs = tickActiveMs(profile.gauntlet_run_active_ms, profile.gauntlet_run_tick_at, { stop: true }).gauntlet_run_active_ms
  const { rd, cd } = settleDepths(rewardDepth, combatDepth, clockMs,
    ((isDon ? profile.dons_gauntlet_upgrades : profile.gauntlet_upgrades) as string[] | null) ?? [])
  // Settle the Fence tab (run-scoped): spent Fathoms come out of this dive's
  // earnings, never the banked purse.
  const earnedFathoms = runFathoms(rd, isDon ? 'don' : 'davy', activeGauntletUpgrades(
    ((isDon ? profile.dons_gauntlet_upgrades : profile.gauntlet_upgrades) as string[] | null) ?? [],
    ((isDon ? profile.dons_gauntlet_upgrades_off : profile.gauntlet_upgrades_off) as string[] | null) ?? [],
  ), { fenceSpent: runSnapshot?.fenceSpent ?? 0 })
  const hardcore = profile.gauntlet_run_hardcore === true
  const squad = hardcore ? ((profile.gauntlet_hc_squad as number[] | null) ?? []) : []

  // Death depth tracking: hardcore deaths advance the hardcore counter (the
  // grim Ferryman's Toll badge); normal deaths advance the normal one (Greed's
  // Price). Kept apart so the two modes' badges don't cross-contaminate.
  const deathFields = hardcore
    ? { [hcCols(isDon ? 'don' : 'davy').deepestDied]: Math.max((profile[hcCols(isDon ? 'don' : 'davy').deepestDied] as number | null) ?? 0, cd), gauntlet_run_hardcore: false, gauntlet_hc_squad: null }
    : isDon
      ? { dons_gauntlet_deepest_died: Math.max((profile.dons_gauntlet_deepest_died as number | null) ?? 0, cd) }
      : { gauntlet_deepest_died: Math.max((profile.gauntlet_deepest_died as number | null) ?? 0, cd) }

  // Close the run + bank Fathoms ONLY (hardcore banks at the normal rate — the
  // premium is reserved for surviving). Deepest record / recap / unlocks belong
  // to cash-outs. Lifetime badge counters advance (a death still ends a run).
  const deathClock = tickActiveMs(
    (profile as any).gauntlet_run_active_ms, (profile as any).gauntlet_run_tick_at, { stop: true })

  // ── CLOSE FIRST, AND ONLY ONCE ────────────────────────────────────────────
  // Conditional on the run still being open, so two deaths reported together
  // (or a death racing a cash-out) settle the run once: the loser is told the
  // run is already closed and pays nothing, drowns nobody, logs nothing.
  const closed = await db.closeRun(uid, {
      gauntlet_run_open: false,
      gauntlet_run_state: null,
      gauntlet_resumes_used: 0,
      gauntlet_run_paused: false,
      gauntlet_run_terms: null,
      gauntlet_run_offer: null,
      ...deathClock,
      ...deathFields,
    })
  if (!closed) {
    return { ok: false, deepest: prevDeepest, earnedFathoms: 0, newFathoms: (profile.gauntlet_fathoms as number | null) ?? 0, hardcore: false, fallenCount: 0 }
  }

  // A run that ended in the water still reached its depth, and a bounty that
  // only paid on a clean cash-out would quietly punish pushing for one more.
  void db.logBountyEvent(uid, hardcore ? 'gauntlet_hc_depth' : 'gauntlet_depth', cd)

  // ── Hardcore permadeath — the squad you sent in is lost to the Locker ─────
  // Soft-delete the exact crew that entered (died_at + died_hardcore_depth so
  // the Crew Hall graveyard reads "Fell in Davy Jones's Locker, depth N"), and
  // clear their slots so they leave the roster. Mirrors the voyage death write.
  let fallenCount = 0
  if (hardcore && squad.length > 0) {
    fallenCount = await db.drownSquad(uid, squad, cd, nowIso())
  }

  // Fathoms and the lifetime counters move in place.
  const bump = (col: string, n: number) => (n > 0 ? db.bumpStat(uid, col, n) : null)
  const [newFathoms] = await Promise.all([
    db.grant(uid, 'gauntlet_fathoms', earnedFathoms),
    bump('gauntlet_runs_completed', 1),
    bump('gauntlet_fathoms_earned', earnedFathoms),
  ])

  // A death is a finished run too, and the one that matters most for pacing:
  // logging only cash-outs would measure the runs that went well.
  await db.logRun(uid, { variant: isDon ? 'don' : 'davy', hardcore, depth: cd, duration_ms: deathClock.gauntlet_run_active_ms, outcome: 'died' })

  return { ok: true, deepest: prevDeepest, earnedFathoms, newFathoms, hardcore, fallenCount }
}

/** Buy a bundle of a Fathoms-buyable lure (Golden / Luminous) with Fathoms.
 *  Repeatable (unlike the one-time Locker upgrades): deducts the bait's
 *  fathomCost and adds fathomBundle units to bait_inventory. Server-validated
 *  against the bait table so only the marked lures can be bought this way. */
export async function buyBaitWithFathoms(db: GauntletData, uid: string, baitType: string): Promise<
  { ok: true; fathoms: number; added: number; baitType: string } | { error: string }
> {
  const bait = getBait(baitType)
  const cost = bait.fathomCost ?? 0
  const bundle = bait.fathomBundle ?? 0
  if (bait.type !== baitType || cost <= 0 || bundle <= 0) return { error: 'That lure is not for sale here.' }

  // The spend is the guard, before the lures are handed over.
  const newFathoms = await db.spend(uid, 'gauntlet_fathoms', cost)
  if (newFathoms == null) return { error: 'Not enough Fathoms.' }
  await db.addBait(uid, baitType, bundle)
  return { ok: true, fathoms: newFathoms, added: bundle, baitType }
}

/** Mark the first-time explainer as seen so it doesn't auto-open again. Each
 *  Gauntlet tracks its own flag — Don's has a different explainer, so seeing
 *  Davy's must not suppress the Don's one (and vice versa). */
export async function markGauntletIntroSeen(db: GauntletData, uid: string, variant: GauntletVariant = 'davy'): Promise<void> {
  const col = variant === 'don' ? 'has_seen_dons_gauntlet_intro' : 'has_seen_gauntlet_intro'
  await db.updateProfile(uid, { [col]: true })
}
