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
import { maxPotForDepth, chestForDepth, chestCannonDropChance, MAX_GAUNTLET_DEPTH, GAUNTLET_COOLDOWN_MS, GAUNTLET_DEPTH_UNLOCKS, fathomsForDepth } from '@/lib/gauntlet'
import { getGauntletUpgrade, gauntletHaulMult, gauntletXpMult, gauntletFathomsMult } from '@/lib/gauntletUpgrades'
import { DAVY_FORGE } from '@/lib/raidItems'
import { GAUNTLET_DEEPEST_CONTEST_ENDS_AT } from '@/lib/contests'

/** Mail the player for each depth-unlock milestone they cross this run. Deepest
 *  only ever climbs, so each milestone fires exactly once. Best-effort. */
async function notifyDepthUnlocks(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  prevDeepest: number,
  newDeepest: number,
): Promise<void> {
  const crossed = GAUNTLET_DEPTH_UNLOCKS.filter(u => prevDeepest < u.depth && u.depth <= newDeepest)
  if (crossed.length === 0) return
  try {
    await admin.from('mail_messages').insert(
      crossed.map(u => ({
        subject: `Depth ${u.depth} cleared — ${u.name} unlocked`,
        body: `You dragged the Locker down to depth ${u.depth} and tore something loose: the ${u.name}.\n\n${u.blurb}\n\n${u.where}.\n\nThe deep keeps its prizes for those who go after them. Descend further and you'll find more.\n\n— Davy Jones`,
        sender_label: 'Davy Jones',
        target_user_id: userId,
      })),
    )
  } catch { /* notification is best-effort; never block the payout */ }
}

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
export async function getGauntletDailyState(): Promise<{ available: boolean; deepest: number; fathoms: number; nextAt: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { available: false, deepest: 0, fathoms: 0, nextAt: null }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_last_run_at, gauntlet_deepest, gauntlet_fathoms, is_admin')
    .eq('id', user.id)
    .single()

  // Admins can run it as often as they like (testing the curve).
  const isAdmin = profile?.is_admin === true
  const lastRunAt = profile?.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const nextMs = lastRunAt + GAUNTLET_COOLDOWN_MS
  const available = isAdmin || Date.now() >= nextMs

  return {
    available,
    deepest: (profile?.gauntlet_deepest as number | null) ?? 0,
    fathoms: (profile?.gauntlet_fathoms as number | null) ?? 0,
    nextAt: available ? null : new Date(nextMs).toISOString(),
  }
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
    .update({ gauntlet_last_run_at: new Date().toISOString(), gauntlet_run_open: true })
    .eq('id', user.id)

  return { started: true, deepest }
}

/** Cash out an open run at the reached depth, banking the (clamped) pot ×
 *  chest multiplier + the chest's gem bonus. Closes the run. */
export async function cashOutGauntlet(depth: number, pot: number): Promise<
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

  const d = Math.max(0, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(depth)))
  if (d <= 0) {
    // Nothing cleared — just close the run.
    await admin.from('profiles').update({ gauntlet_run_open: false }).eq('id', user.id)
    return { ok: false }
  }

  const cleanPot = Math.max(0, Math.min(Math.floor(pot), maxPotForDepth(d)))
  const chest = chestForDepth(d)

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
  const bankedXp        = Math.round(cleanPot * chest.potMult * gauntletXpMult(upgrades))
  const gems            = chest.gems

  // Fathoms — the Gauntlet's meta-currency — bank on reaching this depth
  // (Lucky Locker boosts the payout).
  const earnedFathoms    = Math.round(fathomsForDepth(d) * gauntletFathomsMult(upgrades))
  const newFathoms       = ((profile.gauntlet_fathoms as number | null) ?? 0) + earnedFathoms
  const newDoubloons     = (profile.doubloons ?? 0) + bankedDoubloons
  const newGems          = (profile.gems ?? 0) + gems
  const newExpeditionXP  = (profile.expedition_xp ?? 0) + bankedXp
  const prevDeepest      = (profile.gauntlet_deepest as number | null) ?? 0
  const deepest          = Math.max(prevDeepest, d)

  // Leaderboard: deepest CASHED-OUT depth only (this path = cash-out, never
  // death). Time is server-computed wall-clock from run start (gauntlet_last_run_at
  // stamped on startGauntletRun) so it can't be faked client-side. A run counts
  // if it goes deeper, or matches the best depth in a faster time.
  const lastRunAt   = profile.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const runMs       = lastRunAt > 0 ? Math.max(0, Date.now() - lastRunAt) : null
  const prevBestDep = (profile.gauntlet_best_depth as number | null) ?? 0
  const prevBestMs  = (profile.gauntlet_best_depth_ms as number | null) ?? null
  const beatsBest   = runMs != null && (d > prevBestDep || (d === prevBestDep && (prevBestMs == null || runMs < prevBestMs)))
  const bestFields  = beatsBest
    ? { gauntlet_best_depth: d, gauntlet_best_depth_ms: runMs, gauntlet_best_depth_at: new Date().toISOString() }
    : {}

  // The Deepest Descent contest — windowed deepest CASHED-OUT depth, only while
  // the 30-day clock is still running. Frozen automatically once it ends.
  const contestActive = Date.now() < Date.parse(GAUNTLET_DEEPEST_CONTEST_ENDS_AT)
  const prevContestDep = (profile.gauntlet_contest_depth as number | null) ?? 0
  const contestFields = contestActive && d > prevContestDep
    ? { gauntlet_contest_depth: d, gauntlet_contest_depth_at: new Date().toISOString() }
    : {}

  const [, , crewXP] = await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      gems: newGems,
      expedition_xp: newExpeditionXP,
      gauntlet_run_open: false,
      gauntlet_deepest: deepest,
      gauntlet_fathoms: newFathoms,
      raid_items: newRaidItems,
      ...bestFields,
      ...contestFields,
    }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: bankedDoubloons,
      reason: `Davy Jones Gauntlet: depth ${d}`,
    }),
    grantXPToAssignedCrew(admin, user.id, bankedXp),
  ])

  await notifyDepthUnlocks(admin, user.id, prevDeepest, deepest)

  return {
    ok: true,
    depth: d,
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
  }
}

/** Close an open run after a wipe. Banks no doubloons; still records deepest and
 *  still pays Fathoms for how deep you got (the meta-currency rewards the dive,
 *  not the cash-out). */
export async function resolveGauntletDeath(depth: number): Promise<{ ok: boolean; deepest: number; earnedFathoms: number; newFathoms: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, deepest: 0, earnedFathoms: 0, newFathoms: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_deepest, gauntlet_fathoms, gauntlet_upgrades')
    .eq('id', user.id)
    .single()

  if (!profile || profile.gauntlet_run_open !== true) {
    return { ok: false, deepest: (profile?.gauntlet_deepest as number | null) ?? 0, earnedFathoms: 0, newFathoms: (profile?.gauntlet_fathoms as number | null) ?? 0 }
  }

  const d = Math.max(0, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(depth)))
  const prevDeepest = (profile.gauntlet_deepest as number | null) ?? 0
  const deepest = Math.max(prevDeepest, d)
  // Lucky Locker boosts Fathoms win or lose, so it applies on a sink too.
  const earnedFathoms = Math.round(fathomsForDepth(d) * gauntletFathomsMult((profile.gauntlet_upgrades as string[] | null) ?? []))
  const newFathoms = ((profile.gauntlet_fathoms as number | null) ?? 0) + earnedFathoms

  await admin
    .from('profiles')
    .update({ gauntlet_run_open: false, gauntlet_deepest: deepest, gauntlet_fathoms: newFathoms })
    .eq('id', user.id)

  // Sinking still records your deepest — and still unlocks what you reached.
  await notifyDepthUnlocks(admin, user.id, prevDeepest, deepest)

  return { ok: true, deepest, earnedFathoms, newFathoms }
}

/** Mark the first-time explainer as seen so it doesn't auto-open again. */
export async function markGauntletIntroSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ has_seen_gauntlet_intro: true }).eq('id', user.id)
}
