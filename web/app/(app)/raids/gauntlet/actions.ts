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
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'
import { maxPotForDepth, chestForDepth, chestCannonDropChance, MAX_GAUNTLET_DEPTH, GAUNTLET_COOLDOWN_MS, GAUNTLET_DEPTH_UNLOCKS, fathomsForDepth, gauntletXpForDepth, gauntletCrewXp, CONFLUENCES, type GauntletRunSnapshot, type GauntletRunState } from '@/lib/gauntlet'
import { getGauntletUpgrade, isUpgradeComingSoon, gauntletHaulMult, gauntletXpMult, gauntletFathomsMult } from '@/lib/gauntletUpgrades'
import { DAVY_FORGE } from '@/lib/raidItems'
import { GAUNTLET_DEEPEST_CONTEST_ENDS_AT } from '@/lib/contests'

/** Record a single gauntlet hit; persists the all-time biggest via greatest()
 *  (bump_gauntlet_hit). Fired per new run-best from GauntletGame (win OR loss),
 *  so the Biggest Hit board reflects the largest blow ever landed in a descent. */
export async function recordGauntletHit(dmg: number): Promise<void> {
  if (!Number.isFinite(dmg) || dmg <= 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.rpc('bump_gauntlet_hit', { uid: user.id, dmg: Math.floor(dmg) })
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
  return { depth, boons, curses, tides, at: new Date().toISOString() }
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
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  // #1 deepest CASHED-OUT descent (the leaderboard view excludes deaths +
  // admins), with the same depth → fastest → first ordering as the board.
  const { data: top } = await admin
    .from('leaderboard_gauntlet')
    .select('username, score')
    .order('score', { ascending: false })
    .order('time_ms', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let mine = 0
  if (user) {
    const { data: me } = await admin
      .from('profiles')
      .select('gauntlet_deepest')
      .eq('id', user.id)
      .single()
    mine = (me?.gauntlet_deepest as number | null) ?? 0
  }

  return {
    top: top
      ? {
          name: (top.username as string | null) ?? 'A captain',
          depth: Number(top.score),
        }
      : null,
    mine,
  }
}

/** Whether the player can start a run now (cooldown elapsed) + their lifetime
 *  deepest + when the next run unlocks (ISO, null when available now). */
export async function getGauntletDailyState(): Promise<{ available: boolean; deepest: number; fathoms: number; nextAt: string | null; deepestRun: GauntletRunSnapshot | null; resumeState: GauntletRunState | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { available: false, deepest: 0, fathoms: 0, nextAt: null, deepestRun: null, resumeState: null }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_last_run_at, gauntlet_deepest, gauntlet_fathoms, gauntlet_deepest_run, is_admin, gauntlet_run_open, gauntlet_run_state, gauntlet_resumes_used')
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

  return {
    available,
    deepest: (profile?.gauntlet_deepest as number | null) ?? 0,
    fathoms: (profile?.gauntlet_fathoms as number | null) ?? 0,
    nextAt: available ? null : new Date(nextMs).toISOString(),
    deepestRun: (profile?.gauntlet_deepest_run as GauntletRunSnapshot | null) ?? null,
    resumeState,
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
 *  finishing) spends it, so a quit-retry can't reroll a bad opener. */
export async function startGauntletRun(): Promise<{ started: boolean; reason?: 'cooldown'; deepest: number; nextAt?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { started: false, reason: 'cooldown', deepest: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_last_run_at, gauntlet_deepest, is_admin')
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

  await admin
    .from('profiles')
    .update({ gauntlet_last_run_at: new Date().toISOString(), gauntlet_run_open: true, gauntlet_run_state: null, gauntlet_resumes_used: 0 })
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
      /** Davy cannons that dropped this cash-out (chest chase items). */
      droppedItems: string[]
      /** Depth-milestone unlocks crossed by this CASH-OUT (surfaced on the
       *  reward screen — the Gauntlet no longer mails these). */
      unlockedThisRun: { name: string; blurb: string; where: string }[]
    }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_deepest, gauntlet_last_run_at, gauntlet_best_depth, gauntlet_best_depth_ms, gauntlet_contest_depth, gauntlet_fathoms, gauntlet_upgrades, expedition_xp, doubloons, gems, ship_classes, raid_items')
    .eq('id', user.id)
    .single()

  if (!profile || profile.gauntlet_run_open !== true) return { ok: false }

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
  const newRaidItems = droppedItems.length > 0 ? [...new Set([...ownedItems, ...droppedItems])] : ownedItems

  const classPicks = (profile.ship_classes as Record<string, string> | null) ?? {}
  const doubloonMult = aggregateShipClasses(classPicks).doubloonMult

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
  const earnedFathoms    = Math.round(fathomsForDepth(rd) * gauntletFathomsMult(upgrades))
  const newFathoms       = ((profile.gauntlet_fathoms as number | null) ?? 0) + earnedFathoms
  const newDoubloons     = (profile.doubloons ?? 0) + bankedDoubloons
  const newGems          = (profile.gems ?? 0) + gems
  const newExpeditionXP  = (profile.expedition_xp ?? 0) + bankedXp
  const prevDeepest      = (profile.gauntlet_deepest as number | null) ?? 0
  const deepest          = Math.max(prevDeepest, cd)
  // On a new deepest, snapshot the run (boons/curses/tides) for the home recap.
  const snapFields = cd > prevDeepest
    ? { gauntlet_deepest_run: sanitizeRunSnapshot(runSnapshot, cd) }
    : {}

  // Leaderboard: deepest CASHED-OUT depth only (this path = cash-out, never
  // death). Time is server-computed wall-clock from run start (gauntlet_last_run_at
  // stamped on startGauntletRun) so it can't be faked client-side. A run counts
  // if it goes deeper, or matches the best depth in a faster time.
  const lastRunAt   = profile.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const runMs       = lastRunAt > 0 ? Math.max(0, Date.now() - lastRunAt) : null
  const prevBestDep = (profile.gauntlet_best_depth as number | null) ?? 0
  const prevBestMs  = (profile.gauntlet_best_depth_ms as number | null) ?? null
  const beatsBest   = runMs != null && (cd > prevBestDep || (cd === prevBestDep && (prevBestMs == null || runMs < prevBestMs)))
  const bestFields  = beatsBest
    ? { gauntlet_best_depth: cd, gauntlet_best_depth_ms: runMs, gauntlet_best_depth_at: new Date().toISOString() }
    : {}

  // The Deepest Descent contest — windowed deepest CASHED-OUT depth, only while
  // the 30-day clock is still running. Frozen automatically once it ends.
  const contestActive = Date.now() < Date.parse(GAUNTLET_DEEPEST_CONTEST_ENDS_AT)
  const prevContestDep = (profile.gauntlet_contest_depth as number | null) ?? 0
  const contestFields = contestActive && cd > prevContestDep
    ? { gauntlet_contest_depth: cd, gauntlet_contest_depth_at: new Date().toISOString() }
    : {}

  const [, , crewXP] = await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      gems: newGems,
      expedition_xp: newExpeditionXP,
      gauntlet_run_open: false,
      gauntlet_run_state: null,
      gauntlet_resumes_used: 0,
      gauntlet_deepest: deepest,
      gauntlet_fathoms: newFathoms,
      raid_items: newRaidItems,
      ...bestFields,
      ...contestFields,
      ...snapFields,
    }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: bankedDoubloons,
      reason: `Davy Jones Gauntlet: depth ${cd}`,
    }),
    // Crew XP is DECOUPLED from the player's Nav XP (which is huge) onto a raid-
    // calibrated scale — mirroring bankedXp maxed crew in a couple of dives.
    grantXPToAssignedCrew(admin, user.id, gauntletCrewXp(rd)),
  ])

  // Depth-milestone unlocks crossed by SURVIVING to this depth (cash-out only —
  // dying deep no longer counts). Surfaced on the reward screen instead of mail.
  const unlockedThisRun = GAUNTLET_DEPTH_UNLOCKS
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
    droppedItems,
    unlockedThisRun,
  }
}

/** Close an open run after a wipe. Banks no doubloons. Pays Fathoms for the
 *  ships you sank (the meta-currency rewards the dive itself), but a death does
 *  NOT touch your deepest record, the run recap, the leaderboard, the contest,
 *  or any depth-gated unlock — those advance only when you SURVIVE and cash out
 *  the depth (see cashOutGauntlet). Dying deep is not a shortcut to anything. */
export async function resolveGauntletDeath(rewardDepth: number, _combatDepth: number = rewardDepth, _runSnapshot?: GauntletRunSnapshot): Promise<{ ok: boolean; deepest: number; earnedFathoms: number; newFathoms: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, deepest: 0, earnedFathoms: 0, newFathoms: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_deepest, gauntlet_fathoms, gauntlet_upgrades')
    .eq('id', user.id)
    .single()

  const prevDeepest = (profile?.gauntlet_deepest as number | null) ?? 0
  if (!profile || profile.gauntlet_run_open !== true) {
    return { ok: false, deepest: prevDeepest, earnedFathoms: 0, newFathoms: (profile?.gauntlet_fathoms as number | null) ?? 0 }
  }

  // Fathoms bank on ships SUNK (rewardDepth) — earned win or lose, since they
  // reward descending, not surviving (Lucky Locker boosts the payout). Veteran's
  // Start's head start is excluded here, same as on cash-out.
  const rd = Math.max(0, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(rewardDepth)))
  const earnedFathoms = Math.round(fathomsForDepth(rd) * gauntletFathomsMult((profile.gauntlet_upgrades as string[] | null) ?? []))
  const newFathoms = ((profile.gauntlet_fathoms as number | null) ?? 0) + earnedFathoms

  // Close the run + bank Fathoms ONLY. Deepest record / recap / unlocks are left
  // untouched — they belong to cash-outs.
  await admin
    .from('profiles')
    .update({ gauntlet_run_open: false, gauntlet_fathoms: newFathoms, gauntlet_run_state: null, gauntlet_resumes_used: 0 })
    .eq('id', user.id)

  return { ok: true, deepest: prevDeepest, earnedFathoms, newFathoms }
}

/** Mark the first-time explainer as seen so it doesn't auto-open again. */
export async function markGauntletIntroSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ has_seen_gauntlet_intro: true }).eq('id', user.id)
}
