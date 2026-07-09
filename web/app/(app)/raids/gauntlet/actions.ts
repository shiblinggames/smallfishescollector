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
import { aggregateShipClasses } from '@/lib/shipClasses'
import { navRenownEffects, type RenownAlloc } from '@/lib/renown'
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'
import { maxPotForDepth, chestForDepth, chestCannonDropChance, MAX_GAUNTLET_DEPTH, GAUNTLET_COOLDOWN_MS, GAUNTLET_DEPTH_UNLOCKS, fathomsForDepth, gauntletXpForDepth, gauntletCrewXp, CONFLUENCES, hardcoreUnlocked, HARDCORE_LIVE, HARDCORE_UNLOCKS, HARDCORE_RUNS_PER_DAY, HC_FATHOMS_MULT, HC_SURVIVOR_XP_MULT, bloodGemsForDepth, coerceRunStats, type GauntletRunSnapshot, type GauntletRunState } from '@/lib/gauntlet'
import { getGauntletUpgrade, isUpgradeComingSoon, gauntletHaulMult, gauntletXpMult, gauntletFathomsMult } from '@/lib/gauntletUpgrades'
import { DAVY_FORGE } from '@/lib/raidItems'
import { GAUNTLET_DEEPEST_CONTEST_ENDS_AT } from '@/lib/contests'
import { getBait } from '@/lib/bait'

// Golden Gauntlet Hull — a rare Man-o-War-only cosmetic that drops only from the
// top chest tier (Davy Jones' Locker, chest tier 5 / depth 18+). Tunable here.
const GOLD_HULL_SKIN_ID = 'golden_gauntlet_hull'
const GOLD_HULL_CHEST_TIER = 5
const GOLD_HULL_DROP_CHANCE = 0.04

// Hardcore-only drops. Bad Blood Hull (Man-o-War skin) + Davy's Blood Cannon
// (the first lifesteal raid item) both come ONLY from Hardcore Gauntlet chests.
const BLOOD_HULL_SKIN_ID = 'bad_blood_hull'
const BLOOD_HULL_CHEST_TIER = 4        // from the deeper hardcore chests up
const BLOOD_HULL_DROP_CHANCE = 0.05
const BLOOD_CANNON_ITEM_ID = 'davys_blood_cannon'
const BLOOD_CANNON_CHEST_TIER = 3
const BLOOD_CANNON_DROP_CHANCE = 0.06  // per-chest; a rare chase from the deep-hardcore chests

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
export async function getGauntletUpgradeState(): Promise<{ deepest: number; fathoms: number; owned: string[]; hasAutoCatcher: boolean; hasAutoCaster: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { deepest: 0, fathoms: 0, owned: [], hasAutoCatcher: false, hasAutoCaster: false }
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('gauntlet_deepest, gauntlet_fathoms, gauntlet_upgrades, has_auto_catcher, has_auto_caster')
    .eq('id', user.id)
    .single()
  return {
    deepest: (data?.gauntlet_deepest as number | null) ?? 0,
    fathoms: (data?.gauntlet_fathoms as number | null) ?? 0,
    owned: (data?.gauntlet_upgrades as string[] | null) ?? [],
    hasAutoCatcher: data?.has_auto_catcher === true,
    hasAutoCaster: data?.has_auto_caster === true,
  }
}

/** Claim a Locker Upgrade. Server-validates the depth gate, the Fathoms cost,
 *  and no-double-claim, then deducts Fathoms + records the id. */
export async function claimGauntletUpgrade(id: string): Promise<
  { ok: true; fathoms: number; owned: string[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const upgrade = getGauntletUpgrade(id)
  if (!upgrade) return { error: 'Unknown upgrade.' }
  if (isUpgradeComingSoon(id)) return { error: 'Coming soon.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_deepest, gauntlet_fathoms, gauntlet_upgrades')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.' }

  const owned = (profile.gauntlet_upgrades as string[] | null) ?? []
  if (owned.includes(id)) return { error: 'Already unlocked.' }
  const deepest = (profile.gauntlet_deepest as number | null) ?? 0
  if (deepest < upgrade.depthRequired) return { error: `Reach depth ${upgrade.depthRequired} in the Gauntlet first.` }
  const fathoms = (profile.gauntlet_fathoms as number | null) ?? 0
  if (fathoms < upgrade.cost) return { error: 'Not enough Fathoms.' }

  const newFathoms = fathoms - upgrade.cost
  const newOwned = [...owned, id]
  await admin.from('profiles').update({ gauntlet_fathoms: newFathoms, gauntlet_upgrades: newOwned }).eq('id', user.id)
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
export async function getGauntletLeaderboard(): Promise<{
  top: { name: string; depth: number } | null
  mine: number
  /** #1 on the hardcore-only Drowned Ledger + this player's hardcore best. */
  hardcoreTop: { name: string; depth: number } | null
  hardcoreMine: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  // #1 deepest CASHED-OUT descent (the leaderboard views exclude deaths +
  // admins), same depth → fastest → first ordering as the board. One query per
  // ledger (normal + hardcore).
  const topQuery = (view: string) => admin
    .from(view)
    .select('username, score')
    .order('score', { ascending: false })
    .order('time_ms', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const [{ data: top }, { data: hcTop }] = await Promise.all([
    topQuery('leaderboard_gauntlet'),
    topQuery('leaderboard_gauntlet_hardcore'),
  ])

  let mine = 0
  let hardcoreMine = 0
  if (user) {
    const { data: me } = await admin
      .from('profiles')
      .select('gauntlet_deepest, gauntlet_hc_deepest')
      .eq('id', user.id)
      .single()
    mine = (me?.gauntlet_deepest as number | null) ?? 0
    hardcoreMine = (me?.gauntlet_hc_deepest as number | null) ?? 0
  }

  const asTop = (row: typeof top) => row ? { name: (row.username as string | null) ?? 'A captain', depth: Number(row.score) } : null
  return {
    top: asTop(top),
    mine,
    hardcoreTop: asTop(hcTop),
    hardcoreMine,
  }
}

/** Whether the player can start a run now (cooldown elapsed) + their lifetime
 *  deepest + when the next run unlocks (ISO, null when available now). */
export async function getGauntletDailyState(): Promise<{ available: boolean; deepest: number; fathoms: number; nextAt: string | null; deepestRun: GauntletRunSnapshot | null; resumeState: GauntletRunState | null; hardcoreUnlocked: boolean; hardcoreLive: boolean; hcDeepest: number; hcRunsLeft: number; runHardcore: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { available: false, deepest: 0, fathoms: 0, nextAt: null, deepestRun: null, resumeState: null, hardcoreUnlocked: false, hardcoreLive: HARDCORE_LIVE, hcDeepest: 0, hcRunsLeft: 0, runHardcore: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_last_run_at, gauntlet_deepest, gauntlet_fathoms, gauntlet_deepest_run, is_admin, gauntlet_run_open, gauntlet_run_state, gauntlet_resumes_used, gauntlet_hc_deepest, gauntlet_run_hardcore, gauntlet_hc_last_run_at, gauntlet_hc_runs_today, raid_node_progress')
    .eq('id', user.id)
    .single()

  // Admins can run it as often as they like (testing the curve).
  const isAdmin = profile?.is_admin === true
  const lastRunAt = profile?.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const nextMs = lastRunAt + GAUNTLET_COOLDOWN_MS
  const available = isAdmin || Date.now() >= nextMs

  // A run left open with a saved checkpoint and a resume still in the bank (one
  // per run) can be picked back up — the crash safety net. The counter is
  // server-owned; getResumeState only PREVIEWS it, resumeGauntletRun spends it.
  const runState = (profile?.gauntlet_run_state as GauntletRunState | null) ?? null
  const resumesUsed = (profile?.gauntlet_resumes_used as number | null) ?? 0
  const resumeState = profile?.gauntlet_run_open === true && runState && resumesUsed < 1 ? runState : null

  const deepest = (profile?.gauntlet_deepest as number | null) ?? 0
  const clearedNodes = (profile?.raid_node_progress as { cleared?: string[] } | null)?.cleared ?? []
  // Hardcore runs remaining in the current UTC day (resets when the date rolls;
  // admins bypass the cap, so they always read full). Mirrors startGauntletRun.
  const hcLastAt = profile?.gauntlet_hc_last_run_at ? new Date(profile.gauntlet_hc_last_run_at as string) : null
  const hcSameUtcDay = !!hcLastAt && hcLastAt.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
  const hcUsedToday = hcSameUtcDay ? Number(profile?.gauntlet_hc_runs_today ?? 0) : 0
  const hcRunsLeft = isAdmin ? HARDCORE_RUNS_PER_DAY : Math.max(0, HARDCORE_RUNS_PER_DAY - hcUsedToday)
  return {
    available,
    deepest,
    fathoms: (profile?.gauntlet_fathoms as number | null) ?? 0,
    nextAt: available ? null : new Date(nextMs).toISOString(),
    deepestRun: (profile?.gauntlet_deepest_run as GauntletRunSnapshot | null) ?? null,
    resumeState,
    // Can this player start a hardcore run right now? (admin-only pre-launch.)
    hardcoreUnlocked: hardcoreUnlocked({ isAdmin, clearedNodes, deepest }),
    hardcoreLive: HARDCORE_LIVE,
    hcDeepest: (profile?.gauntlet_hc_deepest as number | null) ?? 0,
    // Hardcore runs left today (of HARDCORE_RUNS_PER_DAY) for the mode-choice card.
    hcRunsLeft,
    // Is the currently OPEN (resumable) run a hardcore one? Lets a resumed run
    // keep its hardcore end-beats + abandon warning.
    runHardcore: profile?.gauntlet_run_hardcore === true,
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

/** Spend the run's single resume: hand back the checkpointed state and bump the
 *  server-owned counter so it can't be used twice. Refuses if there's no open
 *  run, no checkpoint, or the resume is already spent. */
export async function resumeGauntletRun(): Promise<{ ok: false } | { ok: true; state: GauntletRunState }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_run_state, gauntlet_resumes_used')
    .eq('id', user.id).single()

  const state = (profile?.gauntlet_run_state as GauntletRunState | null) ?? null
  const used = (profile?.gauntlet_resumes_used as number | null) ?? 0
  if (profile?.gauntlet_run_open !== true || !state || used >= 1) return { ok: false }

  // Server owns the counter — increment regardless of any client-reported value.
  await admin.from('profiles').update({ gauntlet_resumes_used: used + 1 }).eq('id', user.id)
  return { ok: true, state }
}

/** Consume the run attempt (start the cooldown) and open a run. Starting (not
 *  finishing) spends it, so a quit-retry can't reroll a bad opener.
 *
 *  Hardcore: the crew you send in (your living raid party) is snapshotted into
 *  gauntlet_hc_squad and PERMANENTLY dies on death/abandon. Gated server-side —
 *  admin-only until HARDCORE_LIVE, then unlock + a living squad. */
export async function startGauntletRun(hardcore = false): Promise<{ started: boolean; reason?: 'cooldown' | 'locked' | 'no_squad'; deepest: number; nextAt?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { started: false, reason: 'cooldown', deepest: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_last_run_at, gauntlet_deepest, is_admin, raid_node_progress, gauntlet_hc_last_run_at, gauntlet_hc_runs_today')
    .eq('id', user.id)
    .single()

  const deepest = (profile?.gauntlet_deepest as number | null) ?? 0
  const isAdmin = profile?.is_admin === true
  const lastRunAt = profile?.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const nextMs = lastRunAt + GAUNTLET_COOLDOWN_MS
  // Admins bypass the cooldown so they can run it repeatedly to test.
  if (!isAdmin && Date.now() < nextMs) {
    return { started: false, reason: 'cooldown', deepest, nextAt: new Date(nextMs).toISOString() }
  }

  // ── Hardcore: gate + snapshot the squad at risk ──────────────────────────
  let hcFields: Record<string, unknown> = { gauntlet_run_hardcore: false, gauntlet_hc_squad: null }
  let hcRunsToday = 0
  if (hardcore) {
    const clearedNodes = (profile?.raid_node_progress as { cleared?: string[] } | null)?.cleared ?? []
    // Server-enforced gate — admin-only until HARDCORE_LIVE (so the action can't
    // be forced from the client), then unlock + normal-Gauntlet depth floor.
    if (!hardcoreUnlocked({ isAdmin, clearedNodes, deepest })) {
      return { started: false, reason: 'locked', deepest }
    }
    // Hardcore is capped at HARDCORE_RUNS_PER_DAY per UTC day (admins bypass so
    // they can test). The count resets when the UTC date of the last run differs
    // from today's; when capped, the run reopens at the next UTC midnight.
    const now = new Date()
    const hcLastAt = profile?.gauntlet_hc_last_run_at ? new Date(profile.gauntlet_hc_last_run_at as string) : null
    const sameUtcDay = !!hcLastAt && hcLastAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
    const runsToday = sameUtcDay ? Number(profile?.gauntlet_hc_runs_today ?? 0) : 0
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
    hcFields = { gauntlet_run_hardcore: true, gauntlet_hc_squad: squad, gauntlet_hc_last_run_at: new Date().toISOString(), gauntlet_hc_runs_today: hcRunsToday }
  }

  await admin
    .from('profiles')
    .update({ gauntlet_last_run_at: new Date().toISOString(), gauntlet_run_open: true, gauntlet_run_state: null, gauntlet_resumes_used: 0, ...hcFields })
    .eq('id', user.id)

  return { started: true, deepest }
}

/** Cash out an open run at the reached depth, banking the (clamped) pot ×
 *  chest multiplier + the chest's gem bonus. Closes the run. */
export async function cashOutGauntlet(rewardDepth: number, combatDepth: number, pot: number, runSnapshot?: GauntletRunSnapshot): Promise<
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
      newBloodGems: number
      /** Davy cannons that dropped this cash-out (chest chase items). */
      droppedItems: string[]
      /** Golden Gauntlet Hull skin id if it dropped this cash-out, else null. */
      droppedSkinId: string | null
      /** Bad Blood Hull (Hardcore-only Man-o-War skin) id if it dropped, else null. */
      droppedHcSkinId: string | null
      /** Depth-milestone unlocks crossed by this CASH-OUT (surfaced on the
       *  reward screen — the Gauntlet no longer mails these). */
      unlockedThisRun: { name: string; blurb: string; where: string }[]
      /** Was this a Hardcore run? Drives the "your crew sailed home" cash-out beat. */
      hardcore: boolean
    }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_deepest, gauntlet_last_run_at, gauntlet_best_depth, gauntlet_best_depth_ms, gauntlet_contest_depth, gauntlet_fathoms, gauntlet_fathoms_earned, gauntlet_runs_completed, gauntlet_upgrades, expedition_xp, doubloons, gems, ship_classes, nav_renown_alloc, raid_items, ship_skins, gauntlet_run_hardcore, gauntlet_hc_deepest, gauntlet_hc_best_depth, gauntlet_hc_best_depth_ms, blood_gems, blood_gems_earned')
    .eq('id', user.id)
    .single()

  if (!profile || profile.gauntlet_run_open !== true) return { ok: false }

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
  if (rd <= 0) {
    // Nothing cleared — just close the run.
    await admin.from('profiles').update({ gauntlet_run_open: false }).eq('id', user.id)
    return { ok: false }
  }

  const cleanPot = Math.max(0, Math.min(Math.floor(pot), maxPotForDepth(rd)))
  const chest = chestForDepth(rd)

  // Run Upgrades (Locker, scope 'gauntlet') that sweeten the cash-out.
  const upgrades   = (profile.gauntlet_upgrades as string[] | null) ?? []

  // Davy cannon chest drops — each component rolls independently at the chest
  // tier's chance, only for cannons not yet owned, and never once the player
  // has forged them into the Grand Cannon.
  const ownedItems = (profile.raid_items as string[] | null) ?? []
  const dropChance = chestCannonDropChance(chest.tier)
  const droppedItems: string[] = []
  if (!ownedItems.includes(DAVY_FORGE.result)) {
    for (const cannon of DAVY_FORGE.components) {
      if (!ownedItems.includes(cannon) && Math.random() < dropChance) droppedItems.push(cannon)
    }
  }
  // Davy's Blood Cannon — HARDCORE-only chase (the first lifesteal item), from
  // the deeper hardcore chests. Never re-drops once owned.
  if (hc && chest.tier >= BLOOD_CANNON_CHEST_TIER && !ownedItems.includes(BLOOD_CANNON_ITEM_ID) && Math.random() < BLOOD_CANNON_DROP_CHANCE) {
    droppedItems.push(BLOOD_CANNON_ITEM_ID)
  }
  const newRaidItems = droppedItems.length > 0 ? [...new Set([...ownedItems, ...droppedItems])] : ownedItems

  // Golden Gauntlet Hull — a RARE cosmetic drop from the Davy Jones' Locker chest
  // (the top chest tier, depth 18+). Man-o-War-only skin; grants to ship_skins so
  // it's owned even before the player has the hull to wear it.
  const ownedSkins = (profile.ship_skins as string[] | null) ?? []
  let droppedSkinId: string | null = null
  if (chest.tier >= GOLD_HULL_CHEST_TIER && !ownedSkins.includes(GOLD_HULL_SKIN_ID) && Math.random() < GOLD_HULL_DROP_CHANCE) {
    droppedSkinId = GOLD_HULL_SKIN_ID
  }
  // Bad Blood Hull — the HARDCORE-only Man-o-War skin, from the deeper hardcore
  // chests. Owned to ship_skins even before the player has the Man-o-War to wear it.
  let droppedHcSkinId: string | null = null
  if (hc && chest.tier >= BLOOD_HULL_CHEST_TIER && !ownedSkins.includes(BLOOD_HULL_SKIN_ID) && Math.random() < BLOOD_HULL_DROP_CHANCE) {
    droppedHcSkinId = BLOOD_HULL_SKIN_ID
  }
  // Hardcore Drowned Fleet skins — granted the first time you cash out past a
  // hardcore-depth milestone (mirrors GAUNTLET_DEPTH_UNLOCKS but for cosmetics).
  const prevHcDeepest = (profile.gauntlet_hc_deepest as number | null) ?? 0
  const hcDeepest = hc ? Math.max(prevHcDeepest, cd) : prevHcDeepest
  const hcUnlocks = hc ? HARDCORE_UNLOCKS.filter(u => prevHcDeepest < u.depth && u.depth <= hcDeepest) : []
  const hcSkinIds = hcUnlocks.map(u => u.skinId).filter(id => !ownedSkins.includes(id))
  const grantSkins = [...(droppedSkinId ? [droppedSkinId] : []), ...(droppedHcSkinId ? [droppedHcSkinId] : []), ...hcSkinIds]
  const skinFields = grantSkins.length > 0 ? { ship_skins: [...new Set([...ownedSkins, ...grantSkins])] } : {}

  // Blood Gems — the Hardcore premium currency, dropped in the cash-out chest
  // (survive-only). Amount is a live server roll (~0.5–0.7 per reward depth), so
  // deeper survival = more. Normal runs earn none.
  const earnedBloodGems = hc ? bloodGemsForDepth(rd, Math.random()) : 0
  const newBloodGems    = ((profile.blood_gems as number | null) ?? 0) + earnedBloodGems

  const classPicks = (profile.ship_classes as Record<string, string> | null) ?? {}
  const navRenown = navRenownEffects(profile.nav_renown_alloc as RenownAlloc | null)
  const doubloonMult = aggregateShipClasses(classPicks).doubloonMult * navRenown.doubloonMult

  const bankedDoubloons = Math.round(cleanPot * chest.potMult * doubloonMult * gauntletHaulMult(upgrades))
  // Nav XP is decoupled from the doubloon pot onto its own gentler depth curve
  // (leveling was the sharper concern). Chest multiplier still rides on top.
  const bankedXp        = Math.round(gauntletXpForDepth(rd) * chest.potMult * gauntletXpMult(upgrades))
  const gems            = chest.gems

  // Fathoms — the Gauntlet's meta-currency — bank on reaching this depth
  // (Lucky Locker boosts the payout).
  // Fathoms (meta-currency) bank on ships SUNK (rewardDepth), so Veteran's Start
  // never farms the currency that buys upgrades — only the deepest record /
  // contest / leaderboard below count the combat depth.
  // Hardcore now banks Fathoms at the SAME rate as normal (HC_*_MULT = 1); its
  // only added payout is Blood Gems above.
  const earnedFathoms    = Math.round(fathomsForDepth(rd) * gauntletFathomsMult(upgrades) * (hc ? HC_FATHOMS_MULT : 1))
  const newFathoms       = ((profile.gauntlet_fathoms as number | null) ?? 0) + earnedFathoms
  const newDoubloons     = (profile.doubloons ?? 0) + bankedDoubloons
  const newGems          = (profile.gems ?? 0) + gems
  const newExpeditionXP  = (profile.expedition_xp ?? 0) + bankedXp
  const prevDeepest      = (profile.gauntlet_deepest as number | null) ?? 0
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
    const prevHcBestDep = (profile.gauntlet_hc_best_depth as number | null) ?? 0
    const prevHcBestMs  = (profile.gauntlet_hc_best_depth_ms as number | null) ?? null
    const beatsHcBest   = runMs != null && (cd > prevHcBestDep || (cd === prevHcBestDep && (prevHcBestMs == null || runMs < prevHcBestMs)))
    recordFields = {
      gauntlet_hc_deepest: hcDeepest,
      gauntlet_run_hardcore: false,
      gauntlet_hc_squad: null,
      ...(beatsHcBest ? { gauntlet_hc_best_depth: cd, gauntlet_hc_best_depth_ms: runMs, gauntlet_hc_best_depth_at: new Date().toISOString() } : {}),
    }
  } else {
    const prevBestDep = (profile.gauntlet_best_depth as number | null) ?? 0
    const prevBestMs  = (profile.gauntlet_best_depth_ms as number | null) ?? null
    const beatsBest   = runMs != null && (cd > prevBestDep || (cd === prevBestDep && (prevBestMs == null || runMs < prevBestMs)))
    const contestActive  = Date.now() < Date.parse(GAUNTLET_DEEPEST_CONTEST_ENDS_AT)
    const prevContestDep = (profile.gauntlet_contest_depth as number | null) ?? 0
    recordFields = {
      gauntlet_deepest: deepest,
      ...(beatsBest ? { gauntlet_best_depth: cd, gauntlet_best_depth_ms: runMs, gauntlet_best_depth_at: new Date().toISOString() } : {}),
      ...(contestActive && cd > prevContestDep ? { gauntlet_contest_depth: cd, gauntlet_contest_depth_at: new Date().toISOString() } : {}),
      ...(cd > prevDeepest ? { gauntlet_deepest_run: sanitizeRunSnapshot(runSnapshot, cd) } : {}),
    }
  }

  const [, , crewXP] = await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      gems: newGems,
      expedition_xp: newExpeditionXP,
      gauntlet_run_open: false,
      gauntlet_run_state: null,
      gauntlet_resumes_used: 0,
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
      reason: `${hc ? 'Hardcore ' : ''}Davy Jones Gauntlet: depth ${cd}`,
    }),
    // Crew XP is DECOUPLED from the player's Nav XP onto a raid-calibrated scale.
    // Hardcore survivors earn a bonus for bringing the squad home alive.
    grantXPToAssignedCrew(admin, user.id, Math.round(gauntletCrewXp(rd) * (hc ? HC_SURVIVOR_XP_MULT : 1) * navRenown.crewXpMult)),
  ])

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
    chest: { tier: chest.tier, label: chest.label, potMult: chest.potMult },
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
    newBloodGems,
    droppedItems,
    droppedSkinId,
    droppedHcSkinId,
    unlockedThisRun,
    hardcore: hc,
  }
}

/** Close an open run after a wipe. Banks no doubloons. Pays Fathoms for the
 *  ships you sank (the meta-currency rewards the dive itself), but a death does
 *  NOT touch your deepest record, the run recap, the leaderboard, the contest,
 *  or any depth-gated unlock — those advance only when you SURVIVE and cash out
 *  the depth (see cashOutGauntlet). Dying deep is not a shortcut to anything. */
export async function resolveGauntletDeath(rewardDepth: number, combatDepth: number = rewardDepth, _runSnapshot?: GauntletRunSnapshot): Promise<{ ok: boolean; deepest: number; earnedFathoms: number; newFathoms: number; hardcore: boolean; fallenCount: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, deepest: 0, earnedFathoms: 0, newFathoms: 0, hardcore: false, fallenCount: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_deepest, gauntlet_fathoms, gauntlet_fathoms_earned, gauntlet_runs_completed, gauntlet_deepest_died, gauntlet_upgrades, gauntlet_run_hardcore, gauntlet_hc_squad, gauntlet_hc_deepest_died')
    .eq('id', user.id)
    .single()

  const prevDeepest = (profile?.gauntlet_deepest as number | null) ?? 0
  if (!profile || profile.gauntlet_run_open !== true) {
    return { ok: false, deepest: prevDeepest, earnedFathoms: 0, newFathoms: (profile?.gauntlet_fathoms as number | null) ?? 0, hardcore: false, fallenCount: 0 }
  }

  // Fathoms bank on ships SUNK (rewardDepth) — earned win or lose, since they
  // reward descending, not surviving (Lucky Locker boosts the payout). Veteran's
  // Start's head start is excluded here, same as on cash-out.
  const rd = Math.max(0, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(rewardDepth)))
  const earnedFathoms = Math.round(fathomsForDepth(rd) * gauntletFathomsMult((profile.gauntlet_upgrades as string[] | null) ?? []))
  const newFathoms = ((profile.gauntlet_fathoms as number | null) ?? 0) + earnedFathoms

  const cd = Math.max(rd, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(combatDepth)))
  const hardcore = profile.gauntlet_run_hardcore === true
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
    ? { gauntlet_hc_deepest_died: Math.max((profile.gauntlet_hc_deepest_died as number | null) ?? 0, cd), gauntlet_run_hardcore: false, gauntlet_hc_squad: null }
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

/** Mark the first-time explainer as seen so it doesn't auto-open again. */
export async function markGauntletIntroSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ has_seen_gauntlet_intro: true }).eq('id', user.id)
}
