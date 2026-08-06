'use server'

// Server-authoritative gate + payout for the Davy Jones Gauntlet.
// Combat is client-driven (same trust model as every raid). The server:
//   - consumes the daily attempt on START (so a quit-retry can't reroll a
//     bad opener), keyed by a date string on the profile;
//   - on CASH OUT, clamps the reported pot to the depth ceiling, applies the
//     depth-tiered chest multiplier, and banks doubloons / XP / gems;
//   - on DEATH, closes the run and banks nothing.
// The once-a-day gate is the real limiter, so we trust the client's reported
// depth/pot up to the computed ceiling.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logBountyEvent } from '@/app/(app)/expeditions/bountyActions'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { navRenownEffects, type RenownAlloc } from '@/lib/renown'
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'
import { termPressure, pressureGemMult, pressureFeats, pressureSkinDropChance, resolveTerms, PRESSURE_SKIN_ID, getTerm, type SignedTerms } from '@/lib/gauntletTerms'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { GOLD_HULL_SKIN_ID, GOLD_HULL_CHEST_TIER, BLOOD_HULL_SKIN_ID, BLOOD_HULL_CHEST_TIER, GALAXY_HULL_SKIN_ID, GALAXY_HULL_CHEST_TIER, GHOST_HULL_SKIN_ID, GHOST_HULL_CHEST_TIER, GHOST_HULL_DROP_MULT, DONS_GAUNTLET_ITEM_IDS, BLOOD_CANNON_ITEM_ID, BLOOD_CANNON_CHEST_TIER, maxPotForDepth, chestForDepth, chestLabelFor, chestCannonDropChance, chestSkinDropChance, MAX_GAUNTLET_DEPTH, GAUNTLET_REWARD_DEPTH_CAP, GAUNTLET_COOLDOWN_MS, GAUNTLET_DEPTH_UNLOCKS, fathomsForDepth, gauntletXpForDepth, gauntletCrewXp, DONS_CHEST_GEM_MULT, CONFLUENCES, hardcoreUnlocked, donsHardcoreUnlocked, hcCols, HARDCORE_LIVE, HARDCORE_UNLOCKS, HARDCORE_RUNS_PER_DAY, HC_FATHOMS_MULT, HC_SURVIVOR_XP_MULT, bloodGemsForDepth, coerceRunStats, chestOdds, type GauntletRunSnapshot, type GauntletRunState, type GauntletVariant } from '@/lib/gauntlet'
import { getGauntletUpgrade, isUpgradeComingSoon, isToggleableUpgrade, activeGauntletUpgrades, gauntletHaulMult, gauntletXpMult, gauntletFathomsMult, donsBloodGemMult, DONS_DAILY_TRIBUTE_ID, DONS_DAILY_TRIBUTE_AMOUNT } from '@/lib/gauntletUpgrades'
import { DAVY_FORGE } from '@/lib/raidItems'
import {
  rollOffer, offerCoinMult, offerFathomMult, offerChestMult,
  EMPTY_OFFER_STATE, CHEST_ODDS_CAP, type OfferState, type DavyOffer,
} from '@/lib/gauntletOffer'
import { GAUNTLET_DEEPEST_CONTEST_ENDS_AT } from '@/lib/contests'
import { getBait } from '@/lib/bait'
import { merchantPrice } from '@/lib/gauntletMerchant'
import { eyeCharge } from '@/lib/finnItems'
import { fortuneLootMult } from '@/lib/expeditions'
import { getRaidPlayerStats } from '../actions'

// Golden Gauntlet Hull — a rare Man-o-War-only cosmetic that drops only from the
// top chest tier (Davy Jones' Locker, chest tier 5 / depth 18+). Tunable here.

// Hardcore-only drops. Bad Blood Hull (Man-o-War skin) + Davy's Blood Cannon
// (the first lifesteal raid item) both come ONLY from Hardcore Gauntlet chests.
// Chase odds scale smoothly with cash-out depth — shared curves in
// lib/gauntlet (chestCannonDropChance / chestSkinDropChance) so the normal
// chases (Hand/Heavy cannons, Golden Hull) and the hardcore chases (Blood
// Cannon, Bad Blood Hull) roll the same ladder.

/** Record a single gauntlet hit; persists the all-time biggest via greatest()
 *  (bump_gauntlet_hit). Fired per new run-best from GauntletGame (win OR loss),
 *  so the Biggest Hit board reflects the largest blow ever landed in a descent. */
export async function recordGauntletHit(dmg: number): Promise<void> {
  if (!Number.isFinite(dmg) || dmg <= 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  const h = Math.floor(dmg)
  await admin.rpc('bump_gauntlet_hit', { uid: user.id, dmg: h })
  // Also track the lifetime biggest hit on the profile (for the One Shot badge).
  const { data: prof } = await admin.from('profiles').select('gauntlet_max_hit').eq('id', user.id).single()
  if (h > ((prof?.gauntlet_max_hit as number | null) ?? 0)) {
    await admin.from('profiles').update({ gauntlet_max_hit: h }).eq('id', user.id)
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
  return { depth, boons, curses, tides, stats: coerceRunStats(s.stats), at: new Date().toISOString() }
}

// ── Locker Upgrades — permanent perks, depth-gated + bought with Fathoms ───────

/** State for the Locker Upgrades panel: the player's deepest run, Fathoms purse,
 *  and which upgrades they've already claimed. */
export async function getGauntletUpgradeState(variant: GauntletVariant = 'davy'): Promise<{ deepest: number; fathoms: number; owned: string[]; ownedAll: string[]; off: string[]; hasAutoCatcher: boolean; hasAutoCaster: boolean; tributeReady: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { deepest: 0, fathoms: 0, owned: [], ownedAll: [], off: [], hasAutoCatcher: false, hasAutoCaster: false, tributeReady: false }
  const isDon = variant === 'don'
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    // Fathoms are the ONE shared purse; the deepest gate + owned/off sets are
    // per-variant (Don's has its own bespoke tree in dons_gauntlet_upgrades).
    .select('gauntlet_deepest, dons_gauntlet_deepest, gauntlet_fathoms, gauntlet_upgrades, gauntlet_upgrades_off, dons_gauntlet_upgrades, dons_gauntlet_upgrades_off, has_auto_catcher, has_auto_caster, dons_stipend_claimed_at')
    .eq('id', user.id)
    .single()
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
  return new Date(claimedAt).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
}

/** Claim The Don's Tribute — a free 10 Fathoms, once per UTC day, for owners of
 *  the dg_daily_tribute Locker perk. Server-authoritative: validates ownership
 *  and the once-a-day gate, then credits the shared Fathoms purse. */
export async function claimDailyTribute(): Promise<{ ok: true; fathoms: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_upgrades, dons_gauntlet_upgrades, gauntlet_fathoms, dons_stipend_claimed_at')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.' }
  const ownedAll = [
    ...((profile.gauntlet_upgrades as string[] | null) ?? []),
    ...((profile.dons_gauntlet_upgrades as string[] | null) ?? []),
  ]
  if (!ownedAll.includes(DONS_DAILY_TRIBUTE_ID)) return { error: 'You haven’t earned the Don’s Tribute.' }
  if (stipendClaimedToday(profile.dons_stipend_claimed_at as string | null)) return { error: 'You’ve already collected today’s tribute. Back tomorrow.' }

  const fathoms = ((profile.gauntlet_fathoms as number | null) ?? 0) + DONS_DAILY_TRIBUTE_AMOUNT
  await admin
    .from('profiles')
    .update({ gauntlet_fathoms: fathoms, dons_stipend_claimed_at: new Date().toISOString() })
    .eq('id', user.id)
  return { ok: true, fathoms }
}

/** Switch an owned Run Upgrade on or off. Only gauntlet-scope upgrades toggle
 *  (Ship & Shore permanents are always on); an id you don't own is rejected.
 *  The off-set is server-authoritative so a disabled upgrade truly contributes
 *  nothing — run behavior AND cash-out multipliers both read it. Returns the
 *  fresh off-set. */
export async function setGauntletUpgradeActive(id: string, active: boolean, variant: GauntletVariant = 'davy'): Promise<
  { ok: true; off: string[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  if (!isToggleableUpgrade(id)) return { error: 'That upgrade can’t be switched off.' }

  const isDon = variant === 'don'
  const ownedCol = isDon ? 'dons_gauntlet_upgrades' : 'gauntlet_upgrades'
  const offCol = isDon ? 'dons_gauntlet_upgrades_off' : 'gauntlet_upgrades_off'

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select(`${ownedCol}, ${offCol}`)
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.' }

  const owned = ((profile as Record<string, unknown>)[ownedCol] as string[] | null) ?? []
  if (!owned.includes(id)) return { error: 'You don’t own that upgrade.' }

  const off = ((profile as Record<string, unknown>)[offCol] as string[] | null) ?? []
  const nextOff = active ? off.filter(x => x !== id) : (off.includes(id) ? off : [...off, id])
  // Keep the set clean: never store ids the player no longer owns / can't toggle.
  const cleanOff = nextOff.filter(x => owned.includes(x) && isToggleableUpgrade(x))
  await admin.from('profiles').update({ [offCol]: cleanOff }).eq('id', user.id)
  return { ok: true, off: cleanOff }
}

/** Claim a Locker Upgrade. Server-validates the depth gate, the Fathoms cost,
 *  and no-double-claim, then deducts Fathoms + records the id. */
export async function claimGauntletUpgrade(id: string, variant: GauntletVariant = 'davy'): Promise<
  { ok: true; fathoms: number; owned: string[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const upgrade = getGauntletUpgrade(id)
  if (!upgrade) return { error: 'Unknown upgrade.' }
  if (isUpgradeComingSoon(id)) return { error: 'Coming soon.' }
  // An upgrade can only be bought in its OWN Locker (Don's tree is separate).
  if ((upgrade.gauntlet ?? 'davy') !== variant) return { error: 'Wrong Locker for that upgrade.' }

  const isDon = variant === 'don'
  const depthCol = isDon ? 'dons_gauntlet_deepest' : 'gauntlet_deepest'
  const ownedCol = isDon ? 'dons_gauntlet_upgrades' : 'gauntlet_upgrades'
  const otherOwnedCol = isDon ? 'gauntlet_upgrades' : 'dons_gauntlet_upgrades'

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select(`${depthCol}, gauntlet_fathoms, ${ownedCol}, ${otherOwnedCol}`)
    .eq('id', user.id)
    .single()
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
  const fathoms = (profile.gauntlet_fathoms as number | null) ?? 0
  if (fathoms < upgrade.cost) return { error: 'Not enough Fathoms.' }

  const newFathoms = fathoms - upgrade.cost
  const newOwned = [...owned, id]
  await admin.from('profiles').update({ gauntlet_fathoms: newFathoms, [ownedCol]: newOwned }).eq('id', user.id)
  return { ok: true, fathoms: newFathoms, owned: newOwned }
}

// The Drowned Shrine's "Davy's Coin" — a double-or-nothing wager of the player's
// banked Fathoms. Server-authoritative because Fathoms are persistent meta-
// currency that buys permanent upgrades: the stake is clamped to the balance +
// a hard cap, and the 50/50 is ROLLED HERE (a client can't force a win). EV is
// neutral, so even spamming it nets ~0 — the gate is just there to keep it sane.
const SHRINE_WAGER_CAP = 10
export async function wagerGauntletFathoms(stake: number): Promise<
  { ok: true; won: boolean; stake: number; fathoms: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_fathoms, gauntlet_run_open')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.' }
  if (!profile.gauntlet_run_open) return { error: 'No run in progress.' }

  const balance = (profile.gauntlet_fathoms as number | null) ?? 0
  const staked = Math.min(Math.max(1, Math.floor(stake || 0)), SHRINE_WAGER_CAP, balance)
  if (staked < 1) return { error: 'No Fathoms to wager.' }

  const won = Math.random() < 0.5
  const newFathoms = Math.max(0, won ? balance + staked : balance - staked)
  await admin.from('profiles').update({ gauntlet_fathoms: newFathoms }).eq('id', user.id)
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
export async function buyMerchantItem(itemId: string): Promise<
  { ok: true } | { error: string }
> {
  if (merchantPrice(itemId) == null) return { error: 'Unknown item.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.' }
  if (!profile.gauntlet_run_open) return { error: 'No run in progress.' }

  return { ok: true }
}

// Record confluences the player has discovered (first unlocked), so the Synergies
// codex reveals them permanently. Fire-and-forget from the client on a first-ever
// unlock. Ids are validated against the real catalog so junk can't be written.
const VALID_CONFLUENCE_IDS = new Set(CONFLUENCES.map(c => c.id))
export async function markConfluencesSeen(ids: string[]): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const valid = (ids ?? []).filter(id => VALID_CONFLUENCE_IDS.has(id))
  if (valid.length === 0) return { ok: true }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('gauntlet_confluences_seen').eq('id', user.id).single()
  const seen = (profile?.gauntlet_confluences_seen as string[] | null) ?? []
  const next = Array.from(new Set([...seen, ...valid]))
  if (next.length !== seen.length) {
    await admin.from('profiles').update({ gauntlet_confluences_seen: next }).eq('id', user.id)
  }
  return { ok: true }
}

/** The single deepest run across all captains + this player's own deepest.
 *  Surfaced on the gauntlet map node. */
export async function getGauntletLeaderboard(variant: GauntletVariant = 'davy'): Promise<{
  top: { name: string; depth: number } | null
  mine: number
  /** #1 on the hardcore-only Drowned Ledger + this player's hardcore best.
   *  Each descent has its OWN ledger, so this is whichever one you are looking at. */
  hardcoreTop: { name: string; depth: number } | null
  hardcoreMine: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isDon = variant === 'don'

  const admin = createAdminClient()
  // #1 deepest CASHED-OUT descent (the leaderboard views exclude deaths +
  // admins), same depth → FIRST-TO-DEPTH → fastest ordering as the board
  // (leaderboard/actions fetchGauntlet — keep in sync). One query per ledger.
  const topQuery = (view: string) => admin
    .from(view)
    .select('username, score')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .order('time_ms', { ascending: true })
    .limit(1)
    .maybeSingle()
  const [{ data: top }, hc] = await Promise.all([
    topQuery(isDon ? 'leaderboard_dons_gauntlet' : 'leaderboard_gauntlet'),
    topQuery(hcCols(variant).ledger),
  ])
  const hcTop = hc?.data ?? null

  let mine = 0
  let hardcoreMine = 0
  if (user) {
    const { data: me } = await admin
      .from('profiles')
      .select('gauntlet_deepest, gauntlet_hc_deepest, dons_gauntlet_deepest, dons_gauntlet_hc_deepest')
      .eq('id', user.id)
      .single()
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

/** Whether the player can start a run now (cooldown elapsed) + their lifetime
 *  deepest + when the next run unlocks (ISO, null when available now). */
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
async function throneCleared(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('raid_completions')
    .select('id')
    .eq('user_id', userId)
    .eq('raid_id', 'the_throne')
    .limit(1)
    .maybeSingle()
  return !!data
}

export async function getGauntletDailyState(variant: GauntletVariant = 'davy'): Promise<{ available: boolean; deepest: number; fathoms: number; nextAt: string | null; deepestRun: GauntletRunSnapshot | null; hcDeepestRun: GauntletRunSnapshot | null; lastRun: GauntletRunSnapshot | null; hcLastRun: GauntletRunSnapshot | null; resumeState: GauntletRunState | null; resumePaused: boolean; hardcoreUnlocked: boolean; hardcoreLive: boolean; hcDeepest: number; hcRunsLeft: number; runHardcore: boolean; runTerms: SignedTerms | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { available: false, deepest: 0, fathoms: 0, nextAt: null, deepestRun: null, hcDeepestRun: null, lastRun: null, hcLastRun: null, resumeState: null, resumePaused: false, hardcoreUnlocked: false, hardcoreLive: HARDCORE_LIVE, hcDeepest: 0, hcRunsLeft: 0, runHardcore: false, runTerms: null }

  const isDon = variant === 'don'
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_last_run_at, gauntlet_deepest, gauntlet_fathoms, gauntlet_deepest_run, gauntlet_hc_deepest_run, gauntlet_last_run, gauntlet_hc_last_run, dons_gauntlet_last_run, is_admin, gauntlet_run_open, gauntlet_run_state, gauntlet_resumes_used, gauntlet_run_paused, gauntlet_hc_deepest, gauntlet_run_hardcore, gauntlet_hc_last_run_at, gauntlet_hc_runs_today, raid_node_progress, gauntlet_run_terms, gauntlet_run_variant, dons_gauntlet_deepest, dons_gauntlet_deepest_run, dons_gauntlet_hc_deepest, dons_gauntlet_hc_deepest_run, dons_gauntlet_hc_last_run, dons_gauntlet_hc_last_run_at, dons_gauntlet_hc_runs_today')
    .eq('id', user.id)
    .single()
  // "One run at a time": a resume only belongs to THIS gauntlet if the open run's
  // variant matches (a paused Davy run must not surface on the Don's screen).
  const openVariant = ((profile?.gauntlet_run_variant as GauntletVariant | null) ?? 'davy')

  // Admins can run it as often as they like (testing the curve).
  const isAdmin = profile?.is_admin === true
  const lastRunAt = profile?.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const nextMs = lastRunAt + GAUNTLET_COOLDOWN_MS
  const available = isAdmin || Date.now() >= nextMs

  // A run left open with a saved checkpoint can be picked back up. Two flavours:
  //   • PAUSED (deliberate — player hit "Pause & step away"): unlimited resumes,
  //     doesn't spend the crash budget. For taking breaks.
  //   • CRASH (disconnect): one forced resume per run (server-owned counter).
  // resumePaused tells the client which resume screen to show.
  const runState = (profile?.gauntlet_run_state as GauntletRunState | null) ?? null
  const resumesUsed = (profile?.gauntlet_resumes_used as number | null) ?? 0
  const runPaused = profile?.gauntlet_run_paused === true
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
  const hcSameUtcDay = !!hcLastAt && hcLastAt.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
  const hcUsedToday = hcSameUtcDay ? Number(profile?.[HC.runsToday] ?? 0) : 0
  const hcRunsLeft = isAdmin ? HARDCORE_RUNS_PER_DAY : Math.max(0, HARDCORE_RUNS_PER_DAY - hcUsedToday)
  const donsDeepest = (profile?.dons_gauntlet_deepest as number | null) ?? 0
  const throne = isDon ? await throneCleared(admin, user.id) : false
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
      ? donsHardcoreUnlocked({ isAdmin, throneCleared: throne, donsDeepest })
      : hardcoreUnlocked({ isAdmin, clearedNodes, deepest }),
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
export async function checkpointGauntletRun(state: GauntletRunState): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('gauntlet_run_open').eq('id', user.id).single()
  if (profile?.gauntlet_run_open !== true) return { ok: false }

  await admin.from('profiles').update({ gauntlet_run_state: state }).eq('id', user.id)
  return { ok: true }
}

/** DELIBERATE pause — the player hit "Pause & step away" at a breather. Saves the
 *  checkpoint and flags the run as paused so it resumes UNLIMITED times (no crash
 *  budget spent). For taking breaks mid-run without cashing out. */
export async function pauseGauntletRun(state: GauntletRunState): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('gauntlet_run_open').eq('id', user.id).single()
  if (profile?.gauntlet_run_open !== true) return { ok: false }

  await admin.from('profiles').update({ gauntlet_run_state: state, gauntlet_run_paused: true }).eq('id', user.id)
  return { ok: true }
}

/** Pick a run back up. A PAUSED run (deliberate) resumes without limit and doesn't
 *  touch the crash budget. A CRASHED run spends its single server-owned resume.
 *  Refuses if there's no open run, no checkpoint, or a crash resume is spent. */
export async function resumeGauntletRun(): Promise<{ ok: false } | { ok: true; state: GauntletRunState; offer: DavyOffer | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    // gauntlet_run_offer rides along: a live Davy's Offer lives in its OWN column
    // (not the run-state checkpoint), so a resume that only restored the state
    // dropped it — the offer vanished on any leave-and-resume. Hand it back.
    .select('gauntlet_run_open, gauntlet_run_state, gauntlet_resumes_used, gauntlet_run_paused, gauntlet_run_offer')
    .eq('id', user.id).single()

  const state = (profile?.gauntlet_run_state as GauntletRunState | null) ?? null
  if (profile?.gauntlet_run_open !== true || !state) return { ok: false }

  const offer = ((profile?.gauntlet_run_offer as OfferState | null) ?? EMPTY_OFFER_STATE).live

  if (profile?.gauntlet_run_paused === true) {
    // Deliberate pause: unlimited, no crash budget spent. Clear the flag — the run
    // is live again (a later disconnect from here is a normal crash resume).
    await admin.from('profiles').update({ gauntlet_run_paused: false }).eq('id', user.id)
    return { ok: true, state, offer }
  }

  // Crash resume: one per run, server-owned counter (ignores any client value).
  const used = (profile?.gauntlet_resumes_used as number | null) ?? 0
  if (used >= 1) return { ok: false }
  await admin.from('profiles').update({ gauntlet_resumes_used: used + 1 }).eq('id', user.id)
  return { ok: true, state, offer }
}

/** Consume the run attempt (start the cooldown) and open a run. Starting (not
 *  finishing) spends it, so a quit-retry can't reroll a bad opener.
 *
 *  Hardcore: the crew you send in (your living raid party) is snapshotted into
 *  gauntlet_hc_squad and PERMANENTLY dies on death/abandon. Gated server-side —
 *  admin-only until HARDCORE_LIVE, then unlock + a living squad. */
export async function startGauntletRun(hardcore = false, terms?: SignedTerms, variant: GauntletVariant = 'davy'): Promise<{ started: boolean; reason?: 'cooldown' | 'locked' | 'no_squad' | 'other_run'; deepest: number; nextAt?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { started: false, reason: 'cooldown', deepest: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_last_run_at, gauntlet_deepest, is_admin, raid_node_progress, gauntlet_hc_last_run_at, gauntlet_hc_runs_today, gauntlet_run_open, gauntlet_run_variant, dons_gauntlet_deepest, dons_gauntlet_hc_last_run_at, dons_gauntlet_hc_runs_today')
    .eq('id', user.id)
    .single()

  const isDon = variant === 'don'
  const HC = hcCols(variant)
  const deepest = ((isDon ? (profile?.dons_gauntlet_deepest as number | null) : (profile?.gauntlet_deepest as number | null)) ?? 0)
  const isAdmin = profile?.is_admin === true
  // One run at a time: block starting THIS gauntlet while a DIFFERENT gauntlet's
  // run is still open (its checkpoint + records would otherwise get stomped).
  const openVariant = ((profile?.gauntlet_run_variant as GauntletVariant | null) ?? 'davy')
  if (profile?.gauntlet_run_open === true && openVariant !== variant) {
    return { started: false, reason: 'other_run', deepest }
  }
  const lastRunAt = profile?.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const nextMs = lastRunAt + GAUNTLET_COOLDOWN_MS
  // Admins bypass the cooldown so they can run it repeatedly to test.
  if (!isAdmin && Date.now() < nextMs) {
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
      ? donsHardcoreUnlocked({ isAdmin, throneCleared: await throneCleared(admin, user.id), donsDeepest: (profile?.dons_gauntlet_deepest as number | null) ?? 0 })
      : hardcoreUnlocked({ isAdmin, clearedNodes, deepest })
    if (!gateOk) {
      return { started: false, reason: 'locked', deepest }
    }
    // Hardcore is capped at HARDCORE_RUNS_PER_DAY per UTC day (admins bypass so
    // they can test). The count resets when the UTC date of the last run differs
    // from today's; when capped, the run reopens at the next UTC midnight.
    // THREE PER DESCENT, not three shared: Davy's budget and the Don's are
    // counted in different columns, so spending your Davy runs leaves his three
    // untouched.
    const now = new Date()
    const hcLastAt = profile?.[HC.lastRunAt] ? new Date(profile[HC.lastRunAt] as string) : null
    const sameUtcDay = !!hcLastAt && hcLastAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
    const runsToday = sameUtcDay ? Number(profile?.[HC.runsToday] ?? 0) : 0
    if (!isAdmin && runsToday >= HARDCORE_RUNS_PER_DAY) {
      const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      return { started: false, reason: 'cooldown', deepest, nextAt: nextMidnight.toISOString() }
    }
    hcRunsToday = runsToday + 1
    // The squad = the living raid party. Snapshot their ids; these are the crew
    // that drown on death/abandon (resolveGauntletDeath reads gauntlet_hc_squad).
    const { data: squadRows } = await admin
      .from('user_crew')
      .select('id')
      .eq('user_id', user.id)
      .not('raid_slot', 'is', null)
      .is('died_at', null)
    const squad = (squadRows ?? []).map(r => r.id as number)
    if (squad.length === 0) return { started: false, reason: 'no_squad', deepest }
    // The squad column stays SHARED on purpose: only one run is ever open, so
    // only one squad is ever at risk. The date and the counter are per-descent.
    hcFields = { gauntlet_run_hardcore: true, gauntlet_hc_squad: squad, [HC.lastRunAt]: new Date().toISOString(), [HC.runsToday]: hcRunsToday, gauntlet_run_terms: signedTerms }
  }

  await admin
    .from('profiles')
    .update({ gauntlet_last_run_at: new Date().toISOString(), gauntlet_run_open: true, gauntlet_run_variant: variant, gauntlet_run_state: null, gauntlet_resumes_used: 0, gauntlet_run_paused: false, gauntlet_run_offer: null, ...hcFields })
    .eq('id', user.id)

  return { started: true, deepest }
}

/** Cash out an open run at the reached depth, banking the (clamped) pot ×
 *  chest multiplier + the chest's gem bonus. Closes the run. */
// ── DAVY'S OFFER ─────────────────────────────────────────────────────────────
// Called once when a breather opens (right after the run checkpoints, so the depth
// below is the one WE stored, not one the client can name). The server decides
// whether an offer happens, what kind it is and what tier — the client is only ever
// TOLD. All it supplies is its hull fraction, and lying about that can at worst earn
// an offer while wounded, which the bounded payout below makes worthless.
export async function rollDavyOffer(hpPct: number): Promise<{ offer: DavyOffer | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { offer: null }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_run_state, gauntlet_run_offer, gauntlet_run_hardcore, gauntlet_run_terms, gauntlet_run_variant, raid_items, ship_skins')
    .eq('id', user.id)
    .single()

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
    ownedItems: (profile.raid_items as string[] | null) ?? [],
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

  await admin.from('profiles').update({ gauntlet_run_offer: next }).eq('id', user.id)
  return { offer: next.live }
}

export async function cashOutGauntlet(rewardDepth: number, combatDepth: number, pot: number, runSnapshot?: GauntletRunSnapshot, takeOffer = false): Promise<
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
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_run_variant, gauntlet_deepest, gauntlet_last_run_at, gauntlet_best_depth, gauntlet_best_depth_ms, gauntlet_contest_depth, gauntlet_fathoms, gauntlet_fathoms_earned, gauntlet_runs_completed, gauntlet_upgrades, gauntlet_upgrades_off, dons_gauntlet_deepest, dons_gauntlet_best_depth, dons_gauntlet_best_depth_ms, dons_gauntlet_deepest_run, dons_gauntlet_upgrades, dons_gauntlet_upgrades_off, expedition_xp, doubloons, gems, ship_classes, nav_renown_alloc, raid_items, ship_skins, gauntlet_run_hardcore, gauntlet_hc_deepest, gauntlet_hc_best_depth, gauntlet_hc_best_depth_ms, dons_gauntlet_hc_deepest, dons_gauntlet_hc_best_depth, dons_gauntlet_hc_best_depth_ms, dons_gauntlet_hc_best_pressure, blood_gems, blood_gems_earned, gauntlet_run_terms, gauntlet_hc_best_pressure, gauntlet_run_offer, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
    .eq('id', user.id)
    .single()

  if (!profile || profile.gauntlet_run_open !== true) return { ok: false }

  // Which gauntlet is this open run? Don's writes its OWN records (separate
  // leaderboard) + reads its own Locker; the Fathoms purse + lifetime counters
  // stay shared. (A Don's run is never hardcore in slice 0 — HC is a fast-follow.)
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
  const rd = Math.max(0, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(rewardDepth)))
  const cd = Math.max(rd, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(combatDepth)))
  // BOUNTIES. How deep a single run got is a moment, not a total:
  // profiles.gauntlet_deepest is a lifetime high-water mark, so a captain who
  // has already seen 15 could never complete "reach depth 10 today" from it.
  // One row per finished run is the only honest way to answer that, and this is
  // the only place in the game bounties needed a hook at all.
  // Fire and forget: a lost tick costs a bounty, never a run.
  void logBountyEvent(user.id, hc ? 'gauntlet_hc_depth' : 'gauntlet_depth', cd)
  if (rd <= 0) {
    // Nothing cleared — just close the run.
    await admin.from('profiles').update({ gauntlet_run_open: false }).eq('id', user.id)
    return { ok: false }
  }

  // Economy cap: everything that PAYS (pot, XP, crew XP, Blood Gems) is
  // evaluated as if the run ended at GAUNTLET_REWARD_DEPTH_CAP. Depth past it
  // still counts for the record / leaderboard / contest / Fathoms (cd below).
  const payDepth = Math.min(rd, GAUNTLET_REWARD_DEPTH_CAP)
  const cleanPot = Math.max(0, Math.min(Math.floor(pot), maxPotForDepth(payDepth, variant)))
  const chest = chestForDepth(payDepth)

  // Run Upgrades (Locker, scope 'gauntlet') that sweeten the cash-out — minus
  // any the player has switched off, so a disabled Salvager's Eye / Navigator's
  // Log / Lucky Locker really pays nothing.
  const upgrades   = activeGauntletUpgrades(
    ((isDon ? profile.dons_gauntlet_upgrades : profile.gauntlet_upgrades) as string[] | null) ?? [],
    ((isDon ? profile.dons_gauntlet_upgrades_off : profile.gauntlet_upgrades_off) as string[] | null) ?? [],
  )

  // DAVY'S OFFER — honored only if he actually made one AND the player is banking at
  // the very depth he made it. Both come from the column WE wrote at the breather, so
  // a client cannot conjure a deal, upgrade its tier, or carry a shallow offer down to
  // a deeper pot. Anything else means no deal, and no deal means no bonus.
  const offerState  = (profile.gauntlet_run_offer as OfferState | null) ?? EMPTY_OFFER_STATE
  const offerTaken: DavyOffer | null =
    takeOffer && offerState.live && offerState.live.depth === rd ? offerState.live : null
  const offerChest  = offerChestMult(offerTaken)

  // Davy cannon chest drops — each component rolls independently at the chest
  // tier's chance, only for cannons not yet owned, and never once the player
  // has forged them into the Grand Cannon. Every chance below runs through
  // chestDrop(), which is the SAME capped multiply the breather showed the player.
  // Item drops are Davy's-Gauntlet-only — the Davy cannons never roll in a Don's
  // run. Don's has its own chase (the hull skins below); it drops no cannons.
  const ownedItems = (profile.raid_items as string[] | null) ?? []
  // CREW FORTUNE. Read server-side from the deployed party, never taken from
  // the client, and folded into the same chestDrop() every chase roll below
  // runs through. getRaidPlayerStats is the exact loader the gauntlet page uses
  // for the stat panel, so the number here is the number the player was shown.
  const fortuneOdds = fortuneLootMult((await getRaidPlayerStats(user.id)).totalFortune)
  const chestDrop = (c: number) => Math.min(CHEST_ODDS_CAP, c * offerChest * fortuneOdds)
  const dropChance = chestDrop(chestCannonDropChance(cd))
  const droppedItems: string[] = []
  // Purely "do you hold this one", NOT "have you built the Grand". The forge is
  // destructive, so building it CONSUMES both components; gating on the result
  // meant a forged captain owned neither cannon and could never roll one again.
  // Re-forging is blocked by forgeRaidItem's own `Already forged` check, so a
  // recovered component can be equipped but never turned into a second Grand.
  if (!isDon) {
    for (const cannon of DAVY_FORGE.components) {
      if (!ownedItems.includes(cannon) && Math.random() < dropChance) droppedItems.push(cannon)
    }
  }
  // Don's Gauntlet item chase — its own two items, same any-chest curve.
  if (isDon) {
    for (const itemId of DONS_GAUNTLET_ITEM_IDS) {
      if (!ownedItems.includes(itemId) && Math.random() < dropChance) droppedItems.push(itemId)
    }
  }
  // Davy's Blood Cannon — HARDCORE-only chase (the first lifesteal item), from
  // the deeper hardcore chests. Stops only while you HOLD it: fusing it into the
  // Bloodletter or the Reaver's Cannon consumes it, so it becomes farmable again
  // rather than leaving the slot permanently empty.
  if (!isDon && hc && chest.tier >= BLOOD_CANNON_CHEST_TIER && !ownedItems.includes(BLOOD_CANNON_ITEM_ID) && Math.random() < chestDrop(chestCannonDropChance(cd))) {
    droppedItems.push(BLOOD_CANNON_ITEM_ID)
  }
  const newRaidItems = droppedItems.length > 0 ? [...new Set([...ownedItems, ...droppedItems])] : ownedItems

  // DAVY'S TERMS — the Pressure this run actually carried, derived from the terms
  // column WE stored at run start and never from the client. Hoisted above the skin
  // rolls because the Pitch Black Hull's drop chance keys off it.
  const runTerms = (profile.gauntlet_run_terms as SignedTerms | null) ?? null
  const runPressure = hc ? termPressure(runTerms) : 0

  // The deep-chest Man-o-War hull chase, variant-specific: Davy's drops the
  // Golden Gauntlet Hull, Don's drops the Galaxy Hull. Same chest tier + odds.
  // Granted to ship_skins even before the player owns the Man-o-War to wear it.
  const ownedSkins = (profile.ship_skins as string[] | null) ?? []
  const normalHullId  = isDon ? GALAXY_HULL_SKIN_ID : GOLD_HULL_SKIN_ID
  const normalHullTier = isDon ? GALAXY_HULL_CHEST_TIER : GOLD_HULL_CHEST_TIER
  let droppedSkinId: string | null = null
  if (chest.tier >= normalHullTier && !ownedSkins.includes(normalHullId) && Math.random() < chestDrop(chestSkinDropChance(cd))) {
    droppedSkinId = normalHullId
  }
  // The SECOND Man-o-War hull. Davy's = Bad Blood Hull (HARDCORE-only). Don's =
  // Ghost Hull, a NORMAL drop one chest tier below the Galaxy Hull.
  const secondHullId   = isDon ? GHOST_HULL_SKIN_ID : BLOOD_HULL_SKIN_ID
  const secondHullTier = isDon ? GHOST_HULL_CHEST_TIER : BLOOD_HULL_CHEST_TIER
  const secondHullNeedsHc = !isDon   // only Davy's Bad Blood is hardcore-gated
  // Don's Ghost Hull is the rarer of its two hulls — half the normal skin rate.
  const secondHullChance = chestSkinDropChance(cd) * (isDon ? GHOST_HULL_DROP_MULT : 1)
  let droppedHcSkinId: string | null = null
  if ((!secondHullNeedsHc || hc) && chest.tier >= secondHullTier && !ownedSkins.includes(secondHullId) && Math.random() < chestDrop(secondHullChance)) {
    droppedHcSkinId = secondHullId
  }
  // Pitch Black Hull — the PRESSURE-exclusive drop (Davy's only). Needs hardcore,
  // a heavy board AND a deep bank, all on this one run: pressureSkinDropChance
  // returns a hard 0 below either gate, so no shallow sign-and-bank can ever roll it.
  let droppedPressureSkinId: string | null = null
  if (!isDon && hc && !ownedSkins.includes(PRESSURE_SKIN_ID) && Math.random() < chestDrop(pressureSkinDropChance(runPressure, payDepth))) {
    droppedPressureSkinId = PRESSURE_SKIN_ID
  }
  // Hardcore Drowned Fleet skins — granted the first time you cash out past a
  // hardcore-depth milestone (mirrors GAUNTLET_DEPTH_UNLOCKS but for cosmetics).
  const HC = hcCols(isDon ? 'don' : 'davy')
  const prevHcDeepest = (profile[HC.deepest] as number | null) ?? 0
  const hcDeepest = hc ? Math.max(prevHcDeepest, cd) : prevHcDeepest
  const hcUnlocks = hc ? HARDCORE_UNLOCKS.filter(u => prevHcDeepest < u.depth && u.depth <= hcDeepest) : []
  const hcSkinIds = hcUnlocks.map(u => u.skinId).filter(id => !ownedSkins.includes(id))
  const grantSkins = [...(droppedSkinId ? [droppedSkinId] : []), ...(droppedHcSkinId ? [droppedHcSkinId] : []), ...(droppedPressureSkinId ? [droppedPressureSkinId] : []), ...hcSkinIds]
  const skinFields = grantSkins.length > 0 ? { ship_skins: [...new Set([...ownedSkins, ...grantSkins])] } : {}

  // Blood Gems — the Hardcore premium currency, dropped in the cash-out chest
  // (survive-only). Amount is a live server roll (~0.5–0.7 per reward depth), so
  // deeper survival = more. Normal runs earn none.
  // DAVY'S TERMS — Pressure multiplies Blood Gems and NOTHING else (doubloons,
  // Nav XP and Fathoms all stay 1x, so the main economy never sees this). The
  // Pressure is derived from the terms column WE stored at run start, never from
  // the client. The multiplier also ramps in with depth (pressureGemMult), so
  // signing the whole board and farming short shallow dives pays nothing — you
  // have to be deep AND heavy. (runPressure is derived above, beside the skin rolls.)
  const gemMult = pressureGemMult(runPressure, payDepth)
  // Crimson Tithe (Don's account perk) — +15% Blood Gems from any Hardcore dive.
  // Account permanent, so read the UNION of both Lockers' owned upgrades.
  const accountUpgrades = [
    ...((profile.gauntlet_upgrades as string[] | null) ?? []),
    ...((profile.dons_gauntlet_upgrades as string[] | null) ?? []),
  ]
  const baseBloodGems   = hc ? bloodGemsForDepth(payDepth, Math.random()) : 0
  const earnedBloodGems = Math.round(baseBloodGems * gemMult * donsBloodGemMult(accountUpgrades))
  const newBloodGems    = ((profile.blood_gems as number | null) ?? 0) + earnedBloodGems

  const classPicks = (profile.ship_classes as Record<string, string> | null) ?? {}
  const navRenown = navRenownEffects(profile.nav_renown_alloc as RenownAlloc | null)
  const doubloonMult = aggregateShipClasses(classPicks).doubloonMult * navRenown.doubloonMult

  const bankedDoubloons = Math.round(cleanPot * chest.potMult * doubloonMult * gauntletHaulMult(upgrades) * offerCoinMult(offerTaken))
  // Nav XP is decoupled from the doubloon pot onto its own gentler depth curve
  // (leveling was the sharper concern). Chest multiplier still rides on top.
  const bankedXp        = Math.round(gauntletXpForDepth(payDepth, variant) * chest.potMult * gauntletXpMult(upgrades))
  // Don's chests hand out richer gems (the valuable chest reward) — via the gem
  // count only, NOT chest.potMult, so Nav XP + doubloons stay on their own mults.
  const gems            = Math.round(chest.gems * (isDon ? DONS_CHEST_GEM_MULT : 1))

  // Fathoms — the Gauntlet's meta-currency — bank on reaching this depth
  // (Lucky Locker boosts the payout).
  // Fathoms (meta-currency) bank on ships SUNK (rewardDepth), so Veteran's Start
  // never farms the currency that buys upgrades — only the deepest record /
  // contest / leaderboard below count the combat depth.
  // Hardcore now banks Fathoms at the SAME rate as normal (HC_*_MULT = 1); its
  // only added payout is Blood Gems above.
  // Settle the Fence tab: Fathoms spent at the Fence this run come out of this
  // dive's earned Fathoms (run-scoped), clamped so a purchase can never turn the
  // grant negative or dip into the banked purse.
  const grossFathoms     = Math.round(fathomsForDepth(rd, variant) * gauntletFathomsMult(upgrades) * (hc ? HC_FATHOMS_MULT : 1) * offerFathomMult(offerTaken))
  const fenceSpent       = Math.max(0, Math.round(runSnapshot?.fenceSpent ?? 0))
  const earnedFathoms    = Math.max(0, grossFathoms - fenceSpent)
  const newFathoms       = ((profile.gauntlet_fathoms as number | null) ?? 0) + earnedFathoms
  const newDoubloons     = (profile.doubloons ?? 0) + bankedDoubloons
  const newGems          = (profile.gems ?? 0) + gems
  const newExpeditionXP  = (profile.expedition_xp ?? 0) + bankedXp
  // A cash-out is Navigation XP, so it charges The Primeval Eye too.
  const reelCharge = eyeCharge(profile as Parameters<typeof eyeCharge>[0], bankedXp)
  const prevDeepest      = ((isDon ? profile.dons_gauntlet_deepest : profile.gauntlet_deepest) as number | null) ?? 0
  // The mode's own depth record (return value): hardcore → Drowned Ledger depth.
  const deepest          = hc ? hcDeepest : Math.max(prevDeepest, cd)

  // Wall-clock run time (server-computed from the run-start stamp) for the
  // leaderboard tiebreaker — can't be faked client-side.
  const lastRunAt   = profile.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const runMs       = lastRunAt > 0 ? Math.max(0, Date.now() - lastRunAt) : null

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
    const hcNewDepth    = runMs != null && cd > prevHcBestDep
    const hcFasterSame  = runMs != null && cd === prevHcBestDep && (prevHcBestMs == null || runMs < prevHcBestMs)
    recordFields = {
      [HC.deepest]: hcDeepest,
      gauntlet_run_hardcore: false,
      gauntlet_hc_squad: null,
      ...(hcNewDepth
        ? { [HC.bestDepth]: cd, [HC.bestMs]: runMs, [HC.bestAt]: new Date().toISOString() }
        : hcFasterSame ? { gauntlet_hc_best_depth_ms: runMs } : {}),
      ...(cd > prevHcDeepest ? { [HC.deepestRun]: sanitizeRunSnapshot(runSnapshot, cd) } : {}),
      ...(runSnapshot ? { [HC.lastRun]: sanitizeRunSnapshot(runSnapshot, cd) } : {}),   // most recent cash-out, always
    }
  } else if (isDon) {
    // Don's Gauntlet — its OWN records / leaderboard (never touches Davy's, and
    // no Deepest-Descent contest, which is Davy-specific).
    const prevBestDep = (profile.dons_gauntlet_best_depth as number | null) ?? 0
    const prevBestMs  = (profile.dons_gauntlet_best_depth_ms as number | null) ?? null
    const newDepth    = runMs != null && cd > prevBestDep
    const fasterSame  = runMs != null && cd === prevBestDep && (prevBestMs == null || runMs < prevBestMs)
    recordFields = {
      dons_gauntlet_deepest: deepest,
      ...(newDepth
        ? { dons_gauntlet_best_depth: cd, dons_gauntlet_best_depth_ms: runMs, dons_gauntlet_best_depth_at: new Date().toISOString() }
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
    const newDepth    = runMs != null && cd > prevBestDep
    const fasterSame  = runMs != null && cd === prevBestDep && (prevBestMs == null || runMs < prevBestMs)
    const contestActive  = Date.now() < Date.parse(GAUNTLET_DEEPEST_CONTEST_ENDS_AT)
    const prevContestDep = (profile.gauntlet_contest_depth as number | null) ?? 0
    recordFields = {
      gauntlet_deepest: deepest,
      ...(newDepth
        ? { gauntlet_best_depth: cd, gauntlet_best_depth_ms: runMs, gauntlet_best_depth_at: new Date().toISOString() }
        : fasterSame ? { gauntlet_best_depth_ms: runMs } : {}),
      ...(contestActive && cd > prevContestDep ? { gauntlet_contest_depth: cd, gauntlet_contest_depth_at: new Date().toISOString() } : {}),
      ...(cd > prevDeepest ? { gauntlet_deepest_run: sanitizeRunSnapshot(runSnapshot, cd) } : {}),
      ...(runSnapshot ? { gauntlet_last_run: sanitizeRunSnapshot(runSnapshot, cd) } : {}),   // most recent cash-out, always
    }
  }

  const [, , crewXP] = await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      gems: newGems,
      expedition_xp: newExpeditionXP,
      ...(reelCharge !== null ? { anglers_patience_xp: reelCharge } : {}),
      gauntlet_run_open: false,
      gauntlet_run_state: null,
      gauntlet_resumes_used: 0,
      gauntlet_run_paused: false,
      gauntlet_run_terms: null,
      gauntlet_run_offer: null,
      // The Pressure behind the deepest hardcore cash-out — a depth 45 at 18
      // Pressure is a very different run to a clean 45, and the Ledger should
      // eventually be able to say so.
      ...(hc && cd >= ((profile.gauntlet_hc_best_depth as number | null) ?? 0)
        ? { [HC.bestPressure]: runPressure } : {}),
      gauntlet_fathoms: newFathoms,
      blood_gems: newBloodGems,
      // Lifetime Blood Gems earned (never decremented on spend) — backs the
      // Blood-Rich / Bloodhoard badges. Adds 0 on a normal (non-hc) cash-out.
      blood_gems_earned: ((profile.blood_gems_earned as number | null) ?? 0) + earnedBloodGems,
      // Lifetime counters for the achievement badges (a cash-out ends a run).
      gauntlet_runs_completed: ((profile.gauntlet_runs_completed as number | null) ?? 0) + 1,
      gauntlet_fathoms_earned: ((profile.gauntlet_fathoms_earned as number | null) ?? 0) + earnedFathoms,
      raid_items: newRaidItems,
      ...skinFields,
      ...recordFields,
    }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: bankedDoubloons,
      reason: `${hc ? 'Hardcore ' : ''}${isDon ? "Don's" : 'Davy Jones'} Gauntlet: depth ${cd}`,
    }),
    // Crew XP is DECOUPLED from the player's Nav XP onto a raid-calibrated scale.
    // Hardcore survivors earn a bonus for bringing the squad home alive.
    grantXPToAssignedCrew(admin, user.id, Math.round(gauntletCrewXp(payDepth, variant) * (hc ? HC_SURVIVOR_XP_MULT : 1) * navRenown.crewXpMult)),
  ])

  // Davy's Terms feats. Awaited (never fire-and-forget) so the write lands before
  // we return: BadgeWatcher refetches off the doubloons-changed this cash-out
  // fires, and a racing grant would miss its own celebration.
  if (hc && runPressure > 0) {
    for (const id of pressureFeats(runTerms, payDepth)) {
      try { await grantBadgeDirect(user.id, id) } catch { /* best-effort, never fail a cash-out */ }
    }
  }

  // Don's Gauntlet challenge feats — checked from the run's OWN snapshot at
  // cash-out (curses carried, damage taken, and how the shots were loosed), so
  // they can't be spoofed by a later run. One True Shot is derivable (max-hit
  // stat) and lives in badgeConditions instead.
  if (isDon && runSnapshot) {
    const st = runSnapshot.stats
    const curseCount = Object.keys(runSnapshot.curses ?? {}).length
    const donFeats: string[] = []
    if (st && st.shots >= 1 && st.shots === (st.megas ?? 0) && cd >= 10) donFeats.push('ultimate_only')
    if (curseCount >= 5 && cd >= 30) donFeats.push('weight_of_green')
    if (st && st.dmgTaken === 0 && cd >= 5) donFeats.push('untouched')
    for (const id of donFeats) {
      try { await grantBadgeDirect(user.id, id) } catch { /* best-effort */ }
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

/** Close an open run after a wipe. Banks no doubloons. Pays Fathoms for the
 *  ships you sank (the meta-currency rewards the dive itself), but a death does
 *  NOT touch your deepest record, the run recap, the leaderboard, the contest,
 *  or any depth-gated unlock — those advance only when you SURVIVE and cash out
 *  the depth (see cashOutGauntlet). Dying deep is not a shortcut to anything. */
export async function resolveGauntletDeath(rewardDepth: number, combatDepth: number = rewardDepth, runSnapshot?: GauntletRunSnapshot): Promise<{ ok: boolean; deepest: number; earnedFathoms: number; newFathoms: number; hardcore: boolean; fallenCount: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, deepest: 0, earnedFathoms: 0, newFathoms: 0, hardcore: false, fallenCount: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_run_variant, gauntlet_deepest, gauntlet_fathoms, gauntlet_fathoms_earned, gauntlet_runs_completed, gauntlet_deepest_died, gauntlet_upgrades, gauntlet_upgrades_off, dons_gauntlet_deepest, dons_gauntlet_deepest_died, dons_gauntlet_upgrades, dons_gauntlet_upgrades_off, gauntlet_run_hardcore, gauntlet_hc_squad, gauntlet_hc_deepest_died, dons_gauntlet_hc_deepest_died')
    .eq('id', user.id)
    .single()

  const isDon = ((profile?.gauntlet_run_variant as GauntletVariant | null) ?? 'davy') === 'don'
  const prevDeepest = ((isDon ? profile?.dons_gauntlet_deepest : profile?.gauntlet_deepest) as number | null) ?? 0
  if (!profile || profile.gauntlet_run_open !== true) {
    return { ok: false, deepest: prevDeepest, earnedFathoms: 0, newFathoms: (profile?.gauntlet_fathoms as number | null) ?? 0, hardcore: false, fallenCount: 0 }
  }

  // Fathoms bank on ships SUNK (rewardDepth) — earned win or lose, since they
  // reward descending, not surviving (Lucky Locker boosts the payout). Veteran's
  // Start's head start is excluded here, same as on cash-out.
  const rd = Math.max(0, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(rewardDepth)))
  const grossFathoms = Math.round(fathomsForDepth(rd, isDon ? 'don' : 'davy') * gauntletFathomsMult(activeGauntletUpgrades(
    ((isDon ? profile.dons_gauntlet_upgrades : profile.gauntlet_upgrades) as string[] | null) ?? [],
    ((isDon ? profile.dons_gauntlet_upgrades_off : profile.gauntlet_upgrades_off) as string[] | null) ?? [],
  )))
  // Settle the Fence tab (run-scoped) — spent Fathoms come out of this dive's
  // earnings, clamped so a purchase can never dip into the banked purse.
  const fenceSpent = Math.max(0, Math.round(runSnapshot?.fenceSpent ?? 0))
  const earnedFathoms = Math.max(0, grossFathoms - fenceSpent)
  const newFathoms = ((profile.gauntlet_fathoms as number | null) ?? 0) + earnedFathoms

  const cd = Math.max(rd, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(combatDepth)))
  const hardcore = profile.gauntlet_run_hardcore === true
  // A run that ended in the water still reached its depth, and a bounty that
  // only paid on a clean cash-out would quietly punish pushing for one more.
  void logBountyEvent(user.id, hardcore ? 'gauntlet_hc_depth' : 'gauntlet_depth', cd)
  const squad = hardcore ? ((profile.gauntlet_hc_squad as number[] | null) ?? []) : []

  // ── Hardcore permadeath — the squad you sent in is lost to the Locker ─────
  // Soft-delete the exact crew that entered (died_at + died_hardcore_depth so
  // the Crew Hall graveyard reads "Fell in Davy Jones's Locker, depth N"), and
  // clear their slots so they leave the roster. Mirrors the voyage death write.
  let fallenCount = 0
  if (hardcore && squad.length > 0) {
    const { data: killed } = await admin
      .from('user_crew')
      .update({ died_at: new Date().toISOString(), died_hardcore_depth: cd, raid_slot: null, voyage_slot: null })
      .eq('user_id', user.id)
      .in('id', squad)
      .is('died_at', null)
      .select('id')
    fallenCount = (killed ?? []).length
  }

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
  await admin
    .from('profiles')
    .update({
      gauntlet_run_open: false,
      gauntlet_fathoms: newFathoms,
      gauntlet_run_state: null,
      gauntlet_resumes_used: 0,
      gauntlet_run_paused: false,
      gauntlet_run_terms: null,
      gauntlet_run_offer: null,
      gauntlet_runs_completed: ((profile.gauntlet_runs_completed as number | null) ?? 0) + 1,
      gauntlet_fathoms_earned: ((profile.gauntlet_fathoms_earned as number | null) ?? 0) + earnedFathoms,
      ...deathFields,
    })
    .eq('id', user.id)

  return { ok: true, deepest: prevDeepest, earnedFathoms, newFathoms, hardcore, fallenCount }
}

/** Buy a bundle of a Fathoms-buyable lure (Golden / Luminous) with Fathoms.
 *  Repeatable (unlike the one-time Locker upgrades): deducts the bait's
 *  fathomCost and adds fathomBundle units to bait_inventory. Server-validated
 *  against the bait table so only the marked lures can be bought this way. */
export async function buyBaitWithFathoms(baitType: string): Promise<
  { ok: true; fathoms: number; added: number; baitType: string } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const bait = getBait(baitType)
  const cost = bait.fathomCost ?? 0
  const bundle = bait.fathomBundle ?? 0
  if (bait.type !== baitType || cost <= 0 || bundle <= 0) return { error: 'That lure is not for sale here.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('gauntlet_fathoms').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found.' }
  const fathoms = (profile.gauntlet_fathoms as number | null) ?? 0
  if (fathoms < cost) return { error: 'Not enough Fathoms.' }

  const newFathoms = fathoms - cost
  await Promise.all([
    admin.from('profiles').update({ gauntlet_fathoms: newFathoms }).eq('id', user.id),
    admin.rpc('upsert_bait', { p_user_id: user.id, p_bait_type: baitType, p_qty: bundle }),
  ])
  return { ok: true, fathoms: newFathoms, added: bundle, baitType }
}

/** Mark the first-time explainer as seen so it doesn't auto-open again. Each
 *  Gauntlet tracks its own flag — Don's has a different explainer, so seeing
 *  Davy's must not suppress the Don's one (and vice versa). */
export async function markGauntletIntroSeen(variant: GauntletVariant = 'davy'): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  const col = variant === 'don' ? 'has_seen_dons_gauntlet_intro' : 'has_seen_gauntlet_intro'
  await admin.from('profiles').update({ [col]: true }).eq('id', user.id)
}
